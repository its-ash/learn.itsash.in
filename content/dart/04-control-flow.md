---
title: "Dart — Control Flow, Exhaustiveness & Pattern Matching"
description: "Deep-dive into Dart 3 exhaustive switches, sealed class patterns, record destructuring, guard clauses, and control-flow edge cases. Code-first engineering reference."
---

# Dart — Control Flow, Exhaustiveness & Pattern Matching

## Exhaustive Switches — The Compiler Safety Net

::code-wrapper{language="dart"}
```dart
// Dart 3 exhaustive switches: if you handle all subtypes of a sealed type,
// the compiler ENFORCES completeness — no `default` needed, and adding a
// new subtype causes a compile error at every non-exhaustive switch.

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

class Loading<T> extends Result<T> {
  const Loading();
}

// Exhaustive — all three subtypes handled. No `default` needed.
String describe<T>(Result<T> r) => switch (r) {
  Success(:final value) => 'OK: $value',  // destructuring pattern: extracts .value
  Failure(:final error) => 'ERR: $error',
  Loading() => 'Loading...',
};

// If you later add `class Idle<T> extends Result<T> {}`, every switch like the
// above becomes a COMPILE ERROR: "Idle is not handled." This is the safety net —
// you can't forget a case.
```
::

### The `default` Trap

::code-wrapper{language="dart"}
```dart
enum Status { pending, active, completed }

// ❌ Anti-pattern: using `default` in an enum switch.
String labelBad(Status s) => switch (s) {
  Status.pending => 'Pending',
  Status.active => 'Active',
  _ => 'Completed',  // wildcard catches everything else — including FUTURE values
};

// If `Status.cancelled` is added later, `_` silently catches it and returns
// 'Completed' — a silent semantic bug. The compiler can't warn you.

// ✓ Correct: handle every case explicitly, no wildcard.
String labelGood(Status s) => switch (s) {
  Status.pending => 'Pending',
  Status.active => 'Active',
  Status.completed => 'Completed',
  // Adding Status.cancelled here → compile error: non-exhaustive switch.
  // The compiler FORCES you to handle the new case.
};
```
::

## Pattern Matching — Destructuring & Guards

::code-wrapper{language="dart"}
```dart
// Dart 3 patterns: destructuring, type matching, guard clauses (`when`).

// Record destructuring in switch:
(int x, int y) point = (3, 4);
String quadrant = switch (point) {
  (0, 0) => 'origin',
  (int x, 0) when x > 0 => 'positive x-axis',
  (int x, 0) => 'negative x-axis',
  (0, int y) => 'y-axis',
  (int x, int y) when x > 0 && y > 0 => 'Q1',
  (int x, int y) when x < 0 && y > 0 => 'Q2',
  (int x, int y) when x < 0 && y < 0 => 'Q3',
  _ => 'Q4',
};

// Type + destructuring patterns:
sealed class Shape {}
class Circle extends Shape { final double r; Circle(this.r); }
class Rectangle extends Shape { final double w, h; Rectangle(this.w, this.h); }
class Triangle extends Shape { final double a, b, c; Triangle(this.a, this.b, this.c); }

double area(Shape s) => switch (s) {
  Circle(:final r) => 3.14159 * r * r,
  Rectangle(:final w, :final h) => w * h,
  Triangle(:final a, :final b, :final c) {
    final semi = (a + b + c) / 2;
    return (semi * (semi - a) * (semi - b) * (semi - c)).abs();
  }
};

// `if` with patterns (Dart 3):
void handleShape(Shape s) {
  if (s case Circle(:final r) when r > 100) {
    print('Large circle: $r');
  } else if (s case Rectangle(:final w, :final h) when w == h) {
    print('Square: ${w}x${h}');
  }
}

// Map pattern (destructuring by key):
switch (json) {
  case {'type': 'point', 'x': int x, 'y': int y}:
    print('Point at ($x, $y)');
  case {'type': 'circle', 'radius': double r}:
    print('Circle radius $r');
  case {'type': String type}:
    print('Unknown type: $type');
}
```
::

