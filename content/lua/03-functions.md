# 03 — Functions

## Function Declaration

Functions are first-class values in Lua.

::code-wrapper{language="lua"}
```lua
-- Named function (creates local function)
local function add(a, b)
  return a + b
end
add(2, 3)            -- 5

-- Anonymous function assigned to variable
local multiply = function(a, b)
  return a * b
end
multiply(2, 3)       -- 6

-- Function as value (can be passed around)
local apply = function(fn, x, y)
  return fn(x, y)
end
apply(add, 2, 3)     -- 5
```
::

### Best practice: use `local function` for named functions

Faster, cleaner, and avoids polluting globals.

::code-wrapper{language="lua"}
```lua
local function greet(name)
  return "Hello, " .. name
end

-- Not this:
greet = function(name)
  return "Hello, " .. name
end
```
::

## Return Values

Functions can return multiple values; callers can ignore extras.

::code-wrapper{language="lua"}
```lua
local function minmax(a, b)
  if a < b then
    return a, b
  else
    return b, a
  end
end

local min, max = minmax(10, 5)     -- min=5, max=10
local just_min = minmax(10, 5)     -- just_min=5 (ignores second value)
```
::

### No explicit return

Omit `return` for functions that return nil:

::code-wrapper{language="lua"}
```lua
local function print_twice(x)
  print(x)
  print(x)
  -- implicitly returns nil
end
```
::

## Parameters and Arguments

Lua doesn't enforce argument count. Extra arguments are ignored; missing arguments are `nil`.

::code-wrapper{language="lua"}
```lua
local function greet(name, greeting)
  greeting = greeting or "Hello"    -- default value
  return greeting .. ", " .. name
end

greet("Alice")                -- "Hello, Alice"
greet("Alice", "Hi")         -- "Hi, Alice"
greet("Alice", "Hi", "extra") -- "Hi, Alice" (extra ignored)
```
::

### Variadic functions (variable arguments)

Use `...` (varargs) to accept any number of arguments.

::code-wrapper{language="lua"}
```lua
local function sum(...)
  local total = 0
  for i = 1, select('#', ...) do
    total = total + select(i, ...)
  end
  return total
end

sum(1, 2, 3)          -- 6
sum(1)                -- 1
sum()                 -- 0
```
::

Simpler with table unpacking:

::code-wrapper{language="lua"}
```lua
local function sum(...)
  local args = {...}
  local total = 0
  for _, v in ipairs(args) do
    total = total + v
  end
  return total
end
```
::

Use `table.pack` (Lua 5.2+) for varargs with length:

::code-wrapper{language="lua"}
```lua
local function sum(...)
  local args = table.pack(...)
  local total = 0
  for i = 1, args.n do
    total = total + args[i]
  end
  return total
end
```
::

## Closures

Functions capture variables from enclosing scopes (lexical scoping).

::code-wrapper{language="lua"}
```lua
local function makeCounter()
  local count = 0
  return function()
    count = count + 1
    return count
  end
end

local c1 = makeCounter()
c1()                  -- 1
c1()                  -- 2
c1()                  -- 3

local c2 = makeCounter()
c2()                  -- 1 (separate closure, separate count)
```
::

### Edge case: closures modify captured variables

::code-wrapper{language="lua"}
```lua
local function makePair()
  local a = 1
  local b = 2
  return {
    getA = function() return a end,
    setA = function(x) a = x end,
    getB = function() return b end,
  }
end

local pair = makePair()
pair.getA()           -- 1
pair.setA(100)
pair.getA()           -- 100
```
::

## Function Scope and Shadowing

Inner functions can shadow outer variables:

::code-wrapper{language="lua"}
```lua
local x = "outer"
local function outer()
  local x = "middle"
  local function inner()
    local x = "inner"
    print(x)        -- "inner"
  end
  inner()
  print(x)          -- "middle"
end
outer()
print(x)            -- "outer"
```
::

## Tail Calls

Lua optimizes tail calls (last expression is a function call). Prevents stack overflow in recursive functions.

::code-wrapper{language="lua"}
```lua
-- Tail call optimized
local function countdown(n)
  if n == 0 then
    return "done"
  else
    return countdown(n - 1)   -- tail call (result immediately returned)
  end
end

-- Not tail call (adds 1 after recursion)
local function sum_to(n, acc)
  acc = acc or 0
  if n == 0 then
    return acc
  else
    return sum_to(n - 1, acc + n) + 1  -- NOT a tail call (adds 1 after)
  end
end
```
::

## Named Parameters (Idiom)

