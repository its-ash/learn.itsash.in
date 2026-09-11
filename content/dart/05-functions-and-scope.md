---
title: "Dart — Functions, Closures & Generator Semantics"
description: "Deep-dive into Dart function parameter semantics, closure capture mechanics, typedef usage, sync/async generators, and callable classes. Code-first engineering reference."
---

# Dart — Functions, Closures & Generator Semantics

## Parameter Architecture — Positional, Named, Required

::code-wrapper{language="dart"}
```dart
// Dart has three parameter categories with strict ordering rules:
// 1. Required positional (no brackets)
// 2. Optional positional (in [...])
// 3. Named parameters (in {...}) — optional or `required`

// All three can coexist, but order is mandatory:
void createServer(
  String host,              // required positional (must come first)
  int port,                 // required positional
  [String? certPath]        // optional positional (nullable or with default)
  , {
  required String name,     // required named (must be provided by name)
  int backlog = 128,        // optional named with default
  bool tls = false,         // optional named with default
}) {
  // ...
}

createServer('0.0.0.0', 8080, '/cert.pem', name: 'api', tls: true);
createServer('0.0.0.0', 8080, name: 'api');  // certPath omitted, backlog=128, tls=false

// ❌ Anti-pattern: boolean positional flags — unclear at the call site.
void init(bool debug, bool verbose, bool color) { ... }
init(true, false, true);  // what do these mean?!

// ✓ Correct: named parameters for booleans and options.
void init({bool debug = false, bool verbose = false, bool color = true}) { ... }
init(debug: true, color: false);  // self-documenting

// Default values must be compile-time constants:
void configure({Duration timeout = const Duration(seconds: 30)}) { ... }
// void configure({String dir = getHomeDir()}) { ... }  // ✗ not a const
// ✓ Use null default + ?? for runtime defaults:
void configure({String? dir}) {
  final resolved = dir ?? getHomeDir();  // runtime default
}
```
::

## Closures — Capture Semantics & Memory

::code-wrapper{language="dart"}
```dart
// Closures capture variables BY REFERENCE (not by value) from the enclosing scope.
// The captured variable stays alive as long as the closure exists (GC root).

// Each invocation of makeAdder creates a NEW `increment` on the stack,
// and the returned closure captures it — each closure has its own `increment`.
Function makeAdder(int increment) {
  return (int x) => x + increment;  // captures `increment` from this invocation
}

var add5 = makeAdder(5);
var add10 = makeAdder(10);
print(add5(3));   // 8  — its own captured increment=5
print(add10(3));  // 13 — its own captured increment=10

// ❌ Anti-pattern: closures in a loop capture the loop variable (shared, mutated).
var handlers = <void Function()>[];
for (var i = 0; i < 3; i++) {
  handlers.add(() => print(i));
}
handlers.forEach((f) => f());  // 3, 3, 3 — all see the final value of i

// ✓ Correct: capture per-iteration in a final local.
var handlersFixed = <void Function()>[];
for (var i = 0; i < 3; i++) {
  final j = i;  // fresh, immutable per iteration
  handlersFixed.add(() => print(j));
}
handlersFixed.forEach((f) => f());  // 0, 1, 2

// Memory implication: closures keep captured variables alive (prevent GC).
// A closure stored in a long-lived collection can extend a variable's lifetime
// beyond its expected scope — be careful in long-running processes.
```
::

## Typedefs & Function Types

::code-wrapper{language="dart"}
```dart
// Typedefs name function types — use for callbacks, handlers, strategy patterns.
typedef Validator<T> = String? Function(T value);  // returns error message or null

// Generic function type:
typedef Mapper<S, T> = T Function(S source);

// Using the typedef in APIs:
class FormField<T> {
  final Validator<T> validator;
  FormField(this.validator);

  String? validate(T value) => validator(value);
}

// Type-safe handler registration:
typedef EventHandler<T extends Event> = void Function(T event);

class EventBus {
  final _handlers = <Type, List<Function>>{};

  void subscribe<T extends Event>(EventHandler<T> handler) {
    (_handlers[T] ??= <Function>[]).add(handler);
  }

  void publish<T extends Event>(T event) {
    for (final h in _handlers[T] ?? []) {
      (h as EventHandler<T>)(event);
  }
  }
}

// ❌ Anti-pattern: using `Function` (untyped) — accepts anything, no type safety.
void registerCallback(Function fn) { ... }  // any function signature accepted

// ✓ Correct: use a function type or typedef.
void registerCallback(EventHandler<Click> fn) { ... }  // only the right signature
```
::

## Generators — `sync*` and `async*`

::code-wrapper{language="dart"}
```dart
// sync* returns a lazy Iterable — values produced on demand (pull-based).
// The generator suspends at each `yield` and resumes when the next value is requested.
Iterable<int> fibonacci() sync* {
  var a = 0, b = 1;
  while (true) {
    yield a;          // suspend here, resume on next iteration
    final next = a + b;
    a = b;
    b = next;
  }
}

// Take only what you need — infinite sequence, finite consumption:
print(fibonacci().take(10).toList());  // [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
// `.take(10)` pulls 10 values; the generator never runs beyond that.

// yield* delegates to another generator (flattens):
Iterable<int> naturals(int n) sync* {
  yield* List.generate(n, (i) => i + 1);  // yields all elements of the iterable
}

// async* returns a lazy Stream — values produced over time (push-based).
// Each `yield` emits to the listener; the generator suspends until the
// listener requests more (single-subscription) or the stream is listened to.
Stream<int> timedCounter(int max, Duration interval) async* {
  for (var i = 1; i <= max; i++) {
    await Future.delayed(interval);  // async pause between emissions
    yield i;  // emit value to listener
  }
}

// Consuming:
void main() async {
  await for (final n in timedCounter(5, Duration(seconds: 1))) {
    print(n);  // 1 (after 1s), 2 (after 2s), ..., 5 (after 5s)
  }
}

// yield* with async* delegates to another stream:
Stream<int> mergedStream() async* {
  yield* timedCounter(3, Duration(seconds: 1));  // emits 1, 2, 3
  yield* timedCounter(3, Duration(seconds: 2));  // then emits 1, 2, 3 (slower)
}
```
::

