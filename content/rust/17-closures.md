# 17 — Closures

A closure is not a language primitive with special runtime support — it's syntactic sugar for a compiler-generated `struct` plus a trait impl. Everything about `Fn`/`FnMut`/`FnOnce`, capture-by-reference vs capture-by-value, and why two "identical-looking" closures have different types all falls directly out of that one fact.

## Under-the-Hood Mechanics

### A closure is an anonymous struct with a generated trait impl

When you write `|x| x + n`, rustc generates something conceptually like:

::code-wrapper{language="rust"}
```rust
// What the compiler generates for `let add_n = |x| x + n;` (n: i32, captured by ref)
struct Closure_1<'a> { n: &'a i32 }
impl<'a> Fn<(i32,)> for Closure_1<'a> {
    type Output = i32;
    extern "rust-call" fn call(&self, (x,): (i32,)) -> i32 { x + *self.n }
}
```
::

The struct's fields are exactly the captured variables, in exactly the mode the closure body requires.

::code-wrapper{language="rust"}
```rust
let n = 5;
let s = String::from("hi");
println!("{}", std::mem::size_of_val(&(|| n)));           // 4  — captures i32 by ref-sized copy
println!("{}", std::mem::size_of_val(&(move || s)));       // 24 — owns a String (ptr+len+cap)
println!("{}", std::mem::size_of_val(&(|| 1)));             // 0  — captures nothing, ZST
```
::

Every closure also has a **unique, unnameable type** — even structurally identical ones:

::code-wrapper{language="rust"}
```rust
let a = || 1;
let b = || 1;
// a and b are DIFFERENT types that both happen to implement Fn() -> i32
fn takes_a<F: Fn() -> i32>(_: F) {}
takes_a(a);
takes_a(b); // fine — generic instantiated separately per type
// let arr = [a, b]; // ERROR: `a` and `b` have different, unrelated types
```
::

### The capture-mode hierarchy is inferred from usage, not declared

The compiler picks the **least restrictive** trait the body's behavior permits. `Fn: FnMut: FnOnce` is a supertrait chain — every `Fn` satisfies `FnMut`/`FnOnce`, never the reverse.

::code-wrapper{language="rust"}
```rust
let s = String::from("hi");
let read_closure = || println!("{s}");   // reads only -> Fn

let mut s2 = String::from("hi");
let push_closure = || s2.push('!');      // mutates capture -> FnMut (not Fn)

let s3 = String::from("hi");
let consume_closure = || drop(s3);       // moves capture out -> FnOnce (not Fn, not FnMut)
```
::

::code-wrapper{language="rust"}
```rust
fn wants_fn<F: Fn()>(f: F) { f(); }
fn wants_fnmut<F: FnMut()>(mut f: F) { f(); }
fn wants_fnonce<F: FnOnce()>(f: F) { f(); }

let s = String::from("hi");
let read = || println!("{s}");
wants_fn(&read);      // Fn satisfies all three
wants_fnmut(read);
// wants_fnonce also compiles — omitted only to reuse `read` above
```
::

### `move` changes capture mode, not closure trait

`move` forces by-value capture instead of the least-restrictive reference mode — it does **not** by itself change the `Fn`/`FnMut`/`FnOnce` classification.

::code-wrapper{language="rust"}
```rust
let n = 5;
let f = move || println!("{n}");   // n: i32 is Copy — `move` copies it, not moves it
// f is still Fn (read-only use), but now owns its own copy, independent of scope
```
::

::code-wrapper{language="rust"}
```rust
// WRONG: borrows a local that dies when the function returns
fn make_printer_broken() -> impl Fn() {
    let msg = String::from("hi");
    || println!("{msg}")   // ERROR: `msg` does not live long enough
}
```
::

::code-wrapper{language="rust"}
```rust
// RIGHT: `move` makes the closure own `msg`, so it can outlive this function
fn make_printer() -> impl Fn() {
    let msg = String::from("hi");
    move || println!("{msg}")
}
```
::

