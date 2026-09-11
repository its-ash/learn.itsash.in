# 23 — Async/Await: The Executor Model and the Real Cost of "Zero-Cost"

Async Rust is marketed as zero-cost. It's more precise to say: **the abstraction is zero-cost, the runtime is not, and the two get conflated constantly.** `async fn` genuinely compiles to a hand-optimizable state machine with no forced heap allocation or dynamic dispatch at the language level — but the moment you add `tokio::spawn`, a thread pool, work-stealing, and I/O-driven wakeups, you've adopted a full concurrent runtime with real scheduling costs, real memory overhead, and real failure modes that don't exist in synchronous code. A senior engineer needs both halves of this picture.

## Under-the-Hood Mechanics

### `async fn` desugars to an anonymous struct implementing `Future`

An `async fn` is **not** magic — the compiler transforms it into a state machine: a struct whose fields are exactly the local variables that are live across an `.await` point, plus a discriminant tracking which `.await` the function is currently suspended at. Calling the function doesn't run any of the body; it just constructs this struct. Each call to `.poll()` resumes execution from the last suspension point until it either returns `Poll::Ready(value)` or hits another `.await` and returns `Poll::Pending`.

::code-wrapper{language="rust"}
```rust
// This async fn:
async fn fetch_and_process(id: u32) -> String {
    let raw = fetch(id).await;      // suspension point 1
    let parsed = parse(&raw).await; // suspension point 2
    parsed
}

// desugars conceptually to something like:
enum FetchAndProcessState {
    Start { id: u32 },
    WaitingOnFetch { fetch_fut: FetchFuture },
    WaitingOnParse { raw: String, parse_fut: ParseFuture }, // `raw` must be KEPT ALIVE here
    Done,
}
// The struct's size is the size of its LARGEST live state, not the sum of all of them —
// but any data alive across multiple await points does count toward every state that needs it.
```
::

A buffer held live across an `.await` inflates the *entire* future's size, even in states where it's unused:

::code-wrapper{language="rust"}
```rust
async fn small() -> u32 {
    let x = 1;
    yield_now().await;
    x
}

async fn bloated() -> u32 {
    let buf = [0u8; 4096];   // 4KB local...
    yield_now().await;      // ...still alive here, so the whole future is >= 4KB
    buf[0] as u32
}

async fn fixed() -> u32 {
    let first_byte = { let buf = [0u8; 4096]; buf[0] }; // buf dropped before the await
    yield_now().await;
    first_byte as u32
}

// std::mem::size_of_val(&bloated()) is ~4KB+
// std::mem::size_of_val(&fixed())   is a few bytes
async fn yield_now() {}
```
::

### The executor model: polling, wakers, and who actually drives progress

A future only makes progress when polled; when it returns `Poll::Pending` it must register a `Waker` with whatever it's waiting on, or the executor never learns to poll it again:

::code-wrapper{language="rust"}
```rust
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};

struct BrokenFuture;
impl Future for BrokenFuture {
    type Output = ();
    fn poll(self: Pin<&mut Self>, cx: &mut Context) -> Poll<()> {
        // BUG: returns Pending but never registers cx.waker() anywhere —
        // this task will NEVER be polled again. It just hangs forever.
        Poll::Pending
    }
}

// The correct version: register the waker so something can re-poll us later.
struct WorksFuture { registered: bool }
impl Future for WorksFuture {
    type Output = ();
    fn poll(mut self: Pin<&mut Self>, cx: &mut Context) -> Poll<()> {
        if !self.registered {
            self.registered = true;
            let waker = cx.waker().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(10));
                waker.wake(); // re-queues this task with the executor
            });
            return Poll::Pending;
        }
        Poll::Ready(())
    }
}
```
::

### `Pin` exists because state machines can be self-referential

A self-borrowing state machine can't be safely moved after it's polled — `Pin` is the compiler's way of forbidding that move:

::code-wrapper{language="rust"}
```rust
use std::pin::Pin;
use std::marker::PhantomPinned;

// Conceptually, what a self-referential async state machine looks like:
struct SelfReferential {
    data: String,
    // In real generated code this is a raw pointer into `data`, not a real
    // reference — Rust's borrow checker can't express "a field borrows a
    // sibling field" directly, so the compiler uses raw pointers internally.
    pointer_into_data: *const u8,
    _pin: PhantomPinned, // opts the type OUT of Unpin
}

// Most everyday types are Unpin (pinning is a no-op for them):
fn takes_pinned_but_movable(x: Pin<&mut u32>) {
    let _r: &mut u32 = Pin::into_inner(x); // fine: u32 is Unpin
}

// A !Unpin type cannot be moved out of a Pin safely:
fn takes_self_referential(x: Pin<&mut SelfReferential>) {
    // x.get_mut() would refuse to compile without `unsafe` —
    // that's the whole point: the address is now fixed for its lifetime.
}
```
::

