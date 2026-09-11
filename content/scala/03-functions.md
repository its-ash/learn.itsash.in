---
title: Scala — Functions, Closures & Compile-Time Desugaring
description: Production deep-dive into function types, closure capturing, tail-call optimization, by-name vs by-need, currying, and the JVM representation of Scala functions.
---

# 03 — Functions, Closures & Compile-Time Desugaring

## Function Types — JVM Representation

::code-wrapper{language="scala"}
```scala
// Function1[A, B] is a trait with a single abstract method:
//   trait Function1[-A, +B]:
//     def apply(v1: A): B
//
// At the bytecode level: a lambda (x => x * 2) compiles to:
//   1. A synthetic class extending Function1$mcII$sp (specialized for Int→Int)
//      → if no specialization: plain Function1 with Object apply(Object)
//   2. INVOKEDYNAMIC in Scala 3 (SAM closure via LambdaMetafactory)
//      → JVM generates the impl class at runtime, same as Java lambdas

val double: Int => Int = x => x * 2       // → Function1[Int, Int]
// double.apply(5)                         // → the actual call
// double(5)                               // sugar for .apply(5)

// Function types up to Function22 exist as named traits.
// Beyond 22 params: Scala 3 uses FunctionXXL (uses Object[] internally, not typed)
val complex: (Int, String, Boolean) => Double = (i, s, b) => if b then i * s.length.toDouble else 0.0

// Scala 3: dependent function types — return type depends on input value
trait Codec:
  type Repr
  def encode(r: Repr): Array[Byte]
def process(c: Codec)(r: c.Repr): Array[Byte] = c.encode(r)  // c.Repr is path-dependent
```
::

## Closures — Capture Semantics & Allocation

::code-wrapper{language="scala"}
```scala
// A closure captures free variables from the enclosing scope.
// Captured vars → stored as fields in the lambda's synthetic class.
// Captured vals → may be inlined or stored as fields.

def makeCounter(start: Int): () => Int =
  var count = start                        // mutable — captured by reference
  () =>                                    // closure captures 'count' as a field
    count += 1                             // reads AND writes the captured var
    count

val counter = makeCounter(0)               // 1 allocation: the closure object
counter()                                  // → 1, reads/writes count field on closure
counter()                                  // → 2

// ❌ ANTI-PATTERN: closure capturing 'this' in a hot loop
class Processor:
  def process(items: List[Int]): List[Int] =
    items.map(x => transform(x))           // closure captures 'this' → allocates per call
  def transform(x: Int): Int = x * 2

// ✅ CORRECT: hoist method reference, avoid closure allocation
class Processor:
  def process(items: List[Int]): List[Int] =
    items.map(transform)                   // method reference: eta-expansion creates ONE Function1
  def transform(x: Int): Int = x * 2       //   reused across all elements (in Scala 3 with -opt)
```
::

## Higher-Order Functions — Real-World Pipeline

::code-wrapper{language="scala"}
```scala
// Production-grade data pipeline: streaming log analysis with function composition
import scala.util.Using

final case class LogEntry(ts: Long, level: String, msg: String)

object LogPipeline:
  // Function composition with andThen / compose — builds a single pipeline
  type LogFilter = LogEntry => Boolean
  type LogTransform = LogEntry => LogEntry

  val errorFilter: LogFilter = _.level == "ERROR"
  val enrich: LogTransform = e => e.copy(msg = s"[svc] ${e.msg}")

  // andThen: (f andThen g)(x) = g(f(x)) — left-to-right reading
  // compose: (f compose g)(x) = f(g(x)) — right-to-left
  val pipeline: LogFilter = errorFilter
  val transform: LogTransform = enrich

  def process(entries: List[LogEntry]): List[String] =
    entries
      .filter(pipeline)                    // LogFilter: LogEntry => Boolean
      .map(transform)                      // LogTransform: LogEntry => LogEntry
      .map(_.msg)                          // extract message
      .scanLeft("")(_ + "\n" + _)          // accumulate with prefix
      .drop(1)                             // remove initial ""

  // Partial application for reusable, configurable components
  def filterByLevel(level: String): LogFilter = _.level == level
  val warnFilter = filterByLevel("WARN")   // partial application → reusable filter
```
::

## Currying & Multiple Parameter Lists

