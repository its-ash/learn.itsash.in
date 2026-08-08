# 26 — Performance & Optimization

## Measure First: `cProfile`

::code-wrapper{language="python"}
```python
import cProfile
import pstats

def slow_fibonacci(n):
    if n < 2:
        return n
    return slow_fibonacci(n - 1) + slow_fibonacci(n - 2)

def main():
    result = slow_fibonacci(28)
    print(result)

profiler = cProfile.Profile()
profiler.enable()
main()
profiler.disable()

stats = pstats.Stats(profiler)
stats.sort_stats("cumulative").print_stats(5)
#          832040 function calls (2 primitive calls) in 0.198 seconds
#    ncalls  tottime  percall  cumtime  percall filename:lineno(function)
#   832040/1    0.198    0.000    0.198    0.198 fib.py:4(slow_fibonacci)
```
::

::code-wrapper{language="bash"}
```bash
python -m cProfile -s cumulative myscript.py
```
::

`cProfile` is a deterministic, C-implemented profiler shipped with the standard library — it instruments every function call and records exact call counts and time spent, both "total time in this function alone" (`tottime`) and "total time including everything it called" (`cumtime`). **Best practice**: always profile before optimizing — intuition about where a program spends its time is frequently wrong, and optimizing a function that accounts for 2% of runtime wastes effort while the actual 80% bottleneck goes untouched. This is the single most important rule in this entire chapter.

### Line-level profiling with `line_profiler`

::code-wrapper{language="bash"}
```bash
pip install line_profiler
```
::

::code-wrapper{language="python"}
```python
@profile   # only valid when run through kernprof — not a normal decorator otherwise
def process_orders(orders):
    total = 0
    for order in orders:
        total += order["price"] * order["quantity"]   # line-by-line timing shows THIS line dominates
    return total
```
::

::code-wrapper{language="bash"}
```bash
kernprof -l -v myscript.py
# Line #      Hits         Time  Per Hit   % Time  Line Contents
# ==============================================================
#      4                                           def process_orders(orders):
#      5         1          0.1      0.1      0.0      total = 0
#      6    100001      15234.0      0.2      12.1      for order in orders:
#      7    100000     110890.0      1.1      87.9          total += order["price"] * order["quantity"]
```
::

`cProfile` identifies *which function* is slow; `line_profiler` goes one level deeper, showing *which line inside that function* dominates — invaluable when a function mixes a fast loop setup with one expensive line buried inside it that `cProfile`'s function-level granularity can't isolate.

## The GIL, `dis`, and Why Python Loops Are Slow

::code-wrapper{language="python"}
```python
import dis

def add_one(x):
    return x + 1

dis.dis(add_one)
#   2           0 RESUME                   0
#               2 LOAD_FAST                0 (x)
#               4 LOAD_CONST               1 (1)
#               6 BINARY_OP                0 (+)
#              10 RETURN_VALUE
```
::

Every Python-level operation — even `x + 1` — compiles to multiple bytecode instructions, each dispatched through the interpreter's evaluation loop, each involving type checks and dynamic dispatch (`__add__` lookup, etc.) that a compiled language resolves once at compile time. This is the fundamental reason a pure-Python `for` loop summing a million numbers is orders of magnitude slower than the equivalent C loop: not one slow operation, but millions of small dynamic-dispatch overheads compounding.

::code-wrapper{language="python"}
```python
import time

data = list(range(10_000_000))

start = time.perf_counter()
total = 0
for x in data:
    total += x
print(f"pure loop: {time.perf_counter() - start:.4f}s")

start = time.perf_counter()
total = sum(data)             # sum() runs its loop in C, not in the bytecode interpreter
print(f"builtin sum(): {time.perf_counter() - start:.4f}s")   # typically 5-10x faster
```
::

