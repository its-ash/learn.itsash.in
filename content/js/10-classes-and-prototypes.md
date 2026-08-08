# 10 — Classes & Prototypes

## Class Syntax

::code-wrapper{language="javascript"}
```javascript
class Animal {
  constructor(name, sound) {
    this.name = name
    this.sound = sound
  }

  speak() {
    return `${this.name} says ${this.sound}`
  }

  // Static method — on class, not instances
  static create(name) {
    return new Animal(name, '...')
  }
}

const dog = new Animal('Rex', 'Woof')
dog.speak()  // "Rex says Woof"
Animal.create('Cat')  // Animal { name: 'Cat', sound: '...' }
```
::

## Fields and Private Members

::code-wrapper{language="javascript"}
```javascript
class User {
  // Public fields (class fields — ES2022)
  name = 'Anonymous'
  age = 0

  // Private fields — truly private, can't be accessed outside
  #password = ''
  #id = Math.random().toString(36).slice(2)

  constructor(name, password) {
    if (name) this.name = name
    this.#password = password
  }

  // Private methods
  #hash() {
    return btoa(this.#password)
  }

  authenticate(input) {
    return this.#hash() === btoa(input)
  }

  get id() { return this.#id }
}

const user = new User('Alice', 'secret')
user.#password  // SyntaxError — private field
user.password   // undefined — no public property
user.id         // works via getter
```
::

### Edge case: private field checks

::code-wrapper{language="javascript"}
```javascript
class Counter {
  #count = 0

  increment() { this.#count++ }
  get count() { return this.#count }

  // Check if an object has the private field
  static isCounter(obj) {
    try {
      obj.#count  // throws if not a Counter
      return true
    } catch {
      return false
    }
  }
}
```
::

## Getters and Setters

::code-wrapper{language="javascript"}
```javascript
class Temperature {
  #celsius = 0

  get celsius() { return this.#celsius }
  set celsius(value) {
    if (value < -273.15) throw new Error('Below absolute zero')
    this.#celsius = value
  }

  get fahrenheit() { return this.#celsius * 9/5 + 32 }
  set fahrenheit(value) { this.#celsius = (value - 32) * 5/9 }
}

const temp = new Temperature()
temp.celsius = 25
temp.fahrenheit  // 77
```
::

## Inheritance

::code-wrapper{language="javascript"}
```javascript
class Animal {
  constructor(name) { this.name = name }
  speak() { return `${this.name} makes a sound` }
}

class Dog extends Animal {
  constructor(name, breed) {
    super(name)  // MUST call super() before using `this`
    this.breed = breed
  }

  speak() {
    return `${super.speak()} — Woof!`  // call parent method
  }

  fetch() {
    return `${this.name} fetches the ball`
  }
}

const rex = new Dog('Rex', 'Labrador')
rex.speak()   // "Rex makes a sound — Woof!"
rex.fetch()   // "Rex fetches the ball"
rex instanceof Dog     // true
rex instanceof Animal  // true
```
::

### Edge case: super() must be called before `this`

::code-wrapper{language="javascript"}
```javascript
class Child extends Parent {
  constructor() {
    this.x = 1  // ReferenceError — must call super() first
    super()
  }
}

class Child2 extends Parent {
  constructor() {
    super()
    this.x = 1  // OK
  }
}

// If you don't define a constructor, super() is called automatically
class Child3 extends Parent {
  greet() { return 'hi' }
  // no constructor needed — super() implicit
}
```
::

## Static Members

::code-wrapper{language="javascript"}
```javascript
class MathUtils {
  static PI = 3.14159

  static square(x) { return x * x }
  static cube(x) { return x * x * x }
}

MathUtils.PI        // 3.14159
MathUtils.square(5) // 25

// Static initialization block (ES2022)
class Config {
  static #secret = 'hidden'

  static {
    // Runs once when class is defined
    this.#secret = process.env.SECRET || 'default'
  }
}
```
::

## The Prototype Chain

::code-wrapper{language="javascript"}
```javascript
// Every object has a prototype (accessed via __proto__ or Object.getPrototypeOf)
const obj = {}
Object.getPrototypeOf(obj) === Object.prototype  // true

// Functions have a `prototype` property (used when called with `new`)
function Foo() {}
Foo.prototype.greet = function() { return 'hello' }

const f = new Foo()
f.greet()  // "hello" — found on Foo.prototype

// Prototype chain lookup
f.toString()  // found on Object.prototype
```

::

### Visualizing the chain

::code-wrapper{language="javascript"}
```javascript
class A { methodA() {} }
class B extends A { methodB() {} }
class C extends B { methodC() {} }

const c = new C()

// Prototype chain:
// c → C.prototype → B.prototype → A.prototype → Object.prototype → null
c.methodC()  // found on C.prototype
c.methodB()  // found on B.prototype
c.methodA()  // found on A.prototype
c.toString() // found on Object.prototype

c instanceof C  // true
c instanceof B  // true
c instanceof A  // true
c instanceof Object  // true
```

