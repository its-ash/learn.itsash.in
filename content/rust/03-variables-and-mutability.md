# 03 — Variables & Mutability

## `let` and Immutability by Default

::code-wrapper{language="rust"}
```rust
let x = 5;          // immutable
let mut y = 5;      // mutable
y += 1;
// x = 6;           // ERROR: cannot assign twice to immutable variable
```
::

Rust variables are **immutable by default**. You must opt into mutation with `mut`. This isn't a philosophical stance — it lets the compiler reason about aliasing for ownership and concurrency guarantees.

## Shadowing

A new `let` with the same name *shadows* the previous binding. The old value still gets dropped at end of scope; shadowing creates a **new** binding (possibly a new type).

::code-wrapper{language="rust"}
```rust
let x = 5;
let x = x + 1;          // shadows, same type
let x = x.to_string();  // shadows with new type — totally fine

{
    let x = x * 2;      // shadows inside block
    println!("{x}");    // 12
}
println!("{x}");        // 6 (block shadow gone)
```
::

### Shadowing vs `mut`

| Feature | Shadowing | `mut` |
|---|---|---|
| New binding? | Yes | No |
| Can change type? | Yes | No |
| Requires initialization at declaration? | No (can be uninit then assign) | Yes (must assign) |

Use shadowing to transform a value into a different type/shape; use `mut` to evolve one value.

## Constants

::code-wrapper{language="rust"}
```rust
const MAX_POINTS: u32 = 100_000;
```
::

