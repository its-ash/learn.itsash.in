# 07 — Ownership

Ownership is a **compile-time resource-tracking discipline** — a static proof that every value has exactly one owner responsible for freeing it. There is no runtime tag, no refcount, no garbage collector; the proof is checked once by rustc and then erased.

## Under-the-Hood Mechanics

### A move is a bitwise copy plus static tracking — nothing runs at runtime

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn main() {
    let s1 = String::from("hi");     // { ptr, len, cap } written to s1's stack slot
    let ptr_before = s1.as_ptr();
    let s2 = s1;                      // memcpy of the 24-byte header — heap bytes untouched
    // println!("{s1}");              // COMPILE ERROR: rustc's initialization-state table
                                        // marks `s1` "moved-from" here — there is no runtime flag
    assert_eq!(s2.as_ptr(), ptr_before); // same allocation, exactly one owner left
}
```
::

"Moved-from" is tracked in MIR by the borrow checker as static dataflow state, the same machinery that tracks borrows. At `-O`, the dead store to `s1` and the never-taken drop of `s1` are optimized away entirely — a move that isn't later "undone" by reassignment costs literally zero instructions.

### Why `String`/`Vec` are three-word headers

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn main() {
    assert_eq!(std::mem::size_of::<String>(), 24);           // ptr + len + cap, 8 bytes each on 64-bit
    assert_eq!(std::mem::size_of::<Vec<u8>>(), 24);           // identical layout, different element type
    assert_eq!(std::mem::size_of::<Box<[u8; 4096]>>(), 8);    // Box: just a pointer — indirection is the point
    assert_eq!(std::mem::size_of::<[u8; 4096]>(), 4096);      // no indirection: THIS moves all 4096 bytes
}
```
::

A move's cost is `size_of::<T>()`, full stop. `String`/`Vec`/`Box` are cheap to move because the *type itself* is small — the heap data never participates. Moving a large fixed-size array is not cheap, because there is no heap indirection to elide.

### Niche optimization: `Option<T>` for free

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn main() {
    // Box/String/Vec/&T can never be the null pointer, so rustc reuses that
    // bit pattern to encode `None` — no extra discriminant byte, no size increase.
    assert_eq!(std::mem::size_of::<Option<Box<i32>>>(), std::mem::size_of::<Box<i32>>());
    assert_eq!(std::mem::size_of::<Option<&i32>>(), std::mem::size_of::<&i32>());
    // A type with no spare bit pattern DOES pay for the discriminant:
    assert!(std::mem::size_of::<Option<i32>>() > std::mem::size_of::<i32>());
}
```
::

### Drop flags and drop glue: the one case moves aren't fully free

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Loud(&'static str);
impl Drop for Loud {
    fn drop(&mut self) { println!("dropping {}", self.0); }
}

fn conditional_move(flag: bool) {
    let a = Loud("a");
    if flag {
        drop(a); // moved into drop() here, in ONE branch only
    }
    // rustc can't know statically whether `a` is still alive at scope end,
    // so it emits a hidden boolean "drop flag" and a runtime branch:
    // if !moved_flag { a.drop() }
} // <- drop glue checks the flag here
```
::

This is the one place ownership tracking leaks a runtime cost: conditional drop requires a hidden flag and a branch, generated automatically as "drop glue." Unconditional drops (the overwhelming majority) need no flag at all — the compiler knows statically that the value is live.

### Monomorphization: move codegen is generated per concrete type

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn consume<T>(_v: T) {}

fn main() {
    consume(5i32);                     // consume::<i32> — moves 4 bytes, trivial drop glue
    consume(String::from("hi"));       // consume::<String> — moves 24 bytes, calls String's drop glue
    consume([0u8; 4096]);              // consume::<[u8; 4096]> — moves 4096 bytes, no drop glue needed
}
// Each instantiation gets its own move + drop codegen — "the move" isn't one code path,
// it's N code paths, one per T ever passed, generated at compile time.
```
::

## Cost, Performance, and Trade-Offs

**A move: free in the common case.** **A clone: a real, measurable cost.**

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn main() {
    let big = vec![0u8; 1_000_000];

    let moved = big;                 // ~24 bytes copied, zero heap traffic, O(1)
    let cloned = moved.clone();      // 1,000,000-byte heap allocation + memcpy, O(n)

    assert_eq!(moved.len(), cloned.len());
}
```
::

