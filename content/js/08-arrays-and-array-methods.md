# 08 — Arrays & Array Methods

## Array Creation

::code-wrapper{language="javascript"}
```javascript
// Literal (preferred)
const arr = [1, 2, 3]

// Array.from — from iterable or array-like
Array.from('hello')           // ['h','e','l','l','o']
Array.from({ length: 3 }, (_, i) => i)  // [0, 1, 2]
Array.from(document.querySelectorAll('div'))  // real array from NodeList

// Array.of — handles single-argument edge case
Array.of(7)      // [7]
Array(7)         // [empty × 7] ⚠️ (array with 7 empty slots, not [7])
Array.of(1, 2, 3)  // [1, 2, 3]

// Spread
const copy = [...arr]
const fromSet = [...new Set([1, 2, 2, 3])]  // [1, 2, 3]
```
::

### Edge case: holes (empty slots)

::code-wrapper{language="javascript"}
```javascript
const arr = [1, , 3]  // hole at index 1
arr.length    // 3
arr[1]        // undefined
arr.map(x => x * 2)   // [2, empty, 6] — map skips holes!
arr.flatMap(x => [x]) // [1, 3] — flatMap removes holes

// Avoid holes — use explicit undefined
const clean = [1, undefined, 3]
clean.map(x => x * 2)  // [2, NaN, 6]
```
::

## Accessing and Modifying

::code-wrapper{language="javascript"}
```javascript
const arr = ['a', 'b', 'c', 'd']

arr[0]          // 'a'
arr.at(-1)      // 'd' (negative index — ES2022)
arr.length      // 4

// Mutating
arr[0] = 'x'
arr[arr.length] = 'e'  // append
arr.push('f')           // append (returns new length)
arr.unshift('z')        // prepend (returns new length)
arr.pop()               // remove last (returns removed)
arr.shift()             // remove first (returns removed)
arr.splice(1, 2)        // remove 2 items at index 1
arr.splice(1, 0, 'x')   // insert 'x' at index 1
arr.fill(0, 0, 3)       // fill indices 0-2 with 0
```
::

## Iteration Methods

### `forEach` — side effects, no return

::code-wrapper{language="javascript"}
```javascript
['a', 'b', 'c'].forEach((item, index, array) => {
  console.log(index, item)
})

// ⚠️ Cannot break out of forEach — use for...of or some() instead
```
::

### `map` — transform, returns new array

::code-wrapper{language="javascript"}
```javascript
const doubled = [1, 2, 3].map(x => x * 2)  // [2, 4, 6]
const users = people.map(p => ({ ...p, fullName: `${p.first} ${p.last}` }))

// Edge case: map with index
['a', 'b', 'c'].map((item, i) => `${i}:${item}`)
// ['0:a', '1:b', '2:c']
```
::

### `filter` — select matching elements

::code-wrapper{language="javascript"}
```javascript
const evens = [1, 2, 3, 4, 5, 6].filter(x => x % 2 === 0)
// [2, 4, 6]

const adults = users.filter(u => u.age >= 18)

// Edge case: filter removes falsy values
const truthy = [0, 1, '', 'a', null, undefined, NaN, false, true].filter(Boolean)
// [1, 'a', true]
```
::

### `reduce` — accumulate into single value

::code-wrapper{language="javascript"}
```javascript
// Sum
const sum = [1, 2, 3, 4].reduce((acc, x) => acc + x, 0)  // 10

// Group by
const grouped = users.reduce((acc, user) => {
  const key = user.role
  ;(acc[key] ||= []).push(user)
  return acc
}, {})

// Flatten
const flat = [[1, 2], [3, 4], [5]].reduce((acc, arr) => acc.concat(arr), [])
// [1, 2, 3, 4, 5]

// ⚠️ Always provide initial value — prevents bugs with empty arrays
[].reduce((acc, x) => acc + x)  // TypeError (no initial value, empty array)
[].reduce((acc, x) => acc + x, 0)  // 0 (safe)
```
::

### `find` / `findIndex` / `findLast`