## Switch Expressions vs Statements

::code-wrapper{language="dart"}
```dart
// Switch EXPRESSION — returns a value, no `break`, arms are `=>`:
final status = switch (code) {
  200 || 201 => 'success',  // OR pattern: multiple values, one arm
  400 => 'bad request',
  401 || 403 => 'auth error',
  404 => 'not found',
  >= 500 => 'server error',  // relational pattern: >= 500
  _ => 'unknown',
};

// Switch STATEMENT — for side effects, `break` required (no implicit fallthrough):
void handle(int code) {
  switch (code) {
    case 200:
    case 201:  // empty case falls through to next (only for empty cases)
      print('Success');
      break;
    case 404:
      print('Not found');
      break;
    default:
      print('Unknown');
  }
}

// ❌ Anti-pattern: forgetting `break` in a switch statement.
// switch (x) { case 1: print('one'); case 2: print('two'); }  // ✗ compile error
// Dart requires break/return/throw/continue after each non-empty case body.
// Only EMPTY cases (no body) fall through to the next.
```
::

## Loop Semantics — Capture & `forEach` Trap

::code-wrapper{language="dart"}
```dart
// Dart's `for` loop variable is a SINGLE variable reassigned each iteration
// (like JS `var`, NOT like JS `let` or Rust). Closures capture it by reference.

// ❌ Anti-pattern: closures in a loop all capture the same variable.
var callbacks = <int Function()>[];
for (var i = 0; i < 3; i++) {
  callbacks.add(() => i);
}
print(callbacks.map((f) => f()).toList());  // [3, 3, 3] — all see final value of i

// ✓ Correct: capture per-iteration in a `final` local.
var callbacksFixed = <int Function()>[];
for (var i = 0; i < 3; i++) {
  final captured = i;  // fresh per iteration, immutable
  callbacksFixed.add(() => captured);
}
print(callbacksFixed.map((f) => f()).toList());  // [0, 1, 2]

// `forEach` is a METHOD, not a loop — `continue`/`break` don't work inside it.
// ❌ Anti-pattern: using `continue` in `forEach`.
[1, 2, 3].forEach((x) {
  // if (x == 2) continue;  // ✗ compile error — no continue in a callback
  if (x == 2) return;  // ✓ `return` skips this callback invocation (like continue)
  print(x);  // 1, 3
});

// ✓ For `continue`/`break` semantics, use a real loop:
for (var x in [1, 2, 3]) {
  if (x == 2) continue;
  print(x);  // 1, 3
}
```
::

## `assert` — Debug-Only Invariants

::code-wrapper{language="dart"}
```dart
// assert() runs ONLY in debug (JIT/VM). In AOT (release), it's completely stripped.
// Use for development-time invariants — conditions that indicate a bug if false.

void transfer(Account from, Account to, int amount) {
  assert(amount > 0, 'Transfer amount must be positive');
  assert(from.balance >= amount, 'Insufficient funds — caller should check first');
  // These assertions catch programming errors during development.
  // In release, they vanish — zero overhead. But the checks are NOT runtime validation.

  // For user-facing validation, use explicit checks:
  if (amount <= 0) throw ArgumentError('Amount must be positive: $amount');
  if (from.balance < amount) throw StateError('Insufficient funds');

  from.debit(amount);
  to.credit(amount);
}

// assert with a lambda body for expensive checks (only evaluated in debug):
assert(() {
  _validateInvariants();  // complex check — stripped in release
  return true;
}());
```
::

## 💡 Tips & Tricks

