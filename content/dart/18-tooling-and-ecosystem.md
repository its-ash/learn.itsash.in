---
title: "Dart — Tooling, Code Generation & CI/CD Pipeline"
description: "Deep-dive into Dart's analyzer configuration, build_runner code generation, freezed/json_serializable patterns, CI pipeline setup, and strict analysis rules. Code-first engineering reference."
---

# Dart — Tooling, Code Generation & CI/CD Pipeline

## `analysis_options.yaml` — Strict Analysis Configuration

::code-wrapper{language="yaml"}
```yaml
# Include a rule set: core (minimal), recommended (balanced), strict (aggressive).
include: package:lints/strict.yaml

analyzer:
  # Exclude generated files from analysis (they may not pass strict rules).
  exclude:
    - 'build/**'
    - '**/*.g.dart'        # json_serializable, etc.
    - '**/*.freezed.dart'  # freezed
    - '**/*.mocks.dart'    # mockito

  # Language modes — enforce stricter type checking at analysis time.
  language:
    strict-casts: true      # no implicit casts (num → int requires explicit `as`)
    strict-inference: true  # flags `var x;` (no initializer → infers dynamic)
    strict-raw-types: true  # flags `List` without type args (requires List<T>)

  # Strong mode (legacy, mostly subsumed by `language:` above):
  strong-mode:
    implicit-casts: false    # no automatic downcasts (num → int)
    implicit-dynamic: false # no implicit `dynamic` (var x; → error)

linter:
  rules:
    # ── Style ──
    - prefer_const_constructors       # use const where possible
    - prefer_const_constructors_in_immutables
    - prefer_const_declarations
    - prefer_final_locals             # use final for non-reassigned locals
    - prefer_final_in_for_each         # use final in for-in loop variables
    - require_trailing_commas         # trailing commas in multi-line collections
    - avoid_print                     # no print() in production code

    # ── Safety ──
    - unawaited_futures               # flags `future();` without await/unawaited()
    - cancel_subscriptions             # flags StreamSubscription not cancelled
    - close_sinks                      # flags StreamSink not closed
    - avoid_dynamic_calls              # flags x.foo() on dynamic (NoSuchMethodError risk)

    # ── Performance ──
    - avoid_returning_null_for_future  # return Future.value(), not null
    - prefer_is_empty                  # use isEmpty, not length == 0
    - prefer_iterable_whereType        # use whereType<T>(), not where((e) => e is T)
```
::

## Code Generation — `build_runner`

::code-wrapper{language="bash"}
```bash
# ── build_runner: runs code generators from annotations ──
# Generators: json_serializable, freezed, mockito, drift, riverpod_generator.

# Install as a dev dependency:
# dart pub add dev:build_runner

# One-shot generation (CI, before commit):
dart run build_runner build

# Watch mode (dev — regenerates on file save):
dart run build_runner watch

# Force (delete conflicting outputs — use when generated files are stale):
dart run build_runner build --delete-conflicting-outputs

# ── Performance ──
# build_runner can be slow on large projects (minutes). Use `watch` for
# incremental dev. Or use no-codegen alternatives (mocktail instead of mockito).
```
::

### `json_serializable` — Typed JSON Serialization

::code-wrapper{language="dart"}
```dart
import 'package:json_annotation/json_annotation.dart';

// The `part` directive includes the generated file (user.g.dart).
// After `dart run build_runner build`, this file contains:
//   _$UserFromJson(Map<String, dynamic>) → User
//   _$UserToJson(User) → Map<String, dynamic>
part 'user.g.dart';

@JsonSerializable()
class User {
  final int id;
  final String name;
  final String? email;  // nullable — optional in JSON
  @JsonKey(name: 'created_at')  // JSON key differs from Dart field name
  final DateTime createdAt;

  User({required this.id, required this.name, this.email, required this.createdAt});

  // Generated factory + method — type-safe JSON serialization.
  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
  Map<String, dynamic> toJson() => _$UserToJson(this);
}

// Usage:
final user = User(id: 1, name: 'Alice', createdAt: DateTime.now());
final json = user.toJson();  // {'id': 1, 'name': 'Alice', 'created_at': '...'}
final parsed = User.fromJson(json);  // type-safe, validated at runtime

// ── Custom converters (for non-standard types) ──
class DateTimeMillisConverter implements JsonConverter<DateTime, int> {
  const DateTimeMillisConverter();
  @override
  DateTime fromJson(int json) => DateTime.fromMillisecondsSinceEpoch(json);
  @override
  int toJson(DateTime object) => object.millisecondsSinceEpoch;
}

@JsonSerializable()
class Event {
  final String id;
  @DateTimeMillisConverter()  // ← custom converter for this field
  final DateTime timestamp;
  Event({required this.id, required this.timestamp});
  factory Event.fromJson(Map<String, dynamic> json) => _$EventFromJson(json);
  Map<String, dynamic> toJson() => _$EventToJson(this);
}
```
::

### `freezed` — Immutable Data Classes & Sealed Unions

