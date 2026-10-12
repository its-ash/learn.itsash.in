# 15 — Iterators

An **iterator** produces items one at a time through `next()`, which returns `Some(item)` until it returns `None`. Adapters like `map` and `filter` build a pipeline; nothing runs until something **consumes** it.

## `iter`, `iter_mut`, `into_iter`

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![1, 2, 3];

    for x in v.iter() { print!("{x} "); }          // x: &i32     — borrow
    println!();
    for x in v.iter_mut() { *x *= 10; }            // x: &mut i32 — modify in place
    println!("{v:?}");                             // [10, 20, 30]
    for x in v.into_iter() { print!("{x} "); }     // x: i32      — consumes v
    println!();
    // println!("{v:?}");                          // error[E0382]: borrow of moved value: `v`
}
```
::

`for x in &v` is the same as `v.iter()`; `for x in &mut v` is `v.iter_mut()`; `for x in v` is `v.into_iter()`.

## Lazy Until Consumed

**Tricky**: this prints nothing:

::code-wrapper{language="rust"}
```rust
fn main() {
    let v = vec![1, 2];
    v.iter().map(|x| println!("{x}"));
    // warning: unused `Map` that must be used
    // note: iterators are lazy and do nothing unless consumed
}
```
::

Consumers: `for`, `collect`, `sum`, `count`, `fold`, `for_each`, `max`, `find`, `any`, `all`…

**Tricky**: laziness means work stops early:

::code-wrapper{language="rust"}
```rust
fn main() {
    let v = vec![1, 2, 3, 4, 5, 6];
    let mut calls = 0;
    let doubled: Vec<i32> = v.iter().map(|x| { calls += 1; x * 2 }).take(2).collect();
    println!("{doubled:?} calls={calls}");   // [2, 4] calls=2 — not 6
}
```
::

## Common Adapters

::code-wrapper{language="rust"}
```rust
fn main() {
    let v = vec![1, 2, 3, 4, 5, 6];

    let evens: Vec<i32> = v.iter().filter(|&&x| x % 2 == 0).cloned().collect();
    println!("{evens:?}");                                       // [2, 4, 6]

    let squares: Vec<i32> = v.iter().map(|x| x * x).collect();
    println!("{squares:?}");                                     // [1, 4, 9, 16, 25, 36]

    println!("{}", (1..=4).fold(0, |acc, x| acc + x * x));       // 30
    println!("{:?}", v.iter().position(|&x| x == 4));            // Some(3)
    println!("{:?}", v.iter().find(|&&x| x > 4));                // Some(5)
    println!("{}", v.iter().any(|&x| x > 5));                    // true
    println!("{:?}", (0..).step_by(5).take(3).collect::<Vec<_>>()); // [0, 5, 10] — infinite range, safe with take
    println!("{:?}", "a-b-c".split('-').rev().collect::<Vec<_>>());  // ["c", "b", "a"]
}
```
::

**Why `|&&x|`?** `v.iter()` yields `&i32`, and `filter` passes a reference **to that item**, so the closure gets `&&i32`. The pattern `&&x` unwraps both. (`|x| **x % 2 == 0` is the same thing.)

### `take_while` vs `filter`

::code-wrapper{language="rust"}
```rust
fn main() {
    let v = [1, 5, 2, 6];
    println!("{:?}", v.iter().filter(|&&x| x < 4).collect::<Vec<_>>());      // [1, 2] — checks all
    println!("{:?}", v.iter().take_while(|&&x| x < 4).collect::<Vec<_>>());  // [1]    — stops at the first fail
}
```
::

### Order of adapters matters

::code-wrapper{language="rust"}
```rust
fn main() {
    let v = ["a", "b", "c", "d"];
    let a: Vec<_> = v.iter().enumerate().skip(1).map(|(i, _)| i).collect();
    let b: Vec<_> = v.iter().skip(1).enumerate().map(|(i, _)| i).collect();
    println!("{a:?}");   // [1, 2, 3] — indexes counted BEFORE skipping
    println!("{b:?}");   // [0, 1, 2] — indexes counted AFTER skipping
}
```
::

### `zip` stops at the shorter one

::code-wrapper{language="rust"}
```rust
fn main() {
    let pairs: Vec<_> = [1, 2, 3].iter().zip(["a", "b"]).collect();
    println!("{pairs:?}");   // [(1, "a"), (2, "b")] — the 3 is silently dropped
}
```
::

## `collect` and `sum` Need a Target Type

**Tricky**: these fail without a type:

::code-wrapper{language="rust"}
```rust
fn main() {
    let v = vec![1, 2];
    // let s = v.iter().sum();                      // error[E0283]: type annotations needed
    // let c = v.iter().map(|x| x * 2).collect();   // error[E0283]: type annotations needed

    let s: i32 = v.iter().sum();
    let c: Vec<i32> = v.iter().map(|x| x * 2).collect();
    let c2 = v.iter().map(|x| x * 2).collect::<Vec<_>>();   // "turbofish" syntax
    println!("{s} {c:?} {c2:?}");
}
```
::

**Tricky**: the sum type can overflow even when the items fit:

::code-wrapper{language="rust"}
```rust
fn main() {
    let bytes = vec![1u8, 200, 100];
    // let s: u8 = bytes.iter().sum();     // 301 doesn't fit u8 → panic in debug
    let s: u32 = bytes.iter().map(|&b| b as u32).sum();
    println!("{s}");                        // 301
}
```
::

### Collecting `Result`s

::code-wrapper{language="rust"}
```rust
fn main() {
    let words = ["1", "2", "x", "4"];

    // Stops at the first error:
    let all: Result<Vec<i32>, _> = words.iter().map(|w| w.parse::<i32>()).collect();
    println!("{all:?}");    // Err(ParseIntError { kind: InvalidDigit })

    // Silently skips errors — sometimes what you want, often a hidden bug:
    let ok: Vec<i32> = words.iter().filter_map(|w| w.parse().ok()).collect();
    println!("{ok:?}");     // [1, 2, 4]
}
```
::

## Picking Max and Min

::code-wrapper{language="rust"}
```rust
fn main() {
    let names = ["bob", "al", "christine"];
    println!("{:?}", names.iter().max_by_key(|s| s.len()));   // Some("christine")
    println!("{:?}", names.iter().min_by_key(|s| s.len()));   // Some("al")

    let empty: Vec<i32> = vec![];
    println!("{:?}", empty.iter().max());                     // None — no panic

    let floats = [2.5, 1.0, 3.7];
    // floats.iter().max();                                   // error: f64 is not Ord
    let m = floats.iter().copied().fold(f64::MIN, f64::max);
    println!("{m}");                                          // 3.7
}
```
::

## Peeking

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut it = [1, 2, 3].iter().peekable();
    while let Some(x) = it.next() {
        if let Some(next) = it.peek() {
            print!("{x}->{next} ");    // 1->2 2->3
        }
    }
    println!();
}
```
::