::code-wrapper{language="scala"}
```scala
// Multiple parameter lists enable:
//   1. Type inference boundary — first list informs second list's types
//   2. Trailing block syntax for DSL-style
//   3. Partial application without placeholder syntax

// Type inference: first param list determines type parameter for second
def mapExactly[A, B](list: List[A])(f: A => B): List[B] = list.map(f)
mapExactly(List(1, 2, 3))(x => x * 2)      // A=Int inferred from first list; f: Int=>B, no annotation needed
// With single list: mapExactly(List(1,2,3), x => x * 2) — type of x unknown, must annotate

// DSL-style trailing block:
def withResource[R](acquire: => R)(release: R => Unit)(body: R => Unit): Unit =
  val r = acquire
  try body(r) finally release(r)

withResource(openSocket())(_.close()) { socket =>
  socket.write("data")                     // reads as: "with resource [acquired] [released] do { body }"
}

// Curry for dependency injection — first list: config, second list: payload
def httpRequest(config: ClientConfig)(url: String, body: Array[Byte]): Response =
  ???
val apiCall = httpRequest(prodConfig)      // partially applied — reusable with different URLs
apiCall("/users", payload)
```
::

## By-Name Parameters (`=> T`) vs By-Need (`=> T` with `lazy`)

::code-wrapper{language="scala"}
```scala
// By-name: the expression is re-evaluated EVERY time it's referenced
def trace[A](msg: => String)(value: A): A =
  println(msg)                             // eval #1
  println(msg)                             // eval #2 — runs the expression AGAIN
  value

trace({ println("evaluating"); "msg" })(42)
// Prints: evaluating, "msg", evaluating, "msg", returns 42

// By-need: evaluate once, cache (memoize)
def traceOnce[A](msg: => String)(value: A): A =
  lazy val m = msg                         // evaluated once, cached
  println(m)
  println(m)
  value

traceOnce({ println("evaluating"); "msg" })(42)
// Prints: evaluating, "msg", "msg", returns 42

// ❌ ANTI-PATTERN: by-name in a loop — O(n) re-evaluation
def retry[T](max: Int)(op: => T): T =
  var attempt = 0
  while attempt < max do
    try return op                          // op re-evaluated each iteration (correct here)
    catch case e if attempt < max - 1 => attempt += 1
  throw new RuntimeException("exhausted retries")

// ✅ CORRECT for parameter validation: by-name with lazy for expensive defaults
def loadConfig(path: => String = defaultPath()): Config =
  lazy val p = path                        // evaluate once even if referenced multiple times
  Using.resource(io.Source.fromFile(p)) { _.mkString }
```
::

## Tail Recursion — `@tailrec` & Loop Desugaring

::code-wrapper{language="scala"}
```scala
import scala.annotation.tailrec

// @tailrec: compiler verifies the recursive call is in tail position.
// If NOT tail-recursive → COMPILE ERROR (not a warning).
// Tail calls are rewritten to a while loop → no stack frame growth, O(1) stack.

@tailrec
def sumTo(n: Int, acc: Long = 0): Long =
  if n <= 0 then acc else sumTo(n - 1, acc + n)  // tail call → rewritten to loop

// ❌ NOT tail-recursive — the multiplication happens AFTER the recursive call returns
def factorial(n: Int): Long =
  if n <= 1 then 1 else n * factorial(n - 1)     // n * (result of recursion) — NOT tail position
// @tailrec on this → COMPILE ERROR: "not in tail position"

// ✅ Tail-recursive factorial with accumulator
@tailrec
def factorial(n: Int, acc: Long = 1): Long =
  if n <= 1 then acc else factorial(n - 1, acc * n)

// Mutually recursive: @tailrec does NOT work across functions
// → Use a loop with a state machine, or trampoline (TailRec from Cats)
def trampoline[T](f: () => Either[() => T, T]): T =
  @tailrec
  def loop(current: () => Either[() => T, T]): T =
    current() match
      case Left(next) => loop(next)        // tail call within loop — OK
      case Right(result) => result
  loop(f)
```
::

## Partial Functions — `PartialFunction[A, B]`

::code-wrapper{language="scala"}
```scala
// PartialFunction: defined only for a subset of inputs.
// Has isDefinedAt(x: A): Boolean + apply(x: A): B
// Used in collect, actor receive, route definitions.

val parseStatus: PartialFunction[Int, String] =
  case 200 => "OK"
  case 404 => "Not Found"
  case 500 | 502 | 503 => "Server Error"

parseStatus(200)                          // → "OK"
parseStatus.isDefinedAt(404)              // → true
parseStatus.isDefinedAt(418)              // → false

// collect = filter + map in one pass (only processes defined elements)
List(200, 404, 418, 500).collect(parseStatus)  // → List("OK", "Not Found", "Server Error")

// Compose partial functions: orElse (fallback), andThen (chaining)
val httpOnly: PartialFunction[Int, String] =
  case c if c / 100 == 4 || c / 100 == 5 => "HTTP Error"
val all = parseStatus.orElse(httpOnly).orElse { case _ => "Unknown" }

// Real-world: Akka/Pekko actor receive is a PartialFunction[Any, Unit]
val receive: PartialFunction[Any, Unit] =
  case "ping" => sender ! "pong"
  case n: Int if n > 0 => process(n)
  case _ => // ignore
```
::

## For-Comprehension — Desugared to `flatMap` / `map` / `filter`

