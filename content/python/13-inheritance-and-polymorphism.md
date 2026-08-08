# 13 — Inheritance & Polymorphism

## Single Inheritance Basics

::code-wrapper{language="python"}
```python
class Animal:
    def __init__(self, name):
        self.name = name

    def speak(self):
        raise NotImplementedError("Subclasses must implement speak()")

    def describe(self):
        return f"{self.name} says {self.speak()}"

class Dog(Animal):
    def speak(self):
        return "Woof!"

class Cat(Animal):
    def speak(self):
        return "Meow!"

for animal in [Dog("Rex"), Cat("Whiskers")]:
    print(animal.describe())
# Rex says Woof!
# Whiskers says Meow!
```
::

This is **polymorphism**: `describe()` is defined once, on `Animal`, but calls `self.speak()` — which resolves to whichever subclass's `speak` the actual instance has, at call time. Python doesn't need an `interface` keyword or explicit virtual dispatch declarations — every method call is dynamically dispatched based on the object's actual type.

## `super()` — Calling the Parent's Implementation

::code-wrapper{language="python"}
```python
class Employee:
    def __init__(self, name, salary):
        self.name = name
        self.salary = salary

    def annual_bonus(self):
        return self.salary * 0.05

class Manager(Employee):
    def __init__(self, name, salary, team_size):
        super().__init__(name, salary)     # delegates to Employee.__init__
        self.team_size = team_size

    def annual_bonus(self):
        base_bonus = super().annual_bonus()   # reuses parent logic, then extends it
        return base_bonus + self.team_size * 100

m = Manager("Priya", 90_000, 5)
print(m.annual_bonus())   # 90000*0.05 + 5*100 = 4500 + 500 = 5000.0
```
::

**Best practice**: always call `super().__init__(...)` in a subclass's `__init__` unless you have a specific, deliberate reason not to (a common pattern in mixins) — skipping it means the parent's setup logic silently never runs, leaving the instance in a partially-initialized state that only fails later, far from the actual bug.

## Multiple Inheritance and the Diamond Problem

::code-wrapper{language="python"}
```python
class Flyer:
    def move(self):
        return "flies"

class Swimmer:
    def move(self):
        return "swims"

class Duck(Flyer, Swimmer):    # inherits from BOTH
    pass

d = Duck()
print(d.move())   # "flies" — Flyer comes first in the class definition
```
::

When two parent classes define the same method, which one wins is determined by the **Method Resolution Order (MRO)** — not simply "leftmost parent" by coincidence, but a well-defined algorithm.

## MRO and C3 Linearization

Python uses the **C3 linearization** algorithm to compute a single, consistent method lookup order across arbitrarily complex inheritance graphs, avoiding the ambiguities that plague simpler "depth-first" schemes.

::code-wrapper{language="python"}
```python
class A:
    def greet(self):
        return "A"

class B(A):
    def greet(self):
        return "B"

class C(A):
    def greet(self):
        return "C"

class D(B, C):
    pass

print(D.__mro__)
# (<class 'D'>, <class 'B'>, <class 'C'>, <class 'A'>, <class 'object'>)
print(D().greet())   # "B" — first class in the MRO that defines greet()
```
::

