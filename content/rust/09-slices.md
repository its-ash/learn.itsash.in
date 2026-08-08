# 09 — Slices

A slice is a **borrowed view** into a contiguous sequence of elements. It's the most common way to pass "a chunk of data" without taking ownership.

## The Slice Type

::code-wrapper{language="rust"}
```rust
let arr = [1, 2, 3, 4, 5];
let s: &[i32] = &arr;          // slice of the whole array
let part: &[i32] = &arr[1..4]; // [2, 3, 4]
```
::

A slice `&[T]` is a **fat pointer**: `(pointer, length)`. Two `usize` worth of data on the stack. No ownership of the underlying elements.

## String Slices `&str`

`&str` is a slice of UTF-8 bytes — same fat-pointer layout but with the UTF-8 invariant:

::code-wrapper{language="rust"}
```rust
let s = String::from("hello, world");
let hello: &str = &s[0..5];     // "hello"
let world: &s[7..12];            // "world"
let whole: &str = &s[..];        // whole string
```
::

## Indexing Rules

- `..n` = `0..n`; `n..` = `n..len`; `..` = `0..len`.
- `..=k` is inclusive.
- Out-of-bounds slicing **panics** at runtime.
- Slicing on a **non-char boundary** in a `&str` panics:

::code-wrapper{language="rust"}
```rust
let s = "hi🦀";  // '🦀' is 4 bytes
let bad = &s[2..4];   // PANIC: byte index 2 is not a char boundary
```
::

To slice by char, use `.chars()` / `.char_indices()`:

::code-wrapper{language="rust"}
```rust
let first_char_str: &str = s.split(0).next().unwrap();
```
::

Wait — `str::split` splits on a pattern. Use `char_indices` for safety:

::code-wrapper{language="rust"}
```rust
let bytes_to = s.char_indices().nth(1).map(|(i, _)| i).unwrap();
let first: &str = &s[..bytes_to];
```
::

## Creating Slices

::code-wrapper{language="rust"}
```rust
// From Vec
let v = vec![1, 2, 3];
let s = &v[..];
let s = v.as_slice();

// From array
let a = [1, 2, 3];
let s = &a[..];

// From String
let st = String::from("hi");
let s: &str = &st[..];
let s: &str = st.as_str();

// From raw parts (unsafe)
let s: &[u8] = unsafe { std::slice::from_raw_parts(ptr, len) };
```
::

## `&[T]` vs `&[T; N]`

- `&[T]` is the slice type (dynamically sized).
- `&[T; N]` is a reference to a fixed-size array (size known at compile time).
- `&[T; N]` coerces to `&[T]`.

## Mutable Slices

::code-wrapper{language="rust"}
```rust
let mut v = vec![1, 2, 3];
let s: &mut [i32] = &mut v[..];
s[0] = 99;
```
::

One mutable slice at a time (borrow rules still apply).

## Splitting Slices

::code-wrapper{language="rust"}
```rust
let (left, right) = s.split_first();   // Option<(&T, &[T])>
let (mut_left, mut_right) = s.split_at_mut(2);   // (&mut [T], &mut [T])
```
::

`split_at_mut` is the canonical way to get two non-overlapping mutable subslices — the compiler can't otherwise prove disjointness.

## Iteration

::code-wrapper{language="rust"}
```rust
for x in &arr { /* x: &i32 */ }
for x in &mut arr { /* x: &mut i32 */ }
for x in arr { /* x: i32 — consumes (Copy ok) */ }
```
::

`&[T]` and `&mut [T]` implement `IntoIterator` yielding `&T` / `&mut T`.

## Why Slices Matter for APIs

Take `&[T]` not `&Vec<T>`:

::code-wrapper{language="rust"}
```rust
fn sum(nums: &[i32]) -> i32 {
    nums.iter().sum()
}
sum(&vec![1, 2, 3]);
sum(&[1, 2, 3]);
sum(&arr);            // works for arrays too
```
::

`&[T]` is the most general borrowed form.

## `&str` vs `String` API Choice

::code-wrapper{language="rust"}
```rust
fn print(s: &str) { println!("{s}"); }
print("literal");          // &str
print(&owned_string);      // &String -> &str
print(&substring);         // &str
```
::

Always prefer `&str` in function parameters unless you need to grow the string.

## 💡 Tips & Tricks

- **Debug**: `slice.get(i)` instead of `slice[i]` while debugging index-related panics — it returns `Option<&T>` so you can `dbg!(slice.get(i))` without crashing the program, then swap back to indexing once you've confirmed the bounds are right.
- **Idiom**: accept `&[T]`/`&str` in function signatures, never `&Vec<T>`/`&String` — it's strictly more general (accepts arrays, `Vec`, and slices of slices too) at zero runtime cost, since both are already fat pointers under the hood.
- **Performance**: `slice.windows(n)` and `slice.chunks(n)` are both zero-allocation, lazy iterators — prefer them over manually indexing with a `for i in 0..len` loop for sliding-window or batch-processing logic; they're also harder to get an off-by-one error in.
- **Idiom**: `split_at_mut` is the *only* safe way to get two simultaneously mutable, non-overlapping views into the same slice — reaching for `unsafe`/raw pointers to "convince" the borrow checker to allow two `&mut` slices is almost always unnecessary once you know this method exists.
- **Debug**: a panic message like "byte index 2 is not a char boundary" always means UTF-8-unsafe slicing on a `&str` — the fix is almost never to slice at a different fixed byte offset (which is fragile for any non-ASCII input) but to use `.char_indices()`/`.chars()` to find valid boundaries.
- **Clippy**: `clippy::indexing_slicing` (opt-in, part of `restriction`) flags all direct `[]` indexing in favor of `.get()`, useful to enable temporarily when auditing a codebase for unhandled panics on untrusted input.

