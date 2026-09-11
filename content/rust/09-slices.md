# 09 — Slices

A slice makes "borrow, don't copy" work for collections. Why does `&[T]` exist when `&Vec<T>` compiles fine? A specific ABI trick — the fat pointer.

## Under-the-Hood Mechanics

### The fat pointer, exactly

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn main() {
    assert_eq!(std::mem::size_of::<&[i32]>(), 16);   // ptr (8) + len (8) on 64-bit
    assert_eq!(std::mem::size_of::<&i32>(), 8);       // thin pointer, no length needed
    assert_eq!(std::mem::size_of::<&str>(), 16);      // same layout as &[u8]

    let v = vec![1, 2, 3];
    let s: &[i32] = &v;
    // s is (ptr_to_v[0], 3) — it does NOT know about v's capacity or allocator
}
```
::

::code-wrapper{language="rust"}
```rust
fn main() {
    let arr = [1, 2, 3, 4, 5];
    let v = vec![1, 2, 3, 4, 5];
    let slice_from_array: &[i32] = &arr;    // slice can borrow from an array...
    let slice_from_vec: &[i32] = &v;         // ...or a Vec...
    let slice_from_slice: &[i32] = &v[1..3]; // ...or another slice — all it needs is (ptr, len)
    println!("{slice_from_array:?} {slice_from_vec:?} {slice_from_slice:?}");
}
// Contrast: Vec<T> is THREE words (ptr, len, capacity) because it OWNS the allocation.
```
::

### `&str` layout and the UTF-8 invariant enforced at the type level

::code-wrapper{language="rust"}
```rust
fn main() {
    let s = "hello";                                  // valid UTF-8 by construction (literal)
    let bytes: &[u8] = s.as_bytes();
    let back = std::str::from_utf8(bytes).unwrap();    // validated — panics/errors on invalid UTF-8

    let bad: &[u8] = &[0xFF, 0xFE];
    assert!(std::str::from_utf8(bad).is_err());         // safe path REJECTS invalid bytes

    // unsafe { std::str::from_utf8_unchecked(bad) };   // bypasses the check — UB the moment
    //                                                     anything treats the result as valid UTF-8
    println!("{s} {back}");
}
```
::

### Indexing vs slicing: two different runtime operations

::code-wrapper{language="rust"}
```rust
fn sum_first_three(s: &[i32]) -> i32 {
    s[0] + s[1] + s[2] // three bounds checks, unless LLVM proves len >= 3 and elides them
}

fn sum_first_three_checked(s: &[i32]) -> Option<i32> {
    if s.len() < 3 { return None; }
    Some(s[0] + s[1] + s[2])   // LLVM CAN now eliminate the redundant checks via range analysis
}

fn sum_first_three_iter(s: &[i32]) -> i32 {
    s.iter().take(3).sum()    // never indexes at all — nothing to elide, freely vectorizable
}
```
::

## Cost, Performance, and Trade-Offs

::code-wrapper{language="rust"}
```rust
fn takes_slice(_: &[i32]) {}          // two register-sized values: pointer + length, no allocation
fn takes_vec_ref(_: &Vec<i32>) {}      // same cost to CALL, but forces caller to own a Vec in the first place

