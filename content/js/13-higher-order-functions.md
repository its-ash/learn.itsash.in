---
title: "JavaScript 13 — Higher-Order Functions: Composition, Currying & Partial Application"
description: "Deep-dive into higher-order functions: map/filter/reduce internals, function composition pipelines, currying and partial application, point-free style, and the functor/monad patterns. Code-first reference for senior engineers."
---

# 13 — Higher-Order Functions: Composition, Currying & Partial Application

## Map, Filter, Reduce: The Functional Trinity

::code-wrapper{language="javascript"}
```javascript
// ── A higher-order function takes or returns a function ──
// map, filter, reduce are the foundation of functional array processing.

// ── map: transform each element (1:1 mapping) ──
const doubled = [1, 2, 3].map(x => x * 2);  // [2, 4, 6]
// map calls the callback for each element, collects results into a new array.
// Returns a new array of the SAME LENGTH (always — even if callback returns undefined).

// ── filter: select elements that pass a test (1:0 or 1:1) ──
const evens = [1, 2, 3, 4].filter(x => x % 2 === 0);  // [2, 4]
// filter calls the callback for each element, keeps elements where callback returns truthy.
// Returns a new array (possibly shorter or empty).

// ── reduce: fold to a single value (N:1) ──
const sum = [1, 2, 3, 4].reduce((acc, x) => acc + x, 0);  // 10
// reduce calls the callback with (accumulator, current) for each element.
// The accumulator carries state between calls. Initial value is the second argument.
// Step: 0+1=1, 1+2=3, 3+3=6, 6+4=10

// ── Composition: chain map/filter/reduce (each creates a new array) ──
const result = [1, 2, 3, 4, 5, 6]
    .filter(x => x % 2 === 0)      // [2, 4, 6]
    .map(x => x * x)               // [4, 16, 36]
    .reduce((a, b) => a + b, 0);   // 56

// ⚠️ Each step creates an intermediate array (3 arrays total).
// For large arrays, a single reduce is more efficient (one pass, no intermediates):
const efficient = [1, 2, 3, 4, 5, 6].reduce((acc, x) => {
    if (x % 2 === 0) return acc + x * x;  // filter + map + accumulate in one pass
    return acc;
}, 0);  // 56 (same result, one loop, no intermediate arrays)
```
::

## Function Composition

::code-wrapper{language="javascript"}
```javascript
// ── compose: right-to-left function composition ──
// compose(f, g, h)(x) = f(g(h(x)))
const compose = (...fns) => (x) => fns.reduceRight((acc, fn) => fn(acc), x);

const square = x => x * x;
const addOne = x => x + 1;
const double = x => x * 2;

const transform = compose(double, addOne, square);
// Applied right-to-left: square(3)=9 → addOne(9)=10 → double(10)=20
console.log(transform(3));  // 20

// ── pipe: left-to-right composition (more intuitive reading order) ──
// pipe(f, g, h)(x) = h(g(f(x)))
const pipe = (...fns) => (x) => fns.reduce((acc, fn) => fn(acc), x);

const transformPipe = pipe(square, addOne, double);
// Applied left-to-right: square(3)=9 → addOne(9)=10 → double(10)=20
console.log(transformPipe(3));  // 20 (same result, different order)

// ── Async pipe (each function is async) ──
const pipeAsync = (...fns) => (x) =>
    fns.reduce(async (acc, fn) => fn(await acc), x);

const asyncPipeline = pipeAsync(
    async x => x + 1,     // 5 → 6
    async x => x * 2,     // 6 → 12
    async x => x - 3,     // 12 → 9
);
asyncPipeline(5).then(console.log);  // 9

// ── Compose with multiple arguments ──
const composeMulti = (...fns) => fns.reduceRight((f, g) => (...args) => f(g(...args)));
const addAndMultiply = composeMulti(
    x => x * 2,           // multiply by 2
    (a, b) => a + b       // add two numbers
);
addAndMultiply(3, 4);  // (3+4)*2 = 14
```
::

## Currying and Partial Application

