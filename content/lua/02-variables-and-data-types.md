# 02 — Variables & Data Types

## Declaration: `local`, global, and function scope

Lua has **no block scope** (except `local` declarations). Variables are either global or local.

| Scope | Syntax | Lifetime | Visibility |
|---|---|---|---|
| Global | `x = 5` | Program lifetime | All functions/chunks |
| Local | `local x = 5` | Enclosing block | Current block & inner scopes |
| Function param | `function f(x)` | Function call | Function body |

::code-wrapper{language="lua"}
```lua
x = 10              -- global
local y = 20        -- local to current block
function test()
  z = 30            -- global (assignments always are)
  local w = 40      -- local to function
end
```
::

### Best practice: use `local` everywhere

Global variables are slow (table lookups) and pollute the namespace. Prefer `local` for performance and safety.

::code-wrapper{language="lua"}
```lua
local name = "Alice"      -- fast, contained
local function greet()    -- creates local function
  print("Hi " .. name)
end
greet()

-- Don't do this:
GLOBAL_NAME = "Alice"     -- slower, accidental pollution
```
::

### `local` has no block scope (only function scope)

Unlike JavaScript, Lua's `local` is function-scoped, not block-scoped.

::code-wrapper{language="lua"}
```lua
local function test()
  local x = 5
  if true then
    local y = 10        -- local to this block (but not really)
    x = 100             -- mutates outer local
  end
  print(x)              -- 100
  print(y)              -- nil (y is scoped, but...)
end

-- Actually:
local function test()
  local x, y
  if true then
    x = 100
    y = 10
  end
  print(x)              -- 100
  print(y)              -- 10 (still visible!)
end
```
::

## Primitive Data Types

Lua has **8 primitive types**:

| Type | Example | Falsy Value |
|---|---|---|
| `nil` | `nil` | Yes |
| `boolean` | `true`, `false` | Yes (only `false` and `nil` are falsy) |
| `number` | `42`, `3.14` | No |
| `string` | `"hello"`, `'world'` | No (even empty string `""` is truthy) |
| `table` | `{a=1}`, `{1,2,3}` | No (even `{}` is truthy) |
| `function` | `function() end` | No |
| `userdata` | C object | No |
| `thread` | `coroutine.create(fn)` | No |

### Falsy vs Truthy

::code-wrapper{language="lua"}
```lua
if nil then print("no") end         -- false
if false then print("no") end       -- false
if 0 then print("yes") end          -- true (0 is NOT falsy!)
if "" then print("yes") end         -- true (empty string is truthy!)
if {} then print("yes") end         -- true (empty table is truthy!)

-- Only nil and false are falsy
if not nil then print("nil is falsy") end      -- true
if not false then print("false is falsy") end  -- true
```
::

## Numbers

Lua (5.3+) unifies integers and floats; older versions had only floats.

::code-wrapper{language="lua"}
```lua
local x = 42        -- integer
local y = 3.14      -- float
local z = 1e3       -- scientific: 1000
local w = 0x1F      -- hexadecimal: 31

-- Arithmetic
10 + 5              -- 15
10 - 5              -- 5
10 * 5              -- 50
10 / 5              -- 2.0 (always returns float in Lua 5.3+)
10 // 5             -- 2 (floor division, Lua 5.3+)
10 % 3              -- 1 (modulo)
2 ^ 10              -- 1024 (exponentiation)

-- String to number coercion (sometimes)
tonumber("42")      -- 42
tonumber("3.14")    -- 3.14
tonumber("abc")     -- nil
```
::

### Edge case: integer vs float division

::code-wrapper{language="lua"}
```lua
10 / 4              -- 2.5 (float division)
10 // 4             -- 2 (floor division, Lua 5.3+)
10 % 4              -- 2 (modulo: 10 - (10//4)*4)

-- Floating-point precision
0.1 + 0.2 == 0.3    -- false (same as JavaScript)
```
::

## Strings

Strings are immutable sequences of bytes. In Lua 5.3+, strings can contain embedded nulls.

::code-wrapper{language="lua"}
```lua
local s = "hello"
local t = 'world'
local u = [[
  multi-line
  string literal
]]

-- Length
#"hello"            -- 5
#""                 -- 0

-- Concatenation (note: .. operator)
"hello" .. " " .. "world"     -- "hello world"
"value: " .. 42               -- "value: 42" (auto-coerces)

-- Indexing (1-based, not 0-based!)
s[1]                -- "h"
s:sub(1, 5)         -- "hello" (substring)
s:sub(-1)           -- "o" (last char)
s:upper()           -- "HELLO"
s:lower()           -- "hello"
```
::

### Edge case: 1-based indexing

::code-wrapper{language="lua"}
```lua
local arr = {10, 20, 30}
arr[1]              -- 10 (first element)
arr[0]              -- nil (no zeroth element in Lua!)
#arr                -- 3 (length)

-- This surprises every C/JavaScript programmer
for i = 1, #arr do
  print(arr[i])
end
```
::

## Tables

Tables are Lua's **only composite data structure** (arrays, objects, dicts, sets all use tables).

::code-wrapper{language="lua"}
```lua
-- Array-like (1-indexed)
local arr = {10, 20, 30}
arr[1]              -- 10
arr[2] = 99
#arr                -- 3

-- Object-like (key-value pairs)
local person = {
  name = "Alice",
  age = 30,
  ["email"] = "alice@example.com"
}
person.name         -- "Alice"
person["age"]       -- 30

-- Mixed
local mixed = {
  1, 2, 3,          -- arr[1]=1, arr[2]=2, arr[3]=3
  name = "Alice",   -- mixed.name = "Alice"
  x = 10
}
```
::

### Table operations

