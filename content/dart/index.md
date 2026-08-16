---
title: Learn Dart — From Zero to Pro
description: A comprehensive, edge-case-covering, idiomatic Dart curriculum. 19 chapters covering syntax, types, control flow, functions, collections, classes, null safety, async, isolates, errors, generics, packages, testing, web, Flutter, server-side, and tooling. Go from beginner to pro Dart developer.
---

# 🎯 Learn Dart — From Zero to Pro

A comprehensive, edge-case-covering, idiomatic Dart curriculum. Each document is self-contained and covers its concept deeply enough that a careful reader can go from beginner to pro Dart developer.

## How to Use This Course

1. **Read sequentially** for a structured path (01 → 19).
2. **Jump to a chapter** as a reference when you hit a concept in the wild.
3. **Run the examples** — `dart run` is your REPL.
4. **Read the Dart docs** alongside each chapter.

## Prerequisites

- The Dart SDK installed (`brew install dart` or see chapter 01).
- A code editor (VS Code with the Dart extension recommended).
- Basic programming familiarity (helps, but not required).

## Curriculum

### Part I — Foundations

| # | Topic | Why It Matters |
|---|---|---|
| 01 | [Introduction & Setup](/dart/01-introduction-and-setup) | Why Dart, SDK install, AOT vs JIT, `pub`, tooling. |
| 02 | [Variables & Data Types](/dart/02-variables-and-data-types) | `var`/`final`/`const`/`late`, built-in types, null safety basics. |
| 03 | [Operators & Expressions](/dart/03-operators-and-expressions) | Arithmetic, null-aware (`??`/`?.`/`!`), type test (`is`/`as`), cascade. |
| 04 | [Control Flow](/dart/04-control-flow) | `if`/loops/`switch` (exhaustive, expressions), `assert`. |
| 05 | [Functions & Scope](/dart/05-functions-and-scope) | Params (named, optional, `required`), closures, `typedef`, generators. |

### Part II — Core Concepts

| # | Topic | Why It Matters |
|---|---|---|
| 06 | [Collections (Lists, Sets, Maps)](/dart/06-collections) | `List`/`Set`/`Map`, spread, collection-if/for, `Iterable`. |
| 07 | [Classes & Objects](/dart/07-classes-and-objects) | Constructors, inheritance, mixins, interfaces, sealed classes. |
| 08 | [Null Safety in Depth](/dart/08-null-safety) | Sound null safety, promotion, `late`, `Object?` vs `dynamic`. |
| 09 | [Asynchronous Programming](/dart/09-async-programming) | `Future`/`async`/`await`, `Stream`, generators, `Future.wait`. |
| 10 | [Isolates & Concurrency](/dart/10-isolates-and-concurrency) | Actor-model concurrency, `Isolate.run`, message passing. |

### Part III — Advanced

| # | Topic | Why It Matters |
|---|---|---|
| 11 | [Error Handling & Exceptions](/dart/11-error-handling) | `throw`/`try`/`catch`, `Exception` vs `Error`, `rethrow`. |
| 12 | [Generics](/dart/12-generics) | Type-safe reuse, reified generics, bounds, covariance. |
| 13 | [Packages & Libraries](/dart/13-packages-and-libraries) | `import`/`export`, `pubspec.yaml`, pub.dev, visibility. |
| 14 | [Testing](/dart/14-testing) | `test` package, matchers, mocking, async tests. |
| 15 | [Dart for the Web](/dart/15-dart-for-the-web) | `dart2js`, `dart:html`, JS interop, conditional imports. |

### Part IV — Application

| # | Topic | Why It Matters |
|---|---|---|
| 16 | [Flutter Essentials](/dart/16-flutter-essentials) | Widgets, `StatefulWidget`, layout, navigation, state. |
| 17 | [Server-Side Dart](/dart/17-server-side-dart) | `dart:io`, `shelf`, `dart_frog`, databases, deployment. |
| 18 | [Tooling & Ecosystem](/dart/18-tooling-and-ecosystem) | `dart format`/`analyze`, DevTools, `build_runner`, CI. |
| 19 | [Exercises & Projects](/dart/19-exercises-and-projects) | 7 projects from CLI to a full-stack capstone. |

## Learning Path Suggestions

### If you're new to Dart (from JS/Python)

Read 01–07 (foundations, types, classes — Dart's typing is stricter than JS/Python). Then 08 (null safety — Dart's sound null safety is unique). Then 09 (async — similar to JS Promises/async-await but with `Stream`). Then 16 (Flutter) if you're doing UI, or 17 (server) if backend.

### If you're coming from Java/C#

Read 02–03 (syntax is familiar, but `var`/`final`/`const`/null-safety differ). Read 05 (named params, `required`). Read 07 (mixins, sealed classes — Dart 3). Read 08 (null safety — `?`/`!`/promotion). Read 09 (async — `Future`/`Stream` like `CompletableFuture`/`Flow`).

### If you're learning Dart for Flutter

Read 01–09 (core language). Skim 10 (isolates — rare in Flutter). Read 16 (Flutter essentials) closely. Skim 15 (web) if targeting Flutter Web. Read 18 (tooling — `build_runner`, DevTools).

### If you're a senior Dart/Flutter engineer

Skim 01–10. Read 07 (sealed classes, mixins), 08 (promotion pitfalls with fields/closures), 09 (`Future.wait` vs sequential, `Stream` subtleties), 10 (isolates, `TransferableTypedData`), 12 (reified generics, covariance), 17 (`dart_frog`, drift ORM), 18 (`build_runner`, CI) closely.

## Companion Resources

- [Dart.dev](https://dart.dev) — the official docs (language tour, library tour).
- [DartPad](https://dartpad.dev) — online editor, no install.
- [pub.dev](https://pub.dev) — package registry.
- [Effective Dart](https://dart.dev/guides/language/effective-dart) — style and best practices.
- [Flutter Docs](https://docs.flutter.dev) — for Flutter (chapter 16).
- [Dart API Reference](https://api.dart.dev) — core libraries.

## Tooling

::code-wrapper{language="bash"}
```bash
# VS Code with the Dart extension (Dart-Code.dart-code):
# - Code completion, refactoring, debugging
# - Hot reload (Flutter)
# - dart format on save
# - dart analyze diagnostics

# Install the Dart SDK:
brew install dart           # macOS
# Or see https://dart.dev/get-dart
```
::

## Zero-to-Hero Path

1. **Week 1**: Read 01–05. Write small CLI scripts (`dart run`).
2. **Week 2**: Read 06–10. Build a simple package with classes, async, tests.
3. **Week 3**: Read 11–15. Build a REST API client, web page.
4. **Week 4**: Read 16–19. Build a Flutter app + server (capstone).
5. **Ongoing**: Read the Dart docs, contribute to pub.dev packages, build real apps.