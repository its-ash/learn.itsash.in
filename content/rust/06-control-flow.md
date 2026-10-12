# 06 — Control Flow

## `if` — Conditions Must Be `bool`

::code-wrapper{language="rust"}
```rust
fn main() {
    let n = 7;
    if n % 2 == 0 {
        println!("even");
    } else if n > 5 {
        println!("odd and big");
    } else {
        println!("odd and small");
    }
}
```
::

**Tricky**: Rust has no "truthy" values:

::code-wrapper{language="rust"}
```rust
fn main() {
    let n = 1;
    // if n { }               // error[E0308]: mismatched types — expected `bool`, found integer
    let items: Vec<i32> = vec![];
    // if items { }           // also an error
    if !items.is_empty() { }  // be explicit
    if n != 0 { }
}
```
::

`if` is an expression — both branches must have the same type:

::code-wrapper{language="rust"}
```rust
fn main() {
    let n = 7;
    let parity = if n % 2 == 0 { "even" } else { "odd" };
    println!("{parity}");
    // let bad = if n > 0 { 1 } else { "no" };   // error: `if` and `else` have incompatible types
    // let bad2 = if n > 0 { 1 };                 // error: `if` without `else` has type `()`
}
```
::

## `loop` — Can Return a Value

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut n = 0;
    let found = loop {
        n += 3;
        if n > 10 {
            break n;          // the loop's value
        }
    };
    println!("{found}");      // 12
}
```
::

Only `loop` can `break` with a value. `while` and `for` always produce `()`, because they can end without reaching a `break`.

## `while` and `while let`

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut i = 0;
    while i < 3 {
        i += 1;
        if i == 2 { continue; }   // skip the rest of this pass
        print!("{i} ");           // 1 3
    }
    println!();

    let mut stack = vec![1, 2, 3];
    while let Some(top) = stack.pop() {   // runs until pop() returns None
        print!("{top} ");                 // 3 2 1
    }
    println!();
}
```
::

## `for` and Ranges

::code-wrapper{language="rust"}
```rust
fn main() {
    for i in 0..3 { print!("{i} "); }           // 0 1 2      — end excluded
    println!();
    for i in 0..=3 { print!("{i} "); }          // 0 1 2 3    — end included
    println!();
    for i in (0..5).rev() { print!("{i} "); }   // 4 3 2 1 0
    println!();
    for i in (0..10).step_by(4) { print!("{i} "); }  // 0 4 8
    println!();
    for (i, c) in "abc".chars().enumerate() { print!("{i}{c} "); }  // 0a 1b 2c
    println!();
}
```
::

**Tricky**: a "backwards" range is just **empty** — no error, no loop:

::code-wrapper{language="rust"}
```rust
fn main() {
    for i in 5..0 {
        println!("{i}");      // never runs
    }
    let v: Vec<i32> = (5..0).collect();
    println!("{v:?}");        // []
}
```
::

### Looping over a `Vec`: move, borrow, or mutate

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![String::from("a"), String::from("b")];

    for s in &v { print!("{s} "); }       // borrow — v is still usable
    for s in &mut v { s.push('!'); }      // mutable borrow
    println!("{v:?}");                    // ["a!", "b!"]

    for s in v { print!("{s} "); }        // MOVES v into the loop
    // println!("{}", v.len());           // error[E0382]: borrow of moved value: `v`
}
```
::

**Tricky**: you cannot change a collection's length while looping over it:

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![1, 2, 3];
    for x in &v {
        // v.push(*x);   // error[E0502]: cannot borrow `v` as mutable because it is also borrowed as immutable
    }
    v.retain(|&x| x != 2);   // remove while "iterating" — the safe way
    println!("{v:?}");       // [1, 3]
}
```
::

## Labeled Loops

::code-wrapper{language="rust"}
```rust
fn main() {
    let answer = 'outer: loop {
        for i in 0.. {
            if i * i > 50 {
                break 'outer i;      // exit BOTH loops with a value
            }
        }
    };
    println!("{answer}");            // 8
}
```
::

## `match` — Must Cover Every Case

