# 15 — Callbacks & the Event Loop

## The Event Loop

JavaScript is single-threaded. The event loop manages:

1. **Call Stack** — function execution
2. **Microtask Queue** — `Promise.then`, `queueMicrotask`, `MutationObserver`
3. **Macrotask Queue** — `setTimeout`, `setInterval`, `I/O`, `fetch`

::code-wrapper{language="javascript"}
```javascript
console.log('1. Start')

setTimeout(() => console.log('4. Timeout'), 0)

Promise.resolve().then(() => console.log('3. Microtask'))

console.log('2. End')

// Output order: 1, 2, 3, 4
// Microtasks run before macrotasks — even if both queued at same time
```

::

## Execution Order

::code-wrapper{language="javascript"}
```javascript
console.log('script start')

setTimeout(() => console.log('setTimeout'), 0)

Promise.resolve()
  .then(() => console.log('promise1'))
  .then(() => console.log('promise2'))

console.log('script end')

// Output:
// script start
// script end
// promise1
// promise2
// setTimeout
```

::

## Callbacks

::code-wrapper{language="javascript"}
```javascript
// Callback pattern — pass function to be called later
function fetchData(url, callback) {
  fetch(url)
    .then(res => res.json())
    .then(data => callback(null, data))
    .catch(err => callback(err))
}

fetchData('/api/users', (err, data) => {
  if (err) return console.error(err)
  console.log(data)
})
```

::

## Callback Hell (Pyramid of Doom)

::code-wrapper{language="javascript"}
```javascript
// ❌ Hard to read and maintain
getUser(userId, (err, user) => {
  if (err) return handleError(err)
  getOrders(user.id, (err, orders) => {
    if (err) return handleError(err)
    getOrderItems(orders[0].id, (err, items) => {
      if (err) return handleError(err)
      getProducts(items[0].productId, (err, product) => {
        if (err) return handleError(err)
        console.log(product)
      })
    })
  })
})
```

::

## Best Practices with Callbacks

::code-wrapper{language="javascript"}
```javascript
// ✅ Error-first convention (Node.js style)
function asyncOperation(data, callback) {
  if (!data) return callback(new Error('No data'))
  setTimeout(() => callback(null, result), 100)
}

// ✅ Named functions instead of inline
function handleUser(err, user) {
  if (err) return console.error(err)
  getOrders(user.id, handleOrders)
}

function handleOrders(err, orders) {
  if (err) return console.error(err)
  console.log(orders)
}

getUser(userId, handleUser)

// ✅ Use Promises or async/await instead of callbacks when possible
```

::

## `queueMicrotask`

::code-wrapper{language="javascript"}
```javascript
// Schedule a microtask — runs after current task, before any macrotask
queueMicrotask(() => {
  console.log('runs as microtask')
})

// vs setTimeout (macrotask)
setTimeout(() => {
  console.log('runs as macrotask')
}, 0)

// queueMicrotask runs first
```

::

## 💡 Tips & Tricks

**Microtasks run between macrotasks** — If you queue a microtask from a macrotask, it runs before the next macrotask. Useful for batching DOM updates: `queueMicrotask(() => render())`.

**setTimeout(fn, 0) is not "immediate"** — It's "after all microtasks." There's always a delay. Use `Promise.resolve().then()` if you need to defer without delay.

**Inspect microtask vs macrotask timing** — Put `console.time`/`console.timeEnd` around code to see actual delays. Helps diagnose event loop issues.

**Promises in loops serialize** — `promises.map(p => p.then(...))` is fine, but `promises.forEach(p => await p)` is slow (sequential). Use `Promise.all()` for parallelism.

## ⚠️ Edge Cases & Gotchas

**setTimeout with small delays don't work** — `setTimeout(fn, 0)` is clamped to 4ms minimum in browsers (1ms in some). Actual delay can be much longer if event loop is busy.

**Blocking the event loop hangs the browser** — Long loops, crypto operations, or heavy parsing freeze the UI. Move work to Web Workers or break into chunks with `setTimeout`.

**Callbacks aren't truly concurrent** — They're interleaved on a single thread. If callback A takes 10ms, callback B waits. This isn't "parallel" like threads; it's "cooperative concurrency."

**Promise and setTimeout interleaving is confusing** — Microtasks queue differently than macrotasks. `setTimeout` -> run one -> check microtasks -> `setTimeout` -> ... . Hard to reason about without drawing diagrams.

**Forgotten callbacks leak memory** — If a callback captures huge data and is never called, the data is kept alive. Subscriptions without unsubscribe are a common leak source.

**Mixing Promise and callback styles is error-prone** — `asyncFn().then().catch()` and `.catch((err) => callback(err))` style can cause double-handling or missed errors. Use one style consistently.

## 🧠 Spot the Bug

What's the output order?

```javascript
console.log('1')

setTimeout(() => console.log('2'), 0)

Promise.resolve()
  .then(() => {
    console.log('3')
    return new Promise(resolve => {
      resolve()
      console.log('4')
    })
  })
  .then(() => console.log('5'))

queueMicrotask(() => console.log('6'))

console.log('7')
```

<details>
<summary>Answer</summary>

Logs: `1 7 3 4 6 5 2`. Here's why:
- `1`, `7` — synchronous code runs first
- `3`, `4` — first promise `.then()` runs (microtask), `4` logs before resolve returns
- `6` — `queueMicrotask` is another microtask
- `5` — second `.then()` runs (chained microtask)
- `2` — `setTimeout` is a macrotask (runs last)

**The lesson**: Microtasks run before macrotasks, even if queued later. Promise construction runs synchronously; the `.then()` is microtask.

</details>

## Key Takeaways

- JS is single-threaded — async operations go to the event loop, not new threads.
- **Microtasks** (Promises) run before **macrotasks** (setTimeout) — always.
- The call stack must be empty before the event loop processes the task queue.
- Callback hell is solved by Promises and async/await — use them instead.
- Error-first callback convention is standard in Node.js APIs.