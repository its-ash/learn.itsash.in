---
title: "JavaScript 10 — Class Internals: Prototypal Inheritance, Private Fields & Mixins"
description: "Deep-dive into JavaScript class mechanics: ES6 class syntax as syntactic sugar over prototypes, the constructor and super chain, private fields (#), static blocks, property descriptors on class members, and mixin composition patterns. Code-first reference for senior engineers."
---

# 10 — Class Internals: Prototypal Inheritance, Private Fields & Mixins

## Classes Are Syntactic Sugar Over Prototypes

::code-wrapper{language="javascript"}
```javascript
// ── ES6 class syntax is syntactic sugar over the existing prototypal system ──
class Animal {
    constructor(name) {
        this.name = name;  // instance properties (set on the instance, not the prototype)
    }

    speak() {               // methods go on Animal.prototype (shared by all instances)
        return `${this.name} makes a sound`;
    }

    static create(name) {   // static methods go on the constructor function itself
        return new Animal(name);
    }
}

// ── What this desugars to (ES5 equivalent) ──
function AnimalES5(name) {
    this.name = name;
}
AnimalES5.prototype.speak = function() {
    return `${this.name} makes a sound`;
};
AnimalES5.create = function(name) {  // static method on the constructor
    return new AnimalES5(name);
};

// Key differences from the ES5 version:
// 1. Class methods are non-enumerable (Object.defineProperty with enumerable: false)
// 2. Classes are always in strict mode (even without "use strict")
// 3. Classes can't be called without `new` (throws TypeError)
// 4. `instanceof` checks the prototype chain (same as ES5)

const dog = new Animal("Rex");
console.log(dog.speak());          // "Rex makes a sound" (from prototype)
console.log(dog instanceof Animal);  // true
console.log(Animal.create("Max").name);  // "Max" (static method)
console.log(Object.getOwnPropertyNames(Animal.prototype));  // ["constructor", "speak"]
```
::

## Inheritance and the `super` Chain

::code-wrapper{language="javascript"}
```javascript
// ── extends: sets up the prototype chain ──
class Dog extends Animal {
    constructor(name, breed) {
        super(name);         // MUST call super() before using `this`
        // `this` doesn't exist until super() is called (TDZ-like behavior)
        this.breed = breed;
    }

    speak() {
        return `${super.speak()} (Woof!)`;  // super.speak() calls the parent's method
        // super references the parent prototype (Animal.prototype)
    }

    fetch() {
        return `${this.name} fetches the ball`;
    }
}

const rex = new Dog("Rex", "Labrador");
console.log(rex.speak());  // "Rex makes a sound (Woof!)" (overridden + super call)
console.log(rex.fetch());  // "Rex fetches the ball" (own method)
console.log(rex instanceof Dog);    // true
console.log(rex instanceof Animal);  // true (prototype chain: Dog → Animal → Object)

// Prototype chain:
// rex.__proto__ → Dog.prototype
// Dog.prototype.__proto__ → Animal.prototype
// Animal.prototype.__proto__ → Object.prototype
// Object.prototype.__proto__ → null

// ── Anti-pattern: using `this` before `super()` ──
class Broken extends Animal {
    constructor(name) {
        this.name = name;  // ✗ ReferenceError: Must call super before accessing `this`
        super(name);
    }
}
```
::

## Private Fields and Methods (`#`)

