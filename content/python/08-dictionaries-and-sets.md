# 08 — Dictionaries & Sets

## Dictionaries — Hash Maps with Guaranteed Insertion Order

Since Python 3.7 (officially guaranteed by the language spec, not just a CPython implementation detail as it was in 3.6), dicts preserve **insertion order**.

::code-wrapper{language="python"}
```python
user = {"name": "Ada", "age": 36, "role": "engineer"}

print(user["name"])          # "Ada"
user["email"] = "ada@example.com"   # add a new key
user["age"] = 37                       # update existing key
del user["role"]                          # remove a key

print(user)   # {'name': 'Ada', 'age': 37, 'email': 'ada@example.com'}
              # insertion order preserved: name, age, email (role removed)
```
::

### Safe access — `.get()`, `.setdefault()`, and `KeyError`

::code-wrapper{language="python"}
```python
user = {"name": "Ada"}

print(user["missing"])          # KeyError: 'missing'  — direct indexing raises

print(user.get("missing"))         # None — no error, default default is None
print(user.get("missing", "N/A"))     # "N/A" — explicit fallback

# setdefault: get if present, otherwise insert-and-return a default
user.setdefault("role", "member")
print(user)   # {'name': 'Ada', 'role': 'member'}
user.setdefault("role", "admin")   # role already exists — NOT overwritten
print(user)   # still {'name': 'Ada', 'role': 'member'}
```
::

### Iterating dictionaries

::code-wrapper{language="python"}
```python
scores = {"Ada": 98, "Grace": 95, "Alan": 87}

for key in scores:                 # iterates KEYS by default
    print(key)

for key, value in scores.items():    # keys AND values
    print(key, value)

for value in scores.values():          # values only
    print(value)

print(list(scores.keys()))               # ['Ada', 'Grace', 'Alan']
print(list(scores.values()))               # [98, 95, 87]
print(list(scores.items()))                  # [('Ada', 98), ('Grace', 95), ('Alan', 87)]
```
::

**Gotcha**: `.keys()`, `.values()`, `.items()` return **view objects**, not lists — they stay live and reflect subsequent changes to the dict, and they don't support indexing.

::code-wrapper{language="python"}
```python
d = {"a": 1, "b": 2}
keys_view = d.keys()
print(keys_view)      # dict_keys(['a', 'b'])
d["c"] = 3
print(keys_view)         # dict_keys(['a', 'b', 'c']) — the VIEW updated automatically!

# keys_view[0]   # TypeError: 'dict_keys' object is not subscriptable
```
::

## Merging Dictionaries

::code-wrapper{language="python"}
```python
defaults = {"theme": "light", "notifications": True}
user_prefs = {"theme": "dark"}

# Python 3.9+ — the | merge operator (does NOT mutate either operand)
merged = defaults | user_prefs
print(merged)   # {'theme': 'dark', 'notifications': True}  — right side wins on conflict

# |= for in-place merge
settings = dict(defaults)
settings |= user_prefs
print(settings)   # {'theme': 'dark', 'notifications': True}

# Pre-3.9 idiom — still extremely common in real code
merged_old = {**defaults, **user_prefs}
print(merged_old)   # same result

# .update() — mutates the receiver in place
combined = dict(defaults)
combined.update(user_prefs)
print(combined)
```
::

## `defaultdict` and `Counter`

Two of the most-used tools from `collections` for real-world data wrangling.

::code-wrapper{language="python"}
```python
from collections import defaultdict, Counter

# defaultdict — auto-creates a default value for missing keys, avoiding
# verbose "if key not in d: d[key] = []" boilerplate
groups = defaultdict(list)
words = ["apple", "banana", "avocado", "blueberry", "cherry"]
for word in words:
    groups[word[0]].append(word)     # no KeyError, no manual initialization

print(dict(groups))
# {'a': ['apple', 'avocado'], 'b': ['banana', 'blueberry'], 'c': ['cherry']}

# Counter — a dict subclass specialized for counting hashable items
counts = Counter("mississippi")
print(counts)                # Counter({'i': 4, 's': 4, 'p': 2, 'm': 1})
print(counts.most_common(2))    # [('i', 4), ('s', 4)]

word_counts = Counter(["cat", "dog", "cat", "bird", "dog", "cat"])
print(word_counts["cat"])         # 3
print(word_counts["fish"])          # 0 — missing keys return 0, NOT KeyError!

# Counter arithmetic
c1 = Counter(a=3, b=1)
c2 = Counter(a=1, b=2)
print(c1 + c2)   # Counter({'a': 4, 'b': 3})
print(c1 - c2)   # Counter({'a': 2}) — subtraction drops non-positive counts
```
::

### The `defaultdict` factory-function gotcha

::code-wrapper{language="python"}
```python
d = defaultdict(list)
print(d["missing"])    # [] — accessing a missing key CREATES it as a side effect!
print(list(d.keys()))    # ['missing']  — now actually in the dict, from a mere READ
```
::

