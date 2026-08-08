# 26 — Performance & Optimization

## Debounce and Throttle

::code-wrapper{language="javascript"}
```javascript
// Debounce — search input, resize
const debounce = (fn, ms) => {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

// Throttle — scroll, mousemove
const throttle = (fn, ms) => {
  let last = 0
  return (...args) => {
    const now = Date.now()
    if (now - last >= ms) {
      last = now
      fn(...args)
    }
  }
}
```

::

## Lazy Loading

::code-wrapper{language="javascript"}
```javascript
// Dynamic import — load code on demand
button.addEventListener('click', async () => {
  const { heavyCompute } = await import('./heavy.js')
  heavyCompute(data)
})

// IntersectionObserver — lazy load images
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target
      img.src = img.dataset.src
      observer.unobserve(img)
    }
  })
})
document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img))
```

::

## Memory Leaks

::code-wrapper{language="javascript"}
```javascript
// ❌ Forgotten intervals
function startTimer() {
  setInterval(() => updateUI(), 1000)
  // never cleared → leak
}

// ✅ Save reference and clear
const id = setInterval(() => updateUI(), 1000)
// when done:
clearInterval(id)

// ❌ Closure holding large data
function bad() {
  const huge = new Array(1e6).fill(0)
  return () => huge.length  // huge kept alive forever
}

// ❌ Detached DOM nodes
const el = document.createElement('div')
document.body.appendChild(el)
document.body.removeChild(el)
// el still referenced in JS → can't be GC'd if variable persists
```

::

## 💡 Tips & Tricks

**Chrome's Performance panel flame chart pinpoints slow functions** — Record a profile, look for wide yellow blocks (scripting) stacked deep — the widest bar at the bottom of a tall stack is usually the real bottleneck, not the function on top.

**`performance.mark()` / `performance.measure()` beat manual `Date.now()` diffing** — `performance.mark('start'); doWork(); performance.mark('end'); performance.measure('work', 'start', 'end')` integrates with DevTools' Performance panel timeline directly, so measurements show up visually alongside browser work.

**WeakMap/WeakSet avoid leaks in caches keyed by objects** — Using a `Map` to cache data keyed by DOM elements keeps those elements alive forever, even after removal from the page; a `WeakMap` lets them be garbage collected once no other reference exists.

**`will-change` and `transform`/`opacity` keep animations off the main thread** — Animating `left`/`top` triggers layout on every frame; animating `transform: translateX()` can run on the compositor thread, staying smooth even when JS is busy.

**Heap snapshots diff to find real leaks** — Take two heap snapshots in DevTools before and after a suspected leaking action (e.g. opening/closing a modal 10 times), then use the "Comparison" view — objects with a growing count that should have been freed point directly at the leak.

## ⚠️ Edge Cases & Gotchas

**Throttle's last call can be dropped entirely** — The simple throttle implementation shown only fires on the *leading* edge of each window — if the user's last scroll event lands inside the "ignore" period, no trailing call ever fires, and the UI can end up visually stuck one update behind the actual scroll position.

**Debounce with `delay: 0` still defers to the next tick** — `debounce(fn, 0)` doesn't run synchronously; it still goes through `setTimeout`, so code relying on it running "immediately" within the same synchronous block will see stale state.

**Closures over loop variables can leak entire large arrays** — A callback created inside a loop that references any variable from an enclosing scope keeps the *entire* scope alive, not just the variable it uses — so a huge unrelated array declared alongside a small counter can be kept alive by a single lingering event listener referencing that scope.

**`IntersectionObserver` callbacks can fire after the element is removed** — If an element is removed from the DOM between being observed and the callback firing, the entry's `target` still resolves, but code that assumes the element is visible/attached (e.g. reading `getBoundingClientRect()` results as current layout) can act on stale geometry.

**Detached DOM nodes aren't visible in `document.body` but still count as leaks** — `document.body.removeChild(el)` removes `el` from the visible tree, but if any JS variable, closure, or event listener still references `el`, the entire subtree stays in memory — DevTools' Elements panel won't show it, only a heap snapshot will.

## 🧠 Spot the Bug

Why does the counter stop updating correctly under heavy scrolling?

::code-wrapper{language="javascript"}
```javascript
function throttle(fn, ms) {
  let last = 0
  return (...args) => {
    const now = Date.now()
    if (now - last >= ms) {
      last = now
      fn(...args)
    }
  }
}

let scrollPosition = 0
const updateUI = throttle(() => {
  console.log('UI synced to', scrollPosition)
}, 200)

window.addEventListener('scroll', () => {
  scrollPosition = window.scrollY
  updateUI()
})
```
::

<details>
<summary>Answer</summary>

While the user is actively scrolling, `updateUI` fires roughly every 200ms — reasonably in sync. But the moment scrolling *stops*, no further scroll events fire, so `updateUI` never runs again — even though `scrollPosition` changed one last time on the final scroll event that landed inside the throttle window and got dropped. The UI is left displaying a stale position from up to 200ms before the user actually stopped.

**The lesson**: leading-edge-only throttle can drop the final update in a burst — add a trailing call (`setTimeout` to fire once more after the throttle window if a call was suppressed) whenever the last value in a burst matters, such as syncing UI to final scroll position.

</details>

## Key Takeaways

- Debounce for bursty events (typing, resize); throttle for continuous events (scroll).
- Dynamic `import()` enables code splitting — load heavy code on demand.
- Always clean up: `clearInterval`, `removeEventListener`, `observer.disconnect()`.
- Avoid closures that capture large unused data — null out references.