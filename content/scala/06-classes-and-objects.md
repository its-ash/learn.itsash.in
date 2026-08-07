# 06 — Classes & Objects

## Class Basics

::code-wrapper{language="scala"}
```scala
// Class definition
class Person(val name: String, val age: Int) {
  // Constructor body (optional)
  require(age >= 0, "age must be non-negative")
  
  def greet(): String = s"Hello, I'm $name"
  
  def birthday(): Unit = {
    // this.age += 1  // ERROR: val is immutable
  }
}

// Instantiate
val alice = Person("Alice", 30)
println(alice.name)         // "Alice"
println(alice.greet())      // "Hello, I'm Alice"

// Constructor parameters become properties (with val/var)
val bob = Person("Bob", 25)
// bob.name is accessible
// bob.age is accessible
```
::

## Constructor Parameters

Constructor parameters can be:
- `val` — immutable property
- `var` — mutable property
- No prefix — just parameter (not accessible outside)

::code-wrapper{language="scala"}
```scala
class Dog(
  val name: String,           // public immutable property
  var age: Int,               // public mutable property
  breed: String               // private parameter (not accessible)
) {
  // Can access breed inside class
  def describe() = s"$name is a $breed"
}

val d = Dog("Buddy", 5, "Golden")
println(d.name)              // "Buddy"
d.age = 6                    // OK, age is var
// d.breed                   // ERROR: not accessible
```
::

## Methods

::code-wrapper{language="scala"}
```scala
class Calculator {
  // Method with parameters
  def add(a: Int, b: Int): Int = a + b
  
  // Method with default parameters
  def multiply(a: Int, b: Int = 2): Int = a * b
  
  // Method with no return (returns Unit)
  def print_result(x: Int): Unit = println(x)
  
  // Varargs method
  def sum(nums: Int*): Int = nums.sum
  
  // Method returning Unit (can omit return type)
  def sideEffect() { println("doing something") }
}

val calc = Calculator()
calc.add(2, 3)              // 5
calc.multiply(5)            // 10
calc.multiply(5, 3)         // 15
calc.sum(1, 2, 3)           // 6
```
::

## Objects (Singletons)

`object` defines a singleton (one instance per JVM):

::code-wrapper{language="scala"}
```scala
object Config {
  val api_url = "https://api.example.com"
  val timeout = 5000
  
  def load_from_file(path: String): Config = {
    // load and return config
    this
  }
}

// Access (no instantiation needed)
println(Config.api_url)     // "https://api.example.com"

// Comparison
val c1 = Config
val c2 = Config
c1 eq c2                    // true (same instance)
```
::

## Companion Objects

Pair a class with an object of the same name:

::code-wrapper{language="scala"}
```scala
class User(val id: Int, val name: String)

object User {
  def newWithId(id: Int, name: String): User = new User(id, name)
  
  def adminUser(): User = new User(0, "Admin")
}

// Use companion for factory methods
val user = User.newWithId(1, "Alice")
val admin = User.adminUser()
```
::

## Inheritance

::code-wrapper{language="scala"}
```scala
// Parent class
class Animal(val name: String) {
  def speak(): String = "sound"
  def move(): String = "moving"
}

// Child class
class Dog(name: String, val breed: String) extends Animal(name) {
  // Override method
  override def speak(): String = s"$name barks!"
  
  // New method
  def fetch(): String = "fetching ball"
}

val dog = Dog("Buddy", "Golden")
println(dog.speak())        // "Buddy barks!"
println(dog.move())         // "moving" (inherited)

// Type checking
dog.isInstanceOf[Animal]    // true
dog.asInstanceOf[Animal].speak()  // "Buddy barks!"
```
::

## Traits (Interfaces + Mixins)

Traits provide interface-like contracts and code reuse:

::code-wrapper{language="scala"}
```scala
// Trait (interface)
trait Drawable {
  def draw(): String
}

trait Named {
  val name: String
  def getName(): String = name
}

// Implement multiple traits
class Circle(val name: String, val radius: Double) extends Drawable with Named {
  override def draw(): String = s"Drawing $name circle with radius $radius"
}

val circle = Circle("Red", 5.0)
println(circle.draw())      // "Drawing Red circle with radius 5.0"
println(circle.getName())   // "Red"
```
::

### Trait methods

Traits can have concrete methods:

::code-wrapper{language="scala"}
```scala
trait Logger {
  def log(msg: String): Unit = println(s"[LOG] $msg")
  def error(msg: String): Unit = println(s"[ERROR] $msg")
}

class App extends Logger {
  def run() = {
    log("Starting app")
    error("Something went wrong")
  }
}

App().run()
```
::

