# 32 — Documentation as API Contract

Junior engineers treat documentation as an afterthought — prose bolted onto finished code. Senior engineers treat it as **part of the API surface**: a doc comment's `# Panics`/`# Errors`/`# Safety` sections are a contract callers rely on, a doctest is a compiled, version-checked example that participates in your semver guarantees, and missing or stale docs are a production-incident vector, not a style nit. This chapter treats `rustdoc` as toolchain infrastructure, not a formatting convention.

## Under-the-Hood Mechanics

### How `rustdoc` actually processes your crate

::code-wrapper{language="rust"}
```rust
// rustdoc uses the compiler's OWN name resolution — not text parsing —
// so intra-doc links resolve per-item, scoped to what's in scope there.
mod inner {
    pub struct Widget;
}
use inner::Widget;

/// Builds a new [`Widget`]. Resolves because `Widget` is `use`d above,
/// in THIS module — the same link written inside `mod inner` without
/// its own `use` would fail to resolve, even though it's the same type.
pub fn make() -> Widget { Widget }
```
::

### Doctests are compiled, separate binaries

::code-wrapper{language="rust"}
```rust
/// ```
/// // This block is extracted, wrapped in fn main(), compiled as its
/// // OWN crate, and run under `cargo test` — NOT under `cargo doc`.
/// use my_crate::add;
/// assert_eq!(add(2, 2), 4);
/// ```
pub fn add(a: i32, b: i32) -> i32 { a + b }
```
::

Consequences: no implicit crate access (must `use` like an external consumer), full compile-link cost per example (hundreds of doctests can dominate `cargo test` wall-clock time), and `cargo doc` never runs them — only `cargo test`/`cargo test --doc` does.

### Semver and doctests

::code-wrapper{language="rust"}
```rust
/// ```
/// use my_crate::parse;
/// assert_eq!(parse("5s").unwrap().as_secs(), 5); // asserts the INVARIANT, not just "compiles"
/// ```
pub fn parse(s: &str) -> Option<std::time::Duration> { /* ... */ None }

// Rename this fn, or change its signature -> every doctest calling it
// fails to COMPILE, immediately, catching a breaking change before a
// patch release ships it. A silent behavior change (same signature,
// different result) is NOT caught unless the assertion checks the
// actual value, not just that the call compiles.
```
::

## Cost, Performance, and Trade-Offs

| Practice | Build/CI cost | Payoff |
|---|---|---|
| Doctests on every public fn | Slower `cargo test` (separate compile per example) | Executable contract; renames/signature changes fail loudly |
| `#![warn(missing_docs)]` early | None at introduction; retrofitting later is expensive | Forces documentation debt to zero at each commit instead of accumulating |
| `#![doc = include_str!("../README.md")]` | One extra doctest-adjacent compile if README has code blocks | Single source of truth; README and docs.rs never drift apart |
| `cargo doc --document-private-items` in CI | Marginal | Catches broken intra-doc links in internal modules before they ship |
| Full `cargo test --doc` on every CI run | Meaningfully slower CI for large crates | Only way to guarantee published examples still compile against HEAD |

::code-wrapper{language="yaml"}
```yaml
# Fast stage: gates every push, no doctests.
- run: cargo test --lib --bins --tests

# Slower stage: gates merge to main — this is the ONLY place a renamed
# public fn's stale doc example gets caught before it ships to docs.rs.
- run: cargo test --doc
```
::

## Standard Sections and What Each One Guarantees

| Section | Guarantee to the caller |
|---|---|
| `# Examples` | Compiles and runs against the current API — the only living proof the API works as claimed |
| `# Panics` | Every documented panic condition is exhaustive; an *undocumented* panic in a function without a `# Panics` section is arguably a bug, not just a doc gap |
| `# Errors` | Enumerates `Err` variants and their meaning — callers write `match`/`?`-based handling from this, not from reading your implementation |
| `# Safety` | The precise invariants an `unsafe fn` caller must uphold — this is the *actual* soundness contract; get it wrong or incomplete and every caller's `unsafe` block is unsound without their knowledge |
| `# Notes` | Non-contractual context — the one section that's advisory, not a promise |

::code-wrapper{language="rust"}
```rust
/// Divides `numerator` by `denominator`, rounding toward zero.
///
/// # Examples
///
/// ```
/// use my_crate::checked_div;
/// assert_eq!(checked_div(10, 3), Some(3));
/// assert_eq!(checked_div(10, 0), None);
/// ```
///
/// # Panics
///
/// Never panics — division by zero returns `None` instead. Contrast with
/// the `/` operator, which panics on integer division by zero.
pub fn checked_div(numerator: i64, denominator: i64) -> Option<i64> {
    numerator.checked_div(denominator)
}
```
::

## Safety Documentation for `unsafe fn` — the highest-stakes doc comment you'll write

::code-wrapper{language="rust"}
```rust
/// Reads `len` bytes from `ptr` and returns them as a `Vec<u8>`.
///
/// # Safety
///
/// The caller must ensure:
/// - `ptr` is valid for reads of `len` bytes.
/// - The memory referenced by `ptr` is initialized for the full `len`.
/// - `ptr` is not concurrently mutated for the duration of this call
///   (no aliasing `&mut` access exists elsewhere).
/// - `len * size_of::<u8>()` does not overflow `isize`.
pub unsafe fn read_bytes(ptr: *const u8, len: usize) -> Vec<u8> {
    std::slice::from_raw_parts(ptr, len).to_vec()
}
```
::

An incomplete `# Safety` section is a soundness gap, not a doc gap — an omitted invariant (say, alignment) lets correct-looking caller code trigger real UB, with the bug report landing nowhere near this function.

