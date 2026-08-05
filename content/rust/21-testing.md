# 21 — Testing in Rust

Rust's testing is built into the language and `cargo`. There are three layers: unit tests, integration tests, and documentation tests.

## Test Categories

1. **Unit tests**: live inside the source, in `#[cfg(test)] mod tests`. Test private items.
2. **Integration tests**: live in `tests/` as separate crates. Test public API.
3. **Doc tests**: code in `///` doc comments, run as examples.

## Writing a Unit Test

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

- `#[test]` marks a test function.
- `assert!`, `assert_eq!`, `assert_ne!`.
- `#[should_panic(expected = "...")]` for panic tests.
- Returning `Result<(), E: Debug>` is allowed — `Err` fails the test.

## Running Tests

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

## Integration Tests

```
tests/
└── integration_test.rs
```

```rust
use my_crate::add;

#[test]
fn integration_add() {
    assert_eq!(add(2, 3), 5);
}
```

- Separate crate; can only use `pub` API.
- Multiple files in `tests/` become separate test binaries.

### Common Setup Module

```
tests/
├── common/
│   └── mod.rs          # NOT a test file
└── integration_test.rs   # use mod common;
```

Files in `tests/common/` (without a top-level test fn) are helpers, not test binaries.

## Doc Tests

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

- Compiled and run by `cargo test`.
- Must compile as a separate binary.
- Hidden imports via `#`:

```rust
/// ```
/// # use my_crate::add;
/// assert_eq!(add(2, 2), 4);
/// ```
```

The `#` line is hidden from rendered docs but included when testing.

### Skipping Doc Tests

````text
/// ```no_run
/// loop { /* don't actually run */ }
/// ```
///
/// ```ignore
/// let x = todo!();
/// ```
````

`no_run` compiles but doesn't execute. `ignore` skips compilation. `compile_fail` asserts the snippet fails to compile (negative tests). `rust,no_run` etc. customize.

## Assertions Cheat Sheet

```rust
assert!(cond);
assert!(cond, "custom message {x}");
assert_eq!(a, b);
assert_eq!(a, b, "msg");
assert_ne!(a, b);
debug_assert!(cond);          // only in debug builds
debug_assert_eq!(a, b);
```

For `Result`-returning assertions, use the `matches` style or `.unwrap()`/`?` with `Result`-returning tests.

## `#[should_panic]`

```rust
#[test]
#[should_panic]
fn panics() { panic!(); }

#[test]
#[should_panic(expected = "exact substring")]
fn panics_specifically() { panic!("exact substring here"); }
```

## `#[ignore]`

```rust
#[test]
#[ignore = "slow, run manually"]
fn slow_test() { /* ... */ }
```

Skipped unless `--ignored` is passed.

## Asynchronous Tests

```rust
#[tokio::test]
async fn async_test() {
    let v = async_fn().await;
    assert_eq!(v, 5);
}
```

Use the runtime's test attribute (`tokio::test`, `async_std::test`).

## Benchmark Tests (unstable)

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

`criterion` is the de facto stable benchmarking tool.

## Property-Based Testing

Use `proptest` or `quickcheck`:

```rust
proptest! {
    #[test]
    fn add_commutative(a in -1000i32..1000, b in -1000i32..1000) {
        proptest::prop_assert_eq!(add(a, b), add(b, a));
    }
}
```

## Snapshot Testing

Use `insta`:

```rust
#[test]
fn snapshot() {
    let v = render();
    insta::assert_snapshot!(v);
}
```

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

```bash
cargo install cargo-tarpaulin
cargo tarpaulin
```

Or `cargo-llvm-cov` for source-based coverage.

## Fuzzing

Use `cargo-fuzz` (libFuzzer-based) for finding panics/UB:

```bash
cargo install cargo-fuzz
cargo fuzz add parse_target
# edit fuzz/fuzz_targets/parse_target.rs
cargo fuzz run parse_target
```

## `Test Traits`: `Debug` for `assert_eq!`

`assert_eq!` requires `T: PartialEq + Debug`. If you see "the trait Debug is not implemented," derive it.

## Summary

Tests live alongside code (`#[cfg(test)]`), in `tests/` for integration, and in doc comments for doc tests. Use `assert!`/`assert_eq!`/`should_panic`/`#[ignore]`. Run with `cargo test`. Use `tokio::test` for async. Use `proptest`/`insta`/`criterion`/`cargo-fuzz` for advanced testing.

Next: Concurrency, threads, and the message-passing vs shared-state story.