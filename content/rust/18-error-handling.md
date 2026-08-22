# 18 — Error Handling

Rust's error handling is a defining strength. There's no exceptions, no `null`. Errors are **values** (`Result`/`Option`) and the type system forces you to handle them.

## `Option<T>` — Absence

::code-wrapper{language="rust"}
```rust
enum Option<T> { Some(T), None }
```
::

Use when a value is logically absent. The compiler forces you to handle `None`:

::code-wrapper{language="rust"}
```rust
let v: Option<i32> = Some(5);
let s = match v { Some(x) => x.to_string(), None => String::from("none") };
```
::

## `Result<T, E>` — Recoverable Errors

::code-wrapper{language="rust"}
```rust
enum Result<T, E> { Ok(T), Err(E) }
```
::

::code-wrapper{language="rust"}
```rust
fn parse(s: &str) -> Result<i32, std::num::ParseIntError> {
    s.parse()
}
match parse("42") {
    Ok(n) => println!("{n}"),
    Err(e) => println!("err: {e}"),
}
```
::

## The `?` Operator

Short-circuits on error, propagating `Err`:

::code-wrapper{language="rust"}
```rust
fn parse_and_double(s: &str) -> Result<i32, std::num::ParseIntError> {
    let n: i32 = s.parse()?;     // returns Err on failure
    Ok(n * 2)
}
```
::

`?` desugars roughly to:

::code-wrapper{language="rust"}
```rust
match expr {
    Ok(v) => v,
    Err(e) => return Err(e.into()),
}
```
::

It uses `From` to convert errors, so you can mix error types if they implement `From`.

### `?` on `Option`

::code-wrapper{language="rust"}
```rust
fn first_char(s: &str) -> Option<char> {
    s.chars().next()?
}
```
::

Returns `None` if the inner is `None`.

### `?` in `main`

Since Rust 1.56, `main` can return `Result`:

::code-wrapper{language="rust"}
```rust
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let n: i32 = std::env::args().nth(1).unwrap().parse()?;
    println!("{n}");
    Ok(())
}
```
::

If `main` returns `Err`, the program exits with code 1 and prints the error.

## Recovering Values

::code-wrapper{language="rust"}
```rust
let v = opt.unwrap();          // panics on None
let v = opt.expect("msg");      // panics with custom msg
let v = opt.unwrap_or(default);
let v = opt.unwrap_or_default();
let v = opt.unwrap_or_else(|| expensive());
let v = opt.map(|x| x + 1);   // Option<Option<...>> sometimes
let v = opt.and_then(|x| Some(x + 1));   // flatten
let v = opt.or(Some(0));
let v = opt.or_else(|| Some(0));
let v = opt.get_or_insert(0);
let v = opt.take();             // leaves None in opt
```
::

Same combinator suite exists for `Result` (with `map_err`, `map`, `and_then`, etc.).

## The `std::error::Error` Trait

::code-wrapper{language="rust"}
```rust
pub trait Error: Debug + Display {
    fn source(&self) -> Option<&(dyn Error + 'static)> { None }
}
```
::

A type implementing `Error` can be used with `Result<_, MyError>`, chained with `?` (via `From`), and printed with `{:?}`/`{}`. The `source` method gives an error chain.

## Defining Your Own Error Type

### The Manual Way

::code-wrapper{language="rust"}
```rust
#[derive(Debug)]
enum AppError {
    Io(std::io::Error),
    Parse(std::num::ParseIntError),
    Custom(String),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            AppError::Io(e) => write!(f, "io: {e}"),
            AppError::Parse(e) => write!(f, "parse: {e}"),
            AppError::Custom(s) => write!(f, "{s}"),
        }
    }
}

impl std::error::Error for AppError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            AppError::Io(e) => Some(e),
            AppError::Parse(e) => Some(e),
            AppError::Custom(_) => None,
        }
    }
}

impl From<std::io::Error> for AppError { fn from(e: std::io::Error) -> Self { AppError::Io(e) } }
impl From<std::num::ParseIntError> for AppError { fn from(e: std::num::ParseIntError) -> Self { AppError::Parse(e) } }
```
::

### The `thiserror` Crate (idiomatic)

::code-wrapper{language="rust"}
```rust
use thiserror::Error;

#[derive(Debug, Error)]
enum AppError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("parse: {0}")]
    Parse(#[from] std::num::ParseIntError),
    #[error("{0}")]
    Custom(String),
}
```
::

`#[from]` generates the `From` impl. `#[error]` generates `Display`. Use `thiserror` for libraries.

### The `anyhow` Crate (applications)

::code-wrapper{language="rust"}
```rust
use anyhow::{Context, Result};

fn read_config(path: &str) -> Result<Config> {
    let s = std::fs::read_to_string(path).with_context(|| format!("read {path}"))?;
    Ok(parse(&s)?)
}
```
::

