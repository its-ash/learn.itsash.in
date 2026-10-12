# 34 — Common Pitfalls

A one-page collection of the traps from this course. Each one: the surprising code, why it happens, and the fix. All outputs were checked with Rust 1.97 (edition 2024).

## Numbers

### 1. Overflow behaves differently in debug and release

::code-wrapper{language="rust"}
```rust
fn main() {
    let x: u8 = std::env::args().count() as u8 + 249;   // 250 at run time
    let y = x + 10;    // debug: panic "attempt to add with overflow" | release: 4
    println!("{y}");
}
```
::

**Fix**: say what you want — `checked_add` (→ `Option`), `wrapping_add`, `saturating_add`.

### 2. `as` never fails — it silently changes values

::code-wrapper{language="rust"}
```rust
fn main() {
    println!("{}", 300i32 as u8);      // 44
    println!("{}", -1i32 as u32);      // 4294967295
    println!("{}", 3.99f64 as i32);    // 3
    println!("{:?}", u8::try_from(300i32));   // Err(TryFromIntError(()))  ← the safe way
}
```
::

### 3. `len() - 1` on an empty collection

::code-wrapper{language="rust"}
```rust
fn main() {
    let v: Vec<i32> = vec![];
    // let last_index = v.len() - 1;   // panic: attempt to subtract with overflow
    println!("{:?}", v.len().checked_sub(1));   // None
    println!("{:?}", v.last());                 // None — usually what you wanted anyway
}
```
::

### 4. `abs()` of the smallest integer

::code-wrapper{language="rust"}
```rust
fn main() {
    let x = i32::MIN;
    // x.abs()                            // overflow: +2147483648 doesn't fit in i32
    println!("{:?}", x.checked_abs());    // None
    println!("{}", x.unsigned_abs());     // 2147483648 (as u32)
}
```
::

### 5. Integer division and remainder

::code-wrapper{language="rust"}
```rust
fn main() {
    println!("{} {}", -7 / 2, -7 % 2);               // -3 -1   (truncates toward zero)
    println!("{} {}", (-7i32).div_euclid(2), (-7i32).rem_euclid(2));   // -4 1
}
```
::

## Strings

### 6. `len()` counts bytes; slicing can panic

::code-wrapper{language="rust"}
```rust
fn main() {
    let s = "héllo";
    println!("{} {}", s.len(), s.chars().count());   // 6 5
    // &s[0..2]                                       // panic: byte index 2 is not a char boundary
    println!("{:?}", s.get(0..2));                   // None — safe version
}
```
::

### 7. `parse()` does not trim

::code-wrapper{language="rust"}
```rust
fn main() {
    println!("{:?}", " 42".parse::<i32>());           // Err(InvalidDigit)
    println!("{:?}", " 42".trim().parse::<i32>());    // Ok(42)
}
```
::

### 8. String comparison is by code point

::code-wrapper{language="rust"}
```rust
fn main() {
    println!("{}", "Zebra" < "apple");    // true — all uppercase letters sort before lowercase
    let mut v = vec!["b", "A", "a"];
    v.sort_by_key(|s| s.to_lowercase());  // case-insensitive sort
    println!("{v:?}");                    // ["A", "a", "b"]
}
```
::

## Ownership & Borrowing

### 9. `for x in v` consumes `v`

::code-wrapper{language="rust"}
```rust
fn main() {
    let v = vec![String::from("a")];
    for s in &v { println!("{s}"); }   // borrow
    println!("{}", v.len());           // still usable
    // for s in v {} ; v.len()         // error[E0382]: borrow of moved value: `v`
}
```
::

### 10. Holding a reference while modifying

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![1, 2, 3];
    let first = v[0];        // copy the value, don't keep `&v[0]`
    v.push(first);
    println!("{v:?}");       // [1, 2, 3, 1]
}
```
::

### 11. `.clone()` to silence the compiler

A clone copies all the data. If the function only reads, take `&T` / `&str` / `&[T]` instead.

### 12. `..base` moves non-Copy fields

::code-wrapper{language="rust"}
```rust
#[derive(Debug, Clone)]
struct Cfg { host: String, port: u16 }

