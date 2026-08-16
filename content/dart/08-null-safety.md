# 08 — Null Safety in Depth

Dart has **sound null safety** (since Dart 2.12). Types are non-nullable by default; `?` marks a type as nullable. The compiler enforces null safety at compile time.

## Non-nullable by default

::code-wrapper{language="dart"}
```dart
String name = 'Alice';    // non-nullable, can't be null
// name = null;           // ✗ compile error

String? maybeName;        // nullable, can be null
maybeName = null;         // ✓
maybeName = 'Bob';        // ✓
```

`String` can never be null. `String?` can be null or a `String`. The compiler tracks this and prevents null-dereference errors.

## Null-Aware Operators (recap)

### `?.` (null-aware access)

::code-wrapper{language="dart"}
```dart
String? name;
int? length = name?.length;   // null (name is null, no call)
```

### `??` (if-null)

::code-wrapper{language="dart"}
```dart
String? name;
String display = name ?? 'Anonymous';   // 'Anonymous'
```

### `??=` (null-aware assignment)

::code-wrapper{language="dart"}
```dart
String? name;
name ??= 'Alice';   // name is 'Alice' (was null)
```

### `!` (null assertion)

::code-wrapper{language="dart"}
```dart
String? name = getText();
print(name!.length);   // asserts non-null, throws if null
```

`!` promotes `T?` to `T`. Throws `TypeError` at runtime if null. Use sparingly.

## Flow Analysis and Type Promotion

Dart's compiler tracks nullability through control flow — **type promotion**:

### `if (x != null)` promotion

::code-wrapper{language="dart"}
```dart
String? name = getInput();
if (name != null) {
	print(name.length);   // ✓ name promoted to String (non-null)
}
print(name?.length);     // name is still String? outside the if
```

Inside the `if (name != null)` block, `name` is promoted to `String` — no `!` or `?.` needed.

### `if (x is T)` promotion

::code-wrapper{language="dart"}
```dart
Object x = 'hello';
if (x is String) {
	print(x.length);   // ✓ x promoted to String
}
```

### Early return

::code-wrapper{language="dart"}
```dart
String process(String? input) {
	if (input == null) return 'default';
	return input.toUpperCase();   // ✓ input promoted to String after the null check
}
```

After an early return on null, the rest of the function has `input` promoted to `String`.

## `late` and null safety

`late` variables are non-nullable but assigned later:

::code-wrapper{language="dart"}
```dart
class Widget {
	late String title;   // non-nullable, assigned later

	void init(String t) {
		title = t;
	}
}
```

`late` tells the compiler "I'll assign this before it's read." If you read before assignment, it throws `LateInitializationError`.

### `late final` with initializer (lazy)

::code-wrapper{language="dart"}
```dart
class Config {
	late final String value = _load();   // runs on first read, then cached
}
```

## `required` and null safety

For function parameters, `required` makes a named param mandatory (and non-nullable):

::code-wrapper{language="dart"}
```dart
void createUser({required String name, int? age}) { ... }
createUser(name: 'Alice');   // ✓ age is optional (nullable)
```

Without `required`, a non-nullable named param would need a default (or be nullable).

## The `Null` type

`Null` is the type of `null`. `null` is the only value of type `Null`. In sound null safety:
- `T?` is `T | Null` (a union of `T` and `Null`).
- `T` (non-nullable) excludes `Null`.

## Working with nullable collections

### Nullable element vs nullable collection

::code-wrapper{language="dart"}
```dart
List<int> a = [1, 2, 3];          // list non-null, elements non-null
List<int>? b;                     // list nullable, elements non-null
List<int?> c = [1, null, 3];      // list non-null, elements nullable
List<int?>? d;                    // both nullable
```

### Accessing nullable collection

::code-wrapper{language="dart"}
```dart
List<int>? list;
list?.length;      // null (list is null)
list?.first;       // null (list is null)
list?.add(1);      // no-op (list is null)
```

`?.` on the list accesses only if it's non-null.

## `Object?` vs `Object`

- `Object` — non-nullable, the supertype of all non-null types.
- `Object?` — nullable, the supertype of all types (including `Null`).

::code-wrapper{language="dart"}
```dart
Object a = 'hello';   // ✓
// a = null;           // ✗ Object is non-nullable
Object? b = 'hello';  // ✓
b = null;             // ✓
```

## Null safety and JSON

JSON from `dart:convert` produces `Map<String, dynamic>` — values are `dynamic` (which is nullable-ish). Parse carefully:

::code-wrapper{language="dart"}
```dart
final json = {'name': 'Alice', 'age': 30};
final name = json['name'] as String;        // cast (throws if wrong type or null)
final age = json['age'] as int;             // cast

// Safer: handle nullable
final name2 = json['name'] as String?;      // String? (null if missing)
final age2 = (json['age'] as num?)?.toInt(); // int? (null if missing)
```

