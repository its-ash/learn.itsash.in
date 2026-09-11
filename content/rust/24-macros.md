# 24 — Macros: Compile-Time Codegen and Its Real Price

Macros write the program the compiler checks, before type-checking exists — that's why they can do things functions can't, and why they cost things functions don't.

::code-wrapper{language="rust"}
```rust
// A function: types checked, arguments evaluated once, ordinary call semantics.
fn double(x: i32) -> i32 { x * 2 }

// A macro: tokens in, tokens out, no type-checking until AFTER expansion.
macro_rules! double { ($x:expr) => { $x * 2 }; }
```
::

## Under-the-Hood Mechanics

### Two compilation stages, two different costs

::code-wrapper{language="rust"}
```rust
// declarative: expanded by rustc's built-in expander, no separate compilation
macro_rules! double { ($x:expr) => { $x * 2 }; }

// procedural: this attribute is a FUNCTION CALL into a compiled, executed binary
// (the tokio proc-macro crate), which parses main's tokens and emits new tokens
#[tokio::main]
async fn main() {}
```
::

::code-wrapper{language="rust" filename="Cargo.toml"}
```toml
# a proc-macro crate is compiled to a native binary and EXECUTED by rustc
# during your build — this is why serde_derive shows up in build timings
[lib]
proc-macro = true

[dependencies]
syn = { version = "2", features = ["full"] }
quote = "1"
```
::

### Declarative expansion is textual substitution, not evaluation

::code-wrapper{language="rust"}
```rust
macro_rules! max_of {
    ($a:expr, $b:expr) => {
        if $a > $b { $a } else { $b }   // $b appears TWICE in this template
    };
}
// max_of!(f(), g()) expands to: if f() > g() { f() } else { g() }
// the branch that's NOT returned calls its function once —
// the branch that IS returned calls its function AGAIN to produce the value.
```
::

::code-wrapper{language="rust"}
```rust
// proof: side effects happen exactly as many times as the metavariable is written
macro_rules! show_twice { ($x:expr) => { println!("{} {}", $x, $x) }; }

fn side_effect() -> i32 { println!("called!"); 1 }

fn main() {
    show_twice!(side_effect());
    // prints "called!" TWICE, then "1 1" — $x expands to `side_effect()` at
    // both `#name` sites, there is no "compute once, substitute the value"
}
```
::

### Hygiene: syntax-context tagging, not scoping tricks

::code-wrapper{language="rust"}
```rust
macro_rules! using_tmp {
    ($e:expr) => {{
        let tmp = 42;       // this `tmp` is hygienic — tagged with the macro's context
        $e + tmp
    }};
}

fn main() {
    let tmp = 100;          // caller's `tmp` — a DIFFERENT identifier to the compiler
    let result = using_tmp!(tmp); // resolves to the caller's `tmp` (100), not the macro's
    println!("{result}");  // 142 — no collision, no shadowing, no leak either way
}
```
::

::code-wrapper{language="rust"}
```rust
// hygiene also means a macro CANNOT define a name for the caller to use implicitly —
// the caller must hand the name in explicitly:
macro_rules! define_var {
    ($name:ident, $val:expr) => { let $name = $val; };
}
fn main() {
    define_var!(x, 5);   // works — $name is passed in, not invented by the macro
    println!("{x}");
}
```
::

### Proc-macros: `syn` parses, `quote` re-emits — every call site, every time

::code-wrapper{language="rust" filename="lib.rs (proc-macro crate)"}
```rust
use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, DeriveInput};

#[proc_macro_derive(Describe)]
pub fn derive_describe(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput); // full syn::AST parse — not free
    let name = input.ident;
    quote! {
        impl #name {
            pub fn describe() -> &'static str { stringify!(#name) }
        }
    }
    .into() // re-emitted as tokens — this whole pipeline reruns per invocation site
}
```
::

::code-wrapper{language="rust"}
```rust
// 200 structs deriving this = 200 separate syn-parse + quote-emit executions
#[derive(Describe)] struct User;
#[derive(Describe)] struct Order;
// ...198 more — each one is a fresh run of the proc-macro binary, not a cached result
```
::

### `#[macro_export]` resolves at crate root regardless of nesting

::code-wrapper{language="rust"}
```rust
mod a {
    mod b {
        #[macro_export]
        macro_rules! deep_macro { () => { 1 }; }
    }
}

fn main() {
    let _ = crate::deep_macro!(); // NOT crate::a::b::deep_macro!() — nesting is invisible
}
```
::

