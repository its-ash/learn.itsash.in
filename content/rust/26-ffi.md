# 26 — FFI (Foreign Function Interface)

FFI is where Rust's compile-time safety guarantees stop and the operating system's contract begins. There is no runtime enforcement across a `.so` boundary — get the layout, ownership, or unwind semantics wrong and the borrow checker has no jurisdiction to save you.

This chapter covers the mechanics of that boundary: the ABI contract, the cost of crossing it safely, how "safe-looking" wrappers fail in production, and how to architect crate boundaries so unsafe surface area stays small and auditable.

## Under-the-Hood Mechanics

### `extern "C"` is a compile-time trust exercise, not a runtime check

::code-wrapper{language="rust"}
```rust
extern "C" {
    fn abs(x: i32) -> i32;
}

fn main() {
    let x = unsafe { abs(-5) };
    println!("{x}");
}
```
::

rustc never verifies this signature against the real C declaration — the linker only matches the *symbol name*:

::code-wrapper{language="rust"}
```rust
// The real libc signature is `long abs(long)`. Declaring i32 instead
// compiles and links fine on platforms where long != i32 — silent
// truncation/garbage, zero compiler diagnostics.
extern "C" {
    fn abs(x: i32) -> i32; // WRONG width, links anyway
}
```
::

`unsafe` adds no runtime check — it's purely a compile-time marker:

::code-wrapper{language="rust"}
```rust
// Identical machine code either way; `unsafe` only satisfies the compiler
// that a human reviewed the invariants it can't check.
let a = unsafe { abs(-5) };
let b = abs(-5); // hypothetically, if it compiled — same instructions
```
::

Wrong calling-convention string silently misreads the stack on affected targets:

::code-wrapper{language="rust"}
```rust
// On 32-bit Windows, "stdcall" and "C" disagree on stack cleanup.
extern "stdcall" { fn SomeWinApi(x: i32) -> i32; } // correct for many WinAPI fns
extern "C" { fn SomeWinApi(x: i32) -> i32; }        // WRONG convention string
```
::

### Symbol mangling: link-time errors, not compile-time ones

::code-wrapper{language="rust"}
```rust
// Rust mangles `foo` into something like `_ZN4crate3foo17h...E`.
fn foo() {}

// extern blocks skip mangling for the *expected* name and rely on a literal
// string match against the library's exported symbols.
extern "C" {
    fn strlen(s: *const std::os::raw::c_char) -> usize; // must match libc exactly
    fn strlenn(s: *const std::os::raw::c_char) -> usize; // typo: "undefined symbol" at LINK time
}

#[no_mangle]
pub extern "C" fn my_exported_fn() {} // disables mangling so C can find it by name
```
::

### `#[repr(C)]` and layout determinism

::code-wrapper{language="rust"}
```rust
struct Default3 { a: u8, b: u64, c: u8 }
// Rust's default repr may reorder to [b, a, c] or [b, c, a] to cut padding —
// no guarantee which, and it can change across compiler versions.

#[repr(C)]
struct Compat3 { a: u8, b: u64, c: u8 }
// Guarantees declaration-order fields + C's platform alignment/padding rules.
// This is the ONLY layout Rust can promise matches a C compiler's output.
```
::

::code-wrapper{language="rust"}
```rust
// Mixing the two is the actual footgun: a repr(C) struct that CONTAINS a
// default-repr struct is still undefined at the boundary.
#[repr(C)]
struct Outer {
    tag: u32,
    inner: Default3, // WRONG — inner's layout is still unspecified
}

#[repr(C)]
struct Inner { a: u8, b: u64, c: u8 } // give it repr(C) too

#[repr(C)]
struct OuterFixed {
    tag: u32,
    inner: Inner, // RIGHT — every layer of the FFI struct graph needs repr(C)
}
```
::

### Opaque handles: the vtable that isn't there

::code-wrapper{language="rust"}
```rust
#[repr(C)]
pub struct DbHandle { _private: [u8; 0] } // zero-sized: never constructed, never read

extern "C" {
    pub fn db_open(path: *const std::os::raw::c_char) -> *mut DbHandle;
    pub fn db_close(h: *mut DbHandle);
}
```
::

::code-wrapper{language="rust"}
```rust
// WRONG — guessing at the C struct's real fields breaks the moment the
// library adds a field in a minor version bump; you never had the real layout.
#[repr(C)]
pub struct DbHandleGuessed {
    fd: i32,
    buffer_ptr: *mut u8,
    buffer_len: usize,
}
```
::

