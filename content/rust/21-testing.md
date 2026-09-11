# 21 — Testing at Scale: Mechanics, Cost, and Architecture

Everyone knows `#[test]` and `assert_eq!` by the time they're writing production Rust. What separates a mid-level test suite from a senior one is understanding what `cargo test` actually **builds and runs** (three separate compilation strategies, not one), what each layer of testing **costs** in compile time and CI minutes at scale, and how test architecture decisions (mocking strategy, fixture design, parallelism assumptions) either scale to a 500-test suite or collapse into a flaky, hour-long CI job.

## Under-the-Hood Mechanics

### `cargo test` compiles multiple, separate binaries

A single `cargo test` invocation produces **more compiled artifacts than most engineers realize**:

::code-wrapper{language="rust" filename="src/lib.rs"}
```rust
pub fn add(a: i32, b: i32) -> i32 { a + b }   // 1. compiled once, normally, into the library

#[cfg(test)]
mod tests {                                    // 2. recompiled AGAIN with cfg(test) active,
    use super::*;                              //    into a separate test binary via --test
    #[test] fn adds() { assert_eq!(add(2, 2), 4); }
}
```
::

::code-wrapper{language="rust" filename="tests/integration.rs"}
```rust
// 3. its own independent crate, linked separately, sees ONLY my_crate's pub API
#[test]
fn public_api_works() { assert_eq!(my_crate::add(2, 2), 4); }
```
::

::code-wrapper{language="rust"}
```rust
/// 4. each fenced block below is extracted, wrapped in its own fn main(),
/// and compiled as an ENTIRELY STANDALONE crate against the public API:
/// ```
/// assert_eq!(my_crate::add(2, 2), 4);
/// ```
pub fn add(a: i32, b: i32) -> i32 { a + b }
```
::

::code-wrapper{language="bash"}
```bash
# Watch this happen directly:
cargo test -v 2>&1 | grep "Running"
# target/debug/deps/my_crate-<hash>          <- unit tests, cfg(test) build
# target/debug/deps/integration_test-<hash>  <- one per tests/*.rs file
# Doc-tests my_crate                          <- one compile+run per doc example
```
::

This is why `cargo test` on a crate with heavy integration/doc coverage can take far longer than a release build — you're compiling and linking N+2 separate programs.

### `#[cfg(test)]` is a compile-time cfg-gate — it doesn't exist in your shipped binary

::code-wrapper{language="rust"}
```rust
// `if cfg!(test)` is a RUNTIME branch (const-foldable, but still generated):
pub fn describe() -> &'static str {
    if cfg!(test) { "test mode" } else { "prod mode" }
}
```
::

::code-wrapper{language="rust"}
```rust
pub fn add(a: i32, b: i32) -> i32 { a + b }

#[cfg(test)]  // <-- this entire block does not exist in `cargo build --release` output
mod tests {
    use super::*;
    #[test]
    fn adds() { assert_eq!(add(2, 2), 4); }
}
```
::

Verify it yourself: `cargo bloat --release` on a crate with and without test modules shows identical binary size.

### Doc tests are compiled as standalone crates against your public API only

A doctest cannot see private or `pub(crate)` items — only what's reachable via `use my_crate::...`. This is deliberate: doc tests double as **API usability tests**.

::code-wrapper{language="rust"}
```rust
/// ```
/// # use my_crate::internal_setup; // hidden from rendered docs, but still must be `pub`
/// let x = internal_setup();
/// ```
pub fn add(a: i32, b: i32) -> i32 { a + b }
```
::

### Test parallelism is OS threads within one process, not process isolation

::code-wrapper{language="rust"}
```rust
// Two tests racing on genuinely shared process state — a real OS-level race,
// not a simulated one, because both run as THREADS in ONE process:
static PORT: std::sync::atomic::AtomicU16 = std::sync::atomic::AtomicU16::new(9000);