**Best practice**: prefer built-ins (`sum`, `min`, `max`, `sorted`, `any`, `all`) and comprehensions over hand-written Python loops for anything performance-sensitive — they execute their iteration in C, sidestepping per-iteration bytecode dispatch overhead entirely, often for a 5-10x speedup with no algorithmic change at all.

## `numpy`: Vectorization Over Loops

::code-wrapper{language="python"}
```python
import numpy as np
import time

size = 10_000_000
python_list = list(range(size))
numpy_array = np.arange(size)

start = time.perf_counter()
squared_list = [x * x for x in python_list]
print(f"list comprehension: {time.perf_counter() - start:.4f}s")

start = time.perf_counter()
squared_array = numpy_array ** 2
print(f"numpy vectorized: {time.perf_counter() - start:.4f}s")   # typically 20-50x faster
```
::

`numpy` arrays are backed by contiguous, fixed-type C memory blocks, and operations like `**`, `+`, or `np.sum()` dispatch to compiled C (or SIMD-vectorized) loops operating on that raw memory directly — no per-element Python object boxing, no per-element type dispatch. **Best practice**: any numerical workload processing more than a few thousand elements — matrix math, signal processing, statistics, image data — belongs in `numpy` (or `pandas`, built on it), not a Python list with manual loops; this single change routinely accounts for the largest performance win available in data-heavy code.

::code-wrapper{language="python"}
```python
prices = np.array([19.99, 5.50, 100.00, 0.99])
quantities = np.array([2, 10, 1, 50])

# WRONG mindset (works, but throws away numpy's advantage):
total = 0
for i in range(len(prices)):
    total += prices[i] * quantities[i]

# RIGHT — vectorized, no Python-level loop at all:
total = (prices * quantities).sum()
```
::

## Cython and C Extensions: When Pure Python Isn't Enough

::code-wrapper{language="python"}
```python
# fib.pyx — Cython source, a superset of Python with optional static typing
def fib_cython(int n):
    cdef int a = 0, b = 1, i
    for i in range(n):
        a, b = b, a + b
    return a
```
::

::code-wrapper{language="toml"}
```toml
[build-system]
requires = ["setuptools", "Cython"]
build-backend = "setuptools.build_meta"
```
::

::code-wrapper{language="bash"}
```bash
cythonize -i fib.pyx    # compiles fib.pyx into a native .so/.pyd extension module
```
::

Cython compiles Python-like syntax (with optional C-level type annotations via `cdef`) directly to C, then to a native shared library importable exactly like a normal Python module — the `cdef int` declarations let the generated C skip Python's dynamic type dispatch entirely for that variable, closing most of the gap to hand-written C. **When to reach for it**: after profiling identifies a specific, narrow hot loop that dominates runtime and can't be vectorized with `numpy` — Cython is a scalpel for that one function, not a wholesale rewrite strategy. Numba (`@numba.jit`) is a lighter-weight alternative for numerical code: it JIT-compiles ordinary Python/`numpy` functions at first call, no separate build step or `.pyx` file needed, at the cost of being more limited in what Python features it supports.

## Memory Views: Avoiding Copies

::code-wrapper{language="python"}
```python
data = bytearray(b"hello world" * 1000)

# WRONG for large data — slicing a bytearray/bytes COPIES the sliced portion
chunk = data[0:100]      # allocates a brand new 100-byte object

# RIGHT — memoryview exposes a window into the SAME underlying buffer, zero-copy
view = memoryview(data)
chunk_view = view[0:100]     # no copy — just a new view object referencing the same memory
chunk_view[0] = ord("H")     # mutates the ORIGINAL bytearray through the view
print(data[:5])               # bytearray(b'Hello') — the underlying buffer changed
```
::

