# 10 — Functional Programming

## Functions Are Values

::code-wrapper{language="python"}
```python
def shout(s):
    return s.upper() + "!"

ops = {"loud": shout, "quiet": str.lower}   # store functions in a dict
print(ops["loud"]("hi"))     # HI!
print(ops["quiet"]("HI"))    # hi

def apply_twice(f, x):        # take a function as an argument
    return f(f(x))

print(apply_twice(lambda n: n * 3, 2))   # 18
```
::

**Tricky**: `shout` is the function, `shout()` calls it. Forgetting `()` gives no error:

::code-wrapper{language="python"}
```python
if shout:                    # always True — a function object is truthy
    print("oops")

print(sorted(["b", "A"], key=str.lower))    # ['A', 'b'] — pass the function
# sorted(["b", "A"], key=str.lower())       # TypeError — you called it with no args
```
::

## `lambda` — One-Expression Functions

::code-wrapper{language="python"}
```python
square = lambda x: x * x
print(square(4))             # 16
print(square.__name__)       # '<lambda>' — no real name in tracebacks

pairs = [(1, "b"), (2, "a"), (1, "a")]
print(sorted(pairs, key=lambda p: p[1]))           # [(2, 'a'), (1, 'a'), (1, 'b')]
print(sorted(pairs, key=lambda p: (p[0], p[1])))   # [(1, 'a'), (1, 'b'), (2, 'a')]
print(sorted(pairs, key=lambda p: (-p[0], p[1])))  # [(2, 'a'), (1, 'a'), (1, 'b')] — desc, then asc
```
::

**Tricky**: the sort is **stable** — equal keys keep their original order. That is why `(2, 'a')` stays before `(1, 'a')` in the first result.

`max()`/`min()` return the **first** item on a tie:

::code-wrapper{language="python"}
```python
words = ["bb", "aa", "c"]
print(max(words, key=len))   # 'bb' — first of the longest
```
::

::code-wrapper{language="python"}
```python
# Discouraged — assigning a lambda to a name; just use def
bad = lambda x, y: x + y

# Preferred — a def with the same behavior gets a real name and can have a docstring
def add(x, y):
    """Return the sum of x and y."""
    return x + y
```
::

## `map`, `filter`, and Why Comprehensions Usually Win

::code-wrapper{language="python"}
```python
numbers = [1, 2, 3, 4, 5, 6]

# map — apply a function to every element (returns a lazy iterator, like a generator)
doubled = map(lambda x: x * 2, numbers)
print(list(doubled))   # [2, 4, 6, 8, 10, 12]

# filter — keep elements where the function returns truthy
evens = filter(lambda x: x % 2 == 0, numbers)
print(list(evens))       # [2, 4, 6]

# The equivalent, generally preferred, comprehension forms:
doubled_comp = [x * 2 for x in numbers]
evens_comp = [x for x in numbers if x % 2 == 0]
```
::

Python's own style guide and most experienced Python developers prefer comprehensions over `map`/`filter` with lambdas — they read left-to-right in plain English ("x times 2 for x in numbers") rather than requiring you to mentally unwrap nested function calls. `map`/`filter` remain useful when you already have a **named** function (no lambda needed) to pass directly:

::code-wrapper{language="python"}
```python
# Genuinely clean use of map — no lambda, an existing named function
strings = ["1", "2", "3"]
numbers = list(map(int, strings))
print(numbers)   # [1, 2, 3]

# Tricky: map/filter are one-shot iterators, like generators
m = map(int, strings)
print(list(m))   # [1, 2, 3]
print(list(m))   # []  ← already used up

# Tricky: filter(None, ...) removes every FALSY item, not just None
print(list(filter(None, [0, 1, "", "a", None, []])))   # [1, 'a']

# vs. the comprehension equivalent — about equally readable here
numbers_comp = [int(s) for s in strings]
```
::

## `functools.reduce` — Fold a Sequence Into a Single Value

::code-wrapper{language="python"}
```python
from functools import reduce

numbers = [1, 2, 3, 4, 5]

total = reduce(lambda acc, x: acc + x, numbers)
print(total)   # 15 — equivalent to sum(numbers), shown here for illustration

product = reduce(lambda acc, x: acc * x, numbers, 1)   # 1 is the initial accumulator
print(product)   # 120

# A more realistic use: reducing to a non-numeric structure
words = ["the", "quick", "brown", "fox"]
longest = reduce(lambda a, b: a if len(a) >= len(b) else b, words)
print(longest)   # "quick" (first of the tied-longest, due to >=)

# Edge case: empty input
# reduce(lambda a, b: a + b, [])    # TypeError: reduce() of empty iterable with no initial value
print(reduce(lambda a, b: a + b, [], 0))   # 0 — always pass an initial value
```
::

