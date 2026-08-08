# 27 — Attributes & Conditional Compilation

Attributes are metadata annotations that influence compilation, linting, codegen, and tooling. They appear as `#[...]` (outer) or `#![...]` (inner, applies to the enclosing item/whole crate).

## Common Attributes

### Visibility & ABI

- `pub`, `pub(crate)`, `pub(super)`, `pub(in path)`
- `extern "C"`, `#[no_mangle]`, `#[export_name]`, `#[link_name]`

### Code Generation

- `#[inline]` / `#[inline(always)]` / `#[inline(never)]`
- `#[cold]` (cold path — hint to optimizer)
- `#[track_caller]` (captures caller location for panic messages)

### Conditional Compilation

::code-wrapper{language="rust"}
```rust
#[cfg(target_os = "linux")]
fn linux_only() {}

#[cfg(not(target_os = "linux"))]
fn non_linux() {}

#[cfg(all(unix, target_pointer_width = "64"))]
fn unix_64() {}

#[cfg(any(feature = "json", feature = "yaml"))]
fn with_format() {}

#[cfg(feature = "serde")]
#[derive(serde::Serialize)]
struct S;
```
::

### `cfg` Predicates

- `target_os = "linux"`, `target_arch = "x86_64"`, `target_family = "unix"`, `target_pointer_width = "32"`, `target_endian = "little"`.
- `feature = "name"`.
- `debug_assertions` (true in debug builds).
- `test` (true when compiled as a test).
- `unix`, `windows` (family shortcuts).
- `any(...)`, `all(...)`, `not(...)`.
- Custom: `#[cfg(accessible(std::sync::OnceLock))]` (nightly).

### `cfg_attr`

Apply an attribute conditionally:

::code-wrapper{language="rust"}
```rust
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
struct S;
```
::

Equivalent to `#[cfg(feature = "serde")] #[derive(...)]` but cleaner.

### `#[cfg]` on Modules

::code-wrapper{language="rust"}
```rust
#[cfg(feature = "json")]
pub mod json;
```
::

The module is only compiled when the feature is on.

## Compile-Time `cfg!` Macro

::code-wrapper{language="rust"}
```rust
if cfg!(target_os = "linux") {
    println!("linux");
}
```
::

Returns `true`/`false` at compile time — the dead branch is still type-checked but eliminated at codegen. Use `#[cfg]` for actual code removal.

## `#[derive(...)]`

::code-wrapper{language="rust"}
```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
struct Foo;
```
::

Standard derives: `Debug`, `Clone`, `Copy`, `PartialEq`, `Eq`, `PartialOrd`, `Ord`, `Hash`, `Default`. External crates add more (`serde::Serialize`, `thiserror::Error`).

## Lint Attributes

::code-wrapper{language="rust"}
```rust
#![allow(dead_code)]              // crate-wide
#[allow(unused)]                  // item-level
#[warn(unused)]
#[deny(unused)]
#[forbid(unused)]                 // can't be overridden downstream
```
::

- `allow`: silence.
- `warn`: warn (default for many lints).
- `deny`: error.
- `forbid`: deny that can't be undone in inner scopes.

### Common Lints

- `unused`, `dead_code`, `unused_variables`, `unused_imports`, `unused_mut`, `unused_assignments`
- `non_snake_case`, `non_camel_case_types`, `non_upper_case_globals`
- `missing_docs`, `missing_debug_implementations`
- `unsafe_code`, `unused_unsafe`
- `clippy::all`, `clippy::pedantic`, `clippy::nursery` (Clippy lint groups)

### Clippy

::code-wrapper{language="rust"}
```rust
#![warn(clippy::all, clippy::pedantic)]
#![allow(clippy::module_inception)]
```
::

Configure in `Cargo.toml` or source.

## `#[non_exhaustive]`

::code-wrapper{language="rust"}
```rust
#[non_exhaustive]
pub enum Event { Login, Logout }

#[non_exhaustive]
pub struct Config { pub host: String }
```
::

- External crates must include a `_ => ...` arm (enum) or use `..Default::default()`/constructor (struct).
- Allows adding variants/fields in non-breaking minor releases.

## `#[must_use]`

::code-wrapper{language="rust"}
```rust
#[must_use = "the result indicates success"]
pub fn try_connect() -> bool { /* ... */ }
```
::

Warns if the return value is ignored. Applied to Result, Option by default.

## `#[deprecated]`

::code-wrapper{language="rust"}
```rust
#[deprecated(since = "1.2", note = "use new_fn instead")]
pub fn old_fn() {}

#[deprecated(since = "1.2", replacement = "new_fn")]
pub fn old_fn2() {}
```
::

