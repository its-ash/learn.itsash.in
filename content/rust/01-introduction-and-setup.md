# 01 — Introduction & Setup

Rust's story is a compile-time proof system instead of a runtime one. This chapter is about what that trade buys, what it costs, and how the toolchain expresses it.

## Under-the-Hood Mechanics

Rust compiles through `rustc`, a front end over **LLVM** — no runtime, no GC:

::code-wrapper{language="rust"}
```rust
fn main() {
    let v = vec![1, 2, 3];
    println!("{v:?}");
    // No GC thread, no managed heap metadata.
    // `v` drops deterministically at end of scope — compiled into the binary as a `drop` call.
}
```
::

Ownership is a compile-time-only analysis — erased before codegen:

::code-wrapper{language="bash"}
```bash
# Pipeline you should carry in your head:
# source -> AST -> HIR -> type inference/trait resolution -> MIR (borrow-check here)
#        -> monomorphization -> LLVM IR -> optimization -> machine code -> link
rustc --emit=mir src/main.rs -o /tmp/main.mir   # inspect the stage where borrow-checking lives
rustc --emit=llvm-ir src/main.rs -o /tmp/main.ll # by here, all ownership info is gone
```
::

Monomorphization, not type erasure — each instantiation gets its own compiled copy:

::code-wrapper{language="rust"}
```rust
fn identity<T>(x: T) -> T { x }

fn main() {
    identity(1_i32);      // compiles identity::<i32>
    identity("hi");        // compiles a SEPARATE identity::<&str>
    // Zero runtime dispatch cost — but two distinct function bodies in the binary.
}
```
::

ABI instability — why you rebuild the whole graph every time:

::code-wrapper{language="rust"}
```rust
#[repr(Rust)]       // default: field order NOT guaranteed, may change between compiler versions
struct A { x: u8, y: u64 }

#[repr(C)]          // guaranteed: field order matches source, stable across versions/languages
struct B { x: u8, y: u64 }
```
::

## Cost, Performance, and Trade-Offs

"Zero-cost" means *no worse than hand-written at runtime* — not *free everywhere in the pipeline*:

::code-wrapper{language="bash"}
```bash
# Compile time is not zero-cost: monomorphization re-emits + re-optimizes per instantiation.
cargo build --timings          # attributes wall-clock build time per crate/codegen-unit

# Binary size is not free either: each instantiation is its own machine code.
cargo install cargo-bloat
cargo bloat --release --crates # which crates/instantiations dominate binary size
cargo bloat --release -n 20    # the 20 largest symbols
```
::

Where the cost moves, compared to the alternatives:

::code-wrapper{language="rust"}
```rust
// GC'd language (Java/Go/Python): pays at RUNTIME — pause times, mark-and-sweep overhead.
// Manual (C/C++): pays in CORRECTNESS — use-after-free, double-free, races, silent until crash.
// Rust: pays at COMPILE TIME — the borrow checker's proof step, once, before deploy.
fn main() {
    let s = String::from("owned");
    drop(s);
    // println!("{s}"); // compile error here, not a runtime crash in production
}
```
::

`rustup`'s multi-toolchain model has a real disk/CI cost:

::code-wrapper{language="bash"}
```bash
rustup toolchain list                 # each of stable/beta/nightly is multi-hundred-MB
rustup target add wasm32-unknown-unknown  # cross-compile targets are opt-in, per-toolchain, additive
# A CI matrix testing stable + beta + MSRV triples your toolchain download/cache cost.
```
::

## Production Failure Modes & Anti-Patterns

**Anti-pattern: treating `cargo build` (debug) output as a proxy for production behavior.**

::code-wrapper{language="bash"}
```bash
cargo build
./target/debug/my_service &
# "looks fine, ship it" — debug profile: opt-level=0, overflow-checks=true, no LTO.
```
::

::code-wrapper{language="rust"}
```rust
fn main() {
    let x: u8 = 250;
    let y = x + 10; // debug: panics "attempt to add with overflow"
                     // release: silently wraps to 4 — same source, different production behavior
    println!("{y}");
}
```
::

::code-wrapper{language="rust"}
```rust
fn main() {
    debug_assert!(1 + 1 == 2); // compiled OUT ENTIRELY in release — no safety net there
}
```
::

The fix is a CI/profile discipline, not a code change:

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[profile.release]
opt-level = 3
lto = "thin"          # start with "thin"; measure before "fat"
codegen-units = 1      # only after confirming the build-time cost is acceptable
strip = true
# panic = "abort" only after auditing every Drop your code relies on during unwind
```
::

**Anti-pattern: `panic = "abort"` chosen for binary size without auditing `Drop` reliance.**

::code-wrapper{language="rust"}
```rust
use std::sync::Mutex;

static LOCK: Mutex<i32> = Mutex::new(0);

