---
title: "Dart — Variables, Type System & Memory Semantics"
description: "Deep-dive into Dart's static type system, const/final/late memory semantics, canonicalization, platform-dependent int precision, and nullable type algebra. Code-first engineering reference."
---

# Dart — Variables, Type System & Memory Semantics

## `var` / `final` / `const` / `late` — Allocation & Canonicalization

::code-wrapper{language="dart"}
```dart
// ── var: type inferred at compile time, mutable reference ──
var count = 0;           // inferred as int — the TYPE is fixed, the VALUE is mutable
count = 42;              // ✓ same type, reassignment OK
// count = 'hi';         // ✗ compile error: int expected — inference is not dynamic

// ── final: single-assignment, value computed at RUNTIME ──
final now = DateTime.now();  // ✓ evaluated at construction, locked thereafter
// now = DateTime.now();     // ✗ throws: late initialization already happened

// ── const: compile-time constant, CANONICALIZED across the program ──
const pi = 3.14159;          // the compiler interns this — identical const expressions
const pi2 = 3.14159;         // are the SAME object in memory (identical(pi, pi2) == true)
const list = [1, 2, 3];      // deeply immutable, canonicalized — same instance everywhere
// list.add(4);               // ✗ UnsupportedError: const lists are immutable

// ── late: non-nullable, assigned before first read, or lazy initializer ──
late final String config = _loadConfig();  // _loadConfig() runs ONLY on first read
// Reading `config` before assignment throws LateInitializationError.
// With an initializer (above), it's always safe — runs lazily, caches result.

String _loadConfig() {
  print('Config loaded');  // runs once, on first access
  return 'production';
}
```
::

### `const` Canonicalization — Memory Sharing

::code-wrapper{language="dart"}
```dart
// const objects with identical arguments are the SAME instance (canonicalized).
// The compiler deduplicates them — zero allocation at runtime for repeated uses.
const a = [1, 2, 3];
const b = [1, 2, 3];
print(identical(a, b));  // true — same object in memory (not just equal)

// This extends to const constructors:
class Color {
  final int r, g, b;
  const Color(this.r, this.g, this.b);
}

const red1 = Color(255, 0, 0);
const red2 = Color(255, 0, 0);
print(identical(red1, red2));  // true — canonicalized at compile time

// Non-const: separate allocations, identity comparison is false.
final red3 = Color(255, 0, 0);
final red4 = Color(255, 0, 0);
print(identical(red3, red4));  // false — distinct heap allocations
print(red3 == red4);           // false (unless == is overridden)
```
::

### `final` vs `const` — The Deep Immutability Trap

::code-wrapper{language="dart"}
```dart
// ❌ Anti-pattern: assuming `final` makes collections immutable.
final list = [1, 2, 3];
list.add(4);       // ✓ `final` locks the REFERENCE, not the contents.
list[0] = 99;      // ✓ mutation is allowed — `final` ≠ immutable.
// list = [0];      // ✗ reassignment is blocked.

// ✓ Correct: use `const` for compile-time immutable, or List.unmodifiable for runtime.
const immutable = [1, 2, 3];     // deeply immutable, canonicalized
// immutable.add(4);              // ✗ UnsupportedError

final readonly = List.unmodifiable([1, 2, 3]);  // runtime immutability
// readonly.add(4);               // ✗ UnsupportedError — view wrapper throws

// List.unmodifiable is a VIEW — mutations to the source are visible:
final source = [1, 2, 3];
final view = List.unmodifiable(source);
source.add(4);
print(view);  // [1, 2, 3, 4] — the view reflects the source mutation!
// For a true immutable copy: List.unmodifiable([...source])
```
::

## Built-in Types — Platform-Dependent Semantics

### Numbers: `int`, `double`, `num`

::code-wrapper{language="dart"}
```dart
// ── Native (VM/AOT): int is 64-bit signed, double is IEEE 754 64-bit ──
// ── Web (dart2js/DDC): both are JS numbers (IEEE 754 doubles) ──

int max64 = 9223372036854775807;  // 2^63 - 1 on native
max64 + 1;  // native: wraps to -9223372036854775808 (two's complement, SILENT)
            // web: becomes 9223372036854775808.0 (a double, precision lost above 2^53)

// The web precision trap:
int big = 1 << 53;  // 9007199254740992
print(big + 1 == big);  // native: false | web: true (double can't represent 2^53+1)

// Use BigInt for arbitrary precision (works on all platforms):
BigInt huge = BigInt.parse('9223372036854775807') + BigInt.one;
print(huge);  // 9223372036854775808 — exact, no overflow

// num is the supertype of int and double:
num any = 10;     // can hold int or double
any = 5.5;        // ✓
// any.abs();     // ✓ num has abs()
// any.toRadixString(16); // ✗ int-only method — requires `as int` or `is int` check
```
::

### Integer Division & Modulo — Sign Semantics

