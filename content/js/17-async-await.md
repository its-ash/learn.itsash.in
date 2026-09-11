---
title: "JavaScript 17 — async/await Internals: Generator Semantics, Error Handling & Concurrency"
description: "Deep-dive into async/await: how await desugars to Promise.then, the suspension/resumption model, sequential vs concurrent execution, error handling patterns, and top-level await. Code-first reference for senior engineers."
---

# 17 — async/await Internals: Generator Semantics, Error Handling & Concurrency

## How `async/await` Desugars to Promises

::code-wrapper{language="javascript"}
```javascript
// ── `async function` always returns a Promise ──
// If you return a value, it's wrapped in Promise.resolve.
// If you throw, it's wrapped in Promise.reject.

async function foo() { return 42; }
foo();  // Promise { <fulfilled>: 42 } (returns a Promise, not 42 directly)

async function bar() { throw new Error("boom"); }
bar();  // Promise { <rejected>: Error: boom } (throws → rejected Promise)

// ── `await` suspends the function until the Promise settles ──
// await is syntactic sugar over .then — it pauses the async function, yielding to the event loop.

// async/await:
async function loadData() {
    const response = await fetch("/api/data");  // suspends until fetch resolves
    const data = await response.json();          // suspends until json resolves
    return data;
}

// Desugared (roughly — simplified):
function loadDataDesugared() {
    return fetch("/api/data")
        .then(response => response.json())
        .then(data => data);
}

// ── await unwraps the Promise value (or throws if rejected) ──
async function example() {
    try {
        const value = await Promise.resolve(42);  // unwraps → 42
        console.log(value);  // 42

        const error = await Promise.reject(new Error("fail"));  // throws
    } catch (e) {
        console.log("caught:", e.message);  // "caught: fail"
    }
}

// ── await on a non-Promise value ──
const result = await 42;  // wraps 42 in Promise.resolve(42) → unwraps to 42
const result2 = await null;  // wraps null → null
// await on a non-Promise is essentially synchronous (but still yields to the event loop once).
```
::

## Sequential vs Concurrent Execution

::code-wrapper{language="javascript"}
```javascript
// ❌ SLOW — sequential await (each waits for the previous to finish)
async function sequential() {
    const a = await fetch("/api/a");  // waits for A (2s)
    const b = await fetch("/api/b");  // waits for B (2s) — starts AFTER A finishes
    const c = await fetch("/api/c");  // waits for C (2s) — starts AFTER B finishes
    return [a, b, c];
}
// Total: 2 + 2 + 2 = 6s (sequential — each request waits for the previous)

// ✅ FAST — concurrent with Promise.all (all start at once)
async function concurrent() {
    const [a, b, c] = await Promise.all([
        fetch("/api/a"),  // starts immediately
        fetch("/api/b"),  // starts immediately (concurrent)
        fetch("/api/c"),  // starts immediately (concurrent)
    ]);
    return [a, b, c];
}
// Total: max(2, 2, 2) = 2s (concurrent — all start at the same time)

// ── Mixed: some sequential, some concurrent ──
async function mixed() {
    // Sequential: need the user ID before we can fetch posts
    const user = await fetch("/api/user").then(r => r.json());
    // Concurrent: fetch posts and friends in parallel (both need user.id)
    const [posts, friends] = await Promise.all([
        fetch(`/api/posts?userId=${user.id}`).then(r => r.json()),
        fetch(`/api/friends?userId=${user.id}`).then(r => r.json()),
    ]);
    return { user, posts, friends };
}

// ── Start a Promise without awaiting (fire and forget) ──
async function fireAndForget() {
    const promise = fetch("/api/log");  // start but don't await (don't block)
    doOtherWork();  // runs immediately (doesn't wait for fetch)
    await promise;  // await later (if you need the result)
}

// ── `await` yields to the event loop (microtask boundary) ──
async function yields() {
    console.log("A");
    await Promise.resolve();  // yields — other code can run here
    console.log("C");  // runs as a microtask (after current sync code)
}
console.log("B");
yields();
console.log("D");
// Output: B, A, D, C (await suspends, D runs, then C resumes as a microtask)
```
::

## Error Handling with `try/catch`

