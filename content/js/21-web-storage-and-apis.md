---
title: "JavaScript 21 — Storage Architecture: localStorage, IndexedDB & Fetch API Internals"
description: "Deep-dive into browser storage: localStorage/sessionStorage serialization, IndexedDB transactions and async stores, Fetch API streaming, and the Cache API for offline-first patterns. Code-first reference for senior engineers."
---

# 21 — Storage Architecture: localStorage, IndexedDB & Fetch API Internals

## localStorage / sessionStorage: Synchronous Key-Value

::code-wrapper{language="javascript"}
```javascript
// ── localStorage: persistent, synchronous, ~5-10MB, strings only ──
// ── sessionStorage: per-tab, cleared on tab close ──

// ── API (synchronous — blocks the main thread) ──
localStorage.setItem("key", "value");    // store (must be a string)
localStorage.getItem("key");              // retrieve (returns string or null)
localStorage.removeItem("key");          // delete one
localStorage.clear();                     // delete all
localStorage.length;                      // number of items
localStorage.key(0);                     // key at index (iteration)

// ── Storing objects (must serialize — only strings) ──
const config = { host: "localhost", port: 3000 };
localStorage.setItem("config", JSON.stringify(config));  // serialize
const loaded = JSON.parse(localStorage.getItem("config"));  // deserialize

// ── ⚠️ localStorage is synchronous (blocks the main thread) ──
// ⚠️ Quota exceeded throws (can't catch with async — it's synchronous)
try {
    localStorage.setItem("large", "x".repeat(10_000_000));
} catch (e) {
    if (e.name === "QuotaExceededError") {
        console.log("storage full");  // ~5-10MB limit
    }
}

// ── Storage event (cross-tab synchronization) ──
window.addEventListener("storage", (e) => {
    // Fires in OTHER tabs when localStorage changes (not the tab that made the change)
    console.log("key:", e.key);       // changed key (null if clear())
    console.log("old:", e.oldValue);  // old value (null if new key)
    console.log("new:", e.newValue);  // new value (null if removed)
});
// Use case: sync state across tabs (e.g., logout in one tab → all tabs update)
```
::

## IndexedDB: Asynchronous Transactional Store

::code-wrapper{language="javascript"}
```javascript
// ── IndexedDB: async, transactional, ~50MB-unlimited, stores objects ──
// Much more powerful than localStorage, but complex API.

// ── Open a database ──
const request = indexedDB.open("MyApp", 1);  // name, version
request.onupgradeneeded = (e) => {
    // Called when the DB is created or version changes — create stores here
    const db = e.target.result;
    if (!db.objectStoreNames.contains("users")) {
        const store = db.createObjectStore("users", { keyPath: "id" });
        store.createIndex("email", "email", { unique: true });  // index for queries
    }
};
request.onsuccess = (e) => {
    const db = e.target.result;
    // Use the database...
};

// ── Promisified IndexedDB wrapper ──
function idbGetAll(db, storeName) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// ── Full promisified wrapper (modern approach) ──
const openDB = (name, version, onUpgrade) =>
    new Promise((resolve, reject) => {
        const req = indexedDB.open(name, version);
        req.onupgradeneeded = (e) => onUpgrade(e.target.result);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

async function dbExample() {
    const db = await openDB("MyApp", 1, (db) => {
        const store = db.createObjectStore("users", { keyPath: "id" });
        store.createIndex("email", "email", { unique: true });
    });

    // Add (transaction → store → add)
    const tx = db.transaction("users", "readwrite");
    await new Promise((res, rej) => {
        const req = tx.objectStore("users").add({ id: 1, name: "Alice", email: "a@b.com" });
        req.onsuccess = res;
        req.onerror = () => rej(req.error);
    });

    // Query by index
    const emailIndex = db.transaction("users", "readonly").objectStore("users").index("email");
    const user = await new Promise((res, rej) => {
        const req = emailIndex.get("a@b.com");
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
    });
    console.log(user);  // { id: 1, name: "Alice", email: "a@b.com" }
}
```
::

## Fetch API: Request/Response and Streaming

::code-wrapper{language="javascript"}
```javascript
// ── Basic fetch (returns a Promise<Response>) ──
const response = await fetch("/api/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Alice" }),
});
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const data = await response.json();  // parse JSON (returns a Promise)

// ── Response properties ──
response.ok;           // true if status is 200-299
response.status;       // HTTP status code (200, 404, 500, etc.)
response.headers.get("Content-Type");  // read response headers
response.redirected;   // true if redirected
response.type;         // "basic", "cors", "opaque", "error"

// ── Body consumption methods (each can only be called ONCE — body is a stream) ──
await response.json();     // parse as JSON
await response.text();     // read as text
await response.blob();     // read as Blob (binary data)
await response.arrayBuffer(); // read as ArrayBuffer (raw bytes)
await response.formData(); // parse as FormData

// ── Streaming response (for large data — process chunks) ──
const response = await fetch("/api/stream");
const reader = response.body.getReader();
const decoder = new TextDecoder();
while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    console.log(decoder.decode(value, { stream: true }));  // process each chunk
}

// ── AbortController for cancellation ──
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 5000);
try {
    const response = await fetch("/api/slow", { signal: controller.signal });
    clearTimeout(timer);
    const data = await response.json();
} catch (e) {
    if (e.name === "AbortError") console.log("cancelled");
    else throw e;
}
```
::

