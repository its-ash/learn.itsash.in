# 09 — Comprehensions & Generators

## The Four Comprehension Forms

Python has four comprehension syntaxes, all sharing the same `for ... if ...` grammar but producing different container types.

::code-wrapper{language="python"}
```python
# List comprehension — eager, builds a full list in memory
squares_list = [x ** 2 for x in range(5)]
print(squares_list)          # [0, 1, 4, 9, 16]
print(type(squares_list))      # <class 'list'>

# Set comprehension — eager, deduplicates
remainders_set = {x % 3 for x in range(10)}
print(remainders_set)            # {0, 1, 2}
print(type(remainders_set))        # <class 'set'>

# Dict comprehension — eager, key: value pairs
squares_dict = {x: x ** 2 for x in range(5)}
print(squares_dict)                  # {0: 0, 1: 1, 2: 4, 3: 9, 4: 16}
print(type(squares_dict))              # <class 'dict'>

# Generator expression — LAZY, produces values on demand, uses () not []
squares_gen = (x ** 2 for x in range(5))
print(type(squares_gen))                 # <class 'generator'>
print(list(squares_gen))                   # [0, 1, 4, 9, 16] — must consume to see values
print(list(squares_gen))                     # [] — ALREADY EXHAUSTED, can't reuse!
```
::

**The critical distinction**: list/set/dict comprehensions are **eager** — they run to completion immediately and hold every result in memory. A generator expression is **lazy** — it produces one value at a time, on demand, and is a **single-use iterator** that can't be restarted once consumed.

## Nested Comprehensions and Multiple Clauses

::code-wrapper{language="python"}
```python
# Multiple `for` clauses — equivalent to nested loops, left-to-right
pairs = [(x, y) for x in range(3) for y in range(2)]
print(pairs)   # [(0, 0), (0, 1), (1, 0), (1, 1), (2, 0), (2, 1)]

# Equivalent nested-loop form, for comparison:
pairs_manual = []
for x in range(3):
    for y in range(2):
        pairs_manual.append((x, y))
assert pairs == pairs_manual

# Multiple `if` clauses — combined with implicit AND
filtered = [x for x in range(50) if x % 2 == 0 if x % 3 == 0]
print(filtered)   # [0, 6, 12, 18, 24, 30, 36, 42, 48] — divisible by BOTH 2 and 3

# A truly nested comprehension (comprehension INSIDE a comprehension)
matrix = [[1, 2, 3], [4, 5, 6]]
transposed = [[row[i] for row in matrix] for i in range(3)]
print(transposed)   # [[1, 4], [2, 5], [3, 6]]
```
::

**Best practice**: comprehensions with more than 2 `for` clauses or nested conditionals rapidly become unreadable — at that point, a plain `for` loop (or breaking into a named helper function) is more maintainable than cramming logic into one expression. Comprehensions are for clarity, not for code-golf.

## Generator Functions and `yield`

A function containing `yield` becomes a **generator function** — calling it doesn't run the body; it returns a generator object. Execution happens lazily, one `yield` at a time, pausing and resuming state between calls.

::code-wrapper{language="python"}
```python
def count_up_to(n):
    print("starting")
    i = 1
    while i <= n:
        yield i          # pauses here, returns i, resumes on next()
        i += 1
    print("finished")

gen = count_up_to(3)
print(gen)                 # <generator object count_up_to at 0x...> — NOTHING printed yet!

print(next(gen))             # prints "starting", then returns 1
print(next(gen))               # returns 2 (resumes right after the yield)
print(next(gen))                 # returns 3
print(next(gen))                   # prints "finished", then raises StopIteration
```
::

This lazy, resumable execution is fundamentally different from a normal function, which runs top-to-bottom in one shot and has no persistent state between calls.

### Real-world use: processing data too large to fit in memory

::code-wrapper{language="python"}
```python
def read_large_log(path):
    """Yield one parsed line at a time — never loads the whole file into memory."""
    with open(path, encoding="utf-8") as f:
        for line in f:
            if "ERROR" in line:
                yield line.strip()

# Even a 50GB log file works fine — only one line is in memory at a time
for error_line in read_large_log("app.log"):
    print(error_line)
```
::

