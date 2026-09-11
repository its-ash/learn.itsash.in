# 29 — Advanced Type System (Variance, HRTBs, Subtyping)

The gap between mid-level and senior Rust fluency lives here: knowing *why* the compiler rejects code that looks obviously correct, and which of two API designs (generic vs. associated type, `dyn Trait` vs. `impl Trait`, GAT vs. boxing) is the right trade-off rather than a syntax preference.

## Under-the-Hood Mechanics

### Variance: derived structurally, not annotated

`'static` is a subtype of every `'a`. Variance is how that substitutability propagates through type constructors — derived from how a type *uses* its parameter.

::code-wrapper{language="rust"}
```rust
// &'a T is COVARIANT in T: a longer-lived, read-only borrow can substitute
fn takes_short<'a>(s: &'a str) { println!("{s}"); }
fn covariance_ok() {
    let s: &'static str = "hi";
    takes_short(s); // &'static str used where &'a str expected — fine, read-only
}
```
::

::code-wrapper{language="rust"}
```rust
// &'a mut T is INVARIANT in T — this hypothetical is what invariance forbids
fn if_covariance_allowed_this_would_compile() {
    let mut s = String::from("hi");
    // let r: &mut &'static str = &mut s;      // NOT real code — illustrative only
    // let short = String::from("bye");
    // *r = &short;                            // would write a short-lived &str
    //                                          // into a slot typed &'static str
    // println!("{}", s);                      // s would now dangle
}
```
::

::code-wrapper{language="rust"}
```rust
// Real compiler output for the invariant case:
fn assign<'a>(dest: &mut &'a str, src: &'a str) { *dest = src; }
fn real_rejection() {
    let mut r: &str = "long lived";
    {
        let short = String::from("short");
        // assign(&mut r, &short); // ERROR: `short` does not live long enough
    }
    println!("{r}");
}
```
::

### Monomorphization: one compiled copy per concrete `T`

::code-wrapper{language="rust"}
```rust
fn identity<T>(x: T) -> T { x }

fn call_sites() {
    identity(1i32);        // compiles a separate identity::<i32>
    identity("hi");         // compiles a separate identity::<&str>
    identity(String::new()); // and a separate identity::<String>
    // -> three distinct, non-generic functions in the binary after codegen
}
```
::

::code-wrapper{language="rust"}
```rust
// Code-bloat in practice: N call-site types => N copies of the body
trait Encode { fn encode(&self) -> Vec<u8>; }
fn encode_all<T: Encode>(items: &[T]) -> Vec<Vec<u8>> {
    items.iter().map(Encode::encode).collect()
}
// encode_all::<Header>, encode_all::<Frame>, encode_all::<Ack>, ... each
// fully duplicated in the binary, each independently inlinable.
```
::

### `dyn Trait`: vtable + fat pointer

::code-wrapper{language="rust"}
```rust
trait Shape { fn area(&self) -> f64; }

struct Circle { r: f64 }
impl Shape for Circle { fn area(&self) -> f64 { std::f64::consts::PI * self.r * self.r } }

struct Square { side: f64 }
impl Shape for Square { fn area(&self) -> f64 { self.side * self.side } }

// Generic: monomorphized, zero-cost dispatch, one compiled copy PER type used
fn print_area_generic<S: Shape>(s: &S) { println!("{}", s.area()); }

// dyn: one shared compiled copy, vtable dispatch, heterogeneous types allowed
fn print_area_dyn(s: &dyn Shape) { println!("{}", s.area()); }

fn heterogeneous_collection() {
    let shapes: Vec<Box<dyn Shape>> = vec![
        Box::new(Circle { r: 1.0 }),
        Box::new(Square { side: 2.0 }), // impossible with a single generic Vec<S>
    ];
    for s in &shapes { print_area_dyn(s.as_ref()); }
}
```
::

::code-wrapper{language="rust"}
```rust
// Fat pointer size proof
fn size_check() {
    assert_eq!(std::mem::size_of::<&dyn Shape>(), 2 * std::mem::size_of::<usize>());
    assert_eq!(std::mem::size_of::<&Circle>(), std::mem::size_of::<usize>());
}
```
::

### Higher-Rank Trait Bounds: quantifying over *all* lifetimes

