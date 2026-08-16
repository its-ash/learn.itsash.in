# 09 — Asynchronous Programming (`Future`, `async`/`await`)

Dart is single-threaded with an event loop. Asynchronous code uses `Future` (one-shot) and `Stream` (multi-shot), with `async`/`await` syntax.

## The Event Loop

Dart has a single thread of execution with an event loop. When an async operation starts (I/O, timer), Dart registers a callback and continues. When the operation completes, the callback runs on the event loop. This is how Dart stays responsive (no thread blocking).

For CPU-heavy work, use **isolates** (separate threads with their own memory — chapter 10).

## `Future`

A `Future` represents a value (or error) that will be available later:

::code-wrapper{language="dart"}
```dart
Future<String> fetchUser() {
	return Future.delayed(Duration(seconds: 1), () => 'Alice');
}

void main() {
	fetchUser().then((user) {
		print('User: $user');
	}).catchError((error) {
		print('Error: $error');
	});
	print('Fetching...');   // runs first (async)
}
```

### `Future` constructors

- `Future.value(x)` — completed with `x`.
- `Future.error(e)` — completed with an error.
- `Future.delayed(duration, fn)` — completes after a delay with `fn()`'s result.
- `Future.wait([f1, f2, ...])` — runs futures in parallel, completes when all done.
- `Future.any([f1, f2, ...])` — completes with the first to finish.

## `async` / `await`

`async`/`await` is syntactic sugar over `Future` — linear-looking async code:

::code-wrapper{language="dart"}
```dart
Future<String> fetchUser() async {
	await Future.delayed(Duration(seconds: 1));
	return 'Alice';
}

Future<void> main() async {
	print('Fetching...');
	var user = await fetchUser();   // waits (non-blocking)
	print('User: $user');
}
```

- `async` marks a function as asynchronous; it returns a `Future`.
- `await` waits for a `Future` to complete, unwrapping its value.
- An `async` function's return value is wrapped in a `Future` (`Future<T>` for `T` return, `Future<void>` for `void`).

### `await` in a loop

::code-wrapper{language="dart"}
```dart
// Sequential (each waits for the previous)
for (var url in urls) {
	var data = await fetch(url);
	print(data);
}

// Parallel (all at once, wait for all)
var results = await Future.wait(urls.map(fetch));
```

`await` in a loop is sequential (one at a time). For parallel, use `Future.wait` on a list of futures.

## Error handling

::code-wrapper{language="dart"}
```dart
Future<void> main() async {
	try {
		var user = await fetchUser();
		print(user);
	} on HttpException catch (e) {
		print('HTTP error: $e');
	} catch (e) {
		print('Error: $e');
	} finally {
		print('Done');
	}
}
```

`try`/`catch` works with `await` — the thrown error is caught. Use `on SpecificException catch (e)` for typed catches.

### `Future.catchError` vs `try`/`catch`

Prefer `try`/`catch` with `await` (clearer). `catchError` is for `.then()` chains:

::code-wrapper{language="dart"}
```dart
fetchUser().then((u) => print(u)).catchError((e) => print(e));
```

## `Completer`

A `Completer` lets you manually complete a `Future` (bridge callback-based APIs to `Future`):

::code-wrapper{language="dart"}
```dart
Future<String> fromCallback() {
	var completer = Completer<String>();
	someCallbackApi((result) => completer.complete(result));
	return completer.future;
}
```

Use when a library gives you a callback but you want a `Future`. Rare in modern Dart (most APIs are `Future`-based).

## `Stream`

A `Stream` is a sequence of async values (like a `Future` that emits multiple times):

::code-wrapper{language="dart"}
```dart
Stream<int> count(int n) async* {
	for (var i = 1; i <= n; i++) {
		await Future.delayed(Duration(seconds: 1));
		yield i;
	}
}

void main() async {
	await for (var i in count(3)) {
		print(i);   // 1, 2, 3 (one per second)
	}
}
```

### Stream methods

::code-wrapper{language="dart"}
```dart
stream.listen((data) { ... }, onError: (e) { ... }, onDone: () { ... });

stream.map((e) => e * 2).where((e) => e > 2).listen(print);

stream.first;   // Future (first element)
stream.toList();   // Future<List> (all elements)
stream.forEach((e) => print(e));   // Future (iterates all)
```

### `await for`

::code-wrapper{language="dart"}
```dart
await for (var event in stream) {
	print(event);
	if (event == 'done') break;   // exit early
}
```

`await for` is like `for-in` for streams — awaits each element. The loop exits when the stream closes (or `break`).

### `async*` generators

`async*` functions return a `Stream`; `yield` emits a value, `yield*` yields all elements of another stream:

::code-wrapper{language="dart"}
```dart
Stream<int> gen() async* {
	yield 1;
	yield 2;
	yield* Stream.fromIterable([3, 4]);
}
```

### Single-subscription vs broadcast streams

- **Single-subscription** (default) — one listener; listening twice throws. Most streams are this.
- **Broadcast** — multiple listeners. Use `.asBroadcastStream()` or `StreamController.broadcast()`.

::code-wrapper{language="dart"}
```dart
var broadcast = stream.asBroadcastStream();
broadcast.listen(print);
broadcast.listen(print);   // ✓ both listeners
```

## `StreamController`

A `StreamController` lets you manually add events to a stream:

::code-wrapper{language="dart"}
```dart
var controller = StreamController<int>();
controller.stream.listen(print);
controller.add(1);   // prints 1
controller.add(2);   // prints 2
controller.close();  // closes the stream
```

Use for creating custom streams (event sources, bridges to callback APIs).

## `Future` vs `Stream`

- **`Future<T>`** — one value, eventually (or an error). Like a Promise.
- **Stream<T>`** — multiple values over time (or an error). Like an Observable/AsyncIterator.

Use `Future` for one-shot operations (HTTP request, file read). Use `Stream` for ongoing sequences (clicks, WebSocket messages, sensor data).

## Zones

Zones are an advanced feature — an execution context that intercepts async errors, timers, etc. Rarely used directly; `runZonedGuarded` catches uncaught async errors:

::code-wrapper{language="dart"}
```dart
runZonedGuarded(() {
	// async code
}, (error, stack) {
	print('Uncaught: $error');
});
```

## 💡 Tips & Tricks

- **Idiom**: use `async`/`await` (not `.then()` chains) — linear, readable async code. `await` makes the code look synchronous while staying non-blocking. Use `.then()` only for simple one-step chains.
- **Idiom**: use `Future.wait` for parallel async operations — `await Future.wait([fetchA(), fetchB()])` runs both in parallel and waits for all. Much faster than `await fetchA(); await fetchB();` (sequential).
- **Idiom**: use `try`/`catch` with `await` for error handling — `try { await f() } on SpecificError catch (e) { ... }`. Clearer than `.catchError()`. Catch specific exceptions first.
- **Idiom**: use `Stream` for multi-shot async sequences — clicks, WebSocket messages, sensor data. Use `Future` for one-shot (HTTP). `await for (var x in stream)` is the clean way to consume a stream sequentially.
- **Idiom**: use `async*` + `yield` for lazy stream generation — `Stream<int> gen() async* { for (...) yield i; }` produces values on demand. Use for sequences that are produced lazily or over time.

## ⚠️ Edge Cases & Gotchas

- **`await` in a loop is sequential**: `for (var x in items) await fetch(x)` runs one at a time. Use `Future.wait(items.map(fetch))` for parallel.
- **`async` function returns `Future`**: `int f() async { return 5; }` returns `Future<int>`, not `int`. The `async` wraps the return.
- **`async` functions can't return `void` meaningfully**: `void f() async { }` is allowed but the caller can't await or catch errors. Use `Future<void> f() async { }` for awaitable.
- **Forgetting `await`**: `fetchUser();` (no `await`) starts the future but doesn't wait — the result is lost (unawaited future). Use `unawaited(future)` to suppress the lint if intentional.
- **Unawaited futures' errors are uncaught**: `fetchUser()` (no `await`) — if it throws, the error is "uncaught in the zone" (may crash or be silently swallowed). Always `await` or handle.
- **Single-subscription streams allow one listener**: `stream.listen(...)` twice throws `StateError`. Use `.asBroadcastStream()` for multiple listeners (but broadcast streams can't be paused/buffered like single-subscription).
- **`Stream.toList()` waits for close**: `stream.toList()` returns a `Future<List>` that completes when the stream closes. For an infinite stream, it never completes.
- **`await for` blocks until the stream closes**: `await for (var x in stream) { ... }` doesn't exit until the stream closes (or `break`). For an infinite stream, use `.listen()` instead.
- **`Completer` for callback-based APIs**: when a library gives you a callback, use a `Completer` to bridge to a `Future`. Rare in modern Dart (most APIs are `Future`-based).
- **`Future.wait` preserves order**: `Future.wait([a, b])` returns `[resultA, resultB]` in the same order as the input, regardless of which completes first.

## 🧠 Spot the Bug

A developer fetches three URLs sequentially, making the page slow:

::code-wrapper{language="dart"}
```dart
Future<void> main() async {
	var a = await fetch('url-a');
	var b = await fetch('url-b');
	var c = await fetch('url-c');
	print([a, b, c]);
}
```
::

What's wrong and how to fix it?

<details>
<summary>Answer</summary>

The three `fetch` calls are sequential — each waits for the previous to complete. If each takes 1 second, the total is 3 seconds. The fetches are independent (no dependency between them), so they should run in parallel.

The fix — use `Future.wait` to run them in parallel:

```dart
Future<void> main() async {
	var results = await Future.wait([
		fetch('url-a'),
		fetch('url-b'),
		fetch('url-c'),
	]);
	print(results);   // [a, b, c] in input order
}
```

Now all three fetches start immediately and run concurrently. The total time is ~1 second (the slowest one), not 3 seconds.

If the fetches depend on each other (b needs a's result), keep them sequential. But for independent operations, `Future.wait` is much faster.

**The lesson**: sequential `await`s are sequential — each waits for the previous. For independent async operations, use `Future.wait([...])` to run them in parallel. The result order matches the input order, regardless of completion order.

</details>

## Summary

You can use `Future` (constructors, `.then`, `.catchError`), `async`/`await` (linear async, error handling with `try`/`catch`, `Future.wait` for parallel, `await` in loops), `Stream` (async sequences, `.listen`, `await for`, `async*`/`yield`, single-subscription vs broadcast, `StreamController`), `Completer` for callback bridges, and `runZonedGuarded` for uncaught errors — with the sequential-await and unawaited-future traps avoided. Next: isolates and concurrency.