::

## Constructor Functions (pre-class)

::code-wrapper{language="javascript"}
```javascript
// Before ES6 classes — constructor functions + prototype
function Person(name) {
  this.name = name
}

Person.prototype.greet = function() {
  return `Hello, I'm ${this.name}`
}

// ES6 class is syntactic sugar over this pattern
class PersonClass {
  constructor(name) { this.name = name }
  greet() { return `Hello, I'm ${this.name}` }
}

// Both produce the same prototype structure
new Person('Alice').greet()
new PersonClass('Alice').greet()
```

::

## `Object.create` (prototypal inheritance without `new`)

::code-wrapper{language="javascript"}
```javascript
const animal = {
  init(name) { this.name = name; return this },
  speak() { return `${this.name} makes a sound` }
}

const dog = Object.create(animal).init('Rex')
dog.speak()  // "Rex makes a sound"

// Object.create with property descriptors
const obj = Object.create(Object.prototype, {
  name: { value: 'Alice', writable: true, enumerable: true, configurable: true }
})
```

::

## Mixing Classes and Prototypes

::code-wrapper{language="javascript"}
```javascript
// Mixin pattern — add methods to class without inheritance
const Serializable = {
  serialize() {
    return JSON.stringify(this)
  },
  toJSON() {
    const { ...rest } = this
    return rest
  }
}

const Validateable = {
  validate() {
    return Object.entries(this).every(([k, v]) => v != null)
  }
}

class User {
  constructor(name, email) {
    this.name = name
    this.email = email
  }
}

// Apply mixins
Object.assign(User.prototype, Serializable, Validateable)

const user = new User('Alice', 'alice@example.com')
user.serialize()  // '{"name":"Alice","email":"alice@example.com"}'
user.validate()   // true
```

::

## 💡 Tips & Tricks

**Static factory methods** — `static create(name) { return new this(name) }` is cleaner than constructors with many branches. Encapsulates object creation logic.

**Private fields for real encapsulation** — `#field` can't be accessed even with `Object.getOwnPropertyNames()`. Better than `_convention` which is just a promise.

**Getters to avoid `.get()` / `.set()` methods** — `get id() { return this.#id }` is cleaner than `getId()` and reads like a property.

**Mixins with `Object.assign`** — Add shared methods to classes without deep inheritance hierarchies: `Object.assign(MyClass.prototype, SharedMethods)`.

**Check inheritance with `instanceof`** — Don't check with typeof or `constructor` — always use `obj instanceof Class`.

## ⚠️ Edge Cases & Gotchas

**`super()` must be first in constructor** — Can't use `this` before calling `super()` in a subclass. It seems illogical but it's required. Accessing `this` before `super()` throws ReferenceError.

**Private fields create separate namespaces** — `class A { #x = 1 }` and `class B { #x = 2 }` can both have `#x` and they don't conflict. But they can't be accessed cross-class even in same inheritance chain.

**Static methods aren't inherited through `new`** — `MyClass.create()` works, but instance methods don't call statics automatically. You need to reference the class explicitly.

**Prototype pollution risks** — `Object.prototype.admin = true` affects ALL objects. Modern frameworks guard against this, but in old code, modifying prototypes is dangerous.

**`instanceof` is fragile across realms** — Different iframes/windows have different `Object` constructors. `x instanceof Array` fails if `x` comes from another frame. Use `Array.isArray()` instead.

**Class fields are per-instance, not shared** — `class C { x = [] }` creates a new array for EACH instance, not shared. This is actually good (prevents bugs), but different from prototype methods.

## 🧠 Spot the Bug

What does this log?

::code-wrapper{language="javascript"}
```javascript
class Animal {
  constructor(name) {
    this.name = name
  }

  static greet() { return 'Hi' }
  speak() { return `${this.name} says hi` }
}

class Dog extends Animal {
  constructor(name, breed) {
    super(name)
    this.breed = breed
  }
}

const dog = new Dog('Rex', 'Lab')
console.log(dog.speak(), Dog.greet(), dog.greet?.())
```
::

<details>
<summary>Answer</summary>

Logs `Rex says hi Hi undefined`. Here's why:
- `dog.speak()` works — inherited instance method
- `Dog.greet()` works — static method called on class
- `dog.greet?.()` returns `undefined` — instance doesn't inherit static methods

**The lesson**: Static methods are on the class, not instances. You need to call them on the class, not the instance.

</details>

## Key Takeaways

- `class` is syntactic sugar over prototypal inheritance — `extends` sets up prototype chain.
- Private fields `#field` are truly private — can't be accessed outside the class.
- `super()` must be called in subclass constructor before accessing `this`.
- Static members belong to the class, not instances — use for factory methods and constants.
- The prototype chain: `instance → Class.prototype → Parent.prototype → Object.prototype → null`.
- `instanceof` checks the entire prototype chain — `obj instanceof Object` is almost always `true`.