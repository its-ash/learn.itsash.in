# 13 — Pattern Matching

Patterns appear in `match`, `if let`, `while let`, `let`, `for` and function parameters. They both **test** a value's shape and **pull pieces out** of it.

## Pattern Cheat Sheet

::code-wrapper{language="rust"}
```rust
fn describe(n: i32) -> &'static str {
    match n {
        0 => "zero",                    // literal
        1 | 2 | 3 => "small",           // OR
        4..=9 => "medium",              // inclusive range
        i32::MIN..=-1 => "negative",
        _ => "large",                   // anything else
    }
}

fn main() {
    for n in [0, 2, 7, -5, 100] {
        println!("{n}: {}", describe(n));
    }
    let c = 'q';
    let half = match c {
        'a'..='m' => "first half",      // char ranges work too
        'n'..='z' => "second half",
        _ => "other",
    };
    println!("{half}");                 // second half
}
```
::

## Destructuring

::code-wrapper{language="rust"}
```rust
struct Point { x: i32, y: i32, z: i32 }

fn main() {
    // tuples and arrays
    let ((a, b), [c, _, e]) = ((1, 2), [3, 4, 5]);
    println!("{a} {b} {c} {e}");        // 1 2 3 5

    // structs — `..` ignores the remaining fields
    let p = Point { x: 1, y: 0, z: 9 };
    match p {
        Point { y: 0, x, .. } => println!("on the x-axis at {x}"),
        Point { x, y, .. } => println!("at ({x}, {y})"),
    }

    // in function parameters
    let dist = |(x, y): (f64, f64)| (x * x + y * y).sqrt();
    println!("{}", dist((3.0, 4.0)));   // 5
}
```
::

### Slice patterns

::code-wrapper{language="rust"}
```rust
fn kind(v: &[i32]) -> String {
    match v {
        [] => "empty".into(),
        [x] => format!("one: {x}"),
        [first, .., last] => format!("{first} .. {last}"),
    }
}

fn main() {
    println!("{}", kind(&[]));          // empty
    println!("{}", kind(&[5]));         // one: 5
    println!("{}", kind(&[1, 2, 3]));   // 1 .. 3
}
```
::

## Bindings With `@` and Guards With `if`

::code-wrapper{language="rust"}
```rust
fn main() {
    let age = 15;
    match age {
        n @ 13..=19 => println!("teenager, {n}"),   // test a range AND keep the value
        n if n < 13 => println!("child, {n}"),       // guard: any boolean condition
        n => println!("adult, {n}"),
    }

    let pair = (0, -2);
    match pair {
        (0, n) | (n, 0) => println!("on an axis at {n}"),   // both sides must bind the same names
        _ => println!("off the axes"),
    }
}
```
::

**Tricky**: a guard applies to the **whole** `|` group, not just the last value:

::code-wrapper{language="rust"}
```rust
fn main() {
    let x = 4;
    let y = false;
    match x {
        4 | 5 | 6 if y => println!("yes"),   // means (4 | 5 | 6) if y — NOT 4 | 5 | (6 if y)
        _ => println!("no"),
    }
    // prints "no"
}
```
::

## The Variable-Name Trap

**Tricky**: a plain name in a pattern **creates a new variable** that matches anything. It does not compare with an existing variable:

::code-wrapper{language="rust"}
```rust
fn main() {
    let expected = 5;
    let got = 7;
    match got {
        expected => println!("matched {expected}"),   // binds a NEW `expected` = 7
    }
    // prints "matched 7" — and adding more arms after it gives "unreachable pattern"
}
```
::

Compare with a guard or a constant:

::code-wrapper{language="rust"}
```rust
const EXPECTED: i32 = 5;

fn main() {
    let expected = 5;
    let got = 7;
    match got {
        n if n == expected => println!("equal"),
        _ => println!("different"),        // printed
    }
    match got {
        EXPECTED => println!("equal"),     // UPPER_CASE consts ARE compared
        _ => println!("different"),        // printed
    }
}
```
::

## Move or Borrow?

**Tricky**: matching on a value moves its contents; matching on a reference borrows them:

::code-wrapper{language="rust"}
```rust
fn main() {
    let opt = Some(String::from("hi"));

    if let Some(s) = &opt {         // s: &String — borrow
        println!("{s}");
    }
    println!("{opt:?}");            // still usable

    if let Some(s) = opt {          // s: String — moved out
        println!("{s}");
    }
    // println!("{opt:?}");         // error[E0382]: borrow of partially moved value: `opt`
}
```
::

Mutating through a match:

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut scores = vec![Some(1), None, Some(3)];
    for slot in &mut scores {
        if let Some(n) = slot {     // n: &mut i32
            *n *= 10;
        }
    }
    println!("{scores:?}");         // [Some(10), None, Some(30)]
}
```
::

## Strings in Patterns

**Tricky**: you can't match a `String` against string literals directly:

::code-wrapper{language="rust"}
```rust
fn main() {
    let cmd = String::from("quit");
    // match cmd { "quit" => {}, _ => {} }   // error[E0308]: mismatched types — expected `String`, found `&str`
    match cmd.as_str() {
        "quit" | "exit" => println!("bye"),
        other => println!("unknown: {other}"),
    }
}
```
::

## Refutable vs Irrefutable

`let` needs a pattern that **always** matches:

::code-wrapper{language="rust"}
```rust
fn main() {
    let opt = Some(1);
    // let Some(x) = opt;       // error[E0005]: refutable pattern in local binding
    //                          // help: you might want to use `let...else`
    let Some(x) = opt else { return };
    println!("{x}");

    let (a, b) = (1, 2);        // irrefutable — a tuple always has 2 parts
    println!("{a} {b}");
}
```
::

## 💡 Tips & Tricks

- **Idiom** — `match s.as_str()` to match a `String` against literals.
- **Idiom** — `let ... else` for "extract or bail"; `if let` when the `else` path is small.
- **Idiom** — `..` in struct and slice patterns to skip the parts you don't need.
- **Idiom** — `n @ 1..=9` keeps the matched value while testing a range.
- **Lint** — "unreachable pattern" warnings usually mean an earlier arm (often a bare name) catches everything.

## ⚠️ Edge Cases & Gotchas

- **Names bind** — `match x { y => ... }` never compares with an outer `y`; it creates a new one.
- **Constants compare** — `UPPER_CASE` consts and enum variants in patterns are compared, not bound.
- **Guards** — `a | b if cond` applies `cond` to both `a` and `b`.
- **Moves** — `if let Some(s) = opt` moves `s` out of `opt`; use `&opt`.
- **Strings** — `String` vs `&str` patterns need `.as_str()`.
- **Exhaustiveness** — guards never count toward covering all cases (chapter 06).

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
fn check(code: u16, ok_code: u16) -> &'static str {
    match code {
        ok_code => "success",
        _ => "failure",
    }
}

fn main() {
    println!("{}", check(500, 200));
}
```
::

<details>
<summary>Answer</summary>

Prints `success`. `ok_code` in the pattern is a **new variable** that matches any value — it shadows the parameter. The compiler warns `unreachable pattern` on the `_` arm.

Fix with a guard:

::code-wrapper{language="rust"}
```rust
fn check(code: u16, ok_code: u16) -> &'static str {
    match code {
        c if c == ok_code => "success",
        _ => "failure",
    }
}
```
::

Or just use `if code == ok_code { ... }`.

</details>

## 🧠 Quick Quiz

::code-wrapper{language="rust"}
```rust
fn main() {
    let v = [1, 2, 3, 4];
    if let [a, .., b] = v {
        println!("{}", a + b);
    }
    let t = (1, (2, 3));
    let (x, (_, z)) = t;
    println!("{}", x * z);
}
```
::

<details>
<summary>Answer</summary>

`5` then `3`. The slice pattern takes the first (1) and last (4); the nested tuple pattern skips the 2.

</details>

## Summary

Patterns test shape and extract data. Use `|`, ranges, `@` and guards for precise arms; remember that a bare name always binds (never compares) and that matching on a value moves its contents.

Next: Collections.
