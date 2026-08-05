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

## Key Takeaways

- Higher-order functions take or return functions — the backbone of functional programming in JS.
- `pipe` executes left-to-right, `compose` right-to-left — choose one and be consistent.
- Currying transforms multi-arg functions into single-arg chains — useful for reusable partials.
- Partial application fixes some args, leaving the rest for later — simpler than full currying.