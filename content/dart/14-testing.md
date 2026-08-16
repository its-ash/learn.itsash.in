# 14 — Testing

Dart's `test` package provides a clean testing framework. Tests go in `test/` and run with `dart test`.

## Setup

::code-wrapper{language="bash"}
```bash
dart pub add dev:test
```

::code-wrapper{language="yaml"}
```yaml
dev_dependencies:
	test: ^1.24.0
```

## Your First Test

`test/strings_test.dart`:

::code-wrapper{language="dart"}
```dart
import 'package:test/test.dart';

void main() {
	test('String.toUpperCase() converts to uppercase', () {
		expect('hello'.toUpperCase(), equals('HELLO'));
	});

	test('String.split() splits on delimiter', () {
		expect('a,b,c'.split(','), equals(['a', 'b', 'c']));
	});
}
```

### Run

::code-wrapper{language="bash"}
```bash
dart test                 # run all tests
dart test test/strings_test.dart   # run a specific file
```

## Matchers

`expect(actual, matcher)` checks the actual value against a matcher:

::code-wrapper{language="dart"}
```dart
expect(value, equals(42));
expect(value, isTrue);
expect(value, isFalse);
expect(value, isNull);
expect(value, isNotNull);
expect(value, isA<int>());
expect(value, isEmpty);
expect(value, isNotEmpty);
expect(list, contains(3));
expect(list, containsAll([1, 2]));
expect(list, hasLength(3));
expect(string, startsWith('hello'));
expect(string, endsWith('world'));
expect(string, contains('ell'));
expect(num, closeTo(3.14, 0.01));
expect(fn, throwsException);
expect(fn, throwsA(isA<ArgumentError>()));
expect(fn, throwsArgumentError);
```

### Custom matchers

::code-wrapper{language="dart"}
```dart
expect(value, predicate((v) => v > 0, 'is positive'));
```

## `group`

::code-wrapper{language="dart"}
```dart
void main() {
	group('Stack', () {
		test('push adds an item', () { ... });
		test('pop removes the top item', () { ... });
		test('pop on empty throws', () { ... });
	});

	group('Queue', () {
		test('enqueue adds to the back', () { ... });
	});
}
```

`group` organizes related tests — the output shows the group hierarchy.

## `setUp` and `tearDown`

::code-wrapper{language="dart"}
```dart
void main() {
	late Stack<int> stack;

	setUp(() {
		stack = Stack<int>();
		stack.push(1);
		stack.push(2);
	});

	tearDown(() {
		// cleanup (if needed)
	});

	test('pop returns the top', () {
		expect(stack.pop(), equals(2));
	});

	test('push then pop', () {
		stack.push(3);
		expect(stack.pop(), equals(3));
	});
}
```

`setUp` runs before each test; `tearDown` runs after. They can be async (`setUp(() async { ... })`).

## Testing Async

::code-wrapper{language="dart"}
```dart
test('async fetch returns data', () async {
	var data = await fetchData();
	expect(data, equals('hello'));
});

test('future completes', () async {
	await expectLater(future, completion(equals(42)));
});

test('future throws', () async {
	await expectLater(
		Future.error(Exception('bad')),
		throwsA(isA<Exception>()),
	);
});
```

For async tests, make the test function `async` and `await` — the framework waits for completion.

## Mocking with `mockito`

::code-wrapper{language="bash"}
```bash
dart pub add dev:mockito dev:build_runner
```

::code-wrapper{language="dart"}
```dart
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';

@GenerateMocks([HttpClient])
import 'http_test.mocks.dart';

void main() {
	test('fetch returns body', () async {
		final client = MockHttpClient();
		when(client.get('url')).thenAnswer((_) async => 'body');

		var result = await fetch(client);
		expect(result, equals('body'));
		verify(client.get('url')).called(1);
	});
}
```

`@GenerateMocks` generates mock classes; run `dart run build_runner build` to generate. `when(...).thenAnswer/thenReturn/thenThrow` stubs methods; `verify` checks calls.

## Mocking with `mocktail` (simpler)

::code-wrapper{language="dart"}
```dart
import 'package:mocktail/mocktail.dart';

class MockHttpClient extends Mock implements HttpClient {}

void main() {
	test('fetch returns body', () async {
		final client = MockHttpClient();
		when(() => client.get('url')).thenAnswer((_) async => 'body');

		var result = await fetch(client);
		expect(result, equals('body'));
		verify(() => client.get('url')).called(1);
	});
}
```

`mocktail` doesn't need code generation (simpler than `mockito`). Use `when(() => ...)` (a lambda) instead of `when(...)`.

## Parameterized Tests

Dart's `test` doesn't have built-in parameterized tests like JUnit, but you can loop:

::code-wrapper{language="dart"}
```dart
void main() {
	for (var input in [1, 2, 3, 4, 5]) {
		test('square of $input is positive', () {
			expect(input * input, greaterThan(0));
		});
	}
}
```

Each iteration creates a separate test (visible in output).

## Integration Tests

Integration tests test multiple components together. Put them in `test/` with a descriptive name (`test/integration_test.dart`). For Flutter, use `integration_test` package.

