# 09 — Slices

A **slice** is a borrowed view into part of an array, `Vec` or string. It stores only a pointer and a length — it never owns or copies data.

## Range Syntax

::code-wrapper{language="rust"}
```rust
fn main() {
    let a = [1, 2, 3, 4, 5];
    println!("{:?}", &a[1..3]);   // [2, 3]       — start included, end excluded
    println!("{:?}", &a[..2]);    // [1, 2]       — from the start
    println!("{:?}", &a[3..]);    // [4, 5]       — to the end
    println!("{:?}", &a[..=1]);   // [1, 2]       — end included
    println!("{:?}", &a[..]);     // [1, 2, 3, 4, 5]
    println!("{:?}", &a[5..]);    // []           — start == len is allowed (empty)
}
```
::

**Tricky**: these panic at run time:

::code-wrapper{language="rust"}
```rust
fn main() {
    let a = [1, 2, 3];
    let n = std::env::args().count() + 3;   // 4 at run time
    // &a[n..]      → panic: range start index 4 out of range for slice of length 3
    // &a[2..1]     → panic: slice index starts at 2 but ends at 1
    // &a[..n]      → panic: range end index 4 out of range for slice of length 3
    println!("{:?}", a.get(n..));           // None — the non-panicking version
}
```
::

## `&[T]` — Array and Vec Slices

::code-wrapper{language="rust"}
```rust
fn sum(values: &[i32]) -> i32 {
    values.iter().sum()
}

fn main() {
    let arr = [1, 2, 3];
    let v = vec![4, 5, 6];
    println!("{}", sum(&arr));        // array → slice
    println!("{}", sum(&v));          // Vec → slice
    println!("{}", sum(&v[1..]));     // part of a Vec
    println!("{}", sum(&[]));         // empty slice → 0
}
```
::

Useful slice methods:

::code-wrapper{language="rust"}
```rust
fn main() {
    let a = [1, 2, 3, 4, 5];
    println!("{:?}", a.first());                        // Some(1)
    println!("{:?}", a.last());                         // Some(5)
    println!("{:?}", a.split_first());                  // Some((1, [2, 3, 4, 5]))
    println!("{}", a.contains(&3));                     // true
    println!("{:?}", a.chunks(2).collect::<Vec<_>>());  // [[1, 2], [3, 4], [5]]
    for w in a.windows(2) { print!("{w:?} "); }         // [1, 2] [2, 3] [3, 4] [4, 5]
    println!();

    let empty: &[i32] = &[];
    println!("{:?} {:?}", empty.first(), empty.iter().max());  // None None
    println!("{}", a.windows(9).count());               // 0 — window bigger than slice: no panic
}
```
::

### Mutable slices

::code-wrapper{language="rust"}
```rust
fn double_all(values: &mut [i32]) {
    for x in values.iter_mut() {
        *x *= 2;
    }
}

fn main() {
    let mut v = vec![1, 2, 3, 4];
    double_all(&mut v[1..3]);   // only the middle two
    println!("{v:?}");          // [1, 4, 6, 4]

    v.sort();
    v.reverse();
    v.swap(0, 3);
    println!("{v:?}");          // [1, 4, 4, 6]
}
```
::

## `&str` — String Slices

A string literal is a `&str` (more precisely `&'static str`). Slicing a `String` also gives `&str`:

::code-wrapper{language="rust"}
```rust
fn main() {
    let s = String::from("hello world");
    let hello: &str = &s[0..5];
    let world: &str = &s[6..];
    println!("{hello}-{world}");    // hello-world

    let lit: &'static str = "baked into the binary";
    println!("{lit}");
}
```
::

**Tricky**: string ranges are **byte** positions. Cutting inside a multi-byte character panics:

::code-wrapper{language="rust"}
```rust
fn main() {
    let s = "héllo";                // é takes 2 bytes (positions 1 and 2)
    println!("{}", &s[0..1]);       // h
    println!("{}", &s[1..3]);       // é
    // &s[0..2]                     // panic: end byte index 2 is not a char boundary;
    //                              //        it is inside 'é' (bytes 1..3 of string)

    // Safe: cut by characters
    let first_two: String = s.chars().take(2).collect();
    println!("{first_two}");        // hé
    println!("{:?}", s.get(0..2));  // None — the non-panicking version
}
```
::

