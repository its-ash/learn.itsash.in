# 02 — Variables & Data Types

## Declaration: `let`, `const`, `var`

| Keyword | Scope | Reassign | Redeclare | Hoisted |
|---|---|---|---|---|
| `let` | Block `{}` | ✅ | ❌ | TDZ |
| `const` | Block `{}` | ❌ | ❌ | TDZ |
| `var` | Function | ✅ | ✅ | `undefined` |

### Best practice: prefer `const`, use `let` only when reassignment is needed

::code-wrapper{language="javascript"}
```javascript
const API_URL = 'https://api.example.com'    // never reassign
let count = 0                                // will change
count++                                       // OK
```
::

### `const` does NOT freeze objects/arrays

::code-wrapper{language="javascript"}
```javascript
const user = { name: 'Alice' }
user.name = 'Bob'          // OK — mutating the object
user.age = 30              // OK — adding a property

user = { name: 'Bob' }    // TypeError — reassigning the binding

// To freeze, use Object.freeze
const frozen = Object.freeze({ name: 'Alice' })
frozen.name = 'Bob'       // silently fails in non-strict, TypeError in strict mode
```
::

### `var` is function-scoped (not block-scoped)

::code-wrapper{language="javascript"}
```javascript
function example() {
  if (true) {
    var x = 10       // function-scoped — exists outside the block
    let y = 20       // block-scoped — only inside the block
  }
  console.log(x)     // 10
  console.log(y)     // ReferenceError
}

// var hoisting
console.log(a)       // undefined (not ReferenceError — hoisted with default)
var a = 5

console.log(b)       // ReferenceError — TDZ
let b = 5
```
::

### Edge case: `var` in loops

::code-wrapper{language="javascript"}
```javascript
// var — all closures capture the SAME variable
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0)
}
// Output: 3, 3, 3

// let — each iteration gets a fresh binding
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0)
}
// Output: 0, 1, 2
```
::

## Primitive Types

JavaScript has **7 primitive types** (passed by value):

| Type | Example | `typeof` |
|---|---|---|
| `Number` | `42`, `3.14` | `"number"` |
| `String` | `"hello"` | `"string"` |
| `Boolean` | `true` | `"boolean"` |
| `Undefined` | `undefined` | `"undefined"` |
| `Null` | `null` | `"object"` ⚠️ |
| `Symbol` | `Symbol()` | `"symbol"` |
| `BigInt` | `123n` | `"bigint"` |

### Reference types (passed by reference)

`Object`, `Array`, `Function`, `Date`, `RegExp`, `Map`, `Set`, `WeakMap`, `WeakSet`.

## `typeof` and `instanceof`

::code-wrapper{language="javascript"}
```javascript
typeof 42             // "number"
typeof "hello"        // "string"
typeof true           // "boolean"
typeof undefined      // "undefined"
typeof null           // "object"  ⚠️ (historical bug, can't be fixed)
typeof {}             // "object"
typeof []             // "object"  ⚠️ (arrays are objects)
typeof function(){}   // "function"
typeof Symbol()       // "symbol"
typeof 10n            // "bigint"

// Distinguish arrays from objects
Array.isArray([1, 2, 3])    // true
Array.isArray({})          // false

// instanceof checks prototype chain
[] instanceof Array              // true
new Date() instanceof Date       // true
new Error() instanceof Error     // true
new Error() instanceof Object    // true (Error extends Object)
```
::

### Edge case: `typeof` on undeclared variables

::code-wrapper{language="javascript"}
```javascript
typeof undeclaredVar     // "undefined" (no ReferenceError!)
// This is a safety feature — used to check if a global exists:
if (typeof window !== 'undefined') {
  console.log('Running in browser')
}
```
::

## Numbers

JavaScript has one number type: IEEE 754 double-precision float.

