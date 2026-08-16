# 03 — Operators & Expressions

Dart's operators are C-family — arithmetic, comparison, logical, bitwise, assignment, null-aware, and type test.

## Arithmetic

::code-wrapper{language="dart"}
```dart
5 + 2    // 7
5 - 2    // 3
5 * 2    // 10
5 / 2    // 2.5 (always double)
5 ~/ 2   // 2 (integer division, truncated)
5 % 2    // 1 (modulo)
5 == 2   // false
5 != 2   // true
```

`/` always returns `double` (even for `int` inputs). `~/` is integer division (returns `int`, truncated toward zero). `%` is modulo. `-5 ~/ 2 = -2` (truncates toward zero, not floor).

### Increment/decrement

::code-wrapper{language="dart"}
```dart
var x = 5;
x++;     // 6 (postfix)
++x;     // 7 (prefix)
x--;     // 6
--x;     // 5
```

Postfix returns the old value, prefix returns the new. `var y = x++` — `y` is the old `x`, then `x` increments.

### Overflow

Dart `int` is 64-bit (native). Arithmetic wraps on overflow (two's complement) — no exception. On the web, `int` is a JS number (double), so large integers lose precision above 2^53.

## Comparison

::code-wrapper{language="dart"}
```dart
5 == 5       // true
5 != 3       // true
5 < 3        // false
5 > 3        // true
5 <= 5       // true
5 >= 6       // false
```

`==` compares by value for most types. For lists/maps, `==` compares by identity (use `listEquals`/`DeepCollectionEquality` for value comparison). Override `==` and `hashCode` in your classes for value equality.

## Logical

::code-wrapper{language="dart"}
```dart
true && false   // false
true || false   // true
!true           // false
```

Short-circuit: `&&` stops if the left is false; `||` stops if the left is true.

## Bitwise

::code-wrapper{language="dart"}
```dart
5 & 3    // 1 (AND)
5 | 3    // 7 (OR)
5 ^ 3    // 6 (XOR)
~5       // -6 (NOT)
5 << 2   // 20 (left shift)
5 >> 1   // 2 (right shift, arithmetic)
```

Bitwise operators work on `int`. `~` is bitwise NOT (flips all bits). `>>` is arithmetic (sign-extending) on signed integers.

## Assignment

::code-wrapper{language="dart"}
```dart
var x = 5;
x += 3;   // 8
x -= 2;   // 6
x *= 2;   // 12
x ~/= 5;  // 2 (integer division assignment)
x %= 2;   // 0
```

Compound assignment for all arithmetic/bitwise operators: `+=`, `-=`, `*=`, `/=`, `~/=`, `%=`, `&=`, `|=`, `^=`, `<<=`, `>>=`, `>>>=`.

## Null-Aware Operators

Dart has several operators for null safety:

### `??` (if-null)

::code-wrapper{language="dart"}
```dart
String? name;
String display = name ?? 'Anonymous';   // 'Anonymous' (name is null)
```

Returns the left if non-null, else the right. The right is evaluated only if the left is null.

### `??=` (null-aware assignment)

::code-wrapper{language="dart"}
```dart
String? name;
name ??= 'Alice';   // name is now 'Alice' (was null)
name ??= 'Bob';     // name is still 'Alice' (already non-null)
```

Assigns only if the variable is null.

### `?.` (null-aware access)

::code-wrapper{language="dart"}
```dart
String? name;
int? length = name?.length;   // null (name is null, no method call)
name?.toUpperCase();          // no-op (null)
```

Calls the method/accesses the property only if the object is non-null; returns `null` otherwise. Promotes the result to nullable.

### `!` (null assertion)

::code-wrapper{language="dart"}
```dart
String? name = getInput();
print(name!.length);   // asserts name is non-null (throws if null)
```

`!` tells the compiler "I know this isn't null" — it promotes the type to non-nullable. Throws `TypeError` at runtime if it *is* null. Use sparingly (it defeats null safety); prefer `??` or null checks.

### `?..` (null-aware cascade)

::code-wrapper{language="dart"}
```dart
StringBuilder? builder;
builder?..add('a')..add('b');   // cascades only if builder is non-null
```

## Type Test

::code-wrapper{language="dart"}
```dart
var x = 10;
x is int         // true
x is! String     // true (is! = "is not")
x as int         // cast (throws if not an int)
```

`is` checks the type (and promotes in `if`). `as` casts (throws `TypeError` if invalid). Prefer `is` over `as` — `is` is safe, `as` can throw.

### Type promotion

::code-wrapper{language="dart"}
```dart
Object x = 'hello';
if (x is String) {
	print(x.length);   // ✓ x is promoted to String inside the if
}
```

`is` in an `if` promotes the type within the block — no explicit cast needed.

## Conditional (`?:`)

::code-wrapper{language="dart"}
```dart
var status = age >= 18 ? 'adult' : 'minor';
```

Ternary: `condition ? then : else`.

## Cascade (`..`)

::code-wrapper{language="dart"}
```dart
var paint = Paint()
	..color = Colors.red
	..strokeWidth = 2.0
	..style = PaintingStyle.fill;
```

`..` returns the object (not the result of the method), enabling chaining setters on the same instance. Equivalent to:

::code-wrapper{language="dart"}
```dart
var paint = Paint();
paint.color = Colors.red;
paint.strokeWidth = 2.0;
paint.style = PaintingStyle.fill;
```

## Spread (`...`)

In collection literals (chapter 09):

::code-wrapper{language="dart"}
```dart
var a = [1, 2, 3];
var b = [0, ...a, 4];   // [0, 1, 2, 3, 4]
var c = [0, ...?a, 4];  // null-aware spread (if a is null, skips)
```

## Operator Precedence

High to low:
1. `!` `~` `++` `--` (unary)
2. `*` `/` `%` `~/`
3. `+` `-`
4. `<<` `>>` `>>>`
5. `&` `^` `|`
6. `<` `>` `<=` `>=` `instanceof` `is` `as`
7. `==` `!=`
8. `&&`
9. `||`
10. `??`
11. `?:` (ternary)
12. `=` `+=` etc. (assignment)
13. `..` (cascade)

Use parentheses for clarity when in doubt.

## 💡 Tips & Tricks

- **Idiom**: use `~/` for integer division (not `/` then `toInt()`) — `7 ~/ 2 = 3` directly, clearer and faster than `(7 / 2).toInt()`.
- **Idiom**: use `??` (if-null) and `??=` (null-aware assignment) for defaults — `name ?? 'Anonymous'` and `cache[key] ??= compute(key)`. They handle null cleanly without verbose `if` checks.
- **Idiom**: use `?.` (null-aware access) for optional method calls — `obj?.method()` returns `null` if `obj` is null (no method call). Chains well: `user?.address?.city`.
- **Idiom**: prefer `is` over `as` for type checks — `if (x is String) { x.length }` promotes the type safely (no throw). `x as String` throws if `x` isn't a String. Use `as` only when you're certain.
- **Idiom**: use `..` (cascade) for fluent object configuration — `Paint()..color = red..strokeWidth = 2` sets multiple properties in one expression, cleaner than separate statements.

## ⚠️ Edge Cases & Gotchas

- **`/` always returns `double`**: `4 / 2 = 2.0` (not `2`). Use `~/` for integer division (`4 ~/ 2 = 2`).
- **`~/` truncates toward zero**: `-5 ~/ 2 = -2` (not -3). `~/%` follows the sign of the dividend.
- **`%` follows the sign of the dividend**: `-5 % 2 = -1` (in Dart). Not the mathematical modulo (which would be 1).
- **`==` for collections is identity**: `[1,2] == [1,2]` is `false` (different instances). Use `listEquals` (from `package:flutter/foundation.dart`) or `DeepCollectionEquality()` for value equality.
- **`!` (null assertion) throws at runtime**: `null!` throws `TypeError`. It defeats null safety — use only when you're certain, and prefer null-safe patterns (`??`, `?.`, `if (x != null)`).
- **`as` throws on invalid cast**: `(5 as String)` throws `TypeError`. Use `is` first or `as` only when certain.
- **Type promotion doesn't work across closures**: `if (x is String) { () => x.length; }` — inside the closure, `x` isn't promoted (the closure could run later, after `x` changed). Assign to a local first.
- **`??=` evaluates the right side only if the left is null**: `cache[key] ??= compute(key)` — `compute` runs only on a cache miss. Efficient for memoization.
- **`..` (cascade) returns the object, not the method result**: `list..add(1)` returns `list` (not `void` from `add`). Don't confuse with method chaining (`add` returns `void`).
- **Integer overflow wraps silently**: no exception. `9223372036854775807 + 1` wraps to `-9223372036854775808` (on native). On web, large `int`s lose precision (JS number).

## 🧠 Spot the Bug

A developer divides two integers and expects an integer result, but gets a `double`:

::code-wrapper{language="dart"}
```dart
int total = 10;
int count = 3;
int average = total / count;
```
::

What's wrong?

<details>
<summary>Answer</summary>

`/` always returns `double` in Dart (even for `int` operands). `10 / 3 = 3.333...` (a `double`). Assigning a `double` to an `int` (`int average = ...`) is a type error.

The fix — use `~/` (integer division) for an `int` result:

```dart
int total = 10;
int count = 3;
int average = total ~/ count;   // 3 (int)
```

Or if you want the `double` average:

```dart
double average = total / count;   // 3.333...
```

**The lesson**: Dart's `/` always returns `double` (unlike some languages where `int / int = int`). Use `~/` for integer division (`int ~/ int = int`, truncated). This is a common surprise for developers from Python 2, Java, or C (where `int / int = int`).

</details>

## Summary

You know Dart's arithmetic (`+`, `-`, `*`, `/` (double), `~/` (int), `%`), comparison, logical, bitwise, assignment, null-aware (`??`, `??=`, `?.`, `!`, `?..`), type test (`is`, `is!`, `as`, type promotion), conditional (`?:`), cascade (`..`), and spread (`...`) operators — with the `/`-returns-double and `!`-throws traps avoided. Next: control flow.