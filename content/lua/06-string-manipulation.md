---
title: Lua 06 — Strings, Patterns & Byte Processing
description: Deep-dive into Lua's immutable interned strings, the pattern matching engine (captures, anchors, character classes, frontier), gsub with replacement functions, UTF-8 handling, and production patterns for log parsing, CSV, config files, and binary protocols.
---

# 06 — Strings, Patterns & Byte Processing

Lua strings are **immutable, interned byte sequences**. There is no separate "character" type — a character is a 1-byte string. Pattern matching uses Lua's own **pattern engine** (not regex): simpler syntax, no alternation (`|`) or lookahead, but with captures, anchors, and a frontier pattern. The `string` library operates on bytes; `utf8` (5.3+) operates on code points. For complex parsing, use **LPeg** (Parsing Expression Grammars).

## String Representation & Interning

::code-wrapper{language="lua"}
```lua
-- Strings are immutable: any "modification" creates a new string
local s = "hello"
local t = s:upper()  -- t is a NEW string "HELLO"; s is unchanged
-- s and "hello" may share the same interned object
print(s == "hello")  -- true (pointer comparison after interning — no memcmp)

-- Long strings: [[ ]] preserves everything literally (no \n, \t escaping)
local template = [[
{
  "name": "Alice",
  "value": "no need to escape \n here — it's literal"
}
]]
-- Nestable: [==[ ]==] — = count must match, allows [[ ]] inside
local code = [==[
  local s = [[inner]]  -- this [[ ]] is inside [==[ ]==] — no conflict
]==]

-- Byte length: # (not character length for multi-byte UTF-8)
#"héllo"  -- 6 (é = 2 bytes: 0xC3 0xA9)
utf8.len("héllo")  -- 5 (character count)

-- Indexing: NO s[i] syntax. Use string.sub(s, i, j)
local s = "hello"
s:sub(1, 1)    -- "h" (byte 1 — 1-indexed)
s:sub(-1)      -- "o" (last byte — negative = from end)
s:sub(-2)      -- "lo" (last 2 bytes)
s:sub(2, -2)   -- "ell" (from byte 2 to byte -2)
```

## Pattern Engine — Not Regex

Lua patterns look like regex but are a different engine. No `|`, no `(?:)`, no lookahead. But has captures, `%` classes, `-` (lazy), and frontier `%f`.

::code-wrapper{language="lua"}
```lua
-- Character classes (use % prefix, not \):
-- %a  letter         %A  non-letter
-- %d  digit          %D  non-digit
-- %s  whitespace     %S  non-whitespace
-- %w  alphanumeric   %W  non-alphanumeric
-- %l  lowercase      %u  uppercase
-- %p  punctuation    %c  control char
-- %x  hex digit
-- .  any character
-- [abc]  char class     [^abc]  negation
-- [a-z]  range          [%w_]   combined

-- Quantifiers:
-- +   1 or more (greedy)
-- *   0 or more (greedy)
-- -   0 or more (lazy/non-greedy)  ← unique to Lua, not in regex
-- ?   0 or 1

-- Anchors:
-- ^   start of string (only at pattern start)
-- $   end of string (only at pattern end)

-- Captures: ( ) groups; %1, %2 backreferences in replacement
-- Frontier: %f[set] — boundary between non-set and set char (like lookahead for boundary)

-- Key differences from regex:
-- NO alternation: (cat|dog) doesn't work — use multiple matches or LPeg
-- NO lookahead/lookbehind
-- NO backreferences in the MATCH pattern (only in gsub replacement)
-- % is the escape, not \  (use %. for literal dot, %% for literal %)
```

## `string.match`, `string.gmatch`, `string.find`, `string.gsub`

