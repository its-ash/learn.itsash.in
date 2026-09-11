# 28 — Cargo Features & Release Engineering

Cargo features look like a simple on/off switch in a TOML file. At the scale of a real dependency graph they become a distributed configuration problem with a resolution algorithm you don't control. The one fact everything else follows from: **Cargo resolves one feature set per crate for the entire build graph, not per dependency edge.**

This chapter also covers profiles (compile-time/runtime trade-off), build scripts (the escape hatch into native code/codegen), and the release checklist.

## Under-the-Hood Mechanics

### Feature unification is graph-wide, not per-edge

One `Cargo.lock` entry per (crate, version) — compiled with the **union** of every feature any dependent requests, anywhere in the graph.

::code-wrapper{language="toml"}
```toml
# crate-a/Cargo.toml — asks for the minimal serde
[dependencies]
serde = { version = "1", default-features = false }

# crate-b/Cargo.toml — also in the graph, needs derive
[dependencies]
serde = { version = "1", features = ["derive"] }
```
::

Both get `derive`-enabled `serde`. Prove it yourself:

::code-wrapper{language="bash"}
```bash
# shows every crate in the graph that turns on `derive` for serde
cargo tree -e features -i serde | grep derive
```
::

There is no per-edge escape hatch — this does not exist:

::code-wrapper{language="toml"}
```toml
# WRONG — Cargo has no syntax for "just for my edge, no derive"
[dependencies]
serde = { version = "1", default-features = false, isolate = true }  # not a real key
```
::

### `dep:` syntax and the implicit-feature trap

Before Cargo 1.60, `optional = true` silently created a feature of the same name. `dep:` decouples "is this compiled in" from "what is my feature called."

::code-wrapper{language="toml"}
```toml
# OLD / implicit — feature name is forced to match the dep name
[dependencies]
serde_json = { version = "1.0", optional = true }
# users must write features = ["serde_json"] — leaks your dependency choice
```
::

::code-wrapper{language="toml"}
```toml
# NEW / explicit — feature name is independent of the dep name
[dependencies]
serde_json = { version = "1.0", optional = true }

[features]
json = ["dep:serde_json"]   # swap serde_json -> simd-json later, "json" stays stable
```
::

### `?dep/feature`: conditional forwarding

Turns on a dependency's feature *only if something else already pulled the dependency in* — never pulls it in itself.

::code-wrapper{language="toml"}
```toml
[dependencies]
anyhow = { version = "1", optional = true }

[features]
# if anyhow is already in the graph, also enable its backtrace feature —
# but don't force anyhow into the build just for this
better-errors = ["anyhow?/backtrace"]
```
::

::code-wrapper{language="toml"}
```toml
# CONTRAST: without the `?`, this line would force `anyhow` into every
# build that enables "better-errors", even ones that never use anyhow
better-errors-wrong = ["anyhow/backtrace"]
```
::

### Build profiles are per-compilation-unit codegen policy

::code-wrapper{language="toml"}
```toml
[profile.dev]
opt-level = 0        # fast rustc, slow binary — optimized for iteration speed

[profile.release]
opt-level = 3        # full LLVM pipeline: inlining, vectorization, unrolling

[profile.min-size]
inherits = "release"
opt-level = "z"       # bias size over speed
```
::

::code-wrapper{language="toml"}
```toml
[profile.release]
lto = false           # default: optimize each crate in isolation, then link

[profile.dist]
inherits = "release"
lto = "fat"            # cross-crate inlining across the WHOLE graph — slow, maximal
# lto = "thin"         # cheaper, parallelizable approximation
```
::

::code-wrapper{language="toml"}
```toml
[profile.release]
codegen-units = 16     # default-ish: 16 parallel chunks, no cross-chunk inlining

[profile.dist]
inherits = "release"
codegen-units = 1      # one chunk — removes the inlining ceiling, kills parallelism
```
::

::code-wrapper{language="toml"}
```toml
[profile.release]
panic = "unwind"       # supports catch_unwind, runs Drop on panic, unwind tables

[profile.release-embedded]
inherits = "release"
panic = "abort"        # smaller/faster: no unwind tables — but catch_unwind is a no-op
```
::

