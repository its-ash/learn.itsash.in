# 05 — Functions

Functions are where expression-oriented design, no-overloading, and monomorphization all become visible at once. Know what a signature costs to call (static vs dynamic dispatch), what it costs to compile, and what it guarantees callers (divergence, panics-as-contract).

## Under-the-Hood Mechanics

### Expressions all the way down

::code-wrapper{language="rust"}
```rust
fn add(a: i32, b: i32) -> i32 {
    a + b            // last expression, no semicolon — the return value
}
```
::

::code-wrapper{language="rust"}
```rust
fn classify(n: i32) -> &'static str {
    if n < 0 { "negative" } else { "non-negative" }   // no `;` — this IS the return value
}

fn classify_wrong(n: i32) -> &'static str {
    if n < 0 { "negative" } else { "non-negative" };  // trailing `;` turns it into a STATEMENT, yields ()
    // COMPILE ERROR here: function must return &'static str, body now yields ()
}
```
::

### Monomorphization: one function, N compiled copies

::code-wrapper{language="rust"}
```rust
fn first<T>(v: &[T]) -> Option<&T> {
    v.first()
}

fn main() {
    let n = first(&[1, 2, 3]);        // T = i32 — compiles a SEPARATE first::<i32>
    let s = first(&["a", "b"]);        // T = &str — compiles a SEPARATE first::<&str>
    // Zero runtime dispatch cost for either — trait bounds add a compile-time proof, no vtable.
    println!("{n:?} {s:?}");
}
```
::

### `dyn Trait` takes the opposite trade: one copy, a vtable, an indirect call

::code-wrapper{language="rust"}
```rust
fn main() {
    let items: Vec<Box<dyn std::fmt::Display>> = vec![Box::new(1), Box::new("two")];
    for item in &items {
        println!("{item}");   // indirect call through the vtable, every iteration
    }
    // One compiled body regardless of how many types implement Display — trades runtime
    // dispatch cost for compile-time/binary-size savings and heterogeneous storage.
}
```
::

### The never type and diverging functions

::code-wrapper{language="rust"}
```rust
fn usage_and_exit() -> ! {
    eprintln!("Usage: prog <input>");
    std::process::exit(2);   // never returns — no Drop runs for the current stack either
}

fn main() {
    let arg: String = std::env::args().nth(1).unwrap_or_else(|| usage_and_exit());
    // Type-checks because `!` coerces to String — the diverging branch contributes nothing to unify.
    println!("{arg}");
}
```
::

### Function pointers vs closures

::code-wrapper{language="rust"}
```rust
fn add(a: i32, b: i32) -> i32 { a + b }

fn main() {
    let fp: fn(i32, i32) -> i32 = add;   // bare pointer to compiled code: Copy, Sized, no captures
    let x = 10;
    let cl = |a, b| a + b + x;            // anonymous type, captures `x` — larger, not Copy unless x is
    println!("{} {}", fp(1, 2), cl(1, 2));
}
```
::

## Cost, Performance, and Trade-Offs

::code-wrapper{language="rust"}
```rust
// A generic function called with 30 distinct types produces up to 30 near-duplicate machine-code bodies.
fn identity<T>(x: T) -> T { x }
// mergefunc CAN sometimes dedupe byte-identical instantiations post-optimization — not guaranteed.
```
::

::code-wrapper{language="rust"}
```rust
#[inline]                 // small, hot, cross-crate helper: real win — may be invisible to caller's
fn square(x: i32) -> i32 { x * x }   // optimizer otherwise, pre-LTO.

#[inline(always)]          // large function: routinely BACKFIRES — bloats binary, hurts icache locality
fn large_body(x: i32) -> i32 {
    // ... 200 lines ...
    x
}
```
::

::code-wrapper{language="rust"}
```rust
const fn square_const(x: i32) -> i32 { x * x }

const NINE: i32 = square_const(3);   // evaluated AT COMPILE TIME — zero runtime cost, zero code

fn main() {
    let runtime_val = 3;
    let result = square_const(runtime_val); // runtime-only input: falls back to ordinary codegen
    println!("{NINE} {result}");
    // cargo expand is the only reliable way to confirm which case actually happened.
}
```
::

## Production Failure Modes & Anti-Patterns

**Anti-pattern: an accidental type mismatch from a stray semicolon in a multi-branch function.**

::code-wrapper{language="rust"}
```rust
fn classify(n: i32) -> &'static str {
    if n < 0 {
        "negative";       // <-- stray semicolon: this branch now evaluates to ()
    } else if n == 0 {
        "zero"
    } else {
        "positive"
    }
    // COMPILE ERROR: () vs &'static str mismatch — caught here because the types genuinely conflict
}
```
::

::code-wrapper{language="rust"}
```rust
// Structural defense: prefer early return for divergent branches over trailing-expression matching.
fn classify_safe(n: i32) -> &'static str {
    if n < 0 { return "negative"; }
    if n == 0 { return "zero"; }
    "positive"
}
```
::

**Anti-pattern: reaching for `dyn Trait` reflexively in a hot path, without measuring.**

::code-wrapper{language="rust"}
```rust
fn process_all(handlers: &[Box<dyn Fn(&str) -> bool>], event: &str) {
    for h in handlers {
        h(event);   // indirect call through vtable, every iteration, hot path
    }
}
```
::

::code-wrapper{language="rust"}
```rust
enum Handler { Log, Metric, Alert }

impl Handler {
    fn call(&self, event: &str) -> bool {
        match self {
            Handler::Log => { println!("log: {event}"); true }
            Handler::Metric => { println!("metric: {event}"); true }
            Handler::Alert => { println!("alert: {event}"); true }
        }
        // Closed set, but compiles to a jump table the optimizer can inline — faster in a hot loop
        // than boxed trait objects. Use dyn Trait only when the type set is genuinely open (plugins).
    }
}
```
::

