---
title: Scala — Type System: Variance, Bounds, Givens & Phantom Types
description: Deep-dive into Scala 3's type system — variance annotations and their constraints, upper/lower bounds, context abstractions (given/using), type classes, higher-kinded types, phantom types for compile-time state machines, and match types.
---

# 08 — Type System: Variance, Bounds, Givens & Phantom Types

## Variance — The Subtyping of Generics

::code-wrapper{language="scala"}
```scala
// Variance controls whether C[Sub] is a subtype of C[Super].

// INVARIANT [T] (default): C[Sub] is NOT a subtype of C[Super]
//   Safe: can read AND write T. Used for mutable collections.
class MutableBox[T](var value: T)
// MutableBox[Dog] is NOT a MutableBox[Animal] — adding a Cat would corrupt it.

// COVARIANT [+T]: if Sub <: Super, then C[Sub] <: C[Super]
//   Safe: can only READ T (produce/return), never write (consume/accept).
//   Used for immutable collections, producers, return types.
class ImmutableList[+T]                                  // List[Dog] <: List[Animal] ✅
// ImmutableList[Dog].head: Animal ← safe, a Dog IS an Animal
// Cannot have def append(t: T) — would allow adding Cat to List[Dog]

// CONTRAVARIANT [-T]: if Sub <: Super, then C[Super] <: C[Sub] (INVERTED)
//   Safe: can only WRITE T (consume/accept), never read (produce/return).
//   Used for consumers, function parameters, comparators.
trait Comparator[-T]:
  def compare(a: T, b: T): Int
// Comparator[Animal] <: Comparator[Dog] ← safe, comparing Dogs as Animals is fine
// A function Animal => String is a subtype of Dog => String:
val f: Animal => String = a => a.name
val g: Dog => String = f                  // OK! Function1 is contravariant in its parameter

// The variance positions rule (the "in/out" rule):
//   +T: T can appear in RETURN positions (out), never in parameter positions (in)
//   -T: T can appear in PARAMETER positions (in), never in return positions (out)
//    T: T can appear anywhere (both in and out)
```
::

## Variance Constraints — The Lower Bound Trick

::code-wrapper{language="scala"}
```scala
// Problem: covariant List[+T] needs a "prepend" method, but prepend takes T as a
// parameter (contravariant position) — conflicts with +T variance.
//
// Solution: lower bound on the type parameter
class MyList[+T]:
  // def prepend(t: T): MyList[T]  ← COMPILE ERROR: covariant T in contravariant position
  def prepend[U >: T](u: U): MyList[U] = ???  // ✅ U is a supertype of T, T appears in covariant position

// When you prepend a Cat to a MyList[Dog]:
//   U = LUB(Cat, Dog) = Animal
//   Result: MyList[Animal]
// This is EXACTLY how List's :: works — it widens the element type as needed.

val dogs: MyList[Dog] = MyList(dog1, dog2)
val animals: MyList[Animal] = dogs.prepend(cat1)  // U=Animal, returns MyList[Animal]

// ❌ ANTI-PATTERN: making a mutable collection covariant
// class MutList[+T](var head: T)  ← COMPILE ERROR: covariant T in var (contravariant position)
// Because var generates both getter (covariant) AND setter (contravariant) — conflicting.
```
::

## Type Classes with `given` / `using` — Scala 3

::code-wrapper{language="scala"}
```scala
// Type class: a trait parameterized by a type, with instances provided via 'given'.
// This is ad-hoc polymorphism — different behavior per type, without inheritance.

trait Show[T]:
  extension (t: T) def show: String

trait Eq[T]:
  extension (t: T) def ===(other: T): Boolean

// Instances — provided as 'given' values, resolved by the compiler via 'using'
given Show[Int] with
  extension (t: Int) def show: String = s"Int($t)"

given Show[String] with
  extension (t: String) def show: String = s""""$t""""

given Show[Boolean] with
  extension (t: Boolean) def show: String = t.toString

// Usage — 'using' parameter is resolved automatically from the given scope
def printAll[T](values: List[T])(using s: Show[T]): Unit =
  values.foreach(v => println(s.show(v)))  // or: v.show (extension method via the given)

printAll(List(1, 2, 3))                     // → Int(1), Int(2), Int(3) — Show[Int] resolved
printAll(List("a", "b"))                    // → "a", "b" — Show[String] resolved

// Context-bound sugar: [T: Show] means (using Show[T])
def serialize[T: Show](t: T): String = summon[Show[T]].show(t)
// summon[Show[T]] retrieves the given instance from scope
```
::

## Type Class Instance Resolution — Priority & Scope

