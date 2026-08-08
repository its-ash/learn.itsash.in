# 19 — Iterators & Context Managers Deep Dive

## The Iterator Protocol, Precisely

Two related but distinct protocols power every `for` loop in Python: **iterable** (has `__iter__`, returns an iterator) and **iterator** (has both `__iter__` — returning itself — and `__next__`, which produces values or raises `StopIteration`).

::code-wrapper{language="python"}
```python
class CountUp:
    """An ITERABLE — __iter__ returns a fresh iterator each time."""
    def __init__(self, limit):
        self.limit = limit

    def __iter__(self):
        return CountUpIterator(self.limit)

class CountUpIterator:
    """An ITERATOR — __next__ produces values, __iter__ returns self."""
    def __init__(self, limit):
        self.limit = limit
        self.current = 0

    def __iter__(self):
        return self          # an iterator is its own iterable

    def __next__(self):
        if self.current >= self.limit:
            raise StopIteration
        value = self.current
        self.current += 1
        return value

counter = CountUp(3)
print(list(counter))   # [0, 1, 2]
print(list(counter))     # [0, 1, 2] — REUSABLE, because __iter__ creates a NEW iterator each time
```
::

This is precisely why `CountUp` (an iterable factory) is reusable across multiple `for` loops, while a raw generator object (chapter 09) is not — the generator object IS its own iterator (single-use), whereas `CountUp.__iter__()` manufactures a brand-new `CountUpIterator` instance on every call.

## What `for` Actually Does

::code-wrapper{language="python"}
```python
# This for loop:
for item in some_iterable:
    print(item)

# is exactly equivalent to:
_iterator = iter(some_iterable)      # calls some_iterable.__iter__()
while True:
    try:
        item = next(_iterator)         # calls _iterator.__next__()
    except StopIteration:
        break
    print(item)
```
::

`iter()` and `next()` are the built-in functions that invoke `__iter__`/`__next__` — understanding a `for` loop as sugar for this exact `while`/`try`/`except StopIteration` loop demystifies why generators (which raise `StopIteration` automatically when they `return`) slot into `for` loops seamlessly.

## Generators Satisfy the Iterator Protocol Automatically

::code-wrapper{language="python"}
```python
def count_up(limit):
    current = 0
    while current < limit:
        yield current
        current += 1

gen = count_up(3)
print(hasattr(gen, "__iter__"))    # True
print(hasattr(gen, "__next__"))      # True
print(iter(gen) is gen)                # True — a generator is its own iterator

print(next(gen))   # 0
print(next(gen))     # 1
print(next(gen))       # 2
# next(gen)             # StopIteration
```
::

This is why implementing `__iter__` as a generator function (`def __iter__(self): yield from self._items`) — shown in chapter 14 — is almost always simpler than hand-writing a separate iterator class with manual `__next__`/state tracking: the generator's local variables and `yield` statements ARE the state machine, generated for you by the interpreter.

## `contextlib.contextmanager` — Context Managers Without a Class

::code-wrapper{language="python"}
```python
from contextlib import contextmanager
import time

@contextmanager
def timer(label):
    start = time.perf_counter()
    try:
        yield              # code inside the `with` block runs here
    finally:
        elapsed = time.perf_counter() - start
        print(f"{label}: {elapsed:.4f}s")

with timer("computation"):
    total = sum(range(10_000_000))
# computation: 0.1234s
```
::

Everything before `yield` is the `__enter__` logic; everything after (in the `finally`) is `__exit__`. This single-generator-function style is generally preferred over writing a full `__enter__`/`__exit__` class for simple setup/teardown, exactly mirroring the "generator vs iterator class" simplification from the previous section.

### Yielding a value for `as`

::code-wrapper{language="python"}
```python
from contextlib import contextmanager

@contextmanager
def open_upper(path):
    f = open(path, encoding="utf-8")
    try:
        yield f.read().upper()    # this becomes the value bound by `as`
    finally:
        f.close()

with open_upper("notes.txt") as content:
    print(content)   # file contents, uppercased
```
::

### Handling exceptions inside a generator-based context manager

::code-wrapper{language="python"}
```python
from contextlib import contextmanager

@contextmanager
def suppress_value_errors():
    try:
        yield
    except ValueError as e:
        print(f"Suppressed: {e}")
        # NOT re-raising means the exception is swallowed, equivalent to __exit__ returning True

with suppress_value_errors():
    int("not a number")
print("continues normally")
```
::

If the `try`/`except` around `yield` doesn't re-raise, the exception is suppressed — equivalent to a class-based `__exit__` returning `True`. Letting the exception propagate (by not catching it, or re-raising) is equivalent to `__exit__` returning `False`/`None`.

## `contextlib.ExitStack` — Managing a Dynamic Number of Context Managers

::code-wrapper{language="python"}
```python
from contextlib import ExitStack

paths = ["a.txt", "b.txt", "c.txt"]

with ExitStack() as stack:
    files = [stack.enter_context(open(p, "w", encoding="utf-8")) for p in paths]
    for f in files:
        f.write("data\n")
# ALL files are closed here, in reverse order, even if one of the writes raised partway through
```
::

