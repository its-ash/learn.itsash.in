# 13 — Pattern Matching (Deep Dive)

Pattern matching is not "a nicer switch statement" — it's a structural matching algorithm with real codegen consequences, a formally checked exhaustiveness proof, and a binding-mode system that decides move/copy/borrow for you.

## Under-the-Hood Mechanics

### `match` lowers to a decision tree, not a sequence of `if`s

Arms are not tested in source order like an `if`/`else if` chain — the compiler builds a decision tree that shares tests across arms. Overlapping patterns (`Some(0)` before `Some(_)`) still preserve source order, since overlap makes order semantically meaningful.

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn classify(x: Option<i32>) -> &'static str {
    match x {
        Some(0) => "zero",
        Some(n) if n > 0 => "positive",
        Some(_) => "negative",
        None => "absent",
    }
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Dense, guard-free enum match: compiles toward a jump table — O(1) dispatch.
enum Opcode { Add, Sub, Mul, Div }

fn eval(op: Opcode, a: i32, b: i32) -> i32 {
    match op {
        Opcode::Add => a + b,
        Opcode::Sub => a - b,
        Opcode::Mul => a * b,
        Opcode::Div => a / b, // single top-level branch on the discriminant, not 4 checks
    }
}
```
::

### Binding modes: move, copy, or borrow — decided for you

Since edition 2018's "default binding modes," matching a `&T`/`&mut T` against a pattern without a leading `&` shifts the binding mode automatically.

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn main() {
    let opt: Option<String> = Some(String::from("hi"));

    // Matching &opt (a reference) against Some(x) (no leading &):
    // compiler shifts to "ref" binding mode automatically — x: &String.
    if let Some(x) = &opt {
        println!("{x}"); // x is &String; opt is NOT moved
    }
    println!("{opt:?}"); // still valid

    // Matching an owned Option<String> BY VALUE moves the payload:
    if let Some(x) = opt {
        println!("{x}"); // x is String, owned — opt is moved
    }
    // println!("{opt:?}"); // ERROR: opt was consumed above
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn main() {
    let mut opt = Some(10);

    // &mut scrutinee -> x: &mut i32
    if let Some(x) = &mut opt {
        *x += 1;
    }
    assert_eq!(opt, Some(11));

    // Copy type + shared reference -> x is a COPY, not a reference,
    // if the pattern itself doesn't bind by-ref explicitly.
    let n = 5i32;
    let r = &n;
    match r {
        &val => assert_eq!(val, 5), // val: i32, copied out
    }
}
```
::

### Exhaustiveness checking is blind to guard logic

The checker only understands pattern *shape*. A guard is an opaque `bool`-returning function to it — this is why any guarded arm forces a fallback arm.

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn classify(n: i32) -> &'static str {
    match n {
        x if x > 0 => "positive",
        x if x < 0 => "negative",
        0 => "zero",
        // Remove this arm: E0004 non-exhaustive patterns, even though
        // (x>0) | (x<0) | (x==0) covers all of i32 mathematically.
    }
}
```
::

## Cost, Performance, and Trade-Offs

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Dense enum, no guards -> single indexed jump, O(1) regardless of variant count.
enum State { Idle, Running, Paused, Stopped }

fn tick(s: State) -> State {
    match s {
        State::Idle => State::Running,
        State::Running => State::Paused,
        State::Paused => State::Running,
        State::Stopped => State::Stopped,
    }
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Guards defeat exhaustiveness AND often defeat decision-tree sharing.
fn tier_guarded(n: u32) -> &'static str {
    match n {
        n if n <= 10 => "free",       // guard forces a wildcard arm below
        n if n <= 100 => "standard",
        _ => "pro",
    }
}

// Prefer structural range patterns — exhaustively verifiable, better optimized.
fn tier_structural(n: u32) -> &'static str {
    match n {
        0..=10 => "free",
        11..=100 => "standard",
        101.. => "pro",
    }
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Binding-mode mistakes don't error — they silently change runtime behavior.
struct Big { data: Vec<u8> }

fn touch_wrong(b: Big) -> usize {
    match b {
        Big { data } => data.len(), // moved and dropped `b` just to read a length
    }
}

fn touch_right(b: &Big) -> usize {
    match b {
        Big { data } => data.len(), // data: &Vec<u8>, zero-cost
    }
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// matches! vs. hand-written if/else — identical codegen, different bug surface.
fn is_even(n: i32) -> bool {
    matches!(n, n if n % 2 == 0) // can't be left with a stale/inverted else branch
}

fn is_even_manual(n: i32) -> bool {
    if n % 2 == 0 { true } else { false } // clippy::match_like_matches_macro
}
```
::

## Production Failure Modes & Anti-Patterns

### Anti-pattern: guard-covered "exhaustive" match with a silent gap