- `const` is evaluated at compile time (must be a constant expression).
- Always annotated with a type.
- Conventionally `SCREAMING_SNAKE_CASE`.
- Inlined everywhere; no fixed memory address.
- Can be declared in any scope, including module/global.
- Cannot shadow `mut` (they're always immutable); a `const` cannot be `mut`.

::code-wrapper{language="rust"}
```rust
const FACTOR: f64 = 1.5;
const fn double(x: i32) -> i32 { x * 2 }   // const fn: callable in const context
const ANSWER: i32 = double(21);
```
::

`const fn` allows a restricted subset of Rust at compile time (no heap, limited control flow historically; improving each release).

## Statics

::code-wrapper{language="rust"}
```rust
static LANGUAGE: &str = "Rust";
static mut COUNTER: u32 = 0;   // mutable static — unsafe to read/write
```
::

- Have a fixed memory address for the program's lifetime.
- `static mut` requires `unsafe` to access (no synchronization).
- Use atomics (`std::sync::atomic`) instead of `static mut` for counters.

## Type Inference

::code-wrapper{language="rust"}
```rust
let v = vec![1, 2, 3];      // Vec<i32>
let s = "hi";               // &str
let n = 1.0;                // f64 (default float)
let i = 1;                  // i32 (default integer)
let b = true;
```
::

When the type can't be inferred, add an annotation:

::code-wrapper{language="rust"}
```rust
let mut v: Vec<u8> = Vec::new();
let n: u64 = 42;
let parsed = "42".parse::<i32>().unwrap();
```
::

## `let` Patterns (Destructuring)

`let` is a pattern, not just a binding:

::code-wrapper{language="rust"}
```rust
let (a, b, c) = (1, 2, 3);
let [first, ..] = [1, 2, 3];        // slice pattern (limited on stable)
let (x, ..) = (1, 2, 3, 4);         // ignore rest
let Point { x, y } = point;          // struct destructuring
let (Ok(v) | Err(v)) = result.map(|n| n + 1).map_err(|e| 0); // or-pattern binding
```
::

## Mutable References vs Mutable Variables

::code-wrapper{language="rust"}
```rust
let mut v = vec![1, 2, 3];
v.push(4);

let r = &mut v;     // mutable reference (covered in Borrowing chapter)
r.push(5);
```
::

A `&mut T` requires the underlying binding to be `mut` too (you can't take a mutable borrow of an immutable binding).

## 💡 Tips & Tricks

- **Debug**: `dbg!(x)` is a better habit than `println!("{x:?}")` for quick checks — it prints the file/line and the expression's source text alongside the value, and it returns the value so you can inline it: `let y = dbg!(x + 1);`.
- **Idiom**: use shadowing to "narrow" a value through a validation/parse pipeline (`let s = s.trim(); let s: i32 = s.parse()?;`) instead of inventing a new name at each step — it keeps the variable name meaningful without `mut`.
- **Idiom**: reach for `std::sync::OnceLock` (stable since 1.70) for lazily-initialized global state instead of `static mut` or even the older `lazy_static!`/`once_cell` crates — it's in `std`, requires no `unsafe`, and is the modern default.
- **Debug**: a stray `let _ = expr;` is easy to miss in a diff — search for it specifically when a value seems to vanish without a compiler warning, since it deliberately silences "unused" lints while still running side effects.
- **Performance**: `const` values are inlined at every use site (no memory location, no runtime lookup), while `static` values have a single fixed address — prefer `const` for small, cheap values and `static` when you need a stable address (e.g., to hand a `&'static` reference across an FFI boundary).
- **Clippy**: `clippy::let_and_return` flags the `let x = expr; x` pattern as unnecessary — a good nudge that not every intermediate value needs its own `let` binding.

## ⚠️ Edge Cases & Gotchas

- **Unused `mut`**: `warning: variable does not need to be mutable`. Fix by removing `mut` or prefix `_mut` if intentional.
- **Unused variables**: `let _x = 5;` (leading underscore) suppresses the warning; `_` itself drops the value immediately.
- **`let _ = expr;`** evaluates `expr` then immediately drops the result — useful for side effects.
- **Capture in closures**: a closure capturing `x` immutably borrows; capturing mutably requires the variable to be `mut` and the closure itself `mut`.
- **Const generics / types in const**: types like `Vec`, `String`, `Box` can't live in `const` context (no heap at compile time), but they can in `static` only via `lazy_static`/`once_cell`/`std::sync::OnceLock`.
- **Shadowing footgun**: `let x = something_that_panic();` after `let x = 5;` — the first `x` is shadowed and dropped at scope end, but the panic happens during init of the new binding.
- **Initialization required**: Rust has no "uninitialized variable" UB like C. `let x: i32;` followed by a read before any assignment is a compile error.
- **`let` chains (unstable)**: `let Some(x) = opt && x > 0` — not stable; use explicit checks.
- **Tuples and unit**: `let () = some_fn();` pattern-matches that the function returns unit; useful for "I expect this to return nothing."
- **Shadowing can change type but not `mut`**: `let x = 5; let x = "hello";` works (different types), but `let mut x = 5; let x = "hello";` still needs explicit `let` to shadow, not reassignment.
- **Mutable binding ≠ mutable reference**: `let mut x = 5; x = 6;` works, but `let x = 5; x = 6;` is a compile error. A `&mut` reference lets you mutate if the underlying binding is `mut`.
- **Drop order with shadowing**: `let x = String::from("a"); let x = String::from("b");` — the first `String` is dropped at the end of its scope, not at the statement boundary.
- **Partial moves and shadowing**: `let s = String::from("hi"); let s = &s;` is a rebind (not move), `s` is now a reference. But `let (a, b) = (String::from("hi"), 5); let a = 10;` shadows `a` only, `b` still holds the `String`.
- **`static mut` requires `unsafe` to read/write**: Even reading a `static mut` is undefined behavior without synchronization; use `std::sync::atomic` for thread-safe access.

## 🧠 Spot the Bug

What does this print?

::code-wrapper{language="rust"}
```rust
struct Guard(i32);

impl Drop for Guard {
    fn drop(&mut self) {
        println!("dropping {}", self.0);
    }
}

fn main() {
    let g = Guard(1);
    let g = Guard(2);
    println!("end of main");
}
```
::

<details>
<summary>Answer</summary>

Output:
::code-wrapper{language="rust"}
```rust
end of main
dropping 2
dropping 1
```
::

Both `Guard` values are dropped — not just the second one — and they drop in **reverse order of creation**, not the order you might assume from "the second `g` replaced the first." Shadowing (`let g = Guard(2);` reusing the name `g`) does not drop or overwrite the first `Guard(1)`; it creates a brand-new, independent binding that happens to share a name, while the original `Guard(1)` binding still exists in the same scope under the hood, simply no longer nameable as `g`. Both bindings are live until the end of `main`'s scope, at which point normal drop order applies: locals drop in reverse declaration order, so the second `g` (`Guard(2)`) drops first, then the first `g` (`Guard(1)`).

**The lesson**: shadowing creates a new, separate binding — it does not drop the previous one early; the old value stays alive (just unreachable by name) until its original scope ends.

</details>

## `let`-else (1.65+)

Diverge if a pattern doesn't match:

::code-wrapper{language="rust"}
```rust
let Some(x) = maybe_value else {
    return; // or panic!, break, continue, etc.
};
// x is bound and in scope here
```
::

## Summary

Variables are immutable by default; use `mut` for evolution, shadowing for transformation, `const`/`static` for compile-time/global values. Next: the full type system.