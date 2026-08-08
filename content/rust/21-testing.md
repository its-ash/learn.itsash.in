# 21 — Testing in Rust

Rust's testing is built into the language and `cargo`. There are three layers: unit tests, integration tests, and documentation tests.

## Test Categories

1. **Unit tests**: live inside the source, in `#[cfg(test)] mod tests`. Test private items.
2. **Integration tests**: live in `tests/` as separate crates. Test public API.
3. **Doc tests**: code in `///` doc comments, run as examples.

## Writing a Unit Test

::code-wrapper{language="rust"}
```rust
pub fn add(a: i32, b: i32) -> i32 { a + b }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_two() {
        assert_eq!(add(2, 2), 4);
    }

    #[test]
    #[should_panic(expected = "negative")]
    fn rejects_negative() {
        panic!("negative not allowed");
    }

    #[test]
    fn returns_result() -> Result<(), String> {
        if add(2, 2) == 4 { Ok(()) } else { Err(String::from("bad")) }
    }
}
```
::

- `#[test]` marks a test function.
- `assert!`, `assert_eq!`, `assert_ne!`.
- `#[should_panic(expected = "...")]` for panic tests.
- Returning `Result<(), E: Debug>` is allowed — `Err` fails the test.

## Running Tests

::code-wrapper{language="bash"}
```bash
cargo test                 # all tests
cargo test add             # filter by name substring
cargo test --lib           # only lib unit tests
cargo test --test integration   # only specific integration test
cargo test -- --nocapture  # show println! output
cargo test -- --test-threads=4
cargo test --release       # tests in release mode
cargo test -- --ignored    # run #[ignore] tests
```
::

## Integration Tests

::code-wrapper{language="text"}
```text
tests/
└── integration_test.rs
```
::

::code-wrapper{language="rust"}
```rust
use my_crate::add;

#[test]
fn integration_add() {
    assert_eq!(add(2, 3), 5);
}
```
::

- Separate crate; can only use `pub` API.
- Multiple files in `tests/` become separate test binaries.

### Common Setup Module

::code-wrapper{language="text"}
```text
tests/
├── common/
│   └── mod.rs          # NOT a test file
└── integration_test.rs   # use mod common;
```
::

Files in `tests/common/` (without a top-level test fn) are helpers, not test binaries.

## Doc Tests

::code-wrapper{language="rust"}
```rust
/// Adds two numbers.
///
/// # Examples
///
/// ```
/// use my_crate::add;
/// assert_eq!(add(2, 2), 4);
/// ```
pub fn add(a: i32, b: i32) -> i32 { a + b }
```
::

- Compiled and run by `cargo test`.
- Must compile as a separate binary.
- Hidden imports via `#`:

::code-wrapper{language="rust"}
```rust
/// ```
/// # use my_crate::add;
/// assert_eq!(add(2, 2), 4);
/// ```
```
::

The `#` line is hidden from rendered docs but included when testing.

### Skipping Doc Tests

`::code-wrapper{language="text"}
::code-wrapper{language="text"}
```text
/// ```no_run
/// loop { /* don't actually run */ }
/// ```
///
/// ```ignore
/// let x = todo!();
/// ```
```
::
::`

`no_run` compiles but doesn't execute. `ignore` skips compilation. `compile_fail` asserts the snippet fails to compile (negative tests). `rust,no_run` etc. customize.

## Assertions Cheat Sheet

::code-wrapper{language="rust"}
```rust
assert!(cond);
assert!(cond, "custom message {x}");
assert_eq!(a, b);
assert_eq!(a, b, "msg");
assert_ne!(a, b);
debug_assert!(cond);          // only in debug builds
debug_assert_eq!(a, b);
```
::

For `Result`-returning assertions, use the `matches` style or `.unwrap()`/`?` with `Result`-returning tests.

## `#[should_panic]`

::code-wrapper{language="rust"}
```rust
#[test]
#[should_panic]
fn panics() { panic!(); }

#[test]
#[should_panic(expected = "exact substring")]
fn panics_specifically() { panic!("exact substring here"); }
```
::

## `#[ignore]`

::code-wrapper{language="rust"}
```rust
#[test]
#[ignore = "slow, run manually"]
fn slow_test() { /* ... */ }
```
::

Skipped unless `--ignored` is passed.

## Asynchronous Tests

::code-wrapper{language="rust"}
```rust
#[tokio::test]
async fn async_test() {
    let v = async_fn().await;
    assert_eq!(v, 5);
}
```
::

Use the runtime's test attribute (`tokio::test`, `async_std::test`).

## Benchmark Tests (unstable)

