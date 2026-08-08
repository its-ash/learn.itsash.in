# 15 — Properties & Descriptors

## Why Properties Exist: The Getter/Setter Problem

::code-wrapper{language="python"}
```python
# The naive Java/C#-style approach — verbose, and Python discourages it
class Temperature:
    def __init__(self, celsius):
        self._celsius = celsius

    def get_celsius(self):
        return self._celsius

    def set_celsius(self, value):
        if value < -273.15:
            raise ValueError("Below absolute zero")
        self._celsius = value

t = Temperature(25)
t.set_celsius(30)          # verbose call syntax, unlike plain attribute access
print(t.get_celsius())
```
::

Python's idiom is different: start with a **plain public attribute**, and only introduce a `@property` later if you need validation, computed values, or side effects — crucially, this upgrade doesn't break any existing caller's `obj.attr` / `obj.attr = value` syntax.

## `@property` — Computed Attributes That Look Like Data

::code-wrapper{language="python"}
```python
class Temperature:
    def __init__(self, celsius):
        self._celsius = celsius       # convention: leading underscore for the "backing" attribute

    @property
    def celsius(self):
        return self._celsius

    @celsius.setter
    def celsius(self, value):
        if value < -273.15:
            raise ValueError("Below absolute zero")
        self._celsius = value

    @property
    def fahrenheit(self):             # a fully computed, read-only property — no backing field at all
        return self._celsius * 9 / 5 + 32

t = Temperature(25)
print(t.celsius)         # 25 — looks like plain attribute access, but calls the getter
print(t.fahrenheit)        # 77.0
t.celsius = 30              # looks like plain assignment, but calls the setter (validates!)
print(t.celsius)               # 30

# t.celsius = -300         # ValueError: Below absolute zero
# t.fahrenheit = 100        # AttributeError: can't set attribute (no setter defined)
```
::

Callers can't tell from the call site whether `t.celsius` is a plain attribute or a `@property` — this is the point: you can start with a plain attribute and refactor to a property later without changing any calling code, unlike languages where you must commit to `getX()`/`setX()` method syntax from day one if you might ever need validation.

## Read-Only Properties and `@x.deleter`

::code-wrapper{language="python"}
```python
class Account:
    def __init__(self, balance):
        self._balance = balance
        self._closed = False

    @property
    def balance(self):
        return self._balance

    @balance.deleter
    def balance(self):
        if self._balance != 0:
            raise RuntimeError("Cannot close account with non-zero balance")
        self._closed = True
        print("Account closed")

acc = Account(0)
del acc.balance   # Account closed — calls the deleter, NOT actual attribute deletion semantics
```
::

A property with only a getter (no `@x.setter`) is effectively read-only from the outside — attempting `obj.x = value` raises `AttributeError: can't set attribute`, which is a clean, explicit way to expose computed or immutable-after-construction values.

## `functools.cached_property` — Compute Once, Cache on the Instance

::code-wrapper{language="python"}
```python
from functools import cached_property
import time

class Report:
    def __init__(self, rows):
        self.rows = rows

    @cached_property
    def total(self):
        print("Computing total...")
        time.sleep(1)                 # simulate expensive computation
        return sum(row["amount"] for row in self.rows)

r = Report([{"amount": 10}, {"amount": 20}])
print(r.total)   # "Computing total..." then 30 — computed once
print(r.total)     # 30 — instantly, from cache, NO recomputation, no "Computing total..." printed
```
::

Unlike `@property`, `cached_property` **stores the result directly in the instance's `__dict__`** after the first access, under the same name — subsequent lookups find it there before ever reaching the descriptor, permanently short-circuiting recomputation. This means `cached_property` requires the instance to have a `__dict__` (incompatible with `__slots__` unless you add `"__dict__"` to the slots, which partially defeats the purpose) and means the cached value goes stale if the underlying data (`self.rows`) changes after first access.

::code-wrapper{language="python"}
```python
r2 = Report([{"amount": 5}])
print(r2.total)   # 5
r2.rows.append({"amount": 100})
print(r2.total)     # STILL 5 — stale! cached_property doesn't know self.rows changed
```
::

**Best practice**: only use `cached_property` for values derived from data that's genuinely immutable for the object's lifetime — otherwise, invalidate manually (`del instance.__dict__["total"]`) or use plain `@property` if the underlying data can change.

## The Descriptor Protocol

`@property` is itself implemented using the **descriptor protocol** — any class implementing `__get__` (and optionally `__set__`/`__delete__`) becomes a descriptor, and Python's attribute-lookup machinery treats descriptor attributes specially when they're stored on a *class*.

