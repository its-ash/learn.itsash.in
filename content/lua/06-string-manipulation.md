# 06 — String Manipulation

## String Basics

Strings are immutable sequences of bytes.

::code-wrapper{language="lua"}
```lua
local s = "hello"
local t = 'world'
local u = [[multi-line
string]]

-- Length
#"hello"            -- 5
#""                 -- 0

-- Indexing (1-based)
"hello"[1]          -- "h"
"hello"[0]          -- nil (not 0-indexed)
"hello"[-1]         -- nil (no negative indices in Lua)
```
::

## Concatenation

::code-wrapper{language="lua"}
```lua
-- Using .. operator
"hello" .. " " .. "world"         -- "hello world"

-- Concatenate with numbers (auto-coerce)
"value: " .. 42                   -- "value: 42"
"x" .. 10 .. "y"                  -- "x10y"

-- Concatenation in a loop
local parts = {"a", "b", "c"}
local result = ""
for i, v in ipairs(parts) do
  result = result .. v
end
print(result)                     -- "abc"

-- Better: use table.concat for performance
local result = table.concat(parts)  -- "abc"
local result = table.concat(parts, "-")  -- "a-b-c"
```
::

## String Methods

::code-wrapper{language="lua"}
```lua
local s = "hello world"

-- Length
s:len()             -- 11 (or #s)

-- Case conversion
s:upper()           -- "HELLO WORLD"
s:lower()           -- "hello world"

-- Substring
s:sub(1, 5)         -- "hello"
s:sub(7)            -- "world" (from position 7 to end)
s:sub(-5)           -- "world" (last 5 characters)
s:sub(1, -1)        -- "hello worl" (all but last char)

-- Search
s:find("world")     -- 7 (position of match)
s:find("xyz")       -- nil (not found)

-- Replace
s:gsub("world", "Lua")     -- "hello Lua" (and count: 1)
s:gsub("l", "L")           -- "heLLo worLd" (and count: 3)

-- Reverse
string.reverse(s)   -- "dlrow olleh"

-- Repeat
string.rep("ab", 3) -- "ababab"
```
::

## String Patterns (Regular Expressions)

Lua uses **pattern matching** (similar to regex, but simpler):

::code-wrapper{language="lua"}
```lua
-- Common patterns
. (dot)             -- any character
%a                  -- any letter [a-zA-Z]
%d                  -- any digit [0-9]
%s                  -- any whitespace
%w                  -- alphanumeric [a-zA-Z0-9_]
%l                  -- lowercase letter
%u                  -- uppercase letter
[abc]               -- character class: a, b, or c
[^abc]              -- negation: not a, b, or c
+                   -- one or more
*                   -- zero or more
-                   -- lazy (non-greedy)
?                   -- zero or one
^                   -- start of string
$                   -- end of string
(...)               -- capture group
```
::

### Pattern examples

::code-wrapper{language="lua"}
```lua
-- Extract numbers
local text = "Price: $123.45"
string.match(text, "%d+%.%d+")      -- "123.45"

-- Extract word
string.match("hello world", "%a+")  -- "hello"

-- Extract email (simplified)
local email = "alice@example.com"
string.match(email, "[%w%.]+@[%w%.]+")  -- "alice@example.com"

-- Split string (no built-in, use pattern + gsub)
local function split(s, sep)
  local parts = {}
  s:gsub("([^" .. sep .. "]+)", function(match)
    table.insert(parts, match)
  end)
  return parts
end
split("a,b,c", ",")     -- {"a", "b", "c"}
```
::

## Pattern Matching with Captures

::code-wrapper{language="lua"}
```lua
-- find with captures
local text = "Name: Alice, Age: 30"
local _, _, name, age = string.find(text, "Name: (%a+), Age: (%d+)")
print(name, age)        -- "Alice", "30"

-- match with captures (returns only captures, not position)
local name, age = string.match(text, "Name: (%a+), Age: (%d+)")
print(name, age)        -- "Alice", "30"

-- gmatch (iterate matches)
local text = "apple banana cherry"
for word in text:gmatch("%a+") do
  print(word)           -- prints each word
end

-- gsub with capture groups
local text = "hello world"
text:gsub("(%w+) (%w+)", function(a, b)
  return b .. " " .. a   -- swap order
end)                    -- "world hello"
```
::

## String Library Functions

::code-wrapper{language="lua"}
```lua
-- Format (like sprintf)
string.format("Hello %s, age %d", "Alice", 30)  -- "Hello Alice, age 30"
string.format("%5d", 42)      -- "   42" (right-padded)
string.format("%.2f", 3.14159)  -- "3.14" (2 decimal places)

-- Escape special characters
string.format("%q", "hello 'world'")  -- "hello 'world'" (escaped for Lua)

-- Byte operations
string.byte("A")        -- 65 (ASCII code)
string.byte("hello", 1, 3)  -- 104, 101, 108 (h, e, l)
string.char(65, 66, 67) -- "ABC"

-- Convert to number
tonumber("42")          -- 42
tonumber("3.14")        -- 3.14
tonumber("0xFF")        -- 255 (hex)
tonumber("not a number") -- nil

-- Convert from number
tostring(42)            -- "42"
tostring(3.14)          -- "3.14"
```
::

## Case Studies: Common Patterns