::code-wrapper{language="javascript"}
```javascript
// ── Currying: transform f(a, b, c) into f(a)(b)(c) — one arg at a time ──
const curry = (fn) => {
    return function curried(...args) {
        if (args.length >= fn.length) {  // fn.length = number of params
            return fn.apply(this, args);  // enough args → call
        }
        return (...more) => curried(...args, ...more);  // not enough → return a new function
    };
};

const add = curry((a, b, c) => a + b + c);
add(1)(2)(3);    // 6 (fully curried — one arg at a time)
add(1, 2)(3);    // 6 (partial application — first two, then last)
add(1, 2, 3);   // 6 (all at once — same as calling the original)

// ── Currying for reusable partial functions ──
const log = curry((level, message) => console.log(`[${level}] ${message}`));
const logInfo = log("INFO");    // partial: level fixed to "INFO"
const logError = log("ERROR");  // partial: level fixed to "ERROR"
logInfo("started");   // [INFO] started
logError("crashed");  // [ERROR] crashed

// ── Currying for filter predicates ──
const matches = curry((prop, value, obj) => obj[prop] === value);
const findByName = matches("name");
const findAlice = findByName("Alice");
const users = [{ name: "Alice" }, { name: "Bob" }];
users.filter(findAlice);  // [{ name: "Alice" }]

// ── Partial application: pre-fill some args (not full currying) ──
const partial = (fn, ...preset) => (...rest) => fn(...preset, ...rest);
const add10 = partial((a, b) => a + b, 10);
add10(5);  // 15

// ── Bind as partial application ──
const multiply = (a, b) => a * b;
const double = multiply.bind(null, 2);  // first arg pre-filled with 2
double(5);  // 10
```
::

## Point-Free Style (Tacit Programming)

::code-wrapper{language="javascript"}
```javascript
// ── Point-free: define functions without mentioning the data (the "point") ──

// ❌ NOT point-free (explicit data parameter):
const getNames = (users) => users.map(u => u.name);
const getActiveUsers = (users) => users.filter(u => u.active);
const countActive = (users) => getActiveUsers(users).length;

// ✅ POINT-FREE (no explicit data — composed from small functions):
const prop = (key) => (obj) => obj[key];
const filter = (pred) => (arr) => arr.filter(pred);
const map = (fn) => (arr) => arr.map(fn);
const compose = (...fns) => fns.reduceRight((f, g) => (...args) => f(g(...args)));

const getName = prop("name");
const isActive = prop("active");
const getNames2 = map(getName);
const getActiveUsers2 = filter(isActive);
const getActiveNames = compose(getNames2, getActiveUsers2);
// getActiveNames(users) — no `users` parameter mentioned in the definition

// ── Point-free pipeline for data transformation ──
const parseJson = (str) => JSON.parse(str);
const getData = prop("data");
const getItems = prop("items");
const getFirst = (arr) => arr[0];
const getName2 = prop("name");

const getFirstName = compose(
    getName2,      // get name from the first item
    getFirst,      // get first item
    getItems,      // get items from data
    getData,       // get data from response
    parseJson,     // parse the JSON string
);
getFirstName('{"data":{"items":[{"name":"Alice"},{"name":"Bob"}]}}');  // "Alice"
```
::

## Production Pattern: Validator Pipeline

