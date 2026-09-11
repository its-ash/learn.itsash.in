# 34 — Production Pitfalls: Why Idiomatic Rust Isn't Style, It's Load-Bearing

Every pitfall in this chapter has the same shape: a pattern that compiles, passes review, passes tests, and fails in production under conditions the author didn't consider — usually concurrency, scale, or an edge case the type system permitted but the domain didn't. Treat these as production post-mortems, not a style checklist.

## Under-the-Hood Mechanics

### Why the borrow checker rejects "obviously fine" code

::code-wrapper{language="rust"}
```rust
let mut v = vec![1, 2, 3];
let first = &v[0];      // immutable borrow starts, live until last use of `first`
v.push(4);               // ERROR: cannot borrow `v` as mutable while borrowed as immutable
println!("{first}");
```
::

This isn't the compiler being overcautious — `push` can reallocate, moving every element to a new heap address, turning `first` into a dangling pointer the instant that happens. The borrow checker's rejection is the compile-time version of the exact bug ASan catches at runtime in C++.

::code-wrapper{language="rust"}
```rust
// Fix: end the borrow before the mutation.
let mut v = vec![1, 2, 3];
let first = v[0];  // copy the value out (i32 is Copy) instead of borrowing
v.push(4);          // now fine — no live borrow to conflict with
println!("{first}");
```
::

### Why `unwrap()` on `Mutex::lock()` is a poison-propagation decision, not a formality

::code-wrapper{language="rust"}
```rust
use std::sync::Mutex;
let m = Mutex::new(0);

let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
    let _guard = m.lock().unwrap();
    panic!("boom while holding the lock"); // poisons the mutex
}));

// Every OTHER thread's .lock().unwrap() now panics too, on an unrelated
// code path, with a PoisonError they have no context for:
match m.lock() {
    Ok(_) => println!("fine"),
    Err(poisoned) => println!("poisoned: {poisoned}"), // this branch runs
}
```
::

### Why `Deref`-based "inheritance" produces surprising method resolution

::code-wrapper{language="rust"}
```rust
// Resolution order: inherent methods -> in-scope trait methods -> auto-deref, repeat.
// This exists so &Box<T> can call T's methods without an explicit *box — it was
// never designed as inheritance, so using it that way has none of inheritance's guarantees.
struct Inner;
impl Inner { fn greet(&self) { println!("inner"); } }

struct Wrapper(Inner);
impl std::ops::Deref for Wrapper {
    type Target = Inner;
    fn deref(&self) -> &Inner { &self.0 }
}

let w = Wrapper(Inner);
w.greet(); // auto-derefs to Inner::greet — no virtual dispatch, no override, no `super`
```
::

## Cost, Performance, and Trade-Offs

| Pitfall | What it costs when "fixed" naively | Correct trade-off |
|---|---|---|
| `.clone()` to dodge a borrow error | Real allocation + copy cost, paid every call, silently accepted forever | Restructure the borrow (narrow scope, split the struct) — costs review time once, not runtime forever |
| `Arc<Mutex<T>>` for single-threaded state | Atomic refcounting + lock overhead for zero actual concurrency | `Rc<RefCell<T>>` — cheaper, and honestly signals "not shared across threads" to future readers |
| `tokio::sync::Mutex` to "fix" locking across `.await` | Async-aware lock overhead, and doesn't fix the underlying design smell | Scope the `std::sync::Mutex` guard to drop before the `.await`; only reach for the async mutex if the critical section itself must await |
| `unwrap_or_default()` to avoid handling `Err` | Silently substitutes a valid-looking default that's indistinguishable from a real result | `Result`/`Option` propagation via `?`, or an explicit sentinel type that can't be confused with real data |
| `Box<dyn Trait>` for a closed, known set of types | Vtable indirection blocks inlining in what's often actually a hot path | `enum` dispatch — exhaustiveness-checked, inlinable, no allocation |

The unifying cost pattern: **every pitfall in this chapter is a way of trading a compiler error today for a runtime failure later** — and the runtime failure is always more expensive, because it happens in production, under load, without a stack trace pointing at the actual design decision that caused it.