## Cost, Performance, and Trade-Offs

The call itself is free — a direct `call` instruction, same cost as any Rust call:

::code-wrapper{language="rust"}
```rust
extern "C" { fn c_add(a: i32, b: i32) -> i32; }
fn rust_add(a: i32, b: i32) -> i32 { a + b }
// Both compile to a single `call` under the same ABI — FFI itself isn't slow.
```
::

The safety machinery around the call is where cost actually lives:

::code-wrapper{language="rust"}
```rust
// CString conversion: one allocation + UTF-8 -> NUL-terminated copy, PER CALL.
fn log_hot_path(msg: &str) {
    let c = std::ffi::CString::new(msg).unwrap(); // allocates every time
    unsafe { c_syslog(c.as_ptr()); }
}

// Cache the CString when the underlying string is stable across calls.
struct CachedLogger { tag: std::ffi::CString } // built once
impl CachedLogger {
    fn log(&self) { unsafe { c_syslog(self.tag.as_ptr()); } } // zero allocs here
}
```
::

`catch_unwind` at hot boundaries adds a landing pad per call — measure before paying it millions of times a second:

::code-wrapper{language="rust"}
```rust
// Per-call cost: nonzero branch + unwind-table bookkeeping, and it can block
// inlining across the boundary.
#[no_mangle]
pub extern "C" fn hot_callback(x: i32) -> i32 {
    std::panic::catch_unwind(|| x * 2).unwrap_or(-1)
}
```
::

::code-wrapper{language="toml"}
```toml
# For a callback invoked millions of times/sec, prefer aborting the whole
# process over paying catch_unwind per call — accept process death over UB.
[profile.release]
panic = "abort"
```
::

`bindgen` compile-time cost — cache the output instead of regenerating from scratch every build:

::code-wrapper{language="rust"}
```rust
// build.rs
fn main() {
    println!("cargo:rerun-if-changed=vendor/lib.h"); // only regen on header change
    let bindings = bindgen::Builder::default()
        .header("vendor/lib.h")
        .generate()
        .expect("bindgen failed");
    bindings
        .write_to_file(std::path::Path::new("src/bindings.rs"))
        .expect("write failed");
}
```
::

Binary size: even a two-function cdylib drags in panic machinery and allocator shims — routinely several hundred KB before real logic:

::code-wrapper{language="toml"}
```toml
[lib]
crate-type = ["cdylib"]

[profile.release]
panic = "abort"   # trims unwind tables
lto = true        # trims further when embedding many small cdylibs
strip = true
```
::

Maintenance drift: Rust re-checks itself on every build, but nothing re-checks a hand-written `extern` block against an upgraded C header:

::code-wrapper{language="rust"}
```rust
// bindings.rs, hand-written against libfoo 1.2 — never regenerated
extern "C" {
    fn foo_process(data: *const u8, len: usize) -> i32;
}
// libfoo 1.3 changes the signature to (data, len, flags) — this still
// LINKS (symbol name unchanged) and silently reads garbage for `flags`.
```
::

## Production Failure Modes & Anti-Patterns

### Anti-pattern: `unwrap()` on `CString::new` with untrusted input

::code-wrapper{language="rust"}
```rust
// WRONG — panics the moment a log message contains an embedded NUL byte,
// which is a perfectly valid &str (Rust strings are length-prefixed).
pub fn log_message(msg: &str) {
    let c_msg = CString::new(msg).unwrap();
    unsafe { c_syslog(c_msg.as_ptr()); }
}
```
::

::code-wrapper{language="rust"}
```rust
// RIGHT — sanitize deliberately, or propagate the error to the caller.
pub fn log_message(msg: &str) -> Result<(), std::ffi::NulError> {
    let sanitized: String = msg.chars().filter(|&c| c != '\0').collect();
    let c_msg = CString::new(sanitized).expect("NUL bytes filtered above");
    unsafe { c_syslog(c_msg.as_ptr()); }
    Ok(())
}
```
::

### Anti-pattern: mismatched allocators disguised as working code

::code-wrapper{language="rust"}
```rust
// WRONG — Rust's global allocator frees memory malloc'd by C.
// "Works" on Linux glibc by coincidence (both call the same malloc/free),
// breaks the moment a custom #[global_allocator] (jemalloc, mimalloc) appears.
#[no_mangle]
pub extern "C" fn process(data: *mut u8, len: usize) {
    unsafe {
        let slice = std::slice::from_raw_parts_mut(data, len);
        let _boxed = Box::from_raw(data); // UB: data was malloc'd in C
    }
}
```
::

