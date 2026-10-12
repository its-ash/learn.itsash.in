# 03 — Variables & Mutability

## Immutable by Default

::code-wrapper{language="rust"}
```rust
fn main() {
    let x = 5;
    // x = 6;          // error[E0384]: cannot assign twice to immutable variable `x`

    let mut y = 5;
    y += 1;
    println!("{x} {y}");   // 5 6
}
```
::

`mut` belongs to the **name** (binding), not the value. Moving a value into a new binding can change it:

::code-wrapper{language="rust"}
```rust
fn main() {
    let v = vec![1];
    let mut w = v;     // same Vec, now through a mutable binding
    w.push(2);
    println!("{w:?}"); // [1, 2]
}
```
::

**Tricky**: `mut` does not let you change the **type**:

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut x = 5;
    // x = "hi";       // error[E0308]: mismatched types — expected integer, found `&str`
}
```
::

## Declare Now, Assign Later

::code-wrapper{language="rust"}
```rust
fn main() {
    let label;                     // no value yet, no `mut` needed
    let n = 7;
    if n > 3 {
        label = "big";
    } else {
        label = "small";
    }
    println!("{label}");           // big — assigned exactly once on every path
}
```
::

Reading before assigning is a compile error, not garbage memory:

::code-wrapper{language="rust"}
```rust
fn main() {
    let x: i32;
    // println!("{x}");   // error[E0381]: used binding `x` isn't initialized
}
```
::

## Shadowing

A new `let` with the same name creates a **new variable** that hides the old one:

::code-wrapper{language="rust"}
```rust
fn main() {
    let input = "  42  ";
    let input = input.trim();              // &str
    let input: i32 = input.parse().unwrap(); // now i32 — a different type is fine
    println!("{}", input + 1);             // 43
}
```
::

**Tricky**: shadowing inside a block ends at the block:

::code-wrapper{language="rust"}
```rust
fn main() {
    let x = 5;
    {
        let x = x * 2;
        println!("inner {x}");   // inner 10
    }
    println!("outer {x}");       // outer 5  ← the original was never changed
}
```
::

Compare with `mut`, which really changes the one variable:

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut x = 5;
    {
        x = x * 2;
    }
    println!("{x}");   // 10
}
```
::

**Tricky**: shadowing does **not** destroy the old value early. Both live until the end of scope, and drop in reverse order:

::code-wrapper{language="rust"}
```rust
struct Loud(&'static str);
impl Drop for Loud {
    fn drop(&mut self) { println!("drop {}", self.0); }
}

fn main() {
    let s = Loud("a");
    let s = Loud("b");      // "a" is hidden, not dropped
    let _ = Loud("c");      // `_` does NOT bind → dropped immediately
    let _d = Loud("d");     // `_d` DOES bind → lives to the end
    println!("end of main");
}
// drop c
// end of main
// drop d
// drop b
// drop a
```
::

`let _ = ...` vs `let _name = ...` matters for things like lock guards (chapter 22).

## Constants and Statics

::code-wrapper{language="rust"}
```rust
const MAX_POINTS: u32 = 100_000;     // type is REQUIRED, value copied in at each use
static GREETING: &str = "hello";     // one fixed memory location for the whole program

fn main() {
    println!("{MAX_POINTS} {GREETING}");
}
```
::

| | `let` | `const` | `static` |
|---|---|---|---|
| Type annotation | optional | **required** | **required** |
| Value | any, at run time | compile-time constant | compile-time constant |
| Scope | block | anywhere (even global) | anywhere |
| Memory | stack slot | inlined, no address | one fixed address |

::code-wrapper{language="rust"}
```rust
// const N = 5;                      // error: missing type for `const` item
// const S: String = String::from("x"); // error: cannot call non-const fn in constants
const S: &str = "x";                 // OK — string literals are fine
```
::

### Avoid `static mut`

::code-wrapper{language="rust"}
```rust
static mut COUNT: u32 = 0;

fn main() {
    // let r = unsafe { &COUNT };
    // error: creating a shared reference to mutable static (deny by default in edition 2024)
}
```
::

Use an atomic instead — no `unsafe` needed:

::code-wrapper{language="rust"}
```rust
use std::sync::atomic::{AtomicU32, Ordering};

static COUNT: AtomicU32 = AtomicU32::new(0);

fn main() {
    COUNT.fetch_add(1, Ordering::Relaxed);
    println!("{}", COUNT.load(Ordering::Relaxed));   // 1
}
```
::

For a value computed once at run time, use `OnceLock`:

::code-wrapper{language="rust"}
```rust
use std::sync::OnceLock;

static NAME: OnceLock<String> = OnceLock::new();

fn name() -> &'static str {
    NAME.get_or_init(|| "computed once".to_uppercase())
}

fn main() {
    println!("{}", name());   // COMPUTED ONCE
}
```
::

## `let ... else`

::code-wrapper{language="rust"}
```rust
fn first_word(s: &str) -> &str {
    let Some(word) = s.split_whitespace().next() else {
        return "";          // the else block MUST exit (return/break/panic)
    };
    word
}

fn main() {
    println!("[{}]", first_word("hello world"));   // [hello]
    println!("[{}]", first_word("   "));           // []
}
```
::

## 💡 Tips & Tricks

- **Debug** — `dbg!(expr)` prints file, line, the expression and its value, then returns the value: `let y = dbg!(x * 2) + 1;`
- **Idiom** — prefer shadowing (`let s = s.trim();`) over names like `s2`, `s_trimmed`.
- **Idiom** — `_unused` silences "unused variable" warnings but still keeps the value alive.
- **Readability** — `1_000_000` is the same as `1000000`.
- **Lint** — the compiler warns when a `mut` is never mutated: `variable does not need to be mutable`.

## ⚠️ Edge Cases & Gotchas

- **Shadowing** — a shadow inside `{ }` disappears at the `}`; the outer value is unchanged.
- **Type** — `mut` cannot change a variable's type; shadowing can.
- **Drop** — `let _ = value;` drops immediately; `let _x = value;` keeps it to the end of scope.
- **Const** — `const` items always need an explicit type and cannot call normal (non-`const`) functions.
- **Static** — in edition 2024, taking `&` or `&mut` to a `static mut` is a hard error by default.
- **Init** — `let x;` without a type works only if the compiler can infer it from a later assignment.

## 🧠 Quick Quiz

What does this print?

::code-wrapper{language="rust"}
```rust
fn main() {
    let x = 1;
    let x = x + 1;
    {
        let x = x * 10;
        println!("{x}");
    }
    let mut y = x;
    y += 100;
    println!("{x} {y}");
}
```
::

<details>
<summary>Answer</summary>

::code-wrapper{language="bash"}
```bash
20
2 102
```
::

The inner `x` (20) only exists inside the block. `y` is a copy of `x` (an `i32` is `Copy`), so changing `y` does not change `x`.

</details>

## Summary

Variables are immutable unless marked `mut`. Shadowing makes a new variable (it may change type); `mut` changes the same one. Use `const` for fixed values, atomics or `OnceLock` instead of `static mut`.

Next: Data Types.
