# 25 — Unsafe Rust: Where the Compiler Stops Proving and You Start

`unsafe` doesn't turn off the borrow checker, doesn't disable type checking, and doesn't make Rust "behave like C." It unlocks exactly five operations the compiler cannot statically verify — you supply the proof instead. Get it wrong and you don't get a panic, you get undefined behavior, which the optimizer is licensed to exploit arbitrarily.

## Under-the-Hood Mechanics

### What "undefined behavior" actually means to the compiler

UB lets the **optimizer assume the violation never happens** — it generates code that's correct *only* under that assumption.

::code-wrapper{language="rust"}
```rust
// Reading an uninitialized bool is UB, not "reads garbage 0 or 1":
use std::mem::MaybeUninit;
let x: bool = unsafe {
    let mu = MaybeUninit::<bool>::uninit();
    mu.assume_init()   // LIES to the compiler: "this is definitely initialized"
};
// The compiler may now generate code that, e.g., branches on `x` in a way
// that assumes x ∈ {true, false} strictly — if the actual bit pattern is
// neither (say, 0x42), behavior is genuinely undefined, not "42 happens to work."
```
::

Same mechanism, a form nobody notices in review — an "impossible" branch the optimizer deletes outright:

::code-wrapper{language="rust"}
```rust
unsafe fn danger(x: u8) -> u8 {
    // SAFETY (deliberately violated for illustration): caller must guarantee x < 10
    std::hint::assert_unchecked(x < 10);
    if x < 10 { x } else { 255 }   // optimizer may erase the `else` branch entirely —
                                    // it "knows" x < 10 always holds, per your assertion
}

fn main() {
    println!("{}", unsafe { danger(200) }); // NOT guaranteed to print 255 — UB
}
```
::

### The five superpowers, one minimal example each

```rust
// 1. Raw pointer dereference — no lifetime, no aliasing info
let n = 5;
let p = &n as *const i32;
unsafe { println!("{}", *p); }

// 2. Calling an unsafe fn — proof obligation moves to the caller
unsafe fn danger() -> i32 { 42 }
unsafe { danger(); }

// 3. Implementing an unsafe trait — you assert a property the compiler can't check
unsafe trait Poddable {}
unsafe impl Poddable for u32 {}

// 4. static mut access — no type-level "single writer" guarantee
static mut COUNTER: u32 = 0;
unsafe { COUNTER += 1; }

// 5. Union field access — no discriminant to check before reading
union U { i: u32, f: f32 }
let u = U { i: 1 };
unsafe { println!("{}", u.i); }
```

### `#[repr(Rust)]` vs `#[repr(C)]` — the ABI layer unsafe code must reason about

`#[repr(Rust)]` (the implicit default) makes **no layout guarantees**. `#[repr(C)]` fixes field order and padding to match the platform's C ABI. Any `unsafe` reinterpretation of raw bytes as a struct requires the latter.

::code-wrapper{language="rust"}
```rust
use std::mem::size_of;

#[repr(Rust)]   // default — layout is UNSPECIFIED, may reorder fields for optimal packing
struct A { a: u8, b: u64, c: u8 }

#[repr(C)]      // layout matches C's struct layout rules — fields stay in declared order
struct B { a: u8, b: u64, c: u8 }

// size_of::<A>() and size_of::<B>() may differ, and A's actual field order
// in memory is NOT guaranteed to match source order at all.
println!("{} {}", size_of::<A>(), size_of::<B>());
```
::

FFI reinterpretation done right vs. done wrong:

::code-wrapper{language="rust" filename="repr_ffi.rs"}
```rust
// WRONG: no repr — transmuting bytes into this is UB even if it "looks right"
struct Header { flags: u8, len: u32, id: u8 }

// RIGHT: fixed C layout — this is the only kind of struct safe to transmute/FFI
#[repr(C)]
struct HeaderC { flags: u8, len: u32, id: u8 }

fn from_bytes(buf: [u8; 12]) -> HeaderC {
    unsafe { std::mem::transmute(buf) }   // sound only because of #[repr(C)]
}
```
::

