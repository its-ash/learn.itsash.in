# 14 — Magic Methods & Protocols

## Production-Grade Numeric Class — Full Operator Protocol

::code-wrapper{language="python"}
```python
# ── A production Vector class implementing the full numeric protocol ──
# Demonstrates __repr__, __eq__, __hash__, __add__, __radd__, __mul__,
# __rmul__, __neg__, __abs__, __bool__, and iteration — the complete set
# needed for a value type to behave like a first-class numeric citizen.

import math
from functools import total_ordering

class Vector:
    """2D vector with full operator support, hashing, and iteration."""

    __slots__ = ("_x", "_y")   # no __dict__ — saves ~40% memory per instance

    def __init__(self, x: float, y: float):
        self._x = float(x)
        self._y = float(y)

    # ── Representation: __repr__ for debugging, __str__ for display ──
    def __repr__(self) -> str:
        # Should be unambiguous — ideally eval-able: Vector(repr(v)) == v
        return f"Vector({self._x!r}, {self._y!r})"

    def __str__(self) -> str:
        return f"({self._x:.2f}, {self._y:.2f})"

    # ── Property access: read-only via slots, no setter needed ──
    @property
    def x(self) -> float:
        return self._x

    @property
    def y(self) -> float:
        return self._y

    # ── Equality and hashing: MUST be consistent (a == b ⟹ hash(a) == hash(b)) ──
    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Vector):
            return NotImplemented   # NOT False — lets Python try other.__eq__(self)
        return self._x == other._x and self._y == other._y

    def __hash__(self) -> int:
        # Hash MUST use the same fields as __eq__ — if x/y change, hash must change
        # Since __slots__ + no setter = immutable, this is safe
        return hash((self._x, self._y))

    # ── Arithmetic: __add__ + __radd__ for commutative addition ──
    def __add__(self, other: "Vector") -> "Vector":
        if not isinstance(other, Vector):
            return NotImplemented   # lets Python try other.__radd__(self)
        return Vector(self._x + other._x, self._y + other._y)

    def __radd__(self, other: "Vector") -> "Vector":
        # Called when `other + self` fails (other doesn't know about Vector)
        # For commutative ops, just delegate to __add__
        return self.__add__(other)

    # ── Scalar multiplication: __mul__ (vec * scalar) + __rmul__ (scalar * vec) ──
    def __mul__(self, scalar: float) -> "Vector":
        if not isinstance(scalar, (int, float)):
            return NotImplemented
        return Vector(self._x * scalar, self._y * scalar)

    def __rmul__(self, scalar: float) -> "Vector":
        return self.__mul__(scalar)   # scalar * vec == vec * scalar

    def __neg__(self) -> "Vector":
        return Vector(-self._x, -self._y)

    # ── Built-in function integration ──
    def __abs__(self) -> float:
        return math.hypot(self._x, self._y)   # math.hypot avoids overflow for large values

    def __bool__(self) -> bool:
        return bool(self._x) or bool(self._y)  # zero vector is falsy

    def __iter__(self):
        # Enables unpacking: x, y = vector
        yield self._x
        yield self._y

    def __len__(self) -> int:
        return 2   # dimensionality — enables len(vec)

# ── Usage: the Vector now behaves like a built-in numeric type ──
v1 = Vector(3, 4)
v2 = Vector(1, 2)

print(v1 + v2)         # Vector(4.0, 6.0) — __add__
print(v1 * 2)          # Vector(6.0, 8.0) — __mul__
print(2 * v1)          # Vector(6.0, 8.0) — __rmul__ (int.__mul__ fails, falls back)
print(-v1)             # Vector(-3.0, -4.0) — __neg__
print(abs(v1))         # 5.0 — __abs__ via math.hypot
print(bool(Vector(0, 0)))  # False — zero vector is falsy
print(v1 == Vector(3, 4))  # True — __eq__

# Hashable → usable as dict keys and set members
points = {v1: "origin-ref", v2: "other"}
print(points[Vector(3, 4)])  # "origin-ref" — found via __hash__ + __eq__

# Iterable → unpacking works
x, y = v1
print(x, y)   # 3.0 4.0
```
::

