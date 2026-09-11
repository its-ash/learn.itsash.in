# 27 — Attributes & Conditional Compilation

Attributes look like decoration — bracketed metadata above a function, easy to skim past. They are not: `#[cfg]` decides what code exists in the binary at all; `#[repr]` decides what a type *is* in memory; `#[global_allocator]`/`#[panic_handler]` decide what the program's runtime consists of. This chapter treats attributes as a compilation/codegen control surface, not a syntax list.

## Under-the-Hood Mechanics

### `#[cfg]` is a pre-parse filter, not an `if`

`#[cfg(...)]` operates at the **item level**, before type-checking, and *removes* the annotated item from the AST on non-matching configurations. `cfg!(...)` is a **boolean expression evaluated after parsing** — both branches are parsed and type-checked, always.

::code-wrapper{language="rust"}
```rust
// #[cfg] — the non-matching branch is REMOVED before type-checking.
#[cfg(windows)]
fn platform_init() { windows_only_fn(); }

#[cfg(not(windows))]
fn platform_init() { unix_only_fn(); }

// cfg!() — BOTH branches are type-checked for every build, always.
fn platform_init_wrong() {
    if cfg!(windows) {
        windows_only_fn(); // must exist & type-check on ALL platforms, incl. Linux
    } else {
        unix_only_fn();
    }
}
```
::

Proof that `#[cfg]` truly removes the item — this compiles despite `Windows`-only syntax nonsense existing nowhere on Linux:

::code-wrapper{language="rust"}
```rust
#[cfg(windows)]
fn uses_windows_only_type() -> windows::core::HRESULT {
    // `windows` crate type doesn't even need to be a dependency on non-Windows —
    // this whole item is gone from the AST before rustc looks up the path.
    unreachable!()
}

fn main() {
    println!("compiles fine on Linux/macOS too");
}
```
::

### Conditional compilation resolves once, per compilation invocation

Every `cfg` predicate is a fixed boolean before rustc starts compiling — no runtime toggling, and no per-crate divergence within one build graph.

::code-wrapper{language="rust"}
```rust
// This predicate is either true for the WHOLE build or false for the WHOLE build.
// There is no code path where it flips mid-compilation or per-crate.
#[cfg(feature = "async")]
pub async fn fetch(url: &str) -> Result<String, std::io::Error> {
    unimplemented!()
}

#[cfg(not(feature = "async"))]
pub fn fetch(url: &str) -> Result<String, std::io::Error> {
    unimplemented!()
}
```
::

### Derive macros generate AST-to-AST code, not runtime reflection

::code-wrapper{language="rust"}
```rust
#[derive(Debug, Clone, Default)]
struct Config {
    retries: u32,
    timeout_ms: u64,
}

// The above expands (roughly) to ordinary, hand-writable code:
struct ConfigExpanded {
    retries: u32,
    timeout_ms: u64,
}
impl std::fmt::Debug for ConfigExpanded {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Config")
            .field("retries", &self.retries)
            .field("timeout_ms", &self.timeout_ms)
            .finish()
    }
}
impl Default for ConfigExpanded {
    fn default() -> Self {
        Self { retries: Default::default(), timeout_ms: Default::default() }
    }
}
// No reflection metadata ships in the binary — this is monomorphized,
// statically-dispatched code, identical at the machine-code level to hand-written impls.
```
::

The macro sees **types**, never **values** — it cannot encode a runtime-dependent default:

::code-wrapper{language="rust"}
```rust
#[derive(Default)]
struct Retry {
    attempts: u32, // Default::default() -> 0, always. The macro has no idea
                   // you actually wanted 3 as a "sensible" default.
}

// To get a non-zero default you must hand-write it — derive can't do this:
impl Retry {
    fn sensible() -> Self { Self { attempts: 3 } }
}
```
::

### `#[repr]` selects the layout algorithm

