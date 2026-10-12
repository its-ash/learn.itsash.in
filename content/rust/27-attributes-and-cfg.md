# 27 — Attributes & `cfg`

An **attribute** is metadata in `#[...]` that tells the compiler something about the next item. `#![...]` (with `!`) applies to the **whole enclosing** module or crate.

::code-wrapper{language="rust"}
```rust
#![allow(dead_code)]          // inner: applies to this entire file/crate

#[derive(Debug)]              // outer: applies to the struct below
struct Point { x: i32, y: i32 }
```
::

## Derive

::code-wrapper{language="rust"}
```rust
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
enum Level {
    Low,
    #[default]                 // which variant Default::default() returns
    Mid,
    High,
}

#[derive(Debug, Default)]
struct Config {
    retries: u32,
    name: String,
    verbose: bool,
    level: Level,
}

fn main() {
    println!("{:?}", Config::default());
    // Config { retries: 0, name: "", verbose: false, level: Mid }
    println!("{}", Level::Low < Level::High);   // true — derived Ord follows declaration order
}
```
::

**Tricky**: derived ordering uses **declaration order**. Reordering enum variants silently changes `sort()` results and `<` comparisons.

## Lint Attributes

::code-wrapper{language="rust"}
```rust
#[allow(unused_variables)]     // silence a warning here
fn demo() { let x = 1; }

#![deny(unused_variables)]     // (at crate top) turn the warning into an error
// error: unused variable: `x`
```
::

| Level | Effect |
|---|---|
| `allow` | silent |
| `warn` | warning (default for most lints) |
| `deny` | error, but an inner `#[allow]` can override |
| `forbid` | error, and **cannot** be overridden |

## Helpful Warnings You Can Add

::code-wrapper{language="rust"}
```rust
#[must_use = "the result tells you if saving worked"]
fn save() -> bool { true }

#[deprecated(note = "use new_api instead")]
fn old_api() {}

fn main() {
    save();       // warning: unused return value of `save` that must be used
    old_api();    // warning: use of deprecated function `old_api`: use new_api instead
    let _ = save(); // `let _ =` explicitly ignores it — no warning
}
```
::

## Conditional Compilation: `#[cfg]`

Code under a false `#[cfg(...)]` is **removed before compiling**, as if it never existed:

::code-wrapper{language="rust"}
```rust
#[cfg(target_os = "macos")]
fn os() -> &'static str { "mac" }

#[cfg(target_os = "linux")]
fn os() -> &'static str { "linux" }

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn os() -> &'static str { "other" }

fn main() {
    println!("{}", os());

    #[cfg(debug_assertions)]                // only in debug builds
    println!("debug build");
}
```
::

Common conditions:

| Condition | True when |
|---|---|
| `test` | running `cargo test` |
| `debug_assertions` | debug build (not `--release`) |
| `target_os = "windows"` | building for Windows |
| `unix` / `windows` | building for that family |
| `target_pointer_width = "64"` | 64-bit target |
| `feature = "json"` | Cargo feature `json` is on (chapter 28) |

Combine with `all(...)`, `any(...)`, `not(...)`.

## `cfg!()` vs `#[cfg]`

**Tricky**: the `cfg!()` macro is just a `true`/`false` value — **both branches are still compiled**:

::code-wrapper{language="rust"}
```rust
#[cfg(windows)]
fn win_only() {}

fn main() {
    // if cfg!(windows) { win_only(); }
    // On macOS/Linux: error[E0425]: cannot find function `win_only` in this scope
    // — the call is still compiled, but the function was removed.

    #[cfg(windows)]
    win_only();                 // correct: the call is removed together with the function

    if cfg!(debug_assertions) { // fine when both branches compile everywhere
        println!("debug");
    }
}
```
::

**Tricky**: `not(target_os = "linux")` is not "Windows" — it also matches macOS, FreeBSD, wasm, Android…

**Tricky**: a typo in a cfg name is not an error by itself — `#[cfg(featrue = "json")]` is simply always false. Cargo now warns: `unexpected cfg condition name`. Read those warnings.

## Other Useful Attributes

::code-wrapper{language="rust"}
```rust
#[inline]                         // hint: copy this small function into callers
fn square(x: i32) -> i32 { x * x }

#[non_exhaustive]                 // other crates must use `_` when matching — you may add variants later
pub enum Error { NotFound, Timeout }

#[repr(C)]                        // C-compatible layout (chapter 11, 26)
struct Header { tag: u8, len: u32 }

#[cfg(test)]                      // compiled only for `cargo test` (chapter 21)
mod tests {}

#[test]
#[ignore = "slow"]
fn big_test() {}
```
::

## 💡 Tips & Tricks

- **Debug** — `rustc --print cfg` lists every `cfg` value active for your target.
- **Idiom** — `#[must_use]` on functions whose result is the whole point (builders, `Result`-like status values).
- **Idiom** — `#[cfg(test)]` helpers and test-only dependencies keep release binaries small.
- **Idiom** — `#![deny(warnings)]` belongs in CI flags (`RUSTFLAGS="-D warnings"`), not in library source.
- **Idiom** — prefer `#[cfg]` over `cfg!()` whenever the code inside only exists on some platforms.

## ⚠️ Edge Cases & Gotchas

- **cfg!()** — both branches must compile on every platform.
- **not(...)** — `not(linux)` includes many platforms, not just the one you're thinking of.
- **Typos** — a misspelled cfg is silently false (Cargo warns about unknown names).
- **Derive order** — derived `PartialOrd`/`Ord` follow field/variant order; reordering changes behavior.
- **forbid** — can't be relaxed later with `#[allow]`, even for one line.
- **debug_assertions** — code under it disappears in release; never put real logic there.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
fn validate(amount: i64) -> i64 {
    #[cfg(debug_assertions)]
    if amount < 0 {
        panic!("negative amount");
    }
    amount
}
```
::

<details>
<summary>Answer</summary>

The negative-amount check only exists in debug builds. In production (`--release`) it is removed entirely, and negative amounts pass straight through. Tests pass (they run in debug), production is wrong.

Real validation must exist in every build:

::code-wrapper{language="rust"}
```rust
fn validate(amount: i64) -> Result<i64, String> {
    if amount < 0 {
        return Err("negative amount".into());
    }
    Ok(amount)
}
```
::

Use `debug_assertions` / `debug_assert!` only for extra self-checks you're happy to lose in release.

</details>

## Summary

Attributes configure items: `derive` generates code, lint levels control warnings, `#[must_use]`/`#[deprecated]` guide callers, and `#[cfg]` removes code per platform or build. Remember that `cfg!()` still compiles both branches.

Next: Cargo Features.