Compare to the eager alternative, which would load the entire file into a list before processing anything:

::code-wrapper{language="python"}
```python
def read_large_log_eager(path):
    with open(path, encoding="utf-8") as f:
        lines = f.readlines()          # ENTIRE file in memory at once
    return [line.strip() for line in lines if "ERROR" in line]
```
::

## `yield from` — Delegating to a Sub-Generator

::code-wrapper{language="python"}
```python
def inner():
    yield 1
    yield 2
    yield 3

def outer():
    yield "start"
    yield from inner()     # delegates — yields 1, 2, 3 as if outer produced them directly
    yield "end"

print(list(outer()))   # ['start', 1, 2, 3, 'end']
```
::

`yield from` is more than sugar for a manual loop — it also correctly forwards `.send()`, `.throw()`, and the sub-generator's return value, which a naive `for x in inner(): yield x` does not.

::code-wrapper{language="python"}
```python
def flatten(nested):
    for item in nested:
        if isinstance(item, list):
            yield from flatten(item)    # recursive delegation
        else:
            yield item

data = [1, [2, 3, [4, 5]], 6, [7, [8, [9]]]]
print(list(flatten(data)))   # [1, 2, 3, 4, 5, 6, 7, 8, 9]
```
::

## Generators Are Single-Use — The Trap

::code-wrapper{language="python"}
```python
def get_evens(n):
    for i in range(n):
        if i % 2 == 0:
            yield i

evens = get_evens(10)
print(sum(evens))     # 20  (0+2+4+6+8)
print(sum(evens))       # 0  — ALREADY EXHAUSTED! Not an error, just silently empty.
print(list(evens))        # []
```
::

**This is a genuinely dangerous trap**: iterating an exhausted generator raises no error and no warning — it simply produces zero items, silently. Code that assumes a generator can be iterated multiple times (like a list) will not crash; it will quietly compute wrong results (sums of zero, empty result sets) that can slip through code review and testing if the test only checks the first consumption.

::code-wrapper{language="python"}
```python
# WRONG — reuses a generator expression across two consumptions
def process(data):
    filtered = (x for x in data if x > 0)
    total = sum(filtered)
    count = sum(1 for _ in filtered)   # filtered is ALREADY exhausted — count is always 0!
    return total, count

print(process([1, -2, 3, -4, 5]))   # (9, 0)  — count is wrong!

# RIGHT — materialize once if you need multiple passes, or recompute
def process_fixed(data):
    filtered = [x for x in data if x > 0]   # a LIST — reusable
    total = sum(filtered)
    count = len(filtered)
    return total, count

print(process_fixed([1, -2, 3, -4, 5]))   # (9, 3) — correct
```
::

## `itertools` — The Standard Library's Generator Toolkit

::code-wrapper{language="python"}
```python
import itertools

# chain — iterate multiple iterables as one, without concatenating them
for x in itertools.chain([1, 2], [3, 4], [5]):
    print(x, end=" ")   # 1 2 3 4 5
print()

# islice — slice a generator/iterator (regular slicing doesn't work on generators!)
gen = (x ** 2 for x in range(100))
first_five = list(itertools.islice(gen, 5))
print(first_five)   # [0, 1, 4, 9, 16]

# groupby — group CONSECUTIVE equal elements (requires pre-sorted input!)
data = [("fruit", "apple"), ("fruit", "banana"), ("veg", "carrot")]
for key, group in itertools.groupby(data, key=lambda x: x[0]):
    print(key, list(group))
# fruit [('fruit', 'apple'), ('fruit', 'banana')]
# veg [('veg', 'carrot')]

# product — cartesian product, replaces nested for loops
for combo in itertools.product([1, 2], ["a", "b"]):
    print(combo, end=" ")   # (1, 'a') (1, 'b') (2, 'a') (2, 'b')
print()

# permutations / combinations
print(list(itertools.permutations([1, 2, 3], 2)))
# [(1, 2), (1, 3), (2, 1), (2, 3), (3, 1), (3, 2)]
print(list(itertools.combinations([1, 2, 3], 2)))
# [(1, 2), (1, 3), (2, 3)]

# count, cycle, repeat — INFINITE iterators, always pair with islice/break/zip
counter = itertools.count(start=10, step=5)
print(list(itertools.islice(counter, 4)))   # [10, 15, 20, 25]
```
::

