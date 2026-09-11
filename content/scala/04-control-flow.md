---
title: Scala — Pattern Matching, Exhaustiveness & Branch Elimination
description: Production-grade pattern matching, sealed exhaustiveness, refutable vs irrefutable patterns, match type desugaring, and control-flow-as-expression semantics in Scala 3.
---

# 04 — Pattern Matching, Exhaustiveness & Branch Elimination

## `if` / `else` — Expression, Not Statement

::code-wrapper{language="scala"}
```scala
// if/else evaluates to a value — the branch expression is the result
val status = if httpCode < 400 then "ok" else "error"

// All branches must have a common supertype (LUB — least upper bound)
val result: Any = if cond then 42 else "fail"  // LUB of Int and String = Any (AnyVal in Scala 3)

// if WITHOUT else returns Unit — the else branch implicitly is ()
val sideEffect: Unit = if cond then println("yes")  // = if cond then println("yes") else ()

// ❌ ANTI-PATTERN: using if for side effects when you need the value
var result = ""
if cond then result = "yes" else result = "no"  // mutation + if-as-statement

// ✅ CORRECT: expression form, no mutation
val result = if cond then "yes" else "no"
```
::

## `match` — Exhaustiveness & Sealed Hierarchies

::code-wrapper{language="scala"}
```scala
// Sealed hierarchy: compiler knows ALL subtypes → exhaustiveness check
sealed trait HttpStatus
object HttpStatus:
  case class Ok(body: String) extends HttpStatus
  case class Error(code: Int, msg: String) extends HttpStatus
  case object Pending extends HttpStatus

import HttpStatus.*

// Compiler verifies ALL cases are covered — missing case = compile ERROR (Scala 3)
def describe(s: HttpStatus): String = s match
  case Ok(body)        => s"OK: $body"
  case Error(code, _)  => s"Error $code"
  case Pending         => "Still processing"
// If you add a new case (e.g., Redirect) → ALL match expressions break at compile time
// This is the #1 reason to use sealed: refactoring safety.

// ❌ ANTI-PATTERN: catch-all case hides missing branches
def describeBad(s: HttpStatus): String = s match
  case Ok(_) => "ok"
  case _ => "other"                        // swallows Error AND Pending — silent bug on new cases

// ✅ CORRECT: explicit per-case, no catch-all for sealed types
// (unless genuinely handling unknown subtypes from unsealed hierarchies)
```
::

## Pattern Types — Literal, Constructor, Type, Guard

::code-wrapper{language="scala"}
```scala
final case class HttpRequest(method: String, path: String, headers: Map[String, String])
final case class HttpResponse(status: Int, body: Array[Byte])

// 1. Literal pattern — exact value match
def httpVerb(method: String): String = method match
  case "GET"    => "read"
  case "POST"   => "create"
  case "PUT"    => "update"
  case "DELETE" => "remove"
  case other    => s"unknown: $other"      // variable pattern — catches anything, binds it

// 2. Constructor pattern — destructure case class fields
def route(req: HttpRequest): HttpResponse = req match
  case HttpRequest("GET", path, _) if path.startsWith("/api/") =>
    HttpResponse(200, handleApi(path).getBytes)
  case HttpRequest("GET", "/", headers) =>
    HttpResponse(200, serveIndex(headers).getBytes)
  case HttpRequest("POST", "/users", h) if h.get("Content-Type").contains("application/json") =>
    HttpResponse(201, createUser().getBytes)
  case HttpRequest(method, path, _) =>
    HttpResponse(405, s"Method $method not allowed for $path".getBytes)

// 3. Type pattern — runtime type test + safe cast (no ClassCastException)
def serialize(value: Any): String = value match
  case s: String    => s""""$s""""          // type test + binding in one
  case i: Int       => i.toString
  case a: Array[Byte] => java.util.Base64.getEncoder.encodeToString(a)
  case m: Map[?, ?] => m.map { case (k, v) => s"$k:$v" }.mkString("{", ",", "}")
  case null         => "null"              // explicit null match (Scala 3 without -explicitNulls)
```
::

## Type Erasure — The Generic Pattern Trap

::code-wrapper{language="scala"}
```scala
// ❌ DANGEROUS: type parameters are erased — runtime can't distinguish List[Int] from List[String]
def headAsInt(list: List[?]): Option[Int] = list match
  case _: List[Int]    => Some(list.head.asInstanceOf[Int])  // UNCHECKED — will match List[String]!
  case _: List[String] => None                                // UNREACHABLE — erasure makes both identical
  case _               => None

headAsInt(List("a", "b"))                  // → Some("a".asInstanceOf[Int]) — ClassCastException at use!

// Scala 3 gives a WARNING: "pattern type List[Int] is unchecked since it is eliminated by erasure"

// ✅ CORRECT: match on element types at runtime, not the container's type parameter
def headAsIntSafe(list: List[?]): Option[Int] = list.headOption match
  case Some(i: Int) => Some(i)             // element-level type test — safe
  case _            => None

headAsIntSafe(List(1, 2, 3))               // → Some(1)
headAsIntSafe(List("a", "b"))             // → None (String doesn't match Int)
```
::

