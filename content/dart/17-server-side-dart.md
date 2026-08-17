# 17 — Server-Side Dart

Dart isn't just for UI — it's a capable server language. Use `dart:io` for HTTP servers, file I/O, and sockets, or frameworks like `shelf` and `dart_frog`.

## `dart:io` HTTP Server

::code-wrapper{language="dart"}
```dart
import 'dart:io';

void main() async {
	final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 8080);
	print('Listening on ${server.address.address}:${server.port}');

	await for (final request in server) {
		request.response
			..statusCode = HttpStatus.ok
			..headers.contentType = ContentType.json
			..write('{"message": "Hello, Dart!"}');
		await request.response.close();
	}
}
```
::
`HttpServer.bind` starts a server; `await for` handles each request. Low-level — use a framework for real apps.

## `shelf` (Middleware Framework)

`shelf` is the standard Dart server framework — middleware-style, composable:

::code-wrapper{language="bash"}
```bash
dart pub add shelf
```
::
::code-wrapper{language="dart"}
```dart
import 'package:shelf/shelf.dart';
import 'package:shelf/shelf_io.dart' as io;

Response _rootHandler(Request request) {
	return Response.ok('Hello, Dart!\n');
}

Response _echoHandler(Request request) {
	final message = request.url.queryParameters['message'] ?? 'none';
	return Response.ok('Echo: $message\n');
}

void main() async {
	final router = Router()
		..get('/', _rootHandler)
		..get('/echo', _echoHandler);

	final handler = const Pipeline()
		.addMiddleware(logRequests())
		.addHandler(router);

	final server = await io.serve(handler, InternetAddress.loopbackIPv4, 8080);
	print('Serving at http://${server.address.address}:${server.port}');
}
```
::
`shelf_router` adds routing. `Pipeline` adds middleware (logging, auth, CORS) before the handler.

## `dart_frog` (Full-Stack Framework)

`dart_frog` is a modern, file-based web framework (like Next.js for Dart):

::code-wrapper{language="bash"}
```bash
dart pub global activate dart_frog
dart_frog create my_api
cd my_api
dart_frog dev   # dev server with hot reload
```
::
File-based routing — `routes/index.dart` handles `/`, `routes/users/[id].dart` handles `/users/:id`:

::code-wrapper{language="dart"}
```dart
// routes/index.dart
import 'package:dart_frog/dart_frog.dart';

Response onRequest(Request request) {
	return Response(body: 'Hello, Dart Frog!');
}
```
::
::code-wrapper{language="dart"}
```dart
// routes/users/[id].dart
import 'package:dart_frog/dart_frog.dart';

Response onRequest(RequestContext context, String id) {
	return Response.json(body: {'id': id});
}
```
::
## File I/O

::code-wrapper{language="dart"}
```dart
import 'dart:io';
import 'dart:convert';

// Read
final contents = await File('data.txt').readAsString();
final lines = await File('data.txt').readAsLines();
final bytes = await File('image.png').readAsBytes();

// Write
await File('output.txt').writeAsString('Hello');
await File('output.txt').writeAsString('Hello', mode: FileMode.append);  // append
await File('data.bin').writeAsBytes([0, 1, 2]);

// Stream (large files)
await for (final chunk in File('large.txt').openRead().transform(utf8.decoder)) {
	print(chunk);
}

// Exists, delete, copy
final exists = await File('data.txt').exists();
await File('data.txt').delete();
await File('data.txt').copy('data_backup.txt');
```
::
`File` is for files; `Directory` for directories:

::code-wrapper{language="dart"}
```dart
final dir = Directory('my_dir');
await dir.create(recursive: true);   // mkdir -p
final entries = await dir.list().toList();
await dir.delete(recursive: true);
```
::
## Environment and Args

::code-wrapper{language="dart"}
```dart
import 'dart:io';

final port = int.parse(Platform.environment['PORT'] ?? '8080');
final args = Platform.executableArguments;   // CLI args
final script = Platform.script;              // the script URI
```
::
`Platform.environment` is env vars. `Platform.script` is the running script's URI.

## `args` Package (CLI Args)

::code-wrapper{language="bash"}
```bash
dart pub add args
```
::
::code-wrapper{language="dart"}
```dart
import 'package:args/args.dart';

void main(List<String> arguments) {
	final parser = ArgParser()
		..addOption('port', abbr: 'p', defaultsTo: '8080', help: 'Port number')
		..addFlag('verbose', abbr: 'v', help: 'Verbose output');

	final results = parser.parse(arguments);
	final port = int.parse(results['port'] as String);
	final verbose = results['verbose'] as bool;

	if (verbose) print('Starting on port $port');
}
```
::
`args` parses CLI flags/options. Use for CLI tools.

## Database

### PostgreSQL (`postgres`)

