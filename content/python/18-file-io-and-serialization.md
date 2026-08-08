# 18 — File I/O & Serialization

## Opening Files: Modes and the Context Manager

::code-wrapper{language="python"}
```python
with open("notes.txt", "w", encoding="utf-8") as f:
    f.write("first line\n")
    f.write("second line\n")

with open("notes.txt", "r", encoding="utf-8") as f:
    content = f.read()
print(content)
# first line
# second line

with open("notes.txt", "a", encoding="utf-8") as f:
    f.write("appended line\n")
```
::

| Mode | Meaning |
|---|---|
| `"r"` | read (default); errors if file doesn't exist |
| `"w"` | write; **truncates** the file if it exists, creates it if not |
| `"a"` | append; creates the file if it doesn't exist, never truncates |
| `"x"` | exclusive create; errors if the file *already* exists |
| `"b"` suffix | binary mode (`"rb"`, `"wb"`) — bytes, not str |
| `"+"` suffix | read and write (`"r+"`, `"w+"`) |

**Best practice**: always use `with open(...) as f:` — never a bare `f = open(...)` followed by manual `f.close()`. The context manager guarantees the file is closed (flushing any buffered writes) even if an exception is raised mid-block, exactly like the `__enter__`/`__exit__` protocol from chapter 14.

::code-wrapper{language="python"}
```python
# RISKY — if write() or any code between open/close raises, close() never runs
f = open("data.txt", "w")
f.write("data")
process_data()   # if this raises, the file is never closed — buffered writes may be lost
f.close()

# CORRECT — guaranteed cleanup regardless of exceptions
with open("data.txt", "w") as f:
    f.write("data")
    process_data()
```
::

## Reading Patterns: Whole File vs Line-by-Line vs Chunks

::code-wrapper{language="python"}
```python
# Whole file at once — fine for small/medium files, dangerous for huge ones (loads it ALL into memory)
with open("small.txt", encoding="utf-8") as f:
    content = f.read()

# Line by line — memory-efficient, the idiomatic way to process large text files (see chapter 09)
with open("huge.log", encoding="utf-8") as f:
    for line in f:                 # the file object IS an iterator over lines
        if "ERROR" in line:
            print(line.strip())

# All lines as a list — loads everything, but gives you len()/indexing
with open("small.txt", encoding="utf-8") as f:
    lines = f.readlines()

# Fixed-size chunks — for binary data or streaming processing
with open("large.bin", "rb") as f:
    while chunk := f.read(8192):     # walrus operator (chapter 03) — read until EOF returns b""
        process_chunk(chunk)
```
::

## `pathlib` — The Modern Way to Handle Paths

::code-wrapper{language="python"}
```python
from pathlib import Path

config_dir = Path.home() / ".config" / "myapp"    # `/` is OVERLOADED to join paths — cross-platform!
config_file = config_dir / "settings.json"

config_dir.mkdir(parents=True, exist_ok=True)      # like `mkdir -p`
config_file.write_text('{"debug": true}', encoding="utf-8")

print(config_file.exists())      # True
print(config_file.name)            # "settings.json"
print(config_file.stem)              # "settings"
print(config_file.suffix)              # ".json"
print(config_file.parent)                # .../.config/myapp

for py_file in Path(".").glob("**/*.py"):    # recursive glob
    print(py_file)

content = config_file.read_text(encoding="utf-8")
print(content)   # {"debug": true}
```
::

`pathlib.Path` objects are cross-platform by construction — `Path("a") / "b"` produces `a\b` on Windows and `a/b` on POSIX automatically, unlike manually concatenating strings with `os.path.join` or (far worse) hardcoded `/` or `\`. **Best practice**: prefer `pathlib` over `os.path` string manipulation in all new code.

## `json` — The Ubiquitous Interchange Format

::code-wrapper{language="python"}
```python
import json

data = {"name": "Ada", "age": 36, "active": True, "tags": ["math", "computing"]}

json_string = json.dumps(data, indent=2)
print(json_string)
# {
#   "name": "Ada",
#   "age": 36,
#   "active": true,
#   "tags": [
#     "math",
#     "computing"
#   ]
# }

parsed = json.loads(json_string)
print(parsed["name"])   # "Ada"
print(parsed == data)     # True

