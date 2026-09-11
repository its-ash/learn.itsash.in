# 10 — Lifetimes

Lifetimes are a **static proof obligation about data dependency graphs**, fully erased before codegen. A lifetime parameter is a constraint on the *caller*, not an instruction to the compiler about memory management.

## Under-the-Hood Mechanics

### Lifetimes do not exist at runtime

No tag, no metadata, no runtime check — checked during MIR borrow-checking, then erased before codegen.

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn longest_a<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}

// Splitting into two independent lifetimes changes nothing about codegen —
// it only changes what the *caller* is allowed to do afterward.
fn longest_b<'a, 'b: 'a>(x: &'a str, y: &'b str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}

fn main() {
    let s1 = String::from("hello world");
    let s2 = String::from("hi");
    println!("{}", longest_a(&s1, &s2)); // identical machine code to longest_b
    println!("{}", longest_b(&s1, &s2));
}
```
::

Both compile to identical comparison-and-branch machine code — verify with `cargo asm` or `-C opt-level=3 --emit asm`.

### Region inference: shortest-of-all-inputs

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn pick<'a>(always_this: &'a str, _never_this: &'a str) -> &'a str {
    always_this // runtime behavior is irrelevant to the signature's contract
}

fn main() {
    let long = String::from("outlives the block");
    let result;
    {
        let short = String::from("dies here");
        result = pick(&long, &short); // 'a becomes the intersection: bounded by `short`
    } // short dropped
    // println!("{result}"); // ERROR even though `pick` never returns `_never_this`
    println!("compiles only if the print above stays commented out");
}
```
::

The compiler checks the *signature's contract* against every possible call — it never inspects which branch executes at runtime.

### Variance: covariance vs. invariance

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn assert_static_fits<'a>(_: &'a str) {}

fn main() {
    let s: &'static str = "hello";
    assert_static_fits(s); // OK: &'static str is a subtype of &'a str (covariant in 'a)

    let mut long_lived: &'static str = "long";
    let short_lived = String::from("short");
    // let r: &mut &'static str = &mut long_lived;
    // *r = &short_lived; // ERROR: would smuggle a short-lived ref into a 'static slot
    // drop(short_lived);
    // println!("{long_lived}"); // use-after-free if the above compiled — invariance forbids it
}
```
::

`&'a T` is covariant in `'a`: a longer-lived borrow satisfies a shorter requirement. `&'a mut T` is invariant in `T`: covariance there would let you write a short-lived reference through a mutable slot typed for a longer lifetime.

### Self-referential structs: the honest limitation

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct SelfRef<'a> {
    value: String,
    slice: &'a str, // wanting this to point into `value` above is the illegal case
}

fn broken<'a>() -> SelfRef<'a> {
    let value = String::from("data");
    let slice = &value[..]; // borrows a local about to be dropped
    // SelfRef { value, slice } // ERROR: can't express "slice borrows from value"
    todo!("moving `value` would invalidate `slice`; no lifetime annotation fixes this")
}
```
::

Moving the struct would need to fix up an internal pointer — Rust moves are a bitwise copy, so they never do that. This is why `async fn` state machines need `Pin` (see the Async chapter) instead of ordinary lifetime annotations.

## Cost, Performance, and Trade-Offs

**Runtime cost: exactly zero.** No lifetime-related instructions exist in the binary.

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Compile-time-only cost demo: this generic, heavily-bounded signature
// is expensive for rustc to type-check and trait-resolve, but produces
// ordinary monomorphized machine code with zero lifetime overhead.
fn apply<'a, 'b, T, F, U>(items: &'a [T], f: F) -> Vec<U>
where
    'b: 'a,
    T: 'b,
    F: for<'r> Fn(&'r T) -> U,
{
    items.iter().map(f).collect()
}
```
::

**Design cost — the infectious struct:**

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Excerpt<'a> {
    part: &'a str, // every embedding type now needs its own lifetime parameter
}

struct Cache<'a> {
    last: Option<Excerpt<'a>>, // infected: Cache can't outlive the borrowed source
}

// vs. the owning version, paying one allocation for total independence:
struct OwnedExcerpt {
    part: String,
}

struct OwnedCache {
    last: Option<OwnedExcerpt>, // no lifetime parameter, storable anywhere, incl. 'static
}
```
::

**`'static` is a design commitment, not a quick fix:**

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::thread;

fn spawn_bad(data: &str) {
    // thread::spawn(|| println!("{data}")); // ERROR: closure may outlive `data`
}

fn spawn_good(data: String) {
    thread::spawn(move || println!("{data}")); // owned data satisfies 'static
}
```
::

## Production Failure Modes & Anti-Patterns

### Anti-pattern: fighting an error by slapping `'static` on a field

