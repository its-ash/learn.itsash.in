---
title: "JavaScript 01 — Engine Architecture, Runtime Model & Execution Pipeline"
description: "Deep-dive into JavaScript engine internals: V8/SpiderMonkey/JSCore architecture, the call stack and heap, event loop phases, JIT compilation, and the Node.js vs browser runtime model. Code-first reference for mid-to-senior engineers."
---

# 01 — Engine Architecture, Runtime Model & Execution Pipeline

## How a JS Engine Executes Your Code

::code-wrapper{language="javascript"}
```javascript
// ── The JavaScript execution pipeline (V8, SpiderMonkey, JSCore) ──
//
// 1. PARSE: Source code → AST (Abstract Syntax Tree)
//    - Lexer/tokenizer: characters → tokens (keywords, identifiers, literals)
//    - Parser: tokens → AST (nested node tree representing program structure)
//    - Early errors (syntax) are thrown here — before any code runs.
//
// 2. COMPILE (JIT): AST → bytecode (+ tiered optimization to machine code)
//    - Interpreter (Ignition in V8): AST → bytecode, executes immediately
//    - Profiler: watches "hot" functions (called many times)
//    - Optimizing compiler (TurboFan in V8): hot bytecode → optimized machine code
//    - Deoptimization: if assumptions break (type changes), falls back to bytecode
//
// 3. EXECUTE: bytecode/machine code runs on the VM
//    - Call stack: LIFO stack of execution contexts (frames)
//    - Heap: memory allocation for objects, closures, references
//    - GC (Orinoco in V8): generational, mark-and-sweep garbage collector

// ── Execution context structure (created for each function call) ──
// Every execution context has:
//   1. Variable Environment: var declarations, function declarations (hoisted)
//   2. Lexical Environment: let/const declarations (TDZ), closures
//   3. ThisBinding: the `this` value for this context
//   4. Outer: reference to the parent (outer) lexical environment (for scope chain)

// ── Hoisting: what actually happens during context creation ──
console.log(typeof greet);    // "function" — function declarations are fully hoisted
console.log(typeof x);        // "undefined" — var is hoisted and initialized to undefined
console.log(typeof y);        // "ReferenceError" — let/const are hoisted but in TDZ

function greet() { return "hello"; }  // hoisted: declaration + body
var x = 10;                            // hoisted: declaration only (x = undefined initially)
let y = 20;                           // hoisted: declaration only, in TDZ until line executes

// ── The call stack (LIFO — Last In, First Out) ──
function a() { b(); console.log("a"); }  // a pushes frame, calls b
function b() { c(); console.log("b"); }  // b pushes frame, calls c
function c() { console.log("c"); }        // c pushes frame, returns

a();
// Call stack during execution:
// [a] → [a, b] → [a, b, c] → c returns → [a, b] → b returns → [a] → a returns → []
// Output: "c", "b", "a" (LIFO — last called, first to complete)

// ── Stack overflow: no tail-call optimization in V8 (only Safari/JSCore) ──
function recurse(n) {
    if (n === 0) return;
    recurse(n - 1);  // each call adds a frame — no TCO in Chrome/Node
}
recurse(10000);  // RangeError: Maximum call stack size exceeded (in V8)
// Safari/JSCore: supports TCO in strict mode — tail calls don't grow the stack
// 'use strict'; function tailRecurse(n, acc = 0) { return n === 0 ? acc : tailRecurse(n - 1, acc + n); }
```
::

## Anti-Pattern: Blocking the Main Thread

