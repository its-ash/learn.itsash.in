# 05 — Functions

## Defining Functions

::code-wrapper{language="python"}
```python
def greet(name):
    """Return a friendly greeting for the given name."""
    return f"Hello, {name}!"

print(greet("Ada"))   # Hello, Ada!
print(greet.__doc__)   # Return a friendly greeting for the given name.
```
::

Functions are **first-class objects** — they can be assigned to variables, stored in data structures, passed as arguments, and returned from other functions. A function with no explicit `return` returns `None`.

::code-wrapper{language="python"}
```python
def no_return():
    x = 1 + 1   # no return statement

result = no_return()
print(result)   # None
```
::

## Positional, Keyword, and Default Arguments

::code-wrapper{language="python"}
```python
def create_user(name, role="member", active=True):
    return {"name": name, "role": role, "active": active}

print(create_user("Ada"))                          # positional only
print(create_user("Grace", role="admin"))            # mix positional + keyword
print(create_user(name="Alan", active=False))          # all keyword, any order
print(create_user("Linus", "admin", False))              # all positional
```
::

### Positional-only and keyword-only parameters

::code-wrapper{language="python"}
```python
def divide(a, b, /, *, precision=2):
    # `/` marks everything before it as positional-only
    # `*` marks everything after it as keyword-only
    return round(a / b, precision)

print(divide(10, 3))                 # OK — a, b positional
print(divide(10, 3, precision=4))     # OK — precision is keyword-only
# divide(a=10, b=3)                  # TypeError — a, b are positional-only
# divide(10, 3, 4)                    # TypeError — precision must be passed by keyword
```
::

Positional-only parameters (`/`, since 3.8) let library authors rename internal parameter names later without breaking callers who pass by position — a real API-stability concern in widely-used libraries.

## The Mutable Default Argument Trap

This is Python's single most famous gotcha, and it exists because **default argument values are evaluated exactly ONCE, at function definition time — not on every call.**

::code-wrapper{language="python"}
```python
# WRONG — the beginner's version
def add_item(item, cart=[]):
    cart.append(item)
    return cart

cart1 = add_item("apple")
print(cart1)                 # ['apple']
cart2 = add_item("banana")
print(cart2)                  # ['apple', 'banana']  <- BUG: apple leaked in!
print(cart1 is cart2)           # True — they're literally the SAME list object
```
::

**The mechanism**: `def add_item(item, cart=[]):` creates the empty list `[]` exactly once, when the `def` statement executes (i.e., when the module is imported/loaded), and stores it as part of the function object itself (`add_item.__defaults__`). Every call that doesn't explicitly pass `cart` reuses that *same* list object. Because lists are mutable, `.append()` mutates the shared default in place, and the mutation persists across calls.

::code-wrapper{language="python"}
```python
# RIGHT — use None as a sentinel default, create the mutable object inside
def add_item(item, cart=None):
    if cart is None:
        cart = []
    cart.append(item)
    return cart

cart1 = add_item("apple")
print(cart1)              # ['apple']
cart2 = add_item("banana")
print(cart2)                # ['banana']  — correct, independent lists
print(cart1 is cart2)          # False
```
::

::code-wrapper{language="python"}
```python
# You can inspect the trap directly:
print(add_item.__defaults__)   # (None,) — the sentinel, not a shared list
```
::

This gotcha applies to **any mutable default**: lists, dicts, sets, and custom mutable objects. Immutable defaults (`None`, numbers, strings, tuples) are completely safe because they can't be mutated in place — there's nothing to leak.

## `*args` and `**kwargs`

::code-wrapper{language="python"}
```python
def summarize(*args, **kwargs):
    print("positional:", args)      # a tuple
    print("keyword:", kwargs)         # a dict

summarize(1, 2, 3, name="Ada", role="admin")
# positional: (1, 2, 3)
# keyword: {'name': 'Ada', 'role': 'admin'}
```
::

### Real-world use: transparent wrapper/proxy functions

::code-wrapper{language="python"}
```python
import logging
import time

def timed(func):
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)     # forward EVERYTHING, whatever the signature
        elapsed = time.perf_counter() - start
        logging.info(f"{func.__name__} took {elapsed:.4f}s")
        return result
    return wrapper

@timed
def fetch_report(user_id, *, include_archived=False):
    return {"user_id": user_id, "archived": include_archived}

fetch_report(42, include_archived=True)
```
::

### Unpacking with `*` and `**` at the call site