### `MaybeUninit<T>` has no validity invariant — that's the entire point

Every ordinary `T` carries a **validity invariant** (a `bool` must be `0`/`1`, a reference non-null). `MaybeUninit<T>` has none — any bit pattern is valid, so construction is safe but extraction (`assume_init`) is `unsafe`.

::code-wrapper{language="rust"}
```rust
use std::mem::MaybeUninit;

// Building an array element-by-element without a wasted default-init pass
fn build_array() -> [u32; 4] {
    let mut arr: [MaybeUninit<u32>; 4] = [const { MaybeUninit::uninit() }; 4];
    for (i, slot) in arr.iter_mut().enumerate() {
        slot.write((i as u32) * 10);
    }
    unsafe { std::mem::transmute::<_, [u32; 4]>(arr) } // sound: every slot was written
}

// WRONG variant: forgetting one slot — assume_init() on a partially-init array is UB
fn build_array_bug() -> [u32; 4] {
    let mut arr: [MaybeUninit<u32>; 4] = [const { MaybeUninit::uninit() }; 4];
    for slot in arr.iter_mut().take(3) {   // off-by-one: index 3 never written
        slot.write(1);
    }
    unsafe { std::mem::transmute::<_, [u32; 4]>(arr) } // UB: reads uninitialized u32
}
```
::

### Splitting mutable borrows: why `split_at_mut` needs `unsafe` internally but is a safe API

The borrow checker works on **whole values** — it can't prove two index ranges of the same slice don't alias. `split_at_mut` proves it once, internally, behind a safe signature:

::code-wrapper{language="rust"}
```rust
fn split_at_mut_demo(v: &mut [i32], mid: usize) -> (&mut [i32], &mut [i32]) {
    let len = v.len();
    assert!(mid <= len);              // the check that makes the unsafe below sound
    let ptr = v.as_mut_ptr();
    unsafe {
        (
            std::slice::from_raw_parts_mut(ptr, mid),
            std::slice::from_raw_parts_mut(ptr.add(mid), len - mid),
        )
    }
}

fn main() {
    let mut v = vec![1, 2, 3, 4, 5, 6];
    let (a, b) = split_at_mut_demo(&mut v, 3);
    a[0] = 100;
    b[0] = 200;               // disjoint memory — no data race, no aliasing UB
    println!("{a:?} {b:?}");
}
```
::

Drop the bounds check and the same shape becomes unsound — a safe caller can trigger UB:

::code-wrapper{language="rust"}
```rust
// BAD: no `assert!(mid <= len)` — a safe caller passing mid > len gets UB silently
fn split_at_mut_unsound(v: &mut [i32], mid: usize) -> (&mut [i32], &mut [i32]) {
    let len = v.len();
    let ptr = v.as_mut_ptr();
    unsafe {
        (
            std::slice::from_raw_parts_mut(ptr, mid),         // mid > len: out-of-bounds slice
            std::slice::from_raw_parts_mut(ptr.add(mid), len - mid), // len - mid underflows
        )
    }
}
```
::

## Cost, Performance, and Trade-Offs

