# 32 — Documentation

Rust docs are written in Markdown inside special comments, built with `cargo doc`, and their code examples are **compiled and run as tests**.

## Three Kinds of Comment

::code-wrapper{language="rust" filename="src/lib.rs"}
```rust
//! Crate-level docs (inner doc comment) — describes the file/module it is in.
//! Shown on the front page of your crate's documentation.

/// Item docs (outer doc comment) — describes the NEXT item.
pub fn greet() {}

// A normal comment — never appears in documentation.
```
::

::code-wrapper{language="bash"}
```bash
cargo doc --open          # build HTML docs (with your dependencies) and open them
cargo test --doc          # run only the examples in your docs
```
::

## Standard Sections

::code-wrapper{language="rust" filename="src/lib.rs"}
```rust
/// Parses a TCP port number.
///
/// # Examples
///
/// ```
/// let p = mylib::parse_port("8080")?;
/// assert_eq!(p, 8080);
/// # Ok::<(), std::num::ParseIntError>(())
/// ```
///
/// # Errors
///
/// Returns `ParseIntError` if `s` is not a number from 0 to 65535.
pub fn parse_port(s: &str) -> Result<u16, std::num::ParseIntError> {
    s.trim().parse()
}
```
::

| Section | When to write it |
|---|---|
| `# Examples` | always, for public items |
| `# Errors` | function returns `Result` — say **when** it fails |
| `# Panics` | function can panic — say **when** |
| `# Safety` | `unsafe fn` — what the caller must guarantee (chapter 25) |

## Doc Tests

**Tricky**: each example is compiled as a **separate crate**, like an outside user. So:

1. You must use the full path (`mylib::parse_port`), not just `parse_port`.
2. Private functions are not reachable.

::code-wrapper{language="rust"}
```rust
/// ```
/// assert_eq!(parse_port("1").unwrap(), 1);   // FAILS: error[E0425]: cannot find function `parse_port`
/// ```
pub fn wrong_path() {}

/// ```
/// assert_eq!(mylib::helper(), 1);            // FAILS: error[E0603]: function `helper` is private
/// ```
pub fn shows_private() {}

fn helper() -> i32 { 1 }
```
::

**Tricky**: `?` in an example needs a return type. Add a hidden last line (lines starting with `# ` run but are not shown in the docs):

::code-wrapper{language="rust"}
```rust
/// ```
/// let n: i32 = "5".parse()?;
/// # Ok::<(), std::num::ParseIntError>(())
/// ```
pub fn uses_question_mark() {}
```
::

### Example annotations

::code-wrapper{language="rust"}
```rust
/// ```should_panic
/// mylib::parse_port("http").unwrap();     // passes only if it panics
/// ```
///
/// ```no_run
/// mylib::start_server();                  // compiled, not executed (needs network)
/// ```
///
/// ```compile_fail
/// let x: u8 = "not a number";             // passes only if it does NOT compile
/// ```
///
/// ```text
/// Plain text — not Rust, not tested.
/// ```
pub fn annotated() {}
```
::

Avoid `ignore` — an ignored example silently rots.

## Links

::code-wrapper{language="rust"}
```rust
/// Like [`parse_port`], but returns [`None`] instead of an error.
/// See also [`std::net::TcpListener`].
pub fn try_port(s: &str) -> Option<u16> {
    parse_port(s).ok()
}
```
::

Names in `` [`...`] `` become clickable links, and `cargo doc` warns if they point to nothing.

## Enforce Docs

::code-wrapper{language="rust" filename="src/lib.rs"}
```rust
#![warn(missing_docs)]          // warn on any public item without a doc comment
```
::

## 💡 Tips & Tricks

- **Idiom** — first line = one short summary sentence; it appears in search results and module lists.
- **Idiom** — show the **common** use first, then edge cases.
- **Idiom** — hide setup lines with `# ` so the example stays short but still compiles.
- **CI** — `cargo test` runs doc tests; `RUSTDOCFLAGS="-D warnings" cargo doc` fails on broken links.
- **Idiom** — document what a function promises (inputs, outputs, errors), not how it works inside.

## ⚠️ Edge Cases & Gotchas

- **Paths** — doc examples are outside crates; call `mycrate::item`, not `item`.
- **Privacy** — examples can't use private items.
- **`?`** — needs a hidden `# Ok::<(), E>(())` line.
- **Binary crates** — doc tests only run for library crates (`src/lib.rs`).
- **`//` vs `///`** — a normal `//` comment is not documentation; `//!` documents the enclosing module.
- **ignore** — ignored examples are never checked and go stale.

## 🧠 Spot the Bug

::code-wrapper{language="rust" filename="src/lib.rs"}
```rust
/// Returns the average of the numbers.
///
/// ```
/// assert_eq!(stats::average(&[2.0, 4.0]), 3.0);
/// ```
pub fn average(v: &[f64]) -> f64 {
    v.iter().sum::<f64>() / v.len() as f64
}
```
::

The doc test passes. What does the documentation fail to tell users?

<details>
<summary>Answer</summary>

`average(&[])` returns `NaN` (`0.0 / 0.0`), silently. The docs don't mention it, and the only example is the happy path.

Either change the API (`-> Option<f64>`), or document and test the edge case:

::code-wrapper{language="rust"}
```rust
/// Returns the average of the numbers.
///
/// Returns `NaN` for an empty slice.
///
/// ```
/// assert_eq!(stats::average(&[2.0, 4.0]), 3.0);
/// assert!(stats::average(&[]).is_nan());
/// ```
pub fn average(v: &[f64]) -> f64 {
    v.iter().sum::<f64>() / v.len() as f64
}
```
::

</details>

## Summary

`///` documents the next item, `//!` the enclosing module. Write `# Examples`, `# Errors`, `# Panics` and `# Safety` sections. Doc examples are real tests compiled from the outside — use full paths, public items only, and hidden lines for setup.

Next: The Ecosystem.
