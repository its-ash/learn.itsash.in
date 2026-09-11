---
title: "Dart — Exceptions, Error Hierarchy & Async Error Propagation"
description: "Deep-dive into Dart's exception vs error semantics, custom exception design, rethrow vs throw stack trace preservation, async error zones, and anti-patterns in catch blocks. Code-first engineering reference."
---

# Dart — Exceptions, Error Hierarchy & Async Error Propagation

## `Exception` vs `Error` — Semantic Boundary

::code-wrapper{language="dart"}
```dart
// ── Exception: recoverable runtime conditions a program SHOULD catch. ──
//   - Network failures, bad input, missing files, API errors.
//   - The program can recover (retry, fallback, show error to user).

// ── Error: programming bugs that should CRASH (not be caught). ──
//   - StateError, RangeError, NoSuchMethodError, AssertionError.
//   - The program has a bug — catching it hides the bug. Fix the code.

// ❌ Anti-pattern: catching Errors (hides bugs).
void bad(List<int> list) {
  try {
    list[10].abs();  // RangeError — a bug in the code
  } catch (e) {
    // Swallowed — the bug is invisible. The list was too short.
    // The program continues in a broken state.
  }
}

// ✓ Correct: catch Exceptions (recoverable), let Errors crash.
void good(List<int> list) {
  try {
    final data = fetchData();  // may throw HttpException (recoverable)
    processData(data);
  } on HttpException catch (e) {
    // Recover: retry, cache, show user.
    showRetryDialog(e);
  }
  // RangeError from list[10] propagates — crashes, visible in stack trace.
}

// The Error hierarchy:
// ArgumentError       — invalid argument value
// StateError          — object in a bad state (e.g., calling close() twice)
// RangeError          — value/index out of range
// NoSuchMethodError   — method doesn't exist (usually from `dynamic`)
// UnsupportedError     — operation not supported (e.g., modify unmodifiable list)
// ConcurrentModificationError — collection modified during iteration
// LateInitializationError — `late` var read before assignment
// AssertionError      — `assert` failed (debug only)
```
::

## Custom Exceptions — Production Design

::code-wrapper{language="dart"}
```dart
// Design custom exceptions with: a message, structured fields, toString().
// Implement Exception (marker interface) — enables `on Exception` to catch it.

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  final String? endpoint;
  final Map<String, dynamic>? details;

  const ApiException(
    this.message, {
    this.statusCode,
    this.endpoint,
    this.details,
  });

  @override
  String toString() {
    final parts = <String>['ApiException: $message'];
    if (statusCode != null) parts.add('status=$statusCode');
    if (endpoint != null) parts.add('endpoint=$endpoint');
    return parts.join(' | ');
  }
}

// Domain-specific exceptions with a sealed hierarchy:
sealed class AppException implements Exception {
  final String message;
  const AppException(this.message);
}

class NetworkException extends AppException {
  final int? statusCode;
  const NetworkException(super.message, {this.statusCode});
}

class ValidationException extends AppException {
  final String field;
  const ValidationException(super.message, {required this.field});
}

class AuthException extends AppException {
  const AuthException(super.message);
}

// Usage — catch specific types for specific recovery:
Future<void> handleRequest() async {
  try {
    await process();
  } on NetworkException catch (e) {
    if (e.statusCode == 429) return retryAfterDelay();
    throw e;  // rethrow other network errors
  } on ValidationException catch (e) {
    return BadRequest(error: '${e.field}: ${e.message}');
  } on AuthException {
    return Unauthorized();
  }
  // Unknown exceptions propagate (don't catch broadly).
}
```
::

## `rethrow` vs `throw e` — Stack Trace Preservation

::code-wrapper{language="dart"}
```dart
// ── rethrow: preserves the ORIGINAL stack trace. ──
// The error appears to originate from where it was first thrown.
// Use when you log/handle partially but want the caller to also handle.

// ── throw e: resets the stack trace to THIS line. ──
// The original location is lost — debugging is harder.

// ❌ Anti-pattern: throw e (loses the original stack trace).
Future<void> badHandler() async {
  try {
    await riskyOperation();
  } catch (e) {
    log(e);
    throw e;  // ← stack trace now starts here, not in riskyOperation
  }
}

// ✓ Correct: rethrow (preserves the original stack trace).
Future<void> goodHandler() async {
  try {
    await riskyOperation();
  } catch (e, stackTrace) {
    log(e, stackTrace);
    rethrow;  // ← preserves the original throw location
  }
}

// Capturing the stack trace explicitly:
Future<void> withStackTrace() async {
  try {
    await riskyOperation();
  } on SpecificException catch (e, stackTrace) {
    // `stackTrace` is the original stack — log it for debugging.
    logger.error(e, stackTrace);
    rethrow;
  } catch (e) {
    // No stack trace variable — use rethrow to preserve it.
    rethrow;
  }
}
```
::

## Catch Order — Specific to Broad

