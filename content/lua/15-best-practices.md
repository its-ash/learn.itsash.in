---
title: Lua 15 — Best Practices, Patterns & Production Engineering
description: Production patterns for Lua: strict mode for global detection, module design with encapsulation and dependency injection, error architecture (structured errors, error boundaries), resource management with <close>, configuration management, logging, and the strict.lua pattern used by the Lua community.
---

# 15 — Best Practices, Patterns & Production Engineering

Production Lua demands discipline: `local` everywhere (no accidental globals), strict mode to catch typos at runtime, structured error objects, deterministic resource cleanup, and module architectures that support testing and hot-reload. This chapter covers the patterns that separate hobby Lua from production Lua.

## Strict Mode: Catching Global Variable Typos

::code-wrapper{language="lua" filename="strict.lua"}
```lua
-- strict.lua (adapted from the original by Roberto Ierusalimschy)
-- Makes accessing undeclared globals a runtime error.
-- Place at the top of your entry point: require("strict")

local declared = {}

local function what()
  local d = debug.getinfo(3, "S")
  return d and d.source or "?"
end

setmetatable(_G, {
  __index = function(t, k)
    if not declared[k] then
      error("attempt to read undeclared global: " .. tostring(k) ..
            " (at " .. what() .. ")", 2)
    end
    return rawget(t, k)
  end,
  __newindex = function(t, k, v)
    if not declared[k] then
      error("attempt to write undeclared global: " .. tostring(k) ..
            " (at " .. what() .. ")", 2)
    end
    rawset(t, k, v)
  end,
})

-- Public API: declare a global explicitly
local function strict_declare(name)
  declared[name] = true
end

-- Allow standard library globals
for _, name in ipairs({
  "_G", "_VERSION", "assert", "collectgarbage", "coroutine", "debug",
  "dofile", "error", "getmetatable", "io", "ipairs", "load", "loadfile",
  "math", "next", "os", "package", "pairs", "pcall", "print", "rawequal",
  "rawget", "rawlen", "rawset", "require", "select", "setmetatable",
  "string", "table", "tonumber", "tostring", "type", "utf8", "warn", "xpcall",
}) do
  declared[name] = true
end

-- To declare a global (rare): _G.MY_CONST = 1 won't work; use a declared function
-- In practice, you should NOT use globals at all — use modules and locals.

return { declare = strict_declare }
```

### Usage

::code-wrapper{language="lua"}
```lua
-- entry.lua
require("strict")  -- activate at the top, before any other code

local x = 10       -- OK: local
x = 20              -- OK: modifying local

typo_var = 5        -- ERROR: attempt to write undeclared global: typo_var
print(undeclared)   -- ERROR: attempt to read undeclared global: undeclared
```

## Module Design: Encapsulation & API

::code-wrapper{language="lua" filename="best_practices_module.lua"}
```lua
-- Production module template: private state, explicit public API, dependency injection

-- 1. Localize all standard library functions used in this module
local sformat = string.format
local tconcat = table.concat
local assert = assert
local error = error
local type = type
local pairs = pairs
local setmetatable = setmetatable

-- 2. Module table (the public API)
local M = {}

-- 3. Private state (module-level locals, NOT accessible from outside)
local _state = {
  initialized = false,
  config = {},
}

-- 4. Private helper functions (local, not in M)
local function validate_config(config)
  assert(type(config) == "table", "config must be a table")
  assert(type(config.host) == "string", "config.host must be a string")
  assert(type(config.port) == "number" and config.port > 0, "config.port must be positive")
end

local function default_config()
  return {
    host = "localhost",
    port = 8080,
    timeout = 5000,
  }
end

-- 5. Public API: init (with dependency injection)
function M.init(config, deps)
  validate_config(config)
  _state.config = setmetatable(config, {__index = default_config()})
  _state.deps = deps or {}
  _state.initialized = true
  return M  -- fluent: allow chaining
end

-- 6. Public API: methods
function M.get_config(key)
  if not _state.initialized then error("not initialized, call init() first", 2) end
  return _state.config[key]
end

function M.tostring()
  local c = _state.config
  return sformat("host=%s port=%d timeout=%d", c.host, c.port, c.timeout)
end

-- 7. Return the module table (single return at the end)
return M
```

