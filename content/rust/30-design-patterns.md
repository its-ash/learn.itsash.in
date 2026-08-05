# 30 — Design Patterns & Idiomatic Rust

Rust isn't OOP, but it has idioms for abstraction, polymorphism, and reuse. Here are the patterns every pro Rust developer should know.

## 1. Builder Pattern

For complex construction with many optional parameters:

```rust
pub struct Server {
    host: String,
    port: u16,
    tls: bool,
    max_conn: usize,
}

pub struct ServerBuilder {
    host: Option<String>,
    port: Option<u16>,
    tls: Option<bool>,
    max_conn: Option<usize>,
}

impl ServerBuilder {
    pub fn new() -> Self {
        ServerBuilder { host: None, port: None, tls: None, max_conn: None }
    }
    pub fn host(mut self, host: impl Into<String>) -> Self { self.host = Some(host.into()); self }
    pub fn port(mut self, port: u16) -> Self { self.port = Some(port); self }
    pub fn tls(mut self, tls: bool) -> Self { self.tls = Some(tls); self }
    pub fn max_conn(mut self, m: usize) -> Self { self.max_conn = Some(m); self }
    pub fn build(self) -> Result<Server, String> {
        Ok(Server {
            host: self.host.ok_or("host required")?,
            port: self.port.unwrap_or(80),
            tls: self.tls.unwrap_or(false),
            max_conn: self.max_conn.unwrap_or(100),
        })
    }
}

let s = ServerBuilder::new().host("localhost").tls(true).build()?;
```

For less boilerplate, use the `derive_builder` or `typed_builder` crates.

### Typestate Builder

```rust
pub struct MissingHost;
pub struct WithHost(String);

pub struct ServerBuilder<H> { host: H, /* ... */ }

impl ServerBuilder<MissingHost> {
    pub fn new() -> Self { ServerBuilder { host: MissingHost } }
    pub fn host(self, h: String) -> ServerBuilder<WithHost> { ServerBuilder { host: WithHost(h) } }
}
impl ServerBuilder<WithHost> {
    pub fn build(self) -> Server { /* ... */ }
}
```

Compile-time enforcement: you can't `build()` without setting `host`. The `bon` crate provides this ergonomically.

## 2. Newtype Pattern

```rust
pub struct UserId(pub u64);
pub struct Email(pub String);

impl Email {
    pub fn new(s: String) -> Result<Self, &'static str> {
        if s.contains('@') { Ok(Email(s)) } else { Err("invalid") }
    }
}
```

