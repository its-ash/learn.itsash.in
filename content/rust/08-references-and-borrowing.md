# 08 — References & Borrowing

Ownership is heavy. **References** let you use a value without taking ownership.

## Shared References `&T`

### Why this exists

A shared reference `&T` lets you **read** a value without owning it and without copying it. This is the core mechanism that decouples *access* from *ownership* in Rust: a function can inspect your `String` without taking it from you or cloning it. Because the borrow is shared and immutable, **any number of `&T`** can exist simultaneously — multiple readers can coexist freely, which is what makes read-only data sharing trivial and cheap.

### When to reach for it

Use `&T` in function signatures whenever you only need to *read* the value (compute a length, format it, search it). Taking ownership would force the caller to hand over the value or clone it; taking `&mut T` would needlessly exclude other readers. The reference itself is `Copy`, so passing it around costs nothing more than copying a pointer.

::code-wrapper{language="rust"}
```rust
fn len(s: &String) -> usize { s.len() }

let s = String::from("hi");
let l = len(&s);     // borrow — s still owned by caller
println!("{s} {l}"); // OK
```
::

- `&T` is a **shared, immutable** borrow.
- You can have **any number** of simultaneous `&T` to the same value.
- `&T` is `Copy` (the reference itself can be copied).

## Mutable References `&mut T`

### Why exclusivity is required

A mutable reference `&mut T` is **exclusive**: at most one can be active at a time, and it can't coexist with any `&T` to the same data. This rule is what makes Rust's data-race freedom a compile-time guarantee rather than a runtime check. If two `&mut`s were allowed to the same memory, they could disagree about mutations (data races); if a `&mut` could coexist with a `&`, the `&` could observe a mutation mid-read (iterator invalidation, reallocation dangling the reference). By making `&mut` exclusive *at compile time*, Rust eliminates these entire classes of bugs that other languages detect at runtime (or never).

### When to reach for it

Use `&mut T` when a function needs to *modify* the value without taking ownership. Taking ownership would force the caller to give up the value (and then take it back somehow); `&mut` lets the caller retain ownership while granting temporary write access. The tradeoff: the caller must guarantee no other access overlaps, which the borrow checker enforces.

::code-wrapper{language="rust"}
```rust
fn push(s: &mut String) { s.push('!'); }

let mut s = String::from("hi");
push(&mut s);
println!("{s}");   // "hi!"
```
::

- `&mut T` is an **exclusive** borrow.
- You can have **exactly one** active `&mut T` at a time.
- You cannot mix `&T` and `&mut T` to the same data while both are alive.

## The Borrow Rules

### Why these two rules?

The borrow rules are the *entire foundation* of Rust's memory-safety-without-GC story. They replace the runtime aliasing checks (or silent UB) found in other languages with a compile-time guarantee:

> At any given time, you can have **either**:
> - One mutable reference, **or**
> - Any number of immutable references.

The conceptual basis is **aliasing + mutation = bugs**: if data can be both aliased (seen from multiple places) and mutated, you get data races (concurrency), iterator invalidation, use-after-free, and dangling pointers. Rust's rule says you may have *aliasing* (`&T`, many readers) OR *mutation* (`&mut T`, one writer), but never both at once. This single invariant, checked at compile time, is what lets Rust promise thread safety and memory safety with zero runtime cost — the borrow checker is essentially a compile-time proof that no aliasing+mutation exists.

These rules are checked at compile time. Violations produce `E0502` (aliased mutable borrow) and similar.

::code-wrapper{language="rust"}
```rust
let mut v = vec![1, 2, 3];
let r = &v;
let r2 = &v;          // OK — multiple shared
println!("{r} {r2}");
let m = &mut v;       // OK — shared refs ended above (NLL)
m.push(4);
```
::
::

## Non-Lexical Lifetimes (NLL)

Pre-2018, references were valid until the end of their lexical scope. NLL shrinks a reference's lifetime to its **last use**:

::code-wrapper{language="rust"}
```rust
let mut v = vec![1, 2, 3];
let r = &v;
println!("{r}");      // last use of r
v.push(4);           // OK — r no longer used
```
::

Without NLL this would error. With NLL it compiles.

## 💡 Tips & Tricks

