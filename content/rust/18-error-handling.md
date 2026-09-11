# 18 — Error Handling

`Result<T, E>` isn't a stylistic alternative to exceptions — it's a decision to represent failure as data flowing through ordinary type-checked control flow instead of an out-of-band unwind mechanism. That decision has real, measurable consequences: no hidden control-flow paths, no runtime cost for the "happy path," but every layer of a call stack has to explicitly opt into propagating or handling an error — there's no "forgot to catch it, so it silently bubbles to a global handler." Understanding the mechanics of `?`, the actual cost of `Result`, and where teams get the `Result`/`panic!` boundary wrong is what separates "uses `?` a lot" from actually engineering an error strategy.

## Under-the-Hood Mechanics

### `Option<T>` and `Result<T, E>` are ordinary enums — with a critical layout optimization

::code-wrapper{language="rust"}
```rust
enum Option<T> { Some(T), None }
enum Result<T, E> { Ok(T), Err(E) }
```
::

Structurally these are tagged unions: a discriminant plus a payload sized for the larger variant. But rustc applies **niche optimization** whenever a type has an unused bit pattern to exploit: `Option<&T>` is exactly `size_of::<&T>()` — 8 bytes on 64-bit — because a reference can never be null, so `None` is represented by the all-zero bit pattern that a valid `&T` could never have. `Option<Box<T>>`, `Option<NonZeroU32>`, and `Option<bool>` all get this treatment. `Option<i32>`, by contrast, has no spare bit pattern to steal (every `i32` bit pattern is a valid `i32`), so it grows to 8 bytes (4-byte payload + tag, padded for alignment) instead of 4.

::code-wrapper{language="rust"}
```rust
println!("{}", std::mem::size_of::<Option<&i32>>());        // 8  — niche-optimized, no tag needed
println!("{}", std::mem::size_of::<Option<i32>>());          // 8  — tag + payload, no niche
println!("{}", std::mem::size_of::<Option<Box<i32>>>());     // 8  — niche-optimized
println!("{}", std::mem::size_of::<Result<i32, ()>>());      // 8  — E is zero-sized, no extra cost
```
::

::code-wrapper{language="rust"}
```rust
use std::num::NonZeroU32;
println!("{}", std::mem::size_of::<Option<bool>>());          // 1 — niche-optimized
println!("{}", std::mem::size_of::<Option<NonZeroU32>>());    // 4 — niche-optimized
println!("{}", std::mem::size_of::<Option<char>>());          // 4 — niche-optimized
println!("{}", std::mem::size_of::<Option<(i32, i32)>>());    // 12 — no spare bit pattern
```
::

"Wrap it in `Option`, it's free" is layout-dependent, not universal — `size_of` is how you verify it for a given type instead of assuming.

### `?` desugars to an explicit `match` plus a `From` conversion

::code-wrapper{language="rust"}
```rust
// `let n: i32 = s.parse()?;` desugars to roughly:
let n: i32 = match s.parse() {
    Ok(v) => v,
    Err(e) => return Err(std::convert::From::from(e)),
};
```
::

::code-wrapper{language="rust"}
```rust
#[derive(Debug)]
struct AppError(String);
impl From<std::num::ParseIntError> for AppError {
    fn from(e: std::num::ParseIntError) -> Self { AppError(e.to_string()) }
}

fn parse_port(s: &str) -> Result<u16, AppError> {
    let n: u16 = s.parse()?;   // From::from(ParseIntError) -> AppError, compile-time resolved
    Ok(n)
}
```
::

The `From::from(e)` call is load-bearing: `?` converts the error into the function's declared error type, not just propagates it unchanged. No `From` impl means a trait-bound compile error — never a runtime surprise.

### Unwinding is a real runtime mechanism with real cost — and it's optional

::code-wrapper{language="ini" filename="Cargo.toml"}
```ini
[profile.release]
panic = "abort"   # strips unwinding machinery entirely — panics terminate the process, no Drop runs
```
::

::code-wrapper{language="rust"}
```rust
// With default panic = "unwind": catch_unwind actually catches
let result = std::panic::catch_unwind(|| {
    panic!("boom");
});
assert!(result.is_err());
// With panic = "abort": this same call still aborts the process — catch_unwind is a no-op there
```
::

Unwinding walks the stack frame by frame, running each frame's `Drop` (RAII cleanup) via LLVM-generated landing pads — real binary-size and (on some platforms) steady-state cost even when no panic ever fires.

## Cost, Performance, and Trade-Offs

