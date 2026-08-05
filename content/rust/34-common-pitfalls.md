# 34 — Common Pitfalls & Idiomatic Fixes

A checklist of mistakes every Rust developer makes — and the idiomatic fix for each.

## 1. Fighting the Borrow Checker

### Symptom: "cannot borrow as mutable because it is also borrowed as immutable"

```rust
// Bad
let mut v = vec![1, 2, 3];
let r = &v[0];
v.push(4);          // ERROR
println!("{r}");

// Fix: end the borrow first
let r = &v[0];
println!("{r}");
v.push(4);

// Fix: copy out
let r = v[0];       // i32 is Copy
v.push(4);

// Fix: clone
let r = v[0].clone();
v.push(4);
```

### Symptom: "cannot borrow as mutable, as it is not declared as mut"

```rust
let s = String::from("hi");
let r = &mut s;     // ERROR
```

Fix: `let mut s = String::from("hi");`.

### Symptom: "borrowed value does not live long enough"

```rust
// Bad
fn bad() -> &str { let s = String::from("hi"); &s }

// Fix: return owned
fn good() -> String { String::from("hi") }
```

Returning a reference to a local is impossible. Return owned, or accept the data as input.

### Symptom: "returns a value referencing data owned by the current function"

Same as above. Return owned, or restructure so the data lives outside the function.

## 2. `move` Closure Footguns

### Symptom: closure captures too much

```rust
let v = vec![1, 2, 3];
let n = 5;
let f = move || { println!("{n}"); };   // moves n, doesn't need v
// v still owned — but if closure captured v, v would be gone
```

Edition 2021 captures only used variables, but `move` still moves all of them.

### Symptom: lifetime issues with thread closure

```rust
let s = String::from("hi");
std::thread::spawn(|| println!("{s}"));    // ERROR: 'static required
// Fix
std::thread::spawn(move || println!("{s}"));
// or clone
```

## 3. `clone()` Everywhere

Cloning is fine when necessary but often signals a design issue:

```rust
// Smelly
fn process(s: String) { /* ... */ }
let s = String::from("hi");
process(s.clone());
process(s.clone());

// Better: borrow
fn process(s: &str) { /* ... */ }
process(&s);
process(&s);
```

Borrow by `&str`/`&[T]`/`&Path` when you don't need ownership.

## 4. `unwrap()`/`expect()` in Production

```rust
// Bad
fn parse(s: &str) -> i32 { s.parse().unwrap() }

// Good
fn parse(s: &str) -> Result<i32, ParseIntError> { s.parse() }
// or
fn parse_or_default(s: &str) -> i32 { s.parse().unwrap_or(0) }
```

`unwrap` panics on `None`/`Err`. Use `?`, `unwrap_or`, `unwrap_or_default`, or explicit match.

## 5. Treating `Result` Like Exceptions

```rust
// Smelly
fn process() {
    let a: i32 = "x".parse().unwrap();
    let b: i32 = "y".parse().unwrap();
    // ...
}

// Idiomatic
fn process() -> Result<(), AppError> {
    let a: i32 = "x".parse()?;
    let b: i32 = "y".parse()?;
    Ok(())
}
```

Propagate with `?`. Don't `unwrap` in non-test paths.

## 6. Mutable Global State

```rust
// Smelly
static mut COUNTER: u32 = 0;
fn incr() { unsafe { COUNTER += 1; } }

// Idiomatic
use std::sync::atomic::{AtomicUsize, Ordering};
static COUNTER: AtomicUsize = AtomicUsize::new(0);
fn incr() { COUNTER.fetch_add(1, Ordering::Relaxed); }
```

Atomics or `Arc<Mutex<T>>` are safe and testable.

## 7. `Vec<Vec<T>>` for Matrices

```rust
// Smelly: cache-unfriendly
let m: Vec<Vec<f32>> = vec![vec![0.0; 100]; 100];

// Better: flat layout
let m: Vec<f32> = vec![0.0; 100 * 100];
fn at(m: &[f32], x: usize, y: usize, w: usize) -> f32 { m[y * w + x] }
```

## 8. `Vec<u8>` Repeated Reallocations

```rust
// Smelly
let mut v = Vec::new();
for _ in 0..1000 { v.push(0u8); }    // regrows ~10 times

// Better
let mut v = Vec::with_capacity(1000);
for _ in 0..1000 { v.push(0u8); }
// or
let v = vec![0u8; 1000];
```

