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

`Pin` guarantees a value won't be moved in memory. Required because self-referential futures (which reference their own stack across `.await`) would break if moved.

::code-wrapper{language="rust"}
```rust
let mut fut = async { 5 };
let pinned: Pin<&mut _> = Pin::new(&mut fut);
```
::

You mostly encounter `Pin` in trait signatures and APIs (e.g., `Future::poll`). The `pin-utils` or `Box::pin` handle the common cases.

## `Box<dyn Future>` and `Pin<Box<dyn Future>>`

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

Dropping a future cancels it. The `select!` drop semantics mean unselected branches are canceled. Use `CancellationToken` for cooperative cancellation.

## Backpressure

Use bounded channels (`mpsc::channel(n)`). `.send().await` blocks when full, naturally propagating backpressure to producers.

## Async Traits (1.75+)

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

## Summary

Async is lazy (futures are polled); runtimes drive them. `tokio` is the dominant runtime. `await` yields control; `spawn` schedules tasks. `select!` races; `join!`/`try_join!` runs concurrently. Use async-aware channels and locks. Beware holding `std::sync::Mutex` across `.await`. Use `spawn_blocking` for CPU work or blocking calls.

Next: Macros — code that writes code.