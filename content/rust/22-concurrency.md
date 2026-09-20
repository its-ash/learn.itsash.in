# 22 — Concurrency & Multithreading: The Real Cost Model

`Send`/`Sync` are compile-time-checked auto-traits that eliminate exactly one bug class — data races. Deadlocks, logical races, and priority inversion remain entirely your problem, as the examples below show.

## Under-the-Hood Mechanics

### `Send`/`Sync` are compiler-derived facts about memory layout, not annotations you write

`Send`/`Sync` are **auto-traits**: derived structurally, field by field — no code generated, no runtime check.

::code-wrapper{language="rust"}
```rust
// The compiler derives this automatically — no annotation needed:
struct Point { x: f64, y: f64 }   // Send + Sync (all fields are)

// Rc breaks it structurally: its refcount is a plain (non-atomic) Cell<usize>
use std::rc::Rc;
struct Wrapper { inner: Rc<i32> }   // NOT Send, NOT Sync — inherited from Rc

// unsafe impl overrides the compiler's correct derivation with an unverified claim:
struct RawHandle(*mut u8); // raw pointers are !Send by default
unsafe impl Send for RawHandle {} // YOU now guarantee no data race — compiler trusts you fully

fn assert_send<T: Send>() {}
fn check() {
    assert_send::<Point>();     // compiles: auto-derived Send
    // assert_send::<Wrapper>(); // ERROR: Rc<i32> is not Send
    assert_send::<RawHandle>(); // compiles: only because of the unsafe impl above
}
```
::

### What a thread actually costs: stack, kernel object, and a context switch

`thread::spawn` reserves a real OS stack (~1-8MB) and a kernel scheduling object per call — costs `size_of` can't see:

::code-wrapper{language="rust"}
```rust
use std::mem::size_of;
// A JoinHandle itself is small — the cost is the OS-side stack + kernel object,
// which size_of can't see because it lives outside the Rust value entirely.
println!("{}", size_of::<std::thread::JoinHandle<()>>()); // small, but misleading —
// the real cost is the ~1-8MB stack reservation and kernel thread object per spawn().

// The anti-pattern this makes possible:
fn handle_naively(conns: Vec<Connection>) {
    for c in conns {
        std::thread::spawn(move || serve(c)); // 10,000 conns = 10,000 threads = ~10-80GB stack reserved
    }
}

// vs. an async task, which costs hundreds of bytes and is scheduled in userspace:
async fn handle_async(conns: Vec<Connection>) {
    for c in conns {
        tokio::spawn(serve_async(c)); // 10,000 tasks, no kernel context switch per task
    }
}
# fn serve(_: Connection) {} async fn serve_async(_: Connection) {}
# struct Connection;
```
::

### `Mutex<T>` lowers to a futex (Linux) or equivalent OS primitive, plus a memory fence

Uncontended: one atomic CAS, no syscall. Contended: falls through to `futex_wait`, a syscall + context switch — 100-1000x more expensive.

::code-wrapper{language="rust"}
```rust
use std::sync::Mutex;
use std::time::Instant;

let m = Mutex::new(0);
let t0 = Instant::now();
for _ in 0..1_000_000 {
    *m.lock().unwrap() += 1; // uncontended: ~20-50ns each, no syscall
}
println!("{:?}", t0.elapsed()); // fast — single-thread, no contention

// Under contention (another thread holding the lock), each lock() call instead
// blocks in the kernel via futex_wait — a full syscall round-trip, not a spin.
```
::

### Atomics map directly to CPU instructions — no lock object exists at all

`fetch_add` compiles to one hardware instruction (`lock xadd` on x86-64) — no OS object, no syscall. Cost is cache-coherency traffic, not scheduling:

::code-wrapper{language="rust"}
```rust
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;

let counter = Arc::new(AtomicUsize::new(0));
let mut handles = vec![];
for _ in 0..8 {
    let c = Arc::clone(&counter);
    handles.push(thread::spawn(move || {
        for _ in 0..100_000 { c.fetch_add(1, Ordering::Relaxed); } // no lock object anywhere
    }));
}
for h in handles { h.join().unwrap(); }
// Correct total, but 8 cores hammering one cache line ("ping-pong") caps scalability —
// sharding into N atomics (Scenario-style) removes that ceiling.
```
::

### Memory orderings are a happens-before contract with LLVM/the CPU, not a Rust-specific concept

