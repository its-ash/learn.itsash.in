# 19 — Exercises & Projects

Apply everything from chapters 1–18 in real-world projects. These exercises progress from focused drills to a full capstone.

## Project 1 — CLI Temperature Converter

A CLI tool that converts temperatures (chapter 1–6).

**Requirements**:
- Parse arguments (`--from`, `--to`, value).
- Convert Celsius ↔ Fahrenheit ↔ Kelvin.
- Handle invalid input (non-numeric, unknown unit) with clear errors.
- Use `enum` for units, exhaustive switch.

::code-wrapper{language="dart"}
```dart
import 'package:args/args.dart';

enum Unit { celsius, fahrenheit, kelvin }

double convert(double value, Unit from, Unit to) {
	if (from == to) return value;
	final celsius = switch (from) {
		Unit.celsius => value,
		Unit.fahrenheit => (value - 32) * 5 / 9,
		Unit.kelvin => value - 273.15,
	};
	return switch (to) {
		Unit.celsius => celsius,
		Unit.fahrenheit => celsius * 9 / 5 + 32,
		Unit.kelvin => celsius + 273.15,
	};
}

void main(List<String> arguments) {
	final parser = ArgParser()
		..addOption('from', mandatory: true, allowed: ['c', 'f', 'k'])
		..addOption('to', mandatory: true, allowed: ['c', 'f', 'k'])
		..addOption('value', mandatory: true);

	try {
		final results = parser.parse(arguments);
		final from = {'c': Unit.celsius, 'f': Unit.fahrenheit, 'k': Unit.kelvin}[results['from']]!;
		final to = {'c': Unit.celsius, 'f': Unit.fahrenheit, 'k': Unit.kelvin}[results['to']]!;
		final value = double.parse(results['value'] as String);
		print('${value.toStringAsFixed(2)}° ${results['from']} = ${convert(value, from, to).toStringAsFixed(2)}° ${results['to']}');
	} on FormatException catch (e) {
		print('Error: ${e.message}');
		print(parser.usage);
	}
}
```
::
**Goal**: a CLI tool with argument parsing, exhaustive switch, and error handling.

## Project 2 — Immutable Data Class with `freezed`

Model a user with `freezed` (chapter 7, 12, 18).

**Requirements**:
- Immutable `User` class (id, name, email, createdAt).
- `copyWith` for updates.
- Value equality (`==`/`hashCode`).
- JSON serialization (`fromJson`/`toJson`).
- A sealed `UserState` (loading, success, error).

::code-wrapper{language="dart"}
```dart
import 'package:freezed_annotation/freezed_annotation.dart';
part 'user.freezed.dart';
part 'user.g.dart';

@freezed
class User with _$User {
	const factory User({
		required int id,
		required String name,
		required String email,
		required DateTime createdAt,
	}) = _User;

	factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
}

@freezed
sealed class UserState with _$UserState {
	const factory UserState.loading() = _Loading;
	const factory UserState.success(User user) = _Success;
	const factory UserState.error(String message) = _Error;
}
```
::
**Goal**: an immutable data class with `freezed`, JSON, and a sealed state.

## Project 3 — Async GitHub API Client

Fetch data from the GitHub API (chapter 9, 11, 15).

**Requirements**:
- Fetch a user by username (`https://api.github.com/users/$username`).
- Fetch their repositories.
- Parse JSON into typed classes.
- Handle errors (404, network, rate limit).
- Parallel fetches (`Future.wait`).

::code-wrapper{language="dart"}
```dart
import 'package:http/http.dart' as http;
import 'dart:convert';

class GitHubApi {
	final _client = http.Client();

	Future<User> fetchUser(String username) async {
		final response = await _client.get(Uri.parse('https://api.github.com/users/$username'));
		if (response.statusCode == 404) throw UserNotFoundException(username);
		if (response.statusCode != 200) throw ApiException('HTTP ${response.statusCode}');
		return User.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
	}

	Future<List<Repo>> fetchRepos(String username) async {
		final response = await _client.get(Uri.parse('https://api.github.com/users/$username/repos'));
		if (response.statusCode != 200) throw ApiException('HTTP ${response.statusCode}');
		return (jsonDecode(response.body) as List).map((e) => Repo.fromJson(e as Map<String, dynamic>)).toList();
	}

	Future<({User user, List<Repo> repos})> fetchAll(String username) async {
		final userFuture = fetchUser(username);
		final reposFuture = fetchRepos(username);
		final results = await Future.wait([userFuture, reposFuture]);
		return (user: results[0] as User, repos: results[1] as List<Repo>);
	}
}

class UserNotFoundException implements Exception {
	final String username;
	UserNotFoundException(this.username);
	@override
	String toString() => 'User not found: $username';
}

class ApiException implements Exception {
	final String message;
	ApiException(this.message);
	@override
	String toString() => 'ApiException: $message';
}
```
::
**Goal**: an async API client with typed JSON, error handling, and parallel fetches.

