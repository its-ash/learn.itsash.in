# 09 — Destructuring & Spread

## Array Destructuring

::code-wrapper{language="javascript"}
```javascript
const [a, b] = [1, 2]
console.log(a, b)  // 1, 2

// Skip elements
const [first, , third] = [1, 2, 3]
console.log(first, third)  // 1, 3

// Rest pattern
const [head, ...tail] = [1, 2, 3, 4]
console.log(head)  // 1
console.log(tail)  // [2, 3, 4]

// Default values
const [x = 10, y = 20] = [5]
console.log(x, y)  // 5, 20

// Swapping variables
let a = 1, b = 2
[a, b] = [b, a]
console.log(a, b)  // 2, 1
```
::

### Edge case: destructuring with holes

::code-wrapper{language="javascript"}
```javascript
const [, , c] = [1, 2, 3]
console.log(c)  // 3

const [a = 1] = []  // a = 1 (default applied)
const [b = 1] = [undefined]  // b = 1 (undefined triggers default)
const [c = 1] = [null]  // c = null (null does NOT trigger default)
```
::

## Object Destructuring

::code-wrapper{language="javascript"}
```javascript
const user = { name: 'Alice', age: 30, email: 'alice@example.com' }

const { name, age } = user
console.log(name, age)  // 'Alice', 30

// Rename during destructuring
const { name: fullName, age: years } = user
console.log(fullName)  // 'Alice'

// Default values
const { name, role = 'user' } = user
console.log(role)  // 'user'

// Nested destructuring
const { address: { city, zip } } = {
  address: { city: 'NYC', zip: '10001' }
}
console.log(city, zip)  // 'NYC', '10001'

// Rest in objects
const { name, ...rest } = user
console.log(rest)  // { age: 30, email: 'alice@example.com' }
```
::

### Edge case: destructuring with optional chaining

::code-wrapper{language="javascript"}
```javascript
// Destructuring null/undefined throws
const { a } = null  // TypeError: Cannot destructure property 'a' of 'null'

// Safe pattern — provide fallback
const { a } = obj ?? {}  // a = undefined if obj is null

// Or guard with condition
if (obj) {
  const { a } = obj
}
```
::

## Function Parameter Destructuring

::code-wrapper{language="javascript"}
```javascript
// Object parameters — named args pattern
function createUser({ name, age, role = 'user', ...extras }) {
  return { name, age, role, extras }
}

createUser({ name: 'Alice', age: 30 })
// { name: 'Alice', age: 30, role: 'user', extras: {} }

// Array parameters
function process([first, second], { transform = x => x } = {}) {
  return [transform(first), transform(second)]
}

process([1, 2], { transform: x => x * 10 })  // [10, 20]
```
::

### Best practice: default empty object for destructured params

::code-wrapper{language="javascript"}
```javascript
// ⚠️ Without default — calling with no args throws
function bad({ name } = {}) { }
bad()  // OK (default {} applied)

function alsoBad({ name }) { }
alsoBad()  // TypeError: Cannot destructure property 'name' of 'undefined'

// Pattern: always provide = {} for optional object params
function config({ timeout = 5000, retries = 3 } = {}) {
  return { timeout, retries }
}
config()  // { timeout: 5000, retries: 3 }
config({ timeout: 1000 })  // { timeout: 1000, retries: 3 }
```
::

## Spread in Arrays

::code-wrapper{language="javascript"}
```javascript
// Copy
const copy = [...original]

// Concatenate
const merged = [...arr1, ...arr2, ...arr3]

// Insert at position
const inserted = [...arr.slice(0, 2), 'new', ...arr.slice(2)]

// Convert iterables to arrays
const fromString = [...'hello']    // ['h','e','l','l','o']
const fromSet = [...new Set([1,2,2,3])]  // [1, 2, 3]
const fromMap = [...new Map([['a',1]])]  // [['a', 1]]
``
::

## Spread in Objects

::code-wrapper{language="javascript"}
```javascript
// Shallow copy
const copy = { ...original }

// Merge (later overrides earlier)
const merged = { ...defaults, ...user }

// Conditional spread
const config = {
  apiUrl: 'https://api.example.com',
  ...(useAuth && { headers: { Authorization: `Bearer ${token}` } })
}

// Override specific fields
const updated = { ...user, age: 31 }
```
::

### Edge case: spread does deep merge? No — it's shallow

::code-wrapper{language="javascript"}
```javascript
const defaults = { api: { url: 'localhost', port: 3000 } }
const overrides = { api: { port: 8080 } }

const merged = { ...defaults, ...overrides }
// { api: { port: 8080 } } — ⚠️ url is LOST (shallow merge replaces entire nested object)

// Deep merge requires manual handling or a library like lodash.merge
const deepMerge = (a, b) => {
  const result = { ...a }
  for (const key in b) {
    if (isObject(a[key]) && isObject(b[key])) {
      result[key] = deepMerge(a[key], b[key])
    } else {
      result[key] = b[key]
    }
  }
  return result
}
```
::

## Spread in Function Calls

::code-wrapper{language="javascript"}
```javascript
function sum(...nums) { return nums.reduce((a, b) => a + b, 0) }

const nums = [1, 2, 3, 4]
sum(...nums)  // 10 — same as sum(1, 2, 3, 4)

// Math.max with array
Math.max(...[3, 7, 2, 9])  // 9
// Without spread: Math.max.apply(null, [3, 7, 2, 9]) — old way

// Edge case: spreading into new with arrays
new Date(...[2024, 7, 5])
```
::

## Rest Parameters vs `arguments`

::code-wrapper{language="javascript"}
```javascript
// Rest parameters (preferred) — real array, works in arrows
const sum = (...nums) => nums.reduce((a, b) => a + b, 0)

// arguments object (legacy) — not a real array, no arrow functions
function legacySum() {
  const nums = Array.from(arguments)  // convert to array
  return nums.reduce((a, b) => a + b, 0)
}

// arguments is NOT available in arrow functions
const arrow = () => {
  // console.log(arguments)  // ReferenceError
}
```
::

## Practical Patterns

### Extract subsets

::code-wrapper{language="javascript"}
```javascript
// Pick specific fields
const { name, email } = user

// Omit specific fields
const { password, ...safeUser } = user
console.log(safeUser)  // everything except password

// Pick multiple
function pick(obj, keys) {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => keys.includes(k))
  )
}
pick(user, ['name', 'email'])
```
::

### Loop with destructuring

::code-wrapper{language="javascript"}
```javascript
// Object entries
for (const [key, value] of Object.entries(config)) {
  console.log(`${key}: ${value}`)
}

// Array of pairs
const pairs = [['a', 1], ['b', 2], ['c', 3]]
for (const [letter, number] of pairs) {
  console.log(letter, number)
}

// Map iteration
for (const [key, value] of myMap) {
  console.log(key, value)
}
```
::

## Key Takeaways

- Destructuring extracts values from arrays (by position) and objects (by key).
- Use `=` for defaults, `:` for renaming during destructuring.
- Object spread `{ ...obj }` is a **shallow** copy/merge — nested objects share references.
- Always provide `= {}` default for destructured function parameters.
- Use rest `...rest` to collect remaining elements; spread `...arr` to expand them.
- Conditional spread `...(cond && { key: value })` is a clean pattern for optional config.