A `memoryview` implements Python's buffer protocol, letting code operate on a slice, reshape, or cast a large binary buffer (a `bytearray`, a `numpy` array, an `array.array`) without copying the underlying bytes — critical when processing large files or network buffers where naive slicing (`data[a:b]`) would otherwise allocate a new copy for every slice operation. **Best practice**: reach for `memoryview` when repeatedly slicing large `bytes`/`bytearray` objects in a hot path (binary protocol parsers, file-chunk processing) — the memory and time savings scale directly with how large the buffer and how frequent the slicing is.

::code-wrapper{language="python"}
```python
def parse_header_wrong(packet: bytes):
    magic = packet[0:4]        # copies 4 bytes into a new bytes object
    length = packet[4:8]       # copies another 4 bytes
    payload = packet[8:]       # copies the ENTIRE remaining payload — the expensive one
    return magic, length, payload

def parse_header_fast(packet: bytes):
    view = memoryview(packet)
    magic = view[0:4]          # zero-copy view
    length = view[4:8]         # zero-copy view
    payload = view[8:]          # zero-copy view, regardless of payload size
    return magic, length, payload
```
::

## `__slots__`: Trading Flexibility for Memory

::code-wrapper{language="python"}
```python
import sys

class PointDict:
    def __init__(self, x, y):
        self.x = x
        self.y = y

class PointSlots:
    __slots__ = ("x", "y")
    def __init__(self, x, y):
        self.x = x
        self.y = y

p1 = PointDict(1, 2)
p2 = PointSlots(1, 2)
print(sys.getsizeof(p1.__dict__))   # 296 bytes or more — every instance carries a full dict
print(sys.getsizeof(p2))              # dramatically smaller — no __dict__ at all
```
::

Without `__slots__`, every instance carries its own `__dict__` for attribute storage — flexible (attributes can be added dynamically at any time) but memory-heavy, since a dict's hash table overhead dwarfs the space needed for just two floats. `__slots__ = ("x", "y")` tells Python to allocate fixed, dict-free storage for exactly those named attributes, cutting per-instance memory dramatically (commonly 40-50% for simple attribute-heavy classes) — the difference compounds fast when instantiating millions of objects (parsed rows, graph nodes, simulation particles).

::code-wrapper{language="python"}
```python
class PointSlots:
    __slots__ = ("x", "y")
    def __init__(self, x, y):
        self.x = x
        self.y = y

p = PointSlots(1, 2)
# p.z = 3   # AttributeError: 'PointSlots' object has no attribute 'z' — no __dict__ to fall back to
```
::

**The trade-off**: `__slots__` classes cannot have arbitrary attributes added after the fact (no `__dict__` exists to hold them, unless `__dict__` is explicitly included in `__slots__`, which defeats much of the memory benefit), and multiple inheritance between two classes that each define non-empty, non-identical `__slots__` raises `TypeError: multiple bases have instance lay-out conflict`. **Best practice**: use `__slots__` for classes instantiated in bulk (thousands to millions of instances) with a fixed, known attribute set — data records, tree/graph nodes, particle-simulation entities — and skip it for classes where dynamic attribute flexibility matters more than the memory savings.

## `functools.lru_cache`: Trading Memory for Speed

::code-wrapper{language="python"}
```python
from functools import lru_cache
import time

@lru_cache(maxsize=None)
def expensive_lookup(user_id):
    time.sleep(0.1)               # simulates a slow database call
    return f"user-{user_id}"

start = time.perf_counter()
expensive_lookup(42)
print(f"first call: {time.perf_counter() - start:.3f}s")   # ~0.100s

start = time.perf_counter()
expensive_lookup(42)                                          # cache hit — same arguments
print(f"second call: {time.perf_counter() - start:.3f}s")    # ~0.000s
```
::

`lru_cache` memoizes a pure function's return value keyed by its arguments — a one-line decorator that converts a repeatedly-called, deterministic, side-effect-free function into an O(1) lookup after the first call. **The gotcha**: `maxsize=None` means the cache grows unboundedly, which is a memory leak in long-running processes (a web server handling millions of distinct user IDs will eventually cache all of them) — set an explicit `maxsize` (e.g., `maxsize=1024`) for anything long-running and unbounded in the input space, letting Python's LRU eviction cap memory growth.