## 9. `String` for Static Text

```rust
// Smelly
fn label() -> String { String::from("OK") }

// Better
fn label() -> &'static str { "OK" }
```

Return `&'static str` for compile-time constants; `String` only when constructed.

## 10. Indexing Out of Bounds

```rust
// Panics
let v = vec![1, 2, 3];
let x = v[5];

// Safe
let x = v.get(5).copied().unwrap_or(0);
```

Use `get`/`get_mut` when bounds are uncertain.

## 11. String Indexing Confusion

```rust
let s = "héllo";
let c = s[0];       // ERROR: String can't be indexed by integer
let b = s.as_bytes()[0];    // u8, byte
let c = s.chars().nth(0);   // Option<char>
```

UTF-8 strings don't support byte indexing semantically. Iterate `chars()` for code points, `bytes()` for bytes.

## 12. Using `Deref` for Inheritance

`Deref` is for smart pointers, not modeling. Misuse leads to confusing method resolution:

```rust
// Smelly
struct A { /* ... */ }
struct B(A);   // hope to "inherit" A's methods
impl Deref for B { type Target = A; fn deref(&self) -> &A { &self.0 } }
// B.method_of_a() works, but it's misleading

// Better: explicit delegation
impl B {
    fn method_of_a(&self) { self.0.method_of_a(); }
}
```

## 13. `unsafe impl Send for Rc<T>`

`Rc`'s refcount is non-atomic; making it `Send` causes data races. Use `Arc`.

## 14. `Vec::clone()` Where `Rc::clone` Would Do

```rust
// Smelly: deep clones the whole vec
let v = vec![1, 2, 3];
let v2 = v.clone();

// If sharing read-only data
let v = Rc::new(vec![1, 2, 3]);
let v2 = Rc::clone(&v);    // just bumps refcount
```

## 15. Locking Across `.await`

```rust
// Smelly: holding std::sync::Mutex across await
let m = std::sync::Mutex::new(0);
let g = m.lock().unwrap();
some_async().await;     // ⚠️ held during await
drop(g);

// Better: drop before await
let v = { let g = m.lock().unwrap(); *g };
some_async(v).await;

// Or use tokio's async Mutex
let m = tokio::sync::Mutex::new(0);
let mut g = m.lock().await;
some_async(&mut *g).await;
```

## 16. Forgetting `move` in Async Blocks

```rust
let v = vec![1, 2, 3];
let f = async { println!("{:?}", v); };   // borrows v
// f must outlive v — if returned/spawned, error
let f = async move { println!("{:?}", v); };   // moves v
```

## 17. `Arc::clone` vs `Clone::clone`

`Arc::clone(&arc)` is identical to `arc.clone()` but signals "this is cheap, just refcount". Use `Arc::clone`.

## 18. `if` vs `match` for Two-Path

`if cond { } else { }` is fine for booleans; `match` is better for enum dispatch. Don't `if let` when a full `match` is clearer.

## 19. `unwrap()` on `lock()`

```rust
let g = m.lock().unwrap();    // panics on poison
```

In production, decide a poison policy: `.lock().unwrap_or_else(|e| e.into_inner())` to recover the data despite a panic.

## 20. `Box<dyn Trait>` Where Generic Works

```rust
// Smelly: dyn for a single type
fn process(items: Vec<Box<dyn Process>>) { /* ... */ }

// Better: generic, monomorphizes
fn process<T: Process>(items: Vec<T>) { /* ... */ }
```

`dyn` is for heterogeneous collections or when binary size matters.

## 21. `Vec<u8>` from `read_to_end`

If you know the size, `Vec::with_capacity`:

```rust
let mut v = Vec::with_capacity(1024);
file.read_to_end(&mut v)?;
```

## 22. `format!` in Hot Loops

```rust
// Smelly
for x in items { log::info!("{}", format!("{:?}", x)); }

// Better
for x in items { log::info!("{:?}", x); }
```

`format!` allocates. Use `write!` into a reused buffer if you must build a string in a loop.

## 23. Returning `()` From Blocks by Accident

```rust
// Bad
fn foo() -> i32 {
    let x = 5;
    x + 1;     // ; — block returns ()!
}

// Good
fn foo() -> i32 {
    let x = 5;
    x + 1       // no semicolon — returns 6
}
```

