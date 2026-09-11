---
title: Lua 14 — Testing, Mocking & TDD
description: Deep-dive into testing Lua: assertion-based testing with luaunit/busted, test structure (setup/teardown/parametric), mocking via package.preload, dependency injection for testability, table-based tests, property-based testing patterns, and coverage measurement with debug hooks.
---

# 14 — Testing, Mocking & TDD

Lua has no built-in test framework, but the ecosystem provides `luaunit` (lightweight), `busted` (BDD-style), and `lustre` (minimal). The key to testable Lua: **dependency injection** over hard `require()`, **`package.preload`** for mocking modules, and **table-based tests** for parametric coverage. This chapter covers unit testing, mocking, integration testing, and coverage.

## Test Framework: Minimal Assertion Library

::code-wrapper{language="lua" filename="test/assert.lua"}
```lua
-- A minimal assertion library (no external deps) — 50 lines
local Assert = {}

function Assert.equals(expected, actual, msg)
  if expected ~= actual then
    error(string.format("%s: expected %s, got %s",
      msg or "assertion failed", tostring(expected), tostring(actual)), 2)
  end
end

function Assert.not_equals(unexpected, actual, msg)
  if unexpected == actual then
    error(string.format("%s: expected NOT %s, got %s",
      msg or "assertion failed", tostring(unexpected), tostring(actual)), 2)
  end
end

function Assert.is_nil(actual, msg)
  if actual ~= nil then
    error(string.format("%s: expected nil, got %s",
      msg or "assertion failed", tostring(actual)), 2)
  end
end

function Assert.is_not_nil(actual, msg)
  if actual == nil then
    error(msg or "expected non-nil, got nil", 2)
  end
end

function Assert.is_true(actual, msg)
  if actual ~= true then  -- STRICT: only `true`, not truthy
    error(string.format("%s: expected true, got %s (%s)",
      msg or "assertion failed", tostring(actual), type(actual)), 2)
  end
end

function Assert.is_truthy(actual, msg)
  if not actual then  -- truthy: anything not false/nil
    error(string.format("%s: expected truthy, got %s",
      msg or "assertion failed", tostring(actual)), 2)
  end
end

function Assert.raises(fn, expected_err_pattern, msg)
  local ok, err = pcall(fn)
  if ok then
    error(msg or "expected an error, but none was raised", 2)
  end
  if expected_err_pattern and not tostring(err):match(expected_err_pattern) then
    error(string.format("%s: error %q does not match %q",
      msg or "assertion failed", tostring(err), expected_err_pattern), 2)
  end
end

-- Deep equality (for tables)
function Assert.deep_equals(expected, actual, msg, seen)
  seen = seen or {}
  if type(expected) ~= type(actual) then
    error(string.format("%s: type mismatch %s vs %s",
      msg or "", type(expected), type(actual)), 2)
  end
  if type(expected) ~= "table" then
    if expected ~= actual then
      error(string.format("%s: %s vs %s",
        msg or "", tostring(expected), tostring(actual)), 2)
    end
    return
  end
  if seen[expected] then return end  -- cycle
  seen[expected] = true
  for k, v in pairs(expected) do
    Assert.deep_equals(v, actual[k], msg .. "." .. tostring(k), seen)
  end
  for k in pairs(actual) do
    if expected[k] == nil then
      error(string.format("%s: unexpected key %s", msg or "", tostring(k)), 2)
    end
  end
end

return Assert
```
::

## Test Runner with Setup/Teardown

