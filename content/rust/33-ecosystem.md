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

## Summary

Use the ecosystem; don't reinvent. The `tokio`-`serde`-`tower` stack underlies most server-side Rust. For new projects: pick `axum` (web), `sqlx` (DB), `clap` (CLI), `tracing` (logging), `anyhow`/`thiserror` (errors), `serde` (serialization). For tools: `rust-analyzer`, `clippy`, `cargo-deny`, `cargo-nextest`, `cargo-expand`. For fuzzing: `cargo-fuzz`. For benchmarks: `criterion`.

Next: Common pitfalls and idiomatic fixes.