::code-wrapper{language="rust"}
```rust
// RIGHT — never take Rust ownership of C-allocated memory; require the
// C side to free what it allocated, via its own free function.
extern "C" { fn c_free(ptr: *mut u8); }

#[no_mangle]
pub extern "C" fn process(data: *mut u8, len: usize) {
    unsafe {
        let slice = std::slice::from_raw_parts_mut(data, len);
        // use slice; caller (C) remains responsible for freeing `data`
    }
}
```
::

::code-wrapper{language="rust"}
```rust
// RIGHT (alternative) — if Rust must own it, allocate it in Rust and hand
// out a matching free function so ownership never crosses allocators unpaired.
#[no_mangle]
pub extern "C" fn rust_alloc_buf(len: usize) -> *mut u8 {
    let mut v = vec![0u8; len];
    let ptr = v.as_mut_ptr();
    std::mem::forget(v);
    ptr
}

#[no_mangle]
pub unsafe extern "C" fn rust_free_buf(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, len, len)); // only valid on Rust-allocated ptr
}
```
::

### Anti-pattern: letting a panic unwind into C stack frames

::code-wrapper{language="rust"}
```rust
// WRONG — panicking here unwinds into C's stack frames: UB. Might abort
// cleanly, might corrupt the stack, differs by platform/opt level.
#[no_mangle]
pub extern "C" fn parse_config(json: *const c_char) -> i32 {
    let s = unsafe { CStr::from_ptr(json) }.to_str().unwrap(); // can panic
    let cfg: Config = serde_json::from_str(s).unwrap();        // can panic
    cfg.value
}
```
::

::code-wrapper{language="rust"}
```rust
// RIGHT — catch_unwind at every extern "C" boundary; convert to an error code.
#[no_mangle]
pub extern "C" fn parse_config(json: *const c_char) -> i32 {
    let result = std::panic::catch_unwind(|| {
        let s = unsafe { CStr::from_ptr(json) }.to_str()?;
        let cfg: Config = serde_json::from_str(s)?;
        Ok::<_, Box<dyn std::error::Error>>(cfg.value)
    });
    match result {
        Ok(Ok(value)) => value,
        _ => -1, // signal failure via the C-side error convention
    }
}
```
::

::code-wrapper{language="rust"}
```rust
// BETTER — don't rely on every contributor remembering; wrap it once.
macro_rules! ffi_boundary {
    ($body:expr) => {
        match std::panic::catch_unwind(|| $body) {
            Ok(v) => v,
            Err(_) => -1,
        }
    };
}

#[no_mangle]
pub extern "C" fn parse_config2(json: *const c_char) -> i32 {
    ffi_boundary!({
        let s = unsafe { CStr::from_ptr(json) }.to_str().unwrap();
        serde_json::from_str::<Config>(s).unwrap().value
    })
}
```
::

### Anti-pattern: trusting `bindgen` output without pinning the header version

::code-wrapper{language="toml"}
```toml
# WRONG — "any 1.x" lets the C lib change struct layout under you; your
# checked-in bindings.rs silently goes stale.
[dependencies]
# vendored via build.rs: fetch("libfoo", "^1.0")
```
::

::code-wrapper{language="bash"}
```bash
# RIGHT — pin exactly, regenerate in CI on every bump, diff the output.
# vendor/libfoo == 1.4.2 (exact, checked into vendor/VERSION)
bindgen vendor/libfoo-1.4.2/foo.h -o src/bindings.rs
git diff --exit-code src/bindings.rs || echo "bindings drifted — review before merging"
```
::

## Architectural Application

Split raw bindings from the safe API — the `-sys` crate convention:

::code-wrapper{language="rust" filename="libfoo-sys/src/lib.rs"}
```rust
// libfoo-sys: ONLY extern "C" declarations, repr(C) structs, and build.rs.
// No safe API, no ergonomic promises — this is the entire unsafe surface.
#[repr(C)]
pub struct FooHandle { _private: [u8; 0] }

extern "C" {
    pub fn foo_open(path: *const std::os::raw::c_char) -> *mut FooHandle;
    pub fn foo_close(h: *mut FooHandle);
    pub fn foo_query(h: *mut FooHandle, key: *const std::os::raw::c_char) -> i32;
}
```
::

