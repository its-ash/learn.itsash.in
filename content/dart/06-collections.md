---
title: "Dart — Collections, Iterables & Allocation Patterns"
description: "Deep-dive into Dart collection internals, lazy Iterable chains, spread/collection-if semantics, unmodifiable views vs copies, and zero-allocation patterns. Code-first engineering reference."
---

# Dart — Collections, Iterables & Allocation Patterns

## Lazy Iterable Chains — Evaluation Semantics

::code-wrapper{language="dart"}
```dart
// map/where/expand return LAZY Iterables — no computation until iterated.
// Each `.toList()` materializes the chain (one allocation, one pass).

// ❌ Anti-pattern: calling .toList() after every step (multiple allocations).
var result = numbers
    .map((n) => n * 2)      // lazy Iterable
    .toList()                // ← allocates a List here (premature)
    .where((n) => n > 5)    // lazy Iterable (on a List, re-iterates)
    .toList()                // ← another allocation
    .map((n) => n.toString()) // lazy
    .toList();               // ← yet another

// ✓ Correct: chain lazy operations, materialize ONCE at the end.
var resultFixed = numbers
    .map((n) => n * 2)       // lazy
    .where((n) => n > 5)     // lazy
    .map((n) => n.toString()) // lazy
    .toList();               // single allocation, single pass

// Lazy iterables re-evaluate on each iteration — no caching:
var numbers = [1, 2, 3];
var doubled = numbers.map((n) { print('mapping $n'); return n * 2; });
doubled.toList();  // prints: mapping 1, mapping 2, mapping 3
doubled.toList();  // prints again: mapping 1, mapping 2, mapping 3 (re-evaluated!)
// If the mapping is expensive, cache with .toList() and reuse the list.
```
::

## `sort` — In-Place, Returns `void`

::code-wrapper{language="dart"}
```dart
// ❌ Anti-pattern: assigning the result of sort() — it returns void.
var sorted = [3, 1, 2].sort();  // sorted is void! sort() is in-place.
print(sorted);  // null (or compile error in strict mode)

// ✓ Correct: sort a copy (don't mutate the original).
var numbers = [3, 1, 2];
var sorted = [...numbers]..sort();  // spread creates a copy, cascade sorts it
print(sorted);   // [1, 2, 3]
print(numbers);  // [3, 1, 2] — original unchanged

// Custom comparator — for descending or multi-field sort:
var users = [
  (name: 'Alice', age: 30),
  (name: 'Bob', age: 25),
  (name: 'Alice', age: 25),
];

// Sort by name (asc), then by age (desc):
users.sort((a, b) {
  final nameCmp = a.name.compareTo(b.name);
  if (nameCmp != 0) return nameCmp;
  return b.age.compareTo(a.age);  // descending age
});
// [(name: Alice, age: 30), (name: Alice, age: 25), (name: Bob, age: 25)]

// Comparable<T> — for types with a natural ordering:
class Priority implements Comparable<Priority> {
  final int level;
  const Priority(this.level);
  @override
  int compareTo(Priority other) => level.compareTo(other.level);
}
var tasks = [Priority(3), Priority(1), Priority(2)];
tasks.sort();  // uses compareTo — [1, 2, 3]
```
::

## Spread & Collection-If — Conditional Construction

::code-wrapper{language="dart"}
```dart
// Spread (...) flattens another iterable into a literal.
// Null-aware spread (...?) skips if the iterable is null.
var base = [1, 2, 3];
var extended = [0, ...base, 4];  // [0, 1, 2, 3, 4]

List<int>? maybeNull;
var safe = [0, ...?maybeNull, 4];  // [0, 4] — null spread is a no-op

// Collection-if — conditional elements in a literal (Flutter widget trees):
var widgets = <Widget>[
  Text('Header'),
  if (showAd) BannerAd(),           // included only if showAd is true
  if (user != null) ...[
    ProfilePic(user!),
    UserName(user!),
  ],                                 // spread a conditional group
  if (items.isEmpty)
    EmptyState()
  else
    ...items.map((i) => ItemWidget(i)),  // if-else in a collection literal
];

// Collection-for — programmatic elements:
var indices = [for (var i = 0; i < 5; i++) 'item-$i'];
// ['item-0', 'item-1', 'item-2', 'item-3', 'item-4']

// Nested — build complex structures declaratively:
var matrix = [
  for (var r = 0; r < 3; r++)
    [for (var c = 0; c < 3; c++) r * 3 + c]
];
// [[0,1,2], [3,4,5], [6,7,8]]
```
::

