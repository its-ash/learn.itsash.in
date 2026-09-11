---
title: "JavaScript 08 — Array Internals: Sparse Holes, Iteration Methods & Mutation Semantics"
description: "Deep-dive into JavaScript array mechanics: holes (empty slots) vs undefined, typed arrays, mutation vs non-mutation methods, reduce/fold patterns, and array-like objects. Code-first reference for senior engineers."
---

# 08 — Array Internals: Sparse Holes, Iteration Methods & Mutation Semantics

## Array Holes: Empty Slots vs `undefined`

::code-wrapper{language="javascript"}
```javascript
// ── Arrays with holes: empty slots (not the same as undefined) ──
const arr = [1, , 3];  // hole at index 1 (comma with nothing between)
console.log(arr.length);     // 3
console.log(arr[1]);         // undefined (accessing a hole returns undefined)
console.log(1 in arr);       // false — index 1 has NO element (it's a hole)
console.log(arr.hasOwnProperty(1));  // false — no property at index 1

// ── Holes vs explicit undefined: behavior differs across methods ──
const withHole = [1, , 3];
const withUndefined = [1, undefined, 3];

// ── forEach: SKIPS holes, visits undefined ──
withHole.forEach(x => console.log(x));     // 1, 3 (skips index 1!)
withUndefined.forEach(x => console.log(x));  // 1, undefined, 3 (visits all)

// ── map: SKIPS holes (preserves them) ──
console.log(withHole.map(x => x * 2));         // [2, <empty>, 6] (hole preserved)
console.log(withUndefined.map(x => x * 2));    // [2, NaN, 6] (undefined * 2 = NaN)

// ── filter: skips holes ──
console.log(withHole.filter(() => true));     // [1, 3] (hole skipped, not in result)
console.log(withUndefined.filter(() => true));  // [1, undefined, 3] (undefined kept)

// ── spread and Array.from: convert holes to undefined ──
console.log([...withHole]);  // [1, undefined, 3] (holes → undefined)
console.log(Array.from(withHole));  // [1, undefined, 3]

// ── Creating arrays with Array(n) (all holes) ──
const empty = Array(3);  // [empty × 3] — 3 holes (NOT 3 undefined values!)
console.log(empty.map(x => x));  // [empty × 3] — map skips holes, does nothing
console.log([...Array(3)]);      // [undefined, undefined, undefined] — spread fills with undefined
console.log(Array(3).fill(0));   // [0, 0, 0] — fill replaces holes with a value

// ── Array(n) vs Array.of(n) ──
Array(3);     // [empty × 3] — creates array with 3 holes (length 3)
Array.of(3);  // [3] — creates array with 3 as a single element
Array(1, 2, 3);   // [1, 2, 3] — multiple args → array of args
Array.of(1, 2, 3); // [1, 2, 3] — same with multiple args
```
::

## Mutation vs Non-Mutation Methods

::code-wrapper{language="javascript"}
```javascript
// ── MUTATING methods (modify the original array) ──
const arr = [3, 1, 2];

arr.push(4);       // [3, 1, 2, 4] — adds to end, returns new length
arr.pop();         // returns 4, arr is [3, 1, 2] — removes from end
arr.unshift(0);    // [0, 3, 1, 2] — adds to start (O(n) — shifts all elements!)
arr.shift();       // returns 0, arr is [3, 1, 2] — removes from start (O(n))
arr.sort();        // [1, 2, 3] — sorts IN PLACE (returns same array, modified!)
arr.reverse();    // [3, 2, 1] — reverses IN PLACE
arr.splice(1, 1);  // removes 1 element at index 1 — [3, 1] (mutates)
arr.fill(0);       // [0, 0] — fills with 0 IN PLACE

// ── NON-MUTATING methods (return a new array) ──
const arr2 = [3, 1, 2];

arr2.map(x => x * 2);       // [6, 2, 4] — new array, original unchanged
arr2.filter(x => x > 1);   // [3, 2] — new array
arr2.slice(0, 2);          // [3, 1] — new array (subarray)
arr2.concat([4, 5]);      // [3, 1, 2, 4, 5] — new array
arr2.flatMap(x => [x, x]); // [3, 3, 1, 1, 2, 2] — new array
[...arr2].sort();          // [1, 2, 3] — copy + sort (original unchanged)
```
::