### `Send` bounds on spawned futures are structurally derived, field by field

`tokio::spawn` requires `F: Future + Send + 'static`; a future's `Send`-ness is inferred from every local held live across an `.await`, exactly like auto-trait derivation on ordinary structs:

::code-wrapper{language="rust"}
```rust
use std::rc::Rc;

async fn send_ok() -> u32 {
    let x = 5; // plain data, Send
    tokio::time::sleep(std::time::Duration::from_millis(1)).await;
    x
}

async fn not_send() -> u32 {
    let x = Rc::new(5); // Rc: non-atomic refcount, !Send
    tokio::time::sleep(std::time::Duration::from_millis(1)).await;
    *x // x is alive across the .await -> whole future is !Send
}

async fn send_ok_again() -> u32 {
    let x = Rc::new(5);
    let v = *x; // Rc dropped here, before the await
    tokio::time::sleep(std::time::Duration::from_millis(1)).await;
    v // future is Send again
}

#[tokio::main]
async fn main() {
    tokio::spawn(send_ok());       // compiles
    tokio::spawn(send_ok_again()); // compiles
    // tokio::spawn(not_send());   // ERROR: future is not `Send`
}
```
::

### Boxing a future: one heap allocation plus vtable indirection per poll

::code-wrapper{language="rust"}
```rust
use std::future::Future;
use std::pin::Pin;

// impl Future: concrete type, stack-allocatable, inlinable — but every
// branch must return the SAME concrete future type.
fn make_static(flag: bool) -> impl Future<Output = u32> {
    async move { if flag { 1 } else { 2 } } // single concrete type, ok
}

// Heterogeneous return types force boxing + dynamic dispatch:
fn make_boxed(flag: bool) -> Pin<Box<dyn Future<Output = u32>>> {
    if flag {
        Box::pin(async { 1 })       // one heap allocation
    } else {
        Box::pin(async { fetch_it().await }) // a different concrete type — needs erasure
    }
}

async fn fetch_it() -> u32 { 2 }
```
::

## Cost, Performance, and Trade-Offs

| Construct | Allocation | Dispatch | Compile-time cost | When it's worth it |
|---|---|---|---|---|
| `async fn` / `impl Future` | Zero (unless the body itself allocates) | Static, inlinable | Higher — the compiler must generate and optimize the state machine type | Default choice for any single-future-type return |
| `Box::pin(async { ... })` | One heap allocation | Dynamic (vtable call per poll) | Lower per-call-site (erases a complex type) | Heterogeneous collections of futures, multi-branch return types |
| `tokio::spawn` | Allocates a task (heap-boxed internally by the runtime) | Scheduled independently by the executor | N/A | Genuine concurrent progress needed — the task runs even if you don't `.await` the handle |
| `join!`/`try_join!` | Zero extra allocation — polls all futures from one stack frame | Static | Low | Running a small, fixed number of futures concurrently within one task |
| `FuturesUnordered` | One allocation per pushed future (each is often boxed) plus the container itself | Dynamic per future | Low | A dynamic, changing set of concurrently-running futures |
| `select!` | Zero extra allocation for the macro itself | Static (branches known at compile time) | Moderate (macro expansion) | Racing a fixed set of futures, taking the first to complete |
| `async-trait` crate | One `Box::pin` allocation per trait method call | Dynamic | Low | `dyn Trait` async APIs, pre-1.75 codebases |
| Native async trait methods (1.75+) | Zero for generic/static dispatch | Static | Higher | Generic async trait bounds where `dyn` isn't needed |

Thread-per-connection vs. async task-per-connection, in numbers:

::code-wrapper{language="rust"}
```rust
// One OS thread per connection: ~1-8MB stack reserved per thread (platform default).
fn handle_conn_threaded(conn: std::net::TcpStream) {
    std::thread::spawn(move || { /* blocking I/O here */ });
}
// 10,000 connections * 2MB stacks = ~20GB address space reserved.

// One async task per connection: state machine is hundreds of bytes to a
// few KB (bounded by the largest set of locals live across one .await).
async fn handle_conn_async(conn: tokio::net::TcpStream) {
    // tokio::spawn(async move { /* .await-based I/O here */ });
}
// 10,000 tasks * ~1KB = ~10MB. This 100-1000x density gap is why async
// exists at all for high-concurrency I/O-bound servers.
```
::