Emits a warning when used.

## `#[doc]` Attributes

::code-wrapper{language="rust"}
```rust
/// Docs.
#[doc = "Inline docs string"]
fn f() {}

#[doc(hidden)]        // hide from docs
pub mod internal;

#[doc(alias = "other_name")]   // search alias
pub fn f2() {}

#![doc(html_root_url = "https://docs.rs/my_crate/1.0")]
```
::

## Inner vs Outer Attributes

::code-wrapper{language="rust"}
```rust
#![allow(dead_code)]   // inner — applies to crate/module

#[allow(dead_code)]    // outer — applies to following item
fn foo() {}

mod m {
    #![allow(dead_code)]   // inner — applies to module m
    fn bar() {}
}
```
::

Inner attributes go *inside* the item's braces; outer attributes go before it.

## `#[path]` for Module Files

::code-wrapper{language="rust"}
```rust
#[path = "other/path.rs"]
mod my_mod;
```
::

Overrides the default file lookup.

## `#[link]`

::code-wrapper{language="rust"}
```rust
#[link(name = "crypto", kind = "static")]
extern "C" { /* ... */ }
```
::

`kind`: `static`, `dylib`, `framework` (macOS). Default is `dylib`.

## `#[link_section]`, `#[used]`

::code-wrapper{language="rust"}
```rust
#[link_section = ".custom"]
#[used]
static DATA: [u8; 4] = [0, 1, 2, 3];
```
::

`#[used]` prevents the compiler from optimizing away the symbol. `#[link_section]` places it in a custom section (advanced/embedded).

## `#[target_feature]`

::code-wrapper{language="rust"}
```rust
#[target_feature(enable = "avx2")]
unsafe fn avx2_func() {}
```
::

Enables CPU features for a specific function. Requires `unsafe` (calling on a CPU without the feature is UB).

::code-wrapper{language="rust"}
```rust
#[target_feature(enable = "avx2")]
#[cfg(target_arch = "x86_64")]
unsafe fn fast() {}

if is_x86_feature_detected!("avx2") {
    unsafe { fast(); }
}
```
::

## `#[cold]`, `#[inline]`

::code-wrapper{language="rust"}
```rust
#[cold]
fn error_path() {}     // hint: rare path
```
::

## `#[track_caller]`

::code-wrapper{language="rust"}
```rust
#[track_caller]
fn caller() -> &'static Location {
    Location::caller()
}
```
::

Captures the source location of the call site; useful for panic messages and assertion helpers.

## `#[automatically_derived]`

Applied by `#[derive(...)]` to prevent lints from firing on generated code.

## `#[repr(...)]` (Layout)

::code-wrapper{language="rust"}
```rust
#[repr(C)]              // C-compatible layout
#[repr(transparent)]    // same layout as a single field
#[repr(packed)]         // no padding
#[repr(packed(1))]      // explicit alignment
#[repr(align(16))]      // force alignment
#[repr(C, u8)]           // C layout + explicit enum discriminant width
```
::

## `#[panic_handler]`

In `no_std` environments:

::code-wrapper{language="rust"}
```rust
#[panic_handler]
fn panic(_: &PanicInfo) -> ! { loop {} }
```
::

Defines the panic behavior for a custom target.

## `#[global_allocator]`

::code-wrapper{language="rust"}
```rust
use std::alloc::{GlobalAlloc, Layout};

struct MyAlloc;
unsafe impl GlobalAlloc for MyAlloc {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 { /* ... */ }
    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) { /* ... */ }
}

#[global_allocator]
static A: MyAlloc = MyAlloc;
```
::

Replace Rust's default allocator (e.g., for `jemalloc`).

## `#[no_std]` and `#![no_std]`

::code-wrapper{language="rust"}
```rust
#![no_std]
```
::

Disables `std`, only `core` (+ optional `alloc`) available. For embedded/wasm/kernels.

## Edition-Related Attributes

- `#![feature(...)]` (nightly only)
- `#![allow(...)]` for transition warnings between editions.

## Feature Attributes

::code-wrapper{language="rust"}
```rust
#![feature(async_fn_traits)]   // nightly
```
::

Unstable features require nightly + explicit `#![feature]`.

## Common Pitfalls

