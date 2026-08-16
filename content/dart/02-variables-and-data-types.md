# 02 — Variables & Data Types

Dart is statically typed with type inference. Variables can be typed explicitly or inferred with `var`/`final`/`const`.

## Declaring Variables

::code-wrapper{language="dart"}
```dart
var name = 'Alice';          // type inferred (String)
String city = 'NYC';         // explicit type
final age = 30;              // runtime constant (int)
const pi = 3.14159;          // compile-time constant (double)
late String description;     // assigned later
```

### `var` vs explicit type

`var` infers the type from the initializer. Once inferred, the type is fixed — you can't assign a different type:

::code-wrapper{language="dart"}
```dart
var x = 10;     // x is int
x = 20;         // ✓
// x = 'hi';    // ✗ type error: x is int
```

Use `var` for local variables with obvious types. Use explicit types for public APIs, unclear initializers, or when it improves readability.

### `final` vs `const`

- **`final`** — can be set only once, at runtime. Computed once.
- **`const`** — a compile-time constant. The value must be known at compile time.

::code-wrapper{language="dart"}
```dart
final now = DateTime.now();   // ✓ runtime value
// const now = DateTime.now(); // ✗ not a compile-time constant

const defaultName = 'Guest';  // ✓ literal
final greeting = 'Hello, $defaultName';  // ✓ (string interpolation of a const)
```

`const` is deeper — if a `const` list/map contains `const` values, the whole structure is canonicalized (one instance shared). `final` only prevents reassignment, not deep mutation:

::code-wrapper{language="dart"}
```dart
final list = [1, 2, 3];
list.add(4);       // ✓ final list is mutable

const list2 = [1, 2, 3];   // const list (implicitly `const`)
// list2.add(4);            // ✗ const lists are immutable
```

### `late`

`late` declares a non-nullable variable that will be assigned later — before first use:

::code-wrapper{language="dart"}
```dart
late String description;

void init() {
	description = 'Initialized later';
}

void main() {
	init();
	print(description);   // ✓ assigned before use
}
```

`late` is useful for:
- Fields that can't be initialized in the constructor but will be before use.
- Expensive initializers that should run lazily (only when first read):

::code-wrapper{language="dart"}
```dart
late final expensiveValue = computeExpensiveValue();   // runs only when first read
```

Reading a `late` variable before it's assigned throws `LateInitializationError`.

## Built-in Types

### Numbers: `int`, `double`

::code-wrapper{language="dart"}
```dart
int age = 30;
double price = 19.99;
num anyNumber = 10;    // num is the supertype of int and double
anyNumber = 5.5;       // ✓
```

`int` is 64-bit (arbitrary precision in web). `double` is IEEE 754 64-bit. `num` is the supertype. Integer literals can use `_` as a separator: `1_000_000`.

### Strings

::code-wrapper{language="dart"}
```dart
String name = 'Alice';
String greeting = "Hello, $name!";          // interpolation
String multi = '''Multi
line
string''';                                  // triple-quoted
String raw = r'C:\Users\name';              // raw string (no escapes)
```

Both `'...'` and `"..."` work (interchangeable). `$variable` or `${expression}` for interpolation. `r'...'` is raw (backslashes are literal). Triple quotes for multi-line.

### Booleans

::code-wrapper{language="dart"}
```dart
bool isReady = true;
bool isEmpty = false;
```

Dart uses **true booleans** for conditions — unlike JavaScript, `0`, `''`, `null`, `[]` are *not* falsy. Only `true` is truthy, only `false` is falsy.

### Lists (arrays)

::code-wrapper{language="dart"}
```dart
List<int> numbers = [1, 2, 3];
var mixed = [1, 'two', 3.0];        // List<Object> (or List<dynamic>)
var fruits = <String>['apple', 'banana'];
var spread = [...fruits, 'cherry']; // spread
```

Lists are ordered, growable (by default), 0-indexed. `<Type>` before the literal specifies the type. `...` spreads another list.

### Sets

::code-wrapper{language="dart"}
```dart
Set<String> colors = {'red', 'green', 'blue'};
var numbers = <int>{1, 2, 3};
```

Sets are unordered collections of unique items. `{}` alone is a `Map` (empty), not a Set — use `<Type>{}` or `Set()` for an empty Set.

### Maps

::code-wrapper{language="dart"}
```dart
Map<String, int> ages = {'Alice': 30, 'Bob': 25};
var empty = <String, int>{};       // typed empty map
var value = ages['Alice'];         // 30 (nullable: null if missing)
ages['Charlie'] = 35;              // add/update
```

Maps are key-value pairs. Keys are unique. Accessing a missing key returns `null` (hence the value type is nullable).

### `null`

Dart has **sound null safety** (since Dart 2.12). Types are non-nullable by default. A nullable type is marked with `?`:

::code-wrapper{language="dart"}
```dart
String name = 'Alice';       // non-nullable, can't be null
String? maybeName = null;    // nullable, can be null
```

See chapter 09 for null safety in depth.

### `dynamic` and `Object`

- **`Object`** — the supertype of all non-null types. Type-safe but general.
- **`dynamic`** — disables static type checking. Any operation is allowed at compile time (checked at runtime). Use sparingly — it defeats Dart's type safety.

