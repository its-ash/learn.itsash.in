# 13 — Pattern Matching (Deep Dive)

Pattern matching is Rust's most expressive control-flow construct. This chapter covers every pattern form, the binding rules, and the gotchas.

## Where Patterns Appear

- `match` arms
- `if let` / `while let`
- `let` declarations (destructure)
- `let-else`
- Function parameters (limited)
- `for`/`while` loops (destructure each item)

::code-wrapper{language="rust"}
```rust
let (a, b) = (1, 2);
fn first((a, _): (i32, i32)) -> i32 { a }
for (i, v) in vec.iter().enumerate() { /* ... */ }
```
::

## Pattern Forms

### Literals

::code-wrapper{language="rust"}
```rust
match x { 0 => "zero", 1 => "one", _ => "many" }
match c { 'a'..='z' | 'A'..='Z' => "letter", _ => "other" }
```
::

### Wildcards `_`

Matches anything, doesn't bind. Use to ignore.

### Variables

::code-wrapper{language="rust"}
```rust
match opt {
    Some(x) => println!("{x}"),   // binds x
    None => {},
}
```
::

A bare identifier binds the value. `_x` also binds but signals "intentionally unused" (suppresses warnings).

### Or-Patterns `|`

::code-wrapper{language="rust"}
```rust
match x {
    1 | 2 | 3 => "small",
    4 | 5 | 6 => "medium",
    _ => "big",
}
```
::

Can bind in all alternatives with the same name (or-pattern binding, edition 2021+):

::code-wrapper{language="rust"}
```rust
let (Ok(n) | Err(n)) = result.map(|n| n + 1).map_err(|e| 0);
```
::

### Ranges `..=`

::code-wrapper{language="rust"}
```rust
match x {
    0..=9 => "digit",
    10..=99 => "tens",
    100.. => "big",     // open-ended (unstable on stable for match arms in some forms)
}
```
::

Ranges work for `char` and numeric types. Use `..` for exclusive range in slice patterns.

### Destructuring Structs

::code-wrapper{language="rust"}
```rust
struct P { x: i32, y: i32 }
match p {
    P { x, y } => println!("{x},{y}"),     // shorthand
    P { x: a, y: b } => println!("{a},{b}"),
    P { x, .. } => println!("only x"),     // ignore rest
}
```
::

### Destructuring Tuples

::code-wrapper{language="rust"}
```rust
match t {
    (0, _) => "first zero",
    (a, b) if a < b => "ascending",
    _ => "other",
}
let (x, ..) = (1, 2, 3);    // first element only
let (.., z) = (1, 2, 3);    // last element only
```
::

### Destructuring Enums

::code-wrapper{language="rust"}
```rust
match e {
    Message::Quit => {},
    Message::Move { x: 0, y } => println!("zero-x, y={y}"),
    Message::Move { x, y } => println!("{x},{y}"),
    Message::Write(s) if s.is_empty() => "empty",
    Message::Write(s) => s,
    Message::ChangeColor(r, g, b) => println!("{r},{g},{b}"),
}
```
::

### Slice Patterns

::code-wrapper{language="rust"}
```rust
match slice {
    [] => "empty",
    [a] => "one: {a}",
    [a, b] => "two: {a},{b}",
    [first, .., last] => "first={first} last={last}",   // subslice pattern
    [a, b, c @ ..] => println!("{a}, {b}, rest={:?}", c),
}
```
::

`..` in slice patterns matches the middle (any length). Limited stable support; `c @ ..` binds the subslice.

### Reference Patterns

::code-wrapper{language="rust"}
```rust
match &x {
    &0 => "ref to zero",      // matches &0
    0 => "deref zero",         // auto-deref (binding mode)
}
let &y = &5;                  // matches the reference, y is i32 (Copy)
let ref r = x;               // r: &i32 — borrow pattern
let mut z = 0;
match z {
    ref mut r => *r += 1,    // r: &mut i32
}
```
::

### Binding Modes (2021)

::code-wrapper{language="rust"}
```rust
match &opt {
    Some(x) => println!("{x}"),   // x: &i32 — auto-ref
    None => {}
}
match &mut opt {
    Some(x) => *x += 1,           // x: &mut i32
    None => {}
}
```
::

The 2021 edition simplified this — you no longer sprinkle `&`/`&mut` everywhere. The compiler inserts references as needed based on what you match against.

### `@` Bindings

::code-wrapper{language="rust"}
```rust
match n {
    x @ 0..=9 => "small: {x}",
    x @ (10..=99) => "medium: {x}",
    _ => "big",
}
```
::

`@` binds the value while also constraining it with a pattern.

### Match Guards

::code-wrapper{language="rust"}
```rust
match opt {
    Some(x) if x > 0 => "positive",
    Some(_) => "non-positive",
    None => "none",
}
```
::

