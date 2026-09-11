---
title: "JavaScript 07 — Object Internals: Property Descriptors, Prototypes & Immutability"
description: "Deep-dive into JavaScript object mechanics: property descriptors (writable/enumerable/configurable), the prototype chain, Object.create vs __proto__, freeze/seal/preventExtensions, and hidden class transitions. Code-first reference for senior engineers."
---

# 07 — Object Internals: Property Descriptors, Prototypes & Immutability

## Property Descriptors: The Full Control Surface

::code-wrapper{language="javascript"}
```javascript
// ── Every property has a descriptor with 6 attributes ──
// Data descriptor: { value, writable, enumerable, configurable }
// Accessor descriptor: { get, set, enumerable, configurable }

// ── Default descriptor values (when creating via =) ──
const obj = {};
obj.x = 1;
console.log(Object.getOwnPropertyDescriptor(obj, "x"));
// { value: 1, writable: true, enumerable: true, configurable: true }
// ┚ All default to true when assigned via `=` or object literal.

// ── Object.defineProperty: explicit descriptor (defaults are FALSE) ──
Object.defineProperty(obj, "y", {
    value: 2,
    // writable: false,    ← defaults to false (immutable)
    // enumerable: false,  ← defaults to false (hidden from for...in)
    // configurable: false ← defaults to false (can't delete or redefine)
});
console.log(Object.getOwnPropertyDescriptor(obj, "y"));
// { value: 2, writable: false, enumerable: false, configurable: false }
// ⚠️ The default for defineProperty is FALSE (opposite of `=` assignment!)

// ── writable: false prevents reassignment (silently in sloppy, throws in strict) ──
"use strict";
const obj2 = {};
Object.defineProperty(obj2, "x", { value: 1, writable: false });
// obj2.x = 2;  // TypeError: Cannot assign to read only property 'x'
// In sloppy mode: fails silently (no error, value unchanged)

// ── enumerable: false hides from for...in and Object.keys ──
const obj3 = { a: 1 };
Object.defineProperty(obj3, "b", { value: 2, enumerable: false });
for (const key in obj3) console.log(key);  // "a" only (b is hidden)
console.log(Object.keys(obj3));  // ["a"] (b not enumerable)
console.log(Object.getOwnPropertyNames(obj3));  // ["a", "b"] (includes non-enumerable)
console.log(Reflect.ownKeys(obj3));  // ["a", "b"] (includes symbols + non-enumerable)

// ── configurable: false prevents deletion and descriptor changes ──
const obj4 = {};
Object.defineProperty(obj4, "x", { value: 1, configurable: false });
// delete obj4.x;  // TypeError: Cannot delete property (in strict mode)
// Object.defineProperty(obj4, "x", { value: 2 });  // TypeError (can't redefine)
// EXCEPTION: writable can be changed from true → false (but not back) even if configurable: false

// ── Accessor properties (getters/setters) ──
const obj5 = {};
let _private = 0;
Object.defineProperty(obj5, "value", {
    get() { return _private; },
    set(v) { if (v < 0) throw new Error("negative"); _private = v; },
    enumerable: true,
    configurable: true,
});
obj5.value = 10;
console.log(obj5.value);  // 10
// obj5.value = -1;  // throws (setter validates)
```
::

## Anti-Pattern: Shallow Freeze Doesn't Prevent Nested Mutation

::code-wrapper{language="javascript"}
```javascript
// ❌ NAIVE — Object.freeze is shallow (only freezes the top level)
const config = Object.freeze({
    server: { host: "localhost", port: 3000 },
});
config.server.port = 9999;  // ✓ works! (server is NOT frozen — only the top object is)
console.log(config.server.port);  // 9999 — mutated despite the freeze
// Object.freeze prevents reassignment of top-level properties and top-level mutation,
// but nested objects are still mutable.

// ✅ CORRECT — deep freeze (recursively freeze all nested objects)
function deepFreeze(obj) {
    // Get all property names (including non-enumerable)
    const propNames = Object.getOwnPropertyNames(obj);
    // Freeze each nested object first (depth-first)
    for (const name of propNames) {
        const value = obj[name];
        if (value && typeof value === "object") {
            deepFreeze(value);  // recurse
        }
    }
    return Object.freeze(obj);  // freeze the top level last
}

const config2 = deepFreeze({
    server: { host: "localhost", port: 3000 },
});
// config2.server.port = 9999;  // TypeError: Cannot assign (frozen at all levels)
```
::

## The Prototype Chain

