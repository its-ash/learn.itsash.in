# 04 — State & `useState`

## Why State Exists

Props let a component receive data; **state** lets a component *own and change* data over time and re-render when it does. Every interactive UI — a checkbox, a form, a counter, a modal that opens and closes — needs a place to store "what's true right now" that persists between renders and triggers a re-render when it changes. `useState` is the primitive hook for that.

::code-wrapper{language="javascript"}
```javascript
import { useState } from 'react'

function Counter() {
  const [count, setCount] = useState(0)

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>+1</button>
    </div>
  )
}
```
::

`useState(initialValue)` returns a pair: the current value, and a setter function. Calling the setter schedules a re-render with the new value — it does **not** mutate the variable in place (there's no variable to mutate; `count` is a fresh binding produced fresh on every render).

## The Mental Model: State Is a Snapshot, Not a Live Variable

Each render "sees" its own snapshot of state, captured at the moment that render's function body ran. This is the single most important — and most frequently misunderstood — fact about `useState`.

::code-wrapper{language="javascript"}
```javascript
function Counter() {
  const [count, setCount] = useState(0)

  function handleClick() {
    setCount(count + 1)
    setCount(count + 1)
    setCount(count + 1)
    // You might expect count to jump by 3. It only jumps by 1.
  }

  return <button onClick={handleClick}>Count: {count}</button>
}
```
::

All three calls in `handleClick` close over the *same* `count` value from that render (say, `0`). Each call is `setCount(0 + 1)` — they all schedule the state to become `1`, not `1`, then `2`, then `3`. React doesn't re-run the component between these lines; it batches them and applies the final scheduled value.

## Functional Updates: The Fix for the Above

When the next state depends on the previous state, pass a function to the setter instead of a value. React guarantees it's called with the most up-to-date pending state, even across multiple queued updates in the same event.

::code-wrapper{language="javascript"}
```javascript
function Counter() {
  const [count, setCount] = useState(0)

  function handleClick() {
    setCount(c => c + 1)
    setCount(c => c + 1)
    setCount(c => c + 1)
    // Now each updater receives the result of the previous one: 0 -> 1 -> 2 -> 3
  }

  return <button onClick={handleClick}>Count: {count}</button>
}
```
::

**Rule of thumb**: if your new state is computed from the old state, always use the functional form (`setCount(c => c + 1)`), never the value form (`setCount(count + 1)`) — the functional form is correct in every situation the value form is, and additionally correct in situations (rapid clicks, multiple updates per event, updates inside `setTimeout`/async callbacks) where the value form silently drops updates.

## Stale State in Closures (Async Gotcha)

The snapshot model bites hardest inside asynchronous callbacks, where a function created during one render keeps referencing that render's `count` even after several renders have happened by the time it actually executes.

::code-wrapper{language="javascript"}
```javascript
function DelayedCounter() {
  const [count, setCount] = useState(0)

  function handleClick() {
    setTimeout(() => {
      // BUG: this closure captured `count` from the render when handleClick was created.
      // If the user clicks multiple times before the timeout fires, every timeout
      // logs/uses the SAME stale count, not the count at the time it fires.
      setCount(count + 1)
    }, 3000)
  }

  return <button onClick={handleClick}>Count: {count}</button>
}
```
::

::code-wrapper{language="javascript"}
```javascript
function DelayedCounter() {
  const [count, setCount] = useState(0)

  function handleClick() {
    setTimeout(() => {
      setCount(c => c + 1)  // Always reads the latest pending state, not a stale closure
    }, 3000)
  }

  return <button onClick={handleClick}>Count: {count}</button>
}
```
::

This same stale-closure trap reappears with `useEffect` (chapter 6) — it's one mental model, applied everywhere a function outlives the render that created it.

## Lazy Initial State

If computing the initial state is expensive, pass a function to `useState` instead of a value. React calls it exactly once, on the first render only — passing a plain expensive call instead re-runs it on *every* render, even though the result is thrown away every time except the first.

::code-wrapper{language="javascript"}
```javascript
function ExpensiveInit() {
  // BUG: parseHugeDataset() runs on EVERY render, even though only the first
  // call's result is ever used. Wasted work on every re-render.
  const [data, setData] = useState(parseHugeDataset(rawInput))
  // ...
}
```
::

::code-wrapper{language="javascript"}
```javascript
function ExpensiveInit() {
  // Fix: pass a function. React only invokes it once, on mount.
  const [data, setData] = useState(() => parseHugeDataset(rawInput))
  // ...
}
```
::

This applies equally to reading from `localStorage`, parsing a large JSON blob, or any non-trivial computation used only to seed initial state.

::code-wrapper{language="javascript"}
```javascript
function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved ? JSON.parse(saved) : { mode: 'light', accent: 'blue' }
  })
  // ...
}
```
::

## Batching: React 17 vs. React 18

**Batching** means React groups multiple `setState` calls that happen within the same event into a single re-render, rather than re-rendering once per call. This has always been true *inside* React event handlers. What changed in React 18 is **automatic batching everywhere** — including inside promises, `setTimeout`, native event handlers, and any other non-React-triggered callback.

::code-wrapper{language="javascript"}
```javascript
function Example() {
  const [count, setCount] = useState(0)
  const [flag, setFlag] = useState(false)

  function handleClick() {
    // React 17: batched (inside a React event handler) -> ONE re-render
    // React 18: also batched -> ONE re-render (no change here)
    setCount(c => c + 1)
    setFlag(f => !f)
  }

  function handleFetch() {
    fetch('/api/data').then(() => {
      // React 17: NOT batched here -> TWO re-renders (each setState flushes separately)
      // React 18: batched automatically -> ONE re-render
      setCount(c => c + 1)
      setFlag(f => !f)
    })
  }

  return <button onClick={handleClick}>{count}</button>
}
```
::

Automatic batching is a performance win you get for free by upgrading to React 18 with `createRoot` — but it can surprise code that relied on synchronous, one-render-per-`setState` behavior outside event handlers. If you genuinely need to force a synchronous flush between two updates (rare), `flushSync` from `react-dom` opts out for that specific call.

## Multiple `useState` Calls vs. One Object

Both are valid; the choice affects update ergonomics and re-render granularity.

::code-wrapper{language="javascript"}
```javascript
// Separate state variables — simplest for independent values
function ProfileForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [age, setAge] = useState(0)
  // Each setter updates independently; no risk of accidentally clobbering siblings.
}
```
::

::code-wrapper{language="javascript"}
```javascript
// One object — useful when fields are logically grouped, but requires manual merging
function ProfileForm() {
  const [form, setForm] = useState({ name: '', email: '', age: 0 })

  function updateField(field, value) {
    // Gotcha: useState does NOT shallow-merge like class `this.setState` did.
    // Forgetting the spread replaces the ENTIRE object, dropping other fields.
    setForm(prev => ({ ...prev, [field]: value }))
  }
}
```
::

This is a real and common migration bug for developers coming from class components: `this.setState({ name: 'Alice' })` used to merge into existing state automatically. `useState`'s setter **replaces** the value outright — for objects, you must spread the previous state yourself.

::code-wrapper{language="javascript"}
```javascript
// BUG: replaces the whole object, silently dropping email and age
setForm({ name: 'Alice' })

// Correct: spread previous state, then override the changed field
setForm(prev => ({ ...prev, name: 'Alice' }))
```
::

## `useState` with Arrays: Immutable Update Patterns

Arrays have the same reference-identity requirement — React only re-renders when it sees a *new* reference (via `Object.is` comparison), so in-place mutation methods (`push`, `splice`, `sort`) don't trigger updates even though they technically change the array's contents.

::code-wrapper{language="javascript"}
```javascript
function TodoList() {
  const [todos, setTodos] = useState([])

  function addTodo(text) {
    // BUG: push() mutates in place and returns the new length, not the array.
    // Also, since the reference itself is unchanged, React may skip re-rendering.
    todos.push({ id: crypto.randomUUID(), text, done: false })
    setTodos(todos)
  }

  function addTodoFixed(text) {
    // Correct: build a new array via spread, preserving immutability
    setTodos(prev => [...prev, { id: crypto.randomUUID(), text, done: false }])
  }

  function toggleTodo(id) {
    setTodos(prev => prev.map(t => (t.id === id ? { ...t, done: !t.done } : t)))
  }

  function removeTodo(id) {
    setTodos(prev => prev.filter(t => t.id !== id))
  }
}
```
::

## A Realistic Example: Loading, Error, and Data States Together

::code-wrapper{language="javascript"}
```javascript
function UserProfile({ userId }) {
  const [status, setStatus] = useState('idle')
  const [user, setUser] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    fetchUser(userId)
      .then(data => {
        if (cancelled) return
        setUser(data)
        setStatus('success')
      })
      .catch(err => {
        if (cancelled) return
        setError(err)
        setStatus('error')
      })

    return () => { cancelled = true }
  }, [userId])

  if (status === 'loading') return <Spinner />
  if (status === 'error') return <ErrorMessage error={error} />
  if (status === 'success') return <ProfileCard user={user} />
  return null
}
```
::

This "status string" pattern (`idle` / `loading` / `success` / `error`) avoids the classic problem of tracking `isLoading`/`data`/`error` as three independent booleans/values that can drift into impossible combinations (e.g., `isLoading: true` and `error` both set). Chapter 10 (`useReducer`) formalizes this pattern further; chapter 17 covers the full data-fetching lifecycle.

## 💡 Tips & Tricks

- **Idiom** — Default to the functional updater form (`setCount(c => c + 1)`) any time the new value depends on the old one; it's never wrong, and it silently fixes a whole class of "missed update" bugs that only show up under rapid clicks or async timing.
- **Performance** — Pass a function to `useState` (`useState(() => expensiveInit())`) instead of calling the expensive computation inline — the function form runs exactly once, on mount, while the inline form silently re-runs (and discards the result of) every single render.
- **Debug** — When state seems to "lag one step behind" what you just set, remember `setState` schedules a re-render for the *next* render — reading the state variable immediately after calling its setter, in the same line of code, always shows the old value, because the current render's snapshot never changes after the fact.
- **Idiom** — Model multi-state async flows (loading/error/success) as a single string/enum rather than three independent booleans; it makes impossible states (loading AND error both true) structurally impossible instead of just "shouldn't happen."
- **Debug** — If you're debugging a component that seems to only ever apply the *first* of several rapid state updates in one handler, check whether you're using `setCount(count + 1)` (value form, stale) instead of `setCount(c => c + 1)` (functional form, always current) — this is the single most common `useState` bug in real codebases.

## ⚠️ Edge Cases & Gotchas

- **`useState`'s setter does not merge objects like class `this.setState` did** — replacing state with a partial object (`setForm({ name: 'x' })`) drops every other key; always spread previous state manually (`setForm(prev => ({ ...prev, name: 'x' }))`) when state is an object.
- **Calling the setter with the same value (by `Object.is`) bails out of re-rendering** — `setCount(5)` when `count` is already `5` does not trigger a re-render at all, even though React still calls your component function once to check — this is a built-in optimization, not a bug, but can confuse debugging when you expect a re-render to "always happen."
- **Mutating array/object state in place doesn't trigger a re-render, even though the data changed** — `todos.push(x); setTodos(todos)` passes the *same reference* back to the setter; since `Object.is(oldTodos, newTodos)` is true, React may skip the update, leaving the UI stale despite the underlying array having the new item.
- **State updates inside `setTimeout`/promises close over the render's variables, not "live" values** — a `setCount(count + 1)` inside a callback scheduled from render N always uses render N's `count`, even if 10 more renders have happened by the time the callback fires; only the functional updater form or a ref (chapter 8) reads a "live" value.
- **Lazy initializer functions run once per component instance, not once globally** — `useState(() => expensiveInit())` still re-runs the initializer for *each* separate mounted instance of the component (e.g., each item in a list rendering the same component) — the "runs once" guarantee is per-instance, per-mount, not a global memoization.

## 🧠 Spot the Bug

A save button is supposed to increment a retry counter by however many times it's clicked within a short burst, then log the final total after a delay for analytics.

::code-wrapper{language="javascript"}
```javascript
function RetryButton() {
  const [retries, setRetries] = useState(0)

  function handleClick() {
    setRetries(retries + 1)
    setTimeout(() => {
      console.log('Current retries:', retries)
    }, 1000)
  }

  return <button onClick={handleClick}>Retry ({retries})</button>
}
```
::

<details>
<summary>Answer</summary>

Two separate bugs stack here. First, `setRetries(retries + 1)` uses the value form — if the user clicks three times quickly, each click's handler closed over the *same* `retries` value from its own render, so rapid clicks can under-count instead of accumulating correctly (though React 18's batching plus same-render `count` means each individual click still applies correctly; the real trap is the second half). Second, and more clearly, the `console.log` inside `setTimeout` closes over `retries` from the render at the moment the button was clicked — it will always log the value *before* that click's increment was applied, not the current on-screen count, because the closure captured a stale snapshot.

**The lesson**: any value read inside an async callback (`setTimeout`, a promise `.then`, an event listener) is frozen at the value it had when that callback was created — use the functional updater for the state change itself, and a ref (chapter 8) if you need to read the truly current value inside a delayed callback.

</details>

## Key Takeaways

- `useState` returns `[value, setter]`; each render captures its own immutable snapshot of that value — it's not a live, mutable variable.
- Use the functional updater form (`setX(x => ...)`) whenever new state depends on old state — it's always correct, unlike the plain value form.
- Pass a function (not a called expression) to `useState` for expensive initial values — it only runs once, on mount.
- React 18 batches state updates everywhere (promises, timeouts, native handlers), not just inside React event handlers as in React 17 — expect fewer re-renders after upgrading.
- `useState`'s setter replaces state, it doesn't merge — spread previous object/array state manually.
- Async callbacks close over the render's state snapshot; use functional updates or refs to avoid acting on stale values.
