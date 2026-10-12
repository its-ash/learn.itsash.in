# 12 — Enums

An **enum** is a type whose value is exactly **one** of several variants. Each variant can carry its own data.

## Simple Enums

::code-wrapper{language="rust"}
```rust
#[derive(Debug, Clone, Copy, PartialEq)]
enum Direction { North, East, South, West }

fn turn_right(d: Direction) -> Direction {
    match d {
        Direction::North => Direction::East,
        Direction::East => Direction::South,
        Direction::South => Direction::West,
        Direction::West => Direction::North,
    }
}

fn main() {
    let d = turn_right(Direction::West);
    println!("{d:?}");                       // North
    println!("{}", d == Direction::North);   // true (needs PartialEq)
}
```
::

**Tricky**: without `#[derive(PartialEq)]` you can't even compare variants with `==`:

::code-wrapper{language="rust"}
```rust
enum D { A, B }

fn main() {
    let d = D::A;
    // if d == D::A {}                 // error[E0369]: binary operation `==` cannot be applied to type `D`
    if matches!(d, D::A) { println!("A"); }   // works without any derive
}
```
::

### Numbers behind variants

::code-wrapper{language="rust"}
```rust
enum Color { Red = 1, Green = 2, Blue = 4 }
enum Auto { A, B, C = 10, D }

fn main() {
    println!("{}", Color::Blue as i32);   // 4
    println!("{}", Auto::B as i32);       // 1  — counts from 0
    println!("{}", Auto::D as i32);       // 11 — continues after the explicit 10
}
```
::

The reverse (`4 as Color`) is not allowed — not every number is a valid variant. Write a `match` or `TryFrom` for that.

## Variants With Data

::code-wrapper{language="rust"}
```rust
#[derive(Debug)]
enum Shape {
    Circle { r: f64 },          // named fields
    Rect { w: f64, h: f64 },
    Triangle(f64, f64, f64),    // tuple-style
    Point,                      // no data
}

impl Shape {
    fn area(&self) -> f64 {
        match self {
            Shape::Circle { r } => 3.14 * r * r,
            Shape::Rect { w, h } => w * h,
            Shape::Triangle(a, b, c) => {
                let s = (a + b + c) / 2.0;
                (s * (s - a) * (s - b) * (s - c)).sqrt()
            }
            Shape::Point => 0.0,
        }
    }
}

fn main() {
    let shapes = vec![
        Shape::Circle { r: 1.0 },
        Shape::Rect { w: 2.0, h: 3.0 },
        Shape::Triangle(3.0, 4.0, 5.0),
        Shape::Point,
    ];
    for s in &shapes {
        println!("{s:?} → {}", s.area());
    }
}
```
::

**Tricky**: a variant is **not** a type. You can't take "just a Circle" as a parameter:

::code-wrapper{language="rust"}
```rust
enum Shape { Circle(f64), Square(f64) }

// fn circle_area(s: Shape::Circle) {}   // error[E0573]: expected type, found variant `Shape::Circle`

struct Circle(f64);                      // make it its own struct...
enum Shape2 { Circle(Circle), Square(f64) }   // ...and wrap it
fn circle_area(c: &Circle) -> f64 { 3.14 * c.0 * c.0 }
```
::

## Make Invalid States Impossible

::code-wrapper{language="rust"}
```rust
// Weak: nothing stops `card` AND `wallet` both being Some, or both None
struct PaymentLoose {
    card: Option<String>,
    wallet: Option<String>,
}

// Strong: exactly one, always
enum Payment {
    Card(String),
    Wallet(String),
}

fn describe(p: &Payment) -> String {
    match p {
        Payment::Card(n) => format!("card ending {}", &n[n.len() - 4..]),
        Payment::Wallet(id) => format!("wallet {id}"),
    }
}

fn main() {
    println!("{}", describe(&Payment::Card("4111111111111111".into())));
}
```
::

## `Option` and `Result` Are Just Enums

::code-wrapper{language="rust"}
```rust
// enum Option<T> { None, Some(T) }
// enum Result<T, E> { Ok(T), Err(E) }

fn divide(a: i32, b: i32) -> Option<i32> {
    if b == 0 { None } else { Some(a / b) }
}

fn main() {
    println!("{:?}", divide(10, 2));               // Some(5)
    println!("{:?}", divide(1, 0));                // None
    println!("{}", divide(1, 0).unwrap_or(-1));    // -1
    println!("{:?}", divide(9, 3).map(|n| n * 10)); // Some(30)

    let r: Result<i32, String> = "42".parse::<i32>().map_err(|e| e.to_string());
    println!("{r:?}");                             // Ok(42)
}
```
::

