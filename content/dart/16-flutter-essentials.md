---
title: "Dart — Flutter Widget Architecture & State Lifecycle"
description: "Deep-dive into Flutter's widget tree diffing, StatefulWidget lifecycle, const canonicalization for performance, build purity, context-after-await safety, and state management patterns. Code-first engineering reference."
---

# Dart — Flutter Widget Architecture & State Lifecycle

## Widget Tree — `const` Canonicalization & Rebuild Performance

::code-wrapper{language="dart"}
```dart
import 'package:flutter/material.dart';

// ── const widgets are canonicalized — zero allocation, zero rebuild ──
// The framework reuses the same instance. Mark every static widget const.

// ❌ Anti-pattern: non-const widgets in hot paths (rebuilds allocate + diff).
class BadList extends StatelessWidget {
  const BadList({super.key});
  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        Text('Header'),        // ← allocates a new Text each build
        Text('Item 1'),        // ← allocates again
        Icon(Icons.star),      // ← allocates again
      ],
    );
  }
}

// ✓ Correct: const widgets — canonicalized, reused, zero rebuild cost.
class GoodList extends StatelessWidget {
  const GoodList({super.key});
  @override
  Widget build(BuildContext context) {
    return ListView(
      children: const [
        Text('Header'),        // ← same instance every build (const)
        Text('Item 1'),        // ← same instance
        Icon(Icons.star),      // ← same instance
      ],
    );
  }
}

// ── const constructors enable const widgets ──
// A widget with a const constructor can be instantiated as const
// if all arguments are const-eligible.
class Greeting extends StatelessWidget {
  final String name;
  const Greeting({super.key, required this.name});  // const constructor

  @override
  Widget build(BuildContext context) {
    return Text('Hello, $name');
  }
}

// const usage — all args are compile-time constants:
const greeting = Greeting(name: 'World');  // canonicalized

// Non-const — runtime value, allocates:
final dynamicGreeting = Greeting(name: DateTime.now().toString());  // can't be const
```
::

## `StatefulWidget` Lifecycle — The Two-Class Design

::code-wrapper{language="dart"}
```dart
import 'package:flutter/material.dart';

// ── Why two classes? ──
// StatefulWidget (immutable): configuration. A new instance is created on
//   each parent rebuild.
// State (mutable, persisted): the mutable state + lifecycle. Flutter REUSES
//   the same State across widget rebuilds (matched by type + key).

class Counter extends StatefulWidget {
  final int initialCount;  // configuration — immutable, may change on rebuild
  const Counter({super.key, this.initialCount = 0});

  @override
  State<Counter> createState() => _CounterState();
}

class _CounterState extends State<Counter> {
  late int _count;  // mutable state — persists across parent rebuilds

  // ── Lifecycle methods (in order) ──

  @override
  void initState() {
    super.initState();
    // Runs ONCE when the State is created. Access widget.initialCount here.
    _count = widget.initialCount;
    // Start async work, subscribe to streams, etc. HERE (not in build).
    _startListening();
  }

  @override
  void didUpdateWidget(Counter oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Runs when the parent rebuilds with a NEW widget configuration.
    // widget.initialCount may have changed.
    if (widget.initialCount != oldWidget.initialCount) {
      _count = widget.initialCount;  // react to config changes
    }
  }

  @override
  void dispose() {
    // Runs ONCE when the State is removed from the tree. Cleanup HERE.
    _subscription.cancel();  // cancel stream subscriptions
    _controller.dispose();  // dispose TextEditingControllers
    super.dispose();
  }

  void _startListening() {
    _subscription = someStream.listen((event) {
      if (mounted) setState(() => _lastEvent = event);  // check mounted before setState
    });
  }

  late StreamSubscription _subscription;
  String? _lastEvent;

  void _increment() {
    // setState marks this State as dirty → triggers a rebuild of build().
    // The framework schedules a rebuild (not immediate).
    setState(() {
      _count++;
    });
  }

  @override
  Widget build(BuildContext context) {
    // ── build() MUST be pure ──
    // No side effects, no async work, no setState. It can be called many times.
    // It reads widget (config) and _count (state), returns a widget tree.
    return Column(
      children: [
        Text('Count: $_count'),
        if (_lastEvent != null) Text('Event: $_lastEvent'),
        ElevatedButton(
          onPressed: _increment,
          child: const Text('Increment'),
        ),
      ],
    );
  }
}
```
::

## `build()` Purity — The Side-Effect Trap

