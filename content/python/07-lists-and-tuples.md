# 07 — Lists & Tuples

## Lists — Mutable, Ordered Sequences

::code-wrapper{language="python"}
```python
fruits = ["apple", "banana", "cherry"]
fruits.append("date")            # add to end
fruits.insert(1, "avocado")        # insert at index
fruits.remove("banana")              # remove by value (first match, raises if absent)
popped = fruits.pop()                  # remove and return last item
popped_at = fruits.pop(0)                # remove and return item at index
fruits.extend(["fig", "grape"])           # append multiple items
fruits.sort()                                # sort in place, returns None
fruits.reverse()                               # reverse in place, returns None

print(fruits)
```
::

### `sort()` vs `sorted()` — in-place vs new object

::code-wrapper{language="python"}
```python
nums = [3, 1, 4, 1, 5, 9, 2, 6]

new_sorted = sorted(nums)          # returns a NEW list, original untouched
print(nums)                           # [3, 1, 4, 1, 5, 9, 2, 6]  — unchanged
print(new_sorted)                       # [1, 1, 2, 3, 4, 5, 6, 9]

result = nums.sort()                       # sorts IN PLACE, returns None
print(nums)                                   # [1, 1, 2, 3, 4, 5, 6, 9]  — mutated
print(result)                                    # None — a classic trap, see below
```
::

**Trap**: `sorted_list = my_list.sort()` sets `sorted_list` to `None`, because `.sort()` returns `None` by design (a Python convention: methods that mutate in place return `None` to signal "this is a mutation, not a new value" — same for `.append()`, `.extend()`, `.reverse()`, `list.clear()`). Beginners chaining `.sort()` expecting a return value hit this constantly.

## Slicing Deep Dive

::code-wrapper{language="python"}
```python
nums = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

print(nums[2:5])       # [2, 3, 4]
print(nums[:3])          # [0, 1, 2]
print(nums[7:])            # [7, 8, 9]
print(nums[-3:])              # [7, 8, 9]
print(nums[::2])                # [0, 2, 4, 6, 8]
print(nums[::-1])                 # [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]  — reverse
print(nums[100:200])                # []  — never raises, clamps silently

# Slices are shallow copies — a NEW list object
sub = nums[2:5]
sub.append(999)
print(nums)              # unaffected — [0, 1, ..., 9]
```
::

### Slice assignment — replacing, inserting, deleting via slices

::code-wrapper{language="python"}
```python
nums = [0, 1, 2, 3, 4]
nums[1:3] = [10, 20, 30]      # replace a slice with a differently-sized list
print(nums)                      # [0, 10, 20, 30, 3, 4]

nums[1:4] = []                     # delete a range via empty-slice assignment
print(nums)                           # [0, 3, 4]

nums[1:1] = [100, 200]                  # insert without replacing anything
print(nums)                                # [0, 100, 200, 3, 4]

del nums[0]                                  # del also works with slices
print(nums)                                     # [100, 200, 3, 4]
```
::

## List Comprehensions

::code-wrapper{language="python"}
```python
squares = [x ** 2 for x in range(10)]
print(squares)   # [0, 1, 4, 9, 16, 25, 36, 49, 64, 81]

evens = [x for x in range(20) if x % 2 == 0]
print(evens)       # [0, 2, 4, ..., 18]

# Nested comprehension — flatten a matrix
matrix = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
flat = [num for row in matrix for num in row]
print(flat)   # [1, 2, 3, 4, 5, 6, 7, 8, 9]

# Conditional expression INSIDE the comprehension (ternary, not filter)
labels = ["even" if x % 2 == 0 else "odd" for x in range(5)]
print(labels)   # ['even', 'odd', 'even', 'odd', 'even']
```
::

Full comprehension coverage (set/dict/generator forms) continues in chapter 09 — this chapter focuses on list-specific mechanics.

## Tuples — Immutable, Ordered Sequences

::code-wrapper{language="python"}
```python
point = (3, 4)
print(point[0], point[1])   # 3 4

# point[0] = 10   # TypeError: 'tuple' object does not support item assignment

# Parentheses are optional — the COMMA makes it a tuple
also_a_tuple = 1, 2, 3
print(type(also_a_tuple))   # <class 'tuple'>

single = (42,)          # trailing comma REQUIRED for a 1-element tuple
not_a_tuple = (42)         # this is just an int in parentheses!
print(type(single), type(not_a_tuple))   # <class 'tuple'> <class 'int'>

empty = ()
print(type(empty))   # <class 'tuple'>
```
::

### Tuple Packing and Unpacking