::code-wrapper{language="rust" filename="src/main.rs"}
```rust
fn might_panic() {
    panic!("boom");
}

fn main() {
    // With panic = "unwind": prints "caught: boom", process continues.
    // With panic = "abort":  catch_unwind never returns — process aborts immediately.
    let result = std::panic::catch_unwind(might_panic);
    match result {
        Ok(_) => println!("no panic"),
        Err(e) => println!("caught: {:?}", e.downcast_ref::<&str>()),
    }
}
```
::

### `build.rs` talks to Cargo through stdout, not a return value

::code-wrapper{language="rust" filename="build.rs"}
```rust
fn main() {
    // linker directives — parsed out of stdout by Cargo, not returned
    println!("cargo:rustc-link-lib=static=foo");
    println!("cargo:rustc-link-search=native=vendor/foo/lib");

    // inject a compile-time env var readable via env!("GIT_HASH")
    println!("cargo:rustc-env=GIT_HASH={}", git_hash());

    // rerun triggers — without these, Cargo caches the build script's output
    // and never notices this file changed
    println!("cargo:rerun-if-changed=vendor/foo/foo.c");

    // anything NOT prefixed with "cargo:" is just diagnostic noise (see with -vv)
    eprintln!("building against vendored foo");
}

fn git_hash() -> String {
    std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|_| "unknown".into())
}
```
::

### The `links` key prevents duplicate native linking

::code-wrapper{language="toml"}
```toml
# crate-a/Cargo.toml
[package]
links = "openssl"

# crate-b/Cargo.toml — ALSO declares links = "openssl"
[package]
links = "openssl"
```
::

::code-wrapper{language="bash"}
```bash
# resolution fails BEFORE any compilation happens:
error: multiple packages link to native library `openssl`, but a native library
can be linked only once
```
::

## Cost, Performance, and Trade-Offs

::code-wrapper{language="bash"}
```bash
# same crate, two profiles — the numbers you're actually trading
time cargo build --profile release   # ~90s,  baseline runtime perf
time cargo build --profile dist      # ~20min, fastest possible binary
```
::

::code-wrapper{language="toml"}
```toml
# resolution cost exists even for features nobody turns on:
[dependencies]
big-crate = { version = "3", default-features = false }
# big-crate ships 30 optional features, each with its own transitive graph —
# `cargo update` still has to resolve all of them to produce Cargo.lock
```
::

::code-wrapper{language="bash"}
```bash
# you cannot reason about your footprint from your own Cargo.toml alone —
# always check what's ACTUALLY resolved, not what you requested
cargo tree -e features -i tokio
cargo bloat --release --crates   # actual compiled-size breakdown
```
::

::code-wrapper{language="rust"}
```rust
// panic = "abort" is a correctness trade dressed as a perf trade:
// this graceful-degradation pattern silently stops working
fn process_batch(items: &[Item]) -> Vec<Result<Output, String>> {
    items
        .iter()
        .map(|item| {
            std::panic::catch_unwind(|| process_one(item))
                .map_err(|_| "item panicked, skipping".to_string())
        })
        .collect()
    // under panic = "abort": first panicking item takes down the whole process
}
# fn process_one(_: &Item) -> Output { unimplemented!() }
# struct Item; struct Output;
```
::

::code-wrapper{language="yaml"}
```yaml
# MSRV drift is silent without CI enforcement — a transitive dependency
# bump can raise your EFFECTIVE MSRV without you touching your own code
- run: cargo update -p some-transitive-dep
- run: rustup override set 1.75   # your declared floor
- run: cargo build --all-features  # this is what catches the drift
```
::

## Production Failure Modes & Anti-Patterns

### Anti-pattern: treating `default-features = false` as isolation

::code-wrapper{language="toml"}
```toml
# WRONG mental model: "this ensures MY build never links tokio's rt-multi-thread"
[dependencies]
tokio = { version = "1", default-features = false, features = ["macros"] }
```
::

