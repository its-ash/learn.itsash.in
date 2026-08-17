# 18 — Tooling & Ecosystem

Dart's tooling is mature — `dart` CLI, `pub` package manager, `dart format`, `dart analyze`, `dart test`, DevTools, and code generation via `build_runner`.

## The `dart` CLI

::code-wrapper{language="bash"}
```bash
dart create my_app              # scaffold a project
dart run                        # run bin/<package>.dart
dart run bin/my_app.dart        # run a specific file
dart test                       # run tests
dart build                      # build (Flutter web, or a native exe)
dart compile exe bin/app.dart   # compile to native executable
dart compile js -o out.js ...   # compile to JS
dart format .                   # format all files
dart analyze                    # static analysis
dart pub get                    # get dependencies
dart pub add package_name       # add a dependency
dart pub publish                # publish to pub.dev
dart pub deps                   # dependency tree
```
::
## `dart format`

`dart format` is the opinionated formatter (like `gofmt` for Go or `prettier` for JS). It enforces a consistent style:

::code-wrapper{language="bash"}
```bash
dart format .                    # format all Dart files
dart format --line-length 100 . # custom line length (default 80)
```
::
Configure your editor to format on save. Don't argue about style — `dart format` decides.

## `dart analyze`

`dart analyze` runs the static analyzer — type errors, lints, unused code, best practices:

::code-wrapper{language="bash"}
```bash
dart analyze                     # analyze the project
dart analyze lib/                # a specific directory
```
::
Configure rules in `analysis_options.yaml`:

::code-wrapper{language="yaml"}
```yaml
include: package:lints/recommended.yaml

analyzer:
	exclude:
		- build/**
		- '**/*.g.dart'
	strong-mode:
		implicit-casts: false
		implicit-dynamic: false

linter:
	rules:
		- avoid_print
		- prefer_const_constructors
		- prefer_final_locals
		- require_trailing_commas
```
::
`package:lints/recommended.yaml` (or `package:lints/core.yaml`) is a good starting point. Treat warnings as errors in CI (`dart analyze --fatal-infos`).

## `dart test`

::code-wrapper{language="bash"}
```bash
dart test                                    # run all tests
dart test test/user_test.dart               # a specific file
dart test --name "push"                     # tests matching a name
dart test --coverage=coverage               # with coverage
```
::
See chapter 14 for testing in depth.

## DevTools

Dart DevTools is a browser-based suite for debugging and profiling:

::code-wrapper{language="bash"}
```bash
dart devtools   # starts DevTools server, opens browser
```
::
For Flutter: `flutter pub global activate devtools` then `flutter run` and press `D` in the terminal.

### DevTools features

- **Inspector** — inspect the widget tree (Flutter).
- **Performance** — frame rendering, CPU profile.
- **Memory** — heap snapshots, allocation tracking.
- **Network** — HTTP requests (for Flutter).
- **Logging** — structured logs.
- **Debugger** — breakpoints, step, variables.

## `build_runner` (Code Generation)

Many Dart packages use code generation (JSON serialization, immutable classes, mocks). `build_runner` runs the generators:

::code-wrapper{language="bash"}
```bash
dart pub add dev:build_runner
dart run build_runner build     # generate code (once)
dart run build_runner watch     # generate + watch (dev)
dart run build_runner build --delete-conflicting-outputs   # force
```
::
### Common code generators

- **`json_serializable`** — JSON to/from typed classes.
- **`freezed`** — immutable data classes, sealed unions.
- **`mockito`** — mock classes (`@GenerateMocks`).
- **`drift`** — ORM code.
- **`riverpod_generator`** — Riverpod providers.

### `json_serializable` example

::code-wrapper{language="dart"}
```dart
import 'package:json_annotation/json_annotation.dart';
part 'user.g.dart';

@JsonSerializable()
class User {
	final int id;
	final String name;

	User({required this.id, required this.name});

	factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
	Map<String, dynamic> toJson() => _$UserToJson(this);
}
```
::
After `dart run build_runner build`, `user.g.dart` has `_$UserFromJson` and `_$UserToJson` — type-safe JSON serialization.

### `freezed` example

