# 16 — Promises

## Promise States

A Promise has three states:
- **Pending** — initial, neither fulfilled nor rejected
- **Fulfilled** — operation completed (calls `.then`)
- **Rejected** — operation failed (calls `.catch`)

::code-wrapper{language="javascript"}
```javascript
const promise = new Promise((resolve, reject) => {
  const success = true
  if (success) {
    resolve('Done!')  // transitions to fulfilled
  } else {
    reject(new Error('Failed'))  // transitions to rejected
  }
})

promise
  .then(result => console.log(result))    // "Done!"
  .catch(error => console.error(error))
  .finally(() => console.log('Cleanup'))  // always runs
```

::

## Chaining

::code-wrapper{language="javascript"}
```javascript
fetch('/api/users/1')
  .then(res => res.json())
  .then(user => fetch(`/api/orders?userId=${user.id}`))
  .then(res => res.json())
  .then(orders => renderOrders(orders))
  .catch(err => console.error('Failed:', err))
  .finally(() => hideLoader())

// Return values from .then become the next .then's input
Promise.resolve(5)
  .then(x => x + 10)   // 15
  .then(x => x * 2)    // 30
  .then(x => console.log(x))  // 30
```

::

## `Promise.all` / `race` / `allSettled` / `any`

::code-wrapper{language="javascript"}
```javascript
// all — waits for ALL, rejects if ANY rejects
Promise.all([fetchA(), fetchB(), fetchC()])
  .then(([a, b, c]) => console.log(a, b, c))
  .catch(err => console.error('One failed:', err))

// allSettled — waits for ALL, never rejects, returns status objects
Promise.allSettled([fetchA(), fetchB()])
  .then(results => {
    results.forEach(r => {
      if (r.status === 'fulfilled') console.log(r.value)
      else console.error(r.reason)
    })
  })

// race — first to settle (resolve OR reject) wins
Promise.race([slowFetch(), timeout(5000)])
  .then(result => console.log('First:', result))
  .catch(err => console.error('Timed out or failed'))

// any — first to RESOLVE wins, rejects only if ALL reject
Promise.any([mightFail(), mightFail(), reliable()])
  .then(result => console.log('First success:', result))
```

::

## Static Helpers

::code-wrapper{language="javascript"}
```javascript
Promise.resolve(42)       // already fulfilled
Promise.reject(new Error('nope'))  // already rejected
Promise.all([p1, p2, p3]) // all must fulfill
```

::

## 💡 Tips & Tricks

**Always use `.catch()` at the end** — Attach `.catch()` after your chain to avoid unhandled rejections: `.then(...).then(...).catch(err => console.error(err))`.

**`Promise.allSettled` for fault tolerance** — When one failure shouldn't block others, use `allSettled`. It returns statuses, not just values.

**Promisify callbacks with `new Promise()`** — Wrap old callback-based APIs: `new Promise((resolve, reject) => fs.readFile(..., (err, data) => err ? reject(err) : resolve(data)))`.

**Timeout pattern** — `Promise.race([fetch(url), new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 5000))])` adds timeout.

**Promise chains are hard to debug** — Stack traces break at each `.then()`. Use async/await for better error stacks in production.

## ⚠️ Edge Cases & Gotchas

**`.then()` without `.catch()` swallows errors** — If a promise rejects and there's no `.catch()`, the error is silently lost (until Node 15+, which warns about unhandled rejections).

**Returning values from `.then()` matters** — Forgetting `return` in a `.then()` handler returns `undefined`. The next `.then()` gets `undefined`, not the value you computed. This is a classic gotcha.

**`Promise.all([])` resolves immediately** — Empty array resolves to empty array instantly. Not a bug, but can be surprising in edge cases.

**Rejections in `.finally()` override original result** — If `.finally()` throws or rejects, it replaces the original rejection/value. Use `finally` only for cleanup that doesn't throw.

**`new Promise()` executor runs synchronously** — `new Promise((resolve, reject) => { console.log(1); resolve(2); })` logs 1 immediately, not when you call `.then()`. This confuses beginners.

**Promise chains don't await nested promises** — `Promise.resolve(Promise.resolve(5)).then(x => console.log(x))` logs 5, not a Promise. Promises auto-unwrap. But mixing is confusing.

## 🧠 Spot the Bug

What does this log?

::code-wrapper{language="javascript"}
```javascript
Promise.resolve(1)
  .then(x => x + 1)
  .then(x => { x + 2 })  // BUG: no return
  .then(x => console.log(x))

Promise.resolve(1)
  .then(x => x + 1)
  .then(x => x + 2)
  .then(x => console.log(x))
```
::

<details>
<summary>Answer</summary>

First logs `undefined`, second logs `4`. Here's why:
- First chain: `x + 2` is computed but not returned, so next `.then()` gets `undefined`
- Second chain: all values are returned, so they chain: 1 → 2 → 4

**The lesson**: Always `return` from `.then()` handlers. Forgetting return is the #1 promise bug.

</details>

## Key Takeaways

- Promises represent async values — pending → fulfilled or rejected (one-time transition).
- `.then` returns a new promise — enabling chaining.
- `Promise.all` = all must succeed; `allSettled` = wait for all regardless; `race` = first wins; `any` = first success wins.
- Always use `.catch` or try/catch with async/await — unhandled rejections crash Node.js.