::code-wrapper{language="javascript"}
```javascript
// ── try/catch works with await (unlike Promises where you need .catch) ──
async function fetchData() {
    try {
        const response = await fetch("/api/data");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) {
            // Network error (fetch failed entirely)
            console.error("network error:", error.message);
        } else {
            // HTTP error (4xx, 5xx) or JSON parse error
            console.error("fetch error:", error.message);
        }
        throw error;  // re-throw for the caller to handle (or return a default)
    }
}

// ── Multiple awaits in one try (all share one catch) ──
async function pipeline() {
    try {
        const user = await getUser();      // any of these can throw
        const posts = await getPosts(user); // and all are caught here
        const comments = await getComments(posts[0]);
        return { user, posts, comments };
    } catch (error) {
        console.error("pipeline failed:", error);
        throw error;
    }
}

// ── Catch per await (different handling for each) ──
async function resilient() {
    let user;
    try {
        user = await getUser();
    } catch {
        user = { name: "anonymous" };  // fallback for user
    }

    let posts;
    try {
        posts = await getPosts(user);
    } catch {
        posts = [];  // fallback for posts
    }

    return { user, posts };
}

// ── finally with async/await ──
async function withCleanup() {
    const resource = await acquireResource();
    try {
        return await useResource(resource);
    } finally {
        await releaseResource(resource);  // runs on both success and error
    }
}
```
::

## Anti-Pattern: `await` in a Loop (Sequential When You Want Concurrent)

::code-wrapper{language="javascript"}
```javascript
// ❌ NAIVE — await in a loop (sequential — slow!)
async function fetchAll(urls) {
    const results = [];
    for (const url of urls) {
        results.push(await fetch(url).then(r => r.json()));  // waits for each, one at a time
    }
    return results;  // total time: sum of all requests (very slow for many URLs)
}

// ✅ CORRECT — Promise.all for concurrent execution
async function fetchAllConcurrent(urls) {
    const promises = urls.map(url => fetch(url).then(r => r.json()));  // start all immediately
    return Promise.all(promises);  // wait for all (total: max time)
}

// ✅ ALSO CORRECT — for loops that MUST be sequential (each depends on the previous)
async function processSequentially(items) {
    const results = [];
    for (const item of items) {
        // Must wait for each because the next depends on the previous result
        const processed = await processItem(item, results.at(-1));
        results.push(processed);
    }
    return results;
}

// ✅ LIMITED CONCURRENCY — process in batches (avoid overwhelming the server)
async function fetchInBatches(urls, batchSize = 5) {
    const results = [];
    for (let i = 0; i < urls.length; i += batchSize) {
        const batch = urls.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map(url => fetch(url).then(r => r.json()))
        );
        results.push(...batchResults);
    }
    return results;
}
```
::

## Top-Level Await (ES2022)

::code-wrapper{language="javascript"}
```javascript
// ── Top-level await: use await outside an async function (ESM only) ──
// Only in ES Modules (not CommonJS, not scripts without type:module)

// config.js (ESM):
// const response = await fetch("/config.json");
// const config = await response.json();
// export default config;

// ⚠️ Top-level await blocks all modules that import this one:
// If another module imports config.js, it waits for the fetch to complete.
// This can slow down the entire module graph.
// Use sparingly — prefer dynamic import for lazy loading.

// ── Workaround for non-ESM (IIFE wrapper) ──
// In CJS or browser scripts (no top-level await):
(async () => {
    const config = await fetch("/config.json").then(r => r.json());
    initApp(config);
})();  // async IIFE — runs immediately, doesn't block

// ── Common top-level await pattern: initialize before export ──
// db.js:
let db;
const dbPromise = initDatabase().then(connection => { db = connection; });
await dbPromise;  // top-level await — blocks importers until DB is ready
export { db };

// app.js:
// import { db } from "./db.js";  // waits for db.js to finish (db is initialized)
```
::

## Production Pattern: Async Iterator