## Why Slices Protect You

::code-wrapper{language="rust"}
```rust
fn first_word(s: &str) -> &str {
    s.split(' ').next().unwrap_or("")
}

fn main() {
    let mut s = String::from("hello world");
    let w = first_word(&s);
    // s.clear();          // error[E0502]: cannot borrow `s` as mutable because it is also borrowed as immutable
    println!("{w}");       // hello
    s.clear();             // fine after the last use of w
}
```
::

If `first_word` returned an index (`5`) instead of a slice, `s.clear()` would compile and the index would silently point at nothing. A slice ties the result to the data.

**Tricky**: `split` keeps empty pieces:

::code-wrapper{language="rust"}
```rust
fn main() {
    println!("{:?}", "a,b,,c".split(',').collect::<Vec<_>>());      // ["a", "b", "", "c"]
    println!("{:?}", "  a  b ".split(' ').collect::<Vec<_>>());     // ["", "", "a", "", "b", ""]
    println!("{:?}", "  a  b ".split_whitespace().collect::<Vec<_>>()); // ["a", "b"]
    println!("[{}]", first_word(""));                               // [] — empty input, empty word
}

fn first_word(s: &str) -> &str { s.split(' ').next().unwrap_or("") }
```
::

## Two Mutable Halves

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut buf = [1, 2, 3, 4];
    // let a = &mut buf[..2];
    // let b = &mut buf[2..];   // error[E0499]: cannot borrow `buf` as mutable more than once
    let (a, b) = buf.split_at_mut(2);
    a[0] = 10;
    b[0] = 30;
    println!("{buf:?}");        // [10, 2, 30, 4]
}
```
::

## 💡 Tips & Tricks

- **Idiom** — take `&[T]` and `&str` parameters, not `&Vec<T>` / `&String`.
- **Safety** — `.get(i)` and `.get(a..b)` return `Option` instead of panicking — use them on untrusted indexes.
- **Idiom** — `windows(n)` and `chunks(n)` replace most hand-written index loops.
- **Debug** — "is not a char boundary" always means you sliced a string by a byte number that falls inside a character.
- **Idiom** — `split_whitespace()` instead of `split(' ')` when input may have repeated spaces.

## ⚠️ Edge Cases & Gotchas

- **Bounds** — `&a[len..]` is an empty slice (OK); `&a[len + 1..]` panics.
- **Order** — `&a[3..1]` panics; ranges are never reversed.
- **UTF-8** — `&s[0..2]` on `"héllo"` panics. String ranges are bytes, not characters.
- **Empty** — `first()`, `last()`, `iter().max()` return `None` on an empty slice.
- **Underflow** — `&v[v.len() - 3..]` underflows when `v.len() < 3` (see below).
- **Split** — `split(',')` keeps empty strings between consecutive separators.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
fn last_three(data: &[i32]) -> &[i32] {
    &data[data.len() - 3..]
}

fn main() {
    println!("{:?}", last_three(&[10, 20]));
}
```
::

<details>
<summary>Answer</summary>

`data.len()` is `2`, and `2 - 3` underflows a `usize`:

- debug: panic — attempt to subtract with overflow
- release: wraps to a huge number, then panics on the slice bounds check

Fix:

::code-wrapper{language="rust"}
```rust
fn last_three(data: &[i32]) -> &[i32] {
    let start = data.len().saturating_sub(3);   // 0 instead of underflow
    &data[start..]
}
```
::

**The lesson**: `len() - k` is a bug whenever the slice can be shorter than `k`.

</details>

## 🧠 Quick Quiz

::code-wrapper{language="rust"}
```rust
fn main() {
    let v = vec![1, 2, 3, 4, 5, 6];
    let s = &v[1..5];
    println!("{} {:?} {:?}", s.len(), &s[1..], s.chunks(3).last());
}
```
::

<details>
<summary>Answer</summary>

`4 [3, 4, 5] Some([5])` — `s` is `[2, 3, 4, 5]`. Slicing a slice re-counts from **its** start. The last chunk of 3 is just `[5]`.

</details>

## Summary

Slices (`&[T]`, `&str`) are borrowed views made of a pointer and a length. Ranges panic when out of bounds or (for strings) when they cut a character in half — use `.get()` when unsure.

Next: Lifetimes.
