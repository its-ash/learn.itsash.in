---
title: "Dart — Production Projects & Capstone Architecture"
description: "Deep-dive into real-world Dart projects — a production CLI parser, a zero-allocation data pipeline, an isolate-based image processor, a full-stack Flutter + dart_frog capstone with shared models, and a production checklist. Code-first engineering reference."
---

# Dart — Production Projects & Capstone Architecture

## Project 1 — Production CLI Argument Parser

A CLI tool with subcommands, validation, and exit codes. Demonstrates `args` package, exhaustive switches, and error handling.

::code-wrapper{language="dart"}
```dart
import 'package:args/args.dart';
import 'dart:io';

// ── Subcommand definitions (exhaustive enum) ──
enum Command { convert, info, version }

// ── Temperature units (enhanced enum with conversion logic) ──
enum Unit {
  celsius('°C', 'Celsius'),
  fahrenheit('°F', 'Fahrenheit'),
  kelvin('K', 'Kelvin');

  final String symbol;
  final String name;
  const Unit(this.symbol, this.name);

  /// Convert FROM this unit TO Celsius.
  double toCelsius(double value) => switch (this) {
    Unit.celsius => value,
    Unit.fahrenheit => (value - 32) * 5 / 9,
    Unit.kelvin => value - 273.15,
  };

  /// Convert FROM Celsius TO this unit.
  double fromCelsius(double celsius) => switch (this) {
    Unit.celsius => celsius,
    Unit.fahrenheit => celsius * 9 / 5 + 32,
    Unit.kelvin => celsius + 273.15,
  };

  static Unit parse(String s) => switch (s.toLowerCase()) {
    'c' || 'celsius' => Unit.celsius,
    'f' || 'fahrenheit' => Unit.fahrenheit,
    'k' || 'kelvin' => Unit.kelvin,
    _ => throw UsageException('Unknown unit: $s', 'Use c, f, or k'),
  };

  double convertTo(double value, Unit target) =>
      target.fromCelsius(toCelsius(value));
}

// ── The parser (top-level, reusable) ──
ArgParser buildParser() {
  return ArgParser()
    ..addCommand('convert')
    ..addCommand('info')
    ..addCommand('version');
}

// ── Entry point — thin, delegates to handlers ──
void main(List<String> arguments) {
  try {
    final parser = buildParser();
    final results = parser.parse(arguments);

    final command = results.command;
    if (command == null) {
      printUsage(parser);
      exit(64);  // EX_USAGE
    }

    final cmd = Command.values.firstWhere(
      (c) => c.name == command.name,
      orElse: () => throw UsageException('Unknown command', ''),
    );

    final exitCode = switch (cmd) {
      Command.convert => handleConvert(command),
      Command.info => handleInfo(command),
      Command.version => handleVersion(),
    };
    exit(exitCode);
  } on UsageException catch (e) {
    stderr.writeln('Error: ${e.message}');
    stderr.writeln(e.usage);
    exit(64);
  } catch (e, stack) {
    stderr.writeln('Unexpected error: $e\n$stack');
    exit(70);  // EX_SOFTWARE
  }
}

int handleConvert(ArgResults args) {
  if (args.rest.length != 3) {
    throw UsageException(
      'convert requires 3 arguments',
      'convert <value> <from> <to>',
    );
  }

  final value = double.tryParse(args.rest[0]);
  if (value == null) {
    throw UsageException('Invalid value: ${args.rest[0]}', 'Value must be a number');
  }

  final from = Unit.parse(args.rest[1]);
  final to = Unit.parse(args.rest[2]);
  final result = from.convertTo(value, to);

  print('${value.toStringAsFixed(2)}${from.symbol} = '
      '${result.toStringAsFixed(2)}${to.symbol}');
  return 0;
}

int handleInfo(ArgResults args) {
  for (final unit in Unit.values) {
    print('${unit.name}: ${unit.symbol} (${unit.name})');
  }
  return 0;
}

int handleVersion() {
  print('tempc v1.0.0');
  return 0;
}

void printUsage(ArgParser parser) {
  print('Usage: tempc <command> [arguments]');
  print(parser.usage);
}

class UsageException implements Exception {
  final String message;
  final String usage;
  UsageException(this.message, this.usage);
  @override
  String toString() => message;
}
```
::

## Project 2 — Zero-Copy Stream Pipeline

