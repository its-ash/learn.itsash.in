# 15 — Iterators & Combinators

Rust's iterators are **lazy**, **zero-cost**, and compose into chains that compile down to tight loops. Mastering them is the difference between "writing Rust" and "writing idiomatic Rust".

## The `Iterator` Trait

::code-wrapper{language="rust"}
```rust
pub trait Iterator {
    type Item;
    fn next(&mut self) -> Option<Self::Item>;
    // ... dozens of provided methods
}
```
::

Implement `next()` and you get `map`, `filter`, `fold`, `collect`, etc. for free.

## Laziness

::code-wrapper{language="rust"}
```rust
let v = vec![1, 2, 3];
let it = v.iter().map(|x| x * 2);   // no work yet
for y in it { println!("{y}"); }    // work happens here
```
::

Iterator chains don't run until consumed (by `for`, `collect`, `sum`, `count`, etc.).

## `IntoIterator`

Anything implementing `IntoIterator` can be used in `for`:

::code-wrapper{language="rust"}
```rust
for x in &vec { }       // &Vec<T>  -> Iterator<Item = &T>
for x in &mut vec { }  // &mut Vec<T> -> Iterator<Item = &mut T>
for x in vec { }        // Vec<T> -> consumes, yields T
```
::

`Vec<T>: IntoIterator<Item = T>` since edition 2021. Pre-2021, arrays only borrowed-by-default — `for x in [1,2,3]` errored unless you wrote `for x in &[1,2,3]` or `into_iter()`.

## Consuming vs Borrowing Iterators

| Method | Yields |
|---|---|
| `iter()` | `&T` |
| `iter_mut()` | `&mut T` |
| `into_iter()` | `T` (consumes the collection) |

## Common Adapters (Producers)

::code-wrapper{language="rust"}
```rust
0..10                       // Range
(1..=5).rev()
"abc".chars()
"abc".bytes()
vec.iter()
vec.iter_mut()
vec.into_iter()
slice.chunks(3)
slice.chunks_exact(3)
slice.rchunks(3)
slice.windows(2)             // sliding window, overlapping
slice.split(|c| *c == b',')
slice.splitn(3, |c| *c == b',')
str.lines()
str.split_whitespace()
str.split_ascii_whitespace()
std::iter::repeat(5)         // infinite
std::iter::repeat_with(|| rand::random())
std::iter::once(5)
std::iter::empty::<i32>()
std::iter::successors(Some(1), |n| Some(n * 2))   // unfold
std::iter::from_fn(|| Some(1))
std::iter::zip(a, b)         // zip two iterables
```
::

## Common Transformers

::code-wrapper{language="rust"}
```rust
it.map(|x| x * 2)
it.filter(|x| *x > 0)
it.filter_map(|x| if *x > 0 { Some(*x) } else { None })
it.enumerate()               // (index, item)
it.zip(other_iter)           // pair up
it.flat_map(|x| x.iter())     // flatten one level
it.flatten()                  // for Iterator<Item = Iterator>
it.take(3)                    // first 3
it.skip(3)
it.take_while(|x| *x < 10)
it.skip_while(|x| *x < 10)
it.step_by(2)
it.chain(other)
it.rev()                       // requires DoubleEndedIterator
it.peekable()                  // Peekable — see next without consuming
it.cycle()                     // infinite repeat (Clone-able items)
it.scan(init, |state, x| ...)  // stateful map, returns Option
it.dedup()
it.unzip()                     // (Vec<A>, Vec<B>)
it.collect()
it.copied()                    // Iterator<Item=&T where T:Copy> -> Item=T
it.cloned()                    // Iterator<Item=&T> -> Item=T (T: Clone)
it.by_ref()                    // borrow iterator for partial consumption
```
::

## Common Consumers

::code-wrapper{language="rust"}
```rust
it.collect::<Vec<_>>()
it.collect::<HashMap<K, V>>()
it.sum::<i32>()
it.product::<i32>()
it.count()
it.last()              // Option<T>
it.nth(5)
it.all(|x| *x > 0)
it.any(|x| *x > 0)
it.find(|x| *x > 0)    // first matching
it.position(|x| *x > 0) // Option<usize>
it.fold(init, |acc, x| acc + x)
it.try_fold(init, |acc, x| Ok(acc + x))   // bails on Err
it.for_each(|x| println!("{x}"))
it.max() / it.min()
it.max_by_key(|x| *x)
it.min_by(|a, b| a.cmp(b))
it.eq(other)
it.ne(other)
it.lt(other)
it.cmp(other)
it.partition(|x| *x > 0)   // (Vec<T>, Vec<T>)
it.unzip()
```
::

## `collect` and `FromIterator`

::code-wrapper{language="rust"}
```rust
let v: Vec<i32> = (0..5).collect();
let s: String = "abc".chars().collect();
let m: HashMap<&str, i32> = [("a", 1), ("b", 2)].into_iter().collect();
let (evens, odds): (Vec<i32>, Vec<i32>) = (0..10).partition(|x| x % 2 == 0);
```
::

`collect` can build *any* `FromIterator` type — the turbofish or type annotation tells it which.

## Custom Iterator (Manual `impl`)

