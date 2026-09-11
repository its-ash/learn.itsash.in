---
title: "JavaScript 03 — Operator Semantics, Coercion Traps & Short-Circuit Evaluation"
description: "Deep-dive into JavaScript operators: comparison coercion algorithm, remainder vs modulo, bitwise operations on 32-bit integers, logical short-circuiting, optional chaining, nullish coalescing, and the comma operator. Code-first reference for senior engineers."
---

# 03 — Operator Semantics, Coercion Traps & Short-Circuit Evaluation

## Comparison Operators: `==` Coercion Algorithm

::code-wrapper{language="javascript"}
```javascript
// ── `==` (loose equality) coerces operands; `===` (strict) checks type first ──
// The Abstract Equality Algorithm (ECMA-262 §7.2.15) has ~20 rules.

// ── The coercion hierarchy (simplified) ──
// 1. Same type → direct comparison (like ===)
// 2. null == undefined → true (special case)
// 3. number ↔ string → string to number (ToNumber)
// 4. boolean → number (true→1, false→0), then re-compare
// 5. object ↔ primitive → object to primitive (ToPrimitive: valueOf then toString)

// ── Rule 3: number ↔ string ──
1 == "1";       // true — ToNumber("1") = 1
0 == "";        // true — ToNumber("") = 0
0 == "0";       // true — ToNumber("0") = 0
"  1  " == 1;  // true — ToNumber("  1  ") = 1 (whitespace trimmed)

// ── Rule 4: boolean coerced to number FIRST ──
1 == true;      // true — true→1, then 1==1
0 == false;    // true — false→0, then 0==0
"" == false;   // true — false→0, ToNumber("")→0, then 0==0
"0" == false;  // true — false→0, ToNumber("0")→0, then 0==0

// ── Rule 5: object → primitive ──
"[object Object]" == {};  // true — {} → toString() → "[object Object]"
"1,2,3" == [1, 2, 3];   // true — [1,2,3] → toString() → "1,2,3"
"1" == [1];              // true — [1] → "1" → ToNumber("1")=1 → 1==1
"1" == { valueOf: () => 1 };  // true — valueOf()→1 → 1==1

// ── null and undefined: only equal to each other ──
null == undefined;  // true (special case)
null == 0;           // false (null is NOT coerced to 0 for ==)
null == false;       // false
undefined == 0;      // false

// ── `===` never coerces (always safe) ──
1 === "1";           // false (different types → immediate false)
null === undefined;  // false (different types)

// ── Object.is: handles NaN and -0 correctly ──
Object.is(NaN, NaN);   // true (== and === both say false!)
Object.is(-0, 0);      // false (=== says true!)
Object.is(0, 0);       // true
```
::

## Anti-Pattern: `==` with Mixed Types

::code-wrapper{language="javascript"}
```javascript
// ❌ NAIVE — == coercion leads to surprising bugs
if (x == "") { ... }  // also matches 0, false, [], null (if x is 0, this is true!)
if (x == 0) { ... }   // also matches "", false, [], "0"
if (x == null) { ... } // matches both null AND undefined (might be intended)

// ✅ CORRECT — use === for everything, and explicit checks for special cases
if (x === "") { ... }   // only empty string
if (x === 0) { ... }    // only zero
if (x === null || x === undefined) { ... }  // explicit null/undefined check
if (x == null) { ... }   // OK — == null is the idiomatic shortcut for null||undefined

// ── The ONE acceptable use of ==: checking null/undefined together ──
if (x == null) { ... }  // matches null OR undefined (not 0, not "", not false)
// This is the ONLY `==` idiom most linters allow (eslint: "eqeqeq" with "allowNull")
```
::

## Arithmetic: Remainder vs Modulo, Integer Division

::code-wrapper{language="javascript"}
```javascript
// ── `%` is REMAINDER, not modulo (different for negative numbers) ──
// Remainder: result has the SIGN OF THE DIVIDEND
// Modulo: result has the SIGN OF THE DIVISOR

console.log(7 % 3);    // 1 (same for both: 7 = 3*2 + 1)
console.log(-7 % 3);   // -1 (remainder: sign of dividend → -1)
console.log(7 % -3);   // 1 (remainder: sign of dividend → +1)
// Modulo would give: -7 mod 3 = 2 (sign of divisor), 7 mod -3 = -2

// ✅ True modulo function (always positive for positive divisor):
function mod(n, m) {
    return ((n % m) + m) % m;  // adjust negative remainder to positive
}
console.log(mod(-7, 3));  // 2 (true modulo)

// ── Integer division (no truncation toward zero like C) ──
// JS has no `//` operator. Math.trunc, Math.floor, Math.ceil differ for negatives:
console.log(Math.trunc(-7 / 3));  // -2 (truncates toward zero)
console.log(Math.floor(-7 / 3));  // -3 (rounds down)
console.log(Math.ceil(-7 / 3));   // -2 (rounds up)

