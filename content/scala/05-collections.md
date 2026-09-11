---
title: Scala — Collections: Persistent Data Structures & Fusion
description: Production deep-dive into Scala's persistent immutable collections, Vector RRB-trees, lazy views, streaming fusion, and performance characteristics of each collection type.
---

# 05 — Collections: Persistent Data Structures & Fusion

## Immutable Collections — Persistent Data Structures

::code-wrapper{language="scala"}
```scala
// Scala's immutable collections are PERSISTENT — structural sharing, not copy-on-write.
// "Updating" returns a new collection that shares most structure with the old one.

// List: singly-linked list. Cons (:: ) is O(1). Everything else is O(n).
val list = List(1, 2, 3)                   // → 3 cons cells (::), each points to next
0 :: list                                  // O(1) — new cons cell pointing to old list head
list :+ 4                                  // O(n) — must traverse entire list to append
list(2)                                    // O(n) — must traverse to index 2
list.reverse                               // O(n) — full traversal + new cons cells

// Vector: persistent indexed sequence. Backed by RRB-trees (Relaxed Radix Balanced).
// O(log₃₂ n) for random access, prepend, append, update — effectively O(1) for < 10⁶ elements.
val vec = Vector(1, 2, 3, 4, 5)
vec(0)                                     // → ~O(1) (log₃₂ 5 = 1 level)
vec :+ 6                                   // O(log n) — new tree node sharing most leaves
0 +: vec                                   // O(log n) — new tree node
vec.updated(2, 99)                         // O(log n) — copy one path, share rest

// Map: persistent HashTrie or Vector. O(log n) lookup/update.
val m = Map("a" -> 1, "b" -> 2, "c" -> 3)  // → HashTrieMap with hash-based tree
m("a")                                     // O(effective O(1)) — hash + trie descent
m + ("d" -> 4)                             // O(log n) — shared structure with new entry
m - "a"                                    // O(log n) — new trie without key "a"

// Set: same backing as Map (HashSet / HashTrieSet)
val s = Set(1, 2, 3)
s + 4                                      // O(log n) — shared structure
s & Set(2, 3, 4)                           // intersection — O(n) but shares structure
```
::

## Vector Internals — RRB-Tree Structure

::code-wrapper{language="scala"}
```scala
// Vector is a 32-ary tree (branching factor = 32).
// Depth 1: up to 32 elements. Depth 2: up to 1024. Depth 3: up to 32768.
// Each leaf is an Array[AnyRef] of up to 32 elements.

// Indexed access: vec(i) descends the tree by extracting 5-bit chunks of the index:
//   level 2: (i >>> 10) & 0x1F  → which level-1 node
//   level 1: (i >>> 5)  & 0x1F  → which leaf node
//   level 0:  i         & 0x1F  → which element in leaf

// Update (updated): copies ONLY the path from root to the modified leaf (~3 nodes for 32K elements).
// The other 31 sibling leaves are shared. This is "path copying" — O(log₃₂ n) new nodes.

// ❌ ANTI-PATTERN: building a Vector with :+ in a loop — O(n log n) total
var v = Vector.empty[Int]
for i <- 1 to 10000 do v = v :+ i          // each :+ is O(log n), total O(n log n) + allocations

// ✅ CORRECT: build with List cons or Array, then convert
val built = (1 to 10000).foldLeft(Vector.empty[Int])((acc, i) => acc :+ i)  // still O(n log n)
// Better: use a builder (mutable, then freeze)
val builder = Vector.newBuilder[Int]
for i <- 1 to 10000 do builder += i
val fast = builder.result()                // O(n) — single tree construction
```
::

## Lazy Views & Fusion — Avoid Intermediate Collections

::code-wrapper{language="scala"}
```scala
// ❌ ANTI-PATTERN: chained strict ops create N intermediate collections
val result = (1 to 1000000).toList
  .map(_ * 2)                              // allocates List of 1M
  .filter(_ > 1000)                        // allocates List of ~999K
  .map(_ / 2)                              // allocates List of ~999K
  .take(10)                                // allocates List of 10
// Total: 3 full list traversals + 3 intermediate collections of ~1M elements each

// ✅ CORRECT: .view makes operations lazy — single pass, no intermediates
val result2 = (1 to 1000000).view
  .map(_ * 2)                              // lazy — no allocation yet
  .filter(_ > 1000)                        // lazy — no allocation yet
  .map(_ / 2)                              // lazy — no allocation yet
  .take(10)                                // lazy — stops after 10 elements found
  .to(Vector)                              // force: evaluates ONLY until 10 elements found
// Total: ~20 elements evaluated (10 passed filter × 2 for filter ratio), 1 final Vector

// .view returns a SeqView — a lazy wrapper that defers all transformations.
// .to(Vector) / .toList / .size forces evaluation.
// .foreach / .foldLeft also forces evaluation.

// ⚠️ Views are NOT memoized — re-forcing re-evaluates.
val view = (1 to 10).view.map { x => println(s"eval $x"); x * 2 }
view.take(3).to(Vector)                    // prints eval 1, eval 2, eval 3
view.take(3).to(Vector)                    // prints eval 1, eval 2, eval 3 AGAIN
```
::