## Anti-Pattern: `sort()` Without a Comparator

::code-wrapper{language="javascript"}
```javascript
// ❌ NAIVE — .sort() without a comparator converts to STRING and sorts lexicographically
[10, 2, 1, 21].sort();  // [1, 10, 2, 21] — string sort! ("10" < "2" because "1" < "2")
[100, 1, 2].sort();     // [1, 100, 2] — string sort!
["banana", "apple", "cherry"].sort();  // ["apple", "banana", "cherry"] — correct for strings

// ✅ CORRECT — numeric sort with comparator
[10, 2, 1, 21].sort((a, b) => a - b);  // [1, 2, 10, 21] — numeric ascending
[10, 2, 1, 21].sort((a, b) => b - a);  // [21, 10, 2, 1] — numeric descending

// ── Comparator semantics ──
// (a, b) => a - b  → ascending (return <0: a first, >0: b first, 0: equal)
// (a, b) => b - a  → descending
// ⚠️ The comparator must return a NUMBER (not boolean). Returning true/false is a bug.

// ── Sort by multiple criteria ──
const people = [
    { name: "Alice", age: 30 },
    { name: "Bob", age: 30 },
    { name: "Charlie", age: 25 },
];
people.sort((a, b) => a.age - b.age || a.name.localeCompare(b.name));
// Sort by age ascending, then name ascending (for ties)
// `||` falls through to the next criterion when the first returns 0 (tie)

// ── ⚠️ .sort() MUTATES the original array ──
const original = [3, 1, 2];
const sorted = original.sort();  // both `original` and `sorted` are [1, 2, 3]
console.log(original === sorted);  // true — same reference, original was modified!
// ✅ Non-mutating sort: const sorted = [...original].sort();
```
::

## `reduce`: The Fold Pattern

::code-wrapper{language="javascript"}
```javascript
// ── reduce: fold left (processes left-to-right) ──
// Signature: arr.reduce((accumulator, current, index, array) => newAccumulator, initialValue)

// ── Sum ──
const sum = [1, 2, 3, 4].reduce((acc, cur) => acc + cur, 0);  // 10
// Step: 0+1=1, 1+2=3, 3+3=6, 6+4=10

// ── Product ──
const product = [1, 2, 3, 4].reduce((acc, cur) => acc * cur, 1);  // 24

// ── Group by (object accumulator) ──
const people = [
    { role: "admin", name: "Alice" },
    { role: "user", name: "Bob" },
    { role: "admin", name: "Charlie" },
];
const grouped = people.reduce((acc, person) => {
    (acc[person.role] ??= []).push(person.name);  // ??= creates array if not exists
    return acc;
}, {});
// { admin: ["Alice", "Charlie"], user: ["Bob"] }

// ── reduceRight: fold right (processes right-to-left) ──
// Useful for building nested structures from inside-out
const piped = [double, addOne, square].reduceRight((acc, fn) => fn(acc), 5);
// Right-to-left: square(5)=25 → addOne(25)=26 → double(26)=52

// ── ⚠️ reduce on empty array without initial value throws ──
[].reduce((acc, cur) => acc + cur);  // TypeError: Reduce of empty array with no initial value
[].reduce((acc, cur) => acc + cur, 0);  // 0 — safe with initial value
// ALWAYS provide an initial value to avoid the empty array error and for clarity.
```
::

## Production Pattern: Pipeline Composition