## Production Failure Modes & Anti-Patterns

### 1. `.clone()` as borrow-checker painkiller

::code-wrapper{language="rust"}
```rust
// Naive: clone to dodge every borrow conflict, without asking why one exists.
fn process_order(orders: &mut Vec<Order>, id: OrderId) {
    let order = orders.iter().find(|o| o.id == id).cloned(); // clones the whole Order
    if let Some(order) = order {
        orders.retain(|o| o.id != id);
        orders.push(apply_discount(order));
    }
}
```
::

Invisible at low volume. At scale — called per checkout, `Order` holding dozens of `LineItem`s — every call pays a full deep clone to sidestep a borrow the compiler was right to flag. Ten hot functions with this reflex pay ten unnecessary allocations per request, invisible until a profiler shows `Order::clone` eating double-digit percent of request time.

::code-wrapper{language="rust"}
```rust
// Production-grade: restructure to avoid needing two overlapping borrows.
fn process_order(orders: &mut Vec<Order>, id: OrderId) {
    if let Some(pos) = orders.iter().position(|o| o.id == id) {
        let order = orders.remove(pos); // moves out, no clone, no overlapping borrow
        orders.push(apply_discount(order));
    }
}
```
::

### 2. `unwrap()` on lock poisoning, cascading a single panic across a fleet of threads

::code-wrapper{language="rust"}
```rust
// Naive: every access path assumes the lock is never poisoned.
struct MetricsStore { counts: std::sync::Mutex<HashMap<String, u64>> }

impl MetricsStore {
    fn increment(&self, key: &str) {
        let mut g = self.counts.lock().unwrap(); // panics fleet-wide if ever poisoned
        *g.entry(key.to_string()).or_insert(0) += 1;
    }
}
```
::

**Why it fails at scale**: one panic inside *any* critical section holding this lock — an unrelated bug, an unwrap on unexpected input, a bounds error — poisons the mutex. Every other thread calling `increment()` afterward now also panics, immediately, on `.unwrap()`, with a `PoisonError` message that gives zero insight into the *original* panic. A single localized bug becomes a fleet-wide metrics outage, and the on-call engineer chases the wrong stack trace for the first hour. The production-grade version makes a deliberate poison policy instead of an accidental one:

::code-wrapper{language="rust"}
```rust
// Production-grade: explicit poison-recovery policy, documented as a decision.
fn increment(&self, key: &str) {
    // Metrics are best-effort; a poisoned lock still holds a valid (if
    // possibly-inconsistent) HashMap, and losing a counter update is
    // strictly preferable to cascading a panic across every caller.
    let mut g = self.counts.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    *g.entry(key.to_string()).or_insert(0) += 1;
}
```
::

### 3. Locking across `.await`, serializing unrelated concurrent work

::code-wrapper{language="rust"}
```rust
// Naive: holding a std Mutex guard across an await point.
async fn record_and_notify(state: &std::sync::Mutex<State>, event: Event) {
    let mut g = state.lock().unwrap();
    g.apply(event);
    notify_subscribers(&g).await; // guard held across the entire async call
}
```
::

**Why it fails at scale**: `std::sync::Mutex` isn't designed for async — holding its guard across an `.await` means every other task that touches `state` blocks (actually spins on a non-async-aware lock, which can starve the executor) for the full duration of `notify_subscribers`, an operation that might involve network I/O. Under load, this single lock becomes the effective concurrency ceiling for the entire subsystem, regardless of how many worker threads the runtime has. The fix isn't reflexively swapping to `tokio::sync::Mutex` — it's shrinking the critical section so nothing async happens inside it:

::code-wrapper{language="rust"}
```rust
// Production-grade: extract what's needed, release the lock, then await.
async fn record_and_notify(state: &std::sync::Mutex<State>, event: Event) {
    let snapshot = {
        let mut g = state.lock().unwrap();
        g.apply(event);
        g.snapshot() // cheap, owned copy of what notify_subscribers needs
    }; // guard dropped here
    notify_subscribers(&snapshot).await;
}
```
::

