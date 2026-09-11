---
title: Scala — Testing: ScalaTest, ScalaCheck & Property-Based Testing
description: Production testing patterns — test fixtures, property-based testing with ScalaCheck, mock-free design with traits, parallel test execution, and CI integration with sbt and munit.
---

# 10 — Testing: ScalaTest, ScalaCheck & Property-Based Testing

## Test Styles — Choosing the Right One

::code-wrapper{language="scala"}
```scala
// FunSuite — flat, function-style. Good for unit tests.
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers.*

class CalculatorTest extends AnyFunSuite:
  test("add returns sum of two integers"):
    Calculator.add(2, 3) shouldBe 5

  test("divide by zero throws"):
    assertThrows[ArithmeticException]:
      Calculator.divide(10, 0)

// FunSpec — describe/it style. Good for BDD-ish specs.
import org.scalatest.funspec.AnyFunSpec
class UserSpec extends AnyFunSpec:
  describe("User"):
    it("should create with valid email"):
      User.create("alice@x.com") shouldBe Right(User("alice@x.com"))
    it("should reject invalid email"):
      User.create("not-email") shouldBe Left("invalid email")

// munit — lightweight, fast, with diffs built in. Recommended for new projects.
class MyTest extends munit.FunSuite:
  test("add"):
    assertEquals(Calculator.add(2, 3), 5)
  test("divide by zero"):
    intercept[ArithmeticException]:
      Calculator.divide(10, 0)
```
::

## Fixtures — Before/After, Loan Pattern, and Resource Management

::code-wrapper{language="scala"}
```scala
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.{BeforeAndAfterEach, BeforeAndAfterAll}

// ❌ ANTI-PATTERN: shared mutable state across tests
class BadTest extends AnyFunSuite:
  var counter = 0                           // shared across tests — order-dependent!
  test("inc"):
    counter += 1
    assert(counter == 1)                    // passes IF this runs first
  test("check"):
    assert(counter == 0)                    // fails IF inc ran first

// ✅ CORRECT: BeforeAndAfterEach for per-test isolation
class GoodTest extends AnyFunSuite with BeforeAndAfterEach:
  private var db: TestDatabase = _

  override def beforeEach(): Unit =
    db = TestDatabase.inMemory()            // fresh DB per test

  override def afterEach(): Unit =
    db.close()                              // cleanup after each test

  test("insert and query"):
    db.insert(User("Alice"))
    db.findAll() shouldBe List(User("Alice"))

// ✅ CORRECT: Loan pattern for resource management
class FileTest extends AnyFunSuite:
  // Loan pattern — pass resource to test, guarantee cleanup
  def withTempFile[T](test: java.io.File => T): T =
    val file = java.io.File.createTempFile("test", ".tmp")
    try test(file)
    finally file.delete()

  test("write and read"):
    withTempFile { file =>
      Files.write(file.toPath, "hello".getBytes)
      Files.readAllLines(file.toPath).get(0) shouldBe "hello"
    }                                       // file deleted after test, guaranteed
```
::

## Property-Based Testing with ScalaCheck — Generators & Shrinking

::code-wrapper{language="scala"}
```scala
import org.scalacheck.{Gen, Prop, Arbitrary}
import org.scalacheck.Prop.forAll
import org.scalatest.funsuite.AnyFunSuite
import org.scalatestplus.scalacheck.Checkers

// Property: a statement that should hold for ALL valid inputs
class ListPropertyTest extends AnyFunSuite with Checkers:

  test("reverse of reverse equals identity"):
    check((list: List[Int]) => list.reverse.reverse == list)

  test("head of sorted list is minimum"):
    check((list: List[Int]) =>
      list.nonEmpty ==> (list.sorted.head == list.min)  // ==> is implication
    )

  test("map + filter = filter + map for commutative ops"):
    check((list: List[Int], f: Int => Int) =>
      list.map(f).filter(_ > 0) == list.filter(_ > 0).map(f)  // WRONG property — catches bug!
    )

// Custom generators — control the generated data distribution
object Generators:
  val userIdGen: Gen[Long] = Gen.choose(1L, 999_999_999L)
  val emailGen: Gen[String] = for
    local <- Gen.alphaStr.filter(_.nonEmpty)
    domain <- Gen.oneOf("gmail.com", "yahoo.com", "example.org")
  yield s"$local@$domain"

  // Generate case class instances
  val userGen: Gen[User] = for
    id   <- userIdGen
    name <- Gen.alphaStr.filter(_.nonEmpty)
    email <- emailGen
  yield User(id, name, email)

  // Generate lists of a specific size range
  val userListGen: Gen[List[User]] = Gen.listOf(userGen)

// Shrinking — ScalaCheck automatically finds the MINIMAL failing case
// If a property fails for List(4, 8, 15, 16, 23, 42), ScalaCheck tries:
//   List(4, 8, 15, 16, 23) → still fails? → List(4, 8, 15, 16) → ... → List(0)
// The minimal counterexample is shown in the test output.
// This is the #1 value of PBT — it finds edge cases you'd never think to test.
```
::

