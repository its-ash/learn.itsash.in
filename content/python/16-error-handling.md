# 16 — Error Handling

## `try` / `except` / `else` / `finally`

::code-wrapper{language="python"}
```python
def parse(text):
    try:
        n = int(text)            # only the line that can fail
    except ValueError:
        print("not a number")
        return None
    else:
        print("parsed OK")       # runs only if NO exception happened
        return n
    finally:
        print("always runs")     # runs no matter what — even after return

parse("42")    # parsed OK / always runs
parse("x")     # not a number / always runs
```
::

**Why `else`?** Code in `else` is **not** protected by the `except`. If it raises, you see the real error instead of hiding it under "not a number".

### `finally` beats `return`

::code-wrapper{language="python"}
```python
def f():
    try:
        return "try"
    finally:
        return "finally"     # overrides the return above!

print(f())                   # 'finally'

def g():
    try:
        1 / 0
    finally:
        return "swallowed"   # the ZeroDivisionError silently disappears!

print(g())                   # 'swallowed'
```
::

Python 3.14 warns about this: `SyntaxWarning: 'return' in a 'finally' block`. Never `return`, `break` or `continue` inside `finally`.

**Tricky**: the return value is computed **before** `finally` runs:

::code-wrapper{language="python"}
```python
def h():
    x = 1
    try:
        return x       # value 1 is saved now
    finally:
        x = 2          # changes x, but not the saved return value

print(h())             # 1
```
::

### The exception variable is deleted after `except`

::code-wrapper{language="python"}
```python
try:
    1 / 0
except ZeroDivisionError as e:
    pass

print(e)    # NameError: name 'e' is not defined
```
::

**Why**: Python runs `del e` at the end of the `except` block (to break a reference cycle with the traceback). Copy it to another name if you need it later.

## Exception Hierarchy and Catching Specifically

::code-wrapper{language="python"}
```python
try:
    result = 10 / 0
except ZeroDivisionError as e:
    print(f"Math error: {e}")
except ArithmeticError as e:          # ZeroDivisionError IS-A ArithmeticError — order matters!
    print(f"Other arithmetic error: {e}")
except Exception as e:                  # broad catch-all — catches almost everything else
    print(f"Unexpected: {e}")
```
::

Python checks `except` clauses **top-to-bottom**, using the first one whose type matches (via `isinstance`, so subclasses match parent-type clauses) — placing a broader exception type before a narrower one makes the narrower clause unreachable dead code, a mistake Python doesn't warn about by default.

::code-wrapper{language="python"}
```python
# WRONG — the ArithmeticError clause makes ZeroDivisionError's clause unreachable
try:
    1 / 0
except ArithmeticError:
    print("caught as ArithmeticError")    # this always wins; ZeroDivisionError never gets a chance
except ZeroDivisionError:
    print("caught as ZeroDivisionError")    # DEAD CODE — never runs
```
::

### The exception hierarchy that matters day-to-day

::code-wrapper{language="python"}
```python
# BaseException
#  +-- SystemExit, KeyboardInterrupt, GeneratorExit   (deliberately NOT caught by `except Exception`)
#  +-- Exception
#       +-- ArithmeticError -> ZeroDivisionError, OverflowError
#       +-- LookupError -> IndexError, KeyError
#       +-- ValueError
#       +-- TypeError
#       +-- OSError -> FileNotFoundError, PermissionError, ConnectionError, TimeoutError
#       +-- RuntimeError -> RecursionError, NotImplementedError
```
::

`except Exception` deliberately does **not** catch `SystemExit` or `KeyboardInterrupt` (both inherit directly from `BaseException`, not `Exception`) — this is intentional, so that `sys.exit()` and Ctrl+C reliably terminate a program even inside broad exception-handling code, unless a handler explicitly asks to catch `BaseException`.

## Never Use a Bare `except:`

::code-wrapper{language="python"}
```python
# DANGEROUS — catches EVERYTHING, including KeyboardInterrupt, SystemExit, and typos manifesting as NameError
def risky():
    try:
        return complicated_calculation()   # NameError: name not defined — a genuine BUG
    except:
        return None                          # silently hides the bug, returns None instead

# BETTER — catch only what you can actually handle meaningfully
def risky_fixed():
    try:
        return complicated_calculation()
    except (ValueError, ZeroDivisionError) as e:
        log.warning(f"Calculation failed: {e}")
        return None
```
::

A bare `except:` (or the nearly-as-broad `except Exception:` used indiscriminately) turns programming errors — typos, missing imports, wrong argument counts — into silent `None` returns instead of loud tracebacks, which is one of the most common sources of "it fails silently in production but works in my tests" bugs.

## Custom Exceptions

::code-wrapper{language="python"}
```python
class AppError(Exception):
    """Base exception for all application-specific errors."""

class InsufficientFundsError(AppError):
    def __init__(self, balance, requested):
        self.balance = balance
        self.requested = requested
        super().__init__(f"Cannot withdraw {requested}: balance is only {balance}")

class AccountFrozenError(AppError):
    pass

def withdraw(balance, amount):
    if amount > balance:
        raise InsufficientFundsError(balance, amount)
    return balance - amount

try:
    withdraw(100, 250)
except InsufficientFundsError as e:
    print(e)                    # Cannot withdraw 250: balance is only 100
    print(e.balance, e.requested)  # 100 250 — custom attributes for programmatic handling
except AppError:
    print("Some other app error")
```
::