## Writing Your Own Iterator

::code-wrapper{language="rust"}
```rust
struct Countdown(u32);

impl Iterator for Countdown {
    type Item = u32;
    fn next(&mut self) -> Option<u32> {
        if self.0 == 0 {
            None
        } else {
            self.0 -= 1;
            Some(self.0 + 1)
        }
    }
}

fn main() {
    let v: Vec<u32> = Countdown(3).collect();
    println!("{v:?}");                         // [3, 2, 1]
    println!("{}", Countdown(4).sum::<u32>()); // 10 — all adapters come for free
}
```
::

## 💡 Tips & Tricks

- **Idiom** — `.copied()` (for `Copy` items) or `.cloned()` turns `&T` items into `T`.
- **Idiom** — `filter_map` = `filter` + `map` in one step, perfect with `.ok()` or `.parse().ok()`.
- **Idiom** — `collect::<Result<Vec<_>, _>>()` to fail on the first error.
- **Debug** — `.inspect(|x| println!("{x:?}"))` peeks into the middle of a pipeline.
- **Performance** — iterator chains compile to loops as fast as hand-written ones, often without bounds checks.

## ⚠️ Edge Cases & Gotchas

- **Lazy** — `map` without a consumer does nothing (the compiler warns).
- **Types** — `sum()` and `collect()` usually need a type annotation.
- **References** — `iter().filter(...)` gives `&&T` to the closure.
- **zip** — silently drops the extra items of the longer side.
- **Order** — `enumerate().skip(n)` and `skip(n).enumerate()` number items differently.
- **Errors** — `flatten()` / `filter_map(.ok())` on `Result`s throw errors away silently.
- **Infinite** — `(0..).collect::<Vec<_>>()` never ends; always `take` first.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
fn total_prices(lines: &[&str]) -> f64 {
    lines.iter().map(|l| l.parse::<f64>()).flatten().sum()
}

fn main() {
    println!("{}", total_prices(&["9.99", "4,50", "1.01"]));
}
```
::

<details>
<summary>Answer</summary>

Prints `11` — `"4,50"` (comma instead of dot) fails to parse, and `.flatten()` on `Result`s silently drops the error. The total is wrong and nobody is told.

Make the error visible:

::code-wrapper{language="rust"}
```rust
fn total_prices(lines: &[&str]) -> Result<f64, std::num::ParseFloatError> {
    lines.iter().map(|l| l.parse::<f64>()).sum()   // Sum works on Result too: stops at the first Err
}
```
::

</details>

## 🧠 Quick Quiz

::code-wrapper{language="rust"}
```rust
fn main() {
    let r: Vec<i32> = (1..=10)
        .filter(|n| n % 3 == 0)
        .map(|n| n * n)
        .take_while(|&n| n < 50)
        .collect();
    println!("{r:?}");
}
```
::

<details>
<summary>Answer</summary>

`[9, 36]` — multiples of 3 are 3, 6, 9; squared: 9, 36, 81. `take_while` stops at 81.

</details>

## Summary

Iterators are lazy pipelines: adapters (`map`, `filter`, `zip`, `enumerate`) describe work, consumers (`collect`, `sum`, `for`) run it. Annotate the result type, watch `&&x` in `filter`, and don't silently drop `Err`s.

Next: Traits & Generics.
