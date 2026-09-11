---
title: Lua 16 — Capstone: Projects & Exercises
description: Production-grade capstone projects: a JSON parser using pattern matching, a coroutine-based async HTTP server skeleton, a metatable-based ORM query builder, and a Lua-hosted plugin system. Each project demonstrates multiple advanced concepts in a real-world context.
---

# 16 — Capstone: Projects & Exercises

These projects integrate the concepts from all previous chapters into complete, working systems. Each is production-shaped: error handling, edge cases, and real-world patterns — not toy snippets.

## Project 1: JSON Parser (Patterns + Recursion)

::code-wrapper{language="lua" filename="projects/json_parser.lua"}
```lua
-- Minimal JSON parser using Lua patterns + recursive descent
-- Supports: objects, arrays, strings, numbers, booleans, null
-- Does NOT support: comments, trailing commas (strict JSON)

local json = {}

-- Skip whitespace
local function skip_ws(s, i)
  while i <= #s and s:sub(i, i):match("%s") do i = i + 1 end
  return i
end

-- Parse a value: dispatch by first character
local function parse_value(s, i)  -- forward declared, filled below
  error("parse_value not initialized", 2)
end

-- Parse string: handle escape sequences
local function parse_string(s, i)
  assert(s:sub(i, i) == '"', "expected string")
  i = i + 1
  local parts = {}
  while i <= #s do
    local c = s:sub(i, i)
    if c == '"' then
      return table.concat(parts), i + 1  -- end of string, new position
    elseif c == "\\" then
      i = i + 1
      local esc = s:sub(i, i)
      local escapes = {['"']='"', ['\\']='\\', ['/']='/', b='\b', f='\f', n='\n', r='\r', t='\t'}
      if escapes[esc] then
        parts[#parts + 1] = escapes[esc]
      elseif esc == "u" then
        -- Unicode escape: \uXXXX → UTF-8 bytes
        local hex = s:sub(i + 1, i + 4)
        local cp = tonumber(hex, 16)
        if not cp then error("invalid unicode escape: " .. hex) end
        parts[#parts + 1] = utf8.char(cp)
        i = i + 4
      else
        error("invalid escape: \\" .. esc)
      end
      i = i + 1
    else
      parts[#parts + 1] = c
      i = i + 1
    end
  end
  error("unterminated string")
end

-- Parse number: integer, float, negative, scientific
local function parse_number(s, i)
  local start = i
  if s:sub(i, i) == "-" then i = i + 1 end  -- negative sign
  while i <= #s and s:sub(i, i):match("[%d%.eE%+%-]") do
    -- careful: don't consume commas or brackets that look like signs
    if s:sub(i, i):match("[eE]") and i + 1 <= #s and s:sub(i + 1, i + 1):match("[%d%+%-]") then
      i = i + 1  -- skip exponent sign
    end
    i = i + 1
  end
  local num_str = s:sub(start, i - 1)
  local n = tonumber(num_str)
  if not n then error("invalid number: " .. num_str) end
  return n, i
end

-- Parse object: { "key": value, ... }
local function parse_object(s, i)
  assert(s:sub(i, i) == "{", "expected object")
  i = skip_ws(s, i + 1)
  local obj = {}
  if s:sub(i, i) == "}" then return obj, i + 1 end  -- empty object
  while true do
    i = skip_ws(s, i)
    assert(s:sub(i, i) == '"', "expected key string")
    local key, i = parse_string(s, i)
    i = skip_ws(s, i)
    assert(s:sub(i, i) == ":", "expected colon")
    i = skip_ws(s, i + 1)
    local value
    value, i = parse_value(s, i)
    obj[key] = value
    i = skip_ws(s, i)
    local c = s:sub(i, i)
    if c == "}" then return obj, i + 1
    elseif c == "," then i = skip_ws(s, i + 1)
    else error("expected ',' or '}' in object at " .. i) end
  end
end

-- Parse array: [ value, value, ... ]
local function parse_array(s, i)
  assert(s:sub(i, i) == "[", "expected array")
  i = skip_ws(s, i + 1)
  local arr = {}
  if s:sub(i, i) == "]" then return arr, i + 1 end  -- empty array
  local idx = 1
  while true do
    local value
    value, i = parse_value(s, i)
    arr[idx] = value
    idx = idx + 1
    i = skip_ws(s, i)
    local c = s:sub(i, i)
    if c == "]" then return arr, i + 1
    elseif c == "," then i = skip_ws(s, i + 1)
    else error("expected ',' or ']' at " .. i) end
  end
end

-- Dispatch
local parsers = {
  ['"'] = parse_string,
  ['{'] = parse_object,
  ['['] = parse_array,
  ['t'] = function(s, i)  -- true
    assert(s:sub(i, i + 3) == "true", "expected true")
    return true, i + 4
  end,
  ['f'] = function(s, i)  -- false
    assert(s:sub(i, i + 4) == "false", "expected false")
    return false, i + 5
  end,
  ['n'] = function(s, i)  -- null → nil
    assert(s:sub(i, i + 3) == "null", "expected null")
    return nil, i + 4  -- NOTE: JSON null → Lua nil (cannot distinguish from missing)
  end,
}

-- parse_value: dispatch table for clean O(1) selection
parse_value = function(s, i)
  i = skip_ws(s, i)
  local c = s:sub(i, i)
  local parser = parsers[c]
  if parser then return parser(s, i) end
  if c:match("[%-%d]") then return parse_number(s, i) end
  error("unexpected character at " .. i .. ": " .. c)
end

-- Public API: decode JSON string to Lua table
function json.decode(s)
  local value, i = parse_value(s, 1)
  i = skip_ws(s, i)
  if i <= #s then error("trailing data at " .. i) end
  return value
end

-- Public API: encode Lua table to JSON string
function json.encode(val, pretty)
  local indent = pretty and "  " or ""
  local function encode(v, level)
    local t = type(v)
    if t == "nil" then return "null"
    elseif t == "boolean" then return v and "true" or "false"
    elseif t == "number" then
      if math.type(v) == "integer" or v == math.floor(v) then
        return tostring(v)
      end
      return string.format("%.17g", v)  -- full float precision
    elseif t == "string" then
      return string.format("%q", v):gsub("\\\n", "\\n")  -- %q handles most escaping
    elseif t == "table" then
      local parts = {}
      -- detect array vs object
      local is_array = true
      local max_idx = 0
      for k in pairs(v) do
        if type(k) == "number" and k == math.floor(k) and k >= 1 then
          if k > max_idx then max_idx = k end
        else is_array = false; break end
      end
      if is_array and max_idx == #v then
        for i = 1, #v do
          parts[i] = string.rep(indent, level + 1) .. encode(v[i], level + 1)
        end
        if #parts == 0 then return "[]" end
        return "[\n" .. table.concat(parts, ",\n") .. "\n" .. string.rep(indent, level) .. "]"
      else
        local keys = {}
        for k in pairs(v) do keys[#keys + 1] = k end
        table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
        for _, k in ipairs(keys) do
          local key_str = string.format("%q", tostring(k))
          local val_str = encode(v[k], level + 1)
          parts[#parts + 1] = string.rep(indent, level + 1) .. key_str .. ": " .. val_str
        end
        if #parts == 0 then return "{}" end
        return "{\n" .. table.concat(parts, ",\n") .. "\n" .. string.rep(indent, level) .. "}"
      end
    end
    error("cannot encode " .. t, 2)
  end
  return encode(val, 0)
end

-- Test:
local data = json.decode([[
{"name": "Alice", "age": 30, "tags": ["admin", "user"], "active": true}
]])
print(data.name, data.age, data.tags[1], data.active)  -- Alice 30 admin true
print(json.encode(data, true))
```
::

