# 06 — Control Flow

## `if` Expressions

::code-wrapper{language="rust"}
```rust
let n = 5;
if n > 0 {
    println!("positive");
} else if n < 0 {
    println!("negative");
} else {
    println!("zero");
}

let sign = if n > 0 { 1 } else { -1 };   // if is an expression
```
::

- Branches must return the **same type** (or `!`).
- The condition must be a `bool` — no truthy integers, no `if x { }` where `x` is `i32`.
- `if let` combines pattern match + branch.

::code-wrapper{language="rust"}
```rust
if let Some(v) = opt {
    println!("{v}");
}
```
::

## `loop`

Infinite loop until `break`. `break` can return a value:

::code-wrapper{language="rust"}
```rust
let mut i = 0;
let result = loop {
    if i == 10 { break i * 2; }
    i += 1;
};
```
::

### Labeled Loops

::code-wrapper{language="rust"}
```rust
'outer: for i in 0..3 {
    for j in 0..3 {
        if i == j { continue 'outer; }
        if i + j > 3 { break 'outer; }
        println!("{i},{j}");
    }
}
```
::

Labels start with `'`. `break 'label` and `continue 'label` control the outer loop.

## `while`

::code-wrapper{language="rust"}
```rust
let mut n = 5;
while n > 0 {
    n -= 1;
}

while let Some(x) = stack.pop() {
    println!("{x}");
}
```
::

`while let` repeatedly matches; exits when pattern fails.

## `for` (Iterator Based)

::code-wrapper{language="rust"}
```rust
for i in 0..5 { print!("{i} "); }        // 0 1 2 3 4
for i in 0..=5 { print!("{i} "); }       // inclusive 0..5
for c in "abc".chars() { print!("{c}"); }
for b in &[1, 2, 3] { print!("{b} "); }   // borrows
for v in vec![1, 2, 3] { print!("{v} "); } // consumes
```
::

`for` consumes an `IntoIterator`. Arrays implement `IntoIterator` (by value) since edition 2021.

## `match`

Exhaustive pattern matching. Powerful and central to Rust:

::code-wrapper{language="rust"}
```rust
match x {
    0 => "zero",
    1 | 2 => "small",
    3..=9 => "medium",
    n if n < 100 => "big",     // match guard
    _ => "huge",
};
```
::

- Must be exhaustive; `_` is the wildcard.
- Arms evaluate to a single common type.
- Order matters; first matching arm wins.
- Multiple patterns with `|`.
- Ranges with `..=` (only for `char` and numeric types).
- **Match guards** (`if cond`) enable extra conditions but can prevent exhaustiveness analysis.
- Binding with `@`: `Some(n @ 1..=10) => n`.

### Binding Modes (2021 edition)

::code-wrapper{language="rust"}
```rust
match &opt {
    Some(x) => println!("{x}"),   // x: &i32 — auto-ref
    None => {}
}
```
::

The 2021 edition "default binding modes" let you avoid writing `&` everywhere; the compiler inserts references as needed. This can be subtle — see the Patterns chapter.

## `match` on References

::code-wrapper{language="rust"}
```rust
match &s {
    &"yes" => 1,
    _ => 0,
}
// or pattern-match by value of &str (Copy):
match s.as_str() {
    "yes" => 1,
    _ => 0,
}
```
::

## Destructuring in `match`

::code-wrapper{language="rust"}
```rust
enum Shape { Circle(f64), Square(f64), Rect(f64, f64) }
match shape {
    Shape::Circle(r) => 3.14 * r * r,
    Shape::Square(s) => s * s,
    Shape::Rect(a, b) if a == b => a * a,    // guard: catch squares
    Shape::Rect(a, b) => a * b,
}
```
::

## Returning from `match` vs `break`

`match` is an expression. To short-circuit, use `return`, `break`, `?`, or `continue`.

## `?` Operator (Error Propagation)

::code-wrapper{language="rust"}
```rust
fn parse_and_double(s: &str) -> Result<i32, ParseIntError> {
    let n: i32 = s.parse()?;
    Ok(n * 2)
}
```
::

`?` returns early from the function on `Err` (or `None` with `Option`). Works on anything implementing `Try` (stabilized for `Option`/`Result`). See Error Handling chapter.

## 💡 Tips & Tricks