## Cost, Performance, and Trade-Offs

| Macro type | Compile-time cost | Error message quality | Binary size impact | Maintenance cost |
|---|---|---|---|---|
| `macro_rules!` | Low — built into rustc | Often poor — confusing expansion-site spans | Zero — pure syntax substitution | Rises sharply with pattern complexity |
| Derive proc-macro | **High** — separate crate + `syn` parse, re-run per site | Usually good in mature crates (`serde_derive`) | Zero-to-low — same as hand-written impls | Low for consumers, high for authors |
| Attribute proc-macro | High, same drivers as derive | Variable — depends on author's span discipline | Depends entirely on injected code | Can be high — rewrites semantics non-obviously |
| Function-like proc-macro | High | Often worst — custom DSL errors are cryptic | Depends on generated code | High — maintaining a mini-language |
| `cargo expand` (dev tool) | N/A (dev-only) | N/A | N/A | Reduces macro *debugging* cost |

::code-wrapper{language="bash"}
```bash
# measure it instead of guessing — proc-macro crates often dominate clean builds
cargo build --timings
# open target/cargo-timings/cargo-timing.html and look for serde_derive, tokio-macros, etc.
```
::

::code-wrapper{language="rust"}
```rust
// naive recursive "count the args" macro — a classic pre-const-generics workaround
macro_rules! count {
    () => { 0 };
    ($head:expr $(, $tail:expr)*) => { 1 + count!($($tail),*) };
}
// count!(a, b, c, ..., z) with a few dozen args can hit the default recursion_limit (64)
// because EACH step is a full macro-expansion pass, not a cheap loop iteration
```
::

::code-wrapper{language="rust" filename="lib.rs"}
```rust
// the "fix" just moves the wall further out, at a real compile-time cost
#![recursion_limit = "256"]
```
::

## Production Failure Modes & Anti-Patterns

### Anti-pattern: double-evaluation of side-effecting arguments

::code-wrapper{language="rust"}
```rust
// BAD: a "convenience" macro that substitutes $a/$b more than once each
macro_rules! log_and_return_max {
    ($a:expr, $b:expr) => {
        if $a > $b {
            println!("returning a: {}", $a);
            $a
        } else {
            println!("returning b: {}", $b);
            $b
        }
    };
}

fn increment_and_get(counter: &mut i32) -> i32 { *counter += 1; *counter }

fn main() {
    let mut counter = 0;
    let result = log_and_return_max!(increment_and_get(&mut counter), 3);
    // counter is incremented TWICE if the else branch is taken
    println!("counter ended at {counter}, result was {result}");
}
```
::

In production this shows up as double-counted metrics, a rate limiter incrementing twice per request, or a billing call firing twice.

::code-wrapper{language="rust"}
```rust
// FIX: bind each :expr exactly once, let hygiene guarantee no caller collision
macro_rules! log_and_return_max {
    ($a:expr, $b:expr) => {{
        let a = $a;   // evaluated exactly once
        let b = $b;
        if a > b {
            println!("returning a: {a}");
            a
        } else {
            println!("returning b: {b}");
            b
        }
    }};
}
```
::

### Anti-pattern: a derive macro that silently changes semantics

::code-wrapper{language="rust"}
```rust
// BAD: every field's setter panics on invalid input, invisible from the derive's name
#[proc_macro_derive(AutoValidate)]
pub fn derive_auto_validate(input: TokenStream) -> TokenStream {
    let input = syn::parse_macro_input!(input as syn::DeriveInput);
    let name = &input.ident;
    quote::quote! {
        impl #name {
            pub fn set_email(&mut self, email: String) {
                if !email.contains('@') { panic!("invalid email"); }
                self.email = email;
            }
        }
    }.into()
}
```
::

::code-wrapper{language="rust"}
```rust
// usage, three modules away — no local sign this can panic:
#[derive(AutoValidate)]
struct User { email: String }

fn handle_request(user: &mut User, input: String) {
    user.set_email(input); // rustdoc doesn't expand macros — this panic is invisible here
}
```
::

