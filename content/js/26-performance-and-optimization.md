---
title: "JavaScript 26 — Performance: Memory Leaks, Hidden Classes & Benchmarking"
description: "Deep-dive into JavaScript performance: V8 hidden classes and inline caches, closure-induced memory leaks, structuredClone vs JSON, benchmarking with performance.now, and lazy evaluation patterns. Code-first reference for senior engineers."
---

# 26 — Performance: Memory Leaks, Hidden Classes & Benchmarking

## V8 Hidden Classes and Inline Caches

::code-wrapper{language="javascript"}
```javascript
// ── Hidden classes (Maps/Shapes): V8's object layout optimization ──
// V8 assigns objects a "hidden class" based on their property structure.
// Same property order → same hidden class → fast property access (inline caches).

// ✅ Fast: consistent property order (same hidden class for all instances)
function Point(x, y) {
    this.x = x;  // hidden class transition: {} → {x}
    this.y = y;  // hidden class transition: {x} → {x, y}
}
const p1 = new Point(1, 2);  // hidden class: Point{x, y}
const p2 = new Point(3, 4);  // same hidden class: Point{x, y} → fast!

// ❌ Slow: different property order (different hidden class transitions)
function BadPoint1(x, y) { this.x = x; this.y = y; }
function BadPoint2(x, y) { this.y = y; this.x = x; }  // different transition order
const a = new BadPoint1(1, 2);  // hidden class: {x, y}
const b = new BadPoint2(1, 2);  // hidden class: {y, x} — DIFFERENT → can't share inline caches

// ❌ Adding properties after construction (causes hidden class transitions)
const p3 = new Point(1, 2);
p3.z = 3;  // hidden class transition: Point{x, y} → Point{x, y, z} (slower for this instance)
// Future Point instances still use Point{x, y} — p3 has a different (slower) hidden class.

// ── Inline caches: V8 remembers the hidden class at property access sites ──
function getX(obj) { return obj.x; }
getX(p1); getX(p1); getX(p1);  // V8 caches: "obj is Point{x,y}, x is at offset N"
getX(p2);  // same hidden class → cache hit → fast
getX(b);   // different hidden class → cache miss → deoptimize → re-cache

// ── Best practices for hidden class stability ──
// 1. Declare all properties in the constructor (in the same order for all instances)
// 2. Don't add properties after construction (use a fixed set of properties)
// 3. Don't delete properties (causes transitions) — use null/undefined instead
// 4. Avoid polymorphic call sites (same function called with different hidden classes)
```
::

## Closure-Induced Memory Leaks

::code-wrapper{language="javascript"}
```javascript
// ── Closures keep captured variables alive — can cause leaks ──

// ❌ LEAK: closure captures the entire large array (even though only .length is used)
function createLeak() {
    const hugeArray = new Array(1_000_000).fill("*");
    return () => hugeArray.length;  // closure captures hugeArray → stays alive
}
const leak = createLeak();  // hugeArray (8MB) stays alive as long as `leak` exists

// ✅ FIX: extract the value, let the large object be GC'd
function createSafe() {
    const hugeArray = new Array(1_000_000).fill("*");
    const length = hugeArray.length;  // extract the value (a number)
    return () => length;  // closure captures `length` (a number), not `hugeArray`
    // hugeArray is no longer referenced → GC'd after createSafe returns
}

// ── Detached DOM elements (closure + DOM = leak) ──
function setupLeak() {
    const element = document.querySelector("#removed");
    const heavyData = { /* large object */ };
    element.addEventListener("click", () => {
        console.log(heavyData, element);  // closure captures heavyData AND element
    });
    document.body.removeChild(element);  // remove from DOM
    // The element and heavyData are still alive (closure holds references) → LEAK
}

// ✅ FIX: use AbortController for clean listener removal
function setupClean() {
    const controller = new AbortController();
    const element = document.querySelector("#target");
    element.addEventListener("click", handler, { signal: controller.signal });
    return () => controller.abort();  // cleanup: removes listener → element can be GC'd
}

// ── Timer leaks (setInterval keeps running) ──
function timerLeak() {
    setInterval(() => {
        console.log("running");  // runs forever — keeps the closure alive
    }, 1000);
}
// ✅ FIX: store the ID and clear it
function cleanTimer() {
    const id = setInterval(() => console.log("running"), 1000);
    return () => clearInterval(id);  // cleanup function
}
```
::

## Benchmarking with `performance.now`