`anyhow::Error` is a boxed trait object with backtraces and context. Perfect for application code where you just want errors to bubble up with context.

## `panic!` — Unrecoverable

::code-wrapper{language="rust"}
```rust
panic!("cannot continue");
unreachable!("documented unreachable");
unimplemented!("todo");
todo!("later");
assert!(x > 0);
assert_eq!(a, b);
assert_ne!(a, b);
debug_assert!(x > 0);   // only in debug builds
```
::

`panic!` is for invariants: "this state should never happen." It unwinds the stack (calling destructors) unless `panic = "abort"` is set in the profile.

## Unwinding vs Aborting

- **Unwind** (default): cleans up via `Drop`, then exits the thread/process.
- **Abort** (`panic = "abort"` in `Cargo.toml`): immediate process exit, smaller binary, faster panic, but no cleanup.

Catch a panic with `std::panic::catch_unwind` (rare; mostly for FFI).

## Result vs panic — Heuristics

- `Result` for **expected** failure (file not found, parse error).
- `panic` for **violated invariants** (index out of bounds, unreachable code, internal corruption).
- Returning `Option` for "logically absent" (looking up a key).
- Returning `Result` for "operation failed".

## `Option` and `Result` Conversion

::code-wrapper{language="rust"}
```rust
opt.ok_or(ErrorKind::Missing)?;
res.ok()?;                    // discards Err, returns None on Err
res.err()?;                   // discards Ok
res.ok().filter(|x| *x > 0);
opt.ok_or_else(|| ErrorKind::Missing)?;
```
::

## `Result` Combinators

::code-wrapper{language="rust"}
```rust
let r: Result<i32, E> = Ok(5);
r.map(|x| x + 1);
r.map_err(|e| OtherError(e));
r.and_then(|x| Ok(x + 1));
r.or(Ok(0));
r.or_else(|_| Ok(0));
r.unwrap_or(0);
r.unwrap_or_default();
r.unwrap_or_else(|_| 0);
r.is_ok();
r.is_err();
r.ok();          // Option<T>
r.err();          // Option<E>
r.as_ref();
r.as_mut();
r.transpose();    // Option<Result<T, E>> -> Result<Option<T>, E>
```
::

## Multiple Errors

::code-wrapper{language="rust"}
```rust
fn parse_two(s1: &str, s2: &str) -> Result<(i32, i32), ParseIntError> {
    let a: i32 = s1.parse()?;
    let b: i32 = s2.parse()?;
    Ok((a, b))
}
```
::

For independent errors you want to accumulate (not short-circuit), use `itertools::process_results` or roll your own.

## `Result` with Multiple Variants

Use `Result<T, MyErrorEnum>` and a custom error enum (see `thiserror` above).

## `Box<dyn Error>` as Catchall

::code-wrapper{language="rust"}
```rust
fn foo() -> Result<i32, Box<dyn std::error::Error>> {
    let n: i32 = "x".parse()?;     // works for any Error type
    let f = std::fs::File::open("x")?;
    Ok(n)
}
```
::

`Box<dyn Error>` accepts any error via `?`. Loses static type info; ok for prototypes.

## Error Chaining

::code-wrapper{language="rust"}
```rust
return Err(MyError::New).context("while processing X"));
```
::

`anyhow`'s `Context` trait adds messages:

::code-wrapper{language="rust"}
```rust
std::fs::read_to_string(path).context("read config")?;
```
::

The error chain shows: "read config" → original `io::Error`.

## 💡 Tips & Tricks

- **Idiom**: `.with_context(|| format!(...))` (from `anyhow`) is preferred over `.context("...")` when the message needs to interpolate a runtime value — plain `.context("static")` avoids the closure allocation entirely for messages with no interpolation, so use whichever form actually needs the laziness.
- **Debug**: `RUST_BACKTRACE=1 cargo run` on a panic shows the full unwind stack; `anyhow::Error` also captures a backtrace automatically on nightly or with `RUST_BACKTRACE=1` set, viewable via `err.backtrace()`.
- **Idiom**: reach for `thiserror` in library crates (callers need to `match` on specific variants) and `anyhow` in application/binary crates (callers just want to propagate and log) — mixing the two the other way around is a common early-career Rust smell.
- **Debug**: `dbg!(&result)` before a `?` shows you the exact `Ok`/`Err` value at that point in the chain — cheaper than adding a temporary `match` block just to inspect an intermediate `Result`.
- **Idiom**: `#[from]` in a `thiserror` enum variant auto-generates the `From` impl that `?` relies on — if you're hand-writing `impl From<X> for MyError` blocks, check whether switching to `thiserror` would eliminate that boilerplate entirely.
- **Clippy**: `clippy::unwrap_used` and `clippy::expect_used` (part of the `restriction` group, opt-in) can be enabled crate-wide to make any stray `.unwrap()` in library code a compile-time lint failure, catching a common review miss before it ships.

## ⚠️ Edge Cases & Gotchas

