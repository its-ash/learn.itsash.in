---
title: "JavaScript 16 — Promise Internals: States, Chaining, Composition & Error Propagation"
description: "Deep-dive into JavaScript Promises: the three-state machine, then/catch/finally chaining, microtask scheduling, Promise composition (all/race/allSettled/any), and error propagation semantics. Code-first reference for senior engineers."
---

# 16 — Promise Internals: States, Chaining, Composition & Error Propagation

## The Promise State Machine

::code-wrapper{language="javascript"}
```javascript
// ── A Promise is a state machine with exactly 3 states ──
//
//   ┌──────────┐     resolve()     ┌───────────┐
//   │ PENDING  │ ────────────────→ │ FULFILLED │  (has a value)
//   │          │                   └───────────┘
//   │          │                   ┌───────────┐
//   │          │ ──reject()───────→ │  REJECTED │  (has a reason/error)
//   └──────────┘                   └───────────┘
//
// Transitions are ONE-WAY: once settled (fulfilled or rejected), a Promise can't change state.
// The value (or reason) is immutable after settlement.

// ── Creating a Promise ──
const pending = new Promise((resolve, reject) => {
    // The executor function runs SYNCHRONOUSLY when the Promise is created.
    // Call resolve(value) to fulfill, reject(error) to reject.
    // If neither is called, the Promise stays pending forever.
    setTimeout(() => resolve("done"), 1000);
});

// ── A Promise that's already settled (immediate) ──
const fulfilled = Promise.resolve(42);  // already fulfilled with 42
const rejected = Promise.reject(new Error("fail"));  // already rejected

// ── State transitions are permanent ──
const p = new Promise((resolve, reject) => {
    resolve("first");  // fulfilled with "first"
    resolve("second"); // IGNORED (already settled — can't change)
    reject("error");   // IGNORED (already settled)
});
p.then(v => console.log(v));  // "first" (only the first settlement counts)
```
::

## Chaining: `then`, `catch`, `finally`

::code-wrapper{language="javascript"}
```javascript
// ── .then(onFulfilled, onRejected) ──
// Returns a NEW Promise. The return value of the callback becomes the next Promise's value.
Promise.resolve(1)
    .then(v => v + 1)        // returns 2 → next Promise is fulfilled with 2
    .then(v => v * 3)        // returns 6
    .then(v => console.log(v));  // logs 6

// ── Returning a Promise from .then (unwraps automatically) ──
Promise.resolve(1)
    .then(v => fetch(`/api/${v}`))  // returns a Promise → unwrapped (waits for it)
    .then(response => response.json())  // returns another Promise → unwrapped
    .then(data => console.log(data));   // the resolved data

// ── .catch(onRejected) — shorthand for .then(null, onRejected) ──
Promise.reject(new Error("fail"))
    .catch(err => console.log("caught:", err.message));  // "caught: fail"

// ── .finally(onSettled) — runs on both fulfill and reject (no value change) ──
Promise.resolve("data")
    .finally(() => console.log("cleanup"))  // runs regardless (returns undefined → doesn't change value)
    .then(v => console.log("value:", v));    // "value: data" (finally didn't change the value)

// ── Error propagation: rejected Promises skip .then and jump to .catch ──
Promise.resolve()
    .then(() => { throw new Error("boom"); })  // throws → Promise rejects
    .then(() => console.log("skipped"))        // SKIPPED (previous rejected)
    .catch(err => console.log("caught:", err.message))  // "caught: boom"
    .then(() => console.log("after catch"));   // "after catch" (catch handled it → fulfilled)

// ── .then with onRejected (less readable than .catch) ──
Promise.reject("error")
    .then(
        v => console.log("fulfilled:", v),
        e => console.log("rejected:", e)  // handles rejection here
    );
// Prefer .catch over the second arg to .then for readability.
```
::

## Anti-Pattern: Nested Promises (Pyramid of Doom)

::code-wrapper{language="javascript"}
```javascript
// ❌ NAIVE — nesting Promises (callback hell with Promises)
fetch("/api/user/1")
    .then(user => {
        fetch(`/api/posts?userId=${user.id}`)
            .then(posts => {
                fetch(`/api/comments?postId=${posts[0].id}`)
                    .then(comments => {
                        console.log(comments);
                    });
            });
    });

// ✅ CORRECT — chain with return (each .then unwraps the returned Promise)
fetch("/api/user/1")
    .then(user => fetch(`/api/posts?userId=${user.id}`))
    .then(posts => fetch(`/api/comments?postId=${posts[0].id}`))
    .then(comments => console.log(comments))
    .catch(err => console.error("error:", err));
// Each .then returns a Promise → the next .then waits for it (flat chain, no nesting).

// ✅ BEST — async/await (syntactic sugar over Promise chains)
async function loadData() {
    try {
        const user = await fetch("/api/user/1");
        const posts = await fetch(`/api/posts?userId=${user.id}`);
        const comments = await fetch(`/api/comments?postId=${posts[0].id}`);
        console.log(comments);
    } catch (err) {
        console.error("error:", err);
    }
}
```
::