::code-wrapper{language="python"}
```python
def move(x, y, z):
    return f"Moving to ({x}, {y}, {z})"

coords = [1, 2, 3]
print(move(*coords))          # unpacks list -> move(1, 2, 3)

params = {"x": 1, "y": 2, "z": 3}
print(move(**params))           # unpacks dict -> move(x=1, y=2, z=3)

# Merging dicts (3.5+) uses the same ** syntax
defaults = {"role": "member", "active": True}
overrides = {"role": "admin"}
merged = {**defaults, **overrides}   # {'role': 'admin', 'active': True}
```
::

### Argument order rules

When combining all forms, the required order is: standard positional/keyword params, then `*args`, then keyword-only params, then `**kwargs`.

::code-wrapper{language="python"}
```python
def full_signature(pos_only, /, standard, *args, kw_only, **kwargs):
    return pos_only, standard, args, kw_only, kwargs

print(full_signature(1, 2, 3, 4, kw_only=5, extra=6))
# (1, 2, (3, 4), 5, {'extra': 6})
```
::

## Type Annotations (Preview — Full Coverage in Chapter 20)

::code-wrapper{language="python"}
```python
def calculate_discount(price: float, percent: float = 10.0) -> float:
    return price * (1 - percent / 100)

print(calculate_discount(100.0))          # 90.0
print(calculate_discount(100.0, 25))        # 75.0
```
::

**Critical**: annotations are **not enforced at runtime by the interpreter**. They're metadata for humans, IDEs, and external tools like `mypy`.

::code-wrapper{language="python"}
```python
def add(a: int, b: int) -> int:
    return a + b

print(add("hello", "world"))   # "helloworld" — NO error, annotations are NOT checked!
print(add.__annotations__)      # {'a': <class 'int'>, 'b': <class 'int'>, 'return': <class 'int'>}
```
::

## Docstrings

::code-wrapper{language="python"}
```python
def calculate_bmi(weight_kg: float, height_m: float) -> float:
    """Calculate Body Mass Index.

    Args:
        weight_kg: Body weight in kilograms.
        height_m: Height in meters.

    Returns:
        BMI as weight_kg / height_m ** 2.

    Raises:
        ValueError: If height_m is not positive.
    """
    if height_m <= 0:
        raise ValueError("height_m must be positive")
    return weight_kg / height_m ** 2
```
::

This Google-style docstring format is widely adopted (also common: NumPy-style and reStructuredText/Sphinx-style). Tools like `pydoc`, Sphinx, and IDEs render `__doc__` directly — `help(calculate_bmi)` prints it in the REPL.

## Closures Over Loop Variables — The Late-Binding Trap

Closures capture **variables by reference to their enclosing scope, not by value at definition time**. Combined with the fact that Python's `for` loop variable is a single reused name (not a fresh binding per iteration, unlike some other languages), this produces one of Python's most common real-world bugs.

::code-wrapper{language="python"}
```python
# WRONG — every closure captures the SAME variable `i`, evaluated LATE (at call time)
funcs = []
for i in range(3):
    funcs.append(lambda: i)

print([f() for f in funcs])   # [2, 2, 2] — NOT [0, 1, 2]!
```
::

**The mechanism**: the `lambda: i` doesn't capture the *value* of `i` at the moment the lambda is created — it captures the *variable* `i` itself (a reference to the enclosing scope's cell). By the time any of the lambdas are actually called, the loop has finished and `i` holds its final value, `2`. All three lambdas look up the same cell and see the same final value.

::code-wrapper{language="python"}
```python
# RIGHT — force early binding via a default argument
# (default argument values ARE evaluated once, at def time — see the trap above,
#  here that "gotcha" becomes the FIX)
funcs = []
for i in range(3):
    funcs.append(lambda i=i: i)   # i=i evaluates the CURRENT i, binds it as a default

print([f() for f in funcs])   # [0, 1, 2] — correct
```
::

::code-wrapper{language="python"}
```python
# ALTERNATIVE — a factory function creates a genuinely new scope per call
def make_getter(value):
    return lambda: value

funcs = [make_getter(i) for i in range(3)]
print([f() for f in funcs])   # [0, 1, 2] — correct, each call creates a fresh `value`
```
::

This exact bug commonly appears in real code building lists of callbacks (event handlers, button click handlers, deferred tasks queued in a loop) — anywhere a closure is created inside a loop and called later.

## Recursion

::code-wrapper{language="python"}
```python
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

print(factorial(10))   # 3628800
```
::

Python has **no tail-call optimization**, unlike Scheme or some functional languages — deep recursion consumes real stack frames and hits `sys.getrecursionlimit()` (default 1000).

::code-wrapper{language="python"}
```python
import sys

def count_down(n):
    if n <= 0:
        return
    count_down(n - 1)

print(sys.getrecursionlimit())   # 1000
try:
    count_down(10_000)
except RecursionError as e:
    print(f"Blew the stack: {e}")
```
::