::code-wrapper{language="rust"}
```rust
// Auto-inferred HRTB: closure ties nothing external to the input's lifetime
fn apply_to_str<F>(f: F) where F: for<'a> Fn(&'a str) -> usize {
    let owned = String::from("hello");
    println!("{}", f(&owned)); // f must work for THIS call's fresh lifetime
    println!("{}", f("literal")); // and for this one too, a different lifetime
}
fn use_it() { apply_to_str(|s: &str| s.len()); }
```
::

::code-wrapper{language="rust"}
```rust
// WRONG attempt: pinning the lifetime to a generic parameter doesn't work —
// the caller of apply_to_str_broken can't know 'a in advance
fn apply_to_str_broken<'a, F: Fn(&'a str) -> usize>(f: F, s: &'a str) -> usize {
    f(s) // works, but only for ONE fixed 'a chosen by the caller, not "any 'a"
}
```
::

### GATs: an associated type that borrows from `&self`

::code-wrapper{language="rust"}
```rust
trait LendingIterator {
    type Item<'a> where Self: 'a;
    fn next(&mut self) -> Option<Self::Item<'_>>;
}

struct WindowsMut<'buf> { buf: &'buf mut [u8], pos: usize }

impl<'buf> LendingIterator for WindowsMut<'buf> {
    type Item<'a> = &'a mut [u8] where Self: 'a;
    fn next(&mut self) -> Option<Self::Item<'_>> {
        if self.pos + 2 > self.buf.len() { return None; }
        let slice = &mut self.buf[self.pos..self.pos + 2];
        self.pos += 1;
        Some(slice) // borrows FROM self, per-call — impossible with a fixed `Item`
    }
}
```
::

::code-wrapper{language="rust"}
```rust
// Ecosystem friction: this does NOT work — `for` desugars to std::iter::Iterator,
// whose Item is not generic over a lifetime
fn cannot_for_loop(mut it: WindowsMut) {
    // for w in it { ... } // ERROR: WindowsMut is not `std::iter::Iterator`
    while let Some(w) = it.next() {
        w[0] = 0; // must drive it manually instead
    }
}
```
::

### Const generics: values monomorphized like types

::code-wrapper{language="rust"}
```rust
struct Arr<const N: usize> { data: [u8; N] }

fn needs_32(a: Arr<32>) { /* ... */ }

fn const_generic_mismatch() {
    let a16 = Arr::<16> { data: [0; 16] };
    // needs_32(a16); // ERROR: expected `Arr<32>`, found `Arr<16>` — compile-time, not a bounds check
}
```
::

## Cost, Performance, and Trade-Offs

::code-wrapper{language="rust"}
```rust
// Generics: N instantiations = N copies, each inlinable, all zero-dispatch-cost
fn sum_generic<T: std::ops::Add<Output = T> + Copy>(a: T, b: T) -> T { a + b }
fn call_many_types() {
    sum_generic(1i32, 2);       // copy #1
    sum_generic(1.0f64, 2.0);   // copy #2
    sum_generic(1u8, 2);        // copy #3 — binary grows with each new T
}
```
::

::code-wrapper{language="rust"}
```rust
// dyn: one copy, vtable call, no cross-call inlining — measure, don't assume
trait Adder { fn add(&self, a: i32, b: i32) -> i32; }
struct Plain;
impl Adder for Plain { fn add(&self, a: i32, b: i32) -> i32 { a + b } }

fn hot_loop(adder: &dyn Adder) -> i32 {
    let mut acc = 0;
    for i in 0..1_000_000 {
        acc = adder.add(acc, i); // indirect call every iteration, not inlined
    }
    acc
}
```
::

Associated type vs. generic parameter — the ergonomics trade, in code:

::code-wrapper{language="rust"}
```rust
// Generic parameter: multiple impls per type, but every signature pays for it
trait ConvertFrom<T> { fn convert(t: T) -> Self; }
impl ConvertFrom<u8> for String { fn convert(t: u8) -> Self { t.to_string() } }
impl ConvertFrom<&str> for String { fn convert(t: &str) -> Self { t.to_string() } }

fn needs_generic_param<T, S: ConvertFrom<T>>(t: T) -> S { S::convert(t) } // extra param everywhere
```
::

