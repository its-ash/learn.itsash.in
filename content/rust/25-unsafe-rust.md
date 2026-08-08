# 25 — Unsafe Rust

`unsafe` lets you do things the compiler can't verify. It doesn't turn off the borrow checker — it adds five **superpowers**:

1. Dereference raw pointers (`*const T`, `*mut T`).
2. Call `unsafe` functions (including FFI).
3. Implement `unsafe` traits (e.g., `Send`/`Sync`).
4. Access/mutate `static mut` globals.
5. Access union fields.

The rest of Rust still applies (borrowing, types, lifetimes). Unsafe is a contract: **you** prove soundness; the compiler trusts you.

## `unsafe` Blocks

::code-wrapper{language="rust"}
```rust
let p: *const i32 = &5;
unsafe {
    println!("{}", *p);
}
```
::

`unsafe fn` is a function whose body requires unsafe — calling it from safe code is allowed only in an `unsafe` block (or `unsafe fn`).

::code-wrapper{language="rust"}
```rust
unsafe fn dangerous() {}
unsafe { dangerous(); }   // OK
```
::

In edition 2024+, calling `unsafe fn` inside `unsafe fn` also requires an explicit `unsafe` block (no longer implicit).

## Raw Pointers

::code-wrapper{language="rust"}
```rust
let x = 5;
let p1: *const i32 = &x;        // implicit coercion
let p2: *mut i32 = &mut x as *mut i32;

unsafe { println!("{} {}", *p1, *p2); }
```
::

- `*const T` (read-only) and `*mut T` (writable).
- Can be created from any reference, even outside `unsafe`.
- Dereferencing requires `unsafe`.
- Not `Send`/`Sync` by default.

### Validity Invariants

Reading a `*const T` requires the pointer to point to a valid `T` (properly initialized, properly aligned). Dereferencing an uninitialized or misaligned pointer is **undefined behavior (UB)**.

## FFI

::code-wrapper{language="rust"}
```rust
extern "C" {
    fn abs(x: i32) -> i32;
}

fn main() {
    unsafe { println!("{}", abs(-5)); }
}
```
::

Calling C functions requires `unsafe`. Functions can be marked `extern "C"`:

::code-wrapper{language="rust"}
```rust
#[no_mangle]
pub extern "C" fn add(a: i32, b: i32) -> i32 { a + b }
```
::

`#[no_mangle]` preserves the symbol name for C to call. `extern "C"` sets the ABI.

## `unsafe` Traits

::code-wrapper{language="rust"}
```rust
unsafe trait TrustedIter {}
unsafe impl TrustedIter for std::slice::Iter<'static, u8> {}
```
::

`Send` and `Sync` are unsafe traits; the compiler auto-derives them, but you can opt in via `unsafe impl` if you've verified thread-safety.

::code-wrapper{language="rust"}
```rust
struct MyType(*mut u8);
unsafe impl Send for MyType {}     // we promise the pointer is safe to move to another thread
```
::

## `static mut`

::code-wrapper{language="rust"}
```rust
static mut COUNTER: u32 = 0;

fn incr() {
    unsafe { COUNTER += 1; }
}
```
::

- Reading/writing requires `unsafe`.
- No synchronization — use atomics instead.

## Unions

::code-wrapper{language="rust"}
```rust
union Value {
    int_val: i32,
    float_val: f32,
}

let v = Value { int_val: 5 };
unsafe { println!("{}", v.float_val); }   // ⚠️ UB if int_val was the active field
```
::

Unions overlap memory; reading the inactive field is UB. Reading requires `unsafe`. Useful for FFI/C interop; otherwise use enums.

## `MaybeUninit<T>` — Uninitialized Memory

::code-wrapper{language="rust"}
```rust
use std::mem::MaybeUninit;

let mut mu: MaybeUninit<Vec<u8>> = MaybeUninit::uninit();
unsafe { mu.write(Vec::new()); }
let v: Vec<u8> = unsafe { mu.assume_init() };
```
::