::code-wrapper{language="rust"}
```rust
// requires nightly or use the `criterion` crate
#![feature(test)]
extern crate test;
use test::Bencher;

#[bench]
fn bench_add(b: &mut Bencher) {
    b.iter(|| add(test::black_box(2), test::black_box(2)));
}
```
::

`criterion` is the de facto stable benchmarking tool.

## Property-Based Testing

Use `proptest` or `quickcheck`:

::code-wrapper{language="rust"}
```rust
proptest! {
    #[test]
    fn add_commutative(a in -1000i32..1000, b in -1000i32..1000) {
        proptest::prop_assert_eq!(add(a, b), add(b, a));
    }
}
```
::

## Snapshot Testing

Use `insta`:

::code-wrapper{language="rust"}
```rust
#[test]
fn snapshot() {
    let v = render();
    insta::assert_snapshot!(v);
}
```
::

## Test Organization Tips

- Unit tests inside `#[cfg(test)] mod tests` so they don't bloat the production binary.
- Don't test private functions if you can test them through the public API.
- Test edge cases: empty, boundary, max/min, overflow, unicode, concurrency.
- Use `mockall` or hand-rolled traits for dependency injection.

## Common Pitfalls

- **`#[should_panic(expected = ...)]`** is a substring match, not regex/exact.
- **`cargo test` runs in parallel by default**: shared files / ports can race. Use `--test-threads=1` or unique tempdirs.
- **Tests in `bin/` files**: put `#[cfg(test)] mod tests` in `main.rs`/`bin/x.rs` too.
- **Doc tests slow**: many crates skip them in CI for speed (`cargo test --lib --bins --tests`).
- **`unwrap()` in tests is fine**: tests aren't production code; panicking is OK.
- **Floating point equality**: use `approx` crate or `assert!((a - b).abs() < EPS)`.
- **`cargo test` shows only failures by default**: use `--nocapture` to see `println!` output even on success.
- **Time-sensitive tests**: inject a `Clock` trait for deterministic tests.

## Coverage

::code-wrapper{language="bash"}
```bash
cargo install cargo-tarpaulin
cargo tarpaulin
```
::

Or `cargo-llvm-cov` for source-based coverage.

## Fuzzing

Use `cargo-fuzz` (libFuzzer-based) for finding panics/UB:

::code-wrapper{language="bash"}
```bash
cargo install cargo-fuzz
cargo fuzz add parse_target
# edit fuzz/fuzz_targets/parse_target.rs
cargo fuzz run parse_target
```
::

## `Test Traits`: `Debug` for `assert_eq!`

`assert_eq!` requires `T: PartialEq + Debug`. If you see "the trait Debug is not implemented," derive it.

## Testing Tricks & Patterns

::code-wrapper{language="rust"}
```rust
// Trick: use a helper function to reduce boilerplate
fn assert_contains(s: &str, substr: &str) {
    assert!(s.contains(substr), "expected '{}' to contain '{}'", s, substr);
}

// Trick: test fixtures with setup/teardown
struct TestDir {
    path: std::path::PathBuf,
}
impl TestDir {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("test_{}", std::process::id()));
        std::fs::create_dir_all(&path).unwrap();
        TestDir { path }
    }
}
impl Drop for TestDir {
    fn drop(&mut self) { std::fs::remove_dir_all(&self.path).unwrap(); }
}

// Trick: use assert_matches! for pattern matching in tests
#[test]
fn test_result() {
    use assert_matches::assert_matches;
    let res = some_fn();
    assert_matches!(res, Ok(x) if x > 0);
}

// Trick: use temp directory for each test
use std::sync::Mutex;
thread_local! {
    static TEMP_DIR_COUNT: Mutex<usize> = Mutex::new(0);
}

// Trick: skip tests conditionally
#[test]
#[cfg_attr(target_arch = "wasm32", ignore)]
fn test_not_on_wasm() { }

// Trick: use a custom assertion function
fn assert_approx_eq(a: f64, b: f64, epsilon: f64) {
    assert!((a - b).abs() < epsilon, "expected {}, got {}", a, b);
}

// Trick: prop-based testing with proptest
#[cfg(test)]
mod tests {
    use proptest::proptest;
    proptest! {
        #[test]
        fn test_commutative(a in 0i32..100, b in 0i32..100) {
            prop_assert_eq!(a + b, b + a);
        }
    }
}

// Trick: insta snapshots for complex outputs
#[test]
fn test_render() {
    let output = render_template("data");
    insta::assert_snapshot!(output);
}
```
::

## 💡 Tips & Tricks

