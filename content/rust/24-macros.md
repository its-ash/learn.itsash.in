# 24 — Macros

Macros generate code at compile time. Rust has two kinds:

1. **Declarative macros** (`macro_rules!`): pattern-matching code generators.
2. **Procedural macros**: real Rust functions that consume/produce token streams (custom derive, attribute, function-like).

## Why Macros?

### Why they must exist

Rust has **no function overloading and no variadic generics**, so several common patterns can't be expressed as regular functions: `println!` (variadic arguments + compile-time format checking), `vec!` (variadic values), `format!`, `assert_eq!`. Macros fill this gap by **expanding at compile time, before the type checker runs** — they generate code at the AST level, so they can take any number of arguments of any type and emit code the type checker then validates. This is why `println!("{}", x)` is a macro not a function: a function can't take a format string and a variadic list of values and check them at compile time.

Macros also reduce **boilerplate** (derive macros auto-generate trait impls) and enable **DSLs** (`html!` in yew, `sql!` in sqlx). The cost: macros operate before type checking, so error messages can be opaque, and they can't see generic bounds. Reach for a macro only when a regular function or trait can't do the job (variadic args, compile-time codegen, custom syntax).

- Variadic arguments (`println!`, `vec!`).
- Compile-time string interpolation (format strings are checked).
- Reducing boilerplate (derive macros).
- DSLs (`html!` in `yew`).

Macros run **before** the type checker — they expand into AST, which is then type-checked.

## Declarative Macros: `macro_rules!`

::code-wrapper{language="rust"}
```rust
macro_rules! vec_of {
    ($($x:expr),*) => {{
        let mut v = Vec::new();
        $( v.push($x); )*
        v
    }};
}

let v = vec_of!(1, 2, 3);
```
::

### Macro Syntax

### What each fragment specifier captures

Fragment specifiers define **what kind of syntax tree the metavariable matches** — they're the macro's type system. The choice matters because it controls both flexibility and parsing:

- `:expr` — a complete expression (e.g., `1 + 2`, `foo()`). Most permissive for values, but the greediest — it captures the whole expression, so `:expr,` can't tell if the `,` is a separator or part of the expression. This is why `:expr` has strict **follow rules** (below).
- `:ident` — a single identifier (variable/type names). Use when you want a name to bind or pass along.
- `:ty` — a type. Use when a macro takes a type parameter (e.g., `vec_of!<T>`).
- `:tt` — a **single token tree** (any single token or balanced `<...>`/`(...)`/`{...}`/`[...]`). The most flexible — `:tt` can be re-parsed later, making it the basis for incremental/macro-lib parsing. But it matches *one* token tree at a time, so you need repetition to capture a list.
- `:item`, `:pat`, `:stmt`, `:literal`, `:vis`, `:lifetime`, `:block`, `:path`, `:meta` — more specialized; see the reference.

**When to choose which**: `:expr` for values (simplest); `:tt` when you need maximum flexibility (parsing a custom DSL incrementally); `:ident` for names; `:ty` for types. The greedier the specifier, the more constrained its follow rules (to avoid ambiguity).

- `$name`: a "metavariable".
- `:expr`, `:ident`, `:ty`, `:tt`, `:item`, `:pat`, `:stmt`, `:literal`, `:vis`, `:lifetime`, `:block`, `:path`, `:meta`, `:expr_2021` — fragment types.
- `$(...)*` repeats zero or more; `$(...)+` repeats one or more; `$(...)?` optional.
- Multiple arms separated by `;`, first match wins (top to bottom).

### Example: a `hashmap!` macro

::code-wrapper{language="rust"}
```rust
macro_rules! hashmap {
    ($( $key:expr => $val:expr ),* $(,)?) => {{
        let mut m = std::collections::HashMap::new();
        $(
            m.insert($key, $val);
        )*
        m
    }};
}
let m = hashmap!("a" => 1, "b" => 2);
```
::

### Repetition Specifiers

::code-wrapper{language="rust"}
```rust
macro_rules! sum {
    ($($x:expr),*) => { 0 $(+ $x)* };
    ($first:expr $(, $rest:expr)*) => { $first $(+ $rest)* };
}
```
::

Two arms handle empty/one/many. The first arm matches the empty case (sum of nothing = 0). The `$(+ $x)*` expands to `+ $x` repeated.

### Fragment Capturing and Follow Rules

### How the macro parser works and why follow rules exist

