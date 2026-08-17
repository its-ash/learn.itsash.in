# 13 — Packages & Libraries

Dart organizes code into libraries and packages. A library is a unit of code; a package is a versioned collection of libraries distributed via pub.dev.

## Libraries and Files

Every Dart file is implicitly part of a library. Use `library`, `part`, `import`, and `export` to structure code.

### `import`

::code-wrapper{language="dart"}
```dart
import 'dart:io';                      // SDK library
import 'package:http/http.dart';       // package
import 'src/my_utils.dart';            // relative path
import 'utils.dart' as utils;          // prefix (namespace)
import 'lib.dart' show foo, bar;       // show only foo, bar
import 'lib.dart' hide baz;            // hide baz
```
::
- `dart:` — SDK libraries (built-in, no package needed).
- `package:` — packages from pub.dev (or local).
- Relative paths — local files.
- `as` — prefix to avoid name clashes (`utils.foo()`).
- `show`/`hide` — import specific names or hide some.

### `export`

`export` re-exports another library's API (barrel file):

::code-wrapper{language="dart"}
```dart
// src/models.dart
export 'user.dart';
export 'post.dart';
export 'comment.dart';
```
::
::code-wrapper{language="dart"}
```dart
// user code
import 'package:my_app/models.dart';   // gets User, Post, Comment
```
::
A barrel file (`models.dart`) aggregates multiple libraries — users import one file instead of many.

### `part` and `part of`

For splitting a single library across files:

::code-wrapper{language="dart"}
```dart
// my_lib.dart
library my_lib;
part 'my_lib_part.dart';
```
::
::code-wrapper{language="dart"}
```dart
// my_lib_part.dart
part of my_lib;

class Helper { ... }   // part of my_lib's namespace
```
::
`part` is for splitting one library into files (they share a namespace). Prefer multiple libraries with `import`/`export` — `part` is older and less flexible.

## Visibility (`_` prefix)

Names starting with `_` are library-private — accessible only within the same library (file, or files sharing a `library` declaration):

::code-wrapper{language="dart"}
```dart
// my_lib.dart
class MyClass {
	int _internal = 42;    // library-private
	String publicName = 'hello';   // public
}

int _helper() => 42;   // library-private
```
::
`_internal` and `_helper` aren't accessible from other libraries (other files). `publicName` is. Dart has no `public`/`private`/`protected` keywords — `_` is the only privacy modifier, and it's library-level (not class-level).

## SDK Libraries

- `dart:core` — automatically imported (`int`, `String`, `List`, `print`, etc.).
- `dart:async` — `Future`, `Stream`, `async`/`await`.
- `dart:io` — file I/O, HTTP server, sockets (not on web).
- `dart:math` — math functions, `Random`.
- `dart:convert` — JSON, UTF-8, HTML encoding.
- `dart:collection` — advanced collections (`HashMap`, `LinkedList`).
- `dart:typed_data` — typed data buffers (`Uint8List`, etc.).
- `dart:html` — DOM (web only).
- `dart:js`/`dart:js_interop` — JS interop (web).

`dart:core` is always available. Others must be imported.

## Packages

A package is a versioned collection of libraries, distributed via pub.dev. Declared in `pubspec.yaml`:

::code-wrapper{language="yaml"}
```yaml
name: my_app
description: A sample app.
version: 1.0.0

environment:
	sdk: '>=3.0.0 <4.0.0'

dependencies:
	http: ^1.0.0          # HTTP client
	path: ^1.8.0          # path manipulation

dev_dependencies:
	test: ^1.24.0         # testing framework
	lints: ^3.0.0         # linter rules
```
::
### `dart pub` commands

::code-wrapper{language="bash"}
```bash
dart pub get        # download dependencies (creates pubspec.lock)
dart pub add http   # add a dependency (updates pubspec.yaml + get)
dart pub remove http
dart pub upgrade    # upgrade within constraints
dart pub publish    # publish to pub.dev
dart pub deps       # show dependency tree
```
::
### Version constraints

::code-wrapper{language="yaml"}
```yaml
dependencies:
	http: ^1.2.3          # >=1.2.3 <2.0.0 (compatible)
	http: '>=1.0.0 <2.0.0'  # explicit range
	http: 1.2.3            # exactly 1.2.3 (discouraged)
	http: any              # any version (discouraged)
```
::
`^1.2.3` is the common form — allows patch and minor updates, but not major (breaking) changes.

### `pubspec.lock`

`pubspec.lock` records the exact versions resolved. Commit it for apps (reproducible builds). For libraries, you may omit it (let the app resolve).

## Popular Packages

- `http` — HTTP client.
- `dio` — advanced HTTP client.
- `test` — testing framework.
- `mockito` — mocking.
- `intl` — internationalization.
- `shelf` — server framework.
- `args` — command-line argument parsing.
- `path` — path manipulation.
- `json_serializable` — JSON code generation.
- `riverpod`/`provider`/`bloc` — state management (Flutter).

## Creating a Package