- **`unwrap()` in production**: panic on bad input. Use `?` or `match` instead.
- **`expect()` is better than `unwrap`**: a custom message helps debugging.
- **Panic across FFI**: undefined behavior — use `catch_unwind` at the FFI boundary.
- **`?` and `From`**: when mixing error types, ensure `From` impls exist; `thiserror`'s `#[from]` is the easy way.
- **Panic in destructors**: aborts; avoid panicking in `Drop`.
- **`?` on `Option` returns from `Option`-returning functions only**: `?` requires `Try`, and the return type must match.
- **`std::error::Error` requires `Send + Sync` to box as `Box<dyn Error + Send + Sync>`** — useful for thread-safe error storage.
- **Backtraces**: `std::backtrace::Backtrace` (1.65+) gives you a backtrace at error construction; `anyhow` integrates with it.
- **`Result::into_ok`/`into_err`** consume without checking — useful only when you're sure.
- **`Result` vs `Option` interop**: `Option::ok_or`, `Option::ok_or_else`, `Result::ok`, `Result::err`.
- **Panicking in a thread**: kills the thread but not the process. Use `JoinHandle` to detect; the panic becomes `Box<dyn Any + Send>` from `join`.
- **`Result<T, E>` where `T == E`**: the compiler can't infer which arm you mean — annotate or use `.map_err`.
- **Custom error type without `Debug`**: required by `Error` trait; derive it.

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

The `?` operator doesn't just "return the error" — it calls `From::from(err)` to convert the failure's error type into the function's declared return error type, so that the caller gets back exactly the `Result<T, ParseError>` the signature promises. Here, `s.parse::<i32>()` produces a `Result<i32, std::num::ParseIntError>` on failure, but `parse_config` is declared to return `Result<i32, ParseError>` — for `?` to bridge the gap, the compiler needs a `From<ParseIntError> for ParseError` impl, and none exists. This is easy to miss because the two types "feel" related (both about parsing), but Rust performs no implicit error-type coercion — every conversion has to be spelled out via `From`, whether by hand or through `thiserror`'s `#[from]` attribute.

The fix is either a manual `From` impl or, more idiomatically, `thiserror`:

::code-wrapper{language="rust"}
```rust
impl From<std::num::ParseIntError> for ParseError {
    fn from(e: std::num::ParseIntError) -> Self {
        ParseError(e.to_string())
    }
}
```
::

**The lesson**: `?` only converts error types automatically if a `From` impl exists between them — there's no structural or "looks similar" coercion, and forgetting the `From` impl surfaces as a `?`-site trait-bound error, not an obvious "missing conversion" message.

</details>

## Error Handling Tricks

::code-wrapper{language="rust"}
```rust
// Trick: use ok_or to convert Option to Result
let value: Option<i32> = Some(5);
let result: Result<i32, String> = value.ok_or("not found".to_string());

// Trick: use map_err to convert error types
"not_a_number".parse::<i32>()
    .map_err(|e| format!("parse failed: {}", e))

// Trick: chain errors with .context() from anyhow
use anyhow::Context;
std::fs::read_to_string("file.txt")
    .context("failed to read file")
    .context("during initialization")?;

// Trick: use unwrap_or_else to lazily compute default
let v = opt.unwrap_or_else(|| expensive_default());

// Trick: tap into errors without propagating
let result = dangerous_op()
    .map_err(|e| { eprintln!("warning: {}", e); e })
    .ok(); // convert to Option

// Trick: collect error results
let results: Vec<_> = items.iter().map(|x| risky(x)).collect();
let (oks, errs): (Vec<_>, Vec<_>) = results.into_iter().partition(Result::is_ok);

// Trick: zip errors for parallel error accumulation
use itertools::Itertools;
items.iter()
    .zip_eq(other_items.iter()) // panics if lengths differ
    .map(|(a, b)| process(a, b))
    .collect::<Result<Vec<_>, _>>()?
```
::

## Idioms Cheat Sheet

- Use `?` to propagate.
- Define one error enum per crate with `thiserror`.
- Use `anyhow::Result` in application code (binary crates).
- Use `Result` in library APIs.
- Use `Option` only when absence is normal, not "operation failed".
- `panic!` for invariants, never for input validation in public APIs.
- `assert!` for tests; `debug_assert!` for invariants you don't want in release.
- Avoid `unwrap()` in library code; prefer `?` or returning `Result`.
- Use `unwrap_or_default()` when you have a sensible zero-value.
- Use `.ok()?` to convert `Result` to `Option` and propagate `None`.
- Use `.ok_or()` to give context when converting `Option` to `Result`.

## Summary

Errors are values, handled via `?`, `match`, and combinators. `Option` = absence, `Result` = failure. `thiserror` for libraries, `anyhow` for apps. `panic!` for invariants only. `main` can return `Result`.

Next: Memory management — smart pointers and interior mutability.