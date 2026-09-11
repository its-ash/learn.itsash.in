---
title: "Dart — Web Compilation, JS Interop & Cross-Platform Patterns"
description: "Deep-dive into Dart's web compilation pipeline (dart2js/DDC/Wasm), JS interop with extension types, conditional imports for platform abstraction, and web platform limitations (int precision, no isolates, no mirrors). Code-first engineering reference."
---

# Dart — Web Compilation, JS Interop & Cross-Platform Patterns

## Compilation Targets — dart2js, DDC, Wasm

::code-wrapper{language="bash"}
```bash
# ── DDC (Dart Development Compiler) — dev mode ──
# Fast compilation, readable JS, hot reload. Used by `webdev serve`.
# Produces per-library modules (good for debugging).
dart run build_runner serve web:8080

# ── dart2js — production ──
# AOT-like, slow compilation, minified + optimized JS. Fast runtime.
# Tree-shaken, dead-code-eliminated. Single JS file + source map.
dart compile js -O2 -o build/web/main.js lib/main.dart
# -O0: no optimization (debugging)
# -O2: recommended for production (small, fast)
# -O4: aggressive (may break some patterns — test thoroughly)

# ── Wasm (experimental) ──
# Compiles to WebAssembly. Better type fidelity (Dart types → Wasm types),
# potentially faster execution. Still maturing.
dart compile wasm -o build/web/main.wasm lib/main.dart

# ── Verify behavior differs between DDC and dart2js ──
# DDC: readable JS, runtime type checks, asserts enabled.
# dart2js: minified, asserts stripped, aggressive optimizations.
# Test production with dart2js, not just DDC in dev.
```
::

## JS Interop — `dart:js_interop` & Extension Types (Dart 3.3+)

::code-wrapper{language="dart"}
```dart
import 'dart:js_interop';

// ── Declaring JS functions with @JS() ──
@JS('Math.random')
external double random();

@JS('console.log')
external void log(String message);

void main() {
  log('Hello from Dart');  // calls JS console.log
  print(random());  // calls JS Math.random()
}

// ── Wrapping JS objects with extension types (Dart 3.3+) ──
// Extension types provide a typed Dart interface over a JS object.
// Zero runtime overhead — the type is erased, the JS object is used directly.

extension type JSPromise<T>._(JSObject _) implements JSObject {
  external static JSPromise<T> resolve(T value);
  external JSPromise<T> then(JSFunction onFulfilled);
  external JSPromise<T> catch_(JSFunction onRejected);
}

extension type JSArray<T>._(JSObject _) implements JSObject {
  external T operator [](int index);
  external int get length;
  external void push(T value);
}

// ── Calling a JS library (e.g., a charting library) ──
@JS('Chart')
extension type JSChart._(JSObject _) implements JSObject {
  external factory JSChart(String selector, JSChartConfig config);
  external void draw();
}

extension type JSChartConfig._(JSObject _) implements JSObject {
  external factory JSChartConfig({
    String type,
    JSArray<JSChartDataset> datasets,
  });
}

extension type JSChartDataset._(JSObject _) implements JSObject {
  external factory JSChartDataset({
    String label,
    JSArray<double> data,
  });
}
```
::

### JS Interop — Conversion Between Dart and JS

::code-wrapper{language="dart"}
```dart
import 'dart:js_interop';

// Dart ↔ JS type conversions (extension types handle the bridging):

void main() {
  // String → JSString and back
  JSString jsStr = 'hello'.toJS;
  String dartStr = jsStr.toDart;

  // List → JSArray and back
  JSArray<JSNumber> jsArr = [1, 2, 3].map((n) => n.toJS).toList().toJS;
  List<int> dartList = jsArr.toDart.map((js) => js.toDartInt).toList();

  // Map → JSObject and back
  final jsObj = {'name': 'Alice', 'age': 30}.jsify() as JSObject;
  final dartMap = jsObj.dartify() as Map<String, dynamic>;

  // Number → JSNumber and back
  JSNumber jsNum = 42.toJS;
  int dartInt = jsNum.toDartInt;
  double dartDouble = jsNum.toDartDouble;

  // bool → JSBoolean and back
  JSBoolean jsBool = true.toJS;
  bool dartBool = jsBool.toDart;
}

// ❌ Anti-pattern: using `dynamic` for JS interop (no type safety).
// dynamic x = someJsObject;
// x.anything();  // compiles, throws at runtime if method doesn't exist

// ✓ Correct: use extension types for typed JS interop.
```
::

