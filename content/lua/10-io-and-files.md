---
title: Lua 10 — I/O, Files, Streams & Binary Protocols
description: Deep-dive into Lua's I/O model: io.open with all modes, file handles as objects, streaming with :lines() for memory-efficient processing, binary I/O with string.byte/char, io.popen for subprocesses, seek/tell for random access, and production patterns for atomic writes, CSV streaming, and config persistence.
---

# 10 — I/O, Files, Streams & Binary Protocols

Lua's I/O is minimal: `io.open` returns a file handle (userdata with methods), `io.read`/`io.write` for stdin/stdout, `io.popen` for subprocesses. File handles are **not** garbage-collected promptly — you must close them explicitly or use `<close>` (5.4+). Binary I/O uses strings as byte buffers with `string.byte`/`string.char`. There is no directory listing in the standard library — use `lfs` (LuaFileSystem) or `io.popen("ls")`.

## File Handles & `io.open`

::code-wrapper{language="lua"}
```lua
-- io.open(path, mode): returns file handle (userdata) or nil + error message
local f, err = io.open("data.txt", "r")
if not f then
  error("cannot open: " .. (err or "unknown"))  -- err: "data.txt: No such file or directory"
end

-- Modes:
-- "r"  read (file must exist)
-- "w"  write (truncate/create)
-- "a"  append (create if not exists, write at end)
-- "r+" read/write (file must exist, no truncate)
-- "w+" read/write (truncate/create)
-- "a+" read/append (create, write at end, read from anywhere)
-- "b"  binary mode (append to any mode: "rb", "wb", "r+b") — no line-ending translation
-- "r"  text mode: on Windows, \r\n → \n on read, \n → \r\n on write
-- "rb" binary mode: exact bytes, no translation (use for binary formats)

-- File handle methods (called with : syntax):
-- f:read(format)     → read (see below)
-- f:write(...)       → write strings (variadic)
-- f:lines()          → iterator over lines
-- f:seek(whence, offset) → set/get position
-- f:flush()          → flush buffer to OS
-- f:close()          → close (MUST call — not reliably GC'd)
```

## Reading

::code-wrapper{language="lua"}
```lua
local f = assert(io.open("data.txt", "r"))

-- Read formats:
-- "*a" or "a"  → entire file (all remaining content)
-- "*l" or "l"  → next line (without newline) — DEFAULT in 5.3+
-- "*L" or "L"  → next line (WITH newline) — Lua 5.3+
-- "*n" or "n"  → next number (reads a number, skips whitespace)
-- number       → that many bytes (or fewer at EOF)

local all = f:read("*a")     -- entire file as one string
f:seek("set")               -- rewind to start
local line1 = f:read("*l")  -- first line (no \n)
f:seek("set")
local line1_with_nl = f:read("*L")  -- first line (with \n)
f:seek("set")
local num = f:read("*n")     -- reads a leading number from file
f:seek("set")
local chunk = f:read(100)    -- first 100 bytes

-- Multiple reads in one call (each arg is a format):
f:seek("set")
local l1, l2, l3 = f:read("*l", "*l", "*l")  -- first 3 lines
f:close()
```

### Production: Memory-efficient line streaming

::code-wrapper{language="lua"}
```lua
-- f:lines(format?): returns an iterator for line-by-line reading
-- Does NOT load the whole file into memory — reads one line at a time
-- CRITICAL for multi-GB files

local function process_large_file(path, handler)
  local f = assert(io.open(path, "r"))
  for line in f:lines() do  -- one line at a time, constant memory
    handler(line)
  end
  f:close()  -- ALWAYS close (even on error — use pcall or <close>)
end

local count = 0
process_large_file("huge.log", function(line)
  if line:match("ERROR") then count = count + 1 end
end)
print("error lines:", count)

-- With <close> for guaranteed cleanup (Lua 5.4+):
local function process_safe(path, handler)
  local f <close> = assert(io.open(path, "r"))  -- auto-close on scope exit (even on error)
  for line in f:lines() do
    handler(line)
  end
end
```
::

## Writing

::code-wrapper{language="lua"}
```lua
local f = assert(io.open("output.txt", "w"))

-- write accepts multiple string arguments (no separator)
f:write("hello", " ", "world", "\n")  -- "hello world\n"
f:write(42)                          -- coerces number to string (but no format control)

-- For formatted output, use string.format (then write the result)
f:write(string.format("count: %d, rate: %.2f\n", 42, 3.14159))

-- flush: force OS buffer to disk (before a crash, for critical data)
f:flush()

f:close()  -- close also flushes

-- Append mode: writes go to end of file
local a = assert(io.open("log.txt", "a"))
a:write(os.date("%Y-%m-%d %H:%M:%S"), " log entry\n")
a:close()
```

