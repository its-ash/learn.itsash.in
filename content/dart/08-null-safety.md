---
title: "Dart — Sound Null Safety, Promotion & Flow Analysis"
description: "Deep-dive into Dart's sound null safety system, type promotion rules across closures/async/fields, late initialization semantics, nullable collection algebra, and JSON interop patterns. Code-first engineering reference."
---

# Dart — Sound Null Safety, Promotion & Flow Analysis

## Type Promotion — The Complete Rule Set

::code-wrapper{language="dart"}
```dart
// Type promotion narrows a type within a scope based on control flow.
// It works ONLY on local variables (not fields, not across closures, not across await).

// ── 1. `if (x != null)` promotion ──
String? name = getInput();
if (name != null) {
  // name is promoted: String? → String. No `!` or `?.` needed.
  print(name.length);
}
// Outside the if: name is still String?.

// ── 2. `if (x is T)` promotion ──
Object obj = 'hello';
if (obj is String) {
  print(obj.length);  // obj promoted: Object → String
}
// Outside: obj is still Object.

// ── 3. Early return promotion ──
String process(String? input) {
  if (input == null) return 'default';
  // After the null-return, input is promoted to String for the rest of the function.
  return input.toUpperCase();  // no `!` needed
}

// ── 4. `??` default promotion ──
String? maybeName = getInput();
String name = maybeName ?? 'Anonymous';
// `name` is non-nullable String (if maybeName was null, it's 'Anonymous').

// ── 5. Definite assignment (late locals) ──
late String result;
if (condition) {
  result = 'yes';
} else {
  result = 'no';
}
print(result);  // ✓ assigned in all branches — definite assignment analysis
```
::

### Promotion Failures — Fields, Closures, Async Gaps

::code-wrapper{language="dart"}
```dart
// ── FIELDS: promotion does NOT work on class fields. ──
// The field is shared mutable state — another method could set it to null
// between the check and the use.
class Service {
  String? _cached;

  void use() {
    if (_cached != null) {
      // print(_cached.length);  // ✗ _cached is still String?
    }
  }

  // ✓ Fix: copy to a local (immutable snapshot).
  void useFixed() {
    final cached = _cached;  // local — can't be mutated externally
    if (cached != null) {
      print(cached.length);  // ✓ promoted to String
    }
  }
}

// ── CLOSURES: promotion doesn't cross function boundaries. ──
void closureExample() {
  String? name = getInput();
  if (name != null) {
    final callback = () {
      // print(name.length);  // ✗ not promoted inside the closure
      // The closure could execute later, after `name` was set to null.
    };
    callback();
  }
}

// ✓ Fix: capture in a final local before the closure.
void closureFixed() {
  final name = getInput();
  if (name != null) {
    final captured = name;  // final — immutable, promotion-safe
    final callback = () => print(captured.length);  // ✓
    callback();
  }
}

// ── AWAIT GAP: promotion is invalidated after `await`. ──
Future<void> awaitExample() async {
  String? name = getInput();
  if (name != null) {
    await Future.delayed(Duration.zero);  // yields to event loop
    // print(name.length);  // ✗ not promoted after await
    // During the await, another async task could set `name = null`.
  }
}

// ✓ Fix: snapshot before await.
Future<void> awaitFixed() async {
  final name = getInput();
  if (name != null) {
    final captured = name;
    await Future.delayed(Duration.zero);
    print(captured.length);  // ✓ captured is final, non-nullable
  }
}
```
::

## `late` — Lazy Initialization & Initialization Semantics

::code-wrapper{language="dart"}
```dart
// `late` tells the compiler: "this non-nullable variable will be assigned before first read."
// Without an initializer: you must assign it manually — reading first throws.
// With an initializer: runs lazily on first read, caches the result.

// ── late without initializer — manual assignment ──
class Controller {
  late Database db;  // will be set in initialize()

  Future<void> initialize(String connStr) async {
    db = await Database.connect(connStr);
  }

  Future<List<User>> getUsers() async {
    // If initialize() wasn't called, this throws LateInitializationError.
    return db.query('SELECT * FROM users');
  }
}

// ── late final with initializer — lazy, cached, runs once ──
class AppConfig {
  // _loadConfig() runs ONLY on first read of `config`, then caches.
  // If `config` is never read, _loadConfig() never runs — zero cost.
  late final String config = _loadConfig();

  String _loadConfig() {
    print('Loading config...');  // runs once
    return Platform.environment['APP_ENV'] ?? 'development';
  }
}

// ❌ Anti-pattern: late on a field that might not be assigned.
class Risky {
  late String value;  // if used before assignment → LateInitializationError

  void maybeInit(bool condition) {
    if (condition) value = 'initialized';
    // If condition is false, reading `value` throws.
  }
}

// ✓ Correct: use late final with an initializer (guaranteed safe) or nullable.
class Safe {
  late final String value = _compute();  // always safe — runs on first read
  String? maybeValue;  // nullable — check with `!= null` before use

  String _compute() => 'computed';
}
```
::

