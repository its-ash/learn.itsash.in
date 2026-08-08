# 33 — Ecosystem Tour

A curated map of the Rust ecosystem. Pick the right tool for the job; don't reinvent.

## Web Frameworks

| Crate | Style | Notes |
|---|---|---|
| `axum` | Tokio-based, middleware via tower | Most popular, mature, by tokio team |
| `actix-web` | Actor model, fast | Pre-dates axum, still popular |
| `rocket` | Ergonomic, macros | Friendly API, slower release cadence |
| `poem` | Modular | Good OpenAPI integration |
| `salvo` | Middleware-centric | |
| `warp` | Combinator-based | Filter-based, older style |
| `tide` | async-std-based | Less active |

### Use with `tower` middleware

`tower` is the standard middleware/service abstraction. `axum` builds on `tower-http` (compression, tracing, auth, CORS).

## HTTP Client

- `reqwest`: dominant async HTTP client (built on `hyper`).
- `ureq`: simple blocking client, minimal deps.
- `hyper`: low-level HTTP/1/2 client/server.
- `attohttpc`: blocking, minimal.

## Serialization

- `serde`: the universal serialize/deserialize framework. Almost every type derives `Serialize`/`Deserialize`.
- `serde_json`: JSON.
- `serde_yaml`: YAML.
- `toml`/`toml_edit`: TOML config.
- `rmp-serde`: MessagePack.
- `bincode`: Rust-native binary (fast, not portable).
- `postcard`: compact embedded-friendly binary.
- `ciborium`: CBOR.

## Database

- `sqlx`: async, compile-time checked SQL via macros.
- `diesel`: ORM, sync, mature.
- `sea-orm`: async ORM on top of `sqlx`.
- `tokio-postgres`: async PostgreSQL client.
- `rusqlite`: sync SQLite.
- `redis`: Redis client.
- `mongodb`: official driver.

## Async Runtime

- `tokio`: default for most projects.
- `async-std`: std-mirror API.
- `smol`: minimal.
- `embassy`: `no_std` for embedded.

## CLI Parsing

- `clap`: de facto standard. Derive API is ergonomic.
- `argh`: Google's lightweight derive-based.
- `gumdrop`: minimal.
- `pico-args`: tiny, no derive.

### Plus CLI helpers

- `indicatif`: progress bars.
- `dialoguer`: interactive prompts.
- `console`/`owo-colors`: terminal colors.
- `comfy-table`/`tabled`: tables.

## Logging & Tracing

- `log`: facade, simple `info!`/`warn!` macros.
- `env_logger`: backend for `log` controlled by `RUST_LOG`.
- `tracing`: structured, async-aware, spans. Modern choice.
- `tracing-subscriber`: subscriber setup for `tracing`.
- `slog`: structured logging, less common now.

## Testing

- Built-in (`cargo test`).
- `proptest`: property-based.
- `quickcheck`: property-based (older).
- `rstest`: parametrized tests.
- `mockall`: mock generation.
- `mockito`: HTTP mock server.
- `wiremock`: HTTP mock (async).
- `insta`: snapshot testing.
- `criterion`: benchmarking.
- `cargo-nextest`: faster test runner.
- `trybuild`: UI tests for compile errors.
- `cargo-mutants`: mutation testing.

## Fuzzing

- `cargo-fuzz`: libFuzzer-based.
- `afl.rs`: AFL-based.
- `rutensprika`/`bolero`: alternatives.

## Cryptography

- `ring`: popular, audited.
- `rustls`: TLS in Rust (uses `ring`).
- `openssl`/`openssl-sys`: OpenSSL bindings.
- `argon2`: password hashing.
- `bcrypt`/`scrypt`: alternatives.
- `sha2`/`sha3`/`blake3`: hash functions.
- `chacha20poly1305`/`aes-gcm`: AEAD ciphers.
- `ed25519-dalek`/`x25519-dalek`: elliptic curve crypto.

## Networking

