---
title: Scala — Case Classes, ADTs & Advanced Pattern Matching
description: Production patterns for algebraic data types, exhaustiveness-driven domain modeling, custom extractors, regex patterns, and the compiler's unapplySeq / productElementNames machinery.
---

# 07 — Case Classes, ADTs & Advanced Pattern Matching

## Case Class Internals — What Gets Generated

::code-wrapper{language="scala"}
```scala
// case class generates (Scala 3):
//   1. apply() — factory method on companion object (no 'new' needed)
//   2. unapply() — extractor for pattern matching → Option[Tuple]
//   3. copy() — shallow copy with named param defaults for modification
//   4. equals() — field-by-field comparison via productElementNames + productIterator
//   5. hashCode() — MurmurHash3.productHash (consistent with equals)
//   6. toString() — "ClassName(field1, field2, ...)"
//   7. productPrefix, productArity, productElement, productIterator
//   8. The class itself is FINAL (can't subclass a case class)

final case class User(id: Long, name: String, email: String, roles: List[String]):
  // You can add methods — they don't interfere with generated ones
  def isAdmin: Boolean = roles.contains("admin")
  def withRole(role: String): User = copy(roles = roles :+ role)

// copy() — the immutable update pattern. Creates a new instance with modified fields.
val alice = User(1, "Alice", "alice@x.com", List("user"))
val aliceAdmin = alice.copy(roles = alice.roles :+ "admin")  // new User, old one unchanged
// copy is SHALLOW — List[String] is shared by reference (fine, List is immutable)

// ❌ ANTI-PATTERN: case class with mutable fields
case class BadConfig(var timeout: Int)     // equals/hashCode depend on mutable state!
val cfg = BadConfig(5000)
val set = Set(cfg)
cfg.timeout = 10000
set.contains(cfg)                          // → false! hashCode changed, wrong bucket
// ✅ CORRECT: use copy for updates, keep case classes immutable
```
::

## ADT Design — Sealed Hierarchies for Domain Modeling

::code-wrapper{language="scala"}
```scala
// Algebraic Data Type: sealed hierarchy where each variant is a case class.
// The compiler enforces exhaustiveness — adding a variant breaks all consumers.

sealed trait Event:
  def userId: Long
  def timestamp: Long

object Event:
  // "Sum type" — Event is ONE of these variants
  case class PageView(userId: Long, timestamp: Long, path: String, duration: Int) extends Event
  case class Click(userId: Long, timestamp: Long, target: String, x: Int, y: Int) extends Event
  case class Purchase(userId: Long, timestamp: Long, orderId: Long, amount: BigDecimal) extends Event
  case class SessionEnd(userId: Long, timestamp: Long, sessionId: String) extends Event

// "Product type" — each variant has fields (the "product" of their types)

// Exhaustive handler — compiler verifies all 4 cases are covered
def toJson(e: Event): String = e match
  case PageView(uid, ts, path, dur) => s"""{"type":"pv","uid":$uid,"path":"$path","dur":$dur}"""
  case Click(uid, ts, target, x, y) => s"""{"type":"click","uid":$uid,"target":"$target"}"""
  case Purchase(uid, ts, orderId, amount) => s"""{"type":"purchase","uid":$uid,"amt":$amount}"""
  case SessionEnd(uid, ts, sessionId) => s"""{"type":"end","uid":$uid,"sid":"$sessionId"}"""

// Adding Event.Signup → ALL match expressions fail to compile → forced to handle
// This is the #1 safety mechanism in Scala domain modeling.
```
::

## Recursive ADTs — Tree Structures

::code-wrapper{language="scala"}
```scala
// Recursive sealed ADT — compiler handles recursion in pattern matching
sealed trait Json
object Json:
  case object Null extends Json
  case class Bool(value: Boolean) extends Json
  case class Num(value: BigDecimal) extends Json
  case class Str(value: String) extends Json
  case class Arr(items: List[Json]) extends Json
  case class Obj(fields: List[(String, Json)]) extends Json

// Recursive traversal with pattern matching — NO @tailrec (not tail-recursive)
def stringify(json: Json): String = json match
  case Null        => "null"
  case Bool(b)     => b.toString
  case Num(n)      => n.toString
  case Str(s)      => s""""${s.replace("\"", "\\\"")}""""
  case Arr(items)  => items.map(stringify).mkString("[", ",", "]")     // recursive calls
  case Obj(fields) => fields.map { case (k, v) => s""""$k":${stringify(v)}""" }.mkString("{", ",", "}")

// For deep nesting, this WILL stack overflow. Use a trampoline or iterative approach:
@tailrec
def stringifyIter(json: Json, stack: List[Json] = Nil, acc: StringBuilder = StringBuilder()): String =
  json match
    case Null => ???  // complex — use Cats' IO or a proper stack-machine parser for production
    case _ => ???
```
::

