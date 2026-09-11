---
title: "Dart — Architecture, Compilation Pipeline & Toolchain"
description: "Deep-dive into Dart's compilation strategies (AOT/JIT/kernel), VM internals, pub workspace configuration, and production toolchain setup. Code-first engineering reference."
---

# Dart — Architecture, Compilation Pipeline & Toolchain

## Compilation Pipeline Internals

Dart has three execution modes. Understanding the boundary between them is critical for debugging performance and behavioral differences across platforms.

::code-wrapper{language="dart"}
```dart
// ── kernel snapshot (AST serialized, no machine code) ──
// Used by VM JIT: fast startup, interpreted or JIT-compiled at runtime.
// Pipeline: source → dart:_kernel (front-end) → .dill file
//
// ── AOT snapshot (precompiled to machine code) ──
// Used by Flutter release: no compiler at runtime, fast startup.
// Pipeline: source → kernel → TFA (tree-shaking) → machine code snapshot
//
// ── JIT (development) ──
// Source changes hot-reloaded via incremental kernel compilation.
// The VM compiles hot functions with an optimizing compiler (OSR).

// This program behaves differently in JIT vs AOT:
void main() {
  // assert() runs in JIT (debug), stripped in AOT (release).
  // In release, the entire assertion body is dead-code-eliminated.
  assert(() {
    print('This print vanishes in AOT — no side effect in release.');
    return true;
  }());

  // In JIT, `DateTime.now()` in const context is rejected at compile time.
  // In AOT, tree-shaking removes unused const symbols entirely.
  print('Running in ${const String.fromEnvironment('dart.vm.product', defaultValue: false) ? 'AOT' : 'JIT'} mode.');
}
```
::

## SDK Layout & Platform Conditionals

::code-wrapper{language="dart"}
```dart
// Platform detection at compile time (not runtime) — the compiler
// resolves these to `true`/`false` and dead-code-eliminates the loser.
const bool isWeb = bool.fromEnvironment('dart.library.html');
const bool isIO = bool.fromEnvironment('dart.library.io');
const bool isVM = !isWeb; // VM includes io

// Anti-pattern: runtime checks for platform in hot paths.
// ✓ Correct: compile-time conditional imports (zero runtime cost).

// platform.dart — public API
export 'platform_io.dart'   // native: dart:io available
    if (dart.library.html) 'platform_web.dart';  // web: dart:html available
```
::

::code-wrapper{language="dart"}
```dart
// platform_io.dart — compiled only on native (VM/AOT)
import 'dart:io';

String get platformName => Platform.operatingSystem; // 'macos', 'linux', etc.
int get cpuCount => Platform.numberOfProcessors;

// File system access, Process.run, Platform.exit — all available.
Future<List<int>> readBytesNative(String path) => File(path).readAsBytes();
```
::

::code-wrapper{language="dart"}
```dart
// platform_web.dart — compiled only on web (dart2js / DDC / Wasm)
// No dart:io. Use dart:html or fetch API.
import 'dart:html';

String get platformName => 'web';
int get cpuCount => 1; // web is single-threaded; use Web Workers for parallelism

// No File API — use HttpRequest / fetch for remote resources.
Future<List<int>> readBytesWeb(String url) async {
  final response = await HttpRequest.request(url, responseType: 'arraybuffer');
  return (response.response as ByteBuffer).asUint8List();
}
```
::

## `pubspec.yaml` — Production Configuration

::code-wrapper{language="yaml"}
```yaml
# pubspec.yaml — the single source of truth for the package graph.
name: my_service
description: A production Dart microservice.
version: 1.2.0
publish_to: none  # set to 'none' for private apps; omit to publish to pub.dev

environment:
  sdk: '>=3.4.0 <4.0.0'  # SDK constraint — using Dart 3.4+ features requires this floor

dependencies:
  # ^x.y.z = >=x.y.z <(x+1).0.0 — allows minor/patch, blocks breaking major.
  http: ^1.2.0
  shelf: ^1.4.0
  shelf_router: ^1.1.0

  # Git dependency — for forks or unreleased versions.
  # my_lib:
  #   git:
  #     url: https://github.com/org/my_lib.git
  #     ref: dev-branch  # or a commit SHA or tag

  # Path dependency — for monorepo local packages.
  shared_models:
    path: ../shared_models

dev_dependencies:
  test: ^1.25.0
  mocktail: ^1.0.0
  lints: ^4.0.0
  build_runner: ^2.4.0
```
::

### Version Resolution: `pubspec.lock`

::code-wrapper{language="bash"}
```bash
# pubspec.yaml declares constraints; pubspec.lock pins exact versions.
# Apps: commit pubspec.lock (reproducible builds).
# Libraries: omit pubspec.lock (let the consumer resolve).

dart pub get       # resolve + download → writes pubspec.lock
dart pub upgrade   # re-resolve within constraints → updates lock
dart pub outdated  # show which deps have newer versions available
```
::

## Native Executable Compilation (AOT)

::code-wrapper{language="bash"}
```bash
# Compile to a standalone native binary — no Dart SDK needed at runtime.
# Tree-shaken, AOT-compiled, fast cold start. Perfect for Docker / CLI tools.
dart compile exe bin/server.dart -o bin/server

# The binary is platform-specific (macOS binary won't run on Linux).
# Cross-compile via Docker:
# docker run --rm -v "$PWD":/app -w /app dart:stable dart compile exe bin/server.dart -o bin/server

# Kernel snapshot (not native — needs VM, but faster than source):
dart compile kernel bin/server.dart -o bin/server.dill

# JIT snapshot (precompiled classes, still needs VM):
dart compile jit-snapshot bin/server.dart -o bin/server.jit
```
::