::code-wrapper{language="rust" filename="main.rs"}
```rust
// naive: looks exhaustive, only correct because the bounds were hand-verified
fn classify_naive(rpm: u32) -> &'static str {
    match rpm {
        n if n <= 10 => "free",
        n if n <= 100 => "standard",
        n if n <= 1000 => "pro",
        n => "enterprise",
    }
}
```
::

A later refactor changing `n <= 1000` to `n < 1000` opens a silent gap at `n == 1000` — no compile error, since the catch-all still absorbs it.

::code-wrapper{language="rust" filename="main.rs"}
```rust
// right: compiler-verified exhaustive, gaps become compile errors
fn classify_right(rpm: u32) -> &'static str {
    match rpm {
        0..=10 => "free",
        11..=100 => "standard",
        101..=1000 => "pro",
        1001.. => "enterprise",
    }
}
```
::

### Anti-pattern: matching by value, silently moving data out of a struct

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Request {
    id: u64,
    payload: Vec<u8>,
}

// naive: wants to log size without consuming req, matches by value instead
fn handle_naive(req: Request) -> Request {
    match req {
        Request { payload, .. } => {
            println!("payload size: {}", payload.len()); // moves payload out
        }
    }
    // return req; // ERROR: req.payload moved
    req
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// right: match &req instead of req — free, no clone, no move
fn handle_right(req: Request) -> Request {
    match &req {
        Request { payload, .. } => {
            println!("payload size: {}", payload.len()); // payload: &Vec<u8>
        }
    }
    req // never moved
}
```
::

### Anti-pattern: or-pattern binding masking different error-handling paths

::code-wrapper{language="rust" filename="main.rs"}
```rust
enum FetchError {
    Timeout(u64),      // ms elapsed
    RateLimited(u64),  // retry-after seconds
}

// naive: collapses two units into one binding — wrong unit for RateLimited!
fn handle_naive(err: FetchError) {
    let (FetchError::Timeout(n) | FetchError::RateLimited(n)) = err;
    std::thread::sleep(std::time::Duration::from_millis(n));
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// right: separate arms preserve the distinct semantics
fn handle_right(err: FetchError) {
    match err {
        FetchError::Timeout(elapsed_ms) => {
            eprintln!("timed out after {elapsed_ms}ms, retrying immediately");
        }
        FetchError::RateLimited(retry_after_secs) => {
            std::thread::sleep(std::time::Duration::from_secs(retry_after_secs));
        }
    }
}
```
::

## Architectural Application

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Enums + match make exhaustiveness a refactor-safety tool: adding a variant
// forces a compile error at every call site that needs updating.
enum ConnState { Connecting, Connected, Draining, Closed }

fn on_event(s: ConnState) -> ConnState {
    match s {
        ConnState::Connecting => ConnState::Connected,
        ConnState::Connected => ConnState::Draining,
        ConnState::Draining => ConnState::Closed,
        ConnState::Closed => ConnState::Closed,
        // add a new variant above -> every match like this fails to compile
        // until handled. Trait-object polymorphism gives no such guarantee.
    }
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// let-else flattens validation pipelines instead of nesting if-let/else.
struct RawRequest { auth: Option<String>, body: Option<Vec<u8>> }

fn handle(req: RawRequest) -> Result<(), &'static str> {
    let Some(auth) = req.auth else { return Err("missing auth") };
    let Some(body) = req.body else { return Err("missing body") };
    if auth.is_empty() { return Err("empty auth") };
    println!("processing {} bytes", body.len());
    Ok(())
}
```
::

## 💡 Tips & Tricks

- **Idiom**:
::code-wrapper{language="rust" filename="main.rs"}
```rust
fn first_word(s: &str) -> &str {
    let Some(w) = s.split_whitespace().next() else { return "" };
    w // happy path stays flat, no nested if-let
}
```
::
- **Debug**: `dbg!(&value)` before a `match` never moves `value` — it takes a reference:
::code-wrapper{language="rust" filename="main.rs"}
```rust
let x = Some(3);
match dbg!(&x) {
    Some(n) => println!("{n}"),
    None => {}
}
```
::
- **Clippy**: `clippy::single_match` flags a one-armed `match` that should be `if let`:
::code-wrapper{language="rust" filename="main.rs"}
```rust
// flagged
match Some(3) { Some(n) => println!("{n}"), _ => {} }
// preferred
if let Some(n) = Some(3) { println!("{n}"); }
```
::
- **Performance**: verify guard-heavy matches in generated assembly if they're in a hot loop — guards can defeat jump-table codegen.
- **Idiom**: `@` bindings avoid re-deriving a value inside a guard:
::code-wrapper{language="rust" filename="main.rs"}
```rust
match 4 {
    n @ 1..=9 if n % 2 == 0 => println!("small even: {n}"),
    _ => {}
}
```
::
- **Debug**: an error like `expected i32, found &i32` inside an arm tells you exactly what auto-ref inserted — check whether the scrutinee was `&value` or `value`.

## ⚠️ Edge Cases & Gotchas

- **Guards with side effects can double-execute**:
::code-wrapper{language="rust" filename="main.rs"}
```rust
fn check(n: i32) -> bool { println!("checking {n}"); n > 0 }

fn demo(n: i32) {
    match n {
        x if check(x) => println!("positive"),
        x if check(x) => println!("non-positive"), // check() may run twice for n<=0
        _ => {}
    }
}
```
::
- **Or-patterns require identical bound types**:
::code-wrapper{language="rust" filename="main.rs"}
```rust
fn f(r: Result<i32, i32>) {
    let (Ok(n) | Err(n)) = r; // OK: both i32
}
// Result<i32, String>: `Ok(n) | Err(n)` is a compile error — i32 != String
```
::
- **`..` can only appear once per pattern level**:
::code-wrapper{language="rust" filename="main.rs"}
```rust
let arr = [1, 2, 3, 4, 5];
// let [a, .., b, .., c] = arr; // ERROR: `..` used twice
let [a, .., c] = arr; // OK
```
::
- **Float range patterns don't compile**:
::code-wrapper{language="rust" filename="main.rs"}
```rust
let score = 1.8_f64;
match score {
    // 1.5..=2.5 => println!("mid"), // ERROR: floating-point range pattern
    _ if (1.5..=2.5).contains(&score) => println!("mid"), // use a guard instead
    _ => {}
}
```
::
- **Refutability errors point at the binding form, not the type**:
::code-wrapper{language="rust" filename="main.rs"}
```rust
let opt = Some(5);
// let Some(x) = opt; // ERROR: refutable pattern in local binding
let Some(x) = opt else { return }; // fix: let-else
```
::
- **`&mut` vs `&` in a diff silently changes mutation into a no-op**:
::code-wrapper{language="rust" filename="main.rs"}
```rust
let mut opt = Some(5);
if let Some(x) = &mut opt { *x += 1; }   // mutates opt
if let Some(x) = &opt { let _x = x + 1; } // x: &i32 copied out, opt untouched — compiles fine
```
::
- **A `u8` match that "looks" exhaustive doesn't generalize to `i32`**:
::code-wrapper{language="rust" filename="main.rs"}
```rust
fn f_u8(b: u8) -> &'static str {
    match b { 0..=254 => "low", 255 => "max" } // exhaustive: u8 has no other values
}
// Copy-pasted onto i32 needs a wildcard arm — far more values exist outside 0..=255.
fn f_i32(n: i32) -> &'static str {
    match n { 0..=254 => "low", 255 => "max", _ => "other" }
}
```
::

## 🧠 Spot the Bug

Will this compile? If so, what does `classify(5)` print?

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn classify(n: i32) -> &'static str {
    match n {
        x if x > 0 => "positive",
        x if x < 0 => "negative",
        0 => "zero",
    }
}

fn main() {
    println!("{}", classify(5));
}
```
::

<details>
<summary>Answer</summary>

It does **not** compile: `error[E0004]: non-exhaustive patterns`.

Guards are opaque booleans to the exhaustiveness checker — it can't prove `x > 0`, `x < 0`, and the literal `0` together cover all of `i32`. Fix with an explicit catch-all or, better, structural ranges:

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn classify_fixed(n: i32) -> &'static str {
    match n {
        1.. => "positive",
        ..0 => "negative",
        0 => "zero",
    }
}
```
::

**The lesson**: guards are invisible to exhaustiveness checking — always end guarded matches with a catch-all, or replace guards with structural patterns so the compiler verifies completeness for you.

</details>

## Summary

::code-wrapper{language="rust" filename="main.rs"}
```rust
// match -> decision tree / jump table, not sequential ifs
match Some(1) { Some(0) => {}, Some(_) => {}, None => {} }

// binding modes: match &value to borrow, match value to move
if let Some(x) = &Some(1) { let _: &i32 = x; }

// structural patterns are exhaustively checked; guards are not
match 5u32 { 0..=10 => {}, 11.. => {} }

// or-pattern binding only for genuinely fungible alternatives
let (Ok(n) | Err(n)): Result<i32, i32> = Ok(1);
```
::

- `match` compiles to a decision tree/jump table — arm order rarely affects performance unless patterns overlap.
- Binding modes decide move/copy/borrow silently — `match &value` is the usual free fix.
- Exhaustiveness is structural, blind to guards — prefer ranges/or-patterns over guards.
- Or-pattern binding only for truly interchangeable variants — same type, different meaning is a bug magnet.

Next: Collections — `Vec`, `String`, `HashMap`, and the allocation/amortization trade-offs behind Rust's standard containers.
