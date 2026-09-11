---
title: "Learn Go — From Zero to Principal"
description: "A deep-dive, code-first Go engineering reference. 28 chapters covering toolchain internals, memory models, concurrency, profiling, and production patterns — built for mid-level developers moving to senior roles."
---

# 🐹 Learn Go — From Zero to Principal

A deep-dive, code-first engineering reference. Every chapter is structured around annotated production code, anti-patterns with fixes, edge cases, and gotchas — not prose tutorials.

## How to Use This Course

1. **Read sequentially** for a structured path (01 → 28).
2. **Jump to a chapter** as a reference when you hit a concept in production.
3. **Run the code** — every snippet is self-contained and runnable.
4. **Run the quizzes** at the end of each chapter to test understanding.
5. **Do the capstone exercises** in chapter 28.

## Prerequisites

- Go 1.22+ installed (`go version`).
- A code editor (VS Code + the Go extension recommended).
- Comfort with at least one other programming language.
- Understanding of basic concurrency concepts (threads, locks, queues).

## Curriculum

### Part I — Foundations & Toolchain

| # | Topic | Why It Matters |
|---|---|---|
| 01 | [Introduction & Setup](/go/01-introduction-and-setup) | Toolchain internals, module graph (MVS), build tags, cross-compilation, `embed`, `cgo`, race detector, Docker. |
| 02 | [Package Anatomy & go Command](/go/02-hello-world-and-go-command) | Compilation pipeline, `init()` ordering, `go` subcommands, test cache, `os.Args`/`flag`/`cobra`. |
| 03 | [Variables, Constants & Types](/go/03-variables-constants-and-types) | Zero-value memory layout, untyped constant precision, `iota` bit flags, named types, shadowing trap. |
| 04 | [Basic Types & Conversions](/go/04-basic-types-and-conversions) | Integer overflow, IEEE 754 float traps, UTF-8 string internals, `[]byte`↔`string` allocation cost. |
| 05 | [Functions](/go/05-functions) | Multiple returns, closure capture semantics, `defer` execution model, variadic options pattern. |
| 06 | [Control Flow](/go/06-control-flow) | `if`-init scoping, `range` internals, switch dispatch, labeled breaks, Go 1.22 loop scoping fix. |

### Part II — Data Structures & Memory

| # | Topic | Why It Matters |
|---|---|---|
| 07 | [Arrays, Slices & Strings](/go/07-arrays-slices-and-strings) | Slice header memory layout, `append` growth strategy, aliasing traps, `slices` package, zero-allocation strings. |
| 08 | [Maps](/go/08-maps) | Hash map bucket layout, the non-addressable value trap, concurrent map fatal error, ordered map impl. |
| 09 | [Structs](/go/09-structs) | Field alignment/padding, embedding composition, struct tags, zero-value-is-useful idiom, `struct{}` sets. |
| 10 | [Pointers](/go/10-pointers) | Escape analysis (stack vs heap), value vs pointer method sets, nil receiver safety, when pointers hurt. |
| 11 | [Methods & Receivers](/go/11-methods-and-receivers) | Value vs pointer semantics, consistency rule, nil receiver methods, method promotion, builder pattern. |
| 12 | [Interfaces](/go/12-interfaces) | Interface internals `(type, value)`, the nil interface trap, consumer-side definition, accept-interfaces-return-structs. |
| 13 | [Type Assertions & Switches](/go/13-type-assertions-and-switches) | Comma-ok assertions, type switch dispatch, interface-to-interface capability checks, JSON `float64` trap. |
| 14 | [Generics](/go/14-generics) | Type parameters, `~T` underlying-type matching, `cmp.Ordered`, `slices`/`maps` packages, generic type design. |

### Part III — Error Handling & Concurrency

