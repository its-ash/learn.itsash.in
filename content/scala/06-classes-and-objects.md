---
title: Scala — Classes, Traits & the Object Model
description: Deep-dive into Scala's OOP: trait linearization, super calls, self types, open classes, universal equality, and the JVM representation of traits and objects.
---

# 06 — Classes, Traits & the Object Model

## Class Construction — Constructor & Fields

::code-wrapper{language="scala"}
```scala
// Scala 3: primary constructor parameters are in the class signature.
// `val` params become fields with getters. Bare params are local to constructor body.
final class Server(val host: String, val port: Int, config: Config):
  require(port > 0 && port <= 65535, s"invalid port: $port")  // precondition → IllegalArgumentException
  require(host.nonEmpty, "host must not be empty")

  // Constructor body — runs during instantiation, before any method can be called
  private val startTime: Long = System.nanoTime()  // private field, no setter
  private var requestCount: Long = 0L              // private mutable, no external setter

  // Public method returning a field (JIT inlines this to a direct field read)
  def uptimeMs: Long = (System.nanoTime() - startTime) / 1_000_000

  // Synchronized increment — but NOT atomic! See concurrency chapter.
  def recordRequest(): Unit = synchronized {
    requestCount += 1
  }

  // Override toString — auto-generated for case classes, manual for regular classes
  override def toString: String = s"Server($host:$port, requests=$requestCount)"

// Instantiation — no 'new' needed in Scala 3 for classes with companion apply
val server = Server("api.example.com", 443, defaultConfig)
// JVM: Server.<init>(String, int, Config) — parameters are fields, not a separate init block
```
::

## Traits & Linearization — The Diamond Resolution

::code-wrapper{language="scala"}
```scala
// Traits can have concrete methods, fields, and initialization logic.
// When multiple traits are mixed in, Scala uses LINEARIZATION to resolve
// method dispatch — rightmost trait wins, `super` calls chain up.

trait Logger:
  def log(msg: String): Unit = println(s"[LOG] $msg")

trait TimestampedLogger extends Logger:
  override def log(msg: String): Unit =
    super.log(s"${System.currentTimeMillis()} | $msg")  // super → next in linearization

trait JsonLogger extends Logger:
  override def log(msg: String): Unit =
    super.log(s"""{"msg":"$msg"}""")          // super → next in linearization

// Linearization order (right-to-left, depth-first):
//   new Logger with TimestampedLogger with JsonLogger
//   → JsonLogger → TimestampedLogger → Logger → AnyRef → Any
//
// JsonLogger.log calls super.log → TimestampedLogger.log calls super.log → Logger.log
// Result: {"msg":"1234567890 | original message"}  (JSON wrapping timestamp wrapping plain)

class App extends TimestampedLogger with JsonLogger:
  def run(): Unit = log("starting")
// App linearization: App → JsonLogger → TimestampedLogger → Logger → AnyRef
// 'super' in JsonLogger.log → TimestampedLogger.log (NOT Logger.log directly)

// ❌ ANTI-PATTERN: relying on trait init order for mutable state
trait A:
  val baseValue: Int = 10
trait B extends A:
  val doubled: Int = baseValue * 2         // baseValue might be 0 if init order is wrong!
class C extends B:
  override val baseValue = 20              // B.doubled initialized BEFORE C.baseValue → doubled = 0!

// ✅ CORRECT: use lazy val or def for derived values
trait BSafe extends A:
  lazy val doubled: Int = baseValue * 2    // evaluated on first access, after C is fully init
```
::

## Self Types — Dependency Without Inheritance