## Project 4 — Stack and Queue with Generics and Tests

Implement a stack and queue, fully tested (chapter 6, 12, 14).

**Requirements**:
- Generic `Stack<T>` (push, pop, peek, isEmpty).
- Generic `Queue<T>` (enqueue, dequeue, peek, isEmpty).
- Throw `StateError` on empty pop/dequeue.
- Tests for all operations and edge cases (empty, overflow if bounded).

::code-wrapper{language="dart"}
```dart
class Stack<T> {
	final _items = <T>[];
	void push(T item) => _items.add(item);
	T pop() {
		if (_items.isEmpty) throw StateError('Stack is empty');
		return _items.removeLast();
	}
	T peek() {
		if (_items.isEmpty) throw StateError('Stack is empty');
		return _items.last;
	}
	bool get isEmpty => _items.isEmpty;
	int get length => _items.length;
}
```
::
::code-wrapper{language="dart"}
```dart
import 'package:test/test.dart';
import 'package:my_app/stack.dart';

void main() {
	group('Stack', () {
		late Stack<int> stack;

		setUp(() => stack = Stack<int>());

		test('push and pop', () {
			stack.push(1);
			stack.push(2);
			expect(stack.pop(), equals(2));
			expect(stack.pop(), equals(1));
		});

		test('pop on empty throws StateError', () {
			expect(() => stack.pop(), throwsStateError);
		});

		test('peek does not remove', () {
			stack.push(1);
			expect(stack.peek(), equals(1));
			expect(stack.length, equals(1));
		});

		test('isEmpty', () {
			expect(stack.isEmpty, isTrue);
			stack.push(1);
			expect(stack.isEmpty, isFalse);
		});
	});
}
```
::
**Goal**: generic collections with comprehensive tests.

## Project 5 — To-Do App (Flutter)

A Flutter to-do app (chapter 16).

**Requirements**:
- List of tasks (add, complete, delete).
- `StatefulWidget` + `setState` for local state.
- `ListView.builder` for the list.
- Persist to `shared_preferences` (JSON).
- Theme (light/dark).
- Form to add a task (TextField + button).

::code-wrapper{language="dart"}
```dart
import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

void main() => runApp(const TodoApp());

class TodoApp extends StatelessWidget {
	const TodoApp({super.key});

	@override
	Widget build(BuildContext context) {
		return MaterialApp(
			title: 'To-Do',
			theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue), useMaterial3: true),
			darkTheme: ThemeData.dark(useMaterial3: true),
			home: const TodoListScreen(),
		);
	}
}

class TodoListScreen extends StatefulWidget {
	const TodoListScreen({super.key});
	@override
	State<TodoListScreen> createState() => _TodoListScreenState();
}

class _TodoListScreenState extends State<TodoListScreen> {
	final _tasks = <Map<String, dynamic>>[];
	final _controller = TextEditingController();

	@override
	void initState() {
		super.initState();
		_loadTasks();
	}

	Future<void> _loadTasks() async {
		final prefs = await SharedPreferences.getInstance();
		final saved = prefs.getString('tasks');
		if (saved != null) {
			setState(() => _tasks.addAll((jsonDecode(saved) as List).cast<Map<String, dynamic>>()));
		}
	}

	Future<void> _saveTasks() async {
		final prefs = await SharedPreferences.getInstance();
		await prefs.setString('tasks', jsonEncode(_tasks));
	}

	void _addTask() {
		if (_controller.text.isEmpty) return;
		setState(() {
			_tasks.add({'title': _controller.text, 'done': false});
			_controller.clear();
		});
		_saveTasks();
	}

	void _toggleTask(int index) {
		setState(() => _tasks[index]['done'] = !_tasks[index]['done']);
		_saveTasks();
	}

	void _deleteTask(int index) {
		setState(() => _tasks.removeAt(index));
		_saveTasks();
	}

	@override
	Widget build(BuildContext context) {
		return Scaffold(
			appBar: AppBar(title: const Text('To-Do')),
			body: Column(
				children: [
					Padding(
						padding: const EdgeInsets.all(16),
						child: Row(
							children: [
								Expanded(child: TextField(controller: _controller, decoration: const InputDecoration(hintText: 'New task'))),
								IconButton(onPressed: _addTask, icon: const Icon(Icons.add)),
							],
						),
					),
					Expanded(
						child: ListView.builder(
							itemCount: _tasks.length,
							itemBuilder: (context, index) {
								final task = _tasks[index];
								return ListTile(
									title: Text(task['title'] as String, style: TextStyle(decoration: (task['done'] as bool) ? TextDecoration.lineThrough : null)),
									leading: Checkbox(value: task['done'] as bool, onChanged: (_) => _toggleTask(index)),
									trailing: IconButton(onPressed: () => _deleteTask(index), icon: const Icon(Icons.delete)),
								);
							},
						),
					),
				],
			),
		);
	}
}
```
::
**Goal**: a working Flutter app with state, persistence, and theming.