## Promise Composition: `all`, `race`, `allSettled`, `any`

::code-wrapper{language="javascript"}
```javascript
// ── Promise.all: wait for ALL to fulfill (or first rejection) ──
// Returns an array of results in the same order as the input.
const [user, posts] = await Promise.all([
    fetch("/api/user").then(r => r.json()),
    fetch("/api/posts").then(r => r.json()),
]);
// If ANY rejects, the whole Promise.all rejects immediately (others keep running but ignored).

// ── Promise.race: first to settle (fulfill or reject) wins ──
const fastest = await Promise.race([
    fetch("/api/fast"),
    fetch("/api/slow"),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
]);
// The first Promise to settle (fulfill or reject) determines the result.

// ── Promise.allSettled: wait for ALL, never rejects (returns status for each) ──
const results = await Promise.allSettled([
    fetch("/api/a").then(r => r.json()),
    fetch("/api/b").then(r => r.json()),
    fetch("/api/broken").then(r => r.json()),
]);
// [
//   { status: "fulfilled", value: dataA },
//   { status: "fulfilled", value: dataB },
//   { status: "rejected", reason: errorC },
// ]
for (const r of results) {
    if (r.status === "fulfilled") console.log("ok:", r.value);
    else console.log("error:", r.reason);
}

// ── Promise.any: first to FULFILL wins (ignores rejections) ──
const firstSuccess = await Promise.any([
    fetch("/api/primary").then(r => r.json()),     // might fail
    fetch("/api/fallback1").then(r => r.json()),    // might fail
    fetch("/api/fallback2").then(r => r.json()),    // succeeds → this wins
]);
// If ALL reject, Promise.any rejects with AggregateError (all errors).

// ── Comparison table ──
// | Method       | Waits for   | Rejects if          | Returns                     |
// |-------------|-------------|---------------------|-----------------------------|
// | all         | All fulfill | Any rejects         | Array of values (ordered)   |
// | race        | First settle| First rejects       | First value or error         |
// | allSettled  | All settle  | Never rejects       | Array of {status, value/reason} |
// | any         | First fulfill| All reject         | First value (AggregateError if all fail) |
```
::

## Error Propagation and Recovery

::code-wrapper{language="javascript"}
```javascript
// ── Errors skip .then handlers and propagate to .catch ──
Promise.resolve()
    .then(() => { throw new Error("A"); })   // throws → rejects
    .then(() => console.log("B"))            // SKIPPED (rejected)
    .then(() => console.log("C"))            // SKIPPED
    .catch(e => { console.log("caught:", e.message); return "recovered"; })  // catches → fulfills with "recovered"
    .then(v => console.log("D:", v));        // "D: recovered" (catch fulfilled the chain)

// ── A .catch that throws re-rejects (propagates further) ──
Promise.reject(new Error("original"))
    .catch(e => { console.log("caught:", e.message); throw new Error("re-thrown"); })
    .catch(e => console.log("caught again:", e.message));  // "caught again: re-thrown"

// ── Unhandled rejections (no .catch anywhere) ──
// Promise.reject(new Error("unhandled"));
// In Node: "UnhandledPromiseRejection" warning (or process exit with --unhandled-rejections=strict)
// In browser: "unhandledrejection" event fires
// Always add .catch (or use try/catch with async/await) to handle errors!

// ── Recovery with fallback ──
async function fetchWithFallback(url, fallbackUrl) {
    try {
        return await fetch(url).then(r => r.json());
    } catch {
        console.warn("primary failed, using fallback");
        return await fetch(fallbackUrl).then(r => r.json());
    }
}

// ── Graceful degradation with allSettled ──
async function loadWithOptionalEndpoints(critical, optional) {
    const [criticalResult, optionalResult] = await Promise.allSettled([
        fetch(critical).then(r => r.json()),
        fetch(optional).then(r => r.json()),
    ]);
    if (criticalResult.status === "rejected") throw criticalResult.reason;
    return {
        critical: criticalResult.value,
        optional: optionalResult.status === "fulfilled" ? optionalResult.value : null,
    };
}
```
::

## Production Pattern: Concurrent Fetch with Rate Limiting

::code-wrapper{language="javascript"}
```javascript
// ── Limit concurrent Promises (avoid overwhelming the server) ──
async function mapLimit(items, limit, asyncFn) {
    const results = [];
    let index = 0;

    async function worker() {
        while (index < items.length) {
            const i = index++;  // claim the next item (atomic increment)
            results[i] = await asyncFn(items[i], i);  // preserve order
        }
    }

    // Start `limit` workers (each processes items until exhausted)
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

// Usage: fetch 100 URLs with max 5 concurrent
const urls = Array.from({ length: 100 }, (_, i) => `https://api.example.com/${i}`);
const responses = await mapLimit(urls, 5, url =>
    fetch(url).then(r => r.json())
);

