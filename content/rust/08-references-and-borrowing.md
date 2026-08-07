# 08 — References & Borrowing

Ownership is heavy. **References** let you use a value without taking ownership.

## Shared References `&T`

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

> At any given time, you can have **either**:
> - One mutable reference, **or**
> - Any number of immutable references.

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

## Reborrowing

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

Types implementing `Deref` allow chained deref coercions:

::code-wrapper{language="rust"}
```rust
let s = String::from("hi");
let r: &str = &s;          // &String -> &str via Deref
let b = Box::new(String::from("hi"));
let r: &str = &b;          // &Box<String> -> &String -> &str
```
::

This is how `Box`, `Rc`, `String`, `Vec` all play nicely with `&`-APIs.

## `as_ref` / `as_mut`

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

`std::cell::RefCell` provides *runtime-checked* borrow rules (single mutable xor multiple immutable), enabling interior mutability behind an immutable reference. Covered in Interior Mutability chapter.

## Summary

- `&T` = shared, many at once; `&mut T` = exclusive, one at a time.
- NLL makes references live only as long as needed.
- Borrowing lets you write APIs that don't steal ownership.
- Dangling references are impossible in safe Rust.

Next: Slices — borrowed views into contiguous data.