# 19 — Smart Pointers & Memory Management

Every smart pointer in `std` is solving the same underlying problem from a different angle: Rust's compile-time ownership model (chapter 07) assumes a single owner and a statically-provable borrow graph, but real systems need heap indirection, shared ownership, and mutation-behind-a-shared-reference. `Box`, `Rc`/`Arc`, and `Cell`/`RefCell`/`Mutex` are three different, deliberate relaxations of that model — each with a precise mechanical cost, and each capable of failing in a specific, predictable way when misapplied.

## Under-the-Hood Mechanics

### `Box<T>`: a single pointer, nothing else

::code-wrapper{language="rust"}
```rust
println!("{}", std::mem::size_of::<Box<i32>>());                 // 8  — thin pointer
println!("{}", std::mem::size_of::<Box<[i32]>>());                // 16 — fat pointer: {ptr, len}
println!("{}", std::mem::size_of::<Box<dyn std::fmt::Debug>>());  // 16 — fat pointer: {ptr, vtable}
```
::

::code-wrapper{language="rust"}
```rust
// Moving a Box moves only the pointer — the heap data never moves:
struct Huge([u8; 1_000_000]);
fn take(_b: Box<Huge>) {}   // cheap: one pointer copied, regardless of Huge's size
let b = Box::new(Huge([0; 1_000_000]));
take(b);
```
::

::code-wrapper{language="rust"}
```rust
// Recursive types NEED Box — size must be knowable at compile time:
enum List { Cons(i32, Box<List>), Nil }   // Box breaks the infinite-size cycle
// enum ListBroken { Cons(i32, ListBroken), Nil }  // ERROR: infinite size
let list = List::Cons(1, Box::new(List::Cons(2, Box::new(List::Nil))));
```
::

### `Rc<T>`/`Arc<T>`: a pointer to a shared control block

`Rc::new(v)` doesn't just box `v` — it allocates a control block containing the value **plus** two counters:

::code-wrapper{language="rust"}
```rust
// Conceptual layout of what Rc<T>/Arc<T> point to (simplified)
struct RcBox<T> {
    strong: Cell<usize>,   // Rc: plain Cell.  Arc: AtomicUsize instead.
    weak: Cell<usize>,
    value: T,
}
```
::

::code-wrapper{language="rust"}
```rust
use std::rc::Rc;
let a = Rc::new(vec![1, 2, 3]);        // strong: 1, weak: 0
let b = Rc::clone(&a);                  // strong: 2 — counter increment, NOT a deep copy of the Vec
println!("{}", Rc::strong_count(&a));   // 2
drop(b);                                 // strong: 1
println!("{}", Rc::strong_count(&a));   // 1
```
::

::code-wrapper{language="rust"}
```rust
// Arc: structurally identical, but counters are AtomicUsize — real cost difference
use std::sync::Arc;
let a = Arc::new(vec![1, 2, 3]);
let b = Arc::clone(&a);   // atomic increment — costs more than Rc's plain Cell increment
```
::

::code-wrapper{language="rust"}
```rust
use std::rc::{Rc, Weak};
let a = Rc::new(5);
let w: Weak<i32> = Rc::downgrade(&a);
drop(a);                              // strong -> 0, value dropped, control block survives (weak: 1)
assert!(w.upgrade().is_none());       // safely observes "gone" — no use-after-free
```
::

### `Cell<T>` vs `RefCell<T>`: two different interior-mutability mechanisms, two different costs

::code-wrapper{language="rust"}
```rust
use std::cell::{Cell, RefCell};
println!("{}", std::mem::size_of::<Cell<i32>>());     // 4  — no overhead, T: Copy required for .get()
println!("{}", std::mem::size_of::<RefCell<i32>>());   // 8  — i32 + borrow-state flag (padded)
```
::

::code-wrapper{language="rust"}
```rust
// Cell: no reference ever escapes — only owned copies in/out, hence T: Copy
let c = Cell::new(5);
c.set(10);
let v = c.get();   // v is a COPY, not a reference — zero-cost, safe

// RefCell: hands out real references, checked at runtime on every call
let r = RefCell::new(vec![1, 2]);
{
    let mut guard = r.borrow_mut();   // runtime check + counter increment
    guard.push(3);
}   // counter decremented on drop
```
::

