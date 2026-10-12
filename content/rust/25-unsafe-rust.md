# 25 — Unsafe Rust

`unsafe` lets you do five things the compiler can't check. Inside an `unsafe` block **you** promise the rules are kept. If you break them, the result is **undefined behavior (UB)**: anything can happen, including "seems to work".

## The Five Unsafe Abilities

1. Dereference a raw pointer (`*const T`, `*mut T`)
2. Call an `unsafe fn` (including C functions)
3. Read or write a `static mut`
4. Implement an `unsafe trait` (like `Send`/`Sync`)
5. Read a `union` field

That's all. Everything else — borrow checking, type checking, bounds checks on `v[i]` — still works inside `unsafe`.

## Raw Pointers

**Tricky**: making a raw pointer is safe; **using** it is not:

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut x = 10;
    let p1 = &x as *const i32;      // safe — just an address
    let p2 = &mut x as *mut i32;    // safe — and yes, a *const and *mut to the same place

    // println!("{}", *p1);         // error[E0133]: dereference of raw pointer is unsafe
    unsafe {
        *p2 += 1;
        println!("{}", *p1);        // 11
    }
}
```
::

Raw pointers can be null, dangling or misaligned — the compiler doesn't check:

::code-wrapper{language="rust"}
```rust
fn main() {
    let p: *const i32 = std::ptr::null();
    println!("{:?}", unsafe { p.as_ref() });   // None — as_ref() checks for null for you

    let dangling = {
        let y = 5;
        &y as *const i32
    };                                          // y is gone
    // unsafe { println!("{}", *dangling) }    // UB — may print 5, garbage, or crash
}
```
::

## `unsafe` Does Not Switch Off the Borrow Checker

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut x = 5;
    unsafe {
        let a = &mut x;
        // let b = &mut x;     // error[E0499]: cannot borrow `x` as mutable more than once at a time
        *a += 1;
    }
}
```
::

References keep all their rules. Only raw pointers escape them.

## Unchecked Operations

::code-wrapper{language="rust"}
```rust
fn main() {
    let v = vec![1, 2, 3];
    let third = unsafe { *v.get_unchecked(2) };   // no bounds check
    println!("{third}");                          // 3
    // unsafe { *v.get_unchecked(10) };           // UB — not a panic, reads random memory
}
```
::

Normal `v[10]` panics safely. `get_unchecked(10)` does **not** panic — it's UB. The safe version is almost always fast enough.

## Writing a Safe Wrapper

The right way to use `unsafe`: hide it inside a small function that **checks the rules first**, so callers can't misuse it:

::code-wrapper{language="rust"}
```rust
fn split_at_mut(v: &mut [i32], mid: usize) -> (&mut [i32], &mut [i32]) {
    let len = v.len();
    let ptr = v.as_mut_ptr();
    assert!(mid <= len, "mid out of range");     // the check that makes it safe
    // SAFETY: mid <= len, so [0, mid) and [mid, len) are in bounds and do not overlap.
    unsafe {
        (
            std::slice::from_raw_parts_mut(ptr, mid),
            std::slice::from_raw_parts_mut(ptr.add(mid), len - mid),
        )
    }
}

fn main() {
    let mut arr = [1, 2, 3, 4];
    let (a, b) = split_at_mut(&mut arr, 1);
    a[0] = 9;
    b[0] = 8;
    println!("{arr:?}");   // [9, 8, 3, 4]
}
```
::

Without the `assert!`, `split_at_mut(&mut arr, 10)` would create slices past the end — UB reachable from **safe** code. That makes the function **unsound**, even though callers never wrote `unsafe`.

## `unsafe fn`

::code-wrapper{language="rust"}
```rust
/// # Safety
/// `p` must be non-null, aligned, and point to a live `i32`.
unsafe fn read(p: *const i32) -> i32 {
    // In edition 2024, the body is NOT automatically unsafe:
    // `*p` alone gives: warning[E0133]: dereference of raw pointer is unsafe and requires unsafe block
    unsafe { *p }
}

fn main() {
    let x = 42;
    // SAFETY: &x is a valid, aligned pointer to a live i32.
    let v = unsafe { read(&x) };
    println!("{v}");
}
```
::

## `static mut`

::code-wrapper{language="rust"}
```rust
static mut COUNT: u32 = 0;

fn main() {
    unsafe { COUNT += 1; }          // fine in one thread; a data race (UB) with two
    let c = unsafe { COUNT };
    println!("{c}");
}
```
::

Prefer `AtomicU32` or `Mutex` — they need no `unsafe` (chapter 03, 22).

## `transmute` — Reinterpret Bits

::code-wrapper{language="rust"}
```rust
fn main() {
    let bits: u32 = unsafe { std::mem::transmute(1.0f32) };
    println!("{bits:#x}");                    // 0x3f800000
    println!("{:#x}", 1.0f32.to_bits());      // same, and safe — prefer this

    // let b: bool = unsafe { std::mem::transmute(2u8) };   // UB — a bool must be 0 or 1
}
```
::

There is almost always a safe function for what you want (`to_bits`, `from_le_bytes`, `as`).

## 💡 Tips & Tricks

- **Idiom** — keep `unsafe` blocks tiny and put a `// SAFETY:` comment above each one explaining why it is OK.
- **Idiom** — document `unsafe fn` with a `# Safety` section listing what the caller must guarantee.
- **Debug** — run tests under Miri (`cargo +nightly miri test`) — it detects many kinds of UB.
- **Lint** — `#![forbid(unsafe_code)]` in crates that should never need it.
- **Idiom** — before writing `unsafe`, search the standard library; `split_at_mut`, `swap`, `chunks_mut`, `to_bits` probably already exist.

## ⚠️ Edge Cases & Gotchas

- **Scope** — `unsafe` does not disable borrow checking or type checking.
- **Raw pointers** — creating them is safe; dereferencing is unsafe.
- **UB** — out-of-bounds `get_unchecked`, dangling pointers, invalid `bool`/`char`/enum values: no panic, just undefined behavior.
- **Soundness** — a safe function that lets callers trigger UB is a bug in that function.
- **Edition 2024** — operations inside an `unsafe fn` still need their own `unsafe { }` block.
- **"Works for me"** — UB can pass every test and break with a new compiler version or optimization level.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
pub fn first_two(v: &[u8]) -> (u8, u8) {
    unsafe { (*v.get_unchecked(0), *v.get_unchecked(1)) }
}

fn main() {
    println!("{:?}", first_two(&[7, 8, 9]));
    println!("{:?}", first_two(&[7]));
}
```
::

<details>
<summary>Answer</summary>

`first_two(&[7])` reads index `1` of a 1-element slice — **undefined behavior**. It might print a random byte, crash, or seem fine. Because `first_two` is a public **safe** function, any caller can trigger UB without writing `unsafe`: the function is unsound.

Use the safe API — it is just as fast here:

::code-wrapper{language="rust"}
```rust
pub fn first_two(v: &[u8]) -> Option<(u8, u8)> {
    match v {
        [a, b, ..] => Some((*a, *b)),
        _ => None,
    }
}
```
::

</details>

## Summary

`unsafe` unlocks five extra abilities and makes you responsible for upholding the rules. Keep it small, wrap it in safe functions that validate inputs, document every `SAFETY` assumption, and test with Miri.

Next: FFI.
