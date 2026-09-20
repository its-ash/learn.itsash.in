# 14 — Collections (`Vec`, `String`, `HashMap`, and more)

Every collection in `std::collections` trades memory layout for access pattern: `Vec` trades cheap front-insertion for cache locality, `HashMap` trades order for O(1) lookup, `BTreeMap` trades O(1) for order. Picking wrong is invisible at n = 10 and expensive at n = 10,000,000.

## Under-the-Hood Mechanics

### `Vec<T>`: three words, one allocation

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Vec<T> {
    ptr: *mut T,      // pointer to a single heap allocation
    len: usize,       // elements currently initialized
    capacity: usize,  // elements the allocation can hold before resizing
}
```
::

Fixed 24-byte header on 64-bit, regardless of element count — only the heap allocation behind `ptr` scales:

::code-wrapper{language="rust" filename="main.rs"}
```rust
let mut v: Vec<i32> = Vec::new();          // ptr: dangling, len: 0, cap: 0 — no allocation yet
v.push(1);                                  // first push allocates cap = 4 (impl detail)
println!("{}", std::mem::size_of_val(&v));  // 24, whether v holds 1 element or 10 million

let empty: Vec<i32> = Vec::new();
let full: Vec<i32> = (0..10_000_000).collect();
assert_eq!(std::mem::size_of_val(&empty), std::mem::size_of_val(&full)); // both 24 bytes
```
::

Growth is geometric: at `len == capacity`, `push` allocates a new block (`capacity * 2`), `memcpy`s everything over, frees the old block. Resizes at 1, 2, 4, 8, ..., 2^k bound total copying to ~2n across n pushes — that's where "amortized O(1) push" comes from:

::code-wrapper{language="rust" filename="main.rs"}
```rust
let mut v = Vec::new();
let mut last_cap = 0;
for i in 0..20 {
    v.push(i);
    if v.capacity() != last_cap {
        println!("len={} triggered realloc to cap={}", v.len(), v.capacity());
        last_cap = v.capacity();
    }
}
// Output shows doubling: cap jumps 0->4->8->16->32 (exact sequence is impl-defined,
// but growth is always geometric, never +1 per push)
```
::

The layout guarantees `std` actually documents (worth knowing before relying on any of them):

- **It is and always will be a `(ptr, len, capacity)` triplet** — field order is unspecified, so never `transmute` a `Vec` to your own tuple and back
- **A `Vec` with capacity 0 does not allocate** — `Vec::new()`, `vec![]`, and `Vec::with_capacity(0)` are all allocation-free until first push
- **`size_of::<T>() * capacity > 0` iff allocation exists** — a `Vec<()>` never allocates, and its `capacity()` reports `usize::MAX`
- **`push`/`insert` never reallocate when reported capacity suffices** — the `capacity()` value is accurate and reliable, usable for manual memory management
- **No small-buffer optimization, ever** — elements always live on the heap; a moved `Vec` keeps a stable buffer address (this is why unsafe code can rely on `as_ptr()` staying valid across moves)
- **`Vec` never shrinks automatically** — emptying and refilling to the same length reuses the existing allocation with zero allocator traffic; only `shrink_to_fit` releases it
- **Removed data is not zeroed** — don't rely on `remove`/`truncate` to scrub secrets; the optimizer may eliminate "dead" zeroing writes anyway

::code-wrapper{language="rust" filename="main.rs"}
```rust
// ZST capacity behavior, straight from the docs:
let units: Vec<()> = Vec::with_capacity(10);
assert_eq!(units.capacity(), usize::MAX); // no allocation is ever needed for ()