::code-wrapper{language="rust"}
```rust
// RefCell panics where Cell simply couldn't have compiled the equivalent misuse:
let r = RefCell::new(0);
let _b1 = r.borrow();
let _b2 = r.borrow_mut();   // panics at runtime: already borrowed
```
::

### `Mutex<T>`/`RwLock<T>`: the same interior-mutability idea, backed by OS primitives

::code-wrapper{language="rust"}
```rust
use std::sync::Mutex;
let data = Mutex::new(vec![1, 2, 3]);
{
    let mut guard = data.lock().unwrap();   // blocks the THREAD if contended
    guard.push(4);
}   // lock released HERE, via Drop — RAII, same mechanism as closing a file
```
::

::code-wrapper{language="rust"}
```rust
// WRONG: guard held across unrelated work — lock stays held far past the real critical section
fn slow(data: &Mutex<Vec<i32>>) {
    let mut guard = data.lock().unwrap();
    guard.push(1);
    std::thread::sleep(std::time::Duration::from_millis(100)); // still holding the lock!
}

// RIGHT: guard scoped tightly, released before unrelated work
fn fast(data: &Mutex<Vec<i32>>) {
    { data.lock().unwrap().push(1); }   // guard dropped immediately
    std::thread::sleep(std::time::Duration::from_millis(100)); // no lock held
}
```
::

## Cost, Performance, and Trade-Offs

::code-wrapper{language="rust"}
```rust
// Boxing purely to shrink stack size, with no real need, adds cost for no benefit:
struct Small { a: i32, b: i32 }
fn needless_box(s: Small) -> Box<Small> { Box::new(s) }   // allocation + indirection, no payoff
fn by_value(s: Small) -> Small { s }                       // free — no heap involved
```
::

::code-wrapper{language="rust"}
```rust
// Cost-visible comparison: Rc (non-atomic) vs Arc (atomic) clone, same logical operation
use std::rc::Rc;
use std::sync::Arc;

let rc = Rc::new(0);
let _ = Rc::clone(&rc);     // plain increment — cheap, single-threaded only

let arc = Arc::new(0);
let _ = Arc::clone(&arc);   // atomic increment — costs more on ARM than x86, required cross-thread
```
::

::code-wrapper{language="rust"}
```rust
// RefCell: the CPU cost of the check is tiny; the real cost is a runtime panic
// that a test suite covering only the "normal order" code path will never catch:
use std::cell::RefCell;
fn risky(cell: &RefCell<Vec<i32>>) {
    let _r = cell.borrow();
    // ... 50 lines later, on a rarely-hit branch:
    // cell.borrow_mut();  // panics ONLY when this exact path executes
}
```
::

::code-wrapper{language="rust"}
```rust
// Lock granularity: coarse lock serializes unrelated fields
use std::sync::Mutex;
struct CoarseState { counter: u64, config: String }
let state = Mutex::new(CoarseState { counter: 0, config: String::new() });
// updating `counter` blocks a concurrent read of `config` — nothing about them conflicts

// finer-grained: separate locks per field, more concurrency, more lock overhead
struct FineState { counter: Mutex<u64>, config: Mutex<String> }
```
::

## Production Failure Modes & Anti-Patterns

### An `Rc<RefCell<Node>>` graph with owning back-references, leaking forever

::code-wrapper{language="rust"}
```rust
// WRONG: parent and child hold STRONG references to each other —
// a cycle whose refcounts never reach zero, in perfectly safe Rust
use std::cell::RefCell;
use std::rc::Rc;

struct Node {
    value: i32,
    parent: RefCell<Option<Rc<Node>>>,   // BUG: strong reference back up the tree
    children: RefCell<Vec<Rc<Node>>>,
}

fn build_leak() {
    let parent = Rc::new(Node { value: 0, parent: RefCell::new(None), children: RefCell::new(vec![]) });
    let child = Rc::new(Node { value: 1, parent: RefCell::new(Some(Rc::clone(&parent))), children: RefCell::new(vec![]) });
    parent.children.borrow_mut().push(Rc::clone(&child));
    // parent.strong_count == 2 (local `parent` + child's back-reference)
    // child.strong_count  == 2 (local `child` + parent's forward-reference)
    // When `build_leak` returns, both locals drop, but each Rc still has
    // strong_count == 1 from the OTHER side — neither ever reaches 0. Permanent leak.
}
```
::

