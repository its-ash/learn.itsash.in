---
title: "JavaScript 15 — Event Loop Internals: Call Stack, Microtasks, Macrotasks & Rendering"
description: "Deep-dive into the JavaScript event loop: the call stack and heap, microtask vs macrotask queues, execution order guarantees, queueMicrotask, the task pipeline, and starvation patterns. Code-first reference for senior engineers."
---

# 15 — Event Loop Internals: Call Stack, Microtasks, Macrotasks & Rendering

## The Event Loop Model

::code-wrapper{language="javascript"}
```javascript
// ── Single-threaded JS: one call stack, one event loop, one heap ──
//
//   ┌──────────────────┐
//   │  Call Stack       │  ← LIFO — function frames (pushed/popped as functions call/return)
//   │  [main()]         │
//   │  [outer()]        │
//   │  [inner()]  ← top │  ← always executes the top frame
//   └──────────────────┘
//
//   ┌──────────────────┐     ┌───────────────────────┐
//   │  Heap (memory)    │     │  Web/Node APIs (C++)  │
//   │  objects, closures│     │  setTimeout, fetch,   │
//   │  (GC managed)     │     │  DOM, I/O, crypto     │
//   └──────────────────┘     └───────────┬───────────┘
//                                         │ (callback ready)
//   ┌─────────────────────────────────────▼───────────────────┐
//   │                  Event Loop (one iteration = one "tick")  │
//   │                                                            │
//   │  1. Pick ONE macrotask from the macrotask queue            │
//   │     → setTimeout, setInterval, I/O, UI events              │
//   │                                                            │
//   │  2. Drain the microtask queue (ALL microtasks)             │
//   │     → Promise.then/catch/finally, queueMicrotask           │
//   │     → new microtasks added during step 2 also run NOW      │
//   │                                                            │
//   │  3. Render (browser only):                                 │
//   │     → requestAnimationFrame callbacks                     │
//   │     → style/layout calculation                            │
//   │     → paint                                               │
//   │                                                            │
//   │  4. Go back to step 1 (next tick)                         │
//   └────────────────────────────────────────────────────────────┘

// ── Execution order demonstration ──
console.log("1: script start (synchronous)");

setTimeout(() => console.log("5: macrotask (setTimeout)"), 0);

Promise.resolve()
    .then(() => console.log("3: microtask (Promise.then)"))
    .then(() => console.log("4: microtask (chained .then)"));

queueMicrotask(() => console.log("2: microtask (queueMicrotask)"));

console.log("6: script end (synchronous)");

// Output order: 1, 6, 2, 3, 4, 5
// 1, 6: synchronous (script is a macrotask — runs first)
// 2, 3, 4: microtasks (drained after script, before next macrotask)
// 5: macrotask (setTimeout — runs after all microtasks drained)
```
::

## Microtask Queue: Full Drain Semantics

::code-wrapper{language="javascript"}
```javascript
// ── The microtask queue is FULLY drained before the next macrotask ──
// New microtasks added during the drain ALSO run in the same drain (no limit).

Promise.resolve().then(() => {
    console.log("A");
    Promise.resolve().then(() => console.log("B"));  // added during drain — runs NOW
});
Promise.resolve().then(() => console.log("C"));
console.log("D");
// Output: D, A, C, B
// D: synchronous
// A: first microtask (queued before D finished)
// C: second microtask (queued at the same time as A)
// B: added during A's execution → runs in the SAME drain (after C, before next macrotask)

// ── Microtask starvation: infinite microtasks block macrotasks forever ──
// (Don't run this — it blocks the event loop)
// function infinite() {
//     Promise.resolve().then(infinite);
// }
// infinite();
// setTimeout(() => console.log("never"), 0);  // never runs — microtask queue never empties

// ── Node.js: process.nextTick vs Promise microtask ──
// process.nextTick has HIGHER priority than Promise microtasks:
// Node only:
// process.nextTick(() => console.log("nextTick"));
// Promise.resolve().then(() => console.log("promise"));
// console.log("sync");
// Output: sync, nextTick, promise (nextTick drains before Promise microtasks)
```
::

