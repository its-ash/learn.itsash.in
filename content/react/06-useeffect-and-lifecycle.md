# 06 — `useEffect` & Lifecycle

## What Effects Are For

`useEffect` lets a component synchronize with something **outside** React's rendering model: network requests, subscriptions, timers, manually interacting with the DOM, third-party widget libraries, logging/analytics. The mental model is not "run this after render" so much as **"keep this external system in sync with these reactive values."**

::code-wrapper{language="javascript"}
```javascript
import { useEffect, useState } from 'react'

function DocumentTitleUpdater({ unreadCount }) {
  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount}) Inbox` : 'Inbox'
  }, [unreadCount])

  return null
}
```
::

## Effect Timing: When Does It Run?

1. React renders the component (calls the function, computes JSX).
2. React commits the resulting changes to the real DOM.
3. The browser paints the screen.
4. **After** the paint, React runs your effect (asynchronously, not blocking paint).

This is fundamentally different from a class component's `componentDidMount`/`componentDidUpdate`, which run synchronously during the commit phase, before the browser paints. `useEffect`'s deferred timing is usually what you want (it doesn't block visual updates), but for certain DOM measurements (avoiding a visible flicker), you need `useLayoutEffect` instead, which runs synchronously before paint — covered later in this chapter.

## The Dependency Array

The second argument controls *when* the effect re-runs. This is the single most misunderstood part of `useEffect`.

| Dependency array | Behavior |
|---|---|
| Omitted entirely | Runs after **every** render — rarely what you want. |
| `[]` (empty) | Runs **once**, after the initial render only — analogous to `componentDidMount`. |
| `[a, b]` | Runs after the initial render, and again whenever `a` or `b` changes between renders (compared with `Object.is`). |

::code-wrapper{language="javascript"}
```javascript
useEffect(() => {
  console.log('Runs after every single render')
})

useEffect(() => {
  console.log('Runs once, after mount only')
}, [])

useEffect(() => {
  console.log('Runs after mount, and again whenever userId changes')
}, [userId])
```
::

### The Dependency Array Is Not a Suggestion — It's a Contract

React's ESLint plugin (`eslint-plugin-react-hooks`, `exhaustive-deps` rule) enforces that every reactive value read inside the effect appears in the dependency array. This isn't stylistic pedantry — omitting a dependency means the effect's closure captures a **stale** value from whatever render it was created in.

::code-wrapper{language="javascript"}
```javascript
// BUG: missing `query` in the dependency array
function SearchResults({ query }) {
  const [results, setResults] = useState([])

  useEffect(() => {
    fetchResults(query).then(setResults)
  }, [])  // <- query is used inside but not listed; effect never re-runs when query changes

  return <ResultsList results={results} />
}
```
::

::code-wrapper{language="javascript"}
```javascript
// Fixed: query is listed, so the effect re-fires whenever it changes
function SearchResults({ query }) {
  const [results, setResults] = useState([])

  useEffect(() => {
    fetchResults(query).then(setResults)
  }, [query])

  return <ResultsList results={results} />
}
```
::

## Cleanup Functions

Returning a function from the effect registers a **cleanup** that runs before the effect re-runs, and again on unmount. This is how you prevent leaked subscriptions, dangling timers, and stale network responses from clobbering fresh state.

::code-wrapper{language="javascript"}
```javascript
function ChatRoom({ roomId }) {
  useEffect(() => {
    const connection = createConnection(roomId)
    connection.connect()

    return () => {
      connection.disconnect()  // runs before reconnecting to a new roomId, and on unmount
    }
  }, [roomId])

  return <div>Connected to {roomId}</div>
}
```
::

The cleanup-then-effect cycle on every dependency change is: **cleanup(old) → effect(new)**. So switching `roomId` from `"lobby"` to `"general"` disconnects from `"lobby"` first, then connects to `"general"` — never leaving two connections open simultaneously.

### Race Conditions: The Classic Data-Fetching Bug

Fetching data in an effect without cleanup can let a slow, stale request's response overwrite a newer one, because network responses can arrive out of order relative to when the requests were fired.

::code-wrapper{language="javascript"}
```javascript
// BUG: if the user changes userId quickly (A -> B), and A's request is
// slower than B's, A's response arrives LAST and overwrites B's correct data.
function UserProfile({ userId }) {
  const [user, setUser] = useState(null)

  useEffect(() => {
    fetchUser(userId).then(setUser)
  }, [userId])

  return user ? <Profile user={user} /> : <Spinner />
}
```
::

::code-wrapper{language="javascript"}
```javascript
// Fixed: a cancellation flag ignores stale responses
function UserProfile({ userId }) {
  const [user, setUser] = useState(null)

  useEffect(() => {
    let cancelled = false

    fetchUser(userId).then(data => {
      if (!cancelled) setUser(data)
    })

    return () => { cancelled = true }
  }, [userId])

  return user ? <Profile user={user} /> : <Spinner />
}
```
::

Chapter 17 covers the full production pattern (loading/error states, `AbortController`, and why libraries like React Query exist largely to solve this class of problem once and for all).

## Common Mistake: The Infinite Loop

If an effect sets state that is itself (directly or via a derived value) in its own dependency array without a stable identity, you get an infinite render loop.

::code-wrapper{language="javascript"}
```javascript
// BUG: `options` is a NEW object literal every render, so the dependency
// array "changes" every render even though its contents look the same,
// causing the effect to fire every render, forever.
function SearchPanel({ query }) {
  const options = { caseSensitive: false, maxResults: 20 }  // new reference each render

  const [results, setResults] = useState([])

  useEffect(() => {
    search(query, options).then(setResults)
  }, [query, options])  // options never === the previous options

  return <ResultsList results={results} />
}
```
::

::code-wrapper{language="javascript"}
```javascript
// Fixed: move the stable object outside the component, or memoize it (chapter 9),
// or — simplest here — inline only the primitive values the effect actually needs.
const DEFAULT_OPTIONS = { caseSensitive: false, maxResults: 20 }

