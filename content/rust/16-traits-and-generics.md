# 16 — Traits and Generics

Traits are Rust's answer to interfaces/typeclasses — they define **shared behavior**. Generics parametrize code over types. Together they're the foundation of Rust's abstraction.

## Defining and Implementing Traits

::code-wrapper{language="rust"}
```rust
trait Greet {
    fn say_hi(&self) -> String;
    fn say_loud(&self) -> String {
        format!("{}!!!", self.say_hi())    // default method body
    }
}

struct User { name: String }
impl Greet for User {
    fn say_hi(&self) -> String { format!("hi {}", self.name) }
}
```
::

- Default methods can be overridden.
- Implementations are explicit (no automatic interface implementation like Java).
- You can implement a trait for a type only if either the trait or the type is **local** to your crate (the **orphan rule**) — prevents conflicting impls across crates.

## Trait Objects vs Static Dispatch

::code-wrapper{language="rust"}
```rust
fn print_all<T: Greet>(items: &[T]) { /* monomorphized per T */ }
fn print_dyn(items: &[Box<dyn Greet>]) { /* dynamic dispatch */ }
```
::

- Generics + trait bounds = **static dispatch** (inlined, zero-cost, code duplication per type).
- `dyn Trait` = **dynamic dispatch** via vtable (one copy, indirect call, slightly slower, enables heterogeneous collections).

## Trait Object Requirements (Object Safety)

A trait is object-safe iff:
- No associated functions / methods returning `Self` (by value).
- No generics in methods.
- All methods take `self` by reference (or have `where Self: Sized`).
- `Self: Sized` super-bound disqualifies.

`Clone`/`Iterator`/`PartialEq` aren't object-safe. `Greet`, `Display`, `Debug` are.

::code-wrapper{language="rust"}
```rust
let v: Vec<Box<dyn Greet>> = vec![Box::new(User { name: "a".into() })];
```
::

## Default Type Parameters and Associated Types

### Generics vs Associated Types

::code-wrapper{language="rust"}
```rust
// Generic trait — caller picks T:
trait Container<T> { fn item(&self) -> &T; }

// Associated type — impl picks the type:
trait Container { type Item; fn item(&self) -> &Self::Item; }
```
::

Use associated types when each type has **one** natural inner type (e.g., `Iterator::Item`). Use generics when the type can carry multiple variants (e.g., `From<T>`).

### Default Associated Type

::code-wrapper{language="rust"}
```rust
trait Rng { type Output = u64; fn next(&self) -> Self::Output; }
```
::

## Trait Bounds

### Why trait bounds exist

A bare `<T>` says "any type at all" — but that means the function body can *do almost nothing* with `T`, because the compiler doesn't know what capabilities `T` has (no `==`, no `+`, no `.len()`). A **trait bound** is the constraint that tells the compiler "`T` must implement these traits," which unlocks exactly those methods and operations in the body. Bounds are the bridge between generics (write once, use for any type) and capability (only types that support these operations).

You **add** a bound when the body needs an operation that requires it (`a > b` needs `PartialOrd`). You **relax** a bound when you want the function to accept more types — the minimum bound is the one whose methods you actually call. Adding `Copy` to `max` lets you return `a` by value without moving; removing it would force a different return strategy. This is the central tradeoff: tighter bounds = more you can do in the body, fewer types accepted; looser bounds = more types accepted, less you can do.

::code-wrapper{language="rust"}
```rust
fn max<T: PartialOrd + Copy>(a: T, b: T) -> T { if a > b { a } else { b } }

fn sum_all<T>(items: &[T]) -> T
where
    T: Sum + Copy,
{
    items.iter().copied().sum()
}
```
::

`where` clauses are more readable for long bounds and enable more expressiveness (bounds on associated types, lifetimes).

## `impl Trait`

### In argument position

::code-wrapper{language="rust"}
```rust
fn print(it: impl Iterator<Item = i32>) { /* ... */ }
// equivalent to:
fn print<T: Iterator<Item = i32>>(it: T) { /* ... */ }
```
::

### In return position

::code-wrapper{language="rust"}
```rust
fn counter() -> impl Iterator<Item = u32> {
    (0..5).map(|x| x * 2)
}
```
::

- Returns *some* concrete type that implements the trait — the actual type is hidden from the caller.
- Cannot be conditional (no `if cond { type A } else { type B }`).
- Each return-site must use a single concrete type.
- For returning different types, use `Box<dyn Trait>` or trait objects.