::code-wrapper{language="javascript"}
```javascript
// ── for await...of: iterate over async iterables (streams, paginated APIs) ──
async function* paginate(url) {
    let page = 1;
    while (true) {
        const response = await fetch(`${url}?page=${page}`);
        const data = await response.json();
        if (data.length === 0) break;  // no more pages
        yield* data;  // yield each item from the page
        page++;
    }
}

// Consume with for await...of:
for await (const item of paginate("/api/items")) {
    console.log(item);  // process each item as it arrives
}

// ── Async generator for a stream ──
async function* readLines(stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();  // keep the last partial line in the buffer
        for (const line of lines) yield line;
    }
    if (buffer) yield buffer;  // yield the last line
}

// Consume a fetch response line by line:
const response = await fetch("/api/stream");
for await (const line of readLines(response.body)) {
    console.log("line:", line);
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── `await` on a non-Promise (wraps in Promise.resolve) ──
const value = await 42;  // Promise.resolve(42) → 42 (effectively synchronous but yields once)

// ── `Promise.all` with map (concurrent mapping) ──
const results = await Promise.all(items.map(async item => {
    return await processItem(item);  // all items processed concurrently
}));

// ── `Promise.allSettled` for "try all, report failures" ──
const results = await Promise.allSettled(items.map(item => processItem(item)));
results.forEach((r, i) => {
    if (r.status === "fulfilled") console.log(`item ${i}: ok`);
    else console.log(`item ${i}: failed -`, r.reason.message);
});

// ── AbortController for cancellable async ──
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);  // 5s timeout
try {
    const data = await fetch(url, { signal: controller.signal });
} catch (err) {
    if (err.name === "AbortError") console.log("cancelled");
}

// ── `await` in any expression (not just statements) ──
const result = (await getData()).filter(x => x.active).map(x => x.name);
// ⚠️ await has lower precedence than .filter/.map — it waits for getData() first,
// then the chain runs on the result. Wrap in parens if needed: await (getData().then(...)).

// ── `async` arrow functions ──
const asyncArrow = async (x) => { return await fetch(`/${x}`); };
const asyncArrow2 = async (x) => fetch(`/${x}`);  // fetch returns a Promise → await is optional
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── `await` in a regular `for` loop is sequential (not concurrent) ──
for (const url of urls) {
    await fetch(url);  // waits for each URL one at a time (slow)
}
// Use Promise.all for concurrency: await Promise.all(urls.map(fetch));

// ── `await` in `.map` doesn't work without `async` ──
urls.map(url => await fetch(url));  // ✗ SyntaxError: await in non-async function
urls.map(async url => await fetch(url));  // ✓ async callback — but returns an array of Promises!
// Must await Promise.all: await Promise.all(urls.map(async url => await fetch(url)));

// ── `forEach` doesn't await (it's not async-aware) ──
items.forEach(async item => {
    await process(item);  // forEach doesn't wait — all items start at once (fire and forget)
});
console.log("done");  // logs before any process() completes (forEach doesn't await)
// Fix: use for...of (sequential) or Promise.all (concurrent)

// ── Unhandled rejection in async function ──
async function f() { throw new Error("oops"); }
f();  // UnhandledPromiseRejection (no .catch, no try/catch in caller)
// Fix: f().catch(console.error) or try { await f() } catch { ... }

// ── Top-level await is ESM-only ──
// In CommonJS or non-module scripts, top-level await is a SyntaxError.
// Use async IIFE: (async () => { await ... })();

// ── `return await` vs `return Promise` (minor performance difference) ──
async function f1() { return Promise.resolve(42); }  // returns the Promise directly (no await overhead)
async function f2() { return await Promise.resolve(42); }  // awaits first, then wraps in Promise.resolve
// `return await` adds an extra microtask tick (negligible, but matters for stack traces and finally blocks)
// `return await` ensures finally blocks run before the Promise resolves (important for cleanup).
```
::

## 🧠 Quick Quiz

What's the output order?

::code-wrapper{language="javascript"}
```javascript
async function test() {
    console.log("A");
    await Promise.resolve();
    console.log("C");
}
console.log("B");
test();
console.log("D");
```
::

<details>
<summary>Answer</summary>

```
B
A
D
C
```

1. `B` — `console.log("B")` runs first (synchronous, before `test()` is called)
2. `A` — `test()` is called: `console.log("A")` runs synchronously inside `test`
3. `test` hits `await` — **suspends** (returns control to the caller)
4. `D` — `console.log("D")` runs (back in the main thread, `test` is suspended)
5. `C` — `test` resumes as a microtask (after the current synchronous code finishes): `console.log("C")`

**The lesson**: `await` suspends the async function and yields control back to the caller. The code after `await` runs as a **microtask** (after the current synchronous code completes). This is why `D` prints before `C` even though `C` appears earlier in the source.

</details>