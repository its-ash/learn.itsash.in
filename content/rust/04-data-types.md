# 04 — Data Types

Every type here has a memory layout with consequences for cache behavior, struct size, FFI compatibility, and where silent data loss hides. Treat types as layout facts measurable with `std::mem::size_of`, not syntax to memorize.

## Under-the-Hood Mechanics

### Integer layout and the overflow contract

| Type | Bits | Notes |
|---|---|---|
| `i8`/`u8` … `i128`/`u128` | 8–128 | two's-complement signed, plain binary unsigned |
| `isize`/`usize` | pointer-width | **platform-dependent**: 32 bits on `wasm32`, 64 on most servers |

::code-wrapper{language="rust"}
```rust
fn main() {
    let (val, ovf) = 255u8.overflowing_add(1); // (0, true)
    let safe = 255u8.checked_add(1);          // None
    let sat = 255u8.saturating_add(1);        // 255
    let wrap = 255u8.wrapping_add(1);         // 0
    println!("{val} {ovf} {safe:?} {sat} {wrap}");
}
```
::

::code-wrapper{language="rust"}
```rust
fn main() {
    let x: u8 = 200;
    let y: u8 = 100;
    // let z = x + y;      // debug: PANICS "attempt to add with overflow"
    // release build:      SILENTLY wraps to 44 — same source, different behavior by profile
}
```
::

### Floats are IEEE 754, and `PartialOrd` (not `Ord`) is a direct consequence

::code-wrapper{language="rust"}
```rust
fn main() {
    let nan = f64::NAN;
    assert_eq!(nan == nan, false);              // NaN != NaN — IEEE 754, not a Rust choice
    assert_eq!(-0.0_f64 == 0.0_f64, true);       // -0.0 == 0.0
    assert_eq!(nan.partial_cmp(&nan), None);     // unordered — why floats impl PartialOrd, not Ord

    let mut v = vec![3.0, f64::NAN, 1.0];
    v.sort_by(f64::total_cmp);                    // total_cmp: arbitrary-but-total order, NaN included
    println!("{v:?}");
}
```
::

### `char` is 4 bytes, always — a Unicode fact, not a Rust choice

::code-wrapper{language="rust"}
```rust
fn main() {
    let c = 'z';
    let emoji = '🦀';
    assert_eq!(std::mem::size_of::<char>(), 4);        // ALWAYS 4 bytes, even for 'z'

    let ascii = "hello";                                // 1 byte/char on the wire (&str, UTF-8)
    let chars: Vec<char> = ascii.chars().collect();      // 4 bytes/char once collected — 4x memory
    assert_eq!(ascii.len(), 5);
    assert_eq!(std::mem::size_of_val(chars.as_slice()), 20);

    // s[0] doesn't compile — byte offsets don't correspond to char boundaries in multi-byte UTF-8.
    let s = "héllo";
    // let first = s[0];      // ERROR: `String`/`str` cannot be indexed by an integer
    let first = s.chars().next().unwrap();
    println!("{c} {emoji} {first}");
}
```
::

### Compound layout: tuples, arrays, and the niche/padding story

::code-wrapper{language="rust"}
```rust
fn main() {
    let t: (i32, f64, &str) = (1, 2.0, "three");   // repr(Rust): compiler may REORDER fields
    let arr: [i32; 3] = [1, 2, 3];                  // homogeneous, contiguous, zero per-element overhead

    assert_eq!(std::mem::size_of::<()>(), 0);            // unit — zero-sized
    assert_eq!(std::mem::size_of::<[i32; 3]>(), 12);      // no padding, no overhead
    assert_eq!(arr.len(), 3);                              // compile-time constant, part of the TYPE
}
```
::

::code-wrapper{language="rust"}
```rust
#[repr(C)]                       // field order GUARANTEED to match source — required for FFI
struct FfiPoint { x: i32, y: i32 }

struct RustPoint { x: i32, y: i32 } // repr(Rust): compiler free to reorder — never assume layout
```
::