**This surprises many developers**: simply *reading* `d[key]` on a `defaultdict` inserts `key` into the dict if it was absent — a read has a mutating side effect, unlike a normal dict where `d[key]` on a missing key raises `KeyError` and touches nothing. This matters if you later check `len(d)` or iterate `d` expecting only keys you explicitly set.

## Dictionary and Set Comprehensions

::code-wrapper{language="python"}
```python
# Dict comprehension
squares = {x: x ** 2 for x in range(6)}
print(squares)   # {0: 0, 1: 1, 2: 4, 3: 9, 4: 16, 5: 25}

# Invert a dict (only safe if values are unique AND hashable)
original = {"a": 1, "b": 2, "c": 3}
inverted = {v: k for k, v in original.items()}
print(inverted)   # {1: 'a', 2: 'b', 3: 'c'}

# Filter while building
prices = {"apple": 1.5, "bread": 3.0, "milk": 2.5}
affordable = {item: price for item, price in prices.items() if price < 3.0}
print(affordable)   # {'apple': 1.5, 'milk': 2.5}

# Set comprehension
unique_lengths = {len(word) for word in ["cat", "dog", "bird", "ox"]}
print(unique_lengths)   # {3, 4, 2}  — duplicates (cat/dog both len 3) collapse automatically
```
::

## Sets — Unordered Collections of Unique, Hashable Elements

::code-wrapper{language="python"}
```python
a = {1, 2, 3, 4}
b = {3, 4, 5, 6}

print(a | b)    # {1, 2, 3, 4, 5, 6}   — union
print(a & b)     # {3, 4}                — intersection
print(a - b)      # {1, 2}                 — difference (in a, not in b)
print(a ^ b)       # {1, 2, 5, 6}            — symmetric difference

print(a.issubset({1, 2, 3, 4, 5}))            # True
print({1, 2}.issubset(a))                        # True
print(a.isdisjoint({100, 200}))                     # True — no overlap

a.add(5)
a.discard(100)      # no error even if 100 is absent (unlike .remove())
# a.remove(100)      # KeyError: 100  — remove() raises if the element is absent
print(a)
```
::

### Sets deduplicate automatically — a common idiom

::code-wrapper{language="python"}
```python
emails = ["a@x.com", "b@x.com", "a@x.com", "c@x.com", "b@x.com"]
unique_emails = list(set(emails))    # order NOT guaranteed to match input!
print(sorted(unique_emails))            # sort explicitly if order matters

# To deduplicate WHILE preserving original order, use dict.fromkeys (3.7+)
# since dicts preserve insertion order but sets do not:
ordered_unique = list(dict.fromkeys(emails))
print(ordered_unique)   # ['a@x.com', 'b@x.com', 'c@x.com'] — first-seen order preserved
```
::

## Hashability — What Can Be a Dict Key or Set Member

Only **hashable** objects can be dict keys or set elements. An object is hashable if it defines `__hash__` (and, by convention, `__eq__` consistently) and — critically — is **immutable in the properties used for hashing**.

::code-wrapper{language="python"}
```python
d = {}
d[(1, 2)] = "point"          # tuples of hashable items: OK
d["string"] = "ok"              # strings: OK
d[42] = "ok"                       # ints: OK
d[frozenset([1, 2])] = "ok"           # frozenset: OK (the immutable set variant)

# d[[1, 2]] = "fails"      # TypeError: unhashable type: 'list'
# d[{1, 2}] = "fails"        # TypeError: unhashable type: 'set'
# d[{"a": 1}] = "fails"        # TypeError: unhashable type: 'dict'
```
::

`list`, `dict`, and `set` are all unhashable *because they're mutable* — if you could hash a list and then mutate it, its hash would need to change, silently breaking every hash-table invariant (you'd never be able to find it again by its now-stale hash bucket). This is a deliberate, load-bearing design constraint, not an arbitrary limitation.

## Complexity Cheat Sheet

| Operation | dict | set | Complexity |
|---|---|---|---|
| Lookup / membership `in` | `d[k]`, `k in d` | `x in s` | O(1) average |
| Insert | `d[k] = v` | `s.add(x)` | O(1) average |
| Delete | `del d[k]` | `s.remove(x)` | O(1) average |
| Iteration | `for k in d` | `for x in s` | O(n) |

This O(1) average lookup is *why* `x in some_set` or `x in some_dict` is dramatically faster than `x in some_list` (O(n) linear scan) for large collections — one of the most impactful, easy performance wins in everyday Python code.

::code-wrapper{language="python"}
```python
# SLOW for large data: O(n) per lookup, O(n * m) total
allowed_ids_list = list(range(100_000))
def is_allowed_slow(user_id):
    return user_id in allowed_ids_list   # linear scan every call

# FAST: O(1) per lookup, O(m) total
allowed_ids_set = set(range(100_000))
def is_allowed_fast(user_id):
    return user_id in allowed_ids_set    # hash lookup every call
```
::

## 💡 Tips & Tricks