## Pattern Matching — Guards, Alternatives, and `@` Binding

::code-wrapper{language="scala"}
```scala
sealed trait Shape
case class Circle(radius: Double) extends Shape
case class Rectangle(width: Double, height: Double) extends Shape
case class Triangle(a: Double, b: Double, c: Double) extends Shape

def classify(s: Shape): String = s match
  // @ binding — capture the whole value AND destructure fields
  case c @ Circle(r) if r > 100 => s"huge circle: $c"     // c is the full Circle object

  // Alternative patterns — match multiple shapes in one case
  case Rectangle(w, h) | Triangle(a, b, c) if area(s) > 1000 => "large non-circle"

  // Guard with field computation
  case Rectangle(w, h) if math.abs(w - h) < 0.001 => "square"  // near-square rectangle

  // Exhaustive fallback (sealed → no catch-all needed, but can add for safety)
  case other => s"shape: $other"

def area(s: Shape): Double = s match
  case Circle(r) => math.Pi * r * r
  case Rectangle(w, h) => w * h
  case Triangle(a, b, c) =>
    val s = (a + b + c) / 2
    math.sqrt(s * (s - a) * (s - b) * (s - c))  // Heron's formula
```
::

## Collection Patterns — `::`, `Nil`, `_*`, `unapplySeq`

::code-wrapper{language="scala"}
```scala
val list = List(1, 2, 3, 4, 5)

list match
  case Nil           => "empty"
  case head :: Nil   => s"single: $head"          // List(x) also works
  case a :: b :: Nil => s"pair: $a, $b"           // List(a, b)
  case head :: tail  => s"head=$head, tail=$tail" // non-empty with rest
  case _             => "shouldn't reach (sealed List)"

// _* — match variable number of remaining elements (via unapplySeq)
list match
  case List(first, second, rest @ _*) => s"first=$first, second=$second, rest=${rest.toList}"
  // rest is Seq[Int] of remaining elements → List(3, 4, 5)

// Fixed-size pattern + rest
List(1, 2, 3, 4) match
  case List(a, b, _*) => s"first two: $a, $b"     // matches, ignores rest

// ❌ PITFALL: List(1, 2, 3) match { case List(a, b) => ... } — DOESN'T match!
// List(a, b) requires EXACTLY 2 elements. Use a :: b :: _ for "at least 2".
```
::

## Regex Patterns in Match

::code-wrapper{language="scala"}
```scala
import scala.util.matching.Regex

// Regex extractor — unapplySeq returns matched groups as a List
val logPattern: Regex = """(\d{4}-\d{2}-\d{2}) (\w+) (.+)""".r

def parseLog(line: String): Option[(String, String, String)] = line match
  case logPattern(date, level, msg) => Some((date, level, msg))  // groups bound to names
  case _                            => None

parseLog("2024-01-15 ERROR Something broke")  // → Some(("2024-01-15", "ERROR", "Something broke"))

// Regex with variable groups — use unapplySeq with _*
val kvPattern: Regex = """(\w+)=(\w+)""".r
val line = "name=Alice age=30 role=admin"
val pairs = kvPattern.findAllMatchIn(line).map(m => (m.group(1), m.group(2))).toMap
// → Map("name" -> "Alice", "age" -> "30", "role" -> "admin")
```
::

## Custom Extractors — `unapply` with State

::code-wrapper{language="scala"}
```scala
// Extractor that validates and transforms — not just destructuring
object Email:
  def unapply(s: String): Option[(String, String)] =
    val at = s.indexOf('@')
    if at > 0 && s.indexOf('.', at) > at then
      Some((s.take(at), s.drop(at + 1)))   // (local-part, domain)
    else
      None

def classify(s: String): String = s match
  case Email(local, domain) if domain.endsWith(".com") => s"commercial: $local@$domain"
  case Email(local, domain) => s"other: $local@$domain"
  case _ => "not an email"

classify("alice@example.com")   // → "commercial: alice@example.com"
classify("bob@not-email")       // → "not an email"

// Extractor from a type — for pattern matching on opaque types
object PositiveInt:
  def unapply(n: Int): Option[Int] = if n > 0 then Some(n) else None

def process(n: Int): String = n match
  case PositiveInt(x) => s"positive: $x"
  case 0              => "zero"
  case _              => "negative"
```
::