## Collection Performance Cheat Sheet

::code-wrapper{language="text"}
```text
Collection       Access    Head/Tail   Append   Prepend   Update    Memory
─────────────────────────────────────────────────────────────────────────────
List             O(n)      O(1)        O(n)     O(1)      O(n)      1 cons/elem
Vector           O(log₃₂n) O(log n)   O(log n) O(log n)  O(log n)  tree nodes
ArrayBuffer(m)   O(1)      O(1)        O(1) am  O(n)      O(1)      contiguous
Array(m)         O(1)      O(1)        —        —         O(1)      primitive
HashMap          O(log n)  —           O(log n) —         O(log n)  trie nodes
HashSet          O(log n)  —           O(log n) —         O(log n)  trie nodes
ListMap          O(n)      —           O(1)     —         O(n)      cons per entry
```

## Real-World: Streaming Log Aggregation

::code-wrapper{language="scala"}
```scala
// Production pattern: process multi-GB log files without loading into memory
import scala.util.Using
import scala.io.Source

def aggregateErrors(path: String): Map[String, Int] =
  Using.resource(Source.fromFile(path)) { src =>
    src.getLines()                         // Iterator[String] — lazy, line-by-line
      .filter(_.contains("ERROR"))         // lazy — Iterator.filter
      .map(line => line.substring(0, 20))  // lazy — Iterator.map
      .foldLeft(Map.empty[String, Int]) { (acc, ts) =>
        acc.updatedWith(ts)(_.map(_ + 1).orElse(Some(1)))  // O(log n) per update
      }
  }
// Memory: O(unique timestamps) — NOT O(file size). Iterator is the key.
```
::

## Grouping & Aggregation

::code-wrapper{language="scala"}
```scala
final case class Order(customerId: Long, productId: Long, amount: Double)

val orders: List[Order] = loadOrders()     // e.g., 1M orders

// groupMapReduce — single-pass grouping + reduction (Scala 2.13+)
val byCustomer: Map[Long, Double] =
  orders.groupMapReduce(_.customerId)(_.amount)(_ + _)
// → Map[customerId → totalAmount], one traversal, one Map

// ❌ ANTI-PATTERN: groupBy then mapValues then sum — 3 passes + intermediate Map
val slow = orders.groupBy(_.customerId)          // pass 1: build Map of Lists
  .view.mapValues(_.map(_.amount).sum).toMap     // pass 2+3: sum each list

// groupMap — group + transform values in one pass
val byProduct: Map[Long, List[Order]] =
  orders.groupMap(_.productId)(identity)   // no reduction, just group

// partitionMap — split into Left/Right in one pass
val (valid, invalid) = orders.partitionMap { o =>
  if o.amount > 0 then Right(o) else Left(s"invalid amount: ${o.amount}")
}
```
::

## Mutable Collections — When and How

::code-wrapper{language="scala"}
```scala
import scala.collection.mutable

// ArrayBuffer: growable array. O(1) append (amortized), O(1) random access.
// Backed by a Java ArrayList-like structure. Doubles capacity when full.
val buf = mutable.ArrayBuffer.empty[Int]
for i <- 1 to 10000 do buf += i            // O(1) amortized — occasional resize copies
val arr = buf.toArray                       // O(n) copy to primitive int[] (if buf is ArrayBuffer[Int])

// ❌ ANTI-PATTERN: returning mutable collections from APIs
def getUsers: mutable.Map[Long, User] = mutable.Map(...)  // caller can mutate internal state!
// ✅ CORRECT: convert to immutable before returning
def getUsers: Map[Long, User] = mutable.Map(...).toMap    // defensive copy, caller can't mutate

// ArrayStack / ArrayDeque: O(1) prepend AND append (ring buffer)
val deque = mutable.ArrayDeque.empty[Int]
deque.append(1)                            // O(1)
deque.prepend(0)                           // O(1) — unlike ArrayBuffer's O(n) prepend

// HashMap (mutable): O(1) average, O(n) worst-case (hash collision)
val cache = mutable.HashMap.empty[String, Array[Byte]]
cache.put("key1", data)                    // O(1) average
cache.getOrElseUpdate("key2", compute())   // O(1) — compute only if missing (atomic)
```
::