`Ordering::{Relaxed, Acquire, Release, AcqRel, SeqCst}` mirror the C++11 memory model. Get the pairing wrong and it can pass on x86, fail on ARM:

::code-wrapper{language="rust"}
```rust
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::Arc;
use std::thread;

let data = Arc::new(AtomicI32::new(0));
let ready = Arc::new(AtomicBool::new(false));

// RIGHT: Release on the flag store, Acquire on the flag load — happens-before edge.
let (d1, r1) = (Arc::clone(&data), Arc::clone(&ready));
thread::spawn(move || {
    d1.store(42, Ordering::Relaxed);
    r1.store(true, Ordering::Release);   // publishes: data write visible after this
});
let (d2, r2) = (Arc::clone(&data), Arc::clone(&ready));
thread::spawn(move || {
    while !r2.load(Ordering::Acquire) {} // establishes happens-before once true
    assert_eq!(d2.load(Ordering::Relaxed), 42); // guaranteed to see 42
});

// WRONG: both Relaxed — no happens-before edge. May pass on x86 (strong model),
// reorders visibly on ARM/RISC-V ("works on my x86 laptop, breaks on Graviton CI").
// r1.store(true, Ordering::Relaxed);
// while !r2.load(Ordering::Relaxed) {} // data write may not be visible yet — UB-adjacent race
```
::

Rust inherits its memory model from C++20 wholesale — including its known flaws — because every alternative model is *also* bad, and C/C++ tooling and research transfer directly. The four orderings Rust exposes map to what the compiler and hardware are each forbidden from doing:

- **`Relaxed`** — the absolute weakest. No happens-before edges at all; only atomicity (no torn reads, no lost increments). Correct for counters and statistics where the *count* matters but nothing is synchronized *through* the value. Free reordering both sides.
- **`Release`** — a *publishing* store: every write (including non-atomic) that happened before it stays before it, in any thread that observes the stored value. Writes after it may still hoist up past it.
- **`Acquire`** — the matching *subscribe* load: every read after it stays after it. Reads before it may sink down past it. Causality is established **only** when a `Release` store on thread A is observed by an `Acquire` load on thread B — and only between those two threads, on that one location.
- **`SeqCst`** — everything above plus one total global order all threads agree on: for a data-race-free program using only `SeqCst`, there is a single interleaving every observer agrees on. Requires real memory fences even on x86 — but when in doubt, it is the correct default; downgrading `SeqCst` → `Relaxed` later is mechanically trivial, *proving* the downgrade is safe is the hard part.

::code-wrapper{language="rust"}
```rust
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;

// The classic litmus test SeqCst exists for — neither Acquire/Release alone
// nor Relaxed can forbid both "y == 2" outcomes below:
let x = AtomicBool::new(false);
let y = AtomicBool::new(false);
let mut z = AtomicBool::new(false); // (bool used for clarity; same result with ints)

let t1 = thread::spawn(|| {
    x.store(true, Ordering::SeqCst);
    z.fetch_add(y.load(Ordering::SeqCst) as u8 as usize, Ordering::SeqCst);
});
let t2 = thread::spawn(|| {
    y.store(true, Ordering::SeqCst);
    z.fetch_add(x.load(Ordering::SeqCst) as u8 as usize, Ordering::SeqCst);
});
t1.join().unwrap(); t2.join().unwrap();
// With SeqCst: at most one of the loads saw true -> z is 0 or 1, NEVER 2-for-2-true reads
// With Relaxed on the loads: both loads can observe stale false, then both stores land
// — the total order SeqCst buys is exactly what forbids that outcome.
let _ = z;
```
::

Two asymmetries worth internalizing, straight from the memory model:

- **Strongly-ordered hardware (x86-64) hides your bugs**: acquire/release semantics are often already free there, so too-weak orderings "work" locally. Concurrent algorithms must be validated on weakly-ordered hardware (ARM, RISC-V) or under emulation — passing CI on x86 is not evidence of correctness.
- **Relaxed on x86 is often not cheaper**: the platform already gives plain moves release semantics, so `Relaxed` mainly wins on weakly-ordered targets. Optimizing `SeqCst` → `Relaxed` on an x86-only workload may buy nothing and cost a correctness proof.

## Cost, Performance, and Trade-Offs

