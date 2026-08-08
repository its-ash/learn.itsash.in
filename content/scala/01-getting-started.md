# 01 — Getting Started

## What is Scala?

Scala is a **statically-typed, compiled language that runs on the JVM**. It combines:
- **Object-oriented programming** (classes, inheritance, polymorphism)
- **Functional programming** (first-class functions, immutability, pattern matching)
- **Type inference** (you rarely write types explicitly)
- **Interoperability** with Java (use any Java library)

Scala is used in:
- Data engineering (Apache Spark, Apache Kafka)
- Backend services (Twitter, LinkedIn, Databricks)
- Distributed systems (Akka, ZIO)
- Compilers and build tools (scalac, sbt)

## Installation

Install **Java 11+** first:

::code-wrapper{language="bash"}
```bash
# Check Java
java -version
```
::

Then install **Scala**:

::code-wrapper{language="bash"}
```bash
# macOS
brew install scala

# Ubuntu/Debian
sudo apt-get install scala

# Windows
# Download from https://www.scala-lang.org/download/
```
::

Verify:
::code-wrapper{language="bash"}
```bash
scala -version    # Scala 3.x.x
```
::

## Your First Program

Create `hello.scala`:

::code-wrapper{language="scala"}
```scala
object Main {
  def main(args: Array[String]): Unit = {
    println("Hello, World!")
  }
}
```
::

Compile and run:

::code-wrapper{language="bash"}
```bash
scalac hello.scala
scala MainKt
```
::

Or use **scala-cli** (simpler):

::code-wrapper{language="bash"}
```bash
# Install scala-cli
brew install scala-cli

# Create and run
scala-cli hello.scala
```
::

With `scala-cli`, you can use a simpler syntax:

::code-wrapper{language="scala"}
```scala
// hello.scala (no object/main needed with scala-cli)
println("Hello, World!")
```
::

## The Scala REPL (Interactive Prompt)

Start the interactive prompt:

::code-wrapper{language="bash"}
```bash
scala
scala> val x = 5
val x: Int = 5

scala> val greeting = s"Hello, $x people"
val greeting: String = "Hello, 5 people"

scala> :quit
```
::

Useful REPL commands:
- `:quit` or `:exit` — exit
- `:load file.scala` — load a file
- `:paste` — multi-line input
- `:help` — show all commands

## Project Structure (sbt)

Scala projects use **sbt** (Scala Build Tool). Create a minimal project:

::code-wrapper{language="bash"}
```bash
# Install sbt
brew install sbt

# Create project structure
mkdir myproject
cd myproject
mkdir -p src/main/scala
```
::

Create `build.sbt`:

::code-wrapper{language="scala"}
scalaVersion := "3.3.0"
name := "myapp"
version := "0.1.0"
```
::

Create `src/main/scala/Main.scala`:

::code-wrapper{language="scala"}
@main def hello() =
  println("Hello from sbt!")
```
::

Run with:

::code-wrapper{language="bash"}
```bash
sbt run
```
::

## Comments

::code-wrapper{language="scala"}
```scala
// Single-line comment

/* Multi-line comment
   can span lines */

/* Nested comments are allowed
   /* like this */
*/
```
::

## Basic Syntax

::code-wrapper{language="scala"}
```scala
// Variable declarations
val name = "Alice"                    // immutable (preferred)
var count = 0                         // mutable
count = 1

// Types (usually inferred, but explicit here)
val age: Int = 30
val pi: Double = 3.14159
val active: Boolean = true

// String interpolation
val greeting = s"Hello, $name"        // "Hello, Alice"
val msg = s"Age: ${age + 1}"         // "Age: 31"

// Expressions (if returns a value)
val max = if (age > 18) "adult" else "minor"

// Functions
def add(a: Int, b: Int): Int = a + b
val result = add(5, 3)                // 8

// Lambda (anonymous function)
val double = (x: Int) => x * 2
double(5)                              // 10

// Collections
val numbers = List(1, 2, 3)
val person = Map("name" -> "Alice", "age" -> 30)
val unique = Set(1, 2, 2, 3)          // Set(1, 2, 3)
```
::

## From Java to Scala

If you know Java, here are key differences:

| Java | Scala |
|---|---|
| `public static void main(String[] args) {}` | `@main def hello() = println(...)` |
| `int x = 5;` | `val x = 5` or `val x: Int = 5` |
| `new ArrayList<>()` | `scala.collection.mutable.ArrayBuffer()` |
| `new HashMap<>()` | `scala.collection.mutable.Map()` |
| `if (...) { } else { }` | `if (...) ... else ...` (expression) |
| `for (int i = 0; i < n; i++)` | `for (i <- 0 until n)` |
| `Optional<T>` | `Option[T]` |
| Null checks | Pattern matching with `Option` |
| Getters/setters | Properties (properties are generated) |

## Package and Import

Organize code with packages:

::code-wrapper{language="scala"}
```scala
// src/main/scala/com/example/Utils.scala
package com.example

object Utils {
  def greet(name: String) = s"Hello, $name"
}

// src/main/scala/com/example/Main.scala
package com.example

object Main {
  def main(args: Array[String]): Unit = {
    println(Utils.greet("Alice"))
  }
}
```
::

Import with:

::code-wrapper{language="scala"}
```scala
import com.example.Utils
import scala.math._                    // import all from scala.math
import scala.collection.mutable.{Map, Set}  // selective import
```
::

## Standard Library Highlights

::code-wrapper{language="scala"}
```scala
// Collections
List(1, 2, 3).map(_ * 2)              // List(2, 4, 6)
(1 to 10).filter(_ % 2 == 0)          // Range of even numbers
Set(1, 2, 3).contains(2)              // true
Map("a" -> 1).get("a")                // Some(1)

// String operations
"hello".toUpperCase()                 // "HELLO"
"hello world".split(" ")              // Array("hello", "world")
"hello".length                        // 5

// Math
scala.math.abs(-5)                    // 5
scala.math.sqrt(16)                   // 4.0
scala.math.max(1, 5)                  // 5

// Option (null safety)
Option(value).getOrElse(default)
Some(5).map(_ * 2)                    // Some(10)
None.getOrElse(0)                     // 0
```
::

## Common Patterns

### Pattern Matching

::code-wrapper{language="scala"}
```scala
val x = 5
val result = x match {
  case 1 => "one"
  case 2 => "two"
  case n if n > 10 => "big"
  case _ => "other"
}
```
::

### For Loops (Comprehensions)

::code-wrapper{language="scala"}
```scala
for (i <- 1 to 5) println(i)          // 1 to 5
for (i <- 1 until 5) println(i)       // 1 to 4
for (x <- List(1, 2, 3)) println(x)   // iterate list

// With conditions
for (i <- 1 to 10 if i % 2 == 0)
  println(i)

// Nested
for {
  x <- 1 to 3
  y <- 1 to 3
} println(s"$x,$y")
```
::

### Functional Operations

::code-wrapper{language="scala"}
```scala
val nums = List(1, 2, 3, 4, 5)

nums.map(_ * 2)                       // List(2, 4, 6, 8, 10)
nums.filter(_ > 2)                    // List(3, 4, 5)
nums.fold(0)(_ + _)                   // 15 (sum)
nums.find(_ > 3)                      // Some(4)
nums.exists(_ > 4)                    // true
nums.forall(_ > 0)                    // true
```
::

## 💡 Tips & Tricks

**Use type aliases for readability**: `type Config = Map[String, String]` makes code clearer.

**Prefer pattern matching over `instanceof`**: Scala's pattern matching is exhaustiveness-checked by the compiler. It's safer than Java's casting.

**Use `case class` for data**: Quick way to define data containers with equality, hashing, and pattern matching built-in.

::code-wrapper{language="scala"}
```scala
case class Person(name: String, age: Int)
val alice = Person("Alice", 30)
alice.name           // "Alice"
```
::

**Leverage type inference**: Scala infers types from context. Annotations are mainly for clarity or API boundaries.

**Immutable collections by default**: Use `List`, `Map`, `Set` (immutable). Mutable versions are in `scala.collection.mutable`.

## ⚠️ Edge Cases & Gotchas

**`.toInt` on non-numeric String throws**: Use `.toIntOption` for safe conversion.

::code-wrapper{language="scala"}
```scala
"abc".toInt                           // NumberFormatException
"abc".toIntOption                     // None
"42".toIntOption                      // Some(42)
```
::

**Tuple indices are 1-based (like Lua, unlike arrays)**: `(1, 2, 3)._1` is the first element, not `._0`. This confuses everyone.

::code-wrapper{language="scala"}
```scala
val t = ("a", "b", "c")
t._1                                  // "a" (not ._0)
t._2                                  // "b"
```
::

**`==` calls `equals()`, not reference equality**: If you need reference equality, use `eq`:

::code-wrapper{language="scala"}
```scala
val a = new String("hello")
val b = new String("hello")
a == b                                // true (value equality)
a eq b                                // false (reference equality)
```
::

**Default arguments are evaluated once**: Avoid mutable defaults.

::code-wrapper{language="scala"}
```scala
def bad(items: scala.collection.mutable.ArrayBuffer[Int] = scala.collection.mutable.ArrayBuffer()) { }
```
::

**Variance gotcha**: `List[Dog]` is not a subtype of `List[Animal]`, even if `Dog <: Animal`. Use `List[Animal]` if you need flexibility (covariance).

## 🧠 Spot the Bug

What does this print?

::code-wrapper{language="scala"}
```scala
val nums = List(1, 2, 3)
val result = nums.map { x =>
  if (x > 1) x * 2
  else x
}
println(result)
```
::

<details>
<summary>Answer</summary>

Prints `List(1, 4, 6)`.

Here's why:
- `1 > 1` is false, so `if` returns `1`
- `2 > 1` is true, so `2 * 2 = 4`
- `3 > 1` is true, so `3 * 2 = 6`

**The lesson**: `if` is an expression in Scala (not a statement). It always returns a value, even if you don't explicitly return.

</details>

## Next Steps

1. Learn **variables and data types** (02)
2. Learn **functions** (03)
3. Learn **collections** (04)
4. Learn **pattern matching** (05)
5. Explore **OOP** (classes, inheritance, traits)
6. Explore **FP** (higher-order functions, monads, for-comprehensions)
7. Try **Scala CLI** for quick scripting
8. Join the Scala community (forums, Discord)
