# 03 — Operators & Expressions

## Arithmetic Operators

::code-wrapper{language="python"}
```python
print(7 + 3)     # 10
print(7 - 3)     # 4
print(7 * 3)     # 21
print(7 / 3)     # 2.3333333333333335  — true division, ALWAYS returns float
print(7 // 3)    # 2                    — floor division, truncates toward -inf
print(7 % 3)     # 1                    — modulo
print(7 ** 3)    # 343                  — exponentiation
print(-7 // 3)   # -3  NOT -2!          — floors toward negative infinity
print(-7 % 3)    # 2                    — result takes the sign of the divisor
```
::

### `//` floors, it does not truncate — the classic C-programmer trap

::code-wrapper{language="python"}
```python
# A C/Java programmer expects integer division to truncate toward zero
print(-7 // 2)     # -4  (floors toward -infinity: -3.5 -> -4)
print(int(-7 / 2))  # -3  (truncates toward zero: -3.5 -> -3)

# These are DIFFERENT operations with different results for negative operands
```
::

This matters in real code: pagination math, hashing, and modular arithmetic that assumes C-style truncation will silently produce off-by-one bugs on negative inputs in Python.

## Comparison Operators

::code-wrapper{language="python"}
```python
print(3 < 5)         # True
print(3 <= 3)         # True
print(3 == 3.0)        # True  — value equality across numeric types
print(3 != "3")         # True — different types, never equal
print([1, 2] == [1, 2])  # True — lists compare by value, element-wise
print([1, 2] is [1, 2])  # False — two distinct list objects
```
::

## `is` vs `==` — Identity vs Equality

This is the single most important distinction in this chapter.

- **`==`** calls `__eq__` and asks: "do these objects have the same *value*?"
- **`is`** asks: "are these literally the *same object* in memory (same `id()`)?"

::code-wrapper{language="python"}
```python
a = [1, 2, 3]
b = [1, 2, 3]
c = a

print(a == b)   # True  — same contents
print(a is b)   # False — two distinct list objects with equal contents
print(a is c)   # True  — c is literally a, same object
print(id(a), id(b), id(c))  # a and c share an id; b is different
```
::

**Rule of thumb**: use `==` for value comparisons (the overwhelming majority of cases). Use `is` only for:
1. Comparing against `None`: `if x is None`
2. Comparing against other singletons: `if x is Ellipsis`, `if x is NotImplemented`
3. Deliberate identity checks (e.g., "is this the exact cached instance", sentinel objects)

::code-wrapper{language="python"}
```python
_SENTINEL = object()  # a unique, unforgeable sentinel

def get(d, key, default=_SENTINEL):
    if key in d:
        return d[key]
    if default is _SENTINEL:
        raise KeyError(key)
    return default
```
::

Using a private `object()` instance as a sentinel (rather than `None`) lets a function distinguish "no default was passed" from "the caller explicitly passed `None` as the default" — a pattern impossible to express correctly with `is None` checks alone.

## Chained Comparisons

Python allows mathematical-style chaining, which is evaluated left-to-right with implicit `and`, and — critically — **each subexpression is evaluated only once**.

::code-wrapper{language="python"}
```python
x = 5
print(1 < x < 10)          # True — equivalent to (1 < x) and (x < 10)
print(10 > x > 1)          # True
print(1 < x < 10 < 3)      # False — chains can mix any comparison operators

# The single-evaluation guarantee matters with side effects:
def noisy(n):
    print(f"checked {n}")
    return n

print(0 < noisy(5) < 10)
# prints "checked 5" ONCE — not twice, unlike a naive `0 < noisy(5) and noisy(5) < 10`
```
::

### The gotcha: chained comparisons with `==` create surprising boolean logic

::code-wrapper{language="python"}
```python
# A beginner might write this expecting "is x equal to 1 OR 2?"
x = 3
print(x == 1 or 2)     # TRUTHY — this is (x == 1) or (2), and 2 is truthy!
print(bool(x == 1 or 2))  # True — ALWAYS true, regardless of x, because `2` is truthy

# What they meant:
print(x == 1 or x == 2)   # False — correct
print(x in (1, 2))         # False — idiomatic
```
::

