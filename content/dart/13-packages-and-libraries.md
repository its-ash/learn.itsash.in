---
title: "Dart — Libraries, Visibility & Package Architecture"
description: "Deep-dive into Dart's library system, conditional imports, barrel files, deferred loading, convention-private visibility, and monorepo dependency patterns. Code-first engineering reference."
---

# Dart — Libraries, Visibility & Package Architecture

## Library Visibility — The `_` Prefix Is Library-Level

::code-wrapper{language="dart"}
```dart
// Dart has ONE privacy modifier: the underscore prefix (`_`).
// `_name` is library-private — accessible within the same library (file or
// files sharing a `library` declaration), NOT from other libraries.
// There is NO `public`/`private`/`protected` — no class-private visibility.

// lib/src/cache.dart
class Cache {
  final Map<String, _Entry> _entries = {};  // both _Entry and _entries are private
  String? _key;  // private field — accessible from other classes in THIS file

  void put(String key, String value) {
    _entries[key] = _Entry(value);  // ✓ accessing _Entry from same library
  }
}

class _Entry {  // private class — not exported, not visible outside this file
  final String value;
  _Entry(this.value);
}

// ❌ Anti-pattern: expecting `_` to be class-private.
class Counter {
  int _count = 0;  // library-private, NOT class-private
  void increment() => _count++;
}

class CounterHelper {
  final Counter counter;
  CounterHelper(this.counter);
  void reset() {
    // counter._count = 0;  // ✓ compiles if in the same file! _count is library-private.
  }
}
```

## Import Variants — `as`, `show`, `hide`

::code-wrapper{language="dart"}
```dart
// ── `as`: namespace prefix (avoid name clashes) ──
import 'package:http/http.dart' as http;
// http.get(...), http.post(...) — all http members are prefixed.

// ── `show`: import only specific names ──
import 'package:shelf/shelf.dart' show Request, Response, Pipeline;
// Only Request, Response, Pipeline are available — no Router, no logRequests.

// ── `hide`: import everything except specific names ──
import 'package:shelf/shelf.dart' hide logRequests;
// Everything except logRequests.

// ── Combining: prefix + show/hide ──
import 'package:shelf/shelf.dart' as shelf show Request, Response;

// ❌ Anti-pattern: name clash from two libraries exporting the same name.
import 'package:app_a/config.dart';  // exports Config
import 'package:app_b/config.dart';  // also exports Config
// Error: 'Config' is defined in both libraries.

// ✓ Correct: prefix one or both.
import 'package:app_a/config.dart';
import 'package:app_b/config.dart' as app_b;

void main() {
  var a = Config();       // app_a's Config
  var b = app_b.Config();  // app_b's Config
}
```
::

## Barrel Files — Aggregating Public APIs

::code-wrapper{language="dart"}
```dart
// A barrel file re-exports multiple libraries as a single import surface.
// Users import one file instead of many — clean API boundary.

// lib/models.dart — barrel file
export 'src/models/user.dart';
export 'src/models/post.dart';
export 'src/models/comment.dart';
export 'src/models/event.dart' show Event, ClickEvent;  // selective export

// User code:
import 'package:my_app/models.dart';  // gets User, Post, Comment, Event, ClickEvent

// ── Package public API barrel ──
// lib/my_package.dart — the single entry point for consumers
library my_package;

export 'src/core.dart';
export 'src/utils.dart' show StringUtils, DateUtils;
export 'src/types.dart';
// src/ is convention-private — users shouldn't import src/ directly.
```
::

## Conditional Imports — Platform-Specific Code

