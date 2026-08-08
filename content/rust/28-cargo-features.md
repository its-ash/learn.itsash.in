# 28 — Cargo Features & Release Engineering

Cargo features are the standard mechanism for conditional compilation. Combined with profiles and CI, they form the release engineering story.

## Defining Features

::code-wrapper{language="toml"}
```toml
# Cargo.toml
[features]
default = ["json", "csv"]
json = ["dep:serde_json"]          # optional dependency 'serde_json'
csv = ["dep:csv"]
full = ["json", "csv", "yaml"]
yaml = []
```
::

### Feature Syntax (1.60+)

- `dep:crate_name` — enables an optional dependency without exposing a feature of the same name.
- `dep_crate/feature` — enables a specific feature of a dependency.
- `?dep_crate/feature` — only enables the dep's feature if it's already enabled by someone else.

### Optional Dependencies

::code-wrapper{language="toml"}
```toml
[dependencies]
serde_json = { version = "1.0", optional = true }
```
::

Optional deps implicitly create a feature of the same name (unless `dep:` is used).

## Using Features

::code-wrapper{language="rust"}
```rust
#[cfg(feature = "json")]
mod json;

#[cfg(feature = "json")]
pub use json::parse_json;
```
::

::code-wrapper{language="bash"}
```bash
cargo build --no-default-features
cargo build --features json,yaml
cargo build --all-features
```
::

## Feature Unification

Cargo unifies features across the dependency graph: if any crate enables `serde/derive`, *every* user of `serde` gets `derive` on. Design features accordingly:

- **Don't** expose "private" features that change behavior of your crate depending on who else in the graph enabled them.
- Use additive features (more code enabled), not subtractive.
- Avoid `default-features = false` on transitive deps unless you understand the consequences.

### Additive-Only Rule

Features should be strictly additive: enabling a feature adds capabilities, never removes them. If you need mutually-exclusive features, consider splitting crates.

## Common Feature Pitfalls

- **Exposing transitive features**: `["serde/derive"]` from your crate forces all downstream users to also enable `serde/derive`.
- **Cargo feature unification surprise**: if a dep is also enabled by another crate with extra features, you get them all.
- **`default-features = false` on transitive deps**: hard to reason about; usually wrong.
- **Negation**: features can't disable features. The only "negation" is `default-features = false` when depending on a crate.

## Build Profiles

::code-wrapper{language="toml"}
```toml
[profile.dev]
opt-level = 0
debug = true
incremental = true
overflow-checks = true

[profile.release]
opt-level = 3
debug = false
lto = "fat"               # or "thin", or true/false
codegen-units = 1          # best optimization, slower compile
panic = "unwind"           # or "abort"
strip = "symbols"
opt-level = "z"            # optimize for size (vs "s" or numeric 0-3)

[profile.release.package."*"]
opt-level = 2              # dependencies at lower opt level for faster compile

[profile.bench]
inherits = "release"
debug = true

[profile.dist]
inherits = "release"
lto = "thin"
```
::

### `inherits`

Custom profiles can inherit from existing ones:

::code-wrapper{language="toml"}
```toml
[profile.profiling]
inherits = "release"
debug = true
```
::

Build with `cargo build --profile profiling`. Output goes to `target/profiling`.

### Profile Pitfalls

- **`lto = "fat"` dramatically slows compile** but produces smaller/faster binaries. Use only in release.
- **`codegen-units = 1`** is best for performance, slowest to compile.
- **`panic = "abort"`** breaks some code that relies on unwinding (and on catching panics via `catch_unwind`).
- **`opt-level = "z"`** optimizes for binary size; `"s"` for size + some speed; `3` for max speed.

## Build Scripts (`build.rs`)

::code-wrapper{language="rust"}
```rust
// build.rs
fn main() {
    println!("cargo:rustc-env=MY_VAR=value");
    println!("cargo:rerun-if-changed=some_file.txt");
    println!("cargo:rustc-link-lib=mylib");
    println!("cargo:rustc-link-search=vendor/lib");
}
```
::

Use for:
- Compiling C code (`cc` crate).
- Generating code (e.g., protobuf, SQL).
- Setting env vars for `env!()`.
- Link configuration.

