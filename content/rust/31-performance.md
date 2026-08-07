# 31 — Performance, Profiling & Optimization

Rust gives you C-level performance by default, but you can still write slow Rust. This chapter covers how to find and fix bottlenecks.

## Mindset

1. **Don't optimize prematurely.** Write clear code; profile; optimize hot spots.
2. **Measure, measure, measure.** Intuition is often wrong.
3. **Iterate.** One change at a time; re-measure each time.

## Benchmarking

### `cargo bench` (nightly)

::code-wrapper{language="rust"}
```rust
#![feature(test)]
extern crate test;
use test::Bencher;

#[bench]
fn bench_add(b: &mut Bencher) {
    b.iter(|| test::black_box(2) + test::black_box(2));
}
```
::

`black_box` prevents the optimizer from constant-folding.

### `criterion` (stable, recommended)

::code-wrapper{language="rust"}
```rust
use criterion::{criterion_group, criterion_main, Criterion};

fn bench_fib(c: &mut Criterion) {
    c.bench_function("fib 20", |b| b.iter(|| fib(black_box(20))));
}

criterion_group!(benches, bench_fib);
criterion_main!(benches);
```
::

In `benches/my_bench.rs`. Run with `cargo bench`. Criterion provides statistics, regressions, and HTML reports.

### Custom Benchmarks

For ad-hoc timing:

::code-wrapper{language="rust"}
```rust
let start = std::time::Instant::now();
work();
let elapsed = start.elapsed();
```
::

## Profiling

### `perf` (Linux)

::code-wrapper{language="bash"}
```bash
cargo build --release
perf record -g ./target/release/my_app
perf report
```
::

For flamegraphs:

::code-wrapper{language="bash"}
```bash
cargo install flamegraph
cargo flamegraph
```
::

### `samply`

::code-wrapper{language="bash"}
```bash
cargo install samply
samply record ./target/release/my_app
```
::

Samply gives a web UI with call trees and source-level annotations.

### `Instruments` (macOS)

::code-wrapper{language="bash"}
```bash
xcrun xctrace record --template "Time Profiler" --launch ./target/release/my_app
```
::

### `dtrace`, `vtune` (advanced)

For deeper hardware analysis (cache misses, branch mispredicts).

## Optimization Techniques

### 1. Avoid Unnecessary Allocation

::code-wrapper{language="rust"}
```rust
// Bad: allocates per call
fn process(items: &[u8]) -> Vec<u8> { items.iter().map(|x| x + 1).collect() }

// Good: caller provides buffer
fn process_into(items: &[u8], out: &mut [u8]) {
    for (i, x) in items.iter().enumerate() { out[i] = x + 1; }
}
```
::

`String::with_capacity`, `Vec::with_capacity` to avoid regrowth.

### 2. Use `&[T]` / `&str` in APIs

Don't take `&Vec<T>` or `&String` — they impose ownership and lose the more general slice form. Slices are flexible and equally fast.

### 3. Choose Iterators Over Explicit Loops (Sometimes)

Iterators often compile to tighter loops because the compiler can reason about them. But for very tight inner loops, the explicit form sometimes wins (or with manual SIMD). Profile both.

### 4. Box Large Struct Fields

A struct with a large `Vec` field still has its `(ptr, len, cap)` header inline (24 bytes), but a large `[u8; 1024]` field makes the struct huge. Use `Box<[u8; 1024]>` for large fixed-size data to keep the struct small (good for cache and copying).

### 5. Avoid `Box<dyn Trait>` in Hot Paths

Vtable indirection is ~few ns but kills inlining. Genericize hot paths.

### 6. Cache Locality

- Flat `Vec<T>` over `Vec<Vec<T>>`.
- `ArrayVec`/`SmallVec` for inline storage.
- Structure-of-arrays over array-of-structures for SIMD-friendly access.

### 7. SIMD via `std::simd` (nightly) or `wide`/`pulp` (stable)

::code-wrapper{language="rust"}
```rust
#![feature(portable_simd)]
use std::simd::f32x4;
let a = f32x4::from_array([1.0, 2.0, 3.0, 4.0]);
let b = f32x4::from_array([5.0, 6.0, 7.0, 8.0]);
let c = a + b;
```
::

For auto-vectorization, write iterator chains and let LLVM do it; check with `cargo asm` or Godbolt.

### 8. `#[inline]` Selectively

::code-wrapper{language="rust"}
```rust
#[inline]
fn small() -> u32 { /* ... */ }

#[inline(always)]
fn tiny() -> u32 { /* ... */ }
```
::

