# 20 — Modules, Crates & Compilation Units (Architectural View)

The module system looks like a namespacing convenience. It isn't. `mod`, `pub`, and crate boundaries are Rust's **only** mechanism for encapsulation, and they double as **compilation unit boundaries** that determine incremental-build granularity, monomorphization duplication, and how much of your codebase rustc has to re-check on every change. A senior engineer treats crate/module layout as an architecture decision with real compile-time and binary-size consequences — not a filesystem tidiness exercise.

## Under-the-Hood Mechanics

### Crates are the real compilation unit, not modules

`mod` is a **namespace within a compilation unit**; the crate is the actual thing rustc compiles and LLVM optimizes as a unit.

::code-wrapper{language="rust" filename="lib.rs"}
```rust
// A single crate with many `mod` declarations still compiles (typecheck + codegen)
// as ONE unit — the module boundary is a namespace, not a build boundary.
mod network;
mod storage;
mod api;
// changing one line in network.rs can force re-typecheck/re-codegen of THIS WHOLE crate
```
::

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
# RIGHT fix for slow incremental rebuilds: split into a workspace, not more `mod`s
[workspace]
members = ["crates/network", "crates/storage", "crates/api"]
# changing crates/api doesn't force crates/network to recompile — its .rlib is cached
```
::

### `pub` is a compile-time visibility check, not a runtime concept

Visibility is resolved entirely during name resolution, before type-checking starts — there's no vtable, no runtime check.

::code-wrapper{language="rust"}
```rust
mod internal {
    pub(crate) fn helper_a() -> u32 { 42 }
    pub fn helper_b() -> u32 { 42 }
    // helper_a and helper_b generate BYTE-FOR-BYTE IDENTICAL machine code —
    // only the set of allowed call sites differs, and that's compile-time-only
}
```
::

::code-wrapper{language="rust"}
```rust
mod a {
    pub(super) fn only_parent_can_call() {}
    pub(in crate::a) fn only_this_subtree() {}
}
fn caller() {
    a::only_parent_can_call();   // OK: caller is in `a`'s parent module
}
```
::

### Monomorphization crosses module boundaries but not crate boundaries (usually)

Modules don't create separate monomorphization domains; crate boundaries do.

::code-wrapper{language="rust"}
```rust
// In core_lib (a dependency):
pub fn process<T: std::fmt::Debug>(item: T) {
    println!("{item:?}");
}

// In app (the dependent crate):
process(5i32);       // monomorphized INSIDE app's compilation, not reused from core_lib
process("hello");    // a second, separate monomorphized copy, also inside app
```
::

### `use` and path resolution cost nothing at runtime — but glob imports cost compile-time ambiguity-checking

::code-wrapper{language="rust"}
```rust
use std::collections::HashMap;   // pure alias, emits no code, near-zero resolver cost
```
::

::code-wrapper{language="rust"}
```rust
// Glob imports force the resolver to enumerate every public item and check
// for collisions against everything already in scope — real, if small, compile-time cost
use std::collections::*;   // HashMap, HashSet, BTreeMap, VecDeque, ... all checked for conflicts
```
::

## Cost, Performance, and Trade-Offs

| Decision | Compile-time cost | Runtime cost | Binary size | Maintenance cost |
|---|---|---|---|---|
| More `mod`s in one crate | Low–Medium (whole crate still one incremental unit for cross-module generics) | Zero | Zero | Improves navigability |
| Splitting into a workspace of crates | **Reduces** total rebuild time (parallel + cached compilation of unchanged crates) | Zero | Zero (same code, different link units) | Adds `Cargo.toml` overhead, version-sync burden |
| `pub` vs `pub(crate)` | Zero difference | Zero difference | Zero difference | `pub(crate)` documents intent, shrinks your real API surface for semver purposes |
| Generic public API (`pub fn f<T>()`) | **Higher** for downstream crates — every call site re-monomorphizes | Zero (fully inlined/specialized) | **Higher** — N call sites with N distinct `T`s means N copies of the function body | Flexible API, but see code-bloat below |
| `dyn Trait` public API | Lower for downstream crates (one compiled implementation, dispatched via vtable) | Small (indirect call, no inlining across the vtable boundary) | Lower — one copy regardless of caller types | Less flexible, but predictable compile times |
| Deep module nesting (`a::b::c::d::e`) | Marginal | Zero | Zero | Real: cognitive overhead, `super::super::super` fragility |
| Workspace-wide `[workspace.dependencies]` | Slightly higher initial resolution, but avoids **duplicate versions** of the same crate compiling into different member crates | Zero | Lower — avoids double-instantiation of the same external crate at two versions | Prevents "two versions of `serde` in one binary" bloat |

The generic-vs-`dyn` trade-off deserves emphasis: a public `pub fn parse<T: Deserialize>(...)` that's called with 40 different types across a large downstream codebase produces **40 monomorphized copies** at 40 call sites, each independently optimized and inlined — this is the "convenient generic API" tax, and it shows up as bloated `.text` sections and slow downstream compile times, invisible from the API's ergonomic surface.

## Production Failure Modes & Anti-Patterns

### Anti-pattern: the "god crate" with unenforced internal boundaries

::code-wrapper{language="rust" filename="lib.rs"}
```rust
// BAD: everything pub, one flat module, no encapsulation
pub mod db;
pub mod api;
pub mod billing;
pub mod auth;