### 4. `Deref`-based fake inheritance, breaking invisibly on a stdlib update

::code-wrapper{language="rust"}
```rust
// Naive: "inherit" a wrapped type's methods via Deref instead of explicit delegation.
struct AuditedConnection(DbConnection);
impl std::ops::Deref for AuditedConnection {
    type Target = DbConnection;
    fn deref(&self) -> &DbConnection { &self.0 }
}
// AuditedConnection.execute(query) "just works" via deref coercion
```
::

**Why it fails at scale**: every method `DbConnection` has — including ones added to it later by an upstream crate update, with no corresponding audit-logging wrapper — becomes silently callable on `AuditedConnection` as if it were audited, because the compiler auto-derefs to find it. The entire premise of the wrapper (every DB call is audited) is violated the moment `DbConnection` gains a new method upstream, with **no compile error, no warning, nothing** — a caller writes `audited_conn.new_upstream_method()`, it compiles, it runs, it isn't audited, and nobody notices until a compliance review asks for logs that don't exist. The production-grade fix is explicit delegation — more boilerplate, but the API surface is exactly what you wrote, not whatever the wrapped type happens to expose this week:

::code-wrapper{language="rust"}
```rust
// Production-grade: explicit surface, nothing leaks through by accident.
struct AuditedConnection(DbConnection);
impl AuditedConnection {
    fn execute(&self, query: &Query) -> Result<Rows, DbError> {
        audit_log(query);
        self.0.execute(query)
    }
    // any new DbConnection method requires a deliberate addition here
}
```
::

## Architectural Application

Every pitfall above is a **local decision with a non-local blast radius** — that's the actual definition of a footgun in a systems language. The architectural discipline that prevents them at scale:

- **Lock scope is an API contract, not an implementation detail** — document (and enforce via code review) that critical sections never contain `.await` or any call that might block/allocate unpredictably. This belongs in a team's Rust style guide, not tribal knowledge.
- **Poison policy is a decision, made once, applied consistently** — pick "poisoned lock is a fatal error" (rare, only when the protected invariant truly can't tolerate any inconsistency) or "poisoned lock recovers via `into_inner()`" (the common case) per subsystem, and don't let it default silently to whichever the first engineer who wrote `.unwrap()` happened to pick.
- **`Deref` is reserved for actual smart-pointer semantics** — a team convention banning `Deref`/`DerefMut` outside of genuine pointer-like types (and enforcing it via a clippy lint or review checklist) prevents an entire category of invisible API-surface leakage.
- **`clone()` at a borrow conflict is a prompt to ask "why," not a fix** — treat `clippy::redundant_clone` findings as a design-review trigger in code review, not a lint to silence.

## 💡 Tips & Tricks

- **Debug**: when the borrow checker rejects something that "should" work, try ending the conflicting borrow earlier (a block `{ }`, reordering statements) before reaching for `.clone()`, which just papers over the design tension.
- **Clippy**: run `cargo clippy --all-targets -- -D warnings` in CI — `&Vec<T>` params, needless `.clone()`, reachable `unwrap()` all have dedicated lints that catch them automatically.
- **Debug**: `RUST_BACKTRACE=full cargo run` on an `unwrap()` panic gives the exact call chain — pair with `#[track_caller]` on your own `unwrap`-like helpers so panics report the *caller's* line, not the helper's.
- **Idiom**: `cargo expand` on a struct with `#[derive(Default)]` plus `..Default::default()` shows exactly which fields get defaulted — useful for auditing whether a "smelly" global default is hiding inside builder-style construction.
- **Performance**: benchmark before *and* after applying any fix in this chapter — some (`&[T]` over `&Vec<T>`) are zero-cost by construction; others (`Rc<RefCell<T>>` to `Arc<Mutex<T>>`) have a real, measurable cost worth confirming is actually needed.
- **Safety**: `cargo miri test` on anything touching raw pointers, `unsafe`, or manual memory management — "compiles and passes tests" and "is actually sound" diverge exactly in the categories this chapter covers.

## ⚠️ Edge Cases & Gotchas

- **`&Vec<T>` and `&[T]` are not interchangeable in both directions**: a function taking `&[T]` accepts `&Vec<T>` via coercion, but a function taking `&Vec<T>` rejects a plain array or slice — this is a real API restriction, not just style.
- **`unwrap_or_default()` can silently substitute a value indistinguishable from a real result**: `s.parse::<i32>().unwrap_or_default()` returns `0` both on parse failure *and* for the literal input `"0"` — downstream code checking `if result == 0` can't tell which happened.
- **Switching to `tokio::sync::Mutex` doesn't fix a design that shouldn't need async locking at all**: if the critical section doesn't actually need to await internally, the real fix is scoping a `std::sync::Mutex` guard to drop before the `.await` — swapping mutex types can mask the structural problem instead of solving it.
- **`as` casts fail differently depending on direction**: widening (`u8 as u32`) is always lossless; narrowing (`u32 as u8`) silently truncates — the same keyword means "always safe" one way and "silently dangerous" the other.
- **`match` exhaustiveness protects only actual `match` expressions**: adding an enum variant forces every `match` to update, but does nothing for `if`/`else` chains, lookup tables, or serialization mappings elsewhere that also needed updating.
- **Platform-independent trap — `HashMap` iteration order differs between runs of the *same* binary**: randomized per-process by design (a DoS mitigation), not platform-specific — code that happens to pass because order was "stable enough" in one CI environment can fail nondeterministically on a re-run of the identical binary.

## 🧠 Spot the Bug

What's wrong with this "safe" refactor of a division function, and why does it pass every existing test?

::code-wrapper{language="rust"}
```rust
fn safe_divide(a: i32, b: i32) -> i32 {
    if b == 0 {
        return 0;
    }
    a / b
}

fn apply_discount(price: i32, discount_count: i32, total_discounts: i32) -> i32 {
    let per_discount = safe_divide(price, total_discounts);
    price - (per_discount * discount_count)
}

fn main() {
    let final_price = apply_discount(100, 2, 0);
    println!("{final_price}");
}
```
::

<details>
<summary>Answer</summary>

Prints `100` — silently wrong, not a crash, easily mistaken for "the discount just didn't apply."

`safe_divide` "fixes" the divide-by-zero panic by returning `0`, but `0` is a legitimate result here, not a meaningless sentinel — `apply_discount` happily multiplies and subtracts it as if it were a real per-discount amount, with no way to distinguish "there were zero discounts, so I made something up" from "the actual per-unit discount computed to zero." Existing tests pass because none of them exercise `total_discounts == 0` with an assertion on the *correctness* of the fallback value, only on the absence of a panic. The original panic, unpleasant as it was, was at least loud and immediate; this refactor trades a crash for silent, incorrect business logic.

::code-wrapper{language="rust"}
```rust
fn safe_divide(a: i32, b: i32) -> Option<i32> {
    if b == 0 { None } else { Some(a / b) }
}

fn apply_discount(price: i32, discount_count: i32, total_discounts: i32) -> i32 {
    match safe_divide(price, total_discounts) {
        Some(per_discount) => price - (per_discount * discount_count),
        None => price,
    }
}
```
::

**The lesson**: replacing a panic with a made-up default value doesn't make error handling safe — it moves the bug from "loud and immediate" to "silent and semantically wrong," which is strictly worse in production.

</details>

## Summary

Every pitfall here is a compiler error deferred into a production incident: `.clone()` deferring a design question into a perf regression, `.unwrap()` on `lock()` deferring a poison policy into a cascading fleet-wide panic, locking across `.await` deferring a concurrency-architecture decision into a throughput ceiling, `Deref`-based fake inheritance deferring an API-surface decision into an invisible compliance gap. The fix in every case is the same shape: make the deferred decision explicit, once, at the design level — don't let the compiler's permissiveness stand in for an actual decision.

Next: Final exam-style questions and project ideas.