## Immutable Collections — Views vs Copies

::code-wrapper{language="dart"}
```dart
// ── const: compile-time, deeply immutable, canonicalized ──
const colors = ['red', 'green'];  // same instance everywhere, zero allocation
// colors.add('blue');  // ✗ UnsupportedError

// ── List.unmodifiable: runtime, throws on mutation, but is a VIEW ──
var source = [1, 2, 3];
var view = List.unmodifiable(source);
// view.add(4);  // ✗ UnsupportedError
source.add(4);
print(view);  // [1, 2, 3, 4] — view reflects source mutation!

// ✓ For a true immutable copy: wrap a copy, not the source.
var immutable = List.unmodifiable([...source]);  // copy then wrap
source.add(5);
print(immutable);  // [1, 2, 3, 4] — unaffected by source mutation after copy

// ── Set.unmodifiable / Map.unmodifiable: same semantics ──
var setView = Set.unmodifiable({1, 2, 3});
var mapView = Map.unmodifiable({'a': 1, 'b': 2});

// For persistent (structural sharing) immutable collections, use packages:
// - package:built_collection — persistent immutable List/Map/Set
// - package:fast_immutable_collections — high-performance persistent collections
```
::

## `reduce` vs `fold` — Empty Collection Behavior

::code-wrapper{language="dart"}
```dart
// reduce: combines elements, NO initial value — throws on empty.
// ❌ Anti-pattern: reduce on a possibly-empty list.
int sum(List<int> nums) => nums.reduce((a, b) => a + b);  // throws StateError on []
sum([]);  // Uncaught Error: Bad state: no element

// ✓ Correct: fold with an initial value — safe on empty.
int sumSafe(List<int> nums) => nums.fold(0, (a, b) => a + b);  // 0 on empty
sumSafe([]);  // 0

// fold with a different initial type (e.g., building a string):
String csv = [1, 2, 3].fold('', (acc, n) => acc.isEmpty ? '$n' : '$acc,$n');
// '1,2,3'

// reduce's return type matches the element type:
var max = [3, 1, 4, 1, 5].reduce((a, b) => a > b ? a : b);  // 5 (int)

// For first/last/single on possibly-empty: use firstWhere with orElse:
var first = [1, 2, 3].firstWhere((n) => n > 5, orElse: () => -1);  // -1
```
::

## Equality — Collections Are Identity

::code-wrapper{language="dart"}
```dart
// Built-in collections use IDENTITY for ==, not value equality.
print([1, 2] == [1, 2]);  // false — different instances
print({1, 2} == {1, 2});  // false
print({'a': 1} == {'a': 1});  // false

// ❌ Anti-pattern: using == to compare collection contents.
bool sameContent(List<int> a, List<int> b) => a == b;  // always false for distinct lists

// ✓ Correct: use listEquals / setEquals / mapEquals (Flutter) or DeepCollectionEquality.
import 'package:flutter/foundation.dart';
print(listEquals([1, 2], [1, 2]));  // true

import 'package:collection/collection.dart';
const deepEq = DeepCollectionEquality();
print(deepEq.equals([1, [2, 3]], [1, [2, 3]]));  // true — nested deep equality
print(deepEq.equals({'a': [1, 2]}, {'a': [1, 2]}));  // true

// Records have structural equality built in:
print((1, 2) == (1, 2));  // true — records compare by value, no helper needed
print((x: 1, y: 2) == (x: 1, y: 2));  // true
```
::

## 💡 Tips & Tricks

