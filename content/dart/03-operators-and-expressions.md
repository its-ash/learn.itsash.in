---
title: "Dart — Operators, Promotion Rules & Expression Semantics"
description: "Deep-dive into Dart's operator semantics, null-aware operator chains, type promotion rules across closures and async gaps, cascade mechanics, and overflow behavior. Code-first engineering reference."
---

# Dart — Operators, Promotion Rules & Expression Semantics

## Null-Aware Operator Chains — Production Patterns

::code-wrapper{language="dart"}
```dart
// Deep null navigation — each `?.` short-circuits the rest of the chain.
// If any link is null, the entire expression evaluates to null (no method call).
String? city = user?.address?.city?.toUpperCase();
// Equivalent verbose form:
// String? city = (user != null && user.address != null && user.address.city != null)
//     ? user.address.city.toUpperCase() : null;

// ??= for lazy cache initialization — right side evaluated ONLY on cache miss:
final cache = <String, expensive>{};
T compute<T>(String key, T Function() loader) =>
    cache.putIfAbsent(key, loader) as T;  // putIfAbsent: loader runs only if key missing

// ?? for defaults — right side evaluated only if left is null:
String displayName = user?.name ?? 'Anonymous';
int pageSize = settings?.pageSize ?? 20;

// Combining: null-safe read with default and transformation:
String label = (user?.nickname ?? user?.name ?? 'Unknown').toUpperCase();
```
::

### `!` — The Null Assertion Trap

::code-wrapper{language="dart"}
```dart
// ❌ Anti-pattern: using `!` to "silence" the null-safety compiler.
String? getInput() => maybeNull() ? 'hello' : null;

void bad() {
  String name = getInput()!;  // compiles, but throws TypeError at runtime if null
  print(name.length);
}

// ✓ Correct: handle null explicitly — never use `!` on untrusted sources.
void good() {
  final name = getInput();
  if (name != null) {
    print(name.length);  // type promotion: name is String here (no `!` needed)
  } else {
    print('No input');
  }
}

// Acceptable `!` use: framework invariants where the framework guarantees non-null.
// Example: Flutter widget parameters after initState.
class MyWidget extends StatefulWidget {
  const MyWidget({super.key, required this.tag});
  final String tag;
  @override
  State<MyWidget> createState() => _MyWidgetState();
}

class _MyWidgetState extends State<MyWidget> {
  late StreamSubscription _sub;  // `late` is safer than `!` for "assigned in initState"

  @override
  void initState() {
    super.initState();
    _sub = someStream.listen((event) {
      print('${widget.tag}: $event');  // `widget` is always non-null in State
    });
  }

  @override
  void dispose() {
    _sub.cancel();  // always assigned before dispose if initState ran
    super.dispose();
  }
}
```
::

## Type Promotion — The Closure & Field Trap

::code-wrapper{language="dart"}
```dart
// Type promotion works for LOCAL variables only — not fields, not across closures,
// not across `await` gaps. This is the #1 source of "why is the compiler mad at me."

// ✓ Local variable: promotion works inside `if (x != null)`.
void localPromotion() {
  String? name = getInput();
  if (name != null) {
    print(name.length);  // promoted to String — no `!` needed
  }
}

// ❌ Class field: promotion does NOT work — the field is shared mutable state.
class Service {
  String? _cached;

  void use() {
    if (_cached != null) {
      // print(_cached.length);  // ✗ compile error: _cached is still String?
      // The compiler can't promote because between the check and the use,
      // another method or callback could set _cached = null.
    }
  }
}

// ✓ Fix for fields: copy to a local, then promote the local.
class ServiceFixed {
  String? _cached;

  void use() {
    final cached = _cached;  // local copy — immutable snapshot
    if (cached != null) {
      print(cached.length);  // ✓ promoted to String — local can't be mutated externally
    }
  }
}

// ❌ Across closures: promotion doesn't cross function boundaries.
void closureTrap() {
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
    final captured = name;  // final local — immutable, promotion-safe
    final callback = () {
      print(captured.length);  // ✓ captured is non-nullable String
    };
    callback();
  }
}

// ❌ Across `await`: promotion is invalidated after an await gap.
Future<void> awaitGap() async {
  String? name = getInput();
  if (name != null) {
    await Future.delayed(Duration.zero);  // yields to event loop
    // print(name.length);  // ✗ not promoted after await
    // Another async task could have set name = null during the await.
  }
}

// ✓ Fix: capture before await.
Future<void> awaitFixed() async {
  final name = getInput();
  if (name != null) {
    final captured = name;  // snapshot before yielding
    await Future.delayed(Duration.zero);
    print(captured.length);  // ✓ captured is non-nullable
  }
}
```
::

