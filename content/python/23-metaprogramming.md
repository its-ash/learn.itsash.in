# 23 — Metaprogramming

## Everything Is an Object, Even Classes

::code-wrapper{language="python"}
```python
class Dog:
    def bark(self):
        return "Woof!"

print(type(Dog))          # <class 'type'> — a CLASS is itself an instance of something: `type`
print(type(42))              # <class 'int'>
print(type(int))               # <class 'type'> — int, too, is an instance of type
print(isinstance(Dog, type))     # True
```
::

In Python, classes are ordinary objects, and `type` is the class of every class — this is the foundation metaprogramming builds on. Just as `Dog()` creates an instance of `Dog`, `type(...)` (called with three arguments) creates an instance of `type`, i.e., a brand new class, entirely at runtime:

::code-wrapper{language="python"}
```python
def bark(self):
    return "Woof!"

Dog = type("Dog", (), {"bark": bark})    # equivalent to `class Dog: def bark(self): ...`
d = Dog()
print(d.bark())    # "Woof!"
print(type(Dog))     # <class 'type'>

# type(name, bases, namespace) — the three arguments mirror a class statement exactly:
Animal = type("Animal", (), {})
Cat = type("Cat", (Animal,), {"sound": lambda self: "Meow!"})   # bases=(Animal,) — real inheritance
print(Cat.__mro__)   # (<class 'Cat'>, <class 'Animal'>, <class 'object'>)
```
::

## Metaclasses: Classes That Create Classes

::code-wrapper{language="python"}
```python
class UppercaseAttrMeta(type):
    def __new__(mcs, name, bases, namespace):
        uppercase_namespace = {
            (key.upper() if not key.startswith("__") else key): value
            for key, value in namespace.items()
        }
        return super().__new__(mcs, name, bases, uppercase_namespace)

class Config(metaclass=UppercaseAttrMeta):
    debug = True
    version = "1.0"

print(Config.DEBUG)      # True — 'debug' was rewritten to 'DEBUG' at CLASS CREATION time
# print(Config.debug)     # AttributeError: type object 'Config' has no attribute 'debug'
```
::

A **metaclass** is simply "the class of a class" — just as a class controls the construction and behavior of its instances, a metaclass controls the construction and behavior of *classes* that use it. `metaclass=UppercaseAttrMeta` tells Python "when building the `Config` class object itself, run it through `UppercaseAttrMeta` instead of the default `type`." This runs once, when the class statement itself is executed (typically at import time) — not per-instance.

### `__new__` vs `__init__` on a Metaclass

::code-wrapper{language="python"}
```python
class LoggingMeta(type):
    def __new__(mcs, name, bases, namespace):
        print(f"__new__: creating class object for {name}")
        cls = super().__new__(mcs, name, bases, namespace)
        return cls

    def __init__(cls, name, bases, namespace):
        print(f"__init__: initializing class object for {name}")
        super().__init__(name, bases, namespace)
        cls.created_via_logging_meta = True

class Widget(metaclass=LoggingMeta):
    pass
# __new__: creating class object for Widget
# __init__: initializing class object for Widget

print(Widget.created_via_logging_meta)   # True
```
::

`__new__` is responsible for *creating and returning* the class object; `__init__` receives the already-created object and can further configure it (add attributes, validate) but cannot change its identity or type. This exactly mirrors the instance-level `__new__`/`__init__` split (chapter 12), one level up the metaclass hierarchy.

### A real-world use: enforcing an interface at class-creation time

::code-wrapper{language="python"}
```python
class EnforceInterfaceMeta(type):
    def __new__(mcs, name, bases, namespace):
        cls = super().__new__(mcs, name, bases, namespace)
        if bases and "process" not in namespace:            # skip the base class itself
            raise TypeError(f"{name} must implement a 'process' method")
        return cls

class Handler(metaclass=EnforceInterfaceMeta):
    pass

# class BrokenHandler(Handler):     # raises TypeError IMMEDIATELY at class definition time —
#     pass                            # not when an instance is created, and not when process() is called
```
::

This is metaprogramming's real payoff: catching a whole category of mistakes (a missing required method) the moment the class is *defined*, at import time, rather than waiting for the bug to surface later at instantiation or call time — often in production, far from the actual missing-method mistake.

## Class Decorators: A Simpler Alternative to Metaclasses

