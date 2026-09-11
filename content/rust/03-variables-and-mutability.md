# 03 — Variables & Mutability

Immutability-by-default is load-bearing: the borrow checker's aliasing model assumes "immutable" means "no one can change this out from under an existing reference." The rest of ownership is built on `let`/`mut`/`const`/`static`.

## Under-the-Hood Mechanics

::code-wrapper{language="rust"}
```rust
let x = 5;          // immutable
let mut y = 5;      // mutable
y += 1;
// x = 6;           // ERROR: cannot assign twice to immutable variable
```
::

`mut` is a property of the **binding**, not a distinct type:

::code-wrapper{language="rust"}
```rust
fn takes_mut(mut n: i32) -> i32 {   // parameter re-declared mut locally
    n += 1;
    n
}

fn main() {
    let a = 5;              // immutable binding
    let b = a;               // moved/copied into a NEW binding — b's mutability is independent
    let mut c = b;           // now mutable, same underlying value, different binding
    c += 1;
    println!("{}", takes_mut(c));
    // At the LLVM IR level there is no "mutable i32" vs "immutable i32" — this is 100%
    // a rustc front-end (borrow-checker) concept, erased before codegen.
}
```
::

The aliasing rule this underwrites — no other reference while a `&mut` is live:

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![1, 2, 3];
    let r = &mut v;
    r.push(4);
    // let r2 = &v;   // ERROR while r is live — untracked mutation via `v` would break this too
    println!("{r:?}");
}
```
::

### Shadowing creates a new binding, not a new value in the old slot

::code-wrapper{language="rust"}
```rust
let x = 5;
let x = x + 1;          // shadows, same type
let x = x.to_string();  // shadows with new type — totally fine
```
::

::code-wrapper{language="rust"}
```rust
struct Loud(&'static str);
impl Drop for Loud {
    fn drop(&mut self) { println!("dropping {}", self.0); }
}

fn main() {
    let s = Loud("a");
    let s = Loud("b");   // does NOT drop "a" early — both stay alive until scope end
    println!("using {}", s.0);
} // prints: dropping b, then dropping a (reverse declaration order)
```
::

### `const` is inlined; `static` has one address

::code-wrapper{language="rust"}
```rust
const MAX_POINTS: u32 = 100_000;   // inlined at every use site — no memory address
static LANGUAGE: &str = "Rust";     // one fixed address for the whole program

fn main() {
    println!("{MAX_POINTS} {LANGUAGE}");
    let p1: *const &str = &LANGUAGE;
    let p2: *const &str = &LANGUAGE;
    assert_eq!(p1, p2);   // same address every time — not true for MAX_POINTS (no address to take)
}
```
::

`static mut` requires `unsafe` for every access — no synchronization at all:

::code-wrapper{language="rust"}
```rust
static mut COUNTER: u32 = 0;

fn bump() {
    unsafe {
        COUNTER += 1;   // two threads racing here is immediate, textbook undefined behavior
    }
}
```
::

## Cost, Performance, and Trade-Offs

`const` vs `static`: code-size vs indirection.

::code-wrapper{language="rust"}
```rust
const SMALL: i32 = 42;
fn use_const() -> i32 { SMALL * 2 }   // "42" and the multiply are baked in — no memory load

static BIG_TABLE: [u8; 4096] = [0; 4096];
fn use_static() -> u8 { BIG_TABLE[0] } // one shared copy, loaded from memory — no 4096-byte duplication
```
::

Shadowing: zero runtime cost, real cognitive cost:

::code-wrapper{language="rust"}
```rust
fn parse_positive(input: &str) -> Result<i32, String> {
    let s = input.trim();               // &str
    let s: i32 = s.parse().map_err(|_| "not a number".to_string())?;  // now i32, SAME NAME
    // `git diff` on this line shows "a type changed under an unchanged name" — harder to review
    // than differently-named steps, even though it costs zero extra instructions.
    Ok(s)
}
```
::

`OnceLock` — lazy static init cost is a one-time atomic check, not free like `const`:

::code-wrapper{language="rust"}
```rust
use std::sync::OnceLock;

static CONFIG: OnceLock<String> = OnceLock::new();

fn config() -> &'static str {
    CONFIG.get_or_init(|| std::fs::read_to_string("config.toml").unwrap())
    // Every call after the first pays only an atomic load — negligible vs. unsafe static mut.
}
```
::

## Production Failure Modes & Anti-Patterns

**Anti-pattern: reaching for `static mut` for shared mutable state.**

::code-wrapper{language="rust"}
```rust
static mut REQUEST_COUNT: u32 = 0;

fn handle_request() {
    unsafe {
        REQUEST_COUNT += 1;   // UB the instant two threads call this concurrently
    }
}
```
::

::code-wrapper{language="rust"}
```rust
use std::sync::atomic::{AtomicU32, Ordering};

static REQUEST_COUNT: AtomicU32 = AtomicU32::new(0);