## Cascade (`..`) — Fluent Configuration

::code-wrapper{language="dart"}
```dart
// `..` returns the LEFT-HAND object (not the method result), enabling fluent chains.
// Contrast with `.` which returns the method's return value.

// ❌ Without cascade — verbose, repeated variable name:
var paint = Paint();
paint.color = Colors.red;
paint.strokeWidth = 2.0;
paint.style = PaintingStyle.fill;

// ✓ With cascade — one expression, fluent configuration:
var paint = Paint()
  ..color = Colors.red
  ..strokeWidth = 2.0
  ..style = PaintingStyle.fill;

// Cascade with methods that return void — the cascade still returns the object:
var list = <int>[]
  ..add(1)
  ..add(2)
  ..add(3);  // list is [1, 2, 3] — add() returns void, but cascade returns list

// ❌ Anti-pattern: confusing cascade with method chaining.
// list.add(1).add(2)  // ✗ add() returns void, can't chain with `.`

// Null-aware cascade (`?..`) — cascades only if non-null:
Paint? maybePaint;
maybePaint?..color = Colors.red..strokeWidth = 2.0;
// If maybePaint is null, the entire cascade is a no-op (no null error).
```
::

## Equality & Identity — Collection Semantics

::code-wrapper{language="dart"}
```dart
// `==` for built-in collections is IDENTITY (same instance), not value equality.
print([1, 2] == [1, 2]);  // false — different instances
print({'a': 1} == {'a': 1});  // false
print({1, 2} == {1, 2});  // false

// ❌ Anti-pattern: using `==` to compare collections.
bool isSame(List<int> a, List<int> b) => a == b;  // almost always false

// ✓ Correct: use listEquals (Flutter) or DeepCollectionEquality (collection package).
import 'package:flutter/foundation.dart';
print(listEquals([1, 2], [1, 2]));  // true

import 'package:collection/collection.dart';
const eq = DeepCollectionEquality();
print(eq.equals([1, 2], [1, 2]));  // true
print(eq.equals({'a': 1}, {'a': 1}));  // true

// For your own classes, override == and hashCode together (consistency required):
class Point {
  final double x, y;
  const Point(this.x, this.y);

  @override
  bool operator ==(Object other) =>
      other is Point && x == other.x && y == other.y;

  @override
  int get hashCode => Object.hash(x, y);  // consistent with ==
}
// Equal objects MUST have equal hashes (HashMap/Set contract).
```
::

## Overflow & Bitwise — Native vs Web

::code-wrapper{language="dart"}
```dart
// Native (VM/AOT): int is 64-bit signed, overflow wraps silently (two's complement).
// No exception, no warning — the value just wraps.
int max = 9223372036854775807;  // 2^63 - 1
print(max + 1);  // -9223372036854775808 (wrapped to min int64)

// Web: int is a JS double — no wrap, but precision loss above 2^53.
print(1 << 62);  // native: 4611686018427387904 | web: 4611686018427388000 (rounded)

// Bitwise operators on int:
print(0b1100 & 0b1010);  // 8  (1000 — AND)
print(0b1100 | 0b1010);  // 14 (1110 — OR)
print(0b1100 ^ 0b1010);  // 6  (0110 — XOR)
print(~0b1100);          // -13 (bitwise NOT — two's complement)
print(1 << 60);          // native: 1152921504606846976 | web: 1152921504606847000

// >>>= (unsigned right shift) — Dart 3+ for logical shift (fills with zeros):
int v = -1;  // all bits set (0xFFFFFFFFFFFFFFFF on 64-bit)
print(v >> 1);   // -1 (arithmetic shift — sign bit preserved)
print(v >>> 1);  // 9223372036854775807 (logical shift — zeros fill from left)
```
::

