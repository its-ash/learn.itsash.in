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

## Key Takeaways

- JS is single-threaded — async operations go to the event loop, not new threads.
- **Microtasks** (Promises) run before **macrotasks** (setTimeout) — always.
- The call stack must be empty before the event loop processes the task queue.
- Callback hell is solved by Promises and async/await — use them instead.
- Error-first callback convention is standard in Node.js APIs.