# 29 — Advanced Type System (Variance, HRTBs, Subtyping)

This chapter covers the parts of the type system that most Rust developers never need to write, but should understand to read errors and design libraries.

## Subtyping in Rust

Most languages have subtyping via inheritance (Cat : Animal). Rust's subtyping is **only** through **lifetimes**: a longer lifetime is a *subtype* of a shorter one.

`'static` is a subtype of `'a` for any `'a`: a `&'static str` can be used where `&'a str` is expected.

::code-wrapper{language="rust"}
```rust
fn takes_str<'a>(s: &'a str) { /* ... */ }
let s: &'static str = "hi";
takes_str(s);    // OK: 'static <: 'a
```
::

## Variance

Variance describes how subtyping of parameters affects subtyping of the constructed type:

- **Covariant** `T <: U` → `F<T> <: F<U>`
- **Contravariant** `T <: U` → `F<U> <: F<T>`
- **Invariant** no subtyping relationship
- **Bivariant** both directions (rare; only happens with unused params)

### Examples

| Type | Variance |
|---|---|
| `&'a T` | covariant in `'a` and `T` |
| `&'a mut T` | covariant in `'a`, **invariant** in `T` |
| `*const T` | covariant in `T` |
| `*mut T` | invariant in `T` |
| `fn(T) -> U` | contravariant in `T`, covariant in `U` |
| `Box<T>`, `Arc<T>`, `Vec<T>` | covariant in `T` |
| `Cell<T>`, `RefCell<T>`, `UnsafeCell<T>` | invariant in `T` |
| `&'a mut &'b T` | covariant in `'a`, invariant in `&'b T` (which is covariant in `'b` and `T`) |

### Why does variance matter?

If `&'a mut T` were covariant in `T`:
::code-wrapper{language="rust"}
```rust
let mut s = String::from("hi");
let r: &mut &'static str = &mut s;    // would-be covariance
let short = String::from("bye");
*r = &short;                          // writes &'short str into a &'static slot
println!("{}", s);                    // s dangling!
```
::
Invariance in `T` for `&mut T` is what prevents this. The compiler rejects the first assignment.

### Practical Implication

When you get a weird lifetime error, invariance is often the cause. The fix is usually to add an explicit lifetime tie or to introduce indirection (`Box<T>` makes some invariance problems tractable).

## Higher-Rank Trait Bounds (HRTBs)

::code-wrapper{language="rust"}
```rust
fn foo<F>(f: F) where F: for<'a> Fn(&'a str) { /* ... */ }
```
::

`for<'a>` means "for all possible lifetimes `'a`". The function `f` must accept any borrowed `&str`, not just one with a specific lifetime.

### Where HRTBs Appear

- Closures that take references without explicit lifetimes:
  ::code-wrapper{language="rust"}
```rust
  let f: impl for<'a> Fn(&'a str) = |s| println!("{s}");
  ```
- `Fn`/`FnMut`/`FnOnce` implicitly use HRTB on their arguments.

### Common Pattern

```
::rust
fn apply_any(f: impl for<'a> Fn(&'a [u8])) {
    let buf = [0u8; 16];
    f(&buf);
}
```

## Associated Types vs Generics

::code-wrapper{language="rust"}
```rust
// Associated type — impl picks:
trait Iterator { type Item; fn next(&mut self) -> Option<Self::Item>; }

// Generic — caller picks:
trait From<T> { fn from(value: T) -> Self; }
```
::

Use associated types when each impl has *one* natural type. Use generics when multiple impls can coexist (`From<&str>`, `From<String>`).

## `impl Trait` Internals

`fn f() -> impl Trait` returns *some* concrete type that implements `Trait`. The type is inferred per return path; if branches return different concrete types, you must box.

`fn f(x: impl Trait)` is sugar for `fn f<T: Trait>(x: T)`. The caller picks the type.

## `dyn Trait` Type Erasure

`dyn Trait` is a **dynamic** type — values are behind a pointer (`Box<dyn Trait>`, `&dyn Trait`, `Arc<dyn Trait>`, `Rc<dyn Trait>`, `Pin<Box<dyn Trait>>`).

The pointer is **wide** (fat): `(data_ptr, vtable_ptr)`.

## Object Safety (Recap)

A trait is object-safe iff:
- No `Self` in argument positions or return by value.
- No generics in methods.
- All methods have `where Self: Sized` or take `self` by reference.
- No associated constants without a default that depend on `Self`.
- `Send`/`Sync` as supertraits are OK; `Sized` as a supertrait disqualifies.

Workarounds for non-object-safe traits:
- Use a wrapper trait that doesn't return `Self`.
- Use generic dispatch instead of trait objects.
- Add `where Self: Sized` to static methods.

## Auto Traits

`Send`, `Sync`, `Unpin`, `Sized` are auto traits — the compiler auto-implements them based on constituent types.

::code-wrapper{language="rust"}
```rust
struct MyType(Rc<u8>);   // not Send, not Sync because Rc isn't
struct MyType2(Arc<u8>); // Send + Sync
```
::

You can opt out or opt in via `unsafe impl`/`impl !Send` (negative impls are unstable).

## `Sized` Trait

Most types are `Sized` (known size at compile time). Exceptions are `?Sized` types:
- `str`, `[T]`, `dyn Trait`, `*const ()` (in some contexts)

Generic parameters default to `Sized`; relax with `T: ?Sized`:

::code-wrapper{language="rust"}
```rust
fn first_byte(s: &str) -> u8 { /* str is !Sized but you can take &str */ }
fn foo<T: ?Sized>(x: &T) { /* works for unsized T */ }
```
::

