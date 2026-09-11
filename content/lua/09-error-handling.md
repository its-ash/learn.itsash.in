---
title: Lua 09 — Error Handling, pcall & Structured Errors
description: Deep-dive into Lua's error model: error() with levels and objects, pcall/xpcall semantics, structured error types with metatables, try/catch/finally simulation, error propagation with traceback preservation, debug library introspection, and production patterns for retry, circuit breakers, and resource cleanup with <close>.
---

# 09 — Error Handling, `pcall` & Structured Errors

Lua's error model: `error()` throws, `pcall()`/`xpcall()` catch. There are no `try`/`catch` keywords — error handling is functional. Errors carry a message (string or any value). The `debug` library provides stack traces and local variable introspection. Lua 5.4 adds `<close>` for deterministic cleanup. This chapter covers production patterns: structured errors, error propagation with level correction, retry/circuit-breaker logic, and traceback-preserving error handlers.

## `error()` — Throwing

::code-wrapper{language="lua"}
```lua
-- error(msg, level?): throws an error
-- msg: string (converted with tostring) OR any value (table, number)
-- level: controls which line the error points to
--   1 (default): the error() call itself
--   2: the caller of the function containing error() (useful for library functions)
--   0: no position info added

local function divide(a, b)
  if b == 0 then
    error("division by zero", 2)  -- level 2: error points to divide() CALLER, not this line
  end
  return a / b
end

-- Without level 2, the error points to line 4 (inside divide) — misleading
-- With level 2, the error points to the line that CALLED divide(10, 0)
divide(10, 0)  -- error: stdin:LINE: division by zero (points here, not inside divide)

-- Error with a table (structured error — Lua 5.2+ preserves the table)
error({code = "E_AUTH", message = "invalid token", details = {user = "alice"}})
```

## `pcall()` — Protected Call

::code-wrapper{language="lua"}
```lua
-- pcall(f, args...): calls f in protected mode
-- Returns: true, result1, result2, ... on success (all return values)
-- Returns: false, error_message on failure (only 2 values)

local ok, result = pcall(function(a, b)
  return a / b
end, 10, 2)
print(ok, result)  -- true  5

local ok2, err = pcall(function()
  error("boom")
end)
print(ok2, err)  -- false  "stdin:LINE: boom" (error adds source:line prefix to string errors)

-- pcall with multiple return values:
local function minmax(a, b) return a < b and a or b, a < b and b or a end
local ok3, lo, hi = pcall(minmax, 10, 5)
print(ok3, lo, hi)  -- true  5  10

-- On error: only 2 return values (ok, err) — extra values are nil
local ok4, e1, e2 = pcall(function() error("oops") end)
print(ok4, e1, e2)  -- false  "oops"  nil (only ok + err, no 3rd value)
```

## `xpcall()` — Protected Call with Handler

::code-wrapper{language="lua"}
```lua
-- xpcall(f, handler, args...): like pcall, but handler runs before the stack unwinds
-- The handler receives the error message and can capture a traceback
-- CRITICAL: debug.traceback() must be called in the handler, not later —
-- the stack is unwound by the time pcall returns.

local function with_traceback(fn)
  return xpcall(fn, function(err)
    -- err is the raw error value (string, table, or anything thrown by error())
    return {
      message = tostring(err),
      traceback = debug.traceback(tostring(err), 2),  -- capture NOW, before unwind
      timestamp = os.time(),
    }
  end)
end

local ok, err_obj = with_traceback(function()
  error({code = "E_FAIL", msg = "something broke"})
end)
if not ok then
  print(err_obj.message)     -- "table: 0x..." (tostring on a table)
  print(err_obj.traceback)   -- full stack trace
end
```

## Structured Errors with Metatables