::code-wrapper{language="python"}
```python
def add_repr(cls):
    def __repr__(self):
        attrs = ", ".join(f"{k}={v!r}" for k, v in self.__dict__.items())
        return f"{cls.__name__}({attrs})"
    cls.__repr__ = __repr__
    return cls

@add_repr
class Point:
    def __init__(self, x, y):
        self.x, self.y = x, y

p = Point(1, 2)
print(p)   # Point(x=1, y=2)
```
::

A class decorator receives the already-fully-built class object and can modify or wrap it — mechanically much simpler than a metaclass (no `type` subclassing, no `__new__` override) and sufficient for the vast majority of "customize class creation" needs. **Best practice**: reach for a class decorator before a metaclass — metaclasses don't compose well (two unrelated metaclasses can't easily both apply to the same class) and are harder for other developers to reason about; use one only when you specifically need to intercept the class-creation process itself (e.g., validating `bases`, rewriting the namespace before the class exists) rather than merely modifying the finished product.

::code-wrapper{language="python"}
```python
from dataclasses import dataclass    # the standard library's own class decorator — chapter 12 territory

@dataclass
class Point:
    x: int
    y: int

print(Point(1, 2))   # Point(x=1, y=2) — auto-generated __init__, __repr__, __eq__
```
::

`@dataclass` itself is a class decorator — one of the most widely used pieces of metaprogramming in the entire standard library, generating `__init__`, `__repr__`, and `__eq__` by inspecting class-level annotations.

## Dynamic Attribute Access: `__getattr__`, `__setattr__`, `__getattribute__`

::code-wrapper{language="python"}
```python
class LazyConfig:
    def __init__(self):
        self._loaded = {}

    def __getattr__(self, name):
        # ONLY called when normal attribute lookup FAILS (attribute not found via __dict__/class)
        print(f"loading {name} on demand...")
        value = f"value-for-{name}"    # imagine a real config-file lookup here
        self._loaded[name] = value
        return value

config = LazyConfig()
print(config.database_url)   # "loading database_url on demand..." then "value-for-database_url"
print(config._loaded)          # {'database_url': 'value-for-database_url'}
print(config.database_url)       # NOTE: still triggers __getattr__ again! it was never stored as a REAL attribute
```
::

`__getattr__` is only invoked as a **fallback**, when normal lookup (instance `__dict__`, then class, then MRO) fails to find the attribute — it is not a universal interception point. The example above has a subtle bug: reading `config.database_url` a second time re-triggers `__getattr__` because the value was cached into `self._loaded`, a *different* dict, rather than actually set as `self.database_url`.

::code-wrapper{language="python"}
```python
class LazyConfigFixed:
    def __getattr__(self, name):
        print(f"loading {name} on demand...")
        value = f"value-for-{name}"
        setattr(self, name, value)   # actually stores it as a real instance attribute this time
        return value

config = LazyConfigFixed()
print(config.database_url)   # triggers __getattr__: "loading..."
print(config.database_url)     # NO print this time — found directly in __dict__, __getattr__ never called
```
::

### `__setattr__` — intercepting every attribute assignment

::code-wrapper{language="python"}
```python
class FrozenAfterInit:
    def __init__(self, x, y):
        self.__dict__["x"] = x         # must bypass __setattr__ during __init__ itself, or infinite recursion!
        self.__dict__["y"] = y
        self._frozen = True

    def __setattr__(self, name, value):
        if getattr(self, "_frozen", False):
            raise AttributeError(f"{self.__class__.__name__} is frozen; cannot set '{name}'")
        object.__setattr__(self, name, value)

p = FrozenAfterInit(1, 2)
# p.x = 99   # AttributeError: FrozenAfterInit is frozen; cannot set 'x'
```
::

Unlike `__getattr__`, `__setattr__` intercepts **every** attribute assignment unconditionally, including ones inside `__init__` — writing `self.x = x` naively inside `__setattr__`'s own class would recurse infinitely (`__setattr__` calling `self.x = x` calling `__setattr__` again...). The fix is always routing internal, "real" assignments through `object.__setattr__(self, name, value)` directly, bypassing the custom override.

### `__getattribute__` — intercepting *every* attribute read, found or not

::code-wrapper{language="python"}
```python
class LoggingAccess:
    def __init__(self, value):
        self.value = value

    def __getattribute__(self, name):
        print(f"accessing '{name}'")
        return object.__getattribute__(self, name)     # delegate to the REAL lookup, or infinite recursion

obj = LoggingAccess(42)
print(obj.value)
# accessing 'value'
# accessing 'value'   (once for the __getattribute__ call machinery, once for actual access, implementation detail)
# 42
```
::