::code-wrapper{language="javascript"}
```javascript
// ❌ NAIVE — synchronous heavy computation blocks the event loop
// JS is single-threaded: one call stack, one event loop, one heap.
// While this runs, NOTHING else can: no UI updates, no timers, no I/O callbacks.

function blockingFibonacci(n) {
    return n <= 1 ? n : blockingFibonacci(n - 1) + blockingFibonacci(n - 2);
}
// blockingFibonacci(45);  // ~5 seconds of frozen UI — the entire main thread is blocked

// ✅ CORRECT — chunk work with setTimeout/scheduler to yield to the event loop
// Each chunk runs, then yields control back so the event loop can process other tasks.
async function chunkedFibonacci(n, chunkSize = 1000) {
    return new Promise(resolve => {
        let a = 0n, b = 1n, i = 0;

        function chunk() {
            const end = Math.min(i + chunkSize, n);
            for (; i < end; i++) {
                [a, b] = [b, a + b];  // BigInt — no precision loss for large numbers
            }
            if (i < n) {
                setTimeout(chunk, 0);  // yield to event loop — other callbacks can run
            } else {
                resolve(a.toString());
            }
        }
        chunk();
    });
}
// chunkedFibonacci(100000).then(r => console.log(r));  // UI stays responsive
```
::

## V8's Tiered Compilation Pipeline

::code-wrapper{language="javascript"}
```javascript
// ── V8's JIT pipeline (Ignition + TurboFan) ──
//
// Source → AST → Ignition (bytecode interpreter)
//                    ↓ (hot function detected)
//              TurboFan (optimizing compiler)
//                    ↓ (assumptions broken)
//              Deoptimize → back to bytecode

// ── Type speculation: TurboFan optimizes based on observed types ──
function add(a, b) { return a + b; }

add(1, 2);       // TurboFan sees: always numbers → compiles to integer add
add(1, 2);       // hot function — optimized machine code (fast path)
add(1, 2);
add("x", "y");   // ✗ type changed to string! → DEOPTIMIZE → falls back to bytecode
// After deopt, V8 may re-optimize with a more general (slower) version.

// ── Hidden classes (Shapes/Maps): V8's object layout optimization ──
// V8 assigns objects a "hidden class" (internal shape) based on their properties.
// Same property order → same hidden class → fast property access (inline caches).

function Point(x, y) {
    this.x = x;  // Point class created with {x}
    this.y = y;  // class transitioned to {x, y}
}
const p1 = new Point(1, 2);  // hidden class: Point{x, y}
const p2 = new Point(3, 4);  // same hidden class: Point{x, y} → fast!

// ❌ Property order matters — this creates a DIFFERENT hidden class:
function BadPoint(x, y) {
    this.y = y;  // BadPoint class created with {y} — different transition path
    this.x = x;  // transitioned to {y, x} — different from Point{x, y}
}
const p3 = new BadPoint(1, 2);  // hidden class: BadPoint{y, x} — NOT same as Point

// ❌ Adding properties after construction causes class transitions (slow):
const p4 = new Point(5, 6);
p4.z = 7;  // class transition: Point{x, y} → Point{x, y, z} (new hidden class)
// All future Point instances still use Point{x, y} — p4 is a different shape now.

// ✅ Declare all properties in the constructor for consistent hidden classes:
function FastPoint(x, y, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;  // all properties declared upfront — single hidden class
}
```
::

## Node.js vs Browser Runtime

::code-wrapper{language="javascript"}
```javascript
// ── Browser runtime model ──
//   ┌──────────────────┐     ┌───────────────────┐
//   │  JS Engine (V8)  │     │  Web APIs (C++)   │
//   │  Call Stack       │     │  DOM, fetch,      │
//   │  Heap (GC)       │     │  setTimeout, XHR  │
//   └────────┬─────────┘     └─────────┬─────────┘
//            │                          │
//            │   ┌──────────────────────┘
//            │   │
//   ┌────────▼───▼────────┐
//   │   Event Loop        │
//   │   (libuv in Node,   │
//    │   browser-native)  │
//   │                     │
//   │   ┌───────────────┐ │
//   │   │ Microtask Q    │ │ ← Promise.then, queueMicrotask, MutationObserver
//   │   │ (drained fully)│ │    (runs AFTER each macrotask, before next)
//   │   └───────────────┘ │
//   │   ┌───────────────┐ │
//   │   │ Macrotask Q    │ │ ← setTimeout, setInterval, I/O, UI events
//   │   │ (one per tick) │ │    (one macrotask per event loop tick)
//   │   └───────────────┘ │
//   └─────────────────────┘

// ── Node.js runtime model ──
//   Same V8 engine, but different host environment:
//   - No DOM, no window, no document
//   - Has: process, Buffer, __dirname, __filename, require()
//   - libuv provides the event loop (cross-platform async I/O)
//   - Timers: setTimeout/setInterval (from Node, not window)
//   - Microtasks: process.nextTick (Node-specific, higher priority than Promises)

// ── Node-specific APIs (not available in browser) ──
const fs = require('fs');          // file system
const http = require('http');      // HTTP server/client
const path = require('path');      // path manipulation
const { Worker } = require('worker_threads');  // true parallelism

// ── Browser-specific APIs (not available in Node) ──
// window, document, localStorage, fetch (Node 18+ has fetch)
// DOM manipulation, CSS, Canvas, Web Audio, etc.

// ── Shared: the language is the same, the platform APIs differ ──
// Pure JS (Array methods, Promises, closures, classes) works identically in both.
```
::