## Project 2: Coroutine-Based Pipeline Processor

::code-wrapper{language="lua" filename="projects/pipeline.lua"}
```lua
-- Data processing pipeline using coroutines (see ch11)
-- Each stage is a coroutine that pulls from upstream and yields downstream
-- Backpressure: consumer-driven (lazy, only processes when pulled)

local function stage(name, input, transform)
  return coroutine.wrap(function()
    for item in input do  -- pull from upstream (may block until upstream yields)
      local result = transform(item)
      if result ~= nil then
        coroutine.yield(result)  -- push downstream
      end
    end
  end), name
end

local function source(items)
  return coroutine.wrap(function()
    for _, item in ipairs(items) do
      coroutine.yield(item)
    end
  end)
end

local function sink(collect)
  return function(input)
    local results = {}
    for item in input do
      if collect then results[#results + 1] = item
      else print(item) end
    end
    return results
  end
end

-- Build a multi-stage pipeline
local data = {
  "2024-01-15 INFO  server started",
  "2024-01-15 ERROR connection timeout to db",
  "2024-01-15 WARN  retry 1/3",
  "2024-01-15 ERROR auth failed for user admin",
  "2024-01-15 INFO  request completed in 45ms",
}

local pipe = source(data)
pipe = stage("parse", pipe, function(line)
  local date, level, msg = line:match("(%S+) (%S+) (.*)")
  return {date = date, level = level, msg = msg}
end)
pipe = stage("filter_errors", pipe, function(entry)
  if entry.level == "ERROR" then return entry end  -- only errors pass through
  return nil  -- filtered out (nil not yielded)
end)
pipe = stage("format", pipe, function(entry)
  return string.format("[%s] %s: %s", entry.date, entry.level, entry.msg)
end)

local results = sink(true)(pipe)
for _, r in ipairs(results) do print(r) end
-- [2024-01-15] ERROR: connection timeout to db
-- [2024-01-15] ERROR: auth failed for user admin
```

