# 01 — Introduction & Setup

Dart is a client-optimized language for fast apps on any platform — web, mobile (Flutter), and server. It's the language behind Flutter.

## Why Dart?

- **Client-optimized** — designed for UI: fast allocation, garbage collection, event loop, isolates.
- **AOT and JIT** — compiled ahead-of-time for fast startup (mobile) or just-in-time for fast dev cycles (hot reload).
- **Type-safe** — sound null safety, strong typing, type inference.
- **Familiar syntax** — C-family syntax (like Java/C#/JavaScript/TypeScript).
- **Multi-platform** — web (compiled to JS/WASM), mobile (Flutter), desktop, server.

## Installing the Dart SDK

### macOS (Homebrew)

::code-wrapper{language="bash"}
```bash
brew tap dart-lang/dart
brew install dart
```

### Windows (Chocolatey)

::code-wrapper{language="powershell"}
```powershell
choco install dart-sdk
```

### Linux (apt)

::code-wrapper{language="bash"}
```bash
sudo apt-get update
sudo apt-get install dart
```

### Verify

::code-wrapper{language="bash"}
```bash
dart --version
```

## Your First Dart Program

Create `hello.dart`:

::code-wrapper{language="dart"}
```dart
void main() {
	print('Hello, Dart!');
}
```

### Run it

::code-wrapper{language="bash"}
```bash
dart run hello.dart
```

Every Dart program starts with `main()`. `print()` writes to stdout with a newline. Statements end with `;`.

## AOT vs JIT

Dart supports two compilation modes:

- **JIT (Just-In-Time)** — used during development. Compiled at runtime, enables hot reload (Flutter's sub-second reload). Slower startup, but fast dev cycles.
- **AOT (Ahead-Of-Time)** — used for production. Compiled to native (ARM/x64) or JS before delivery. Fast startup, no runtime compilation, smaller footprint.

For web, Dart compiles to JavaScript (via `dart2js` or `dart compile js`) or WebAssembly (experimental). For mobile/desktop, Dart AOT-compiles to native code via Flutter.

## The Dart Pad

[DartPad](https://dartpad.dev) is an online editor — no install needed. Useful for quick experiments and sharing snippets.

## Project Structure

A Dart project has:

::code-wrapper{language="text"}
```text
my_app/
├── bin/            # executable entry points (main.dart)
├── lib/            # library code (imported by bin/ and other lib/ files)
├── test/           # tests
├── pubspec.yaml    # project config and dependencies
└── analysis_options.yaml  # linter rules
```

`bin/main.dart` is the entry point for a console app. `lib/` holds the reusable library code.

## `pub` — the Dart Package Manager

`pub` (invoked via `dart pub`) manages dependencies, like `npm` for JS or `cargo` for Rust.

::code-wrapper{language="bash"}
```bash
dart pub get        # download dependencies (pubspec.yaml → pubspec.lock)
dart pub add http   # add a dependency
dart pub upgrade    # upgrade dependencies
dart pub publish    # publish to pub.dev
```

Dependencies are declared in `pubspec.yaml`:

::code-wrapper{language="yaml"}
```yaml
name: my_app
description: A sample Dart app.
environment:
	sdk: '>=3.0.0 <4.0.0'
dependencies:
	http: ^1.0.0
dev_dependencies:
	test: ^1.24.0
```

Packages are hosted on [pub.dev](https://pub.dev). `^1.0.0` means `>=1.0.0 <2.0.0` (compatible with 1.x).

## `dart create`

Scaffold a new project:

::code-wrapper{language="bash"}
```bash
dart create my_app
cd my_app
dart run
```

This creates the structure above and a "Hello, World!" in `bin/my_app.dart`.

## Tooling

- **Dart DevTools** — browser-based debugger/profiler (`dart devtools`).
- **`dart analyze`** — static analysis (lint, type errors).
- **`dart format`** — code formatter (opinionated, like `gofmt`).
- **`dart test`** — run tests in `test/`.

## VS Code

Install the **Dart** extension (Dart Code). It provides:
- Syntax highlighting, code completion.
- Debugging (breakpoints, step).
- Hot reload (for Flutter).
- `dart format` on save.
- `dart analyze` diagnostics.

## Hello, Dart — a richer example

::code-wrapper{language="dart"}
```dart
void main(List<String> arguments) {
	final name = arguments.isEmpty ? 'World' : arguments.first;
	print('Hello, $name!');

	for (var i = 1; i <= 3; i++) {
		print('Count: $i');
	}
}
```

`main(List<String> arguments)` receives command-line args. `$name` and `$i` are string interpolation. `final` is a runtime constant (single-assignment).

## 💡 Tips & Tricks

- **Idiom**: run `dart format` on save — Dart has an opinionated formatter (like `gofmt`), so code style is automatic and consistent. Configure your editor to format on save.
- **Idiom**: use `dart analyze` in CI — it catches type errors, unused code, and lints. Configure rules in `analysis_options.yaml`. Treat warnings as errors in production.
- **Idiom**: use DartPad for quick experiments — no install, shareable URL. Useful for trying a snippet or sharing in a PR/issue.

## ⚠️ Edge Cases & Gotchas

- **`print()` adds a newline**: like `console.log` + `println`. Use `stdout.write()` for no newline.
- **`pubspec.yaml` indentation matters**: it's YAML — wrong indentation causes parse errors. Use 2 spaces.
- **SDK version constraints**: `sdk: '>=3.0.0 <4.0.0'` — using a feature from Dart 3.0 in a 2.19-constrained project fails. Bump the constraint to use new features.
- **`dart run` vs `dart file.dart`**: `dart run` (no arg) runs `bin/<package_name>.dart`. `dart run path/to/file.dart` runs a specific file. `dart file.dart` (no `run`) is the older form.
- **`^1.0.0` allows patch and minor, not major**: `^1.2.3` = `>=1.2.3 <2.0.0`. A 2.0 release is breaking and won't be chosen.

## 🧠 Spot the Bug

A developer runs their first Dart program, but gets an error:

::code-wrapper{language="dart"}
```dart
void main() {
	print("Hello, Dart!")
}
```
::

What's wrong?

<details>
<summary>Answer</summary>

Missing semicolon after `print(...)`. Dart statements end with `;` (like C/Java/JS). The compiler expects a `;` after the `print("Hello, Dart!")` statement.

The fix:

```dart
void main() {
	print("Hello, Dart!");
}
```

**The lesson**: Dart is a C-family language — statements end with semicolons. Forgetting the `;` is a common error for developers coming from Python or Go (which don't require them).

</details>

## Summary

You installed the Dart SDK, ran your first program, understand AOT vs JIT, project structure, `pub` for packages, and the tooling (`dart format`, `dart analyze`, `dart test`). Next: variables and data types.