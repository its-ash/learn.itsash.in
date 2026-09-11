---
title: "06 — useEffect & Lifecycle"
description: "Effect lifecycle, dependency array mechanics, cleanup functions, async race conditions, stale closures, and production data-fetching patterns with AbortController. Code-first reference for mid-to-senior React engineers."
---

# 06 — `useEffect` & Lifecycle

## The Effect Lifecycle

::code-wrapper{language="javascript" filename="effect_lifecycle.js"}
```javascript
import { useEffect } from 'react'

// useEffect runs AFTER the browser paints (asynchronous — not during render).
// The dependency array controls WHICH phases of the lifecycle trigger the effect:

// ┌─────────────────────────────────────────────────────────────────────┐
// │  deps array   │  when the effect runs                               │
// ├───────────────┼─────────────────────────────────────────────────────┤
// │  [a, b]       │  on mount + when a or b changes (Object.is compare)  │
// │  []           │  on mount ONLY (never on update)                     │
// │  (omitted)    │  after EVERY render (mount + every update)           │
// └─────────────────────────────────────────────────────────────────────┘

function DataViewer({ resourceId }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    // Effect body runs AFTER paint
    fetchData(resourceId).then(setData)

    // Optional cleanup: runs BEFORE the next effect AND on unmount
    return () => {
      console.log('cleanup: resourceId changed or component unmounting')
    }
  }, [resourceId])  // runs on mount + when resourceId changes

  // LIFECYCLE SEQUENCE for resourceId changing from 1 → 2:
  // 1. Render with resourceId=2 (new state/props trigger re-render)
  // 2. Browser paints with new resourceId
  // 3. Cleanup from PREVIOUS effect runs (resourceId was 1)
  // 4. NEW effect body runs (resourceId is now 2)
  // → cleanup → effect → cleanup → effect → ... → final cleanup on unmount
}
```
::

## Dependency Array: Object.is Comparison

::code-wrapper{language="javascript" filename="deps_comparison.js"}
```javascript
// React compares each dep with Object.is(prevDep, nextDep).
// If ANY dep fails Object.is, the effect re-runs.

// Object.is works for primitives (strings, numbers, booleans):
useEffect(() => { /* runs when id changes */ }, [id])  // ✓ id=1 vs id=2 → re-runs

// Object.is FAILS for new object/array/function references:
useEffect(() => { /* runs every render! */ }, [{ page: 1 }])
// { page: 1 } !== { page: 1 } — new object literal every render → always different

useEffect(() => { /* runs every render! */ }, [() => doSomething()])
// New function reference every render → always different

// THIS IS WHY useMemo/useCallback EXIST:
const config = useMemo(() => ({ page: 1 }), [])  // stable reference
const handler = useCallback(() => doSomething(), [doSomething])  // stable reference
useEffect(() => { /* runs only when config or handler reference changes */ }, [config, handler])
// Now the effect only re-runs when the memoized values actually change.
```
::

## Async Race Conditions

::code-wrapper{language="javascript" filename="race_condition.js"}
```javascript
// ANTI-PATTERN: no cancellation — stale responses overwrite fresh data
function BadProfile({ userId }) {
  const [profile, setProfile] = useState(null)
  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then(res => res.json())
      .then(data => setProfile(data))
  }, [userId])
  // BUG: user switches from userId=1 to userId=2 quickly.
  // Request 2 fires, then request 1 (slow) resolves LAST → overwrites
  // profile with userId=1's data while userId=2 is the active prop.
  return <div>{profile?.name}</div>
}

// PRODUCTION: AbortController for cancellation
function GoodProfile({ userId }) {
  const [profile, setProfile] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/users/${userId}`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => setProfile(data))
      .catch(err => {
        if (err.name !== 'AbortError') throw err  // re-throw real errors
      })
    return () => controller.abort()  // cancels the in-flight request on cleanup
  }, [userId])
  // When userId changes: cleanup aborts the old request → no stale overwrite.
  return <div>{profile?.name}</div>
}

// ALTERNATIVE: stale flag (if you can't use AbortController)
useEffect(() => {
  let isStale = false
  fetch(`/api/users/${userId}`).then(res => res.json()).then(data => {
    if (!isStale) setProfile(data)  // only set if this effect is still current
  })
  return () => { isStale = true }
}, [userId])
```
::

## Debouncing via useEffect

::code-wrapper{language="javascript" filename="debounce_effect.js"}
```javascript
// The canonical debounce pattern: useEffect + setTimeout + cleanup
function SearchBox({ onSearch }) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (query === '') return
    const timeoutId = setTimeout(() => onSearch(query), 300)
    // Cleanup runs BEFORE the next effect: clears the timer if query changes
    // within 300ms → the API call only fires 300ms after the user STOPS typing.
    return () => clearTimeout(timeoutId)
  }, [query, onSearch])

  return <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…" />
}
// SEQUENCE for typing "abc" (3 keystrokes within 300ms):
// keystroke "a" → effect → setTimeout(300ms)
// keystroke "b" → cleanup (clears timeout) → effect → setTimeout(300ms)
// keystroke "c" → cleanup (clears timeout) → effect → setTimeout(300ms)
// 300ms passes → onSearch("abc") fires ONCE
```
::

## Production Data Fetching Pattern

::code-wrapper{language="javascript" filename="production_fetch.js"}
```javascript
function useFetch(url) {
  const [state, setState] = useState({ data: null, loading: true, error: null })

  useEffect(() => {
    if (!url) return

    const controller = new AbortController()
    setState(prev => ({ ...prev, loading: true, error: null }))

    fetch(url, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => setState({ data, loading: false, error: null }))
      .catch(err => {
        if (err.name === 'AbortError') return  // ignore cancellation
        setState(prev => ({ ...prev, loading: false, error: err.message }))
      })

    return () => controller.abort()
  }, [url])

  return state
}