with open("data.json", "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)

with open("data.json", encoding="utf-8") as f:
    loaded = json.load(f)
```
::

### The gotcha: JSON has no tuple, set, or datetime type

::code-wrapper{language="python"}
```python
data = {"coords": (1, 2), "tags": {"a", "b"}}
# json.dumps(data)   # TypeError: Object of type set is not JSON serializable

data_fixed = {"coords": [1, 2], "tags": list({"a", "b"})}
print(json.dumps(data_fixed))   # {"coords": [1, 2], "tags": [...]}  — order of set->list is not guaranteed!

# Round-tripping a tuple through JSON silently turns it into a list — JSON has no tuple type at all
round_tripped = json.loads(json.dumps({"coords": (1, 2)}))
print(round_tripped)                # {'coords': [1, 2]}
print(type(round_tripped["coords"]))  # <class 'list'> — NOT tuple!
```
::

For custom objects, dates, or types JSON doesn't natively support, use `default=` (serialization) and `object_hook=` (deserialization):

::code-wrapper{language="python"}
```python
from datetime import datetime, date

def json_default(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

payload = {"created_at": datetime(2024, 1, 15, 10, 30)}
print(json.dumps(payload, default=json_default))
# {"created_at": "2024-01-15T10:30:00"}
```
::

## `pickle` — Full Python Object Serialization

::code-wrapper{language="python"}
```python
import pickle

class Point:
    def __init__(self, x, y):
        self.x, self.y = x, y

p = Point(3, 4)

with open("point.pkl", "wb") as f:      # ALWAYS binary mode for pickle
    pickle.dump(p, f)

with open("point.pkl", "rb") as f:
    loaded = pickle.load(f)
print(loaded.x, loaded.y)   # 3 4 — full object, including class identity, restored
```
::

`pickle` can serialize almost any Python object — including custom classes, nested structures, even some functions — which `json` fundamentally cannot. This power comes with a serious cost, covered fully in chapter 27: **never unpickle data from an untrusted source** — deserializing a malicious pickle can execute arbitrary code, since `pickle.load` is essentially "reconstruct and run whatever instructions produced this byte stream." Use `pickle` only for trusted, internal data (caches, checkpoints between your own processes) — never for data crossing a security boundary (user uploads, network payloads from external parties).

## `csv` — Tabular Data

::code-wrapper{language="python"}
```python
import csv

rows = [
    {"name": "Ada", "role": "Mathematician"},
    {"name": "Grace", "role": "Rear Admiral"},
]

with open("people.csv", "w", newline="", encoding="utf-8") as f:   # newline="" is REQUIRED on all platforms
    writer = csv.DictWriter(f, fieldnames=["name", "role"])
    writer.writeheader()
    writer.writerows(rows)

with open("people.csv", newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        print(row)   # OrderedDict-like access: row["name"], row["role"]
```
::

The `newline=""` argument to `open()` when reading/writing CSV isn't optional boilerplate — it disables Python's own universal-newline translation, letting the `csv` module handle line endings itself; omitting it can produce extra blank rows on Windows, since both layers would otherwise translate `\r\n` independently.

## Encoding Pitfalls: `str` vs `bytes`

::code-wrapper{language="python"}
```python
# WRONG — mixing text mode with binary data, or vice versa, raises TypeError immediately...
with open("data.bin", "rb") as f:
    data = f.read()
# f.write("text")   # TypeError: a bytes-like object is required, not 'str'

# ...but the MORE DANGEROUS mistake is omitting encoding= on text mode, which doesn't error —
# it silently uses the OS's default encoding, which varies by platform and locale
with open("notes.txt", "w") as f:      # no encoding= specified!
    f.write("café")                       # writes using locale.getpreferredencoding(), NOT guaranteed UTF-8

# On a system with a non-UTF-8 default locale, or when the file is later read on a DIFFERENT
# system, this can raise UnicodeDecodeError or silently produce mojibake (garbled text)
```
::

**Best practice**: always pass `encoding="utf-8"` explicitly to `open()` for text files — never rely on the platform default. This single habit prevents an entire category of "works on my machine, breaks in CI/production" bugs caused by different default encodings across Linux, macOS, and Windows.

::code-wrapper{language="python"}
```python
# Explicit encode/decode when working directly with bytes
text = "héllo wörld"
encoded = text.encode("utf-8")
print(encoded)                 # b'h\xc3\xa9llo w\xc3\xb6rld'
print(len(text), len(encoded))   # 11 13 — multi-byte characters make byte length > character length

decoded = encoded.decode("utf-8")
print(decoded == text)   # True

# decoding with the WRONG encoding produces garbage or raises
# encoded.decode("ascii")   # UnicodeDecodeError: 'ascii' codec can't decode byte 0xc3
print(encoded.decode("latin-1"))   # "hÃ©llo wÃ¶rld" — decodes WITHOUT error, but WRONG text (mojibake)
```
::

The `latin-1` example is the most dangerous encoding bug: unlike `ascii`, `latin-1` can decode *any* byte sequence without ever raising an error — meaning a wrong-encoding bug can silently produce corrupted text instead of a clear, catchable exception.

## `tempfile` — Safe Temporary Files

::code-wrapper{language="python"}
```python
import tempfile

with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=True, encoding="utf-8") as tmp:
    tmp.write("scratch data")
    tmp.flush()
    print(tmp.name)             # the OS-assigned unique path
# file is automatically deleted here, when the `with` block exits

with tempfile.TemporaryDirectory() as tmpdir:
    print(tmpdir)                  # a fresh, unique directory
    # ... write multiple files into it ...
# entire directory tree is removed automatically on exit
```
::

`tempfile` guarantees unique, race-condition-free filenames — hand-rolling a "temp file" with a hardcoded or predictable name (`/tmp/myapp_temp.txt`) is a real security and correctness hazard in any multi-process or multi-user environment, since two processes could collide on the same path.

## 💡 Tips & Tricks

- **Idiom**: `Path.read_text()`/`Path.write_text()` and `Path.read_bytes()`/`Path.write_bytes()` replace the `open()`/`read()`/`close()` dance for simple one-shot file operations — shorter, and they close the file automatically even without an explicit `with`.
- **Debug**: `json.dumps(data, indent=2, sort_keys=True)` produces stable, diffable, human-readable output — invaluable when comparing JSON snapshots in tests or debugging serialization differences across runs.
- **Performance**: for very large JSON files, `json.load`/`json.dump` still materialize the entire structure in memory — for genuinely huge files, streaming libraries like `ijson` avoid loading everything at once, the same lazy-vs-eager tradeoff from chapter 09's generators.
- **Idiom**: `csv.DictReader`/`DictWriter` are almost always preferable to the positional `csv.reader`/`writer` — column-name access survives column reordering in the source file, while positional indexing silently breaks.
- **Safety**: use `pickle` only for data you fully trust and control end-to-end; for anything crossing a process, network, or user boundary, prefer `json` (or a schema-validated format) specifically because it cannot execute code during deserialization.

## ⚠️ Edge Cases & Gotchas

- **Omitting `encoding=` on `open()` for text files silently uses the platform's default encoding, not UTF-8** — this doesn't error locally but can produce `UnicodeDecodeError` or silently garbled text when the same file is read on a different OS or locale; always pass `encoding="utf-8"` explicitly.
- **Decoding bytes with the wrong encoding doesn't always raise an error** — `latin-1` in particular can decode any byte sequence without error, silently producing corrupted (mojibake) text instead of a catchable exception; a caught `UnicodeDecodeError` from `ascii`/`utf-8` is actually the *safer* failure mode.
- **`json` has no native tuple, set, or datetime type — tuples silently become lists on serialization, and sets/datetimes raise `TypeError` unless handled via `default=`** — round-tripping data through JSON is not guaranteed to preserve the original Python types.
- **Never unpickle data from an untrusted source — `pickle.load` can execute arbitrary code as part of reconstructing the object**, making it a genuine remote-code-execution vector when used on network payloads, user uploads, or any data crossing a trust boundary (fully covered in chapter 27).
- **CSV files written or read without `newline=""` can produce extra blank rows on Windows**, because both Python's universal-newline text-mode translation and the `csv` module's own line-ending handling apply independently, effectively double-translating `\r\n` sequences.

## 🧠 Spot the Bug

A script writes user-submitted comments to a log file and later reads them back for analysis on a different server. It works in local testing but corrupts non-English text in production. Find the bug.

::code-wrapper{language="python"}
```python
def save_comment(comment, path="comments.log"):
    with open(path, "a") as f:
        f.write(comment + "\n")

def load_comments(path="comments.log"):
    with open(path) as f:
        return f.readlines()

save_comment("Café con leche, por favor")
comments = load_comments()
print(comments)
```
::

<details>
<summary>Answer</summary>

Neither `open()` call specifies `encoding=` — both silently use `locale.getpreferredencoding()`, which defaults to UTF-8 on most modern Linux/macOS but can default to something else (historically, `cp1252` or similar) depending on the OS and locale configuration. The developer's local machine and the production server can easily have different default encodings. Text containing non-ASCII characters (`é`, accented Spanish text) gets written using one encoding's byte representation, then read back assuming a different encoding — producing either garbled characters or a `UnicodeDecodeError`, and the failure is completely invisible in local testing if the developer's machine happens to default to UTF-8 already.

The fix is to always pass `encoding="utf-8"` explicitly on every text-mode `open()` call, matching on both the write and read side:
::code-wrapper{language="python"}
```python
def save_comment(comment, path="comments.log"):
    with open(path, "a", encoding="utf-8") as f:
        f.write(comment + "\n")

def load_comments(path="comments.log"):
    with open(path, encoding="utf-8") as f:
        return f.readlines()
```
::

**The lesson**: relying on the platform default encoding is an environment-dependent bug that tests can pass locally while failing in production — always be explicit about `encoding="utf-8"` for text I/O, since "works on my machine" is exactly what a default-encoding mismatch produces.

</details>

## Key Takeaways

- Always use `with open(...) as f:` — it guarantees the file closes (and buffered writes flush) even when an exception is raised mid-block.
- Always pass `encoding="utf-8"` explicitly for text-mode file operations; relying on the platform default is a silent, environment-dependent bug waiting to happen.
- `pathlib.Path` is the modern, cross-platform way to build and manipulate paths — prefer it over manual string concatenation or `os.path` for new code.
- `json` is safe for untrusted data but loses tuple/set/datetime fidelity; `pickle` preserves full Python object fidelity but must never be used on untrusted input, since deserializing it can execute arbitrary code.
- `csv.DictReader`/`DictWriter` (with `newline=""` on the file) are more robust than positional `reader`/`writer`, surviving column reordering and avoiding platform-specific blank-row bugs.
- `tempfile` provides race-condition-free unique temporary files/directories — never hand-roll a "temp" filename in shared or multi-process environments.
