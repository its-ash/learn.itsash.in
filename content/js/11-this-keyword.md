# 11 — The `this` Keyword

## Four Binding Rules

### 1. Default Binding (standalone)

::code-wrapper{language="javascript"}
```javascript
function showThis() {
  console.log(this)
}

showThis()  // window (browser) / global (Node) — non-strict; undefined in strict mode
```
::

### 2. Implicit Binding (method call)

::code-wrapper{language="javascript"}
```javascript
const obj = {
  name: 'Alice',
  greet() {
    console.log(this.name)  // `this` is obj — the caller
  }
}

obj.greet()  // "Alice"

// ⚠️ Losing `this` when extracting method
const greet = obj.greet
greet()  // undefined or window.name — `this` is lost!

// ⚠️ Callback losing `this`
setTimeout(obj.greet, 0)  // undefined — `this` is window
setTimeout(() => obj.greet(), 0)  // "Alice" — preserved via arrow wrapper
```
::

### 3. Explicit Binding (`call`, `apply`, `bind`)

::code-wrapper{language="javascript"}
```javascript
function greet(greeting, punctuation) {
  return `${greeting}, ${this.name}${punctuation}`
}

const user = { name: 'Alice' }

// call — args passed individually
greet.call(user, 'Hello', '!')   // "Hello, Alice!"

// apply — args passed as array
greet.apply(user, ['Hi', '.'])   // "Hi, Alice."

// bind — returns new function with `this` permanently bound
const boundGreet = greet.bind(user, 'Hey')
boundGreet('?')  // "Hey, Alice?"
```

::

### 4. `new` Binding

::code-wrapper{language="javascript"}
```javascript
function User(name) {
  this.name = name  // `this` is the newly created object
}

const alice = new User('Alice')
alice.name  // "Alice"
```

::

## Arrow Functions: Lexical `this`

::code-wrapper{language="javascript"}
```javascript
// Arrow functions do NOT have their own `this` — they inherit from enclosing scope
const obj = {
  name: 'Alice',
  greet: () => {
    console.log(this.name)  // undefined — `this` is outer (window/global)
  },
  greetRegular() {
    console.log(this.name)  // "Alice" — `this` is obj
  }
}

// Best use case: callbacks inside methods
const timer = {
  count: 0,
  start() {
    // Arrow preserves `this` = timer
    setInterval(() => {
      this.count++
      console.log(this.count)
    }, 1000)
  }
}

// BAD: arrow as object method
const bad = {
  value: 42,
  get: () => this.value  // undefined — `this` is NOT bad
}
```

::

## Binding Precedence

::code-wrapper{language="javascript"}
```javascript
// Precedence: new > bind > call/apply > implicit > default

const obj1 = { name: 'Obj1' }
const obj2 = { name: 'Obj2' }

function Foo(name) {
  this.name = name
}

// bind creates a new function that ignores later call/apply targets
const BoundFoo = Foo.bind(obj1)
BoundFoo('Alice')
console.log(obj1.name)  // "Alice"

// But new overrides bind!
const instance = new BoundFoo('Bob')
console.log(instance.name)  // "Bob" (new binding wins over bind)
console.log(obj1.name)      // "Alice" (bind was ignored)
```

::

## Key Takeaways

- `this` is determined by **how the function is called**, not where it's defined.
- Four rules: default, implicit (method), explicit (`call`/`apply`/`bind`), `new`.
- Arrow functions inherit `this` lexically — use for callbacks, NOT object methods.
- `bind` permanently fixes `this` — `call`/`apply` are one-time.
- Binding precedence: `new` > `bind` > `call`/`apply` > implicit > default.