# 35 — Senior-Level Scenarios: Design, Diagnose, Defend

Design under constraints, diagnose from symptoms + code, or defend a choice against a failure mode. Each has a canonical resolution in a collapsed `<details>` block — reason through it yourself first.

## How to Use This Chapter

- **Design scenarios**: produce an actual design — types, module boundaries, and the specific trade-off you're making and why. There is no single right answer; there is a defensible one.
- **Diagnose scenarios**: given symptoms and a code excerpt, find the root cause before reading the answer. This is the skill that actually separates a senior engineer in an incident channel.
- **Defend scenarios**: articulate why a design decision holds up under a stated attack (scale, concurrency, adversarial input) — the format of an actual design-review conversation.

## Under-the-Hood Mechanics

Before diagnosing production Rust systems, you need working mental models of what's actually happening beneath the abstractions you're debugging:

- **Async runtimes are cooperative schedulers over a task graph** — a `tokio` task that never yields (a tight CPU-bound loop with no `.await`) starves every other task on that worker thread, because the scheduler only gets control back at an await point. This is the mechanism behind "why did my whole service stall under load" incidents that have nothing to do with I/O.
- **`Arc` cycles leak, they don't crash** — `Arc`'s strong-count reaching zero triggers drop; a cycle (`A` holds `Arc<B>`, `B` holds `Arc<A>`) means neither count ever reaches zero, so neither drops, ever. This is memory growth with no panic, no error, no stack trace — just a slowly climbing RSS graph that looks identical to a dozen other causes until you have a heap profile in hand.
- **Lock-free structures trade blocking for retry storms** — a CAS (compare-and-swap) loop that fails, retries, under contention, doesn't block, but it doesn't guarantee forward progress for any *specific* thread either (only for the system as a whole, in the lock-free sense) — a livelock-adjacent failure mode that looks like "the CPU is at 100% but throughput is near zero."

## Design Scenarios

### 1. Design a bounded, lock-free single-producer single-consumer ring buffer for a real-time audio pipeline

**Constraints**: the audio callback thread (producer) has a hard real-time deadline — it must never block, never allocate, never take a lock. The consumer thread (network sender) can be arbitrarily delayed. Data loss on overflow is acceptable; a missed deadline is not.

Design the buffer's synchronization strategy (atomics only — no `Mutex`), decide what happens on overflow (drop newest? drop oldest? overwrite?), and justify your choice of `Ordering` (`Relaxed`/`Acquire`/`Release`/`SeqCst`) for each atomic operation.

<details>
<summary>Reference approach</summary>

Two atomic indices, no CAS — single writer/single reader eliminates the multi-writer race a general lock-free queue must solve:

::code-wrapper{language="rust" filename="spsc_ring.rs"}
```rust
use std::sync::atomic::{AtomicUsize, Ordering};
use std::cell::UnsafeCell;

const CAP: usize = 1024;

struct RingBuffer<T> {
    buf: [UnsafeCell<Option<T>>; CAP],
    head: AtomicUsize, // consumer-owned index
    tail: AtomicUsize, // producer-owned index
    dropped: AtomicUsize, // Relaxed counter — exact ordering vs. other state doesn't matter
}

unsafe impl<T: Send> Sync for RingBuffer<T> {}

impl<T> RingBuffer<T> {
    // Producer: real-time thread — never blocks, never allocates, never locks.
    fn push(&self, val: T) {
        let tail = self.tail.load(Ordering::Relaxed);
        let head = self.head.load(Ordering::Acquire); // must see consumer's progress
        if tail.wrapping_sub(head) >= CAP {
            self.dropped.fetch_add(1, Ordering::Relaxed); // DROP NEWEST — never overwrite old, unsent audio
            return; // never block waiting for the consumer — that violates the deadline
        }
        unsafe { *self.buf[tail % CAP].get() = Some(val); }
        self.tail.store(tail.wrapping_add(1), Ordering::Release); // publish: data visible before index update
    }

    // Consumer: arbitrarily delayed, can block.
    fn pop(&self) -> Option<T> {
        let head = self.head.load(Ordering::Relaxed);
        let tail = self.tail.load(Ordering::Acquire); // happens-before edge with the Release store above
        if head == tail { return None; }
        let val = unsafe { (*self.buf[head % CAP].get()).take() };
        self.head.store(head.wrapping_add(1), Ordering::Release);
        val
    }
}
// SeqCst is unnecessary: no third thread needs a total order across both indices —
// Acquire/Release is both correct and cheaper here.
```
::