## Mock-Free Testing with Traits — The Functional Core

::code-wrapper{language="scala"}
```scala
// ❌ ANTI-PATTERN: mocking everything — tests test the mocks, not the logic
class BadUserServiceTest extends AnyFunSuite with MockFactory:
  test("get user"):
    val mockRepo = mock[UserRepository]
    (mockRepo.find _).expects(42).returning(Some(User("Alice")))
    // This test ONLY verifies that find(42) was called — not that the logic works

// ✅ CORRECT: design for testability — inject traits, use fakes (not mocks)
trait UserRepository:
  def find(id: Long): Option[User]
  def save(user: User): Long

// Fake — in-memory implementation for tests
class FakeUserRepo extends UserRepository:
  private val store = scala.collection.mutable.Map.empty[Long, User]
  private var nextId = 1L
  def find(id: Long): Option[User] = store.get(id)
  def save(user: User): Long =
    val id = nextId; nextId += 1; store(id) = user; id

class UserServiceTest extends AnyFunSuite:
  val repo = FakeUserRepo()                 // real logic, no mocking framework
  val service = UserService(repo)

  test("create and find"):
    val id = service.create("Alice")
    service.find(id) shouldBe Some(User("Alice"))

  test("find non-existent returns None"):
    service.find(999) shouldBe None

// This tests the SERVICE logic with a fast, deterministic in-memory repo.
// No mock framework needed. Tests are robust to refactoring (no "expects" to update).
```
::

## Integration Testing — Tagged, Separated, and Parallel

::code-wrapper{language="scala"}
```scala
import org.scalatest.{Tag, BeforeAndAfterAll}
import org.scalatest.funsuite.AnyFunSuite

// Tags for selective execution in CI
object UnitTest extends Tag("unit")
object IntegrationTest extends Tag("integration")
object SlowTest extends Tag("slow")

class UserDBTest extends AnyFunSuite with BeforeAndAfterAll:
  private var db: PostgresContainer = _

  override def beforeAll(): Unit =
    db = PostgresContainer.start()          // Testcontainers — real Postgres in Docker

  override def afterAll(): Unit =
    db.stop()

  test("insert and query real DB", IntegrationTest):
    val repo = PostgresUserRepo(db.jdbcUrl)
    repo.save(User("Alice"))
    repo.findAll() shouldBe List(User("Alice"))

  test("connection retry on transient failure", IntegrationTest, SlowTest):
    // takes 30s+ — only run in nightly CI, not on every push

// sbt commands for tagged execution:
//   sbt "testOnly * -- -n unit"              # only unit tests
//   sbt "testOnly * -- -n integration -l slow"  # integration but not slow
//   sbt "Test/serial"                        # run tests serially (for shared resources)
```
::

## Async Testing — `Future`-Based Assertions

::code-wrapper{language="scala"}
```scala
import org.scalatest.funsuite.AsyncFunSuite
import scala.concurrent.Future

// AsyncFunSuite: test bodies return Future[Assertion] — no Await needed
class UserServiceAsyncTest extends AsyncFunSuite:
  import scala.concurrent.ExecutionContext.Implicits.global

  test("async user creation"):
    for
      id   <- service.create("Alice")       // returns Future[Long]
      user <- service.find(id)              // returns Future[Option[User]]
    yield assert(user == Some(User("Alice")))
    // The test framework handles awaiting — the Future completes the test

  test("async error handling"):
    recoverToSucceededIf[IllegalArgumentException]:
      service.create("")                    // should fail with IAE
```
::

## Test Parallelism & Race Conditions in Tests

