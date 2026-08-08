# 04 — Control Flow

## `if` / `elif` / `else`

::code-wrapper{language="python"}
```python
def classify(temp_celsius):
    if temp_celsius < 0:
        return "freezing"
    elif temp_celsius < 15:
        return "cold"
    elif temp_celsius < 25:
        return "mild"
    else:
        return "hot"

print(classify(-5))   # freezing
print(classify(20))    # mild
```
::

Python has no `switch` statement in the C sense (structural pattern matching via `match`/`case`, covered below, is the closer analog since 3.10) and no ternary `? :` syntax — instead it has a **conditional expression**:

::code-wrapper{language="python"}
```python
age = 15
status = "adult" if age >= 18 else "minor"
print(status)   # minor

# Chainable, though readability suffers past one level
label = "high" if age >= 65 else "mid" if age >= 18 else "low"
```
::

### Common gotcha: assignment is a statement, not an expression

::code-wrapper{language="python"}
```python
# if x = 5:      # SyntaxError — assignment can't appear in a condition
#     ...

# This is a deliberate design choice to prevent the classic C bug of
# writing `if (x = 5)` when you meant `if (x == 5)`. Use walrus if you
# genuinely need to assign-and-test: if (x := 5):
```
::

## `while` Loops

::code-wrapper{language="python"}
```python
def collatz_steps(n):
    steps = 0
    while n != 1:
        n = n // 2 if n % 2 == 0 else 3 * n + 1
        steps += 1
    return steps

print(collatz_steps(27))   # 111
```
::

### `while True` with `break` — the idiomatic "loop until condition found inside"

::code-wrapper{language="python"}
```python
import random

def guess_number(target):
    attempts = 0
    while True:
        attempts += 1
        guess = random.randint(1, 100)
        if guess == target:
            return attempts
        if attempts > 10_000:   # safety valve against infinite loops
            raise RuntimeError("too many attempts")
```
::

## `for` Loops — Iterating, Not Counting

Python's `for` iterates over any **iterable** (chapter 19 covers the protocol in depth) — there is no C-style `for (i = 0; i < n; i++)`.

::code-wrapper{language="python"}
```python
for fruit in ["apple", "banana", "cherry"]:
    print(fruit)

# Need an index too? Use enumerate — don't manually track a counter
for i, fruit in enumerate(["apple", "banana", "cherry"], start=1):
    print(f"{i}. {fruit}")

# Need a numeric range? range() is lazy — doesn't build a list
for i in range(5):          # 0, 1, 2, 3, 4
    print(i)
for i in range(2, 10, 2):    # 2, 4, 6, 8 — start, stop, step
    print(i)
for i in range(10, 0, -1):     # counts down: 10, 9, ..., 1
    print(i)
```
::

### Iterating multiple sequences together with `zip`

::code-wrapper{language="python"}
```python
names = ["Ada", "Grace", "Alan"]
scores = [98, 95, 87]

for name, score in zip(names, scores):
    print(f"{name}: {score}")

# zip stops at the SHORTEST iterable — silent truncation, not an error
extra = ["Ada", "Grace", "Alan", "Linus"]
for name, score in zip(extra, scores):
    print(name)   # Linus is silently dropped — no error, no warning
```
::

Use `itertools.zip_longest(names, scores, fillvalue=None)` from the standard library when mismatched lengths should be padded rather than silently truncated.

## `break`, `continue`, and the Rarely-Known `else` on Loops

`break` exits a loop immediately. `continue` skips to the next iteration. Both work identically to C/JS. What's unique to Python: **`for` and `while` loops can have an `else` clause**, which runs only if the loop completed **without hitting a `break`**.

::code-wrapper{language="python"}
```python
def find_first_prime_factor(n):
    for candidate in range(2, int(n ** 0.5) + 1):
        if n % candidate == 0:
            print(f"Found factor: {candidate}")
            break
    else:
        # Runs ONLY if the loop never broke — i.e., n is prime
        # (or n < 4, where the range is empty and the loop trivially "completes")
        print(f"{n} is prime")

find_first_prime_factor(15)   # Found factor: 3
find_first_prime_factor(17)   # 17 is prime
```
::

