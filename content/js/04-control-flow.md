---
title: "JavaScript 04 — Control Flow Internals: Truthiness, Switch Fall-Through & Loop Optimizations"
description: "Deep-dive into JavaScript control flow: the ToBoolean coercion table, switch strict equality and fall-through semantics, loop types and engine optimization, labeled breaks, and the try/catch/finally interaction with return. Code-first reference for senior engineers."
---

# 04 — Control Flow Internals: Truthiness, Switch Fall-Through & Loop Optimizations

## Truthiness: The `ToBoolean` Coercion

::code-wrapper{language="javascript"}
```javascript
// ── 8 falsy values (everything else is truthy) ──
// false, 0, -0, 0n (BigInt zero), "", null, undefined, NaN

// ── Truthy values that surprise developers from other languages ──
if ([]) console.log("empty array is truthy");   // prints! (Python: falsy)
if ({}) console.log("empty object is truthy");   // prints! (Python: falsy)
if ("0") console.log("string '0' is truthy");    // prints! (non-empty string)
if ("false") console.log("string 'false' is truthy");  // prints! (non-empty string)
if (Infinity) console.log("Infinity is truthy");  // prints!
if (-1) console.log("negative numbers are truthy");  // prints! (only 0/-0 are falsy)

// ── Truthiness check via !! (double negation) ──
const isTruthy = (val) => !!val;
console.log(isTruthy(0));    // false
console.log(isTruthy(""));   // false
console.log(isTruthy([]));   // true (empty array is truthy!)
console.log(isTruthy(null)); // false

// ── Anti-pattern: checking length on a possibly-null array ──
// ❌ if (arr && arr.length > 0) — works but verbose
// ✅ if (arr?.length > 0) — optional chaining + length truthiness
// ✅ if (arr?.length) — even cleaner (length 0 is falsy, >0 is truthy)
```
::

## `switch`: Strict Equality and Fall-Through

::code-wrapper{language="javascript"}
```javascript
// ── switch uses STRICT equality (===) — no coercion ──
switch ("1") {
    case 1: console.log("number 1"); break;   // NOT matched (string !== number)
    case "1": console.log("string '1'"); break;  // matched (===)
}
// Output: string '1'

// ── Fall-through: without `break`, execution continues to the next case ──
switch (2) {
    case 1: console.log("one");
    // falls through (no break)
    case 2: console.log("two");
    // falls through (no break)
    case 3: console.log("three");
    break;  // stops here
    case 4: console.log("four");  // skipped
}
// Output: two, three

// ── Intentional fall-through (grouping cases) ──
function getDayType(day) {
    switch (day) {
        case "Saturday":
        case "Sunday":      // both fall through to the same body
            return "weekend";
        case "Monday":
        case "Tuesday":
        case "Wednesday":
        case "Thursday":
        case "Friday":
            return "weekday";
        default:
            return "invalid";
    }
}
// This is the ONE acceptable use of fall-through (empty case bodies grouped together)

// ── Anti-pattern: accidental fall-through (forgetting break) ──
// ❌ DANGEROUS — missing break causes unintended fall-through
function getStatus(code) {
    switch (code) {
        case 200: return "OK";     // has return — no fall-through (return exits)
        case 404: console.log("not found");  // no break, no return — FALLS THROUGH!
        case 500: return "error";  // 404 falls through to here → returns "error"!
    }
}
getStatus(404);  // "error" (logs "not found", then falls through to return "error")
```
::

## Anti-Pattern: `switch` vs Object Lookup

::code-wrapper{language="javascript"}
```javascript
// ❌ NAIVE — switch is verbose, fall-through-prone, hard to maintain
function getHttpStatus(code) {
    switch (code) {
        case 200: return "OK";
        case 201: return "Created";
        case 400: return "Bad Request";
        case 401: return "Unauthorized";
        case 404: return "Not Found";
        case 500: return "Internal Server Error";
        default: return "Unknown";
    }
}

// ✅ CORRECT — object lookup is cleaner, no fall-through risk, easy to extend
const HTTP_STATUS = {
    200: "OK",
    201: "Created",
    400: "Bad Request",
    401: "Unauthorized",
    404: "Not Found",
    500: "Internal Server Error",
};
const getHttpStatus2 = (code) => HTTP_STATUS[code] ?? "Unknown";
// Object lookup: O(1) property access vs switch's sequential comparison
// Also: easy to serialize, iterate, or generate from data

// ── Object lookup with function values (dispatch table / strategy pattern) ──
const handlers = {
    create: (data) => api.post("/items", data),
    update: (id, data) => api.put(`/items/${id}`, data),
    delete: (id) => api.delete(`/items/${id}`),
    default: () => { throw new Error("unknown action"); },
};
function dispatch(action, ...args) {
    const handler = handlers[action] ?? handlers.default;
    return handler(...args);
}
// dispatch("create", { name: "Alice" }) → calls handlers.create(...)
```
::