## Abstract Classes

::code-wrapper{language="scala"}
```scala
abstract class Shape {
  def area(): Double  // abstract method (no implementation)
  
  def describe(): String = s"Area: ${area()}"  // concrete method
}

class Rectangle(val width: Double, val height: Double) extends Shape {
  override def area(): Double = width * height
}

val rect = Rectangle(4, 5)
println(rect.area())        // 20.0
println(rect.describe())    // "Area: 20.0"

// Can't instantiate abstract class
// val s = Shape()  // ERROR
```
::

## Visibility Modifiers

::code-wrapper{language="scala"}
```scala
class MyClass {
  public val public_var = 1     // accessible everywhere
  val default_var = 2            // package-scoped (default public in Scala)
  protected val protected_var = 3  // accessible in subclasses
  private val private_var = 4    // not accessible outside class
  
  private def private_method() = "private"
  protected def protected_method() = "protected"
  def public_method() = "public"
}
```
::

## Case Classes (Special Classes)

Case classes are optimized for data containers:

::code-wrapper{language="scala"}
```scala
// Case class (like data class in Kotlin)
case class Person(name: String, age: Int)

// Auto-generated: copy, equals, hashCode, toString
val alice = Person("Alice", 30)
val bob = alice.copy(name = "Bob")

alice == Person("Alice", 30)    // true (value equality)
alice.toString                  // "Person(Alice,30)"

// Pattern matching support
alice match {
  case Person(n, a) => s"$n is $a"
}
```
::

## Class Methods (Static)

Define "static" methods in companion objects:

::code-wrapper{language="scala"}
```scala
class Math private() {
  // private constructor prevents instantiation
}

object Math {
  def add(a: Int, b: Int): Int = a + b
  def subtract(a: Int, b: Int): Int = a - b
}

Math.add(2, 3)              // 5
// new Math()  // ERROR: private constructor
```
::

## 💡 Tips & Tricks

**Use `val` by default for properties**: Immutability is safer. Switch to `var` only if needed.

**Constructor parameters with `val`/`var` are concise**: `class User(val id: Int, val name: String)` is cleaner than storing separately.

**Companion objects for factories**: Cleaner than multiple constructors.

```scala
case class User(id: Int, name: String)
object User {
  def fromString(s: String): User = {
    val Array(id, name) = s.split(",")
    User(id.toInt, name)
  }
}
```

**Traits for behavior, classes for data**: Traits mix in behavior; classes represent entities.

**Use sealed traits for exhaustiveness checking**: Compiler verifies all cases handled.

```scala
sealed trait Result
case class Success(value: String) extends Result
case class Failure(error: String) extends Result

def handle(r: Result) = r match {
  case Success(v) => println(v)
  case Failure(e) => println(e)
  // Compiler warns if cases missing
}
```

## ⚠️ Edge Cases & Gotchas

**`val` in constructor doesn't make it a property**: `class C(x: Int)` — `x` is only a parameter. Use `class C(val x: Int)` to make it accessible.

**Multiple inheritance with traits can cause diamond problem**: Scala's linearization resolves it, but be careful with trait ordering.

**Abstract methods in traits require implementation in concrete class**: Forgetting to override is a compile error.

**Visibility `private` is per-file, not per-class**: Use `private[this]` to restrict to just the instance.

```scala
class C {
  private val x = 1
  def f(other: C) = other.x  // OK (private within class)
}
```

**Constructor side effects run on instantiation**: Be careful with expensive operations in class body.

## 🧠 Spot the Bug

What does this print?

```scala
class Counter(private var count: Int = 0) {
  def increment() = count += 1
  def get = count
}

val c = Counter()
c.increment()
c.increment()
println(c.get)
```

<details>
<summary>Answer</summary>

Prints `2`.

Here's why:
- Counter created with count=0
- increment() adds 1 twice, so count=2
- get returns 2

**The lesson**: `private var` is mutable within the class only. External code can't access or modify it.

</details>

## Key Takeaways

- Classes have constructor parameters; use `val`/`var` to make them properties.
- `object` defines a singleton.
- Companion object pairs with class for factory methods.
- Inheritance: `class Child extends Parent`.
- Traits: `trait T` and mix with `class C extends T1 with T2`.
- Case classes: auto-generated copy, equals, hashCode, toString.
- Abstract classes for abstract methods; traits for mixins.
- Visibility: `public` (default), `protected`, `private[this]`.