Read env vars set by Cargo: `CARGO_PKG_VERSION`, `CARGO_MANIFEST_DIR`, `OUT_DIR`, `TARGET`, `HOST`, `OPT_LEVEL`, `PROFILE`, `DEBUG`, `NUM_JOBS`.

Use `env!("VAR")` or `option_env!("VAR")` in code to read build-time env vars.

## `links` Key

::code-wrapper{language="toml"}
```toml
[links]
foo = "1.0"
```
::

`links` declares that the crate links to a native library named `foo`. Prevents two crates from both linking to `foo` with conflicting build scripts.

## Release Checklist

### Code Quality

- `cargo fmt -- --check`
- `cargo clippy -- -D warnings` (and `--all-targets`)
- `cargo deny check` (licenses, advisories, bans)
- `cargo audit` (RustSec advisories)
- `cargo machete` (unused deps)

### Testing

- `cargo test --all-features`
- `cargo test --no-default-features` (smoke)
- `cargo test --workspace`
- Doc tests: `cargo test --doc`
- Cross-compile: `cargo build --target x86_64-unknown-linux-musl`

### Performance

- Benchmarks: `cargo bench` (nightly) or `criterion`
- Profile with `cargo flamegraph`, `perf`, `samply`
- Check binary size: `cargo bloat`, `cargo build --release` then `ls -lh`

### Binary

- Strip symbols: `strip = "symbols"`
- LTO: `lto = "fat"` for final
- Consider `panic = "abort"` if you don't need unwinding
- For size-critical: `opt-level = "z"`, `codegen-units = 1`, `lto = true`

### Versioning

- Semver: `MAJOR.MINOR.PATCH`
- Use `cargo release` (`cargo install cargo-release`) to bump, tag, publish.
- Set `rust-version` (MSRV) in `Cargo.toml`.

### Publishing

::code-wrapper{language="bash"}
```bash
cargo login <token>
cargo publish --dry-run
cargo publish
```
::

- Crates.io is the public registry.
- `publish = false` to prevent accidental publication.
- Documentation is auto-built on docs.rs.

### Changelog

Use `cargo release`, `git-cliff`, or `changesets` to generate from commits/PRs. Conventional Commits format works well with `git-cliff`.

## CI (GitHub Actions)

::code-wrapper{language="yaml"}
```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        rust: [stable, beta, nightly]
        os: [ubuntu-latest, windows-latest, macos-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@master
        with: { toolchain: ${{ matrix.rust }}, components: clippy, rustfmt }
      - run: cargo fmt -- --check
      - run: cargo clippy --all-targets -- -D warnings
      - run: cargo test --all-features
      - run: cargo doc --no-deps
```
::

Add `cargo-deny`, `cargo-audit` for security. Use `cargo nextest run` for faster test execution.

## Cross-Compilation

::code-wrapper{language="bash"}
```bash
rustup target add x86_64-unknown-linux-musl
cargo build --target x86_64-unknown-linux-musl
```
::

For cross-platform, `cross` (Docker-based) is the easiest:

::code-wrapper{language="bash"}
```bash
cargo install cross
cross build --target aarch64-unknown-linux-gnu
```
::

`cargo-zigbuild` uses Zig as a cross-linker (good for musl and Windows targets from Linux).

## Binary Distribution

- Static linking with `musl` for portable Linux binaries.
- Universal binaries on macOS: build for both `x86_64-apple-darwin` and `aarch64-apple-darwin`, combine with `lipo`.
- Windows: `cargo build --target x86_64-pc-windows-gnu` for portable static binaries (or use `cargo-wix` for MSI installers).

## Workspace Releases

For multi-crate workspaces, `cargo release` handles inter-crate version bumps and dependency updates.

## MSRV

::code-wrapper{language="toml"}
```toml
[package]
rust-version = "1.75"
```
::

CI must test with that version:

::code-wrapper{language="yaml"}
```yaml
- run: rustup install 1.75
- run: rustup override set 1.75
- run: cargo build
```
::

## 💡 Tips & Tricks

