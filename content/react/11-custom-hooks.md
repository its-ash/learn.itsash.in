---
title: "11 — Custom Hooks"
description: "Extracting reusable stateful logic into custom hooks, naming conventions, composition patterns, rules of hooks, and production hooks: useDebounce, useFetch, useLocalStorage, usePrevious. Code-first reference for mid-to-senior React engineers."
---

# 11 — Custom Hooks

## What Custom Hooks Are

::code-wrapper{language="javascript" filename="custom_hook_basics.js"}
```javascript
// A custom hook is a JavaScript function that starts with "use" and may call
// other hooks inside it. It's the React mechanism for REUSING STATEFUL LOGIC
// across components — not state itself, but the logic that manages state.

// The "use" prefix is NOT just convention — the linter (eslint-plugin-react-hooks)
// treats it as a signal that the function follows the Rules of Hooks. Without
// the "use" prefix, the linter won't check it, and hook violations go undetected.

// RULES OF HOOKS (enforced inside custom hooks):
// 1. Only call hooks at the TOP LEVEL — not inside loops, conditions, or nested functions
// 2. Only call hooks from React functions (components or other custom hooks)
```
::

## Production Hooks

### useDebounce

::code-wrapper{language="javascript" filename="useDebounce.js"}
```javascript
import { useState, useEffect } from 'react'

function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timeoutId)
    // Cleanup on every value change: resets the timer.
    // The consumer only sees the debounced value after the user STOPS
    // changing the input for `delay` ms.
  }, [value, delay])

  return debouncedValue
}

// Usage:
function SearchPage() {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 500)
  // debouncedQuery lags behind query by 500ms of inactivity

  useEffect(() => {
    if (debouncedQuery) fetchResults(debouncedQuery)
  }, [debouncedQuery])  // API call only fires when user stops typing for 500ms

  return <input value={query} onChange={e => setQuery(e.target.value)} />
}
```
::

### useFetch

::code-wrapper{language="javascript" filename="useFetch.js"}
```javascript
import { useReducer, useEffect } from 'react'

const initialState = { data: null, loading: true, error: null }

function fetchReducer(state, action) {
  switch (action.type) {
    case 'start': return { data: null, loading: true, error: null }
    case 'success': return { data: action.data, loading: false, error: null }
    case 'error': return { data: null, loading: false, error: action.error }
    default: return state
  }
}

function useFetch(url, options) {
  const [state, dispatch] = useReducer(fetchReducer, initialState)

  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    dispatch({ type: 'start' })
    fetch(url, { ...options, signal: controller.signal })
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then(data => dispatch({ type: 'success', data }))
      .catch(err => { if (err.name !== 'AbortError') dispatch({ type: 'error', error: err.message }) })
    return () => controller.abort()
  }, [url])  // only re-fetch when url changes — NOT when options changes
  // CAVEAT: options is usually a new object every render → including it in deps
  // would cause an infinite fetch loop. The caller must memoize options if they
  // want re-fetching on option changes, or use a JSON stringified dep.

  return state
}
```
::

### useLocalStorage

::code-wrapper{language="javascript" filename="useLocalStorage.js"}
```javascript
import { useState, useEffect, useCallback } from 'react'

function useLocalStorage(key, initialValue) {
  // Lazy init: read from localStorage only on mount
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : initialValue
    } catch {
      return initialValue  // localStorage might be unavailable (SSR, privacy mode)
    }
  })

  // Persist to localStorage whenever value changes
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (err) {
      console.warn(`Failed to persist ${key}:`, err)
    }
  }, [key, value])

  // Listen for cross-tab changes (storage event fires in other tabs)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === key && e.newValue !== null) {
        try { setValue(JSON.parse(e.newValue)) } catch { /* ignore parse errors */ }
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [key])

  return [value, setValue]
}
```
::

### usePrevious

::code-wrapper{language="javascript" filename="usePrevious.js"}
```javascript
import { useRef, useEffect } from 'react'

function usePrevious(value) {
  const ref = useRef()
  // Update the ref AFTER render so the CURRENT render still sees the old value.
  // The effect runs after paint → ref.current holds the value from the PREVIOUS render.
  useEffect(() => {
    ref.current = value
  }, [value])
  return ref.current
}

// Usage:
function PriceTag({ price }) {
  const prevPrice = usePrevious(price)
  const trend = prevPrice < price ? '↑' : prevPrice > price ? '↓' : '→'
  return <span>{price} {trend}</span>
}
```
::

## Hook Composition