::code-wrapper{language="lua"}
```lua
-- string.match(s, pattern, init?) → captures (or whole match if no captures), or nil
local s = "2024-01-15"
local y, m, d = s:match("(%d+)-(%d+)-(%d+)")  -- "2024", "01", "15"
local whole = s:match("%d+-")  -- "2024-" (no captures → returns whole match)

-- string.find(s, pattern, init?, plain?) → start, end, captures... (or nil)
local start, en = s:find("%d+")  -- 1, 4 (position of "2024")
local start2, en2, cap = s:find("(%d+)-(%d+)")  -- 1, 7, "2024", "01"
-- Use plain=true for literal search (no pattern interpretation):
local p = "a.b.c"
p:find(".", 1, true)  -- 2, 2 (literal dot at position 2; not "any char")

-- string.gmatch(s, pattern) → iterator over all matches
local csv = "a,b,c,d"
for col in csv:gmatch("([^,]+)") do  -- capture each non-comma sequence
  print(col)  -- a / b / c / d
end
-- With multiple captures, each iteration yields all captures:
for k, v in ("a=1, b=2"):gmatch("(%w+)=(%w+)") do
  print(k, v)  -- a 1 / b 2
end

-- string.gsub(s, pattern, replacement, n?) → new_string, count
-- replacement: string (with %1, %0 for captures), function, or table
local result, count = ("hello world"):gsub("o", "0")  -- "hell0 w0rld", 2
local result2 = ("a=1"):gsub("(%w)=(%w)", "%2=%1")  -- "1=a" (swap captures)
local result3 = ("hello"):gsub("%w", function(c) return c:upper() end)  -- "HELLO"
local result4 = ("hello"):gsub("l", function(c) return nil end)  -- "heo" (nil → delete)
local result5 = ("hello"):gsub("%w", {h = "H", e = "E", l = "L", o = "O"})  -- "HELL0"
-- table replacement: matched string → key → replacement value (nil = delete)
```

### Anti-pattern: gsub with magic characters in replacement

::code-wrapper{language="lua"}
```lua
-- BAD: % in replacement string is interpreted as capture backreference
local user_input = "50%"
local result = ("score"):gsub("score", user_input)  -- ERROR: invalid capture index %'
-- user_input "50%" → % is interpreted as capture reference → errors

-- FIX: escape % as %% in the replacement, OR use a function (no interpretation)
local safe = user_input:gsub("%%", "%%%%")  -- "50%%" — now gsub won't interpret
local result = ("score"):gsub("score", safe)  -- "50%" (correct)

-- SAFER: function replacement — return value is used literally, no % interpretation
local result2 = ("score"):gsub("score", function() return user_input end)  -- "50%"
```
::

## Production Pattern: Log Parser

::code-wrapper{language="lua"}
```lua
-- Parse Apache/nginx-style log line:
-- 192.168.1.1 - - [10/Jan/2024:13:55:36 +0000] "GET /path HTTP/1.1" 200 1234
local function parse_log(line)
  -- Pattern with captures: IP, date, method, path, status, size
  local pattern = '^(%S+) %S+ %S+ %[(.-)%] "(%S+) (%S+) %S+" (%d+) (%d+)'
  local ip, date, method, path, status, size = line:match(pattern)
  if not ip then return nil, "unparseable: " .. line end
  return {
    ip = ip, date = date, method = method, path = path,
    status = tonumber(status), size = tonumber(size),
  }
end

local entry = parse_log('192.168.1.1 - - [10/Jan/2024:13:55:36 +0000] "GET /api HTTP/1.1" 200 1234')
print(entry.ip, entry.method, entry.path, entry.status)  -- 192.168.1.1 GET /api 200
```

## Production Pattern: CSV Parser (handles quoted fields)

::code-wrapper{language="lua"}
```lua
-- CSV: commas separate fields, quoted fields can contain commas
local function parse_csv(line)
  local fields = {}
  local field = ""
  local in_quotes = false
  local i = 1
  while i <= #line do
    local c = line:sub(i, i)
    if c == '"' then
      if in_quotes and line:sub(i + 1, i + 1) == '"' then
        field = field .. '"'  -- escaped quote ""
        i = i + 1
      else
        in_quotes = not in_quotes
      end
    elseif c == "," and not in_quotes then
      fields[#fields + 1] = field
      field = ""
    else
      field = field .. c
    end
    i = i + 1
  end
  fields[#fields + 1] = field
  return fields
end

print(parse_csv('a,b,"c,d",e')[3])  -- "c,d" (quoted field with comma preserved)
```

