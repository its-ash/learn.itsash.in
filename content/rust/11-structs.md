# 11 — Structs

A struct's layout decision determines cache behavior, FFI compatibility, binary size, and refactor blast radius. This chapter treats structs as a memory layout decision with a type-safety veneer.

## Under-the-Hood Mechanics

### Default layout is unspecified — and that's the point

`#[repr(Rust)]` (the default) lets the compiler reorder fields to minimize padding:

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Naive {
    a: u8,   // 1 byte
    b: u64,  // 8 bytes, needs 8-byte alignment
    c: u8,   // 1 byte
}

fn main() {
    // C-style mental model (declaration order, padded individually) predicts 24 bytes.
    // repr(Rust) reorders to b, then a+c packed together -> 16 bytes.
    assert_eq!(std::mem::size_of::<Naive>(), 16);
    assert_eq!(std::mem::align_of::<Naive>(), 8);
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Field declaration order never implies memory order under repr(Rust).
struct Reordered1 { a: u8, b: u64, c: u8 }
struct Reordered2 { b: u64, a: u8, c: u8 }

fn main() {
    // Same fields, different declaration order -> compiler is free to produce
    // the same layout either way. Never assume order == memory order.
    assert_eq!(std::mem::size_of::<Reordered1>(), std::mem::size_of::<Reordered2>());
}
```
::

### `#[repr(C)]`, `#[repr(transparent)]`, `#[repr(packed)]`

::code-wrapper{language="rust" filename="main.rs"}
```rust
#[repr(C)]
struct CCompatible { a: u8, b: u64, c: u8 } // 24 bytes — declaration order preserved, no reordering

#[repr(transparent)]
struct Meters(f64); // ABI-identical to f64; free to pass across FFI as a raw double

#[repr(packed)]
struct Packed { a: u8, b: u64 } // 9 bytes — no padding, but b is now unaligned

fn main() {
    assert_eq!(std::mem::size_of::<CCompatible>(), 24);
    assert_eq!(std::mem::size_of::<Meters>(), 8);
    assert_eq!(std::mem::size_of::<Packed>(), 9);
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
#[repr(packed)]
struct Packed { a: u8, b: u64 }

fn main() {
    let p = Packed { a: 1, b: 2 };
    // let r: &u64 = &p.b; // compile error: reference to unaligned packed field
    let val = { p.b }; // must copy out by value, not reference
    println!("{val}");
}
```
::

- `#[repr(C)]`: mandatory for any struct crossing an FFI boundary — `repr(Rust)` layout is not stable across compiler versions, so `transmute`-ing it into C is UB.
- `#[repr(transparent)]`: single-field newtype gets exactly the inner type's ABI — free to hand to C code expecting a raw `f64`.
- `#[repr(packed)]`: shrinks size but produces unaligned fields — reading them by reference is a compile error; reading by value forces a copy, since unaligned loads can UB or fault on some architectures.

### Auto-ref/deref: compile-time-only, zero call overhead

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Counter { n: u32 }
impl Counter {
    fn get(&self) -> u32 { self.n }
}

fn main() {
    let c = Counter { n: 5 };
    let boxed = Box::new(Counter { n: 9 });

    c.get();       // sugar for Counter::get(&c)
    boxed.get();   // sugar for Counter::get(&*boxed) — auto-deref through Box, resolved at compile time
}
```
::

This is unrelated to `dyn Trait` vtable dispatch (a genuine runtime cost, covered in the Traits chapter) — conflating the two is a common interview mistake.

### Zero-sized types (ZSTs) are load-bearing, not a curiosity

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Marker;

fn main() {
    assert_eq!(std::mem::size_of::<Marker>(), 0);

    let v: Vec<Marker> = vec![Marker, Marker, Marker];
    assert_eq!(v.len(), 3);
    // No heap allocation occurred for these three "instances" — Vec<ZST> just tracks length.
    assert_eq!(v.capacity(), usize::MAX);
}
```
::

## Cost, Performance, and Trade-Offs

**Layout freedom vs. ABI stability** — packing is free, but you lose any cross-build layout guarantee:

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Wire { a: u8, b: u64 }

fn unsound(w: &Wire) -> [u8; 16] {
    unsafe { std::mem::transmute_copy(w) } // WRONG: repr(Rust) layout isn't guaranteed across builds
}
```
::

**Derives generate real code per monomorphization** — not free:

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Deriving Debug/Clone on a type instantiated across many generic contexts
// generates a full impl per concrete type — not deduplicated across types.
#[derive(Debug, Clone)]
struct Wrapper<T> { value: T }

fn main() {
    let _a = Wrapper { value: 1u32 };
    let _b = Wrapper { value: "s" };
    let _c = Wrapper { value: 3.14f64 };
    // Three separate Debug + Clone impls compiled, even though none may ever be printed/cloned.
}
```
::

**Builder pattern costs moves + `Option` branching per field**:

::code-wrapper{language="rust" filename="main.rs"}
```rust
#[derive(Default)]
struct ConfigBuilder { host: Option<String>, port: Option<u16> }

impl ConfigBuilder {
    fn host(mut self, h: impl Into<String>) -> Self { self.host = Some(h.into()); self }
    fn port(mut self, p: u16) -> Self { self.port = Some(p); self }
    fn build(self) -> Config {
        Config { host: self.host.unwrap_or_else(|| "localhost".into()), port: self.port.unwrap_or(8080) }
    }
}
struct Config { host: String, port: u16 }

fn main() {
    // Fine for infrequent, config-shaped construction...
    let _cfg = ConfigBuilder::default().host("example.com").port(443).build();
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Config2 { host: String, port: u16 }

fn hot_path_construct() -> Config2 {
    // ...but for thousands-per-second hot construction, a plain literal skips
    // the Option wrapping and unwrap branching entirely.
    Config2 { host: "localhost".into(), port: 8080 }
}
```
::

**`#[repr(packed)]`**: memory savings traded for unaligned-access cost — "merely slower" on x86, can fault on ARM. Reserve for proven, measured constraints (embedded, wire formats) — never as a default.

## Production Failure Modes & Anti-Patterns

### Anti-pattern: `#[repr(Rust)]` struct sent across FFI/process boundary

::code-wrapper{language="rust" filename="main.rs"}
```rust
// WRONG — layout is compiler-version-dependent, not a wire contract
struct Header { version: u8, flags: u16, length: u32 }

fn serialize_wrong(h: &Header) -> [u8; 7] {
    unsafe { std::mem::transmute_copy(h) } // UB: assumes a layout repr(Rust) never promises
}
```
::

This is self-consistent within one binary and silently breaks the moment sender/receiver are compiled by different `rustc` versions or optimization levels — a real incident class: a recompile on one side of a wire protocol corrupts cross-version messages without necessarily crashing.

::code-wrapper{language="rust" filename="main.rs"}
```rust
#[repr(C)]
struct Header { version: u8, flags: u16, length: u32 }

fn serialize_right(h: &Header) -> Vec<u8> {
    // Field-by-field, not even a transmute of the repr(C) struct itself —
    // repr(C) still has padding bytes that are uninitialized memory.
    let mut buf = Vec::with_capacity(7);
    buf.push(h.version);
    buf.extend_from_slice(&h.flags.to_le_bytes());
    buf.extend_from_slice(&h.length.to_le_bytes());
    buf
}

fn deserialize(buf: &[u8]) -> Header {
    Header {
        version: buf[0],
        flags: u16::from_le_bytes([buf[1], buf[2]]),
        length: u32::from_le_bytes([buf[3], buf[4], buf[5], buf[6]]),
    }
}
```
::

### Anti-pattern: reflexive `#[derive(Clone, Debug)]` on sensitive/expensive fields

::code-wrapper{language="rust" filename="main.rs"}
```rust
// WRONG: blanket-derive "just in case"
#[derive(Debug, Clone)]
struct Session {
    user_id: u64,
    auth_token: String,          // secret — now printed by any {:?} log line
    request_cache: Vec<Vec<u8>>, // potentially megabytes — now deep-cloned everywhere
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Session {
    user_id: u64,
    auth_token: String,
    request_cache: Vec<Vec<u8>>,
}

impl std::fmt::Debug for Session {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        f.debug_struct("Session")
            .field("user_id", &self.user_id)
            .field("auth_token", &"[REDACTED]")
            .field("request_cache", &format!("<{} entries>", self.request_cache.len()))
            .finish()
    }
}
// No Clone impl — force callers to be explicit (Arc<Session>, or a named
// .clone_for_retry()) rather than reflexively cloning to dodge a borrow error.
```
::

`Debug` leaking secrets into log aggregators, and `Clone` silently deep-copying large buffers under load, are both real, hard-to-trace production regressions — not hypothetical.

### Anti-pattern: over-privileged receiver type

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Inventory { items: Vec<String>, total_weight: f64 }

impl Inventory {
    // WRONG: &mut self "just in case," but nothing here actually needs mutation
    fn heaviest_summary_wrong(&mut self) -> &String {
        let last = self.items.last().unwrap();
        self.total_weight += 0.0; // vestigial mutation, forces exclusive borrow on every caller
        last
    }

    // RIGHT: least-privileged receiver
    fn heaviest_summary(&self) -> &String {
        self.items.last().unwrap()
    }
}
```
::

Receiver type is part of the struct's public contract — default to `&self`, widen only when a real mutation demands it.

## Architectural Application

**Newtype pattern — zero-cost domain boundary:**

::code-wrapper{language="rust" filename="main.rs"}
```rust
#[repr(transparent)]
struct UserId(u64);
#[repr(transparent)]
struct OrderId(u64);

fn charge(user: UserId, order: OrderId) { /* ... */ }

fn main() {
    let user = UserId(42);
    let order = OrderId(42);
    charge(user, order);
    // charge(order, user); // compile error — swapped IDs are now unrepresentable
}
```
::

**`#[non_exhaustive]` — versioning contract:**

::code-wrapper{language="rust" filename="main.rs"}
```rust
#[non_exhaustive]
pub struct ApiResponse {
    pub status: u16,
    pub body: String,
}

impl ApiResponse {
    pub fn new(status: u16, body: String) -> Self {
        Self { status, body } // external crates must go through this constructor
    }
}

// Downstream crate:
fn handle(r: ApiResponse) {
    match r.status {
        200 => {}
        _ => {} // wildcard arm required — adding a field later stays non-breaking
    }
}
```
::

**Typestate via `PhantomData` — compile-time-enforced protocol:**

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::marker::PhantomData;

struct Unconfigured;
struct Configured;

struct Connection<State = Unconfigured> {
    host: Option<String>,
    _state: PhantomData<State>,
}

impl Connection<Unconfigured> {
    fn new() -> Self { Self { host: None, _state: PhantomData } }
    fn host(self, h: &str) -> Connection<Configured> {
        Connection { host: Some(h.to_string()), _state: PhantomData }
    }
}

impl Connection<Configured> {
    fn send(&self) { println!("sending to {}", self.host.as_ref().unwrap()); }
}

fn main() {
    let conn = Connection::new().host("example.com");
    conn.send();
    // Connection::new().send(); // compile error: send() doesn't exist on Connection<Unconfigured>
}
```
::

## 💡 Tips & Tricks

- **Debug**:
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  #[derive(Debug)]
  struct Nested { a: u8, b: Vec<u8>, c: Option<String> }

  fn main() {
      let n = Nested { a: 1, b: vec![1, 2, 3], c: Some("x".into()) };
      println!("{:?}", n);   // compact — hard to scan past 2-3 fields
      println!("{:#?}", n);  // pretty-printed — flip to this once nesting grows
  }
  ```
  ::
- **Idiom**: field-init shorthand makes renames visible everywhere.
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  struct User { email: String, username: String }
  fn make(email: String, username: String) -> User {
      User { email, username } // renaming `email` breaks this line at compile time, not silently
  }
  ```
  ::
- **Performance**: don't hand-order fields by size — the compiler already does it under `repr(Rust)`. Only reach for `#[repr(C)]` when FFI/wire format demands a fixed layout.
- **Idiom**: tuple structs for lightweight wrappers, named fields once there's more than one value.
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  struct Meters(f64);          // fine: single value, `.0` is unambiguous
  struct Point { x: f64, y: f64 } // once there's 2+, positional access gets unreadable
  ```
  ::
- **Debug**: assert layout assumptions in a test, not a scratch `main`, so CI catches accidental size regressions.
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  struct Packet { id: u32, kind: u8 }

  #[test]
  fn layout_is_stable() {
      assert_eq!(std::mem::size_of::<Packet>(), 8);
  }
  ```
  ::
- **Clippy**: `field_reassign_with_default` catches the two-step pattern.
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  #[derive(Default)]
  struct Config { port: u16 }

  fn main() {
      let mut c = Config::default();
      c.port = 8080; // flagged
      let _c2 = Config { port: 8080, ..Default::default() }; // suggested fix
  }
  ```
  ::

## ⚠️ Edge Cases & Gotchas

- **Out-of-order init is legal, order is meaningless in memory**:
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  struct P { x: i32, y: i32 }
  fn main() {
      let p = P { y: 2, x: 1 }; // fine — literal order doesn't need to match declaration order
      println!("{} {}", p.x, p.y);
  }
  ```
  ::
- **Mutability is per-binding, not per-field** — no `mut` field modifier:
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  use std::cell::Cell;
  struct Counter { n: Cell<u32> } // interior mutability for one field without `let mut counter`
  fn bump(c: &Counter) { c.n.set(c.n.get() + 1); }
  ```
  ::
- **No inheritance** — compose and delegate via traits, not a "base struct" field copied by convention.
- **`#[non_exhaustive]` is a one-way door** — cannot retrofit onto an already-published type without a breaking change.
- **Self-referential structs aren't expressible in safe Rust** — use `ouroboros`/`self_cell`, or store an index instead of a reference.
- **ZST collections don't allocate**:
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  struct Marker;
  fn main() {
      let v = vec![Marker; 1_000_000];
      assert_eq!(std::mem::size_of_val(&v[..]), 0); // a million ZSTs, zero heap bytes
  }
  ```
  ::
- **Drop order is declaration order**, not reverse (unlike stack locals):
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  struct Loud(&'static str);
  impl Drop for Loud {
      fn drop(&mut self) { println!("dropping {}", self.0); }
  }
  struct Pair { first: Loud, second: Loud }
  fn main() {
      let _p = Pair { first: Loud("first"), second: Loud("second") };
      // prints "dropping first" then "dropping second" — declaration order, not reverse
  }
  ```
  ::
- **Packed struct field references are a compile error**, not just discouraged:
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  #[repr(packed)]
  struct Packed { a: u8, b: u32 }
  fn main() {
      let p = Packed { a: 1, b: 2 };
      // let r = &p.b; // compile error: reference to unaligned field
      let v = { p.b }; // must copy by value via a block
      println!("{v}");
  }
  ```
  ::

## 🧠 Spot the Bug

Will this compile, and if so, what's the size of `Shape` compared to `ShapeWithTag`?

::code-wrapper{language="rust" filename="main.rs"}
```rust
enum Shape {
    Circle(f64),
    Square(f64),
}

struct ShapeWithTag {
    tag: u8,
    circle_radius: Option<f64>,
    square_side: Option<f64>,
}

fn main() {
    println!("{}", std::mem::size_of::<Shape>());
    println!("{}", std::mem::size_of::<ShapeWithTag>());
}
```
::

<details>
<summary>Answer</summary>

Both compile; `ShapeWithTag` is roughly double `Shape`'s size.

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn main() {
    // Shape: one discriminant + space for the largest variant's payload (f64) —
    // variants overlap in memory, never coexist.
    assert_eq!(std::mem::size_of::<Shape>(), 16); // discriminant + f64, padded

    // ShapeWithTag: circle_radius and square_side are separate fields that both
    // exist simultaneously, each independently sized (Option<f64> needs its own
    // discriminant since every f64 bit pattern is valid — no niche optimization).
    assert_eq!(std::mem::size_of::<ShapeWithTag>(), 24);
}
```
::

A hand-rolled "tagged struct" (struct + tag + one `Option<T>` per variant) pays for every variant's payload at once. Rust's actual `enum` only pays for the active one — struct fields can never overlap in memory the way enum variants can.

</details>

## Summary

::code-wrapper{language="rust" filename="main.rs"}
```rust
// repr(Rust): compiler reorders fields, saves memory, no cross-build layout guarantee.
struct A { a: u8, b: u64, c: u8 } // 16 bytes, not 24

// repr(C)/repr(transparent): restore a stable layout for FFI/wire formats.
#[repr(C)] struct B { a: u8, b: u64, c: u8 } // 24 bytes, stable

// Derives cost real code per monomorphization — opt in per trait, per struct.
#[derive(Debug)] struct C { x: u32 } // fine, only if actually printed

// Receiver type is a design decision: least-privileged by default.
impl C { fn read(&self) -> u32 { self.x } }
```
::

- Default layout optimizes memory; `#[repr(...)]` trades that back for stability where FFI/wire formats require it.
- Treat every derive as deliberate — especially `Debug`/`Clone` on secrets or large buffers.
- `&self` vs `&mut self` is an aliasing contract, not an implementation detail.
- Newtype, `#[non_exhaustive]`, and typestate-via-`PhantomData` are zero-cost tools for domain safety, API evolution, and protocol correctness — apply at boundaries, not everywhere.

Next: Enums — Rust's algebraic data types, and how variant payload overlap makes them the more memory-efficient sibling to a struct-plus-tag.