::code-wrapper{language="javascript" filename="hook_composition.js"}
```javascript
// Custom hooks can call other custom hooks — this is the primary mechanism for
// composing stateful logic. Build complex hooks from simpler ones.

function useUser() {
  const { data: user, loading } = useFetch('/api/me')
  const prevUser = usePrevious(user)
  return { user, prevUser, loading }
}

function useAuth() {
  const { user, loading } = useUser()
  const [token, setToken] = useLocalStorage('authToken', null)
  const isAuthenticated = Boolean(user && token)

  const logout = useCallback(() => {
    setToken(null)
    fetch('/api/logout', { method: 'POST' })
  }, [setToken])

  return { user, loading, isAuthenticated, token, setToken, logout }
}

// This composition is what makes hooks powerful: complex logic built from
// simple, testable, reusable pieces — without inheritance or render props.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Idiom] Name hooks with "use" + what they return/manage: useDebounce, useFetch,
// useLocalStorage, useToggle, useMediaQuery. The name should describe the capability.

// [Idiom] Return an object (not an array) when the hook has 3+ values — callers
// can destructure only what they need without worrying about position:
//   const { data, loading, error } = useFetch(url)  // better than [data, loading, error]
// Return an array for 2-value hooks (value, setter) to match useState convention.

// [Debug] If a custom hook seems to cause stale values, check dependency arrays
// in every internal hook. A missing dep in a nested useEffect/useCallback
// captures stale values silently.

// [Idiom] Keep hooks focused on ONE responsibility. useAuth shouldn't also
// handle theming. Compose small hooks into larger ones rather than building
// one mega-hook.

// [Safety] Guard against SSR — localStorage, window, and document don't exist
// during server rendering. Wrap in try/catch or check typeof window !== 'undefined'.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] Two components using the same custom hook do NOT share state.
// Each component gets its OWN instance of the hook's useState/useEffect.
// Hooks reuse LOGIC, not STATE. Sharing state requires Context (Ch 7) or
// lifting state up to a common parent.

// [Gotcha] The "use" prefix is enforced by the linter, not React itself.
// A function named "getData" that calls useState won't be caught by the
// linter — and calling it conditionally will silently break the Rules of Hooks.

// [Gotcha] Hooks that accept functions as arguments need those functions to be
// stable (useCallback'd) if they're in a dependency array, or the hook will
// re-run on every render. useFetch(url, fetchFn) → if fetchFn isn't memoized,
// the effect re-runs every render → infinite fetch loop.

// [Gotcha] Returning a function from a custom hook that closes over state can
// create stale closures. Wrap returned functions in useCallback with proper deps.

// [Gotcha] SSR: localStorage, window, and document are undefined during server
// rendering. Accessing them in useState's initializer or useLayoutEffect throws.
// Guard with typeof window !== 'undefined' or use useEffect (which doesn't run on server).
```
::

## 🧠 Spot the Bug

A `useToggle` hook works on the first click but stops toggling after that:

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
```javascript
function useToggle(initialValue = false) {
  const [value, setValue] = useState(initialValue)
  const toggle = () => setValue(!value)
  return [value, toggle]
}
```
::

<details>
<summary>Answer</summary>

`toggle` captures `value` from the **current render's closure**. After the first toggle, `value` changes and the component re-renders — but if `toggle` was captured by a consumer (e.g., passed to a memoized child or stored in a variable), the old closure with the old `value` persists. On the next call, `setValue(!value)` uses the stale `value` — toggling back to the original state, then back again, appearing to "stop toggling."

**Fix**: use the functional updater form so it doesn't depend on the closure:

```javascript
function useToggle(initialValue = false) {
  const [value, setValue] = useState(initialValue)
  const toggle = useCallback(() => setValue(prev => !prev), [])  // stable + no stale closure
  return [value, toggle]
}
```

The `useCallback` with `[]` makes `toggle` a stable reference (no re-creation), and `prev => !prev` uses the functional updater so it always has the latest value — no stale closure.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. Custom hooks = reusable stateful LOGIC (not state itself). Each component
//    using a hook gets its OWN independent state instance. Share STATE via Context.

// 2. The "use" prefix is a linter signal, not just convention. Without it, the
//    Rules of Hooks aren't checked — conditional hook calls go undetected.

// 3. Common production hooks: useDebounce (debounce values), useFetch (data
//    fetching + cancellation), useLocalStorage (persist + cross-tab sync),
//    usePrevious (access prior render's value).

// 4. Compose hooks from other hooks: useAuth → useUser + useLocalStorage.
//    Build complex logic from small, focused, testable pieces.

// 5. Functions returned from hooks should be wrapped in useCallback with proper
//    deps to prevent stale closures and ensure stable references for consumers.
//    Guard against SSR: typeof window !== 'undefined' for browser APIs.
```
::