### The `groupby` gotcha: it only groups adjacent elements

::code-wrapper{language="python"}
```python
import itertools

# WRONG assumption: groupby groups ALL matching elements, like SQL GROUP BY
data = ["apple", "banana", "avocado", "blueberry"]   # NOT sorted by first letter!
for key, group in itertools.groupby(data, key=lambda w: w[0]):
    print(key, list(group))
# a ['apple']
# b ['banana']
# a ['avocado']       <- a NEW "a" group, because it's not adjacent to the first!
# b ['blueberry']

# RIGHT — sort first if you want true "all items with this key" grouping
for key, group in itertools.groupby(sorted(data, key=lambda w: w[0]), key=lambda w: w[0]):
    print(key, list(group))
# a ['apple', 'avocado']
# b ['banana', 'blueberry']
```
::

## Generator Expressions vs List Comprehensions — When to Use Which

::code-wrapper{language="python"}
```python
# When the result is consumed ONCE and immediately (sum, max, any, all, join) —
# use a generator expression, saves memory, no intermediate list ever built
total = sum(x ** 2 for x in range(1_000_000))     # note: no extra parens needed
                                                      # when it's the sole function argument

# When you need to iterate multiple times, index into it, or call len() —
# use a list comprehension, you need the materialized container
squares = [x ** 2 for x in range(10)]
print(squares[3])       # works — lists support indexing
print(len(squares))       # works — lists support len()

# gen = (x ** 2 for x in range(10))
# gen[3]        # TypeError: 'generator' object is not subscriptable
# len(gen)        # TypeError: object of type 'generator' has no len()
```
::

## `send()` — Two-Way Communication with Generators (Advanced)

Generators can receive values, not just produce them, via `.send()`. This underpins the pre-`async`/`await` coroutine style still occasionally seen in older codebases.

::code-wrapper{language="python"}
```python
def running_average():
    total = 0
    count = 0
    average = None
    while True:
        value = yield average    # yields the CURRENT average, receives the NEXT value
        total += value
        count += 1
        average = total / count

avg_gen = running_average()
next(avg_gen)               # "prime" the generator — advances to the first yield
print(avg_gen.send(10))       # 10.0
print(avg_gen.send(20))         # 15.0
print(avg_gen.send(30))           # 20.0
```
::

Generators must be **primed** with an initial `next()` before the first `.send()` — sending a value to a freshly-created, un-primed generator raises `TypeError: can't send non-None value to a just-started generator`, because there's no `yield` expression yet waiting to receive it.

## 💡 Tips & Tricks

- **`any()`/`all()` short-circuit — pair them with generator expressions for early exit** — `any(x > 100 for x in huge_iterable)` stops at the first `True`, never materializing the rest of the sequence; using a list comprehension there would waste time and memory building results you'll immediately discard.
- **`sum()`, `max()`, `min()`, `sorted()` all accept a generator expression directly, no extra parens needed as the sole argument** — `max(len(w) for w in words)` is valid; you only need explicit parens `max((len(w) for w in words), default=0)` when passing additional arguments like `default`.
- **Generator functions are the idiomatic way to make a class iterable** — defining `__iter__` as a generator function (`def __iter__(self): yield from self._items`) is simpler than manually implementing `__next__` and tracking state — covered fully in chapter 14 and 19.
- **`itertools.islice` is how you "slice" an infinite or large generator** — regular slice syntax (`gen[:5]`) doesn't work on generators; `itertools.islice(gen, 5)` does, and works even on infinite generators like `itertools.count()`.
- **Generator expressions inside function calls don't need double parentheses** — `sum(x for x in range(10))` not `sum((x for x in range(10)))` — the outer call parens double as the generator's parens when it's the only argument.