## ⚠️ Edge Cases & Gotchas

- **Empty slice**: `&arr[0..0]` is valid, length 0; never panics.
- **Slicing past end**: `&v[..v.len() + 1]` panics.
- **`slice.get(i)` / `slice.get_mut(i)`**: returns `Option<&T>` / `Option<&mut T>` — non-panicking indexing.
- **`slice.get_unchecked(i)`**: unsafe — skips bounds check (only correct when you've proven `i < len`).
- **Range patterns**: limited; stable Rust allows `[a, b, ..]` only in limited forms.
- **`Vec::drain`**: takes a range, removes and returns an iterator — modifies the `Vec`.
- **String slicing pitfall**: indexing `s[i]` is intentionally not allowed for `String`/`&str` because UTF-8 byte indexing is meaningless. Use `s.chars().nth(i)` or `s.as_bytes()[i]` (returns `u8`).

## 🧠 Spot the Bug

What does this print, and why might it surprise someone who expects both halves to be independent?

::code-wrapper{language="rust"}
```rust
fn main() {
    let s = String::from("héllo");
    println!("byte len: {}", s.len());

    let first_two_bytes = &s[0..2];
    println!("{first_two_bytes}");
}
```
::

<details>
<summary>Answer</summary>

This panics: `byte index 2 is not a char boundary; it is inside 'é' (bytes 1..3) of \`héllo\``.

`String::len()` reports the length in **bytes**, not characters — `é` is a single Unicode scalar value (one `char`) but encodes to **2 bytes** in UTF-8, so `"héllo".len()` is `6`, not `5`. Slicing `&s[0..2]` looks like it should grab "the first two characters," but string slicing in Rust operates on **byte offsets**, and byte offset `2` falls squarely in the *middle* of `é`'s 2-byte encoding — cutting a multi-byte UTF-8 sequence in half would produce invalid UTF-8, which `&str` can never represent (it's a safety invariant of the type). Rather than silently producing corrupted text, Rust panics immediately at the slice operation. This is a common trap for anyone assuming `&str` indexing works like character-array indexing in languages such as Python or Java, where `s[0:2]` means "first two characters" regardless of encoding.

The fix is to use `char_indices()` to find a valid byte offset for a given number of characters, rather than guessing a byte count:

::code-wrapper{language="rust"}
```rust
let boundary = s.char_indices().nth(2).map(|(i, _)| i).unwrap_or(s.len());
let first_two_chars = &s[..boundary];
```
::

**The lesson**: `&str` length and slicing are always in bytes, not characters — any non-ASCII input can make a byte-offset slice land mid-character, which panics rather than silently corrupting the string.

</details>

## Slice Methods Cheat Sheet

::code-wrapper{language="rust"}
```rust
s.len();
s.is_empty();
s.first();             // Option<&T>
s.last();
s.split_first();       // Option<(&T, &[T])>
s.iter() / s.iter_mut();
s.windows(2);          // sliding windows
s.chunks(3);           // non-overlapping chunks
s.chunks_exact(3);
s.split(|x| *x == 0);
s.splitn(2, |x| *x == 0);
s.contains(&3);
s.starts_with(&[1, 2]);
s.ends_with(&[4, 5]);
s.iter().position(|x| *x == 3);
s.binary_search(&3);
s.sort();
s.sort_by(|a, b| b.cmp(a));
s.sort_by_key(|x| x.abs());
s.reverse();
s.rotate_left(1);
s.copy_within(0..3, 5);
s.fill(0);
```
::

## Slice Tricks & Patterns

::code-wrapper{language="rust"}
```rust
// Trick: use get() for safe indexing without panics
let s = "hello";
let c = s.get(0); // Option<&str>

// Trick: split_at_mut for non-overlapping borrows
let mut v = vec![1, 2, 3, 4];
let (left, right) = v.split_at_mut(2);
left[0] = 99;
right[0] = 88; // both work, no conflict

// Trick: as_slice() to convert collections to slices
let v = vec![1, 2, 3];
fn takes_slice(s: &[i32]) {}
takes_slice(v.as_slice());

// Trick: unwrap slice patterns for infallible binding
let [a, b, c] = [1, 2, 3]; // direct binding, panics if lengths don't match
let [x, ..] = [1, 2, 3]; // bind first, ignore rest

// Trick: use windows() for sliding windows
let v = vec![1, 2, 3, 4, 5];
for window in v.windows(2) {
    println!("{:?}", window); // [1,2], [2,3], [3,4], [4,5]
}

// Trick: use chunks() for non-overlapping segments
for chunk in v.chunks(2) {
    println!("{:?}", chunk); // [1,2], [3,4], [5]
}

// Trick: binary_search on sorted slices
let v = vec![1, 3, 5, 7, 9];
match v.binary_search(&5) {
    Ok(idx) => println!("found at {}", idx),
    Err(idx) => println!("would insert at {}", idx),
}
```
::

## Summary

- Slices are borrowed, fat-pointer views into contiguous data.
- `&str` is a UTF-8 slice; `&[T]` is a generic slice.
- Use `&[T]` / `&str` in APIs for maximum generality.
- Split at mutable boundaries with `split_at_mut`.
- Use `get()` for safe bounds checking; use `windows()`/`chunks()` for iteration patterns.
- Remember: slicing on UTF-8 char boundaries can panic; use `char_indices()` for safety.

Next: Lifetimes — the borrow checker's vocabulary.