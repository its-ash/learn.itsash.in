# 18 — Error Handling

Rust has two kinds of errors:

- **Unrecoverable** → `panic!` — a bug; the thread stops.
- **Recoverable** → `Result<T, E>` — expected failures (bad input, missing file); the caller decides.

## `panic!`

::code-wrapper{language="rust"}
```rust
fn main() {
    let v = vec![1, 2, 3];
    // v[10];                       // panic: index out of bounds
    // None::<i32>.unwrap();        // panic: called `Option::unwrap()` on a `None` value
    // panic!("config missing");    // explicit panic
    println!("{}", v[0]);
}
```
::

Use panics for "this should never happen" (broken invariants), not for user input.

## `Result<T, E>`

::code-wrapper{language="rust"}
```rust
use std::fs;

fn main() {
    match fs::read_to_string("config.toml") {
        Ok(text) => println!("{} bytes", text.len()),
        Err(e) => println!("could not read config: {e}"),
    }
}
```
::

### Parsing surprises

**Tricky**: `parse` is strict:

::code-wrapper{language="rust"}
```rust
fn main() {
    println!("{:?}", " 42".parse::<i32>());   // Err(InvalidDigit) — spaces are NOT trimmed!
    println!("{:?}", "+5".parse::<i32>());    // Ok(5)
    println!("{:?}", "".parse::<i32>());      // Err(Empty)
    println!("{:?}", "3.0".parse::<i32>());   // Err(InvalidDigit)
    println!("{:?}", "256".parse::<u8>());    // Err(PosOverflow)
    println!("{:?}", " 42".trim().parse::<i32>());   // Ok(42)
}
```
::

## Shortcuts

::code-wrapper{language="rust"}
```rust
fn main() {
    let good: Result<i32, String> = Ok(3);
    let bad: Result<i32, String> = Err("boom".into());

    println!("{}", good.clone().unwrap());              // 3 — panics on Err
    println!("{}", good.clone().expect("need a value")); // 3 — panics with YOUR message on Err
    println!("{}", bad.clone().unwrap_or(0));           // 0
    println!("{}", bad.clone().unwrap_or_default());    // 0 (i32 default)
    println!("{}", bad.clone().unwrap_or_else(|e| e.len() as i32)); // 4
    println!("{}", bad.is_err());                       // true

    let maybe: Option<i32> = None;
    println!("{:?}", maybe.ok_or("missing"));           // Err("missing") — Option → Result
}
```
::

## The `?` Operator

`?` means: "if this is `Err`, return it from the function right now; otherwise give me the `Ok` value."

::code-wrapper{language="rust"}
```rust
use std::num::ParseIntError;

fn add_strings(a: &str, b: &str) -> Result<i32, ParseIntError> {
    let x: i32 = a.trim().parse()?;
    let y: i32 = b.trim().parse()?;
    Ok(x + y)
}

fn main() {
    println!("{:?}", add_strings("2", " 3"));   // Ok(5)
    println!("{:?}", add_strings("2", "x"));    // Err(ParseIntError { kind: InvalidDigit })
}
```
::

It works on `Option` too, inside a function that returns `Option`:

::code-wrapper{language="rust"}
```rust
fn first_upper(s: &str) -> Option<char> {
    let c = s.chars().next()?;    // returns None early for ""
    Some(c.to_ascii_uppercase())
}

fn main() {
    println!("{:?} {:?}", first_upper("hi"), first_upper(""));   // Some('H') None
}
```
::

**Tricky**: `?` only works if the **function's** return type can hold the error:

::code-wrapper{language="rust"}
```rust
// fn main() {
//     let n: i32 = "5".parse()?;
// }
// error[E0277]: the `?` operator can only be used in a function that returns `Result` or `Option`

// fn first(v: &[i32]) -> Result<i32, String> {
//     let x = v.first()?;
// }
// error[E0277]: the `?` operator can only be used on `Result`s, not `Option`s, in a function that returns `Result`

fn first(v: &[i32]) -> Result<i32, String> {
    let x = v.first().ok_or("empty list")?;   // convert Option → Result first
    Ok(*x)
}

fn main() {
    println!("{:?}", first(&[]));   // Err("empty list")
}
```
::

## `main` Can Return a `Result`

::code-wrapper{language="rust"}
```rust
fn main() -> Result<(), std::num::ParseIntError> {
    let n: i32 = "abc".parse()?;
    println!("{n}");
    Ok(())
}
// prints: Error: ParseIntError { kind: InvalidDigit }   (Debug format)
// exit code: 1
```
::

