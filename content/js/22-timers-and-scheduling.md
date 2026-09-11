---
title: "JavaScript 22 — Timer Internals: setTimeout Drift, requestAnimationFrame & Scheduling Patterns"
description: "Deep-dive into JavaScript timers: setTimeout/setInterval drift and accuracy, requestAnimationFrame for smooth animation, debounce and throttle implementation, and AbortController for timer cleanup. Code-first reference for senior engineers."
---

# 22 — Timer Internals: setTimeout Drift, requestAnimationFrame & Scheduling Patterns

## `setTimeout` / `setInterval`: Accuracy and Drift

::code-wrapper{language="javascript"}
```javascript
// ── setTimeout: schedule a macrotask after a delay (minimum ~4ms in browsers) ──
setTimeout(() => console.log("runs after ~1000ms"), 1000);

// ── ⚠️ setTimeout is NOT precise — it's a minimum, not exact ──
// The timer fires AFTER the delay, when the event loop reaches the macrotask queue.
// If the main thread is busy, the timer fires late.

// ── setTimeout(fn, 0) doesn't run immediately ──
setTimeout(() => console.log("C"), 0);
console.log("A");
Promise.resolve().then(() => console.log("B"));
console.log("D");
// Output: A, D, B, C
// C runs last — setTimeout is a macrotask (after all microtasks)

// ── setInterval drift: intervals accumulate error ──
let expected = Date.now();
setInterval(() => {
    const drift = Date.now() - expected;
    console.log("drift:", drift, "ms");
    expected += 1000;  // adjust for the expected time (not the actual)
    // If the callback takes time, the interval drifts (each tick is late by the previous work)
}, 1000);
// setInterval fires at 1s intervals, but if each callback takes 200ms:
// Tick 1: fires at 1000ms, callback takes 200ms → ends at 1200ms
// Tick 2: fires at 2000ms (not 1200+1000=2200 — setInterval targets the original schedule)
// BUT: if the main thread is blocked, the next tick is delayed.

// ── Self-correcting timer (no drift) ──
function accurateInterval(fn, delay) {
    let expected = Date.now() + delay;
    function tick() {
        const drift = Date.now() - expected;  // how late are we?
        fn(drift);  // pass drift to the callback
        expected += delay;  // next expected time
        setTimeout(tick, Math.max(0, delay - drift));  // correct for drift
    }
    setTimeout(tick, delay);
}
```
::

## `requestAnimationFrame`: Sync with Display Refresh

::code-wrapper{language="javascript"}
```javascript
// ── requestAnimationFrame: runs before the browser paints (synced to refresh rate) ──
// ~60fps on most displays (16.67ms per frame), 120fps on some (8.33ms per frame).
// Use for animations — smooth and efficient (pauses when tab is hidden).

let start = performance.now();
function animate(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / 1000, 1);  // 0 → 1 over 1 second
    element.style.opacity = progress;  // fade in
    if (progress < 1) {
        requestAnimationFrame(animate);  // schedule next frame
    }
}
requestAnimationFrame(animate);  // start the animation

// ── ❌ Don't use setInterval for animations ──
setInterval(() => {
    element.style.left = parseInt(element.style.left || 0) + 1 + "px";
}, 16);  // ~60fps, but NOT synced with the display → jank, frame drops
// setInterval runs on the event loop (macrotask) — not aligned with paint.
// rAF runs just before paint — the browser can optimize rendering.

// ── Cancel animation ──
let animationId = requestAnimationFrame(animate);
cancelAnimationFrame(animationId);  // stop the animation

// ── requestIdleCallback: run work during idle time (low priority) ──
requestIdleCallback((deadline) => {
    // deadline.timeRemaining() → ms left in the current idle period
    while (deadline.timeRemaining() > 0 && tasks.length > 0) {
        processTask(tasks.shift());
    }
    if (tasks.length > 0) {
        requestIdleCallback(processTasks);  // continue in next idle period
    }
}, { timeout: 2000 });  // must run within 2s (even if never idle)
```
::

## Debounce and Throttle (Production Implementations)

