# 04 — Control Flow

## If-Then-Else

Lua's `if` is a statement, not an expression (unlike Scala).

::code-wrapper{language="lua"}
```lua
if x > 10 then
  print("big")
elseif x > 5 then
  print("medium")
else
  print("small")
end

-- No inline if expression; use 'or' and 'and' tricks instead
local size = x > 10 and "big" or "small"
```
::

### Edge case: `and`/`or` for ternary-like behavior

::code-wrapper{language="lua"}
```lua
local status = active and "online" or "offline"

-- Danger: if active is true but result is falsy, or returns wrong value
-- Safe pattern:
local status = active and {value = "online"} or "offline"
-- Better: just use if-then-else for clarity
```
::

## Loops

### While

::code-wrapper{language="lua"}
```lua
local i = 1
while i <= 5 do
  print(i)
  i = i + 1
end
```
::

### For (numeric)

::code-wrapper{language="lua"}
```lua
-- for variable = start, end, step do
for i = 1, 5 do
  print(i)          -- 1, 2, 3, 4, 5
end

for i = 1, 10, 2 do
  print(i)          -- 1, 3, 5, 7, 9
end

for i = 5, 1, -1 do
  print(i)          -- 5, 4, 3, 2, 1
end
```
::

### For (generic — iteration)

Use with `pairs()` or `ipairs()`:

::code-wrapper{language="lua"}
```lua
local person = {name = "Alice", age = 30}

-- pairs: iterate all key-value pairs (unordered)
for key, value in pairs(person) do
  print(key, value)
end

-- ipairs: iterate array part in order (1-based)
local nums = {10, 20, 30}
for i, v in ipairs(nums) do
  print(i, v)       -- prints: 1 10, 2 20, 3 30
end
```
::

### Repeat-Until

Like do-while in other languages:

::code-wrapper{language="lua"}
```lua
local i = 1
repeat
  print(i)
  i = i + 1
until i > 5         -- stops when condition is TRUE (unlike while)
```
::

### Break and Continue

`break` exits loops. Lua has no `continue` (use `else` in loops or refactor).

::code-wrapper{language="lua"}
```lua
for i = 1, 10 do
  if i == 5 then
    break           -- exit loop
  end
  print(i)
end

-- No continue; restructure:
for i = 1, 10 do
  if i ~= 5 then
    print(i)
  end
end
```
::

## Comparison Operators

::code-wrapper{language="lua"}
```lua
5 == 5              -- true
5 ~= 3              -- true (not equal)
5 < 10              -- true
5 <= 10             -- true
5 > 3               -- true
5 >= 3              -- true
```
::

### Edge case: equality with different types

::code-wrapper{language="lua"}
```lua
5 == "5"            -- false (number vs string)
nil == false        -- false (different falsy values)

-- Tables compare by reference
{a = 1} == {a = 1}  -- false (different tables)
local t = {a = 1}
t == t              -- true (same table)
```
::

## Logical Operators

::code-wrapper{language="lua"}
```lua
true and false      -- false
true or false       -- true
not true            -- false

-- Short-circuit evaluation
true or error("never runs")
false and error("never runs")
```
::

## Switch-Like Patterns

Lua has no `switch` statement. Use `if-elseif-else` or table dispatch:

::code-wrapper{language="lua"}
```lua
-- If-elseif-else
local status_code = 404
if status_code == 200 then
  print("OK")
elseif status_code == 404 then
  print("Not Found")
elseif status_code == 500 then
  print("Server Error")
else
  print("Unknown")
end

-- Table dispatch (pattern for many cases)
local handlers = {
  [200] = function() print("OK") end,
  [404] = function() print("Not Found") end,
  [500] = function() print("Server Error") end,
}

local fn = handlers[status_code]
if fn then fn() else print("Unknown") end
```
::

## Goto (Lua 5.2+)

Label and goto jump:

::code-wrapper{language="lua"}
```lua
local i = 1
::start::
print(i)
i = i + 1
if i <= 5 then
  goto start
end
```
::

