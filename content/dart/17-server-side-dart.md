---
title: "Dart — Server Architecture, Middleware & Database Patterns"
description: "Deep-dive into Dart server-side development with shelf middleware pipelines, dart_frog file-based routing, streaming file I/O, parameterized SQL, WebSocket servers, and native AOT deployment. Code-first engineering reference."
---

# Dart — Server Architecture, Middleware & Database Patterns

## `shelf` — Middleware Pipeline Architecture

::code-wrapper{language="dart"}
```dart
import 'package:shelf/shelf.dart';
import 'package:shelf/shelf_io.dart' as io;
import 'package:shelf_router/shelf_router.dart';

// shelf is the standard Dart server framework — composable middleware pipeline.
// Each middleware wraps the handler: Request → Handler → Response.
// Middleware can modify the request (before), response (after), or short-circuit.

// ── Middleware: a function (Handler) → Handler ──
Middleware corsMiddleware() {
  return (Handler innerHandler) {
    return (Request request) async {
      // Pre-processing: add CORS headers to the response.
      final response = await innerHandler(request);
      return response.change(
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      );
    };
  };
}

// ── Auth middleware: short-circuit on invalid token ──
Middleware authMiddleware(String secret) {
  return (Handler innerHandler) {
    return (Request request) async {
      final token = request.headers['Authorization'];
      if (token == null || !token.startsWith('Bearer ')) {
        return Response(401, body: 'Missing or invalid token');
      }
      final jwt = token.substring(7);
      // Verify JWT (omitted) — throw or return 401 on failure.
      // Pass the request to the next handler (auth passed).
      return innerHandler(request.change(
        context: {'userId': 'extracted-user-id'},  // add context for handlers
      ));
    };
  };
}

// ── Rate limiting middleware ──
Middleware rateLimiter({int maxPerMinute = 60}) {
  final counts = <String, List<DateTime>>{};
  return (Handler innerHandler) {
    return (Request request) async {
      final ip = request.headers['X-Forwarded-For'] ?? request.requestedUri.host;
      final now = DateTime.now();
      counts[ip]?.removeWhere((t) => now.difference(t) > Duration(minutes: 1));
      counts.putIfAbsent(ip, () => []).add(now);
      if ((counts[ip]?.length ?? 0) > maxPerMinute) {
        return Response(429, body: 'Rate limit exceeded');
      }
      return innerHandler(request);
    };
  };
}

// ── Composing the pipeline ──
void main() async {
  final router = Router()
    ..get('/', _rootHandler)
    ..get('/users/<id>', _userHandler)
    ..post('/users', _createUserHandler);

  final handler = const Pipeline()
      .addMiddleware(logRequests())           // built-in request logging
      .addMiddleware(corsMiddleware())         // CORS headers
      .addMiddleware(rateLimiter(maxPerMinute: 100))
      .addMiddleware(authMiddleware('secret'))  // auth
      .addHandler(router);                     // route handler

  final server = await io.serve(handler, InternetAddress.loopbackIPv4, 8080);
  print('Serving at http://${server.address.address}:${server.port}');
}

Response _rootHandler(Request request) => Response.ok('Hello\n');

Response _userHandler(Request request, String id) {
  final userId = request.context['userId'];  // from auth middleware
  return Response.ok('User $id (requested by $userId)');
}

Future<Response> _createUserHandler(Request request) async {
  final body = await request.readAsString();
  final data = jsonDecode(body) as Map<String, dynamic>;
  // Validate, save to DB...
  return Response.ok(jsonEncode({'created': data['name']}), headers: {'Content-Type': 'application/json'});
}
```
::

## `dart_frog` — File-Based Routing

