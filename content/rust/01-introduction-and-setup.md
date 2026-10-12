# 01 — Introduction & Setup

Rust checks memory safety **at compile time**. There is no garbage collector, and most bugs that crash C programs (use-after-free, data races) become compile errors instead.

## Install the Toolchain

::code-wrapper{language="bash"}
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

rustc --version     # the compiler
cargo --version     # build tool + package manager
rustup update       # update to the newest stable
```
::

`rustup` manages toolchains (`stable`, `beta`, `nightly`) and cross-compile targets. `cargo` builds, tests and runs your code.

## Your First Program

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn main() {
    let v = vec![1, 2, 3];
    println!("{v:?}");   // [1, 2, 3]
}   // `v` is freed HERE — at the closing brace, not "later" by a GC
```
::

::code-wrapper{language="bash"}
```bash
rustc main.rs && ./main      # produces ./main (or main.exe)
```
::

**Tricky**: the compiler stops many bugs before the program exists:

::code-wrapper{language="rust"}
```rust
fn main() {
    let s = String::from("hi");
    drop(s);              // free it now
    println!("{s}");      // error[E0382]: borrow of moved value: `s`
}
```
::

In C this would compile and read freed memory. In Rust it does not compile.

## Debug vs Release — Same Code, Different Behavior

::code-wrapper{language="bash"}
```bash
cargo build              # debug: fast compile, slow code, extra checks
cargo build --release    # release: slow compile, fast code, fewer checks
```
::

**Tricky**: integer overflow behaves differently in the two builds.

::code-wrapper{language="rust"}
```rust
fn main() {
    let x: u8 = 250;
    let y = x + 10;       // known at compile time → compile ERROR
    println!("{y}");
}
// error: this arithmetic operation will overflow
//        attempt to compute `250_u8 + 10_u8`, which would overflow
```
::

If the value is only known at run time, the compiler cannot see it:

::code-wrapper{language="rust"}
```rust
fn main() {
    // args().count() is 1 when run with no arguments → x = 250 at run time
    let x: u8 = std::env::args().count() as u8 + 249;
    let y = x + 10;
    println!("{y}");
}
// cargo run            → panic: attempt to add with overflow
// cargo run --release  → prints 4   (260 wraps around to 260 - 256)
```
::

If you want one behavior everywhere, say so explicitly:

::code-wrapper{language="rust"}
```rust
fn main() {
    let x: u8 = 250;
    println!("{}", x.wrapping_add(10));     // 4        — always wraps
    println!("{:?}", x.checked_add(10));    // None     — always detects
    println!("{}", x.saturating_add(10));   // 255      — always clamps
}
```
::

`debug_assert!` is also removed in release builds:

::code-wrapper{language="rust"}
```rust
fn main() {
    let len = 0;
    debug_assert!(len > 0, "len must be positive");   // panics in debug only
    assert!(len > 0, "len must be positive");         // panics in BOTH
}
```
::

## Pin the Toolchain

::code-wrapper{language="toml" filename="rust-toolchain.toml"}
```toml
[toolchain]
channel = "1.82.0"
components = ["rustfmt", "clippy"]
```
::

With this file in the project, every `cargo` command uses exactly that version — on every machine and in CI.

## Editions

An **edition** (`2015`, `2018`, `2021`, `2024`) is set per crate in `Cargo.toml`. It changes some syntax rules, not the runtime. A 2015 crate and a 2024 crate link together fine.

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[package]
name = "hello"
version = "0.1.0"
edition = "2024"
```
::

## 💡 Tips & Tricks

- **Tooling** — `rustup doc --std` opens the standard library docs offline.
- **Tooling** — `cargo clippy` is a linter that catches hundreds of common mistakes. Run it often.
- **Tooling** — `cargo fmt` formats code the standard way. No style debates.
- **Debug** — `cargo build --timings` shows which crates are slow to compile.
- **Idiom** — commit `rust-toolchain.toml` and `Cargo.lock` for apps so everyone builds the same thing.

## ⚠️ Edge Cases & Gotchas

- **Overflow** — debug builds panic on overflow; release builds wrap silently. Use `checked_*`, `wrapping_*` or `saturating_*` when it matters.
- **Overflow** — if both values are constants, overflow is a **compile error**, not a panic.
- **Assertions** — `debug_assert!` does nothing in release builds.
- **Portability** — `usize` is 64-bit on most PCs but 32-bit on `wasm32`. `usize::MAX` differs per target.
- **Cache** — after a toolchain upgrade, strange build errors are often fixed by `cargo clean`.

## 🧠 Spot the Bug

CI runs `cargo test`, then ships `cargo build --release`. Tests pass, but production shows wrong totals. Why?

::code-wrapper{language="rust"}
```rust
fn add_points(total: u32, delta: u32) -> u32 {
    total + delta
}
```
::

<details>
<summary>Answer</summary>

`cargo test` uses the **debug** profile, where overflow panics. The shipped binary uses **release**, where `total + delta` silently wraps to a small number. The tests never ran the code the way production runs it.

Fix: make the behavior explicit so it is the same in every profile:

::code-wrapper{language="rust"}
```rust
fn add_points(total: u32, delta: u32) -> Option<u32> {
    total.checked_add(delta)
}
```
::

Or test the release profile too: `cargo test --release`.

</details>

## Summary

Rust moves safety checks to compile time. Learn the difference between debug and release builds early — overflow and `debug_assert!` behave differently in each.

Next: Hello World & Cargo.