::code-wrapper{language="rust"}
```rust
// Default repr — compiler is FREE to reorder fields to minimize padding.
struct Unspecified {
    a: u8,
    b: u32,
    c: u8,
} // size/order not guaranteed stable across compiler versions

#[repr(C)]
struct CLayout {
    a: u8,   // declaration order preserved, C ABI padding rules
    b: u32,
    c: u8,
} // safe to pass across an FFI boundary

#[repr(transparent)]
struct Meters(f64); // guaranteed identical layout to f64 — ABI-invisible newtype

#[repr(packed)]
struct Packed {
    a: u8,
    b: u32, // no padding inserted — b may now be misaligned in memory
}

fn packed_ub_example(p: &Packed) {
    // let r: &u32 = &p.b;         // UB: creates a misaligned reference
    let v: u32 = unsafe { std::ptr::addr_of!(p.b).read_unaligned() }; // correct
    println!("{v}");
}
```
::

### `#[panic_handler]` / `#[global_allocator]`: whole-program runtime replacement

::code-wrapper{language="rust"}
```rust
use std::alloc::{GlobalAlloc, Layout, System};

struct CountingAlloc;

unsafe impl GlobalAlloc for CountingAlloc {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 { System.alloc(layout) }
    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) { System.dealloc(ptr, layout) }
}

#[global_allocator]
static ALLOCATOR: CountingAlloc = CountingAlloc;
// Every allocation in the binary — including inside dependencies you don't
// control — now routes through this. Exactly one `#[global_allocator]`
// can exist per binary; two is a compile error.
```
::

## Cost, Performance, and Trade-Offs

::code-wrapper{language="rust"}
```rust
// #[cfg]-eliminated code: zero cost. Never parsed into this build's AST.
#[cfg(feature = "telemetry")]
fn record_metric(name: &str, value: f64) { /* ... */ }

// cfg!(): both branches type-check (real, if small, compile-time tax);
// LLVM constant-folds the dead branch away at codegen, so runtime cost ~0.
fn log_level() -> &'static str {
    if cfg!(debug_assertions) { "trace" } else { "info" }
}
```
::

::code-wrapper{language="rust"}
```rust
// #[inline(always)] — trades compile time & binary size for maybe-faster code.
#[inline(always)]
fn add_forced(a: u32, b: u32) -> u32 { a + b } // large call sites hurt I-cache

// #[inline] — a HINT; LLVM's cost model still decides. Safer default.
#[inline]
fn add_hinted(a: u32, b: u32) -> u32 { a + b }

// No hint at all + cross-crate call = LLVM never sees the body during the
// caller crate's codegen. Real, avoidable call overhead in release builds.
pub fn add_opaque_across_crate_boundary(a: u32, b: u32) -> u32 { a + b }
```
::

::code-wrapper{language="rust"}
```rust
// derive cost scales with FIELD COUNT, not usage — all 40 fields get real
// generated code for each derived trait, whether or not any path calls it.
#[derive(Debug, Clone, PartialEq, Hash)]
struct WideStruct {
    f01: u32, f02: u32, f03: u32, f04: u32, f05: u32,
    f06: u32, f07: u32, f08: u32, f09: u32, f10: u32,
    // ...30 more fields: 4 derives x 40 fields = real generated code,
    // measurable compile-time cost, even if `Hash` is never called.
}
```
::

::code-wrapper{language="toml"}
```toml
# Lint attributes: compile-time-only cost, long-term payoff.
[workspace.lints.rust]
missing_docs = "deny"

[workspace.lints.clippy]
unsafe_code = "forbid" # catches regressions on every future build/CI run
```
::

## Production Failure Modes & Anti-Patterns

### Anti-pattern: reaching for `cfg!()` when you meant `#[cfg]`

::code-wrapper{language="rust"}
```rust
// WRONG — must compile identically on every platform; breaks on Linux/macOS
// the moment `windows_specific_helper` is a real Windows-only API.
fn get_path_separator_wrong() -> char {
    if cfg!(target_os = "windows") {
        windows_specific_helper() // must exist & type-check EVERYWHERE
    } else {
        '/'
    }
}
```
::

