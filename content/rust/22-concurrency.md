# 22 — Concurrency & Multithreading

Rust's promise: **fearless concurrency**. The type system prevents data races at compile time via `Send` and `Sync`.

## `Send` and `Sync`

- `Send`: a type can be transferred across threads (ownership moves safely).
- `Sync`: `&T` can be shared across threads (multiple threads can hold `&T` simultaneously).

They're **auto-traits**: the compiler implements them automatically when all fields are `Send`/`Sync`.

Examples:
- `i32`, `String`, `Vec<T>`: `Send + Sync`.
- `Rc<T>`: not `Sync` (shared non-atomic refcount), not `Send` (cheap counter).
- `Arc<T>`: `Send + Sync` if `T: Send + Sync`.
- `Cell<T>`/`RefCell<T>`: `Send` (if `T: Send`) but not `Sync` (no synchronization).
- `Mutex<T>`/`RwLock<T>`: `Send + Sync` if `T: Send`.
- Raw pointers `*const T`/`*mut T`: not `Send`/`Sync` (the compiler is conservative; opt in with `unsafe impl`).

## Spawning Threads

::code-wrapper{language="rust"}
```rust
use std::thread;
use std::time::Duration;

let handle = thread::spawn(|| {
    for i in 0..5 {
        println!("thread: {i}");
        thread::sleep(Duration::from_millis(10));
    }
});

for i in 0..5 {
    println!("main: {i}");
    thread::sleep(Duration::from_millis(10));
}

handle.join().unwrap();
```
::

- `thread::spawn` returns a `JoinHandle<T>`.
- `.join()` blocks until the thread exits, returning `Result<T, Box<dyn Any + Send>>` (panic propagates as `Err`).
- Closures must be `'static + Send`.

## Moving Data into Threads

::code-wrapper{language="rust"}
```rust
let data = vec![1, 2, 3];
let handle = thread::spawn(move || {
    println!("{:?}", data);   // data moved in
});
// data not accessible here
handle.join().unwrap();
```
::

`move` is almost always required — captures must outlive the thread (`'static`).

## Shared State with `Arc` + `Mutex`

::code-wrapper{language="rust"}
```rust
use std::sync::{Arc, Mutex};
use std::thread;

let counter = Arc::new(Mutex::new(0));
let mut handles = vec![];

for _ in 0..10 {
    let counter = Arc::clone(&counter);
    handles.push(thread::spawn(move || {
        let mut n = counter.lock().unwrap();
        *n += 1;
    }));
}

for h in handles { h.join().unwrap(); }
println!("{:?}", counter);   // 10
```
::

`Arc` for shared ownership; `Mutex` for synchronized mutation. Lock guards auto-unlock on drop (RAII).

## `RwLock` for Read-Heavy Workloads

::code-wrapper{language="rust"}
```rust
use std::sync::RwLock;
let lock = RwLock::new(0);

let r1 = lock.read().unwrap();
let r2 = lock.read().unwrap();   // multiple readers OK
// let w = lock.write().unwrap();   // would block above
drop(r1); drop(r2);
let mut w = lock.write().unwrap();
*w += 1;
```
::

## Channel — Message Passing

`std::sync::mpsc` (multi-producer, single-consumer):

::code-wrapper{language="rust"}
```rust
use std::sync::mpsc;
use std::thread;

let (tx, rx) = mpsc::channel();

let h = thread::spawn(move || {
    let v = rx.recv().unwrap();
    println!("got {v}");
});

tx.send(42).unwrap();
h.join().unwrap();
```
::

### Multi-Producer

::code-wrapper{language="rust"}
```rust
let (tx, rx) = mpsc::channel();
let tx2 = tx.clone();   // multiple senders
thread::spawn(move || tx.send(1).unwrap());
thread::spawn(move || tx2.send(2).unwrap());
```
::

### Sync vs Async Channels

- `channel()`: unbounded, `send` never blocks.
- `sync_channel(n)`: bounded; `send` blocks when buffer full (backpressure).

### Crossbeam Channels

`crossbeam-channel` is more featureful: bounded/unbounded, select, after/timeout, easy multi-consumer. Often preferred over `std::mpsc`.

::code-wrapper{language="rust"}
```rust
let (s, r) = crossbeam_channel::unbounded();
s.send(5).unwrap();
```
::

## `park` and `unpark`

Threads can be paused and woken:

::code-wrapper{language="rust"}
```rust
let h = thread::spawn(|| {
    thread::park();
    println!("unparked");
});
h.thread().unpark();
h.join().unwrap();
```
::

Low-level synchronization — usually use channels, `Condvar`, or `Barrier`.

## `Condvar`

::code-wrapper{language="rust"}
```rust
use std::sync::{Arc, Mutex, Condvar};

let pair = Arc::new((Mutex::new(false), Condvar::new()));
let (lock, cvar) = Arc::clone(&pair);

let h = thread::spawn(move || {
    let (mut started, cvar) = (&lock.0.lock().unwrap(), &lock.1);
    while !*started {
        started = cvar.wait(started).unwrap();
    }
});

{
    let (mut started, cvar) = (&lock.0.lock().unwrap(), &lock.1);
    *started = true;
    cvar.notify_one();
}

h.join().unwrap();
```
::

The classic pattern: wait inside the lock; `wait` atomically releases + sleeps + reacquires.

## `Barrier`

::code-wrapper{language="rust"}
```rust
use std::sync::Barrier;
let barrier = Arc::new(Barrier::new(3));
// each thread calls barrier.wait(); all unblock once 3 reach it
```
::

## `Once` and `OnceLock`

