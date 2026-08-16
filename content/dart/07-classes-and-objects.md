# 07 — Classes & Objects

Dart is a class-based, object-oriented language with single inheritance, mixins, interfaces (implicit), and extension methods.

## Defining a Class

::code-wrapper{language="dart"}
```dart
class Point {
	final double x;
	final double y;

	// Constructor
	Point(this.x, this.y);

	// Named constructor
	Point.origin() : x = 0, y = 0;

	// Redirecting constructor
	Point.alongXAxis(double x) : this(x, 0);

	// Method
	double distanceTo(Point other) {
		var dx = x - other.x;
		var dy = y - other.y;
		return sqrt(dx * dx + dy * dy);
	}

	// Getter
	bool get isOrigin => x == 0 && y == 0;

	// toString
	@override
	String toString() => 'Point($x, $y)';
}
```

### Constructors

- **Default** — `Point(this.x, this.y)` — `this.x` assigns the field `x` from the param `x` (shorthand).
- **Named** — `Point.origin()` — multiple constructors per class, named for clarity.
- **Redirecting** — `Point.alongXAxis(double x) : this(x, 0)` — delegates to another constructor.
- **Initializer list** — `Point(double x, double y) : x = x.abs(), y = y.abs();` — runs before the body, can use `assert`.
- **Factory** — `factory Point(...) { return ...; }` — doesn't always create a new instance (can return a cached/subtype).

### `const` constructor

::code-wrapper{language="dart"}
```dart
class ImmutablePoint {
	final double x;
	final double y;
	const ImmutablePoint(this.x, this.y);
}

const p = ImmutablePoint(1, 2);   // compile-time constant instance
const q = ImmutablePoint(1, 2);
print(identical(p, q));   // true — canonicalized
```

`const` constructors create compile-time constant instances — all `const` instances with the same args are the same object (canonicalized). All fields must be `final`, and the constructor has no body.

### Factory constructors

::code-wrapper{language="dart"}
```dart
class Logger {
	static final _cache = <String, Logger>{};

	final String name;
	Logger._internal(this.name);

	factory Logger(String name) {
		return _cache.putIfAbsent(name, () => Logger._internal(name));
	}
}

var a = Logger('app');
var b = Logger('app');
print(identical(a, b));   // true — cached
```

`factory` runs like a static method — it can return a cached instance, a subtype, or compute the instance. Use for caching, singletons, or returning subtypes.

## Fields and Properties

::code-wrapper{language="dart"}
```dart
class Person {
	String name;          // mutable field
	int _age;             // private (library-private, by convention)

	Person(this.name, this._age);

	int get age => _age;                          // getter
	set age(int value) {                          // setter
		if (value < 0) throw ArgumentError();
		_age = value;
	}

	String get displayName => name.toUpperCase();
}
```

- Fields without `final` are mutable.
- `_` prefix makes a name library-private (not truly private — accessible within the same library/file, but not from other files).
- Getters and setters use `get`/`set` — access them like fields (`person.age`, not `person.age()`).

### `late` fields

::code-wrapper{language="dart"}
```dart
class Config {
	late final String value = _load();   // lazy, runs on first access
	String _load() { /* expensive */ return 'loaded'; }
}
```

`late final` with an initializer runs the initializer on first access (lazy). Useful for expensive fields.

## Inheritance

::code-wrapper{language="dart"}
```dart
class Animal {
	String name;
	Animal(this.name);

	void speak() => print('$name makes a sound');
}

class Dog extends Animal {
	Dog(String name) : super(name);

	@override
	void speak() => print('$name barks');
}

var dog = Dog('Rex');
dog.speak();   // 'Rex barks'
```

`extends` for single inheritance. `super` calls the parent. `@override` is a hint (not enforced, but recommended) for overriding methods. Dart has **single inheritance** (one parent), unlike C++/Python.

## Interfaces (implicit)

Every class is an implicit interface. Any class can `implement` another (or multiple):

::code-wrapper{language="dart"}
```dart
class Flyer {
	void fly() => print('Flying');
}

class Bird extends Animal implements Flyer {
	Bird(String name) : super(name);

	@override
	void fly() => print('$name flies');
}
```