::code-wrapper{language="scala"}
```scala
// Given instances are resolved by the compiler in this priority order:
//   1. Explicitly passed: f(using myInstance)
//   2. Local given in the current scope
//   3. Given in the companion object of the type class (Show)
//   4. Given in the companion object of the type (Show[Int] in Int's companion — can't do for Int)
//   5. Imported givings: import MyGivens.*

// Ambiguous givens → compile error
given Show[Int] with extension (t: Int) def show = t.toString
given Show[Int] with extension (t: Int) def show = s"int=$t"
// serialize(42) → ERROR: ambiguous givens: both Show[Int] instances match

// Organize givens in companion objects for automatic availability:
object Show:
  given Show[Int] with extension (t: Int) def show = t.toString
  given Show[String] with extension (t: String) def show = s""""$t""""
  given [T: Show] => Show[List[T]] with           // conditional instance — needs Show[T]
    extension (list: List[T]) def show =
      list.map(_.show).mkString("[", ",", "]")

// Now Show[List[Int]] is auto-derived from Show[Int] — no manual instance needed
serialize(List(1, 2, 3))                   // → "[1,2,3]"
```
::

## Higher-Kinded Types — `F[_]`

::code-wrapper{language="scala"}
```scala
// Higher-kinded type: a type constructor that takes a type parameter.
// List is * → * (takes one type, produces one type). List[Int] is a concrete type.

// Functor: a type class for things you can map over
trait Functor[F[_]]:
  extension [A](fa: F[A]) def map[B](f: A => B): F[B]

given Functor[List] with
  extension [A](fa: List[A]) def map[B](f: A => B): List[B] = fa.map(f)

given Functor[Option] with
  extension [A](fa: Option[A]) def map[B](f: A => B): Option[B] = fa.map(f)

// Usage: works on ANY functor, regardless of concrete type
def doubleAll[F[_]: Functor](fa: F[Int]): F[Int] = fa.map(_ * 2)
doubleAll(List(1, 2, 3))                    // → List(2, 4, 6)
doubleAll(Some(42))                         // → Some(84)
doubleAll(None)                             // → None

// Monad: extends Functor with flatMap (sequencing)
trait Monad[F[_]] extends Functor[F]:
  extension [A](fa: F[A])
    def flatMap[B](f: A => F[B]): F[B]
    def map[B](f: A => B): F[B] = flatMap(a => pure(f(a)))
  def pure[A](a: A): F[A]

given Monad[Option] with
  extension [A](fa: Option[A])
    def flatMap[B](f: A => Option[B]): Option[B] = fa.flatMap(f)
  def pure[A](a: A): Option[A] = Some(a)

// Generic monadic computation — works for Option, List, Future, IO, etc.
def compose[F[_]: Monad, A, B, C](f: A => F[B], g: B => F[C])(a: A): F[C] =
  f(a).flatMap(g)                           // no knowledge of F's concrete type
```
::

## Phantom Types — Compile-Time State Machines

::code-wrapper{language="scala"}
```scala
// Phantom types: type parameters that exist only at compile time, erased at runtime.
// Used to encode state transitions in the type system — invalid transitions don't compile.

sealed trait ConnectionState
object ConnectionState:
  trait Disconnected extends ConnectionState
  trait Connecting extends ConnectionState
  trait Connected extends ConnectionState
  trait Closed extends ConnectionState

// The type parameter [S] is phantom — it never appears in fields.
// It exists ONLY to track state at compile time.
final class Connection[S <: ConnectionState] private (val host: String, val port: Int):
  // State transitions encoded in return types
  def connect()(using S <:< ConnectionState.Disconnected): Connection[ConnectionState.Connecting] =
    new Connection[ConnectionState.Connecting](host, port)  // runtime: same object, new phantom type

  def waitForConnection()(using S <:< ConnectionState.Connecting): Connection[ConnectionState.Connected] =
    new Connection[ConnectionState.Connected](host, port)

  def disconnect()(using S <:< ConnectionState.Connected): Connection[ConnectionState.Disconnected] =
    new Connection[ConnectionState.Disconnected](host, port)

  def close()(using S <:< ConnectionState.Disconnected): Connection[ConnectionState.Closed] =
    new Connection[ConnectionState.Closed](host, port)

object Connection:
  def create(host: String, port: Int): Connection[ConnectionState.Disconnected] =
    new Connection[ConnectionState.Disconnected](host, port)

// Usage — invalid transitions DON'T COMPILE:
val conn = Connection.create("api.x.com", 443)  // Connection[Disconnected]
// conn.disconnect()  // ERROR: not in Connected state
val connecting = conn.connect()                   // Connection[Connecting]
// connecting.connect()  // ERROR: not in Disconnected state
val connected = connecting.waitForConnection()    // Connection[Connected]
val disconnected = connected.disconnect()         // Connection[Disconnected]
val closed = disconnected.close()                 // Connection[Closed]
// closed.connect()  // ERROR: not in Disconnected state (it's Closed)

// Runtime cost: ZERO. The type parameter [S] is erased — no field stores it.
// The `<:<` evidence parameter is a `null` at runtime (optimized away by the compiler).
```
::

## Opaque Types — Zero-Cost Type Aliases

