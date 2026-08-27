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

### Why there's more than one source

Almost all real projects pull from crates.io, but Cargo supports several sources so you can integrate code before it's published, pin to a fork, or develop multiple local crates together. Each source has a distinct use case:

- **crates.io** — the default registry. Reach for this whenever the crate you need is published and the published version works for you. This is what 99% of dependencies look like.
- **git** — use a git source when the crate isn't on crates.io yet, when you need a fix that's only on a branch/tag/commit (e.g., a bugfix merged upstream but not yet released), or when you maintain a private fork. Pin to a `tag` for reproducibility, a `rev` for an exact commit, or a `branch` to track evolving work. Avoid `branch` in published crates — downstream builds become non-reproducible.
- **path** — a local directory. Use during development when you're working on multiple crates simultaneously (e.g., a library + an app that uses it) so changes in one are immediately visible in the other without re-publishing. Path deps are usually paired with a version for when the crate is eventually published.
- **optional** — a dependency gated behind a feature flag (see below). The dep is only compiled when the feature is enabled, letting you keep heavy/optional integrations out of the default build.

::code-wrapper{language="toml"}
```toml
[dependencies]
# crates.io — the default registry
serde = "1.0"

# git — unpublished, forked, or pre-release
my_crate = { git = "https://github.com/user/crate", branch = "dev" }
my_crate2 = { git = "...", tag = "v1.2.3" }     # reproducible
my_crate3 = { git = "...", rev = "abc123" }     # exact commit

# path — local monorepo development
my_local = { path = "../my_local" }

# optional — only compiled if the "extra" feature is enabled
extra = { version = "1.0", optional = true }
```
::

## Features

### Why features exist

A feature is a **compile-time switch** that conditionally includes code, dependencies, or modules. They exist so a single crate can serve multiple use cases without forcing every user to compile everything — e.g., a HTTP client that's async-only behind a `"async"` feature, or a serializer with optional `"json"`/`"yaml"` backends. Code gated by `#[cfg(feature = "...")]` is only compiled when the feature is on.

The important mechanic to understand is **feature unification**: if *any* crate in your dependency graph enables a feature, it's enabled for *all* uses of that crate in the build. This is why exposing features of your dependencies to your users is risky — your library's `serde` feature and a downstream crate's `serde` feature unify, and you may end up with features you didn't ask for. The safe pattern is to use direct dependencies + optional features rather than re-exporting a dependency's features.

::code-wrapper{language="rust"}
```rust
#[cfg(feature = "json")]
mod json;          // only compiled when the "json" feature is enabled
```
::

### When to define your own features

Define a feature when you want users to opt into functionality that has a compile-time or runtime cost (a heavy dependency, an async runtime, a CLI mode). Keep features **additive** (they only turn things *on*, never off) so unification can never break a downstream build.

## `Cargo.lock`

- Pin exact versions resolved for your dependency graph.
- Always commit for **binaries**. For **libraries** the official recommendation is also to commit it, but it's commonly gitignored.
- `cargo update` bumps within semver-compatible range; `cargo update -p serde --precise 1.0.150` pins a single crate.

## Workspaces

### Why workspaces exist

A workspace lets multiple crates share a single `target/` directory, a single `Cargo.lock`, and a unified set of dependency versions. Without a workspace, each crate in a monorepo would have its own `target/` (disk + compile-time waste), its own lockfile (drifting dependency versions across crates), and its own resolution (one crate could pull `serde 1.0.150` while another pulls `serde 1.0.180`). The workspace makes them one build graph.

### When to use a workspace

Reach for a workspace when you have **multiple related crates** that you want to evolve together: a multi-crate library (e.g., `core` + `derive` + `macros`), a monorepo with an app + shared internal libraries, or a project with separate binary + library + tooling crates. Keep a single crate if there's only one publishable unit — a workspace adds structure you don't need.

The `[workspace.dependencies]` table lets you declare a dependency version once and have every member crate reference it via `crate.workspace = true`, so versions stay unified without copy-pasting.

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