::code-wrapper{language="rust"}
```rust
struct Counter { count: u32 }
impl Counter {
    fn new() -> Self { Counter { count: 0 } }
}
impl Iterator for Counter {
    type Item = u32;
    fn next(&mut self) -> Option<Self::Item> {
        self.count += 1;
        if self.count <= 5 { Some(self.count) } else { None }
    }
}

for n in Counter::new().map(|x| x * 2) {
    println!("{n}");   // 2, 4, 6, 8, 10
}
```
::

## Performance: Iterators Compile to Tight Loops

::code-wrapper{language="rust"}
```rust
let v: Vec<i32> = (0..1_000_000).collect();
let sum: i32 = v.iter().map(|x| x + 1).filter(|x| x % 2 == 0).sum();
```
::

This compiles to essentially the same machine code as a hand-written `for` loop. No allocations, no closures dispatched at runtime — everything inlines.

## `DoubleEndedIterator`

`.rev()` requires `DoubleEndedIterator` (can pull from the back):

::code-wrapper{language="rust"}
```rust
for x in (0..5).rev() { print!("{x} "); }   // 4 3 2 1 0
```
::

Not all iterators are double-ended (`std::io::Lines` reading a file isn't).

## `ExactSizeIterator`

`.len()` works if the iterator knows its exact remaining length.

## Infinite Iterators

::code-wrapper{language="rust"}
```rust
let ones = std::iter::repeat(1);
let natural = (0..).map(|x| x * 2);
let mut evens = (0..).step_by(2);
```
::

Use `take(n)` or `take_while` to bound them. Don't `.collect()` an infinite iterator!

## `peekable`

::code-wrapper{language="rust"}
```rust
let mut it = vec.iter().peekable();
let first = it.peek();
if let Some(&&3) = first { /* ... */ }
let actual = it.next();
```
::

`peek` returns `Option<&Item>` without advancing.

## `fuse`

After an iterator returns `None` once, calling `next` again is unspecified — `fuse` makes it always return `None` after the first:

::code-wrapper{language="rust"}
```rust
let mut it = some_iter.fuse();
while let Some(x) = it.next() { /* ... */ }
it.next();   // guaranteed None
```
::

## `inspect`

For debugging chains without breaking them:

::code-wrapper{language="rust"}
```rust
(0..5)
    .inspect(|x| println!("before: {x}"))
    .map(|x| x * 2)
    .inspect(|x| println!("after:  {x}"))
    .collect::<Vec<_>>();
```
::

## Iterators and Ownership

::code-wrapper{language="rust"}
```rust
let v = vec![String::from("a"), String::from("b")];

// Borrow (keep v alive):
for s in &v { /* s: &String */ }

// Consume (v gone after):
for s in v { /* s: String */ }

// Partial consume then use rest:
let mut it = v.into_iter();
let first = it.next();
let rest: Vec<_> = it.collect();
```
::

## Common Patterns

### Group consecutive equal elements

::code-wrapper{language="rust"}
```rust
let v = vec![1, 1, 2, 2, 2, 3];
for (key, group) in v.into_iter().group_by(|a, b| a == b) { /* unstable API */ }
// Use `itertools` crate for `group_by` on stable.
```
::

### Chunked iterator

::code-wrapper{language="rust"}
```rust
for chunk in v.chunks(10) { /* process */ }
```
::

### Build a map from a vec

::code-wrapper{language="rust"}
```rust
let m: HashMap<i32, &str> = vec.iter().map(|x| (*x, "x")).collect();
```
::

### Sum of squares of evens

::code-wrapper{language="rust"}
```rust
let sum: i32 = (1..=100).filter(|x| x % 2 == 0).map(|x| x * x).sum();
```
::

### Flatten nested options

::code-wrapper{language="rust"}
```rust
let v: Vec<i32> = vec![Some(1), None, Some(2)].into_iter().flatten().collect();
```
::

### Find max by key

::code-wrapper{language="rust"}
```rust
let max = v.iter().max_by_key(|x| x.score);
```
::

## Edge Cases & Pitfalls

- **`collect` ambiguity**: if you write `let v = it.collect();` without a type annotation, you'll get an error. Always annotate.
- **Iterator invalidation**: you can't mutate the underlying collection while iterating via a borrowed iterator. `Vec::retain` is the safe way to filter in place.
- **`for x in vec` consumes**: easy mistake — `vec` is gone after. Use `&vec` to keep it.
- **Infinite iterator + `count`/`sum`**: hangs forever.
- **`.rev()` on `Range` from `0..`**: `RangeFrom` isn't `DoubleEndedIterator` (no end to reverse to).
- **`.zip` stops at shorter**: zipping a 3-element with a 5-element yields 3 pairs. Use `itertools::zip_longest` for the padded form.
- **Closure captures**: `it.map(|x| x + offset)` borrows `offset` for the iterator's lifetime; can surprise you with borrow errors.
- **`flatten` on `Iterator<Item = Option<T>>`**: this is a special impl — `Option` impls `IntoIterator`. Same for `Result<T, E>` (only the `Ok` cases flatten).
- **`Iterator::size_hint`**: returns `(lower, Option<upper>)`; useful for algorithms that need a size estimate.

## Summary

Iterators are lazy, zero-cost, and compose beautifully. Pick the right adapter for the job. `collect` is a swiss-army knife driven by type inference. Avoid infinite iterator pitfalls. Manual `Iterator` impl is straightforward — implement `next()`.

Next: Traits and generics — the type system's reuse mechanism.