## The Event Loop: Microtasks vs Macrotasks

::code-wrapper{language="javascript"}
```javascript
// ── Event loop tick (one iteration) ──
// 1. Execute one macrotask (setTimeout callback, I/O callback, event handler)
// 2. Drain the microtask queue (ALL microtasks: Promise.then, queueMicrotask)
//    - Microtasks run to completion before the next macrotask
//    - New microtasks added during step 2 also run in the same drain
// 3. Render (browser only: requestAnimationFrame callbacks, layout, paint)
// 4. Repeat

console.log("1: sync");

setTimeout(() => console.log("4: macrotask"), 0);

Promise.resolve().then(() => console.log("3: microtask"));

console.log("2: sync");

// Output: 1, 2, 3, 4
// 1: synchronous code runs first (script is itself a macrotask)
// 2: continues synchronously
// 3: microtask runs after current script (drained before next macrotask)
// 4: macrotask (setTimeout) runs after all microtasks are drained

// ── Microtask starvation: microtasks can block macrotasks ──
// If a microtask keeps adding more microtasks, macrotasks NEVER run:
// (Don't run this — it blocks forever)
// function infiniteMicrotasks() {
//     Promise.resolve().then(infiniteMicrotasks);
// }
// infiniteMicrotasks();  // setTimeout callbacks never run — microtask queue never empties

// ── Node.js: process.nextTick vs Promise.then ──
// process.nextTick has HIGHER priority than Promise microtasks:
// Node only:
// process.nextTick(() => console.log("nextTick"));
// Promise.resolve().then(() => console.log("promise"));
// console.log("sync");
// Output: sync, nextTick, promise (nextTick drains before Promise microtasks)
```
::

## Memory Model: Stack vs Heap

