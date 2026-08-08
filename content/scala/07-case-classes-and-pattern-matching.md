# 07 — Case Classes & Pattern Matching

## Case Classes

Case classes are optimized for data modeling with auto-generated boilerplate:

::code-wrapper{language="scala"}
```scala
case class Point(x: Int, y: Int)
case class Circle(center: Point, radius: Double)

val p = Point(1, 2)
val c = Circle(p, 5.0)

// Auto-generated toString
println(p)                  // Point(1,2)

// Auto-generated equals (value equality)
println(Point(1, 2) == Point(1, 2))  // true

// Auto-generated hashCode (can be used in collections)
Set(Point(1, 2), Point(1, 2)).size  // 1

// Auto-generated copy method
val p2 = p.copy(x = 10)     // Point(10, 2)

// Getters for parameters
println(p.x)                // 1
println(p.y)                // 2
```
::

## Sealed Case Classes

Seal traits to restrict subclasses (enables exhaustiveness checking):

::code-wrapper{language="scala"}
```scala
sealed trait Result
case class Success(value: String) extends Result
case class Failure(error: String) extends Result
case object Pending extends Result

// Pattern matching is exhaustiveness-checked
def handle(r: Result): String = r match {
  case Success(v) => s"Success: $v"
  case Failure(e) => s"Error: $e"
  case Pending => "Still processing"
  // Compiler warns if missing case!
}
```
::

## Basic Pattern Matching

Match expressions provide type-safe deconstruction:

::code-wrapper{language="scala"}
```scala
val point = Point(3, 4)

// Destructure case class
point match {
  case Point(0, 0) => "origin"
  case Point(x, 0) => s"on x-axis at $x"
  case Point(0, y) => s"on y-axis at $y"
  case Point(x, y) => s"at ($x, $y)"
}

// With guards
point match {
  case Point(x, y) if x == y => "diagonal"
  case Point(x, y) if x > y => "right of diagonal"
  case Point(x, y) => "left of diagonal"
}

// Ignore values
point match {
  case Point(_, y) => s"y=$y"
  case _ => "no match"
}
```
::

## Matching on Collections

::code-wrapper{language="scala"}
```scala
val list = List(1, 2, 3)

list match {
  case Nil => "empty list"
  case List(x) => s"single element: $x"
  case List(x, y) => s"two elements: $x, $y"
  case x :: tail => s"head=$x, tail=$tail"
  case _ => "many elements"
}

// Head and tail
list match {
  case head :: tail => println(head, tail)  // 1, List(2, 3)
}

// Nested patterns
List(1, List(2, 3), 4) match {
  case List(a, List(b, c), d) => println(a, b, c, d)  // 1, 2, 3, 4
}
```
::

## Matching on Tuples

::code-wrapper{language="scala"}
```scala
val pair = (1, "hello")

pair match {
  case (1, s) => s"matched with $s"
  case (n, s) => s"n=$n, s=$s"
}

// Multiple values
(1, 2, 3) match {
  case (x, y, z) => x + y + z  // 6
}
```
::

## Matching on Types

::code-wrapper{language="scala"}
```scala
val value: Any = "hello"

value match {
  case s: String => s"string: $s"
  case i: Int => s"int: $i"
  case l: List[_] => s"list of size ${l.length}"
  case _ => "unknown"
}

// Type erasure caveat
val list1: List[Int] = List(1, 2, 3)
val list2: List[String] = List("a", "b", "c")

list1 match {
  case _: List[Int] => "looks like List[Int]"  // actually just List
  case _: List[String] => "looks like List[String]"  // also matches!
}
```
::

## Matching on Options

::code-wrapper{language="scala"}
```scala
val opt: Option[String] = Some("value")

opt match {
  case Some(value) => println(s"Got: $value")
  case None => println("Nothing")
}

// Pattern in for comprehension
for (value <- opt) {
  println(s"Value: $value")
}

// getOrElse alternative
opt match {
  case Some(v) => v
  case None => "default"
}
```
::

## Matching on Either

::code-wrapper{language="scala"}
```scala
val result: Either[String, Int] = Right(42)

result match {
  case Right(value) => s"success: $value"
  case Left(error) => s"error: $error"
}

// Pattern in for
for (value <- result) {
  println(s"Value: $value")
}
```
::

## Complex Pattern Matching

### Nested patterns

::code-wrapper{language="scala"}
```scala
case class Address(street: String, city: String)
case class Person(name: String, address: Address)

val person = Person("Alice", Address("123 Main", "NYC"))

person match {
  case Person(n, Address(s, c)) => s"$n lives on $s in $c"
  case _ => "no match"
}
```
::