**Zero runtime tracking vs. GC/refcounting.** Ownership answers "who frees this?" entirely at compile time — there is no per-object header, no mark-and-sweep pause, no atomic refcount increment on every access, unlike a GC'd language or unlike `Rc`/`Arc` themselves:

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::rc::Rc;

fn main() {
    let owned = String::from("hi");        // freed by ownership rules — zero bytes of bookkeeping
    let shared = Rc::new(String::from("hi")); // freed by refcount — pays 2 extra words + inc/dec on every clone/drop
    println!("{owned} {shared}");
    // Rc/Arc are an explicit OPT-IN to runtime cost when compile-time ownership
    // genuinely can't express the sharing pattern you need — not the default.
}
```
::

**Drop glue is codegen, and it isn't free to compile or to maintain**: every type with a nontrivial destructor generates a drop function, and every aggregate containing it must call into it field-by-field, recursively, at every exit path (including early `return`, `?`, and panics during unwinding).

**Monomorphization cost**: a generic function moving `T` gets a full separate copy of its move/drop code per instantiated `T`. Ownership itself doesn't bloat the binary — but a generic hot path called with many distinct concrete types can, purely from the move/drop glue being duplicated per type. This is the same trade-off generics always make (compile time and binary size for zero-cost dispatch).

## Production Failure Modes & Anti-Patterns

### Anti-pattern: reaching for `.clone()` to silence every borrow error

::code-wrapper{language="rust" filename="main.rs"}
```rust
// naive: every borrow-checker complaint in a hot request path gets "fixed" with .clone()
struct Request { headers: Vec<(String, String)>, body: Vec<u8> }

fn handle(req: &Request) -> Vec<u8> {
    let headers = req.headers.clone();  // full Vec<(String, String)> deep-cloned...
    let body = req.body.clone();         // ...and the whole body, too — per request, in a hot loop
    process(headers, body)
}

fn process(headers: Vec<(String, String)>, body: Vec<u8>) -> Vec<u8> {
    body.iter().map(|b| b.wrapping_add(headers.len() as u8)).collect()
}
```
::

At 10k req/s this is 10k unnecessary heap allocations and memcpys per second, purely to dodge a borrow the function never needed ownership for in the first place.

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Request { headers: Vec<(String, String)>, body: Vec<u8> }

fn handle(req: &Request) -> Vec<u8> {
    process(&req.headers, &req.body) // borrow — zero allocations, zero copies
}

fn process(headers: &[(String, String)], body: &[u8]) -> Vec<u8> {
    body.iter().map(|b| b.wrapping_add(headers.len() as u8)).collect()
}
```
::

### Anti-pattern: attempting a self-referential struct because "it's just one owner"

::code-wrapper{language="rust" filename="main.rs"}
```rust
// naive: a parser that wants to own a buffer AND hold a slice into that same buffer
struct Parser {
    buffer: String,
    cursor: &'??? str, // there is no lifetime you can write here
}

fn broken() -> Parser {
    let buffer = String::from("data to parse");
    let cursor = &buffer[..4];
    // Parser { buffer, cursor } // ERROR: `buffer` is moved into the struct while borrowed
    todo!("moving `buffer` into the struct would relocate it — a move is a bitwise copy \
           that invalidates any pointer INTO the old location, so `cursor` would dangle")
}
```
::

This fails for the exact mechanical reason covered above: a move is a bitwise copy of the value's header, never a fix-up of pointers *into* it. Any field that borrows from a sibling field breaks the instant the struct moves.

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Production fix: store a position, not a pointer — recompute the borrow on demand.
struct Parser {
    buffer: String,
    cursor: usize,
}

impl Parser {
    fn remaining(&self) -> &str { &self.buffer[self.cursor..] }
    fn advance(&mut self, n: usize) { self.cursor += n; }
}
// Genuinely need the self-referential shape (async state machines, arenas)?
// That's what Pin, `ouroboros`, or `self_cell` exist for — covered in Lifetimes/Async.
```
::

### Anti-pattern: moving a large stack value in a hot loop, assuming "it's just a pointer"

::code-wrapper{language="rust" filename="main.rs"}
```rust
// naive: "moves are cheap" gets over-generalized to EVERY type, including this one
struct Frame([u8; 4096]); // a raw buffer, NOT heap-indirected — no ptr/len/cap header

