# 26 — FFI (Foreign Function Interface)

Rust talks to C — and through C, to almost every other language. This chapter covers calling C from Rust, Rust from C, and the supporting ecosystem.

## Calling C from Rust

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

- `extern "C"` declares a foreign function with the C ABI.
- Calling requires `unsafe` (the compiler can't verify the signature or memory safety).
- The linker resolves the symbol at link time.

### Linking

Add the C library to `Cargo.toml` via `build.rs`:

::code-wrapper{language="rust"}
```rust
// build.rs
fn main() {
    println!("cargo:rustc-link-lib=c");
}
```
::

Or use `#[link(name = "mylib")]`:

::code-wrapper{language="rust"}
```rust
#[link(name = "mylib")]
extern "C" {
    fn my_func(x: i32) -> i32;
}
```
::

### `bindgen` for Auto-Binding

Hand-writing extern blocks is error-prone. `bindgen` generates Rust bindings from C headers:

::code-wrapper{language="toml"}
```toml
# Cargo.toml
[build-dependencies]
bindgen = "0.69"
```
::

::code-wrapper{language="rust"}
```rust
// build.rs
use std::env;
use std::path::PathBuf;

fn main() {
    let bindings = bindgen::Builder::default()
        .header("wrapper.h")
        .parse_callbacks(Box::new(bindgen::CargoCallbacks::new()))
        .generate()
        .expect("Unable to generate bindings");

    let out_path = PathBuf::from(env::var("OUT_DIR").unwrap());
    bindings.write_to_file(out_path.join("bindings.rs")).unwrap();
}
```
::

::code-wrapper{language="rust"}
```rust
// src/lib.rs
include!(concat!(env!("OUT_DIR"), "/bindings.rs"));
```
::

### Wrapping in Safe APIs

Raw FFI bindings are unsafe. Wrap them:

::code-wrapper{language="rust"}
```rust
mod sys {
    extern "C" {
        pub fn strlen(s: *const u8) -> usize;
    }
}

pub fn strlen(s: &CStr) -> usize {
    unsafe { sys::strlen(s.as_ptr()) }
}
```
::

`CStr`/`CString` are the safe wrappers around C's null-terminated strings.

## Calling Rust from C

::code-wrapper{language="rust"}
```rust
#[no_mangle]
pub extern "C" fn add(a: i32, b: i32) -> i32 {
    a + b
}
```
::

- `#[no_mangle]`: keep the symbol name exactly `add` (don't mangle).
- `pub extern "C"`: export with C ABI.

Build as a static or dynamic library:

::code-wrapper{language="toml"}
```toml
[lib]
crate-type = ["staticlib", "cdylib", "rlib"]
```
::

- `staticlib`: `.a`/`.lib` static archive.
- `cdylib`: `.so`/`.dylib`/`.dll` dynamic library.
- `rlib`: Rust-specific (for other Rust crates).

### C Header

Generate a header for C consumers with `cbindgen`:

::code-wrapper{language="bash"}
```bash
cargo install cbindgen
cbindgen --crate my_lib --output my_lib.h
```
::

## C Strings: `CString` and `CStr`

::code-wrapper{language="rust"}
```rust
use std::ffi::{CString, CStr};

let c_string = CString::new("hello").unwrap();
let ptr: *const u8 = c_string.as_ptr();    // null-terminated
let cstr = unsafe { CStr::from_ptr(ptr) };
let rust_str = cstr.to_str().unwrap();
```
::

- `CString`: owned, null-terminated; can't contain interior NUL bytes (constructor returns `Result`).
- `CStr`: borrowed, null-terminated; from `from_ptr` (unsafe) or by deref of `CString`.

## OS Strings: `OsString` and `OsStr`

For platform-native strings (file paths, env):

::code-wrapper{language="rust"}
```rust
use std::ffi::OsString;
let s: OsString = std::env::args_os().next().unwrap();
```
::

- `OsString`/`OsStr` are the OS-native string equivalents.
- `PathBuf`/`Path` are wrappers for path semantics (cross-platform).

## Memory Ownership Across FFI

::code-wrapper{language="rust"}
```rust
// Rust allocates, C frees
#[no_mangle]
pub extern "C" fn make_string() -> *mut u8 {
    let s = CString::new("hello").unwrap();
    s.into_raw()      // leaks ownership to C
}

// C frees via this
#[no_mangle]
pub extern "C" fn free_string(ptr: *mut u8) {
    unsafe { let _ = CString::from_raw(ptr); }
}
```
::

`CString::into_raw`/`from_raw` are the standard pattern for handing Rust strings to C and getting them back.

### C allocates, Rust frees

If C allocates with `malloc`, Rust must call `free` (or the equivalent), not Rust's allocator. Provide a destructor function on the C side.

### Common Pitfall: Mismatched Allocators

Rust's `Vec::push`/`String::push` use Rust's allocator. C's `malloc`/`free` use the C library. Mixing them is UB. Always free with the allocator that allocated.

## Structs Across FFI

::code-wrapper{language="rust"}
```rust
#[repr(C)]
struct Point {
    x: f64,
    y: f64,
}

#[no_mangle]
pub extern "C" fn translate(p: Point, dx: f64, dy: f64) -> Point {
    Point { x: p.x + dx, y: p.y + dy }
}
```
::

- `#[repr(C)]` forces C-compatible layout (no Rust-specific reordering).
- Field order matters and matches C's.
- Avoid `Box<T>`/`Vec<T>` in `repr(C)` structs (Rust-specific layout).

### Opaque Types

When C uses an opaque pointer (`typedef struct Foo Foo;`), use a zero-sized ZST:

::code-wrapper{language="rust"}
```rust
#[repr(C)]
pub struct Foo { _private: [u8; 0] }

extern "C" {
    pub fn foo_new() -> *mut Foo;
    pub fn foo_free(f: *mut Foo);
}
```
::

`[u8; 0]` is the convention for opaque types.

## Function Pointers

::code-wrapper{language="rust"}
```rust
#[repr(C)]
struct Callbacks {
    on_event: Option<extern "C" fn(data: *mut u8)>,
}

extern "C" fn my_callback(data: *mut u8) {
    let s = unsafe { CStr::from_ptr(data as *const i8) };
    println!("event: {:?}", s);
}
```
::

C callbacks into Rust: store as `Option<extern "C" fn(...)>`, pass `my_callback as extern "C" fn(...)`, handle the user-data void pointer.

## Panic Across FFI — UB

Unwinding across an FFI boundary is UB. Solutions:
- Set `panic = "abort"` in `Cargo.toml` (kills the process on panic).
- Use `std::panic::catch_unwind` at the boundary and convert to a C error code.

::code-wrapper{language="rust"}
```rust
#[no_mangle]
pub extern "C" fn safe_call() -> i32 {
    match std::panic::catch_unwind(|| risky_fn()) {
        Ok(_) => 0,
        Err(_) => -1,
    }
}
```
::

## Calling Other Languages

### Python (PyO3)

::code-wrapper{language="rust"}
```rust
use pyo3::prelude::*;

#[pyfunction]
fn add(a: i64, b: i64) -> i64 { a + b }

#[pymodule]
fn my_module(_py: Python, m: &PyModule) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(add, m)?)?;
    Ok(())
}
```
::

Build with `maturin develop`. PyO3 handles Python ABI.

### Node.js (`napi-rs`)

::code-wrapper{language="rust"}
```rust
#[napi]
pub fn add(a: i32, b: i32) -> i32 { a + b }
```
::

Build with `napi build`.

### WebAssembly

::code-wrapper{language="bash"}
```bash
rustup target add wasm32-unknown-unknown
cargo build --target wasm32-unknown-unknown --release
```
::

For JS interop, use `wasm-bindgen`:

::code-wrapper{language="rust"}
```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 { a + b }
```
::

### C++ (`cxx`)

The `cxx` crate provides safe bidirectional FFI:

::code-wrapper{language="rust"}
```rust
#[cxx::bridge]
mod ffi {
    extern "C++" {
        include!("mylib.h");
        fn cpp_func(x: i32) -> i32;
    }
}
```
::

`cxx` generates both sides; types are restricted to a safe subset.

## `extern "C"` and ABIs

Common ABIs:
- `"C"` — System V / cdecl depending on platform.
- `"stdcall"` — Windows x32.
- `"system"` — `stdcall` on Win32, `"C"` on Win64.
- `"win64"`, `"sysv64"` — explicit x64/SysV.

Mismatched ABIs cause subtle corruption. Use `bindgen` to get them right.

## Build Scripts for FFI

::code-wrapper{language="rust"}
```rust
// build.rs
fn main() {
    cc::Build::new()
        .file("src/c_code.c")
        .compile("my_c_code");
    println!("cargo:rerun-if-changed=src/c_code.c");
}
```
::

`cc` crate compiles C/C++ as part of `cargo build`. Add it as a build dependency:

::code-wrapper{language="toml"}
```toml
[build-dependencies]
cc = "1.0"
```
::

## Common Pitfalls

- **Mismatched allocators**: UB; always free with the originating allocator.
- **Wrong ABI**: silent corruption; use `bindgen`.
- **Unwinding across FFI**: UB; use `catch_unwind` or `panic = "abort"`.
- **Returning references to stack data**: classic UB; return owned or pass buffers in.
- **`#[repr(C)]` missing**: Rust may reorder fields; mismatch with C struct.
- **Nullable function pointers**: use `Option<extern "C" fn(...)>` so the `None` variant is a null pointer.
- **Variadic FFI**: only `extern "C"` functions can be variadic.
- **Thread-local state**: FFI calls into Rust from C threads don't have Rust's thread-local set up.
- **String encoding**: C strings are NUL-terminated byte arrays; Rust strings are UTF-8. `OsStr` for paths.
- **`Box<T>` across FFI**: not stable layout; use raw pointers explicitly with `Box::into_raw`/`from_raw`.

## Useful Crates

- `bindgen`: auto-generate Rust bindings from C.
- `cbindgen`: generate C headers from Rust.
- `cc`: compile C/C++ in `build.rs`.
- `cxx`: safe C++ interop.
- `pyo3`: Python bindings.
- `napi-rs`: Node.js bindings.
- `wasm-bindgen`: JS/WebAssembly bindings.
- `jni`: Java/JVM bindings.
- `libc`: raw C types and constants (`c_int`, `c_char`, `size_t`, etc.).
- `raw-cpuid`, `nix`, `winapi`/`windows-sys`: OS bindings.

## Summary

`extern "C"` declares FFI. `#[no_mangle] pub extern "C" fn` exports Rust to C. `#[repr(C)]` controls struct layout. Use `bindgen`/`cbindgen`/`cxx` for safe interop. Memory ownership must match allocators. Panics must not cross FFI. `CString`/`CStr`/`OsString`/`OsStr` for string interop. Wrap unsafe bindings in safe abstractions.

Next: Attributes and conditional compilation.