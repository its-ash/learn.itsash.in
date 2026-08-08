# 04 — Control Flow

## If-Then-Else (Expression)

Unlike Lua or Java, `if-else` is an **expression** in Scala (returns a value).

::code-wrapper{language="scala"}
```scala
if (x > 10) "big" else "small"        // returns String

val size = if (x > 10) "big" else "small"

val message = if (x > 10) {
  "really big"
} else if (x > 5) {
  "medium"
} else {
  "small"
}
```
::

All branches must return the same type (or a common supertype):

::code-wrapper{language="scala"}
```scala
val result = if (x > 0) 10 else "negative"   // Any (common supertype)
val result = if (x > 0) 10 else 20           // Int

// If missing else, type is Any or Unit
if (x > 0) println("positive")               // Unit
```
::

## Pattern Matching

Scala's switch (more powerful):

::code-wrapper{language="scala"}
```scala
val status: Int = 404
val message = status match {
  case 200 => "OK"
  case 404 => "Not Found"
  case 500 => "Server Error"
  case _ => "Unknown"
}

// With conditions (guards)
val grade = score match {
  case s if s >= 90 => "A"
  case s if s >= 80 => "B"
  case s if s >= 70 => "C"
  case _ => "F"
}
```
::

### Exhaustiveness checking

Scala warns if you miss cases:

::code-wrapper{language="scala"}
```scala
sealed trait Color
case object Red extends Color
case object Blue extends Color

val c = Red
c match {
  case Red => "red"
  case Blue => "blue"
  // No warning (all cases covered)
}

c match {
  case Red => "red"
  // Warning: not exhaustive (missing Blue)
}
```
::

### Pattern matching on types

::code-wrapper{language="scala"}
```scala
val x: Any = 42
x match {
  case i: Int => s"Integer: $i"
  case s: String => s"String: $s"
  case _ => "Unknown"
}
```
::

### Pattern matching on collections

::code-wrapper{language="scala"}
```scala
val list = List(1, 2, 3)
list match {
  case Nil => "empty"
  case List(x) => s"single: $x"
  case List(x, y) => s"two: $x and $y"
  case x :: tail => s"head: $x, rest: $tail"
  case _ => "other"
}

val opt = Some(42)
opt match {
  case Some(value) => s"Got: $value"
  case None => "Nothing"
}
```
::

## Loops

### While

::code-wrapper{language="scala"}
```scala
var i = 0
while (i < 5) {
  println(i)
  i += 1
}
```
::

### Do-While

::code-wrapper{language="scala"}
```scala
var i = 0
do {
  println(i)
  i += 1
} while (i < 5)
```
::

### For Loops (Ranges)

::code-wrapper{language="scala"}
```scala
for (i <- 1 to 5) println(i)           // 1 to 5 (inclusive)
for (i <- 1 until 5) println(i)        // 1 to 4 (exclusive)
for (i <- 1 to 10 by 2) println(i)     // 1, 3, 5, 7, 9 (step)
for (i <- (5 to 1 by -1)) println(i)   // 5, 4, 3, 2, 1 (reverse)
```
::

### For Loops (Collections)

::code-wrapper{language="scala"}
```scala
val nums = List(1, 2, 3)
for (x <- nums) println(x)

for (x <- nums if x > 1) println(x)    // with guard

// Nested loops
for {
  i <- 1 to 3
  j <- 1 to 3
} println(s"$i, $j")
```
::

### For Comprehensions (with yield)

Returns a collection:

::code-wrapper{language="scala"}
```scala
val doubled = for (x <- 1 to 5) yield x * 2
// Vector(2, 4, 6, 8, 10)

val evens = for (x <- 1 to 10 if x % 2 == 0) yield x
// Vector(2, 4, 6, 8, 10)

// Nested
val pairs = for {
  i <- 1 to 3
  j <- 1 to 3
} yield (i, j)
// Vector((1,1), (1,2), ..., (3,3))
```
::

### Break and Continue

Scala has no `break` or `continue`. Use:
- Functional methods (`filter`, `takeWhile`, etc.)
- Tail recursion
- Exceptions (rare)

::code-wrapper{language="scala"}
```scala
// Instead of break:
for (x <- 1 to 10 if x > 5) println(x)   // skip with if

// Instead of continue:
val filtered = (1 to 10).filter(_ % 2 == 0)
filtered.foreach(println)

// Tail recursive instead of loop:
@tailrec
def loop(i: Int): Unit = {
  if (i >= 5) return
  println(i)
  loop(i + 1)
}
```
::

## Exception Handling

Try-catch-finally:

::code-wrapper{language="scala"}
```scala
try {
  val x = 10 / 0
} catch {
  case e: ArithmeticException => println("Can't divide by zero")
  case e: Exception => println(s"Error: ${e.getMessage}")
} finally {
  println("Cleanup")
}
```
::

Try is also an expression:

::code-wrapper{language="scala"}
```scala
val result = try {
  10 / 2
} catch {
  case _: ArithmeticException => 0
}
println(result)   // 5
```
::

## Option (Null Safety)

Pattern matching with `Option`:

::code-wrapper{language="scala"}
```scala
val maybeInt: Option[Int] = Some(42)

maybeInt match {
  case Some(value) => println(s"Got: $value")
  case None => println("Nothing")
}

// Safer than if-else
val value = maybeInt match {
  case Some(v) => v * 2
  case None => 0
}
```
::

### Option combinators

::code-wrapper{language="scala"}
```scala
Some(42).getOrElse(0)         // 42
None.getOrElse(0)             // 0

Some(42).map(_ * 2)           // Some(84)
None.map(_ * 2)               // None

Some(42).filter(_ > 50)       // None
Some(42).filter(_ > 20)       // Some(42)

Some(42).flatMap(x => Some(x * 2))  // Some(84)
```
::

