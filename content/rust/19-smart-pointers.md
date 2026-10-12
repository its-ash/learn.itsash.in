# 19 — Smart Pointers

A **smart pointer** is a struct that acts like a reference (`Deref`) and cleans up after itself (`Drop`).

| Type | What it gives you |
|---|---|
| `Box<T>` | one owner, value on the heap |
| `Rc<T>` | many owners, **single thread**, read-only |
| `Arc<T>` | many owners, **thread-safe**, read-only |
| `Cell<T>` / `RefCell<T>` | change data behind a `&` (single thread) |
| `Mutex<T>` / `RwLock<T>` | change data behind a `&` (thread-safe, chapter 22) |
| `Weak<T>` | a non-owning link to an `Rc`/`Arc` value |

## `Box<T>`

::code-wrapper{language="rust"}
```rust
fn main() {
    let b = Box::new(5);
    println!("{}", *b + 1);     // 6 — `*` reaches the value
    println!("{}", std::mem::size_of::<Box<[u8; 1000]>>());   // 8 — only the pointer is on the stack
}
```
::

Use `Box` for:

- recursive types (chapter 12: `enum List { Cons(i32, Box<List>), Nil }`)
- trait objects: `Box<dyn Trait>`
- moving a large value cheaply (only the pointer is copied)

## `Rc<T>` — Shared Ownership

::code-wrapper{language="rust"}
```rust
use std::rc::Rc;

fn main() {
    let a = Rc::new(String::from("shared"));
    let b = Rc::clone(&a);                     // NOT a deep copy — just count + 1
    println!("{}", Rc::strong_count(&a));      // 2
    drop(b);
    println!("{}", Rc::strong_count(&a));      // 1
}                                              // count hits 0 → the String is freed
```
::

**Tricky**: `Rc` only gives shared (`&`) access:

::code-wrapper{language="rust"}
```rust
use std::rc::Rc;

fn main() {
    let r = Rc::new(vec![1]);
    // r.push(2);   // error[E0596]: cannot borrow data in an `Rc` as mutable
}
```
::

**Tricky**: `Rc` can't cross threads:

::code-wrapper{language="rust"}
```rust
use std::rc::Rc;

fn main() {
    let r = Rc::new(5);
    // std::thread::spawn(move || println!("{r}"));
    // error[E0277]: `Rc<i32>` cannot be sent between threads safely
    // → use std::sync::Arc instead
}
```
::

## `Cell` and `RefCell` — Interior Mutability

Sometimes you need to change data that you only have a `&` to.

::code-wrapper{language="rust"}
```rust
use std::cell::{Cell, RefCell};

fn main() {
    let c = Cell::new(1);          // for Copy values: get/set, no borrowing at all
    c.set(c.get() + 1);
    println!("{}", c.get());       // 2

    let r = RefCell::new(vec![1]); // for anything: borrow rules checked at RUN time
    r.borrow_mut().push(2);
    println!("{:?}", r.borrow());  // [1, 2]
}
```
::

`Rc<RefCell<T>>` = shared **and** mutable (single thread):

::code-wrapper{language="rust"}
```rust
use std::cell::RefCell;
use std::rc::Rc;

fn main() {
    let shared = Rc::new(RefCell::new(vec![1]));
    let other = Rc::clone(&shared);
    other.borrow_mut().push(2);
    println!("{:?}", shared.borrow());   // [1, 2] — both see the change
}
```
::

**Tricky**: `RefCell` breaks the borrow rules at **run time** with a panic instead of a compile error:

::code-wrapper{language="rust"}
```rust
use std::cell::RefCell;

fn main() {
    let cell = RefCell::new(vec![1, 2]);
    let reader = cell.borrow();           // a shared borrow is alive...
    // cell.borrow_mut().push(3);         // ...panic: RefCell already borrowed
    println!("{}", cell.try_borrow_mut().is_err());   // true — the non-panicking check
    drop(reader);

    let n = cell.borrow().len();          // the temporary borrow ends at the `;`
    cell.borrow_mut().push(n as i32);     // fine
    println!("{:?}", cell.borrow());      // [1, 2, 2]
}
```
::

Keep `borrow()`/`borrow_mut()` guards short — don't store them in variables longer than needed.

## `Weak<T>` — Breaking Cycles