#[test]
fn test_a() { assert_eq!(PORT.load(std::sync::atomic::Ordering::SeqCst), 9000); }
#[test]
fn test_b() { PORT.store(9001, std::sync::atomic::Ordering::SeqCst); } // mutates shared state
```
::

A test that segfaults or aborts the process (stack overflow, UB via FFI) takes down every other test in that binary. `cargo nextest` runs each test in its **own process** instead — real isolation, not just faster scheduling.

## Cost, Performance, and Trade-Offs

| Test layer | Compile cost | Run cost | Isolation | What it actually validates |
|---|---|---|---|---|
| Unit tests (`#[cfg(test)] mod tests`) | Recompiles the crate once more with `cfg(test)` | Fast — in-process, threaded | Shared process/threads | Internal logic, private functions |
| Integration tests (`tests/*.rs`) | One full crate compile **per file** in `tests/`, each linking your lib fresh | Slower — N separate binaries to link and run | Separate binary per file | Public API contracts only |
| Doc tests | One compile **per fenced code block** | Slowest per-test overhead (compile dominates) | Fully separate crate per block | Public API + documentation accuracy |
| `cargo nextest` | Same compile cost as `cargo test` | Faster wall-clock on multi-core (process-level parallelism) + isolates crashes | Full process isolation | Same tests, safer execution model |
| Property tests (`proptest`) | Normal + macro expansion cost | Much higher run cost (hundreds of generated cases per property) | Same as unit tests | Universal properties, edge cases you didn't think to write |
| Fuzzing (`cargo-fuzz`) | Separate nightly-only build with sanitizer instrumentation | Runs for minutes-to-hours, not part of normal CI gating | Isolated fuzz binary | Panics/UB under adversarial input |
| Snapshot tests (`insta`) | Normal | Fast (string diff), but snapshot files bloat the repo over time | Same as unit tests | Regression in large structured output |

::code-wrapper{language="text" filename="tests/ layout comparison"}
```
40 files, 1 #[test] each   -> 40 separate crate compiles + 40 relinks of the library
4 files, 10 #[test] each   -> 4 separate crate compiles + 4 relinks (same coverage, far less compile cost)
```
::

::code-wrapper{language="bash"}
```bash
# Common CI split: fast job skips doc tests (compile-time tax), slow job runs them separately
cargo test --lib --bins --tests   # fast: skips --doc
cargo test --doc                   # slow, separate/less-frequent job
```
::

## Production Failure Modes & Anti-Patterns

### Anti-pattern: shared mutable global state across "parallel" tests

::code-wrapper{language="rust"}
```rust
// BAD: a mid-level dev assumes each test gets its own environment
use std::sync::atomic::{AtomicU32, Ordering};
static PORT_COUNTER: AtomicU32 = AtomicU32::new(8000);

fn bind_test_server() -> u16 {
    // "surely this is fine, tests run independently... right?"
    8000  // hardcoded port
}

#[test]
fn test_server_a() {
    let addr = format!("127.0.0.1:{}", bind_test_server());
    std::net::TcpListener::bind(&addr).unwrap();  // works... sometimes
}

#[test]
fn test_server_b() {
    let addr = format!("127.0.0.1:{}", bind_test_server());
    std::net::TcpListener::bind(&addr).unwrap();  // FAILS intermittently: "address in use"
}
```
::

Passes in isolation, passes in CI most of the time, then produces the classic "flaky, fails sometimes" ticket — two tests racing to bind the same hardcoded port is a genuine OS-level resource race, not a Rust bug.

**The fix**: allocate a unique resource per test, don't hardcode shared external state.

::code-wrapper{language="rust"}
```rust
// GOOD: bind to port 0, let the OS assign a free port, then read it back
fn bind_test_server() -> (std::net::TcpListener, u16) {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    (listener, port)
}

#[test]
fn test_server_a() {
    let (_listener, _port) = bind_test_server();  // OS guarantees no collision
}
```
::

### Anti-pattern: `#[should_panic]` without `expected`, masking real assertion failures

::code-wrapper{language="rust"}
```rust
fn divide(a: i32, b: i32) -> i32 { a / b }

#[test]
#[should_panic]  // BAD: no `expected` — verifies *a* panic, not *the* panic
fn test_divide_by_zero() {
    let result = divide(10, 0);
    assert_eq!(result, 999);  // this line is dead code and nobody notices
}
```
::

`divide(10, 0)` panics before `assert_eq!` runs, so the test passes — and would *still* pass if a refactor made `divide` return garbage instead of panicking, since `assert_eq!(result, 999)` would panic too and `#[should_panic]` doesn't care which line panicked.

**The fix**: always pin the expected panic message.

::code-wrapper{language="rust"}
```rust
#[test]
#[should_panic(expected = "attempt to divide by zero")]
fn test_divide_by_zero() {
    divide(10, 0);
}
```
::

### Anti-pattern: mocking via `#[cfg(test)]` conditional compilation instead of trait injection

::code-wrapper{language="rust"}
```rust
// BAD: production code branches on cfg(test) to fake behavior
pub struct PaymentProcessor;

impl PaymentProcessor {
    pub fn charge(&self, amount_cents: u64) -> Result<(), String> {
        #[cfg(test)]
        { return Ok(()); }  // "mocked" by just skipping the real logic

        #[cfg(not(test))]
        {
            // real HTTP call to payment gateway
            real_gateway_call(amount_cents)
        }
    }
}
```
::

