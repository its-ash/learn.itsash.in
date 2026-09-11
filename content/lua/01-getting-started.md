---
title: Lua 01 — Runtime Architecture, Embedding & Execution Model
description: Deep-dive into Lua's VM, chunk compilation, registry, embedding boundary, and the require/dofile/loadfile execution pipeline. Production-grade patterns for sandboxing, hot-reload, and C interop.
---

# 01 — Runtime Architecture, Embedding & Execution Model

Lua is a register-based VM that compiles source to bytecode, then executes on a stack-machine. The entire runtime is a C library (`liblua`) — the `lua` executable is a thin 200-line wrapper. Understanding the compilation→execution boundary, the registry, and how chunks are loaded is the difference between "scripting" and engineering with Lua.

## Installation

::code-wrapper{language="bash"}
```bash
brew install lua         # macOS — Lua 5.4
sudo apt install lua5.4  # Debian/Ubuntu
lua -v                   # Lua 5.4.6  Copyright (C) 1994-2023 Lua.org, PUC-Rio

luajit -v               # LuaJIT 2.1 — drop-in, JIT-compiled, 10-100x faster
```
::

::code-wrapper{language="bash"}
```bash
luarocks --version      # package manager: luarocks install lua-cjson
luacheck --version      # static analyzer: catches globals, shadowing, dead code
```
::

## Chunk Compilation & Execution

A **chunk** is the unit of compilation. Lua compiles the entire chunk to bytecode before executing any statement — syntax errors abort before any side effects.

::code-wrapper{language="lua" filename="chunk_demo.lua"}
```lua
-- loadstring compiles source → bytecode; returns a function (the "main" of the chunk)
-- The returned closure captures the global environment at compile time.
local chunk = load([[
  local x = 10          -- local: stored in the closure's upvalue slot
  y = 20                -- global: writes to _G via the chunk's environment
  return x + 5
]])

-- load() does NOT execute; it returns a function. Call it to run.
local ok, result = pcall(chunk)   -- pcall: protected call, catches runtime errors
print(ok, result)                 -- true   15
print(y)                          -- 20     (side effect: global created)

-- load() with a custom environment (sandbox boundary):
local env = { print = print, math = math }   -- whitelist only safe globals
local sandbox = load("print(math.sqrt(16))", "sandbox", "t", env)
sandbox()                        -- 4.0    — cannot access io, os, debug, _G
```
::

::code-wrapper{language="lua"}
```lua
-- loadfile: compile a file without executing. nil + error message on failure.
local fn, err = loadfile("plugin.lua")
if not fn then
  error("Failed to compile plugin: " .. err)   -- err contains line:col from parser
end
-- fn is the chunk's main function; call it when ready (deferred execution)
fn()

-- dofile: compile + execute immediately. No error handling — crashes on failure.
dofile("config.lua")    -- returns the chunk's value (usually discarded)

-- require: compile + execute + cache in package.loaded[name]
-- Returns cached value on subsequent calls; never re-executes unless cache cleared.
local mod = require("mymod")         -- searches package.path
package.loaded["mymod"] = nil       -- evict from cache
local mod2 = require("mymod")       -- re-executes the chunk
```
::

### Anti-pattern: `dofile` in production

::code-wrapper{language="lua"}
```lua
-- BAD: dofile has no error handling. A syntax error or runtime error crashes
-- the entire host process. No way to catch, no way to log.
dofile(user_script)         -- if user_script has a typo → uncaught error → process dies

-- GOOD: loadfile + pcall gives compile-time and run-time isolation
local fn, compile_err = loadfile(user_script)
if not fn then
  log_error("Compile failed: " .. compile_err)
  return
end
local ok, runtime_err = pcall(fn)
if not ok then
  log_error("Runtime: " .. runtime_err)   -- full error, process survives
end
```
::

## The Registry & Global Table (`_G`)

Every Lua state has a **registry** — a hidden table accessible from C via `LUA_REGISTRYINDEX`. The global table `_G` is stored in the registry under the key `LUA_RIDX_GLOBALS`.

::code-wrapper{language="lua"}
```lua
-- _G is just a regular table. All globals are entries in it.
x = 42
print(_G.x)                    -- 42
print(rawget(_G, "x"))          -- 42  (rawget bypasses __index metamethod)

-- _G is itself accessible from _G (circular reference)
print(_G._G._G == _G)           -- true

-- Enumerate all globals (note: includes standard library tables)
for name in pairs(_G) do
  print(name)                   -- print, string, table, math, io, os, _G, ...
end

-- Production: lock down globals to catch typos at runtime
setmetatable(_G, {
  __index = function(t, k)
    error("attempt to read undefined global: " .. k, 2)
  end,
  __newindex = function(t, k, v)
    error("attempt to create global: " .. k .. " (use local)", 2)
  end,
})
```
::

## Standard Library Map

