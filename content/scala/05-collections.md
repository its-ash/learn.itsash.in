# 05 — Collections

## Immutable Collections (Preferred)

Scala's default collections are immutable (don't change, return new copies).

::code-wrapper{language="scala"}
```scala
// List (linked-list, O(n) access)
val nums = List(1, 2, 3)
nums(0)                         // 1
nums.head                       // 1
nums.tail                       // List(2, 3)
nums.length                     // 3

// Vector (indexed, O(log n) access)
val v = Vector(1, 2, 3)
v(0)                            // 1 (faster than List)
v.length                        // 3

// Seq (generic sequence, use when type is unknown)
val s: Seq[Int] = List(1, 2, 3)

// Set (no duplicates)
val unique = Set(1, 2, 2, 3)    // Set(1, 2, 3)
unique.contains(2)              // true
unique + 4                      // Set(1, 2, 3, 4) (new set)

// Map (key-value pairs)
val map = Map("a" -> 1, "b" -> 2)
map("a")                        // 1
map.get("c")                    // None (safe access)
map + ("c" -> 3)                // new map with added entry
```
::

## Mutable Collections

When mutability is necessary:

::code-wrapper{language="scala"}
```scala
import scala.collection.mutable

// Array (fixed size, mutable)
val arr = Array(1, 2, 3)
arr(0) = 10
arr.length                      // 3

// ArrayBuffer (growable array)
val buf = scala.collection.mutable.ArrayBuffer(1, 2, 3)
buf += 4                        // ArrayBuffer(1, 2, 3, 4)
buf(0) = 10

// Mutable Map
val map = scala.collection.mutable.Map("a" -> 1)
map("a") = 2
map += ("b" -> 3)

// Mutable Set
val set = scala.collection.mutable.Set(1, 2, 3)
set += 4
set -= 1
```
::

**Best practice**: Prefer immutable by default; use mutable only when necessary (loops, building collections).

## Range

Immutable sequences of consecutive integers:

::code-wrapper{language="scala"}
```scala
val r1 = 1 to 5                 // Range(1, 2, 3, 4, 5) inclusive
val r2 = 1 until 5              // Range(1, 2, 3, 4) exclusive
val r3 = 1 to 10 by 2           // Range(1, 3, 5, 7, 9) with step
val r4 = 10 to 1 by -1          // Range(10, 9, ..., 1) descending

// Convert to List
(1 to 5).toList                 // List(1, 2, 3, 4, 5)
(1 to 5).toVector               // Vector(1, 2, 3, 4, 5)
```
::

## Adding/Removing Elements

Creating modified collections:

::code-wrapper{language="scala"}
```scala
val nums = List(1, 2, 3)

// Prepend (add to front)
0 +: nums                       // List(0, 1, 2, 3)
val prepended = 0 :: nums      // same

// Append (add to end)
nums :+ 4                       // List(1, 2, 3, 4)

// Concatenate
nums ++ List(4, 5)              // List(1, 2, 3, 4, 5)

// Remove (by creating new collection)
nums.filter(_ != 2)             // List(1, 3)
nums.take(2)                    // List(1, 2)
nums.drop(1)                    // List(2, 3)
nums.slice(1, 3)                // List(2, 3)
```
::

## Collection Transformations

Functional methods for transforming collections:

::code-wrapper{language="scala"}
```scala
val nums = List(1, 2, 3, 4, 5)

// map — transform each element
nums.map(_ * 2)                 // List(2, 4, 6, 8, 10)

// flatMap — map then flatten
List(1, 2).flatMap(x => List(x, x*2))  // List(1, 2, 2, 4)

// filter — keep matching elements
nums.filter(_ > 2)              // List(3, 4, 5)
nums.filter(_ % 2 == 0)         // List(2, 4)

// collect — filter + map combined
nums.collect { case x if x > 2 => x * 2 }  // List(6, 8, 10)

// fold / reduce — accumulate into single value
nums.fold(0)(_ + _)             // 15 (sum)
nums.reduce(_ + _)              // 15 (same, no initial value)

// scanLeft / scanRight — fold but keep intermediate values
nums.scanLeft(0)(_ + _)         // List(0, 1, 3, 6, 10, 15)
```
::

## Querying Collections

::code-wrapper{language="scala"}
```scala
val nums = List(1, 2, 3, 4, 5)

// Search
nums.find(_ > 3)                // Some(4)
nums.find(_ > 10)               // None

// Existence
nums.exists(_ > 3)              // true
nums.contains(3)                // true
nums.forall(_ > 0)              // true
nums.forall(_ < 5)              // false

// Grouping
nums.groupBy(_ % 2)             // Map(1 -> List(1,3,5), 0 -> List(2,4))
nums.partition(_ % 2 == 0)      // (List(2,4), List(1,3,5))

// Sorting
nums.sorted                     // List(1, 2, 3, 4, 5)
nums.sortBy(x => -x)            // List(5, 4, 3, 2, 1) (descending)
nums.reverse                    // List(5, 4, 3, 2, 1)

// Distinct / unique
List(1, 2, 2, 3).distinct       // List(1, 2, 3)
```
::

## Zipping and Pairing

::code-wrapper{language="scala"}
```scala
val nums = List(1, 2, 3)
val letters = List("a", "b", "c")

// Zip (pair elements)
nums.zip(letters)               // List((1,"a"), (2,"b"), (3,"c"))

// Unzip (split pairs)
val pairs = List((1,"a"), (2,"b"))
pairs.unzip                     // (List(1,2), List("a","b"))

// zipWithIndex (pair with index)
letters.zipWithIndex            // List(("a",0), ("b",1), ("c",2))
```
::