::code-wrapper{language="scala"}
```scala
import org.scalatest.funsuite.AnyFunSuite

// ⚠️ ScalaTest runs tests in PARALLEL by default (different test classes in parallel).
// Within a class, tests are sequential UNLESS ParallelTestExecution is mixed in.

import org.scalatest.ParallelTestExecution
class ParallelTest extends AnyFunSuite with ParallelTestExecution:
  // These tests MAY run concurrently — don't share mutable state!
  test("a"): assert(1 + 1 == 2)
  test("b"): assert(2 + 2 == 4)

// ❌ ANTI-PATTERN: shared DB across parallel test classes
class TestA extends AnyFunSuite:
  test("insert user"):
    sharedDb.save(User("Alice"))            // races with TestB
class TestB extends AnyFunSuite:
  test("count users"):
    assert(sharedDb.count() == 0)           // flaky — depends on TestA's timing

// ✅ CORRECT: per-class isolated DB (Testcontainers or in-memory)
class TestA extends AnyFunSuite with BeforeAndAfterAll:
  private var db: TestDatabase = _
  override def beforeAll(): Unit = db = TestDatabase.fresh()
  // Each class gets its own DB — no cross-test interference
```
::

## Assertion Deep-Dive — Matchers and Custom Assertions

::code-wrapper{language="scala"}
```scala
import org.scalatest.matchers.should.Matchers.*
import org.scalatest.matchers.be

// Structural equality — checks field by field (case class equals)
User("Alice") shouldBe User("Alice")        // ✓
User("Alice") should be(User("Alice"))      // same thing

// Collection matchers
List(1, 2, 3) should contain(2)
List(1, 2, 3) should contain theSameElementsAs List(3, 2, 1)  // order-independent
Map("a" -> 1, "b" -> 2) should contain key "a"
Map("a" -> 1) should contain value 1

// Option/Either matchers
Some(42) shouldBe defined
None shouldBe empty
Right(42) shouldBe Right(42)
Left("err") shouldBe Left("err")

// Exception assertions
assertThrows[ArithmeticException](10 / 0)
the[ArithmeticException] thrownBy (10 / 0) should have message "/ by zero"

// Custom matcher for domain-specific assertions
def beWithinTolerance(expected: Double, tolerance: Double) =
  be >= (expected - tolerance) and be <= (expected + tolerance)

3.14159 should beWithinTolerance(3.14, 0.01)  // → passes
```
::

## 💡 Tips & Tricks

**`sbt ~test` for continuous testing**: Watches for file changes and re-runs affected tests — instant feedback loop during development.

::code-wrapper{language="bash"}
```bash
sbt "~testOnly *UserService*"           # re-run user service tests on every save
sbt "~Test/compile"                      # just compile tests on save (faster, no execution)
```
::

**Test data builders for complex domain objects**: Use the Builder pattern or a test data factory to create valid objects without verbose constructor calls.

::code-wrapper{language="scala"}
```scala
object UserBuilder:
  def apply(name: String = "test-user", email: String = "test@x.com", roles: List[String] = Nil): User =
    User(name = name, email = email, roles = roles)

// In tests:
UserBuilder(email = "alice@x.com")         // uses defaults for other fields
UserBuilder(roles = List("admin"))         // only override what matters
```
::

**Property-based tests for invariants, example-based for regressions**: Use ScalaCheck for universal invariants (reverse.reverse == id), use explicit examples for specific bug regressions (with a comment referencing the issue number).

## ⚠️ Edge Cases & Gotchas

**Flaky tests reveal real bugs**: If a test passes/fails randomly, it's usually a concurrency bug (race condition, timing dependency) — investigate, don't ignore.

**`beforeAll` runs once per class, not per test**: Expensive setup (DB containers) goes here. But if tests are parallel, `beforeAll` may run while another class's tests are still running — use distinct databases.

**Mock frameworks can hide integration bugs**: A test with mocks only verifies that the right calls were made, not that the real dependency actually works. Always have integration tests with real dependencies.

**ScalaCheck generators can be slow**: Generating large lists (Gen.listOfN(100000, ...)) is expensive. Use `Gen.listOfN` with reasonable sizes, or configure `PropertyCheckConfig` with `minSuccessful = 50` instead of the default 100.

## 🧠 Quick Quiz

What's the difference between a **mock**, a **stub**, and a **fake**?

<details>
<summary>Answer</summary>

- **Mock**: A test double that verifies interactions — "was `find(42)` called?" It records calls and lets you assert on them. The test is about the *interaction*, not the result. (e.g., ScalaMock's `mock[UserRepository]`)

- **Stub**: A test double that returns canned responses — `find(42) => Some(User("Alice"))`. It doesn't verify interactions, just provides predetermined outputs. Simpler than a mock.

- **Fake**: A real working implementation that's simplified for testing — `FakeUserRepo` with an in-memory `Map`. It has real logic (find actually looks up the map), but isn't production-ready (no persistence, no concurrency). Fakes are preferred in functional Scala because they test real behavior without a mock framework's coupling.

**Best practice**: Prefer fakes > stubs > mocks. Fakes test the most real behavior. Mocks couple tests to implementation details (every refactor breaks the mock expectations).
</details>