::code-wrapper{language="rust"}
```rust
// RIGHT — #[cfg] on separate definitions removes the non-matching
// platform's code from that build's AST before type-checking.
#[cfg(target_os = "windows")]
fn get_path_separator() -> char { windows_specific_helper() }

#[cfg(not(target_os = "windows"))]
fn get_path_separator() -> char { '/' }
```
::

Rule of thumb: `cfg!()` only when *both* branches are valid on *every* target (log verbosity, a debug-only assertion) — never to gate a platform-specific API.

### Anti-pattern: `not(target_os = "X")` as a stand-in for "the other platform"

::code-wrapper{language="rust"}
```rust
// WRONG — assumes "not Linux" means "some other Unix." Silently wrong on Windows.
#[cfg(target_os = "linux")]
fn separator() -> char { '/' }

#[cfg(not(target_os = "linux"))]
fn separator() -> char { '/' } // WRONG on Windows: separator is '\', no diagnostic anywhere
```
::

::code-wrapper{language="rust"}
```rust
// RIGHT — enumerate the platform families you actually mean.
#[cfg(unix)]
fn separator() -> char { '/' }

#[cfg(windows)]
fn separator() -> char { '\\' }
```
::

### Anti-pattern: `#[forbid]` applied too broadly, discovered too late

::code-wrapper{language="rust"}
```rust
#![forbid(unsafe_code)] // well-intentioned crate-root lint...
```
::

::code-wrapper{language="rust"}
```rust
// ...months later, a legitimate need appears (FFI wrapper, SIMD intrinsic):
#[allow(unsafe_code)] // COMPILE ERROR: forbid cannot be locally overridden,
mod ffi {              // not here, not in a dependency's macro expansion either.
    pub unsafe fn call_into_c() { /* ... */ }
}
```
::

::code-wrapper{language="rust"}
```rust
// RIGHT — deny (overridable) with a documented, justified escape hatch.
#![deny(unsafe_code)]

#[allow(unsafe_code)] // SAFETY: single FFI call into libc, bounds validated above
mod ffi {
    pub unsafe fn call_into_c() { /* ... */ }
}
```
::

### Anti-pattern: `#[must_use]` silently defeated in review

::code-wrapper{language="rust"}
```rust
#[must_use = "ignoring this drops the transaction without committing"]
pub fn commit(self) -> Result<(), TxError> { /* ... */ }
```
::

::code-wrapper{language="rust"}
```rust
fn wrong(tx: Transaction) {
    tx.commit(); // WARNING fires here — bare statement discards the Result
}

fn defeated_in_review(tx: Transaction) {
    let _ = tx.commit(); // NO warning — "used" via a binding, silently discarded anyway
}

fn right(tx: Transaction) -> Result<(), TxError> {
    tx.commit() // propagated, or explicitly handled
}
```
::

### Anti-pattern: silently divergent behavior across `debug_assertions`

::code-wrapper{language="rust"}
```rust
// WRONG — output SEMANTICS differ between debug and release, not just perf.
#[cfg(debug_assertions)]
fn validate_input(x: i32) -> i32 {
    assert!(x >= 0, "negative input");
    x
}

#[cfg(not(debug_assertions))]
fn validate_input(x: i32) -> i32 {
    x.max(0) // silently clamps instead of panicking — different semantics!
}
```
::

::code-wrapper{language="rust"}
```rust
// RIGHT — debug_assertions changes COST (extra checking), never OUTCOME.
fn validate_input(x: i32) -> i32 {
    debug_assert!(x >= 0, "negative input"); // checked in debug, no-op in release
    x.max(0) // same clamping behavior in BOTH builds
}
```
::

## Architectural Application

::code-wrapper{language="rust"}
```rust
// Visibility is your crate's semver surface. Default to pub(crate); every
// `pub` item is a breaking-change liability the moment its signature moves.
pub(crate) fn internal_helper() { /* free to refactor, nothing outside sees it */ }

pub fn public_api() { /* changing this signature is a semver break */ }
```
::

