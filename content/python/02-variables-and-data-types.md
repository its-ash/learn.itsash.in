# 02 — Variables & Data Types

## Names Are Labels, Not Boxes

In Python, a variable is a **name that points to an object**. Assignment never copies — it adds another label to the same object.

::code-wrapper{language="python"}
```python
a = [1, 2, 3]
b = a            # b points to the SAME list
b.append(4)
print(a)         # [1, 2, 3, 4]  ← a "changed" too
print(a is b)    # True — one object, two names
```
::

With immutable types (int, str, tuple) you never notice, because you cannot change the object — you can only point the name somewhere else:

::code-wrapper{language="python"}
```python
x = 10
y = x
y += 1           # creates a NEW int 11, and points y at it
print(x, y)      # 10 11  ← x is untouched
```
::

**Tricky**: `+=` on a list changes the object in place, but `+=` on an int makes a new object. Same operator, different result:

::code-wrapper{language="python"}
```python
a = [1]; b = a
b += [2]
print(a)         # [1, 2]  — list += mutates in place

a = (1,); b = a
b += (2,)
print(a)         # (1,)    — tuple += creates a new tuple
```
::

## Dynamic but Strong Typing

Types belong to **objects**, not names. A name can point to any type at any time:

::code-wrapper{language="python"}
```python
x = 42
x = "forty-two"   # legal
x = [42]          # legal
```
::

But Python is **strongly** typed — it does not silently mix types:

::code-wrapper{language="python"}
```python
"3" + 3          # TypeError: can only concatenate str (not "int") to str
"3" * 3          # '333'  ← this one IS allowed (str repetition)
int("3") + 3     # 6
"3" + str(3)     # '33'
```
::

Compare JavaScript, where `"3" + 3` silently gives `"33"`.

## The Built-in Scalar Types

### `int` — no overflow, ever

::code-wrapper{language="python"}
```python
print(2 ** 100)        # 1267650600228229401496703205376 — exact, no overflow
print(10 ** 20 + 1)    # 100000000000000000001
print(1_000_000)       # 1000000 — underscores are just for reading
```
::

### `float` — binary, so decimals are approximate

::code-wrapper{language="python"}
```python
print(0.1 + 0.2)            # 0.30000000000000004
print(0.1 + 0.2 == 0.3)     # False
print(1e16 + 1 == 1e16)     # True  ← the +1 is lost, floats have ~16 digits

import math
print(math.isclose(0.1 + 0.2, 0.3))   # True — the correct way to compare floats

from decimal import Decimal
print(Decimal("0.1") + Decimal("0.2"))  # 0.3 — exact, use for money
print(Decimal(0.1))   # 0.1000000000000000055511151231257827021181583404541015625
                      # ↑ passing a float copies its error — always pass a STRING
```
::

**Why**: `0.1` has no exact base-2 form, the same way `1/3` has no exact base-10 form (`0.333...`).

`round()` also surprises people — it uses **banker's rounding** (ties go to the even number):

::code-wrapper{language="python"}
```python
print(round(0.5))      # 0   ← not 1
print(round(1.5))      # 2
print(round(2.5))      # 2   ← not 3
print(round(2.675, 2)) # 2.67 ← not 2.68, because 2.675 is really 2.67499999...
```
::

Special float values:

::code-wrapper{language="python"}
```python
nan = float("nan")
print(nan == nan)      # False — NaN is never equal to anything, even itself
print(nan in [nan])    # True  — `in` checks `is` first, then ==
print(math.isnan(nan)) # True  — the correct check

inf = float("inf")
print(inf + 1 == inf)  # True
print(inf > 10**400)   # True
print(-0.0 == 0.0)     # True
```
::

### `bool` — a subclass of `int`

::code-wrapper{language="python"}
```python
print(True + True)           # 2
print(sum([True, False, True]))  # 2 — handy for counting
print(isinstance(True, int)) # True
print(True == 1)             # True

d = {1: "one", True: "true"}
print(d)                     # {1: 'true'}  ← True and 1 are the SAME key!
```
::

**Tricky**: because `True == 1` and `hash(True) == hash(1)`, a dict treats them as one key. The key keeps the first form (`1`) but the value is overwritten.

