# 05 — Functions

## Basics

::code-wrapper{language="rust"}
```rust
fn add(a: i32, b: i32) -> i32 {
    a + b            // last expression — no semicolon — is the return value
}

fn no_return() {
    println!("returns ()");
}
```
::

- The last expression (without `;`) is the return value.
- A trailing `;` makes it a statement returning `()`.
- `return x;` is for early returns; the implicit last-expression form is idiomatic for the common case.

## Statements vs Expressions

::code-wrapper{language="rust"}
```rust
let x = (let y = 5;);   // ERROR: statements don't produce values
let y = {
    let z = 5;
    z + 1                // expression — block evaluates to 6
};
```
::

Blocks `{ ... }` are expressions. `if`, `match`, `loop` are also expressions.

## Parameters & Patterns

Parameters can be patterns:

::code-wrapper{language="rust"}
```rust
fn print_pair((a, b): (i32, i32)) { println!("{a} {b}"); }
fn first((a, _): (i32, i32)) -> i32 { a }
```
::

## Diverging Functions (`-> !`)

::code-wrapper{language="rust"}
```rust
fn forever() -> ! {
    loop {}
}
fn die() -> ! {
    panic!("bye");
}
```
::

`!` coerces to any type, allowing it anywhere a value is expected:

::code-wrapper{language="rust"}
```rust
let v: i32 = match opt {
    Some(x) => x,
    None => die(),    // ! coerces to i32
};
```
::

## Default & Optional Parameters?

Rust has **no function overloading or default parameters**. Use:
- Builder pattern
- Multiple methods (`new`, `with_capacity`)
- Traits for "overloading" semantics (e.g., `From`/`Into`)

## Generic Functions (preview)

::code-wrapper{language="rust"}
```rust
fn first<T>(v: &[T]) -> Option<&T> {
    v.first()
}

fn max<T: PartialOrd + Copy>(a: T, b: T) -> T {
    if a > b { a } else { b }
}
```
::

## `impl` Blocks (Methods)

::code-wrapper{language="rust"}
```rust
struct Rect { w: u32, h: u32 }

impl Rect {
    fn area(&self) -> u32 { self.w * self.h }          // method
    fn new(w: u32, h: u32) -> Self { Rect { w, h } }    // associated fn
    fn set(&mut self, w: u32) { self.w = w; }           // mut borrow
}
```
::

- `&self` = `self: &Self` (immutable borrow).
- `&mut self` = mutable borrow.
- `self` (by value) = consumes `self`.
- Associated functions (no `self`) called as `Rect::new(...)` (like static methods).

## `Self` and `self` Keywords

`Self` is the type the `impl` is for. `self` is the receiver shorthand. `Self` in a `trait` body refers to the implementing type.

## Variadic Functions

Only `extern "C"` FFI functions can be C-style variadic:

::code-wrapper{language="rust"}
```rust
extern "C" {
    fn printf(fmt: *const u8, ...) -> i32;
}
```
::

Idiomatic variadic-ness comes from macros (`println!`, `vec!`) or slices (`fn sum(nums: &[i32])`).

## Function Pointers vs Closures

::code-wrapper{language="rust"}
```rust
fn add(a: i32, b: i32) -> i32 { a + b }
let fp: fn(i32, i32) -> i32 = add;       // function pointer, Copy, Sized
let cl = |a, b| a + b;                    // closure, captures env, !Sized
```
::

See the Closures chapter for `Fn`/`FnMut`/`FnOnce` distinctions.

## Recursion

Rust doesn't guarantee tail-call optimization. Deep recursion can overflow the stack. For deep/iterative algorithms, convert to an explicit loop with a stack.

::code-wrapper{language="rust"}
```rust
fn fact(n: u64) -> u64 {
    if n == 0 { 1 } else { n * fact(n - 1) }
}
```
::

## `const fn`

Compile-time-callable functions with a restricted feature set:

::code-wrapper{language="rust"}
```rust
const fn square(x: i32) -> i32 { x * x }
const N: i32 = square(5);   // evaluated at compile time
```
::

Each release expands what's allowed in `const fn` (loops, mutable locals, etc.).

## Calling Conventions & ABI

::code-wrapper{language="rust"}
```rust
extern "C" fn c_fn(x: i32) -> i32 { x + 1 }
extern "Rust" fn rust_fn(x: i32) -> i32 { x + 1 }   // default
extern "C" { fn imported(x: i32) -> i32; }
```
::

Useful for FFI and callbacks passed to C libraries.

## Edge Cases

- **`return` in a closure**: `return` inside a closure returns from the *closure*, not the enclosing function (unlike some languages). Use labeled loops/breaks or `?` carefully.
- **Block-as-expression footgun**: forgetting the trailing `;` returns the value; adding it silently changes the return type to `()`. The compiler catches this.
- **`fn` types are `Copy`**: you can copy function pointers freely; closures are not necessarily `Copy`.
- **Lifetime elision in fn signatures**: `fn first(s: &str) -> &str` has elided lifetimes; the compiler infers one input lifetime → output lifetime.
- **Recursion + generics**: monomorphized per type — code bloat risk.
- **`#[inline]`**: a hint; `#[inline(always)]` can bloat code; usually trust the compiler.
- **Implicit `&T` in parameter patterns**: `fn print_pair((a, b): (i32, i32))` moves the tuple, but `fn print_pair((a, b): &(i32, i32))` borrows. If the parameter is a reference, the pattern items become references too.
- **Early returns and cleanup**: if you return before a value is bound, that value is never allocated. Use this to avoid setup costs for early exits.
- **Function pointers vs closures in traits**: `fn(T) -> U` doesn't implement `Fn`, `FnMut`, `FnOnce` (different trait hierarchy); use `impl Fn` to accept both.
- **Generic monomorphization explosion**: `fn sort<T: Ord>(v: &mut [T])` instantiated for 50 different types = 50 code copies. Sometimes use trait objects to reduce binary size.
- **Self-consuming functions**: `fn consume(self) -> T` is often misunderstood — this consumes the receiver and is idiomatic for builder chains (e.g., `Builder::new().with_x(5).build()`).
- **Attribute positions in fn**: `#[must_use]` on a function warns if the return is ignored; useful for error-prone computations.
- **Default parameters via function overloading**: Rust has no function overloading; use builder pattern or separate functions: `new()`, `with_capacity()`, `from()`, etc.
- **Const vs const fn**: `const X: i32 = 5;` is a value; `const fn f() -> i32 { 5 }` is a function. Both are evaluated at compile time but have different purposes.

## Summary

Functions are expressions, support patterns in parameters, can diverge, have no overloading, and methods live in `impl` blocks. Next: control flow.