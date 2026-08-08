# 11 — Structs

Structs group related data. Rust structs come in three flavors.

## Named-Field Structs

::code-wrapper{language="rust"}
```rust
struct User {
    username: String,
    email: String,
    sign_in_count: u64,
    active: bool,
}

let u = User {
    username: String::from("ada"),
    email: String::from("ada@example.com"),
    sign_in_count: 1,
    active: true,
};
```
::

### Field-Init Shorthand

::code-wrapper{language="rust"}
```rust
fn new(email: String, username: String) -> User {
    User { email, username, active: true, sign_in_count: 0 }
}
```
::

When a variable name matches the field, omit `: value`.

### Struct Update Syntax

::code-wrapper{language="rust"}
```rust
let u2 = User { email: String::from("ada2@x.com"), ..u };
```
::

- `..u` copies/moves the remaining fields from `u`.
- Like a partial move — `u.username` is now invalid if `String` was moved (non-`Copy`).
- For `Copy` fields, they're copied; for non-`Copy`, they're moved out of `u`.

## Tuple Structs

::code-wrapper{language="rust"}
```rust
struct Color(i32, i32, i32);
let c = Color(255, 128, 0);
let r = c.0;
```
::

- Look like tuples but are distinct types.
- Useful for newtype pattern: `struct Meters(f64);` prevents mixing with other `f64`.
- Pattern match: `let Color(r, g, b) = c;`.

## Unit Structs

::code-wrapper{language="rust"}
```rust
struct AlwaysEqual;
let _a = AlwaysEqual;
```
::

Zero-sized; useful for trait implementations with no data (e.g., marker traits, type-state).

## `impl` Blocks

::code-wrapper{language="rust"}
```rust
impl User {
    fn new(email: String, username: String) -> Self {
        User { email, username, active: true, sign_in_count: 0 }
    }
    fn is_active(&self) -> bool { self.active }
    fn sign_in(&mut self) { self.sign_in_count += 1; }
    fn deactivate(self) -> User { User { active: false, ..self } }
}
```
::

You can split `impl` across multiple blocks (common in real codebases: one for methods, one for trait impls).

## Methods vs Associated Functions

- Methods take `&self`/`&mut self`/`self` and are called on instances: `u.is_active()`.
- Associated functions (no `self`) are constructors: `User::new(...)`.
- Convention: `new` for the canonical constructor, `with_x` for variant constructors.

## Lifetime on Structs (recap)

::code-wrapper{language="rust"}
```rust
struct Excerpt<'a> { part: &'a str }
impl<'a> Excerpt<'a> { fn part(&self) -> &'a str { self.part } }
```
::

## Generic Structs

::code-wrapper{language="rust"}
```rust
struct Point<T> { x: T, y: T }

impl<T> Point<T> {
    fn x(&self) -> &T { &self.x }
}

impl Point<f64> {            // specialized impl for f64
    fn distance(&self, other: &Self) -> f64 {
        ((self.x - other.x).powi(2) + (self.y - other.y).powi(2)).sqrt()
    }
}
```
::

Type params can be specialized: methods exist only for a specific `T`.

## Constants in Structs

::code-wrapper{language="rust"}
```rust
struct Grid<const W: usize, const H: usize> {
    cells: [[u8; W]; H],
}
let g: Grid<10, 20> = Grid { cells: [[0; 10]; 20] };
```
::

Const generics (1.51+) allow parametrizing by compile-time constants. Limited to integers/bool/char for now (full generic constants are unstable).

## Derive Macros

::code-wrapper{language="rust"}
```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
struct Pos { x: i32, y: i32 }
```
::

Common derives:
- `Debug` → `{:?}`
- `Clone, Copy` → value duplication
- `PartialEq, Eq` → `==`
- `PartialOrd, Ord` → comparison and sorting
- `Hash` → usable in `HashSet`/`HashMap`
- `Default` → `Pos::default()`

`Eq`/`Ord` require no `NaN`-like values — floats only get `PartialEq`/`PartialOrd`.

## `Default`