::code-wrapper{language="dart"}
```dart
import 'package:dart_frog/dart_frog.dart';

// dart_frog: file-based routing (like Next.js). Each file in routes/ maps to a URL.
// routes/index.dart        → GET /
// routes/users/index.dart   → GET /users
// routes/users/[id].dart    → GET /users/:id
// routes/users/[id]/posts.dart → GET /users/:id/posts

// ── routes/index.dart ──
Response onRequest(Request request) {
  return Response(body: 'Hello, Dart Frog!');
}

// ── routes/users/[id].dart ──
// The `id` parameter is injected by the framework.
Response onRequest(RequestContext context, String id) {
  // context provides middleware-provided values, request, etc.
  final userId = context.read<String>();  // from middleware provider
  return Response.json(body: {'id': id, 'requestedBy': userId});
}

// ── routes/users/index.dart (with method routing) ──
Future<Response> onRequest(RequestContext context) async {
  return switch (context.request.method) {
    HttpMethod.get => Response.json(body: await _allUsers()),
    HttpMethod.post => _createUser(context),
    _ => Response(statusCode: HttpStatus.methodNotAllowed),
  };
}

Future<Response> _createUser(RequestContext context) async {
  final body = await context.request.json() as Map<String, dynamic>;
  final name = body['name'] as String?;
  if (name == null || name.isEmpty) {
    return Response(statusCode: 400, body: 'Name is required');
  }
  final user = await db.insertUser(name);
  return Response.json(statusCode: 201, body: user.toJson());
}

// ── Middleware via _middleware.dart ──
// routes/_middleware.dart — runs for all routes in this directory and below.
Handler middleware(Handler handler) {
  return (context) async {
    // Pre-processing: auth check
    final token = context.request.headers['Authorization'];
    if (token == null) return Response(statusCode: 401);
    // Pass userId to downstream handlers via provider
    return handler(context.provide<String>(() => 'user-from-token'));
  };
}
```
::

## File I/O — Streaming & Async

::code-wrapper{language="dart"}
```dart
import 'dart:io';
import 'dart:convert';

// ── Read (async — yields to event loop, doesn't block) ──
Future<void> readExamples() async {
  final content = await File('data.txt').readAsString();  // UTF-8, all at once
  final lines = await File('data.txt').readAsLines();  // List<String> by line
  final bytes = await File('image.png').readAsBytes();  // Uint8List

  // ── Streaming: process large files without loading into memory ──
  await for (final chunk in File('large.log').openRead().transform(utf8.decoder)) {
    processChunk(chunk);  // process each chunk as it's read — constant memory
  }

  // Line-by-line streaming:
  final stream = File('large.log').openRead().transform(utf8.decoder).transform(LineSplitter());
  await for (final line in stream) {
    if (line.startsWith('ERROR')) print(line);  // filter lines, constant memory
  }
}

// ── Write ──
Future<void> writeExamples() async {
  await File('output.txt').writeAsString('Hello');  // overwrites
  await File('output.txt').writeAsString('\nMore', mode: FileMode.append);  // append
  await File('data.bin').writeAsBytes([0, 1, 2]);  // binary

  // Streaming write (for large outputs):
  final sink = File('big.txt').openWrite();  // IOSink — stream-like
  for (var i = 0; i < 1000000; i++) {
    sink.writeln('Line $i');  // buffered, flushed periodically
  }
  await sink.close();  // ← MUST close to flush remaining buffer
}

// ── Directories ──
Future<void> dirExamples() async {
  final dir = Directory('output');
  await dir.create(recursive: true);  // mkdir -p (creates parent dirs)

  // List lazily (Stream — process without loading all entries):
  await for (final entry in dir.list(recursive: true)) {
    if (entry is File) print('File: ${entry.path}');
    else if (entry is Directory) print('Dir: ${entry.path}');
  }

  await dir.delete(recursive: true);  // rm -rf
}

// ❌ Anti-pattern: sync file operations in a server (blocks the event loop).
// File('data.txt').readAsStringSync();  // blocks all other requests!
// Always use the async variants (readAsString, writeAsString) in servers.
```
::

## Database — Parameterized Queries (SQL Injection Prevention)

::code-wrapper{language="dart"}
```dart
import 'package:postgres/postgres.dart';

// ❌ Anti-pattern: string interpolation in SQL — SQL INJECTION.
Future<List<Map>> badQuery(PostgreSQLConnection conn, String name) async {
  return conn.mappedResultsQuery(
    "SELECT * FROM users WHERE name = '$name'",  // ← INJECTION VULNERABILITY
  );
  // If name = "'; DROP TABLE users; --", the query becomes:
  // SELECT * FROM users WHERE name = ''; DROP TABLE users; --'
  // → drops the users table!
}

// ✓ Correct: parameterized queries — the driver escapes the value.
Future<List<Map>> goodQuery(PostgreSQLConnection conn, String name) async {
  return conn.mappedResultsQuery(
    'SELECT * FROM users WHERE name = @name',
    substitutionValues: {'name': name},  // ← safe: name is never parsed as SQL
  );
}

// ── Transactions ──
Future<void> transferFunds(PostgreSQLConnection conn, int from, int to, int amount) async {
  await conn.transaction((conn) async {
    // All queries in this block run in a single transaction.
    // If any throws, the transaction is rolled back automatically.
    await conn.execute(
      'UPDATE accounts SET balance = balance - @amount WHERE id = @from',
      substitutionValues: {'amount': amount, 'from': from},
    );
    await conn.execute(
      'UPDATE accounts SET balance = balance + @amount WHERE id = @to',
      substitutionValues: {'amount': amount, 'to': to},
    );
    // If we throw here, both updates are rolled back.
    final balance = await conn.query(
      'SELECT balance FROM accounts WHERE id = @id',
      substitutionValues: {'id': from},
    );
    if (balance.first[0] as int < 0) {
      throw Exception('Insufficient funds — rollback');
    }
  });
}
```

