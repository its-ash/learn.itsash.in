# 02 — Hello World & Cargo Deep Dive

`println!("Hello, world!")` is the least interesting line here. What matters is how `rustc`/`cargo` turn source into an artifact, and where the dependency/feature resolution model breaks down at scale.

## Under-the-Hood Mechanics

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn main() {
    println!("Hello, world!");
}
```
::

`println!` is a macro, not a function — Rust has no runtime reflection or variadic functions in its native ABI:

::code-wrapper{language="rust"}
```rust
fn main() {
    let name = "Ferris";
    println!("Hello, {name}!");        // fine: format string validated against args at compile time
    // println!("Hello, {}!");         // COMPILE ERROR: missing argument, caught before running
    // println!("Hello, {} {}!", name);// COMPILE ERROR: too few arguments for placeholders
}
```
::

Compiling directly with `rustc` skips Cargo entirely:

::code-wrapper{language="bash"}
```bash
rustc src/main.rs && ./main      # produces ./main (or main.exe)
# No dependency resolution, no feature unification, no incremental cache —
# same compiler pipeline cargo build invokes, just without the orchestration layer.
```
::

### `Cargo.toml` vs `Cargo.lock`: two different graphs

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[package]
name = "my_app"
version = "0.1.0"
edition = "2021"
rust-version = "1.75"
publish = false

[dependencies]
serde = { version = "1.0", features = ["derive"] }   # "1.0" means ^1.0: >=1.0.0, <2.0.0
tokio = { version = "1", features = ["full"] }

[dev-dependencies]
pretty_assertions = "1"

[features]
default = ["json"]
json = ["serde"]
```
::

::code-wrapper{language="toml" filename="Cargo.lock (excerpt)"}
```toml
[[package]]
name = "serde"
version = "1.0.203"     # the EXACT version actually resolved and built — frozen, reproducible
```
::

### Feature unification is a build-graph-wide OR, not per-crate

::code-wrapper{language="toml" filename="crate-a/Cargo.toml"}
```toml
[dependencies]
serde = { version = "1.0" }              # doesn't ask for "derive"
```
::

::code-wrapper{language="toml" filename="crate-b/Cargo.toml"}
```toml
[dependencies]
serde = { version = "1.0", features = ["derive"] }  # DOES ask for "derive"
```
::

If `crate-a` and `crate-b` are both in one build graph, `serde/derive` compiles for **both** — features are unified globally per compilation, never scoped per-consumer.

## Cost, Performance, and Trade-Offs

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
# Dangerous: re-exporting a transitive dependency's feature as your own public feature.
[features]
json = ["serde/derive"]   # the instant ANY consumer enables "json", derive compiles for EVERYONE
```
::

::code-wrapper{language="bash"}
```bash
cargo check     # parse -> HIR -> type inference -> BORROW CHECK -> stop, no codegen/link
cargo build     # everything check does, PLUS LLVM IR, optimization, codegen, linking
# check is an order of magnitude faster — make it your default inner-loop command.
```
::

Workspaces compile shared deps once; independent crates duplicate:

::code-wrapper{language="toml" filename="workspace/Cargo.toml"}
```toml
[workspace]
members = ["core", "cli", "service"]

[workspace.dependencies]
serde = "1.0"   # declared once; every member references via serde.workspace = true
```
::

Path deps rebuild fast locally but can silently block publishing:

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[dependencies]
local_lib = { path = "../local" }              # unpublishable to crates.io: no `version` field
local_lib2 = { path = "../local2", version = "0.1" }  # publishable: has a version fallback
```
::

## Production Failure Modes & Anti-Patterns

**Anti-pattern: no committed `Cargo.lock` for a service.**

::code-wrapper{language="bash"}
```bash
# .gitignore
Cargo.lock   # WRONG for a binary/service — fine for a pure library, wrong here
```
::

::code-wrapper{language="bash"}
```bash
# fix: commit Cargo.lock, and make CI verify it stays in sync
cargo build --locked   # fails loudly if Cargo.lock is stale, instead of silently re-resolving
cargo build --frozen   # --locked, plus forbids any network access entirely
```
::

**Anti-pattern: leaking dependency features through your public API without realizing it.**

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[dependencies]
tokio = { version = "1", features = ["full"] }   # pulls in signal handling, process spawning, everything
```
::

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[dependencies]
# Enumerate exactly what the LIBRARY needs; let the final BINARY decide if it wants "full".
tokio = { version = "1", features = ["rt-multi-thread", "macros", "net"] }
```
::

## Architectural Application

