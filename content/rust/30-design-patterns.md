# 30 — Design Patterns in Rust

Rust's ownership and type system change which patterns are useful. The common ones below are small, and each one turns a class of runtime bugs into compile errors.

## Builder

Rust has no default or named arguments. A builder gives you both:

::code-wrapper{language="rust"}
```rust
#[derive(Debug)]
struct Request { url: String, timeout: u32, retries: u32 }

struct RequestBuilder { url: String, timeout: u32, retries: u32 }

impl RequestBuilder {
    fn new(url: &str) -> Self {                       // REQUIRED values go in new()
        Self { url: url.into(), timeout: 30, retries: 0 }
    }
    fn timeout(mut self, t: u32) -> Self { self.timeout = t; self }   // optional values
    fn retries(mut self, r: u32) -> Self { self.retries = r; self }
    fn build(self) -> Request {
        Request { url: self.url, timeout: self.timeout, retries: self.retries }
    }
}

fn main() {
    let r = RequestBuilder::new("https://x.io").retries(3).build();
    println!("{r:?}");   // Request { url: "https://x.io", timeout: 30, retries: 3 }
}
```
::

**Tricky**: if required fields are `Option`s filled by setters, forgetting one only fails **at run time** inside `build()`. Put required values in `new()` and the compiler enforces them.

## Newtype + Smart Constructor

Validate once, then trust the type everywhere:

::code-wrapper{language="rust"}
```rust
mod email {
    #[derive(Debug)]
    pub struct Email(String);          // private field — the only way in is parse()

    impl Email {
        pub fn parse(s: &str) -> Result<Email, String> {
            let s = s.trim();
            if s.contains('@') && !s.starts_with('@') && !s.ends_with('@') {
                Ok(Email(s.to_lowercase()))
            } else {
                Err(format!("invalid email: {s:?}"))
            }
        }
        pub fn as_str(&self) -> &str { &self.0 }
    }
}

use email::Email;

fn send_welcome(to: &Email) {          // can't be called with an unchecked String
    println!("sending to {}", to.as_str());
}

fn main() {
    let e = Email::parse(" Ada@Example.com ").unwrap();
    send_welcome(&e);                   // sending to ada@example.com
    println!("{}", Email::parse("@nope").is_err());   // true
    // let fake = Email("x".into());    // error[E0603]: tuple struct constructor `Email` is private
}
```
::

**Tricky**: making the field `pub` (`pub struct Email(pub String)`) silently defeats the whole pattern — anyone can build an invalid `Email`.

## Typestate

Encode the state in the **type**, so wrong-order calls don't compile:

::code-wrapper{language="rust"}
```rust
use std::marker::PhantomData;

struct Open;
struct Closed;

struct Door<State> { _s: PhantomData<State> }

impl Door<Closed> {
    fn new() -> Self { Door { _s: PhantomData } }
    fn open(self) -> Door<Open> { println!("opening"); Door { _s: PhantomData } }
}

impl Door<Open> {
    fn close(self) -> Door<Closed> { println!("closing"); Door { _s: PhantomData } }
}

fn main() {
    let d = Door::new().open().close();
    // Door::new().close();
    // error[E0599]: no method named `close` found for struct `Door<Closed>`
    //   note: the method was found for `Door<Open>`
    let _ = d;
}
```
::

Methods take `self` by value, so the old state can't be used after a transition.

## RAII Guards

Cleanup in `Drop` runs on every exit path — normal return, `?`, or panic:

::code-wrapper{language="rust"}
```rust
struct Timer(&'static str);

impl Drop for Timer {
    fn drop(&mut self) { println!("{} finished", self.0); }
}

fn main() {
    {
        let _ = Timer("ignored");   // `_` doesn't bind → dropped IMMEDIATELY
        let _t = Timer("kept");     // lives until the end of the block
        println!("working");
    }
}
// ignored finished
// working
// kept finished
```
::

**Tricky**: `let _ = guard;` ends the guard at once. Always bind guards to a name like `_t` or `_lock`.

## Strategy: Pass Behavior In

Instead of an inheritance hierarchy, pass a function or closure:

::code-wrapper{language="rust"}
```rust
fn checkout(price: f64, discount: impl Fn(f64) -> f64) -> f64 {
    discount(price)
}

fn main() {
    println!("{}", checkout(10.0, |p| p));          // 10
    println!("{}", checkout(10.0, |p| p * 0.5));    // 5
    let coupon = 2.0;
    println!("{}", checkout(10.0, |p| p - coupon)); // 8 — closures can capture data
}
```
::

Use a trait + `Box<dyn Trait>` when strategies need several methods or must be stored in a list.

## Conversions with `From` / `Into`

::code-wrapper{language="rust"}
```rust
struct Celsius(f64);
struct Fahrenheit(f64);

impl From<Celsius> for Fahrenheit {
    fn from(c: Celsius) -> Self { Fahrenheit(c.0 * 9.0 / 5.0 + 32.0) }
}

fn main() {
    let f: Fahrenheit = Celsius(100.0).into();   // Into comes for free from From
    println!("{}", f.0);                         // 212
}
```
::

Implement `From`, never `Into` directly. `?` also uses `From` to convert errors (chapter 18).

## Extension Traits

Add methods to types you don't own:

::code-wrapper{language="rust"}
```rust
trait Shout {
    fn shout(&self) -> String;
}

impl Shout for str {
    fn shout(&self) -> String { format!("{}!", self.to_uppercase()) }
}

fn main() {
    println!("{}", "hi".shout());   // HI! — callers must `use` the trait (chapter 16)
}
```
::

## 💡 Tips & Tricks

- **Idiom** — required values in `new()`, optional ones as builder methods.
- **Idiom** — private fields + `parse`/`new` returning `Result` = "parse, don't validate".
- **Idiom** — implement `Default` and use `..Default::default()` for config structs.
- **Idiom** — closures for one-method strategies; traits for bigger ones.
- **Avoid** — implementing `Deref` to fake inheritance; method lookup becomes confusing.

## ⚠️ Edge Cases & Gotchas

- **Builders** — `Option` fields for required data move errors to run time.
- **Newtypes** — a `pub` inner field lets anyone skip validation.
- **Guards** — `let _ = guard();` drops the guard immediately.
- **Typestate** — transitions must take `self` by value, or the old state stays usable.
- **From** — implementing `Into` directly loses the free `From` and `?` integration.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
pub struct Percent(pub u8);

impl Percent {
    pub fn new(v: u8) -> Option<Percent> {
        if v <= 100 { Some(Percent(v)) } else { None }
    }
}

fn apply(p: Percent, price: f64) -> f64 {
    price * (1.0 - p.0 as f64 / 100.0)
}

fn main() {
    println!("{}", apply(Percent(250), 10.0));
}
```
::

<details>
<summary>Answer</summary>

Prints `-15` — a negative price. The validating `new()` exists, but the field is `pub`, so `Percent(250)` skips it.

Make the field private and give read access through a method:

::code-wrapper{language="rust"}
```rust
pub struct Percent(u8);

impl Percent {
    pub fn new(v: u8) -> Option<Percent> { (v <= 100).then_some(Percent(v)) }
    pub fn get(&self) -> u8 { self.0 }
}
```
::

Now `Percent(250)` outside the module is a compile error.

</details>

## Summary

Builders replace default arguments, newtypes with private fields guarantee valid data, typestate makes wrong call orders impossible, RAII guarantees cleanup, and `From` standardizes conversions. Each pattern moves a runtime check into the type system.

Next: Performance.