// ✅ Use Math.trunc for integer division (matches C/Java behavior):
function intDiv(a, b) { return Math.trunc(a / b); }
// For floor division (Python behavior): Math.floor(a / b)

// ── `**` exponentiation (ES2016) ──
console.log(2 ** 10);     // 1024
console.log(2 ** -1);     // 0.5 (fractional exponent → float)
console.log((-2) ** 2);   // 4 (parentheses needed for negative base: -2**2 → SyntaxError)
console.log(4 ** 0.5);    // 2 (square root via fractional exponent)
console.log(8 ** (1/3));  // 2 (cube root — but floating-point: 1.9999999999999998)

// ── Bitwise operators work on 32-bit integers (coercion + truncation) ──
console.log(5 | 0);      // 5 (ToInt32(5) = 5)
console.log(5.9 | 0);    // 5 (truncated to integer)
console.log(-5.9 | 0);   // -5 (truncated toward zero, not floor)
console.log(2147483648 | 0);  // -2147483648 (overflow: 2^31 wraps to -2^31)
// ⚠️ Bitwise ops convert to 32-bit signed integers — precision loss for large numbers!
// Use Math.trunc or Math.floor for large numbers (they preserve double precision).
```
::

## Bitwise Operations: 32-Bit Internals

::code-wrapper{language="javascript"}
```javascript
// ── Bitwise operators coerce operands to 32-bit signed integers ──
// AND (&), OR (|), XOR (^), NOT (~), left shift (<<), signed right shift (>>)
// unsigned right shift (>>>)

// ── ToInt32 algorithm (internal) ──
// 1. ToNumber(value)
// 2. If NaN/±Infinity → 0
// 3. Take modulo 2^32
// 4. If >= 2^31 → subtract 2^32 (wrap to negative)

// ── ~ (NOT): two's complement negation ──
console.log(~0);   // -1 (~0 = -(0+1) = -1)
console.log(~1);   // -2 (~1 = -(1+1) = -2)
console.log(~-1);  // 0 (~(-1) = 0) — useful: ~x === 0 only when x is -1

// ── `~str.indexOf(x)` idiom (pre-includes): truthy if found ──
// Before .includes() (ES2015), the idiom was:
if (~"hello".indexOf("ell")) { /* found */ }  // ~2 = -3 (truthy)
if (~"hello".indexOf("xyz")) { /* not found */ }  // ~(-1) = 0 (falsy)
// Modern: if ("hello".includes("ell")) — cleaner

// ── `>>> 0` to convert to unsigned 32-bit integer ──
console.log(-1 >>> 0);  // 4294967295 (0xFFFFFFFF as unsigned)
console.log(3.7 >>> 0);  // 3 (truncated to integer)
console.log("42" >>> 0);  // 42 (coerced to number, then to uint32)

// ── Flags with bitwise OR ──
const READ = 1, WRITE = 2, EXEC = 4;
let perms = 0;
perms |= READ | WRITE;      // 3 (binary: 011)
perms & READ ? "readable" : "not";  // "readable" (bit is set)
perms & EXEC ? "executable" : "not";  // "not" (bit not set)
perms &= ~WRITE;            // clear WRITE bit → 1 (binary: 001)
perms & WRITE ? "writable" : "not";  // "not" (cleared)

// ── << for fast power-of-2 multiplication ──
console.log(1 << 10);  // 1024 (2^10 — fast, but limited to 32-bit range)
console.log(1 << 31);  // -2147483648 (overflow: MSB is sign bit → negative)
// For larger: use ** or BigInt
```
::

## Logical Operators: Short-Circuit Semantics

::code-wrapper{language="javascript"}
```javascript
// ── && (AND): returns the FIRST falsy operand, or the LAST if all truthy ──
console.log(0 && "never");   // 0 (0 is falsy — returns 0, "never" not evaluated)
console.log(1 && "reached"); // "reached" (all truthy — returns last)
console.log("" && 0);        // "" (first falsy — empty string)
console.log(null && 1);     // null (first falsy)

