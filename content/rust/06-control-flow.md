# 06 — Control Flow

`if`/`match`/`loop`/`while`/`for` as **expressions** eliminates whole bug classes (forgetting to assign a branch's result) at the cost of stricter type unification. `match` exhaustiveness applies the same idea to data modeling — the compiler refuses to let you forget a case.

## Under-the-Hood Mechanics

### Every branch produces MIR that must unify to one type

::code-wrapper{language="rust"}
```rust
fn main() {
    let n = 5;
    let sign = if n > 0 { 1 } else { -1 };   // both arms must agree on type — same destination place
    println!("{sign}");
}
```
::

### `match` compiles to a decision tree, not a linear scan

::code-wrapper{language="rust"}
```rust
fn classify(x: i32) -> &'static str {
    match x {
        0 => "zero",             // dense integer matches without guards -> often a jump table, O(1)
        1 | 2 => "small",
        3..=9 => "medium",
        n if n < 100 => "big",   // guard: breaks jump-table optimization AND exhaustiveness proof
        _ => "huge",             // required even though guards "look like" they cover everything
    }
}
```
::

### Only `loop` may `break` with a value

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut counter = 0;
    let result = loop {
        counter += 1;
        if counter == 10 { break counter * 2; }   // loop: no implicit exit, so a value CAN be assigned
    };
    println!("{result}");

    // let x = while counter < 20 { counter += 1; };  // while's implicit exit has no value -> type is ()
    // let y = for i in 0..5 {};                        // same: for is ALWAYS type ()
}
```
::

### `?` desugars through the `Try` trait, not a special case per type

::code-wrapper{language="rust"}
```rust
use std::num::ParseIntError;

fn parse_and_double(s: &str) -> Result<i32, ParseIntError> {
    let n: i32 = s.parse()?;   // Continue(val) unwraps; Break(residual) triggers early return
    Ok(n * 2)
}

#[derive(Debug)]
struct AppError(String);
impl From<ParseIntError> for AppError {
    fn from(e: ParseIntError) -> Self { AppError(e.to_string()) }
}

fn parse_via_conversion(s: &str) -> Result<i32, AppError> {
    let n: i32 = s.parse()?;   // ? silently calls AppError::from(ParseIntError) here
    Ok(n)
}
```
::

## Cost, Performance, and Trade-Offs

::code-wrapper{language="rust"}
```rust
fn forever() -> ! {
    loop {}          // compiler KNOWS this is unconditionally infinite — proves `-> !` directly
}

fn forever_while() -> ! {
    while true {}    // LLVM must independently PROVE the condition never changes to get the same benefit
    unreachable!()
}
```
::

::code-wrapper{language="rust"}
```rust
// A blanket, overly permissive From impl erases error specificity at every ? call site:
#[derive(Debug)]
enum BroadError { Other(String) }
impl<E: std::error::Error> From<E> for BroadError {
    fn from(e: E) -> Self { BroadError::Other(e.to_string()) }
    // Every fallible call in a function now collapses to the SAME variant — an on-call
    // engineer can't tell which of five failure modes actually happened from the log.
}
```
::

::code-wrapper{language="rust"}
```rust
'outer: for i in 0..10 {
    for j in 0..10 {
        if i * j > 50 { break 'outer; }   // zero runtime cost — ordinary conditional jump to a block
    }
}
```
::

## Production Failure Modes & Anti-Patterns

**Anti-pattern: relying on `match` arm order for correctness when patterns overlap.**

::code-wrapper{language="rust"}
```rust
fn tier(score: u32) -> &'static str {
    match score {
        0..=100 => "bronze",
        50..=100 => "silver",   // unreachable — compiler warns, but easy to miss in a big match
        _ => "gold",
    }
}
```
::

::code-wrapper{language="rust"}
```rust
#![deny(unreachable_patterns)]   // promote the warning to a hard build failure

fn tier(score: u32) -> &'static str {
    match score {
        50..=100 => "silver",
        0..=49 => "bronze",
        _ => "gold",
    }
}
```
::

**Anti-pattern: assuming `?`'s error conversion is happening when it silently isn't, or too broadly.**

::code-wrapper{language="rust"}
```rust
#[derive(Debug)]
enum ConfigError { Io(std::io::Error), Parse(toml::de::Error) }

impl From<std::io::Error> for ConfigError {
    fn from(e: std::io::Error) -> Self { ConfigError::Io(e) }
}
impl From<toml::de::Error> for ConfigError {
    fn from(e: toml::de::Error) -> Self { ConfigError::Parse(e) }
}

fn load_config(path: &str) -> Result<Config, ConfigError> {
    let raw = std::fs::read_to_string(path)?;    // requires ConfigError: From<io::Error>
    let config: Config = toml::from_str(&raw)?;  // requires ConfigError: From<toml::de::Error>
    Ok(config)
}
struct Config;
```
::

Prefer a specific `From` impl (or `#[from]` via `thiserror`) per real error source over a permissive blanket conversion that swallows specificity.

