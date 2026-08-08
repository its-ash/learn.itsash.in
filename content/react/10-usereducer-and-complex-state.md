# 10 — `useReducer` & Complex State

## Why `useState` Stops Scaling

`useState` is ideal for independent, simple values. Once a component's state involves multiple sub-values that update together, transition through defined stages, or depend on the *action taken* rather than just "set this field," managing it as several separate `useState` calls tends to spread related logic across scattered `setX` calls, invite impossible in-between states, and make the actual state transitions hard to see in one place.

`useReducer` centralizes state transitions into a single function: given the current state and an action describing "what happened," it returns the next state. This is the same pattern as Redux (chapter 18) — indeed, Redux's core idea is a `useReducer`-shaped state container with extra tooling around it.

## Basic Shape

::code-wrapper{language="javascript"}
```javascript
import { useReducer } from 'react'

function reducer(state, action) {
  switch (action.type) {
    case 'increment':
      return { count: state.count + 1 }
    case 'decrement':
      return { count: state.count - 1 }
    case 'reset':
      return { count: 0 }
    default:
      throw new Error(`Unknown action type: ${action.type}`)
  }
}

function Counter() {
  const [state, dispatch] = useReducer(reducer, { count: 0 })

  return (
    <div>
      <p>{state.count}</p>
      <button onClick={() => dispatch({ type: 'increment' })}>+1</button>
      <button onClick={() => dispatch({ type: 'decrement' })}>-1</button>
      <button onClick={() => dispatch({ type: 'reset' })}>Reset</button>
    </div>
  )
}
```
::

`useReducer(reducer, initialState)` returns `[state, dispatch]`. Calling `dispatch(action)` schedules a re-render with `reducer(currentState, action)` as the new state — you never call the reducer function yourself.

## `useReducer` vs. `useState`: When to Reach for Which

| Situation | Prefer |
|---|---|
| A single independent value (a toggle, a text input) | `useState` |
| Several fields that always change together as one unit | `useReducer`, or a single object `useState` |
| State transitions depend on the *previous state* in non-trivial ways | `useReducer` |
| The component has many possible "events" that each affect state differently (forms, wizards, games) | `useReducer` |
| You want state transition logic to be testable in isolation, outside of any component | `useReducer` — the reducer is a pure function, trivially unit-testable |

## A Realistic Example: An Async Data-Fetching Reducer

This formalizes the "status string" pattern introduced in chapter 4, making illegal states genuinely unrepresentable and centralizing every transition in one auditable function.

::code-wrapper{language="javascript"}
```javascript
const initialState = { status: 'idle', data: null, error: null }

function fetchReducer(state, action) {
  switch (action.type) {
    case 'FETCH_STARTED':
      return { status: 'loading', data: null, error: null }
    case 'FETCH_SUCCEEDED':
      return { status: 'success', data: action.payload, error: null }
    case 'FETCH_FAILED':
      return { status: 'error', data: null, error: action.payload }
    default:
      return state
  }
}

function UserProfile({ userId }) {
  const [state, dispatch] = useReducer(fetchReducer, initialState)

  useEffect(() => {
    let cancelled = false
    dispatch({ type: 'FETCH_STARTED' })

    fetchUser(userId)
      .then(data => { if (!cancelled) dispatch({ type: 'FETCH_SUCCEEDED', payload: data }) })
      .catch(err => { if (!cancelled) dispatch({ type: 'FETCH_FAILED', payload: err.message }) })

    return () => { cancelled = true }
  }, [userId])

  if (state.status === 'loading') return <Spinner />
  if (state.status === 'error') return <ErrorMessage message={state.error} />
  if (state.status === 'success') return <ProfileCard user={state.data} />
  return null
}
```
::

Compare this to the equivalent with three separate `useState` calls: nothing enforces that `error` gets cleared when a new fetch starts, or that `data` and `error` aren't both non-null simultaneously. Every transition here is explicit and impossible to get "half right" by forgetting to reset a sibling piece of state.

## A Multi-Step Form Wizard

`useReducer` shines for stateful flows with many distinct actions — form wizards, multi-step checkouts, undo/redo, games.