## Equality and Hashing: `__eq__` and `__hash__`

::code-wrapper{language="python"}
```python
class Point:
    def __init__(self, x, y):
        self.x, self.y = x, y

    def __repr__(self):
        return f"Point({self.x}, {self.y})"

    def __eq__(self, other):
        if not isinstance(other, Point):
            return NotImplemented        # not False! lets Python try other.__eq__(self)
        return self.x == other.x and self.y == other.y

p1, p2 = Point(1, 2), Point(1, 2)
print(p1 == p2)      # True — uses __eq__
print(p1 is p2)         # False — different objects in memory

s = {p1}
# print(p2 in s)      # TypeError: unhashable type: 'Point'
```
::

Defining `__eq__` **without** `__hash__` makes instances unhashable — Python sets `__hash__` to `None` automatically in that case, because the default identity-based hash would violate the fundamental invariant that equal objects must have equal hashes (needed for correct dict/set behavior).

::code-wrapper{language="python"}
```python
class Point:
    def __init__(self, x, y):
        self.x, self.y = x, y

    def __eq__(self, other):
        return isinstance(other, Point) and (self.x, self.y) == (other.x, other.y)

    def __hash__(self):
        return hash((self.x, self.y))     # MUST be consistent with __eq__

p1, p2 = Point(1, 2), Point(1, 2)
s = {p1}
print(p2 in s)   # True — same hash, and __eq__ agrees they're equal
```
::