## Quasi-Pattern Matching with `as` and `:?` (Scala 3)

::code-wrapper{language="scala"}
```scala
// Scala 3: type test in pattern without binding
def handle(x: Any): String = x match
  case s: String => s"string of length ${s.length}"
  case i: Int if i > 0 => s"positive int: $i"
  case arr: Array[?] => s"array of size ${arr.length}"  // [?] = wildcard, avoids unchecked warning
  case _ => "unknown"

// Scala 3: inline match — match on an expression inline (no match block)
val result = x match
  case _: String => "str"
  case _ => "other"

// Or even inline in a for-comprehension:
for
  s <- list.collect { case s: String => s }  // collect filters + casts in one pass
  if s.length > 3
yield s.toUpperCase
```
::

## `copy` and Named Updates — Immutable Data Evolution

::code-wrapper{language="scala"}
```scala
// Nested immutable update — the classic pain point, solved with copy chains
final case class Address(street: String, city: String, zip: String)
final case class Company(name: String, address: Address)
final case class Employee(name: String, company: Company)

val emp = Employee("Alice", Company("Acme", Address("123 Main", "NYC", "10001")))

// ❌ VERBOSE: nested copy chains
val moved = emp.copy(
  company = emp.company.copy(
    address = emp.company.address.copy(
      city = "San Francisco"
    )
  )
)

// ✅ BETTER: use a lens library (Monocle) or just write a helper
def updateCity(e: Employee, city: String): Employee =
  e.copy(company = e.company.copy(address = e.company.address.copy(city = city)))

// For deeply nested immutable data, consider:
//   1. Flatter data structures (normalize like a DB)
//   2. Monocle lenses: emp.focus(_.company.address.city).replace("SF")
//   3. Mutable builders for construction, freeze to case class for storage
```
::

## 💡 Tips & Tricks

**`case object` for singleton variants**: When an ADT case has no fields, use `case object` — it's a singleton, zero allocation per use.

::code-wrapper{language="scala"}
```scala
sealed trait Maybe[+T]
case object Nothing extends Maybe[Nothing]  // singleton — no allocation
case class Just[T](value: T) extends Maybe[T]
```
::

**`productElementNames` for reflective serialization**: Scala 3 case classes expose field names via `productElementNames` — use for generic JSON/DB serialization without reflection.

::code-wrapper{language="scala"}
```scala
val names = alice.productElementNames.toVector  // → Vector("id", "name", "email", "roles")
val values = alice.productIterator.toVector     // → Vector(1L, "Alice", "alice@x.com", List("user"))
```
::

**`unapply` returning `Boolean` for guard-like extractors**: When you only need a yes/no match (no captured values), `unapply` returning `Boolean` is cleaner than `Option[Unit]`.

## ⚠️ Edge Cases & Gotchas

**Type erasure in pattern matching**: `case m: Map[String, Int]` — the `String` and `Int` are erased. The match will succeed for ANY `Map`, regardless of key/value types. Use element-level checks instead.

**`case _` after sealed match hides future variants**: If you add `case _` to a sealed match, the compiler CANNOT warn you about missing new variants. The catch-all silently handles them.

**Case class `copy` is shallow**: Nested mutable fields (e.g., `case class C(buf: mutable.ArrayBuffer[Int])`) share the same buffer between original and copy — mutating one affects the other.

**`equals` on case class with `Float`/`Double`**: `Float.NaN != Float.NaN`, so `case class Point(x: Float)` — two `Point(NaN)` are NOT equal. This is IEEE 754 semantics, not a Scala bug.

## 🧠 Quick Quiz

What's the difference between `case head :: tail =>` and `case head +: tail =>`?

<details>
<summary>Answer</summary>

They're functionally identical for `List`:
- `::` is the cons operator — `head :: tail` is a pattern that matches a non-empty `List`, binding `head` to the first element and `tail` to the rest.
- `+:` is the general prepended element pattern — works on ANY `Seq`, not just `List`.

For `List`, `::` uses `::.unapply` (List-specific). `+:` uses `scala.collection.+:.unapply` which works on any `SeqOps`.

Use `::` when you specifically mean `List`. Use `+:` when working with generic `Seq` types where the concrete type might be `Vector`, `ArrayBuffer`, etc.
</details>