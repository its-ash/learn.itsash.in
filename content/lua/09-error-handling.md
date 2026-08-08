# 09 — Error Handling

## Error Basics

Lua distinguishes between errors (exceptions) and invalid values:

::code-wrapper{language="lua"}
```lua
-- Raising an error
error("something went wrong")

-- Catching errors with pcall (protected call)
local success, result = pcall(function()
  return 10 / 2
end)
print(success, result)    -- true, 5

-- Catching errors
local success, error_msg = pcall(function()
  return 10 / 0             -- will error
end)
print(success, error_msg)  -- false, "attempt to perform arithmetic on number 'a' (number expected)"
```
::

## `pcall()` and `xpcall()`

`pcall()` (protected call) wraps function calls to catch errors:

::code-wrapper{language="lua"}
```lua
local function risky()
  if math.random() > 0.5 then
    error("Random failure!")
  end
  return "success"
end

-- Using pcall
for i = 1, 3 do
  local ok, result = pcall(risky)
  if ok then
    print("Attempt " .. i .. ": " .. result)
  else
    print("Attempt " .. i .. ": Error - " .. result)
  end
end
```
::

`xpcall()` allows custom error handler (with stack traceback):

::code-wrapper{language="lua"}
```lua
local function handler(err)
  -- err is the error message
  local traceback = debug.traceback()
  return "Error: " .. err .. "\n" .. traceback
end

local ok, result = xpcall(function()
  error("Something broke!")
end, handler)

if not ok then
  print(result)  -- prints error message with traceback
end
```
::

## Validation with Assertions

Use `assert()` for preconditions:

::code-wrapper{language="lua"}
```lua
local function divide(a, b)
  assert(type(a) == "number", "a must be a number")
  assert(type(b) == "number", "b must be a number")
  assert(b ~= 0, "b must not be zero")
  return a / b
end

divide(10, 2)             -- 5 (OK)
divide("x", 2)            -- error: a must be a number
divide(10, 0)             -- error: b must not be zero
```
::

## Custom Errors

Raise custom errors with `error()`:

::code-wrapper{language="lua"}
```lua
-- Simple error (string message)
if value < 0 then
  error("value must be non-negative")
end

-- Error with level (for reporting correct location)
error("invalid argument", 2)  -- level 2 means caller's caller

-- Error with custom object (Lua 5.2+)
local err = {code = 42, message = "custom error"}
error(err)
```
::

## Try-Catch Patterns

Lua doesn't have try-catch, but we can simulate it with pcall:

::code-wrapper{language="lua"}
```lua
local function try(fn)
  return pcall(fn)
end

local function catch(ok, result, handler)
  if not ok then
    handler(result)
  end
  return ok, result
end

local ok, result = try(function()
  return 10 / 2
end)

catch(ok, result, function(err)
  print("Caught error: " .. err)
end)
```
::

Better: create a helper for common patterns:

::code-wrapper{language="lua"}
```lua
local function safe_call(fn, ...)
  local ok, result = pcall(fn, ...)
  if not ok then
    print("Error: " .. result)
    return nil
  end
  return result
end

-- Usage
local data = safe_call(function()
  return load_from_db()
end)

if data then
  print("Got data: " .. data)
else
  print("Failed to load data")
end
```
::

## Debugging with `debug` Library

Get stack information during errors:

::code-wrapper{language="lua"}
```lua
local function show_error(err)
  print("Error: " .. err)
  print("Stack trace:")
  print(debug.traceback())  -- full traceback
end

local ok, result = xpcall(function()
  error("Something broke!")
end, show_error)
```
::

Debug functions:

::code-wrapper{language="lua"}
```lua
-- Get info about a function/call
local info = debug.getinfo(function_or_level)
print(info.source)        -- source file
print(info.name)          -- function name
print(info.linedefined)   -- line where defined
print(info.currentline)   -- current line

-- Get local variables in a function call
for i = 1, math.huge do
  local name, value = debug.getlocal(level, i)
  if not name then break end
  print(name, value)
end

-- Hooks (breakpoints, tracing)
debug.sethook(function(event, line)
  print("Event: " .. event .. " at line " .. line)
end, "l")  -- "l" = line-by-line
```
::

