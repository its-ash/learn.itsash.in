# 10 — Testing with ScalaTest

## ScalaTest Basics

ScalaTest is a flexible testing framework for Scala:

::code-wrapper{language="scala"}
```scala
import org.scalatest.funsuite.AnyFunSuite

class CalculatorTest extends AnyFunSuite {
  test("addition") {
    assert(2 + 2 == 4)
  }
  
  test("subtraction") {
    assert(5 - 3 == 2)
  }
  
  test("division by zero") {
    assertThrows[ArithmeticException] {
      10 / 0
    }
  }
}
```
::

Run tests:

::code-wrapper{language="bash"}
```bash
sbt test
sbt testOnly CalculatorTest
sbt "testOnly CalculatorTest -- -z addition"  # run specific test
```
::

## Assertion Styles

### AnyFunSuite (Function style)

::code-wrapper{language="scala"}
```scala
import org.scalatest.funsuite.AnyFunSuite

class MyTest extends AnyFunSuite {
  test("example") {
    assert(true)
  }
}
```
::

### FunSpec (Spec style)

::code-wrapper{language="scala"}
```scala
import org.scalatest.funspec.AnyFunSpec

class CalculatorSpec extends AnyFunSpec {
  describe("Calculator") {
    it("should add two numbers") {
      assert(2 + 2 == 4)
    }
    
    it("should multiply") {
      assert(3 * 4 == 12)
    }
  }
}
```
::

### WordSpec (BDD style)

::code-wrapper{language="scala"}
```scala
import org.scalatest.wordspec.AnyWordSpec

class CalculatorWordSpec extends AnyWordSpec {
  "Calculator" when {
    "adding numbers" should {
      "return sum" in {
        assert(2 + 2 == 4)
      }
    }
  }
}
```
::

## Assertions and Matchers

::code-wrapper{language="scala"}
```scala
import org.scalatest._
import org.scalatest.matchers.should.Matchers._

class MyTest extends AnyFunSuite {
  test("equality") {
    2 + 2 should equal(4)
    2 + 2 shouldBe 4
    2 + 2 == 4 shouldBe true
  }
  
  test("comparison") {
    5 should be > 3
    5 should be >= 5
    3 should be < 5
  }
  
  test("container") {
    List(1, 2, 3) should contain(2)
    List(1, 2, 3) should have length 3
    List(1, 2, 3) should not contain 4
  }
  
  test("string matching") {
    "hello world" should include("world")
    "hello world" should startWith("hello")
    "hello world" should endWith("world")
  }
  
  test("option") {
    Some(42) should be(defined)
    Some(42).value should equal(42)
    None should be(empty)
  }
  
  test("exception") {
    an[ArithmeticException] should be thrownBy { 10 / 0 }
  }
}
```
::

## Setup and Teardown

::code-wrapper{language="scala"}
```scala
import org.scalatest.funsuite.AnyFunSuite

class DatabaseTest extends AnyFunSuite {
  var db: Database = _
  
  override def beforeEach(): Unit = {
    db = new Database()
    db.connect()
  }
  
  override def afterEach(): Unit = {
    db.close()
  }
  
  test("query") {
    val result = db.query("SELECT *")
    assert(result.nonEmpty)
  }
}
```
::

## Fixtures

Reusable test data:

::code-wrapper{language="scala"}
```scala
import org.scalatest.funsuite.AnyFunSuite

class UserTest extends AnyFunSuite {
  def fixture = new {
    val user = User("Alice", 30)
    val admin = User("Admin", 50)
  }
  
  test("user name") {
    val f = fixture
    assert(f.user.name == "Alice")
  }
  
  test("admin privileges") {
    val f = fixture
    assert(f.admin.isAdmin)
  }
}
```
::

## Property-Based Testing (ScalaCheck)

Test with generated random data:

::code-wrapper{language="scala"}
```scala
import org.scalatest.propspec.AnyPropSpec
import org.scalatestplus.scalacheck.ScalaCheckPropertyChecks

class ListSpec extends AnyPropSpec with ScalaCheckPropertyChecks {
  property("reverse of reverse is identity") {
    forAll { (list: List[Int]) =>
      list.reverse.reverse shouldBe list
    }
  }
  
  property("length preserved after reverse") {
    forAll { (list: List[Int]) =>
      list.reverse.length shouldBe list.length
    }
  }
  
  property("append then take") {
    forAll { (list: List[Int], n: Int) =>
      val positive = math.abs(n) + 1
      (list ++ list).take(positive) shouldBe list.take(positive)
    }
  }
}
```
::

## Test Organization

::code-wrapper{language="scala"}
```scala
// src/test/scala/com/example/CalculatorTest.scala
package com.example

import org.scalatest.funsuite.AnyFunSuite

class CalculatorTest extends AnyFunSuite {
  // tests here
}

// Run: sbt test
// Typical structure:
// src/test/scala/
//   ├── com/example/
//   │   ├── CalculatorTest.scala
//   │   ├── UserTest.scala
//   │   └── IntegrationTest.scala
```
::

## Integration Testing

