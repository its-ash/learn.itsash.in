# 16 — Traits & Generics

A **trait** is a set of methods a type promises to have (like an interface). **Generics** let one function or struct work with many types. Together: "this works for any `T` that implements `Trait`".

## Defining and Implementing a Trait

::code-wrapper{language="rust"}
```rust
trait Animal {
    fn name(&self) -> String;                       // required
    fn speak(&self) -> String {                     // default — may be overridden
        format!("{} makes a sound", self.name())
    }
}

struct Dog;
struct Cat;

impl Animal for Dog {
    fn name(&self) -> String { "Dog".into() }
    fn speak(&self) -> String { "Woof".into() }     // override
}

impl Animal for Cat {
    fn name(&self) -> String { "Cat".into() }       // uses the default speak()
}

fn main() {
    println!("{}", Dog.speak());   // Woof
    println!("{}", Cat.speak());   // Cat makes a sound
}
```
::

## Implementing Standard Traits

::code-wrapper{language="rust"}
```rust
use std::fmt;

struct Celsius(f64);

impl fmt::Display for Celsius {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{:.1}°C", self.0)
    }
}

fn main() {
    let t = Celsius(21.456);
    println!("{t}");                  // 21.5°C
    let s: String = t.to_string();    // Display gives you to_string() for free
    println!("{s}");
}
```
::

Many traits can be derived instead: `#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Default)]`.

## Generic Functions Need Bounds

**Tricky**: a generic `T` can do **nothing** until you say what it supports:

::code-wrapper{language="rust"}
```rust
// fn largest<T>(v: &[T]) -> &T {
//     let mut m = &v[0];
//     for x in v { if x > m { m = x; } }   // error[E0369]: binary operation `>` cannot be applied to type `&T`
//     m                                     // help: consider restricting type parameter `T` with trait `PartialOrd`
// }

fn largest<T: PartialOrd>(v: &[T]) -> &T {
    let mut m = &v[0];
    for x in v {
        if x > m { m = x; }
    }
    m
}

fn main() {
    println!("{}", largest(&[3, 9, 2]));        // 9
    println!("{}", largest(&["b", "z", "a"]));  // z
    println!("{}", largest(&[1.5, 0.2]));       // 1.5
    // largest::<i32>(&[]);                     // compiles, but panics: index out of bounds
}
```
::

Three ways to write the same bound:

::code-wrapper{language="rust"}
```rust
use std::fmt::Display;

fn a<T: Display>(x: T) { println!("{x}"); }
fn b<T>(x: T) where T: Display { println!("{x}"); }   // handy with many bounds
fn c(x: impl Display) { println!("{x}"); }             // shortest
```
::

## Generic Structs

::code-wrapper{language="rust"}
```rust
#[derive(Debug)]
struct Pair<T> { a: T, b: T }

impl<T: PartialOrd + Copy> Pair<T> {
    fn max(&self) -> T { if self.a > self.b { self.a } else { self.b } }
}

fn main() {
    let p = Pair { a: 3, b: 7 };
    println!("{}", p.max());          // 7
    // let q = Pair { a: 1, b: 2.0 }; // error[E0308]: mismatched types — both fields share ONE T
}
```
::

## Static vs Dynamic Dispatch

**`impl Trait` / generics** — the compiler makes a copy per type; calls are direct and fast.
**`dyn Trait`** — one copy; the method is looked up at run time. Needed for mixed types in one collection.

::code-wrapper{language="rust"}
```rust
trait Animal { fn speak(&self) -> String; }
struct Dog;
struct Cat;
impl Animal for Dog { fn speak(&self) -> String { "Woof".into() } }
impl Animal for Cat { fn speak(&self) -> String { "Meow".into() } }

fn main() {
    // let zoo = vec![Dog, Cat];                         // error: mismatched types
    let zoo: Vec<Box<dyn Animal>> = vec![Box::new(Dog), Box::new(Cat)];
    for a in &zoo {
        println!("{}", a.speak());
    }
}
```
::

**Tricky**: `impl Trait` in a return type is still **one** concrete type:

::code-wrapper{language="rust"}
```rust
use std::fmt::Display;

// fn pick(b: bool) -> impl Display {
//     if b { 1 } else { "one" }   // error[E0308]: `if` and `else` have incompatible types
// }

fn pick(b: bool) -> Box<dyn Display> {
    if b { Box::new(1) } else { Box::new("one") }
}

fn main() {
    println!("{} {}", pick(true), pick(false));
}
```
::

## Traits Must Be in Scope

**Tricky**: a method from a trait can't be called unless the trait is imported:

::code-wrapper{language="rust"}
```rust
mod shapes {
    pub trait Area { fn area(&self) -> f64; }
    pub struct Sq(pub f64);
    impl Area for Sq { fn area(&self) -> f64 { self.0 * self.0 } }
}

// use shapes::Area;        // ← without this line:
fn main() {
    let s = shapes::Sq(2.0);
    // s.area();            // error[E0599]: no method named `area` found
    //                      // help: trait `Area` ... is implemented but not in scope
    println!("{}", shapes::Area::area(&s));   // or call it fully qualified
}
```
::

This is why you often see `use std::io::Write;` or `use std::fmt::Write;` just to call `.write_all()` / `write!`.

## The Orphan Rule

You can implement a trait for a type only if **the trait or the type** is defined in your crate:

::code-wrapper{language="rust"}
```rust
use std::fmt;

// impl fmt::Display for Vec<i32> { ... }
// error[E0117]: only traits defined in the current crate can be implemented for types defined outside of the crate

struct Numbers(Vec<i32>);          // newtype → now the type is yours
impl fmt::Display for Numbers {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{} numbers", self.0.len())
    }
}

fn main() {
    println!("{}", Numbers(vec![1, 2, 3]));   // 3 numbers
}
```
::

## Same Method Name in Two Traits

::code-wrapper{language="rust"}
```rust
trait Pilot { fn fly(&self) -> &str { "pilot" } }
trait Wizard { fn fly(&self) -> &str { "wizard" } }
struct Human;
impl Pilot for Human {}
impl Wizard for Human {}

fn main() {
    let h = Human;
    // h.fly();                              // error[E0034]: multiple applicable items in scope
    println!("{}", Pilot::fly(&h));           // pilot
    println!("{}", <Human as Wizard>::fly(&h)); // wizard
}
```
::

## 💡 Tips & Tricks

- **Idiom** — `impl Trait` in arguments for simple cases; `<T: Trait>` when the same `T` appears twice.
- **Idiom** — `where` clauses keep long bounds readable.
- **Idiom** — implement `Display` instead of writing a custom `to_string()` method.
- **Idiom** — use `dyn Trait` only when you need different types in one collection (or to cut compile time).
- **Debug** — "method not found" on a type that clearly implements it usually means a missing `use Trait`.

## ⚠️ Edge Cases & Gotchas

- **Bounds** — inside a generic function you can only use what the bounds allow (`>`, `+`, `{}`…).
- **Scope** — trait methods need the trait imported.
- **Orphan rule** — no `impl ForeignTrait for ForeignType`; wrap it in a newtype.
- **impl Trait** — a return of `impl Trait` must be the same concrete type on every path.
- **Name clash** — two traits with the same method need `Trait::method(&x)`.
- **Generic struct** — `Pair<T> { a: T, b: T }` forces both fields to the same type.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
fn print_all<T: std::fmt::Display>(items: &[T]) {
    for i in items {
        println!("{i}");
    }
}

fn main() {
    print_all(&[1, 2]);
    print_all(&["a", "b"]);
    print_all(&[1, "b"]);
}
```
::

<details>
<summary>Answer</summary>

The last call fails: `error[E0308]: mismatched types`. A slice `&[T]` holds **one** type `T`; `1` and `"b"` are different types even though both implement `Display`.

For mixed types, use trait objects:

::code-wrapper{language="rust"}
```rust
use std::fmt::Display;

fn print_all(items: &[&dyn Display]) {
    for i in items {
        println!("{i}");
    }
}

fn main() {
    print_all(&[&1, &"b"]);
}
```
::

</details>

## 🧠 Quick Quiz

::code-wrapper{language="rust"}
```rust
trait Greet {
    fn name(&self) -> &str;
    fn hello(&self) -> String { format!("Hello, {}", self.name()) }
}

struct En;
struct Fr;
impl Greet for En { fn name(&self) -> &str { "Ann" } }
impl Greet for Fr {
    fn name(&self) -> &str { "Zoé" }
    fn hello(&self) -> String { format!("Bonjour, {}", self.name()) }
}

fn main() {
    let gs: [&dyn Greet; 2] = [&En, &Fr];
    for g in gs { println!("{}", g.hello()); }
}
```
::

<details>
<summary>Answer</summary>

::code-wrapper{language="bash"}
```bash
Hello, Ann
Bonjour, Zoé
```
::

`En` uses the default `hello`, which calls its own `name()`. `Fr` overrides `hello`.

</details>

## Summary

Traits describe shared behavior; generics with trait bounds reuse code across types with zero run-time cost. Use `dyn Trait` for mixed collections. Remember: import the trait to call its methods, and the orphan rule forbids implementing foreign traits on foreign types.

Next: Closures.