| Technique | Runtime cost | What it buys you | What you must personally guarantee |
|---|---|---|---|
| Raw pointer deref (`unsafe { *p }`) | Zero beyond a normal load/store — no bounds/null/alignment check at runtime | Bypassing borrow-checker aliasing rules, arbitrary pointer arithmetic | Non-null, aligned, points to valid, initialized `T`, no concurrent aliasing violation |
| `unsafe impl Send`/`Sync` | Zero | Opting a type into cross-thread use the compiler couldn't derive automatically | The type is genuinely safe to move/share across threads — a wrong claim causes real, silent data races in otherwise-safe code |
| `static mut` | Zero (same as any global) | A mutable global without wrapping in `Mutex`/`OnceLock` | No concurrent access without external synchronization — the compiler enforces nothing here |
| `MaybeUninit<T>` | Zero — same layout as `T`, just without the validity guarantee | Holding uninitialized/partially-initialized memory safely until ready | You call `assume_init()` only once the value is genuinely, fully initialized |
| `transmute::<A, B>` | Zero — a pure reinterpretation, no instructions generated for "safe" cases | Reinterpreting bits as another type in cases no safe conversion covers | `size_of::<A>() == size_of::<B>()`, and every bit pattern of `A` must be valid for `B` |
| `split_at_mut`-style safe unsafe wrappers | Zero over hand-written unsafe — same generated code | Safe API surface hiding a proven-once unsafe implementation | The wrapper's *author* discharges the proof once; callers discharge nothing |
| Miri (`cargo +nightly miri test`) | Significant slowdown (10-100x) — it's an interpreter, not compiled execution | Catches many UB classes dynamically that no other tool does | N/A — a testing cost, not a production one |

The performance case for `unsafe` is frequently overstated: LLVM often eliminates bounds checks it can prove unreachable, so safe and unsafe indexing frequently compile to the same code.

::code-wrapper{language="rust"}
```rust
// Safe — LLVM commonly hoists/removes the bounds check here entirely,
// because the loop bound is provably == v.len()
fn sum_safe(v: &[i32]) -> i32 {
    let mut total = 0;
    for i in 0..v.len() { total += v[i]; }
    total
}

// Unsafe — same generated code in practice, but now YOU own the proof
fn sum_unsafe(v: &[i32]) -> i32 {
    let mut total = 0;
    for i in 0..v.len() { total += unsafe { *v.get_unchecked(i) }; }
    total
}
```
::

The ledger is asymmetric: a wrong `unsafe` block doesn't cost a slow benchmark — it costs a production incident that may only reproduce on one allocator, one arch, one optimization level, and pass every existing test.

## Production Failure Modes & Anti-Patterns

### Anti-pattern: reinterpreting a byte buffer as a wider type without checking alignment

::code-wrapper{language="rust"}
```rust
// BAD: a mid-level dev optimizing a hot parsing loop, reaching for "zero-copy" reinterpretation
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
    println!("{}", sum_as_u64_pairs(&data[1..]));   // slicing off the first byte shifts alignment
}
```
::

This compiles clean and "works" on x86-64 (tolerates unaligned reads) for months — then crashes or silently corrupts on ARM (Graviton, Apple Silicon, embedded), because `bytes.as_ptr()` only guarantees 1-byte alignment and `&data[1..]` shifts the address off an 8-byte boundary. Nothing in `*const u64` syntax signals this.

**The fix**: alignment-agnostic byte conversion — same machine code where unaligned reads are cheap, correct code everywhere else.

::code-wrapper{language="rust"}
```rust
fn sum_as_u64_pairs(bytes: &[u8]) -> u64 {
    bytes.chunks_exact(8)
        .map(|chunk| u64::from_ne_bytes(chunk.try_into().unwrap()))
        .fold(0u64, u64::wrapping_add)
}
```
::

Correct-but-still-unsafe variant, for when you legitimately own the allocation's alignment:

::code-wrapper{language="rust"}
```rust
// OK: Vec<u64> guarantees 8-byte alignment from the start — no cast needed at all
fn sum_u64_vec(data: &[u64]) -> u64 {
    data.iter().fold(0u64, |acc, &x| acc.wrapping_add(x))
}
```
::

### Anti-pattern: `unsafe impl Send` on a type that isn't actually thread-safe