::code-wrapper{language="javascript"}
```javascript
// ── Function pipeline using reduce ──
const pipe = (...fns) => (input) => fns.reduce((acc, fn) => fn(acc), input);

const pipeline = pipe(
    x => x + 1,       // 5 → 6
    x => x * 2,       // 6 → 12
    x => x - 3,       // 12 → 9
);
console.log(pipeline(5));  // 9

// ── Async pipeline (each step is async) ──
const pipeAsync = (...fns) => (input) =>
    fns.reduce(async (acc, fn) => fn(await acc), Promise.resolve(input));

const asyncPipeline = pipeAsync(
    async x => { await delay(100); return x + 1; },
    async x => { await delay(100); return x * 2; },
);
asyncPipeline(5).then(console.log);  // 12 (after ~200ms)

// ── Array flattening with flat and flatMap ──
[[1, 2], [3, 4], [5]].flat();       // [1, 2, 3, 4, 5] (1 level deep)
[[1, [2, [3]]]].flat();             // [1, 2, [3]] (1 level — [3] still nested)
[[1, [2, [3]]]].flat(Infinity);     // [1, 2, 3] (fully flat)
[1, 2, 3].flatMap(x => [x, x * 2]); // [1, 2, 2, 4, 3, 6] (map + flat in one pass)

// ── Chaining array methods (each creates a new array) ──
const result = [1, 2, 3, 4, 5, 6]
    .filter(x => x % 2 === 0)     // [2, 4, 6]
    .map(x => x * x)              // [4, 16, 36]
    .reduce((a, b) => a + b, 0);  // 56
// ⚠️ Each method creates an intermediate array (3 arrays total).
// For large arrays, a single reduce loop is more efficient (one pass, no intermediates).
```
::

## Array-Like Objects and Typed Arrays

::code-wrapper{language="javascript"}
```javascript
// ── Array-like: has .length and indexed access, but NOT array methods ──
const arrayLike = { 0: "a", 1: "b", length: 2 };
// arrayLike.map(...)  // TypeError: arrayLike.map is not a function
console.log(arrayLike[0]);  // "a" (indexed access works)
console.log(arrayLike.length);  // 2

// ── Convert array-like to real array ──
Array.from(arrayLike);     // ["a", "b"] — creates a real Array
[...arrayLike];            // ["a", "b"] — spread works on iterables (but arrayLike isn't iterable by default!)
// Actually: spread works on iterables; array-like objects aren't iterable unless they have Symbol.iterator.
// For array-like: use Array.from() (handles array-like) or Array.prototype.slice.call(arrayLike).

// ── Real array-like objects ──
// `arguments` object (in regular functions):
function example() {
    console.log(arguments);  // [Arguments] { '0': 1, '1': 2 } — array-like
    const args = Array.from(arguments);  // convert to real array
    console.log(args.map(x => x * 2));
}
example(1, 2);

// NodeList (from DOM):
// document.querySelectorAll("div")  — array-like, not a real Array
// const divs = Array.from(document.querySelectorAll("div"));

// ── Typed arrays: fixed-length, typed numeric arrays (for binary data) ──
const uint8 = new Uint8Array([255, 256, 257]);  // [255, 0, 1] (overflow: 256→0, 257→1)
const int32 = new Int32Array([1, 2, 3]);  // 32-bit signed integers
const float64 = new Float64Array([1.5, 2.5]);  // 64-bit floats
// Typed arrays:
//   - Fixed length (can't push/pop)
//   - All elements are the same type (no mixed types)
//   - Memory-efficient (no boxing, contiguous memory)
//   - Used for: binary protocols, canvas, WebGL, file I/O, crypto
const buffer = new ArrayBuffer(16);  // 16 bytes of raw memory
const view = new Uint8Array(buffer);  // view the buffer as bytes
view[0] = 255;
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── Array.from with a mapping function (map during creation) ──
Array.from({ length: 5 }, (_, i) => i);  // [0, 1, 2, 3, 4] — range generator
Array.from({ length: 3 }, () => Math.random());  // [random, random, random]

// ── Array.from with Set for deduplication ──
const unique = Array.from(new Set([1, 2, 2, 3, 3, 3]));  // [1, 2, 3]
// Or: [...new Set([1, 2, 2, 3])] — spread a Set (ES2015+)

// ── Finding: find and findIndex / findLast / findLastIndex (ES2023) ──
[1, 2, 3, 4].find(x => x > 2);          // 3 (first match)
[1, 2, 3, 4].findIndex(x => x > 2);     // 2 (index of first match)
[1, 2, 3, 4].findLast(x => x > 2);     // 4 (last match, ES2023)
[1, 2, 3, 4].findLastIndex(x => x > 2); // 3 (index of last match, ES2023)

// ── Includes vs indexOf (NaN handling) ──
[1, 2, NaN].includes(NaN);  // true (includes finds NaN!)
[1, 2, NaN].indexOf(NaN);   // -1 (indexOf can't find NaN — uses ===)

// ── at() for negative indexing (ES2022) ──
[1, 2, 3].at(-1);  // 3 (last element — cleaner than arr[arr.length - 1])
[1, 2, 3].at(-2);  // 2

// ── toSorted / toReversed / toSpliced / with (non-mutating, ES2023) ──
const arr = [3, 1, 2];
arr.toSorted((a, b) => a - b);  // [1, 2, 3] — new array, original unchanged
arr.toReversed();               // [2, 1, 3] — new array
arr.with(0, 99);                 // [99, 1, 2] — new array with index 0 replaced
// These are the non-mutating alternatives to sort/reverse/splice/[i]=
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── Holes are skipped by map/forEach/filter (unlike undefined) ──
[1, , 3].map(x => x * 2);     // [2, <empty>, 6] (hole preserved, not processed)
[1, undefined, 3].map(x => x * 2);  // [2, NaN, 6] (undefined * 2 = NaN)

// ── .sort() converts to string by default (lexicographic, not numeric) ──
[10, 2, 1].sort();  // [1, 10, 2] — "10" < "2" (string comparison)
// Always pass a comparator for numeric sort: .sort((a, b) => a - b)

// ── .sort() MUTATES the original array ──
const arr = [3, 1, 2];
const sorted = arr.sort();  // arr is now [1, 2, 3] (mutated!)
// Use [...arr].sort() for a non-mutating sort (or arr.toSorted() in ES2023)

// ── .includes() finds NaN, .indexOf() doesn't ──
[NaN].includes(NaN);  // true (uses SameValueZero algorithm)
[NaN].indexOf(NaN);   // -1 (uses strict equality ===, NaN !== NaN)

// ── .splice() mutates and returns removed elements ──
const arr = [1, 2, 3, 4];
const removed = arr.splice(1, 2, "a", "b");  // removes [2, 3], inserts ["a", "b"]
console.log(removed);  // [2, 3] (removed elements)
console.log(arr);     // [1, "a", "b", 4] (mutated)

// ── Array(n) creates holes, not undefined values ──
Array(3).map(x => 0);    // [empty × 3] — map skips holes, does nothing!
Array(3).fill(0).map(x => x + 1);  // [1, 1, 1] — fill first, then map
```
::