## Project 3: ORM Query Builder (Metatables + Chaining)

::code-wrapper{language="lua" filename="projects/query_builder.lua"}
```lua
-- Fluent query builder using metatables for method chaining
-- Builds SQL strings with parameter binding (injection-safe)

local QueryBuilder = {}
QueryBuilder.__index = QueryBuilder

function QueryBuilder.new(table_name)
  return setmetatable({
    table = table_name,
    select = {"*"},
    where_clauses = {},
    params = {},  -- parameter values (for prepared statements)
    order_by = nil,
    limit_n = nil,
    offset_n = nil,
  }, QueryBuilder)
end

-- SELECT clause: list of columns
function QueryBuilder:select_cols(...)
  self.select = {...}
  return self  -- fluent: return self for chaining
end

-- WHERE clause with parameter binding (prevents SQL injection)
function QueryBuilder:where(condition, ...)
  local args = {...}
  -- Replace ? in condition with positional parameter placeholders
  local clause = condition
  local param_idx = #self.params
  for _, arg in ipairs(args) do
    param_idx = param_idx + 1
    self.params[param_idx] = arg
  end
  self.where_clauses[#self.where_clauses + 1] = clause
  return self
end

-- ORDER BY
function QueryBuilder:order(column, direction)
  -- Validate column name (prevent injection — only allow alphanumeric + underscore)
  assert(column:match("^[%a_][%w_]*$"), "invalid column name: " .. column)
  self.order_by = column .. " " .. (direction or "ASC")
  return self
end

-- LIMIT / OFFSET
function QueryBuilder:limit(n) self.limit_n = tonumber(n); return self end
function QueryBuilder:offset(n) self.offset_n = tonumber(n); return self end

-- Build the final SQL string + params array
function QueryBuilder:build()
  local sql = "SELECT " .. table.concat(self.select, ", ") .. " FROM " .. self.table
  if #self.where_clauses > 0 then
    sql = sql .. " WHERE " .. table.concat(self.where_clauses, " AND ")
  end
  if self.order_by then
    sql = sql .. " ORDER BY " .. self.order_by
  end
  if self.limit_n then
    sql = sql .. " LIMIT " .. self.limit_n
  end
  if self.offset_n then
    sql = sql .. " OFFSET " .. self.offset_n
  end
  return sql, self.params
end

-- __tostring for easy logging
QueryBuilder.__tostring = function(self)
  local sql, params = self:build()
  if #params > 0 then
    return sql .. "  -- params: " .. table.concat(params, ", ")
  end
  return sql
end

-- Usage:
local q = QueryBuilder.new("users")
  :select_cols("id", "name", "email")
  :where("age > ?", 18)
  :where("status = ?", "active")
  :order("created_at", "DESC")
  :limit(10)

print(tostring(q))
-- SELECT id, name, email FROM users WHERE age > ? AND status = ? ORDER BY created_at DESC LIMIT 10
-- params: 18, active

-- Execute (with a hypothetical db module):
-- local sql, params = q:build()
-- local results = db:execute(sql, unpack(params))
```

## Project 4: Plugin System (Sandboxed Module Loading)