::code-wrapper{language="javascript"}
```javascript
// ── Debounce: delay execution until calls stop for `delay` ms ──
// Use for: search input, resize, text change (only run after user stops typing)
function debounce(fn, delay, { leading = false, trailing = true } = {}) {
    let timer = null;
    let lastArgs = null;
    return function(...args) {
        lastArgs = args;
        // Leading edge: run immediately on first call (if no pending timer)
        if (leading && timer === null) {
            fn.apply(this, args);
        }
        clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            if (trailing) fn.apply(this, lastArgs);  // run with the latest args
        }, delay);
    };
}
const search = debounce(query => fetchData(query), 300);
input.addEventListener("input", () => search(input.value));
// Type "hello" quickly: only fires once after 300ms of no typing (with "hello")

// ── Throttle: limit execution to once per `limit` ms ──
// Use for: scroll, mousemove, resize (limit the rate of a high-frequency event)
function throttle(fn, limit, { leading = true, trailing = true } = {}) {
    let lastRun = 0;
    let timer = null;
    let lastArgs = null;
    return function(...args) {
        const now = Date.now();
        const remaining = limit - (now - lastRun);
        lastArgs = args;
        if (remaining <= 0 || remaining > limit) {
            // Enough time passed → run now
            if (timer) { clearTimeout(timer); timer = null; }
            lastRun = now;
            if (leading) fn.apply(this, args);
        } else if (!timer && trailing) {
            // Schedule trailing call
            timer = setTimeout(() => {
                lastRun = Date.now();
                timer = null;
                fn.apply(this, lastArgs);
            }, remaining);
        }
    };
}
const onScroll = throttle(() => updateIndicator(), 100);
window.addEventListener("scroll", onScroll);
// Scroll fast: fires at most every 100ms (not on every pixel)

// ── Debounced with immediate leading + trailing ──
const save = debounce(saveData, 1000, { leading: true, trailing: true });
// First call: runs immediately (leading). Subsequent calls within 1s: last one runs after 1s (trailing).
```
::

## Anti-Pattern: Uncleaned Timers (Memory Leaks)