This compiles, runs, and produces no error, warning, or panic — a **safe-Rust memory leak**. Reference counting is a runtime property the borrow checker has no say over. A server building and discarding many such graphs sees slow, silent memory growth that eventually OOMs, with no stack trace pointing at the cause.

::code-wrapper{language="rust"}
```rust
// RIGHT: back-references use Weak, which doesn't hold the allocation alive
use std::cell::RefCell;
use std::rc::{Rc, Weak};

struct Node {
    value: i32,
    parent: RefCell<Option<Weak<Node>>>,   // non-owning — breaks the cycle
    children: RefCell<Vec<Rc<Node>>>,       // owning, forward direction only
}
```
::

### `RefCell` panicking in production because of a guard's implicit lifetime extension

::code-wrapper{language="rust"}
```rust
// WRONG: `children` (a Ref guard) is still alive when borrow_mut() runs,
// because it's used again later in the function — the compiler enforces static
// borrow rules on the RefCell handle, but has no visibility into the guard's runtime state
use std::cell::RefCell;
use std::rc::Rc;

struct Node { value: i32, children: RefCell<Vec<Rc<Node>>> }

fn process(root: &Rc<Node>, leaf: &Rc<Node>) {
    let children = root.children.borrow();
    root.children.borrow_mut().push(Rc::clone(leaf));   // panics: already borrowed
    println!("{}", children.len());                      // `children` used here — its scope extends this far
}
```
::

This compiles cleanly — the borrow checker only enforces rules on the `RefCell` handle, not on the guards it hands out, whose lifetime runs to their last use (here, the trailing `println!`). `borrow_mut()` conflicts with the still-alive `children` guard and panics with `BorrowMutError` only at runtime, only on this exact call order.

::code-wrapper{language="rust"}
```rust
// RIGHT: scope the immutable borrow explicitly so it's dropped before the mutable one
fn process(root: &Rc<Node>, leaf: &Rc<Node>) {
    let count = { root.children.borrow().len() };   // Ref dropped at end of this block
    root.children.borrow_mut().push(Rc::clone(leaf));
    println!("{count}");
}
```
::

### `Mutex` poisoning silently degrading an entire worker pool

::code-wrapper{language="rust"}
```rust
// WRONG: one panicking worker poisons the shared Mutex, and every OTHER
// worker's subsequent .lock().unwrap() now panics too — one bug cascades
use std::sync::{Arc, Mutex};
use std::thread;

fn run_pool(shared: Arc<Mutex<Vec<i32>>>) {
    let mut handles = vec![];
    for i in 0..8 {
        let s = Arc::clone(&shared);
        handles.push(thread::spawn(move || {
            let mut guard = s.lock().unwrap();   // panics for ALL workers after ANY one poisons it
            guard.push(i / (i - 3));              // deliberately buggy: panics when i == 3
        }));
    }
    for h in handles { let _ = h.join(); }
}
```
::

One worker's arithmetic panic (unrelated to locking) poisons the `Mutex` while it holds the lock. Every subsequent `.lock()` from every other thread returns `Err`, and the naive `.unwrap()` propagates that as a *second* panic each time — one bug cascades into apparent total pool failure.

::code-wrapper{language="rust"}
```rust
// RIGHT: decide explicitly how to handle poison — here, recover and log rather than cascade
fn run_pool(shared: Arc<Mutex<Vec<i32>>>) {
    let mut handles = vec![];
    for i in 0..8 {
        let s = Arc::clone(&shared);
        handles.push(thread::spawn(move || -> Result<(), String> {
            let mut guard = s.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            if i == 3 { return Err("skipping known-bad index".into()); }
            guard.push(i);
            Ok(())
        }));
    }
    for h in handles {
        if let Ok(Err(e)) = h.join() { eprintln!("worker failed: {e}"); }
    }
}
```
::