Guido van Rossum has been on record disliking `reduce` for exactly the reason shown above: nested lambda-based folds read poorly compared to an explicit loop or a purpose-built function (`sum`, `math.prod`, `max`/`min` with `key`). `reduce` was demoted from a builtin to `functools` in Python 3 for this reason. Use it when there's genuinely no built-in equivalent; otherwise prefer the specific tool (`sum`, `any`, `all`, `math.prod`).

## `functools.partial` — Pre-Filling Arguments

::code-wrapper{language="python"}
```python
from functools import partial

def power(base, exponent):
    return base ** exponent

square = partial(power, exponent=2)
cube = partial(power, exponent=3)

print(square(5))   # 25
print(cube(5))        # 125

# Real-world use: adapting a callback's signature to what an API expects
import logging

log_error = partial(logging.log, logging.ERROR)
log_error("Something broke: %s", "disk full")
```
::

`partial` is especially useful when passing callbacks into APIs (GUI frameworks, `signal.signal`, `concurrent.futures.Executor.submit`) that expect a fixed-arity callable but you need to bake in extra context without wrapping in a full `lambda` or nested `def`.

## `functools.lru_cache` — Memoization in One Line

::code-wrapper{language="python"}
```python
from functools import lru_cache
import time

@lru_cache(maxsize=None)
def fibonacci(n):
    if n < 2:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

start = time.perf_counter()
print(fibonacci(35))              # fast — cached subresults
print(f"{time.perf_counter() - start:.4f}s")

print(fibonacci.cache_info())       # CacheInfo(hits=33, misses=36, maxsize=None, currsize=36)
fibonacci.cache_clear()                # wipe the cache manually if needed
```
::

Without `@lru_cache`, naive recursive Fibonacci is O(2ⁿ) — recomputing the same subproblems exponentially many times. `lru_cache` turns it into O(n) by remembering every unique `(args) -> result` pair it has already computed, at the cost of memory proportional to the number of distinct calls (bounded by `maxsize`, or unbounded if `maxsize=None`).

### The gotcha: `lru_cache` requires hashable arguments, and ignores default-vs-explicit distinctions loosely

::code-wrapper{language="python"}
```python
@lru_cache(maxsize=None)
def process(items):
    return sum(items)

# process([1, 2, 3])   # TypeError: unhashable type: 'list'
process((1, 2, 3))       # OK — tuples are hashable
```
::

### The gotcha: caching methods on instances leaks memory

::code-wrapper{language="python"}
```python
class Report:
    def __init__(self, data):
        self.data = data

    @lru_cache(maxsize=None)         # DANGEROUS on an instance method!
    def summary(self):
        return sum(self.data)
```
::

`@lru_cache` on an instance method caches keyed on `(self, ...)` — since `self` is part of the cache key, **every distinct instance that ever calls this method stays alive forever**, held by a strong reference inside the cache, even after all other references to it are dropped. This is a real, subtle memory leak pattern seen in production code. The fix is typically to cache a module-level function that takes only hashable, non-instance arguments, or to use a bespoke per-instance cache (e.g., `functools.cached_property`, covered in chapter 15) instead.

## `functools.wraps` — Preserving Metadata Through Decorators

::code-wrapper{language="python"}
```python
from functools import wraps

def logged(func):
    @wraps(func)          # copies __name__, __doc__, __module__ from func onto wrapper
    def wrapper(*args, **kwargs):
        print(f"Calling {func.__name__}")
        return func(*args, **kwargs)
    return wrapper

@logged
def greet(name):
    """Return a greeting."""
    return f"Hello, {name}!"

print(greet.__name__)   # "greet" — WITH @wraps
print(greet.__doc__)      # "Return a greeting." — WITH @wraps

# Without @wraps, both would incorrectly report "wrapper" and None respectively —
# breaking introspection, help(), and any tooling that inspects function metadata.
```
::

Chapter 11 covers writing decorators from scratch in depth; `@wraps` is introduced here because it's a `functools` tool, and omitting it is one of the most common decorator-authoring mistakes.

## Higher-Order Functions and Function Composition

::code-wrapper{language="python"}
```python
def compose(*functions):
    def composed(x):
        for f in reversed(functions):
            x = f(x)
        return x
    return composed

add_one = lambda x: x + 1
double = lambda x: x * 2

pipeline = compose(double, add_one)   # double(add_one(x)) — right-to-left, math convention
print(pipeline(5))   # double(add_one(5)) = double(6) = 12
```
::

Python doesn't have a built-in `compose`, unlike some functional languages — this pattern is hand-rolled or imported from third-party libraries (`toolz`, `funcy`) when a codebase leans heavily functional.

## 💡 Tips & Tricks

