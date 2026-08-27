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

**Why `dep:` was introduced**: before 1.60, an optional dep named `serde_json` *implicitly* created a feature named `serde_json`. That meant a user enabling your crate's `serde_json` feature would *also* enable the dep — but if your feature and the dep had different intent, confusion resulted. `dep:` makes the relationship explicit: `json = ["dep:serde_json"]` enables the dep *without* creating an implicit `serde_json` feature, so feature and dep names stay separate. Reach for `dep:` whenever you want a feature gated by an optional dep but don't want the dep name to leak as a feature name.

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

### How unification works conceptually

Cargo resolves **one feature set per crate across the entire dependency graph** — not per-edge. So if your crate and a downstream both depend on `serde`, and either one enables `serde/derive`, the build's single `serde` instance has `derive` on, affecting *both* uses. This is why exposing features of your dependencies ("I'll re-export `serde/derive`") is dangerous: you don't control who else pulls `serde`, and they may not expect `derive` to be on. Design features accordingly:

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

### What each setting does conceptually

Each `[profile.*]` tunes the **compile-time vs. runtime tradeoff**: fast builds during dev, fast/small binaries for release, etc. The key settings:

- **`opt-level`** — optimization level (0-3, or "s"/"z" for size). `0` = no optimization (fast compile, slow binary); `3` = max speed; `"z"` = min size.
- **`lto`** — Link-Time Optimization runs the optimizer *across crate boundaries* (the default can't inline calls into dependencies). `"fat"` = max speed at steep compile-time cost; `"thin"` = a middle ground; `false` = none. Use for release builds where cross-crate inlining matters.
- **`codegen-units`** — how many parallel units rustc splits your crate into. More = faster compile (parallel codegen), worse optimization (each unit's view is limited). `1` = best optimization, slowest compile.
- **`debug`** — whether to include debug symbols (for debuggers/panics). `true`/`false` or a level.
- **`panic`** — `"unwind"` (default, supports `catch_unwind`, runs `Drop`s) or `"abort"` (smaller binary, no unwinding).
- **`strip`** — removes debug symbols from the binary (smaller).
- **`overflow-checks`** — runtime integer overflow checks (on in debug by default).

`inherits` lets a custom profile copy another and override a few fields — e.g., a `profiling` profile that's release + debug symbols for profiling tools.

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

### How `build.rs` communicates with Cargo

A build script is a Rust program Cargo runs **before** compiling the crate. It communicates with Cargo by printing **`cargo:`-prefixed directives to stdout** — Cargo parses these lines (everything else is just logs). The directives tell Cargo to set env vars (`cargo:rustc-env=K=V`, readable via `env!()`), link a library (`cargo:rustc-link-lib=...`), add a link search path, mark a file as a rerun trigger (`cargo:rerun-if-changed=...`), or pass flags to rustc. You reach for a build script when you need to **compile C code** (with the `cc` crate), **generate code at build time** (protobuf, SQLx, bindgen), **link a native library**, or **inject build-time env vars** (`env!`). It's a power tool — avoid it when `Cargo.toml` config alone suffices, because build scripts add complexity and compile-time cost.

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

### Why it matters

`links` declares that your crate links to a **specific native library** (e.g., `foo = "1.0"` means "I link `libfoo`".). Cargo then enforces that **only one crate in the dependency graph** can declare a `links` to `foo`. Why: if two crates both link `foo` (with their own build scripts that pass conflicting linker flags or compile the C source twice), you get **duplicate symbol errors** and inconsistent linking. The `links` key makes Cargo reject the conflict at build time, surfacing it clearly instead of producing a confusing linker failure. You reach for `links` when your build script links a native lib that other crates might *also* link — it's a guard against the duplicate-linking problem. It also allows other crates to pass metadata to your build script via the `links`-based `metadata` mechanism.

::code-wrapper{language="toml"}
```toml
[links]
foo = "1.0"
```
::

`links` declares that the crate links to a native library named `foo`. Prevents two crates from both linkinging to `foo` with conflicting build scripts.

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

### What it requires and when to reach for `cross`

Cross-compiling a Rust binary means producing a binary for a *different* target triple (e.g., building a Linux binary on macOS). It requires: a **target std library** (`rustup target add ...`), a **linker for the target** (the system linker can't produce a different target's binary — you need a cross-linker), and any **native C dependencies** must be cross-compiled too. `rustup target add` handles the std library; the linker is the hard part. You reach for **`cross`** (Docker-based) when you want this to "just work" — it ships pre-built Docker images with cross-linkers and C cross-compilers for common targets. Reach for **`cargo-zigbuild`** (uses Zig as a universal cross-linker) when you want a lighter setup, especially for musl and Windows from Linux. Manual `rustup target add` + a hand-configured cross-linker is the low-level route — only when `cross`/`zigbuild` don't fit.

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

### Why each approach matters

- **Static linking with `musl`** — produces a Linux binary with **no glibc dependency**. The binary runs on any Linux distro (no "works on my glibc version" issues). Reach for the `x86_64-unknown-linux-musl` target when distributing a CLI/daemon for arbitrary Linux systems.
- **Universal binaries on macOS** — combine the `x86_64-apple-darwin` (Intel) and `aarch64-apple-darwin` (Apple Silicon) binaries with `lipo` into one binary. Users get a single download that runs natively on both Mac architectures. Reach for this when distributing a macOS app/CLI so users don't pick the wrong arch.
- **Windows static binaries** — `x86_64-pc-windows-gnu` produces a binary with MinGW's static runtime (no MSVC runtime dependency). `cargo-wix` generates MSI installers for a polished Windows release.

- Static linking with `musl` for portable Linux binaries.
- Universal binaries on macOS: build for both `x86_64-apple-darwin` and `aarch64-apple-darwin`, combine with `lipo`.
- Windows: `cargo build --target x86_64-pc-windows-gnu` for portable static binaries (or use `cargo-wix` for MSI installers).

## Workspace Releases

For multi-crate workspaces, `cargo release` handles inter-crate version bumps and dependency updates.

## MSRV

### Why it matters and how to determine it

**MSRV** (Minimum Supported Rust Version) is the oldest toolchain your crate compiles on. It matters because **downstream users may be on older toolchains** — if your crate uses a feature stabilized in 1.75, users on 1.70 can't build it (their compiler rejects the feature). Declaring `rust-version` in `Cargo.toml` documents this contract, and Cargo will warn/refuse if a user's toolchain is older. To **determine** your MSRV: run `cargo build` on the oldest toolchain you intend to support, or use `cargo-msrv` to automatically binary-search the minimum version that compiles. CI should test on the declared MSRV (the YAML below) to catch accidental use of newer features.

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