## Callbacks and the Pyramid of Doom

::code-wrapper{language="javascript"}
```javascript
// ── Callbacks: the original async pattern (pre-Promises) ──
// Node.js error-first callback convention:
const fs = require("fs");
fs.readFile("config.json", "utf8", (err, data) => {
    if (err) {
        console.error("error:", err);
        return;
    }
    const config = JSON.parse(data);
    // Nested callback — "pyramid of doom" / "callback hell":
    fs.readFile(config.templatePath, "utf8", (err, template) => {
        if (err) { console.error(err); return; }
        const rendered = template.replace("{{name}}", config.name);
        fs.writeFile(config.outputPath, rendered, (err) => {
            if (err) { console.error(err); return; }
            console.log("done");
        });
    });
});

// ── Fix: named functions (flatten the pyramid) ──
function loadConfig(cb) {
    fs.readFile("config.json", "utf8", (err, data) => {
        if (err) return cb(err);
        cb(null, JSON.parse(data));
    });
}

function loadTemplate(config, cb) {
    fs.readFile(config.templatePath, "utf8", (err, template) => {
        if (err) return cb(err);
        cb(null, config, template);
    });
}

function writeOutput(config, template, cb) {
    const rendered = template.replace("{{name}}", config.name);
    fs.writeFile(config.outputPath, rendered, cb);
}

// Flat chain (no nesting):
loadConfig((err, config) => {
    if (err) return console.error(err);
    loadTemplate(config, (err, template) => {
        if (err) return console.error(err);
        writeOutput(config, template, (err) => {
            if (err) return console.error(err);
            console.log("done");
        });
    });
});
```
::

## Production Pattern: Concurrency with `queueMicrotask`

::code-wrapper{language="javascript"}
```javascript
// ── queueMicrotask: schedule a microtask without a Promise ──
// Lower latency than setTimeout(fn, 0) — runs before the next macrotask.

// Use case: batch synchronous work into microtasks (yield to the event loop faster)
function batchProcess(items, processor) {
    let i = 0;
    function processChunk() {
        const chunk = items.slice(i, i + 1000);
        for (const item of chunk) processor(item);
        i += 1000;
        if (i < items.length) {
            queueMicrotask(processChunk);  // schedule next chunk as a microtask
        }
    }
    processChunk();
}

// ── Use case: schedule after current synchronous work, before render ──
queueMicrotask(() => {
    // Runs after current sync code, before the browser paints
    // Useful for updating DOM without causing a flash
    element.textContent = "updated";
});

// ── Comparison: queueMicrotask vs setTimeout ──
queueMicrotask(() => console.log("microtask"));  // runs after current task, before next macrotask
setTimeout(() => console.log("macrotask"), 0);   // runs after next macrotask
console.log("sync");
// Output: sync, microtask, macrotask
// Microtask is higher priority (runs first, before setTimeout)
```
::

## Anti-Pattern: Blocking the Event Loop

