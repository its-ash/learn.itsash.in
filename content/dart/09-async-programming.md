---
title: "Dart — Async Internals, Futures & Stream Pipelines"
description: "Deep-dive into Dart's event loop, Future composition patterns, Stream transformation pipelines, async generator semantics, Zone-based error isolation, and concurrency pitfalls. Code-first engineering reference."
---

# Dart — Async Internals, Futures & Stream Pipelines

## Event Loop — Microtask vs Event Queues

::code-wrapper{language="dart"}
```dart
// Dart's event loop has TWO queues:
// 1. Microtask queue — runs BEFORE event queue. For internal Dart bookkeeping.
//    Use Future.microtask() for "run ASAP, but after current sync code."
// 2. Event queue — I/O, timers, user events. Use Future() / Future.delayed().

void main() async {
  print('1 — sync');

  Future(() => print('4 — event queue (Future)'));
  Future.microtask(() => print('3 — microtask queue (runs before events)'));

  print('2 — sync (continues before any async)');

  await Future.delayed(Duration.zero, () => print('5 — delayed event'));

  // Order: 1, 2, 3, 4, 5
  // Microtasks always drain completely before any event queue item runs.
}

// ❌ Anti-pattern: using Future() for "run after current frame" in Flutter.
// Future() puts work on the event queue (next frame). For "after current build,"
// use WidgetsBinding.instance.addPostFrameCallback in Flutter, or
// scheduleMicrotask for "after current sync execution."
```
::

## Future Composition — Parallel vs Sequential

::code-wrapper{language="dart"}
```dart
// ── Sequential: each await blocks until the previous completes. ──
// Total time = sum of all durations. Use when operations depend on each other.
Future<void> sequential() async {
  var a = await fetch('url-a');  // 1s
  var b = await fetch('url-b');  // 1s — starts after a completes
  var c = await fetch('url-c');  // 1s — starts after b completes
  // Total: 3s
}

// ── Parallel: all futures start immediately, wait for all. ──
// Total time = max of all durations. Use for independent operations.
Future<void> parallel() async {
  var results = await Future.wait([
    fetch('url-a'),  // starts immediately
    fetch('url-b'),  // starts immediately
    fetch('url-c'),  // starts immediately
  ]);
  // Total: ~1s (the slowest one)
}

// ── Future.wait preserves input order, regardless of completion order. ──
Future<List<int>> getAll() async {
  return Future.wait([
    Future.delayed(Duration(seconds: 2), () => 1),  // completes last
    Future.delayed(Duration(seconds: 1), () => 2),  // completes first
  ]);
  // Returns [1, 2] — input order, NOT completion order.
}

// ── Future.wait with eagerError (default: true) ──
// If any future fails, Future.wait completes with that error immediately
// (doesn't wait for the rest). Set eagerError: false to wait for all.
Future<void> tolerant() async {
  try {
    await Future.wait(
      [fetch('a'), fetch('b'), fetch('c')],
      eagerError: false,  // don't short-circuit on first error
    );
  } catch (e) {
    // Catches the first error; other futures may still be running.
  }
}
```
::

### Concurrency with Bounded Parallelism

::code-wrapper{language="dart"}
```dart
// ❌ Anti-pattern: Future.wait on 10,000 items — opens 10,000 connections.
await Future.wait(urls.map(fetch));  // may exhaust connections/memory

// ✓ Correct: bounded concurrency with a pool (package:pool).
import 'package:pool/pool.dart';

final pool = Pool(10);  // max 10 concurrent
Future<List<String>> fetchAll(List<String> urls) {
  return Future.wait(urls.map((url) => pool.withResource(() => fetch(url))));
}
// Only 10 fetches run concurrently; the rest queue.

// Without a package — manual batching:
Future<List<String>> fetchBatched(List<String> urls, {int batchSize = 10}) async {
  final results = <String>[];
  for (var i = 0; i < urls.length; i += batchSize) {
    final batch = urls.skip(i).take(batchSize);
    results.addAll(await Future.wait(batch.map(fetch)));
  }
  return results;
}
```
::

## Stream Pipelines — Transformation & Backpressure