**Tricky**: two `Rc`s pointing at each other never reach count 0 → memory leak (not a crash, not unsafe — just never freed). Use `Weak` for "back" links:

::code-wrapper{language="rust"}
```rust
use std::cell::RefCell;
use std::rc::{Rc, Weak};

struct Node {
    name: String,
    parent: RefCell<Weak<Node>>,        // child → parent: does NOT own
    children: RefCell<Vec<Rc<Node>>>,   // parent → child: owns
}

fn main() {
    let leaf = Rc::new(Node { name: "leaf".into(), parent: RefCell::new(Weak::new()), children: RefCell::new(vec![]) });
    let root = Rc::new(Node { name: "root".into(), parent: RefCell::new(Weak::new()), children: RefCell::new(vec![Rc::clone(&leaf)]) });
    *leaf.parent.borrow_mut() = Rc::downgrade(&root);

    let parent_name = leaf.parent.borrow().upgrade().map(|p| p.name.clone());
    println!("{parent_name:?}");                                     // Some("root")
    println!("{} {}", Rc::strong_count(&root), Rc::weak_count(&root)); // 1 1
}
```
::

`upgrade()` returns `None` once the value is gone:

::code-wrapper{language="rust"}
```rust
use std::rc::{Rc, Weak};

fn main() {
    let weak: Weak<String>;
    {
        let s = Rc::new(String::from("temp"));
        weak = Rc::downgrade(&s);
        println!("{:?}", weak.upgrade());   // Some("temp")
    }
    println!("{:?}", weak.upgrade());       // None — the String was freed
}
```
::

## 💡 Tips & Tricks

- **Idiom** — write `Rc::clone(&a)` rather than `a.clone()` so readers see it is cheap.
- **Idiom** — `Cell` for small `Copy` values (counters, flags); `RefCell` for everything else.
- **Safety** — `try_borrow_mut()` avoids the panic when you're not sure.
- **Idiom** — owners hold `Rc`, back-links hold `Weak`.
- **Threads** — swap `Rc` → `Arc` and `RefCell` → `Mutex` when going multi-threaded.

## ⚠️ Edge Cases & Gotchas

- **Rc** — read-only; wrap the inside in `RefCell` to mutate.
- **Rc** — not `Send`; the compiler stops you from using it across threads.
- **RefCell** — double `borrow_mut()` (or `borrow` + `borrow_mut`) panics at run time.
- **Cycles** — `Rc` cycles leak memory silently; use `Weak` for one direction.
- **Weak** — `upgrade()` can return `None` at any time; always handle it.
- **Clone** — `Rc::clone` copies the pointer, but `(*rc).clone()` deep-copies the value.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
use std::cell::RefCell;

struct Bank { balance: RefCell<i64> }

impl Bank {
    fn deposit(&self, amount: i64) {
        let current = self.balance.borrow();
        *self.balance.borrow_mut() = *current + amount;
    }
}

fn main() {
    let b = Bank { balance: RefCell::new(100) };
    b.deposit(50);
    println!("{}", b.balance.borrow());
}
```
::

<details>
<summary>Answer</summary>

Compiles, then panics: `RefCell already borrowed`. `current` keeps a shared borrow alive while `borrow_mut()` asks for exclusive access.

Fix — take one mutable borrow and do everything through it:

::code-wrapper{language="rust"}
```rust
fn deposit(&self, amount: i64) {
    *self.balance.borrow_mut() += amount;
}
```
::

</details>

## 🧠 Quick Quiz

::code-wrapper{language="rust"}
```rust
use std::rc::Rc;

fn main() {
    let a = Rc::new(1);
    let b = Rc::clone(&a);
    let c = Rc::new(*a);
    {
        let _d = Rc::clone(&b);
        println!("{}", Rc::strong_count(&a));
    }
    println!("{} {}", Rc::strong_count(&a), Rc::strong_count(&c));
}
```
::

<details>
<summary>Answer</summary>

`3` then `2 1`. `a`, `b` and `_d` share one allocation. `c` is a **new** `Rc` holding a copy of the number, with its own count.

</details>

## Summary

`Box` = single owner on the heap. `Rc`/`Arc` = many owners. `Cell`/`RefCell` = mutate behind `&`, with `RefCell` checking borrows at run time (and panicking on conflicts). Use `Weak` to avoid reference cycles.

Next: Modules & Crates.