## `PhantomData<T>` — Marker for Unused Type Params

::code-wrapper{language="rust"}
```rust
use std::marker::PhantomData;

struct Tagged<Tag, T> {
    data: T,
    _tag: PhantomData<Tag>,
}
```
::

`PhantomData` is zero-sized but tells the compiler about ownership/variance:
- `PhantomData<T>` makes your type behave like it owns a `T` for drop-checking and variance.
- `PhantomData<&'a T>` makes it covariant in `'a`.
- `PhantomData<*mut T>` makes it invariant and `!Send`/`!Sync`.
- `PhantomData<fn(T) -> ()>` makes it contravariant in `T` and `!Send`/`!Sync`.

Picking the right `PhantomData` variant is critical for unsafe collections.

## Newtype Pattern

::code-wrapper{language="rust"}
```rust
struct Meters(f64);
struct Miles(f64);

impl Meters { fn to_miles(self) -> Miles { Miles(self.0 / 1609.344) } }
```
::

- Zero-cost wrapper for type safety.
- No accidental mixing: `Meters(5.0) + Miles(1.0)` is a type error.
- Implement `From`/`Into`/`Display`/`Deref`/`Add` as needed.

## Type-Level Programming

With traits and associated types:

::code-wrapper{language="rust"}
```rust
trait Peano { type Next; }
struct Zero;
struct Succ<T>(T);

impl Peano for Zero { type Next = Succ<Zero>; }
impl<T: Peano> Peano for Succ<T> { type Next = Succ<Succ<T>>; }

type One = <Zero as Peano>::Next;
type Two = <One as Peano>::Next;
```
::

Practical for `typenum` (compile-time integers), dimension tracking (`uom`), and `frunk`'s HList.

## Const Generics (Deep)

::code-wrapper{language="rust"}
```rust
struct Arr<const N: usize> { data: [u8; N] }

impl<const N: usize> Arr<N> {
    fn len(&self) -> usize { N }
}

fn sum<const N: usize>(arr: &[i32; N]) -> i32 { arr.iter().sum() }
```
::

### Limits

- Only integer/bool/char const params on stable.
- Const expressions as params are unstable (`[T; N + 1]`).
- Min const generics only — full generics (e.g., `&'a str` const param) is unstable.

## `min_specialization` and Full Specialization

Specialization lets you provide a more specific impl overriding a general one:

::code-wrapper{language="rust"}
```rust
#![feature(min_specialization)]
trait Pick { fn pick(&self); }
impl<T> Pick for T { default fn pick(&self) { println!("default"); } }
impl Pick for String { fn pick(&self) { println!("string"); } }  // specialized
```
::

Unstable. Avoid in production. Workarounds: macros, separate traits, or `auto impl`-style delegation.

## Higher-Kinded Types (HKT)

Rust doesn't have HKTs (types parameterized over type constructors). Workarounds:
- `higher` crate
- Associated type families (unstable)
- Manual "Functor" traits via `PhantomData` (clunky)

The lack of HKTs limits abstracting over `Option`, `Vec`, `Result` uniformly. Most code doesn't need it.

## GATs (Generic Associated Types)

::code-wrapper{language="rust"}
```rust
trait LendingIterator {
    type Item<'a> where Self: 'a;
    fn next(&mut self) -> Option<Self::Item<'_>>;
}
```
::

Associated types that themselves have generic params (lifetimes/types). Stable since 1.65. Lets you express borrowing iterators, async traits, etc.

## Subtyping and `Cow`

::code-wrapper{language="rust"}
```rust
fn process<'a>(s: Cow<'a, str>) { /* ... */ }
process("static".into());      // Cow::Borrowed(&'static str)
process(String::from("x").into());   // Cow::Owned
```
::

`Cow<'a, B>` is variant in `'a` (covariant), so `Cow<'static, str>` is a subtype of `Cow<'a, str>`.

## Negative Trait Impls

::code-wrapper{language="rust"}
```rust
impl !Send for MyType {}
```
::

Unstable; you can opt out of auto traits today via `PhantomData<*const ()>` or `Rc<()>`.

## Common Pitfalls

- **Forgetting variance**: writing `PhantomData<T>` when you needed `PhantomData<fn() -> T>` (covariant vs invariant).
- **HRTB vs named lifetime**: `fn(&str)` is `for<'a> fn(&'a str)`; `fn<'a>(&'a str)` is a *specific* lifetime.
- **`dyn Trait + 'static`**: by default `dyn Trait` borrows for some lifetime; you usually want `Box<dyn Trait + 'static>`.
- **Object safety regression**: adding a generic method to a trait breaks all `dyn Trait` users.
- **Auto-trait inference**: a struct containing a `Rc` makes the whole struct `!Send + !Sync`.
- **`Sized` default**: `fn foo<T>()` requires `T: Sized`; unsized locals and parameters are unstable.
- **Trait objects and `Send`**: `Box<dyn Trait>` isn't `Send` unless you write `Box<dyn Trait + Send>`.

## Summary

Variance governs subtype relationships and is mostly about lifetimes (and `&mut`'s invariance in `T`). HRTBs express "for all lifetimes." Associated types vs generics: one natural type vs caller-supplied. Object safety limits trait objects. GATs (1.65+) enable borrowing in associated types. Const generics (1.51+) parameterize by integers/bools. PhantomData tunes variance and drop behavior. Newtype pattern is the idiomatic type-distinctness tool.

Next: Common design patterns and idiomatic Rust.