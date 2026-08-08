# 11 — Closures & Decorators

## Closures: Functions That Remember

A **closure** is an inner function that captures variables from its enclosing (lexical) scope, keeping them alive even after the outer function has returned.

::code-wrapper{language="python"}
```python
def make_multiplier(factor):
    def multiply(x):
        return x * factor       # `factor` is captured from the enclosing scope
    return multiply

double = make_multiplier(2)
triple = make_multiplier(3)

print(double(5))   # 10
print(triple(5))     # 15
print(double.__closure__)   # (<cell at 0x...: int object at 0x...>,)
print(double.__closure__[0].cell_contents)   # 2
```
::

Each call to `make_multiplier` creates a fresh scope with its own `factor`. `double` and `triple` are independent closures, each carrying its own private, persistent copy of that variable — this is how Python implements "objects with one method and hidden state" without writing a class.

## `nonlocal` — Mutating an Enclosing Variable

By default, assigning to a name inside a nested function creates a **new local variable** in that nested function, shadowing the outer one rather than modifying it. `nonlocal` opts out of that.

::code-wrapper{language="python"}
```python
def make_counter():
    count = 0
    def increment():
        count += 1     # UnboundLocalError without nonlocal — this is an assignment,
        return count    # which makes `count` local to `increment` by default
    return increment

counter = make_counter()
# counter()   # UnboundLocalError: local variable 'count' referenced before assignment
```
::

::code-wrapper{language="python"}
```python
def make_counter():
    count = 0
    def increment():
        nonlocal count   # explicitly binds `count` to the enclosing scope's variable
        count += 1
        return count
    return increment

counter = make_counter()
print(counter())   # 1
print(counter())     # 2
print(counter())       # 3

other_counter = make_counter()
print(other_counter())   # 1 — independent closure, independent state
```
::

