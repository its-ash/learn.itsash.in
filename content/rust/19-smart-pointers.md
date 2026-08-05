# 19 — Smart Pointers & Memory Management

Smart pointers own data and provide extra behavior beyond references. They're the bridge between Rust's ownership model and dynamic data structures.

## `Box<T>` — Heap Allocation

::code-wrapper{language="rust"}
```rust
let b = Box::new(5);
let s = Box::new(String::from("hi"));
```
::

- Allocates on the heap; owned.
- Single owner; dropped when out of scope.
- Sized: `Box<T>` has the size of a pointer.

### When You Need `Box`

- Recursive types (linked structures need indirection to have a finite size).
- Large data you don't want to copy on the stack.
- Trait objects (`Box<dyn Trait>`) — unsized types need a wide pointer.
- Sending owned data to a thread (`Box::new` makes it `'static`).

::code-wrapper{language="rust"}
```rust
enum List {
    Cons(i32, Box<List>),   // recursive — needs Box
    Nil,
}
```
::

### `Box::leak` — Permanent Reference

::code-wrapper{language="rust"}
```rust
let leaked: &'static mut [u8] = Box::leak(vec![1, 2, 3].into_boxed_slice());
```
::

Leaks forever; useful for one-time configs but a real memory leak.

## `Rc<T>` — Reference Counted (single-threaded)

::code-wrapper{language="rust"}
```rust
use std::rc::Rc;
let a = Rc::new(String::from("hi"));
let b = Rc::clone(&a);    // increments refcount, doesn't copy
let c = a.clone();         // same
// a, b, c all share the same String
```
::

- Multiple owners in a **single thread**.
- Atomic increment/decrement of a refcount.
- Not `Send`/`Sync` (uses non-atomic counters; cheaper than `Arc`).
- When the count hits 0, the value is dropped.
- Use `Rc::clone(&rc)` (idiomatic) — don't use `rc.clone()` (looks like a deep clone).

### `Rc` Doesn't Allow Mutation

`Rc<T>` gives shared read access. To mutate shared state, wrap in `RefCell`:

::code-wrapper{language="rust"}
```rust
let shared = Rc::new(RefCell::new(vec![1, 2, 3]));
shared.borrow_mut().push(4);
```
::

### Weak References

::code-wrapper{language="rust"}
```rust
use std::rc::{Rc, Weak};
let strong = Rc::new(5);
let weak: Weak<i32> = Rc::downgrade(&strong);
if let Some(v) = weak.upgrade() { /* ... */ }
```
::

`Weak` doesn't count toward ownership; avoids cycles. Crucial for parent/child links (e.g., GUI trees, linked structures).

## `Arc<T>` — Atomic Reference Counted (thread-safe)

::code-wrapper{language="rust"}
```rust
use std::sync::Arc;
let a = Arc::new(vec![1, 2, 3]);
let b = Arc::clone(&a);
std::thread::spawn(move || println!("{:?}", b));
```
::

- Thread-safe version of `Rc` (atomic ops, slower).
- `Send` and `Sync` if `T: Send + Sync`.
- Idiomatic for sharing across threads.

### When `Rc` vs `Arc`

- Single-threaded: `Rc` (faster, simpler).
- Multi-threaded: `Arc`.
- Never use `Rc` across threads — the compiler forbids it via `Send`.

## Cycles and Memory Leaks

::code-wrapper{language="rust"}
```rust
let a = Rc::new(RefCell::new(None));
let b = Rc::new(RefCell::new(None));
*a.borrow_mut() = Some(Rc::clone(&b));
*b.borrow_mut() = Some(Rc::clone(&a));    // CYCLE: refcount never hits 0
```
::

`Rc`/`Arc` cycles leak. Use `Weak` for back-references. Rust can't prevent this; design matters.

## Interior Mutability Pattern

`Rc`/`Arc` give shared ownership but no mutation. Wrap the inner in `RefCell`/`Mutex`:

::code-wrapper{language="rust"}
```rust
// single-threaded
let shared = Rc::new(RefCell::new(0));
*shared.borrow_mut() += 1;

// multi-threaded
let shared = Arc::new(Mutex::new(0));
*shared.lock().unwrap() += 1;
```
::

## `Cell<T>` — Copy-Type Interior Mutability

::code-wrapper{language="rust"}
```rust
use std::cell::Cell;
let c = Cell::new(5);
c.set(10);
let v = c.get();          // requires T: Copy
```
::

- Zero-cost interior mutability for `Copy` types.
- No borrow checking (just stores the value).
- Cannot get a `&T` out (only `get`/`set`).
- Use for simple flags, counters, small `Copy` types.

## `RefCell<T>` — Borrow-Checked Interior Mutability

::code-wrapper{language="rust"}
```rust
use std::cell::RefCell;
let c = RefCell::new(vec![1, 2, 3]);
c.borrow_mut().push(4);
let r = c.borrow();      // immutable borrow
println!("{:?}", r);
```
::

- Moves borrow checking to **runtime**: `borrow()` and `borrow_mut()` track active borrows.
- Multiple `borrow()` OK; one `borrow_mut()` exclusive.
- **Panics** on borrow violation: "already borrowed" / "already mutably borrowed".

### `try_borrow` / `try_borrow_mut`

Non-panicking variants returning `Result`. Useful when you might encounter a borrow conflict gracefully.

## `Mutex<T>` and `RwLock<T>`

::code-wrapper{language="rust"}
```rust
use std::sync::Mutex;
let m = Mutex::new(0);
let guard = m.lock().unwrap();
*guard += 1;
// guard drops here, unlocking

use std::sync::RwLock;
let rw = RwLock::new(0);
{
    let r1 = rw.read().unwrap();
    let r2 = rw.read().unwrap();   // multiple readers OK
}
{
    let mut w = rw.write().unwrap();  // exclusive writer
    *w += 1;
}
```
::