This compiles and "works" — but the code path that runs in tests is **never** the code path that runs in production. Zero real coverage of `charge`, and the pattern is invisible in review unless someone checks for `cfg(test)` inside business logic.

**The fix**: inject the dependency as a trait, and substitute a real fake/mock type in tests — the same code path runs in both cases, only the concrete type differs.

::code-wrapper{language="rust"}
```rust
pub trait PaymentGateway {
    fn charge(&self, amount_cents: u64) -> Result<(), String>;
}

pub struct PaymentProcessor<G: PaymentGateway> {
    gateway: G,
}

impl<G: PaymentGateway> PaymentProcessor<G> {
    pub fn charge(&self, amount_cents: u64) -> Result<(), String> {
        // identical code path in tests and production — only `G` differs
        self.gateway.charge(amount_cents)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeGateway { should_fail: bool }
    impl PaymentGateway for FakeGateway {
        fn charge(&self, _amount_cents: u64) -> Result<(), String> {
            if self.should_fail { Err("declined".into()) } else { Ok(()) }
        }
    }

    #[test]
    fn charges_successfully() {
        let processor = PaymentProcessor { gateway: FakeGateway { should_fail: false } };
        assert!(processor.charge(500).is_ok());
    }
}
```
::

## Architectural Application

::code-wrapper{language="rust"}
```rust
// Hard-to-test function is a design smell: hidden dependency on the real clock
struct Session { started: std::time::SystemTime }
impl Session {
    fn is_expired(&self) -> bool {
        self.started.elapsed().unwrap().as_secs() > 3600   // untestable without waiting an hour
    }
}
```
::

::code-wrapper{language="rust"}
```rust
// Fix: inject time as a trait boundary — fast, deterministic unit tests become possible
trait Clock { fn now(&self) -> std::time::SystemTime; }
struct SystemClock;
impl Clock for SystemClock { fn now(&self) -> std::time::SystemTime { std::time::SystemTime::now() } }

struct Session<C: Clock> { started: std::time::SystemTime, clock: C }
impl<C: Clock> Session<C> {
    fn is_expired(&self) -> bool {
        self.clock.now().duration_since(self.started).unwrap().as_secs() > 3600
    }
}
```
::

::code-wrapper{language="rust"}
```rust
// Property test at a trust boundary: round-trip on untrusted-input parsing
#[cfg(test)]
mod tests {
    use proptest::prelude::*;
    proptest! {
        #[test]
        fn roundtrip(s in ".*") {
            let encoded = urlencoding::encode(&s);
            prop_assert_eq!(urlencoding::decode(&encoded).unwrap(), s);
        }
    }
}
```
::

::code-wrapper{language="yaml" filename=".github/workflows/ci.yml"}
```yaml
# CI split: fast tests gate every PR, full suite runs on merge-to-main
on: [pull_request]
jobs:
  fast: { run: cargo test --lib --bins --tests }
  full: { if: github.ref == 'refs/heads/main', run: cargo test --all-targets }
```
::

## 💡 Tips & Tricks

- **Debug**: run `cargo test -- --nocapture --test-threads=1` when chasing a flaky test — serializing execution plus seeing `println!`/`dbg!` output often reveals a shared-resource race that parallel execution was masking.
- **Idiom**: return `Result<(), E>` from a `#[test]` function instead of `.unwrap()`-ing everywhere — failures print the `Debug` of `E` automatically and you keep `?` ergonomics inside the test body.
- **Performance**: install `cargo-nextest` and run `cargo nextest run` for large suites — it parallelizes across **process** boundaries (not just threads), isolating crashes and often running 2-3x faster wall-clock on multi-core CI runners than plain `cargo test`.
- **Idiom**: inject a `Clock` trait (with a real `SystemClock` and a `FakeClock` for tests) anywhere production code calls `SystemTime::now()`/`Instant::now()` — time-dependent tests are otherwise either flaky (real clock) or untestable (no way to simulate "one hour later").
- **Debug**: `cargo test --doc` runs *only* doc tests, useful for isolating whether a CI failure is documentation rot versus a real unit/integration regression.
- **Performance**: consolidate many small `tests/*.rs` files into fewer files with more `#[test]` fns inside — each file in `tests/` is a separate crate compile + link, so 40 one-test files pay a much higher aggregate compile cost than 4 files with 10 tests each.
- **Clippy**: `clippy::assertions_on_result_states` flags `assert!(result.is_ok())` and suggests `result.unwrap()` or `assert_matches!` instead, since the former discards the actual error content on failure.

