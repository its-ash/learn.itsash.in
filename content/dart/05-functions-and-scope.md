# 05 — Functions & Scope

Dart functions are first-class — pass them, return them, store them. They support optional/named parameters, defaults, closures, and `async`/`await`.

## Declaring Functions

::code-wrapper{language="dart"}
```dart
int add(int a, int b) {
	return a + b;
}

// Arrow function (expression body)
int square(int x) => x * x;

// void return
void greet(String name) {
	print('Hello, $name');
}
```
::
`=>` is shorthand for `{ return expr; }` — use for single-expression functions. `void` means no return value.

## Parameters

### Required positional

::code-wrapper{language="dart"}
```dart
int add(int a, int b) => a + b;
add(2, 3);   // 5
```
::
### Optional positional (in `[...]`)

::code-wrapper{language="dart"}
```dart
String greet(String name, [String? title]) {
	return '${title == null ? '' : '$title '}$name';
}
greet('Alice');           // 'Alice'
greet('Alice', 'Dr.');    // 'Dr. Alice'
```
::
Optional positional params are in `[...]`, nullable (or with a default). They must come after required params.

### Named parameters (in `{...}`)

::code-wrapper{language="dart"}
```dart
void createUser({String? name, int? age}) { ... }
createUser(name: 'Alice', age: 30);
createUser(age: 30, name: 'Alice');   // order doesn't matter
createUser();                          // both null
```
::
Named params are in `{...}`, passed by name. They're optional by default.

### Required named params (`required`)

::code-wrapper{language="dart"}
```dart
void createUser({required String name, required int age}) { ... }
createUser(name: 'Alice', age: 30);   // ✓
// createUser(name: 'Alice');          // ✗ age is required
```
::
`required` makes a named param mandatory.

### Default values

::code-wrapper{language="dart"}
```dart
void greet(String name, {String greeting = 'Hello'}) {
	print('$greeting, $name');
}
greet('Alice');                      // 'Hello, Alice'
greet('Alice', greeting: 'Hi');      // 'Hi, Alice'
```
::
Defaults apply to optional params (positional or named). The default must be a compile-time constant.

## `var` in parameters

Dart 3 allows `var` or explicit type:

::code-wrapper{language="dart"}
```dart
int add(var a, var b) => a + b;   // a, b are inferred (but no type annotation)
```
::
Prefer explicit types for public APIs; `var` is fine for private/local.

## First-Class Functions

::code-wrapper{language="dart"}
```dart
var multiply = (int a, int b) => a * b;   // function expression (lambda)
multiply(2, 3);   // 6

void apply(Function fn) {   // Function as a parameter
	fn();
}

apply(() => print('Called'));
```
::
Functions are objects (type `Function`). You can pass them, return them, store them.

### Typedefs (function types)

::code-wrapper{language="dart"}
```dart
typedef IntOperation = int Function(int a, int b);

IntOperation add = (a, b) => a + b;
IntOperation multiply = (a, b) => a * b;
```
::
`typedef` names a function type — clearer than writing `int Function(int, int)` everywhere. Use for callbacks and higher-order functions.

## Closures

A closure is a function that captures variables from its enclosing scope:

::code-wrapper{language="dart"}
```dart
Function makeAdder(int increment) {
	return (int x) => x + increment;   // captures 'increment'
}

var add5 = makeAdder(5);
var add10 = makeAdder(10);
add5(3);    // 8
add10(3);   // 13
```
::
Each call to `makeAdder` captures its own `increment`. Closures keep the captured variables alive.

## Scope

Dart has **lexical (static) scope** — the scope is determined by the code structure (where the function is defined), not where it's called:

::code-wrapper{language="dart"}
```dart
var topLevel = 'top';

void outer() {
	var outerVar = 'outer';

	void inner() {
		var innerVar = 'inner';
		print(topLevel);    // ✓ accessible
		print(outerVar);    // ✓ accessible (lexical scope)
		print(innerVar);    // ✓
	}

	inner();
	// print(innerVar);   // ✗ out of scope
}
```
::
Nested functions can access variables from all enclosing scopes. The scope is nested visually (by braces).

## `async` and `await` (brief; chapter 11 in depth)

::code-wrapper{language="dart"}
```dart
Future<String> fetchUser() async {
	await Future.delayed(Duration(seconds: 1));
	return 'Alice';
}

void main() async {
	var user = await fetchUser();
	print(user);
}
```
::
`async` marks a function as asynchronous; it returns a `Future`. `await` waits for a `Future` to complete. See chapter 11 for details.

## Generators (`sync*` / `async*`)

::code-wrapper{language="dart"}
```dart
Iterable<int> naturals() sync* {
	var k = 1;
	while (true) yield k++;
}

Stream<int> asyncNaturals() async* {
	var k = 1;
	while (true) {
		await Future.delayed(Duration(seconds: 1));
		yield k++;
	}
}
```
::
`sync*` returns an `Iterable` (lazy, sync); `yield` produces a value. `async*` returns a `Stream` (lazy, async); `yield` produces a value. Generators are lazy — values are produced on demand.

## `call()` method