## 🧠 Quick Quiz

What does this output?

::code-wrapper{language="javascript"}
```javascript
const arr = [1, , 3];
console.log(arr.map(x => x * 2));
console.log(arr.filter(() => true));
console.log([...arr]);
console.log(arr.forEach(() => {}));
console.log(arr.indexOf(undefined));
```
::

<details>
<summary>Answer</summary>

```javascript
[2, <empty>, 6]   // map: skips holes (index 1 is a hole, not visited, preserved in output)
[1, 3]            // filter: skips holes (only non-hole elements pass through)
[1, undefined, 3] // spread: converts holes to undefined
undefined         // forEach: returns undefined (always); visits 1 and 3, skips hole at 1
-1                // indexOf: undefined is not at any index (the hole is NOT undefined)
```

**The key insight**: holes (empty slots from `[1, , 3]`) are NOT the same as `undefined`. Holes are missing properties — they have no value at all. Array methods like `map`, `forEach`, `filter`, and `reduce` **skip holes** entirely (don't call the callback for that index). But `undefined` is a real value that methods do process.

Spread (`[...arr]`) and `Array.from()` convert holes to `undefined` (they iterate using the array iterator, which yields undefined for holes).

`indexOf(undefined)` returns -1 because the hole has no value — it's not `undefined` in the array, it's a missing property. Use `arr.includes(undefined)` if you want to find holes (it returns true for `[1, , 3]`).

</details>