# 33 — Ecosystem Tour: Architectural Decisions, Not a Shopping List

Picking a crate is an architecture decision with a blast radius: it fixes your async runtime for the life of the project, it sets your dependency-audit surface, it determines whether cross-compilation and Docker builds stay simple or become a recurring source of CI pain. This chapter is not "here are some crates" — it's the trade-offs that separate a defensible choice from a choice you'll be reverting in eighteen months.

## Under-the-Hood Mechanics

### How Cargo actually resolves your dependency graph

::code-wrapper{language="toml"}
```toml
# Crate A wants tokio's "rt" feature; crate B (anywhere, even transitively)
# wants "full". Cargo unifies: the COMPILED tokio has the union of both —
# your own Cargo.toml can understate what's actually in the binary.
[dependencies]
tokio = { version = "1", features = ["rt"] }
crate-b = "2" # pulls in tokio with features = ["full"] transitively
```
::

::code-wrapper{language="bash"}
```bash
# Cargo can compile TWO incompatible minor versions of the same crate
# into one binary if dependencies don't unify on a semver range —
# invisible until compile time or binary size looks oddly large.
cargo tree -d   # surfaces duplicate versions, e.g. regex 1.5 AND regex 1.10
```
::

### Why mixing async runtimes doesn't fail at compile time

::code-wrapper{language="rust"}
```rust
// Both implement the same trait surface — the type system can't tell
// you're mixing runtimes, because AsyncRead/AsyncWrite look identical.
async fn tokio_style(s: tokio::net::TcpStream) { /* driven by tokio's reactor */ }
async fn async_std_style(s: async_std::net::TcpStream) { /* driven by async-std's reactor */ }

// This compiles fine, then panics at runtime — "there is no reactor running" —
// the FIRST time this exact code path executes, often in production:
#[tokio::main]
async fn main() {
    let _ = async_std::net::TcpStream::connect("example.com:80").await;
    // ^ needs async-std's reactor; only tokio's is running here.
}
```
::

## Cost, Performance, and Trade-Offs

| Decision axis | Cheap-looking choice | Real cost |
|---|---|---|
| `openssl` vs `rustls` for TLS | `openssl` "just works" locally | System C dependency breaks reproducible cross-compilation and minimal Docker images; `rustls` is pure-Rust, statically linked, no version-matching headers needed |
| `HashMap` (std) in a hot path | Zero extra dependency | SipHash is DoS-resistant but meaningfully slower than `FxHashMap`/`AHashMap` for non-adversarial internal keys — a reflexive choice, not a considered one |
| `bincode` for persisted data | Fastest serialize/deserialize | Not cross-version-schema-stable — reordering or adding struct fields can silently break deserialization of previously-written data; wrong choice for anything outliving a single process's in-memory lifetime |
| `serde` derive on every DTO | Ergonomic, universal | Proc-macro expansion cost is real and cumulative — dozens of `#[derive(Serialize, Deserialize)]` structs are a top contributor to `cargo build --timings` in large workspaces |
| Popular `unsafe`-heavy crate (`ring`, low-level FFI) | High download count reads as "trusted" | Download count reflects adoption, not audit — `cargo vet`/`cargo crev` are the actual review-based trust signal |
| Adding `async-std` transitively | "Just a dependency" | Global runtime conflict — the cost is paid at the point some unrelated future is awaited, often nowhere near the `Cargo.toml` change that caused it |

::code-wrapper{language="bash"}
```bash
# The cost of a crate choice rarely shows in the `cargo add` diff —
# it shows up later, at a different layer entirely:
cargo add openssl      # works locally...
docker build .          # ...fails in a minimal image: missing system headers
```
::

## Curated Map (by domain)

| Domain | Default choice | Alternative, and when to actually reach for it |
|---|---|---|
| Web framework | `axum` (tower-based, tokio team) | `actix-web` if you need its actor-model concurrency primitives specifically |
| HTTP client | `reqwest` (async, hyper-based) | `ureq` for a CLI tool where pulling in an async runtime just for HTTP is disproportionate |
| Serialization | `serde` + `serde_json` | `postcard` for embedded/no_std wire formats; `prost` for a gRPC/protobuf boundary |
| Database | `sqlx` (compile-time checked SQL) | `diesel` if you want a sync ORM with a mature migration story |
| Async runtime | `tokio` | `embassy` for `no_std` embedded targets — not a stylistic choice, a hard platform requirement |
| CLI parsing | `clap` (derive API) | `pico-args` for a tiny, dependency-conscious CLI where clap's compile-time cost isn't worth it |
| Logging | `tracing` + `tracing-subscriber` | `log` + `env_logger` for a small binary that doesn't need structured spans |
| Error handling | `thiserror` (libraries), `anyhow` (applications) | Never both directions reversed — a library returning `anyhow::Error` forces every downstream caller into stringly-typed error handling |
| Concurrency primitives | `parking_lot` (faster `Mutex`/`RwLock`) | std's `Mutex` when you don't want an extra dependency and contention is genuinely low |
| Testing | built-in `cargo test` + `criterion` for benchmarks | `insta` for snapshot-heavy domains (compiler output, rendered templates) |