`implements` means "I provide the methods of this interface" — you must implement all methods (even if the class has them). `extends` means "I am a subclass" — you inherit the implementation.

A class can `implements` multiple interfaces (but `extends` only one):

::code-wrapper{language="dart"}
```dart
class Duck extends Animal implements Flyer, Swimmer { ... }
```

## Abstract Classes

::code-wrapper{language="dart"}
```dart
abstract class Shape {
	double area();          // abstract method (no body)
	void describe() => print('Area: ${area()}');   // concrete method
}

class Circle extends Shape {
	final double radius;
	Circle(this.radius);

	@override
	double area() => 3.14159 * radius * radius;
}
```

`abstract class` can't be instantiated — subclasses implement the abstract methods. Can have concrete methods too.

## Mixins

Mixins reuse code across class hierarchies (Dart has single inheritance, so mixins fill the multiple-inheritance gap):

::code-wrapper{language="dart"}
```dart
mixin Drawable {
	void draw() => print('Drawing $this');
}

mixin Resizable {
	double size = 1.0;
	void resize(double factor) => size *= factor;
}

class Icon with Drawable, Resizable {
	final String name;
	Icon(this.name);

	@override
	String toString() => name;
}

var icon = Icon('star')..draw()..resize(2.0);   // 'Drawing star', size 2.0
```

`mixin` defines reusable code; `with` applies it to a class. A class can use multiple mixins. Mixins can't be instantiated (no constructor).

### Mixin constraints

::code-wrapper{language="dart"}
```dart
mixin Flyable on Animal {   // can only be applied to Animal subclasses
	void fly() => print('$name flies');
}

class Bird extends Animal with Flyable { ... }
```

