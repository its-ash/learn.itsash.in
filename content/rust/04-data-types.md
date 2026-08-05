# 04 — Data Types

## Scalar Types

### Integers

| Type | Bits | Signed/Unsigned |
|---|---|---|
| `i8` `u8` | 8 | signed/unsigned |
| `i16` `u16` | 16 | |
| `i32` `u32` | 32 | (default integer) |
| `i64` `u64` | 64 | |
| `i128` `u128` | 128 | |
| `isize` `usize` | ptr-width (platform) | index/sizes |

```rust
let a: i32 = -5;
let b: u8 = 255;
let hex = 0xff;
let oct = 0o17;
let bin = 0b1010;
let byte = b'A';        // u8 from byte literal -> 65
let big = 1_000_000;    // underscores for readability
```

#### Integer Overflow

- In **debug** builds: overflow panics.
- In **release** builds: wraps silently (two's complement).
- Explicit methods: `wrapping_add`, `checked_add` (returns `Option`), `overflowing_add` (returns `(value, overflowed)`), `saturating_add`.

```rust
let (val, ovf) = 255u8.overflowing_add(1); // (0, true)
let safe = 255u8.checked_add(1);          // None
let sat = 255u8.saturating_add(1);        // 255
let wrap = 255u8.wrapping_add(1);         // 0
```

### Floats

`f32`, `f64` (default). IEEE 754. No `f16`/`f128` in std.

```rust
let f = 2.0;        // f64
let g: f32 = 3.0;
let inf = f64::INFINITY;
let nan = f64::NAN;
nan == nan          // false! NaN never equals itself
nan.is_nan()        // true
```

Floats implement `PartialOrd` (not `Ord`) because NaN has no total ordering. `f64::NAN.partial_cmp(&f64::NAN)` returns `None`. Sorting floats requires `sort_by(|a, b| a.partial_cmp(b).unwrap_or(Ordering::Equal))` or `total_cmp` (1.62+, gives total ordering).

### Booleans

`bool`, values `true`/`false`, one byte. Cast with `as` to integer: `true as u8 == 1`. Booleans are *not* integers (no implicit conversion in conditions or arithmetic).

### Characters (`char`)

`char` is a **4-byte Unicode scalar value** (not UTF-8 bytes, not a byte):

```rust
let c = 'z';
let emoji = '🦀';
let heart = '\u{2764}';
```

- `'A'` vs `b'A'`: the first is `char` (4 bytes), the second is `u8`.
- Surrogates (D800–DFFF) are not valid `char`s.
- Iterating `&str` yields `char`s (decodes UTF-8); indexing `s[0]` panics (UTF-8 bytes don't align with chars).

## Compound Types

### Tuples

Fixed-length, heterogeneous:

```rust
let t: (i32, f64, &str) = (1, 2.0, "three");
let (a, b, c) = t;          // destructuring
let first = t.0;
let unit: () = ();           // unit type, zero-sized
```

- Single-element tuple: `(x,)`.
- The empty tuple `()` is the unit type (represents "no meaningful value", e.g., `main`'s return type).
- `0`-tuple `()` is inhabited by exactly one value `()`. Useful as a `HashMap` value when you want a set.

### Arrays

Fixed length, same type, stack-allocated:

```rust
let arr: [i32; 3] = [1, 2, 3];
let zeros = [0; 100];        // 100 zeros
let first = arr[0];
let slice = &arr[1..3];
```

- Length is part of the type: `[i32; 3]` != `[i32; 4]`.
- Out-of-bounds indexing **panics** at runtime with bounds checking.
- `arr.len()` is a compile-time constant for arrays.
- Arrays implement `IntoIterator` since edition 2021 (by value).

### Slices (`&[T]`, `&mut [T]`)

Dynamically-sized view into a contiguous sequence (covered in the Slices chapter). The fat-pointer representation: (pointer, length).

## Strings (preview)

- `&str` — borrowed string slice, UTF-8, immutable view, fat pointer (ptr+len).
- `String` — owned, growable UTF-8 string (heap).
- `&[u8]` vs `&str`: bytes vs decoded text.

```rust
let s: &str = "hello";
let owned: String = String::from("hello");
let bytes: &[u8] = b"hello";        // &[u8; 5] / &[u8]
```

## Function Types

```rust
fn add(a: i32, b: i32) -> i32 { a + b }
let f: fn(i32, i32) -> i32 = add;
```

Function pointers (`fn(...) -> ...`) are zero-sized, `Copy`, and implement `Fn`. Closures have unnameable types (see Closures chapter).

## Never Type (`!`)

`!` is the never type (diverges). Functions like `panic!`, `loop {}`, `std::process::exit` return `!`. It coerces to any type:

```rust
let x: i32 = match opt {
    Some(v) => v,
    None => panic!("missing"),   // ! coerces to i32
};
```

## Type Aliases

```rust
type Kilometers = i32;
type IntPair = (i32, i32);
```

Aliases are purely nominal — no new type, no methods, just a shorthand.

## Newtype Pattern (real distinct type)

```rust
struct Kilometers(i32);
struct Miles(i32);
// Kilometers and Miles are different types — no accidental mixing
```

This is the idiomatic way to prevent unit confusion.

## Casting (`as`)

`as` is a coarse numeric conversion (truncates, may wrap):

```rust
let a = 1_000_000_000u32 as u8;     // truncates -> 192 (low byte)
let f = 3.9_f32 as i32;             // truncates toward zero -> 3
let b = true as u8;                 // 1
let p = 42 as *const i32;
```

Use `From`/`Into`/`TryFrom`/`TryInto` for safe, explicit conversions.

## Edge Cases

- **Default int**: `let x = 1;` → `i32`. In a `match` arm that returns an integer, the inferred type can leak across arms.
- **Default float**: `let x = 1.0;` → `f64`.
- **Char to int**: `'A' as u32` → 65 (Unicode code point). `u32` to `char` needs `char::from_u32` (returns `Option`, since not all u32 are valid chars).
- **`Vec` of arrays**: `vec![[0; 3]; 4]` works; `vec![[1,2,3]; 4]` requires `Copy` (arrays of `Copy` are `Copy`).
- **Zero-sized types (ZSTs)**: `()`, `struct Empty;`, `struct Empty;` occupy 0 bytes; `Vec<()>` is effectively a counter.
- **`isize`/`usize`** change with platform — don't rely on width in serialized data; use `i64`/`u64` explicitly.
- **Integer literals overflow in source**: `let x: u8 = 255;` is fine, but `let x: u8 = 256;` is a compile error.
- **`char` size**: always 4 bytes even for ASCII; for ASCII use `u8` if memory matters.
- **`as` with `f64::NAN as i32`** → 0 (platform-defined, not reliable).

## Summary

You know the primitives, integers/overflow, floats/NaN, tuples, arrays, and the distinction between `char` and bytes. Next: functions.