fn main() {
    let arr = [1, 2, 3];
    takes_slice(&arr);      // works: stack array, no heap allocation needed
    // takes_vec_ref(&arr);  // COMPILE ERROR: &[i32; 3] is not &Vec<i32> — Vec-typed params are less general
}
```
::

::code-wrapper{language="rust"}
```rust
// Bounds checking is cheap but not zero — 5-15% overhead is realistic in tight numeric loops
// that the optimizer can't prove safe. Fix is restructuring, not unsafe get_unchecked as a first move.
fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()   // iterator shape LLVM's vectorizer recognizes best
}
```
::

::code-wrapper{language="rust"}
```rust
fn main() {
    let s = "héllo wörld";
    // Repeated byte-offset slicing recomputes boundaries every time — compute once instead:
    let boundaries: Vec<(usize, char)> = s.char_indices().collect();
    println!("{boundaries:?}");
}
```
::

## Production Failure Modes & Anti-Patterns

### Anti-pattern: hand-rolled sub-range splitting instead of `split_at_mut`

::code-wrapper{language="rust"}
```rust
// naive: mid-level dev wants two independently-mutable halves of a buffer
fn process_naive(buf: &mut [f32], mid: usize) {
    let left = &mut buf[..mid];
    // let right = &mut buf[mid..]; // ERROR: cannot borrow `*buf` as mutable more than once
    for x in left { *x *= 2.0; }
}
```
::

::code-wrapper{language="rust"}
```rust
fn process_right(buf: &mut [f32], mid: usize) {
    let (left, right) = buf.split_at_mut(mid); // panics if mid > buf.len(); no UB path
    for x in left.iter_mut() { *x *= 2.0; }
    for x in right.iter_mut() { *x *= 0.5; }
}

fn process_parallel(buf: &mut [f32], mid: usize) {
    let (left, right) = buf.split_at_mut(mid);
    std::thread::scope(|s| {
        s.spawn(|| for x in left.iter_mut() { *x *= 2.0; });
        s.spawn(|| for x in right.iter_mut() { *x *= 0.5; });   // provably non-overlapping, zero sync overhead
    });
}
```
::

### Anti-pattern: byte-offset string slicing on user input

::code-wrapper{language="rust"}
```rust
// naive: truncate a display name to 20 "characters"
fn truncate_naive(name: &str) -> &str {
    if name.len() > 20 {
        &name[..20] // byte length, not char count — panics if byte 20 lands mid-sequence (é, emoji, CJK)
    } else {
        name
    }
}
```
::

::code-wrapper{language="rust"}
```rust
fn truncate_right(name: &str, max_chars: usize) -> &str {
    match name.char_indices().nth(max_chars) {
        Some((byte_idx, _)) => &name[..byte_idx],
        None => name, // fewer than max_chars characters total
    }
    // For full correctness on grapheme clusters (emoji + skin-tone modifiers), use `unicode-segmentation`.
}
```
::

### Anti-pattern: `get_unchecked` as a premature optimization

::code-wrapper{language="rust"}
```rust
// naive: "I profiled this and bounds checks show up, so let's remove them"
fn dot_product_unsafe(a: &[f64], b: &[f64]) -> f64 {
    let mut sum = 0.0;
    for i in 0..a.len() {
        sum += unsafe { a.get_unchecked(i) * b.get_unchecked(i) }; // UB if b is shorter than a
    }
    sum
}
```
::

::code-wrapper{language="rust"}
```rust
fn dot_product_safe(a: &[f64], b: &[f64]) -> f64 {
    assert_eq!(a.len(), b.len(), "slices must be equal length");   // invariant proven ONCE, at the boundary
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum() // LLVM auto-vectorizes; no manual unsafe needed
}
```
::

## Architectural Application

::code-wrapper{language="rust"}
```rust
fn parse(input: &str) -> Vec<&str> {         // composes with in-memory strings, mmap'd files, network buffers
    input.split(',').collect()
}

// fn parse_narrow(input: &String) -> Vec<&str> { ... }  // forces every caller through an allocation
```
::

::code-wrapper{language="rust"}
```rust
// Zero-copy parsing: return sub-slices of the ORIGINAL buffer, never allocate new Strings per token.
fn tokenize(input: &str) -> Vec<&str> {
    input.split_whitespace().collect()
    // Each returned &str borrows from `input` — cheap as an (index, length) pair, made SAFE
    // by the lifetime system (next chapter) tying every token's lifetime to the buffer's.
}
```
::

::code-wrapper{language="rust"}
```rust
fn parallel_sum(data: &mut [i64]) -> i64 {
    let mid = data.len() / 2;
    let (left, right) = data.split_at_mut(mid);   // proved non-overlapping ONCE, up front
    let mut left_sum = 0i64;
    let mut right_sum = 0i64;
    std::thread::scope(|s| {
        s.spawn(|| left_sum = left.iter().sum());
        s.spawn(|| right_sum = right.iter().sum());
    });
    left_sum + right_sum
    // This is the primitive underneath rayon::slice::ParallelSlice — no lock per element needed.
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="rust"}
```rust
fn main() {
    let v = vec![1, 2, 3];
    println!("{:?}", v.get(10));           // Option<&T> — no crash while debugging index panics
    // println!("{}", v[10]);               // would panic immediately

    for window in v.windows(2) {            // zero-allocation, lazy — no manual for-i-in-0..len loop
        println!("{window:?}");
    }
    for chunk in v.chunks(2) {
        println!("{chunk:?}");
    }
}
```
::