`nonlocal` looks outward through enclosing function scopes (not the module/global scope — that's what `global` is for) and requires the name to already exist in one of those enclosing scopes, unlike `global`, which will happily create a new module-level name.

## The Late-Binding Closure Trap

::code-wrapper{language="python"}
```python
# WRONG — every closure captures the SAME variable `i`, not its value at creation time
callbacks = []
for i in range(3):
    callbacks.append(lambda: i)

print([cb() for cb in callbacks])   # [2, 2, 2] — NOT [0, 1, 2]!
```
::

Closures capture **variables by reference**, not values by copy. By the time any callback is *called*, the loop has finished and `i` holds its final value (`2`) — all three lambdas share that one cell.

::code-wrapper{language="python"}
```python
# RIGHT — default argument evaluated ONCE, at function-definition time, per iteration
callbacks_fixed = []
for i in range(3):
    callbacks_fixed.append(lambda i=i: i)   # binds the CURRENT value of i as a default

print([cb() for cb in callbacks_fixed])   # [0, 1, 2] — correct

# RIGHT (alternative) — a factory function creates a genuinely new scope per call
def make_callback(i):
    return lambda: i

callbacks_factory = [make_callback(i) for i in range(3)]
print([cb() for cb in callbacks_factory])   # [0, 1, 2] — correct
```
::

This is one of Python's most common interview-gotcha topics, and it bites in real code most often with GUI event handlers and async callbacks registered inside a loop.

## Decorators: Functions That Wrap Functions

A decorator is a callable that takes a function and returns a (usually different) callable — `@decorator` above a `def` is pure syntactic sugar.

::code-wrapper{language="python"}
```python
def shout(func):
    def wrapper(*args, **kwargs):
        result = func(*args, **kwargs)
        return result.upper()
    return wrapper

@shout
def greet(name):
    return f"hello, {name}"

print(greet("ada"))   # HELLO, ADA

# @shout is exactly equivalent to:
def greet2(name):
    return f"hello, {name}"
greet2 = shout(greet2)
print(greet2("ada"))   # HELLO, ADA
```
::

### A real-world timing decorator

::code-wrapper{language="python"}
```python
import time
from functools import wraps

def timed(func):
    @wraps(func)                   # preserves __name__, __doc__ — see chapter 10
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        try:
            return func(*args, **kwargs)
        finally:
            elapsed = time.perf_counter() - start
            print(f"{func.__name__} took {elapsed:.4f}s")
    return wrapper

@timed
def slow_sum(n):
    return sum(range(n))

slow_sum(10_000_000)   # slow_sum took 0.1234s
```
::

The `try`/`finally` ensures the timing is logged even if `func` raises — a decorator that only measures on the happy path silently hides timing information for the calls that matter most (the ones that fail or take unexpectedly long before erroring).

## Decorators That Take Arguments

A parameterized decorator needs **three** levels of nesting: an outer function that accepts the decorator's own arguments, which returns the actual decorator, which returns the wrapper.

::code-wrapper{language="python"}
```python
from functools import wraps

def retry(times=3, exceptions=(Exception,)):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exc = None
            for attempt in range(1, times + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as exc:
                    last_exc = exc
                    print(f"Attempt {attempt} failed: {exc}")
            raise last_exc
        return wrapper
    return decorator

@retry(times=3, exceptions=(ConnectionError,))
def fetch_data():
    import random
    if random.random() < 0.7:
        raise ConnectionError("timeout")
    return "data"

# fetch_data()   # retries up to 3 times, then re-raises if still failing
```
::

`@retry(times=3, ...)` first calls `retry(times=3, ...)`, which returns `decorator`; **that** is what actually gets applied to `fetch_data`. Forgetting the extra call — writing `@retry` instead of `@retry()` when the decorator is written to always take arguments — passes the function itself as `times`, producing a confusing `TypeError` deep inside the decorator body rather than at the call site.

### Making the parentheses optional (advanced)

::code-wrapper{language="python"}
```python
from functools import wraps

def log_calls(func=None, *, prefix="CALL"):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            print(f"{prefix}: {f.__name__}({args}, {kwargs})")
            return f(*args, **kwargs)
        return wrapper
    if func is None:            # used as @log_calls(prefix="...")
        return decorator
    return decorator(func)        # used as @log_calls with no parens

@log_calls
def add(a, b):
    return a + b

@log_calls(prefix="DEBUG")
def sub(a, b):
    return a - b

add(2, 3)     # CALL: add((2, 3), {})
sub(5, 1)       # DEBUG: sub((5, 1), {})
```
::

## Stacking Multiple Decorators

::code-wrapper{language="python"}
```python
def bold(func):
    def wrapper(*args, **kwargs):
        return f"<b>{func(*args, **kwargs)}</b>"
    return wrapper

def italic(func):
    def wrapper(*args, **kwargs):
        return f"<i>{func(*args, **kwargs)}</i>"
    return wrapper

@bold
@italic
def text():
    return "hello"

print(text())   # <b><i>hello</i></b>
```
::

Decorators apply **bottom-up**: `italic` wraps `text` first, then `bold` wraps the result of that — equivalent to `bold(italic(text))`. Reading the stack from the function outward (bottom to top) tells you the actual order of wrapping, which is the opposite of the visual top-to-bottom reading order.

## Class-Based Decorators

Any object implementing `__call__` can act as a decorator — useful when the decorator needs to hold configurable state across calls.

::code-wrapper{language="python"}
```python
class CountCalls:
    def __init__(self, func):
        self.func = func
        self.calls = 0

    def __call__(self, *args, **kwargs):
        self.calls += 1
        print(f"Call #{self.calls} to {self.func.__name__}")
        return self.func(*args, **kwargs)

@CountCalls
def say_hi():
    print("hi")

say_hi()   # Call #1 to say_hi \n hi
say_hi()     # Call #2 to say_hi \n hi
print(say_hi.calls)   # 2
```
::

Note that `@CountCalls` replaces `say_hi` with an **instance** of `CountCalls`, not a plain function — introspection tools expecting `say_hi.__name__` will fail unless you manually copy metadata (`functools.update_wrapper(self, func)` in `__init__`), since `@wraps` is designed for function-based wrappers.

## Decorating Classes

Decorators aren't limited to functions — a decorator applied to a class receives the class object itself and can inspect, modify, or wrap it.

::code-wrapper{language="python"}
```python
def add_repr(cls):
    def __repr__(self):
        attrs = ", ".join(f"{k}={v!r}" for k, v in vars(self).items())
        return f"{cls.__name__}({attrs})"
    cls.__repr__ = __repr__
    return cls

@add_repr
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

print(Point(1, 2))   # Point(x=1, y=2)
```
::

This pattern — and the more powerful `dataclasses.dataclass`, which is itself a class decorator — is covered in depth alongside metaclasses in chapter 23.

## 💡 Tips & Tricks

- **Idiom**: use `functools.reduce`-style thinking to understand stacked decorators — `@a @b @c def f` is `f = a(b(c(f)))`; if the order of side effects (logging, timing, caching) matters, write it out this way before debugging unexpected behavior.
- **Debug**: `functools.wraps` also sets `__wrapped__` on the wrapper, pointing back to the original function — use `inspect.unwrap(decorated_func)` to peel back an arbitrary number of decorator layers when debugging.
- **Performance**: decorators that do expensive setup (opening connections, compiling regexes) should do that work once at decoration time (in the outer function), not on every call inside `wrapper` — the outer function's body runs exactly once, at `@decorator` application time, while `wrapper`'s body runs on every invocation.
- **Idiom**: `contextlib.contextmanager` (chapter 19) is implemented as a decorator over a generator function — recognizing the "wrap a generator to change calling convention" pattern here will make that chapter's internals click faster.
- **Debug**: if a decorated function's `help()` or docstring looks wrong, check for a missing `@wraps(func)` first — it is the single most common decorator bug and is easy to overlook because the code still runs correctly, just with broken introspection.

## ⚠️ Edge Cases & Gotchas

- **Closures over loop variables always bind late, to the variable's final value, not a per-iteration snapshot** — this affects `lambda`, nested `def`, and any closure created inside a loop; fix with a default-argument snapshot (`lambda i=i: ...`) or a factory function.
- **A decorator without `@wraps` silently corrupts `__name__`, `__doc__`, and `__module__`** — code depending on introspection (documentation generators, some test frameworks' fixture discovery, `pickle` for module-level lookups) can break in ways that are hard to trace back to a missing one-line decorator.
- **`nonlocal` requires the variable to already exist in an enclosing function scope — it cannot create one, unlike `global`** — `nonlocal x` where no enclosing function defines `x` raises `SyntaxError: no binding for nonlocal 'x' found` at compile time, not runtime.
- **A parameterized decorator applied without calling it (`@retry` instead of `@retry()`) passes the decorated function itself as the first configuration argument** — this doesn't always fail loudly; if that argument happens to be used in a way that doesn't immediately error (e.g., stored but not called until later), the bug surfaces far from its cause.
- **Class-based decorators (objects with `__call__`) replace the function with a non-function object** — code that checks `inspect.isfunction(obj)` or relies on function-specific attributes without going through `__wrapped__` will behave differently than with a function-based decorator, even though both are callable.

## 🧠 Spot the Bug

A UI framework registers click handlers for a row of buttons in a loop. All buttons report the same index when clicked. Find the bug.

::code-wrapper{language="python"}
```python
def build_handlers(n):
    handlers = []
    for index in range(n):
        def handler():
            print(f"Button {index} clicked")
        handlers.append(handler)
    return handlers

buttons = build_handlers(3)
for h in buttons:
    h()
```
::

<details>
<summary>Answer</summary>

Prints `Button 2 clicked` three times instead of `Button 0`, `Button 1`, `Button 2`. Each `handler` closure captures the *variable* `index`, not its value at the time `handler` was defined. By the time any handler is actually called (after the loop has finished), `index` holds its final value from the last iteration, `2` — and since all three closures share the same enclosing scope, they all see that same final value.

The fix is to force each closure to capture the current value at definition time, via a default argument:
::code-wrapper{language="python"}
```python
def build_handlers(n):
    handlers = []
    for index in range(n):
        def handler(index=index):
            print(f"Button {index} clicked")
        handlers.append(handler)
    return handlers
```
::

**The lesson**: closures capture variables by reference to the enclosing scope's cell, not snapshots of values — anything created in a loop and called later needs an explicit per-iteration binding (default argument or factory function) to avoid all instances sharing the loop's final state.

</details>

## Key Takeaways

- A closure captures enclosing-scope variables by reference, keeping them alive after the outer function returns — this is how Python builds stateful callables without a class.
- Closures over loop variables bind late (to the final value), not per-iteration — snapshot with a default argument (`lambda i=i: ...`) or a factory function to avoid the classic loop-closure bug.
- `nonlocal` lets an inner function *reassign* an enclosing function's variable; without it, assignment creates a new local variable and mutating attempts raise `UnboundLocalError`.
- A decorator is just a function that takes a callable and returns a (usually wrapping) callable — `@decorator` is sugar for `func = decorator(func)`.
- Parameterized decorators need three nested function levels; always apply `@functools.wraps(func)` inside the innermost wrapper to preserve the original function's metadata.
- Stacked decorators apply bottom-up (closest to the function first) — `@a @b def f` behaves as `a(b(f))`.
