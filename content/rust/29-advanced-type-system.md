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
::
## Associated Types vs Generics

### Why associated types exist

An **associated type** (`type Item;` in a trait) is chosen by the *implementing type* — there's exactly one `Item` for each impl. A **generic type parameter** is chosen by the *caller* — the same type can be instantiated many ways. You reach for associated types when each impl has **one natural related type**: an `Iterator` over `T` has `Item = T` — there's no sense in the caller picking a different `Item` for the same iterator. You reach for generics when **multiple impls coexist**: `From<&str> for String` and `From<u8> for String` are two valid impls the caller selects between. The tradeoff: associated types are more ergonomic (no extra type parameter cluttering call sites) and enable `dyn Trait` (the impl owns the type); generics are more flexible (caller can pick) but bloat signatures and break object-safety.

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

### What existential types are and when to use `impl Trait`

`fn f() -> impl Trait` returns a **concrete but hidden type** — an *existential* type ("some type that implements Trait, but I won't tell you which"). The caller knows it implements `Trait` but can't name the exact type. This is zero-cost (static dispatch, monomorphized, the compiler knows the real type internally). Reach for `impl Trait` returns when you want to hide a complex internal type (an iterator chain, an async block) without exposing it in the signature. The limitation: every `return` must produce the *same* concrete type, so multi-branch returns with different types need boxing.

`fn f(x: impl Trait)` in argument position is sugar for `fn f<T: Trait>(x: T)` — the caller picks the type, statically dispatched. Reach for it for ergonomics (one less `<T>`); it's equivalent to the generic form.

`fn f() -> impl Trait` returns *some* concrete type that implements `Trait`. The type is inferred per return path; if branches return different concrete types, you must box.

`fn f(x: impl Trait)` is sugar for `fn f<T: Trait>(x: T)`. The caller picks the type.

## `dyn Trait` Type Erasure

### How erasure works and when to reach for `dyn`

`dyn Trait` is **type erasure**: the compiler generates a **vtable** (a static table of function pointers, one per method) for each trait impl, and the `dyn Trait` value is a **fat pointer** carrying `(data_ptr, vtable_ptr)`. Method calls go through the vtable (one indirection). This lets you hold **heterogeneous values** in one collection (`Vec<Box<dyn Trait>>`) and call them uniformly. The tradeoff vs generics: `dyn` has one copy of the code (small binary) but runtime vtable dispatch (slower, no inlining); generics monomorphize per type (fast, but binary grows). Reach for `dyn Trait` when you need **heterogeneous** values or want to **reduce binary size** at the cost of dispatch speed; reach for generics when the types are uniform and you want zero-cost dispatch. The pointer must be behind indirection (`Box`, `&`, `Arc`) because the `dyn` value itself is unsized.

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

### Why they exist and how auto-derivation works

Auto traits (`Send`, `Sync`, `Unpin`, `Sized`) are **compositionally derived marker traits**: the compiler automatically implements them for a type when **all its fields** implement them — no manual impl needed. This is how Rust tracks soundness properties (thread-safety, movability) through the type system *without* boilerplate: a struct is `Send` iff every field is `Send`, so adding a non-`Send` field (`Rc<T>`) makes the whole struct `!Send`, and the compiler prevents it from crossing a thread boundary. The derivation is **structural** — it walks the type's composition. You reach for auto traits implicitly (rely on the auto-derivation) and override with `unsafe impl` only when wrapping a raw type you've verified is safe. `Send` (safe to *move* to another thread) and `Sync` (safe to *share* `&T` between threads) are the two you'll encounter most — they're how `Arc<T>: Send` requires `T: Send + Sync`.

`Send`, `Sync`, `Unpin`, `Sized` are auto traits — the compiler auto-implements them based on constituent types.

::code-wrapper{language="rust"}
```rust
struct MyType(Rc<u8>);   // not Send, not Sync because Rc isn't
struct MyType2(Arc<u8>); // Send + Sync
```
::