::code-wrapper{language="dart"}
```dart
Object x = 'hello';
// x.toUpperCase();  // ✗ Object doesn't have toUpperCase
(x as String).toUpperCase();   // ✓ cast

dynamic y = 'hello';
y.toUpperCase();    // ✓ (no static check; works at runtime)
y = 10;
y.foo();            // ✓ compiles, throws NoSuchMethodError at runtime
```

Prefer `Object` over `dynamic` when you want a general type — `Object` keeps static checks (you must cast to use methods).

## Type Conversion

::code-wrapper{language="dart"}
```dart
// String → int/double
int.parse('42');
double.parse('3.14');
int.tryParse('abc');    // null (no throw)

// int/double → String
42.toString();
3.14.toStringAsFixed(2);   // '3.14'

// int ↔ double
3.toDouble();    // 3.0
3.14.toInt();    // 3 (truncates)
```

`tryParse` returns `null` on failure (instead of throwing) — use it for user input.

## 💡 Tips & Tricks

- **Idiom**: use `var` for local variables with obvious types — `var name = 'Alice'` is clearer than `String name = 'Alice'` (the type is obvious from the literal). Use explicit types for public APIs and unclear initializers.
- **Idiom**: use `final` for variables that won't be reassigned — `final` is a runtime constant (computed once). Use `const` for compile-time constants (literals, simple expressions). Prefer `const` when possible (canonicalized, optimized).
- **Idiom**: use `late` for fields that can't be initialized in the constructor but will be before use — and for lazy initializers (`late final x = expensive();` runs only when first read). But read before assignment throws.
- **Idiom**: prefer `Object` over `dynamic` — `Object` keeps static type checks (you must cast to use methods), while `dynamic` disables them (runtime errors). Use `dynamic` only for interoperability (JSON, JS) when necessary.
- **Idiom**: use `tryParse` (not `parse`) for user input — `int.tryParse(input)` returns `null` on failure instead of throwing. Handle the `null` case explicitly.

## ⚠️ Edge Cases & Gotchas

- **Only `true`/`false` are boolean**: `if (0)`, `if ('')`, `if (null)` are compile errors (unlike JS). Only `if (bool)` is valid. Dart has no truthy/falsy coercion.
- **`{}` is an empty `Map`, not a `Set`**: `var x = {}` infers `Map<dynamic, dynamic>`. Use `var x = <int>{}` or `Set<int>()` for an empty Set.
- **`final` doesn't make collections immutable**: `final list = [1,2,3]; list.add(4)` works — `final` prevents reassigning `list`, not mutating it. Use `const` or `List.unmodifiable()` for immutable collections.
- **`const` lists/maps are deeply immutable and canonicalized**: `const [1,2,3]` is the same instance everywhere. Mutating a `const` list throws. Use for fixed data.
- **Reading a `late` variable before assignment throws**: `late int x; print(x);` throws `LateInitializationError`. Ensure `late` variables are assigned before first read.
- **`const` requires compile-time-known values**: `const x = DateTime.now()` fails (runtime value). Use `final` for runtime constants.
- **`int` on web is arbitrary precision, but `double` is 64-bit**: on the web (JS compilation), `int` is a JS number (double) — `int` values above 2^53 lose precision. On native, `int` is 64-bit.
- **Integer division returns `int`**: `7 ~/ 2 = 3` (truncated). `7 / 2 = 3.5` (always double, even for int inputs).
- **`num` is the supertype of `int` and `double`**: a `num` variable can hold either, but you can't call `int`-only methods without a cast.
- **String interpolation with `Object` calls `toString()`**: `'value: $obj'` calls `obj.toString()`. Override `toString()` in your classes for readable output.

## 🧠 Spot the Bug

A developer writes a function to check if a string is empty, but it doesn't compile:

::code-wrapper{language="dart"}
```dart
void greet(String? name) {
	if (name) {
		print('Hello, $name');
	} else {
		print('Hello, stranger');
	}
}
```
::

What's wrong?

<details>
<summary>Answer</summary>

`if (name)` is invalid — Dart conditions must be `bool`, not `String?`. Unlike JavaScript, Dart doesn't coerce strings to booleans (no truthy/falsy). `name` is a `String?` (nullable string), and `if` requires a `bool`.

The fix — compare explicitly:

```dart
void greet(String? name) {
	if (name != null && name.isNotEmpty) {
		print('Hello, $name');
	} else {
		print('Hello, stranger');
	}
}
```

Or use null-aware operators:

```dart
void greet(String? name) {
	print('Hello, ${name ?? 'stranger'}');
}
```

**The lesson**: Dart uses true booleans for conditions — no truthy/falsy coercion (unlike JS). `if (x)` requires `x` to be `bool`. Compare explicitly (`!= null`, `isNotEmpty`) or use null-aware operators (`??`).

</details>

## Summary

You can declare variables (`var`, explicit type, `final`, `const`, `late`), understand the built-in types (`int`, `double`, `num`, `String`, `bool`, `List`, `Set`, `Map`, `null`, `Object`, `dynamic`), convert types (`parse`/`tryParse`/`toString`/`toInt`/`toDouble`), and use Dart's sound null safety (`?` for nullable) — with the true-boolean and `final`-vs-`const` traps avoided. Next: operators and expressions.