# 20 — Events

## AddEventListener

::code-wrapper{language="javascript"}
```javascript
const button = document.querySelector('button')

// Basic
button.addEventListener('click', (event) => {
  console.log(event.target)  // the clicked element
  console.log(event.currentTarget)  // the element with listener
})

// Options
button.addEventListener('click', handler, { once: true })  // auto-remove after first
button.addEventListener('click', handler, { passive: true })  // won't call preventDefault
button.addEventListener('click', handler, { capture: true })  // capture phase

// Remove
button.removeEventListener('click', handler)  // must be same reference
```

::

## Bubbling and Capturing

::code-wrapper{language="javascript"}
```javascript
// Event flows: capture (down) → target → bubbling (up)
//                               parent
//                                 ↓ (capture)
//                              child ← target
//                                 ↑ (bubble)
//                              parent

// Capture phase — top to target
parent.addEventListener('click', e => {
  console.log('Capture: parent')
}, { capture: true })

// Bubble phase — target to top (default)
parent.addEventListener('click', e => {
  console.log('Bubble: parent')
})

// Stop propagation
button.addEventListener('click', e => {
  e.stopPropagation()  // event won't bubble to parent
})

// stopImmediatePropagation — also stops other listeners on same element
button.addEventListener('click', e => {
  e.stopImmediatePropagation()
})
```

::

## Event Delegation

::code-wrapper{language="javascript"}
```javascript
// ✅ Delegate: one listener for many children
const list = document.querySelector('ul')
list.addEventListener('click', (e) => {
  const item = e.target.closest('li')
  if (!item) return
  console.log('Clicked:', item.dataset.id)
})

// ❌ Anti-pattern: attach to each item
items.forEach(item => {
  item.addEventListener('click', handler)  // 1000 listeners!
})

// ✅ closest() matches the element or its ancestors
e.target.closest('.button')  // nearest ancestor matching selector
```

::

## Custom Events

::code-wrapper{language="javascript"}
```javascript
// Dispatch
const event = new CustomEvent('userLogin', {
  detail: { userId: 123, name: 'Alice' },
  bubbles: true
})
document.dispatchEvent(event)

// Listen
document.addEventListener('userLogin', (e) => {
  console.log('User logged in:', e.detail.name)
})
```

::

## Key Takeaways

- Use event delegation — one parent listener handles all children dynamically.
- `closest()` finds the nearest matching ancestor — essential for delegation.
- `stopPropagation` prevents bubbling; `preventDefault` prevents default behavior.
- Custom events with `CustomEvent` + `detail` enable pub/sub patterns.
- `{ once: true }` auto-removes the listener — no manual cleanup needed.