- **Debug**: when the borrow checker rejects code you're sure is fine, add explicit `{ }` blocks around each borrow's intended lifetime — this often reveals exactly where NLL's "last use" inference disagrees with your mental model, before you touch a single type.
- **Idiom**: prefer reborrowing (`&mut *r`) over passing the original `&mut T` by value into a helper you'll need again afterward — reborrowing keeps the original reference alive (just temporarily inactive) instead of moving it away permanently.
- **Idiom**: split borrows on distinct struct fields (`&mut s.x`, `&mut s.y`) instead of taking one `&mut s` and threading it through — the compiler can see field-level disjointness but not disjointness hidden behind a single struct-wide borrow.
- **Debug**: `cargo build --edition 2021` (or checking your `Cargo.toml`'s `edition` key) matters for borrow-checker behavior — NLL and 2021 disjoint closure captures relax rules that were errors under the 2015/2018 borrow checker, so an old edition can reject code a newer one accepts.
- **Performance**: `&[T]`/`&str` function parameters cost nothing over `&Vec<T>`/`&String` at runtime (both are effectively a pointer+length) but accept a strictly wider range of callers — there's no tradeoff, only upside, to preferring the slice form.
- **Clippy**: `clippy::needless_borrow` and `clippy::ptr_arg` catch the `&Vec<T>`/`&String` anti-pattern and redundant `&` automatically — worth enabling even in early-stage code.

## Reference Scope Edge Cases

::code-wrapper{language="rust"}
```rust
let mut v = vec![1, 2, 3];
let r = &v;
let r2 = &v;          // multiple shared OK
v.push(4);            // ERROR: cannot borrow v as mutable because r/r2 alive
println!("{r} {r2}");
```
::

Here the mutable borrow happens *before* the last use of `r`, so it's rejected.

## 🧠 Spot the Bug

Why does this fail to compile, even though `v.push(4)` looks like it happens after `r`'s only use?

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![1, 2, 3];
    let r = &v[0];
    let doubled = *r * 2;
    v.push(4);
    println!("{doubled}");
}
```
::

<details>
<summary>Answer</summary>

This one actually **compiles fine** — which is itself the lesson, in contrast to a superficially identical-looking snippet that doesn't:

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![1, 2, 3];
    let r = &v[0];
    v.push(4);
    println!("{r}");
}
```
::