## Test File Conventions

- Test files end in `_test.dart` (in `test/`).
- One test file per source file (`lib/user.dart` → `test/user_test.dart`).
- Test names are sentences (`test('method does X', ...)`).

## Coverage

::code-wrapper{language="bash"}
```bash
dart pub global activate coverage
dart test --coverage=coverage
dart pub global run coverage:format_coverage --packages=.packages --report-on=lib --in=coverage --out=coverage/lcov.info
```

Or use `genhtml` (from lcov) to generate HTML reports.

## 💡 Tips & Tricks

- **Idiom**: name tests as sentences — `test('Stack.pop returns the top item', ...)`. The output reads like a spec: "Stack.pop returns the top item ... PASSED". Describes behavior, not implementation.
- **Idiom**: use `group` to organize tests by class/feature — `group('Stack', () { test('push...', ...); test('pop...', ...); })`. The output shows the hierarchy, making test reports readable.
- **Idiom**: use `setUp`/`tearDown` for fresh state per test — each test gets a clean `Stack` instance. Avoids test interdependence (one test's side effects don't affect another). `setUp` runs before each test.
- **Idiom**: prefer `mocktail` over `mockito` — `mocktail` doesn't need code generation (`dart run build_runner build`), just `extends Mock implements X`. Simpler setup, same functionality. Use `when(() => ...)` with a lambda.
- **Idiom**: write one test file per source file — `lib/user.dart` → `test/user_test.dart`. Keeps tests co-organized with code. Use `group` for sub-features within the file.

## ⚠️ Edge Cases & Gotchas

- **Test files must end in `_test.dart`**: `dart test` only picks up files matching `test/**/*_test.dart`. A file named `test/strings.dart` is ignored.
- **`expect` without a matcher is invalid**: `expect(value)` doesn't compile. Use `expect(value, equals(...))` or `expect(value, isTrue)`.
- **Async tests must be `async`/`await`ed**: a test function that returns a `Future` but isn't marked `async` may finish before the future completes — the test passes/fails unpredictably. Make it `async` and `await`.
- **`setUp` runs before *each* test**: not once for the whole group. If setup is expensive, use `setUpAll` (runs once before all tests in the group) — but state isn't reset between tests.
- **`throwsException` vs `throwsA(isA<X>())`**: `throwsException` checks for an `Exception`; `throwsA(isA<ArgumentError>())` checks for a specific type. Use the specific form for custom exceptions.
- **Mockito needs code generation**: `@GenerateMocks` + `dart run build_runner build` generates the mock file. Forgetting the build step gives "missing mock file" errors. `mocktail` avoids this.
- **`verify(...).called(1)`**: checks the method was called exactly once. `called(0)` (never), `called(greaterThan(1))` (at least twice). Forgetting `called` means you're not verifying the call.
- **Test isolation**: tests should be independent — one test's failure shouldn't cascade. Use `setUp` for fresh state; avoid shared mutable state across tests.
- **Coverage tooling**: Dart's coverage requires `dart pub global activate coverage` and a multi-step process. It's not as integrated as some languages' coverage. Use LCOV for reports.
- **Integration tests are slower**: unit tests (one class) are fast; integration tests (multiple components) are slower. Keep them separate and run unit tests frequently, integration tests in CI.

## 🧠 Spot the Bug

A developer writes an async test, but it passes even when the code is broken:

::code-wrapper{language="dart"}
```dart
test('fetch returns data', () {
	var future = fetchData();
	expect(future, completion(equals('hello')));
});
```
::

What's wrong?

<details>
<summary>Answer</summary>

The test function isn't `async` and doesn't `await` the expectation. `expect(future, completion(...))` registers an async expectation, but the test function returns immediately (synchronously) — the test framework thinks the test is done before the future completes. The async assertion may not run, so the test passes vacuously (false positive).

The fix — make the test `async` and `await` the expectation, or `await` the future directly:

```dart
// Option 1: await the expectation
test('fetch returns data', () async {
	var future = fetchData();
	await expectLater(future, completion(equals('hello')));
});

// Option 2: await the future directly (cleaner)
test('fetch returns data', () async {
	var data = await fetchData();
	expect(data, equals('hello'));
});
```

With `async`/`await`, the test function returns a `Future`, and the framework waits for it to complete before evaluating pass/fail. Option 2 (await the future, then `expect`) is cleaner and more common.

**The lesson**: async tests must be `async` and `await` the async operation (or the expectation). Without `async`/`await`, the test function returns before the future completes, and the framework may finish the test prematurely (false positive). Make the test `async` and `await` the result, then `expect`.

</details>

## Summary

You can write tests (`test`, `expect`, matchers, `group`, `setUp`/`tearDown`), test async code (`async`/`await`, `expectLater`, `completion`/`throwsA`), mock dependencies (`mocktail` simpler, `mockito` with codegen), parameterize tests (loops), run with `dart test`, and measure coverage — with the async-test-needs-await and `_test.dart`-naming traps avoided. Next: Dart for the web.