The cost paid for that density: a CPU-bound future that never yields starves every other task on its executor thread — cooperative scheduling has no preemption:

::code-wrapper{language="rust"}
```rust
async fn hogs_the_thread() {
    let mut x = 0u64;
    for i in 0..10_000_000_000u64 { x = x.wrapping_add(i); } // never .await's — never yields
    println!("{x}");
}
// Every other task scheduled on this same worker thread makes zero progress
// until hogs_the_thread() returns. No panic, no error — just silent starvation.
```
::

## Production Failure Modes & Anti-Patterns

### Anti-pattern: sequential `.await` mistaken for concurrency

::code-wrapper{language="rust"}
```rust
async fn fetch(id: u32) -> u32 {
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    id * 2
}

// BAD: a mid-level dev assumes "async" implies "concurrent"
#[tokio::main]
async fn main() {
    let start = std::time::Instant::now();
    let a = fetch(1).await;   // fully completes before the next line even starts
    let b = fetch(2).await;
    let c = fetch(3).await;
    println!("{a} {b} {c} in {:?}", start.elapsed());  // ~3 seconds, not ~1
}
```
::

The real-world shape of this bug — independent lookups sequenced by accident:

::code-wrapper{language="rust"}
```rust
// BAD: three independent fetches, tripled latency, nothing errors or panics
async fn load_profile(user_id: u32) -> (User, Permissions, Prefs) {
    let user = fetch_user(user_id).await;
    let perms = fetch_permissions(user_id).await;
    let prefs = fetch_preferences(user_id).await;
    (user, perms, prefs)
}
# async fn fetch_user(_: u32) -> User { User }
# async fn fetch_permissions(_: u32) -> Permissions { Permissions }
# async fn fetch_preferences(_: u32) -> Prefs { Prefs }
# struct User; struct Permissions; struct Prefs;
```
::

**The fix**: `join!` for fixed sets, `spawn` when tasks should outlive this function's scope.

::code-wrapper{language="rust"}
```rust
#[tokio::main]
async fn main() {
    let start = std::time::Instant::now();
    let (a, b, c) = tokio::join!(fetch(1), fetch(2), fetch(3));  // all three run concurrently
    println!("{a} {b} {c} in {:?}", start.elapsed());  // ~1 second
}
```
::

### Anti-pattern: blocking the executor thread with synchronous work

::code-wrapper{language="rust"}
```rust
async fn handle_request(payload: Vec<u8>) -> Vec<u8> {
    // BAD: a CPU-heavy synchronous hash/compress/parse call runs directly
    // on the async executor's worker thread — no .await, no yield point.
    expensive_cpu_bound_hash(&payload)   // blocks this thread for, say, 200ms
}

fn expensive_cpu_bound_hash(data: &[u8]) -> Vec<u8> {
    std::thread::sleep(std::time::Duration::from_millis(200)); // stand-in for real CPU work
    data.to_vec()
}
```
::

One un-yielding task occupies a worker thread for its whole duration — every other task scheduled on that same thread stalls, producing a confusing latency spike across unrelated requests. **The fix**: move blocking work to `spawn_blocking`'s dedicated pool.

::code-wrapper{language="rust"}
```rust
async fn handle_request(payload: Vec<u8>) -> Vec<u8> {
    tokio::task::spawn_blocking(move || expensive_cpu_bound_hash(&payload))
        .await
        .expect("blocking task panicked")
}
```
::

### Anti-pattern: holding a `std::sync::MutexGuard` across an `.await`, deadlocking or blocking the executor

::code-wrapper{language="rust"}
```rust
use std::sync::Mutex;

struct SharedState { count: Mutex<u64> }

impl SharedState {
    // BAD: the guard is alive across the .await below
    async fn increment_and_notify(&self, notifier: &tokio::sync::Notify) {
        let mut count = self.count.lock().unwrap();
        *count += 1;
        notifier.notified().await;   // guard is STILL HELD while this task is suspended
    }
}
```
::

If spawned across threads this fails to compile at all (`MutexGuard` is `!Send`); if not, the lock stays held for the entire suspension — every other task needing it queues up behind a lock doing no work.

**The fix**: scope the lock to end before the `.await`.

::code-wrapper{language="rust"}
```rust
impl SharedState {
    async fn increment_and_notify(&self, notifier: &tokio::sync::Notify) {
        {
            let mut count = self.count.lock().unwrap();
            *count += 1;
        } // lock released here, before the await
        notifier.notified().await;
    }
}
```
::

