# 21 — Web Storage & APIs

## localStorage / sessionStorage

::code-wrapper{language="javascript"}
```javascript
// localStorage — persists until cleared
localStorage.setItem('theme', 'dark')
localStorage.getItem('theme')    // 'dark'
localStorage.removeItem('theme')
localStorage.clear()

// sessionStorage — cleared when tab closes
sessionStorage.setItem('temp', 'data')

// ⚠️ Only stores strings — JSON for objects
const user = { name: 'Alice', age: 30 }
localStorage.setItem('user', JSON.stringify(user))
const stored = JSON.parse(localStorage.getItem('user'))

// Edge case: storage events — fired in OTHER tabs
window.addEventListener('storage', (e) => {
  console.log(e.key, e.oldValue, e.newValue)
})
```

::

## Fetch API

::code-wrapper{language="javascript"}
```javascript
// GET
const res = await fetch('/api/users')
const data = await res.json()

// POST
const res = await fetch('/api/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Alice' })
})

// Error handling — fetch only rejects on network errors, not HTTP errors
if (!res.ok) throw new Error(`HTTP ${res.status}`)

// FormData
const form = document.querySelector('form')
const res = await fetch('/upload', { method: 'POST', body: new FormData(form) })

// AbortController — cancel requests
const controller = new AbortController()
fetch('/api/slow', { signal: controller.signal })
setTimeout(() => controller.abort(), 5000)
```

::

## IndexedDB

::code-wrapper{language="javascript"}
```javascript
// For larger structured data — async, transactional
const db = await new Promise((resolve, reject) => {
  const req = indexedDB.open('MyDatabase', 1)
  req.onupgradeneeded = (e) => {
    const db = e.target.result
    if (!db.objectStoreNames.contains('users')) {
      db.createObjectStore('users', { keyPath: 'id' })
    }
  }
  req.onsuccess = (e) => resolve(e.target.result)
  req.onerror = (e) => reject(e.target.error)
})

// Add
const tx = db.transaction('users', 'readwrite')
tx.objectStore('users').add({ id: 1, name: 'Alice' })
await new Promise(r => tx.oncomplete = r)
```

::

## 💡 Tips & Tricks

**Use the `storage` event for cross-tab sync** — Listening for `window.addEventListener('storage', ...)` lets one tab react instantly when another tab changes `localStorage` (e.g. logging out everywhere at once) — no polling needed.

**`AbortController` can cancel more than fetch** — The same `signal` can be passed to `addEventListener` and other abortable Web APIs, letting one controller tear down multiple in-flight operations together.

**Check storage quota before writing large blobs** — `navigator.storage.estimate()` returns `{ usage, quota }` so you can warn users before a large `localStorage`/IndexedDB write fails.

**Wrap `localStorage` calls in try/catch** — Reading or writing can throw in Safari private browsing mode or when quota is exceeded (`QuotaExceededError`) — always guard storage access in code that must run cross-browser.

**Use `structuredClone` instead of `JSON.parse(JSON.stringify())`** — For copying data before storing, `structuredClone(obj)` handles `Date`, `Map`, `Set`, and circular references that JSON round-tripping silently mangles or throws on.

## ⚠️ Edge Cases & Gotchas

**`localStorage` only stores strings — non-strings are coerced** — `localStorage.setItem('count', 5)` stores `"5"`, and `localStorage.setItem('user', {name: 'A'})` stores the literal string `"[object Object]"`, not JSON. Forgetting `JSON.stringify`/`JSON.parse` is one of the most common storage bugs.

**The `storage` event never fires in the tab that made the change** — Only *other* tabs/windows on the same origin receive the `storage` event; the tab that called `setItem` gets nothing, which surprises developers expecting to self-listen for consistency.

**`fetch()` does not reject on HTTP error status** — `fetch('/api/missing')` resolves successfully even for a 404 or 500 response; only network failures (DNS, CORS, offline) cause a rejection. Skipping the `if (!res.ok) throw ...` check means error pages get silently treated as success.

**IndexedDB transactions auto-commit on the next microtask** — Doing an `await` or other async work between two calls on the same transaction (e.g. `await fetch(...)` between two `.add()` calls) causes the transaction to close early, throwing `TransactionInactiveError` — all IndexedDB work in a transaction must happen synchronously (or via other IndexedDB requests) without yielding to unrelated async code.

**`sessionStorage` isn't shared even between tabs of the same page** — Opening the same URL in a new tab (not via `window.open` from an existing tab) starts with empty `sessionStorage`, unlike `localStorage` which is shared across all tabs on the origin — a frequent point of confusion for "why did my session data disappear."

## 🧠 Spot the Bug

What does this log?

::code-wrapper{language="javascript"}
```javascript
localStorage.setItem('settings', { theme: 'dark', fontSize: 14 })
const loaded = localStorage.getItem('settings')
console.log(loaded)
console.log(loaded.theme)
```
::

<details>
<summary>Answer</summary>

Logs `[object Object]` then `undefined`. `setItem` coerces its value with `String()` before storing, so the object becomes the literal string `"[object Object]"` — all the actual data (`theme`, `fontSize`) is lost the moment it's written, not when it's read back. Accessing `.theme` on that string returns `undefined` because strings have no such property.

**The lesson**: always `JSON.stringify()` before `setItem` and `JSON.parse()` after `getItem` — `localStorage` has no concept of objects, only strings.

</details>

## Key Takeaways

- `localStorage` persists; `sessionStorage` is per-tab — both store strings only.
- `fetch` rejects on **network errors**, not HTTP errors — always check `res.ok`.
- Use `AbortController` to cancel in-flight fetch requests.
- IndexedDB is for larger structured data — async, transactional, stores objects.