## Your Own Error Type

::code-wrapper{language="rust"}
```rust
use std::fmt;
use std::num::ParseIntError;

#[derive(Debug)]
enum AppError {
    Parse(ParseIntError),
    Negative(i32),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            AppError::Parse(e) => write!(f, "not a number: {e}"),
            AppError::Negative(n) => write!(f, "negative: {n}"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<ParseIntError> for AppError {        // lets `?` convert automatically
    fn from(e: ParseIntError) -> Self { AppError::Parse(e) }
}

fn parse_positive(s: &str) -> Result<i32, AppError> {
    let n: i32 = s.trim().parse()?;            // ParseIntError → AppError via From
    if n < 0 {
        return Err(AppError::Negative(n));
    }
    Ok(n)
}

fn main() {
    for s in ["7", " 8 ", "x", "-1"] {
        match parse_positive(s) {
            Ok(n) => println!("ok {n}"),
            Err(e) => println!("error: {e}"),
        }
    }
}
// ok 7
// ok 8
// error: not a number: invalid digit found in string
// error: negative: -1
```
::

In real projects, the `thiserror` crate writes the `Display` and `From` impls for you.

### Quick mode: `Box<dyn Error>`

::code-wrapper{language="rust"}
```rust
use std::error::Error;

fn run() -> Result<i32, Box<dyn Error>> {
    let a: i32 = "10".parse()?;                       // ParseIntError
    let text = std::fs::read_to_string("missing.txt")?; // io::Error — a different type, still fine
    Ok(a + text.len() as i32)
}

fn main() {
    if let Err(e) = run() {
        println!("run failed: {e}");
    }
}
```
::

Good for apps and scripts (the `anyhow` crate is a richer version). Libraries should return a specific error enum so callers can `match` on it.

## 💡 Tips & Tricks

- **Idiom** — `expect("why this can't fail")` instead of bare `unwrap()`; the message is the documentation.
- **Idiom** — `.ok_or("msg")` / `.ok_or_else(...)` to turn an `Option` into a `Result` before `?`.
- **Idiom** — `.trim()` before `.parse()` on anything read from a user or file.
- **Idiom** — `thiserror` for library error enums, `anyhow` for applications.
- **Debug** — `RUST_BACKTRACE=1 cargo run` shows where a panic happened.

## ⚠️ Edge Cases & Gotchas

- **Parse** — `" 42".parse::<i32>()` fails; whitespace is not ignored.
- **`?` in main** — needs `fn main() -> Result<(), E>`.
- **`?` mixing** — `?` on an `Option` inside a `Result`-returning function doesn't compile; convert with `ok_or`.
- **`?` conversion** — `?` converts error types only if a `From` impl exists.
- **Silencing** — `.ok()`, `let _ = result;` and `unwrap_or_default()` all hide errors; use them on purpose only.
- **main errors** — printed with `Debug` (`{:?}`), not `Display`.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
fn read_port() -> u16 {
    std::env::var("PORT").ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080)
}
```
::

The ops team sets `PORT=80 ` (with a trailing space). What happens?

<details>
<summary>Answer</summary>

`"80 ".parse::<u16>()` fails, `.ok()` turns the error into `None`, and the server silently starts on **8080**. No log, no error — just "the port setting doesn't work".

Trim, and fail loudly on a bad value instead of guessing:

::code-wrapper{language="rust"}
```rust
fn read_port() -> Result<u16, String> {
    match std::env::var("PORT") {
        Err(_) => Ok(8080),                                      // not set → default is fine
        Ok(p) => p.trim().parse().map_err(|e| format!("bad PORT {p:?}: {e}")),
    }
}
```
::

**The lesson**: "missing" and "invalid" are different situations; `.ok()` makes them look the same.

</details>

## 🧠 Quick Quiz

::code-wrapper{language="rust"}
```rust
fn f(s: &str) -> Option<usize> {
    let n: usize = s.parse().ok()?;
    let half = n.checked_sub(10)?;
    Some(half / 2)
}

fn main() {
    println!("{:?} {:?} {:?}", f("30"), f("5"), f("x"));
}
```
::

<details>
<summary>Answer</summary>

`Some(10) None None` — `"5"` parses, but `5 - 10` underflows, so `checked_sub` returns `None`. `"x"` fails to parse.

</details>

## Summary

Panic for bugs, `Result` for expected failures. `?` passes errors up; `From` impls let it convert between error types. Don't silently throw errors away with `.ok()` or `unwrap_or` unless that is truly what you want.

Next: Smart Pointers.