Lua doesn't have named parameters, but the table idiom works:

::code-wrapper{language="lua"}
```lua
-- Old way (positional)
local function createUser(name, age, email)
  return {name = name, age = age, email = email}
end
createUser("Alice", 30, "alice@example.com")

-- Table idiom (named)
local function createUser(opts)
  return {
    name = opts.name,
    age = opts.age,
    email = opts.email
  }
end
createUser({name = "Alice", age = 30, email = "alice@example.com"})
```
::

## Metamethods

Functions can be used as metamethods to define behavior for operators:

::code-wrapper{language="lua"}
```lua
local Vector = {}
function Vector.new(x, y)
  return setmetatable({x = x, y = y}, Vector)
end

function Vector.__add(a, b)
  return Vector.new(a.x + b.x, a.y + b.y)
end

function Vector.__tostring(v)
  return "(" .. v.x .. ", " .. v.y .. ")"
end

local v1 = Vector.new(1, 2)
local v2 = Vector.new(3, 4)
print(v1 + v2)        -- "(4, 6)"
```
::

## Anonymous Functions (Lambdas)

::code-wrapper{language="lua"}
```lua
local nums = {1, 2, 3, 4, 5}

-- Map using anonymous function
local doubled = {}
for i, v in ipairs(nums) do
  doubled[i] = (function(x) return x * 2 end)(v)
end

-- Better: use a helper
local function map(fn, list)
  local result = {}
  for i, v in ipairs(list) do
    result[i] = fn(v)
  end
  return result
end
local doubled = map(function(x) return x * 2 end, nums)
```
::

## 💡 Tips & Tricks

**Immediate invocation for scope**: Use `(function() ... end)()` to create a scope without polluting globals. Useful in large config files or plugins.

**Unpack varargs with `...`**: To pass varargs to another function, use `...:
::code-wrapper{language="lua"}
```lua
local function delegate(...)
  return someOtherFunction(...)  -- passes all arguments through
end
```
::

**Use `select()` for varargs reflection**: `select('#', ...)` gets count, `select(i, ...)` gets i-th argument.

**Name inner functions for better stack traces**: Even anonymous functions benefit from being named: `local function helper() end` vs `local helper = function() end` (latter is clearer in debug output).

## ⚠️ Edge Cases & Gotchas

**Missing arguments are `nil`, not errors**: If you call `fn(a)` but `fn` expects `(a, b)`, then `b = nil`. No error thrown. Use `assert()` for preconditions.

::code-wrapper{language="lua"}
```lua
local function divide(a, b)
  assert(b ~= 0, "b must not be zero")
  return a / b
end
```
::

**Return without value returns `nil`**: A bare `return` or omitted return returns `nil`. To return multiple values, separate with commas.

::code-wrapper{language="lua"}
```lua
local function test()
  return            -- returns nil
end

local function test2()
  return 1, 2, 3    -- returns 1, 2, 3
end
```
::

**Varargs doesn't include function name**: `select('#', ...)` counts only arguments, not the function itself.

**Tail calls only work if result is immediately returned**: If you do anything after the call (add, concatenate, etc.), it's not a tail call.

::code-wrapper{language="lua"}
```lua
return f(x)       -- tail call
return f(x) + 1   -- NOT a tail call
```
::

**Functions are values, but can't be serialized**: You can't `json.encode()` a function. Use closures for state, not functions.

## 🧠 Spot the Bug

What does this print?

::code-wrapper{language="lua"}
```lua
local function makeAdder(x)
  return function(y)
    return x + y
  end
end

local add5 = makeAdder(5)
local add10 = makeAdder(10)

print(add5(3))
print(add10(3))
```
::

<details>
<summary>Answer</summary>

Prints `8` and `13`.

Here's why:
- `makeAdder(5)` returns a closure that captures `x = 5`
- `add5(3)` calls that closure with `y = 3`, so `5 + 3 = 8`
- `makeAdder(10)` returns a *different* closure capturing `x = 10`
- `add10(3)` returns `10 + 3 = 13`

Each call to `makeAdder` creates a new closure with its own captured `x`.

**The lesson**: Closures capture variables, and each closure is independent.

</details>

## Key Takeaways

- Functions are first-class values; assign them to variables and pass them around.
- Use `local function name() end` for named functions.
- Functions can return multiple values; callers can ignore extras.
- Use `...` (varargs) for variable arguments.
- Closures capture variables from enclosing scopes (lexical scoping).
- Tail calls are optimized; use them for deep recursion.
- Use tables for named parameters (idiom, not language feature).
- Metamethods define operator behavior for tables.
