---
title: Scala — Value Semantics, Type Hierarchy & Memory Model
description: Deep-dive into val/var/lazy val initialization, primitive boxing, AnyVal/AnyRef hierarchy, specialization, and zero-cost value classes in Scala 3.
---

# 02 — Value Semantics, Type Hierarchy & Memory Model

## `val` / `var` / `lazy val` — Initialization Semantics

::code-wrapper{language="scala"}
```scala
// val: final field, initialized at construction, stored on heap as object field
//      For local vals: stored on stack (no heap allocation if not captured)
final val MAX_CONNECTIONS = 100           // → inlined as literal 100 at use sites
                                         //   (final val of literal type = compile-time constant)
val connectionTimeout = 5000              // → field + getter; not inlined

// var: volatile? no. Just a mutable field with getter+setter.
//      NOT thread-safe — no happens-before guarantee, no atomicity.
@volatile var running = true              // @volatile adds JMM visibility (no reorder across)
                                         //   but NOT atomicity for compound ops (x += 1 is racy)

// lazy val: double-checked locking under the hood
//   → private volatile bitmap field; first access computes & caches
//   → Thread-safe but first-access contended; allocation on every lazy val
//   → SCALA 2: synchronization on the enclosing object (coarse lock — contention!)
//   → SCALA 3: fine-grained per-field DCL pattern (less contention)
lazy val heavyConfig = parseConfig()     // first access: parseConfig() runs, cached
                                         // subsequent: direct field read (volatile read only)
```
::

### Anti-Pattern: `lazy val` Inside Hot Path

::code-wrapper{language="scala"}
```scala
// ❌ WRONG — lazy val allocates a bitmap slot + volatile read on EVERY call
def process(items: List[Int]): Int =
  lazy val hasher = new XXHash64()        // bitmap check on every invocation
  items.foldLeft(0)((acc, n) => hasher.update(n))  // hasher init: DCL overhead

// ✅ CORRECT — pre-allocate, reuse, no per-call lazy machinery
def process(items: List[Int]): Int =
  val hasher = new XXHash64()             // stack-allocated reference (JIT scalar-replacement)
  items.foldLeft(0)((acc, n) => hasher.update(n))
```
::

## Primitive Boxing & Specialization

::code-wrapper{language="scala"}
```scala
// Scala primitives (Int, Long, Double, etc.) compile to JVM primitives in most contexts:
val x: Int = 42                           // → ILOAD/ISTORE (no boxing)
val arr = new Array[Int](1000)            // → int[] (primitive array, contiguous memory)

// BUT: generics box. List[Int] → List[java.lang.Integer] at runtime (type erasure).
val nums: List[Int] = List(1, 2, 3)       // each Int boxed to Integer → 3 heap allocations

// @specialized — generate monomorphic versions for primitive types to avoid boxing
// Scala 2 only (Scala 3 uses transparent inline match / opaque types instead)
trait Min[@specialized(Int, Long, Double) T]:
  def min(a: T, b: T): T
// Compiler generates Min$mc$I$sp, Min$mc$J$sp, Min$mc$D$sp — no boxing for Int/Long/Double

// Scala 3 approach — opaque types for zero-cost newtype wrappers:
object Meter:
  opaque type Meter = Double              // compile-time: Meter; runtime: just double
  def apply(d: Double): Meter = d         // zero allocation, zero boxing
  extension (m: Meter) def toFeet: Double = m * 3.28084

val depth: Meter = Meter(10.0)            // runtime: just a double on the stack
// depth * 2  ← compile error: Meter has no * operator — type-safe!
Meter(10.0).toFeet                        // → 32.8084 (no runtime Meter object)
```
::

## Numeric Types — Precision & Overflow

::code-wrapper{language="scala"}
```scala
// JVM primitive sizes — same as Java, no surprises
val b: Byte = 127                         // 8-bit signed: -128..127
val s: Short = 32767                      // 16-bit signed
val i: Int = 2147483647                   // 32-bit signed
val l: Long = 9223372036854775807L        // 64-bit signed
val f: Float = 3.14f                      // 32-bit IEEE 754
val d: Double = 3.14                      // 64-bit IEEE 754

// Silent overflow — no exception, wraps around (JVM semantics)
val overflowed: Int = 2147483647 + 1      // → -2147483648 (two's complement wrap)

// BigInt / BigDecimal — arbitrary precision, heap-allocated, immutable
val huge = BigInt("999999999999999999999")
val precise = BigDecimal("0.1") + BigDecimal("0.2")  // → 0.3 (exact, not 0.30000000000000004)
// Internally wraps java.math.BigInteger / java.math.BigDecimal
// Every arithmetic op allocates a new BigInt — avoid in hot loops

// Safe arithmetic with overflow detection (Scala doesn't have built-in;
// use Math.addExact etc. from Java):
import scala.util.Try
def safeAdd(a: Int, b: Int): Try[Int] = Try(java.lang.Math.addExact(a, b))
safeAdd(Int.MaxValue, 1)                  // Failure(ArithmeticException: integer overflow)
```
::

