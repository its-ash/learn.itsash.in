# 10 — Isolates & Concurrency

Dart is single-threaded. For CPU-heavy work (parsing, compression, image processing), use **isolates** — separate threads with their own memory heap.

## Why Isolates, not Threads?

Dart has no shared-memory threads (no `Thread` with locks). Instead, **isolates** are independent workers:
- Each isolate has its own memory heap (no shared mutable state).
- Communication is via message passing (ports).
- No data races (no shared memory to race on).

This is the actor model — isolates can't access each other's memory, only send messages.

## `Isolate.run` (Dart 2.19+, recommended)

`Isolate.run` runs a function in a new isolate and returns the result:

::code-wrapper{language="dart"}
```dart
Future<int> heavyComputation() async {
	return Isolate.run(() {
		var sum = 0;
		for (var i = 0; i < 1000000000; i++) sum += i;
		return sum;
	});
}

void main() async {
	var result = await heavyComputation();
	print(result);
}
```

The function runs in a separate isolate (on another thread/core), not blocking the main isolate. The result is sent back. Simple for one-shot computations.

### Arguments

::code-wrapper{language="dart"}
```dart
final result = await Isolate.run(() => processFile(filePath));
```

The function closure can capture variables (they're copied to the new isolate — deep copy, since no shared memory).

## `compute` (Flutter)

Flutter provides `compute` (a wrapper around `Isolate.run`):

::code-wrapper{language="dart"}
```dart
final result = await compute(heavyFunction, input);
```

`compute(fn, input)` runs `fn(input)` in a separate isolate. Use in Flutter for offloading heavy work from the UI thread.

## `Isolate.spawn` (low-level)

For long-running isolates (event-driven, bidirectional communication):

::code-wrapper{language="dart"}
```dart
import 'dart:isolate';

void worker(SendPort sendPort) {
	sendPort.send('Worker started');
	// ... do work, send messages back
}

void main() async {
	final receivePort = ReceivePort();
	await Isolate.spawn(worker, receivePort.sendPort);

	receivePort.listen((message) {
		print('Main received: $message');
	});
}
```

- `ReceivePort` — receives messages in this isolate.
- `SendPort` — sends messages to another isolate (passed via `spawn`).
- `Isolate.spawn(entry, message)` — starts an isolate, calls `entry(message)`.

### Bidirectional communication

::code-wrapper{language="dart"}
```dart
void worker(SendPort mainSendPort) {
	final receivePort = ReceivePort();
	mainSendPort.send(receivePort.sendPort);   // send our port to main

	receivePort.listen((message) {
		mainSendPort.send('Processed: $message');
	});
}

void main() async {
	final mainReceivePort = ReceivePort();
	await Isolate.spawn(worker, mainReceivePort.sendPort);

	final workerSendPort = await mainReceivePort.first as SendPort;

	final responsePort = ReceivePort();
	workerSendPort.send('hello');
	// ... use responsePort for replies
}
```

This is more verbose — use `Isolate.run` for one-shot work.

## What Can Be Sent Between Isolates?

Messages are **copied** (deep copy, since no shared memory). Most objects can be sent:
- Primitives (`int`, `double`, `String`, `bool`, `null`).
- `List`, `Map`, `Set` (of sendable values).
- `SendPort`/`ReceivePort`.
- Functions (closures) — the function and its captured variables (must be sendable).
- Custom objects (with some caveats — closures, `SendPort`s, and transferable data).

**Can't be sent**:
- Objects with native resources (file handles, sockets).
- Some platform-specific objects.

## Transferable TypedData (zero-copy)

For large `TypedData` (e.g., `Uint8List`), use `TransferableTypedData` for zero-copy transfer (instead of a deep copy):

::code-wrapper{language="dart"}
```dart
final transferable = TransferableTypedData.fromList([largeUint8List]);
sendPort.send(transferable);
// Receiver:
final data = transferable.materialize();
```

This avoids copying large byte buffers — much faster for big data.

## When to Use Isolates

- **CPU-heavy work** (>16ms — would drop a frame): parsing large JSON, compression, image processing, sorting/searching large datasets.
- **Don't use for I/O**: `Future`/`await` is sufficient for I/O (the event loop handles concurrency). Isolates are for CPU work.
- **Don't use for small tasks**: spawning an isolate has overhead (~50ms). For tiny tasks, the overhead exceeds the benefit.

## Error Handling

::code-wrapper{language="dart"}
```dart
try {
	final result = await Isolate.run(() {
		throw Exception('Worker error');
	});
} on Exception catch (e) {
	print('Caught: $e');   // errors propagate back
}
```

Errors in `Isolate.run` propagate to the caller. For `Isolate.spawn`, set up error handling via the `onError` port or `errorsAreFatal` parameter.

## `Isolate.current`

::code-wrapper{language="dart"}
```dart
final id = Isolate.current.debugName;
print('Running in $id');
```

Each isolate has a debug name (for debugging/profiling).

## Limitations

- **Web**: isolates don't exist on the web (Dart compiles to JS, which is single-threaded with Web Workers as a partial analog). `Isolate.run` throws on web, or falls back to running on the main thread (depending on the setup).
- **Spawn overhead**: ~50ms to spawn an isolate. For many small tasks, a worker pool is better (spawn once, send many messages).
- **No shared memory**: isolates can't share mutable state. All communication is message passing (copied). This is a feature (no races) but requires a different design.

## Worker Pools

For many tasks, spawn a few isolates once and reuse them:

::code-wrapper{language="dart"}
```dart
class WorkerPool {
	final List<Isolate> _workers = [];
	final List<SendPort> _ports = [];

	Future<void> spawn(int count) async {
		for (var i = 0; i < count; i++) {
			final receivePort = ReceivePort();
			final isolate = await Isolate.spawn(_workerEntry, receivePort.sendPort);
			_workers.add(isolate);
			_ports.add(await receivePort.first as SendPort);
		}
	}
	// ... send tasks to workers, collect results
}
```

Or use a package like `worker_manager` or `pool` for managed worker pools.

## 💡 Tips & Tricks

- **Idiom**: use `Isolate.run` (or `compute` in Flutter) for one-shot CPU-heavy work — `await Isolate.run(() => heavyTask())` offloads to a separate isolate, not blocking the main/UI thread. Simpler than `Isolate.spawn` for one-shot work.
- **Idiom**: don't use isolates for I/O — `Future`/`await` is sufficient (the event loop handles I/O concurrency). Isolates are for *CPU-heavy* work (parsing, compression, image processing). Using isolates for I/O adds overhead without benefit.
- **Idiom**: use `TransferableTypedData` for large byte buffers — it transfers (zero-copy) instead of copying. For a large `Uint8List` between isolates, this is much faster than the default deep copy.
- **Idiom**: use a worker pool for many small tasks — spawning an isolate has ~50ms overhead. For many tasks, spawn a few isolates once and reuse them (send messages). Use `worker_manager` or `pool` packages for managed pools.
- **Idiom**: keep isolate functions top-level or static — closures sent to isolates must be sendable. Top-level functions and static methods are safely sendable. Avoid sending closures that capture non-sendable objects.

## ⚠️ Edge Cases & Gotchas

- **Spawn overhead (~50ms)**: for small tasks, the overhead exceeds the benefit. Use a worker pool (spawn once, reuse) for many small tasks.
- **Messages are deep-copied**: sending a large object to an isolate copies it (memory + time). Use `TransferableTypedData` for large byte buffers (zero-copy).
- **Isolates don't share memory**: no shared mutable state. All communication is message passing. This is a feature (no races) but requires a different design (pass data, not share).
- **Web doesn't support isolates**: Dart on the web (JS) is single-threaded. `Isolate.run` may throw or run on the main thread. Don't rely on isolates for web builds — use Web Workers (via JS interop) if needed.
- **Closures must capture sendable values**: a function sent to an isolate can capture variables, but they must be sendable (copied). Capturing a non-sendable object (e.g., a file handle) fails.
- **Errors propagate from `Isolate.run`**: a thrown error in `Isolate.run` is caught by the `await`er. For `Isolate.spawn`, handle errors via `onError` port or `errorsAreFatal`.
- **Isolates are not threads**: they're independent workers with their own heap. No locks, no shared memory. The actor model — message passing only.
- **`ReceivePort` must be closed**: a `ReceivePort` keeps the isolate alive. Close it (`receivePort.close()`) when done, or the isolate won't exit.
- **`Isolate.kill()`**: forcibly kills an isolate. Use for cleanup, but it doesn't run finalizers. Prefer graceful shutdown (send a "stop" message, close ports).
- **Named isolates**: `Isolate.spawn(entry, msg, debugName: 'worker-1')` names the isolate for debugging/profiling. Helps identify in DevTools.

## 🧠 Spot the Bug

A developer offloads file I/O to an isolate, but it's slower than doing it on the main thread:

::code-wrapper{language="dart"}
```dart
Future<String> readFile(String path) async {
	return Isolate.run(() => File(path).readAsString());
}
```
::

What's wrong?

<details>
<summary>Answer</summary>

File I/O is **I/O-bound**, not CPU-bound. `File.readAsString()` is async — it yields to the event loop while waiting for the disk. Offloading it to an isolate adds ~50ms spawn overhead (and a message copy for the result) without benefit — the main isolate could have awaited the I/O directly, with the event loop handling concurrency.

The fix — do I/O on the main isolate with `await`:

```dart
Future<String> readFile(String path) async {
	return File(path).readAsString();   // already async, event loop handles it
}
```

Isolates are for **CPU-heavy work** (parsing, compression, image processing) that would block the main isolate's event loop. For I/O (file, network, timers), `Future`/`await` is sufficient — the event loop handles concurrency while the I/O is in progress.

Use isolates when:
```dart
// CPU-heavy: parsing a huge JSON string
final data = await Isolate.run(() => jsonDecode(hugeJsonString));
```

Don't use isolates when:
```dart
// I/O-bound: reading a file (async, event loop handles it)
final content = await File(path).readAsString();
```

**The lesson**: isolates are for CPU-heavy work (blocks the event loop), not I/O (which is async and handled by the event loop). Offloading I/O to an isolate adds spawn overhead + copy overhead without benefit.

</details>

## Summary

You understand isolates (no shared memory, message passing), `Isolate.run` (one-shot CPU work), `compute` (Flutter wrapper), `Isolate.spawn` + `ReceivePort`/`SendPort` (long-running, bidirectional), sendable messages (deep-copied, `TransferableTypedData` for zero-copy), when to use isolates (CPU-heavy, not I/O), worker pools, error handling, and web limitations — with the I/O-doesn't-need-isolates and spawn-overhead traps avoided. Next: error handling and exceptions.