::code-wrapper{language="dart"}
```dart
import 'package:freezed_annotation/freezed_annotation.dart';

// freezed generates: immutable class, ==/hashCode, copyWith, toString,
// sealed union types, and JSON serialization — all from one annotation.

part 'result.freezed.dart';
part 'result.g.dart';  // for JSON (if using @Freezed(toJson: true))

// ── Sealed union (like a sealed class with data) ──
@freezed
sealed class Result<T> with _$Result<T> {
  const factory Result.success(T value) = Success<T>;
  const factory Result.failure(String error) = Failure<T>;
  const factory Result.loading() = Loading<T>;

  // JSON (optional — requires part 'result.g.dart'):
  factory Result.fromJson(Map<String, dynamic> json) => _$ResultFromJson(json);
}

// Usage with exhaustive switch:
String describe<T>(Result<T> r) => switch (r) {
  Success(:final value) => 'OK: $value',
  Failure(:final error) => 'ERR: $error',
  Loading() => 'Loading...',
};

// ── Immutable data class with copyWith ──
@freezed
class User with _$User {
  const factory User({
    required int id,
    required String name,
    required String email,
    @Default([]) List<String> tags,  // default value
  }) = _User;

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
}

// copyWith creates a new instance with modified fields (original unchanged):
final user = User(id: 1, name: 'Alice', email: 'alice@ex.com');
final updated = user.copyWith(name: 'Bob');  // new instance, name changed
// user.name is still 'Alice' — immutability preserved.

// Value equality is automatic:
print(User(id: 1, name: 'A', email: 'a@x') == User(id: 1, name: 'A', email: 'a@x'));  // true
```
::

## CI/CD — GitHub Actions

::code-wrapper{language="yaml"}
```yaml
# .github/workflows/dart.yml
name: Dart CI
on: [push, pull_request]

jobs:
  analyze-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dart-lang/setup-dart@v1
        with:
          sdk: stable

      # Install dependencies
      - run: dart pub get

      # ── Format check (fails if files aren't formatted) ──
      - run: dart format --set-exit-if-changed .

      # ── Static analysis (treat infos/warnings as errors) ──
      - run: dart analyze --fatal-infos

      # ── Code generation (if using build_runner) ──
      - run: dart run build_runner build --delete-conflicting-outputs

      # ── Tests ──
      - run: dart test

      # ── Coverage (optional) ──
      - run: dart test --coverage=coverage
      - run: dart pub global activate coverage
      - run: dart pub global run coverage:format_coverage --lcov --in=coverage --out=coverage/lcov.info --packages=.packages --report-on=lib
      - uses: codecov/codecov-action@v3
        with:
          file: coverage/lcov.info
```

## The Formatter — `dart format`

::code-wrapper{language="bash"}
```bash
# dart format is opinionated (like gofmt) — it decides the style. Don't argue.
# Configure your editor to format on save.

# Format all files:
dart format .

# Custom line length (default is 80):
dart format --line-length 100 .

# CI check (fails if files aren't formatted — no auto-fix):
dart format --set-exit-if-changed .

# Format a single file:
dart format lib/main.dart

# ── The formatter resolves all style debates ──
# It handles: indentation, line wrapping, trailing commas, spacing.
# There's no .editorconfig or .prettierrc — `dart format` IS the config.
# For custom line length, set it in analysis_options.yaml or the CLI flag.
```
::

## DevTools — Profiling & Debugging

::code-wrapper{language="bash"}
```bash
# ── Launch DevTools (browser-based debugger/profiler) ──
dart devtools
# Opens a browser with: Inspector, Performance, Memory, Network, Logging, Debugger.

# ── For Flutter ──
flutter run  # then press 'D' in the terminal to open DevTools

# ── VM Service (remote debugging) ──
dart run --observe bin/server.dart       # starts VM service on default port
dart run --observe=8181 bin/server.dart  # pin the port

# ── DevTools features ──
# Inspector: widget tree (Flutter), properties, rendering
# Performance: frame rendering timeline, CPU flame chart, jank detection
# Memory: heap snapshots, allocation tracking, leak detection
# Network: HTTP requests (Flutter), timing, payloads
# Logging: structured logs, filtering
# Debugger: breakpoints, step, variables, watch expressions
```
::

## Popular Packages — Ecosystem Reference

::code-wrapper{language="yaml"}
```yaml
# ── HTTP ──
dependencies:
  http: ^1.2.0          # basic HTTP client (cross-platform)
  dio: ^5.0.0           # advanced (interceptors, cancellation, FormData)

  # ── Server ──
  shelf: ^1.4.0         # middleware framework
  shelf_router: ^1.1.0  # routing for shelf
  dart_frog: ^1.0.0     # file-based web framework

  # ── Database ──
  postgres: ^3.0.0     # PostgreSQL driver
  sqlite3: ^2.0.0      # SQLite (sync, native)
  drift: ^2.0.0         # reactive ORM (SQLite, code generation)

  # ── State Management (Flutter) ──
  flutter_riverpod: ^2.0.0  # modern, compile-safe
  provider: ^6.0.0          # simple, official
  flutter_bloc: ^8.0.0      # event-driven, scalable

  # ── Utilities ──
  intl: ^0.19.0        # i18n, date/number formatting
  path: ^1.8.0         # path manipulation (cross-platform)
  args: ^2.4.0         # CLI argument parsing

  # ── Code Generation ──
dev_dependencies:
  build_runner: ^2.4.0     # runs generators
  json_serializable: ^6.0.0 # JSON codegen
  freezed: ^2.0.0           # immutable data classes
  mocktail: ^1.0.0          # mocking (no codegen)
  test: ^1.25.0             # testing framework
  lints: ^4.0.0            # lint rule sets
```
::