::code-wrapper{language="python"}
```python
class PositiveNumber:
    """A reusable descriptor enforcing 'must be positive' on ANY attribute it's assigned to."""

    def __set_name__(self, owner, name):
        self.name = f"_{name}"                   # remembers the attribute name it's attached as

    def __get__(self, instance, owner):
        if instance is None:                       # accessed on the CLASS, not an instance
            return self
        return getattr(instance, self.name)

    def __set__(self, instance, value):
        if value <= 0:
            raise ValueError(f"{self.name[1:]} must be positive, got {value}")
        setattr(instance, self.name, value)

class Product:
    price = PositiveNumber()          # descriptor instance, shared at the CLASS level
    quantity = PositiveNumber()         # a second, independent descriptor instance

    def __init__(self, price, quantity):
        self.price = price                # triggers PositiveNumber.__set__
        self.quantity = quantity

p = Product(9.99, 3)
print(p.price, p.quantity)   # 9.99 3

# p.price = -5   # ValueError: price must be positive, got -5
```
::

One `PositiveNumber` instance is written once and reused for both `price` and `quantity` (and any other class that needs the same validation) — this is the descriptor protocol's real payoff: validation/computation logic factored out of the class body entirely, instead of copy-pasted into multiple near-identical `@property` getters/setters.

### Data descriptors vs non-data descriptors

A descriptor defining `__set__` or `__delete__` is a **data descriptor** and takes priority over instance `__dict__` entries; one defining only `__get__` is a **non-data descriptor** and instance `__dict__` takes priority over it. This is precisely why `@property` (a data descriptor — it defines `__set__` even for "read-only" properties, to raise `AttributeError` properly) always wins over an instance attribute of the same name, while plain functions (non-data descriptors, via `__get__` for bound-method creation) can be shadowed by an instance attribute of the same name.

::code-wrapper{language="python"}
```python
class Example:
    def method(self):
        return "class method"

e = Example()
e.method = lambda: "instance override"    # shadows the function descriptor — functions are non-data
print(e.method())   # "instance override" — instance __dict__ wins over a non-data descriptor
```
::

## `__slots__` — Trading Flexibility for Memory

By default, every instance carries a `__dict__` to hold its attributes — flexible, but with real per-instance memory overhead. `__slots__` declares a fixed set of allowed attribute names, storing them in a more compact fixed-layout structure instead.

::code-wrapper{language="python"}
```python
class PointDict:
    def __init__(self, x, y):
        self.x, self.y = x, y

class PointSlots:
    __slots__ = ("x", "y")           # ONLY x and y are allowed — no __dict__ at all
    def __init__(self, x, y):
        self.x, self.y = x, y

import sys
pd, ps = PointDict(1, 2), PointSlots(1, 2)
print(sys.getsizeof(pd.__dict__))   # typically 64+ bytes just for the dict itself
# print(ps.__dict__)                # AttributeError: 'PointSlots' object has no attribute '__dict__'

ps.z = 5     # AttributeError: 'PointSlots' object has no attribute 'z'
```
::

For classes instantiated in large numbers (rows of parsed data, graph nodes, particles in a simulation), `__slots__` can cut per-instance memory substantially and slightly speeds up attribute access, since there's no dict hashing involved — the tradeoff is losing the ability to add arbitrary attributes at runtime, and added complexity around inheritance.

### `__slots__` and inheritance gotchas

::code-wrapper{language="python"}
```python
class Base:
    __slots__ = ("a",)

class Derived(Base):
    __slots__ = ("b",)      # each class in the hierarchy declares its OWN slots

d = Derived()
d.a = 1    # OK — inherited slot
d.b = 2      # OK — own slot
print(d.a, d.b)   # 1 2

class DerivedNoSlots(Base):
    pass                    # forgetting __slots__ here silently RE-ADDS a __dict__!

dns = DerivedNoSlots()
dns.a = 1
dns.anything_at_all = "oops"   # works! the memory-saving benefit is gone for this subclass
```
::

If even one class in an inheritance chain omits `__slots__`, that subclass (and everything below it) regains a `__dict__`, silently defeating the memory optimization for the entire branch — a mistake that's easy to make and easy to miss in code review, since nothing errors.

## Combining `@property` with `__slots__`

::code-wrapper{language="python"}
```python
class Circle:
    __slots__ = ("_radius",)      # note: the property name "radius" is NOT itself a slot

    def __init__(self, radius):
        self._radius = radius

    @property
    def radius(self):
        return self._radius

    @radius.setter
    def radius(self, value):
        if value < 0:
            raise ValueError("radius cannot be negative")
        self._radius = value

c = Circle(5)
print(c.radius)   # 5
c.radius = 10
print(c.radius)     # 10
```
::