::code-wrapper{language="rust"}
```rust
// Associated type: clean call sites, but exactly ONE impl per concrete type
trait Parser { type Output; fn parse(&self, s: &str) -> Self::Output; }
struct IntParser;
impl Parser for IntParser { type Output = i32; fn parse(&self, s: &str) -> i32 { s.parse().unwrap() } }
// impl Parser for IntParser { type Output = f64; ... } // ERROR: conflicting impl
```
::

::code-wrapper{language="rust"}
```rust
// PhantomData is zero-sized — verify, don't assume
struct Tagged<T> { id: u64, _marker: std::marker::PhantomData<T> }
fn phantom_is_free() {
    assert_eq!(std::mem::size_of::<Tagged<String>>(), std::mem::size_of::<u64>());
}
```
::

## Production Failure Modes & Anti-Patterns

### Anti-pattern: generic method added to a trait already used as `dyn Trait`

::code-wrapper{language="rust"}
```rust
// Existing, object-safe trait, used widely as Box<dyn Service> in production
pub trait Service {
    fn call(&self, req: Request) -> Response;
}
```
::

::code-wrapper{language="rust"}
```rust
// A "harmless" addition during a refactor — WRONG, breaks object safety
pub trait Service {
    fn call(&self, req: Request) -> Response;
    fn call_typed<T: FromRequest>(&self, req: Request) -> T; // compiles here...
}

fn breaks_far_away(svc: &dyn Service) {
    // ERROR surfaces HERE, in a different crate maybe:
    // "the trait `Service` cannot be made into an object"
}
```
::

::code-wrapper{language="rust"}
```rust
// RIGHT — keep the object-safe trait untouched; add the generic method via
// an extension trait excluded from object safety with `where Self: Sized`
pub trait Service {
    fn call(&self, req: Request) -> Response;
}

pub trait ServiceExt: Service {
    fn call_typed<T: FromRequest>(&self, req: Request) -> T where Self: Sized {
        T::from_request(self.call(req))
    }
}
impl<S: Service + ?Sized> ServiceExt for S {}

fn still_works(svc: &dyn Service) {
    let _ = svc.call(Request::default()); // dyn callers never see call_typed
}
```
::

### Anti-pattern: `dyn Trait` in a hot path, never benchmarked

::code-wrapper{language="rust"}
```rust
// WRONG (maybe) — introduced for "future flexibility," never profiled
pub struct Pipeline { stages: Vec<Box<dyn Fn(&mut Buffer)>> }

impl Pipeline {
    pub fn run(&self, buf: &mut Buffer) {
        for stage in &self.stages {
            stage(buf); // vtable call, non-inlinable, per stage, per buffer
        }
    }
}
```
::

::code-wrapper{language="rust"}
```rust
// RIGHT, if stages are fixed at compile time — generic over concrete types,
// fully inlinable, no vtable
pub struct Pipeline<A, B> { stages: (A, B) }

impl<A: Fn(&mut Buffer), B: Fn(&mut Buffer)> Pipeline<A, B> {
    pub fn run(&self, buf: &mut Buffer) {
        (self.stages.0)(buf);
        (self.stages.1)(buf); // both statically known, inlinable
    }
}
```
::

::code-wrapper{language="rust"}
```rust
// RIGHT, if heterogeneity IS a genuine runtime requirement (plugins, config-driven)
pub struct PluginPipeline { stages: Vec<Box<dyn Fn(&mut Buffer)>> }
// same shape as the "wrong" version above — the difference is a measured
// decision (stages vary at runtime), not a default reached for by habit
```
::

### Anti-pattern: wrong `PhantomData` variant

::code-wrapper{language="rust"}
```rust
// WRONG — Generator doesn't own a T, it produces one on demand; PhantomData<T>
// falsely claims ownership: covariance and Send/Sync inferred as if T were stored
pub struct Generator<T> {
    state: *mut u8,
    _marker: std::marker::PhantomData<T>,
}
```
::

::code-wrapper{language="rust"}
```rust
// RIGHT — PhantomData<fn() -> T> models "produces T": covariant in T,
// without claiming ownership; !Send/!Sync opt-out appropriate for raw state
pub struct Generator<T> {
    state: *mut u8,
    _marker: std::marker::PhantomData<fn() -> T>,
}
```
::