::code-wrapper{language="javascript"}
```javascript
const initialFormState = {
  step: 1,
  values: { name: '', email: '', plan: null },
  errors: {},
}

function wizardReducer(state, action) {
  switch (action.type) {
    case 'FIELD_CHANGED':
      return {
        ...state,
        values: { ...state.values, [action.field]: action.value },
        errors: { ...state.errors, [action.field]: undefined },
      }
    case 'VALIDATION_FAILED':
      return { ...state, errors: action.errors }
    case 'NEXT_STEP':
      return { ...state, step: state.step + 1 }
    case 'PREV_STEP':
      return { ...state, step: Math.max(1, state.step - 1) }
    case 'RESET':
      return initialFormState
    default:
      return state
  }
}

function SignupWizard() {
  const [state, dispatch] = useReducer(wizardReducer, initialFormState)

  function handleNext() {
    const errors = validateStep(state.step, state.values)
    if (Object.keys(errors).length > 0) {
      dispatch({ type: 'VALIDATION_FAILED', errors })
      return
    }
    dispatch({ type: 'NEXT_STEP' })
  }

  return (
    <div>
      {state.step === 1 && (
        <NameEmailStep
          values={state.values}
          errors={state.errors}
          onChange={(field, value) => dispatch({ type: 'FIELD_CHANGED', field, value })}
        />
      )}
      {state.step === 2 && <PlanStep values={state.values} onChange={/* ... */ () => {}} />}
      <button onClick={() => dispatch({ type: 'PREV_STEP' })} disabled={state.step === 1}>Back</button>
      <button onClick={handleNext}>Next</button>
    </div>
  )
}
```
::

## Lazy Initialization with `useReducer`

Like `useState`, `useReducer` accepts a third argument — an init function — for expensive or derived initial state, applied to the second argument.

::code-wrapper{language="javascript"}
```javascript
function init(initialCount) {
  return { count: initialCount, history: [initialCount] }
}

function reducer(state, action) {
  switch (action.type) {
    case 'increment': {
      const next = state.count + 1
      return { count: next, history: [...state.history, next] }
    }
    case 'reset':
      return init(action.payload)  // reuse init to reset cleanly
    default:
      return state
  }
}

function CounterWithHistory({ startAt }) {
  const [state, dispatch] = useReducer(reducer, startAt, init)
  // init(startAt) runs once, on mount — same lazy-initialization contract as useState
  return (
    <div>
      <p>{state.count}</p>
      <button onClick={() => dispatch({ type: 'increment' })}>+1</button>
      <button onClick={() => dispatch({ type: 'reset', payload: startAt })}>Reset</button>
    </div>
  )
}
```
::

## Combining `useReducer` with Context

The single most common production pattern for "app-wide state without a full library" is a reducer's `state` and `dispatch` shared via Context — this is conceptually identical to a minimal hand-rolled Redux.

::code-wrapper{language="javascript"}
```javascript
const CartStateContext = createContext(null)
const CartDispatchContext = createContext(null)

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM':
      return { ...state, items: [...state.items, action.item] }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter(i => i.id !== action.id) }
    case 'CLEAR':
      return { ...state, items: [] }
    default:
      return state
  }
}

function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] })

  return (
    <CartStateContext.Provider value={state}>
      <CartDispatchContext.Provider value={dispatch}>
        {children}
      </CartDispatchContext.Provider>
    </CartStateContext.Provider>
  )
}

// Split into two contexts deliberately: components that only dispatch
// (e.g., an "Add to Cart" button) never re-render when the cart's ITEMS
// change, because dispatch itself is a stable function reference forever.
function useCartState() { return useContext(CartStateContext) }
function useCartDispatch() { return useContext(CartDispatchContext) }
```
::

::code-wrapper{language="javascript"}
```javascript
function AddToCartButton({ product }) {
  const dispatch = useCartDispatch()  // never causes THIS component to re-render on cart changes
  return (
    <button onClick={() => dispatch({ type: 'ADD_ITEM', item: product })}>
      Add to Cart
    </button>
  )
}

function CartSummary() {
  const { items } = useCartState()  // re-renders only when cart state actually changes
  return <p>{items.length} items in cart</p>
}
```
::

This dispatch/state context split is a real, valuable performance pattern: `dispatch` returned by `useReducer` is guaranteed stable across renders (same reference forever, similar to a `useState` setter), so components that only need to dispatch actions — never read state — can subscribe to a context that never triggers their re-render.

## `useReducer` Does Not Replace `useState` Everywhere

It's tempting, once learned, to reach for `useReducer` universally "for consistency." Resist this for simple, independent values — a lone boolean toggle or a single text input gains nothing from a reducer and loses the directness of `setValue(x)`.

::code-wrapper{language="javascript"}
```javascript
// Overkill for a single boolean
function reducer(state, action) {
  switch (action.type) {
    case 'toggle': return !state
    default: return state
  }
}
function Toggle() {
  const [isOpen, dispatch] = useReducer(reducer, false)
  return <button onClick={() => dispatch({ type: 'toggle' })}>{isOpen ? 'Open' : 'Closed'}</button>
}

// Simpler and equally correct
function Toggle() {
  const [isOpen, setIsOpen] = useState(false)
  return <button onClick={() => setIsOpen(o => !o)}>{isOpen ? 'Open' : 'Closed'}</button>
}
```
::

## 💡 Tips & Tricks

