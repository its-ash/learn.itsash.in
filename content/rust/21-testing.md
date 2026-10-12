# 21 — Testing

Testing is built into Cargo. A test is a function marked `#[test]` that passes if it returns without panicking.

## Unit Tests

Unit tests live next to the code, in a `tests` module compiled only for `cargo test`:

::code-wrapper{language="rust" filename="src/lib.rs"}
```rust
pub fn add(a: i32, b: i32) -> i32 { a + b }

fn double(x: i32) -> i32 { x * 2 }        // private

#[cfg(test)]                              // not included in normal builds
mod tests {
    use super::*;                         // bring the parent's items in

    #[test]
    fn adds() {
        assert_eq!(add(2, 2), 4);
    }

    #[test]
    fn private_functions_are_testable() {
        assert_eq!(double(3), 6);         // unit tests CAN see private items
    }
}
```
::

::code-wrapper{language="bash"}
```bash
cargo test                 # run everything
cargo test adds            # only tests whose name contains "adds"
cargo test -- --nocapture  # show println! output from passing tests
cargo test -- --ignored    # run only #[ignore] tests
```
::

## Assertions

::code-wrapper{language="rust"}
```rust
#[cfg(test)]
mod tests {
    #[test]
    fn assertions() {
        let x = 3;
        assert!(x > 0);
        assert_eq!(x, 3);
        assert_ne!(x, 4);
        assert_eq!(x, 3, "x was {x}");    // custom message on failure
    }
}
```
::

A failure shows both sides:

::code-wrapper{language="bash"}
```bash
assertion `left == right` failed: x was 3
  left: 3
 right: 4
```
::

**Tricky**: never `assert_eq!` floats directly:

::code-wrapper{language="rust"}
```rust
#[cfg(test)]
mod tests {
    #[test]
    fn floats() {
        // assert_eq!(0.1 + 0.2, 0.3);              // FAILS: 0.30000000000000004 != 0.3
        assert!((0.1_f64 + 0.2 - 0.3).abs() < 1e-9);  // compare with a tolerance
    }
}
```
::

## Testing Panics

::code-wrapper{language="rust"}
```rust
pub fn divide(a: i32, b: i32) -> i32 {
    if b == 0 { panic!("division by zero"); }
    a / b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[should_panic(expected = "division by zero")]   // message must CONTAIN this text
    fn div_by_zero() {
        divide(1, 0);
    }
}
```
::

**Tricky**: `#[should_panic]` **without** `expected` passes on **any** panic — including a bug:

::code-wrapper{language="rust"}
```rust
#[cfg(test)]
mod tests {
    #[test]
    #[should_panic]
    fn passes_for_the_wrong_reason() {
        let v: Vec<i32> = vec![];
        v[0];             // index-out-of-bounds panic — the test still "passes"
    }
}
```
::

## Tests That Return `Result`

::code-wrapper{language="rust"}
```rust
#[cfg(test)]
mod tests {
    #[test]
    fn parses() -> Result<(), std::num::ParseIntError> {
        let n: i32 = "42".parse()?;   // `?` works; an Err fails the test
        assert_eq!(n, 42);
        Ok(())
    }
}
```
::

## Integration Tests

Files in `tests/` are separate crates that use your library like an outside user:

::code-wrapper{language="bash"}
```bash
my_crate/
├── src/lib.rs
└── tests/
    └── api.rs
```
::

::code-wrapper{language="rust" filename="tests/api.rs"}
```rust
use my_crate::add;           // only `pub` items are visible here

#[test]
fn adds_from_outside() {
    assert_eq!(add(1, 1), 2);
}
```
::

**Tricky**: a binary-only crate (just `src/main.rs`) can't be integration-tested — `tests/` can't import from `main.rs`. Move the logic into `src/lib.rs` and keep `main.rs` thin.

## Doc Tests

Code in `///` comments is compiled and run by `cargo test`:

::code-wrapper{language="rust" filename="src/lib.rs"}
```rust
/// Adds two numbers.
///
/// ```
/// assert_eq!(my_crate::add(2, 3), 5);
/// ```
pub fn add(a: i32, b: i32) -> i32 { a + b }
```
::

Examples in your docs can never silently go out of date.

## Parallel Tests and Shared State

**Tricky**: tests run **at the same time** on several threads. Tests that share a file, a port, an environment variable or a global can break each other randomly:

::code-wrapper{language="rust"}
```rust
#[cfg(test)]
mod tests {
    use std::fs;

    #[test]
    fn writes_a() { fs::write("out.txt", "a").unwrap(); assert_eq!(fs::read_to_string("out.txt").unwrap(), "a"); }

    #[test]
    fn writes_b() { fs::write("out.txt", "b").unwrap(); assert_eq!(fs::read_to_string("out.txt").unwrap(), "b"); }
    // Sometimes passes, sometimes fails — both tests race on the SAME file.
}
```
::

Fix: give each test its own file (e.g. a temporary directory per test). As a quick check, `cargo test -- --test-threads=1` runs them one by one.

## 💡 Tips & Tricks

- **Debug** — `cargo test -- --nocapture` shows `println!` output (hidden for passing tests by default).
- **Idiom** — always give `#[should_panic]` an `expected = "..."`.
- **Idiom** — name tests like sentences: `withdraw_fails_when_balance_too_low`.
- **Speed** — `#[ignore]` slow tests; run them with `cargo test -- --ignored` in CI.
- **Coverage** — test edge cases: empty input, zero, `MAX`, negative numbers, non-ASCII strings.

## ⚠️ Edge Cases & Gotchas

- **Parallel** — tests share the process; files, env vars and globals can clash.
- **Output** — `println!` in a passing test is hidden.
- **should_panic** — without `expected`, any panic counts as a pass.
- **Floats** — use a tolerance, not `assert_eq!`.
- **Visibility** — unit tests see private items; integration tests see only `pub`.
- **Binaries** — logic in `main.rs` can't be reached from `tests/`.
- **Release** — `cargo test` runs debug builds; overflow behaves differently in release (chapter 01).

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
pub fn parse_age(s: &str) -> u8 {
    s.parse().expect("age must be a number")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[should_panic]
    fn rejects_text() {
        parse_age("abc");
    }

    #[test]
    #[should_panic]
    fn rejects_too_old() {
        parse_age("300");
    }
}
```
::

<details>
<summary>Answer</summary>

Both tests pass, but `rejects_too_old` passes **by accident**: `"300"` doesn't fit `u8`, so the panic is the same generic "age must be a number" — no real age check exists. If someone later changes the type to `u16`, `parse_age("300")` returns `300` and… the test **fails**, revealing the missing rule only by luck.

Test the actual behavior with an explicit message, and add the rule:

::code-wrapper{language="rust"}
```rust
pub fn parse_age(s: &str) -> Result<u8, String> {
    let n: u16 = s.trim().parse().map_err(|_| "age must be a number".to_string())?;
    if n > 150 { return Err("age too large".into()); }
    Ok(n as u8)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_too_old() {
        assert_eq!(parse_age("300"), Err("age too large".into()));
    }
}
```
::

</details>

## Summary

`#[test]` functions pass unless they panic. Use `assert_eq!` with messages, `#[should_panic(expected = ...)]` for panics, `Result`-returning tests for `?`, `tests/` for public-API tests, and doc tests for examples. Remember tests run in parallel.

Next: Concurrency.
