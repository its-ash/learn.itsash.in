# 08 — References & Borrowing

References are a **compile-time aliasing discipline** — a static proof system bolted onto an ordinary pointer. Knowing where the proof ends and the pointer begins is what separates someone who fights the borrow checker from someone who designs around it.

## Under-the-Hood Mechanics

### A reference is just a pointer — the safety is entirely compile-time

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn main() {
    assert_eq!(std::mem::size_of::<&i32>(), 8);
    assert_eq!(std::mem::size_of::<*const i32>(), 8);
    // Identical bit pattern at runtime; only the type system distinguishes them.
    let x = 42;
    let r: &i32 = &x;
    let p: *const i32 = r as *const i32;
    unsafe { assert_eq!(*p, *r); }
}
```
::

`&`/`&mut` add zero bits and zero instructions over a raw pointer — but `&mut` gets LLVM's `noalias`, a proof C's `restrict` can only assert:

::code-wrapper{language="rust"}
```rust
fn increment_all(v: &mut [i32]) {
    for x in v.iter_mut() {
        *x += 1;   // LLVM knows NOTHING else can alias `v` here — proven, not assumed — enables
    }               // register-caching, reordering, vectorization C compilers rarely get this freely.
}
```
::

### Fat pointers: where `&T` is more than one word

::code-wrapper{language="rust"}
```rust
fn main() {
    assert_eq!(std::mem::size_of::<&i32>(), 8);          // thin: data ptr only
    assert_eq!(std::mem::size_of::<&[i32]>(), 16);        // fat: ptr + len
    assert_eq!(std::mem::size_of::<&dyn std::fmt::Debug>(), 16); // fat: ptr + vtable ptr
}
```
::

### The borrow checker as a dataflow analysis, not a scope rule

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![1, 2, 3];
    let r = &v[0];
    let doubled = *r * 2;   // r's live range ends here — its LAST ACTUAL USE, not the end of its scope
    v.push(4);              // fine: no live shared borrow at this point
    println!("{doubled}");
}
```
::

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![1, 2, 3];
    let r = &v[0];
    // v.push(4);         // ERROR here: `r` is used again below, so its live range extends past this line
    println!("{r}");
}
```
::

## Cost, Performance, and Trade-Offs

Runtime cost: zero, provably. Compile-time cost: real.

::code-wrapper{language="rust"}
```rust
fn main() {
    let v = vec![1, 2, 3];
    let r = &v;             // costs exactly what the underlying pointer costs — no vtable, no refcount
    println!("{r:?}");       // bounds check happens on INDEXING (r[0]), not on taking the reference itself
}
```
::

::code-wrapper{language="rust"}
```rust
// Maintenance cost is the real trade-off: over-using &mut self forces artificial serialization.
struct Config { name: String, retries: u32 }

impl Config {
    fn name_bad(&mut self) -> &str { &self.name }   // &mut self on a READ-ONLY method — a design smell
    fn name_good(&self) -> &str { &self.name }       // callers can now read concurrently with anything else
}
```
::

## Production Failure Modes & Anti-Patterns

### Anti-pattern: fighting the borrow checker with premature cloning

::code-wrapper{language="rust"}
```rust
// naive: mid-level dev hits a borrow error and reaches for .clone()
struct Cache {
    entries: std::collections::HashMap<String, Vec<u8>>,
}

impl Cache {
    fn get_or_insert(&mut self, key: &str) -> Vec<u8> {
        if let Some(v) = self.entries.get(key) {
            return v.clone(); // clones on EVERY hit — the "fix" that shipped
        }
        let computed = expensive_compute(key);
        self.entries.insert(key.to_string(), computed.clone());
        computed
    }
}

fn expensive_compute(_key: &str) -> Vec<u8> { vec![0; 4096] }
```
::

::code-wrapper{language="rust"}
```rust
use std::collections::hash_map::Entry;
use std::sync::Arc;

struct Cache {
    entries: std::collections::HashMap<String, Arc<Vec<u8>>>,
}