::code-wrapper{language="rust" filename="libfoo/src/lib.rs"}
```rust
// libfoo: safe wrapper. No raw pointers or `unsafe` visible to consumers.
use libfoo_sys as sys;
use std::ffi::CString;

pub struct Foo(*mut sys::FooHandle);

impl Foo {
    pub fn open(path: &str) -> Result<Self, std::ffi::NulError> {
        let c_path = CString::new(path)?;
        let handle = unsafe { sys::foo_open(c_path.as_ptr()) };
        Ok(Foo(handle))
    }

    pub fn query(&self, key: &str) -> Result<i32, std::ffi::NulError> {
        let c_key = CString::new(key)?;
        Ok(unsafe { sys::foo_query(self.0, c_key.as_ptr()) })
    }
}

impl Drop for Foo {
    fn drop(&mut self) { unsafe { sys::foo_close(self.0); } }
}
```
::

Never let raw FFI types leak into the public API:

::code-wrapper{language="rust"}
```rust
// WRONG — consumer now needs `unsafe` and must understand pointer lifetime.
pub fn open_db(path: *const std::os::raw::c_char) -> *mut sys::FooHandle { /* ... */ }

// RIGHT — ordinary Rust types in, ordinary Rust types (or Result) out.
pub fn open_db(path: &str) -> Result<Foo, std::ffi::NulError> { Foo::open(path) }
```
::

Panic strategy is a workspace-level decision, not per-crate:

::code-wrapper{language="toml"}
```toml
# top-level Cargo.toml — applies to the whole binary; you cannot mix
# unwind/abort across crates in one compiled artifact that embeds a cdylib.
[profile.release]
panic = "abort"
```
::

Treat generated headers/bindings as CI-checked build artifacts:

::code-wrapper{language="yaml"}
```yaml
# .github/workflows/ffi-drift.yml
- run: cbindgen --crate my_lib --output include/my_lib.h
- run: git diff --exit-code include/my_lib.h # fail build on undocumented drift
- run: bindgen vendor/my_lib.h -o src/bindings.rs
- run: git diff --exit-code src/bindings.rs
```
::

## 💡 Tips & Tricks

- **Debug**: run Miri on FFI wrapper boundary tests — catches what x86 tolerates silently.
  ::code-wrapper{language="bash"}
  ```bash
  cargo +nightly miri test -p libfoo
  ```
  ::
- **Idiom**: keep raw declarations private, expose only safe `Result` APIs.
  ::code-wrapper{language="rust"}
  ```rust
  mod sys { extern "C" { pub fn raw_call(x: i32) -> i32; } }
  pub fn safe_call(x: i32) -> Result<i32, &'static str> {
      if x < 0 { return Err("negative input"); }
      Ok(unsafe { sys::raw_call(x) })
  }
  ```
  ::
- **Debug**: regenerate the C header from Rust signatures in CI, don't hand-maintain it.
  ::code-wrapper{language="bash"}
  ```bash
  cbindgen --crate my_lib --output my_lib.h
  ```
  ::
- **Idiom**: `Option<extern "C" fn(...)>` niche-optimizes `None` to a null pointer — this is *why* it models nullable C callbacks correctly.
  ::code-wrapper{language="rust"}
  ```rust
  #[repr(C)]
  struct Callbacks {
      on_event: Option<extern "C" fn(i32)>, // None <=> NULL at the ABI level
  }
  ```
  ::
- **Performance**: pass large structs by pointer once they exceed a few machine words.
  ::code-wrapper{language="rust"}
  ```rust
  #[repr(C)]
  struct BigStruct { data: [u64; 32] } // 256 bytes

  extern "C" {
      fn process_big(s: *const BigStruct); // RIGHT — pointer, no copy
      fn process_big_by_value(s: BigStruct); // avoid — ABI copy overhead
  }
  ```
  ::
- **Debug**: `RUST_BACKTRACE` doesn't help when the C side segfaults — use a native debugger.
  ::code-wrapper{language="bash"}
  ```bash
  rust-gdb --args ./my_binary
  (gdb) catch signal SIGSEGV
  (gdb) run
  ```
  ::

## ⚠️ Edge Cases & Gotchas

