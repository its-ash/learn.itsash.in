# 12 — Classes & Objects

## Defining a Class

::code-wrapper{language="python"}
```python
class User:
    def __init__(self, name, email):
        self.name = name       # instance attribute — unique per object
        self.email = email

    def greeting(self):
        return f"Hello, {self.name}!"

ada = User("Ada Lovelace", "ada@example.com")
grace = User("Grace Hopper", "grace@example.com")

print(ada.greeting())     # Hello, Ada Lovelace!
print(grace.name)           # Grace Hopper
print(type(ada))              # <class '__main__.User'>
print(isinstance(ada, User))    # True
```
::

`__init__` is the **initializer**, not a constructor in the C++/Java sense — by the time `__init__` runs, the object already exists (created by `__new__`, covered in chapter 23). `__init__`'s job is only to populate the already-created instance's attributes.

## `self` Is Not Magic

`self` is just the first parameter of an instance method, conventionally named `self` — Python passes the instance automatically when you call `obj.method(...)`, which is sugar for `ClassName.method(obj, ...)`.

::code-wrapper{language="python"}
```python
class Counter:
    def __init__(self):
        self.count = 0

    def increment(self):
        self.count += 1
        return self.count

c = Counter()
print(c.increment())        # 1 — sugar for Counter.increment(c)
print(Counter.increment(c))   # 2 — identical, explicit form
```
::

There is nothing special about the name `self` — it's a convention so strong that violating it (naming it `this` or `s`) is considered a serious style violation, but the language itself doesn't enforce it.

## Instance Attributes vs Class Attributes

::code-wrapper{language="python"}
```python
class Employee:
    company = "Acme Corp"          # CLASS attribute — shared by ALL instances

    def __init__(self, name):
        self.name = name              # INSTANCE attribute — unique per object

alice = Employee("Alice")
bob = Employee("Bob")

print(alice.company, bob.company)   # Acme Corp Acme Corp — same object, shared
print(Employee.company)               # Acme Corp

Employee.company = "NewCo"              # changes it for ALL instances (and future ones)
print(alice.company, bob.company)         # NewCo NewCo

alice.company = "Alice's Startup"           # creates a NEW instance attribute on alice,
print(alice.company, bob.company)             # SHADOWING the class attribute — doesn't touch it
# Alice's Startup NewCo
```
::

Assigning `alice.company = ...` never modifies `Employee.company` — it creates a new entry in `alice`'s own `__dict__` that shadows the class attribute for lookups on `alice` specifically. This is the same lookup chain (instance `__dict__` first, then class, then base classes via MRO) that chapter 13 covers for inheritance.

### The mutable class attribute trap

::code-wrapper{language="python"}
```python
# WRONG — a mutable class attribute is SHARED and mutated in place by every instance
class ShoppingCart:
    items = []                    # class attribute — ONE list shared by all carts!

    def add(self, item):
        self.items.append(item)     # mutates the SHARED list, doesn't create a new one

cart_a = ShoppingCart()
cart_b = ShoppingCart()
cart_a.add("apple")
print(cart_b.items)   # ['apple'] — leaked into cart_b, which never touched cart_a!

# RIGHT — initialize mutable state in __init__, so each instance gets its own
class ShoppingCartFixed:
    def __init__(self):
        self.items = []              # instance attribute — fresh list per instance

cart_c = ShoppingCartFixed()
cart_d = ShoppingCartFixed()
cart_c.add = lambda item: cart_c.items.append(item)
cart_c.add("banana")
print(cart_d.items)   # [] — correctly isolated
```
::

This is the class-level cousin of the mutable-default-argument trap from chapter 05 — the underlying mechanism is identical: an object created once, at definition time, and then shared everywhere it's referenced instead of being freshly created per use.

## Instance Methods, Class Methods, and Static Methods

::code-wrapper{language="python"}
```python
class Pizza:
    def __init__(self, toppings):
        self.toppings = toppings

    def describe(self):                       # instance method — needs an instance
        return f"Pizza with {', '.join(self.toppings)}"

    @classmethod
    def margherita(cls):                       # classmethod — receives the CLASS, not an instance
        return cls(["mozzarella", "basil"])       # cls(...) so subclasses construct correctly

    @staticmethod
    def is_valid_topping(topping):                # staticmethod — no self, no cls, just a namespaced function
        return topping.lower() not in {"pineapple"}

p = Pizza.margherita()
print(p.describe())                    # Pizza with mozzarella, basil
print(Pizza.is_valid_topping("ham"))     # True
print(Pizza.is_valid_topping("pineapple"))  # False (a controversial but valid design opinion)
```
::

