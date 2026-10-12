# 08 — References & Borrowing

A **reference** lets you use a value without taking ownership. Creating one is called **borrowing**.

## Shared References `&T`

::code-wrapper{language="rust"}
```rust
fn length(s: &String) -> usize {   // borrows, does not take
    s.len()
}

fn main() {
    let s = String::from("hello");
    let n = length(&s);
    println!("{s} has {n} bytes");   // s still usable
}
```
::

You can have **many** shared references at once, but you cannot change the value through them:

::code-wrapper{language="rust"}
```rust
fn main() {
    let s = String::from("hi");
    let a = &s;
    let b = &s;
    println!("{a} {b}");      // fine
    // a.push('!');           // error[E0596]: cannot borrow `*a` as mutable, as it is behind a `&` reference
}
```
::

## Mutable References `&mut T`

::code-wrapper{language="rust"}
```rust
fn shout(s: &mut String) {
    s.push('!');
}

fn main() {
    let mut s = String::from("hi");   // the variable must be `mut` too
    shout(&mut s);
    println!("{s}");                  // hi!

    let mut x = 5;
    let r = &mut x;
    *r += 1;                          // `*` to reach the value behind the reference
    println!("{x}");                  // 6
}
```
::

## The Two Rules

At any moment you may have **either**:

- any number of `&T`, **or**
- exactly one `&mut T`.

…and a reference must never outlive the value it points to.

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut s = String::from("a");
    let r1 = &mut s;
    // let r2 = &mut s;    // error[E0499]: cannot borrow `s` as mutable more than once at a time
    r1.push('b');
}
```
::

**Why**: if two parts of the code could change the same data at once, one could invalidate memory the other is still using (for example, a `Vec` reallocating while someone holds a pointer into it).

## Borrows End at Last Use

A borrow lasts until the **last time it is used**, not until the end of the block:

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut s = String::from("hi");
    let r = &s;
    println!("{r}");     // last use of r → the borrow ends here
    s.push('!');         // fine
    println!("{s}");     // hi!
}
```
::

**Tricky**: move the `println!` one line down and it breaks:

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![1, 2, 3];
    let first = &v[0];
    // v.push(4);          // error[E0502]: cannot borrow `v` as mutable because it is also borrowed as immutable
    println!("{first}");   // first is still used here, so the borrow is still alive above
}
```
::

**Why this is a real bug, not pedantry**: `push` may reallocate the `Vec` to a new address. `first` would then point at freed memory.

**Tricky**: this one **does** compile, even though it looks like the same thing:

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![1, 2, 3];
    v.push(v.len());   // OK
    v.push(v[0]);      // OK
    println!("{v:?}"); // [1, 2, 3, 3, 1]
}
```
::

The argument (`v.len()`, `v[0]`) is fully computed **before** `push` starts changing `v` ("two-phase borrow"), and the result is a copied `usize`/`i32`, not a reference.

## Borrowing Different Fields

The compiler tracks struct fields separately:

::code-wrapper{language="rust"}
```rust
struct Point { x: i32, y: i32 }

fn main() {
    let mut p = Point { x: 1, y: 2 };
    let a = &mut p.x;
    let b = &mut p.y;      // fine — different fields
    *a += 10;
    *b += 20;
    println!("{} {}", p.x, p.y);   // 11 22
}
```
::

**Tricky**: it does **not** track different *indexes* of a `Vec` or slice:

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut v = vec![1, 2, 3];
    // let (a, b) = (&mut v[0], &mut v[1]);   // error[E0499] — the compiler can't prove 0 != 1
    let (left, right) = v.split_at_mut(1);    // std proves they don't overlap
    left[0] += 10;
    right[0] += 20;
    println!("{v:?}");                        // [11, 22, 3]
}
```
::

**Tricky**: the same applies through methods — a `&mut self` method borrows the **whole** struct:

::code-wrapper{language="rust"}
```rust
struct Game { players: Vec<String>, round: u32 }

impl Game {
    fn players_mut(&mut self) -> &mut Vec<String> { &mut self.players }
}

fn main() {
    let mut g = Game { players: vec![], round: 0 };
    let p = g.players_mut();
    // g.round += 1;     // error[E0503]: cannot use `g.round` because it was mutably borrowed
    p.push("Ada".into());
    g.round += 1;        // fine after p's last use
}
```
::

## No Dangling References

::code-wrapper{language="rust"}
```rust
// fn dangle() -> &String {
//     let s = String::from("hi");
//     &s
// }   // error[E0106]: missing lifetime specifier
//     // help: ...you are more likely to want to return an owned value

fn no_dangle() -> String {
    String::from("hi")       // return the value itself
}

fn main() {
    println!("{}", no_dangle());
}
```
::

## Prefer `&str` and `&[T]` Parameters

::code-wrapper{language="rust"}
```rust
fn count_words(s: &str) -> usize { s.split_whitespace().count() }
fn total(v: &[i32]) -> i32 { v.iter().sum() }

fn main() {
    let owned = String::from("a b c");
    println!("{}", count_words(&owned));    // &String → &str automatically
    println!("{}", count_words("x y"));      // literal works too

    let v = vec![1, 2, 3];
    println!("{}", total(&v));               // &Vec<i32> → &[i32]
    println!("{}", total(&[4, 5]));          // array works too
}
```
::

## 💡 Tips & Tricks

- **Idiom** — read-only methods take `&self`; only take `&mut self` when you really change something.
- **Idiom** — copy a small value out first (`let x = v[0];`) before mutating the collection.
- **Idiom** — use `split_at_mut`, `iter_mut`, `chunks_mut` to get several `&mut` into one slice safely.
- **Lint** — `clippy::ptr_arg` warns on `&Vec<T>` / `&String` parameters.
- **Debug** — when an error says "borrow later used here", look at that later line — that is what keeps the borrow alive.

## ⚠️ Edge Cases & Gotchas

- **Mut binding** — `&mut s` needs `let mut s`, even if you never reassign `s`.
- **Indexes** — `&mut v[0]` and `&mut v[1]` at once is rejected; fields `&mut p.x` and `&mut p.y` are allowed.
- **Methods** — a `&mut self` getter locks the whole struct while its result is alive.
- **Last use** — a borrow ends at its last use; adding a `println!` later can turn working code into an error.
- **Two-phase** — `v.push(v.len())` compiles; `let r = &v[0]; v.push(*r);` does not.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut names = vec![String::from("ada")];
    let first = &names[0];
    names.push(first.to_uppercase());
    println!("{names:?}");
}
```
::

<details>
<summary>Answer</summary>

`error[E0502]: cannot borrow names as mutable because it is also borrowed as immutable`.

`first` borrows `names`, and is used as the argument to `push`. Unlike `v.push(v.len())`, here the argument is computed from a **reference that was created before** `push` — the compiler can't let `push` reallocate while `first` exists.

Fix: finish using the borrow before mutating:

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut names = vec![String::from("ada")];
    let upper = names[0].to_uppercase();   // owned String, no borrow left
    names.push(upper);
    println!("{names:?}");                 // ["ada", "ADA"]
}
```
::

</details>

## Summary

Many `&T` **or** one `&mut T`, never both. A borrow ends at its last use. The compiler splits borrows across struct fields but not across slice indexes — use `split_at_mut` for that.

Next: Slices.
