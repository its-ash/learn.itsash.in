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

## 💡 Tips & Tricks

**Memoize pure functions for free performance** — Since a pure function's output only depends on its input, you can cache results in a `Map` keyed by arguments: `const memo = new Map(); const cached = x => memo.has(x) ? memo.get(x) : memo.set(x, fn(x)).get(x)`. This is only safe because there are no side effects to worry about.

**`Object.freeze` enforces immutability at runtime** — `const config = Object.freeze({ url: '...' })` throws (in strict mode) or silently fails (non-strict) on mutation attempts — useful for catching accidental mutation bugs during development.

**Point-free style reads like a pipeline** — `const getNames = arr => arr.map(u => u.name)` can become `const getNames = arr => arr.map(prop('name'))` with a small `prop` helper, making transformations read declaratively instead of imperatively.

**Currying enables partial application for reuse** — `const multiply = a => b => a * b; const double = multiply(2)` — turns a generic function into specialized, reusable ones without rewriting logic.

**Structural sharing keeps immutable updates cheap** — Libraries like Immer let you "mutate" a draft while producing a new immutable object under the hood, avoiding the performance cost of deep-cloning large structures on every update.

## ⚠️ Edge Cases & Gotchas

**Spread only performs a shallow copy** — `const updated = { ...user, address: user.address }` still shares the same nested `address` object — mutating `updated.address.city` also mutates the original `user.address.city`, silently breaking the "immutability" you thought you had.

**`Object.freeze` is shallow too** — `Object.freeze({ nested: { a: 1 } })` prevents adding/removing/reassigning top-level keys, but `frozen.nested.a = 2` still works fine — nested objects are not frozen automatically.

**Array methods that look pure sometimes aren't** — `.sort()` and `.reverse()` mutate the array **in place** and also return it, unlike `.map()`/`.filter()`. `const sorted = arr.sort()` looks immutable but actually reorders `arr` itself — use `[...arr].sort()` or the newer `arr.toSorted()` to avoid the mutation.

**`Math.random()` inside a "pure-looking" arrow function breaks referential transparency** — `const roll = () => Math.random() > 0.5` produces different results for identical (zero) input, so it can't be memoized or reasoned about like a true pure function, even though it takes no arguments and looks side-effect-free.

**Destructuring rest (`...rest`) to "delete" a key still copies everything else** — `const { password, ...safeUser } = user` is a common pattern to strip sensitive fields, but on large objects this is an O(n) shallow copy every time — fine for typical use, but a hidden cost in hot loops over big records.

## 🧠 Spot the Bug

What does this log?

::code-wrapper{language="javascript"}
```javascript
const original = { name: 'Alice', tags: ['admin', 'staff'] }

function promote(user) {
  const updated = { ...user, tags: user.tags }
  updated.tags.push('superadmin')
  return updated
}

const promoted = promote(original)
console.log(original.tags)
console.log(promoted.tags)
```
::

<details>
<summary>Answer</summary>

Both log `["admin", "staff", "superadmin"]` — the spread `{ ...user, tags: user.tags }` copies the `tags` *reference*, not the array itself, because spread is shallow. Pushing to `updated.tags` mutates the exact same array that `original.tags` points to, so the "immutable-looking" update leaks a mutation back into the original object.

**The lesson**: shallow copies only protect the top level — nested arrays and objects need their own copy (`[...user.tags]` or `structuredClone`) to be truly immutable.

</details>

## Key Takeaways

- Pure functions are testable, cacheable, and predictable — prefer them.
- Never mutate inputs — return new arrays/objects (spread, map, filter).
- `pipe`/`compose` build complex logic from small focused functions.