A data processing pipeline using lazy `Iterable`s, `async*` generators, and backpressure-aware streams. Zero intermediate allocations.

::code-wrapper{language="dart"}
```dart
import 'dart:async';
import 'dart:convert';
import 'dart:io';

// ── A lazy pipeline: read → parse → filter → transform → aggregate ──
// Each stage is lazy (Iterable or Stream) — no intermediate lists allocated.
// Data flows element-by-element through the pipeline.

class LogEntry {
  final DateTime timestamp;
  final String level;
  final String message;
  const LogEntry(this.timestamp, this.level, this.message);

  factory LogEntry.fromJson(Map<String, dynamic> json) => LogEntry(
    DateTime.parse(json['timestamp'] as String),
    json['level'] as String,
    json['message'] as String,
  );
}

// ── Stage 1: read lines lazily (streaming — constant memory) ──
Stream<String> readLines(String path) {
  return File(path)
      .openRead()
      .transform(utf8.decoder)
      .transform(const LineSplitter());
}

// ── Stage 2: parse JSON lazily (sync* — pull-based) ──
Iterable<LogEntry> parseEntries(Iterable<String> lines) sync* {
  for (final line in lines) {
    try {
      yield LogEntry.fromJson(jsonDecode(line) as Map<String, dynamic>);
    } on FormatException {
      // skip invalid lines (don't crash on bad data)
      continue;
    }
  }
}

// ── Stage 3: filter by level (lazy Iterable) ──
Iterable<LogEntry> filterByLevel(Iterable<LogEntry> entries, String level) {
  return entries.where((e) => e.level == level);
}

// ── Stage 4: group by hour (async* — push-based with backpressure) ──
Stream<MapEntry<DateTime, List<LogEntry>>> groupByHour(
  Stream<LogEntry> entries,
) async* {
  var currentHour = <DateTime, List<LogEntry>>{};
  LogEntry? last;

  await for (final entry in entries) {
    final hour = DateTime(
      entry.timestamp.year,
      entry.timestamp.month,
      entry.timestamp.day,
      entry.timestamp.hour,
    );
    currentHour.putIfAbsent(hour, () => []).add(entry);
    last = entry;
  }
  for (final entry in currentHour.entries) {
    yield entry;
  }
}

// ── Stage 5: aggregate — count errors per hour ──
Future<Map<DateTime, int>> errorCountPerHour(String logPath) async {
  final lines = readLines(logPath);                    // lazy stream
  final entries = parseEntries(lines);                // lazy iterable
  final errors = filterByLevel(entries, 'ERROR');     // lazy filter

  // Convert to stream for async grouping:
  final grouped = groupByHour(Stream.fromIterable(errors));

  final result = <DateTime, int>{};
  await for (final hourEntries in grouped) {
    result[hourEntries.key] = hourEntries.value.length;
  }
  return result;
}

// ── Usage — the pipeline processes a 1GB log file with constant memory ──
void main() async {
  final counts = await errorCountPerHour('app.log');
  for (final entry in counts.entries) {
    print('${entry.key}: ${entry.value} errors');
  }
}
```
::

## Project 3 — Isolate-Based Image Processor

A worker pool that distributes image processing across isolates with zero-copy transfer.