::code-wrapper{language="javascript"}
```javascript
// ── Private fields: truly private (not accessible outside the class) ──
class BankAccount {
    #balance = 0;           // private field (prefixed with #)
    #transactions = [];     // private field

    constructor(initialBalance) {
        this.#balance = initialBalance;  // private fields need # prefix to access
    }

    deposit(amount) {
        this.#validateAmount(amount);    // call private method
        this.#balance += amount;
        this.#transactions.push({ type: "deposit", amount });
        return this.#balance;
    }

    withdraw(amount) {
        this.#validateAmount(amount);
        if (amount > this.#balance) throw new Error("insufficient funds");
        this.#balance -= amount;
        this.#transactions.push({ type: "withdraw", amount });
        return this.#balance;
    }

    #validateAmount(amount) {   // private method
        if (amount <= 0) throw new Error("amount must be positive");
    }

    get balance() { return this.#balance; }  // public getter for private field
}

const account = new BankAccount(1000);
account.deposit(500);
console.log(account.balance);  // 1500 (via public getter)
// account.#balance;   // ✗ SyntaxError: Private field '#balance' must be declared in an enclosing class
// account.balance;    // undefined (no public `balance` field — only the getter)
// account.#validateAmount(10);  // ✗ can't access private method

// ── Private fields are per-instance (not on the prototype) ──
const a1 = new BankAccount(100);
const a2 = new BankAccount(200);
// a1.#balance and a2.#balance are independent (each instance has its own)

// ── Checking private field existence (try/catch or #in) ──
class Example {
    #field = 42;
    static hasField(obj) {
        return #field in obj;  // ES2022: check if private field exists on an instance
    }
}
console.log(Example.hasField(new Example()));  // true
console.log(Example.hasField({}));            // false
```
::

## Static Blocks and Fields

::code-wrapper{language="javascript"}
```javascript
class AppConfig {
    static instances = 0;        // static field (on the class, not instances)
    static version = "1.0.0";   // static field

    // Static initialization block (ES2022): runs once when the class is defined
    static {
        // Complex initialization that needs multiple statements
        const env = process?.env ?? {};
        this.isProduction = env.NODE_ENV === "production";
        this.apiURL = this.isProduction ? "https://api.prod.com" : "http://localhost:3000";
        this.startTime = Date.now();
    }

    constructor() {
        AppConfig.instances++;  // access static via class name (or `this.constructor`)
    }

    static getInfo() {
        return {
            version: this.version,       // `this` in static methods = the class itself
            instances: this.instances,
            uptime: Date.now() - this.startTime,
        };
    }
}

console.log(AppConfig.version);  // "1.0.0" (access static via class)
console.log(AppConfig.isProduction);  // false (set by static block)
new AppConfig(); new AppConfig();
console.log(AppConfig.instances);  // 2

// ── Static methods are NOT inherited by instances ──
const instance = new AppConfig();
// instance.getInfo();  // ✗ TypeError: instance.getInfo is not a function
// Static methods are on the CLASS, not on instances or the prototype.
// They're accessed via the class name: AppConfig.getInfo()
```
::

## Production Pattern: Mixin Composition

