---
title: "Dart — Classes, Sealed Hierarchies & Mixin Composition"
description: "Deep-dive into Dart class mechanics, const constructors and canonicalization, sealed class exhaustiveness, mixin linearization, factory patterns, and value equality. Code-first engineering reference."
---

# Dart — Classes, Sealed Hierarchies & Mixin Composition

## Const Constructors — Canonicalization & Immutability

::code-wrapper{language="dart"}
```dart
// A const constructor creates compile-time constant instances.
// Requirements: all fields final, no body, all constructor params const-eligible.
// Benefit: canonicalization — identical const instances are the SAME object.

class Color {
  final int r, g, b;
  const Color(this.r, this.g, this.b);

  // Static const instances — shared everywhere, zero allocation.
  static const red = Color(255, 0, 0);
  static const green = Color(0, 255, 0);
  static const blue = Color(0, 0, 255);

  @override
  bool operator ==(Object other) =>
      other is Color && r == other.r && g == other.g && b == other.b;

  @override
  int get hashCode => Object.hash(r, g, b);
}

void main() {
  const a = Color(255, 0, 0);
  const b = Color(255, 0, 0);
  print(identical(a, b));  // true — same object (canonicalized at compile time)
  print(a == b);           // true — value equality (overridden)

  final c = Color(255, 0, 0);  // non-const — runtime allocation
  final d = Color(255, 0, 0);  // non-const — another allocation
  print(identical(c, d));  // false — distinct heap objects
  print(c == d);           // true — value equality (overridden)

  // const in a non-const context: `const Color(...)` is always canonicalized,
  // `Color(...)` (no const) always allocates. Use const for fixed values.
}
```
::

### The Value Equality Trap

::code-wrapper{language="dart"}
```dart
// ❌ Anti-pattern: a "value class" without == / hashCode override.
class PointBad {
  final double x, y;
  const PointBad(this.x, this.y);
}

var a = PointBad(1, 2);
var b = PointBad(1, 2);
print(a == b);  // false — default == is identity (different objects)
print({a, b}.length);  // 2 — both in the Set (different hashes by default)

// ✓ Correct: override == and hashCode together (consistency required).
class Point {
  final double x, y;
  const Point(this.x, this.y);

  @override
  bool operator ==(Object other) =>
      other is Point && x == other.x && y == other.y;

  @override
  int get hashCode => Object.hash(x, y);  // must be consistent with ==
}

var a2 = Point(1, 2);
var b2 = Point(1, 2);
print(a2 == b2);  // true — value equality
print({a2, b2}.length);  // 1 — same hash, same == → deduplicated in Set

// Or use records (Dart 3) for automatic value equality:
var ra = (1.0, 2.0);
var rb = (1.0, 2.0);
print(ra == rb);  // true — structural equality built in, no override needed
```
::

## Sealed Classes — Closed Hierarchies & Exhaustiveness

::code-wrapper{language="dart"}
```dart
// sealed: all direct subtypes must be in the same library. The compiler
// knows the complete set → exhaustive switches without `default`.
// Adding a subtype → compile error at every non-exhaustive switch.

sealed class Result<T> {
  const Result();
}

class Success<T> extends Result<T> {
  final T value;
  const Success(this.value);
}

class Failure<T> extends Result<T> {
  final String error;
  const Failure(this.error);
}

// Pattern matching with destructuring — no casts, no defaults:
T unwrap<T>(Result<T> r) => switch (r) {
  Success(:final value) => value,  // destructures .value directly
  Failure(:final error) => throw Exception(error),
};

// Exhaustiveness: if you add `class Loading<T> extends Result<T> {}`,
// this switch becomes a compile error: "Loading not handled."

// Real-world: state machines, AST nodes, Either/Option types.
sealed class AppState {}
class Idle extends AppState {}
class Loading extends AppState {}
class Loaded<T> extends AppState { final T data; Loaded(this.data); }
class Error extends AppState { final String message; Error(this.message); }

Widget renderState(AppState state) => switch (state) {
  Idle() => Text('Idle'),
  Loading() => CircularProgressIndicator(),
  Loaded(:final data) => DataWidget(data),
  Error(:final message) => ErrorWidget(message),
};
```
::

## Mixins — Linearization & Constraints