## Match Expressions on Options

::code-wrapper{language="scala"}
```scala
def processUser(id: Int): Option[String] = {
  // fetch user from DB, return Some(name) or None
  if (id > 0) Some(s"User$id") else None
}

processUser(1) match {
  case Some(name) => println(s"Hello, $name")
  case None => println("User not found")
}

// Chaining options
for {
  user <- processUser(1)
  length = user.length
} println(s"$user has $length characters")
```
::

## Either (Error Handling)

Better than Option for errors (holds error or value):

::code-wrapper{language="scala"}
```scala
def divide(a: Int, b: Int): Either[String, Int] = {
  if (b == 0) Left("Cannot divide by zero")
  else Right(a / b)
}

divide(10, 2) match {
  case Right(result) => println(s"Result: $result")
  case Left(error) => println(s"Error: $error")
}

// Combinators
divide(10, 2).map(_ * 2)              // Right(10)
divide(10, 0).map(_ * 2)              // Left("Cannot divide by zero")

divide(10, 2).fold(
  err => println(s"Failed: $err"),
  result => println(s"Got: $result")
)
```
::

## Assertions

::code-wrapper{language="scala"}
```scala
assert(x > 0, "x must be positive")
assert(x > 0)                         // default message

require(x > 0, "precondition failed")  // for input validation
assume(x > 0, "assumption")            // for internal invariants
```
::

Assertions can be disabled at runtime (`-disableassertions`); use `require()` for essential checks.

## 💡 Tips & Tricks

**Use pattern matching over instanceof**: Scala's pattern matching is type-safe, exhaustiveness-checked, and cleaner than Java's casting.

**For comprehensions for sequential operations**: Especially with `Option`/`Either`, they're cleaner than manual `.flatMap()`.

::code-wrapper{language="scala"}
```scala
for {
  x <- Some(1)
  y <- Some(2)
  z <- Some(3)
} yield x + y + z          // Some(6)

// vs
Some(1).flatMap(x => Some(2).flatMap(y => Some(3).map(z => x + y + z)))
```
::

**Use `takeWhile` / `dropWhile` instead of break**: These functional alternatives are cleaner and composable.

::code-wrapper{language="scala"}
```scala
(1 to 100).takeWhile(_ < 50)    // stops at first false
(1 to 100).dropWhile(_ < 50)    // skips while condition is true
```
::

**Match with guards for complex conditions**: More readable than nested ifs.

::code-wrapper{language="scala"}
```scala
x match {
  case n if n < 0 => "negative"
  case n if n == 0 => "zero"
  case n if n > 0 => "positive"
}
```
::

## ⚠️ Edge Cases & Gotchas

**Pattern matching must be exhaustive**: Missing a case causes a compile warning (or error with `-Werror`). Always use `case _ =>` for unknown cases.

**Option/Either require pattern matching or combinators**: You can't just call `.value`; use `.getOrElse()` or pattern match.

::code-wrapper{language="scala"}
```scala
val x: Option[Int] = Some(5)
x.value                           // compile error
x.getOrElse(0)                    // 5
```
::

**Try is not the same as Option**: `Try[T]` holds a value or a `Throwable`. Similar API but different semantics.

::code-wrapper{language="scala"}
```scala
import scala.util.Try
Try(10 / 0)                       // Failure(ArithmeticException)
Try(10 / 2)                       // Success(5)
```
::

**`for` loops don't return values; use `for (... yield ...)` for that**:

::code-wrapper{language="scala"}
```scala
for (x <- 1 to 5) println(x)      // Unit (side effect)
val result = for (x <- 1 to 5) yield x * 2  // Vector(2, 4, 6, 8, 10)
```
::

**Variable scoping in for loops**: Loop variables are local to the loop.

::code-wrapper{language="scala"}
```scala
for (i <- 1 to 5) println(i)
println(i)                        // compile error (i out of scope)
```
::

**Guard conditions in pattern matching can have side effects**: Use with caution.

::code-wrapper{language="scala"}
```scala
x match {
  case n if { println(s"Checking $n"); n > 0 } => "positive"
  case _ => "other"
}
```
::

## 🧠 Spot the Bug

What does this print?

::code-wrapper{language="scala"}
```scala
val x = 5
val result = if (x > 10) "big" else if (x > 0) "positive" else "non-positive"
val result2 = x match {
  case n if n > 10 => "big"
  case n if n > 0 => "positive"
  case _ => "non-positive"
}
println(result)
println(result2)
```
::

<details>
<summary>Answer</summary>

Prints:
::code-wrapper{language="text"}
```text
positive
positive
```
::

Here's why:
- `x = 5`, so `x > 10` is false
- `x > 0` is true, so `result = "positive"`
- Pattern matching: same logic, `result2 = "positive"`

**The lesson**: Both `if-else` and pattern matching are expressions that evaluate conditions in order.

</details>

## Key Takeaways

- `if-else` is an expression (returns a value), not a statement.
- Pattern matching (`match`) is exhaustiveness-checked and type-safe.
- For loops work with ranges (`1 to 5`), collections (`List`), and conditions.
- For comprehensions (`for ... yield`) return collections.
- Scala has no `break` or `continue`; use functional methods instead.
- `Option[T]` replaces null; use pattern matching or combinators.
- `Either[E, V]` for error handling (holds error or value).
- Try-catch-finally for exceptions, but `Option`/`Either` are preferred.
- Assertions: `assert()` for debugging, `require()` for input validation.