## Conditional Imports — Platform Abstraction

::code-wrapper{language="dart"}
```dart
// ── The pattern: a public file that conditionally re-exports ──
// storage.dart (public API)
export 'storage_io.dart'       // native
    if (dart.library.html) 'storage_web.dart';  // web

// storage_io.dart (native — uses dart:io File)
import 'dart:io';

class Storage {
  final File _file;
  Storage(this._file);

  Future<String> read() => _file.readAsString();
  Future<void> write(String data) => _file.writeAsString(data);
}

// storage_web.dart (web — uses localStorage via dart:html)
import 'dart:html';

class Storage {
  final String _key;
  Storage(this._key);

  Future<String> read() async => window.localStorage[_key] ?? '';
  Future<void> write(String data) async {
    window.localStorage[_key] = data;
  }
}

// ── Both implementations must export the SAME public API ──
// (Same class names, method signatures, return types.)
// The compiler picks the right one at compile time — zero runtime cost.
```
::

### Cross-Platform HTTP

::code-wrapper{language="dart"}
```dart
// The `http` package abstracts the platform — uses fetch on web,
// HttpClient on native. No conditional imports needed for basic HTTP.

import 'package:http/http.dart' as http;

Future<Map<String, dynamic>> fetchJson(String url) async {
  final response = await http.get(Uri.parse(url));
  if (response.statusCode != 200) {
    throw HttpException('HTTP ${response.statusCode}', uri: Uri.parse(url));
  }
  return jsonDecode(response.body) as Map<String, dynamic>;
}

// This works on BOTH web and native — the `http` package handles it.
// For advanced features (interceptors, cancellation), use `dio`.
```
::

## Web Platform Limitations

::code-wrapper{language="dart"}
```dart
// ── 1. `int` is a JS double on web ──
// Native: int is 64-bit. Web: int is IEEE 754 double — precision lost above 2^53.
// On native:
print(9007199254740993);  // 9007199254740993 (exact)
// On web:
print(9007199254740993);  // 9007199254740992 (rounded — can't represent 2^53+1)

// Fix: use BigInt for large integers on web.
final big = BigInt.parse('9007199254740993');
print(big);  // exact on all platforms

// ── 2. No `dart:io` on web ──
// File, HttpClient (server), Platform.exit, Process — all native-only.
// import 'dart:io';  // ✗ compile error on web
// Use dart:html, fetch, or the http package instead.

// ── 3. No isolates on web ──
// Dart on web is single-threaded. Isolate.run throws or runs on main thread.
// For CPU-heavy work on web, use Web Workers (via JS interop).
// await Isolate.run(() => heavy());  // ✗ may throw on web

// ── 4. No `dart:mirrors` on web/AOT ──
// Runtime reflection is unsupported in dart2js and AOT.
// import 'dart:mirrors';  // ✗ compile error on web
// Use code generation (json_serializable, freezed) instead of reflection.
```
::

## DOM Access — `dart:html`

::code-wrapper{language="dart"}
```dart
import 'dart:html';

void main() {
  // ── Querying the DOM ──
  final button = querySelector('#myButton')!;  // null if not found — use `!` or check
  final items = querySelectorAll('.item');  // ElementList (iterable)

  // ── Creating elements ──
  final div = DivElement()
    ..text = 'Hello, Dart!'  // set text
    ..classes.add('greeting')  // add CSS class
    ..style.color = 'blue';  // inline style
  document.body!.append(div);

  // ── Events are Streams ──
  button.onClick.listen((MouseEvent e) {
    print('Button clicked at (${e.clientX}, ${e.clientY})');
  });

  input.onInput.listen((Event e) {
    print('Input changed: ${input.value}');
  });

  window.onResize.listen((_) {
    print('Window resized to ${window.innerWidth}x${window.innerHeight}');
  });

  // ── Cancel subscriptions to avoid memory leaks ──
  final sub = button.onClick.listen((_) => handleClick());
  // Later (cleanup):
  sub.cancel();  // ← MUST cancel, or the listener leaks

  // ── HTTP on web (low-level) ──
  final response = await HttpRequest.getString('https://api.example.com/data');
  print(response);
}
```
::

## 💡 Tips & Tricks