**Best practice**: convert deep recursion to an explicit loop with a stack/queue data structure for any code that might process user-controlled or unbounded-depth input (tree traversal on untrusted data, recursive descent parsers on adversarial input). Don't just raise `sys.setrecursionlimit()` — that risks a genuine C-level stack overflow (segfault) rather than a clean Python exception, since Python's recursion limit is a soft guard around the underlying C call stack.

## 💡 Tips & Tricks

- **`functools.lru_cache` memoizes recursive functions for free** — `@functools.lru_cache(maxsize=None)` on a pure recursive function (like naive Fibonacci) turns exponential time into linear time with one line — covered fully in chapter 10.
- **`*` alone (no name) forces keyword-only arguments without collecting `**kwargs`** — `def f(a, b, *, c):` makes `c` keyword-only without needing to accept arbitrary extra keywords.
- **Use `inspect.signature()` to introspect a function's parameters at runtime** — useful for building decorators or CLI argument parsers that need to validate calls against a function's real signature.
- **Docstrings are runtime-accessible data, not just comments** — `func.__doc__`, `help(func)`, and Sphinx's autodoc all read the same string; write them like documentation, not like comments.
- **`return` with no value and no `return` statement at all both return `None`** — but an explicit bare `return` is idiomatic for "exit early," communicating intent more clearly than letting control fall off the end of the function.

## ⚠️ Edge Cases & Gotchas

- **Mutable default arguments are evaluated once at `def` time and shared across every call that doesn't override them** — the single most common real-world Python bug in this list; always default mutable arguments to `None` and construct the real object inside the function body.
- **Closures in loops capture variables late (by reference), not values at creation time** — a list of lambdas/functions built inside a `for` loop will all see the loop variable's *final* value unless you force early binding via a default-argument trick or a factory function.
- **`RecursionError` is a soft limit, not a memory guarantee** — Python's `sys.getrecursionlimit()` protects the *interpreter's* C stack, but raising the limit arbitrarily high can still crash the process with a real segfault before Python's own check fires, especially in C-extension-heavy call stacks.
- **Annotations are not runtime type checks** — `def f(x: int)` does not stop you from calling `f("a string")`; nothing raises unless you separately run `mypy`/`pyright` or explicitly validate types yourself (e.g., with `pydantic` or manual `isinstance` checks) — this trips up developers coming from statically-typed languages who expect a `TypeError` at the call site.
- **Argument-order rules for `*args`/`**kwargs`/keyword-only params are strict and easy to get backwards** — `def f(a, *args, b, **kwargs)` is valid (keyword-only `b` after `*args`); `def f(a, **kwargs, b)` is a `SyntaxError` — `**kwargs` must always be last.

## 🧠 Spot the Bug

A junior developer writes a logging helper. What goes wrong after the app has been running for a while?

::code-wrapper{language="python"}
```python
def log_event(message, history=[]):
    history.append(message)
    if len(history) > 3:
        print(f"Recent events: {history[-3:]}")
    return history

log_event("user login")
log_event("page view")
log_event("user login")     # what does the "Recent events" list contain over time?
log_event("page view")
```
::

<details>
<summary>Answer</summary>

`history=[]` is a single list object created once when `log_event` is defined, shared across **every call** to the function for the lifetime of the program — not just within one "session." Every call without an explicit `history` argument appends to that same list forever, so `history` grows unboundedly across unrelated calls (a memory leak in long-running processes like a web server), and any code that assumes each call starts with a fresh, empty history is simply wrong. Worse, if two different parts of a codebase call `log_event(msg)` expecting independent histories, they silently share state.

The fix: `def log_event(message, history=None): history = [] if history is None else history`.

**The lesson**: mutable default arguments are a footgun specifically because Python function objects are created once and persist for the process lifetime — their defaults are ordinary attributes on that long-lived object, not fresh values conjured per call.

</details>

## Key Takeaways

- Functions are first-class objects; a function without an explicit `return` returns `None`.
- Default argument values are evaluated exactly once, at `def` time — never use a mutable literal (`[]`, `{}`, `set()`) as a default; use `None` and construct inside the function body instead.
- `*args` collects extra positional arguments into a tuple; `**kwargs` collects extra keyword arguments into a dict; `*`/`/` in a signature enforce keyword-only/positional-only parameters.
- Type annotations are documentation and tooling metadata only — the interpreter never enforces them at runtime; use `mypy`/`pyright` for static checking (chapter 20).
- Closures capture enclosing variables by reference and resolve them at call time, not definition time — loop variables captured by closures created inside a loop all see the loop's final value unless you force early binding.
- Python has no tail-call optimization; deep recursion hits a soft `RecursionError` limit protecting the real C stack — convert unbounded recursion to iteration for untrusted or unbounded-depth input.