::code-wrapper{language="dart"}
```dart
import 'package:freezed_annotation/freezed_annotation.dart';
part 'result.freezed.dart';
part 'result.g.dart';

@freezed
class Result with _$Result {
	const factory Result.success(int value) = Success;
	const factory Result.failure(String error) = Failure;
	factory Result.fromJson(Map<String, dynamic> json) => _$ResultFromJson(json);
}
```
::
`freezed` generates immutable classes, `==`/`hashCode`, `copyWith`, sealed union types, and JSON — all from one annotation.

## `lints` Package

The official `lints` package provides lint rule sets:

::code-wrapper{language="yaml"}
```yaml
# analysis_options.yaml
include: package:lints/recommended.yaml   # or strict.yaml for more
```
::
- `core.yaml` — minimal.
- `recommended.yaml` — recommended for most projects.
- `strict.yaml` — strictest (more rules).

Use `recommended.yaml` for most projects; `strict.yaml` for libraries wanting strong guarantees.

## CI/CD

A typical Dart CI workflow:

::code-wrapper{language="yaml"}
```yaml
# .github/workflows/dart.yml
name: Dart CI
on: [push, pull_request]
jobs:
	build:
		runs-on: ubuntu-latest
		steps:
			- uses: actions/checkout@v4
			- uses: dart-lang/setup-dart@v1
			- run: dart pub get
			- run: dart format --set-exit-if-changed .
			- run: dart analyze --fatal-infos
			- run: dart test
```
::
- `dart format --set-exit-if-changed` — fails if files aren't formatted.
- `dart analyze --fatal-infos` — treats infos as errors.
- `dart test` — runs all tests.

## Popular Packages

- **`http`** — HTTP client.
- **`dio`** — advanced HTTP (interceptors, cancellation).
- **`test`** — testing.
- **`mocktail`** — mocking (no codegen).
- **`shelf`** — server framework.
- **`dart_frog`** — file-based web framework.
- **`args`** — CLI argument parsing.
- **`intl`** — i18n, date/number formatting.
- **`path`** — path manipulation.
- **`json_serializable`** / **`freezed`** — code generation.
- **`drift`** — SQLite ORM.
- **`riverpod`** / **`provider`** / **`bloc`** — Flutter state.
- **`go_router`** — Flutter routing.

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

A developer edits a generated file to fix a bug, but the fix keeps disappearing:

::code-wrapper{language="dart"}
```dart
// user.g.dart (generated)
User _$UserFromJson(Map<String, dynamic> json) {
	return User(
		id: json['id'] as int,
		name: json['name'] as String,
	);
}
```
::

The developer changes `json['id'] as int` to handle `null`, but after running `dart run build_runner build`, the change is gone. Why?

<details>
<summary>Answer</summary>

`user.g.dart` is a **generated file** — `build_runner` regenerates it from the `@JsonSerializable()` annotation on `User` in `user.dart`. Any manual edits to `user.g.dart` are overwritten on the next `build_runner build`. The generated file is derived from the source annotation, not editable.

The fix — change the source (`user.dart`), not the generated file:

```dart
// user.dart
@JsonSerializable()
class User {
	final int? id;   // nullable to handle missing 'id'
	final String name;

	User({this.id, required this.name});

	factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
	Map<String, dynamic> toJson() => _$UserToJson(this);
}
```
::
Then run `dart run build_runner build` — the regenerated `user.g.dart` will handle `id` as nullable (from the `int?` annotation).

Never edit generated files (`.g.dart`, `.freezed.dart`, `.mocks.dart`). They're derived from annotations/source. Change the source, regenerate. Add them to `.gitignore` (and regenerate in CI) or commit them (avoiding a build step for consumers) — but never edit them.

**The lesson**: generated files (`.g.dart`, etc.) are overwritten by `build_runner`. Edit the source (annotations, the class), not the generated file. Regenerate with `dart run build_runner build`.

</details>

## Summary

You can use the `dart` CLI (`create`, `run`, `test`, `build`, `compile`), `dart format` (opinionated), `dart analyze` (lints, `analysis_options.yaml`), `dart test`, DevTools (debug/profile), `build_runner` (code generation for `json_serializable`/`freezed`/`mockito`), the `lints` package, CI/CD (`format --set-exit-if-changed`, `analyze --fatal-infos`, `test`), and popular packages — with the generated-files-are-overwritten and format-on-save traps avoided. Next: exercises and projects.