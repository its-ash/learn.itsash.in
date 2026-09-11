---
title: "Dart — Testing, Mocking & Async Test Patterns"
description: "Deep-dive into Dart's test framework, matcher composition, async test semantics, mocktail vs mockito, parameterized testing, and test isolation patterns. Code-first engineering reference."
---

# Dart — Testing, Mocking & Async Test Patterns

## Test Structure — `group`, `setUp`, `tearDown`

::code-wrapper{language="dart"}
```dart
import 'package:test/test.dart';

void main() {
  // Group organizes related tests — output shows the hierarchy.
  group('Stack', () {
    // setUp runs BEFORE EACH test (fresh state — no inter-test coupling).
    late Stack<int> stack;

    setUp(() {
      stack = Stack<int>();
      stack.push(1);
      stack.push(2);
    });

    tearDown(() {
      // cleanup (close connections, reset state) — runs after each test
      // even on failure. Can be async: tearDown(() async { ... });
    });

    test('pop returns the top item', () {
      expect(stack.pop(), equals(2));
      expect(stack.pop(), equals(1));
    });

    test('pop on empty throws StateError', () {
      stack.pop();
      stack.pop();  // now empty
      expect(() => stack.pop(), throwsStateError);
    });

    test('peek does not remove the item', () {
      expect(stack.peek(), equals(2));
      expect(stack.length, equals(2));  // unchanged
    });

    test('isEmpty reflects state', () {
      expect(stack.isEmpty, isFalse);
      stack.pop();
      stack.pop();
      expect(stack.isEmpty, isTrue);
    });
  });

  // setUpAll runs ONCE before all tests (not per test) — for expensive setup.
  // But state isn't reset between tests — use setUp for fresh state.
  group('Database', () {
    late Database db;

    setUpAll(() async {
      db = await Database.connect(testDbPath);  // once
    });

    tearDownAll(() async {
      await db.close();
    });

    test('insert and query', () async { /* ... */ });
  });
}
```
::

## Matchers — Composition & Custom

::code-wrapper{language="dart"}
```dart
import 'package:test/test.dart';

void main() {
  test('equality matchers', () {
    expect(42, equals(42));
    expect([1, 2, 3], equals([1, 2, 3]));
    expect({'a': 1}, equals({'a': 1}));
    expect(true, isTrue);
    expect(null, isNull);
    expect(42, isNotNull);
    expect([1, 2], isNotEmpty);
    expect('', isEmpty);
  });

  test('type matchers', () {
    expect(42, isA<int>());
    expect('hello', isA<String>());
    expect([1, 2], isA<List<int>>());
  });

  test('collection matchers', () {
    expect([1, 2, 3], contains(2));
    expect([1, 2, 3], containsAll([2, 3]));  // order-independent
    expect([1, 2, 3], hasLength(3));
    expect([1, 2, 3], everyElement(isA<int>()));
    expect([1, 2, 3], anyElement(greaterThan(2)));
  });

  test('string matchers', () {
    expect('hello world', startsWith('hello'));
    expect('hello world', endsWith('world'));
    expect('hello world', contains('lo wo'));
    expect('hello', matches(RegExp(r'^[a-z]+$')));
  });

  test('numeric matchers', () {
    expect(3.14159, closeTo(3.14, 0.01));  // |actual - expected| <= tolerance
    expect(42, greaterThan(10));
    expect(42, lessThan(100));
    expect(42, inInclusiveRange(1, 100));
  });

  test('composing matchers with allOf / anyOf', () {
    expect(42, allOf([
      greaterThan(10),
      lessThan(100),
      isA<int>(),
    ]));

    expect(-1, anyOf([
      greaterThan(0),
      lessThan(0),  // this one matches
    ]));
  });

  test('custom predicate matcher', () {
    bool isPrime(int n) {
      if (n < 2) return false;
      for (var i = 2; i * i <= n; i++) {
        if (n % i == 0) return false;
      }
      return true;
    }

    expect(17, predicate(isPrime, 'is a prime number'));
    expect(18, isNot(predicate(isPrime, 'is a prime number')));
  });

  test('exception matchers', () {
    expect(
      () => throw ArgumentError('bad'),
      throwsA(allOf([
        isA<ArgumentError>(),
        predicate((ArgumentError e) => e.message == 'bad'),
      ])),
    );
  });
}
```
::

## Async Testing — The Await Trap