Without `ExitStack`, managing an unknown-at-write-time number of context managers requires either nested nested nested `with` statements (impossible when the count is dynamic) or manual `try`/`finally` bookkeeping. `ExitStack.enter_context()` registers each context manager and guarantees all of them exit cleanly, in reverse order, when the stack itself exits — even if opening the third file fails, the first two are still closed correctly.

::code-wrapper{language="python"}
```python
from contextlib import ExitStack

def process_all(paths):
    with ExitStack() as stack:
        files = []
        for p in paths:
            f = stack.enter_context(open(p, encoding="utf-8"))   # each open() registered immediately
            files.append(f)
        return [f.read() for f in files]
```
::

## `contextlib.suppress` — Silencing Specific Exceptions Cleanly

::code-wrapper{language="python"}
```python
from contextlib import suppress
import os

# WRONG-ish (verbose, easy to over-broaden accidentally)
try:
    os.remove("maybe_missing.txt")
except FileNotFoundError:
    pass

# CLEANER — same exact semantics, more declarative, and impossible to accidentally widen the except clause
with suppress(FileNotFoundError):
    os.remove("maybe_missing.txt")
```
::

`contextlib.suppress` is only ever a readability improvement over `try`/`except: pass` — it changes nothing about *which* exceptions are caught, but its declarative style makes "we are deliberately ignoring exactly this error" visually obvious at a glance, which a `try`/`except: pass` block can sometimes obscure if it grows additional lines.

## `itertools` Deep Dive: Building Blocks for Iterator Pipelines

Chapter 09 introduced `itertools`; here are the pipeline-composition patterns that show its real power.

::code-wrapper{language="python"}
```python
import itertools

# tee — split ONE iterator into N independent ones (each consumer advances independently)
source = (x for x in range(5))
a, b = itertools.tee(source, 2)
print(list(a))   # [0, 1, 2, 3, 4]
print(list(b))     # [0, 1, 2, 3, 4] — b is UNAFFECTED by a being fully consumed first

# chain.from_iterable — flatten one level of nested iterables, lazily
nested = [[1, 2], [3, 4], [5]]
print(list(itertools.chain.from_iterable(nested)))   # [1, 2, 3, 4, 5]

# accumulate — running totals (or running any binary operation)
print(list(itertools.accumulate([1, 2, 3, 4])))                  # [1, 3, 6, 10]
print(list(itertools.accumulate([1, 2, 3, 4], func=lambda a, b: a * b)))  # [1, 2, 6, 24]

# pairwise (3.10+) — consecutive overlapping pairs
print(list(itertools.pairwise([1, 2, 3, 4])))   # [(1, 2), (2, 3), (3, 4)]

# starmap — like map, but unpacks each item as *args
points = [(1, 2), (3, 4), (5, 6)]
print(list(itertools.starmap(lambda x, y: x + y, points)))   # [3, 7, 11]
```
::

### The `tee` gotcha: don't use the original iterator after teeing

::code-wrapper{language="python"}
```python
source = iter([1, 2, 3])
a, b = itertools.tee(source, 2)
next(source)      # DON'T do this — advances the shared underlying iterator behind tee's back
print(list(a))      # [2, 3] — missing 1! tee's internal buffering is now inconsistent
```
::

Once an iterator is passed to `tee`, treat the original as consumed/off-limits — `tee` internally buffers items so each derived iterator can proceed independently, but that buffering assumes it's the *only* thing pulling from the source.

## Building a Reusable, Class-Based Context Manager With `__enter__`/`__exit__`

For cases needing more state or reuse across many `with` blocks with configuration, a class is still the better tool than `@contextmanager`:

::code-wrapper{language="python"}
```python
class Transaction:
    def __init__(self, connection):
        self.connection = connection

    def __enter__(self):
        self.connection.begin()
        return self.connection

    def __exit__(self, exc_type, exc_value, traceback):
        if exc_type is None:
            self.connection.commit()
        else:
            self.connection.rollback()
        return False   # never suppress — let the caller see what went wrong

# with Transaction(db_connection) as conn:
#     conn.execute("UPDATE accounts SET balance = balance - 100 WHERE id = 1")
#     conn.execute("UPDATE accounts SET balance = balance + 100 WHERE id = 2")
# commits if both succeed, rolls back automatically if either raises
```
::

This is the canonical database-transaction pattern: `__exit__` inspects `exc_type` to decide between commit and rollback, and returns `False` so any real error still propagates to the caller instead of being silently absorbed.

## 💡 Tips & Tricks