::code-wrapper{language="dart"}
```dart
import 'package:flutter/material.dart';

// ❌ Anti-pattern: side effects in build() — infinite loop or crash.
class BadWidget extends StatefulWidget {
  const BadWidget({super.key});
  @override
  State<BadWidget> createState() => _BadWidgetState();
}

class _BadWidgetState extends State<BadWidget> {
  String? _data;

  @override
  Widget build(BuildContext context) {
    // Side effect in build: starts a fetch on every rebuild.
    fetchData().then((data) {
      setState(() => _data = data);  // ← triggers rebuild → fetch again → loop!
    });
    return Text(_data ?? 'Loading...');
  }
}

// ✓ Correct: start async work in initState, check mounted before setState.
class GoodWidget extends StatefulWidget {
  const GoodWidget({super.key});
  @override
  State<GoodWidget> createState() => _GoodWidgetState();
}

class _GoodWidgetState extends State<GoodWidget> {
  String? _data;

  @override
  void initState() {
    super.initState();
    _loadData();  // runs once
  }

  Future<void> _loadData() async {
    final data = await fetchData();
    if (mounted) {  // ← the widget may have been disposed during the await
      setState(() => _data = data);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Text(_data ?? 'Loading...');  // pure — reads state, returns tree
  }
}

Future<String> fetchData() async {
  await Future.delayed(Duration(seconds: 1));
  return 'Hello';
}
```
::

## `BuildContext` — The `mounted` Check After Await

::code-wrapper{language="dart"}
```dart
import 'package:flutter/material.dart';

// After `await`, the widget may have been removed from the tree (navigated away,
// parent rebuilt without this child, etc.). Using `context` or `setState`
// after dispose throws ("setState/mounted called after dispose()").

class DetailPage extends StatefulWidget {
  const DetailPage({super.key});
  @override
  State<DetailPage> createState() => _DetailPageState();
}

class _DetailPageState extends State<DetailPage> {
  User? _user;

  @override
  void initState() {
    super.initState();
    _loadUser();
  }

  Future<void> _loadUser() async {
    _user = await fetchUser();  // may take seconds

    // ❌ Anti-pattern: using context or setState without checking mounted.
    // if (_user != null) setState(() {});  // ✗ may throw if disposed

    // ✓ Correct: check `mounted` (State property — true if still in the tree).
    if (!mounted) return;  // widget was disposed during await — abort
    setState(() {});  // safe — widget is still mounted
  }

  Future<void> _refresh() async {
    _user = await fetchUser();
    // Or use `context.mounted` (BuildContext property, Dart 3.7+):
    if (!context.mounted) return;
    setState(() {});  // safe
  }

  @override
  Widget build(BuildContext context) {
    // ❌ Anti-pattern: using context across an async gap inside build.
    // build() should be sync. But if you have a callback:
    return ElevatedButton(
      onPressed: () async {
        await Navigator.push(context, MaterialPageRoute(
          builder: (_) => const EditPage(),
        ));
        // After await: context may be unmounted if the user navigated away.
        if (!context.mounted) return;
        _refresh();  // safe to use context now
      },
      child: const Text('Edit'),
    );
  }
}

Future<User> fetchUser() async => User('Alice');
class User { final String name; User(this.name); }
class EditPage extends StatelessWidget {
  const EditPage({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(body: Text('Edit'));
}
```
::

## `ListView.builder` — Lazy Building for Long Lists

::code-wrapper{language="dart"}
```dart
import 'package:flutter/material.dart';

// ❌ Anti-pattern: ListView with all children — builds everything eagerly.
class BadListView extends StatelessWidget {
  final List<String> items;
  const BadListView({super.key, required this.items});

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: items.map((item) => ListTile(title: Text(item))).toList(),
    );
    // For 10,000 items, this builds 10,000 ListTiles upfront — slow, memory-heavy.
  }
}

// ✓ Correct: ListView.builder — builds only visible items (lazy).
class GoodListView extends StatelessWidget {
  final List<String> items;
  const GoodListView({super.key, required this.items});

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      itemCount: items.length,
      itemBuilder: (context, index) {
        return ListTile(title: Text(items[index]));
        // Only ~10-15 items are built (visible + a few cached). Scrolling builds more.
      },
    );
  }
}

// ── Keys for state preservation ──
// When items reorder, Flutter matches by type by default — state can jump
// to the wrong item. Use ValueKey to preserve state per item identity.
class KeyedListView extends StatelessWidget {
  final List<Item> items;
  const KeyedListView({super.key, required this.items});

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      itemCount: items.length,
      itemBuilder: (context, index) {
        final item = items[index];
        return ListTile(
          key: ValueKey(item.id),  // ← preserves state if this item reorders
          title: Text(item.title),
          leading: Checkbox(
            value: item.checked,
            onChanged: (val) => item.checked = val ?? false,
          ),
        );
      },
    );
  }
}

class Item {
  final String id;
  final String title;
  bool checked;
  Item(this.id, this.title, {this.checked = false});
}
```
::

## State Management — Provider/Riverpod

::code-wrapper{language="dart"}
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// ── Riverpod: compile-safe, no BuildContext needed ──

// A provider holds state and notifies listeners on change.
final counterProvider = StateNotifierProvider<CounterNotifier, int>((ref) {
  return CounterNotifier();
});

class CounterNotifier extends StateNotifier<int> {
  CounterNotifier() : super(0);

  void increment() => state++;
  void decrement() => state--;
  void reset() => state = 0;
}