::code-wrapper{language="bash"}
```bash
# the audit that would have caught it — run BEFORE release, not after
cargo tree -e features -i tokio
# └── some-unrelated-dep v2.3.1 requests tokio/full
#     -> your "lean" tokio just became the full multi-threaded runtime
```
::

**The fix isn't a Cargo mechanism** — it's process: run that audit in CI for size- or footprint-sensitive builds (embedded, WASM, small CLI binaries).

### Anti-pattern: forwarding a dependency's feature without realizing the commitment

::code-wrapper{language="toml"}
```toml
# WRONG — silently forces every downstream consumer of YOUR crate
# into serde's derive feature the moment THEY enable YOUR "json" feature
[features]
json = ["serde/derive", "dep:serde_json"]
```
::

::code-wrapper{language="toml"}
```toml
# RIGHT — split so downstream can choose parsing without derive
[features]
json = ["dep:serde_json"]
json-derive = ["json", "serde/derive"]
```
::

Once published, forwarding is a public-API commitment — features are additive-only and can never be "un-requested" by another crate.

### Anti-pattern: `lto = "fat"` + `codegen-units = 1` in the default `release` profile

::code-wrapper{language="toml"}
```toml
# WRONG for a profile developers/CI rebuild constantly
[profile.release]
lto = "fat"
codegen-units = 1
# every `cargo build --release` / `cargo test --release` now pays a
# 10x-or-worse compile tax for gains that only matter in the shipped artifact
```
::

::code-wrapper{language="toml"}
```toml
# RIGHT — isolate the expensive settings to a distribution-only profile
[profile.release]
opt-level = 3               # fast to build, good runtime perf, no LTO tax

[profile.dist]
inherits = "release"
lto = "fat"
codegen-units = 1
strip = "symbols"
```
::

::code-wrapper{language="bash"}
```bash
# developers/CI use this every day:
cargo build --release
# the release pipeline uses this, only when publishing:
cargo build --profile dist
```
::

### Anti-pattern: no MSRV CI, discovering the break from a bug report

::code-wrapper{language="toml"}
```toml
[package]
rust-version = "1.75"   # a documentation comment nobody enforces...
```
::

::code-wrapper{language="rust"}
```rust
// ...until a contributor on a newer toolchain adds this locally,
// it compiles fine for them, and MSRV is now silently false:
let x = [1, 2, 3].last_chunk::<2>();  // stabilized after 1.75
```
::

::code-wrapper{language="yaml" filename=".github/workflows/msrv.yml"}
```yaml
# RIGHT — MSRV is a tested contract, not a comment
- run: rustup install 1.75 && rustup override set 1.75
- run: cargo build --all-features
- run: cargo test --all-features
```
::

## Architectural Application

::code-wrapper{language="toml"}
```toml
# Features add capability — never gate incompatible behavior changes.
# If "v2-behavior" would change existing output, that's a major version
# or a new crate, NOT a feature flag:
[features]
# WRONG: changes behavior, doesn't just add code
v2-behavior = []
```
::

::code-wrapper{language="toml"}
```toml
# RIGHT — internal workspace crates guarded from day one
[package]
name = "internal-test-utils"
publish = false   # zero-cost guard; crates.io publishes are permanent
```
::

::code-wrapper{language="toml"}
```toml
# A small, named profile hierarchy makes the trade-off explicit at build time
[profile.release]
opt-level = 3

[profile.dist]
inherits = "release"
lto = "fat"
codegen-units = 1

[profile.profiling]
inherits = "release"
debug = true          # symbols for flamegraph/perf, still optimized
```
::

::code-wrapper{language="yaml"}
```yaml
# MSRV as a support-tier commitment, enforced from v0.1.0 — not retrofitted
- run: rustup override set 1.75
- run: cargo build --all-features
```
::

## Tips & Tricks

- **Debug**:
  ::code-wrapper{language="bash"}
  ```bash
  cargo tree -e features -i serde   # who's turning on which feature, and why
  ```
  ::
- **Idiom**:
  ::code-wrapper{language="bash"}
  ```bash
  cargo install cargo-hack
  cargo hack check --feature-powerset   # compiles every feature combination
  ```
  ::
