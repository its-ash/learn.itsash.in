---
title: Scala — Java Interoperability: Collection Conversion, Null Safety & Bytecode Boundaries
description: Production patterns for Scala↔Java interop — scala.jdk.CollectionConverters, Option↔Optional, checked exception handling, SAM conversion, @targetName for clean bytecode, and avoiding the common interop traps.
---

# 11 — Java Interoperability: Collection Conversion, Null Safety & Bytecode Boundaries

## Collection Conversion — Views vs Copies

::code-wrapper{language="scala"}
```scala
import scala.jdk.CollectionConverters.*

// asScala / asJava create VIEWS, not copies — mutations propagate both directions!
val javaList = new java.util.ArrayList[Int]()
javaList.add(1); javaList.add(2)

val scalaView = javaList.asScala             // mutable.Buffer[Int] — a VIEW over javaList
scalaView(0) = 99                            // MUTATES the original javaList!
println(javaList.get(0))                     // → 99 — the Java list is modified

javaList.add(3)
println(scalaView.toList)                    // → List(99, 2, 3) — view sees Java's additions

// ❌ ANTI-PATTERN: assuming asScala gives an immutable snapshot
def process(items: java.util.List[Int]): List[Int] =
  items.asScala.map(_ * 2).toList            // if items is mutated during map, results are wrong
  // The view reflects live mutations — race condition if another thread modifies items

// ✅ CORRECT: materialize to immutable copy if you need isolation
def processSafe(items: java.util.List[Int]): List[Int] =
  val snapshot = items.asScala.toVector      // copy — now independent of original
  snapshot.map(_ * 2)                        // safe even if items is mutated concurrently

// Direction-specific conversion:
//   java.util.List    → asScala → scala.collection.mutable.Buffer  (view, mutable)
//   scala List/Vector → asJava  → java.util.List                   (view, immutable backing)
//   scala mutable.Map → asJava  → java.util.Map                    (view, mutable)
val sList = List(1, 2, 3)
val jView = sList.asJava                     // java.util.List — backed by the immutable List
// jView.add(4)  // UnsupportedOperationException — can't modify immutable backing!
```
::

## Null Handling — `Option` ↔ Java `Optional`

::code-wrapper{language="scala"}
```scala
import scala.jdk.OptionConverters.*

// Java methods return null — wrap with Option for null-safety
def findJavaUser(id: Long): String = userDao.findById(id)  // may return null

val safe: Option[String] = Option(findJavaUser(42))
//   null → None
//   "Alice" → Some("Alice")
// Option(null) == None — the constructor handles null automatically

// Java Optional → Scala Option
val javaOpt: java.util.Optional[String] = javaService.findName(42)
val scalaOpt: Option[String] = javaOpt.toScala  // Optional.empty → None, Optional.of → Some

// Scala Option → Java Optional
val sOpt: Option[String] = Some("hello")
val jOpt: java.util.Optional[String] = sOpt.toJava  // Some → Optional.of, None → Optional.empty

// ❌ ANTI-PATTERN: calling .get() on Java Optional (throws NoSuchElementException)
// ✅ CORRECT: convert to Scala Option and use functional combinators
javaService.findName(42).toScala
  .map(_.toUpperCase)
  .getOrElse("UNKNOWN")
```
::

## Checked Exceptions — Scala Doesn't Have Them

::code-wrapper{language="scala"}
```scala
import java.io.{IOException, FileReader}

// Java: methods must declare `throws IOException` — compiler-enforced.
// Scala: NO checked exceptions. You can throw any exception without declaring it.

// ❌ DANGEROUS: calling Java code that throws checked exceptions without handling
def readConfig(path: String): String =
  val reader = new FileReader(path)         // throws IOException — but Scala doesn't force handling
  reader.read().toString                    // if file missing → IOException at runtime, uncaught

// ✅ CORRECT: wrap in Try for compositional error handling
import scala.util.Try
def readConfigSafe(path: String): Try[String] = Try {
  val reader = new FileReader(path)
  try reader.read().toString finally reader.close()
}

readConfigSafe("missing.conf") match
  case Success(content) => parseConfig(content)
  case Failure(e: IOException) => println(s"File not found: ${e.getMessage}")
  case Failure(e) => println(s"Unexpected: $e")

// ✅ CORRECT: Using.resource for automatic cleanup (Scala 2.13+ / 3.x)
def readConfigUsing(path: String): Try[String] = Try {
  scala.util.Using.resource(new FileReader(path)) { reader =>
    reader.read().toString                  // reader.close() called automatically
  }
}
```
::

## SAM Conversion — Java Functional Interfaces from Scala