::code-wrapper{language="javascript"}
```javascript
// ── Every object has an internal [[Prototype]] link (accessible via __proto__ or Object.getPrototypeOf) ──
// Property lookup follows the prototype chain until found or null is reached.

const animal = { breathe() { return "breathing"; } };
const dog = Object.create(animal);  // dog.__proto__ = animal
dog.bark = function() { return "woof"; };

console.log(dog.bark());    // "woof" (own property)
console.log(dog.breathe());  // "breathing" (inherited from animal via prototype chain)
// Lookup: dog.breathe → dog (not found) → animal (found!) → return

// ── Object.create: explicit prototype ──
const obj = Object.create({ inherited: "yes" });
console.log(obj.inherited);  // "yes" (from prototype)
console.log(Object.hasOwn(obj, "inherited"));  // false (inherited, not own)
console.log("inherited" in obj);  // true (in includes prototype chain)

// ── __proto__ vs Object.getPrototypeOf ──
const proto = { x: 1 };
const child = Object.create(proto);
console.log(child.__proto__ === proto);  // true (__proto__ is the getter)
console.log(Object.getPrototypeOf(child) === proto);  // true (preferred API)
// ⚠️ __proto__ is deprecated (use Object.getPrototypeOf / Object.setPrototypeOf)
// ⚠️ __proto__ on object literals: { __proto__: proto } sets the prototype (ES2015+)

// ── Object.create(null): no prototype (pure dictionary) ──
const dict = Object.create(null);  // [[Prototype]] is null
// dict.hasOwnProperty → undefined (no Object.prototype methods!)
// Useful for hash maps without prototype pollution:
dict.key = "value";
// dict.constructor;  // undefined (no Object.prototype)
// dict.toString();  // TypeError: dict.toString is not a function
```
::

## Production Pattern: Immutable Configuration with Proxies

::code-wrapper{language="javascript"}
```javascript
// ── Deep immutability via Proxy (prevents any mutation, including nested) ──
function immutable(target) {
    return new Proxy(target, {
        get(obj, prop, receiver) {
            // Return proxied nested objects (so they're also immutable)
            const value = Reflect.get(obj, prop, receiver);
            if (value && typeof value === "object") {
                return immutable(value);  // wrap nested objects
            }
            return value;
        },
        set() {
            throw new TypeError("Cannot modify immutable object");
        },
        deleteProperty() {
            throw new TypeError("Cannot delete from immutable object");
        },
        defineProperty() {
            throw new TypeError("Cannot define property on immutable object");
        },
    });
}

const config = immutable({
    server: { host: "localhost", port: 3000 },
    features: ["auth", "logging"],
});

// config.server.port = 9999;  // TypeError: Cannot modify immutable object
// config.features.push("x");  // TypeError (push tries to set index — blocked by proxy)
console.log(config.server.port);  // 3000 (read works, write blocked)
```
::

## Object Cloning: Shallow vs Deep