- **Idiom**: reach for `@contextmanager` first for any new context manager — only drop to a full `__enter__`/`__exit__` class when you need to reuse the same instance across multiple `with` blocks or need extra methods/state beyond simple setup/teardown.
- **Debug**: `next(iterator, default)` — the two-argument form of `next()` — returns `default` instead of raising `StopIteration` when exhausted, useful for "peek and maybe stop" logic without a `try`/`except`.
- **Performance**: `itertools` functions are implemented in C and are lazy — chaining several of them (`filter` → `map` → `itertools.islice`) processes one item at a time through the whole pipeline, using far less memory than building intermediate lists at each stage.
- **Idiom**: `contextlib.suppress(*exceptions)` accepts multiple exception types just like a tuple in `except` — `suppress(FileNotFoundError, PermissionError)` — for concisely ignoring more than one specific, expected failure.
- **Debug**: if a `for` loop over a custom object raises `TypeError: object is not iterable`, check for a missing `__iter__` (and, if hand-rolling an iterator instead of a generator, a missing `__next__` that raises `StopIteration`) — both protocol methods are required and Python doesn't infer one from the other.

## ⚠️ Edge Cases & Gotchas

- **A generator IS its own iterator (`iter(gen) is gen`), which is exactly why it's single-use** — a plain iterable class with `__iter__` returning a *new* iterator instance each call is reusable across multiple `for` loops; conflating the two is a common source of the "why did my second loop get nothing" bug from chapter 09.
- **Using the original iterator after passing it to `itertools.tee` silently corrupts the derived iterators' output**, since `tee`'s internal buffering assumes exclusive access to the source from that point forward — always stop using the original reference once `tee` has been called on it.
- **A `contextmanager`-decorated generator function that doesn't wrap `yield` in `try`/`finally` will skip its cleanup code entirely if the `with` block raises** — unlike a plain function, an unhandled exception propagating through the `yield` point means the code after `yield` never executes unless it's specifically inside a `finally`.
- **Calling `next()` on an exhausted iterator raises `StopIteration` every time, not just once** — code that calls `next()` directly (rather than iterating via `for`, which catches `StopIteration` automatically) must handle this explicitly, or the exception will propagate as an apparent bug.
- **A `contextmanager`-decorated generator must `yield` exactly once — yielding zero times or more than once raises `RuntimeError` at `with`-statement time**, a mistake that's easy to introduce by accident inside a loop or conditional inside the generator body.

## 🧠 Spot the Bug

A file-processing utility wraps cleanup logic in a custom context manager, but resources leak under certain failure conditions. Find the bug.

::code-wrapper{language="python"}
```python
from contextlib import contextmanager

@contextmanager
def open_many(paths):
    files = [open(p, encoding="utf-8") for p in paths]
    yield files
    for f in files:
        f.close()

with open_many(["a.txt", "b.txt", "c.txt"]) as files:
    for f in files:
        process(f)   # suppose process() raises on the second file
```
::

<details>
<summary>Answer</summary>

If `process(f)` raises while iterating `files` inside the `with` block, the exception propagates up through the `yield files` line inside `open_many` — but the cleanup loop (`for f in files: f.close()`) is written *after* `yield`, with no `try`/`finally` around it. Since the exception isn't caught, execution never reaches the `for f in files: f.close()` line at all — every opened file handle leaks (stays open) for the duration of the process, only eventually cleaned up (if ever) by garbage collection or process exit, not deterministically.

The fix is the same rule as any `@contextmanager`: wrap `yield` in `try`/`finally` so cleanup always runs, exception or not:
::code-wrapper{language="python"}
```python
@contextmanager
def open_many(paths):
    files = [open(p, encoding="utf-8") for p in paths]
    try:
        yield files
    finally:
        for f in files:
            f.close()
```
::

An even more robust version uses `ExitStack` so that a failure partway through *opening* the files (not just processing them) still closes whichever ones did open successfully:
::code-wrapper{language="python"}
```python
from contextlib import ExitStack, contextmanager

@contextmanager
def open_many(paths):
    with ExitStack() as stack:
        files = [stack.enter_context(open(p, encoding="utf-8")) for p in paths]
        yield files
```
::

**The lesson**: any code after a `contextmanager` generator's `yield` is only cleanup logic if it's guaranteed to run — and the only way to guarantee that in the presence of exceptions is `try`/`finally` (or delegating to `ExitStack`), exactly as with a plain function's cleanup code.

</details>

## Key Takeaways

- The iterator protocol is `__iter__` (returns an iterator) plus `__next__` (returns the next value or raises `StopIteration`) — a `for` loop is sugar for calling `iter()` once and `next()` repeatedly inside a `try`/`except StopIteration`.
- A generator is its own iterator, which is exactly why it's single-use; an iterable class whose `__iter__` returns a fresh iterator object each call is reusable across multiple `for` loops.
- `contextlib.contextmanager` turns a single generator function into a context manager — code before `yield` is `__enter__`, code after (inside `finally`) is `__exit__`; omitting the `try`/`finally` around `yield` means cleanup silently doesn't run on exceptions.
- `contextlib.ExitStack` manages a dynamic, runtime-determined number of context managers, guaranteeing all of them clean up in reverse order even if one fails partway through setup.
- `contextlib.suppress(...)` is a declarative, harder-to-accidentally-broaden alternative to `try`/`except: pass` for deliberately ignoring specific, expected exceptions.
- `itertools.tee` splits one iterator into independent ones, but only if you stop using the original iterator afterward — pulling from it directly corrupts the derived iterators' buffering.