::code-wrapper{language="lua" filename="test/runner.lua"}
```lua
-- Minimal test runner: discovers test functions, runs with setup/teardown
local Assert = require("assert")

local TestRunner = {}
TestRunner.__index = TestRunner

function TestRunner.new(name)
  return setmetatable({
    name = name,
    passed = 0, failed = 0, errors = {},
    setup_fn = nil, teardown_fn = nil,
  }, TestRunner)
end

function TestRunner:setup(fn) self.setup_fn = fn; return self end
function TestRunner:teardown(fn) self.teardown_fn = fn; return self end

function TestRunner:test(name, fn)
  local ctx = self.setup_fn and self.setup_fn() or {}
  local ok, err = pcall(fn, ctx, Assert)
  if self.teardown_fn then self.teardown_fn(ctx) end
  if ok then
    self.passed = self.passed + 1
    io.write(".")
  else
    self.failed = self.failed + 1
    self.errors[#self.errors + 1] = {name = name, err = err}
    io.write("F")
  end
  return self
end

-- Parametric tests: run the same test with multiple inputs
function TestRunner:parametric(name, cases, fn)
  for _, case in ipairs(cases) do
    local case_name = string.format("%s [%s]", name, case.desc or tostring(case.input))
    self:test(case_name, function(ctx, A) fn(ctx, A, case.input, case.expected) end)
  end
  return self
end

function TestRunner:summary()
  io.write("\n")
  print(string.format("\n%d passed, %d failed", self.passed, self.failed))
  for _, e in ipairs(self.errors) do
    print(string.format("  FAIL: %s\n    %s", e.name, e.err))
  end
  return self.failed == 0
end

return TestRunner
```

## Table-Based Tests (Parametric)

::code-wrapper{language="lua" filename="test/test_string_utils.lua"}
```lua
local Runner = require("runner")
local A = require("assert")
local su = require("string_utils")  -- module under test

local T = Runner.new("string_utils")

-- Parametric: run many inputs through the same test logic
T:parametric("trim", {
  {desc = "both sides",   input = "  hello  ",  expected = "hello"},
  {desc = "leading only", input = "hello  ",    expected = "hello"},
  {desc = "trailing only",input = "  hello",    expected = "hello"},
  {desc = "no trim",      input = "hello",     expected = "hello"},
  {desc = "empty",        input = "",           expected = ""},
  {desc = "all spaces",   input = "   ",        expected = ""},
  {desc = "tabs",         input = "\thello\t", expected = "hello"},
}, function(ctx, A, input, expected)
  A.equals(expected, su.trim(input))
end)

-- Edge cases as explicit tests
T:test("split: empty string", function(ctx, A)
  A.deep_equals({""}, su.split("", ","))
end)

T:test("split: single delimiter", function(ctx, A)
  A.deep_equals({"a", "b", "c"}, su.split("a,b,c", ","))
end)

T:test("split: trailing delimiter", function(ctx, A)
  A.deep_equals({"a", "b", "c", ""}, su.split("a,b,c,", ","))
end)

T:test("split: no delimiter in string", function(ctx, A)
  A.deep_equals({"hello"}, su.split("hello", ","))
end)

T:test("capitalize: handles nil", function(ctx, A)
  A.raises(function() su.capitalize(nil) end, "expected string")
end)

os.exit(T:summary() and 0 or 1)  -- exit code for CI
```
::

## Mocking with `package.preload`

::code-wrapper{language="lua"}
```lua
-- Mock a module BEFORE it's required by the code under test
-- package.preload[name] = function() return mock_module end

-- test/test_user_service.lua
local A = require("assert")

-- Inject a mock database before the service requires it
package.preload["db"] = function()
  local users = {
    [1] = {id = 1, name = "Alice"},
    [2] = {id = 2, name = "Bob"},
  }
  return {
    find = function(id) return users[id] end,
    save = function(user) users[user.id] = user; return true end,
    delete = function(id) users[id] = nil; return true end,
    -- Track calls for verification
    calls = {find = 0, save = 0, delete = 0},
  }
end

-- Set _ENV or modify the mock to track calls:
local mock_db
package.preload["db"] = function()
  mock_db = {
    _users = {[1] = {id = 1, name = "Alice"}},
    _calls = {},
    find = function(self, id)
      self._calls.find = (self._calls.find or 0) + 1
      return self._users[id]
    end,
    save = function(self, user)
      self._calls.save = (self._calls.save or 0) + 1
      self._users[user.id] = user
      return true
    end,
  }
  -- Return a table that auto-passes self (method syntax)
  return setmetatable({}, {
    __index = function(_, k)
      if k == "calls" then return mock_db._calls end
      return function(...) return mock_db[k](mock_db, ...) end
    end
  })
end

-- NOW require the service — it gets the mock db
local UserService = require("user_service")

local T = require("runner").new("UserService")

T:test("get_user returns user from db", function(ctx, A)
  local user = UserService.get_user(1)
  A.deep_equals({id = 1, name = "Alice"}, user)
end)

T:test("save_user calls db.save", function(ctx, A)
  UserService.save_user({id = 3, name = "Charlie"})
  A.is_not_nil(mock_db._calls.save)
  A.equals(1, mock_db._calls.save)
end)

T:summary()
```
::

