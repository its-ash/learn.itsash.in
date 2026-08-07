# 02 — Variables & Data Types

## Declaration: `val`, `var`, and `lazy val`

Scala encourages immutability by default.

| Keyword | Mutable | Reassignable | Lazily Evaluated | Best For |
|---|---|---|---|---|
| `val` | No | No | No | Default — constants and immutable bindings |
| `var` | No | Yes | No | When you must reassign the binding |
| `lazy val` | No | No | Yes | Expensive computations deferred to first access |

::code-wrapper{language="scala"}
```scala
val name = "Alice"              // immutable binding, immutable String
var count = 0                   // mutable binding (can reassign)
count = 1                       // OK

lazy val expensive = fibonacci(1000)  // computed only when first accessed
```
::

### Best practice: prefer `val`

`val` is the default. Use `var` only when you genuinely need to reassign the binding (rare in functional Scala).

::code-wrapper{language="scala"}
```scala
val user = User(name = "Alice")  // never changes
user.copy(name = "Bob")          // immutable update pattern

// Don't do this:
var user = User(name = "Alice")
user = User(name = "Bob")        // reassigning binding (vs updating object)
```
::

## Type Inference

Scala infers types from context, but explicit annotations are often clearer.

::code-wrapper{language="scala"}
```scala
val x = 42                    // Int (inferred)
val y: Int = 42               // explicit annotation
val z: Long = 42L             // force Long type
val s = "hello"               // String
val d = 3.14                  // Double
val b = true                  // Boolean
```
::

### When to annotate

Annotate when:
- The inferred type isn't obvious to a reader
- You're defining a function parameter or return type
- You want to force a parent type (e.g., `val x: Number = 42`)

## Numeric Types

Scala has a complete numeric hierarchy: `Byte`, `Short`, `Int`, `Long`, `Float`, `Double`, and `BigInt`/`BigDecimal` for arbitrary precision.

::code-wrapper{language="scala"}
```scala
val b: Byte = 127              // 8-bit: -128 to 127
val s: Short = 32767          // 16-bit
val i = 42                     // Int (default integer)
val l = 42L                    // Long (64-bit)

val f = 3.14f                  // Float (32-bit)
val d = 3.14                   // Double (default float)

val big = BigInt("999999999999999999")
val decimal = BigDecimal("0.1")

// Arithmetic
10 + 5                         // 15
10 - 5                         // 5
10 * 5                         // 50
10 / 5                         // 2 (integer division)
10.0 / 5                       // 2.0 (float division)
10 % 3                         // 1
2 ^ 64                         // won't compile (use Math.pow or BigInt)
```
::

### Edge case: integer division

::code-wrapper{language="scala"}
```scala
10 / 4                         // 2 (not 2.5)
10 / 4.0                       // 2.5 (at least one operand is Double)
10.0 / 4                       // 2.5

// Floating-point precision (same as JavaScript)
0.1 + 0.2 == 0.3               // false
(0.1 + 0.2) - 0.3 < 1e-9       // true (epsilon comparison)
```
::

## Strings

Immutable sequences of characters (UTF-16).

::code-wrapper{language="scala"}
```scala
val s = "hello"
val t = 'c'                    // single character is Char, not String

// String interpolation
val name = "Alice"
val age = 30
s"Hello $name, age $age"       // "Hello Alice, age 30"
s"Next year: ${age + 1}"       // "Next year: 31"

// Raw strings (no escaping)
raw"C:\path\to\file"           // "C:\path\to\file" (no double backslash needed)

// Multi-line strings
val poem = """
  |Roses are red
  |Violets are blue
  |""".stripMargin              // remove leading whitespace
```
::

### String methods

::code-wrapper{language="scala"}
```scala
"hello".length                 // 5
"hello"(0)                     // 'h' (0-indexed, unlike Lua!)
"hello".substring(1, 4)        // "ell"
"hello".toUpperCase()          // "HELLO"
"hello".startsWith("he")       // true
"hello world".split(" ")       // Array("hello", "world")
```
::