- `tokio`: async runtime + TCP/UDP/Unix sockets.
- `hyper`: HTTP/1, HTTP/2.
- `quinn`: QUIC.
- `tonic`: gRPC.
- `tungstenite`/`tokio-tungstenite`: WebSocket.
- `paho-mqtt`: MQTT.
- `lapin`: AMQP (RabbitMQ).
- `rdkafka`: Kafka.

## File Formats

- `serde_json`/`serde_yaml`/`toml`.
- `csv`.
- `quick-xml`/`roxmltree`/`serde-xml-rs`.
- `serde_urlencoded`.
- `bytes`/`byteserde` for binary protocols.

## Compression

- `flate2`: gzip/deflate.
- `zstd`: Zstandard.
- `bzip2`/`lz4`/`xz2`: other algorithms.
- `snap`: Snappy.

## Serialization for Network Protocols

- `bytes` (tokio ecosystem): zero-copy byte buffers.
- `prost`/`protobuf`: Protocol Buffers.
- `capnp`/`capnpc`: Cap'n Proto.
- `flatbuffers`: FlatBuffers.

## GUI

- `egui`/`eframe`: immediate-mode, easy, cross-platform.
- `iced`: Elm-inspired, reactive.
- `slint`: declarative UI DSL, commercial-friendly.
- `tauri`: web frontend + Rust backend (Electron alternative).
- `dioxus`: React-like.
- `druid`/`xilem`: research projects.
- `gtk-rs`: GTK bindings.
- `makepad`: live-coded, GPU-rendered.

## Game Development

- `bevy`: ECS game engine, modern, popular.
- `wgpu`: portable graphics API (Vulkan/Metal/DX12/WebGPU).
- `macroquad`: simple 2D.
- `amethyst`: discontinued, see `bevy`.
- `ggez`: 2D, LÖVE-like.

## Numerical & Data Science

- `ndarray`: N-dimensional arrays.
- `nalgebra`: linear algebra.
- `plotters`: plotting.
- `polars`: DataFrames (Pandas-like, fast).
- `arrow`/`arrow2`: Apache Arrow.
- `linfa`: ML toolkit.

## Date & Time

- `chrono`: full-featured, popular.
- `time`: lighter, modern API.
- `jiff`: newer, ergonomic (by BurntSushi).

## Regex & Text

- `regex`: fast, Unicode-aware.
- `fancy-regex`: backtracking for lookahead/backreferences.
- `aho-corasick`: multiple-pattern search.
- `memchr`: byte search primitives.
- `unicode-segmentation`: grapheme/word splitting.

## Error Handling

- `thiserror`: derive `Error` for libraries.
- `anyhow`: ergonomic error type for apps.
- `eyre`: `anyhow` fork with reports.
- `color-eyre`: prettier error reports.

## Async Utilities

- `async-trait`: async in traits (still useful pre-1.75).
- `futures`/`futures-util`: combinators.
- `tokio-util`: codecs, tasks.
- `async-stream`: `yield`-like streams.

## Concurrency

- `crossbeam`: channels, epoch-based GC, scoped threads.
- `parking_lot`: faster `Mutex`/`RwLock` than std.
- `rayon`: data parallelism.
- `dashmap`: concurrent `HashMap`.
- `arc-swap`: atomic `Arc` swap.
- `loom`: concurrency model checker.

## Collections

- `indexmap`: ordered `HashMap`/`HashSet`.
- `hashbrown`: low-level hash map.
- `smallvec`/`tinyvec`: inline storage.
- `arrayvec`: stack-only fixed capacity.
- `bumpalo`: arena allocator.
- `typed-arena`: typed arena.
- `im`: persistent/immutable collections.

## Serialization Helpers

- `serde_with`: custom serde helpers.
- `serde_repr`: serialize enums as integers.
- `serde-aux`: extra helpers.

## Configuration

- `config`: multi-source config (env, file, CLI).
- `figment`: layered config (used by Rocket).
- `envy`: struct-of-env-vars via serde.
- ` envy`/` envy`/`envy`.

