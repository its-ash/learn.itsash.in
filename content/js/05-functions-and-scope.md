---
title: "JavaScript 05 — Function Internals: Hoisting, Arrow Lexical `this` & Arguments Object"
description: "Deep-dive into JavaScript function mechanics: declaration vs expression hoisting, arrow function `this`/`arguments` binding, the arguments object vs rest params, default parameter TDZ, and IIFE module patterns. Code-first reference for senior engineers."
---

# 05 — Function Internals: Hoisting, Arrow Lexical `this` & Arguments Object

## Function Declarations vs Expressions: Hoisting Internals

::code-wrapper{language="javascript"}
```javascript
// ── Function declaration: fully hoisted (declaration + body) ──
// Available throughout the entire scope, even before the declaration line.
console.log(typeof greet);  // "function" — already defined
greet();                     // "hello" — can call before declaration

function greet() { console.log("hello"); }  // declaration: hoisted entirely

// ── Function expression: NOT hoisted (only the variable, in TDZ or undefined) ──
console.log(typeof greet2);  // "undefined" (var) or ReferenceError (let/const TDZ)
// greet2();  // TypeError: greet2 is not a function (var) or ReferenceError (let/const)

var greet2 = function() { console.log("hello"); };  // expression: only the var is hoisted
// const greet2 = () => console.log("hello");  // let/const: TDZ until this line

// ── Why declarations are hoisted but expressions aren't ──
// Function declarations are processed in the "creation phase" of the execution context:
//   1. Variable Environment: var declarations → initialized to undefined
//   2. Function declarations: fully created and assigned (name → function object)
//   3. let/const: created but in TDZ (uninitialized)
// Function expressions: the function object is created at runtime when the line executes,
// and assigned to the variable (which was hoisted as undefined or TDZ).

// ── Named function expression (the name is only visible inside the function) ──
const factorial = function fib(n) {
    // `fib` is only visible inside this function (for recursion)
    // `factorial` is visible outside (the variable it's assigned to)
    return n <= 1 ? n : fib(n - 1) + fib(n - 2);  // recursion via the internal name
};
// console.log(typeof fib);  // ReferenceError: fib is not defined (only inside)
factorial(10);  // works — uses `factorial` from outside or `fib` from inside

// ── Anti-pattern: conditional function declaration (not reliable) ──
// ❌ Function declarations inside if-blocks are hoisted in non-strict mode (inconsistent)
if (true) {
    function f() { return "yes"; }
}
// f();  // Works in some engines, not others — undefined behavior
// ✅ Use function expressions for conditional assignment:
let f2;
if (true) {
    f2 = function() { return "yes"; };
}
```
::

## Arrow Functions: Lexical `this` and No `arguments`

::code-wrapper{language="javascript"}
```javascript
// ── Arrow function syntax variants ──
const fn1 = (x) => x * 2;           // single param: parens optional
const fn2 = x => x * 2;             // no parens needed for single param
const fn3 = (a, b) => a + b;        // multiple params: parens required
const fn4 = () => 42;               // no params: empty parens required
const fn5 = (a, b) => {             // block body: needs return
    const sum = a + b;
    return sum;
};
const fn6 = (a, b) => ({ x: a, y: b });  // returning object literal: wrap in parens

// ── Arrow functions have LEXICAL `this` (inherited from enclosing scope) ──
// Regular functions: `this` is determined by HOW the function is called
// Arrow functions: `this` is determined by WHERE the function is defined (lexical)

function Counter() {
    this.count = 0;

    // ── Regular function: `this` is lost when used as a callback ──
    setInterval(function() {
        this.count++;           // ✗ `this` is NOT the Counter instance here
        // In a regular function called by setInterval, `this` is the global object
        // (or undefined in strict mode) — NOT the Counter instance
    }, 1000);

    // ── Arrow function: `this` is lexically inherited from Counter ──
    setInterval(() => {
        this.count++;           // ✓ `this` IS the Counter instance (lexical)
    }, 1000);
}

// ── Arrow functions have NO `arguments` object ──
function regular() {
    console.log(arguments);  // [Arguments] { '0': 1, '1': 2 } — array-like
}
regular(1, 2);

const arrow = () => {
    // console.log(arguments);  // ReferenceError: arguments is not defined
    // Arrow functions don't have their own `arguments` — they use the enclosing scope's
};
// ✅ Use rest params instead (...args):
const arrow2 = (...args) => console.log(args);  // [1, 2] — a real Array
arrow2(1, 2);

// ── Arrow functions have NO `new.target`, NO `prototype`, can't be constructors ──
const Arrow = () => {};
// new Arrow();  // TypeError: Arrow is not a constructor
console.log(Arrow.prototype);  // undefined (arrows have no prototype)
```
::