## Architectural Application

**A library's sync-vs-async API choice ripples into every consumer:**

::code-wrapper{language="rust"}
```rust
// A driver that only exposes async forces every consumer onto a runtime,
// even a simple CLI tool that just wants one query.
pub async fn query_async(sql: &str) -> Vec<Row> { /* ... */ vec![] }

// Serving both audiences: sync core, thin async wrapper on top.
pub fn query_sync(sql: &str) -> Vec<Row> { /* actual blocking implementation */ vec![] }
pub async fn query(sql: &str) -> Vec<Row> {
    let sql = sql.to_owned();
    tokio::task::spawn_blocking(move || query_sync(&sql)).await.unwrap()
}
# struct Row;
```
::

**`select!` drops unselected branches — that's how it implements timeouts and cancellation, not just racing:**

::code-wrapper{language="rust"}
```rust
use tokio::time::{timeout, Duration};

async fn with_timeout() -> Result<String, &'static str> {
    match timeout(Duration::from_secs(2), slow_fetch()).await {
        Ok(val) => Ok(val),
        Err(_) => Err("timed out"), // slow_fetch's future is dropped here
    }
}

// Any resource a future holds must clean up via Drop when cancelled mid-flight:
struct ReservedSlot;
impl Drop for ReservedSlot {
    fn drop(&mut self) { /* release the slot even if we never finished */ }
}

async fn slow_fetch() -> String {
    let _slot = ReservedSlot; // RAII guard: released automatically on cancel
    tokio::time::sleep(Duration::from_secs(5)).await;
    "data".into()
}
```
::

**Bounded channels turn a slow consumer into backpressure instead of an OOM:**

::code-wrapper{language="rust"}
```rust
use tokio::sync::mpsc;

// BAD: unbounded — a slow consumer lets the producer pile up unbounded memory
async fn unbounded_pipeline() {
    let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();
    tokio::spawn(async move { loop { tx.send(vec![0; 1024]).unwrap(); } }); // never throttled
}

// GOOD: bounded — send().await suspends the producer once the channel is full
async fn bounded_pipeline() {
    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(100); // capacity is a deliberate SLA
    tokio::spawn(async move {
        loop {
            if tx.send(vec![0; 1024]).await.is_err() { break; } // naturally throttled
        }
    });
}
```
::

**Runtime flavor is a real choice, not a default to accept blindly:**

::code-wrapper{language="rust"}
```rust
// Small CLI tool / sidecar: single-threaded, lower overhead, no Send needed
// across spawned futures since there's no cross-thread work-stealing.
#[tokio::main(flavor = "current_thread")]
async fn main() { /* ... */ }

// Service that must parallelize CPU alongside I/O concurrency:
#[tokio::main(flavor = "multi_thread", worker_threads = 8)]
async fn main() { /* ... */ }
```
::

## 💡 Tips & Tricks

- **Debug**: the `console-subscriber` crate plus `tokio-console` gives a live, top-like view of every spawned task's state (running, idle, blocked) — far faster than reasoning about hangs by staring at `select!` blocks.
- **Idiom**: default to `#[tokio::main(flavor = "current_thread")]` for single-purpose CLI tools and small services that don't need multi-core parallelism — it has noticeably lower overhead and simplifies reasoning about `!Send` types since there's no cross-thread scheduling.
- **Performance**: avoid `tokio::spawn` for very short-lived work (a few microseconds of computation) — the scheduling overhead can exceed the work itself; prefer `join!`/`FuturesUnordered` to run several futures concurrently within the current task instead of spawning a task per unit of work.
- **Debug**: a task that "hangs forever" with no panic is almost always either an unbounded channel filling up unboundedly on the *other* end, or a lock held across an `.await` point that another task needs — check both before assuming it's a runtime bug.
- **Idiom**: prefer `tokio::sync::Mutex` only when you truly must hold a lock across an `.await` point; if you can restructure to compute the value inside a small `{ }` block with a `std::sync::Mutex` and drop the guard before awaiting, the synchronous mutex is cheaper and avoids the "async mutex held across await" footguns entirely.
- **Debug**: `RUST_LOG=trace` with `tracing`/`tracing-subscriber` and span-based instrumentation (`#[tracing::instrument]` on async functions) preserves causality across `.await` points in a way plain `println!` timestamps cannot, since interleaved task output is otherwise very hard to attribute to the right logical flow.
- **Performance**: measure the size of your hot-path futures with `std::mem::size_of_val` on a constructed-but-not-awaited future — a surprisingly large future (megabytes, not kilobytes) usually means a large local buffer is being held live across an `.await` unnecessarily; scope it to end before the await point.