### `Box::leak` used casually in a per-request path

::code-wrapper{language="rust"}
```rust
// WRONG: individually correct, cumulatively fatal — every call permanently
// leaks memory that is never reclaimed for the life of the process
fn get_static_config(raw: String) -> &'static str {
    Box::leak(raw.into_boxed_str())   // legitimate ONCE, at startup — not per-request
}
```
::

Every individual call compiles, runs, and returns a perfectly valid `&'static str` — no error anywhere. The failure appears only in aggregate: called once per request, this leaks the entire request body forever, every single request — a slow march to OOM invisible in code review because each call site "looks fine" alone.

::code-wrapper{language="rust"}
```rust
// RIGHT: reserve Box::leak for genuine one-time, process-lifetime initialization
static CONFIG: std::sync::OnceLock<String> = std::sync::OnceLock::new();

fn get_config(loader: impl FnOnce() -> String) -> &'static str {
    CONFIG.get_or_init(loader)   // initialized exactly once, no per-call leak
}
```
::

## Architectural Application

::code-wrapper{language="rust"}
```rust
// Rc<RefCell<T>>: compile-time-enforced single-threaded — Rc: !Send, hard wall later
use std::{cell::RefCell, rc::Rc};
struct UiWidget { state: Rc<RefCell<i32>> }   // fine for single-threaded GUI state

// Arc<Mutex<T>>: pays synchronization cost, but crosses thread boundaries
use std::sync::{Arc, Mutex};
struct SharedCounter { state: Arc<Mutex<i32>> }   // required the moment threads share it
```
::

::code-wrapper{language="rust"}
```rust
// Weak encodes ownership direction in the type system, not convention
use std::{cell::RefCell, rc::{Rc, Weak}};
struct Parent { children: RefCell<Vec<Rc<Child>>> }   // owns, forward
struct Child { parent: RefCell<Weak<Parent>> }         // refers, non-owning
```
::

::code-wrapper{language="rust"}
```rust
// Cow: API boundary optimization — common case borrows, uncommon case allocates
use std::borrow::Cow;
fn normalize(input: &str) -> Cow<str> {
    if input.chars().all(|c| c.is_lowercase()) {
        Cow::Borrowed(input)              // common case: no allocation
    } else {
        Cow::Owned(input.to_lowercase())  // uncommon case: allocate transformed copy
    }
}
```
::

::code-wrapper{language="rust"}
```rust
// Lock-guard scope determines REAL concurrency, independent of lock granularity
use std::sync::Mutex;
fn bad(m: &Mutex<Vec<i32>>) {
    let mut g = m.lock().unwrap();
    g.push(expensive_fetch());   // I/O while holding the lock — serializes everyone
}
fn good(m: &Mutex<Vec<i32>>) {
    let v = expensive_fetch();    // do the expensive work FIRST, lock-free
    m.lock().unwrap().push(v);    // hold the lock only for the cheap push
}
fn expensive_fetch() -> i32 { 42 }
```
::

## 💡 Tips & Tricks

- **Debug**: `Rc::strong_count(&rc)` and `Rc::weak_count(&rc)` print live reference counts at any point — invaluable for tracking down a suspected cycle leak.
- **Idiom**: prefer `Rc::clone(&rc)` over `rc.clone()` everywhere in shared codebases — the associated-function form makes "this is just a refcount bump" visible at every call site to reviewers scanning for accidental deep clones.
- **Performance**: `parking_lot::Mutex`/`RwLock` skip the `Result`/poisoning machinery of `std::sync`, making lock/unlock noticeably cheaper in hot paths — swap in when poison-based panic detection isn't a requirement.
- **Idiom**: `Rc::get_mut`/`Arc::get_mut` return `Some(&mut T)` only when the strong count is exactly 1 — a cheap way to mutate in place right after construction, before the handle has been shared.
- **Debug**: `RefCell::try_borrow_mut()` returns a `Result` instead of panicking — use it in diagnostic logging to identify *which* borrow is still outstanding before the panic-causing one fires.
- **Idiom**: `Rc<str>`/`Arc<str>` (via `Rc::from(&str)`) are cheaper to clone than `Rc<String>` when the string never needs mutation — one fewer level of indirection.

