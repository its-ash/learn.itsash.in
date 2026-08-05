# 01 — Introduction & Setup

## Why Rust?

Rust is a systems programming language that guarantees **memory safety** and **thread safety** without a garbage collector. It achieves this through a unique ownership model enforced at compile time. Key selling points:

- **Performance**: comparable to C/C++; no runtime, no GC.
- **Memory safety**: no null pointers, no dangling pointers, no buffer overflows.
- **Fearless concurrency**: the compiler prevents data races.
- **Zero-cost abstractions**: iterators, traits, generics compile down to the same machine code you'd write by hand.
- **Strong type system**: algebraic data types (enums), pattern matching, traits.
- **Great tooling**: `cargo` (build/package), `rustfmt` (formatting), `clippy` (lints), `rustdoc` (docs), `rust-analyzer` (IDE).

## The Compile-Time vs Runtime Tradeoff

Rust moves correctness checks to compile time. A program that compiles is far more likely to "just work" than in most languages. The cost: longer compile times and a steeper learning curve (especially ownership/lifetimes).

## Installing Rust (rustup)

`rustup` is the official toolchain manager.

```bash
# macOS / Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Windows: download rustup-init.exe from https://rustup.rs
```

Verify:

```bash
rustc --version
cargo --version
rustup --version
```

### Toolchain Components

- `stable` — default, released every 6 weeks.
- `beta` — next stable candidate.
- `nightly` — unstable features (e.g., some macros, inline assembly).

```bash
rustup install stable
rustup install nightly
rustup default stable
rustup component add rustfmt clippy rust-src rust-analyzer
rustup target add wasm32-unknown-unknown   # cross-compile to WebAssembly
```

### Editions

Editions (2015, 2018, 2021, 2024) are opt-in language evolutions. Set in `Cargo.toml`:

```toml
[package]
edition = "2021"
```

Code from older editions keeps compiling; editions are about how the *parser* sees your code, not the runtime behavior. Key 2021 changes: `IntoIterator` for arrays, disjoint closure captures, `panic` macros consistency. Edition 2024 adds `unsafe` attributes on extern blocks, `gen` keyword reservation, etc.

## The Cargo Build Pipeline

```
cargo new my_project      # scaffolds a binary crate
cargo new my_lib --lib    # scaffolds a library crate
cargo build               # debug build -> target/debug
cargo build --release     # optimized build -> target/release (O3-ish)
cargo run                 # build + run binary
cargo check               # type-check without codegen (fast feedback)
cargo test                # run tests
cargo doc --open          # generate & open docs
cargo fmt                 # format code
cargo clippy              # run lints
cargo update             # update deps in Cargo.lock
cargo tree               # print dependency tree
cargo bench              # run benchmarks (requires nightly or criterion)
```

### Profile customization

```toml
# Cargo.toml
[profile.release]
opt-level = 3
lto = "fat"          # link-time optimization across crates
codegen-units = 1    # better optimization, slower compile
strip = true         # strip debug symbols
panic = "abort"      # smaller binary, no unwinding
```

## Project Layout Conventions

```
my_project/
├── Cargo.toml
├── Cargo.lock          # binary: commit it; library: usually commit too
├── src/
│   ├── main.rs         # binary crate root
│   ├── lib.rs          # library crate root
│   └── bin/
│       └── extra.rs    # additional binary target
├── tests/              # integration tests
│   └── integration_test.rs
├── benches/
│   └── my_bench.rs
└── examples/
    └── example.rs
```

## Edge Cases & Gotchas

- **Cargo.lock**: commit it for binaries to ensure reproducible builds. For libraries it's debated; the official guidance is to commit it too, but it's not required.
- **`cargo check` is your friend**: during development it's 10x faster than `build`.
- **`rust-analyzer`** needs `rust-src` to show stdlib source — install it via `rustup component add rust-src`.
- **macOS linkers**: if you hit linker errors, install Xcode Command Line Tools: `xcode-select --install`.
- **MSRV** (Minimum Supported Rust Version): set with `rust-version` in `Cargo.toml`; CI should pin to that version.
- **Incremental compilation**: on by default in dev; can occasionally produce stale errors — `cargo clean` fixes it.
- **`~/.cargo/bin`** must be on your `PATH` (rustup installer adds it to your shell profile).

## Recommended Environment (VS Code)

Install the **rust-analyzer** extension (NOT the legacy "Rust" extension). Enable:
- `rust-analyzer.check.command = "clippy"`
- `rust-analyzer.inlayHints` for type/chaining hints
- Format on save with `rustfmt`

## Summary

You now have the toolchain and understand the build lifecycle. Next: writing your first program and reading `Cargo.toml` semantics.