Rarely used (considered harmful like in other languages). Prefer loops.

## Early Return

Use `return` to exit a function early:

::code-wrapper{language="lua"}
```lua
local function validate(x)
  if not x then
    return false, "x required"
  end
  if x < 0 then
    return false, "x must be positive"
  end
  return true, "valid"
end

local ok, msg = validate(-5)
print(ok, msg)      -- false, "x must be positive"
```
::

## Local Scope Blocks

You can create a scope with `do...end` without a loop:

::code-wrapper{language="lua"}
```lua
do
  local x = 5       -- scoped to this block
  print(x)
end
print(x)            -- nil (x is out of scope)

-- Useful for cleanup
do
  local f = io.open("file.txt")
  -- work with f
  if f then f:close() end
end
```
::

## Luacheck for Control Flow

Use a linter to catch common mistakes:

::code-wrapper{language="bash"}
```bash
luacheck script.lua
# Catches: unreachable code, unused variables, etc.
```
::

## 💡 Tips & Tricks

**Use table dispatch for many cases**: Instead of long if-elseif chains, use a table of functions. Cleaner and extensible.

**Loop over pairs/ipairs instead of manual indexing**: `for i, v in ipairs(t)` is cleaner than `for i = 1, #t do v = t[i] end`.

**Use repeat-until for input validation loops**: Familiar pattern (like do-while).

::code-wrapper{language="lua"}
```lua
local choice
repeat
  io.write("Enter 1-3: ")
  choice = tonumber(io.read())
until choice and choice >= 1 and choice <= 3
```
::

**Tail calls enable deep recursion**: Lua optimizes tail calls, so you can recurse deeply without stack overflow (if the call is truly tail).

## ⚠️ Edge Cases & Gotchas

**`for` loop variables are local to the loop**: You can't access `i` after the loop ends (unless you explicitly declared it before).

::code-wrapper{language="lua"}
```lua
for i = 1, 5 do
  print(i)
end
print(i)            -- nil (not 6)
```
::

**`ipairs` stops at first `nil`**: If your table has a `nil` value in the middle, `ipairs` stops iterating the array part.

::code-wrapper{language="lua"}
```lua
local t = {1, 2, nil, 4, 5}
for i, v in ipairs(t) do
  print(i, v)       -- prints: 1 1, 2 2 (stops at nil)
end
```
::

**`pairs()` order is undefined**: Don't rely on insertion order; use `ipairs()` for arrays.

**`~=` for not-equal (not `!=`)**: Different from most languages.

**`break` only exits one level**: If nested loops, break exits the inner loop, not all loops. Use a flag or refactor.

::code-wrapper{language="lua"}
```lua
local found = false
for i = 1, 5 do
  for j = 1, 5 do
    if i == 3 and j == 3 then
      found = true
      break
    end
  end
  if found then break end  -- break outer loop
end
```
::

## 🧠 Spot the Bug

What does this print?

::code-wrapper{language="lua"}
```lua
local x = 10
if x > 5 and x < 15 then
  x = x * 2
  if x > 25 then
    x = 0
  end
end
print(x)
```
::

<details>
<summary>Answer</summary>

Prints `20`.

Here's why:
- `x = 10`, so `x > 5` (true) and `x < 15` (true), entering the first if
- `x = 10 * 2 = 20`
- `x > 25` is false (20 is not > 25), so the second if doesn't execute
- Print `20`

**The lesson**: Conditions are evaluated in order. The second if sees the updated `x`.

</details>

## Key Takeaways

- Use `if-then-elseif-else-end` for conditionals (not expressions).
- For loops: numeric (`for i = 1, 10`), iterator (`for k, v in pairs(t)`), or generic.
- Lua has no `continue`; use `if not condition then ... end` to skip.
- Use `break` to exit loops (only one level).
- `ipairs()` for 1-based array iteration, `pairs()` for all keys (unordered).
- Use table dispatch instead of long `if-elseif` chains.
- `~=` for not-equal (not `!=`).
- Conditions use `and`/`or`/`not` (no `&&` or `||`).