::code-wrapper{language="dart"}
```dart
import 'package:test/test.dart';

// ❌ Anti-pattern: async test without `async` keyword.
test('fetch returns data', () {
  var future = fetchData();
  expect(future, completion(equals('hello')));  // async expectation
  // The test function returns SYNC — the framework thinks the test is done
  // before the future completes. The async assertion may not run.
  // → false positive (passes even when broken).
});

// ✓ Correct: make the test `async` and `await`.
test('fetch returns data (fixed)', () async {
  var data = await fetchData();
  expect(data, equals('hello'));
});

// ── Testing that a future throws ──
test('fetch throws on 404', () async {
  await expectLater(
    fetchUser('nonexistent'),
    throwsA(isA<UserNotFoundException>()),
  );
});

// ── expectLater for async matchers (completion, throwsA) ──
test('future completes with value', () async {
  await expectLater(
    Future.value(42),
    completion(equals(42)),
  );
});

// ── Testing streams ──
test('stream emits expected values', () async {
  final stream = Stream.fromIterable([1, 2, 3]);
  await expectLater(stream, emitsInOrder([1, 2, 3]));
});

test('stream with errors', () async {
  final stream = Stream.error(Exception('boom'));
  await expectLater(stream, emitsError(isA<Exception>()));
});
```
::

## Mocking — `mocktail` (No Code Generation)

::code-wrapper{language="dart"}
```dart
import 'package:mocktail/mocktail.dart';
import 'package:test/test.dart';

// ── mocktail: no codegen, simpler than mockito ──
class MockHttpClient extends Mock implements HttpClient {}

class MockDatabase extends Mock implements Database {}

void main() {
  late MockHttpClient mockHttp;
  late UserService service;

  setUp(() {
    mockHttp = MockHttpClient();
    service = UserService(mockHttp);
  });

  test('getUser returns parsed user', () async {
    // Stub: when(() => ...) with a lambda (not the actual call).
    when(() => mockHttp.get('/users/1')).thenAnswer(
      (_) async => '{"id": 1, "name": "Alice"}',
    );

    final user = await service.getUser(1);

    expect(user.name, equals('Alice'));
    // Verify: check the call was made with the right arguments.
    verify(() => mockHttp.get('/users/1')).called(1);
  });

  test('getUser throws on 404', () async {
    when(() => mockHttp.get('/users/999')).thenThrow(
      HttpException(404),
    );

    expect(
      () => service.getUser(999),
      throwsA(isA<UserNotFoundException>()),
    );
    verify(() => mockHttp.get('/users/999')).called(1);
  });

  test('getUser uses cache on second call', () async {
    when(() => mockHttp.get('/users/1')).thenAnswer(
      (_) async => '{"id": 1, "name": "Alice"}',
    );

    await service.getUser(1);
    await service.getUser(1);  // should use cache

    // Verify the HTTP call happened only once (second was cached).
    verify(() => mockHttp.get('/users/1')).called(1);
    verifyNoMoreInteractions(mockHttp);
  });

  // ── Argument matchers ──
  test('any argument', () async {
    when(() => mockHttp.get(any())).thenAnswer((_) async => '{}');
    // `any()` matches any argument. Use `that()` for specific matching:
    when(() => mockHttp.get(any(that: startsWith('/users/'))))
        .thenAnswer((_) async => '{}');
  });
}
```
::

## Parameterized Tests — Loop-Based

::code-wrapper{language="dart"}
```dart
import 'package:test/test.dart';

// Dart's test package doesn't have built-in parameterized tests (like JUnit),
// but you can loop — each iteration creates a separate test (visible in output).

void main() {
  group('string reverse', () {
    for (final entry in {
      'hello': 'olleh',
      '': '',
      'a': 'a',
      'racecar': 'racecar',
      'ab': 'ba',
    }.entries) {
      test('reverse("${entry.key}") == "${entry.value}"', () {
        expect(entry.key.split('').reversed.join(), equals(entry.value));
      });
    }
  });

  group('temperature conversion', () {
    final cases = [
      (0, 32.0),     // 0°C = 32°F
      (100, 212.0),  // 100°C = 212°F
      (-40, -40.0),  // -40°C = -40°F
      (37, 98.6),    // 37°C = 98.6°F
    ];
    for (final (celsius, fahrenheit) in cases) {
      test('$celsius°C → $fahrenheit°F', () {
        expect(celsiusToFahrenheit(celsius), closeTo(fahrenheit, 0.01));
      });
    }
  });
}

double celsiusToFahrenheit(double c) => c * 9 / 5 + 32;
```
::

## Test Isolation & Dependency Injection