- **Debug**: `cargo tree -e features -i <crate>` shows exactly which of your dependencies are enabling a specific feature on a shared dependency — the fastest way to track down an unwanted feature that "somehow" got turned on.
- **Idiom**: use `cargo hack check --feature-powerset` (via `cargo install cargo-hack`) in CI for libraries with several optional features — it compiles every combination, catching a `#[cfg(feature = "a")]` block that silently depends on feature `b` without declaring it.
- **Performance**: `codegen-units = 1` plus `lto = "fat"` gives the best runtime performance but the slowest release build — reserve this combination for the final distributed binary, not for every CI run, since a "profiling" or "dist" custom profile inheriting from `release` can isolate the cost to only when you need it.
- **Idiom**: set `publish = false` on internal workspace-only crates from the start — it costs nothing and prevents an embarrassing accidental `cargo publish` of a crate never meant for crates.io.
- **Debug**: `cargo publish --dry-run` catches missing metadata (license, description) and packaging issues without actually publishing — always run it before the real `cargo publish`, especially the first time for a new crate.
- **Idiom**: prefer `dep:crate_name` syntax over a bare optional dependency when you don't want the feature name to be implicitly tied to the dependency's crate name — it decouples your public feature-flag API from your internal dependency choices, so swapping the underlying crate later isn't a breaking change to your feature flags.

## ⚠️ Edge Cases & Gotchas

- **Feature unification breaking builds**: if your crate's `cfg(feature = "x")` only makes sense with another crate's feature, you can't express that without `dep:`/`?dep/feat` syntax.
- **Optional dep without `dep:`** creates an implicit feature of the same name; sometimes you want this (so users can `features = ["serde_json"]`), sometimes you don't.
- **`cargo build --features ""`** is sometimes needed to override `default-features`.
- **`build.rs` and feature interaction**: read `CARGO_FEATURE_*` env vars in build scripts.
- **Profile inheritance**: a custom profile that doesn't `inherits` from another starts empty (potentially wrong optimization).
- **`opt-level = "z"`** can be slower at runtime than `"s"` or `3` despite smaller binaries.

## 🧠 Spot the Bug

Two crates in the same dependency graph both use `serde`, with different feature needs. What actually happens at build time?

::code-wrapper{language="toml"}
```toml
# crate-a/Cargo.toml
[dependencies]
serde = { version = "1", default-features = false }

# crate-b/Cargo.toml (also in the same build)
[dependencies]
serde = { version = "1", features = ["derive"] }
```
::

<details>
<summary>Answer</summary>

`serde` gets compiled with the `derive` feature enabled for **both** crates — including `crate-a`, which explicitly asked for `default-features = false` and no extra features.

Cargo's feature unification is graph-wide, not per-crate: within a single build (one `Cargo.lock` resolution), there is exactly **one** compiled version of `serde` with **one** feature set, and that set is the union of every feature requested by every crate that depends on it, anywhere in the graph. `crate-a`'s `default-features = false` only means "don't turn on `serde`'s own defaults *from crate-a's request*" — it does not mean "guarantee `serde` compiles without `derive` no matter what else needs it." If `crate-b` (a sibling dependency, possibly many levels removed) asks for `derive`, `crate-a` gets `derive`-enabled `serde` too, silently, with no warning that its own more restrictive request was overridden by unification.

This is precisely why the "Additive-Only Rule" in this chapter matters: since you cannot reliably prevent a feature from being enabled by *someone else* in the graph, features must never change behavior in a way that would break a crate expecting them to be off — they can only ever add capability.

**The lesson**: Cargo feature unification means a crate's `default-features = false` only affects its own request — if any other crate anywhere in the build graph requests a feature, everyone using that dependency gets it, with no per-crate opt-out.

</details>

## Summary

Features are additive conditional-compilation flags. Design them additive-only. Use `dep:` and `?dep/feat` for clean dep/feature separation. Profiles control optimization and binary properties. `build.rs` enables codegen and linking. CI should run fmt/clippy/test/doc and cross-compile. Use `cargo release` for versioning and publishing. Set and test the MSRV.

Next: The deeper type system — variance, HRTBs, and tricky generics.