---
title: "JavaScript 02 — Variable Binding, TDZ Internals & Type Coercion Engine"
description: "Deep-dive into JavaScript variable mechanics: let/const/var scope and hoisting internals, the Temporal Dead Zone (TDZ), primitive vs reference memory model, and the abstract type coercion algorithm. Code-first reference for senior engineers."
---

# 02 — Variable Binding, TDZ Internals & Type Coercion Engine

## `let` / `const` / `var`: Scope and Hoisting Internals

::code-wrapper{language="javascript"}
```javascript
// ── All three are hoisted — the difference is initialization ──
// var:   hoisted + initialized to undefined (accessible before declaration, value is undefined)
// let:   hoisted but NOT initialized → Temporal Dead Zone (TDZ) → ReferenceError if accessed early
// const: same as let, but the binding is immutable (can't reassign the variable)

// ── var: function-scoped (or global) — not block-scoped ──
function varScope() {
    if (true) {
        var x = 10;  // function-scoped: x exists in entire function
    }
    console.log(x);  // 10 — var leaks out of the block
}
// var x is visible from the point of declaration to the END of the function
// (not just the block it's declared in)

// ── let/const: block-scoped (lexical block scope) ──
function letScope() {
    if (true) {
        let y = 20;  // block-scoped: y only exists in this if-block
    }
    console.log(y);  // ReferenceError: y is not defined
}

// ── Hoisting: all declarations are moved to the top of their scope ──
// But let/const go into the TDZ (not initialized):
console.log(v);  // undefined (var is hoisted + initialized to undefined)
var v = 5;

console.log(l);  // ReferenceError: Cannot access 'l' before initialization (TDZ!)
let l = 5;

// ── The TDZ is a region from the start of the scope to the declaration ──
{
    // TDZ for x starts here (block opening)
    console.log(x);  // ReferenceError — in the TDZ
    let x = 10;       // TDZ ends — x is now accessible
    console.log(x);  // 10
}

// ── const: immutable binding, not immutable value ──
const obj = { x: 1 };
obj.x = 2;        // ✓ the object is mutable — const only prevents reassignment
// obj = { x: 3 };  // ✗ TypeError: Assignment to constant variable
console.log(obj.x);  // 2

// ── var in the global scope creates a property on the global object ──
var globalVar = 10;
console.log(globalThis.globalVar);  // 10 — var on global scope → window/globalThis property

let globalLet = 20;
console.log(globalThis.globalLet);  // undefined — let/const do NOT create global properties
```
::

## Anti-Pattern: `var` in Loops (Closure Capture Bug)

::code-wrapper{language="javascript"}
```javascript
// ❌ NAIVE — var is function-scoped, so the closure captures the SAME variable
for (var i = 0; i < 3; i++) {
    setTimeout(() => console.log(i), 0);
}
// Output: 3, 3, 3 — all closures share the SAME i (function-scoped, final value is 3)

// ✅ CORRECT — let is block-scoped, each iteration gets its own binding
for (let i = 0; i < 3; i++) {
    setTimeout(() => console.log(i), 0);
}
// Output: 0, 1, 2 — each iteration's let creates a new binding (per-iteration scope)

// ✅ IIFE workaround (pre-ES6, when let didn't exist)
for (var i = 0; i < 3; i++) {
    (function(j) {          // IIFE creates a new scope, captures the current value
        setTimeout(() => console.log(j), 0);
    })(i);                  // pass current i as argument → j is a copy
}
// Output: 0, 1, 2

// ── How let in loops actually works ──
// `for (let i = 0; i < 3; i++)` is desugared to create a NEW binding per iteration:
//   { let i = 0; setTimeout(() => console.log(i), 0); }
//   { let i = 1; setTimeout(() => console.log(i), 0); }
//   { let i = 2; setTimeout(() => console.log(i), 0); }
// Each iteration has its own `i` in its own scope.
```
::

## Primitive vs Reference: Memory Model

