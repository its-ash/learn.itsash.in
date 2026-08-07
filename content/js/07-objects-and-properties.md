# 07 — Objects & Properties

## Object Creation

::code-wrapper{language="javascript"}
```javascript
// Object literal
const user = {
  name: 'Alice',
  age: 30,
  greet() { return `Hello, I'm ${this.name}` }
}

// Object.create — creates with specific prototype
const proto = { greet() { return 'hello' } }
const obj = Object.create(proto)
obj.greet()  // "hello"

// new Object (avoid — no advantage over literal)
const o = new Object()
o.key = 'value'

// Computed property names
const key = 'dynamic'
const obj2 = { [key]: 'value', [`prefix_${key}`]: 'value2' }
// { dynamic: 'value', prefix_dynamic: 'value2' }
```
::

## Property Access

::code-wrapper{language="javascript"}
```javascript
const user = { name: 'Alice', age: 30 }

// Dot notation
user.name    // "Alice"

// Bracket notation (dynamic keys, special chars)
user['name']            // "Alice"
const key = 'age'
user[key]               // 30
user['with-space']      // works with bracket notation

// Optional chaining
user?.address?.street   // undefined (no error)
user?.greet?.()         // call if exists
```
::

## Property Descriptors

::code-wrapper{language="javascript"}
```javascript
const obj = {}

Object.defineProperty(obj, 'hidden', {
  value: 42,
  writable: false,        // can't reassign
  enumerable: false,      // hidden from Object.keys
  configurable: false     // can't delete or redefine
})

obj.hidden          // 42
obj.hidden = 99     // silently fails (strict mode: TypeError)
Object.keys(obj)    // [] — not enumerable
delete obj.hidden   // fails — not configurable

// Inspect descriptors
Object.getOwnPropertyDescriptor(obj, 'hidden')
// { value: 42, writable: false, enumerable: false, configurable: false }
```
::

### Best practice: control mutability

::code-wrapper{language="javascript"}
```javascript
// Object.freeze — shallow, makes all properties non-writable + non-configurable
const config = Object.freeze({ apiUrl: 'https://api.example.com', timeout: 5000 })
config.timeout = 1000  // fails silently in non-strict, TypeError in strict mode

// Object.seal — can modify existing values but can't add/remove properties
const sealed = Object.seal({ a: 1 })
sealed.a = 2      // OK
sealed.b = 3      // fails
delete sealed.a   // fails

// Object.preventExtensions — can't add new properties, but can modify/delete
const ext = Object.preventExtensions({ a: 1 })
ext.a = 2         // OK
ext.b = 3         // fails
```
::

## Getters and Setters

::code-wrapper{language="javascript"}
```javascript
const user = {
  _name: '',
  _age: 0,

  get name() { return this._name },
  set name(value) {
    if (!value) throw new Error('Name required')
    this._name = value
  },

  get age() { return this._age },
  set age(value) {
    if (value < 0 || value > 150) throw new Error('Invalid age')
    this._age = value
  }
}

user.name = 'Alice'
user.age = 30
user.age = -5  // Error: Invalid age
```
::

## Object Methods

### Keys, Values, Entries

::code-wrapper{language="javascript"}
```javascript
const obj = { a: 1, b: 2, c: 3 }

Object.keys(obj)     // ["a", "b", "c"]
Object.values(obj)   // [1, 2, 3]
Object.entries(obj)  // [["a",1], ["b",2], ["c",3]]

// Iterate
for (const [key, value] of Object.entries(obj)) {
  console.log(key, value)
}

// fromEntries — reverse of entries
Object.fromEntries([['a', 1], ['b', 2]])  // { a: 1, b: 2 }
```
::

### Spread and Merge

::code-wrapper{language="javascript"}
```javascript
const defaults = { timeout: 5000, retries: 3 }
const user = { retries: 5, headers: { 'X-Custom': 'yes' } }

// Shallow merge — later properties override earlier
const config = { ...defaults, ...user }
// { timeout: 5000, retries: 5, headers: { 'X-Custom': 'yes' } }

// ⚠️ Shallow copy — nested objects are shared references
config.headers === user.headers  // true — same object!
config.headers['X-Custom'] = 'no'  // also changes user.headers

// Deep merge (structuredClone for deep copy)
const deepCopy = structuredClone(config)
```
::

### Edge case: spread with null/undefined

::code-wrapper{language="javascript"}
```javascript
const obj = { ...null, ...undefined, a: 1 }
// { a: 1 } — null and undefined are ignored in spread
``
::

