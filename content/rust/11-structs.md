# 11 — Structs

A **struct** groups related values under one name.

## Three Kinds of Struct

::code-wrapper{language="rust"}
```rust
struct User {               // named fields
    name: String,
    age: u32,
    active: bool,
}

struct Point(i32, i32);     // tuple struct — fields by position
struct Meters(f64);         // newtype — wraps one value in a distinct type
struct Marker;              // unit struct — no fields, takes 0 bytes

fn main() {
    let u = User { name: String::from("Ada"), age: 36, active: true };
    let p = Point(3, 4);
    let m = Meters(5.0);
    println!("{} {} {} {}", u.name, p.0, p.1, m.0);
}
```
::

**Field init shorthand** — when a variable has the same name as a field:

::code-wrapper{language="rust"}
```rust
struct User { name: String, age: u32 }

fn build(name: String, age: u32) -> User {
    User { name, age }      // same as User { name: name, age: age }
}

fn main() {
    let u = build("Ada".into(), 36);
    let u2 = User { age: 1, name: "Bob".into() };   // field order in the literal doesn't matter
    println!("{} {}", u.name, u2.age);
}
```
::

## Printing and Comparing Need Derives

**Tricky**: a fresh struct can't be printed or compared:

::code-wrapper{language="rust"}
```rust
struct P { x: i32 }

fn main() {
    let p = P { x: 1 };
    // println!("{:?}", p);       // error[E0277]: `P` doesn't implement `Debug`
    // p == P { x: 1 };           // error[E0369]: binary operation `==` cannot be applied to type `P`
}
```
::

::code-wrapper{language="rust"}
```rust
#[derive(Debug, Clone, PartialEq)]
struct P { x: i32 }

fn main() {
    let p = P { x: 1 };
    println!("{:?}", p);              // P { x: 1 }
    println!("{:#?}", p);             // pretty, multi-line
    println!("{}", p == P { x: 1 });  // true
    let q = p.clone();
    println!("{q:?}");
}
```
::

## Struct Update Syntax

::code-wrapper{language="rust"}
```rust
#[derive(Debug)]
struct User { name: String, age: u32, active: bool }

fn main() {
    let a = User { name: "Ada".into(), age: 36, active: true };
    let b = User { name: "Bob".into(), ..a };     // copy the REST from a
    println!("{a:?}");                            // fine — only Copy fields (age, active) were taken
    println!("{b:?}");
}
```
::

**Tricky**: if `..a` takes a non-Copy field, `a` is **partially moved**:

::code-wrapper{language="rust"}
```rust
#[derive(Debug)]
struct User { name: String, age: u32, active: bool }

fn main() {
    let a = User { name: "Ada".into(), age: 36, active: true };
    let b = User { age: 2, ..a };      // a.name (a String) MOVES into b
    println!("{}", a.age);             // still OK — age is Copy
    // println!("{a:?}");              // error[E0382]: borrow of partially moved value: `a`
    println!("{}", b.name);
}
```
::

## Methods

::code-wrapper{language="rust"}
```rust
#[derive(Debug)]
struct Rect { w: u32, h: u32 }

impl Rect {
    fn new(w: u32, h: u32) -> Self {          // associated function (no self) — called as Rect::new
        Self { w, h }
    }
    fn square(size: u32) -> Self {
        Self { w: size, h: size }
    }
    fn area(&self) -> u32 {                   // read only
        self.w * self.h
    }
    fn grow(&mut self, by: u32) {             // modifies
        self.w += by;
        self.h += by;
    }
    fn into_tuple(self) -> (u32, u32) {       // consumes the Rect
        (self.w, self.h)
    }
}

fn main() {
    let mut r = Rect::new(2, 3);
    println!("{}", r.area());     // 6
    r.grow(1);
    println!("{r:?}");            // Rect { w: 3, h: 4 }
    let t = r.into_tuple();
    // r.area();                  // error[E0382]: borrow of moved value: `r`
    println!("{t:?} {:?}", Rect::square(2));
}
```
::

**Tricky**: calling a `&mut self` method needs a `mut` binding:

::code-wrapper{language="rust"}
```rust
struct Counter { n: u32 }
impl Counter {
    fn inc(&mut self) { self.n += 1; }
}

fn main() {
    let c = Counter { n: 0 };
    // c.inc();      // error[E0596]: cannot borrow `c` as mutable, as it is not declared as mutable
    let mut c = c;   // re-bind as mutable
    c.inc();
    println!("{}", c.n);
}
```
::