::code-wrapper{language="javascript"}
```javascript
// ── 7 primitive types (stored by value, immutable) ──
// string, number, boolean, null, undefined, symbol, bigint
// Primitives are copied by value — each variable gets its own copy.

let str = "hello";
let strCopy = str;  // copy: strCopy is a separate "hello"
str = "world";
console.log(strCopy);  // "hello" — unchanged (primitives are immutable copies)

let num = 42;
let numCopy = num;
num = 99;
console.log(numCopy);  // 42 — unchanged

// ── Reference types (stored by reference, mutable) ──
// Object, Array, Function, Date, RegExp, Map, Set, etc.
// References point to heap-allocated objects — copying a reference shares the object.

const arr = [1, 2, 3];
const arrRef = arr;     // arrRef points to the SAME array (copy of the reference)
arr.push(4);
console.log(arrRef);    // [1, 2, 3, 4] — shared mutation

// ── Passing to functions: primitives copy value, references share object ──
function modifyPrim(n) { n = 99; }  // n is a copy — modifying it doesn't affect caller
function modifyRef(o) { o.x = 99; } // o is a reference — mutating the object affects caller

let x = 10;
modifyPrim(x);
console.log(x);  // 10 — unchanged (primitive was copied)

let obj = { x: 10 };
modifyRef(obj);
console.log(obj.x);  // 99 — changed (shared object was mutated)

// ── Reassigning a reference inside a function does NOT affect the caller ──
function reassign(o) { o = { x: 99 }; }  // o is a local reference, now points to a NEW object
let myObj = { x: 10 };
reassign(myObj);
console.log(myObj.x);  // 10 — unchanged (the local o was reassigned, not the caller's variable)
```
::

## Type Coercion: The Abstract Equality Algorithm

::code-wrapper{language="javascript"}
```javascript
// ── `==` triggers type coercion; `===` checks type first ──
// The Abstract Equality Algorithm (ECMA-262 §7.2.15) has ~20 rules.
// Key rules (the most surprising ones):

// Rule 1: number ↔ string → string is coerced to number
1 == "1";       // true — "1" → 1 (ToNumber("1") = 1)
0 == "";        // true — "" → 0 (ToNumber("") = 0)
0 == "0";       // true — "0" → 0

// Rule 2: boolean → number (true → 1, false → 0)
1 == true;      // true — true → 1
0 == false;    // true — false → 0
"" == false;   // true — "" → 0, false → 0 → 0 == 0

// Rule 3: null == undefined (special case — only each other)
null == undefined;  // true (special rule — they're "loosely equal")
null == 0;           // false (null is NOT coerced to 0 for ==)
null == false;       // false

// Rule 4: object → primitive (via ToPrimitive, which calls valueOf/toString)
"[object Object]" == {};       // true — {} → "[object Object]"
"1,2,3" == [1, 2, 3];         // true — array → "1,2,3" → "1,2,3" == "1,2,3"
"1" == [1];                    // true — [1] → "1" → 1 == 1

// ── NaN: the only value not equal to itself ──
NaN == NaN;   // false
NaN === NaN;  // false
Number.isNaN(NaN);  // true (correct — doesn't coerce)

// ── `===` is always safer: no coercion, checks type first ──
1 === "1";     // false (different types — immediate false)
null === undefined;  // false (different types)

// ── Object.is: the "truly correct" equality (handles NaN and -0) ──
Object.is(NaN, NaN);    // true (unlike == and ===)
Object.is(-0, 0);       // false (unlike === which says -0 === 0 → true)
Object.is(0, 0);       // true
```
::

## Anti-Pattern: Implicit Coercion in Conditionals