::code-wrapper{language="dart"}
```dart
// Mixins provide reusable implementation across unrelated class hierarchies.
// Dart has single inheritance — mixins fill the multiple-inheritance gap.
// Mixins can't have constructors (applied via `with`, not instantiated).

mixin Drawable {
  void draw() => print('Drawing $this');

  // Mixin can define fields — they become part of the applying class.
  bool _dirty = true;
  void markDirty() => _dirty = true;
  void markClean() => _dirty = false;
}

mixin Loggable {
  void log(String msg) => print('[$runtimeType] $msg');
}

// `on` constraint: the mixin can only be applied to subclasses of the constraint.
// This gives the mixin access to the constraint's methods.
mixin disposableView on StatefulWidget {
  void registerDispose(void Function() fn) {
    // Can access State methods because of the `on` constraint.
    // addCallback(() => fn());
  }
}

// Multiple mixins — applied left-to-right (linearization):
class Canvas with Drawable, Loggable {
  final String name;
  Canvas(this.name);

  @override
  String toString() => 'Canvas($name)';
}

var canvas = Canvas('main');
canvas.draw();  // 'Drawing Canvas(main)' — from Drawable
canvas.log('Created');  // '[Canvas] Created' — from Loggable

// ❌ Anti-pattern: mixins with state that conflict.
mixin A { int value = 1; }
mixin B { int value = 2; }
// class C with A, B { }  // compile error: value is defined in both A and B
```
::

## Factory Constructors — Caching & Subtypes

::code-wrapper{language="dart"}
```dart
// factory constructors don't always create a new instance — they can return
// a cached instance, a subtype, or compute which to return. Like a static method
// that returns an instance of the class (or a subtype).

class Logger {
  static final _cache = <String, Logger>{};
  final String name;

  // Private generative constructor — only accessible within the library.
  Logger._internal(this.name);

  // Factory — returns cached instance if available.
  factory Logger(String name) {
    return _cache.putIfAbsent(name, () => Logger._internal(name));
  }
}

var a = Logger('app');
var b = Logger('app');
print(identical(a, b));  // true — cached, same instance

// Factory returning a subtype based on input:
abstract class Animal {
  final String name;
  Animal(this.name);
  factory Animal.fromType(String type, String name) {
    return switch (type) {
      'dog' => Dog(name),
      'cat' => Cat(name),
      _ => throw ArgumentError('Unknown animal type: $type'),
    };
  }
  String speak();
}

class Dog extends Animal {
  Dog(super.name);
  @override
  String speak() => '$name barks';
}

class Cat extends Animal {
  Cat(super.name);
  @override
  String speak() => '$name meows';
}

var pet = Animal.fromType('dog', 'Rex');  // returns Dog (a subtype of Animal)
print(pet.speak());  // 'Rex barks'
```
::

## Enhanced Enums — Stateful Enumerations

::code-wrapper{language="dart"}
```dart
// Dart 2.17+ enhanced enums: fields, methods, constructors (like a class).
// All instances are const. Can implement interfaces, use mixins (no `with`).

enum HttpStatus {
  ok(200, 'OK'),
  created(201, 'Created'),
  badRequest(400, 'Bad Request'),
  unauthorized(401, 'Unauthorized'),
  notFound(404, 'Not Found'),
  serverError(500, 'Internal Server Error');

  final int code;
  final String label;
  const HttpStatus(this.code, this.label);

  // Methods on enum values:
  bool get isSuccess => code >= 200 && code < 300;
  bool get isClientError => code >= 400 && code < 500;
  bool get isServerError => code >= 500;

  static HttpStatus fromCode(int code) =>
      values.firstWhere((s) => s.code == code,
          orElse: () => throw ArgumentError('No status for code $code'));
}

// Usage:
print(HttpStatus.ok.isSuccess);  // true
print(HttpStatus.notFound.isClientError);  // true
print(HttpStatus.fromCode(404).label);  // 'Not Found'

// Exhaustive switch over enhanced enum (no default needed):
String describe(HttpStatus s) => switch (s) {
  HttpStatus.ok => 'Success',
  HttpStatus.created => 'Created',
  HttpStatus.badRequest => 'Client error: bad request',
  HttpStatus.unauthorized => 'Client error: auth',
  HttpStatus.notFound => 'Client error: not found',
  HttpStatus.serverError => 'Server error',
};
// Adding a new HttpStatus value → compile error here (non-exhaustive).
```
::

## Extension Methods — Adding to Existing Types

::code-wrapper{language="dart"}
```dart
// Extensions add methods to existing types (even library types like String, int).
// They don't modify the original type — they're syntactic sugar for static methods.

extension StringX on String {
  bool get isPalindrome => this == reversed;
  String get reversed => split('').reversed.join();
  String capitalize() => isEmpty ? this : this[0].toUpperCase() + substring(1);
  String truncate(int maxLen) =>
      length <= maxLen ? this : '${substring(0, maxLen - 3)}...';
}

print('racecar'.isPalindrome);  // true
print('hello'.reversed);        // 'olleh'
print('hello world'.capitalize());  // 'Hello world'
print('A very long string here'.truncate(10));  // 'A very...'

// Extension on a generic type:
extension ListX<T> on List<T> {
  T? get firstOrNull => isEmpty ? null : first;
  List<T> separatedBy(T separator) {
    if (isEmpty) return [];
    final result = <T>[];
    for (var i = 0; i < length; i++) {
      result.add(this[i]);
      if (i < length - 1) result.add(separator);
    }
    return result;
  }
}

print([1, 2, 3].separatedBy(0));  // [1, 0, 2, 0, 3]

// Extensions are resolved at compile time — they don't participate in polymorphism.
// An extension method on `Object` is available everywhere but can be surprising.
```
::

