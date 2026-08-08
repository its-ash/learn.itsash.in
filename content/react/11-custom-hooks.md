# 11 — Custom Hooks

## What a Custom Hook Actually Is

A custom hook is nothing more than a JavaScript function whose name starts with `use` and which calls one or more other hooks internally. There's no special API, registration mechanism, or React internals magic — it's pure convention plus the rules of hooks (below), enforced partly by the `eslint-plugin-react-hooks` linter recognizing the `use`-prefix naming pattern.

::code-wrapper{language="javascript"}
```javascript
import { useState, useEffect } from 'react'

function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth)

  useEffect(() => {
    function handleResize() { setWidth(window.innerWidth) }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return width
}

function ResponsiveLayout() {
  const width = useWindowWidth()
  return width < 768 ? <MobileNav /> : <DesktopNav />
}
```
::

The value of extracting this into `useWindowWidth` isn't code deduplication alone (though that matters once three components need window width) — it's that the component's own body stays focused on *what to render*, while *how to track window width* is named, isolated, and independently reasoned about.

## Why the `use` Prefix Isn't Optional

The prefix isn't cosmetic — it's how both React's linter and (in current React) the runtime itself can apply the **Rules of Hooks** correctly. A function that calls `useState` internally but is named `getWindowWidth` looks like a plain function call to the linter, so the linter can't warn you if you call it conditionally or inside a loop — exactly the situations where hooks break.

## The Rules of Hooks, and Why They Exist

1. **Only call hooks at the top level** — never inside conditionals, loops, or nested functions.
2. **Only call hooks from React function components or other custom hooks** — never from plain JS functions or class components.

::code-wrapper{language="javascript"}
```javascript
// VIOLATION: conditional hook call
function Bad({ isLoggedIn }) {
  if (isLoggedIn) {
    const [user, setUser] = useState(null)  // sometimes called, sometimes not
  }
  const [theme, setTheme] = useState('light')
  return <div>...</div>
}
```
::

The reason this breaks React isn't stylistic — it's mechanical. React tracks each hook call by **call order**, not by name, using an internal linked list per component instance. On the first render, if `isLoggedIn` is `true`, the list is `[useState(user), useState(theme)]`. On a later render where `isLoggedIn` becomes `false`, the list becomes `[useState(theme)]` — but React, walking the list positionally, thinks the *first* hook call is still `user`'s slot, and now assigns `theme`'s state to the wrong position entirely. This corrupts every hook's state after the point of divergence, often with no error — just silently wrong values.

::code-wrapper{language="javascript"}
```javascript
// Fixed: unconditional hook calls; branch on the VALUE, not the call itself
function Good({ isLoggedIn }) {
  const [user, setUser] = useState(null)
  const [theme, setTheme] = useState('light')

  if (isLoggedIn) {
    // fine — this is a conditional inside the component body, not a conditional hook call
  }
  return <div>...</div>
}
```
::

## Extracting Logic: A Debounce Hook

A textbook example of a custom hook that wraps a common, reusable piece of effect logic behind a clean interface.

::code-wrapper{language="javascript"}
```javascript
import { useState, useEffect } from 'react'

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])

  return debounced
}

function SearchBox() {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 300)

  useEffect(() => {
    if (debouncedQuery === '') return
    searchApi(debouncedQuery).then(/* ... */ () => {})
  }, [debouncedQuery])

  return <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…" />
}
```
::

## A Data-Fetching Hook (the Pattern Behind React Query)

::code-wrapper{language="javascript"}
```javascript
import { useState, useEffect } from 'react'

function useFetch(url) {
  const [state, setState] = useState({ status: 'idle', data: null, error: null })

  useEffect(() => {
    if (!url) return
    let cancelled = false
    setState({ status: 'loading', data: null, error: null })

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => { if (!cancelled) setState({ status: 'success', data, error: null }) })
      .catch(error => { if (!cancelled) setState({ status: 'error', data: null, error }) })

    return () => { cancelled = true }
  }, [url])

  return state
}

function UserProfile({ userId }) {
  const { status, data: user, error } = useFetch(`/api/users/${userId}`)

  if (status === 'loading' || status === 'idle') return <Spinner />
  if (status === 'error') return <ErrorMessage error={error} />
  return <ProfileCard user={user} />
}
```
::