**Best practice**: define one base exception per application/library (`AppError`) and derive specific exceptions from it — callers can catch broadly (`except AppError`) when they just want "anything my own code raised" or narrowly (`except InsufficientFundsError`) when they need to branch on the specific failure, and third-party exceptions never get accidentally conflated with your own.

## `raise ... from` — Exception Chaining

::code-wrapper{language="python"}
```python
def load_user_config(path):
    try:
        with open(path) as f:
            return f.read()
    except FileNotFoundError as e:
        raise AppError(f"Could not load config from {path}") from e   # preserves the ORIGINAL cause

try:
    load_user_config("/nonexistent/config.json")
except AppError as e:
    print(e)                # Could not load config from /nonexistent/config.json
    print(e.__cause__)        # [Errno 2] No such file or directory: '/nonexistent/config.json'
```
::

Without `from e`, the traceback still shows both exceptions (Python automatically records the original as `__context__` during exception handling), but labeled as "During handling of the above exception, another exception occurred" — implying an accidental, unrelated failure. `raise ... from e` instead marks it explicitly as "The above exception was the direct cause," which is the more accurate and more debuggable story when you're deliberately translating one exception type into another.

### Suppressing the chain entirely

::code-wrapper{language="python"}
```python
try:
    int("not a number")
except ValueError:
    raise RuntimeError("Config value must be numeric") from None   # hides the ValueError entirely

# Traceback shows ONLY the RuntimeError — appropriate when the original exception
# is pure noise for the caller (e.g., an internal implementation detail)
```
::

## Custom Exceptions with Structured Data

::code-wrapper{language="python"}
```python
class ValidationError(Exception):
    def __init__(self, errors):
        self.errors = errors    # a list of field-level error dicts
        message = f"{len(errors)} validation error(s): " + ", ".join(e["field"] for e in errors)
        super().__init__(message)

def validate_user(data):
    errors = []
    if not data.get("email"):
        errors.append({"field": "email", "message": "required"})
    if data.get("age", 0) < 0:
        errors.append({"field": "age", "message": "must be non-negative"})
    if errors:
        raise ValidationError(errors)
    return data

try:
    validate_user({"age": -5})
except ValidationError as e:
    print(e)                     # 2 validation error(s): email, age
    for err in e.errors:
        print(f"  {err['field']}: {err['message']}")
```
::

Attaching structured data (not just a message string) to custom exceptions lets calling code programmatically react to *what* went wrong — an API layer can turn `e.errors` directly into a JSON error response, something impossible if the exception only carries a human-readable string.

## Context Managers for Cleanup: `try`/`finally` vs `with`

::code-wrapper{language="python"}
```python
# Manual try/finally — correct, but verbose and easy to get wrong with multiple resources
lock = threading.Lock()
lock.acquire()
try:
    do_work()
finally:
    lock.release()

# Idiomatic — the context manager protocol (chapter 14/19) guarantees the same cleanup, less code
with threading.Lock():
    do_work()
```
::

Any cleanup that must happen "no matter what" — closing files, releasing locks, rolling back transactions, disconnecting sockets — is a candidate for `with` if the object supports it, and a candidate for `try`/`finally` if it doesn't. `finally` and `__exit__` share the exact same guarantee: they run even if the protected code returns early, breaks out of a loop, or raises.

## Multiple `except` Types and Exception Groups

::code-wrapper{language="python"}
```python
try:
    value = int(input_str) / divisor
except (ValueError, ZeroDivisionError) as e:    # one clause, multiple types — tuple syntax
    print(f"Invalid input: {e}")
```
::

::code-wrapper{language="python"}
```python
# Python 3.11+ — ExceptionGroup and except* for handling multiple concurrent failures
try:
    raise ExceptionGroup("multiple failures", [
        ValueError("bad value"),
        TypeError("bad type"),
    ])
except* ValueError as eg:
    print(f"Handled ValueErrors: {eg.exceptions}")
except* TypeError as eg:
    print(f"Handled TypeErrors: {eg.exceptions}")
```
::

`ExceptionGroup`/`except*` (3.11+) exist because some operations — notably `asyncio.TaskGroup` (chapter 22) — can genuinely fail with *multiple independent exceptions at once*, which the traditional single-exception model has no way to represent; `except*` can match and handle each sub-exception type from the group independently.

## `assert` Is Not Error Handling

::code-wrapper{language="python"}
```python
def set_discount(percent):
    assert 0 <= percent <= 100, "percent must be between 0 and 100"
    return percent / 100

# python -O my_script.py   # runs with optimizations ON — assert statements are STRIPPED ENTIRELY
```
::