::code-wrapper{language="rust"}
```rust
use std::sync::OnceLock;
static INIT: OnceLock<Vec<u8>> = OnceLock::new();
let data = INIT.get_or_init(|| load_config());
```
::

## Atomic Types

`std::sync::atomic`: `AtomicBool`, `AtomicI32`, `AtomicUsize`, `AtomicPtr<T>`, etc.

::code-wrapper{language="rust"}
```rust
use std::sync::atomic::{AtomicUsize, Ordering};
let n = AtomicUsize::new(0);
n.fetch_add(1, Ordering::SeqCst);
n.compare_exchange(0, 1, Ordering::SeqCst, Ordering::Relaxed);
```
::

### Orderings

- `Relaxed`: no ordering constraints, just atomicity.
- `Acquire`: later reads see the latest writes (pair with `Release`).
- `Release`: prior writes are visible to `Acquire` readers.
- `AcqRel`: both.
- `SeqCst`: total order across threads (most expensive).

Use `SeqCst` if unsure; switch to `Relaxed`/`Acquire`/`Release` once you understand the memory model.

## Thread-Local Storage

::code-wrapper{language="rust"}
```rust
use std::cell::RefCell;
thread_local! {
    static COUNTER: RefCell<u32> = RefCell::new(0);
}

COUNTER.with(|c| { *c.borrow_mut() += 1; });
```
::

Per-thread state, no synchronization needed.

## Async vs Threads

- **Threads**: OS-level, ~1 MB stack, ~few µs context switch. Good for blocking I/O.
- **Async**: lightweight tasks, ~few KB stack, runtime-driven. Good for many concurrent I/O-bound tasks.

For CPU-bound work, threads or `rayon` (data parallelism) are appropriate. For many concurrent I/O operations, async (`tokio`/`async-std`) scales better.

## `rayon` for Data Parallelism

::code-wrapper{language="rust"}
```rust
use rayon::prelude::*;
let v: Vec<i32> = (1..=100).collect();
let sum: i32 = v.par_iter().map(|x| x * 2).sum();
```
::

`par_iter()` runs the iteration across a thread pool. Drop-in replacement for sequential iterators in many cases.

## Common Pitfalls

- **Deadlock**: inconsistent lock ordering. Acquire locks in a fixed global order, or use a single lock.
- **`Rc` across threads**: compile error. Use `Arc`.
- **Holding a lock across `await`**: in async code, this can deadlock; use `tokio::sync::Mutex` instead of `std::sync::Mutex` for async contexts, or `spawn_blocking`.
- **Lock poisoning**: if a thread panics while holding a lock, the lock becomes poisoned. Decide on a recovery policy.
- **Spawning without `join`**: detached threads can outlive main, dropping work mid-flight. Detach deliberately, not by accident.
- **`thread::spawn` requires `'static`**: closures can't borrow stack data unless `move`d.
- **Shared mutable state**: prefer message passing (channels) when possible — it isolates state and avoids locking.
- **`Send + Sync` are not enough for correctness**: they prevent data races, not logical races or deadlocks.
- **Atomic orderings are subtle**: wrong ordering causes bugs that don't show on x86 (which is strongly ordered). Test on weak architectures (ARM).
- **`Mutex::lock()` returns `Result`**: poison is the failure mode. Don't `unwrap` blindly in production code paths.

## Concurrency Tricks & Patterns

::code-wrapper{language="rust"}
```rust
// Trick: scoped threads to borrow from main thread
use std::thread;
let data = vec![1, 2, 3];
thread::scope(|s| {
    s.spawn(|| println!("{:?}", data)); // borrows data safely
});

// Trick: spawn_blocking for long-running blocking work in async
#[tokio::main]
async fn main() {
    let result = tokio::task::spawn_blocking(|| {
        std::thread::sleep(std::time::Duration::from_secs(1));
        42
    }).await.unwrap();
}

// Trick: use once_cell for lazy initialization
use std::sync::OnceLock;
fn get_config() -> &'static Config {
    static CONFIG: OnceLock<Config> = OnceLock::new();
    CONFIG.get_or_init(Config::load)
}

// Trick: use parking_lot for faster mutexes
// parking_lot::Mutex is often faster than std::sync::Mutex
let mutex = parking_lot::Mutex::new(0);
*mutex.lock() += 1; // no .unwrap() needed

// Trick: crossbeam for powerful channels
let (tx, rx) = crossbeam_channel::unbounded();
tx.send(1)?;
let val = rx.recv()?; // simpler API than std::mpsc
```
::

## Patterns

- **Work queue**: `mpsc` channels + worker pool.
- **Pub-Sub**: `async-channel`/`tokio::sync::broadcast` for multiple receivers.
- **Producer-consumer**: bounded `sync_channel` for backpressure.
- **Read-mostly cache**: `RwLock<HashMap<...>>` or `arc-swap` for atomic replacement.
- **Sharded locks**: split data into N shards each with its own lock (reduces contention).
- **Scoped threads**: use `thread::scope` to borrow from main thread safely (avoids `'static` requirement).
- **Thread-local storage**: `thread_local!` for per-thread state without synchronization.
- **Atomic spinning**: `std::sync::atomic::AtomicBool` with `.store()` for simple signaling (avoid in tight loops).

## Thread Pool

`std::thread` doesn't have a built-in pool. Use `rayon` (data parallel), `tokio` (async), or `threadpool`/`crossbeam_pool` (custom).

## Summary

`Send`/`Sync` are the foundation. Use `Arc` for shared ownership, `Mutex`/`RwLock` for synchronization, channels for message passing. Atomics for low-level coordination. `Condvar`/`Barrier`/`OnceLock` for common patterns. `rayon` for data parallelism. Prefer async for I/O-bound concurrency.

Next: Async/await — the modern Rust concurrency story.