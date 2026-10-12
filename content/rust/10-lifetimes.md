# 10 — Lifetimes

A **lifetime** is the stretch of code where a reference is valid. The compiler checks that no reference outlives the data it points to. Lifetimes are compile-time only — they cost nothing at run time.

## The Problem Lifetimes Solve

::code-wrapper{language="rust"}
```rust
fn main() {
    let r;
    {
        let x = 5;
        r = &x;
    }                   // x is dropped here
    // println!("{r}"); // error[E0597]: `x` does not live long enough
}
```
::

`r` would point at memory that no longer exists. In C this compiles; in Rust it doesn't.

## When You Must Write Lifetimes

Most of the time the compiler figures them out ("elision"). You must write them when a function returns a reference and the compiler can't tell **which input** it comes from:

::code-wrapper{language="rust"}
```rust
// fn longest(x: &str, y: &str) -> &str { ... }
// error[E0106]: missing lifetime specifier
// help: the signature does not say whether it is borrowed from `x` or `y`

fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}

fn main() {
    let a = String::from("apple");
    let b = String::from("fig");
    println!("{}", longest(&a, &b));   // apple
}
```
::

Read `'a` as: "the result is valid as long as **both** inputs are valid".

### The elision rules (when you can skip writing them)

| Signature | What the compiler assumes |
|---|---|
| `fn f(x: &str) -> &str` | output borrows from `x` (only one input) |
| `fn f(&self, x: &str) -> &str` | output borrows from `self` |
| `fn f(x: &str, y: &str) -> &str` | **can't decide** → you must annotate |
| `fn f() -> &str` | **can't decide** → usually you want `&'static str` or an owned `String` |

## Lifetimes Describe, They Don't Extend

**Tricky**: `'a` is chosen as the **shorter** of the two inputs — even if the function always returns the longer-lived one:

::code-wrapper{language="rust"}
```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}

fn main() {
    let s1 = String::from("long string");
    let result;
    {
        let s2 = String::from("short");
        result = longest(&s1, &s2);    // returns s1 at run time...
    }
    // println!("{result}");           // ...but error[E0597]: `s2` does not live long enough
}
```
::

The compiler checks the **signature**, not what happens at run time. If the result only ever comes from `x`, say so:

::code-wrapper{language="rust"}
```rust
fn first<'a>(x: &'a str, _y: &str) -> &'a str {   // y gets its own, unrelated lifetime
    x
}

fn main() {
    let a = String::from("long");
    let res;
    {
        let b = String::from("b");
        res = first(&a, &b);
    }
    println!("{res}");   // long — compiles now
}
```
::

## Structs That Hold References

::code-wrapper{language="rust"}
```rust
// struct Excerpt { part: &str }   // error[E0106]: missing lifetime specifier

struct Excerpt<'a> {
    part: &'a str,     // an Excerpt cannot outlive the text it points into
}

impl<'a> Excerpt<'a> {
    fn part(&self) -> &str {        // elided: tied to self
        self.part
    }
}

fn main() {
    let novel = String::from("Call me Ishmael. Some years ago...");
    let first = novel.split('.').next().unwrap();
    let e = Excerpt { part: first };
    println!("{}", e.part());       // Call me Ishmael
}
```
::

**Tricky**: the struct really is stuck to its source:

::code-wrapper{language="rust"}
```rust
struct Excerpt<'a> { part: &'a str }

fn main() {
    let e;
    {
        let s = String::from("x");
        e = Excerpt { part: &s };
    }
    // println!("{}", e.part);   // error[E0597]: `s` does not live long enough
}
```
::

Often the simplest fix is to **own** the data: `struct Excerpt { part: String }`. One small allocation, no lifetime parameter, no restrictions.

## `'static`

`'static` means "valid for the whole program". String literals are `&'static str`:

::code-wrapper{language="rust"}
```rust
fn greeting() -> &'static str {
    "hi"            // stored in the binary — never freed
}

fn main() {
    println!("{}", greeting());
}
```
::

**Tricky**: the bound `T: 'static` does **not** mean "lives forever". It means "contains no short-lived borrows". Owned values qualify:

::code-wrapper{language="rust"}
```rust
fn needs_static<T: 'static + std::fmt::Debug>(t: T) {
    println!("{t:?}");
}

fn main() {
    needs_static(String::from("owned"));   // OK — a String borrows nothing
    needs_static(5);                       // OK
    needs_static("literal");               // OK — &'static str

    let s = String::from("local");
    // needs_static(&s);                   // error[E0597]: `s` does not live long enough
}
```
::

This is why `std::thread::spawn` wants owned data moved into the closure (`move ||`) — a thread may outlive the function that started it.

## 💡 Tips & Tricks

- **Idiom** — if a lifetime error fights you, try returning an owned value (`String`, `Vec<T>`) first. Borrowing is an optimization.
- **Idiom** — give each input its own lifetime unless the output really can come from several of them.
- **Debug** — write the elided lifetimes out by hand (`fn f<'a>(x: &'a str) -> &'a str`) to see what the compiler assumed.
- **Idiom** — `'_` means "the obvious lifetime here": `impl Excerpt<'_> { ... }`.
- **Warning sign** — when the compiler suggests adding `'static`, it is usually telling you to own the data instead.

## ⚠️ Edge Cases & Gotchas

- **Shared `'a`** — ties the result to the **shortest** input, regardless of which one is returned.
- **No inputs** — `fn f() -> &str` can only return `&'static str` (or should return `String`).
- **Structs** — a struct with a `&'a` field can never outlive that borrow; this spreads to every struct that contains it.
- **`T: 'static`** — `String` satisfies it; `&local_string` does not.
- **`Box<dyn Trait>`** — means `Box<dyn Trait + 'static>` by default; holding a borrow needs `Box<dyn Trait + 'a>`.
- **Run time** — lifetimes never change when memory is freed; they only check that your code is correct.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
struct Config<'a> {
    name: &'a str,
}

fn load() -> Config<'static> {
    let text = std::fs::read_to_string("app.conf").unwrap_or_default();
    Config { name: text.trim() }
}
```
::

<details>
<summary>Answer</summary>

`text` is a local `String`, freed when `load` returns. `text.trim()` borrows from it, so `Config` would point at freed memory:

::code-wrapper{language="bash"}
```bash
error[E0515]: cannot return value referencing local variable `text`
```
::

Writing `'static` didn't make the data live longer — it only made the promise impossible to keep. Own the data:

::code-wrapper{language="rust"}
```rust
struct Config {
    name: String,
}

fn load() -> Config {
    let text = std::fs::read_to_string("app.conf").unwrap_or_default();
    Config { name: text.trim().to_string() }
}
```
::

</details>

## 🧠 Quick Quiz

Does this compile?

::code-wrapper{language="rust"}
```rust
fn pick<'a>(x: &'a str, y: &'a str) -> &'a str { x }

fn main() {
    let a = "static literal";
    let r;
    {
        let b = String::from("temp");
        r = pick(a, &b);
    }
    println!("{r}");
}
```
::

<details>
<summary>Answer</summary>

**No** — `error[E0597]: b does not live long enough`. `a` is `'static`, but the shared `'a` shrinks to `b`'s scope. The body returning `x` doesn't matter; only the signature does.

</details>

## Summary

Lifetimes are labels that let the compiler prove references never outlive their data. Write them when a function returns a reference from several inputs, or when a struct stores a reference. When in doubt, own the data.

Next: Structs.
