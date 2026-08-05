# 02 — Hello World & Cargo Deep Dive

## The Minimal Program

::code-wrapper{language="rust"}
```rust
// src/main.rs
fn main() {
    println!("Hello, world!");
}
```
::
Compile and run directly with `rustc`:

::code-wrapper{language="bash"}
```bash
rustc src/main.rs && ./main      # produces ./main (or main.exe)
```
::

`rustc` is the compiler. In practice you use `cargo` instead, but understanding `rustc` helps you read compiler errors.

## `println!` is a Macro, Not a Function

`println!` ends with `!` because it's a **macro**. It can't be a function because it validates format strings at compile time and takes a variadic number of arguments.

::code-wrapper{language="rust"}
```rust
let name = "Ada";
let age = 36;
println!("{name} is {age}");            // implicit named args (edition 2021+)
println!("{0} is {1}", name, age);      // positional
println!("{name} is {age}", name=name, age=age); // explicit named
println!("{name:>10}");                  // right-align width 10
println!("{name:^10}");                  // center
println!("{age:0>5}");                   // zero-padded: 00036
println!("{age:#x}", 255u32);            // hex with 0x prefix -> 0xff
println!("{:b}", 10u8);                  // binary -> 1010
println!("{:e}", 12345.678f64);          // scientific
println!("{:#?}", some_struct);          // pretty-print debug
println!("{:>10.2}", 3.14159);           // width 10, 2 decimals
```
::

### Format Trait Hierarchy

`{}` uses the `Display` trait; `{:?}` uses `Debug`; `{:#?}` is pretty `Debug`; `{o}`, `{x}`, `{X}`, `{b}`, `{e}`, `{E}` select integer/float formatting. You implement `Display` manually for user-facing output; `Debug` can be derived.

## Anatomy of `main`

::code-wrapper{language="rust"}
```rust
fn main() {
    // program entry point
}
```
::

- `main` never takes arguments and never returns a value (returns unit `()`).
- To exit with a code, use `std::process::exit(code)` (skips destructors!) or return from `main`:

::code-wrapper{language="rust"}
```rust
fn main() -> std::process::ExitCode {
    std::process::ExitCode::SUCCESS
}
```
::

(Stable `ExitCode` and `Termination` trait are available since 1.61.)

## Cargo: `new` vs `init`

::code-wrapper{language="bash"}
```bash
cargo new my_app          # creates new directory with a binary project
cargo new my_lib --lib    # library project (lib.rs, no main)
cargo init                # scaffolds in the current directory (existing git repo preserved)
cargo init --name custom_name
```
::

## `Cargo.toml` Anatomy

::code-wrapper{language="toml"}
```toml
[package]
name = "my_app"
version = "0.1.0"
edition = "2021"
authors = ["You <you@example.com>"]
license = "MIT OR Apache-2.0"
description = "..."
rust-version = "1.75"          # MSRV
publish = false                 # don't accidentally publish to crates.io

[dependencies]
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1", features = ["full"] }
rand = "0.8"

[dev-dependencies]
pretty_assertions = "1"        # only for tests/benches

[build-dependencies]
anyhow = "1"                   # for build.rs

[[bin]]
name = "my_app"
path = "src/main.rs"

[features]
default = ["json"]
json = ["serde"]
```
::

### Version Requirement Syntax

- `"1.0"` → `^1.0` → compatible up to `<2.0.0` (caret, default)
- `"=1.0.0"` → exact
- `"~1.0.0"` → `>=1.0.0, <1.1.0`
- `">=1.0, <2.0"` → explicit range
- `"*"` → any (avoid)

## Dependency Sources

::code-wrapper{language="toml"}
```toml
[dependencies]
# crates.io
serde = "1.0"

# git
my_crate = { git = "https://github.com/user/crate", branch = "dev" }
my_crate2 = { git = "...", tag = "v1.2.3" }
my_crate3 = { git = "...", rev = "abc123" }

# path (local)
my_local = { path = "../my_local" }

# optional dependency behind a feature
extra = { version = "1.0", optional = true }
```
::

## Features

Features enable **conditional compilation**. Avoid exposing features of dependencies (this causes "feature unification" surprises). Use direct deps + optional features instead.

::code-wrapper{language="rust"}
```rust
#[cfg(feature = "json")]
mod json;
```
::

## `Cargo.lock`

- Pin exact versions resolved for your dependency graph.
- Always commit for **binaries**. For **libraries** the official recommendation is also to commit it, but it's commonly gitignored.
- `cargo update` bumps within semver-compatible range; `cargo update -p serde --precise 1.0.150` pins a single crate.

## Workspaces

When multiple crates share a workspace, dependency versions unify and `target/` is shared:

::code-wrapper{language="toml"}
```toml
# Cargo.toml (workspace root)
[workspace]
members = ["crates/*", "app"]

[workspace.dependencies]
serde = "1.0"
```
::

Members then reference with `serde.workspace = true`.

## Edge Cases

- **Binaries from `src/bin/*.rs`**: each `.rs` file in `src/bin/` becomes a separate binary target automatically. Run with `cargo run --bin extra`.
- **`cargo run` passes args after `--`**: `cargo run -- --flag` runs your binary with `--flag`.
- **Multiple `[[bin]]` targets** can share a `src/lib.rs` for logic and have thin `src/bin/*` shells.
- **`rustc` error codes**: `E0382` etc. Search `rustc --explain E0382` or online for detailed explanations.
- **Build scripts**: `build.rs` runs before compilation; use for linking C libs, generating code at build time.
- **`CARGO_*` env vars**: `CARGO_PKG_VERSION`, `CARGO_MANIFEST_DIR`, etc., useful in build scripts and via `env!`.

## Reading Compiler Errors

Rust errors are structured: the message, an `-->` pointing at the code, and often a help/note. Multi-error cascades are common — fix the first error, then re-run; later ones often vanish.

## Summary

You can scaffold, build, run, format, lint, and document a project. Next: the type system starts with variables and mutability.