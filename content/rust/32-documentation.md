# 32 — Documentation

Documentation is part of the Rust culture. `rustdoc` produces HTML docs from `///` comments; doc-tests run examples.

## Doc Comments

::code-wrapper{language="rust"}
```rust
/// Adds two integers.
///
/// Returns `a + b`, panicking on overflow in debug builds.
///
/// # Examples
///
/// ```
/// use my_crate::add;
/// assert_eq!(add(2, 2), 4);
/// ```
///
/// # Panics
///
/// Panics if `a + b` overflows in debug mode.
pub fn add(a: i32, b: i32) -> i32 { a + b }
```
::

- `///` for items (functions, types, modules).
- `//!` for the enclosing item (crate root, module — used for top-level docs).

::code-wrapper{language="rust"}
```rust
//! # My Crate
//!
//! This crate provides wonderful things.
```
::

## Standard Sections

| Section | Purpose |
|---|---|
| `# Examples` | Usage examples (run as doc tests). |
| `# Panics` | When the function panics. |
| `# Errors` | For `Result`-returning functions: which `Err` variants. |
| `# Safety` | For `unsafe` functions: required invariants. |
| `# Arguments` | Parameter docs (sometimes redundant with prose). |
| `# Returns` | Return value docs. |
| `# Notes` | Extra info. |

The order convention: Examples, Panics, Errors, Safety.

## Cross-References

::code-wrapper{language="rust"}
```rust
/// See [`std::fs::read`] for reading a file.
/// Uses [`OtherType::method`] internally.
/// Implements [`MyTrait`].
```
::

Backticks create hyperlinks. rustdoc resolves intra-doc links.

::code-wrapper{language="rust"}
```rust
/// [`OtherType`] is in scope.
/// [`crate::sub::Thing`]
```
::

## Building Docs

::code-wrapper{language="bash"}
```bash
cargo doc                  # generate for the crate
cargo doc --open           # generate and open in browser
cargo doc --no-deps        # skip dependencies
cargo doc --workspace      # all crates in workspace
cargo doc --document-private-items  # include private items (rare)
```
::

Output goes to `target/doc/`.

## Doc Tests (Recap)

::code-wrapper{language="rust"}
```rust
/// ```
/// use my_crate::add;
/// assert_eq!(add(2, 2), 4);
/// ```
```
::

- `cargo test` runs them.
- `no_run`: compile but don't execute.
- `ignore`: skip.
- `compile_fail`: assert it doesn't compile (negative test).
- `rust,edition2018`: pin edition.
- `# use ...` lines are hidden in rendered docs but executed in tests.

::code-wrapper{language="rust"}
```rust
/// ```
/// # use my_crate::add;
/// assert_eq!(add(2, 2), 4);
/// ```
```
::

## Doc Attributes

::code-wrapper{language="rust"}
```rust
#[doc(hidden)]            // hide from docs (still public)
#[doc(alias = "another")] // search alias
#[doc = "raw text"]      // alternative to /// for non-string content
#[doc(inline)]           // inline re-exports
#[doc(no_inline)]        // don't inline
#[doc(cfg(feature = "..."))]  // show "Available on feature only" banner
```
::

## Lints

::code-wrapper{language="rust"}
```rust
#![warn(missing_docs)]
#![warn(missing_debug_implementations)]
#![warn(rustdoc::broken_intra_doc_links)]
#![warn(rustdoc::missing_crate_level_docs)]
```
::

`missing_docs` forces every public item to have docs — good for libraries.

## Crate-Level Docs

::code-wrapper{language="rust"}
```rust
// src/lib.rs
//! # My Crate
//!
//! This crate does X for Y.
//!
//! ## Quick Start
//! ```
//! use my_crate::*;
//! ```
```
::

Include a quick-start at the crate root.

## `README.md` Inclusion

::code-wrapper{language="rust"}
```rust
#![doc = include_str!("../README.md")]
```
::

Treats the README as crate-level docs. Common for projects that want one source of truth.

## Style Guide

- Write prose, not telegrams. Sentences with verbs.
- Document the *why*, not just the *what*.
- Examples for every public function that's not obvious.
- Use `# Panics` and `# Errors` sections consistently.
- Cross-reference related items.
- Keep examples small and self-contained.
- Avoid docs on trivial getters/setters; document the field instead.