## Production Pattern: INI Config Parser

::code-wrapper{language="lua"}
```lua
-- INI format: [section] / key = value / ; comment
local function parse_ini(text)
  local config, section = {}, nil
  for line in text:gmatch("[^\r\n]+") do
    line = line:gsub("^%s*(.-)%s*$", "%1")  -- trim
    if line:sub(1, 1) == ";" or line == "" then
      -- comment or empty, skip
    elseif line:match("^%[(.-)%]$") then
      section = line:match("^%[(.-)%]$")
      config[section] = {}
    elseif section then
      local key, val = line:match("^([^=]+)=(.*)$")
      if key and val then
        key = key:gsub("^%s*(.-)%s*$", "%1")  -- trim key
        -- type coercion: number, true, false, or string
        val = tonumber(val) or (val == "true" and true or (val == "false" and false or val))
        config[section][key] = val
      end
    end
  end
  return config
end

local ini = parse_ini([[
[server]
host = localhost
port = 8080
debug = true
]])
print(ini.server.host, ini.server.port, ini.server.debug)  -- localhost 8080 true
```

## Frontier Pattern `%f[set]` — Boundary Detection

::code-wrapper{language="lua"}
```lua
-- %f[set] matches the position where the previous char is NOT in set, and next IS
-- Like a zero-width boundary assertion (analogous to \b in regex)

-- Find word boundaries:
local s = "hello world"
for word in s:gmatch("%f[%a]%a+%f[%A]") do
  print(word)  -- "hello" / "world" (words bounded by non-letters)
end

-- %f[%a]: transition from non-alpha to alpha (start of word)
-- %f[%A]: transition from alpha to non-alpha (end of word)
-- Combined: %f[%a]%a+%f[%A] matches a complete word

-- Edge case: frontier at string start/end
-- %f[set] at position 1: "previous char" is treated as \0 (not in any set)
-- So %f[%a] at start of string matches (transition from \0 to alpha)
```

## UTF-8 Handling (Lua 5.3+)

::code-wrapper{language="lua"}
```lua
-- utf8.codes(s) → iterator over (position, codepoint) pairs
local s = "héllo"
for pos, cp in utf8.codes(s) do
  print(pos, cp, utf8.char(cp))  -- byte position, codepoint number, char
end
-- 1  104 h
-- 2  233 é
-- 4  108 l  (note: position jumped by 2 — é is 2 bytes)
-- ...

-- utf8.codepoint(s, i?) → codepoint at byte position
utf8.codepoint("é", 1)  -- 233

-- utf8.char(cp, ...) → string from codepoints
utf8.char(233)  -- "é"
utf8.char(104, 233, 108)  -- "hél"

-- utf8.len(s) → number of codepoints, or nil + position if invalid
utf8.len("héllo")  -- 5
utf8.len("\xFF")    -- nil, 1 (invalid byte at position 1)

-- utf8.offset(s, n, i?) → byte position of the n-th character
utf8.offset("héllo", 3)  -- 4 (3rd char "l" starts at byte 4 — é took 2 bytes)
```

### Production: UTF-8 safe string operations

::code-wrapper{language="lua"}
```lua
-- string.sub operates on BYTES, not characters. For UTF-8, use utf8.offset.
local function utf8_sub(s, start_char, end_char)
  local start_byte = utf8.offset(s, start_char)
  local end_byte = end_char and (utf8.offset(s, end_char + 1) - 1) or #s
  return s:sub(start_byte, end_byte)
end

local s = "héllo"
utf8_sub(s, 1, 3)  -- "hél" (first 3 characters, not first 3 bytes)

-- UTF-8 safe reverse
local function utf8_reverse(s)
  local chars = {}
  for _, cp in utf8.codes(s) do
    table.insert(chars, 1, utf8.char(cp))  -- prepend each codepoint
  end
  return table.concat(chars)
end

print(utf8_reverse("héllo"))  -- "olléh" (correct character reversal)
-- s:reverse() would give "olléh" too for this case, but breaks on multi-byte
-- sequences where byte order matters (e.g., combining marks)
```