::code-wrapper{language="javascript"}
```javascript
// ── Stack: primitive values, function frames, references ──
// ── Heap: objects, arrays, functions, closures (reference types) ──

let a = 42;        // 42 stored on the stack (primitive)
let b = a;         // copy: b gets its own 42 on the stack (pass by value)
a = 99;            // a is 99, b is still 42 (independent copies)

const obj1 = { x: 1 };  // {x:1} allocated on the heap; obj1 is a reference on the stack
const obj2 = obj1;       // obj2 copies the REFERENCE (points to same heap object)
obj1.x = 99;            // mutates the shared heap object
console.log(obj2.x);     // 99 — obj2 sees the change (same object)

// ── Garbage collection (GC) ──
// V8 uses a generational mark-and-sweep GC:
//   - Young generation (nursery): new objects, short-lived. Scavenged (copied) frequently.
//   - Old generation: survived objects, long-lived. Mark-and-swept less frequently.
// An object is collected when no references to it remain on the stack or in other heap objects.

function createLeak() {
    const huge = new Array(1_000_000).fill("*");  // allocated on heap
    // If `huge` is captured by a closure or stored globally, it can't be GC'd.
    return () => huge.length;  // closure captures `huge` — keeps it alive
}
const leak = createLeak();  // huge array stays alive as long as `leak` exists
leak = null;  // NOW the huge array can be GC'd (no more references)

// ── WeakRef: hold a reference without preventing GC ──
const target = { data: "important" };
const weakRef = new WeakRef(target);
// weakRef.deref() returns the object if still alive, or undefined if GC'd
console.log(weakRef.deref());  // { data: "important" } or undefined if GC'd
// Use case: caches that shouldn't prevent garbage collection
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── Check your runtime (browser vs Node) ──
const isNode = typeof process !== "undefined" && process.versions?.node;
const isBrowser = typeof window !== "undefined";
const isWorker = typeof self !== "undefined" && typeof window === "undefined";

// ── Feature-detect without UA sniffing ──
const supportsWeakRef = typeof WeakRef !== "undefined";
const supportsTopLevelAwait = true;  // ES2022+ — check by trying

// ── Use scheduler.yield() (Chrome 129+) to yield without setTimeout ──
// Modern alternative to setTimeout(fn, 0) for yielding:
async function yieldToEventLoop() {
    if (typeof scheduler !== "undefined" && scheduler.yield) {
        await scheduler.yield();  // higher-priority than setTimeout
    } else {
        await new Promise(r => setTimeout(r, 0));  // fallback
    }
}

// ── Measure engine performance with performance.now() ──
const start = performance.now();
// ... code to measure ...
const elapsed = performance.now() - start;  // milliseconds with sub-ms precision
// performance.now() is monotonic (never goes backwards) and high-resolution.

// ── Detect JIT deoptimization (V8) with %GetOptimizationStatus ──
// Requires: node --allow-natives-syntax
// function hot() { return 1 + 2; }
// hot(); hot(); hot();  // warm up
// print(%GetOptimizationStatus(hot));  // 1 = optimized, 0 = not optimized
// (Debug-only — don't use in production)
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── `instanceof` breaks across realms (iframes, Node worker_threads) ──
// Each realm has its own copy of built-in constructors.
// Node:
const { Worker } = require("worker_threads");
// An array created in a Worker is NOT instanceof Array in the main thread:
// const w = new Worker('module.exports = new Array()');
// w.on('message', arr => console.log(arr instanceof Array));  // false!
// (Each realm has its own Array constructor → different prototypes)
// Use Array.isArray(arr) instead — works across realms.

// ── `typeof null === "object"` is a legendary bug (not fixable — would break the web) ──
// In the original JS implementation, type tags used 3 bits:
//   000: object, 001: integer, 010: double, 100: string, 110: boolean
// null was represented as the NULL pointer (0x00), which looked like type tag 000 (object).
console.log(typeof null);        // "object" (bug, since 1995)
console.log(null instanceof Object);  // false (null is NOT an Object instance)
// Correct null check: val === null (strict equality)

// ── `[]` and `{}` are truthy (unlike Python where they're falsy) ──
if ([]) console.log("empty array is truthy");    // prints!
if ({}) console.log("empty object is truthy");   // prints!
if (0) console.log("0 is falsy");                 // does NOT print
// Only 6 falsy values: false, 0, -0, 0n, "", null, undefined, NaN
// (Empty array/object are NOT in the falsy list)

// ── `NaN` is the only value not equal to itself ──
console.log(NaN === NaN);  // false
console.log(Number.isNaN(NaN));  // true (correct way)
console.log(Object.is(NaN, NaN));  // true (Object.is handles NaN and -0)
```
::

## 🧠 Quick Quiz

What's the output order?

::code-wrapper{language="javascript"}
```javascript
console.log("A");
setTimeout(() => console.log("B"), 0);
Promise.resolve().then(() => console.log("C"));
console.log("D");
queueMicrotask(() => console.log("E"));
```
::

<details>
<summary>Answer</summary>

```
A
D
C
E
B
```

1. `A` — synchronous (script is a macrotask, runs first)
2. `D` — synchronous (continues)
3. `C` — microtask (Promise.then, drained after script)
4. `E` — microtask (queueMicrotask, same microtask drain)
5. `B` — macrotask (setTimeout, runs after all microtasks drained)

**The lesson**: all microtasks (Promise.then, queueMicrotask) run before the next macrotask (setTimeout). The microtask queue is fully drained before the event loop moves to the next macrotask.

</details>