### Production: Atomic write (temp file + rename)

::code-wrapper{language="lua"}
```lua
-- Write to a temp file, then rename — prevents corruption if the process
-- crashes mid-write (rename is atomic on POSIX)
local function atomic_write(path, content)
  local tmp = path .. ".tmp." .. tostring(os.time())
  local f, err = io.open(tmp, "w")
  if not f then return nil, err end
  local ok, write_err = pcall(function()
    f:write(content)
    f:flush()  -- ensure data hits disk before rename
    f:close()
  end)
  if not ok then
    f:close()
    os.remove(tmp)  -- cleanup temp file
    return nil, write_err
  end
  os.rename(tmp, path)  -- atomic on POSIX (not guaranteed on Windows)
  return true
end

atomic_write("config.json", json_data)
-- If the process crashes during write, config.json is untouched (temp file orphaned)
```
::

## Seeking

::code-wrapper{language="lua"}
```lua
-- f:seek(whence, offset):
-- "set"  → from beginning (offset 0 = start)
-- "cur"  → from current position (DEFAULT)
-- "end"  → from end

local f = assert(io.open("data.bin", "rb"))

f:seek("end")             -- go to end
local size = f:seek()      -- get current position (= file size, since we're at end)
print("file size:", size)  -- bytes

f:seek("set", 0)          -- rewind to start
f:seek("set", 1024)       -- skip first 1KB
local header = f:read(16) -- read 16 bytes at offset 1024

f:seek("cur", -4)         -- back up 4 bytes
local reread = f:read(4)   -- re-read those 4 bytes

f:close()

-- NOTE: seeking doesn't work on pipes (io.popen), stdin, or special files
```

## Binary I/O

::code-wrapper{language="lua"}
```lua
-- Binary mode: read/write exact bytes, no line-ending translation
-- Use string.byte/string.char for byte-level access

local f = assert(io.open("image.png", "rb"))
local header = f:read(8)  -- first 8 bytes (PNG signature)

-- Check PNG signature: 137 80 78 71 13 10 26 10
local sig = {137, 80, 78, 71, 13, 10, 26, 10}
local valid = true
for i = 1, 8 do
  if header:byte(i) ~= sig[i] then valid = false; break end
end
print("valid PNG:", valid)

f:close()

-- Write binary data:
local out = assert(io.open("data.bin", "wb"))
out:write(string.char(0x89, 0x50, 0x4E, 0x47))  -- 4 raw bytes
out:write(binary_blob)  -- string with embedded \0 is fine in Lua
out:close()

-- Reading entire binary file:
local f = assert(io.open("data.bin", "rb"))
local data = f:read("*a")  -- entire file as a byte string
f:close()

-- Byte iteration:
for i = 1, #data do
  local byte = data:byte(i)  -- 0-255
  -- process byte
end
```

### Production: Struct binary reader

::code-wrapper{language="lua"}
```lua
-- Binary protocol reader with cursor tracking
local BinaryReader = {}
BinaryReader.__index = BinaryReader

function BinaryReader.new(data)
  return setmetatable({data = data, pos = 1}, BinaryReader)
end

function BinaryReader:u8()   -- unsigned 8-bit
  local v = self.data:byte(self.pos)
  self.pos = self.pos + 1
  return v
end

function BinaryReader:u16be()  -- big-endian 16-bit
  local b1, b2 = self.data:byte(self.pos, self.pos + 1)
  self.pos = self.pos + 2
  return b1 * 256 + b2
end

function BinaryReader:u32le()  -- little-endian 32-bit
  local b1, b2, b3, b4 = self.data:byte(self.pos, self.pos + 3)
  self.pos = self.pos + 4
  return b1 + b2 * 256 + b3 * 65536 + b4 * 16777216
end

function BinaryReader:bytes(n)
  local s = self.data:sub(self.pos, self.pos + n - 1)
  self.pos = self.pos + n
  return s
end

function BinaryReader:remaining()
  return #self.data - self.pos + 1
end

-- Usage: parse a binary protocol header
local function parse_packet(data)
  local r = BinaryReader.new(data)
  local magic = r:bytes(4)       -- 4-byte magic
  local version = r:u8()         -- 1-byte version
  local flags = r:u16be()        -- 2-byte flags (big-endian)
  local length = r:u32le()       -- 4-byte length (little-endian)
  local payload = r:bytes(length)
  return {magic = magic, version = version, flags = flags, payload = payload}
end
```

## Standard Streams & `io` Library