::code-wrapper{language="dart"}
```dart
import 'dart:isolate';
import 'dart:typed_data';
import 'dart:async';

// ── Task definition (sent to workers) ──
class ImageTask {
  final int id;
  final TransferableTypedData pixels;  // zero-copy transfer of pixel data
  final int width;
  final int height;
  final String operation;  // 'grayscale', 'invert', 'blur'

  const ImageTask(this.id, this.pixels, this.width, this.height, this.operation);
}

// ── Worker pool — reusable isolates for parallel processing ──
class ImageProcessor {
  final int _poolSize;
  final List<_ImageWorker> _workers = [];
  final _available = <_ImageWorker>[];
  final _pending = <Completer<Uint8List>, _ImageWorker>{};
  final _queue = <(ImageTask, Completer<Uint8List>)>[];

  ImageProcessor(this._poolSize);

  Future<void> start() async {
    for (var i = 0; i < _poolSize; i++) {
      final worker = await _ImageWorker.spawn();
      worker.onResult = _handleResult;
      _workers.add(worker);
      _available.add(worker);
    }
  }

  Future<Uint8List> process(Uint8List pixels, int w, int h, String op) {
    final completer = Completer<Uint8List>();
    final task = ImageTask(
      _queue.length,
      TransferableTypedData.fromList([pixels]),  // wrap for zero-copy
      w, h, op,
    );
    _queue.add((task, completer));
    _processQueue();
    return completer.future;
  }

  void _processQueue() {
    while (_available.isNotEmpty && _queue.isNotEmpty) {
      final worker = _available.removeLast();
      final (task, completer) = _queue.removeAt(0);
      _pending[completer] = worker;
      worker.process(task, completer);
    }
  }

  void _handleResult(_ImageWorker worker) {
    _available.add(worker);
    _processQueue();
  }

  void dispose() {
    for (var w in _workers) w.kill();
  }
}

class _ImageWorker {
  late final Isolate _isolate;
  late final SendPort _sendPort;
  final _receivePort = ReceivePort();
  late void Function(_ImageWorker) onResult;
  Completer<Uint8List>? _current;

  static Future<_ImageWorker> spawn() async {
    final worker = _ImageWorker();
    worker._isolate = await Isolate.spawn(_entry, worker._receivePort.sendPort);
    worker._sendPort = await worker._receivePort.first as SendPort;
    worker._receivePort.listen(worker._handleMessage);
    return worker;
  }

  void process(ImageTask task, Completer<Uint8List> completer) {
    _current = completer;
    _sendPort.send(task);
  }

  void _handleMessage(dynamic message) {
    if (message is Uint8List && _current != null) {
      _current!.complete(message);
      _current = null;
      onResult(this);
    }
  }

  void kill() {
    _isolate.kill(priority: Isolate.immediate);
    _receivePort.close();
  }

  static void _entry(SendPort mainPort) {
    final receivePort = ReceivePort();
    mainPort.send(receivePort.sendPort);

    receivePort.listen((task) {
      if (task is ImageTask) {
        // Materialize the transferred data (zero-copy — moved, not copied):
        final data = task.pixels.materialize().asUint8List();
        final result = _processImage(data, task.width, task.height, task.operation);
        // Transfer the result back (zero-copy):
        mainPort.send(TransferableTypedData.fromList([result]).materialize().asUint8List());
      }
    });
  }

  static Uint8List _processImage(Uint8List pixels, int w, int h, String op) {
    // Image processing — grayscale, invert, etc.
    return switch (op) {
      'grayscale' => _grayscale(pixels),
      'invert' => _invert(pixels),
      _ => pixels,
    };
  }

  static Uint8List _grayscale(Uint8List pixels) {
    final result = Uint8List(pixels.length);
    for (var i = 0; i < pixels.length; i += 4) {
      final gray = (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114).toInt();
      result[i] = gray;
      result[i + 1] = gray;
      result[i + 2] = gray;
      result[i + 3] = pixels[i + 3];  // alpha unchanged
    }
    return result;
  }

  static Uint8List _invert(Uint8List pixels) {
    final result = Uint8List(pixels.length);
    for (var i = 0; i < pixels.length; i += 4) {
      result[i] = 255 - pixels[i];
      result[i + 1] = 255 - pixels[i + 1];
      result[i + 2] = 255 - pixels[i + 2];
      result[i + 3] = pixels[i + 3];
    }
    return result;
  }
}
```
::

## Project 4 — Full-Stack Capstone (Flutter + dart_frog + Shared Models)

A production full-stack app with shared data models, a REST API, and a Flutter client. Demonstrates monorepo structure, shared packages, and end-to-end types.

::code-wrapper{language="text"}
```text
capstone/
├── packages/
│   └── models/              # shared data models (freezed + json_serializable)
│       ├── lib/
│       │   ├── models.dart   # public API barrel
│       │   └── src/
│       │       ├── task.dart
│       │       └── user.dart
│       ├── pubspec.yaml
│       └── analysis_options.yaml
├── server/                  # dart_frog REST API
│   ├── routes/
│   │   ├── index.dart
│   │   ├── tasks/
│   │   │   ├── index.dart
│   │   │   └── [id].dart
│   │   └── _middleware.dart
│   ├── lib/
│   │   └── db.dart           # database layer
│   ├── test/
│   │   └── tasks_test.dart
│   ├── pubspec.yaml
│   └── Dockerfile
├── client/                  # Flutter app
│   ├── lib/
│   │   ├── main.dart
│   │   ├── api/
│   │   │   └── api_client.dart
│   │   ├── state/
│   │   │   └── task_provider.dart
│   │   └── screens/
│   │       ├── task_list_screen.dart
│   │       └── task_detail_screen.dart
│   ├── pubspec.yaml
│   └── analysis_options.yaml
└── melos.yaml               # monorepo management
```
::

