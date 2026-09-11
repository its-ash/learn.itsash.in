# 16 — Traits and Generics

Monomorphization is the axis everything in this chapter turns on: a generic function doesn't exist as compiled code until called with a concrete type, and then it exists **once per concrete type**.

## Under-the-Hood Mechanics

### Monomorphization: one function, N compiled copies

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn max<T: PartialOrd + Copy>(a: T, b: T) -> T { if a > b { a } else { b } }

fn use_it() {
    max(3, 5);            // generates/uses max::<i32>
    max(3.0, 5.0);        // generates/uses max::<f64>
    max("a", "b");        // generates/uses max::<&str>
}
// The binary contains three distinct compiled functions, not one generic one.
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Proof: each instantiation is a real, independently-addressable function.
fn id<T>(x: T) -> T { x }

fn main() {
    let f1: fn(i32) -> i32 = id::<i32>;
    let f2: fn(&str) -> &str = id::<&str>;
    // f1 and f2 point at different machine addresses — two copies, not one.
    println!("{:p} {:p}", f1 as *const (), f2 as *const ());
}
```
::

### `dyn Trait`: a fat pointer and a vtable, generated once

::code-wrapper{language="rust" filename="main.rs"}
```rust
trait Greet { fn say_hi(&self) -> String; }
struct User { name: String }
impl Greet for User { fn say_hi(&self) -> String { format!("hi {}", self.name) } }

fn print_all<T: Greet>(items: &[T]) { /* monomorphized per T — inlinable */ }
fn print_dyn(items: &[Box<dyn Greet>]) { /* one shared codepath, vtable-indirected */ }

