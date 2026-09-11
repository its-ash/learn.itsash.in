---
title: "JavaScript 12 — Closure Internals: Lexical Environment, Capture & Memory Leaks"
description: "Deep-dive into JavaScript closures: the lexical environment and scope chain, variable capture semantics, the classic loop closure bug, closures for encapsulation and memoization, and closure-induced memory leaks. Code-first reference for senior engineers."
---

# 12 — Closure Internals: Lexical Environment, Capture & Memory Leaks

## Lexical Environment and the Scope Chain

::code-wrapper{language="javascript"}
```javascript
// ── Every function captures its lexical environment (the scope where it was defined) ──
// A closure is a function + its captured lexical environment.
// Even after the outer function returns, the inner function retains access to the outer's variables.

function outer() {
    const message = "hello from outer";  // captured by the inner closure

    function inner() {
        // `inner` has a reference to outer's lexical environment
        console.log(message);  // still accessible after outer returns
    }

    return inner;  // return the closure
}

const closure = outer();  // outer returns, but `message` is captured
closure();  // "hello from outer" — `message` is alive (not garbage collected)

// ── The scope chain: nested lexical environments ──
function a() {
    const x = 1;
    function b() {
        const y = 2;
        function c() {
            const z = 3;
            // c's scope chain: c → b → a → global
            // c can access z (own), y (b's), x (a's), and globals
            console.log(x, y, z);  // 1 2 3
        }
        c();
    }
    b();
}

// ── How the engine stores closures ──
// Each execution context has a Lexical Environment (a record of variable bindings + a link to the outer environment).
// When a function is created, it captures a reference to the current lexical environment.
// The function's [[Environment]] internal slot points to this environment.
// When the function is called, a new environment is created with the outer link = the captured environment.
// Variable lookup follows the chain: own env → outer env → ... → global env.
```
::

## The Classic Loop Closure Bug

::code-wrapper{language="javascript"}
```javascript
// ── The #1 closure gotcha: var in a loop captures the SAME variable ──
// ❌ NAIVE — all closures share the same `i` (var is function-scoped, not block-scoped)
for (var i = 0; i < 3; i++) {
    setTimeout(() => console.log(i), 0);
}
// Output: 3, 3, 3 — by the time the callbacks run, `i` is 3 (all share the same binding)

// ✅ CORRECT — let creates a new binding per iteration (block scope)
for (let i = 0; i < 3; i++) {
    setTimeout(() => console.log(i), 0);
}
// Output: 0, 1, 2 — each iteration's `i` is a separate binding (per-iteration scope)

// ✅ IIFE workaround (pre-ES6, before let)
for (var i = 0; i < 3; i++) {
    (function(j) {  // IIFE creates a new scope, captures the current value of i
        setTimeout(() => console.log(j), 0);
    })(i);  // pass i as an argument → j is a copy
}
// Output: 0, 1, 2

// ── How `let` in loops works internally ──
// `for (let i = 0; i < 3; i++)` is desugared to create a NEW binding per iteration:
//   { let i = 0; setTimeout(() => console.log(i), 0); }
//   { let i = 1; setTimeout(() => console.log(i), 0); }
//   { let i = 2; setTimeout(() => console.log(i), 0); }
// Each iteration block has its own `i` — closures capture different bindings.

// ── With `var`, it's one binding for the entire loop ──
//   var i; i = 0; setTimeout(() => console.log(i), 0); i++; ...
// All three setTimeout callbacks capture the SAME `i` — which is 3 by the time they run.
```
::

## Closure for Encapsulation (Module Pattern)

