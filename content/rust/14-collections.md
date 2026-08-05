# 14 — Collections (`Vec`, `String`, `HashMap`, and more)

## `Vec<T>` — The Growable Array

```rust
let mut v: Vec<i32> = Vec::new();
v.push(1);
v.push(2);
let v2 = vec![1, 2, 3];          // macro shortcut
let v3 = vec![0; 5];              // [0, 0, 0, 0, 0]
```

### Memory Model

`Vec` is `(ptr, len, capacity)`:
- `ptr` → heap allocation
- `len` → number of elements currently stored
- `capacity` → allocated space; pushing beyond doubles capacity (amortized O(1))

```rust
let mut v = Vec::with_capacity(100);   // pre-allocate for perf
v.push(1);
println!("{:?}", v.capacity());
```

### Indexing & Slicing

```rust
v[0];            // panics on OOB
v.get(0);        // Option<&T> — safe
&v[1..3];        // slice, panics on OOB
v.get(1..3);     // Option<&[T]>
```

### Iteration

```rust
for x in &v { /* x: &i32 */ }
for x in &mut v { /* x: &mut i32 */ }
for x in v { /* consumes v, x: i32 */ }   // ownership move
v.iter();        // iterator over &T
v.iter_mut();    // over &mut T
v.into_iter();   // consumes v, yields T (or &T for &Vec)
```

### Insert / Remove / Swap

```rust
v.insert(0, 99);   // O(n) — shifts
v.remove(0);       // O(n)
v.swap_remove(0);  // O(1) — reorders
v.pop();           // Option<T>
v.clear();
v.truncate(2);
v.retain(|x| *x > 0);   // filter in place
v.drain(1..3);          // removes range, returns iterator
```

### Capacity Management

```rust
v.shrink_to_fit();
v.reserve(10);
v.reserve_exact(10);
```

### Sorting & Searching

```rust
v.sort();
v.sort_by(|a, b| b.cmp(a));
v.sort_by_key(|x| x.abs());
v.sort_unstable_by_key(|x| *x);    // faster, non-stable
v.dedup();                        // remove consecutive duplicates (after sort)
v.binary_search(&5);              // Option<usize> on sorted vec
```

### Edge Cases

- **`v.push(v[0])`**: borrow error (mutable borrow while reading). Copy first: `let x = v[0]; v.push(x);`.
- **`Vec::with_capacity(0)`**: valid; first push triggers alloc.
- **Empty `Vec` is non-null**: `Vec::new()` doesn't allocate; capacity 0.
- **`Vec<Option<T>>`**: not niche-optimized; uses full space.
- **ZST elements**: a `Vec<()>` has `capacity = usize::MAX`; never actually allocates.
- **`vec![]` macro** is hygienic — supports any `T: Clone` for `vec![v; n]`.
- **`Vec::leak`**: leak into `&'static mut [T]`.
- **`Vec::spare_capacity_mut`** for unsafe manual writes.

## `String` — Owned UTF-8 String

```rust
let s = String::new();
let s = String::from("hi");
let s: String = "hi".to_string();
let s: String = "hi".to_owned();
s.push_str(" world");
s.push('!');
s.replace("hi", "bye");
s.to_lowercase();
s.split(' ').collect::<Vec<_>>();
```

### UTF-8 Invariant

`String` is a `Vec<u8>` with the invariant that bytes are valid UTF-8. You can't push arbitrary bytes:

```rust
let bytes = vec![0xffu8];
// String::from_utf8(bytes).unwrap();  // ERROR: invalid UTF-8
String::from_utf8(bytes).unwrap_err(); // ok
String::from_utf8_lossy(&[0xffu8, b'h']);  // "�h"
```

### `String` vs `&str`

| `String` | `&str` |
|---|---|
| Owned, growable | Borrowed view |
| Heap | Heap/stack/static |
| `mut` to grow | Read-only |
| Can convert to `&str` freely | Can be obtained from `String` cheaply |

### Common Conversions

```rust
let s: String = String::from("hi");
let r: &str = &s;
let r: &str = s.as_str();
let owned: String = r.to_string();
let bytes: Vec<u8> = s.into_bytes();
let s: String = String::from_utf8(bytes).unwrap();
let s: String = unsafe { String::from_utf8_unchecked(bytes) };   // fast, dangerous
```

### Byte-Oriented Operations

```rust
let s = "hello";
for b in s.bytes() { /* u8 */ }
for c in s.chars() { /* char */ }
for (i, c) in s.char_indices() { /* (byte_offset, char) */ }
s.as_bytes();      // &[u8]
```

### Concatenation

```rust
let s = String::from("a") + "b" + "c";   // + takes String by value, &str args
let s = ["a", "b", "c"].concat();
let s = format!("{}-{}", "a", "b");
let s: String = "a".to_string() + "b";
```

### Edge Cases