### Shared Models Package

::code-wrapper{language="dart"}
```dart
// packages/models/lib/src/task.dart
import 'package:freezed_annotation/freezed_annotation.dart';
part 'task.freezed.dart';
part 'task.g.dart';

@freezed
class Task with _$Task {
  const factory Task({
    required String id,
    required String title,
    required String description,
    @Default(false) bool completed,
    required DateTime createdAt,
    DateTime? completedAt,
  }) = _Task;

  factory Task.fromJson(Map<String, dynamic> json) => _$TaskFromJson(json);
}

// packages/models/lib/models.dart — barrel file
export 'src/task.dart';
export 'src/user.dart';
```
::

### Server — dart_frog REST API

::code-wrapper{language="dart"}
```dart
// server/routes/tasks/index.dart
import 'package:dart_frog/dart_frog.dart';
import 'package:models/models.dart';
import '../../lib/db.dart';

Future<Response> onRequest(RequestContext context) async {
  final db = context.read<TaskDatabase>();

  return switch (context.request.method) {
    HttpMethod.get => Response.json(body: await db.all()),
    HttpMethod.post => _createTask(context, db),
    _ => Response(statusCode: HttpStatus.methodNotAllowed),
  };
}

Future<Response> _createTask(RequestContext context, TaskDatabase db) async {
  final body = await context.request.json() as Map<String, dynamic>;
  final title = body['title'] as String?;
  if (title == null || title.isEmpty) {
    return Response(statusCode: 400, body: 'Title is required');
  }
  final task = Task(
    id: _generateId(),
    title: title,
    description: body['description'] as String? ?? '',
    createdAt: DateTime.now(),
  );
  await db.insert(task);
  return Response.json(statusCode: 201, body: task.toJson());
}

String _generateId() => DateTime.now().microsecondsSinceEpoch.toString();
```

::code-wrapper{language="dart"}
```dart
// server/routes/tasks/[id].dart
import 'package:dart_frog/dart_frog.dart';
import 'package:models/models.dart';
import '../../lib/db.dart';

Future<Response> onRequest(RequestContext context, String id) async {
  final db = context.read<TaskDatabase>();

  return switch (context.request.method) {
    HttpMethod.get => _getTask(db, id),
    HttpMethod.put => _updateTask(context, db, id),
    HttpMethod.delete => _deleteTask(db, id),
    _ => Response(statusCode: HttpStatus.methodNotAllowed),
  };
}

Future<Response> _getTask(TaskDatabase db, String id) async {
  final task = await db.findById(id);
  if (task == null) return Response(statusCode: 404, body: 'Not found');
  return Response.json(body: task.toJson());
}

Future<Response> _updateTask(RequestContext context, TaskDatabase db, String id) async {
  final task = await db.findById(id);
  if (task == null) return Response(statusCode: 404);

  final body = await context.request.json() as Map<String, dynamic>;
  final updated = task.copyWith(
    title: body['title'] as String? ?? task.title,
    completed: body['completed'] as bool? ?? task.completed,
    completedAt: body['completed'] == true ? DateTime.now() : null,
  );
  await db.update(updated);
  return Response.json(body: updated.toJson());
}

Future<Response> _deleteTask(TaskDatabase db, String id) async {
  final deleted = await db.delete(id);
  if (!deleted) return Response(statusCode: 404);
  return Response(statusCode: 204);
}
```
::

### Client — Flutter App with Riverpod

