---
title: "Dart — Isolates, Actor Model & Zero-Copy Transfer"
description: "Deep-dive into Dart's isolate-based concurrency model, Isolate.run patterns, bidirectional message passing, TransferableTypedData zero-copy, worker pool architecture, and web platform limitations. Code-first engineering reference."
---

# Dart — Isolates, Actor Model & Zero-Copy Transfer

## The Actor Model — No Shared Memory

::code-wrapper{language="dart"}
```dart
// Dart has NO shared-memory threads. Isolates are independent workers:
// - Each isolate has its own memory heap (no shared mutable state).
// - Communication is via message passing (ports).
// - No data races — no locks, no mutexes, no atomics.
//
// This is the Erlang/Akka actor model, not the Java/C++ threading model.

// ── Isolate.run: one-shot computation in a separate isolate ──
// Spawns an isolate, runs the function, sends the result back, kills the isolate.
// The closure and its captured values are DEEP-COPIED to the new isolate.

Future<int> heavySum() async {
  return Isolate.run(() {
    // This runs on a separate OS thread with its own heap.
    // No access to the main isolate's memory — everything is copied.
    var sum = 0;
    for (var i = 0; i < 1000000000; i++) sum += i;
    return sum;  // result is deep-copied back to the main isolate
  });
}

// Capturing values — they're COPIED (deep copy), not shared:
Future<void> processFile(String path) async {
  final result = await Isolate.run(() {
    // `path` was copied — modifying it here doesn't affect the original.
    final content = File(path).readAsStringSync();
    return content.toUpperCase();
  });
  print(result);
}
```
::

## `Isolate.run` vs `Isolate.spawn`

::code-wrapper{language="dart"}
```dart
import 'dart:isolate';

// ── Isolate.run: one-shot, fire-and-forget, returns a Future. ──
// Best for: one-off CPU-heavy work (JSON parsing, compression, sorting).
// The isolate is automatically killed after the function returns.

Future<Map<String, dynamic>> parseHugeJson(String json) async {
  return Isolate.run(() => jsonDecode(json) as Map<String, dynamic>);
}

// ── Isolate.spawn: long-running, bidirectional communication. ──
// Best for: worker pools, event-driven workers, persistent background tasks.
// You manage the lifecycle (spawn, communicate, kill).

void workerEntryPoint(SendPort mainSendPort) {
  // Set up a receive port for messages from the main isolate.
  final receivePort = ReceivePort();
  mainSendPort.send(receivePort.sendPort);  // send our port back

  receivePort.listen((message) {
    // Process messages from the main isolate.
    final result = _process(message);
    mainSendPort.send(result);  // send result back
  });
}

Future<void> main() async {
  final mainReceivePort = ReceivePort();
  await Isolate.spawn(workerEntryPoint, mainReceivePort.sendPort);

  // Get the worker's send port (first message from the worker).
  final workerSendPort = await mainReceivePort.first as SendPort;

  // Now we can send messages to the worker:
  final responsePort = ReceivePort();
  workerSendPort.send('task-1');
  // ... manage communication
}
```
::

## Bidirectional Communication — Production Pattern

::code-wrapper{language="dart"}
```dart
import 'dart:isolate';
import 'dart:async';

// A reusable worker that accepts tasks and returns results.
class IsolateWorker {
  late final Isolate _isolate;
  late final SendPort _sendPort;
  final _receivePort = ReceivePort();
  final _pending = <int, Completer>{};
  int _taskId = 0;

  Future<void> start() async {
    final ready = ReceivePort();
    _isolate = await Isolate.spawn(
      _entry,
      (ready.sendPort, _receivePort.sendPort),
      debugName: 'isolate-worker',
    );
    _sendPort = await ready.first as SendPort;

    // Route responses to the correct completer.
    _receivePort.listen((message) {
      if (message is _Response) {
        final completer = _pending.remove(message.taskId);
        if (message.error != null) {
          completer?.completeError(message.error!);
        } else {
          completer?.complete(message.result);
        }
      }
    });
  }

  Future<T> execute<T>(String task, dynamic payload) {
    final id = _taskId++;
    final completer = Completer<T>();
    _pending[id] = completer;
    _sendPort.send(_Request(id, task, payload));
    return completer.future;
  }

  void dispose() {
    _isolate.kill(priority: Isolate.immediate);
    _receivePort.close();
  }

  static void _entry((SendPort, SendPort) ports) {
    final (readyPort, mainPort) = ports;
    final receivePort = ReceivePort();
    readyPort.send(receivePort.sendPort);

    receivePort.listen((message) {
      if (message is _Request) {
        try {
          final result = _dispatchTask(message.task, message.payload);
          mainPort.send(_Response(message.taskId, result, null));
        } catch (e) {
          mainPort.send(_Response(message.taskId, null, e.toString()));
        }
      }
    });
  }

  static dynamic _dispatchTask(String task, dynamic payload) {
    return switch (task) {
      'sort' => (payload as List).cast<int>()..sort(),
      'parse' => jsonDecode(payload as String),
      'hash' => payload.hashCode,  // placeholder for real work
      _ => throw UnimplementedError('Unknown task: $task'),
    };
  }
}

class _Request {
  final int taskId;
  final String task;
  final dynamic payload;
  const _Request(this.taskId, this.task, this.payload);
}

class _Response {
  final int taskId;
  final dynamic result;
  final String? error;
  const _Response(this.taskId, this.result, this.error);
}
```
::