::code-wrapper{language="javascript"}
```javascript
// ── Closures provide private state (encapsulation without classes) ──
function createCounter(initial = 0) {
    let count = initial;  // private (closure-captured, not accessible outside)

    return {
        increment() { return ++count; },  // closure over `count`
        decrement() { return --count; },
        getCount() { return count; },     // read-only access via method
        reset() { count = initial; },
    };
}

const counter = createCounter(10);
counter.increment();  // 11
counter.increment();  // 12
console.log(counter.getCount());  // 12
// counter.count;  // undefined — `count` is private (not a property, it's a closure variable)
// The only way to access `count` is through the methods (encapsulation).

// ── Multiple independent instances (each closure has its own `count`) ──
const c1 = createCounter(0);
const c2 = createCounter(100);
c1.increment();  // 1
c2.decrement();  // 99
console.log(c1.getCount(), c2.getCount());  // 1 99 (independent private state)

// ── Closure-based memoization (cache function results) ──
function memoize(fn) {
    const cache = new Map();  // private cache (closure-captured)
    return function(...args) {
        const key = JSON.stringify(args);
        if (cache.has(key)) return cache.get(key);  // cache hit
        const result = fn.apply(this, args);
        cache.set(key, result);  // cache miss → store
        return result;
    };
}
const slowFib = (n) => n <= 1 ? n : slowFib(n - 1) + slowFib(n - 2);
const fastFib = memoize(slowFib);
// fastFib(40);  // fast (cached) — O(n) instead of O(2^n)
```
::

## Closure-Induced Memory Leaks

::code-wrapper{language="javascript"}
```javascript
// ── Closures keep captured variables alive — can cause memory leaks ──
function createLeak() {
    const hugeArray = new Array(1_000_000).fill("*");  // 1M elements (8MB)
    return {
        // Only return a function that uses `length` — but the ENTIRE array is captured!
        getLength: () => hugeArray.length,
    };
}
const leak = createLeak();  // hugeArray stays alive as long as `leak` exists
leak.getLength();  // 1000000
// The entire 1M array is kept alive because the closure captures it.
// Even though we only use `.length`, the engine keeps the whole array.

// ✅ CORRECT — extract what you need, let the rest be garbage collected
function createSafe() {
    const hugeArray = new Array(1_000_000).fill("*");
    const length = hugeArray.length;  // extract the value
    // hugeArray can now be GC'd (no longer referenced by the closure)
    return {
        getLength: () => length,  // closure captures `length` (a number), not `hugeArray`
    };
}
const safe = createSafe();  // hugeArray is GC'd after createSafe returns
safe.getLength();  // 1000000 (only `length` is kept alive — a number, not the array)

// ── DOM event handler leak (old pattern) ──
function setupHandler() {
    const element = document.getElementById("button");
    const heavyData = fetchHeavyData();  // large object

    element.addEventListener("click", () => {
        console.log(heavyData);  // closure captures heavyData → can't be GC'd
    });
    // Even if element is removed from the DOM, the listener (and heavyData) stays alive
    // until the listener is removed or the element is GC'd.
}
// ✅ Fix: remove the listener when no longer needed (or use AbortController)
```
::

## Production Pattern: Once and Memoize

