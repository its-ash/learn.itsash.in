# 11 — Java Interoperability

## Using Java from Scala

Scala runs on the JVM and can seamlessly use Java libraries:

::code-wrapper{language="scala"}
```scala
import java.util.ArrayList
import java.util.HashMap

// Use Java classes directly
val list = new ArrayList[Int]()
list.add(1)
list.add(2)

val map = new HashMap[String, Int]()
map.put("a", 1)

// Java methods return Java types
val size = list.size()

// Java arrays
val arr = new Array[String](3)
arr(0) = "hello"
arr(1) = "world"
```
::

## Scala Collections ↔ Java Collections

Convert between Scala and Java collections:

::code-wrapper{language="scala"}
```scala
import scala.jdk.CollectionConverters._

// Java to Scala
val javaList: java.util.List[Int] = new java.util.ArrayList()
javaList.add(1)
javaList.add(2)

val scalaList = javaList.asScala    // List[Int]
scalaList.map(_ * 2)               // List(2, 4)

// Scala to Java
val sList = List(1, 2, 3)
val jList = sList.asJava           // java.util.List[Int]

// Map conversions
val jMap: java.util.Map[String, Int] = new java.util.HashMap()
jMap.put("a", 1)
val sMap = jMap.asScala            // scala.collection.mutable.Map[String, Int]

// Set conversions
val jSet = new java.util.HashSet[Int]()
jSet.add(1)
val sSet = jSet.asScala            // scala.collection.mutable.Set[Int]
```
::

## Null Handling

Java code can return `null`; Scala prefers `Option`:

::code-wrapper{language="scala"}
```scala
// Java method might return null
def getUserFromDB(id: Int): String = {
  // ... returns null if not found
  null
}

// Safe to Option
val maybeUser = Option(getUserFromDB(1))
maybeUser match {
  case Some(user) => println(s"Found: $user")
  case None => println("Not found")
}

// Direct null check (less safe)
val user = getUserFromDB(1)
if (user != null) {
  println(user)
}
```
::

## Java Exceptions

Scala uses Java exceptions; no checked exceptions in Scala:

::code-wrapper{language="scala"}
```scala
import java.io.IOException

try {
  val file = new java.io.FileReader("missing.txt")
} catch {
  case e: IOException => println(s"IO error: ${e.getMessage}")
  case e: Exception => println(s"Error: ${e.getMessage}")
}

// Scala doesn't require throwing declaration
def risky(): Unit = {
  throw new IOException("failed")  // no 'throws' clause needed
}
```
::

## Java Interop Patterns

### Wrapping Java Classes

Create Scala-friendly wrappers:

::code-wrapper{language="scala"}
```scala
import java.util.{List => JList}

class ScalaList[T](val underlying: JList[T]) {
  def map[U](f: T => U): ScalaList[U] = {
    val result = new java.util.ArrayList[U]()
    for (elem <- underlying.asScala) {
      result.add(f(elem))
    }
    new ScalaList(result)
  }
  
  def filter(p: T => Boolean): ScalaList[T] = {
    val result = new java.util.ArrayList[T]()
    for (elem <- underlying.asScala if p(elem)) {
      result.add(elem)
    }
    new ScalaList(result)
  }
}

val jlist = new java.util.ArrayList[Int]()
jlist.add(1)
jlist.add(2)

val slist = ScalaList(jlist)
slist.map(_ * 2)
```
::

### Type Conversion

Convert between Java and Scala types:

::code-wrapper{language="scala"}
```scala
// Primitives are auto-converted
val i: Int = 42
val javaInt: java.lang.Integer = i  // auto-boxed
val backToInt: Int = javaInt        // auto-unboxed

// Collections need explicit conversion
val sList: scala.collection.immutable.List[Int] = List(1, 2, 3)
val jList = sList.asJava            // java.util.List[Int]

// Strings are compatible
val s: String = "hello"
val javaStr: java.lang.String = s   // same type
```
::

## Using Java Libraries

Common Java libraries used from Scala:

::code-wrapper{language="scala"}
```scala
// Logging
import java.util.logging.Logger
val log = Logger.getLogger("myapp")
log.info("Starting application")

// HTTP (using Apache HttpClient)
import org.apache.http.client.HttpClient
import org.apache.http.impl.client.HttpClients
val client: HttpClient = HttpClients.createDefault()

// JSON (using Jackson or gson)
import com.google.gson.Gson
val gson = new Gson()
val json = gson.toJson(Map("name" -> "Alice"))

// Database (JDBC)
import java.sql.DriverManager
val conn = DriverManager.getConnection("jdbc:mysql://localhost/db", "user", "pass")
val stmt = conn.createStatement()
val rs = stmt.executeQuery("SELECT * FROM users")
```
::

## Creating Java-Compatible Scala Code

Write Scala that Java developers can use:

::code-wrapper{language="scala"}
```scala
// ✅ Java-friendly: simple interfaces
class Calculator {
  def add(a: Int, b: Int): Int = a + b
  def multiply(a: Int, b: Int): Int = a * b
}

// ❌ Less Java-friendly: advanced Scala features
def process[T <: scala.math.Numeric[T]](value: T): T = {
  // Java can't call this easily
  value * value
}

// Companion object (functions)
object Utils {
  def greet(name: String): String = s"Hello, $name"
}

// Can be called from Java
val greeting = Utils.greet("Alice")
```
::

## Calling Scala from Java

::code-wrapper{language="scala"}
// Scala code
package com.example

object HelloScala {
  def greet(name: String): String = s"Hello, $name"
}

case class Person(name: String, age: Int) {
  def describe(): String = s"$name is $age years old"
}
::

From Java:

::code-wrapper{language="java"}
import com.example.HelloScala;
import com.example.Person;

public class JavaCaller {
  public static void main(String[] args) {
    // Calling Scala object (singleton)
    String greeting = HelloScala.greet("Alice");
    System.out.println(greeting);
    
    // Using Scala case class
    Person p = new Person("Bob", 30);
    System.out.println(p.describe());
    System.out.println(p.name());    // getter from case class
  }
}
```
::

## Option ↔ Java Optional

Scala `Option` is similar to Java `Optional`:

::code-wrapper{language="scala"}
```scala
import scala.jdk.OptionConverters._

// Java Optional to Scala Option
val javaOpt = java.util.Optional.of(42)
val scalaOpt: Option[Int] = javaOpt.toScala

// Scala Option to Java Optional
val sOpt = Some(42)
val jOpt: java.util.Optional[Int] = sOpt.toJava
```
::

## Compatibility Notes

::code-wrapper{language="scala"}
```scala
// ✅ Scala generates Java-compatible bytecode
class MyClass(val x: Int) {
  def getValue(): Int = x
}

// ✅ Object methods have underscores in Java
object MyObject {
  def getValue(): Int = 42
}
// Accessed from Java as: MyObject$.MODULE$.getValue()

// ⚠️ Default parameters don't work well from Java
def withDefault(x: Int = 10): Int = x
// Java must pass argument explicitly

// ⚠️ Type parameters are erased at runtime
def process[T](value: T): T = value
// Java sees: Object process(Object value)

// ⚠️ Implicit conversions don't work from Java
// implicit def intToString(i: Int): String = i.toString
// Java can't use this
```
::

## 💡 Tips & Tricks

**Use `asScala` and `asJava` for collection conversion**: From `scala.jdk.CollectionConverters._`.

**Wrap Java classes for better Scala experience**: Provide Scala-friendly methods on top of Java classes.

**Use `Option` instead of nullable returns**: Even when calling Java, convert nulls to `Option`.

**Package organization**: Structure code so Java developers find what they need.

**Document Java-facing APIs**: If you're publishing a library, make it clear what's Java-compatible.

## ⚠️ Edge Cases & Gotchas

**Null values**: Java code can return `null`. Always wrap with `Option(javaValue)`.

**Checked exceptions**: Java checked exceptions become unchecked in Scala (can't be caught specifically).

**Scala lambdas ↔ Java lambdas**: Be careful with implicit conversions. Use explicit types.

**Collection mutability**: Java collections are mutable; converted Scala collections are also mutable.

**Infinite streams**: Scala `Stream` doesn't translate well to Java iterators (laziness not preserved).

**Performance**: Wrappers and conversions add overhead. Use raw Java when performance critical.

## 🧠 Spot the Bug

What's wrong here?

::code-wrapper{language="scala"}
```scala
val javaList: java.util.List[Int] = new java.util.ArrayList()
javaList.add(1)
javaList.add(2)

val scalaList = javaList.asScala
scalaList.map(_ * 2)

javaList.add(3)
println(scalaList)  // prints what?
```
::

<details>
<summary>Answer</summary>

Prints `List(1, 2, 3, 6)` or similar, depending on timing.

Here's why:
- `asScala` creates a **view** over the Java list (not a copy)
- Modifying `javaList` after conversion affects `scalaList`
- `scalaList` reflects the Java list's changes

If you need a snapshot, convert first:

::code-wrapper{language="scala"}
```scala
val scalaList = javaList.asScala.toList  // immutable copy
```
::

**The lesson**: `asScala` is a view, not a copy. If you need independence, materialize it.

</details>

## Key Takeaways

- Scala runs on JVM and integrates seamlessly with Java.
- Use `asScala`/`asJava` from `scala.jdk.CollectionConverters._` for collection conversion.
- Java code can return `null`; wrap with `Option`.
- Write Scala code that's Java-compatible: avoid advanced type features.
- Scala generates Java-compatible bytecode; can be called from Java.
- `asScala` creates a view, not a copy; use `.toList` for immutable snapshot.
- Use wrapper classes for better Scala experience over Java libraries.