- **Idiom**: use the `http` package (not `dart:io`'s `HttpClient`) for cross-platform HTTP — `http.get` works on both web (`fetch`) and native (`HttpClient`). Avoids platform conditionals for HTTP.
- **Idiom**: use conditional imports for platform-specific code — `export 'web.dart' if (dart.library.io) 'io.dart';` chooses the web or native implementation. The exported API must match. Clean for cross-platform packages.
- **Idiom**: use `dart:js_interop` + extension types (Dart 3.3+) for JS interop — `@JS()` declares JS functions, extension types wrap JS objects with typed interfaces. Safer than `dynamic` interop. Use for calling JS libraries.
- **Idiom**: use `jsonDecode`/`jsonEncode` (from `dart:convert`) for JSON — returns `dynamic`/`Map<String, dynamic>`. Cast carefully (`as Type?` then handle null). For typed JSON, use `json_serializable` (code generation).
- **Portability**: use `BigInt` for integers above 2^53 that must work on web — `int` on web is a JS double and loses precision. On native, `int` is 64-bit and safe up to 2^63-1.

## ⚠️ Edge Cases & Gotchas

- **`dart:io` doesn't work on web**: `File`, `HttpClient` (server), `Platform.exit` are native-only. Use conditional imports (`if (dart.library.html)`) for cross-platform code.
- **`int` on web is a JS double**: `int` values above 2^53 lose precision on web. For large integers, use `BigInt` or accept the limitation. On native, `int` is 64-bit.
- **No isolates on web**: `Isolate.run` throws or runs on the main thread. The web is single-threaded. Use Web Workers (via JS interop) for parallelism.
- **No `dart:mirrors` on web/AOT**: `dart2js` and AOT don't support runtime reflection. Use code generation (`json_serializable`, `freezed`) instead of reflection.
- **DDC vs dart2js output differs**: DDC (dev) produces readable JS with runtime checks; dart2js (prod) produces minified JS with asserts stripped. Test with dart2js, not just DDC.
- **`jsonDecode` returns `dynamic`**: `jsonDecode('{"a":1}')` is `Map<String, dynamic>` but statically `dynamic`. Cast: `jsonDecode(s) as Map<String, dynamic>`, then access.
- **Event listeners are `Stream`s**: `button.onClick` is `Stream<MouseEvent>`. Cancel subscriptions (`sub.cancel()`) to avoid memory leaks, especially in single-page apps.
- **`querySelector` returns `Element?`**: null if not found. Use `!` (if certain) or check for null. Forgetting the null check is a common web bug.
- **Web Workers for parallelism**: Dart on web is single-threaded. For CPU-heavy work, use Web Workers (via JS interop) — not Dart isolates (which don't exist on web).
- **Flutter Web uses CanvasKit or HTML**: CanvasKit (Skia/Wasm) has better fidelity but larger bundle (~2MB). HTML renderer is smaller but less precise. Choose based on needs.

## 🧠 Spot the Bug

A developer's cross-platform package uses `dart:io` directly for file storage. It works in dev but crashes in the web build:

::code-wrapper{language="dart"}
```dart
import 'dart:io';

class FileStorage {
  final String path;
  FileStorage(this.path);

  Future<String> read() => File(path).readAsString();
  Future<void> write(String data) => File(path).writeAsString(data);
}
```
::

How to make this cross-platform?

<details>
<summary>Answer</summary>

`dart:io` is native-only. Importing it in a web project fails at compile time (or the `File` usage fails at runtime). The code can't run on the web as-is.

The fix — use conditional imports to provide a web-specific implementation:

```dart
// storage.dart (public API — conditional export)
export 'storage_io.dart'
    if (dart.library.html) 'storage_web.dart';

// storage_io.dart (native — uses dart:io)
import 'dart:io';

class FileStorage {
  final String path;
  FileStorage(this.path);

  Future<String> read() => File(path).readAsString();
  Future<void> write(String data) => File(path).writeAsString(data);
}

// storage_web.dart (web — uses localStorage)
import 'dart:html';

class FileStorage {
  final String key;
  FileStorage(this.key);

  Future<String> read() async => window.localStorage[key] ?? '';
  Future<void> write(String data) async {
    window.localStorage[key] = data;
  }
}
```

The conditional import `if (dart.library.html) 'storage_web.dart'` chooses the web implementation when `dart:html` is available, else the native (`dart:io`) implementation. Both export the same `FileStorage` class with the same API. The compiler includes only the matching file — zero runtime cost.

Or, use the `http` package if the "file" is a URL (it abstracts the platform).

</details>