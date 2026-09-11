---
title: "JavaScript 09 — Destructuring Internals: Pattern Matching, Defaults & the `null` Trap"
description: "Deep-dive into JavaScript destructuring: array and object pattern matching, default value semantics (undefined triggers, null doesn't), nested destructuring, rest patterns, and the `?? {}` safe destructuring pattern. Code-first reference for senior engineers."
---

# 09 — Destructuring Internals: Pattern Matching, Defaults & the `null` Trap

## Array Destructuring: Positional Binding

::code-wrapper{language="javascript"}
```javascript
// ── Basic positional binding ──
const [a, b, c] = [1, 2, 3];
console.log(a, b, c);  // 1 2 3

// ── Skip elements (holes in the pattern) ──
const [first, , third] = [1, 2, 3];
console.log(first, third);  // 1 3 (second element skipped)

// ── Rest pattern (collect remaining elements) ──
const [head, ...rest] = [1, 2, 3, 4];
console.log(head);    // 1
console.log(rest);   // [2, 3, 4] (real Array)

// ── Default values (used when the element is undefined) ──
const [x = 10, y = 20] = [5];
console.log(x, y);  // 5 20 (x got 5, y is undefined → default 20)

// ── Swapping variables (no temp needed) ──
let left = 1, right = 2;
[left, right] = [right, left];  // left=2, right=1

// ── Swapping without a temp (engine-level XOR swap is not used — JS creates a temp array) ──
// [a, b] = [b, a] creates a temporary array [b, a], then destructures it.
// Not as efficient as a true XOR swap, but clear and idiomatic.

// ── Destructuring from a function return ──
function getCoords() { return [10, 20]; }
const [x2, y2] = getCoords();  // x2=10, y2=20

// ── Destructuring in a for...of loop ──
const entries = [["a", 1], ["b", 2], ["c", 3]];
for (const [key, value] of entries) {
    console.log(key, value);  // "a" 1, "b" 2, "c" 3
}
for (const [index, value] of ["x", "y", "z"].entries()) {
    console.log(index, value);  // 0 "x", 1 "y", 2 "z"
}
```
::

## Object Destructuring: Property Binding by Name

::code-wrapper{language="javascript"}
```javascript
// ── Basic property binding (match by property name) ──
const { name, age } = { name: "Alice", age: 30 };
console.log(name, age);  // "Alice" 30

// ── Rename: bind to a different variable name ──
const { name: userName, age: userAge } = { name: "Alice", age: 30 };
console.log(userName, userAge);  // "Alice" 30
// Syntax: { sourceProperty: targetVariable }

// ── Default values (used when the property is undefined) ──
const { port = 3000, host = "localhost" } = { port: 8080 };
console.log(port, host);  // 8080 "localhost" (host was undefined → default)

// ── Rename + default ──
const { port: p = 3000, host: h = "localhost" } = { port: 8080 };
console.log(p, h);  // 8080 "localhost"

// ── Nested destructuring ──
const user = {
    name: "Alice",
    profile: {
        email: "alice@example.com",
        address: { city: "NYC", zip: "10001" },
    },
};
const { profile: { email, address: { city, zip } } } = user;
console.log(email, city, zip);  // "alice@example.com" "NYC" "10001"
// Note: `profile` and `address` are NOT bound — only the leaf properties (email, city, zip).

// ── Rest pattern in object destructuring (collect remaining properties) ──
const { name: n, ...rest } = { name: "Alice", age: 30, role: "admin" };
console.log(n);     // "Alice"
console.log(rest);  // { age: 30, role: "admin" }

// ── Computed property names in destructuring ──
const key = "name";
const { [key]: value } = { name: "Alice" };
console.log(value);  // "Alice"
```
::

## Anti-Pattern: Destructuring `null` Throws