## Map Operations

::code-wrapper{language="scala"}
```scala
val map = Map("a" -> 1, "b" -> 2, "c" -> 3)

// Access (safe)
map.get("a")                    // Some(1)
map.get("z")                    // None
map("a")                        // 1 (throws if missing)
map.getOrElse("z", 0)           // 0

// Iteration
map.foreach { case (k, v) => println(k, v) }
for ((k, v) <- map) println(k, v)

// Keys and values
map.keys                        // Iterable("a", "b", "c")
map.values                      // Iterable(1, 2, 3)

// Filter
map.filter { case (k, v) => v > 1 }  // Map("b" -> 2, "c" -> 3)
map.filterKeys(_ != "a")        // Map("b" -> 2, "c" -> 3)

// Transform
map.mapValues(_ * 2)            // Map("a" -> 2, "b" -> 4, "c" -> 6)
map.map { case (k, v) => (k, v * 2) }  // same

// Merge
map ++ Map("d" -> 4)            // Map("a"->1, "b"->2, "c"->3, "d"->4)
```
::

## Set Operations

::code-wrapper{language="scala"}
```scala
val set1 = Set(1, 2, 3)
val set2 = Set(2, 3, 4)

// Union
set1 ++ set2                    // Set(1, 2, 3, 4)
set1 | set2                     // same

// Intersection
set1 & set2                     // Set(2, 3)

// Difference
set1 -- set2                    // Set(1)
set1 &~ set2                    // same

// Subset / superset
Set(1, 2) subsetOf set1         // true
set1 supersetOf Set(1, 2)       // true
```
::

## Common Patterns

### Building collections incrementally (bad style)

::code-wrapper{language="scala"}
```scala
// Inefficient (Lua-style)
var result = List[Int]()
for (i <- 1 to 1000) {
  result = result :+ i           // O(n²) — creates new list each time
}

// Better: use buffer
val result = scala.collection.mutable.ArrayBuffer[Int]()
for (i <- 1 to 1000) {
  result += i
}
val list = result.toList
```
::

### Functional collection building

::code-wrapper{language="scala"}
```scala
// Best: use functional methods
val list = (1 to 1000).toList   // efficient

// Or map
val doubled = (1 to 1000).map(_ * 2).toList

// Or for-comprehension
val result = for (i <- 1 to 10) yield i * 2
```
::

## Edge Cases

### Empty collections

::code-wrapper{language="scala"}
```scala
val empty = List()
val empty2 = List[Int]()        // type must be specified

empty.isEmpty                   // true
empty.head                       // NoSuchElementException
empty.headOption                // None (safe)

// Check before accessing
if (empty.nonEmpty) println(empty.head)
```
::

### Nil (empty list)

::code-wrapper{language="scala"}
```scala
val empty = Nil                 // empty list
val empty2 = List()
empty == empty2                 // true

// Construct with Nil
val list = 1 :: 2 :: 3 :: Nil   // List(1, 2, 3)
```
::

## 💡 Tips & Tricks

**Use `.headOption` instead of `.head`**: Avoid exceptions; get `Some` or `None`.

**Chaining operations is efficient**: Scala fuses many operations into single pass.

```scala
(1 to 1000).map(_ * 2).filter(_ > 100).take(10)  // lazy in Scala 3
```

**Use ranges instead of materializing lists**: `(1 to 1000)` doesn't create 1000 elements upfront; it's lazy.

**Pattern match on collections**: Cleaner than index access.

```scala
list match {
  case Nil => "empty"
  case List(x) => s"single: $x"
  case head :: tail => s"head: $head"
}
```

## ⚠️ Edge Cases & Gotchas

**`.head` on empty collection throws**: Use `.headOption` for safety.

**Maps aren't guaranteed ordered**: Use `LinkedHashMap` (Scala 2.13+) or `List` of tuples if order matters.

**Sets don't have indices**: Can't do `set(0)`; convert to `List` or `Seq` if you need.

**Vector vs List tradeoff**: Vector has better random access; List has better prepend. Choose based on usage pattern.

**Mutating shared mutable collections**: If you pass a mutable collection to a function, modifications affect the original.

## 🧠 Spot the Bug

What does this print?

```scala
val nums = List(1, 2, 3, 4, 5)
val result = nums.map(_ * 2).filter(_ > 5).map(_ / 2)
println(result)
```

<details>
<summary>Answer</summary>

Prints `List(3, 4, 5)`.

Here's why:
- `map(_ * 2)`: List(2, 4, 6, 8, 10)
- `filter(_ > 5)`: List(6, 8, 10)
- `map(_ / 2)`: List(3, 4, 5) (integer division)

**The lesson**: Chain transformations logically. Integer division truncates.

</details>

## Key Takeaways

- Prefer immutable collections: `List`, `Set`, `Map`, `Vector`.
- Mutable collections in `scala.collection.mutable`: `ArrayBuffer`, `Set`, `Map`.
- `List` for linked-list semantics; `Vector` for random access.
- Use `.get()` for safe map access; `.apply()` for unsafe.
- Transform with `.map()`, `.filter()`, `.flatMap()`, `.fold()`.
- Query with `.find()`, `.exists()`, `.forall()`.
- Sets: union (`|`), intersection (`&`), difference (`--`).
- Maps: transform values with `.mapValues()`, filter with `.filter()`.
- Use ranges (`1 to 10`) instead of materializing lists.
- Pattern match on collections for elegance and safety.
