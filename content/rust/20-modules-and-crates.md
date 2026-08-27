# 20 — Modules, Crates, Packages & Paths

Rust's module system controls visibility, organization, and namespacing.

## Definitions

- **Package**: a Cargo project (a `Cargo.toml` + one or more crates).
- **Crate**: a compilation unit (binary or library). Root file (`main.rs`/`lib.rs`).
- **Module**: a named scope inside a crate. Controls visibility.
- **Path**: how you reference an item (`crate::foo::bar`).

## Module Declaration

### Why the module system exists

Rust's module system **separates code organization from file layout**: a module is a named *scope* that controls visibility, and the file system is one (of several) ways to *provide* the module's contents. This decoupling means the same logical structure (`crate::network::server`) can live in one file or several, and you reorganize without rewriting paths. You split code into modules when a single file gets too large, when you want to enforce visibility boundaries (a public API surface backed by private internals), or when logical groupings (network, ui, db) make the codebase navigable. Reach for modules when "one file" stops scaling; keep one file when the code is small enough to grasp at once.

::code-wrapper{language="rust"}
```rust
// src/lib.rs
mod network;
mod ui {
    pub mod window;
    pub mod button;
}
```
::

`mod network;` looks for `network.rs` or `network/mod.rs` (legacy) and includes it as a submodule.

## File Layout Conventions (2018+)

::code-wrapper{language="text"}
```text
src/
├── lib.rs            // crate root: `pub mod ...`
├── main.rs
├── network.rs        // corresponds to `mod network;`
└── network/
    └── server.rs     // corresponds to `mod server;` *inside* network.rs
```
::

The 2018 edition prefers `network.rs` over `network/mod.rs`. Don't mix the two for the same module.

## `use` — Importing

### When to use each path form

Rust deliberately doesn't **auto-import** anything (no global prelude beyond `std::prelude`) — every import is explicit so you always know where a name comes from. The path forms differ by *what they're relative to*:

- **`crate::`** — absolute from the crate root. Use when you want a stable path that doesn't change if you move the *current* file (the path is anchored to the crate, not the file's location).
- **`super::`** — one module up (the parent). Use for siblings in the same parent module, but be aware it's *relative*: moving the file changes what `super::` resolves to.
- **`self::`** — the current module. Rare; mostly for disambiguation or for items defined in the same file you're importing into a nested scope.