| Library | Key Functions | When to Use |
|---|---|---|
| `string` | `match`, `gsub`, `gmatch`, `format`, `byte`, `char` | Pattern matching, formatting |
| `table` | `insert`, `remove`, `concat`, `sort`, `move`, `pack`, `unpack` | Array/dict manipulation |
| `math` | `random`, `randomseed`, `floor`, `ceil`, `huge`, `maxinteger` | Math operations |
| `io` | `open`, `read`, `write`, `lines`, `popen`, `stderr` | File I/O |
| `os` | `time`, `date`, `clock`, `exit`, `getenv`, `execute` | OS interface |
| `debug` | `traceback`, `getinfo`, `getlocal`, `setlocal`, `sethook` | Introspection, profiling |
| `coroutine` | `create`, `resume`, `yield`, `status`, `wrap` | Cooperative multitasking |
| `utf8` | `codes`, `codepoint`, `len`, `char`, `offset` | UTF-8 (Lua 5.3+) |
| `package` | `loaded`, `path`, `cpath`, `searchpath`, `preload` | Module system |

::code-wrapper{language="lua"}
```lua
-- Localize hot-path standard library functions: global lookup → local upvalue
-- This is the single most impactful micro-optimization in Lua.
local sformat = string.format    -- 3x faster than string.format on hot paths
local tinsert  = table.insert    -- avoids _G.table.insert chain per call
local mrandom = math.random

local function generate_uuid()
  return sformat("%04x%04x", mrandom(0, 0xFFFF), mrandom(0, 0xFFFF))
end
```
::

## The `arg` Table & Command-Line Interface

::code-wrapper{language="lua" filename="cli.lua"}
```lua
-- arg[0] = script name, arg[1..n] = command-line args, arg[-n..-1] = interpreter args
print(arg[0])          -- "cli.lua" (script path)
print(arg[-1])        -- "lua" (interpreter name, when invoked as `lua cli.lua`)

-- Production argument parser: no external deps, handles flags + values
local function parse_args(args)
  local opts, positional = {}, {}
  local i = 1
  while i <= #args do
    local arg = args[i]
    if arg:sub(1, 2) == "--" then
      local name, value = arg:match("^%-%-([%w_-]+)=?(.*)$")
      if value == "" and args[i + 1] and not args[i + 1]:match("^%-") then
        value = args[i + 1]; i = i + 1     -- --flag value
      else
        value = value == "" and true or value  -- --flag (boolean) or --flag=val
      end
      opts[name] = value
    else
      positional[#positional + 1] = arg
    end
    i = i + 1
  end
  return opts, positional
end

local opts, args_rest = parse_args(arg)
print(opts.verbose, opts.output, args_rest[1])
-- $ lua cli.lua --verbose --output=result.txt input.txt
-- true    result.txt    input.txt
```
::

## Embedding Boundary: Lua State as a Sandbox

::code-wrapper{language="lua"}
```lua
-- load() with a custom environment creates a sandboxed execution context.
-- The chunk can ONLY access what's in the env table. This is how game engines,
-- Neovim, and Redis isolate untrusted scripts.

local function create_sandbox()
  local env = {}
  -- Whitelist safe standard library functions
  env.print    = print
  env.pairs    = pairs
  env.ipairs   = ipairs
  env.tostring = tostring
  env.tonumber = tonumber
  env.type     = type
  env.error    = error
  env.assert   = assert
  env.select   = select
  env.unpack   = table.unpack
  env.string   = { format = string.format, sub = string.sub, len = string.len }
  env.math     = { floor = math.floor, ceil = math.ceil, random = math.random }
  env.table    = { insert = table.insert, remove = table.remove, concat = table.concat }
  -- NO io, os, debug, require, loadfile, dofile, load — cannot escape
  return env
end

local function run_untrusted(code_str)
  local fn, err = load(code_str, "user_code", "t", create_sandbox())
  if not fn then return false, "compile: " .. err end
  local ok, result = pcall(fn)
  if not ok then return false, "runtime: " .. result end
  return true, result
end

-- Even if the user code tries:  os.execute("rm -rf /")
-- → attempt to index nil value (global 'os')  → caught, sandbox holds
```
::

## Hot-Reload via `package.loaded` Eviction

::code-wrapper{language="lua"}
```lua
-- Production hot-reload: evict a module from cache, re-require, preserve state
local function reload_module(name, state_preserver)
  local old = package.loaded[name]
  local preserved_state = state_preserver and state_preserver(old) or {}
  package.loaded[name] = nil          -- evict: next require re-executes the chunk
  local new = require(name)           -- fresh module table
  if state_preserver then
    state_preserver(new, true, preserved_state)  -- restore state into new module
  end
  return new, old
end

-- Usage: reload a game system without restarting the process
local GameAI = require("game.ai")
-- ... modify game/ai.lua on disk ...
GameAI = reload_module("game.ai", function(mod, is_restore, state)
  if not is_restore then return { current_target = mod.current_target } end
  mod.current_target = state.current_target  -- restore into fresh module
end)
```
::