::code-wrapper{language="scala"}
```scala
// For-comprehension is NOT a loop — it's syntactic sugar for flatMap/map/withFilter
// Works on ANY type with these methods (List, Option, Future, Try, IO, etc.)

for
  x <- List(1, 2, 3)                      // generator → flatMap
  if x % 2 == 0                           // guard   → withFilter
  y = x * x                               // binding → map (assigns intermediate)
  z <- List(y, y + 1)                     // generator → flatMap
yield (x, y, z)

// Exact desugaring (what the compiler generates):
List(1, 2, 3)
  .withFilter(_ % 2 == 0)
  .flatMap { x =>
    val y = x * x                         // binding becomes a map to pair (x, y)
    List(y, y + 1).map { z => (x, y, z) }
  }
// → List((2, 4, 4), (2, 4, 5))

// Monadic chaining across Option:
def compute(a: Option[Int], b: Option[Int]): Option[Int] =
  for
    x <- a                                // if a is None → entire comprehension is None
    y <- b                                // if b is None → short-circuits to None
    if x + y > 0                          // guard
  yield x + y                             // map

// Equivalent:
a.flatMap(x => b.withFilter(y => x + y > 0).map(y => x + y))
```
::

## Extension Methods — Compile-Time Injection

::code-wrapper{language="scala"}
```scala
// Extension methods in Scala 3 — no implicit conversion overhead
extension (s: String)
  def slug: String = s.toLowerCase.replaceAll("[^a-z0-9]+", "-").stripSuffix("-")
  def truncate(max: Int): String = if s.length <= max then s else s.take(max - 1) + "…"

"Hello World!!".slug                      // → "hello-world"
"A very long string here".truncate(10)    // → "A very lon…"

// Extension on generic type with context bound:
extension [A](list: List[A])
  def freqMap: Map[A, Int] = list.groupMapReduce(identity)(_ => 1)(_ + _)

List("a", "b", "a", "c", "a").freqMap     // → Map("a" -> 3, "b" -> 1, "c" -> 1)

// Extension compiles to a static method with the receiver as first param.
// "Hello".slug → StringExt$.MODULE$.slug$extension("Hello")
// No wrapper object, no implicit conversion — zero runtime cost.
```
::

## 💡 Tips & Tricks

**Eta-expansion for method-to-function**: `def f(x: Int) = x * 2` → `f _` or just `f` (Scala 3) converts to `Int => Int`. One `Function1` allocation.

**`inline` for zero-cost higher-order functions**: Scala 3 `inline def` eliminates the lambda allocation entirely — the function body is spliced at the call site.

::code-wrapper{language="scala"}
```scala
inline def mapInRange(start: Int, end: Int)(inline f: Int => Int): List[Int] =
  var i = start
  var acc = List.empty[Int]
  while i <= end do
    acc = f(i) :: acc                      // f is inlined here — NO lambda object
    i += 1
  acc.reverse
// mapInRange(1, 5)(_ * 2) → the while loop with `i * 2` inlined, zero Function1 allocation
```
::

**`Function1` composition avoids intermediate collections**: `(f andThen g andThen h)(list)` when combined with `list.map` fuses into a single pass if the functions are `@inline`.

## ⚠️ Edge Cases & Gotchas

**Closure captures `var` by reference, not value**: If you mutate the captured var after creating the closure, the closure sees the new value. This is the source of classic loop-capture bugs.

::code-wrapper{language="scala"}
```scala
var x = 0
val closures = (1 to 3).map { i =>
  () => (x, i)                             // captures x (the var) and i (the val)
}
x = 99
closures.map(_())                          // → List((99,1), (99,2), (99,3)) — x is 99 everywhere!
// i is fine — it's a loop val, each iteration gets its own binding
```
::

**`@tailrec` fails on try/catch**: A `try` block prevents tail-call optimization because the exception handler needs the stack frame. Use `Either`/`Try` instead of try/catch inside recursive functions.

**Default parameter values are evaluated at call time, not definition time**: Unlike Python (which evaluates defaults once at def time), Scala re-evaluates defaults on each call. So `def f(buf: List[Int] = List())` is safe — no shared mutable default.

## 🧠 Quick Quiz

Why does `List(1,2,3).map(println).map(_ * 2)` print three numbers but the result is `List((), (), ())`?

<details>
<summary>Answer</summary>

`println` returns `Unit`. So `List(1,2,3).map(println)` produces `List((), (), ())` — it prints each number (side effect) but the elements are now `Unit`. The second `.map(_ * 2)` will fail to compile because `Unit` has no `*` method.

If this compiled (e.g., with `Any` typing), the result would be `List((), (), ())` — the `_ * 2` is never reached because `Unit` doesn't support `*`.

**Lesson**: `map` is for transforming values, not side effects. Use `foreach` for side effects: `List(1,2,3).foreach(println)`.
</details>