`__getattribute__` is called for **every single attribute access**, whether or not the attribute exists — far more powerful (and far easier to break) than `__getattr__`. **Best practice**: override `__getattr__` for "handle missing attributes" use cases (lazy loading, proxies to another object); reserve `__getattribute__` for genuinely universal interception (logging every access, strict sandboxing) and always delegate to `object.__getattribute__` to avoid infinite recursion.

## `__init_subclass__` — A Lightweight Alternative to Metaclasses

::code-wrapper{language="python"}
```python
class PluginBase:
    registry = []

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        PluginBase.registry.append(cls)
        print(f"registered plugin: {cls.__name__}")

class CSVPlugin(PluginBase):
    pass

class JSONPlugin(PluginBase):
    pass
# registered plugin: CSVPlugin
# registered plugin: JSONPlugin

print(PluginBase.registry)   # [<class 'CSVPlugin'>, <class 'JSONPlugin'>]
```
::

`__init_subclass__` is called automatically on the parent class every time a *subclass* is defined — a huge fraction of "I need a metaclass to auto-register subclasses" use cases are better served by this single hook, introduced specifically to avoid reaching for a full metaclass in the common case. **Best practice**: prefer `__init_subclass__` over a custom metaclass whenever the goal is "run code when a subclass is created" — it's simpler, composes better with other base classes, and doesn't require understanding the metaclass machinery at all.

## `__set_name__` — Descriptors Learning Their Own Attribute Name

::code-wrapper{language="python"}
```python
class LoggedAttribute:
    def __set_name__(self, owner, name):
        self.name = name              # called automatically at class-creation time — knows its own name!
        self.private_name = f"_{name}"

    def __get__(self, instance, owner):
        return getattr(instance, self.private_name, None)

    def __set__(self, instance, value):
        print(f"setting {self.name} = {value!r}")
        setattr(instance, self.private_name, value)

class Account:
    balance = LoggedAttribute()   # __set_name__ fires here, at class body execution, with name="balance"

a = Account()
a.balance = 100   # setting balance = 100
print(a.balance)    # 100
```
::

This solves the pre-3.6 descriptor annoyance of manually repeating the attribute name as a string argument (chapter 15) — `__set_name__` is called automatically by the class machinery once, at class creation, telling the descriptor instance exactly which name it was assigned to.

## 💡 Tips & Tricks

- **Idiom**: reach for `__init_subclass__` before a metaclass for auto-registration or subclass validation — it solves the majority of real-world "I need to hook class creation" needs with far less complexity and better composability with multiple inheritance.
- **Debug**: if a class's behavior seems to come from nowhere, check `type(cls)` — an unexpected non-`type` result means a metaclass is involved, and `cls.__mro__` combined with `type(cls).__mro__` shows both the class's own inheritance and its metaclass's.
- **Idiom**: always delegate to `object.__setattr__`/`object.__getattribute__` inside a custom `__setattr__`/`__getattribute__` override for the "real" storage/lookup — calling `self.x = value` or `self.x` directly inside these methods causes infinite recursion, since it calls the very method you're inside.
- **Safety**: class decorators are strictly more composable than metaclasses — you can stack `@dataclass @add_repr @register_plugin` in any order, but a class can only ever have one metaclass (or a single metaclass that's a subclass of every ancestor's metaclass), making metaclasses a poor choice when a base class might already have one.
- **Debug**: `vars(SomeClass)` (equivalent to `SomeClass.__dict__`) shows exactly what's defined directly on a class, distinct from what it inherited — useful for confirming whether a metaclass or class decorator actually added the attribute you expect at the level you expect.

## ⚠️ Edge Cases & Gotchas