## Dependency Injection for Testability

::code-wrapper{language="lua"}
```lua
-- Instead of hard require(), accept dependencies as parameters
-- This makes modules testable without package.preload tricks

-- BAD: hard dependency, untestable
local http = require("luasocket.http")
local M = {}
function M.fetch(url) return http.request(url) end
return M

-- GOOD: inject the http client
local M = {}
function M.new(deps)
  local http = deps and deps.http or require("luasocket.http")
  return {
    fetch = function(url) return http.request(url) end,
  }
end
return M

-- Test: pass a mock http
local mock_http = {
  request = function(url)
    assert(url == "https://api.example.com/data")
    return "mocked response", 200, {}
  end,
}
local client = require("myclient").new({ http = mock_http })
local body = client.fetch("https://api.example.com/data")
assert(body == "mocked response")

-- Production: use the real dependency
local real_client = require("myclient").new()  -- defaults to luasocket.http
```

## Testing Coroutines & Async

::code-wrapper{language="lua"}
```lua
-- Test a coroutine-based generator by collecting its output
local A = require("assert")

local function collect_generator(gen)
  local results = {}
  for v in gen do
    results[#results + 1] = v
  end
  return results
end

-- Test: fibonacci generator
local function fib_gen(n)
  return coroutine.wrap(function()
    local a, b = 0, 1
    for _ = 1, n do
      coroutine.yield(b)
      a, b = b, a + b
    end
  end)
end

A.deep_equals({1, 1, 2, 3, 5, 8}, collect_generator(fib_gen(6)))
A.deep_equals({1}, collect_generator(fib_gen(1)))
A.deep_equals({}, collect_generator(fib_gen(0)))

-- Test: coroutine error handling
A.raises(function()
  coroutine.wrap(function()
    error("boom")
  end)()
end, "boom")
```

## Coverage Measurement with `debug.sethook`

::code-wrapper{language="lua" filename="coverage.lua"}
```lua
-- Simple line coverage: which lines of a module were executed
local Coverage = {}
Coverage.__index = Coverage

function Coverage.new(source_file)
  return setmetatable({
    file = source_file,
    hit = {},
    total_lines = 0,
  }, Coverage)
end

function Coverage:start()
  self.hit = {}
  local file = self.file
  debug.sethook(function(event, line)
    local info = debug.getinfo(2, "S")
    if info.source:match(file) then
      self.hit[line] = (self.hit[line] or 0) + 1
    end
  end, "l")
end

function Coverage:stop()
  debug.sethook()
end

function Coverage:report()
  -- Count total executable lines (simple heuristic: non-blank, non-comment)
  local f = io.open(self.file, "r")
  if not f then return nil, "cannot open" end
  local total = 0
  local covered = 0
  local line_num = 0
  for line in f:lines() do
    line_num = line_num + 1
    local stripped = line:gsub("^%s+", "")
    if stripped ~= "" and not stripped:match("^%-%-") then
      total = total + 1
      if self.hit[line_num] then
        covered = covered + 1
      end
    end
  end
  f:close()
  local pct = total > 0 and (covered / total * 100) or 0
  return {
    file = self.file,
    total = total,
    covered = covered,
    missed = total - covered,
    percent = pct,
  }
end

-- Usage:
-- local cov = Coverage.new("src/my_module.lua")
-- cov:start()
-- run_tests()
-- cov:stop()
-- local report = cov:report()
-- print(string.format("%s: %d/%d lines (%.1f%%)",
--   report.file, report.covered, report.total, report.percent))
```

## Integration Testing with `io.popen`