::code-wrapper{language="lua"}
```lua
-- Insert / remove
local t = {1, 2, 3}
table.insert(t, 99)         -- {1, 2, 3, 99}
table.remove(t)             -- removes last element
table.remove(t, 2)          -- removes at index 2

-- Iterate
for i, v in ipairs(t) do print(i, v) end   -- 1-based iteration (array part)
for k, v in pairs(t) do print(k, v) end    -- all key-value pairs (hash part)

-- Keys and length
#t                          -- length (array part only)
table.concat(t, ", ")       -- "1, 2, 3" (joins array)
```
::

### Edge case: tables are references

::code-wrapper{language="lua"}
```lua
local t1 = {a = 1}
local t2 = t1
t2.a = 2
print(t1.a)         -- 2 (same table!)

-- Copy requires explicit iteration
local t3 = {}
for k, v in pairs(t1) do
  t3[k] = v
end
t3.a = 3
print(t1.a)         -- still 2
```
::

## Boolean

Only `true` and `false` (lowercase).

::code-wrapper{language="lua"}
```lua
local a = true
local b = false

-- Logical operators
a and b             -- false (both must be true)
a or b              -- true (at least one true)
not a               -- false

-- Short-circuit evaluation
local x = nil or "default"       -- "default"
local y = false and "never"      -- false
```
::

## `nil`

`nil` represents the absence of a value.

::code-wrapper{language="lua"}
```lua
local x = nil       -- explicitly nothing
local y             -- implicitly nil (no initialization)

if x == nil then print("x is nil") end

-- Removing from tables
local t = {a=1, b=2}
t.a = nil           -- removes key 'a' from table
#t                  -- 0 (no array part)
```
::

## Type Checking

::code-wrapper{language="lua"}
```lua
type(5)             -- "number"
type("hello")       -- "string"
type(true)          -- "boolean"
type(nil)           -- "nil"
type({})            -- "table"
type(function() end) -- "function"

-- Checking specific types
if type(x) == "number" then ... end
```
::

## Type Coercion

Lua is more conservative than JavaScript but still coerces in string operations.

::code-wrapper{language="lua"}
```lua
-- String coercion in concatenation
"value: " .. 42     -- "value: 42" (number → string)
"5" .. 3            -- "53"

-- Arithmetic forces coercion (errors if can't convert)
tonumber("5") + 3   -- 8
"5" + 3             -- ERROR: attempt to perform arithmetic on a string
```
::

## 💡 Tips & Tricks

**Print debugging**: Lua's `print()` auto-converts to string, so `print({a=1})` gives `table: 0x...`. For better output, use `print(vim.inspect(t))` (in Neovim) or write a debug function:
```lua
local function dump(t)
  for k, v in pairs(t) do print(k, v) end
end
```

**Table iteration patterns**: `ipairs` iterates array part in order (1-indexed); `pairs` is unordered but hits all keys. For predicability in production, collect keys first: `local keys = {}; for k in pairs(t) do table.insert(keys, k) end; table.sort(keys)`.

**Ternary-like without `if`**: Use `condition and value_if_true or value_if_false`, but be careful if the "true" value is falsy. Safer: `condition and {value_if_true} or value_if_false` (wrap in table), or just use `if` (it's an expression).

**Local functions should come first**: Order matters in Lua. Define helper functions before calling them, unless they're inside another function.

## ⚠️ Edge Cases & Gotchas

**1-indexing everywhere**: Arrays, string indexing, `string.sub()` all use 1-based indexing. Very different from C/Python/JavaScript. Write a helper if you're translating from other languages.

**Empty string and zero are truthy**: `if "" then` is true! This breaks port from other languages. Always use explicit checks: `if x ~= nil then` or `if x ~= false then`.

**Concatenation coercion only in `..` operator**: `"5" + 3` is an error; only `"5" .. 3` coerces. You can't accidentally add strings.

**Tables don't have `.length` property**: Use `#t`, not `t.length`. If you add non-integer keys to a table, `#` returns the length of the array part (undefined behavior if there are gaps).

**`nil` in tables has special meaning**: `local t = {a=1, b=nil, c=3}` — key `b` is removed. To store `nil`, use explicit construction or be careful with unpack/pairs.

**Modifying table during iteration**: If you add/remove keys during a `pairs()` loop, behavior is undefined. Always iterate over a copy if you need to modify.

**Global variable pollution**: Every assignment without `local` goes to `_G` (the global table). Typos create globals instead of erroring. Use a linter or `luacheck` to catch this.

**No true privacy**: Tables don't have truly private fields. Use naming conventions (leading `_`) or closures; Lua 5.4 has `<close>` but full privacy requires design patterns.

## 🧠 Spot the Bug

What does this log?

```lua
local x = {}
x[1] = "a"
x[2] = "b"
x[3] = nil
x[4] = "c"
print(#x)
```

<details>
<summary>Answer</summary>

Logs `2` (or possibly undefined behavior, depending on Lua version).

Here's why: `#` returns the length of the array part, which is the largest index `i` such that `t[i] ~= nil` and `t[i+1] == nil`. Since `x[3] = nil`, the array part "ends" at index 2. The `x[4] = "c"` is in the hash part, not the array part, so `#x` ignores it.

**The lesson**: Avoid `nil` values in the middle of array-like tables. Either remove the key entirely or use a sparse array (with gaps understood as missing).

</details>

## Key Takeaways

- Use `local` everywhere — globals are slow and pollute namespace.
- Only `nil` and `false` are falsy; `0`, `""`, and `{}` are truthy.
- Tables are the only composite type — they're arrays, objects, and dicts.
- All strings and arrays are 1-indexed (not 0-indexed).
- `#table` returns the array length, not total keys.
- Type coercion happens in `..` concatenation but not in `+` arithmetic.
- Table assignment without `local` creates globals; use a linter to catch typos.