## Binary Protocol Parsing with `string.byte`/`string.char`

::code-wrapper{language="lua"}
```lua
-- string.byte(s, i, j) → byte values at positions i..j
-- string.char(b1, b2, ...) → string from byte values

local function read_uint16_be(data, offset)  -- big-endian 16-bit
  local b1, b2 = data:byte(offset, offset + 1)
  return b1 * 256 + b2, offset + 2  -- value, new offset
end

local function read_uint32_le(data, offset)  -- little-endian 32-bit
  local b1, b2, b3, b4 = data:byte(offset, offset + 3)
  return b1 + b2 * 256 + b3 * 65536 + b4 * 16777216, offset + 4
end

local function write_uint16_be(value)
  return string.char(math.floor(value / 256), value % 256)
end

local function write_uint32_le(value)
  return string.char(
    value % 256,
    math.floor(value / 256) % 256,
    math.floor(value / 65536) % 256,
    math.floor(value / 16777216) % 256
  )
end

-- Production: binary protocol parser (e.g., DNS header)
local function parse_dns_header(data)
  local offset = 1
  local id, offset = read_uint16_be(data, offset)
  local flags, offset = read_uint16_be(data, offset)
  local qdcount, offset = read_uint16_be(data, offset)
  local ancount, offset = read_uint16_be(data, offset)
  local nscount, offset = read_uint16_be(data, offset)
  local arcount, offset = read_uint16_be(data, offset)
  return {
    id = id, flags = flags,
    qdcount = qdcount, ancount = ancount,
    nscount = nscount, arcount = arcount,
  }
end

-- Build a binary message:
local msg = write_uint16_be(0x1234) .. write_uint32_le(50000)
print(#msg)  -- 6 (2 + 4 bytes)
```

## `string.format` — C `printf` Compatible

::code-wrapper{language="lua"}
```lua
-- %s string, %d integer, %f float, %x hex, %o octal, %c char
-- %5d right-padded width 5, %-5d left-padded
-- %.2f 2 decimal places, %05d zero-padded width 5
-- %q: Lua-safe quoted string (escapes for embedding in Lua source)

string.format("%d", 42)        -- "42"
string.format("%5d", 42)       -- "   42" (right-aligned)
string.format("%-5d|", 42)     -- "42   |" (left-aligned)
string.format("%05d", 42)       -- "00042" (zero-padded)
string.format("%.2f", 3.14159) -- "3.14"
string.format("%x", 255)       -- "ff" (hex)
string.format("%X", 255)       -- "FF"
string.format("%q", "he\"llo") -- '"he\\"llo"' (escaped for Lua source)
string.format("%q", "tab\there") -- '"tab\\there"'

-- Edge case: %s coerces via tostring, but numbers get full precision
string.format("%s", 3.14)      -- "3.14"
string.format("%s", true)      -- "true"
tostring(3.14)                  -- "3.14" (same)

-- Integer formatting with thousands separator (manual — no built-in)
local function format_int(n)
  local s = tostring(math.abs(n))
  s = s:reverse():gsub("(%d%d%d)", "%1,"):reverse():gsub("^,", "")
  return (n < 0 and "-" or "") .. s
end
print(format_int(1234567))  -- "1,234,567"
```

## 💡 Tips & Tricks

**Use `string.format` for building structured strings, not `..` chains**: More readable, handles type coercion.

::code-wrapper{language="lua"}
```lua
-- Instead of: "x=" .. tostring(x) .. ", y=" .. tostring(y)
local s = string.format("x=%s, y=%s", x, y)
-- Faster for complex formatting; same performance for simple concat
```
::