- **Portability**: allocator mismatch appears to work on Linux glibc, then corrupts elsewhere.
  ::code-wrapper{language="rust"}
  ```rust
  // "Works" today; breaks the day #[global_allocator] = Jemalloc is added.
  unsafe { let _ = Box::from_raw(c_malloced_ptr); } // UB regardless of "working"
  ```
  ::
- **Safety**: unwinding into C frames is UB, not a clean panic.
  ::code-wrapper{language="rust"}
  ```rust
  #[no_mangle]
  pub extern "C" fn callback() { panic!("boom"); } // UB once C is on the stack above
  ```
  ::
- **Safety**: missing `#[repr(C)]` fails silently — no compiler warning, just wrong reads.
  ::code-wrapper{language="rust"}
  ```rust
  struct Shared { a: u8, b: u64 } // compiles fine; layout NOT guaranteed to match C
  ```
  ::
- **Idiom**: `CString::new` rejects interior NUL at runtime, not compile time.
  ::code-wrapper{language="rust"}
  ```rust
  assert!(CString::new("hi\0there").is_err()); // Err, never a truncated string
  ```
  ::
- **Safety**: returning a pointer to a stack local is classic dangling-pointer UB.
  ::code-wrapper{language="rust"}
  ```rust
  fn get_ptr() -> *const i32 {
      let x = 5;
      &x as *const i32 // dangles the instant this function returns
  }
  ```
  ::
- **Idiom**: variadic functions can only be *declared* via FFI, never authored in plain Rust.
  ::code-wrapper{language="rust"}
  ```rust
  extern "C" {
      fn printf(fmt: *const c_char, ...) -> i32; // legal only in an extern block
  }
  // fn my_variadic(fmt: &str, ...) {} // not valid Rust syntax outside FFI
  ```
  ::
- **Portability**: `"system"` means different things on 32-bit vs 64-bit Windows.
  ::code-wrapper{language="rust"}
  ```rust
  // Correct cross-target choice for a WinAPI DLL built with stdcall:
  extern "system" { fn SomeWinApi(x: i32) -> i32; } // resolves per-target correctly
  extern "C" { fn SomeWinApi(x: i32) -> i32; }       // WRONG on 32-bit Windows only
  ```
  ::

## 🧠 Spot the Bug

What's unsafe about this "safe" wrapper, and what happens when a caller passes a string containing an embedded null byte?

::code-wrapper{language="rust"}
```rust
use std::ffi::CString;
use std::os::raw::c_char;

extern "C" {
    fn puts(s: *const c_char) -> i32;
}

pub fn print_line(s: &str) {
    let c_string = CString::new(s).unwrap();
    unsafe {
        puts(c_string.as_ptr());
    }
}

fn main() {
    print_line("hello\0world");
}
```
::

<details>
<summary>Answer</summary>

It panics: `called \`Result::unwrap()\` on an \`Err\` value: NulError(...)`.

::code-wrapper{language="rust"}
```rust
// Rust &str can hold an embedded \0 as an ordinary byte (length-prefixed,
// not null-terminated). CString::new refuses to construct rather than
// silently truncate at the first \0 — which would drop "world" with no error.
assert!(CString::new("hello\0world").is_err());
```
::

The fix: never `.unwrap()` a `CString::new` whose input is externally controlled.

::code-wrapper{language="rust"}
```rust
pub fn print_line(s: &str) -> Result<(), std::ffi::NulError> {
    let c_string = CString::new(s)?; // propagate instead of panicking
    unsafe { puts(c_string.as_ptr()); }
    Ok(())
}
```
::

</details>

## Summary

::code-wrapper{language="rust"}
```rust
// extern "C" = calling-convention promise, not a runtime check.
extern "C" { fn f(x: i32) -> i32; }

// #[repr(C)] = the only guaranteed-C-compatible layout; absence fails silently.
#[repr(C)] struct S { a: u8, b: u64 }

// Ownership never crosses allocators unpaired.
extern "C" { fn c_free(p: *mut u8); } // C-allocated memory: freed by C, always

// Panics never cross extern "C" boundaries.
#[no_mangle]
pub extern "C" fn entry() -> i32 {
    std::panic::catch_unwind(|| 0).unwrap_or(-1)
}
```
::

Architect FFI as an isolated `-sys` crate (raw bindings only) wrapped by a safe crate (no `unsafe` visible to consumers) — this keeps the unsafe surface small, auditable, and separate from ordinary Rust code churn.

Next: Attributes and conditional compilation — how `#[cfg]`, `#[repr]`, and friends control what actually gets compiled.
