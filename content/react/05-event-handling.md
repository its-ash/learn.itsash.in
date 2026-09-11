---
title: "05 — Event Handling"
description: "Synthetic events, event delegation architecture, handler binding patterns, preventDefault/stopPropagation in production, debouncing, and the React 17 root-attachment change. Code-first reference for mid-to-senior React engineers."
---

# 05 — Event Handling

## Synthetic Events: What React Wraps and Why

::code-wrapper{language="javascript" filename="synthetic_event_anatomy.js"}
```javascript
// React wraps native DOM events in a cross-browser SyntheticEvent.
// It pools and normalizes browser differences — you never write
// `if (event.srcElement)` or `if (event.target)` cross-browser guards.

function SearchForm() {
  function handleSubmit(event) {
    // SyntheticEvent — same API surface as the native Event interface:
    event.preventDefault()    // stop the browser's default action (form navigation)
    event.stopPropagation()   // stop bubbling to ancestor handlers
    event.target              // the actual DOM element that triggered (could be deeply nested)
    event.currentTarget       // always the element the handler is attached to
    event.nativeEvent         // the raw browser Event object if you need it
    event.isDefaultPrevented() // boolean — has preventDefault been called?
    event.isPropagationStopped()

    const query = new FormData(event.currentTarget).get('query')
    console.log('Searching for:', query)
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="query" type="text" />
      <button type="submit">Search</button>
    </form>
  )
}
```
::

### `target` vs. `currentTarget` — The Delegate's Trap

::code-wrapper{language="javascript" filename="target_vs_currenttarget.js"}
```javascript
// event.target       = the element the user ACTUALLY interacted with (could be a child)
// event.currentTarget = the element the HANDLER is attached to (always the same element)

function IconButton({ onActivate }) {
  return (
    <button onClick={(e) => {
      // If the user clicks the <svg> icon or the <span> text:
      console.log(e.target)        // → <svg> or <span> (the actual click target)
      console.log(e.currentTarget) // → <button> (where onClick is registered)
      onActivate()
    }}>
      <svg /><span>Delete</span>
    </button>
  )
}

// PRODUCTION PATTERN: use currentTarget when you need the handler's element,
// target when you need to know what was actually clicked (event delegation).
// Mixing them up is the #1 source of "wrong element" bugs in icon-heavy UIs.
```
::

## React 17+ Event Delegation Architecture

::code-wrapper{language="javascript" filename="event_delegation_architecture.js"}
```javascript
// ── REACT ≤16: single listener on document ────────────────────────────
// React attached ONE listener per event type to `document` and dispatched
// synthetic events from there. Fast (one listener vs thousands), but broke
// isolation when multiple React trees or non-React widgets shared a page.

// ── REACT 17+: listener on the root container ─────────────────────────
// React attaches listeners to the root DOM container (the element passed
// to createRoot). Each React tree is isolated — no cross-tree event stealing.

// You NEVER write this manually — React does it internally:
// createRoot(document.getElementById('root')).render(<App />)
//   → rootContainerElement.addEventListener('click', dispatchToSyntheticSystem)
//   → rootContainerElement.addEventListener('change', dispatchToSyntheticSystem)
//   → ...one per supported event type, attached ONCE at the root.

// WHY THIS MATTERS:
// 1. Multiple React versions on one page (microfrontends) — each tree's
//    events are scoped to its own root, not the global document.
// 2. Non-React widgets (legacy jQuery, vanilla JS) on the same page —
//    React no longer intercepts their events at the document level.
// 3. Event pooling was removed in React 17 — SyntheticEvent objects are
//    no longer recycled, so accessing them asynchronously is safe.
```
::

## Handler Binding: Reference vs. Invocation

::code-wrapper{language="javascript" filename="handler_binding_anti_pattern.js"}
```javascript
// ANTI-PATTERN: calling the function during render instead of passing a reference
// onClick={doSomething()} invokes doSomething IMMEDIATELY during render.
// Whatever it returns (probably undefined) becomes the onClick handler.
// The button is now inert — no error, no warning, just silence.

function BadButton({ onDelete, item }) {
  return <button onClick={onDelete(item.id)}>Delete</button>
  // onDelete(item.id) runs during EVERY render, not on click.
  // If onDelete mutates state → infinite loop or immediate deletion.
}
```
::