::code-wrapper{language="javascript"}
```javascript
// ── once: ensure a function runs only once (cached result) ──
function once(fn) {
    let called = false;
    let result;
    return function(...args) {
        if (called) return result;  // return cached result on subsequent calls
        called = true;
        result = fn.apply(this, args);
        return result;
    };
}
const init = once(() => { console.log("initializing"); return "done"; });
init();  // logs "initializing", returns "done"
init();  // returns "done" (cached, no log)

// ── debounce: delay execution until calls stop (closure over timeout) ──
function debounce(fn, delay) {
    let timer;  // closure-captured timer ID
    return function(...args) {
        clearTimeout(timer);  // clear previous timer (if any)
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}
const search = debounce(query => console.log("searching:", query), 300);
// search("a"); search("ab"); search("abc");
// Only "searching: abc" runs (after 300ms of no typing)

// ── throttle: limit execution rate (closure over last-run time) ──
function throttle(fn, limit) {
    let lastRun = 0;
    return function(...args) {
        const now = Date.now();
        if (now - lastRun >= limit) {
            lastRun = now;
            fn.apply(this, args);
        }
    };
}
const onScroll = throttle(() => console.log("scrolled"), 100);
// window.addEventListener("scroll", onScroll);  // runs at most every 100ms
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── Closure for partial application (curry) ──
const curry = (fn) => {
    return function curried(...args) {
        if (args.length >= fn.length) {  // enough args → call
            return fn.apply(this, args);
        }
        return (...more) => curried(...args, ...more);  // not enough → return new closure
    };
};
const add = curry((a, b, c) => a + b + c);
add(1)(2)(3);   // 6 (fully curried)
add(1, 2)(3);   // 6 (partial application)
add(1, 2, 3);   // 6 (all at once)

// ── Closure for a state machine ──
function createTrafficLight() {
    const states = ["red", "green", "yellow"];
    let index = 0;
    return {
        next() { index = (index + 1) % states.length; return states[index]; },
        current() { return states[index]; },
    };
}

// ── Closure for event unregistration (cleanup) ──
function onEvent(element, event, handler) {
    element.addEventListener(event, handler);
    return () => element.removeEventListener(event, handler);  // return cleanup function
}
const cleanup = onEvent(button, "click", () => console.log("clicked"));
// Later: cleanup();  // removes the listener (closure captures element, event, handler)
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── Closures capture the VARIABLE, not the VALUE ──
let x = 1;
const getX = () => x;  // captures the variable `x`, not the value 1
x = 2;
console.log(getX());  // 2 (reflects the latest value of x)

// ── Closures capture by reference, not by copy ──
let obj = { count: 0 };
const getObj = () => obj;  // captures the variable `obj`
obj = { count: 99 };
console.log(getObj());  // { count: 99 } (new object — the variable was reassigned)

// ── `let` in loops creates a new binding per iteration (fixes the closure bug) ──
// `var` in loops: all closures share the same binding → classic bug (3, 3, 3)
// `let` in loops: each iteration has its own binding → correct (0, 1, 2)

// ── Closures can cause memory leaks (captured variables stay alive) ──
// If a closure captures a large object, the object stays alive as long as the closure exists.
// Fix: extract only what you need (primitives), let the large object be GC'd.

// ── Closures over `this` (save reference) ──
const obj = {
    items: [],
    init() {
        const self = this;  // save `this` reference for closures
        document.querySelectorAll(".item").forEach(function(el) {
            self.items.push(el);  // closure captures `self` (not `this`)
        });
    },
};

// ── Closures in async: captured values may change before the async callback runs ──
for (let i = 0; i < 3; i++) {
    setTimeout(() => console.log(i), 0);  // ✓ let: 0, 1, 2 (each has own binding)
}
for (var i = 0; i < 3; i++) {
    setTimeout(() => console.log(i), 0);  // ✗ var: 3, 3, 3 (shared binding)
}
```
::

## 🧠 Quick Quiz

What does this output?

::code-wrapper{language="javascript"}
```javascript
function createFunctions() {
    const fns = [];
    for (let i = 0; i < 3; i++) {
        fns.push(() => i);
    }
    return fns;
}
const [a, b, c] = createFunctions();
console.log(a(), b(), c());
```
::

<details>
<summary>Answer</summary>

```
0 1 2
```

With `let` in the loop, each iteration creates a **new binding** for `i`. Each closure captures its own `i`:
- `a` captures `i = 0` (first iteration's binding)
- `b` captures `i = 1` (second iteration's binding)
- `c` captures `i = 2` (third iteration's binding)

If `var` were used instead of `let`, all three closures would share the same `i` (which is 3 by the time the loop ends), and the output would be `3 3 3`.

**The lesson**: `let` in a `for` loop creates a per-iteration binding. Each closure captures a different `i`. `var` creates a single function-scoped binding — all closures share the same `i` (which ends at 3).

</details>