::code-wrapper{language="javascript"}
```javascript
// ❌ NAIVE — timers keep running after the component is removed (memory leak)
function setupCarousel() {
    setInterval(() => {
        nextSlide();  // runs forever — even after the carousel is removed
    }, 5000);
}
// When the carousel is removed from the DOM, the interval still runs.
// If the callback references DOM elements, they can't be GC'd → memory leak.

// ✅ CORRECT — store the timer ID and clear it on cleanup
function setupCarousel() {
    const intervalId = setInterval(nextSlide, 5000);
    return () => clearInterval(intervalId);  // return cleanup function
}
const cleanup = setupCarousel();
// Later (when the carousel is removed):
cleanup();  // clearInterval — timer stops, references released, GC can collect

// ✅ BEST — use AbortController (modern, handles multiple timers + events)
function setupCarousel(signal) {
    const intervalId = setInterval(nextSlide, 5000);
    signal.addEventListener("abort", () => clearInterval(intervalId));
}
const controller = new AbortController();
setupCarousel(controller.signal);
// Later: controller.abort();  // stops the timer (and any other resources on the same signal)

// ── clearTimeout for setTimeout (same pattern) ──
const timeoutId = setTimeout(() => console.log("runs once"), 5000);
clearTimeout(timeoutId);  // cancel before it runs
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── `await setTimeout` (promisified) ──
const delay = (ms) => new Promise(r => setTimeout(r, ms));
await delay(2000);  // pause for 2s

// ── Polling with exponential backoff ──
async function poll(url, { maxAttempts = 10, baseDelay = 1000 } = {}) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const response = await fetch(url);
            if (response.ok) return await response.json();
        } catch (e) {
            // network error — keep polling
        }
        await delay(baseDelay * 2 ** i);  // 1s, 2s, 4s, 8s, ...
    }
    throw new Error("polling failed after " + maxAttempts + " attempts");
}

// ── scheduler.yield (Chrome 129+) — yield to event loop with higher priority than setTimeout ──
async function yieldToEventLoop() {
    if (typeof scheduler !== "undefined" && scheduler.yield) {
        await scheduler.yield();  // runs sooner than setTimeout(0)
    } else {
        await delay(0);  // fallback to setTimeout
    }
}

// ── requestAnimationFrame for non-animation work (sync with frame) ──
function runBeforePaint(fn) {
    return new Promise(resolve => {
        requestAnimationFrame(() => { fn(); resolve(); });
    });
}

// ── setTimeout(fn, 0) vs queueMicrotask(fn) ──
// setTimeout: macrotask (runs after microtasks, slower)
// queueMicrotask: microtask (runs before macrotasks, faster)
// For "run after current code": queueMicrotask is faster (doesn't wait for the next tick).
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── setTimeout minimum delay is ~4ms (after 5 nested timers) ──
// In browsers: setTimeout(fn, 0) is clamped to ~4ms after 5 nested calls.
// setTimeout(fn, 0)  → ~4ms, not 0ms.
// queueMicrotask(fn) runs sooner (microtask — before the next macrotask).

// ── `this` inside setTimeout callback is global (not the enclosing object) ──
const obj = { name: "Alice", greet() { setTimeout(function() { console.log(this.name); }, 0); } };
obj.greet();  // undefined (this is global, not obj)
// Fix: arrow function (lexical this) or .bind(this)
obj.greet = function() { setTimeout(() => console.log(this.name), 0); };
obj.greet();  // "Alice" (arrow has lexical this)

// ── setInterval doesn't wait for the callback to finish ──
setInterval(async () => {
    await longRunningTask();  // takes 3s, interval is 1s
    // ⚠️ intervals pile up! After 3s, 3 pending callbacks queue up.
    // Fix: use self-scheduling setTimeout (recursive) instead of setInterval:
}, 1000);

// ── Timer callbacks are macrotasks (run after all microtasks) ──
setTimeout(() => console.log("timer"), 0);
Promise.resolve().then(() => console.log("promise"));
// Output: promise, timer (microtask runs first)

// ── Timers don't fire when the tab is hidden (throttled to 1/sec) ──
// In background tabs, setTimeout/setInterval are throttled to ~1/sec (battery saving).
// Use Web Workers for timers that must run at full speed in background.

// ── clearInterval doesn't cancel a callback that's already executing ──
// If the callback is running when you call clearInterval, it finishes.
// clearInterval only prevents FUTURE invocations.
```
::

## 🧠 Quick Quiz

Why does the `setInterval` callback not fire exactly every 1000ms?

::code-wrapper{language="javascript"}
```javascript
setInterval(() => {
    const start = Date.now();
    while (Date.now() - start < 300) {}  // block for 300ms
    console.log("tick");
}, 1000);
```
::

<details>
<summary>Answer</summary>

`setInterval` targets the **original schedule**, not the previous execution end time. The interval fires at 1000ms, 2000ms, 3000ms, etc. — regardless of how long each callback takes.

However, since each callback blocks the main thread for 300ms, and the timer is a macrotask, the actual firing time depends on when the event loop can process the timer:

- **Tick 1**: fires at 1000ms. Callback blocks until 1300ms.
- **Tick 2**: scheduled for 2000ms. The event loop is free at 1300ms. The timer fires at 2000ms (on schedule). Callback blocks until 2300ms.
- **Tick 3**: scheduled for 3000ms. Event loop free at 2300ms. Fires at 3000ms.

So the intervals fire roughly on schedule (1000ms apart), but if the callback takes **longer than the interval** (e.g., 1200ms with a 1000ms interval), the next tick fires immediately after the previous callback ends (they "stack up").

**The lesson**: `setInterval` doesn't wait for the previous callback to finish — it targets fixed intervals. If callbacks take longer than the interval, they pile up. Use recursive `setTimeout` instead if you need guaranteed gaps:

```javascript
function tick() {
    const start = Date.now();
    while (Date.now() - start < 300) {}
    console.log("tick");
    setTimeout(tick, 1000);  // schedule next AFTER this one finishes (guaranteed 1000ms gap)
}
setTimeout(tick, 1000);
```

</details>