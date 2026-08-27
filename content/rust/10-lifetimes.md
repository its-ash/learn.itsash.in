# 10 — Lifetimes

Lifetimes are the borrow checker's way of tracking **how long a reference is valid**. They're a compile-time concept; there's zero runtime cost.

## The Core Idea

A reference's lifetime is the region of code where it's valid to use. The compiler *rejects* code where a reference could outlive the data it points to:

::code-wrapper{language="rust"}
```rust
let r;
{
    let x = 5;
    r = &x;
}                       // x dropped here
println!("{r}");        // ERROR: x does not live long enough
```
::

## Generic Lifetime Parameters

### What a lifetime parameter actually is

A lifetime parameter like `'<a>` is **not a runtime thing** — it's a compile-time **relationship constraint** that the compiler uses to verify borrows are sound. When you write `fn longest<'a>(x: &'a str, y: &'a str) -> &'a str`, you're declaring: "the returned reference will be valid for *at least* as long as the shorter of `x` and `y`." The compiler then checks every call site to confirm that constraint holds.

The reason this must be explicit: a function returning a reference *must* borrow from some input (it can't conjure data from thin air), and the compiler needs to know *which* input so it can tie the output's validity to that input's lifetime. Without the annotation, `fn f(x: &str, y: &str) -> &str` is ambiguous — does the output borrow from `x` or `y`? The compiler can't tell, so it asks you to say.

::code-wrapper{language="rust"}
```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}
```
::

`<'a>` declares a generic lifetime. `&'a str` means "a `str` reference valid for at least `'a`". The signature says: *the returned reference is valid for at least as long as the shorter of `x` and `y`.*

## Lifetime Elision Rules

### Why these rules exist

The three elision rules exist because the overwhelming majority of function signatures follow one of a few common patterns, and writing explicit lifetimes for every one of them would drown real code in noise. The rules pick the most likely input-to-output relationship automatically; they cover the common cases so you only annotate the genuinely ambiguous ones. Rule 3 (`&self` ties to output) reflects how methods work — a method returning a borrow almost always borrows from `self`, not from a separate argument.

If after these rules the output lifetime is ambiguous (multiple inputs, no `self`), the compiler gives up and asks you to write it explicitly. That's not a failure of elision — it's the rule system saying "this case is genuinely ambiguous, you decide."

To reduce boilerplate, the compiler applies three elision rules:

1. Each input reference gets its own lifetime: `fn f(x: &str, y: &str)` → `fn f<'a, 'b>(x: &'a str, y: &'b str)`.
2. If there's exactly one input lifetime, all output references get that lifetime: `fn f(x: &str) -> &str` → `fn f<'a>(x: &'a str) -> &'a str`.
3. If there are multiple inputs but one is `&self`/`&mut self`, all output lifetimes get `self`'s lifetime (method elision).

If after these rules the output lifetime is ambiguous, you must write it explicitly:

::code-wrapper{language="rust"}
```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str { ... }
```
::

## `'static`

### What `'static` means conceptually

`'static` is the **longest possible lifetime** — it lasts the entire program. In Rust's lifetime subtyping lattice, `'static` sits at the top, so a `&'static T` can be used anywhere a `&'a T` is expected (this is covariance: longer-lived fits where shorter-lived is needed). String literals get `'static` because they're stored in the read-only data section of the binary, which exists for the program's whole execution.

The key thing to understand: `'static` is a *lifetime*, not a storage class. It doesn't mean "allocated globally" — it means "valid for the whole program." A leaked `Box` produces a `&'static` reference even though the data started on the heap, because nothing will reclaim it.

### When you'll encounter it

- All string literals: `"hello"` has type `&'static str` (stored in the binary).
- `const` values that are references.
- Global statics.
- Thread spawning: captured closures require `'static` because the thread may outlive the caller's stack.

::code-wrapper{language="rust"}
```rust
let s: &'static str = "I live forever";
```
::

Don't reach for `'static` to *silence* lifetime errors — if the compiler demands `'static` where you didn't expect it, it usually signals a design problem (a borrowed value can't escape its scope). Reach for `'static` only when the data genuinely lives for the whole program.

## Structs Holding References

If a struct holds a reference, it must declare a lifetime:

::code-wrapper{language="rust"}
```rust
struct Excerpt<'a> { part: &'a str }

let novel = String::from("a long novel...");
let first = novel.split(' ').next().unwrap();
let e = Excerpt { part: first };
```
::

The struct can't outlive the data `part` borrows. The compiler enforces this.

## Lifetimes in Method Signatures

::code-wrapper{language="rust"}
```rust
impl<'a> Excerpt<'a> {
    fn announce(&self, msg: &str) -> &str {
        println!("{msg}{}", self.part);
        self.part            // elided: returns &'a str (rule 3)
    }
}
```
::

Output references are tied to `&self` automatically when there's no other choice.

## Multiple Lifetimes

### Why two is more flexible than one

Two distinct lifetime parameters express **independent** borrowing constraints: `source` must live at least `'src`, `arena` must live at least `'arena`, and nothing says they're related. This is *strictly more permissive* than collapsing both to a single `'a` (which would force both to live for the same span). You reach for separate lifetimes when a struct/function holds borrows of things with genuinely unrelated lifespans — e.g., a parser that borrows both source text and an allocation arena, where the arena may outlive the source or vice versa. Collapse to one lifetime only when the borrows are truly coupled.

::code-wrapper{language="rust"}
```rust
struct Parser<'src, 'arena> {
    source: &'src str,
    arena: &'arena Arena,
}
```
::

Two distinct lifetimes express "the source lives at least `'src`, the arena lives at least `'arena`". If the struct never mixes them (e.g., never puts `source` into `arena`), this is more flexible than collapsing to one lifetime.

## Lifetime Variance (advanced)

### Why variance matters

Variance determines **when you can substitute a reference of one lifetime for another**. Without it, the compiler would have to reject any case where the lifetimes don't match exactly — which would break enormous amounts of valid code (you couldn't pass a `&'static str` where a `&'a str` is expected, for instance). Variance is the rule system that makes lifetimes *subtype* sensibly.

- `**Covariance**` in `'a` (`&'a T`): a *longer* lifetime can substitute for a *shorter* one. So `&'static str` fits anywhere `&'a str` is needed — the longer-lived reference is a *subtype*.
- `**Invariance**` in `T` (`&'a mut T`): you *can't* shorten the borrow of `T` because mutation could write back a value that lives shorter than expected. This is why `&'a mut T` can't be freely substituted — it prevents foot-guns.
- `**Contravariance**` in `'a` (`fn(&'a T)`): a function that accepts a *shorter* lifetime can be used where one accepting a *longer* lifetime is expected.

Most code never names variance, but it's the *reason* some seemingly valid code compiles or doesn't — e.g., why `Cell`/`RefCell`/`UnsafeCell` are invariant (they enable interior mutation, so invariance is required for soundness).

## Higher-Rank Trait Bounds (HRTB)

### Why this exists

A normal lifetime parameter `'<a>` is *chosen by the caller* — the caller picks one specific `'a` and the function works for that one. But some functions need to work with **any lifetime the caller throws at them, possibly different ones each call** — a callback that may be invoked many times with borrows of different durations. `for<'a>` expresses exactly that: "this works for *all* lifetimes `'a`," not just one the caller selected. This is the difference between "the caller picks" (generic) and "the callee works for any" (higher-ranked).

The `Fn` traits implicitly use HRTBs on their arguments — that's why a closure `|x: &str| ...` can be called with borrows of varying lifetimes rather than being locked to one.

::code-wrapper{language="rust"}
```rust
fn foo<F>(f: F) where F: for<'a> Fn(&'a str) { ... }
```
::

`for<'a>` means "for all possible lifetimes `'a`". Closures that work with any borrowed input need this. The `Fn` traits implicitly have HRTB on their arguments.

## Anonymous Lifetime `'_`