## Unapply / Extractors — Custom Pattern Matching

::code-wrapper{language="scala"}
```scala
// Custom extractor via unapply — enables pattern matching on non-case-class types
object HttpStatusCode:
  def unapply(code: Int): Option[(String, String)] =
    val reason = code match
      case 200 => "OK"
      case 404 => "Not Found"
      case 500 => "Internal Server Error"
      case _   => return None               // early return — no match
    val category = code / 100 match
      case 2 => "Success"
      case 4 => "Client Error"
      case 5 => "Server Error"
      case _ => "Unknown"
    Some((category, reason))

// Now usable in match:
def describe(code: Int): String = code match
  case HttpStatusCode(cat, reason) => s"$cat: $reason"
  case _ => "Unknown code"

// Boolean extractor — unapply returning Boolean (no captured values)
object IsEven:
  def unapply(n: Int): Boolean = n % 2 == 0

def classify(n: Int): String = n match
  case IsEven() => "even"                   // note: () not _ — boolean extractor
  case _        => "odd"

// Product extractor — unapply returning Option[Tuple] for destructuring
object SplitPath:
  def unapply(path: String): Option[(String, String)] =
    val idx = path.indexOf('/')
    if idx < 0 then None else Some((path.take(idx), path.drop(idx + 1)))

"/api/users" match
  case SplitPath(head, rest) => println(s"head=$head, rest=$rest")  // head="", rest="api/users"
```
::

## `Either` / `Try` / `Option` — Error as Values

::code-wrapper{language="scala"}
```scala
import scala.util.{Try, Success, Failure}

// Either[L, R]: error on Left, success on Right. Right-biased in stdlib.
def parsePort(s: String): Either[String, Int] =
  Try(s.toInt).toEither                    // → Either[Throwable, Int]
    .left.map(_.getMessage)                // → Either[String, Int]
    .filterOrElse(p => p > 0 && p <= 65535, "port out of range 1-65535")

// Chaining with for-comprehension — short-circuits on first Left
def connect(host: String, portStr: String): Either[String, Connection] =
  for
    port <- parsePort(portStr)             // Left("...") → short-circuits entire chain
    conn <- openConnection(host, port)     // only runs if parsePort succeeded
  yield conn

// recover / recoverWith — transform failure into success
def fetchWithFallback(url: String): Future[String] =
  httpClient.get(url)
    .recoverWith:
      case _: TimeoutException => httpClient.get(fallbackUrl(url))  // try fallback
      case _: ConnectionRefused => Future.successful("")             // degrade gracefully

// Try → Option (discard error info) or Either (preserve it)
def parseInt(s: String): Option[Int] = Try(s.toInt).toOption
def parseIntEither(s: String): Either[Throwable, Int] = Try(s.toInt).toEither

// ❌ ANTI-PATTERN: throw exceptions in library code — breaks for-comprehension chains
def badParse(s: String): Int = s.toInt     // throws NumberFormatException → uncomposable
// ✅ CORRECT: return Either/Try/Option — callers can chain safely
```
::

## `try` / `catch` / `finally` — Expression Semantics

::code-wrapper{language="scala"}
```scala
// try is an expression — evaluates to the body or the catch handler result
val result: Int = try
  riskyComputation()
catch
  case _: ArithmeticException => 0         // catch by type, no variable needed if unused
  case e: IllegalArgumentException => -1
finally
  cleanup()                                // finally returns Unit — doesn't affect the value

// ❌ ANTI-PATTERN: returning from finally — swallows exceptions
def bad(): Int =
  try throw new RuntimeException("real error")
  finally return 42                         // SILENTLY swallows the exception → returns 42
// This is a warning in Scala 3: "return in finally is discouraged"

// Non-local return inside try is deprecated in Scala 3:
//   def find(xs: List[Int]): Int = xs.foreach(x => if x > 0 then return x)
// → Use xs.find(_ > 0).get or a proper recursive function instead

// Try-catch is EXPENSIVE on JVM (exception construction captures stack trace)
// → Use Either/Try for expected failures, reserve try/catch for truly unexpected errors
```
::

## Match Types — Compile-Time Pattern Matching on Types

