# 31 — Performance, Profiling & Optimization

Rust's pitch is "C-level performance, safe by default." That pitch is true only if you understand what the compiler is actually doing with your code — codegen unit partitioning, inlining heuristics, monomorphization bloat, allocator behavior. Senior engineers don't guess at performance; they read the assembly, read the flamegraph, and know which knobs in `Cargo.toml` change the output binary before touching a single line of application code.

## Under-the-Hood Mechanics

### Codegen units and LTO

::code-wrapper{language="toml"}
```toml
# lto = false (release default): each CGU optimized independently,
# no cross-CGU inlining beyond what's visible per-unit.
[profile.release]
codegen-units = 16

# lto = "thin": lightweight cross-CGU analysis — most of the benefit,
# a fraction of the compile-time cost.
[profile.release-thin]
inherits = "release"
lto = "thin"

# lto = "fat": every CGU merged into one LLVM module before optimization.
# Maximum inlining, longest compile time.
[profile.release-fat]
inherits = "release"
lto = "fat"
codegen-units = 1
```
::

More CGUs = faster parallel compile, but a hot function split across two CGUs doesn't get cross-module inlining unless LTO recovers it at link time.

### Monomorphization and inlining decisions

::code-wrapper{language="rust"}
```rust
// Generic: compiler emits ONE concrete copy per instantiated T — zero-cost
// at the call site (no vtable, fully inlinable), but more machine code per T.
fn sum<T: std::iter::Sum + Copy>(items: &[T]) -> T { items.iter().copied().sum() }
let _ = sum(&[1, 2, 3]);       // emits sum::<i32>
let _ = sum(&[1.0, 2.0]);      // emits a SEPARATE sum::<f64> — two functions, not one

// #[inline] is a HINT — LLVM can ignore it if the call site is too hot/large.
#[inline]
fn small_helper(x: i32) -> i32 { x + 1 }

// #[inline(always)] FORCES it, bypassing LLVM's cost model — can bloat callers.
#[inline(always)]
fn forced(x: i32) -> i32 { x * 2 }
```
::

### What the allocator actually does

::code-wrapper{language="rust"}
```rust
// Vec::push is NOT "append to array" — on capacity overflow it allocates
// a new, larger block (~2x growth), copies every element, frees the old one.
let mut v = Vec::new();
for i in 0..1000 {
    v.push(i); // triggers O(log n) reallocations, O(n) total copies overall
}

// Vec::with_capacity avoids all but the last allocation:
let mut v2 = Vec::with_capacity(1000);
for i in 0..1000 {
    v2.push(i); // no reallocation — capacity was reserved up front
}
```
::

A profiler shows the naive loop's reallocations as time in `__rust_realloc`, not in your logic.

## Benchmarking

### `criterion` (stable, production standard)

::code-wrapper{language="rust" filename="benches/my_bench.rs"}
```rust
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use std::hint::black_box;

fn fib(n: u64) -> u64 {
    if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}

fn bench_fib(c: &mut Criterion) {
    let mut group = c.benchmark_group("fib");
    for n in [10, 20, 30] {
        group.bench_with_input(BenchmarkId::from_parameter(n), &n, |b, &n| {
            b.iter(|| fib(black_box(n)));
        });
    }
    group.finish();
}

criterion_group!(benches, bench_fib);
criterion_main!(benches);
```
::

Criterion runs statistical analysis (outlier detection, confidence intervals) across many iterations and flags **regressions** against the previous run — the feature that matters in CI, where "did this PR make the hot path slower" needs a statistically defensible answer, not a single `Instant::now()` sample.

### Why naive `Instant::now()` timing lies to you

::code-wrapper{language="rust"}
```rust
let start = std::time::Instant::now();
let result = expensive_computation();
println!("{:?}", start.elapsed()); // result is never used after this
```
::

If `result` isn't observed, the optimizer is free to eliminate the computation that produced it — you end up timing nothing. Always sink benchmark values into `std::hint::black_box`, or use `criterion`, which does this correctly for you.

## Cost, Performance, and Trade-Offs

