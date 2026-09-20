# 29 — Advanced Type System (Variance, HRTBs, Subtyping)

The gap between mid-level and senior Rust fluency lives here: knowing *why* the compiler rejects code that looks obviously correct, and which of two API designs (generic vs. associated type, `dyn Trait` vs. `impl Trait`, GAT vs. boxing) is the right trade-off rather than a syntax preference.

## Under-the-Hood Mechanics

### Variance: derived structurally, not annotated

`'static` is a subtype of every `'a`. Variance is how that substitutability propagates through type constructors — derived from how a type *uses* its parameter.

Formally: `Sub <: Super` means `Sub` satisfies every requirement `Super` defines. For lifetimes, `'long <: 'short` iff `'long`'s region completely contains `'short`'s — counterintuitive at first, because the *longer* lifetime is the subtype. There are exactly three variance kinds for a type constructor `F<T>`:

- **Covariant**: `F<Sub> <: F<Super>` — subtyping passes through unchanged
- **Contravariant**: `F<Super> <: F<Sub>` — subtyping inverts
- **Invariant**: no subtyping relationship — the compiler demands the *exact* type

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

The complete variance table — this is worth memorizing, because variance is derived structurally and the derivation rules are uniform:

| Type | in `'a` | in `T` | Why |
|------|---------|---------|-----|
| `&'a T` | covariant | covariant | shared access can't violate lifetimes |
| `&'a mut T` | covariant | invariant | mutation must not smuggle shorter lifetimes |
| `Box<T>`, `Vec<T>` | — | covariant | ownership: moved value forgets its old region |
| `UnsafeCell<T>`, `Cell<T>` | — | invariant | interior mutability = the `&mut` hazard, always |
| `fn(T) -> U` | — | contravariant in `T`, covariant in `U` | an argument-acceptor must accept *at least* what's promised |
| `*const T` | — | covariant | like `&T` |
| `*mut T` | — | invariant | like `&mut T` |

Structs inherit variance from their fields. The conflict rule: if a parameter appears in fields with different variances, **invariance wins every conflict**.

::code-wrapper{language="rust"}
```rust
use std::cell::Cell;

struct Mixed<'a, 'b, A: 'a, B: 'b, C, D, E, H, In, Out, Arg> {
    a: &'a A,          // covariant over 'a and A
    b: &'b mut B,      // covariant over 'b, invariant over B
    c: Cell<C>,        // invariant over C (interior mutability)
    d: Vec<D>,         // covariant over D
    h1: H,             // would be covariant over H except...
    h2: Cell<H>,       // ...invariant over H — invariance wins the conflict
    f: fn(In) -> Out,  // contravariant over In, covariant over Out
    g: &'a Arg,        // covariant over Arg
}
// Rule: all-uses-covariant => covariant; all-uses-contravariant => contravariant;
// ANY invariant use => invariant. Invariance is the safe default on conflict.
```
::

Contravariance in practice — the only source in the language is function arguments. The mental model: a function that promises to handle *any* lifetime can be used where one handling a *specific* lifetime is required, but not vice versa:

::code-wrapper{language="rust"}
```rust
use std::cell::RefCell;

thread_local! {
    static STATIC_VECS: RefCell<Vec<&'static str>> = RefCell::new(Vec::new());
}

// Stores its input in a thread-local Vec<&'static str> — REQUIRES 'static input
fn store(input: &'static str) {
    STATIC_VECS.with_borrow_mut(|v| v.push(input));
}

// Calls f with input of lifetime 'a — f must handle EXACTLY 'a
fn demo<'a>(input: &'a str, f: fn(&'a str)) {
    f(input);
}

fn contravariance_direction() {
    demo("hello", store); // OK: 'static <: 'a, so store (needing 'static)
                          // is usable where fn(&'a str) is expected? NO —
                          // this compiles only because "hello" IS 'static.
    let smuggle = String::from("smuggle");
    // demo(&smuggle, store); // ERROR: fn(&'static str) is NOT a subtype of
                              // fn(&'a str) — contravariance is the other way.
                              // store would push a non-'static ref into a
                              // 'static slot => use-after-free later.
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

### Dyn compatibility (formerly "object safety")

Whether a trait can be used as `dyn Trait` is a *structural property of its definition*, checkable without seeing any use site. The full rule list from the Reference:

- All supertraits must themselves be dyn-compatible
- `Sized` must NOT be a supertrait (`Self: Sized` opts the whole trait out)
- No associated constants
- No associated types with generics (GATs)
- Every associated function must be **dispatchable** or **explicitly non-dispatchable**:
  - *Dispatchable* methods: no type parameters (lifetime parameters are fine), `Self` only in receiver position, receiver must be one of `&Self`, `&mut Self`, `Box<Self>`, `Rc<Self>`, `Arc<Self>`, or `Pin<P>` of those, and no `async fn` / return-position `impl Trait`
  - *Non-dispatchable*: any method exempted via `where Self: Sized`

::code-wrapper{language="rust"}
```rust
// Dispatchable receivers — all valid on dyn Trait
trait Receivers {
    fn by_ref(self: &Self) {}
    fn by_ref_mut(self: &mut Self) {}
    fn by_box(self: Box<Self>) {}
    fn by_rc(self: Rc<Self>) {}
    fn by_arc(self: Arc<Self>) {}
    fn by_pin(self: Pin<&Self>) {}
    fn with_lifetime<'a>(self: &'a Self) {} // lifetime params OK
}
```
::

::code-wrapper{language="rust"}
```rust
// Why each rule exists — the mechanism behind the veto
trait WhyRules {
    // fn returns(&self) -> Self; // Self: concrete type unknown until runtime — vtable can't size it
    // fn param(&self, other: Self); // `other` could be a DIFFERENT impl of the trait
    // fn typed<T>(&self, x: T);     // one vtable entry per T is impossible — T is infinite
    // async fn run(&self);          // returns an anonymous future type — same problem as -> Self
    // fn opaque(&self) -> impl Debug; // hidden type, unknowable at the call site
    // const K: usize;               // consts are resolved statically, no vtable story
    // type Out;                     // needed by the caller to even NAME the type
}
```
::

The `where Self: Sized` escape hatch — keep generic conveniences in the same trait without breaking `dyn`:

::code-wrapper{language="rust"}
```rust
pub trait Logger {
    fn log(&self, msg: &str); // dispatchable — this is the vtable surface