</details>

### 2. Design the error-type hierarchy for a payments library used by a dozen internal services

**Constraints**: some callers need to `match` on specific failure reasons (insufficient funds vs. network timeout vs. invalid card) to drive different UI/retry behavior; some callers just want to log-and-alert on any failure; the library must not force `anyhow` on downstream binaries that want typed errors.

<details>
<summary>Reference approach</summary>

The library exposes a `thiserror`-based enum, never `anyhow::Error`, because `anyhow` erases the type — a caller who needs to distinguish "retry with backoff" (timeout) from "show the user a message, don't retry" (insufficient funds) can't `match` on a boxed `dyn Error`. Structure the enum so retryable and non-retryable failures are distinguishable at the type level, not just by string inspection of the message:

::code-wrapper{language="rust"}
```rust
#[derive(Debug, thiserror::Error)]
pub enum PaymentError {
    #[error("insufficient funds: available {available}, requested {requested}")]
    InsufficientFunds { available: u64, requested: u64 },
    #[error("card declined: {reason}")]
    CardDeclined { reason: DeclineReason },
    #[error("upstream timeout after {0:?}")]
    Timeout(std::time::Duration),
    #[error("transient upstream failure")]
    Transient(#[source] Box<dyn std::error::Error + Send + Sync>),
}

impl PaymentError {
    pub fn is_retryable(&self) -> bool {
        matches!(self, PaymentError::Timeout(_) | PaymentError::Transient(_))
    }
}
```
::

Log-and-alert callers convert at the boundary — the correct dependency direction (`anyhow` depends on `std::error::Error`, not the reverse):

::code-wrapper{language="rust"}
```rust
// Application code (not library code) converting at the boundary:
fn charge_card(req: ChargeRequest) -> anyhow::Result<Receipt> {
    let receipt = payments::charge(req)?; // PaymentError -> anyhow::Error via From
    Ok(receipt)
}

// Typed callers match on specific variants instead of string-sniffing:
match payments::charge(req) {
    Ok(r) => handle_success(r),
    Err(e) if e.is_retryable() => schedule_retry(e), // centralized policy, not per-caller enumeration
    Err(PaymentError::InsufficientFunds { available, requested }) =>
        show_user(format!("need {requested}, have {available}")),
    Err(e) => alert_and_fail(e),
}
# struct ChargeRequest; struct Receipt;
# mod payments { pub use super::PaymentError; pub fn charge(_: super::ChargeRequest) -> Result<super::Receipt, PaymentError> { unimplemented!() } }
# fn handle_success(_: Receipt) {} fn schedule_retry(_: PaymentError) {} fn show_user(_: String) {} fn alert_and_fail(_: PaymentError) {}
```
::

</details>

### 3. Design a plugin system where third-party crates provide `Handler` implementations, loaded at startup from configuration

**Constraints**: the set of handler types is not known at compile time (config-driven). Handlers run in a hot path processing thousands of events/sec. You are asked to justify why this specific design does or doesn't need `Box<dyn Handler>`, given the performance guidance from Chapter 31.

<details>
<summary>Reference approach</summary>

Legitimate `Box<dyn Handler>` case — the handler set is config-driven, not a closed compile-time set, so `enum` dispatch isn't available. Resolve the trait object once at startup, then amortize the indirect call:

::code-wrapper{language="rust"}
```rust
trait Handler: Send + Sync {
    fn handle_batch(&self, events: &[Event]); // batched, not per-event dispatch
}

struct EventRouter { handlers: Vec<Box<dyn Handler>> } // resolved once at startup, not per event

impl EventRouter {
    fn dispatch(&self, events: &[Event]) {
        for h in &self.handlers {
            h.handle_batch(events); // one vtable call per batch, not per event —
        }                            // amortizes indirect-call cost across many events
    }
}
# struct Event;
```
::

If profiling later shows the vtable call itself dominates (plausible at millions/sec, unlikely at thousands/sec), batching further is the next lever — not abandoning `dyn`.

</details>

## Diagnose Scenarios

### 4. Diagnose a leaked `Arc` cycle in production

A long-running service's memory grows steadily under normal, steady-state traffic — no traffic spikes, no obvious leak in the allocator logs, just RSS climbing a few MB/hour indefinitely. `cargo miri` on the test suite is clean (Miri doesn't run the production workload, and leaks aren't UB anyway). Here's the suspect code:

::code-wrapper{language="rust"}
```rust
use std::sync::Arc;
use std::sync::Mutex;

struct Session {
    id: String,
    connection_pool: Arc<ConnectionPool>,
}

struct ConnectionPool {
    active_sessions: Mutex<Vec<Arc<Session>>>,
}

impl ConnectionPool {
    fn register(pool: &Arc<Self>, id: String) -> Arc<Session> {
        let session = Arc::new(Session {
            id,
            connection_pool: Arc::clone(pool),
        });
        pool.active_sessions.lock().unwrap().push(Arc::clone(&session));
        session
    }
}
```
::

<details>
<summary>Answer</summary>

`ConnectionPool` holds `Arc<Session>`; every `Session` holds `Arc<ConnectionPool>` back — a cycle. Neither strong count ever reaches zero while the other side is alive. This is why "no spikes, steady climb" points at a cycle: it leaks proportionally to sessions created, at a steady rate.

**Two independent fixes** — both needed, since either `Arc` alone completes the cycle:

::code-wrapper{language="rust" filename="fixed.rs"}
```rust
use std::sync::{Arc, Mutex, Weak};

struct Session {
    id: String,
    connection_pool: Weak<ConnectionPool>, // FIX 2: a session shouldn't keep the pool alive
}

struct ConnectionPool {
    active_sessions: Mutex<Vec<Weak<Session>>>, // FIX 1: registry finds sessions, doesn't own them
}

impl ConnectionPool {
    fn register(pool: &Arc<Self>, id: String) -> Arc<Session> {
        let session = Arc::new(Session { id, connection_pool: Arc::downgrade(pool) });
        pool.active_sessions.lock().unwrap().push(Arc::downgrade(&session));
        session
    }

    fn live_sessions(&self) -> Vec<Arc<Session>> {
        self.active_sessions.lock().unwrap()
            .iter()
            .filter_map(Weak::upgrade) // None if the session already dropped elsewhere
            .collect()
    }
}
```
::

**How you'd find this without reading source first**: a heap profiler (`dhat`, `massif`, a jemalloc dump) showing `Session`/`ConnectionPool` counts climbing together, never decreasing — then grep every `Arc<X>` field on both types for a cycle back.

</details>

### 5. Diagnose why a "lock-free" counter benchmark shows worse throughput than a mutex-based one under high contention

::code-wrapper{language="rust"}
```rust
use std::sync::atomic::{AtomicU64, Ordering};

struct Counter { value: AtomicU64 }

impl Counter {
    fn increment_if_below(&self, limit: u64) -> bool {
        loop {
            let current = self.value.load(Ordering::SeqCst);
            if current >= limit {
                return false;
            }
            if self.value.compare_exchange(
                current, current + 1, Ordering::SeqCst, Ordering::SeqCst,
            ).is_ok() {
                return true;
            }
            // retry
        }
    }
}
```
::

Sixteen threads hammer `increment_if_below` near the limit. Throughput is *worse* than an equivalent `Mutex<u64>`-guarded version. Why?