- **Idiom**: accept `&[T]`/`&str` in signatures, never `&Vec<T>`/`&String` — strictly more general at zero cost.
- **Idiom**: `split_at_mut` is the *only* safe way to get two simultaneously mutable, non-overlapping views.
- **Debug**: "byte index N is not a char boundary" always means UTF-8-unsafe slicing — use `.char_indices()` instead of a fixed byte offset.
- **Clippy**: `clippy::indexing_slicing` flags direct `[]` indexing in favor of `.get()`.

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="rust"}
```rust
fn main() {
    let arr = [1, 2, 3];
    let empty = &arr[0..0];               // valid, length 0, never panics
    println!("{:?}", empty.windows(5).count()); // 0 iterations, NOT a panic — easy to forget

    // let bad = &arr[..arr.len() + 1];   // panics: off-by-one past the end

    let v = vec![10, 20, 30];
    println!("{:?}", v.get(10));           // None — safe default for untrusted-input indices
    // println!("{}", unsafe { v.get_unchecked(10) }); // silent UB, not a panic

    let fixed: &[i32; 3] = &arr;
    let dynamic: &[i32] = fixed;            // coerces automatically — but NOT the reverse; N is lost

    let s = "héllo";
    // let c = s[0];                        // does not compile — byte indexing is meaningless as "char i"
    let c = s.chars().nth(0);                // O(n), walks from the start
    println!("{c:?}");
}
```
::

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
fn last_three(data: &[i32]) -> &[i32] {
    &data[data.len() - 3..]
}

fn main() {
    let readings = vec![10, 20];
    println!("{:?}", last_three(&readings));
}
```
::

What's wrong, and when does it bite?

<details>
<summary>Answer</summary>

::code-wrapper{language="rust"}
```rust
// readings has only 2 elements: data.len() - 3 == 2usize - 3
// debug:   panics "attempt to subtract with overflow" immediately
// release: wraps to usize::MAX-ish, then fails the subsequent bounds check instead
```
::

::code-wrapper{language="rust"}
```rust
fn last_three(data: &[i32]) -> &[i32] {
    let start = data.len().saturating_sub(3); // clamps to 0 instead of underflowing
    &data[start..]
}
```
::

**The lesson**: any `usize` arithmetic derived from `.len()` that subtracts a constant is a latent underflow panic on short inputs — reach for `saturating_sub`/`checked_sub` any time the subtrahend isn't provably `<=` the length.

</details>

## Summary

- A slice is a fat pointer — `(data ptr, length)`, two machine words, no ownership, no capacity — which is exactly what makes `&[T]` strictly more general than `&Vec<T>` as an API parameter.
- Indexing and range-slicing both insert a runtime bounds check that LLVM can eliminate when it can prove safety via range analysis (most naturally achieved through iterator adapters, not manual indexing).
- `&str` shares `&[u8]`'s layout plus a UTF-8 invariant enforced at every safe construction point; byte-offset slicing on user text is a latent panic on any non-ASCII input.
- `split_at_mut` is the load-bearing primitive behind safe data-parallel processing over a single buffer — reach for it before `unsafe` any time you need two independently-mutable views into one slice.

Next: Lifetimes — the compile-time vocabulary that makes it safe to hand out a slice (or any reference) in the first place.
