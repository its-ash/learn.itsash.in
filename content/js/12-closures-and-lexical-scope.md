# 12 — Closures & Lexical Scope

## What Is a Closure?

A closure is a function that **remembers** the variables from its enclosing scope, even after that scope has finished executing.

::code-wrapper{language="javascript"}
```javascript
function createCounter() {
  let count = 0

  return function () {
    count++
    return count
  }
}

const counter = createCounter()
counter()  // 1
counter()  // 2
counter()  // 3

// `count` is captured by the closure — not accessible from outside
// console.log(count)  // ReferenceError
```
::
::

## Lexical Scope

Scope is determined by **where the function is written** in the source code, not where it's called.

::code-wrapper{language="javascript"}
```javascript
const globalVar = 'global'

function outer() {
  const outerVar = 'outer'

  function inner() {
    const innerVar = 'inner'
    // Can access: innerVar, outerVar, globalVar
    console.log(innerVar, outerVar, globalVar)
  }

  return inner
}

const fn = outer()
fn()  // "inner outer global" — inner remembers outerVar even after outer returned
```
::
::

## Practical Uses

### Data Privacy

::code-wrapper{language="javascript"}
```javascript
function createBankAccount(initialBalance) {
  let balance = initialBalance

  return {
    deposit(amount) {
      balance += amount
      return balance
    },
    withdraw(amount) {
      if (amount > balance) throw new Error('Insufficient funds')
      balance -= amount
      return balance
    },
    getBalance() {
      return balance
    }
  }
}

const account = createBankAccount(100)
account.deposit(50)   // 150
account.withdraw(30)  // 120
// account.balance    // undefined — truly private!
```
::
::

### Function Factories (Currying)

::code-wrapper{language="javascript"}
```javascript
function multiplier(factor) {
  return function (n) {
    return n * factor
  }
}

const double = multiplier(2)
const triple = multiplier(3)
double(5)   // 10
triple(5)   // 15

// Arrow version
const multiplierArrow = factor => n => n * factor
```
::
::

### Memoization

::code-wrapper{language="javascript"}
```javascript
function memoize(fn) {
  const cache = new Map()

  return function (...args) {
    const key = JSON.stringify(args)
    if (cache.has(key)) return cache.get(key)

    const result = fn.apply(this, args)
    cache.set(key, result)
    return result
  }
}

const slowFib = memoize(n =>
  n < 2 ? n : slowFib(n - 1) + slowFib(n - 2)
)
slowFib(40)  // fast — cached results
```
::
::

### Event Handlers with State

::code-wrapper{language="javascript"}
```javascript
function createToggleButton(button) {
  let isOn = false

  button.addEventListener('click', () => {
    isOn = !isOn
    button.textContent = isOn ? 'ON' : 'OFF'
  })
}
```
::
::

## Edge Cases

### The Loop Variable Problem (var vs let)

::code-wrapper{language="javascript"}
```javascript
// var — all closures share the same variable
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0)
}
// Output: 3, 3, 3 (all see the final value of i)

// let — each iteration creates a new binding
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0)
}
// Output: 0, 1, 2 (each closure captures its own i)

// var fix with IIFE
for (var i = 0; i < 3; i++) {
  ;(function (j) {
    setTimeout(() => console.log(j), 0)
  })(i)
}
// Output: 0, 1, 2
```
::
::

### Memory Considerations

::code-wrapper{language="javascript"}
```javascript
// Closures keep variables alive — can cause memory leaks
function setup() {
  const hugeData = new Array(1000000).fill('*')

  return function () {
    console.log('done')
    // hugeData is kept alive by this closure even if not used!
  }
}

const fn = setup()
fn()  // hugeData still in memory

// Best practice: null out references when done
function setupBetter() {
  let hugeData = new Array(1000000).fill('*')

  return function () {
    const result = hugeData.length
    hugeData = null  // release reference
    return result
  }
}
```
::
::

## 💡 Tips & Tricks

**Closures for private fields** — Before ES2022 `#` fields, closures were the way: `function User() { let private = {}; this.getPrimary = () => private }`. Still valid for methods-only access.

**Currying for partial application** — `const add = a => b => a + b` lets you do `add(5)(3)` or `const add5 = add(5); add5(3)`. Useful for functional pipelines.

**Memoization for expensive functions** — Cache results of pure functions. But watch your cache size; memoize only functions you'll call frequently with the same args.

**Immediately Invoked Generators** — `(function* gen() { ... })()` creates a IIFE that yields. Rare but powerful for lazy evaluation.

## ⚠️ Edge Cases & Gotchas

**The loop variable closure trap** — `for (var i = 0; i < 3; i++) { setTimeout(() => console.log(i), 0) }` logs `3, 3, 3`. ALL closures share the SAME `i`. Use `let` to fix: each iteration gets a new `i`.

**Closures capture by reference, not value** — A closure captures the variable, not its value at capture time. Modify the variable later, and the closure sees the new value. This confuses newcomers.

**Memory leaks from closures** — Large objects captured by closures never get garbage collected as long as the closure exists. `const fn = (() => { const huge = new Array(1e9); return () => {} })()` keeps `huge` in memory forever. Be careful.

**Circular closures can leak** — `element.onclick = () => { doSomething(element); }` — the closure captures `element`, which has a reference to the closure. Breaks reference cycles by nulling the handler when done.

**Closure scope chain is read-only from closure perspective** — You CAN mutate objects in outer scope, but you CAN'T rebind outer variables from inside. `let x; (() => { x = 5 })()` mutates the binding (works). But `let y; (() => { let y = 5 })()` creates a new `y` inside.

## 🧠 Spot the Bug

What does this log?

::code-wrapper{language="javascript"}
```javascript
const fns = []
for (var i = 0; i < 3; i++) {
  fns.push(() => i)
}

console.log(fns[0](), fns[1](), fns[2]())
```
::

<details>
<summary>Answer</summary>

Logs `3 3 3`. Here's why:
- All three arrow functions capture the SAME `i` variable (var is function-scoped)
- By the time any closure runs, the loop has finished and `i` is 3

**Fix**: Use `let` instead of `var`. Each iteration gets a fresh binding.

::code-wrapper{language="javascript"}
```javascript
const fns = []
for (let i = 0; i < 3; i++) {
  fns.push(() => i)
}

console.log(fns[0](), fns[1](), fns[2]())  // 0 1 2
```
::

</details>

## Key Takeaways

- Closures capture variables from their **lexical** (surrounding) scope, not call-time scope.
- Use closures for: data privacy, currying, memoization, callbacks with state.
- `let` in loops creates a new binding per iteration — fixes the classic closure-in-loop problem.
- Closures keep captured variables in memory — clean up references when no longer needed.
- Every function in JavaScript is technically a closure (it closes over the global scope).