::code-wrapper{language="rust"}
```rust
// FIX: fallible generated APIs, same convention as hand-written code, documented
quote::quote! {
    impl #name {
        /// Generated by `#[derive(AutoValidate)]`. Returns `Err` for an invalid
        /// email rather than panicking.
        pub fn set_email(&mut self, email: String) -> Result<(), String> {
            if !email.contains('@') { return Err(format!("invalid email: {email}")); }
            self.email = email;
            Ok(())
        }
    }
}.into()
```
::

### Anti-pattern: arm order silently shadows a more specific pattern

::code-wrapper{language="rust"}
```rust
// BAD: the general pattern is listed FIRST — the specific arm below is dead code
macro_rules! route {
    ($method:ident $path:literal => $handler:expr) => {
        println!("generic route: {} {}", stringify!($method), $path);
    };
    (GET $path:literal => $handler:expr) => {
        println!("GET-specific optimization path: {}", $path);   // NEVER REACHED
    };
}

fn main() {
    route!(GET "/health" => health_handler); // always hits the generic arm, silently
}
```
::

::code-wrapper{language="rust"}
```rust
// FIX: most-specific arm first — matched top-to-bottom, no unreachability lint exists
macro_rules! route {
    (GET $path:literal => $handler:expr) => {
        println!("GET-specific optimization path: {}", $path);
    };
    ($method:ident $path:literal => $handler:expr) => {
        println!("generic route: {} {}", stringify!($method), $path);
    };
}
```
::

::code-wrapper{language="rust"}
```rust
// guard against regression: a smoke test that fails if arm order breaks again
#[test]
fn get_uses_specific_arm() {
    // if the generic arm fires instead, this string won't match — cheap tripwire
    let output = format!("GET-specific optimization path: {}", "/health");
    assert!(output.contains("optimization"));
}
```
::

## Architectural Application

Macros should eliminate *mechanical* repetition a function can't express — not invent new control-flow syntax.

::code-wrapper{language="rust"}
```rust
// GOOD use: implementing the same trait mechanically across many types
macro_rules! impl_from_num {
    ($($t:ty),*) => {
        $(impl From<$t> for Meters {
            fn from(v: $t) -> Self { Meters(v as f64) }
        })*
    };
}
struct Meters(f64);
impl_from_num!(i32, i64, u32, u64, f32, f64); // one macro, six impls, zero duplication
```
::

::code-wrapper{language="rust"}
```rust
// BAD use: a bespoke control-flow DSL that hides ordinary logic behind macro syntax
macro_rules! when {
    ($cond:expr => $body:block else => $else_body:block) => {
        if $cond { $body } else { $else_body }
    };
}
// this is just `if`/`else` wearing a costume — go-to-definition, rust-analyzer
// hints, and every newcomer's mental model all get worse for zero benefit
```
::

::code-wrapper{language="bash"}
```bash
# mandatory review step for any new/changed macro used in more than a few places
cargo expand --lib my_module::routes > /tmp/expanded.rs
# diff this against the previous PR's expansion to catch unintended codegen changes
```
::

::code-wrapper{language="rust" filename="build_matrix.rs"}
```rust
// derive macros as the trait-impl layer of a domain model — centralize once
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Validate)]
struct CreateOrderRequest {
    #[validate(range(min = 1))]
    quantity: u32,
    #[validate(email)]
    customer_email: String,
}
// adding a field here updates serialization, validation, and Debug in one place —
// no hand-written impl anywhere to fall out of sync
```
::

## 💡 Tips & Tricks

- **Debug**: `cargo expand` shows fully expanded source after macros run.
  ::code-wrapper{language="bash"}
  ```bash
  cargo expand path::to::module > expanded.rs
  ```
  ::
- **Idiom**: prototype the macro's body as a plain function first, then parameterize.
  ::code-wrapper{language="rust"}
  ```rust
  // step 1: get this working and tested
  fn max_of(a: i32, b: i32) -> i32 { if a > b { a } else { b } }
  // step 2: only then wrap it in macro_rules! if genericity over syntax is needed
  ```
  ::
- **Debug**: `stringify!` captures literal source text for readable assertion messages.
  ::code-wrapper{language="rust"}
  ```rust
  macro_rules! check { ($cond:expr) => {
      if !$cond { panic!("assertion failed: {}", stringify!($cond)); }
  }; }
  check!(2 + 2 == 5); // panics with: assertion failed: 2 + 2 == 5
  ```
  ::
- **Idiom**: always allow a trailing comma in repetitions.
  ::code-wrapper{language="rust"}
  ```rust
  macro_rules! my_vec { ($($x:expr),* $(,)?) => { vec![$($x),*] }; }
  let v = my_vec![1, 2, 3,]; // trailing comma now compiles, matching vec! ergonomics
  ```
  ::
- **Performance**: broad derive usage is a measurable compile-time cost — profile it with `cargo build --timings` before assuming your own code is the bottleneck.
- **Debug**: raise the recursion limit only as a stopgap, not a fix.
  ::code-wrapper{language="rust"}
  ```rust
  #![recursion_limit = "256"] // treat this as a signal to redesign, not a permanent wall push
  ```
  ::
- **Idiom**: bind every multiply-referenced `:expr` to a local `let` first — the single most common fix for double-evaluation bugs.

## ⚠️ Edge Cases & Gotchas

- **Double-evaluation**: `($x:expr) => { $x + $x }` runs the caller's expression twice.
  ::code-wrapper{language="rust"}
  ```rust
  macro_rules! bad_square { ($x:expr) => { $x * $x }; }
  fn noisy() -> i32 { println!("called"); 3 }
  let n = bad_square!(noisy()); // prints "called" TWICE, n == 9
  ```
  ::
- **Follow-set restrictions**: `:expr` can't be followed by certain tokens — the resulting error ("local ambiguity", "no rules expected this token") doesn't name the real cause.
- **Hygiene blocks intentional variable injection** — `$name:ident` must be passed explicitly (see Mechanics above); a macro can't manufacture a name for the caller to use implicitly.
- **Arm order, no warning**: unlike `match`, `macro_rules!` has no unreachable-arm lint.
  ::code-wrapper{language="rust"}
  ```rust
  macro_rules! m { ($x:tt) => { "any" }; (42) => { "specific, but DEAD" }; }
  assert_eq!(m!(42), "any"); // compiles clean, silently skips the second arm
  ```
  ::
- **`#[macro_export]` ignores module nesting** — `my_crate::the_macro!()`, never `my_crate::a::b::the_macro!()`, regardless of where it's defined.
- **Proc-macro crates export macros only**: a `proc-macro = true` crate can't also expose a plain `pub fn` for normal `use`.
  ::code-wrapper{language="rust"}
  ```rust
  // in a proc-macro crate — this compiles but is UNUSABLE via `use my_macro_crate::helper`
  pub fn helper() -> i32 { 1 } // put shared logic in a separate non-proc-macro crate instead
  ```
  ::
