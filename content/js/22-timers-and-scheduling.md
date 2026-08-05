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

## Key Takeaways

- `setInterval` drifts — use recursive `setTimeout` for precise timing.
- `requestAnimationFrame` for visual animations — synced with repaint, pauses on hidden tabs.
- Debounce: wait until activity stops (search, resize). Throttle: limit rate (scroll, mousemove).