::code-wrapper{language="scala"}
```scala
// Self type: "I require this trait to be mixed in, but I don't inherit from it."
// Unlike `extends`, self type does NOT make the trait a subtype.
// The compiler ensures any class mixing in this trait ALSO has the required trait.

trait HasConfig:
  def config: Config

trait HasDatabase:
  def db: Database

// Service requires both Config and Database at mixin time
trait UserService:
  this: HasConfig & HasDatabase =>          // intersection self type (Scala 3)
  def findUser(id: Long): Option[User] =
    db.query(config.userQuery, id)          // can call config and db — guaranteed present

// ❌ class BadService extends UserService  // ERROR: doesn't have HasConfig & HasDatabase
// ✅ Must mix in all required traits:
class ProdService extends UserService with HasConfig with HasDatabase:
  val config: Config = loadConfig()
  val db: Database = Database.connect(config.dbUrl)

// Use self types for:
//   - Dependency injection (compile-time enforcement)
//   - Cake pattern — traits that require other traits from the same "cake"
//   - Avoiding inheritance when you only need access to methods, not IS-A relationship
```
::

## `open` Classes & Sealed Hierarchies — Scala 3

::code-wrapper{language="scala"}
```scala
// Scala 3: classes are CLOSED by default (cannot be subclassed outside the file).
// Must explicitly mark `open` to allow inheritance.

open class BaseRepository[T](val tableName: String):
  def find(id: Long): Option[T] = ???      // subclasses CAN override
  def save(t: T): Unit = ???

class UserRepository extends BaseRepository[User]("users"):
  override def find(id: Long): Option[User] = ???  // open allows this

// sealed: all subtypes MUST be in the same file → exhaustiveness checking
sealed trait Result[+T]:
  def map[U](f: T => U): Result[U] = this match
    case Ok(v)    => Ok(f(v))
    case Err(msg) => Err(msg)               // sealed → compiler knows these are the only cases

object Result:
  case class Ok[T](value: T) extends Result[T]
  case class Err(msg: String) extends Result[Nothing]  // Nothing is bottom type → covariant OK

// Adding a new subtype (e.g., Pending) → ALL match expressions get compile errors
// This is the strongest form of "closed for modification" — the compiler enforces it.
```
::

## Universal Equality & `canEqual`

::code-wrapper{language="scala"}
```scala
// Scala 3: `==` calls `equals()`. For case classes, equals is auto-generated (field-by-field).
// For regular classes, you must override equals yourself — and do it correctly.

final class Money(val cents: Long) extends Equals:
  override def equals(other: Any): Boolean = other match
    case that: Money =>
      that.canEqual(this) && this.cents == that.cents
    case _ => false

  // canEqual: allows subclasses to opt out of equality with parent
  override def canEqual(other: Any): Boolean = other.isInstanceOf[Money]

  // hashCode MUST be consistent with equals — same cents → same hashCode
  override def hashCode: Int = cents.hashCode

  // Scala 3: derive equals/hashCode via @alpha or use case classes instead
// Money(100) == Money(100) → true (value equality, not reference)

// ❌ ANTI-PATTERN: equals without hashCode (breaks HashMap/HashSet)
// If a.equals(b) then a.hashCode must == b.hashCode — ALWAYS.
// Case classes get this right for free. Prefer case classes for value types.

// Scala 3: `==` is universal equality. `eq` is reference equality (only for AnyRef).
//   Some(1) == Some(1)    → true  (case class equals)
//   Some(1) eq Some(1)    → false (different object instances)
```
::

## Companion Objects & Factory Patterns

::code-wrapper{language="scala"}
```scala
// Companion: class + object with same name in same file.
// Object can access private members of class and vice versa.

final class Connection private (val url: String, val timeoutMs: Int):
  def execute(query: String): Result[Array[Byte]] = ???

object Connection:
  // Smart constructor — validates input, returns Either for failure
  def create(url: String, timeoutMs: Int = 5000): Either[String, Connection] =
    if url.isBlank then Left("URL must not be empty")
    else if timeoutMs < 0 then Left("timeout must be non-negative")
    else Right(new Connection(url, timeoutMs))  // private constructor — only companion can call

  // Factory from config — common pattern for dependency injection
  def fromConfig(cfg: Config): Connection =
    new Connection(cfg.getString("db.url"), cfg.getInt("db.timeout"))

  // Apply with default — sugar for Connection(...)
  def apply(url: String): Connection = new Connection(url, 5000)

// Usage:
Connection.create("jdbc:postgres://...") match
  case Right(conn) => conn.execute("SELECT 1")
  case Left(err)   => println(s"Failed: $err")

// Private constructor: `new Connection(...)` is illegal outside the companion
// This is the standard "smart constructor" pattern — control all instantiation.
```
::