::code-wrapper{language="javascript" filename="handler_binding_production.js"}
```javascript
// PRODUCTION: pass a reference, not an invocation

// 1. No arguments → pass the function reference directly (no parens)
<button onClick={doSomething}>Click</button>

// 2. Arguments needed → wrap in an arrow function (creates a new fn per render)
<button onClick={() => deleteItem(item.id)}>Delete</button>

// 3. Handler factory → returns a stable function reference
function makeDeleteHandler(id) {
  return () => deleteItem(id)
}
<button onClick={makeDeleteHandler(item.id)}>Delete</button>

// 4. bind() — also creates a new function per render, same as arrow fn
<button onClick={deleteItem.bind(null, item.id)}>Delete</button>

// APPROACHES 2 AND 4 create a new function on every render. For most components
// this is fine. It only matters when the child is React.memo'd AND the handler
// is in the dependency array of a useEffect/useCallback. See Chapter 9.
```
::

### Production Pattern: List Item Handlers

::code-wrapper{language="javascript" filename="list_item_handlers.js"}
```javascript
function TodoList({ todos, onToggle, onDelete }) {
  return (
    <ul>
      {todos.map(todo => (
        <li key={todo.id}>
          <input
            type="checkbox"
            checked={todo.done}
            onChange={() => onToggle(todo.id)}
          />
          <span>{todo.text}</span>
          <button onClick={() => onDelete(todo.id)}>Remove</button>
        </li>
      ))}
    </ul>
  )
}

// Every row creates two inline arrow functions per render. Fine for most apps.
// Premature optimization here is a common mistake — reach for useCallback (Ch 9)
// ONLY when you've measured a re-render problem with React DevTools Profiler.
```
::

## `preventDefault` Patterns

### Forms — The #1 React Beginner Bug

::code-wrapper{language="javascript" filename="prevent_default_form.js"}
```javascript
function LoginForm({ onSubmit }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(event) {
    event.preventDefault()  // CRITICAL: stops the browser's full-page navigation/reload
    // Without this, the browser navigates → all React state is wiped instantly.
    // The bug looks like "my app randomly resets" — not obviously form-related.
    onSubmit({ email, password })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={email} onChange={e => setEmail(e.target.value)} type="email" />
      <input value={password} onChange={e => setPassword(e.target.value)} type="password" />
      <button type="submit">Log In</button>
    </form>
  )
}
```
::

### Client-Side Routing — Intercepting Links

::code-wrapper{language="javascript" filename="prevent_default_link.js"}
```javascript
function CustomLink({ href, onNavigate, children }) {
  function handleClick(event) {
    event.preventDefault()  // stop the browser's real navigation (full reload)
    onNavigate(href)         // let a client-side router handle it (Chapter 19)
  }
  return <a href={href} onClick={handleClick}>{children}</a>
}
```
::

### Drag-and-Drop — The Silent Non-Fire

::code-wrapper{language="javascript" filename="prevent_default_dnd.js"}
```javascript
function DropZone({ onDrop }) {
  function handleDragOver(event) {
    event.preventDefault()
    // CRITICAL: without preventDefault on dragover, the browser's default
    // behavior is "do not allow drop here" — onDrop will NEVER fire.
    // This is the single most common "my drop handler doesn't work" cause.
  }
  function handleDrop(event) {
    event.preventDefault()
    const files = Array.from(event.dataTransfer.files)
    onDrop(files)
  }
  return <div onDragOver={handleDragOver} onDrop={handleDrop}>Drop files here</div>
}
```
::

## `stopPropagation` and Event Bubbling

