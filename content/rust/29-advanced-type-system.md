# 29 — Advanced Type System

This chapter collects the type-system tools you'll meet in real libraries: associated types, operator overloading, const generics, marker types, blanket impls, `?Sized`, and the rules for `dyn Trait`.

## Associated Types vs Generic Parameters

::code-wrapper{language="rust"}
```rust
struct Counter { n: u32 }

impl Iterator for Counter {
    type Item = u32;                       // associated type: ONE choice per implementing type
    fn next(&mut self) -> Option<u32> {
        if self.n < 3 { self.n += 1; Some(self.n) } else { None }
    }
}

fn main() {
    let v: Vec<u32> = Counter { n: 0 }.collect();
    println!("{v:?}");                     // [1, 2, 3]
}
```
::

- **Associated type** (`type Item`) — each type implements the trait once, with one `Item`. Callers never have to name it.
- **Generic parameter** (`trait From<T>`) — a type can implement it **many** times: `String: From<&str>`, `String: From<char>`…

## Operator Overloading

Operators are traits in `std::ops`:

::code-wrapper{language="rust"}
```rust
use std::ops::Add;

#[derive(Debug, Clone, Copy, PartialEq)]
struct V2 { x: i32, y: i32 }

impl Add for V2 {
    type Output = V2;
    fn add(self, o: V2) -> V2 {
        V2 { x: self.x + o.x, y: self.y + o.y }
    }
}

fn main() {
    let a = V2 { x: 1, y: 2 };
    let b = V2 { x: 3, y: 4 };
    println!("{:?}", a + b);    // V2 { x: 4, y: 6 }
    println!("{:?}", a);        // still usable — V2 is Copy (otherwise `+` would move it)
}
```
::

## Const Generics

Types can take **values** as parameters:

::code-wrapper{language="rust"}
```rust
fn sum_array<const N: usize>(a: [i32; N]) -> i32 {
    a.iter().sum()
}

struct Matrix<const R: usize, const C: usize>([[i32; C]; R]);

impl<const R: usize, const C: usize> Matrix<R, C> {
    fn dims(&self) -> (usize, usize) { (R, C) }
}

fn main() {
    println!("{}", sum_array([1, 2, 3]));     // 6     — N = 3
    println!("{}", sum_array([10; 5]));       // 50    — N = 5
    println!("{:?}", Matrix([[0; 3]; 2]).dims()); // (2, 3)
}
```
::

## Marker Types with `PhantomData`

A type parameter that is used only for **compile-time checking**, costing zero bytes:

::code-wrapper{language="rust"}
```rust
use std::marker::PhantomData;
use std::ops::Add;

struct Meters;
struct Feet;

#[derive(Debug, Clone, Copy)]
struct Length<Unit> {
    value: f64,
    _unit: PhantomData<Unit>,     // zero-sized, but makes Length<Meters> ≠ Length<Feet>
}

impl<U> Length<U> {
    fn new(value: f64) -> Self { Length { value, _unit: PhantomData } }
}

impl<U> Add for Length<U> {       // only adds lengths with the SAME unit
    type Output = Length<U>;
    fn add(self, o: Self) -> Self { Length::new(self.value + o.value) }
}

fn main() {
    let a: Length<Meters> = Length::new(1.0);
    let b: Length<Meters> = Length::new(2.5);
    println!("{}", (a + b).value);                  // 3.5

    let f: Length<Feet> = Length::new(3.0);
    // let bad = a + f;                             // error[E0308]: mismatched types
    println!("{}", std::mem::size_of::<Length<Feet>>()); // 8 — just the f64
    let _ = f;
}
```
::

## Blanket Implementations

Implement a trait for **every** type that meets a bound:

::code-wrapper{language="rust"}
```rust
trait Describe {
    fn describe(&self) -> String;
}

impl<T: std::fmt::Debug> Describe for T {     // every Debug type gets describe()
    fn describe(&self) -> String {
        format!("<{self:?}>")
    }
}

fn main() {
    println!("{} {}", 5.describe(), "x".describe());   // <5> <"x">
}
```
::

This is how the standard library gives every `Display` type a `to_string()` method.

**Tricky**: after a blanket impl, you can't add a specific impl for a type that already matches — they would overlap (`error[E0119]: conflicting implementations`).

## `Sized` and `?Sized`

Every generic `T` is assumed to have a size known at compile time. `str`, `[T]` and `dyn Trait` don't:

