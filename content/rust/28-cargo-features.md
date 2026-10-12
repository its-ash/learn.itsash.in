# 28 — Cargo Features & Build Profiles

## Features: Optional Parts of a Crate

A **feature** is a named on/off switch declared in `Cargo.toml`. Code checks it with `#[cfg(feature = "...")]`.

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[features]
default = ["color"]     # turned on unless the user opts out
color = []
json = []
```
::

::code-wrapper{language="rust" filename="src/main.rs"}
```rust
fn main() {
    #[cfg(feature = "color")]
    println!("color on");

    #[cfg(feature = "json")]
    println!("json on");
}
```
::

::code-wrapper{language="bash"}
```bash
cargo run                                   # color on
cargo run --features json                   # color on, json on
cargo run --no-default-features             # (nothing)
cargo run --no-default-features --features json   # json on
cargo run --all-features                    # everything
```
::

**Tricky**: a typo is not an error — the code is just never compiled. Cargo warns, so read the warnings:

::code-wrapper{language="bash"}
```bash
warning: unexpected `cfg` condition value: `jsno`
  help: there is a expected value with a similar name: `"json"`
  note: expected values for `feature` are: `color`, `default`, and `json`
```
::

## Optional Dependencies

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[dependencies]
serde_json = { version = "1", optional = true }   # not downloaded/compiled unless enabled

[features]
json = ["dep:serde_json"]     # turning on `json` pulls in serde_json
```
::

::code-wrapper{language="rust"}
```rust
#[cfg(feature = "json")]
pub fn to_json(v: &[i32]) -> String {
    serde_json::to_string(v).unwrap()
}
```
::

Enabling a feature of a dependency:

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[dependencies]
serde = { version = "1", default-features = false }

[features]
derive = ["serde/derive"]     # our `derive` turns on serde's `derive`
```
::

## Features Must Be Additive

**Tricky**: Cargo builds each crate **once** for the whole project, with the **union** of all features anyone asked for. If crate A wants `mylib` with `json` and crate B wants `mylib` without it, **both** get `json`.

So features must only **add** things, never switch behavior:

::code-wrapper{language="toml"}
```toml
# BAD — two features that can't both be on
[features]
use_openssl = []
use_rustls = []
```
::

::code-wrapper{language="rust"}
```rust
#[cfg(feature = "use_openssl")]
fn tls() -> &'static str { "openssl" }

#[cfg(feature = "use_rustls")]
fn tls() -> &'static str { "rustls" }
// If two different dependents enable one each, BOTH are on:
// error[E0428]: the name `tls` is defined multiple times
```
::

If you truly need "pick one", fail clearly:

::code-wrapper{language="rust"}
```rust
#[cfg(all(feature = "use_openssl", feature = "use_rustls"))]
compile_error!("enable only one of `use_openssl` or `use_rustls`");
```
::

**Tricky**: `default-features = false` in **your** `Cargo.toml` does not guarantee the defaults are off — any other crate in the graph that depends on the same crate with defaults turns them back on.

::code-wrapper{language="bash"}
```bash
cargo tree -e features -i serde    # who turned on which serde features?
```
::

## Build Profiles

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[profile.dev]             # cargo build / cargo run / cargo test
opt-level = 0
debug = true
overflow-checks = true    # panic on integer overflow

[profile.release]         # cargo build --release
opt-level = 3
debug = false
overflow-checks = false   # overflow WRAPS silently (chapter 01)
lto = "thin"              # optional: smaller/faster binary, slower build
strip = true              # remove symbols → smaller binary

[profile.dev.package."*"]
opt-level = 2             # optimize dependencies even in dev — faster debug runs
```
::

**Tricky**: you can keep overflow checks in release if correctness matters more than a little speed:

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[profile.release]
overflow-checks = true
```
::

## Build Scripts

A `build.rs` file runs **before** your crate compiles (code generation, linking C libraries):

::code-wrapper{language="rust" filename="build.rs"}
```rust
fn main() {
    println!("cargo:rerun-if-changed=schema.txt");   // rebuild only when this file changes
    let n = std::fs::read_to_string("schema.txt").unwrap_or_default().lines().count();
    println!("cargo:rustc-env=SCHEMA_LINES={n}");    // available as env!("SCHEMA_LINES")
}
```
::

**Tricky**: without any `rerun-if-changed` line, Cargo reruns the script whenever **any** file in the package changes — slow builds. With a wrong path, it never reruns — stale generated code.

## 💡 Tips & Tricks

- **Idiom** — keep `default` features small; let users opt in.
- **Testing** — CI should build with `--no-default-features` and `--all-features` to catch broken combinations.
- **Tooling** — `cargo tree -e features` shows which features are on and why.
- **Speed** — optimize dependencies in dev (`[profile.dev.package."*"]`) for faster debug runs.
- **Idiom** — document every feature in your README; users can't see your `#[cfg]`s.

## ⚠️ Edge Cases & Gotchas

- **Unification** — one build of each crate with the union of all requested features.
- **Additive** — features that conflict break as soon as two dependents enable different ones.
- **default-features = false** — can be overridden by any other crate in the graph.
- **Typos** — a misspelled feature in `#[cfg]` is silently false (watch for the warning).
- **Profiles** — `overflow-checks` differs between dev and release by default.
- **build.rs** — always declare `rerun-if-changed`.

## 🧠 Spot the Bug

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[features]
default = []
fast-math = []
```
::

::code-wrapper{language="rust"}
```rust
pub fn average(v: &[f64]) -> f64 {
    #[cfg(feature = "fast_math")]
    return v.iter().sum::<f64>() / v.len() as f64;

    let mut total = 0.0;
    for x in v { total += x; }
    total / v.len() as f64
}
```
::

<details>
<summary>Answer</summary>

The feature is called `fast-math` (hyphen) but the code checks `fast_math` (underscore). The fast path is **never** compiled, even with `--features fast-math`. Cargo prints `unexpected cfg condition value: fast_math`, which is easy to miss.

Use the exact same name in both places: `#[cfg(feature = "fast-math")]`. (Also: `average(&[])` returns `NaN` — `0.0 / 0.0`; decide whether to return `Option<f64>`.)

</details>

## Summary

Features are additive, project-wide switches checked with `#[cfg(feature = "...")]`; optional dependencies hang off them via `dep:`. Profiles control optimization and checks per build type. Test feature combinations in CI and read `unexpected cfg` warnings.

Next: Advanced Type System.
