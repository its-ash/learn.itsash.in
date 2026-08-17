# 15 — Dart for the Web

Dart compiles to JavaScript (via `dart2js` or `dart compile js`) or WebAssembly (Wasm, experimental). It's the language behind Flutter Web and can be used for web apps directly.

## Web Compilation

### `dart2js` (production)

::code-wrapper{language="bash"}
```bash
dart compile js -O2 -o out.js main.dart
```
::
`dart2js` compiles Dart to optimized JavaScript. `-O2`/`-O4` are optimization levels (higher = smaller/faster, less debuggable). Produces a single JS file + source map.

### `dart compile wasm` (experimental)

::code-wrapper{language="bash"}
```bash
dart compile wasm -o out.wasm main.dart
```
::
Compiles to WebAssembly (Wasm). Faster execution, better typing (Dart's types map to Wasm's types). Still experimental — JS is the stable web target.

### Development server

::code-wrapper{language="bash"}
```bash
dart run build_runner serve web:8000   # via build_runner
```
::
Or use `webdev`:

::code-wrapper{language="bash"}
```bash
dart pub global activate webdev
webdev serve
```
::
`webdev serve` provides a dev server with hot reload (JIT via DDC — Dart Development Compiler).

## DDC vs dart2js

- **DDC (Dart Development Compiler)** — used in dev. JIT-like, fast compilation, hot reload, readable JS (for debugging). Slower runtime.
- **dart2js** — used for production. AOT-like, slower compilation, optimized/minified JS. Fast runtime.

## `dart:html` (DOM)

::code-wrapper{language="dart"}
```dart
import 'dart:html';

void main() {
	final button = querySelector('#myButton')!;
	button.onClick.listen((event) {
		window.alert('Clicked!');
	});

	final div = DivElement()
		..text = 'Hello, Dart!'
		..classes.add('greeting');
	document.body!.append(div);
}
```
::
`dart:html` provides DOM access (`querySelector`, `DivElement`, `window`, `document`, events). It's the web equivalent of `dart:io` (native).

### Events

::code-wrapper{language="dart"}
```dart
button.onClick.listen((MouseEvent e) { ... });
input.onInput.listen((Event e) { ... });
	form.onSubmit.listen((Event e) { e.preventDefault(); ... });
	window.onResize.listen((Event e) { ... });
```
::
Events are `Stream`s — `onClick`, `onInput`, etc. are `Stream<Event>`. Use `.listen`, `await for`, or stream methods.

## `dart:js_interop` (JS interop)

::code-wrapper{language="dart"}
```dart
import 'dart:js_interop';

@JS('Math.random')
external double random();

@JS('console.log')
external void log(String message);

void main() {
	log('Hello from Dart');
	print(random());
}
```
::
`@JS()` declares a JS function. `external` means the implementation is in JS. Call it like a Dart function.

### Extension types (Dart 3.3+)

::code-wrapper{language="dart"}
```dart
import 'dart:js_interop';

extension type JSPromise<T>._(JSObject _) implements JSObject {
	external static JSPromise<T> resolve(T value);
}

extension type JSArray<T>._(JSObject _) implements JSObject {
	external T operator [](int index);
	external int get length;
}
```
::
Extension types wrap JS objects with typed Dart interfaces — safer than `dynamic` JS interop. Use for structured JS interop (libraries, DOM extensions).

## JSON

::code-wrapper{language="dart"}
```dart
import 'dart:convert';

// Encode
var json = jsonEncode({'name': 'Alice', 'age': 30});
// '{"name":"Alice","age":30}'

// Decode
var data = jsonDecode('{"name":"Alice","age":30}');
print(data['name']);   // 'Alice' (dynamic)
```
::
`jsonDecode` returns `dynamic` (a `Map<String, dynamic>` for objects, `List<dynamic>` for arrays). Cast carefully (chapter 08).

### HTTP (web)

::code-wrapper{language="dart"}
```dart
import 'package:http/http.dart' as http;

void main() async {
	final response = await http.get(Uri.parse('https://api.example.com/data'));
	if (response.statusCode == 200) {
		final data = jsonDecode(response.body);
		print(data);
	}
}
```
::
The `http` package works on both web and native (uses `fetch`/`XMLHttpRequest` on web, `HttpClient` on native).

## Cross-Platform Code

For code that runs on both web and native, use conditional imports:

::code-wrapper{language="dart"}
```dart
// platform.dart
export 'platform_web.dart' if (dart.library.io) 'platform_io.dart';
```
::
::code-wrapper{language="dart"}
```dart
// platform_web.dart
import 'dart:html';
String get platform => 'web';
```
::
::code-wrapper{language="dart"}
```dart
// platform_io.dart
import 'dart:io';
String get platform => 'io (${Platform.operatingSystem})';
```
::
The conditional import chooses `platform_web.dart` on web, `platform_io.dart` on native. The exported API must match.

## Web Limitations

- **No `dart:io`**: `File`, `HttpClient` (server-side), `Platform.exit` aren't available. Use `dart:html`/`fetch`/`http` instead.
- **`int` is a JS number (double)**: on web, `int` is 64-bit float — values above 2^53 lose precision. On native, `int` is 64-bit integer.
- **No isolates**: the web is single-threaded. `Isolate.run` throws or falls back. Use Web Workers (via JS interop) for parallelism.
- **Reflection (`dart:mirrors`) not supported**: `dart2js` doesn't support mirrors. Use code generation (`json_serializable`) instead.

## Flutter Web

Flutter compiles to web — the same Flutter UI code runs on iOS, Android, desktop, and web. Use `flutter build web` to produce the web bundle.