// db.rs
pub struct Connection {
    pub raw_handle: *mut std::ffi::c_void,   // leaked implementation detail
    pub pool_size: usize,
}
```
::

This compiles and "works" — but every field of `Connection` is now part of the crate's public contract, with nothing to stop `billing` from reaching directly into `db::Connection.raw_handle` six months later, creating undocumented coupling the compiler can't flag.

**The fix**: default to private, promote to `pub(crate)` when genuinely needed, reserve bare `pub` for the real external contract.

::code-wrapper{language="rust" filename="lib.rs"}
```rust
// GOOD: encapsulated, minimal surface
mod db;      // not pub — internal to the crate entirely, or pub(crate) if only some modules need it
pub mod api; // the actual external surface

// db.rs
pub(crate) struct Connection {
    raw_handle: *mut std::ffi::c_void,   // private — only db's own methods touch it
    pool_size: usize,
}

impl Connection {
    pub(crate) fn query(&self, sql: &str) -> Result<Rows, DbError> {
        // db enforces its own invariants; callers never see raw_handle
        todo!()
    }
}
```
::

### Anti-pattern: leaking a private type through a public function signature (a compile error, but a common design trap that gets "fixed" the wrong way)

::code-wrapper{language="rust"}
```rust
mod internal {
    pub struct Handle(pub(crate) u64);   // meant to be crate-internal
}

// A mid-level dev hits E0446 here and "fixes" it by just slapping `pub` everywhere:
pub fn get_handle() -> internal::Handle {   // ERROR: private type in public interface
    internal::Handle(42)
}
```
::

::code-wrapper{language="rust"}
```rust
// NAIVE FIX: compiles, but now `u64` is part of your semver contract forever
pub struct HandleNaive(pub u64);
```
::

The production-grade fix decides, deliberately, whether the type should be public at all:

::code-wrapper{language="rust"}
```rust
// Option A: it genuinely is public API — make it public but keep the field private,
// so construction/inspection still goes through your controlled API.
pub struct Handle(u64);
impl Handle {
    pub(crate) fn new(id: u64) -> Self { Handle(id) }
    pub fn id(&self) -> u64 { self.0 }
}

// Option B: it should stay internal — don't expose it in a pub fn signature at all.
pub(crate) fn get_handle() -> internal::Handle {
    internal::Handle::new(42)
}
```
::

### Anti-pattern: workspace member version drift causing duplicate dependency compilation

::code-wrapper{language="toml" filename="crates/api/Cargo.toml"}
```toml
[dependencies]
serde = "1.0.150"
```
::

::code-wrapper{language="toml" filename="crates/cli/Cargo.toml"}
```toml
[dependencies]
serde = "1.0.190"
```
::

Both are `^1.0` so Cargo usually unifies them — but incompatible ranges link **two separate copies** into the binary, and a `Serialize` impl from one copy is a *different type* than from the other, producing "expected `Serialize`, found `Serialize`" errors.

**The fix**: centralize with `[workspace.dependencies]` so every member inherits the same version by construction.

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[workspace]
members = ["crates/api", "crates/cli", "crates/core"]

[workspace.dependencies]
serde = { version = "1.0.190", features = ["derive"] }
```
::

