---
title: Lua 12 — Standard Library Deep-Dive
description: Deep-dive into Lua's standard library: math (random/precision/integer ops), os (time/date/environment), table (sort/move/unpack internals), string (format/patterns), debug (introspection/hooks), and package (searchers/preload). Production patterns for random seeding, date math, and profiler construction.
---

# 12 — Standard Library Deep-Dive

Lua's standard library is deliberately small: `math`, `string`, `table`, `io`, `os`, `debug`, `coroutine`, `utf8`, `package`. Each is a single table of functions. No `array`, `json`, `re`, or `datetime` modules — those are external (luarocks). This chapter covers the non-obvious behaviors and production patterns for each library.

## `math` — Numbers & Randomness

::code-wrapper{language="lua"}
```lua
-- Integer/float inspection (5.3+)
math.type(42)        -- "integer"
math.type(42.0)      -- "float"
math.type("42")     -- nil (not a number)

-- Integer limits (5.3+)
math.maxinteger     -- 9223372036854775807 (2^63 - 1)
math.mininteger     -- -9223372036854775808 (-2^63)
math.maxinteger + 1 -- math.mininteger (WRAPS — no overflow error)
math.tointeger(3.0)  -- 3 (converts float to int if representable)
math.tointeger(3.5)  -- nil (not an integer value)
math.tointeger(1e30) -- nil (too large for int64)

-- Rounding
math.floor(3.7)      -- 3 (toward -inf)
math.ceil(3.2)       -- 4 (toward +inf)
math.floor(-3.7)     -- -4 (toward -inf, NOT -3 like C truncation)
math.ceil(-3.2)      -- -3 (toward +inf)

-- Precision: math.maxinteger is exact; floats lose precision beyond 2^53
math.maxinteger == math.maxinteger + 0.0  -- false (float can't represent maxint)

-- Constants
math.pi              -- 3.1415926535898
math.huge            -- inf (IEEE 754 positive infinity)
math.abs(-5)         -- 5
math.sqrt(16)        -- 4.0
math.exp(1)          -- 2.7182818284590 (e^1)
math.log(10)         -- 2.3025850929940 (natural log)
math.log(100, 10)    -- 2.0 (log base 10)
math.fmod(10, 3)     -- 1.0 (float modulo, truncates toward zero)
10 % 3              -- 1 (integer modulo, follows sign of dividend)
math.fmod(-10, 3)   -- -1.0 (truncation: -10/3 = -3.33, trunc = -3, rem = -1)
-10 % 3             -- 2 (Lua modulo: follows sign of divisor, -10 = -4*3 + 2)
```

### `math.random` & Seeding

::code-wrapper{language="lua"}
```lua
-- math.random(): float [0, 1)
-- math.random(n): integer [1, n]
-- math.random(m, n): integer [m, n]

math.random()       -- 0.5 (pseudo-random float)
math.random(10)     -- 7 (integer 1-10)
math.random(5, 15)  -- 11 (integer 5-15)

-- SEEDING: math.randomseed(seed)
-- CRITICAL: without a seed, every program run produces the SAME sequence
-- BAD: math.randomseed(1) — deterministic, same every run
-- BAD: math.randomseed(0) — math.random(1, 10) may return the same value repeatedly
-- GOOD: seed with high-resolution time + os.time for entropy
math.randomseed(os.time())
-- BETTER (5.4+): math.randomseed(x, y) — two seeds for better distribution
math.randomseed(os.time(), os.clock() * 1e6)
-- BEST: use a crypto library for security-sensitive randomness (luarocks install openssl)

-- Production: secure random without external deps (if /dev/urandom is available)
local function secure_random(bytes)
  local f = io.open("/dev/urandom", "rb")
  if not f then return nil end
  local data = f:read(bytes)
  f:close()
  return data
end
local seed_data = secure_random(8)  -- 8 bytes from /dev/urandom
if seed_data then
  local seed = 0
  for i = 1, #seed_data do
    seed = seed * 256 + seed_data:byte(i)
  end
  math.randomseed(seed)
end
```

### `math` utility functions