::code-wrapper{language="dart"}
```dart
// `on` clauses are checked TOP-TO-BOTTOM. More specific types MUST come first.
// If a broader type is first, specific types below it are unreachable.

try {
  await operation();
} on UserNotFoundException catch (e) {
  // ✓ specific — caught here
  handleUserNotFound(e);
} on NotFoundException catch (e) {
  // ✓ broader — caught here (if not UserNotFoundException)
  handleNotFound(e);
} on HttpException catch (e) {
  // ✓ even broader
  handleHttpError(e);
} on Exception catch (e) {
  // ✓ broadest exception — last resort
  handleGenericException(e);
} catch (e, stackTrace) {
  // ✓ catches EVERYTHING (including non-Exception throwables like Error)
  // Use as a last resort with logging + rethrow.
  logger.error('Unexpected: $e', stackTrace);
  rethrow;
}

// ❌ Anti-pattern: broad catch first — specific catches are unreachable.
try {
  await operation();
} on Exception catch (e) {
  // catches ALL exceptions — UserNotFoundException below is unreachable
} on UserNotFoundException catch (e) {
  // ✗ dead code — never reached
}
```
::

## The Swallow Trap — Never Catch What You Can't Handle

::code-wrapper{language="dart"}
```dart
// ❌ Anti-pattern: catch (e) swallows everything — hides bugs.
Future<void> processBad() async {
  try {
    var data = await fetchData();
    var parsed = parseData(data);  // has a bug, throws StateError
    save(parsed);
  } catch (e) {
    print('Something went wrong');  // StateError (bug) is swallowed
    // The bug is invisible. No stack trace, no type, no way to debug.
  }
}

// ✓ Correct: catch specific recoverable exceptions, let bugs propagate.
Future<void> processGood() async {
  try {
    var data = await fetchData();
    var parsed = parseData(data);
    save(parsed);
  } on HttpException catch (e) {
    // Recover from network issues (retry, cache, show user).
    showRetryDialog(e);
  } on FormatException catch (e) {
    // Recover from bad data format.
    showFormatError(e);
  }
  // StateError (a bug in parseData) propagates — crashes with a stack trace,
  // visible in logs, fixable. Don't swallow what you can't handle.
}

// Acceptable broad catch — ONLY if you log and rethrow:
Future<void> processWithLogging() async {
  try {
    await operation();
  } catch (e, stackTrace) {
    logger.error('Unexpected error', stackTrace);
    rethrow;  // ← ALWAYS rethrow after logging a broad catch
  }
}
```
::

## Async Error Propagation & Zones

::code-wrapper{language="dart"}
```dart
import 'dart:async';

// ── try/catch works with await — the Future's error is caught. ──
Future<void> asyncCatch() async {
  try {
    var data = await fetchData();  // throws → caught by try/catch
  } on HttpException catch (e) {
    print('Network error: $e');
  }
}

// ── Unawaited Future errors are "uncaught in the zone." ──
// If a Future errors and no one awaits or catches it, the error
// propagates to the zone's uncaught error handler.

void bad() {
  Future.error('boom');  // ← unawaited, uncaught → crashes or silent
}

void good() {
  // Option 1: await it (in an async function).
  // Option 2: catchError on the future.
  Future.error('boom').catchError((e) => print('Handled: $e'));
  // Option 3: unawaited to suppress lint (if you handle errors).
  unawaited(
    Future.error('boom').catchError((e) => print('Handled: $e')),
  );
}

// ── runZonedGuarded: top-level boundary for uncaught async errors. ──
void main() {
  runZonedGuarded(() async {
    // All async errors in this zone are caught by the handler.
    await runApp();
  }, (error, stack) {
    // Last-resort error handler — log to Sentry, Crashlytics, etc.
    logger.fatal('Uncaught async error: $error', stack);
  });
}

// ── Future.catchError vs try/catch ──
// Prefer try/catch with await (clearer, type-safe). catchError is for .then() chains:
fetchData()
    .then((data) => processData(data))
    .catchError((e) => handle(e));  // catches errors from then chain
```
::

## `finally` — Cleanup Semantics

::code-wrapper{language="dart"}
```dart
// `finally` runs ALWAYS — on success, on exception, on return, on rethrow.
// Use for resource cleanup (closing connections, releasing locks).

Future<String> readFile(String path) async {
  final file = File(path);
  final stream = file.openRead();
  try {
    final contents = await stream.transform(utf8.decoder).join();
    return contents;
  } catch (e) {
    log('Read failed: $e');
    rethrow;
  } finally {
    // Runs whether the try succeeded, threw, or rethrew.
    await stream.drain();  // ensure stream is fully consumed/closed
  }
}

// ❌ Anti-pattern: heavy logic in finally — can mask exceptions.
Future<void> badFinally() async {
  try {
    await risky();
  } finally {
    await cleanup();  // if cleanup() throws, the original error is MASKED
  }
}

// ✓ Correct: keep finally minimal, handle cleanup errors separately.
Future<void> goodFinally() async {
  try {
    await risky();
  } finally {
    try {
      await cleanup();
    } catch (e) {
      log('Cleanup failed: $e');  // log but don't throw — don't mask original error
    }
  }
}
```
::