fn handle_request() {
    REQUEST_COUNT.fetch_add(1, Ordering::Relaxed);   // safe, no `unsafe` needed
}
```
::

For anything richer than a counter, use `OnceLock<Mutex<T>>` or an explicitly passed `Arc<Mutex<T>>` — global mutable state is the anti-pattern, not just the unsynchronized mechanism.

**Anti-pattern: silent type-widening shadow chains that hide a lossy conversion.**

::code-wrapper{language="rust"}
```rust
fn process(input: &str) -> u32 {
    let input = input.trim();
    let input = input.parse::<i64>().unwrap_or(0);
    let input = input as u32;   // silently truncates/wraps negative or oversized i64
    input
}
```
::

::code-wrapper{language="rust"}
```rust
fn process(input: &str) -> Result<u32, ProcessError> {
    let parsed: i64 = input.trim().parse().map_err(|_| ProcessError::InvalidInput)?;
    u32::try_from(parsed).map_err(|_| ProcessError::OutOfRange)
    // TryFrom turns the silent wraparound into an explicit Result the caller must handle.
}
```
::

## Architectural Application

`const` vs `static` as an API-design signal:

::code-wrapper{language="rust"}
```rust
pub const MAX_RETRIES: u32 = 3;              // config limit — inline everywhere, no indirection
pub static VERSION: &str = env!("CARGO_PKG_VERSION"); // singular, identity-bearing — one address
```
::

Global state via dependency injection, not hidden globals:

::code-wrapper{language="rust"}
```rust
use std::sync::Arc;

struct AppState { db: Arc<Database> }

fn main() {
    let db = Arc::new(Database::connect());
    let state = AppState { db: Arc::clone(&db) };   // constructed once, passed explicitly
    run_server(state);
    // grep-able: every function signature that touches state says so — a hidden `static` erases this.
}
```
::

Shadowing as the idiomatic replacement for `input2`/`input3` naming:

::code-wrapper{language="rust"}
```rust
fn validate(s: &str) -> Result<u32, String> {
    let s = s.trim();
    let n: u32 = s.parse().map_err(|_| "bad number")?;
    Ok(n)
}
```
::

`let-else` as the default for "validate or bail":

::code-wrapper{language="rust"}
```rust
fn first_word(s: &str) -> &str {
    let Some(word) = s.split_whitespace().next() else {
        return "";   // linear flow — no nested if-let-else
    };
    word
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="rust"}
```rust
fn compute() -> i32 { 41 }

fn main() {
    let y = dbg!(compute()) + 1;   // prints file, line, expression text, value — then returns ownership
    let _ = expensive_side_effect();  // silences "unused value" lint while still RUNNING it — grep for this
    println!("{y}");
}

fn expensive_side_effect() -> i32 { println!("ran"); 0 }
```
::

- **Idiom**: reach for `std::sync::OnceLock` instead of `static mut` or `lazy_static!`/`once_cell` — it's the modern, `unsafe`-free default.
- **Performance**: `const` for small hot-loop scalars; `static` when you need a stable `&'static` address (FFI, singleton identity).
- **Clippy**: `clippy::let_and_return` flags `let x = expr; x` as unnecessary.
- **Idiom**: `let-else` removes a full nesting level for the single most common validation shape.

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="rust"}
```rust
static mut FLAG: bool = false;

fn read_only() -> bool {
    unsafe { FLAG }   // even a READ is UB without synchronization — no "read-only race is fine" exception
}
```
::

::code-wrapper{language="rust"}
```rust
let mut x = 5;
let x = "hello";       // legal: `let` always creates a fresh binding, mut-ness of the old one is irrelevant
// x = "world";         // this WOULD be constrained by the new binding's lack of `mut`
```
::

::code-wrapper{language="rust"}
```rust
let (a, b) = (String::from("hi"), 5);
let a = 10;    // shadows only `a`; `b` is untouched and still owns its String
println!("{a} {b}");
```
::

- **Portability**: `const fn` capabilities (loops, mutable locals, trait bounds) vary by Rust version — code may compile on your toolchain and fail on an older declared MSRV.
- **Idiom**: a `const` cannot hold `String`/`Vec`/`Box` — no heap at compile time; use `static` + `OnceLock` instead.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
static mut COUNTER: u64 = 0;

fn record_request() {
    unsafe {
        let current = COUNTER;
        COUNTER = current + 1;
    }
}
```
::

Under low traffic the counter looks right; under load-test traffic, the final count is consistently *lower* than the actual request count. Why?

<details>
<summary>Answer</summary>

A classic read-modify-write race — two unsynchronized, separate operations:

::code-wrapper{language="rust"}
```rust
// Thread A                    Thread B
// let current = COUNTER;      (COUNTER == 41)
//                              let current = COUNTER;   // also reads 41!
// COUNTER = current + 1;      (writes 42)
//                              COUNTER = current + 1;   // ALSO writes 42 — one increment lost
```
::

`unsafe` suppresses compiler *checks*, not the *need* for synchronization — this is also undefined behavior under the Rust memory model, not merely a logic bug.

::code-wrapper{language="rust"}
```rust
use std::sync::atomic::{AtomicU64, Ordering};

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn record_request() {
    COUNTER.fetch_add(1, Ordering::Relaxed);   // hardware-guaranteed indivisible increment
}
```
::

**The lesson**: `static mut` incremented from multiple threads loses updates under real contention, regardless of how convincing a single-threaded manual test looked.

</details>

## Summary

`mut` is a compile-time-only property of a binding underwriting the borrow checker's aliasing guarantees; `const` inlines everywhere with no address, `static` has one fixed address for the program's life, and `static mut` is an unsynchronized footgun that atomics or `OnceLock`-guarded state should replace in any concurrent context. Shadowing creates genuinely new bindings at zero runtime cost, with the real cost paid in reviewability.

Next: Data Types — how these bindings' underlying scalar and compound types are actually laid out in memory, and where casting between them silently loses information.