- Zero-cost type distinction.
- Constructor can validate invariants.
- Implement `From`/`Display`/`Debug`/`Deref` as appropriate (don't over-implement).

## 3. Typestate Pattern

Encode state machines in types:

```rust
pub struct Draft; pub struct Reviewed; pub struct Published;

pub struct Article<S> { content: String, _state: PhantomData<S> }

impl Article<Draft> {
    pub fn new(content: String) -> Self { Article { content, _state: PhantomData } }
    pub fn review(self) -> Article<Reviewed> { Article { content: self.content, _state: PhantomData } }
}
impl Article<Reviewed> {
    pub fn publish(self) -> Article<Published> { Article { content: self.content, _state: PhantomData } }
}
impl<S> Article<S> {
    pub fn content(&self) -> &str { &self.content }
}
```

Calling `publish` on `Draft` is a compile-time error. Methods only exist in valid states.

## 4. Strategy via Traits

```rust
pub trait Compressor { fn compress(&self, data: &[u8]) -> Vec<u8>; }

pub struct Gzip; pub struct Lz4;

impl Compressor for Gzip { fn compress(&self, data: &[u8]) -> Vec<u8> { /* ... */ Vec::new() } }
impl Compressor for Lz4  { fn compress(&self, data: &[u8]) -> Vec<u8> { /* ... */ Vec::new() } }

pub fn archive<C: Compressor>(compressor: &C, files: &[File]) -> Vec<u8> {
    let mut out = Vec::new();
    for f in files { out.extend(compressor.compress(&f.data)); }
    out
}
```

Static dispatch via generics, or dynamic via `Box<dyn Compressor>`.

## 5. Visitor Pattern

For traversing heterogeneous structures:

```rust
pub trait Visitor {
    fn visit_string(&mut self, s: &str);
    fn visit_number(&mut self, n: f64);
    fn visit_array(&mut self, elems: &[Value]);
}

pub enum Value { Str(String), Num(f64), Arr(Vec<Value>) }

impl Value {
    pub fn accept(&self, v: &mut impl Visitor) {
        match self {
            Value::Str(s) => v.visit_string(s),
            Value::Num(n) => v.visit_number(*n),
            Value::Arr(a) => v.visit_array(a),
        }
    }
}
```

Common in `serde` deserializers and AST traversal.

## 6. Command Pattern

```rust
pub trait Command { fn execute(&self, ctx: &mut Context); }

pub struct Save { pub path: String }
impl Command for Save { fn execute(&self, ctx: &mut Context) { /* ... */ } }

pub struct Print { pub text: String }
impl Command for Print { fn execute(&self, ctx: &mut Context) { /* ... */ } }

let cmds: Vec<Box<dyn Command>> = vec![
    Box::new(Save { path: "x".into() }),
    Box::new(Print { text: "hi".into() }),
];
for c in cmds { c.execute(&mut ctx); }
```

## 7. RAII — Resource Acquisition Is Initialization

The most Rust-idiomatic pattern. Resources are tied to types; `Drop` cleans up:

```rust
pub struct File { handle: RawFd }
impl File {
    pub fn open(path: &str) -> std::io::Result<Self> {
        let fd = unsafe { libc::open(...) };
        Ok(File { handle: fd })
    }
}
impl Drop for File {
    fn drop(&mut self) { unsafe { libc::close(self.handle); } }
}
```

No leak, no double-close, no use-after-close — all enforced by the compiler.

## 8. Iterator Pattern

Lazy, composable:

```rust
let v: Vec<i32> = (1..100)
    .filter(|x| x % 2 == 0)
    .map(|x| x * x)
    .take(10)
    .collect();
```

Custom iterators implement `Iterator::next`. `collect` builds any `FromIterator`.

## 9. Smart-Constructor Pattern

```rust
pub struct Percent(u8);
impl Percent {
    pub fn new(p: u8) -> Option<Self> {
        if p <= 100 { Some(Percent(p)) } else { None }
    }
}
```

Never expose the inner; force construction through validation.

## 10. Extension Trait

Add methods to external types (with a wrapper):

```rust
pub trait StrExt { fn shout(&self) -> String; }
impl StrExt for str { fn shout(&self) -> String { format!("{}!!!", self.to_uppercase()) } }
use crate::StrExt;
"hi".shout();
```

You can't implement an external trait for an external type (orphan rule), but you *can* implement your own trait for any type.

## 11. Handle / RAII Wrapper around Foreign Types

```rust
pub struct Database(*mut bindings::sqlite3);
impl Drop for Database { fn drop(&mut self) { unsafe { bindings::close(self.0) } } }
```

## 12. `From`/`Into` for Conversions

```rust
impl From<RawData> for Processed { fn from(r: RawData) -> Self { /* ... */ } }
let p: Processed = raw.into();
```

Idiomatic conversion path. Implement `From`, never `Into` directly.

## 13. `AsRef`/`AsMut` for Flexible Borrowing

```rust
pub fn open<P: AsRef<Path>>(path: P) { let p = path.as_ref(); /* ... */ }
open("file.txt"); open(Path::new("f")); open(String::from("f"));
```

## 14. Error-Conversion via `?`

```rust
pub fn run() -> Result<(), AppError> {
    let n: i32 = "x".parse()?;     // uses From<ParseIntError> for AppError
    Ok(())
}
```

`thiserror`'s `#[from]` generates the `From` impl automatically.

## 15. Trait Composition via Supertraits

```rust
pub trait Service: Send + Sync + Debug {
    fn call(&self, req: Request) -> Response;
}
```

A supertrait bound requires all subtraits. Implementations must provide all.

## 16. Default Trait for Defaults

```rust
#[derive(Default)]
pub struct Config { pub host: String, pub port: u16 }
let c = Config { port: 8080, ..Default::default() };
```

## 17. Phantom Type Parameters

```rust
pub struct Id<T>(u64, PhantomData<T>);
pub struct User; pub struct Post;
type UserId = Id<User>; type PostId = Id<Post>;
```

Same numeric value, distinct types — prevents mixing IDs.

## 18. CRTP (Disabled in safe Rust)

You can't easily do "compile-time virtual" the way C++ does. The closest is a trait with an associated type for `Self`-like dispatch, or `dyn` for runtime. The typestate pattern covers many use cases.

## 19. Tagged Unions via Enums

The Rust-native "tagged union" — see the Enums chapter.

## 20. Dependency Injection via Traits

```rust
pub trait Clock { fn now(&self) -> Instant; }
pub struct RealClock; impl Clock for RealClock { fn now(&self) -> Instant { Instant::now() } }
pub struct MockClock(Instant); impl Clock for MockClock { fn now(&self) -> Instant { self.0 } }

pub struct Service<C: Clock> { clock: C }
```

Tests inject `MockClock`; production uses `RealClock`. No global mutable state needed.

## 21. Avoid Global Mutable State

Use dependency injection, or `OnceLock` for genuinely global immutable data. Mutable globals are a smell — wrap in `Arc<Mutex<T>>` if needed.

## 22. Use `?` Liberally

Idiomatic error propagation. Avoid deeply nested `match` when `?` works.

## 23. Use Iterators Over Loops

```rust
// Idiomatic
let sum: i32 = v.iter().map(|x| x * 2).sum();

// Less idiomatic
let mut sum = 0;
for x in &v { sum += x * 2; }
```

The iterator form is equally fast (zero-cost) and more declarative.

## 24. Avoid `unwrap` in Public Code

In tests, `unwrap` is fine. In production APIs, use `?`, return `Result`, or `expect("invariant message")` if you really can't fail.

## 25. Documentation Comments

```rust
/// Adds two numbers.
///
/// # Panics
/// Panics if overflow occurs (debug builds).
///
/// # Examples
/// ```
/// use my::add;
/// assert_eq!(add(2, 2), 4);
/// ```
pub fn add(a: i32, b: i32) -> i32 { a + b }
```

- `///` for items, `//!` for crates/modules.
- Sections: `# Panics`, `# Errors`, `# Examples`, `# Safety`, `# Arguments`.

## 26. Naming Conventions

- `snake_case` for functions, variables, modules.
- `CamelCase` for types/traits/enum variants.
- `SCREAMING_SNAKE_CASE` for constants and statics.
- Lifetime params: `'a`, `'b`, `'src`, `'arena`.

## 27. Error vs Option Heuristic

- `Option` for "absent" (looking up a key, optional config).
- `Result` for "operation failed" (parse, IO, network).

## 28. When to Box vs Generic

- Generic: monomorphization is acceptable (caller can static-dispatch).
- `Box<dyn>`: heterogeneous collections, runtime polymorphism, smaller binary.

## 29. `Cow` for Borrowed-or-Owned

```rust
pub fn normalize(s: &str) -> Cow<str> {
    if s.chars().any(|c| c.is_uppercase()) {
        Cow::Owned(s.to_lowercase())
    } else {
        Cow::Borrowed(s)
    }
}
```

Avoids cloning when no transformation is needed.

## 30. Avoid Premature Abstraction

Don't define traits until you have a second implementation. Don't reach for `dyn` until you need runtime polymorphism. Don't introduce generics until you have a second type. "Rule of three" — abstract when you see repetition.

## Common Anti-Patterns

- **Implementing `Deref` for non-smart-pointer types**: misleading. Use explicit methods.
- **Overusing `Box<dyn Trait>`**: kills performance and inlining; prefer generics.
- **`unwrap` everywhere**: panics on edge cases. Use `?`.
- **Returning `String` everywhere**: returns ownership unnecessarily; consider `Cow` or `&'static str`.
- **God objects**: huge structs with all state. Split by responsibility.
- **Inheriting via `Deref` chains**: doesn't work like OOP inheritance; produces confusing method resolution.
- **`unsafe` to silence borrow errors**: the borrow checker is right; restructure.
- **Trait objects for performance-critical code**: vtable dispatch is slow; genericize.
- **`Vec<Vec<T>>` for matrices**: cache-unfriendly; use a flat `Vec<T>` with row-major indexing.
- **Mutable globals**: makes testing and reasoning hard. Inject dependencies.

## Idioms Cheat Sheet

- `if let` over `match` for single-arm.
- `?` over nested `match`.
- `Rc::clone(&rc)` over `rc.clone()` (clarity).
- `.iter()` over `for i in 0..v.len()`.
- `format!` over manual string concatenation.
- `write!`/`writeln!` over `format!` when writing to a buffer.
- `matches!` for one-arm boolean checks.
- `let-else` for early-return validation.
- `Cow` for borrowed-or-owned APIs.

## Summary

Builder for complex construction. Newtype for type safety. Typestate for compile-time state machines. Traits for polymorphism (static via generics, dynamic via `dyn`). RAII for resources. `From`/`AsRef`/`?` for conversions. Iterators over loops. Avoid `unwrap`, globals, and over-abstraction. Document with `///`. Use idiomatic naming and patterns.

Next: Performance, profiling, and optimization.