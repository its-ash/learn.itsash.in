# 13 — Higher-Order Functions

## Functions as Arguments and Return Values

::code-wrapper{language="javascript"}
```javascript
// Higher-order function: takes a function as argument
[1, 2, 3].map(x => x * 2)            // [2, 4, 6]
[1, 2, 3].filter(x => x > 1)         // [2, 3]
[1, 2, 3].reduce((a, b) => a + b, 0) // 6

// Higher-order function: returns a function
function compose(f, g) {
  return x => f(g(x))
}
const addOne = x => x + 1
const double = x => x * 2
const addOneThenDouble = compose(double, addOne)
addOneThenDouble(3)  // 8 — (3+1)*2
```
::
::

## Composition

::code-wrapper{language="javascript"}
```javascript
// Pipe — left to right
const pipe = (...fns) => x => fns.reduce((v, f) => f(v), x)

// Compose — right to left
const compose = (...fns) => x => fns.reduceRight((v, f) => f(v), x)

const trim = s => s.trim()
const toLower = s => s.toLowerCase()
const slugify = s => s.replace(/\s+/g, '-')

const toSlug = pipe(trim, toLower, slugify)
toSlug('  Hello World  ')  // "hello-world"
```
::
::

## Currying

::code-wrapper{language="javascript"}
```javascript
// Currying — transform(a, b, c) → transform(a)(b)(c)
const curry = fn => {
  return function curried(...args) {
    if (args.length >= fn.length) {
      return fn.apply(this, args)
    }
    return (...more) => curried(...args, ...more)
  }
}

const add = curry((a, b, c) => a + b + c)
add(1)(2)(3)     // 6
add(1, 2)(3)     // 6
add(1)(2, 3)     // 6
add(1, 2, 3)     // 6

// Practical: reusable partial functions
const log = curry((level, message) => console.log(`[${level}] ${message}`))
const error = log('ERROR')
const info = log('INFO')
error('Database failed')  // "[ERROR] Database failed"
info('Server started')    // "[INFO] Server started"
```
::
::

## Partial Application

::code-wrapper{language="javascript"}
```javascript
// Partial application — fix some args, leave others open
const partial = (fn, ...args) => (...rest) => fn(...args, ...rest)

const multiply = (a, b, c) => a * b * c
const double = partial(multiply, 2)
double(3, 4)  // 24

const timesSix = partial(multiply, 2, 3)
timesSix(4)  // 24

// Difference from currying:
// Curry: f(a)(b)(c) — one arg at a time
// Partial: f(a, b)(c) — some args, then rest
```
::
::

## 💡 Tips & Tricks

**Built-in composition** — Many libraries ship `pipe` and `compose`. Use them instead of rolling your own — lodash, Ramda, etc. have battle-tested versions.

**Currying with automatic detection** — `const curry = fn => fn.length <= 1 ? fn : x => y => fn(x, y)` detects function arity and handles it automatically.

**Function.prototype.bind is partial application** — `fn.bind(context, arg1, arg2)` is a built-in way to partially apply arguments. Forget about writing partial helpers.

**Array methods are higher-order** — `.map()`, `.filter()`, `.reduce()` are all higher-order. They accept function arguments. Master these before complex composition.

## ⚠️ Edge Cases & Gotchas

**Composition order matters** — `compose(f, g)` means "do g, then f" (right-to-left, math-style). `pipe(f, g)` means "do f, then g" (left-to-right, shell-style). Easy to flip and create bugs.

**Currying breaks function length** — `const f = curry((a,b,c) => ...); f.length` is 1 (the first partial), not 3. Use `.bind()` if you need the original arity.

**Currying + default params = confusion** — `const f = curry((a, b = 2) => a + b)` has arity 1 (b has default). You'd need to call `f(1)(undefined)` to use defaults. Avoid mixing these.

**Partial application is order-dependent** — `partial(fn, a, b)` fixes args left-to-right. If your function expects args right-to-left, partial won't help. Curry is more flexible.

**Context loss in composed functions** — `compose(obj.method, otherFn)` loses `this` from `obj.method`. You need to `.bind()` methods before composing: `compose(obj.method.bind(obj), otherFn)`.

## 🧠 Spot the Bug

What does this log?

::code-wrapper{language="javascript"}
```javascript
const compose = (...fns) => x => fns.reduceRight((v, f) => f(v), x)

const add10 = x => x + 10
const times2 = x => x * 2

const composed = compose(add10, times2)

console.log(composed(5))
```
::

<details>
<summary>Answer</summary>

Logs `20`. Here's why:
- `compose` does right-to-left: `times2`, then `add10`
- `composed(5)` → `times2(5)` = 10 → `add10(10)` = 20

If you wanted 40, you'd need `compose(times2, add10)` (right-to-left order in the compose call is the opposite of execution order).

**The lesson**: Compose is confusing. Many prefer `pipe` (left-to-right) for readability.

</details>

## Key Takeaways

- Higher-order functions take or return functions — the backbone of functional programming in JS.
- `pipe` executes left-to-right, `compose` right-to-left — choose one and be consistent.
- Currying transforms multi-arg functions into single-arg chains — useful for reusable partials.
- Partial application fixes some args, leaving the rest for later — simpler than full currying.