- **Inner vs outer**: `#![...]` (inner) inside braces/`mod`, `#[...]` (outer) before items.
- **`#[cfg]` doesn't type-check dead branches**: actually it does — both branches are type-checked. Use `cfg_if!` macro or modular code to fully isolate.
- **`#[cfg_attr]` placement**: same as `#[cfg]`/`#[derive]` placement.
- **`#[non_exhaustive]`** can't be applied to local types (only exported across crates).
- **`#[must_use]` on a type** warns when the value is dropped unused.
- **`#[allow]` ignores lints in nested scopes**: `#[deny]` in an inner scope overrides `#[allow]` from the outer.
- **`#[forbid]`** is sticky: an inner `#[allow]` triggers a "forbid overridden by allow" error.
- **Attribute parsing**: some attributes take `key = "value"`, others take bare tokens; check the docs.

## `cfg_if!` Macro

::code-wrapper{language="rust"}
```rust
cfg_if::cfg_if! {
    if #[cfg(unix)] {
        fn posix_api() {}
    } else if #[cfg(windows)] {
        fn win_api() {}
    } else {
        fn other_api() {}
    }
}
```
::

Cleaner than stacked `#[cfg]` attributes.

## Attributes Tricks & Patterns

::code-wrapper{language="rust"}
```rust
// Trick: use cfg_attr to conditionally apply attributes
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
struct Data {
    x: i32,
}

// Trick: use doc(hidden) to hide internal items from docs
#[doc(hidden)]
pub fn internal_only() { }

// Trick: use must_use on Result-like types
#[must_use = "this operation can fail; use ? or unwrap_or"]
pub fn risky_operation() -> Option<i32> { None }

// Trick: use deprecated to guide users to new APIs
#[deprecated(since = "1.2", replacement = "new_function")]
pub fn old_function() { }

// Trick: use allow/deny/forbid to enforce patterns
#![deny(unsafe_code)]      // no unsafe anywhere
#![deny(missing_docs)]      // all public items must have docs

// Trick: use track_caller for better error messages
#[track_caller]
fn assert_valid(x: i32) {
    assert!(x > 0, "at {}", std::panic::Location::caller());
}

// Trick: use target_feature for platform-specific code
#[target_feature(enable = "avx2")]
#[cfg(target_arch = "x86_64")]
unsafe fn simd_add(a: &[f32], b: &[f32]) -> f32 {
    // AVX2 code here
    0.0
}

// Trick: use repr(transparent) for newtype zero-cost wrappers
#[repr(transparent)]
struct Wrapper(u32);

// Trick: use non_exhaustive for future API changes
#[non_exhaustive]
pub enum Status {
    Active,
    Inactive,
}

// Trick: use doc attributes for custom documentation
#![doc = "Custom crate documentation"]
#![doc = include_str!("../README.md")]  // include from file
```
::

## Conditional Compilation Tips

::code-wrapper{language="rust"}
```rust
// Check multiple conditions
#[cfg(all(unix, not(target_os = "macos")))]
fn linux_only() { }

// Platform families
#[cfg(target_family = "unix")]
fn posix() { }

#[cfg(target_family = "wasm")]
fn wasm_only() { }

// Debug vs Release
#[cfg(debug_assertions)]
fn debug_only() {
    println!("debugging enabled");
}

#[cfg(not(debug_assertions))]
fn release_only() { }

// Testing
#[cfg(test)]
mod tests { }

// Feature-gated code
#[cfg(feature = "unsafe_mode")]
unsafe fn experimental() { }
```
::

## 💡 Tips & Tricks

- **Debug**: `cargo build --features "a b c" -vv` (or `cargo tree -e features`) shows exactly which `cfg(feature = ...)` flags are active for a build — useful when a `#[cfg]`-gated function mysteriously "doesn't exist" in a build.
- **Idiom**: use `cfg_if::cfg_if!` instead of stacking several `#[cfg(...)]`/`#[cfg(not(...))]` function definitions — it reads top-to-bottom like a normal `if`/`else if` chain and avoids accidentally leaving a gap where no `#[cfg]` matches.
- **Debug**: `cargo expand` shows you exactly which `#[cfg]` branches survived compilation for your current target/feature set — helpful when you suspect the "wrong" branch is being compiled in.
- **Performance**: `#[inline]` is only a *hint*; the compiler still runs its own cost-benefit heuristics. For cross-crate inlining (a function in crate A called from crate B), `#[inline]` matters much more than for same-crate calls, because without it LLVM can't see the callee's body during B's compilation at all.
- **Idiom**: `#[non_exhaustive]` on a struct still lets you construct it *within* the defining crate as normal — the restriction (must use `..Default::default()` or a constructor) only applies to external crates, which trips up people testing across a workspace boundary.
- **Clippy**: `#![warn(clippy::all)]` is a good default; add `#![warn(clippy::pedantic)]` incrementally per-lint (not all at once) since pedantic includes some deliberately opinionated lints not everyone wants.

## ⚠️ Edge Cases & Gotchas

