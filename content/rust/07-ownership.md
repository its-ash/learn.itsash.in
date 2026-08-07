# 07 — Ownership (The Heart of Rust)

Ownership is **the** defining feature of Rust. Every other memory-safety guarantee flows from these rules.

## The Three Rules

1. Each value has exactly one **owner** (a variable).
2. When the owner goes out of scope, the value is **dropped** (its destructor runs).
3. Assigning or passing a value **moves** it (for non-`Copy` types) — the old binding becomes invalid.

## Stack vs Heap

- Stack: fast, LIFO, fixed-size values (integers, `bool`, fixed arrays, pointers).
- Heap: dynamic, slower, runtime-allocated (`Box`, `Vec`, `String`). Ownership primarily concerns heap data.

::code-wrapper{language="rust" filename="main.rs"}
```rust
let s1 = String::from("hi");   // heap allocation
let s2 = s1;                    // MOVE — s1 is now invalid
// println!("{s1}");            // ERROR: borrow of moved value
```
::

`String` is `{ ptr, len, capacity }` (stack) pointing to heap bytes. A move copies the stack header and **invalidates the old binding** so you can't have two owners trying to free the same heap memory.

## The `Copy` Trait

Types whose bits can be trivially copied without invalidating the source are `Copy`:

- All integer/float/bool/char types.
- Tuples/arrays of `Copy` types.
- `&T` (shared references are `Copy`).
- Function pointers `fn(...)`.

Non-`Copy` types (heap-ish): `String`, `Vec`, `Box`, `HashMap`, any type with a destructor or that owns a resource.

::code-wrapper{language="rust"}
```rust
let a = 5;
let b = a;            // i32 is Copy — a is still valid
println!("{a} {b}");  // fine
```
::

## Move Semantics in Functions

::code-wrapper{language="rust"}
```rust
fn take(s: String) { println!("{s}"); }

let s = String::from("hi");
take(s);
// s is now invalid — moved into the function
```
::

To keep ownership, pass by reference or `clone()`:

::code-wrapper{language="rust"}
```rust
take(s.clone());      // s still owned here
take(&s);             // pass reference (covered in References chapter)
```
::

## Returning Ownership

::code-wrapper{language="rust"}
```rust
fn make() -> String { String::from("hi") }
let s = make();       // ownership moves to caller
```
::

Returning transfers ownership out without a copy. This is the Rust idiom for "constructing" data.

## Drop Order

Destructors run in **reverse declaration order** within a scope:

::code-wrapper{language="rust"}
```rust
{
    let a = String::from("a");
    let b = String::from("b");
    // b drops, then a drops
}
```
::

`Drop` trait's `drop(&mut self)` is the destructor. You usually don't call it manually — use `std::mem::drop(value)` to drop early.

## `Drop` and `Copy` are Mutually Exclusive

A type with a custom `Drop` cannot be `Copy` (you can't derive both). `Copy` means "duplicate bits"; `Drop` means "do something on cleanup" — duplicating would risk double-cleanup.

## Partial Moves

::code-wrapper{language="rust"}
```rust
struct Person { name: String, age: u32 }
let p = Person { name: "Ada".into(), age: 36 };
let n = p.name;       // partial move — p.name is moved, p.age still valid
// println!("{}", p); // ERROR: p partially moved
println!("{}", p.age); // OK — only name was moved
```
::

You can still access non-moved fields after a partial move.

## Move Footguns

- **Closure captures**: `|| use_s(s)` moves `s` into the closure if `s` is consumed inside.
- **`Vec`/`String` in `match` arms**: moving a value out in one arm invalidates it in others; the compiler ensures all paths move or none do.
- **Field reorder / re-init**: after a partial move, you can reassign the moved field (`p.name = "Bob".into();`) to make `p` whole again.
- **`mut` binding of a moved value**: `let mut s = String::new(); let t = s; s = String::from("x");` — re-binding is fine; `s` was invalid between the move and reassignment.

## `drop` Order in Structs

Struct fields drop in **declaration order** (NOT reverse), per RFC 1857. This is a common surprise:

::code-wrapper{language="rust"}
```rust
struct A { /* ... */ }
impl Drop for A { fn drop(&mut self) { println!("A dropped"); } }

struct Pair { first: A, second: A }
// when a Pair is dropped: first drops, then second
```
::

Tuple fields drop in order 0, 1, 2, ...

## `ManuallyDrop` and `MaybeUninit`

For unsafe manual memory management, use `std::mem::ManuallyDrop` to prevent auto-drop, or `std::mem::MaybeUninit` for uninitialized memory. These are advanced; covered in the Unsafe chapter.

## Why Ownership Is Unique

Languages choose between:
- **GC** (Java, Go, Python): runtime cost, pause times.
- **Manual management** (C, C++): use-after-free, double-free, leaks.
- **Ownership** (Rust): compile-time rules, zero runtime cost, but you learn the borrow checker.

## Common Error: `cannot move out of ...`

::code-wrapper{language="rust"}
```rust
let v = vec![String::from("a"), String::from("b")];
let first = v[0];   // ERROR: cannot move out of index of Vec
```
::

Indexing returns a reference (`&String`); moving out would leave the `Vec` in an invalid state. Use `v.into_iter().next()` or `mem::take(&mut v[0])` or `v.remove(0)`.

## `mem::take` and `mem::replace`

::code-wrapper{language="rust"}
```rust
use std::mem;
let mut s = String::from("hi");
let taken = mem::take(&mut s);  // s becomes default (empty String), taken gets "hi"
let prev = mem::replace(&mut s, "bye".into());  // s = "bye", prev = ""
```
::

These let you extract values from behind a mutable reference without invalidating the container.

## Ownership Tricks & Patterns

::code-wrapper{language="rust"}
```rust
// Trick: use mem::replace for state swaps without drop
let mut state = State::Init;
state = mem::replace(&mut state, State::Done); // old state is extracted

// Trick: into() for cheap ownership transfers
fn take_owned(v: Vec<i32>) { }
let v = vec![1, 2, 3];
take_owned(v.into()); // or just take_owned(v)

// Trick: std::mem::take for default swap
let mut s = String::from("hello");
let taken = mem::take(&mut s); // s is now empty String
assert_eq!(s, "");
assert_eq!(taken, "hello");

// Trick: move out of collections
let mut v = vec![String::from("a"), String::from("b")];
let first = v.remove(0); // moves ownership
let first = v.into_iter().next(); // consumes vec, yields Option

// Trick: into_iter() for consuming ownership
for s in vec![String::from("a"), String::from("b")].into_iter() {
    println!("{}", s); // s is owned by loop, dropped after each iteration
}

// Trick: use Rc for multiple readers
use std::rc::Rc;
let data = Rc::new(String::from("shared"));
let r1 = Rc::clone(&data);
let r2 = Rc::clone(&data);
// data is accessible from r1, r2, and the original

// Trick: Box for move-only cleanup
let b = Box::new(String::from("owned"));
let owned = *b; // unbox (moves String out)
```
::

## Summary

- Each value has one owner; scope-end drops it.
- Non-`Copy` types move on assignment/pass; `Copy` types duplicate.
- `Drop` is a destructor; can't be combined with `Copy`.
- Partial moves, `mem::take`, `mem::replace` let you surgically move things around.
- Use `Rc` for shared read-only ownership; use channels for moving data between threads.
- Understand the difference between moving and borrowing — most APIs should borrow.

Next: References and Borrowing — *using* a value without owning it.