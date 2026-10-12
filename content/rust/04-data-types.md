# 04 — Data Types

Rust is statically typed: every value has one type, known at compile time. The compiler usually infers it.

## Integers

| Signed | Unsigned | Size |
|---|---|---|
| `i8` | `u8` | 1 byte |
| `i16` | `u16` | 2 bytes |
| `i32` (default) | `u32` | 4 bytes |
| `i64` | `u64` | 8 bytes |
| `i128` | `u128` | 16 bytes |
| `isize` | `usize` | pointer size (8 on 64-bit, 4 on `wasm32`) |

::code-wrapper{language="rust"}
```rust
fn main() {
    let a = 42;            // i32 by default
    let b = 42u8;          // suffix picks the type
    let c: u64 = 1_000_000;
    let d = 0xff;          // 255  (also 0o77, 0b1010, b'A')
    println!("{a} {b} {c} {d}");
}
```
::

### Integer division truncates toward zero

::code-wrapper{language="rust"}
```rust
fn main() {
    println!("{}", 5 / 2);                  // 2   — not 2.5
    println!("{}", -7 / 2);                 // -3  — toward zero (Python gives -4!)
    println!("{}", -7 % 2);                 // -1  — sign follows the left side
    println!("{}", (-7i32).rem_euclid(2));  // 1   — always non-negative
}
```
::

### Overflow

::code-wrapper{language="rust"}
```rust
fn main() {
    let x: u8 = 255;
    println!("{:?}", x.checked_add(1));     // None
    println!("{}", x.wrapping_add(1));      // 0
    println!("{}", x.saturating_add(1));    // 255
    println!("{:?}", x.overflowing_add(1)); // (0, true)
}
```
::

- `255u8 + 1` with constants → **compile error**.
- Same overflow at run time → **panic** in debug, **silent wrap** in release.

**Tricky**: some operations panic in **both** debug and release:

::code-wrapper{language="rust"}
```rust
fn main() {
    let zero = std::env::args().count() as i32 - 1;   // 0 at run time
    // println!("{}", 10 / zero);       // panic: attempt to divide by zero  (release too!)
    // println!("{}", i32::MIN / -1);   // panic: attempt to divide with overflow (release too!)
    println!("{:?}", 10i32.checked_div(zero));   // None — the safe version
}
```
::

## Floats

::code-wrapper{language="rust"}
```rust
fn main() {
    let x = 2.5;          // f64 by default
    let y: f32 = 2.5;

    println!("{}", 0.1 + 0.2);          // 0.30000000000000004
    println!("{}", 0.1 + 0.2 == 0.3);   // false
    println!("{}", (0.1f64 + 0.2 - 0.3).abs() < 1e-10);   // true — compare with a tolerance

    println!("{}", 7.0 / 0.0);          // inf — float division by zero does NOT panic
    let nan = 0.0f64 / 0.0;
    println!("{}", nan == nan);         // false — NaN is not equal to itself
    println!("{}", nan.is_nan());       // true
}
```
::

**Tricky**: because of `NaN`, floats are not totally ordered. `sort()` does not work on `Vec<f64>`:

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![3.0, 1.0, 2.0];
    // v.sort();                          // error[E0277]: the trait bound `f64: Ord` is not satisfied
    v.sort_by(f64::total_cmp);            // works, NaN included
    println!("{v:?}");                    // [1.0, 2.0, 3.0]
}
```
::

## `as` Casts — Never Panic, Sometimes Lie

::code-wrapper{language="rust"}
```rust
fn main() {
    println!("{}", 300i32 as u8);       // 44          — keeps the low 8 bits (300 - 256)
    println!("{}", -1i32 as u32);       // 4294967295  — same bits, read as unsigned
    println!("{}", 3.99f64 as i32);     // 3           — truncates, no rounding
    println!("{}", -1.5f64 as u8);      // 0           — float→int SATURATES
    println!("{}", 1e10f64 as i32);     // 2147483647  — clamped to i32::MAX
    println!("{}", f64::NAN as i32);    // 0
}
```
::

Use `TryFrom` when a wrong value must be an error:

::code-wrapper{language="rust"}
```rust
fn main() {
    let big: i32 = 300;
    match u8::try_from(big) {
        Ok(v) => println!("fits: {v}"),
        Err(e) => println!("error: {e}"),   // error: out of range integral type conversion attempted
    }
    let small: u8 = 7;
    let wide: u32 = small.into();          // widening always fits → From/into, no error possible
    println!("{wide}");
}
```
::

## `bool` and `char`

::code-wrapper{language="rust"}
```rust
fn main() {
    let ok: bool = true;
    // if 1 { }                 // error: expected `bool`, found integer — no truthiness in Rust
    println!("{}", ok as i32);  // 1

    let c = 'z';
    let crab = '🦀';
    println!("{}", std::mem::size_of::<char>());   // 4 — every char is 4 bytes

    println!("{}", 'A' as u8 + 1);          // 66
    println!("{}", (b'a' + 1) as char);     // b
}
```
::

**Tricky**: a `char` is not a "letter on screen" and a string's `len()` is not its character count:

::code-wrapper{language="rust"}
```rust
fn main() {
    let s = "héllo";
    println!("{}", s.len());             // 6 — BYTES (é is 2 bytes in UTF-8)
    println!("{}", s.chars().count());   // 5 — chars
    // let first = s[0];                 // error: `str` cannot be indexed by `{integer}`
    println!("{:?}", s.chars().next());  // Some('h')
}
```
::

## Tuples

::code-wrapper{language="rust"}
```rust
fn main() {
    let t: (i32, f64, &str) = (1, 2.0, "three");
    let (a, b, c) = t;                 // destructure
    println!("{a} {b} {c} {}", t.0);   // access by position

    let one = (5,);                    // a 1-element tuple needs the comma
    let not_tuple = (5);               // just 5 in parentheses (compiler warns)
    println!("{one:?} {not_tuple:?}"); // (5,) 5

    let unit = ();                     // the "empty" type — what functions return by default
    println!("{unit:?}");              // ()
}
```
::

## Arrays

::code-wrapper{language="rust"}
```rust
fn main() {
    let a = [1, 2, 3];          // type [i32; 3] — the length is part of the type
    let zeros = [0; 5];         // [0, 0, 0, 0, 0]
    println!("{} {:?}", a.len(), zeros);

    let i = std::env::args().count() + 4;   // 5 at run time
    println!("{:?}", a.get(i));            // None — safe access
    // println!("{}", a[i]);               // panic: index out of bounds: the len is 3 but the index is 5
    // println!("{}", a[5]);               // constant index → compile error: this operation will panic at runtime
}
```
::

**Tricky**: `[i32; 3]` and `[i32; 4]` are **different types**:

::code-wrapper{language="rust"}
```rust
fn sum3(a: [i32; 3]) -> i32 { a.iter().sum() }