## Anti-Pattern: Arrow Functions as Object Methods

::code-wrapper{language="javascript"}
```javascript
// ❌ NAIVE — arrow function as method loses `this` (lexical, not dynamic)
const obj = {
    name: "Alice",
    greet: () => console.log(`Hi, ${this.name}`),  // this is NOT obj (lexical → outer)
    // this.name is undefined or window.name (the enclosing scope's this)
};
obj.greet();  // "Hi, undefined" (arrow's `this` is the module/global scope, not obj)

// ✅ CORRECT — regular function or shorthand method syntax for methods
const obj2 = {
    name: "Alice",
    greet() { console.log(`Hi, ${this.name}`); },  // method shorthand: dynamic `this`
};
obj2.greet();  // "Hi, Alice" (this is obj2 when called as obj2.greet())

// ── Arrow functions ARE correct for callbacks INSIDE methods ──
const obj3 = {
    name: "Alice",
    friends: ["Bob", "Charlie"],
    greetFriends() {
        // `this` here is obj3 (regular method call)
        this.friends.forEach(friend => {
            // Arrow inside method: `this` is lexically inherited from greetFriends
            console.log(`${this.name} greets ${friend}`);  // ✓ this.name = "Alice"
        });
    },
};
obj3.greetFriends();  // "Alice greets Bob" / "Alice greets Charlie"

// ── Rules for arrow vs regular function ──
// Use ARROW when:
//   - You need lexical `this` (callbacks, closures, array methods inside a class/method)
//   - You don't need `arguments`, `this`, or `new`
//   - Concise one-liners (map, filter, reduce callbacks)
// Use REGULAR when:
//   - Object methods (need dynamic `this`)
//   - Constructors (need `new`)
//   - You need `arguments` (or use rest params instead)
//   - Event handlers that use `this` (e.g., this.value, this.dataset)
```
::

## `arguments` Object vs Rest Parameters

::code-wrapper{language="javascript"}
```javascript
// ── arguments: array-LIKE (not a real Array) — available in regular functions ──
function sum() {
    console.log(arguments.length);     // 3
    console.log(arguments[0]);         // 1
    // arguments.map(x => x * 2);  // ✗ TypeError: arguments.map is not a function
    // arguments is NOT an Array — no .map, .filter, .reduce, etc.

    // Convert to real array (pre-ES6):
    const args = Array.prototype.slice.call(arguments);
    // or: Array.from(arguments);
    return args.reduce((a, b) => a + b, 0);
}
sum(1, 2, 3);  // 6

// ── Rest parameters (...args): a REAL Array — always prefer this ──
function sumRest(...args) {
    console.log(args.length);           // 3
    console.log(args.map(x => x * 2));  // [2, 4, 6] — real Array, all methods available
    return args.reduce((a, b) => a + b, 0);
}
sumRest(1, 2, 3);  // 6

// ── Rest params must be LAST; can coexist with named params ──
function log(first, second, ...rest) {
    console.log(first, second, rest);
}
log(1, 2, 3, 4, 5);  // 1 2 [3, 4, 5]

// ── arguments is dynamic (tracks the caller's arguments); rest params are static ──
function dynamic() {
    console.log(arguments[0]);  // 1
    arguments[0] = 99;           // mutating arguments mutates the caller's argument!
    // (Only in non-strict mode. In strict mode, arguments is a copy.)
}
let x = 1;
dynamic(x);
console.log(x);  // 99 (non-strict) or 1 (strict — arguments is a copy)
```
::

