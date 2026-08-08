# 02 — Variables & Data Types

## Names Are Bindings, Not Boxes

In C or Java, a variable is a labeled box holding a value. In Python, a **name is a reference to an object living on the heap**. Assignment binds a name to an object; it never copies the object.

::code-wrapper{language="python"}
```python
a = [1, 2, 3]
b = a            # b and a now refer to the SAME list object
b.append(4)
print(a)         # [1, 2, 3, 4]  <- a changed too!
print(a is b)    # True — same object identity
```
::

This single fact underlies most of Python's "surprising" mutation behavior. Chapter 07 covers the mutable-default-argument and shallow-copy consequences in depth.

## Dynamic Typing

Types belong to **objects**, not to the names bound to them. A name can be rebound to a value of any type at any time — there is no compile-time type declaration.

::code-wrapper{language="python"}
```python
x = 42          # x refers to an int
x = "forty-two" # now x refers to a str — perfectly legal
x = [42]        # now a list
```
::

This is different from *weak* typing. Python is dynamically **but strongly** typed — it will not silently coerce incompatible types.

::code-wrapper{language="python"}
```python
"3" + 3
# TypeError: can only concatenate str (not "int") to str
```
::

Compare to JavaScript, which is dynamically and *weakly* typed: `"3" + 3` produces `"33"` silently. Python demands you be explicit:

::code-wrapper{language="python"}
```python
int("3") + 3      # 6
"3" + str(3)      # "33"
```
::

## The Built-in Scalar Types

| Type | Example | Notes |
|---|---|---|
| `int` | `42`, `-7`, `0x1A`, `0b101`, `1_000_000` | **Arbitrary precision** — no overflow, ever. `2 ** 1000` just works. |
| `float` | `3.14`, `1e10`, `float('inf')` | IEEE-754 double precision (64-bit). Subject to the usual binary floating-point rounding. |
| `complex` | `3 + 4j` | Native complex number support; `.real` and `.imag` attributes. |
| `bool` | `True`, `False` | A **subclass of `int`** — `True == 1` and `False == 0` are both `True`. |
| `str` | `"hello"`, `'hello'`, `"""multi\nline"""` | Immutable sequence of Unicode code points. |
| `NoneType` | `None` | The one and only instance representing "no value." Not `0`, not `""`, not `undefined`. |

::code-wrapper{language="python"}
```python
# int has no fixed width — this does not overflow
huge = 2 ** 200
print(huge)
# 1606938044258990275541962092341162602522202993782792835301376

# bool is int in disguise
print(True + True)        # 2
print(isinstance(True, int))  # True
print(True == 1, False == 0)  # True True

# complex numbers, natively
z = 3 + 4j
print(abs(z))              # 5.0  (magnitude, via Pythagorean theorem)
```
::

### `None` is not "falsy zero" — it's a distinct singleton

::code-wrapper{language="python"}
```python
def get_config(key):
    config = {"debug": False, "timeout": 0}
    return config.get(key)  # returns None if key is absent

value = get_config("missing_key")
if value == 0:
    print("This never runs — None != 0")
if value is None:
    print("Correct check")   # this runs
```
::

Always compare `None` with `is`/`is not`, never `==`. `None` is a **singleton** — there is only ever one `None` object in a running process, so identity comparison is both correct and idiomatic (enforced by linters like `ruff`/`flake8` via `E711`).

## `type()` vs `isinstance()`

::code-wrapper{language="python"}
```python
class Animal:
    pass

class Dog(Animal):
    pass

d = Dog()

print(type(d) == Dog)          # True
print(type(d) == Animal)       # False — type() is exact, no inheritance awareness
print(isinstance(d, Animal))   # True — isinstance() respects the class hierarchy
print(isinstance(d, Dog))      # True
print(isinstance(True, int))   # True — bool IS-A int
print(type(True) == int)       # False — exact type is bool, not int
```
::

**Best practice**: use `isinstance()` for type checks in almost all real code — it correctly handles inheritance and is the only option that works with `Protocol`/ABC-based duck typing (chapter 20). Reserve `type(x) == Y` for the rare case where you deliberately want to *exclude* subclasses (e.g., security-sensitive `pickle` deserialization checks, chapter 27).

::code-wrapper{language="python"}
```python
# isinstance also accepts a tuple of types
def normalize(value):
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        return value.strip().lower()
    raise TypeError(f"Unsupported type: {type(value).__name__}")
```
::