::code-wrapper{language="rust"}
```rust
// Cost-visible comparison: concrete error enum vs boxed trait object vs anyhow
#[derive(Debug)]
enum FastError { NotFound, Invalid(String) }   // stack-allocated, no boxing, size known at compile time

fn fast_path() -> Result<i32, FastError> { Err(FastError::NotFound) }        // no allocation

fn boxed_path() -> Result<i32, Box<dyn std::error::Error>> {                 // one allocation on Err
    Err(Box::new(std::io::Error::new(std::io::ErrorKind::NotFound, "x")))
}

fn anyhow_path() -> anyhow::Result<i32> {                                     // allocation + backtrace capture
    Err(anyhow::anyhow!("not found"))
}
```
::

`Result<T, E>`'s size is `max(size_of::<T>(), size_of::<E>()) + tag` — every `?` is a compile-time-resolved branch, not a runtime lookup, so the happy path costs nothing beyond that layout.

`thiserror` generates zero runtime code — its derive expands at compile time into ordinary `impl Display`/`impl Error`/`impl From`. `anyhow::Error` erases the concrete type (no `match` on variants without downcasting) and captures a backtrace by default — real stack-walking cost per error.

::code-wrapper{language="rust"}
```rust
// A Result::Err return is exactly as cheap as any other return — no unwind:
fn validate(n: i32) -> Result<i32, &'static str> {
    if n < 0 { return Err("negative"); }   // cheap, ordinary control flow
    Ok(n)
}

// A panic! unwinds the ENTIRE call stack back to the nearest catch_unwind/thread
// boundary, running every frame's Drop along the way — orders of magnitude more
// expensive, and in a multi-threaded server kills only the panicking thread:
fn validate_panicking(n: i32) -> i32 {
    if n < 0 { panic!("negative"); }   // expensive: full stack unwind
    n
}
```
::

## Production Failure Modes & Anti-Patterns

### `unwrap()` on external input reaching production

::code-wrapper{language="rust"}
```rust
// WRONG: works in every test, because tests control the input — production doesn't
fn handle_request(body: &str) -> i32 {
    let parsed: Config = serde_json::from_str(body).unwrap();  // panics on malformed JSON
    parsed.timeout_ms
}
```
::

The single most common Rust production incident pattern: correct against every input a developer tested, wrong against the first malformed request from a real client or attacker. The panic unwinds the handling thread — killing the whole process (single-threaded server) or one worker (thread-pool server) — when it should have been a `400 Bad Request`.

::code-wrapper{language="rust"}
```rust
// RIGHT: malformed input is an expected failure mode, not an invariant violation
fn handle_request(body: &str) -> Result<i32, AppError> {
    let parsed: Config = serde_json::from_str(body)
        .map_err(|e| AppError::BadRequest(e.to_string()))?;
    Ok(parsed.timeout_ms)
}
```
::

### Panicking inside a `Drop` impl during an already-unwinding panic

::code-wrapper{language="rust"}
```rust
// WRONG: a Drop impl that can itself panic — fine in isolation, catastrophic
// the moment it runs DURING an unwind already in progress from another panic
struct Connection { socket: TcpStream }

impl Drop for Connection {
    fn drop(&mut self) {
        self.socket.write_all(b"BYE").unwrap();   // can panic — e.g., socket already closed
    }
}
```
::

::code-wrapper{language="rust"}
```rust
// Ordinary scope exit: panic in drop() is just a normal, if abrupt, panic
fn ordinary() {
    let _c = Connection { socket: connect() };
}   // drop() panics here -> single panic, recoverable via catch_unwind

// Dropped WHILE ALREADY UNWINDING from an earlier panic: double panic -> abort
fn double_panic() {
    let _c = Connection { socket: connect() };
    panic!("first panic");   // unwind begins, `_c` drops mid-unwind, drop() panics again
    // process aborts immediately — no catch_unwind can intercept this
}
```
::

Rust cannot unwind twice simultaneously — a panic during an active unwind is an immediate, uncatchable process abort regardless of the crate's configured panic strategy.

::code-wrapper{language="rust"}
```rust
// RIGHT: Drop impls should not panic — log and continue, or make cleanup infallible
impl Drop for Connection {
    fn drop(&mut self) {
        if let Err(e) = self.socket.write_all(b"BYE") {
            eprintln!("failed to send goodbye during drop: {e}");  // never panic here
        }
    }
}
```
::

### Mixing error types across a call chain with no `From` impl, discovered at the worst possible layer

::code-wrapper{language="rust"}
```rust
// WRONG: compiles until the day someone adds a call that returns a
// different underlying error type three functions deep in the call chain
#[derive(Debug)]
struct ParseError(String);
impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "parse error: {}", self.0)
    }
}
impl std::error::Error for ParseError {}

fn parse_config(s: &str) -> Result<i32, ParseError> {
    let n: i32 = s.parse()?;   // ERROR: no From<ParseIntError> for ParseError
    Ok(n)
}
```
::