## Common Standard Traits

| Trait | Purpose |
|---|---|
| `Display` | User-facing string (`{}`) |
| `Debug` | Developer string (`{:?}`) |
| `Clone`, `Copy` | Duplication |
| `PartialEq`, `Eq` | Equality |
| `PartialOrd`, `Ord` | Ordering |
| `Hash` | Hashing |
| `Default` | `Default::default()` |
| `From`, `Into`, `TryFrom`, `TryInto` | Conversions |
| `AsRef`, `AsMut` | Cheap borrows |
| `Iterator` | Iteration |
| `Add`, `Sub`, `Mul`, `Div` | Operator overloading |
| `Index`, `IndexMut` | `[]` |
| `Drop` | Destructor |
| `Sized` | Has a known size |
| `Send`, `Sync` | Thread safety (auto) |
| `Unpin`, `Pin` | Async/pinning |
| `Fn`, `FnMut`, `FnOnce` | Closures |

## `From` and `Into`

::code-wrapper{language="rust"}
```rust
impl From<i32> for My { fn from(x: i32) -> Self { /* ... */ } }
let m: My = 5i32.into();
```
::

Implementing `From` automatically gives you `Into`. Idiomatic: implement `From`, never `Into` directly.

`FromStr` is the parsing version (`str::parse()` uses it).

## `AsRef` and `AsMut`

::code-wrapper{language="rust"}
```rust
fn open<P: AsRef<Path>>(path: P) { let p = path.as_ref(); /* p: &Path */ }
open("file.txt");           // &str: AsRef<Path>
open(Path::new("f"));       // &Path: AsRef<Path>
open(String::from("f"));    // String: AsRef<Path>
```
::

Multi-source APIs use `AsRef<T>` to accept `&str`, `String`, `&Path`, `&OsStr`, etc.

## Operator Overloading

### Why it exists and when to use it

Operator overloading exists so domain types can read **naturally**: `Vec2 + Vec2` is clearer than `vec2.add(other)`, and for math/vector libraries it's the conventional notation everyone expects. You overload an operator by implementing the corresponding trait (`Add`, `Sub`, `Mul`, ...); the `type Output` associated type declares what the operator returns, since `a + b` need not produce the same type as `a` (e.g., matrix × vector → vector).

**Ecosystem norm**: overload operators for types that are genuinely "numeric" or have a universally-agreed operator meaning (vectors, matrices, complex numbers, money). Avoid overloading `+` for types where the meaning is ambiguous (what does `User + User` mean?) — a named method is clearer there. The standard library's choices are a good guide: it overloads for arithmetic types, not domain types.

::code-wrapper{language="rust"}
```rust
use std::ops::Add;
struct Vec2 { x: f64, y: f64 }
impl Add for Vec2 {
    type Output = Vec2;
    fn add(self, rhs: Vec2) -> Vec2 { Vec2 { x: self.x + rhs.x, y: self.y + rhs.y } }
}
let v = Vec2 { x: 1.0, y: 0.0 } + Vec2 { x: 0.0, y: 1.0 };
```
::

You can overload `Add`, `Sub`, `Mul`, `Div`, `Rem`, `Neg`, `Index`, `IndexMut`, `Deref`, `DerefMut`, `BitAnd`, `BitOr`, `Shl`, `Shr`, `Fn*`, etc.

## `Deref` Coercion

::code-wrapper{language="rust"}
```rust
impl Deref for My { type Target = Inner; fn deref(&self) -> &Inner { &self.inner } }
let m = My { inner: Inner { x: 5 } };
let x = m.x;     // m.x works via Deref coercion
```
::

`String: Deref<Target = str>`, `Vec<T>: Deref<Target = [T]>`, `Box<T>: Deref<Target = T>`. This enables method/field forwarding and `&`-coercions.

**Don't** abuse `Deref` for inheritance — it's a memory-layout mechanism, not a modeling tool.

## `Drop`

### How it works and when to implement it

`Drop` is the heart of **RAII** in Rust: when a value goes out of scope, the compiler automatically calls `drop` on it, which you can customize to release resources (close a file, free a lock, deallocate FFI memory). The compiler also orders drops deterministically: variables drop in **reverse declaration order** at scope end, so cleanup is predictable. You implement `Drop` manually when a type owns a resource that needs explicit cleanup beyond what its fields already handle — e.g., a wrapper around a raw FFI handle that must call a C `close()` function, or a guard that releases a lock on drop. Most types **don't** need a manual `Drop`: if all your resources are already in `Drop`-implementing fields (a `File`, a `MutexGuard`), the compiler's automatic drop calls their `Drop` for you.