::code-wrapper{language="rust"}
```rust
// move is exactly what std::thread::spawn requires ('static + Send)
let data = vec![1, 2, 3];
std::thread::spawn(move || println!("{data:?}")).join().unwrap();
```
::

### Disjoint capture (edition 2021): fields, not whole structs

::code-wrapper{language="rust"}
```rust
struct Point { x: i32, y: i32 }
let mut p = Point { x: 0, y: 0 };

let print_x = || println!("{}", p.x);   // edition 2021: captures ONLY p.x
p.y += 1;                                // fine — p.y is disjoint, not borrowed
print_x();
```
::

Pre-2021 editions captured the *whole* `p`, so `p.y += 1` above would have been a borrow-checker error — the closure using `p.x` made `p` entirely unavailable elsewhere, even though the fields never overlap. This is a compile-time analysis change only; it doesn't alter runtime representation beyond capturing fewer/smaller fields.

## Cost, Performance, and Trade-Offs

::code-wrapper{language="rust"}
```rust
// Zero-cost per call, one compiled copy per concrete closure type (monomorphized):
fn apply(f: impl Fn(i32) -> i32, x: i32) -> i32 { f(x) }

// One shared compiled copy, but a heap box + vtable call per invocation:
fn apply_dyn(f: &dyn Fn(i32) -> i32, x: i32) -> i32 { f(x) }

fn main() {
    apply(|x| x + 1, 1);   // instantiation #1 of `apply`
    apply(|x| x * 2, 1);   // instantiation #2 of `apply` — separate compiled copy
    apply_dyn(&|x| x + 1, 1); // shares the ONE compiled `apply_dyn`, pays vtable dispatch
}
```
::

::code-wrapper{language="rust"}
```rust
// Plain fn pointers are strictly cheaper when no capture is needed:
fn double(x: i32) -> i32 { x * 2 }
static OP: fn(i32) -> i32 = double;   // Copy, nameable type, fits in a `static`, never allocates
fn apply_fn(f: fn(i32) -> i32, x: i32) -> i32 { f(x) }
```
::

::code-wrapper{language="rust"}
```rust
// RefCell trades a compile-time guarantee for a runtime panic risk, purely to
// satisfy an Fn-only API (e.g. an event-handler registry) that needs mutation:
use std::cell::RefCell;

let log = RefCell::new(Vec::new());
let record: &dyn Fn(&str) = &|msg: &str| log.borrow_mut().push(msg.to_string());
// every call is a runtime "already borrowed" panic risk a FnMut closure
// would instead have caught at compile time
```
::

## Production Failure Modes & Anti-Patterns

### Returning a closure that borrows a value about to go out of scope

::code-wrapper{language="rust"}
```rust
// WRONG: won't compile, but the *reason* is the actual lesson — this shape
// recurs constantly once functions get more indirection layers
fn make_adder(n: i32) -> impl Fn(i32) -> i32 {
    |x| x + n   // borrows n — but n is a local about to be dropped when make_adder returns
}
```
::

The compiler rejects this outright. The rule generalizes: any closure that **outlives its creating function** must own everything it touches.

::code-wrapper{language="rust"}
```rust
// RIGHT: `move` makes the closure own n, decoupling its lifetime from make_adder's scope
fn make_adder(n: i32) -> impl Fn(i32) -> i32 {
    move |x| x + n
}
```
::

### A `Fn`-bound API silently rejecting a closure that "should" work

::code-wrapper{language="rust"}
```rust
// WRONG: compiles right up until someone tries to call it twice, or passes
// it to a Fn-bound API, and gets a confusing trait-bound error far from this code
fn make_consumer(data: Vec<u8>) -> impl FnOnce() -> Vec<u8> {
    move || data   // moves `data` out — this closure can only ever be called once
}

fn call_twice<F: Fn() -> Vec<u8>>(f: F) {   // requires Fn — repeatable, non-consuming
    f();
    f();
}

fn broken() {
    let consumer = make_consumer(vec![1, 2, 3]);
    // call_twice(consumer);   // ERROR: `impl FnOnce` doesn't satisfy `F: Fn`
}
```
::