`?` requires a `From` impl between the source error and the declared return type — no structural or "looks related" coercion exists. This surfaces as a compile error the moment a new fallible call is added, tempting a rushed fix of `.unwrap()`-ing the intermediate result "just to make it compile."

::code-wrapper{language="rust"}
```rust
// RIGHT: thiserror's #[from] generates every needed From impl at compile time,
// so adding a new fallible call inside a function body is a one-line fix,
// not a hand-written boilerplate impl every time
use thiserror::Error;

#[derive(Debug, Error)]
enum ConfigError {
    #[error("parse: {0}")]
    Parse(#[from] std::num::ParseIntError),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

fn parse_config(s: &str) -> Result<i32, ConfigError> {
    let n: i32 = s.parse()?;   // From<ParseIntError> for ConfigError generated by #[from]
    Ok(n)
}
```
::

### Swallowing errors with `.ok()` to "make the type checker happy"

::code-wrapper{language="rust"}
```rust
// WRONG: silences the compiler, silently discards every failure reason
fn save_audit_log(entry: &str) {
    std::fs::write("/var/log/audit.log", entry).ok();  // Err is discarded, no trace
}
```
::

::code-wrapper{language="rust"}
```rust
// .ok() discards E entirely — legitimate only when the error truly carries no info
fn parse_optional_port(s: &str) -> Option<u16> {
    s.parse().ok()   // fine here: caller only cares whether parsing succeeded
}
```
::

In the audit-log case above, `.ok()` is the wrong tool: it makes a compile-time obligation ("handle this `Result`") disappear without handling it, and disk-full/permission errors vanish with zero operational visibility.

::code-wrapper{language="rust"}
```rust
// RIGHT: log the failure even when you've decided not to propagate it
fn save_audit_log(entry: &str) {
    if let Err(e) = std::fs::write("/var/log/audit.log", entry) {
        eprintln!("audit log write failed: {e}");   // at minimum, surface it
    }
}
```
::

## Architectural Application

::code-wrapper{language="rust"}
```rust
// The Result/panic! boundary IS the public-API contract:
fn parse_user_input(s: &str) -> Result<u32, String> {   // "you must handle failure"
    s.parse().map_err(|_| format!("invalid input: {s}"))
}
fn get_first_element(v: &[i32]) -> i32 {   // "passing an empty slice is YOUR bug"
    assert!(!v.is_empty(), "invariant violated: caller must pass non-empty slice");
    v[0]
}
```
::

::code-wrapper{language="rust" filename="core_lib/src/lib.rs"}
```rust
// Library crate: concrete thiserror enum — callers can match and recover
use thiserror::Error;
#[derive(Debug, Error)]
pub enum StoreError {
    #[error("timeout")] Timeout,
    #[error("invalid config: {0}")] InvalidConfig(String),
}
pub fn connect() -> Result<(), StoreError> { Err(StoreError::Timeout) }
```
::

::code-wrapper{language="rust" filename="app/src/main.rs"}
```rust
// Application crate: anyhow at the terminal consumption point — log and exit
fn main() -> anyhow::Result<()> {
    core_lib::connect().context("failed to connect to store")?;
    Ok(())
}
```
::

::code-wrapper{language="rust"}
```rust
// CLI tool: Result-returning main is correct — nonzero exit + printed error
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = std::fs::read_to_string("config.toml")?;   // startup failure -> abort whole process
    println!("{config}");
    Ok(())
}
```
::

::code-wrapper{language="rust"}
```rust
// Server: fallibility pushed into per-request handlers, never bubbled to main
fn handle_connection(stream: &str) -> Result<(), String> {
    if stream.is_empty() { return Err("empty stream".into()); }   // logged, doesn't kill the server
    Ok(())
}
```
::

::code-wrapper{language="rust"}
```rust
// Poisoned-lock recovery is a per-shared-state decision, not a blanket .unwrap()
use std::sync::Mutex;
let shared = Mutex::new(vec![1, 2, 3]);
let guard = shared.lock().unwrap_or_else(|poisoned| {
    eprintln!("lock poisoned — assuming invariant survived");
    poisoned.into_inner()   // recover, vs. `.unwrap()` which would propagate the panic
});
```
::

## 💡 Tips & Tricks