Guards let you add boolean conditions. They *can* prevent exhaustiveness checking — the compiler considers guards potentially false even for matched patterns, so you often need `_ =>` arms.

## `ref` and `ref mut`

Old-school (pre-2021) way to borrow in patterns:

::code-wrapper{language="rust"}
```rust
match opt {
    Some(ref x) => ...,    // x: &i32
    None => ...,
}
```
::

Still useful when the default binding mode doesn't fit (e.g., matching by value where you want a ref to one field). Modern Rust mostly auto-borrows.

## Destructuring with `..`

`..` ignores remaining fields/elements:

::code-wrapper{language="rust"}
```rust
let P { x, .. } = p;     // ignore y
let (a, .., z) = tuple;  // ignore middle
```
::

`..` can appear once in a struct pattern and once in a tuple/slice pattern. Multiple `..` is an error.

## Patterns Don't Allow Expressions

You can't write `Some(x + 1)` as a pattern. Guards exist for that. Patterns are structural; conditions go in guards.

## Exhaustiveness

::code-wrapper{language="rust"}
```rust
fn classify(c: Color) -> &'static str {
    match c {
        Color::Red => "red",
        // ERROR if missing Green/Blue
    }
}
```
::

The compiler lists the missing patterns. Add `_` if you genuinely don't care, but be explicit when you can — exhaustiveness is a feature.

## `matches!` Macro

::code-wrapper{language="rust"}
```rust
let is_some = matches!(opt, Some(_));
let in_range = matches!(n, 0..=9 | 100..=199);
```
::

Concise one-arm matcher returning `bool`.

## Common Pitfalls

- **Variable shadowing in pattern**: `match x { Some(x) => x, None => 0 }` — the inner `x` shadows the outer; usually what you want, but easy to misread.
- **`_` vs `_x`**: `_` doesn't bind (drops the value), `_x` binds (must be used or it warns).
- **Binding mode surprises**: when matching `&Option<i32>`, the bound variable is `&i32`. The compiler prints the inferred type — read the error carefully.
- **Match guard + exhaustiveness**: guards make the compiler treat arms as non-exhaustive. Always have a final `_` or cover every variant.
- **Move-out in pattern**: matching `Some(s)` on a `String`-carrying enum by value moves the `String`; matching `&Some(s)` borrows it.
- **Range patterns need contiguous types**: `..=` works for `char` and integers; `String` can't be range-matched.
- **Nested patterns**: `Some((Ok(x), _))` is valid; patterns nest arbitrarily.
- **Tuple struct variants**: `Message::Move { x, y }` (struct form) vs `Message::Write(s)` (tuple form) — must use the form matching the variant.

## `let` Patterns and Refutability

- `let PATTERN = expr` requires PATTERN to be **irrefutable** (always matches): `let (a, b) = tuple` is fine; `let Some(x) = opt` is an error (refutable).
- `if let` and `while let` accept refutable patterns.
- `let-else` bridges: `let Some(x) = opt else { return; };`.

## Pattern Matching Tricks & Idioms

::code-wrapper{language="rust"}
```rust
// Trick: use if let for single-pattern matching
if let Some(x) = opt { println!("{x}"); }

// Trick: use while let for pattern-based looping
let mut it = vec![1, 2, 3].into_iter();
while let Some(x) = it.next() { println!("{x}"); }

// Trick: destructure in for loops
for (i, v) in vec.iter().enumerate() { }
for (k, v) in &map { }

// Trick: use patterns in function arguments
fn print_pair((a, b): (i32, i32)) { println!("{a}, {b}"); }

// Trick: or-patterns with multiple variants
match e {
    Color::Red | Color::Green | Color::Blue => "primary",
    _ => "other",
}

// Trick: binding in or-patterns (2021+)
let (Ok(n) | Err(n)) = result.map(|x| x).map_err(|_| 0);

// Trick: use @ to bind and check
match n {
    x @ 0..=9 => println!("digit: {x}"),
    x @ 10..=99 => println!("two-digit: {x}"),
    _ => println!("big"),
}

// Trick: slice patterns for destructuring
match v.as_slice() {
    [] => println!("empty"),
    [first] => println!("one: {first}"),
    [first, .., last] => println!("{first}..{last}"),
    _ => println!("multiple"),
}

// Trick: use nested patterns for complex data
match opt {
    Some((Ok(x), Some(y))) => println!("{x}, {y}"),
    _ => println!("nope"),
}

// Trick: guard with additional conditions
match x {
    n if n > 0 && n < 10 => "positive digit",
    n if n == 0 => "zero",
    _ => "other",
}

// Trick: use ref patterns for borrowing
match &Some("hello") {
    Some(ref s) => println!("{s}"), // s: &str
    None => {}
}

// Trick: matches! macro for one-liner boolean checks
if matches!(opt, Some(0)) { }
```
::

## 💡 Tips & Tricks