    // exempted: callable on concrete types, invisible to dyn users
    fn with_prefix(prefix: &'static str) -> Self where Self: Sized;
    fn compare(&self, other: &Self) -> bool where Self: Sized { false }
}

struct FileLogger { prefix: &'static str }
impl Logger for FileLogger {
    fn log(&self, msg: &str) { println!("{}: {msg}", self.prefix); }
    fn with_prefix(prefix: &'static str) -> Self { FileLogger { prefix } }
}

fn sized_hatch() {
    let l: Box<dyn Logger> = Box::new(FileLogger { prefix: "app" });
    l.log("dyn path works"); // OK
    // l.compare(l.as_ref()); // ERROR: non-dispatchable method on dyn Logger
    let c = FileLogger::with_prefix("static path"); // OK on the concrete type
    c.log("concrete path works");
}
```
::

**Dyn compatibility is a public API contract.** Adding a generic method to a widely-used trait without `where Self: Sized` is a stealth breaking change — every downstream `Box<dyn YourTrait>` stops compiling, and the error points at *their* code, not your trait definition.

### Higher-Rank Trait Bounds: quantifying over *all* lifetimes

The problem HRTBs solve: a stored closure borrows from data whose lifetime can't be named *outside* the function that calls it. Naively desugaring `F: Fn(&(u8, u16)) -> &u8` to a fixed lifetime `'???` fails — the lifetime is chosen fresh at each call site, inside the body.

`for<'a>` reads as "for **all** choices of `'a`" — it desugars to an infinite list of trait bounds, one per lifetime:

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

The canonical HRTB use case — a struct holding a function that borrows from the struct's own data:

::code-wrapper{language="rust"}
```rust
struct Closure<F> {
    data: (u8, u16),
    func: F,
}

impl<F> Closure<F>
where
    // F must handle ANY lifetime the caller's &self borrow happens to have —
    // that lifetime is unnameable here; only `for<'a>` can express it
    F: for<'a> Fn(&'a (u8, u16)) -> &'a u8,
{
    fn call(&self) -> u8 {
        *(self.func)(&self.data)
    }
}

fn first(data: &(u8, u16)) -> &u8 { &data.0 }

fn hrtb_stored_closure() {
    let clo = Closure { data: (0, 1), func: first };
    let out = clo.call(); // &'a data borrow ends inside call() — HRTB made it sound
    println!("{out}");
}
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

The intuition for why the "broken" version is weaker: a generic `'a` is *existentially* chosen by the caller, once. `for<'a>` is *universally* quantified — the closure must accept every lifetime the callee ever encounters. That's why `for<'a> Fn(&'a str)` accepts `|s: &str| s.len()` (works for any input), but a closure that captures a local and returns a reference to it only satisfies a *specific* `'a`.

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

Const generic parameters make items generic over *constant values*, not just types. On stable, allowed parameter types are only the integers (`u8`/`u16`/`u32`/`u64`/`u128`/`usize` and the signed variants), `char`, and `bool` — no `&str` yet.

::code-wrapper{language="rust"}
```rust
struct Arr<const N: usize> { data: [u8; N] } // const generic parameter in struct definition

fn needs_32(a: Arr<32>) { /* ... */ }

fn const_generic_mismatch() {
    let a16 = Arr::<16> { data: [0; 16] };
    // needs_32(a16); // ERROR: expected `Arr<32>`, found `Arr<16>` — compile-time, not a bounds check
}
```
::

Where a const parameter may appear — signature positions, associated items, function bodies, field types:

::code-wrapper{language="rust"}
```rust
struct Foo<const N: usize>([i32; N]);

impl<const N: usize> Foo<N> {
    const CONST: usize = N * 4; // associated const
}

trait Maker { type Output; }
impl<const N: usize> Maker for Foo<N> {
    type Output = [i32; N]; // associated type
}

fn sizes<const N: usize>(arr: [i32; N]) {
    let x: [i32; N] = [0; N]; // body type + array repeat count
    println!("{}", N * 2);   // runtime expression
}
```
::

The parsing rule that bites: inside a *type* or *array repeat expression*, a const parameter must appear **standalone** — a single identifier (possibly braced, like `N` or `{N}`), never inside arithmetic:

::code-wrapper{language="rust"}
```rust
fn bad<const N: usize>() -> [u8; { N + 1 }] { // ERROR: cannot combine N with
    [1; N + 1]                                 // expressions in these positions
}

fn good<const N: usize>() -> [u8; N] { // OK: standalone N
    [0; N]
}
```
::

The `Foo<N>` ambiguity — a const argument is always resolved as a *type* if it could be either; braces force the const interpretation:

::code-wrapper{language="rust"}
```rust
type N = u32; // shadow-conflict: a type alias also named N

struct Foo<const N: usize>;

fn foo<const N: usize>() -> Foo<N> { todo!() } // ERROR: N parsed as the TYPE alias N (= u32)
fn bar<const N: usize>() -> Foo<{ N }> { todo!() } // OK: braces force const-arg reading
```
::

And the trait-bound surprise: exhaustive impls over all const values do **not** satisfy a generic bound, because coherence doesn't enumerate const values:

::code-wrapper{language="rust"}
```rust
struct Flag<const B: bool>;
trait Bar {}
impl Bar for Flag<true> {}
impl Bar for Flag<false> {} // both bool values implemented — "exhaustive"

fn generic<const B: bool>() {
    let v = Flag::<B>;
    // needs_bar(v); // ERROR: trait bound `Flag<B>: Bar` not satisfied —
                     // the compiler does NOT consider "all possible B" here
}
fn needs_bar(_: impl Bar) {}
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

The full `PhantomData` pattern table — each variant encodes a different *semantic claim* about the marker type, and the choice affects variance, auto-traits, and drop-check all at once:

| Pattern | `'a` | `T` | `Send`/`Sync` | Dropck owns `T`? |
|---------|------|-----|----------------|------------------|
| `PhantomData<T>` | — | covariant | inherited | disallowed ("owns T") |
| `PhantomData<&'a T>` | covariant | covariant | `Send + Sync` needs `T: Sync` | allowed |
| `PhantomData<&'a mut T>` | covariant | invariant | inherited | allowed |
| `PhantomData<*const T>` | — | covariant | `!Send + !Sync` | allowed |
| `PhantomData<*mut T>` | — | invariant | `!Send + !Sync` | allowed |
| `PhantomData<fn(T)>` | — | contravariant | `Send + Sync` | allowed |
| `PhantomData<fn() -> T>` | — | covariant | `Send + Sync` | allowed |
| `PhantomData<fn(T) -> T>` | — | invariant | `Send + Sync` | allowed |
| `PhantomData<Cell<&'a ()>>` | invariant | — | `Send + !Sync` | allowed |

::code-wrapper{language="rust"}
```rust
use std::marker::PhantomData;

// Reading the table as design decisions:
pub struct BorrowedIter<'a, T> {
    ptr: *const T,          // raw for FFI/unsafe — *const alone is !Send/!Sync
    end: *const T,
    _marker: PhantomData<&'a T>, // claims: "holds &'a T" — covariant, Sync-if-T,
}                                // dropck knows we don't own Ts

pub struct OwnedBuf<T> {
    data: *mut T,
    len: usize,
    _owns: PhantomData<T>,   // claims: "owns Ts" — Vec's old pattern; dropck now
}                            // requires T outlives any owned buffer's drop

pub struct Factory<T> {
    _make: PhantomData<fn() -> T>, // claims: "produces T" — covariant, always
}                                   // Send + Sync, never owns
```
::

Why `PhantomData` matters at all — unused parameters are forbidden in struct definitions, because unbounded lifetimes caused historic soundness bugs:

::code-wrapper{language="rust"}
```rust
// ERROR: parameter `'a` is never used — the compiler refuses unbounded lifetimes
// struct BadIter<'a, T> { ptr: *const T, end: *const T }

// The real std::slice::Iter is approximately this — PhantomData bounds 'a
struct Iter<'a, T> {
    ptr: *const T,
    end: *const T,
    _marker: PhantomData<&'a T>, // 'a now bounded; covariant over 'a and T
}
```
::

And the drop-check subtlety: if your type has a `Drop` impl, `PhantomData<T>` (ownership claim) is redundant — `impl Drop for Vec<T>` already tells dropck you own `T`. The field still matters for variance and auto-traits, just not for dropck.

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
struct Arr<const N: usize>; // zero-sized const generic type — N is a value, not a type
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

The real compiler output names the mechanism directly:

::code-wrapper{language="text"}
```text
error[E0597]: `short_lived` does not live long enough
  --> src/main.rs:12:32
   |
9  |     let mut r: &str = &long_lived;
   |                    - type annotation requires that `long_lived` is borrowed for `'static`
...
12 |         assign_shorter(&mut r, &short_lived);
   |                                ^^^^^^^^^^^^^ borrowed value does not live long enough
13 |     }
   |     - `short_lived` dropped here while still borrowed
```
::

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

## References

- [The Rustonomicon — Subtyping and Variance](https://doc.rust-lang.org/nomicon/subtyping.html) — the variance table and the use-after-free proof for `&mut`
- [The Rustonomicon — PhantomData](https://doc.rust-lang.org/nomicon/phantom-data.html) — the full `PhantomData` pattern table and drop-check rules
- [The Rustonomicon — HRTBs](https://doc.rust-lang.org/nomicon/hrtb.html) — the `for<'a>` desugaring of `Fn` bounds
- [The Rust Reference — Generic Parameters](https://doc.rust-lang.org/reference/items/generics.html) — const generics syntax, the standalone-argument rule, inferred consts
- [The Rust Reference — Traits](https://doc.rust-lang.org/reference/items/traits.html#object-safety) — the dyn-compatibility rule list ("object safety" is now officially "dyn compatibility")

Next: Design patterns and idiomatic Rust — how these type-system primitives compose into production-grade APIs.