- **`__getattr__` is only called when normal lookup fails — it will NOT fire again for an attribute that was actually stored on the instance**, which is why lazy-attribute patterns must call `setattr(self, name, value)` (not store into a separate cache dict) if the intent is "compute once, then behave like a normal attribute."
- **Overriding `__setattr__` or `__getattribute__` without delegating to `object.__setattr__`/`object.__getattribute__` for real storage causes infinite recursion** — `self.x = value` inside your own `__setattr__` calls `__setattr__` again, and Python eventually raises `RecursionError` rather than looping forever.
- **A metaclass's `__new__`/`__init__` runs once, at class-definition time (usually at import), not per-instance** — code inside them executes long before any instance of the class is ever created, which surprises developers expecting instance-creation semantics.
- **Two unrelated metaclasses generally cannot both be applied to the same class** — Python requires a class's metaclass to be a subclass of all its bases' metaclasses, so combining `class Foo(Base1, Base2)` where `Base1`/`Base2` have unrelated metaclasses raises `TypeError: metaclass conflict` at class-definition time.
- **`type("Name", bases, namespace)` (dynamic class creation) silently accepts any string as the class name, including ones that aren't valid Python identifiers** — `type("123-invalid!", (), {})` creates a working class object whose `__name__` can't be referenced as a normal identifier anywhere in source code, only through the object reference itself.

## 🧠 Spot the Bug

A caching descriptor is meant to compute an expensive value once per instance and reuse it afterward. It works for one instance but returns the wrong cached value when used across multiple instances of the same class. Find the bug.

::code-wrapper{language="python"}
```python
class CachedProperty:
    def __init__(self, func):
        self.func = func
        self.cache = {}

    def __get__(self, instance, owner):
        if instance is None:
            return self
        if id(instance) not in self.cache:
            self.cache[id(instance)] = self.func(instance)
        return self.cache[id(instance)]

class Report:
    def __init__(self, data):
        self.data = data

    @CachedProperty
    def total(self):
        print("computing total...")
        return sum(self.data)

r1 = Report([1, 2, 3])
print(r1.total)   # computing total... 6
del r1
r2 = Report([10, 20])
print(r2.total)   # sometimes prints a STALE cached value instead of recomputing!
```
::

<details>
<summary>Answer</summary>

The cache key is `id(instance)` — the instance's memory address. CPython is free to reuse a memory address once an object's reference count drops to zero and it's garbage collected, which is exactly what can happen to `r1` after `del r1`: if `r2` happens to be allocated at the same now-freed address, `id(r2) == id(r1)`'s old value, and the descriptor's cache serves `r1`'s stale computed `total` for `r2` instead of computing a fresh one — a correctness bug that depends on non-deterministic memory reuse timing, making it intermittent and hard to reproduce.

The fix is to store the cache on the *instance itself* (as `functools.cached_property`, chapter 15's descriptor material, and the standard library all do), not in a dict keyed by a potentially-recycled `id()`:
::code-wrapper{language="python"}
```python
class CachedProperty:
    def __init__(self, func):
        self.func = func
        self.attr_name = None

    def __set_name__(self, owner, name):
        self.attr_name = name

    def __get__(self, instance, owner):
        if instance is None:
            return self
        value = self.func(instance)
        instance.__dict__[self.attr_name] = value   # shadows the descriptor on FUTURE lookups for this instance
        return value
```
::

Storing the cached value directly in `instance.__dict__` under the same name ties its lifetime to the instance itself — no risk of `id()` collisions, and it disappears automatically when the instance is garbage collected, rather than leaking forever in a class-level dict.

**The lesson**: never use `id(obj)` as a long-lived dictionary key intended to uniquely identify an object across its lifetime — `id()` is only guaranteed unique among objects that are alive *simultaneously*; once an object is freed, its id can be recycled by an entirely unrelated object.

</details>

## Key Takeaways

- Classes are ordinary objects whose type is (by default) `type` — `type(name, bases, namespace)` builds a class dynamically, exactly mirroring what a `class` statement does under the hood.
- A metaclass is "the class of a class," controlling how classes using it are constructed; its `__new__`/`__init__` run once, at class-definition time, not per-instance.
- Class decorators solve most "customize this class" needs more simply than metaclasses and compose far better — reach for `__init_subclass__` or a class decorator before writing a custom metaclass.
- `__getattr__` fires only on failed lookups (a fallback for missing attributes); `__getattribute__` fires on every access; `__setattr__` fires on every assignment — both of the latter two must delegate to `object.__setattr__`/`__getattribute__` to avoid infinite recursion.
- `__set_name__` lets a descriptor learn the attribute name it was assigned to automatically at class-creation time, removing the need to pass the name manually.
- Never key a long-lived cache by `id(obj)` — once an object is garbage collected, its memory address can be reused by an unrelated object, causing stale or cross-contaminated cache hits.
