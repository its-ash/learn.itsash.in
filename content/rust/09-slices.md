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

## Edge Cases

- **Empty slice**: `&arr[0..0]` is valid, length 0; never panics.
- **Slicing past end**: `&v[..v.len() + 1]` panics.
- **`slice.get(i)` / `slice.get_mut(i)`**: returns `Option<&T>` / `Option<&mut T>` — non-panicking indexing.
- **`slice.get_unchecked(i)`**: unsafe — skips bounds check (only correct when you've proven `i < len`).
- **Range patterns**: limited; stable Rust allows `[a, b, ..]` only in limited forms.
- **`Vec::drain`**: takes a range, removes and returns an iterator — modifies the `Vec`.
- **String slicing pitfall**: indexing `s[i]` is intentionally not allowed for `String`/`&str` because UTF-8 byte indexing is meaningless. Use `s.chars().nth(i)` or `s.as_bytes()[i]` (returns `u8`).

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

## Summary

- Slices are borrowed, fat-pointer views into contiguous data.
- `&str` is a UTF-8 slice; `&[T]` is a generic slice.
- Use `&[T]` / `&str` in APIs for maximum generality.
- Split at mutable boundaries with `split_at_mut`.

Next: Lifetimes — the borrow checker's vocabulary.