::code-wrapper{language="lua"}
```lua
-- Production: typed error objects with error code, category, context
local Error = {}
Error.__index = Error
Error.__tostring = function(self)
  return string.format("[%s] %s: %s", self.category, self.code, self.message)
end

function Error.new(opts)
  return setmetatable({
    code = opts.code or "UNKNOWN",
    message = opts.message or "",
    category = opts.category or "GENERIC",
    context = opts.context or {},
    cause = opts.cause,  -- chain: original error if wrapping
  }, Error)
end

-- Error constructors by category
local function err_validation(msg, context)
  return Error.new({code = "VALIDATION", message = msg, category = "CLIENT", context = context})
end
local function err_not_found(resource, id)
  return Error.new({code = "NOT_FOUND", message = resource .. " not found: " .. tostring(id), category = "CLIENT"})
end
local function err_internal(msg, context)
  return Error.new({code = "INTERNAL", message = msg, category = "SERVER", context = context})
end

-- Usage: throw structured errors
local function get_user(id)
  if type(id) ~= "number" then
    error(err_validation("user id must be number", {provided = id}), 2)
  end
  if id < 0 then
    error(err_not_found("user", id), 2)
  end
  -- ... fetch user
  return {id = id, name = "Alice"}
end

-- Catch and inspect
local ok, result = pcall(get_user, "abc")
if not ok then
  if getmetatable(result) == Error then
    print(tostring(result))      -- [CLIENT] VALIDATION: user id must be number
    print(result.context)        -- {provided = "abc"}
  else
    -- unexpected error type (string, etc.)
    error("unexpected error: " .. tostring(result))
  end
end
```

## `try`/`catch`/`finally` Simulation

::code-wrapper{language="lua"}
```lua
-- Lua has no try/catch. Simulate with pcall + a helper.
-- The key: `finally` must run whether or not an error occurred.

local function try_catch_finally(try_block, catch_block, finally_block)
  local ok, err = xpcall(try_block, function(e)
    return e  -- raw error (preserve for catch_block)
  end)
  if not ok and catch_block then
    catch_block(err)
  end
  if finally_block then finally_block() end
  if ok then return err end  -- the result (if success)
  return nil, err  -- nil + error (if failure and catch handled it)
end

-- Usage:
local file
local content = try_catch_finally(
  function()
    file = io.open("data.txt", "r")
    if not file then error("file not found") end
    return file:read("*a")
  end,
  function(err)
    print("caught: " .. tostring(err))
  end,
  function()
    if file then file:close() end  -- always cleanup
  end
)
print(content)  -- file content or nil
```

## Error Propagation with Level Correction

::code-wrapper{language="lua"}
```lua
-- When re-raising an error from a pcall, use the correct level so the
-- error points to the original caller, not the re-raise line.

local function log_and_reraise(fn, context)
  local ok, err = pcall(fn)
  if not ok then
    -- Log with full context, then re-raise pointing to the CALLER of this function
    log_error(context, err)
    error(err, 2)  -- level 2: blame the caller of log_and_reraise, not this line
  end
  return err  -- the result (since ok was true, err holds the return value)
end

-- Without level 2: error always points to the error() line inside log_and_reraise
-- With level 2: error points to where log_and_reraise was called
log_and_reraise(function() error("original") end, "processing user input")
-- error: "original" — traceback points to the log_and_reraise call site
```

## `debug` Library — Introspection

::code-wrapper{language="lua"}
```lua
-- debug.getinfo(level_or_fn, what): get info about a function or stack frame
local function outer()
  local function inner()
    local info = debug.getinfo(2, "Slu")  -- 2 = caller frame; "Slu" = Source, lines, Upvalues
    print(info.source)       -- "@script.lua" (or "stdin")
    print(info.currentline)  -- current line in that frame
    print(info.what)         -- "Lua" (or "C", "main")
    print(info.nups)        -- number of upvalues
  end
  inner()
end
outer()

-- debug.getlocal(level, index): get local variable by index in a stack frame
-- Returns: name, value (or nil if no more locals at that index)
local function dump_locals(level)
  level = level or 2
  local i = 1
  while true do
    local name, value = debug.getlocal(level, i)
    if not name then break end
    print(string.format("  %s = %s", name, tostring(value)))
    i = i + 1
  end
end

local function example(a, b)
  local c = a + b
  dump_locals(1)  -- dumps: a, b, c (and maybe internal temporaries)
end
example(10, 20)

-- debug.setlocal(level, index, value): set a local variable (powerful, risky)
-- debug.setupvalue(fn, index, value): set an upvalue of a closure

-- debug.traceback(msg, level): return a string with the stack trace
print(debug.traceback("custom message", 2))  -- level 2: skip this line

-- debug.sethook(callback, events, count): set a hook for line/call/return events
-- Used for: debuggers, profilers, coverage tools
local function line_hook(event, line)
  print("line " .. line)  -- fires on every line (slow — debugging only)
end
debug.sethook(line_hook, "l")  -- "l" = line, "c" = call, "r" = return
-- ... code to trace ...
debug.sethook()  -- remove hook (pass nothing)
```

