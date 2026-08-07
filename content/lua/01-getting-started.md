# 01 — Getting Started

## What is Lua?

Lua is a **lightweight, dynamically-typed scripting language** designed for embedding in larger applications. It's used in:
- Game engines (Roblox, Garry's Mod, Defold, Corona SDK)
- Configuration (Neovim, Awesome window manager)
- Real-time systems (World of Warcraft, streaming apps)
- IoT and embedded systems

Lua prioritizes **simplicity, portability, and embedding** over built-in batteries. You get a minimal core language and a library for scripting, not a complete ecosystem.

## Installation

::code-wrapper{language="bash"}
```bash
# macOS
brew install lua

# Ubuntu/Debian
sudo apt-get install lua5.4

# Windows
# Download from https://www.lua.org/download.html
```
::

Verify:
```bash
lua -v     # Lua 5.4.6 (or your version)
```

## Your First Program

::code-wrapper{language="lua"}
```lua
print("Hello, World!")
```
::

Save as `hello.lua`, then run:

::code-wrapper{language="bash"}
```bash
lua hello.lua
```
::

## The Lua Interpreter (REPL)

Type `lua` with no arguments to enter the interactive prompt:

::code-wrapper{language="lua"}
```lua
$ lua
Lua 5.4.6  Copyright (C) 1994-2023 Lua.org, PUC-Rio
> print("interactive")
interactive
> x = 5
> print(x + 3)
8
> os.exit()  -- or Ctrl+D
```
::

## Comments

::code-wrapper{language="lua"}
```lua
-- Single-line comment

--[[ Multi-line comment
     spans multiple lines
]]

--[=[ Use more = for nesting
  --[[ this is fine ]]
]=]
```
::

## Chunks and Execution

A **chunk** is a sequence of statements. You can execute chunks interactively or load them from files:

::code-wrapper{language="lua"}
```lua
-- Execute multiple statements
x = 10
y = 20
print(x + y)

-- Functions are first-class
local function add(a, b)
  return a + b
end

print(add(5, 3))
```
::

## Structure of a Lua File

There's no required structure (no `main` function). Code executes top-to-bottom:

::code-wrapper{language="lua"}
```lua
-- 1. Imports / requires
local json = require("json")

-- 2. Helper functions
local function greet(name)
  return "Hello, " .. name
end

-- 3. Main logic
local user = "Alice"
print(greet(user))
```
::

## The `require()` Function

Load libraries and modules:

::code-wrapper{language="lua"}
```lua
local json = require("json")       -- Lua 5.1+
local cjson = require("cjson")     -- LuaJSON
local http = require("socket.http") -- LuaSocket

-- Module returns a table of exported functions
print(json.encode({name = "Alice"}))
```
::

## `dofile()` and `loadfile()`

Execute another Lua file:

::code-wrapper{language="lua"}
```lua
dofile("helpers.lua")      -- execute immediately
local fn = loadfile("helpers.lua")  -- load but don't execute
fn()                       -- call later
```
::

## Global `_G` Table

All globals live in the `_G` table:

::code-wrapper{language="lua"}
```lua
x = 10
_G.x                  -- 10 (same)
_G["x"]               -- 10

-- List all globals
for k in pairs(_G) do print(k) end
```
::

## Standard Libraries

Lua includes these modules:

| Module | Purpose |
|---|---|
| `string` | String manipulation (`string.sub`, `string.upper`, etc.) |
| `table` | Table operations (`table.insert`, `table.concat`, etc.) |
| `math` | Math functions (`math.sin`, `math.max`, `math.random`) |
| `io` | File I/O (`io.open`, `io.read`, `io.write`) |
| `os` | OS interface (`os.time`, `os.date`, `os.exit`) |
| `debug` | Debugging (`debug.getlocal`, `debug.traceback`) |

::code-wrapper{language="lua"}
```lua
-- Math
math.abs(-5)          -- 5
math.max(1, 5, 3)     -- 5
math.sqrt(16)         -- 4.0
math.random()         -- random [0, 1)
math.random(1, 10)    -- random integer [1, 10]

-- String
string.len("hello")   -- 5
string.upper("hello") -- "HELLO"
string.sub("hello", 1, 3)  -- "hel"
string.find("hello", "ll")  -- 3

-- Table
table.insert(t, value)  -- append
table.remove(t, index)  -- remove
table.concat(t, ", ")   -- join
```
::

## Command-Line Arguments

Access arguments via the `arg` table:

::code-wrapper{language="lua"}
```lua
-- script.lua
print("Program name:", arg[0])
print("Arguments:", arg[1], arg[2], ...)

for i, v in ipairs(arg) do
  print(i, v)
end
```
::

::code-wrapper{language="bash"}
```bash
lua script.lua hello world
# Output:
# Program name: script.lua
# Arguments: hello world
# 1  hello
# 2  world
```
::

## Nil and Default Values

Use `or` to provide defaults:

::code-wrapper{language="lua"}
```lua
local name = arg[1] or "Anonymous"  -- use arg[1] if truthy, else "Anonymous"
local count = config.count or 10
```
::

## Error Handling

Use `error()` to raise errors, `assert()` for preconditions:

::code-wrapper{language="lua"}
```lua
local function divide(a, b)
  assert(b ~= 0, "divisor must not be zero")
  return a / b
end

local result = divide(10, 0)  -- error: divisor must not be zero
```
::

For catching errors, use `pcall()` (protected call):

::code-wrapper{language="lua"}
```lua
local success, result = pcall(function()
  return divide(10, 0)
end)

if not success then
  print("Error:", result)
else
  print("Result:", result)
end
```
::

## 💡 Tips & Tricks

**Use `luacheck` for linting**: Catches typos (undeclared globals), unused variables, and unreachable code. Saves hours of debugging.

```bash
luacheck script.lua
```

**Local functions are faster**: `local function f() end` is faster and cleaner than assigning to a global.

**Use descriptive names despite Lua's simplicity**: Lua doesn't have built-in namespacing. Write functions like `player_update()`, not `update()`, to avoid collisions.

**Tables are your data structure**: Every complex data structure (stack, queue, class, closure) uses tables. Learn to manipulate them well.

## ⚠️ Edge Cases & Gotchas

**Globals leak by default**: Every assignment without `local` pollutes the global namespace. Use `strict.lua` or a linter to enforce `local`.

```lua
x = 5              -- GLOBAL (oops, typo from 'local x = 5')
local y = 10       -- local (safe)
```

**No block scope (only function scope)**: Unlike JavaScript, `if`, `for`, `while` don't create scopes. Only functions do. This surprises everyone.

```lua
local x = 5
if true then
  local y = 10
  x = 20           -- changes outer x
end
print(x)           -- 20
print(y)           -- nil
```

**`#` doesn't work on sparse tables**: If your table has gaps (e.g., `{1, nil, 3}`), `#` gives undefined results. Use explicit length tracking.

**No string escape sequences like Python**: `"hello\nworld"` works, but Lua doesn't have raw strings like Python's `r"..."`. Use `[[...]]` for literal content.

## 🧠 Quick Quiz

What does this print?

```lua
local x = 10
local y = x or 20
local z = false or 30
print(y, z)
```

<details>
<summary>Answer</summary>

Prints `10	30` (or `10 30` with spaces).

Here's why:
- `y = x or 20`: `x` is `10`, which is truthy, so `y = 10`
- `z = false or 30`: `false` is falsy, so `z = 30`

**The lesson**: `or` returns the first truthy value, or the last value if all are falsy. Very useful for defaults!

</details>

## Next Steps

1. Learn **variables and data types** (02)
2. Learn **functions** (03)
3. Learn **tables** (04)
4. Build a small project (calculator, todo app, game mod)
5. Explore **coroutines** for async-like patterns
6. If embedding in C, study **Lua C API**
