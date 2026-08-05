# 17 — Async / Await

## Basics

::code-wrapper{language="javascript"}
```javascript
// async functions always return a Promise
async function fetchUser(id) {
  const res = await fetch(`/api/users/${id}`)
  const user = await res.json()
  return user
}

// Equivalent to:
function fetchUser(id) {
  return fetch(`/api/users/${id}`)
    .then(res => res.json())
}

// Usage
fetchUser(1).then(user => console.log(user))
```

::

## Error Handling

::code-wrapper{language="javascript"}
```javascript
async function fetchData() {
  try {
    const res = await fetch('/api/data')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data
  } catch (error) {
    console.error('Fetch failed:', error.message)
    throw error  // re-throw if caller should handle
  }
}
```

::

## Sequential vs Concurrent

::code-wrapper{language="javascript"}
```javascript
// ❌ Sequential — slow (each waits for previous)
async function sequential() {
  const a = await fetchA()  // 2s
  const b = await fetchB()  // 2s
  const c = await fetchC()  // 2s
  return [a, b, c]  // total: 6s
}

// ✅ Concurrent — fast (all start at once)
async function concurrent() {
  const [a, b, c] = await Promise.all([fetchA(), fetchB(), fetchC()])
  return [a, b, c]  // total: 2s
}

// ✅ Sequential when dependent
async function dependent() {
  const user = await fetchUser(id)
  const orders = await fetchOrders(user.id)  // needs user.id
  return orders
}
```

::

## Key Takeaways

- `async`/`await` is syntactic sugar over Promises — same underlying mechanism.
- `await` pauses the function, not the event loop — other tasks can run.
- Use `Promise.all` for concurrent independent operations — avoid sequential awaits.
- Wrap in `try/catch` for error handling — same as synchronous code.