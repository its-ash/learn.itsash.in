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

## Key Takeaways

- Promises represent async values — pending → fulfilled or rejected (one-time transition).
- `.then` returns a new promise — enabling chaining.
- `Promise.all` = all must succeed; `allSettled` = wait for all regardless; `race` = first wins; `any` = first success wins.
- Always use `.catch` or try/catch with async/await — unhandled rejections crash Node.js.