## Logical Operators — `and`/`or` Return Operands, Not Booleans

Unlike C-family languages, `and`/`or` in Python don't coerce to `bool` — they short-circuit and return one of the **original operands**.

::code-wrapper{language="python"}
```python
print(3 and 5)        # 5   — both truthy, returns the LAST evaluated operand
print(0 and 5)         # 0   — first is falsy, short-circuits, returns it
print(3 or 5)           # 3   — first is truthy, short-circuits, returns it
print(None or "default") # "default" — classic default-value idiom
print([] or {})           # {}  — both falsy-ish, returns the last one evaluated
```
::

This enables the extremely common **default-value idiom**:

::code-wrapper{language="python"}
```python
def greet(name=None):
    name = name or "stranger"
    return f"Hello, {name}!"
```
::

**Gotcha**: this idiom breaks when a legitimate, intentionally-falsy value should be accepted:

::code-wrapper{language="python"}
```python
def set_volume(level=None):
    level = level or 50          # BUG: set_volume(0) becomes 50, not 0!
    return level

print(set_volume(0))    # 50 — wrong! Caller explicitly wanted silence.

# Correct: check for None explicitly, don't rely on truthiness
def set_volume_fixed(level=None):
    level = 50 if level is None else level
    return level

print(set_volume_fixed(0))   # 0 — correct
```
::

## Bitwise Operators

::code-wrapper{language="python"}
```python
print(5 & 3)     # 1    — AND
print(5 | 3)      # 7    — OR
print(5 ^ 3)       # 6    — XOR
print(~5)           # -6   — NOT (two's complement: ~x == -x - 1)
print(5 << 2)         # 20   — left shift (multiply by 2**2)
print(5 >> 1)           # 2    — right shift (floor-divide by 2**1)

# Sets also overload these for set algebra (see chapter 08)
print({1, 2, 3} & {2, 3, 4})   # {2, 3} — intersection
print({1, 2, 3} | {2, 3, 4})   # {1, 2, 3, 4} — union
```
::

## Augmented Assignment (`+=`, `-=`, etc.)

::code-wrapper{language="python"}
```python
x = 5
x += 3     # x = x + 3
print(x)   # 8
```
::

### The gotcha: `+=` on a list is an in-place mutation, but reassignment inside a function is not

::code-wrapper{language="python"}
```python
def append_wrong(lst):
    lst = lst + [4]    # creates a NEW list, rebinds the LOCAL name `lst`
                        # the caller's list is untouched
    return lst

def append_right(lst):
    lst += [4]          # for lists, += calls __iadd__ -> mutates IN PLACE
    return lst           # (also rebinds locally, but the object itself changed)

original = [1, 2, 3]
result = append_wrong(original)
print(original)    # [1, 2, 3]        — unchanged
print(result)        # [1, 2, 3, 4]

original2 = [1, 2, 3]
result2 = append_right(original2)
print(original2)    # [1, 2, 3, 4]     — MUTATED, because list defines __iadd__
print(result2)        # [1, 2, 3, 4]
```
::