- **`s[0]` panics**: there's no byte indexing of `String`. Use `s.as_bytes()[0]` for bytes, `s.chars().nth(0)` for chars.
- **`s[1..4]` panics** if not on char boundary.
- **`String::remove(i)`**: byte-indexed; must be on char boundary.
- **`split('\n')` doesn't include trailing empty**: use `split_terminator`/`split_inclusive` for variations.
- **`lines()` splits on `\n` and `\r\n`**, but `split('\n')` doesn't strip `\r`.

## `HashMap<K, V>` and `BTreeMap<K, V>`

```rust
use std::collections::HashMap;
let mut m: HashMap<String, i32> = HashMap::new();
m.insert("a".into(), 1);
m.entry("b".into()).or_insert(2);
m.entry("a".into()).and_modify(|v| *v += 1).or_insert(0);
let v = m.get("a");          // Option<&i32>
let v = m.get_key_value("a");
m.remove("a");
for (k, v) in &m { /* ... */ }
```

- `HashMap` uses hashing (SipHash by default, secure but slower; use `FxHashMap`/`AHashMap` for perf).
- `BTreeMap` keeps keys sorted (binary tree), iteration is ordered, lookups are O(log n) vs HashMap's amortized O(1).

### `entry` API

The idiomatic way to "insert if absent, else modify":

```rust
m.entry(key).or_insert_with(|| expensive_default());
*m.entry(key).or_insert(0) += 1;
```

### Custom Keys

```rust
#[derive(Hash, Eq, PartialEq)]
struct MyKey { /* ... */ }
```

`HashMap` requires `Hash + Eq`. `BTreeMap` requires `Ord`.

### Edge Cases

- **Float keys**: not `Hash + Eq` (NaN), so can't be in `HashMap`/`BTreeMap`.
- **`HashMap` iteration order is random** per run (uses random seed). Don't rely on order.
- **`BTreeMap::range`**: efficient range queries (`m.range('a'..='z')`).
- **Capacity**: `HashMap::with_capacity` pre-allocates.
- **`mem::take(&mut map[key])`**: extract a value, replacing with `Default`.

## `HashSet` and `BTreeSet`

```rust
use std::collections::HashSet;
let mut s: HashSet<i32> = HashSet::new();
s.insert(1);
s.contains(&1);
s.remove(&1);
s.intersection(&other).collect::<HashSet<_>>();
s.union(&other);
s.difference(&other);
s.symmetric_difference(&other);
s.is_subset(&other);
s.is_disjoint(&other);
```

## `VecDeque<T>` — Double-Ended Queue

```rust
use std::collections::VecDeque;
let mut dq: VecDeque<i32> = VecDeque::new();
dq.push_back(1); dq.push_front(0);
dq.pop_back(); dq.pop_front();
```

Ring buffer; O(1) push/pop on both ends.

## `LinkedList<T>` — Rarely Needed

`std::collections::LinkedList` is a doubly-linked list. Almost always the wrong choice — use `VecDeque` instead. Linked lists are cache-unfriendly; their only advantage is O(1) splicing, which Rust's `LinkedList` supports via `append`.

## `BinaryHeap<T>` — Max-Heap

```rust
use std::collections::BinaryHeap;
let mut h = BinaryHeap::new();
h.push(5); h.push(1); h.push(10);
h.pop();     // 10
```

For a min-heap, wrap with `Reverse` or `std::cmp::Reverse`:

```rust
let mut h: BinaryHeap<std::cmp::Reverse<i32>> = BinaryHeap::new();
h.push(std::cmp::Reverse(5));
```

## Other Useful Collections (std + crates)

- `VecDeque`, `HashSet`, `BTreeSet`
- `IndexMap` (preserves insertion order) — crate `indexmap`
- `FxHashMap`/`FxHashSet` — crate `fxhash`, fast non-crypto hash
- `ahash::AHashMap` — fast non-crypto hash
- `smallvec::SmallVec` — inline storage, avoids heap for small sizes
- `arrayvec::ArrayVec` — stack-only, fixed capacity
- `bytes::Bytes` — cheap clone byte buffers (network/IO)
- `ropey` — large text manipulation (Rope data structure)

## Choosing a Collection

| You want | Use |
|---|---|
| Sequence, push/pop back | `Vec` |
| Sequence, both ends | `VecDeque` |
| Map with arbitrary keys | `HashMap` |
| Map with sorted keys / ranges | `BTreeMap` |
| Unique elements | `HashSet` |
| Priority queue | `BinaryHeap` |
| Small, known max size | `ArrayVec` / `SmallVec` |
| Often-cloned byte buffer | `bytes::Bytes` |

## Summary

`Vec` is the workhorse — understand its memory model (capacity doubling, amortized O(1)). `String` is UTF-8-aware; never confuse bytes with chars. `HashMap`/`BTreeMap` are the map workhorses; the `entry` API is idiomatic. Pick the right collection for the access pattern.

Next: Iterators and combinators — the functional side of Rust.