::code-wrapper{language="bash"}
```bash
dart create -t package my_package   # a library package
cd my_package
```
::
This creates:
::code-wrapper{language="text"}
```text
my_package/
├── lib/
│   └── my_package.dart   # public API (export)
├── test/
├── pubspec.yaml
└── README.md
```
::
Put public code in `lib/`, export via `lib/my_package.dart`. Internal code goes in `lib/src/` (imported by `lib/`, not by users — `src/` is convention-private).

## Deferred Loading (web)

::code-wrapper{language="dart"}
```dart
import 'heavy.dart' deferred as heavy;

void main() async {
	await heavy.loadLibrary();   // load on demand
	heavy.doWork();              // now available
}
```
::
`deferred` loads the library on demand (via `loadLibrary()`). Useful for code-splitting on the web (smaller initial bundle). Only works on web (and Flutter mobile in some setups).

## 💡 Tips & Tricks

- **Idiom**: use barrel files (`export`) to aggregate a library's public API — `lib/models.dart` exports `user.dart`, `post.dart`, etc. Users import one file (`package:my_app/models.dart`) instead of many. Clean API surface.
- **Idiom**: put internal code in `lib/src/` and export only public code from `lib/` — `lib/src/` is convention-private (users shouldn't import it). Export public APIs from `lib/my_package.dart`. This is the standard package structure.
- **Idiom**: use `show`/`hide` to control imports — `import 'lib.dart' show foo, bar;` imports only `foo`, `bar`; `hide baz` excludes `baz`. Avoids namespace pollution and name clashes.
- **Idiom**: use `as` to prefix imports with name clashes — `import 'package:dartx/dartx.dart' as dartx;` then `dartx.method()`. Use when two libraries export the same name.
- **Idiom**: commit `pubspec.lock` for apps (reproducible builds), omit for libraries (let the app resolve). Apps need exact versions; libraries should be flexible.

## ⚠️ Edge Cases & Gotchas

- **`_` is library-private, not class-private**: `int _x` in a class is accessible from other classes in the same file/library. Dart has no class-private visibility. If you need class-private, use a closure or a nested class.
- **`dart:io` doesn't work on web**: `File`, `HttpClient`, etc. are native-only. On web, use `dart:html`/`fetch`. Conditionally import based on platform (chapter 16).
- **`part` shares the namespace**: files in a `part` share the library's namespace (no imports needed between them). But this couples the files — prefer separate libraries with `import`.
- **`show`/`hide` don't affect `_` private names**: private names (`_x`) aren't exported anyway. `show`/`hide` apply to public names.
- **`any` version constraint is discouraged**: `http: any` allows any version, leading to unpredictable builds. Use `^x.y.z` or a range.
- **Exact version (`1.2.3`) is discouraged for libraries**: it forces the app to use exactly that version, causing conflicts. Use `^x.y.z` for libraries.
- **`pub get` updates `pubspec.lock`**: run `dart pub get` after changing `pubspec.yaml`. Without it, the new dependency isn't downloaded.
- **`lib/src/` is convention-private**: users *can* import `package:my_app/src/...` (no enforcement), but shouldn't. Keep public API in `lib/`, internal in `lib/src/`.
- **Deferred loading is web-only (mostly)**: `deferred` works on web (code-splitting) and Flutter mobile (deferred components loading). Not all platforms support it.
- **`dart:core` is auto-imported**: `int`, `String`, `List`, `print`, etc. Don't import `dart:core` explicitly (it's already there).

## 🧠 Spot the Bug

A developer imports two libraries that both export a `Config` class, and gets a name clash:

::code-wrapper{language="dart"}
```dart
import 'package:app_a/config.dart';
import 'package:app_b/config.dart';

void main() {
	var config = Config();   // which Config?
}
```
::

How to fix it?

<details>
<summary>Answer</summary>

Both libraries export `Config`, causing a name clash — `Config` is ambiguous (which one?). The compiler errors: `name 'Config' is defined in libraries ... and ...`.

The fix — use `as` to prefix one (or both):

```dart
import 'package:app_a/config.dart';
import 'package:app_b/config.dart' as app_b;

void main() {
	var configA = Config();        // app_a's Config
	var configB = app_b.Config();  // app_b's Config
}
```
::
Or use `show`/`hide` to import only what you need:

```dart
import 'package:app_a/config.dart' show Config;
import 'package:app_b/config.dart' show Config as BConfig;  // alias doesn't work this way
```
::
Actually, `show`/`hide` don't alias — use `as` for an alias. The cleanest fix is `as` to namespace:

```dart
import 'package:app_a/config.dart' as a;
import 'package:app_b/config.dart' as b;

void main() {
	var configA = a.Config();
	var configB = b.Config();
}
```
::
**The lesson**: when two libraries export the same name, use `as` to prefix one (or both) and access via the prefix (`a.Config`, `b.Config`). `show`/`hide` control which names are imported but don't alias; `as` provides the namespace.

</details>

## Summary

You can structure code with libraries (`import`, `export`, barrel files, `part`), use `dart:` SDK libraries and `package:` dependencies, control visibility (`_` library-private), manage packages with `pub` (`pubspec.yaml`, version constraints, `pub get`/`add`/`publish`), use deferred loading (web code-splitting), and organize a package (`lib/` public, `lib/src/` internal) — with the name-clash and `dart:io`-web traps avoided. Next: testing.