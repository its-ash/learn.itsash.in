---
title: "Dart — Reified Generics, Bounds & Covariance"
description: "Deep-dive into Dart's reified generics, bounded type parameters, covariance soundness, generic method inference, and runtime type checking patterns. Code-first engineering reference."
---

# Dart — Reified Generics, Bounds & Covariance

## Reified Generics — Runtime Type Information

::code-wrapper{language="dart"}
```dart
// Dart generics are REIFIED — type parameters exist at runtime.
// Unlike Java's type erasure, you can check `is List<int>` at runtime.

var list = <int>[1, 2, 3];
print(list.runtimeType);  // List<int> — the type is preserved at runtime
print(list is List<int>);  // true
print(list is List<num>);  // true (covariance: List<int> is a List<num>)
print(list is List<String>);  // false

// Contrast with Java: `list instanceof List<Integer>` doesn't compile (erased).
// Dart's reified generics enable runtime type dispatch.

// Using reified types in practice:
void processList(List<dynamic> items) {
  if (items is List<int>) {
    // items is promoted to List<int> here — reified check enables this.
    print('Int list, sum: ${items.fold(0, (a, b) => a + b)}');
  } else if (items is List<String>) {
    print('String list: ${items.join(", ")}');
  } else {
    print('Unknown list type: ${items.runtimeType}');
  }
}
```
::

## Generic Classes — Type-Safe Collections

::code-wrapper{language="dart"}
```dart
// A generic Stack with type-safe push/pop.
class Stack<T> {
  final _items = <T>[];  // typed internal storage

  void push(T item) => _items.add(item);  // only T accepted

  T pop() {
    if (_items.isEmpty) throw StateError('Stack is empty');
    return _items.removeLast();  // returns T (not dynamic)
  }

  T peek() {
    if (_items.isEmpty) throw StateError('Stack is empty');
    return _items.last;
  }

  bool get isEmpty => _items.isEmpty;
  int get length => _items.length;

  // Generic method on a generic class — U is independent of T.
  List<U> map<U>(U Function(T) fn) => _items.map(fn).toList();
}

// T is inferred at construction:
var stack = Stack<String>();  // T = String
stack.push('hello');
var item = stack.pop();  // item is String (typed, not dynamic)
// stack.push(42);  // ✗ compile error: int is not String

var intStack = Stack<int>();  // T = int
intStack.push(42);
var doubled = intStack.map((n) => n * 2);  // U = int, returns List<int>
var asStrings = intStack.map((n) => n.toString());  // U = String, returns List<String>
```
::

## Bounded Type Parameters — Constraining T

::code-wrapper{language="dart"}
```dart
// `T extends Model` — T must be a Model subtype. Inside the class,
// you can call Model's methods on T values.

abstract class Model {
  int get id;
  Map<String, dynamic> toJson();
}

class Repository<T extends Model> {
  final List<T> _items = [];

  void add(T item) => _items.add(item);

  // Can call `item.id` because T extends Model.
  T? findById(int id) {
    for (var item in _items) {
      if (item.id == id) return item;  // ✓ .id is available (from Model bound)
    }
    return null;
  }

  List<Map<String, dynamic>> allJson() =>
      _items.map((item) => item.toJson()).toList();  // ✓ .toJson() available
}

class User extends Model {
  @override final int id;
  final String name;
  User(this.id, this.name);

  @override
  Map<String, dynamic> toJson() => {'id': id, 'name': name};
}

var repo = Repository<User>();  // ✓ User extends Model
// var bad = Repository<String>();  // ✗ String doesn't extend Model
repo.add(User(1, 'Alice'));
print(repo.findById(1)?.name);  // 'Alice'

// ── Self-bounded: T extends Comparable<T> ──
// T must be comparable to itself — enables sorting.
class SortedList<T extends Comparable<T>> {
  final _items = <T>[];

  void add(T item) {
    _items.add(item);
    _items.sort((a, b) => a.compareTo(b));  // ✓ compareTo available
  }

  List<T> get items => List.unmodifiable(_items);
}

// `T extends Object` — excludes Null (default bound is Object?).
class Cache<T extends Object> {
  final _cache = <String, T>{};
  T? get(String key) => _cache[key];  // T is non-nullable (excludes Null)
  void set(String key, T value) => _cache[key] = value;
}
```
::

## Covariance — Convenience vs Soundness

