# 15 — Iterators & Combinators

"Zero-cost abstraction" holds because LLVM does enormous, specific work to make it true. This chapter shows *why* `v.iter().map(f).filter(g).sum()` compiles to a hand-rolled loop — and where that guarantee breaks — mostly in code.

## Under-the-Hood Mechanics

The entire `Iterator` trait rests on one required method; everything else is default-implemented on top of it.

::code-wrapper{language="rust" filename="main.rs"}
```rust
pub trait Iterator {
    type Item;
    fn next(&mut self) -> Option<Self::Item>;
    // map, filter, take, sum, collect, ... all default-implemented via next()
}
```
::

Adapters are generic structs, not dynamic wrappers — no vtable, no heap allocation.

::code-wrapper{language="rust" filename="main.rs"}
```rust
// (simplified — roughly what std generates)
struct Map<I, F> { iter: I, f: F }
struct Filter<I, P> { iter: I, predicate: P }

// v.iter().map(f).filter(g) has this concrete, fully-known type:
// Filter<Map<std::slice::Iter<'_, T>, F>, G>
```
::

After monomorphization + inlining, the whole chain collapses to a single loop:

::code-wrapper{language="rust" filename="main.rs"}
```rust
let v: Vec<i32> = (0..1_000_000).collect();
let sum: i32 = v.iter().map(|x| x + 1).filter(|x| x % 2 == 0).sum();
// After inlining: one loop, one branch per element.
// `cargo expand` shows a wall of nested generics — that complexity
// exists at the type level precisely so it can vanish at the machine-code level.
```
::

Laziness follows from the pull model: nothing runs until a consumer calls `.next()`.

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn main() {
    let v = vec![1, 2, 3];
    let iter = v.iter().map(|x| {
        println!("mapping {x}"); // does NOT print yet
        x * 2
    });
    println!("chain built, nothing consumed");
    let doubled: Vec<i32> = iter.collect(); // prints "mapping 1/2/3" HERE
    println!("{doubled:?}");
}
```
::

`collect` dispatches through `FromIterator`, resolved entirely at compile time — no runtime "what collection is this" check.

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn collect<B: FromIterator<Self::Item>>(self) -> B {
    FromIterator::from_iter(self)
}

// Same source iterator, three different FromIterator impls picked at compile time:
let as_vec: Vec<i32> = (1..=3).collect();
let as_set: std::collections::HashSet<i32> = (1..=3).collect();
let as_string: String = ['a', 'b', 'c'].into_iter().collect();
```
::

## Cost, Performance, and Trade-Offs

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Zero-cost is a RELEASE-BUILD guarantee, not universal.
// debug build (opt-level = 0): every adapter is a real, uninlined call
// release build (opt-level = 3): collapses to a tight loop
//
// Never benchmark iterators with `cargo build` / `cargo run` — only `--release`.
```
::

`Box<dyn Iterator<Item = T>>` is the escape hatch when branches return different concrete types — and it reintroduces real cost: one allocation, one vtable call per `.next()`.

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Needed because `impl Iterator` requires ONE concrete return type per function:
fn events(enabled: bool) -> Box<dyn Iterator<Item = i32>> {
    if enabled {
        Box::new((0..10).filter(|x| x % 2 == 0)) // Filter<Range<i32>, _>
    } else {
        Box::new(0..10) // Range<i32> — different concrete type, won't unify with impl Trait
    }
}
```
::

`collect`'s pre-allocation depends on `size_hint` — `.filter()` degrades the bound, `.map()` preserves it.

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Cheap: exact size hint survives map -> one allocation
let v: Vec<i32> = (0..1_000_000).map(|x| x * 2).collect();

// More expensive: filter can't know the output count -> amortized-doubling reallocs
let v: Vec<i32> = (0..1_000_000).filter(|x| x % 2 == 0).collect();