::code-wrapper{language="javascript"}
```javascript
// ── Shallow copy: copies top-level properties, shares nested references ──
const original = { a: 1, nested: { b: 2 } };

// Method 1: spread (shallow)
const shallow1 = { ...original };
shallow1.a = 99;           // doesn't affect original (top-level copy)
shallow1.nested.b = 99;   // DOES affect original (shared reference!)
console.log(original.nested.b);  // 99 — shared mutation!

// Method 2: Object.assign (shallow)
const shallow2 = Object.assign({}, original);
// Same issue: nested objects are shared.

// ── Deep copy: recursively copies all nested objects ──
// Method 1: structuredClone (modern, handles most types, NOT functions)
const deep1 = structuredClone(original);
deep1.nested.b = 99;
console.log(original.nested.b);  // 2 — unaffected (true deep copy)

// Method 2: JSON.parse(JSON.stringify()) (legacy — loses functions, dates, Maps, etc.)
const deep2 = JSON.parse(JSON.stringify(original));
// ⚠️ Lossy: undefined → omitted, Date → string, Map/Set → {}, NaN → null, functions → omitted

// Method 3: manual recursive clone (full control)
function deepClone(obj, cache = new WeakMap()) {
    if (obj === null || typeof obj !== "object") return obj;  // primitives
    if (obj instanceof Date) return new Date(obj);
    if (obj instanceof RegExp) return new RegExp(obj);
    if (obj instanceof Map) return new Map([...obj].map(([k, v]) => [deepClone(k), deepClone(v)]));
    if (obj instanceof Set) return new Set([...obj].map(deepClone));
    if (cache.has(obj)) return cache.get(obj);  // circular reference guard

    const clone = Array.isArray(obj) ? [] : Object.create(Object.getPrototypeOf(obj));
    cache.set(obj, clone);  // store before recursing (handle circular refs)
    for (const key of Reflect.ownKeys(obj)) {
        clone[key] = deepClone(obj[key], cache);
    }
    return clone;
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── Object.keys / values / entries (own enumerable string-keyed only) ──
const obj = { a: 1, b: 2, [Symbol("c")]: 3 };
Object.keys(obj);     // ["a", "b"] (string keys only, own, enumerable)
Object.values(obj);   // [1, 2]
Object.entries(obj);  // [["a", 1], ["b", 2]]
// Symbols and non-enumerable properties are excluded.
// Use Reflect.ownKeys(obj) for ALL keys (strings + symbols, enumerable + non-enumerable).

// ── Computed property names (ES2015) ──
const key = "dynamic";
const obj2 = { [key]: 1, [`${key}Prop`]: 2 };
// { dynamic: 1, dynamicProp: 2 }

// ── Object shorthand (ES2015) ──
const x = 1, y = 2;
const obj3 = { x, y };  // { x: 1, y: 2 } (shorthand: key = variable name)

// ── Method shorthand ──
const obj4 = {
    method() { return "hello"; },  // shorthand: no `function` keyword
    // equivalent to: method: function() { ... }
};

// ── Optional chaining for safe property access ──
const value = obj?.nested?.deep?.value ?? "default";

// ── Object.groupBy (ES2024) ──
const items = [
    { category: "fruit", name: "apple" },
    { category: "fruit", name: "banana" },
    { category: "veg", name: "carrot" },
];
const grouped = Object.groupBy(items, item => item.category);
// { fruit: [{...}, {...}], veg: [{...}] }
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── Object.defineProperty defaults to false (not true) ──
// Assigning via `=` → all descriptors default to true.
// Defining via defineProperty → all descriptors default to FALSE.
Object.defineProperty({}, "x", { value: 1 });
// writable: false, enumerable: false, configurable: false (all default to false!)

// ── `in` operator includes the prototype chain ──
const obj = Object.create({ inherited: true });
console.log("inherited" in obj);  // true (checks prototype chain!)
console.log(Object.hasOwn(obj, "inherited"));  // false (own only)
// Use Object.hasOwn (or the deprecated obj.hasOwnProperty) to check own properties only.

// ── `Object.freeze` is shallow ──
const frozen = Object.freeze({ nested: { x: 1 } });
frozen.nested.x = 2;  // works! (nested is not frozen)

// ── `JSON.stringify` skips non-enumerable and function-valued properties ──
const obj = { a: 1, fn() {} };
Object.defineProperty(obj, "hidden", { value: 2, enumerable: false });
JSON.stringify(obj);  // '{"a":1}' — fn and hidden are excluded

// ── Getters are called by JSON.stringify (side effects) ──
const obj = {
    _count: 0,
    get count() { return ++this._count; },  // each access increments!
};
JSON.stringify(obj);  // calls count getter → _count becomes 1
JSON.stringify(obj);  // calls again → _count becomes 2
// Don't put side effects in getters!

// ── `Object.keys` order: integer-like keys first (sorted), then insertion order ──
const obj = { b: 1, 2: 2, a: 3, 1: 4 };
Object.keys(obj);  // ["1", "2", "b", "a"] — integer keys sorted first, then strings in insertion order
// (ES2020 guarantees this order for for...in, Object.keys, Object.values, Object.entries)
```
::

## 🧠 Quick Quiz

What's the prototype chain of `obj`, and what does `obj.toString()` return?

::code-wrapper{language="javascript"}
```javascript
const obj = Object.create(null);
obj.x = 1;
console.log(obj.toString());
```
::

<details>
<summary>Answer</summary>

`TypeError: obj.toString is not a function`

`Object.create(null)` creates an object with **no prototype** — its `[[Prototype]]` is `null`. This means it doesn't inherit from `Object.prototype`, so it has no `toString()`, `hasOwnProperty()`, `constructor`, or any other built-in methods.

Normal objects (`{}` or `new Object()`) have `Object.prototype` as their prototype, which provides `toString()`. But `Object.create(null)` bypasses this entirely.

**Use case**: `Object.create(null)` is useful for creating pure hash maps/dictionaries where you don't want any inherited properties (no risk of prototype pollution, no `constructor` key, no `toString` interfering with lookups).

**The lesson**: `Object.create(null)` creates objects with no prototype chain — they have zero inherited methods. If you need `toString`, `hasOwnProperty`, etc., either use `{}` or add the methods manually.

</details>