This second version fails: `cannot borrow \`v\` as mutable because it is also borrowed as immutable`. The difference is entirely about **where each reference's last use is**, which Non-Lexical Lifetimes (NLL) computes precisely. In the first (working) version, `r`'s last use is `let doubled = *r * 2;` — by the time `v.push(4)` runs, `r` is dead, so the borrow checker shrinks `r`'s live range to end right there, and the subsequent mutable borrow is fine. In the second (failing) version, `r` is used again *after* `v.push(4)` (inside `println!`), so its live range extends across the `push` call — meaning at the moment of `v.push(4)`, there's simultaneously a live `&v[0]` and an attempted `&mut v`, which is exactly the aliasing the borrow checker exists to prevent (a `push` can reallocate the `Vec`'s backing buffer, which would leave `r` dangling).

**The lesson**: NLL shrinks a reference's live range to its actual last use in the code, not its lexical scope — reordering a `println!` that uses an old reference to *before* a mutation is often the entire fix for a borrow-checker error.

</details>

## Reborrowing

### Why this exists

The borrow rules say "one active `&mut` at a time," but real code needs to *pass* a `&mut` through multiple function calls or re-borrow pieces of it. Reborrowing (`&mut *r`) is the mechanism that reconciles this: it temporarily deactivates the outer `&mut` while the inner borrow is live, then reactivates it when the inner one dies. This is what lets you chain mutable references through function calls without violating the single-`&mut` rule — each call is a transient reborrow, not a second simultaneous `&mut`.

You rarely write `&mut *r` explicitly — reborrowing happens automatically at function call sites (passing `&mut x` to a function that takes `&mut T` reborrows). You'll reach for the explicit form mainly when re-borrowing a slice/field out of an existing `&mut` while the rest stays usable, or when the compiler needs a nudge.

::code-wrapper{language="rust"}
```rust
let mut s = String::from("hi");
let r1: &mut String = &mut s;
let r2: &mut String = &mut *r1;    // reborrow — r1 temporarily inactive
r2.push('!');
// r1 still inactive until r2 dies
r1.push('!');                       // OK now
```
::

Reborrowing is the mechanism by which you can chain mutable references through function calls:

::code-wrapper{language="rust"}
```rust
fn push_all(dst: &mut Vec<i32>, src: &[i32]) {
    for &x in src { dst.push(x); }   // dst reborrows each call
}
```
::
::

## Lifetimes of References (preview)

The compiler tracks lifetimes. A function returning a reference must tie its output lifetime to an input:

::code-wrapper{language="rust"}
```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}
```
::

See the Lifetimes chapter for full details.

## Dangling References — Impossible

::code-wrapper{language="rust"}
```rust
let r;
{
    let s = String::from("hi");
    r = &s;            // ERROR: s does not live long enough
}
println!("{r}");
```
::

The borrow checker rejects code that could produce a dangling reference. This is *the* guarantee that prevents use-after-free in safe Rust.

## Reference Coercion

`&mut T` coerces to `&T` when needed:

::code-wrapper{language="rust"}
```rust
fn len(s: &String) -> usize { s.len() }
let mut s = String::from("hi");
let l = len(&mut s);     // &mut String coerces to &String
```
::

## `&str` vs `&String`

`&String` auto-derefs to `&str`. Idiomatic API: take `&str` (more general; accepts `&String`, `&str`, string literals).

::code-wrapper{language="rust"}
```rust
fn greet(name: &str) { println!("hi {name}"); }
greet("Ada");              // &str
greet(&String::from("Ada"));   // &String coerces to &str
```
::

## `Deref` Coercion

### How it works

`Deref` is a trait with a `deref(&self) -> &Target` method. When the compiler needs a `&Target` but you supply `&T` where `T: Deref<Target = Target>`, it auto-inserts a call to `deref`. This chains: `&Box<String>` → `&String` → `&str`. The coercion exists so that smart pointers (`Box`, `Rc`, `String`, `Vec`) compose with `&`-based APIs ergonomically — you can pass a `&Box<T>` where a `&T` is expected without manual unboxing, because `Deref` makes the smart pointer *transparent* for borrowing.

::code-wrapper{language="rust"}
```rust
let s = String::from("hi");
let r: &str = &s;          // &String -> &str via Deref
let b = Box::new(String::from("hi"));
let r: &str = &b;          // &Box<String> -> &String -> &str
```
::

This is how `Box`, `Rc`, `String`, `Vec` all play nicely with `&`-APIs. Reach for it implicitly; implement `Deref` on your own smart-pointer-like types to get the same ergonomics.

## `as_ref` / `as_mut`

### Why these traits exist

`AsRef<T>` / `AsMut<T>` are the **explicit, type-erased** borrowing traits. Where `Deref` is tied to a single target type and auto-coerces, `AsRef` is generic: a single type can `AsRef` to *multiple* targets (e.g., a path type can `as_ref()` to `Path` and `OsStr`). This makes `AsRef` the right tool for API boundaries that want to accept "anything that can be borrowed as X" without coupling to a specific smart-pointer chain.

Reach for `AsRef<T>` in function signatures when you want callers to pass any of several types that can cheaply yield a `&T` (e.g., `fn open(path: impl AsRef<Path>)` accepts `&str`, `String`, `&Path`, `PathBuf`). Use `AsMut` for the mutable equivalent.

::code-wrapper{language="rust"}
```rust
let s = String::from("hi");
let r: &str = s.as_ref();   // explicit AsRef coercion
```
::

`AsRef<T>` and `AsMut<T>` allow flexible type-erased borrowing.

## Mutable Reference Footguns

- **Two `&mut` to overlapping memory**: `let (a, b) = (&mut v[0], &mut v[1]);` is *OK* (non-overlapping), but `let (a, b) = (&mut v[0], &mut v[0]);` is a compile error.
- **Splitting borrows of a struct**: `let (a, b) = (&mut s.x, &mut s.y);` is allowed (non-overlapping fields).
- **Borrowing through a method**: if `vec.push(x)` mutably borrows `vec`, you can't also `&vec[0]` simultaneously. The classic `v.push(v[0])` error — copy first: `let x = v[0]; v.push(x);`.

## Common Error: `cannot borrow ... as mutable, as it is not declared as mut`

::code-wrapper{language="rust"}
```rust
let s = String::from("hi");
let r = &mut s;    // ERROR: s is not mut
```
::

The variable itself must be `mut` to allow `&mut`.

## Common Error: `cannot borrow ... as mutable ... because it is also borrowed as immutable`

Fix by reordering so the immutable borrow ends before the mutable borrow (NLL), or by cloning, or by restructuring.

## Borrowing Tricks & Patterns

::code-wrapper{language="rust"}
```rust
// Trick: borrow-through-method calling doesn't hold the borrow across statements
let mut v = vec![1, 2, 3];
v.push(v[0]); // ERROR: can't borrow v immutably while mutably borrowed (push)
let x = v[0]; // Solution: capture value first
v.push(x);    // OK

// Trick: reborrow to shorten a mutable borrow
let mut x = String::from("hi");
let r = &mut x;
let r2 = &mut *r; // reborrow r; original r is now inactive
r2.push('!');
// r is still held, but we can use r

// Trick: borrow through method calls can auto-deref
let s = String::from("hello");
println!("{}", s.len()); // String derefs to str, then calls str::len

// Trick: field splitting for non-overlapping borrows
struct Data { x: u32, y: u32 }
let mut d = Data { x: 1, y: 2 };
let rx = &mut d.x;
let ry = &mut d.y; // OK: different fields
*rx += 1;
*ry += 2;
```
::

## `Ref` and `RefMut` (Interior Mutability)

### Why this exists

The borrow rules are a *compile-time* check: the compiler must prove, statically, that no aliasing+mutation exists. But some patterns are safe at runtime that the compiler can't prove statically — e.g., mutation inside a method that holds only `&self`, or shared mutation across an `Rc`. `RefCell` moves the borrow check to **runtime**: `borrow()`/`borrow_mut()` enforce the same single-mutable-or-many-immutable rule, but as a runtime check that panics if violated. This unlocks patterns (interior mutability, mutation behind `Rc`) that static borrow checking can't permit.

`std::cell::RefCell` provides *runtime-checked* borrow rules (single mutable xor multiple immutable), enabling interior mutability behind an immutable reference. Covered in Interior Mutability chapter.

## Summary

- `&T` = shared, many at once; `&mut T` = exclusive, one at a time.
- NLL makes references live only as long as needed.
- Borrowing lets you write APIs that don't steal ownership.
- Dangling references are impossible in safe Rust.

Next: Slices — borrowed views into contiguous data.