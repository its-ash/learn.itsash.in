# 23 — Async/Await

`async` lets one thread juggle many tasks that spend most of their time **waiting** (network, disk, timers). While one task waits, another runs.

Rust's standard library defines `async`/`.await` and the `Future` trait, but **not** a runtime to run them. Most projects use **Tokio**:

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
```
::

## First Program

::code-wrapper{language="rust"}
```rust
use std::time::Duration;
use tokio::time::sleep;

async fn work(name: &str, ms: u64) -> String {
    sleep(Duration::from_millis(ms)).await;   // pause THIS task, let others run
    format!("{name} done")
}

#[tokio::main]                                // starts the runtime
async fn main() {
    let msg = work("a", 100).await;
    println!("{msg}");
}
```
::

**Tricky**: without a runtime, `main` can't be `async`:

::code-wrapper{language="rust"}
```rust
// async fn main() {}
// error[E0752]: `main` function is not allowed to be `async`
// → add #[tokio::main]
```
::

**Tricky**: `.await` only works inside `async` code:

::code-wrapper{language="rust"}
```rust
// fn f() { let x = async { 1 }.await; }
// error[E0728]: `await` is only allowed inside `async` functions and blocks
```
::

## Futures Are Lazy

**Tricky**: calling an `async fn` does **nothing** until you `.await` it:

::code-wrapper{language="rust"}
```rust
async fn save() { println!("saved"); }

#[tokio::main]
async fn main() {
    save();          // warning: unused implementer of `Future` that must be used
                     // note: futures do nothing unless you `.await` or poll them
    save().await;    // prints "saved"
}
```
::

## Sequential vs Concurrent

**Tricky**: two `.await`s in a row run **one after the other**:

::code-wrapper{language="rust"}
```rust
use std::time::{Duration, Instant};
use tokio::time::sleep;

async fn work(ms: u64) { sleep(Duration::from_millis(ms)).await; }

#[tokio::main]
async fn main() {
    let t = Instant::now();
    work(200).await;
    work(200).await;
    println!("sequential: {:?}", t.elapsed());   // ~400ms

    let t = Instant::now();
    tokio::join!(work(200), work(200));          // both wait at the same time
    println!("join!: {:?}", t.elapsed());        // ~200ms
}
```
::

`join!` runs futures concurrently on the **current** task. `tokio::spawn` starts an independent task:

::code-wrapper{language="rust"}
```rust
#[tokio::main]
async fn main() {
    let handle = tokio::spawn(async {
        40 + 2
    });
    let result = handle.await.unwrap();   // JoinHandle → Result<T, JoinError>
    println!("{result}");                 // 42

    let bad = tokio::spawn(async { panic!("task boom") });
    println!("{}", bad.await.is_err());   // true — the panic stays inside the task
}
```
::

## Never Block Inside `async`

**Tricky**: `std::thread::sleep` (or any blocking call) freezes the whole thread — other tasks can't run:

::code-wrapper{language="rust"}
```rust
use std::time::{Duration, Instant};

#[tokio::main]
async fn main() {
    let t = Instant::now();
    tokio::join!(
        async { std::thread::sleep(Duration::from_millis(200)) },   // BLOCKS
        async { std::thread::sleep(Duration::from_millis(200)) },
    );
    println!("{:?}", t.elapsed());   // ~400ms — no overlap at all
}
```
::

Use the async versions (`tokio::time::sleep`, `tokio::fs`, `reqwest`…), or move blocking work off the async threads:

::code-wrapper{language="rust"}
```rust
#[tokio::main]
async fn main() {
    let sum = tokio::task::spawn_blocking(|| (0..10_000_000u64).sum::<u64>())
        .await
        .unwrap();
    println!("{sum}");
}
```
::

## Timeouts

::code-wrapper{language="rust"}
```rust
use std::time::Duration;
use tokio::time::{sleep, timeout};

#[tokio::main]
async fn main() {
    let slow = async { sleep(Duration::from_secs(5)).await; "done" };
    match timeout(Duration::from_millis(50), slow).await {
        Ok(v) => println!("{v}"),
        Err(_) => println!("timed out"),     // printed — and `slow` is cancelled (dropped)
    }
}
```
::

## Spawned Tasks Must Be `Send`

`tokio::spawn` may move a task between threads, so everything held **across an `.await`** must be thread-safe.

**Tricky**: an `Rc`, or a `std::sync::MutexGuard`, alive across `.await` is rejected:

::code-wrapper{language="rust"}
```rust
use std::sync::{Arc, Mutex};

async fn other() {}

#[tokio::main]
async fn main() {
    let m = Arc::new(Mutex::new(0));
    tokio::spawn(async move {
        let g = m.lock().unwrap();
        other().await;              // g is still alive here
        println!("{g}");
    });
    // error: future cannot be sent between threads safely
    // note: future is not `Send` as this value is used across an await
}
```
::

Fix: finish with the guard before awaiting:

::code-wrapper{language="rust"}
```rust
use std::sync::{Arc, Mutex};

async fn other() {}

#[tokio::main]
async fn main() {
    let m = Arc::new(Mutex::new(0));
    let task = tokio::spawn(async move {
        let value = {
            let g = m.lock().unwrap();
            *g + 1
        };                          // guard dropped here
        other().await;
        value
    });
    println!("{}", task.await.unwrap());   // 1
}
```
::

(If you truly must hold a lock across `.await`, use `tokio::sync::Mutex`.)

## 💡 Tips & Tricks

- **Idiom** — `tokio::join!` for a fixed set of futures; `JoinSet` or `futures::future::join_all` for many.
- **Idiom** — `tokio::select!` to race futures (first one wins, the rest are dropped).
- **Performance** — `spawn_blocking` for CPU-heavy or blocking code.
- **Idiom** — keep `std::sync::Mutex` guards out of `.await` points.
- **Debug** — a task that "never finishes" often has a blocking call or a forgotten `.await`.

## ⚠️ Edge Cases & Gotchas

- **Lazy** — an un-awaited future does nothing (the compiler warns).
- **Sequential** — `a.await; b.await;` runs one after the other; use `join!` to overlap.
- **Blocking** — `std::thread::sleep`, `std::fs`, heavy loops inside async freeze other tasks.
- **Send** — `Rc`/`RefCell`/`MutexGuard` held across `.await` make a task non-`Send`.
- **Cancellation** — `timeout` and `select!` drop the losing future mid-way; code after its last `.await` never runs.
- **Runtime** — when `main` ends, unfinished spawned tasks are dropped.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
async fn fetch_user(id: u32) -> String {
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    format!("user {id}")
}

#[tokio::main]
async fn main() {
    let mut users = Vec::new();
    for id in 0..10 {
        users.push(fetch_user(id).await);
    }
    println!("{}", users.len());
}
```
::

<details>
<summary>Answer</summary>

Correct output, but it takes ~1 second instead of ~100ms: each `.await` finishes before the next request starts.

Run them concurrently:

::code-wrapper{language="rust"}
```rust
#[tokio::main]
async fn main() {
    let mut set = tokio::task::JoinSet::new();
    for id in 0..10 {
        set.spawn(fetch_user(id));
    }
    let users = set.join_all().await;   // ~100ms total (order not guaranteed)
    println!("{}", users.len());
}
```
::

</details>

## Summary

`async fn` returns a lazy future; `.await` runs it inside a runtime like Tokio. Use `join!`/`spawn` for real concurrency, never block inside async code, and don't hold non-`Send` values (like a `MutexGuard`) across `.await`.

Next: Macros.
