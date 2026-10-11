# 04 — Control Flow

## `if` / `elif` / `else`

::code-wrapper{language="python"}
```python
def grade(score):
    if score >= 90:
        return "A"
    elif score >= 80:
        return "B"
    elif score >= 70:
        return "C"
    else:
        return "F"

print(grade(95), grade(80), grade(0))   # A B F
```
::

**Tricky**: order matters. Only the **first** true branch runs:

::code-wrapper{language="python"}
```python
def grade_wrong(score):
    if score >= 70:
        return "C"        # 95 stops here!
    elif score >= 90:
        return "A"        # never reached
    return "F"

print(grade_wrong(95))    # 'C'
```
::

### Conditional expression (Python's "ternary")

::code-wrapper{language="python"}
```python
age = 20
status = "adult" if age >= 18 else "minor"
print(status)   # adult

# Tricky: it binds LOOSER than `+`
n = 5
print("n=" + str(n) if n > 0 else "none")   # 'n=5'
print("x" + "y" if False else "z")          # 'z'  ← NOT 'xz' — whole "x"+"y" is the true branch
```
::

### Edge cases in conditions

::code-wrapper{language="python"}
```python
items = []
if items:                     # empty list is falsy — idiomatic emptiness check
    print("has items")
else:
    print("empty")            # prints

if items == []:               # works, but not idiomatic
    pass

x = 0
if x is not None and 10 / x > 1:   # short-circuit protects nothing here →
    pass                            # ZeroDivisionError! x is 0, not None
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

### `while True` with `break` — loop until the exit is found inside

::code-wrapper{language="python"}
```python
commands = ["ls", "pwd", "", "never-read"]
i = 0
while True:
    cmd = commands[i]
    i += 1
    if not cmd:           # empty string → stop
        break
    print("run", cmd)
# run ls
# run pwd
```
::

**Tricky**: a `while` condition is re-checked only at the **top** of each pass:

::code-wrapper{language="python"}
```python
n = 3
while n > 0:
    n -= 1
    print(n)    # prints 2, 1, 0 — the 0 prints because the check happens AFTER
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

## Mutating a List While Looping

::code-wrapper{language="python"}
```python
nums = [1, 2, 2, 3]
for n in nums:
    if n == 2:
        nums.remove(n)
print(nums)    # [1, 2, 3]  ← one 2 survived!
```
::

**Why**: the loop keeps an index. Removing item 1 shifts the second `2` into index 1, and the loop moves on to index 2 — it skips it.

::code-wrapper{language="python"}
```python
nums = [1, 2, 2, 3]
nums = [n for n in nums if n != 2]   # build a new list
print(nums)    # [1, 3]
```
::

## The `match` Capture Trap

::code-wrapper{language="python"}
```python
OK = 200

def check(code):
    match code:
        case OK:            # NOT a comparison — captures ANY value into a new name `OK`
            return "ok"

print(check(404))           # 'ok'  ← every code "matches"!
# Add any `case` after it → SyntaxError: name capture 'OK' makes remaining patterns unreachable

# Correct: use a dotted name (compared by value)
class Status:
    OK = 200

def check(code):
    match code:
        case Status.OK:     # dotted → compares with ==
            return "ok"
        case _:
            return "other"

print(check(200), check(404))   # ok other
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