function SearchPanel({ query }) {
  const [results, setResults] = useState([])

  useEffect(() => {
    search(query, DEFAULT_OPTIONS).then(setResults)
  }, [query])

  return <ResultsList results={results} />
}
```
::

A related and even more direct version of this bug: setting state unconditionally inside an effect that depends on that same state.

::code-wrapper{language="javascript"}
```javascript
// BUG: infinite loop. Every render sets `count`, which is a dependency,
// which triggers the effect again, which sets `count` again, forever.
function Broken() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    setCount(count + 1)
  }, [count])
  return <p>{count}</p>
}
```
::

## Effects vs. Layout Effects

`useLayoutEffect` has an identical API to `useEffect` but runs **synchronously after DOM mutations, before the browser paints**. Use it only when you must measure or mutate the DOM in a way that would otherwise cause a visible flicker with the deferred `useEffect` timing.

::code-wrapper{language="javascript"}
```javascript
import { useLayoutEffect, useRef, useState } from 'react'

function Tooltip({ text, anchorRef }) {
  const tooltipRef = useRef(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  useLayoutEffect(() => {
    // Measuring and repositioning must happen BEFORE paint, or the user
    // briefly sees the tooltip in the wrong place before it "jumps."
    const anchorRect = anchorRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()
    setPosition({
      top: anchorRect.bottom,
      left: anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2,
    })
  }, [text])

  return <div ref={tooltipRef} className="tooltip" style={position}>{text}</div>
}
```
::

**Rule of thumb**: default to `useEffect`. Reach for `useLayoutEffect` only when you have a concrete, observed flicker caused by a DOM read/write that needs to happen before paint — it blocks the browser from painting until it finishes, so overusing it costs perceived performance.

## Lifecycle Mapping (For Class-Component Literacy)

You'll encounter this mapping in older codebases and migration guides. It's an approximation, not an exact equivalence — effects are fundamentally a different model (synchronization, not lifecycle phases).

| Class lifecycle method | Function component equivalent |
|---|---|
| `componentDidMount` | `useEffect(() => { ... }, [])` |
| `componentDidUpdate` | `useEffect(() => { ... }, [dep1, dep2])` |
| `componentWillUnmount` | the cleanup function returned from `useEffect` |
| `componentDidMount` + `componentWillUnmount` combined | `useEffect(() => { setup(); return () => teardown() }, [])` |

## A Realistic Effect: Subscribing to a Browser API

::code-wrapper{language="javascript"}
```javascript
function OnlineStatusBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    function handleOnline() { setIsOnline(true) }
    function handleOffline() { setIsOnline(false) }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (isOnline) return null
  return <div className="banner banner--warning">You are offline. Changes will sync later.</div>
}
```
::

## 💡 Tips & Tricks

- **Debug** — Install and enable `eslint-plugin-react-hooks`'s `exhaustive-deps` rule and treat its warnings as errors, not suggestions — the overwhelming majority of "why is my effect using an old value" bugs are exactly the case this rule catches, and silencing it with a `// eslint-disable-next-line` comment should be rare and deliberate, not routine.
- **Idiom** — Think of the dependency array as answering "what reactive values does this effect read," not "when do I want this to run" — if you find yourself wanting to omit a value just to control timing, that's a sign the logic belongs in an event handler instead of an effect.
- **Performance** — Default to `useEffect`; only switch to `useLayoutEffect` when you have observed actual visual flicker from a DOM measurement — `useLayoutEffect` blocks the paint until it finishes, so using it by default (rather than when needed) costs real perceived performance across the whole app.
- **Debug** — When debugging "double effect firing," check for `<StrictMode>` first (chapter 1) — it deliberately mounts, cleans up, and re-mounts every effect once in development to catch missing/incorrect cleanup, and this is invisible in production builds.
- **Idiom** — Not everything needs an effect. Deriving a value from props/state during render (`const fullName = first + ' ' + last`) doesn't need `useEffect` at all — reach for an effect only when synchronizing with something *outside* React (the network, the DOM, a subscription, browser storage), not for pure calculations.

