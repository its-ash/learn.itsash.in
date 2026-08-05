# 35 — Mastery Exercises & Project Ideas

Reading is the first step; building is where you become a pro. This chapter gives you exercises and projects calibrated to internalize everything.

## How to Use This Chapter

Each section has:
- **Exercises**: small, focused tasks to test specific concepts.
- **Projects**: end-to-end builds.
- **Solutions**: don't look until you've tried for 30 minutes.

## Beginner Exercises

### 1. FizzBuzz with Iterators

Implement FizzBuzz for 1..=100 using iterators and `collect::<Vec<String>>()`.

### 2. Stack with Generics

::code-wrapper{language="rust"}
```rust
struct Stack<T> { /* ... */ }
impl<T> Stack<T> {
    fn new() -> Self;
    fn push(&mut self, v: T);
    fn pop(&mut self) -> Option<T>;
    fn peek(&self) -> Option<&T>;
    fn len(&self) -> usize;
    fn is_empty(&self) -> bool;
}
```
::

Use `Vec<T>` internally. Implement `IntoIterator` for owned, `&`, and `&mut`.

### 3. Result Combinators

Write `parse_csv(s: &str) -> Result<Vec<Vec<i32>>, AppError>` using `?` and `split`/`parse`. Define `AppError` with `thiserror`.

### 4. Linked List (the Hard Way)

Implement a singly linked list using `Box<Node<T>>`. Then implement `Iter`, `IterMut`, `IntoIter`.

### 5. CLI Calculator

Take `+ 2 3` or `* 4 5` from argv, print the result. Use `clap` if you want a challenge.

## Intermediate Exercises

### 6. JSON Parser

Hand-write a JSON parser using `nom` or `pest`. Cover objects, arrays, strings (with escapes), numbers, booleans, null.

### 7. Async File Watcher

Watch a directory for changes using `notify` (crate), print events. Use `tokio::select!` with a Ctrl-C handler for clean shutdown.

### 8. Concurrent Counter with Channels

10 threads, each sending numbers to a single aggregator thread via `mpsc`. Print the final sum.

### 9. Custom `Iterator` for Fibonacci

::code-wrapper{language="rust"}
```rust
struct Fib { a: u64, b: u64 }
impl Iterator for Fib {
    type Item = u64;
    fn next(&mut self) -> Option<u64> { /* ... */ }
}
```
::

Add `.map`, `.filter`, `.take` chains.

### 10. Type-State Builder

A `RequestBuilder<Method, Path, Body>` with states `Unset`, `Set`. Methods only available in valid states.

## Advanced Exercises

### 11. Custom Trait Object

Implement your own dispatch table:

::code-wrapper{language="rust"}
```rust
struct VTable { size: usize, drop: unsafe fn(*mut u8), display: unsafe fn(*const u8, &mut Formatter) -> Result }
```
::

Compare with `Box<dyn Display>`.

### 12. Lock-Free Queue

Implement a bounded MPSC queue using atomics. Benchmark against `crossbeam-channel`.

### 13. Memory Pool

Implement an arena allocator (bump allocation). Use `bumpalo` as a reference. Add `Drop` to free the arena.

### 14. Async Stream

Implement a `Stream` that yields lines from a file asynchronously, with backpressure.

### 15. Custom Allocator

Implement a `GlobalAlloc` that tracks allocations and prints them. Use it as `#[global_allocator]`.

### 16. FFI Wrapper

Wrap `sqlite3` via `bindgen`. Expose a safe `Database`/`Statement` API with `Drop`.

## Project Ideas

### Beginner

1. **CLI todo app**: `add`, `list`, `done`, `remove`. JSON storage. Use `clap` + `serde`.
2. **HTTP file server**: serve a directory; `tokio` + `hyper` or `axum`.
3. **Markdown to HTML**: minimal converter; learn `nom`/`pest`.
4. **Word frequency counter**: from a file, print top 10. Use `HashMap`/`BTreeMap`.

### Intermediate