::code-wrapper{language="rust"}
```rust
fn describe(n: u8) -> &'static str {
    match n {
        0 => "zero",
        1 | 2 => "small",
        3..=9 => "medium",
        _ => "large",            // `_` catches everything else
    }
}

fn main() {
    println!("{} {} {}", describe(0), describe(5), describe(200));
}
```
::

**Tricky**: if ranges cover every value, no `_` is needed:

::code-wrapper{language="rust"}
```rust
fn bucket(n: u8) -> u8 {
    match n {
        0..=127 => 0,
        128..=255 => 1,         // all 256 u8 values covered — compiles without `_`
    }
}
```
::

**Tricky**: guards (`if`) never count toward exhaustiveness, even when they obviously cover everything:

::code-wrapper{language="rust"}
```rust
fn sign(n: i32) -> i8 {
    match n {
        x if x > 0 => 1,
        x if x <= 0 => -1,
        // error[E0004]: non-exhaustive patterns: `i32::MIN..=i32::MAX` not covered
        // note: match arms with guards don't count towards exhaustivity
    }
}
```
::

**Tricky**: arms are checked top to bottom — a wide arm first hides later arms:

::code-wrapper{language="rust"}
```rust
fn tier(score: u8) -> &'static str {
    match score {
        0..=100 => "bronze",
        50..=100 => "silver",   // warning: unreachable pattern — never chosen
        _ => "gold",
    }
}
```
::

## `if let` and `let else`

::code-wrapper{language="rust"}
```rust
fn main() {
    let maybe: Option<i32> = Some(3);

    if let Some(n) = maybe {
        println!("got {n}");
    } else {
        println!("nothing");
    }

    let Some(n) = maybe else {
        panic!("required");     // must diverge
    };
    println!("{n}");
}
```
::

## 💡 Tips & Tricks

- **Idiom** — `matches!(x, 1..=10)` gives a `bool` without writing a full `match`.
- **Idiom** — `loop { ... break value; }` instead of a `while` plus a "result" variable.
- **Idiom** — iterate `&v` by default; only write `for x in v` when you are done with `v`.
- **Lint** — `#![deny(unreachable_patterns)]` turns the unreachable-arm warning into an error.
- **Idiom** — `(a..b).rev()`, not `b..a`, to count down.

## ⚠️ Edge Cases & Gotchas

- **Truthiness** — `if 1 {}` and `if vec {}` do not compile; conditions must be `bool`.
- **Ranges** — `5..0` is empty, not reversed; `0..n` excludes `n`.
- **Ownership** — `for x in v` moves `v`; use `&v` or `&mut v` to keep it.
- **Match** — guarded arms don't count for exhaustiveness; you still need `_`.
- **Match** — arm order matters; an earlier wide range makes later ones unreachable (only a warning).
- **Loops** — only `loop` can `break value`; `while`/`for` are always `()`.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
fn risk(amount: i64) -> &'static str {
    match amount {
        n if n < 10_000 => "low",
        n if n < 100_000 => "medium",
        n if n >= 100_000 => "high",
        _ => "low",          // added "just to make it compile"
    }
}
```
::

<details>
<summary>Answer</summary>

The `_` arm is required because guards don't count — but `"low"` is the **least safe** default. Any future change that leaves a gap (or a negative, corrupted amount) silently becomes "low risk".

Use plain ranges, which the compiler can check, and make the fallback the safe answer:

::code-wrapper{language="rust"}
```rust
fn risk(amount: i64) -> &'static str {
    match amount {
        i64::MIN..=-1 => "high",      // negative amounts are suspicious
        0..=9_999 => "low",
        10_000..=99_999 => "medium",
        100_000..=i64::MAX => "high", // fully covered — no `_` needed at all
    }
}
```
::

</details>

## 🧠 Quick Quiz

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut total = 0;
    for i in 1..=4 {
        if i == 3 { continue; }
        total += i;
    }
    let x = loop { break total * 2; };
    println!("{total} {x}");
}
```
::

<details>
<summary>Answer</summary>

`7 14` — the loop adds 1, 2 and 4 (skips 3), and `loop` returns `7 * 2`.

</details>

## Summary

Conditions must be `bool`. `if`, `match` and `loop` are expressions that produce values. `match` must be exhaustive, and guards never help prove that. Iterate `&v` unless you mean to consume `v`.

Next: Ownership.