There is no `null` in Rust. If a value may be missing, its type says so (`Option<T>`), and the compiler forces you to handle `None`.

## Recursive Enums Need a Box

::code-wrapper{language="rust"}
```rust
// enum List { Nil, Cons(i32, List) }
// error[E0072]: recursive type `List` has infinite size
// help: insert some indirection (e.g., a `Box`, `Rc`, or `&`) to break the cycle

#[derive(Debug)]
enum List {
    Nil,
    Cons(i32, Box<List>),
}

fn sum(list: &List) -> i32 {
    match list {
        List::Nil => 0,
        List::Cons(v, rest) => v + sum(rest),
    }
}

fn main() {
    let l = List::Cons(1, Box::new(List::Cons(2, Box::new(List::Nil))));
    println!("{}", sum(&l));   // 3
}
```
::

## Size of an Enum

**Tricky**: an enum is as big as its **biggest** variant (plus a tag):

::code-wrapper{language="rust"}
```rust
enum Big { Small(u8), Huge([u8; 1000]) }

fn main() {
    println!("{}", std::mem::size_of::<Big>());   // 1001 — even a `Small` uses 1001 bytes
}
```
::

Box the big variant (`Huge(Box<[u8; 1000]>)`) if most values are small.

**Tricky**: `Option` is sometimes free:

::code-wrapper{language="rust"}
```rust
fn main() {
    use std::mem::size_of;
    println!("{}", size_of::<Option<&i32>>());     // 8  — same as &i32: None uses the null pointer
    println!("{}", size_of::<Option<Box<i32>>>()); // 8
    println!("{}", size_of::<Option<bool>>());     // 1  — bool only uses 2 of 256 byte values
    println!("{}", size_of::<Option<f64>>());      // 16 — every f64 bit pattern is valid, so a tag is added
}
```
::

## 💡 Tips & Tricks

- **Idiom** — model "one of these" with an enum, not several `Option` fields or a `kind: u8`.
- **Idiom** — avoid `_ =>` in matches over your own enums, so adding a variant makes the compiler list every place to update.
- **Idiom** — `matches!(value, Pattern)` for a quick `bool` check.
- **Performance** — `Box` a variant that is much larger than the others.
- **Debug** — `#[derive(Debug)]` prints variant names and their data.

## ⚠️ Edge Cases & Gotchas

- **Comparison** — `==` on an enum needs `#[derive(PartialEq)]`.
- **Variants** — `Shape::Circle` is not a type; you can't use it in a function signature.
- **Casts** — `Variant as i32` works only for data-less enums; `i32 as Enum` never works.
- **Recursion** — a variant that contains its own enum directly is an infinite-size error; use `Box`.
- **Size** — every value takes the size of the largest variant.
- **Discriminants** — after an explicit `= 10`, the next variant is `11`, not `2`.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
#[derive(Debug)]
enum Status { Active, Suspended, Deleted }

fn can_login(s: &Status) -> bool {
    match s {
        Status::Active => true,
        _ => false,
    }
}
```
::

Months later someone adds `Status::PendingVerification`. What goes wrong?

<details>
<summary>Answer</summary>

Nothing fails to compile — the `_` arm silently treats the new status as "can't log in". That might be right, or it might lock out every new user. The compiler had no chance to ask.

List every variant instead:

::code-wrapper{language="rust"}
```rust
fn can_login(s: &Status) -> bool {
    match s {
        Status::Active => true,
        Status::Suspended | Status::Deleted => false,
    }
}
```
::

Now adding a variant gives `error[E0004]: non-exhaustive patterns` right here, forcing a decision.

</details>

## 🧠 Quick Quiz

::code-wrapper{language="rust"}
```rust
enum E { A = 3, B, C = 1, D }

fn main() {
    println!("{} {} {}", E::B as u8, E::D as u8, std::mem::size_of::<Option<Option<bool>>>());
}
```
::

<details>
<summary>Answer</summary>

`4 2 1` — `B` follows `A = 3`, `D` follows `C = 1`. Nested `Option<Option<bool>>` still fits in 1 byte because `bool` leaves 254 unused byte values for the tags.

</details>

## Summary

Enums hold exactly one variant at a time, each with its own data. `match` must handle every variant, which makes enums the best way to model "one of these" states. `Option` and `Result` are ordinary enums.

Next: Pattern Matching.