| # | Topic | Why It Matters |
|---|---|---|
| 15 | [Error Handling](/go/15-error-handling) | Error wrapping chains, `errors.Is`/`As`, sentinel vs typed errors, nil-interface trap, `errors.Join`, panic-vs-error. |
| 16 | [Goroutines](/go/16-goroutines) | G-M-P scheduling model, stack growth, GOMAXPROCS, leak prevention, unbounded fan-out, preemption. |
| 17 | [Channels](/go/17-channels) | Channel semantics table, close rules, directional channels, nil channel patterns, `chan struct{}` signals. |
| 18 | [Select & Multiplexing](/go/18-select-and-multiplexing) | `time.After` leak, fan-in/fan-out, priority selects, for-select loops, nil-channel state machines. |
| 19 | [sync Package](/go/19-sync-package) | Mutex/RWMutex internals, WaitGroup race-free usage, Once lazy init, Cond, Pool allocation reuse, Map. |
| 20 | [Context](/go/20-context) | Cancellation trees, deadlines, the `cancel` leak, request-scoped values, `errgroup` bounded concurrency. |

### Part IV — I/O, Standard Library & Production Engineering

| # | Topic | Why It Matters |
|---|---|---|
| 21 | [Packages & Modules](/go/21-packages-and-modules) | Module versioning (v2+ paths), `internal/` enforcement, workspaces, `replace` directives, private modules, `go.sum`. |
| 22 | [I/O, Files & io Package](/go/22-io-and-files) | `io.Reader`/`Writer` composition, `io.Copy`, `bufio.Scanner`, file durability (`Sync`/`Close`), `io.Pipe`. |
| 23 | [Encoding: JSON, CSV, gob](/go/23-encoding) | Struct tags, `omitempty` traps, streaming JSON, `json.Number` precision, custom marshalers, `gob`. |
| 24 | [Time & Dates](/go/24-time-and-dates) | Monotonic vs wall clock, reference time format, `==` vs `Equal`, time zones, tickers/timers. |
| 25 | [Testing & Benchmarking](/go/25-testing-and-benchmarking) | Table-driven tests, `t.Parallel`, benchmark allocation analysis, fuzzing, `httptest`, coverage gating. |
| 26 | [Concurrency Patterns](/go/26-concurrency-patterns) | Worker pool, pipeline, fan-out/fan-in, `errgroup`, semaphore, generator, graceful shutdown. |
| 27 | [Profiling & Performance](/go/27-profiling-and-performance) | `pprof` CPU/heap/goroutine, escape analysis, allocation reduction, `strings.Builder`, `sync.Pool`, inlining. |
| 28 | [Exercises & Project Ideas](/go/28-exercises-and-projects) | From beginner to expert: generics, concurrency patterns, concurrent web crawler, graceful server, capstone task queue. |

## Learning Path Suggestions

### If you're coming from Python/Ruby/JS

Go's static typing, explicit error handling, and value semantics are the big shifts. Read 03–05 (types, functions), 07 (slices — they're not Python lists), 15 (errors — no exceptions), and 16–20 (concurrency — goroutines/channels are unique to Go).

### If you're coming from C/C++/Rust

Go is simpler but has surprises: garbage collection (no manual memory management), goroutines (not OS threads), channels (not mutexes as default), and implicit interfaces. Read 10 (escape analysis), 12 (interfaces), 16–18 (concurrency), 27 (profiling — escape analysis is Go's answer to zero-cost abstractions).

### If you're a senior engineer

Start with 01 (toolchain internals), 10 (escape analysis), 12 (interface nil trap), 15 (error wrapping chains), 16 (G-M-P scheduler), 20 (context cancellation trees), 26 (concurrency patterns), 27 (profiling). The exercises in 28 are production-graded.

## What Makes This Course Different

- **Code-first**: every concept is demonstrated with production-grade annotated code, not prose.
- **Anti-patterns → fixes**: every chapter shows the wrong way, explains the trap, and gives the correct production pattern.
- **Edge cases and gotchas**: each chapter includes subtle boundary conditions, compiler quirks, and runtime failure modes.
- **Quick quizzes**: test understanding with tricky code snippets at the end of each chapter.
- **Production focus**: Docker multi-stage builds, graceful shutdown, supply chain (`go.sum`), race detection, profiling — not just syntax.

## Prerequisites for Chapters

| Chapters | Requires |
|---|---|
| 01–06 | Nothing (start here if new to Go) |
| 07–14 | 01–06 (foundations) |
| 15 | 05 (defer), 12 (nil interface) |
| 16–20 | 06 (control flow), 11 (methods) |
| 21–24 | 01 (modules), 04 (types) |
| 25–27 | All prior chapters |
| 28 | All chapters (capstone exercises) |