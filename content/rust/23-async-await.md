# 23 — Async / Await

Async lets you write concurrent code that looks sequential. Rust's async is **zero-cost** — futures are state machines compiled by the compiler.

## Async Functions

::code-wrapper{language="rust"}
```rust
async fn fetch(url: &str) -> String {
    // ... await something ...
    String::from("data")
}
```
::

Calling `fetch(...)` returns a **future**, not a value. The body doesn't run until the future is polled.

## `await`

::code-wrapper{language="rust"}
```rust
let s = fetch("https://x").await;
```
::

`.await` yields control to the executor if the future is pending. The current task is suspended and later resumed.

## Async Is Lazy

::code-wrapper{language="rust"}
```rust
let f = async { println!("hi"); };
// nothing happens yet
f.await;   // body runs now
```
::

You must `.await` (or `spawn`) a future for it to make progress.

## Runtimes

Rust ships **no built-in async runtime** — you choose one:
- `tokio`: most popular, multi-threaded scheduler, mature ecosystem.
- `async-std`: mirrors std API, single-threaded by default.
- `smol`: small, simple.
- `embassy`: embedded (`no_std`).

::code-wrapper{language="rust"}
```rust
#[tokio::main]
async fn main() {
    println!("hello from tokio");
}
```
::

`tokio::main` builds a runtime and runs your async `main`.

## Spawning Tasks

::code-wrapper{language="rust"}
```rust
#[tokio::main]
async fn main() {
    let h = tokio::spawn(async {
        5
    });
    let n: i32 = h.await.unwrap();
    println!("{n}");
}
```
::

- `tokio::spawn` returns a `JoinHandle<T>`.
- Spawned tasks must be `Send + 'static`.
- `.await` on the handle gives `Result<T, JoinError>` (panic propagates).

## Futures

::code-wrapper{language="rust"}
```rust
trait Future {
    type Output;
    fn poll(self: Pin<&mut Self>, cx: &mut Context) -> Poll<Self::Output>;
}

enum Poll<T> { Ready(T), Pending }
```
::

You rarely implement `Future` manually. Async functions desugar to anonymous `Future`-implementing state machines.

## `Pin`

### How pinning works conceptually

`Pin<P>` is a pointer wrapper that **guarantees the pointee won't be moved in memory** after it's pinned. This matters because async blocks desugar to **state machines that can be self-referential** — an `async fn` stores its local variables in a struct, and a future paused at an `.await` may hold a reference to *another* field of the same struct. If that struct were moved, the internal reference would dangle. `Pin` exists to make "this won't be moved" a compile-time guarantee the `Future` API can rely on.

The `Unpin` marker is the escape hatch: most types (heap boxes, plain integers, structs of `Unpin` fields) are `Unpin`, meaning pinning them is a no-op — they're safe to move even while pinned, because they don't self-reference. Only *self-referential* futures need the pin guarantee; that's why `Future::poll` takes `Pin<&mut Self>` — to protect self-referential futures. You mostly encounter `Pin` in trait signatures and `Box::pin`; the `Unpin` bound is what makes everyday pinned values movable. You rarely write `Pin` by hand — `Box::pin` and `pin-utils` handle the common cases.

::code-wrapper{language="rust"}
```rust
let mut fut = async { 5 };
let pinned: Pin<&mut _> = Pin::new(&mut fut);
```
::

You mostly encounter `Pin` in trait signatures and APIs (e.g., `Future::poll`). The `pin-utils` or `Box::pin` handle the common cases.

## `Box<dyn Future>` and `Pin<Box<dyn Future>>`

### When you need boxing