// ── Batch with retry and timeout ──
async function fetchWithRetry(url, { retries = 3, timeout = 5000 } = {}) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (err) {
            if (attempt === retries - 1) throw err;
            await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));  // exponential backoff
        }
    }
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── Promise.all for parallel execution (vs sequential await) ──
// ❌ SLOW — sequential (each waits for the previous):
const a = await fetch("/api/a");
const b = await fetch("/api/b");
const c = await fetch("/api/c");
// Total time: a + b + c (sum of all response times)

// ✅ FAST — parallel (all start at once):
const [a2, b2, c2] = await Promise.all([
    fetch("/api/a"),
    fetch("/api/b"),
    fetch("/api/c"),
]);
// Total time: max(a, b, c) (the slowest one)

// ── `Promise.resolve` to wrap a non-Promise value ──
const p = Promise.resolve(42);  // fulfilled with 42
// .then unwraps: p.then(v => console.log(v))  // 42

// ── `Promise.allSettled` for "try all, collect results" ──
const results = await Promise.allSettled(urls.map(url => fetch(url).then(r => r.json())));
const successes = results.filter(r => r.status === "fulfilled").map(r => r.value);
const failures = results.filter(r => r.status === "rejected").map(r => r.reason);

// ── `Promise.race` for timeout ──
function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
    ]);
}
const data = await withTimeout(fetch(url), 5000);  // rejects after 5s if fetch hasn't completed

// ── Defer a Promise resolve (manual control) ──
let resolveLater;
const deferred = new Promise(resolve => { resolveLater = resolve; });
// resolveLater(42);  // resolve later (manual control over when the Promise settles)
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── Unhandled rejections crash silently (or crash the process) ──
// Promise.reject(new Error("oops"));  // no .catch → UnhandledPromiseRejection
// Always add .catch or use async/await with try/catch.

// ── .then(onFulfilled, onRejected) — errors in onFulfilled are NOT caught by onRejected ──
Promise.resolve()
    .then(
        () => { throw new Error("in onFulfilled"); },
        (e) => console.log("in onRejected:", e)  // NOT called! (this catches rejections from the PREVIOUS Promise, not errors in onFulfilled)
    )
    .catch(e => console.log("caught:", e.message));  // "caught: in onFulfilled" (caught here, not in onRejected)

// ── .finally doesn't receive the value (and doesn't change it) ──
Promise.resolve("data")
    .finally(() => console.log("finally"))  // no argument — finally doesn't get the value
    .then(v => console.log(v));  // "data" (finally didn't change the value)
// If finally returns a value or throws, it DOES affect the chain:
Promise.resolve("data")
    .finally(() => "overridden")  // returns a value → but the original value is preserved (finally ignores return)
    .then(v => console.log(v));  // "data" (finally's return is ignored for non-throwing)

// ── Promise.all rejects on FIRST rejection (others keep running) ──
// Promise.all doesn't cancel the other Promises — they keep running (just ignored).
// Use AbortController to actually cancel ongoing fetches.

// ── Returning a non-Promise from .then wraps it in Promise.resolve ──
Promise.resolve(1)
    .then(v => v + 1)  // returns 2 (a number) → Promise.resolve(2) → next .then gets 2
    .then(v => { console.log(v) });  // 2

// ── Throwing in a .then rejects the returned Promise ──
Promise.resolve()
    .then(() => { throw new Error("boom"); })  // returns a rejected Promise
    .catch(e => console.log(e.message));  // "boom"
```
::

## 🧠 Quick Quiz

What's the output?

::code-wrapper{language="javascript"}
```javascript
Promise.resolve("A")
    .then(v => { console.log(v); return "B"; })
    .then(v => { console.log(v); throw "C"; })
    .then(v => console.log(v, "D"))
    .catch(e => console.log("E:", e))
    .finally(() => console.log("F"));
```
::

<details>
<summary>Answer</summary>

```
A
B
E: C
F
```

1. `"A"` — first .then: logs `"A"`, returns `"B"` → fulfills with `"B"`
2. `"B"` — second .then: logs `"B"`, throws `"C"` → rejects with `"C"`
3. Third .then is SKIPPED (previous rejected)
4. `.catch(e => ...)` — catches `"C"`, logs `"E: C"` → fulfills (catch handled it)
5. `"F"` — `.finally()` runs regardless → logs `"F"`

The third `.then` is skipped because the second `.then` threw (rejected). The `.catch` catches the rejection, and `.finally` runs regardless of fulfill/reject.

</details>