impl Cache {
    fn get_or_insert(&mut self, key: &str) -> Arc<Vec<u8>> {
        match self.entries.entry(key.to_string()) {
            Entry::Occupied(e) => Arc::clone(e.get()), // refcount bump, not a copy
            Entry::Vacant(e) => {
                let computed = Arc::new(expensive_compute(key));
                e.insert(Arc::clone(&computed));
                computed
            }
        }
    }
}

fn expensive_compute(_key: &str) -> Vec<u8> { vec![0; 4096] }
```
::

### Anti-pattern: `&mut self` "just in case" widening a borrow unnecessarily

::code-wrapper{language="rust"}
```rust
struct Registry { active: Vec<String>, pending: Vec<String> }

impl Registry {
    fn first_active(&mut self) -> Option<&String> {   // only READS `active` but demands &mut self
        self.active.first()
    }
    fn promote_pending(&mut self) {
        if let Some(name) = self.pending.pop() { self.active.push(name); }
    }
}

fn demo(reg: &mut Registry) {
    let first = reg.first_active();     // borrows ALL of `reg` mutably
    // reg.promote_pending();            // COMPILE ERROR: reg is still borrowed
    println!("{:?}", first);
}
```
::

::code-wrapper{language="rust"}
```rust
impl Registry {
    fn first_active(&self) -> Option<&String> { self.active.first() }   // &self, not &mut self
}

fn demo(reg: &mut Registry) {
    let first = reg.first_active().cloned();
    reg.promote_pending();   // now fine
    println!("{:?}", first);
}
struct Registry { active: Vec<String>, pending: Vec<String> }
impl Registry { fn promote_pending(&mut self) { if let Some(name) = self.pending.pop() { self.active.push(name); } } }
```
::

### Anti-pattern: `unsafe` to "fix" a borrow checker rejection that was actually correct

::code-wrapper{language="rust"}
```rust
// naive: reaching for raw pointers to force two &mut through a false-positive
fn split_wrong(v: &mut [i32], mid: usize) -> (&mut [i32], &mut [i32]) {
    let ptr = v.as_mut_ptr();
    let len = v.len();
    unsafe {
        (
            std::slice::from_raw_parts_mut(ptr, mid),
            std::slice::from_raw_parts_mut(ptr.add(mid), len - mid), // mid > len: instant UB, no panic
        )
    }
}
```
::

::code-wrapper{language="rust"}
```rust
fn split_right(v: &mut [i32], mid: usize) -> (&mut [i32], &mut [i32]) {
    v.split_at_mut(mid) // panics on out-of-bounds mid; no UB path exists — audited once, in std
}
```
::

## Architectural Application

::code-wrapper{language="rust"}
```rust
fn read_only(data: &[i32]) -> i32 { data.iter().sum() }       // composable with concurrent readers
fn mutate(data: &mut Vec<i32>) { data.push(0); }               // exclusivity contract — mutation IS the point
fn take_ownership(data: Vec<i32>) -> Vec<i32> { data }          // callee stores it / sends across a thread
// Choose &T / &mut T / T per call based on what the function actually needs — not habit.
```
::

::code-wrapper{language="rust"}
```rust
fn is_sync<T: Sync>() {}
fn check() { is_sync::<i32>(); }
// A type is Sync exactly when &T is safe to share across threads — provable because &T can
// never be upgraded to &mut T without violating the borrow checker. Same rule, extended across threads.
```
::

::code-wrapper{language="rust"}
```rust
use std::sync::Mutex;

// Monolithic: every access to EITHER field serializes on one lock.
struct Combined { x: i32, y: i32 }
struct Coarse { data: Mutex<Combined> }

// Split: independently-mutated fields get independent, finer-grained locks.
struct Fine { x: Mutex<i32>, y: Mutex<i32> }
// The compiler already proves &mut s.x and &mut s.y are disjoint — this is that fact, made concurrent.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![1, 2, 3];
    {
        let r = &v[0];       // explicit block scopes the borrow's intended lifetime
        println!("{r}");
    }
    v.push(4);                // now fine — reveals exactly where NLL's "last use" disagrees with intuition
}
```
::

::code-wrapper{language="rust"}
```rust
fn helper(r: &mut i32) { *r += 1; }