A trailing `;` turns an expression into a statement returning `()`.

## 24. `match` Without `_` When All Cases Matter

```rust
// Bad: silently breaks when a new variant is added
match color {
    Color::Red => 1,
    _ => 0,    // catches future variants
}

// Better (until you've thought about it)
match color {
    Color::Red => 1,
    Color::Green => 0,
    Color::Blue => 0,
}
```

Let exhaustiveness drive you to handle new variants.

## 25. `mut` You Don't Need

```rust
let mut x = 5;
let y = x + 1;     // x never mutates — warning: unused mut
```

Remove `mut` or prefix `_x` if intentional.

## 26. Unreachable `unreachable!`

```rust
match opt {
    Some(_) => 1,
    None => unreachable!(),   // will panic if someone passes None
}
```

If the API allows `None`, handle it. Reserve `unreachable!` for truly impossible states.

## 27. `String::from` vs `.to_string()` vs `.into()`

All three work for `String`. `into()` is shortest, `to_string()` reads clearly, `String::from` is explicit. Pick one and be consistent.

## 28. `&Vec<T>` Parameters

```rust
// Smelly: forces caller to have a Vec
fn sum(v: &Vec<i32>) -> i32 { v.iter().sum() }

// Better: accepts slices, arrays, Vec
fn sum(v: &[i32]) -> i32 { v.iter().sum() }
```

## 29. `&String` Parameters

```rust
// Smelly
fn greet(s: &String) { /* ... */ }

// Better
fn greet(s: &str) { /* ... */ }
// accepts String, &str, literals
```

## 30. `if x.is_ok() { x.unwrap() }`

```rust
// Smelly
if let Ok(v) = result { /* use v */ }

// Idiomatic
let v = result?;
// or
match result { Ok(v) => /* use v */, Err(e) => /* handle */ }
```

## 31. `vec![None; n]` vs `vec![0; n]`

`vec![None; n]` works but takes 8 bytes/element on 64-bit. If you have a "default" sentinel, use `vec![0; n]` for cache efficiency.

## 32. `HashMap` Iteration Order

Don't depend on iteration order of `HashMap` — it's randomized per run. Use `BTreeMap` for ordered, or `IndexMap` for insertion order.

## 33. `String::new()` vs `String::with_capacity`

If you'll push N chars, `with_capacity(N)` avoids regrow.

## 34. `String::from_utf8_lossy` vs `from_utf8`

`from_utf8` returns `Result`; `from_utf8_lossy` always returns a `Cow` with replacement chars. Use `from_utf8` if invalid UTF-8 is an error.

## 35. Forgetting `#[must_use]` Types

`Result`, `Option` warn by default. For your types:

```rust
#[must_use]
pub struct Handle { /* ... */ }
```

## 36. `as` Casts

`as` is unchecked and may truncate. Use `TryFrom`/`TryInto`:

```rust
// Risky
let n: u8 = 1000u32 as u8;     // 232, silently

// Safe
let n: u8 = 1000u32.try_into().unwrap_or(u8::MAX);
```

## 37. `cargo build` in CI Without `--locked`

```yaml
- run: cargo build --locked --release
```

`--locked` ensures `Cargo.lock` is honored (reproducible builds).

## 38. Ignoring Clippy

Treat Clippy warnings as errors in CI:

```yaml
- run: cargo clippy --all-targets -- -D warnings
```

Many lints catch real bugs (e.g., `clippy::needless_collect`, `clippy::mem_forget`).

## 39. Doc Tests Breaking on Rust Version

Pin a MSRV; CI runs `cargo +1.75 test` to catch regressions.

## 40. `Arc<Mutex<T>>` for Single-Threaded Code

If you're not actually going multi-threaded, plain `Rc<RefCell<T>>` is cheaper. Match the abstraction to the actual concurrency.

## Summary

- Borrow, don't clone, when you don't need ownership.
- `?` over `unwrap`.
- `&str`/`&[T]` over `&String`/`&Vec<T>`.
- Don't lock across `.await`.
- Don't `Deref` for inheritance.
- Generic over `dyn` for hot paths.
- `match` exhaustively; `_` only when you've considered every variant.
- `--locked` in CI; clippy with `-D warnings`.
- Document `// SAFETY:` in unsafe code; use `Miri`.

Next: Final exam-style questions and project ideas.