## Booleans

::code-wrapper{language="scala"}
```scala
val a = true
val b = false

// Logical operators
a && b                         // false (logical AND)
a || b                         // true (logical OR)
!a                             // false (logical NOT)

// Short-circuit evaluation
a || expensive()               // doesn't call expensive() if a is true
b && expensive()               // doesn't call expensive() if b is false
```
::

## Tuples

Fixed-size heterogeneous collections.

::code-wrapper{language="scala"}
```scala
val pair = (1, "hello")
val triple = (1, "hello", 3.14)

pair._1                        // 1 (1-indexed access, like Lua!)
pair._2                        // "hello"

// Destructuring
val (x, y) = (1, 2)
val (a, b, c) = (1, "hello", 3.14)

// Ignoring elements
val (first, _) = (1, 2)
```
::

## Collections

Scala has immutable and mutable collections. Prefer immutable by default.

::code-wrapper{language="scala"}
```scala
// Lists (immutable, linked-list)
val nums = List(1, 2, 3)
val moreNums = 0 +: nums       // prepend: List(0, 1, 2, 3)
val evens = nums :+ 4          // append: List(1, 2, 3, 4)

// Vectors (immutable, indexed access)
val vec = Vector(1, 2, 3)
vec(0)                         // 1

// Sets (immutable, no duplicates)
val unique = Set(1, 2, 2, 3)   // Set(1, 2, 3)
unique.contains(2)             // true
unique + 4                     // Set(1, 2, 3, 4)

// Maps (immutable key-value)
val map = Map("a" -> 1, "b" -> 2)
map("a")                       // 1
map.get("c")                   // None
map + ("c" -> 3)               // new map with added key
```
::

### Mutable alternatives

::code-wrapper{language="scala"}
```scala
import scala.collection.mutable

val arr = scala.collection.mutable.ArrayBuffer(1, 2, 3)
arr += 4                       // ArrayBuffer(1, 2, 3, 4)
arr(0) = 10

val mutMap = scala.collection.mutable.Map("a" -> 1)
mutMap("a") = 2
```
::

## Option (Null Safety)

Scala replaces nullable types with `Option[T]` (like Rust's `Option` or Haskell's `Maybe`).

::code-wrapper{language="scala"}
```scala
val maybe: Option[String] = Some("hello")
val nothing: Option[String] = None

// Access safely
maybe.getOrElse("default")     // "hello"
nothing.getOrElse("default")   // "default"

// Pattern matching
maybe match {
  case Some(value) => println(s"Got: $value")
  case None => println("Nothing")
}

// Map/filter on Option
maybe.map(_.toUpperCase())     // Some("HELLO")
nothing.map(_.toUpperCase())   // None

// Chaining
val result = for {
  x <- Some(1)
  y <- Some(2)
} yield x + y                  // Some(3)
```
::

## Edge case: `null` still exists in Scala

::code-wrapper{language="scala"}
```scala
val x: String = null           // compiles, but dangerous!

// Avoid null; use Option instead
val x: Option[String] = None   // safer
```
::

## Type Hierarchy

All Scala types inherit from `Any`:

```
Any
├── AnyVal (value types)
│   ├── Byte, Short, Int, Long
│   ├── Float, Double
│   ├── Boolean, Char
│   └── Unit
└── AnyRef (reference types)
    ├── String, List, Map
    └── Custom classes
```

`Unit` is Scala's equivalent to `void` (represents "no value").

::code-wrapper{language="scala"}
```scala
def printOnly(x: Int): Unit = {
  println(x)
  // no return needed; Unit is the implicit return
}

def add(a: Int, b: Int): Int = a + b  // Int is explicit return type
```
::

## 💡 Tips & Tricks

**`require` for preconditions**: Use `require(condition, "message")` instead of manual `if` checks. It throws `IllegalArgumentException` on failure and reads like a contract.