- **Performance**: chain lazy `Iterable` operations (`map`/`where`/`expand`) and call `.toList()` once at the end — single allocation, single pass. Avoid `.toList()` after every step (multiple intermediate lists).
- **Idiom**: `[...list]..sort()` for a sorted copy — spread creates a new list, cascade sorts it in-place, returns the list. Doesn't mutate the original. Prefer over `list.toList()..sort()` (clearer intent).
- **Idiom**: use `fold` (not `reduce`) for possibly-empty collections — `fold(0, (a, b) => a + b)` returns `0` on empty; `reduce` throws `StateError`. `fold` also supports a different return type than the element type.
- **Idiom**: use collection-if/for in widget trees — `[Text('header'), if (showAd) Ad(), for (var item in items) ItemWidget(item)]` builds lists declaratively. Eliminates `addAll` and `if-then-add` boilerplate.
- **Idiom**: `...?` (null-aware spread) for optional nested collections — `[...?optionalList]` skips if `optionalList` is null. Cleaner than `if (list != null) [...list]`.

## ⚠️ Edge Cases & Gotchas

- **`{}` is an empty `Map`, not a `Set`**: `var x = {}` infers `Map<dynamic, dynamic>`. Use `var x = <int>{}` or `Set<int>()` for an empty Set.
- **`map`/`where` return lazy `Iterable`**: not a `List`. No `[]` indexing (well, `elementAt` works but iterates from the start). Call `.toList()` to cache and get `List` methods.
- **`sort()` is in-place, returns `void`**: `var sorted = list.sort()` assigns `void`. Use `[...list]..sort()` for a sorted copy.
- **`reduce` throws on empty**: `[].reduce(...)` throws `StateError`. Use `fold` with an initial value for possibly-empty collections.
- **`List.filled(n, x)` is fixed-length by default**: can't `add`/`remove`, but can modify elements (`list[0] = ...`). Use `List.filled(n, x, growable: true)` or `<int>[]` for a growable list.
- **`List.unmodifiable` is a view**: mutations to the source are visible through the view. Use `List.unmodifiable([...source])` for an immutable copy.
- **`const` collections are canonicalized**: `const [1,2,3]` is the same instance everywhere (`identical` is true). Mutating throws. Zero allocation at runtime.
- **`==` for collections is identity**: `[1,2] == [1,2]` is `false`. Use `listEquals`, `DeepCollectionEquality`, or records (structural equality).
- **Lazy `Iterable` re-evaluates on each iteration**: `var gen = fib(); gen.take(10).toList(); gen.take(10).toList();` runs the generator twice. Cache with `.toList()` for reuse.
- **`Set` default is `LinkedHashSet`**: preserves insertion order, but don't rely on it semantically. If order matters, use a `List`. `HashSet` (hash-based) is faster but unordered.

## 🧠 Spot the Bug

A developer filters and maps a list, but the side effect runs more times than expected:

::code-wrapper{language="dart"}
```dart
var numbers = [1, 2, 3, 4, 5];
var result = numbers
    .map((n) { print('mapping $n'); return n * 2; })
    .where((n) => n > 4);

print(result.first);  // prints: mapping 1, mapping 2, mapping 3 → 6
print(result.last);   // prints: mapping 1, mapping 2, mapping 3, mapping 4, mapping 5 → 10
```
::

Why does `mapping` print for `1` and `2` even though they're filtered out?

<details>
<summary>Answer</summary>

The `map` and `where` operations return **lazy `Iterable`s** — no computation happens until the iterable is actually traversed. When `.first` is called, the iterable is traversed from the beginning:

1. `.first` needs the first element matching `where((n) => n > 4)`.
2. The chain is: `map` → `where`. To get the first `where` match, it pulls from `map`.
3. `map(1)` → `print('mapping 1')` → `2`. `where(2 > 4)` → false. Continue.
4. `map(2)` → `print('mapping 2')` → `4`. `where(4 > 4)` → false. Continue.
5. `map(3)` → `print('mapping 3')` → `6`. `where(6 > 4)` → true. Return `6`.

The map function runs for ALL elements up to the first match — even those filtered out by `where`. The `where` predicate receives the mapped result, not the original.

When `.last` is called, the iterable is traversed **again from the beginning** (lazy, no caching) — all 5 elements are mapped and filtered to find the last match.

The fix — materialize once if you need multiple accesses, and be aware that lazy chains process all upstream elements up to the point of the match:

```dart
// Materialize once, reuse:
var materialized = numbers
    .map((n) { print('mapping $n'); return n * 2; })
    .where((n) => n > 4)
    .toList();  // runs once: mapping 1, 2, 3, 4, 5
print(materialized.first);  // 6 (no re-evaluation)
print(materialized.last);   // 10 (no re-evaluation)
```

</details>