fn risky() {
    let _guard = LOCK.lock().unwrap();
    panic!("boom");
    // panic = "unwind" (default): guard's Drop runs, lock releases, other threads survive.
    // panic = "abort":            process terminates immediately, guard's Drop NEVER runs,
    //                             every other thread waiting on LOCK hangs forever pre-exit.
}
```
::

## Architectural Application

Pin the toolchain — reproducibility is an architectural property, not a dev nicety:

::code-wrapper{language="toml" filename="rust-toolchain.toml"}
```toml
[toolchain]
channel = "1.82.0"
components = ["rustfmt", "clippy", "rust-src"]
targets = ["wasm32-unknown-unknown"]
```
::

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[package]
rust-version = "1.75"   # MSRV — raising it is a semver-relevant decision for a published lib
```
::

`panic = "unwind"` vs `"abort"` is a failure-isolation decision, not a size micro-optimization:

::code-wrapper{language="rust"}
```rust
// tokio model: one bad request panics its task, the server survives — REQUIRES unwind.
tokio::spawn(async {
    panic!("this task dies, others keep running");
});

// embedded/CLI model: any panic should kill the whole process, no ambiguity — abort is fine.
```
::

Editions change parsing/desugaring only — never ABI or runtime — so mixed-edition workspaces link fine:

::code-wrapper{language="toml" filename="crate-a/Cargo.toml"}
```toml
[package]
edition = "2015"   # an old vendored crate you haven't migrated
```
::

::code-wrapper{language="toml" filename="crate-b/Cargo.toml"}
```toml
[package]
edition = "2024"   # your new code — links and runs together with crate-a, no issue
```
::

## 💡 Tips & Tricks

- **Debug**: `cargo build --timings` — HTML report of wall-clock build time per crate/codegen-unit.
- **Performance**: `cargo bloat --release --crates` / `-n 20` — find binary-size offenders before assuming "Rust binaries are just big."
- **Idiom**: commit `rust-toolchain.toml` — `rustup` auto-installs/switches the pinned toolchain on any `cargo` invocation.
- **Portability**: `rustup target list --installed` vs `rustup target add <triple>` — a missing cross-compile target fails CI with a linker error, not a code bug.
- **Debug**: `rustc --print target-list` / `rustc --print cfg` — see exactly which `cfg` flags are active for your current target.
- **Idiom**: treat an MSRV bump as a semver-relevant breaking change; consider `cargo-msrv` in CI.

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="rust"}
```rust
fn might_panic() {
    let result = std::panic::catch_unwind(|| {
        panic!("caught");
    });
    // With panic = "abort" anywhere in this binary's profile, catch_unwind's
    // safety net is silently gone — no compile-time warning tells you this.
    println!("{}", result.is_err());
}
```
::

::code-wrapper{language="bash"}
```bash
# Incremental compilation cache can produce impossible-looking errors after a toolchain bump.
cargo clean   # first move before an hour of debugging a phantom error
```
::

::code-wrapper{language="rust"}
```rust
fn main() {
    // usize/isize width is platform-dependent: 64-bit on servers, 32-bit on wasm32.
    let packed: usize = (1u64 << 40) as usize; // silently truncates/misbehaves on wasm32
    println!("{packed}");
}
```
::

- **Idiom**: editions create **no** ABI/runtime differences between crates — a 2015-edition crate and a 2024-edition crate link and run together with zero issue.
- **Performance**: `lto = "fat"` with a large dependency graph can push release builds from minutes to tens of minutes — often discovered first in CI, not locally.
- **Portability**: always regenerate and commit `Cargo.lock` after any manifest change — don't rely on `cargo build` to "just handle it" identically everywhere.

## 🧠 Spot the Bug

::code-wrapper{language="yaml" filename=".github/workflows/ci.yml"}
```yaml
- run: cargo test
- run: cargo build --release
- run: scp target/release/my_service prod:/opt/app/
```
::

A team ships this. `cargo test` passes. Three weeks later, a customer reports corrupted numeric totals under high load. Nothing in the code changed. What's the gap?

<details>
<summary>Answer</summary>

::code-wrapper{language="rust"}
```rust
// This is what "cargo test" actually exercised (dev/test profile: overflow-checks = true):
fn accumulate(total: u32, delta: u32) -> u32 {
    total + delta   // would PANIC loudly in test profile if a test ever hit the overflow
}

// This is what shipped (release profile: overflow-checks = false) — NEVER executed by tests:
// same source, silent wraparound instead of a panic.
```
::

`cargo test` verifies debug-profile behavior only; `cargo build --release` compiles a *separate* artifact with different arithmetic semantics that the test suite never ran.

**The lesson**: any correctness property sensitive to build profile (overflow, `debug_assert!`) needs an explicit release-mode test, or explicit `checked_*`/`wrapping_*` arithmetic that makes behavior profile-independent.

</details>

## Summary

Rust moves safety verification from runtime to compile time via a borrow-checked, monomorphizing, GC-less compiler — predictable performance and no data races, at the cost of compile time, binary-size sensitivity to generics, and a toolchain/profile model (`rustup`, editions, MSRV, build profiles) you actively manage rather than ignore.

Next: Hello World & Cargo — the build pipeline mechanics that turn source into the two very different artifacts (`debug`/`release`) this chapter just told you not to confuse.
