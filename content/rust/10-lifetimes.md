# 10 — Lifetimes

Lifetimes are the borrow checker's way of tracking **how long a reference is valid**. They're a compile-time concept; there's zero runtime cost.

## The Core Idea

A reference's lifetime is the region of code where it's valid to use. The compiler *rejects* code where a reference could outlive the data it points to:

::code-wrapper{language="rust"}
```rust
let r;
{
    let x = 5;
    r = &x;
}                       // x dropped here
println!("{r}");        // ERROR: x does not live long enough
```
::

## Generic Lifetime Parameters

When a function returns a reference, the compiler needs to know its lifetime is tied to *some* input:

::code-wrapper{language="rust"}
```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}
```
::

`<'a>` declares a generic lifetime. `&'a str` means "a `str` reference valid for at least `'a`". The signature says: *the returned reference is valid for at least as long as the shorter of `x` and `y`.*

## Lifetime Elision Rules

To reduce boilerplate, the compiler applies three elision rules:

1. Each input reference gets its own lifetime: `fn f(x: &str, y: &str)` → `fn f<'a, 'b>(x: &'a str, y: &'b str)`.
2. If there's exactly one input lifetime, all output references get that lifetime: `fn f(x: &str) -> &str` → `fn f<'a>(x: &'a str) -> &'a str`.
3. If there are multiple inputs but one is `&self`/`&mut self`, all output lifetimes get `self`'s lifetime (method elision).

If after these rules the output lifetime is ambiguous, you must write it explicitly:

::code-wrapper{language="rust"}
```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str { ... }
```
::

## `'static`

The `'static` lifetime lasts the entire program. Examples:

- All string literals: `"hello"` has type `&'static str` (stored in the binary).
- `const` values that are references.
- Global statics.

::code-wrapper{language="rust"}
```rust
let s: &'static str = "I live forever";
```
::

Don't reach for `'static` to silence lifetime errors — it usually means a design problem. Common accidental `'static`: spawning threads that capture references requires `'static` (see Concurrency chapter).

## Structs Holding References

If a struct holds a reference, it must declare a lifetime:

::code-wrapper{language="rust"}
```rust
struct Excerpt<'a> { part: &'a str }

let novel = String::from("a long novel...");
let first = novel.split(' ').next().unwrap();
let e = Excerpt { part: first };
```
::

The struct can't outlive the data `part` borrows. The compiler enforces this.

## Lifetimes in Method Signatures

::code-wrapper{language="rust"}
```rust
impl<'a> Excerpt<'a> {
    fn announce(&self, msg: &str) -> &str {
        println!("{msg}{}", self.part);
        self.part            // elided: returns &'a str (rule 3)
    }
}
```
::

Output references are tied to `&self` automatically when there's no other choice.

## Multiple Lifetimes

::code-wrapper{language="rust"}
```rust
struct Parser<'src, 'arena> {
    source: &'src str,
    arena: &'arena Arena,
}
```
::

Two distinct lifetimes express "the source lives at least `'src`, the arena lives at least `'arena`". If the struct never mixes them (e.g., never puts `source` into `arena`), this is more flexible than collapsing to one lifetime.

## Lifetime Variance (advanced)

A `&'a T` is **covariant** in `'a`: you can use a longer-lived reference where a shorter-lived one is expected. `&'static str` fits anywhere `&'a str` is needed.

`&'a mut T` is covariant in `'a` but **invariant** in `T` (you can't shorten the borrow of `T` because mutation could write back). `Cell<T>`, `RefCell<T>`, `UnsafeCell<T>` are invariant.

`fn(&'a T)` is contravariant in `'a`. Most code doesn't think about variance, but it explains why some seemingly valid code compiles or doesn't.

## Higher-Rank Trait Bounds (HRTB)

::code-wrapper{language="rust"}
```rust
fn foo<F>(f: F) where F: for<'a> Fn(&'a str) { ... }
```
::

`for<'a>` means "for all possible lifetimes `'a`". Closures that work with any borrowed input need this. The `Fn` traits implicitly have HRTB on their arguments.

## Anonymous Lifetime `'_`

::code-wrapper{language="rust"}
```rust
fn longest(x: &str, y: &str) -> &'_ str { ... }
```
::

`'_` is "use elision here". Useful in `impl Trait` positions and to silence "elided lifetime in path" warnings. Don't sprinkle it; only when you specifically want elision.

## Lifetime in Enums

Same rules as structs:

::code-wrapper{language="rust"}
```rust
enum Node<'a> { Leaf(&'a str), Branch(&'a [Node<'a>]) }
```
::

## Static vs Stack Lifetimes

::code-wrapper{language="rust"}
```rust
fn returns_str() -> &'static str { "literal" }  // OK
fn returns_stack() -> &str {
    let local = String::from("hi");
    &local                  // ERROR: local does not live long enough
}
```
::

## Lifetime Bounds on Generics

::code-wrapper{language="rust"}
```rust
fn parse<T>(s: &str) -> T where T: FromStr, T::Err: Debug { ... }
fn longest_anon<'a, T: 'a>(x: &'a T) -> &'a T { x }
```
::

`T: 'a` means "T's owned references (if any) outlive `'a`". Often implicit, but needed when `T` itself contains references.

## Lifetime Extension via `Box::leak`

::code-wrapper{language="rust"}
```rust
let leaked: &'static mut [u8] = Box::leak(vec![1, 2, 3].into_boxed_slice());
```
::

`Box::leak` turns an owned heap value into a `'static` reference (memory is never reclaimed). Useful for long-lived configs but a memory leak by design.

## Common Lifetime Errors & Fixes

- **"borrowed value does not live long enough"**: the referent's scope is too short. Restructure so it outlives the borrow, or clone/own.
- **"lifetime may not live long enough"**: explicit lifetimes where the relationship is wrong; usually you need to express that the output is bound to *one specific* input.
- **"returns a value referencing data owned by the current function"**: returning a reference to a local. You must return an owned value (e.g., `String` not `&str`), or take the data as input.
- **Adding `'static` to silence**: usually wrong. Thread spawns require `'static` for closure captures; you need owned data there.

## Lifetime Patterns Cheat Sheet

| Function returns… | What you do |
|---|---|
| A reference clearly tied to one input | Rely on elision |
| A reference derived from multiple inputs | Pick the relevant input lifetime and annotate |
| A reference to newly created data | Return owned (`String`, `Vec<T>`), not `&` |
| A `'static` literal or constant | Write `&'static` explicitly |
| Data tied to a self-borrow | Use `self`-elision |

## Edge Cases

- **`'a` ties output to the *shortest* input**: `longest<'a>(x: &'a, y: &'a)` means the result lives at most as long as the *shorter* of `x` and `y`.
- **Closures capturing references**: the closure's lifetime must include the captured references' lifetimes.
- **Iterators holding references**: `std::slice::Iter<'a, T>` borrows the slice for `'a`.
- **`self`-referential structs** are famously hard in safe Rust; use `ouroboros` crate or restructure. The borrow checker can't express "this field borrows from that field of the same struct".
- **Async functions** desugar to state machines that hold references across `.await` points — lifetimes get complex; usually you must own the data instead of borrowing.

## Summary

Lifetimes are how Rust makes references safe. They:
- Annotate relationships between inputs and outputs.
- Get elided in common cases.
- Enforce that no reference outlives its referent.
- Sometimes need explicit annotation when multiple inputs feed an output.

Next: Structs and enums — the algebraic data types at the heart of Rust modeling.