## Nullable Collection Algebra

::code-wrapper{language="dart"}
```dart
// Four distinct nullability dimensions for collections — choose carefully.

// 1. List<int> — non-null list, non-null elements.
List<int> a = [1, 2, 3];
// a = null;       // ✗ list can't be null
// a.add(null);    // ✗ elements can't be null
a.add(4);          // ✓

// 2. List<int>? — nullable list, non-null elements.
List<int>? b;
b = null;          // ✓ list can be null
b = [1, 2, 3];     // ✓
// b.add(null);    // ✗ elements can't be null
b?.add(4);         // ✓ no-op if b is null (null-aware access)
print(b?.length);  // 3 or null

// 3. List<int?> — non-null list, nullable elements.
List<int?> c = [1, null, 3];
// c = null;       // ✗ list can't be null
c.add(null);       // ✓ elements can be null
for (var val in c) {
  print(val?.abs());  // null-aware on each element
}

// 4. List<int?>? — both nullable.
List<int?>? d;
d = null;          // ✓
d = [1, null, 3];  // ✓
d?.add(null);      // ✓ no-op if d is null
// Accessing elements: d?.first → int? or null (double nullable)

// ❌ Anti-pattern: confusing List<int>? with List<int?>.
int sumList(List<int>? nums) {
  if (nums == null) return 0;
  return nums.fold(0, (a, b) => a + b);  // b is int (non-null)
}

int sumNullableElements(List<int?> nums) {
  return nums.whereType<int>().fold(0, (a, b) => a + b);  // filters out nulls
}
```
::

## JSON Interop — Safe Parsing Patterns

::code-wrapper{language="dart"}
```dart
import 'dart:convert';

// jsonDecode returns dynamic — cast carefully.
final raw = jsonDecode('{"name": "Alice", "age": 30, "email": null}');

// ❌ Anti-pattern: `as Type` on possibly-null/missing values — throws.
final name = raw['name'] as String;       // ✓ (exists, is String)
// final age = raw['age'] as int;          // ✓ (exists, is int)
// final email = raw['email'] as String;   // ✗ throws: null is not a String
// final phone = raw['phone'] as String;   // ✗ throws: missing key → null

// ✓ Correct: `as Type?` (nullable cast) then handle null.
final name2 = raw['name'] as String?;         // String? — null if missing
final age2 = raw['age'] as int?;              // int? — null if missing
final email = raw['email'] as String?;        // String? — null (the value is null)
final phone = raw['phone'] as String?;        // null (key missing)

// Type-safe parsing with defaults and validation:
User parseUser(Map<String, dynamic> json) {
  final name = json['name'] as String?;
  if (name == null || name.isEmpty) {
    throw FormatException('User name is required');
  }
  final age = (json['age'] as num?)?.toInt();  // num? handles int or double
  return User(name: name, age: age);
}

// Deeply nested JSON — chain null-aware operators:
final city = (raw['address'] as Map<String, dynamic>?)?['city'] as String?;
// If 'address' is missing or null → city is null (no throw).
// If 'city' is missing → city is null.
```
::

## `Object?` vs `dynamic` — The Safety Boundary

::code-wrapper{language="dart"}
```dart
// ── Object?: nullable, type-safe supertype of ALL types (including Null) ──
// Static checking is ON. You must check/cast to use methods.
Object? maybeAnything = 'hello';
maybeAnything = null;          // ✓
maybeAnything = 42;            // ✓
// maybeAnything.length;       // ✗ Object? has no `length` — must check type
if (maybeAnything is String) {
  print(maybeAnything.length); // ✓ promoted to String
}

// ── dynamic: disables ALL static type checking ──
// Any method call compiles — checked at RUNTIME (NoSuchMethodError).
dynamic dyn = 'hello';
dyn.length;      // ✓ compiles, works (String has length)
dyn = 42;
dyn.length;      // ✓ compiles, throws NoSuchMethodError at runtime (int has no length)
dyn.nonExistent; // ✓ compiles, throws at runtime

// ❌ Anti-pattern: using `dynamic` for "I don't know the type."
// It defeats the entire type system. Bugs surface at runtime, not compile time.

// ✓ Correct: use `Object?` for "any value including null."
// Use `Object` for "any non-null value."
// Use `dynamic` ONLY at interop boundaries (JSON, JS interop) — never in APIs.
```
::