::code-wrapper{language="javascript"}
```javascript
// ❌ NAIVE — synchronous CPU-bound work blocks the event loop
function heavyCompute(n) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Math.sqrt(i);
    return sum;
}
// heavyCompute(1_000_000_000);  // blocks the event loop for seconds — no UI updates, no timers

// ✅ CORRECT — chunk the work with setTimeout to yield to the event loop
async function chunkedCompute(n, chunkSize = 10_000) {
    let sum = 0;
    let i = 0;
    return new Promise(resolve => {
        function chunk() {
            const end = Math.min(i + chunkSize, n);
            for (; i < end; i++) sum += Math.sqrt(i);
            if (i < n) {
                setTimeout(chunk, 0);  // yield — lets timers/UI/IO run between chunks
            } else {
                resolve(sum);
            }
        }
        chunk();
    });
}
// chunkedCompute(1_000_000_000).then(console.log);  // UI stays responsive

// ✅ BEST — use a Web Worker (true parallelism, doesn't block the main thread)
// main.js:
// const worker = new Worker("./compute-worker.js");
// worker.postMessage(1_000_000_000);
// worker.onmessage = (e) => console.log("result:", e.data);

// compute-worker.js:
// self.onmessage = (e) => {
//     let sum = 0;
//     for (let i = 0; i < e.data; i++) sum += Math.sqrt(i);
//     self.postMessage(sum);
// };
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── Promise.resolve().then() as a microtask scheduler ──
Promise.resolve().then(() => console.log("microtask via Promise"));
// Same as queueMicrotask but uses a Promise (slightly more overhead, but more compatible)

// ── scheduler.yield() (Chrome 129+) — modern way to yield ──
async function yieldToEventLoop() {
    if (typeof scheduler !== "undefined" && scheduler.yield) {
        await scheduler.yield();  // higher priority than setTimeout (runs sooner)
    } else {
        await new Promise(r => setTimeout(r, 0));  // fallback
    }
}

// ── AbortController for cancellable async operations ──
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);  // abort after 5s
fetch("/api/data", { signal: controller.signal })
    .then(r => r.json())
    .catch(err => {
        if (err.name === "AbortError") console.log("aborted");
        else throw err;
    });

// ── Measuring event loop latency (Node.js) ──
// Node only:
// let last = process.hrtime.bigint();
// setInterval(() => {
//     const now = process.hrtime.bigint();
//     const lag = Number(now - last) / 1e6 - 1000;  // ms over expected
//     console.log("event loop lag:", lag, "ms");
//     last = now;
// }, 1000);
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── setTimeout(fn, 0) doesn't run immediately — it's a macrotask ──
// It runs after the current script AND all queued microtasks complete.
console.log("A");
setTimeout(() => console.log("C"), 0);
Promise.resolve().then(() => console.log("B"));
console.log("D");
// Output: A, D, B, C (B is microtask — runs before C which is macrotask)

// ── setInterval drift: timer doesn't fire at exact intervals ──
// setInterval fires AFTER the macrotask queue processes it, not at exact intervals.
// If the event loop is busy, intervals are delayed.
// Use a self-correcting timer:
let expected = Date.now();
function accurateInterval(fn, delay) {
    function tick() {
        const drift = Date.now() - expected;
        fn(drift);  // pass drift so the callback can adjust
        expected += delay;
        setTimeout(tick, Math.max(0, delay - drift));  // correct for drift
    }
    setTimeout(tick, delay);
}

// ── Microtasks can starve macrotasks (infinite loop) ──
// A microtask that adds another microtask never lets macrotasks run.
// Don't create infinite microtask chains.

// ── `await` yields to the event loop (it's a microtask boundary) ──
async function f() {
    console.log("A");
    await Promise.resolve();  // yields — microtasks/timers can run here
    console.log("B");
}
f();
console.log("C");
// Output: A, C, B (await suspends, C runs, then B resumes as a microtask)

// ── `requestAnimationFrame` runs before paint, not on the event loop tick ──
// rAF callbacks run in the render phase (after microtasks, before paint).
// They're not macrotasks — they run at the browser's frame rate (~60fps).
```
::

## 🧠 Quick Quiz

What's the output order?

::code-wrapper{language="javascript"}
```javascript
console.log("1");
setTimeout(() => console.log("2"), 0);
Promise.resolve().then(() => console.log("3"));
console.log("4");
queueMicrotask(() => console.log("5"));
```
::

<details>
<summary>Answer</summary>

```
1
4
3
5
2
```

1. `1` — synchronous (script is the current macrotask)
2. `4` — synchronous (continues)
3. `3` — microtask (Promise.then — drained after script)
4. `5` — microtask (queueMicrotask — same microtask drain)
5. `2` — macrotask (setTimeout — runs after all microtasks are drained)

**The lesson**: all microtasks (Promise.then, queueMicrotask) run before the next macrotask (setTimeout). The microtask queue is fully drained before the event loop proceeds to the next macrotask.

</details>