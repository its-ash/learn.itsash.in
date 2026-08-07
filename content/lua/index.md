---
title: Learn Lua — From Scratch to Advanced
description: A comprehensive Lua curriculum covering fundamentals, tables, functions, metatables, modules, and practical patterns. Master Lua from beginner to advanced developer. Includes edge cases, best practices, and real-world examples.
---

# 📖 Learn Lua — From Scratch to Advanced

A comprehensive, edge-case-covering Lua curriculum. Each document is self-contained and covers its concept deeply enough that a careful reader can go from beginner to advanced Lua developer.

Lua is a lightweight, embeddable scripting language used in game engines (Roblox, Garry's Mod), configuration (Neovim, Awesome), streaming apps, and embedded systems. This course teaches idiomatic Lua with emphasis on practical patterns and surprising behaviors.

## How to Use This Course

1. **Read sequentially** for a structured path (01 → 10).
2. **Jump to a chapter** as a reference when you hit a concept in the wild.
3. **Run the examples** in each chapter using `lua script.lua` or the interactive prompt.
4. **Experiment**: Lua's REPL is perfect for learning. Type `lua` to start.

## Prerequisites

- A computer with Lua installed (macOS: `brew install lua`, Linux: `apt install lua5.4`, Windows: download from lua.org).
- A text editor (VS Code, Vim, etc.).
- Curiosity about how lightweight languages work.

## Curriculum

### Part I — Foundations

| # | Topic | Why It Matters |
|---|---|---|
| 01 | [Getting Started](/lua/01-getting-started) | Installation, REPL, first program, standard library overview. |
| 02 | [Variables & Data Types](/lua/02-variables-and-data-types) | Scoping, falsy values, 1-indexed strings, tables as only composite type. |
| 03 | [Functions](/lua/03-functions) | Declarations, closures, varargs, tail call optimization. |
| 04 | [Control Flow](/lua/04-control-flow) | If/else, loops (no block scope!), pattern matching idioms. |

### Part II — Tables & Objects

| # | Topic | Why It Matters |
|---|---|---|
| 05 | [Tables & Objects](/lua/05-tables-and-objects) | Array operations, dictionaries, object patterns, copying semantics. |
| 06 | [String Manipulation](/lua/06-string-manipulation) | Methods, patterns (regex-like), formatting, byte operations. |

### Part III — Advanced Features

| # | Topic | Why It Matters |
|---|---|---|
| 07 | [Metatables & Metamethods](/lua/07-metatables-and-metamethods) | Operator overloading, custom behavior, OOP patterns via `__index`. |
| 08 | [Modules & Packages](/lua/08-modules-and-packages) | `require()`, module patterns, circular dependencies, organization. |

### Part IV — Robustness

| # | Topic | Why It Matters |
|---|---|---|
| 09 | [Error Handling](/lua/09-error-handling) | `pcall()`/`xpcall()`, assertions, debugging, cleanup patterns. |
| 10 | [I/O & Files](/lua/10-io-and-files) | File operations, binary data, paths, JSON workflows. |

## Learning Path Suggestions

### If you're new to programming

1. Read 01–04 in order (fundamentals are different from mainstream languages).
2. Read 05 (Tables) carefully — this is the heart of Lua.
3. Read 09 (Error Handling) before writing production code.
4. Experiment in the REPL as you go.

### If you're coming from Python/Ruby

You already know dynamic languages. Focus on:
- **02** (no block scope is the biggest surprise)
- **05** (tables are different from dicts/hashes)
- **07** (metatables are unique to Lua)
- Skip straightforward parts like functions.

### If you're coming from JavaScript

You know closures and dynamic types. Be aware:
- **1-indexed arrays** (not 0-indexed)
- **No `null`** — Lua uses `nil`
- **No built-in regex** — Lua patterns are simpler
- **Metatables** for operator overloading (like JS's Proxy but older)

### If you're embedding Lua in C/Game Engine

Read all chapters, then learn the **Lua C API** (separate topic). Focus on:
- 01 (how Lua runs)
- 02 (types map to C types)
- 05 (tables are key to passing data)
- 07 (metatables for custom types)
- 08 (modules for organization)

### If you're a senior engineer

Skim 01–04. Read 05 (Tables — the data model), 07 (Metatables — the extension mechanism), 08 (Modules), and 09 (Error Handling) closely. Use 10 (I/O) as a reference.

## Key Differences from Other Languages

| Concept | Lua | JavaScript | Python |
|---|---|---|---|
| Array indexing | 1-based | 0-based | 0-based |
| Falsy values | `nil`, `false` only | `0`, `""`, `null`, `false` | `0`, `""`, `None`, `False` |
| Block scope | ❌ No (function-scoped) | ✅ Yes (lexically scoped) | ✅ Yes (with quirks) |
| String escape | `%d`, `%s` (patterns) | `\d`, `\s` (regex) | `\d`, `\s` (regex) |
| Null/Nothing | `nil` | `null`, `undefined` | `None` |
| Table access | `t[1]`, `t.key` | `arr[0]`, `obj.key` | `list[0]`, `dict[key]` |

## Companion Resources

- [Lua.org Official Docs](https://www.lua.org/manual/5.4/) — the definitive reference.
- [Lua Patterns](https://www.lua.org/pil/20.2.html) — regular expression-like patterns in Lua.
- [Programming in Lua](https://www.lua.org/pil/) — the book (chapters online free).
- [LuaRocks](https://luarocks.org) — package manager for Lua libraries.
- [Awesome Lua](https://github.com/LewisJEllis/awesome-lua) — curated Lua resources.
- [Lua Game Dev](https://love2d.org) — LÖVE 2D game framework (Lua-based).

## Tooling to Install

::code-wrapper{language="bash"}
```bash
# Lua (choose one)
# macOS
brew install lua

# Ubuntu/Debian
sudo apt-get install lua5.4

# Or build from source
curl https://www.lua.org/ftp/lua-5.4.6.tar.gz | tar xz
cd lua-5.4.6
make macosx  # or 'make linux', 'make mingw'
sudo make install

# Lua linter (optional, but recommended)
luarocks install luacheck

# Run linter
luacheck script.lua

# Interactive REPL
lua
```
::

## Testing in Lua

Lua doesn't have a built-in testing framework like Jest or pytest, but you can:

::code-wrapper{language="lua"}
```lua
-- Simple test framework
local function assert_equal(actual, expected, message)
  if actual ~= expected then
    error(string.format("Expected %s but got %s: %s", expected, actual, message))
  end
end

-- Usage
local function test_add()
  assert_equal(2 + 2, 4, "basic addition")
  assert_equal(10 + 20, 30, "larger numbers")
end

test_add()
print("All tests passed!")
```
::

Or use **Busted** (BDD testing framework for Lua):

::code-wrapper{language="bash"}
```bash
luarocks install busted

# Write tests
cat > spec/math_spec.lua << 'EOF'
describe("Math", function()
  it("adds numbers", function()
    assert.are.equal(2 + 2, 4)
  end)
end)
EOF

# Run tests
busted
```
::

## Common Use Cases

1. **Game modding** (Roblox, Garry's Mod) → Learn tables, functions, events.
2. **Game engine scripting** (LÖVE, Defold) → Learn all (Lua is the primary language).
3. **Neovim configuration** → Learn modules, tables, Neovim API.
4. **Embedded systems** → Learn core language, C API if embedding.
5. **Standalone scripts** → Learn I/O, modules, error handling.

## Next Steps After This Course

- **LÖVE 2D**: Build a game with Lua. Very welcoming for beginners.
- **Neovim scripting**: Configure your editor in Lua (modern alternative to Vimscript).
- **Roblox Studio**: Build games on the Roblox platform.
- **Embedding Lua in C**: Use Lua as a scripting layer in C programs (advanced).
- **LuaRocks packages**: Explore real-world Lua libraries.

## License

These notes are yours to use, share, and modify.

📖