<details>
<summary>Answer</summary>

CAS-retry-storm: near the limit, many threads load a similar `current`, only one `compare_exchange` per round succeeds, the rest retry immediately — cache-line ping-pong that burns more bandwidth than a `Mutex`, which instead **parks** losers instead of spinning them:

::code-wrapper{language="rust"}
```rust
// The fix isn't necessarily "use a mutex" — add backoff, or shard the contention away:
use std::sync::atomic::{AtomicU64, Ordering};

struct ShardedCounter { shards: Vec<AtomicU64> } // sum-on-read instead of one hot atomic

impl ShardedCounter {
    fn increment(&self, shard_hint: usize) {
        self.shards[shard_hint % self.shards.len()].fetch_add(1, Ordering::Relaxed);
        // N threads on different shards -> no single hot cache line -> no retry storm
    }
    fn total(&self) -> u64 {
        self.shards.iter().map(|s| s.load(Ordering::Relaxed)).sum() // approximate under concurrent writes
    }
}
```
::

Lock-free is a **progress guarantee** ("the system as a whole advances"), not a performance guarantee ("this thread advances quickly") — under sustained contention a spinning CAS loop can lose badly to a blocking primitive that yields the core.

</details>

### 6. Diagnose an async service that intermittently drops requests under moderate load, with no errors logged

::code-wrapper{language="rust"}
```rust
async fn handle_request(req: Request) -> Response {
    let result = tokio::task::spawn(async move {
        compute_expensive_response(req)
    });
    // handler moves on without awaiting `result`
    Response::accepted()
}
```
::

<details>
<summary>Answer</summary>

Dropping the `JoinHandle` doesn't cancel the task — it keeps running detached — but discards the only signal that it panicked or is still in flight at shutdown. `Response::accepted()` returns regardless of outcome:

::code-wrapper{language="rust"}
```rust
// BAD: bare, unobserved spawn — the JoinHandle is dropped, failure is invisible
async fn handle_request_bad(req: Request) -> Response {
    tokio::task::spawn(async move { compute_expensive_response(req) });
    Response::accepted() // returned even if the task panics or never runs before shutdown
}

// FIX A: await and propagate failure when the caller can wait
async fn handle_request_awaited(req: Request) -> Response {
    match tokio::task::spawn(async move { compute_expensive_response(req) }).await {
        Ok(result) => Response::ok(result),
        Err(_join_err) => Response::internal_error(), // panic surfaced, not silently lost
    }
}

// FIX B: explicit fire-and-forget with observability via a supervised JoinSet
async fn handle_request_supervised(req: Request, tasks: &mut tokio::task::JoinSet<()>) -> Response {
    tasks.spawn(async move { let _ = compute_expensive_response(req); });
    Response::accepted() // acknowledged failures surface via tasks.join_next() elsewhere
}
# struct Request; struct Response;
# impl Response { fn accepted() -> Self { Response } fn ok(_: String) -> Self { Response } fn internal_error() -> Self { Response } }
# fn compute_expensive_response(_: Request) -> String { String::new() }
```
::

</details>

## Defend Scenarios

### 7. Defend (or reject) sharding a `HashMap<UserId, Session>` behind a single `RwLock` for a service with 500K concurrent users

State the read/write ratio at which `RwLock` stops being the right answer, and the specific alternative you'd move to, with a justification tied to measured contention rather than a general "shard everything" reflex.

<details>
<summary>Reference approach</summary>

`RwLock` scales reads with zero contention between readers, but every write is fully exclusive. Defensible until write frequency × hold time starts blocking reads against your latency SLO — measured, not guessed:

::code-wrapper{language="rust"}
```rust
use std::sync::RwLock;
use std::collections::HashMap;

// Single lock: fine while writes are rare relative to reads.
struct SessionStore { sessions: RwLock<HashMap<UserId, Session>> }
impl SessionStore {
    fn lookup(&self, id: &UserId) -> Option<Session> {
        self.sessions.read().unwrap().get(id).cloned() // readers never block each other
    }
    fn update(&self, id: UserId, s: Session) {
        self.sessions.write().unwrap().insert(id, s); // blocks ALL readers and writers
    }
}

// Past the measured threshold: shard N-way. Reads stay fast, writes spread out.
struct ShardedSessionStore { shards: Vec<RwLock<HashMap<UserId, Session>>> }
impl ShardedSessionStore {
    fn shard(&self, id: &UserId) -> &RwLock<HashMap<UserId, Session>> {
        &self.shards[hash(id) % self.shards.len()] // cost: no atomic whole-map iteration/size
    }
}
// dashmap packages this shard-of-locks pattern, battle-tested — prefer it over hand-rolling
// unless a non-standard sharding key or dynamic shard count forces a custom implementation.
# type UserId = u64; #[derive(Clone)] struct Session;
# fn hash(id: &UserId) -> usize { *id as usize }
```
::

</details>

### 8. Defend a decision to use `unsafe` for a custom SIMD-accelerated parser, against a reviewer who says "just use safe Rust, this isn't proven to be a bottleneck"

<details>
<summary>Reference approach</summary>

The reviewer's skepticism is correct process — the defense is evidence, in this order, not authority:

::code-wrapper{language="rust"}
```rust
// 1. Profile first — flamegraph/perf must show the SCALAR parser as dominant cost,
//    not a guess. No profile, no case.

// 2. Confirm LLVM genuinely fails to auto-vectorize the safe version (cargo asm / Godbolt).
//    If it already vectorizes, hand-written SIMD adds unsafe for zero measured gain.
fn parse_scalar(input: &[u8]) -> usize {
    input.iter().filter(|&&b| b == b',').count() // check the compiled asm before assuming this needs unsafe
}

// 3. Every unsafe block carries a documented # Safety contract + a miri-clean test
//    covering the exact alignment/bounds assumptions relied on:
/// # Safety
/// `input.len()` must be a multiple of 32; caller guarantees 32-byte alignment.
unsafe fn parse_simd(input: &[u8]) -> usize {
    debug_assert!(input.len() % 32 == 0);
    todo!("AVX2 comma-count kernel")
}

// 4. Scalar fallback gated on runtime feature detection, benchmarked on the
//    ACTUAL deployment CPU, not the dev machine:
fn parse(input: &[u8]) -> usize {
    if is_x86_feature_detected!("avx2") {
        unsafe { parse_simd(input) }
    } else {
        parse_scalar(input)
    }
}
```
::

Skipping straight to "SIMD is faster" without evidence at each step is the premature optimization this course warns against since Chapter 31 — produce the evidence, don't win on authority.

</details>

## Reading Code to Mastery