## Production: Retry with Exponential Backoff

::code-wrapper{language="lua"}
```lua
local function retry(fn, opts)
  opts = opts or {}
  local max_attempts = opts.max_attempts or 3
  local base_delay = opts.base_delay or 0.1  -- 100ms
  local max_delay = opts.max_delay or 10     -- 10s cap
  local should_retry = opts.should_retry or function(err) return true end

  local last_err
  for attempt = 1, max_attempts do
    local ok, result = pcall(fn, attempt)
    if ok then return result end
    last_err = result
    if not should_retry(result) then break end  -- non-retryable error
    if attempt < max_attempts then
      local delay = math.min(base_delay * (2 ^ (attempt - 1)), max_delay)  -- exponential
      if opts.on_retry then opts.on_retry(attempt, delay, result) end
      os.execute("sleep " .. tostring(delay))  -- or a proper sleep function
    end
  end
  return nil, last_err  -- all attempts failed
end

-- Usage: retry a flaky network call
local result, err = retry(function(attempt)
  return fetch_url("https://api.example.com/data")  -- may fail transiently
end, {
  max_attempts = 5,
  base_delay = 0.5,
  should_retry = function(err)
    -- Only retry on connection errors (not 4xx client errors)
    return tostring(err):match("timeout") or tostring(err):match("connection")
  end,
  on_retry = function(attempt, delay, err)
    print(string.format("attempt %d failed, retrying in %.1fs: %s", attempt, delay, err))
  end,
})
```

## Production: Circuit Breaker

::code-wrapper{language="lua"}
```lua
-- Circuit breaker: stop calling a failing service after N failures, try again after cooldown
local CircuitBreaker = {}
CircuitBreaker.__index = CircuitBreaker

function CircuitBreaker.new(opts)
  return setmetatable({
    failure_count = 0,
    failure_threshold = opts.failure_threshold or 5,
    cooldown = opts.cooldown or 30,  -- seconds
    last_failure_time = 0,
    state = "closed",  -- "closed", "open", "half_open"
  }, CircuitBreaker)
end

function CircuitBreaker:call(fn)
  if self.state == "open" then
    if os.time() - self.last_failure_time >= self.cooldown then
      self.state = "half_open"  -- try once
    else
      return nil, "circuit open"  -- fail fast
    end
  end

  local ok, result = pcall(fn)
  if ok then
    self.failure_count = 0
    self.state = "closed"
    return result
  else
    self.failure_count = self.failure_count + 1
    self.last_failure_time = os.time()
    if self.failure_count >= self.failure_threshold then
      self.state = "open"
    end
    return nil, result  -- the error
  end
end

-- Usage
local breaker = CircuitBreaker.new({failure_threshold = 3, cooldown = 60})
for i = 1, 10 do
  local result, err = breaker:call(function()
    return fetch_from_service()  -- may fail
  end)
  if not result then print("call " .. i .. " failed: " .. tostring(err)) end
end
```

## `<close>` for Deterministic Cleanup (Lua 5.4+)