::code-wrapper{language="python"}
```python
# Packing
coordinates = 10, 20, 30

# Unpacking
x, y, z = coordinates
print(x, y, z)   # 10 20 30

# Swap without a temp variable — packs a tuple on the right, unpacks on the left
a, b = 1, 2
a, b = b, a
print(a, b)   # 2 1

# Star-unpacking for "the rest"
first, *middle, last = [1, 2, 3, 4, 5]
print(first, middle, last)   # 1 [2, 3, 4] 5

first, second, *rest = range(10)
print(first, second, rest)   # 0 1 [2, 3, 4, 5, 6, 7, 8, 9]

# Ignoring values with _
_, _, third = (1, 2, 3)
print(third)   # 3
```
::

### Real-world use: functions returning multiple values are just tuples

::code-wrapper{language="python"}
```python
def divide_with_remainder(a, b):
    return a // b, a % b     # implicitly packs a 2-tuple

quotient, remainder = divide_with_remainder(17, 5)
print(quotient, remainder)   # 3 2
```
::

## Why Tuples Exist When Lists Can Do the Same Thing

1. **Immutability signals intent** — a tuple communicates "this is a fixed record/coordinate that should never change," which lists cannot express.
2. **Hashability** — tuples of hashable elements are themselves hashable, so they can be dict keys or set members; lists never can be.
3. **Slight performance/memory edge** — tuples have a smaller fixed memory footprint than lists (no over-allocation for future growth) and can be marginally faster to construct/iterate.

::code-wrapper{language="python"}
```python
# Tuples as dict keys — impossible with lists
distances = {}
distances[(0, 0)] = 0
distances[(1, 1)] = 1.41

# lst = [0, 0]
# distances[lst] = 0   # TypeError: unhashable type: 'list'

print(distances[(1, 1)])   # 1.41
```
::

## Copying — Shallow vs Deep, the Source of Countless Bugs

::code-wrapper{language="python"}
```python
import copy

original = [[1, 2], [3, 4]]

# Assignment is NOT a copy — same object
alias = original
alias[0].append(99)
print(original)   # [[1, 2, 99], [3, 4]] — original changed too, same object

# Shallow copy — a NEW outer list, but inner lists are SHARED
shallow = original.copy()          # or: list(original), or original[:]
shallow.append([100])                 # adding to the OUTER list doesn't affect original
print(original)                          # unaffected by the .append([100]) above

shallow[0].append(999)                     # but mutating a SHARED inner list DOES affect original
print(original)                               # [[1, 2, 99, 999], [3, 4]] — leaked through!

# Deep copy — recursively copies EVERYTHING, no shared references at any depth
deep = copy.deepcopy(original)
deep[0].append(-1)
print(original)   # unaffected — [[1, 2, 99, 999], [3, 4]]
print(deep)          # [[1, 2, 99, 999, -1], [3, 4]]
```
::

**The mental model**: `.copy()` (and `list(x)`, and `x[:]`) creates one new container, but its *elements* are the same objects as in the original — for a list of immutable elements (ints, strings, tuples) this is indistinguishable from a deep copy in practice, but for a list of mutable elements (lists, dicts, custom objects) it is a trap waiting to bite the first time someone mutates a nested element.

::code-wrapper{language="python"}
```python
# Shallow copy is FINE for flat lists of immutables
flat = [1, 2, 3]
shallow_flat = flat.copy()
shallow_flat.append(4)
print(flat)   # [1, 2, 3] — no shared mutable elements to leak through

# But dangerous for nested/mutable structures — always deepcopy those
nested = [{"count": 0}, {"count": 0}]
shallow_nested = nested.copy()
shallow_nested[0]["count"] += 1
print(nested)   # [{'count': 1}, {'count': 0}] — leaked!
```
::

## Common List/Tuple Operations and Their Complexity

| Operation | List | Tuple | Complexity |
|---|---|---|---|
| Index access `x[i]` | Yes | Yes | O(1) |
| Append | `.append()` | N/A (immutable) | O(1) amortized |
| Insert at front | `.insert(0, v)` | N/A | O(n) — shifts everything |
| Membership `in` | Yes | Yes | O(n) — linear scan |
| Concatenation | `+` | `+` | O(n + m) |
| Length | `len()` | `len()` | O(1) |

**Best practice**: if you're repeatedly inserting/removing from the *front* of a list, use `collections.deque` instead — list's `.insert(0, ...)` and `.pop(0)` are O(n) because every remaining element must shift.

::code-wrapper{language="python"}
```python
from collections import deque

queue = deque()
queue.append("task1")
queue.append("task2")
queue.appendleft("urgent_task")   # O(1), unlike list.insert(0, ...)
print(queue.popleft())              # 'urgent_task' — O(1), unlike list.pop(0)
```
::

## 💡 Tips & Tricks

