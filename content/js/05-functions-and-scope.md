# 05 — Functions & Scope

## Function Declarations

::code-wrapper{language="javascript"}
```javascript
// Function declaration — hoisted entirely
function greet(name) {
  return `Hello, ${name}`
}

// Can be called before declaration (hoisted)
sayHi()  // works — function declarations are hoisted
function sayHi() { console.log('Hi!') }
```
::

## Function Expressions

::code-wrapper{language="javascript"}
```javascript
// Named function expression
const greet = function greet(name) {
  return `Hello, ${name}`
}

// Anonymous function expression
const greet = function (name) {
  return `Hello, ${name}`
}

// NOT hoisted — only the variable declaration is hoisted (as undefined)
sayBye()  // ReferenceError (TDZ for const/let) or TypeError (for var)
const sayBye = function () { console.log('Bye!') }
```
::

## Arrow Functions

::code-wrapper{language="javascript"}
```javascript
// Full syntax
const add = (a, b) => { return a + b }

// Implicit return (no braces)
const add = (a, b) => a + b

// Single param — no parentheses needed
const square = x => x * x

// No params — empty parens required
const getRandom = () => Math.random()

// Returning an object literal — wrap in parens
const makeUser = (name, age) => ({ name, age })

// Arrow functions have NO `this`, `arguments`, `super`, or `new.target`
// They inherit these from the enclosing scope
```
::

### Arrow vs Regular: when `this` matters

::code-wrapper{language="javascript"}
```javascript
// Regular function — `this` is dynamically bound
const obj = {
  name: 'Alice',
  greet: function () {
    console.log(this.name)  // "Alice" — `this` is obj
  }
}
obj.greet()

// Arrow function — `this` is lexical (inherited from outer scope)
const obj2 = {
  name: 'Bob',
  greet: () => {
    console.log(this.name)  // undefined — `this` is NOT obj2
  }
}

// Best practice: use arrows in callbacks, regular functions for methods
const timer = {
  count: 0,
  start() {
    // Arrow preserves `this` = timer
    setInterval(() => { this.count++; console.log(this.count) }, 1000)
  }
}
```
::

## Parameters

### Default Parameters

::code-wrapper{language="javascript"}
```javascript
function greet(name = 'Anonymous', greeting = 'Hello') {
  return `${greeting}, ${name}`
}

greet()                    // "Hello, Anonymous"
greet('Alice')             // "Hello, Alice"
greet('Alice', 'Hi')       // "Hi, Alice"
greet(undefined, 'Hi')     // "Hi, Anonymous" (undefined triggers default)
greet(null, 'Hi')          // "Hi, null" (null does NOT trigger default)

// Default can reference earlier params
function createUser(name, id = generateId(), role = 'user') {
  return { name, id, role }
}
```
::

### Rest Parameters

::code-wrapper{language="javascript"}
```javascript
function sum(...nums) {
  return nums.reduce((a, b) => a + b, 0)
}
sum(1, 2, 3)        // 6
sum()               // 0 (empty array)

// Rest must be last
function log(tag, ...items) {
  console.log(tag, items)
}

// Edge case: arguments object (old way — avoid)
function oldSum() {
  let total = 0
  for (let i = 0; i < arguments.length; i++) total += arguments[i]
  return total
}
// arguments is NOT a real array — no .map(), .filter(), etc.
```
::

## Returning Values

::code-wrapper{language="javascript"}
```javascript
// Functions without return return undefined
function noReturn() { }
noReturn()  // undefined

// Arrow without return
const noop = () => { }
noop()  // undefined

// Early return pattern
function process(data) {
  if (!data) return null
  if (data.length === 0) return null

  const result = transform(data)
  return result
}
```
::

## Scope

### Global, Function, and Block Scope

::code-wrapper{language="javascript"}
```javascript
// Global scope
const globalVar = 'I am global'

function example() {
  // Function scope
  const funcVar = 'I am function-scoped'

  if (true) {
    // Block scope
    const blockVar = 'I am block-scoped'
    console.log(funcVar)    // OK — can access outer scope
  }

  console.log(blockVar)    // ReferenceError — blockVar not accessible
  console.log(globalVar)   // OK
}

console.log(funcVar)       // ReferenceError — funcVar not accessible
```
::

### Hoisting

::code-wrapper{language="javascript"}
```javascript
// Function declarations are hoisted with body
hoisted()  // works
function hoisted() { console.log('I am hoisted') }

// Function expressions — only variable declaration hoisted
notHoisted()  // ReferenceError (const) / TypeError (var)
const notHoisted = function () { console.log('not hoisted') }

// var hoisting (function-scoped)
console.log(x)  // undefined (not ReferenceError — hoisted as undefined)
var x = 10

// let/const hoisting (TDZ — Temporal Dead Zone)
console.log(y)  // ReferenceError — Cannot access 'y' before initialization
let y = 10
```
::