## ⚠️ Edge Cases & Gotchas

- **`RefCell` panics are runtime, not compile-time** — two `.borrow_mut()` calls whose live ranges overlap only through a not-obviously-live guard panic only on the exact code path that triggers the overlap; unexercised tests won't catch it.
- **`Weak::upgrade()` after the last strong reference drops silently returns `None`** — no panic, no error type; a forgotten `Weak` cleanup quietly turns a "parent" pointer permanently `None` with no visible failure until missing data is noticed downstream.
- **`Rc`/`Arc` cycles are a *safe-Rust* memory leak** — the borrow checker and type system do not prevent reference cycles; `Rc<RefCell<Node>>` trees with strong back-pointers leak forever with zero compiler or runtime warning.
- **`Mutex` poisoning propagates across the whole shared value** — once one thread panics while holding a `std::sync::Mutex`, every future `.lock()` call from any thread returns `Err`, potentially cascading one bug into apparent total-pool failure.
- **`Cell<T>` requires `T: Copy` for `.get()`** — a poor fit for anything beyond primitives and small `Copy` structs; the fix (`RefCell`) has different panic semantics, not just a bigger API surface.
- **`Box::leak` is a genuine leak, not a trick** — the returned `&'static mut` is safe and legitimate to use, but the memory is never reclaimed for the process's lifetime; using it per-request or per-iteration exhausts memory in production even though every individual call compiles and runs correctly.
- **Platform quirk**: `Arc`'s atomic refcount operations are essentially free on x86 (strongly ordered) but measurably costlier on ARM — code that profiles identically in local x86 development can show real `Arc::clone` overhead differences on ARM-based CI or deployment targets.

## 🧠 Spot the Bug

What happens when `main` runs?

::code-wrapper{language="rust"}
```rust
use std::cell::RefCell;
use std::rc::Rc;

struct Node {
    value: i32,
    children: RefCell<Vec<Rc<Node>>>,
}

fn main() {
    let leaf = Rc::new(Node { value: 1, children: RefCell::new(vec![]) });
    let root = Rc::new(Node { value: 0, children: RefCell::new(vec![Rc::clone(&leaf)]) });

    let children = root.children.borrow();
    root.children.borrow_mut().push(Rc::clone(&leaf));

    println!("{}", children.len());
}
```
::

<details>
<summary>Answer</summary>

This panics at runtime: `already borrowed: BorrowMutError`.

`root.children.borrow()` creates a `Ref` guard bound to `children`, still alive when `borrow_mut()` runs two lines later — its scope extends to the trailing `println!`. The compile-time borrow checker only enforces rules on the `RefCell` handle, not on the guards it hands out; `RefCell` enforces the real rule at *runtime* instead, by panicking.

**The lesson**: `RefCell` moves borrow checking from compile time to runtime — an active `Ref` guard still blocks a `borrow_mut()` even though the compiler can't see the conflict.

</details>

## Summary

`Box` is a single owning pointer with zero overhead beyond the allocation itself. `Rc`/`Arc` add a shared control block with strong/weak counters — cheap non-atomic increments for `Rc`, real atomic-instruction cost (platform-dependent) for `Arc`. `Cell` is genuinely zero-cost interior mutability for `Copy` types; `RefCell`/`Mutex`/`RwLock` move borrow checking to runtime, trading a compile-time guarantee for a panic or block risk. Reference cycles via strong `Rc`/`Arc` back-references are a real, silent, safe-Rust memory leak — `Weak` is the structural fix, not an optional nicety. Every one of these types is a deliberate, costed relaxation of the ownership model, not a free upgrade over plain ownership.

Next: Modules and crates — organizing code, visibility boundaries, and how they shape a crate's public API surface.
