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

## 💡 Tips & Tricks

- **Debug**: `cargo doc --open` after any doc-comment change is the fastest feedback loop — rendering catches malformed intra-doc links and broken Markdown that reading the raw `///` comments won't reveal.
- **Idiom**: use hidden `# ` setup lines liberally in doc examples (`# use my_crate::Thing;`) — they keep the *rendered* example focused on the interesting part while still compiling and running as a real doc test with all necessary imports.
- **Debug**: `cargo test --doc -- --nocapture` shows `println!` output from inside doc tests, useful when a doc example is supposed to demonstrate output but you can't tell if it's actually producing what the prose claims.
- **Idiom**: write the `# Examples` section *first*, before the prose — if you can't write a compiling example quickly, that's often a sign the API itself needs simplifying, not just better docs.
- **Performance**: doc tests compile as separate binaries and meaningfully slow down `cargo test` on large crates — many projects run `cargo test --lib --bins --tests` in fast CI stages and reserve full doc-test runs (`cargo test --doc`) for a slower, separate job.
- **Clippy/lint**: turn on `#![warn(missing_docs)]` early in a library's life, not late — retrofitting documentation onto a large, already-public API surface is a much bigger task than requiring docs as each item is added.

## ⚠️ Edge Cases & Gotchas

- **A broken doc example fails `cargo test`, not just `cargo doc`**: doc tests are compiled and executed by `cargo test` by default — a renamed function that isn't updated in a doc comment's example doesn't just produce stale documentation, it breaks the build, which surprises contributors who think of docs as "just comments."
- **Hidden `#` lines are invisible in rendered HTML but fully visible in the `.rs` source file**: anyone reading the source directly (not the generated docs) sees every hidden setup line — don't hide anything security-sensitive or misleading there, since "hidden" only means hidden from the doc viewer.
- **`compile_fail` doc tests can pass for the wrong reason**: a `compile_fail` block only asserts the code *fails to compile* — it doesn't check *why*. A typo that produces an unrelated syntax error still satisfies `compile_fail`, silently defeating the intent of demonstrating a specific type error.
- **`#[doc(hidden)]` hides an item from docs but does not make it private**: a `#[doc(hidden)] pub fn` is still fully callable by any downstream crate — hiding it from documentation is not an access-control mechanism, just a visibility hint for doc generation, a distinction that matters for semver (you can still break callers of a "hidden" function).
- **Intra-doc links resolve based on what's in scope at that exact item, not the whole crate**: `[MyType]` inside a doc comment on a function in module `a` won't resolve if `MyType` isn't imported or reachable from module `a`'s scope, even if it's a well-known type used everywhere else in the crate — the link-breakage is per-item, not global.
- **`cargo doc` succeeding locally doesn't guarantee docs.rs succeeds**: docs.rs builds with specific feature flags and sometimes a pinned toolchain; a crate that needs `all-features = true` or a `docsrs`-specific `cfg` and doesn't declare it in `[package.metadata.docs.rs]` can fail or render incompletely on docs.rs while looking fine with a plain local `cargo doc`.
- **Platform-independent trap — doc tests run with the crate's default features only, unless configured**: a doc example that references a feature-gated type without the feature enabled compiles fine when that feature happens to be a default, then breaks the moment someone changes the crate's default-features set, since doc tests don't automatically enable every feature.

## 🧠 Spot the Bug

Why does `cargo test` fail here, even though the function itself is correct and `cargo build` succeeds?

::code-wrapper{language="rust"}
```rust
/// Doubles a number.
///
/// # Examples
///
/// ```
/// let result = double(21);
/// assert_eq!(result, 42);
/// ```
pub fn double(n: i32) -> i32 {
    n * 2
}
```
::

<details>
<summary>Answer</summary>

The doc test fails to compile: `error[E0425]: cannot find function \`double\` in this scope`.

Every fenced code block in a doc comment is compiled as its **own separate crate** — it does not automatically have access to the items of the crate it's documenting, no matter how "obviously nearby" the function looks in the source file. The example calls `double(21)` directly, but from that isolated doc-test crate's perspective, `double` doesn't exist unless it's explicitly brought into scope with a `use` statement, exactly as any external consumer of the published crate would have to do: `use my_crate::double;`. This is easy to miss because `cargo build` never runs doc tests at all — only `cargo test` (or `cargo test --doc`) compiles and executes them, so the mistake can sit unnoticed through every `cargo build`/`cargo check` cycle during development.

**The lesson**: doc tests are independent crates with no implicit access to the crate they document — always `use` the item you're demonstrating, ideally as a hidden `# use` line to keep the rendered example clean.

</details>

## Summary

Write doc comments (`///`, `//!`) with standard sections (Examples, Panics, Errors, Safety). Run `cargo doc` and `cargo test` (doc tests). Use hidden `#` lines for setup. Cross-reference with backticks. Enable `missing_docs` for libraries. Publish to docs.rs. Use `mdbook` for guides.

Next: Rust ecosystem tour.