fn main() {
    println!("{}", sum3([1, 2, 3]));
    // sum3([1, 2, 3, 4]);   // error[E0308]: expected an array with a size of 3, found one with a size of 4
}
```
::

Use a slice `&[i32]` to accept any length (chapter 09).

## Type Aliases vs Newtypes

::code-wrapper{language="rust"}
```rust
type Meters = f64;            // alias — just another name, NO protection
struct Seconds(f64);          // newtype — a real, distinct type, same memory cost

fn wait(s: Seconds) { println!("waiting {}s", s.0); }

fn main() {
    let d: Meters = 5.0;
    // wait(d);               // error: expected `Seconds`, found `f64`
    wait(Seconds(5.0));
}
```
::

## 💡 Tips & Tricks

- **Debug** — `std::any::type_name::<T>()` shows the exact inferred type.
- **Debug** — `std::mem::size_of::<T>()` shows the size of a type in bytes.
- **Idiom** — `i64::from(x)` / `x.into()` for lossless widening; `T::try_from(x)` for narrowing.
- **Lint** — `clippy::cast_possible_truncation` flags risky `as` casts.
- **Idiom** — newtypes (`struct UserId(u64)`) stop you from mixing up two `u64` parameters.

## ⚠️ Edge Cases & Gotchas

- **Division** — `-7 / 2 == -3` (toward zero). Use `div_euclid`/`rem_euclid` for floor-style math.
- **Division** — integer `/ 0` and `MIN / -1` panic even in release; float `/ 0.0` gives `inf`.
- **Casts** — `as` between integers wraps; float→int saturates; `NaN as i32 == 0`. No errors, ever.
- **Float** — `NaN != NaN`; `Vec<f64>` has no `sort()`; use `sort_by(f64::total_cmp)`.
- **Strings** — `.len()` is bytes, not characters; strings cannot be indexed with `s[0]`.
- **Portability** — `usize` is 32 bits on `wasm32`. Use `u64` for IDs and file formats.
- **Tuple** — `(5)` is an integer; `(5,)` is a tuple.

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
    println!("{}", checksum(&[200, 100, 50]));
}
```
::

<details>
<summary>Answer</summary>

`200 + 100` overflows `u8` on the first addition.

- `cargo run` (debug): **panic** — attempt to add with overflow.
- `cargo run --release`: prints **94** — `(200 + 100 + 50) % 256`, silently.

If wrap-around is what a checksum wants, say so:

::code-wrapper{language="rust"}
```rust
fn checksum(values: &[u8]) -> u8 {
    values.iter().fold(0u8, |acc, &v| acc.wrapping_add(v))
}
```
::

**The lesson**: when overflow is possible, pick `wrapping_*`, `checked_*` or `saturating_*` explicitly.

</details>

## 🧠 Quick Quiz

::code-wrapper{language="rust"}
```rust
fn main() {
    println!("{}", 257u16 as u8);
    println!("{}", -1i8 as u8);
    println!("{}", 2.9f32 as u8);
    println!("{}", -9 % 4);
}
```
::

<details>
<summary>Answer</summary>

::code-wrapper{language="bash"}
```bash
1
255
2
-1
```
::

257 keeps its low byte (1). `-1i8` is `0xFF` → 255 as `u8`. Float→int truncates. `%` keeps the sign of the left side.

</details>

## Summary

Integers default to `i32`, floats to `f64`. Overflow, division and `as` casts each have their own rules — use `checked_*` and `TryFrom` when wrong values must not slip through.

Next: Functions.
