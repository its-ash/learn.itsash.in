# 22 — Timers & Scheduling

## `setTimeout` / `setInterval`

::code-wrapper{language="javascript"}
```javascript
// setTimeout — run once after delay
const id = setTimeout(() => console.log('After 1s'), 1000)
clearTimeout(id)  // cancel

// setInterval — repeat every interval
const intervalId = setInterval(() => console.log('Tick'), 2000)
clearInterval(intervalId)  // stop

// ⚠️ setInterval drift — actual interval may be longer
// ⚠️ setInterval doesn't wait for previous call to finish

// ✅ Recursive setTimeout — self-correcting
function scheduleNext() {
  setTimeout(() => {
    doWork()
    scheduleNext()  // schedule after work completes
  }, 1000)
}
scheduleNext()
```
::
::

## `requestAnimationFrame`

::code-wrapper{language="javascript"}
```javascript
// For animations — synced with browser repaint (60fps)
function animate() {
  element.style.left = `${pos++}px`
  if (pos < 500) requestAnimationFrame(animate)
}
requestAnimationFrame(animate)

// Cancel
const id = requestAnimationFrame(animate)
cancelAnimationFrame(id)
```
::
::

## Debounce & Throttle

::code-wrapper{language="javascript"}
```javascript
// Debounce — delay until activity stops
function debounce(fn, delay) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

// Throttle — limit to once per interval
function throttle(fn, limit) {
  let inThrottle = false
  return (...args) => {
    if (inThrottle) return
    fn(...args)
    inThrottle = true
    setTimeout(() => inThrottle = false, limit)
  }
}

// Usage
input.addEventListener('input', debounce(searchAPI, 300))
window.addEventListener('scroll', throttle(updateUI, 100))
```
::
::

## 💡 Tips & Tricks

**`setTimeout(fn, 0)` still waits for the current call stack to clear** — It doesn't run "immediately" — it queues a macrotask that runs only after the current synchronous code and all pending microtasks (promises) finish. Use it to defer work until after the browser has a chance to paint or respond to input.

**Debug scheduled work with `console.trace()`** — Dropping `console.trace()` inside a `setTimeout`/`setInterval` callback shows exactly which code path scheduled it — useful when a timer fires unexpectedly and you can't tell who set it up.

**`requestIdleCallback` for genuinely low-priority work** — Unlike `setTimeout`, `requestIdleCallback(fn)` only runs when the browser is idle, making it ideal for analytics pings or prefetching that shouldn't compete with rendering.

**Named debounce/throttle wrappers keep call sites readable** — Store the debounced function once (`const debouncedSearch = debounce(searchAPI, 300)`) rather than creating a new one per render — otherwise you lose the shared `timer` closure and debouncing stops working entirely.

**Clear timers in cleanup functions, not just on success paths** — In frameworks (React `useEffect`, Vue `onUnmounted`), always return/register a cleanup that calls `clearTimeout`/`clearInterval` — timers set in a component that unmounts before firing otherwise leak and can update state on a dead component.

## ⚠️ Edge Cases & Gotchas

**`setInterval` doesn't wait for slow callbacks to finish** — If the callback takes longer than the interval, calls can queue up and fire back-to-back the moment the main thread frees up, effectively removing the "interval" — recursive `setTimeout` avoids this by scheduling the next call only after the current one completes.

**Minimum delay is clamped, especially when nested** — Browsers clamp nested timeouts (a timeout set inside another timeout, 5+ levels deep) to a minimum of 4ms even if you request `0`, and background/inactive tabs can throttle timers to once per second or slower to save battery.

**`this` inside a regular `function` timer callback is not what you expect** — `setTimeout(function() { console.log(this) }, 100)` logs the global object (or `undefined` in strict mode), not the object that scheduled it — because `setTimeout` invokes the callback as a plain function call, not a method call. Arrow functions avoid this by inheriting `this` lexically.

**`clearTimeout`/`clearInterval` on an already-fired or invalid ID is a silent no-op** — There's no error, no warning — calling `clearInterval(999999)` on a nonexistent ID simply does nothing, which can mask bugs where you cleared the wrong variable.

**`requestAnimationFrame` pauses entirely in background tabs** — Unlike `setInterval`, which keeps ticking (throttled) in a hidden tab, `requestAnimationFrame` callbacks stop firing completely until the tab regains focus — an animation loop built purely on rAF silently "freezes" and resumes later, which is usually desired but surprises anyone expecting continuous ticking.

## 🧠 Spot the Bug

What's the observed behavior, and why?

::code-wrapper{language="javascript"}
```javascript
function poll() {
  console.log('fetching...')
  setInterval(() => {
    slowNetworkCall()
  }, 1000)
}
poll()

function slowNetworkCall() {
  const start = Date.now()
  while (Date.now() - start < 3000) {}
  console.log('done at', Date.now())
}
```
::

<details>
<summary>Answer</summary>

Even though the interval is set to 1000ms, `slowNetworkCall` blocks the single JS thread for 3000ms every time it runs. `setInterval` keeps trying to fire every second, but since JavaScript is single-threaded, those extra ticks can't run concurrently — they queue up and fire back-to-back as soon as the thread is free, producing a burst of calls instead of one call per second. The interval never actually achieves a steady 1-second cadence.

**The lesson**: use recursive `setTimeout` (schedule the next call only after the current one finishes) whenever the callback's duration might approach or exceed the interval — it self-corrects instead of piling up queued calls.

</details>

## Key Takeaways

- `setInterval` drifts — use recursive `setTimeout` for precise timing.
- `requestAnimationFrame` for visual animations — synced with repaint, pauses on hidden tabs.
- Debounce: wait until activity stops (search, resize). Throttle: limit rate (scroll, mousemove).