## ⚠️ Edge Cases & Gotchas

- **Omitting the dependency array runs the effect after every render** — easy to do by accident when refactoring; unlike `[]` (mount-only) or `[dep]` (mount + when dep changes), no array at all means "always," which is rarely intentional and often devastating for effects that make network calls or set up subscriptions.
- **New object/array/function literals as dependencies break memoized dependency comparisons** — `useEffect(() => {...}, [{ id }])` or `[() => {}]` creates a brand-new reference every render, so the dependency "changes" every time by reference even when its contents are identical — causing the effect to fire every render despite an apparently-correct array.
- **Effects run on the client only — they never run during server rendering** — code that must run isomorphically (or that specifically needs to run before hydration) cannot live in `useEffect`; this becomes directly relevant once server components/SSR enter the picture (chapter 22).
- **The cleanup function captures the *same* closure as its effect, not a fresh one** — if an effect's cleanup references a value from props/state, it sees that render's value, not whatever is current when the cleanup actually executes; this is the same stale-closure mechanism as `useState` (chapter 4), applied to the teardown path specifically.
- **Cleanup runs BEFORE the next effect, not after** — for `[roomId]` changing from `"a"` to `"b"`, the sequence is cleanup(`"a"`) then effect(`"b"`), never effect(`"b"`) then cleanup(`"a"`) — code that assumes the old resource is still around when the new effect starts will find it's already been torn down.

## 🧠 Spot the Bug

A component is supposed to log the current `filter` value exactly three seconds after the user changes it, but debounced. Instead, it always logs the filter value from when the component first mounted.

::code-wrapper{language="javascript"}
```javascript
function FilterLogger({ filter }) {
  useEffect(() => {
    const id = setTimeout(() => {
      console.log('Filter settled on:', filter)
    }, 3000)
    return () => clearTimeout(id)
  }, [])

  return null
}
```
::

<details>
<summary>Answer</summary>

The dependency array is `[]`, so the effect runs exactly once, on mount, and never again — meaning the `setTimeout` closure it creates captures `filter`'s value from that very first render, forever. Even though `filter` changes on every parent re-render, this effect never re-runs to pick up the new value or reset its timer, so the logged value is permanently frozen at the initial one.

**The lesson**: any reactive value read inside an effect (here, `filter`) belongs in the dependency array — `[filter]` would make the effect re-run (canceling the old timeout via cleanup and starting a fresh one) every time `filter` actually changes, which is exactly the debounce behavior intended.

</details>

## Key Takeaways

- `useEffect` synchronizes a component with something outside React (network, DOM, subscriptions, timers) — it runs after paint, not during render.
- The dependency array is a contract: every reactive value the effect reads must be listed, or the effect's closure goes stale. Trust `exhaustive-deps` lint warnings.
- Returning a cleanup function handles unsubscribing/canceling; it runs before every re-run of the effect and on unmount, in the order cleanup(old) → effect(new).
- Fetching data in an effect without a cancellation guard is subject to race conditions where a slower, stale request overwrites fresher data.
- New object/array/function literals as dependencies (or in the effect body) are a leading cause of "effect fires every render" and infinite-loop bugs.
- `useLayoutEffect` is a rare, deliberate escape hatch for DOM measurements that must happen before paint — default to `useEffect` otherwise.