::code-wrapper{language="javascript"}
```javascript
const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
  { id: 3, name: 'Charlie' }
]

users.find(u => u.id === 2)       // { id: 2, name: 'Bob' }
users.findIndex(u => u.id === 2)  // 1
users.findLast(u => u.age > 18)   // last matching (ES2023)
users.findLastIndex(u => u.age > 18)
```
::

### `some` / `every`

::code-wrapper{language="javascript"}
```javascript
[1, 2, 3].some(x => x > 2)     // true (at least one)
[1, 2, 3].every(x => x > 0)    // true (all)
[1, 2, 3].every(x => x > 1)    // false

// Short-circuit — stops early
[1, 2, 3].some(x => { console.log(x); return x > 1 })
// logs: 1, 2 — stops at first true
```
::

## Transformation Methods

### `flat` / `flatMap`

::code-wrapper{language="javascript"}
```javascript
// flat — flatten nested arrays
[1, [2, [3, [4]]]].flat()      // [1, 2, [3, [4]]] (default depth 1)
[1, [2, [3, [4]]]].flat(2)     // [1, 2, 3, [4]]
[1, [2, [3, [4]]]].flat(Infinity)  // [1, 2, 3, 4]

// flatMap — map then flat(1)
[1, 2, 3].flatMap(x => [x, x * 2])
// [1, 2, 2, 4, 3, 6]
```
::

### `sort` — ⚠️ mutates and sorts as strings by default

::code-wrapper{language="javascript"}
```javascript
// Default sort converts to strings — numeric sort is wrong!
[10, 2, 1, 21].sort()  // [1, 10, 2, 21] ⚠️ (string comparison)

// Numeric sort
[10, 2, 1, 21].sort((a, b) => a - b)  // [1, 2, 10, 21]
[10, 2, 1, 21].sort((a, b) => b - a)  // [21, 10, 2, 1] (descending)

// Sort objects
users.sort((a, b) => a.name.localeCompare(b.name))

// ⚠️ sort mutates the original — use toSorted for immutable (ES2023)
const sorted = [3, 1, 2].toSorted((a, b) => a - b)  // [1, 2, 3]
```
::

### `reverse` and `toReversed`

::code-wrapper{language="javascript"}
```javascript
const arr = [1, 2, 3]
arr.reverse()     // [3, 2, 1] — mutates!
arr               // [3, 2, 1]

// Non-mutating (ES2023)
const original = [1, 2, 3]
const reversed = original.toReversed()  // [3, 2, 1]
original  // [1, 2, 3] — unchanged
```
::

### `slice` / `splice` / `with`

::code-wrapper{language="javascript"}
```javascript
// slice — non-mutating copy of portion
[1, 2, 3, 4, 5].slice(1, 4)   // [2, 3, 4]
[1, 2, 3, 4, 5].slice(-2)     // [4, 5]

// splice — mutating insert/remove at index
const arr = [1, 2, 3]
arr.splice(1, 1, 'x')  // [1, 'x', 3]

// with — non-mutating element replacement (ES2023)
const arr2 = [1, 2, 3].with(1, 'x')  // [1, 'x', 3]
```
::

## Searching

::code-wrapper{language="javascript"}
```javascript
const arr = [1, 2, 3, 2, 1]

arr.indexOf(2)       // 1 (first occurrence)
arr.lastIndexOf(2)   // 3
arr.includes(3)      // true
arr.indexOf('2')     // -1 (strict equality — '2' !== 2)

// ⚠️ includes uses SameValueZero (like Object.is)
[NaN].includes(NaN)  // true (unlike indexOf)
[NaN].indexOf(NaN)   // -1
```
::

## Joining and Splitting

::code-wrapper{language="javascript"}
```javascript
// Join
[1, 2, 3].join('-')      // "1-2-3"
[1, 2, 3].join()         // "1,2,3" (default comma)
['a', 'b'].join('')      // "ab"

// Split (string → array)
'a,b,c'.split(',')       // ['a', 'b', 'c']
'hello'.split('')        // ['h','e','l','l','o']
'one two three'.split(' ') // ['one','two','three']
```
::

## Best Practice: Immutable Array Updates

