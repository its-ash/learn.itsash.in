# 04 — Control Flow

## `if` / `else if` / `else`

::code-wrapper{language="javascript"}
```javascript
const score = 85

if (score >= 90) {
  console.log('A')
} else if (score >= 80) {
  console.log('B')
} else if (score >= 70) {
  console.log('C')
} else {
  console.log('F')
}

// Ternary alternative for simple cases
const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : 'F'
```
::

### Edge case: truthy/falsy in conditions

::code-wrapper{language="javascript"}
```javascript
// These are all falsy — condition is false
if (false) { }
if (0) { }
if ('') { }
if (null) { }
if (undefined) { }
if (NaN) { }

// These are truthy — condition is true
if ('0') { }       // non-empty string
if ([]) { }        // empty array
if ({}) { }        // empty object
if ('false') { }   // the string "false"
```
::

## `switch`

::code-wrapper{language="javascript"}
```javascript
const day = 'Monday'

switch (day) {
  case 'Monday':
  case 'Tuesday':
  case 'Wednesday':
  case 'Thursday':
  case 'Friday':
    console.log('Weekday')
    break
  case 'Saturday':
  case 'Sunday':
    console.log('Weekend')
    break
  default:
    console.log('Invalid day')
}
```
::

### Edge case: switch uses strict equality and fall-through

::code-wrapper{language="javascript"}
```javascript
// Switch uses === comparison
switch ('1') {
  case 1:    // false — '1' !== 1
    console.log('number')
    break
  case '1':  // true
    console.log('string')
    break
}

// Missing break → fall-through (usually a bug)
switch (2) {
  case 1:
    console.log('one')
  case 2:
    console.log('two')    // logs
  case 3:
    console.log('three')  // also logs! (fall-through)
    break
  case 4:
    console.log('four')   // skipped (break above)
}
```
::

## `for` Loops

::code-wrapper{language="javascript"}
```javascript
// Classic for loop
for (let i = 0; i < 5; i++) {
  console.log(i)   // 0, 1, 2, 3, 4
}

// for...of — iterates iterable values (arrays, strings, maps, sets)
for (const item of [1, 2, 3]) {
  console.log(item)  // 1, 2, 3
}

for (const char of 'hello') {
  console.log(char)  // h, e, l, l, o
}

// for...in — iterates enumerable property keys (objects)
// ⚠️ Do NOT use for...in on arrays — iterates indices as strings, includes prototype keys
for (const key in { a: 1, b: 2 }) {
  console.log(key)  // 'a', 'b'
  console.log(obj[key])  // 1, 2
}

// for...in includes inherited properties
const obj = Object.create({ inherited: true })
obj.own = true
for (const key in obj) {
  if (obj.hasOwnProperty(key)) console.log(key)  // 'own' only
}
```
::

### Best practice: choose the right loop

::code-wrapper{language="javascript"}
```javascript
// Arrays — use for...of or array methods
for (const item of array) { }          // values
array.forEach(item => { })             // values with index
array.map(x => x * 2)                  // transform
array.filter(x => x > 0)               // filter

// Objects — use Object.entries/keys/values
for (const [key, value] of Object.entries(obj)) { }

// Do NOT use for...in on arrays
for (const i in [10, 20, 30]) {
  console.log(typeof i)  // "string" ⚠️ — indices are strings in for...in
}
```
::

## `while` and `do...while`

::code-wrapper{language="javascript"}
```javascript
// while — condition checked first
let i = 0
while (i < 3) {
  console.log(i)
  i++
}

// do...while — runs at least once, then checks condition
let j = 5
do {
  console.log(j)  // logs 5 once even though condition is false
} while (j < 3)
```
::

## `break` and `continue`

::code-wrapper{language="javascript"}
```javascript
// break — exits the loop
for (let i = 0; i < 10; i++) {
  if (i === 5) break
  console.log(i)  // 0, 1, 2, 3, 4
}

// continue — skips to next iteration
for (let i = 0; i < 5; i++) {
  if (i === 2) continue
  console.log(i)  // 0, 1, 3, 4
}

// Labeled loops — break/continue outer loop
outer: for (let i = 0; i < 3; i++) {
  for (let j = 0; j < 3; j++) {
    if (j === 2) break outer   // exits both loops
    console.log(i, j)
  }
}
```
::

## Labeled Statements (rare but useful)

::code-wrapper{language="javascript"}
```javascript
search: for (const row of grid) {
  for (const cell of row) {
    if (cell === target) {
      console.log('Found!')
      break search
    }
  }
}
```
::

## `try` / `catch` / `finally`

::code-wrapper{language="javascript"}
```javascript
try {
  riskyOperation()
} catch (error) {
  console.error('Caught:', error.message)
} finally {
  // Always runs — even if try/catch returns or throws
  cleanup()
}

// try without catch (use with finally for cleanup)
try {
  doWork()
} finally {
  releaseResource()  // runs regardless of success/failure
}
```
::

## 💡 Tips & Tricks

**for...of is often faster than forEach** — Modern engines optimize `for...of` loops better than callbacks. If performance matters, use `for...of` over `.forEach()` or `.map()`.

**Short-circuit returns in guards** — Replace nested `if` with early returns:
::code-wrapper{language="javascript"}
```javascript
// Bad
if (user) {
  if (user.active) {
    return user.name
  }
}

// Good
if (!user || !user.active) return null
return user.name
```
::

**Switch without default can hide bugs** — Always add `default` and throw or log. Catches typos in case values.

**labeled break for nested loops** — Rarely needed, but `outerLoop: for (...) { for (...) { break outerLoop } }` is cleaner than setting flags.

## ⚠️ Edge Cases & Gotchas

**for...in includes inherited properties** — `for (const k in obj)` iterates inherited enumerable keys. Always use `hasOwnProperty` or use `Object.keys/values/entries` instead. This is a classic gotcha in inheritance chains.

**Switch fall-through is almost always a bug** — Missing `break` after a case silently falls through to the next. Use a linter to catch this. The only valid use: intentional case grouping (`case 'a': case 'b':` is OK).

**Truthy `if` with object/array** — `if ([])` is `true` (empty arrays are truthy). Don't use `if (arr)` to check if non-empty; use `if (arr.length)` instead. This trips up JavaScript beginners.

**finally runs even after return** — `try { return 5 } finally { x = 10 }` — the `finally` block *always* runs, even though you're returning. Useful for cleanup, but confusing if you're changing values that affect the return.

## 🧠 Spot the Bug

What gets logged?

::code-wrapper{language="javascript"}
```javascript
const result = []
for (let i = 0; i < 3; i++) {
  if (i === 1) continue
  result.push(i)
}

for (const key in { a: 1, b: 2, c: 3 }) {
  if (key === 'b') break
  result.push(key)
}

console.log(result)
```
::

<details>
<summary>Answer</summary>

Logs `[0, 2, 'a']`. Here's why:
- First loop: `i = 0` → push 0, skip 1 with `continue`, push 2
- Second loop: iterate keys in order, break when `key === 'b'` (only 'a' is pushed)

**The lesson**: `continue` skips to the next iteration; `break` exits the entire loop. Students often confuse these.

</details>

## Key Takeaways

- Use `for...of` for arrays, `Object.entries()` for objects, never `for...in` on arrays.
- `switch` uses `===` (strict equality) and falls through without `break`.
- `do...while` runs at least once — use when you need the first execution guaranteed.
- `break` and `continue` can target labeled loops for multi-level control.
- `finally` always runs — use it for cleanup regardless of try/catch outcome.