::code-wrapper{language="rust"}
```rust
// #[non_exhaustive] — apply at first publish, not retroactively.
#[non_exhaustive]
pub enum Event {
    Started,
    Stopped,
    // adding a variant later is non-breaking for external matchers
    // that were forced to include a wildcard arm
}

pub fn handle(e: Event) {
    match e {
        Event::Started => {}
        Event::Stopped => {}
        _ => {} // external crates MUST have this; not required inside the defining crate
    }
}
```
::

::code-wrapper{language="rust"}
```rust
// Centralize #[cfg] behind a small platform module, not scattered through logic.
mod platform {
    #[cfg(unix)]
    pub fn open_socket() -> std::io::Result<i32> { unix_impl::open() }

    #[cfg(windows)]
    pub fn open_socket() -> std::io::Result<i32> { windows_impl::open() }

    #[cfg(unix)]
    mod unix_impl { pub fn open() -> std::io::Result<i32> { Ok(0) } }
    #[cfg(windows)]
    mod windows_impl { pub fn open() -> std::io::Result<i32> { Ok(0) } }
}

// Business logic stays platform-agnostic:
fn start_server() -> std::io::Result<i32> { platform::open_socket() }
```
::

::code-wrapper{language="toml"}
```toml
# Lint policy lives once, at the workspace level — not copy-pasted per crate.
[workspace.lints.rust]
unsafe_code = "deny"

[workspace.lints.clippy]
all = "warn"
```
::

::code-wrapper{language="toml"}
```toml
# Each member crate opts in with one line — no drift between crates.
[lints]
workspace = true
```
::

## 💡 Tips & Tricks

- **Debug**: see which `cfg(feature = ...)` flags are actually active:

::code-wrapper{language="bash"}
```bash
cargo build --features "a b c" -vv
cargo tree -e features
```
::

- **Idiom**: prefer `cfg_if!` over stacked `#[cfg]`/`#[cfg(not(...))]` pairs — reads top-to-bottom, no accidental gap where nothing matches:

::code-wrapper{language="rust"}
```rust
cfg_if::cfg_if! {
    if #[cfg(target_os = "windows")] {
        fn init() { /* windows */ }
    } else if #[cfg(unix)] {
        fn init() { /* unix */ }
    } else {
        fn init() { /* fallback — no silent gap */ }
    }
}
```
::

- **Debug**: confirm which branch actually survived compilation for your target:

::code-wrapper{language="bash"}
```bash
cargo expand --target x86_64-pc-windows-msvc
```
::

- **Performance**: cross-crate inlining needs an explicit hint or LLVM never sees the callee body during the caller's codegen:

::code-wrapper{language="rust"}
```rust
#[inline] // matters MUCH more across a crate boundary than within one
pub fn hot_utility(x: u32) -> u32 { x.wrapping_mul(2654435761) }
```
::

- **Idiom**: `#[non_exhaustive]` doesn't restrict construction *inside* the defining crate:

::code-wrapper{language="rust"}
```rust
#[non_exhaustive]
pub struct Point { pub x: i32, pub y: i32 }

// Inside the defining crate — normal struct literal works fine:
fn make() -> Point { Point { x: 0, y: 0 } }
// Outside the crate, this literal is a compile error; callers need
// a constructor fn or `..Default::default()`.
```
::

- **Clippy**: layer lints incrementally rather than all-or-nothing:

::code-wrapper{language="rust"}
```rust
#![warn(clippy::all)]
#![warn(clippy::needless_pass_by_value)] // add pedantic lints one at a time
```
::

## ⚠️ Edge Cases & Gotchas

- **Syntax still parsed, just not type-checked**:

::code-wrapper{language="rust"}
```rust
#[cfg(windows)]
fn f() -> UnixOnlyType { syntax error here breaks EVERY platform's build }
// but a TYPE error in this block is invisible on Linux CI until someone
// actually builds for Windows.
```
::