::code-wrapper{language="dart"}
```dart
// `/` ALWAYS returns double, even for int operands:
print(7 / 2);    // 3.5 (double)
print(4 / 2);    // 2.0 (double, NOT int 2)

// `~/` is integer division (truncates toward ZERO, not floor):
print(7 ~/ 2);    // 3
print(-7 ~/ 2);   // -3 (truncates toward zero — NOT -4 like Python's floor division)

// `%` follows the sign of the DIVIDEND (like C, unlike Python):
print(7 % 3);     // 1
print(-7 % 3);    // -1 (Dart: sign of dividend | Python: 2, sign of divisor)
print(7 % -3);    // 1  (sign of dividend)

// To get Python-style non-negative modulo:
int pyMod(int a, int n) => ((a % n) + n) % n;
print(pyMod(-7, 3));  // 2
```
::

### Strings — Internals & Interpolation

::code-wrapper{language="dart"}
```dart
// Dart strings are sequences of UTF-16 code units (NOT code points / graphemes).
// A single emoji may be 2 code units (surrogate pair):
var emoji = '🎉';  // U+1F389
print(emoji.length);          // 2 — two UTF-16 code units
print(emoji.runes.length);    // 1 — one Unicode code point
print(emoji.codeUnits.length); // 2 — code units

// ❌ Anti-pattern: indexing strings for "characters":
var s = 'café';
print(s[3]);  // 'é' — works here (1 code unit)
var s2 = 'café🎉';
print(s2[4]);  // garbage surrogate — NOT the emoji
print(s2[5]);  // second half of surrogate pair — NOT a character

// ✓ Correct: use runes for code points, or `characters` package for graphemes:
for (var rune in s2.runes) {
  print(String.fromCharCode(rune));  // c, a, f, é, 🎉
}

// String interpolation calls toString() — override for readable output:
class Point {
  final double x, y;
  const Point(this.x, this.y);
  @override
  String toString() => 'Point($x, $y)';  // without this: 'Instance of Point'
}

var p = Point(1, 2);
print('Location: $p');           // 'Location: Point(1.0, 2.0)'
print('Sum: ${p.x + p.y}');     // 'Sum: 3.0' — ${} for expressions
```
::

## `Object` vs `dynamic` vs `Object?` — Type Safety Boundaries

::code-wrapper{language="dart"}
```dart
// ── Object: non-nullable supertype of all non-null types ──
// Static type checking is ON — you must cast to access methods.
Object obj = 'hello';
// obj.toUpperCase();  // ✗ compile error: Object has no toUpperCase
(obj as String).toUpperCase();  // ✓ explicit cast — throws if wrong type
if (obj is String) {
  obj.toUpperCase();  // ✓ type promotion: obj is String in this block
}

// ── dynamic: disables ALL static type checking ──
// Any method call compiles — checked at RUNTIME (NoSuchMethodError if missing).
dynamic dyn = 'hello';
dyn.toUpperCase();  // ✓ compiles, works at runtime
dyn = 42;
dyn.toUpperCase();  // ✓ compiles, throws NoSuchMethodError at runtime (int has no toUpperCase)
dyn.nonExistent();  // ✓ compiles, throws at runtime

// ── Object?: nullable supertype of ALL types (including Null) ──
Object? maybe = null;  // ✓
maybe = 'hello';       // ✓
Object notNull = null; // ✗ compile error: Object is non-nullable

// ❌ Anti-pattern: using `dynamic` for "I don't know the type."
// It defeats the entire type system — bugs surface at runtime, not compile time.

// ✓ Correct: use `Object` (non-null, type-safe, must cast) or `Object?` (nullable).
// Use `dynamic` ONLY for JSON parsing interop or JS interop — never in APIs.
```
::

## Type Conversion — Safe Parsing Patterns

::code-wrapper{language="dart"}
```dart
// ❌ Anti-pattern: `parse` on untrusted input — throws FormatException.
int parseUnsafe(String input) => int.parse(input);  // throws on 'abc'

// ✓ Correct: `tryParse` returns null on failure — handle explicitly.
int? parseSafe(String input) => int.tryParse(input);

void handleAge(String input) {
  final age = int.tryParse(input);
  if (age == null || age < 0 || age > 150) {
    throw ArgumentError('Invalid age: $input');
  }
  // ... use age
}

// double ↔ int conversions:
print(3.7.toInt());    // 3 (truncates toward zero)
print(-3.7.toInt());   // -3 (truncates toward zero, NOT floor)
print(3.0.toInt());    // 3
// print(3.7.toInt() == 3.7.floor());  // false for negatives: toInt=-3, floor=-4

// toString with formatting:
print(3.14159.toStringAsFixed(2));  // '3.14'
print(255.toRadixString(16));       // 'ff'
print(255.toRadixString(2));        // '11111111'
```
::

## Records (Dart 3) — Value-Semantic Anonymous Types