::code-wrapper{language="rust"}
```rust
// The hole this closes: covariance you didn't intend to grant
fn generator_variance_bug(long: Generator<&'static str>) {
    fn wants_short<'a>(_g: Generator<&'a str>) {}
    // With PhantomData<T> (covariant, correct here since &'static str : &'a str
    // is fine for READ-ONLY data) this is sound; the danger is the OPPOSITE
    // case — a type that mutates through T where covariance would be unsound.
    wants_short(long);
}
```
::

## Architectural Application

::code-wrapper{language="rust"}
```rust
// Default: generics for library-internal, perf-sensitive, few-concrete-types code
pub fn checksum<T: AsRef<[u8]>>(data: T) -> u32 { crc32(data.as_ref()) }
```
::

::code-wrapper{language="rust"}
```rust
// Boundary: dyn Trait for plugin systems / runtime-assembled heterogeneity
pub trait Middleware { fn handle(&self, req: &mut Request); }
pub struct App { middlewares: Vec<Box<dyn Middleware>> } // set from config at startup
```
::

::code-wrapper{language="rust"}
```rust
// Sealed trait: close a public trait to external impls
mod sealed { pub trait Sealed {} }

pub trait InternalOnly: sealed::Sealed {
    fn do_thing(&self);
}
pub struct Known;
impl sealed::Sealed for Known {}
impl InternalOnly for Known { fn do_thing(&self) { /* ... */ } }
// external crates can implement InternalOnly's methods but never the trait
// itself, because they cannot implement the private `sealed::Sealed`
```
::

::code-wrapper{language="rust"}
```rust
// Typestate: invalid call sequences become compile errors
pub struct Disconnected;
pub struct Connected;

pub struct Conn<State> { socket: Option<std::net::TcpStream>, _state: std::marker::PhantomData<State> }

impl Conn<Disconnected> {
    pub fn connect(self, addr: &str) -> std::io::Result<Conn<Connected>> {
        let socket = std::net::TcpStream::connect(addr)?;
        Ok(Conn { socket: Some(socket), _state: std::marker::PhantomData })
    }
}
impl Conn<Connected> {
    pub fn send(&mut self, _bytes: &[u8]) { /* ... */ } // only callable once connected
}

fn typestate_use() -> std::io::Result<()> {
    let conn = Conn::<Disconnected> { socket: None, _state: std::marker::PhantomData };
    // conn.send(&[1]); // ERROR: no method `send` on Conn<Disconnected>
    let mut conn = conn.connect("127.0.0.1:0")?;
    conn.send(&[1]); // fine — type proves connection happened
    Ok(())
}
```
::

## 💡 Tips & Tricks

- **Debug**: substitute `&T` for `&mut T` mentally when a lifetime error appears — if it disappears, it's invariance:
::code-wrapper{language="rust"}
```rust
fn diagnostic_swap<'a>(_dest: &'a str, _src: &'a str) {} // if THIS compiles but
                                                           // &mut &'a str didn't, it's invariance
```
::
- **Idiom**: prefer `PhantomData<fn() -> T>` over `PhantomData<T>` for "produces `T`" types:
::code-wrapper{language="rust"}
```rust
struct Lazy<T> { thunk: Box<dyn Fn() -> T>, _marker: std::marker::PhantomData<fn() -> T> }
```
::
- **Debug**: hover a `for<'a>` bound in rust-analyzer, or run `cargo expand`, to confirm a closure is genuinely higher-ranked rather than pinned to one lifetime.
- **Idiom**: sealed traits over unstable `impl !Trait` — see the `mod sealed` pattern above.
- **Performance**: benchmark generic vs. `dyn` before trusting intuition:
::code-wrapper{language="rust"}
```rust
#[inline(never)] fn via_dyn(f: &dyn Fn(i32) -> i32, x: i32) -> i32 { f(x) }
fn via_generic<F: Fn(i32) -> i32>(f: F, x: i32) -> i32 { f(x) } // often fully inlined away
```
::
- **Clippy**: `clippy::type_complexity` flags this and suggests a type alias:
::code-wrapper{language="rust"}
```rust
type Handlers = std::rc::Rc<std::cell::RefCell<std::collections::HashMap<String, Vec<Box<dyn Fn()>>>>>;
```
::

## ⚠️ Edge Cases & Gotchas