::code-wrapper{language="rust" filename="main.rs"}
```rust
// naive: config parser borrows from source; storing it long-lived hits a wall
struct ParsedConfig<'a> {
    name: &'a str,
    tags: Vec<&'a str>,
}

fn parse(source: &str) -> ParsedConfig<'_> {
    let mut parts = source.split(',');
    ParsedConfig { name: parts.next().unwrap_or(""), tags: parts.collect() }
}

struct App {
    config: Option<ParsedConfig<'static>>, // "just make it 'static" — now unfillable
}

impl App {
    fn load(&mut self, source: &str) {
        // self.config = Some(parse(source)); // ERROR: source isn't 'static
    }
}
```
::

The fix: own the data.

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct ParsedConfig {
    name: String,
    tags: Vec<String>,
}

fn parse(source: &str) -> ParsedConfig {
    let mut parts = source.split(',');
    ParsedConfig {
        name: parts.next().unwrap_or("").to_string(),
        tags: parts.map(str::to_string).collect(),
    }
}

struct App {
    config: Option<ParsedConfig>, // no lifetime parameter, no borrowing constraint
}

impl App {
    fn load(&mut self, source: &str) {
        self.config = Some(parse(source)); // works: owned data has no source coupling
    }
}
```
::

One allocation per string at parse time, negligible for a startup config read. **Borrowing is the optimization; owning is the default.**

### Anti-pattern: a shared lifetime stricter than actual usage

::code-wrapper{language="rust" filename="main.rs"}
```rust
// naive: unifies both params under one 'a even though only one branch is used
fn select_message<'a>(primary: &'a str, fallback: &'a str, use_primary: bool) -> &'a str {
    if use_primary { primary } else { fallback }
}

fn build_response(use_primary: bool) -> String {
    let long_lived = String::from("default fallback message");
    let result;
    {
        let short_lived = String::from("primary message");
        result = select_message(&short_lived, &long_lived, use_primary);
    } // short_lived dropped here
    // println!("{result}"); // ERROR: result's lifetime bounded by the shorter input
    String::new()
}
```
::

Two fixes depending on intent — independent lifetimes with an owned return:

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn select_message<'a, 'b>(primary: &'a str, fallback: &'b str, use_primary: bool) -> String {
    if use_primary { primary.to_string() } else { fallback.to_string() }
}
```
::

or, if the borrow really should track the branch taken, an asymmetric bound:

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn select_message<'a, 'b: 'a>(primary: &'a str, fallback: &'b str, use_primary: bool) -> &'a str {
    if use_primary { primary } else { fallback } // caller must keep both alive as long as 'a
}
```
::

### Anti-pattern: threading a lifetime through a trait object needlessly

::code-wrapper{language="rust" filename="main.rs"}
```rust
// naive: registry of borrowed trait objects — infects every consumer with 'a
trait Handler {
    fn handle(&self, input: &str) -> String;
}

struct Registry<'a> {
    handlers: Vec<&'a dyn Handler>,
}

impl<'a> Registry<'a> {
    fn dispatch(&self, input: &str) -> Vec<String> {
        self.handlers.iter().map(|h| h.handle(input)).collect()
    }
}
```
::

The fix — own the handlers:

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Registry {
    handlers: Vec<Box<dyn Handler>>, // no lifetime parameter — owns its data
}

impl Registry {
    fn dispatch(&self, input: &str) -> Vec<String> {
        self.handlers.iter().map(|h| h.handle(input)).collect()
    }
}

// Shared, thread-safe ownership variant:
use std::sync::Arc;

struct SharedRegistry {
    handlers: Vec<Arc<dyn Handler + Send + Sync>>,
}
```
::

Reach for borrowed trait objects only for short-lived, single-call-stack use; reach for `Box`/`Arc` the moment the collection outlives the scope that populated it.

## Architectural Application

**API surface: borrow vs. own is a breaking-change boundary.**

::code-wrapper{language="rust" filename="main.rs"}
```rust
// v1: zero-copy commitment — every future version must stay expressible this way
struct Token<'a> {
    text: &'a str,
}
fn parse_v1(input: &str) -> Token<'_> {
    Token { text: input }
}

// switching to this later is a breaking change for every caller:
struct TokenOwned {
    text: String,
}
fn parse_v2(input: &str) -> TokenOwned {
    TokenOwned { text: input.to_string() }
}
```
::

**Zero-copy is systemic, not per-function** — one layer that must own data forces a clone at that boundary:

::code-wrapper{language="rust" filename="main.rs"}
```rust
struct Record<'a> {
    field: &'a str,
}

fn parse_zero_copy(buf: &str) -> Record<'_> {
    Record { field: &buf[..4] }
}

fn store_for_later(buf: &str) -> String {
    let rec = parse_zero_copy(buf);
    rec.field.to_string() // deliberate clone at the ownership boundary — not accidental
}
```
::

**Concurrency boundaries require `'static`:**

::code-wrapper{language="rust" filename="main.rs"}
```rust
use std::sync::Arc;
use std::thread;

fn fan_out(shared: Arc<Vec<i32>>) {
    let handles: Vec<_> = (0..4)
        .map(|i| {
            let data = Arc::clone(&shared); // owned handle, satisfies 'static
            thread::spawn(move || data[i % data.len()])
        })
        .collect();
    for h in handles {
        h.join().unwrap();
    }
}
```
::