### The never type `!` and coercion

::code-wrapper{language="rust"}
```rust
fn main() {
    let opt: Option<i32> = Some(5);
    let x: i32 = match opt {
        Some(v) => v,
        None => panic!("missing"),   // `!` coerces to i32 — this branch never actually produces a value
    };
    println!("{x}");
}
```
::

## Cost, Performance, and Trade-Offs

Type alias: zero cost, zero safety. Newtype: zero cost, full safety.

::code-wrapper{language="rust"}
```rust
type Kilometers = i32;
type Miles = i32;

fn distance_km(d: Kilometers) -> Kilometers { d }

fn main() {
    let miles: Miles = 10;
    println!("{}", distance_km(miles)); // compiles! Kilometers and Miles are BOTH just i32 — no protection
}
```
::

::code-wrapper{language="rust"}
```rust
struct Kilometers(i32);
struct Miles(i32);

fn distance_km(d: Kilometers) -> Kilometers { d }

fn main() {
    let miles = Miles(10);
    // println!("{:?}", distance_km(miles).0); // COMPILE ERROR: expected Kilometers, found Miles
    // Same layout as i32 at runtime (niche-filling for single-field repr(Rust) wrappers) — free.
}
```
::

`char` vs `u8` at scale; `as` casts are free but not safe; ZSTs are genuinely free:

::code-wrapper{language="rust"}
```rust
fn main() {
    let big = 1_000_000_000u32;
    let truncated = big as u8;      // silent truncation to the low byte — no warning, no panic, ever
    println!("{truncated}");         // prints 0

    let checked = u8::try_from(big); // Err — explicit, handleable failure instead
    println!("{checked:?}");

    struct Marker;                   // zero-sized type
    assert_eq!(std::mem::size_of::<Marker>(), 0);
    let v: Vec<()> = vec![(); 1_000_000]; // zero allocation for element storage
}
```
::

## Production Failure Modes & Anti-Patterns

**Anti-pattern: silent truncation via `as` on a value crossing a trust boundary.**

::code-wrapper{language="rust"}
```rust
fn set_port(raw: u32) -> u16 {
    raw as u16   // 70000 as u16 -> 4464, silently wrong, no error
}
```
::

::code-wrapper{language="rust"}
```rust
fn set_port(raw: u32) -> Result<u16, std::num::TryFromIntError> {
    u16::try_from(raw)   // Err if raw > u16::MAX — caller must handle it
}
```
::

**Anti-pattern: assuming `usize` is always 64-bit.**

::code-wrapper{language="rust"}
```rust
fn pack_id(high: u32, low: u32) -> usize {
    ((high as usize) << 32) | (low as usize)   // works on x86_64, breaks/truncates on wasm32
}
```
::

::code-wrapper{language="rust"}
```rust
fn pack_id(high: u32, low: u32) -> u64 {
    ((high as u64) << 32) | (low as u64)   // explicit width, portable across every target
}
```
::

## Architectural Application

Newtypes at every domain boundary where two same-typed primitives could be confused:

::code-wrapper{language="rust"}
```rust
struct UserId(u64);
struct OrderId(u64);

fn charge(user: UserId, order: OrderId) { /* ... */ }

fn main() {
    let u = UserId(1);
    let o = OrderId(2);
    charge(u, o);
    // charge(o, u);   // COMPILE ERROR — caught for zero runtime cost, impossible with two plain u64s
}
```
::

Choose overflow semantics per domain, deliberately:

::code-wrapper{language="rust"}
```rust
fn ledger_add(balance_cents: i64, delta: i64) -> Result<i64, &'static str> {
    balance_cents.checked_add(delta).ok_or("overflow in financial calculation")
    // Money math: checked_* + propagate an error. Silent wraparound here is a bad incident.
}

fn ring_buffer_index(i: usize, capacity: usize) -> usize {
    i.wrapping_rem(capacity)   // ring buffer: wraparound IS the desired behavior
}
```
::