## SQLite with `sqlite3`

::code-wrapper{language="dart"}
```dart
import 'package:sqlite3/sqlite3.dart';

void main() {
  final db = sqlite3.open('app.db');
  db.execute('''
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  ''');

  // ── Prepared statements (parameterized — safe from injection) ──
  final insert = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
  insert.execute(['Alice', 'alice@example.com']);
  insert.execute(['Bob', 'bob@example.com']);
  insert.dispose();  // ← MUST dispose to release resources

  // ── Query with parameters ──
  final query = db.prepare('SELECT * FROM users WHERE name LIKE ?');
  final results = query.select(['%li%']);  // matches 'Alice'
  for (final row in results) {
    print('${row['id']}: ${row['name']} <${row['email']}>');
  }
  query.dispose();

  // ── Transaction ──
  db.execute('BEGIN');
  try {
    db.execute("INSERT INTO users (name) VALUES ('Temp')");
    // If we throw here, the transaction is open — rollback:
    db.execute('ROLLBACK');
  } catch (e) {
    db.execute('ROLLBACK');
    rethrow;
  }
  db.execute('COMMIT');

  db.dispose();  // close the database
}
```
::

## WebSocket Server

::code-wrapper{language="dart"}
```dart
import 'dart:io';

// ── Raw HttpServer WebSocket upgrade ──
Future<void> startWebSocketServer() async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 8080);
  print('WebSocket server on ws://localhost:8080');

  await for (final request in server) {
    if (WebSocketTransformer.isUpgradeRequest(request)) {
      final socket = await WebSocketTransformer.upgrade(request);

      // Each connection is a bidirectional stream.
      socket.listen(
        (message) {
          print('Received: $message');
          socket.add('Echo: $message');  // send back
        },
        onError: (e) => print('Socket error: $e'),
        onDone: () => print('Socket closed'),
        cancelOnError: true,
      );
    } else {
      request.response.statusCode = HttpStatus.forbidden;
      await request.response.close();
    }
  }
}

// ── Broadcast pattern (chat room) ──
class ChatRoom {
  final _clients = <WebSocket>{};

  void addClient(WebSocket socket) {
    _clients.add(socket);
    socket.listen(
      (message) {
        // Broadcast to all other clients:
        for (final client in _clients) {
          if (client != socket) client.add(message);
        }
      },
      onDone: () => _clients.remove(socket),
      onError: (e) => _clients.remove(socket),
    );
  }
}
```
::

## Native AOT Deployment

::code-wrapper{language="bash"}
```bash
# ── Compile to a standalone native binary (no Dart SDK at runtime) ──
# Tree-shaken, AOT-compiled, fast cold start. Perfect for Docker.
dart compile exe bin/server.dart -o bin/server

# ── Dockerfile for a Dart server ──
# FROM dart:stable AS build
# WORKDIR /app
# COPY pubspec.* ./
# RUN dart pub get
# COPY . .
# RUN dart compile exe bin/server.dart -o bin/server
#
# FROM scratch  # or debian:stable-slim for glibc
# COPY --from=build /app/bin/server /server
# EXPOSE 8080
# CMD ["/server"]

# ── Environment-based configuration ──
# PORT env var (common for Cloud Run, Fly.io, Heroku):
# final port = int.parse(Platform.environment['PORT'] ?? '8080');
```

