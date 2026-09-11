---
title: "04 — State & useState"
description: "useState mechanics, batch updates, functional updates vs direct values, stale closures, lazy initialization, React 18 automatic batching, and anti-patterns for derived state. Code-first reference for mid-to-senior React engineers."
---

# 04 — State & `useState`

## useState Anatomy

::code-wrapper{language="javascript" filename="usestate_anatomy.js"}
```javascript
import { useState } from 'react'

// useState returns [currentState, setStateFunction]
// - currentState: the value AT THIS RENDER (snapshot, not a live reference)
// - setStateFunction: schedules a re-render with the new value

const [count, setCount] = useState(0)

// WHAT THE SETTER DOES:
// 1. Queues the new state value
// 2. Schedules a re-render (does NOT happen synchronously)
// 3. On next render, useState returns the NEW value

// CRITICAL MENTAL MODEL:
// `count` is a SNAPSHOT of state at the time this render happened.
// It does NOT update in-place when you call setCount.
// Between calling setCount and the next render, `count` is STILL the old value.

function Counter() {
  const [count, setCount] = useState(0)
  function handleClick() {
    setCount(count + 1)  // schedules re-render with count + 1
    console.log(count)   // STILL logs the OLD value — count is a snapshot
  }
  return <button onClick={handleClick}>{count}</button>
}
```
::

## Functional Updates vs Direct Values

::code-wrapper{language="javascript" filename="functional_updates.js"}
```javascript
// ANTI-PATTERN: using the current state variable directly in the update
function BadCounter() {
  const [count, setCount] = useState(0)
  function incrementThree() {
    setCount(count + 1)  // uses count from THIS render
    setCount(count + 1)  // uses SAME count from THIS render → all three set to count + 1
    setCount(count + 1)  // result: count increases by 1, not 3
  }
  // All three calls use the same stale `count` snapshot. React batches them
  // and applies them as three "set to count + 1" operations — net result: +1.
}

// PRODUCTION: use the functional updater form when the next state depends on the previous
function GoodCounter() {
  const [count, setCount] = useState(0)
  function incrementThree() {
    setCount(prev => prev + 1)  // prev is the LATEST queued state, not the render snapshot
    setCount(prev => prev + 1)  // prev = result of previous update
    setCount(prev => prev + 1)  // result: count increases by 3
  }
  // The functional form receives the LATEST state (after all queued updates),
  // not the snapshot from the current render. Each updater builds on the previous.
}
```
::

## React 18 Automatic Batching

::code-wrapper{language="javascript" filename="automatic_batching.js"}
```javascript
// React 18 batches ALL state updates — in event handlers, timeouts, promises,
// and native event handlers. React 17 only batched inside React event handlers.

function Search({ query }) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSearch() {
    setLoading(true)     // ─┐
    setError(null)       // ─┤ — batched: ONE re-render, not three
    setResults([])       // ─┘

    try {
      const data = await fetchResults(query)
      setResults(data)   // ─┐ batched: ONE re-render
      setLoading(false)  // ─┘
    } catch (err) {
      setError(err.message)  // ─┐ batched: ONE re-render
      setLoading(false)      // ─┘
    }
  }
  // In React 17, the await boundary would UN-batch — setLoading(true) and
  // setError(null) would cause separate renders. React 18 batches everything.
}
```
::

## The Stale Closure Problem

::code-wrapper{language="javascript" filename="stale_closure.js"}
```javascript
// ANTI-PATTERN: stale closure in event handlers or timers
function Poller() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      // This closure captures `count` from the FIRST render.
      // Every interval tick uses count = 0 → setCount(0 + 1) → setCount(1) every time.
      setCount(count + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])  // empty deps → effect runs once → closure captures count = 0 forever

  return <div>{count}</div>
}

// FIX 1: functional updater (doesn't need count in the closure)
function Poller() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => {
      setCount(prev => prev + 1)  // prev is always the latest state
    }, 1000)
    return () => clearInterval(interval)
  }, [])
  return <div>{count}</div>
}

// FIX 2: include count in the dependency array (re-creates interval each change)
function Poller() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setCount(count + 1), 1000)
    return () => clearInterval(interval)
  }, [count])  // re-runs effect when count changes → fresh closure
  return <div>{count}</div>
}
// FIX 2 clears and re-creates the interval on every count change — slightly
// less efficient but needed if the closure uses count for other logic too.
```
::

## Lazy Initialization

::code-wrapper{language="javascript" filename="lazy_init.js"}
```javascript
// ANTI-PATTERN: expensive computation on every render (even though useState
// ignores the result after the first render, it STILL computes the initial value)
function BadComponent() {
  // computeExpensiveValue() runs on EVERY render — useState only uses the
  // first result, but the function is still called every time.
  const [data, setData] = useState(computeExpensiveValue())
}

// PRODUCTION: lazy initializer — the function runs ONLY on the first render
function GoodComponent() {
  // useState accepts a function; calls it once, uses the return value.
  const [data, setData] = useState(() => {
    const cached = localStorage.getItem('data')
    return cached ? JSON.parse(cached) : computeExpensiveValue()
  })
  // The arrow function runs ONLY on mount. On subsequent renders, useState
  // returns the current state without calling the initializer again.
}
```
::

## Multiple State Fields: Separate vs Object

