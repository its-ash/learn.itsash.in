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

### Why does this exist?

A **diverging function** is a function that *never returns a value to the caller* — either because it loops forever (`loop {}`), because it aborts the process (`std::process::exit`), or because it panics (`panic!`). The return type `!` (pronounced "never") tells the compiler: **"control flow does not continue past this call."**

This matters because Rust's type system is strict about every branch of an `if`/`match` producing the same type. Without `!`, you'd be forced to write awkward placeholder values for unreachable branches. With `!`, the compiler knows that branch *can't* produce a value, so it lets the `!` stand in for *any* type — this is called **never-type coercion**.

### How it works

`!` coerces to any type. That means a `!`-returning function can be used anywhere a value of any type is expected, because the compiler knows that code path is dead.

::code-wrapper{language="rust"}
```rust
fn forever() -> ! {
    loop {}
}
fn die() -> ! {
    panic!("bye");
}
fn exit_with(code: i32) -> ! {
    std::process::exit(code);
}
```
::

The practical payoff is in `match` arms and `if`/`else` chains — you can mix a real value with a diverging call without a type mismatch:

::code-wrapper{language="rust"}
```rust
let v: i32 = match opt {
    Some(x) => x,
    None => die(),    // ! coerces to i32 — no mismatch
};
```

// Without !, you'd have to write something like `None => -1` or `None => panic!()` inline,
// which is either wrong (-1 is a valid i32!) or verbose when the panic logic is reused.
```
::

### When to use it

You reach for `-> !` whenever you write a helper that **always** terminates the program, panics, or loops. Common real-world cases:

- **A `fatal()` / `abort()` helper** that logs an error and exits — so callers can use it in `unwrap_or_else(|| fatal("..."))` without a type error.
- **A `TODO()` or `unimplemented!()`-style helper** during development, marking code paths you haven't finished yet.
- **An infinite event loop** in an embedded `main` or a server's accept loop.
- **`process::exit` wrappers** in CLI tools that need to set a specific exit code after printing a usage message.

::code-wrapper{language="rust"}
```rust
fn usage_and_exit() -> ! {
    eprintln!("Usage: prog <input>");
    std::process::exit(2);
}

fn main() {
    let input = std::env::args().nth(1).unwrap_or_else(|| usage_and_exit());
    // unwrap_or_else expects an fn() -> String, but usage_and_exit returns !,
    // so it coerces to String — no need to fabricate a dummy String.
}
```
::

### How `!` differs from `()`

- `()` means "returns, but the value is the unit value (nothing meaningful)." Control flow *continues*.
- `!` means "does not return at all." Control flow *stops*. There is no value, and the compiler can prove it.

This distinction is what enables never-type coercion: `()` can't coerce to `i32` (they're different types), but `!` can coerce to *anything*, because a value of type `!` can never actually exist at runtime.

## Default & Optional Parameters?

### Why doesn't Rust have them?

Rust deliberately omits function overloading and default parameters because they make call resolution ambiguous and complicate the type system (which overload is picked? which defaults apply?). Instead, Rust pushes you toward patterns that are explicit and unambiguous at each call site.

### What to use instead

- **Builder pattern** — for functions/structs with many optional fields. A `Builder` struct accumulates options via chained `.with_x()` calls, then `.build()` produces the final value. This is idiomatic for anything with more than ~3 optional knobs.
- **Multiple associated functions** — e.g., `Vec::new()` vs `Vec::with_capacity(n)` instead of `Vec::new(capacity = 0)`.
- **Traits for "overloading" semantics** — `From`/`Into` let you write `fn from<T: Into<Self>>(t: T)` and accept any convertible type, which covers most real "overloading" needs without ambiguity.
- **Option arguments** — `fn f(name: Option<&str>)` with `None` as the "default." Verbose but explicit.

## Generic Functions (preview)

### Why does this exist?

Suppose you want a `first` function that returns the first element of *any* slice — `&[i32]`, `&[String]`, `&[Vec<f64>]`. Without generics, you'd write a separate `first_i32`, `first_string`, `first_vec_f64`... — an explosion of near-identical code. **Generics** let you write the function *once*, parametrized over a type placeholder, and the compiler stamps out a specialized copy for each concrete type you call it with. This is called **monomorphization** — you get the performance of hand-written specialized code without the duplication.

The `<T>` declares a **type parameter**: a placeholder name that stands for "whatever type the caller uses here." It's a compile-time mechanism — at runtime there is no `T`, only the concrete types that were substituted in.

### What is `T`?

`T` is just a conventional name (short for "Type"). It's a **type variable** — you could name it anything (`<Element>`, `<Item>`), but `T`, `U`, `V` are idiomatic. The important thing is that `T` is a *placeholder*: when someone calls `first(&[1, 2, 3])`, the compiler replaces every `T` with `i32`; when they call `first(&["a", "b"])`, it replaces `T` with `&str`. Each substitution produces a *separate, fully-typed* function in the final binary.

### How to use it — the basic pattern

::code-wrapper{language="rust"}
```rust
// T is a placeholder. The caller decides what T is at each call site.
fn first<T>(v: &[T]) -> Option<&T> {
    v.first()   // returns None if empty, Some(&element) otherwise
}