::code-wrapper{language="javascript"}
```javascript
// ── performance.now: high-resolution monotonic clock (sub-millisecond) ──
function benchmark(fn, iterations = 10000) {
    // Warm up (let V8 optimize the function)
    for (let i = 0; i < 1000; i++) fn();

    const start = performance.now();
    for (let i = 0; i < iterations; i++) fn();
    const elapsed = performance.now() - start;
    return { elapsed, perOp: elapsed / iterations };
}

const { perOp } = benchmark(() => {
    // code to measure
    [1, 2, 3].map(x => x * 2);
});
console.log(`${perOp.toFixed(4)}ms per operation`);

// ── Compare two implementations ──
function compare(label1, fn1, label2, fn2, iterations = 100000) {
    // Warm up both
    for (let i = 0; i < 1000; i++) { fn1(); fn2(); }

    const t1 = benchmark(fn1, iterations).perOp;
    const t2 = benchmark(fn2, iterations).perOp;
    console.log(`${label1}: ${t1.toFixed(6)}ms`);
    console.log(`${label2}: ${t2.toFixed(6)}ms`);
    console.log(`ratio: ${(t1 / t2).toFixed(2)}x`);
}

// ── Example: parameter expansion vs spread ──
compare(
    "spread", () => Math.max(...[1, 2, 3, 4, 5]),
    "apply",  () => Math.max.apply(null, [1, 2, 3, 4, 5]),
);

// ── ⚠️ Benchmark pitfalls ──
// 1. Warm up first (V8 optimizes after repeated calls — don't measure cold code)
// 2. Run enough iterations (too few → noise dominates)
// 3. Don't measure dead code (V8 might eliminate unused results — use the result)
// 4. Beware of GC pauses (run multiple times, take the median)
// 5. Use `performance.now()` (not `Date.now()` — low resolution, not monotonic)
```
::

## Deep Clone Performance: `structuredClone` vs JSON

::code-wrapper{language="javascript"}
```javascript
// ── Deep clone methods (ranked by performance and capability) ──

// Method 1: structuredClone (modern, handles most types — NOT functions)
const clone1 = structuredClone(original);
// Handles: nested objects, arrays, Date, RegExp, Map, Set, ArrayBuffer, typed arrays, circular refs
// Fails: functions, DOM nodes, Symbols, class instances (loses prototype)
// Performance: fast (native C++ implementation)

// Method 2: JSON.parse(JSON.stringify()) (legacy — lossy)
const clone2 = JSON.parse(JSON.stringify(original));
// Handles: plain objects, arrays, strings, numbers, booleans, null
// Loses: undefined, Date → string, NaN → null, Map/Set → {}, functions → omitted, BigInt → throws
// Performance: slower than structuredClone (string serialization overhead)

// Method 3: manual recursive clone (full control, handles custom types)
function deepClone(obj, cache = new WeakMap()) {
    if (obj === null || typeof obj !== "object") return obj;
    if (obj instanceof Date) return new Date(obj);
    if (obj instanceof RegExp) return new RegExp(obj);
    if (obj instanceof Map) return new Map([...obj].map(([k, v]) => [deepClone(k, cache), deepClone(v, cache)]));
    if (cache.has(obj)) return cache.get(obj);  // circular reference guard
    const clone = Array.isArray(obj) ? [] : Object.create(Object.getPrototypeOf(obj));
    cache.set(obj, clone);
    for (const key of Reflect.ownKeys(obj)) {
        clone[key] = deepClone(obj[key], cache);
    }
    return clone;
}

// ── Benchmark: structuredClone vs JSON vs manual ──
const data = { users: Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `User${i}` })) };
// structuredClone(data): ~1ms (fastest for complex types)
// JSON.parse(JSON.stringify(data)): ~3ms (slower, lossy)
// deepClone(data): ~8ms (slowest, but handles everything)
```
::

## Lazy Evaluation and Memoization