| Primitive | Uncontended cost | Contended cost | Memory overhead | When it's the wrong tool |
|---|---|---|---|---|
| `thread::spawn` | ~10-30µs to spawn | N/A | 1-8 MB stack per thread (reserved, mostly not committed) | Thousands of concurrent I/O-bound tasks — use async instead |
| `Mutex<T>` (std) | ~20-50ns (atomic CAS, no syscall) | Syscall + context switch (~1-10µs+) | `size_of::<T>()` + a few bytes of lock state | Read-heavy workloads with rare writes — `RwLock` may help; extremely hot single-word state — an atomic is cheaper |
| `RwLock<T>` | Similar to `Mutex` for the fast path, slightly higher fixed cost (reader count tracking) | Can be *worse* than `Mutex` under writer-heavy or mixed load (writer starvation bookkeeping) | Similar to `Mutex`, plus reader-count state | Write-heavy workloads, or when the critical section is tiny (`Mutex` is simpler and often just as fast) |
| `AtomicUsize` etc. | ~1-5ns (single instruction) | Degrades with cache-line contention across cores, not with syscalls | Zero beyond the value itself | Multi-variable invariants — atomics only protect single operations |
| `Arc<T>` clone | ~1-2ns (atomic increment) | Cache-line contention if cloned from many threads simultaneously | +16 bytes (two `AtomicUsize` counters: strong + weak) over `Box<T>` | Single-threaded sharing — use `Rc` (no atomic overhead) |
| `mpsc::channel` send/recv | Allocation per message (unbounded) or none (bounded, pre-sized) | Internal lock/atomic contention under many producers | Grows unboundedly if unbounded and producer outpaces consumer | Extremely hot loops — batch messages instead of one-per-item |
| `thread::scope` | Same as `thread::spawn` per thread | Same as normal threads | Avoids `Arc` entirely — zero extra allocation for borrowed data | N/A — strictly cheaper than `Arc` when scope-shaped access fits |

::code-wrapper{language="rust"}
```rust
// Compile-time cost: Send/Sync bound checking + trait-object resolution
// slows builds on large concurrent codebases. This type alone forces the
// compiler to verify Send+Sync across every call site that stores one:
use std::sync::{Arc, Mutex};
type Handler = Arc<Mutex<dyn Fn(u32) -> u32 + Send + Sync>>;
// Cheap to write, expensive to compile at scale — and expensive to untangle
// later if `Arc<Mutex<_>>` becomes the default reach for every shared field.
```
::

## Production Failure Modes & Anti-Patterns

### Anti-pattern: inconsistent lock ordering causing a silent deadlock

::code-wrapper{language="rust"}
```rust
use std::sync::{Arc, Mutex};
use std::thread;

struct Account { balance: Mutex<i64> }

fn transfer(from: &Arc<Account>, to: &Arc<Account>, amount: i64) {
    // BAD: lock order depends on argument order, not a fixed global order
    let mut from_bal = from.balance.lock().unwrap();
    let mut to_bal = to.balance.lock().unwrap();
    *from_bal -= amount;
    *to_bal += amount;
}

fn main() {
    let a = Arc::new(Account { balance: Mutex::new(1000) });
    let b = Arc::new(Account { balance: Mutex::new(1000) });

    let (a1, b1) = (Arc::clone(&a), Arc::clone(&b));
    let h1 = thread::spawn(move || transfer(&a1, &b1, 100));  // locks a then b

    let (a2, b2) = (Arc::clone(&a), Arc::clone(&b));
    let h2 = thread::spawn(move || transfer(&b2, &a2, 50));   // locks b then a — DEADLOCK RISK

    h1.join().unwrap();
    h2.join().unwrap();
}
```
::

Compiles clean, passes every unit test in isolation — deadlocks only under real concurrent load: thread 1 holds `a`, waits for `b`; thread 2 holds `b`, waits for `a`. Silent, permanent hang — no panic, no log. `Send`/`Sync` don't catch this; lock ordering is invisible to the type system.

**The fix**: a total, fixed lock ordering regardless of call-site argument order.