`assert` statements are removed completely when Python runs with the `-O` (optimize) flag — meaning `assert`-based validation silently vanishes in that mode. **Never use `assert` for input validation, security checks, or anything that must always run** — use it only for internal invariants/debugging aids that are fine to disable in production, and raise real exceptions (`ValueError`, a custom exception) for anything that represents genuinely invalid input.

## 💡 Tips & Tricks

- **Idiom**: catch the narrowest exception type that lets you handle the failure meaningfully — `except Exception` (or worse, bare `except:`) as a habit turns real bugs into silent failures indistinguishable from expected error conditions.
- **Debug**: `traceback.print_exc()` or `logging.exception(...)` inside an `except` block preserves the full traceback for debugging, unlike `print(e)`, which shows only the exception's string message and loses the call stack.
- **Idiom**: use `raise ... from e` when deliberately translating a low-level exception into a higher-level, more meaningful one — it keeps the original cause visible in the traceback instead of looking like an unrelated second failure.
- **Idiom**: put the "happy path" continuation in `else`, not at the end of `try` — this keeps the `try` block scoped tightly to just the line(s) that can actually raise, so you don't accidentally catch an exception from code that was never meant to be protected.
- **Debug**: `sys.exc_info()` and `e.__traceback__` give you programmatic access to the current exception's traceback object — useful for custom logging/reporting frameworks that need to format or forward exception details.

## ⚠️ Edge Cases & Gotchas

- **A bare `except:` (or careless `except Exception:`) silently swallows `NameError`, `TypeError`, and other bugs alongside the errors you meant to handle** — this is the single most common way real programming mistakes get hidden until they cause confusing behavior far from the actual bug.
- **`except` clause order matters — a broader exception type listed before a narrower (subclass) one makes the narrower clause permanently unreachable**, with no warning from the interpreter; always order `except` clauses from most specific to most general.
- **`assert` statements are completely stripped when Python runs with `-O`/`-OO`** — code that relies on `assert` for validation that must always happen (input sanitization, security checks) has a silent, environment-dependent bug: it works in development, and stops validating anything the moment `-O` is used.
- **`except Exception` does not catch `KeyboardInterrupt` or `SystemExit`, because both inherit from `BaseException` directly, not `Exception`** — this is usually desirable (Ctrl+C should still work inside a broad `try`), but code that genuinely needs to catch everything, including these, must explicitly write `except BaseException`, and should almost always re-raise after cleanup rather than suppress them.
- **A `return`, `break`, or `continue` inside a `try` block does NOT skip the `finally` clause — `finally` still runs before control actually leaves the block**, and a `return` *inside* `finally` will silently override (discard) a `return` or an in-flight exception from the `try`/`except` — a rare but genuinely confusing gotcha worth avoiding by never `return`-ing from `finally`.

## 🧠 Spot the Bug

A retry helper should retry a flaky call up to 3 times. Instead it hides a real bug. Find it.

::code-wrapper{language="python"}
```python
def fetch_with_retry(fetch_fn, attempts=3):
    for attempt in range(attempts):
        try:
            return fetch_fn()
        except:
            print(f"Attempt {attempt + 1} failed, retrying...")
    raise RuntimeError("All attempts failed")

def fetch_data():
    respones = {"status": "ok"}
    return response["status"]      # typo: respones vs response

fetch_with_retry(fetch_data)
```
::

<details>
<summary>Answer</summary>

::code-wrapper{language="bash"}
```bash
Attempt 1 failed, retrying...
Attempt 2 failed, retrying...
Attempt 3 failed, retrying...
RuntimeError: All attempts failed
```
::

The typo raises `NameError` — a programming bug that no retry can fix. The bare `except:` catches it like a network error, retries it 3 times, then hides it under a generic `RuntimeError`. The real `NameError` and its line number are lost.

Fix: catch only errors that a retry can fix.

::code-wrapper{language="python"}
```python
def fetch_with_retry(fetch_fn, attempts=3):
    for attempt in range(attempts):
        try:
            return fetch_fn()
        except (ConnectionError, TimeoutError) as e:
            print(f"Attempt {attempt + 1} failed: {e}")
    raise RuntimeError("All attempts failed")
```
::

Now the `NameError` crashes immediately with its real traceback.

**The lesson**: a broad `except` in a retry loop hides bugs **and** wastes time retrying them.

</details>

## Key Takeaways

- `try`/`except`/`else`/`finally` each have distinct roles: `else` runs only on success (keeping it separate from error handling), `finally` always runs, even through `return`/`break`/an uncaught exception.
- Never use a bare `except:` — it catches typos and programming errors (`NameError`, `TypeError`) alongside real, expected failure modes, hiding bugs as silent `None` returns or generic messages.
- Order `except` clauses from most specific to most general — a broad type listed first makes narrower clauses below it permanently unreachable, with no warning.
- Define a base custom exception per application/library and derive specific exceptions from it, optionally carrying structured data (not just a message) so callers can react programmatically.
- Use `raise ... from e` when deliberately translating one exception into another — it preserves the original cause in the traceback instead of implying an unrelated, accidental second failure.
- `assert` is stripped entirely under `python -O` — never use it for validation that must always run; raise real exceptions for anything representing invalid input or state.