You box a future when you need **type erasure**: storing futures of *different* concrete types in one collection (`Vec<Pin<Box<dyn Future<Output = ()>>>`), or returning *different* future types from different branches of a function (`if cond { async { 1 } } else { other_async() }` — each branch has a different anonymous type, so you can't return `impl Future` without boxing). `Box::pin` heap-allocates the future and type-erases it to `dyn Future`, at the cost of one allocation + vtable dispatch. Use `impl Future` (below) when you *can* — it's zero-cost; reach for `Box::pin` only when the type erasure is genuinely needed.

Because futures have unique unnameable types, storing them in collections or returning them generically requires boxing:

::code-wrapper{language="rust"}
```rust
fn make_fut() -> Pin<Box<dyn Future<Output = i32> + Send>> {
    Box::pin(async { 5 })
}
```
::

`Pin<Box<dyn Future>>` is the trait-object form of a future.

## `impl Future`

### When to use `impl Future` vs `Pin<Box<dyn Future>>`

`impl Future` returns a **concrete (but hidden) future type** with **static dispatch** — the compiler monomorphizes and can inline, so it's zero-cost. Reach for it when your function returns **a single future type** (one `async` block, one call chain). The limitation: every `return` must yield the *same* concrete future type, so you can't return different branch futures without boxing. `Pin<Box<dyn Future>>` is the fallback when you need type erasure (heterogeneous collections, multi-branch returns); it trades one allocation + vtable dispatch for that flexibility.

::code-wrapper{language="rust"}
```rust
fn make_fut() -> impl Future<Output = i32> {
    async { 5 }
}
```
::

Returns a concrete future type, hidden. Single type per return site.

## Common Async Crates

- `tokio` — runtime, I/O, networking, synchronization.
- `futures` — combinators, streams, sinks.
- `async-trait` — async functions in traits (until native support stabilizes; partial in 1.75+).
- `reqwest` — HTTP client.
- `hyper` — HTTP server/client.
- `sqlx` — async DB.
- `axum` — web framework (tokio-based).

## Async IO

::code-wrapper{language="rust"}
```rust
use tokio::fs;
#[tokio::main]
async fn main() -> std::io::Result<()> {
    let s = fs::read_to_string("file.txt").await?;
    println!("{s}");
    Ok(())
}
```
::

Async `read`/`write` yield when the syscall would block. The runtime parks the task and wakes it when the OS signals readiness.

## `tokio::select!`

### How it works and when to reach for it

`select!` **polls all branches concurrently** and completes when the *first* one is ready — the others are **dropped** (canceled). Conceptually, it's a race: every branch's future is polled; the winner produces the result; the losers are abandoned. This is why `select!` has **cancellation semantics** — unselected futures don't continue running, they're dropped (their state, including any held resources, is released). You reach for `select!` for **racing**: a timeout vs. the operation, two I/O sources where you take the first, or "wait for any of these." The `biased` option makes branches polled in declaration order (first-listed wins ties); without it, branches are randomized to avoid starvation. Branching with `&mut` futures instead of consuming them lets you keep using the unselected ones across loop iterations.

Race multiple futures, take the first to complete:

::code-wrapper{language="rust"}
```rust
tokio::select! {
    v = first_future() => println!("first: {v}"),
    _ = tokio::time::sleep(Duration::from_secs(1)) => println!("timeout"),
}
```
::

Unselected branches are dropped. Use `biased` for ordering, or branch with `&mut` futures to reuse them.

## Streams (Async Iterators)

### What a stream is and when to use one

A `Stream` is the **async analog of `Iterator`**: it yields a sequence of values over time, but each `next()` is `async` — it awaits the next value rather than returning immediately. You reach for a stream when values arrive **asynchronously over time** (a websocket receiving messages, lines from an async file read, a queue being drained) and `for` won't work because each step needs `.await`. Conceptually, streams are **pull-based** (you ask for the next item) — contrast with channels, which are **push-based** (the sender pushes; you receive). Use a stream when you're iterating async-produced values; use a channel when you're decoupling a producer from a consumer across tasks.

::code-wrapper{language="rust"}
```rust
use futures::stream::{self, StreamExt};

let mut s = stream::iter(vec![1, 2, 3]).map(|x| x * 2);
while let Some(v) = s.next().await {
    println!("{v}");
}
```
::

`StreamExt::next().await` is the async equivalent of `Iterator::next()`. `try_stream`/`tokio_stream` for building streams.

## Channels

### Which async channel to use

`tokio::sync` offers four channel types with distinct semantics — pick based on how many **receivers** you need and whether you need **history** or just the **latest** value:

- **`mpsc`** — multi-producer, **single**-consumer. The workhorse: many tasks send, one task drains. Bounded (backpressure) or unbounded.
- **`broadcast`** — multi-producer, **multi**-consumer. Every receiver sees every message (cloned to each). Use for fan-out (event broadcast to many subscribers).
- **`oneshot`** — single-value, one-shot. Send exactly once, receive exactly once. Use for "a one-time response" (request/response where the request is a future).
- **`watch`** — single-value **latest-only**. Receivers always see the most recent value, not the history. Use for "a config value that changes over time" where consumers just need the current state.

`tokio::sync::mpsc`, `tokio::sync::broadcast`, `tokio::sync::oneshot`, `tokio::sync::watch`:

::code-wrapper{language="rust"}
```rust
let (tx, mut rx) = tokio::sync::mpsc::channel(100);
tokio::spawn(async move {
    tx.send(5).await.unwrap();
});
let v = rx.recv().await;
```
::

Async channels `.await` on send/recv instead of blocking.

## `spawn_blocking`

For CPU-bound work or blocking syscalls inside async code:

::code-wrapper{language="rust"}
```rust
let v = tokio::task::spawn_blocking(|| {
    cpu_heavy_computation()
}).await.unwrap();
```
::

Offloads work to a separate thread pool so the async executor isn't blocked.

## Holding Locks Across `.await` — Pitfall

::code-wrapper{language="rust"}
```rust
// BAD: holding std Mutex across await can deadlock / block executor
let guard = std_mutex.lock().unwrap();
some_async().await;     // ⚠️ guard held
// GOOD:
let val = {
    let g = std_mutex.lock().unwrap();
    g.clone()
};
some_async(val).await;

// OR use tokio's async Mutex:
let guard = tokio_mutex.lock().await;
some_async().await;
```
::

`std::sync::Mutex` is fine *within* an async function if released before `.await`. For locks held across `.await`, use `tokio::sync::Mutex`.

## Canceling Futures

### How cooperative cancellation works

Cancellation in async Rust is **cooperative**: dropping a `Future` cancels it — the future's `Drop` runs, releasing resources, and it never resumes. This is why `select!` cancels unselected branches (it drops them). The subtlety: **dropping a future mid-`.await` can leak resources** if the future holds a lock, an open file, etc. — the `Drop` cleans up, but the work in progress is abandoned. `CancellationToken` exists for **explicit, graceful cancellation**: instead of dropping, you signal cancellation, and the future can `.await` the token, finish its current work cleanly (flush, release locks, log), then exit. Reach for `CancellationToken` when the future needs to clean up *before* stopping; reach for drop-cancellation when abrupt termination is fine.

Dropping a future cancels it. The `select!` drop semantics mean unselected branches are canceled. Use `CancellationToken` for cooperative cancellation.

## Backpressure

### What it is and why it matters

Backpressure is the mechanism by which a **slow consumer slows down a fast producer** — without it, a fast producer floods a slow consumer, causing unbounded memory growth (the queue fills) and eventual OOM. A **bounded channel** (`mpsc::channel(n)`) is the canonical tool: when the buffer is full, `send().await` *suspends the sender* until space frees, naturally throttling production to match consumption. Unbounded channels have no backpressure — the producer never blocks, so memory grows with the queue. Reach for bounded channels whenever a producer *could* outrun a consumer; reach for unbounded only when the producer is provably slower than the consumer or you have a different flow-control mechanism.

Use bounded channels (`mpsc::channel(n)`). `.send().await` blocks when full, naturally propagating backpressure to producers.

## Async Traits (1.75+)

### Why this was historically hard

Before 1.75, `async fn` in traits wasn't supported natively because **the return type of an async fn is an anonymous future** — you can't name it in a trait signature (`fn call() -> ???`), and the future may borrow from `self`, complicating lifetime bounds. The `async-trait` crate worked around this by **boxing** every async method's future (`Pin<Box<dyn Future>>`), which costs an allocation + vtable per call. Native support (1.75+) lets you write `async fn` in traits without boxing, but with limitations: `dyn` dispatch still needs `async-trait` (the native form is monomorphized, not object-safe), and some patterns (recursion) require care. Reach for native async traits in generic code (zero-cost); reach for `async-trait` when you need `dyn Trait` (object-safety) or older-toolchain compatibility.

::code-wrapper{language="rust"}
```rust
trait Service {
    async fn call(&self, req: Request) -> Response;
}
```
::

Native async traits stabilized in 1.75 with limitations (no `dyn` dispatch without `#[async_trait]` crate, no recursion in some cases). For full features including `dyn`, use the `async-trait` crate.

## Common Patterns

### Concurrency with `join!`

::code-wrapper{language="rust"}
```rust
let (a, b, c) = tokio::join!(fa(), fb(), fc());
```
::

Runs all three concurrently, waits for all, returns a tuple.

### Concurrency with `try_join!`

::code-wrapper{language="rust"}
```rust
let (a, b) = tokio::try_join!(fa(), fb())?;
```
::

Like `join!` but short-circuits on `Err`.

### `FuturesUnordered`

::code-wrapper{language="rust"}
```rust
use futures::stream::FuturesUnordered;
let mut futs = FuturesUnordered::new();
futs.push(fa());
futs.push(fb());
while let Some(r) = futs.next().await { /* ... */ }
```
::

Spawn N futures, await results as they complete (unordered).

## Common Pitfalls

- **`.await` in a `for` loop over a sync iterator**: fine; just don't accidentally serialize tasks you wanted to run concurrently — use `join!` or `spawn`.
- **Forgetting to `await`**: the future is created but never runs — silent bug.
- **`async fn` in a trait** still has rough edges; check current support.
- **Runtime-locked I/O**: mixing `tokio::fs` and `async-std::fs` is fine functionally but wasteful; pick one runtime's I/O.
- **`Send` futures**: futures that hold non-`Send` types across `.await` are `!Send` and can't be `tokio::spawn`ed.
- **Long-running blocking code in async**: blocks the executor. Use `spawn_blocking`.
- **Memory leaks with `select!` loops**: each iteration may allocate. Use `pin_mut!` or pinned variables.
- **`tokio::main` flavor**: `#[tokio::main(flavor = "current_thread")]` is single-threaded (less overhead). Default is multi-threaded.
- **`Drop` cancels futures**: a future dropped mid-`await` is silently canceled; resources are cleaned up via `Drop`.

## Async/Await Tricks & Patterns

::code-wrapper{language="rust"}
```rust
// Trick: use select! for racing futures
tokio::select! {
    Some(msg) = rx.recv() => println!("got message: {msg}"),
    _ = tokio::time::sleep(Duration::from_secs(5)) => println!("timeout"),
}

// Trick: biased select for ordering
tokio::select! {
    biased;
    x = first_future() => { },
    y = second_future() => { },
}

// Trick: use Box::pin for trait objects
let fut: Box<dyn std::future::Future<Output = i32>> = Box::pin(async { 42 });

// Trick: pinning with pin_mut! for efficiency
use std::pin::pin;
let mut fut = async { 42 };
let mut fut = pin!(fut);

// Trick: use join! for running multiple futures concurrently
let (a, b, c) = tokio::join!(future_a(), future_b(), future_c());

// Trick: try_join! for early exit on error
let (a, b) = tokio::try_join!(res_future_a(), res_future_b())?;

// Trick: stream-based iteration with tokio_stream
use tokio_stream::StreamExt;
let mut interval = tokio::time::interval(Duration::from_millis(100));
while let Some(_) = interval.tick().await { }

// Trick: timeout with select!
tokio::select! {
    result = long_running_task() => result,
    _ = tokio::time::sleep(Duration::from_secs(30)) => Err("timeout"),
}

// Trick: spawn_blocking for sync code in async context
let result = tokio::task::spawn_blocking(|| {
    blocking_operation()
}).await?;

// Trick: use FuturesUnordered for dynamic task spawning
use futures::stream::FuturesUnordered;
let mut futs = FuturesUnordered::new();
futs.push(tokio::spawn(async { 1 }));
futs.push(tokio::spawn(async { 2 }));
while let Some(Ok(val)) = futs.next().await { println!("{val}"); }
```
::

## When to Use Async

- Many concurrent I/O-bound tasks (HTTP servers, proxies, scrapers).
- Latency-sensitive workloads with lots of waiting.
- Avoid for CPU-bound work — use threads or `rayon`.
- Avoid in `no_std`/embedded unless using a `no_std`-friendly runtime (`embassy`).

## 💡 Tips & Tricks

- **Debug**: the `console-subscriber` crate plus `tokio-console` gives a live, top-like view of every spawned task's state (running, idle, blocked) — far faster than reasoning about hangs by staring at `select!` blocks.
- **Idiom**: default to `#[tokio::main(flavor = "current_thread")]` for single-purpose CLI tools and small services that don't need multi-core parallelism — it has noticeably lower overhead than the default multi-threaded runtime and simplifies reasoning about `!Send` types.
- **Performance**: avoid `tokio::spawn` for very short-lived work (a few microseconds of computation) — the scheduling overhead can exceed the work itself; prefer `join!`/`FuturesUnordered` to run several futures concurrently within the current task instead of spawning a task per unit of work.
- **Debug**: a task that "hangs forever" with no panic is almost always either an unbounded channel filling up unboundedly on the *other* end, or a lock held across an `.await` that another task needs — check both before assuming it's a runtime bug.
- **Idiom**: prefer `tokio::sync::Mutex` only when you truly must hold a lock across an `.await` point; if you can restructure to compute the value inside a small `{ }` block with a `std::sync::Mutex` and drop the guard before awaiting, the synchronous mutex is cheaper and avoids the "async mutex held across await" footguns entirely.
- **Debug**: `RUST_LOG=trace` with `tracing`/`tracing-subscriber` and span-based instrumentation (`#[tracing::instrument]` on async functions) preserves causality across `.await` points in a way plain `println!` timestamps cannot, since interleaved task output is otherwise very hard to attribute to the right logical flow.

## Async Edge Cases & Gotchas

::code-wrapper{language="rust"}
```rust
// Gotcha: async functions are lazy — they don't run until awaited
let fut = async_fn(); // nothing happens yet
fut.await; // now it runs

// Gotcha: forgetting to await returns a future, not the value
let result = async_fn(); // result is a Future, not the output
let value = async_fn().await; // value is the actual output

// Gotcha: holding std::sync::Mutex across await can deadlock
let guard = mutex.lock().unwrap();
async_op().await; // DANGER: holding the guard
// Solution: drop the guard before await
let val = { let g = mutex.lock().unwrap(); g.clone() };
async_op().await;

// Gotcha: !Send futures can't be spawned
let non_send = std::rc::Rc::new(5);
tokio::spawn(async { println!("{}", non_send); }); // ERROR

// Gotcha: tasks are dropped on cancellation
let fut = long_task();
tokio::select! {
    result = fut => println!("{result}"),
    _ = timeout() => {} // fut is dropped here without completing
}

// Trick: use pin! for re-borrowing futures across select!
let mut fut = some_future();
loop {
    tokio::select! {
        result = &mut fut => {
            println!("{result}");
            break;
        },
        _ = tokio::time::sleep(Duration::from_secs(1)) => {
            println!("still waiting...");
        }
    }
}
```
::

## 🧠 Spot the Bug

What's wrong with this "concurrent" fetch, and how long does it actually take if each `fetch` takes 1 second?

::code-wrapper{language="rust"}
```rust
async fn fetch(id: u32) -> u32 {
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    id * 2
}

#[tokio::main]
async fn main() {
    let start = std::time::Instant::now();

    let a = fetch(1).await;
    let b = fetch(2).await;
    let c = fetch(3).await;

    println!("{a} {b} {c} in {:?}", start.elapsed());
}
```
::

<details>
<summary>Answer</summary>

This takes roughly **3 seconds**, not 1 — despite `async`/`.await` being the tool commonly reached for to get concurrency.

`.await` suspends the *current* task until that specific future completes, then resumes execution of the very next line — it does not start the next `fetch` call until the previous one has fully finished. Writing `fetch(1).await; fetch(2).await; fetch(3).await;` sequences three futures one after another, exactly as three blocking calls would, just without blocking the underlying OS thread while waiting. Async by itself does not make independent operations run concurrently — it only avoids blocking a thread while waiting on one. Achieving actual concurrency requires explicitly running multiple futures together, e.g., with `tokio::join!`:

::code-wrapper{language="rust"}
```rust
let (a, b, c) = tokio::join!(fetch(1), fetch(2), fetch(3));
```
::

This version takes roughly 1 second total, since all three `sleep`s run concurrently on the runtime rather than one after another.

**The lesson**: `.await` sequences one future after another — it does not automatically run independent futures concurrently; use `join!`, `try_join!`, `tokio::spawn`, or `FuturesUnordered` when you actually want operations to overlap in time.

</details>

## Summary

Async is lazy (futures are polled); runtimes drive them. `tokio` is the dominant runtime. `await` yields control; `spawn` schedules tasks. `select!` races; `join!`/`try_join!` runs concurrently. Use async-aware channels and locks. Beware holding `std::sync::Mutex` across `.await`. Use `spawn_blocking` for CPU work or blocking calls.

Next: Macros — code that writes code.