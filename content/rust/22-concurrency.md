# 22 — Concurrency

Rust prevents **data races at compile time**. Two marker traits do the work:

- `Send` — a value can be **moved** to another thread.
- `Sync` — a value can be **shared** (`&T`) between threads.

The compiler figures these out for you. `Rc` and `RefCell` are not thread-safe, so they lack them; `Arc` and `Mutex` have them.

## Spawning Threads

::code-wrapper{language="rust"}
```rust
use std::thread;

fn main() {
    let handle = thread::spawn(|| {
        (1..=10).sum::<i32>()
    });
    let total = handle.join().unwrap();   // wait and get the result
    println!("{total}");                  // 55
}
```
::

**Tricky**: when `main` returns, all other threads are killed — even mid-work. Always `join` threads whose work matters.

**Tricky**: a spawned thread can't borrow local variables:

::code-wrapper{language="rust"}
```rust
use std::thread;

fn main() {
    let v = vec![1, 2, 3];
    // thread::spawn(|| println!("{v:?}"));
    // error[E0373]: closure may outlive the current function, but it borrows `v`
    // help: use the `move` keyword

    let h = thread::spawn(move || println!("{v:?}"));   // v is moved into the thread
    h.join().unwrap();
}
```
::

### Scoped threads can borrow

::code-wrapper{language="rust"}
```rust
use std::thread;

fn main() {
    let mut data = vec![1, 2, 3];
    thread::scope(|s| {
        s.spawn(|| println!("sum {}", data.iter().sum::<i32>()));   // borrows data
        s.spawn(|| println!("len {}", data.len()));
    });                                   // all scoped threads are joined here
    data.push(4);                         // safe: the threads are finished
    println!("{data:?}");                 // [1, 2, 3, 4]
}
```
::

## Shared State: `Arc<Mutex<T>>`

::code-wrapper{language="rust"}
```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let counter = Arc::new(Mutex::new(0));
    let mut handles = vec![];

    for _ in 0..8 {
        let c = Arc::clone(&counter);
        handles.push(thread::spawn(move || {
            for _ in 0..1000 {
                *c.lock().unwrap() += 1;    // lock → change → unlock at end of statement
            }
        }));
    }
    for h in handles { h.join().unwrap(); }

    println!("{}", *counter.lock().unwrap());   // 8000 — every time
}
```
::

- `Arc` = shared ownership across threads.
- `Mutex` = one thread at a time may change the inside.

**Tricky**: the single-thread versions don't compile across threads:

::code-wrapper{language="rust"}
```rust
use std::cell::RefCell;
use std::sync::Arc;

fn main() {
    let a = Arc::new(RefCell::new(0));
    let b = Arc::clone(&a);
    // std::thread::spawn(move || *b.borrow_mut() += 1);
    // error[E0277]: `RefCell<i32>` cannot be shared between threads safely
}
```
::

### The lock lives as long as the guard

::code-wrapper{language="rust"}
```rust
use std::sync::Mutex;

fn main() {
    let m = Mutex::new(5);

    let guard = m.lock().unwrap();      // locked while `guard` exists
    println!("{}", m.try_lock().is_ok()); // false
    drop(guard);                        // unlock now
    println!("{}", m.try_lock().is_ok()); // true

    // let _ = m.lock().unwrap();
    // error: non-binding let on a synchronization lock
    // `let _` would drop the guard IMMEDIATELY — the lock protects nothing.
}
```
::

**Tricky**: locking the same `Mutex` twice in one thread **deadlocks** (hangs forever) — it never panics:

::code-wrapper{language="rust"}
```rust
use std::sync::Mutex;

fn main() {
    let m = Mutex::new(vec![1]);
    let len = m.lock().unwrap().len();    // guard dropped at the `;`
    m.lock().unwrap().push(len as i32);   // OK

    // let g = m.lock().unwrap();
    // m.lock().unwrap().push(2);         // HANGS — g still holds the lock
}
```
::

### Poisoning

If a thread panics while holding a lock, the `Mutex` is marked **poisoned**:

::code-wrapper{language="rust"}
```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let m = Arc::new(Mutex::new(0));
    let m2 = Arc::clone(&m);
    let _ = thread::spawn(move || {
        let _g = m2.lock().unwrap();
        panic!("crash while locked");
    }).join();

    println!("{}", m.lock().is_err());   // true — every later .unwrap() would panic too
    let value = m.lock().unwrap_or_else(|e| e.into_inner());   // recover the data anyway
    println!("{}", *value);              // 0
}
```
::

## Message Passing: Channels

::code-wrapper{language="rust"}
```rust
use std::sync::mpsc;
use std::thread;

fn main() {
    let (tx, rx) = mpsc::channel();
    for id in 0..3 {
        let tx = tx.clone();
        thread::spawn(move || tx.send(id * 10).unwrap());
    }
    drop(tx);                                   // ← important, see below

    let mut got: Vec<i32> = rx.iter().collect(); // ends when ALL senders are gone
    got.sort();
    println!("{got:?}");                        // [0, 10, 20]
}
```
::

**Tricky**: without `drop(tx)`, the original sender still exists, so `rx.iter()` waits forever — the program hangs.

## Atomics for Simple Counters

::code-wrapper{language="rust"}
```rust
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;

fn main() {
    let hits = Arc::new(AtomicUsize::new(0));
    let handles: Vec<_> = (0..4).map(|_| {
        let h = Arc::clone(&hits);
        thread::spawn(move || { h.fetch_add(1, Ordering::Relaxed); })
    }).collect();
    for h in handles { h.join().unwrap(); }
    println!("{}", hits.load(Ordering::Relaxed));   // 4
}
```
::

## 💡 Tips & Tricks

- **Idiom** — `thread::scope` when threads only need to borrow local data.
- **Idiom** — keep lock guards short; copy data out, unlock, then do slow work.
- **Idiom** — atomics for counters/flags; `Mutex` for anything bigger.
- **Idiom** — `RwLock` when reads are much more common than writes.
- **Debug** — `join()` returns `Err` if the thread panicked; check it.

## ⚠️ Edge Cases & Gotchas

- **Exit** — `main` returning kills unjoined threads.
- **move** — `thread::spawn` needs `move` (or `thread::scope`) to use local data.
- **Rc/RefCell** — not thread-safe; the compiler rejects them. Use `Arc`/`Mutex`.
- **let _** — `let _ = m.lock()` unlocks immediately (now a compile error by default).
- **Deadlock** — locking the same `Mutex` twice in one thread hangs; lock several mutexes in the same order everywhere.
- **Channels** — `rx.iter()` ends only when every `Sender` (including the original) is dropped.
- **Poison** — a panic while holding a lock makes later `lock()` calls return `Err`.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
use std::sync::mpsc;
use std::thread;

fn main() {
    let (tx, rx) = mpsc::channel();
    for i in 0..3 {
        let tx = tx.clone();
        thread::spawn(move || tx.send(i).unwrap());
    }
    for msg in rx {
        println!("got {msg}");
    }
    println!("done");
}
```
::

<details>
<summary>Answer</summary>

Prints the three messages, then **hangs** — `done` never appears. The loop over `rx` ends only when all senders are dropped, but the original `tx` is still alive in `main`.

Fix: `drop(tx);` before the loop (or move the original `tx` into the last thread).

</details>

## 🧠 Quick Quiz

::code-wrapper{language="rust"}
```rust
use std::thread;

fn main() {
    let mut total = 0;
    thread::scope(|s| {
        s.spawn(|| total += 5);
    });
    println!("{total}");
}
```
::

<details>
<summary>Answer</summary>

`5`. A scoped thread may even borrow `total` mutably — the scope guarantees the thread finishes before `total` is used again. (Two threads both writing `total` would be rejected by the borrow checker.)

</details>

## Summary

Threads need `move` or `thread::scope`. Share state with `Arc<Mutex<T>>` (or atomics); send data with channels. The compiler blocks data races, but you still have to avoid deadlocks and remember to drop senders and guards.

Next: Async/Await.
