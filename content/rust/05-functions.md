# 05 — Functions

## Defining Functions

::code-wrapper{language="rust"}
```rust
fn add(a: i32, b: i32) -> i32 {
    a + b              // no semicolon → this is the return value
}

fn greet(name: &str) {          // no `->` means it returns `()` (unit)
    println!("hi {name}");
}

fn main() {
    println!("{}", add(2, 3));  // 5
    greet("Ada");
}
```
::

- Parameter types are **required** — Rust never infers them for `fn`.
- There are **no default arguments** and **no overloading**. Use different names or `Option` parameters.

## Expressions vs Statements — the Semicolon Matters

**Tricky**: adding `;` to the last line turns the value into a statement that returns `()`:

::code-wrapper{language="rust"}
```rust
fn square(x: i32) -> i32 {
    x * x;          // error[E0308]: mismatched types — expected `i32`, found `()`
}                   // help: remove this semicolon to return this value
```
::

Blocks are expressions too:

::code-wrapper{language="rust"}
```rust
fn main() {
    let y = { let x = 3; x + 1 };    // 4
    let z = { let x = 3; x + 1; };   // () — the semicolon threw the value away
    println!("{y} {z:?}");           // 4 ()

    let size = if y > 2 { "big" } else { "small" };   // `if` returns a value
    println!("{size}");              // big
}
```
::

Both branches of an `if` expression must have the same type:

::code-wrapper{language="rust"}
```rust
fn main() {
    let n = 5;
    // let x = if n > 0 { 1 } else { "zero" };   // error[E0308]: `if` and `else` have incompatible types
}
```
::

## Early `return`

::code-wrapper{language="rust"}
```rust
fn classify(n: i32) -> &'static str {
    if n < 0 {
        return "negative";
    }
    if n == 0 {
        return "zero";
    }
    "positive"
}

fn main() {
    println!("{} {} {}", classify(-1), classify(0), classify(9));
}
```
::

**Tricky**: `return` inside a closure returns from the **closure**, not the outer function:

::code-wrapper{language="rust"}
```rust
fn has_even(v: &[i32]) -> bool {
    v.iter().for_each(|&x| {
        if x % 2 == 0 {
            return;          // leaves only this closure call; the loop keeps going
        }
    });
    false                    // always reached!
}

fn has_even_fixed(v: &[i32]) -> bool {
    v.iter().any(|&x| x % 2 == 0)
}

fn main() {
    println!("{} {}", has_even(&[1, 2]), has_even_fixed(&[1, 2]));   // false true
}
```
::

## Passing Arguments: Move vs Copy vs Borrow

::code-wrapper{language="rust"}
```rust
fn takes_string(s: String) -> usize { s.len() }   // takes ownership
fn borrows_str(s: &str) -> usize { s.len() }      // only looks
fn takes_number(n: i32) -> i32 { n + 1 }          // i32 is Copy

fn main() {
    let n = 5;
    takes_number(n);
    println!("{n}");            // fine — n was copied

    let s = String::from("hi");
    borrows_str(&s);
    println!("{s}");            // fine — only borrowed

    takes_string(s);
    // println!("{s}");         // error[E0382]: borrow of moved value: `s`
}
```
::

**Idiom**: accept `&str` instead of `&String`, and `&[T]` instead of `&Vec<T>` — they work for more callers.

## Nested Functions Cannot Capture

::code-wrapper{language="rust"}
```rust
fn main() {
    let n = 5;
    // fn inner() -> i32 { n }    // error[E0434]: can't capture dynamic environment in a fn item
    let inner = || n;            // a closure CAN capture
    println!("{}", inner());     // 5
}
```
::

## Functions That Never Return: `-> !`

::code-wrapper{language="rust"}
```rust
fn fail(msg: &str) -> ! {
    eprintln!("fatal: {msg}");
    std::process::exit(1);
}

fn main() {
    let port: u16 = match "8080".parse() {
        Ok(p) => p,
        Err(_) => fail("bad port"),   // `!` fits any type, so the match still has type u16
    };
    println!("{port}");
}
```
::

`panic!`, `loop {}` with no `break`, and `std::process::exit` all have type `!`.

## Functions as Values

::code-wrapper{language="rust"}
```rust
fn double(x: i32) -> i32 { x * 2 }

fn apply(f: fn(i32) -> i32, v: i32) -> i32 { f(v) }

fn main() {
    println!("{}", apply(double, 5));            // 10
    let v: Vec<i32> = vec![1, 2, 3].into_iter().map(double).collect();
    println!("{v:?}");                           // [2, 4, 6]
}
```
::

## Recursion

::code-wrapper{language="rust"}
```rust
fn factorial(n: u64) -> u64 {
    if n <= 1 { 1 } else { n * factorial(n - 1) }
}

fn main() {
    println!("{}", factorial(20));   // 2432902008176640000
    // factorial(21) overflows u64 → panic in debug, wrong value in release
    // very deep recursion (e.g. 1_000_000 levels) → stack overflow, the process aborts
}
```
::

Rust does not guarantee tail-call optimization. For deep or unbounded depth, use a loop.

## 💡 Tips & Tricks

- **Idiom** — return early for error cases; keep the "happy path" as the final expression.
- **Debug** — `#[track_caller]` on a helper makes its panics point at the caller's line.
- **Idiom** — destructure in parameters: `fn dist((x, y): (f64, f64)) -> f64`.
- **Lint** — `clippy::too_many_arguments` warns at 7+ parameters; group them in a struct.
- **Idiom** — `impl Fn(i32) -> i32` accepts both functions and closures; `fn(i32) -> i32` accepts only non-capturing ones.

## ⚠️ Edge Cases & Gotchas

- **Semicolon** — `x + 1;` as the last line returns `()`, not `x + 1`.
- **Closures** — `return` in a closure (e.g. inside `for_each`) does not exit the outer function.
- **No defaults** — `fn f(x: i32 = 0)` is a syntax error. Use `Option<i32>` or a builder.
- **Nested fn** — inner `fn` items cannot see the outer function's local variables.
- **Recursion** — no guaranteed tail calls; deep recursion overflows the stack and aborts.
- **Moves** — passing a `String` by value moves it; the caller can no longer use it.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
fn is_valid(input: &str) -> bool {
    if input.is_empty() {
        return false;
    }
    input.chars().all(|c| c.is_ascii_alphanumeric());
}
```
::

<details>
<summary>Answer</summary>

The last line ends with `;`, so the function body ends with `()` instead of the `bool`. It does not compile:

::code-wrapper{language="bash"}
```bash
error[E0308]: mismatched types
  expected `bool`, found `()`
  help: remove this semicolon to return this value
```
::

Remove the semicolon. The compiler's `help:` line tells you exactly that — always read the whole error.

</details>

## 🧠 Quick Quiz

::code-wrapper{language="rust"}
```rust
fn f(x: i32) -> i32 {
    let y = {
        let x = x * 2;
        x + 1
    };
    if y > 10 { return y; }
    y * 100
}

fn main() {
    println!("{} {}", f(3), f(5));
}
```
::

<details>
<summary>Answer</summary>

`700 11`. For `f(3)`: `y = 7`, not `> 10`, so `7 * 100 = 700`. For `f(5)`: `y = 11`, returned early.

</details>

## Summary

Functions need typed parameters, have no defaults or overloading, and return their last expression. Watch the trailing semicolon, and remember `return` inside a closure only leaves the closure.

Next: Control Flow.
