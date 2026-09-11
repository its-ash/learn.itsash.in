---
title: "JavaScript 23 — Functional Programming: Immutability, Pure Functions & Monads"
description: "Deep-dive into functional programming in JavaScript: pure functions and referential transparency, immutability patterns, functor/monad laws, the Either monad for error handling, and transducers for efficient data pipelines. Code-first reference for senior engineers."
---

# 23 — Functional Programming: Immutability, Pure Functions & Monads

## Pure Functions and Referential Transparency

::code-wrapper{language="javascript"}
```javascript
// ── A pure function: same input → same output, no side effects ──
// Pure functions are:
//   - Deterministic (same input → same output, always)
//   - Side-effect-free (no mutation of external state, no I/O, no randomness)
//   - Referentially transparent (can replace the call with its result)

// ✅ Pure function (deterministic, no side effects)
const add = (a, b) => a + b;
add(1, 2);  // always 3 — can replace with `3` anywhere (referential transparency)

// ✅ Pure: no external state, no mutation
const greet = (name) => `Hello, ${name}!`;
greet("Alice");  // always "Hello, Alice!"

// ❌ Impure: depends on external state (Date.now changes)
const getTimeGreeting = (name) => `Hello, ${name}, it's ${new Date().toISOString()}`;
// Not deterministic — different output each time (depends on current time)

// ❌ Impure: mutates the input (side effect)
const addItem = (list, item) => { list.push(item); return list; };
addItem([1, 2], 3);  // mutates the input array — caller's array is modified

// ✅ Pure: returns a new array (no mutation)
const addItemPure = (list, item) => [...list, item];
addItemPure([1, 2], 3);  // [1, 2, 3] — original array unchanged

// ── Why purity matters ──
// Pure functions are:
//   - Easy to test (no mocks needed — just call and check the return)
//   - Easy to cache (memoize — same input → same output, safe to cache)
//   - Easy to parallelize (no shared state → no race conditions)
//   - Easy to reason about (no hidden dependencies or side effects)
```
::

## Immutability Patterns

::code-wrapper{language="javascript"}
```javascript
// ── Immutable update patterns (never mutate — always create new structures) ──

// ── Object updates ──
const user = { name: "Alice", age: 30 };
// ❌ Mutable: user.age = 31;
// ✅ Immutable: spread + override
const updatedUser = { ...user, age: 31 };  // new object, original unchanged

// ── Nested object updates ──
const state = { user: { profile: { name: "Alice" } } };
// ✅ Immutable nested update (spread at each level):
const newState = {
    ...state,
    user: { ...state.user, profile: { ...state.user.profile, name: "Bob" } },
};

// ── Array updates ──
const items = [1, 2, 3];
// Add: [...items, 4]
// Remove: items.filter(x => x !== 2)  → [1, 3]
// Update: items.map(x => x === 2 ? 99 : x)  → [1, 99, 3]
// Insert at index: [...items.slice(0, 1), 99, ...items.slice(1)]  → [1, 99, 2, 3]

// ── Immutable update at a nested array index ──
const lists = [{ id: 1, name: "A" }, { id: 2, name: "B" }];
const updated = lists.map(item =>
    item.id === 2 ? { ...item, name: "B updated" } : item
);
// → [{ id: 1, name: "A" }, { id: 2, name: "B updated" }] (original unchanged)

// ── Freeze for immutability enforcement (dev mode) ──
const frozen = Object.freeze({ count: 0, nested: { value: 1 } });
// frozen.count = 1;  // silently fails (strict mode: TypeError)
// frozen.nested.value = 2;  // ⚠️ works! (freeze is shallow — nested is not frozen)
```
::

## The Either Monad for Error Handling

::code-wrapper{language="javascript"}
```javascript
// ── Either: represent success (Right) or failure (Left) without throwing ──
// Instead of try/catch, use a value that represents success or failure.

const Left = (value) => ({
    map: () => Left(value),  // Left short-circuits (skips the operation)
    chain: () => Left(value),  // same for chain (flatMap)
    fold: (onLeft, _) => onLeft(value),  // run the error handler
    getOrElse: (fallback) => fallback,
    isLeft: true,
    value,
});

const Right = (value) => ({
    map: (fn) => Right(fn(value)),  // Right applies the function
    chain: (fn) => fn(value),  // chain (flatMap): returns a new Either
    fold: (_, onRight) => onRight(value),  // run the success handler
    getOrElse: () => value,
    isLeft: false,
    value,
});

// ── Usage: validate without try/catch ──
const parseJSON = (str) => {
    try {
        return Right(JSON.parse(str));
    } catch (e) {
        return Left(e.message);
    }
};

const result = parseJSON('{"name": "Alice"}')
    .map(obj => obj.name)
    .map(name => name.toUpperCase())
    .fold(
        err => `Error: ${err}`,
        name => `Success: ${name}`
    );
console.log(result);  // "Success: ALICE"