// Consuming in a widget:
class CounterScreen extends ConsumerWidget {
  const CounterScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(counterProvider);  // rebuilds when count changes

    return Scaffold(
      body: Center(child: Text('Count: $count')),
      floatingActionButton: FloatingActionButton(
        onPressed: () => ref.read(counterProvider.notifier).increment(),
        child: const Icon(Icons.add),
      ),
    );
  }
}

// ── AsyncValue for async state (loading, data, error) ──
final userProvider = FutureProvider<User>((ref) async {
  return fetchUser();  // returns AsyncValue<User>
});

class UserWidget extends ConsumerWidget {
  const UserWidget({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncUser = ref.watch(userProvider);

    return asyncUser.when(
      loading: () => const CircularProgressIndicator(),
      error: (err, stack) => Text('Error: $err'),
      data: (user) => Text('Hello, ${user.name}'),
    );
  }
}
```
::

## 💡 Tips & Tricks

- **Performance**: mark every static widget `const` — `const Text('hello')` is canonicalized (one instance, reused across rebuilds). Zero allocation, zero diffing. Mark constructors `const` and use `const` at call sites. This is the #1 Flutter performance optimization.
- **Idiom**: `build()` must be pure — no side effects, no async work, no `setState`. It can be called many times (every rebuild). Start async work in `initState`, check `mounted` before `setState` (the widget may have been disposed while awaiting).
- **Idiom**: use `ListView.builder` (not `ListView` with all children) for long lists — it builds items lazily (only visible ones), efficient for 1000s of items. `ListView(children: [...])` builds all, slow for long lists.
- **Idiom**: use `ValueKey` for items that can reorder — Flutter matches by type by default, so state can jump to the wrong item on reorder. `key: ValueKey(item.id)` preserves state per item identity.
- **Idiom**: use `Theme.of(context)` for styling — `Theme.of(context).colorScheme.primary` instead of hardcoding colors. Adapts to light/dark mode and centralizes the design system. Access in `build` (reactive to theme changes).

## ⚠️ Edge Cases & Gotchas

- **`build()` must be pure**: `build` can be called many times (every rebuild). Don't start async work, mutate state, or do I/O in `build`. Use `initState` for setup.
- **`setState` in `build` or `initState`**: `setState` in `build` causes an infinite loop. In `initState`, use `WidgetsBinding.instance.addPostFrameCallback` to defer.
- **`const` widgets are canonicalized**: `const Text('hi')` is the same instance everywhere. Good for perf. But a `const` widget can't use runtime values — only compile-time constants.
- **`BuildContext` across async gaps**: after `await`, the `context` may be unmounted (the widget was disposed). Check `if (!context.mounted) return;` before using `context` after `await` (Dart 3.7+). Or check `mounted` (State property).
- **`StatefulWidget`'s state persists across widget rebuilds**: a new `MyWidget` instance on parent rebuild, but Flutter reuses the `State` (matched by type/key). The state isn't lost.
- **`Key` for state preservation**: when a widget's position in the tree changes (e.g., list reorders), Flutter matches by type by default — state can be lost. Use `key: ValueKey(id)` to preserve state across reorders.
- **`ListView.builder` for long lists**: `ListView(children: [...])` builds all children eagerly — slow for 1000s of items. `ListView.builder` is lazy (only visible items).
- **`MediaQuery.of(context)` for screen size**: `MediaQuery.of(context).size.width` — access screen dimensions. Call in `build` (reactive to orientation/size changes).
- **Platform channels for native code**: most native features (camera, sensors) are in packages. Use platform channels only for custom native code. It's verbose (Kotlin/Swift handler).
- **Hot reload vs state**: hot reload preserves state (great for iteration). But some changes (e.g., `initState` logic) need a hot restart (`R`) to take effect.

## 🧠 Spot the Bug

A developer fetches data in `build()` and calls `setState` when it completes, but the app loops:

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

Two problems — what are they?

<details>
<summary>Answer</summary>

1. **Infinite loop**: `build()` calls `fetchData()`. When the fetch completes, `setState` triggers a rebuild. `build()` runs again, calling `fetchData()` again. The fetch completes, `setState` fires, `build()` runs, fetch starts... infinite loop.

2. **`setState` after dispose**: if the widget is unmounted (navigated away) before the fetch completes, `setState` throws `"setState() called after dispose()"`.

The fix — start the fetch in `initState` (runs once), and check `mounted` before `setState`:

```dart
@override
void initState() {
  super.initState();
  _loadData();  // runs once, not on every build
}

Future<void> _loadData() async {
  final data = await fetchData();
  if (mounted) {  // widget may have been disposed during the await
    setState(() => _data = data);
  }
}

@override
Widget build(BuildContext context) {
  return Text(_data ?? 'Loading...');  // pure — reads state, returns tree
}
```

`initState` runs once when the State is created. `if (mounted)` checks the widget is still in the tree before `setState` (avoids the "setState after dispose" error). `build()` is now pure — no side effects.

</details>