## Floating-Point — IEEE 754 Gotchas

::code-wrapper{language="scala"}
```scala
// NaN is NOT equal to itself — the #1 floating-point trap
val nan = 0.0 / 0.0                       // → NaN
nan == nan                                // → false (!!)
nan.isNaN                                 // → true (always use isNaN for NaN checks)

// -0.0 vs 0.0
(-0.0) == 0.0                             // → true (IEEE says they're equal)
1.0 / (-0.0)                              // → -Infinity (sign matters for division)
java.lang.Double.compare(-0.0, 0.0) != 0  // → true (compare distinguishes them)

// 0.1 + 0.2 ≠ 0.3 — binary representation of 0.1 is inexact
0.1 + 0.2 == 0.3                          // → false
BigDecimal("0.1") + BigDecimal("0.2") == BigDecimal("0.3")  // → true

// Epsilon comparison for float equality:
def approxEq(a: Double, b: Double, eps: Double = 1e-9): Boolean =
  math.abs(a - b) < eps                   // works for normal values, NOT for NaN/Inf
approxEq(0.1 + 0.2, 0.3)                  // → true
```
::

## Type Hierarchy — `Any` → `AnyVal` / `AnyRef`

::code-wrapper{language="text"}
```text
                              Any
                 ┌─────────────┴──────────────┐
               AnyVal                       AnyRef
          (value types)               (reference types = java.lang.Object)
    ┌───┬───┬───┬───┬───┬───┐           ┌─────┴─────┐
   Int Long Double Float Char Byte    String   user classes
    Boolean Unit                                 (all extend AnyRef)
    
    Null  ←─ extends all AnyRef types (can be assigned to any reference)
    Nothing ←─ extends ALL types (bottom type — function never returns)
```

::code-wrapper{language="scala"}
```scala
// Unit = "no meaningful value" — corresponds to Java's void but IS a type
def log(msg: String): Unit = println(msg)  // → returns scala.runtime.BoxedUnit, a singleton
val u: Unit = ()                           // () is the sole Unit value (BoxedUnit.INSTANCE)

// Nothing — the bottom type. A function returning Nothing never returns normally.
def fail(msg: String): Nothing = throw new Exception(msg)  // Nothing is subtype of EVERY type
def uncheckedDefault[T]: T = ???           // ??? = Predef.??? → throws NotImplementedError

// Null — the type of null. Subtype of all AnyRef types (NOT AnyVal in Scala 3!)
val x: String = null                       // OK: Null <: String
// val y: Int = null                        // ERROR in Scala 3: Null is not a subtype of Int

// Scala 3 explicit null: with -explicitNulls flag, T no longer includes null
//   → must write T | Null for nullable references. Forces null-safety at type level.
```
::

## Value Classes — Zero-Cost Wrappers

::code-wrapper{language="scala"}
```scala
// `AnyVal` subclass with single val field → inlined at use sites, zero runtime allocation
final class UserId(val value: Long) extends AnyVal:
  override def toString = s"UserId($value)"

final class EmailAddress private (val value: String) extends AnyVal:
  def domain: String = value.dropWhile(_ != '@').tail

object EmailAddress:
  def from(s: String): Option[EmailAddress] =
    if s.matches("^[^@]+@[^@]+\\.[^@]+$") then Some(new EmailAddress(s))
    else None

// At runtime: UserId is just a long — no wrapper object on heap
// BUT: value classes box when used in:
//   - generic collections (List[UserId] → List[Object])
//   - stored in Option (Some(userId) → boxes)
//   - passed to generic methods
//   - used as array element (Array[UserId] → Object[])
```
::

## Tuples — Product Types & Allocation

::code-wrapper{language="scala"}
```scala
// Tuples are Product1..Product22 — each is a case class with _1, _2, ... fields
val pair = (1, "hello")                   // → scala.Tuple2[Int, String] = new Tuple2(1, "hello")
pair._1                                   // → 1 (field access, no allocation)
pair(0)                                   // → 1 (Scala 3: index access, still field access)

// Scala 3 tuple type arithmetic at compile time:
type T1 = (Int, String, Boolean)
type Head = T1.Head                       // → Int (computed by the compiler, not runtime)
type Tail = T1.Tail                       // → (String, Boolean)
type Concat = T1 *: (Double, Long)        // → (Int, String, Boolean, Double, Long)

// Destructuring compiles to field access, not pattern matching:
val (id, name) = (42, "Alice")            // → val id = pair._1; val name = pair._2

// ❌ AVOID: creating tuples in hot loops — each tuple is a heap allocation
// ✅ PREFER: case classes (also allocate, but clearer) or opaque types for primitives
case class Hit(id: Long, score: Double)   // 1 allocation, but readable + pattern-matchable
```
::