::code-wrapper{language="rust"}
```rust
#[derive(Default)]
struct Config { host: String, port: u16 }
let c = Config { host: "localhost".into(), ..Default::default() };
```
::

Idiomatic way to provide "default with overrides".

## `Debug` vs `Display`

- `Debug` is derived, machine-readable-ish (`{:?}` / pretty `{:#?}`).
- `Display` is user-facing; you must write it manually.

::code-wrapper{language="rust"}
```rust
impl std::fmt::Display for User {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "{} <{}>", self.username, self.email)
    }
}
```
::

## Struct Updates and Moves

::code-wrapper{language="rust"}
```rust
let u = User { /* filled */ };
let email = u.email;             // partial move
// u is partially moved; can still read other fields, but not u as a whole
```
::

Reconstruct with `..` if needed.

## 💡 Tips & Tricks

- **Debug**: `#[derive(Debug)]` plus `{:#?}` (pretty-print) on a deeply nested struct is far more readable in `println!`/`dbg!` output than the compact `{:?}` form — flip to pretty-print the moment a struct has more than two or three fields.
- **Idiom**: use field-init shorthand (`User { email, username, .. }`) everywhere the local variable name matches the field name — it's not just shorter, it also means renaming a field forces every construction site relying on shorthand to be visibly touched (a useful refactor safety net).
- **Idiom**: derive `Default` and use `..Default::default()` in struct literals for "mostly-defaults" construction instead of writing out every field — pairs especially well with a builder for the few fields that need validation.
- **Performance**: field reordering for minimal padding happens automatically for Rust's default struct layout — don't hand-order fields "by size" the way you might in C; only reach for `#[repr(C)]` when FFI or a wire format genuinely requires a fixed layout.
- **Idiom**: use tuple structs (`struct Meters(f64)`) for lightweight newtype wrappers where you don't need named fields, and named-field structs the moment a type has more than one piece of data — mixing positional (`.0`) access into a struct with two or more fields quickly becomes unreadable.
- **Clippy**: `clippy::field_reassign_with_default` flags patterns like `let mut c = Config::default(); c.port = 8080;` and suggests the equivalent, more idiomatic `Config { port: 8080, ..Default::default() }`.

## ⚠️ Edge Cases & Gotchas