## ⚠️ Edge Cases & Gotchas

- **`#[should_panic(expected = "...")]` is a substring match, not exact**: a typo'd panic message elsewhere in the call chain that happens to contain the expected substring makes the test pass for the wrong reason entirely.
- **Tests run in parallel by default, sharing process state**: two tests writing to the same file path, binding the same hardcoded port, or mutating the same `static` will race intermittently — "fails sometimes" is almost always a shared-state collision, not a logic bug.
- **`cargo test` filters by substring across *all* test names**: `cargo test add` runs every test whose name contains "add" in every file, including unrelated ones like `test_address_parsing` — use `--test <binary>` scoping for precision.
- **Doc tests execute in a separate crate per code block**: a doc example relying on a `use` from a previous doc block on the same page won't compile — each fenced block is its own isolated mini-crate unless explicitly using hidden `#` setup lines.
- **`debug_assert!` vanishes in release builds**: a test suite run with `cargo test --release` silently skips all `debug_assert!` checks inside the code under test — a bug caught only by `debug_assert!` passes in release-mode CI and fails in a production debug build, or vice versa.
- **`#[ignore]` tests are invisible in normal runs**: `cargo test` reports "0 failed" even if an ignored test would fail, since it never executes without `--ignored` — a slow/expensive test can silently rot for months with nobody noticing it's broken.
- **A segfault or process abort in one test kills the whole binary's results**: because `cargo test` (without `nextest`) runs tests as threads in one process, a test that triggers UB severe enough to abort the process (stack overflow, FFI crash) takes every other test in that binary down with it, often reported as a confusing "test binary crashed" with no per-test attribution.

## 🧠 Spot the Bug

This CI job passes on every PR. Three weeks later, production ships a payment bug that this exact function was "covered" for. What went wrong?

::code-wrapper{language="rust"}
```rust
pub struct Order { pub total_cents: u64, pub discount_cents: u64 }

pub fn final_price(order: &Order) -> u64 {
    order.total_cents - order.discount_cents  // BUG: underflows if discount > total
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn applies_discount() {
        let order = Order { total_cents: 1000, discount_cents: 200 };
        assert_eq!(final_price(&order), 800);
    }
}
```
::

<details>
<summary>Answer</summary>

The suite only exercises the happy path — discount smaller than total — never the boundary where `discount_cents > total_cents`. In `--release`, `u64` subtraction silently **wraps around** on underflow (overflow checks are disabled by default), producing a near-`u64::MAX` price instead of panicking.

In debug builds the same underflow **does** panic (`attempt to subtract with overflow`) — exactly why this survives local `cargo test` (usually debug) and local review, then manifests only in production (release).

The fix has two parts: use checked/saturating arithmetic to define the actual intended behavior, and add the boundary-case test that was missing.

::code-wrapper{language="rust"}
```rust
pub fn final_price(order: &Order) -> u64 {
    order.total_cents.saturating_sub(order.discount_cents)  // floors at 0, never wraps
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn applies_discount() {
        let order = Order { total_cents: 1000, discount_cents: 200 };
        assert_eq!(final_price(&order), 800);
    }

    #[test]
    fn discount_larger_than_total_floors_at_zero() {
        let order = Order { total_cents: 100, discount_cents: 500 };
        assert_eq!(final_price(&order), 0);
    }
}
```
::

**The lesson**: a green test suite only proves the cases you wrote are correct — integer overflow/underflow bugs specifically hide behind the debug/release checked-arithmetic difference, so boundary-case tests (and `proptest` properties like "result is never greater than total") are what actually catch them, not more happy-path assertions.

</details>

## Summary

`cargo test` compiles and links several genuinely separate binaries — unit tests (recompiled with `cfg(test)`), one crate per integration test file, and one standalone crate per doc-test block — and understanding this explains both the compile-time cost of large suites and why doc/integration tests can only see your `pub` API. Test parallelism is real OS-thread concurrency sharing one process by default, which is the root cause of most "flaky" test failures; `cargo nextest` trades process-spawn overhead for genuine isolation. Architect for testability by injecting I/O and time as traits rather than branching on `cfg(test)` inside business logic, and reserve property-based/fuzz testing for any code parsing untrusted input, since hand-written examples systematically miss the adversarial edge cases that matter most in production.

Next: Concurrency & Multithreading — `Send`/`Sync` as compile-time data-race prevention, and what threads actually cost.