fn main() {
    let mut x = 5;
    let r = &mut x;
    helper(&mut *r);   // reborrow: keeps `r` alive (temporarily inactive), doesn't move it away
    helper(r);          // still usable — passing &mut is ALWAYS a reborrow, never a move, even implicitly
}
```
::

- **Idiom**: split borrows on distinct struct fields (`&mut s.x`, `&mut s.y`) instead of one `&mut s` threaded everywhere.
- **Performance**: prefer `&[T]`/`&str` params — no runtime cost over `&Vec<T>`/`&String`, strictly wider caller acceptance.
- **Clippy**: `clippy::needless_borrow` and `clippy::ptr_arg` catch redundant `&`/`&Vec<T>` patterns automatically.

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![1, 2, 3];
    let r = &v;
    let r2 = &v;
    // v.push(4);            // FAILS: NLL only shrinks a live range to its ACTUAL last use, in order
    println!("{r} {r2}", r = r[0], r2 = r2[1]);
}
```
::

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![1, 2, 3];
    // let (a, b) = (&mut v[0], &mut v[1]);   // does NOT compile — checker can't prove disjoint INDICES
    let (a, b) = v.split_at_mut(1);           // this proves disjointness structurally
    *a.last_mut().unwrap() += 1;
    *b.first_mut().unwrap() += 1;
}
```
::

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![1, 2, 3];
    // v.push(v[0]);          // ERROR: v[0] needs &v alive at the same time as push's &mut self
    let x = v[0];
    v.push(x);                 // copy the value out first
}
```
::

::code-wrapper{language="rust"}
```rust
fn main() {
    let s = String::from("hi");   // NOT `mut`
    // let r = &mut s;              // ERROR: the BINDING needs mut, independent of String's own capabilities
}
```
::

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
struct Ledger { pending: Vec<i64>, settled: Vec<i64> }

impl Ledger {
    fn settle_first(&mut self) -> Option<&i64> {
        if self.pending.is_empty() { return None; }
        let amount = self.pending.remove(0);
        self.settled.push(amount);
        self.settled.last()
    }
}

fn main() {
    let mut ledger = Ledger { pending: vec![100, 200], settled: vec![] };
    if let Some(last) = ledger.settle_first() {
        println!("settled: {last}");
    }
    ledger.settle_first();
}
```
::

Why does this fail to compile — or does it?

<details>
<summary>Answer</summary>

It **compiles fine** — the trap runs the other direction. The borrow from the first call dies at its last use (the `println!` inside the `if let`), so NLL sees no conflict with the second call:

::code-wrapper{language="rust"}
```rust
// This version DOES fail, because `last` is used again AFTER the second call:
// let last = ledger.settle_first();     // borrows `ledger` mutably, tied to `last`
// ledger.settle_first();                 // ERROR: second &mut borrow while `last` is live
// println!("{:?}", last);
```
::

**The lesson**: a method returning `Option<&T>` tied to `&mut self` locks the receiver only until the returned reference's actual last use, per NLL — not for the rest of the function.

</details>

## Summary

- References are ordinary pointers at the ABI level; every guarantee is a compile-time proof, erased before codegen, that unlocks `noalias`-based optimizations C/C++ compilers can't safely make.
- The borrow rules are a dataflow analysis over MIR, not a lexical-scope rule — NLL shrinks live ranges to actual last use.
- Cloning to escape a borrow-checker error is rarely the right fix; tighten the receiver (`&self` vs `&mut self`) or restructure around an entry-style API first.
- Reference-taking decisions in function signatures are architectural contracts about aliasing and concurrency, not style choices.

Next: Slices — borrowed views into contiguous data, and the fat-pointer layout that makes them work.