::code-wrapper{language="toml" filename="crates/api/Cargo.toml"}
```toml
[dependencies]
serde.workspace = true
```
::

## Architectural Application

::code-wrapper{language="rust"}
```rust
// Module boundary = encapsulation boundary, same discipline as a class in OOP
mod account {
    pub struct Account { balance: i64 }   // field private — invariant protected
    impl Account {
        pub fn new() -> Self { Account { balance: 0 } }
        pub fn deposit(&mut self, amount: i64) { self.balance += amount; }
        pub fn balance(&self) -> i64 { self.balance }   // read-only accessor
    }
}
```
::

::code-wrapper{language="text" filename="workspace layout"}
```
Cargo.toml           [workspace]
crates/core/          <- pure domain logic, few deps, changes rarely
crates/infra/         <- DB/HTTP adapters, depends on core
crates/app/           <- thin binary wiring infra + core together
```
::

::code-wrapper{language="rust"}
```rust
// Generic public API: monomorphization cost pushed onto every downstream caller
pub fn process<T: Handler>(h: T) { h.handle(); }

// dyn public API: cost centralized into YOUR crate's own compiled artifact
pub fn process_dyn(h: &dyn Handler) { h.handle(); }
trait Handler { fn handle(&self); }
```
::

::code-wrapper{language="rust" filename="lib.rs"}
```rust
// Re-exports: a stable facade over an internal tree that's free to reorganize
mod internal { pub mod parser { pub mod lexer { pub struct Token; } } }
pub use internal::parser::lexer::Token;   // downstream: `use my_crate::Token;`
// internal::parser::lexer can be renamed/moved freely — the re-export path is the contract
```
::

## 💡 Tips & Tricks

- **Idiom**: expose a `pub mod prelude { pub use ...; }` module for crates with many commonly-used types — it gives consumers a one-line `use my_crate::prelude::*;` without forcing a broad glob import of your entire public API.
- **Performance**: if incremental rebuilds are slow on a large single-crate binary, measure with `cargo build --timings` before reorganizing modules — the fix is almost always splitting into a workspace of crates, not rearranging `mod` declarations within one crate, since modules don't create separate incremental compilation units.
- **Debug**: `cargo modules generate tree` (via `cargo install cargo-modules`) prints your crate's actual module hierarchy as a tree — useful for spotting an accidental `mod.rs`/`module.rs` duplicate or a module nested deeper than intended.
- **Idiom**: use `pub(crate)` liberally for anything shared between your own modules but not meant for external consumers — it costs nothing at runtime and documents your real API surface for semver purposes far better than bare `pub`.
- **Debug**: "private type in public interface" errors point at real API design problems, not just visibility — if a public function needs to return a private type, decide deliberately whether the type becomes genuinely public (with private fields to preserve invariants) or the function itself should be `pub(crate)`.
- **Performance**: run `cargo tree -d` to spot duplicate dependency versions across a workspace before they cause both binary bloat and cross-crate type mismatches; centralize with `[workspace.dependencies]`.
- **Idiom**: keep re-exports (`pub use`) in one clearly-named place (often `lib.rs` or a dedicated `prelude` module) rather than scattered across many files — it gives you a single file to scan when auditing exactly what your crate's public surface looks like, and a single place to reason about semver breakage.
- **Debug**: `cargo doc --open` is a fast way to sanity-check what's *actually* publicly visible from outside your crate — rustdoc only shows `pub` items reachable from the crate root, so it's an accurate mirror of what consumers see, unlike scanning source files by eye.

## ⚠️ Edge Cases & Gotchas