::code-wrapper{language="dart"}
```dart
// client/lib/api/api_client.dart
import 'package:http/http.dart' as http;
import 'package:models/models.dart';
import 'dart:convert';

class ApiClient {
  final String baseUrl;
  final http.Client _client;

  ApiClient({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  Future<List<Task>> getTasks() async {
    final response = await _client.get(Uri.parse('$baseUrl/tasks'));
    if (response.statusCode != 200) throw ApiException(response.statusCode);
    final list = jsonDecode(response.body) as List;
    return list.map((e) => Task.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Task> createTask(String title, String description) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/tasks'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'title': title, 'description': description}),
    );
    if (response.statusCode != 201) throw ApiException(response.statusCode);
    return Task.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<void> deleteTask(String id) async {
    final response = await _client.delete(Uri.parse('$baseUrl/tasks/$id'));
    if (response.statusCode != 204) throw ApiException(response.statusCode);
  }
}

class ApiException implements Exception {
  final int statusCode;
  ApiException(this.statusCode);
  @override
  String toString() => 'ApiException: $statusCode';
}
```

::code-wrapper{language="dart"}
```dart
// client/lib/state/task_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';
import 'package:models/models.dart';

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(baseUrl: 'http://localhost:8080');
});

final taskListProvider = FutureProvider<List<Task>>((ref) async {
  return ref.read(apiClientProvider).getTasks();
});

final taskActionsProvider = Provider<TaskActions>((ref) {
  return TaskActions(ref.read(apiClientProvider), ref);
});

class TaskActions {
  final ApiClient api;
  final Ref ref;
  TaskActions(this.api, this.ref);

  Future<void> create(String title, String description) async {
    await api.createTask(title, description);
    ref.invalidate(taskListProvider);  // refresh the list
  }

  Future<void> delete(String id) async {
    await api.deleteTask(id);
    ref.invalidate(taskListProvider);
  }
}
```
::

## Production Checklist

::code-wrapper{language="markdown"}
```markdown
## Null Safety & Types
- [ ] Sound null safety (no `!` abuse, proper `?`/`??`/`?.`)
- [ ] `Object?` over `dynamic` for "any value" (preserve type checking)
- [ ] `late final x = initializer` for lazy fields (not bare `late`)

## Control Flow & Patterns
- [ ] Exhaustive switches (no `default`/`_` for enums/sealed types)
- [ ] Pattern matching with destructuring (no manual casts)
- [ ] `assert` only for debug invariants (stripped in AOT)

## Error Handling
- [ ] Specific `on Type catch` (not broad `catch (e)`)
- [ ] `rethrow` (not `throw e`) to preserve stack traces
- [ ] `Exception` subtypes for recoverable, `Error` subtypes for bugs
- [ ] `runZonedGuarded` for uncaught async errors

## Async & Concurrency
- [ ] `async`/`await` (no unawaited futures — use `unawaited()`)
- [ ] `Future.wait` for parallel independent operations
- [ ] `mounted` check after `await` (before `setState`/`context`)
- [ ] `TransferableTypedData` for large buffers between isolates
- [ ] Isolates for CPU-heavy, `await` for I/O

## Classes & Generics
- [ ] `sealed` for closed hierarchies (exhaustive switches)
- [ ] `const` constructors for immutable value types
- [ ] `==`/`hashCode` override for value classes (or use records)
- [ ] `is T` (not `as T`) for generic cache retrieval

## Collections
- [ ] `fold` (not `reduce`) for possibly-empty collections
- [ ] `[...list]..sort()` for sorted copies (sort is in-place, void)
- [ ] Chain lazy `Iterable` ops, `.toList()` once at the end
- [ ] `List.unmodifiable([...source])` for immutable copies

## Security
- [ ] Parameterized SQL queries (never string interpolation)
- [ ] Input validation (server-side, before processing)
- [ ] No secrets in code (use env vars / secret managers)

## Cross-Platform
- [ ] `dart:io` not used on web (conditional imports)
- [ ] `BigInt` for large integers on web (int precision above 2^53)
- [ ] `http` package for cross-platform HTTP

## Flutter
- [ ] `const` widgets where possible (canonicalization, zero rebuild)
- [ ] `build()` is pure (no side effects, no setState)
- [ ] `initState` for async work, `mounted` check before setState
- [ ] `ListView.builder` for long lists (lazy building)
- [ ] `ValueKey` for items that can reorder

## Tooling & CI
- [ ] `dart format` applied (CI: `--set-exit-if-changed`)
- [ ] `dart analyze` clean (CI: `--fatal-infos`)
- [ ] `dart test` in CI (tests for all logic)
- [ ] `build_runner` generated files not edited (regenerate from source)
- [ ] `pubspec.lock` committed for apps (reproducible builds)
```
::