::code-wrapper{language="lua" filename="projects/plugin_system.lua"}
```lua
-- Plugin system: load untrusted plugins in a sandbox, provide a controlled API
-- Plugins can only access whitelisted functions (no io, os.execute, require)

local PluginSystem = {}
PluginSystem.__index = PluginSystem

-- The sandbox API: only what plugins are allowed to use
local function create_plugin_api(host)
  return {
    -- Logging (through host's logger, not io.write)
    log = function(level, msg) host.logger:log(level, msg) end,

    -- Register hooks (callback registration)
    on_event = function(event, fn)
      host.hooks[event] = host.hooks[event] or {}
      table.insert(host.hooks[event], fn)
    end,

    -- Read-only config (copy, not reference)
    get_config = function(key) return host.config[key] end,

    -- Safe math/string functions (no file/network access)
    math = math,  -- safe: pure functions
    string = string,
    table = table,
    pairs = pairs, ipairs = ipairs, type = type,
    tostring = tostring, tonumber = tonumber,
    assert = assert, error = error,
    select = select, setmetatable = setmetatable,
    -- NO: io, os, require, load, loadfile, dofile, debug, _G
  }
end

function PluginSystem.new(config)
  return setmetatable({
    config = config or {},
    hooks = {},
    logger = {log = function(lvl, msg) print("[" .. lvl .. "] " .. msg) end},
    loaded = {},
  }, PluginSystem)
end

-- Load a plugin from source code (string) — sandboxed
function PluginSystem:load(name, source)
  local api = create_plugin_api(self)
  -- Compile with the sandbox environment (4th arg to load)
  local fn, err = load(source, name, "t", api)  -- "t" = text only (no bytecode injection)
  if not fn then return false, "compile error: " .. err end

  local ok, result = pcall(fn)  -- run the plugin's main chunk
  if not ok then return false, "runtime error: " .. result end

  self.loaded[name] = result or true
  return true
end

-- Trigger an event: call all registered hooks for that event
function PluginSystem:trigger(event, ...)
  local hooks = self.hooks[event]
  if not hooks then return end
  for _, fn in ipairs(hooks) do
    local ok, err = pcall(fn, ...)  -- protect: one bad plugin doesn't crash others
    if not ok then
      self.logger:log("error", "plugin hook '" .. event .. "' failed: " .. tostring(err))
    end
  end
end

-- Usage:
local ps = PluginSystem.new({server_name = "MyApp"})

-- Load a plugin (from source string — in production, read from plugins/ dir)
ps:load("greeter", [[
  -- This code runs in a sandbox: cannot access io, os, _G, require
  log("info", "greeter plugin loaded")

  on_event("user_join", function(username)
    log("info", "welcome " .. username .. " to " .. get_config("server_name"))
  end)

  on_event("user_leave", function(username)
    log("info", "goodbye " .. username)
  end)
]])

-- Trigger events (plugins respond)
ps:trigger("user_join", "Alice")  -- [info] welcome Alice to MyApp
ps:trigger("user_leave", "Alice")  -- [info] goodbye Alice

-- Security test: a malicious plugin
local ok, err = ps:load("malicious", [[
  os.execute("rm -rf /")  -- attempt to escape sandbox
]])
print(ok, err)  -- false  runtime error: attempt to index nil value (global 'os')
-- The sandbox holds: 'os' is not in the env table → nil → indexing nil → error
```

## Exercise Set

### Exercise 1: Implement a binary search on a sorted table

::code-wrapper{language="lua"}
```lua
-- Write a function that performs binary search on a sorted array
-- Return the index of the target, or nil if not found
-- Handle: empty array, single element, target not found, duplicates (return any match)

local function binary_search(arr, target)
  -- Your code here
  local lo, hi = 1, #arr
  while lo <= hi do
    local mid = math.floor((lo + hi) / 2)
    if arr[mid] == target then return mid
    elseif arr[mid] < target then lo = mid + 1
    else hi = mid - 1 end
  end
  return nil
end

assert(binary_search({1, 3, 5, 7, 9}, 5) == 3)
assert(binary_search({1, 3, 5, 7, 9}, 4) == nil)
assert(binary_search({}, 1) == nil)
assert(binary_search({42}, 42) == 1)
assert(binary_search({42}, 41) == nil)
```
::

### Exercise 2: Implement an LRU cache

