# 14 — Collections

The standard library's growable containers live on the heap:

| Type | Use it for |
|---|---|
| `Vec<T>` | an ordered list (the default choice) |
| `String` | growable UTF-8 text |
| `HashMap<K, V>` | key → value lookup, no order |
| `BTreeMap<K, V>` | key → value lookup, **sorted** by key |
| `HashSet<T>` / `BTreeSet<T>` | unique values |
| `VecDeque<T>` | a queue: fast push/pop at **both** ends |

## `Vec<T>`

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![1, 2, 3];      // macro
    let zeros = vec![0; 4];         // [0, 0, 0, 0]
    v.push(4);
    let last = v.pop();             // Some(4)
    println!("{v:?} {zeros:?} {last:?} len={}", v.len());

    println!("{}", v[0]);           // 1 — panics if out of range
    println!("{:?}", v.get(10));    // None — never panics
    println!("{}", v.contains(&2)); // true — O(n) scan
}
```
::

### Removing items

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut a = vec![10, 20, 30, 40];
    let r = a.remove(1);            // shifts everything after it left — O(n)
    println!("{r} {a:?}");          // 20 [10, 30, 40]

    let mut b = vec![10, 20, 30, 40];
    let s = b.swap_remove(0);       // moves the LAST item into the hole — O(1)
    println!("{s} {b:?}");          // 10 [40, 20, 30]  ← order changed!

    let mut c = vec![1, 2, 3, 4, 5, 6];
    c.retain(|x| x % 2 == 0);       // keep only matching items
    println!("{c:?}");              // [2, 4, 6]
}
```
::

**Tricky**: `dedup` only removes **adjacent** duplicates:

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut d = vec![1, 1, 2, 1, 2, 2];
    d.dedup();
    println!("{d:?}");              // [1, 2, 1, 2]  ← not [1, 2]

    let mut d2 = vec![1, 1, 2, 1, 2, 2];
    d2.sort();
    d2.dedup();
    println!("{d2:?}");             // [1, 2]
}
```
::

**Tricky**: `clear()` keeps the memory:

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v: Vec<i32> = Vec::with_capacity(10);
    println!("{} {}", v.len(), v.capacity());   // 0 10
    v.push(1);
    v.clear();
    println!("{} {}", v.len(), v.capacity());   // 0 10 — use shrink_to_fit() to release it
}
```
::

**Tricky**: you can't hold a reference into a `Vec` while pushing (chapter 08):

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![1, 2, 3];
    let first = &v[0];
    // v.push(4);              // error[E0502] — push may move the data to a new allocation
    println!("{first}");
}
```
::

## `String`

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut s = String::new();
    s.push_str("ab");          // append &str
    s.push('c');               // append char
    s += "d";                  // also append
    println!("{s}");           // abcd

    let name = "Ada";
    let msg = format!("hi {name}, you have {} messages", 3);   // never moves anything
    println!("{msg}");
}
```
::

**Tricky**: `+` takes ownership of the **left** side:

::code-wrapper{language="rust"}
```rust
fn main() {
    let s1 = String::from("a");
    let s2 = String::from("b");
    let s3 = s1 + &s2;          // s1 is MOVED into s3; s2 is only borrowed
    // println!("{s1}");        // error[E0382]: borrow of moved value: `s1`
    println!("{s2} {s3}");      // b ab
}
```
::

**Tricky**: `len()` is in bytes, and there is no `s[i]`:

::code-wrapper{language="rust"}
```rust
fn main() {
    let s = String::from("héllo");
    println!("{}", s.len());                              // 6 bytes
    println!("{}", s.chars().count());                    // 5 chars
    println!("{}", s.chars().rev().collect::<String>());  // olléh
    println!("{:?}", s.chars().nth(1));                   // Some('é')
}
```
::

## `HashMap<K, V>`

::code-wrapper{language="rust"}
```rust
use std::collections::HashMap;

fn main() {
    let mut ages = HashMap::new();
    println!("{:?}", ages.insert("ada", 36));   // None     — new key
    println!("{:?}", ages.insert("ada", 37));   // Some(36) — overwrote, returns old value
    println!("{:?}", ages.get("ada"));          // Some(37)
    println!("{:?}", ages.get("bob"));          // None
    // ages["bob"];                             // panic: no entry found for key

    if let Some(age) = ages.get_mut("ada") {
        *age += 1;
    }
    ages.remove("ada");
    println!("{}", ages.is_empty());            // true
}
```
::

### Counting with the entry API