fn main() {
    println!("{}", std::mem::size_of::<&dyn Greet>());  // 16 — fat pointer
    println!("{}", std::mem::size_of::<&User>());        // 8  — thin pointer
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Mechanically, a trait object is just this — no magic, just two words:
struct FatPointer {
    data: *const (),
    vtable: *const (),   // table of fn pointers, one per trait method
}
// Calling `dyn_greet.say_hi()` = load vtable, index slot 0, indirect-call.
```
::

### Object safety is a mechanical constraint

::code-wrapper{language="rust" filename="main.rs"}
```rust
// NOT object-safe: `clone` returns Self by value.
trait Cloneable { fn clone_it(&self) -> Self; }
// let _: Box<dyn Cloneable> = ...;  // compile error: cannot be made into an object

// NOT object-safe: generic method needs infinite vtable slots.
trait Converter { fn convert<T: From<Self>>(&self) -> T where Self: Sized; }

// IS object-safe: every method returns a fixed-size, erasure-compatible type.
trait Shape { fn area(&self) -> f64; }
let _: Box<dyn Shape>; // fine — `area` doesn't return `Self` or take a generic param
```
::

### Associated types resolve at compile time; generic params resolve per call site

::code-wrapper{language="rust" filename="main.rs"}
```rust
trait Container { type Item; fn get(&self, i: usize) -> Self::Item; }
struct IntBag(Vec<i32>);
impl Container for IntBag {
    type Item = i32;                       // exactly one Item type, ever
    fn get(&self, i: usize) -> i32 { self.0[i] }
}

// Contrast: a generic trait parameter allows MULTIPLE impls for the same type.
trait ConvertsTo<T> { fn convert(&self) -> T; }
struct Meters(f64);
impl ConvertsTo<f64> for Meters { fn convert(&self) -> f64 { self.0 } }      // to f64
impl ConvertsTo<String> for Meters { fn convert(&self) -> String { format!("{}m", self.0) } } // to String — coexists
```
::

## Cost, Performance, and Trade-Offs

Static dispatch = zero-cost calls, N compiled copies. Dynamic dispatch = one copy, per-call indirection.

::code-wrapper{language="rust" filename="main.rs"}
```rust
trait Summable { fn value(&self) -> i64; }

// Static: monomorphized per T, inlinable, adds to binary size per instantiation.
fn total_static<T: Summable>(items: &[T]) -> i64 {
    items.iter().map(|i| i.value()).sum()
}

// Dynamic: one compiled body regardless of how many concrete types implement it.
fn total_dyn(items: &[Box<dyn Summable>]) -> i64 {
    items.iter().map(|i| i.value()).sum() // vtable call per `.value()`
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Blanket impl trade-off: covers every Display type, but forever forecloses
// a manual, more-specific impl for any future type — coherence forbids overlap.
use std::fmt::Display;

trait Describe { fn describe(&self) -> String; }
impl<T: Display> Describe for T {
    fn describe(&self) -> String { format!("value: {}", self) }
}
// impl Describe for i32 { ... }   // ERROR: conflicting implementations
```
::

`cargo bloat --release` shows codegen bloat from monomorphization; `cargo build --timings` shows crates dominated by trait-resolution cost — both are the measurable side of these trade-offs, not theoretical.

## Production Failure Modes & Anti-Patterns

### Generic-everywhere causing runaway compile times and binary bloat

::code-wrapper{language="rust" filename="main.rs"}
```rust
// WRONG: a "generic for flexibility" API called with dozens of distinct
// concrete types across a large codebase — each becomes a full compiled copy
pub fn process<T, F, E>(items: Vec<T>, transform: F) -> Result<Vec<T>, E>
where
    F: Fn(&T) -> Result<(), E>,
    T: Clone + std::fmt::Debug,
{
    for item in &items { transform(item)?; }
    Ok(items)
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// RIGHT: extract a non-generic core; keep only the unavoidable generic
// surface thin, so the bulk of the work is compiled exactly once
fn process_core(
    len: usize,
    transform: &mut dyn FnMut(usize) -> Result<(), Box<dyn std::error::Error>>,
) -> Result<(), Box<dyn std::error::Error>> {
    for i in 0..len { transform(i)?; }
    Ok(())
}

pub fn process<T, F, E>(items: Vec<T>, mut transform: F) -> Result<Vec<T>, E>
where
    F: FnMut(&T) -> Result<(), E>,
{
    for item in &items { transform(item)?; }
    Ok(items)
}
// Profile with `cargo bloat` before micro-optimizing — know the lever exists.
```
::

### Forcing `dyn Trait` into a hot loop for unused flexibility

::code-wrapper{language="rust" filename="main.rs"}
```rust
// WRONG: every call in a tight inner loop pays a vtable indirection for
// polymorphism that's actually resolved once at startup
struct Pixel;
trait DrawStrategy { fn draw(&self, p: &mut Pixel); }

struct Renderer { strategy: Box<dyn DrawStrategy> }
impl Renderer {
    fn render_frame(&self, pixels: &mut [Pixel]) {
        for p in pixels.iter_mut() {
            self.strategy.draw(p);   // vtable call, millions of times/frame
        }
    }
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// RIGHT: push the generic parameter up to where the strategy is chosen —
// the hot loop monomorphizes and becomes inlinable/vectorizable
struct Pixel;
trait DrawStrategy { fn draw(&self, p: &mut Pixel); }

struct Renderer<S: DrawStrategy> { strategy: S }
impl<S: DrawStrategy> Renderer<S> {
    fn render_frame(&self, pixels: &mut [Pixel]) {
        for p in pixels.iter_mut() {
            self.strategy.draw(p);   // monomorphized, inlinable, vectorizable
        }
    }
}
```
::

### Trait method returning `Self` breaking object safety mid-refactor

::code-wrapper{language="rust" filename="main.rs"}
```rust
// WRONG: adding one "convenience" method silently breaks every existing
// Box<dyn Shape> call site elsewhere in the codebase
trait Shape {
    fn area(&self) -> f64;
    fn scaled(&self, factor: f64) -> Self;   // breaks object safety
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// RIGHT: return a boxed trait object instead of Self — costs one allocation,
// stays object-safe
trait Shape {
    fn area(&self) -> f64;
    fn scaled(&self, factor: f64) -> Box<dyn Shape>;
}
```
::

## Architectural Application

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Library-boundary decision #1: generic param pushes monomorphization cost
// onto every CALLER's binary — good for perf-sensitive libs (serde, allocators).
pub fn serialize<T: serde::Serialize>(v: &T) -> Vec<u8> { /* ... */ vec![] }

// vs. dyn Trait: implementation compiled once, INSIDE this library — better
// for compile times across many callers, right when polymorphism is a real
// runtime property (plugins), not just compile-time convenience.
pub fn run_plugin(p: &dyn Plugin) { p.execute(); }
trait Plugin { fn execute(&self); }
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Orphan rule: cannot impl an external trait for an external type.
// struct Wrapper(Vec<i32>);
// impl std::fmt::Display for Vec<i32> { ... }   // ERROR: orphan rule

// Newtype escape hatch — the standard, load-bearing workaround:
struct Wrapper(Vec<i32>);
impl std::fmt::Display for Wrapper {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "{:?}", self.0)
    }
}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Sealed trait: lets a library add methods later without breaking semver,
// because no external crate can implement it.
mod sealed { pub trait Sealed {} }

pub trait Widget: sealed::Sealed {
    fn render(&self) -> String { "default".into() }  // safe to add later
}
struct Button;
impl sealed::Sealed for Button {}
impl Widget for Button {}
```
::

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Marker traits (auto-traits) propagate structurally, zero annotation cost —
// this is what makes a data race a compile error instead of an incident.
struct Task<F> { job: F }

fn spawn_task<F: FnOnce() + Send + 'static>(f: F) {
    std::thread::spawn(f);   // requires F: Send — checked at compile time
}
```
::

## 💡 Tips & Tricks

- **Debug**: `cargo expand` shows each monomorphized instantiation the compiler generated.

::code-wrapper{language="rust" filename="main.rs"}
```rust
// cargo expand output for `max(3, 5); max(3.0, 5.0);` shows two distinct
// fn bodies: `max::<i32>` and `max::<f64>` — proof of what got duplicated.
```
::

- **Idiom**: implement `From`, never `Into` directly — the blanket impl gives you `Into` for free.

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Celsius(f64);
struct Fahrenheit(f64);
impl From<Celsius> for Fahrenheit {
    fn from(c: Celsius) -> Self { Fahrenheit(c.0 * 9.0 / 5.0 + 32.0) }
}
let f: Fahrenheit = Celsius(100.0).into();   // works via std's blanket impl
```
::

- **Performance**: benchmark before assuming static or dynamic dispatch "obviously" wins for a hot path — `cargo bloat` for size, `criterion` for call-site cost.
- **Idiom**: seal a trait the moment you want room to add methods later without a semver break (see sealed-trait example above).
- **Debug**: `the trait Trait is not implemented for Type` can mean the impl exists for a *different* instantiation.

::code-wrapper{language="rust" filename="main.rs"}
```rust
// impl MyTrait for Vec<i32> {}
// fn use_it(v: Vec<u32>) { v.my_method(); }
// error mentions MyTrait, not Vec<u32> vs Vec<i32> — read the full type
```
::

- **Clippy**: `clippy::wrong_self_convention` flags `fn to_x(self)` — consuming `self` should use `into_`, not `to_`.

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Buffer(Vec<u8>);
impl Buffer {
    fn to_vec(self) -> Vec<u8> { self.0 }   // lint: should be `into_vec`
}
```
::

## ⚠️ Edge Cases & Gotchas

- **Orphan rule**: can't `impl ExternalTrait for ExternalType` — use newtype (see above).
- **`Self` returns break object safety**:

::code-wrapper{language="rust" filename="main.rs"}
```rust
trait Bad { fn dup(&self) -> Self; }        // NOT object-safe
trait Good { fn dup(&self) -> Box<dyn Good>; } // object-safe
```
::

- **Method resolution ambiguity** — disambiguate with UFCS:

::code-wrapper{language="rust" filename="main.rs"}
```rust
trait A { fn go(&self) -> &str { "A" } }
trait B { fn go(&self) -> &str { "B" } }
struct S;
impl A for S {} impl B for S {}
fn main() {
    // S.go();          // ERROR: ambiguous
    println!("{}", A::go(&S));   // disambiguated
}
```
::

- **Blanket impl conflicts appear far from the blanket impl** — design them conservatively in public crates.
- **`PartialEq` vs `Eq`**:

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn main() {
    let nan = f64::NAN;
    println!("{}", nan == nan);   // false — f64: PartialEq but not Eq
}
```
::

- **Trait objects cannot have generic methods**:

::code-wrapper{language="rust" filename="main.rs"}
```rust
trait Bad { fn call<T>(&self, x: T); }   // no vtable slot for "every possible T"
// let _: Box<dyn Bad>; // ERROR
```
::

- **`impl Trait` in argument position is sugar for a generic**, not a trait-object acceptor:

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn f(x: impl std::fmt::Display) { println!("{x}"); }
// desugars to: fn f<T: std::fmt::Display>(x: T) { ... } — still monomorphized
```
::

- **`Self: Sized` bound excludes a method from the vtable** — deliberate technique for static-only convenience methods:

::code-wrapper{language="rust" filename="main.rs"}
```rust
trait Shape {
    fn area(&self) -> f64;
    fn boxed_clone(&self) -> Box<dyn Shape> where Self: Sized + Clone {
        Box::new(self.clone())
    }
}
```
::

## 🧠 Spot the Bug

::code-wrapper{language="rust" filename="main.rs"}
```rust
trait Shape {
    fn area(&self) -> f64;
    fn scaled(&self, factor: f64) -> Self;
}

struct Circle { radius: f64 }

impl Shape for Circle {
    fn area(&self) -> f64 { std::f64::consts::PI * self.radius * self.radius }
    fn scaled(&self, factor: f64) -> Self { Circle { radius: self.radius * factor } }
}

fn main() {
    let shapes: Vec<Box<dyn Shape>> = vec![Box::new(Circle { radius: 2.0 })];
}
```
::

<details>
<summary>Answer</summary>

`error[E0038]: the trait \`Shape\` cannot be made into an object` — `scaled(&self, factor: f64) -> Self` returns `Self` by value, and a vtable entry needs one fixed signature; it can't represent "return whatever concrete type this instance is."

::code-wrapper{language="rust" filename="main.rs"}
```rust
trait Shape {
    fn area(&self) -> f64;
    fn scaled(&self, factor: f64) -> Box<dyn Shape>;   // fixed return type — fine
}
```
::

Same reason `Clone::clone(&self) -> Self` isn't object-safe, and why `dyn Clone` doesn't exist without a workaround.

</details>

## Summary

- `T: Trait` (generics) → N compiled copies, zero-cost calls, bigger binary/compile time.

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn f<T: Trait>(x: T) { /* one copy per concrete T */ }
trait Trait {}
```
::

- `dyn Trait` → one compiled copy, vtable indirection per call, smaller binary.

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn f(x: &dyn Trait) { /* one shared implementation */ }
trait Trait {}
```
::

- Object safety is mechanical: no `Self`-by-value returns, no generic methods.
- Library boundary: pick generics for perf-critical, single-implementation code; pick `dyn Trait` where polymorphism is a genuine runtime property (plugins).

Next: Closures — how captures compile to anonymous structs, and what `Fn`/`FnMut`/`FnOnce` actually cost at each capture mode.
