# 17 — Closures

A **closure** is an anonymous function that can use variables from the place where it was created.

## Syntax

::code-wrapper{language="rust"}
```rust
fn main() {
    let add = |a: i32, b: i32| -> i32 { a + b };   // fully written out
    let add2 = |a, b| a + b;                         // types inferred
    let hello = || println!("hello");                // no arguments
    println!("{} {}", add(1, 2), add2(3, 4));
    hello();

    let factor = 3;
    let scale = |x| x * factor;                      // captures `factor`
    println!("{}", scale(5));                        // 15
}
```
::

**Tricky**: inferred types are fixed by the **first** call:

::code-wrapper{language="rust"}
```rust
fn main() {
    let id = |x| x;
    id(5);         // now id is i32 -> i32
    // id("a");    // error[E0308]: mismatched types — expected integer, found `&str`
}
```
::

A closure is not generic. If you need "any type", write a generic `fn`.

## How Closures Capture

The compiler picks the **least** it needs:

| The closure body… | Captures by | Trait |
|---|---|---|
| only reads | `&T` | `Fn` |
| modifies | `&mut T` | `FnMut` |
| moves the value out | value | `FnOnce` |

::code-wrapper{language="rust"}
```rust
fn main() {
    let name = String::from("Ada");
    let greet = || println!("hi {name}");   // borrows name
    greet();
    greet();
    println!("{name}");                     // still usable

    let mut count = 0;
    let mut inc = || count += 1;            // mutably borrows count — note `let mut inc`
    inc();
    inc();
    println!("{count}");                    // 2
}
```
::

**Tricky**: a closure that modifies something must itself be `mut`:

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut n = 0;
    let inc = || n += 1;
    // inc();      // error[E0596]: cannot borrow `inc` as mutable, as it is not declared as mutable
}
```
::

**Tricky**: while a closure holds a borrow, you can't use the variable in conflicting ways:

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![1];
    let mut push = || v.push(2);
    // println!("{v:?}");   // error[E0502]: cannot borrow `v` as immutable because it is also borrowed as mutable
    push();
    println!("{v:?}");      // [1, 2] — fine after the closure's last use
}
```
::

### `FnOnce` — callable once

::code-wrapper{language="rust"}
```rust
fn main() {
    let s = String::from("x");
    let take = move || s;      // returns s → moves it out of the closure
    let got = take();
    // take();                 // error[E0382]: use of moved value: `take`
    println!("{got}");
}
```
::

## `move` Closures

`move` makes the closure take ownership of what it uses:

::code-wrapper{language="rust"}
```rust
fn main() {
    let data = vec![1, 2, 3];
    let handle = std::thread::spawn(move || data.len());   // the thread needs to OWN data
    println!("{}", handle.join().unwrap());                 // 3
    // println!("{data:?}");                                // error: data was moved
}
```
::

**Tricky**: `move` with a `Copy` value **copies** it — changes inside the closure don't reach the outside:

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut x = 10;
    let mut add = move || { x += 1; x };   // the closure has its OWN x
    println!("{} {}", add(), add());       // 11 12
    println!("{x}");                       // 10 — the outer x never changed
}
```
::

## Returning Closures

::code-wrapper{language="rust"}
```rust
fn make_adder(n: i32) -> impl Fn(i32) -> i32 {
    move |x| x + n       // `move` is required: n is a local that is about to disappear
}

fn main() {
    let add5 = make_adder(5);
    println!("{}", add5(1));   // 6
}
```
::

Without `move`:

::code-wrapper{language="rust"}
```rust
// fn mk() -> impl Fn() -> usize {
//     let s = String::from("hi");
//     || s.len()
// }
// error[E0373]: closure may outlive the current function, but it borrows `s`
// help: to force the closure to take ownership of `s`, use the `move` keyword
```
::

## Taking Closures as Arguments

::code-wrapper{language="rust"}
```rust
fn apply<F: Fn(i32) -> i32>(f: F, v: i32) -> i32 { f(v) }
fn call_twice<F: FnMut()>(mut f: F) { f(); f(); }

