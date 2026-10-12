# 31 — Performance

Rust is fast by default, but the biggest wins still come from **measuring** and picking the right data structure — not from clever tricks.

## Rule 1: Measure in Release Mode

::code-wrapper{language="bash"}
```bash
cargo run             # debug: no optimizations — often 10–100× slower
cargo run --release   # optimized — the only numbers that matter
```
::

The same summing loop (100 million additions), measured:

| Build | Time |
|---|---|
| debug | ~540 ms |
| release | ~0 ms — the optimizer computed the answer without running the loop |

**Tricky**: that second number is a lie in the other direction. If the result isn't used, the compiler may delete the work. Use `std::hint::black_box` when timing:

::code-wrapper{language="rust"}
```rust
use std::hint::black_box;
use std::time::Instant;

fn main() {
    let t = Instant::now();
    let mut sum = 0u64;
    for i in 0..100_000_000u64 {
        sum = black_box(sum + i);      // "pretend this value is used" — stops the optimizer cheating
    }
    println!("{:?} {sum}", t.elapsed());   // a real ~280ms, not 0
}
```
::

For real benchmarks use the `criterion` crate — it warms up, repeats and gives statistics:

::code-wrapper{language="rust" filename="benches/sum.rs"}
```rust
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn bench(c: &mut Criterion) {
    let data: Vec<u64> = (0..10_000).collect();
    c.bench_function("sum", |b| b.iter(|| black_box(&data).iter().sum::<u64>()));
}

criterion_group!(benches, bench);
criterion_main!(benches);
```
::

## Rule 2: Pick the Right Data Structure

These are real measurements (release build, 20k–100k items):

::code-wrapper{language="rust"}
```rust
use std::collections::{HashSet, VecDeque};

fn main() {
    let big: Vec<u32> = (0..20_000).collect();

    // Vec::contains is a linear scan: 20k lookups ≈ 10 ms
    let hits = (0..20_000).filter(|i| big.contains(i)).count();

    // HashSet::contains is a hash lookup: 20k lookups ≈ 0.1 ms  (~100× faster)
    let set: HashSet<u32> = big.iter().copied().collect();
    let hits2 = (0..20_000).filter(|i| set.contains(i)).count();
    println!("{hits} {hits2}");

    // Vec::remove(0) shifts every element: emptying 100k items ≈ 400 ms
    // VecDeque::pop_front is O(1):           emptying 100k items ≈ microseconds
    let mut q: VecDeque<u32> = (0..100_000).collect();
    while q.pop_front().is_some() {}
}
```
::

## Hidden O(n²) Loops

**Tricky**: these look like one loop, but each step is itself a loop:

::code-wrapper{language="rust"}
```rust
fn main() {
    let text = "ab".repeat(20_000);

    // SLOW (~32 ms): chars().nth(i) walks from the start every time → O(n²)
    let mut slow = 0;
    for i in 0..text.len() {
        if text.chars().nth(i) == Some('a') { slow += 1; }
    }

    // FAST (~0.03 ms): one pass → O(n)
    let fast = text.chars().filter(|&c| c == 'a').count();
    println!("{slow} {fast}");
}
```
::

Other common ones: `v.remove(0)` in a loop, `v.contains(x)` in a loop, `s.insert(0, c)` on a `String` in a loop.

## Avoid Needless Allocation

::code-wrapper{language="rust"}
```rust
fn main() {
    // Reserve when you know the size
    let mut v = Vec::with_capacity(1000);
    for i in 0..1000 { v.push(i); }       // no re-allocations

    // Borrow instead of clone
    let names = vec![String::from("ada"), String::from("bob")];
    let total: usize = names.iter().map(|s| s.len()).sum();   // no clones
    println!("{total}");

    // Reuse one buffer inside loops
    let mut line = String::new();
    for i in 0..3 {
        line.clear();                     // keeps the capacity
        line.push_str("row ");
        line.push_str(&i.to_string());
        println!("{line}");
    }
}
```
::

## Faster Output

**Tricky**: `println!` locks stdout on **every** call. In a hot loop, lock once and buffer:

::code-wrapper{language="rust"}
```rust
use std::io::{BufWriter, Write};

fn main() {
    let stdout = std::io::stdout();
    let mut out = BufWriter::new(stdout.lock());
    for i in 0..100_000 {
        writeln!(out, "{i}").unwrap();    // much faster than println! for big outputs
    }
}                                         // BufWriter flushes when dropped
```
::

## Profiling: Find the Real Hot Spot

::code-wrapper{language="bash"}
```bash
cargo install flamegraph
cargo flamegraph --bin myapp      # Linux/macOS: draws where time is spent

cargo install samply
samply record ./target/release/myapp   # cross-platform, opens a web UI
```
::

Add debug symbols to release builds while profiling:

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[profile.release]
debug = true
```
::

## 💡 Tips & Tricks

- **Measure** — always `--release`, always `black_box`, ideally `criterion`.
- **Data structures** — `HashSet`/`HashMap` for lookups, `VecDeque` for queues, `Vec` for everything else.
- **Allocation** — `with_capacity`, `clear()` + reuse, borrow instead of clone.
- **Iterators** — single-pass iterator chains are as fast as hand-written loops and skip bounds checks.
- **Output** — `BufWriter` + `stdout().lock()` for large outputs.
- **Profile first** — a flamegraph usually shows one obvious hot spot you would not have guessed.

## ⚠️ Edge Cases & Gotchas

- **Debug builds** — timing in debug mode is meaningless.
- **Dead code** — unused results get optimized away; benchmarks then show ~0 ns.
- **Hidden loops** — `chars().nth`, `contains`, `remove(0)` inside loops are O(n²).
- **println!** — locks and flushes per line; slow in loops.
- **clone()** — cheap to write, expensive at run time for big `Vec`/`String`.
- **Micro-tuning** — `#[inline(always)]` and `unsafe` tricks rarely help; algorithm and data structure choices do.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
fn dedupe(input: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for s in input {
        if !out.contains(s) {
            out.push(s.clone());
        }
    }
    out
}
```
::

It's fine for 100 items and takes minutes for 1 million. Why?

<details>
<summary>Answer</summary>

`out.contains(s)` scans the whole output vector for each input → O(n²).

Track seen items in a `HashSet` (keeps the original order):

::code-wrapper{language="rust"}
```rust
use std::collections::HashSet;

fn dedupe(input: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    input.iter()
        .filter(|s| seen.insert(s.as_str()))   // insert returns false if already present
        .cloned()
        .collect()
}
```
::

</details>

## Summary

Measure in release mode with `black_box`/`criterion`, profile before optimizing, and fix algorithms first: the right collection and removing hidden O(n²) loops beat any micro-optimization.

Next: Documentation.
