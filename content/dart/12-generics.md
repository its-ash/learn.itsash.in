# 12 — Generics

Generics enable type-safe, reusable code. Parameterize classes and functions with type parameters.

## Why Generics?

::code-wrapper{language="dart"}
```dart
// Without generics (List<dynamic> — no type safety)
var list = [1, 2, 3];
list.add('four');   // ✓ allowed (dynamic)
list[0].abs();      // ✗ runtime error: String has no abs()

// With generics
List<int> numbers = [1, 2, 3];
// numbers.add('four');   // ✗ compile error
numbers[0].abs();         // ✓ int has abs
```

Generics catch type errors at compile time and document intent.

## Generic Classes

::code-wrapper{language="dart"}
```dart
class Stack<T> {
	final _items = <T>[];

	void push(T item) => _items.add(item);
	T pop() => _items.removeLast();
	bool get isEmpty => _items.isEmpty;
}

var stack = Stack<String>();
stack.push('hello');
var item = stack.pop();   // String (typed)
```

`T` is a type parameter (convention: single uppercase letters — `T`, `E`, `K`, `V`). `Stack<T>` is parameterized; `Stack<String>` instantiates with `T = String`.

## Generic Functions

::code-wrapper{language="dart"}
```dart
T firstOf<T>(List<T> items) => items.first;

var x = firstOf<int>([1, 2, 3]);        // 1 (int)
var y = firstOf(['a', 'b']);            // 'a' (T inferred as String)
```

Type parameters can be inferred from arguments. Explicit `<int>` is optional when inferable.

## Generic Methods on Classes

::code-wrapper{language="dart"}
```dart
class Cache {
	final _cache = <String, Object>{};

	T get<T>(String key, T Function() loader) {
		if (_cache.containsKey(key)) {
			return _cache[key] as T;
		}
		final value = loader();
		_cache[key] = value;
		return value;
	}
}

final cache = Cache();
var user = cache.get('user', () => fetchUser());   // T inferred as User
```

The method has its own type parameter `T`, independent of the class.

## Bounded Type Parameters

Restrict `T` to a subtype:

::code-wrapper{language="dart"}
```dart
class Repository<T extends Model> {
	final List<T> items = [];
	void add(T item) => items.add(item);
	T find(int id) => items.firstWhere((i) => i.id == id);
}

class User extends Model { ... }
var repo = Repository<User>();   // ✓ User extends Model
// var bad = Repository<String>(); // ✗ String doesn't extend Model
```

`T extends Model` means `T` must be a `Model` subtype — you can use `Model`'s methods on `T` inside the class.

### Multiple bounds

::code-wrapper{language="dart"}
```dart
class SortedList<T extends Comparable<T>> {
	final _items = <T>[];
	void add(T item) {
		_items.add(item);
		_items.sort((a, b) => a.compareTo(b));
	}
}
```

`T extends Comparable<T>` — `T` must be comparable to itself. `a.compareTo(b)` is available (from `Comparable`).

## Generic Typedefs

::code-wrapper{language="dart"}
```dart
typedef Callback<T> = void Function(T value);

Callback<int> onInt = (n) => print(n);
Callback<String> onString = (s) => print(s);
```

## The `Object` bound

By default, `T` is bounded by `Object?` (any type, including null). `T extends Object` excludes null:

::code-wrapper{language="dart"}
```dart
class Box<T extends Object> { ... }   // T can't be Null
```

## Reified Generics