::code-wrapper{language="lua"}
```lua
math.max(3, 7, 1)   -- 7 (variadic)
math.min(3, 7, 1)   -- 1
math.huge           -- inf
-math.huge          -- -inf
math.abs(math.huge) -- inf

-- modf: separate integer and fractional parts
local int, frac = math.modf(3.14)  -- 3, 0.14
local int2, frac2 = math.modf(-3.14) -- -3, -0.14

-- IEEE 754 edge cases:
1 / 0     -- inf (NOT an error — IEEE 754)
-1 / 0    -- -inf
0 / 0     -- -nan (or nan)
math.huge - math.huge  -- -nan (indeterminate)
1e308 * 10  -- inf (overflow to infinity)
1e-308 * 0.001 -- 0 (underflow to zero)
-- NaN comparison: NaN ~= NaN is true (the only value where x ~= x)
local nan = 0/0
print(nan == nan)  -- false (NaN is never equal to anything, including itself)
print(nan ~= nan)  -- true (this is the NaN check pattern)
```

## `os` — Time, Date, Environment

::code-wrapper{language="lua"}
```lua
-- os.time(table?): epoch seconds (UTC). Table optional (defaults to now).
os.time()  -- 1710460800 (seconds since 1970-01-01 00:00:00 UTC)
os.time({year=2024, month=1, day=15, hour=0})  -- epoch for that date
os.time({year=2024, month=1, day=15})  -- epoch for midnight 2024-01-15

-- os.date(format, time?): formatted date string
os.date("%Y-%m-%d %H:%M:%S")  -- "2024-01-15 13:55:36" (local time)
os.date("!%Y-%m-%d")          -- "2024-01-15" (UTC — ! prefix)
os.date("%A", os.time())      -- "Monday" (full weekday name, localized)
os.date("*t", os.time())      -- table: {year=2024, month=1, day=15, hour=13, ...}
os.date("!*t")                -- UTC table

-- os.clock(): CPU time (seconds) used by the program — for benchmarking
local start = os.clock()
-- ... work ...
local elapsed = os.clock() - start  -- CPU time, NOT wall clock

-- os.difftime(t2, t1): difference in seconds (handles platform differences)
local diff = os.difftime(os.time(), start_time)

-- os.getenv(name): environment variable (or nil)
print(os.getenv("HOME"))  -- "/home/user" (or nil if not set)

-- os.execute(command): run shell command, return status
-- Lua 5.4+: returns true/nil, "exit"/"signal", exit_code
local ok, reason, code = os.execute("ls -la")
print(ok, reason, code)  -- true "exit" 0 (success)

-- os.exit(code, close): exit the program
os.exit(1)  -- exit with code 1
-- In 5.4: os.exit(1, true) — close all <close> variables before exiting
```

### Date math

::code-wrapper{language="lua"}
```lua
-- Add days to a date: os.time + seconds, then os.date
local function add_days(date_table, days)
  local epoch = os.time(date_table)
  local new_epoch = epoch + days * 24 * 60 * 60  -- seconds per day
  return os.date("*t", new_epoch)  -- back to table
end

local today = os.date("*t")
local next_week = add_days(today, 7)
print(next_week.year, next_week.month, next_week.day)

-- Days between two dates:
local function days_between(t1, t2)
  return math.floor(os.difftime(os.time(t2), os.time(t1)) / (24 * 60 * 60))
end
print(days_between({year=2024, month=1, day=1}, {year=2024, month=12, day=31}))  -- 365

-- Edge case: daylight saving time transitions
-- Adding 24*60*60 seconds doesn't always move forward 1 calendar day across DST
-- For date math, normalize to noon (avoids midnight DST issues):
local function safe_add_days(year, month, day, days)
  local t = {year=year, month=month, day=day, hour=12}  -- noon avoids DST edge
  local epoch = os.time(t)
  return os.date("*t", epoch + days * 24 * 60 * 60)
end
```

## `table` — Operations & Internals

::code-wrapper{language="lua"}
```lua
-- table.insert(t, [pos,] value): insert at pos (default: end), shifts elements right
local t = {1, 2, 4, 5}
table.insert(t, 3, 3)  -- insert 3 at index 3: {1, 2, 3, 4, 5}
-- O(n) — shifts all elements after pos

-- table.remove(t, [pos]): remove and return element at pos (default: end)
local v = table.remove(t, 3)  -- returns 3; t = {1, 2, 4, 5}
-- O(n) — shifts elements left

-- table.move(src, f, e, t, [dest]): move src[f..e] to dest starting at t
-- In-place if dest omitted (operates on src)
local a = {1, 2, 3, 4, 5}
table.move(a, 2, 4, 1)  -- a = {2, 3, 4, 4, 5} (moved src[2..4] to position 1)
-- For overlapping ranges, Lua handles the direction correctly

-- table.concat(t, sep, i, j): join array part with separator
table.concat({1, 2, 3}, ", ")      -- "1, 2, 3"
table.concat({1, 2, 3}, "-", 2, 3) -- "2-3" (from index 2 to 3)
-- Elements MUST be strings or numbers (errors on tables/functions/nils)
table.concat({1, nil, 3}, ",")    -- ERROR: invalid value (nil) at index 2

-- table.pack/unpack (5.2+)
local packed = table.pack(1, nil, 3)  -- {1, nil, 3, n = 3} (preserves nils via .n)
local a, b, c = table.unpack(packed, 1, packed.n)  -- 1, nil, 3 (use .n for range)

-- table.unpack: convert table to multiple values
local function sum(a, b, c) return a + b + c end
local args = {1, 2, 3}
print(sum(table.unpack(args)))  -- 6
```