::code-wrapper{language="dart"}
```dart
// Streams are async sequences. Single-subscription (default) or broadcast.
// Transformations are lazy — they run only when listened to.

// ── Transform: map, where, take, skip, debounce ──
Stream<String> searchStream = searchTextController.stream
    .where((text) => text.length > 2)      // filter
    .debounceTime(Duration(milliseconds: 300))  // from rxdart
    .distinct()                            // skip consecutive duplicates
    .map((text) => text.trim())
    .asyncMap((text) => api.search(text));  // async transform (returns Future)

// ── asyncMap vs map ──
// map: sync transform — 1:1, immediate.
// asyncMap: async transform — awaits each Future, emits the result.
//           The stream pauses until the Future completes (backpressure).
Stream<int> asyncTransform(Stream<int> input) =>
    input.asyncMap((n) async {
      await Future.delayed(Duration(milliseconds: 100));
      return n * 2;
    });

// ── Handling errors in a stream ──
Stream<int> numbers = Stream.fromIterable([1, 2, 0, 4])
    .map((n) => 10 ~/ n)  // throws on n=0 (division by zero)
    .handleError((error) {
      // handleError catches errors mid-stream — the stream continues.
      print('Error: $error');
    });
// Emits: 10, 5, (error: IntegerDivisionByZeroException), 2

// ── Single-subscription vs broadcast ──
// Single-subscription (default): one listener. Listening twice throws.
// Broadcast: multiple listeners. No buffering (late listeners miss events).
var singleSub = Stream.fromIterable([1, 2, 3]);
singleSub.listen(print);
// singleSub.listen(print);  // ✗ StateError: stream has already been listened to

var broadcast = singleSub.asBroadcastStream();
broadcast.listen(print);
broadcast.listen(print);  // ✓ both listeners receive events
```
::

## StreamController — Building Custom Streams

::code-wrapper{language="dart"}
```dart
import 'dart:async';

// StreamController: manually add events to a stream.
// Use for bridging callback-based APIs to streams, or building event sources.

class EventBus {
  final _controller = StreamController<Event>.broadcast();  // multi-listener
  Stream<Event> get stream => _controller.stream;

  void emit(Event event) => _controller.add(event);
  void emitError(Object error) => _controller.addError(error);
  void close() => _controller.close();
}

// ❌ Anti-pattern: forgetting to close the controller → resource leak.
// Always close in dispose()/close() methods.

// ── Bridge: callback API to Stream ──
class MouseTracker {
  final _controller = StreamController<Offset>();
  Stream<Offset> get positions => _controller.stream;

  void onMouseMove(Offset pos) => _controller.add(pos);

  void dispose() {
    _controller.close();  // ← MUST close — listeners stop, resources freed
  }
}

// ── StreamController with pause/resume support ──
// Single-subscription controllers support pause/resume (broadcast don't buffer).
var controller = StreamController<int>(
  onPause: () => print('Paused'),   // called when listener pauses
  onResume: () => print('Resumed'), // called when listener resumes
  onCancel: () => print('Cancelled'), // called when listener cancels
  sync: true,  // synchronous delivery (no async scheduling — use carefully)
);
```
::

## `async*` Generators — Lazy Stream Production

::code-wrapper{language="dart"}
```dart
// async* returns a Stream. yield emits a value, yield* delegates to another stream.
// The generator suspends at each yield and resumes when the listener pulls.

Stream<int> intervalCounter(Duration interval, {int? max}) async* {
  var i = 0;
  while (max == null || i < max) {
    await Future.delayed(interval);
    yield i++;
  }
}

// Consuming with await for (sequential, blocks until stream closes):
void main() async {
  await for (final n in intervalCounter(Duration(seconds: 1), max: 3)) {
    print(n);  // 0 (after 1s), 1 (after 2s), 2 (after 3s)
  }
  print('Done');  // after 3s, when the stream closes
}

// Consuming with listen (non-blocking, can cancel):
void listenExample() {
  final sub = intervalCounter(Duration(seconds: 1)).listen(
    (n) => print(n),
    onError: (e) => print('Error: $e'),
    onDone: () => print('Done'),
  );

  // Cancel after 5 seconds:
  Future.delayed(Duration(seconds: 5), sub.cancel);
}

// yield* delegates to another stream (flattens):
Stream<int> merged() async* {
  yield* intervalCounter(Duration(seconds: 1), max: 3);  // 0, 1, 2
  yield* intervalCounter(Duration(seconds: 2), max: 2);  // 0, 1 (slower)
}
```
::

## Zones — Error Isolation & Context

::code-wrapper{language="dart"}
```dart
import 'dart:async';

// Zones provide an execution context that intercepts uncaught async errors,
// timers, and scheduleMicrotask calls. Use for top-level error boundaries.

void main() {
  // runZonedGuarded catches ALL uncaught async errors in the zone.
  runZonedGuarded(() async {
    // Any unawaited Future error here is caught by the zone handler.
    Future.error('async error');  // ← caught below, not crashed
    throw 'sync error';           // ← also caught
  }, (error, stack) {
    print('Uncaught: $error');
    print('Stack: $stack');
    // Log to Sentry, Crashlytics, etc.
  });

  // Without runZonedGuarded, unawaited Future errors crash the process
  // (or are silently swallowed in some configurations).
}

// ❌ Anti-pattern: unawaited futures with errors — "uncaught in the zone."
void bad() {
  Future.error('boom');  // starts, no one awaits → uncaught async error
  // In Flutter: crashes the app (red screen in debug).
  // In CLI: may crash or be silently swallowed.
}

// ✓ Correct: await, or explicitly mark as unawaited, and handle errors.
void good() {
  unawaited(
    Future.error('boom').catchError((e) => print('Handled: $e')),
  );
}
```
::

