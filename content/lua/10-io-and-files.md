# 10 — I/O & Files

## Basic File Operations

::code-wrapper{language="lua"}
```lua
-- Open file
local file = io.open("data.txt", "r")  -- "r" = read mode
if not file then
  error("Could not open file")
end

-- Read all content
local content = file:read("*a")  -- "*a" = all content
print(content)

-- Close file
file:close()

-- Shorthand (auto-close after function)
local content = io.input("data.txt"):read("*a")
```
::

## File Modes

| Mode | Purpose |
|---|---|
| `"r"` | Read (file must exist) |
| `"w"` | Write (truncate if exists) |
| `"a"` | Append (add to end) |
| `"r+"` | Read/write (file must exist) |
| `"w+"` | Read/write (truncate if exists) |
| `"a+"` | Read/append |
| `"b"` | Binary (append to any mode) |

::code-wrapper{language="lua"}
```lua
-- Write to file
local file = io.open("output.txt", "w")
file:write("Hello, World!\n")
file:write("Line 2\n")
file:close()

-- Append to file
local file = io.open("output.txt", "a")
file:write("Line 3\n")
file:close()

-- Read line by line
local file = io.open("data.txt", "r")
for line in file:lines() do
  print(line)
end
file:close()
```
::

## Reading Files

::code-wrapper{language="lua"}
```lua
local file = io.open("data.txt", "r")

-- Read entire file
local all = file:read("*a")

-- Read single line (without newline)
file:seek("set", 0)  -- reset to beginning
local line = file:read("*l")

-- Read N characters
file:seek("set", 0)
local chunk = file:read(10)

-- Read as number
local num = file:read("*n")

-- Iterate lines
file:seek("set", 0)
for line in file:lines() do
  print(line)
end

file:close()
```
::

## Writing Files

::code-wrapper{language="lua"}
```lua
local file = io.open("output.txt", "w")

-- Write strings
file:write("Hello")
file:write(" World\n")

-- Write formatted (like printf)
file:write(string.format("Number: %d\n", 42))

-- Write multiple values
file:write("a", "b", "c")  -- "abc"

file:close()

-- Ensure data is written
local file = io.open("important.txt", "w")
file:write("critical data")
file:flush()  -- force write to disk
file:close()
```
::

## File Seeking

Move position in file:

::code-wrapper{language="lua"}
```lua
local file = io.open("data.txt", "r")

-- Seek to beginning
file:seek("set", 0)

-- Seek to end
file:seek("end", 0)

-- Seek relative to current position
file:seek("cur", 10)  -- move 10 bytes forward

-- Get current position
local pos = file:seek()
print("Position: " .. pos)

file:close()
```
::

## Binary Files

::code-wrapper{language="lua"}
```lua
-- Read binary data
local file = io.open("image.png", "rb")
local header = file:read(8)  -- read 8 bytes

for i = 1, #header do
  local byte = string.byte(header, i)
  print(string.format("%02X", byte))  -- print as hex
end

file:close()

-- Write binary data
local file = io.open("output.bin", "wb")
local bytes = string.char(0xFF, 0xD8, 0xFF)  -- binary data
file:write(bytes)
file:close()
```
::

## Standard I/O Streams

::code-wrapper{language="lua"}
```lua
-- Read from stdin
io.write("Enter your name: ")
local name = io.read()  -- reads a line
print("Hello, " .. name)

-- Read number from stdin
io.write("Enter a number: ")
local num = tonumber(io.read())

-- Write to stdout
io.write("Output to stdout\n")

-- Write to stderr
io.stderr:write("Error message\n")

-- Redirect default I/O
io.input("input.txt")   -- reads from file
io.output("output.txt") -- writes to file

-- Restore to stdin/stdout
io.input(io.stdin)
io.output(io.stdout)
```
::

## Working with Directories

::code-wrapper{language="lua"}
```lua
-- List files (platform-specific)
-- Lua standard library doesn't have directory reading
-- Use external library or os.execute()

-- Execute shell command
os.execute("ls -la")  -- UNIX
os.execute("dir")     -- Windows

-- Get directory listing (simple approach)
local function list_files(dir)
  local popen = io.popen
  local pfile = popen('ls "' .. dir .. '"')
  local files = {}
  for file in pfile:lines() do
    table.insert(files, file)
  end
  pfile:close()
  return files
end

for _, file in ipairs(list_files(".")) do
  print(file)
end
```
::

## Path Operations

::code-wrapper{language="lua"}
```lua
-- Manual path construction
local dir = "/home/user"
local filename = "data.txt"
local path = dir .. "/" .. filename  -- Unix-style

-- Platform-agnostic (simple)
local path = dir:gsub("/$", "") .. "/" .. filename

-- Get file extension
local function get_extension(filename)
  return filename:match("%.([^%.]+)$")  -- ".txt" -> "txt"
end

-- Get directory from path
local function get_directory(path)
  return path:match("(.*)/") or "."
end

-- Get filename without path
local function get_filename(path)
  return path:match("([^/]+)$")
end

print(get_extension("data.txt"))           -- "txt"
print(get_directory("/home/user/data.txt")) -- "/home/user"
print(get_filename("/home/user/data.txt"))  -- "data.txt"
```
::