fn process(f: Frame) -> Frame { f } // "just moving a pointer"... except there is no pointer

fn run(frames: Vec<Frame>) -> Vec<Frame> {
    frames.into_iter().map(process).collect() // each call memcpy's 4096 bytes, by value, twice
}
```
::

`Frame` has no heap allocation to leave in place — the 4096 bytes themselves ARE the value, so every move actually copies all 4096 bytes. This is the same mechanical rule as the `String`/`[u8; 4096]` comparison earlier, just easier to miss once it's wrapped in a struct.

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Frame([u8; 4096]);

fn process(f: &mut Frame) { f.0[0] = f.0[0].wrapping_add(1); } // mutate in place, zero copies

fn run(frames: &mut [Frame]) {
    for f in frames.iter_mut() { process(f); } // one 8-byte reference per call, not 4096 bytes
}

// If ownership genuinely must transfer, box it ONCE at construction so every
// subsequent move is header-sized:
struct BoxedFrame(Box<[u8; 4096]>);
fn process_owned(f: BoxedFrame) -> BoxedFrame { f } // moves 8 bytes, not 4096
```
::

## Architectural Application

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Default to &T: widest caller acceptance, composable with concurrent readers.
fn total(items: &[i32]) -> i32 { items.iter().sum() }

// Take T only when ownership transfer IS the API's meaning — a consuming
// transformation or a builder that returns Self.
struct RequestBuilder { url: String, retries: u32 }
impl RequestBuilder {
    fn retries(mut self, n: u32) -> Self { self.retries = n; self } // consumes and returns — chainable
}

fn into_uppercase(s: String) -> String { s.to_uppercase() } // signature SAYS "I consume your string"
```
::

A function taking `T` instead of `&T` is a documented contract: the caller cannot use their value afterward. Reserve it for builders, consuming conversions (`From`/`Into`), and cases where the callee must store or transfer the value — never as a default to avoid thinking about lifetimes.

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::thread;

// Ownership eliminates use-after-free and data races by construction, not by convention:
// a value can't be read from thread B after thread A's owner drops it, because the
// compiler will not let a reference outlive its owner in the first place.
fn spawn_owned(data: Vec<i32>) {
    thread::spawn(move || println!("{}", data.len())); // `data` moved in — no other owner exists
    // data is gone here — no accidental concurrent access is even expressible
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// RAII: deterministic Drop turns ownership into an architectural pattern for
// resource management — no try/finally, no explicit close() call to forget.
struct DbConnection { id: u32 }
impl Drop for DbConnection {
    fn drop(&mut self) { println!("releasing connection {}", self.id); } // guaranteed to run
}

fn transaction() {
    let _conn = DbConnection { id: 1 };
    // ... work, early returns, `?`, even panics (with unwind) ...
} // _conn.drop() runs HERE, on every exit path, no matter how the function leaves
```
::

RAII scales this to locks (`MutexGuard`), file handles, and connection pools: the type system makes "forgot to release the resource" a category of bug that can't compile, rather than a code-review checklist item.

## 💡 Tips & Tricks

- **Debug**: `dbg!(&value)` prints file/line/`Debug` output and returns ownership of the expression, so it splices into a move chain without disturbing it: `let s = dbg!(String::from("hi"));`.
- **Idiom**: prefer `std::mem::take`/`std::mem::replace` over `.clone()` when "emptying" a field during a state transition — O(1), no allocation.

  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  use std::mem;
  struct Buffer { data: Vec<u8> }
  impl Buffer {
      fn drain(&mut self) -> Vec<u8> {
          mem::take(&mut self.data) // self.data left as an empty Vec, no allocation
      }
  }
  ```
  ::
- **Performance**: `Rc::clone(&rc)`/`Arc::clone(&arc)` never deep-copy — it's a refcount bump. `rc.clone()` compiles identically but reads ambiguously; use the explicit associated-function form.
- **Idiom**: `Box<T>` moves are a pointer-sized copy of the box header regardless of `T`'s size — this is *why* moving a gigabyte-sized `Vec` is cheap, and it's the same mechanism as the `Frame` anti-pattern above, applied correctly.
- **Debug**: `std::mem::size_of::<T>()` confirms move cost directly — `String` is 24 bytes on 64-bit no matter how much heap data it owns; `[u8; 4096]` is 4096 bytes, full stop.
- **Clippy**: `clippy::redundant_clone` flags a `.clone()` whose result is never mutated independently of the original — often a sign a borrow would have worked.
- **Idiom**: partial moves let you take one field while keeping the rest usable — reassigning the moved field later makes the struct whole again.

  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  struct Person { name: String, age: u32 }
  fn demo(mut p: Person) {
      let n = p.name;             // partial move
      println!("{}", p.age);       // OK — age untouched
      p.name = "Bob".into();       // p is whole again
      println!("{}", p.name);
  }
  ```
  ::