::code-wrapper{language="lua"}
```lua
-- Integration test: run a script as a subprocess and check output
local function run_script(script_path, args)
  local cmd = string.format("lua %s %s", script_path, args or "")
  local pipe = assert(io.popen(cmd, "r"))
  local output = pipe:read("*a")
  local ok, reason, code = pipe:close()
  return output, code or 0
end

local A = require("assert")

-- Test: CLI tool outputs correct format
local output, code = run_script("cli.lua", "--format=json input.txt")
A.equals(0, code, "should exit 0")
A.is_truthy(output:match('"name":'), "should output JSON")

-- Test: error handling for missing args
local output2, code2 = run_script("cli.lua", "")
A.is_not_nil(code2 ~= 0, "should exit non-zero on missing args")
```

## Using `busted` (BDD-style framework)

::code-wrapper{language="bash"}
```bash
luarocks install busted
busted spec/            # run all tests in spec/ directory
busted --coverage       # with coverage
```

::code-wrapper{language="lua" filename="spec/string_utils_spec.lua"}
```lua
-- busted: describe/it blocks with before_each/after_each
local su = require("string_utils")

describe("string_utils.trim", function()
  it("removes leading whitespace", function()
    assert.are.equal("hello", su.trim("  hello"))
  end)

  it("removes trailing whitespace", function()
    assert.are.equal("hello", su.trim("hello  "))
  end)

  it("handles empty string", function()
    assert.are.equal("", su.trim(""))
  end)

  it("handles all-whitespace string", function()
    assert.are.equal("", su.trim("   "))
  end)
end)

describe("string_utils.split", function()
  it("splits on delimiter", function()
    assert.are.same({"a", "b", "c"}, su.split("a,b,c", ","))
  end)

  it("returns single element for no delimiter", function()
    assert.are.same({"hello"}, su.split("hello", ","))
  end)

  it("handles trailing delimiter", function()
    assert.are.same({"a", "b", "c", ""}, su.split("a,b,c,", ","))
  end)
end)
```
::

## 💡 Tips & Tricks

**Test the contract, not the implementation**: Assert outputs and side effects, not internal state. This makes tests resilient to refactoring.

**Use `assert.raises` to test error paths**: Don't just test the happy path — test that invalid inputs raise the expected errors.

**Mock at the boundaries (I/O, network, db)**: Don't mock pure functions. Mock things with external side effects.

**One assertion per test (mostly)**: If a test fails, you know exactly which condition. Multiple assertions make failure messages ambiguous.

## ⚠️ Edge Cases & Gotchas

**`assert.are.same` (busted) does deep comparison; `assert.are.equal` does shallow**: Don't mix them up — `equal` on tables checks identity.

**Mocking `io.open` affects ALL code, not just the module under test**: Be careful — your test framework may break if it can't read files. Scope mocks to the test with setup/teardown.

::code-wrapper{language="lua"}
```lua
-- BAD: global mock breaks everything
local real_open = io.open
io.open = mock_open  -- affects the test runner too!
-- ... run tests ...
io.open = real_open  -- restore (but if tests error before here, it stays mocked)

-- GOOD: mock via package.preload or dependency injection
-- (the module under test gets the mock; the test framework uses the real io.open)
```
::

**`pcall` catches errors, but the stack is lost**: For testing error messages, use the error value (second return from pcall). For testing stack traces, use `xpcall` with a handler.

## 🧠 Spot the Bug

::code-wrapper{language="lua"}
```lua
-- test_split.lua
local su = require("string_utils")

local function test_split()
  local result = su.split("a,b,c", ",")
  assert(result == {"a", "b", "c"}, "split should return array")
end

test_split()
print("passed")
```

<details>
<summary>Answer</summary>

The assertion `result == {"a", "b", "c"}` compares a table to a **newly constructed table**. In Lua, table comparison is by **identity** (reference), not content. Two different table objects are never `==`, even if they contain the same elements. So `result == {"a", "b", "c"}` is always `false`, and the assertion always fails.

Fix: use a deep equality check (like `Assert.deep_equals`):

```lua
Assert.deep_equals({"a", "b", "c"}, result, "split should return array")
```

Or compare element by element:

```lua
assert(result[1] == "a" and result[2] == "b" and result[3] == "c", "split failed")
```

</details>