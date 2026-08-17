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
::

## 💡 Tips & Tricks

**`{ once: true }` replaces manual removeEventListener** — `el.addEventListener('click', handler, { once: true })` auto-detaches after firing once — no need to save a reference just to call `removeEventListener` inside the handler.

**`{ passive: true }` speeds up scroll/touch listeners** — Telling the browser upfront that you won't call `preventDefault()` lets it start scrolling immediately instead of waiting for your handler to finish — a real, measurable win on touch devices.

**AbortController cancels multiple listeners at once** — Pass the same `{ signal }` to several `addEventListener` calls, then call `controller.abort()` once to remove all of them — cleaner than tracking each handler reference for cleanup.

**Debug listeners with `getEventListeners()`** — In Chrome DevTools console, `getEventListeners(el)` lists every listener attached to an element, grouped by event type — invaluable when you don't know what's already wired up.

**Dispatch synthetic events for testing** — `el.dispatchEvent(new MouseEvent('click', { bubbles: true }))` triggers real listener logic in tests without simulating actual user input.

## ⚠️ Edge Cases & Gotchas

**`removeEventListener` needs the exact same function reference** — `button.addEventListener('click', () => foo())` followed by `button.removeEventListener('click', () => foo())` does nothing — the second arrow function is a different object in memory, even though it looks identical.

**`stopPropagation()` does not stop `preventDefault()`, and vice versa** — They control unrelated things: propagation (whether the event continues to bubble/capture) and default browser behavior (like following a link or submitting a form). Stopping one doesn't stop the other; a common bug is calling only `stopPropagation()` and being surprised a form still submits.

**Passive listeners silently ignore `preventDefault()`** — Calling `e.preventDefault()` inside a listener registered with `{ passive: true }` does nothing and, in most browsers, logs a console warning instead of throwing — scrolling continues even though your code "cancelled" it.

**Event delegation breaks with `stopPropagation()` on children** — If a child element calls `e.stopPropagation()`, a delegated listener on an ancestor never fires, because the event never bubbles that far — a subtle bug when combining delegation with third-party widgets that stop propagation internally.

**`this` inside an arrow-function listener is not the element** — `button.addEventListener('click', () => console.log(this))` logs the enclosing scope's `this` (often `undefined` or the module), not the button — unlike a regular `function` listener, where `this` is `event.currentTarget`.

## 🧠 Spot the Bug

What gets logged when the button is clicked?

::code-wrapper{language="javascript"}
```javascript
const outer = document.querySelector('#outer')
const inner = document.querySelector('#inner')

outer.addEventListener('click', () => console.log('outer handler'))

inner.addEventListener('click', (e) => {
  console.log('inner handler')
  e.stopPropagation()
})

inner.addEventListener('click', (e) => {
  e.preventDefault()
  console.log('inner handler 2 — did preventDefault stop this from running?')
})
```
::

<details>
<summary>Answer</summary>

Clicking `#inner` logs all three lines except `'outer handler'`: `'inner handler'` and `'inner handler 2...'` both print because multiple listeners on the *same* element all run regardless of `stopPropagation()` — only `stopImmediatePropagation()` would prevent sibling listeners on the same element from firing. `stopPropagation()` only stops the event from reaching `#outer`, so `'outer handler'` never logs. `preventDefault()` in the second listener has no effect on whether other listeners run — it only suppresses default browser behavior (like following a link).

**The lesson**: `stopPropagation` blocks bubbling to ancestors, `stopImmediatePropagation` also blocks other listeners on the same element, and `preventDefault` blocks neither — they're three independent controls.

</details>

## Key Takeaways

- Use event delegation — one parent listener handles all children dynamically.
- `closest()` finds the nearest matching ancestor — essential for delegation.
- `stopPropagation` prevents bubbling; `preventDefault` prevents default behavior.
- Custom events with `CustomEvent` + `detail` enable pub/sub patterns.
- `{ once: true }` auto-removes the listener — no manual cleanup needed.