### `table.sort` — Custom Comparators

::code-wrapper{language="lua"}
```lua
-- table.sort(t, comp?): in-place sort of array part (1..n)
-- comp(a, b): must return true if a should come BEFORE b (strict less-than)
-- CRITICAL: comp must be a STRICT weak ordering (not <=, which causes undefined behavior)
-- Sort is unstable (pre-5.4); 5.4+ is stable.

local data = {{name="C", age=30}, {name="A", age=25}, {name="B", age=25}}

-- Single key sort:
table.sort(data, function(a, b) return a.age < b.age end)
-- {A(25), B(25), C(30)} or {B(25), A(25), C(30)} (unstable if pre-5.4)

-- Multi-key: sort by age, then name (stable sort in reverse priority order)
table.sort(data, function(a, b) return a.name < b.name end)  -- secondary: name
table.sort(data, function(a, b) return a.age < b.age end)    -- primary: age (stable)
-- Result: A(25), B(25), C(30) (age primary, name secondary — preserved by stability)

-- ANTI-PATTERN: using <= in comparator (undefined behavior)
-- table.sort(t, function(a, b) return a <= b end)  -- WRONG: must be strict <
-- This can cause: infinite loop, wrong order, or crash in some implementations
```

## `string` — Format & Patterns

::code-wrapper{language="lua"}
```lua
-- string.format (C printf compatible):
-- %s string, %d integer, %f float, %e scientific, %g compact, %x/%X hex
-- %o octal, %c char, %q Lua-quoted string
-- %5d width 5 (right-pad), %-5d left-pad, %05d zero-pad
-- %.2f 2 decimals, %10.2f width 10, 2 decimals

string.format("%d", 42)          -- "42"
string.format("%05d", 42)        -- "00042"
string.format("%.2f", 3.14159)   -- "3.14"
string.format("%e", 123456)      -- "1.234560e+05"
string.format("%g", 0.0001)      -- "0.0001"
string.format("%g", 100000)      -- "100000"
string.format("%x", 255)         -- "ff"
string.format("%X", 255)         -- "FF"
string.format("%o", 8)           -- "10"
string.format("%c", 65)          -- "A" (char from code)
string.format("%q", 'he"llo')    -- '"he\\"llo"' (Lua-safe quoted)

-- %q: the only format that handles ALL Lua string edge cases
-- Escapes control chars, quotes, backslashes — output is valid Lua source
local s = "tab\there\nnewline"
local encoded = string.format("%q", s)  -- '"tab\\there\\nnewline"'
-- load("return " .. encoded)() == s  -- true (round-trips perfectly)

-- string.pack/unpack (5.3+): binary packing/unpacking (struct.pack equivalent)
local packed = string.pack(">I2", 300)  -- big-endian 2-byte int: "\x01\x2C"
local val = string.unpack(">I2", packed)  -- 300
-- Format: > big-endian, < little-endian, I2 2-byte int, s string, b byte, f float
```

## `debug` — Introspection & Profiling