## Project 6 — REST API Server (`dart_frog`)

A REST API for tasks (chapter 17).

**Requirements**:
- `GET /tasks` — list all tasks.
- `POST /tasks` — create a task.
- `GET /tasks/[id]` — get a task.
- `DELETE /tasks/[id]` — delete a task.
- In-memory store (or SQLite).
- JSON request/response.
- Error handling (404, validation).

::code-wrapper{language="dart"}
```dart
// routes/tasks/index.dart
import 'package:dart_frog/dart_frog.dart';
import 'package:shared/data.dart';

Response onRequest(Request request) {
	if (request.method == HttpMethod.get) {
		return Response.json(body: store.all());
	}
	if (request.method == HttpMethod.post) {
		// parse body, validate, add
		return Response.json(body: {'created': true});
	}
	return Response(statusCode: HttpStatus.methodNotAllowed);
}
```
::
::code-wrapper{language="dart"}
```dart
// routes/tasks/[id].dart
import 'package:dart_frog/dart_frog.dart';

Response onRequest(RequestContext context, String id) {
	final task = store.get(id);
	if (task == null) return Response(statusCode: 404);
	if (context.request.method == HttpMethod.delete) {
		store.delete(id);
		return Response(statusCode: 204);
	}
	return Response.json(body: task);
}
```
::
**Goal**: a REST API with routing, JSON, and error handling.

## Project 7 — Full-Stack App (Capstone)

Build a full-stack app combining Dart (server) + Flutter (client) (all chapters).

**Requirements**:
- **Server** (`dart_frog`): REST API for a resource (e.g., blog posts, notes).
  - CRUD endpoints.
  - SQLite (`drift` ORM) for persistence.
  - Authentication (JWT or session).
  - Input validation, error handling.
  - Tests (`test` + `mocktail`).
- **Client** (Flutter):
  - List view, detail view, create/edit forms.
  - HTTP calls to the server (`http` package).
  - State management (Riverpod or Provider).
  - Navigation (`go_router`).
  - Theming (light/dark).
  - Offline support (cache to `shared_preferences`).
- **Shared**:
  - Shared data models (`freezed` + `json_serializable`) in a separate package.
  - Consistent types between client and server.
- **Tooling**:
  - `dart format` on save, `dart analyze` in CI, `dart test` in CI.
  - `build_runner` for code generation.
  - Docker for the server.
- **Bonus**:
  - WebSockets for real-time updates.
  - Isolates for CPU-heavy work (e.g., image processing on upload).
  - Server-side rendering (for web).
  - Full integration tests (client + server).

**Goal**: a production-quality full-stack Dart app demonstrating all skills — server, client, shared models, state management, testing, and deployment.

## Checklist

::code-wrapper{language="markdown"}
```markdown
- [ ] Sound null safety (no `!` abuse, proper `?`/`??`)
- [ ] `final`/`const` where possible
- [ ] Exhaustive switches (no `default` for enums/sealed)
- [ ] Proper error handling (specific catches, no broad `catch`)
- [ ] `async`/`await` (no unawaited futures)
- [ ] `Future.wait` for parallel operations
- [ ] Generics for type safety
- [ ] `dart format` applied
- [ ] `dart analyze` clean
- [ ] Tests for all logic (`test` + `mocktail`)
- [ ] Parameterized SQL queries (no injection)
- [ ] `dart:io` not used on web (conditional imports)
- [ ] `build_runner` generated files not edited
- [ ] `setState` only in event handlers (not in `build`)
- [ ] `const` widgets where possible (Flutter)
- [ ] `ListView.builder` for long lists (Flutter)
- [ ] `mounted` check after `await` (Flutter)
```
::
## Summary

You've applied the full Dart toolkit — from a CLI tool and immutable data classes to an async API client, generic collections with tests, a Flutter to-do app, a REST API server, and a capstone full-stack app. You can write sound null-safe Dart, use `async`/`await` and isolates, build classes/generics/mixins, test thoroughly, build Flutter UIs, serve REST APIs, and manage the toolchain — a production-quality Dart foundation.