## Architectural Application

::code-wrapper{language="rust"}
```rust
use std::io::Read;

fn read_generic(mut r: impl Read) -> Vec<u8> {   // zero-cost, fully inlined dispatch per caller's type
    let mut buf = Vec::new();
    r.read_to_end(&mut buf).unwrap();
    buf
}

fn read_dyn(mut r: Box<dyn Read>) -> Vec<u8> {   // one compiled body, vtable indirection for EVERY caller
    let mut buf = Vec::new();
    r.read_to_end(&mut buf).unwrap();
    buf
}
// Default to generics at public boundaries; widen to dyn Trait only for genuine heterogeneity/open sets.
```
::

::code-wrapper{language="rust"}
```rust
fn fatal(msg: &str) -> ! {
    eprintln!("fatal: {msg}");
    std::process::exit(1);
    // Centralizes exit-code/logging behavior in one auditable place across the whole codebase.
}

fn main() {
    let config: String = std::fs::read_to_string("app.toml")
        .unwrap_or_else(|_| fatal("missing app.toml"));
    println!("{config}");
}
```
::

::code-wrapper{language="rust"}
```rust
struct RequestBuilder { timeout_ms: u64, header_count: u32 }

impl RequestBuilder {
    fn new() -> Self { Self { timeout_ms: 30_000, header_count: 0 } }
    fn with_timeout(mut self, ms: u64) -> Self { self.timeout_ms = ms; self }
    fn build(self) -> Self { self }
}
// No overloading in Rust — this is the intentional forcing function toward named constructors/builders,
// not a missing-feature workaround.
```
::

::code-wrapper{language="rust"}
```rust
// No guaranteed tail-call optimization — deep recursion on untrusted input is a stack-overflow DoS vector.
fn depth_iterative(mut n: u64) -> u64 {
    let mut stack = vec![n];
    let mut total = 0;
    while let Some(v) = stack.pop() {
        total += v;
        if v > 0 { stack.push(v - 1); }
    }
    total
    // Convert to an explicit Vec-backed work stack for any recursion whose depth isn't provably bounded.
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="rust"}
```rust
#[track_caller]
fn my_assert(cond: bool) {
    if !cond {
        panic!("assertion failed");   // panic location points at the CALLER, not this helper's internals
    }
}
```
::

- **Idiom**: express "never returns a value" with `-> !` so fatal helpers compose with `.unwrap_or_else()`.
- **Performance**: `#[inline]` for small cross-crate hot functions; `#[inline(always)]` only for genuinely tiny hot-path helpers.
- **Debug**: `cargo expand` shows whether a `const fn` call actually got evaluated at compile time.
- **Clippy**: `clippy::too_many_arguments` (default threshold 7) nudges toward bundling params into a struct.
- **Idiom**: destructure function parameters directly (`fn f((a, b): (i32, i32))`) for terse `.map()`/`.and_then()` closures.

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="rust"}
```rust
fn run() {
    let v = vec![1, 2, 3];
    v.iter().for_each(|x| {
        if *x == 2 {
            return;   // returns from the CLOSURE, not `run` — common surprise after refactoring a loop
        }
        println!("{x}");
    });
}
```
::

::code-wrapper{language="rust"}
```rust
fn add(a: i32, b: i32) -> i32 { a + b }
let fp: fn(i32, i32) -> i32 = add;      // Copy — fn pointers always are
let cl = move |a, b| a + b;              // Copy ONLY if every capture is Copy and captured by value

fn takes_fn_ptr(f: fn(i32) -> i32) {}
fn takes_impl_fn(f: impl Fn(i32) -> i32) {}
// fn pointers do NOT implement Fn/FnMut/FnOnce directly by inference — accept `impl Fn` to take both.
```
::

- **Performance**: recursive generic functions monomorphize per type — 50 types means 50 separate compiled recursive call chains.
- **Safety**: an early `return`/`?` skips everything after it in scope, including side-effecting setup code placed too late — order matters.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
fn validate(input: &str) -> bool {
    if input.is_empty() {
        return false;
    }
    if input.len() > 256 {
        return false;
    }
    input.chars().all(|c| c.is_ascii_alphanumeric());
}
```
::

Tests pass. In production, malformed inputs that should be rejected are silently accepted. What changed?

<details>
<summary>Answer</summary>

::code-wrapper{language="rust"}
```rust
input.chars().all(|c| c.is_ascii_alphanumeric());
//                                                ^ trailing semicolon — turns the return expression
//                                                  into a discarded statement, body now yields ()
```
::

With `bool` as the declared return type this is actually a **hard compile error** — the real danger is when a refactor loosens the return type enough that `()` unifies anyway, turning "it compiled" into false confidence.

**The lesson**: "it compiled" only proves internal type consistency, not that a trailing expression wasn't accidentally discarded — add explicit boolean-outcome tests, don't rely on the type checker catching every stray semicolon.

</details>

## Summary

Functions are expressions with monomorphization-driven zero-cost generics as the default and `dyn Trait` as the deliberate opt-in for dynamic dispatch; `-> !` is a real type-system feature enabling divergence to coerce cleanly; the absence of overloading pushes API design toward builders and named constructors rather than ambiguous call-site resolution.

Next: Control Flow — how `if`/`match`/`loop` as expressions interact with divergence, exhaustiveness, and the `?` operator's error-propagation machinery.