## ⚠️ Edge Cases & Gotchas

- **Async functions are lazy — they don't run until polled**: `let fut = async_fn();` executes zero lines of the function body; only `.await`ing (or spawning) it starts execution, which surprises anyone expecting call-like eagerness.
- **Forgetting `.await` compiles and produces a `Future`, not the value**: `let result = async_fn();` silently gives you an unused/unresolved future instead of the output — often caught by the `unused_must_use` lint on `#[must_use]` futures, but not always, especially when the future is passed elsewhere before being dropped unused.
- **`!Send` futures can't be `tokio::spawn`ed, and the error message points at the wrong line**: holding an `Rc`, a `RefCell` borrow, or a `MutexGuard` across an `.await` makes the whole state machine `!Send`, but the compiler error often highlights the `tokio::spawn` call site, not the actual offending local variable deep inside the function body.
- **`select!` drops unselected branches — including their side effects mid-flight**: a database write future that's "in progress" when a `select!` timeout branch wins is dropped, not cancelled cleanly by default — if that future doesn't implement careful `Drop`-based rollback, a partial write can be left in an inconsistent state.
- **Holding a `std::sync::MutexGuard` across `.await`** can deadlock the executor or fail to compile depending on whether the surrounding future is spawned across threads — the failure mode differs by context, making this bug inconsistent to reproduce.
- **`tokio::spawn` detaches a task that keeps running even if you drop its `JoinHandle`**: unlike `select!`'s explicit cancellation-on-drop, a spawned task is independent of its handle — dropping the handle does not stop the task, which surprises people expecting symmetric behavior with `thread::spawn`.
- **Mixing `tokio::fs`/`tokio::net` with a different runtime's I/O primitives silently produces separate reactor registrations**: they usually don't error outright, but the I/O simply never completes, since the wrong reactor never learns to poll the underlying OS resource — a subtle trap when combining crates that assume different runtimes.

## 🧠 Spot the Bug

What's wrong with this "concurrent" fetch, and how long does it actually take if each `fetch` takes 1 second?

::code-wrapper{language="rust"}
```rust
async fn fetch(id: u32) -> u32 {
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    id * 2
}

#[tokio::main]
async fn main() {
    let start = std::time::Instant::now();

    let a = fetch(1).await;
    let b = fetch(2).await;
    let c = fetch(3).await;

    println!("{a} {b} {c} in {:?}", start.elapsed());
}
```
::

<details>
<summary>Answer</summary>

This takes roughly **3 seconds**, not 1 — despite `async`/`.await` being the tool commonly reached for to get concurrency.

`.await` suspends the *current* task until that specific future completes, then resumes execution of the very next line — it does not start the next `fetch` call until the previous one has fully finished. Writing `fetch(1).await; fetch(2).await; fetch(3).await;` sequences three futures one after another, exactly as three blocking calls would, just without blocking the underlying OS thread while waiting. Async by itself does not make independent operations run concurrently — it only avoids blocking a thread while waiting on one. Achieving actual concurrency requires explicitly running multiple futures together, e.g., with `tokio::join!`:

::code-wrapper{language="rust"}
```rust
let (a, b, c) = tokio::join!(fetch(1), fetch(2), fetch(3));
```
::

This version takes roughly 1 second total, since all three `sleep`s run concurrently on the runtime rather than one after another.

**The lesson**: `.await` sequences one future after another — it does not automatically run independent futures concurrently; use `join!`, `try_join!`, `tokio::spawn`, or `FuturesUnordered` when you actually want operations to overlap in time.

</details>

## Summary

`async fn` compiles to a compiler-generated, zero-allocation state machine whose size is driven by the largest set of locals held live across any single `.await` point; the abstraction is genuinely zero-cost, but the executor (scheduling, wakers, thread pools) is a real runtime with real overhead. `Pin` exists solely to make self-referential state machines sound to move around before they're polled. `Send` bounds on spawned futures are a structural, compiler-derived fact — exactly like `Send`/`Sync` on ordinary types — propagated from whatever's held live across an `.await`. Architect around cooperative scheduling explicitly: never block an executor thread with synchronous work (use `spawn_blocking`), never hold a synchronous lock across an `.await`, and use bounded channels to propagate backpressure rather than letting an unbounded queue turn a slow consumer into an OOM.

Next: Macros — code that writes code, and what that costs the compiler.