::code-wrapper{language="dart"}
```dart
import 'package:test/test.dart';
import 'package:mocktail/mocktail.dart';

// Production code depends on abstractions (interfaces), not concretions.
// Tests inject mocks for the dependencies.

// ── Abstract dependency ──
abstract class UserRepository {
  Future<User> findById(int id);
  Future<void> save(User user);
}

// ── Production implementation (uses a real database) ──
class SqlUserRepository implements UserRepository {
  @override
  Future<User> findById(int id) async { /* real DB query */ }
  @override
  Future<void> save(User user) async { /* real DB insert */ }
}

// ── Mock for testing ──
class MockUserRepository extends Mock implements UserRepository {}

// ── Service depends on the abstraction ──
class UserService {
  final UserRepository _repo;
  UserService(this._repo);  // dependency injection via constructor

  Future<User> getUser(int id) async {
    final user = await _repo.findById(id);
    if (user == null) throw UserNotFoundException(id);
    return user;
  }
}

// ── Tests inject the mock ──
void main() {
  group('UserService', () {
    late MockUserRepository mockRepo;
    late UserService service;

    setUp(() {
      mockRepo = MockUserRepository();
      service = UserService(mockRepo);  // inject mock
      registerFallbackValue(User(id: 0, name: ''));  // for any() with value types
    });

    test('getUser returns user from repo', () async {
      when(() => mockRepo.findById(1)).thenAnswer(
        (_) async => User(id: 1, name: 'Alice'),
      );

      final user = await service.getUser(1);

      expect(user.name, equals('Alice'));
      verify(() => mockRepo.findById(1)).called(1);
    });
  });
}
```
::

## 💡 Tips & Tricks

- **Idiom**: name tests as sentences — `test('Stack.pop returns the top item', ...)` — the output reads like a spec: "Stack.pop returns the top item ... PASSED." Describes behavior, not implementation. Use `group` for the class/feature name.
- **Idiom**: use `setUp`/`tearDown` for fresh state per test — each test gets a clean instance. Avoids test interdependence (one test's side effects don't affect another). `setUp` runs before EACH test; `setUpAll` runs once (use for expensive setup, but state isn't reset).
- **Idiom**: prefer `mocktail` over `mockito` — `mocktail` doesn't need code generation (`dart run build_runner build`), just `extends Mock implements X`. Simpler setup, same functionality. Use `when(() => ...)` with a lambda.
- **Idiom**: make async tests `async` and `await` — a test function that returns a `Future` but isn't `async` finishes before the future completes (false positive). Make it `async` and `await` the result, then `expect`.
- **Idiom**: test file naming — `test/user_test.dart` for `lib/user.dart`. One test file per source file. `dart test` only picks up `test/**/*_test.dart`.

## ⚠️ Edge Cases & Gotchas

- **Test files must end in `_test.dart`**: `dart test` only picks up files matching `test/**/*_test.dart`. A file named `test/strings.dart` is ignored.
- **`expect` without a matcher is invalid**: `expect(value)` doesn't compile. Use `expect(value, equals(...))` or `expect(value, isTrue)`.
- **Async tests must be `async`/`await`ed**: a test function that returns a `Future` but isn't marked `async` may finish before the future completes — false positive. Make it `async` and `await`.
- **`setUp` runs before *each* test**: not once for the whole group. If setup is expensive, use `setUpAll` (runs once before all tests) — but state isn't reset between tests.
- **`throwsException` vs `throwsA(isA<X>())`**: `throwsException` checks for an `Exception`; `throwsA(isA<ArgumentError>())` checks for a specific type. Use the specific form for custom exceptions.
- **Mockito needs code generation**: `@GenerateMocks` + `dart run build_runner build` generates the mock file. Forgetting the build step gives "missing mock file" errors. `mocktail` avoids this.
- **`verify(...).called(1)`**: checks the method was called exactly once. `called(0)` (never), `called(greaterThan(1))` (at least twice). Forgetting `called` means you're not verifying the call.
- **Test isolation**: tests should be independent — one test's failure shouldn't cascade. Use `setUp` for fresh state; avoid shared mutable state across tests.
- **`registerFallbackValue` for `any()` with value types**: `mocktail` needs a fallback value for `any()` with non-nullable value types (e.g., `User`). Call `registerFallbackValue(User(...))` in `setUp`.
- **`expectLater` for async matchers**: use `expectLater` (not `expect`) with `completion()` and `throwsA()` — it returns a `Future` you must `await`.

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

Why is this a false positive?

<details>
<summary>Answer</summary>

The test function is **not `async`** and doesn't `await`. `expect(future, completion(...))` registers an async expectation, but the test function returns immediately (synchronously) — the test framework thinks the test is done before the future completes. The async assertion may not run, so the test passes vacuously (false positive).

The fix — make the test `async` and `await` the expectation (or `await` the future directly):

```dart
// Option 1: await the expectation
test('fetch returns data', () async {
  var future = fetchData();
  await expectLater(future, completion(equals('hello')));
});

// Option 2: await the future, then expect (cleaner)
test('fetch returns data', () async {
  var data = await fetchData();
  expect(data, equals('hello'));
});
```

With `async`/`await`, the test function returns a `Future`, and the framework waits for it to complete before evaluating pass/fail. Option 2 (await the future, then `expect`) is cleaner and more common.

</details>