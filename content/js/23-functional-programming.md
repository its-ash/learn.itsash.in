# 23 — Functional Programming

## Core Principles

::code-wrapper{language="javascript"}
```javascript
// Pure functions — same input → same output, no side effects
const pure = (a, b) => a + b          // ✅ pure
const impure = (a) => a + Math.random() // ❌ impure (random)

// Immutability — don't mutate, create new
const add = (arr, val) => [...arr, val]    // ✅ new array
const badAdd = (arr, val) => { arr.push(val); return arr }  // ❌ mutates

// Composition — build from small functions
const pipe = (...fns) => x => fns.reduce((v, f) => f(v), x)
```

::

## Immutability Patterns

::code-wrapper{language="javascript"}
```javascript
// Array — non-mutating alternatives
const arr = [1, 2, 3]
const added = [...arr, 4]           // instead of push
const removed = arr.filter(x => x !== 2)  // instead of splice
const updated = arr.map(x => x === 2 ? 20 : x)  // instead of arr[1] = 20

// Object — non-mutating updates
const user = { name: 'Alice', age: 30 }
const updated = { ...user, age: 31 }  // shallow update
const { age, ...rest } = user          // delete key (age removed from rest)
```

::

## Key Takeaways

- Pure functions are testable, cacheable, and predictable — prefer them.
- Never mutate inputs — return new arrays/objects (spread, map, filter).
- `pipe`/`compose` build complex logic from small focused functions.