# 11 — Structs

Structs group related data. Rust structs come in three flavors.

## Named-Field Structs

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

### Field-Init Shorthand

```rust
fn new(email: String, username: String) -> User {
    User { email, username, active: true, sign_in_count: 0 }
}
```

When a variable name matches the field, omit `: value`.

### Struct Update Syntax

```rust
let u2 = User { email: String::from("ada2@x.com"), ..u };
```

- `..u` copies/moves the remaining fields from `u`.
- Like a partial move — `u.username` is now invalid if `String` was moved (non-`Copy`).
- For `Copy` fields, they're copied; for non-`Copy`, they're moved out of `u`.

## Tuple Structs

```rust
struct Color(i32, i32, i32);
let c = Color(255, 128, 0);
let r = c.0;
```

- Look like tuples but are distinct types.
- Useful for newtype pattern: `struct Meters(f64);` prevents mixing with other `f64`.
- Pattern match: `let Color(r, g, b) = c;`.

## Unit Structs

```rust
struct AlwaysEqual;
let _a = AlwaysEqual;
```

Zero-sized; useful for trait implementations with no data (e.g., marker traits, type-state).

## `impl` Blocks

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

You can split `impl` across multiple blocks (common in real codebases: one for methods, one for trait impls).

## Methods vs Associated Functions

- Methods take `&self`/`&mut self`/`self` and are called on instances: `u.is_active()`.
- Associated functions (no `self`) are constructors: `User::new(...)`.
- Convention: `new` for the canonical constructor, `with_x` for variant constructors.

## Lifetime on Structs (recap)

```rust
struct Excerpt<'a> { part: &'a str }
impl<'a> Excerpt<'a> { fn part(&self) -> &'a str { self.part } }
```

## Generic Structs

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

Type params can be specialized: methods exist only for a specific `T`.

## Constants in Structs

```rust
struct Grid<const W: usize, const H: usize> {
    cells: [[u8; W]; H],
}
let g: Grid<10, 20> = Grid { cells: [[0; 10]; 20] };
```

Const generics (1.51+) allow parametrizing by compile-time constants. Limited to integers/bool/char for now (full generic constants are unstable).

## Derive Macros

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
struct Pos { x: i32, y: i32 }
```

Common derives:
- `Debug` → `{:?}`
- `Clone, Copy` → value duplication
- `PartialEq, Eq` → `==`
- `PartialOrd, Ord` → comparison and sorting
- `Hash` → usable in `HashSet`/`HashMap`
- `Default` → `Pos::default()`

`Eq`/`Ord` require no `NaN`-like values — floats only get `PartialEq`/`PartialOrd`.

## `Default`

```rust
#[derive(Default)]
struct Config { host: String, port: u16 }
let c = Config { host: "localhost".into(), ..Default::default() };
```

Idiomatic way to provide "default with overrides".

## `Debug` vs `Display`

- `Debug` is derived, machine-readable-ish (`{:?}` / pretty `{:#?}`).
- `Display` is user-facing; you must write it manually.

```rust
impl std::fmt::Display for User {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "{} <{}>", self.username, self.email)
    }
}
```

## Struct Updates and Moves

```rust
let u = User { /* filled */ };
let email = u.email;             // partial move
// u is partially moved; can still read other fields, but not u as a whole
```

Reconstruct with `..` if needed.

## Edge Cases & Pitfalls

- **Out-of-order field initialization** is allowed — order doesn't matter in struct literals.
- **Mutability is per-binding, not per-field**: there's no `mut` field modifier. Use `Cell`/`RefCell` for interior mutability of single fields.
- **No inheritance**: Rust has no class inheritance. Use composition + traits.
- **Private fields**: by default, fields are private to the module. Use `pub` to expose.
- **`pub(crate)`**: visible within the same crate only.
- **`#[non_exhaustive]`** prevents external crates from constructing the struct with literal syntax — forces them to use a constructor (future-proofing).
- **Self-referential structs**: not expressible directly in safe Rust (the borrow checker can't describe the relationship); use crates like `ouroboros` or own the data.
- **ZST struct**: `struct Marker;` has size 0.
- **Field order and `Drop`**: struct fields drop in **declaration order** (RFC 1857), unlike locals which drop in reverse order. This can matter for field destructors that depend on each other.

## `impl` Method Dispatch

- Methods taking `self` by value consume the receiver.
- Method resolution finds methods on `Self`, `&Self`, `&mut Self` automatically based on call syntax.
- Auto-ref/deref lets you call `&self` methods on owned values and vice versa.

## Memory Layout

- Reorder fields for minimal padding — the compiler does this by default (repr optimization). Use `#[repr(C)]` to force C-compatible layout (FFI). Use `#[repr(transparent)]` for newtype wrappers (same layout as inner). Use `#[repr(packed)]` to disable padding (careful with alignment → unaligned reads are UB).

## Summary

Structs come in named, tuple, and unit forms. Methods live in `impl` blocks. Derive macros give you common traits for free. Const generics, generics, and lifetimes parametrize them. Memory layout can be controlled with `repr` attributes.

Next: Enums — Rust's algebraic data types.