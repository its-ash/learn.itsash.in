# 24 — Design Patterns

## Module Pattern

::code-wrapper{language="javascript"}
```javascript
// ES module — the modern module pattern
// math.js
export const add = (a, b) => a + b
export const subtract = (a, b) => a - b
// private: anything not exported is private
```
::
::

## Factory Pattern

::code-wrapper{language="javascript"}
```javascript
function createUser(name, role) {
  return {
    name,
    role,
    greet() { return `Hi, I'm ${this.name}` },
    hasPermission(action) {
      return permissions[this.role]?.includes(action) ?? false
    }
  }
}

const admin = createUser('Alice', 'admin')
const user = createUser('Bob', 'user')
```
::
::

## Observer / Pub-Sub

::code-wrapper{language="javascript"}
```javascript
class EventEmitter {
  #events = new Map()

  on(event, callback) {
    if (!this.#events.has(event)) this.#events.set(event, [])
    this.#events.get(event).push(callback)
  }

  emit(event, data) {
    this.#events.get(event)?.forEach(cb => cb(data))
  }

  off(event, callback) {
    const cbs = this.#events.get(event)
    if (cbs) this.#events.set(event, cbs.filter(cb => cb !== callback))
  }
}

const bus = new EventEmitter()
const handler = (data) => console.log(data)
bus.on('update', handler)
bus.emit('update', { count: 1 })
bus.off('update', handler)
```
::
::

## Singleton

::code-wrapper{language="javascript"}
```javascript
// ES module is already a singleton — imported once, shared
// config.js
export const config = Object.freeze({
  apiUrl: 'https://api.example.com',
  timeout: 5000
})

// Class-based singleton
class Database {
  static #instance = null
  static get instance() {
    if (!Database.#instance) Database.#instance = new Database()
    return Database.#instance
  }
  #connected = false
  connect() { this.#connected = true }
}
```
::
::

## 💡 Tips & Tricks

**Private fields (`#field`) enforce true encapsulation** — Unlike `_field` naming conventions, `#events` in the `EventEmitter` example is genuinely inaccessible from outside the class — `instance.#events` throws a `SyntaxError` outside the class body, not just a lint warning.

**Factory functions sidestep `this`-binding bugs entirely** — Since `createUser` returns a plain object with methods closing over local variables (or using object shorthand), you never have to worry about `new` being forgotten or a method losing its `this` when passed as a callback.

**Module pattern for true private state without classes** — Wrapping variables in a function scope and exporting only what's needed (as in `math.js`) gives you privacy for free — no `#` syntax needed, and it predates ES6 classes entirely.

**Lazy singleton initialization saves startup cost** — The `static get instance()` pattern only constructs `Database` on first access, not at module load — useful when the singleton is expensive to create but not always needed.

**Observer pattern decouples emitters from listeners for testing** — Because `EventEmitter.emit` doesn't know or care who's listening, you can test emitted events in isolation by attaching a throwaway listener and asserting on what it received.

## ⚠️ Edge Cases & Gotchas

**Singletons complicate testing** — A module-level singleton (like the class-based `Database.instance`) persists state across test files unless explicitly reset, causing tests to pass or fail depending on run order — a classic "works alone, fails in the suite" bug.

**Forgetting to `off()` an EventEmitter listener leaks memory** — Each `bus.on('update', handler)` call keeps a reference to `handler` alive inside `#events` forever unless `bus.off('update', handler)` is called — in long-lived apps (SPAs), this silently accumulates listeners and can cause the same event to fire the same stale callback multiple times.

**`off()` requires the exact same function reference, just like DOM events** — `bus.on('update', data => log(data)); bus.off('update', data => log(data))` fails silently — the two arrow functions are different objects, so the filter in `off` never matches and the original listener keeps firing.

**`Object.freeze` on a config object doesn't stop new property additions from being silently ignored** — In non-strict mode, `frozenConfig.newProp = 'x'` doesn't throw, it just does nothing — leading developers to think the assignment worked when it was silently dropped.

**Factory-created objects don't share methods across instances** — Each call to `createUser()` defines a **new** `greet` function on the returned object, unlike class instances which share methods via the prototype. This means factories use more memory per instance if you create thousands of objects — a real trade-off, not just a style choice.

## 🧠 Spot the Bug

What does this log?

::code-wrapper{language="javascript"}
```javascript
class Counter {
  static #instance = null
  #count = 0

  static get instance() {
    if (!Counter.#instance) Counter.#instance = new Counter()
    return Counter.#instance
  }

  increment() { this.#count++; return this.#count }
}

const a = Counter.instance
const b = new Counter()

console.log(a.increment())
console.log(b.increment())
console.log(a === b)
```
::

<details>
<summary>Answer</summary>

Logs `1`, `1`, and `false`. The singleton pattern via `Counter.instance` only guarantees a single instance **if every caller goes through the getter** — nothing stops code from calling `new Counter()` directly, which happily creates a second, independent instance with its own `#count`. `a` and `b` are different objects, so each `increment()` starts from its own zero.

**The lesson**: a "singleton" enforced only by convention isn't enforced at all — if true single-instance guarantees matter, the constructor itself must throw when called a second time, or be made inaccessible (e.g. via a module-private class not exported directly).

</details>

## Key Takeaways

- ES modules are singletons by nature — one instance per import.
- Factory functions are more flexible than `new` — no `this` binding issues.
- EventEmitter pattern is everywhere — DOM, Node.js streams, custom events.
- Freeze config objects to prevent accidental mutation.