## 💡 Tips & Tricks

- **Debug**: write out every elided lifetime explicitly to see what the compiler infers.
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  fn f(x: &str) -> &str { x }          // elided
  fn f_explicit<'a>(x: &'a str) -> &'a str { x } // desugared — now obvious what's tied to what
  ```
  ::
- **Idiom**: default to owning during an unblock, optimize back to borrowing later.
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  fn stuck<'a>(v: &'a [i32]) -> &'a i32 { &v[0] }      // fighting a lifetime error
  fn unblocked(v: &[i32]) -> i32 { v[0] }               // owned i32 — no lifetime to fight
  ```
  ::
- **Idiom**: use `'_` where elision already determines the lifetime.
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  impl<'a> Excerpt<'a> {
      fn part(&self) -> &str { self.part }     // implicit
      fn part2(&self) -> &'_ str { self.part }  // explicit anonymous — same meaning, clearer intent
  }
  # struct Excerpt<'a> { part: &'a str }
  ```
  ::
- **Idiom**: split one lifetime into two the moment two fields genuinely diverge.
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  struct Overconstrained<'a> { src: &'a str, arena: &'a str }   // forces same lifespan
  struct Correct<'src, 'arena> { src: &'src str, arena: &'arena str } // independent
  ```
  ::
- **Debug**: a `'static` suggestion from rustc is a prompt to reconsider ownership, not a fix to paste in — see the anti-pattern section above before typing `'static`.

## ⚠️ Edge Cases & Gotchas

- **Shared `'a` ties output to the shortest input:**
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
      if x.len() > y.len() { x } else { y }
  }
  // result's usable lifetime = min(lifetime(x), lifetime(y)) — not "whichever is returned"
  ```
  ::
- **Closures capturing references** can't outlive what they capture:
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  fn make_closure() -> impl Fn() -> i32 {
      let local = 5;
      // move || local // fine if `local` is Copy and moved in — no dangling reference
      move || local
  }
  ```
  ::
- **Iterators holding references** infect their container:
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  struct Cursor<'a> {
      iter: std::slice::Iter<'a, i32>, // borrows the slice for 'a — same as any other field
  }
  ```
  ::
- **Trait objects default to `'static`:**
  ::code-wrapper{language="rust" filename="main.rs"}
  ```rust
  trait Greet {}
  struct Local<'a>(&'a str);
  impl<'a> Greet for Local<'a> {}

  fn make<'a>(s: &'a str) -> Box<dyn Greet + 'a> { // must say `+ 'a` explicitly
      Box::new(Local(s))
  }
  // Box<dyn Greet> alone means Box<dyn Greet + 'static> — won't accept a borrow
  ```
  ::
- **Self-referential structs** aren't expressible directly — use `ouroboros`/`self_cell`, or store an index instead of a reference.

## 🧠 Spot the Bug

Why does this fail, given the executed branch only ever returns the longer-lived argument?

::code-wrapper{language="rust" filename="main.rs"}
```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}

fn main() {
    let result;
    let s1 = String::from("long string");
    {
        let s2 = String::from("short");
        result = longest(s1.as_str(), s2.as_str());
    }
    println!("{result}");
}
```
::

<details>
<summary>Answer</summary>

`error[E0597]: \`s2\` does not live long enough`.

`longest`'s signature forces one shared `'a` for both parameters — the compiler picks the *shorter* of the two actual borrow durations, regardless of which `if` branch runs at runtime. `result` is read after `s2` drops, so it violates `'a` as bound by `s2`, even though the executing branch returns `s1`.

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Fix: two independent lifetimes + an explicit relationship, or an owned return.
fn longest_owned(x: &str, y: &str) -> String {
    if x.len() > y.len() { x.to_string() } else { y.to_string() }
}
```
::

</details>

## Summary

::code-wrapper{language="rust" filename="main.rs"}
```rust
// Erasure: zero runtime cost, purely a compile-time proof.
fn f<'a>(x: &'a str) -> &'a str { x } // no trace of 'a survives to codegen

// Caller-side constraint, not a compiler hint:
fn g<'a>(x: &'a str, y: &'a str) -> &'a str { x } // 'a = intersection of x's and y's regions

// Variance is a soundness proof:
fn h<'a>(_: &'a str) {}
fn variance_demo() { let s: &'static str = "x"; h(s); } // &'static str <: &'a str

// Infectious borrowing vs. owning:
struct Borrowed<'a> { s: &'a str }  // every consumer needs a lifetime param
struct Owned { s: String }          // one allocation, total independence

// 'static at concurrency boundaries is a real design boundary:
fn spawn_needs_static(s: String) { std::thread::spawn(move || println!("{s}")); }
```
::

Next: Structs — the algebraic data types that lifetimes, ownership, and borrowing all exist to make safe to model.
