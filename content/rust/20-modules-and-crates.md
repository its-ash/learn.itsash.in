# 20 — Modules & Crates

- A **crate** is one compiled unit: a binary (`src/main.rs`) or a library (`src/lib.rs`).
- A **module** (`mod`) groups code inside a crate and controls what is visible.
- A **package** is a folder with a `Cargo.toml`; it holds one or more crates.

## Modules and Privacy

Everything is **private by default**. `pub` makes it visible to the parent module.

::code-wrapper{language="rust"}
```rust
mod shop {
    pub struct Item {
        pub name: String,   // public field
        price: u32,         // private field
    }

    impl Item {
        pub fn new(name: &str, price: u32) -> Self {
            Item { name: name.into(), price }
        }
        pub fn price(&self) -> u32 { self.price }
    }

    fn secret_discount() -> u32 { 10 }   // private function
}

fn main() {
    let item = shop::Item::new("pen", 30);
    println!("{} {}", item.name, item.price());
    // println!("{}", item.price);       // error[E0616]: field `price` of struct `Item` is private
    // shop::secret_discount();          // error[E0603]: function `secret_discount` is private
}
```
::

**Tricky**: one private field means outsiders can't build the struct with `{ }` at all:

::code-wrapper{language="rust"}
```rust
mod shop {
    pub struct Item { pub name: String, price: u32 }
}

fn main() {
    // let i = shop::Item { name: "a".into(), price: 1 };
    // error[E0451]: field `price` of struct `Item` is private
}
```
::

This is how you force everyone through `Item::new` (where you can validate).

**Tricky**: enum variants are all public if the enum is `pub` — no per-variant privacy:

::code-wrapper{language="rust"}
```rust
mod shop {
    pub enum Size { Small, Large }   // both variants are public automatically
}

fn main() {
    let _s = shop::Size::Large;
}
```
::

## Paths: `crate`, `super`, `self`

::code-wrapper{language="rust"}
```rust
mod shop {
    pub struct Item { pub price: u32 }

    pub mod billing {
        use super::Item;                        // parent module
        pub fn total(items: &[Item]) -> u32 {
            items.iter().map(|i| i.price).sum()
        }
        pub(crate) fn tax(t: u32) -> u32 {      // visible anywhere in THIS crate only
            t / 10
        }
    }

    pub use billing::total;                     // re-export: shop::total works too
}

use crate::shop::Item;                          // absolute path from the crate root

fn main() {
    let items = vec![Item { price: 30 }, Item { price: 70 }];
    println!("{}", shop::total(&items));        // 100
    println!("{}", shop::billing::tax(100));    // 10
}
```
::

## Splitting Into Files

::code-wrapper{language="bash"}
```bash
src/
├── main.rs          # mod shop;   ← declares the module, Rust looks for the file
├── shop.rs          # contents of `shop`;  contains: pub mod billing;
└── shop/
    └── billing.rs   # contents of `shop::billing`
```
::

::code-wrapper{language="rust" filename="src/main.rs"}
```rust
mod shop;            // NOT `use shop;` — `mod` creates it, `use` only shortens a path

fn main() {
    shop::hello();
}
```
::

::code-wrapper{language="rust" filename="src/shop.rs"}
```rust
pub mod billing;

pub fn hello() {
    println!("hello from shop");
}
```
::

**Tricky**: a file is **not** part of the crate until some `mod name;` line declares it. An undeclared `src/utils.rs` is silently ignored — not even compiled.

## Name Clashes and `as`

::code-wrapper{language="rust"}
```rust
// use std::fmt::Result;
// use std::io::Result;     // error[E0252]: the name `Result` is defined multiple times

use std::fmt::Result as FmtResult;
use std::io::Result as IoResult;

fn a() -> FmtResult { Ok(()) }
fn b() -> IoResult<()> { Ok(()) }

fn main() {
    a().unwrap();
    b().unwrap();
}
```
::

Grouped and glob imports:

::code-wrapper{language="rust"}
```rust
use std::collections::{HashMap, HashSet};
use std::io::{self, Write};    // `self` imports `io` itself too
// use std::collections::*;    // glob — fine in tests and preludes, avoid elsewhere
```
::

## Private Types in Public Functions

::code-wrapper{language="rust"}
```rust
mod a {
    struct Hidden;
    pub fn make() -> Hidden { Hidden }
    // warning: type `Hidden` is more private than the item `make`
}

fn main() {
    // a::make();     // error: type `Hidden` is private
}
```
::

Make the type `pub` too, or return something public (e.g. `impl Trait`).

## Using External Crates

::code-wrapper{language="bash"}
```bash
cargo add rand
```
::

::code-wrapper{language="rust"}
```rust
use rand::Rng;                      // bring the trait into scope (chapter 16)

fn main() {
    let n: u32 = rand::thread_rng().gen_range(1..=6);
    println!("rolled {n}");
}
```
::

## 💡 Tips & Tricks

- **Idiom** — keep `main.rs` thin; put logic in `lib.rs` so tests and other binaries can use it.
- **Idiom** — `pub(crate)` for helpers shared inside your crate but not part of the public API.
- **Idiom** — `pub use` to re-export a clean public path (`mycrate::Thing` instead of `mycrate::internal::deep::Thing`).
- **Idiom** — private fields + a `new()` constructor to protect invariants.
- **Debug** — "file not found for module" → check the file name and folder match the `mod` path.

## ⚠️ Edge Cases & Gotchas

- **Default** — everything is private unless marked `pub`, including struct fields.
- **Struct literals** — any private field blocks `Struct { .. }` construction from outside.
- **Enums** — variants of a `pub enum` are always public.
- **Files** — a `.rs` file without a matching `mod` declaration is not compiled at all.
- **`mod` vs `use`** — `mod x;` declares (once); `use` just creates a shortcut.
- **Name clashes** — two imports with the same name need `as`.

## 🧠 Spot the Bug

::code-wrapper{language="rust"}
```rust
mod account {
    pub struct Account {
        pub balance: i64,
    }

    impl Account {
        pub fn withdraw(&mut self, amount: i64) -> Result<(), String> {
            if amount > self.balance {
                return Err("insufficient funds".into());
            }
            self.balance -= amount;
            Ok(())
        }
    }
}

fn main() {
    let mut acc = account::Account { balance: 50 };
    acc.balance -= 500;
    println!("{}", acc.balance);
}
```
::

<details>
<summary>Answer</summary>

Prints `-450`. The `withdraw` check is useless because `balance` is `pub` — any code can change it directly and skip the rule.

Make the field private and offer methods:

::code-wrapper{language="rust"}
```rust
mod account {
    pub struct Account { balance: i64 }

    impl Account {
        pub fn new(balance: i64) -> Self { Account { balance } }
        pub fn balance(&self) -> i64 { self.balance }
        pub fn withdraw(&mut self, amount: i64) -> Result<(), String> {
            if amount > self.balance { return Err("insufficient funds".into()); }
            self.balance -= amount;
            Ok(())
        }
    }
}
```
::

Now `acc.balance -= 500` is a compile error outside the module.

</details>

## Summary

Modules organize code and draw privacy lines; everything starts private. `mod` declares, `use` shortens paths, `pub use` re-exports. Private fields plus constructors are the main tool for keeping data valid.

Next: Testing.