Reach for `crate::` in larger projects (it's stable under file moves); `super::` is fine for tightly-coupled sibling modules that move together. Aliasing (`as`) is for resolving name conflicts or shortening verbose paths.

::code-wrapper{language="rust"}
```rust
use std::collections::HashMap;
use std::io::{self, Read, Write};   // bring multiple items
use std::io::Read as IoRead;        // alias
use crate::network::server;          // absolute path from crate root
use super::sibling;                  // one module up
use self::inner;                     // current module
```
::

### Glob Imports

::code-wrapper{language="rust"}
```rust
use std::io::prelude::*;            // rare; usually too broad
use crate::network::*;               // bring all public items
```
::

Avoid glob imports except for preludes.

## `pub use` — Re-exports

::code-wrapper{language="rust"}
```rust
// lib.rs
pub mod api;
pub use api::Client;   // re-export so users can `use my_crate::Client`
```
::

Re-export is the standard way to flatten the public API and hide internal structure.

## Paths and `crate`, `self`, `super`

- `crate::` — absolute from crate root.
- `self::` — current module.
- `super::` — parent module.

::code-wrapper{language="rust"}
```rust
// in src/network/server.rs
use super::connection;     // src/network/connection.rs
use crate::network::connection;   // same, explicit
```
::

## Visibility

::code-wrapper{language="rust"}
```rust
pub fn public_fn() {}            // visible everywhere
fn private_fn() {}                // visible only in this module
pub(crate) fn internal() {}       // visible within this crate only
pub(super) fn for_parent() {}     // visible in parent module
pub(in path) fn scoped() {}       // visible in a specific module path
```
::

Fields and variants have their own visibility:

::code-wrapper{language="rust"}
```rust
pub struct User {
    pub name: String,
    email: String,       // private — only this module can construct/modify
}
```
::

Enums' variants inherit the enum's visibility by default; you can override per-variant.

## Struct Visibility

### Why private fields matter

A `pub` struct with **private fields** is the foundation of Rust's encapsulation/newtype pattern: external code can *use* the type (call its methods, pass it around) but can't **construct** it with literal syntax or **access** the private fields directly. This lets the module enforce **invariants** — only the module's own constructor/methods can build a valid instance, so you can't accidentally create an invalid state from outside. This is how newtypes preserve their guarantees: the constructor is a method that validates, not a public struct literal. Without private fields, any caller could construct a `User { email: "garbage" }` bypassing your validation.

A struct can be `pub` but have private fields — external code can't construct it with literal syntax or access private fields, but can use it via methods. This is how newtypes preserve invariants.

## Module Path Items

- Modules
- Functions
- Structs/Enums/Types
- Constants/Statics
- `use` statements
- Macros (via `macro_rules!` and `pub use`)

## Submodules and Privacy

### How the privacy model works

Rust's privacy is **per-module-tree**, not hierarchical in the OOP sense. The rule: an item is visible within its own module and all its **descendants** — a child can see its parent's private items, but a parent *cannot* see a child's private items unless the child marks them `pub`. This is the opposite of "private = only this class." The conceptual basis: a child module is a more-specific piece of the parent's implementation, so it's trusted with the parent's internals; the parent, being more general, isn't automatically trusted with the child's specifics. `pub` opens an item up the tree to ancestors and beyond. This is why `pub(crate)` exists for the common case of "internal to this crate but not exposed to users."

A child module can access anything in its parent (privacy is per-module-tree, with `pub` opening it up). Children can use private items of parents and ancestors.

## `pub` Items and `#[doc(hidden)]`

`#[doc(hidden)]` hides an item from docs while keeping it `pub` (used for internal macros or re-exports you don't want users to call directly).

## Crates Within a Package

::code-wrapper{language="toml"}
```toml
# Cargo.toml
[lib]
name = "my_lib"
path = "src/lib.rs"

[[bin]]
name = "my_app"
path = "src/main.rs"
```
::

A package can have many binaries and at most one library. Binaries can use the library via `use my_lib::...`.

## External Crates

::code-wrapper{language="toml"}
```toml
# Cargo.toml
[dependencies]
serde = "1.0"
```
::

::code-wrapper{language="rust"}
```rust
use serde::Serialize;     // external crates are in the extern prelude
```
::

In edition 2018+, you don't need `extern crate serde;` — `use` finds it.

## Workspaces

### When to use a workspace

A workspace lets multiple crates share a single `target/` (disk + compile-time savings), a single `Cargo.lock` (unified dependency versions across crates), and unified dependency declarations via `[workspace.dependencies]`. You reach for a workspace when you have **multiple related crates** evolving together: a multi-crate library (core + derive + macros), a monorepo (app + shared internal libs), or a project with separate binary/library/tooling crates. Keep a single crate when there's only one publishable unit — a workspace adds structure you don't need. Members can depend on each other via `path = "../core"` and stay in sync during local development.

::code-wrapper{language="toml"}
```toml
# Cargo.toml
[workspace]
members = ["crates/api", "crates/cli", "crates/core"]
```
::

Members can depend on each other via `path = "../core"`. Shared `Cargo.lock` and `target/` directory.

## Macros Across Modules

### Why macros need special export treatment

`macro_rules!` macros are **resolved at a different compilation stage** than items — they expand *before* the module system is fully finalized, so the normal `pub` visibility rules don't apply to them by default. `#[macro_export]` opts a macro into crate-wide (and external) visibility by placing it at the **crate root** regardless of where it's defined. You reach for `#[macro_export]` when you want users of your crate (or other modules within it) to invoke your macro by path (`crate::my_macro!` or `my_crate::my_macro!`). Use `pub use my_macro;` to re-export it under a different module path if you want it visible at a non-root location.

`macro_rules!` macros need `#[macro_export]` to be used outside their defining module:

::code-wrapper{language="rust"}
```rust
#[macro_export]
macro_rules! my_macro { /* ... */ }
```
::

They're exported at the crate root. Use `pub use my_macro;` to re-export.

## Module Organization Patterns

### Library + Binaries

::code-wrapper{language="text"}
```text
my_project/
├── Cargo.toml
├── src/
│   ├── lib.rs       # public API
│   └── bin/
│       ├── server.rs
│       └── client.rs
```
::

### Feature-Gated Modules

::code-wrapper{language="rust"}
```rust
#[cfg(feature = "json")]
pub mod json;
```
::

### Tests Inline and Separate

::code-wrapper{language="rust"}
```rust
// src/lib.rs
pub fn add(a: i32, b: i32) -> i32 { a + b }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_add() { assert_eq!(add(1, 2), 3); }
}
```
::

Integration tests live in `tests/` as separate crate:

::code-wrapper{language="text"}
```text
tests/
└── integration.rs
```
::

## 💡 Tips & Tricks

- **Idiom**: expose a `pub mod prelude { pub use ...; }` module for crates with many commonly-used types — it gives consumers a one-line `use my_crate::prelude::*;` without forcing a broad glob import of your entire public API.
- **Debug**: `cargo modules generate tree` (via `cargo install cargo-modules`) prints your crate's actual module hierarchy as a tree — useful for spotting an accidental `mod.rs`/`module.rs` duplicate or a module nested deeper than intended.
- **Idiom**: use `pub(crate)` liberally for anything shared between your own modules but not meant for external consumers — it documents intent precisely, unlike `pub` (too open) or private (too restrictive for cross-module internal use).
- **Debug**: "private type in public interface" errors point at real API design problems, not just visibility — if a public function needs to return a private type, either make the type `pub` deliberately or restructure so the function returns a public trait/wrapper instead.
- **Idiom**: keep re-exports (`pub use`) in one clearly-named place (often `lib.rs` or a dedicated `prelude` module) rather than scattered across many files — it gives you a single file to scan when auditing exactly what your crate's public surface looks like.
- **Debug**: `cargo doc --open` is a fast way to sanity-check what's *actually* publicly visible from outside your crate — rustdoc only shows `pub` items reachable from the crate root, so it's an accurate mirror of what consumers see, unlike scanning source files by eye.

## ⚠️ Edge Cases & Gotchas

- **`pub` doesn't propagate to ancestors**: a `pub mod` is public *if its parent is also accessible*. Privacy is layered.
- **`pub use` ambiguity**: re-exporting two items with the same name into the same scope is an error.
- **Module path and item name conflicts**: `mod foo;` and `use crate::foo;` are different things.
- **`#[non_exhaustive]`** prevents exhaustive construction outside the crate.
- **Private items in `pub` functions**: a public function can't have private types in its signature (e.g., `pub fn get() -> PrivateType` is an error — leaks private type).
- **`extern crate self as foo;`**: lets you refer to your own crate by name (rare).
- **Hidden `mod.rs`**: still works but is discouraged; the new layout is cleaner.
- **`pub use` for preludes**: many crates expose `pub mod prelude { pub use ...; }` for one-line imports.

## 🧠 Spot the Bug

Why does this fail to compile, given that `Config` is clearly used successfully inside the crate?

::code-wrapper{language="rust"}
```rust
mod settings {
    struct Config {
        pub host: String,
    }

    impl Config {
        pub fn new(host: &str) -> Self {
            Config { host: host.to_string() }
        }
    }
}

pub fn load_config() -> settings::Config {
    settings::Config::new("localhost")
}
```
::

<details>
<summary>Answer</summary>

`error[E0446]: private type \`settings::Config\` in public interface`.

The `Config` struct itself is declared without `pub` (`struct Config`, not `pub struct Config`) — it's private to the `settings` module, even though its `host` field and `new` associated function are marked `pub`. Marking members `pub` doesn't make the *containing type* public; visibility is checked at every level independently. The function `load_config` is declared `pub fn load_config() -> settings::Config`, which means any external crate calling it would receive a value of type `settings::Config` — but that type is private, so external code couldn't even name it, store it in a variable with an explicit type, or reference it in their own function signatures. Rust refuses to compile this contradiction: a public function cannot expose a private type in its signature, because doing so would create a type that callers can receive but can't meaningfully use or refer to.

The fix is to make the struct itself `pub` (in addition to whichever fields/methods should be public):

::code-wrapper{language="rust"}
```rust
mod settings {
    pub struct Config {
        pub host: String,
    }
    // ...
}
```
::

**The lesson**: `pub` on a struct's fields or methods does not make the struct type itself public — a public function cannot return (or accept) a type that is private, and each level of visibility (module, type, field, method) is checked independently.

</details>

## Best Practices

- One responsibility per module.
- Hide internals; expose minimal API.
- Use `pub use` to flatten the surface.
- Test files live alongside source (`#[cfg(test)] mod tests`).
- Re-export crates you wrap so users don't need direct deps (`pub use serde;`).
- Don't go too deep — 3 levels is usually enough.

## Summary

Modules organize code; `pub` controls visibility; `use` brings items into scope; `crate`/`super`/`self` form absolute/relative paths; `pub use` re-exports flatten APIs. Files and modules are connected but distinct — the 2018 edition simplified the file/module mapping.

Next: Cargo features, build scripts, and release engineering.