::code-wrapper{language="rust"}
```rust
fn transfer(from: &Arc<Account>, to: &Arc<Account>, amount: i64) {
    // GOOD: always lock in a consistent order (e.g., by memory address or a stable account ID)
    let (first, second) = if (Arc::as_ptr(from) as usize) < (Arc::as_ptr(to) as usize) {
        (from, to)
    } else {
        (to, from)
    };
    let mut first_bal = first.balance.lock().unwrap();
    let mut second_bal = second.balance.lock().unwrap();
    if std::ptr::eq(first, from) {
        *first_bal -= amount;
        *second_bal += amount;
    } else {
        *second_bal -= amount;
        *first_bal += amount;
    }
}
```
::

### Anti-pattern: holding a `std::sync::MutexGuard` across logic that can panic, poisoning the lock for every future caller

::code-wrapper{language="rust"}
```rust
use std::sync::{Arc, Mutex};

struct Cache { data: Mutex<std::collections::HashMap<String, String>> }

impl Cache {
    fn get_or_compute(&self, key: &str) -> String {
        let mut data = self.data.lock().unwrap();
        if let Some(v) = data.get(key) {
            return v.clone();
        }
        // BAD: this can panic (e.g., a malformed key indexing, or an unwrap on
        // an external call) WHILE the lock is held
        let computed = expensive_computation(key).expect("computation failed");
        data.insert(key.to_string(), computed.clone());
        computed
    }
}

fn expensive_computation(key: &str) -> Option<String> {
    if key.is_empty() { None } else { Some(key.to_uppercase()) }
}
```
::

One empty `key` and `.expect()` panics **while the `MutexGuard` is still alive** — that poisons the mutex for every future `.lock()`, on every thread, for every unrelated key:

::code-wrapper{language="rust"}
```rust
let cache = Cache { data: Mutex::new(Default::default()) };
// cache.get_or_compute("");  // panics while holding the lock -> mutex poisoned

// Every future access now fails, service-wide, regardless of key:
match cache.data.lock() {
    Ok(_) => {}
    Err(_poisoned) => { /* PoisonError — cascades from one bad input */ }
}
```
::

**The fix**: don't panic while holding a lock — handle the fallible operation explicitly, keep the critical section minimal.

::code-wrapper{language="rust"}
```rust
impl Cache {
    fn get_or_compute(&self, key: &str) -> Result<String, String> {
        {
            let data = self.data.lock().unwrap();
            if let Some(v) = data.get(key) {
                return Ok(v.clone());
            }
        } // lock released before the fallible work

        let computed = expensive_computation(key)
            .ok_or_else(|| format!("computation failed for key: {key}"))?;

        let mut data = self.data.lock().unwrap();
        data.insert(key.to_string(), computed.clone());
        Ok(computed)
    }
}
```
::

### Anti-pattern: `Arc<RefCell<T>>` across threads — compiles, corrupts data

::code-wrapper{language="rust"}
```rust
use std::sync::Arc;
use std::cell::RefCell;
use std::thread;

// BAD: this compiles because Arc<RefCell<T>> IS Send + Sync when T: Send —
// RefCell itself doesn't block this, it just doesn't SYNCHRONIZE anything
let shared = Arc::new(RefCell::new(0i32));

let mut handles = vec![];
for _ in 0..8 {
    let shared = Arc::clone(&shared);
    handles.push(thread::spawn(move || {
        for _ in 0..1000 {
            *shared.borrow_mut() += 1;   // UB / panics: no cross-thread synchronization
        }
    }));
}
for h in handles { h.join().unwrap(); }
```
::

Dangerous precisely because it compiles: `RefCell<T>` is `Send` if `T: Send`, satisfying `thread::spawn`'s bounds — but its borrow flag (`Cell<BorrowFlag>`) is a plain, non-atomic integer:

::code-wrapper{language="rust"}
```rust
// Two threads racing borrow_mut(): both can read "not borrowed" simultaneously,
// both proceed -> two &mut i32 aliases exist at once -> real UB, not just a bug.
// Observable symptoms, depending on timing:
//   1. corrupted final count (silently wrong, no error at all)
//   2. "already borrowed: BorrowMutError" panic (safer, but still broken under load)
```
::

**The fix**: `Mutex`/`RwLock` provide the actual cross-thread synchronization `RefCell` does not.

::code-wrapper{language="rust"}
```rust
use std::sync::{Arc, Mutex};
let shared = Arc::new(Mutex::new(0i32));
// ... same spawn loop, but:
*shared.lock().unwrap() += 1;   // genuinely synchronized — no UB, no data race
```
::

## Architectural Application

