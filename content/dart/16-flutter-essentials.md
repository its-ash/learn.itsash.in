# 16 — Flutter Essentials

Flutter is Google's UI toolkit for building natively-compiled apps from a single Dart codebase — mobile (iOS, Android), web, desktop. Dart is Flutter's language.

## What is Flutter?

- **Widget-based** — everything is a widget (buttons, layouts, padding, even the app itself).
- **Declarative** — you describe the UI state; Flutter builds/rebuilds the widget tree.
- **Skia/Impeller** — renders directly to Canvas (not native UI components), so it looks identical across platforms.
- **Hot reload** — see changes in <1 second during development (JIT).
- **Single codebase** — iOS, Android, web, desktop (Windows, macOS, Linux) from one codebase.

## Setup

::code-wrapper{language="bash"}
```bash
# Install Flutter (includes Dart)
# macOS
brew install --cask flutter

# Or download from https://flutter.dev

flutter doctor   # check installation
```
::
## Your First Flutter App

::code-wrapper{language="bash"}
```bash
flutter create my_app
cd my_app
flutter run
```
::
`lib/main.dart`:

::code-wrapper{language="dart"}
```dart
import 'package:flutter/material.dart';

void main() {
	runApp(const MyApp());
}

class MyApp extends StatelessWidget {
	const MyApp({super.key});

	@override
	Widget build(BuildContext context) {
		return MaterialApp(
			title: 'My App',
			home: Scaffold(
				appBar: AppBar(title: const Text('Home')),
				body: const Center(
					child: Text('Hello, Flutter!'),
				),
			),
		);
	}
}
```
::
- `runApp()` — starts the app with the root widget.
- `MaterialApp` — a Material Design app wrapper (theme, routing).
- `Scaffold` — a basic page structure (AppBar, body, FAB, drawer).
- `StatelessWidget` — a widget with no mutable state (renders from props).
- `build()` — describes the widget tree; called on rebuild.

## Widgets

### StatelessWidget

A widget that doesn't change (renders from its constructor params):

::code-wrapper{language="dart"}
```dart
class Greeting extends StatelessWidget {
	final String name;
	const Greeting({super.key, required this.name});

	@override
	Widget build(BuildContext context) {
		return Text('Hello, $name!');
	}
}
```
::
### StatefulWidget

A widget with mutable state (rebuilds when state changes):

::code-wrapper{language="dart"}
```dart
class Counter extends StatefulWidget {
	const Counter({super.key});

	@override
	State<Counter> createState() => _CounterState();
}

class _CounterState extends State<Counter> {
	int _count = 0;

	@override
	Widget build(BuildContext context) {
		return Column(
			children: [
				Text('Count: $_count'),
				ElevatedButton(
					onPressed: () => setState(() => _count++),
					child: const Text('Increment'),
				),
			],
		);
	}
}
```
::
`setState()` triggers a rebuild with the new state. The `build` method re-runs, producing a new widget tree. Flutter diffs and updates the UI.

### Why the two classes?

`StatefulWidget` is immutable (the widget itself); `_CounterState` is mutable (persisted across rebuilds). When the parent rebuilds, a new `Counter` widget is created, but Flutter reuses the existing `_CounterState` (matched by type and key). This separates configuration (widget) from state (state object).

## Layout Widgets

### `Column` / `Row` (flex)

::code-wrapper{language="dart"}
```dart
Column(
	mainAxisAlignment: MainAxisAlignment.center,
	crossAxisAlignment: CrossAxisAlignment.start,
	children: [
		Text('Item 1'),
		Text('Item 2'),
		ElevatedButton(onPressed: () {}, child: Text('Button')),
	],
)

Row(
	children: [
		Expanded(child: Text('Left')),   // takes available space
		Text('Right'),
	],
)
```
::
`Column` is vertical (like flexbox column), `Row` is horizontal. `MainAxisAlignment`/`CrossAxisAlignment` align. `Expanded` fills available space (like `flex: 1`).

### `Container` (div)

::code-wrapper{language="dart"}
```dart
Container(
	padding: const EdgeInsets.all(16),
	margin: const EdgeInsets.symmetric(horizontal: 8),
	decoration: BoxDecoration(
		color: Colors.blue,
		borderRadius: BorderRadius.circular(8),
	),
	child: const Text('In a container'),
)
```
::
`Container` is a multi-purpose widget — padding, margin, decoration (color, border, shadow), constraints, child. Like an HTML `div`.

### `Stack` (positioning)