## Default Parameters and the TDZ

::code-wrapper{language="javascript"}
```javascript
// ── Default parameters: evaluated at CALL TIME (not definition time) ──
function greet(name = "World", greeting = "Hello") {
    console.log(`${greeting}, ${name}!`);
}
greet();          // "Hello, World!" (both defaults)
greet("Alice");   // "Hello, Alice!" (greeting uses default)
greet("Alice", "Hi");  // "Hi, Alice!"
greet(undefined, "Hi");  // "Hi, World!" (undefined triggers default, not null)

// ⚠️ null does NOT trigger default (only undefined does)
greet(null, "Hi");  // "Hi, null!" (null is kept, not replaced with "World")

// ── Default params can reference earlier params (left-to-right) ──
function createRange(start, end = start + 10) {
    return [start, end];
}
createRange(5);  // [5, 15] — end defaults to start + 10

// ── ⚠️ Later params can't be referenced by earlier defaults (TDZ) ──
function bad(a = b, b = 10) {  // b is in TDZ when a's default is evaluated
    return a + b;
}
// bad();  // ReferenceError: Cannot access 'b' before initialization (TDZ)
bad(undefined, 20);  // works: a=undefined→b's default? No, a=undefined → a's default=b→TDZ!
// Actually: bad(undefined, 20) → a's default is `b`, but b=20 is passed, so a=b=20? No:
// When a=undefined triggers a's default (b), b is not yet initialized (TDZ) → ReferenceError
bad(1);  // a=1, b=10 (b's default, no TDZ issue since a has a value)

// ── Default param with function (evaluated at call time, not definition) ──
function withDate(data, timestamp = Date.now()) {
    return { data, timestamp };
}
// Each call gets a fresh Date.now() (default evaluated at call time, not definition)

// ── Default param with destructuring ──
function process({ port = 3000, host = "localhost" } = {}) {
    // The = {} default is for the WHOLE parameter (if no arg is passed)
    console.log(`${host}:${port}`);
}
process();          // "localhost:3000" (entire param defaults to {})
process({});        // "localhost:3000" (empty object → inner defaults)
process({ port: 8080 });  // "localhost:8080"
```
::

## IIFE: Immediately Invoked Function Expression

