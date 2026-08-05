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

## Key Takeaways

- ES modules are singletons by nature — one instance per import.
- Factory functions are more flexible than `new` — no `this` binding issues.
- EventEmitter pattern is everywhere — DOM, Node.js streams, custom events.
- Freeze config objects to prevent accidental mutation.