## 💡 Tips & Tricks

- **Performance**: use `TransferableTypedData` for large byte buffers between isolates — zero-copy transfer (O(1)) instead of deep copy (O(n)). The original buffer is invalidated after transfer. Use for images, audio, large arrays.
- **Idiom**: use lazy `Iterable`/`Stream` pipelines — chain `map`/`where`/`asyncMap` and materialize once at the end. Processes data element-by-element with constant memory. Avoid intermediate `.toList()` calls.
- **Idiom**: monorepo with shared models package — `freezed` + `json_serializable` models in `packages/models/`, imported by both server and client. End-to-end type safety — the server and client use the same `Task` type.
- **Idiom**: `dart compile exe` for native server binaries — AOT-compiled, fast cold start, no runtime needed. Perfect for Docker containers. Cross-compile per-platform.
- **Idiom**: use `melos` for monorepo management — `melos bootstrap` installs deps for all packages, `melos exec -- dart test` runs tests across packages. Avoids manual `cd` + `pub get` for each package.

## ⚠️ Edge Cases & Gotchas

- **Monorepo path dependencies**: `shared_models: path: ../shared_models` — changes to the shared package require `melos bootstrap` (or `dart pub get` in each consumer) to propagate.
- **`freezed` requires `build_runner`**: after changing a `@freezed` class, run `dart run build_runner build` to regenerate `.freezed.dart` and `.g.dart`.
- **Web `int` precision**: in the Flutter client, `int` above 2^53 loses precision on web. If the server sends large IDs (e.g., snowflake IDs), use `String` or `BigInt` for the ID type.
- **CORS in development**: the Flutter web client needs CORS headers from the server. Use the `corsMiddleware` in shelf/dart_frog for development. In production, serve the client and API from the same origin (or configure CORS).
- **`dart compile exe` is platform-specific**: a macOS binary doesn't run on Linux. Build per-platform (use Docker for cross-compilation or CI runners per platform).
- **Async gaps in Flutter**: after `await` in a widget, check `mounted` (or `context.mounted`) before `setState` or navigation. The widget may have been disposed during the await.
- **Isolate spawn overhead (~50ms)**: for many small tasks, use a worker pool (reuse isolates). For one-shot heavy work, `Isolate.run` is fine.
- **`Stream.toList()` on infinite streams**: never completes. Use `.take(n).toList()` or `.listen()` for infinite streams.
- **Generated files and git**: either commit `.g.dart`/`.freezed.dart` (avoids build step for consumers) or `.gitignore` them (cleaner diffs, but consumers must run `build_runner`). Be consistent.

## 🧠 Spot the Bug

A full-stack app shares a `Task` model between server and client. The server returns `created_at` (snake_case), but the client model expects `createdAt` (camelCase):

::code-wrapper{language="dart"}
```dart
@freezed
class Task with _$Task {
  const factory Task({
    required String id,
    required String title,
    required DateTime createdAt,  // expects "createdAt" in JSON
  }) = _Task;

  factory Task.fromJson(Map<String, dynamic> json) => _$TaskFromJson(json);
}
```
::

The server sends `{"id": "1", "title": "Test", "created_at": "2026-01-01T00:00:00"}`. What happens?

<details>
<summary>Answer</summary>

`_$TaskFromJson` looks for `json['createdAt']` (camelCase, matching the field name). The server sends `created_at` (snake_case). `json['createdAt']` is `null` — `DateTime.parse(null)` throws `FormatException`.

The fix — use `@JsonKey` to map the JSON key to the Dart field name:

```dart
@freezed
class Task with _$Task {
  const factory Task({
    required String id,
    required String title,
    @JsonKey(name: 'created_at') required DateTime createdAt,  // ← map JSON key
  }) = _Task;

  factory Task.fromJson(Map<String, dynamic> json) => _$TaskFromJson(json);
}
```

Now `_$TaskFromJson` reads `json['created_at']` and maps it to `createdAt`. The generated code (after `build_runner build`) handles the key mapping.

Or, configure `json_serializable` globally to use snake_case:

```dart
@JsonSerializable(fieldRename: FieldRename.snake)
// or on freezed:
@Freezed(fieldRename: FieldRename.snake)
```

This maps ALL fields to snake_case in JSON. Use when the entire API uses snake_case (common in Go/Python backends).

</details>