::code-wrapper{language="rust"}
```rust
impl Drop for File {
    fn drop(&mut self) {
        // close file, free resources
    }
}
```
::

Runs automatically at scope end. Don't call directly — use `std::mem::drop(value)` to drop early.

## Supertraits

### Why they exist

A supertrait (e.g., `trait Pretty: Debug`) expresses a **capability requirement**: any type implementing `Pretty` *must also* implement `Debug` — the supertrait is a precondition. This lets the trait's methods rely on the supertrait's methods (a `pretty` impl can use `{:?}`). You reach for a supertrait when your trait's contract *includes* another trait's behavior — "to be `Pretty`, you must already be `Debug`-able." This differs from a `where` bound on a function (which constrains a single function), in that a supertrait constrains *every* impl of the trait globally.

::code-wrapper{language="rust"}
```rust
trait Pretty: Debug { fn pretty(&self) { /* can use {:?} */ } }
```
::

A supertrait bound means "any type implementing Pretty must also implement Debug".

## Trait Composition

### When to compose traits

Trait composition (a trait that bundles several other traits) lets you write a single bound where you'd otherwise list several. `fn f(x: impl Read)` is clearer than `fn f(x: impl io::Read + BufRead)`. You reach for composition when a *named capability* spans multiple underlying traits and you use that bundle repeatedly — it documents intent ("I need something that's both a Reader and a BufRead") and keeps signatures terse. The blanket impl (`impl<T: io::Read + BufRead> Read for T {}`) makes every type that has the underlying traits automatically implement the composite, so existing types opt in for free.

::code-wrapper{language="rust"}
```rust
trait Read: io::Read + BufRead {}
impl<T: io::Read + BufRead> Read for T {}
```
::

Blanket impl gives any type with both underlying traits the composite trait.

## Blanket Implementations

::code-wrapper{language="rust"}
```rust
impl<T: Display> ToString for T {
    fn to_string(&self) -> String { /* ... */ }
}
```
::

A blanket impl covers all matching types. Powerful but can lock out other impls (orphan-rule implications).

## Traits with Const Generics

::code-wrapper{language="rust"}
```rust
trait Bytes<const N: usize> { fn data(&self) -> [u8; N]; }
```
::

## Marker Traits

### Why they exist

A marker trait carries **no methods** — it's a pure *type-level tag* that asserts a property about a type without defining behavior. `Send` and `Sync` mark thread-safety; `Sized` marks compile-time-known size; `Copy` marks bitwise-copyability. Some markers are **auto-traits**: the compiler automatically implements them for a type when all its fields qualify (a struct is `Send` if all its fields are `Send`). This is how Rust tracks soundness properties (like "can this cross a thread boundary?") through the type system *without* requiring you to write boilerplate — the property is *derived* from the type's composition. You reach for marker traits (or rather, rely on them) whenever you write code with soundness preconditions (thread spawning requires `Send + 'static`, generic storage requires `Sized`).

## Sealed Traits

To prevent downstream impls while still exposing a stable API:

::code-wrapper{language="rust"}
```rust
mod private { pub trait Sealed {} }
pub trait Public: private::Sealed { /* ... */ }
```
::

Downstream types can't implement `Sealed`, so they can't implement `Public`. Used by std and many crates for forward compatibility.

## 💡 Tips & Tricks

- **Debug**: `cargo expand` on a generic function shows you each monomorphized instantiation the compiler actually generated — useful when you suspect code bloat from a heavily-generic function called with many distinct type parameters.
- **Idiom**: implement `From` (never `Into` directly) for conversions — `impl From<A> for B` automatically gives you `B: Into<A>` via a blanket impl in `std`, so writing `Into` by hand is both redundant and loses the reflexive `From` you'd otherwise get.
- **Performance**: static dispatch (`fn f<T: Trait>(x: T)`) has zero runtime cost but duplicates code per concrete type (monomorphization); `dyn Trait` has one shared implementation but pays a vtable indirection per call — benchmark before assuming either is "obviously" the right choice for a specific hot path.
- **Idiom**: use the sealed-trait pattern (a private supertrait in a hidden module) the moment you want a public trait's method set to be extensible in the future without it being a breaking change for anyone who might have implemented it externally.
- **Debug**: "the trait `Trait` is not implemented for `Type`" sometimes means the impl exists but for a *different* generic instantiation (e.g., `impl Trait for Vec<i32>` exists but you need `Vec<u32>`) — read the full type in the error, not just the trait name.
- **Clippy**: `clippy::wrong_self_convention` flags methods like `fn to_x(self)` that consume `self` when the `to_`/`as_`/`into_` naming convention implies a specific receiver style — worth following since much of the ecosystem relies on these naming conventions to predict a method's ownership behavior without reading its signature.

