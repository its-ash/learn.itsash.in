# 26 — FFI (Calling C, and Being Called From C)

**FFI** (Foreign Function Interface) connects Rust with C — and anything that speaks the C ABI (C++, Python, Swift, Go…). The compiler can't check the other side, so every FFI call is `unsafe`.

## Calling a C Function

::code-wrapper{language="rust"}
```rust
use std::ffi::c_int;

unsafe extern "C" {                  // edition 2024: extern blocks must be marked `unsafe`
    fn abs(x: c_int) -> c_int;       // from the C standard library
}

fn main() {
    let v = unsafe { abs(-5) };      // calling it is unsafe: you vouch the signature is right
    println!("{v}");                 // 5
}
```
::

**Tricky**: the old syntax no longer compiles in edition 2024:

::code-wrapper{language="rust"}
```rust
// extern "C" { fn abs(x: i32) -> i32; }
// error: extern blocks must be unsafe
```
::

**Tricky**: Rust trusts your declaration completely. Declare `abs` as taking an `f64` and it still compiles — and produces garbage at run time. Always copy signatures from the real header (or generate them with `bindgen`).

## C Types

Use the `std::ffi` aliases instead of guessing sizes:

| C | Rust |
|---|---|
| `int` | `c_int` (usually `i32`) |
| `long` | `c_long` (32 **or** 64 bits depending on OS!) |
| `char` | `c_char` (`i8` or `u8` depending on platform) |
| `double` | `f64` / `c_double` |
| `char*` | `*const c_char` |
| `void*` | `*mut c_void` |

## Strings: `CString` and `CStr`

C strings end with a `\0` byte; Rust strings don't. Convert at the boundary:

::code-wrapper{language="rust"}
```rust
use std::ffi::{CStr, CString, c_char};

unsafe extern "C" {
    fn strlen(s: *const c_char) -> usize;
}

fn main() {
    let s = CString::new("héllo").unwrap();       // Rust → C: adds the trailing \0
    let n = unsafe { strlen(s.as_ptr()) };
    println!("{n}");                              // 6 — bytes, like Rust's len()

    let back: &CStr = s.as_c_str();               // C → Rust
    println!("{:?}", back.to_str());              // Ok("héllo")
}
```
::

**Tricky**: a `\0` inside the text is an error, not a silent truncation:

::code-wrapper{language="rust"}
```rust
use std::ffi::CString;

fn main() {
    println!("{:?}", CString::new("a\0b"));   // Err(NulError(1, [97, 0, 98]))
}
```
::

Handle it — never `.unwrap()` on user input.

**Tricky**: a pointer to a temporary `CString` dangles immediately:

::code-wrapper{language="rust"}
```rust
use std::ffi::CString;

fn main() {
    // let p = CString::new("hi").unwrap().as_ptr();
    // warning: this creates a dangling pointer because temporary `CString` is dropped at end of statement

    let owned = CString::new("hi").unwrap();     // keep the CString alive in a variable
    let p = owned.as_ptr();                      // p is valid while `owned` lives
    let _ = p;
}
```
::

## Structs Across the Boundary

::code-wrapper{language="rust"}
```rust
#[repr(C)]                       // REQUIRED: C-compatible field order and padding
pub struct Point {
    x: f64,
    y: f64,
}
```
::

Without `#[repr(C)]`, Rust may reorder fields (chapter 11) and C would read the wrong bytes.

## Exposing Rust to C

::code-wrapper{language="rust"}
```rust
#[repr(C)]
pub struct Point { x: f64, y: f64 }

#[unsafe(no_mangle)]                         // edition 2024 spelling; keeps the symbol name `point_len`
pub extern "C" fn point_len(p: Point) -> f64 {
    (p.x * p.x + p.y * p.y).sqrt()
}
```
::

::code-wrapper{language="toml" filename="Cargo.toml"}
```toml
[lib]
crate-type = ["cdylib"]     # build a .so / .dylib / .dll that C can load
```
::