The `@property` itself lives on the *class* (it's a descriptor, not stored per-instance), so it doesn't need — and must not be listed as — a slot; only the actual backing storage (`_radius`) needs a slot entry.

## 💡 Tips & Tricks

- **Idiom**: never start a new class with hand-written getter/setter methods "just in case" — start with plain public attributes, and only introduce `@property` when validation or computed behavior is actually needed; this is idiomatic Python, not laziness.
- **Debug**: `vars(ClassName)` or `ClassName.__dict__` shows you every descriptor (including properties) defined directly on a class — useful for spotting exactly which attributes are computed vs plain data.
- **Performance**: `cached_property` trades memory (the cached value lives in `__dict__` forever, or until deleted) for CPU — appropriate for expensive, rarely-changing derived values; inappropriate for values that need to reflect frequently-mutating source data.
- **Idiom**: `__set_name__` (Python 3.6+) is what lets a descriptor know the attribute name it was assigned to without the class explicitly passing it — this is what makes reusable, generic descriptors (like the `PositiveNumber` example) practical instead of requiring a name string to be passed to every instantiation.
- **Performance**: for very large numbers of simple data-holding instances (parsed rows, coordinates, cache entries), benchmark `__slots__` before committing — the memory savings are real but the ergonomic cost (no dynamic attributes, more careful inheritance) isn't always worth it for smaller-scale code.

## ⚠️ Edge Cases & Gotchas

- **`cached_property` silently returns a stale value once the underlying data changes, since it's computed exactly once and then stored** — treat it as appropriate only for genuinely immutable-for-the-object's-lifetime derived data, or manage invalidation manually.
- **Forgetting `__slots__` on even one subclass in an inheritance chain re-adds a `__dict__` to every instance of that subclass, silently defeating the memory optimization** — this produces no error or warning; the class simply stops saving memory, discoverable only by explicitly checking `instance.__dict__`.
- **A property with only a getter is read-only, and assigning to it raises `AttributeError: can't set attribute` — a beginner easily confuses this with `AttributeError: object has no attribute`,** which is the error for accessing something that doesn't exist at all; the messages look similar but the causes (and fixes) are completely different.
- **Data descriptors (`@property`, anything defining `__set__`) always take priority over instance `__dict__` entries, while non-data descriptors (plain functions/methods) are shadowed by same-named instance attributes** — this asymmetry is why you can override a bound method on a specific instance (`instance.method = other_func`) but can never similarly "shadow" a `@property` by assigning through `instance.__dict__` directly.
- **`cached_property` requires the instance to support `__dict__` — combining it with `__slots__` requires explicitly adding `"__dict__"` to the slots tuple**, which reintroduces a per-instance dict and undermines much of the reason to use `__slots__` in the first place; the two features are in real tension, not simply compatible.

## 🧠 Spot the Bug

A configuration object caches an expensive derived value. After updating the underlying settings, callers keep getting outdated results. Find the bug.

::code-wrapper{language="python"}
```python
from functools import cached_property

class AppConfig:
    def __init__(self, settings):
        self.settings = settings

    @cached_property
    def connection_string(self):
        host = self.settings["host"]
        port = self.settings["port"]
        return f"{host}:{port}"

config = AppConfig({"host": "db1.internal", "port": 5432})
print(config.connection_string)

config.settings["host"] = "db2.internal"
print(config.connection_string)
```
::

<details>
<summary>Answer</summary>

Both prints show `db1.internal:5432` — the second one is stale. `cached_property` computes `connection_string` on first access and stores the result directly in `config.__dict__["connection_string"]`. From that point on, attribute lookup finds the cached value in the instance's own `__dict__` *before* the `cached_property` descriptor ever runs again — it has no way to know `self.settings` changed underneath it, because it never re-executes the getter function at all after the first call.

If the value genuinely needs to reflect live changes to `settings`, use a plain `@property` instead (recomputes every access, at the cost of doing the work every time):
::code-wrapper{language="python"}
```python
class AppConfig:
    def __init__(self, settings):
        self.settings = settings

    @property
    def connection_string(self):
        return f"{self.settings['host']}:{self.settings['port']}"
```
::

Or, if caching is still wanted, invalidate explicitly whenever settings change: `del config.__dict__["connection_string"]` (or wrap settings mutation in a method that does this).

**The lesson**: `cached_property` caches forever by default — it is only safe for values derived from data that doesn't change after the value is first read, not a general-purpose memoization tool for "usually stable" data.

</details>

## Key Takeaways

- Start classes with plain public attributes; upgrade to `@property` later for validation or computed values — the calling syntax (`obj.attr`) stays identical either way, which is the entire benefit over Java/C#-style getters/setters.
- A property with only a getter is read-only (`AttributeError` on assignment); `@x.setter` and `@x.deleter` add write/delete behavior under the same attribute name.
- `functools.cached_property` computes once and caches the result in the instance's `__dict__` — fast on repeat access, but silently stale if the underlying source data changes afterward.
- The descriptor protocol (`__get__`/`__set__`/`__set_name__`) is what `@property` is built on — write a custom descriptor when the same validation/computation logic needs to be reused across multiple attributes or classes.
- Data descriptors (define `__set__`) take priority over instance `__dict__`; non-data descriptors (plain functions) are shadowed by same-named instance attributes — this is why methods can be overridden per-instance but properties can't.
- `__slots__` trades dynamic-attribute flexibility for lower memory use and slightly faster attribute access — but every class in an inheritance chain must declare it, or a `__dict__` silently reappears on subclasses that omit it.
