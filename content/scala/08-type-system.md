# 08 — Type System

## Generics (Type Parameters)

Define functions and classes that work with multiple types:

::code-wrapper{language="scala"}
```scala
// Generic function
def identity[A](x: A): A = x

identity(42)                // Int
identity("hello")           // String

// Generic class
class Box[T](value: T) {
  def get: T = value
  def set(v: T): Unit = { /* update */ }
}

val intBox: Box[Int] = Box(42)
val strBox: Box[String] = Box("hello")

// Multiple type parameters
def swap[A, B](pair: (A, B)): (B, A) = (pair._2, pair._1)

swap((1, "hello"))          // ("hello", 1)
```
::

## Type Bounds

Constrain type parameters:

::code-wrapper{language="scala"}
```scala
// Upper bound: T must be subtype of Number
def process[T <: Number](x: T): String = s"Number: $x"

process(5)                  // OK (Int extends Number)
process("str")              // ERROR

// Lower bound: T must be supertype of String
def fill[T >: String](x: T): Unit = { }

// Multiple bounds (not recommended; use trait instead)
def compare[T <: Comparable[T]](a: T, b: T): Int = a.compareTo(b)
```
::

## Variance

Control how generic types relate to subtyping:

::code-wrapper{language="scala"}
```scala
// Invariant (default): List[Dog] is NOT a List[Animal]
val dogList: List[Dog] = List(Dog("Buddy"))
val animalList: List[Animal] = dogList  // ERROR

// Covariant: if Dog <: Animal then List[Dog] <: List[Animal]
class CoList[+T](val head: T, val tail: CoList[T])

val dogCoList: CoList[Dog] = CoList(Dog("Buddy"), null)
val animalCoList: CoList[Animal] = dogCoList  // OK

// Contravariant: if Dog <: Animal then Function[Animal] <: Function[Dog]
trait Comparator[-T] {
  def compare(a: T, b: T): Int
}

val animalComparator: Comparator[Animal] = new Comparator[Animal] {
  def compare(a: Animal, b: Animal) = 0
}
val dogComparator: Comparator[Dog] = animalComparator  // OK
```
::

## Type Aliases

Define shortcuts for complex types:

::code-wrapper{language="scala"}
```scala
type UserMap = Map[String, User]
type Predicate[T] = T => Boolean
type Config = Map[String, String]

val users: UserMap = Map()
val isEven: Predicate[Int] = _ % 2 == 0
val cfg: Config = Map("host" -> "localhost")

// Useful for large generic types
type UserResult = Either[String, User]

def getUser(id: Int): UserResult = Right(User(id, "Alice"))
```
::

## Implicit Parameters

Scala automatically injects implicit parameters:

::code-wrapper{language="scala"}
```scala
// Define implicit value
implicit val doubleFormat: String = "%.2f"

// Function with implicit parameter
def format(value: Double)(implicit fmt: String): String = {
  String.format(fmt, value)
}

// Scala automatically passes doubleFormat
format(3.14159)             // "3.14"

// Can override explicitly
format(3.14159)("%.4f")     // "3.1416"
```
::

### Implicit conversions (Use with caution)

::code-wrapper{language="scala"}
```scala
// Define implicit conversion
implicit def stringToInt(s: String): Int = s.toInt

val x: Int = "42"           // String automatically converted to Int

// Type class pattern (preferred)
trait Show[T] {
  def show(x: T): String
}

implicit val intShow: Show[Int] = new Show[Int] {
  def show(x: Int) = s"Int($x)"
}

def display[T](x: T)(implicit s: Show[T]): String = s.show(x)

display(42)                 // "Int(42)"
```
::

## Self Types

Declare dependencies on other traits:

::code-wrapper{language="scala"}
```scala
trait HasName {
  def name: String
}

trait CanGreet {
  self: HasName =>           // self must have HasName
  
  def greet() = s"Hello, $name"
}

class Person(val name: String) extends HasName with CanGreet

val p = Person("Alice")
p.greet()                   // "Hello, Alice"
```
::

## Higher-Kinded Types

Types that take type parameters:

::code-wrapper{language="scala"}
```scala
// Higher-kinded type parameter
trait Functor[F[_]] {
  def map[A, B](fa: F[A])(f: A => B): F[B]
}

implicit val listFunctor: Functor[List] = new Functor[List] {
  def map[A, B](fa: List[A])(f: A => B) = fa.map(f)
}

def fmap[F[_], A, B](fa: F[A])(f: A => B)(implicit F: Functor[F]): F[B] =
  F.map(fa)(f)

fmap(List(1, 2, 3))(_ * 2)  // List(2, 4, 6)
```
::

## Type Refinement

Create types on-the-fly with refinements:

::code-wrapper{language="scala"}
```scala
trait Named {
  def name: String
}

trait Aged {
  def age: Int
}

// Type refinement: Any with Both traits
val person: Named with Aged = new Named with Aged {
  def name = "Alice"
  def age = 30
}

// Structural types (duck typing)
def getName(obj: { def name: String }) = obj.name
```
::

## Existential Types

Forget type information explicitly:

::code-wrapper{language="scala"}
```scala
val list: List[_] = List(1, 2, 3)  // existential type (don't care what's inside)

val boxes: List[Box[_]] = List(
  Box(42),
  Box("hello"),
  Box(true)
)

// Can read but not write
for (box <- boxes) {
  val x = box.get    // type is unknown
  // box.set(value)  // ERROR: can't write (wrong type)
}
```
::

## Phantom Types

Use types for compile-time validation without runtime overhead:

::code-wrapper{language="scala"}
```scala
// Phantom types for compile-time safety
sealed trait Verified
sealed trait Unverified

case class Email[T](value: String)

def verify(email: Email[Unverified]): Email[Verified] = {
  // validation logic
  Email[Verified](email.value)
}

def send(email: Email[Verified]): Unit = {
  // send email (verified emails only)
}

val unverified = Email[Unverified]("user@example.com")
// send(unverified)  // ERROR: requires Email[Verified]

val verified = verify(unverified)
send(verified)      // OK
```
::

## 💡 Tips & Tricks

**Use type aliases for complex types**: Makes signatures clearer.

**Prefer upper bounds over casting**: `def f[T <: Base](x: T)` is safer than casts.

**Type variance matters for APIs**: Contravariance for inputs, covariance for outputs (PECS principle).

**Phantom types for compile-time safety**: Create types that vanish at runtime but prevent bugs at compile time.

**Implicit parameters enable DSLs**: Cleaner syntax for optional configuration.

## ⚠️ Edge Cases & Gotchas

**Type erasure**: Generics are erased at runtime. `List[Int]` and `List[String]` look the same at runtime.

**Variance annotations limit operations**: Covariant types `[+T]` can't take `T` as parameter; contravariant types `[-T]` can't return `T`.

**Implicit ambiguity**: Multiple implicit values in scope cause compile error.

::code-wrapper{language="scala"}
```scala
implicit val x: Int = 1
implicit val y: Int = 2
val z: Int = x  // ERROR: ambiguous implicits
```
::

**Phantom types have zero runtime cost**: But if you need runtime checks, use real types or runtime reflection.

**Self types don't enforce subclassing**: They only ensure the implementation has the required members.

## 🧠 Spot the Bug

What does this print?

::code-wrapper{language="scala"}
```scala
def first[T](list: List[T]): Option[T] = list.headOption

first(List(1, 2, 3))     // Some(1)
first(List())            // None

val x = first(List(1, 2, 3))
x match {
  case Some(v) => println(v)
  case None => println("empty")
}
```
::

<details>
<summary>Answer</summary>

Prints `1`.

Here's why:
- `first(List(1, 2, 3))` returns `Some(1)`
- Pattern match on `Some(v)` binds `v = 1`
- Prints `1`

**The lesson**: Generics work correctly with type inference. Scala infers `T = Int`.

</details>

## Key Takeaways

- Generics: `[T]` type parameter on functions/classes.
- Bounds: `T <: Upper` (upper), `T >: Lower` (lower).
- Variance: `[+T]` (covariant), `[-T]` (contravariant), `[T]` (invariant).
- Type aliases for readability: `type UserMap = Map[String, User]`.
- Implicit parameters for automatic injection: `def f[T](implicit x: T)`.
- Higher-kinded types for generic abstractions: `F[_]`.
- Phantom types for compile-time validation.
- Type erasure: generics don't work at runtime.