Every component that needs `GET`-and-render behavior now shares one audited, race-condition-safe implementation instead of re-deriving (and re-bugging) the same `useEffect` pattern from chapter 6 over and over. This is precisely the gap that libraries like React Query and SWR (chapter 17) fill at production scale, adding caching, retries, and refetch-on-focus on top of this same foundational shape.

## Composing Custom Hooks from Other Custom Hooks

Hooks compose naturally — a custom hook can call other custom hooks, building higher-level behavior from smaller pieces.

::code-wrapper{language="javascript"}
```javascript
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    const saved = localStorage.getItem(key)
    return saved !== null ? JSON.parse(saved) : initialValue
  })

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])

  return [value, setValue]
}

function useTheme() {
  // useTheme is built entirely on top of useLocalStorage — no new hook primitives needed
  const [theme, setTheme] = useLocalStorage('theme', 'light')
  const toggleTheme = useCallback(() => {
    setTheme(t => (t === 'light' ? 'dark' : 'light'))
  }, [setTheme])
  return { theme, toggleTheme }
}
```
::

## Parameterizing Hooks for Reuse

A well-designed custom hook takes the variable parts as arguments and returns exactly what callers need — no more, no less. Compare an overly rigid version to a flexible one.

::code-wrapper{language="javascript"}
```javascript
// Too rigid: hardcodes the endpoint and only supports one specific shape
function useUsersList() {
  const [users, setUsers] = useState([])
  useEffect(() => { fetch('/api/users').then(r => r.json()).then(setUsers) }, [])
  return users
}
```
::

::code-wrapper{language="javascript"}
```javascript
// Flexible: the earlier generic useFetch(url) already covers this and any other endpoint,
// without a bespoke hook per resource type
function useUsersList() {
  const { data: users } = useFetch('/api/users')
  return users ?? []
}
```
::

## Custom Hooks Do Not Share State Between Call Sites

A common misconception: calling the same custom hook from two different components does **not** share state between them. Each call site gets its own, completely independent instance of whatever `useState`/`useReducer`/`useRef` the hook uses internally — a custom hook is a reusable *recipe* for stateful logic, not a shared *store*.

::code-wrapper{language="javascript"}
```javascript
function useCounter(initial = 0) {
  const [count, setCount] = useState(initial)
  return { count, increment: () => setCount(c => c + 1) }
}

function ComponentA() {
  const { count, increment } = useCounter()  // its OWN independent count
  return <button onClick={increment}>A: {count}</button>
}

function ComponentB() {
  const { count, increment } = useCounter()  // a DIFFERENT, unrelated count
  return <button onClick={increment}>B: {count}</button>
}
// Clicking A's button never changes B's count — each call to useCounter() is independent.
```
::

If you actually need shared state across components, that's what Context (chapter 7) or a state management library (chapter 18) is for — a custom hook alone cannot provide it, since it has no notion of "this call site" vs. "that call site" beyond what its own arguments/inputs express.

## Naming Conventions

- Always prefix with `use`: `useDebounce`, `useFetch`, `useLocalStorage`.
- Name for *what it provides*, not *how it's implemented*: `useOnlineStatus`, not `useEventListener` (unless the hook is genuinely a generic event-listener utility).
- Return a tuple (`[value, setValue]`) when the shape mirrors `useState`'s convention; return an object (`{ data, status, error }`) when there are more than two related values — objects let call sites destructure only what they need, by name, in any order.

## 💡 Tips & Tricks