::code-wrapper{language="dart"}
```dart
Stack(
	children: [
		Image.network('url'),
		Positioned(
			bottom: 16,
			right: 16,
			child: Text('Overlay'),
		),
	],
)
```
::
`Stack` layers children; `Positioned` places a child at specific coordinates.

### `ListView`

::code-wrapper{language="dart"}
```dart
ListView.builder(
	itemCount: items.length,
	itemBuilder: (context, index) {
		return ListTile(title: Text(items[index]));
	},
)
```
::
`ListView.builder` builds items lazily (only visible items are built) — efficient for long lists. Use `ListView` (non-builder) for short lists.

### `GridView`

::code-wrapper{language="dart"}
```dart
GridView.builder(
	gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
		crossAxisCount: 2,   // 2 columns
		mainAxisSpacing: 8,
		crossAxisSpacing: 8,
	),
	itemCount: items.length,
	itemBuilder: (context, index) => Card(child: Text(items[index])),
)
```
::
### `Padding`, `Center`, `SizedBox`

::code-wrapper{language="dart"}
```dart
Padding(
	padding: const EdgeInsets.all(16),
	child: Text('Padded'),
)

Center(child: Text('Centered'))

SizedBox(height: 16)   // spacer
SizedBox(width: 100, height: 100, child: Text('Fixed size'))
```
::
## Hot Reload

- **Hot reload** (`r` in the terminal) — injects new code without losing state. <1 second.
- **Hot restart** (`R`) — restarts the app, loses state. Use when hot reload isn't enough.
- **Full restart** — stops and restarts (for native code changes).

## Navigation

::code-wrapper{language="dart"}
```dart
// Push a route
Navigator.push(
	context,
	MaterialPageRoute(builder: (context) => const DetailPage()),
);

// Pop back
Navigator.pop(context);
```
::
For named routes, declare in `MaterialApp(routes: {...})` and use `Navigator.pushNamed(context, '/detail')`.

## State Management

Simple state: `setState` (local to a `StatefulWidget`). For app-wide state, use a package:
- **Provider** — simple, official, `ChangeNotifier` + `Provider`.
- **Riverpod** — modern, compile-safe, provider-based.
- **Bloc/Cubit** — event-driven, scalable.
- **GetX** — popular but opinionated.

::code-wrapper{language="dart"}
```dart
// Provider example
class CounterModel extends ChangeNotifier {
	int _count = 0;
	int get count => _count;

	void increment() {
		_count++;
		notifyListeners();   // triggers rebuild of listeners
	}
}

// In a widget:
ChangeNotifierProvider(
	create: (_) => CounterModel(),
	child: Consumer<CounterModel>(
		builder: (context, model, child) {
			return Text('${model.count}');
		},
	),
)
```
::
## Themes

::code-wrapper{language="dart"}
```dart
MaterialApp(
	theme: ThemeData(
		colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
		useMaterial3: true,
	),
	darkTheme: ThemeData.dark(),
)
```
::
`ThemeData` customizes colors, typography, shapes. `darkTheme` for dark mode (auto-switches with the OS). Access via `Theme.of(context)` in widgets.

## Platform Channels (native interop)

For platform-specific code (sensors, native APIs), use platform channels:

::code-wrapper{language="dart"}
```dart
import 'package:flutter/services.dart';

const platform = MethodChannel('com.example.app/battery');

Future<int> getBatteryLevel() async {
	final level = await platform.invokeMethod('getBatteryLevel');
	return level;
}
```
::
The native side (Kotlin/Swift) implements the channel handler. Use for features Flutter doesn't expose (most are in packages though).

## Packages