::code-wrapper{language="rust"}
```rust
fn show_sized<T: std::fmt::Debug>(t: &T) { println!("{t:?}"); }
fn show_any<T: std::fmt::Debug + ?Sized>(t: &T) { println!("{t:?}"); }   // ?Sized = "may be unsized"

fn main() {
    let s: &str = "hi";
    // show_sized(s);     // error[E0277]: the size for values of type `str` cannot be known at compilation time
    show_any(s);          // "hi"
    show_any(&[1, 2][..]);
}
```
::

## Which Traits Can Be `dyn`?

A trait can be used as `dyn Trait` only if every method can be called through a pointer without knowing the concrete type.

**Tricky**: adding a generic method, or returning `Self`, breaks `dyn` everywhere:

::code-wrapper{language="rust"}
```rust
trait Shape {
    fn area(&self) -> f64;
    fn scaled<T>(&self, t: T) -> f64 { 0.0 }   // generic method
}

// fn total(s: &dyn Shape) {}
// error[E0038]: the trait `Shape` is not dyn compatible
// help: consider moving `scaled` to another trait

trait Cloner {
    fn dup(&self) -> Self;                     // returns Self — size unknown behind dyn
}
// fn f(c: &dyn Cloner) {}   // error[E0038]
```
::

Fix: exclude that method from `dyn` use with `where Self: Sized`:

::code-wrapper{language="rust"}
```rust
trait Shape {
    fn area(&self) -> f64;
    fn scaled<T>(&self, _t: T) -> f64 where Self: Sized { self.area() }   // not callable on dyn Shape
}

struct Sq(f64);
impl Shape for Sq { fn area(&self) -> f64 { self.0 * self.0 } }

fn main() {
    let shapes: Vec<Box<dyn Shape>> = vec![Box::new(Sq(2.0))];
    println!("{}", shapes[0].area());   // 4 — works again
}
```
::

## The Never Type `!`

::code-wrapper{language="rust"}
```rust
fn main() {
    let input = "42";
    let n: i32 = match input.parse() {
        Ok(v) => v,
        Err(_) => panic!("bad input"),   // type `!` fits where an i32 is expected
    };
    let x: u8 = if n > 0 { 1 } else { return };   // `return` is also `!`
    println!("{n} {x}");
}
```
::

## 💡 Tips & Tricks

- **Idiom** — associated types when there is one natural answer per type (`Iterator::Item`); generic params when many make sense (`From<T>`).
- **Idiom** — `PhantomData` marker types turn unit mix-ups and wrong state transitions into compile errors at zero cost.
- **Idiom** — add `?Sized` to generic functions that only take `&T`, so `str` and slices are accepted.
- **Idiom** — mark generic helper methods `where Self: Sized` to keep a trait `dyn`-compatible.
- **Debug** — `std::any::type_name::<T>()` shows what a generic resolved to.

## ⚠️ Edge Cases & Gotchas

- **dyn** — a generic method or `-> Self` without `where Self: Sized` makes the trait unusable as `dyn Trait`.
- **Sized** — `T` means `T: Sized` by default; `str` and `[T]` need `?Sized`.
- **Operators** — `impl Add` takes `self` by value; non-`Copy` operands are moved.
- **Blanket impls** — overlap with any more specific impl is a compile error.
- **Const generics** — `[i32; 3]` and `[i32; 4]` are different types; you can't mix them in one `Vec` without slices.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
trait Plugin {
    fn name(&self) -> String;
}

struct Logger;
impl Plugin for Logger { fn name(&self) -> String { "logger".into() } }

fn load_all() -> Vec<Box<dyn Plugin>> {
    vec![Box::new(Logger)]
}
```
::

A teammate adds `fn configure<C: Into<String>>(&mut self, c: C) {}` to `Plugin` "because it's handy". What breaks?

<details>
<summary>Answer</summary>

`load_all` (and every other `dyn Plugin`) stops compiling: `error[E0038]: the trait Plugin is not dyn compatible` — a generic method can't go in a vtable. The error shows up far from the change.

Fix one of two ways:

::code-wrapper{language="rust"}
```rust
trait Plugin {
    fn name(&self) -> String;
    fn configure(&mut self, c: String);   // take a concrete type instead of a generic
}
```
::

or keep the generic version but add `where Self: Sized` (then it can't be called on a `dyn Plugin`).

</details>

## Summary

Associated types fix one type per impl; generics allow many. Operators are traits. Const generics and `PhantomData` encode sizes and units in types for free. Blanket impls give behavior to whole families of types. Generic methods and `-> Self` make a trait non-`dyn` unless guarded with `where Self: Sized`.

Next: Design Patterns.