::code-wrapper{language="lua"}
```lua
-- io.stdin, io.stdout, io.stderr: predefined file handles
io.stdout:write("normal output\n")
io.stderr:write("error output\n")  -- goes to stderr (separate from stdout)

-- io.read(format): reads from stdin (default input)
io.write("Enter name: ")  -- no newline, stays on prompt line
local name = io.read("*l")  -- read a line from stdin

-- io.input()/io.output(): set default input/output file (affects io.read/io.write)
io.input("data.txt")      -- subsequent io.read() reads from data.txt
io.output("result.txt")   -- subsequent io.write() writes to result.txt
-- Restore to defaults:
io.input(io.stdin)
io.output(io.stdout)

-- io.type(f): check if a file handle is open
local f = io.open("x.txt", "r")
print(io.type(f))  -- "file"
f:close()
print(io.type(f))  -- "closed file"
```

## `io.popen` — Subprocess Communication

::code-wrapper{language="lua"}
```lua
-- io.popen(command, mode): runs a command, returns a pipe to its stdin/stdout
-- mode "r": read command's stdout
-- mode "w": write to command's stdin

-- Read command output:
local pipe = assert(io.popen("ls -la", "r"))
local output = pipe:read("*a")  -- entire stdout as a string
pipe:close()  -- returns the exit code (true/nil + exit_reason in 5.4+)
print(output)

-- Line-by-line:
local pipe = assert(io.popen("grep ERROR log.txt", "r"))
for line in pipe:lines() do
  print(line)
end
pipe:close()

-- Capture exit status (Lua 5.4+):
local pipe = assert(io.popen("ls /nonexistent", "r"))
local output = pipe:read("*a")
local ok, reason, exit_code = pipe:close()
print(ok, reason, exit_code)  -- false "exit" 2 (command failed with exit code 2)

-- SECURITY: NEVER pass user input to io.popen without sanitizing — command injection!
-- BAD:
-- io.popen("echo " .. user_input)  -- user_input = "$(rm -rf /)" → disaster
-- GOOD: use a safe API or validate input strictly
```

## Directory Listing (no stdlib — use `lfs` or `popen`)

::code-wrapper{language="lua"}
```lua
-- Method 1: io.popen (cross-platform but shell-dependent)
local function list_dir(dir)
  local pipe = assert(io.popen('ls -1 "' .. dir:gsub('"', '\\"') .. '"', "r"))
  local files = {}
  for line in pipe:lines() do
    files[#files + 1] = line
  end
  pipe:close()
  return files
end

-- Method 2: luarocks install luafilesystem (lfs) — portable, no shell
-- local lfs = require("lfs")
-- for entry in lfs.dir(".") do
--   local attr = lfs.attributes(entry)  -- {mode = "file"/"directory", size = N, ...}
--   print(entry, attr.mode, attr.size)
-- end

-- Method 3: Recursive walk (with lfs)
-- local function walk(dir, callback)
--   for entry in lfs.dir(dir) do
--     if entry ~= "." and entry ~= ".." then
--       local path = dir .. "/" .. entry
--       local attr = lfs.attributes(path)
--       if attr.mode == "directory" then
--         walk(path, callback)
--       else
--         callback(path, attr)
--       end
--     end
--   end
-- end
```

## Production: CSV Writer (streaming, quoted)

::code-wrapper{language="lua"}
```lua
local function csv_escape(field)
  if type(field) == "number" then return tostring(field) end
  field = tostring(field)
  if field:match('[,""\r\n]') then
    return '"' .. field:gsub('"', '""') .. '"'  -- quote and escape internal quotes
  end
  return field
end

local function write_csv(path, rows)
  local f <close> = assert(io.open(path, "w"))
  for _, row in ipairs(rows) do
    local fields = {}
    for _, v in ipairs(row) do
      fields[#fields + 1] = csv_escape(v)
    end
    f:write(table.concat(fields, ","), "\n")
  end
end

write_csv("users.csv", {
  {"name", "age", "note"},
  {"Alice", 30, 'has a "quote"'},
  {"Bob", 25, "no issues"},
})
```

## Production: JSON-like Config Persistence