Workspaces collapse the build graph for a monorepo of related crates:

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[dependencies]
serde.workspace = true   # mechanical enforcement: one version of serde across the whole monorepo
```
::

Feature flags as compile-time dependency injection — must be strictly additive:

::code-wrapper{language="rust"}
```rust
#[cfg(feature = "postgres")]
fn backend() -> impl Backend { PostgresBackend::new() }

#[cfg(not(feature = "postgres"))]
fn backend() -> impl Backend { InMemoryBackend::new() }
// Additive: a feature only ever turns capability ON, never changes existing default behavior —
// Cargo's unification means you're never the only crate deciding whether it's enabled.
```
::

Git/path deps as a deliberate, time-boxed escape hatch:

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[dependencies]
upstream = { git = "https://github.com/org/upstream", rev = "a1b2c3d" }
# Pin to a `rev` or `tag` the moment this needs to survive more than a sprint —
# an unpinned branch means your build's reproducibility depends on someone else not force-pushing.
```
::

Reading diagnostics as a design signal, not a workaround prompt:

::code-wrapper{language="rust"}
```rust
struct Widget { data: Vec<i32> }

fn bad(w: &mut Widget) {
    let a = &mut w.data;
    let b = &mut w.data;      // E0499: two &mut borrows — restructure ownership, don't reach for Rc<RefCell<_>>
    a.push(1);
    b.push(2);
}
```
::

## 💡 Tips & Tricks

- **Idiom**: run `cargo build --locked` (or `--frozen`) in every CI pipeline for a binary crate.
- **Debug**: `rustc --explain E0382` prints the compiler team's own detailed explanation for any error code.
- **Performance**: enumerate exact features for library dependencies rather than `"full"`.
- **Idiom**: `cargo tree -d` surfaces duplicate major versions of the same crate linked simultaneously.
- **Debug**: `cargo run -- --flag value` — only args after `--` reach your binary's `argv`.
- **Idiom**: set `publish = false` immediately for any crate not meant for crates.io.

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="bash"}
```bash
# src/bin/*.rs each become independent binary targets automatically.
cargo run --bin extra   # required once you have more than one — bare `cargo run` is ambiguous
```
::

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[patch.crates-io]
some-crate = { path = "../some-crate-fork" }   # applies WORKSPACE-WIDE, not just to one crate
```
::

::code-wrapper{language="rust" filename="build.rs"}
```rust
fn main() {
    println!("cargo:rerun-if-changed=schema.proto");
    // Forgetting this: Cargo may not rebuild when schema.proto changes — stale generated code, no error.
}
```
::

::code-wrapper{language="rust"}
```rust
fn main() {
    // Only populated by Cargo itself — unset if you invoke `rustc` directly (see chapter top).
    println!("{}", env!("CARGO_PKG_VERSION"));
}
```
::

::code-wrapper{language="bash"}
```bash
cargo update -p some_crate --precise 1.2.3   # bump exactly one dependency, e.g. a security patch
```
::

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[dependencies]
tracing = { version = "0.1", optional = true }         # implicitly defines feature "tracing"
tracing = { package = "tracing", version = "0.1", optional = true }
my-feature = { dep = "tracing" }  # use dep: syntax to decouple the feature name from the crate name
```
::

## 🧠 Spot the Bug

::code-wrapper{language="yaml" filename=".github/workflows/ci.yml"}
```yaml
- run: cargo build
- run: cargo test
```
::

A team's CI passes on every PR. Two weeks later a production deploy fails with a trait-bound error nobody can reproduce locally. What's missing?

<details>
<summary>Answer</summary>

Nothing pins resolution with `--locked`, and nothing rebuilds from a clean state matching the release pipeline:

::code-wrapper{language="bash"}
```bash
# Local dev machine: warm cache, old resolution reused, everything compiles.
cargo build

# Release pipeline: fresh Docker image, no cache, Cargo.lock slightly stale vs Cargo.toml —
# re-resolves part of the graph, lands on a newer transitive version with different trait bounds.
cargo build   # FAILS here, never locally
```
::

**The lesson**: `cargo build`/`cargo test` without `--locked` will happily re-resolve and rewrite an out-of-sync `Cargo.lock` instead of failing — assert the lock file is authoritative in CI.

</details>

## Summary

Cargo's manifest/lock split separates an *acceptable range* from the *exact graph* actually built and tested — treat `Cargo.lock` as source of truth for binaries, remember features unify globally rather than per-consumer, and use workspaces to collapse a monorepo's build graph into one coherent, reproducible unit.

Next: Variables & Mutability — how `let`, `mut`, and immutability-by-default set up the aliasing guarantees the borrow checker (and therefore ownership) depends on.