::code-wrapper{language="bash"}
```bash
dart pub add postgres
```
::
::code-wrapper{language="dart"}
```dart
import 'package:postgres/postgres.dart';

void main() async {
	final conn = await PostgreSQLConnection('localhost', 5432, 'mydb', username: 'user', password: 'pass');
	await conn.open();

	final results = await conn.query('SELECT id, name FROM users WHERE id = @id', substitutionValues: {'id': 1});
	for (final row in results) {
		print('${row[0]}: ${row[1]}');
	}

	await conn.close();
}
```
::
### SQLite (`sqlite3`)

::code-wrapper{language="bash"}
```bash
dart pub add sqlite3
```
::
::code-wrapper{language="dart"}
```dart
import 'package:sqlite3/sqlite3.dart';

void main() {
	final db = sqlite3.open('mydb.sqlite');
	db.execute('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)');

	final stmt = db.prepare('INSERT INTO users (name) VALUES (?)');
	stmt.execute(['Alice']);
	stmt.dispose();

	final results = db.select('SELECT * FROM users');
	for (final row in results) {
		print('${row['id']}: ${row['name']}');
	}

	db.dispose();
}
```
::
### ORM (`drift`)

`drift` (formerly `moor`) is a reactive ORM for SQLite. Type-safe, with code generation.

## JSON APIs

::code-wrapper{language="dart"}
```dart
import 'package:shelf/shelf.dart';
import 'dart:convert';

Response userHandler(Request request) {
	final user = {'id': 1, 'name': 'Alice'};
	return Response.ok(
		jsonEncode(user),
		headers: {'Content-Type': 'application/json'},
	);
}

// Parsing request body
Future<Response> createUser(Request request) async {
	final body = jsonDecode(await request.readAsString());
	final name = body['name'] as String;
	// ... save to DB
	return Response.ok(jsonEncode({'created': name}));
}
```
::
## WebSockets

::code-wrapper{language="dart"}
```dart
import 'dart:io';

void main() async {
	final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 8080);

	await for (final request in server) {
		if (WebSocketTransformer.isUpgradeRequest(request)) {
			final socket = await WebSocketTransformer.upgrade(request);
			socket.listen((message) {
				socket.add('Echo: $message');
			});
		} else {
			request.response.statusCode = HttpStatus.forbidden;
			await request.response.close();
		}
	}
}
```
::
WebSockets enable real-time communication. The `web_socket_channel` package is the standard client.

## Deployment

- **Docker** — package the Dart server in a container.
- **Dart AOT** — `dart compile exe bin/server.dart` produces a native executable (fast startup, no runtime needed).
- **Cloud Run / Fly.io / Railway** — deploy the container.
- **Process management** — `systemd`, `pm2`, or a container orchestrator.

::code-wrapper{language="bash"}
```bash
dart compile exe bin/server.dart   # native executable
./bin/server                        # run it
```
::
## 💡 Tips & Tricks

- **Idiom**: use `shelf` (not raw `dart:io`) for server apps — middleware pipeline, routing (`shelf_router`), composable handlers. Cleaner than raw `HttpServer`. `dart_frog` for file-based routing (Next.js-like).
- **Idiom**: use `dart compile exe` for native server executables — AOT-compiled, fast startup, no runtime needed. Great for Docker containers (small image, fast cold start).
- **Idiom**: stream large files (don't load into memory) — `await for (final chunk in File('large.txt').openRead()) { ... }` processes chunks as they're read, avoiding loading the whole file into memory.
- **Idiom**: use parameterized queries (never string interpolation) for SQL — `conn.query('SELECT * FROM users WHERE id = @id', substitutionValues: {'id': 1})`. Prevents SQL injection. Never `'... WHERE id = $id'`.
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

What's the problem?

<details>
<summary>Answer</summary>

**SQL injection**. The `name` parameter is interpolated directly into the SQL string. If a user passes `name = "'; DROP TABLE users; --"`, the query becomes:

```sql
SELECT * FROM users WHERE name = ''; DROP TABLE users; --'
```
::
This executes `DROP TABLE users` — a catastrophic SQL injection. Even without a DROP, an attacker could read arbitrary data.

The fix — use parameterized queries:

```dart
final name = request.url.queryParameters['name'] ?? '';
final results = await conn.query(
	'SELECT * FROM users WHERE name = @name',
	substitutionValues: {'name': name},
);
```
::
The `@name` placeholder is substituted safely by the driver (escaping/parameter separation). The `name` value is never parsed as SQL — it's a data parameter.

**The lesson**: never interpolate user input into SQL strings. Always use parameterized queries (`@name`/`?` placeholders + `substitutionValues`/args). SQL injection is a top security vulnerability. The parameterized query is the only safe way.

</details>

## Summary

You can build server apps with `dart:io` (`HttpServer`, `File`, `Directory`, `Platform`), `shelf` (middleware, routing), `dart_frog` (file-based), databases (`postgres`, `sqlite3`, `drift` ORM), JSON APIs, WebSockets, CLI args (`args` package), and deploy native executables (`dart compile exe`) — with the SQL-injection and `dart:io`-native-only traps avoided. Next: tooling and ecosystem.