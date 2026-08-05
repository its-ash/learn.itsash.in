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

## Key Takeaways

- Debounce for bursty events (typing, resize); throttle for continuous events (scroll).
- Dynamic `import()` enables code splitting — load heavy code on demand.
- Always clean up: `clearInterval`, `removeEventListener`, `observer.disconnect()`.
- Avoid closures that capture large unused data — null out references.