## Architectural Application

::code-wrapper{language="rust"}
```rust
use thiserror::Error;

#[derive(Error, Debug)]
enum LoadError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("parse error: {0}")]
    Parse(#[from] toml::de::Error),
    // Design the error enum BEFORE writing the fallible call chain, not as an afterthought.
}
```
::

::code-wrapper{language="rust"}
```rust
enum OrderStatus { Pending, Shipped, Delivered }

fn describe(status: &OrderStatus) -> &'static str {
    match status {
        OrderStatus::Pending => "pending",
        OrderStatus::Shipped => "shipped",
        OrderStatus::Delivered => "delivered",
        // NO `_` arm — adding a new variant to OrderStatus forces a compile error HERE,
        // at every match site, the moment it's added. Deliberate, not an oversight.
    }
}
```
::

::code-wrapper{language="rust"}
```rust
#[non_exhaustive]
pub enum ApiEvent { Created, Updated }
// Library author's protection: consumers MUST write `_`, because new variants can be added
// without that counting as a breaking change on the library's side.
```
::

::code-wrapper{language="rust"}
```rust
fn find_pair(grid: &[[i32; 5]; 5], target: i32) -> Option<(usize, usize)> {
    'search: for i in 0..5 {
        for j in 0..5 {
            if grid[i][j] == target {
                return Some((i, j));   // labeled loops (or early return) beat a boolean sentinel here
            }
        }
    }
    None
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="rust"}
```rust
fn main() {
    let x = 5;
    println!("{}", matches!(x, 1..=10));   // fast boolean check without a full match block

    'outer: for i in 0..3 {
        '_inner: for j in 0..3 {           // leading underscore silences unused-label warning
            if i == j { continue 'outer; }
        }
    }
}
```
::

- **Idiom**: prefer `let-else` over `if let ... else { return; }` when the success path is the rest of the function.
- **Idiom**: `loop { ... break value; }` instead of a `while` loop plus a manually tracked result variable.
- **Performance**: prefer `loop {}` over `while true {}` for intentional infinite loops.
- **Idiom**: `#![deny(unreachable_patterns)]` turns silent match-correctness footguns into build failures.

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="rust"}
```rust
#[non_exhaustive]
pub enum Event { A, B }
// Even if your match currently covers every KNOWN variant, `_` is still required — intentional.

fn handle(e: &Event) -> &'static str {
    match e {
        Event::A => "a",
        Event::B => "b",
        _ => "unknown",   // forced by #[non_exhaustive], not an oversight in your match
    }
}
```
::

::code-wrapper{language="rust"}
```rust
fn check(n: i32) -> &'static str {
    match n {
        n if n > 10 => "big",
        // Never exhaustive on its own — compiler cannot statically evaluate arbitrary guards.
        _ => "small",
    }
}
```
::

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![1, 2, 3];
    for x in &mut v {
        *x += 1;
        // v.push(4);   // COMPILE ERROR: v is mutably borrowed for the loop's duration
    }
}
```
::

::code-wrapper{language="rust"}
```rust
enum Never {}
fn absurd(x: Never) -> i32 {
    match x {}   // legal AND exhaustive — ONLY because Never is uninhabited
}
```
::

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
fn risk_tier(amount_cents: i64) -> &'static str {
    match amount_cents {
        n if n < 10_000 => "low",
        n if n < 100_000 => "medium",
        n if n >= 100_000 => "high",
        _ => "low",   // added later "just to satisfy exhaustiveness"
    }
}
```
::

An audit finds certain high-value transactions were silently classified as low-risk. What's wrong?

<details>
<summary>Answer</summary>

The `_ => "low"` arm exists only because guards can never prove exhaustiveness — but it also catches negative/corrupted amounts and any future refactor's edge cases, defaulting the **least safe** outcome:

::code-wrapper{language="rust"}
```rust
fn risk_tier(amount_cents: i64) -> &'static str {
    match amount_cents {
        n if n < 0 => "high",          // negative/corrupted amounts are suspicious, not safe
        0..=9_999 => "low",             // plain ranges: provably exhaustive over their span
        10_000..=99_999 => "medium",
        _ => "high",                    // unclassifiable / very large amounts default to SAFE-FOR-THE-BUSINESS
    }
}
```
::

**The lesson**: the compiler-mandated fallback arm is a real design decision — defaulting a risk-sensitive fallback to the least-alarming outcome inverts the safe default it should express.

</details>

## Summary

`if`/`match`/`loop` as expressions unify branch types at the MIR level, so stray semicolons and mismatched branches are compile errors, not silent bugs — but match guards defeat both jump-table optimization and exhaustiveness proof, making the compiler-demanded fallback arm a real design decision. `?` is a generic `Try`-trait mechanism whose silent `From`-based conversion is a double-edged lever: expressive with well-designed error types, dangerously lossy with a blanket conversion.

Next: Ownership — the rules that make all of this control flow provably safe to alias and mutate, and the foundation the rest of the language builds on.