## Common Performance Pitfalls

::code-wrapper{language="python"}
```python
# WRONG — string concatenation in a loop is O(n²): each += allocates
# an entirely new string, since str is IMMUTABLE in Python
result = ""
for word in ["a very", "long", "sequence", "of", "many", "words"] * 10000:
    result += word + " "

# RIGHT — join() allocates the final string ONCE, O(n) total
words = ["a very", "long", "sequence", "of", "many", "words"] * 10000
result = " ".join(words)
```
::

Every `result += word` on a Python `str` creates a brand-new string object and copies the entire existing content into it (strings are immutable), turning what looks like a simple loop into quadratic behavior as `result` grows — for large inputs, this is a common, easy-to-miss source of surprisingly slow "obviously simple" code. `"".join(list_of_strings)` computes the total needed length once and allocates a single buffer, making it linear.

::code-wrapper{language="python"}
```python
# WRONG — repeated membership testing against a list is O(n) PER CHECK
blocked_ids = [101, 204, 305, 512, 630]  # imagine thousands of entries
for user_id in incoming_requests:
    if user_id in blocked_ids:            # linear scan every single time
        reject(user_id)

# RIGHT — a set gives O(1) average-case membership testing
blocked_ids = {101, 204, 305, 512, 630}
for user_id in incoming_requests:
    if user_id in blocked_ids:            # O(1) hash lookup
        reject(user_id)
```
::