- **Both branches of a `#[cfg]` still get parsed, but only one type-checks**: `#[cfg(unix)] fn f() -> UnixOnlyType { ... }` alongside a Windows `#[cfg]` version means the *non-compiled* branch is still parsed as valid Rust syntax (so a syntax error there breaks the build on every platform), but it is never type-checked — a type error hidden inside a `#[cfg(windows)]` block on Linux CI will pass silently until someone builds for Windows.
- **`cfg!(...)` (the macro) is not the same as `#[cfg(...)]` (the attribute)**: `if cfg!(target_os = "linux") { linux_fn() } else { other_fn() }` type-checks *both* branches even though only one runs — if `other_fn()` doesn't exist on Linux, this fails to compile on Linux even though the `else` branch would "never run" there; `#[cfg]` attributes on items, not the `cfg!` macro, are what actually removes code.
- **`#[forbid]` cannot be un-forbidden, even in nested scopes that "should" be allowed**: `#![forbid(unsafe_code)]` at the crate root means *no* inner module, function, or even a dependency's macro expansion inside your crate can locally `#[allow(unsafe_code)]` to carve out an exception — the only fix is removing the `forbid` or the unsafe code.
- **`#[allow]` in an outer scope doesn't protect against `#[deny]` in an inner one**: `#![allow(dead_code)]` at the crate root can still be overridden by a `#[deny(dead_code)]` on a specific inner module — lint attribute resolution is scoped and the innermost, most specific attribute wins, which is the opposite of what "allow at the top" might suggest.
- **`#[must_use]` warnings are silent when the value is used for *anything*, even trivially**: `let _ = risky_operation();` suppresses the "unused" warning even though the value is just as discarded as not binding it at all — this pattern is a common way `#[must_use]` protections get accidentally defeated in a code review that doesn't notice the underscore.
- **`#[repr(packed)]` combined with references is undefined behavior**: taking `&field` of a field inside a `#[repr(packed)]` struct can produce a misaligned reference, which is UB the moment it's created (not just when dereferenced) — Rust added lints for this, but code compiled with older toolchains or using raw pointer casts can still hit it.
- **Platform quirk — `target_os` vs `target_family`**: `#[cfg(unix)]` covers Linux, macOS, BSDs, and more, but forgetting that `#[cfg(target_os = "macos")]` is *not* covered by `#[cfg(target_os = "linux")]`'s negation (`not(target_os = "linux")` also matches Windows) leads to "unix-only" code accidentally compiling (and failing) on Windows unless you use `not(windows)` or `unix` explicitly.

## 🧠 Spot the Bug

Why does this fail to compile only on Windows, even though it looks platform-agnostic?

::code-wrapper{language="rust"}
```rust
#[cfg(not(target_os = "linux"))]
fn get_separator() -> char {
    std::path::MAIN_SEPARATOR
}

#[cfg(target_os = "linux")]
fn get_separator() -> char {
    '/'
}

fn main() {
    println!("{}", get_separator());
}
```
::

<details>
<summary>Answer</summary>

It compiles fine everywhere in this exact form — the actual trap is subtler and appears once someone "simplifies" the non-Linux branch believing it only needs to handle Unix-likes:

::code-wrapper{language="rust"}
```rust
#[cfg(not(target_os = "linux"))]
fn get_separator() -> char {
    '/'  // assumes "not Linux" means "some other Unix"
}
```
::

`not(target_os = "linux")` matches *every* non-Linux target, including Windows — not just macOS/BSD as a Linux-centric developer might assume. On Windows, the path separator is `\`, not `/`, so hardcoding `'/'` under a `not(target_os = "linux")` guard silently produces wrong (not broken — *wrong*) behavior on Windows: it compiles, runs, and returns an incorrect separator with no diagnostic anywhere, because from the compiler's point of view the `cfg` predicate matched exactly as written.

**The lesson**: `not(target_os = "X")` means "every platform except X," not "the other major platform" — enumerate the platforms you actually mean (`unix`, `windows`, or explicit `target_os` values) rather than negating a single one.

</details>

## Summary

`#[cfg]` controls what compiles; `#[derive]` auto-implements traits; `#[allow]`/`#[deny]`/`#[forbid]` tune lints; `#[non_exhaustive]` future-proofs APIs; `#[must_use]`/`#[deprecated]` drive correctness; `#[repr(C)]` controls layout; `#[global_allocator]`/`#[panic_handler]` customize the runtime. Use `#[track_caller]` for better debugging; use `#[cfg_attr]` for conditional attributes; use platform-specific `#[cfg]` for cross-platform code.

Next: Cargo features and release engineering.