assert_eq!((0..1_000_000).map(|x| x * 2).size_hint(), (1_000_000, Some(1_000_000)));
assert_eq!((0..1_000_000).filter(|x| x % 2 == 0).size_hint().1, None); // no upper bound
```
::

Compile time scales with chain depth and generic fan-out — visible directly:

::code-wrapper{language="rust" filename="main.rs"}
```bash
cargo build --timings   # flags slow-to-monomorphize generic call sites
```
::

## Production Failure Modes & Anti-Patterns

### Collecting an infinite iterator

::code-wrapper{language="rust" filename="main.rs"}
```rust
// WRONG: hangs / OOMs, no panic, no compiler error
fn generate_ids() -> Vec<u64> {
    (0..).map(|x| x * 2).collect() // RangeFrom has no upper bound
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// RIGHT: bound unbounded sources explicitly
fn generate_ids(count: usize) -> Vec<u64> {
    (0..).map(|x| x * 2).take(count).collect()
}
```
::

### Holding a borrow alive across a chain, then dropping the source

::code-wrapper{language="rust" filename="main.rs"}
```rust
// WRONG-SHAPED (compiles as written, breaks one refactor later):
fn process(v: &Vec<i32>) -> impl Iterator<Item = i32> + '_ {
    v.iter().map(|x| x * 2) // ties the returned iterator's lifetime to `v`
}