## `luac` — Bytecode Compiler & Inspector

::code-wrapper{language="bash"}
```bash
luac -o compiled.out script.lua    # precompile to bytecode (faster startup)
luac -l script.lua                  # disassemble: list bytecode instructions
luac -l -l script.lua               # full disassembly with constants & upvalues
```
::

::code-wrapper{language="lua"}
```lua
-- Precompiled chunks load faster (skip parse step) but are NOT portable across
-- Lua versions or architectures. Distribute source for portability; precompile
-- for startup-critical embedded deployments.
local f = loadfile("compiled.out")  -- loadstring/loadfile accept bytecode too
f()
```
::

## 💡 Tips & Tricks

**Localize standard library functions in hot paths**: `local sformat = string.format` turns a global table lookup into a fast upvalue reference. Measurable on any profile.

::code-wrapper{language="lua"}
```lua
-- In a tight loop doing 10M string formats:
-- Global:     string.format(...)   →  _G → string → format  (2 hash lookups)
-- Localized:  local sfmt = string.format; sfmt(...)  → upvalue (direct pointer)
```
::

**Use `load()` with `mode` parameter to prevent bytecode injection**: `load(src, name, "t")` only accepts text, never bytecode — defends against precompiled malicious chunks.

::code-wrapper{language="lua"}
```lua
local fn = load(user_input, "user", "t")   -- "t" = text only, "b" = bytecode, "bt" = both
```
::

**`debug.getinfo(1, "Sl")` gives source + line for error reporting**: Build structured error objects with location info.

::code-wrapper{language="lua"}
```lua
local function err_at(level, msg)
  local info = debug.getinfo(level + 1, "Sl")  -- +1 to skip this function
  return string.format("%s:%d: %s", info.source, info.currentline, msg)
end
```
::

## ⚠️ Edge Cases & Gotchas

**`load()` inherits `_ENV` at compile time, not call time**: Changing `_ENV` after `load()` has no effect. Pass the environment as the 4th arg to `load()`.

::code-wrapper{language="lua"}
```lua
local fn = load("x = 1")    -- compiles with _ENV = _G
_ENV = {}                    -- too late — fn already bound to _G
fn()
print(x)                     -- 1 (wrote to _G, not the new _ENV)
```
::

**`dofile` does not search `package.path`**: It takes a literal file path. `require` searches `package.path` with `?` substitution. Don't mix them.

**`require` caches the return value, not the side effects**: If a module has side effects (registering callbacks) and you evict + re-require, side effects fire again — can cause double-registration bugs.

::code-wrapper{language="lua"}
```lua
-- module_with_side_effects.lua
local M = {}
hooks["on_tick"] = function() ... end   -- side effect: modifies global hooks
return M

-- Evicting and re-requiring runs the hook registration AGAIN:
package.loaded["module_with_side_effects"] = nil
require("module_with_side_effects")      -- hooks["on_tick"] now registered twice
```
::

**`loadfile` returns `nil` for both missing file and syntax errors**: Always check the second return value.

::code-wrapper{language="lua"}
```lua
local fn, err = loadfile("missing.lua")
-- fn == nil, err == "missing.lua: No such file or directory."
-- Don't just check fn — the error message tells you if it's missing vs malformed
```
::

**Bytecode is not stable across versions**: A `.out` compiled with Lua 5.3 won't load in 5.4. Always ship source unless you control the exact runtime.

## 🧠 Spot the Bug

What does this print?

::code-wrapper{language="lua"}
```lua
local env = { x = 100 }
local fn = load("return x + 1", "test", "t", env)
print(fn())
env.x = 200
print(fn())
```
::

<details>
<summary>Answer</summary>

Prints `101` then `201`.

`load()` compiles with the provided `env` table as the chunk's `_ENV`. The closure captures a reference to the **same table** — it doesn't snapshot values. So when `env.x` changes, the next call sees the updated value. This is because `x` in the chunk is a global lookup into `_ENV` (the env table), evaluated at call time, not compile time.

If you wanted a snapshot, you'd need to pass `x` as a parameter or upvalue, not via the environment table.

</details>

## 🔍 Spot the Bug II

::code-wrapper{language="lua"}
```lua
local sandbox = { print = print }
local fn = load("print('hello'); os.exit(1)", "test", "t", sandbox)
fn()
```
::

<details>
<summary>Answer</summary>

It errors with: `attempt to index a nil value (global 'os')`.

The sandbox env table only has `print`. When the chunk tries `os.exit(1)`, Lua looks up `os` in the env table, finds `nil`, then tries to index it (`nil.exit`) — which throws. The sandbox **holds** — `os.exit` never runs. This is exactly the security property you want. But if you had accidentally put `os = os` in the env, the script could call `os.execute("rm -rf /")`. Audit every key you whitelist.

</details>