### Pattern guards

::code-wrapper{language="scala"}
```scala
List(1, 2, 3, 4, 5) match {
  case List(a, b, c, d, e) if a + e == b + d => "pattern found"
  case _ => "no pattern"
}
```
::

### Alternative patterns

::code-wrapper{language="scala"}
```scala
val value = 5

value match {
  case 1 | 2 | 3 => "small"
  case 4 | 5 | 6 => "medium"
  case _ => "large"
}
```
::

## Pattern Matching in Functions

::code-wrapper{language="scala"}
```scala
// Function parameters can use patterns
def greet(person: Person): String = person match {
  case Person(name, _) => s"Hello, $name"
}

// Shorthand for single-case match
def greet(person: Person): String = {
  case Person(name, _) => s"Hello, $name"
}

// In higher-order functions
List(Point(0, 0), Point(1, 1), Point(2, 2)).map {
  case Point(0, 0) => "origin"
  case Point(x, y) if x == y => "diagonal"
  case Point(x, y) => s"($x, $y)"
}
```
::

## Pattern Matching in Assignment

Destructure on the left side:

::code-wrapper{language="scala"}
```scala
val (a, b) = (1, 2)           // a=1, b=2

val (x, y, z) = (1, 2, 3)

val Point(px, py) = Point(5, 10)  // px=5, py=10

val List(head, second, _*) = List(1, 2, 3, 4, 5)  // head=1, second=2
```
::

## 💡 Tips & Tricks

**Use sealed traits for domain modeling**: Restrict possible subtypes; compiler enforces exhaustiveness.

**Case classes over manual classes for data**: Auto-generated methods save boilerplate and prevent bugs.

**Pattern matching over casting**: Type-safe, cleaner than `instanceof` + casts.

**Use `_*` to match remaining elements**: Cleaner than `:: tail` patterns.

::code-wrapper{language="scala"}
```scala
val List(first, second, rest@_*) = List(1, 2, 3, 4)  // rest=List(3, 4)
```
::

**Extractors for custom matching**: Define `unapply()` for custom pattern matching.

::code-wrapper{language="scala"}
```scala
object Even {
  def unapply(n: Int): Option[Int] = if (n % 2 == 0) Some(n/2) else None
}

42 match {
  case Even(half) => s"Half of 42 is $half"  // matches
}
```
::

## ⚠️ Edge Cases & Gotchas

**Pattern matching requires exhaustiveness**: Missing cases cause compile warnings (or errors with `-Werror`).

**Type erasure in generics**: `List[Int]` and `List[String]` can't be distinguished at runtime. Matching on `_: List[_]` matches both.

**Underscore `_` in patterns**: Each `_` is a fresh variable. Using same name in multiple patterns doesn't bind to same variable.

::code-wrapper{language="scala"}
```scala
(1, 2) match {
  case (_, _) => // OK
  case (x, x) => // ERROR: duplicate name
}
```
::

**Case class copy is shallow**: If fields are mutable collections, modifications affect the original.

**Pattern matching doesn't short-circuit guards**: All guards in a match expression are evaluated (mostly).

## 🧠 Spot the Bug

What does this print?

::code-wrapper{language="scala"}
```scala
sealed trait Status
case class Active(name: String) extends Status
case class Inactive(reason: String) extends Status

val s: Status = Active("user1")

val message = s match {
  case Active(n) => s"User: $n"
  case Inactive(_) => "Inactive"
  case _ => "Unknown"
}

println(message)
```
::

<details>
<summary>Answer</summary>

Prints `User: user1`.

Here's why:
- `s` is `Active("user1")`
- Pattern `Active(n)` matches, binding `n = "user1"`
- Returns `s"User: $n"` which is `"User: user1"`

The `case _ => "Unknown"` is unreachable (sealed trait guarantees all cases covered).

**The lesson**: Sealed traits enable exhaustiveness checking. Compiler might warn about unreachable cases.

</details>

## Key Takeaways

- Case classes auto-generate `toString`, `equals`, `hashCode`, `copy`.
- Sealed traits restrict subclasses and enable exhaustiveness checking.
- Pattern matching is type-safe deconstruction.
- Destructure case classes: `case Point(x, y) => ...`.
- Match on collections: `case head :: tail => ...`.
- Pattern guards: `case x if x > 0 => ...`.
- Extract in assignments: `val (a, b) = (1, 2)`.
- Type erasure: generics don't distinguish at runtime.
- Custom patterns with extractors (`.unapply()`).
