---
title: Scala — Concurrency: Futures, ExecutionContext & Backpressure
description: Production deep-dive into Scala's Future/Promise model, ExecutionContext tuning, backpressure, retry with exponential backoff, race conditions, and the JVM memory model implications for concurrent Scala code.
---

# 09 — Concurrency: Futures, ExecutionContext & Backpressure

## `Future[T]` — The Async Computation Model

::code-wrapper{language="scala"}
```scala
import scala.concurrent.{Future, Promise, ExecutionContext}
import scala.concurrent.duration.*
import scala.util.{Success, Failure}

// Future[T] represents an async computation that will produce T or fail with Throwable.
// A Future is either: Incomplete | Completed(Success(T)) | Completed(Failure(ex))
// Once completed, it's IMMUTABLE — you can't change its result.

// Future starts executing IMMEDIATELY upon construction (eager, not lazy)
// on the provided ExecutionContext (thread pool).
def fetchUser(id: Long)(using ec: ExecutionContext): Future[User] = Future {
  httpClient.get(s"/users/$id").as[User]   // runs on ec's thread pool
}

// Transformations return NEW Futures — they don't mutate the original
// map: runs after the source Future completes successfully
val withName: Future[String] = fetchUser(42).map(_.name)

// flatMap: sequencng — the returned Future determines the next async step
val withPosts: Future[(User, List[Post])] = fetchUser(42).flatMap { user =>
  fetchPosts(user.id).map(posts => (user, posts))  // only starts after fetchUser succeeds
}

// for-comprehension is sugar for flatMap/map — sequential, not parallel
val pipeline: Future[String] =
  for
    user  <- fetchUser(42)                // starts immediately
    posts <- fetchPosts(user.id)          // starts AFTER fetchUser completes
    top   <- fetchTopPost(posts)          // starts AFTER fetchPosts completes
  yield top.title
// Each step waits for the previous — total time = sum of all steps
```
::

## Parallel vs Sequential — `zip` vs `flatMap`

::code-wrapper{language="scala"}
```scala
// ❌ ANTI-PATTERN: sequential when you want parallel
for
  users <- fetchUsers()                    // 100ms
  stats <- fetchStats()                    // 100ms — doesn't start until fetchUsers done
yield (users, stats)
// Total: 200ms (sequential)

// ✅ CORRECT: start both immediately, wait for both
val users = fetchUsers()                    // starts NOW
val stats = fetchStats()                    // starts NOW (parallel with users)
val combined: Future[(List[User], Stats)] = users.zip(stats)
// Total: ~100ms (parallel, limited by slowest)

// zip vs zipPar:
//   zip: completes when both complete; if one fails, the result fails
//   In Scala stdlib, Future.zip already runs both in parallel (both are already started)

// Future.sequence — N parallel futures → one Future of List
val futures: List[Future[User]] = userIds.map(fetchUser)  // all start immediately
val allUsers: Future[List[User]] = Future.sequence(futures)  // completes when all complete

// ❌ ANTI-PATTERN: sequence on a HUGE list → overwhelming downstream service
// 10,000 parallel fetches → connection pool exhaustion → timeouts
// ✅ CORRECT: use batching or a semaphore to limit concurrency
def fetchBatched(ids: List[Long], batchSize: Int = 50): Future[List[User]] =
  ids.grouped(batchSize).toList            // List[List[Long]] of 50 each
    .foldLeft(Future.successful(List.empty[User])) { (acc, batch) =>
      acc.flatMap(done => Future.sequence(batch.map(fetchUser)).map(done ++ _))
    }
```
::

## `Promise[T]` — Manual Future Completion

::code-wrapper{language="scala"}
```scala
// Promise is the write-side of a Future. Future is the read-side.
// A Promise can be completed exactly once — success or failure.

// Use case: bridge callback-based APIs to Future-based code
def fromCallback[A](register: (A => Unit, Throwable => Unit) => Unit): Future[A] =
  val p = Promise[A]()
  register(
    value => p.success(value),             // complete the promise with a value
    error => p.failure(error)              // complete the promise with an exception
  )
  p.future                                  // the read-side Future

// Use case: timeout race
def withTimeout[T](f: Future[T], timeout: FiniteDuration)(using ec: ExecutionContext): Future[T] =
  val p = Promise[T]()
  f.onComplete(p.complete)                  // complete p with f's result (success or failure)
  ec.execute(() =>                          // schedule timeout on the same EC
    Thread.sleep(timeout.toMillis)
    p.tryFailure(new TimeoutException(s"timed out after $timeout"))
  )
  p.future

// trySuccess / tryFailure: returns Boolean — true if this call completed the promise
// success / failure: throws if already completed (shouldn't happen, but defensive)
```
::

## ExecutionContext — Thread Pool Tuning