### Edge case: hoisting in nested functions

::code-wrapper{language="javascript"}
```javascript
function outer() {
  inner()  // works — function declarations are hoisted to top of scope

  function inner() {
    console.log('inner')
  }
}
```
::

## IIFE (Immediately Invoked Function Expression)

::code-wrapper{language="javascript"}
```javascript
// Classic pattern — creates a private scope (pre-ES6 modules)
;(function () {
  const private = 'hidden'
  console.log('IIFE runs immediately')
})()

// Arrow IIFE
;(() => {
  console.log('Arrow IIFE')
})()

// With parameters
;((name) => {
  console.log(`Hello, ${name}`)
})('Alice')

// Best practice: use ES modules instead of IIFEs for scope isolation
```
::

## Functions as First-Class Citizens

::code-wrapper{language="javascript"}
```javascript
// Assign to variable
const fn = function () { return 'hello' }

// Pass as argument
[1, 2, 3].map(function (x) { return x * 2 })

// Return from function
function multiplier(factor) {
  return function (x) { return x * factor }
}
const double = multiplier(2)
double(5)  // 10

// Store in object/array
const ops = {
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
}
```
::

## Generator Functions

::code-wrapper{language="javascript"}
```javascript
function* counter() {
  let i = 0
  while (true) {
    yield i++
  }
}

const gen = counter()
gen.next()  // { value: 0, done: false }
gen.next()  // { value: 1, done: false }
gen.next()  // { value: 2, done: false }

// Practical: generate IDs
function* idGenerator() {
  let id = 1
  while (true) yield id++
}

// yield* delegates to another generator
function* concatGen(...gens) {
  for (const gen of gens) yield* gen
}
```
::

## 💡 Tips & Tricks

**Arrow functions for short callbacks** — Use arrows for `.map()`, `.filter()`, etc. But use regular functions for object methods where you need `this`. Rule of thumb: if you need `this` or need to use `new`, use regular functions.

**Default parameters are lazy** — `function log(msg = expensiveFn())` only calls `expensiveFn()` if you omit the argument. This is useful for expensive operations that shouldn't run every call.

**Rest parameters are real arrays** — `...args` gives you a real Array, not the `arguments` object. This means `.map()`, `.filter()`, etc. all work. No need to convert with `Array.from()`.

**Generator functions for iterators** — `function* gen() { yield 1; yield 2; }` creates lazy sequences. Useful for infinite sequences without memory overhead.

## ⚠️ Edge Cases & Gotchas

**Arrow functions can't be constructors** — `new (() => {})()` throws. Arrow functions have no `prototype`, no `new.target`, no `super`. Use regular functions or classes for constructors.

**Hoisting creates TDZ (Temporal Dead Zone)** — Accessing `x` before `let x = 5` throws ReferenceError, not `undefined`. The variable exists but is uninitialized. This is safer than `var` hoisting but confuses beginners.

**Default parameters can't reference later params** — `function f(a = b, b = 1)` throws ReferenceError because `b` isn't defined yet when `a` is evaluated. Parameters are evaluated left-to-right.

**Returning object literals from arrows is tricky** — `const f = () => { x: 1 }` returns `undefined` (parsed as a block). Use `() => ({ x: 1 })` with parens to return the object.

**Functions are closures by default** — Every function captures its enclosing scope. This is powerful for data privacy but can cause memory leaks if not careful (huge captured objects aren't garbage collected).

## 🧠 Spot the Bug

What does this log?

```javascript
const obj = {
  name: 'Alice',
  greet: () => console.log(this.name),
  greetRegular() { console.log(this.name) }
}

obj.greet()
obj.greetRegular()
```

<details>
<summary>Answer</summary>

Logs `undefined` then `Alice`. Here's why:
- Arrow function `greet` has lexical `this` from the global scope (or undefined in strict mode), not from `obj`
- Regular function `greetRegular` has `this` bound to `obj` (the caller)

**The lesson**: Never use arrow functions as object methods if you need `this`. Arrows are for callbacks, not methods.

</details>

## Key Takeaways

- Function declarations are hoisted; expressions are not — only the variable is hoisted.
- Arrow functions have lexical `this` — use them for callbacks, not object methods.
- `const` prevents reassignment but allows mutation of object contents.
- `let`/`const` are block-scoped and live in the TDZ until initialized — no access before declaration.
- `arguments` is not an array — use rest parameters `...args` instead.
- Functions are values — pass them, return them, store them.
- Use ES modules (`import`/`export`) instead of IIFEs for scope isolation.