::code-wrapper{language="dart"}
```dart
// Conditional imports select an implementation at COMPILE TIME based on
// which dart: libraries are available. Zero runtime cost — the compiler
// includes only the matching file and dead-code-eliminates the other.

// platform.dart — public API (both implementations must export the same API)
export 'platform_io.dart'     // native: dart:io is available
    if (dart.library.html) 'platform_web.dart';  // web: dart:html is available

// platform_io.dart
import 'dart:io';
String get platformName => Platform.operatingSystem;
Future<List<int>> readFile(String path) => File(path).readAsBytes();

// platform_web.dart — same API, web implementation
import 'dart:html';
String get platformName => 'web';
Future<List<int>> readFile(String url) async {
  final response = await HttpRequest.request(url, responseType: 'arraybuffer');
  return (response.response as ByteBuffer).asUint8List();
}

// ── Using the conditional import ──
import 'platform.dart';  // resolves to io or web at compile time

void main() async {
  print(platformName);  // 'macos' on native, 'web' on web
  final bytes = await readFile('data.bin');
}

// ❌ Anti-pattern: importing dart:io directly in cross-platform code.
// import 'dart:io';  // ✗ fails on web — compile error
```
::

## Deferred Loading — Code Splitting (Web)

::code-wrapper{language="dart"}
```dart
// `deferred as` loads a library on DEMAND (via loadLibrary()).
// Useful on web for code-splitting — smaller initial bundle.
// The library is downloaded only when loadLibrary() is called.

import 'heavy_editor.dart' deferred as editor;

void main() async {
  // The editor library is NOT loaded yet — smaller initial bundle.
  print('App started');

  // Load on demand (e.g., when user opens the editor):
  await editor.loadLibrary();  // downloads + compiles the library
  editor.openEditor();  // now available
}

// ── Flutter deferred components ──
// On Flutter mobile, deferred loading enables dynamic feature delivery
// (download features on demand). Configure in build.gradle / Info.plist.

// Limitations:
// - Can't use deferred types at compile time before loadLibrary().
// - `editor.Editor` is available as a type, but instantiating before
//   loadLibrary() throws.
```
::

## Monorepo — Path Dependencies

::code-wrapper{language="yaml"}
```yaml
# In a monorepo, packages depend on each other via path: dependencies.
# pubspec.yaml for my_service/
dependencies:
  shared_models:
    path: ../shared_models  # relative path to the sibling package
  my_lib:
    path: ../../packages/my_lib

# ── Melos for monorepo management ──
# For large monorepos, use `melos` to manage multiple packages:
# melos bootstrap — run `pub get` for all packages
# melos exec -- dart test — run tests in all packages
# melos publish — publish all packages
```

::code-wrapper{language="bash"}
```bash
# Bootstrap a monorepo (install deps for all packages):
dart pub global activate melos
melos bootstrap

# Run a command in all packages:
melos exec -- dart analyze
melos exec -- dart test

# The root melos.yaml configures the workspace:
# packages:
#   - 'packages/*'
#   - 'apps/*'
```
::

## SDK Libraries — What's Available

::code-wrapper{language="dart"}
```dart
// ── dart:core (auto-imported) ──
// int, String, List, Map, Set, bool, num, Object, print, DateTime, Duration, etc.

// ── dart:async ──
import 'dart:async';
// Future, Stream, Completer, StreamController, runZonedGuarded, Timer

// ── dart:io (native only — not web) ──
import 'dart:io';
// File, Directory, HttpServer, HttpClient, Platform, Process, stdin, stdout

// ── dart:convert ──
import 'dart:convert';
// jsonEncode, jsonDecode, utf8, base64, Base64Encoder/Decoder

// ── dart:math ──
import 'dart:math';
// Random, pi, e, max, min, sqrt, pow, exp, log

// ── dart:collection ──
import 'dart:collection';
// HashMap, LinkedHashMap, LinkedList, Queue, DoubleLinkedQueue

// ── dart:typed_data ──
import 'dart:typed_data';
// Uint8List, Int32List, Float64List, ByteBuffer, ByteData, TransferableTypedData

// ── dart:html (web only) ──
import 'dart:html';
// document, window, querySelector, DivElement, HttpRequest, WebSocket

// ── dart:js_interop (web, modern) ──
import 'dart:js_interop';
// @JS(), external functions, JSObject, JSArray, extension types
```
::

## 💡 Tips & Tricks