::code-wrapper{language="javascript"}
```javascript
// ❌ NAIVE — destructuring null or undefined throws a TypeError
function getUserInfo(user) {
    const { name, email } = user;  // ✗ if user is null → TypeError: Cannot destructure property 'name' of null
    return { name, email };
}
getUserInfo(null);  // TypeError!

// ✅ CORRECT — provide a default empty object
function getUserInfoSafe(user) {
    const { name, email } = user ?? {};  // if user is null → {} → name/email are undefined
    return { name, email };
}
getUserInfoSafe(null);  // { name: undefined, email: undefined } (no error)

// ✅ ALSO GOOD — default parameter
function getUserInfoSafe2({ name, email } = {}) {
    return { name, email };
}
getUserInfoSafe2(null);  // ✗ still throws! The default only applies when NO arg is passed.
// Default param only triggers on `undefined` (no argument), not on `null`!
getUserInfoSafe2(undefined);  // ✓ uses default {} (no arg → undefined → default)
getUserInfoSafe2();          // ✓ uses default {} (no arg → default)
getUserInfoSafe2(null);      // ✗ TypeError (null is passed, not undefined — no default!)

// ── The null vs undefined distinction in defaults ──
// Default values trigger ONLY when the value is `undefined`:
// - undefined → uses default
// - null → does NOT use default (null is a real value, kept as-is)
const { x = "default" } = { x: undefined };  // x = "default" (undefined triggers default)
const { y = "default" } = { y: null };       // y = null (null does NOT trigger default!)
const { z = "default" } = {};                // z = "default" (missing → undefined → default)
```
::

## Production Pattern: Safe Deep Destructuring

::code-wrapper{language="javascript"}
```javascript
// ── Safe deep destructuring with ?? {} at each level ──
function parseApiResponse(response) {
    // Each level gets ?? {} so null/undefined at any depth doesn't throw
    const {
        data: {
            user: {
                name = "Anonymous",
                profile: {
                    email = "no-email@example.com",
                } = {},
            } = {},
        } = {},
    } = response ?? {};

    return { name, email };
}

// Works with any input:
parseApiResponse(null);                        // { name: "Anonymous", email: "no-email@example.com" }
parseApiResponse({});                           // { name: "Anonymous", email: "no-email@example.com" }
parseApiResponse({ data: null });               // { name: "Anonymous", email: "no-email@example.com" }
parseApiResponse({ data: { user: null } });      // { name: "Anonymous", email: "no-email@example.com" }
parseApiResponse({ data: { user: { name: "Alice" } } });  // { name: "Alice", email: "no-email@example.com" }

// ── Alternative: optional chaining + nullish coalescing (no destructuring) ──
function parseApi2(response) {
    return {
        name: response?.data?.user?.name ?? "Anonymous",
        email: response?.data?.user?.profile?.email ?? "no-email@example.com",
    };
}
// Optional chaining is simpler for read-only access, but destructuring is better
// when you need to extract many properties from the same object.
```
::

## Destructuring in Function Parameters

::code-wrapper{language="javascript"}
```javascript
// ── Function parameter destructuring with defaults ──
function configure({
    host = "localhost",
    port = 3000,
    ssl = false,
    timeout = 30000,
} = {}) {
    // The `= {}` default is for the WHOLE parameter (when no arg or undefined is passed)
    console.log(`${ssl ? "https" : "http"}://${host}:${port} (timeout: ${timeout}ms)`);
}

configure();                          // http://localhost:3000 (timeout: 30000ms)
configure({ port: 8080 });           // http://localhost:8080 (timeout: 30000ms)
configure({ ssl: true, host: "api.example.com" });  // https://api.example.com:3000
configure(undefined);                // http://localhost:3000 (undefined → default {})
// configure(null);  // ✗ TypeError: Cannot destructure property 'host' of null
// (null does NOT trigger the `= {}` default — only undefined does)

// ── Destructuring with renaming in parameters ──
function process({ input: source, output: destination, format = "json" }) {
    console.log(`${source} → ${destination} (${format})`);
}
process({ input: "file.txt", output: "file.json" });  // file.txt → file.json (json)

// ── Mixed positional and destructured parameters ──
function fetchData(url, { method = "GET", headers = {}, body = null } = {}) {
    // First param is positional (url), second is destructured (options object)
    console.log(`${method} ${url}`, { headers, body });
}
fetchData("/api/users", { method: "POST", body: "data" });
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── Destructuring for swapping without a temp ──
let a = 1, b = 2;
[a, b] = [b, a];  // a=2, b=1