::code-wrapper{language="javascript"}
```javascript
// Integers and floats are the same type
typeof 42        // "number"
typeof 3.14      // "number"

// Floating-point precision issues
0.1 + 0.2       // 0.30000000000000004
0.1 + 0.2 === 0.3  // false ⚠️

// Safe integer range
Number.MAX_SAFE_INTEGER   // 9007199254740991 (2^53 - 1)
Number.MIN_SAFE_INTEGER   // -9007199254740991
9007199254740992 + 1     // 9007199254740992 (precision lost!)

// Use BigInt for large integers
123n + 456n              // 579n
9007199254740993n        // 9007199254740993n (exact)
```
::

### Best practice: comparing floats

::code-wrapper{language="javascript"}
```javascript
// Bad — direct comparison
if (0.1 + 0.2 === 0.3) { }  // false!

// Good — use an epsilon
function approxEqual(a, b, eps = 1e-9) {
  return Math.abs(a - b) < eps
}
approxEqual(0.1 + 0.2, 0.3)  // true

// Or use toFixed for display
(0.1 + 0.2).toFixed(2)       // "0.30" (returns string!)
```
::

### Special number values

::code-wrapper{language="javascript"}
```javascript
typeof NaN           // "number" (NaN is a number!)
NaN === NaN          // false ⚠️ (NaN is never equal to itself)
Number.isNaN(NaN)    // true (use this)
isNaN('hello')       // true (coerces first)
Number.isNaN('hello') // false (no coercion)

Infinity             // positive infinity
-Infinity            // negative infinity
1 / 0               // Infinity
-1 / 0              // -Infinity
0 / 0               // NaN
```
::

## Strings

Strings are immutable sequences of UTF-16 code units.

::code-wrapper{language="javascript"}
```javascript
const s = 'Hello'

s[0] = 'h'    // no effect — strings are immutable
console.log(s)  // "Hello"

// Length is in UTF-16 code units, not characters
'a'.length              // 1
'😀'.length            // 2 ⚠️ (surrogate pair)
[...'😀'].length        // 1 (spread iterates code points)

// Concatenation
'Hello' + ' ' + 'World'   // "Hello World"
'Hello'.concat(' ', 'World')

// Access
'Hello'[0]            // "H"
'Hello'.charAt(0)    // "H"
'Hello'.at(-1)       // "o" (supports negative indices)
```
::

## Boolean and Truthiness

::code-wrapper{language="javascript"}
```javascript
// Falsy values (everything else is truthy)
false, 0, -0, 0n, '', null, undefined, NaN

// Truthy (surprising ones)
'0'           // string "0" is truthy (not the number 0)
'false'       // non-empty string is truthy
[]            // empty array is truthy
{}            // empty object is truthy
function(){}  // functions are truthy

// Short-circuit evaluation
const name = userInput || 'Anonymous'
const value = obj && obj.prop    // null-safe access (pre-optional-chaining)

// Nullish coalescing (only null/undefined, not 0 or '')
const count = input ?? 0   // 0 if input is null/undefined, keeps 0 if input is 0
```
::

### Edge case: `||` vs `??`

::code-wrapper{language="javascript"}
```javascript
const input = 0

input || 10    // 10 (0 is falsy, so fallback used)
input ?? 10    // 0  (0 is not null/undefined, so kept)

// Use ?? when 0, '', or false are valid values
const config = {
  timeout: options.timeout ?? 5000,    // keeps 0 if explicitly set
  retries: options.retries ?? 3,
}
```
::

## Type Coercion

### Implicit (avoid in production code)

::code-wrapper{language="javascript"}
```javascript
'5' + 3      // "53"  (string concatenation — number coerced to string)
'5' - 3      // 2     (subtraction — string coerced to number)
'5' * '2'    // 10
'5' * 'abc'  // NaN
[] + []      // ""    (both become "")
[] + {}      // "[object Object]"
{} + []      // 0     (parsed as block + unary plus)
true + true  // 2
null + 0     // 0
undefined + 0 // NaN
```
::

### Explicit (preferred)

