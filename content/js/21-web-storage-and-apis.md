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

## Key Takeaways

- `localStorage` persists; `sessionStorage` is per-tab — both store strings only.
- `fetch` rejects on **network errors**, not HTTP errors — always check `res.ok`.
- Use `AbortController` to cancel in-flight fetch requests.
- IndexedDB is for larger structured data — async, transactional, stores objects.