// ── || (OR): returns the FIRST truthy operand, or the LAST if all falsy ──
console.log(0 || "default");   // "default" (0 is falsy → returns next)
console.log("x" || "default"); // "x" (first truthy → returns it)
console.log(null || 0 || "");  // "" (all falsy → returns last)

// ── ⚠️ && and || return the OPERAND VALUE, not a boolean ──
// They don't coerce to true/false — they return the actual value of an operand.
const result = 1 && "hello";  // "hello" (string, not boolean true)

// ── Short-circuit: the right side is only evaluated if needed ──
function sideEffect() { console.log("evaluated"); return true; }
false && sideEffect();  // sideEffect NOT called (false short-circuits &&)
true || sideEffect();   // sideEffect NOT called (true short-circuits ||)

// ── ?? (nullish coalescing): returns right side ONLY if left is null/undefined ──
console.log(0 ?? "default");    // 0 (0 is NOT null/undefined → keeps 0)
console.log("" ?? "default");  // "" (empty string is NOT null/undefined → keeps "")
console.log(null ?? "default"); // "default" (null → uses default)
console.log(undefined ?? "default"); // "default" (undefined → uses default)

// ── ?? vs ||: the critical difference ──
let count = 0;
count || 10;  // 10 — || treats 0 as falsy → uses default (probably a bug!)
count ?? 10; // 0  — ?? only triggers on null/undefined → keeps 0

let name = "";
name || "Anonymous";  // "Anonymous" — || treats "" as falsy
name ?? "Anonymous";  // "" — ?? keeps empty string

// ── ⚠️ Can't mix ?? with || or && without parentheses ──
// 0 || 1 ?? 2;  // SyntaxError: mixing ?? with || requires parentheses
(0 || 1) ?? 2;  // 1 — explicit grouping
```
::

## Optional Chaining and Nullish Coalescing in Production

::code-wrapper{language="javascript"}
```javascript
// ── Optional chaining (?.): short-circuits to undefined if any part is null/undefined ──
const user = { profile: { name: "Alice" } };

// Without ?. (manual null checking — verbose):
const name = user && user.profile && user.profile.name;  // "Alice"
const missing = user && user.settings && user.settings.theme;  // undefined

// With ?. (clean — short-circuits to undefined):
const name2 = user?.profile?.name;     // "Alice"
const missing2 = user?.settings?.theme;  // undefined (short-circuits, no error)

// ── Optional method call: ?.() ──
const obj = { greet() { return "hello"; } };
console.log(obj?.greet?.());    // "hello" — calls greet if it exists
console.log(obj?.missing?.());  // undefined — no error (method doesn't exist)

// ── Optional computed property: ?.[] ──
const key = "name";
console.log(user?.profile?.[key]);  // "Alice"
console.log(user?.missing?.[key]);   // undefined

// ── ⚠️ Optional chaining silently returns undefined (might mask bugs) ──
const data = fetchFromAPI();  // suppose this returns null on error
const value = data?.items?.[0]?.name;  // undefined (no error, but was it supposed to?)
// If data is null due to a bug, you get undefined instead of an error — harder to debug.
// Use ?? to provide a fallback or throw:
const value2 = data?.items?.[0]?.name ?? throw new Error("no data");

// ── Combining ?. with ?? for safe deep access with defaults ──
const config = {
    server: { port: 3000 }
};
const port = config?.server?.port ?? 8080;       // 3000 (exists)
const host = config?.server?.host ?? "localhost"; // "localhost" (undefined → default)
```
::

## Anti-Pattern: Optional Chaining Hiding Bugs

::code-wrapper{language="javascript"}
```javascript
// ❌ NAIVE — optional chaining masks a real API error
async function getUser(id) {
    const response = await fetch(`/api/users/${id}`);
    // If the server returns a 500 error, response.json() might return { error: "..." }
    // or the response might not have the expected shape
    return response?.json?.()?.data?.user?.name;  // undefined — no error, but why?
    // Was the user not found? Was the API down? Was the response malformed?
    // You can't tell — optional chaining ate all the errors.
}