## ⚠️ Edge Cases & Gotchas

- **`if`/`else` branches move independently**: `let x = if cond { a } else { b };` moves whichever branch executes; using `a` afterward is still an error even when `cond` was true and the `else` branch "never touched it" — the checker reasons about both paths statically, not the one that ran.
- **Shadowing doesn't drop early**: `let s = String::from("a"); let s = String::from("b");` — the first `s` drops at its *original* scope's end, not at the shadowing `let`, which surprises anyone expecting `Drop` order to follow lexical shadowing.
- **`Copy` closures silently duplicate, not move**: an `Fn` closure capturing a `Copy` value by value takes a fresh copy each call — mutations inside never propagate back, invisibly, unless you check whether the captured type is `Copy`.
- **`mem::swap(&mut a, &mut a)`**: legal, a no-op — the borrow checker sees one mutable borrow, not two aliasing ones — but it wastes a full swap's worth of moves if hit in a hot path by accident.
- **`Drop` on early return**: locals still drop in reverse declaration order at the `return`/`?` point, not at the function's lexical end — matters when a `Drop` impl releases a lock or flushes a buffer.
- **Platform quirk — `panic = "abort"`**: with `panic = "abort"` in `Cargo.toml`, a panic never unwinds, so `Drop` impls further up the call stack simply never run — RAII guards relying on `Drop` for cleanup are silently skipped on panic.
- **Cannot move out of an index**: `let first = v[0];` fails for non-`Copy` element types — `Vec::remove`, `.clone()`, or `into_iter()` are the escape hatches, in roughly that order of preference.

## 🧠 Spot the Bug

What happens when this compiles and runs?

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Logger;

impl Drop for Logger {
    fn drop(&mut self) {
        println!("Logger dropped");
    }
}

fn make_and_swap() {
    let mut first = Logger;
    let second = Logger;
    first = second;
    println!("about to end scope");
}

fn main() {
    make_and_swap();
}
```
::

<details>
<summary>Answer</summary>

Output:

::code-wrapper{language="rust" filename="main.rs"}
```rust
Logger dropped
about to end scope
Logger dropped
```
::

`first = second;` assigns into an *existing* binding that already owns a value. Rust doesn't just overwrite the pointer — because `Logger` implements `Drop`, assigning into `first` first **drops the old value** `first` held (printing immediately), then moves `second`'s value in. `second` is now invalid. At scope end only the surviving `first` (originally `second`'s value) drops, for two drops total — at very different times than a beginner would guess.

**The lesson**: assigning over a live binding of a `Drop` type runs the old value's destructor immediately, not at scope end.

</details>

## Summary

- A move is a compile-time-only concept: a bitwise copy of the value's stack representation plus static tracking in the initialization-state table — there is no runtime "move bit," and the common case costs zero instructions.
- `String`/`Vec`/`Box` are cheap to move because they're small headers pointing at heap data that never moves; a non-indirected type like `[u8; 4096]` genuinely copies all its bytes on every move.
- Drop glue and conditional drop flags are the one place ownership tracking generates real runtime code; monomorphization duplicates that codegen per concrete type.
- `.clone()` is a real allocation-and-copy cost, not a free way to dodge the borrow checker — default to borrowing (`&T`), and reach for `Clone`/`Rc`/`Arc` only when sharing genuinely can't be expressed statically.
- Self-referential structs don't compile because moving a struct can't fix up a pointer into itself — store an index/offset instead, or reach for `Pin`.
- Taking `T` instead of `&T` in a signature is an architectural signal (consuming transformation, builder), not a default; ownership is also what makes RAII and thread-safety guarantees hold by construction rather than convention.

Next: References and Borrowing — *using* a value without owning it.