::code-wrapper{language="lua"}
```lua
-- <close> ensures cleanup runs when the variable goes out of scope
-- Works with any object that has a __close metamethod (or a function value)
-- Runs even on error (like defer/finally, not like GC-based finalization)

local function with_file(path, fn)
  local f <close> = assert(io.open(path, "r"))  -- auto-close on scope exit
  return fn(f)
  -- f:close() called here automatically (even if fn errors)
end

local content = with_file("data.txt", function(f)
  return f:read("*a")
end)
-- File guaranteed closed, even if the function body threw an error

-- Custom closeable object:
local function acquire_lock(name)
  local lock = {name = name}
  local mt = {
    __close = function(self)
      print("releasing lock: " .. self.name)
      release_lock(self.name)  -- your cleanup logic
    end,
  }
  return setmetatable(lock, mt)
end

do
  local lock <close> = acquire_lock("resource1")
  use_locked_resource()
  -- lock released here automatically (deterministic, not GC-based)
end
```

## 💡 Tips & Tricks

**`assert` returns its arguments on success**: `local f = assert(io.open("file"))` — assert returns the file handle if truthy.

::code-wrapper{language="lua"}
```lua
local f = assert(io.open("data.txt", "r"))  -- returns f if truthy, errors if nil
-- Equivalent to:
local f = io.open("data.txt", "r")
if not f then error("cannot open data.txt") end
```
::

**Use `error(err, 0)` to suppress position prefix**: When the error message already contains location info, level 0 skips adding `file:line:`.

::code-wrapper{language="lua"}
```lua
error("custom error without file:line prefix", 0)  -- just "custom error..."
```
::

**`xpcall` handler can modify the error**: Transform errors before they reach the caller.

::code-wrapper{language="lua"}
```lua
local ok, err = xpcall(function() error("raw error") end, function(e)
  return "wrapped: " .. tostring(e)  -- transform the error
end)
print(err)  -- "wrapped: stdin:LINE: raw error"
```
::

## ⚠️ Edge Cases & Gotchas

**`pcall` errors with table objects don't get `file:line` prefix**: Only string errors get the prefix. Tables, numbers, and other values are passed as-is.

::code-wrapper{language="lua"}
```lua
error("string error")      -- pcall returns: false, "file:line: string error"
error({code = 1})          -- pcall returns: false, {code = 1} (NO prefix — table)
error(42)                  -- pcall returns: false, 42 (NO prefix — number)
```
::

**`xpcall` handler errors cause a second error**: If the handler itself errors, xpcall returns `false` with a message about the handler error, not the original.

**Stack traces are only available in the handler**: After pcall returns, the stack is unwound — `debug.traceback()` in the pcall result gives a useless trace.

**`assert` evaluates its message argument eagerly**: `assert(cond, expensive_fn())` calls `expensive_fn()` even when `cond` is true. Use a closure for lazy messages if expensive.

::code-wrapper{language="lua"}
```lua
-- BAD: expensive_fn() always runs
assert(x, expensive_format(x))
-- OK: lazy evaluation only on failure
assert(x) or error(expensive_format(x))
-- or:
if not x then error(expensive_format(x), 2) end
```
::

## 🧠 Spot the Bug

::code-wrapper{language="lua"}
```lua
local function risky()
  error("failed")
end

local function handler()
  local ok, err = pcall(risky)
  print(debug.traceback("trace", 2))  -- try to get caller's trace
  return ok, err
end

handler()
```

<details>
<summary>Answer</summary>

The `debug.traceback` call produces a **useless trace** — by the time `pcall` returns, the stack from `risky()` has already been unwound. The trace only shows `handler` → `pcall` → (nothing from `risky`).

To capture the **original** stack trace, you must use `xpcall` with a handler that calls `debug.traceback` **before** the stack unwinds:

```lua
local function risky() error("failed") end

local function handler()
  local ok, err = xpcall(risky, function(e)
    return debug.traceback(tostring(e), 2)  -- capture NOW, stack still alive
  end)
  print(err)  -- full trace including risky's frame
  return ok, err
end

handler()
```

The key insight: `pcall` unwinds the stack before returning control. Only `xpcall`'s handler runs while the stack is still intact.

</details>