### Why it exists

`'_` is the explicit way to say **"use elision here."** It exists for places where bare `&` would be a warning or ambiguous (e.g., inside an `impl Trait` return, in a type alias, in a struct field where you want elision semantics but need a placeholder token). You don't sprinkle it — you reach for it when the compiler insists on a lifetime token but you want elision to apply, or to silence "elided lifetime in path" lints in a focused way.

::code-wrapper{language="rust"}
```rust
fn longest(x: &str, y: &str) -> &'_ str { ... }
```
::

`'_` is "use elision here". Useful in `impl Trait` positions and to silence "elided lifetime in path" warnings. Don't sprinkle it; only when you specifically want elision.

## Lifetime in Enums

Same rules as structs:

::code-wrapper{language="rust"}
```rust
enum Node<'a> { Leaf(&'a str), Branch(&'a [Node<'a>]) }
```
::

## Static vs Stack Lifetimes

::code-wrapper{language="rust"}
```rust
fn returns_str() -> &'static str { "literal" }  // OK
fn returns_stack() -> &str {
    let local = String::from("hi");
    &local                  // ERROR: local does not live long enough
}
```
::

## Lifetime Bounds on Generics

### What `T: 'a` constrains

`T: 'a` does **not** mean `T` itself outlives `'a` — it means **any references contained inside `T` must outlive `'a`.** This matters when `T` is itself a type that might hold borrows (e.g., a struct with a `&str` field). The compiler needs to know those inner references won't dangle before it lets you return `&'a T` or store `T` somewhere expecting `'a`. The bound is often implicit (the compiler adds it when it can), but you write it explicitly when `T` is generic and you need to guarantee its contents are valid for `'a`.

::code-wrapper{language="rust"}
```rust
fn parse<T>(s: &str) -> T where T: FromStr, T::Err: Debug { ... }
fn longest_anon<'a, T: 'a>(x: &'a T) -> &'a T { x }
```
::

`T: 'a` means "T's owned references (if any) outlive `'a`". Often implicit, but needed when `T` itself contains references.

## Lifetime Extension via `Box::leak`

### When to reach for it

`Box::leak` deliberately "leaks" an owned heap value, turning it into a `&'static` reference that's never reclaimed. The classic use case is **a config or asset parsed once at program startup that lives for the whole program anyway** — allocating it once and leaking a `'static` reference avoids threading a lifetime parameter through every function that touches the config, since `'static` is universally acceptable. The tradeoff is that the memory is *never freed*, so this is appropriate only for data whose lifetime matches the process; don't use it for data created repeatedly during runtime (use an arena, a `OnceLock`, or an `Rc` instead).

::code-wrapper{language="rust"}
```rust
let leaked: &'static mut [u8] = Box::leak(vec![1, 2, 3].into_boxed_slice());
```
::

`Box::leak` turns an owned heap value into a `'static` reference (memory is never reclaimed). Useful for long-lived configs but a memory leak by design.

## Common Lifetime Errors & Fixes

- **"borrowed value does not live long enough"**: the referent's scope is too short. Restructure so it outlives the borrow, or clone/own.
- **"lifetime may not live long enough"**: explicit lifetimes where the relationship is wrong; usually you need to express that the output is bound to *one specific* input.
- **"returns a value referencing data owned by the current function"**: returning a reference to a local. You must return an owned value (e.g., `String` not `&str`), or take the data as input.
- **Adding `'static` to silence**: usually wrong. Thread spawns require `'static` for closure captures; you need owned data there.

## Lifetime Patterns Cheat Sheet

| Function returns… | What you do |
|---|---|
| A reference clearly tied to one input | Rely on elision |
| A reference derived from multiple inputs | Pick the relevant input lifetime and annotate |
| A reference to newly created data | Return owned (`String`, `Vec<T>`), not `&` |
| A `'static` literal or constant | Write `&'static` explicitly |
| Data tied to a self-borrow | Use `self`-elision |

## 💡 Tips & Tricks

- **Debug**: when a lifetime error is confusing, temporarily write out every elided lifetime explicitly (`fn f<'a>(x: &'a str) -> &'a str`) — seeing the desugared signature often makes it obvious which input the compiler thinks the output is (or should be) tied to.
- **Idiom**: reach for owning the data (`String` instead of `&str`, `Vec<T>` instead of `&[T]`) as your first fix attempt for a stubborn lifetime error in application code — it's rarely the "most correct" fix in a vacuum, but it's almost always the fastest way to unblock yourself, and you can optimize back to borrowing later once the design has settled.
- **Idiom**: use `'_` (anonymous lifetime) in `impl` blocks and return positions where elision already determines the lifetime — it signals "there's a lifetime here, let the compiler infer it" more clearly than omitting it entirely, especially in generic-heavy code.
- **Debug**: `cargo expand` won't show you lifetime *inference* results (lifetimes are erased before codegen), but rust-analyzer's inlay hints for elided lifetimes (enable in VS Code settings) will show you exactly what the compiler inferred, inline in the editor.
- **Idiom**: prefer two named lifetimes (`<'src, 'arena>`) over collapsing to one (`<'a>`) the moment two borrowed fields in a struct genuinely have independent, unrelated lifespans — collapsing them to one is not "simpler," it's a stricter (and sometimes wrong) constraint that the compiler will start rejecting valid code against.
- **Debug**: `'static` in an error's suggested fix is not the compiler telling you "add `'static` and move on" — it's usually flagging a design where a reference is trying to outlive its data; treat a `'static` suggestion as a prompt to reconsider ownership, not a fix to apply reflexively.

## ⚠️ Edge Cases & Gotchas

- **`'a` ties output to the *shortest* input**: `longest<'a>(x: &'a, y: &'a)` means the result lives at most as long as the *shorter* of `x` and `y`.
- **Closures capturing references**: the closure's lifetime must include the captured references' lifetimes.
- **Iterators holding references**: `std::slice::Iter<'a, T>` borrows the slice for `'a`.
- **`self`-referential structs** are famously hard in safe Rust; use `ouroboros` crate or restructure. The borrow checker can't express "this field borrows from that field of the same struct".
- **Async functions** desugar to state machines that hold references across `.await` points — lifetimes get complex; usually you must own the data instead of borrowing.

## Lifetime Tricks & Patterns

::code-wrapper{language="rust"}
```rust
// Trick: use bound lifetime parameters for closures
fn apply<F>(f: F) where F: for<'a> Fn(&'a str) {
    f("hello");
    f("world");
}

// Trick: constrain output lifetime with input
fn first_or<'a, 'b>(a: &'a str, b: &'b str) -> &'a str
where
    'b: 'a, // requires b's lifetime to outlive a's
{
    if a.is_empty() { b } else { a }
}

// Trick: use PhantomData for lifetime ownership
use std::marker::PhantomData;
struct Borrowed<'a> {
    data: *const u8,
    _marker: PhantomData<&'a u8>,
}

// Trick: covariance/contravariance with function pointers
fn accept_fn<F>(_: F) where F: for<'a> Fn(&'a str) {}
accept_fn(|_| {}); // works

// Trick: use 'static to enforce no borrowed data
fn spawn_thread<F>(f: F) where F: FnOnce() + 'static + Send {
    std::thread::spawn(f);
}

// Trick: lower and higher-ranked trait bounds
fn takes_closure<F>(f: F) where F: for<'a> Fn(&'a str) -> &'a str {
    let _ = f("test");
}
```
::

## Lifetime Edge Cases

::code-wrapper{language="rust"}
```rust
// Edge case: lifetime elision with multiple references
fn longest<'a>(x: &'a str, y: &str) -> &'a str { x } // y's lifetime is different!

// Edge case: lifetime of borrowed field in struct
struct Excerpt<'a> {
    text: &'a str,
}
// Excerpt can't outlive text's lifetime

// Edge case: 'static doesn't mean "forever," it means "known at compile time"
let s: &'static str = "hello"; // string literal, embedded in binary

// Edge case: lifetime bound on trait objects
let v: Vec<Box<dyn std::fmt::Debug + 'static>> = vec![Box::new(5)];
// objects can't have borrowed references inside

// Edge case: variance affects lifetime subtyping
fn accept<'a>(_: &'a str) {} // 'a is covariant
let s: &'static str = "hi";
accept(s); // 'static <: 'a works
```
::

## 🧠 Spot the Bug

Why does this fail to compile?

::code-wrapper{language="rust"}
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

`longest`'s signature, `fn longest<'a>(x: &'a str, y: &'a str) -> &'a str`, forces both parameters to share a **single** lifetime `'a` — this doesn't mean "whichever is longer," it means the compiler must pick one `'a` that is valid for *both* arguments simultaneously, which is necessarily the *shorter* of the two actual borrow durations. Since `result` is assigned inside the inner block but read in `println!` after the block ends, `result`'s required lifetime spans past `s2`'s drop point. But because `longest`'s return type shares `'a` with *both* inputs, the compiler must treat the returned reference as only valid for as long as the shorter-lived argument (`s2`) — regardless of the fact that, at runtime, the `if` branch that actually executes only ever returns `x` (`s1`, the longer string). The compiler doesn't run the function to see which branch executes; it only checks that the signature's contract holds for *every possible* execution, and the signature promises a lifetime no longer than the shortest input.

**The lesson**: a shared lifetime parameter across multiple inputs means the output is only as long-lived as the *shortest* of them — the compiler enforces this from the signature alone, without regard to which branch of the function body would actually execute at runtime.

</details>

## Summary

Lifetimes are how Rust makes references safe. They:
- Annotate relationships between inputs and outputs.
- Get elided in common cases.
- Enforce that no reference outlives its referent.
- Sometimes need explicit annotation when multiple inputs feed an output.
- Use bound lifetime parameters (`for<'a>`) for maximum flexibility in closures.
- Use trait objects with `'static` to avoid lifetime complications.

Next: Structs and enums — the algebraic data types at the heart of Rust modeling.