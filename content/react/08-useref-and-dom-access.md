---
title: "08 — useRef & DOM Access"
description: "useRef as mutable container, DOM node access, focus management, layout measurement with useLayoutEffect, third-party library integration, forwardRef and useImperativeHandle. Code-first reference for mid-to-senior React engineers."
---

# 08 — `useRef` & DOM Access

## useRef: Mutable Container That Survives Renders

::code-wrapper{language="javascript" filename="useref_basics.js"}
```javascript
import { useRef } from 'react'

// useRef returns a STABLE object { current: initialValue } that persists across
// renders. Mutating .current does NOT trigger a re-render.

const timerRef = useRef(null)
// timerRef === timerRef across all renders (same object reference)
// timerRef.current can be mutated freely without causing re-renders

// useRef vs useState:
//   useState:   changing value → triggers re-render → UI updates
//   useRef:     changing value → NO re-render → just a mutable container
//
// Use useState when the value drives the UI.
// Use useRef when the value is an internal implementation detail (timers,
// interval IDs, "previous value" trackers, mutable flags) that the UI
// doesn't need to react to.

// ANTI-PATTERN: using useRef for state that should trigger re-render
function BadCounter() {
  const countRef = useRef(0)
  return <button onClick={() => countRef.current++}>{countRef.current}</button>
  // The button text NEVER updates — mutating ref.current doesn't re-render.
  // The count IS incrementing internally, but the UI is frozen at 0.
}
```
::

## DOM Access with Refs

::code-wrapper{language="javascript" filename="dom_access.js"}
```javascript
function AutoFocusInput() {
  const inputRef = useRef(null)

  useEffect(() => {
    // After mount, the ref's .current points to the actual <input> DOM node
    inputRef.current?.focus()
  }, [])  // run once on mount

  return <input ref={inputRef} type="text" />
  // React assigns the DOM node to inputRef.current after the initial render.
  // On unmount, React sets inputRef.current back to null.
}

// CALLBACK REF: when you need to know WHEN the node changes
function MeasuredBox({ children }) {
  const [height, setHeight] = useState(0)

  // Callback ref fires when the DOM node is created, destroyed, or changes
  const refCallback = useCallback((node) => {
    if (node) {
      // node is the DOM element — measure it
      setHeight(node.getBoundingClientRect().height)
    }
    // node === null when unmounting — cleanup if needed
  }, [])

  return <div ref={refCallback} style={{ height: height || 'auto' }}>{children}</div>
}
// Callback refs are useful when you need to run logic at the exact moment
// the DOM node is attached/detached, not just on mount.
```
::

## Focus Management

::code-wrapper{language="javascript" filename="focus_management.js"}
```javascript
function Modal({ isOpen, onClose, children }) {
  const modalRef = useRef(null)
  const previouslyFocused = useRef(null)

  useEffect(() => {
    if (isOpen) {
      // Save the element that had focus before the modal opened
      previouslyFocused.current = document.activeElement
      // Move focus into the modal
      modalRef.current?.focus()
    } else {
      // Restore focus to the trigger when modal closes (accessibility)
      previouslyFocused.current?.focus()
    }
  }, [isOpen])

  return isOpen ? (
    <div className="overlay" onClick={onClose}>
      <div ref={modalRef} tabIndex={-1} onClick={e => e.stopPropagation()}>
        {/* tabIndex={-1} makes the div focusable programmatically (not in tab order) */}
        {children}
      </div>
    </div>
  ) : null
}
```
::

## Layout Measurement with useLayoutEffect

::code-wrapper{language="javascript" filename="layout_measurement.js"}
```javascript
import { useLayoutEffect, useRef, useState } from 'react'

// useLayoutEffect runs SYNCHRONOUSLY after DOM mutations but BEFORE the browser
// paints. Use it to read layout (dimensions, position) and make adjustments
// that should be visible without flicker.
//
// useEffect runs AFTER paint — if you measure and then setState, the user sees
// a flash of the wrong layout before the correction. useLayoutEffect prevents this.

function Tooltip({ targetRef, content }) {
  const tooltipRef = useRef(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  useLayoutEffect(() => {
    if (!targetRef.current || !tooltipRef.current) return

    const targetRect = targetRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()

    // Position tooltip above the target, centered
    setPosition({
      top: targetRect.top - tooltipRect.height - 8,
      left: targetRect.left + (targetRect.width - tooltipRect.width) / 2,
    })
  }, [targetRef])  // re-measure when target changes

  return (
    <div ref={tooltipRef} style={{ position: 'fixed', ...position }}>
      {content}
    </div>
  )
}
// CAVEAT: useLayoutEffect blocks painting — only use for measurements that
// would cause visible flicker if done in useEffect. For everything else,
// use useEffect (non-blocking).
```
::

## Integrating with Non-React Libraries

::code-wrapper{language="javascript" filename="third_party_integration.js"}
```javascript
function Chart({ data }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)  // holds the Chart.js instance (not DOM)

  useEffect(() => {
    // Initialize the third-party library on the DOM node
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: { labels: data.map(d => d.label), datasets: [{ data: data.map(d => d.value) }] },
    })

    // Cleanup: destroy the instance to prevent memory leaks
    return () => chartRef.current?.destroy()
  }, [])  // create once on mount

  useEffect(() => {
    // Update the chart when data changes (separate from initialization)
    if (chartRef.current) {
      chartRef.current.data = {
        labels: data.map(d => d.label),
        datasets: [{ data: data.map(d => d.value) }],
      }
      chartRef.current.update()
    }
  }, [data])

  return <canvas ref={canvasRef} />
}
// Pattern: one effect for initialization (deps=[]), another for updates (deps=[data]).
// Always destroy/dispose the library instance in the init effect's cleanup.
```
::