::code-wrapper{language="dart"}
```dart
// Dart generics are COVARIANT: List<Dog> is a subtype of List<Animal>.
// This is convenient but UNSOUND — you could add a Cat to a List<Dog>
// passed as List<Animal>. The runtime catches violations (TypeError).

class Animal { String get name => 'Animal'; }
class Dog extends Animal { @override String get name => 'Dog'; }
class Cat extends Animal { @override String get name => 'Cat'; }

void feedAll(List<Animal> animals) {
  for (var a in animals) print('Feeding ${a.name}');
}

var dogs = <Dog>[Dog(), Dog()];
feedAll(dogs);  // ✓ List<Dog> is a List<Animal> (covariance)

// The soundness hole:
void addCat(List<Animal> animals) {
  animals.add(Cat());  // ✓ compiles — List<Animal> accepts Animal
}

var dogList = <Dog>[Dog()];
// addCat(dogList);  // ✗ runtime TypeError: Cat is not a Dog
// At runtime, the VM checks the actual type (List<Dog>) and rejects Cat.
```

### Covariance Anti-Pattern

::code-wrapper{language="dart"}
```dart
// ❌ Anti-pattern: relying on covariance to add to a list.
void addToDogs(List<Animal> animals) {
  animals.add(Dog());  // seems fine — but if `animals` is actually List<Cat>...
}

var cats = <Cat>[Cat()];
// addToDogs(cats);  // ✗ runtime TypeError: Dog is not a Cat

// The runtime check catches it, but it's a design smell. If you're adding,
// the parameter should be typed correctly. Covariance is safe for READS,
// not WRITES.

// ✓ For write-safe APIs, use `List<Animal>` (accepts any Animal subtype list
// for reading). For writes, accept `List<Animal>` explicitly constructed.
```
::

## Generic Methods — Independent Type Parameters

::code-wrapper{language="dart"}
```dart
// A generic method has its own type parameter, independent of the class.
class Cache {
  final _cache = <String, Object>{};

  // T is inferred from the `loader` return type at the call site.
  T getOrCompute<T extends Object>(String key, T Function() loader) {
    final cached = _cache[key];
    if (cached is T) return cached;  // reified check — safe
    final value = loader();
    _cache[key] = value;
    return value;
  }
}

final cache = Cache();
var user = cache.getOrCompute('user', () => fetchUser());  // T = User
var count = cache.getOrCompute('count', () => 42);  // T = int

// ❌ Anti-pattern: `as T` blindly trusts the caller's type parameter.
class BadCache {
  final _cache = <String, Object>{};
  T get<T>(String key) => _cache[key] as T;  // throws TypeError if wrong type
}

void main() {
  final c = BadCache();
  c._cache['x'] = 42;
  // c.get<String>('x');  // ✗ TypeError: 42 is not a String
}

// ✓ Correct: use `is T` (reified check) to validate before returning.
class SafeCache {
  final _cache = <String, Object>{};
  T? get<T extends Object>(String key) {
    final value = _cache[key];
    if (value is T) return value;  // reified generics enable this
    return null;  // type mismatch or missing — no crash
  }
}
```
::

## Type Inference & `dynamic` Traps

::code-wrapper{language="dart"}
```dart
// Type inference from arguments:
T firstOf<T>(List<T> items) => items.first;

var x = firstOf([1, 2, 3]);  // T inferred as int — x is int
var y = firstOf(['a', 'b']);  // T inferred as String — y is String
var z = firstOf<int>([1, 2]);  // explicit T — z is int

// ❌ Anti-pattern: dynamic list causes T to infer as dynamic.
var mixed = <dynamic>[1, 'two', 3.0];
var first = firstOf(mixed);  // T = dynamic — first is dynamic, no type safety
first.abs();  // compiles (dynamic), throws NoSuchMethodError on 'two'

// ✓ Correct: use typed lists, or convert before passing.
var typed = mixed.whereType<int>().toList();  // filters to List<int>
var firstInt = firstOf(typed);  // T = int

// Generic type parameters are not values — you can't use `T` as a Type:
class Box<T> {
  // print(T);  // ✗ T is not a value, it's a type
  Type get type => T;  // ✓ T can be used as a Type in type context
  bool isTypeOf(Object obj) => obj is T;  // ✓ reified check
}
```
::

## 💡 Tips & Tricks