Dart generics are **reified** — type parameters are available at runtime (unlike Java's type erasure):

::code-wrapper{language="dart"}
```dart
var list = <int>[1, 2, 3];
print(list.runtimeType);   // List<int> (the type is preserved)
print(list is List<int>);  // true
```

You can check `is List<int>` at runtime — the type info is preserved. This is unlike Java (`List<Integer>.class` doesn't exist) and like C#.

## Covariance

Dart generics are **covariant** — `List<Dog>` is a subtype of `List<Animal>`:

::code-wrapper{language="dart"}
```dart
void feedAll(List<Animal> animals) { ... }
var dogs = <Dog>[...];
feedAll(dogs);   // ✓ List<Dog> is a List<Animal> (covariant)
```

This is convenient but unsound (you could add a `Cat` to a `List<Dog>` passed as `List<Animal>`). Dart allows it for ergonomics; the runtime checks catch violations.

### `List<Dog>` vs `List<Dog>?>`

Covariance applies to the type parameter, not the nullability of the collection. `List<Dog>?` (nullable list) is different from `List<Dog?>` (list of nullable dogs).

## `is` and `as` with generics

::code-wrapper{language="dart"}
```dart
var list = [1, 2, 3];
if (list is List<int>) {
	print('int list');
}
var typed = list as List<int>;   // cast (throws if wrong)
```

`is` and `as` work with generic types (reified). `is List<int>` is a runtime check.

## Generic collections

All built-in collections are generic:
- `List<E>` — ordered, indexed.
- `Set<E>` — unique.
- `Map<K, V>` — key-value.
- `Iterable<E>` — lazy sequence.
- `Stream<E>` — async sequence.
- `Future<T>` — async value.

## 💡 Tips & Tricks

- **Idiom**: use generics for type-safe collections and APIs — `List<int>`, `Stack<T>`, `Repository<T extends Model>`. They catch type errors at compile time and document intent. Prefer `List<int>` over `List<dynamic>`.
- **Idiom**: use bounded type parameters (`T extends Model`) to access the bound's methods — inside `Repository<T extends Model>`, you can call `Model`'s methods on `T`. Use `T extends Comparable<T>` for sortable types.
- **Idiom**: let type parameters be inferred when obvious — `firstOf([1,2,3])` infers `T = int`; explicit `firstOf<int>(...)` is redundant. Specify `<Type>` when inference is unclear or for readability at the call site.
- **Idiom**: use reified generics for runtime type checks — `if (x is List<int>)` works at runtime (Dart's generics are reified, unlike Java's erased). Use for type dispatch, but prefer polymorphism when possible.
- **Idiom**: use `T extends Object` to exclude `null` from a type parameter — by default `T` is `Object?` (nullable). `T extends Object` makes `T` non-nullable, useful for caches/containers that shouldn't hold null.

## ⚠️ Edge Cases & Gotchas

- **Dart generics are reified** (not erased): `List<int>.runtimeType` is `List<int>`; `is List<int>` works at runtime. Unlike Java, you have full runtime type info. This is like C#.
- **Covariance is unsound but allowed**: `List<Dog>` is a `List<Animal>` (covariant). You could add a `Cat` to a `List<Dog>` passed as `List<Animal>` — a runtime check catches this (`TypeError`). Dart trades soundness for ergonomics.
- **`List<int>` vs `List<num>`**: `List<int>` is a `List<num>` (covariance), but you can't add a `double` to a `List<int>` (runtime check: `List<int>` doesn't accept `double`). `List<num>` accepts both.
- **Generic type parameters can't be used in static contexts directly**: a static method can't reference the class's `T` (no instance). Use a generic method with its own type parameter.
- **`T` is not available at runtime by name**: `T` inside a function isn't a `Type` value. `print(T)` is invalid. Use `T` as a type annotation, not a value. To get the runtime type of an instance, use `runtimeType`.
- **Default bound is `Object?`**: `T` without a bound is `Object?` — can be `Null`. Use `T extends Object` to exclude null.
- **`is` with generic types works (reified)**: `x is List<int>` is a runtime check. But `x is List<dynamic>` is true for any `List` — be specific.
- **Generic method inference**: `firstOf([1,2,3])` infers `T = int`. But `firstOf(<dynamic>[1, 'two'])` infers `T = dynamic` — be careful with `dynamic` lists.
- **`super` bounds**: `T extends Animal` (upper bound) is common. Dart doesn't have `super` bounds (lower bounds) like Java's `? super T`.
- **Casting generic collections**: `list as List<int>` throws if `list` is `List<dynamic>` with non-ints. Use `list.cast<int>()` (lazy cast, checks on access) or `List<int>.from(list)` (eager copy).

## 🧠 Spot the Bug

A developer creates a generic cache, but retrieving an item with the wrong type fails at runtime with a confusing error:

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
	final name = cache.get<String>('count');   // crashes
	print(name);
}
```
::

What's the error?

<details>
<summary>Answer</summary>

The cache stored `42` (an `int`) under `'count'`. `cache.get<String>('count')` does `_cache['count'] as String` — casting `42` (an `int`) to `String` throws `TypeError` at runtime: `type 'int' is not a subtype of type 'String'`.

The error is confusing because the caller asked for a `String`, but the stored value was an `int`. The `as T` cast blindly trusts the caller's type parameter, with no validation.

The fix — handle the type mismatch gracefully (return `null` or throw a clearer error):

```dart
class Cache {
	final _cache = <String, Object>{};

	void put(String key, Object value) => _cache[key] = value;

	T? get<T extends Object>(String key) {
		final value = _cache[key];
		if (value is T) return value;
		return null;   // type mismatch or missing key
	}
}

void main() {
	final cache = Cache();
	cache.put('count', 42);
	final count = cache.get<int>('count');    // 42
	final name = cache.get<String>('count');   // null (type mismatch, no crash)
	print(name);   // null
}
```

Using `if (value is T)` (a runtime check, thanks to reified generics) returns the value only if it's actually a `T`, else `null`. No `TypeError` — the caller handles the `null`.

**The lesson**: `as T` in a generic cache blindly trusts the caller's type parameter and throws `TypeError` on mismatch. Use `is T` (reified check) to validate, returning `null` (or a clear error) on mismatch. Don't let type errors surface as confusing `TypeError`s deep in the cache.

</details>

## Summary

You can write generic classes (`Stack<T>`), functions (`firstOf<T>`), methods (`Cache.get<T>`), bounded type parameters (`T extends Model`, `T extends Comparable<T>`, `T extends Object`), generic typedefs, and use Dart's reified generics (`is List<int>` at runtime, `runtimeType` preserved) and covariance (`List<Dog>` is `List<Animal>`) — with the `as T`-throws-on-mismatch trap avoided via `is T`. Next: packages and libraries.