::code-wrapper{language="rust"}
```rust
use std::collections::HashMap;

fn main() {
    let text = "the cat the dog the end";
    let mut counts: HashMap<&str, i32> = HashMap::new();
    for word in text.split_whitespace() {
        *counts.entry(word).or_insert(0) += 1;     // one lookup, inserts 0 if missing
    }
    println!("{}", counts["the"]);                 // 3
}
```
::

**Tricky**: `HashMap` iteration order is **random** and changes between runs. Sort, or use `BTreeMap`:

::code-wrapper{language="rust"}
```rust
use std::collections::{BTreeMap, HashMap};

fn main() {
    let h: HashMap<&str, i32> = [("b", 2), ("a", 1), ("c", 3)].into();
    println!("{h:?}");          // any order — don't depend on it in tests or output

    let b: BTreeMap<&str, i32> = h.into_iter().collect();
    println!("{b:?}");          // {"a": 1, "b": 2, "c": 3} — always sorted
}
```
::

**Tricky**: floats can't be keys (they are not `Eq`/`Hash` because `NaN != NaN`):

::code-wrapper{language="rust"}
```rust
use std::collections::HashMap;

fn main() {
    let mut m: HashMap<f64, i32> = HashMap::new();
    // m.insert(1.0, 1);    // error[E0599]: the method `insert` exists ... but its trait bounds were not satisfied
}
```
::

Use an integer key (e.g. cents instead of dollars) or `f64::to_bits()`.

## `HashSet` and `VecDeque`

::code-wrapper{language="rust"}
```rust
use std::collections::{HashSet, VecDeque};

fn main() {
    let mut seen = HashSet::new();
    println!("{}", seen.insert(5));   // true  — newly added
    println!("{}", seen.insert(5));   // false — already there

    let a: HashSet<i32> = [1, 2, 3].into();
    let b: HashSet<i32> = [2, 3, 4].into();
    let mut common: Vec<_> = a.intersection(&b).collect();
    common.sort();
    println!("{common:?}");           // [2, 3]

    let mut q = VecDeque::new();
    q.push_back(1);
    q.push_front(0);                  // O(1) — Vec::insert(0, x) would be O(n)
    let front = q.pop_front();
    println!("{front:?} {q:?}");      // Some(0) [1]
}
```
::

## 💡 Tips & Tricks

- **Performance** — `Vec::with_capacity(n)` when you know the size avoids repeated re-allocation.
- **Idiom** — `entry(k).or_insert(v)` / `or_default()` instead of "check, then insert" (one lookup instead of two).
- **Idiom** — `format!` instead of chains of `+`; it never moves its inputs.
- **Idiom** — use `BTreeMap` (or sort the keys) whenever output order matters.
- **Performance** — `swap_remove` is O(1) if you don't care about order.

## ⚠️ Edge Cases & Gotchas

- **Indexing** — `v[i]` and `map[k]` panic on missing items; `get` returns `Option`.
- **Order** — `HashMap`/`HashSet` iteration order is random per run.
- **Dedup** — only removes adjacent duplicates; sort first.
- **swap_remove** — changes the order of the remaining elements.
- **String `+`** — moves the left operand.
- **Keys** — `f64` is not a valid `HashMap`/`HashSet` key.
- **Memory** — `clear()` and `truncate()` keep capacity.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
use std::collections::HashMap;

fn main() {
    let mut stock: HashMap<String, u32> = HashMap::new();
    stock.insert("apple".into(), 3);

    let item = "pear".to_string();
    if !stock.contains_key(&item) {
        stock.insert(item.clone(), 0);
    }
    *stock.get_mut(&item).unwrap() += 5;
    println!("{}", stock["pear"]);
}
```
::

<details>
<summary>Answer</summary>

It works (prints `5`), but it hashes the key **three** times and clones it, and the `.unwrap()` would panic if someone later edits the `if`. The entry API does it in one step:

::code-wrapper{language="rust"}
```rust
*stock.entry(item).or_insert(0) += 5;
```
::

**The lesson**: "check, insert, then get" on a map is almost always `entry(...)`.

</details>

## 🧠 Quick Quiz

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![5, 3, 5, 1, 3];
    v.dedup();
    let n = v.len();
    v.sort();
    v.dedup();
    println!("{n} {v:?}");
}
```
::

<details>
<summary>Answer</summary>

`5 [1, 3, 5]` — the first `dedup` removes nothing (no neighbours are equal). After sorting, duplicates sit together and `dedup` removes them.

</details>

## Summary

`Vec` is the default; `HashMap` for lookup, `BTreeMap` when order matters, `HashSet` for uniqueness, `VecDeque` for queues. Prefer `get`/`entry` over indexing, and never rely on `HashMap` order.

Next: Iterators.
