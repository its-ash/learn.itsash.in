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

## Summary

`#[cfg]` controls what compiles; `#[derive]` auto-implements traits; `#[allow]`/`#[deny]`/`#[forbid]` tune lints; `#[non_exhaustive]` future-proofs APIs; `#[must_use]`/`#[deprecated]` drive correctness; `#[repr(C)]` controls layout; `#[global_allocator]`/`#[panic_handler]` customize the runtime.

Next: Cargo features and release engineering.