Reading production-grade Rust internalizes judgment that no tutorial conveys: how real systems draw error-type boundaries, where they accept `unsafe` and how they document its contract, how they structure concurrency under real contention. Approach a large crate by reading its public API surface first (`src/lib.rs`'s `pub` items), tracing one real call path end-to-end, and only then reading internals — you now understand what the API promises before judging how it's implemented.

- **`tokio`** — the scheduler and `JoinHandle`/cancellation semantics directly explain Scenario 6 above.
- **`crossbeam`** — epoch-based memory reclamation is the production answer to "how do lock-free structures free memory safely without a GC," relevant to Scenario 1 and 5.
- **`dashmap`** — a real, battle-tested implementation of the sharded-lock pattern from Scenario 7; read it after attempting the scenario yourself.
- **`sqlx`** — compile-time SQL verification via macros, a case study in pushing a correctness guarantee from runtime into compile time, the same instinct behind everything in Chapter 34.
- **`std::sync` source** (`alloc`/`core`) — `Arc`'s actual strong/weak count implementation, worth reading after Scenario 4 to see exactly how `Weak::upgrade` avoids resurrecting a dropped value.

## Open Source Contribution

Contributing to real infrastructure is the fastest way to have your design judgment checked by people maintaining production systems at scale: `tokio-rs/*`, `serde-rs/*`, `rust-lang/rust` (good-first-issue labeled), `bevyengine/bevy`. Read a project's `CONTRIBUTING.md` and its recent PR review threads before your first PR — the review comments are often more instructive than the code itself, because they surface the trade-offs a maintainer weighed that aren't visible in the merged diff.

## 💡 Tips & Tricks

- **Idiom**: for every design scenario above, write down the trade-off you rejected, not just the one you chose — a senior design review is judged as much on "why not X" as "why Y."
- **Debug**: for the diagnose scenarios, resist reading the answer until you've named a concrete tool (heap profiler, `perf`, `tokio-console`) you'd actually reach for — "I'd look at the code more carefully" isn't a diagnostic strategy.
- **Debug**: `tokio-console` (a live async-task inspector) makes Scenario 6's class of bug — detached, unobserved tasks — visible in real time; it's worth setting up on any tokio service before you need it during an incident.
- **Safety**: run `cargo miri test` and `loom` (for concurrency-critical code) on your own solutions to Scenarios 1, 2, and 5 — both catch classes of bugs that "it passed my manual testing" cannot.
- **Performance**: benchmark your Scenario 1 and 5 solutions against `crossbeam-channel`/`dashmap` with `criterion` — matching correctness is the first milestone; matching a battle-tested crate's performance is a materially higher bar, worth confirming honestly.

## ⚠️ Edge Cases & Gotchas

- **A clean `cargo miri` run on your test suite doesn't mean your production workload is leak-free**: Miri catches undefined behavior, not resource leaks — an `Arc` cycle (Scenario 4) is a perfectly well-defined, perfectly legal Rust program that leaks memory forever, and Miri has nothing to say about it.
- **Lock-free is a progress guarantee, not a performance guarantee**: Scenario 5 is the general case — a spinning CAS loop can lose to a blocking mutex under sustained contention, because "lock-free" only promises the *system* makes progress, not that any given thread does so efficiently.
- **`spawn`-and-forget silently drops failure information, not just cancellation**: dropping a `JoinHandle` doesn't cancel the task, but it does discard the only signal you had that the task panicked or is still pending at shutdown.
- **A design that's correct under your test suite's concurrency level can fail only under production-scale contention**: none of Scenario 5's problem is visible with two threads in a unit test — it requires realistic concurrent load, which is why load testing (not just correctness testing) belongs in the review of any concurrency-sensitive design.

## Where to Go From Here

You've now covered the mechanics, the costs, and the failure modes. The remaining gap between "knows Rust" and "ships and operates Rust systems at scale" closes only by reading code written by people solving these exact problems under real constraints:

- **`tokio-rs/tokio`** — the scheduler internals (`tokio/src/runtime/scheduler`) for how a real work-stealing async runtime handles the starvation and detached-task problems in this chapter.
- **`rust-lang/rust`** — the standard library's `alloc::sync` module for `Arc`/`Weak`'s actual implementation, and the compiler's own borrow-checker source (`compiler/rustc_borrowck`) if you want to go a level deeper than "the compiler rejects this."
- **`crossbeam-rs/crossbeam`** — epoch-based reclamation and the `crossbeam-channel` implementation, the production-grade version of Scenario 1's design space.
- **`tikv/tikv`** — a distributed transactional key-value store in Rust, a genuine large-scale systems codebase demonstrating error handling, concurrency, and observability patterns at a scale most side projects never reach.
- **`influxdata/influxdb` (the Rust-rewritten core, "IOx")** — a production analytical database, useful for seeing how a team structures a large, multi-crate Rust workspace with real performance constraints.

Read one of these with a specific question in mind — "how do they handle lock poisoning," "how do they structure their error types across crate boundaries" — rather than reading linearly. That's how the scenarios in this chapter stop being exercises and start being pattern-matches against code you've actually read.