## `Option[T]` — Null Safety Without Null

::code-wrapper{language="scala"}
```scala
// Option is a sealed abstract type:
//   sealed abstract class Option[+T]
//   final case class Some[+T](value: T) extends Option[T]
//   case object None extends Option[Nothing]
//
// Some(value) → 1 allocation (Some is a case class)
// None        → singleton, zero allocation (just a reference)

// Option.apply — converts nullable Java return to Option (null-safe)
def findUser(id: Long): Option[User] = Option(userDao.findById(id))
//   userDao returns null → Option(null) = None (no NPE)
//   userDao returns User → Option(user) = Some(user)

// Chaining with for-comprehension desugars to flatMap/map:
for
  user <- findUser(42)
  email <- user.email           // email is Option[String]
yield email
// Desugars to:
//   findUser(42).flatMap(user => user.email.map(email => email))

// Anti-pattern: using .get on Option
//   someValue.get     // throws NoSuchElementException if None
//   someValue.getOrElse(default)   // ✅ safe
//   someValue.orElse(computeOther) // ✅ fallback to another Option
```
::

## 💡 Tips & Tricks

**`final val` for compile-time constants**: When the RHS is a literal, the compiler inlines it at every use site — no field read, no bytecode for the val.

::code-wrapper{language="scala"}
```scala
final val BUFFER_SIZE = 4096              // inlined as 4096 literal at every use
val bufferSize = 4096                     // NOT inlined — field read at each use
```
::

**`opaque type` for zero-cost domain types**: Replace value classes with opaque types in Scala 3 — no wrapper, no boxing, full type safety.

::code-wrapper{language="scala"}
```scala
object Quantities:
  opaque type Kelvin = Double
  opaque type Celsius = Double
  def kelvin(d: Double): Kelvin = d
  def celsius(d: Double): Celsius = d
  extension (k: Kelvin) def toCelsius: Celsius = celsius(k - 273.15)

val temp: Kelvin = Quantities.kelvin(300.0)  // runtime: just 300.0 (double on stack)
// val wrong: Celsius = temp                 // compile error — type-safe!
```
::

**`@targetName` for interop**: Control the JVM-level method name to avoid collisions or to match Java conventions.

## ⚠️ Edge Cases & Gotchas

**`lazy val` + circular dependency = deadlock**: If `lazy val a` depends on `lazy val b` and vice versa, the first access deadlocks (Scala 2: synchronized on object; Scala 3: per-field lock but still deadlockable).

**`val` in `trait` = abstract override complexity**: A `val` in a trait is an abstract field. If a class initializes it, trait linearization determines initialization order — subtle NPEs if order is wrong.

::code-wrapper{language="scala"}
```scala
trait Base:
  val name: String                         // abstract — no value yet
  val greeting = s"Hello, $name"           // NPE risk! name may be null during init

class Impl extends Base:
  override val name = "Alice"              // order: Base.greeting init BEFORE name set → NPE
// Fix: use 'lazy val greeting' or 'def greeting' or early-init:
class ImplSafe extends Base:
  override val name = "Alice"              // field init order: name first if declared before super
```
::

**`Int` overflow in `Range`**: `(1 to Int.MaxValue)` can overflow internally. Use `BigInt` ranges for extreme values.

**`Char` is NOT a `String`**: `'a'` is `Char` (16-bit UTF-16), `"a"` is `String`. `s"$c"` boxes `c` to `Character` then calls `toString` — avoid in hot paths; use `String.valueOf(c)`.

## 🧠 Quick Quiz

What's the runtime difference between `List[Int](1,2,3).map(_ * 2)` and `Array[Int](1,2,3).map(_ * 2)`?

<details>
<summary>Answer</summary>

- `List[Int].map(_ * 2)`: Each `Int` is boxed to `Integer` (generic `List` erases to `List[Object]`). The lambda allocates a `Function1` object. Result: 3 `Integer` boxes + 1 lambda + 3 new `::` cons cells.
- `Array[Int].map(_ * 2)`: `Array[Int]` is a primitive `int[]` at runtime. The `map` specialization on `Array[Int]` uses `while` loops with `Int` primitives — zero boxing. Result: 1 new `int[]` + 1 lambda allocation.

For hot-path numeric code, always prefer `Array[Int]` / `Array[Double]` over `List[Int]` / `Vector[Int]`.
</details>