- **Out-of-order field initialization** is allowed — order doesn't matter in struct literals.
- **Mutability is per-binding, not per-field**: there's no `mut` field modifier. Use `Cell`/`RefCell` for interior mutability of single fields.
- **No inheritance**: Rust has no class inheritance. Use composition + traits.
- **Private fields**: by default, fields are private to the module. Use `pub` to expose.
- **`pub(crate)`**: visible within the same crate only.
- **`#[non_exhaustive]`** prevents external crates from constructing the struct with literal syntax — forces them to use a constructor (future-proofing).
- **Self-referential structs**: not expressible directly in safe Rust (the borrow checker can't describe the relationship); use crates like `ouroboros` or own the data.
- **ZST struct**: `struct Marker;` has size 0.
- **Field order and `Drop`**: struct fields drop in **declaration order** (RFC 1857), unlike locals which drop in reverse order. This can matter for field destructors that depend on each other.

## 🧠 Spot the Bug

Why does this fail to compile?

::code-wrapper{language="rust"}
```rust
struct Inventory {
    items: Vec<String>,
    total_weight: f64,
}

impl Inventory {
    fn add_item(&mut self, item: String, weight: f64) {
        self.items.push(item);
        self.total_weight += weight;
    }

    fn heaviest_summary(&mut self) -> &String {
        let last = self.items.last().unwrap();
        self.total_weight += 0.0;
        last
    }
}

fn main() {
    let mut inv = Inventory { items: vec!["box".to_string()], total_weight: 5.0 };
    let name = inv.heaviest_summary();
    inv.add_item("crate".to_string(), 2.0);
    println!("{name}");
}
```
::

<details>
<summary>Answer</summary>

`error[E0502]: cannot borrow \`inv\` as mutable because it is also borrowed as immutable`.

`heaviest_summary` takes `&mut self` and returns `&String` — a reference borrowed *from* `self.items`. Because the return value's lifetime is tied to `&mut self` (the only lifetime available in the signature), the compiler must treat the returned `&String` as keeping the **entire** `self` borrowed for as long as `name` is alive, even though the method body only actually needs a shared borrow of `self.items` to produce that reference. This is a well-known limitation of whole-struct borrowing through method signatures: the borrow checker can see disjoint *field* accesses within a single function body (as in the split-borrow patterns from the References chapter), but it cannot see through a method call's boundary — from the caller's perspective, `inv.heaviest_summary()` mutably borrows all of `inv`, full stop, for as long as `name` lives. The subsequent `inv.add_item(...)` call needs `&mut inv` too, which conflicts.

The fix is to change `heaviest_summary` to take `&self` (it doesn't actually need to mutate anything — the `+= 0.0` is a red herring/smell) or to return an owned `String` (`.clone()`) if a genuine mutation is required alongside the borrow.

**The lesson**: a method's return-value lifetime that borrows from `self` locks the *entire* receiver for the borrow's duration from the caller's point of view, even if the method body only touches one field — the borrow checker doesn't see inside function calls the way it sees inside a single function body.

</details>

## `impl` Method Dispatch

- Methods taking `self` by value consume the receiver.
- Method resolution finds methods on `Self`, `&Self`, `&mut Self` automatically based on call syntax.
- Auto-ref/deref lets you call `&self` methods on owned values and vice versa.

## Memory Layout

- Reorder fields for minimal padding — the compiler does this by default (repr optimization). Use `#[repr(C)]` to force C-compatible layout (FFI). Use `#[repr(transparent)]` for newtype wrappers (same layout as inner). Use `#[repr(packed)]` to disable padding (careful with alignment → unaligned reads are UB).

## Struct Tricks & Patterns

::code-wrapper{language="rust"}
```rust
// Trick: builder pattern for structs with many optional fields
struct Config {
    host: String,
    port: u16,
    timeout: u32,
}
struct ConfigBuilder {
    host: Option<String>,
    port: Option<u16>,
    timeout: Option<u32>,
}
impl ConfigBuilder {
    fn new() -> Self { ConfigBuilder { host: None, port: None, timeout: None } }
    fn host(mut self, h: String) -> Self { self.host = Some(h); self }
    fn port(mut self, p: u16) -> Self { self.port = Some(p); self }
    fn build(self) -> Config {
        Config {
            host: self.host.unwrap_or_default(),
            port: self.port.unwrap_or(8080),
            timeout: self.timeout.unwrap_or(30),
        }
    }
}

// Trick: use field-level visibility with pub(super)
struct Private {
    pub(super) field1: i32, // visible in parent module
    field2: i32, // private
}

// Trick: phantom type parameter for type-level info
use std::marker::PhantomData;
struct Celsius(f64);
struct Fahrenheit(f64);
struct Temperature<T> {
    value: f64,
    _unit: PhantomData<T>,
}
impl Temperature<Celsius> {
    fn to_fahrenheit(self) -> Temperature<Fahrenheit> {
        Temperature { value: self.value * 9.0 / 5.0 + 32.0, _unit: PhantomData }
    }
}

// Trick: use newtype pattern to wrap scalar types
struct UserId(u64);
struct Email(String);
// Now you can't accidentally mix UserId and Email

// Trick: const methods for compile-time computations
#[derive(Default)]
struct Point { x: i32, y: i32 }
impl Point {
    const fn origin() -> Self { Point { x: 0, y: 0 } }
}
const ZERO: Point = Point::origin();

// Trick: Default + .. pattern for partial updates
#[derive(Default)]
struct Config { a: i32, b: String, c: bool }
let c1 = Config { a: 1, ..Default::default() };
```
::

## Summary

Structs come in named, tuple, and unit forms. Methods live in `impl` blocks. Derive macros give you common traits for free. Const generics, generics, and lifetimes parametrize them. Memory layout can be controlled with `repr` attributes. Use builder pattern for complex initialization; use phantom types for type-level reasoning.

Next: Enums — Rust's algebraic data types.