fn main() {
    // let it = process(&vec![1, 2, 3]); // temporary Vec dropped -> caught by compiler HERE
    let owned = vec![1, 2, 3];
    let it = process(&owned); // fine, but only because `owned` outlives `it`
    println!("{:?}", it.collect::<Vec<_>>());
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// RIGHT: decide ownership up front instead of chasing lifetime errors later
fn process_owned(v: Vec<i32>) -> impl Iterator<Item = i32> {
    v.into_iter().map(|x| x * 2) // owns its data, no borrow to outlive
}
```
::

### Silently dropping errors with `.flatten()`

::code-wrapper{language="rust" filename="main.rs"}
```rust
// WRONG: looks correct, silently discards every parse failure
fn parse_all(inputs: &[&str]) -> Vec<i32> {
    inputs.iter()
        .map(|s| s.parse::<i32>())  // Iterator<Item = Result<i32, ParseIntError>>
        .flatten()                  // Result: Err -> 0 items, Ok -> 1 item
        .collect()
}

fn main() {
    let bad = ["1", "oops", "3"];
    println!("{:?}", parse_all(&bad)); // [1, 3] — "oops" vanished, no error, no log
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// RIGHT: fail the whole batch on first error
fn parse_all_strict(inputs: &[&str]) -> Result<Vec<i32>, std::num::ParseIntError> {
    inputs.iter().map(|s| s.parse::<i32>()).collect() // Result<Vec<_>, _> via FromIterator
}

// RIGHT: keep successes AND surface failures
fn parse_all_partial(inputs: &[&str]) -> (Vec<i32>, Vec<String>) {
    let mut ok = Vec::new();
    let mut errs = Vec::new();
    for s in inputs {
        match s.parse::<i32>() {
            Ok(n) => ok.push(n),
            Err(e) => errs.push(format!("{s}: {e}")),
        }
    }
    (ok, errs)
}
```
::

### `Box<dyn Iterator>` in a hot loop after a well-intentioned refactor

::code-wrapper{language="rust" filename="main.rs"}
```rust
// WRONG: "clean up the API" refactor reintroduces vtable overhead
// in what used to be a fully inlined, monomorphized hot loop
struct Event { valid: bool }
fn events() -> impl Iterator<Item = Event> { std::iter::empty() }

fn make_pipeline(filter_enabled: bool) -> Box<dyn Iterator<Item = Event>> {
    if filter_enabled {
        Box::new(events().filter(|e| e.valid)) // called per-packet -> per-.next() vtable hit
    } else {
        Box::new(events())
    }
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// RIGHT: push the runtime condition INSIDE the chain, stay monomorphized
fn make_pipeline_fast(filter_enabled: bool) -> impl Iterator<Item = Event> {
    events().filter(move |e| !filter_enabled || e.valid)
}
```
::

## Architectural Application

`impl Iterator` in a public signature commits you to one concrete return type forever; `Box<dyn Iterator>` trades that rigidity for dynamic dispatch cost.

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Locks in static dispatch — adding a second concrete return type later is a breaking change
pub fn ids() -> impl Iterator<Item = u64> { (0..100).map(|x| x as u64) }

// Flexible, but every .next() pays a vtable indirection
pub fn ids_dyn() -> Box<dyn Iterator<Item = u64>> { Box::new((0..100).map(|x| x as u64)) }
```
::

Accepting `impl Iterator<Item = T>` instead of `Vec<T>` commits a function to streaming — bounded memory regardless of input size.

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Streaming: works on a source larger than memory (file lines, paginated API)
fn sum_all(items: impl Iterator<Item = i64>) -> i64 { items.sum() }

// Materializing: caller must build the whole Vec first, even for a one-pass consumer
fn sum_all_vec(items: Vec<i64>) -> i64 { items.into_iter().sum() }
```
::

A custom `Iterator` impl expresses a state machine as data flow — a decoder gets every combinator for free.

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Decoder<'a> { bytes: &'a [u8], pos: usize }

impl<'a> Iterator for Decoder<'a> {
    type Item = u8;
    fn next(&mut self) -> Option<u8> {
        let b = *self.bytes.get(self.pos)?;
        self.pos += 1;
        Some(b)
    }
}

fn main() {
    let d = Decoder { bytes: &[1, 2, 3, 0, 4], pos: 0 };
    let before_zero: Vec<u8> = d.take_while(|&b| b != 0).collect(); // free combinator
    println!("{before_zero:?}"); // [1, 2, 3]
}
```
::

## 💡 Tips & Tricks

- **Debug**: splice `.inspect()` into a chain instead of collecting early just to `println!`.

::code-wrapper{language="rust" filename="main.rs"}
```rust
let sum: i32 = (1..=3)
    .inspect(|x| eprintln!("before map: {x}"))
    .map(|x| x * 10)
    .inspect(|x| eprintln!("after map: {x}"))
    .sum();
```
::

- **Idiom**: `.filter_map()` beats `.filter().map()` when both depend on the same `Option`.

::code-wrapper{language="rust" filename="main.rs"}
```rust
// WRONG-ISH: parses twice
let ok: Vec<i32> = ["1", "x", "3"].iter()
    .filter(|s| s.parse::<i32>().is_ok())
    .map(|s| s.parse::<i32>().unwrap())
    .collect();

// RIGHT: parses once
let ok: Vec<i32> = ["1", "x", "3"].iter()
    .filter_map(|s| s.parse::<i32>().ok())
    .collect();
```
::

- **Performance**: `.copied()` over `.cloned()` for `Copy` types — fails to compile instead of silently deep-cloning later.

::code-wrapper{language="rust" filename="main.rs"}
```rust
let v = vec![1, 2, 3];
let a: Vec<i32> = v.iter().copied().collect(); // compiles: i32 is Copy
// let b: Vec<String> = strings.iter().copied().collect(); // won't compile — forces .cloned()
```
::

- **Debug**: resolve `collect()` type-inference errors with a turbofish at the call site, not an outer annotation.

::code-wrapper{language="rust" filename="main.rs"}
```rust
let v = (1..5).collect::<Vec<_>>(); // isolates ambiguity here, not at `let v: ??? =`
```
::

- **Idiom**: `std::iter::successors` expresses lazy "unfold" without a manual `while let` + `Vec`.

::code-wrapper{language="rust" filename="main.rs"}
```rust
let collatz: Vec<u64> = std::iter::successors(Some(27), |&x| {
    if x == 1 { None } else if x % 2 == 0 { Some(x / 2) } else { Some(3 * x + 1) }
}).collect();
```
::

## ⚠️ Edge Cases & Gotchas

- **Adapters do no work until consumed** — a `println!` inside `.map()` never fires "up front" (see the Under-the-Hood example above).

- **`for x in vec` consumes `vec`.**

::code-wrapper{language="rust" filename="main.rs"}
```rust
let v = vec![1, 2, 3];
for x in v { println!("{x}"); }
// println!("{v:?}"); // ERROR: value moved — use `for x in &v` to keep ownership
```
::

- **Infinite iterator + `.count()`/`.sum()`/`.collect()` hangs or OOMs — no panic, no warning.**

- **`.rev()` on `(0..)` doesn't compile** — `RangeFrom` isn't `DoubleEndedIterator`; there's no end to reverse from.

- **`.zip()` silently truncates to the shorter side.**

::code-wrapper{language="rust" filename="main.rs"}
```rust
let short = vec![1, 2, 3];
let long = vec!["a", "b", "c", "d", "e"];
let pairs: Vec<_> = short.iter().zip(long.iter()).collect();
assert_eq!(pairs.len(), 3); // "d" and "e" silently dropped, no error
```
::

- **`.flatten()` on `Iterator<Item = Result<T, E>>` silently discards every `Err`** — use `.collect::<Result<Vec<_>, _>>()` instead (see anti-pattern above).

- **Calling `.next()` again after `None` is unspecified, not guaranteed forever-`None`.**

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Weird(u8);
impl Iterator for Weird {
    type Item = u8;
    fn next(&mut self) -> Option<u8> {
        self.0 += 1;
        if self.0 % 3 == 0 { None } else { Some(self.0) } // None isn't final here!
    }
}
// .fuse() is the explicit contract fix when a hard guarantee is required:
let fused = Weird(0).fuse();
```
::

- **`Peekable::peek()` does not consume.**

::code-wrapper{language="rust" filename="main.rs"}
```rust
let mut it = [1, 2, 3].into_iter().peekable();
assert_eq!(it.peek(), Some(&1));
assert_eq!(it.next(), Some(1)); // peeked item is still returned by next()
```
::

## 🧠 Spot the Bug

What does this print?

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn main() {
    let v = vec![1, 2, 3];
    let mut iter = v.iter().map(|x| {
        println!("mapping {x}");
        x * 2
    });

    println!("about to consume");
    let doubled_first = iter.next();
    println!("got: {doubled_first:?}");
}
```
::

<details>
<summary>Answer</summary>

::code-wrapper{language="rust" filename="main.rs"}
```rust
about to consume
mapping 1
got: Some(2)
```
::

Not the eager order (`mapping 1/2/3` before `about to consume`) that developers from eager pipeline abstractions expect. `.map()` builds an adapter struct and does no work until pulled — one `.next()` call demands exactly one element, so only `1` is ever touched.

</details>

## Summary

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Pull-based: nothing runs until .next() is called (for/collect/sum/...)
v.iter().map(f).filter(g); // builds structs, does zero work

// "Zero-cost" = release-build inlining outcome, breaks at a dyn boundary:
let fast: impl Iterator<Item = i32> = (0..5).map(|x| x); // inlinable
let slow: Box<dyn Iterator<Item = i32>> = Box::new((0..5).map(|x| x)); // vtable per .next()

// collect() efficiency depends on size_hint propagation through the chain
(0..1000).map(|x| x).collect::<Vec<_>>();      // exact hint -> one alloc
(0..1000).filter(|x| x % 2 == 0).collect::<Vec<_>>(); // degraded hint -> reallocs

// Never collect an unbounded source without .take(n) first
(0..).take(10).collect::<Vec<_>>();
```
::

Next: Traits and generics — how static dispatch, monomorphization, and vtables actually get generated, and what each costs.