You can opt out or opt in via `unsafe impl`/`impl !Send` (negative impls are unstable).

## `Sized` Trait

### Why `Sized` is the default and when to relax it

`Sized` marks types whose **size is known at compile time** — the compiler needs this for stack allocation, passing by value, and indexing arrays. Most types are `Sized` (`i32`, `String`, any struct of `Sized` fields). The exceptions (`?Sized`) are **dynamically sized types** (DSTs): `str`, `[T]`, `dyn Trait` — their size is only known at runtime (a `str`'s length lives in the fat pointer). Generic parameters **default to `Sized`** because most code assumes a known size; you relax with `T: ?Sized` when you want to write code generic over DSTs — e.g., a function that accepts `&str`, `&[T]`, or `&dyn Trait` via `fn foo<T: ?Sized>(x: &T)`. Reach for `?Sized` in collection/library code that must handle borrowed DSTs; leave the default (`Sized`) for ordinary functions.

Most types are `Sized` (known size at compile time). Exceptions are `?Sized` types:
- `str`, `[T]`, `dyn Trait`, `*const ()` (in some contexts)

Generic parameters default to `Sized`; relax with `T: ?Sized`:

::code-wrapper{language="rust"}
```rust
fn first_byte(s: &str) -> u8 { /* str is !Sized but you can take &str */ }
fn foo<T: ?Sized>(x: &T) { /* works for unsized T */ }
```
::
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

### Why they exist and how they're monomorphized

Const generics let you **parameterize a type by a compile-time constant value** (an integer, bool, or char) — not just by other types. This exists because some types are naturally parameterized by a *number*: a fixed-size `Grid<W, H>`, an array `<i32; N>`, a cryptographic `Block<16>`. Without const generics, you'd use macros or separate types per size (`Array16`, `Array32`...). The compiler **monomorphizes** each instantiation (`Arr<10>` and `Arr<20>` are distinct types), giving you type-level size guarantees with zero runtime cost. Reach for const generics when a number is part of a type's identity (fixed-size arrays/matrices, compile-time-sized buffers); use `Vec`/slices when the size is runtime-variable.

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

### Why they were needed

GATs (Generic Associated Types) are associated types that **themselves take generic parameters** — most commonly lifetimes (`type Item<'a>`) — stable since 1.65. They were needed because **before GATs, an associated type couldn't borrow from `self`**: a trait like `LendingIterator` (whose `next()` returns a borrow tied to `&mut self`) couldn't express that its `Item` depends on the borrow's lifetime. The `where Self: 'a` clause ties the lifetime: "the returned `Item<'a>` is valid for `'a`, which is bounded by how long `self` lives." You reach for GATs when a trait's associated type must reference `self`'s lifetime — lending iterators (returning borrowed items), async traits (the future borrows `self`), or graph/node APIs (returning references into the graph). Without GATs, these patterns required boxing or `unsafe`.

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

## Advanced Type System Tricks

::code-wrapper{language="rust"}
```rust
// Trick: use associated types for cleaner APIs
trait Container {
    type Item; // caller doesn't pick; impl does
    fn push(&mut self, item: Self::Item);
}

// Trick: use GATs for lending iterators
trait LendingIterator {
    type Item<'a> where Self: 'a;
    fn next(&mut self) -> Option<Self::Item<'_>>;
}

// Trick: newtype pattern for type safety
struct UserId(u64);
struct PostId(u64);
fn get_post(user: UserId, post: PostId) { } // can't accidentally swap types

// Trick: use PhantomData for type-level reasoning
use std::marker::PhantomData;
struct Contains<T> {
    _p: PhantomData<T>,
}
// Now the struct "owns" a T for variance purposes, even without storing it

// Trick: use marker traits to categorize types
trait Recoverable: std::error::Error + Send + Sync {}
fn safe_to_send<E: Recoverable>(e: E) { } // only Recoverable errors

// Trick: higher-rank trait bounds for flexibility
fn apply_to_strings<F>(f: F) where F: for<'a> Fn(&'a str) -> &'a str {
    println!("{}", f("hello"));
}

