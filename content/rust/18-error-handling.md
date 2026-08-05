# 18 — Error Handling

Rust's error handling is a defining strength. There's no exceptions, no `null`. Errors are **values** (`Result`/`Option`) and the type system forces you to handle them.

## `Option<T>` — Absence

```rust
enum Option<T> { Some(T), None }
```

Use when a value is logically absent. The compiler forces you to handle `None`:

```rust
let v: Option<i32> = Some(5);
let s = match v { Some(x) => x.to_string(), None => String::from("none") };
```

## `Result<T, E>` — Recoverable Errors

```rust
enum Result<T, E> { Ok(T), Err(E) }
```

```rust
fn parse(s: &str) -> Result<i32, std::num::ParseIntError> {
    s.parse()
}
match parse("42") {
    Ok(n) => println!("{n}"),
    Err(e) => println!("err: {e}"),
}
```

## The `?` Operator

Short-circuits on error, propagating `Err`:

```rust
fn parse_and_double(s: &str) -> Result<i32, std::num::ParseIntError> {
    let n: i32 = s.parse()?;     // returns Err on failure
    Ok(n * 2)
}
```

`?` desugars roughly to:

```rust
match expr {
    Ok(v) => v,
    Err(e) => return Err(e.into()),
}
```

It uses `From` to convert errors, so you can mix error types if they implement `From`.

### `?` on `Option`

```rust
fn first_char(s: &str) -> Option<char> {
    s.chars().next()?
}
```

Returns `None` if the inner is `None`.

### `?` in `main`

Since Rust 1.56, `main` can return `Result`:

```rust
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let n: i32 = std::env::args().nth(1).unwrap().parse()?;
    println!("{n}");
    Ok(())
}
```

If `main` returns `Err`, the program exits with code 1 and prints the error.

## Recovering Values

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

Same combinator suite exists for `Result` (with `map_err`, `map`, `and_then`, etc.).

## The `std::error::Error` Trait

```rust
pub trait Error: Debug + Display {
    fn source(&self) -> Option<&(dyn Error + 'static)> { None }
}
```

A type implementing `Error` can be used with `Result<_, MyError>`, chained with `?` (via `From`), and printed with `{:?}`/`{}`. The `source` method gives an error chain.

## Defining Your Own Error Type

### The Manual Way

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

### The `thiserror` Crate (idiomatic)

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

`#[from]` generates the `From` impl. `#[error]` generates `Display`. Use `thiserror` for libraries.

### The `anyhow` Crate (applications)

```rust
use anyhow::{Context, Result};

fn read_config(path: &str) -> Result<Config> {
    let s = std::fs::read_to_string(path).with_context(|| format!("read {path}"))?;
    Ok(parse(&s)?)
}
```

`anyhow::Error` is a boxed trait object with backtraces and context. Perfect for application code where you just want errors to bubble up with context.

## `panic!` — Unrecoverable

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

```rust
opt.ok_or(ErrorKind::Missing)?;
res.ok()?;                    // discards Err, returns None on Err
res.err()?;                   // discards Ok
res.ok().filter(|x| *x > 0);
opt.ok_or_else(|| ErrorKind::Missing)?;
```

## `Result` Combinators

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

## Multiple Errors

```rust
fn parse_two(s1: &str, s2: &str) -> Result<(i32, i32), ParseIntError> {
    let a: i32 = s1.parse()?;
    let b: i32 = s2.parse()?;
    Ok((a, b))
}
```

For independent errors you want to accumulate (not short-circuit), use `itertools::process_results` or roll your own.

## `Result` with Multiple Variants

Use `Result<T, MyErrorEnum>` and a custom error enum (see `thiserror` above).

## `Box<dyn Error>` as Catchall

```rust
fn foo() -> Result<i32, Box<dyn std::error::Error>> {
    let n: i32 = "x".parse()?;     // works for any Error type
    let f = std::fs::File::open("x")?;
    Ok(n)
}
```

`Box<dyn Error>` accepts any error via `?`. Loses static type info; ok for prototypes.

## Error Chaining

```rust
return Err(MyError::New).context("while processing X"));
```

`anyhow`'s `Context` trait adds messages:

```rust
std::fs::read_to_string(path).context("read config")?;
```

The error chain shows: "read config" → original `io::Error`.

## Edge Cases & Pitfalls

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

## Idioms Cheat Sheet

- Use `?` to propagate.
- Define one error enum per crate with `thiserror`.
- Use `anyhow::Result` in application code (binary crates).
- Use `Result` in library APIs.
- Use `Option` only when absence is normal, not "operation failed".
- `panic!` for invariants, never for input validation in public APIs.
- `assert!` for tests; `debug_assert!` for invariants you don't want in release.

## Summary

Errors are values, handled via `?`, `match`, and combinators. `Option` = absence, `Result` = failure. `thiserror` for libraries, `anyhow` for apps. `panic!` for invariants only. `main` can return `Result`.

Next: Memory management — smart pointers and interior mutability.