::code-wrapper{language="javascript"}
```javascript
// ❌ NAIVE — relies on implicit coercion (surprising results)
function process(data) {
    if (data) {            // empty array [] is truthy! empty string "" is falsy
        doWork(data);
    }
}
process([]);  // [] is truthy — doWork runs with empty array (probably not intended)
process("");  // "" is falsy — doWork doesn't run (maybe intended, maybe not)

// ✅ CORRECT — explicit checks
function processSafe(data) {
    if (data != null && typeof data === "object" && data.length > 0) {
        doWork(data);  // explicit: not null, is object, has elements
    }
}

// ── The 8 falsy values ──
// false, 0, -0, 0n, "", null, undefined, NaN
// Everything else is truthy (including [], {}, "0", "false", Infinity)

// ── ⚠️ `0` and `""` are falsy — `??` vs `||` matters ──
let count = 0;
let default1 = count || 10;    // 10 — || treats 0 as falsy, uses default
let default2 = count ?? 10;   // 0 — ?? only uses default for null/undefined

let name = "";
let n1 = name || "Anonymous";  // "Anonymous" — || treats "" as falsy
let n2 = name ?? "Anonymous"; // "" — ?? keeps empty string

// ── `??` (nullish coalescing) only triggers on null/undefined ──
// Use ?? for "optional with fallback"; use || for "falsy with fallback"
let port = config.port ?? 3000;  // 3000 only if config.port is null/undefined
let mode = config.mode || "prod"; // "prod" if config.mode is any falsy value
```
::

## Primitive Type Checking: The Reliable Way

::code-wrapper{language="javascript"}
```javascript
// ── typeof: works for primitives, unreliable for objects ──
typeof "str";        // "string"
typeof 42;           // "number"
typeof true;         // "boolean"
typeof undefined;    // "undefined"
typeof null;         // "object" ⚠️ BUG (null is primitive, not object)
typeof Symbol();    // "symbol"
typeof 42n;         // "bigint"

typeof {};           // "object"
typeof [];           // "object" ⚠️ arrays are objects
typeof function(){}; // "function"
typeof null;         // "object" ⚠️ legendary bug

// ── Reliable type checks ──
const type = (val) => {
    if (val === null) return "null";
    if (Array.isArray(val)) return "array";
    return typeof val;
};

type(null);     // "null"
type([]);       // "array"
type({});       // "object"
type(42);       // "number"

// ── Object.prototype.toString (the most reliable) ──
Object.prototype.toString.call("");      // "[object String]"
Object.prototype.toString.call([]);      // "[object Array]"
Object.prototype.toString.call(null);    // "[object Null]"
Object.prototype.toString.call(new Map()); // "[object Map]"
Object.prototype.toString.call(async function(){}); // "[object AsyncFunction]"

// ── instanceof: checks the prototype chain (reference types only) ──
[] instanceof Array;     // true
[] instanceof Object;    // true (Array extends Object — prototype chain)
({}) instanceof Object;  // true
new Map() instanceof Map; // true

// ⚠️ instanceof breaks across realms (iframes, worker threads)
// Each realm has its own copy of Array → an array from an iframe is NOT instanceof Array
// Use Array.isArray() for arrays — works across realms
```
::

## Number Internals: IEEE 754 Double Precision