A `list`'s `in` operator is a linear scan; a `set`'s (or `dict`'s) `in` operator is a hash lookup, averaging O(1) regardless of collection size. **Best practice**: any collection used primarily for membership testing (`x in collection`), not order or duplicates, should be a `set`, not a `list` — a one-line type change with no other code changes needed, and a massive asymptotic improvement as the collection grows.

## 💡 Tips & Tricks

- **Performance**: `python -X importtime myscript.py` reports how long each import took at startup — useful for diagnosing slow CLI tool startup caused by an unexpectedly heavy transitive import (importing all of `pandas` just to use one small helper function, for example).
- **Debug**: `timeit` (`python -m timeit -s "setup code" "statement to time"`) runs a snippet many times and reports the best/average time, automatically handling GC and warm-up noise far more reliably than manually wrapping `time.perf_counter()` around a single run.
- **Idiom**: `sys.intern()` can deduplicate memory for many repeated identical strings (e.g., column names re-parsed from millions of CSV rows) — Python already auto-interns short identifier-like string literals, but explicit interning helps for strings built dynamically at runtime that happen to repeat frequently.
- **Performance**: generator expressions (`sum(x*x for x in data)`) avoid materializing an intermediate list entirely, unlike the equivalent list comprehension (`sum([x*x for x in data])`) — for a one-pass consumption like `sum()`/`any()`/`all()`, the generator form uses O(1) memory instead of O(n).
- **Debug**: `tracemalloc` (standard library) snapshots memory allocations and can diff two snapshots to show exactly which lines of code are responsible for growth between them — far more precise than watching overall process RSS climb and guessing at the cause.

## ⚠️ Edge Cases & Gotchas

- **`cProfile`'s per-call overhead can itself distort results for functions with extremely high call counts and tiny bodies** — a function called a million times with almost no work inside it can appear disproportionately expensive purely due to profiling instrumentation overhead, not real cost; cross-check suspiciously "hot" tiny functions with `timeit` on a de-instrumented run.
- **`lru_cache` on a method (not a plain function) keeps the cache alive as long as the *class* holds a reference to the cached wrapper, which can keep `self` (and everything it references) alive far longer than expected** — caching instance methods can silently create memory leaks by preventing garbage collection of otherwise-dead objects; prefer caching at the module level or explicitly scoping cache lifetime to the instance.
- **`__slots__` inherited from a base class without `__slots__` on `object` itself provides no memory savings** — if any class in the MRO omits `__slots__` (defaulting to a `__dict__`), instances of subclasses still get a `__dict__` alongside the slots, silently defeating the entire optimization while making the code less flexible for no benefit.
- **`numpy` operations on arrays of Python objects (`dtype=object`) get none of the vectorization speedup** — creating a `numpy` array from mixed-type or non-numeric Python objects falls back to storing pointers to ordinary Python objects, meaning `arr * 2` still dispatches through slow per-element Python-level multiplication; the speedup depends entirely on a genuine, uniform numeric `dtype`.
- **Copying a large `numpy` array via slicing behaves the OPPOSITE of Python lists — basic slicing returns a VIEW, not a copy**: `sub = arr[10:20]` shares memory with `arr`, so mutating `sub` mutates `arr` too — the inverse gotcha of Python's own `list` slicing (which always copies), easy to get backwards when moving between the two.

## 🧠 Spot the Bug

A function processes a large log file and is unexpectedly slow and memory-hungry in production despite looking like idiomatic Python. Find the bug.

::code-wrapper{language="python"}
```python
def count_error_lines(filename):
    with open(filename) as f:
        lines = f.readlines()
    error_lines = [line for line in lines if "ERROR" in line]
    return len(error_lines)
```
::

<details>
<summary>Answer</summary>

`f.readlines()` reads the **entire file into memory at once** as a list of every line, before any filtering happens — for a multi-gigabyte log file, this allocates gigabytes of memory just to hold lines that will mostly be discarded a moment later, and the list comprehension then builds a *second* full list (`error_lines`) alongside it, doubling peak memory further. None of this is necessary: the function only needs a count, never the actual line contents held simultaneously.

The fix iterates the file lazily, one line at a time, and uses a generator expression with `sum()` instead of materializing any intermediate list:
::code-wrapper{language="python"}
```python
def count_error_lines(filename):
    with open(filename) as f:
        return sum(1 for line in f if "ERROR" in line)
```
::

Iterating a file object directly (`for line in f`) reads one line at a time from disk via a small internal buffer, never holding the whole file in memory — combined with a generator expression (no intermediate list bracket), peak memory becomes O(1) relative to file size instead of O(n).

**The lesson**: `readlines()` (and any function that eagerly builds a full list from a large or unbounded source) trades memory for a superficially simpler-looking loop — for anything that can be processed one item at a time, iterate lazily (the file object itself, `csv.reader`, generator expressions) rather than materializing the entire dataset in memory first.

</details>

## Key Takeaways

- Always profile before optimizing — `cProfile` for function-level hotspots, `line_profiler` for line-level detail — since intuition about bottlenecks is frequently wrong and optimizing the wrong code wastes effort.
- Prefer built-ins (`sum`, `sorted`, comprehensions, `join`) over hand-written Python loops for hot paths — they execute their iteration in C, sidestepping per-iteration bytecode dispatch overhead.
- `numpy` vectorization is the single biggest lever for numerical workloads, routinely delivering 20-50x speedups by operating on contiguous C memory instead of boxed Python objects; Cython/Numba are the scalpel for narrow, non-vectorizable hot loops.
- `memoryview` avoids copying large binary buffers on every slice operation; `__slots__` trades dynamic-attribute flexibility for significant per-instance memory savings at scale — both matter most when multiplied across large amounts of data or many instances.
- Classic pitfalls — `str` concatenation in a loop (O(n²)), `list` membership testing instead of `set` (O(n) vs O(1)), and eagerly materializing large collections (`readlines()`) instead of iterating lazily — account for a large fraction of real-world "why is this simple code so slow" bugs.
- `lru_cache` trades memory for speed on pure, deterministic functions — always set a `maxsize` in long-running processes to avoid unbounded cache growth becoming a memory leak.
