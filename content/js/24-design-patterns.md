---
title: "JavaScript 24 — Design Patterns: Module, Observer, Strategy & State Machine"
description: "Deep-dive into production design patterns in JavaScript: the revealing module pattern, pub-sub with WeakRef cleanup, strategy pattern for interchangeable algorithms, the state machine pattern, and the builder pattern for fluent APIs. Code-first reference for senior engineers."
---

# 24 — Design Patterns: Module, Observer, Strategy & State Machine

## Module Pattern (Revealing Module)

::code-wrapper{language="javascript"}
```javascript
// ── Revealing module pattern: private state via closures, public API via return ──
const UserService = (() => {
    // Private state (closure-captured, not accessible outside)
    const users = new Map();
    let nextId = 1;

    // Private methods
    const validate = (user) => {
        if (!user.name || typeof user.name !== "string") {
            throw new Error("invalid name");
        }
    };

    const generateId = () => nextId++;

    // Public API (revealed via the return object)
    const create = (userData) => {
        validate(userData);
        const id = generateId();
        const user = { id, ...userData, createdAt: Date.now() };
        users.set(id, user);
        return user;
    };

    const getById = (id) => users.get(id);
    const getAll = () => [...users.values()];
    const remove = (id) => users.delete(id);

    return { create, getById, getAll, remove };  // reveal only the public API
})();

// Usage:
UserService.create({ name: "Alice" });
UserService.create({ name: "Bob" });
console.log(UserService.getAll());  // [{ id: 1, name: "Alice", ... }, { id: 2, ... }]
// UserService.validate({});  // ✗ TypeError: not a function (private — not revealed)
```
::

## Observer / Pub-Sub Pattern

::code-wrapper{language="javascript"}
```javascript
// ── Observer pattern: subjects notify subscribers on state change ──
class EventEmitter {
    #handlers = new Map();

    on(event, handler) {
        if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
        this.#handlers.get(event).add(handler);
        return () => this.off(event, handler);  // return unsubscribe function
    }

    once(event, handler) {
        const unsubscribe = this.on(event, (...args) => {
            unsubscribe();  // auto-remove after first call
            handler(...args);
        });
        return unsubscribe;
    }

    off(event, handler) {
        this.#handlers.get(event)?.delete(handler);
    }

    emit(event, ...args) {
        const handlers = this.#handlers.get(event);
        if (handlers) for (const handler of handlers) handler(...args);
    }

    clear() {
        this.#handlers.clear();
    }
}

// ── Usage ──
const emitter = new EventEmitter();
const unsubscribe = emitter.on("data", (data) => console.log("received:", data));
emitter.emit("data", { id: 1 });  // "received: { id: 1 }"
unsubscribe();  // remove the listener
emitter.emit("data", { id: 2 });  // no output (listener removed)

// ── WeakRef for auto-cleanup (subscriber can be GC'd without unsubscribing) ──
class WeakEventEmitter {
    #handlers = new Map();

    on(event, handler, target = {}) {
        if (!this.#handlers.has(event)) this.#handlers.set(event, new Map());
        const weakTarget = new WeakRef(target);
        this.#handlers.get(event).set(handler, { weakTarget, handler });
    }

    emit(event, ...args) {
        const handlers = this.#handlers.get(event);
        if (!handlers) return;
        for (const [handler, { weakTarget }] of handlers) {
            if (weakTarget.deref()) {  // only call if the target still exists
                handler(...args);
            } else {
                handlers.delete(handler);  // auto-cleanup: target was GC'd
            }
        }
    }
}
```
::

## Strategy Pattern

::code-wrapper{language="javascript"}
```javascript
// ── Strategy: interchangeable algorithms behind a common interface ──
class Sorter {
    constructor(strategy) {
        this.strategy = strategy;
    }

    setStrategy(strategy) {
        this.strategy = strategy;
    }

    sort(data) {
        return this.strategy(data);
    }
}

// Concrete strategies (interchangeable algorithms)
const strategies = {
    ascending: (data) => [...data].sort((a, b) => a - b),
    descending: (data) => [...data].sort((a, b) => b - a),
    shuffle: (data) => [...data].sort(() => Math.random() - 0.5),
    alphabetical: (data) => [...data].sort((a, b) => String(a).localeCompare(String(b))),
};

// Usage:
const sorter = new Sorter(strategies.ascending);
console.log(sorter.sort([3, 1, 2]));  // [1, 2, 3]
sorter.setStrategy(strategies.descending);
console.log(sorter.sort([3, 1, 2]));  // [3, 2, 1]
sorter.setStrategy(strategies.shuffle);
console.log(sorter.sort([1, 2, 3, 4, 5]));  // shuffled

// ── Strategy for payment processing ──
const paymentStrategies = {
    creditCard: (amount, cardInfo) => {
        // process credit card payment
        return { status: "paid", method: "creditCard", amount };
    },
    paypal: (amount, paypalInfo) => {
        return { status: "paid", method: "paypal", amount };
    },
    crypto: (amount, walletInfo) => {
        return { status: "paid", method: "crypto", amount };
    },
};

function processPayment(method, amount, info) {
    const strategy = paymentStrategies[method];
    if (!strategy) throw new Error(`unknown payment method: ${method}`);
    return strategy(amount, info);
}
```
::

## State Machine Pattern

