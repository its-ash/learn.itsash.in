# 24 — Macros

Macros generate code at compile time. Rust has two kinds:

1. **Declarative macros** (`macro_rules!`): pattern-matching code generators.
2. **Procedural macros**: real Rust functions that consume/produce token streams (custom derive, attribute, function-like).

## Why Macros?

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

Procedural macros run real Rust code (a separate crate of type `proc-macro = true`). Three flavors:

1. **Function-like** (custom `macro!` syntax): `custom_macro!(...)`.
2. **Derive**: `#[derive(MyTrait)]`.
3. **Attribute**: `#[my_attr]`.

### Setup

```
my_crate/
├── Cargo.toml           # the user-facing crate
└── my_crate_derive/     # the proc-macro crate
    └── Cargo.toml       # [lib] proc-macro = true
```

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

## Summary

- Declarative macros (`macro_rules!`) pattern-match and emit code; hygiene prevents name collisions.
- Proc-macros (separate `proc-macro = true` crate) write real code: derive, attribute, function-like.
- `cargo expand` is essential for debugging.
- Use macros sparingly — they're powerful but add compile-time cost and complexity.

Next: Unsafe Rust.