fn main() {
    println!("{}", apply(|x| x * 2, 21));    // 42

    let mut total = 0;
    call_twice(|| total += 5);
    println!("{total}");                     // 10

    // Different closures have different types → box them to store together
    let ops: Vec<Box<dyn Fn(i32) -> i32>> = vec![Box::new(|x| x + 1), Box::new(|x| x * 10)];
    let results: Vec<i32> = ops.iter().map(|f| f(3)).collect();
    println!("{results:?}");                 // [4, 30]
}
```
::

Accept the **most general** trait you can: `FnOnce` accepts every closure, `FnMut` accepts `Fn` and `FnMut`, `Fn` only accepts read-only closures.

## Closures Capture Fields, Not Whole Structs

Since edition 2021 a closure captures only the fields it uses:

::code-wrapper{language="rust"}
```rust
struct User { name: String, email: String }

fn main() {
    let u = User { name: "a".into(), email: "b".into() };
    let show = || println!("{}", u.name);   // captures only u.name
    let email = u.email;                    // moving another field is fine
    show();
    println!("{email}");
}
```
::

## Everyday Uses

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut words = vec!["banana", "Apple", "cherry"];
    words.sort_by_key(|w| w.to_lowercase());
    println!("{words:?}");                       // ["Apple", "banana", "cherry"]

    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    println!("{port}");

    let expensive = || { println!("computing"); 42 };
    let v: Option<i32> = Some(1);
    println!("{}", v.unwrap_or_else(expensive)); // closure NOT called — v is Some
}
```
::

## 💡 Tips & Tricks

- **Performance** — `unwrap_or_else(|| ...)` runs the closure only when needed; `unwrap_or(expensive())` always runs it.
- **Idiom** — accept `impl Fn(T) -> U` for simple callbacks.
- **Idiom** — `move` for threads, async tasks and returned closures.
- **Idiom** — pass a function name directly when it fits: `.map(str::trim)`, `.map(i32::abs)`.
- **Debug** — "closure may outlive the current function" → add `move`.

## ⚠️ Edge Cases & Gotchas

- **Inference** — a closure's parameter types are fixed after the first call.
- **Mut** — a closure that modifies captured state needs `let mut`.
- **Copy + move** — a `move` closure copies `Copy` values; outside changes and inside changes don't sync.
- **FnOnce** — a closure that moves a captured value out can be called only once.
- **Types** — every closure has its own unique type; store mixed closures as `Box<dyn Fn...>`.
- **Borrows** — a captured `&mut` blocks other uses of the variable until the closure's last use.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut handlers: Vec<Box<dyn Fn()>> = Vec::new();
    for i in 0..3 {
        let label = format!("button {i}");
        handlers.push(Box::new(|| println!("{label}")));
    }
    for h in &handlers { h(); }
}
```
::

<details>
<summary>Answer</summary>

`error[E0597]: label does not live long enough` (the boxed closure borrows `label`, which is dropped at the end of each loop pass). `Box<dyn Fn()>` means `'static`, so it can't hold a borrow.

Move the label into each closure:

::code-wrapper{language="rust"}
```rust
handlers.push(Box::new(move || println!("{label}")));
```
::

Prints `button 0`, `button 1`, `button 2`. (Unlike some languages, there is no "all print the last value" trap — each closure owns its own `label`.)

</details>

## 🧠 Quick Quiz

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut n = 1;
    {
        let mut double = || n *= 2;
        double();
        double();
    }
    let mut copy = move || { n += 100; n };
    println!("{} {}", copy(), n);
}
```
::

<details>
<summary>Answer</summary>

`104 4` — `double` borrows `n` mutably, making it 4. `copy` is `move` over an `i32`, so it gets its own copy (4 → 104); the outer `n` stays 4.

</details>

## Summary

Closures capture by reference, mutable reference or value — whichever the body needs — and implement `Fn`, `FnMut` or `FnOnce` accordingly. Use `move` when the closure must outlive the current scope.

Next: Error Handling.