## 💡 Tips & Tricks

- **Idiom**: `if (x != null)` for promotion (preferred over `!`) — promotes `x` to non-null inside the block, no runtime throw risk. `!` is a runtime assertion that crashes if wrong. Use `!` only on framework invariants (Flutter widget properties after `initState`).
- **Idiom**: `??=` for lazy cache initialization — `cache[key] ??= compute(key)` runs `compute` only on cache miss. The right side is evaluated only if the left is null. Zero overhead if cached.
- **Idiom**: `late final x = expensive()` for lazy fields — the initializer runs once on first read, then caches. If `x` is never read, the initializer never runs. Use for expensive fields that may not always be needed.
- **Idiom**: `as Type?` then handle null for JSON — `(json['key'] as String?)` returns `null` if missing or null. `json['key'] as String` throws if missing. Use `as Type?` for all JSON field access.
- **Idiom**: `Object?` over `dynamic` for "any value" — `Object?` preserves static type checking (you must check/cast), `dynamic` disables it. Use `dynamic` only for JSON/JS interop, never in public APIs.

## ⚠️ Edge Cases & Gotchas

- **`!` throws `TypeError` at runtime**: `null!` crashes. It defeats null safety. Use only when certain (framework invariants). Prefer `if (x != null)`, `??`, or `?.`.
- **Fields don't promote**: `if (this.x != null) { x.length }` — `x` is still nullable. Copy to a local: `final x = this.x; if (x != null) { x.length; }`.
- **Promotion doesn't cross closures**: `if (x != null) { () => x.length; }` — `x` isn't promoted inside the closure. Capture in a `final` local before the closure.
- **Promotion is invalidated after `await`**: after `await`, a nullable local may have been set to null. Snapshot before await: `final captured = x; if (captured != null) { await ...; captured.length; }`.
- **`late` throws on early read**: `late int x; print(x)` → `LateInitializationError`. Use `late final x = initializer` (safe lazy) or make the variable nullable.
- **`List<int?>` ≠ `List<int>?`**: `List<int?>` is a non-null list with nullable elements. `List<int>?` is a nullable list with non-null elements. Choose based on what can be null.
- **`dynamic` is nullable**: `dynamic x = null` is valid. `x.foo()` compiles (throws at runtime). Don't confuse `dynamic` with `Object` (non-nullable).
- **`??` only checks for null**: `0 ?? 'default'` is `0` (0 isn't null). `false ?? true` is `false`. Only `null` triggers the fallback — no falsy coercion.
- **`Object?` accepts everything including `null`**: `Object? x = null` is valid. `Object x = null` is a compile error. Use `Object?` for "any value, including null."
- **Sound null safety is mandatory in Dart 3**: there's no opt-out. All dependencies must be null-safe. Run `dart pub outdated --mode=nullity` to check legacy deps.

## 🧠 Spot the Bug

A developer checks a nullable field in an async method, then uses it after an await:

::code-wrapper{language="dart"}
```dart
class Repo {
  String? _cached;

  Future<void> refresh() async {
    if (_cached != null) {
      await _fetchUpdate();
      print(_cached.length);  // ✗ compile error: _cached is String?
    }
  }

  Future<void> _fetchUpdate() async { /* ... */ }
}
```
::

Two problems — what are they?

<details>
<summary>Answer</summary>

1. **Fields don't promote**: `if (_cached != null)` doesn't promote `_cached` to `String` because it's a class field — another method could set `_cached = null` between the check and the use.

2. **Promotion invalidated after `await`**: even if promotion worked for fields, the `await _fetchUpdate()` yields to the event loop. During that gap, another async task could set `_cached = null`. The compiler knows this and refuses to promote.

The fix — snapshot to a final local before the await:

```dart
class Repo {
  String? _cached;

  Future<void> refresh() async {
    final cached = _cached;  // immutable local snapshot
    if (cached != null) {
      await _fetchUpdate();
      // `cached` is still the non-null snapshot — safe to use after await.
      print(cached.length);  // ✓ promoted to String, safe after await
    }
  }

  Future<void> _fetchUpdate() async { /* ... */ }
}
```

The local `cached` is `final` — it can't be reassigned by anyone, so the promotion holds across the `await` gap. The snapshot captures the value at check time, immune to concurrent mutation of `_cached`.

</details>