## Production Failure Modes & Anti-Patterns

### Anti-pattern: documentation that describes the implementation, not the contract

::code-wrapper{language="rust"}
```rust
/// Loops through the vector and sums the elements using a for loop.
pub fn sum(items: &[i32]) -> i32 {
    items.iter().sum()
}
```
::

Describes *how* it works today (a lie the moment someone refactors to `fold`/SIMD) and says nothing about what actually matters: overflow behavior, empty-slice result. Contract-coupled docs survive rewrites; implementation-coupled docs rot on the first one.

::code-wrapper{language="rust"}
```rust
/// Returns the sum of `items`, or `0` for an empty slice.
///
/// # Panics
///
/// Panics on `i32` overflow in debug builds; wraps silently in release
/// builds (standard Rust integer-overflow semantics).
pub fn sum(items: &[i32]) -> i32 {
    items.iter().sum()
}
```
::

### Anti-pattern: `#[doc(hidden)]` used as an access-control mechanism

::code-wrapper{language="rust"}
```rust
// "This is internal, nobody should call it" — enforced only by convention.
#[doc(hidden)]
pub fn internal_reset_state() {
    // ...
}
```
::

**Why it fails at scale**: `#[doc(hidden)]` hides an item from rendered documentation — it does **not** change visibility. `internal_reset_state` is still fully `pub`, fully callable by any downstream crate, and fully covered by your semver guarantees whether you intended that or not. Teams that rely on `#[doc(hidden)]` as a soft-private convention eventually get bug reports from a downstream crate that depended on the "hidden" function, and discover they can't remove or change it without a major version bump — the hiding never was the access control they assumed. The production-grade fix is `pub(crate)` for genuine internal APIs, and `#[doc(hidden)]` reserved for items that must be `pub` for technical reasons (macro-generated glue) but were never meant to be part of the public contract — documented as such in a crate-level policy, not assumed.

### Anti-pattern: docs.rs build succeeding locally, failing in production

::code-wrapper{language="rust"}
```rust
#[cfg(feature = "async")]
/// Spawns a background worker using the configured async runtime.
///
/// ```
/// # #[cfg(feature = "async")]
/// # async fn example() {
/// use my_crate::spawn_worker;
/// spawn_worker().await;
/// # }
/// ```
pub async fn spawn_worker() { /* ... */ }
```
::

**Why it fails at scale**: `cargo doc` locally builds with whatever features you happen to have enabled in your shell session — often all of them, out of habit. docs.rs builds with **default features only**, unless `[package.metadata.docs.rs]` explicitly opts into more. A feature-gated item like `spawn_worker` silently disappears from the *published* docs (or the doctest silently doesn't run) with no local signal that anything is wrong, because your local environment happened to have the feature on. The fix is explicit configuration, checked into the repo, not left to the ambient state of a developer's machine:

::code-wrapper{language="toml"}
```toml
[package.metadata.docs.rs]
all-features = true
rustdoc-args = ["--cfg", "docsrs"]
```
::

## Architectural Application

::code-wrapper{language="rust"}
```rust
// A doc coverage gate is the same category of guardrail as a type system —
// it converts "someone forgot to document this" into a compile-time failure.
#![deny(missing_docs)]
#![deny(rustdoc::broken_intra_doc_links)]

/// Missing this doc comment: COMPILE ERROR under #![deny(missing_docs)].
pub fn public_api() {}
```
::

An incomplete `# Safety` produces unsound-but-compiling caller code crate-wide, discovered only via Miri or production UB. An incomplete `# Errors` produces callers that `match` a subset of variants and mishandle the rest. The crate-level `//!` doc comment is the onboarding document for every engineer who depends on it:

::code-wrapper{language="rust" filename="src/lib.rs"}
```rust
//! # payment-ledger
//!
//! Append-only, double-entry ledger core used by the billing service.
//!
//! ## Quick Start
//!
//! ```
//! use payment_ledger::{Ledger, Entry};
//! let mut ledger = Ledger::new();
//! ledger.record(Entry::credit("acct_1", 500))?;
//! # Ok::<(), payment_ledger::LedgerError>(())
//! ```
//!
//! ## Invariants
//!
//! Every [`Entry`] recorded via [`Ledger::record`] is immutable once
//! committed — see [`Ledger::record`]'s `# Errors` section for the
//! conditions under which a record is rejected instead of committed.