**Tricky**: `#[no_mangle]` without `unsafe(...)` is an error in edition 2024: `error: unsafe attribute used without unsafe`.

## Who Frees the Memory?

Memory must be freed by the **same** allocator that created it. Give C a matching "free" function:

::code-wrapper{language="rust"}
```rust
#[unsafe(no_mangle)]
pub extern "C" fn counter_new() -> *mut u32 {
    Box::into_raw(Box::new(0))              // hand ownership to C
}

/// # Safety
/// `p` must come from `counter_new` and must not be used afterwards.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn counter_free(p: *mut u32) {
    if !p.is_null() {
        drop(unsafe { Box::from_raw(p) });  // take ownership back, then free
    }
}
```
::

Calling C's `free()` on a Rust `Box` (or Rust's drop on C's `malloc` memory) is undefined behavior.

## Panics Must Not Cross Into C

**Tricky**: a panic inside an `extern "C"` function **aborts the whole process** — even `catch_unwind` around the call can't stop it:

::code-wrapper{language="rust"}
```rust
#[unsafe(no_mangle)]
pub extern "C" fn boom() {
    panic!("ffi panic");
    // → "panic in a function that cannot unwind" → process aborts
}
```
::

Catch panics **inside** the exported function and return an error code:

::code-wrapper{language="rust"}
```rust
use std::ffi::c_int;

#[unsafe(no_mangle)]
pub extern "C" fn safe_entry(x: c_int) -> c_int {
    match std::panic::catch_unwind(|| risky(x)) {
        Ok(v) => v,
        Err(_) => -1,                 // tell C something went wrong
    }
}

fn risky(x: c_int) -> c_int {
    if x < 0 { panic!("negative"); }
    x * 2
}
```
::

## 💡 Tips & Tricks

- **Tooling** — `bindgen` generates Rust declarations from C headers; `cbindgen` generates C headers from Rust.
- **Idiom** — wrap every C function in a small safe Rust function and keep the `unsafe` there.
- **Idiom** — always pair an exported "create" function with an exported "free" function.
- **Portability** — use `c_long`, `c_char` etc., never hard-code `i64` for C `long`.
- **Debug** — link errors ("undefined symbol") mean the library isn't linked or the name is mangled.

## ⚠️ Edge Cases & Gotchas

- **Edition 2024** — `extern` blocks need `unsafe extern`, and `no_mangle` needs `#[unsafe(no_mangle)]`.
- **Signatures** — a wrong declaration compiles fine and fails at run time.
- **Strings** — interior `\0` makes `CString::new` fail; `.as_ptr()` on a temporary dangles.
- **Layout** — structs shared with C need `#[repr(C)]`.
- **Memory** — free with the allocator that allocated.
- **Panics** — a panic escaping an `extern "C"` function aborts the process.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
use std::ffi::{CString, c_char};

unsafe extern "C" {
    fn puts(s: *const c_char) -> i32;
}

fn print_name(name: &str) {
    let ptr = CString::new(name).unwrap().as_ptr();
    unsafe { puts(ptr); }
}
```
::

<details>
<summary>Answer</summary>

Two bugs:

1. `CString::new(name).unwrap()` is a temporary dropped at the end of the `let` line, so `ptr` dangles — `puts` reads freed memory (the compiler warns: "this creates a dangling pointer").
2. `.unwrap()` panics if `name` contains `\0`.

::code-wrapper{language="rust"}
```rust
fn print_name(name: &str) -> Result<(), std::ffi::NulError> {
    let c = CString::new(name)?;       // keep it alive, handle the error
    unsafe { puts(c.as_ptr()); }
    Ok(())
}
```
::

</details>

## Summary

FFI calls are `unsafe` because the compiler can't see the other side. Declare signatures with `std::ffi` types, convert strings with `CString`/`CStr`, use `#[repr(C)]` for shared structs, free memory on the side that allocated it, and never let a panic reach C.

Next: Attributes & `cfg`.