## Duck Typing

"If it walks like a duck and quacks like a duck, it's a duck." Python cares about what an object *can do* (its methods/attributes), not its declared type.

::code-wrapper{language="python"}
```python
class Duck:
    def quack(self):
        return "Quack!"

class Person:
    def quack(self):
        return "I'm quacking (I'm a person)"

def make_it_quack(thing):
    # No isinstance check at all — we just trust it has .quack()
    return thing.quack()

print(make_it_quack(Duck()))
print(make_it_quack(Person()))
```
::

This is why Python favors **EAFP** ("Easier to Ask Forgiveness than Permission") over **LBYL** ("Look Before You Leap"):

::code-wrapper{language="python"}
```python
# LBYL — checks first, then acts (race conditions possible, verbose)
if hasattr(obj, "quack") and callable(obj.quack):
    obj.quack()

# EAFP — idiomatic Python: try it, handle failure
try:
    obj.quack()
except AttributeError:
    print("Object can't quack")
```
::

EAFP is preferred in idiomatic Python partly for readability and partly because LBYL checks can be invalidated by the time you act on them (a classic TOCTOU — time-of-check to time-of-use — bug, especially relevant with files and dicts under concurrent modification).

## Checking and Converting Types

::code-wrapper{language="python"}
```python
x = "42"
print(type(x))          # <class 'str'>
print(int(x))            # 42          — parses a numeric string
print(int("3.14"))       # ValueError: invalid literal for int() with base 10: '3.14'
print(int(float("3.14"))) # 3          — go through float first, truncates toward zero
print(str(42))            # "42"
print(bool(""))            # False — empty string is falsy
print(bool("False"))       # True  — NON-empty string, even "False", is truthy!
```
::

## Truthiness — What Counts as `False`

Every object has an implicit boolean value via `bool(obj)`, used by `if`, `while`, `and`, `or`, `not`.

**Falsy values**: `False`, `None`, `0`, `0.0`, `0j`, `""`, `()`, `[]`, `{}`, `set()`, and any object whose `__bool__` (or fallback `__len__`) returns `False`/`0`.

**Everything else is truthy** — including `"0"`, `"False"`, `[0]`, and `{0: False}` (all non-empty).

::code-wrapper{language="python"}
```python
values = [0, 1, "", "0", [], [0], {}, None, False, True, 0.0, -0.0]
for v in values:
    print(f"{v!r:>8} -> {bool(v)}")
```
::

::code-wrapper{language="python"}
```python
       0 -> False
       1 -> True
      '' -> False
     '0' -> True
      [] -> False
     [0] -> True
      {} -> False
    None -> False
   False -> False
    True -> True
     0.0 -> False
    -0.0 -> False
```
::

## Variable Naming Rules and Conventions

::code-wrapper{language="python"}
```python
# Valid identifiers: letters, digits, underscore; can't start with a digit
valid_name = 1
_private_by_convention = 2
__name_mangled_in_classes = 3
CONSTANT_STYLE = 4          # convention only — Python has no true constants

# Invalid:
# 1st_place = "x"    # SyntaxError — can't start with digit
# my-var = "x"       # SyntaxError — hyphen is the subtraction operator
```
::

| Convention | Meaning |
|---|---|
| `snake_case` | Variables and functions (PEP 8). |
| `PascalCase` | Class names. |
| `UPPER_SNAKE_CASE` | Module-level constants (by convention only — still reassignable). |
| `_leading_underscore` | "Internal use" hint — not enforced, just a signal to other developers. |
| `__leading_double_underscore` | Triggers **name mangling** inside classes (`self.__x` becomes `self._ClassName__x`) — see chapter 12. |
| `__dunder__` | Reserved for Python itself (`__init__`, `__len__`) — never invent your own dunder names. |

## 💡 Tips & Tricks

- **`type(x).__name__` for clean error messages** — `f"Expected int, got {type(x).__name__}"` prints `int`/`str`/`list` instead of the noisy `<class 'int'>` you'd get from `type(x)` directly in an f-string.
- **`sys.intern()` for large sets of repeated strings** — In hot paths comparing many repeated strings (e.g., parser tokens), `sys.intern()` guarantees identical strings share one object, making `is` comparison valid and fast — CPython already auto-interns short identifier-like literals, but not all strings.
- **Underscore digit separators** — `1_000_000` and `0x_FF_FF` are valid literals since Python 3.6; use them for readability in large numeric constants.
- **`isinstance` with `|` union syntax (3.10+)** — `isinstance(x, int | float)` works identically to the tuple form `isinstance(x, (int, float))` and reads closer to type-hint syntax.
- **`None` as a sentinel default, never a mutable literal** — Use `def f(cache=None): cache = cache if cache is not None else {}` instead of a mutable default — chapter 05 explains exactly why the mutable form is dangerous.