## Loops: Engine Optimization and Iteration Patterns

::code-wrapper{language="javascript"}
```javascript
// ── for: classic C-style loop (fastest for arrays) ──
const arr = [1, 2, 3, 4, 5];
for (let i = 0, len = arr.length; i < len; i++) {
    console.log(arr[i]);
}
// ⚠️ Cache arr.length in the init (len) — avoids re-reading .length each iteration
// (Modern engines optimize this, but the pattern is still a good habit for hot loops)

// ── for...of: iterates ITERABLES (arrays, strings, Maps, Sets, generators) ──
for (const item of arr) { console.log(item); }
for (const [index, value] of arr.entries()) { console.log(index, value); }
for (const char of "hello") { console.log(char); }  // h e l l o
for (const [key, val] of new Map([["a", 1], ["b", 2]])) { console.log(key, val); }

// ── for...in: iterates ENUMERABLE STRING KEYS (objects, including inherited) ──
const obj = { a: 1, b: 2 };
for (const key in obj) { console.log(key, obj[key]); }  // "a 1" "b 2"
// ⚠️ for...in iterates PROTOTYPE CHAIN too:
const child = Object.create({ inherited: 3 });
child.own = 4;
for (const key in child) {
    console.log(key);
    // "own" (own property)
    // "inherited" (from prototype!) — usually NOT wanted
}
// ✅ Filter with hasOwnProperty:
for (const key in child) {
    if (Object.hasOwn(child, key)) {  // only own properties
        console.log(key);
    }
}
// ⚠️ for...in on arrays: iterates INDICES (strings), not values, and includes prototype additions
for (const i in [10, 20, 30]) { console.log(i, typeof i); }  // "0 string" "1 string" "2 string"
// Never use for...in on arrays — use for, for...of, or forEach

// ── while / do...while ──
let i = 0;
while (i < 3) { console.log(i++); }  // 0 1 2 (check before body)
let j = 0;
do { console.log(j++); } while (j < 3);  // 0 1 2 (check after body — runs at least once)

// ── Labeled break/continue (for nested loops) ──
outer: for (let i = 0; i < 3; i++) {
    inner: for (let j = 0; j < 3; j++) {
        if (i === 1 && j === 1) break outer;  // break out of BOTH loops
        console.log(i, j);
    }
}
// (0,0) (0,1) (0,2) (1,0) — breaks outer when (1,1)
```
::

## `try` / `catch` / `finally`: The `finally` Trap

::code-wrapper{language="javascript"}
```javascript
// ── finally ALWAYS runs — even after return, break, continue, or throw ──
function example() {
    try {
        return "try";       // value is captured, but NOT returned yet
    } catch (e) {
        return "catch";
    } finally {
        console.log("finally runs before return");  // runs BEFORE return completes
        // if finally has its own return, it OVERRIDES try's return:
        // return "finally";  // ← uncomment to override "try" return
    }
}
console.log(example());  // logs "finally runs before return", then returns "try"

// ── finally overrides try's return ──
function override() {
    try {
        return "try";
    } finally {
        return "finally";  // overrides try's return value!
    }
}
console.log(override());  // "finally" (try's "try" is discarded)

// ── finally runs even after throw ──
function withThrow() {
    try {
        throw new Error("boom");
    } catch (e) {
        return "caught";  // value captured
    } finally {
        console.log("cleanup");  // runs before return completes
    }
}
console.log(withThrow());  // logs "cleanup", returns "caught"

// ── Anti-pattern: finally that throws swallows the original error ──
function badFinally() {
    try {
        throw new Error("original error");
    } finally {
        throw new Error("finally error");  // OVERRIDES the original error!
        // The caller sees "finally error", not "original error" — hard to debug
    }
}
// badFinally();  // throws "finally error" (original error lost)

// ── Optional catch binding (ES2019) — omit the error variable ──
try {
    JSON.parse(invalidJson);
} catch {  // no (e) needed if you don't use the error
    console.log("invalid JSON, ignoring");
}

// ── try/catch with await (ES2019) ──
async function safeFetch(url) {
    try {
        const response = await fetch(url);
        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) {
            console.log("network error");
        }
        throw error;  // re-throw
    } finally {
        console.log("cleanup");  // runs after try/catch, even with await
    }
}
```
::