## Error Architecture: Structured Errors & Boundaries

::code-wrapper{language="lua"}
```lua
-- Error hierarchy: typed errors with categories for different handling strategies
local Error = {}
Error.__index = Error
Error.__tostring = function(self)
  return string.format("[%s/%s] %s", self.category, self.code, self.message)
end

function Error.new(opts)
  return setmetatable({
    code = opts.code or "UNKNOWN",
    message = opts.message or "",
    category = opts.category or "GENERIC",
    retryable = opts.retryable or false,
    context = opts.context or {},
    cause = opts.cause,  -- for error chaining (wrap)
  }, Error)
end

-- Error categories
local function err_validation(msg, ctx)   return Error.new{code="VALIDATION", message=msg, category="CLIENT", context=ctx} end
local function err_not_found(res, id)      return Error.new{code="NOT_FOUND", message=res.." not found: "..tostring(id), category="CLIENT"} end
local function err_rate_limited()          return Error.new{code="RATE_LIMIT", message="too many requests", category="CLIENT", retryable=true} end
local function err_network(msg)            return Error.new{code="NETWORK", message=msg, category="TRANSIENT", retryable=true} end
local function err_internal(msg, ctx)     return Error.new{code="INTERNAL", message=msg, category="SERVER", context=ctx} end

-- Error boundary: catch and categorize errors from a function
local function error_boundary(fn, context)
  local ok, result = xpcall(fn, function(err)
    if getmetatable(err) == Error then return err end
    -- Wrap unknown errors (strings, runtime errors) in a structured Error
    return err_internal(tostring(err), context)
  end)
  if ok then return result end
  return nil, result  -- nil + Error (always structured on failure)
end

-- Usage: handler layer wraps business logic
local function handle_request(req)
  local result, err = error_boundary(function()
    if not req.user_id then error(err_validation("user_id required"), 0) end
    local user = get_user(req.user_id)  -- may throw
    return user
  end, {path = req.path, method = req.method})

  if err then
    if err.category == "CLIENT" then return 400, tostring(err)
    elseif err.category == "TRANSIENT" then return 503, tostring(err)
    else return 500, tostring(err) end
  end
  return 200, result
end
```

## Resource Management: `<close>` and RAII

::code-wrapper{language="lua"}
```lua
-- Resource acquisition is initialization (RAII) via <close> (Lua 5.4+)
-- Resources are released when the scope exits — even on error

local function acquire_resource(name)
  local resource = {name = name, handle = open_resource(name)}
  return setmetatable(resource, {
    __close = function(self)
      close_resource(self.handle)  -- deterministic cleanup
      self.handle = nil
    end,
  })
end

-- Usage: resource auto-released at end of block (even on error)
local function process_with_resource(name)
  local r <close> = acquire_resource(name)  -- acquired here
  local data = read_from(r.handle)  -- use resource
  if not data then error("read failed") end  -- error: r still cleaned up
  return transform(data)
  -- r released here (deterministic, not GC-based)
end

-- Pre-5.4: manual try/finally simulation
local function with_resource(acquire_fn, use_fn)
  local resource = acquire_fn()
  local ok, err = pcall(use_fn, resource)
  resource:close()  -- always cleanup
  if not ok then error(err, 2) end
  return resource.result
end
```

## Configuration Management