The mental model: **`else` on a loop means "no-break."** It is most useful for search loops where you need to distinguish "found it, handled inside the loop" from "searched everything, found nothing" — without a separate `found = False` flag variable.

::code-wrapper{language="python"}
```python
# WITHOUT for-else — needs an extra flag variable
def contains_duplicate_verbose(items):
    seen = set()
    found = False
    for item in items:
        if item in seen:
            found = True
            break
        seen.add(item)
    if not found:
        print("No duplicates")
    else:
        print(f"Duplicate: {item}")

# WITH for-else — no flag needed, and scope is naturally clearer
def contains_duplicate(items):
    seen = set()
    for item in items:
        if item in seen:
            print(f"Duplicate: {item}")
            break
        seen.add(item)
    else:
        print("No duplicates")
```
::

`while ... else` follows the same rule and is far less commonly used in practice, but behaves identically — the `else` runs unless a `break` fired.

## Structural Pattern Matching — `match` / `case` (3.10+)

[PEP 634](https://peps.python.org/pep-0634/) added `match`/`case`. It looks like a `switch` statement but is dramatically more powerful — it does **structural destructuring**, not just value equality.

### Basic literal matching

::code-wrapper{language="python"}
```python
def http_status_message(code):
    match code:
        case 200:
            return "OK"
        case 404:
            return "Not Found"
        case 500 | 502 | 503:              # OR-pattern
            return "Server Error"
        case _ if 400 <= code < 500:        # guard clause
            return "Client Error"
        case _:                              # wildcard — like `default`
            return "Unknown"

print(http_status_message(404))    # Not Found
print(http_status_message(503))     # Server Error
print(http_status_message(422))      # Client Error
```
::

### Structural destructuring — matching shape, not just value

::code-wrapper{language="python"}
```python
def handle_event(event):
    match event:
        case {"type": "click", "x": x, "y": y}:
            return f"Click at ({x}, {y})"
        case {"type": "keypress", "key": str(key)}:
            return f"Key pressed: {key}"
        case {"type": "resize", "width": w, "height": h} if w <= 0 or h <= 0:
            return "Invalid resize dimensions"
        case {"type": "resize", **rest}:
            return f"Resized: {rest}"
        case _:
            return "Unknown event"

print(handle_event({"type": "click", "x": 10, "y": 20}))
print(handle_event({"type": "resize", "width": 800, "height": 600}))
print(handle_event({"type": "resize", "width": -1, "height": 600}))
```
::

### Matching classes structurally

::code-wrapper{language="python"}
```python
from dataclasses import dataclass

@dataclass
class Point:
    x: int
    y: int

def describe(point):
    match point:
        case Point(x=0, y=0):
            return "Origin"
        case Point(x=0, y=y):
            return f"On the Y-axis at {y}"
        case Point(x=x, y=0):
            return f"On the X-axis at {x}"
        case Point(x=x, y=y) if x == y:
            return "On the diagonal"
        case Point():
            return "Somewhere else"
        case _:
            return "Not a point"

print(describe(Point(0, 0)))     # Origin
print(describe(Point(3, 3)))       # On the diagonal
print(describe(Point(0, 5)))         # On the Y-axis at 5
```
::

### Sequence patterns with unpacking and "the rest"

::code-wrapper{language="python"}
```python
def process_command(parts):
    match parts:
        case []:
            return "empty command"
        case [cmd]:
            return f"run {cmd} with no args"
        case [cmd, *args] if cmd == "echo":
            return " ".join(args)
        case ["move", x, y]:
            return f"move to {x}, {y}"
        case [cmd, *_]:
            return f"unrecognized command: {cmd}"

print(process_command(["echo", "hello", "world"]))   # hello world
print(process_command(["move", 3, 4]))                 # move to 3, 4
print(process_command([]))                               # empty command
```
::

## 💡 Tips & Tricks

- **`for...else` for search loops eliminates flag variables** — anywhere you'd write `found = False` before a loop just to check it after, reach for `for...else` instead; it reads as "did I search everything without finding it."
- **`case _:` must be last, and a bare name in `case` always matches (and binds!) — not compares** — `case x:` (no literal, no structure) always matches and binds the value to `x`; to match against an existing variable's *value*, use a dotted name or guard: `case value if value == existing_var:` or `case SomeEnum.MEMBER:`.
- **`itertools.zip_longest` avoids `zip`'s silent truncation** — whenever mismatched-length inputs should be an explicit case (padding or erroring), don't reach for the builtin `zip`.
- **`sorted(..., key=...)` beats writing manual comparison loops** — most "loop to find the max/min/sorted order" code is better expressed with `max(items, key=...)`, `min(items, key=...)`, or `sorted(items, key=...)` than a hand-rolled `for` loop.
- **Guard clauses (`if` inside `case`) let you avoid deeply nested `if` inside `case` bodies** — keep matching logic flat by pushing conditions into the `case` line itself.

## ⚠️ Edge Cases & Gotchas

- **A bare name pattern in `match` always matches and shadows — it never compares to an existing variable** — `case status:` inside a `match status:` block does NOT mean "matches if status equals status" (that's a no-op tautology anyway) — more subtly, `case some_variable:` where `some_variable` was defined *outside* the match block still just binds a new local, it does not compare against the outer variable's value. Use `case value if value == some_variable:` or wrap in `case SomeClass.CONSTANT:` (dotted/attribute patterns compare, bare names bind).
- **`zip()` silently truncates to the shortest iterable — no error, no warning** — a length mismatch between two lists you expected to be equal-length produces quietly wrong output rather than a crash, which makes it a debugging trap in data-pipeline code.
- **`range(start, stop)` never includes `stop`, and negative steps require `stop` to be reachable in the negative direction** — `range(5, 0)` (no step) is an *empty* range, not an error and not a descending range — you must pass `range(5, 0, -1)` explicitly to count down.
- **`while`/`for` `else` is one of the most misread pieces of syntax in the language** — many experienced developers coming from other languages assume `else` on a loop means "if the loop body never executed" (like an empty-collection check); it actually means "if the loop was not exited via `break`," which is a materially different condition especially for loops with zero iterations (the `else` still runs in that case, since no `break` occurred).
- **Mutating a list while iterating over it with a `for` loop skips elements** — `for x in lst: if cond: lst.remove(x)` silently skips every other matching element, because removal shifts subsequent elements into the position the iterator has already passed. Iterate over a copy (`for x in lst[:]:`) or build a new list via a comprehension instead.

## 🧠 Spot the Bug

What does this print?

::code-wrapper{language="python"}
```python
def find_negative(numbers):
    for n in numbers:
        if n < 0:
            result = "found a negative"
            break
    else:
        result = "all non-negative"
    return result

print(find_negative([]))
print(find_negative([1, 2, 3]))
print(find_negative([1, -2, 3]))
```
::

<details>
<summary>Answer</summary>

Prints `all non-negative`, `all non-negative`, `found a negative`. The first case surprises many readers: an **empty list** never executes the loop body at all, so `break` never runs — and since the `else` clause's condition is precisely "the loop finished without `break`," it fires even though the loop body ran zero times. `for...else`'s `else` is not an "if nothing matched after searching" clause in the intuitive sense — it is purely "no `break` occurred," and a loop over an empty (or already-satisfied-before-entry) iterable trivially satisfies that.

**The lesson**: `for...else`'s `else` fires whenever a `break` statement did not execute, including when the loop body never ran — treat it as "no-break", not as "search exhausted with a non-trivial search."

</details>

## Key Takeaways

- Python has no `switch`/ternary in the C sense — use `if`/`elif`/`else`, the `x if cond else y` conditional expression, or (3.10+) `match`/`case` for structural matching.
- `for` iterates over iterables, not indices — use `enumerate()` for index+value and `zip()` for parallel iteration (remembering `zip` silently truncates to the shortest input).
- `for`/`while` loops support an `else` clause that runs unless a `break` occurred — useful for search loops, but easy to misread as "loop found nothing."
- `match`/`case` does structural destructuring (dicts, sequences, classes via `__match_args__`), not just value comparison — a bare name in a `case` always binds, it never compares against an outer variable.
- Never mutate a list while iterating over it directly — iterate a copy or build a new collection instead.