[pub.dev](https://pub.dev) has thousands of Flutter packages. Add to `pubspec.yaml`:

::code-wrapper{language="yaml"}
```yaml
dependencies:
	flutter:
		sdk: flutter
	cupertino_icons: ^1.0.0
	http: ^1.0.0
	provider: ^6.0.0
```
::
Popular packages: `http`, `provider`/`riverpod`/`bloc`, `go_router` (routing), `shared_preferences` (key-value storage), `sqflite` (SQLite), `image_picker`, `flutter_svg`.

## 💡 Tips & Tricks

- **Idiom**: use `StatelessWidget` for widgets without mutable state, `StatefulWidget` only when needed — most widgets are stateless (render from props). `StatefulWidget` + `setState` is for local interactive state. Overusing `StatefulWidget` adds boilerplate.
- **Idiom**: use `ListView.builder` (not `ListView` with all children) for long lists — it builds items lazily (only visible ones), efficient for 1000s of items. `ListView(children: [...])` builds all, slow for long lists.
- **Idiom**: use `const` widgets where possible — `const Text('hello')` is canonicalized (one instance, reused). Reduces rebuilds and memory. Mark constructors `const` and use `const` at call sites.
- **Idiom**: use `Provider`/`Riverpod` for app-wide state (not just `setState`) — `setState` is local; for state shared across widgets, use a state management package. Provider is simple; Riverpod is modern and compile-safe.
- **Idiom**: use `Theme.of(context)` for styling — access the theme (`Theme.of(context).colorScheme.primary`) instead of hardcoding colors. Adapts to light/dark mode and centralizes the design system.

## ⚠️ Edge Cases & Gotchas

- **`build()` must be pure (no side effects)**: `build` can be called many times (every rebuild). Don't start async work, mutate state, or do I/O in `build`. Use `initState` for setup.
- **`setState` in `build` or `initState`**: `setState` in `build` causes an infinite loop. In `initState`, use `WidgetsBinding.instance.addPostFrameCallback` to defer.
- **`const` widgets are canonicalized**: `const Text('hi')` is the same instance everywhere. Good for perf. But a `const` widget can't use runtime values — only compile-time constants.
- **`Key` for state preservation**: when a widget's position in the tree changes (e.g., list reorders), Flutter matches by type by default — state can be lost. Use `key: ValueKey(id)` to preserve state across reorders.
- **`ListView.builder` for long lists**: `ListView(children: [...])` builds all children eagerly — slow for 1000s of items. `ListView.builder` is lazy (only visible items).
- **`BuildContext` across async gaps**: after `await`, the `context` may be unmounted (the widget was disposed). Check `if (!context.mounted) return;` before using `context` after `await`.
- **`StatefulWidget`'s state persists across widget rebuilds**: a new `MyWidget` instance on parent rebuild, but Flutter reuses the `State` (matched by type/key). The state isn't lost.
- **`MediaQuery.of(context)` for screen size**: `MediaQuery.of(context).size.width` — access screen dimensions. Call in `build` (reactive to orientation/size changes).
- **Platform channels for native code**: most native features (camera, sensors) are in packages. Use platform channels only for custom native code. It's verbose (Kotlin/Swift handler).
- **Hot reload vs state**: hot reload preserves state (great for iteration). But some changes (e.g., `initState` logic) need a hot restart (`R`) to take effect.

## 🧠 Spot the Bug

A developer starts an async operation in `build()` and calls `setState` when it completes, but the app crashes or loops:

::code-wrapper{language="dart"}
```dart
@override
Widget build(BuildContext context) {
	fetchData().then((data) {
		setState(() => _data = data);
	});
	return Text(_data ?? 'Loading...');
}
```
::

What's wrong?

<details>
<summary>Answer</summary>

Two problems:

1. **`build()` is called on every rebuild** — calling `fetchData()` in `build` starts a new fetch every time. When the fetch completes and `setState` is called, `build` runs again, starting *another* fetch, which completes and calls `setState` again... an infinite loop of fetches and rebuilds.

2. **`setState` after the widget is disposed**: if the widget is unmounted (navigated away) before the fetch completes, `setState` throws ("setState() called after dispose()").

The fix — start the fetch in `initState` (runs once), and check `mounted` before `setState`:

```dart
@override
void initState() {
	super.initState();
	fetchData().then((data) {
		if (mounted) setState(() => _data = data);
	});
}

@override
Widget build(BuildContext context) {
	return Text(_data ?? 'Loading...');
}
```
::
Or with `async`/`await`:

```dart
@override
void initState() {
	super.initState();
	_loadData();
}

Future<void> _loadData() async {
	final data = await fetchData();
	if (mounted) setState(() => _data = data);
}
```
::
`initState` runs once when the widget is created. `if (mounted)` checks the widget is still in the tree before `setState` (avoids the "setState after dispose" error).

**The lesson**: `build()` must be pure — no side effects (no async work, no `setState`). Start async work in `initState`, and check `mounted` before `setState` (the widget may have been disposed while awaiting).

</details>

## Summary

You can build Flutter apps (`StatelessWidget`/`StatefulWidget`, `setState`), use layout widgets (`Column`/`Row`, `Container`, `Stack`, `ListView.builder`, `GridView`), navigate (`Navigator`), manage state (`setState` local, `Provider`/`Riverpod` app-wide), theme (`ThemeData`), hot reload, use packages, and call native code (platform channels) — with the build-is-pure and mounted-check traps avoided. Next: server-side Dart.