## forwardRef and useImperativeHandle

::code-wrapper{language="javascript" filename="forward_ref.js"}
```javascript
import { forwardRef, useImperativeHandle, useRef } from 'react'

// forwardRef: let a parent access a child's DOM node
const FancyInput = forwardRef(function FancyInput(props, ref) {
  return <input ref={ref} className="fancy" {...props} />
})
// Parent: <FancyInput ref={inputRef} /> → inputRef.current = the <input> DOM node

// useImperativeHandle: expose a CONTROLLED API instead of the raw DOM node
const ControlledInput = forwardRef(function ControlledInput(props, ref) {
  const inputRef = useRef(null)

  useImperativeHandle(ref, () => ({
    // Only expose these methods to the parent — not the raw DOM node
    focus: () => inputRef.current?.focus(),
    clear: () => { if (inputRef.current) inputRef.current.value = '' },
    getValue: () => inputRef.current?.value,
    // The parent CANNOT access inputRef.current directly — only these methods.
  }), [])  // empty deps → the handle is created once

  return <input ref={inputRef} {...props} />
})

// Parent usage:
function Form() {
  const inputRef = useRef(null)
  return (
    <>
      <ControlledInput ref={inputRef} />
      <button onClick={() => inputRef.current?.focus()}>Focus</button>
      <button onClick={() => inputRef.current?.clear()}>Clear</button>
    </>
  )
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Idiom] Use useRef for "instance variables" — values that persist across
// renders but shouldn't trigger re-renders: timer IDs, previous prop values,
// "is mounted" flags, cache for expensive computations.

// [Debug] ref.current is null during the first render and in SSR. It's only
// populated after the DOM commits. Always guard: ref.current?.focus().

// [Idiom] Use callback refs when you need to react to the DOM node being
// attached/detached — not just access it on mount. node => { if (node) ... }

// [Performance] useLayoutEffect blocks paint — use it ONLY for measurements
// that would flicker if done in useEffect. For all other side effects, use
// useEffect (non-blocking, runs after paint).

// [Idiom] When integrating third-party libs (Chart.js, Google Maps, CodeMirror),
// always destroy/dispose the instance in the effect cleanup. Leaked instances
// accumulate and cause memory issues in long-running sessions.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] Don't read or write ref.current during render — it's a mutation,
// and render must be pure. Read/write refs only in event handlers and effects.

// [Gotcha] ref.current is null on the first render and during SSR. Accessing
// it in useEffect is safe (effects run after mount), but accessing it in
// useLayoutEffect during SSR throws "document is not defined" — use useEffect
// for SSR-compatible code, or dynamically import the component.

// [Gotcha] Callback refs with inline functions fire on EVERY render (new function
// reference = React detaches and re-attaches). Wrap in useCallback to prevent
// unnecessary DOM node churn: ref={useCallback(node => ..., [])}.

// [Gotcha] forwardRef components don't automatically forward ref to a DOM
// element — you must explicitly attach it: <input ref={ref} />. Forgetting
// the ref attachment means the parent gets null.

// [Gotcha] useImperativeHandle without forwardRef has no effect — the ref
// has nowhere to attach. Always pair useImperativeHandle with forwardRef.
```
::

## 🧠 Spot the Bug

A component uses a ref to track a "previous value" but it always shows the current value:

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
```javascript
function PriceDisplay({ price }) {
  const prevPriceRef = useRef(price)

  useEffect(() => {
    prevPriceRef.current = price
  }, [price])

  return <div>Previous: {prevPriceRef.current} | Current: {price}</div>
}
```
::

<details>
<summary>Answer</summary>

The effect sets `prevPriceRef.current = price` **after** the render has already happened. On the render where `price` changes from 10 to 20:

1. React renders with `price = 20` — the JSX reads `prevPriceRef.current` (still 10 from the last update) and `price` (20) → shows "Previous: 10 | Current: 20" ✓
2. The effect runs and sets `prevPriceRef.current = 20` → but the DOM already shows the correct values

Wait — the code actually **works correctly** because the effect runs *after* render. The display shows the old ref value during render, then the effect updates it for the *next* render. The pattern is correct.

The actual bug would be if the assignment happened **during render** instead of in an effect:

```javascript
// BUG: assigning during render means prevPriceRef.current === price always
function PriceDisplay({ price }) {
  const prevPriceRef = useRef(price)
  prevPriceRef.current = price  // ← mutation during render: both show same value
  return <div>Previous: {prevPriceRef.current} | Current: {price}</div>
}
```

This is why the original code is correct — it uses `useEffect` to update the ref *after* render, so the "previous" value is genuinely the prior render's value during the current render. The ref persists across renders, and the effect schedules the update for the next cycle.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. useRef = mutable container { current: value } that persists across renders.
//    Mutating .current does NOT trigger re-render. Use for timers, flags, caches,
//    "previous value" trackers — NOT for values that drive the UI.

// 2. DOM access: attach ref={myRef} to a DOM element. React populates .current
//    after mount, sets it to null on unmount. Always guard: ref.current?.method().

// 3. useLayoutEffect for DOM measurements before paint (prevents flicker).
//    useEffect for everything else (non-blocking, after paint).
//    useLayoutEffect blocks rendering — use sparingly.

// 4. Third-party integration: initialize in useEffect([]), update in
//    useEffect([data]), destroy in cleanup. Always dispose library instances.

// 5. forwardRef lets parents access a child's ref. useImperativeHandle exposes
//    a controlled API instead of the raw DOM node — pair both together.
//    Don't read/write ref.current during render — only in handlers and effects.
```
::