## Production Pattern: Offline-First with Cache API

::code-wrapper{language="javascript"}
```javascript
// ── Cache API: store fetch responses for offline access (PWA pattern) ──
const CACHE_NAME = "app-v1";
const urlsToCache = ["/", "/index.html", "/styles.css", "/app.js"];

// Install: pre-cache critical resources
async function cacheResources() {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(urlsToCache);  // fetch and store all
}

// Fetch: serve from cache, fall back to network
async function fetchWithCache(request) {
    const cached = await caches.match(request);
    if (cached) return cached;  // cache hit (offline-first)
    // Cache miss → fetch from network
    const response = await fetch(request);
    if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());  // cache for next time (clone — body can only be consumed once)
    }
    return response;
}

// Stale-while-revalidate (serve cache immediately, update in background)
async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    const fetchPromise = fetch(request).then(response => {
        if (response.ok) cache.put(request, response.clone());
        return response;
    });
    return cached || fetchPromise;  // serve cache immediately, update in background
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── Typed-safe localStorage wrapper ──
const storage = {
    get(key, defaultValue = null) {
        const value = localStorage.getItem(key);
        if (value === null) return defaultValue;
        try { return JSON.parse(value); } catch { return value; }
    },
    set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    },
    remove(key) { localStorage.removeItem(key); },
};

// ── Debounced localStorage writes (avoid excessive writes on input) ──
const debouncedSave = debounce((key, value) => storage.set(key, value), 500);
input.addEventListener("input", () => debouncedSave("draft", input.value));

// ── Fetch with retry and timeout ──
async function fetchWithRetry(url, { retries = 3, timeout = 5000 } = {}) {
    for (let i = 0; i < retries; i++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (e) {
            clearTimeout(timer);
            if (i === retries - 1) throw e;
            await new Promise(r => setTimeout(r, 1000 * 2 ** i));  // exponential backoff
        }
    }
}

// ── Cookie-based auth (not localStorage for security) ──
// Store auth tokens in httpOnly cookies (not accessible via JS — XSS-resistant)
// fetch includes cookies by default in same-origin requests
// For cross-origin: credentials: "include"
fetch("/api/user", { credentials: "include" });
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── localStorage is synchronous (blocks the main thread) ──
// ⚠️ Don't store large data in localStorage — it blocks the UI.
// Use IndexedDB for large data (async, non-blocking).

// ── localStorage stores strings only ──
localStorage.setItem("count", 42);  // stored as "42" (string)
const count = localStorage.getItem("count");  // "42" (string — must parse)
// Use JSON.stringify/parse for non-string values.

// ── localStorage quota (~5-10MB) — throws on overflow ──
try { localStorage.setItem("big", "x".repeat(20_000_000)); }
catch (e) { /* QuotaExceededError */ }

// ── localStorage is per-origin (protocol + domain + port) ──
// http://example.com and https://example.com have DIFFERENT localStorage

// ── fetch body can only be consumed ONCE ──
const response = await fetch("/api");
await response.text();   // consume body
// await response.json();  // ✗ TypeError: body already consumed
// Clone if you need to read twice: const clone = response.clone();

// ── fetch doesn't reject on HTTP errors (only on network errors) ──
const response = await fetch("/api/404");
// response.ok === false, but the Promise is RESOLVED (not rejected)
// Must check response.ok manually:
if (!response.ok) throw new Error(`HTTP ${response.status}`);

// ── IndexedDB transactions auto-commit if no operations are pending ──
// Don't mix async (await) between transaction creation and operation — the transaction
// may auto-commit before the operation runs.
```
::

## 🧠 Quick Quiz

Why does this throw a `TypeError`, and how do you fix it?

::code-wrapper{language="javascript"}
```javascript
const response = await fetch("/api/data");
const text = await response.text();
const json = JSON.parse(text);
const blob = await response.blob();  // TypeError!
```
::

<details>
<summary>Answer</summary>

The `response.body` is a **stream** — it can only be consumed **once**. After `await response.text()`, the stream is exhausted. Calling `await response.blob()` throws `TypeError: Body has already been consumed`.

**Fix**: clone the response before consuming (each clone has its own body stream):

```javascript
const response = await fetch("/api/data");
const clone = response.clone();  // create a copy with an independent body stream
const text = await response.text();
const blob = await clone.blob();  // ✓ works (clone has its own body)
```

Or, decide which format you need and consume it once:

```javascript
const response = await fetch("/api/data");
const json = await response.json();  // consume once as JSON
```

**The lesson**: a `Response` body is a one-time stream. Reading it with `.text()`, `.json()`, `.blob()`, or `.arrayBuffer()` consumes it permanently. Use `.clone()` if you need to read the body in multiple formats.

</details>