## Production Pattern: Retry with Exponential Backoff

::code-wrapper{language="javascript"}
```javascript
async function retry(fn, { maxAttempts = 5, baseDelay = 1000, maxDelay = 30000 } = {}) {
    let attempt = 0;
    while (true) {
        try {
            return await fn(attempt);  // pass attempt number to the function
        } catch (error) {
            attempt++;
            if (attempt >= maxAttempts) throw error;  // give up

            // Exponential backoff with jitter (prevent thundering herd):
            const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
            const jitter = Math.random() * delay * 0.1;  // ±10% jitter
            console.warn(`attempt ${attempt} failed, retrying in ${Math.round(delay + jitter)}ms`);

            await new Promise(r => setTimeout(r, delay + jitter));
        }
    }
}

// Usage:
// const data = await retry(() => fetch("/api/data").then(r => r.json()), {
//     maxAttempts: 3,
//     baseDelay: 500,
// });
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── `continue` in a for loop skips to the increment ──
for (let i = 0; i < 10; i++) {
    if (i % 2 === 0) continue;  // skip even numbers
    console.log(i);  // 1 3 5 7 9
}

// ── `break` in a for...of exits the loop ──
for (const item of items) {
    if (item === "stop") break;  // exit the loop
    console.log(item);
}

// ── Find first match with for...of (no .find() needed) ──
function findFirst(arr, predicate) {
    for (const item of arr) {
        if (predicate(item)) return item;  // return exits the loop
    }
    return undefined;
}

// ── Early return from a loop (cleaner than a flag variable) ──
function contains(arr, target) {
    for (const item of arr) {
        if (item === target) return true;  // early exit
    }
    return false;
}

// ── while(true) with break for polling ──
while (true) {
    const result = await checkCondition();
    if (result.done) break;
    await sleep(1000);
}

// ── Object lookup for O(1) dispatch (vs switch's O(n)) ──
const operations = {
    add: (a, b) => a + b,
    sub: (a, b) => a - b,
    mul: (a, b) => a * b,
    div: (a, b) => a / b,
};
function calculate(op, a, b) {
    if (!(op in operations)) throw new Error(`unknown op: ${op}`);
    return operations[op](a, b);  // O(1) lookup
}
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── `if ([])` is truthy (empty array is an object → truthy) ──
if ([]) console.log("runs");  // prints!  ([] is truthy, not falsy)
if ({} && "false") console.log("runs");  // prints! ("false" is a non-empty string → truthy)

// ── `switch` without `break` falls through silently ──
// ESLint rule `no-fallthrough` catches this, but it's a runtime bug if missed.

// ── `for...in` iterates string keys (not values), includes prototype ──
Array.prototype.extra = "oops";
for (const i in [1, 2, 3]) { console.log(i); }
// "0", "1", "2", "extra" — prototype property leaked in!
// Use for...of for arrays (iterates values, not keys, and ignores prototype).

// ── `finally` with return overrides try's return ──
function f() { try { return 1; } finally { return 2; } }
console.log(f());  // 2 (finally's return wins — the try's return value is lost)

// ── `break` in a nested loop only exits the inner loop ──
for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
        if (j === 1) break;  // only breaks inner loop (outer continues)
    }
}
// Use labeled break: `break outerLabel;` to exit multiple levels.

// ── `continue` in a while loop (must update counter BEFORE continue) ──
let i = 0;
while (i < 5) {
    i++;  // ⚠️ MUST increment BEFORE continue, or infinite loop
    if (i === 3) continue;  // skip 3
    console.log(i);  // 1 2 4 5
}
```
::

## 🧠 Quick Quiz

What does this return?

::code-wrapper{language="javascript"}
```javascript
function test() {
    try {
        throw "error1";
    } catch (e) {
        throw "error2";
    } finally {
        return "finally";
    }
}
test();
```
::

<details>
<summary>Answer</summary>

`"finally"`

Even though the `catch` block throws `"error2"`, the `finally` block runs regardless — and `finally` has its own `return "finally"`, which **overrides the thrown error**. The function returns `"finally"` without throwing.

If `finally` didn't have a `return`, `"error2"` would propagate to the caller. But `finally`'s `return` swallows any pending `throw` from `try` or `catch`.

**The lesson**: `finally` with `return` is dangerous — it swallows errors from both `try` and `catch`. Never `return` from `finally` unless you intentionally want to override all exit paths.

</details>