- **`cfg!()` type-checks both branches, `#[cfg]` doesn't**:

::code-wrapper{language="rust"}
```rust
fn wrong() {
    if cfg!(target_os = "linux") { linux_fn() } else { other_fn() }
    // fails to compile ON LINUX if other_fn() doesn't exist there,
    // even though the else branch "never runs" on Linux.
}
```
::

- **`#[forbid]` cannot be locally un-forbidden anywhere, ever**:

::code-wrapper{language="rust"}
```rust
#![forbid(unsafe_code)]
mod m {
    #[allow(unsafe_code)] // COMPILE ERROR — forbid overrides all inner allow
    unsafe fn f() {}
}
```
::

- **Innermost lint attribute wins — "allow at the top" doesn't protect inner code**:

::code-wrapper{language="rust"}
```rust
#![allow(dead_code)]

#[deny(dead_code)]
mod strict {
    fn unused() {} // ERROR here — inner #[deny] overrides outer #[allow]
}
```
::

- **`#[must_use]` is defeated by *any* use, even a throwaway binding**:

::code-wrapper{language="rust"}
```rust
let _ = risky_operation(); // no warning; just as discarded as not calling it
```
::

- **`#[repr(packed)]` + references = UB at creation, not just dereference**:

::code-wrapper{language="rust"}
```rust
#[repr(packed)]
struct P { a: u8, b: u32 }

fn ub(p: &P) {
    // let r = &p.b; // UB the instant this reference is created (misaligned)
    let v = unsafe { std::ptr::addr_of!(p.b).read_unaligned() }; // correct
}
```
::

- **`target_os` negation traps**:

::code-wrapper{language="rust"}
```rust
#[cfg(not(target_os = "linux"))]
fn f() { /* ALSO matches Windows, macOS, BSD — not just "the other Unix" */ }

#[cfg(unix)]
fn g() { /* explicit: Linux, macOS, BSD — never Windows */ }
```
::

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

It actually compiles fine everywhere as written. The trap appears once someone "simplifies" the non-Linux branch assuming it only needs to cover Unix-likes:

::code-wrapper{language="rust"}
```rust
#[cfg(not(target_os = "linux"))]
fn get_separator() -> char {
    '/' // assumes "not Linux" means "some other Unix" — WRONG on Windows
}
```
::

`not(target_os = "linux")` matches *every* non-Linux target, Windows included. On Windows the correct separator is `\`, not `/` — this compiles, runs, and returns a wrong-but-plausible answer with zero diagnostics anywhere.

::code-wrapper{language="rust"}
```rust
// FIX — enumerate the platforms you actually mean
#[cfg(windows)]
fn get_separator() -> char { '\\' }

#[cfg(unix)]
fn get_separator() -> char { '/' }
```
::

**The lesson**: `not(target_os = "X")` means "every platform except X," not "the other major platform."

</details>

## Summary

::code-wrapper{language="rust"}
```rust
// #[cfg]  -> removes code from the AST before type-checking. Zero cost.
// cfg!()  -> chooses between two branches that BOTH had to compile.
#[cfg(feature = "x")] fn a() {}
fn b() { if cfg!(feature = "x") { /* both arms type-check */ } }

// #[derive] -> ordinary compiled code from a type's shape. No reflection.
#[derive(Debug, Default)] struct S { n: u32 }

// #[repr] -> selects the actual memory-layout algorithm (ABI/alignment matter).
#[repr(C)] struct Ffi { a: u8, b: u32 }

// #[non_exhaustive] / #[must_use] / #[allow]/#[deny]/#[forbid] -> semver &
// correctness tools; innermost lint wins, forbid is permanent.
#[non_exhaustive] pub enum E { A }

// #[global_allocator] / #[panic_handler] -> whole-program runtime
// replacement points, decided once at the binary crate.
```
::

Next: Cargo features and release engineering — how conditional compilation scales across a dependency graph.