::code-wrapper{language="rust"}
```rust
use std::cell::Cell;

// BAD: a dev hits a `Send` compile error, doesn't investigate why, and "fixes" it
// by asserting Send without verifying the type is actually safe to share
struct Counter {
    value: Cell<u64>,   // Cell is explicitly non-atomic, single-thread-only by design
}

unsafe impl Send for Counter {}   // compiles! the compiler now trusts this completely

fn main() {
    let counter = Counter { value: Cell::new(0) };
    std::thread::spawn(move || {
        for _ in 0..1000 { counter.value.set(counter.value.get() + 1); }
    });
    // if another thread also touches `counter.value` concurrently, this is a data race —
    // UB that the type system was SUPPOSED to prevent, defeated by one unsafe impl
}
```
::

`Cell<T>` is deliberately `!Sync`. This only forces `Send`, but sharing it back via `Arc<Counter>` turns the non-atomic read-modify-write into a silent data race that most local stress tests never surface.

**The fix**: don't paper over a `Send`/`Sync` compile error with `unsafe impl` — use the genuinely synchronized primitive.

::code-wrapper{language="rust"}
```rust
use std::sync::atomic::{AtomicU64, Ordering};

struct Counter { value: AtomicU64 }   // Send + Sync, safely, with no unsafe at all

fn main() {
    let counter = std::sync::Arc::new(Counter { value: AtomicU64::new(0) });
    let c = std::sync::Arc::clone(&counter);
    std::thread::spawn(move || {
        for _ in 0..1000 { c.value.fetch_add(1, Ordering::Relaxed); }
    });
}
```
::

The `Arc<RefCell<T>>` trap this enables — compiles, races silently:

::code-wrapper{language="rust"}
```rust
use std::cell::RefCell;
use std::sync::Arc;

// RefCell<T> is Send if T: Send, but NEVER Sync — yet Arc<RefCell<T>> still compiles
// and still lets two threads call .borrow_mut() concurrently: a real, silent data race
fn racy(shared: Arc<RefCell<u64>>) {
    let s = Arc::clone(&shared);
    std::thread::spawn(move || { *s.borrow_mut() += 1; });
    *shared.borrow_mut() += 1;   // no compiler error — RefCell's runtime check can
                                  // still be raced past under real concurrency
}
```
::

### Anti-pattern: an unsound "safe" abstraction that lets outside code trigger UB

::code-wrapper{language="rust"}
```rust
// BAD: this function is declared safe, but safe callers CAN trigger UB through it —
// that makes it unsound, regardless of how carefully the unsafe block itself is written
pub fn get_unchecked_element(v: &[i32], index: usize) -> i32 {
    unsafe { *v.as_ptr().add(index) }   // no bounds check — index is fully caller-controlled
}

fn main() {
    let v = vec![1, 2, 3];
    println!("{}", get_unchecked_element(&v, 999));   // UB: out-of-bounds read, no panic
}
```
::

Soundness is about whether **any safe caller** can trigger UB through a safe signature — not whether the unsafe block "looks careful." Here nothing signals the caller-must-uphold invariant, so an out-of-range index reads adjacent heap memory with no panic, no error, no signal.

**The fix**: either keep the function `unsafe` (proof obligation pushed to caller, documented) or bounds-check and stay fully safe.

::code-wrapper{language="rust"}
```rust
// Option A: genuinely unsafe, with the contract documented and enforced by the type
/// # Safety
/// `index` must be `< v.len()`.
pub unsafe fn get_unchecked_element(v: &[i32], index: usize) -> i32 {
    *v.as_ptr().add(index)
}

// Option B: fully safe — pay the bounds-check cost, which LLVM often eliminates anyway
pub fn get_checked_element(v: &[i32], index: usize) -> Option<i32> {
    v.get(index).copied()
}
```
::

## Architectural Application

**Confine `unsafe` to small, auditable modules with a documented contract.**

::code-wrapper{language="rust"}
```rust
/// # Safety
/// `ptr` must be non-null, aligned, and valid for reads of `len` elements.
pub unsafe fn from_raw_parts_checked<T>(ptr: *const T, len: usize) -> &'static [T] {
    // SAFETY: caller upholds the contract documented above.
    unsafe { std::slice::from_raw_parts(ptr, len) }
}
```
::