- **Recursive counting macros hit the recursion limit early** — see the `count!` example under Cost/Performance; a few dozen items can exhaust the default limit of 64.

## 🧠 Spot the Bug

What's wrong with this macro, and what does calling it twice with a side-effecting argument reveal?

::code-wrapper{language="rust"}
```rust
macro_rules! max_of {
    ($a:expr, $b:expr) => {
        if $a > $b { $a } else { $b }
    };
}

fn noisy(n: i32) -> i32 {
    println!("evaluating {n}");
    n
}

fn main() {
    let result = max_of!(noisy(3), noisy(7));
    println!("result: {result}");
}
```
::

<details>
<summary>Answer</summary>

Output:
::code-wrapper{language="rust"}
```rust
evaluating 3
evaluating 7
evaluating 7
result: 7
```
::

The expansion is `if noisy(3) > noisy(7) { noisy(3) } else { noisy(7) }` — `$b` appears twice, so `noisy(7)` runs once for the comparison and again to produce the returned value. The call site looks like a single-evaluation function call; it isn't.

::code-wrapper{language="rust"}
```rust
// FIX
macro_rules! max_of {
    ($a:expr, $b:expr) => {{
        let a = $a;
        let b = $b;
        if a > b { a } else { b }
    }};
}
```
::

**The lesson**: `macro_rules!` substitutes expression fragments textually — an argument used more than once in the expansion is evaluated more than once, unless bound to a local first.

</details>

## Summary

::code-wrapper{language="rust"}
```rust
// declarative: fast, textual, no type info yet — but no double-eval or arm-order safety net
macro_rules! example { ($x:expr) => { $x }; }

// procedural: separately compiled + executed per crate, real syn::AST + quote:: codegen —
// powerful, but a genuine and compounding compile-time cost at workspace scale
#[proc_macro_derive(Example)]
pub fn derive_example(input: proc_macro::TokenStream) -> proc_macro::TokenStream { input }
```
::

Hygiene (syntax-context tagging) is real compiler machinery, not convention — it's why macros can't leak or capture caller identifiers by accident. Treat any non-trivial macro as generated code needing the same review discipline as hand-written code: `cargo expand` is what makes that discipline possible.

Next: Unsafe Rust — the five superpowers, what undefined behavior actually is, and how to keep it out of safe code.