- **Idiom**: prefer `let-else` (`let Some(x) = opt else { return; };`) over `if let ... else { return; }` when the success path is the rest of the function — it avoids one level of nesting for the common "validate or bail" shape.
- **Debug**: label every loop you might need to `break`/`continue` out of from a nested context, even before you think you'll need it (`'outer: for ... { 'inner: for ... } }`) — adding a label later requires touching every `break`/`continue` inside, while having it unused costs nothing (a leading underscore silences the warning: `'_outer:`).
- **Idiom**: use `loop { ... break value; }` instead of a `while`/manual flag variable when a loop's natural exit condition also produces the value you want out of it — `loop` as an expression is one of Rust's more underused features by newcomers from C-family languages.
- **Performance**: `loop { }` is recognized by the compiler as unconditionally infinite (useful for `-> !` diverging functions), whereas `while true { }` requires the optimizer to prove the condition never changes — prefer `loop` for intentional infinite loops.
- **Debug**: `matches!(x, pattern)` is a fast way to sanity-check what a `match` guard or pattern actually captures during debugging, without writing out a full `match` block just to print a boolean.
- **Idiom**: chain `?` instead of nesting `match`/`if let` for early-return error propagation — a function with three sequential fallible steps reads far better as three `?`-suffixed lines than as three levels of nested `match`.

## ⚠️ Edge Cases & Gotchas

- **`if` returning `()` vs value**: forgetting the trailing expr in one arm gives `()` and a type mismatch error.
- **`break` value type**: every `break` in the same `loop` must return the same type.
- **`continue` is `()`**: can't use `continue` to return a value from a `loop`.
- **`for` consumes the iterator**: can't easily get the index — use `.enumerate()`.
- **`while let` vs `if let`**: `while` loops; `if` runs once.
- **`match` arm trailing comma**: optional but idiomatic.
- **Empty `match` on a non-exhaustive enum** across crates requires `_ => unreachable!()` because adding variants is a non-breaking change for the upstream crate (unless `#[non_exhaustive]` rules apply).
- **`#[non_exhaustive]`** on an enum forces downstream code to include a `_` arm even if all current variants are matched (future-proofing).
- **Short-circuit evaluation**: `&&`, `||` short-circuit. `&` and `|` are bitwise and don't.
- **No ternary `?:`**: use `if`/`else` expressions, or `.then()`/`.unwrap_or()` on bools.
- **`if` condition must be `bool`**: `if x { }` where `x: u32` is an error; Rust has no truthy values. Use `if x != 0` or `if x > 0` explicitly.
- **Unreachable arms in `match`**: the compiler warns about unreachable patterns (e.g., `Some(_)` after `Some(5..=10)`). Use `_` for truly "rest".
- **Pattern guards and exhaustiveness**: `match x { n if n > 10 => ... }` may not be exhaustive (guard can fail); the compiler requires a fallback `_`.
- **Loop labels with value returns**: `'outer: loop { ... break 'outer value; }` works, but forgetting the label makes `break value` apply to the immediate loop.
- **`for` early `break` or `return`**: stopping a `for` loop doesn't implicitly return anything; you must capture the result externally.
- **Mutable iteration with `for x in &mut v`**: the mutable borrow prevents pushing/popping during iteration.
- **Match on references and deref coercion**: `match &opt { Some(x) => ... }` doesn't auto-deref; you need `match opt.as_ref() { Some(x) => ... }` for references inside the pattern.
- **Binding in guards**: `if let Some(x) = opt { if x > 10 { } }` vs `if let Some(x) = opt, x > 10 { }` (let chains, unstable) — use explicit if/else for clarity.
- **`match` with or-patterns and different captures**: `Some(x) | None => ...` captures `x` only if the first arm matches; `None` arm can't use `x`.
- **Empty `loop { }` vs `while true { }`**: both are infinite, but `loop` is idiomatic and slightly more efficient (compiler recognizes it as an infinite loop). Use `loop { ... break; }` for controlled early exits.

## 🧠 Spot the Bug

What's wrong with this "find the first even number, or -1" function?

::code-wrapper{language="rust"}
```rust
fn first_even(nums: &[i32]) -> i32 {
    let mut result = -1;
    for &n in nums {
        if n % 2 == 0 {
            result = n;
            break;
        }
    }
    result
}

fn main() {
    let result = 'search: loop {
        let nums = [3, 5, 7, 8, 9];
        for &n in &nums {
            if n % 2 == 0 {
                break 'search n;
            }
        }
        break 'search -1;
    };
    println!("{result}");
}
```
::

<details>
<summary>Answer</summary>

Both versions actually work correctly and print `8` — but the second one only works because the label `'search` is attached to the outer `loop`, not the inner `for`. The bug to spot is what happens if you "simplify" the second version by removing the seemingly-redundant outer `loop` and labeling the `for` instead:

::code-wrapper{language="rust"}
```rust
let result = 'search: for &n in &[3, 5, 7, 8, 9] {
    if n % 2 == 0 {
        break 'search n;  // ERROR
    }
};
```
::

This fails to compile: `break` with a value is only allowed within a `loop` block, not `for` or `while`. The reason is that `for` and `while` loops can exit *normally* (condition false, iterator exhausted) without ever hitting a `break` — the compiler cannot know in advance what value to produce for that implicit "fell through" exit path, so `for`/`while` loops are only allowed to evaluate to `()`. Only `loop` (which the compiler knows can *only* exit via `break`, or run forever) is permitted to evaluate to a non-`()` value, which is exactly why the working version wraps the `for` inside a `'search: loop { ... }` — the label lives on the `loop`, and the `for` is just an unlabeled traversal inside it.

**The lesson**: only `loop` (never `for`/`while`) can `break` with a value, because only `loop` is guaranteed to exit exclusively through an explicit `break`.

</details>

## `if let` chains (unstable) / `let-else`

::code-wrapper{language="rust"}
```rust
let Some(x) = opt else { return; };
```
::

`let-else` is the idiomatic early-return form. For multiple conditions, use nested `let-else` or a `match`.

## Summary

`if`/`while`/`for`/`loop`/`match` are all expressions. `match` is exhaustive and central. `?` propagates errors. Labels disambiguate nested loops. Next: the famous Ownership model.