::code-wrapper{language="scala"}
```scala
// opaque type: a type alias that's ONLY visible inside its defining object.
// Outside the object, it's a distinct type — the compiler prevents mixing it with the underlying type.

object AccountId:
  opaque type AccountId = Long              // outside: AccountId is its own type
  def apply(l: Long): AccountId = l         // smart constructor
  extension (id: AccountId) def value: Long = id  // accessor (only works if in scope)

object UserId:
  opaque type UserId = Long
  def apply(l: Long): UserId = l
  extension (id: UserId) def value: Long = id

// At runtime: AccountId and UserId are both just `long` — zero overhead.
// At compile time: they're distinct types.
val acct: AccountId = AccountId(42)
val user: UserId = UserId(42)
// acct == user  // COMPILE ERROR: different types, even though both are Long at runtime
// acct + 1      // COMPILE ERROR: AccountId has no + method (no extension defined)

// This replaces value classes (AnyVal) for primitive wrappers — no boxing, no wrapper object.
```
::

## Match Types — Compile-Time Type-Level Computation

::code-wrapper{language="scala"}
```scala
// Match types: pattern match on types at the TYPE level, evaluated by the compiler.
// This is type-level programming — the "result" is a type, computed at compile time.

// Type-level boolean
type Bool = true | false
type Not[B <: Boolean] = B match
  case true  => false
  case false => true
// Not[true] → false (computed by compiler, not runtime)

// Type-level list operations
type Size[T <: Tuple] <: Int = T match
  case EmptyTuple => 0
  case _ *: tail => 1 + Size[tail]          // recursive match type

summon[Size[(Int, String, Boolean)] =:= 3]  // compiles: compiler computed 3

// Type-level serialization — choose a representation per type
type WireFormat[T] = T match
  case Int       => Int
  case Long      => Long
  case String    => String
  case Boolean   => Boolean
  case Option[t] => Option[WireFormat[t]]
  case List[t]   => Array[WireFormat[t]]    // List[Int] → Array[Int] (no boxing!)

// The compiler reduces WireFormat[List[Option[Int]]] to Array[Option[Int]]
// This is how libraries like Magnolia derive type classes generically.
```
::

## Type Projections & Dependent Types

::code-wrapper{language="scala"}
```scala
// Path-dependent type: a type that depends on a value (instance)
class Repository:
  type Entity                            // abstract type member
  def get(id: Long): Option[Entity]
  def save(e: Entity): Long

class UserRepo extends Repository:
  type Entity = User                     // concrete: Entity is User
  def get(id: Long): Option[User] = ???
  def save(e: User): Long = ???

class OrderRepo extends Repository:
  type Entity = Order                    // concrete: Entity is Order
  def get(id: Long): Option[Order] = ???
  def save(e: Order): Long = ???

// The type repo.Entity depends on which repo instance you use
def transfer(from: Repository, to: Repository)(e: from.Entity): to.Entity = ???
// from.Entity and to.Entity are different types — can't mix them.
// This prevents passing a User to an OrderRepo — type-safe at compile time.
```
::

## 💡 Tips & Tricks

**`summon[T]` to verify type evidence at compile time**: `summon[T =:= U]` succeeds only if T and U are the same type — use for compile-time assertions.

::code-wrapper{language="scala"}
```scala
summon[Int =:= Int]                        // compiles (evidence exists)
// summon[Int =:= String]                  // compile error (no evidence)
```
::

**`<:<` for safe downcasts**: `def f(x: Any)(using ev: x.type <:< String)` — only callable when the compiler can prove the type relationship.

**Given instances in companion objects for automatic availability**: Place `given` instances in the companion of the type class — they're always in scope without imports.

## ⚠️ Edge Cases & Gotchas

**Variance and arrays**: Scala `Array[T]` is INVARIANT (unlike Java's covariant arrays). This prevents `ArrayStoreException` at compile time — a deliberate fix.

**Type erasure breaks pattern matching on generics**: `case x: List[Int]` and `case x: List[String]` match the SAME thing at runtime (both are `List`). Use `ClassTag` or `TypeTest` for reified type checks.

**`given` ambiguity is a compile error, not a runtime error**: Two givens of the same type in scope → the compiler refuses to pick. Unlike implicit resolution in Scala 2 (which sometimes picked "more specific"), Scala 3 requires explicit disambiguation.

**Phantom types increase type complexity**: Overuse makes signatures hard to read. Use for genuine state-machine constraints (connection states, builder phases), not for trivial distinctions.

## 🧠 Quick Quiz

Why does `List[Any]` accept `List[Int]`, `List[String]`, etc., but `Array[Any]` does NOT accept `Array[Int]`?

<details>
<summary>Answer</summary>

- `List` is covariant (`List[+T]`). `List[Int] <: List[Any]` because `Int <: Any`. This is safe because `List` is immutable — you can't add a `String` to a `List[Int]` (it returns a new `List`, the original is unchanged).
- `Array` is invariant (`Array[T]`). `Array[Int]` is NOT a subtype of `Array[Any]`. This is safe because `Array` is mutable — if `Array[Int]` were a subtype of `Array[Any]`, you could do `val anyArr: Array[Any] = intArr; anyArr(0) = "string"` — a `String` in an `int[]` would be an `ArrayStoreException` at runtime.

Scala learned from Java's mistake (Java arrays are covariant and DO throw `ArrayStoreException` at runtime). Scala's invariant arrays prevent this at compile time.
</details>