## HTTP Server Middleware

- `tower`: middleware abstraction.
- `tower-http`: tracing, compression, CORS, auth, fs, timeout.
- `axum::middleware`.

## WebAssembly

- `wasm-bindgen`: JS interop.
- `wasm-pack`: build & publish.
- `web-sys`/`js-sys`: bindings to Web APIs.
- `gloo`: idiomatic wrappers.
- `yew`: React-like in WASM.
- `seed`: alternative.
- `leptos`: modern, signal-based.

## Embedded

- `embedded-hal`: hardware abstraction traits.
- `cortex-m`/`cortex-m-rt`: ARM Cortex.
- `embassy`: async embedded.
- `defmt`: efficient logging.
- `probe-rs`: debugging/probing.

## Parsing & DSLs

- `nom`: parser combinators.
- `pest`: PEG-based, easy.
- `lalrpop`: LR parser generator.
- `chumsky`: zero-copy parser combinators.
- `logos`: fast lexer.

## Build & Release

- `cargo-release`: versioning/publishing.
- `cargo-deny`: license/advisory checks.
- `cargo-audit`: security advisories.
- `cargo-nextest`: faster tests.
- `cargo-udeps`/`cargo-machete`: unused dep detection.
- `cargo-expand`: macro expansion.
- `cargo-bloat`: binary size analysis.
- `cargo-flamegraph`: profiling.
- `cargo-miri`: UB detection (nightly).
- `cross`: cross-compilation.
- `cargo-zigbuild`: Zig-backed cross-linker.
- `maturin`: Python package building.
- `napi-rs`: Node.js bindings.
- `wasm-pack`: WASM packaging.

## Editor Support

- `rust-analyzer`: official IDE server (VS Code, Vim, Emacs, Zed).
- `rustfmt`: formatter.
- `clippy`: linter.

## Quality Lints

- `clippy::all`: standard.
- `clippy::pedantic`: stricter.
- `clippy::nursery`: experimental.
- `clippy::cargo`: crate-level checks.

## CI Tools

- `cargo-deny`: license + advisories + bans.
- `cargo-audit`: RustSec advisories.
- `cargo-hack`: feature matrix testing.
- `cargo-mutants`: mutation testing.
- `rust-toolchain`/`dtolnay/rust-toolchain`: GitHub Actions setup.

## Choosing Crates

Heuristics:
- Prefer std/`tokio` ecosystem.
- Check `crates.io` for maintenance (last publish, downloads, open issues).
- Prefer crates with `rustls` over `openssl` (no system dep).
- Prefer `serde`-based serialization.
- For new projects: `axum` + `tokio` + `serde` + `sqlx` + `clap` + `tracing` + `anyhow` (app) or `thiserror` (lib).

## 💡 Tips & Tricks

- **Debug**: `cargo tree -d` finds duplicate versions of the same dependency pulled in transitively — a common source of unexpectedly large binaries and "why are there two versions of `tokio`" build errors.
- **Idiom**: pick `rustls` over `openssl`-backed crates when you have a choice — it removes a system-level C dependency, which simplifies cross-compilation and Docker image builds considerably.
- **Debug**: `cargo install cargo-outdated` (or `cargo update --dry-run`) shows which dependencies have newer versions available without touching your `Cargo.lock` — safer to run regularly than blindly running `cargo update`.
- **Performance**: `cargo install cargo-nextest` for local test runs — it's a drop-in replacement for `cargo test` in most workflows and parallelizes at the process level, which is usually the single biggest "make CI faster" win available for free.
- **Idiom**: when starting a new async project, `tokio` + `serde` + `anyhow` (or `thiserror` for libraries) + `tracing` is close to a de facto standard stack — deviating from it is fine, but knowing the default helps you read the vast majority of example code and Stack Overflow answers.
- **Debug**: `cargo-audit` and `cargo-deny` should run in CI, not just locally — a dependency that was safe when you `cargo add`ed it can later have a security advisory published against it, and nothing about your own code changes to reveal that.

