# 07 — Ownership

Ownership is how Rust frees memory without a garbage collector. Three rules:

1. Every value has exactly **one owner**.
2. When the owner goes out of scope, the value is **dropped** (freed).
3. Ownership can be **moved** to another variable or function.

## Move vs Copy

::code-wrapper{language="rust"}
```rust
fn main() {
    let a = 5;
    let b = a;              // i32 is Copy → a is copied
    println!("{a} {b}");    // 5 5

    let s1 = String::from("hi");
    let s2 = s1;            // String is NOT Copy → ownership MOVES to s2
    // println!("{s1}");    // error[E0382]: borrow of moved value: `s1`
    println!("{s2}");
}
```
::

**Why**: a `String` is a small header (pointer, length, capacity) pointing at heap memory. If both `s1` and `s2` owned it, both would free it at the end — a double free. Moving makes `s1` unusable instead.

**Copy types**: integers, floats, `bool`, `char`, shared references `&T`, and tuples/arrays made only of Copy types.

::code-wrapper{language="rust"}
```rust
fn main() {
    let t = (1, 2.0, 'c');
    let u = t;                     // all parts are Copy → the tuple is Copy
    println!("{t:?} {u:?}");

    let s = String::from("hi");
    let r = &s;
    let r2 = r;                    // &String is Copy — copying a reference, not the String
    println!("{r} {r2}");
}
```
::

**Tricky**: your own structs are **not** Copy, even if every field is:

::code-wrapper{language="rust"}
```rust
struct Point { x: i32 }

fn main() {
    let a = Point { x: 1 };
    let b = a;                  // moved
    // println!("{}", a.x);     // error[E0382]: borrow of moved value: `a`
}
```
::

Add `#[derive(Clone, Copy)]` to opt in (only possible when all fields are Copy).

## Moving Into Functions

::code-wrapper{language="rust"}
```rust
fn take(s: String) -> usize {
    s.len()
}                               // s is dropped here

fn take_and_give_back(s: String) -> String {
    s                           // ownership returned to the caller
}

fn main() {
    let s = String::from("hello");
    let s = take_and_give_back(s);   // moved out, then back in
    println!("{}", take(s));         // 5
    // println!("{s}");              // error — moved into take()
}
```
::

**Tricky**: moving inside a loop fails on the **second** pass:

::code-wrapper{language="rust"}
```rust
fn take(_s: String) {}

fn main() {
    let s = String::from("x");
    for _ in 0..2 {
        // take(s);   // error[E0382]: use of moved value: `s`
        //            // note: value moved here, in previous iteration of loop
        take(s.clone());   // fine — each pass gets its own copy
    }
}
```
::

Usually the better fix is to borrow: `fn take(s: &str)` — see chapter 08.

## Clone — an Explicit, Real Copy

::code-wrapper{language="rust"}
```rust
fn main() {
    let a = vec![1, 2, 3];
    let mut b = a.clone();     // allocates new heap memory and copies the data
    b.push(4);
    println!("{a:?} {b:?}");   // [1, 2, 3] [1, 2, 3, 4]
}
```
::

A move copies only the small header (24 bytes for a `String` or `Vec`). A clone copies **all** the data. Don't add `.clone()` just to silence the compiler — usually a borrow is what you want.

## Moving Out of Collections and Options

**Tricky**: you cannot move a non-Copy item out of a `Vec` by indexing:

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![String::from("a"), String::from("b")];
    // let first = v[0];            // error[E0507]: cannot move out of index of `Vec<String>`
    let first_ref = &v[0];          // borrow it
    println!("{first_ref}");        // use the borrow BEFORE changing v (chapter 08)
    let first_copy = v[0].clone();  // copy it
    let first_owned = v.remove(0);  // take it out (shifts the rest)
    println!("{first_copy} {first_owned} {v:?}");   // a a ["b"]
}
```
::

**Tricky**: `if let Some(s) = opt` moves the inner value out:

::code-wrapper{language="rust"}
```rust
fn main() {
    let opt = Some(String::from("a"));
    if let Some(s) = &opt {          // borrow — opt still usable
        println!("{s}");
    }
    // if let Some(s) = opt { }      // moves the String out of opt
    // println!("{opt:?}");          // error[E0382]: borrow of partially moved value: `opt`
    println!("{opt:?}");
}
```
::

## Partial Moves

::code-wrapper{language="rust"}
```rust
struct Person { name: String, age: u32 }