- **Idiom**: use `is T` (not `as T`) for generic cache retrieval — `if (value is T) return value` uses reified generics for a safe runtime check. `as T` blindly trusts the caller and throws `TypeError` on mismatch. Return `null` (or a Result) on mismatch instead of crashing.
- **Idiom**: `T extends Object` to exclude `Null` from a type parameter — the default bound is `Object?` (nullable). `T extends Object` makes `T` non-nullable, useful for caches/containers that shouldn't hold null.
- **Idiom**: bounded type parameters (`T extends Model`) to access the bound's methods — inside `Repository<T extends Model>`, you can call `Model`'s methods on `T`. Use `T extends Comparable<T>` for sortable types (self-bounded).
- **Idiom**: let type parameters be inferred when obvious — `firstOf([1,2,3])` infers `T = int`. Explicit `<int>` is redundant. Specify when inference is unclear or for readability at the call site.
- **Idiom**: use reified generics for runtime type dispatch — `if (x is List<int>)` works at runtime (unlike Java's erased generics). Use for type-based processing, but prefer polymorphism when possible.

## ⚠️ Edge Cases & Gotchas

- **Dart generics are reified**: `List<int>.runtimeType` is `List<int>`; `is List<int>` works at runtime. Unlike Java's erased generics, full type info is preserved.
- **Covariance is unsound but allowed**: `List<Dog>` is `List<Animal>` (covariant). Adding a `Cat` to a `List<Dog>` passed as `List<Animal>` → runtime `TypeError`. Dart trades soundness for ergonomics.
- **`List<int>` is `List<num>` (covariance)**: but you can't add a `double` to a `List<int>` (runtime check rejects). `List<num>` accepts both.
- **Generic type parameters can't be used in static contexts**: a static method can't reference the class's `T` (no instance). Use a generic method with its own type parameter.
- **`T` is not a value**: `print(T)` is invalid. Use `T` as a type annotation, not a value. For the runtime type of an instance, use `runtimeType`.
- **Default bound is `Object?`**: `T` without a bound is `Object?` — can be `Null`. Use `T extends Object` to exclude null.
- **`as T` in a generic cache throws on mismatch**: `_cache[key] as T` blindly trusts the caller's type. Use `is T` (reified check) to validate, returning `null` on mismatch.
- **`dynamic` lists cause `T` to infer as `dynamic`**: `firstOf(<dynamic>[1, 'two'])` infers `T = dynamic` — no type safety. Convert to a typed list first (`whereType<int>()`).
- **No `super` bounds (lower bounds)**: Dart doesn't have `? super T` like Java. Only upper bounds (`T extends Animal`).
- **Casting generic collections**: `list as List<int>` throws if `list` is `List<dynamic>` with non-ints. Use `list.cast<int>()` (lazy cast, checks on access) or `List<int>.from(list)` (eager copy).

## 🧠 Spot the Bug

A developer creates a generic cache and retrieves a value with the wrong type:

::code-wrapper{language="dart"}
```dart
class Cache {
  final _cache = <String, Object>{};
  void put(String key, Object value) => _cache[key] = value;
  T get<T>(String key) => _cache[key] as T;
}

void main() {
  final cache = Cache();
  cache.put('count', 42);
  final name = cache.get<String>('count');  // 💥
  print(name);
}
```
::

What happens and how to fix it?

<details>
<summary>Answer</summary>

`cache.get<String>('count')` does `_cache['count'] as String` — casting `42` (an `int`) to `String` throws `TypeError` at runtime: `type 'int' is not a subtype of type 'String'`.

The `as T` cast blindly trusts the caller's type parameter. There's no validation — the caller asks for a `String`, but the stored value is an `int`. The `TypeError` surfaces deep in the cache, with no context about what was stored vs. what was requested.

The fix — use `is T` (reified check) to validate before returning:

```dart
class Cache {
  final _cache = <String, Object>{};
  void put(String key, Object value) => _cache[key] = value;

  T? get<T extends Object>(String key) {
    final value = _cache[key];
    if (value is T) return value;  // reified check — only returns if actually T
    return null;  // type mismatch or missing key — no crash
  }
}

void main() {
  final cache = Cache();
  cache.put('count', 42);
  final count = cache.get<int>('count');    // 42
  final name = cache.get<String>('count');  // null (type mismatch, no crash)
  print(name);  // null — handle gracefully
}
```

Using `is T` (enabled by reified generics) validates the type at runtime. If the stored value isn't a `T`, it returns `null` instead of throwing. The caller handles the `null` case — no opaque `TypeError` deep in the cache.

</details>