## TransferableTypedData — Zero-Copy Transfer

::code-wrapper{language="dart"}
```dart
import 'dart:isolate';
import 'dart:typed_data';

// By default, messages between isolates are DEEP-COPIED (full serialization).
// For large byte buffers (Uint8List), this is O(n) in memory and time.
// TransferableTypedData transfers ownership — zero copy, O(1).

// ❌ Anti-pattern: sending a large Uint8List directly — it's deep-copied.
Future<Uint8List> processImageBad(Uint8List pixels) async {
  return Isolate.run(() {
    // `pixels` was deep-copied to this isolate — 2x memory usage.
    return _transformPixels(pixels);
  });
}

// ✓ Correct: TransferableTypedData — zero-copy transfer.
Future<Uint8List> processImageGood(Uint8List pixels) async {
  // Wrap for transfer to the isolate:
  final transferable = TransferableTypedData.fromList([pixels]);
  final result = await Isolate.run(() {
    // Materialize in the worker — the data is moved, not copied.
    final data = transferable.materialize().asUint8List();
    return _transformPixels(data);
  });
  // The result is copied back (small result, acceptable).
  // For large results, wrap in TransferableTypedData again.
  return result;
}

Uint8List _transformPixels(Uint8List pixels) {
  // ... image processing
  return pixels;
}
```
::

## Worker Pool — Reusing Isolates

::code-wrapper{language="dart"}
```dart
import 'dart:isolate';
import 'dart:async';

// Spawning an isolate costs ~50ms. For many small tasks, spawn once and reuse.
class WorkerPool {
  final int _size;
  final List<_Worker> _workers = [];
  final _idle = <_Worker>[];
  final _queue = <_Task>[];

  WorkerPool(this._size);

  Future<void> start() async {
    for (var i = 0; i < _size; i++) {
      final worker = await _Worker.spawn('worker-$i');
      _workers.add(worker);
      _idle.add(worker);
    }
    _processQueue();
  }

  Future<T> submit<T>(dynamic Function() task) {
    final completer = Completer<T>();
    _queue.add(_Task(task, completer));
    _processQueue();
    return completer.future;
  }

  void _processQueue() {
    while (_idle.isNotEmpty && _queue.isNotEmpty) {
      final worker = _idle.removeLast();
      final task = _queue.removeAt(0);
      worker.execute(task).then((_) => _idle.add(worker));
    }
  }

  void dispose() {
    for (var w in _workers) w.dispose();
  }
}

class _Task {
  final dynamic Function() fn;
  final Completer completer;
  _Task(this.fn, this.completer);
}

class _Worker {
  final Isolate isolate;
  final SendPort sendPort;
  final ReceivePort receivePort;

  _Worker(this.isolate, this.sendPort, this.receivePort);

  static Future<_Worker> spawn(String debugName) async {
    final receivePort = ReceivePort();
    final isolate = await Isolate.spawn(
      _entry,
      receivePort.sendPort,
      debugName: debugName,
    );
    final sendPort = await receivePort.first as SendPort;
    return _Worker(isolate, sendPort, receivePort);
  }

  Future<dynamic> execute(_Task task) async {
    sendPort.send(task.fn);
    final result = await receivePort.first;
    task.completer.complete(result);
    return result;
  }

  void dispose() {
    isolate.kill();
    receivePort.close();
  }

  static void _entry(SendPort mainPort) {
    final receivePort = ReceivePort();
    mainPort.send(receivePort.sendPort);
    receivePort.listen((fn) {
      final result = (fn as dynamic Function())();
      mainPort.send(result);
    });
  }
}
```
::

## When to Use Isolates (and When Not To)