## ⚠️ Edge Cases & Gotchas

- **Orphan rule**: can't implement external trait for external type. Use the **newtype pattern** to wrap and implement.
- **`Self` returns break object safety**: traits returning `Self` can't be made into `dyn Trait`.
- **Method resolution**: when multiple traits provide the same method name, you must write `Trait::method(&self)` or use UFCS.
- **Conflicting impls**: blanket impls can cause "conflicting implementations" errors; design carefully.
- **`PartialEq` vs `Eq`**: `Eq` is a marker requiring reflexivity; floats lack `Eq`.
- **Trait objects can't have generic methods** at runtime: `fn dyn_call<T>(&self, x: T)` is forbidden on `dyn Trait`.
- **`impl Trait` in argument position** is sugar for a generic — not a way to accept trait objects.
- **`Self: Sized` bound on a method** excludes it from the vtable — useful for "static-only" methods on an object-safe trait.
- **Generic method on trait object** is impossible — workaround is to expose concrete variants.
- **Lifetime bounds on traits**: `trait Foo<'a>` requires the impl to specify a lifetime; used when methods borrow from inputs.

## 🧠 Spot the Bug

Why can't this trait be used as `Box<dyn Shape>`?

::code-wrapper{language="rust"}
```rust
trait Shape {
    fn area(&self) -> f64;
    fn scaled(&self, factor: f64) -> Self;
}

struct Circle { radius: f64 }

impl Shape for Circle {
    fn area(&self) -> f64 { std::f64::consts::PI * self.radius * self.radius }
    fn scaled(&self, factor: f64) -> Self { Circle { radius: self.radius * factor } }
}

fn main() {
    let shapes: Vec<Box<dyn Shape>> = vec![Box::new(Circle { radius: 2.0 })];
}
```
::

<details>
<summary>Answer</summary>

`error[E0038]: the trait \`Shape\` cannot be made into an object` — because `scaled(&self, factor: f64) -> Self` returns `Self` by value.

Object safety requires that every method on a trait be callable through a `dyn Trait` fat pointer (`{data_ptr, vtable_ptr}`) without knowing the concrete type at compile time. A method returning `Self` is fundamentally incompatible with this: if you call `.scaled(2.0)` on a `Box<dyn Shape>`, the compiler would need to know the exact concrete return type's size to allocate space for it — but `dyn Shape` erases that information by design. Two different concrete types implementing `Shape` (say, `Circle` and `Square`) would need `scaled` to return *different* concrete types, which a single vtable entry cannot represent (a vtable entry is one function pointer with one fixed signature, not "whatever `Self` happens to be for this instance"). This is exactly why `Clone` (whose `clone(&self) -> Self` has the identical shape) isn't object-safe either, and why `dyn Clone` doesn't exist without a workaround.

The fix is to avoid `Self`-by-value returns on object-safe traits — return `Box<dyn Shape>` instead, accepting the heap-allocation cost, or split the trait so the `Self`-returning method lives on a separate, non-object-safe trait:

::code-wrapper{language="rust"}
```rust
trait Shape {
    fn area(&self) -> f64;
    fn scaled(&self, factor: f64) -> Box<dyn Shape>;
}
```
::

**The lesson**: any trait method returning `Self` by value breaks object safety, because a `dyn Trait` vtable entry can't represent "return whatever concrete type this particular instance happens to be."

</details>

## Summary

Traits define behavior; generics parametrize code; `impl Trait` is sugar for both. Use trait bounds to require capabilities. Object safety decides whether you can use `dyn Trait`. Implement `From`, `Display`/`Debug`, and `Default` for ergonomics. Avoid abusing `Deref`. Sealed traits give you stable APIs.

Next: Lifetimes in generics + the deeper type-system chapter.