| Technique | Runtime win | Compile-time cost | Maintenance cost |
|---|---|---|---|
| `lto = "fat"` + `codegen-units = 1` | 5-20% throughput, smaller binary | 2-10x slower release builds | None — set once in CI release profile |
| `#[inline(always)]` everywhere | Negative — i-cache pressure | Slightly slower compile | Binary bloat, harder profiling (frames disappear) |
| Hand-written SIMD | 4-16x on data-parallel code | More code, platform-specific | Must maintain scalar fallback + runtime feature detection |
| `Box<dyn Trait>` in a hot path | Avoids monomorphization bloat | Faster compile | Vtable indirection blocks inlining — wrong trade for a *hot* path specifically |
| `Arc<Mutex<T>>` where `Rc<RefCell<T>>` suffices | None (you don't need atomics) | None | Atomic ops cost cycles you're paying for nothing; also signals "this is shared across threads" to future readers, which is a lie |
| String interning | O(1) compare/hash vs O(n) | Extra dependency, table lifetime management | Only pays off with many *duplicate* short strings |

::code-wrapper{language="toml"}
```toml
# Compile-time cost is a one-time tax paid by CI; runtime cost is paid
# by every user, every request, forever — so spend compile time freely
# in release, keep dev fast to iterate.
[profile.dev]
opt-level = 0
codegen-units = 256   # fast, parallel, unoptimized

[profile.release]
opt-level = 3
lto = "fat"
codegen-units = 1     # slow compile, best runtime — CI pays this, not users
```
::

More inlining usually means a **larger** binary (code duplicated per call site) but **faster** execution — until i-cache pressure flips the sign and a bloated binary loses to a compact one from constant instruction-cache refills.

## Profiling

### `perf` + flamegraphs (Linux)

::code-wrapper{language="bash"}
```bash
cargo build --release
perf record -g ./target/release/my_app
perf report

cargo install flamegraph
cargo flamegraph
```
::

### `samply` (cross-platform, web UI)

::code-wrapper{language="bash"}
```bash
cargo install samply
samply record ./target/release/my_app
```
::

### `Instruments` (macOS)

::code-wrapper{language="bash"}
```bash
xcrun xctrace record --template "Time Profiler" --launch ./target/release/my_app
```
::

A profile is only trustworthy if it reflects production conditions: build with `debug = true` under `[profile.release]` so symbols resolve, but never profile a `dev` build and extrapolate to `release` — the two can have entirely different hot spots because `dev` skips inlining and optimization passes wholesale.

## Production Failure Modes & Anti-Patterns

### Anti-pattern: optimizing what you *assume* is slow

::code-wrapper{language="rust"}
```rust
// Naive: engineer assumes string formatting is the bottleneck,
// spends a sprint hand-rolling a formatter, ships it —
// the actual bottleneck was a synchronous DNS lookup per request.
fn handle_request(req: &Request) -> Response {
    let msg = format!("{}: {}", req.id, req.path); // "optimized" away
    log::info!("{msg}");
    let ip = resolve_dns(&req.host); // <- this was the real 40ms
    Response::new(ip)
}
```
::

**Why it fails at scale**: without a flamegraph, engineers optimize the code that *looks* expensive (string formatting, allocation) rather than the code that *is* expensive (blocking I/O, lock contention, cache misses). This burns engineering time and adds complexity without moving the metric that matters. The fix is procedural, not technical: profile in an environment resembling production traffic *before* writing any optimization, and re-profile after each change to confirm the fix landed on the actual bottleneck.

### Anti-pattern: `Box<dyn Trait>` monoculture in a hot path

::code-wrapper{language="rust"}
```rust
// Naive: every plugin call goes through dynamic dispatch,
// even in a loop processing millions of events/sec.
trait Handler { fn handle(&self, ev: &Event); }

fn process(handlers: &[Box<dyn Handler>], events: &[Event]) {
    for ev in events {
        for h in handlers {
            h.handle(ev); // vtable indirection, no inlining, per call
        }
    }
}
```
::

**Why it fails at scale**: at low volume the vtable call's few-nanosecond cost is invisible. At millions of events/sec across many handlers, the indirect call prevents inlining (so the CPU can't fuse `handle`'s body into the loop), defeats branch prediction (indirect calls are harder to predict than direct ones), and blocks LLVM from proving anything about what `handle` does — no auto-vectorization, no dead-code elimination across the boundary. The production fix, when the handler set is closed and known at compile time, is an enum dispatch or a generic parameter monomorphized per handler type, keeping `dyn` only at the outer boundary where handler configuration is genuinely dynamic (e.g., loaded from a config file at startup, called rarely relative to hot-loop iteration).

::code-wrapper{language="rust"}
```rust
// Production-grade: closed set of handlers, static dispatch.
enum Handler { Metrics(MetricsHandler), Audit(AuditHandler) }
impl Handler {
    fn handle(&self, ev: &Event) {
        match self {
            Handler::Metrics(h) => h.handle(ev), // inlinable, monomorphized
            Handler::Audit(h) => h.handle(ev),
        }
    }
}
```
::

### Anti-pattern: unbounded async task spawning

::code-wrapper{language="rust"}
```rust
// Naive: one tokio::spawn per incoming item, no backpressure.
async fn ingest(mut stream: impl Stream<Item = Job> + Unpin) {
    while let Some(job) = stream.next().await {
        tokio::spawn(async move { process(job).await }); // unbounded
    }
}
```
::

**Why it fails at scale**: each `spawn` allocates a task struct on the heap and hands it to the scheduler. Under a burst (upstream sends faster than `process` can drain), this creates unbounded concurrent tasks — memory grows without limit, the scheduler's run queue thrashes, and the process eventually OOMs or degrades so badly that *legitimate* work starves behind the backlog. The production fix bounds concurrency explicitly:

::code-wrapper{language="rust"}
```rust
use futures::stream::StreamExt;

async fn ingest(stream: impl Stream<Item = Job> + Unpin) {
    stream
        .for_each_concurrent(Some(64), |job| async move { process(job).await })
        .await; // caps in-flight work at 64, applies backpressure upstream
}
```
::

## Architectural Application

Performance is a system-design decision, not a micro-optimization exercise, at three levels: service boundary (generic vs. `dyn`), concurrency architecture (lock granularity), and build pipeline (profile tuning per deployment target).

::code-wrapper{language="rust"}
```rust
// Service boundary — generic-first public API; dyn reserved for the
// genuinely heterogeneous, low-frequency case (plugin registry).
pub fn process<S: Strategy>(strategy: &S, data: &[u8]) -> Vec<u8> { strategy.run(data) }
pub trait Strategy { fn run(&self, data: &[u8]) -> Vec<u8>; }

// Concurrency architecture — granularity chosen from MEASURED contention,
// not guessed: single lock caps throughput at one core; lock-free adds
// unsafe surface for zero benefit under low contention.
use std::sync::Mutex;
struct LowContention { state: Mutex<Vec<u8>> }        // fine if rarely touched
// vs. dashmap::DashMap for measured high-contention key-value access
```
::

::code-wrapper{language="toml"}
```toml
# Build pipeline — dev optimizes iteration speed, release optimizes
# for the deployment target's actual constraint.
[profile.dev]
opt-level = 0
codegen-units = 256

[profile.release]           # latency-sensitive service
opt-level = 3
lto = "fat"
codegen-units = 1
panic = "abort"
strip = true

[profile.release-small]     # size-constrained edge/embedded binary
inherits = "release"
opt-level = "z"

[profile.bench]
inherits = "release"
```
::

## 💡 Tips & Tricks

- **Debug**: `std::hint::black_box` (stable) is the successor to `test::black_box` — use it in any ad-hoc `Instant::now()` benchmark, not just `criterion` code, to stop the optimizer from proving your computation is unobserved.
- **Performance**: `cargo asm` or Godbolt (godbolt.org) is the only reliable way to confirm an iterator chain actually auto-vectorized — "iterators are usually faster" is a heuristic, not a guarantee, for your specific loop and target CPU.
- **Debug**: a custom `#[global_allocator]` that logs every `alloc`/`dealloc` call is a zero-dependency way to spot unexpected allocation hot spots before reaching for `dhat`.
- **Idiom**: `Vec::with_capacity` pays off even with an approximate estimate — an undercount still eliminates most reallocations, since growth is exponential regardless of the starting point.
- **Clippy**: the `clippy::perf` lint group (part of `clippy::all`) catches `redundant_clone`, `or_fun_call`, and similar anti-patterns automatically — run it before profiling to remove the free wins.
- **Portability**: code hand-tuned with `#[target_feature(enable = "avx2")]` is silently unused on ARM or older x86 unless gated with `is_x86_feature_detected!` — always benchmark the fallback path, since that's what most non-x86_64-server users actually run.

## ⚠️ Edge Cases & Gotchas

- **`opt-level = 3` alone doesn't enable link-time optimization**: the release default is `lto = false`, `codegen-units = 16` — two projects both "built in release mode" can differ substantially in runtime performance purely from unrelated `Cargo.toml` profile settings.
- **`#[inline(always)]` can make code slower**: forcing inlining of a large or frequently-called function bloats the binary and hurts i-cache locality — the isolated-function benchmark looks faster while real-world throughput drops.
- **Debug-mode overflow panics vanish in release**: code that panics on overflow under `cargo test` can silently wrap under `cargo run --release` — a performance-motivated profile switch is also a correctness-mode switch for arithmetic.
- **`Arc::clone`'s atomic increment is not free**: cheaper than a deep clone, but in a sufficiently tight loop (millions of iterations) the atomic operation itself becomes measurable against the rest of the loop's cost budget.
- **`String`/`Vec` capacity growth strategy isn't a stability guarantee**: asserting exact capacity values after a sequence of pushes relies on an implementation detail that has changed across Rust versions.
- **`black_box` stops some optimizations, not all**: it prevents constant-folding of the wrapped value, but surrounding code can still be optimized in ways that skew measured timings if inputs *and* outputs aren't both wrapped.

## 🧠 Spot the Bug

Why does this "optimization" make the service slower under real production load, despite passing every local benchmark faster than the original?

::code-wrapper{language="rust"}
```rust
use std::sync::Arc;
use tokio::sync::Mutex;

struct Cache {
    inner: Arc<Mutex<lru::LruCache<String, Vec<u8>>>>,
}

impl Cache {
    async fn get_or_compute(&self, key: &str) -> Vec<u8> {
        let mut guard = self.inner.lock().await;
        if let Some(v) = guard.get(key) {
            return v.clone();
        }
        let value = expensive_remote_fetch(key).await; // <- await while holding the lock
        guard.put(key.to_string(), value.clone());
        value
    }
}
```
::

<details>
<summary>Answer</summary>

The local benchmark (single-threaded, low concurrency) doesn't reveal it because there's no contention to expose — one caller at a time never waits on the lock. Under real production concurrency, holding `guard` across `expensive_remote_fetch(key).await` means **every other request that touches the cache — even for a completely different key — blocks until this one remote fetch completes.** A single slow upstream call serializes the entire cache, collapsing what should be a highly concurrent data structure into an accidental global critical section gated by network latency.

The `tokio::sync::Mutex` was reached for specifically *because* the critical section needed to hold across an `.await` — but the actual bug is architectural: the lock should never have needed to span the remote fetch in the first place. The fix drops the lock before the slow operation and re-acquires it only for the cheap insert, accepting a possible duplicate fetch on a cache-miss race (a correct, bounded trade-off) instead of serializing all traffic on network latency:

::code-wrapper{language="rust"}
```rust
async fn get_or_compute(&self, key: &str) -> Vec<u8> {
    {
        let guard = self.inner.lock().await;
        if let Some(v) = guard.get(key) {
            return v.clone();
        }
    } // lock released before the slow call
    let value = expensive_remote_fetch(key).await;
    let mut guard = self.inner.lock().await;
    guard.put(key.to_string(), value.clone());
    value
}
```
::

**The lesson**: switching to an async-aware `Mutex` fixes the compile error from awaiting across a lock, but doesn't fix the design problem of a slow operation happening *inside* a critical section — that's a throughput bug no amount of "the right mutex type" can paper over.

</details>

## Summary

Profile before optimizing — `criterion` for statistically valid benchmarks, `perf`/`flamegraph`/`samply` for finding real hot spots. Understand that `codegen-units`, `lto`, and `#[inline]` are compiler-facing knobs with real, non-obvious performance and compile-time trade-offs — the release default is tuned for compile speed, not runtime speed. Prefer static dispatch and slices in hot paths; reserve `dyn` and heap indirection for genuinely low-frequency, heterogeneous call sites. Treat lock scope as a throughput architecture decision, not an implementation detail — the biggest production performance bugs are almost never a missing `#[inline]`, they're a lock or an allocation somewhere it shouldn't be.

Next: Documentation.
