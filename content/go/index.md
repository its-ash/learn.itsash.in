---
title: Learn Go — From Zero to Pro
description: A comprehensive, edge-case-covering, idiomatic Go curriculum. 28 chapters covering syntax, types, functions, structs, interfaces, generics, concurrency, channels, goroutines, context, error handling, testing, modules, profiling, and more. Go from beginner to pro Go developer.
---

# 🐹 Learn Go — From Zero to Pro

A comprehensive, edge-case-covering, idiomatic Go curriculum. Each document is self-contained and covers its concept deeply enough that a careful reader can go from beginner to pro Go developer.

## How to Use This Course

1. **Read sequentially** for a structured path (01 → 28).
2. **Jump to a chapter** as a reference when you hit a concept in the wild.
3. **Run the exercises** in chapter 28 after every few chapters.
4. **Read the Go standard library docs** alongside.

## Prerequisites

- Go 1.22+ installed (`go version`).
- A code editor (VS Code + the Go extension recommended).
- Comfort with at least one other programming language.

## Curriculum

### Part I — Foundations

| # | Topic | Why It Matters |
|---|---|---|
| 01 | [Introduction & Setup](/go/01-introduction-and-setup) | History, installation, `go` tool, modules, workspace. |
| 02 | [Hello World & go command](/go/02-hello-world-and-go-command) | `go run`/`build`/`test`/`fmt`/`vet`, package layout. |
| 03 | [Variables, Constants & Types](/go/03-variables-constants-and-types) | `var`/`:=`, zero values, `const`, `iota`, naming. |
| 04 | [Basic Types & Conversions](/go/04-basic-types-and-conversions) | Integers, floats, strings, booleans, runes, explicit casts. |
| 05 | [Functions](/go/05-functions) | Multiple returns, named returns, variadic, closures, defer. |
| 06 | [Control Flow](/go/06-control-flow) | `if`/`for`/`switch`/`select`, no `while`, expressions. |

### Part II — Data Structures

| # | Topic | Why It Matters |
|---|---|---|
| 07 | [Arrays, Slices & Strings](/go/07-arrays-slices-and-strings) | Slice mechanics, capacity, append, copy, UTF-8 strings. |
| 08 | [Maps](/go/08-maps) | Declaration, iteration, zero values, concurrency caveat. |
| 09 | [Structs](/go/09-structs) | Fields, embedding, tags, composition over inheritance. |
| 10 | [Pointers](/go/10-pointers) | `&`/`*`, nil pointers, escape analysis, when to pointer. |
| 11 | [Methods & Receivers](/go/11-methods-and-receivers) | Value vs pointer receivers, method sets, promotion. |

### Part III — Abstraction

| # | Topic | Why It Matters |
|---|---|---|
| 12 | [Interfaces](/go/12-interfaces) | Implicit satisfaction, `interface{}`/`any`, type assertion. |
| 13 | [Type Assertions & Type Switches](/go/13-type-assertions-and-switches) | `v.(T)`, comma-ok, `switch v := x.(type)`, panics. |
| 14 | [Generics](/go/14-generics) | Type parameters, constraints, `comparable`, type inference. |
| 15 | [Error Handling](/go/15-error-handling) | `error`, `errors.Is`/`As`, wrapping, sentinel errors, `panic`. |

### Part IV — Concurrency (The Heart of Go)

| # | Topic | Why It Matters |
|---|---|---|
| 16 | [Goroutines](/go/16-goroutines) | Lightweight threads, scheduling, GOMAXPROCS, leaks. |
| 17 | [Channels](/go/17-channels) | Send/receive, buffered, close, range, direction. |
| 18 | [Select & Multiplexing](/go/18-select-and-multiplexing) | `select`, default, timeout, done, fan-in/fan-out. |
| 19 | [sync Package](/go/19-sync-package) | `Mutex`/`RWMutex`/`WaitGroup`/`Once`/`Cond`/`Pool`/`Map`. |
| 20 | [Context](/go/20-context) | Cancellation, deadlines, values, request scoping. |

### Part V — I/O & Standard Library

| # | Topic | Why It Matters |
|---|---|---|
| 21 | [Packages & Modules](/go/21-packages-and-modules) | `go mod`, versioning, workspaces, internal packages. |
| 22 | [I/O, Files & the io Package](/go/22-io-and-files) | `io.Reader`/`Writer`, `os`, `bufio`, streams, `io.Copy`. |
| 23 | [Encoding: JSON, CSV, gob](/go/23-encoding) | `encoding/json`, tags, marshal/unmarshal, encoders. |
| 24 | [Time & Dates](/go/24-time-and-dates) | `time.Time`, `Duration`, monotonic clock, time zones. |

### Part VI — Production Engineering

| # | Topic | Why It Matters |
|---|---|---|
| 25 | [Testing & Benchmarking](/go/25-testing-and-benchmarking) | `testing`, table tests, benchmarks, fuzzing, `httptest`. |
| 26 | [Concurrency Patterns](/go/26-concurrency-patterns) | Worker pool, pipeline, fan-out/in, generator, done channel. |
| 27 | [Profiling & Performance](/go/27-profiling-and-performance) | `pprof`, escape analysis, allocation reduction, benchmarks. |
| 28 | [Exercises & Project Ideas](/go/28-exercises-and-projects) | From beginner to pro. |

## Learning Path Suggestions

### If you're new to programming

1. Read 01–06 in order.
2. Build small programs with slices and maps (07–08).
3. Read 15 (error handling) — `error` is the Go culture.
4. Do exercises 1–5 in chapter 28.

### If you're coming from Python/Ruby/JS

Go's static typing and explicit error handling are the big shifts. Read 03–05 (types, functions), 15 (errors — no exceptions), and 16–20 (concurrency — goroutines/channels are unique to Go). Don't skip 07 (slices — they're not Python lists).

### If you're coming from C/C++/Rust

Go is simpler but has surprises: garbage collection (no manual memory management), goroutines (not OS threads), channels (not mutexes as the default), and implicit interfaces (no `implements`). Read 12 (interfaces), 16–18 (concurrency), 14 (generics — simpler than C++ templates).

### If you're a senior engineer

Skim 01–11. Read 12 (interfaces), 14 (generics), 15 (errors), 16–20 (concurrency — Go's defining feature), 20 (context), 26 (patterns), 27 (profiling) closely. Use 28 to pick a project.

## Companion Resources

- [A Tour of Go](https://go.dev/tour) — the official interactive tutorial.
- [Effective Go](https://go.dev/doc/effective_go) — idioms and best practices.
- [Go by Example](https://gobyexample.com) — runnable examples for every feature.
- [Go Standard Library Docs](https://pkg.go.dev/std) — the authoritative reference.
- [Go Blog](https://go.dev/blog) — deep dives from the Go team.
- [Go Wiki](https://go.dev/wiki) — community patterns and guidance.

## Tooling to Install

::code-wrapper{language="bash"}
```bash
# macOS
brew install go

# Linux (download from go.dev or use a package manager)
wget https://go.dev/dl/go1.22.0.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.22.0.linux-amd64.tar.gz
export PATH=$PATH:/usr/local/go/bin

# Verify
go version

# VS Code extension
# Install the "Go" extension (golang.go) — it sets up gopls, dlv, and tools automatically.
```
::

## License

These notes are yours to use, share, and modify.

🐹