The error surfaces at `call_twice`, far from `make_consumer` where the real decision (move vs. clone) was made. Decide up front whether the closure must be callable once or repeatedly.

::code-wrapper{language="rust"}
```rust
// RIGHT: clone instead of moving out, if repeated calls are required
fn make_consumer(data: Vec<u8>) -> impl Fn() -> Vec<u8> {
    move || data.clone()   // Fn — repeatable, at the cost of a clone per call
}
```
::

### `move` on a `Copy` type masking an intended shared-mutation bug

::code-wrapper{language="rust"}
```rust
// WRONG: looks like the closure and the caller share `count`, but `move` + Copy
// silently gives the closure its OWN copy — mutations inside never propagate out
fn make_counter_wrong() -> impl FnMut() -> i32 {
    let mut count = 0;
    move || { count += 1; count }   // closure owns its own private `count`
}

fn broken() {
    let mut counter = make_counter_wrong();
    println!("{}", counter());   // 1
    println!("{}", counter());   // 2 — fine in THIS case, because count lives inside the closure
    // But: if the intent was for an OUTER `count` to track total calls
    // across multiple independently-created counters, that never happens —
    // each `make_counter_wrong()` call captures its own private zero.
}
```
::

The bug only surfaces when the design assumed shared state across multiple closure instances — each `make_counter_wrong()` call silently captures its own private zero. Make the sharing explicit instead:

::code-wrapper{language="rust"}
```rust
// RIGHT: Rc<Cell<_>> makes the sharing explicit and visible in the type
use std::{cell::Cell, rc::Rc};

fn make_shared_counter(shared: Rc<Cell<i32>>) -> impl Fn() -> i32 {
    move || { shared.set(shared.get() + 1); shared.get() }
}
```
::

## Architectural Application

::code-wrapper{language="rust"}
```rust
// Narrowest bound the implementation needs -> widest range of callable closures
fn on_complete(f: impl FnOnce()) { f(); }              // one-shot completion handler
fn on_tick(mut f: impl FnMut()) { f(); f(); }           // repeatable, mutating callback
fn on_event(f: impl Fn(&str)) { f("tick"); f("tock"); } // purely observational hook
// every `Fn` closure satisfies all three signatures — the reverse isn't true
```
::

::code-wrapper{language="rust"}
```rust
// Event/plugin systems: the legitimate home for Box<dyn Fn> — heterogeneous
// callbacks, no static-dispatch alternative exists
struct EventBus { handlers: Vec<Box<dyn Fn(&str)>> }
impl EventBus {
    fn fire(&self, event: &str) { for h in &self.handlers { h(event); } }
}
```
::

::code-wrapper{language="rust"}
```rust
// Thread boundaries force move + 'static + Send architecturally, not by convention
fn spawn_worker(data: Vec<i32>) -> std::thread::JoinHandle<i32> {
    std::thread::spawn(move || data.iter().sum())   // won't compile without `move`
}
```
::

::code-wrapper{language="rust"}
```rust
// Currying: pay setup cost (e.g. compiling a regex) once, reuse the closure
fn make_validator(min_len: usize) -> impl Fn(&str) -> bool {
    move |s: &str| s.len() >= min_len   // setup happens once per make_validator call
}
let is_valid = make_validator(8);
assert!(is_valid("password123"));
assert!(!is_valid("short"));
```
::

## 💡 Tips & Tricks