## 💡 Tips & Tricks

- **Idiom**: use `sealed` for closed hierarchies (Result, Option, states, ASTs) — the compiler enforces exhaustiveness, so adding a subtype flags every switch that needs updating. Use `abstract class` for open hierarchies.
- **Idiom**: always override `==` and `hashCode` together on value classes — the default `==` is identity (different instances are "not equal"). Use `Object.hash(field1, field2)` for the hash. Or use records (Dart 3) for automatic structural equality.
- **Idiom**: use `factory` constructors for caching/singleton/subtype dispatch — `factory Logger(name)` returns a cached instance. `factory Animal.fromType(type)` returns a subtype. The factory is a static method disguised as a constructor.
- **Idiom**: use `const` constructors for immutable value types — `const Point(x, y)` is canonicalized (same instance everywhere). All fields must be `final`. Zero allocation at runtime. Use for colors, points, config constants.
- **Idiom**: use mixins (`mixin` + `with`) for cross-hierarchy reuse — `class Canvas with Drawable, Loggable`. Mixins can't have constructors. Use `on` constraints to restrict to a base type and access its methods.

## ⚠️ Edge Cases & Gotchas

- **`_` prefix is library-private, not class-private**: `int _x` in a class is accessible from other classes in the same file/library. Dart has no class-private visibility. If you need class-private, use a closure or a nested class.
- **`@override` is a hint, not enforced at runtime**: forgetting `@override` still overrides (if the signature matches). But the annotation catches typos (a method that doesn't actually override is flagged). Always use it.
- **`const` constructor requires all fields `final` and no body**: `const Point(this.x, this.y);` — `final` fields, no body. A non-`final` field or a body disqualifies `const`.
- **`implements` requires all methods**: `class X implements Y` — X must implement ALL of Y's methods (even if Y has implementations). Use `extends` to inherit, `implements` for interface contract.
- **Mixins can't have constructors**: `mixin X { X(); }` is invalid. Mixins are applied via `with`, not instantiated. Initialize via the class's constructor.
- **Sealed subtypes must be in the same library**: you can't add a subtype from another file. This is what enables exhaustive checking. Use `abstract class` if the hierarchy is open.
- **Factory constructors can't use `this`**: `factory Point()` is like a static method — no `this` (no instance yet). It returns an instance (cached, subtype, or new).
- **Enhanced enums are `const`**: all enum instances are `const`. You can use them in `const` contexts and switch expressions. They can have fields, methods, and implement interfaces.
- **Extension methods don't participate in polymorphism**: they're resolved at compile time. An extension on `Object` is available everywhere but can be surprising. Use extensions for utility methods, not for overriding behavior.
- **`late` fields throw on early read**: `late int x; print(x)` throws `LateInitializationError`. Use `late final x = initializer` for safe lazy initialization.

## 🧠 Spot the Bug

A developer uses a sealed `Result` type but adds a `default` case "just in case":

::code-wrapper{language="dart"}
```dart
sealed class Result<T> {}
class Success<T> extends Result<T> { final T value; Success(this.value); }
class Failure<T> extends Result<T> { final String error; Failure(this.error); }

T unwrap<T>(Result<T> r) => switch (r) {
  Success(:final value) => value,
  _ => throw Exception('Unexpected'),
};
```
::

Later, `Loading<T>` is added to the sealed class. What happens?

<details>
<summary>Answer</summary>

The `_` (wildcard) catches `Loading` and throws `Exception('Unexpected')` — a runtime error that should have been a compile-time error. The wildcard defeats the exhaustiveness checking that sealed classes provide.

Without `_`, adding `Loading` would cause a **compile error**: "The switch expression does not exhaustively cover all possible cases of Result<T>." The compiler would force you to handle `Loading` before the code even compiles.

The fix — remove `_`, handle every case explicitly:

```dart
T unwrap<T>(Result<T> r) => switch (r) {
  Success(:final value) => value,
  Failure(:final error) => throw Exception(error),
  Loading() => throw Exception('Still loading — unwrap called too early'),
};
```

Now adding a new subtype to `Result` causes a compile error here, forcing you to decide how to handle it. This is the entire point of sealed classes — **never add `_` or `default` to a switch over a sealed type.**

</details>