// ✅ CORRECT — check explicitly, throw on unexpected shapes
async function getUserSafe(id) {
    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }
    const body = await response.json();
    if (!body?.data?.user) {
        throw new Error("unexpected response shape");  // fail loudly, not silently
    }
    return body.data.user.name;
}

// ── Use ?. for genuinely optional data (not for error handling) ──
// ✅ Good: user.profile is genuinely optional (not all users have profiles)
const bio = user?.profile?.bio ?? "No bio available";
// ❌ Bad: response.body is NOT optional (API contract says it must be there)
// const data = response?.body?.data;  // if body is missing, that's a BUG — let it throw
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── `||` for defaults (pre-??), `??` for nullish defaults (modern) ──
const port = config.port ?? 3000;  // 3000 only if null/undefined (keeps 0)
const mode = config.mode || "prod"; // "prod" if any falsy (0, "", null, undefined, false)

// ── `&&` for conditional execution (one-liner guard) ──
isDev && initDevtools();  // only run if isDev is truthy
// Equivalent: if (isDev) initDevtools();

// ── Double negate for boolean coercion: !! ──
const isTruthy = !!value;  // true if value is truthy, false if falsy
!!0;    // false
!!"x";  // true
!![];   // true (empty array is truthy)
!!{};   // true (empty object is truthy)

// ── Comma operator: evaluate multiple expressions, return last ──
let result = (doSideEffect(), computeValue());  // doSideEffect runs, result = computeValue()
// Useful in for-loops: for (let i = 0, j = arr.length - 1; i < j; i++, j--) {}

// ── Ternary chaining (right-associative) ──
const status = code === 200 ? "OK"
             : code >= 400 ? "Error"
             : code >= 300 ? "Redirect"
             : "Unknown";
// Right-associative: a ? b : (c ? d : (e ? f : g)) — evaluated right-to-left
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── `0` and `-0` are equal with ===, different with Object.is ──
0 === -0;         // true
Object.is(0, -0); // false (only way to distinguish)
1 / 0;            // Infinity
1 / -0;           // -Infinity (negative zero matters for division)

// ── `NaN` propagates silently through arithmetic ──
NaN + 1;    // NaN
NaN * 0;    // NaN (not 0! — NaN poisons everything)
NaN === NaN; // false

// ── `++x` vs `x++` (pre-increment vs post-increment) ──
let a = 5;
let b = a++;  // b = 5 (post: returns OLD value, THEN increments a to 6)
let c = ++a;  // c = 7 (pre: increments FIRST, then returns new value)

// ── `+` operator: addition for numbers, concatenation for strings ──
1 + 2;       // 3 (number addition)
"1" + 2;    // "12" (string concatenation — if ANY operand is string, concatenate)
1 + 2 + "3";  // "33" — (1+2)=3, then 3+"3"="33" (left-to-right)
"1" + 2 + 3;  // "123" — "1"+2="12", then "12"+3="123" (string propagates)

// ── Unary `+` for string-to-number coercion ──
+"42";    // 42 (number)
+"";      // 0 (empty string → 0)
+"  ";    // 0 (whitespace → 0)
+"abc";   // NaN (non-numeric → NaN)
+true;    // 1
+null;    // 0 (not NaN!)
+undefined; // NaN
+[];      // 0 (array → "" → 0)
+[1];     // 1 (array → "1" → 1)
+[1,2];   // NaN (array → "1,2" → NaN)
```
::

## 🧠 Quick Quiz

What does this output?

::code-wrapper{language="javascript"}
```javascript
console.log(1 + null);
console.log("1" + null);
console.log(null + null);
console.log([] + []);
console.log([] + {});
```
::

<details>
<summary>Answer</summary>

```javascript
1            // 1 + null → ToNumber(null)=0 → 1+0 = 1
"1null"      // "1" + null → String(null)="null" → "1"+"null" = "1null"
0            // null + null → 0+0 = 0 (both coerced to 0)
""           // [] + [] → [].toString()="" → ""+"" = ""
"[object Object]"  // [] + {} → ""+"[object Object]" = "[object Object]"
```

**Key rules**:
- `+` with a string concatenates (string propagates left-to-right)
- `+` with numbers adds (null/undefined/boolean coerced to number)
- `[]` → `""` (empty array toString is empty string)
- `{}` → `"[object Object]"` (object toString is `[object Object]`)

</details>