fn main() {
    let p = Person { name: String::from("Ada"), age: 36 };
    let name = p.name;          // move ONE field out
    println!("{}", p.age);      // fine — age is untouched (and Copy)
    // println!("{}", p.name);  // error — that field was moved
    // let q = p;               // error — p as a whole is partially moved
    println!("{name}");
}
```
::

## Drop Order

::code-wrapper{language="rust"}
```rust
struct Noisy(&'static str);
impl Drop for Noisy {
    fn drop(&mut self) { println!("drop {}", self.0); }
}

fn main() {
    let _a = Noisy("a");
    let _b = Noisy("b");
    {
        let _c = Noisy("c");
    }                            // drop c — inner scope ends
    println!("end of main");
}                                // drop b, then drop a — REVERSE order of creation
```
::

You can drop early with `drop(value)`. You cannot call `value.drop()` directly (error E0040).

## 💡 Tips & Tricks

- **Idiom** — take `&str` / `&[T]` in function parameters unless the function needs to keep the value.
- **Idiom** — `std::mem::take(&mut field)` moves a value out and leaves `Default` (e.g. an empty `Vec`) behind, without cloning.
- **Lint** — `clippy::redundant_clone` finds clones you don't need.
- **Debug** — `std::mem::size_of::<String>()` is 24 no matter how long the string is — that is what a move copies.
- **Idiom** — `Vec::remove`, `Vec::swap_remove`, `Option::take` are the standard ways to move items out of containers.

## ⚠️ Edge Cases & Gotchas

- **Structs** — not Copy by default, even with only `i32` fields; `#[derive(Clone, Copy)]` is opt-in.
- **Loops** — moving a value inside a loop body errors with "moved in previous iteration of loop".
- **Indexing** — `v[0]` cannot move a `String` out; use `&v[0]`, `.clone()` or `.remove(0)`.
- **Patterns** — `if let Some(x) = opt` moves `x` out of `opt`; match on `&opt` to borrow.
- **Assignment** — assigning a new value to a variable **drops the old value immediately** (see below).
- **Panics** — with `panic = "abort"`, `Drop` code does not run on panic.

## 🧠 Spot the Bug

What does this print?

::code-wrapper{language="rust"}
```rust
struct Logger(&'static str);

impl Drop for Logger {
    fn drop(&mut self) {
        println!("drop {}", self.0);
    }
}

fn main() {
    let mut first = Logger("first");
    let second = Logger("second");
    first = second;
    println!("end");
}
```
::

<details>
<summary>Answer</summary>

::code-wrapper{language="bash"}
```bash
drop first
end
drop second
```
::

`first = second;` must get rid of the value `first` already owns, so `"first"` is dropped **right at the assignment**, not at the end of `main`. Then `second`'s value moves into `first`. At the end of scope only one `Logger` is left — the one named `"second"`.

**The lesson**: assigning over a variable runs the old value's `Drop` immediately.

</details>

## 🧠 Quick Quiz

Which lines fail to compile?

::code-wrapper{language="rust"}
```rust
fn main() {
    let a = [1, 2, 3];
    let b = a;
    println!("{a:?}");                // 1

    let v = vec![1, 2, 3];
    let w = v;
    println!("{v:?}");                // 2

    let s = "hello";
    let t = s;
    println!("{s}");                  // 3
}
```
::

<details>
<summary>Answer</summary>

Only **line 2**. `[i32; 3]` is Copy, and `"hello"` is a `&str` (a reference — Copy). A `Vec` is moved, so `v` cannot be used.

</details>

## Summary

Each value has one owner. Assignment and function calls **move** non-Copy values; Copy types (numbers, `bool`, `char`, `&T`) are duplicated. Use `.clone()` when you truly need two copies, and borrowing (next chapter) when you only need to look.

Next: References & Borrowing.