- **Debug**: run `cargo test -- --nocapture --test-threads=1` when chasing a flaky test — serializing execution plus seeing `println!`/`dbg!` output often reveals ordering assumptions that parallel runs hide.
- **Idiom**: return `Result<(), E>` from a `#[test]` function instead of `.unwrap()`-ing everywhere — failures print the `Debug` of `E` automatically and you keep `?` ergonomics inside the test body.
- **Performance**: `cargo install cargo-nextest` and run `cargo nextest run` — it parallelizes across process boundaries (not just threads), isolates test crashes, and is often 2-3x faster on large suites than plain `cargo test`.
- **Idiom**: name test modules `mod tests` (not `mod test`) by convention, and use `use super::*;` to pull in the parent module's items without re-declaring `use` paths.
- **Debug**: `cargo test --doc` runs *only* doc tests, useful for isolating whether a CI failure is a doc example rot versus a real unit test regression.
- **Clippy**: `#[test]` functions are exempt from `dead_code` and many style lints by default, but `clippy::assertions_on_result_states` will flag `assert!(result.is_ok())` and suggest `result.unwrap()` or `assert_matches!` instead, since the former discards the error on failure.

## ⚠️ Edge Cases & Gotchas

- **`#[should_panic(expected = "...")]` is a substring match, not exact**: `#[should_panic(expected = "index")]` will pass for a completely unrelated panic message that merely happens to contain the word "index" — a typo'd panic message elsewhere in the call chain can make a test pass for the wrong reason.
- **Tests run in parallel by default, sharing process state**: two tests that both write to the same file path, bind the same port, or mutate the same `static` will race intermittently — failures that "only happen sometimes" are almost always a shared-state collision, not a logic bug.
- **`cargo test` filters by substring across *all* test names**: `cargo test add` runs every test whose name contains "add" in every file, including unrelated ones like `test_address_parsing` — use `cargo test --test integration -- add` or more specific names to avoid surprise matches.
- **Doc tests execute in a separate crate per code block**: a doc example that relies on a `use` statement from a previous doc block on the same page won't compile — each fenced block is its own isolated mini-crate unless explicitly using hidden `#` setup lines.
- **`debug_assert!` vanishes in release builds**: a test suite run with `cargo test --release` silently skips all `debug_assert!` checks inside the code under test — a bug caught only by `debug_assert!` will pass in release-mode CI and fail in production debug builds, or vice versa.
- **`#[ignore]` tests are invisible in normal runs**: `cargo test` reports "0 failed" even if an `#[ignore]`d test would fail, since it never executes without `--ignored` — a slow/expensive test can silently rot for months.
- **Platform quirk**: floating-point test assertions like `assert_eq!(0.1 + 0.2, 0.3)` fail on every platform (not a quirk of one OS) because of IEEE 754 representation — this is deterministic but still catches people who assume decimal literals are exact.

## 🧠 Spot the Bug

Why does this test pass even though the logic looks wrong?

::code-wrapper{language="rust"}
```rust
fn divide(a: i32, b: i32) -> i32 {
    a / b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[should_panic]
    fn test_divide_by_zero() {
        divide(10, 0);
        assert_eq!(1, 2);
    }
}
```
::

<details>
<summary>Answer</summary>

The test passes — and it would pass even if `divide` were fixed to never panic on zero (say, it returned `i32::MAX` instead), as long as *something* in the test panics.

`#[should_panic]` without an `expected = "..."` string only asserts that the test function panics *somewhere* before returning — it doesn't care which line panics or why. Here, `divide(10, 0)` panics first (integer division by zero always panics in Rust, debug and release alike, unlike overflow), so execution never reaches the deliberately-wrong `assert_eq!(1, 2)`. If `divide` were changed to not panic, the test would then panic on the `assert_eq!` instead — and `#[should_panic]` would still report success, masking the fact that the *real* assertion (`assert_eq!`) failed for the wrong reason entirely.

**The lesson**: bare `#[should_panic]` verifies *a* panic occurred, not *which* one — always add `expected = "substring"` to pin down the specific failure you're testing for.

</details>

## Summary

Tests live alongside code (`#[cfg(test)]`), in `tests/` for integration, and in doc comments for doc tests. Use `assert!`/`assert_eq!`/`should_panic`/`#[ignore]`. Run with `cargo test`. Use `tokio::test` for async. Use `proptest`/`insta`/`criterion`/`cargo-fuzz` for advanced testing. Use helper functions to reduce boilerplate; use fixtures for setup/teardown; use snapshot testing for complex outputs.

Next: Concurrency, threads, and the message-passing vs shared-state story.