## Zipping, Folding, and Scanning

::code-wrapper{language="scala"}
```scala
// foldLeft vs foldRight — evaluation order matters for non-associative ops
List(1, 2, 3).foldLeft(0)(_ - _)            // → ((0 - 1) - 2) - 3 = -6  (left-to-right)
List(1, 2, 3).foldRight(0)(_ - _)           // → 1 - (2 - (3 - 0)) = 2   (right-to-left)
// foldRight is NOT tail-recursive on List → stack overflow on long lists!
// Use foldLeft for linear folds. Use reduceLeftOption for empty-safe reduction.

// scanLeft — running accumulation (prefix sums)
List(1, 2, 3, 4).scanLeft(0)(_ + _)         // → List(0, 1, 3, 6, 10) — includes initial

// zipAll — pad shorter collection with default
List(1, 2, 3).zipAll(List("a", "b"), 0, "?")  // → List((1,"a"), (2,"b"), (3,"?"))

// zipWithIndex — pair each element with its index (O(n), no random access needed)
"hello".zipWithIndex                       // → Vector(('h',0), ('e',1), ('l',2), ('l',3), ('o',4))

// ❌ ANTI-PATTERN: using .zipWithIndex then .map for indexed transformation
// ✅ CORRECT: use .indices.map or .zipWithIndex in a single pass
```
::

## 💡 Tips & Tricks

**`.iterator` for memory-bounded processing**: Any collection can produce an `Iterator` — lazy, one-pass, O(1) memory. Use for streaming or large datasets.

::code-wrapper{language="scala"}
```scala
// Stream a 10GB file line-by-line — constant memory
io.Source.fromFile("huge.log").getLines()
  .filter(_.contains("ERROR"))
  .foreach(println)                        // never holds more than 1 line in memory
```
::

**`Vector` is the default immutable choice**: Unless you specifically need O(1) prepend (List) or sorted access (TreeMap), use Vector. It's the most balanced persistent collection.

**`.updatedWith` for conditional Map updates**: Atomic check-and-update in one call.

::code-wrapper{language="scala"}
```scala
cache.updatedWith(key)(_.map(_ + 1).orElse(Some(1)))  // increment or initialize to 1
```
::

## ⚠️ Edge Cases & Gotchas

**`List` `reverse` is O(n) and non-lazy**: `list.reverse.reverse` is O(2n) — not free. Don't use `reverse` to "work around" the prepend-only nature of List in hot paths.

**`Range` overflow**: `(1 to Int.MaxValue)` can cause arithmetic overflow in the Range implementation. Use `1.until(Int.MaxValue)` or iterate with a `while` loop for extreme ranges.

**`Map.apply` throws on missing key**: `map("missing")` throws `NoSuchElementException`. Use `map.get("missing")` (returns `Option`) or `map.getOrElse("missing", default)`.

**`view` + side effects = confusion**: View operations are re-evaluated on each force. If the pipeline has side effects (logging, counters), they fire N times for N forces.

**`Array` is invariant**: `Array[Int]` is NOT a subtype of `Array[Any]` (unlike Java's array covariance). This prevents `ArrayStoreException` at the type level — a deliberate Scala fix.

## 🧠 Quick Quiz

Why does `Vector(1,2,3).map(_ * 2).map(_ + 1)` allocate fewer objects than `List(1,2,3).map(_ * 2).map(_ + 1)`?

<details>
<summary>Answer</summary>

- **List**: Each `map` traverses the list and creates new cons cells. `map(_ * 2)` → 3 `::` cells. `map(_ + 1)` → 3 more `::` cells. Total: 6 cons cells + 2 intermediate `List` objects.
- **Vector**: Each `map` builds a new RRB-tree. For a 3-element Vector (1 level), `map(_ * 2)` copies 1 leaf node + 1 root node. `map(_ + 1)` copies another 1 leaf + 1 root. Total: 4 nodes (2 leaves + 2 roots). But the tree structure means the root is a new object pointing to a new leaf.

For **small collections** (n < 32), both are O(n) allocations. For **large collections** (n = 1M), Vector's `map` copies only the leaf level (~31K leaves for 1M elements) while keeping the tree structure. List's `map` copies all 1M cons cells.

The real win: **Vector + `.view`** — zero intermediate collections, single-pass evaluation.
</details>