Don't `#[inline(always)]` everywhere — it bloats code and hurts i-cache.

### 9. Avoid Heap Allocations in Hot Loops

- Reuse buffers via `&mut Vec`.
- Use `arrayvec::ArrayVec` for fixed-size buffers.
- Use `smallvec::SmallVec` for small-but-may-grow.

### 10. Use `&mut [T]` for In-Place Mutation

::code-wrapper{language="rust"}
```rust
fn sum_of_squares(v: &mut [i32]) {
    for x in v.iter_mut() { *x = *x * *x; }
}
```
::

Avoids allocation; cache-friendly.

### 11. Lock Granularity

- `RwLock` for read-heavy.
- Shard locks across N buckets for parallel writes.
- Lock-free via atomics when possible.

### 12. Avoid Reallocations

::code-wrapper{language="rust"}
```rust
let mut v = Vec::with_capacity(N);
for x in iter { v.push(x); }
```
::

### 13. Use `Arc::clone` Carefully

Each `Arc::clone` does an atomic increment — much cheaper than a deep clone but not free. Avoid in tightest loops.

### 14. `mem::replace` and `mem::take`

::code-wrapper{language="rust"}
```rust
let old = mem::take(&mut self.buffer);   // self.buffer is now empty
process(old);
```
::

Avoids cloning; useful for swap-and-go state.

### 15. Reduce Trait Object Dispatch

::code-wrapper{language="rust"}
```rust
// Generic
fn sum<T>(v: &[T]) -> T where T: Sum + Copy { v.iter().copied().sum() }

// Box<dyn> — slower
fn sum_dyn(v: &[Box<dyn Additive>]) { /* vtable per call */ }
```
::

### 16. `Cow` to Avoid Allocations

::code-wrapper{language="rust"}
```rust
fn normalize(s: &str) -> Cow<str> {
    if needs_transform(s) { Cow::Owned(s.to_uppercase()) } else { Cow::Borrowed(s) }
}
```
::

### 17. Pre-compute and Cache

::code-wrapper{language="rust"}
```rust
struct Cached { data: Vec<u8> }
impl Cached {
    fn lookup(&self, key: usize) -> u8 { self.data[key] }
}
```
::

Avoid recomputing in hot paths.

### 18. String Interning

For repeated short strings, use `string_interner`/`lasso` to assign integer IDs.

### 19. Use `&'static` Where Appropriate

Avoids lifetime-tracking overhead in some generic contexts. Don't overuse.

### 20. Compile-Time Computation

::code-wrapper{language="rust"}
```rust
const N: usize = 1000;
let arr = [0; N];
```
::

Move computation to compile time via `const`/`const fn` when possible.

## `release` Profile Pitfalls

- **Default `release`**: `opt-level = 3` but `lto = false`, `codegen-units = 16` (parallel compile, less optimization). For final binaries, bump these.
- **`panic = "abort"`** can unlock more optimizations (no unwinding tables).
- **`strip = "symbols"`** reduces binary size.
- **`opt-level = "z"`** minimizes size, often at a perf cost.

## Measuring Allocations

Use a custom allocator that logs:

::code-wrapper{language="rust"}
```rust
use std::alloc::{GlobalAlloc, Layout, System};

struct Counting;
unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 { eprintln!("alloc {:?}", l); System.alloc(l) }
    unsafe fn dealloc(&self, p: *mut u8, l: Layout) { System.dealloc(p, l) }
}

#[global_allocator]
static A: Counting = Counting;
```
::

Or use `dhat` for heap profiling.

## `cargo bloat`

::code-wrapper{language="bash"}
```bash
cargo install cargo-bloat
cargo bloat --release
cargo bloat --release --crates
```
::

Shows which functions take the most binary size.

## Inspecting Assembly

::code-wrapper{language="bash"}
```bash
cargo install cargo-asm
cargo asm my_crate::function
```
::

Or use Godbolt (godbolt.org) — paste Rust code, see assembly.

## Common Performance Pitfalls

- **`String::new()` followed by many `push_str`**: use `with_capacity`.
- **`format!` in hot loops**: pre-format or use `write!` into a reused buffer.
- **`Vec<u8>` for byte parsing**: `bytes::Bytes`/`BytesMut` are often faster.
- **`HashMap` with crypto-strong hash**: use `FxHashMap`/`AHashMap` for non-adversarial keys.
- **`Vec::push` in a counted loop**: `Vec::with_capacity` once.
- **`to_string()` on a `&str` you only need to read**: just use the `&str`.
- **`Arc::clone` in inner loop**: clone once, reuse.
- **`HashMap` lookup-then-insert**: use `entry` (one hash).
- **Locks held across `await`**: contention; drop lock first.
- **`Vec<Vec<T>>` matrices**: flat layout + index math is faster.
- **`Box<dyn>` in inner loops**: indirect calls prevent inlining.
- **`cloned()` instead of `copied()`**: `copied` is faster for `Copy` types.
- **`Vec<u8>` from `read_to_end`**: use `Vec::with_capacity` if size is known.
- **`String::from_utf8` then `unwrap`**: `from_utf8_lossy` avoids the check.