::code-wrapper{language="javascript"}
```javascript
// Add — non-mutating
const addItem = (arr, item) => [...arr, item]
const prependItem = (arr, item) => [item, ...arr]

// Remove by index — non-mutating
const removeAt = (arr, index) => [...arr.slice(0, index), ...arr.slice(index + 1)]

// Update by index — non-mutating
const updateAt = (arr, index, value) => arr.with(index, value)
// or: arr.map((item, i) => i === index ? value : item)

// Remove by predicate — non-mutating
const removeWhere = (arr, predicate) => arr.filter(x => !predicate(x))
```
::

## 💡 Tips & Tricks

**Use `findIndex` before `splice`** — `const i = arr.findIndex(x => x.id === 5); if (i >= 0) arr.splice(i, 1)` is cleaner than nested loops.

**`flatMap` removes holes** — `[1, , 3].flatMap(x => x)` returns `[1, 3]` (holes removed), but `[1, , 3].map(x => x)` returns `[1, empty, 3]`. Use `flatMap` to clean sparse arrays.

**`reduce` for transforming shape** — Not just sums. `users.reduce((acc, u) => { acc[u.id] = u; return acc }, {})` is a map-by-id in one line.

**`Array.from` with mapping** — `Array.from({length: 5}, (_, i) => i * 2)` creates `[0, 2, 4, 6, 8]`. Avoid `new Array(5).map()` which skips holes.

**Short-circuit with `some`/`every`** — These stop early when condition is met. `array.some(x => expensive(x))` is faster than `.find()` if you only need boolean.

## ⚠️ Edge Cases & Gotchas

**Array holes cause `.map()` to skip** — `[1, , 3].map(x => x * 2)` is `[2, empty, 6]`. Holes are not undefined; they're skipped. Create with `Array(5)` and you get holes. Use `Array.from({length: 5})` or `[...Array(5)]` to fill with undefined.

**`.sort()` mutates and sorts as strings** — `[10, 2, 1].sort()` is `[1, 10, 2]` (string comparison). Missing comparator is a classic bug. Always pass `(a, b) => a - b`.

**`.reduce()` without initial value fails on empty arrays** — `[].reduce((a, x) => a + x)` throws TypeError. Always provide initial value: `[].reduce((a, x) => a + x, 0)` → `0`.

**`includes` vs `indexOf` with NaN** — `[NaN].includes(NaN)` is true; `[NaN].indexOf(NaN)` is -1. Use `includes` if you need to find NaN.

**Spread copies are shallow** — `[...arr]` copies the array, but nested objects are still references. Deep copy with `JSON.parse(JSON.stringify(arr))` (loses functions) or use a library.

**`.splice()` is confusing** — `arr.splice(2, 1, 'x')` removes 1 item at index 2 and inserts 'x'. It **mutates** the original. Use `.slice()` for non-mutating extracts.

## 🧠 Spot the Bug

What does this log?

::code-wrapper{language="javascript"}
```javascript
const arr = [1, 2, 3]
const sorted = arr.sort((a, b) => b - a)
const mapped = arr.map(x => x * 2)

console.log(sorted, mapped)
console.log(arr)
```
::

<details>
<summary>Answer</summary>

Logs `[3, 2, 1] [6, 4, 2]` then `[3, 2, 1]`. Here's why:
- `.sort()` **mutates** the original array
- `arr` is now `[3, 2, 1]`, so `.map()` operates on the sorted array
- Final `arr` is still `[3, 2, 1]` (mutated)

**The lesson**: `.sort()` and `.splice()` mutate. Use `.toSorted()` (ES2023) for immutability.

</details>

## Key Takeaways

- `map`/`filter`/`reduce` are the core of functional array processing.
- `sort()` mutates and sorts as strings by default — always pass a comparator.
- Use `toSorted`/`toReversed`/`with` (ES2023) for non-mutating operations.
- `includes` uses `SameValueZero` — correctly finds `NaN`, `indexOf` does not.
- Always pass an initial value to `reduce` — prevents errors on empty arrays.
- Holes (`[1, , 3]`) are skipped by `map` but not by `flatMap` — avoid them.