::code-wrapper{language="dart"}
```dart
// ── USE isolates for: CPU-heavy work that blocks the event loop ──
// If a computation takes >16ms (one frame at 60fps), it drops frames.
// Parsing large JSON, compression, image processing, sorting large datasets.

// ✓ CPU-heavy: parse a 10MB JSON string.
final data = await Isolate.run(() => jsonDecode(hugeJsonString));

// ✓ CPU-heavy: compress an image.
final compressed = await Isolate.run(() => compressImage(rawPixels));

// ── DON'T use isolates for: I/O-bound work ──
// I/O (file, network, timers) is async — the event loop handles concurrency.
// Offloading I/O to an isolate adds ~50ms spawn overhead + copy overhead.

// ❌ I/O-bound: reading a file (async, event loop handles it).
final content = await File(path).readAsString();  // ✓ on main isolate

// ❌ I/O-bound: HTTP request (async, event loop handles it).
final response = await http.get(Uri.parse(url));  // ✓ on main isolate

// ── Rule of thumb: ──
// - If it's CPU-bound and takes >16ms → Isolate.run.
// - If it's I/O-bound → await on the main isolate (event loop handles it).
// - If it's many small CPU tasks → worker pool (reuse isolates).
```
::

## 💡 Tips & Tricks

- **Performance**: `TransferableTypedData` for large byte buffers between isolates — zero-copy transfer (O(1)) instead of deep copy (O(n)). Use for images, audio buffers, large arrays. The original buffer is invalidated after transfer.
- **Idiom**: `Isolate.run` for one-shot CPU-heavy work — `await Isolate.run(() => heavyTask())` offloads to a separate isolate. Simpler than `Isolate.spawn` for fire-and-forget. The isolate is auto-killed after the function returns.
- **Idiom**: worker pool for many small tasks — spawning an isolate costs ~50ms. For many tasks, spawn N isolates once and reuse (send messages). Use `package:worker_manager` or build a pool.
- **Idiom**: keep isolate entry functions top-level or static — closures sent to isolates must be sendable (copied). Top-level functions and static methods are safely sendable. Avoid capturing non-sendable objects.
- **Idiom**: `debugName` for isolates — `Isolate.spawn(entry, msg, debugName: 'image-worker')` names the isolate for DevTools. Helps identify isolates in the profiler/debugger.

## ⚠️ Edge Cases & Gotchas

- **Spawn overhead (~50ms)**: for small tasks, the overhead exceeds the benefit. Use a worker pool (spawn once, reuse) for many small tasks. `Isolate.run` is for one-shot heavy work.
- **Messages are deep-copied**: sending a large object to an isolate copies it (memory + time). Use `TransferableTypedData` for large byte buffers (zero-copy). After transfer, the original is invalidated.
- **Isolates don't share memory**: no shared mutable state. All communication is message passing. This is a feature (no races) but requires a different design (pass data, not share).
- **Web doesn't support isolates**: `Isolate.run` throws or runs on the main thread on web. The web is single-threaded. Use Web Workers (via JS interop) for parallelism on web.
- **Closures must capture sendable values**: a function sent to an isolate can capture variables, but they must be sendable (copied). Capturing a non-sendable object (e.g., a file handle) fails.
- **Errors propagate from `Isolate.run`**: a thrown error in `Isolate.run` is caught by the `await`er. For `Isolate.spawn`, handle errors via `onError` port or `errorsAreFatal`.
- **`ReceivePort` must be closed**: a `ReceivePort` keeps the isolate alive. Close it (`receivePort.close()`) when done, or the isolate won't exit (resource leak).
- **`Isolate.kill()` doesn't run finalizers**: forcibly kills the isolate. Use for cleanup, but prefer graceful shutdown (send a "stop" message, close ports) for clean resource release.
- **`Isolate.run` copies the closure and captures**: the function and its captured variables are deep-copied to the new isolate. Mutations in the isolate don't affect the original.
- **No `dart:mirrors` in isolates (AOT)**: runtime reflection is unsupported in AOT-compiled isolates. Use code generation instead.

## 🧠 Spot the Bug

A developer offloads file reading to an isolate, but it's slower than reading on the main thread:

::code-wrapper{language="dart"}
```dart
Future<String> readFile(String path) async {
  return Isolate.run(() => File(path).readAsStringSync());
}
```
::

Why is this slower?

<details>
<summary>Answer</summary>

File reading is **I/O-bound**, not CPU-bound. `File.readAsStringSync()` blocks the thread waiting for the disk — but `File.readAsString()` (async) yields to the event loop while waiting, allowing other work to proceed.

Offloading I/O to an isolate adds:
1. **~50ms spawn overhead** (creating the isolate).
2. **Message copy overhead** (the result string is deep-copied back to the main isolate).
3. **No concurrency benefit** — the main isolate could have awaited the I/O directly.

The fix — do async I/O on the main isolate:

```dart
Future<String> readFile(String path) async {
  return File(path).readAsString();  // async, event loop handles concurrency
}
```

Use isolates for **CPU-heavy** work (parsing, compression, image processing) that blocks the event loop. For I/O, `await` on the main isolate — the event loop handles concurrency while the I/O is in progress.

```dart
// ✓ Correct isolate use — CPU-heavy JSON parsing:
final data = await Isolate.run(() => jsonDecode(hugeJsonString));
```

</details>