- **Idiom**: remove `default`/`_` from switches over sealed types and enums — let the compiler enforce exhaustiveness. Adding a new case causes a compile error at every switch, forcing you to handle it. This is Dart 3's most powerful refactoring safety net.
- **Idiom**: use switch expressions for value mapping — `switch (x) { 200 => 'OK', _ => 'ERR' }` is concise and returns a value. Use for status code mapping, enum-to-string, result unwrapping. Prefer over `if-else` chains for multi-way dispatch.
- **Idiom**: use patterns for destructuring — `case Success(:final value)` extracts `.value` directly in the switch arm. Eliminates explicit casts and field access. Combines type checking + extraction in one expression.
- **Idiom**: use guard clauses (`when`) for additional conditions — `case (int x, int y) when x > 0 && y > 0` adds a boolean predicate to a pattern. Use for sub-case filtering without nested `if`.
- **Debug**: `assert(() { _validateInvariants(); return true; }())` — the lambda body is fully stripped in AOT (including side effects). Use for expensive debug-only validation that must not run in production.

## ⚠️ Edge Cases & Gotchas

- **Conditions must be `bool`**: `if (x)` where `x` is `int`, `String`, `List`, or `null` is a compile error. Dart has no truthy/falsy. Compare explicitly: `if (x != null)`, `if (list.isNotEmpty)`.
- **`switch` doesn't fall through by default**: each non-empty case must end with `break`/`return`/`throw`/`continue`. Only empty cases (no body) fall through. Forgetting the terminator is a compile error (unlike C/Java).
- **`default`/`_` defeats exhaustiveness**: adding `_` to a switch over a sealed type makes it non-exhaustive-checked — new subtypes are silently caught by the wildcard. Remove `_` for sealed types and enums.
- **`assert` is stripped in AOT**: the entire expression (including side effects) vanishes in release. Never put business logic, side effects, or runtime validation in `assert`.
- **`for` loop variable is shared across iterations**: closures capturing `i` see the final value. Use `final captured = i;` inside the loop body for per-iteration capture.
- **`forEach` doesn't support `continue`/`break`**: it's a method taking a callback. Use `return` to skip (like `continue`), but there's no `break` equivalent. Use a real `for` loop for control flow.
- **`for-in` on `Map` iterates keys**: `for (var k in map)` iterates keys (a `Map` is `Iterable` of keys). Use `for (var entry in map.entries)` for key-value pairs.
- **Labeled `break` is rarely idiomatic**: `outer: for (...) { for (...) { break outer; } }` works but signals overly complex control flow. Extract to a function and use `return`.
- **`do-while` runs at least once**: the body executes before the condition check. Use for read-then-check patterns (e.g., prompt → validate → repeat).

## 🧠 Spot the Bug

A team adds `Status.cancelled` to their enum. The UI silently shows "Completed" for cancelled orders:

::code-wrapper{language="dart"}
```dart
enum Status { pending, active, completed, cancelled }

String label(Status s) => switch (s) {
  Status.pending => 'Pending',
  Status.active => 'Active',
  _ => 'Completed',  // catches both completed AND cancelled
};
```
::

Why is this a silent bug, and how to prevent it permanently?

<details>
<summary>Answer</summary>

The `_` (wildcard) catches every unhandled case — including the newly added `Status.cancelled`. It returns `'Completed'` for cancelled orders, which is semantically wrong. The wildcard makes the switch non-exhaustive-checked, so the compiler can't flag the missing case.

The fix — remove `_`, handle every case explicitly:

```dart
enum Status { pending, active, completed, cancelled }

String label(Status s) => switch (s) {
  Status.pending => 'Pending',
  Status.active => 'Active',
  Status.completed => 'Completed',
  Status.cancelled => 'Cancelled',
};
```

Now if `Status.shipped` is added later, this switch becomes a **compile error**: "The switch expression does not exhaustively cover all possible cases." The compiler forces you to handle `shipped` — no silent bugs.

The rule: **never use `_` or `default` in switches over enums or sealed types.** Let exhaustiveness checking be your safety net. The wildcard is acceptable for open types (int, String) where you can't enumerate all cases.

</details>