::code-wrapper{language="javascript" filename="stop_propagation_modal.js"}
```javascript
// React synthetic events bubble like native DOM events, following the same tree order.
// stopPropagation() prevents ancestor handlers from firing.

function Modal({ onClose, children }) {
  return (
    <div className="overlay" onClick={onClose}>
      {/* Without stopPropagation, clicking inside the modal body
          bubbles up to the overlay's onClick and closes the modal. */}
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

// CAVEAT: stopPropagation blocks ALL ancestor listeners, not just the one
// you're avoiding. A modal's inner stopPropagation also prevents an analytics
// "track all clicks" listener higher in the tree from ever seeing that click.
// Use it deliberately, not reflexively — consider event.target checks instead
// if you only need to exclude specific elements.
```
::

::code-wrapper{language="javascript" filename="stop_propagation_alternative.js"}
```javascript
// ALTERNATIVE: check the target instead of stopping propagation.
// This lets analytics/other ancestors still see the event.

function Modal({ onClose, children }) {
  return (
    <div className="overlay" onClick={(e) => {
      // Only close if the click was on the overlay ITSELF, not a child
      if (e.target === e.currentTarget) onClose()
    }}>
      <div className="modal-body">
        {children}
      </div>
    </div>
  )
}
// This pattern preserves bubbling for other listeners while achieving
// the same "click outside to close" behavior.
```
::

## Debouncing High-Frequency Handlers

::code-wrapper{language="javascript" filename="debounce_search.js"}
```javascript
// High-frequency events (onScroll, onMouseMove, onChange hitting an API)
// need debouncing to avoid overwhelming the app or network.

function SearchBox({ onSearch }) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (query === '') return  // don't search on empty
    const timeoutId = setTimeout(() => onSearch(query), 300)
    return () => clearTimeout(timeoutId)  // cancels the previous timer on every keystroke
    // Cleanup runs BEFORE the next effect: every keystroke resets the 300ms timer.
    // The API call only fires 300ms after the user STOPS typing.
  }, [query, onSearch])

  return <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…" />
}
// This pattern (debounce via useEffect + setTimeout + cleanup) is covered in
// full in Chapter 6 — included here as the standard fix for "handler fires too often."
```
::

## Custom Hooks for Event Logic

::code-wrapper{language="javascript" filename="use_event_listener.js"}
```javascript
import { useEffect, useRef } from 'react'

// PRODUCTION PATTERN: reusable event listener hook for document/window-level events
// that need proper cleanup and optional element targeting.

function useEventListener(eventName, handler, element = window) {
  const savedHandler = useRef(handler)

  // Update the ref each render so the effect always has the latest handler
  // without needing to re-attach the listener (which would cause flicker).
  useEffect(() => {
    savedHandler.current = handler
  }, [handler])

  useEffect(() => {
    // SSR guard — window doesn't exist during server rendering
    if (!(element && element.addEventListener)) return

    const eventListener = (event) => savedHandler.current(event)
    element.addEventListener(eventName, eventListener)
    return () => element.removeEventListener(eventName, eventListener)
  }, [eventName, element])
}

// Usage:
// useEventListener('keydown', handleEscape)        // on window
// useEventListener('click', handleClick, ref.current) // on a specific element
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Idiom] Prefer event.currentTarget over event.target when you need "the element
// this handler is attached to" — especially for delegated click handlers on
// elements with nested icons/spans. target can be any descendant the user clicked.

// [Debug] If a form mysteriously reloads the page or app state resets on submit,
// check for a missing event.preventDefault() in onSubmit FIRST. It's the single
// most common cause of "my app just refreshed for no reason."

// [Performance] Inline arrow functions in onClick={() => doThing(id)} inside list
// items are NOT a performance problem for the vast majority of apps. Don't reach
// for useCallback until you've measured a re-render problem with the Profiler.

// [Idiom] Use onMouseEnter/onMouseLeave instead of onMouseOver/onMouseOut for hover
// UI — Enter/Leave doesn't bubble through children, avoiding flicker when the
// pointer crosses internal element boundaries within the hovered area.

// [Debug] When onKeyDown handlers "miss" certain keys, check whether the element
// is focusable — keyboard events require tabIndex={0} or a naturally focusable
// element (button, input, a[href]). A plain div won't receive keyboard events.

// [Idiom] For Ctrl/Cmd+S "save" shortcuts, use onKeyDown on a focusable container
// or document-level listener — and always preventDefault to stop the browser's
// native "Save Page" dialog.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] Forgetting event.preventDefault() in onSubmit reloads the page and
// wipes ALL state. The browser's default form behavior is a full navigation;
// React state doesn't survive it. The bug often looks unrelated to the form
// since the whole app remounts from scratch.

// [Gotcha] onClick={fn()} calls the function DURING RENDER, not on click.
// A very easy typo: onClick={handleDelete(id)} instead of onClick={() => handleDelete(id)}
// → handleDelete runs immediately on every render, and its return value (undefined)
// silently makes the button inert with NO error.

// [Gotcha] onChange in React fires on EVERY keystroke, not on blur/commit like
// plain HTML. Code ported from a non-React mental model expecting change to fire
// only on blur will see far more invocations than expected. This is deliberate —
// it underpins the controlled-input model (Chapter 14).

// [Gotcha] stopPropagation() inside a child can silently break unrelated ancestor
// logic — a modal's inner stopPropagation also prevents an analytics "track all
// clicks" listener higher in the tree from ever seeing that click. Consider
// target === currentTarget checks as a less destructive alternative.

// [Gotcha] Synthetic event objects were POOLED in React ≤16 and reused across
// events. Accessing event.type asynchronously (inside a setTimeout after the
// handler returns) threw or read null in React 16 and earlier. React 17+ removed
// event pooling — but this still explains "works in new project, breaks in old
// codebase" bugs. If you must support React 16, call event.persist() or extract
// the values you need before the async boundary.

// [Gotcha] React's synthetic event system does NOT support capture-phase
// listeners via the standard addEventListener('click', fn, true) API. React
// uses the onClickCapture prop convention instead:
//   <div onClickCapture={handleCapture}> — fires during capture, before bubbling.
```
::