- **Invariance is load-bearing, not a limitation**:
::code-wrapper{language="rust"}
```rust
fn covariant_ok<'a>(x: &'a str) {}      // fine with &'static str
fn invariant_fails<'a>(x: &'a mut &'a str) {} // same substitution fails through &mut
```
::
- **Adding a generic method silently breaks `dyn` users far from the change site** — see the `ServiceExt` example above; the error never points at the trait definition.
- **`Send`/`Sync` inference is all-or-nothing per field**:
::code-wrapper{language="rust"}
```rust
struct MostlySend { a: i32, b: std::rc::Rc<i32> } // Rc makes the WHOLE struct !Send
fn spawn_it(v: MostlySend) {
    // std::thread::spawn(move || { let _ = v; }); // ERROR points at spawn, not at field `b`
}
```
::
- **`dyn Trait` lifetime defaults differ by position**:
::code-wrapper{language="rust"}
```rust
fn owned_default(x: Box<dyn std::fmt::Display>) {}       // == Box<dyn Display + 'static>
fn borrowed_default<'a>(x: &'a dyn std::fmt::Display) {} // trait object lifetime == 'a, NOT 'static
```
::
- **GATs don't retrofit into `for` loops**:
::code-wrapper{language="rust"}
```rust
// for item in lending_iter {} // ERROR — LendingIterator isn't std::iter::Iterator
```
::
- **Const generics need syntactically-identical expressions to unify on stable**:
::code-wrapper{language="rust"}
```rust
struct Arr<const N: usize>;
fn const_expr_mismatch() {
    let a: Arr<5> = Arr;
    // let b: Arr<{ 2 + 3 }> = a; // may fail to unify even though 2+3 == 5
}
```
::
- **`PhantomData<T>` vs `PhantomData<*const T>` compiles and passes ordinary tests either way** — the soundness hole only appears via subtyping/coercion patterns most suites never construct (see the `Generator<T>` anti-pattern above).

## 🧠 Spot the Bug

Why won't this compile?

::code-wrapper{language="rust"}
```rust
fn assign_shorter<'a>(dest: &mut &'a str, src: &'a str) {
    *dest = src;
}

fn main() {
    let long_lived = String::from("long lived");
    let mut r: &str = &long_lived;

    {
        let short_lived = String::from("short lived");
        assign_shorter(&mut r, &short_lived);
    }

    println!("{r}");
}
```
::

<details>
<summary>Answer</summary>

`short_lived` does not live long enough. `&mut &'a str` is invariant in `'a`, so the compiler must unify `'a` to the *shortest* lifetime satisfying both `dest` (needs `r`'s lifetime, which spans to the `println!`) and `src` (`short_lived`'s short scope) — it can't shrink just one side. The only consistent `'a` is too short for `r`'s required lifetime, so the borrow is rejected.

::code-wrapper{language="rust"}
```rust
// If it DID compile (it doesn't), this is the dangling reference it would produce:
fn what_would_happen() {
    // r would point at short_lived's freed stack memory here,
    // and println!("{r}") would read use-after-free.
}
```
::

**The lesson**: `&mut T` is invariant in `T` precisely so a mutable reference can never smuggle a shorter-lived value into a binding expected to outlive it.

</details>

## Summary

::code-wrapper{language="rust"}
```rust
// Variance: &T covariant, &mut T invariant — invariance is load-bearing soundness
fn covariant<'a>(_: &'a str) {}
fn invariant_marker<'a>(_: &'a mut &'a str) {}
```
::

::code-wrapper{language="rust"}
```rust
// Generics: N copies, zero dispatch cost, inlinable, larger binary
fn mono<T: Clone>(x: T) -> T { x.clone() }

// dyn: 1 copy, vtable dispatch, no cross-call inlining, smaller binary
fn dynamic(x: &dyn std::fmt::Debug) { println!("{x:?}"); }
```
::

::code-wrapper{language="rust"}
```rust
// HRTB: universal quantification over lifetimes chosen per-call
fn hrtb<F: for<'a> Fn(&'a str) -> usize>(f: F) -> usize { f("x") }

// GAT: associated type borrowing from &self — real expressiveness gain,
// real ecosystem-composability cost (no `for` loop sugar, see above)
trait Lend { type Item<'a> where Self: 'a; }
```
::

Object safety is a trait's public contract with `dyn` consumers — breaking it is a stealth breaking change; `PhantomData`'s variant choice is a correctness decision, not boilerplate.

Next: Design patterns and idiomatic Rust — how these type-system primitives compose into production-grade APIs.
