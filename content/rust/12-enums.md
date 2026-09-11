# 12 — Enums (Algebraic Data Types)

An enum proves at compile time that a value is *exactly one* of a fixed set of shapes. The compiler exploits that twice: illegal states become unrepresentable, and variant payloads overlap in memory.

## Under-the-Hood Mechanics

### Tagged union layout: one discriminant, overlapping payloads

Variants physically overlap in memory — only one is ever live — the same way a C `union` overlaps members, except Rust's tag enforces you can only read the currently-valid variant.

::code-wrapper{language="rust" filename="main.rs"}
```rust
enum Event {
    Tick,                    // no payload
    Resize(u32, u32),        // 8 bytes
    KeyPress(char),          // 4 bytes
    Custom([u8; 24]),        // 24 bytes — the largest variant
}

fn main() {
    // discriminant + max(payload sizes), rounded to alignment —
    // never a guaranteed number, just an upper bound.
    println!("{}", std::mem::size_of::<Event>());
}
```
::

`size_of::<Event>()` is **not specified by the language** — it can change between `rustc` versions for the same definition, so never assume a byte size for `repr(Rust)` in serialization/FFI code:

::code-wrapper{language="rust" filename="main.rs"}
```rust
#[repr(Rust)] // default — size is an implementation detail
enum Fragile { A(u8), B(u64) }

#[repr(C, u8)] // pinned layout — safe to persist/FFI across versions
enum Stable { A(u8), B(u64) }

fn main() {
    println!("{}", std::mem::size_of::<Fragile>()); // may change across rustc versions
    println!("{}", std::mem::size_of::<Stable>());  // documented, C-ABI compatible
}
```
::

### Niche optimization: reusing "impossible" bit patterns to eliminate the tag