::code-wrapper{language="javascript"}
```javascript
// ── Mixin: add methods to a class without inheritance (composition over inheritance) ──
// A mixin is a function that takes a class and returns an extended class.

// Mixin: adds event emitter capability
const EventEmitterMixin = (Base) =>
    class extends Base {
        #listeners = new Map();

        on(event, handler) {
            if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
            this.#listeners.get(event).add(handler);
            return this;  // for chaining
        }

        emit(event, ...args) {
            const handlers = this.#listeners.get(event);
            if (handlers) for (const handler of handlers) handler(...args);
            return this;
        }

        off(event, handler) {
            this.#listeners.get(event)?.delete(handler);
            return this;
        }
    };

// Mixin: adds logging
const LoggableMixin = (Base) =>
    class extends Base {
        log(level, message) {
            console.log(`[${level.toUpperCase()}] ${new Date().toISOString()} ${message}`);
        }
    };

// Apply multiple mixins to a class (composition):
class User extends LoggableMixin(EventEmitterMixin(Object)) {
    constructor(name) {
        super();
        this.name = name;
    }

    updateProfile(data) {
        Object.assign(this, data);
        this.log("info", `Profile updated for ${this.name}`);
        this.emit("profileUpdated", this);
    }
}

const user = new User("Alice");
user.on("profileUpdated", u => console.log(`Listener: ${u.name} updated`));
user.updateProfile({ email: "alice@example.com" });
// [INFO] 2024-... Profile updated for Alice
// Listener: Alice updated
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── Getters and setters for controlled property access ──
class Temperature {
    #celsius = 0;
    get celsius() { return this.#celsius; }
    set celsius(val) { this.#celsius = Math.max(-273.15, val); }  // clamp to absolute zero
    get fahrenheit() { return this.#celsius * 9/5 + 32; }         // computed property
    set fahrenheit(val) { this.celsius = (val - 32) * 5/9; }
}
const temp = new Temperature();
temp.celsius = 25;
console.log(temp.fahrenheit);  // 77 (computed from celsius)

// ── Class as namespace (static-only class) ──
class MathUtils {
    static square(n) { return n * n; }
    static cube(n) { return n * n * n; }
    static hypotenuse(a, b) { return Math.sqrt(a * a + b * b); }
    // No constructor needed — never instantiated
    // Can't be instantiated if constructor is private:
    // #constructor() {}  // ES2024: private constructor
}
MathUtils.square(5);  // 25 (static-only class as a namespace)

// ── Object equality by value (valueOf) ──
class Money {
    constructor(cents) { this.cents = cents; }
    valueOf() { return this.cents; }  // used by == and arithmetic operators
    [Symbol.toPrimitive](hint) {     // more precise than valueOf
        return hint === "string" ? `$${(this.cents / 100).toFixed(2)}` : this.cents;
    }
}
const price = new Money(1099);
console.log(price + 1);           // 1100 (valueOf → 1099 + 1)
console.log(price == 1099);      // true (valueOf used by ==)
console.log(`${price}`);         // "$10.99" (Symbol.toPrimitive with "string" hint)
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── Classes can't be called without `new` ──
class Foo {}
// Foo();  // TypeError: Class constructor Foo cannot be invoked without 'new'
// (Regular functions can be called without new — returns undefined, sets `this` to global)

// ── `instanceof` breaks across realms (iframes, worker threads) ──
// Each realm has its own copy of Array, Object, etc.
// An array from an iframe is NOT instanceof Array in the parent:
// iframe.contentWindow.Array !== window.Array
// Use Array.isArray() for arrays (works cross-realm).

// ── Prototype pollution via __proto__ ──
const obj = JSON.parse('{"__proto__": {"polluted": true}}');
// ⚠️ In some engines, this can modify Object.prototype (prototype pollution attack)
// Fix: use Object.create(null) or a safe JSON parser that ignores __proto__

// ── Static methods are NOT on the prototype (not inherited by instances) ──
class C { static method() {} }
const inst = new C();
// inst.method();  // TypeError: inst.method is not a function
// C.method();     // ✓ (static is on the class, not instances)

// ── `super` in static methods references the parent CLASS (not parent prototype) ──
class Parent { static greet() { return "parent"; } }
class Child extends Parent {
    static greet() { return super.greet() + " → child"; }
}
console.log(Child.greet());  // "parent → child"

// ── Class fields are per-instance, not on the prototype ──
class Counter { count = 0; increment() { return ++this.count; } }
// `count` is set on each instance (this.count = 0 in constructor)
// `increment` is on the prototype (shared by all instances)
```
::

## 🧠 Quick Quiz

What's the output?

::code-wrapper{language="javascript"}
```javascript
class A {
    constructor() { this.type = "A"; }
    getType() { return this.type; }
}
class B extends A {
    constructor() {
        super();
        this.type = "B";
    }
    getType() { return super.getType() + "/B"; }
}
const b = new B();
console.log(b.getType());
console.log(b instanceof A);
console.log(b.constructor === B);
```
::

<details>
<summary>Answer</summary>

```javascript
"B/B"    // super.getType() calls A.prototype.getType(), which returns this.type = "B" (instance property set by B)
true     // b.__proto__ → B.prototype → B.prototype.__proto__ → A.prototype → b is instanceof A
true     // b.constructor points to B (the constructor that created b)
```

When `b.getType()` is called:
1. `B.prototype.getType()` runs — `super.getType()` calls `A.prototype.getType()`
2. Inside `A.prototype.getType()`, `this` is `b` (the instance), so `this.type` is `"B"` (set by B's constructor)
3. Returns `"B" + "/B"` = `"B/B"`

**The lesson**: `super.getType()` calls the parent's method, but `this` inside that method is still the **instance** (not the parent class). So `this.type` reads the instance's own property (set by B's constructor), not A's.

</details>