## ⚠️ Edge Cases & Gotchas

- **Generators are single-use — exhausting one silently yields nothing on further iteration, with no error** — this is the most dangerous gotcha in this chapter because it fails silently rather than raising; always materialize to a list first if you need more than one pass over the data.
- **`itertools.groupby` only groups *consecutive* matching elements, not all elements sharing a key** — it is not a `GROUP BY`; forgetting to sort the input first produces multiple small groups with duplicate keys scattered throughout the output instead of one group per key.
- **Infinite iterators (`itertools.count`, `itertools.cycle`, `itertools.repeat()` with no `times`) will hang a program forever if not paired with `islice`, `break`, `zip` against a finite iterable, or a manual counter** — a bare `for x in itertools.count(): print(x)` never terminates.
- **A generator's local variables are only garbage-collected once the generator is exhausted, `.close()`d, or falls out of scope** — a generator paused mid-iteration (never exhausted, never explicitly closed, still referenced) keeps its entire local stack frame — including any open file handles or large local variables — alive indefinitely; wrap generator-based file readers in `with` blocks inside the generator body so cleanup happens even on early `.close()`/garbage collection via `GeneratorExit`.
- **Priming is required before the first `.send()`, but not before the first `next()`** — calling `.send(value)` (with a non-`None` value) on a freshly created, never-advanced generator raises `TypeError`; you must call `next(gen)` (or `gen.send(None)`, equivalent) once first to advance it to its first `yield` expression.

## 🧠 Spot the Bug

A data pipeline function looks correct but produces wrong statistics in production. What's wrong?

::code-wrapper{language="python"}
```python
def get_valid_readings(sensor_data):
    return (reading for reading in sensor_data if reading is not None and reading >= 0)

def analyze(sensor_data):
    valid = get_valid_readings(sensor_data)
    total = sum(valid)
    count = sum(1 for _ in valid)
    average = total / count if count else 0
    return {"total": total, "count": count, "average": average}

print(analyze([10, None, 20, -5, 30]))
```
::

<details>
<summary>Answer</summary>

Prints `{'total': 60, 'count': 0, 'average': 0}` — `count` is wrong, and the ZeroDivisionError is only avoided by luck (the `if count else 0` guard). `get_valid_readings` returns a generator expression, which is consumed entirely by the first `sum(valid)` call. By the time `sum(1 for _ in valid)` runs, `valid` is already exhausted, so it iterates zero remaining items and returns `0`.

The fix is to materialize the filtered readings once into a list, then compute both statistics from that reusable list:
::code-wrapper{language="python"}
```python
def analyze(sensor_data):
    valid = list(get_valid_readings(sensor_data))
    total = sum(valid)
    count = len(valid)
    average = total / count if count else 0
    return {"total": total, "count": count, "average": average}
```
::

**The lesson**: a generator is not a reusable "view" of data — it's a one-shot iterator. Any function or pipeline stage that needs to make more than one pass over the same generator's output must materialize it into a list (or use `itertools.tee` if the two consumers must run in lockstep and the data may be too large to fully materialize).

</details>

## Key Takeaways

- List/set/dict comprehensions are eager and build a full container immediately; generator expressions (parens instead of brackets) are lazy and produce one value at a time on demand.
- `yield` turns a function into a generator factory — calling it returns a paused generator object; nothing in the body runs until you iterate or call `next()`.
- Generators are single-use: once exhausted, further iteration silently yields nothing (no error) — materialize to a list with `list(gen)` if you need multiple passes.
- `yield from` delegates to a sub-generator/iterable, correctly forwarding values, exceptions, and return values — prefer it over a manual `for x in sub: yield x` loop, especially for recursive generators.
- `itertools` provides efficient, lazy building blocks (`chain`, `islice`, `groupby`, `product`, `count`) — remember `groupby` only merges *consecutive* equal keys, so sort first if you want true grouping.