// ── Destructuring for extracting values from regex matches ──
const [fullMatch, year, month, day] = "2024-01-15".match(/^(\d{4})-(\d{2})-(\d{2})$/);
console.log(year, month, day);  // "2024" "01" "15"

// ── Destructuring Map entries ──
const config = new Map([["host", "localhost"], ["port", "3000"]]);
for (const [key, value] of config) {
    console.log(key, value);  // "host" "localhost", "port" "3000"
}

// ── Destructuring to pick properties (omit rest) ──
const user = { id: 1, name: "Alice", email: "a@b.com", password: "secret" };
const { password, ...safeUser } = user;  // strip password from the rest
console.log(safeUser);  // { id: 1, name: "Alice", email: "a@b.com" }

// ── Destructuring for multiple return values (tuple-like) ──
function divmod(a, b) {
    return [Math.trunc(a / b), a % b];  // return [quotient, remainder]
}
const [quotient, remainder] = divmod(17, 5);  // 3, 2

// ── Deep default with nullish coalescing ──
const { deep = { nested: "default" } } = obj ?? {};
// If obj is null → {} → deep is undefined → default { nested: "default" }
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── Destructuring null/undefined throws (not like access which returns undefined) ──
const { x } = null;       // TypeError: Cannot destructure property 'x' of null
const { y } = undefined;  // TypeError: Cannot destructure property 'y' of undefined
// Fix: const { x } = obj ?? {};

// ── Default values trigger on undefined, NOT on null ──
const { a = "default" } = { a: undefined };  // a = "default" (undefined triggers)
const { b = "default" } = { b: null };       // b = null (null does NOT trigger default)
const { c = "default" } = {};                 // c = "default" (missing → undefined → default)

// ── Rest must be LAST in destructuring ──
const [first, ...rest, last] = [1, 2, 3];  // ✗ SyntaxError: Rest element must be last
const { a, ...rest, b } = obj;  // ✗ SyntaxError: Rest element must be last
// ✅ Correct: const [first, ...rest] = [1, 2, 3]; rest is [2, 3] (includes last)

// ── Array destructuring is positional (order matters) ──
const [a, b] = [1, 2];  // a=1, b=2 (positional — index-based)
const { a: x, b: y } = { a: 1, b: 2 };  // x=1, y=2 (named — order doesn't matter)
// Array patterns bind by position; object patterns bind by name.

// ── Destructuring with computed keys requires the property to exist ──
const key = "dynamic";
const { [key]: val } = { dynamic: 42 };
console.log(val);  // 42
const { [key]: val2 = "default" } = {};
console.log(val2);  // "default" (property missing → undefined → default)

// ── Function param destructuring with null ──
function f({ a = 1 } = {}) { console.log(a); }
f();          // 1 (no arg → undefined → default {} → a defaults to 1)
f(undefined); // 1 (undefined → default {} → a defaults to 1)
f(null);      // ✗ TypeError (null does NOT trigger the `= {}` default!)
f({});        // 1 (empty object → a is undefined → defaults to 1)
```
::

## 🧠 Quick Quiz

What does this output?

::code-wrapper{language="javascript"}
```javascript
const obj = { a: 1, b: null, c: undefined };
const { a = "d", b = "d", c = "d", d = "d" } = obj;
console.log(a, b, c, d);
```
::

<details>
<summary>Answer</summary>

```javascript
1 "d" "d" "d"
```

- `a` = `1` — property exists with value `1` (not undefined, so no default)
- `b` = `"d"` — property is `null`. Wait... `null` does NOT trigger defaults! So `b` should be `null`...

Let me re-check: `null` does NOT trigger the default. The default only triggers for `undefined`.

So:
- `a` = `1` — exists, value is `1`, not undefined → keeps `1`
- `b` = `null` — exists, value is `null`, NOT undefined → keeps `null` (no default!)
- `c` = `"d"` — exists, value is `undefined` → triggers default `"d"`
- `d` = `"d"` — doesn't exist (missing) → equivalent to undefined → triggers default `"d"`

Output: `1 null "d" "d"`

**The lesson**: default values in destructuring trigger **only** when the value is `undefined` (explicitly or because the property is missing). `null` is a real value and does NOT trigger defaults. This is the #1 destructuring gotcha.

</details>