::code-wrapper{language="javascript"}
```javascript
// To string
String(42)           // "42"
(42).toString()      // "42"
String(true)         // "true"
String(null)         // "null"
String(undefined)    // "undefined"

// To number
Number('42')         // 42
Number('3.14')       // 3.14
Number('')           // 0
Number(' ')          // 0
Number('abc')        // NaN
Number(true)         // 1
Number(null)         // 0
Number(undefined)    // NaN
parseInt('42px')     // 42
parseFloat('3.14abc') // 3.14
+'42'                // 42 (unary plus — shortest)

// To boolean
Boolean(0)           // false
Boolean('')          // false
Boolean(null)        // false
Boolean([])          // true
!!value              // short form
```
::

## Symbols (Unique Keys)

::code-wrapper{language="javascript"}
```javascript
// Symbols are unique and immutable — ideal for private-ish properties
const id = Symbol('id')
const id2 = Symbol('id')
id === id2     // false — every Symbol() is unique

const obj = {
  [id]: 123,
  name: 'Alice'
}
Object.keys(obj)        // ['name'] — symbols don't appear in keys()
Object.getOwnPropertySymbols(obj)  // [Symbol(id)]

// Well-known symbols
const iterable = {
  [Symbol.iterator]() {
    let i = 0
    return { next: () => ({ value: i++, done: i > 3 }) }
  }
}
for (const v of iterable) console.log(v)  // 0, 1, 2
```
::

## 💡 Tips & Tricks

**const by default** — Use `const` for 95% of code. It's not "more restrictive," it's "clearer intent": readers know the binding won't change. Switch to `let` only when reassignment is necessary — it's a signal to future readers.

**Object.seal vs Object.freeze** — `Object.freeze()` is complete immutability; `Object.seal()` allows mutation of existing properties but blocks adds/deletes. Use `seal` for schemas that shouldn't grow.

**BigInt in JSON** — `JSON.stringify()` throws on BigInt. Use a custom replacer: `JSON.stringify(obj, (k, v) => typeof v === 'bigint' ? v.toString() : v)`.

**Comparing with null** — In most codebases, `x == null` is actually safer than `x === null || x === undefined` because it catches the most common case (truthy falsy confusion). But strict mode + explicit checks is the professional standard.

## ⚠️ Edge Cases & Gotchas

**The `const` + mutation trap** — Beginners think `const x = { a: 1 }; x.a = 2` is illegal. It's not; `const` only locks the *binding*, not the object. To truly freeze: `Object.freeze()` after construction. Deep freeze is tedious — consider immutable libraries for large objects.

**Number precision in arrays** — Storing money as `[12.50, 25.00]` then summing causes the classic `0.1 + 0.2` bug. Store as cents (integers) instead: `[1250, 2500]`, then divide by 100 for display.

**Symbol keys vanish in JSON** — Symbol-keyed properties are silently dropped by `JSON.stringify()`. If you use Symbols for private fields, they won't round-trip. Use `#` private fields in classes for truly private data.

**`isNaN` vs `Number.isNaN` bite** — `isNaN('hello')` returns `true` (coerces first); `Number.isNaN('hello')` returns `false`. The difference: coercion catches typos early. Always use `Number.isNaN()` in strict mode.

## 🧠 Spot the Bug

What does this log?

::code-wrapper{language="javascript"}
```javascript
const x = 0
const y = x ?? 10
const z = y || 20
console.log(z)
```
::

<details>
<summary>Answer</summary>

Logs `20`. Here's why:
- `x ?? 10` → `0` (0 is not null/undefined, so `??` returns the left side)
- `0 || 20` → `20` (0 is falsy, so `||` returns the right side)

**The lesson**: `??` and `||` are not interchangeable. Use `??` when zero is a valid value.

</details>

## Key Takeaways

- Prefer `const`, use `let` when needed, avoid `var` entirely.
- `const` prevents reassignment but NOT mutation — use `Object.freeze` for immutable objects.
- There are 7 primitive types and 1 reference type category (objects).
- `typeof null` is `"object"` — a historical bug. Use `=== null` for null checks.
- Floating-point arithmetic is imprecise — use epsilon comparisons or `BigInt`.
- `NaN !== NaN` — always use `Number.isNaN()`.
- `??` only checks null/undefined, `||` checks all falsy values.