## Cleanup with Error Handling

Ensure cleanup code runs even if error occurs:

::code-wrapper{language="lua"}
```lua
local function with_file(filename, fn)
  local f = io.open(filename)
  if not f then error("Can't open file") end
  
  local ok, result = pcall(fn, f)
  f:close()  -- always close, even if error
  
  if not ok then error(result) end
  return result
end

with_file("data.txt", function(f)
  local contents = f:read("*a")
  -- process contents
  return contents
end)
```
::

Lua 5.4+ `<close>` variables automate cleanup:

::code-wrapper{language="lua"}
```lua
local f <close> = io.open("file.txt")
-- f automatically closed when scope exits (even on error)

if not f then error("Can't open") end

local data = f:read("*a")
-- file auto-closes here
```
::

## Error Propagation

Re-raise errors to propagate:

::code-wrapper{language="lua"}
```lua
local function wrapper(fn)
  local ok, result = pcall(fn)
  if not ok then
    -- Log error, then re-raise
    print("Error in wrapper: " .. result)
    error(result, 2)  -- level 2 to report caller's location
  end
  return result
end

wrapper(function()
  error("original error")
end)
```
::

## Error Types (Conventions)

Use custom error objects for different error types:

::code-wrapper{language="lua"}
```lua
local function new_error(code, message)
  return {
    code = code,
    message = message,
    __tostring = function(self)
      return "[" .. self.code .. "] " .. self.message
    end
  }
end

local ok, err = pcall(function()
  if condition then
    error(new_error("AUTH_FAILED", "Invalid credentials"))
  end
end)

if not ok then
  local e = err
  if e.code == "AUTH_FAILED" then
    -- handle auth error
  end
end
```
::

## 💡 Tips & Tricks

**Use `assert()` liberally**: It's zero-cost in production (can be disabled), helps catch bugs early.

**Wrap external calls**: If calling C code or network, use `pcall()` to handle unpredictable errors.

**Log before re-raising**: Capture error context before propagating:

::code-wrapper{language="lua"}
```lua
local function log_and_raise(fn, context)
  local ok, result = pcall(fn)
  if not ok then
    log_error(context, result)
    error(result, 2)
  end
  return result
end
```
::

**Use level parameter correctly**: `error("msg", 1)` reports the `error()` call; `error("msg", 2)` reports the caller.

## ⚠️ Edge Cases & Gotchas

**`pcall()` returns the error message, not the error object**: If you `error({code = 1})`, the table is stringified to the message.

**Stack traces truncate long tables**: If error object is complex, you get `"[object object]"` in traceback.

**`error()` with no message defaults to error level**: `error()` uses level 1 (immediate error).

**`assert()` can be disabled**: Some Lua implementations optimize away assertions; don't rely on it for critical checks.

**Errors in metamethods can cause issues**: If `__index` raises an error, catching it requires careful handling.

**Deep recursion + pcall**: If recursive function errors deeply, pcall still catches it, but you lose the stack (it's already consumed).

## 🧠 Spot the Bug

What does this print?

::code-wrapper{language="lua"}
```lua
local function risky()
  error("failed!")
end

local ok, result = pcall(risky)
print(ok)
print(result)

if not ok then
  error(result)
end
```
::

<details>
<summary>Answer</summary>

Prints `false` then the error message (e.g., `failed!`), then raises the error again.

Here's why:
- `pcall(risky)` catches the error, returns `false` and the error message
- `print(ok)` prints `false`
- `print(result)` prints `failed!`
- `if not ok` is true, so `error(result)` is called, which raises the error again (will crash unless caught by outer pcall)

**The lesson**: `pcall()` catches errors, but you need to decide what to do with them (log, ignore, re-raise, etc.).

</details>

## Key Takeaways

- Use `pcall()` to catch errors; it returns `(success, result)`.
- Use `xpcall()` with custom error handler for advanced error handling.
- Use `assert()` for preconditions and sanity checks.
- Raise errors with `error("message")` or `error(message, level)`.
- `debug.traceback()` gives full stack trace.
- Re-raise errors with correct level to report proper location.
- Use `<close>` variables (Lua 5.4+) for automatic cleanup.
- Error objects can be tables, but they're converted to strings in messages.