## 💡 Tips & Tricks

- **Idiom**: `Future.wait` for independent parallel operations — `await Future.wait([fetchA(), fetchB(), fetchC()])` runs all concurrently, total time = slowest. Result order matches input order, not completion order. Use `eagerError: false` to wait for all even on error.
- **Idiom**: use `asyncMap` (not `map`) for async stream transforms — `stream.asyncMap((x) => fetch(x))` awaits each Future, applying backpressure (the stream pauses until the Future completes). `map` is sync only.
- **Idiom**: `runZonedGuarded` for top-level error boundaries — catches all uncaught async errors in the zone. Use in `main` to prevent unawaited Future errors from crashing silently. Log to error tracking (Sentry, Crashlytics).
- **Idiom**: `StreamController.broadcast()` for multi-listener streams — event buses, shared state. Use single-subscription (default) for 1:1 pipelines with backpressure. Broadcast streams don't buffer for late listeners.
- **Performance**: bounded concurrency with `package:pool` for large-scale parallel operations — `Pool(10).withResource(() => fetch(url))` limits to 10 concurrent, preventing connection exhaustion. Don't `Future.wait` thousands of items directly.

## ⚠️ Edge Cases & Gotchas

- **`await` in a loop is sequential**: `for (var x in items) await fetch(x)` runs one at a time. Use `Future.wait(items.map(fetch))` for parallel.
- **`async` functions return `Future`**: `int f() async { return 5; }` returns `Future<int>`, not `int`. The `async` keyword wraps the return.
- **Unawaited Future errors are uncaught**: `Future.error('x');` (no await) — the error is "uncaught in the zone." Use `runZonedGuarded` or `.catchError`. Use `unawaited(future)` to suppress the lint if intentional.
- **Single-subscription streams allow one listener**: `stream.listen()` twice throws `StateError`. Use `.asBroadcastStream()` for multiple listeners — but broadcast streams can't be paused/buffered.
- **`Stream.toList()` waits for close**: `stream.toList()` returns `Future<List>` that completes when the stream closes. For an infinite stream, it never completes.
- **`await for` blocks until stream closes**: `await for (var x in stream) { ... }` doesn't exit until the stream closes (or `break`). For infinite streams, use `.listen()`.
- **`Future.wait` preserves input order**: `[slow, fast]` → `[slowResult, fastResult]` in input order, NOT completion order.
- **`Future.wait` short-circuits on error by default**: if one future fails, `Future.wait` completes with that error immediately (other futures still run). Set `eagerError: false` to wait for all.
- **Microtask queue runs before event queue**: `Future.microtask()` runs before `Future()` (which goes to the event queue). In Flutter, `Future()` runs on the next frame; `scheduleMicrotask` runs before that.
- **`async*` generators are single-subscription**: the stream from `async*` can only have one listener. For multiple listeners, use `.asBroadcastStream()` or a `StreamController.broadcast()`.

## 🧠 Spot the Bug

A developer processes a stream with `asyncMap` that makes HTTP calls, but the stream seems to "freeze" after a few elements:

::code-wrapper{language="dart"}
```dart
Stream<int> ids = Stream.fromIterable([1, 2, 3, 4, 5]);

Stream<Data> dataStream = ids.asyncMap((id) async {
  return await fetchFromApi(id);  // each takes 2s
});

void main() async {
  await for (var data in dataStream) {
    print(data);
  }
}
```
::

What's happening and is it a bug?

<details>
<summary>Answer</summary>

It's **not a bug** — it's **backpressure**. `asyncMap` awaits each Future before pulling the next element. The stream processes one element at a time: fetch(1) → 2s → emit → fetch(2) → 2s → emit → ... Total time: 10s for 5 elements.

This is `asyncMap`'s design: it applies backpressure, preventing the upstream from flooding a slow consumer. If the API call takes 2s, only one call is in-flight at a time.

If you want **parallel** processing (all fetches at once), you need a different approach:

```dart
// Option 1: collect all, then Future.wait (loses streaming):
Future<List<Data>> fetchAll(Stream<int> ids) async {
  final idList = await ids.toList();
  return Future.wait(idList.map(fetchFromApi));
}

// Option 2: use a bounded pool with a broadcast controller:
Stream<Data> fetchParallel(Stream<int> ids, {int concurrency = 3}) {
  final controller = StreamController<Data>();
  final pool = Pool(concurrency);
  var pending = 0;
  var done = false;

  ids.listen((id) {
    pending++;
    pool.withResource(() => fetchFromApi(id)).then((data) {
      controller.add(data);
      pending--;
      if (done && pending == 0) controller.close();
    });
  }, onDone: () {
    done = true;
    if (pending == 0) controller.close();
  });

  return controller.stream;
}
```

The "freeze" is actually correct behavior — `asyncMap` serializes operations. For parallel streaming, use a pool + controller pattern. Know which semantics you need.

</details>