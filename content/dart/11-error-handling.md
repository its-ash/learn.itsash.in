# 11 — Error Handling & Exceptions

Dart uses exceptions for error handling. `throw` raises, `try`/`catch`/`finally` handles. Every exception is an object (a subtype of `Object`).

## Throwing

::code-wrapper{language="dart"}
```dart
throw Exception('Something went wrong');
throw 'A string error';       // ✓ any object can be thrown (not recommended)
throw FormatException('Bad input');
throw ArgumentError('x must be positive');
throw StateError('Not initialized');
```
::
Any object can be thrown (Dart doesn't require `Throwable`/`Exception` like Java). But convention: throw `Exception` or `Error` subtypes, not raw strings/numbers.

### `Exception` vs `Error`

- **`Exception`** — for runtime conditions a program might catch (network failure, bad input from a file).
- **`Error`** — for programming bugs (wrong state, null where shouldn't be, index out of bounds). Errors usually shouldn't be caught (let them crash).

::code-wrapper{language="dart"}
```dart
// Exception: catch it
try {
	final data = await fetchData();
} on HttpException catch (e) {
	// handle
}

// Error: don't catch (programming bug)
final x = list[-1];   // RangeError — let it crash, fix the bug
```
::
## Catching

::code-wrapper{language="dart"}
```dart
try {
	riskyOperation();
} on FormatException catch (e) {
	print('Format error: ${e.message}');
} on HttpException catch (e) {
	print('HTTP error: $e');
} on Exception catch (e) {
	print('Other exception: $e');
} catch (e, stackTrace) {
	print('Anything: $e');
	print(stackTrace);
} finally {
	cleanup();
}
```
::
- `on SpecificType catch (e)` — catches a specific type.
- `catch (e)` — catches anything (rarely a good idea; too broad).
- `catch (e, stackTrace)` — also gets the stack trace.
- `finally` — runs regardless (cleanup).

### Order matters

`on` clauses are checked top-to-bottom. More specific types first:

::code-wrapper{language="dart"}
```dart
try { ... }
on SpecificException catch (e) { ... }   // first
on Exception catch (e) { ... }            // later (broader)
```
::
If `Exception` (broader) came first, `SpecificException` would never be reached.

## Rethrowing

::code-wrapper{language="dart"}
```dart
try {
	riskyOperation();
} on Exception catch (e) {
	log(e);
	rethrow;   // re-throws the original exception (preserves stack)
}
```
::
`rethrow` re-throws the current exception, preserving the original stack trace. Use when you log/handle partially but want the caller to also handle.

### `throw` vs `rethrow`

`throw e` resets the stack trace (looks like it originated here). `rethrow` preserves the original stack. Prefer `rethrow`.

## Custom Exceptions

::code-wrapper{language="dart"}
```dart
class InvalidUserException implements Exception {
	final String message;
	final String? field;

	InvalidUserException(this.message, {this.field});

	@override
	String toString() => 'InvalidUserException: $message${field != null ? ' (field: $field)' : ''}';
}

throw InvalidUserException('Name is empty', field: 'name');
```
::
Convention:
- Implement `Exception` (marker interface).
- Have a `message` and useful fields.
- Override `toString()` for readable output.

## Custom Errors

::code-wrapper{language="dart"}
```dart
class AssertionError extends Error {
	final String message;
	AssertionError(this.message);

	@override
	String toString() => 'AssertionError: $message';
}
```
::
Extend `Error` for programming bugs. Errors usually aren't caught.

## The `Error` hierarchy

- `ArgumentError` — invalid argument.
- `StateError` — object in a bad state.
- `RangeError` — value out of range (index, etc.).
- `NoSuchMethodError` — method doesn't exist.
- `UnsupportedError` — operation not supported.
- `UnimplementedError` — operation not yet implemented.
- `ConcurrentModificationError` — collection modified during iteration.
- `LateInitializationError` — `late` var read before assignment.
- `AssertionError` — `assert` failed (debug only).

## `assert` (recap)

::code-wrapper{language="dart"}
```dart
void withdraw(int amount) {
	assert(amount > 0, 'Amount must be positive');
	balance -= amount;
}
```
::
`assert` throws `AssertionError` in debug mode only. Stripped in production (AOT). Use for development-time invariants, not runtime validation.

## Error handling with `async`/`await`

::code-wrapper{language="dart"}
```dart
Future<void> main() async {
	try {
		var data = await fetchData();
	} on HttpException catch (e) {
		print('Network error: $e');
	} catch (e, stack) {
		print('Unexpected: $e\n$stack');
	}
}
```
::
`try`/`catch` works with `await` — the `Future`'s error is caught. Errors from `await`ed futures propagate like synchronous throws.

## Uncaught errors

Uncaught errors in `async` code are "uncaught in the zone." In Flutter, they crash the app (with a red screen in debug). In Dart CLI, they may crash the process. Use `runZonedGuarded` to catch uncaught async errors:

::code-wrapper{language="dart"}
```dart
runZonedGuarded(() async {
	await riskyAsyncOperation();
}, (error, stack) {
	print('Uncaught: $error\n$stack');
});
```
::
## Never catch what you can't handle

Catching `catch (e)` (everything) and swallowing it hides bugs. Catch specific exceptions you can recover from; let unexpected errors crash (so you find and fix them).

::code-wrapper{language="dart"}
```dart
// ❌ catches everything, hides bugs
try { riskyOp(); } catch (e) { /* swallow */ }

// ✓ catches specific, rethrows unexpected
try { riskyOp(); }
on HttpException catch (e) { /* recover */ }
// other exceptions propagate (visible)
```
::
## 💡 Tips & Tricks

- **Idiom**: throw `Exception` subtypes for recoverable conditions, `Error` subtypes for bugs — `HttpException`, `FormatException` (recoverable, catch them); `StateError`, `RangeError` (bugs, let them crash). Don't catch errors (hide bugs); catch exceptions (recover).
- **Idiom**: catch specific exceptions, not broad `catch (e)` — `on HttpException catch (e)` is clear; `catch (e)` catches everything (including bugs), hiding issues. Catch what you can recover from, let the rest propagate.
- **Idiom**: use `rethrow` (not `throw e`) to re-throw — `rethrow` preserves the original stack trace; `throw e` resets it (looks like it originated here). Use when you log/handle partially but want the caller to also handle.
- **Idiom**: implement `Exception` for custom exceptions — `class MyException implements Exception { final String message; ... }`. Have a `message`, useful fields, and override `toString()`. Name them clearly (`InvalidUserException`).
- **Idiom**: use `runZonedGuarded` for uncaught async errors — errors in `async` code that aren't `await`ed are "uncaught in the zone." `runZonedGuarded` catches them for logging/recovery. Use in `main` to catch all uncaught async errors.

## ⚠️ Edge Cases & Gotchas

- **Any object can be thrown**: `throw 'a string'` is valid (unlike Java). But convention: throw `Exception`/`Error` subtypes for clarity and catchability.
- **`catch (e)` is too broad**: it catches everything (including `Error`s like `RangeError`), hiding bugs. Prefer `on SpecificType catch (e)`.
- **`on` order matters**: more specific types first. `on Exception` before `on HttpException` means `HttpException` is never reached (it's an `Exception`).
- **`finally` runs even on `return`/`throw`**: `try { return f(); } finally { cleanup(); }` — `cleanup` runs before `return`'s value is returned. Use for cleanup, but avoid heavy logic in `finally` (can mask exceptions).
- **`throw e` resets the stack trace**: use `rethrow` to preserve the original. `throw e` makes the exception look like it originated from the `throw e` line.
- **`assert` is debug-only**: stripped in production (AOT). Don't use `assert` for runtime validation (user input). Use `if`/`throw ArgumentError`.
- **Don't catch `Error`s**: `StateError`, `RangeError` are bugs — catching them hides the bug. Let them crash and fix the root cause. Catch `Exception`s (recoverable).
- **Uncaught async errors crash (or are silent)**: in Flutter, uncaught async errors crash (red screen in debug). In CLI, they may crash or be swallowed by the zone. Always `await` or handle futures.
- **`Exception` and `Error` are marker interfaces**: `Exception` has no required methods. Implementing it is a convention (for catchability via `on Exception`). `Error` is similar.
- **`NoSuchMethodError` from `dynamic`**: calling a non-existent method on a `dynamic` variable throws `NoSuchMethodError` at runtime (no compile check). Use typed variables to catch at compile time.

## 🧠 Spot the Bug

A developer catches all exceptions to "handle" them, but real bugs are now invisible:

::code-wrapper{language="dart"}
```dart
Future<void> process() async {
	try {
		var data = await fetchData();
		var parsed = parseData(data);   // has a bug, throws StateError
		save(parsed);
	} catch (e) {
		print('Something went wrong');
	}
}
```
::

What's the problem?

<details>
<summary>Answer</summary>

`catch (e)` catches *everything* — including the `StateError` from the bug in `parseData`. The error is logged as "Something went wrong" and swallowed. The developer never sees the real bug (the `StateError` with its stack trace), making debugging nearly impossible. The bug is hidden.

The fix — catch specific recoverable exceptions, let bugs propagate:

```dart
Future<void> process() async {
	try {
		var data = await fetchData();
		var parsed = parseData(data);
		save(parsed);
	} on HttpException catch (e) {
		print('Network error: $e');   // recover from network issues
	} on FormatException catch (e) {
		print('Bad data: $e');         // recover from bad data
	}
	// StateError (bug) propagates — visible, fixable
}
```
::
Now `HttpException` and `FormatException` (recoverable) are handled, but a `StateError` (bug in `parseData`) propagates — crashing with a stack trace, so the developer can find and fix it.

**The lesson**: `catch (e)` (broad) catches bugs too, hiding them. Catch specific exceptions you can recover from (`on HttpException`, `on FormatException`). Let unexpected errors (bugs) propagate so they're visible and fixable. Don't swallow exceptions silently.

</details>

## Summary

You can `throw` (exceptions and errors, custom types), `try`/`on Type catch`/`finally` (specific catches, order matters, `rethrow` preserves stack), distinguish `Exception` (recoverable) vs `Error` (bug), use `assert` (debug-only), handle errors in `async`/`await` (propagate like sync), use `runZonedGuarded` for uncaught async errors, and avoid broad `catch (e)` — with the swallow-bugs trap avoided. Next: generics.