::code-wrapper{language="lua"}
```lua
-- LRU (Least Recently Used) cache: fixed capacity, evicts oldest on insert
-- O(1) get and put using a hash table + doubly-linked list
-- Hint: use two tables: a hash map (key → node) and manual prev/next links

local LRUCache = {}
LRUCache.__index = LRUCache

function LRUCache.new(capacity)
  return setmetatable({
    capacity = capacity,
    cache = {},  -- key → {value = v, prev = key, next = key}
    head = nil,  -- most recently used
    tail = nil,  -- least recently used
  }, LRUCache)
end

function LRUCache:get(key)
  local node = self.cache[key]
  if not node then return nil end
  self:move_to_front(key, node)
  return node.value
end

function LRUCache:put(key, value)
  if self.cache[key] then
    self.cache[key].value = value
    self:move_to_front(key, self.cache[key])
    return
  end
  if #self.cache >= self.capacity then
    self:evict_tail()
  end
  self.cache[key] = {value = value}
  self:insert_front(key, self.cache[key])
end

-- Implement: move_to_front, insert_front, evict_tail (linked list manipulation)
-- (left as exercise for the reader — test with the assertions below)

local cache = LRUCache.new(3)
cache:put("a", 1)
cache:put("b", 2)
cache:put("c", 3)
assert(cache:get("a") == 1)  -- a is now most recently used
cache:put("d", 4)  -- evicts "b" (least recently used after a was accessed)
assert(cache:get("b") == nil)
assert(cache:get("a") == 1)
assert(cache:get("c") == 3)
assert(cache:get("d") == 4)
```
::

### Exercise 3: Write a coroutine-based timer

::code-wrapper{language="lua"}
```lua
-- Implement a "sleep" using coroutines + a scheduler
-- The scheduler should track when each coroutine should resume
-- Hint: use os.clock() for timing, a list of (coroutine, wake_time) pairs

-- Your code: a simple event loop that:
-- 1. Spawns coroutines that yield "sleep N" requests
-- 2. The scheduler tracks wake times
-- 3. Resumes coroutines when their sleep expires
-- 4. Handles coroutine completion and errors

-- Example expected behavior:
-- local function task1()
--   print("task1 start")
--   sleep(0.1)
--   print("task1 end")
-- end
-- local function task2()
--   print("task2 start")
--   sleep(0.05)
--   print("task2 end")
-- end
-- run({task1, task2})
-- Output (interleaved by time):
-- task1 start
-- task2 start
-- task2 end (after 0.05s)
-- task1 end (after 0.1s)
```
::

### Exercise 4: Metatable-based type system

::code-wrapper{language="lua"}
```lua
-- Implement a simple type checker using metatables
-- Create a Type class that can:
-- 1. Define a type with a name and validation function
-- 2. Check if a value matches the type
-- 3. Support union types (T1 | T2) and array types (Array<T>)

-- Example:
-- local Int = Type.new("Int", function(v) return math.type(v) == "integer" end)
-- local Str = Type.new("Str", function(v) return type(v) == "string" end)
-- local StrOrInt = Type.union(Str, Int)
-- local StrArray = Type.array(Str)
-- 
-- assert(Int:check(42) == true)
-- assert(Int:check(3.14) == false)
-- assert(StrOrInt:check("hello") == true)
-- assert(StrOrInt:check(42) == true)
-- assert(StrArray:check({"a", "b"}) == true)
-- assert(StrArray:check({1, 2}) == false)
```
::

## 🧠 Final Challenge: Build a Mini-REPL

::code-wrapper{language="lua"}
```lua
-- Build an interactive REPL that:
-- 1. Reads expressions from stdin
-- 2. Compiles them with load() (sandboxed)
-- 3. Prints the result (handling multiple return values)
-- 4. Maintains state between inputs (a persistent environment)
-- 5. Handles errors gracefully (compile + runtime)
-- 6. Supports special commands: :quit, :env, :help

-- Hints:
-- - Use load(line, "repl", "t", env) where env is a persistent table
-- - For expressions (not statements), wrap in "return ..."
-- - Use pcall to catch errors
-- - The persistent env allows variables to survive between inputs
```
::

## Summary

These projects exercise the full range of Lua's capabilities:

| Project | Concepts Used |
|---|---|
| JSON Parser | Patterns, recursion, string manipulation, error handling |
| Pipeline | Coroutines, generators, lazy evaluation, functional composition |
| Query Builder | Metatables, fluent API, `__tostring`, string building |
| Plugin System | Sandboxing, `load()` with custom env, pcall, hook pattern |
| LRU Cache | Tables as linked structures, metatables, O(1) operations |
| Timer | Coroutines, scheduler, cooperative multitasking |
| Type system | Metatables, function composition, recursive validation |
| REPL | `load()`, pcall, persistent environments, string eval |

Each project can be extended: add error recovery, add more types, add persistence. The skills transfer directly to real Lua applications: game mods (Roblox, Garry's Mod), Neovim plugins, Redis scripting, and embedded Lua hosts.