When a payload has a bit pattern that can never legally occur, the compiler encodes the variant tag in that pattern instead of a separate byte:

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn main() {
    assert_eq!(std::mem::size_of::<&i32>(), 8);
    assert_eq!(std::mem::size_of::<Option<&i32>>(), 8); // None == null, no extra byte

    assert_eq!(std::mem::size_of::<std::num::NonZeroU32>(), 4);
    assert_eq!(std::mem::size_of::<Option<std::num::NonZeroU32>>(), 4); // niche-optimized

    // f64 has no invalid bit pattern to steal — every pattern is a
    // valid float or NaN — so Option<f64> needs a real tag.
    assert_eq!(std::mem::size_of::<f64>(), 8);
    assert_eq!(std::mem::size_of::<Option<f64>>(), 16); // NOT niche-optimized
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn main() {
    // Niches can chain through nested enums — but don't rely on this
    // without checking; it's compiler-version-dependent.
    assert_eq!(std::mem::size_of::<Option<Option<&i32>>>(), 8); // often still niche-optimized

    // bool only uses 2 of 256 byte values — the other 254 are spare niches.
    assert_eq!(std::mem::size_of::<bool>(), 1);
    assert_eq!(std::mem::size_of::<Option<bool>>(), 1); // niche-optimized
}
```
::

### `match` codegen: jump tables vs. comparison chains

::code-wrapper{language="rust" filename="main.rs"}
```rust
enum Op { Add, Sub, Mul, Div } // dense discriminants, no guards

fn dispatch_fast(op: &Op, a: i64, b: i64) -> i64 {
    match op { // compiles to a jump table — O(1), indexed by discriminant
        Op::Add => a + b,
        Op::Sub => a - b,
        Op::Mul => a * b,
        Op::Div => a / b,
    }
}

fn dispatch_slow(op: &Op, a: i64, b: i64) -> i64 {
    match op {
        Op::Add if a > 0 => a + b,      // guard present
        Op::Add => a + b,
        Op::Sub => a - b,
        Op::Mul => a * b,
        Op::Div => a / b,               // degrades to an if/else-if chain, O(n)
    }
}
```
::

## Cost, Performance, and Trade-Offs

**Niche optimization beats sentinel values, unconditionally:**

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct RowSentinel { parent_id: i32 } // -1 means "no parent" — a lie the type allows
struct RowSafe { parent_id: Option<std::num::NonZeroU32> } // same size, no lie possible

fn main() {
    assert_eq!(std::mem::size_of::<i32>(), 4);
    assert_eq!(std::mem::size_of::<Option<std::num::NonZeroU32>>(), 4); // identical cost
    // RowSafe rejects parent_id == 0 by construction; RowSentinel does not.
}
```
::

**Enum size is dominated by the largest variant:**

::code-wrapper{language="rust" filename="main.rs"}
```rust
enum EventBad {
    Tick,                 // wants to be 1 byte...
    Custom([u8; 256]),    // ...but this forces every Tick to reserve 256+ bytes too
}

enum EventGood {
    Tick,
    Custom(Box<[u8; 256]>), // heap-allocated; enum footprint shrinks to a pointer
}

fn main() {
    assert!(std::mem::size_of::<EventBad>() > 256);
    assert!(std::mem::size_of::<EventGood>() <= 16); // pointer + tag, niche-optimized
}
```
::

**Recursive indirection: `Box` vs `Rc`/`Arc`:**

::code-wrapper{language="rust" filename="main.rs"}
```rust
enum TreeOwned<T> {
    Leaf(T),
    Node(Box<TreeOwned<T>>, Box<TreeOwned<T>>), // single owner, cheap move
}

enum TreeShared<T> {
    Leaf(T),
    Node(std::rc::Rc<TreeShared<T>>, std::rc::Rc<TreeShared<T>>), // subtrees can be shared
    // Rc adds refcount overhead; using Box here would force .clone() deep-copies
    // anywhere the same subtree needs two parents.
}
```
::

**Monomorphization cost of many `Result<T, E>` instantiations:**

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Each distinct (T, E) pair generates its own Result machinery + Debug/?-glue.
fn parse_a() -> Result<u32, std::num::ParseIntError> { "1".parse() }
fn parse_b() -> Result<f64, std::num::ParseFloatError> { "1.0".parse() }
fn parse_c() -> Result<u32, String> { Err("bad".into()) }
// 3 distinct instantiations compiled, even though the shape is identical —
// consolidate error types at module boundaries to cap this (see Error Handling chapter).
```
::

## Production Failure Modes & Anti-Patterns

### Anti-pattern: reimplementing a sum type as a struct-plus-tag

::code-wrapper{language="rust" filename="main.rs"}
```rust
// WRONG: nothing stops bank_account from also being Some(_) when kind == 0
struct PaymentMethodNaive {
    kind: u8, // 0 = card, 1 = bank_transfer, 2 = wallet
    card_number: Option<String>,
    bank_account: Option<String>,
    wallet_id: Option<String>,
}

fn charge_naive(pm: &PaymentMethodNaive) {
    match pm.kind {
        0 => { /* trusts card_number is Some — nothing enforces it */ }
        1 => { /* trusts bank_account is Some */ }
        2 => { /* trusts wallet_id is Some */ }
        _ => panic!("unknown kind"), // reachable: kind is just a u8, not 0..=2
    }
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// RIGHT: illegal combinations are unrepresentable
enum PaymentMethod {
    Card { number: String, expiry: String },
    BankTransfer { account: String, routing: String },
    Wallet { id: String },
}

fn charge(pm: &PaymentMethod) {
    match pm {
        PaymentMethod::Card { number, expiry } => { /* only these fields exist */ }
        PaymentMethod::BankTransfer { account, routing } => { /* ... */ }
        PaymentMethod::Wallet { id } => { /* ... */ }
        // no catch-all — adding a 4th variant makes every match site a
        // compile error until updated, instead of a silent runtime gap
    }
}
```
::

### Anti-pattern: recursive enums — compile-time size vs. runtime stack depth

::code-wrapper{language="rust" filename="main.rs"}
```rust
enum JsonNaive {
    Null,
    Bool(bool),
    Number(f64),
    // Pair(JsonNaive, JsonNaive), // ERROR: infinite size — caught immediately
    // Array(Vec<JsonNaive>) would compile fine — Vec already indirects.
}
```
::

Direct self-nesting is caught at compile time. The dangerous version compiles fine but blows the stack on untrusted input:

::code-wrapper{language="rust" filename="main.rs"}
```rust
enum Json {
    Null,
    Bool(bool),
    Number(f64),
    Array(Vec<Json>),
    Object(Vec<(String, Json)>),
}

impl Json {
    // WRONG for untrusted input: 100,000 nested arrays -> stack overflow,
    // and the auto-generated recursive Drop for Json hits the same wall.
    fn depth_naive(&self) -> usize {
        match self {
            Json::Array(items) => 1 + items.iter().map(Json::depth_naive).max().unwrap_or(0),
            Json::Object(fields) => 1 + fields.iter().map(|(_, v)| v.depth_naive()).max().unwrap_or(0),
            _ => 0,
        }
    }
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
impl Json {
    // RIGHT: explicit, enforced depth limit at traversal/parse time
    fn depth_bounded(&self, limit: usize) -> Result<usize, &'static str> {
        fn go(v: &Json, remaining: usize) -> Result<usize, &'static str> {
            if remaining == 0 {
                return Err("max nesting depth exceeded");
            }
            match v {
                Json::Array(items) => items.iter()
                    .map(|i| go(i, remaining - 1))
                    .try_fold(0, |acc, r| r.map(|d| acc.max(1 + d))),
                Json::Object(fields) => fields.iter()
                    .map(|(_, v)| go(v, remaining - 1))
                    .try_fold(0, |acc, r| r.map(|d| acc.max(1 + d))),
                _ => Ok(0),
            }
        }
        go(self, limit)
    }
}
```
::

### Anti-pattern: `#[non_exhaustive]` swallowed by a silent wildcard

::code-wrapper{language="rust" filename="main.rs"}
```rust
// dependency: #[non_exhaustive] pub enum Event { Login, Logout }

// WRONG: compiles, but a future Event::SessionExpired vanishes silently
fn handle_lazy(e: some_crate::Event) {
    match e {
        some_crate::Event::Login => { /* ... */ }
        some_crate::Event::Logout => { /* ... */ }
        _ => {} // "just in case" — swallows every future variant forever
    }
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// RIGHT: the wildcard is loud, so an unhandled variant shows up in monitoring
fn handle_right(e: some_crate::Event) {
    match e {
        some_crate::Event::Login => { /* ... */ }
        some_crate::Event::Logout => { /* ... */ }
        other => eprintln!("unhandled event variant: {other:?}"),
    }
}
```
::

## Architectural Application

**State machines** — every variant carries exactly the data valid for that state:

::code-wrapper{language="rust" filename="main.rs"}
```rust
enum Connection {
    Idle,
    Connected { socket_fd: i32, session_id: u64 },
    Error { code: u32, message: String },
}

fn send(conn: &Connection, data: &[u8]) -> Result<(), &'static str> {
    match conn {
        Connection::Connected { socket_fd, .. } => { let _ = (socket_fd, data); Ok(()) }
        Connection::Idle => Err("not connected"),
        Connection::Error { message, .. } => Err(message.as_str()),
        // compiler rejects any code path that reads socket_fd outside Connected
    }
}
```
::

**Error consolidation at module boundaries:**

::code-wrapper{language="rust" filename="main.rs"}
```rust
enum StoreError {
    NotFound,
    Io(std::io::Error),
    Parse(std::num::ParseIntError),
}

impl From<std::io::Error> for StoreError {
    fn from(e: std::io::Error) -> Self { StoreError::Io(e) }
}
impl From<std::num::ParseIntError> for StoreError {
    fn from(e: std::num::ParseIntError) -> Self { StoreError::Parse(e) }
}

// callers only ever match StoreError, never the dozen low-level error types
// each `?` internally converts via From — the public API absorbs the proliferation
fn load(path: &str) -> Result<u32, StoreError> {
    let text = std::fs::read_to_string(path)?; // io::Error -> StoreError via From
    Ok(text.trim().parse()?)                    // ParseIntError -> StoreError via From
}
```
::

**Wire format: pin discriminants explicitly:**

::code-wrapper{language="rust" filename="main.rs"}
```rust
#[repr(u8)]
enum OpBad { Read, Write, Delete } // implicit 0,1,2 — reordering variants breaks the wire format

#[repr(u8)]
enum OpGood { Read = 1, Write = 2, Delete = 3 } // explicit — safe to reorder in source later
```
::

## 💡 Tips & Tricks

- **Idiom**: `#[default]` on a unit variant instead of hand-written `impl Default`.
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  #[derive(Default)]
  enum LogLevel { Debug, #[default] Info, Warn, Error }
  ```
  ::
- **Debug**: compare "same variant" without requiring `PartialEq` on the payload.
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  use std::mem::discriminant;
  fn main() {
      let a = Some(vec![1, 2]);
      let b = Some(vec![9]);
      assert_eq!(discriminant(&a), discriminant(&b)); // both Some, payloads ignored
  }
  ```
  ::
- **Performance**: prefer niche-friendly types over sentinels — see the Cost section above; it's free, not a trade-off.
- **Idiom**: `matches!` beats a manual boolean `match`.
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  fn is_err_variant(r: &Result<i32, String>) -> bool {
      matches!(r, Err(_)) // clearer than `if let Err(_) = r { true } else { false }`
  }
  ```
  ::
- **Performance**: verify jump-table codegen with `cargo asm` / Compiler Explorer in hot loops — don't assume from how the code "looks."
- **Idiom**: `transpose()` flips nested `Option`/`Result` without a manual `match`.
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  fn main() {
      let x: Result<Option<i32>, &str> = Ok(Some(5));
      let y: Option<Result<i32, &str>> = x.transpose();
      assert_eq!(y, Some(Ok(5)));
  }
  ```
  ::

## ⚠️ Edge Cases & Gotchas

- **Infinite size, caught immediately**:
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  enum Bad { Node(Bad) } // ERROR: recursive type has infinite size
  ```
  ::
  Indirection fixes compile-time size only — bound depth explicitly for untrusted recursive input (see above).
- **Variant equality needs `T: PartialEq`**:
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  #[derive(PartialEq)]
  enum Holds<T> { Value(T) } // derive fails if T can't derive PartialEq (e.g. dyn Trait payload)
  ```
  ::
- **`Copy` requires every variant, every payload, to be `Copy`**:
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  #[derive(Clone, Copy)]
  enum Mixed { Num(i32), Text(String) } // ERROR: String disqualifies the whole enum
  ```
  ::
- **No implicit `Default` for enums** — mark exactly one unit variant:
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  #[derive(Default)]
  enum State { #[default] Idle, Running } // required — no "all zero bits" default exists
  ```
  ::
- **`#[repr(C)]` discriminant width is not pinned unless you say so**:
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  #[repr(C)]      // discriminant width depends on largest value — fragile across FFI
  enum OpA { Read, Write }
  #[repr(C, u8)]  // pinned — safe across FFI/ABI boundary
  enum OpB { Read, Write }
  ```
  ::
- **Derived `Ord` follows declaration order, not payload alone**:
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  #[derive(PartialEq, Eq, PartialOrd, Ord)]
  enum Priority { Low, Medium, High } // Low < Medium < High — reordering variants flips this silently
  ```
  ::
- **`size_of` on `repr(Rust)` can change between compiler versions** — never persist an assumed byte size without `#[repr(C, ...)]`.

## 🧠 Spot the Bug

Will this compile, and what's the size of `Shape` vs `ShapeWithTag`?

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

Both compile; `ShapeWithTag` is roughly double the size of `Shape`.

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn main() {
    // Shape: one discriminant + space for the largest payload (f64, 8 bytes) —
    // Circle and Square payloads share the same memory, never both live.
    assert!(std::mem::size_of::<Shape>() <= 16);

    // ShapeWithTag stores BOTH Option<f64> fields simultaneously, and neither
    // niche-optimizes (f64 has no spare bit pattern) — each needs its own
    // discriminant byte + 8 bytes, padded. Both exist even though `tag`
    // means only one is ever logically meaningful.
    assert!(std::mem::size_of::<ShapeWithTag>() >= 24);
}
```
::

The struct-plus-tag pattern pays for every payload at once and reintroduces "state the type allows but the domain forbids" — `circle_radius` and `square_side` can both be `Some` simultaneously, a bug `Shape`'s `match` structurally prevents.

</details>

## Summary

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Tagged union: one discriminant + largest-variant space, payloads overlap.
enum Compact { A, B([u8; 32]) } // sizeof ~= 33, not sizeof(A) + sizeof(B)

// Niche optimization: free Option over non-nullable types.
assert_eq!(std::mem::size_of::<Option<&i32>>(), std::mem::size_of::<&i32>());

// Oversized rare variant -> Box it.
enum Fixed { Small, Big(Box<[u8; 256]>) }

// Recursive enums: Box/Vec for compile-time size, explicit depth limit for
// runtime safety against untrusted input.

// #[non_exhaustive] wildcard arms must be loud (log/metric), never `_ => {}`.
```
::

- Enums overlap variant payloads in memory — not "a struct with extra `Option` fields and a tag."
- Niche optimization makes `Option<T>` free over non-nullable `T` — never use sentinel values instead.
- `Box` the rare oversized variant; bound recursion depth explicitly for untrusted input.
- Dense guard-free `match` compiles to a jump table; `#[non_exhaustive]` only has teeth if the wildcard arm is observable.
- Enums are the correct default for state machines and layered error types — exhaustiveness turns "forgot a case" into a compile error.

Next: Pattern Matching — the deep dive into how `match`, binding modes, and exhaustiveness actually work under the hood.