// Usage: const { data, loading, error } = useFetch('/api/users/1')
// Handles: loading state, error state, cancellation on URL change,
// and avoids the stale-response race condition.
```
::

## Anti-Pattern: Effects for Derived State

::code-wrapper{language="javascript" filename="anti_pattern_derived.js"}
```javascript
// ANTI-PATTERN: using an effect to compute a value from props/state
function BadProductList({ products, filter }) {
  const [filtered, setFiltered] = useState(products)
  useEffect(() => {
    setFiltered(products.filter(p => p.category === filter))
  }, [products, filter])
  // This causes an EXTRA render: render → effect → setState → re-render.
  // The user sees a flash of the unfiltered list before the effect runs.

  return <ul>{filtered.map(p => <li key={p.id}>{p.name}</li>)}</ul>
}

// PRODUCTION: compute during render (React handles it efficiently)
function GoodProductList({ products, filter }) {
  const filtered = useMemo(
    () => products.filter(p => p.category === filter),
    [products, filter]
  )
  // No extra render. useMemo avoids recomputing on unrelated re-renders.
  // For truly simple derivations, even useMemo is optional — just:
  // const filtered = products.filter(p => p.category === filter)
  return <ul>{filtered.map(p => <li key={p.id}>{p.name}</li>)}</ul>
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Idiom] Think of useEffect as "sync this external thing with these props/state,"
// not as a lifecycle method. It's NOT componentDidMount + componentDidUpdate.
// It's: "after render, make sure X is in sync with [deps]."

// [Debug] If your effect runs more often than expected, check for inline
// objects/functions in the deps array. {} !== {} every render → infinite effect.

// [Performance] For expensive derivations from props/state, use useMemo during
// render — NOT useEffect + setState. Effects for derived state cause an extra
// render and a flash of stale data.

// [Idiom] The cleanup function is not optional for effects that create
// subscriptions, timers, or network requests. Always return a cleanup that
// tears down what the effect set up.

// [Debug] eslint-plugin-react-hooks' exhaustive-deps rule catches missing
// dependencies. Don't silence it with eslint-disable — fix the underlying issue
// (usually by memoizing the dep with useCallback/useMemo, or restructuring).
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] useEffect runs AFTER paint. If you need to measure/modify DOM BEFORE
// paint (to avoid flicker), use useLayoutEffect instead. It runs synchronously
// after DOM mutations but before the browser paints.

// [Gotcha] Empty deps [] means "run once on mount" — but the closure inside
// captures values from the FIRST render forever. If you reference state/props
// inside, they'll be stale. Use refs or functional updates to access fresh values.

// [Gotcha] The cleanup function runs on unmount AND before the next effect.
// It does NOT only run on unmount. If your deps change 5 times, cleanup runs
// 5 times (before each new effect) plus once on unmount.

// [Gotcha] StrictMode double-invokes effects in dev: mount → unmount → mount.
// An effect that opens a WebSocket without cleanup → TWO connections in dev.
// Always implement cleanup, even if you think the effect runs "once."

// [Gotcha] Calling setState inside an effect that depends on that same state
// creates an infinite loop: effect → setState → re-render → effect → ...
// Break the cycle by removing the state from deps, or use a ref instead.

// [Safety] Never call a setter from a different component's effect. React throws
// "Cannot update a component while rendering a different component." If two
// components need to share state, lift it up to a common parent or use context.
```
::

## 🧠 Spot the Bug

A component fetches data on mount but the response seems to never arrive — the loading spinner stays forever, even though the network tab shows the response:

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
```javascript
function Profile({ userId }) {
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then(res => res.json())
      .then(setProfile)
  }, [])  // ← empty deps

  if (!profile) return <Spinner />
  return <div>{profile.name}</div>
}
```
::

<details>
<summary>Answer</summary>

The dependency array is `[]` (empty), meaning the effect runs **only on mount** and captures `userId` from the first render. If `userId` changes, the effect **never re-runs** — the component shows stale data (or keeps loading if the first fetch hasn't resolved yet for a different user). The empty deps also cause a **stale closure**: even if the fetch succeeds, it fetches the *original* `userId`, not the current one.

**Fix**: include `userId` in the dependency array:

```javascript
useEffect(() => {
  const controller = new AbortController()
  fetch(`/api/users/${userId}`, { signal: controller.signal })
    .then(res => res.json())
    .then(setProfile)
    .catch(err => { if (err.name !== 'AbortError') throw err })
  return () => controller.abort()
}, [userId])  // re-runs when userId changes, with cancellation
```

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. useEffect runs AFTER paint. deps=[a,b] → runs on mount + when a or b
//    changes (Object.is comparison). deps=[] → mount only. deps omitted → every render.

// 2. Cleanup runs BEFORE the next effect AND on unmount — not just unmount.
//    Always clean up subscriptions, timers, and network requests.

// 3. Deps compare with Object.is — inline objects/functions create new refs
//    every render → effect runs every time. Use useMemo/useCallback to stabilize.

// 4. Async effects need cancellation (AbortController or stale flag) to prevent
//    race conditions where a stale response overwrites fresh data.

// 5. Don't use effects for derived state — compute during render (useMemo or
//    inline). Effects for derived state cause an extra render + flash of stale data.

// 6. Empty deps [] captures stale values forever. If you reference props/state
//    inside, include them in deps, or use refs/functional updates for fresh access.
```
::