## `Object.assign`

::code-wrapper{language="javascript"}
```javascript
const target = { a: 1 }
const source = { b: 2, a: 3 }

Object.assign(target, source)  // target is modified AND returned
// target: { a: 3, b: 2 }

// For immutable merge (don't mutate source)
const merged = Object.assign({}, defaults, overrides)

// Equivalent to spread
const merged2 = { ...defaults, ...overrides }
```
::

## Checking Properties

::code-wrapper{language="javascript"}
```javascript
const obj = { a: 1 }
const proto = { inherited: true }
Object.setPrototypeOf(obj, proto)

// in — checks own + inherited
'a' in obj          // true
'inherited' in obj  // true

// hasOwnProperty — own only
obj.hasOwnProperty('a')          // true
obj.hasOwnProperty('inherited')  // false

// Object.hasOwn (ES2022 — preferred)
Object.hasOwn(obj, 'a')          // true
Object.hasOwn(obj, 'inherited')  // false

// Property exists but value is undefined
const obj2 = { x: undefined }
'x' in obj2   // true (property exists)
obj2.x        // undefined (value is undefined)
```
::

## Shorthand and Computed Properties

::code-wrapper{language="javascript"}
```javascript
const name = 'Alice'
const age = 30

// Shorthand — when key name matches variable name
const user = { name, age }
// { name: 'Alice', age: 30 }

// Method shorthand
const obj = {
  greet() { return 'hello' },       // shorthand
  greet2: function() { return 'hi' } // long form
}

// Computed property names
const eventType = 'click'
const handlers = {
  [`on${eventType}`]: () => console.log('clicked')
}
handlers.onClick()
```
::

## 💡 Tips & Tricks

**Getters for lazy initialization** — Use getters to delay expensive computations: `get data() { return this._data ??= expensiveFetch() }`. Only computed when accessed.

**Symbols for truly private keys** — `const id = Symbol('id')` creates unique keys not enumerable in `Object.keys()`. Useful for hiding metadata from JSON serialization.

**`structuredClone` for deep copies** — Modern alternative to JSON round-trip: `structuredClone(obj)` handles most cases except functions and symbols.

**Property descriptors for constants** — `Object.defineProperty(obj, 'MAX_SIZE', { value: 100, writable: false })` creates immutable constants.

## ⚠️ Edge Cases & Gotchas

**Spread creates shallow copies** — `{...obj}` is not a deep copy. Nested objects are still shared references. Modify `obj.nested.prop` and the copy is affected too.

**Getters can be called accidentally** — `Object.keys(obj)` doesn't call getters, but `JSON.stringify(obj)` does. If a getter has side effects, be careful.

**`in` operator includes inherited** — `'toString' in {}` is `true` (inherited from Object.prototype). Use `Object.hasOwn()` or `hasOwnProperty()` to check only own properties.

**Property descriptors default to false** — When you define a property with `Object.defineProperty()` without specifying flags, `writable`, `enumerable`, and `configurable` all default to `false`. Easy to accidentally create read-only properties.

**Frozen objects can't be unfrozen** — `Object.freeze()` is permanent. You can't call `Object.freeze()` on a frozen object to "unfreeze" it. You have to create a new copy.

## 🧠 Spot the Bug

What does this log?

```javascript
const user = { name: 'Alice' }
const copy = { ...user }
copy.name = 'Bob'

const profile = Object.create(user)
profile.age = 30

console.log(user.name, copy.name, profile.name, Object.keys(profile))
```

<details>
<summary>Answer</summary>

Logs `Alice Bob Alice ['age']`. Here's why:
- `copy` is a shallow copy; changing `copy.name` doesn't affect `user`
- `profile` uses `Object.create(user)`, so it inherits `name` from the prototype
- `Object.keys(profile)` only returns own properties, not inherited ones

**The lesson**: Spread copies the object structure but not prototypes. `Object.create()` sets up inheritance, not copying.

</details>

## Key Takeaways

- Use `Object.freeze` for immutable configs, `Object.seal` for fixed-shape objects.
- Spread `{ ...obj }` creates a **shallow** copy — use `structuredClone` for deep copy.
- `Object.keys/values/entries` only return **own enumerable** properties — not inherited.
- `Object.hasOwn(obj, key)` is the modern replacement for `obj.hasOwnProperty(key)`.
- Property descriptors control writability, enumerability, and configurability.
- Getters/setters enable validation and computed properties.