## 💡 Tips & Tricks

- **Debug**: `rustc --explain E0382` (or any error code from a compiler message) prints a detailed explanation with examples, straight from the compiler — faster than searching online for a common error code.
- **Idiom**: use `println!("{name:?}")` (Debug) while prototyping and switch to `println!("{name}")` (Display) once a type has a hand-written `Display` impl — reaching for `{:?}` everywhere works but produces developer-facing, not user-facing, output.
- **Idiom**: set `publish = false` in `Cargo.toml` immediately for any project that isn't meant for crates.io — it costs nothing and prevents an accidental `cargo publish` months later when you've forgotten the project was never meant to be public.
- **Debug**: `cargo run -- --flag value` — everything after the bare `--` is passed to *your* binary's argv, not interpreted by Cargo; forgetting the `--` is a common reason "my CLI flag doesn't work" during local testing.
- **Idiom**: pin dependencies with `"="` only when you have a specific reason (a known-broken later version, reproducibility requirements) — the default caret (`^`) requirement is usually right, since it allows patch/minor updates that are supposed to be backward compatible under semver.
- **Performance**: `cargo new`'s default `Cargo.toml` doesn't set a release profile — for anything beyond a quick script, add `[profile.release]` tuning (`lto`, `codegen-units`, `strip`) once you're past the prototyping stage, since the untouched defaults favor compile speed over runtime performance.

## ⚠️ Edge Cases & Gotchas

- **Binaries from `src/bin/*.rs`**: each `.rs` file in `src/bin/` becomes a separate binary target automatically. Run with `cargo run --bin extra`.
- **`cargo run` passes args after `--`**: `cargo run -- --flag` runs your binary with `--flag`.
- **Multiple `[[bin]]` targets** can share a `src/lib.rs` for logic and have thin `src/bin/*` shells.
- **`rustc` error codes**: `E0382` etc. Search `rustc --explain E0382` or online for detailed explanations.
- **Build scripts**: `build.rs` runs before compilation; use for linking C libs, generating code at build time.
- **`CARGO_*` env vars**: `CARGO_PKG_VERSION`, `CARGO_MANIFEST_DIR`, etc., useful in build scripts and via `env!`.

## Reading Compiler Errors

Rust errors are structured: the message, an `-->` pointing at the code, and often a help/note. Multi-error cascades are common — fix the first error, then re-run; later ones often vanish.

## 🧠 Spot the Bug

Why does `cargo build` succeed for one teammate and fail with a totally different error for another, on the exact same commit?

::code-wrapper{language="toml"}
```toml
[dependencies]
some_lib = "1.2"
```
::

<details>
<summary>Answer</summary>

The most common cause: one teammate has a `Cargo.lock` committed and checked out (or previously generated) that pins `some_lib` to, say, `1.2.3`, while the other teammate either deleted their `Cargo.lock`, is building a fresh checkout without one, or ran `cargo update` locally — resolving `"1.2"` (which means `^1.2`, i.e., `>=1.2.0, <2.0.0`) to a newer version like `1.5.0` that was published after the first teammate last locked their dependencies. Cargo.toml's version requirement is a *range*, not a pin — the actual, exact version used for any given build is determined by `Cargo.lock`, and if that file is missing, out of date, or excluded from version control, two people (or two CI runs, or a local build vs. a Docker build) can silently resolve to different concrete versions of `some_lib`, one of which may have introduced a breaking change or bug despite being "semver compatible" in theory.

This is precisely why the chapter's guidance is to always commit `Cargo.lock` for binaries (and, per current official guidance, for libraries too): it's the only thing that guarantees everyone — teammates, CI, and production builds — resolves the exact same dependency graph.

**The lesson**: `Cargo.toml` version requirements describe an acceptable *range*; only `Cargo.lock` pins the *exact* versions actually used — an uncommitted or stale lock file means "works on my machine" can be literally true and still not mean what you think it means.

</details>

## Summary

You can scaffold, build, run, format, lint, and document a project. Next: the type system starts with variables and mutability.