::code-wrapper{language="lua"}
```lua
-- Without cjson: a minimal Lua table serializer (for simple configs)
local function serialize(val, indent, seen)
  indent = indent or ""
  seen = seen or {}
  local t = type(val)
  if t == "nil" then return "nil"
  elseif t == "boolean" then return tostring(val)
  elseif t == "number" then return tostring(val)
  elseif t == "string" then return string.format("%q", val)  -- %q: Lua-quoted string
  elseif t == "table" then
    if seen[val] then error("circular reference", 2) end
    seen[val] = true
    local parts = {}
    local has_array = false
    local has_hash = false
    for k, v in pairs(val) do
      local key_str
      if type(k) == "number" then
        has_array = true
        key_str = "[" .. k .. "]"
      else
        has_hash = true
        key_str = string.format("[%q]", k)
      end
      parts[#parts + 1] = indent .. "  " .. key_str .. " = " .. serialize(v, indent .. "  ", seen)
    end
    if has_array and has_hash then
      return "{\n" .. table.concat(parts, ",\n") .. "\n" .. indent .. "}"
    elseif has_array then
      -- pure array
      local items = {}
      for i, v in ipairs(val) do
        items[i] = serialize(v, indent, seen)
      end
      return "{" .. table.concat(items, ", ") .. "}"
    else
      return "{\n" .. table.concat(parts, ",\n") .. "\n" .. indent .. "}"
    end
  end
  error("cannot serialize " .. t, 2)
end

-- Save:
local config = {host = "localhost", port = 8080, features = {"auth", "logging"}}
local f <close> = assert(io.open("config.lua", "w"))
f:write("return ", serialize(config))
-- config.lua contains: return {["host"] = "localhost", ["port"] = 8080, {"auth", "logging"}}

-- Load: it's a Lua file, so use loadfile (safe, since we control the format)
local fn = assert(loadfile("config.lua"))
local loaded_config = fn()
print(loaded_config.host)  -- "localhost"
```

## 💡 Tips & Tricks

**Use `f:lines()` for any file >1MB**: Avoids loading the entire file into memory.

::code-wrapper{language="lua"}
```lua
-- BAD: loads entire file (10GB → 10GB RAM)
local content = io.open("huge.log", "r"):read("*a")

-- GOOD: streams one line at a time (constant memory)
for line in io.open("huge.log", "r"):lines() do
  process(line)
end
```
::

**`io.write` is faster than `print` for raw output**: `print` adds a tab between args and newline at end; `io.write` writes exactly what you give it.

**`f:seek("end")` then `f:seek()` to get file size**: No `stat` needed.

::code-wrapper{language="lua"}
```lua
local f = io.open("file.bin", "rb")
f:seek("end")
local size = f:seek()
f:seek("set", 0)  -- rewind if you need to read
```
::

**`string.format("%q", s)` for safe Lua-string serialization**: Produces a string that, when parsed by Lua, gives back the original. Handles quotes, newlines, embedded nulls.

## ⚠️ Edge Cases & Gotchas

**File handles are NOT reliably garbage-collected**: Relying on GC to close files causes resource leaks (may hit OS file descriptor limit). Always `f:close()` or use `<close>`.

::code-wrapper{language="lua"}
```lua
-- BAD: f leaks until GC (which may be much later, or never)
local function read_all(path)
  return io.open(path, "r"):read("*a")  -- f never closed!
end

-- GOOD: explicit close
local function read_all(path)
  local f = assert(io.open(path, "r"))
  local content = f:read("*a")
  f:close()
  return content
end

-- BEST: <close> (5.4+), handles errors automatically
local function read_all(path)
  local f <close> = assert(io.open(path, "r"))
  return f:read("*a")
end
```
::

**Text mode translates `\r\n` on Windows**: Reading in `"r"` mode converts `\r\n` to `\n`; writing converts `\n` to `\r\n`. Use `"rb"`/`"wb"` for exact byte control.

**`io.popen` is shell-dependent and a security risk**: The command is passed to `/bin/sh -c` (POSIX) or `cmd.exe` (Windows). Never interpolate untrusted input.

**`f:read("*n")` returns `nil` if no number at position**: Doesn't error — silently returns nil. Check the return value.

**`f:read(0)` returns `""` (empty string), not nil**: Used to test for EOF without consuming. Returns `nil` only at EOF.

## 🧠 Spot the Bug

::code-wrapper{language="lua"}
```lua
local function count_lines(path)
  local f = io.open(path, "r")
  local count = 0
  for line in f:lines() do
    count = count + 1
  end
  return count
end

local function read_first_line(path)
  local f = io.open(path, "r")
  return f:read("*l")
end

-- Call sequence:
print(count_lines("data.txt"))
print(read_first_line("data.txt"))
```

<details>
<summary>Answer</summary>

Two bugs:
1. **File handles never closed** — both functions leak file descriptors. Called in a loop, this will exhaust the OS file descriptor limit (usually ~256 or ~1024).
2. **No error handling on `io.open`** — if the file doesn't exist, `f` is `nil`, and `f:lines()` or `f:read("*l")` errors with "attempt to index a nil value" — misleading.

Fix:

```lua
local function count_lines(path)
  local f = assert(io.open(path, "r"))  -- error with clear message if missing
  local count = 0
  for line in f:lines() do count = count + 1 end
  f:close()  -- ALWAYS close
  return count
end

-- Or with <close> (5.4+):
local function read_first_line(path)
  local f <close> = assert(io.open(path, "r"))
  return f:read("*l")
end
```

</details>