- **Idiom**: use barrel files (`export`) to aggregate a library's public API — `lib/models.dart` exports `user.dart`, `post.dart`, etc. Users import one file (`package:my_app/models.dart`) instead of many. Clean API surface.
- **Idiom**: put internal code in `lib/src/` and export only public code from `lib/` — `lib/src/` is convention-private (users shouldn't import it). Export public APIs from `lib/my_package.dart`. This is the standard package structure.
- **Idiom**: use `show`/`hide` to control imports — `import 'lib.dart' show foo, bar;` imports only `foo`, `bar`; `hide baz` excludes `baz`. Avoids namespace pollution and name clashes.
- **Idiom**: use `as` to prefix imports with name clashes — `import 'package:dartx/dartx.dart' as dartx;` then `dartx.method()`. Use when two libraries export the same name.
- **Idiom**: commit `pubspec.lock` for apps (reproducible builds), omit for libraries (let the consumer resolve). Apps need exact versions; libraries should be flexible.

## ⚠️ Edge Cases & Gotchas

- **`_` is library-private, not class-private**: `int _x` in a class is accessible from other classes in the same file/library. Dart has no class-private visibility. If you need class-private, use a closure or a nested class.
- **`dart:io` doesn't work on web**: `File`, `HttpClient`, `Platform.exit` are native-only. Use conditional imports (`if (dart.library.html)`) for cross-platform code.
- **`part` shares the namespace**: files in a `part` share the library's namespace (no imports needed between them). But this couples the files — prefer separate libraries with `import`.
- **`show`/`hide` don't affect `_` private names**: private names (`_x`) aren't exported anyway. `show`/`hide` apply to public names only.
- **`any` version constraint is discouraged**: `http: any` allows any version, leading to unpredictable builds. Use `^x.y.z` or a range.
- **Exact version (`1.2.3`) is discouraged for libraries**: it forces the app to use exactly that version, causing conflicts. Use `^x.y.z` for libraries.
- **`pub get` updates `pubspec.lock`**: run `dart pub get` after changing `pubspec.yaml`. Without it, the new dependency isn't downloaded.
- **`lib/src/` is convention-private**: users *can* import `package:my_app/src/...` (no enforcement), but shouldn't. Keep public API in `lib/`, internal in `lib/src/`.
- **Deferred loading is mostly web/Flutter-mobile**: `deferred` works on web (code-splitting) and Flutter mobile (deferred components). Not all platforms support it.
- **`dart:core` is auto-imported**: `int`, `String`, `List`, `print`, etc. Don't import `dart:core` explicitly — it's always available.

## 🧠 Spot the Bug

A developer uses a private class from another file, expecting `_` to make it inaccessible:

::code-wrapper{language="dart"}
```dart
// lib/src/internal.dart
class _Internal {
  String secret = 'hidden';
}

// lib/api.dart
import 'src/internal.dart';

class Api {
  final internal = _Internal();  // ✗ compile error
}
```
::

Why doesn't this compile?

<details>
<summary>Answer</summary>

`_Internal` is **library-private** — it's only visible within `lib/src/internal.dart` (the same library/file). Importing it into `lib/api.dart` doesn't make it accessible — `import` brings in public names, not private (`_`-prefixed) ones.

The fix — either make the class public (remove `_`), or export a public wrapper:

```dart
// Option 1: make it public (if it should be used by api.dart)
// lib/src/internal.dart
class Internal {  // no underscore — public
  String secret = 'hidden';
}

// Option 2: keep it private, expose via a public API
// lib/src/internal.dart
class _Internal {
  String secret = 'hidden';
}

// Public factory/wrapper that hides the implementation:
Internal createInternal() => Internal._(_Internal());
class Internal {
  final _Internal _impl;
  Internal._(this._impl);
  String get secret => _impl.secret;
}
```

`_` privacy is **library-level** (file-level unless using `part`), not import-level. A `_`-prefixed name is invisible to all other libraries, even those that `import` the file. If you need it in another file, make it public or expose a public wrapper.

</details>