# 24 — Macros

A **macro** writes code for you at compile time. You already use many: `println!`, `vec!`, `format!`, `assert_eq!`, `#[derive(Debug)]`.

Two kinds:

- **Declarative** (`macro_rules!`) — pattern → code templates. Covered here.
- **Procedural** (`#[derive(...)]`, `#[tokio::main]`, `sql!(...)`) — Rust functions that transform code; written in a separate crate.

## Your First Macro

::code-wrapper{language="rust"}
```rust
macro_rules! square {
    ($x:expr) => { $x * $x };
}

fn main() {
    println!("{}", square!(4));       // 16
    println!("{}", square!(1 + 2));   // 9
}
```
::

**Tricky (good surprise)**: `square!(1 + 2)` is `9`, not `5` like a C macro would give. `$x:expr` captures `1 + 2` as **one** expression, so the result is `(1 + 2) * (1 + 2)`.

**Tricky (bad surprise)**: the argument is pasted twice, so it **runs** twice:

::code-wrapper{language="rust"}
```rust
macro_rules! square {
    ($x:expr) => { $x * $x };
}

fn main() {
    let mut n = 0;
    let mut next = || { n += 1; n };
    println!("{}", square!(next()));   // 2 — it's next() * next() = 1 * 2
}
```
::

Evaluate once into a variable:

::code-wrapper{language="rust"}
```rust
macro_rules! square {
    ($x:expr) => {{
        let v = $x;      // evaluated exactly once
        v * v
    }};
}
```
::

## Fragment Types

| Fragment | Matches |
|---|---|
| `$x:expr` | an expression: `1 + 2`, `foo()`, `vec![1]` |
| `$i:ident` | a name: `count`, `MyType` |
| `$t:ty` | a type: `i32`, `Vec<String>` |
| `$l:literal` | a literal: `5`, `"hi"` |
| `$b:block` | `{ ... }` |
| `$p:pat` | a pattern: `Some(x)`, `1..=5` |
| `$tt:tt` | any single token tree |

## Repetition

::code-wrapper{language="rust"}
```rust
macro_rules! my_vec {
    () => { Vec::new() };
    ($($x:expr),+ $(,)?) => {{          // one or more, comma-separated, optional trailing comma
        let mut v = Vec::new();
        $( v.push($x); )+               // repeat once per captured $x
        v
    }};
}

macro_rules! hashmap {
    ($($k:expr => $v:expr),* $(,)?) => {{
        let mut m = std::collections::HashMap::new();
        $( m.insert($k, $v); )*
        m
    }};
}

fn main() {
    let v: Vec<i32> = my_vec![1, 2, 3,];
    let e: Vec<i32> = my_vec![];
    let m = hashmap! { "a" => 1, "b" => 2 };
    println!("{v:?} {e:?} {}", m["b"]);   // [1, 2, 3] [] 2
}
```
::

- `*` = zero or more, `+` = one or more, `?` = zero or one.

### Recursion

::code-wrapper{language="rust"}
```rust
macro_rules! maximum {
    ($x:expr) => { $x };
    ($x:expr, $($rest:expr),+) => {{
        let a = $x;
        let b = maximum!($($rest),+);   // the macro calls itself
        if a > b { a } else { b }
    }};
}

fn main() {
    println!("{}", maximum!(3, 9, 4));  // 9
}
```
::

## Arm Order Matters

**Tricky**: the **first** arm that matches wins:

::code-wrapper{language="rust"}
```rust
macro_rules! describe {
    ($x:expr) => { "expression" };
    (hello) => { "the word hello" };    // never reached — `hello` is also a valid expr
}

fn main() {
    println!("{}", describe!(hello));   // expression
}
```
::

Put specific arms **before** general ones.

## Hygiene

Variables created inside a macro don't leak out, and can't clash with yours:

::code-wrapper{language="rust"}
```rust
macro_rules! make_x {
    () => { let x = 99; };
}

fn main() {
    let x = 1;
    make_x!();
    println!("{x}");   // 1 — the macro's `x` is a different variable
}
```
::

## Definition Order

**Tricky**: inside one file, a `macro_rules!` must be defined **above** where it's used:

::code-wrapper{language="rust"}
```rust
// fn main() { early!(); }      // error: cannot find macro `early` in this scope
// macro_rules! early { () => {} }

macro_rules! early { () => { println!("ok") } }
fn main() { early!(); }
```
::

To use a macro from another module or crate, mark it `#[macro_export]` (it then lives at the crate root: `crate::early!`).

## Handy Built-in Macros

::code-wrapper{language="rust"}
```rust
fn main() {
    println!("{}", stringify!(1 + 2));        // "1 + 2" — the code as text, not evaluated
    println!("{}", concat!("a", 1, true));    // a1true
    println!("{}:{}", file!(), line!());      // where am I?
    let x = dbg!(2 * 3);                      // prints [src/main.rs:5:13] 2 * 3 = 6
    assert!(x == 6, "x was {x}");
    let ok = matches!(x, 1..=9);
    println!("{ok}");
}

fn later() -> i32 {
    todo!("write this")                       // compiles; panics if called
}
```
::

## 💡 Tips & Tricks

- **Idiom** — reach for a function or generic first; use a macro only when a function can't do it (variable arguments, new syntax, code generation).
- **Debug** — `cargo install cargo-expand && cargo expand` shows the code after macros run.
- **Idiom** — wrap macro bodies in `{{ ... }}` so they can be used as expressions with local variables.
- **Idiom** — accept a trailing comma with `$(,)?`.
- **Idiom** — store `$x` in a local once if it is used more than once.

## ⚠️ Edge Cases & Gotchas

- **Double evaluation** — using `$x` twice runs its side effects twice.
- **Arm order** — general arms (`$x:expr`) placed first hide specific ones.
- **Order** — `macro_rules!` must appear before its use in the same file.
- **Export** — `#[macro_export]` macros are at the crate root, not in their module.
- **Errors** — mistakes inside macros produce long, confusing errors; test macros with small inputs first.
- **todo!()** — compiles fine and panics at run time; search for it before release.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
macro_rules! log_and_return {
    ($x:expr) => {
        println!("value = {}", $x);
        $x
    };
}

fn main() {
    let mut calls = 0;
    let mut tick = || { calls += 1; calls };
    let v = log_and_return!(tick());
    println!("v = {v}, calls = {calls}");
}
```
::

<details>
<summary>Answer</summary>

Two problems:

1. The body has two statements without an outer block, so as an expression (`let v = ...`) it doesn't compile — the macro expands to `println!(...); tick()` where an expression is expected.
2. Even with a block, `$x` appears twice, so `tick()` would run twice: it logs `1` but returns `2`.

Fix both:

::code-wrapper{language="rust"}
```rust
macro_rules! log_and_return {
    ($x:expr) => {{
        let v = $x;
        println!("value = {v}");
        v
    }};
}
```
::

Now it prints `value = 1` and `v = 1, calls = 1`.

</details>

## Summary

`macro_rules!` matches input patterns and pastes code. `$x:expr` keeps expressions grouped, but each use re-runs them — bind to a local first. Order arms from specific to general, and prefer plain functions when they are enough.

Next: Unsafe Rust.