## ⚠️ Edge Cases & Gotchas

- **Small integer caching (`is` vs `==` on ints)** — CPython pre-allocates and caches integers in `[-5, 256]` as singletons. `a = 100; b = 100; a is b` is `True`, but `a = 1000; b = 1000; a is b` is often `False` (implementation detail, not guaranteed by the language spec) because they're separately allocated objects with equal value but different identity. **Never use `is` to compare integer values** — always use `==`; `is` is only correct for `None`, and for deliberate singleton/sentinel checks.
- **String interning is inconsistent across literal forms** — Short strings that look like identifiers (`"hello"`) are often interned by CPython and compare equal with `is`, but strings built at runtime (`"".join(["h","e","l","l","o"])`) usually are not, even with equal content. Relying on `is` for string equality is a latent bug that "works in testing" and fails in production.
- **`bool` being a subclass of `int` breaks naive type dispatch** — `isinstance(True, int)` is `True`, so a function branching only on `isinstance(x, int)` silently also matches booleans, which can produce nonsensical results like treating `True` as the integer `1` in arithmetic contexts you didn't intend. Explicitly exclude booleans (`isinstance(x, int) and not isinstance(x, bool)`) when the distinction matters (e.g., validating "this must be a count, not a flag").
- **Floating-point representation is binary, not decimal** — `0.1 + 0.2 == 0.3` is `False` because `0.1` and `0.2` have no exact binary (base-2) fractional representation — the same reason `1/3` has no exact finite decimal representation. Use `math.isclose(0.1 + 0.2, 0.3)` for float comparisons, or the `decimal.Decimal` type for money/precision-critical arithmetic.
- **`0.0 == -0.0` is `True`, but they are distinct bit patterns** — IEEE-754 defines signed zero. `1 / 0.0` raises `ZeroDivisionError` in Python (unlike C, which yields `inf`), but `1 / -0.0` — if you get a `-0.0` from a computation rather than division by an int-cast zero — behaves per IEEE-754 rules; this rarely matters, but has bitten numerical code comparing `float('-0.0')` bit-for-bit via `struct.pack`.

## 🧠 Spot the Bug

What does this print, and why does it differ from what most beginners expect?

::code-wrapper{language="python"}
```python
a = 256
b = 256
print(a is b)     # ?

c = 257
d = 257
print(c is d)     # ?

e = -5
f = -5
print(e is f)     # ?

g = -6
h = -6
print(g is h)     # ?
```
::

<details>
<summary>Answer</summary>

`a is b` → `True`, `c is d` → usually `False`, `e is f` → `True`, `g is h` → usually `False`.

CPython caches integer objects in the range `[-5, 256]` inclusive at interpreter startup as a performance optimization (small integers are used constantly, so reusing objects avoids repeated allocation). `256` falls inside that range, so both names bind to the *same* cached object — `is` returns `True`. `257` falls outside it, so each literal typically creates a *new* int object — `is` returns `False` (though in the same statement/constant-folding context the compiler might occasionally intern identical literals — never rely on this). The same boundary applies at `-5`.

**The lesson**: `is` tests object identity, not value equality — it only ever gives value-correct results for integers by accident of an implementation detail (the small-int cache), never by language guarantee. Always use `==` for comparing values, and reserve `is` for `None`, sentinels, and deliberate singleton checks.

</details>

## Key Takeaways

- Names are references to objects, not boxes containing values — assignment binds, it never copies.
- Python is dynamically but *strongly* typed: types live on objects, and there's no silent cross-type coercion like JavaScript's `"3" + 3`.
- `int` has arbitrary precision (no overflow); `float` is IEEE-754 double precision (subject to rounding); `bool` is a subclass of `int`.
- Prefer `isinstance()` over `type() ==` for type checks — it respects inheritance and duck typing.
- Never use `is` to compare values (especially ints and strings) — the small-int cache and string interning are implementation details, not guarantees. Use `is` only for `None` and sentinel/singleton checks.