## ⚠️ Edge Cases & Gotchas

- **`serde`'s derive macros meaningfully slow compile times at scale**: a workspace with dozens of `#[derive(Serialize, Deserialize)]` structs pays real, cumulative proc-macro expansion cost — this is invisible in a small crate but becomes one of the top contributors to `cargo build --timings` output in large codebases.
- **Picking an async runtime is a global, contagious decision**: mixing `tokio`-based and `async-std`-based crates in the same binary often doesn't work at all (they have incompatible reactors for I/O), so a transitive dependency pulling in the "wrong" runtime can force a rewrite far from where the actual incompatibility originates.
- **`unsafe`-heavy crates (`ring`, `bytes`, low-level FFI wrappers) are not automatically vetted just because they're popular**: high download counts on crates.io reflect adoption, not an audit — `cargo-crev` or `cargo vet` provide actual review-based trust signals that download counts don't.
- **Feature unification across a workspace can silently enable features you didn't ask for**: if crate A depends on `tokio` with feature `rt` and crate B (in the same workspace/build) depends on `tokio` with feature `full`, both end up compiled with the union of features — a crate can end up with more functionality (and more compiled code, more potential attack surface) than its own `Cargo.toml` implies.
- **`bincode` and other "fast" binary formats are typically not cross-version stable**: a struct serialized with `bincode` on one version of your program is not guaranteed to deserialize correctly after you reorder or add fields — unlike `serde_json`, these formats are optimized for speed within a single, static schema, not for long-term storage or wire compatibility.
- **`HashMap` (std) is intentionally not the fastest hash map**: it uses a DoS-resistant (SipHash-based) default hasher, which is slower than non-cryptographic alternatives like `FxHashMap`/`AHashMap` — reaching for `HashMap` reflexively in a performance-sensitive inner loop without considering `rustc-hash` or `ahash` is a common missed optimization.
- **Platform-independent trap — `openssl` system dependency breaks reproducible cross-compilation**: crates that link the system's `openssl` (rather than `rustls` or a vendored/statically-linked OpenSSL) build successfully on a developer's machine and then fail in a minimal Docker build image or a different CI runner that lacks the matching system OpenSSL headers/version.

## 🧠 Spot the Bug

A team adds a new dependency to speed up JSON parsing in a hot path. What's the likely problem with this `Cargo.toml` change, given the rest of the codebase already uses `tokio` for async I/O?

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

The bug isn't in the JSON parsing at all — it's `async-std` sitting alongside `tokio` in the same dependency list.

`tokio` and `async-std` each ship their own async runtime with its own reactor (the component that drives I/O readiness, timers, and task scheduling). Types like `tokio::net::TcpStream` or a `tokio::time::sleep` future are only drivable by a running `tokio` executor — spawning them or `.await`ing them under an `async-std` runtime (or vice versa) typically panics at runtime with something like "there is no reactor running" rather than failing at compile time, because both runtimes present a similar-looking `async fn`/`Future` surface that the type system can't distinguish by itself. If this `async-std` dependency was pulled in transitively by some other crate the team added for an unrelated reason (rather than intentionally), the runtime-mixing bug can appear far from the `Cargo.toml` change that introduced it, and manifest only when a specific I/O code path actually executes at runtime.

**The lesson**: async runtimes are not interchangeable at the type level — accidentally depending on two of them (directly or transitively) compiles cleanly but panics at runtime the moment a runtime-specific future actually runs.

</details>

## Summary

Use the ecosystem; don't reinvent. The `tokio`-`serde`-`tower` stack underlies most server-side Rust. For new projects: pick `axum` (web), `sqlx` (DB), `clap` (CLI), `tracing` (logging), `anyhow`/`thiserror` (errors), `serde` (serialization). For tools: `rust-analyzer`, `clippy`, `cargo-deny`, `cargo-nextest`, `cargo-expand`. For fuzzing: `cargo-fuzz`. For benchmarks: `criterion`.

Next: Common pitfalls and idiomatic fixes.