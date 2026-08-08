# 09 — Concurrent Programming

## Futures (Async Operations)

`Future[T]` represents a value that may not be available yet:

::code-wrapper{language="scala"}
```scala
import scala.concurrent.{Future, ExecutionContext}
import scala.concurrent.ExecutionContext.Implicits.global

// Create a future
val future: Future[Int] = Future {
  Thread.sleep(1000)          // simulate work
  42
}

// Transform with map
val doubled: Future[Int] = future.map(_ * 2)

// Chain operations with flatMap
val result: Future[String] = future.flatMap { value =>
  Future { s"Result: $value" }
}

// Handle completion
future.onComplete {
  case scala.util.Success(value) => println(s"Success: $value")
  case scala.util.Failure(ex) => println(s"Failed: ${ex.getMessage}")
}

// Block and wait (use sparingly)
import scala.concurrent.Await
import scala.concurrent.duration._

val value = Await.result(future, 2.seconds)  // blocks thread
println(value)                               // 42
```
::

## For-Comprehensions with Futures

Cleaner syntax for chaining futures:

::code-wrapper{language="scala"}
```scala
val f1 = Future { 1 }
val f2 = Future { 2 }
val f3 = Future { 3 }

// Chained operations
val result = for {
  a <- f1
  b <- f2
  c <- f3
} yield a + b + c              // Future[Int] (value = 6)

// Equivalent to:
f1.flatMap { a =>
  f2.flatMap { b =>
    f3.map { c =>
      a + b + c
    }
  }
}
```
::

## Future Combinators

::code-wrapper{language="scala"}
```scala
val f1 = Future { 1 }
val f2 = Future { 2 }
val f3 = Future { 3 }

// Combine multiple futures
val all = Future.sequence(List(f1, f2, f3))  // Future[List[Int]]

val traversed = Future.traverse(List(1, 2, 3)) { x =>
  Future { x * 2 }
}                              // Future[List[Int]] = Future(List(2, 4, 6))

// Race: first to complete wins
val first = Future.firstCompletedOf(List(f1, f2))

// Zip: combine two futures
val zipped = f1.zip(f2)        // Future[(Int, Int)] = Future((1, 2))

// Handle errors
val faultTolerant = f1.recover {
  case _: TimeoutException => 0
  case ex => throw ex
}

// Fallback
val withFallback = f1.fallbackTo(Future { 999 })
```
::

## Promise (Settable Future)

`Promise` lets you manually complete a `Future`:

::code-wrapper{language="scala"}
```scala
val promise = scala.concurrent.Promise[Int]()
val future = promise.future

// Complete the promise
promise.success(42)

// Or fail
promise.failure(new Exception("error"))

// Or try (returns Boolean success)
promise.trySuccess(42)

// Usage
val f = Future {
  // do async work
  42
}

f.onComplete { result =>
  promise.complete(result)
}
```
::

## Threads

Scala runs on the JVM, so you can use Java threads:

::code-wrapper{language="scala"}
```scala
// Create thread
val thread = new Thread {
  override def run(): Unit = {
    println("Running in thread")
    Thread.sleep(1000)
    println("Done")
  }
}

thread.start()
thread.join()                   // wait for thread to finish

// Or with function
val t = new Thread(() => {
  println("Hello from thread")
})
t.start()
```
::

## Synchronized Collections

Manually synchronize access:

::code-wrapper{language="scala"}
```scala
var counter = 0
val lock = new AnyRef

def increment(): Unit = lock.synchronized {
  counter += 1                  // thread-safe
}

// Or use AtomicInteger
import java.util.concurrent.atomic.AtomicInteger

val atomic = new AtomicInteger(0)
atomic.incrementAndGet()        // thread-safe
atomic.get()                    // 1
```
::

## Shared State Problems

Data races and concurrency issues:

::code-wrapper{language="scala"}
```scala
// Dangerous: shared mutable state
var counter = 0

for (_ <- 1 to 100) {
  Future { counter += 1 }       // race condition!
}

// Thread.sleep(1000)
// println(counter)             // likely < 100

// Solution: synchronize or use atomic
val atomic = new java.util.concurrent.atomic.AtomicInteger(0)
for (_ <- 1 to 100) {
  Future { atomic.incrementAndGet() }
}
```
::

## Execution Context

Controls where futures run:

::code-wrapper{language="scala"}
```scala
import scala.concurrent.ExecutionContext

// Global context (default thread pool)
implicit val ec: ExecutionContext = ExecutionContext.global

val f = Future { 42 }           // runs on thread pool

// Custom context
val customEC = ExecutionContext.fromExecutor(
  java.util.concurrent.Executors.newFixedThreadPool(4)
)

val f2 = Future { 42 }(customEC)  // runs on custom pool
```
::

## Blocking Operations

Mark blocking calls for better scheduling:

::code-wrapper{language="scala"}
```scala
import scala.concurrent.blocking

val future = Future {
  blocking {                    // informs ExecutionContext of blocking
    Thread.sleep(1000)
    "result"
  }
}
```
::

The `blocking` call lets the ExecutionContext provision extra threads to prevent starvation.

## Try (Error Handling)

`Try[T]` is like `Future` but synchronous:

::code-wrapper{language="scala"}
```scala
import scala.util.{Try, Success, Failure}

val attempt: Try[Int] = Try {
  10 / 2
}

attempt match {
  case Success(v) => println(v)
  case Failure(ex) => println(s"Error: ${ex.getMessage}")
}

// Transform
attempt.map(_ * 2)              // Try[Int]
attempt.flatMap(v => Try(100 / v))

// Recover
attempt.recover { case _: ArithmeticException => 0 }

// Get value with default
attempt.getOrElse(0)
```
::

## Practical Patterns

### Timeout

::code-wrapper{language="scala"}
```scala
import scala.concurrent._, duration._

def withTimeout[T](future: Future[T], timeout: Duration): Future[T] = {
  val promise = Promise[T]()
  future.onComplete(promise.complete)
  
  new Thread(() => {
    Thread.sleep(timeout.toMillis)
    promise.tryFailure(new TimeoutException())
  }).start()
  
  promise.future
}

val f = Future { Thread.sleep(5000); 42 }
Await.result(withTimeout(f, 1.second), 2.seconds)  // throws TimeoutException
```
::

### Retry with exponential backoff

::code-wrapper{language="scala"}
```scala
def retry[T](fn: () => Future[T], maxRetries: Int = 3, delayMs: Long = 100): Future[T] = {
  fn().recoverWith { case ex =>
    if (maxRetries > 0) {
      Thread.sleep(delayMs)
      retry(fn, maxRetries - 1, delayMs * 2)
    } else {
      Future.failed(ex)
    }
  }
}

retry(() => Future { riskyOperation() })
```
::

## 💡 Tips & Tricks

**Use for-comprehensions for readable async code**: Much cleaner than nested flatMaps.

**Always provide implicit ExecutionContext**: Don't rely on default global.

**Use `onComplete` or `map` for side effects**: Avoid `Await.result()` unless you must block.

**Combine futures with `Future.sequence`**: Cleaner than manual zipping.

**Use `Try` for synchronous error handling**: `Future` for async.

## ⚠️ Edge Cases & Gotchas

**Futures don't timeout by default**: Use `Await.result()` with timeout or implement custom timeout logic.

**Blocking on futures can deadlock**: If all threads are blocked, new work has nowhere to run.

**Shared mutable state is dangerous**: Always synchronize or use atomic operations.

**`Await.result()` is blocking**: Use sparingly; it defeats async benefits. Better: transform with `map`/`flatMap`.

**Exception handling is different**: `recover` for `Try`, `onComplete` or `recoverWith` for `Future`.

**Thread pool exhaustion**: If all threads are blocked waiting for other async operations, deadlock occurs.

## 🧠 Spot the Bug

What does this do?

::code-wrapper{language="scala"}
```scala
var result = 0

Future {
  Thread.sleep(100)
  result = 42
}

println(result)          // prints immediately

Thread.sleep(200)
println(result)          // prints after delay
```
::

<details>
<summary>Answer</summary>

Prints `0` (immediately), then prints `42` (after delay).

Here's why:
- `Future { ... }` runs asynchronously
- First `println(result)` runs before future completes (result still 0)
- After 200ms delay, future has finished, so result is 42

**The lesson**: `Future` is non-blocking. Use `map`, `flatMap`, or `Await` if you need synchronization.

</details>

## Key Takeaways

- `Future[T]` represents async computation.
- Transform with `.map()`, `.flatMap()`, `.recover()`.
- `for` comprehensions for readable async code.
- Use `Promise` to manually complete futures.
- `Try[T]` for sync error handling.
- `Await.result()` blocks (use sparingly).
- Synchronize shared mutable state or use atomic operations.
- Provide implicit `ExecutionContext` for thread pool.
- `blocking {}` informs ExecutionContext of blocking calls.