fn main() {
    let base = Cfg { host: "localhost".into(), port: 80 };
    let a = Cfg { port: 8080, ..base.clone() };   // clone, or `base` is partially moved
    let b = Cfg { port: 443, ..base };
    println!("{a:?} {b:?}");
}
```
::

## Patterns & Control Flow

### 13. A name in a pattern binds — it doesn't compare

::code-wrapper{language="rust"}
```rust
fn main() {
    let expected = 5;
    let got = 7;
    match got {
        n if n == expected => println!("equal"),   // compare with a guard
        _ => println!("different"),                // printed
    }
    // `match got { expected => ... }` would match ANYTHING and bind a new `expected`.
}
```
::

### 14. `_ =>` hides new enum variants

List the variants explicitly so adding one gives a compile error at every `match`.

### 15. `return` inside a closure

`return` in `v.iter().for_each(|x| { ... return; })` only leaves the closure. Use `any`, `find`, or a `for` loop.

## Collections & Iterators

### 16. Iterators are lazy

`v.iter().map(|x| println!("{x}"));` prints nothing. Use `for` or end with a consumer (`collect`, `for_each`, `count`).

### 17. `zip` stops at the shorter side; `dedup` only removes neighbours

::code-wrapper{language="rust"}
```rust
fn main() {
    println!("{:?}", [1, 2, 3].iter().zip(["a"]).collect::<Vec<_>>());   // [(1, "a")]
    let mut d = vec![1, 2, 1];
    d.dedup();
    println!("{d:?}");          // [1, 2, 1] — sort first to remove all duplicates
}
```
::

### 18. `HashMap` order is random

Never depend on it in output or tests. Use `BTreeMap` or sort the keys.

### 19. Errors swallowed by `.ok()` / `.flatten()` / `filter_map`

::code-wrapper{language="rust"}
```rust
fn main() {
    let input = ["1", "x", "3"];
    let silent: Vec<i32> = input.iter().filter_map(|s| s.parse().ok()).collect();
    let loud: Result<Vec<i32>, _> = input.iter().map(|s| s.parse::<i32>()).collect();
    println!("{silent:?} {loud:?}");   // [1, 3] Err(ParseIntError { kind: InvalidDigit })
}
```
::

## Smart Pointers & Concurrency

### 20. `RefCell` panics at run time

Holding `cell.borrow()` while calling `cell.borrow_mut()` panics with `RefCell already borrowed`. Keep borrows short.

### 21. `Rc` cycles leak

Two `Rc`s pointing at each other are never freed. Use `Weak` for back-links.

### 22. `let _ = mutex.lock()` unlocks immediately

Bind guards to a name (`let _guard = ...`). The compiler now rejects `let _ =` on a lock.

### 23. A channel loop that never ends

`for msg in rx` waits until **every** `Sender` is dropped — including the original one in `main`. `drop(tx)` before the loop.

### 24. Async: sequential `.await`, blocking calls, locks across `.await`

- `a.await; b.await;` runs one after the other → use `tokio::join!`.
- `std::thread::sleep` inside async freezes other tasks → use `tokio::time::sleep` or `spawn_blocking`.
- A `std::sync::MutexGuard` alive across `.await` makes the task non-`Send` → drop it first.

## Build & Tooling

### 25. `cfg!()` still compiles both branches

`if cfg!(windows) { windows_only_fn(); }` fails to compile on Linux/macOS. Use `#[cfg(windows)]` on the statement.

### 26. Timing in debug mode

Debug builds can be 10–100× slower. Benchmark with `--release` and `std::hint::black_box`.

## 💡 Tips & Tricks

- **Lint** — `cargo clippy` catches many of these automatically (redundant clones, `&Vec` params, needless collects).
- **Debug** — read the whole compiler error, especially the `help:` lines; they often contain the exact fix.
- **Test** — run `cargo test --release` too, so overflow and `debug_assert!` differences surface.
- **Idiom** — prefer `.get()`, `checked_*`, `try_from` and `?` over panicking shortcuts on any external input.

## ⚠️ Edge Cases & Gotchas

The list above *is* the gotcha list. The three that cause the most production bugs:

- **Silent wrong values** — `as` casts and release-mode overflow.
- **Silent swallowed errors** — `.ok()`, `filter_map`, `unwrap_or_default`.
- **Silent ordering assumptions** — `HashMap` iteration, `swap_remove`, derived `Ord` on reordered enums.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
fn average_age(lines: &[&str]) -> u8 {
    let ages: Vec<u8> = lines.iter().filter_map(|l| l.parse().ok()).collect();
    let total: u8 = ages.iter().sum();
    total / ages.len() as u8
}

fn main() {
    println!("{}", average_age(&["30", " 40", "50"]));
}
```
::

<details>
<summary>Answer</summary>

Three pitfalls in four lines:

1. `" 40"` fails to parse (no trim) and `filter_map` silently drops it.
2. `total: u8` overflows once ages add up past 255 (panic in debug, wrong in release).
3. An empty list divides by zero → panic.

::code-wrapper{language="rust"}
```rust
fn average_age(lines: &[&str]) -> Result<Option<u32>, std::num::ParseIntError> {
    let ages: Vec<u32> = lines.iter().map(|l| l.trim().parse()).collect::<Result<_, _>>()?;
    if ages.is_empty() {
        return Ok(None);
    }
    Ok(Some(ages.iter().sum::<u32>() / ages.len() as u32))
}
// average_age(&["30", " 40", "50"]) → Ok(Some(40))
```
::

</details>

## Summary

Most Rust bugs that survive compilation fall into a few families: silent numeric conversions, swallowed errors, hidden ordering assumptions, and borrows or locks held too long. Make the behavior explicit and the compiler — and your tests — will catch the rest.

Next: Exercises & Projects.
