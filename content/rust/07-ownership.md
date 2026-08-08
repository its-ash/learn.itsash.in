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

## 💡 Tips & Tricks

- **Debug**: `dbg!(&value)` prints the file, line, and a `Debug` dump of an expression *and* returns ownership of it, so you can splice it into a move chain: `let s = dbg!(String::from("hi"));` without disturbing the move.
- **Idiom**: prefer `std::mem::take`/`std::mem::replace` over `clone()` when you need to "empty out" a field during a state transition — it's O(1) and avoids an allocation.
- **Performance**: `Rc::clone(&rc)`/`Arc::clone(&arc)` never deep-copy; the call is a refcount bump. Writing `rc.clone()` compiles to the same thing but reads ambiguously — always use the explicit associated-function form in shared code.
- **Idiom**: `Box<T>` values move just like any other value — a move of a `Box` is a pointer-sized copy of the box header, not a deep copy of the heap data, which is why moving even a gigabyte-sized `Vec` is cheap.
- **Debug**: `std::mem::size_of::<T>()` is handy for confirming your intuition about move cost — `String` is 24 bytes on 64-bit regardless of how much heap data it owns.
- **Clippy**: `clippy::redundant_clone` flags `.clone()` calls whose result is never used mutably alongside the original — a common sign a borrow would have worked instead.

## ⚠️ Edge Cases & Gotchas

- **Moving into a loop condition**: `for s in vec_of_strings` consumes the `Vec` — `vec_of_strings` is gone after the loop. Use `&vec_of_strings` to iterate by reference and keep ownership.
- **`if`/`else` branches move differently**: `let x = if cond { a } else { b };` moves whichever branch runs; the compiler tracks this per-branch, so using `a` after the `if` (when `cond` was true) is still an error even though the `else` branch "didn't touch it."
- **Shadowing doesn't drop early**: `let s = String::from("a"); let s = String::from("b");` — the first `s` isn't dropped when shadowed; it drops at the *original* scope's end (after the second one, in reverse declaration order), which can surprise you when both hold expensive resources.
- **`Copy` closures silently duplicate, not move**: a closure that captures a `Copy` type by value takes a copy each call if it's `Fn`, so mutations inside the closure never propagate back to the caller — this is invisible without checking the captured type's `Copy`-ness.
- **Self-assignment through `mem::swap`**: `std::mem::swap(&mut a, &mut a)` is legal but a no-op — the borrow checker allows it because it's a single mutable borrow, not two, but it wastes a swap's worth of moves.
- **`Drop` order with early return**: if a function returns early (via `?` or an explicit `return`), locals still drop in reverse order at that return point — not at the end of the function's lexical block — which matters when destructors have side effects like releasing locks.
- **Platform quirk — `Drop` and `panic = "abort"`**: if you set `panic = "abort"` in `Cargo.toml`, a panic during unwinding never runs remaining `Drop` impls in the current call stack (there is no unwinding at all), so RAII guards relying on `Drop` for cleanup won't fire on panic.

## 🧠 Spot the Bug

What happens when this compiles and runs?

::code-wrapper{language="rust"}
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
::code-wrapper{language="rust"}
```rust
Logger dropped
about to end scope
Logger dropped
```
::

`first = second;` is an assignment to an existing binding that already owns a value. Rust doesn't just overwrite the pointer — because `Logger` implements `Drop`, assigning a new value into `first` first **drops the old value** `first` was holding (printing "Logger dropped" immediately), *then* moves `second`'s value into `first`. `second` is now invalid. At the end of the function, only the surviving `first` (originally `second`'s value) drops, printing "Logger dropped" a second time — for a total of two drops, matching the two `Logger` values ever created, but at very different times than a beginner would guess (who often expects both drops to happen only at scope end).

**The lesson**: assigning over a live binding with a `Drop` type runs the old value's destructor immediately, not at scope end.

</details>

## Summary

- Each value has one owner; scope-end drops it.
- Non-`Copy` types move on assignment/pass; `Copy` types duplicate.
- `Drop` is a destructor; can't be combined with `Copy`.
- Partial moves, `mem::take`, `mem::replace` let you surgically move things around.
- Use `Rc` for shared read-only ownership; use channels for moving data between threads.
- Understand the difference between moving and borrowing — most APIs should borrow.

Next: References and Borrowing — *using* a value without owning it.