::code-wrapper{language="lua"}
```lua
-- Config: layered defaults + file + environment + CLI args (precedence: CLI > env > file > default)

local function load_config(cli_opts)
  -- Layer 1: defaults (lowest priority)
  local config = {
    host = "0.0.0.0",
    port = 8080,
    log_level = "info",
    max_connections = 1024,
  }

  -- Layer 2: config file (Lua table format — load with loadfile for safety)
  local f = io.open("config.lua", "r")
  if f then
    local content = f:read("*a")
    f:close()
    local fn = load(content, "config", "t", setmetatable({}, {__index = config}))
    if fn then
      local file_config = fn()
      if type(file_config) == "table" then
        for k, v in pairs(file_config) do config[k] = v end  -- file overrides defaults
      end
    end
  end

  -- Layer 3: environment variables (override file)
  local env_map = {
    APP_HOST = "host",
    APP_PORT = "port",
    APP_LOG_LEVEL = "log_level",
    APP_MAX_CONN = "max_connections",
  }
  for env_key, config_key in pairs(env_map) do
    local value = os.getenv(env_key)
    if value then
      -- type coercion: numbers stay numbers
      config[config_key] = tonumber(value) or value
    end
  end

  -- Layer 4: CLI args (highest priority)
  if cli_opts then
    for k, v in pairs(cli_opts) do
      config[k] = v
    end
  end

  -- Validation
  assert(type(config.port) == "number" and config.port > 0 and config.port < 65536,
    "invalid port: " .. tostring(config.port))
  assert(config.log_level == "debug" or config.log_level == "info" or config.log_level == "warn" or config.log_level == "error",
    "invalid log_level: " .. tostring(config.log_level))

  return config
end

local config = load_config({port = 9090})  -- CLI overrides everything else
```

## Logging Architecture

::code-wrapper{language="lua"}
```lua
-- Structured logger with levels, formatting, and output routing
local Logger = {}
Logger.__index = Logger

local LEVELS = {debug = 1, info = 2, warn = 3, error = 4, fatal = 5 }

function Logger.new(opts)
  opts = opts or {}
  return setmetatable({
    level = LEVELS[opts.level or "info"],
    output = opts.output or io.stderr,
    format = opts.format or "text",  -- "text" or "json"
  }, Logger)
end

function Logger:log(level, msg, context)
  local lvl = LEVELS[level]
  if lvl < self.level then return end  -- filter below threshold
  local entry = {
    timestamp = os.date("%Y-%m-%dT%H:%M:%S"),
    level = string.upper(level),
    msg = msg,
    context = context or {},
  }
  if self.format == "json" then
    -- simplified JSON encoding (use cjson in production)
    local parts = {}
    for k, v in pairs(entry) do
      parts[#parts + 1] = string.format('"%s":%q', k, tostring(v))
    end
    self.output:write("{" .. table.concat(parts, ",") .. "}\n")
  else
    self.output:write(string.format("[%s] %s %s\n",
      entry.timestamp, entry.level, entry.msg))
  end
  self.output:flush()  -- ensure logs are written (for crash debugging)
end

-- Convenience methods
for level in pairs(LEVELS) do
  Logger[level] = function(self, msg, ctx) self:log(level, msg, ctx) end
end

-- Usage
local log = Logger.new{level = "debug"}
log:info("server started", {port = 8080})
log:debug("config loaded", {path = "config.lua"})
log:error("connection failed", {host = "db.example.com", err = "timeout"})
```

## Immutable Data & Functional Updates

::code-wrapper{language="lua"}
```lua
-- Anti-pattern: mutable shared state (hard to reason about, hard to test)
-- Good: functional updates (return new data, don't mutate)

local function update_immutable(state, patch)
  local new_state = {}
  for k, v in pairs(state) do new_state[k] = v end  -- shallow copy
  for k, v in pairs(patch) do new_state[k] = v end   -- apply patch
  return new_state
end

local function deep_update_immutable(state, path, value)
  -- path: {"user", "address", "city"} → state.user.address.city = value (immutably)
  if #path == 0 then return value end
  local key = path[1]
  local new_state = {}
  for k, v in pairs(state) do new_state[k] = v end
  local remaining = {}
  for i = 2, #path do remaining[i - 1] = path[i] end
  new_state[key] = deep_update_immutable(state[key] or {}, remaining, value)
  return new_state
end

local state = {user = {name = "Alice", address = {city = "NYC"}}}
local state2 = deep_update_immutable(state, {"user", "address", "city"}, "LA")
print(state.user.address.city)      -- "NYC" (original unchanged)
print(state2.user.address.city)     -- "LA" (new copy)
print(state.user == state2.user)    -- false (different objects)
```

## Anti-Patterns Catalog