5. **Chat server**: TCP + `tokio::select!`. Broadcast to all connected clients.
6. **URL shortener**: `axum` + `redis`/`DashMap`. Persistent storage.
7. **Mini Redis**: implement a subset of Redis protocol. `tokio` + `bytes`.
8. **Web scraper**: `reqwest` + `select`/`scraper`. Polite rate limiting.
9. **Image processor**: `image` crate, batch resize with `rayon`.
10. **Database migration tool**: schema versioning, SQL execution via `sqlx`.

### Advanced

11. **Async ORM**: derive macro for table mapping; `sqlx`; compile-time queries.
12. **Game engine**: ECS with `bevy`; render sprites; basic physics.
13. **TLS proxy**: `tokio-rustls`; terminate TLS and forward plain TCP.
14. **Bittorrent client**: piece assembly, peer protocol, async I/O.
15. **Operating system kernel**: `no_std`; ` bootloader`; serial driver; minimal shell. (`blog_os` tutorial.)
16. **Database engine**: B+tree storage, WAL, MVCC. Hard but illuminating.
17. **Compiler**: parse a small language; lower to LLVM IR via `inkwell` or to Cranelift.
18. **Static site generator**: markdown → HTML, templates, RSS, syntax highlighting.
19. **WASM image editor**: client-side, `wasm-bindgen`, `Canvas` API.
20. **Realtime multiplayer game server**: WebSocket + `axum`; per-room state with `DashMap`.

## Reading Code to Mastery

Read source of:
- `std` (slice/iter/vec modules).
- `tokio` (scheduler, channels).
- `serde` (derive macros — `serde_derive`).
- `axum` (routing, middleware via `tower`).
- `reqwest` (HTTP client on `hyper`).
- `sqlx` (compile-time SQL checking via macros).
- `crossbeam` (epoch-based memory reclamation).
- `bevy` (ECS, scheduling, renderer).
- `regex` (DFA construction, Unicode tables).

The standard library is the best Rust code you can read. Start with `alloc::vec`, `core::iter`, `core::slice`.

## Practice Sites

- **Rustlings**: small exercises for each concept.
- **Exercism Rust track**: mentor-reviewed exercises.
- **Advent of Code**: annual puzzles, perfect for Rust.
- **LeetCode Rust**: algos.
- **Rosetta Code Rust**: idiomatic translations.

## Open Source Contribution

- `rust-lang/rust`: good-first-issue labels; tough but rewarding.
- `tokio-rs/*`: tokio ecosystem.
- `serde-rs/*`: serde, serde_json.
- `bevyengine/bevy`: game engine.
- `rust-cli/*`: CLI tool templates.

## Mastery Self-Check

Can you confidently:
- Explain ownership without using the word "borrow"? (Use "one owner, moved on assignment, dropped on scope-end".)
- Predict whether `&'static` is required for a thread closure? (Yes if it borrows stack data — use `move`.)
- Read `for<'a> Fn(&'a str) -> &'a str` and explain it? (HRTB; the closure works for any lifetime.)
- Implement a trait for both `&T` and `&mut T`? (Avoid; usually one suffices.)
- Implement `Iterator` for your own type? (Just `next()`.)
- Explain why `&mut T` is invariant in `T`? (Otherwise you could swap in shorter-lived data.)
- Choose between `Rc`, `Arc`, `Cell`, `RefCell`, `Mutex`? (Single-thread shared/clone: `Rc`; multi-thread: `Arc`; `Copy` interior: `Cell`; mut interior single-thread: `RefCell`; mut interior multi-thread: `Mutex`.)
- Read a `Pin<&mut T>` and know what `!Unpin` implies? (Can't safely move the `T` after pinning.)
- Reason about variance of your custom smart pointer? (Pick `PhantomData` accordingly.)
- Write a `proc_macro_derive`? (Use `syn`/`quote`.)
- Read `unsafe { *ptr }` and verify the safety invariants? (Alignment, initialization, aliasing, lifetime.)

If you can do all of the above without consulting docs, you're a pro Rust developer.

## Final Words

Rust has a steep learning curve but pays dividends. The compiler is strict but kind: errors are messages, not crashes. Once you internalize ownership, lifetimes, and the trait system, the rest is vocabulary.

Build things. Break things. Read the stdlib. Read `tokio`. Run `cargo expand` on macros. Run `Miri` on unsafe. Profile with `samply`. Contribute to open source.

Welcome to being a Rust developer.

🦀