```scala
def divide(a: Int, b: Int): Int = {
  require(b != 0, "divisor must not be zero")
  a / b
}
```

**`ensuring` for postconditions**: Attach `.ensuring(condition)` to an expression for defensive checks.

```scala
val result = (a + b).ensuring(_ >= 0)
```

**Pattern matching is powerful**: Use it instead of `instanceof` + casts. It's type-safe and exhaustiveness-checked.

```scala
val x: Any = 42
x match {
  case i: Int => println(s"int: $i")
  case s: String => println(s"string: $s")
  case _ => println("other")
}
```

**Immutable defaults**: Always start with `val` and immutable collections. Switching to `var` or mutable collections is a local optimization, not the default design.

## ⚠️ Edge Cases & Gotchas

**`.toInt` on non-numeric String throws**: `"abc".toInt` crashes. Use `.toIntOption` to get `Option[Int]` instead.

```scala
"abc".toInt              // throws NumberFormatException
"abc".toIntOption        // None
"42".toIntOption         // Some(42)
```

**Tuple access is 1-indexed**: `(1, 2)._1` is the first element (not `._0`). Confusing for developers from 0-indexed languages.

```scala
val t = (10, 20, 30)
t._1                     // 10 (not t._0)
t._2                     // 20
```

**Empty List/Set/Map are still truthy**: `if (List().nonEmpty)` is false, but `if (List())` is true. Always check `.nonEmpty` or `.isEmpty`, not truthiness.

```scala
val empty = List()
if (empty.isEmpty) { }   // correct
if (!empty.isEmpty) { }  // also correct
if (empty) { }           // compile error — Scala doesn't allow this
```

**`var` is rare, but mutable binding != mutable object**: A `var String` can be reassigned, but `String` itself is immutable. A `val ArrayBuffer` is an immutable binding to a mutable collection.

```scala
val arr = ArrayBuffer(1, 2, 3)
arr += 4                 // OK — mutating the ArrayBuffer
arr = ArrayBuffer()      // ERROR — can't reassign val

var list = List(1, 2, 3)
list = list :+ 4        // OK — reassigning to new List
```

**Default arguments evaluate once, not per call**: Avoid mutable defaults; they're shared across calls (same as Python).

```scala
def bad(items: List[Int] = scala.collection.mutable.ArrayBuffer()) { }  // WRONG
def good(items: List[Int] = List()) { }  // RIGHT — immutable
```

**Type parameters can't be primitive at runtime**: `List[Int]` becomes `List[Object]` at runtime (type erasure). This matters for reflection and some pattern matching.

```scala
List[Int](1, 2).isInstanceOf[List[String]]  // can't distinguish — both are List
```

## 🧠 Spot the Bug

What does this do?

```scala
val x = 5
val y = 10
val z = if (x > y) "x wins" else "y wins"
val result = z match {
  case "x wins" => x
  case _ => y
}
println(result)
```

<details>
<summary>Answer</summary>

Prints `10`.

Here's why:
- `x > y` is `false`, so `z = "y wins"`
- Pattern matching: `"y wins"` doesn't match `"x wins"`, so the `_` (wildcard) matches and returns `y` (which is `10`)

**The lesson**: Pattern matching is exhaustive — the compiler checks all branches. If you miss a case, it errors. The wildcard `_` is useful for "anything else."

</details>

## Key Takeaways

- Prefer `val` (immutable binding) and immutable collections.
- Use `var` only when you must reassign the binding (rare).
- `lazy val` delays expensive computation until first access.
- Scala uses 0-indexed arrays and strings, but 1-indexed tuples (confusing!).
- `Option[T]` replaces null; use `Some`/`None` patterns.
- Type inference is powerful; annotations clarify intent.
- Pattern matching is type-safe and exhaustiveness-checked — prefer over `instanceof`.
- Integer division `10 / 4` is `2`, not `2.5`; use `10.0 / 4` for float division.
- Floating-point arithmetic has precision issues (same as all languages).