- **Idiom** — Extract a piece of `useEffect` + `useState` logic into a custom hook the moment a second component needs the same behavior — waiting for a third repetition (the usual "rule of three" for abstraction) tends to happen too late for stateful logic, since copy-pasted effects are a common source of divergent, hard-to-track bugs.
- **Debug** — If two components' state seems to be "linked" when it shouldn't be, verify you're not confusing a custom hook (independent state per call site) with Context or a shared module-level variable (genuinely shared) — the former is far more common as a source of confusion than an actual bug.
- **Idiom** — Design a custom hook's return shape around ergonomics at the call site: a `[value, setter]` tuple for simple state-like hooks, a named object for anything with three or more related fields — matching `useState`'s own convention keeps the API predictable to anyone who already knows React.
- **Debug** — When the Rules-of-Hooks lint rule fires on code that "looks fine," trust it before disabling it — the bug it's flagging (hook call order drifting between renders) frequently doesn't manifest as a visible error, just silently wrong state a few renders later.
- **Portability** — A custom hook with no component-specific assumptions baked in (pure inputs/outputs, no hardcoded endpoints or DOM queries) is trivial to unit test with `@testing-library/react`'s `renderHook` utility (chapter 24) — designing for testability up front pays off immediately once the hook has any real logic worth verifying.

## ⚠️ Edge Cases & Gotchas

- **Custom hooks never share state across call sites, even with identical arguments** — `useCounter(0)` called in two components produces two entirely independent counters; if you need shared state, use Context or a state library, not a custom hook alone.
- **A hook name without the `use` prefix disables lint enforcement of the Rules of Hooks for that function** — `eslint-plugin-react-hooks` identifies hooks by the naming convention; a function that internally calls `useState` but is named `getToggleState` will not be checked for conditional-call violations, silently allowing the exact bug the rules exist to prevent.
- **Hooks calling hooks still must obey the top-level-only rule, transitively** — a custom hook itself cannot call another hook conditionally, even though it's "just a function" from the outside; the same positional-tracking mechanism applies at every level of hook composition.
- **Returning a new object/array literal from a custom hook every call creates the same referential-equality issues as chapter 9** — `return { count, increment }` builds a fresh object every time the hook runs, which can defeat `React.memo` on components receiving it as a prop unless the hook internally memoizes with `useMemo`.
- **A hook's internal `useEffect` cleanup still only runs on that hook's own dependency changes, not the consuming component's overall re-render** — logic inside a custom hook is fully subject to the same effect-timing rules from chapter 6; wrapping something in a custom hook doesn't change when its effects fire, only where the logic lives.

## 🧠 Spot the Bug

A team extracts a "form field" hook meant to be reused across a signup form's several inputs, but every field ends up showing the same value when the user types in any one of them.

::code-wrapper{language="javascript"}
```javascript
let sharedValue = ''  // module-level variable, defined outside any hook or component

function useField() {
  const [, forceRender] = useReducer(x => x + 1, 0)

  function set(newValue) {
    sharedValue = newValue
    forceRender()
  }

  return [sharedValue, set]
}

function SignupForm() {
  const [name, setName] = useField()
  const [email, setEmail] = useField()

  return (
    <>
      <input value={name} onChange={e => setName(e.target.value)} />
      <input value={email} onChange={e => setEmail(e.target.value)} />
    </>
  )
}
```
::

<details>
<summary>Answer</summary>

`sharedValue` is declared at module scope, outside the hook — it is one single variable shared by *every* call to `useField()`, across every component instance and every field, rather than an independent piece of state per call site. Typing in the name field mutates the same `sharedValue` the email field reads from (and vice versa), so both fields appear to mirror whatever was typed most recently, anywhere.

**The lesson**: a custom hook's state must live inside the hook via `useState`/`useReducer`/`useRef`, so each call site gets React's own per-instance bookkeeping — module-level variables are shared globally across every consumer of the hook and are almost never what you actually want for per-field or per-component state.

</details>

## Key Takeaways

- A custom hook is just a function starting with `use` that calls other hooks internally — no special registration, just convention plus the Rules of Hooks.
- Hooks must be called unconditionally, at the top level, every render — React tracks hook state by call order, and conditional calls corrupt that order silently.
- Custom hooks are reusable *recipes* for stateful logic, not shared stores — each call site gets fully independent state unless you deliberately share it via Context or module-level state management.
- Extracting a `useEffect`/`useState` pattern into a named custom hook the moment a second component needs it keeps effect logic centralized, audited, and testable in one place.
- Design return shapes to match call-site ergonomics: tuples for simple state-like hooks, named objects for hooks exposing three or more related values.
- Hooks compose freely — a custom hook can call other custom hooks, building layered abstractions (`useTheme` on top of `useLocalStorage`, for example).