::code-wrapper{language="scala"}
```scala
import java.util.concurrent.{Executors, ThreadPoolExecutor, TimeUnit}
import scala.concurrent.ExecutionContext

// ❌ ANTI-PATTERN: using ExecutionContext.global for blocking I/O
// global is a ForkJoinPool with parallelism = CPU cores.
// Blocking calls (Thread.sleep, JDBC, HTTP) consume threads — pool starvation.
implicit val global: ExecutionContext = ExecutionContext.global
Future { Thread.sleep(5000); 42 }  // occupies a thread for 5s — with 8 cores, 8 of these = deadlock

// ✅ CORRECT: separate ECs for CPU-bound vs blocking I/O
val cpuEC: ExecutionContext = ExecutionContext.global   // for CPU-bound (map, filter, compute)

val ioEC: ExecutionContext = ExecutionContext.fromExecutor(
  Executors.newFixedThreadPool(50)  // 50 threads for I/O — higher than CPU count
  // Each thread can block on I/O without starving CPU-bound work
)

// Use the right EC for the right work:
Future { parseHugeJson(data) }(cpuEC)       // CPU-bound → use cpuEC
Future { jdbc.query("SELECT ...") }(ioEC)   // blocking I/O → use ioEC

// blocking { } — tells the EC this code will block, provision extra threads
// ONLY works with ExecutionContext.global (ForkJoinPool manages spare threads)
import scala.concurrent.blocking
Future {
  blocking {
    Thread.sleep(5000)                    // FJP creates a spare thread to compensate
  }
  42
}(global)
```
::

## Error Handling — `recover` / `recoverWith` / `fallbackTo`

::code-wrapper{language="scala"}
```scala
// recover: transform a failure into a success (catch + fallback value)
val withDefault: Future[Int] = riskyFuture.recover {
  case _: TimeoutException => 0            // timeout → default to 0
  case _: ConnectionRefused => -1          // connection refused → -1
  // other exceptions propagate as Failure
}

// recoverWith: transform a failure into a new Future (retry/fallback computation)
val withRetry: Future[String] = fetch(url).recoverWith {
  case _: TimeoutException => fetch(fallbackUrl)  // try different URL on timeout
}

// fallbackTo: try another Future if the first fails
val withFallback = primary.fetch().fallbackTo(secondary.fetch())
// ⚠️ fallbackTo swallows the original exception — you lose error diagnostics

// ❌ ANTI-PATTERN: using try/catch inside a Future
Future {
  try riskyOp()
  catch case e: Exception => default       // catches ALL exceptions including fatal ones!
}
// ✅ CORRECT: use recover — only catches non-fatal, composable
riskyFuture.recover { case _: NonFatal => default }
```
::

## Retry with Exponential Backoff — Production Pattern

::code-wrapper{language="scala"}
```scala
import scala.concurrent.{Future, ExecutionContext}
import scala.concurrent.duration.*
import scala.util.{Success, Failure, Random}

// Production-grade retry: exponential backoff + jitter + max retries + circuit breaking
def retryWithBackoff[T](
  operation: () => Future[T],
  maxRetries: Int = 3,
  initialDelay: FiniteDuration = 100.millis,
  maxDelay: FiniteDuration = 10.seconds,
  jitter: Double = 0.2                     // ±20% jitter to avoid thundering herd
)(using ec: ExecutionContext): Future[T] =

  def backoff(attempt: Int): FiniteDuration =
    val base = initialDelay * math.pow(2, attempt - 1).toLong  // 100ms, 200ms, 400ms...
    val capped = base.min(maxDelay)
    val jittered = capped * (1.0 + (Random.nextDouble() * 2 - 1) * jitter)
    jittered.asInstanceOf[FiniteDuration]

  def attempt(n: Int): Future[T] =
    operation().recoverWith {
      case ex if n < maxRetries =>
        val delay = backoff(n)
        Future.sleep(delay).flatMap(_ => attempt(n + 1))  // schedule retry after delay
      case ex =>
        Future.failed(ex)                  // exhausted retries → propagate original error
    }

  attempt(1)

// Usage:
retryWithBackoff(() => httpClient.post(url, payload), maxRetries = 5)
  .map(response => println(s"Success: $response"))
  .recover { case ex => println(s"All retries exhausted: $ex") }
```
::

## Shared Mutable State — Race Conditions & Atomics

::code-wrapper{language="scala"}
```scala
import java.util.concurrent.atomic.{AtomicLong, AtomicReference}
import java.util.concurrent.ConcurrentHashMap

// ❌ ANTI-PATTERN: shared var in Futures — data race
var counter = 0
val futures = (1 to 1000).map(_ => Future { counter += 1 })
Future.sequence(futures).map(_ => counter)  // → some number < 1000 (lost updates!)
// counter += 1 is read-modify-write: 3 instructions, non-atomic, interleaved across threads

// ✅ CORRECT: AtomicInteger for counter-like state
val atomicCounter = new AtomicLong(0)
val futures2 = (1 to 1000).map(_ => Future { atomicCounter.incrementAndGet() })
Future.sequence(futures2).map(_ => atomicCounter.get())  // → 1000 (guaranteed)

// ✅ CORRECT: CAS (compare-and-swap) for conditional updates
val state = new AtomicReference[String]("initial")
Future {
  var success = false
  while !success do
    val current = state.get()
    val updated = transform(current)
    success = state.compareAndSet(current, updated)  // atomic: only sets if still == current
}

// ✅ CORRECT: ConcurrentHashMap for shared maps (lock-free reads, striped writes)
val cache = new ConcurrentHashMap[String, Array[Byte]]()
cache.put("key", data)                     // thread-safe
cache.computeIfAbsent("key", k => fetch(k)) // atomic compute — fetch only if missing

// ✅ CORRECT: for Scala-native concurrent collections
val concurrentMap = scala.collection.concurrent.TrieMap.empty[String, Int]
concurrentMap("key") = 42                  // lock-free, thread-safe
```
::