#![warn(missing_docs)]
#![warn(rustdoc::broken_intra_doc_links)]
```
::

## 💡 Tips & Tricks

- **Debug**: `cargo doc --open` after any doc-comment edit is the fastest feedback loop — rendering surfaces malformed intra-doc links and broken Markdown that reading raw `///` comments won't reveal.
- **Idiom**: write the `# Examples` section *first*, before the prose. If you can't write a compiling example quickly, that's a signal the API needs simplifying, not just better docs.
- **Performance**: doc tests compile as separate binaries and meaningfully slow `cargo test` on large crates — split CI into a fast stage (`cargo test --lib --bins --tests`) and a slower `cargo test --doc` stage.
- **Debug**: `cargo test --doc -- --nocapture` shows `println!` output from inside doctests — useful when an example is meant to demonstrate output but you can't confirm it's producing what the prose claims.
- **Idiom**: use hidden `# ` setup lines liberally (`# use my_crate::Thing;`) to keep the *rendered* example focused while the doctest still compiles with full imports.
- **Clippy/lint**: enable `#![warn(missing_docs)]` at a library's inception, not late — retrofitting documentation onto an already-public, already-large API surface is a materially bigger task than requiring docs as each item is added.

## ⚠️ Edge Cases & Gotchas

- **A broken doc example fails `cargo test`, not just `cargo doc`**: a renamed function left stale in a doc comment's example doesn't produce stale documentation — it breaks the build, which surprises contributors who mentally file docs under "just comments."
- **Hidden `#` lines are invisible in rendered HTML but fully visible in the `.rs` source**: don't hide anything security-sensitive or misleading there — "hidden" means hidden from the doc viewer, not from anyone reading source.
- **`compile_fail` doctests can pass for the wrong reason**: the block only asserts *failure to compile*, not *why* — an unrelated typo satisfies `compile_fail` just as well as the specific type error you intended to demonstrate.
- **`#[doc(hidden)]` hides an item from docs, not from callers**: a `#[doc(hidden)] pub fn` is fully callable by downstream crates and fully covered by semver — hiding it from documentation is a rendering choice, not an access-control mechanism.
- **Intra-doc links resolve per-item, not crate-wide**: `` [MyType] `` on a function in module `a` fails to resolve if `MyType` isn't in scope at that exact item, even if it's ubiquitous elsewhere in the crate.
- **A locally-succeeding `cargo doc` doesn't guarantee docs.rs succeeds**: docs.rs builds with default features only (plus whatever `[package.metadata.docs.rs]` declares) and sometimes a pinned toolchain — a crate needing `all-features` and not declaring it can fail or render incompletely there while looking fine locally.

## 🧠 Spot the Bug

A team ships a minor version bump. CI (unit tests only) is green. A downstream consumer immediately reports their build is broken. What did the fast CI stage miss?

::code-wrapper{language="rust"}
```rust
// v1.2.0 → v1.3.0 diff (unit tests unaffected — internal rename only touched signature)

/// Parses a duration string like `"5s"` or `"3m"`.
///
/// # Examples
///
/// ```
/// use my_crate::parse_duration;
/// let d = parse_duration("5s").unwrap();
/// assert_eq!(d.as_secs(), 5);
/// ```
-pub fn parse_duration(input: &str) -> Result<Duration, ParseError> {
+pub fn parse_duration_str(input: &str) -> Result<Duration, ParseError> {
    // ...
}
```
::

<details>
<summary>Answer</summary>

CI ran `cargo test --lib --bins --tests` as its fast stage — the team had deliberately excluded doctests from the PR-gating pipeline to keep it quick, deferring `cargo test --doc` to a slower nightly job. The rename from `parse_duration` to `parse_duration_str` is a breaking public API change with no deprecation shim, and the crate's own `# Examples` section still calls the old name — which would have failed to compile immediately under `cargo test --doc`, catching the break before publish. Because the doctest stage didn't run in the gating pipeline, the broken example (and, more importantly, the undocumented breaking rename) shipped in what was tagged as a minor version, violating semver and breaking every downstream consumer who upgraded expecting only additive changes.

**The lesson**: deferring doctests out of the fast CI path is a legitimate speed trade-off, but only if a doctest run gates the actual publish/release step, not just a background nightly job — otherwise the exact safety net doctests exist to provide (catching public-API breaks before they ship) is the thing you disabled.

</details>

## Summary

Doc comments aren't prose decoration — `# Panics`/`# Errors`/`# Safety` are contracts, and doctests are compiled, executed proof that your public API matches what you claim about it. `rustdoc` reuses the compiler's own name resolution, which is why intra-doc links are scoped per-item, not global. Doctests are a real, non-trivial cost to `cargo test` wall-clock time on large crates — split CI into a fast unit-test stage and a slower doctest stage, but never let the doctest stage disappear from the actual release gate. `#[doc(hidden)]` is a rendering choice, not access control — use `pub(crate)` for genuine internal APIs. Configure `[package.metadata.docs.rs]` explicitly; don't rely on a local `cargo doc` success as proof docs.rs will succeed.

Next: Rust ecosystem tour.