Use `as Type?` (nullable cast) then handle the null, rather than `as Type` (throws on null).

## Migrating to null safety

- `dart pub outdated --mode=nullity` — shows which dependencies aren't null-safe.
- `dart migrate` — interactive migration tool (for Dart 2.x code).
- New projects (Dart 3+) are null-safe by default — no opt-out.

## 💡 Tips & Tricks

- **Idiom**: use `if (x != null)` for promotion (preferred over `!`) — `if (name != null) { name.length }` promotes `name` to non-null inside the block, no `!` needed. It's safe (no runtime throw), unlike `!` which throws if you're wrong.
- **Idiom**: use `??` for defaults and `??=` for lazy initialization — `name ?? 'Anonymous'` and `cache[key] ??= compute(key)`. Clean null handling without verbose `if` checks.
- **Idiom**: use `late final` with an initializer for lazy fields — `late final value = expensive()` runs the initializer on first read, then caches. Useful for expensive initialization that should be deferred.
- **Idiom**: prefer `as Type?` then handle null over `as Type` for JSON — `(json['x'] as String?)` returns `null` if missing, which you handle. `json['x'] as String` throws if the key is missing or null.
- **Idiom**: use `Object?` (not `dynamic`) for "any value including null" — `Object?` keeps type safety (you must check/cast to use), while `dynamic` disables checks (runtime errors). Use `dynamic` only for genuine JS interop or unknown JSON.

## ⚠️ Edge Cases & Gotchas

- **`!` throws at runtime**: `null!` throws `TypeError`. It defeats null safety. Use only when you're certain (and prefer `if (x != null)` promotion or `??`).
- **Type promotion doesn't cross closures**: `if (x != null) { () => x.length; }` — inside the closure, `x` isn't promoted (the closure could run after `x` changed). Assign to a local first: `final local = x; () => local.length;`.
- **Type promotion doesn't survive `await`**: after `await`, a nullable variable may have been set to null by another async task. Re-check after `await` or assign to a local before.
- **`late` throws on early read**: `late int x; print(x)` throws `LateInitializationError`. Ensure `late` vars are assigned before first read. Use `late final` with an initializer to avoid this (it's always assigned).
- **`List<int?>` vs `List<int>?`**: `List<int?>` is a non-null list with nullable elements; `List<int>?` is a nullable list with non-null elements. They're different — choose carefully based on whether the list or the elements can be null.
- **`dynamic` is nullable-ish**: `dynamic x = null` is valid. `x` has no static checks, so `x.foo()` compiles (throws at runtime). Don't confuse `dynamic` with `Object` (non-nullable).
- **`Object?` accepts everything, including null**: `Object? x = null` is valid. `Object x = null` is a compile error. Use `Object?` for "any value, including null."
- **Fields aren't promoted like locals**: a class field `this.x` (nullable) accessed twice — `if (x != null) { print(x.length); }` — may not promote (the field could be changed by another method between the check and use). Assign to a local: `final local = x; if (local != null) { local.length; }`.
- **`??` only checks for null, not falsy**: `0 ?? 'default'` is `0` (0 isn't null). Only `null` triggers the fallback.
- **Migrating legacy code**: Dart 3 requires null safety (no opt-out). All dependencies must be null-safe. Run `dart pub outdated --mode=nullity` to check.

## 🧠 Spot the Bug

A developer accesses a nullable field after a null check, but the compiler still complains it's nullable:

::code-wrapper{language="dart"}
```dart
class Service {
	String? _cached;

	void use() {
		if (_cached != null) {
			print(_cached.length);   // ✗ compiler error: _cached is still String?
		}
	}
}
```
::

Why?

<details>
<summary>Answer</summary>

**Type promotion doesn't apply to class fields** (only to local variables). The compiler can't promote `_cached` to `String` after the `if (_cached != null)` check, because between the check and the use, another method (or the same method, via a callback) could set `_cached` to null — the field is mutable shared state.

The fix — assign to a local variable, which can be promoted:

```dart
class Service {
	String? _cached;

	void use() {
		final cached = _cached;   // local copy
		if (cached != null) {
			print(cached.length);   // ✓ cached is promoted to String
		}
	}
}
```

The local `cached` can't be changed by other methods, so the promotion holds. After the null check, `cached` is `String` (non-null) for the rest of the block.

**The lesson**: Dart's type promotion works for local variables, not class fields (fields can be mutated by other code between the check and use). To promote a nullable field, assign it to a local first, then check the local.

</details>

## Summary

You understand sound null safety (non-nullable by default, `?` for nullable), the null-aware operators (`?.`, `??`, `??=`, `!`), flow analysis and type promotion (`if (x != null)`, `if (x is T)`), `late` (non-nullable assigned later, lazy `late final`), `required` params, nullable collections (`List<int>?` vs `List<int?>`), `Object?` vs `Object`, and JSON null handling — with the fields-don't-promote and `!`-throws traps avoided. Next: asynchronous programming.