::code-wrapper{language="dart"}
```dart
// Records are immutable, value-equal, zero-allocation anonymous aggregates.
// Fields are positional by default, named with a label.
({String name, int age}) user = (name: 'Alice', age: 30);
(int x, int y) point = (3, 4);

// Value equality is automatic — no need to override == or hashCode:
var a = (x: 1, y: 2);
var b = (x: 1, y: 2);
print(a == b);  // true — structural equality, built in
print(identical(a, b));  // false — distinct instances, but equal

// Destructuring with patterns:
var (x, y) = point;  // x = 3, y = 4
var (:name, :age) = user;  // name = 'Alice', age = 30

// Use records instead of tiny one-off classes:
({User user, List<Repo> repos}) fetchProfile(String username) async {
  // ... no need to define a Profile class
  return (user: u, repos: r);
}
```
::

## 💡 Tips & Tricks

- **Performance**: `const` objects are canonicalized at compile time — using `const` in hot paths (Flutter widget trees, lookup tables) means zero allocation and zero GC pressure. Prefer `const` over `final` when the value is known at compile time.
- **Idiom**: `late final x = expensive()` defers computation until first read — the initializer runs once and caches. Use for expensive fields that may never be accessed (e.g., a debug-only inspector).
- **Idiom**: `Object` over `dynamic` for "any non-null value" — `Object` preserves static type checking (you must cast), while `dynamic` silently disables it. `dynamic` should only appear at JSON/JS interop boundaries.
- **Portability**: use `BigInt` for integers above 2^53 that must work on web — `int` on web is a JS double and loses precision. On native, `int` is 64-bit and safe up to 2^63-1.
- **Debug**: `print(obj)` calls `obj.toString()`. Always override `toString()` on domain objects — the default `'Instance of Foo'` is useless in logs and error messages.

## ⚠️ Edge Cases & Gotchas

- **Only `true`/`false` are boolean**: `if (0)`, `if ('')`, `if (null)`, `if ([])` are all compile errors. Dart has no truthy/falsy coercion (unlike JS). Only `if (bool)` is valid.
- **`{}` is an empty `Map`, not a `Set`**: `var x = {}` infers `Map<dynamic, dynamic>`. Use `var x = <int>{}` or `Set<int>()` for an empty Set.
- **`final` doesn't freeze collections**: `final list = [1,2,3]; list.add(4)` works — `final` locks the reference, not the contents. Use `const` or `List.unmodifiable([...source])` for true immutability.
- **`List.unmodifiable` is a view**: it wraps the source list. Mutating the source is visible through the view. Use `List.unmodifiable([...source])` for an immutable copy.
- **Reading a `late` variable before assignment throws**: `late int x; print(x);` → `LateInitializationError`. Use `late final x = initializer` to guarantee safe lazy initialization.
- **`const` requires compile-time-known values**: `const x = DateTime.now()` fails. `final` accepts runtime values. `const` inside a `final` context is fine: `final x = const [1,2,3]`.
- **`int` on web loses precision above 2^53**: `int.parse('9007199254740993')` on web gives `9007199254740992` (rounded double). Use `BigInt.parse` for exact large integers on web.
- **String `.length` is UTF-16 code units, not characters**: `'🎉'.length` is `2` (surrogate pair). Use `.runes.length` for code points, or the `characters` package for grapheme clusters.
- **Integer division `~/` truncates toward zero**: `-7 ~/ 2 = -3` (not -4). `%` follows the sign of the dividend: `-7 % 3 = -1` (not 2 like Python).
- **`toString()` on `num`**: `3.0.toString()` is `'3.0'` (not `'3'`). Use `toInt().toString()` or `toStringAsFixed(0)` for `'3'`.

## 🧠 Spot the Bug

A developer caches configuration with `final`, expecting it to be immutable. Another part of the code mutates it:

::code-wrapper{language="dart"}
```dart
class Config {
  final Map<String, String> settings = {'env': 'prod', 'debug': 'false'};

  void override(String key, String value) {
    settings[key] = value;  // mutates the "final" map
  }
}

void main() {
  final config = Config();
  config.override('env', 'dev');
  print(config.settings['env']);  // 'dev' — the "final" map was mutated!
}
```
::

What's wrong and how to fix it?

<details>
<summary>Answer</summary>

`final` locks the reference (`settings` can't be reassigned), but the `Map` itself is mutable. `settings[key] = value` mutates the contents — the "final" map is changed. `final` is not deep immutability.

The fix — use `Map.unmodifiable` (runtime) or `const` (compile-time):

```dart
class Config {
  // Runtime immutable — throws on any mutation attempt.
  final Map<String, String> settings = Map.unmodifiable({'env': 'prod', 'debug': 'false'});

  void override(String key, String value) {
    // settings[key] = value;  // ✗ UnsupportedError at runtime
    throw UnsupportedError('Config is immutable — create a new instance to override.');
  }
}

// Or compile-time immutable (if values are literals):
class Config {
  const Config();
  static const Map<String, String> settings = {'env': 'prod', 'debug': 'false'};
}
```

`final` = single-assignment reference. `const` = deeply immutable + canonicalized. `List/Map.unmodifiable` = runtime immutable view. Choose based on whether the value is known at compile time (`const`), constructed at runtime (`unmodifiable`), or genuinely mutable (`final` + mutable collection).

</details>