::code-wrapper{language="lua"}
```lua
-- 1. Globals instead of locals (performance + namespace pollution)
x = 10              -- BAD: global
local x = 10        -- GOOD: local

-- 2. Global function instead of local function
function foo() end       -- BAD: creates global foo
local function foo() end -- GOOD: local function

-- 3. String concatenation in loop (quadratic)
local s = ""; for i = 1, N do s = s .. items[i] end  -- BAD
local s = table.concat(items)                        -- GOOD

-- 4. Table.insert in hot loop (function call overhead)
for i = 1, N do table.insert(t, v) end  -- SLOWER
for i = 1, N do t[N + i] = v end          -- FASTER (but pre-size if possible)
for i = 1, N do t[#t + 1] = v end         -- MEDIUM (# evaluation each iteration)

-- 5. Not closing files
local f = io.open("x"); content = f:read("*a")  -- BAD: never closed
local f <close> = io.open("x"); content = f:read("*a")  -- GOOD: auto-close (5.4+)

-- 6. Relying on pairs order
for k, v in pairs(t) do if k == "first" then break end end  -- BAD: order undefined
-- Use a separate ordered keys array if order matters

-- 7. Using # on sparse arrays
local t = {1, 2, nil, 4}; print(#t)  -- BAD: undefined (2 or 4)
-- Maintain explicit length field for sparse arrays

-- 8. Modifying table during iteration
for k in pairs(t) do t[k] = nil end  -- BAD: undefined behavior
-- Collect keys first, then remove

-- 9. Default value trap with or
local x = opts.timeout or 5000  -- BAD: if timeout is 0, gets 5000
local x = (opts.timeout ~= nil) and opts.timeout or 5000  -- GOOD: preserves 0

-- 10. Non-tail recursion for deep data
local function count_nodes(node)  -- BAD: stack overflow on deep trees
  return 1 + (node.children and sum(count_nodes(c) for c in children) or 0)
end
-- Use iterative (explicit stack) or tail-recursive accumulator
```

## 💡 Tips & Tricks

**Use `luacheck` as a pre-commit hook**: Catches globals, unused vars, shadowing, unreachable code.

::code-wrapper{language="bash"}
```bash
luacheck --globals _G --std luajit src/  # strict mode, LuaJIT stdlib
luacheck --codes src/                     # show warning codes (for .luacheckrc ignores)
```
::

**`.luacheckrc` for project conventions**:

::code-wrapper{language="ini" filename=".luacheckrc"}
```ini
std = "luajit"           -- or "lua54"
max_line_length = 120
ignore = { "212" }       -- ignore "unused argument" (212)
globals = { "vim" }      -- Neovim: allow vim global
files["test/"] = {
  globals = { "describe", "it", "assert" },  -- busted globals
}
```
::

**Use `make` targets for common operations**:

::code-wrapper{language="makefile" filename="Makefile"}
```makefile
LUA ?= lua
TEST_DIR ?= test

test:
	$(LUA) $(TEST_DIR)/run_all.lua

lint:
	luacheck src/ --std lua54

coverage:
	$(LUA) -e "require('coverage').run('$(TEST_DIR)')"

bench:
	$(LUA) benchmarks/run.lua
```
::

## ⚠️ Edge Cases & Gotchas

**Strict mode can break existing code**: If you add strict mode to an existing codebase, you'll find many accidental globals. Add it incrementally or fix globals first.

**`error(msg, 0)` suppresses position info**: Useful for clean error messages, but you lose the stack location. Use sparingly.

## 🧠 Spot the Bug

::code-wrapper{language="lua"}
```lua
local function process_user(user_id)
  local user = db.find(user_id)
  if not user then return nil, "not found" end
  user.last_login = os.time()
  db.save(user)
  return user
end

local u, err = process_user(42)
print(u.name)
```

<details>
<summary>Answer</summary>

No bug in the shown code, but the error handling at the call site is incomplete:

```lua
local u, err = process_user(42)
print(u.name)  -- if u is nil (user not found), this errors: "attempt to index nil value"
```

The caller doesn't check `err` before accessing `u.name`. In production, every function that returns `(nil, error)` on failure must have its caller check for `nil`:

```lua
local u, err = process_user(42)
if not u then
  return nil, "process_user failed: " .. tostring(err)  -- propagate or handle
end
print(u.name)  -- safe: u is non-nil
```

This is the Lua equivalent of Go's `if err != nil` pattern. Forgetting the nil check is the #1 source of "attempt to index nil value" errors in production Lua.

</details>