**Safe abstractions are the deliverable — the `split_at_mut` shape, generalized:**

::code-wrapper{language="rust" filename="ring_buffer.rs"}
```rust
pub struct RingBuffer<T> { buf: Vec<T>, head: usize }

impl<T: Copy + Default> RingBuffer<T> {
    // Public API is 100% safe — callers never see the unsafe internals
    pub fn peek_unordered(&self, i: usize) -> Option<T> {
        (i < self.buf.len()).then(|| unsafe { *self.buf.as_ptr().add((self.head + i) % self.buf.len()) })
    }
}
```
::

**FFI is the primary legitimate entry point for `unsafe` in application code:**

::code-wrapper{language="rust" filename="ffi.rs"}
```rust
#[repr(C)]
pub struct CPoint { x: f64, y: f64 }

extern "C" { fn native_distance(a: *const CPoint, b: *const CPoint) -> f64; }

pub fn distance(a: &CPoint, b: &CPoint) -> f64 {
    // SAFETY: both pointers are valid, non-null, and #[repr(C)]-compatible with the C side.
    unsafe { native_distance(a as *const _, b as *const _) }
}
```
::

**Miri as a mandatory CI gate for any crate containing `unsafe`:**

::code-wrapper{language="bash"}
```bash
cargo +nightly miri test   # catches misaligned access, invalid provenance, some data races
                            # that pass ordinary `cargo test` for months
```
::

## 💡 Tips & Tricks

- **Debug**: run Miri on every `unsafe`-containing crate as habit, not just when something looks wrong:
  ::code-wrapper{language="bash"}
  ```bash
  cargo +nightly miri test
  ```
  ::
- **Idiom**: a `// SAFETY:` comment above *every* `unsafe` block — no exceptions:
  ::code-wrapper{language="rust"}
  ```rust
  // SAFETY: `idx < self.len` checked by the caller-facing bounds check above this block.
  let v = unsafe { *self.buf.get_unchecked(idx) };
  ```
  ::
- **Idiom**: keep `unsafe` blocks minimal — wrap only the single operation, not the surrounding safe logic:
  ::code-wrapper{language="rust"}
  ```rust
  // BAD: whole function marked unsafe when only one line needs it
  unsafe fn total(v: &[i32]) -> i32 { v.iter().map(|x| x * 2).sum() } // no unsafe op at all!

  // GOOD: the unsafe surface is exactly one call
  fn first_unchecked(v: &[i32]) -> i32 { unsafe { *v.get_unchecked(0) } }
  ```
  ::
- **Debug**: confirm generated layout for `#[repr(C)]`/FFI types before trusting a cast:
  ::code-wrapper{language="bash"}
  ```bash
  cargo expand
  ```
  ::
- **Idiom**: prefer solved problems over hand-rolled unsafe:
  ::code-wrapper{language="rust"}
  ```rust
  // Instead of hand-rolled unsafe splitting logic, use the std one:
  let (left, right) = my_vec.split_at_mut(mid);
  ```
  ::
- **Debug**: before reaching for `transmute`, check for a purpose-built safe conversion:
  ::code-wrapper{language="rust"}
  ```rust
  // BAD:
  let bits: u32 = unsafe { std::mem::transmute(3.14f32) };
  // GOOD:
  let bits: u32 = 3.14f32.to_bits();
  ```
  ::
- **Performance**: benchmark before assuming unsafe indexing wins — often it doesn't, and it always carries risk safe code doesn't.

## ⚠️ Edge Cases & Gotchas

- **`unsafe` doesn't disable the borrow checker**:
  ::code-wrapper{language="rust"}
  ```rust
  let mut x = 1;
  let a = &mut x;
  let b = &mut x;   // still a compile error, even inside `unsafe { ... }`
  ```
  ::
