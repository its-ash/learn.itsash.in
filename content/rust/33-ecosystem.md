# 33 — The Ecosystem

Crates are found on [crates.io](https://crates.io) and documented on [docs.rs](https://docs.rs). Add one with `cargo add name`.

## A Starter Map

| Need | Popular choice | Lighter alternative |
|---|---|---|
| Serialize JSON/TOML/YAML | `serde` + `serde_json` / `toml` | — |
| Command-line arguments | `clap` (derive) | `pico-args`, `argh` |
| Errors in libraries | `thiserror` | hand-written enum |
| Errors in applications | `anyhow` | `Box<dyn Error>` |
| Async runtime | `tokio` | `smol` |
| HTTP client | `reqwest` (async) | `ureq` (blocking) |
| Web server | `axum` | `actix-web` |
| Database | `sqlx` | `rusqlite`, `diesel` |
| Logging | `tracing` + `tracing-subscriber` | `log` + `env_logger` |
| Random numbers | `rand` | `fastrand` |
| Dates and times | `chrono` | `time`, `jiff` |
| Data-parallel loops | `rayon` | `std::thread::scope` |
| Benchmarks | `criterion` | `divan` |

## `serde` — Serialization

::code-wrapper{language="rust"}
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct User {
    name: String,
    #[serde(default)]                // missing → false (bool's Default)
    admin: bool,
    #[serde(rename = "e-mail")]      // JSON key differs from the Rust name
    email: Option<String>,
}

fn main() {
    let u: User = serde_json::from_str(r#"{"name":"Ada","extra":42}"#).unwrap();
    println!("{u:?}");     // User { name: "Ada", admin: false, email: None }
    println!("{}", serde_json::to_string(&u).unwrap());
    // {"name":"Ada","admin":false,"e-mail":null}
}
```
::

**Tricky** behaviors worth knowing (same `User` struct as above):

::code-wrapper{language="rust"}
```rust
fn main() {
    // 1. Unknown fields ("extra" above) are IGNORED by default — typos in config keys pass silently.
    //    Add #[serde(deny_unknown_fields)] to the struct to reject them.

    // 2. A missing non-Option field without #[serde(default)] is an error:
    let e = serde_json::from_str::<User>(r#"{"admin":true}"#);
    println!("{}", e.unwrap_err());   // missing field `name` at line 1 column 14

    // 3. Option<T> fields may be missing even WITHOUT #[serde(default)] → None.

    // 4. Wrong types are errors, not conversions:
    let e2 = serde_json::from_str::<User>(r#"{"name":5}"#);
    println!("{}", e2.unwrap_err());  // invalid type: integer `5`, expected a string
}
```
::

## `clap` — Command-Line Arguments

::code-wrapper{language="rust"}
```rust
use clap::Parser;

/// Greets people.
#[derive(Parser, Debug)]
struct Args {
    /// How many times to greet
    #[arg(short, long, default_value_t = 1)]
    count: u32,
    /// Who to greet
    name: String,
}

fn main() {
    let args = Args::parse();           // reads std::env::args, exits with help on error
    for _ in 0..args.count {
        println!("hello {}", args.name);
    }
}
```
::

::code-wrapper{language="bash"}
```bash
cargo run -- --count 2 bob     # hello bob (twice)
cargo run -- --help            # generated from the /// comments
cargo run -- --count x bob     # error: invalid value 'x' for '--count <COUNT>'
```
::

## `anyhow` and `thiserror`

::code-wrapper{language="rust"}
```rust
// Library: precise error types callers can match on
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("file not found: {0}")]
    Missing(String),
    #[error("bad number")]
    Parse(#[from] std::num::ParseIntError),   // `?` converts automatically
}

// Application: one error type for everything, plus context messages
use anyhow::Context;

fn main() -> anyhow::Result<()> {
    let text = std::fs::read_to_string("port.txt").context("reading port.txt")?;
    let port: u16 = text.trim().parse().context("port.txt must contain a number")?;
    println!("{port}");
    Ok(())
}
```
::

**Tricky**: don't return `anyhow::Error` from a library — callers can no longer `match` on what went wrong.

## Logging

::code-wrapper{language="rust"}
```rust
fn main() {
    log::info!("starting");      // prints NOTHING — no logger installed!
}
```
::

**Tricky**: `log` and `tracing` are only front-ends. Without a backend, every message is silently dropped:

::code-wrapper{language="rust"}
```rust
fn main() {
    env_logger::init();          // backend — reads RUST_LOG
    log::info!("starting");      // shown with: RUST_LOG=info cargo run
}
```
::

## Choosing a Crate

- **Activity** — recent releases, issues answered.
- **Downloads** — popularity, not a security audit.
- **Dependencies** — `cargo tree` after adding; some crates pull in dozens more.
- **Features** — turn off what you don't need: `default-features = false`.
- **Security** — run `cargo audit` (known vulnerabilities) and `cargo deny` (licenses, duplicates) in CI.

## 💡 Tips & Tricks

- **Tooling** — `cargo add`, `cargo tree`, `cargo tree -d` (duplicate versions), `cargo update -p name`.
- **Tooling** — `cargo audit` and `cargo outdated` keep dependencies healthy.
- **Idiom** — `thiserror` for libraries, `anyhow` for binaries.
- **Idiom** — `#[serde(deny_unknown_fields)]` on config structs to catch typos.
- **Idiom** — pick one async runtime (usually Tokio) for the whole project.

## ⚠️ Edge Cases & Gotchas

- **serde** — unknown fields are ignored unless you deny them.
- **serde** — `Option` fields default to `None` when missing; other fields error unless `#[serde(default)]`.
- **Logging** — `log`/`tracing` macros do nothing without an initialized subscriber/logger.
- **Runtimes** — mixing Tokio and another runtime compiles, then fails at run time ("no reactor running").
- **Formats** — `bincode`-style formats have no field names; changing a struct breaks old saved data. Use JSON or another self-describing format for anything stored long-term.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
#[derive(serde::Deserialize, Debug)]
struct Config {
    port: u16,
    #[serde(default)]
    debug: bool,
}

fn main() {
    let cfg: Config = toml::from_str("port = 8080\ndebgu = true").unwrap();
    println!("{cfg:?}");
}
```
::

<details>
<summary>Answer</summary>

Prints `Config { port: 8080, debug: false }`. The key is misspelled (`debgu`), serde ignores unknown keys, and `debug` falls back to its default. The user thinks debug mode is on; it isn't.

Reject unknown keys:

::code-wrapper{language="rust"}
```rust
#[derive(serde::Deserialize, Debug)]
#[serde(deny_unknown_fields)]
struct Config {
    port: u16,
    #[serde(default)]
    debug: bool,
}
// Error: unknown field `debgu`, expected `port` or `debug`
```
::

</details>

## Summary

The ecosystem covers almost every need; a few crates (`serde`, `clap`, `tokio`, `anyhow`/`thiserror`, `tracing`) show up in nearly every project. Learn their defaults — serde ignores unknown fields, loggers need a backend — and audit what you add.

Next: Common Pitfalls.