- **`dict.fromkeys(iterable)` deduplicates while preserving first-seen order** — the idiomatic replacement for `list(set(x))` whenever order matters (which is often, e.g., preserving user-input ordering in logs or UI lists).
- **`Counter.most_common(n)` replaces manual sort-by-count boilerplate** — for "top N most frequent items" tasks, this one call replaces building a list of tuples and sorting it yourself.
- **`ChainMap` layers multiple dicts without copying** — `collections.ChainMap(overrides, defaults)` looks up keys in `overrides` first, then `defaults`, without merging them into a new object — ideal for CLI-args-over-config-file-over-defaults precedence chains.
- **`dict | other` (3.9+) is the modern, allocation-clear way to merge two dicts** — clearer than `{**a, **b}` for simple two-dict merges, though `{**a, **b, "extra": 1}` remains necessary when adding ad hoc keys inline.
- **`frozenset` for hashable, immutable sets** — when you need a set as a dict key or set member (e.g., memoizing a function that takes an unordered collection of tags), convert with `frozenset(my_set)`.

## ⚠️ Edge Cases & Gotchas

- **`.keys()`/`.values()`/`.items()` are live views, not snapshots** — they reflect the dict's current state even after later mutation, and raise `RuntimeError: dictionary changed size during iteration` if you mutate the dict's size while iterating one of these views directly.
- **Merely reading a missing key on a `defaultdict` inserts it** — `d[key]` on a `defaultdict` is not side-effect-free like it is on a regular dict; use `key in d` or `.get(key)` (which does NOT trigger the factory) when you want to check without inserting.
- **Dict/set key uniqueness depends on `__eq__` and `__hash__` agreeing** — `1 == 1.0 == True` are all mutually equal in Python and all hash to the same value, so `{1, 1.0, True}` collapses to a set with a single element (whichever was inserted first is retained): `{1, 1.0, True} == {1}`. This surprises people who expect type to matter for set/dict-key equality.
- **Mutating an object after using it as a dict key (if it happens to be a mutable-adjacent custom class) corrupts the hash table** — if you implement a custom `__hash__` based on mutable fields and then mutate those fields, the object becomes unfindable in its own dict/set (it hashes to a different bucket than where it was originally placed) — this is why hashable custom classes should base `__hash__` only on fields that never change after construction (chapter 14 covers implementing `__hash__` correctly).
- **Dict/set iteration order for sets is insertion-order-like in small cases but is NOT guaranteed by the language at all** — unlike dicts (where insertion-order preservation is a documented guarantee since 3.7), sets make no ordering guarantee whatsoever; two sets with identical elements inserted in a different order may iterate differently, and this can change between Python versions or even between runs with hash randomization (`PYTHONHASHSEED`) enabled for strings.

## 🧠 Spot the Bug

A caching layer uses a `defaultdict` to track per-user request counts and logs "new users." What's wrong?

::code-wrapper{language="python"}
```python
from collections import defaultdict

request_counts = defaultdict(int)

def log_request(user_id):
    is_new_user = user_id not in request_counts
    count = request_counts[user_id]     # bumped below
    request_counts[user_id] += 1
    if is_new_user:
        print(f"New user seen: {user_id}")

def get_active_user_count():
    return len(request_counts)

log_request("alice")
print(get_active_user_count())

# Somewhere else in the codebase, an unrelated debug check:
if "bob" in request_counts:
    print("bob has made requests")
print(request_counts["bob"])   # a "harmless" debug print
print(get_active_user_count())
```
::

<details>
<summary>Answer</summary>

After the debug print, `get_active_user_count()` returns `2`, not `1` — even though `"bob"` never made a real request. `print(request_counts["bob"])` reads a missing key on a `defaultdict(int)`, which silently inserts `"bob": 0` as a side effect of the read. The subsequent `get_active_user_count()` (which just does `len(request_counts)`) now counts bob as an "active user" purely because someone printed his count for debugging.

The fix: use `request_counts.get(user_id, 0)` for read-only inspection (never triggers the factory), and reserve `request_counts[user_id]` for code paths that genuinely intend to create-or-update an entry.

**The lesson**: `defaultdict` trades `KeyError` safety for a subtler hazard — reads are not side-effect-free, so `in`-checks and `len()` after speculative/debug reads can silently include entries nobody meant to create.

</details>

## Key Takeaways

- Dicts preserve insertion order (guaranteed since 3.7); `.keys()`/`.values()`/`.items()` return live views, not static lists.
- `.get()` and `.setdefault()` avoid `KeyError` for reads and conditional inserts respectively; prefer them over manual `if key in d` boilerplate.
- `defaultdict` and `Counter` from `collections` eliminate common manual-initialization boilerplate — but remember that reading a missing key on a `defaultdict` inserts it.
- Only immutable-by-contract, hashable objects (numbers, strings, tuples-of-hashables, frozensets) can be dict keys or set members — this is a deliberate consequence of how hash tables work, not an arbitrary restriction.
- `x in some_set`/`x in some_dict` is O(1) average vs. O(n) for `x in some_list` — converting a large membership-checked list to a set is one of the highest-leverage, lowest-effort performance fixes in everyday Python.