## `Try[T]` — Synchronous Error Handling

::code-wrapper{language="scala"}
```scala
import scala.util.{Try, Success, Failure}

// Try is the synchronous analog of Future — wraps a computation that may throw.
// Same API as Future: map, flatMap, filter, recover, fold

val result: Try[Int] = Try {
  "42".toInt                              // Success(42)
}
val failed: Try[Int] = Try {
  "abc".toInt                             // Failure(NumberFormatException)
}

// Chaining with for-comprehension — same as Future/Option
val pipeline: Try[Int] =
  for
    n <- Try("100".toInt)
    d <- Try("4".toInt)
    if d != 0                              // guard → throws if false? No, returns Failure
  yield n / d

// fold — handle both cases in one call
val message: String = pipeline.fold(
  ex => s"Error: ${ex.getMessage}",
  value => s"Result: $value"
)

// toOption / toEither — convert to other error types
val asOption: Option[Int] = result.toOption
val asEither: Either[Throwable, Int] = result.toEither

// ❌ ANTI-PATTERN: using Try for expected control flow
// Try is for wrapping truly exceptional code (JDBC, parsing). For expected errors,
// use Either from the start — it's explicit, not exception-based.
```
::

## 💡 Tips & Tricks

**`Future.successful` / `Future.failed` for already-completed values**: No thread pool dispatch — the Future is already complete. Use when you need to return a `Future` from a value you already have.

::code-wrapper{language="scala"}
```scala
def findUser(id: Long): Future[Option[User]] =
  if id < 0 then Future.successful(None)    // no async needed — immediate completion
  else db.find(id)                          // actual async DB call
```
::

**`Future.unit` and `Future.never`**: `Future.unit` is a pre-completed `Future[Unit]`. `Future.never` (Cats) is a Future that never completes — useful for races where you want the other branch to always win.

**`zip` is parallel, `flatMap` is sequential**: This is the fundamental distinction. Use `zip` when operations are independent, `flatMap` when each depends on the previous result.

## ⚠️ Edge Cases & Gotchas

**`Future` is eager**: Construction immediately schedules execution. `Future { ... }` starts NOW, not when you `map` or `await`. If you need laziness, use `Cats Effect IO` or `ZIO`.

**`onComplete` returns `Unit`**: It's a side-effect callback — you can't chain from it. Use `map`/`flatMap`/`recover` for composable transformations.

**`Await.result` blocks the current thread**: If called on a thread that the Future's EC uses, you get thread starvation or deadlock. Never `Await` inside a `Future`.

**Exception in `Future` are wrapped**: A `throw` inside a `Future` doesn't propagate to the calling thread — it completes the Future as `Failure(ex)`. You must handle it via `recover` or `onComplete`.

**`Promise.complete` is idempotent? No — it's once-only**: Calling `success` twice throws `IllegalStateException`. Use `trySuccess` / `tryFailure` for best-effort completion (returns false if already complete).

## 🧠 Quick Quiz

What's wrong with this code, and what happens at runtime?

::code-wrapper{language="scala"}
```scala
implicit val ec: ExecutionContext = ExecutionContext.global

val f1 = Future { Thread.sleep(10000); "done" }   // blocks for 10s
val f2 = Future { 42 }                             // should be instant

f2.map(_ * 2).foreach(println)                     // when does this print?
```
::

<details>
<summary>Answer</summary>

It might print `84` immediately, OR it might be delayed up to 10 seconds. Here's why:

`ExecutionContext.global` is a `ForkJoinPool` with parallelism equal to the number of CPU cores (e.g., 8). If all 8 threads are occupied by blocking operations (like `Thread.sleep`), then `f2` — despite being instant — has no thread to run on. It sits in the pool's queue until a thread frees up.

With just `f1` blocking one thread, `f2` runs immediately on another. But if you have 8+ blocking futures, the pool is exhausted and even trivial work is delayed.

**Fix**: Use `blocking { Thread.sleep(10000) }` to let the ForkJoinPool provision a spare thread, OR use a dedicated `ioEC` (fixed thread pool with many threads) for blocking work.

This is the #1 concurrency bug in Scala codebases: **blocking on the global EC**.
</details>