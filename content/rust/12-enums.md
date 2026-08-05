# 12 — Enums (Algebraic Data Types)

Enums are Rust's killer feature for modeling domain choices. Each variant can carry data of a different shape — they're algebraic data types (ADTs), more like F# discriminated unions than C enums.

## Basic Enum

```rust
enum IpAddr {
    V4(u8, u8, u8, u8),
    V6(String),
}

let v4 = IpAddr::V4(127, 0, 0, 1);
let v6 = IpAddr::V6(String::from("::1"));
```

Each variant is a constructor; the enum value is *exactly one* of them.

## Variants with Named Fields

```rust
enum Message {
    Quit,
    Move { x: i32, y: i32 },
    Write(String),
    ChangeColor(i32, i32, i32),
}
```

- `Quit` — unit variant (no data).
- `Move` — struct-like variant.
- `Write` — tuple-like variant.
- `ChangeColor` — tuple-like with multiple fields.

Pattern matching destructures them:

```rust
match msg {
    Message::Quit => {},
    Message::Move { x, y } => println!("{x},{y}"),
    Message::Write(s) => println!("{s}"),
    Message::ChangeColor(r, g, b) => println!("{r},{g},{b}"),
}
```

## `Option<T>` — The Null Replacement

```rust
enum Option<T> {
    Some(T),
    None,
}
```

There is **no null** in Rust. Use `Option<T>` when a value may be absent. The compiler forces you to handle `None`.

```rust
let v: Option<i32> = Some(5);
let none: Option<i32> = None;
match v { Some(x) => println!("{x}"), None => println!("none") }
let unwrapped = v.unwrap_or(0);
```

## `Result<T, E>` — Error Handling Primitive

```rust
enum Result<T, E> {
    Ok(T),
    Err(E),
}
```

The basis of Rust error handling. See Error Handling chapter.

## Methods on Enums

```rust
impl Message {
    fn call(&self) {
        // dispatch on self
    }
}
```

Enums can have methods, just like structs.

## Enums with Generic Parameters

```rust
enum Either<L, R> {
    Left(L),
    Right(R),
}

enum Tree<T> {
    Leaf,
    Node(Box<Tree<T>>, T, Box<Tree<T>>),
}
```

Recursive enums need indirection (`Box`) because the compiler needs to know the size — direct self-recursion would be infinitely sized.

## `#[derive]` for Enums

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum Color { Red, Green, Blue }
```

`Copy` only works if **every** variant's data is `Copy` (e.g., no `String`).

## Match Exhaustiveness

`match` must cover every variant. Use `_` for "everything else". For `#[non_exhaustive]` enums from external crates, `_` is *required* even if you cover all current variants (upstream may add more).

```rust
#[non_exhaustive]
pub enum Event { Login, Logout }
// External crate must write `_ => ...` arm.
```

## Field-Access on Tuple Variants

```rust
let m = Message::Write("hi".into());
let s = m.0;  // ERROR: cannot access field — must pattern match
```

Tuple-variant fields aren't accessible via `.0` — you must destructure with `let Message::Write(s) = m;`. (Some newer nightly features relax this.)

## Pattern Matching Patterns

```rust
match opt {
    Some(0) => "zero",
    Some(1..=9) => "small",
    Some(n) if n > 1000 => "big",     // guard
    Some(_) => "other",
    None => "none",
}

// binding with @
match n {
    0..=9 => "digit",
    x @ 10..=99 => "two digits: {x}",
    _ => "big",
}

// or-patterns
match c {
    'a' | 'e' | 'i' | 'o' | 'u' => "vowel",
    _ => "consonant",
}
```

## `if let` and `while let`

```rust
if let Some(x) = opt { println!("{x}"); }
while let Some(x) = iter.next() { /* ... */ }
```

Short for "match one pattern and ignore the rest". Use when you only care about one case.

## Enum Memory Layout

Enums store a discriminant (tag) plus enough space for the largest variant's payload:

```rust
enum E {
    A,
    B(i64),
    C([u8; 16]),
}
// size = max(payload size) + discriminant (often optimized)
```

The compiler performs **niche optimization**: if a variant is impossible to overlap with another, it can drop the discriminant. Classic case: `Option<&T>` is the same size as `&T` (null pointer is reserved for `None`).

`Option<NonNull<T>>`, `Option<Box<T>>`, `Option<&mut T>` are all pointer-sized.

## State Machines

Enums are perfect for state machines:

```rust
enum Conn {
    Idle,
    Connecting(std::time::Instant),
    Connected { addr: String, since: std::time::Instant },
    Error(String),
}
```

Each state carries the data relevant to it. Transitions are explicit functions returning a new `Conn`.

## Variants as Constructors

```rust
let f: fn(String) -> Message = Message::Write;
```

Each variant acts as a function. Useful for higher-order code.

## Edge Cases & Pitfalls

- **Recursive enums without `Box`**: `enum Bad { Node(Bad) }` — infinite size, compile error. Use `Box<Bad>`.
- **Variant equality**: `Option::Some(5) == Option::Some(5)` works only if `T: PartialEq`.
- **`Copy` enums**: only if all payloads are `Copy`.
- **`Default` for enums**: not derivable for enums (no obvious default). You can `impl Default` manually — convention is "smallest/zero" variant (e.g., `Option::None`).
- **`#[repr(C)]`**: gives C-style layout with explicit discriminant (size depends on largest discriminant). Use `#[repr(C, u8)]` etc. to fix discriminant width.
- **Comparing variants**: `PartialOrd`/`Ord` compares by **declaration order** of variants, then by payload.
- **`is_x()` methods**: idiom is to write `matches!(self, Self::X)` or a helper method rather than exposing internal representation.
- **`matches!` macro**: `if matches!(opt, Some(0)) { }` — concise single-pattern check.

## `matches!` Macro

```rust
let ok = matches!(result, Ok(_));
let small = matches!(n, 0..=9);
```

Like a tiny `match` returning `bool`.

## Typestate Pattern (advanced)

Use type params to encode states:

```rust
struct Builder<T>(PhantomData<T>);
struct Unconfigured;
struct Configured;
impl Builder<Unconfigured> {
    fn configure(self) -> Builder<Configured> { Builder(PhantomData) }
}
impl Builder<Configured> {
    fn build(self) -> Product { /* ... */ }
}
```

Calling `build` on an `Unconfigured` builder is a compile-time error. Encode invariants in the type system.

## Summary

Enums are sum types: each value is one variant (with optional data). Combined with `match`, they form Rust's modeling backbone. `Option`/`Result` are the canonical examples. Niche optimization makes them memory-efficient. Pattern matching with guards, or-patterns, `@`-bindings, and `matches!` give you expressive dispatch.

Next: Pattern Matching — a deep dive.