- **Idiom**: use `let-else` (`let Some(x) = opt else { return; };`) instead of an `if let ... else { return }` block when you want the happy-path variable available for the rest of the function without nesting.
- **Debug**: `dbg!(&value)` right before a `match` is a quick way to confirm which arm you expect to fire, especially with reference patterns where the bound type isn't obvious from the source.
- **Clippy**: `clippy::match_like_matches_macro` suggests collapsing a two-armed boolean `match` into `matches!`; `clippy::single_match` suggests `if let` when only one arm does anything.
- **Performance**: exhaustive `match` on an enum compiles to a jump table (like a C `switch`) when the discriminants are dense, making it as fast as (often faster than) a chain of `if`/`else if`.
- **Idiom**: combine `@` bindings with guards for readable range checks with a captured value: `n @ 1..=9 if n % 2 == 0 => ...` reads better than re-deriving `n` inside the guard.
- **Debug**: when a binding-mode error says "expected `i32`, found `&i32`" inside a `match` arm, it's telling you exactly what the auto-ref inserted — read the *found* type, don't guess.

## ⚠️ Edge Cases & Gotchas

- **Guards re-evaluate on every check, and can have side effects**: `Some(x) if side_effecting_check(x) =>` runs `side_effecting_check` only if the pattern matches structurally first, but if multiple guarded arms share a pattern, a failing guard on one still lets the compiler try the next identical pattern — surprising if the guard isn't pure.
- **Or-patterns with different bound types don't compile**: `Ok(n) | Err(n)` requires `n` to have the *same type* in both alternatives — `Result<i32, String>` can't or-pattern bind a single `n` across `Ok`/`Err` because `i32 != String`.
- **`..` can only appear once per pattern level**: `[a, .., b, .., c]` is a compile error even though it looks like it should mean "match ends and any two gaps" — a single `..` must unambiguously bind a length.
- **Range patterns silently require `PartialOrd`/step behavior**: `'a'..='z'` works char-by-char, but a range pattern like `1.5..=2.5` on floats is a hard compile error — float ranges are not allowed as match patterns because equality/step is ill-defined for `NaN`.
- **Refutability errors point at the wrong line**: `let Some(x) = opt;` (no `else`) fails with "refutable pattern in local binding" — the fix is `let-else`, `if let`, or `.unwrap()`, but newcomers often try to "fix" the type instead of the binding form.
- **Binding modes silently change mutability expectations**: matching `&mut Some(x)` binds `x: &mut T`, but matching `&Some(x)` where `T: Copy` binds `x: T` (a copy) — swap `&mut` for `&` in a diff and a previously-mutating arm silently becomes a no-op that still compiles.
- **Platform-independent gotcha — non-exhaustive integer ranges**: `match byte { 0..=254 => ..., 255 => ... }` for a `u8` is exhaustive, but the same pattern on `i32` is not (many more values exist), so the identical-looking match arms compile in one case and require a wildcard in the other.

## 🧠 Spot the Bug

Will this compile? If so, what does `classify(5)` print?

::code-wrapper{language="rust"}
```rust
fn classify(n: i32) -> &'static str {
    match n {
        x if x > 0 => "positive",
        x if x < 0 => "negative",
        0 => "zero",
    }
}

fn main() {
    println!("{}", classify(5));
}
```
::

<details>
<summary>Answer</summary>

It does **not** compile: `error[E0004]: non-exhaustive patterns`.

Every arm here uses a match guard (`if x > 0`, `if x < 0`) except the last. The compiler cannot prove that `x if x > 0` and `x if x < 0` together cover "every `i32` except `0`" — guards are arbitrary boolean expressions evaluated at runtime, so exhaustiveness checking (which works on pattern *shape*, not guard logic) treats both guarded arms as only *potentially* matching. From the checker's point of view, an `i32` could in principle satisfy none of the three arms (if some future refactor changed the conditions), so a bare `_ =>` or truly irrefutable final arm is required — the literal `0` arm without a guard doesn't retroactively make the earlier guarded arms "safe" in the compiler's eyes for every input, and more importantly `0` alone still leaves the guard-covered ranges unproven exhaustive. The fix is to add a final `_ => unreachable!()` or restructure the guards into structural range patterns (`1.. => "positive"`, `..0 => "negative"`, `0 => "zero"`), which the checker *can* verify exhaustively without guards.

**The lesson**: match guards are invisible to the exhaustiveness checker — always end guarded matches with an unconditional catch-all arm.

</details>

## Summary

Patterns are structural, support literals, ranges, or-patterns, destructuring, `@` bindings, and guards. The 2021 binding modes reduced noise. Exhaustiveness is enforced. `ref`/`ref mut` are escape hatches for older patterns. `matches!` is a tiny match for booleans. Use patterns everywhere: function parameters, for loops, let declarations, match arms, and conditionals.

Next: Collections (`Vec`, `String`, `HashMap`, etc.).