- **Performance**: reserve this pairing for the final artifact only:
  ::code-wrapper{language="toml"}
  ```toml
  [profile.dist]
  inherits = "release"
  lto = "fat"
  codegen-units = 1
  ```
  ::
- **Idiom**:
  ::code-wrapper{language="toml"}
  ```toml
  [package]
  publish = false   # set this on day one for internal workspace crates
  ```
  ::
- **Debug**:
  ::code-wrapper{language="bash"}
  ```bash
  cargo publish --dry-run   # catches missing license/description before the real publish
  ```
  ::
- **Idiom**: decouple your public feature name from the crate you depend on:
  ::code-wrapper{language="toml"}
  ```toml
  [features]
  json = ["dep:serde_json"]   # swap serde_json -> simd-json later without breaking users
  ```
  ::

## ⚠️ Edge Cases & Gotchas

- **Feature unification breaking builds**:
  ::code-wrapper{language="toml"}
  ```toml
  # can't express "cfg(feature = "x") only if crate Y also has feature Z"
  # without dep:/?dep/feat syntax
  [features]
  x = ["other-crate?/z"]
  ```
  ::
- **Optional dep without `dep:`** creates an implicit feature of the same name:
  ::code-wrapper{language="toml"}
  ```toml
  [dependencies]
  serde_json = { optional = true }
  # users can now write features = ["serde_json"] — sometimes wanted, sometimes not
  ```
  ::
- **Overriding defaults from the CLI**:
  ::code-wrapper{language="bash"}
  ```bash
  cargo build --no-default-features --features ""
  ```
  ::
- **`build.rs` reads feature flags via env, not Cargo.toml parsing**:
  ::code-wrapper{language="rust" filename="build.rs"}
  ```rust
  fn main() {
      if std::env::var("CARGO_FEATURE_JSON").is_ok() {
          println!("cargo:rustc-cfg=has_json");
      }
  }
  ```
  ::
- **Profile inheritance**:
  ::code-wrapper{language="toml"}
  ```toml
  # WRONG — no `inherits`, starts from Cargo's blank defaults, not `release`
  [profile.dist]
  lto = "fat"

  # RIGHT
  [profile.dist]
  inherits = "release"
  lto = "fat"
  ```
  ::
- **`opt-level = "z"` isn't always smallest-and-fastest**:
  ::code-wrapper{language="toml"}
  ```toml
  [profile.release]
  opt-level = "z"   # can be SLOWER at runtime than "s" or 3, despite the smaller binary
  ```
  ::

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

`serde` gets compiled with `derive` enabled for **both** crates, including `crate-a`.

::code-wrapper{language="bash"}
```bash
cargo tree -e features -i serde
# serde v1.x
# ├── crate-a  (requested: default-features = false)
# └── crate-b  (requested: features = ["derive"])
# -> ONE resolved serde, feature set = union = derive ON for everyone
```
::

`default-features = false` only scopes crate-a's own request — it's not a guarantee against what anyone else in the graph asks for. This is why features must be strictly additive: you can't reliably keep one off if any other crate anywhere wants it on.

</details>

## Summary

::code-wrapper{language="toml"}
```toml
# One resolved feature set per crate, graph-wide — not per edge.
[dependencies]
serde = { version = "1", default-features = false }  # a request, not a guarantee

[features]
json = ["dep:serde_json"]        # decouples feature name from dep name
maybe = ["other-crate?/feat"]    # conditional forwarding, no forced dependency

[profile.release]
opt-level = 3                    # fast dev loop

[profile.dist]
inherits = "release"
lto = "fat"                      # expensive settings isolated to shipping builds
codegen-units = 1
```
::

`build.rs` talks to Cargo through `cargo:`-prefixed stdout lines; `links` prevents duplicate native-library linking at resolution time, before compilation. MSRV is a tested CI contract, not a `Cargo.toml` comment.

Next: The deeper type system — variance, HRTBs, and the generics machinery that makes zero-cost abstraction possible.