## 💡 Tips & Tricks

- **Idiom**: throw `Exception` subtypes for recoverable conditions, `Error` subtypes for bugs — `HttpException`, `FormatException` (recoverable, catch them); `StateError`, `RangeError` (bugs, let them crash). Don't catch `Error`s — they indicate a code bug, not a runtime condition.
- **Idiom**: catch specific exceptions, not broad `catch (e)` — `on HttpException catch (e)` is clear; `catch (e)` catches everything (including bugs), hiding issues. Catch what you can recover from, let the rest propagate.
- **Idiom**: `rethrow` (not `throw e`) to preserve the original stack trace — `rethrow` keeps the original throw location; `throw e` resets the stack to the catch site. Use when logging/handling partially but passing the error up.
- **Idiom**: use `runZonedGuarded` for uncaught async errors — errors in unawaited Futures are "uncaught in the zone." `runZonedGuarded` catches them for logging/recovery. Use in `main` as a top-level safety net.
- **Idiom**: order catches from specific to broad — `on UserNotFoundException` before `on NotFoundException` before `on Exception`. The first matching `on` clause wins; broader types first make specific catches unreachable (dead code).

## ⚠️ Edge Cases & Gotchas

- **Any object can be thrown**: `throw 'a string'` is valid (unlike Java). But convention: throw `Exception`/`Error` subtypes for catchability and clarity.
- **`catch (e)` is too broad**: catches everything (including `Error`s like `RangeError`), hiding bugs. Prefer `on SpecificType catch (e)`.
- **`throw e` resets the stack trace**: use `rethrow` to preserve the original. `throw e` makes the exception look like it originated from the `throw e` line.
- **`finally` runs on `return`/`throw`/`rethrow`**: `try { return f(); } finally { cleanup(); }` — `cleanup` runs before `return`'s value is returned. Keep finally minimal to avoid masking exceptions.
- **`assert` is debug-only**: stripped in AOT. `AssertionError` only occurs in debug. Don't use `assert` for runtime validation — use `if`/`throw ArgumentError`.
- **Uncaught async errors crash or are silent**: unawaited Future errors are "uncaught in the zone." In Flutter: red screen in debug. In CLI: may crash. Always `await` or `.catchError` or use `runZonedGuarded`.
- **Don't catch `Error`s**: `StateError`, `RangeError` are bugs — catching them hides the bug. Let them crash so you find and fix the root cause. Catch `Exception`s (recoverable).
- **`on Exception catch (e)` catches all Exception subtypes**: but not `Error`s (which extend `Error`, not `Exception`). `catch (e, stack)` catches everything.
- **`NoSuchMethodError` from `dynamic`**: calling a non-existent method on `dynamic` throws at runtime (no compile check). Use typed variables to catch at compile time.
- **`ConcurrentModificationError`**: modifying a collection while iterating it (e.g., `list.remove` inside `for (var x in list)`) throws. Collect items to remove, then remove after the loop.

## 🧠 Spot the Bug

A developer wraps their entire request handler in a broad catch to "handle all errors gracefully":

::code-wrapper{language="dart"}
```dart
Future<Response> handle(Request req) async {
  try {
    final body = jsonDecode(await req.readAsString());
    final user = parseUser(body);  // has a null-deref bug, throws StateError
    return Response.ok(jsonEncode(user));
  } catch (e) {
    return Response(500, body: 'Internal error');
  }
}
```
::

Why is this dangerous?

<details>
<summary>Answer</summary>

`catch (e)` catches **everything** — including the `StateError` from the bug in `parseUser`. The error is swallowed, and the client gets a generic `500 Internal error` response. The developer never sees:

- The exception type (`StateError`).
- The error message (what was null? what state was wrong?).
- The stack trace (which line in `parseUser` threw).

The bug is invisible in production. The 500 response tells the developer nothing. This pattern is a debugging nightmare — every bug becomes an opaque 500.

The fix — catch specific recoverable exceptions, let bugs propagate (or catch broadly ONLY with logging + rethrow):

```dart
Future<Response> handle(Request req) async {
  try {
    final body = jsonDecode(await req.readAsString());
    final user = parseUser(body);
    return Response.ok(jsonEncode(user));
  } on FormatException catch (e) {
    // Recoverable: bad JSON → 400 to the client.
    return Response(400, body: 'Invalid JSON: ${e.message}');
  } on ValidationException catch (e) {
    // Recoverable: bad input → 422 to the client.
    return Response(422, body: 'Validation error: ${e.field}: ${e.message}');
  }
  // StateError (bug in parseUser) propagates → crashes with a stack trace.
  // The developer sees the bug in logs, can fix it.
}

// If you MUST catch broadly (e.g., top-level middleware), log + rethrow:
Future<Response> withLogging(Request req) async {
  try {
    return await handle(req);
  } catch (e, stack) {
    logger.error('Unhandled: $e', stack);
    rethrow;  // or return 500 WITH the error logged
  }
}
```

</details>