`@classmethod` is the idiomatic way to write **alternative constructors** (`from_json`, `from_config`, `margherita`) — using `cls(...)` instead of hardcoding `Pizza(...)` means subclasses inherit a correctly-typed constructor for free:

::code-wrapper{language="python"}
```python
class StuffedCrustPizza(Pizza):
    pass

sc = StuffedCrustPizza.margherita()
print(type(sc))   # <class '__main__.StuffedCrustPizza'> — NOT Pizza, thanks to cls(...)
```
::

## Every Instance Has a `__dict__` (Usually)

::code-wrapper{language="python"}
```python
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

p = Point(1, 2)
print(p.__dict__)   # {'x': 1, 'y': 2}

p.z = 99            # you can add attributes NOT declared in __init__ at all
print(p.__dict__)     # {'x': 1, 'y': 2, 'z': 99}
```
::

Unlike statically-typed languages, Python objects are open by default — any code holding a reference to an instance can add, remove, or overwrite attributes freely, unless the class opts out with `__slots__` (chapter 15), which trades this flexibility for memory savings and typo protection.

## Dunder Methods: A First Look

Chapter 14 covers these in depth; a brief overview here connects classes to the operators and built-ins you already know.

::code-wrapper{language="python"}
```python
class Vector:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __repr__(self):                        # unambiguous, developer-facing representation
        return f"Vector({self.x}, {self.y})"

    def __eq__(self, other):                   # powers ==
        return isinstance(other, Vector) and self.x == other.x and self.y == other.y

    def __add__(self, other):                  # powers +
        return Vector(self.x + other.x, self.y + other.y)

v1 = Vector(1, 2)
v2 = Vector(3, 4)
print(v1 + v2)          # Vector(4, 6) — uses __add__ and __repr__
print(v1 == Vector(1, 2))   # True — uses __eq__
print([v1, v2])                # [Vector(1, 2), Vector(3, 4)] — repr used inside containers
```
::

Without `__repr__`, printing an instance falls back to the unhelpful default `<__main__.Vector object at 0x7f...>`; without `__eq__`, `==` falls back to identity comparison (`is`), so two "equal" vectors with different `x`/`y` values but the same memory address would never occur, but two vectors with identical field values would incorrectly compare unequal.

## Checking Types: `isinstance` vs `type() ==`

::code-wrapper{language="python"}
```python
class Animal:
    pass

class Dog(Animal):
    pass

d = Dog()

print(isinstance(d, Dog))       # True
print(isinstance(d, Animal))      # True — isinstance respects inheritance
print(type(d) == Animal)            # False — exact type check, ignores inheritance
print(type(d) == Dog)                 # True
```
::

**Best practice**: use `isinstance()`, not `type() ==`, for type checks in almost all application code — it respects polymorphism and works correctly with subclasses, which is the entire point of inheritance (chapter 13). Reach for exact `type()` comparison only in rare cases (like preventing a subclass from being treated identically to its parent in a serializer).

## Class Bodies Execute Immediately, Once, at Definition Time

::code-wrapper{language="python"}
```python
print("before class")

class Demo:
    print("inside class body")     # runs ONCE, when the class statement executes
    x = 1 + 1                        # a normal assignment — becomes a class attribute
    print(f"x is now {x}")

print("after class")
print(Demo.x)

# Output:
# before class
# inside class body
# x is now 2
# after class
# 2
```
::

This surprises newcomers: a `class` block isn't a template that's "filled in" per instance — it's regular Python code that executes top-to-bottom exactly once, building a namespace that becomes the class object. This is precisely why a mutable default like `items = []` inside the class body is a single, shared object, not a per-instance template — it's evaluated once, just like a default argument.

## 💡 Tips & Tricks