::code-wrapper{language="scala"}
```scala
// Scala 3 match types — the return type is computed at compile time based on input type
type Json[T] = T match
  case Int     => "int"
  case String  => "string"
  case Boolean => "bool"
  case List[t] => s"[${Json[t]}]"          // recursive match type
  case Option[t] => s"opt:${Json[t]}"
  case Map[k, v] => s"map:${Json[k]}:${Json[v]}"

inline def toJsonType[T]: Json[T] = summon[Json[T] =:= String] match
  case _ => ???

// Practical use: type-level serialization
type Repr[T] = T match
  case Int    => Int
  case String => String
  case Double => Double
  case Boolean => Boolean
  case List[t] => Array[Repr[t]]           // List[Int] → Array[Int], no boxing!

// The compiler reduces Repr[List[Int]] to Array[Int] at compile time
// No runtime pattern matching, no type erasure issues
```
::

## Loops — `while` / `for` and Their Desugaring

::code-wrapper{language="scala"}
```scala
// while: raw loop, returns Unit, no functional sugar
var i = 0
while i < items.length do
  process(items(i))
  i += 1

// for (no yield): desugars to foreach — side-effect loop, returns Unit
for item <- items do process(item)         // → items.foreach(item => process(item))

// for with yield: desugars to flatMap/map chain (see 03-functions)
val results = for
  a <- OptionA
  b <- OptionB
  if a > b                                 // guard → withFilter
yield a + b

// ❌ ANTI-PATTERN: building collections with for-loop + mutable accumulator
val buf = scala.collection.mutable.ArrayBuffer.empty[Int]
for x <- 1 to 1000 do buf += x * 2         // O(1) per append, but imperative + mutable

// ✅ CORRECT: for-yield or direct functional call — immutable, fused
val doubled = for x <- 1 to 1000 yield x * 2  // → Vector(2, 4, ..., 2000)
val direct = (1 to 1000).map(_ * 2)           // same result, single pass

// No break/continue — use takeWhile/dropWhile or tail recursion
@tailrec
def findFirstPositive(xs: List[Int]): Option[Int] = xs match
  case Nil              => None
  case head :: _ if head > 0 => Some(head)  // early exit via pattern match
  case _ :: tail        => findFirstPositive(tail)  // tail call → loop
```
::

## 💡 Tips & Tricks

**`sealed` + `enum` for exhaustive state machines**: Scala 3 `enum` is automatically sealed — all variants known at compile time.

::code-wrapper{language="scala"}
```scala
enum ConnectionState:
  case Disconnected, Connecting, Connected, Error(msg: String)

def handle(s: ConnectionState): Unit = s match
  case Disconnected   => reconnect()
  case Connecting     => waitForTimeout()
  case Connected      => ()
  case Error(msg)     => log.error(msg)
// Add a new state → compile error on ALL match expressions → forced handling
```
::

**Pattern match with `@` to bind the whole value while destructuring**: `case ev @ Error(code, _) =>` gives you both `ev` (the full object) and `code` (the field).

**`orElse` on `PartialFunction` for composition**: `pf1.orElse(pf2)` tries `pf1` first, falls back to `pf2` if `pf1.isDefinedAt` is false.

## ⚠️ Edge Cases & Gotchas

**Variable pattern vs constant pattern**: A lowercase name is a variable (binds anything). An uppercase name or backtick-quoted name is a constant (matches by value).

::code-wrapper{language="scala"}
```scala
val MAX = 100
def classify(n: Int): String = n match
  case MAX => "max"                        // ✅ uppercase = constant pattern, matches 100
  case `max` => "also max"                 // ✅ backtick = constant
  case max => s"got $max"                  // ❌ lowercase = variable, binds n, always matches!

// The `case max =>` line is a catch-all that shadows MAX — no warning in Scala 2,
// Scala 3 warns: "pattern var max shadows the same-named val"
```
::

**`withFilter` vs `filter` in for-comprehensions**: The compiler uses `withFilter` (lazy) for guards. If `withFilter` doesn't exist, it falls back to `filter` (strict, allocates intermediate collection). Custom monads must implement `withFilter` for efficiency.

**Match on `null` explicitly**: In Scala 3 without `-explicitNulls`, `null` can appear anywhere. A `case null =>` guard is the only way to handle it in pattern matching.

## 🧠 Quick Quiz

What happens if you add `case object Redirect extends HttpStatus` to the sealed trait but don't update a match expression?

<details>
<summary>Answer</summary>

**Compile error** (Scala 3) or **compile warning** (Scala 2 with `-Werror`). The compiler tracks all subtypes of a sealed trait and verifies that every `match` expression handles all of them. Adding `Redirect` makes every existing `match` on `HttpStatus` non-exhaustive.

This is the primary benefit of sealed hierarchies: **refactoring safety**. You cannot add a case without updating all consumers — the compiler forces you.
</details>