::code-wrapper{language="javascript"}
```javascript
// ── JS numbers are IEEE 754 double-precision floats (64-bit) ──
// 1 bit sign, 11 bits exponent, 52 bits mantissa (53-bit significand)
// Safe integer range: -(2^53 - 1) to (2^53 - 1) = -9007199254740991 to 9007199254740991

console.log(Number.MAX_SAFE_INTEGER);  // 9007199254740991 (2^53 - 1)
console.log(Number.MIN_SAFE_INTEGER);  // -9007199254740991
console.log(Number.MAX_VALUE);         // 1.7976931348623157e+308
console.log(Number.EPSILON);           // 2.220446049250313e-16

// ── Precision loss beyond MAX_SAFE_INTEGER ──
console.log(9007199254740991 + 1);  // 9007199254740992 (correct)
console.log(9007199254740991 + 2);  // 9007199254740992 (WRONG! precision lost)
console.log(9007199254740993 === 9007199254740992);  // true (can't distinguish)

// ── 0.1 + 0.2 !== 0.3 (classic floating-point bug) ──
console.log(0.1 + 0.2);          // 0.30000000000000004
console.log(0.1 + 0.2 === 0.3);  // false

// ✅ Fix: use Number.EPSILON for comparison
function approxEqual(a, b, eps = Number.EPSILON) {
    return Math.abs(a - b) < eps;
}
console.log(approxEqual(0.1 + 0.2, 0.3));  // true

// ✅ Fix for money: use integer cents or BigDecimal library
function addMoney(a, b) {
    return (Math.round(a * 100) + Math.round(b * 100)) / 100;  // work in cents
}
console.log(addMoney(0.1, 0.2));  // 0.3

// ── BigInt: arbitrary-precision integers (no precision loss) ──
const big = 9007199254740993n;  // n suffix → BigInt
console.log(big + 1n);          // 9007199254740994n (correct!)
// ⚠️ BigInt can't mix with regular numbers: big + 1 → TypeError
// BigInt is for integers only — no decimals: 1n / 2n → 0n (truncated)

// ── -0 exists (negative zero) ──
console.log(-0 === 0);         // true (=== can't distinguish)
console.log(Object.is(-0, 0)); // false (Object.is can)
console.log(1 / -0);           // -Infinity (negative zero matters for division)
console.log(Math.sign(-0));   // -1 (Math.sign distinguishes -0)
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── Swap variables with destructuring (no temp needed) ──
let a = 1, b = 2;
[a, b] = [b, a];  // a=2, b=1

// ── Optional chaining with nullish coalescing for deep defaults ──
const port = config?.server?.port ?? 3000;  // 3000 if any part is null/undefined

// ── Comma operator: evaluate multiple expressions, return last ──
const result = (console.log("side effect"), 42);  // logs, then result = 42
// Use sparingly — can be confusing. Useful in for-loop init: for (let i = 0, j = 10; ...)

// ── Numeric separators (ES2021) for readability ──
const billion = 1_000_000_000;  // underscores ignored — same as 1000000000
const bytes = 0xff_ff;           // hex with separators
const binary = 0b1010_1010;     // binary with separators

// ── Tagged template literals for safe HTML/SQL ──
function html(strings, ...values) {
    return strings.reduce((acc, str, i) =>
        acc + str + (i < values.length ? String(values[i]).replace(/[<>&]/g, c =>
            ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])) : ''), '');
}
const userInput = "<script>alert('xss')</script>";
const safe = html`<div>${userInput}</div>`;  // escaped: &lt;script&gt;...
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── `typeof` for undeclared variables doesn't throw (but let/const in TDZ does) ──
console.log(typeof undeclaredVar);  // "undefined" (no error — typeof is safe for undeclared)
// console.log(typeof tdzVar);      // ReferenceError if tdzVar is in TDZ (let/const)

// ── `const` with arrays/objects: the binding is frozen, the value isn't ──
const arr = [1, 2, 3];
arr.push(4);  // ✓ mutates the array (const only prevents reassigning `arr`)
// arr = [];  // ✗ TypeError: Assignment to constant variable

// ── `let` in the global scope does NOT create a global object property ──
let x = 10;
console.log(window.x);  // undefined (let doesn't create window property)
var y = 10;
console.log(window.y);  // 10 (var creates window property)

// ── Re-declaration: var allows it, let/const don't ──
var a = 1;
var a = 2;  // ✓ var allows re-declaration
let b = 1;
// let b = 2;  // ✗ SyntaxError: Identifier 'b' has already been declared

// ── `0.1 + 0.2` and the `toFixed` trap ──
(0.1 + 0.2).toFixed(2);  // "0.30" (toFixed rounds to string)
// ⚠️ toFixed returns a STRING, not a number
// ⚠️ toFixed has rounding issues: (1.005).toFixed(2) → "1.00" (not "1.01"!)
```
::

## 🧠 Quick Quiz

What does this output?

::code-wrapper{language="javascript"}
```javascript
let x = 1;
function check() {
    if (false) {
        let x = 2;
    }
    console.log(x);
}
check();
```
::

<details>
<summary>Answer</summary>

`1`

The `let x = 2` inside the `if (false)` block is block-scoped to that `if` block. Even though the block never executes, the `let` declaration still creates a binding in that block's scope (in the TDZ). But since `console.log(x)` is in the function scope (outside the `if` block), it accesses the outer `let x = 1`.

If the `console.log(x)` were inside the `if` block (before the `let x = 2`), it would throw `ReferenceError` (TDZ — accessing `x` before its declaration in the same block).

**The lesson**: `let`/`const` are block-scoped. A `let` inside an `if (false)` block still creates a binding in that block's scope — but only that block. The outer `x` is unaffected.

</details>