- **Idiom** — Reach for `useReducer` once a component's state involves multiple fields that change together, or once you find yourself writing more than two or three `useState` calls whose updates are logically coupled — centralizing the transitions in one reducer function makes the state machine explicit and testable.
- **Debug** — A reducer is a pure function with no dependency on React at all — unit test it directly (`expect(reducer(state, action)).toEqual(expected)`) without rendering any component, which is both faster and catches logic bugs closer to their source than a full component test would.
- **Performance** — Split a reducer's context into a `StateContext` and a `DispatchContext` (as shown above) when dispatch-only consumers (buttons that fire actions but never read state) are common — `dispatch` is referentially stable forever, so those consumers never re-render due to state changes.
- **Idiom** — Give every action a `type` string and, when needed, a clearly named payload field (`payload`, or an explicit name like `item`/`id`) — consistent action shapes make a reducer's `switch` statement easy to scan and match the conventions of Redux DevTools and Redux Toolkit if you later migrate (chapter 18).
- **Debug** — Add a `default: throw new Error(...)` branch (rather than silently returning `state`) during development to catch typo'd action types immediately, rather than discovering "nothing happened when I dispatched" through silent, confusing UI inaction.

## ⚠️ Edge Cases & Gotchas

- **Reducers must be pure — no side effects, no mutation, no randomness** — calling `fetch`, mutating `state` in place, or reading `Date.now()`/`Math.random()` directly inside a reducer breaks React's ability to reason about state deterministically (especially under Strict Mode's double-invocation or concurrent rendering) — side effects belong in `useEffect`, triggered by the resulting state, not inside the reducer itself.
- **Returning the same state reference from every branch (including `default`) is required for bail-out optimization** — if a reducer accidentally always returns a new object (e.g., `default: return { ...state }` instead of `default: return state`), React can't detect "nothing changed" and may re-render more than necessary.
- **Actions dispatched in a loop or rapid succession are still all processed, each against the correct preceding state** — unlike the `useState` value-form pitfall from chapter 4, `dispatch` always queues against the latest pending state, so `dispatch({type:'increment'})` called three times in one handler correctly increments three times — this is one advantage `useReducer` has by construction over naive `useState` value-form updates.
- **The reducer function itself should be defined outside the component (or memoized) to stay stable** — defining `function reducer(state, action) {...}` inside the component body recreates it every render; while `useReducer` doesn't require the reducer to be referentially stable to function correctly, keeping it outside the component avoids confusion and accidental closures over stale props.
- **`useReducer`'s initial state argument is only used on mount, just like `useState`** — passing a fresh object as the second argument to `useReducer` on every render does not reset state on every render; React only reads it once, on the initial call, exactly like `useState`'s initial value argument.

## 🧠 Spot the Bug

A reducer-based shopping cart is supposed to track a running total, but the total silently falls out of sync with the actual items after several add/remove operations.

::code-wrapper{language="javascript"}
```javascript
function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM': {
      state.items.push(action.item)
      state.total += action.item.price
      return state
    }
    case 'REMOVE_ITEM': {
      state.items = state.items.filter(i => i.id !== action.id)
      return state
    }
    default:
      return state
  }
}
```
::

<details>
<summary>Answer</summary>

`ADD_ITEM` mutates `state.items` and `state.total` directly and returns the *same* state object reference. React compares the previous and next state by reference (`Object.is`) to decide whether to re-render — since the reducer returns the identical object it was given, React may skip the re-render entirely even though the data technically changed, and any memoized selectors or `React.memo`'d children reading this state see no change at all. Separately, `REMOVE_ITEM` updates `items` but never recomputes `total`, so removing an item leaves the total showing the old, now-incorrect sum.

**The lesson**: reducers must return a brand-new state object for every change (`{ ...state, items: [...state.items, action.item], total: state.total + action.item.price }`), both so React's reference-based change detection actually fires, and so every dependent field (like `total`) is recomputed consistently on every relevant action — mutating and returning the same object silently breaks both guarantees.

</details>

## Key Takeaways

- `useReducer` centralizes state transitions into one pure function — `(state, action) => newState` — dispatched via `dispatch(action)` rather than direct setters.
- Prefer it over multiple `useState` calls once fields update together, transitions depend heavily on prior state, or the component has many distinct "events" (forms, wizards, games).
- Reducers must be pure: no mutation, no side effects, always return a new state object for any actual change.
- `dispatch` is referentially stable across renders (like a `useState` setter) — splitting state and dispatch into separate contexts lets dispatch-only consumers avoid re-rendering on state changes.
- A reducer is trivially unit-testable in isolation, with no component rendering required — a real advantage over logic scattered across several `useState` setters.
- Don't reach for `useReducer` for simple, independent values — plain `useState` remains simpler and equally correct there.
