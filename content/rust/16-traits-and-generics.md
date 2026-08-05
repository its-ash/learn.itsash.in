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

::code-wrapper{language="rust"}
```rust
trait Pretty: Debug { fn pretty(&self) { /* can use {:?} */ } }
```
::

A supertrait bound means "any type implementing Pretty must also implement Debug".

## Trait Composition

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

Zero-method traits that tag types: `Sized`, `Send`, `Sync`, `Unpin`, `Copy`. Some are auto-traits (compiler-implemented when possible).

## Sealed Traits

To prevent downstream impls while still exposing a stable API:

::code-wrapper{language="rust"}
```rust
mod private { pub trait Sealed {} }
pub trait Public: private::Sealed { /* ... */ }
```
::

Downstream types can't implement `Sealed`, so they can't implement `Public`. Used by std and many crates for forward compatibility.

## Edge Cases & Pitfalls

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

## Summary

Traits define behavior; generics parametrize code; `impl Trait` is sugar for both. Use trait bounds to require capabilities. Object safety decides whether you can use `dyn Trait`. Implement `From`, `Display`/`Debug`, and `Default` for ergonomics. Avoid abusing `Deref`. Sealed traits give you stable APIs.

Next: Lifetimes in generics + the deeper type-system chapter.