## 🧠 Spot the Bug

A "select all" checkbox is supposed to toggle every row, but clicking it does nothing — no errors, no console output.

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
```javascript
function SelectAllCheckbox({ onSelectAll }) {
  return <input type="checkbox" onClick={onSelectAll(true)} />
}
```
::

<details>
<summary>Answer</summary>

`onSelectAll(true)` is **called immediately** during render — it's an invocation, not a reference. Whatever `onSelectAll(true)` returns (likely `undefined`, if it's a void function) is what gets assigned to `onClick`. The checkbox's real click handler is `undefined`, so clicking it does nothing — while the "select all" logic already ran once during the initial render, without user interaction.

**Fix**: wrap in an arrow function so it only executes when the event fires:

```javascript
<input type="checkbox" onClick={() => onSelectAll(true)} />
```

**The lesson**: JSX event props need a function *reference*, not a function *call*. Any handler that needs arguments must be wrapped: `onClick={() => fn(arg)}`, not `onClick={fn(arg)}`.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. React wraps native events in SyntheticEvent — same API (preventDefault,
//    stopPropagation, target, currentTarget) plus .nativeEvent for raw access.
//    event.target = actual click target (could be child); currentTarget = handler's element.

// 2. React 17+ attaches event listeners to the root container (not document).
//    Isolates multiple React trees and non-React widgets on the same page.
//    Event pooling was removed — SyntheticEvent objects are safe to access async.

// 3. Handler props need a FUNCTION REFERENCE, not an invocation.
//    onClick={fn}     → correct (reference, no args)
//    onClick={fn()}   → BUG: runs during render, assigns return value (undefined) to onClick
//    onClick={() => fn(arg)} → correct (arrow wrapper for args)

// 4. Missing preventDefault() on onSubmit triggers a full page reload — the
//    #1 React beginner bug. Also required on dragover for drop to work, and
//    on links for client-side routing.

// 5. onChange in React fires per keystroke (not on blur like plain HTML).
//    This underpins the controlled-input model (Chapter 14).

// 6. stopPropagation() blocks ALL ancestor listeners, not just the one you're
//    avoiding. Consider target === currentTarget checks for less destructive
//    "click outside" detection that preserves bubbling for other listeners.
```
::
