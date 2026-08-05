---
title: Learn Rust — From Zero to Pro
description: A comprehensive, edge-case-covering, idiomatic Rust curriculum. 35 chapters covering ownership, borrowing, lifetimes, traits, generics, closures, async, macros, FFI, and more. Go from beginner to pro Rust developer.
---

# 🦀 Learn Rust — From Zero to Pro

A comprehensive, edge-case-covering, idiomatic Rust curriculum. Each document is self-contained and covers its concept deeply enough that a careful reader can go from beginner to pro Rust developer.

## How to Use This Course

1. **Read sequentially** for a structured path (01 → 35).
2. **Jump to a chapter** as a reference when you hit a concept in the wild.
3. **Run the exercises** in chapter 35 after every few chapters.
4. **Read the source of std and `tokio`** alongside.

## Prerequisites

- A working Rust toolchain (`rustup`).
- A code editor (VS Code + `rust-analyzer` recommended).
- Comfort with at least one other programming language.

## Curriculum

### Part I — Foundations

| # | Topic | Why It Matters |
|---|---|---|
| 01 | [Introduction & Setup](01-introduction-and-setup.md) | Toolchain, cargo, project layout. |
| 02 | [Hello World & Cargo Deep Dive](02-hello-world-and-cargo.md) | `Cargo.toml`, dependencies, workspaces. |
| 03 | [Variables & Mutability](03-variables-and-mutability.md) | Immutability, shadowing, `const`, `static`. |
| 04 | [Data Types](04-data-types.md) | Integers, floats, char, tuples, arrays, casts. |
| 05 | [Functions](05-functions.md) | Statements vs expressions, divergence, `impl`. |
| 06 | [Control Flow](06-control-flow.md) | `if`/`while`/`for`/`loop`/`match` as expressions. |

### Part II — Ownership & Borrowing (The Heart of Rust)

| # | Topic | Why It Matters |
|---|---|---|
| 07 | [Ownership](07-ownership.md) | Move semantics, `Drop`, `Copy`. |
| 08 | [References & Borrowing](08-references-and-borrowing.md) | `&T`/`&mut T`, NLL, borrow rules. |
| 09 | [Slices](09-slices.md) | `&[T]`, `&str`, fat pointers. |
| 10 | [Lifetimes](10-lifetimes.md) | `'a`, elision, `'static`, variance. |

### Part III — Modeling Data

| # | Topic | Why It Matters |
|---|---|---|
| 11 | [Structs](11-structs.md) | Named/tuple/unit, `impl`, derives. |
| 12 | [Enums](12-enums.md) | ADTs, `Option`, `Result`, niche optimization. |
| 13 | [Pattern Matching](13-pattern-matching.md) | All pattern forms, binding modes, guards. |
| 14 | [Collections](14-collections.md) | `Vec`, `String`, `HashMap`, and friends. |

### Part IV — Abstraction & Reuse

| # | Topic | Why It Matters |
|---|---|---|
| 15 | [Iterators & Combinators](15-iterators.md) | Zero-cost iteration, `collect`, custom `Iterator`. |
| 16 | [Traits & Generics](16-traits-and-generics.md) | Trait bounds, object safety, `impl Trait`. |
| 17 | [Closures](17-closures.md) | `Fn`/`FnMut`/`FnOnce`, capture, `move`. |
| 18 | [Error Handling](18-error-handling.md) | `Result`/`Option`, `?`, `thiserror`/`anyhow`. |

### Part V — Memory & Organization

| # | Topic | Why It Matters |
|---|---|---|
| 19 | [Smart Pointers](19-smart-pointers.md) | `Box`/`Rc`/`Arc`/`RefCell`/`Mutex`/`Cow`/`Pin`. |
| 20 | [Modules & Crates](20-modules-and-crates.md) | Visibility, paths, `use`, workspaces. |
| 21 | [Testing](21-testing.md) | Unit/integration/doc tests, `criterion`, fuzzing. |

### Part VI — Concurrency & Async