## 💡 Tips & Tricks

- **Idiom**: `??=` for lazy memoization — `cache[key] ??= compute(key)` runs `compute` only on a cache miss. The right side is evaluated only if the left is null. Zero-overhead if cached.
- **Idiom**: `?.` chains for deep null navigation — `user?.address?.city` short-circuits at the first null, no nested `if` checks. Returns nullable type; follow with `?? default`.
- **Performance**: `~/` for integer division is a single VM op — `(a / b).toInt()` does float division then truncation (two ops, potential precision loss on web). Prefer `~/%` for integer math.
- **Idiom**: cascade (`..`) for fluent object setup — `Paint()..color = red..strokeWidth = 2` is one expression. Use for configuring objects with many setters (Paint, TextStyle, TextEditingController).
- **Debug**: `identical(a, b)` checks reference equality (same object in memory). `a == b` checks value equality (calls `operator ==`). Use `identical` to verify `const` canonicalization; use `==` for domain equality.

## ⚠️ Edge Cases & Gotchas

- **`/` always returns `double`**: `4 / 2` is `2.0` (double), not `2` (int). Use `~/` for integer division. Assigning `int x = 4 / 2` is a compile error (type mismatch).
- **`%` follows the dividend's sign**: `-7 % 3 = -1` (Dart/C/Java), not `2` (Python/mathematical modulo). Use `((a % n) + n) % n` for non-negative modulo.
- **`is` promotes, `as` throws**: `if (x is String) { x.length }` promotes safely. `x as String` throws `TypeError` if `x` isn't a String. Use `is` for checks, `as` only when certain.
- **Type promotion doesn't apply to fields**: `if (this.x != null) { x.length }` — `x` is still nullable. Copy to a local: `final x = this.x; if (x != null) { x.length; }`.
- **Promotion is invalidated after `await`**: a nullable local checked before `await` is not promoted after. Snapshot it: `final captured = x; if (captured != null) { await ...; captured.length; }`.
- **`==` for collections is identity**: `[1,2] == [1,2]` is `false`. Use `listEquals`, `DeepCollectionEquality`, or records (which have structural equality).
- **`!` throws `TypeError` at runtime**: `null!` crashes. It defeats null safety — use only on framework invariants. Prefer `if (x != null)`, `??`, or `?.`.
- **Integer overflow wraps silently on native**: `9223372036854775807 + 1` wraps to `minInt64`. No exception. Use `BigInt` for overflow-safe arithmetic.
- **`int` on web loses precision above 2^53**: `int.parse('9007199254740993')` gives `9007199254740992` on web (double rounding). Use `BigInt` for exact large integers.
- **`~` (bitwise NOT) on a positive int gives a negative int**: `~5 = -6` (two's complement). `~0 = -1`. This is standard two's complement behavior, not a bug.

## 🧠 Spot the Bug

A developer checks a nullable field for null, then uses it inside a closure, but the compiler rejects it:

::code-wrapper{language="dart"}
```dart
class Cache {
  String? _value;

  void process() {
    if (_value != null) {
      Future(() {
        print(_value.length);  // ✗ compile error: _value is String?
      });
    }
  }
}
```
::

Two problems — what are they?

<details>
<summary>Answer</summary>

1. **Fields don't promote**: `if (_value != null)` does not promote `_value` to `String` because it's a class field — the compiler can't guarantee it won't be mutated between the check and the use.

2. **Closure + async gap**: even if promotion worked for fields, it doesn't cross into the `Future(() { ... })` closure. The closure executes asynchronously, and `_value` could be null by then.

The fix — snapshot to a final local, then use the local inside the closure:

```dart
class Cache {
  String? _value;

  void process() {
    final value = _value;  // immutable local snapshot
    if (value != null) {
      Future(() {
        print(value.length);  // ✓ value is promoted to String (final local, no async mutation)
      });
    }
  }
}
```

The local `value` is `final` — it can't be reassigned, so the promotion holds inside the closure. The snapshot captures the value at check time, making it immune to concurrent mutation of `_value`.

</details>