## Callable Classes — `call()` Method

::code-wrapper{language="dart"}
```dart
// A class with a `call()` method can be invoked like a function.
// This enables objects that are also functions — useful for validators,
// comparators, state machines, and DSLs.

class Validator {
  final List<String? Function(String)> _rules;
  Validator(this._rules);

  // `call` allows `validator(value)` syntax — invokes this method.
  String? call(String value) {
    for (final rule in _rules) {
      final error = rule(value);
      if (error != null) return error;
    }
    return null;
  }

  // Compose validators with operator overloading:
  Validator operator +(Validator other) => Validator([..._rules, ...other._rules]);
}

final emailValidator = Validator([
  (s) => s.isEmpty ? 'Required' : null,
  (s) => !s.contains('@') ? 'Invalid email' : null,
]);

// Called like a function (invokes `call`):
print(emailValidator('test@example.com'));  // null (valid)
print(emailValidator(''));                   // 'Required'
print(emailValidator('no-at-sign'));         // 'Invalid email'

// Use case: comparator objects for sort:
class ByLength {
  int call(String a, String b) => a.length.compareTo(b.length);
}
var words = ['banana', 'hi', 'cherry'];
words.sort(ByLength());  // sort by length: ['hi', 'banana', 'cherry']
```
::

## 💡 Tips & Tricks

- **Idiom**: use `required` named parameters for mandatory arguments — `{required String apiKey}` ensures the caller provides it with a clear compile error if missing. Named parameters self-document at the call site: `createClient(apiKey: '...', timeout: 30)`.
- **Idiom**: use `sync*` generators for lazy sequences — `Iterable<int> gen() sync* { for (...) yield i; }` produces values on demand. Zero allocation until iterated. Use for infinite sequences, large computed ranges, and pull-based pipelines.
- **Idiom**: use `async*` for time-series streams — `Stream<T> events() async* { while (...) { await wait; yield event; } }` produces values over time. Use for polling, sensor data, and push-based pipelines.
- **Idiom**: use `typedef` for function types in public APIs — `typedef Validator<T> = String? Function(T value)` is clearer than `String? Function(T)` repeated everywhere. Enables generic function types in signatures.
- **Idiom**: use `call()` for callable domain objects — `validator(value)` is cleaner than `validator.validate(value)`. Use for validators, comparators, strategy objects that are "functions with state."

## ⚠️ Edge Cases & Gotchas

- **Optional positional params (`[...]`) must come after required**: `void f(int a, [int b])` is valid; `void f([int b], int a)` is a compile error.
- **Named params (`{...}`) must come after all positional params**: `void f(int a, {int b})` is valid; `void f({int b}, int a)` is a compile error.
- **Default values must be compile-time constants**: `void f({int x = someRuntimeVar})` fails. Use `null` default + `??` inside for runtime defaults.
- **`Function` type is untyped**: `Function fn` accepts any function signature — no type safety. Use `void Function(int)` or a `typedef` instead.
- **Closures capture by reference, not value**: the captured variable is shared. `var i = 0; var f = () => i; i = 5; f()` returns `5`, not `0`. For per-iteration capture, use `final captured = i;`.
- **`async` functions return `Future`**: `int f() async { return 5; }` returns `Future<int>`, not `int`. The `async` keyword wraps the return in a `Future`. `Future<void> f() async {}` for async functions with no return value.
- **`yield` only in `sync*`/`async*`**: using `yield` outside a generator function is a compile error. Regular functions can't yield.
- **`sync*` iterables are lazy and re-evaluate**: each iteration re-runs the generator. `var gen = fibonacci(); gen.take(10).toList(); gen.take(10).toList();` runs the generator twice. Cache with `.toList()` if you need to iterate multiple times.
- **`async*` streams are single-subscription by default**: listening twice throws `StateError`. Use `.asBroadcastStream()` for multiple listeners (but loses pause/resume/buffering guarantees).
- **Lexical scope, not dynamic**: a function defined in `outer` accesses `outer`'s variables even if called from elsewhere. Scope is determined by code structure, not the call stack.

## 🧠 Spot the Bug

A developer creates event handlers in a loop, but all handlers report the same button index:

::code-wrapper{language="dart"}
```dart
for (var i = 0; i < buttons.length; i++) {
  buttons[i].onClick.listen((_) => handleClick(i));
}
```
::

When any button is clicked, `handleClick` always receives `buttons.length`. Why?

<details>
<summary>Answer</summary>

The closure `(_) => handleClick(i)` captures `i` **by reference**. Dart's `for` loop variable `i` is a single variable reassigned each iteration (not fresh per iteration like JS `let`). All closures capture the same `i`, which ends at `buttons.length` after the loop. When any button is clicked, the closure reads the current value of `i` — `buttons.length`.

The fix — capture `i` in a `final` local per iteration:

```dart
for (var i = 0; i < buttons.length; i++) {
  final index = i;  // fresh, immutable per iteration
  buttons[i].onClick.listen((_) => handleClick(index));
}
```

Now each closure captures its own `index`, which is immutable and holds the correct value for that iteration. `handleClick(0)`, `handleClick(1)`, etc.

</details>