# 06 — Collections (Lists, Sets, Maps)

Dart's collections: `List` (ordered, indexed), `Set` (unique, unordered), `Map` (key-value). All support generics, spreads, and collection-if/for.

## Lists

::code-wrapper{language="dart"}
```dart
var numbers = [1, 2, 3];
List<String> fruits = ['apple', 'banana'];
var empty = <int>[];              // typed empty list
var fixed = List<int>.filled(5, 0);   // [0, 0, 0, 0, 0]
```
::
### Access and modify

::code-wrapper{language="dart"}
```dart
var list = ['a', 'b', 'c'];
list[0];          // 'a' (0-indexed)
list.length;      // 3
list.last;        // 'c'
list.first;       // 'a'
list.add('d');    // append
list.insert(1, 'x');   // insert at index
list.remove('b');      // remove first occurrence
list.removeAt(0);      // remove by index
list.contains('a');    // true
list.indexOf('c');     // 2
```
::
### List methods

::code-wrapper{language="dart"}
```dart
[1, 2, 3].map((e) => e * 2).toList();         // [2, 4, 6]
[1, 2, 3, 4].where((e) => e.isEven).toList(); // [2, 4]
[3, 1, 2].sort();                             // [1, 2, 3] (in-place)
[1, 2, 3].reversed.toList();                  // [3, 2, 1]
[1, 2, 3].fold(0, (a, b) => a + b);           // 6 (reduce with initial)
[1, 2, 3].reduce((a, b) => a + b);            // 6 (no initial)
[1, 2, 3].any((e) => e > 2);                  // true
[1, 2, 3].every((e) => e > 0);                // true
[1, 2, 3].join(', ');                         // '1, 2, 3'
[1, 2, 3].sublist(1);                         // [2, 3]
```
::
`map`/`where` return lazy `Iterable`s — call `.toList()` to materialize. `sort` is in-place (returns void). `fold` has an initial value; `reduce` doesn't (throws on empty).

### Const lists

::code-wrapper{language="dart"}
```dart
const colors = ['red', 'green'];   // compile-time constant, immutable, canonicalized
// colors.add('blue');              // ✗ const lists are immutable
```
::
### Spread and collection-if/for

::code-wrapper{language="dart"}
```dart
var a = [1, 2];
var b = [0, ...a, 3];           // [0, 1, 2, 3]
var c = [0, ...?nullable, 3];   // null-aware spread (skips if null)

var withAd = [
	'item',
	if (showAd) 'advertisement',   // collection-if
	for (var i = 0; i < 3; i++) 'item$i',   // collection-for
];
```
::
Collection-if and collection-for build lists conditionally/programmatically — no `addAll` or `if`-then-`add` boilerplate.

## Sets

::code-wrapper{language="dart"}
```dart
var colors = {'red', 'green', 'blue'};
Set<int> numbers = {1, 2, 3};
var empty = <int>{};            // typed empty set (NOT {} which is a Map)
var dupes = {1, 1, 2, 2, 3};   // {1, 2, 3} (duplicates removed)
```
::
### Set operations

::code-wrapper{language="dart"}
```dart
var a = {1, 2, 3};
var b = {3, 4, 5};
a.union(b);            // {1, 2, 3, 4, 5}
a.intersection(b);     // {3}
a.difference(b);       // {1, 2}
a.contains(2);         // true
a.add(4);              // {1, 2, 3, 4}
a.remove(1);           // {2, 3, 4}
```
::
Sets are unordered (the default `LinkedHashSet` preserves insertion order, but you shouldn't rely on it). Use Sets for uniqueness and set operations (union, intersection).

## Maps

::code-wrapper{language="dart"}
```dart
var ages = {'Alice': 30, 'Bob': 25};
Map<String, int> scores = {};
var empty = <String, int>{};

ages['Alice'];        // 30 (null if missing)
ages['Charlie'];      // null (missing key)
ages['Charlie'] = 35; // add/update
ages.containsKey('Alice');   // true
ages.containsValue(30);      // true
ages.keys;           // Iterable<String> ('Alice', 'Bob', 'Charlie')
ages.values;         // Iterable<int> (30, 25, 35)
ages.length;         // 3
ages.remove('Bob');
ages.forEach((k, v) => print('$k: $v'));
```
::
Accessing a missing key returns `null` (not an error) — the value type is `int?` when accessed via `[]`. The default `Map` is `LinkedHashMap` (insertion order preserved).

### Map iteration

::code-wrapper{language="dart"}
```dart
for (var entry in ages.entries) {
	print('${entry.key}: ${entry.value}');
}

for (var key in ages.keys) { ... }
for (var value in ages.values) { ... }

ages.forEach((key, value) { ... });
```
::
## Type safety and generics

::code-wrapper{language="dart"}
```dart
List<int> numbers = [1, 2, 3];
// numbers.add('four');   // ✗ type error

Map<String, int> scores = {'a': 1};
// scores['b'] = 'two';   // ✗ type error
```
::
Collections are typed — the element type is enforced. `List<dynamic>` or `Map<dynamic, dynamic>` (the default for `[]`/`{}` without type args) allows any type but loses type safety.

## `Iterable` vs `List`

`Iterable` is a lazy sequence — you can iterate it, but it doesn't have `[]` indexing or `length` (unless it's a `List`). `map`/`where`/`expand` return `Iterable`. Call `.toList()` to materialize:

::code-wrapper{language="dart"}
```dart
var iter = [1, 2, 3].map((e) => e * 2);   // Iterable<int>
iter.length;   // ✗ Iterable has no length (actually, it does — but it iterates)
var list = iter.toList();   // [2, 4, 6]
list.length;   // 3
```
::
Lazy `Iterable`s are efficient (no intermediate list) but re-iterate each time. `.toList()` caches.

## Immutable collections

Dart's built-in collections are mutable. For immutability:
- `const` collections (compile-time, deeply immutable).
- `List.unmodifiable(list)` — view that throws on mutation.
- `package:fast_immutable_collections` or `built_collection` — persistent immutable collections.

::code-wrapper{language="dart"}
```dart
final mutable = [1, 2, 3];
final readonly = List.unmodifiable(mutable);
// readonly.add(4);   // ✗ throws UnsupportedError
```
::
## 💡 Tips & Tricks

- **Idiom**: use `map`/`where`/`fold`/`any`/`every` (functional methods) over manual loops — `[1,2,3].map((e) => e * 2).toList()` is clearer than a `for` loop building a list. Call `.toList()` to materialize lazy `Iterable`s.
- **Idiom**: use collection-if and collection-for in literals — `[item, if (showAd) ad, for (var i in items) i]` builds lists conditionally/programmatically, no `addAll` boilerplate. Unique to Dart, very expressive.
- **Idiom**: use `Set` for uniqueness and set operations — `set1.union(set2)`, `intersection`, `difference`. For "unique items," a `Set` is clearer than "check before add to a List."
- **Idiom**: use `...?` (null-aware spread) for optional nested collections — `[...?optionalList]` skips if `optionalList` is null, no `if` check. Clean for conditional inclusion.
- **Idiom**: use `List.unmodifiable()` for read-only views — it wraps a list and throws on mutation. Use for returning internal lists to prevent external modification. For deep immutability, use `const` or `built_collection`.

## ⚠️ Edge Cases & Gotchas

- **`{}` is an empty `Map`, not a `Set`**: `var x = {}` infers `Map<dynamic, dynamic>`. Use `var x = <int>{}` or `<int>{}` for an empty Set.
- **`map`/`where` return lazy `Iterable`**: not a `List`. No `[]` indexing (well, `elementAt` works but iterates). Call `.toList()` to cache and get `List` methods.
- **`sort` is in-place, returns `void`**: `var sorted = [3,1,2].sort()` — `sorted` is `void` (not the sorted list). Use `[...list]..sort()` or `list.toList()..sort()` to get a sorted copy.
- **`reduce` throws on empty**: `[].reduce(...)` throws `StateError`. Use `fold` (with an initial value) for possibly-empty lists, or check `isEmpty` first.
- **Accessing a missing `Map` key returns `null`**: `map['missing']` is `null`, not an error. The value type is `int?` when accessed via `[]`. Use `containsKey` or `??` to handle.
- **`List.filled(n, x)` creates a fixed-length list**: `List.filled(5, 0)` is fixed-length (can't add/remove, but can modify elements). Use `List.filled(5, 0, growable: true)` for a growable list, or `<int>[]`.
- **`const` collections are deeply immutable and canonicalized**: `const [1,2,3]` is the same instance everywhere. Mutating throws. Use for fixed data.
- **`List.unmodifiable` is a view**: it wraps the original; mutations to the original are visible through the view. It's not a copy. For a true immutable copy, use `List.unmodifiable([...original])`.
- **Sets don't preserve order (conceptually)**: the default `LinkedHashSet` preserves insertion order, but relying on it is fragile. If order matters, use a `List`.
- **`==` for collections is identity**: `[1,2] == [1,2]` is `false`. Use `listEquals` (Flutter) or `DeepCollectionEquality().equals` for value equality. `Set`/`Map` have the same issue.

## 🧠 Spot the Bug

A developer sorts a list and assigns the result, but the sorted list is `void`:

::code-wrapper{language="dart"}
```dart
var numbers = [3, 1, 2];
var sorted = numbers.sort();
print(sorted);   // ?
```
::

What's wrong?

<details>
<summary>Answer</summary>

`sort()` sorts the list *in-place* and returns `void` (not the sorted list). So `sorted` is `void`, and `print(sorted)` prints `null` (or errors, depending on context). The original `numbers` is sorted to `[1, 2, 3]`, but `sorted` doesn't hold it.

The fix — sort a copy, or sort in-place then use the original:

```dart
// Option 1: sort a copy
var numbers = [3, 1, 2];
var sorted = [...numbers]..sort();   // spread to copy, cascade sort
print(sorted);   // [1, 2, 3]
print(numbers);  // [3, 1, 2] (unchanged)

// Option 2: sort in-place, use the original
var numbers = [3, 1, 2];
numbers.sort();
print(numbers);  // [1, 2, 3]
```
::
`[...numbers]` creates a copy (spread), and `..sort()` (cascade) sorts it and returns the list. This gives a sorted copy without mutating the original.

**The lesson**: Dart's `List.sort()` is in-place and returns `void` (like Java, unlike Python's `sorted()`). To get a sorted copy, spread to a new list and cascade-sort: `[...list]..sort()`. Don't assign the result of `sort()`.

</details>

## Summary

You can use `List` (access, methods, `map`/`where`/`fold`/`sort`, spread, collection-if/for), `Set` (uniqueness, union/intersection/difference), `Map` (access, iteration, `entries`), generics for type safety, `Iterable` (lazy, `.toList()`), and immutable collections (`const`, `List.unmodifiable`) — with the `sort`-returns-void and `{}`-is-a-Map traps avoided. Next: classes and objects.