::code-wrapper{language="dart"}
```dart
import 'dart:io';

void main() async {
  // Production config from environment — don't hardcode ports in production.
  final port = int.parse(Platform.environment['PORT'] ?? '8080');
  final dbUrl = Platform.environment['DATABASE_URL'];
  if (dbUrl == null) {
    stderr.writeln('DATABASE_URL is required');
    exit(1);
  }

  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, port);
  print('Server running on port $port');

  // Graceful shutdown (SIGTERM/SIGINT):
  ProcessSignal.sigterm.watch().listen((_) async {
    print('Shutting down...');
    await server.close();
    exit(0);
  });

  await for (final request in server) {
    // ... handle requests
  }
}
```
::

## 💡 Tips & Tricks

- **Idiom**: use `shelf` (not raw `dart:io`) for server apps — middleware pipeline, routing (`shelf_router`), composable handlers. Cleaner than raw `HttpServer`. `dart_frog` for file-based routing (Next.js-like).
- **Idiom**: use `dart compile exe` for native server executables — AOT-compiled, fast startup, no runtime needed. Great for Docker containers (small image, fast cold start).
- **Idiom**: stream large files (don't load into memory) — `await for (final chunk in File('large.txt').openRead()) { ... }` processes chunks as they're read, avoiding loading the whole file into memory.
- **Idiom**: use parameterized queries (never string interpolation) for SQL — `conn.query('SELECT ... WHERE id = @id', substitutionValues: {'id': 1})`. Prevents SQL injection. Never `'... WHERE id = $id'`.
- **Idiom**: use `dart_frog` for file-based APIs — `routes/users/[id].dart` handles `/users/:id`, like Next.js. File-based routing + middleware. Great for REST APIs and full-stack Dart.

## ⚠️ Edge Cases & Gotchas

- **`dart:io` is native-only**: `HttpServer`, `File`, `Platform.exit` don't work on the web. Server code runs natively (or in a container).
- **`HttpServer` is low-level**: use `shelf`/`dart_frog` for routing, middleware, JSON, CORS. Raw `HttpServer` is verbose for real apps.
- **Parameterized queries are required for SQL**: `'SELECT ... WHERE id = $id'` is a SQL injection risk. Use `substitutionValues` (`postgres`) or `?` placeholders (`sqlite3`).
- **`File` operations are async**: `readAsString()` returns a `Future`. Use `await`. Sync variants (`readAsStringSync`) exist but block — avoid in servers.
- **`Platform.environment` is empty in tests**: env vars aren't set in `dart test`. Mock or set them in the test setup.
- **`dart compile exe` produces a native binary**: AOT-compiled, no Dart runtime needed. Fast startup. But it's platform-specific (a macOS binary doesn't run on Linux). Build per-platform.
- **`WebSocketTransformer.upgrade`**: for raw `HttpServer`. With `shelf`, use the `shelf_web_socket` package. WebSockets need an upgrade handshake.
- **`serve()` returns the server**: keep a reference to `server` if you need to close it (tests). `io.serve(handler, address, port)` returns `Future<HttpServer>`.
- **`readAsString()` throws on non-UTF8**: if the file isn't valid UTF-8, `readAsString` throws. Use `readAsBytes` + manual decoding, or catch `FileSystemException`.
- **`Directory.list()` is lazy**: returns a `Stream<FileSystemEntity>`. Use `.toList()` to materialize, or `await for` to process lazily.

## 🧠 Spot the Bug

A developer builds a SQL query with string interpolation, and the app crashes on certain inputs:

::code-wrapper{language="dart"}
```dart
final name = request.url.queryParameters['name'] ?? '';
final results = await conn.query("SELECT * FROM users WHERE name = '$name'");
```
::

What's the vulnerability?

<details>
<summary>Answer</summary>

**SQL injection**. The `name` parameter is interpolated directly into the SQL string. If a user passes `name = "'; DROP TABLE users; --"`, the query becomes:

```sql
SELECT * FROM users WHERE name = ''; DROP TABLE users; --'
```

This executes `DROP TABLE users` — a catastrophic SQL injection. Even without a DROP, an attacker could read arbitrary data or bypass authentication.

The fix — use parameterized queries:

```dart
final name = request.url.queryParameters['name'] ?? '';
final results = await conn.query(
  'SELECT * FROM users WHERE name = @name',
  substitutionValues: {'name': name},
);
```

The `@name` placeholder is substituted safely by the driver (parameter separation, not string escaping). The `name` value is never parsed as SQL — it's a data parameter. This is the only safe way to build SQL with user input.

</details>