- **Prefer named functions over lambdas the moment logic exceeds one clear expression** — the improved traceback (`greet` instead of `<lambda>`), docstring support, and testability of `def` outweigh the brevity of `lambda` past trivial cases.
- **`operator` module functions replace common lambdas in `key=`/`reduce`** — `sorted(people, key=operator.itemgetter("age"))` and `reduce(operator.mul, numbers, 1)` avoid lambda overhead and read as clearly (often more so) than the lambda equivalent.
- **`math.prod` replaces the classic `reduce(lambda a, b: a*b, ...)` idiom** — since Python 3.8, use the built-in for products the same way `sum()` has always existed for sums.
- **`functools.cache` (3.9+) is `lru_cache(maxsize=None)` spelled shorter** — use it for unbounded memoization when you don't need to tune eviction.
- **Check `.cache_info()` on suspiciously slow cached functions** — a low hit ratio (`hits` much smaller than `misses`) usually means the arguments aren't actually repeating, and `lru_cache` is providing no benefit while still paying memory/hashing overhead.

## ⚠️ Edge Cases & Gotchas

- **`lambda` bodies can only be a single expression — no statements, no multiple lines of logic** — attempting `if`/`for`/assignment as statements inside a lambda is a `SyntaxError`; only the ternary conditional *expression* form is legal.
- **`@lru_cache` on instance methods keeps every instance that's ever called it alive forever** — because `self` is part of the cache key and the cache holds a strong reference, this is a real memory leak in long-running processes (web servers, workers) — prefer module-level cached functions or `functools.cached_property` for per-instance caching.
- **`lru_cache`/`cache` require ALL arguments to be hashable** — passing a `list`, `dict`, or `set` argument raises `TypeError: unhashable type`, which surprises developers who don't think of "cacheability" and "hashability" as the same constraint.
- **`map`/`filter` return lazy iterators in Python 3 (unlike Python 2, where they returned lists)** — `map(f, data)` must be wrapped in `list(...)` to materialize or iterated directly; passing the raw `map` object where a list is expected (e.g., checking `len()`) fails.
- **Closures inside `functools.partial`-wrapped or lambda-based loop bodies inherit the same late-binding trap as chapter 05's closures** — `partial` bakes in argument *values* at the time you call `partial(...)` (so it does NOT suffer late binding), but a `lambda` created fresh inside a loop still does — don't confuse the two just because both "capture" something.

## 🧠 Spot the Bug

A report generator caches expensive computations per-report-object. Why does memory usage keep climbing in a long-running service that generates thousands of reports?

::code-wrapper{language="python"}
```python
from functools import lru_cache

class Report:
    def __init__(self, report_id, rows):
        self.report_id = report_id
        self.rows = rows

    @lru_cache(maxsize=128)
    def total(self):
        return sum(row["amount"] for row in self.rows)

def generate_report(report_id, rows):
    report = Report(report_id, rows)
    return report.total()
```
::

<details>
<summary>Answer</summary>

Every call to `generate_report` creates a brand-new `Report` instance and calls `.total()` on it exactly once — there's no realistic reuse to memoize. But `@lru_cache` on the `total` method caches by `(self, )` as the key, and the cache holds a **strong reference** to each `Report` instance it has ever seen, up to `maxsize=128` entries — meaning up to 128 `Report` objects (and everything they transitively reference, including potentially large `rows` lists) are kept alive indefinitely, purely because they're pinned inside the cache's internal dict, long after `generate_report` has returned and any other reference to `report` has gone out of scope.

The fix: don't cache instance methods that are called once per instance — either remove the cache entirely (there's no repeated call to memoize), or cache a free function keyed on hashable, meaningful arguments (e.g., `report_id` if totals are genuinely re-requested for the same id), not `self`.

**The lesson**: `@lru_cache` caching `self` as part of its key is only safe when instances are long-lived and genuinely reused across many calls — otherwise it silently converts a per-call cache into a memory leak, since the cache is what keeps those "one-off" instances from ever being garbage collected.

</details>

## Key Takeaways

- Functions are first-class objects in Python — they can be stored, passed, and returned like any other value, which is the foundation for all functional-style code.
- `lambda` is restricted to a single expression; reach for a named `def` the moment logic needs more than one line or a docstring.
- Prefer list/dict/set comprehensions over `map`/`filter` with lambdas for readability — but `map`/`filter` remain clean when passing an existing named function with no lambda needed.
- `functools.partial` pre-fills arguments; `functools.lru_cache`/`cache` memoizes pure functions — but never cache instance methods keyed on `self` unless the instances are meant to be long-lived, or you'll create a silent memory leak.
- Always apply `@functools.wraps(func)` inside a decorator's inner wrapper — otherwise you lose the wrapped function's `__name__`, `__doc__`, and introspectability.