// Capacity accuracy — the documented contract unsafe code may rely on:
let mut v = Vec::with_capacity(3);
v.push(1); v.push(2); v.push(3);
let ptr_before = v.as_ptr();
v.push(4); // len == capacity was 3 == 3, so THIS push reallocates
// ptr_before now dangles — never hold raw pointers across a potential realloc
```
::

### `String`: `Vec<u8>` plus a compiler-enforced invariant

Identical three-word layout to `Vec<u8>`. The only difference is a type-level invariant checked at construction boundaries, not on every access:

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Checked once, at the boundary:
let s = String::from_utf8(vec![240, 159, 166, 128]).unwrap(); // "🦀" — validated here
let bad = String::from_utf8(vec![0xFF, 0xFE]);
assert!(bad.is_err()); // invalid UTF-8 rejected at construction, not at use

// Skipping the check when validity is already proven elsewhere:
let bytes = String::from("trusted").into_bytes(); // came from a String, already valid UTF-8
let s2 = unsafe { String::from_utf8_unchecked(bytes) }; // no re-check — your proof obligation
```
::

### `HashMap<K, V>`: buckets, SipHash, and why iteration order is chaos

Rust's `HashMap` (via `hashbrown`) uses SwissTable-style open addressing — hash to a slot, probe on collision. Two consequences:

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::collections::HashMap;

let mut m = HashMap::new();
m.insert("a", 1);
m.insert("b", 2);
m.insert("c", 3);
for (k, v) in &m {
    println!("{k}: {v}"); // order unrelated to insertion, differs across process runs
}
```
::

That randomization is deliberate: `RandomState` seeds SipHash-1-3 from OS entropy per-hasher, so an attacker can't craft colliding keys to degrade lookups to O(n) (hash-flooding DoS). `BTreeMap` takes the opposite trade — a B-tree with sorted, cache-tuned nodes:

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::collections::{HashMap, BTreeMap};

let mut hm: HashMap<u32, &str> = HashMap::new();   // hash -> bucket, O(1) avg, order chaos
let mut bt: BTreeMap<u32, &str> = BTreeMap::new(); // sorted B-tree nodes, O(log n)

bt.insert(3, "c"); bt.insert(1, "a"); bt.insert(2, "b");
let ordered: Vec<_> = bt.keys().collect();
assert_eq!(ordered, vec![&1, &2, &3]); // always sorted — a structural guarantee

// Range queries walk only the bounded slice of the tree, not the whole map:
for (k, v) in bt.range(1..3) {
    println!("{k} -> {v}"); // prints keys 1 and 2 only
}
```
::

The full default-hashing contract, and what you agree to when you swap it:

- The table is a Rust port of Google's **SwissTable** — open addressing with quadratic probing and SIMD metadata lookup, not a chained-bucket list
- Default algorithm is **SipHash 1-3**, randomly seeded per hasher from a best-effort secure source; seed quality depends on system entropy at creation (boot-time maps get weaker seeds)
- Swapping hashers via `with_hasher`/`with_capacity_and_hasher` **removes the DoS resistance** — the docs call this out as exposing a deliberate attack vector, acceptable only for trusted inputs
- Keys must satisfy `k1 == k2 → hash(k1) == hash(k2)`; violating it (or mutating a key's hash in place through interior mutability) is a *logic error* — results are unspecified but contained (panics, wrong answers, leaks — no UB)
- Lookup is **`Borrow`-based**: `get` accepts any `Q` where `K: Borrow<Q>` and `Q: Hash + Eq` — that's why a `HashMap<String, V>` is queryable by `&str` without cloning the key

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::collections::HashMap;
use std::hash::{Hash, Hasher};

// Borrow-based lookup in action: owned keys, borrowed queries — no allocation
let mut reviews: HashMap<String, &str> = HashMap::new();
reviews.insert("Pride and Prejudice".to_string(), "enjoyable");
assert_eq!(reviews.get("Pride and Prejudice"), Some(&"enjoyable")); // &str probe, no clone

// Hash equality MUST track Eq equality — this key hashes by id only, so it matches
// any other key with the same id even though `name` differs:
#[derive(Debug)]
struct User { id: u32, name: &'static str }
impl PartialEq for User {
    fn eq(&self, o: &Self) -> bool { self.id == o.id } // name deliberately ignored
}
impl Eq for User {}
impl Hash for User {
    fn hash<H: Hasher>(&self, h: &mut H) { self.id.hash(h) } // hash exactly what eq compares
}
let mut by_user: HashMap<User, u32> = HashMap::new();
by_user.insert(User { id: 1, name: "Jessica" }, 100);
assert!(by_user.contains_key(&User { id: 1, name: "Jess" })); // equal by (id), so it hits
```
::

## Cost, Performance, and Trade-Offs

`Vec::new()` + n pushes triggers ~log₂(n) reallocations; `with_capacity` collapses that to one allocation:

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Naive: ~20 reallocations + ~20 memcpy passes for 1M elements
let mut v = Vec::new();
for i in 0..1_000_000 { v.push(i); }

// Production: one allocation, zero reallocation churn
let mut v = Vec::with_capacity(1_000_000);
for i in 0..1_000_000 { v.push(i); } // len grows, capacity never moves
```
::

SipHash is 2-4x slower than a non-cryptographic hash for typical keys. Swap it out for trusted, non-adversarial keys only:

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::collections::HashMap;
use std::hash::BuildHasherDefault;
use rustc_hash::FxHasher;

// Default: DoS-resistant, slower — fine for attacker-reachable keys (HTTP headers, form fields)
let safe: HashMap<String, u32> = HashMap::new();

// FxHashMap: faster, no DoS resistance — only for internal, trusted keys (interned IDs, enums)
type FxHashMap<K, V> = HashMap<K, V, BuildHasherDefault<FxHasher>>;
let fast: FxHashMap<u32, u32> = FxHashMap::default();
```
::

`BTreeMap` pointer-chases between nodes (cache misses); `HashMap` scans a near-flat bucket array:

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::collections::{HashMap, BTreeMap};
use std::time::Instant;

let n = 1_000_000u32;
let hm: HashMap<u32, u32> = (0..n).map(|i| (i, i)).collect();
let bt: BTreeMap<u32, u32> = (0..n).map(|i| (i, i)).collect();

let t = Instant::now();
for i in 0..n { std::hint::black_box(hm.get(&i)); }
println!("HashMap: {:?}", t.elapsed()); // near-flat array scan

let t = Instant::now();
for i in 0..n { std::hint::black_box(bt.get(&i)); }
println!("BTreeMap: {:?}", t.elapsed()); // O(log n) but each hop is a potential cache miss
```
::

Monomorphization bloat: every distinct `T` compiles its own copy of every `Vec<T>` method used.

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Foo(u64);
struct Bar(u64);
struct Baz(u64);

let vf: Vec<Foo> = Vec::with_capacity(10); // separate compiled push/drop/etc. per type
let vb: Vec<Bar> = Vec::with_capacity(10);
let vz: Vec<Baz> = Vec::with_capacity(10);
// `cargo bloat` on a binary with hundreds of element types will show this cost directly
```
::

## Production Failure Modes & Anti-Patterns

### The double-lookup that silently doubles your hashing cost

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::collections::HashMap;

// WRONG: two hash computations, two lookups, and a race if this were concurrent
fn count_word_wrong(counts: &mut HashMap<String, u32>, word: &str) {
    if !counts.contains_key(word) {
        counts.insert(word.to_string(), 0);
    }
    *counts.get_mut(word).unwrap() += 1;
}

// RIGHT: single lookup via the Entry API
fn count_word(counts: &mut HashMap<String, u32>, word: &str) {
    *counts.entry(word.to_string()).or_insert(0) += 1;
}
```
::

At a few hundred calls this is invisible; over billions of tokens in a log-processing job, the redundant hashing shows up directly in profiler output.

### Unordered `HashMap` iteration leaking into observable behavior

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::collections::HashMap;

// WRONG: order re-randomizes per process start — passes local tests, flakes in CI
fn build_report_wrong(scores: &HashMap<String, u32>) -> String {
    scores.iter().map(|(k, v)| format!("{k}: {v}\n")).collect()
}

// RIGHT: force explicit, deterministic order for anything user-visible or diffed
fn build_report(scores: &HashMap<String, u32>) -> String {
    let mut entries: Vec<_> = scores.iter().collect();
    entries.sort_by_key(|(k, _)| k.clone());
    entries.into_iter().map(|(k, v)| format!("{k}: {v}\n")).collect()
}
```
::

If the map is *always* iterated in order, skip the manual sort entirely — use `BTreeMap` from the start:

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::collections::BTreeMap;

// Structural guarantee instead of a sort call someone can forget at the next call site
fn build_report(scores: &BTreeMap<String, u32>) -> String {
    scores.iter().map(|(k, v)| format!("{k}: {v}\n")).collect()
}
```
::

### `swap_remove` silently corrupting parallel-indexed data

::code-wrapper{language="rust" filename="main.rs"}
```rust
// WRONG: O(1) removal that assumes order doesn't matter — it does here
struct BatchWrong {
    ids: Vec<u64>,
    payloads: Vec<Vec<u8>>,   // payloads[i] corresponds to ids[i]
}

impl BatchWrong {
    fn remove(&mut self, index: usize) {
        self.ids.swap_remove(index);       // moves LAST element into `index`
        // BUG: mismatched strategy — indices now diverge
        self.payloads.remove(index);       // shifts everything — different semantics!
    }
}

// RIGHT: same removal strategy on every parallel array, indices stay aligned
struct Batch {
    ids: Vec<u64>,
    payloads: Vec<Vec<u8>>,
}

impl Batch {
    fn remove(&mut self, index: usize) {
        self.ids.swap_remove(index);
        self.payloads.swap_remove(index);   // matching strategy — no silent misalignment
    }
}
```
::

No panic, no error — just `ids[i]` silently paired with the wrong `payloads[i]` from then on.

### Unbounded `Vec` growth as a memory-leak-shaped bug

::code-wrapper{language="rust" filename="main.rs"}
```rust
// WRONG: grows forever if flushing ever falls behind — slow-motion OOM
struct EventLogWrong {
    buffer: Vec<Event>,
}
impl EventLogWrong {
    fn record(&mut self, e: Event) {
        self.buffer.push(e); // no cap — trusts the flush loop to keep up
    }
}

// RIGHT: bounded ring buffer with an explicit, enforced ceiling
use std::collections::VecDeque;
struct EventLog {
    buffer: VecDeque<Event>,
    max_len: usize,
}
impl EventLog {
    fn record(&mut self, e: Event) {
        if self.buffer.len() >= self.max_len {
            self.buffer.pop_front(); // drop oldest under backpressure instead of OOMing
        }
        self.buffer.push_back(e);
    }
}
# struct Event;
```
::

## Architectural Application

Collection choice is an API contract. Returning `Vec<T>` promises order; `HashSet<T>` promises none — changing one to the other is a breaking change the compiler won't flag (both implement `IntoIterator`):

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Breaking change in practice, invisible to the compiler:
fn ids_v1() -> Vec<u64> { vec![3, 1, 2] }             // callers may rely on this order
fn ids_v2() -> std::collections::HashSet<u64> { [3, 1, 2].into() } // order now undefined

// Callers written against v1's ordering silently misbehave against v2 —
// both satisfy `impl IntoIterator<Item = u64>`, so no type error surfaces it.
```
::

`HashMap` vs `BTreeMap` at the system boundary — pick by whether the output must be diffable:

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::collections::{BTreeMap, HashMap};

// Config dumps, snapshot tests, audit logs: deterministic serialization matters
fn serialize_config(cfg: &BTreeMap<String, String>) -> String {
    serde_json::to_string_pretty(cfg).unwrap() // stable key order -> clean diffs
}

// Internal hot-path cache: no serialization requirement, optimize for throughput
fn cache_lookup(cache: &HashMap<u64, Vec<u8>>, key: u64) -> Option<&Vec<u8>> {
    cache.get(&key)
}
```
::

Capacity hints belong inside the constructor, not pushed onto every caller:

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Record;

// Library function that knows its own size hint internalizes the preallocation:
fn parse_records(input: &str) -> Vec<Record> {
    let mut out = Vec::with_capacity(input.lines().count()); // cheap upper-bound estimate
    for line in input.lines() {
        out.push(Record /* parse `line` */);
    }
    out
}
```
::

`SmallVec`/`ArrayVec` at API boundaries: eliminate heap allocation itself when collections are almost always small:

::code-wrapper{language="rust" filename="main.rs"}
```rust
use smallvec::SmallVec;

// Scene graph node: usually 0-4 children, heap alloc would dominate cost otherwise
struct Node {
    children: SmallVec<[Box<Node>; 4]>, // inline storage for up to 4, spills to heap beyond that
}
```
::

## 💡 Tips & Tricks

- **Performance**: preallocate the moment you know a rough upper bound.

::code-wrapper{language="rust" filename="main.rs"}
```rust
let mut v = Vec::with_capacity(1_000); // or v.reserve(1_000) on an existing Vec
```
::
- **Idiom**: one lookup, not two or three.

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::collections::HashMap;
let mut counts: HashMap<&str, u32> = HashMap::new();
*counts.entry("word").or_insert(0) += 1; // single hash + probe
```
::
- **Performance**: swap the hasher for trusted, non-adversarial keys — never for attacker-reachable maps.

::code-wrapper{language="rust" filename="main.rs"}
```rust
use rustc_hash::FxHashMap; // 2-4x faster than std's SipHash, no DoS resistance
let mut m: FxHashMap<u32, u32> = FxHashMap::default();
```
::
- **Debug**: check reallocation churn in seconds, before reaching for a profiler.

::code-wrapper{language="rust" filename="main.rs"}
```rust
let mut v = Vec::new();
for i in 0..10_000 { v.push(i); }
dbg!(v.len(), v.capacity()); // capacity >> len after a push-heavy loop signals churn
```
::
- **Idiom**: reach for `BTreeMap` the instant sorted iteration or range queries matter — never rely on `HashMap` "looking stable."
- **Clippy**: `or_insert(expensive())` always runs eagerly; `or_insert_with(|| expensive())` runs only on insert.

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::collections::HashMap;
let mut m: HashMap<&str, String> = HashMap::new();
m.entry("k").or_insert_with(|| String::from("computed")); // lazy — flagged by clippy::or_fun_call if written as or_insert(...)
```
::
- **Idiom**: the full `Entry` combinator chain covers every get-or-modify pattern in one lookup.

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::collections::HashMap;
let mut stats: HashMap<&str, u32> = HashMap::new();

// insert-if-absent
stats.entry("health").or_insert(100);

// modify-if-present, insert-if-absent
stats.entry("mana").and_modify(|m| *m += 200).or_insert(100);

// modify-if-present only
if let Some(attack) = stats.get_mut("attack") { *attack += 1; }
```
::
- **Gotcha**: `insert` on an existing key updates the *value* but keeps the *original key* — it never swaps in your new key object.

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::collections::HashMap;
use std::hash::{Hash, Hasher};

// A key type where != instances can be == (hash/eq on id only):
#[derive(Debug)]
struct Key { id: u32, label: String }
impl PartialEq for Key { fn eq(&self, o: &Self) -> bool { self.id == o.id } }
impl Eq for Key {}
impl Hash for Key { fn hash<H: Hasher>(&self, h: &mut H) { self.id.hash(h) } }

let mut m = HashMap::new();
m.insert(Key { id: 1, label: "original".into() }, "v");
// Insert a *different* == key — value updates, but the STORED key stays the original:
m.insert(Key { id: 1, label: "updated".into() }, "v2");
let stored = m.get_key_value(&Key { id: 1, label: String::new() }).unwrap();
assert_eq!(stored.0.label, "original"); // the first key object is what remains
```
::

## ⚠️ Edge Cases & Gotchas

- **`HashMap` iteration order is randomized per process run**, not merely unspecified.

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::collections::HashMap;
let m: HashMap<i32, i32> = (0..5).map(|i| (i, i)).collect();
println!("{:?}", m.keys().collect::<Vec<_>>()); // different order on the next run of this binary
```
::
- **Float keys don't compile at all** — `f64`/`f32` implement neither `Hash + Eq` (`NaN != NaN`) nor `Ord`.

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::collections::HashMap;
// let m: HashMap<f64, &str> = HashMap::new(); // compile error: f64 doesn't implement Eq/Hash

use ordered_float::OrderedFloat;
let mut m: HashMap<OrderedFloat<f64>, &str> = HashMap::new(); // wrapper gives a total order
m.insert(OrderedFloat(1.5), "value");
```
::
- **`Vec::swap_remove` silently reorders** — O(1) because it moves the last element into the removed slot.

::code-wrapper{language="rust" filename="main.rs"}
```rust
let mut v = vec![10, 20, 30, 40];
v.swap_remove(0); // removes 10, moves 40 into slot 0
assert_eq!(v, vec![40, 20, 30]); // NOT [20, 30, 40] — order not preserved
```
::
- **`String` indexing panics on non-char-boundary bytes** — ASCII fixtures never catch this.

::code-wrapper{language="rust" filename="main.rs"}
```rust
let s = String::from("héllo"); // 'é' is 2 bytes in UTF-8
// let bad = &s[0..2]; // panics: byte index 2 is not a char boundary
let ok = &s[0..1];    // "h" — fine, ASCII-only slice
```
::
- **`Vec::with_capacity(n)` reserves capacity, not length.**

::code-wrapper{language="rust" filename="main.rs"}
```rust
let v: Vec<i32> = Vec::with_capacity(10);
assert_eq!(v.len(), 0);       // still empty
// v[0]; // panics — indexing past len, exactly like a freshly-new'ed Vec
```
::
- **`LinkedList` is good for exactly one thing: O(1) splicing** — `VecDeque` wins almost every other comparison due to cache locality.
- **`Vec<Option<T>>` gets no niche compression across elements** — each slot still stores a full `Option<T>`, even though a single `Option<T>` outside a `Vec` can niche-optimize to `size_of::<T>()`.

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::num::NonZeroU32;
assert_eq!(std::mem::size_of::<Option<NonZeroU32>>(), 4); // niche-optimized, no tag byte
let v: Vec<Option<NonZeroU32>> = vec![None; 1000]; // still 4 bytes/slot here, no extra "sparse" win
```
::

## 🧠 Spot the Bug

What's wrong with this "deduplicate the list" function?

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn dedup_unsorted(v: &mut Vec<i32>) {
    v.dedup();
}

fn main() {
    let mut v = vec![1, 3, 2, 3, 1, 2];
    dedup_unsorted(&mut v);
    println!("{v:?}");
}
```
::

<details>
<summary>Answer</summary>

Prints `[1, 3, 2, 3, 1, 2]` — unchanged. `Vec::dedup()` only collapses **consecutive** duplicates (meant to run after `sort()`), and no two adjacent elements here match.

::code-wrapper{language="rust" filename="main.rs"}
```rust
// RIGHT: remove duplicates regardless of position
fn dedup_unsorted(v: &mut Vec<i32>) {
    let mut seen = std::collections::HashSet::new();
    v.retain(|x| seen.insert(*x)); // insert() returns false for values already seen
}

fn main() {
    let mut v = vec![1, 3, 2, 3, 1, 2];
    dedup_unsorted(&mut v);
    assert_eq!(v, vec![1, 3, 2]); // first occurrence of each value, order preserved
}
```
::

**The lesson**: `dedup()` on unsorted data is a silent no-op whenever no two adjacent elements happen to match.

</details>

## Summary

- `Vec`: amortized O(1) push, geometric growth, `with_capacity` collapses reallocation to one call.

::code-wrapper{language="rust" filename="main.rs"}
```rust
let mut v = Vec::with_capacity(1_000); // preallocate whenever size is knowable
```
::
- `HashMap`: O(1) avg lookup, pays a deliberate SipHash tax for DoS resistance, iteration order is chaos.

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::collections::HashMap;
let mut m: HashMap<&str, u32> = HashMap::new();
*m.entry("k").or_insert(0) += 1; // single-lookup idiom
```
::
- `BTreeMap`: trades raw speed for sorted, deterministic iteration — use at any diffable boundary.

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::collections::BTreeMap;
let cfg: BTreeMap<String, String> = BTreeMap::new(); // stable serialization, clean diffs
```
::
- A collection type in a public signature is a contract, not an implementation detail — changing `Vec<T>` to `HashSet<T>` breaks order guarantees silently.

Next: Iterators and combinators — the functional side of Rust, and how "zero-cost" abstraction actually gets enforced by the compiler.