**`string.rep(s, n, sep)` with separator (5.2+)**: Build repeated patterns with separators.

::code-wrapper{language="lua"}
```lua
string.rep("ab", 3, "-")  -- "ab-ab-ab" (sep between repetitions)
```
::

**Pattern optimization: anchor with `^` and `$` for early exit**: Unanchored patterns scan the whole string; anchored patterns can fail fast at the start.

::code-wrapper{language="lua"}
```lua
-- SLOWER on non-matching input (scans entire string before failing)
("hello"):match("world")

-- FASTER (fails immediately at position 1 — ^ forces start match)
("hello"):match("^world")
```
::

**`string.gsub` with function for transformations**: More flexible than string replacements.

::code-wrapper{language="lua"}
```lua
-- URL-encode: replace special chars with %XX
local function url_encode(s)
  s = s:gsub("([^%w])", function(c)
    return string.format("%%%02X", string.byte(c))
  end)
  return s
end
print(url_encode("hello world&foo"))  -- "hello%20world%26foo"

-- URL-decode:
local function url_decode(s)
  s = s:gsub("%%(%x%x)", function(hex)
    return string.char(tonumber(hex, 16))
  end)
  return s
end
print(url_decode("hello%20world%26foo"))  -- "hello world&foo"
```
::

## ⚠️ Edge Cases & Gotchas

**`%` is the escape character, not `\`**: `%.` matches literal dot, `%$` matches literal dollar.

::code-wrapper{language="lua"}
```lua
"price: $5".match("price: $5", "%$%d")  -- error: .match is not a method
("price: $5"):match("%$%d")  -- "$5" (escaped $ as literal)
("a.b.c"):match("%.")  -- "." (first literal dot, at position 2)
("a.b.c"):match(".", 1, true)  -- not valid; use plain find for literal
```
::

**`string.format` `%s` with `nil` errors**: Unlike `print()`, `format` doesn't auto-handle nil.

::code-wrapper{language="lua"}
```lua
string.format("value: %s", nil)  -- ERROR: bad argument #2 to 'format' (string expected, got nil)
-- Fix: tostring explicitly
string.format("value: %s", tostring(nil))  -- "value: nil"
```
::

**Patterns are case-sensitive**: `%a` is letters; `%A` is non-letters. `[a-z]` won't match `A`. Use character classes or `[a-zA-Z]`.

**No built-in `split` function**: Lua has no `string.split`. Build one with `gmatch`.

::code-wrapper{language="lua"}
```lua
local function split(s, sep)
  sep = sep or "%s"  -- default: whitespace
  local parts = {}
  for part in s:gmatch("([^" .. sep .. "]+)") do
    parts[#parts + 1] = part
  end
  return parts
end
-- WARNING: if sep contains pattern magic chars (., +, *, etc.), escape them!
local function split_literal(s, sep)
  sep = sep:gsub("([%%%.%+%-%*%?%[%]%(%)%$%^])", "%%%1")  -- escape magic chars
  local parts = {}
  for part in s:gmatch("([^" .. sep .. "]+)") do
    parts[#parts + 1] = part
  end
  return parts
end
print(split_literal("a.b.c.d", "."))  -- {"a", "b", "c", "d"} (literal dot split)
```
::

## 🧠 Spot the Bug

::code-wrapper{language="lua"}
```lua
local s = "a.b.c"
local result = s:gsub(".", "X")
print(result)
```

<details>
<summary>Answer</summary>

Prints `XXXXX` (5 X's), not `aXbXc`.

In Lua patterns, `.` means "any character", not a literal dot. So `gsub(".", "X")` replaces EVERY character with `X`. To match a literal dot, escape it: `%.`:

```lua
local result = s:gsub("%.", "X")  -- "aXbXc" (correct)
```

The trap: regex users expect `\.` but Lua uses `%.`. The escape character is `%`, not `\`.

</details>