- **Idiom**: prefer `.with_context(|| format!(...))` over `.context("...")` only when the message needs runtime interpolation — plain `.context("static")` avoids the closure allocation for messages that need no formatting.
- **Debug**: `RUST_BACKTRACE=1 cargo run` on a panic shows the full unwind stack; `anyhow::Error` also captures a backtrace (with `RUST_BACKTRACE=1` set), retrievable via `err.backtrace()`.
- **Idiom**: `thiserror` for library crates (callers `match` on specific variants), `anyhow` for application/binary crates (callers just propagate and log) — mixing these the other way around is a common early-career Rust smell worth flagging in review.
- **Debug**: `dbg!(&result)` immediately before a `?` shows the exact `Ok`/`Err` value at that point in a chain — cheaper than adding a temporary `match` just to inspect an intermediate `Result`.
- **Idiom**: `#[from]` in a `thiserror` enum variant auto-generates the `From` impl `?` relies on — if you're hand-writing `impl From<X> for MyError` blocks, that's a signal to switch to `thiserror`.
- **Clippy**: enable `clippy::unwrap_used` and `clippy::expect_used` (opt-in, part of the `restriction` group) crate-wide in library code to make any stray `.unwrap()` a compile-time lint failure, catching a common review miss before it ships.

## ⚠️ Edge Cases & Gotchas

- **`unwrap()` on data you don't control is a production panic waiting to happen** — reserve it for genuinely provable invariants, never for external input.
- **Panicking across an FFI boundary is undefined behavior** — unwinding into non-Rust stack frames has no defined semantics; wrap FFI-exposed Rust functions in `catch_unwind` at the boundary.
- **Panicking inside a `Drop` impl during an already-active unwind aborts the process immediately** — regardless of the crate's panic strategy, a double-panic cannot unwind twice.
- **`?` requires a `From` impl between the source error and the function's declared error type** — there is no structural or "looks similar" coercion; `thiserror`'s `#[from]` is the low-boilerplate way to satisfy it.
- **`std::error::Error` trait objects need `+ Send + Sync` to be boxed as thread-safely-storable (`Box<dyn Error + Send + Sync>`)** — plain `Box<dyn Error>` isn't `Send`, which surfaces as a confusing bound failure the moment you try to send an error across a thread or store it behind a `Mutex`.
- **A panic in a spawned thread kills only that thread, not the process** — the panic value becomes a `Box<dyn Any + Send>` retrievable from `JoinHandle::join()`; a supervisor that never checks `join()`'s result silently loses track of failed workers.
- **`Result<T, E>` where `T == E` confuses inference at `?`/`.map_err` call sites** — annotate explicitly or use `.map_err` to disambiguate which arm an inferred type refers to.

## 🧠 Spot the Bug

Why does this fail to compile?

::code-wrapper{language="rust"}
```rust
use std::fmt;

#[derive(Debug)]
struct ParseError(String);

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "parse error: {}", self.0)
    }
}

impl std::error::Error for ParseError {}

fn parse_config(s: &str) -> Result<i32, ParseError> {
    let n: i32 = s.parse()?;
    Ok(n)
}
```
::

<details>
<summary>Answer</summary>

It fails with something like: ``the trait bound `ParseError: From<std::num::ParseIntError>` is not satisfied``.

`s.parse::<i32>()` fails with `ParseIntError`, but `parse_config` returns `Result<i32, ParseError>` — `?` needs `From<ParseIntError> for ParseError` to bridge the gap, and none exists. No implicit error-type coercion exists, even for "obviously related" types.

The fix is a manual `From` impl or, more idiomatically, `thiserror`:

::code-wrapper{language="rust"}
```rust
impl From<std::num::ParseIntError> for ParseError {
    fn from(e: std::num::ParseIntError) -> Self {
        ParseError(e.to_string())
    }
}
```
::

**The lesson**: `?` only converts error types automatically if a `From` impl exists between them — there's no structural or "looks similar" coercion, and forgetting it surfaces as a `?`-site trait-bound error, not an obvious "missing conversion" message.

</details>

## Summary

`Result`/`Option` cost exactly what their memory layout says — often nothing extra thanks to niche optimization — and `?` is a compile-time-resolved `match` plus a `From` conversion, not a runtime mechanism. Panicking triggers real, potentially expensive stack unwinding governed by `Drop`, and panicking during an active unwind aborts the process outright. The `Result`/`panic!` split is a public-API contract about who's responsible for a failure — expected conditions get `Result`, violated invariants get `panic!`, and getting this backwards misdirects every caller. Libraries expose concrete `thiserror` error enums; applications consume through `anyhow`.

Next: Smart pointers and interior mutability — the actual memory layout behind `Box`, `Rc`, `Arc`, `RefCell`, and where "shared ownership" quietly becomes a memory leak.