::code-wrapper{language="scala"}
```scala
import java.util.function.{Function => JFunction, Predicate => JPredicate, Consumer => JConsumer}
import java.util.{List => JList, Map => JMap}

// Java functional interfaces (Single Abstract Method) accept Scala lambdas directly
val javaFunction: JFunction[Int, String] = (i: Int) => s"num=$i"  // SAM conversion
val javaPredicate: JPredicate[String] = _.length > 3

// Using Java Streams from Scala
val javaList: JList[Int] = ???  // from Java API
val result = javaList.stream()
  .filter((_: Int) > 5)                     // Scala lambda → JPredicate (SAM)
  .map((i: Int) => i * 2)                   // Scala lambda → JFunction (SAM)
  .collect(java.util.stream.Collectors.toList())
// Result: java.util.List[Int]

// ❌ ANTI-PATTERN: converting to Scala, processing, converting back
//   javaList.asScala.filter(_ > 5).map(_ * 2).asJava
//   → 3 collection conversions. Just use the Java Stream API directly.

// ✅ CORRECT: use Java Streams for Java collections, Scala collections for Scala
// Mixing is fine — just avoid unnecessary conversions (each is a copy/view overhead)
```
::

## `@targetName` — Clean JVM-Level Names

::code-wrapper{language="scala"}
```scala
import scala.annotation.targetName

// Scala method names can conflict with Java conventions or create ugly bytecode.
// @targetName controls the JVM-level method name seen by Java and reflection.

class StringUtils:
  @targetName("toSnakeCase")
  extension (s: String) def `snake-case`: String =  // backtick names are legal in Scala
    s.replaceAll("([A-Z])", "_$1").toLowerCase

// From Java: StringUtils.snake_case$extension("HelloWorld") — hard to call
// With @targetName: StringUtils.toSnakeCase$extension("HelloWorld") — cleaner

// Critical for overloaded extension methods with same erasure:
extension (s: String)
  @targetName("repeatN") def *(n: Int): String = s * n     // String * Int
  @targetName("repeatChar") def *(c: Char): String = s * c  // String * Char
// Without @targetName, both erase to *(String, int) and *(String, char) — no clash
// But with generics, erasure can clash. @targetName disambiguates.
```
::

## Calling Scala from Java — The Rough Edges

::code-wrapper{language="scala"}
```scala
// Scala code (in com/example/Models.scala)
package com.example

object Calculator:
  def add(a: Int, b: Int): Int = a + b
  @targetName("multiply") def *(a: Int, b: Int): Int = a * b  // operator name

case class User(name: String, age: Int):
  def greet(): String = s"Hello, $name"
```

::code-wrapper{language="java"}
```java
// Java code calling the Scala above
import com.example.Calculator;
import com.example.User;
import com.example.Calculator$;  // the object's JVM class name

public class JavaCaller {
    public static void main(String[] args) {
        // Scala object → accessed via MODULE$ singleton
        int sum = Calculator$.MODULE$.add(2, 3);    // ugly but works
        // OR via the static forwarder (if no class with same name):
        int sum2 = Calculator.add(2, 3);             // static forwarder — cleaner

        // Scala case class → Java sees it as a regular class with apply/unapply
        User alice = new User("Alice", 30);          // constructor
        // User.apply("Alice", 30) also works via the companion's MODULE$
        String greeting = alice.greet();
        String name = alice.name();                  // Scala 3: name() not name — it's a getter method

        // Scala * operator → can't call as infix from Java
        // int product = Calculator.*(2, 3);          // illegal Java identifier
        // With @targetName: Calculator.multiply(2, 3)  — works!
    }
}
```
::

## Java-Friendly Scala API Design — Rules

::code-wrapper{language="scala"}
```scala
// Rules for Scala APIs consumed by Java:
// 1. Avoid default parameters — Java can't omit them (must pass full signature)
//    ✅ Provide overloaded methods instead
class JavaFriendlyRepo:
  def find(id: Long): Option[User] = find(id, defaultTimeout)  // calls the full version
  def find(id: Long, timeoutMs: Long): Option[User] = ???      // Java can call either

// 2. Avoid implicit parameters — Java has no equivalent
//    ✅ Create an overload that takes the parameter explicitly
def query[T](sql: String)(using parser: Parser[T]): Result[T] = ???
def queryWithParser[T](sql: String, parser: Parser[T]): Result[T] = query(sql)(using parser)

// 3. Return Java collections from Java-facing methods — don't force Scala collections on Java
def getUsersJava: java.util.List[User] =
  getUsers.toJava                                // convert for Java caller

// 4. Avoid Option in Java-facing APIs — Java doesn't understand it
//    Return nullable with @Nullable annotation, or return java.util.Optional
def findUserJava(id: Long): java.util.Optional[User] =
  findUser(id).toJava

// 5. Case classes work from Java — but use new, not apply
//   new User("Alice", 30) — Java can do this
//   User.apply("Alice", 30) — only via MODULE$, ugly

// 6. Sealed traits → Java can't pattern match. Provide a visitor or enum-like API.
```
::

## Primitive Boxing — Auto-Conversion