// Two calls → two monomorphized copies in the binary:
let n = first(&[1, 2, 3]);        // here T = i32
let s = first(&["a", "b"]);        // here T = &str
```
::

### Why this alone isn't enough — trait bounds

A bare `<T>` says "any type at all." But if you want to *do* something with `T` — compare it, print it, copy it — the compiler needs proof that `T` supports that operation. That's what **trait bounds** are for: they constrain `T` to types that implement a given trait.

Without a bound, you can barely do anything with `T` — you can move it, return it, put it in a container, but you **cannot** compare it, add it, print it, or clone it, because the compiler doesn't know `T` has those capabilities.

::code-wrapper{language="rust"}
```rust
fn max<T: PartialOrd + Copy>(a: T, b: T) -> T {
    // PartialOrd  → allows `a > b`   (comparison)
    // Copy        → allows returning by value without moving
    if a > b { a } else { b }
}

max(3, 7);            // T = i32  — i32: PartialOrd + Copy ✓
max(3.0, 7.0);        // T = f64  — f64: PartialOrd + Copy ✓
// max(vec![1], vec![2]); // ERROR: Vec is not Copy — bound not satisfied
```
::

### Where vs how to specify bounds

Bounds can go inline (`<T: Trait>`) or in a `where` clause. The `where` form is cleaner when you have many bounds or complex types:

::code-wrapper{language="rust"}
```rust
// inline — fine for 1-2 bounds
fn max<T: PartialOrd + Copy>(a: T, b: T) -> T { if a > b { a } else { b } }