::code-wrapper{language="scala"}
```scala
import org.scalatest.funsuite.AnyFunSuite

class IntegrationTest extends AnyFunSuite {
  // Expensive setup
  private val db = new TestDatabase()
  private val api = new TestAPI()
  
  override def beforeAll(): Unit = {
    db.setup()
    api.start()
  }
  
  override def afterAll(): Unit = {
    api.stop()
    db.teardown()
  }
  
  test("full flow") {
    val user = api.createUser("Alice")
    db.getUser(user.id) shouldBe defined
  }
}
```
::

## Test Tagging

Organize tests for selective execution:

::code-wrapper{language="scala"}
```scala
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.Tag

object Database extends Tag("database")
object Slow extends Tag("slow")
object Expensive extends Tag("expensive")

class MyTest extends AnyFunSuite {
  test("quick unit test", Slow) {
    // runs with -n Slow or -N Slow (excludes)
  }
  
  test("database test", Database) {
    // integration test
  }
  
  test("expensive operation", Expensive, Slow) {
    // can have multiple tags
  }
}
```
::

Run with tags:

::code-wrapper{language="bash"}
```bash
sbt "test -- -n Slow"        # run only Slow tests
sbt "test -- -N Slow"        # exclude Slow tests
sbt "test -- -l Database"    # exclude Database tests
```
::

## Mocking (with ScalaTest)

::code-wrapper{language="scala"}
```scala
import org.scalatest.funsuite.AnyFunSuite
import org.scalamock.scalatest.MockFactory

class UserServiceTest extends AnyFunSuite with MockFactory {
  test("get user from repository") {
    val mockRepo = mock[UserRepository]
    val user = User(1, "Alice")
    
    (mockRepo.getUser _).expects(1).returning(Some(user))
    
    val service = new UserService(mockRepo)
    val result = service.getUser(1)
    
    assert(result == Some(user))
  }
}
```
::

## Best Practices

::code-wrapper{language="scala"}
```scala
class BestPracticesTest extends AnyFunSuite {
  // ✅ Good: descriptive names
  test("should return sum of two numbers") {
    assert(add(2, 3) == 5)
  }
  
  // ✅ Good: one assertion per test (or related assertions)
  test("user creation") {
    val user = User("Alice", 30)
    assert(user.name == "Alice")
    assert(user.age == 30)
  }
  
  // ✅ Good: use matchers
  test("list operations") {
    List(1, 2, 3) should contain(2)
    List(1, 2, 3) should have length 3
  }
  
  // ❌ Bad: multiple unrelated assertions
  // test("everything") { ... many different things ... }
  
  // ❌ Bad: vague test names
  // test("test") { ... }
  
  // ❌ Bad: side effects in test data
  var globalCounter = 0
  test("uses global state") {
    globalCounter += 1  // don't do this
  }
}
```
::

## 💡 Tips & Tricks

**Use descriptive test names**: "should return sum" is better than "test1".

**Arrange-Act-Assert pattern**: Organize test into setup, action, verification.

```scala
test("add function") {
  // Arrange
  val calc = Calculator()
  
  // Act
  val result = calc.add(2, 3)
  
  // Assert
  result shouldBe 5
}
```

**Run tests during development**: `sbt ~test` for continuous testing.

**Use beforeEach/afterEach for isolation**: Each test starts fresh.

## ⚠️ Edge Cases & Gotchas

**Tests can run in any order**: Don't assume execution order. Tests should be independent.

**Shared mutable state is problematic**: Use beforeEach/afterEach to reset state.

**Mocking can hide bugs**: Real tests should use real dependencies when possible.

**Flaky tests are testing problems**: If test passes/fails randomly, it's revealing a concurrency bug.

**Expensive setup slows CI**: Use fast unit tests in main test suite; relegate integration tests to separate job.

## 🧠 Spot the Bug

What's wrong with this test?

```scala
class MyTest extends AnyFunSuite {
  var counter = 0
  
  test("increments counter") {
    counter += 1
    assert(counter == 1)
  }
  
  test("counter is 1") {
    assert(counter == 1)
  }
}
```

<details>
<summary>Answer</summary>

Tests share state. If first test runs, counter is 1. If second test runs first, counter is 0 and assertion fails.

Tests should not depend on execution order. Use `beforeEach` to reset state:

```scala
class MyTest extends AnyFunSuite {
  var counter = 0
  
  override def beforeEach(): Unit = {
    counter = 0
  }
  
  test("increments counter") {
    counter += 1
    assert(counter == 1)
  }
  
  test("counter starts at zero") {
    assert(counter == 0)
  }
}
```

</details>

## Key Takeaways

- ScalaTest offers multiple testing styles (FunSuite, FunSpec, WordSpec).
- Use matchers for readable assertions: `x shouldBe y`.
- Setup/teardown with `beforeEach`/`afterEach`.
- Property-based testing with ScalaCheck for random data.
- Tag tests for selective execution.
- Mock dependencies with ScalaTest + ScalaMock.
- Arrange-Act-Assert pattern for clarity.
- Keep tests independent; don't share state.
- Run tests continuously during development.