- **`pub` doesn't propagate to ancestors**: a `pub mod` is public *if its parent is also accessible* — nesting a `pub` module inside a private one makes it unreachable from outside, silently, with no warning that the outer privacy is the actual gate.
- **Generic public functions duplicate code per instantiation, invisibly**: a `pub fn process<T: Display>(t: T)` called with 30 distinct types across a large downstream codebase compiles into 30 separate machine-code bodies — none of this shows up in the source, only in `cargo bloat` output or unexpectedly slow downstream builds.
- **Two crates, two versions, two incompatible types**: workspace members pinned to different semver-incompatible versions of the same dependency link in two copies of that crate — a `Foo` from copy A is a *different type* than `Foo` from copy B even with identical source, producing trait-not-implemented errors that look like a bug but are a dependency-graph problem.
- **`#[macro_export]` ignores module nesting entirely**: a macro defined deep inside `mod a::b` with `#[macro_export]` is called as `my_crate::my_macro!()`, not `my_crate::a::b::my_macro!()` — the nesting is invisible to callers because macros resolve at the crate root, a different resolution stage than items.
- **`mod.rs` and `module_name.rs` can silently coexist and both compile**: mixing 2015-style (`network/mod.rs`) and 2018-style (`network.rs`) file layouts for different modules in the same crate compiles fine but confuses every new contributor trying to find where a module's contents live.
- **Private items in `pub` function signatures are a hard compile error, not a lint**: unlike many "leaky abstraction" mistakes in other languages that compile silently, Rust's `E0446` catches this at compile time — but only for the function's *signature* types, not for values reachable at runtime through a public trait object, which can still leak internal type information via `Any::downcast`.
- **`pub(in path)` requires the path to be an ancestor module**: `pub(in crate::foo::bar)` only compiles if the item is actually inside `crate::foo::bar` or one of its descendants — you cannot use it to grant visibility to an unrelated sibling module, which surprises people expecting arbitrary-scope visibility grants.

## 🧠 Spot the Bug

This workspace compiles, links, and runs — but two engineers debugging a `Serialize` trait error insist the same `serde` version is in use. What's actually going on?

::code-wrapper{language="toml" filename="crates/parser/Cargo.toml"}
```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
```
::

::code-wrapper{language="toml" filename="crates/exporter/Cargo.toml"}
```toml
[dependencies]
serde = "=1.0.188"
```
::

::code-wrapper{language="rust" filename="crates/app/src/main.rs"}
```rust
fn main() {
    let doc = parser::parse("...");
    exporter::export(doc);   // ERROR: expected `exporter::Document`,
                              // found a struct with the same fields and name
}
```
::

<details>
<summary>Answer</summary>

`exporter` pins `serde = "=1.0.188"` (exact), `parser` accepts `"1"` (`>=1.0.0, <2.0.0`). If anything else in the graph needs a newer `1.0.x`, Cargo can't unify the exact pin with the broader range and links **two separate copies** of `serde` — one at exactly `1.0.188`, one newer.

Rust's type identity includes the crate's compiled instance, not just its name — a `Document` deriving `Serialize` via one copy is a structurally identical but nominally different type from one derived against the other. The compiler correctly refuses to unify them.

The fix is to eliminate the version split, ideally by centralizing the dependency at the workspace level so no member can independently pin an incompatible range:

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[workspace.dependencies]
serde = { version = "1.0.195", features = ["derive"] }
```
::

::code-wrapper{language="toml" filename="crates/exporter/Cargo.toml"}
```toml
[dependencies]
serde.workspace = true
```
::

**The lesson**: an exact-pin (`=1.0.188`) dependency requirement anywhere in a workspace can force Cargo to link two copies of the same crate, and Rust's type system will correctly (if confusingly) treat types derived against each copy as distinct — always prefer range requirements or `workspace.dependencies` inheritance across a multi-crate project.

</details>

## Summary

Modules are compile-time-only namespacing and encapsulation with zero runtime cost; crates are the real compilation and monomorphization boundary, and workspace layout is your primary lever for incremental-build performance at scale. `pub`/`pub(crate)`/`pub(super)` cost nothing at runtime but define your actual API surface and semver contract — default to the narrowest visibility and widen deliberately. Public generic APIs trade compile-time and binary-size cost (per-call-site monomorphization) for zero-cost dispatch; public `dyn` APIs centralize that cost at the cost of indirect calls. Workspace dependency version drift is a real production failure mode that manifests as baffling "same type, different type" errors, not just wasted disk space.

Next: Testing — unit, integration, and doc tests, and how to make test failures actually diagnosable in production-scale suites.