// Trick: sized/unsized trait bounds
fn foo<T: ?Sized>(x: &T) {} // accepts &T where T might not be Sized

// Trick: use where clauses to express complex bounds
fn complex<T>(x: T) where T: Clone + std::fmt::Debug, <T as Clone>::Output: Default {
    // T can be cloned and debugged, and its Output implements Default
}
```
::

## Type-Level Patterns

::code-wrapper{language="rust"}
```rust
// Pattern: typestate for compile-time state validation
struct Builder<State>(std::marker::PhantomData<State>);
struct Empty;
struct Configured;

impl Builder<Empty> {
    fn configure(self) -> Builder<Configured> { Builder(std::marker::PhantomData) }
}

impl Builder<Configured> {
    fn build(self) -> String { String::from("built") }
}

// Usage: build() only works on Builder<Configured>, not Builder<Empty>
// let b = Builder::<Empty>(std::marker::PhantomData);
// b.build(); // compile error!

// Pattern: sealed traits to prevent external implementations
mod sealed {
    pub trait Sealed {}
    pub struct SealedType;
    impl Sealed for SealedType {}
}
pub trait Public: sealed::Sealed {}
impl Public for sealed::SealedType {}
// external types can't impl Public because Sealed is private
```
::

## 💡 Tips & Tricks

- **Debug**: when you get a baffling lifetime error involving `&mut`, ask "is this an invariance problem?" first — `cargo expand` won't help here, but mentally substituting `&T` for `&mut T` (which is covariant) and seeing if the error disappears is a fast diagnostic.
- **Idiom**: reach for `PhantomData<fn() -> T>` (not `PhantomData<T>`) when your type logically "produces" `T` but doesn't store it directly — this gives covariance and `!Send`/`!Sync` opt-out behavior similar to a function pointer, which is usually what unsafe collection authors actually want.
- **Debug**: `rustc --edition 2021 -Z unpretty=hir` (nightly) or simply hovering in rust-analyzer over a `for<'a>` bound shows the desugared HRTB — useful for confirming whether your closure's inferred type actually is higher-ranked or just looks like it.
- **Idiom**: sealed traits (a private supertrait in a hidden module) are the standard way to make a public trait non-implementable by downstream crates while still exposing its methods — reach for this before reaching for unstable `impl !Trait`.
- **Performance**: `dyn Trait` dispatch costs one indirect call through a vtable per method invocation — for hot loops, benchmark the generic (`impl Trait`/`<T: Trait>`) version against the `dyn` version before assuming the abstraction is free either way.
- **Clippy**: `clippy::type_complexity` flags deeply nested generic types (like `Rc<RefCell<HashMap<String, Vec<Box<dyn Trait>>>>>`) — a good nudge to introduce a type alias or newtype rather than a readability problem you just live with.

## ⚠️ Edge Cases & Gotchas