::code-wrapper{language="javascript"}
```javascript
// ── Lazy evaluation: compute only when needed ──

// ── Lazy property (computed on first access) ──
class Config {
    #parsed = null;
    get data() {
        if (this.#parsed === null) {
            this.#parsed = JSON.parse(this.rawJson);  // parse on first access
        }
        return this.#parsed;
    }
    constructor(rawJson) { this.rawJson = rawJson; }
}
const config = new Config(rawJson);
// config.rawJson is stored, but data isn't parsed until config.data is accessed.
// If data is never accessed, the parse never runs (saves CPU).

// ── Memoization: cache results (same input → cached output) ──
function memoize(fn) {
    const cache = new Map();
    return (...args) => {
        const key = JSON.stringify(args);
        if (cache.has(key)) return cache.get(key);
        const result = fn(...args);
        cache.set(key, result);
        return result;
    };
}

const expensiveCompute = memoize((n) => {
    console.log("computing...");  // only runs on first call with this input
    return n * 2;
});
expensiveCompute(42);  // logs "computing...", returns 84
expensiveCompute(42);  // returns 84 (cached, no log)

// ── Lazy range generator (compute on demand, not upfront) ──
function* range(start, end, step = 1) {
    for (let i = start; i < end; i += step) yield i;
}
const lazyRange = range(0, 1_000_000_000);  // doesn't create a billion items
lazyRange.next().value;  // 0 (computes on demand)
// Only computes values as they're consumed — O(1) memory, infinite sequences possible.

// ── Virtual list (only render visible items) ──
function* visibleItems(items, scrollTop, viewportHeight, itemHeight) {
    const start = Math.floor(scrollTop / itemHeight);
    const end = Math.min(start + Math.ceil(viewportHeight / itemHeight), items.length);
    for (let i = start; i < end; i++) yield { index: i, item: items[i] };
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── Avoid creating objects in hot paths (hidden class transitions + GC pressure) ──
// ❌ Creates a new object each call (GC pressure)
function getCoords() { return { x: Math.random(), y: Math.random() }; }
// ✅ Reuse a pre-allocated object (avoid allocation in hot paths)
const coords = { x: 0, y: 0 };
function getCoordsFast() { coords.x = Math.random(); coords.y = Math.random(); return coords; }

// ── Use typed arrays for numeric data (contiguous memory, no boxing) ──
const floats = new Float64Array(1000);  // 8KB, contiguous, cache-friendly
// vs: const floats = new Array(1000).fill(0);  // each element is a boxed number (slower)

// ── Avoid `arguments` (use rest params — V8 optimizes rest better) ──
// ❌ function f() { return Array.from(arguments); }
// ✅ function f(...args) { return args; }

// ── Avoid `delete` (causes hidden class transition → slow) ──
// ❌ delete obj.prop;  (transition + deoptimization)
// ✅ obj.prop = undefined;  (keep the hidden class, just null the value)

// ── Use `Object.create(null)` for hash maps (no prototype overhead) ──
const map = Object.create(null);  // no inherited properties (toString, hasOwnProperty, etc.)
map.key = "value";  // slightly faster than {} (no prototype chain lookup)

// ── Batch DOM reads/writes (avoid layout thrashing) ──
// Read all layout values first, then write all styles (minimize reflows).
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── Microbenchmarking can be misleading (V8 optimizes differently in production) ──
// Hot functions in benchmarks get optimized; in production, cold paths might not be.
// Use real-world profiling (Chrome DevTools Performance tab) for accurate bottlenecks.

// ── `delete` on objects causes hidden class transitions (slow) ──
// Avoid delete — set to undefined/null instead.

// ── Closure capture keeps large objects alive (memory leak) ──
// Extract only what you need from large objects before capturing in closures.

// ── `Date.now()` is low-resolution (ms) and not monotonic (can go backwards on clock sync) ──
// Use `performance.now()` for benchmarking (sub-ms resolution, monotonic).

// ── JSON.parse(JSON.stringify()) loses types (Date → string, undefined → omitted, NaN → null) ──
// Use structuredClone for type-preserving deep clones.

// ── Adding properties after construction causes hidden class transitions ──
// Declare all properties in the constructor for consistent hidden classes.
```
::

## 🧠 Quick Quiz

Why is this code slow for large arrays?

::code-wrapper{language="javascript"}
```javascript
function sum(arr) {
    let total = 0;
    for (let i = 0; i < arr.length; i++) {
        total += arr[i];
    }
    return total;
}
const bigArray = new Array(10_000_000);
for (let i = 0; i < bigArray.length; i++) bigArray[i] = Math.random();
sum(bigArray);  // slow
```
::

<details>
<summary>Answer</summary>

The array is created with `new Array(10_000_000)` — a **sparse array with holes**. The loop fills it with values, but V8 may represent this as a dictionary (slow mode) rather than a packed array (fast mode) because:

1. `new Array(n)` creates an array with `n` **holes** (empty slots, not packed numbers).
2. Filling it with `Math.random()` converts each hole to a double-precision number, but V8 may not transition to a packed `PACKED_DOUBLE_ELEMENTS` hidden class until it's certain all elements are filled.
3. Each `arr[i]` access on a hole-containing array is slower (extra checks).

**Fix**: Create a packed array from the start:

```javascript
// ✅ Packed array (fast — V8 uses PACKED_DOUBLE_ELEMENTS)
const bigArray = Array.from({ length: 10_000_000 }, () => Math.random());
// or: const bigArray = new Float64Array(10_000_000);  // typed array (fastest for numbers)
```

**The lesson**: `new Array(n)` creates a sparse array with holes. V8 optimizes packed arrays (no holes, consistent element types) much better than sparse arrays. Use `Array.from()` or typed arrays for large numeric arrays.

</details>