- **Edition 2024 requires explicit `unsafe {}` even inside `unsafe fn`**:
  ::code-wrapper{language="rust"}
  ```rust
  unsafe fn deref(p: *const i32) -> i32 {
      *p   // edition 2024: compile error, not implicitly unsafe anymore
  }
  unsafe fn deref_fixed(p: *const i32) -> i32 {
      unsafe { *p } // required explicit block
  }
  ```
  ::
- **`transmute` same-size but different-validity types compiles and is UB**:
  ::code-wrapper{language="rust"}
  ```rust
  // Compiles fine, UB at runtime if the bit pattern isn't a valid bool:
  let sketchy: bool = unsafe { std::mem::transmute(2u8) };
  ```
  ::
- **`static mut` races are invisible to `cargo test`** — single-threaded tests never exercise the concurrent path that makes it unsound:
  ::code-wrapper{language="rust"}
  ```rust
  static mut COUNTER: u32 = 0;
  // Passes every single-threaded test. Races under real concurrency. No test catches this.
  fn increment() { unsafe { COUNTER += 1; } }
  ```
  ::
- **`Cell`/`RefCell` are `Send` but never `Sync`** — see the `Arc<RefCell<T>>` example above; it compiles, it is not sound.
- **Custom `Future::poll` requires `unsafe`** because of `Pin`'s "never moved after pinning" contract:
  ::code-wrapper{language="rust"}
  ```rust
  use std::pin::Pin;
  use std::task::{Context, Poll};
  struct MyFut;
  impl std::future::Future for MyFut {
      type Output = ();
      fn poll(self: Pin<&mut Self>, _cx: &mut Context) -> Poll<()> {
          // any unsafe pointer trick here must uphold Pin's move invariant manually
          Poll::Ready(())
      }
  }
  ```
  ::
- **Byte-slice pointers carry only 1-byte alignment, always** — see the `sum_as_u64_pairs` example above; this holds no matter how "aligned" the data looks.

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

This is undefined behavior due to **misaligned access** — it can crash, produce garbage, or "work," none of which makes it correct.

`bytes.as_ptr()` only guarantees 1-byte alignment. Casting to `*const u64` requires 8-byte alignment, and `&data[1..]` deliberately shifts off that boundary. UB holds regardless of whether the CPU tolerates unaligned reads (x86 mostly does; ARM often doesn't) — the language rule is about the type's alignment invariant, not hardware tolerance.

Fix: allocate as `Vec<u64>` from the start, or use `u64::from_ne_bytes` (no pointer cast, no alignment requirement):

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

## Summary

`unsafe` unlocks exactly five operations the compiler can't statically verify — raw pointer deref, `unsafe fn` calls, `unsafe trait` impls, `static mut` access, union field access — nothing else, and it does not disable the borrow checker. UB is a violated compiler assumption, not "wrong output," which is why bugs can look correct for months before a different arch or compiler version exposes them. Soundness is a property of the entire public API surface: a safe function any safe caller can drive into UB is unsound no matter how careful its internals look. The discipline that scales:

::code-wrapper{language="rust"}
```rust
// The pattern, end to end:
// 1. Small unsafe surface, documented contract
/// # Safety: `len` must not exceed the buffer's actual capacity.
unsafe fn raw_read(ptr: *const u8, len: usize) -> Vec<u8> {
    unsafe { std::slice::from_raw_parts(ptr, len).to_vec() }
}
// 2. Wrapped in a safe abstraction that upholds the contract for every caller
fn safe_read(buf: &[u8]) -> Vec<u8> {
    unsafe { raw_read(buf.as_ptr(), buf.len()) } // SAFETY: len == buf.len(), always in bounds
}
// 3. Verified continuously: `cargo +nightly miri test` in CI, every crate with unsafe
```
::

Next: FFI — calling C from Rust, calling Rust from C, and the ABI contract that makes it possible.