The rule C3 guarantees: a class always appears before its parents, and the order of parents as listed in the class definition is preserved. This is why `D(B, C)` produces `[D, B, C, A, object]` rather than the naive depth-first `[D, B, A, C, A, object]` (which visits `A` twice, and doesn't respect the constraint that `C` must come before `A`).

### When C3 linearization is impossible

::code-wrapper{language="python"}
```python
class X:
    pass

class Y(X):
    pass

# class Z(X, Y):   # TypeError: Cannot create a consistent method resolution order (MRO)
#     pass
```
::

`class Z(X, Y)` demands that `X` come before `Y` (as listed) while also requiring `Y` (a subclass of `X`) to come before its own parent `X` — a genuine contradiction. Python detects this at class-creation time and refuses to create the class, rather than silently picking an arbitrary, possibly-surprising order.

## Cooperative Multiple Inheritance with `super()`

`super()` in a multi-inheritance hierarchy doesn't mean "my direct parent" — it means "the next class in the MRO," which is essential to understand for mixins that all need to run.

::code-wrapper{language="python"}
```python
class LoggingMixin:
    def save(self):
        print("Logging save operation")
        super().save()          # cooperatively passes control along the MRO

class ValidationMixin:
    def save(self):
        print("Validating before save")
        super().save()

class Document(LoggingMixin, ValidationMixin):
    def save(self):
        print("Saving document")

Document().save()
# Logging save operation
# Validating before save
# Saving document
```
::

`Document.__mro__` is `[Document, LoggingMixin, ValidationMixin, object]`. Each `super().save()` call advances to the *next* class in that MRO — not necessarily each class's own direct parent — which is why all three `save` methods run in sequence even though none of these mixins directly inherits from another. This pattern requires every cooperating class to call `super()` — a mixin that forgets to call it breaks the chain for everyone after it.

## Abstract Base Classes (ABC)

`abc.ABC` and `@abstractmethod` let you declare an interface that **cannot be instantiated** until all abstract methods are implemented, catching incomplete implementations at instantiation time rather than at first use.

::code-wrapper{language="python"}
```python
from abc import ABC, abstractmethod

class Shape(ABC):
    @abstractmethod
    def area(self):
        ...

    @abstractmethod
    def perimeter(self):
        ...

    def describe(self):                 # concrete methods are allowed alongside abstract ones
        return f"Area: {self.area()}, Perimeter: {self.perimeter()}"

# shape = Shape()   # TypeError: Can't instantiate abstract class Shape
#                     with abstract methods area, perimeter

class Rectangle(Shape):
    def __init__(self, w, h):
        self.w, self.h = w, h

    def area(self):
        return self.w * self.h

    def perimeter(self):
        return 2 * (self.w + self.h)

r = Rectangle(3, 4)
print(r.describe())   # Area: 12, Perimeter: 14
```
::

Compare to the "raise `NotImplementedError`" pattern from the first example in this chapter: that only fails when the missing method is actually *called*, potentially deep in production after the object was already constructed and passed around — `ABC` fails immediately at `__init__` time, which is a strictly earlier and safer failure point.

### `ABC` vs duck typing vs `Protocol`

::code-wrapper{language="python"}
```python
# Duck typing — no formal contract, just "if it has the method, it works"
class DuckTypedShape:
    def area(self):
        return 42

def print_area(shape):
    print(shape.area())   # works on ANY object with an area() method, no inheritance required

print_area(DuckTypedShape())   # 42
print_area(Rectangle(3, 4))      # 12
```
::

Python favors duck typing by default — `ABC` is reached for when you specifically want to **enforce** a contract at instantiation time (plugin systems, framework base classes) rather than merely document one. Chapter 20 covers `typing.Protocol`, which gives you static-analysis-time duck-typing checks without requiring inheritance at all — a third point on this spectrum.

## Overriding `__init__` and Attribute Shadowing in Hierarchies

::code-wrapper{language="python"}
```python
class Base:
    def __init__(self):
        self.value = "base"

    def show(self):
        return self.value

class Derived(Base):
    def __init__(self):
        super().__init__()
        self.value = "derived"    # shadows the value super().__init__() just set

d = Derived()
print(d.show())   # "derived" — the LAST assignment to self.value wins, regardless of which class set it
```
::

There's only ever one `self.value` slot per instance (absent `__slots__` per-class tricks) — attributes aren't namespaced by which class assigned them, so a subclass's `__init__` running after `super().__init__()` will always overwrite anything the parent set under the same name.

## `isinstance()` and `issubclass()` with Multiple Inheritance

::code-wrapper{language="python"}
```python
class Reader:
    pass

class Writer:
    pass

class ReadWriter(Reader, Writer):
    pass

rw = ReadWriter()
print(isinstance(rw, Reader))     # True
print(isinstance(rw, Writer))       # True
print(issubclass(ReadWriter, Reader))  # True
print(issubclass(ReadWriter, Writer))    # True

# isinstance/issubclass also accept a tuple of types, checked with OR semantics
print(isinstance(rw, (int, str, Reader)))   # True — matches Reader
```
::

## 💡 Tips & Tricks

- **Idiom**: prefer composition ("has-a") over inheritance ("is-a") when the relationship isn't a genuine specialization — a `Car` that "has an" `Engine` should hold an `Engine` instance as an attribute, not inherit from `Engine`; inheritance for code reuse alone often produces fragile, hard-to-follow hierarchies.
- **Debug**: `ClassName.__mro__` (or `ClassName.mro()`) prints the exact method resolution order — run it whenever a multi-inheritance call resolves to a surprising implementation instead of guessing.
- **Idiom**: mixins should generally not define `__init__` unless they call `super().__init__(*args, **kwargs)` cooperatively — a mixin with a non-cooperative `__init__` silently breaks any hierarchy that places another class after it in the MRO.
- **Debug**: `abc.ABC` subclasses that seem to "ignore" `@abstractmethod` are almost always missing the `ABC` base itself, or an abstract method was overridden by a subclass with a different signature that doesn't actually match (Python doesn't check signatures, only that the name exists).
- **Idiom**: `super()` with no arguments (Python 3 only) works by inspecting the enclosing class and instance implicitly via `__class__` — the two-argument form `super(ClassName, self)` still works but is legacy Python 2 syntax that's rarely needed today except in some metaclass or dynamic-class-creation edge cases.