The macro parser is **greedy**: it matches as much as it can against a fragment specifier. `:expr` swallows a *complete* expression — including constructs that could *continue* (like `;` ending a statement, or `=>` separating arms). After matching a `:expr`, the parser then looks for the *next* token in the pattern; but because `:expr` greedily consumed everything valid, it's ambiguous whether a following `;` is part of the captured expression or the macro's separator. The **follow rules** resolve this by declaring which tokens may legally follow each fragment type — `:expr` may be followed by `=>` (clearly not part of the expression) but **not** by `;` (could be a statement separator or part of the expr). When you hit a follow-rule error, the fix is usually a workaround: use `$(,)?` for trailing commas, switch to `:tt` with manual parsing, or restructure the macro to avoid the ambiguous token.

Each fragment type has rules about what can follow it (because the parser is ambiguous otherwise). E.g., `:expr` followed by `=>` is OK, but `:expr` followed by `;` is not (because `;` could be part of the expression). Common workaround: use `$(,)?` for trailing commas.

### Hygiene

Macro-introduced identifiers don't collide with caller identifiers:

::code-wrapper{language="rust"}
```rust
macro_rules! swap {
    ($a:expr, $b:expr) => {
        let tmp = $a;     // 'tmp' is hygienic — won't clash with caller's tmp
        $a = $b;
        $b = tmp;
    };
}
let mut a = 1; let mut b = 2;
swap!(a, b);
```
::

### `macro_export`

### Why the placement quirk exists

`macro_rules!` macros are **resolved at the crate root** because they expand *before* the module system is fully finalized — there's no module path for them yet. `#[macro_export]` exploits this: regardless of *where* in the module tree you define the macro, it's placed at the crate root for both internal and external use. This is why a macro defined in `mod a::b` is called as `my_crate::my_macro!()`, not `my_crate::a::b::my_macro!()` — the nesting is invisible to callers. You reach for `#[macro_export]` when you want a macro usable outside its defining module (or by downstream crates); use `pub use` to re-export it under a different path if you want it visible at a non-root location.

::code-wrapper{language="rust"}
```rust
#[macro_export]
macro_rules! my_macro {
    ($x:expr) => { /* ... */ };
}
```
::

