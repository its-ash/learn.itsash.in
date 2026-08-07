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

## 💡 Tips & Tricks

**Start independent operations before awaiting** — Instead of `await a; await b`, do `const p1 = a; const p2 = b; const [r1, r2] = await Promise.all([p1, p2])`. This runs them in parallel.

**Use `await` in loops carefully** — `for (const item of items) { await process(item) }` runs sequentially. Use `Promise.all(items.map(process))` for parallelism.

**Top-level `await` in modules** — Modern Node/browsers allow `await` outside `async` at module level. No need to wrap in async IIFE anymore.

**Error context is better than promises** — Stack traces in async/await show the exact line where you awaited. Promise chains hide the source. Use async/await in production for debuggability.

**Async functions always return Promises** — Even if you don't `await` anything, `async function f() { return 1 }` returns `Promise<1>`, not `1`. Remember this when mixing with callback code.

## ⚠️ Edge Cases & Gotchas

**Sequential awaits are slow** — `await a(); await b(); await c()` takes 6 seconds if each takes 2 seconds. Parallelize with `await Promise.all([a(), b(), c()])` for 2 seconds total.

**Forgot to await a promise** — `const result = fetch(url)` doesn't fetch; it returns a pending Promise. You get a promise in `result`, not data. Use `const result = await fetch(url)`.

**try/catch doesn't catch all errors** — Only catches errors from awaits or thrown in the try block. If an async task starts but doesn't await, errors are unhandled. Example: `try { setTimeout(() => throw new Error()) }` won't catch.

**Returning Promises from async functions** — `async function f() { return Promise.resolve(5) }` returns `Promise<Promise<5>>`, which auto-unwraps to `Promise<5>`. It works but looks weird.

**Async IIFE is clunky** — `(async () => { ... })()` was needed pre-ES2022. Modern code uses top-level await in modules. Avoid async IIFE if possible.

**await in map doesn't parallelize** — `items.map(async item => await process(item))` looks like it runs in parallel but it doesn't if you then `await` the map result. Await the individual promises later or use `Promise.all`.

## 🧠 Spot the Bug

What does this log?

```javascript
async function test() {
  const a = await Promise.resolve(1)
  const b = Promise.resolve(2)  // forgot await
  const c = await Promise.resolve(3)
  
  return [a, b, c]
}

test().then(([a, b, c]) => {
  console.log(typeof a, typeof b, typeof c)
})
```

<details>
<summary>Answer</summary>

Logs `number object number`. Here's why:
- `a` is 1 (awaited, so unwrapped)
- `b` is a Promise (forgot await, so it's the raw Promise object)
- `c` is 3 (awaited, so unwrapped)

**The lesson**: Forgetting `await` is subtle. `b` is still a Promise, not the value inside. Always await promises. Linters can catch this if configured.

</details>

## Key Takeaways

- `async`/`await` is syntactic sugar over Promises — same underlying mechanism.
- `await` pauses the function, not the event loop — other tasks can run.
- Use `Promise.all` for concurrent independent operations — avoid sequential awaits.
- Wrap in `try/catch` for error handling — same as synchronous code.