`MaybeUninit<T>` is the safe way to *hold* uninitialized memory; reading it requires `unsafe`. The standard alternative to uninitialized `mem::uninitialized` (deprecated).

## `ManuallyDrop<T>` — Suppress Drop

::code-wrapper{language="rust"}
```rust
use std::mem::ManuallyDrop;
let s = ManuallyDrop::new(String::from("hi"));
// s's destructor won't run; manual cleanup needed
unsafe { drop(ManuallyDrop::into_inner(s)) };   // no, into_inner extracts
```
::

`ManuallyDrop<T>` wraps a `T` and disables its `Drop`. Use `ManuallyDrop::into_inner` to recover the value, or `unsafe { ManuallyDrop::take(&mut md) }` to extract without dropping.

## Splitting Borrows Safely

::code-wrapper{language="rust"}
```rust
let mut v = vec![1, 2, 3, 4];
let slice: &mut [i32] = &mut v[..];
let (left, right) = slice.split_at_mut(2);
// left = &mut [1, 2], right = &mut [3, 4]
```
::

`split_at_mut` is internally `unsafe` because the compiler can't prove disjointness, but it's a safe API.

## Unsafe Code Soundness

A piece of `unsafe` code is **sound** if safe code can't trigger UB through its public API. Writing sound `unsafe` requires:

- Reasoning about aliasing, alignment, lifetimes, initialization, thread-safety.
- Documenting invariants (`// SAFETY: ...`).
- Considering all possible inputs.
- Not leaking `unsafe` to safe callers.

Miri (`cargo +nightly miri test`) is a tool that detects UB in unsafe code at runtime — use it.

## `miri`

::code-wrapper{language="bash"}
```bash
rustup +nightly component add miri
cargo +nightly miri test
```
::

Miri interprets your code and catches many UB forms (invalid pointer arithmetic, unaligned access, data races in some cases, use of uninitialized memory). Doesn't catch all bugs but catches many.

## Common Sources of UB

- Dereferencing a NULL, dangling, or misaligned pointer.
- Reading uninitialized memory as a typed value.
- Reading a union's inactive field.
- Data races (concurrent reads + writes to the same memory without synchronization).
- Mutating immutable data (via `unsafe`).
- Calling a function with the wrong ABI.
- Violating the `Drop` ordering or skipping destructors of owned data.
- Integer overflow in `unsafe` (e.g., pointer arithmetic that wraps).
- Unwinding across FFI boundaries (set `panic = "abort"` or use `catch_unwind`).
- Constructing invalid enum values (e.g., transmuting a number to `Option<NonNull<T>>` that creates `Some(null)`).

## `unsafe` Patterns

### Safe Abstractions over Unsafe

The idiomatic way: expose a safe API, do the unsafe internally:

::code-wrapper{language="rust"}
```rust
pub fn first_byte(s: &str) -> u8 {
    let ptr = s.as_ptr();
    unsafe { *ptr }   // SAFETY: ptr is valid (s is a valid &str)
}
```
::

Comment with `// SAFETY:` explaining why each unsafe operation is sound.

### `unsafe impl Send`/`Sync`

Only when you've verified the type can be safely transferred/shared across threads. Usually because the inner is `Send`/`Sync` via raw pointer you control.

### Reusing Raw Memory

::code-wrapper{language="rust"}
```rust
let mut buf: Vec<u8> = Vec::with_capacity(100);
let ptr = buf.as_mut_ptr() as *mut u64;
unsafe { *ptr = 5; }   // ⚠️ requires valid alignment and within capacity
```
::

`Vec<u8>` allocations are aligned to `u8`, **not** `u64`. To get a properly-aligned buffer, use `Vec<u64>` directly or `alloc::alloc_aligned`.

## FFI Patterns

### Owning Foreign Memory

::code-wrapper{language="rust"}
```rust
struct Buffer(*mut u8, usize);
impl Drop for Buffer {
    fn drop(&mut self) {
        unsafe { free(self.0) }
    }
}
unsafe impl Send for Buffer {}
```
::