- `Mutex`: one accessor at a time.
- `RwLock`: many readers or one writer.
- Locks return `Result` because a poisoned lock (holder panicked) returns `Err`.
- `Lock` guards auto-unlock on drop (RAII).

### Poison

If a thread panics while holding a lock, the lock becomes "poisoned"; subsequent `.lock()` returns `Err`. This signals possibly-corrupted state. Recover with `into_inner()` if you're sure, or use `lock().unwrap()` to propagate the panic.

## `Once`, `OnceLock`, `LazyLock` — Initialization

::code-wrapper{language="rust"}
```rust
use std::sync::OnceLock;
static CONFIG: OnceLock<Config> = OnceLock::new();
let c = CONFIG.get_or_init(|| Config::load());

// 1.80+: LazyLock
use std::sync::LazyLock;
static DB: LazyLock<Db> = LazyLock::new(|| Db::open());
let _ = &*DB;     // initialized on first access
```
::

Pre-`LazyLock` you'd use the `once_cell` or `lazy_static` crates. Modern std has you covered.

## `Cow<T>` — Clone-on-Write

::code-wrapper{language="rust"}
```rust
use std::borrow::Cow;
fn greet(name: Cow<str>) {
    println!("{name}");
}
greet("literal".into());           // borrowed
greet(String::from("owned").into()); // owned
```
::

`Cow<'a, B>` is either borrowed or owned — lets you write APIs that accept either, deferring the clone until mutation.

::code-wrapper{language="rust"}
```rust
let mut c: Cow<str> = Cow::Borrowed("hi");
c.to_mut().push('!');     // clones once, now owned
```
::

## `Pin<T>` — Pinned Pointers

`Pin` guarantees a value won't be moved in memory after pinning. Essential for self-referential data (e.g., async futures holding references across `.await` points):

::code-wrapper{language="rust"}
```rust
let mut fut = async { 5 };
let pinned = Pin::new(&mut fut);
```
::

You usually don't write `Pin` by hand — async/await generates it. The Pin chapter (Async) covers the details.

## `NonNull<T>`, `*mut T`, `*const T` (Unsafe)

Raw pointers, no automatic lifetime tracking; only usable in `unsafe` blocks. `NonNull<T>` is non-null `*mut T` and is covariant. Used in collections/FFI. See Unsafe chapter.

## Smart Pointer Cheat Sheet

| Type | Ownership | Mutability | Thread-safe | Use |
|---|---|---|---|---|
| `Box<T>` | Single | direct (`mut`) | if `T: Send` | Heap, recursion |
| `Rc<T>` | Shared | via `RefCell` | NO | Graphs, trees |
| `Arc<T>` | Shared | via `Mutex`/`RwLock` | YES | Cross-thread share |
| `Cell<T>` | Single | `set/get` | NO | `Copy` flags |
| `RefCell<T>` | Single | runtime borrow | NO | Single-thread mut share |
| `Mutex<T>` | Single | lock | YES | Cross-thread mut share |
| `RwLock<T>` | Single | read/write lock | YES | Read-heavy share |
| `Cow<'a, B>` | Either | `to_mut` | if `B: Send` | Borrowed-or-owned |
| `Pin<P>` | (wrapper) | via `DerefMut` | if `P: Send` | Self-referential |

## Deref and DerefMut

Smart pointers implement `Deref`/`DerefMut` to enable `&`-coercions and method forwarding:

::code-wrapper{language="rust"}
```rust
let b = Box::new(String::from("hi"));
b.push('!');              // Box<String> derefs to String, which derefs to str
let s: &str = &b;          // &Box<String> -> &String -> &str
```
::

## Drop Order for Smart Pointers

- `Box`/`Rc`/`Arc` drop their contents when refcount hits 0.
- `MutexGuard`/`RwLockReadGuard` release the lock on drop — keep guards short-scoped.

## Common Pitfalls

- **`Rc` across threads**: `Rc: !Send`, compile error.
- **`Arc<Mutex<T>>` vs `Mutex<Arc<T>>`**: the former mutates shared data; the latter replaces the entire shared pointer atomically.
- **Lock granularity**: too coarse = contention; too fine = deadlocks.
- **Deadlock**: lock ordering must be consistent across threads. Acquire locks in a fixed order.
- **`Rc::clone` vs `Clone::clone`**: same; `Rc::clone(&rc)` makes it obvious it's cheap.
- **`Weak::upgrade` returns `Option`**: handle the case where the value was dropped.
- **`RefCell::borrow_mut` panic**: can happen in complex call graphs; structure borrows to release before re-borrowing.
- **`Mutex::lock().unwrap()`**: panics on poison. Consider graceful recovery.

## Memory Layout of Smart Pointers

- `Box<T>`: a single pointer.
- `Rc<T>`/`Arc<T>`: pointer to a heap-allocated `{ strong_count, weak_count, value }` block.
- `Cell<T>`/`RefCell<T>`: in-place storage; `RefCell` adds a borrow-state field.
- `Mutex<T>`/`RwLock<T>`: in-place storage + OS synchronization primitives.

## Summary

`Box` = single-owner heap. `Rc`/`Arc` = shared ownership. `Cell`/`RefCell`/`Mutex`/`RwLock` = interior mutability. `Cow` = borrowed-or-owned. `Pin` = no-move guarantee for async. `Weak` avoids cycles. Memory leaks via reference cycles are possible in safe Rust — design with `Weak` back-references.

Next: Modules and crates — organizing code.