`mixin X on Y` — the mixin can only be used on `Y` or its subclasses (access to `Y`'s methods).

## Static members

::code-wrapper{language="dart"}
```dart
class MathUtils {
	static const pi = 3.14159;
	static double square(double x) => x * x;
}

MathUtils.pi;          // 3.14159
MathUtils.square(5);   // 25.0
```

`static` members belong to the class, not instances. No `this` in static methods.

## Extension methods

::code-wrapper{language="dart"}
```dart
extension StringExtension on String {
	bool get isPalindrome => this == reversed;
	String get reversed => split('').reversed.join();
}

'racecar'.isPalindrome;   // true
'hello'.reversed;         // 'olleh'
```

Extensions add methods to existing types (even library types like `String`). Useful for utility methods without subclassing.

## `enum` (enhanced, Dart 2.17+)

::code-wrapper{language="dart"}
```dart
enum Status {
	pending('Pending', 0),
	active('Active', 1),
	completed('Completed', 2);

	final String label;
	final int code;
	const Status(this.label, this.code);
}

Status.pending.label;   // 'Pending'
Status.values;          // [pending, active, completed]
```

Enhanced enums can have fields, methods, and constructors (like a class). All instances are `const`.

## Sealed classes (Dart 3)

::code-wrapper{language="dart"}
```dart
sealed class Result {}

class Success extends Result { final int value; Success(this.value); }
class Failure extends Result { final String error; Failure(this.error); }

String describe(Result r) => switch (r) {
	Success(:var value) => 'Success: $value',
	Failure(:var error) => 'Failure: $error',
};   // exhaustive — no default needed
```

`sealed` means all direct subtypes are in the same library. The compiler knows all subtypes, enabling exhaustive switches (no `default` needed, and adding a subtype flags non-exhaustive switches). Use for closed hierarchies (Result, Option, states).

## 💡 Tips & Tricks

- **Idiom**: use `this.x` in constructors for simple field assignment — `Point(this.x, this.y)` is the concise Dart idiom (no `this.x = x` body). For validation or transformation, use an initializer list: `Point(this.x, this.y) : assert(x >= 0)`.
- **Idiom**: use factory constructors for caching/subtypes — `factory Logger(name)` can return a cached instance or a subtype. Use for singletons, caching, or when the "constructor" should return an existing object.
- **Idiom**: use `const` constructors for immutable value types — `const ImmutablePoint(x, y)` creates canonicalized compile-time constants. All fields `final`, no body. Use for value types (points, colors, config).
- **Idiom**: use mixins (`mixin` + `with`) for reusable horizontal code — `class Icon with Drawable, Resizable`. Mixins fill the multiple-inheritance gap (Dart has single inheritance). Use for capabilities (Drawable, Comparable) shared across unrelated classes.
- **Idiom**: use sealed classes (Dart 3) for closed hierarchies and exhaustive switches — `sealed class Result {}` with subtypes enables the compiler to check all cases are handled. Adding a subtype flags non-exhaustive switches. Use for Result, states, ASTs.

## ⚠️ Edge Cases & Gotchas

- **`_` prefix is library-private, not class-private**: `int _age` is accessible from other classes in the *same file*, but not from other files. Dart has no true class-private; `_` is library-level.
- **`@override` is a hint, not enforced**: forgetting `@override` still overrides (if the signature matches). But the annotation catches typos (a method that doesn't actually override is flagged). Always use it.
- **`const` constructor requires all fields `final` and no body**: `const Point(this.x, this.y);` — `final` fields, no body. A non-`final` field or a body disqualifies `const`.
- **`const` instances are canonicalized**: `const Point(1,2)` is the same object everywhere (`identical` is true). Useful for equality and memory.
- **`implements` requires all methods**: `class X implements Y` — X must implement all of Y's methods (even if Y has them). Use `extends` to inherit, `implements` for interface.
- **Mixins can't have constructors**: `mixin X { X(); }` is invalid. Mixins are applied via `with`, not instantiated. Initialize via the class's constructor.
- **`late` fields throw on early access**: `late int x; print(x)` throws `LateInitializationError`. Ensure `late` fields are assigned before first read.
- **Sealed classes' subtypes must be in the same library**: you can't add a subtype from another file. This is what enables exhaustive checking. Use abstract classes if the hierarchy is open.
- **Enhanced enums are const**: `enum Status { a, b }` — all instances are `const`. You can use them in `const` contexts and switch expressions.
- **Factory constructors can't use `this`**: `factory Point()` is like a static method — no `this` (no instance yet). It returns an instance (cached, subtype, or new).

## 🧠 Spot the Bug

A developer makes an immutable `Point` class, but two points with the same coordinates aren't equal:

::code-wrapper{language="dart"}
```dart
class Point {
	final double x;
	final double y;
	const Point(this.x, this.y);
}

void main() {
	var a = Point(1, 2);
	var b = Point(1, 2);
	print(a == b);   // false
}
```
::

What's wrong?

<details>
<summary>Answer</summary>

`a == b` is `false` because `Point` doesn't override `==` — the default `==` is identity (same object). `a` and `b` are different instances, so they're not equal, even with the same coordinates. (Note: `const Point(1,2)` twice would be the same object — canonicalized — but `Point(1,2)` without `const` creates two distinct instances.)

The fix — override `==` and `hashCode`:

```dart
class Point {
	final double x;
	final double y;
	const Point(this.x, this.y);

	@override
	bool operator ==(Object other) =>
			other is Point && x == other.x && y == other.y;

	@override
	int get hashCode => Object.hash(x, y);
}

void main() {
	var a = Point(1, 2);
	var b = Point(1, 2);
	print(a == b);   // true
}
```

`Object.hash(x, y)` combines the fields into a hash. Override both `==` and `hashCode` (they must be consistent: equal objects have equal hashes).

Or, use a `record` (Dart 3) for automatic value equality:

```dart
// (double, double) — a record
var a = (1.0, 2.0);
var b = (1.0, 2.0);
print(a == b);   // true — records have value equality
```

**The lesson**: Dart's default `==` is identity (like Java, unlike Kotlin data classes). For value equality, override `==` and `hashCode` (use `Object.hash()` for the hash). Or use records (Dart 3) which have automatic value equality.

</details>

## Summary

You can define classes (constructors: default, named, redirecting, initializer list, factory, `const`), fields and properties (getters/setters, `late`, `_` private), inheritance (`extends`, `super`, `@override`), interfaces (implicit `implements`), abstract classes, mixins (`mixin`/`with`, constraints), static members, extension methods, enhanced enums, and sealed classes (Dart 3, exhaustive) — with the default-`==`-is-identity and `_`-is-library-private traps avoided. Next: null safety in depth.