RAII: the constructor allocates, `Drop` deallocates.

### `extern "C"` Block with Variadics

::code-wrapper{language="rust"}
```rust
extern "C" {
    fn printf(fmt: *const u8, ...) -> i32;
}
```
::

### `link` Attributes

::code-wrapper{language="rust"}
```rust
#[link(name = "crypto")]
extern "C" {
    fn sha256(input: *const u8, len: usize) -> *mut u8;
}
```
::

## `#[no_mangle]`, `#[export_name]`, `#[link_name]`

- `#[no_mangle]`: keep the function's name as-is in the symbol table.
- `#[export_name = "foo"]`: rename the exported symbol.
- `#[link_name = "..."]`: rename the symbol you're linking against.

## Bindgen

Use `bindgen` to auto-generate Rust FFI bindings from C headers:

::code-wrapper{language="toml"}
```toml
[build-dependencies]
bindgen = "0.69"
```
::

::code-wrapper{language="rust"}
```rust
// build.rs
fn main() {
    let bindings = bindgen::Builder::default()
        .header("wrapper.h")
        .generate().unwrap();
    bindings.write_to_file("src/bindings.rs").unwrap();
}
```
::

## `extern "C"` vs `extern "Rust"`

The default ABI is `extern "Rust"` (not stable to name explicitly until 1.86+). C ABI is `extern "C"`. Other ABIs: `stdcall`, `system` (Windows: `stdcall` on x86, `C` on x64), `aapcs`, `fastcall`, `win64`, `sysv64`.

## 💡 Tips & Tricks

- **Debug**: run `cargo +nightly miri test` on every crate that contains `unsafe`, as a matter of habit, not just when something looks wrong — Miri catches classes of UB (misaligned access, invalid pointer arithmetic, uninitialized reads) that pass ordinary tests and even sanitizers on some platforms.
- **Idiom**: write a `// SAFETY:` comment immediately above *every* `unsafe` block, explaining precisely which invariant the surrounding code guarantees and why the operation is sound given it — treat an `unsafe` block without one as incomplete, the same way you'd treat a public function without documentation.
- **Idiom**: keep `unsafe` blocks as small as possible — wrap only the single operation that requires it, not the surrounding safe logic, so a reviewer (and Miri) can audit the minimal surface that actually needs scrutiny.
- **Debug**: `cargo expand` on code using `#[repr(C)]`/FFI types can help confirm the layout the compiler actually generated matches your assumption, before you trust it in an `unsafe` cast.
- **Idiom**: prefer existing safe abstractions (`split_at_mut`, `Cell`, `RefCell`, `MaybeUninit`) over hand-rolled `unsafe` for a problem the standard library has already solved soundly — reinventing these is a common source of subtly unsound code.
- **Debug**: if you're tempted to reach for `std::mem::transmute`, search first for a safe, purpose-built conversion (`From`/`TryFrom`, `f32::from_bits`, `u32::from_ne_bytes`, etc.) — `transmute` is almost never the only option, and it's one of the easiest ways to introduce UB via a size or validity mismatch.

## ⚠️ Edge Cases & Gotchas

- **`unsafe` doesn't disable the borrow checker**: you still can't have aliasing `&mut T` even with `unsafe`.
- **`unsafe fn` body has implicit unsafe in pre-2024 editions**: 2024 changes this — explicit `unsafe` blocks required inside.
- **`std::mem::transmute`**: reinterprets bytes as another type. Extremely dangerous (size/validity/alignment). Avoid; use specific methods.
- **`std::mem::transmute_copy`**: reads bytes from one place as another type — also very dangerous.
- **`unsafe` and `async`**: async unsafe functions are unstable; you can wrap blocking unsafe calls in `spawn_blocking`.
- **`static mut` races**: undetectable by `cargo test` in many cases; use atomics.
- **`Cell`/`RefCell` and `Send`**: not `Sync`, but they are `Send` if `T: Send`.
- **Pin and `unsafe`**: implementing your own `Future` requires `unsafe` because of `Pin` invariants.