::code-wrapper{language="javascript"}
```javascript
// ── Composable validators using higher-order functions ──
const Validator = {
    // Primitive validators (return error message or null)
    required: (value) => value == null ? "required" : null,
    minLength: (n) => (value) => value.length < n ? `min ${n} chars` : null,
    maxLength: (n) => (value) => value.length > n ? `max ${n} chars` : null,
    matches: (regex) => (value) => !regex.test(value) ? "invalid format" : null,
    isEmail: (value) => !/^[^@]+@[^@]+$/.test(value) ? "invalid email" : null,
    isNumber: (value) => typeof value !== "number" ? "must be a number" : null,
    inRange: (min, max) => (value) => value < min || value > max ? `must be ${min}-${max}` : null,

    // Compose validators: run all, collect all errors
    all: (...validators) => (value) =>
        validators
            .map(v => v(value))
            .filter(Boolean),  // returns array of error messages (empty = valid)

    // Run validators: first error wins (short-circuit)
    first: (...validators) => (value) =>
        validators.reduce((err, v) => err || v(value), null),
};

// ── Usage ──
const validateUsername = Validator.all(
    Validator.required,
    Validator.minLength(3),
    Validator.maxLength(20),
);

const validateEmail = Validator.all(
    Validator.required,
    Validator.isEmail,
);

const validateAge = Validator.first(
    Validator.required,
    Validator.isNumber,
    Validator.inRange(0, 150),
);

console.log(validateUsername("ab"));   // ["min 3 chars"]
console.log(validateUsername("alice")); // [] (no errors)
console.log(validateEmail("test@test.com")); // []
console.log(validateEmail("invalid")); // ["invalid email"]
console.log(validateAge(25));  // null (valid)
console.log(validateAge(200)); // "must be 0-150"
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── `flow` (pipe alias) for left-to-right readability ──
const flow = (...fns) => (x) => fns.reduce((v, f) => f(v), x);

// ── `tap` for side effects in a pipeline (inspect without modifying) ──
const tap = (fn) => (x) => { fn(x); return x; };
const log = tap(console.log);
const result = pipe(
    x => x + 1,
    log,           // logs the intermediate value, passes it through
    x => x * 2,
    log,           // logs again
    x => x - 3,
)(5);  // logs 6 and 12, returns 9

// ── `memoize` with a cache (higher-order function for caching) ──
const memoize = (fn) => {
    const cache = new Map();
    return (...args) => {
        const key = JSON.stringify(args);
        if (!cache.has(key)) cache.set(key, fn(...args));
        return cache.get(key);
    };
};

// ── `debounce` as a higher-order function ──
const debounce = (fn, ms) => {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
};

// ── `once` as a higher-order function ──
const once = (fn) => {
    let done = false, result;
    return (...args) => done ? result : (done = true, result = fn(...args));
};

// ── `pluck` for extracting a property from each item in an array ──
const pluck = (key) => (arr) => arr.map(obj => obj[key]);
const getNames = pluck("name");
getNames([{ name: "Alice" }, { name: "Bob" }]);  // ["Alice", "Bob"]
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── `reduce` on an empty array without initial value throws ──
[].reduce((a, b) => a + b);  // TypeError: Reduce of empty array with no initial value
[].reduce((a, b) => a + b, 0);  // 0 (safe — always provide initial value)

// ── `map` skips holes (sparse arrays) ──
[1, , 3].map(x => x * 2);  // [2, <empty>, 6] (hole skipped, not processed)
// Use [...arr].map() or arr.flat() first if you need to process all elements.

// ── `filter` with `Boolean` for truthiness filtering ──
[0, 1, "", "a", null, undefined, NaN, false].filter(Boolean);  // [1, "a"]
// Boolean is a function: Boolean(0) = false, Boolean("a") = true

// ── `sort` mutates the original array ──
const arr = [3, 1, 2];
const sorted = arr.sort();  // arr is now [1, 2, 3] (mutated!)
// Use [...arr].sort() or arr.toSorted() (ES2023) for non-mutating sort.

// ── `curry` with rest params: fn.length is unreliable ──
function restFn(...args) { return args.reduce((a, b) => a + b, 0); }
restFn.length;  // 0 (rest params don't count toward .length)
// curry(restFn) would call immediately (0 args >= 0 length) — currying doesn't work with rest params.

// ── Composition order: compose (right-to-left) vs pipe (left-to-right) ──
compose(f, g, h)(x)  // = f(g(h(x))) — right-to-left
pipe(f, g, h)(x)     // = h(g(f(x))) — left-to-right
// Don't mix them up — use the one that reads naturally for your use case.
```
::

## 🧠 Quick Quiz

What does this output?

::code-wrapper{language="javascript"}
```javascript
const pipe = (...fns) => fns.reduce((f, g) => (...args) => g(f(...args)));
const add = x => x + 1;
const mul = x => x * 2;
const result = pipe(add, mul)(3);
console.log(result);
```
::

<details>
<summary>Answer</summary>

`8`

Let's trace through the `pipe` implementation:

1. `pipe(add, mul)` → `fns = [add, mul]`
2. `.reduce((f, g) => (...args) => g(f(...args)))`:
   - First iteration: `f = add`, `g = mul` → returns `(...args) => mul(add(...args))`
3. So `result = (...args) => mul(add(...args))`
4. `result(3)` → `mul(add(3))` → `mul(4)` → `8`

**The lesson**: this `pipe` implementation applies functions **left-to-right** (like a pipeline). `add` runs first (input: 3 → output: 4), then `mul` runs (input: 4 → output: 8). This is the opposite of `compose`, which applies right-to-left.

</details>