::code-wrapper{language="scala"}
```scala
// Scala primitives (Int, Long, Double) ↔ Java boxed types (Integer, Long, Double)
// Auto-boxing and unboxing happen automatically, but have performance implications:

val scalaInt: Int = 42
val javaInteger: java.lang.Integer = scalaInt    // auto-box: int → Integer (heap allocation)
val backToInt: Int = javaInteger                 // auto-unbox: Integer → int (may NPE if null!)

// ❌ ANTI-PATTERN: storing Scala Ints in Java collections → boxing per element
val javaList = new java.util.ArrayList[Int]()    // actually ArrayList[Integer]
javaList.add(1)                                  // box: 1 → Integer.valueOf(1)
javaList.add(2)                                  // box: 2 → Integer.valueOf(2)
// Each add boxes. Each get unboxes. For 1M elements: 1M Integer allocations.

// ✅ CORRECT: use Scala Array for primitive storage, convert to Java only at boundary
val scalaArr = Array[Int](1, 2, 3)              // int[] — no boxing
val javaArr = scalaArr.map(Integer.valueOf)      // explicit box at boundary only

// ⚠️ Java Integer caching: Integer.valueOf(-128..127) returns cached objects (JLS requirement)
//   Integer.valueOf(127) == Integer.valueOf(127)  → true (same cached object)
//   Integer.valueOf(128) == Integer.valueOf(128)  → MAYBE false (new objects)
//   Always use .equals() for Integer comparison, never ==
```
::

## Performance — Interop Overhead

::code-wrapper{language="scala"}
```scala
// Interop conversion costs (per element):
//   asScala / asJava view:   O(1) — no copy, just wrapper
//   toList / toVector:       O(n) — full copy
//   Option(javaValue):       O(1) — wrapper
//   toJava / toJavaOptional: O(1) — wrapper

// ❌ ANTI-PATTERN: converting back and forth in a hot loop
for item <- scalaList do
  javaApi.process(scalaList.asJava)          // converts entire list each iteration!
// O(n * iterations) conversions — catastrophic for large lists + many iterations

// ✅ CORRECT: convert once at the boundary, reuse
val javaList = scalaList.asJava              // convert once
for _ <- 1 to 1000 do
  javaApi.process(javaList)                  // reuse the same view — O(1) per call

// Boxing in generic Java APIs:
// java.util.HashMap[Int, String] → HashMap[Integer, String]
// Every put/get boxes/unboxes → 2 allocations per operation
// For high-throughput: use primitive-specialized Java libs (Trove, fastutil, HPPC)
```
::

## 💡 Tips & Tricks

**`scala.jdk.CollectionConverters` (Scala 2.13+ / 3.x)**: Replaces the old `JavaConverters` (deprecated). Always import from the new package — the old one has subtle bugs with mutability.

**`Option(null)` is the null-safe bridge**: The `Option.apply` factory handles null → None automatically. Use it to wrap any Java return value.

**`@tailrec` + Java recursion**: If you're calling a recursive Java method from Scala, `@tailrec` doesn't apply — it only works on Scala-compiled methods. The JVM doesn't guarantee tail-call optimization for Java bytecode.

## ⚠️ Edge Cases & Gotchas

**`asScala` on `java.util.Map` returns `mutable.Map`**: The view IS mutable — mutations go through to the Java map. If you need immutability, call `.toMap` to copy.

**Scala `String` = Java `String`**: They're the exact same type (`java.lang.String`). No conversion needed. But Scala adds extension methods (`"hello".stripMargin`) via `StringOps` — these don't exist in Java.

**`java.lang.Object` vs `scala.AnyRef`**: They're the same type. `AnyRef` is Scala's name for `Object`. `eq` (reference equality) works on both.

**Default parameter values are erased from Java's perspective**: Java sees the full signature with all parameters. Scala generates a `$default$N` method to retrieve defaults, but Java doesn't know to call it. Provide explicit overloads for Java callers.

**Scala `Unit` ≠ Java `void`**: `Unit` is a type with one value (`()`). In bytecode, methods returning `Unit` return `void`. But `Unit` as a type parameter boxes to `BoxedUnit.INSTANCE` — avoid `Future[Unit]` in Java-facing APIs.

## 🧠 Quick Quiz

What happens when you call `javaList.asScala.toList` and then mutate `javaList`?

<details>
<summary>Answer</summary>

The `List` you got is **unaffected** — `.toList` creates an immutable copy that's independent of the original `java.util.List`.

```scala
val javaList = new java.util.ArrayList[Int]()
javaList.add(1); javaList.add(2)

val snapshot = javaList.asScala.toList      // List(1, 2) — immutable COPY
javaList.add(3)                             // mutate original
println(snapshot)                           // → List(1, 2) — unchanged!
println(javaList.asScala.toList)            // → List(1, 2, 3) — view reflects mutation
```

**The difference**:
- `asScala` → a **view** (live, mutations propagate, O(1) creation)
- `asScala.toList` → a **copy** (independent, immutable, O(n) creation)

Use views when you need live access or zero-copy. Use copies when you need isolation or immutability guarantees.
</details>