`#[repr(C)]` as the boundary marker for anything outside pure in-process Rust:

::code-wrapper{language="rust"}
```rust
#[repr(C)]
struct WireMessage { kind: u8, length: u32, payload_ptr: *const u8 }
// Any FFI boundary, wire protocol, or memory-mapped format MUST use this — never default repr(Rust).
```
::

## 💡 Tips & Tricks

::code-wrapper{language="rust"}
```rust
fn print_type<T>(_: &T) {
    println!("{}", std::any::type_name::<T>());   // confirm exactly which concrete type got inferred
}

fn main() {
    let f: f64 = 0.1 + 0.2;
    println!("{:x}", f.to_bits());   // exact IEEE 754 bit pattern — debug "why doesn't this float equal that"
}
```
::

- **Performance**: prefer `.copied()` over `.cloned()` on `&T` iterators where `T: Copy` — fails to compile if `T` stops being `Copy`, catching an accidental deep-clone at the type level.
- **Idiom**: reach for newtype the instant two same-typed parameters could be swapped by a caller.
- **Clippy**: `clippy::cast_possible_truncation`, `cast_sign_loss`, `cast_precision_loss` flag risky `as` casts.
- **Portability**: never serialize `usize`/`isize` directly — convert to `u64`/`i64` at the boundary.

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="rust"}
```rust
fn main() {
    let cp = 'A' as u32;                 // 65 — direct, infallible
    let back = char::from_u32(65);       // Some('A') — returns Option, since not every u32 is valid
    let invalid = char::from_u32(0xD800); // None — surrogate range excluded
    println!("{cp} {back:?} {invalid:?}");

    // let x: u8 = 256;   // COMPILE-TIME error: literal doesn't fit — different from runtime overflow

    let arr = [1, 2, 3];
    let dup = vec![arr; 4];               // OK: [i32; 3] is Copy
    // let s = [String::new(), String::new()];
    // let dup2 = vec![s; 4];             // COMPILE ERROR: [String; 2] is not Copy

    let set: std::collections::HashMap<&str, ()> = [("a", ()), ("b", ())].into();
    // HashMap<K, ()> — legitimate zero-overhead "set" pattern, unit occupies zero bytes
}
```
::

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
fn checksum(values: &[u8]) -> u8 {
    let mut sum: u8 = 0;
    for &v in values {
        sum += v;
    }
    sum
}

fn main() {
    let data = [200u8, 100, 50];
    println!("{}", checksum(&data));
}
```
::

What does this print in release, and why might debug behave entirely differently?

<details>
<summary>Answer</summary>

::code-wrapper{language="rust"}
```rust
// debug:   panics "attempt to add with overflow" — 200 + 100 = 300 overflows u8 on the FIRST addition
// release: wraps silently, prints 94  — (200 + 100 + 50) % 256, no check at all
```
::

`checksum` can pass every `cargo test`/`cargo run` (debug — would panic loudly) while shipping a silently wrong result the first time it runs under `cargo run --release`, if no test happened to also run against the release profile.

::code-wrapper{language="rust"}
```rust
fn checksum(values: &[u8]) -> u8 {
    values.iter().fold(0u8, |acc, &v| acc.wrapping_add(v))   // explicit, profile-independent
}
```
::

**The lesson**: any arithmetic where overflow is a real possibility needs explicit `wrapping_*`/`checked_*`/`saturating_*`, not reliance on whichever build profile happens to be running.

</details>

## Summary

Scalar and compound types have precise, inspectable memory layouts (`size_of` is your ground truth); overflow and casting are profile-dependent or silently lossy by design, making explicit `checked_*`/`TryFrom` conversions a correctness requirement at any trust or platform boundary; newtypes turn primitive-confusion bugs into compile errors for free.

Next: Functions — how these types flow through function boundaries, get monomorphized under generics, and interact with divergence (`!`) at call sites.