## Project Structure — Production Layout

::code-wrapper{language="text"}
```text
my_service/
├── bin/
│   └── server.dart          # entry point — thin, delegates to lib/
├── lib/
│   ├── my_service.dart      # public API barrel (exports only public code)
│   ├── src/                 # convention-private — users should NOT import
│   │   ├── server.dart      # server bootstrap
│   │   ├── handlers.dart    # request handlers
│   │   ├── middleware.dart   # auth, logging, CORS
│   │   └── models.dart      # internal models
│   └── my_service.dart      # re-exports public API
├── test/
│   ├── unit/
│   │   └── handlers_test.dart
│   └── integration/
│       └── server_test.dart
├── analysis_options.yaml    # linter rules + analyzer config
├── pubspec.yaml
├── pubspec.lock             # commit for apps
├── Dockerfile
└── Makefile
```
::

::code-wrapper{language="dart"}
```dart
// bin/server.dart — thin entry point, all logic in lib/
import 'package:my_service/my_service.dart';

void main(List<String> args) async {
  await runServer(args);  // delegate to lib/src/server.dart
}
```
::

## `analysis_options.yaml` — Enforcing Standards

::code-wrapper{language="yaml"}
```yaml
include: package:lints/strict.yaml  # strictest rule set

analyzer:
  exclude:
    - 'build/**'
    - '**/*.g.dart'        # generated files
    - '**/*.freezed.dart'  # generated files
  language:
    strict-casts: true      # no implicit casts (num → int requires explicit `as`)
    strict-inference: true  # flags `var x;` (no initializer, infers dynamic)
    strict-raw-types: true  # flags `List` without type args

linter:
  rules:
    - avoid_print: false     # allow print in CLI tools
    - prefer_const_constructors
    - prefer_final_locals
    - prefer_final_in_for_each
    - require_trailing_commas
    - unawaited_futures       # flags `future();` without await/unawaited()
    - cancel_subscriptions    # flags StreamSubscription not cancelled
```
::

## 💡 Tips & Tricks

- **Performance**: `dart compile exe` produces a tree-shaken AOT binary — no compiler at runtime, ~50ms cold start. Use for Docker, CLI tools, and serverless. The binary includes the Dart runtime but not the compiler.
- **Debug**: `dart run --observe bin/server.dart` starts the VM service (debugger protocol, CPU profiling). Connect VS Code or DevTools. `--observe=8181` pins the port.
- **Idiom**: `const String.fromEnvironment('dart.vm.product')` is a compile-time constant — the compiler resolves it and dead-code-eliminates the unused branch. Use it (not runtime checks) for platform/mode conditionals.
- **Idiom**: `publish_to: none` in pubspec.yaml for private apps — prevents accidental `dart pub publish` to pub.dev. Remove only when publishing a library.
- **Tooling**: `dart pub deps --style=compact` shows the dependency tree without long paths. Useful for auditing transitive dependencies.

## ⚠️ Edge Cases & Gotchas

- **`assert` is stripped in AOT**: the entire assertion expression (including side effects) vanishes in release builds. Never put business logic or side effects inside `assert(() { ... }())`.
- **`int` on web is a JS double**: on native, `int` is 64-bit. On web (dart2js/DDC), `int` is a JS number (IEEE 754 double) — values above 2^53 lose precision. Use `BigInt` for arbitrary-precision integers on web.
- **`dart:io` is native-only**: importing `dart:io` in a web project fails at compile time. Use conditional imports (`if (dart.library.html)`).
- **No `dart:mirrors` on web / AOT**: runtime reflection is unsupported in dart2js and AOT. Use code generation (`json_serializable`, `freezed`) instead.
- **`dart run` vs `dart file.dart`**: `dart run` resolves the package and runs `bin/<package_name>.dart`. `dart file.dart` compiles the file standalone (no package resolution for relative imports).
- **`pubspec.lock` for libraries**: if you commit `pubspec.lock` for a library, it can conflict with the consumer's resolution. Omit it for published libraries; commit it for apps.
- **Hot reload doesn't re-run `initState`**: in Flutter, hot reload preserves state (including `State` objects). Changes to `initState` logic require a hot restart (`R`).
- **SDK constraint floor**: `sdk: '>=3.4.0 <4.0.0'` — using a Dart 3.4 feature (e.g., pattern guards) in a project with `sdk: '>=3.0.0'` fails at analysis. Bump the floor to match feature usage.

## 🧠 Spot the Bug

A developer ships a server with an assert guarding a critical side effect. In production, the side effect never runs:

::code-wrapper{language="dart"}
```dart
void processOrder(Order order) {
  assert(_sendNotification(order), 'Notification failed');
  _commitOrder(order);
}
```
::

What happens in the AOT release build?

<details>
<summary>Answer</summary>

In AOT (release), `assert` is completely stripped — the expression `_sendNotification(order)` is never evaluated. The notification is silently skipped. Only `_commitOrder` runs.

The fix — use an explicit check, not `assert`:

```dart
void processOrder(Order order) {
  if (!_sendNotification(order)) {
    throw StateError('Notification failed for order ${order.id}');
  }
  _commitOrder(order);
}
```

`assert` is for development-time invariants (conditions that should never fail if the code is correct). Runtime validation (especially side effects) must use `if`/`throw`. The `assert` body is dead code in release.

</details>