- **Debug**: when a closure's inferred type is confusing in an error, temporarily annotate it with an explicit `impl Fn(...) -> ...` at the call site — this often surfaces which specific capture is causing an `Fn`/`FnMut`/`FnOnce` mismatch far more clearly than the original error.
- **Idiom**: prefer plain `fn` pointers over closures for callback parameters that never need to capture state — `fn(i32) -> i32` is `Copy`, has a nameable type, and can live in a `static` without boxing.
- **Performance**: a generic `fn apply<F: Fn(i32) -> i32>(f: F, x: i32)` monomorphizes per closure type (zero-cost per call, code-size cost if called with many distinct closures); `fn apply(f: &dyn Fn(i32) -> i32, x: i32)` shares one vtable-dispatched path — choose based on whether you're optimizing for speed or binary size.
- **Idiom**: `RefCell` inside a `Fn` closure is the standard trick for mutating captured state while satisfying an API that demands `Fn` (not `FnMut`) — common in callback-registration APIs.
- **Debug**: `cargo expand` on a function returning `impl Fn(...)` won't reveal the closure's real unnameable type, but it will confirm exactly what's captured and whether `move` applied where expected.
- **Idiom**: for currying-style APIs (`|a| move |b| a + b`), each returned closure owns its own copy/move of outer captures — check with `std::mem::size_of_val` if you're concerned about accumulated state size through a chain of nested closures.

## ⚠️ Edge Cases & Gotchas

- **Capture lifetime**: a non-`move` closure borrowing a local cannot escape that local's scope — use `move` (often paired with a `'static` requirement) the moment the closure needs to outlive its creating scope.
- **`Fn`/`FnMut`/`FnOnce` are inferred from body behavior, not declared intent** — a closure that mutates a capture can never satisfy an `Fn` bound, no matter what signature you write around it.
- **Recursive closures aren't directly expressible** — a closure has no name to call itself by; use a `fn` or a `Box<dyn Fn>` passed to itself as a workaround.
- **A closure that also needs `&mut self`, called from a method that already holds `&mut self`, conflicts** — restructure to extract the needed value before invoking the closure.
- **`move` doesn't always move**: `move || println!("{x}")` for `x: i32` *copies* `x` (it's `Copy`); `move` only forces by-value capture, which is a copy for `Copy` types and a move for everything else.
- **`move ||` is required for `std::thread::spawn`** because the closure must be `'static + Send` — a non-`move` closure borrowing a local from the spawning thread cannot satisfy `'static`.
- **`Box<dyn FnOnce>` is callable** (special std support since Rust 1.35) — earlier confusion that "`FnOnce` can't be boxed and called" is outdated.

## 🧠 Spot the Bug

What's the compiler error, and why?

::code-wrapper{language="rust"}
```rust
fn make_counter() -> impl FnMut() -> i32 {
    let mut count = 0;
    || {
        count += 1;
        count
    }
}

fn make_broken_counter() -> impl Fn() -> i32 {
    let mut count = 0;
    || {
        count += 1;
        count
    }
}

fn main() {
    let mut counter = make_counter();
    println!("{}", counter());
    println!("{}", counter());
}
```
::

<details>
<summary>Answer</summary>

`make_broken_counter` fails to compile: `|| { count += 1; count }` mutates its capture, so it can only ever be `FnMut`/`FnOnce` — never `Fn`, which promises callers "no observable state change across calls." The signature `-> impl Fn() -> i32` makes that promise; the body breaks it, so the compiler rejects it at the `impl Fn` bound.

`make_counter`, declaring `-> impl FnMut() -> i32`, compiles fine — exactly what `FnMut` exists for.

**The lesson**: `Fn`/`FnMut`/`FnOnce` are inferred from what the closure body actually does to its captures, not from how you intend to call it — a closure that mutates a capture can never satisfy an `Fn` bound, regardless of the surrounding signature.

</details>

## Summary

A closure is a compiler-generated anonymous struct holding its captures, with a generated `Fn`/`FnMut`/`FnOnce` impl inferred from what the body does to those captures. `move` changes capture mode (by-value instead of by-reference) and is what decouples a closure's lifetime from its creating scope — required for anything crossing a thread boundary. Static-dispatch closures (`impl Fn`, generic bounds) are zero-cost per call but monomorphize; `Box<dyn Fn>` shares one implementation at the cost of a heap allocation and vtable call per invocation. Choose the narrowest closure trait bound an API actually needs, so the widest range of caller closures can satisfy it.

Next: Error handling — `Result`, `Option`, and `?`, and why "errors as values" has a real cost/design story of its own.
