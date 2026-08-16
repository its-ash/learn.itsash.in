# 04 — Control Flow

Dart's control flow: `if`/`else`, loops (`for`, `while`, `do-while`, `for-in`), `switch`, `break`/`continue`, and assertions.

## `if` / `else`

::code-wrapper{language="dart"}
```dart
if (score >= 90) {
	print('A');
} else if (score >= 80) {
	print('B');
} else {
	print('C or below');
}
```

Conditions must be `bool` (no truthy/falsy). Curly braces are required for multi-statement blocks; optional (but discouraged) for single statements.

## Loops

### `for`

::code-wrapper{language="dart"}
```dart
for (var i = 0; i < 5; i++) {
	print(i);
}
```

Classic C-style `for`: init; condition; update.

### `for-in`

::code-wrapper{language="dart"}
```dart
for (var fruit in ['apple', 'banana', 'cherry']) {
	print(fruit);
}

for (var entry in {'a': 1, 'b': 2}.entries) {
	print('${entry.key}: ${entry.value}');
}
```

`for-in` iterates any `Iterable`. For `Map`, iterate `.entries` (or `.keys`/`.values`).

### `while`

::code-wrapper{language="dart"}
```dart
var i = 0;
while (i < 5) {
	print(i);
	i++;
}
```

Checks the condition *before* each iteration. May run zero times.

### `do-while`

::code-wrapper{language="dart"}
```dart
var i = 0;
do {
	print(i);
	i++;
} while (i < 5);
```

Checks the condition *after* each iteration. Runs at least once.

## `break` and `continue`

::code-wrapper{language="dart"}
```dart
for (var i = 0; i < 10; i++) {
	if (i == 3) continue;   // skip 3
	if (i == 7) break;      // stop at 7
	print(i);               // 0, 1, 2, 4, 5, 6
}
```

`break` exits the loop; `continue` skips to the next iteration.

### Labeled breaks

::code-wrapper{language="dart"}
```dart
outer:
for (var i = 0; i < 3; i++) {
	for (var j = 0; j < 3; j++) {
		if (i == 1 && j == 1) break outer;   // breaks the outer loop
		print('i=$i j=$j');
	}
}
```

Labels (`outer:`) let `break`/`continue` target an outer loop. Rarely used — usually a sign to refactor into a function (with `return`).

## `switch`

::code-wrapper{language="dart"}
```dart
switch (color) {
	case 'red':
		print('Stop');
		break;
	case 'yellow':
		print('Slow');
		break;
	case 'green':
		print('Go');
		break;
	default:
		print('Unknown');
}
```

### Exhaustiveness and `enum`

Dart 3 added **exhaustive switches** for `enum`s and sealed types — the compiler ensures all cases are handled:

::code-wrapper{language="dart"}
```dart
enum TrafficLight { red, yellow, green }

String action(TrafficLight light) {
	return switch (light) {
		TrafficLight.red => 'Stop',
		TrafficLight.yellow => 'Slow',
		TrafficLight.green => 'Go',
	};   // no default needed — all cases covered
}
```

If you add a new enum value later, the compiler flags all non-exhaustive switches — a powerful refactoring safety net.

### Switch expressions (Dart 3)

::code-wrapper{language="dart"}
```dart
final message = switch (status) {
	200 => 'OK',
	404 => 'Not Found',
	500 => 'Server Error',
	_ => 'Unknown',   // _ is the wildcard (default)
};
```

Switch expressions return a value (no `break` needed). `_` is the wildcard pattern (default). Use for mapping values concisely.

### Pattern matching (Dart 3)

Dart 3 switch supports patterns (chapter 12):

::code-wrapper{language="dart"}
```dart
switch (point) {
	case (int x, int y) when x == y:
		print('on the diagonal');
	case (int x, int y):
		print('($x, $y)');
}
```

### Fallthrough

Dart `switch` does *not* fall through by default — each case must `break`, `return`, `throw`, or `continue`. Empty cases (no body) fall through to the next:

::code-wrapper{language="dart"}
```dart
switch (x) {
	case 1:
	case 2:           // falls through (empty case)
		print('1 or 2');
		break;
	case 3:
		print('3');
		break;
}
```

## `assert`

::code-wrapper{language="dart"}
```dart
void withdraw(int amount) {
	assert(amount > 0, 'Amount must be positive');
	balance -= amount;
}
```

`assert(condition, message)` checks a condition — throws `AssertionError` if false. **Only runs in debug mode** (JIT, development). In production (AOT), asserts are stripped. Use for development-time invariants, not runtime validation.

## `late` and control flow

`late` variables assigned in branches must be definitely assigned before use:

::code-wrapper{language="dart"}
```dart
late String result;
if (condition) {
	result = 'yes';
} else {
	result = 'no';
}
print(result);   // ✓ assigned in both branches
```

If a branch doesn't assign and is taken, reading `result` throws.

## 💡 Tips & Tricks

- **Idiom**: use `for-in` (not indexed `for`) for iterating collections — `for (var item in list)` is clearer and less error-prone than `for (var i = 0; i < list.length; i++)`. Use indexed `for` only when you need the index.
- **Idiom**: use switch expressions (Dart 3) for value mapping — `switch (x) { 1 => 'one', 2 => 'two', _ => 'other' }` is concise and returns a value. Use for mapping enums/status codes to messages.
- **Idiom**: rely on exhaustive switches for enums — a `switch` over an `enum` without a `default` is checked for exhaustiveness. Adding a new enum value flags all non-exhaustive switches, a refactoring safety net.
- **Idiom**: use `assert` for development-time invariants — `assert(amount > 0)` catches bugs during development (JIT), stripped in production (AOT). Use for preconditions that should never fail if the code is correct; use `if`/`throw` for runtime validation (user input).
- **Idiom**: use labeled `break` sparingly — prefer extracting the loop into a function and using `return`. Labels (`outer: for... break outer;`) work but are a sign of complex control flow.

## ⚠️ Edge Cases & Gotchas

- **Conditions must be `bool`**: `if (x)` where `x` is `int` or `String` is a compile error (no truthy/falsy). Compare explicitly.
- **`switch` doesn't fall through by default**: each non-empty case must end with `break`/`return`/`throw`/`continue`. Forgetting it is a compile error (unlike C/Java, which silently fall through).
- **Empty cases fall through**: `case 1: case 2: print('1 or 2');` — `case 1` (empty) falls through to `case 2`. Use this for grouping, but it can surprise.
- **`assert` is stripped in production**: `assert(condition)` runs only in debug (JIT). In AOT (production), it's a no-op. Don't use `assert` for runtime validation (user input) — use `if`/`throw`.
- **`for-in` on a `Map` iterates entries**: `for (var k in map)` iterates *keys* (a `Map` is `Iterable` of keys). For entries, use `for (var e in map.entries)` or `map.forEach((k, v) => ...)`.
- **`continue` in `for-in`**: works (skips to the next item). But `continue` in `forEach` (a method, not a loop) is invalid — `forEach` takes a function; use `return` to skip, or a `for-in` for `continue`.
- **`break` outside a loop is invalid**: `break` only works inside loops and `switch`. In a callback inside a loop, `break` breaks the outer loop (if labeled) or errors.
- **Exhaustive switch requires all enum cases**: if you add `default` to an enum switch, it's no longer exhaustive (the compiler won't flag missing cases). Prefer no `default` for enums, let exhaustiveness check.
- **`do-while` runs at least once**: the body executes before the condition is checked. Use when you need at least one iteration (e.g., read-then-check).

## 🧠 Spot the Bug

A developer adds a new enum value, but existing code silently mishandles it:

::code-wrapper{language="dart"}
```dart
enum Status { pending, active, completed }

String label(Status s) {
	switch (s) {
		case Status.pending: return 'Pending';
		case Status.active: return 'Active';
		default: return 'Completed';
	}
}
```

Later, `Status.cancelled` is added. What happens?

<details>
<summary>Answer</summary>

The `default` case catches `Status.cancelled` and returns `'Completed'` — wrong! The `default` makes the switch non-exhaustive-checked, so the compiler doesn't flag the missing `Status.cancelled` case. The bug is silent: cancelled items show as "Completed".

The fix — remove the `default` and handle all cases explicitly. With exhaustive checking (Dart 3), adding `Status.cancelled` causes a compile error at this switch, forcing the developer to handle it:

```dart
enum Status { pending, active, completed, cancelled }

String label(Status s) {
	return switch (s) {
		Status.pending => 'Pending',
		Status.active => 'Active',
		Status.completed => 'Completed',
		Status.cancelled => 'Cancelled',
	};   // exhaustive — compiler ensures all cases
}
```

Now adding a new `Status` value causes a compile error here (non-exhaustive switch), and the developer must handle it. No silent bugs.

**The lesson**: avoid `default` in `switch` over `enum`s — let Dart 3's exhaustiveness checking catch missing cases. Adding a new enum value then flags all switches that need updating. `default` defeats this safety net and causes silent mishandling.

</details>

## Summary

You can use `if`/`else`, loops (`for`, `for-in`, `while`, `do-while`), `break`/`continue` (labeled), `switch` (statements and Dart 3 expressions, exhaustive for enums, pattern matching), and `assert` (debug-only) — with the no-fallthrough and no-`default`-for-exhaustiveness traps avoided. Next: functions and scope.