## 💡 Tips & Tricks

- **Idiom**: run `dart format` on save and in CI — Dart has an opinionated formatter (like `gofmt`), so code style is automatic and consistent. Configure your editor to format on save; enforce with `dart format --set-exit-if-changed` in CI.
- **Idiom**: run `dart analyze` in CI with `--fatal-infos` — catches type errors, lints, unused code. Configure rules in `analysis_options.yaml` (start with `package:lints/recommended.yaml`). Treat warnings as errors in production.
- **Idiom**: use `build_runner watch` during development for code generation — it regenerates `.g.dart`/`.freezed.dart` files on save. Use `build` for CI (one-shot). Run `--delete-conflicting-outputs` if stale files cause issues.
- **Idiom**: use `json_serializable` + `freezed` for data models — `freezed` for immutable classes, `==`/`hashCode`, `copyWith`, sealed unions; `json_serializable` for JSON. Both use code generation (run `build_runner`).
- **Idiom**: use DevTools for debugging and profiling — Inspector (widget tree), Performance (frame/CPU), Memory (heap). For Flutter, press `D` in `flutter run` to open DevTools. Invaluable for performance issues.

## ⚠️ Edge Cases & Gotchas

- **Generated files (`.g.dart`, `.freezed.dart`) shouldn't be edited**: they're regenerated by `build_runner`, overwriting your changes. Add them to `.gitignore` (or commit them — a project choice; committing avoids a build step for consumers).
- **`build_runner` can be slow**: for large projects, `build_runner build` can take minutes. Use `watch` (incremental) in dev. Or use packages without codegen (`mocktail` instead of `mockito`).
- **`dart format` line length (default 80)**: configure with `--line-length 100` if 80 is too narrow. Be consistent across the project (configure in `analysis_options.yaml`).
- **`dart analyze` rules can be strict**: `strict.yaml` may flag style preferences as errors. Start with `recommended.yaml` and add rules as needed. Don't enable all rules blindly.
- **`dart test --coverage` needs post-processing**: the raw coverage data isn't a report. Use `dart pub global run coverage:format_coverage` to generate LCOV, then `genhtml` for HTML.
- **`dart pub publish` requires a pub.dev account**: first publish prompts for a confirmation. Once published, a version is permanent (can't be republished; must bump version). Use `--dry-run` to check.
- **Generated mocks (`mockito`) need rebuild**: if you change the class, run `build_runner build` to regenerate mocks. Stale mocks cause test failures. `mocktail` avoids this (no codegen).
- **`part 'x.g.dart'` must match the file**: `part 'user.g.dart';` must point to the generated file. A mismatch (typo, wrong path) causes a compile error after `build_runner`.
- **`analyzer` `exclude` for generated files**: generated files (`.g.dart`) may not pass strict analysis. Exclude them in `analysis_options.yaml` (`exclude: ['**/*.g.dart']`).
- **DevTools version**: use the DevTools matching your Dart/Flutter version. `dart devtools` launches the bundled version; `dart pub global activate devtools` gets the latest.

## 🧠 Spot the Bug

A developer edits a generated file to fix a JSON parsing issue, but the fix disappears after the next build:

::code-wrapper{language="dart"}
```dart
// user.g.dart (generated by json_serializable)
User _$UserFromJson(Map<String, dynamic> json) {
  return User(
    id: json['id'] as int,        // ← throws if 'id' is null
    name: json['name'] as String,
  );
}
```
::

The developer changes `json['id'] as int` to `json['id'] as int? ?? 0`, but after running `dart run build_runner build`, the change is gone. Why?

<details>
<summary>Answer</summary>

`user.g.dart` is a **generated file** — `build_runner` regenerates it from the `@JsonSerializable()` annotation on `User` in `user.dart`. Any manual edits to `user.g.dart` are overwritten on the next `build_runner build`. The generated file is derived from the source annotation, not editable.

The fix — change the source (`user.dart`), not the generated file:

```dart
// user.dart
@JsonSerializable()
class User {
  final int id;  // ← change to int? for nullable, or use @JsonKey(defaultValue: 0)
  final String name;

  User({this.id = 0, required this.name});  // default value for missing id

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
  Map<String, dynamic> toJson() => _$UserToJson(this);
}
```

Then run `dart run build_runner build` — the regenerated `user.g.dart` will handle `id` as nullable or with a default (from the annotation).

Never edit generated files (`.g.dart`, `.freezed.dart`, `.mocks.dart`). They're derived from annotations/source. Change the source, regenerate. Add them to `.gitignore` (and regenerate in CI) or commit them (avoiding a build step for consumers) — but never edit them.

</details>