::code-wrapper{language="javascript"}
```javascript
// ── Finite state machine: explicit states, transitions, and side effects ──
class StateMachine {
    #state;
    #states;
    #emitter = new EventEmitter();

    constructor(initialState, states) {
        this.#state = initialState;
        this.#states = states;
    }

    get state() { return this.#state; }

    transition(action) {
        const currentState = this.#states[this.#state];
        const nextState = currentState?.transitions?.[action];
        if (!nextState) {
            throw new Error(`invalid transition: ${this.#state} → ${action}`);
        }
        // Run exit action for current state
        currentState.onExit?.(this);
        // Transition
        this.#state = nextState;
        // Run entry action for new state
        this.#states[nextState].onEntry?.(this);
        // Notify listeners
        this.#emitter.emit("transition", { from: currentState, action, to: nextState });
    }

    on(event, handler) { return this.#emitter.on(event, handler); }
    can(action) { return Boolean(this.#states[this.#state]?.transitions?.[action]); }
}

// ── Traffic light state machine ──
const trafficLight = new StateMachine("red", {
    red:    { transitions: { go: "green" }, onEntry: (m) => console.log("STOP") },
    green:  { transitions: { warn: "yellow" }, onEntry: (m) => console.log("GO") },
    yellow: { transitions: { stop: "red" }, onEntry: (m) => console.log("SLOW DOWN") },
});

trafficLight.on("transition", ({ to }) => console.log(`→ ${to}`));
trafficLight.transition("go");    // → green, "GO"
trafficLight.transition("warn");  // → yellow, "SLOW DOWN"
trafficLight.transition("stop");  // → red, "STOP"
// trafficLight.transition("go"); from yellow → Error: invalid transition

// ── HTTP request state machine ──
const requestStates = {
    idle: { transitions: { send: "pending" } },
    pending: { transitions: { resolve: "success", reject: "error" } },
    success: { transitions: { reset: "idle" } },
    error: { transitions: { retry: "pending", reset: "idle" } },
};
```
::

## Builder Pattern for Fluent APIs

::code-wrapper{language="javascript"}
```javascript
// ── Builder: construct complex objects step-by-step with method chaining ──
class QueryBuilder {
    #table = "";
    #columns = [];
    #conditions = [];
    #orderBy = "";
    #limit = null;

    select(...columns) { this.#columns = columns; return this; }
    from(table) { this.#table = table; return this; }
    where(condition) { this.#conditions.push(condition); return this; }
    orderBy(column) { this.#orderBy = column; return this; }
    limit(n) { this.#limit = n; return this; }

    build() {
        let sql = `SELECT ${this.#columns.join(", ") || "*"} FROM ${this.#table}`;
        if (this.#conditions.length) sql += ` WHERE ${this.#conditions.join(" AND ")}`;
        if (this.#orderBy) sql += ` ORDER BY ${this.#orderBy}`;
        if (this.#limit !== null) sql += ` LIMIT ${this.#limit}`;
        return sql;
    }
}

// Fluent API (method chaining — each method returns `this`)
const query = new QueryBuilder()
    .select("name", "email")
    .from("users")
    .where("age > 18")
    .where("active = true")
    .orderBy("name")
    .limit(10)
    .build();
console.log(query);  // "SELECT name, email FROM users WHERE age > 18 AND active = true ORDER BY name LIMIT 10"
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── Factory pattern for object creation ──
function createButton({ text = "Click", onClick = () => {}, disabled = false } = {}) {
    const button = document.createElement("button");
    button.textContent = text;
    button.disabled = disabled;
    button.addEventListener("click", onClick);
    return button;
}

// ── Singleton via module (ESM is a singleton by default) ──
// config.js:
// const config = { apiUrl: "..." };
// export default config;  // ESM modules are singletons (same instance everywhere)

// ── Singleton with lazy initialization ──
let _instance = null;
class Database {
    constructor() {
        if (_instance) return _instance;  // return existing instance
        _instance = this;
        this.connection = connect();
    }
}

// ── Decorator pattern (function decorators) ──
function withLogging(fn) {
    return function(...args) {
        console.log(`calling ${fn.name} with`, args);
        const result = fn.apply(this, args);
        console.log(`result:`, result);
        return result;
    };
}
const add = withLogging((a, b) => a + b);
add(1, 2);  // logs "calling with [1, 2]", "result: 3"
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── Event listeners and memory leaks ──
// Always provide a way to unsubscribe (return a cleanup function or use AbortController).
// If the subscriber is GC'd but the publisher holds a strong reference, the listener leaks.

// ── `this` in strategy methods ──
// When passing a method as a strategy, `this` is lost (detached).
// Fix: use .bind(this) or arrow functions: strategy = strategy.bind(this)

// ── State machine: invalid transitions should throw (not silently ignore) ──
// Silent ignoring makes debugging harder. Explicit errors catch bugs early.

// ── Singleton is an anti-pattern for testing ──
// Singletons make testing harder (global state, hard to reset between tests).
// Use dependency injection instead for testable code.

// ── Builder must return `this` for chaining ──
// Forgetting `return this` breaks the chain — each method returns undefined.
```
::

## 🧠 Quick Quiz

What pattern is this, and what's the issue?

::code-wrapper{language="javascript"}
```javascript
const emitter = new EventEmitter();
emitter.on("update", function() { this.render(); });
```
::

<details>
<summary>Answer</summary>

This is the **Observer pattern** (event emitter), but there's a `this` binding issue.

When the emitter calls the handler, `this` inside the regular function is determined by the **call site** — which is the emitter (not the component that registered the handler). So `this.render()` would fail because `this` is the emitter, not the component.

**Fix**: use an arrow function (lexical `this`) or `bind`:

```javascript
emitter.on("update", () => this.render());  // arrow: `this` is the enclosing scope
// or:
emitter.on("update", this.render.bind(this));  // bind: `this` is the component
```

**The lesson**: event handler callbacks lose their `this` binding (the emitter's call site determines `this`, not the registration site). Use arrow functions or `.bind(this)` to preserve the correct `this`.

</details>