::code-wrapper{language="lua"}
```lua
-- debug.getinfo(level, what): get info about a stack frame
local info = debug.getinfo(1, "Slnu")
-- info.source    — "@script.lua" (or "stdin", or "=[C]" for C functions)
-- info.short_src — "script.lua" (abbreviated)
-- info.currentline — current line in that frame
-- info.linedefined — first line of the function
-- info.lastlinedefined — last line
-- info.what      — "Lua", "C", "main"
-- info.name      — function name (may be nil for anonymous)
-- info.namewhat  — "global", "local", "method", "field", "upvalue", ""
-- info.nups      — number of upvalues
-- info.isvararg  — true if function is vararg (with "u" flag)

-- debug.getlocal(level, index): get local variable by index in a frame
local function dump_frame(level)
  level = level or 1
  local i = 1
  while true do
    local name, value = debug.getlocal(level, i)
    if not name then break end
    print(string.format("  [%d] %s = %s", i, name, tostring(value)))
    i = i + 1
  end
end

-- debug.setlocal(level, index, value): SET a local variable (powerful debugging)
-- debug.getupvalue(fn, index) / debug.setupvalue(fn, index, value): upvalue access

-- debug.traceback(msg, level): stack trace string
print(debug.traceback("here", 2))  -- skip this function and the caller

-- debug.sethook(callback, events, count?): execution hooks
-- Events: "c" call, "r" return, "l" line, "c" + count = every N instructions
local function profile(fn)
  local counts = {}
  debug.sethook(function(event, line)
    local info = debug.getinfo(2, "Sl")
    local key = info.source .. ":" .. line
    counts[key] = (counts[key] or 0) + 1
  end, "l")
  fn()
  debug.sethook()  -- remove hook
  return counts
end

-- Production: simple line profiler
local function simple_profiler(fn)
  local start = os.clock()
  local ok, result = pcall(fn)
  local elapsed = os.clock() - start
  if not ok then error(result, 2) end
  return result, elapsed  -- return result + CPU time
end
```

## `package` — Module System Internals

::code-wrapper{language="lua"}
```lua
-- package.loaded: cache of loaded modules (table name → module value)
print(package.loaded.string)  -- the string library table
package.loaded["my_module"] = nil  -- evict (force reload on next require)

-- package.preload: programmatic module registration (checked before filesystem)
package.preload["injected"] = function()
  return {hello = function() return "injected" end}
end
require("injected").hello()  -- "injected" (no file needed)

-- package.searchers (5.2+): ordered list of loader functions
-- Each: function(name) → loader_fn | error_string | nil
-- Default: [preload, path searcher, cpath searcher, all-in-one]

-- Add a custom searcher (insert at position 1 to check first):
table.insert(package.searchers, 1, function(name)
  local source = my_embedded_modules[name]  -- your custom source map
  if not source then return nil end  -- not found, try next searcher
  local fn, err = load(source, name, "t")
  if not fn then return err end
  return fn
end)

-- package.searchpath(name, path, sep, rep): find a file on a path
local found = package.searchpath("mymod.utils", package.path)
-- Returns "/path/to/mymod/utils.lua" or nil + "tried paths" error
```

## 💡 Tips & Tricks

**`os.clock()` for CPU benchmarking, `os.time()` for wall clock**: `os.clock()` measures process CPU time (more precise for benchmarks); `os.time()` measures wall clock (affected by other processes).

::code-wrapper{language="lua"}
```lua
local start = os.clock()
for i = 1, 1000000 do end  -- CPU-bound
print(string.format("%.4fs CPU", os.clock() - start))
```
::

**`math.randomseed(os.time())` once at startup**: Forgetting to seed gives the same sequence every run — a common bug.

**`string.format("%q", x)` for safe serialization**: The only format that handles all Lua string edge cases (embedded nulls, control chars, quotes).

**`debug.sethook` for coverage testing**: Hook on "l" (line) events to record which lines were executed.

## ⚠️ Edge Cases & Gotchas

**`math.floor`/`math.ceil` on very large floats lose precision**: `math.floor(1e20)` may not give the expected integer due to float representation.

**`os.time()` returns seconds, not milliseconds**: For sub-second timing, use `os.clock()` (CPU time) or a high-resolution timer from `luasocket` (`socket.gettime()`).

**`table.sort` comparator must be strict `<`**: Using `<=` causes undefined behavior (potential infinite loop or crash).

::code-wrapper{language="lua"}
```lua
-- BAD: <= in comparator
table.sort(t, function(a, b) return a <= b end)  -- UNDEFINED BEHAVIOR
-- If a == b, comp returns true for BOTH (a,b) and (b,a) — violates strict ordering

-- GOOD: strict <
table.sort(t, function(a, b) return a < b end)
```
::

**`string.format` `%s` with nil errors**: Unlike `print`, format doesn't auto-tostring nil.

## 🧠 Spot the Bug

::code-wrapper{language="lua"}
```lua
math.randomseed(42)
local a = math.random(1, 100)
math.randomseed(42)
local b = math.random(1, 100)
print(a, b)
print(a == b)
```

<details>
<summary>Answer</summary>

Prints the same number twice, and `true` for `a == b`.

`math.randomseed(42)` resets the PRNG to the same state. Two calls with the same seed produce the same sequence. This is why you seed ONCE at startup (with `os.time()` or entropy), not before every random call.

The bug in production: seeding before each call makes your "random" numbers fully predictable and repeating. Fix: seed once at program start, never again.

</details>