- **`list[:]` and `list.copy()` and `list(other_list)` are all equivalent shallow copies** — pick whichever reads clearest in context; `[:]` is the most traditional/idiomatic but `.copy()` is more explicit for readers unfamiliar with slice tricks.
- **Unpack function returns directly instead of indexing** — `min_val, max_val = min(data), max(data)` is clearer than separate lines, and `first, *_, last = sequence` grabs the first and last elements in one line without slicing twice.
- **`list.sort(key=..., reverse=True)` beats sorting then reversing** — `sorted(items, key=len, reverse=True)` is both clearer and faster than `sorted(items, key=len)[::-1]`, and importantly preserves stable-sort semantics correctly (reversing a stable sort's output does NOT give you a stable descending sort for equal keys).
- **`bisect` module for maintaining sorted lists efficiently** — `bisect.insort(sorted_list, value)` inserts while maintaining order in O(n) (due to the shift) but with O(log n) search, far better than re-sorting after every insert.
- **Tuple unpacking in `for` loops replaces manual indexing** — `for key, value in items.items():` beats `for item in items.items(): key = item[0]; value = item[1]`.

## ⚠️ Edge Cases & Gotchas

- **`.sort()`/`.reverse()`/`.append()`/`.extend()` all return `None`** — chaining or assigning their result (`x = my_list.sort()`) is a common and silent bug; these methods mutate and return `None` by Python convention (distinguishing "in-place mutation" methods from "returns new value" methods/functions like `sorted()`).
- **A single-element tuple requires a trailing comma — parentheses alone don't make a tuple** — `(42)` is just `int` `42`; `(42,)` is a tuple. This bites people writing what they think is a 1-tuple literal, especially in function calls expecting a tuple argument.
- **Shallow copies share nested mutable objects — mutating a nested element leaks through the "copy"** — `.copy()`, `list(x)`, and `x[:]` are all shallow; use `copy.deepcopy()` for lists/dicts containing mutable elements when true independence is required.
- **List multiplication (`*`) with mutable elements replicates references, not independent objects** — `rows = [[0] * 3] * 3` creates a list containing the *same* inner list object three times, so `rows[0][0] = 1` changes `rows[1][0]` and `rows[2][0]` too. The fix: `rows = [[0] * 3 for _ in range(3)]`, which creates a genuinely new inner list per iteration.
- **`list.insert(0, x)` and `list.pop(0)` are O(n), not O(1)** — every other element must shift to make/close the gap at the front; code that treats a list as a FIFO queue via these calls silently degrades to O(n²) for n operations. Use `collections.deque` for queue-like access patterns.

## 🧠 Spot the Bug

A developer initializes a 2D game board and is confused why placing one piece affects every row.

::code-wrapper{language="python"}
```python
board = [[None] * 3] * 3
board[0][0] = "X"
print(board)
```
::

<details>
<summary>Answer</summary>

Prints `[['X', None, None], ['X', None, None], ['X', None, None]]` — every row shows the `"X"`, not just row 0. `[None] * 3` creates one list, `[None, None, None]`. Then the outer `* 3` doesn't create three independent copies of that list — it creates a new outer list containing **three references to that exact same inner list object**. `board[0]`, `board[1]`, and `board[2]` are literally `is`-identical. Assigning `board[0][0] = "X"` mutates the one shared inner list, which is visible through all three outer references.

The fix uses a list comprehension, which evaluates `[None] * 3` fresh on every iteration, producing three genuinely distinct list objects:
::code-wrapper{language="python"}
```python
board = [[None] * 3 for _ in range(3)]
```
::

**The lesson**: `*` replication on a list of mutable objects (including nested lists) duplicates *references*, not the underlying objects — this is the same "shared reference" root cause as the mutable-default-argument bug and the shallow-copy bug, wearing a different disguise.

</details>

## Key Takeaways

- Lists are mutable and support in-place `.append`/`.sort`/`.reverse` (all returning `None` by convention); tuples are immutable, hashable (if their contents are), and used for fixed records and dict/set keys.
- Slicing (`list[a:b:c]`) never raises `IndexError`, always returns a new shallow-copied list, and supports slice assignment for replace/insert/delete-in-place operations.
- `.copy()`/`list(x)`/`x[:]` are shallow — nested mutable elements are shared with the original; use `copy.deepcopy()` when true independence at every level is required.
- `[x] * n` with a mutable `x` (especially a nested list) replicates references to the *same* object `n` times — use a comprehension (`[x_fresh for _ in range(n)]`) to get independent copies.
- Use `collections.deque` instead of a list for queue-like patterns (`insert(0, ...)`, `pop(0)`) — list operations at the front are O(n), deque's are O(1).