## Production Failure Modes & Anti-Patterns

### Anti-pattern: choosing a wire format for speed, using it for storage

::code-wrapper{language="rust"}
```rust
// Naive: "bincode is fastest" reasoning applied to a persisted event log.
#[derive(serde::Serialize, serde::Deserialize)]
struct OrderPlaced {
    order_id: u64,
    amount_cents: u64,
}

fn persist(event: &OrderPlaced, store: &mut EventStore) {
    let bytes = bincode::serialize(event).unwrap();
    store.append(bytes); // written to disk, read back months later
}
```
::

`bincode` reflects field order/types at serialize time, with no field names or version tags — the day a field is added, every previously-persisted record fails to deserialize or silently deserializes into garbage. Invisible in dev, surfaces exactly when you need historical data most: a replay, an audit, a migration.

::code-wrapper{language="rust"}
```rust
// Production-grade: schema-evolution-aware format for anything persisted.
#[derive(serde::Serialize, serde::Deserialize)]
struct OrderPlaced {
    order_id: u64,
    amount_cents: u64,
    #[serde(default)] // absent in old records deserializes to None, not a crash
    currency: Option<String>,
}

fn persist(event: &OrderPlaced, store: &mut EventStore) {
    let bytes = serde_json::to_vec(event).unwrap(); // field names survive schema drift
    store.append(bytes);
}
```
::

Reserve `bincode`/`postcard` for **ephemeral, single-version** data — IPC between two processes of the same build, a cache that's fine to invalidate on redeploy — never for anything that outlives the binary that wrote it.

### Anti-pattern: transitively mixed async runtimes discovered in production

::code-wrapper{language="rust"}
```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
some-metrics-crate = "2" # <- pulls in async-std transitively, unnoticed
```
::

`cargo build` and `cargo test` both succeed if the test suite doesn't exercise `some-metrics-crate`'s async-std-driven path. The panic surfaces under real traffic, days later, with a stack trace pointing into a third-party crate — not this `Cargo.toml` diff. Fix: `cargo tree | grep async-std` before merging any new dependency, as a hard CI blocker.

### Anti-pattern: trusting download count as a security signal

::code-wrapper{language="rust"}
```toml
[dependencies]
some-crypto-helper = "0.3" # 2M downloads/month — "clearly fine"
```
::

Download counts measure adoption, not audit status — a popular crate can ship a vulnerable version or be taken over by a malicious maintainer, a real recurring supply-chain pattern. Automate the actual signal, continuously:

::code-wrapper{language="yaml"}
```yaml
- run: cargo audit          # checks RustSec advisory database
- run: cargo deny check     # license + advisory + duplicate-version bans
```
::

## Architectural Application

Crate selection decisions that belong in an architecture review, not a solo PR — enforced in CI, not tribal knowledge:

::code-wrapper{language="toml"}
```toml
# cargo-deny.toml — async runtime and TLS stack as enforced, not aspirational, policy
[bans]
deny = [
    { name = "async-std" },  # runtime choice is global — block a silent second reactor
    { name = "openssl-sys" }, # rustls-only policy: keeps FROM scratch/distroless builds trivial
]
```
::

::code-wrapper{language="rust"}
```rust
// Serialization format per BOUNDARY — wire and storage are different decisions
// even for the same struct, because only one of them needs schema evolution.
#[derive(serde::Serialize, serde::Deserialize)]
struct OrderPlaced { order_id: u64, amount_cents: u64 }

fn to_wire(o: &OrderPlaced) -> Vec<u8> { serde_json::to_vec(o).unwrap() }   // network
fn to_storage(o: &OrderPlaced) -> Vec<u8> { serde_json::to_vec(o).unwrap() } // disk — NOT bincode
```
::

Run `cargo audit`/`cargo deny` continuously in CI, not as a quarterly manual review — a dependency safe at `cargo add` time can have an advisory published against it six months later with zero code changes on your side.

## 💡 Tips & Tricks