`#[macro_export]` makes the macro available crate-wide and externally (placed at crate root, regardless of where it's defined).

### Re-Exporting

::code-wrapper{language="rust"}
```rust
pub use crate::my_macro;
```
::

### Importing

::code-wrapper{language="rust"}
```rust
use my_crate::my_macro;
```
::

In edition 2018+, macros are imported via `use` like any item.

## `vec!` and `println!` Internals

`vec!` matches several patterns:

::code-wrapper{language="rust"}
```rust
macro_rules! vec {
    () => ($crate::Vec::new());
    ($elem:expr; $n:expr) => ($crate::vec::from_elem($elem, $n));
    ($($x:expr),+ $(,)?) => ([$($x),+].into_iter().collect());
}
```
::

`println!` parses the format string and expands into `std::io::_print(format_args!(...))`. Format args are validated at compile time.

## Common Built-in Macros

- `println!`, `eprintln!`, `print!`, `eprint!`, `format!`, `write!`, `writeln!`
- `vec!`, `format_args!`
- `panic!`, `unreachable!`, `todo!`, `unimplemented!`
- `assert!`, `assert_eq!`, `assert_ne!`, `debug_assert!`
- `matches!`, `cfg!`, `env!`, `option_env!`, `include!`, `include_str!`, `include_bytes!`
- `concat!`, `stringify!`, `file!`, `line!`, `column!`, `module_path!`
- `cfg`, `cfg_attr`
- `write!`, `writeln!`

## Procedural Macros

### When to reach for each flavor

Procedural macros run real Rust code (a separate crate of type `proc-macro = true`). Three flavors, each for a distinct use:

- **Derive** (`#[derive(MyTrait)]`): the most common. Generate a trait impl from a struct/enum. Reach for this when you want users to "derive" your trait (`#[derive(Serialize)]`, `#[derive(Debug)]`) — it's the ergonomic, well-understood form.
- **Attribute** (`#[my_attr]`): transforms the annotated item — add fields, rewrite the function, inject code. Reach for this when you need to *modify* existing items (e.g., `#[tokio::main]` rewrites `async fn main` into a runtime setup, `#[tracing::instrument]` adds span instrumentation).
- **Function-like** (`custom_macro!(...)`): custom syntax that isn't a derive or attribute. Reach for this for DSLs (`html!`, `sql!`) or when you need parsing a function can't express. Least common of the three.

1. **Function-like** (custom `macro!` syntax): `custom_macro!(...)`.
2. **Derive**: `#[derive(MyTrait)]`.
3. **Attribute**: `#[my_attr]`.

### Setup

::code-wrapper{language="text"}
```text
my_crate/
├── Cargo.toml           # the user-facing crate
└── my_crate_derive/     # the proc-macro crate
    └── Cargo.toml       # [lib] proc-macro = true
```
::

Proc-macro crates must be separate and have `proc-macro = true` in `[lib]`.

### Function-Like Example (using `syn`/`quote`)

::code-wrapper{language="rust"}
```rust
// my_crate_derive/src/lib.rs
use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, ItemStruct};

#[proc_macro]
pub fn make_hello(_item: TokenStream) -> TokenStream {
    "fn hello() { println!(\"hi\"); }".parse().unwrap()
}
```
::

Usage:

::code-wrapper{language="rust"}
```rust
use my_crate_derive::make_hello;
make_hello!();
hello();
```
::

### Derive Example

::code-wrapper{language="rust"}
```rust
#[proc_macro_derive(Hello)]
pub fn derive_hello(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as ItemStruct);
    let name = &input.ident;
    let expanded = quote! {
        impl #name {
            fn hello() { println!("Hello from {}", stringify!(#name)); }
        }
    };
    expanded.into()
}
```
::

Usage:

::code-wrapper{language="rust"}
```rust
#[derive(Hello)]
struct Foo;
Foo::hello();
```
::

### Derive with Helper Attributes

::code-wrapper{language="rust"}
```rust
#[proc_macro_derive(Hello, attributes(hello_name))]
pub fn derive_hello(input: TokenStream) -> TokenStream { /* ... */ }

// user:
#[derive(Hello)]
#[hello_name = "Bar"]
struct Foo;
```
::

### Attribute Macros

::code-wrapper{language="rust"}
```rust
#[proc_macro_attribute]
pub fn log_calls(attr: TokenStream, item: TokenStream) -> TokenStream { /* ... */ }
```
::

Receives both the attribute arguments and the item being annotated.

### Helper Crates

### How they fit together

Writing a proc-macro from scratch is a pipeline: **`syn` parses** the input token stream into a typed AST (e.g., `ItemStruct`), **you transform** that AST (extract fields, read attributes, build the generated code), and **`quote` emits** the result back as a token stream (the `quote!` macro splices Rust values into code with `#name`-style interpolation). `proc-macro2` is the stable-API shim (the `proc_macro` crate's types are only available inside a proc-macro crate; `proc-macro2` lets you write reusable parsing logic). Reach for **`darling`** when your derive has complex attributes (it parses `#[derive(MyTrait, helper = "value")]` ergonomically, saving you manual `syn` attribute walking). Reach for **`proc-macro-error`** when you want good error messages (it lets you emit span-located errors instead of panicking).

- `syn`: parse Rust syntax.
- `quote`: build TokenStreams with `quote!` macro.
- `proc-macro2`: works with stable Rust (proc_macro types are unstable-only).
- `darling`: ergonomic derive attribute parsing.
- `proc-macro-error`: better error reporting.

## Built-in Derives

::code-wrapper{language="rust"}
```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
struct Foo { /* ... */ }
```
::

These are built into the compiler.

## Macro Pitfalls

- **Order of arms**: declarative macros match top-to-bottom. Specific patterns must come before general ones.
- **Hygiene surprises**: macro-introduced variables are isolated; sometimes you want unhygienic behavior (rare).
- **Expression vs statement fragments**: `:expr` captures the whole expression and double-evaluates if used multiple times. Use a `let` binding inside the macro to evaluate once.
- **Recursion**: `macro_rules!` recursion is limited (default 64 deep; can be raised via `#![recursion_limit = "256"]`).
- **Debugging macros**: `cargo expand` (install with `cargo install cargo-expand`) shows the expanded code.
- **Compile time**: heavy macros (especially proc-macros like `serde`) slow compilation.
- **`proc-macro` crate isolation**: a proc-macro crate can't export anything else; it's a separate compilation unit.
- **Span info**: `quote!`'s default spans can produce confusing errors. Use `syn`'s spans carefully.
- **Macro in `pub use`**: ensure you re-export macros from a top-level module.
- **`#[macro_export]` placement**: places the macro at the crate root regardless of where it's defined.

## `cargo expand`

::code-wrapper{language="bash"}
```bash
cargo install cargo-expand
cargo expand
```
::

Prints the post-macro-expansion source. Invaluable for debugging declarative and proc-macros.

## When to Use a Macro vs a Function

Use a macro when:
- You need variadic arguments.
- You need to take types as arguments.
- You need to generate code based on structure (e.g., derive).
- You need compile-time string parsing (format strings).

Otherwise, use a function (simpler, easier to debug, type-checks better).

## 💡 Tips & Tricks

- **Debug**: `cargo expand` is the single most useful tool for macros — it shows the fully expanded source after both declarative and procedural macros run, turning "why doesn't this compile" into a readable diff.
- **Idiom**: write a macro's body once as a normal function/block first, get it working, *then* parameterize it into `macro_rules!` — debugging macro expansion errors is much harder than debugging plain code.
- **Debug**: `stringify!($expr)` inside a macro captures the *literal source text* of an argument as a string — useful for building assertion macros that print "expected `x > 0`, got -5" style messages.
- **Idiom**: always add a trailing `$(,)?` to comma-repeated macro patterns (`$($x:expr),* $(,)?`) so callers can use a trailing comma, matching the ergonomics of `vec![1, 2, 3,]`.
- **Performance**: heavy proc-macro usage (especially derive macros like `serde`'s) meaningfully slows incremental compile times — `cargo build --timings` shows which crates dominate build time, often revealing proc-macro-heavy dependencies as the bottleneck.
- **Debug**: raise `#![recursion_limit = "256"]` at the crate root when a deeply recursive `macro_rules!` hits the default 64-deep limit — the error message tells you exactly this, but it's easy to miss among other diagnostics.

## ⚠️ Edge Cases & Gotchas

- **`:expr` fragments double-evaluate side effects**: a macro that references `$x` more than once in its expansion, like `($x:expr) => { $x + $x }`, evaluates the caller's expression twice — `my_macro!(expensive_call())` runs `expensive_call()` twice, not once, which is invisible from the call site.
- **Fragment "follow set" restrictions cause confusing parse errors**: `:expr` cannot be followed by certain tokens (like a bare `;` in some positions) because the grammar would be ambiguous — the compiler error mentions "local ambiguity" or "no rules expected this token," which doesn't obviously point back to the fragment-follow restriction.
- **Hygiene means macro-internal `let` bindings never leak**: a macro that does `let tmp = $a;` internally can't have `tmp` accidentally shadow or be shadowed by a caller's own `tmp` variable — but this also means a macro *cannot* intentionally introduce a variable that the call site is meant to use, which trips up anyone trying to write a "define a variable for me" macro in `macro_rules!` (this requires `$name:ident` passed explicitly instead).
- **Arm order matters and is easy to get backwards**: `macro_rules!` tries arms top-to-bottom and commits to the first structural match — a general catch-all pattern placed before a more specific one will shadow it silently (no error), unlike `match` exhaustiveness checks which at least warn about unreachable arms in some cases.
- **`#[macro_export]` places the macro at the crate root regardless of module nesting**: a macro defined deep inside `mod a { mod b { macro_rules! ... } } ` with `#[macro_export]` is usable as `my_crate::the_macro!()`, not `my_crate::a::b::the_macro!()` — the nesting is invisible to callers, which surprises people expecting normal path-based visibility.
- **Proc-macro crates cannot export anything but macros**: a `proc-macro = true` crate can't also expose regular `pub fn`s usable from a normal `use` — helper logic needs to live in a separate, non-proc-macro crate that both the macro crate and its consumers depend on.
- **Platform-independent trap — recursive macro state accumulation**: a `macro_rules!` "counting" macro that recurses to compute a length (a common workaround for lack of const-eval in old macros) can hit the recursion limit on inputs that look small (a few dozen items) because each repetition step is a full macro expansion, not a cheap loop iteration.

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

`noisy(7)` prints twice, not once. The macro expands to `if noisy(3) > noisy(7) { noisy(3) } else { noisy(7) }` — each `$a`/`$b` metavariable is substituted **textually, at every point it appears** in the expansion template. Since `$b` appears twice (once in the comparison, once in the `else` branch), and the `else` branch is the one taken (7 > 3), `noisy(7)` genuinely runs twice: once for the comparison, once to produce the result. This is invisible at the call site — `max_of!(noisy(3), noisy(7))` looks like each argument is evaluated once, the way a normal function call would guarantee.

The fix is to bind each argument to a local variable exactly once inside the expansion, exploiting hygiene to avoid caller collisions:

::code-wrapper{language="rust"}
```rust
macro_rules! max_of {
    ($a:expr, $b:expr) => {{
        let a = $a;
        let b = $b;
        if a > b { a } else { b }
    }};
}
```
::

**The lesson**: `macro_rules!` substitutes expression fragments textually — an argument used more than once in the expansion is evaluated more than once, unless you bind it to a local first.

</details>

## Summary

- Declarative macros (`macro_rules!`) pattern-match and emit code; hygiene prevents name collisions.
- Proc-macros (separate `proc-macro = true` crate) write real code: derive, attribute, function-like.
- `cargo expand` is essential for debugging.
- Use macros sparingly — they're powerful but add compile-time cost and complexity.

Next: Unsafe Rust.