::code-wrapper{language="javascript" filename="state_field_patterns.js"}
```javascript
// PATTERN 1: separate useState calls — independent updates, simpler mental model
const [name, setName] = useState('')
const [email, setEmail] = useState('')
const [age, setAge] = useState(0)
// Each can update independently. No accidental overwrites of other fields.

// PATTERN 2: single object state — related fields that update together
const [form, setForm] = useState({ name: '', email: '', age: 0 })
// MUST use spread to merge — setForm({ name: 'X' }) ERASES email and age!
function updateField(field, value) {
  setForm(prev => ({ ...prev, [field]: value }))  // ← spread preserves other fields
}

// ANTI-PATTERN: replacing the object instead of merging
setForm({ name: 'Alice' })  // email and age are now undefined! Object replaced.

// RULE OF THUMB:
// - Fields that update independently → separate useStates
// - Fields that update together / represent one entity → single object (or useReducer, Ch 10)
// - For complex state logic with interdependencies → useReducer (Ch 10)
```
::

## Anti-Pattern: Deriving State from Props

::code-wrapper{language="javascript" filename="anti_pattern_derived_state.js"}
```javascript
// ANTI-PATTERN: copying props into state and syncing manually
function BadEmailInput({ initialEmail }) {
  const [email, setEmail] = useState(initialEmail)
  // If initialEmail changes after mount, this state is STALE — useState only
  // reads the initial value once. Adding a useEffect to sync is an anti-pattern
  // that causes an extra render and can cause "flashing" of the old value.
  useEffect(() => {
    setEmail(initialEmail)  // ← BAD: extra render, potential flicker
  }, [initialEmail])
  return <input value={email} onChange={e => setEmail(e.target.value)} />
}

// PRODUCTION: use the key prop to reset the component when the prop changes
function GoodEmailInput({ initialEmail }) {
  const [email, setEmail] = useState(initialEmail)
  return <input value={email} onChange={e => setEmail(e.target.value)} />
}
// Parent usage: <GoodEmailInput key={userId} initialEmail={user.email} />
// Changing key unmounts and remounts the component → state resets cleanly.
// No syncing effects, no extra renders, no flicker.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Idiom] Use functional updates (prev => prev + 1) whenever the next state
// depends on the previous. This avoids stale closures and batch-update bugs.

// [Performance] Use lazy initialization useState(() => expensive()) for any
// initial value that involves computation, parsing, or I/O. Runs once, not
// every render.

// [Debug] If state updates seem to "not apply" or only apply partially, check
// for direct-value updates that should be functional updates. Multiple
// setCount(count + 1) calls in the same handler all use the same snapshot.

// [Idiom] For related state that updates together, use a single object with
// spread: setForm(prev => ({ ...prev, [field]: value })). For complex logic,
// use useReducer (Ch 10) — the reducer centralizes all state transitions.

// [Idiom] To reset a component's state, change its key prop — React unmounts
// and remounts it. Cleaner than syncing state with useEffect.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] State is a SNAPSHOT, not a live reference. After setCount(5),
// `count` is still the old value until the next render. Accessing count
// immediately after setCount logs the stale value.

// [Gotcha] Object/array state requires a NEW reference to trigger re-render.
// setItems(items.push(newItem)) → BUG: push mutates the array in place,
// React sees the same reference → no re-render.
// FIX: setItems([...items, newItem]) — spread creates a new array reference.

// [Gotcha] useState with the SAME value (Object.is comparison) does NOT
// trigger a re-render. setCount(5) when count is already 5 → no-op, no render.
// But setCount({ ...count }) (new object with same content) → DOES re-render,
// because Object.is({}, {}) is false. Don't create new objects unless you mean it.

// [Gotcha] In React 17, state updates outside React event handlers (setTimeout,
// fetch callbacks) were NOT batched → each setX caused a separate render.
// React 18 batches ALL updates everywhere. If you relied on un-batched renders
// for sequencing, behavior changes on upgrade.

// [Gotcha] Calling a state setter during render (not in an event handler or
// effect) throws "Cannot update a component while rendering a different component"
// — but calling YOUR OWN setter during render IS allowed (it's the "getDerivedState
// from props" escape hatch). Use sparingly — it causes an immediate re-render.
```
::

## 🧠 Spot the Bug

A counter should increment by 3 when clicked, but it only goes up by 1:

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
```javascript
function TripleCounter() {
  const [count, setCount] = useState(0)
  function handleClick() {
    setCount(count + 1)
    setCount(count + 1)
    setCount(count + 1)
  }
  return <button onClick={handleClick}>{count}</button>
}
```
::

<details>
<summary>Answer</summary>

All three `setCount(count + 1)` calls reference `count` from the **same render snapshot**. React batches the three updates, but each one computes `count + 1` using the original `count` value (0), so all three set state to `1` — net result: `+1`, not `+3`.

**Fix**: use the functional updater form, which receives the *latest* queued state:

```javascript
setCount(prev => prev + 1)  // prev = 0 → sets to 1
setCount(prev => prev + 1)  // prev = 1 → sets to 2
setCount(prev => prev + 1)  // prev = 2 → sets to 3
```

Each updater builds on the result of the previous one, giving the correct `+3` result.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. State is a SNAPSHOT, not a live reference. `count` doesn't update until
//    the next render. Accessing it immediately after setCount gives the old value.

// 2. Use functional updates (prev => prev + 1) when the next state depends on
//    the previous. Direct-value updates (count + 1) use the stale snapshot.

// 3. React 18 batches ALL state updates (event handlers, timeouts, promises).
//    Multiple setState calls in one handler → ONE re-render.

// 4. Lazy initialization: useState(() => expensive()) runs only on mount.
//    Without the arrow function, the initial value computes on EVERY render.

// 5. Object/array state needs a NEW reference to trigger re-render:
//    setItems([...items, newItem]) — NOT items.push(newItem) (in-place mutation).

// 6. Don't derive state from props with useEffect + setState. Use the key prop
//    to reset component state when a prop changes — cleaner, no extra render.
```
::