### Trim whitespace

::code-wrapper{language="lua"}
```lua
local function trim(s)
  return (s:gsub("^%s*(.-)%s*$", "%1"))
end

trim("  hello  ")       -- "hello"
```
::

### Split by separator

::code-wrapper{language="lua"}
```lua
local function split(s, sep)
  local parts = {}
  local pattern = "([^" .. sep .. "]*)" .. sep .. "?"
  for match in s:gmatch(pattern) do
    if match ~= "" then
      table.insert(parts, match)
    end
  end
  return parts
end

split("a,b,c", ",")     -- {"a", "b", "c"}
```
::

### Extract structured data

::code-wrapper{language="lua"}
```lua
-- Parse "key=value,key2=value2"
local function parseConfig(s)
  local config = {}
  for pair in s:gmatch("([^,]+)") do
    local key, value = pair:match("([^=]+)=(.+)")
    config[key] = value
  end
  return config
end

parseConfig("host=localhost,port=8080")  -- {host="localhost", port="8080"}
```
::

## Edge Cases & Gotchas

### `nil` vs empty string

::code-wrapper{language="lua"}
```lua
local x = ""
#x                  -- 0
x == nil            -- false
not x               -- false (empty string is truthy!)

local y = nil
#y                  -- error (attempt to get length of nil)
```
::

### Unicode handling

::code-wrapper{language="lua"}
```lua
local emoji = "😀"
#emoji              -- 4 (byte count, not character count)

-- Iterate UTF-8 characters (Lua 5.3+)
for i, c in utf8.codes("hello") do
  print(i, c)       -- prints character codes
end
```
::

### Pattern matching is not regex

::code-wrapper{language="lua"}
```lua
-- Alternation (a|b) not supported
"cat":match("(cat|dog)")  -- nil (doesn't work)

-- Use multiple patterns or if-else
if "cat":match("cat") or "cat":match("dog") then end

-- Lookahead/lookbehind not supported
-- Use capture groups to simulate
```
::

## 💡 Tips & Tricks

**Use `string.rep()` for padding**: Quick way to create repeating strings.

```lua
string.rep("*", 10)    -- "**********"
string.rep(" ", 20)    -- 20 spaces (padding)
```

**Concatenate in loops with table**: Appending to strings in loops is O(n²) because strings are immutable. Use a table and `table.concat()`.

```lua
-- Bad (O(n²))
local result = ""
for i = 1, 1000 do
  result = result .. i
end

-- Good (O(n))
local parts = {}
for i = 1, 1000 do
  parts[i] = tostring(i)
end
local result = table.concat(parts)
```

**Use `%q` in format for safe string embedding**:

```lua
local s = "hello 'world'"
print(string.format("msg = %q", s))  -- msg = "hello 'world'"
```

**Escape special characters in patterns**: Use `%` prefix for `.`, `*`, `+`, etc.

```lua
"hello.world":match("hello%.world")  -- matches literal dot
"price: $5.00":match("$%d%.%d%d")   -- matches literal $
```

## ⚠️ Edge Cases & Gotchas

**Empty string is truthy**: `if "" then print("yes") end` prints "yes". Use explicit checks: `if s ~= "" then`.

**`#string` counts bytes, not characters**: UTF-8 emoji takes multiple bytes. Use `utf8.len()` in Lua 5.3+ for proper character count.

**Patterns don't support many regex features**: No lookahead, no alternation, no backreferences. For complex matching, use external libraries or `lpeg` (LPeg).

**`string.match()` returns captures only**: If you have no captures, it returns the whole match. With no matches, returns `nil` (not empty string).

```lua
"hello":match("l+")     -- "ll" (not position)
"hello":match("xyz")    -- nil
```

**`gsub()` modifies via callback carefully**: If callback modifies the string, behavior may be unexpected. It processes sequentially.

**Pattern character classes are ASCII only**: `[a-z]` works, but `[á-z]` doesn't match accented characters correctly. Use `%a` for any letter.

## 🧠 Spot the Bug

What does this print?

```lua
local text = "abc123def"
local match = text:match("(%d+)")
local count = select("#", text:match("(%d)(%d)(%d)"))
print(match, count)
```

<details>
<summary>Answer</summary>

Prints `123	3`.

Here's why:
- `text:match("(%d+)")` finds one or more digits and returns captures. With one capture group and `+`, it matches "123" and returns it: `"123"`
- `text:match("(%d)(%d)(%d)")` has three capture groups, matching three individual digits. It returns: `"1", "2", "3"`
- `select("#", ...)` counts the number of return values. With 3 captures, it returns `3`

**The lesson**: `match()` returns captures, not the matched string. With multiple captures, each is a separate return value.

</details>

## Key Takeaways

- Strings are immutable; concatenation with `..` operator.
- Use `#string` for byte length (character count for ASCII only).
- String methods: `:upper()`, `:lower()`, `:sub()`, `:find()`, `:gsub()`.
- Lua patterns (not regex): use `%d`, `%a`, `%s`, `[...]`, `+`, `*`, `?`.
- `string.match()` returns captures; `string.gmatch()` iterates matches.
- `string.gsub()` for replace; callback can be a function.
- Use `table.concat()` for efficient concatenation in loops.
- UTF-8 support in Lua 5.3+ via `utf8` library.