## 🧠 Spot the Bug

Why is this "optimization" undefined behavior, even though it looks like harmless pointer arithmetic?

::code-wrapper{language="rust"}
```rust
fn sum_as_u64_pairs(bytes: &[u8]) -> u64 {
    let ptr = bytes.as_ptr() as *const u64;
    let count = bytes.len() / 8;
    let mut total = 0u64;
    for i in 0..count {
        total = total.wrapping_add(unsafe { *ptr.add(i) });
    }
    total
}

fn main() {
    let data: Vec<u8> = (0..64).collect();
    println!("{}", sum_as_u64_pairs(&data[1..]));
}
```
::

<details>
<summary>Answer</summary>

This is undefined behavior due to **misaligned access**, and it can crash, produce garbage, or "work" depending on the platform and optimization level — none of which makes it correct.

`bytes.as_ptr()` for a `Vec<u8>` (or a `&[u8]`) is only guaranteed to be aligned to `u8`'s alignment, which is 1 byte. Casting that pointer to `*const u64` and dereferencing it requires the pointer to be aligned to `u64`'s alignment (typically 8 bytes) — but nothing about a `&[u8]` guarantees this, and slicing with `&data[1..]` deliberately shifts the starting address by one byte, making misalignment from a `u64` boundary the common case rather than a rare edge case. Reading through a misaligned pointer of this kind is UB in Rust regardless of whether the target CPU architecture happens to tolerate unaligned reads at the hardware level (x86 mostly does, silently; many ARM configurations either fault or read incorrect data) — the language-level rule is about the type's alignment invariant, not what the hardware can physically survive. This is exactly the trap called out for `Vec<u8>` buffers reused as `*mut u64` elsewhere in this chapter: the allocation's alignment matches the *original* element type, not whatever you later cast it to.

The sound fix is to either allocate the buffer as `Vec<u64>` from the start (guaranteeing the right alignment) or read via `u64::from_ne_bytes` on a byte-slice chunk (no unsafe pointer cast needed, and no alignment requirement):

::code-wrapper{language="rust"}
```rust
fn sum_as_u64_pairs(bytes: &[u8]) -> u64 {
    bytes.chunks_exact(8)
        .map(|chunk| u64::from_ne_bytes(chunk.try_into().unwrap()))
        .fold(0u64, u64::wrapping_add)
}
```
::

**The lesson**: casting a byte pointer to a wider-type pointer and dereferencing it is UB unless you've independently guaranteed the correct alignment — the type system's alignment invariant is a language rule, not a suggestion the hardware happens to enforce for you.

</details>

## `unsafe` Anti-Patterns

- **`unsafe impl Send for Rc<T>`**: `Rc` has a non-atomic refcount; making it `Send` causes data races.
- **Bare `*mut T` in public API**: exposes raw pointer semantics; wrap in a safe abstraction.
- **`transmute` for type conversions**: use `From`/`TryFrom`.
- **`unsafe fn` returning `&'static T`** without `'static` input: usually lies.
- **Assuming pointer alignment**: `&[u8]` is aligned to 1; casting to `&u64` is UB unless you check.

## When to Use Unsafe

- FFI to C.
- Implementing low-level collections (`Vec`, `HashMap`, `VecDeque` internals).
- Performance-critical code that can't be expressed safely (rare; usually the compiler is fine).
- Interfacing with the OS (syscalls).
- Implementing `Send`/`Sync` for a wrapper you control.

Most Rust code is **fully safe**. Use `unsafe` sparingly; confine it to small, well-reviewed modules.

## Summary

`unsafe` gives you five superpowers; the rest of Rust still applies. Aim for **safe abstractions**: do the unsafe internally, expose a safe API, document `// SAFETY:` invariants. Use `Miri` to catch UB. `MaybeUninit`/`ManuallyDrop` are safer than the legacy uninitialized-memory APIs. Confine `unsafe` to small audited surfaces.

Next: FFI deep dive.