Validating "must be an int" lets bools in by mistake:

::code-wrapper{language="python"}
```python
def set_retries(n):
    if not isinstance(n, int):
        raise TypeError("int expected")
    return n

print(set_retries(True))     # 1 — accepted! probably a bug

# Correct: exclude bool
def set_retries(n):
    if not isinstance(n, int) or isinstance(n, bool):
        raise TypeError(f"int expected, got {type(n).__name__}")
    return n
```
::

### `None` — the "no value" singleton

::code-wrapper{language="python"}
```python
config = {"debug": False, "timeout": 0}

print(config.get("missing"))        # None
print(config.get("timeout") == None) # False — 0 is not None
print(config.get("missing") is None) # True  — always use `is None`

# WRONG: `if not value` treats 0 and False like "missing"
timeout = config.get("timeout")
if not timeout:
    print("no timeout set")   # prints! but timeout IS set — to 0

# RIGHT
if timeout is None:
    print("no timeout set")   # does not print
```
::

## `is` vs `==`

- `==` asks "same **value**?"
- `is` asks "same **object**?"

::code-wrapper{language="python"}
```python
a = [1, 2]
b = [1, 2]
print(a == b)    # True  — same contents
print(a is b)    # False — two different lists
```
::

**Tricky**: CPython caches small ints (`-5` to `256`), so `is` sometimes "works" by accident:

::code-wrapper{language="python"}
```python
x = int("256"); y = int("256")
print(x is y)    # True  — both use the cached 256

x = int("257"); y = int("257")
print(x is y)    # False — two separate objects
```
::

And it gets stranger — in one script file, the compiler may reuse equal constants, so `a = 257; b = 257; a is b` is `True` in a file but `False` when typed on two REPL lines. **Never** use `is` to compare numbers or strings. Use `is` only for `None`, `True`/`False` singletons and sentinels.

## `type()` vs `isinstance()`

::code-wrapper{language="python"}
```python
class Animal: pass
class Dog(Animal): pass

d = Dog()
print(type(d) == Animal)       # False — exact type only
print(isinstance(d, Animal))   # True  — respects inheritance

print(type(True) == int)       # False — it is bool
print(isinstance(True, int))   # True

print(isinstance(3.0, int | float))   # True — union syntax (3.10+)
```
::

**Best practice**: use `isinstance()`. Use `type(x) is Y` only when you want to reject subclasses on purpose.

## Duck Typing and EAFP

Python cares what an object **can do**, not what it **is**:

::code-wrapper{language="python"}
```python
def total_length(items):
    return sum(len(x) for x in items)

print(total_length(["ab", [1, 2, 3], {"k": 1}]))   # 6 — str, list, dict all have len()
print(total_length([42]))   # TypeError: object of type 'int' has no len()
```
::

Idiomatic Python **tries first and handles failure** (EAFP) instead of checking first (LBYL):

::code-wrapper{language="python"}
```python
data = {"port": "8080"}

# LBYL — check, then act
if "port" in data and data["port"].isdigit():
    port = int(data["port"])

# EAFP — try, handle the failure
try:
    port = int(data["port"])
except (KeyError, ValueError):
    port = 80
```
::

## Converting Types

::code-wrapper{language="python"}
```python
print(int("42"))        # 42
print(int("  42\n"))    # 42    — whitespace is stripped
print(int("1_000"))     # 1000  — underscores allowed
print(int("3.14"))      # ValueError — int() won't parse a float string
print(int(float("3.14")))   # 3
print(int(-3.7))        # -3    — truncates toward zero (NOT floor)
print(int("ff", 16))    # 255
print(float("1e3"))     # 1000.0
print(str(None))        # 'None'
print(bool("False"))    # True  ← any NON-EMPTY string is truthy
```
::

## Truthiness

**Falsy**: `False`, `None`, `0`, `0.0`, `0j`, `""`, `()`, `[]`, `{}`, `set()`, `range(0)`.

**Everything else is truthy**, including some surprises:

::code-wrapper{language="python"}
```python
print(bool("0"))       # True  — non-empty string
print(bool(" "))       # True  — a space is a character
print(bool([0]))       # True  — non-empty list
print(bool([[]]))      # True  — a list holding an empty list is not empty
print(bool(-1))        # True  — only 0 is falsy
print(bool(0.0))       # False
print(bool(-0.0))      # False
```
::

## Naming Rules and Conventions

::code-wrapper{language="python"}
```python
user_name = "ada"        # snake_case for variables/functions
MAX_RETRIES = 3          # UPPER_CASE for constants (convention only)
_internal = 1            # leading underscore = "private" hint

# 1st = 1               # SyntaxError — can't start with a digit
# my-var = 1            # SyntaxError — that's "my minus var"

list = [1, 2, 3]         # legal, but now the built-in list() is hidden!
# list("abc")            # TypeError: 'list' object is not callable
del list                 # removes your name, built-in comes back
print(list("abc"))       # ['a', 'b', 'c']
```
::

| Convention | Meaning |
|---|---|
| `snake_case` | Variables and functions (PEP 8). |
| `PascalCase` | Class names. |
| `UPPER_SNAKE_CASE` | Constants — still reassignable. |
| `_leading_underscore` | "Internal" hint, not enforced. |
| `__double_leading` | Name mangling inside classes (chapter 12). |
| `__dunder__` | Reserved for Python (`__init__`, `__len__`). |

## Multiple Assignment

::code-wrapper{language="python"}
```python
a, b = 1, 2
a, b = b, a           # swap — right side is built first
print(a, b)           # 2 1

x = y = []            # ONE list, two names
x.append(1)
print(y)              # [1]  ← surprise!

x, y = [], []         # two separate lists
```
::

## 💡 Tips & Tricks

- **Debug** — `type(x).__name__` gives a clean `"int"` for error messages instead of `<class 'int'>`.
- **Readability** — use `1_000_000` for big numbers.
- **Idiom** — `sum(flags)` counts `True` values in a list of bools.
- **Idiom** — `x if x is not None else default` keeps valid falsy values like `0` and `""`; `x or default` does not.
- **Precision** — use `Decimal("0.1")` (a string!) for money, never `Decimal(0.1)`.
- **Safety** — don't name variables `list`, `dict`, `str`, `id`, `type`, `input` — you hide the built-in.

## ⚠️ Edge Cases & Gotchas

- **Identity** — `is` on ints/strings works "sometimes" because of caching. It is an implementation detail. Use `==`.
- **Bool** — `True` is an `int`. `{1: "a", True: "b"}` has only one key. `isinstance(True, int)` is `True`.
- **Float** — `0.1 + 0.2 != 0.3`. Use `math.isclose()` or `Decimal`.
- **Rounding** — `round(2.5) == 2`. Python uses banker's rounding.
- **Truncation** — `int(-3.7) == -3` (toward zero), but `-7 // 2 == -4` (floor). See chapter 03.
- **NaN** — `nan != nan`, so `nan in [nan]` is `True` only because `in` checks identity first.
- **Chained assignment** — `a = b = []` shares one list.

## 🧠 Quick Quiz

What does each line print?

::code-wrapper{language="python"}
```python
print(bool("False"))
print({True: "yes", 1: "no", 1.0: "maybe"})
print(round(3.5) + round(4.5))
print(int("08"))
```
::

<details>
<summary>Answer</summary>

::code-wrapper{language="bash"}
```bash
True
{True: 'maybe'}
8
8
```
::

1. `"False"` is a non-empty string → truthy.
2. `True`, `1` and `1.0` are equal and have the same hash → one key. The first key form (`True`) stays, the last value (`'maybe'`) wins.
3. Banker's rounding: `round(3.5) == 4`, `round(4.5) == 4` → `8`.
4. `int()` on a string accepts leading zeros. (The **literal** `08` in code is a `SyntaxError`, though!)

</details>

## Key Takeaways

- Names point to objects. Assignment never copies.
- Python is dynamically but strongly typed — no silent `"3" + 3`.
- `int` never overflows; `float` is approximate; `bool` is an `int`.
- Use `==` for values, `is` only for `None` and sentinels.
- Prefer `isinstance()` over `type() ==`.
- Use `is None`, not truthiness, when `0`, `""` or `False` are valid values.