The underlying mechanism: `lst = lst + [4]` calls `__add__`, which returns a *brand-new* list, and rebinding only affects the local name. `lst += [4]` calls `__iadd__` if it exists (lists define it, tuples don't) which mutates the object in place and returns `self` — so the caller's original object is affected too. For **tuples** (immutable, no `__iadd__`), `+=` silently falls back to `__add__` and just rebinds, exactly like the list `+` case — no mutation is possible because tuples can't be mutated.

::code-wrapper{language="python"}
```python
t = (1, 2, 3)
t += (4,)     # falls back to t = t + (4,) — creates a new tuple
print(t)       # (1, 2, 3, 4)
```
::

### The genuinely infamous one: `+=` inside a tuple element

::code-wrapper{language="python"}
```python
t = ([1, 2], 3)
t[0] += [4]
# TypeError: 'tuple' object does not support item assignment
# ...BUT the list was mutated anyway before the error!
print(t)   # ([1, 2, 4], 3)
```
::

**Why**: `t[0] += [4]` desugars to `t[0] = t[0].__iadd__([4])`. The `__iadd__` call *succeeds* (lists are mutable, so `t[0]` — the list — is mutated to `[1, 2, 4]` in place and returns itself). But then Python tries to execute `t[0] = <result>` — assigning into the tuple's slot — which raises `TypeError` because tuples don't support item assignment. The mutation already happened before the failed assignment step, leaving the tuple in a state that looks "impossible" if you don't know the two-step desugaring.

## The Walrus Operator `:=` (Assignment Expressions)

Introduced in Python 3.8 ([PEP 572](https://peps.python.org/pep-0572/)), `:=` lets you assign a value **as part of a larger expression**, avoiding redundant computation or a separate statement.

::code-wrapper{language="python"}
```python
# Before 3.8 — compute twice or add a throwaway statement
data = get_data()
if data:
    process(data)

# With walrus — assign and test in one expression
if (data := get_data()):
    process(data)
```
::

### Real-world use: avoiding repeated expensive calls in a loop

::code-wrapper{language="python"}
```python
import re

pattern = re.compile(r"(\d+)")
lines = ["order 42 shipped", "no numbers here", "order 108 shipped"]

# Without walrus — the match object is computed, discarded, computed again
results = []
for line in lines:
    if pattern.search(line):
        results.append(pattern.search(line).group(1))   # searches TWICE

# With walrus — search once, bind it, reuse it
results = []
for line in lines:
    if (match := pattern.search(line)):
        results.append(match.group(1))

print(results)   # ['42', '108']
```
::

### Walrus inside comprehensions

::code-wrapper{language="python"}
```python
# Filter and transform using a value that's expensive to compute, without
# calling the expensive function twice per element
def expensive_check(n):
    return n * n

numbers = [1, 2, 3, 4, 5, 6]
squared_evens = [y for n in numbers if (y := expensive_check(n)) % 2 == 0]
print(squared_evens)   # [4, 16, 36]
```
::

**Gotcha**: the walrus operator creates a binding that **leaks into the enclosing scope** — unlike the loop variable of a comprehension (which is scoped to the comprehension in Python 3), a walrus target is NOT scoped to the comprehension.

::code-wrapper{language="python"}
```python
result = [y := x * 2 for x in range(3)]
print(y)    # 4 — leaked out of the comprehension into the enclosing scope!
print(x)    # NameError — the comprehension's own loop variable `x` did NOT leak
```
::

## Operator Precedence (Abbreviated)

From highest to lowest (a small but high-value subset):

| Precedence | Operators |
|---|---|
| Highest | `**` (exponentiation, right-associative) |
| | unary `+x`, `-x`, `~x` |
| | `*`, `/`, `//`, `%` |
| | `+`, `-` |
| | `<<`, `>>` |
| | `&` |
| | `^` |
| | `\|` |
| | comparisons: `<`, `<=`, `>`, `>=`, `!=`, `==`, `in`, `not in`, `is`, `is not` |
| | `not x` |
| | `and` |
| Lowest | `or` |

::code-wrapper{language="python"}
```python
# ** is right-associative — surprising if you expect left-to-right
print(2 ** 3 ** 2)   # 512, NOT 64!  Evaluated as 2 ** (3 ** 2) = 2 ** 9

# Unary minus binds tighter than ** on the LEFT but not cleanly on both sides
print(-2 ** 2)    # -4, NOT 4 — this is -(2 ** 2), because ** binds tighter than unary -
print((-2) ** 2)   # 4 — parenthesize to get what you probably meant
```
::

## 💡 Tips & Tricks

- **`math.isclose()` for float comparisons** — Never compare floats with `==`; `math.isclose(a, b, rel_tol=1e-9)` handles the inherent binary rounding error correctly, with configurable relative/absolute tolerance.
- **`divmod()` for quotient and remainder together** — `divmod(17, 5)` returns `(3, 2)` in one call, avoiding two separate `//` and `%` operations when you need both (common in time/unit conversion code).
- **Chained comparisons replace verbose range checks** — `if 0 <= age < 120:` is both more readable and marginally faster than `if age >= 0 and age < 120:` since the shared subexpression is evaluated once.
- **The walrus operator shines in `while` loops reading streams** — `while (chunk := file.read(8192)):` is the idiomatic replacement for the old `chunk = file.read(8192); while chunk: ...; chunk = file.read(8192)` duplicated-read anti-pattern.
- **`operator` module gives you operators as functions** — `from operator import add, itemgetter, attrgetter` lets you pass `+`, item access, or attribute access as first-class callables to `sorted(key=...)`, `reduce`, or `map` without writing a `lambda`.

## ⚠️ Edge Cases & Gotchas

- **`or`/`and` return operands, not booleans, and the truthy-default idiom silently breaks on legitimate falsy values** — `x = value or default` treats `0`, `""`, `[]`, and `False` as "absent," which is wrong whenever those are valid inputs (see the `set_volume(0)` example above). Use `x = default if value is None else value` whenever `None` specifically (not any falsy value) means "absent."
- **Floor division floors toward negative infinity, not toward zero** — `-7 // 2 == -4`, not `-3`. Code ported from C/Java that assumes truncation-toward-zero semantics for negative operands will be off by one.
- **`**` is right-associative; unary minus has lower precedence than `**`** — `2 ** 3 ** 2` is `512` (right-associative), and `-2 ** 2` is `-4` (unary minus applies after exponentiation). Both surprise programmers coming from languages with different precedence tables — parenthesize when in doubt.
- **`a += b` mutates in place for mutable types with `__iadd__` (list) but rebinds for immutable types (tuple, str, int)** — the same syntax has different aliasing consequences depending entirely on the type of `a`, which is invisible at the call site without knowing the type.
- **Chained `is` comparisons across `and`/`or` don't chain like `<`** — `a is b is c` DOES chain (`(a is b) and (b is c)`), but mixing `is` with `or` doesn't do what a beginner porting mathematical-notation intuition expects, per the `x == 1 or 2` example — `or`/`and` never implicitly distribute across a value the way chained comparisons do.

## 🧠 Spot the Bug

What does this print?

::code-wrapper{language="python"}
```python
def get_cache_entry(cache, key):
    value = cache.get(key) or "MISS"
    return value

cache = {"count": 0, "name": "widget"}
print(get_cache_entry(cache, "count"))
print(get_cache_entry(cache, "name"))
print(get_cache_entry(cache, "missing"))
```
::

<details>
<summary>Answer</summary>

Prints `MISS`, `widget`, `MISS`. The bug: `cache.get("count")` correctly returns `0` (a legitimate cached value), but `0 or "MISS"` evaluates to `"MISS"` because `0` is falsy — the function can never distinguish "the cached value is genuinely `0`" from "the key is absent." Only the second call behaves as intended, because `"widget"` happens to be truthy.

The fix uses a sentinel or explicit `None` check against a dict's actual absence signal:
::code-wrapper{language="python"}
```python
def get_cache_entry(cache, key):
    value = cache.get(key)
    return "MISS" if value is None else value
```
::

This still has a narrower edge case if `None` is itself a valid cached value — in that case use `key in cache` or `cache.get(key, _SENTINEL) is _SENTINEL` instead.

**The lesson**: `or` as a "use this if the left side is missing" idiom conflates *falsy* with *absent* — they are only the same thing if you've proven the valid value space never includes `0`, `""`, `[]`, or `False`.

</details>

## Key Takeaways

- `/` always returns a `float` (true division); `//` floors toward negative infinity, it does not truncate toward zero.
- Use `==` for value comparisons and `is` only for `None`/singleton/sentinel identity checks — never for general value comparison, even on ints or strings.
- `and`/`or` short-circuit and return one of the original operands, not a coerced boolean — this powers (and can silently break) the `x = value or default` idiom.
- `+=` mutates in place for types with `__iadd__` (like `list`) but rebinds for immutable types (like `tuple`) — the same syntax, different aliasing behavior depending on type.
- The walrus operator (`:=`) assigns as part of an expression and is invaluable for avoiding duplicate computation in `if`/`while`/comprehensions, but its binding leaks into the enclosing scope.
