# 02 — Hello World & Cargo

## Hello, World

::code-wrapper{language="rust" filename="src/main.rs"}
```rust
fn main() {
    println!("Hello, world!");
}
```
::

`println!` ends in `!` because it is a **macro**, not a function. The compiler checks the format string against the arguments **at compile time**:

::code-wrapper{language="rust"}
```rust
fn main() {
    let name = "Ferris";
    println!("Hello, {name}!");          // OK
    // println!("Hello, {}!");           // error: 1 positional argument in format string, but no arguments were given
    // println!("{} {}", name);          // error: 2 positional arguments in format string, but there is 1 argument
}
```
::

## Formatting Cheat Sheet

::code-wrapper{language="rust"}
```rust
fn main() {
    let name = "Ferris";
    let n = 42;

    println!("{{name}} = {name}");          // {name} = Ferris   ← {{ }} print literal braces
    println!("[{n:5}] [{n:<5}] [{n:05}]");  // [   42] [42   ] [00042]
    println!("{:.2}", 3.14159);             // 3.14
    println!("{:?} {}", "hi", "hi");        // "hi" hi            ← Debug shows quotes
    println!("{0} {1} {0}", "a", "b");      // a b a              ← reuse by index
    println!("{:x} {:b} {:#x}", 255, 5, 255); // ff 101 0xff
    println!("{:#?}", (1, "x"));            // pretty, multi-line Debug

    print!("no newline ");                  // print! does not add \n
    eprintln!("this goes to stderr");       // errors/logs → stderr
}
```
::

**Tricky**: `{}` needs the `Display` trait, `{:?}` needs `Debug`. A `Vec` has only `Debug`:

::code-wrapper{language="rust"}
```rust
fn main() {
    let v = vec![1, 2, 3];
    println!("{v:?}");     // [1, 2, 3]
    // println!("{v}");    // error[E0277]: `Vec<{integer}>` doesn't implement `std::fmt::Display`
}
```
::

## Cargo Basics

::code-wrapper{language="bash"}
```bash
cargo new hello          # creates hello/Cargo.toml and hello/src/main.rs, plus git init
cd hello
cargo run                # build (debug) + run
cargo check              # type-check only — much faster than build
cargo build --release    # optimized binary in target/release/
cargo test               # run tests
cargo run -- --verbose   # everything after -- goes to YOUR program
```
::

**Tricky**: without `--`, Cargo tries to read the flag itself:

::code-wrapper{language="bash"}
```bash
cargo run --verbose      # Cargo becomes verbose; your program gets no arguments
cargo run -- --verbose   # your program receives "--verbose"
```
::

## `Cargo.toml` vs `Cargo.lock`

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[package]
name = "hello"
version = "0.1.0"
edition = "2024"

[dependencies]
rand = "0.8"        # means >=0.8.0, <0.9.0  (caret rule)
serde = { version = "1", features = ["derive"] }

[dev-dependencies]  # only for tests/examples/benches
pretty_assertions = "1"
```
::

- `Cargo.toml` — the versions you **accept**.
- `Cargo.lock` — the exact versions that were **built**. Commit it for apps.

**Tricky**: the caret rule is stricter below `1.0`:

| Written | Accepts |
|---|---|
| `"1.2"` | `>=1.2.0, <2.0.0` |
| `"0.8"` | `>=0.8.0, <0.9.0` ← a 0.x minor bump is "breaking" |
| `"0.0.3"` | exactly `0.0.3` |
| `"=1.2.3"` | exactly `1.2.3` |

::code-wrapper{language="bash"}
```bash
cargo add rand            # add a dependency (edits Cargo.toml)
cargo update -p rand      # update one crate inside the allowed range
cargo build --locked      # fail if Cargo.lock is out of date — use in CI
cargo tree                # show the dependency tree
```
::

## Multiple Binaries

::code-wrapper{language="bash"}
```bash
src/
├── main.rs          # binary "hello"
└── bin/
    └── tool.rs      # binary "tool" — found automatically
```
::

::code-wrapper{language="bash"}
```bash
cargo run --bin tool
cargo run            # error: `cargo run` could not determine which binary to run
                     # (when there are 2+ binaries and no default-run set)
```
::

## Compile-Time Environment

::code-wrapper{language="rust"}
```rust
fn main() {
    // env!  → read at COMPILE time (set by Cargo); missing → compile error
    println!("version {}", env!("CARGO_PKG_VERSION"));

    // std::env::var → read at RUN time; missing → Err
    match std::env::var("HOME") {
        Ok(home) => println!("home = {home}"),
        Err(e) => println!("no HOME: {e}"),
    }
}
```
::

## 💡 Tips & Tricks

- **Speed** — use `cargo check` while coding; it skips code generation.
- **Debug** — `rustc --explain E0382` prints a full explanation of any error code.
- **Tooling** — `cargo clippy` and `cargo fmt` before every commit.
- **Idiom** — `{name}` inline captures (Rust 2021+) are cleaner than `{}` with a trailing argument.
- **Tooling** — `cargo tree -d` shows crates included in two different versions.

## ⚠️ Edge Cases & Gotchas

- **Format** — `{}` needs `Display`; most collections and your own structs only get `Debug` (`{:?}`) via `#[derive(Debug)]`.
- **Format** — to print a literal `{`, write `{{`.
- **Args** — `cargo run --flag` passes the flag to Cargo; use `cargo run -- --flag`.
- **Versions** — `"0.8"` will never update to `0.9`. Pre-1.0 crates treat minor bumps as breaking.
- **Env** — `env!("X")` is baked in at compile time; changing `X` later has no effect until you rebuild.
- **Lockfile** — without `--locked`, `cargo build` silently updates an out-of-date `Cargo.lock`.

## 🧠 Quick Quiz

What does this print?

::code-wrapper{language="rust"}
```rust
fn main() {
    let x = 7;
    println!("{{{x}}}");
    println!("[{x:>3}]");
    println!("{:?}", "a\"b");
}
```
::

<details>
<summary>Answer</summary>

::code-wrapper{language="bash"}
```bash
{7}
[  7]
"a\"b"
```
::

`{{` and `}}` are literal braces around the `{x}` placeholder. `>3` right-aligns in width 3. `Debug` for strings adds quotes and escapes the inner quote.

</details>

## Summary

`println!` is a compile-checked macro. Cargo builds, runs, tests and manages dependencies; `Cargo.toml` says what you accept, `Cargo.lock` records what you built.

Next: Variables & Mutability.