- **Idiom**: use `@classmethod` for alternate constructors (`from_dict`, `from_file`) instead of overloading `__init__` with optional-argument juggling — `cls(...)` also makes the constructor subclass-correct automatically.
- **Debug**: `vars(obj)` is equivalent to `obj.__dict__` and is the fastest way to inspect exactly what an instance holds, without any class-level attributes mixed in.
- **Idiom**: `dataclasses.dataclass` (standard library, 3.7+) auto-generates `__init__`, `__repr__`, and `__eq__` for simple data-holding classes — reach for it before hand-writing boilerplate for a class that's mostly fields.
- **Performance**: attribute lookup on an instance without `__slots__` goes through a dict, which is fast but not free — for classes instantiated millions of times (rows, particles, graph nodes), `__slots__` (chapter 15) meaningfully reduces both memory and lookup overhead.
- **Debug**: `obj.__class__` and `type(obj)` are almost always equivalent, but `__class__` can be reassigned at runtime to change an object's class in place — a rarely-used but real technique for state-machine-like objects that "become" a different type.

## ⚠️ Edge Cases & Gotchas

- **A mutable class attribute (list, dict, set) is shared by every instance, since it's created once at class-definition time, not per instance** — mutating it through one instance (`self.items.append(...)`) affects all instances; always initialize mutable state inside `__init__` as an instance attribute instead.
- **Assigning to `self.attr = value` never mutates a same-named class attribute — it always creates or overwrites an instance attribute that shadows it** — this can mask bugs where code intends to update shared state but silently creates per-instance state instead.
- **Python objects have no true privacy — a leading underscore (`_x`) is convention only, and even "name-mangled" double-underscore attributes (`__x`) are just renamed to `_ClassName__x`, still fully accessible** — don't rely on attribute naming for security or correctness; it communicates intent to other developers, nothing more.
- **The class body runs exactly once at definition time — code inside it (loops, conditionals, print statements, function calls) executes immediately, not per instantiation** — this is why conditional class attributes (`x = compute_default() if condition else other_default()`) are evaluated once at import time, not refreshed on each `ClassName()` call.
- **`isinstance(True, int)` is `True`, because `bool` is a subclass of `int`** — a type check meant to exclude booleans (e.g., validating "this must be an integer count, not a flag") must explicitly guard with `type(x) is bool` in addition to the `isinstance(x, int)` check, or a stray `True`/`False` will silently pass validation as `1`/`0`.

## 🧠 Spot the Bug

A game inventory system tracks items per player. Every new player mysteriously starts with items already in their inventory. Find the bug.

::code-wrapper{language="python"}
```python
class Player:
    inventory = []

    def __init__(self, name):
        self.name = name

    def pick_up(self, item):
        self.inventory.append(item)

alice = Player("Alice")
alice.pick_up("sword")

bob = Player("Bob")
print(bob.inventory)
```
::

<details>
<summary>Answer</summary>

Prints `['sword']` — Bob starts with Alice's sword. `inventory = []` is a **class attribute**, created exactly once when the `Player` class body executes, and shared by every instance that hasn't shadowed it with its own instance attribute. `self.inventory.append(item)` doesn't create a new list on `self` — it looks up `inventory` (finds the shared class attribute, since no instance attribute exists yet), and mutates that single shared list in place. Every `Player` instance is looking at the exact same list object.

The fix is to make `inventory` an instance attribute, created fresh in `__init__`:
::code-wrapper{language="python"}
```python
class Player:
    def __init__(self, name):
        self.name = name
        self.inventory = []

    def pick_up(self, item):
        self.inventory.append(item)
```
::

**The lesson**: mutable class attributes are shared, in-place-mutable state across every instance — any field meant to be per-instance and mutable (lists, dicts, sets, and most custom objects) belongs in `__init__` as `self.attr = ...`, never as a bare class-body assignment.

</details>

## Key Takeaways

- `__init__` initializes an already-created instance; `self` is just the conventional name for the instance, passed automatically by the `obj.method()` calling convention.
- Class attributes are shared across all instances and created once at class-definition time; instance attributes (assigned via `self.x = ...`) are per-object and shadow same-named class attributes on lookup.
- Mutable class attributes are a classic bug source — the fix is always to initialize mutable state inside `__init__` instead of the class body.
- `@classmethod` (receives `cls`) is the idiomatic pattern for alternate constructors; `@staticmethod` (receives neither `self` nor `cls`) is just a regularly-namespaced function living on the class.
- Prefer `isinstance()` over `type() ==` for type checks so subclasses are correctly recognized — but remember `bool` is a subtype of `int`, which can silently defeat naive numeric validation.
- A class body executes top-to-bottom exactly once at definition time, building the class's namespace — it is not a per-instance template.
