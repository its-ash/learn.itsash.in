# 20 — Modules, Crates, Packages & Paths

Rust's module system controls visibility, organization, and namespacing.

## Definitions

- **Package**: a Cargo project (a `Cargo.toml` + one or more crates).
- **Crate**: a compilation unit (binary or library). Root file (`main.rs`/`lib.rs`).
- **Module**: a named scope inside a crate. Controls visibility.
- **Path**: how you reference an item (`crate::foo::bar`).

## Module Declaration

```rust
// src/lib.rs
mod network;
mod ui {
    pub mod window;
    pub mod button;
}
```

`mod network;` looks for `network.rs` or `network/mod.rs` (legacy) and includes it as a submodule.

## File Layout Conventions (2018+)

```
src/
├── lib.rs            // crate root: `pub mod ...`
├── main.rs
├── network.rs        // corresponds to `mod network;`
└── network/
    └── server.rs     // corresponds to `mod server;` *inside* network.rs
```

The 2018 edition prefers `network.rs` over `network/mod.rs`. Don't mix the two for the same module.

## `use` — Importing

```rust
use std::collections::HashMap;
use std::io::{self, Read, Write};   // bring multiple items
use std::io::Read as IoRead;        // alias
use crate::network::server;          // absolute path from crate root
use super::sibling;                  // one module up
use self::inner;                     // current module
```

### Glob Imports

```rust
use std::io::prelude::*;            // rare; usually too broad
use crate::network::*;               // bring all public items
```

Avoid glob imports except for preludes.

## `pub use` — Re-exports

```rust
// lib.rs
pub mod api;
pub use api::Client;   // re-export so users can `use my_crate::Client`
```

Re-export is the standard way to flatten the public API and hide internal structure.

## Paths and `crate`, `self`, `super`

- `crate::` — absolute from crate root.
- `self::` — current module.
- `super::` — parent module.

```rust
// in src/network/server.rs
use super::connection;     // src/network/connection.rs
use crate::network::connection;   // same, explicit
```

## Visibility

```rust
pub fn public_fn() {}            // visible everywhere
fn private_fn() {}                // visible only in this module
pub(crate) fn internal() {}       // visible within this crate only
pub(super) fn for_parent() {}     // visible in parent module
pub(in path) fn scoped() {}       // visible in a specific module path
```

Fields and variants have their own visibility:

```rust
pub struct User {
    pub name: String,
    email: String,       // private — only this module can construct/modify
}
```

Enums' variants inherit the enum's visibility by default; you can override per-variant.

## Struct Visibility

A struct can be `pub` but have private fields — external code can't construct it with literal syntax or access private fields, but can use it via methods. This is how newtypes preserve invariants.

## Module Path Items

- Modules
- Functions
- Structs/Enums/Types
- Constants/Statics
- `use` statements
- Macros (via `macro_rules!` and `pub use`)

## Submodules and Privacy

A child module can access anything in its parent (privacy is per-module-tree, with `pub` opening it up). Children can use private items of parents and ancestors.

## `pub` Items and `#[doc(hidden)]`

`#[doc(hidden)]` hides an item from docs while keeping it `pub` (used for internal macros or re-exports you don't want users to call directly).

## Crates Within a Package

```toml
# Cargo.toml
[lib]
name = "my_lib"
path = "src/lib.rs"

[[bin]]
name = "my_app"
path = "src/main.rs"
```

A package can have many binaries and at most one library. Binaries can use the library via `use my_lib::...`.

## External Crates

```toml
# Cargo.toml
[dependencies]
serde = "1.0"
```

```rust
use serde::Serialize;     // external crates are in the extern prelude
```

In edition 2018+, you don't need `extern crate serde;` — `use` finds it.

## Workspaces

```toml
# Cargo.toml
[workspace]
members = ["crates/api", "crates/cli", "crates/core"]
```

Members can depend on each other via `path = "../core"`. Shared `Cargo.lock` and `target/` directory.

## Macros Across Modules

`macro_rules!` macros need `#[macro_export]` to be used outside their defining module:

```rust
#[macro_export]
macro_rules! my_macro { /* ... */ }
```

They're exported at the crate root. Use `pub use my_macro;` to re-export.

## Module Organization Patterns

### Library + Binaries

```
my_project/
├── Cargo.toml
├── src/
│   ├── lib.rs       # public API
│   └── bin/
│       ├── server.rs
│       └── client.rs
```

### Feature-Gated Modules

```rust
#[cfg(feature = "json")]
pub mod json;
```

### Tests Inline and Separate

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

Integration tests live in `tests/` as separate crate:

```
tests/
└── integration.rs
```

## Edge Cases

- **`pub` doesn't propagate to ancestors**: a `pub mod` is public *if its parent is also accessible*. Privacy is layered.
- **`pub use` ambiguity**: re-exporting two items with the same name into the same scope is an error.
- **Module path and item name conflicts**: `mod foo;` and `use crate::foo;` are different things.
- **`#[non_exhaustive]`** prevents exhaustive construction outside the crate.
- **Private items in `pub` functions**: a public function can't have private types in its signature (e.g., `pub fn get() -> PrivateType` is an error — leaks private type).
- **`extern crate self as foo;`**: lets you refer to your own crate by name (rare).
- **Hidden `mod.rs`**: still works but is discouraged; the new layout is cleaner.
- **`pub use` for preludes**: many crates expose `pub mod prelude { pub use ...; }` for one-line imports.

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