**Threads vs. async: a workload-shape decision.** CPU-bound -> threads/`rayon`. I/O-bound + high concurrency -> async, because per-thread stack cost becomes the ceiling before CPU does.

::code-wrapper{language="rust"}
```rust
// CPU-bound: rayon's work-stealing pool genuinely parallelizes across cores.
use rayon::prelude::*;
fn compress_all(chunks: Vec<Vec<u8>>) -> Vec<Vec<u8>> {
    chunks.into_par_iter().map(|c| compress(c)).collect()
}

// I/O-bound, high concurrency: async — one task per connection costs bytes, not MBs.
async fn serve_all(conns: Vec<TcpStream>) {
    for c in conns { tokio::spawn(handle(c)); } // 50,000 tasks: fine. 50,000 threads: not.
}
# fn compress(c: Vec<u8>) -> Vec<u8> { c }
# use tokio::net::TcpStream;
# async fn handle(_: TcpStream) {}
```
::

**"Share memory by communicating" as default, not slogan.** Channels sidestep lock-ordering and poisoning entirely — no shared mutable state to lock:

::code-wrapper{language="rust"}
```rust
use std::sync::mpsc;
use std::thread;

let (tx, rx) = mpsc::channel();
for id in 0..4 {
    let tx = tx.clone();
    thread::spawn(move || tx.send(compute(id)).unwrap()); // no lock, no ordering to get wrong
}
drop(tx);
for result in rx { println!("{result}"); } // failure modes: full channel, dropped receiver — easy to reason about
# fn compute(id: u32) -> u32 { id * 2 }
```
::

**Sharding is the production answer to lock contention.** One global `Mutex<HashMap<K,V>>` serializes every writer behind one lock; sharding lets N threads proceed in parallel:

::code-wrapper{language="rust"}
```rust
use std::sync::Mutex;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};

const SHARDS: usize = 16;
struct ShardedMap<K, V> { shards: Vec<Mutex<HashMap<K, V>>> }

impl<K: Hash + Eq, V> ShardedMap<K, V> {
    fn shard_for(&self, key: &K) -> &Mutex<HashMap<K, V>> {
        let mut h = std::collections::hash_map::DefaultHasher::new();
        key.hash(&mut h);
        &self.shards[(h.finish() as usize) % SHARDS] // N threads, different shards, real parallelism
    }
}
// Same principle DashMap packages as a battle-tested crate.
```
::

**Atomics for metrics, locks for multi-field invariants** — that's the actual dividing line:

::code-wrapper{language="rust"}
```rust
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

struct Metrics { requests: AtomicU64 } // single value, no cross-field invariant -> atomic
impl Metrics {
    fn record(&self) { self.requests.fetch_add(1, Ordering::Relaxed); } // no syscall risk
}

struct AccountState { balance: i64, pending_holds: i64 } // must move together, consistently
struct Account { state: Mutex<AccountState> } // multi-field unit -> Mutex, not two atomics
```
::

## 💡 Tips & Tricks