::code-wrapper{language="javascript"}
```javascript
// ── IIFE: creates a private scope, runs immediately (pre-ES6 module pattern) ──
// Pre-ES6, there were no block-scoped variables (only var, which is function-scoped).
// IIFEs were used to create private scopes and avoid polluting the global namespace.

// ── Standard IIFE ──
(function() {
    var privateVar = "secret";  // not accessible outside the IIFE
    console.log("runs immediately");
})();

// ── Arrow IIFE ──
(() => {
    const privateVar = "secret";
    console.log("runs immediately");
})();

// ── IIFE with parameters ──
(function(name, greeting) {
    console.log(`${greeting}, ${name}!`);
})("Alice", "Hello");

// ── Module pattern: IIFE returning an object (revealing module pattern) ──
const Counter = (function() {
    let count = 0;  // private (closure over the IIFE's scope)

    return {
        increment: () => ++count,
        decrement: () => --count,
        getCount: () => count,  // public API exposing private state
        // count is only accessible through these methods (encapsulation)
    };
})();
Counter.increment();
Counter.getCount();  // 1
// Counter.count;  // undefined — not accessible (private)

// ── Modern: ES modules replace IIFEs for scope isolation ──
// Each ES module has its own scope — no need for IIFEs for privacy.
// IIFEs are still useful for:
//   - One-off scope isolation in non-module scripts
//   - Avoiding global pollution in bookmarklets/inline scripts
//   - Creating async scopes: (async () => { await ... })();
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── Named function expression for better stack traces ──
const handler = function handleClick(event) {
    // "handleClick" appears in stack traces (instead of "anonymous")
    // Also accessible inside for recursion
    console.log("clicked");
};
// Unnamed arrow functions show as "(anonymous)" in stack traces — harder to debug.

// ── Currying with arrow functions ──
const add = a => b => a + b;  // add(1)(2) = 3 (curried)
const add5 = add(5);          // partial application: add5(10) = 15

// ── Callback to promise (promisify a callback-style function) ──
function promisify(fn) {
    return (...args) => new Promise((resolve, reject) => {
        fn(...args, (err, result) => err ? reject(err) : resolve(result));
    });
}
// const readFile = promisify(fs.readFile);
// const content = await readFile("file.txt", "utf8");

// ── `call` and `apply` for explicit `this` binding ──
function greet(greeting) { return `${greeting}, ${this.name}`; }
const user = { name: "Alice" };
greet.call(user, "Hi");     // "Hi, Alice" — call: args one by one
greet.apply(user, ["Hi"]);  // "Hi, Alice" — apply: args as array
const bound = greet.bind(user);  // bind: creates new function with fixed `this`
bound("Hello");  // "Hello, Alice"

// ── `bind` for partial application ──
const add = (a, b) => a + b;
const add10 = add.bind(null, 10);  // first arg fixed to 10
add10(5);  // 15
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── Arrow function returning object literal needs parentheses ──
const makeObj = () => { x: 1 };  // ⚠️ returns undefined! {x:1} is a block, not object
const makeObj2 = () => ({ x: 1 });  // ✓ parentheses force object literal return
console.log(makeObj());   // undefined
console.log(makeObj2());  // { x: 1 }

// ── Function declarations are hoisted; expressions are not ──
hoisted();  // works (declaration hoisted)
function hoisted() {}

// notHoisted();  // TypeError: notHoisted is not a function
var notHoisted = function() {};

// ── `this` in a regular function depends on the call site ──
function showThis() { console.log(this); }
showThis();          // global object (or undefined in strict mode)
const obj = { showThis };
obj.showThis();     // obj (method call — `this` is the receiver)
showThis.call({});  // {} (explicit binding via .call)

// ── Arrow function `this` is locked at definition, not call time ──
const obj = {
    name: "Alice",
    arrow: () => console.log(this),  // `this` is the module/global scope
    regular() { console.log(this); },  // `this` is obj when called as obj.regular()
};
obj.arrow();   // global object (or undefined in strict mode) — NOT obj
obj.regular();  // obj — dynamic `this`

// ── Default param TDZ: later params can't be referenced by earlier defaults ──
function f(a = b, b = 2) { return [a, b]; }
// f();  // ReferenceError: Cannot access 'b' before initialization
f(1);  // [1, 2] (a has a value, b uses default — no TDZ)
f(undefined, 3);  // ReferenceError (a=undefined → tries b's default → TDZ)

// ── `arguments` is NOT available in arrow functions ──
const arrow = () => arguments;  // ReferenceError (or uses enclosing function's arguments)
// Use ...args (rest params) in arrow functions instead.
```
::

## 🧠 Quick Quiz

What does this output?

::code-wrapper{language="javascript"}
```javascript
const obj = {
    name: "Alice",
    greet: () => `Hello, ${this.name}`,
    greet2() { return `Hello, ${this.name}`; },
};
console.log(obj.greet());
console.log(obj.greet2());
```
::

<details>
<summary>Answer</summary>

```javascript
"Hello, undefined"    // greet: arrow function — `this` is lexical (module scope), not obj
"Hello, Alice"        // greet2: regular method — `this` is obj (method call)
```

Arrow functions don't have their own `this` — they inherit it from the enclosing scope (the module/global scope, where `this` is `undefined` in strict mode or the global object in sloppy mode). `this.name` is therefore `undefined.name` → `undefined`.

Regular methods (shorthand syntax) have dynamic `this` — when called as `obj.greet2()`, `this` is `obj`, so `this.name` is `"Alice"`.

**The lesson**: never use arrow functions for object methods that need `this`. Use shorthand method syntax (`method() { ... }`) or regular function expressions.

</details>