::code-wrapper{language="bash"}
```bash
flutter create my_app
cd my_app
flutter build web   # builds to build/web/
```
::
Flutter Web uses HTML/CSS/Canvas (or CanvasKit/Skia for better fidelity). The DOM is an implementation detail — you write Flutter widgets, not HTML.

## 💡 Tips & Tricks

- **Idiom**: use `dart:html` for DOM access on web — `querySelector`, `DivElement`, `onClick.listen`. It's the web equivalent of `dart:io`. For cross-platform, use conditional imports.
- **Idiom**: use conditional imports for platform-specific code — `export 'web.dart' if (dart.library.io) 'io.dart';` chooses the web or native implementation. The exported API must match. Clean for cross-platform packages.
- **Idiom**: use `dart:js_interop` + extension types (Dart 3.3+) for JS interop — `@JS()` declares JS functions, extension types wrap JS objects with typed interfaces. Safer than `dynamic` interop. Use for calling JS libraries.
- **Idiom**: use the `http` package (not `dart:io`'s `HttpClient`) for cross-platform HTTP — `http.get` works on both web (`fetch`) and native (`HttpClient`). Avoids platform conditionals for HTTP.
- **Idiom**: use `jsonDecode`/`jsonEncode` (from `dart:convert`) for JSON — returns `dynamic`/`Map<String, dynamic>`. Cast carefully (`as Type?` then handle null). For typed JSON, use `json_serializable` (code generation).

## ⚠️ Edge Cases & Gotchas

- **`dart:io` doesn't work on web**: `File`, `HttpClient` (server), `Platform.exit` are native-only. Use `dart:html`/`fetch`/`http`. Use conditional imports for cross-platform.
- **`int` on web is a JS number (double)**: `int` values above 2^53 lose precision on web. For large integers, use `BigInt` or accept the limitation. On native, `int` is 64-bit.
- **No isolates on web**: `Isolate.run` throws or runs on the main thread. The web is single-threaded. Use Web Workers (via JS interop) for parallelism.
- **No `dart:mirrors` on web**: `dart2js` doesn't support runtime reflection. Use code generation (`json_serializable`, `freezed`) instead of reflection.
- **DDC vs dart2js output differs**: DDC (dev) produces readable JS; dart2js (prod) produces minified JS. Don't test dart2js behavior with DDC only — test both.
- **`jsonDecode` returns `dynamic`**: `jsonDecode('{"a":1}')` is `Map<String, dynamic>` but statically `dynamic`. Cast: `jsonDecode(s) as Map<String, dynamic>`, then access.
- **JS interop `external` functions have no Dart body**: the implementation is in JS. Calling `random()` calls JS `Math.random`. Ensure the JS name matches (`@JS('Math.random')`).
- **Event listeners are `Stream`s**: `button.onClick` is a `Stream<MouseEvent>`. Use `.listen`, `await for`, or stream methods. Remember to cancel subscriptions to avoid memory leaks.
- **Web Workers for parallelism**: Dart on web is single-threaded. For CPU-heavy work, use Web Workers (via JS interop) — not Dart isolates (which don't exist on web).
- **Flutter Web uses CanvasKit or HTML**: CanvasKit (Skia/Wasm) has better fidelity but larger bundle (~2MB). HTML renderer is smaller but less precise. Choose based on needs.

## 🧠 Spot the Bug

A developer's cross-platform code fails on the web because it imports `dart:io`:

::code-wrapper{language="dart"}
```dart
import 'dart:io';
import 'package:http/http.dart' as http;

Future<String> readFile(String path) async {
	return File(path).readAsString();
}
```
::

On the web, this throws. How to fix it?

<details>
<summary>Answer</summary>

`dart:io` isn't available on the web — importing it fails (or the `File` usage fails at runtime). The code can't run on the web as-is.

The fix — use conditional imports to provide a web-specific implementation:

```dart
// file_reader.dart (public API)
export 'file_reader_io.dart' if (dart.library.html) 'file_reader_web.dart';
```
::
```dart
// file_reader_io.dart (native)
import 'dart:io';
Future<String> readFile(String path) async => File(path).readAsString();
```
::
```dart
// file_reader_web.dart (web)
import 'dart:html';
Future<String> readFile(String path) async {
	// On web, "files" are from <input type="file"> or fetch
	final response = await HttpRequest.getString(path);
	return response;
}
```
::
The conditional import `if (dart.library.html) 'file_reader_web.dart'` chooses the web implementation when `dart:html` is available, else the native (`dart:io`) implementation. Both export the same `readFile` function.

Or, use the `http` package for both (it abstracts the platform):

```dart
import 'package:http/http.dart' as http;

Future<String> readFile(String url) async {
	final response = await http.get(Uri.parse(url));
	return response.body;
}
```
::
`http` works on both web (`fetch`) and native (`HttpClient`), so no conditional needed — if the "file" is a URL.

**The lesson**: `dart:io` is native-only. For cross-platform code, use conditional imports (`export 'a.dart' if (dart.library.html) 'b.dart'`) to provide platform-specific implementations, or use a cross-platform package like `http` that abstracts the platform.

</details>

## Summary

You can compile Dart to web (`dart2js` for production, DDC for dev, Wasm experimental), use `dart:html` for DOM, `dart:js_interop` + extension types for JS interop, `dart:convert` for JSON, the `http` package for cross-platform HTTP, conditional imports for platform-specific code, and understand web limitations (no `dart:io`, `int` is a double, no isolates, no mirrors) — with the `dart:io`-on-web trap avoided. Next: Flutter essentials.