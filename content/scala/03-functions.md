# 03 — Functions

## Function Definition

Define functions with `def`:

::code-wrapper{language="scala"}
```scala
def add(a: Int, b: Int): Int = a + b

def greet(name: String) = s"Hello, $name"  // type inferred from body

def noReturn(): Unit = println("side effect")

// Multi-statement function
def factorial(n: Int): Int = {
  if (n <= 1) 1 else n * factorial(n - 1)
}
```
::

### Best practice: annotate parameters and return type

Makes intent clear and catches errors at compile time.

::code-wrapper{language="scala"}
```scala
// Good — explicit types
def divide(a: Int, b: Int): Int = {
  require(b != 0, "divisor must not be zero")
  a / b
}

// OK in local scope where type is obvious
val double: Int => Int = x => x * 2
```
::

## Parameters

### Default parameters

::code-wrapper{language="scala"}
```scala
def greet(name: String, greeting: String = "Hello"): String =
  s"$greeting, $name"

greet("Alice")              // "Hello, Alice"
greet("Alice", "Hi")       // "Hi, Alice"
```
::

### Named arguments

::code-wrapper{language="scala"}
```scala
def createUser(name: String, age: Int, email: String): User =
  User(name, age, email)

createUser("Alice", 30, "alice@example.com")  // positional
createUser(name = "Alice", email = "alice@example.com", age = 30)  // named (order doesn't matter)
createUser(email = "alice@example.com", name = "Alice", age = 30)
```
::

### Variadic parameters (varargs)

Use `*` for variable-length arguments:

::code-wrapper{language="scala"}
```scala
def sum(nums: Int*): Int = nums.sum

sum(1, 2, 3)        // 6
sum()               // 0

// Pass array as varargs with :_*
val arr = Array(1, 2, 3)
sum(arr: _*)        // 6
```
::

## Function Values (Lambdas)

Assign functions to variables:

::code-wrapper{language="scala"}
```scala
val double: Int => Int = x => x * 2
double(5)           // 10

val add: (Int, Int) => Int = (a, b) => a + b
add(2, 3)           // 5

// Multiple statements
val compute: Int => Int = { x =>
  val squared = x * x
  squared + 1
}
compute(5)          // 26
```
::

### Type inference in lambdas

Scala infers parameter types from context:

::code-wrapper{language="scala"}
```scala
val nums = List(1, 2, 3, 4, 5)
nums.map(x => x * 2)              // type of x inferred as Int
nums.filter(_ > 2)                // _ is placeholder
```
::

## Higher-Order Functions

Functions that take or return other functions.

::code-wrapper{language="scala"}
```scala
// Takes a function as parameter
def apply(fn: Int => Int, x: Int): Int = fn(x)

apply(x => x * 2, 5)              // 10
apply(_ + 1, 5)                   // 6

// Returns a function
def makeMultiplier(factor: Int): Int => Int = {
  x => x * factor
}

val times3 = makeMultiplier(3)
times3(5)                         // 15

// Function composition
def compose[A, B, C](f: A => B, g: B => C): A => C = {
  a => g(f(a))
}
```
::

## Collections with Functions

Map, filter, reduce, and more:

::code-wrapper{language="scala"}
```scala
val nums = List(1, 2, 3, 4, 5)

// map — transform each element
nums.map(_ * 2)                   // List(2, 4, 6, 8, 10)
nums.map(x => s"Number: $x")      // List("Number: 1", ...)

// filter — keep matching elements
nums.filter(_ > 2)                // List(3, 4, 5)
nums.filter(x => x % 2 == 0)      // List(2, 4)

// reduce / fold — accumulate into single value
nums.reduce(_ + _)                // 15
nums.fold(0)(_ + _)               // 15 (fold takes initial value)
nums.fold("")((acc, x) => acc + x.toString)  // "12345"

// find — first matching element
nums.find(_ > 3)                  // Some(4)
nums.find(_ > 10)                 // None

// exists / forall
nums.exists(_ > 4)                // true
nums.forall(_ > 0)                // true

// flatMap — map then flatten
List(1, 2, 3).flatMap(x => List(x, x * 2))  // List(1, 2, 2, 4, 3, 6)

// partition — split by condition
nums.partition(_ % 2 == 0)        // (List(2, 4), List(1, 3, 5))
```
::

## For Comprehensions

Syntactic sugar for map/filter/flatMap chains:

::code-wrapper{language="scala"}
```scala
// With generators (map)
for (x <- 1 to 5) yield x * 2     // Vector(2, 4, 6, 8, 10)

// With guards (filter)
for (x <- 1 to 10 if x % 2 == 0) yield x  // Vector(2, 4, 6, 8, 10)

// Multiple generators (flatMap)
for {
  x <- 1 to 3
  y <- 1 to 3
} yield (x, y)                    // Vector((1,1), (1,2), ..., (3,3))

// With bindings
for {
  x <- 1 to 5
  squared = x * x
  if squared > 10
} yield squared                   // Vector(16, 25)

// Equivalent to:
(1 to 5)
  .map(x => (x, x * x))
  .filter { case (x, sq) => sq > 10 }
  .map { case (x, sq) => sq }
```
::

## Closures

Functions capture variables from enclosing scope:

::code-wrapper{language="scala"}
```scala
def makeAdder(x: Int): Int => Int = {
  y => x + y      // y is parameter, x is captured
}

val add5 = makeAdder(5)
add5(3)           // 8

val add10 = makeAdder(10)
add10(3)          // 13
```
::

## Pattern Matching in Functions

Use pattern matching as function body:

::code-wrapper{language="scala"}
```scala
def describeNumber: Int => String = {
  case 0 => "zero"
  case 1 => "one"
  case n if n > 0 => "positive"
  case _ => "negative"
}

describeNumber(0)     // "zero"
describeNumber(5)     // "positive"
describeNumber(-3)    // "negative"
```
::

## Recursive Functions

Use `@tailrec` for tail-recursive optimization:

::code-wrapper{language="scala"}
```scala
import scala.annotation.tailrec

def countdown(n: Int): Unit = {
  if (n > 0) {
    println(n)
    countdown(n - 1)  // tail call
  }
}

// Explicitly mark tail recursion
@tailrec
def factorial(n: Int, acc: Int = 1): Int = {
  if (n <= 1) acc else factorial(n - 1, n * acc)
}

factorial(5)         // 120
```
::

The `@tailrec` annotation ensures Scala optimizes the call; if the function isn't tail-recursive, compilation fails.

## Partially Applied Functions

Apply some arguments, get a function back:

::code-wrapper{language="scala"}
```scala
def add(a: Int, b: Int, c: Int): Int = a + b + c

val add5and10 = add(5, 10, _: Int)  // partially applied
add5and10(3)                         // 18

// Or convert to function
val addCurried: (Int, Int, Int) => Int = (a, b, c) => a + b + c
val add5 = addCurried(5, _, _)
add5(3, 4)                          // 12
```
::

## Curried Functions

Functions with multiple parameter lists:

::code-wrapper{language="scala"}
```scala
// Curried version
def addCurried(a: Int)(b: Int)(c: Int): Int = a + b + c

val result = addCurried(1)(2)(3)    // 6

// Partial application (auto-generated)
val add1 = addCurried(1)
val add1and2 = add1(2)
val result = add1and2(3)            // 6

// vs uncurried
def addUncurried(a: Int, b: Int, c: Int): Int = a + b + c
```
::

Use curried functions for:
- Clearer syntax with type inference
- Partial application patterns
- Higher-order function factories

## By-Name Parameters

Pass expressions that are evaluated later (lazy):

::code-wrapper{language="scala"}
```scala
def lazyPrint(msg: => String): Unit = println(msg)

lazyPrint("hello")                 // arg is an expression, not pre-evaluated
lazyPrint({
  println("computing...")
  "result"
})                                // prints "computing..." then "result"

// Vs strict parameters
def strictPrint(msg: String): Unit = println(msg)
strictPrint({
  println("computing...")
  "result"
})                                // prints "computing..." then "result"
```
::

Use by-name for:
- Lazy evaluation
- Control structures (if you're building DSLs)
- Expensive computations only when needed

## Implicit Parameters

Not covered here (advanced), but functions can accept implicit parameters that are automatically injected by the compiler.

## 💡 Tips & Tricks

**Use `@tailrec` for recursive functions**: Let the compiler verify tail calls. It'll error if optimization isn't possible, forcing a rewrite.

**Placeholder syntax for simple lambdas**: `list.map(_ * 2)` is cleaner than `list.map(x => x * 2)` for single-argument functions.

**Function values as DSL builders**: Higher-order functions are perfect for building domain-specific languages.

::code-wrapper{language="scala"}
```scala
def repeat(n: Int)(fn: => Unit): Unit = {
  for (_ <- 1 to n) fn
}
repeat(3) { println("hello") }
```
::

**Type bounds in functions**: Use `[A <: Number]` for generic functions with constraints.

## ⚠️ Edge Cases & Gotchas

**By-name parameters are re-evaluated each call**: If you pass `() => { expensive() }` as a by-name parameter, it runs again on each access. Use `lazy val` if you want memoization.

::code-wrapper{language="scala"}
```scala
def once(fn: => Unit): Unit = { fn; fn }
once(println("hi"))    // prints "hi" twice

def onceLazy(fn: => Unit): Unit = {
  lazy val result = fn
  result; result
}
```
::

**Pattern matching exhaustiveness**: In function bodies, Scala checks if all cases are handled. Missing a case is a compile error (usually).

**Default parameters are evaluated at definition time**: Like Python, mutable defaults are shared.

::code-wrapper{language="scala"}
```scala
def bad(items: scala.collection.mutable.ArrayBuffer[Int] = scala.collection.mutable.ArrayBuffer()) { }
// Fix: use => to defer
def good[A](items: => scala.collection.mutable.ArrayBuffer[A] = scala.collection.mutable.ArrayBuffer()) { }
```
::

**`_` in function position has special meaning**: `list.map(_)` is invalid (ambiguous). Use `x => x` or a proper function reference.

## 🧠 Spot the Bug

What does this print?

::code-wrapper{language="scala"}
```scala
def makeAdder(x: Int) = {
  y => x + y
}

val add5 = makeAdder(5)
val add10 = makeAdder(10)

println(add5(3))
println(add10(3))
```
::

<details>
<summary>Answer</summary>

Prints `8` and `13`.

Here's why:
- `makeAdder(5)` returns a function that captures `x = 5`
- `add5(3)` calls that function with `y = 3`, so `5 + 3 = 8`
- `makeAdder(10)` returns a different function capturing `x = 10`
- `add10(3)` returns `10 + 3 = 13`

**The lesson**: Each closure captures its own variables. Independent closures don't share state.

</details>

## Key Takeaways

- Functions are first-class values; assign to variables and pass around.
- Annotate parameters and return types for clarity (but Scala infers many).
- Use lambdas (`x => x * 2`) for anonymous functions.
- Higher-order functions (taking/returning functions) enable functional composition.
- For comprehensions are syntactic sugar for map/filter/flatMap chains.
- Closures capture variables from enclosing scope.
- Use `@tailrec` for tail-recursive optimization.
- Curried functions enable partial application and clearer syntax.
- By-name parameters (`=> T`) defer evaluation (lazy).