## Memory Layout

- `#[repr(C)]`: fixed, predictable, no padding-optimization.
- `#[repr(transparent)]`: same layout as inner.
- `#[repr(packed)]`: no padding, alignment 1 — slow on many platforms, UB risk.
- Field reordering (default Rust layout) minimizes padding; let the compiler do it.

## `std::alloc` Layout

Allocations must be aligned to `Layout::align`. Mismatched alignment is UB. `Box::new_uninit_slice`/`Vec::with_capacity` handle this for you.

## Async Performance

- Avoid `Box<dyn Future>` in hot paths; use generics.
- Avoid `tokio::spawn` for short-lived work — overhead. Use `join!`/`FuturesUnordered` instead.
- Bounded channels for backpressure (vs unbounded that grow).
- `current_thread` runtime for single-threaded apps.

## Performance Tricks & Anti-Patterns to Avoid

::code-wrapper{language="rust"}
```rust
// AVOID: copying large structs repeatedly
fn expensive_copy(data: LargeStruct) { /* ... */ } // makes a copy
// FIX: take a reference
fn efficient(data: &LargeStruct) { /* ... */ }

// AVOID: String concatenation in a loop
let mut result = String::new();
for s in strings {
    result.push_str(&s); // multiple reallocations
}
// FIX: use with_capacity or join
let result = strings.join("");
// OR: use a Vec as a buffer
let mut buf = String::with_capacity(1000);
for s in strings { buf.push_str(&s); }

// AVOID: Vec::push in a loop without pre-allocation
let mut v = Vec::new();
for _ in 0..1_000_000 { v.push(1); } // many reallocations
// FIX: pre-allocate
let mut v = Vec::with_capacity(1_000_000);
for _ in 0..1_000_000 { v.push(1); }

// AVOID: HashMap operations without entry API
if !map.contains_key(&k) {
    map.insert(k, v);
}
// FIX: use entry for single hash lookup
map.entry(k).or_insert(v);

// AVOID: sorting with default comparator when you can compare faster
// Some types have cheaper comparisons via Eq than via Ord

// AVOID: calling expensive functions with short-circuit operations
if expensive() && cheap() { } // expensive runs first, wasting time
if cheap() && expensive() { } // better: cheap exits early

// TRICK: use inline assembly for critical sections (rare)
#[inline(always)]
fn critical() { }

// TRICK: use repr(transparent) for zero-cost newtypes
#[repr(transparent)]
struct Meters(f64); // exactly the same layout as f64
```
::

## Performance Optimization Checklist

1. **Profile first**: Use `criterion`, `flamegraph`, or `perf`.
2. **Measure baseline**: Get numbers before and after any change.
3. **Identify hot spots**: Focus on code that runs often.
4. **Reduce allocations**: Use `Vec::with_capacity`, `String::with_capacity`.
5. **Avoid copies**: Take references, use `Cow`.
6. **Use iterators**: Chain adaptors compile to tight loops.
7. **Inline judiciously**: Small functions benefit; large functions don't.
8. **Lock granularity**: Keep critical sections small.
9. **Cache results**: Avoid recomputing expensive values.
10. **Use SIMD**: For vectorizable operations.
11. **Profile again**: Verify the improvement.

## Release Profile Optimization

::code-wrapper{language="toml"}
[profile.release]
opt-level = 3
lto = "fat"           # link-time optimization
codegen-units = 1     # better optimization, slower compile
panic = "abort"       # no unwinding, smaller binary
strip = true          # remove debug symbols

[profile.bench]
inherits = "release"
```
::

## Summary

Profile with `criterion`, `flamegraph`, `samply`, `cargo bloat`. Optimize hot paths: avoid allocation, use slices, generic over `dyn`, `with_capacity`, lock granularity, SIMD. Use `release` profile + `lto = "fat"` + `codegen-units = 1` for final binaries. Don't trust intuition; measure. Iterate. Avoid common anti-patterns like repeated string concatenation, unsafe HashMap operations, and premature `Box<dyn>` usage.

Next: Documentation.