// where clause — clearer when things get hairy
fn merge<T, U>(a: T, b: U) -> Vec<U>
where
    T: IntoIterator<Item = U>,
    U: Clone,
{
    a.into_iter().chain(std::iter::once(b)).collect()
}
```
::

### When to use generics vs alternatives

- **Generics (static dispatch)**: best when you want zero-cost abstractions and the set of types is known/finite. The compiler inlines aggressively. Cost: binary size grows per type (monomorphization).
- **Trait objects `dyn Trait` (dynamic dispatch)**: best when you need a heterogeneous collection (`Vec<Box<dyn Display>>`) or want to reduce binary size. Cost: one vtable lookup per call, no inlining.
- **Just write concrete types**: if a function is only ever called with one type, generics add complexity for no benefit.

Generics are covered in full depth (associated types, higher-ranked lifetimes, `impl Trait` in returns, etc.) in the [Traits and Generics](16-traits-and-generics) chapter. This preview exists because functions are where you'll first encounter `<T>`.

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

### Why two kinds?

A **function pointer** (`fn(T) -> U`) is a bare pointer to compiled code — it captures *nothing*, is `Copy`, has a fixed size known at compile time, and is as cheap to pass around as an integer. A **closure** (`|a, b| a + b`) is an anonymous function that *can capture variables from its surrounding scope*; because the set of captured values varies, a closure's size is not known statically (it's stored as a fat pointer + captured env, hence `!Sized` in general).

You reach for a **function pointer** when you have a top-level `fn` and want to store/pass it without any captured state (e.g., a callback slot in a C FFI struct, a dispatch table `&[fn(&str) -> i32]`). You reach for a **closure** when you need to capture local variables (e.g., `let threshold = 5; nums.iter().filter(|&&x| x > threshold)`).

::code-wrapper{language="rust"}
```rust
fn add(a: i32, b: i32) -> i32 { a + b }
let fp: fn(i32, i32) -> i32 = add;       // function pointer, Copy, Sized
let cl = |a, b| a + b;                    // closure, captures env, !Sized
```
::

See the [Closures](17-closures) chapter for `Fn`/`FnMut`/`FnOnce` distinctions — they control *how* a closure may be called based on whether it borrows, mutably borrows, or consumes its captured environment.

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

## 💡 Tips & Tricks

- **Debug**: `#[track_caller]` on a helper function that panics (e.g., a custom `assert`-like wrapper) makes the reported panic location point at the *caller* instead of inside the helper — invaluable for library-style assertion functions.
- **Idiom**: express "no return value on this path" with `-> !` (diverging functions) for helpers like `fn fatal(msg: &str) -> !`, so the compiler lets you use them anywhere a value is expected (`let x = check(y).unwrap_or_else(|| fatal("bad"));`) without a type mismatch.
- **Performance**: `#[inline]` on small, frequently-called cross-crate functions can matter a lot (without it, the callee's body may not even be visible to the caller crate's optimizer), while `#[inline(always)]` on large functions often backfires by bloating the binary — reserve `always` for genuinely tiny hot-path helpers.
- **Idiom**: use pattern-matching function parameters (`fn f((a, b): (i32, i32))`) to destructure tuples/structs right at the call boundary instead of an extra line inside the body — keeps small helper functions (especially ones passed to `.map()`) terse.
- **Debug**: `cargo expand` on a `const fn` shows you whether it actually got evaluated at compile time or deferred to runtime — useful when you're relying on `const fn` purely for the performance benefit, not just the ability to use it in a `const` context.
- **Clippy**: `clippy::too_many_arguments` (default threshold: 7) is a nudge, not a hard rule, to bundle related parameters into a struct — genuinely useful for functions that keep growing an argument list over a project's lifetime.

## ⚠️ Edge Cases & Gotchas

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

## 🧠 Spot the Bug

What does this function return, and why is it probably not what the author intended?

::code-wrapper{language="rust"}
```rust
fn classify(n: i32) -> &'static str {
    if n < 0 {
        "negative";
    } else if n == 0 {
        "zero"
    } else {
        "positive"
    }
}
```
::

<details>
<summary>Answer</summary>

This fails to compile: `error[E0308]: if and else have incompatible types`, with the compiler pointing out that the first branch evaluates to `()`.

`"negative";` — with the trailing semicolon — is a **statement**, not an expression that produces a value; a semicolon after any expression turns it into a statement whose value is discarded, and the block it's the last line of evaluates to `()` as a result. The other two branches, `"zero"` and `"positive"`, have no trailing semicolon and correctly evaluate to `&'static str`. Because `if`/`else if`/`else` is a single expression whose overall type must be consistent across every branch, mismatched branch types (`()` vs `&'static str`) is a hard compile error — not a silent runtime bug, in this particular case, because the mismatch happens to be caught by the type checker. The insidious version of this same mistake is when the "empty" branch's type coincidentally matches (e.g., all branches secretly compute `()`, or the stray semicolon is on the *last* branch of a function whose return type is also `()`) — then the bug compiles clean and just silently returns nothing where a value was expected.

**The lesson**: a trailing semicolon converts an expression into a `()`-valued statement — in a multi-branch `if`/`else` used as an expression, one stray semicolon breaks the whole chain, and the compiler only catches it when the resulting type mismatch is visible.

</details>

## Summary

Functions are expressions, support patterns in parameters, can diverge, have no overloading, and methods live in `impl` blocks. Next: control flow.