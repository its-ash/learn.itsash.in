---
title: Learn Lua — Zero to Hero
description: A comprehensive, code-first Lua curriculum for mid-to-senior engineers. Covers the runtime architecture, types, functions, tables, metatables, coroutines, I/O, performance, testing, and capstone projects. Production-grade examples with edge cases, anti-patterns, and real-world system patterns.
---

# 📖 Learn Lua — Zero to Hero

A code-first, production-grade Lua curriculum. Every chapter is structured around annotated code blocks: complex implementations, anti-patterns with fixes, performance tips, edge cases, and debugging challenges. Minimal prose, maximum signal.

Lua is a lightweight, embeddable scripting language with a register-based VM, used in game engines (Roblox, Garry's Mod, Defold), configuration (Neovim, AwesomeWM), databases (Redis), networking (OpenResty, Nginx), and embedded systems. Its entire runtime is a C library — the `lua` executable is a 200-line wrapper.

## How to Use This Course

1. **Read sequentially** (01 → 16) for a structured path from runtime architecture to capstone projects.
2. **Jump to a chapter** as a reference when you hit a concept in production.
3. **Run every code example** — they're written as self-contained, executable scripts.
4. **Solve the Spot the Bug challenges** before reading the answers.

## Prerequisites

- Lua 5.4+ installed (`brew install lua` / `apt install lua5.4`), or LuaJIT 2.1+.
- `luarocks` for package management (`brew install luarocks`).
- `luacheck` for linting (`luarocks install luacheck`).
- Comfort with at least one other dynamic language (Python, JS, Ruby).

## Curriculum

### Part I — Foundations & Execution Model

| # | Topic | Why It Matters |
|---|---|---|
| 01 | [Runtime Architecture & Execution](/lua/01-getting-started) | Chunk compilation, `load`/`loadfile`/`require` pipeline, `_G` registry, sandboxing, hot-reload. |
| 02 | [Types, Scoping & Memory](/lua/02-variables-and-data-types) | 8-type system, integer/float duality, `_ENV` mechanics, upvalue cells, table reference semantics, weak tables. |
| 03 | [Functions, Closures & TCO](/lua/03-functions) | First-class functions, MRV truncation rules, varargs with `select`/`pack`, proper tail calls, state machines. |
| 04 | [Control Flow & Iterators](/lua/04-control-flow) | `if` as statement, numeric/generic `for` with the iterator protocol, table dispatch as `switch`, `goto` for state machines. |

### Part II — Tables & Data Structures

| # | Topic | Why It Matters |
|---|---|---|
| 05 | [Tables, OOP & Data Structures](/lua/05-tables-and-objects) | Array/hash internals, reference vs value, shallow/deep copy with cycles, OOP via `__index`, mixins, linked list, ring buffer, object pool. |
| 06 | [Strings, Patterns & Binary](/lua/06-string-manipulation) | Immutable interned strings, Lua pattern engine (not regex), captures, frontier `%f`, UTF-8, `string.byte`/`char` for binary protocols. |

### Part III — Metaprogramming & Concurrency

| # | Topic | Why It Matters |
|---|---|---|
| 07 | [Metatables & Metamethods](/lua/07-metatables-and-metamethods) | Full metamethod reference, operator overloading, `__index`/`__newindex` proxies, read-only tables, `__gc`/`__close` for resources. |
| 08 | [Modules & Packages](/lua/08-modules-and-packages) | `require` cache, `package.searchers`/`preload`, circular dependency resolution, hot-reload, dependency injection, `luarocks`. |
| 11 | [Coroutines & Generators](/lua/11-coroutines) | `create`/`resume`/`yield` protocol, stackful yielding, generators as iterators, producer-consumer pipelines, cooperative scheduler. |

### Part IV — Robustness & I/O

| # | Topic | Why It Matters |
|---|---|---|
| 09 | [Error Handling](/lua/09-error-handling) | `error` levels, `pcall`/`xpcall`, structured errors with metatables, retry with backoff, circuit breaker, `<close>` cleanup. |
| 10 | [I/O, Files & Binary](/lua/10-io-and-files) | File handle lifecycle, streaming with `:lines()`, `seek`/`tell`, binary I/O, `io.popen` subprocess, atomic writes, CSV/INI parsers. |

### Part V — Standard Library & Performance

| # | Topic | Why It Matters |
|---|---|---|
| 12 | [Standard Library Deep-Dive](/lua/12-standard-library) | `math` (random/precision/integer), `os` (time/date/env), `table` (sort/move/pack), `debug` (introspection/hooks), `package` (searchers/preload). |
| 13 | [Performance & LuaJIT](/lua/13-performance) | Global vs local cost, table rehash avoidance, `table.concat` vs `..`, closure allocation, `collectgarbage` profiling, LuaJIT FFI. |

### Part VI — Engineering & Capstone

| # | Topic | Why It Matters |
|---|---|---|
| 14 | [Testing & Mocking](/lua/14-testing) | Assertion library, parametric/table-based tests, `package.preload` mocking, dependency injection, coverage with `debug.sethook`, `busted`. |
| 15 | [Best Practices & Patterns](/lua/15-best-practices) | Strict mode, module design, error architecture, RAII via `<close>`, config layering, logging, anti-patterns catalog. |
| 16 | [Capstone Projects](/lua/16-exercises-and-projects) | JSON parser, coroutine pipeline, ORM query builder, plugin sandbox system, LRU cache, binary search, type checker, mini-REPL. |

## Learning Path Suggestions

### If you're coming from Python/Ruby

Focus on:
- **02** — `_ENV` and integer/float duality are unique to Lua
- **05** — tables are not dicts; array/hash duality
- **07** — metatables are not `__getattr__`; `__index`/`__newindex` as proxies
- **11** — coroutines are stackful (can yield from nested calls)

### If you're coming from JavaScript

Focus on:
- **01** — `load()` with custom env is like `new Function()` + `with`
- **02** — 1-indexed arrays, only `nil`/`false` are falsy (0 and "" are truthy)
- **06** — Lua patterns are NOT regex (no `|`, no lookahead, `%` instead of `\`)
- **07** — metatables are like `Proxy` but older and more limited
- **11** — coroutines are like generators but stackful (no `yield*` needed)

### If you're embedding Lua in C / a game engine

Read all chapters, then focus on:
- **01** — `load()` with sandbox env is your security boundary
- **02** — types map to C types (table → `lua_Table`, userdata → C object)
- **05** — tables are the data interchange format with C
- **07** — metatables for custom C types and operator overloading
- **08** — `package.preload` for embedded modules (no filesystem)
- **15** — strict mode for catching bugs in untrusted scripts

### If you're a senior engineer

Skim 01–04. Read deeply:
- **05** (Tables — the data model)
- **07** (Metatables — the extension mechanism)
- **11** (Coroutines — the concurrency primitive)
- **13** (Performance — where LuaJIT changes the game)
- **16** (Capstone — integration of all concepts)

## Key Differences from Other Languages

| Concept | Lua | JavaScript | Python |
|---|---|---|---|
| Array indexing | 1-based | 0-based | 0-based |
| Falsy values | `nil`, `false` only | `0`, `""`, `null`, `false` | `0`, `""`, `None`, `False` |
| Composite type | Table (only) | Object/Array/Map | dict/list/tuple/set |
| Regex | Lua patterns (simpler) | Full regex | `re` module |
| Inheritance | `__index` chain | Prototype chain | Class-based |
| Concurrency | Coroutines (cooperative) | `async`/`await` (event loop) | `asyncio` (event loop) |
| Ternary | `a and b or c` (trap!) | `a ? b : c` | `b if a else c` |
| Block scope | `local` in blocks | `let`/`const` in blocks | Yes (functions/classes) |
| Tail calls | Guaranteed (PTC) | No (most engines) | No (recursion limit) |
| String interning | Yes (all strings) | Some (interned literals) | Some (interned literals) |
| Module system | `require` + `package.loaded` | `import`/`require` | `import`/`__import__` |

## Tooling

| Tool | Purpose | Install |
|---|---|---|
| `lua` | Reference interpreter (PUC-Rio) | `brew install lua` |
| `luajit` | JIT compiler (10-100x faster) | `brew install luajit` |
| `luarocks` | Package manager | `brew install luarocks` |
| `luacheck` | Static analyzer (globals, shadowing) | `luarocks install luacheck` |
| `busted` | BDD test framework | `luarocks install busted` |
| `luaunit` | Lightweight test framework | `luarocks install luaunit` |
| `lfs` | LuaFileSystem (directory access) | `luarocks install luafilesystem` |
| `lpeg` | Parsing Expression Grammars | `luarocks install lpeg` |
| `cjson` | Fast JSON (C-backed) | `luarocks install lua-cjson` |
| `luasocket` | Networking (TCP/UDP/HTTP) | `luarocks install luasocket` |