- **Invariance in `&mut T` is not a bug you can "just fix" — it's load-bearing**: code that compiles fine with `&T` (covariant) and suddenly won't with `&mut T` in the same generic position is not a compiler limitation; allowing covariance there would let you smuggle a shorter-lived reference into a longer-lived slot, causing a genuine use-after-free.
- **Adding a generic method to an existing trait is a silent breaking change for `dyn` users**: a library that adds `fn new_method<T>(&self)` to a previously object-safe trait doesn't get a compile error in the trait definition itself — the break appears at every downstream `Box<dyn Trait>` call site instead, often in a different crate than the one that changed.
- **`Send`/`Sync` auto-trait inference is all-or-nothing per field**: adding a single `Rc<T>` field deep inside an otherwise fully `Send` struct makes the *entire* struct `!Send` — the compiler error points at the struct's use site (e.g., a `thread::spawn` call far away), not at the field that caused it, making the root cause non-obvious.
- **`dyn Trait` has an implicit lifetime bound that isn't `'static` by default in every position**: `Box<dyn Trait>` defaults to `Box<dyn Trait + 'static>`, but `&'a dyn Trait` defaults its trait-object lifetime to `'a`, not `'static` — mixing these defaults across function boundaries produces "the trait `Trait` is not implemented" errors that are actually lifetime mismatches in disguise.
- **GATs can express iterators that plain associated types cannot, but callers must be generic over the lifetime too**: a `LendingIterator` with `type Item<'a>` cannot be used through the standard `for` loop sugar or many existing iterator-consuming generic functions, because those are written against `Iterator`'s non-generic `Item` — GATs solve the expressiveness problem but don't retrofit into the existing ecosystem for free.
- **Const generics only support structural equality for the const parameter**: `Arr<5>` and `Arr<{2 + 3}>` are the same type only if the compiler can prove the const-expressions are equal at the type level, which is limited on stable — two const-generic types that are "obviously" the same value can fail to unify if the expressions aren't written identically.
- **Platform-independent trap — `PhantomData` variance mismatches only show up in unsafe collection edge cases**: choosing `PhantomData<T>` instead of `PhantomData<*const T>` for a custom unsafe collection compiles fine and passes ordinary tests, then produces a soundness hole only exploitable through subtyping/coercion patterns most test suites never exercise (e.g., passing a `Container<&'static str>` where `Container<&'a str>` was expected via covariance the type shouldn't have).

## 🧠 Spot the Bug

Why won't this compile?

::code-wrapper{language="rust"}
```rust
fn assign_shorter<'a>(dest: &mut &'a str, src: &'a str) {
    *dest = src;
}

fn main() {
    let long_lived = String::from("long lived");
    let mut r: &str = &long_lived;

    {
        let short_lived = String::from("short lived");
        assign_shorter(&mut r, &short_lived);
    }

    println!("{r}");
}
```
::

<details>
<summary>Answer</summary>

It fails with a lifetime error: `short_lived` does not live long enough.

`assign_shorter` takes `dest: &mut &'a str` — a mutable reference to a `&'a str`. Because `&mut T` is **invariant** in `T`, the compiler cannot let the caller pass a `&mut &'a str` where `'a` is inferred to be *shorter* than `r`'s actual lifetime; instead, unification forces `'a` in the function call to be the *shortest* lifetime that satisfies both the `&mut r` borrow and the `src` argument. Since `src` is `&short_lived` (scoped to the inner block) and `dest` is `&mut r` (where `r` must remain valid until the final `println!`), the compiler is forced to conclude `'a` must be at most as long as `short_lived`'s scope — but `r` needs to outlive that scope for the `println!` to work, so the borrow of `r` as `&mut &'a str` with that short `'a` is rejected: it would let `*dest = src` assign a short-lived reference into a binding (`r`) that needs to outlive it. If `&mut T` were covariant, this code would compile and `println!("{r}")` would print through a dangling reference to the already-dropped `short_lived` — invariance is precisely what closes this hole at compile time.

**The lesson**: `&mut T` is invariant in `T` so that you can never use a mutable reference to smuggle a shorter-lived value into a binding that's expected to outlive it.

</details>

## Summary

Variance governs subtype relationships and is mostly about lifetimes (and `&mut`'s invariance in `T`). HRTBs express "for all lifetimes." Associated types vs generics: one natural type vs caller-supplied. Object safety limits trait objects. GATs (1.65+) enable borrowing in associated types. Const generics (1.51+) parameterize by integers/bools. PhantomData tunes variance and drop behavior. Newtype pattern is the idiomatic type-distinctness tool. Use typestate pattern for compile-time validation; use sealed traits to prevent external implementations.

Next: Common design patterns and idiomatic Rust.