- **Debug**: `cargo tree -d` finds duplicate versions of the same dependency pulled in transitively — a frequent source of unexpectedly large binaries and "why are there two versions of `tokio`" confusion.
- **Idiom**: default to `rustls` over `openssl`-backed crates whenever you have a choice — it removes a system-level C dependency, simplifying cross-compilation and Docker builds considerably.
- **Debug**: `cargo install cargo-outdated` (or `cargo update --dry-run`) shows available newer versions without touching `Cargo.lock` — safer to run habitually than blindly running `cargo update`.
- **Performance**: `cargo install cargo-nextest` for local and CI test runs — a near-drop-in replacement for `cargo test` that parallelizes at the process level, usually the single biggest free "make CI faster" win available.
- **Idiom**: for a new async project, `tokio` + `serde` + `anyhow` (or `thiserror` for a library) + `tracing` is close to a de facto standard stack — deviating is fine, but knowing the default helps you read the majority of example code and community answers.
- **Debug**: `cargo-audit` and `cargo-deny` belong in CI, not just local habit — a dependency safe when you `cargo add`ed it can later have an advisory published against it with zero changes on your side to reveal it.

## ⚠️ Edge Cases & Gotchas

- **`serde` derive macros meaningfully slow compile times at scale**: dozens of `#[derive(Serialize, Deserialize)]` structs in a large workspace pay real, cumulative proc-macro expansion cost — invisible in a small crate, a top `cargo build --timings` contributor in a large one.
- **Async runtime choice is global and contagious**: mixing `tokio`- and `async-std`-based crates in one binary typically compiles fine and panics at runtime the first time a runtime-specific future actually executes — the incompatible transitive dependency can be far from the code path that fails.
- **Popularity is not an audit**: high download counts on crates.io reflect adoption, not review — `cargo vet`/`cargo crev` provide an actual trust signal that raw download counts don't.
- **Feature unification silently expands what's compiled into your binary**: if crate A wants `tokio`'s `rt` feature and crate B (anywhere, including transitively) wants `full`, the binary compiles with the union — your own `Cargo.toml` can understate the actual compiled surface.
- **`bincode` and similar "fast" binary formats are typically not cross-version stable**: a struct serialized on one version of your program isn't guaranteed to deserialize correctly after reordering or adding fields — unlike `serde_json`, these formats optimize for speed within one static schema, not long-term wire/storage compatibility.
- **`HashMap` (std) is intentionally not the fastest hash map**: its DoS-resistant SipHash default hasher is slower than `FxHashMap`/`AHashMap` for non-adversarial keys — reaching for it reflexively in a hot path is a common missed optimization.
- **Portability trap — `openssl`'s system dependency breaks reproducible cross-compilation**: builds successfully on a developer's machine, then fails in a minimal Docker image or a CI runner lacking matching system OpenSSL headers.

## 🧠 Spot the Bug

A team adds a dependency to speed up JSON parsing in a hot path. What's the actual problem, given the rest of the codebase already uses `tokio`?

::code-wrapper{language="toml"}
```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
async-std = { version = "1", features = ["attributes"] }
```
::

<details>
<summary>Answer</summary>

The bug isn't the JSON parsing — it's `async-std` sitting alongside `tokio` in the same dependency graph. Each ships its own reactor; a `tokio`-specific type (`tokio::net::TcpStream`, `tokio::time::sleep`) can only be driven by a running `tokio` executor, and vice versa for `async-std`. Awaiting the "wrong" runtime's future under the other's executor typically compiles cleanly (both present a `Future`-shaped surface the type system can't distinguish) and panics at runtime with something like "there is no reactor running." If `async-std` was pulled in transitively by whatever crate motivated this change, rather than deliberately, the conflict surfaces the first time that specific code path executes — potentially in production, far from this `Cargo.toml` diff.

**The lesson**: async runtimes aren't interchangeable at the type level — running `cargo tree | grep async-std` (or a `cargo deny` ban rule) before merging any new dependency catches this before it becomes a 2 a.m. page.

</details>

## Summary

Crate choice is architecture, not shopping — the cost of a wrong choice (TLS stack, serialization format, async runtime) surfaces at a different layer and a later time than the `cargo add` that introduced it. Match serialization format to its boundary: schema-evolution-aware formats (`serde_json`) for anything persisted, fast fixed-schema formats (`bincode`, `postcard`) only for ephemeral same-build data. Treat async runtime as a single, enforced, org-wide decision — mixing two compiles fine and fails at runtime. Run `cargo audit`/`cargo deny` continuously in CI; download counts are not an audit. Default stack for new server-side projects: `axum` + `tokio` + `serde` + `sqlx` + `clap` + `tracing` + `anyhow`/`thiserror`.

Next: Common pitfalls and idiomatic fixes.