`r.area()` is just sugar for `Rect::area(&r)`. Rust adds the `&`, `&mut` or `*` for you ("auto-ref").

## Newtypes Prevent Mix-Ups

::code-wrapper{language="rust"}
```rust
struct UserId(u64);
struct OrderId(u64);

fn cancel(user: UserId, order: OrderId) {
    println!("user {} cancels order {}", user.0, order.0);
}

fn main() {
    let u = UserId(7);
    let o = OrderId(42);
    // cancel(o, u);     // error[E0308]: mismatched types — caught at compile time
    cancel(u, o);
}
```
::

Same memory as a plain `u64`, but the compiler won't let you swap them.

## Memory Layout Surprise

**Tricky**: Rust may reorder fields to save space; C-style layout does not:

::code-wrapper{language="rust"}
```rust
struct A { a: u8, b: u64, c: u8 }

#[repr(C)]               // keep declaration order (needed for FFI)
struct B { a: u8, b: u64, c: u8 }

fn main() {
    println!("{}", std::mem::size_of::<A>());   // 16 — Rust packs a and c together
    println!("{}", std::mem::size_of::<B>());   // 24 — padding after a and after c
}
```
::

## Drop Order

**Tricky**: struct **fields** drop in declaration order, but **local variables** drop in reverse:

::code-wrapper{language="rust"}
```rust
struct Loud(&'static str);
impl Drop for Loud {
    fn drop(&mut self) { println!("drop {}", self.0); }
}
struct Pair { first: Loud, second: Loud }

fn main() {
    let _p = Pair { first: Loud("first"), second: Loud("second") };
    let _x = Loud("local1");
    let _y = Loud("local2");
}
// drop local2
// drop local1
// drop first     ← fields: top to bottom
// drop second
```
::

## 💡 Tips & Tricks

- **Debug** — `#[derive(Debug)]` on almost every struct; use `{:#?}` for nested data.
- **Idiom** — `Self` inside `impl` means "this type"; use it instead of repeating the name.
- **Idiom** — `#[derive(Default)]` + `..Default::default()` fills the fields you don't care about.
- **Idiom** — take `&self` by default; only use `&mut self` or `self` when you need to.
- **Safety** — don't derive `Debug` on structs holding passwords or tokens; write a manual impl that hides them.

## ⚠️ Edge Cases & Gotchas

- **Derives** — no `Debug`, `Clone`, `PartialEq` unless you derive them.
- **Update syntax** — `..old` moves non-Copy fields; `old` becomes partially moved.
- **Mutability** — the whole binding is `mut` or not; there is no per-field `mut`.
- **Layout** — never assume field order in memory unless the struct is `#[repr(C)]`.
- **Drop order** — fields drop top-to-bottom; locals drop bottom-to-top.
- **Consuming methods** — after `r.into_tuple()` (takes `self`), `r` is gone.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
#[derive(Debug, Clone)]
struct Config { host: String, port: u16 }

fn main() {
    let base = Config { host: "localhost".into(), port: 80 };
    let dev = Config { port: 8080, ..base };
    let prod = Config { port: 443, ..base };
    println!("{dev:?} {prod:?}");
}
```
::

<details>
<summary>Answer</summary>

`..base` in `dev` moves `base.host` (a `String`) out. The second `..base` needs `host` again:

::code-wrapper{language="bash"}
```bash
error[E0382]: use of partially moved value: `base`
```
::

Clone the base for each copy:

::code-wrapper{language="rust"}
```rust
let dev = Config { port: 8080, ..base.clone() };
let prod = Config { port: 443, ..base };
```
::

</details>

## 🧠 Quick Quiz

::code-wrapper{language="rust"}
```rust
struct W(u32);
impl W {
    fn bump(mut self) -> Self { self.0 += 1; self }
}

fn main() {
    let w = W(1);
    let w2 = w.bump().bump();
    println!("{}", w2.0);
}
```
::

<details>
<summary>Answer</summary>

`3`. `bump` takes `self` by value — `mut self` only makes the local copy mutable — and returns it, so calls can be chained. The original `w` is moved and can't be used afterwards.

</details>

## Summary

Structs group data; `impl` blocks add methods taking `&self`, `&mut self` or `self`. Derive `Debug`/`Clone`/`PartialEq` when you need them, watch `..old` partial moves, and use newtypes to make wrong arguments impossible.

Next: Enums.