- **Debug**: `RUST_LOG=trace` with the `console-subscriber` crate and `tokio-console` visualizes live task/thread state — far faster than reasoning about a hang by staring at lock acquisition order in source.
- **Idiom**: reach for `thread::scope` before `Arc` when spawned threads only need to borrow data for the scope's duration — it eliminates the `'static` requirement and an `Arc` allocation entirely, and is strictly cheaper.
- **Performance**: batch small messages before sending over a channel in tight producer loops — each `send`/`recv` carries synchronization overhead, so amortizing it across a `Vec<T>` payload instead of one `T` per message meaningfully cuts throughput cost under high message rates.
- **Debug**: `cargo miri test` won't catch cross-thread data races reliably, but running under a real thread sanitizer (`RUSTFLAGS="-Z sanitizer=thread" cargo +nightly test`) can catch races hidden behind `unsafe impl Send/Sync` that Rust's type system doesn't otherwise prevent.
- **Idiom**: when choosing between `Mutex<T>` and channels for a new subsystem, default to channels — "share memory by communicating" avoids lock ordering and poisoning entirely, at the cost of some message-passing overhead that's rarely the actual bottleneck.
- **Performance**: `AtomicUsize::fetch_add` with `Ordering::Relaxed` is sufficient for simple counters that don't need happens-before relationships with other memory — reserve `SeqCst` for cases you've actually reasoned through, since it's the most expensive ordering, particularly on weakly-ordered architectures like ARM.
- **Idiom**: shard a single global lock (`Vec<Mutex<HashMap<...>>>`, bucketed by key hash) the moment profiling shows contention on one `Mutex` under concurrent load — it's a small, well-understood change with large scalability payoff.

## ⚠️ Edge Cases & Gotchas

- **Deadlock is a silent hang, not a panic or error**: two threads acquiring the same two `Mutex`es in opposite order will freeze forever with no error message — nothing in the type system prevents inconsistent lock ordering, unlike data races, which `Send`/`Sync` genuinely do prevent.
- **`Rc<T>` across threads is a compile error, but `Arc<RefCell<T>>` is not — and is still wrong**: `RefCell` provides zero cross-thread synchronization, only single-threaded runtime borrow checking; sharing `Arc<RefCell<T>>` across threads compiles but corrupts data or panics with `BorrowMutError` under real concurrent access.
- **Holding a `std::sync::MutexGuard` across an `.await` point** in async code can deadlock the executor or fail to compile (the guard often isn't `Send`) — the lock stays held while the task is suspended, blocking every other task that needs it.
- **Lock poisoning cascades**: a single `panic!` inside *any* thread while holding a `Mutex` poisons it for *all future lockers*, including unrelated code paths that never panicked themselves — `.lock().unwrap()` everywhere means one bad input anywhere can cascade into unrelated failures across the whole service.
- **`thread::spawn` silently detaches if you drop the `JoinHandle`**: forgetting to call `.join()` doesn't error — the spawned thread keeps running independently and may not finish before `main` exits, silently dropping its work with no warning.
- **Atomic orderings can be "wrong but appear correct" on x86**: code using `Ordering::Relaxed` where `Acquire`/`Release` was actually required often passes tests on x86/x86_64 (strongly-ordered hardware) and only manifests as a real bug on ARM or other weakly-ordered platforms — a genuine "works on my machine, breaks in production" trap tied to CPU architecture, not to Rust.
- **`mpsc::channel()` senders keep the channel alive even if the receiver is dropped**: `tx.send(v)` on a channel whose `rx` was dropped returns `Err` rather than panicking — `.unwrap()`ing that send then panics on an entirely expected "consumer went away" condition, which is a common oversight in shutdown-path code.

## 🧠 Spot the Bug

Does this deadlock, panic, or print `20`?

::code-wrapper{language="rust"}
```rust
use std::sync::Mutex;

fn main() {
    let data = Mutex::new(10);

    let first = data.lock().unwrap();
    let second = data.lock().unwrap();

    println!("{}", *first + *second);
}
```
::

<details>
<summary>Answer</summary>

It deadlocks — hangs forever, no output, no panic. `std::sync::Mutex` is **not reentrant**: it tracks only "locked or not," not which thread holds it, so a second `.lock()` from the same thread blocks waiting for a guard (`first`) that can never drop, because the thread is stuck inside the very statement that would need to finish first.

::code-wrapper{language="rust"}
```rust
use std::sync::Mutex;

// BAD: same-thread re-lock, often hidden several calls deep
let data = Mutex::new(10);
let first = data.lock().unwrap();
// let second = data.lock().unwrap(); // deadlocks — never reached

// FIX: parking_lot-style ReentrantMutex, or restructure to avoid re-entry.
// (std has no ReentrantMutex for Mutex<T>'s data; parking_lot::ReentrantMutex shown conceptually)
fn no_reentry_needed(data: &Mutex<i32>) -> i32 {
    let guard = data.lock().unwrap();
    *guard // read once, don't lock again inside the same scope
}
```
::

**The lesson**: never call `.lock()` again while an earlier guard from the same mutex is still in scope on that thread.

</details>

## Summary

`Send`/`Sync` are compiler-derived, zero-runtime-cost facts about memory layout — they eliminate data races entirely at compile time, but deadlocks, lock poisoning cascades, and logical races remain fully your responsibility. Threads cost megabytes of stack and microseconds per context switch; atomics cost a single instruction plus cache-coherency traffic; `Mutex` is cheap uncontended and expensive (syscall + context switch) contended. Default to message passing over shared-state locking when the architecture allows it, shard hot locks under contention, and treat lock-ordering as an explicit, documented invariant — the type system will not catch a violation for you.

Next: Async/Await — the executor model, `Future` state machines, and what "zero-cost" actually costs.