## File Handling Patterns

### Safe file reading

::code-wrapper{language="lua"}
```lua
local function read_file(filename)
  local file, err = io.open(filename, "r")
  if not file then
    return nil, err
  end
  
  local content = file:read("*a")
  file:close()
  return content
end

-- Usage
local content, err = read_file("data.txt")
if content then
  print("Read " .. #content .. " bytes")
else
  print("Error: " .. err)
end
```
::

### Safe file writing

::code-wrapper{language="lua"}
```lua
local function write_file(filename, content)
  local file, err = io.open(filename, "w")
  if not file then
    return false, err
  end
  
  local ok, write_err = pcall(function()
    file:write(content)
    file:close()
  end)
  
  if not ok then
    file:close()
    return false, write_err
  end
  
  return true
end

-- Usage
local ok, err = write_file("output.txt", "Hello, World!")
if ok then
  print("File written")
else
  print("Error: " .. err)
end
```
::

### Auto-closing with error handling

::code-wrapper{language="lua"}
```lua
local function with_file(filename, mode, fn)
  local file, err = io.open(filename, mode)
  if not file then
    return nil, err
  end
  
  local ok, result = pcall(fn, file)
  file:close()
  
  if not ok then
    error(result)
  end
  
  return result
end

-- Usage
local content = with_file("data.txt", "r", function(f)
  return f:read("*a")
end)
```
::

## JSON File Example

::code-wrapper{language="lua"}
```lua
local json = require("json")  -- requires json library

-- Read JSON file
local function load_config(filename)
  local file = io.open(filename, "r")
  if not file then
    return nil, "File not found"
  end
  
  local content = file:read("*a")
  file:close()
  
  local ok, data = pcall(json.decode, content)
  if not ok then
    return nil, "Invalid JSON"
  end
  
  return data
end

-- Write JSON file
local function save_config(filename, data)
  local file = io.open(filename, "w")
  if not file then
    return false, "Cannot write"
  end
  
  local json_str = json.encode(data)
  file:write(json_str)
  file:close()
  
  return true
end

-- Usage
local config = {host = "localhost", port = 8080}
save_config("config.json", config)

local loaded = load_config("config.json")
print(loaded.host)  -- "localhost"
```
::

## 💡 Tips & Tricks

**Always close files or use `with` pattern**: Unclosed files cause resource leaks. Use helper functions or `<close>` variables (Lua 5.4+).

**Use `io.flush()` for critical data**: If writing important data, call `flush()` to ensure it reaches disk.

**Seek expensive on large files**: Seeking to end to get file size is slow for large files. Consider streaming instead.

**Line iteration is efficient**: Use `:lines()` for memory-efficient line-by-line reading of large files.

**Use string.byte() for binary analysis**: Convert bytes to numbers for parsing binary formats.

## ⚠️ Edge Cases & Gotchas

**File handles are not garbage-collected automatically**: In some Lua implementations, unclosed files leak resources. Always close explicitly or use auto-cleanup.

**Line endings vary by platform**: `\n` (Unix) vs `\r\n` (Windows). Use cross-platform libraries for text processing.

**Path separators differ**: `/` (Unix/Linux/Mac) vs `\` (Windows). Either hardcode for target platform or use library support.

**`seek()` doesn't work on all file types**: Pipes, sockets, and some devices don't support seeking.

**Buffer flushing is implicit**: You don't control when data is written to disk. Use `flush()` for critical operations.

**Text mode auto-converts line endings**: Reading in text mode auto-converts `\r\n` to `\n`. Use binary mode for exact byte control.

## 🧠 Spot the Bug

What does this do?

```lua
local file = io.open("data.txt", "r")
local line1 = file:read("*l")
local line2 = file:read("*l")
print(line1)
print(line2)
-- no close!

local file2 = io.open("data.txt", "r")
print(file2:read("*l"))
file2:close()
```

<details>
<summary>Answer</summary>

Reads first two lines, prints them, then opens file again and reads first line. The first file handle is never closed (resource leak).

**The lesson**: Always close files. In production, this would accumulate open file handles until the OS limit is hit.

</details>

## Key Takeaways

- Use `io.open(filename, mode)` to open files.
- Modes: `"r"` (read), `"w"` (write), `"a"` (append), `"b"` (binary).
- Read: `read("*a")` (all), `read("*l")` (line), `read(n)` (n bytes).
- Write: `write(string)`, `write(formatted_string)`.
- Always close files with `:close()` or use auto-cleanup.
- Use `seek()` to move file position.
- Use `:lines()` for efficient line-by-line reading.
- Use helper functions for safe file operations.
- Binary files use `:seek()` and `string.byte()` for byte operations.