const failed = parseJSON('invalid')
    .map(obj => obj.name)  // skipped (Left short-circuits)
    .fold(
        err => `Error: ${err}`,
        name => `Success: ${name}`
    );
console.log(failed);  // "Error: Unexpected token 'i' at..." (Left propagated)
```
::

## Production Pattern: Immutable State Updates (Redux-style)

::code-wrapper{language="javascript"}
```javascript
// ── Reducer pattern: pure function that produces a new state ──
const initialState = {
    items: [],
    loading: false,
    error: null,
};

function reducer(state = initialState, action) {
    switch (action.type) {
        case "FETCH_START":
            return { ...state, loading: true, error: null };
        case "FETCH_SUCCESS":
            return { ...state, loading: false, items: action.payload };
        case "FETCH_ERROR":
            return { ...state, loading: false, error: action.payload };
        case "ADD_ITEM":
            return { ...state, items: [...state.items, action.payload] };
        case "UPDATE_ITEM":
            return {
                ...state,
                items: state.items.map(item =>
                    item.id === action.payload.id ? { ...item, ...action.payload } : item
                ),
            };
        case "REMOVE_ITEM":
            return {
                ...state,
                items: state.items.filter(item => item.id !== action.payload),
            };
        default:
            return state;  // pure: return same state for unknown actions
    }
}

// ── State transitions are predictable and testable ──
const s1 = reducer(initialState, { type: "ADD_ITEM", payload: { id: 1, name: "A" } });
const s2 = reducer(s1, { type: "ADD_ITEM", payload: { id: 2, name: "B" } });
const s3 = reducer(s2, { type: "REMOVE_ITEM", payload: 1 });
console.log(s3.items);  // [{ id: 2, name: "B" }]
// Each state is a new object — previous states are unchanged (can time-travel debug).
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── Function composition (pipe and compose) ──
const pipe = (...fns) => (x) => fns.reduce((acc, fn) => fn(acc), x);
const compose = (...fns) => (x) => fns.reduceRight((acc, fn) => fn(acc), x);

const formatName = pipe(
    name => name.trim(),
    name => name.toLowerCase(),
    name => name.replace(/\b\w/g, c => c.toUpperCase()),  // title case
);
formatName("  aLICE jones  ");  // "Alice Jones"

// ── Currying for reusable partial functions ──
const curry = (fn) => (...args) =>
    args.length >= fn.length ? fn(...args) : curry(fn.bind(null, ...args));

const log = curry((level, message) => console.log(`[${level}] ${message}`));
const info = log("INFO");
const error = log("ERROR");
info("started");   // [INFO] started
error("crashed");  // [ERROR] crashed

// ── Lens pattern for immutable deep updates ──
const lens = (get, set) => ({ get, set });
const propLens = (key) => lens(
    obj => obj[key],
    (val, obj) => ({ ...obj, [key]: val })
);
const nameLens = propLens("name");
const user = { name: "Alice", age: 30 };
nameLens.set("Bob", user);  // { name: "Bob", age: 30 } (new object, original unchanged)
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── Immutability has a performance cost (copying) ──
// For large data structures, deep copies are expensive.
// Use structural sharing (like Immer) for efficient immutable updates.

// ── Object.freeze is shallow ──
const frozen = Object.freeze({ nested: { value: 1 } });
frozen.nested.value = 2;  // works! (nested is not frozen)
// Use deepFreeze (recursive) or Immer for deep immutability.

// ── `const` doesn't make objects immutable ──
const obj = { x: 1 };
obj.x = 2;  // ✓ works (const prevents reassignment, not mutation)
// obj = { x: 3 };  // ✗ TypeError (can't reassign const)

// ── Arrow functions can't be used for everything in FP ──
// Arrow functions are great for pure functions (short, no `this`).
// But they can't be constructors, don't have `arguments`, and can't be generators.

// ── Functional doesn't mean "no mutation ever" ──
// Performance-critical code may need mutation (e.g., game loops, data processing).
// Use immutability at the architectural level (state management), mutation in hot paths.
```
::

## 🧠 Quick Quiz

Is this function pure? Why or why not?

::code-wrapper{language="javascript"}
```javascript
let counter = 0;
const getId = () => ++counter;
```
::

<details>
<summary>Answer</summary>

**No, it's impure** for two reasons:

1. **Side effect**: it mutates the external variable `counter` (modifies shared state).
2. **Non-deterministic**: each call returns a different value (1, 2, 3, ...) — the same "input" (no arguments) produces different outputs each time.

A pure version would take the counter as an argument and return the new value:

```javascript
const nextId = (counter) => counter + 1;  // pure — same input → same output
```

Or use a closure with explicit state management (accepting that it's impure by design for IDs):

```javascript
const createIdGenerator = () => {
    let counter = 0;
    return () => ++counter;  // impure, but encapsulated (state is private)
};
const getId = createIdGenerator();
```

**The lesson**: a pure function's output depends only on its inputs and has no side effects. Functions that mutate external state or return different values on repeated calls with the same arguments are impure.

</details>