## ⚠️ Edge Cases & Gotchas

- **Multiple inheritance with conflicting base-class orderings raises `TypeError: Cannot create a consistent MRO` at class-definition time, not at instantiation** — this is one of the few Python errors that happens purely from writing `class Z(X, Y): pass`, before any code runs.
- **`super()` in cooperative multiple inheritance means "next in the MRO," not "my direct parent"** — a mixin that assumes `super()` refers to a specific class will behave differently depending on where it's placed in a consuming class's inheritance list.
- **A mixin's `__init__` that doesn't call `super().__init__(...)` silently breaks the initialization chain for every class placed after it in the MRO** — those later classes' `__init__` methods simply never run, and the resulting bug (missing attributes) surfaces far from the actual cause.
- **`abc.ABC` only checks that an abstract method *name* is overridden — it does not check the overriding method's signature (parameter count, types)** — a subclass can "implement" `area(self, unit="m")` for an abstract `area(self)` and it will satisfy the ABC, even though callers using the base signature might behave unexpectedly.
- **Instance attributes aren't scoped per class in the hierarchy — there's one namespace per instance** — if both a base and derived `__init__` assign `self.value`, whichever runs last (usually the derived class's own assignment, after `super().__init__()`) wins, regardless of which class "conceptually owns" that attribute.

## 🧠 Spot the Bug

A plugin framework uses mixins to compose functionality. Some plugins mysteriously never get their setup code executed. Find the bug.

::code-wrapper{language="python"}
```python
class CachingMixin:
    def __init__(self, *args, **kwargs):
        self.cache = {}
        print("Cache initialized")

class LoggingMixin:
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.log = []
        print("Logger initialized")

class Plugin(LoggingMixin, CachingMixin):
    def __init__(self, name):
        super().__init__()
        self.name = name

p = Plugin("analytics")
print(hasattr(p, "cache"))
```
::

<details>
<summary>Answer</summary>

Prints only `Logger initialized` (never `Cache initialized`), and `hasattr(p, "cache")` is `False`. `Plugin.__mro__` is `[Plugin, LoggingMixin, CachingMixin, object]`. `Plugin.__init__` calls `super().__init__()`, which runs `LoggingMixin.__init__`; that correctly calls `super().__init__(*args, **kwargs)`, advancing to `CachingMixin.__init__` — so far so good. But `CachingMixin.__init__` does **not** call `super().__init__(*args, **kwargs)` — it just sets `self.cache` and returns, silently stopping the cooperative chain right there.

In this particular example `CachingMixin` is last before `object` so nothing further is skipped — but the real bug is structural: `CachingMixin` breaks the contract of cooperative multiple inheritance. Swap the class order to `Plugin(CachingMixin, LoggingMixin)` and now `LoggingMixin.__init__` (which does the right thing) never runs at all, because `CachingMixin.__init__` runs first and never calls `super()`.

The fix is to make every mixin in a cooperative hierarchy always call `super().__init__(*args, **kwargs)`, even if it appears to be "the last one":
::code-wrapper{language="python"}
```python
class CachingMixin:
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.cache = {}
        print("Cache initialized")
```
::

**The lesson**: every class participating in cooperative multiple inheritance must call `super().__init__(*args, **kwargs)`, regardless of where you assume it sits in the MRO — assuming your class is "the base" is exactly the assumption that breaks when someone reorders the inheritance list later.

</details>

## Key Takeaways

- Polymorphism in Python needs no special syntax — any object with the right method name works wherever that method is called, resolved dynamically at call time based on the object's actual type.
- `super()` delegates to the *next class in the MRO*, not necessarily the immediate parent — this distinction only matters (and matters a lot) once multiple inheritance is involved.
- Python computes a single, well-defined Method Resolution Order via C3 linearization; conflicting orderings raise `TypeError` at class-definition time rather than picking an arbitrary order.
- Cooperative multiple inheritance requires every class in the chain — including mixins — to call `super().__init__(*args, **kwargs)`, or later classes in the MRO silently never get initialized.
- `abc.ABC` + `@abstractmethod` enforces a contract at instantiation time, failing fast; the `NotImplementedError`-in-a-plain-method pattern only fails when that specific method is eventually called.
- Prefer composition over inheritance for "has-a" relationships — reach for inheritance (and especially multiple inheritance) only for genuine "is-a" specialization or well-designed cooperative mixins.