## Examples

### Good

::code-wrapper{language="rust"}
```rust
/// Computes the Fibonacci number at position `n`.
///
/// Uses an iterative algorithm with O(n) time and O(1) space.
///
/// # Examples
///
/// ```
/// use my_crate::fib;
/// assert_eq!(fib(0), 0);
/// assert_eq!(fib(10), 55);
/// ```
///
/// # Panics
///
/// Panics if `n` is large enough to overflow `u64`.
pub fn fib(n: u64) -> u64 { /* ... */ 0 }
```
::

### Bad

::code-wrapper{language="rust"}
```rust
/// fib function
pub fn fib(n: u64) -> u64 { 0 }
```
::

## Hidden Examples for Complex Setup

::code-wrapper{language="rust"}
```rust
/// ```
/// # use std::sync::Arc;
/// # use std::sync::Mutex;
/// # let state = Arc::new(Mutex::new(0));
/// let _v = state.lock().unwrap();
/// ```
```
::

Setup lines prefixed with `#` are hidden in the rendered doc but executed.

## Doc Test Pitfalls

- **External crate imports**: doc tests need `extern crate` or `use` lines.
- **Top-level `use` shadowing**: each doc test is its own crate.
- **`compile_fail`** must be on a fenced block, and the block must actually fail to compile.
- **`no_run` with `main`**: works; `no_run` compiles but skips execution.
- **Doc tests are slow**: skip in CI with `cargo test --lib --bins --tests`.

## `mdbook` for Standalone Docs

For guides/books, `mdbook` is the standard tool:

::code-wrapper{language="bash"}
```bash
cargo install mdbook
mdbook init docs
mdbook serve docs
```
::

Many major Rust projects (`rust-lang/rust`, `tokio`, `bevy`) have mdbook guides alongside rustdoc.

## Publishing Docs

- **docs.rs**: auto-builds and hosts docs for crates published to crates.io. Configure with `[package.metadata.docs.rs]`:

::code-wrapper{language="toml"}
```toml
[package.metadata.docs.rs]
features = ["full", "all-feature-flags"]
all-features = true
rustdoc-args = ["--cfg", "docsrs"]
```
::

- **GitHub Pages**: deploy `target/doc/` via Actions.
- **`cargo-docs-rs`**: preview docs.rs rendering locally.

## Cross-Crate Doc Links

::code-wrapper{language="rust"}
```rust
/// See the [`serde`] crate for serialization.
/// See [`tokio::sync::mpsc`] for channels.
```
::

rustdoc can resolve links to external crates if they're in your `Cargo.toml`.

## Common Pitfalls

- **Broken intra-doc links**: rustdoc warns; turn into errors with `#![warn(rustdoc::broken_intra_doc_links)]`.
- **Missing crate-level docs**: `#![warn(rustdoc::missing_crate_level_docs)]`.
- **Examples don't compile**: CI runs doc tests; broken examples break releases.
- **`#[doc(hidden)]` on re-exports**: hides the re-export but not the original.
- **Hidden `#` lines visible in source**: they're hidden in HTML but visible in `.rs` source.
- **`#![doc(html_logo_url = "...")]`**: branding on docs.
- **`#![doc(html_root_url = "https://docs.rs/crate/1.0")]`**: helps intra-doc link resolution.

## Summary

Write doc comments (`///`, `//!`) with standard sections (Examples, Panics, Errors, Safety). Run `cargo doc` and `cargo test` (doc tests). Use hidden `#` lines for setup. Cross-reference with backticks. Enable `missing_docs` for libraries. Publish to docs.rs. Use `mdbook` for guides.

Next: Rust ecosystem tour.