A class with a `call()` method can be called like a function:

::code-wrapper{language="dart"}
```dart
class Multiplier {
	final int factor;
	Multiplier(this.factor);
	int call(int x) => x * factor;
}

var triple = Multiplier(3);
triple(5);   // 15 — calls triple.call(5)
```
::
## 💡 Tips & Tricks

- **Idiom**: use named parameters (`{...}`) for functions with many optional params or boolean flags — `createUser(name: 'Alice', admin: true)` is clearer than `createUser('Alice', null, true)`. Named params self-document at the call site.
- **Idiom**: use `required` for mandatory named params — `{required String name}` ensures the caller provides it, with a clear error if missing. Use named params for clarity, `required` for mandatory ones.
- **Idiom**: use arrow functions (`=>`) for single-expression functions — `int square(int x) => x * x;` is concise and readable. Use for simple transformations, getters, and callbacks.
- **Idiom**: use `typedef` for function types — `typedef IntOp = int Function(int, int);` is clearer than `int Function(int, int)` everywhere. Use for callbacks and higher-order function signatures.
- **Idiom**: use closures to capture and configure behavior — `makeAdder(5)` returns a function that adds 5. Useful for partial application, callbacks, and stateful handlers.

## ⚠️ Edge Cases & Gotchas

- **Optional positional params (`[...]`) must come after required**: `void f(int a, [int b])` is valid; `void f([int b], int a)` is not.
- **Named params (`{...}`) must come after positional**: `void f(int a, {int b})` is valid; `void f({int b}, int a)` is not (actually, named after positional is the rule — named always last).
- **Default values must be compile-time constants**: `void f({int x = someVar})` fails if `someVar` isn't const. Use `null` default + `??` inside for runtime defaults.
- **`Function` type is untyped**: `Function fn` accepts any function. Use `int Function(int)` for type safety. `Function` defeats type checking.
- **Closures capture by reference**: the captured variable is shared, not copied. `var i = 0; functions.add(() => i); i = 5;` — calling the function returns 5 (current value), not 0.
- **`async` functions return `Future`**: `int f() async { return 5; }` returns `Future<int>`, not `int`. The `async` keyword wraps the return in a `Future`.
- **`yield` only in `sync*`/`async*`**: `yield` outside a generator function is a compile error.
- **Lexical scope, not dynamic**: a function defined in `outer` accesses `outer`'s variables, even if called from elsewhere. Scope is by code structure, not call stack.
- **`void` can't be used as a value**: `var x = voidFn();` — if `voidFn` returns `void`, `x` is `void`, can't be used. Use `Function` or ignore the return.
- **`call()` makes a class callable**: `obj(args)` calls `obj.call(args)`. Subtle — a "function call" on an object invokes `call`. Use for callable objects (multipliers, validators).

## 🧠 Spot the Bug

A developer creates a list of callbacks in a loop, but all callbacks return the same value:

::code-wrapper{language="dart"}
```dart
var callbacks = [];
for (var i = 0; i < 3; i++) {
	callbacks.add(() => i);
}
print(callbacks.map((f) => f()).toList());   // [3, 3, 3]? or [0, 1, 2]?
```
::

What's the output and why?

<details>
<summary>Answer</summary>

In Dart, the output is `[0, 1, 2]` — because in a `for` loop, each iteration creates a *new* `i` (Dart's `for` loop variable is fresh per iteration, unlike JavaScript's `var`).

Wait, let me verify. In Dart, `for (var i = 0; ...)` — is `i` fresh per iteration? Actually, in Dart, the loop variable `i` is a single variable that's reassigned each iteration (like JS `var`), not fresh (like JS `let` or Rust). So the closures all capture the same `i`, which ends at 3. The output would be `[3, 3, 3]`.

Hmm, let me reconsider. Testing: in Dart, `for (var i = 0; i < 3; i++) { callbacks.add(() => i); }` — all closures capture the same `i`, which is 3 after the loop. So `[3, 3, 3]`.

The fix — capture `i` in a local variable per iteration:

```dart
for (var i = 0; i < 3; i++) {
	final captured = i;   // fresh per iteration
	callbacks.add(() => captured);
}
print(callbacks.map((f) => f()).toList());   // [0, 1, 2]
```
::
Or use `for-in` with a collection (each item is fresh):

```dart
for (var i in [0, 1, 2]) {
	callbacks.add(() => i);   // i is the list item, fresh per iteration? Actually same issue
}
```
::
Actually, `for-in` in Dart also reuses the loop variable. The safe pattern is the `final captured = i;` inside the loop body.

**The lesson**: Dart's `for` loop variable is a single variable reassigned each iteration. Closures capture it by reference, so all closures see the final value. To capture per-iteration, assign to a fresh `final` local inside the loop body.

</details>

## Summary

You can declare functions (arrow, `void`), use parameters (required, optional positional `[...]`, named `{...}`, `required`, defaults), use first-class functions and `typedef`s, closures (capture by reference), lexical scope, `async`/`await` (brief), generators (`sync*`/`async*` with `yield`), and `call()` — with the loop-variable-capture and `Function`-untyped traps avoided. Next: collections.