**Critical invariant**: if `a == b`, then `hash(a) == hash(b)` must also hold — violating this silently corrupts dict/set lookups (an object can appear "missing" from a set it's actually logically equal to a member of), producing bugs that only manifest under specific hash-bucket collisions and are notoriously hard to reproduce.

### Never make a mutable object hashable on mutable fields

::code-wrapper{language="python"}
```python
class BadBag:
    def __init__(self, items):
        self.items = items                # a MUTABLE list

    def __eq__(self, other):
        return self.items == other.items

    def __hash__(self):
        return hash(tuple(self.items))    # hash depends on MUTABLE state

bag = BadBag([1, 2, 3])
s = {bag}
print(bag in s)   # True

bag.items.append(4)    # mutate AFTER inserting into the set
print(bag in s)   # False! — its hash changed, so the set looks in the WRONG bucket
print(s)   # still contains the (now-unreachable) bag
```
::

This is a genuinely dangerous, silent-corruption bug: the object is still physically in the set (iterating `s` shows it), but membership tests and further set operations behave incorrectly because the object no longer hashes to the bucket it was stored under. **Rule**: only make a class hashable if its fields used in `__eq__`/`__hash__` are effectively immutable for the object's lifetime.

## Container Protocols: `__len__`, `__getitem__`, `__contains__`

::code-wrapper{language="python"}
```python
class Deck:
    def __init__(self):
        self.cards = [f"{rank}{suit}" for suit in "SHDC" for rank in "23456789TJQKA"]

    def __len__(self):
        return len(self.cards)

    def __getitem__(self, index):
        return self.cards[index]      # also enables slicing, `in`, and iteration for free!

deck = Deck()
print(len(deck))          # 52
print(deck[0])               # "2S"
print(deck[-1])                 # "AC"
print(deck[:3])                    # ['2S', '3S', '4S'] — slicing works automatically
print("AC" in deck)                   # True — falls back to linear __getitem__ scan
for card in deck[:2]:
    print(card)                          # iteration ALSO falls back to __getitem__(0), (1), ... until IndexError
```
::

Implementing just `__getitem__` gives you `for`, `in`, slicing, and `reversed()` almost for free, because Python's iteration protocol falls back to repeatedly calling `__getitem__(0)`, `__getitem__(1)`, ... until `IndexError` is raised, if `__iter__` isn't defined. This is a legacy fallback (pre-dates the formal iterator protocol) — for anything beyond a simple sequence, define `__iter__` explicitly (see chapter 19).

## Making an Object Iterable: `__iter__`

::code-wrapper{language="python"}
```python
class Countdown:
    def __init__(self, start):
        self.start = start

    def __iter__(self):
        n = self.start
        while n > 0:
            yield n            # __iter__ as a generator function — simplest way to implement it
            n -= 1

for i in Countdown(3):
    print(i)   # 3 2 1

print(list(Countdown(5)))   # [5, 4, 3, 2, 1]
print(list(Countdown(5)))     # [5, 4, 3, 2, 1] — a NEW generator each time __iter__ is called, reusable!
```
::

Unlike a bare generator object (chapter 09), a class implementing `__iter__` as a generator function is reusable across multiple `for` loops — each call to `iter(obj)` (which `for` does implicitly) invokes `__iter__` fresh, producing a brand-new generator each time.

## Operator Overloading

::code-wrapper{language="python"}
```python
class Vector:
    def __init__(self, x, y):
        self.x, self.y = x, y

    def __repr__(self):
        return f"Vector({self.x}, {self.y})"

    def __add__(self, other):
        return Vector(self.x + other.x, self.y + other.y)

    def __sub__(self, other):
        return Vector(self.x - other.x, self.y - other.y)

    def __mul__(self, scalar):
        return Vector(self.x * scalar, self.y * scalar)

    def __rmul__(self, scalar):            # handles scalar * vector (reflected operand order)
        return self.__mul__(scalar)

    def __neg__(self):
        return Vector(-self.x, -self.y)

    def __eq__(self, other):
        return isinstance(other, Vector) and (self.x, self.y) == (other.x, other.y)

v1, v2 = Vector(1, 2), Vector(3, 4)
print(v1 + v2)     # Vector(4, 6)
print(v1 - v2)       # Vector(-2, -2)
print(v1 * 3)          # Vector(3, 6)   — calls v1.__mul__(3)
print(3 * v1)             # Vector(3, 6)   — v1.__mul__ doesn't apply (int has no __mul__ for Vector),
                            # so Python tries v1.__rmul__(3) instead
print(-v1)                   # Vector(-1, -2)
```
::

`__rmul__` (and `__radd__`, `__rsub__`, etc.) exist because `a * b` first tries `a.__mul__(b)`; if that returns `NotImplemented` (or doesn't exist), Python tries `b.__rmul__(a)` as a fallback — this is how `3 * v1` works even though `int.__mul__` has no idea what a `Vector` is.

## Context Managers: `__enter__` and `__exit__`

::code-wrapper{language="python"}
```python
import time

class Timer:
    def __enter__(self):
        self.start = time.perf_counter()
        return self               # the value bound to `as` in `with ... as x`

    def __exit__(self, exc_type, exc_value, traceback):
        self.elapsed = time.perf_counter() - self.start
        print(f"Elapsed: {self.elapsed:.4f}s")
        return False               # False (or None) means: don't suppress exceptions

with Timer() as t:
    total = sum(range(10_000_000))
print(t.elapsed)   # accessible after the block too, since `t` is still in scope
```
::

`__exit__` receives exception info (type, value, traceback) if the `with` block raised — returning a truthy value from `__exit__` **suppresses** the exception (as if it never happened), which is powerful but dangerous if done carelessly.

::code-wrapper{language="python"}
```python
class SuppressValueError:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        if exc_type is ValueError:
            print(f"Suppressed: {exc_value}")
            return True         # True = swallow the ValueError, execution continues after the `with`
        return False              # any other exception propagates normally

with SuppressValueError():
    print("before")
    int("not a number")             # raises ValueError
    print("never reached")

print("after the with block")   # this DOES run — exception was suppressed
```
::

**Best practice**: only suppress exceptions in `__exit__` for a very specific, documented, narrow exception type — silently swallowing broad exception categories hides real bugs, exactly like a bare `except:` does (chapter 16).

### The database-connection pattern

::code-wrapper{language="python"}
```python
class DatabaseConnection:
    def __init__(self, dsn):
        self.dsn = dsn
        self.connection = None

    def __enter__(self):
        print(f"Connecting to {self.dsn}")
        self.connection = object()    # placeholder for a real connection
        return self.connection

    def __exit__(self, exc_type, exc_value, traceback):
        print("Closing connection")
        self.connection = None        # cleanup runs even if the block raised
        return False

with DatabaseConnection("postgres://localhost/app") as conn:
    print("Running query")
    # raise RuntimeError("query failed")   # __exit__ STILL runs cleanup, then re-raises
```
::

`__exit__` is guaranteed to run whether the block completes normally, returns early, or raises — this is the object-oriented equivalent of `try`/`finally`, and is exactly what `with open(...)` uses under the hood to guarantee file handles get closed.

## `__call__` — Making Instances Callable

::code-wrapper{language="python"}
```python
class Multiplier:
    def __init__(self, factor):
        self.factor = factor

    def __call__(self, x):
        return x * self.factor

double = Multiplier(2)
print(double(5))         # 10 — double(...) is sugar for double.__call__(5)
print(callable(double))    # True
print(callable(5))           # False — plain objects aren't callable by default
```
::

This is the mechanism behind class-based decorators (chapter 11) and any "configured function object" pattern — anywhere a plain function is expected, an instance with `__call__` works identically.

## 💡 Tips & Tricks

- **Idiom**: return `NotImplemented` (not `False` or raising `TypeError`) from `__eq__`/`__lt__`/etc. when comparing against an incompatible type — this lets Python fall back to trying the other operand's reflected method instead of prematurely deciding the objects aren't equal.
- **Debug**: `object.__repr__` (the default, unhelpful `<ClassName object at 0x...>`) is what you get whenever `__repr__` is missing — seeing that format in a traceback or log is an immediate signal to add a `__repr__` to that class.
- **Idiom**: `functools.total_ordering` fills in `__le__`, `__gt__`, `__ge__` automatically once you define `__eq__` and just one of `__lt__`/`__le__`/`__gt__`/`__ge__` — saves writing four nearly-identical comparison methods by hand.
- **Performance**: `__slots__` (chapter 15) and `__eq__`/`__hash__` interact subtly — a `__slots__` class with no `__dict__` still supports `__eq__`/`__hash__` normally, since those are defined on the class, not stored per-instance.
- **Debug**: `contextlib.contextmanager` (chapter 19) lets you write a context manager as a single generator function instead of a class with `__enter__`/`__exit__` — reach for it when the class-based ceremony feels like overkill for simple setup/teardown.

## ⚠️ Edge Cases & Gotchas

- **Defining `__eq__` without `__hash__` makes instances unhashable** — Python automatically sets `__hash__ = None` on any class that defines `__eq__` but not `__hash__`, because the default identity-based hash would violate the "equal objects must hash equally" contract; this silently breaks `set`/`dict` usage of that class until `__hash__` is explicitly defined too.
- **Hashing a mutable object on fields that later change corrupts its position in any set/dict it's already stored in** — the object remains physically present but becomes unfindable via `in`/`[]` because its current hash no longer matches the bucket it was inserted under; never make `__hash__` depend on fields that can mutate after insertion.
- **Returning a truthy value from `__exit__` suppresses ANY exception raised in the `with` block, not just ones you intended to catch** — a careless `return True` (instead of only returning `True` after checking `exc_type`) silently swallows every exception, including ones signaling real bugs (`KeyError`, `TypeError` from a typo) that should have propagated.
- **`__radd__`/`__rmul__`/etc. are only tried if the left operand's corresponding method returns `NotImplemented` or doesn't exist — not simply "whenever the right operand also defines it"** — if the left operand's `__add__` happens to accept anything (e.g., via duck typing) and doesn't raise, `__radd__` on the right operand never gets a chance to run.
- **A class implementing only `__getitem__` (no `__iter__`) supports iteration via a legacy fallback that calls `__getitem__(0)`, `__getitem__(1)`, ... until `IndexError`** — this silently breaks for objects using non-integer or non-sequential keys (like a dict-backed mapping), where indexing by `0`, `1`, `2`... raises `KeyError` instead of the `IndexError` the fallback protocol specifically expects, crashing iteration instead of stopping cleanly.

## 🧠 Spot the Bug

A caching layer stores computed results keyed by a custom `CacheKey` object. Cache lookups intermittently fail to find entries that were definitely inserted. Find the bug.

::code-wrapper{language="python"}
```python
class CacheKey:
    def __init__(self, params):
        self.params = params      # a dict of parameters

    def __eq__(self, other):
        return self.params == other.params

    def __hash__(self):
        return hash(tuple(sorted(self.params.items())))

cache = {}
key = CacheKey({"user_id": 42, "page": 1})
cache[key] = "cached result"

key.params["page"] = 2      # params mutated after being used as a cache key
print(cache.get(CacheKey({"user_id": 42, "page": 2})))
print(len(cache))
```
::

<details>
<summary>Answer</summary>

Prints `None` (lookup miss) and `1` (the entry is still there, just unreachable). `CacheKey.__hash__` is computed from `self.params`, which is a **mutable dict** — after `key.params["page"] = 2`, `key`'s hash value changes. But the dict `cache` already placed `key` into a bucket based on its *original* hash (with `page: 1`). Python's dict now looks for a lookup key with `page: 2` in a *different* bucket than where the mutated `key` actually lives, so it finds nothing — even though, logically, `key` now has exactly the params being searched for.

The underlying object is still in `cache` (confirmed by `len(cache) == 1`), just permanently unreachable via normal lookup, since its current hash doesn't match the bucket it occupies.

The fix is to never allow the fields that participate in `__hash__` to mutate after use as a dict/set key — use an immutable snapshot instead:
::code-wrapper{language="python"}
```python
class CacheKey:
    def __init__(self, params):
        self.params = dict(params)     # still technically mutable, but treat as frozen after this point

    def __eq__(self, other):
        return isinstance(other, CacheKey) and self.params == other.params

    def __hash__(self):
        return hash(tuple(sorted(self.params.items())))
```
::

The real discipline is procedural: once an object has been hashed and inserted somewhere, never mutate the fields `__hash__`/`__eq__` depend on — or use a genuinely immutable structure (a `frozenset` of items, a `namedtuple`, or a frozen `dataclass`) so mutation is impossible by construction.

**The lesson**: hashability and mutability are fundamentally in tension — an object used as a dict key or set member must be treated as frozen for as long as it's stored there, or lookups silently and permanently fail without any error.

</details>

## Key Takeaways

- `__repr__` is for developers (should be unambiguous, ideally eval-able) and is always used by containers; `__str__` is for end users and falls back to `__repr__` if absent.
- `__eq__` and `__hash__` must stay consistent — equal objects must hash equally — and Python disables hashing automatically if you define `__eq__` without `__hash__`; never hash on fields that can mutate after the object is stored in a set/dict.
- Implementing `__getitem__` alone gives you slicing, `in`, and a legacy iteration fallback for free; implementing `__iter__` (often as a generator function) is the more robust, explicit way to make a class iterable and reusable across multiple loops.
- Operator overloading (`__add__`, `__mul__`, etc.) should return `NotImplemented`, not raise or return `False`, when given an incompatible type — this lets Python try the reflected method (`__radd__`) on the other operand.
- `__enter__`/`__exit__` implement the context manager protocol; `__exit__` always runs (even on exceptions) and can suppress an exception by returning a truthy value — do this narrowly and deliberately, never as a blanket catch-all.
- `__call__` makes instances directly callable like functions, underlying class-based decorators and configurable callback objects.