| # | Topic | Why It Matters |
|---|---|---|
| 22 | [Concurrency & Multithreading](22-concurrency.md) | `Send`/`Sync`, threads, channels, atomics. |
| 23 | [Async / Await](23-async-await.md) | Futures, runtimes, `select!`, streams, `spawn_blocking`. |

### Part VII — Metaprogramming

| # | Topic | Why It Matters |
|---|---|---|
| 24 | [Macros](24-macros.md) | `macro_rules!`, proc-macros, `cargo expand`. |
| 25 | [Unsafe Rust](25-unsafe-rust.md) | Raw pointers, FFI, soundness, `Miri`. |
| 26 | [FFI](26-ffi.md) | Calling C, calling Rust from C, `bindgen`/`cxx`. |

### Part VIII — Production Engineering

| # | Topic | Why It Matters |
|---|---|---|
| 27 | [Attributes & Conditional Compilation](27-attributes-and-cfg.md) | `#[cfg]`, `#[derive]`, lints, `#[non_exhaustive]`. |
| 28 | [Cargo Features & Release Engineering](28-cargo-features.md) | Features, profiles, CI, publishing. |
| 29 | [Advanced Type System](29-advanced-type-system.md) | Variance, HRTBs, GATs, const generics. |
| 30 | [Design Patterns & Idiomatic Rust](30-design-patterns.md) | Builder, typestate, newtype, RAII. |
| 31 | [Performance, Profiling & Optimization](31-performance.md) | `criterion`, `flamegraph`, allocation pitfalls. |
| 32 | [Documentation](32-documentation.md) | `rustdoc`, doc tests, intra-doc links. |
| 33 | [Ecosystem Tour](33-ecosystem.md) | Curated map of crates for every domain. |
| 34 | [Common Pitfalls & Idiomatic Fixes](34-common-pitfalls.md) | 40+ traps and their fixes. |
| 35 | [Exercises & Project Ideas](35-exercises-and-projects.md) | From beginner to pro. |

## Learning Path Suggestions

### If you're new to systems programming

1. Read 01–14 in order.
2. Skip to 21 (Testing) and write tests for everything you've built.
3. Skim 15–18 and 22–23, then come back to the harder parts.
4. Do exercises 1–5 in chapter 35.

### If you're coming from C/C++

Read 07–10 carefully (ownership is the new mental model). Skim 04 (data types) — you'll find surprises (char is 4 bytes). Read 25 (Unsafe) to understand what Rust adds over C. Then 22 and 23.

### If you're coming from Python/JS/Ruby

Ownership will be new. Read 03–10 slowly. Don't skip 18 (Error Handling) — `Result`/`?` is the culture. Don't reach for `clone` reflexively.

### If you're a senior engineer learning Rust for production

Skim 01–14. Read 16, 18, 22, 23, 27, 28 closely. Use 30, 34 as references. Skim 33 for the crate landscape. Then read 35 and pick a project.

## Companion Resources

- [The Rust Book](https://doc.rust-lang.org/book/) — official, free.
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/) — code-first.
- [Rust Reference](https://doc.rust-lang.org/reference/) — language spec.
- [Rustonomicon](https://doc.rust-lang.org/nomicon/) — unsafe Rust deep dive.
- [Async Book](https://rust-lang.github.io/async-book/) — async internals.
- [Jon Gjengset's Crust of Rust](https://www.youtube.com/playlist?list=PLqbS7AVKE3Wy6jX6h_AjMpwL9t1ZckhnH) — YouTube deep dives.
- [r/rust](https://reddit.com/r/rust) and [users.rust-lang.org](https://users.rust-lang.org) — community.

## Tooling to Install

```bash
rustup component add rustfmt clippy rust-src rust-analyzer
cargo install cargo-expand cargo-nextest cargo-deny cargo-audit \
    cargo-flamegraph cargo-bloat cargo-machete cargo-release \
    samply cargo-watch mdbook
```

## License

These notes are yours to use, share, and modify.

🦀