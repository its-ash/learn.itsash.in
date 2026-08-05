# 06 — Control Flow

## `if` Expressions

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

- Branches must return the **same type** (or `!`).
- The condition must be a `bool` — no truthy integers, no `if x { }` where `x` is `i32`.
- `if let` combines pattern match + branch.

```rust
if let Some(v) = opt {
    println!("{v}");
}
```

## `loop`

Infinite loop until `break`. `break` can return a value:

```rust
let mut i = 0;
let result = loop {
    if i == 10 { break i * 2; }
    i += 1;
};
```

### Labeled Loops

```rust
'outer: for i in 0..3 {
    for j in 0..3 {
        if i == j { continue 'outer; }
        if i + j > 3 { break 'outer; }
        println!("{i},{j}");
    }
}
```

Labels start with `'`. `break 'label` and `continue 'label` control the outer loop.

## `while`

```rust
let mut n = 5;
while n > 0 {
    n -= 1;
}

while let Some(x) = stack.pop() {
    println!("{x}");
}
```

`while let` repeatedly matches; exits when pattern fails.

## `for` (Iterator Based)

```rust
for i in 0..5 { print!("{i} "); }        // 0 1 2 3 4
for i in 0..=5 { print!("{i} "); }       // inclusive 0..5
for c in "abc".chars() { print!("{c}"); }
for b in &[1, 2, 3] { print!("{b} "); }   // borrows
for v in vec![1, 2, 3] { print!("{v} "); } // consumes
```

`for` consumes an `IntoIterator`. Arrays implement `IntoIterator` (by value) since edition 2021.

## `match`

Exhaustive pattern matching. Powerful and central to Rust:

```rust
match x {
    0 => "zero",
    1 | 2 => "small",
    3..=9 => "medium",
    n if n < 100 => "big",     // match guard
    _ => "huge",
};
```

- Must be exhaustive; `_` is the wildcard.
- Arms evaluate to a single common type.
- Order matters; first matching arm wins.
- Multiple patterns with `|`.
- Ranges with `..=` (only for `char` and numeric types).
- **Match guards** (`if cond`) enable extra conditions but can prevent exhaustiveness analysis.
- Binding with `@`: `Some(n @ 1..=10) => n`.

### Binding Modes (2021 edition)

```rust
match &opt {
    Some(x) => println!("{x}"),   // x: &i32 — auto-ref
    None => {}
}
```

The 2021 edition "default binding modes" let you avoid writing `&` everywhere; the compiler inserts references as needed. This can be subtle — see the Patterns chapter.

## `match` on References

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

## Destructuring in `match`

```rust
enum Shape { Circle(f64), Square(f64), Rect(f64, f64) }
match shape {
    Shape::Circle(r) => 3.14 * r * r,
    Shape::Square(s) => s * s,
    Shape::Rect(a, b) if a == b => a * a,    // guard: catch squares
    Shape::Rect(a, b) => a * b,
}
```

## Returning from `match` vs `break`

`match` is an expression. To short-circuit, use `return`, `break`, `?`, or `continue`.

## `?` Operator (Error Propagation)

```rust
fn parse_and_double(s: &str) -> Result<i32, ParseIntError> {
    let n: i32 = s.parse()?;
    Ok(n * 2)
}
```

`?` returns early from the function on `Err` (or `None` with `Option`). Works on anything implementing `Try` (stabilized for `Option`/`Result`). See Error Handling chapter.

## Control-Flow Edge Cases

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

## `if let` chains (unstable) / `let-else`

```rust
let Some(x) = opt else { return; };
```

`let-else` is the idiomatic early-return form. For multiple conditions, use nested `let-else` or a `match`.

## Summary

`if`/`while`/`for`/`loop`/`match` are all expressions. `match` is exhaustive and central. `?` propagates errors. Labels disambiguate nested loops. Next: the famous Ownership model.