## Abstract Types & Path-Dependent Types

::code-wrapper{language="scala"}
```scala
// Abstract type member — declared in trait, implemented in subclass.
// Unlike generics, the type is "attached" to the instance, not the call site.

trait Database:
  type Conn                            // abstract type — each DB impl defines its own connection type
  def connect(): Conn
  def query(c: Conn, sql: String): Result[Array[Byte]]

class PostgresDB extends Database:
  type Conn = java.sql.Connection      // concrete: Conn is a JDBC Connection
  def connect(): Conn = DriverManager.getConnection(url)
  def query(c: Conn, sql: String): Result[Array[Byte]] = ???

class RedisDB extends Database:
  type Conn = redis.api.Connection     // completely different type
  def connect(): Conn = Redis.connect()
  def query(c: Conn, sql: String): Result[Array[Byte]] = ???

// Path-dependent: db.Conn is specific to the db instance's type
def use(db: Database)(conn: db.Conn): Unit = ???  // conn must match THIS db's Conn type
// This prevents passing a Postgres connection to a Redis database — type-safe at compile time!
```
::

## 💡 Tips & Tricks

**`final class` by default**: Mark classes `final` unless you intend them to be subclassed. The JIT can inline through final methods — measurable perf win.

**`enum` for ADTs in Scala 3**: Replace `sealed trait + case class/object` with `enum` for simpler syntax.

::code-wrapper{language="scala"}
```scala
enum Tree[+T]:
  case Leaf(value: T)
  case Node(left: Tree[T], right: Tree[T])
// Auto-generates: apply, unapply, toString, equals, hashCode, ordinal, values
// All variants are in the same file → exhaustiveness checking works
```
::

**`selectDynamic` / `applyDynamic` for structural DSLs**: Scala 3's `Selectable` trait enables dynamic member access for building fluid DSLs.

## ⚠️ Edge Cases & Gotchas

**Trait `val` initialization order**: Traits initialize in linearization order. A `val` in a trait that depends on an abstract `val` from a later trait will see `0`/`null`.

::code-wrapper{language="scala"}
```scala
trait Metric:
  val name: String                        // abstract
  val fullName = s"metric.$name"          // evaluated during trait init — name may be null!

class CpuMetric extends Metric:
  val name = "cpu"                        // initialized AFTER Metric's fullName → fullName = "metric.null"

// Fix: use lazy val, def, or pre-initialized fields:
class CpuMetricSafe extends:
  val name = "cpu"                         // pre-init: name set BEFORE Metric trait initializes
with Metric
```
::

**`equals` on mutable fields**: If `equals` depends on a `var`, storing the object in a `HashSet` then mutating the field makes it unfindable — the hash bucket no longer matches.

**`object` is lazy**: The singleton is initialized on first access, not at class load. Side effects in `object` bodies run at an unpredictable time.

## 🧠 Quick Quiz

What's the linearization of `class X extends A with B with C` where `B extends A` and `C extends A`?

<details>
<summary>Answer</summary>

Linearization is computed right-to-left, depth-first, removing duplicates (keeping the rightmost occurrence):

1. Start with `X`
2. `C` → `C` linearizes to `C, A` (C extends A)
3. `B` → `B` linearizes to `B, A`
4. `A` → `A`

Assembling right-to-left: `X, C, B, A, AnyRef, Any`

So `super` in `C` calls `B`, `super` in `B` calls `A`. The rightmost trait (`C`) gets the "last word" in override chains. This is why trait ordering matters — `with B with C` vs `with C with B` produce different linearizations and different `super` call chains.
</details>