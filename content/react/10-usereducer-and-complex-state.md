---
title: "10 — useReducer & Complex State"
description: "useReducer mechanics, action dispatch, reducer composition, when to choose useReducer over useState, and production patterns for multi-field forms and state machines. Code-first reference for mid-to-senior React engineers."
---

# 10 — `useReducer` & Complex State

## useState vs useReducer: The Decision

::code-wrapper{language="javascript" filename="usestate_vs_usereducer.js"}
```javascript
// useState: independent values, simple updates, 1-3 state fields
// useReducer: interdependent state, complex transitions, many fields, state machines

// USE useState WHEN:
// - State is a single primitive or simple object
// - Updates are independent (setA doesn't affect B)
// - Few state fields (1-3)
// - Update logic is a one-liner

// USE useReducer WHEN:
// - Multiple state fields update together (interdependent)
// - Next state depends on complex conditions
// - You need a clear audit trail of state transitions (actions)
// - State has a finite set of well-defined "modes" or "phases"
// - Update logic is more than 2-3 lines
// - Testing the state logic separately matters (reducers are pure functions)
```
::

## useReducer Anatomy

::code-wrapper{language="javascript" filename="usereducer_anatomy.js"}
```javascript
import { useReducer } from 'react'

// useReducer(reducer, initialState) → [state, dispatch]
// reducer: (state, action) → newState  (PURE function, no side effects)
// action: { type: string, ...payload }

const initialState = { count: 0, step: 1 }

function counterReducer(state, action) {
  switch (action.type) {
    case 'increment':
      return { ...state, count: state.count + state.step }
    case 'decrement':
      return { ...state, count: state.count - state.step }
    case 'setStep':
      return { ...state, step: action.step }
    case 'reset':
      return initialState
    default:
      // CRITICAL: always return state in default — throwing is also acceptable.
      // Returning state (not throwing) means unknown actions are silently ignored.
      // Throwing catches bugs in development: assertUnreachable(action.type)
      return state
  }
}

function Counter() {
  const [state, dispatch] = useReducer(counterReducer, initialState)
  return (
    <div>
      <span>{state.count}</span>
      <button onClick={() => dispatch({ type: 'increment' })}>+</button>
      <button onClick={() => dispatch({ type: 'decrement' })}>−</button>
      <button onClick={() => dispatch({ type: 'setStep', step: 5 })}>Step 5</button>
      <button onClick={() => dispatch({ type: 'reset' })}>Reset</button>
    </div>
  )
}
```
::

## Production Pattern: Multi-Field Form

::code-wrapper{language="javascript" filename="form_reducer.js"}
```javascript
const initialFormState = {
  values: { name: '', email: '', password: '' },
  errors: {},
  touched: { name: false, email: false, password: false },
  isSubmitting: false,
}

function formReducer(state, action) {
  switch (action.type) {
    case 'field_change':
      // Update a single field value, clear its error, keep touched as-is
      return {
        ...state,
        values: { ...state.values, [action.field]: action.value },
        errors: { ...state.errors, [action.field]: undefined },
      }
    case 'field_blur':
      // Mark field as touched and validate it
      return {
        ...state,
        touched: { ...state.touched, [action.field]: true },
        errors: {
          ...state.errors,
          [action.field]: validateField(action.field, state.values[action.field]),
        },
      }
    case 'start_submit':
      // Validate all fields, set submitting only if no errors
      const allErrors = validateAll(state.values)
      return {
        ...state,
        touched: { name: true, email: true, password: true },
        errors: allErrors,
        isSubmitting: Object.keys(allErrors).length === 0,
      }
    case 'submit_success':
      return { ...initialFormState }  // reset everything
    case 'submit_error':
      return { ...state, isSubmitting: false, errors: { ...state.errors, submit: action.error } }
    default:
      return state
  }
}

// Usage: const [formState, dispatch] = useReducer(formReducer, initialFormState)
// dispatch({ type: 'field_change', field: 'email', value: 'user@test.com' })
// dispatch({ type: 'field_blur', field: 'email' })
// dispatch({ type: 'start_submit' })
```
::

## State Machine: Async Data Fetching

::code-wrapper{language="javascript" filename="async_state_machine.js"}
```javascript
// A finite state machine for async operations: idle → loading → success/error

const initialState = { status: 'idle', data: null, error: null }

function asyncReducer(state, action) {
  switch (action.type) {
    case 'fetch_start':
      return { status: 'loading', data: null, error: null }
    case 'fetch_success':
      return { status: 'success', data: action.data, error: null }
    case 'fetch_error':
      return { status: 'error', data: null, error: action.error }
    case 'reset':
      return initialState
    default:
      return state
  }
}

function useAsyncFetch(fetchFn, deps = []) {
  const [state, dispatch] = useReducer(asyncReducer, initialState)

  useEffect(() => {
    let cancelled = false
    dispatch({ type: 'fetch_start' })
    fetchFn()
      .then(data => { if (!cancelled) dispatch({ type: 'fetch_success', data }) })
      .catch(error => { if (!cancelled) dispatch({ type: 'fetch_error', error: error.message }) })
    return () => { cancelled = true }
  }, deps)

  return state
}

// The state machine makes IMPOSSIBLE states unreachable:
// You can't be in "loading" and "success" at the same time.
// With separate useStates (setStatus, setData, setError), you CAN accidentally
// set inconsistent combinations: setStatus('loading') + setData(oldData).
```
::

## Lazy Initialization with useReducer

::code-wrapper{language="javascript" filename="lazy_init_reducer.js"}
```javascript
// useReducer supports lazy initialization (same as useState):
// useReducer(reducer, initialArg, initFunction)
// initFunction(initialArg) runs only on mount.

function init(initialCount) {
  // Read from localStorage or compute on mount only
  const saved = localStorage.getItem('count')
  return { count: saved ? parseInt(saved, 10) : initialCount, step: 1 }
}

function Counter({ initialCount }) {
  const [state, dispatch] = useReducer(reducer, initialCount, init)
  // init(initialCount) runs once on mount → no localStorage read on re-renders.
  return <div>{state.count}</div>
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Idiom] Extract the reducer and action creators into a separate file for
// testability. Reducers are PURE functions — you can unit test them in isolation
// without rendering any React components:
//   expect(reducer({ count: 0 }, { type: 'increment' })).toEqual({ count: 1 })

// [Idiom] Use a discriminated union for actions (TypeScript) to get autocomplete
// and exhaustive switch checking:
//   type Action = { type: 'increment' } | { type: 'setStep', step: number }

// [Debug] If state updates seem wrong, log every action:
//   function loggingReducer(state, action) { console.log(action); return realReducer(state, action) }

// [Idiom] For truly complex state, consider XState (finite state machine library)
// — it formalizes states, transitions, and guards. useReducer is a mini-FSM;
// XState is the full version when transitions have conditions and side effects.

// [Performance] dispatch is GUARANTEED stable (same as useState setters) — no
// need to useCallback it. Safe to pass dispatch directly to memoized children
// or include in dependency arrays without causing re-runs.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] Reducers MUST be pure — no side effects, no async, no mutations.
// Don't fetch data, set timeouts, or dispatch from inside a reducer. Side effects
// belong in useEffect (triggered by state changes), not in the reducer itself.

// [Gotcha] Always return a NEW state object — never mutate the existing one.
// return state with a mutation → React sees the same reference → no re-render.
// return { ...state, count: state.count + 1 } → new object → re-render.

// [Gotcha] The default case in a switch should return state (not throw) for
// resilience, OR throw/assert for strictness. Silently returning state on
// unknown actions can mask typos in action type strings.

// [Gotcha] dispatch is stable but the state value changes. If you pass dispatch
// to a memoized child, it won't cause re-renders. But if you pass state, the
// child re-renders whenever state changes — even parts of state it doesn't use.
// Consider splitting state or using selectors (useSyncExternalStore).
```
::

## 🧠 Spot the Bug

A reducer seems to "lose" other fields when updating one:

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
```javascript
function settingsReducer(state, action) {
  switch (action.type) {
    case 'setTheme':
      return { theme: action.theme }  // ← replaces the entire state object
    case 'setFontSize':
      return { fontSize: action.fontSize }  // ← replaces again
    default:
      return state
  }
}
```
::

<details>
<summary>Answer</summary>

Each case returns a **new object** with only one field — `return { theme: action.theme }` **replaces** the entire state, losing `fontSize` (and any other fields). The next `setFontSize` then loses `theme`.

**Fix**: spread the previous state and override only the changed field:

```javascript
case 'setTheme':
  return { ...state, theme: action.theme }
case 'setFontSize':
  return { ...state, fontSize: action.fontSize }
```

The spread preserves all other fields while updating only the target. This is the same pattern as `useState` with object state (Chapter 4) — always create a new object with the previous fields merged in.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. useReducer over useState when: state has interdependent fields, complex
//    transitions, many fields, or a finite set of "modes." Reducers are pure
//    functions: (state, action) → newState, no side effects.

// 2. Reducers are testable in isolation — no React rendering needed. Extract to
//    a separate file for unit testing state transitions.

// 3. Always spread previous state in the reducer: { ...state, changedField: value }.
//    Returning a partial object replaces the entire state — other fields are lost.

// 4. State machines (idle → loading → success/error) make impossible states
//    unreachable. With separate useStates, you can accidentally set inconsistent
//    combinations (loading=true + data=stale). A reducer prevents this by design.

// 5. dispatch is guaranteed stable (like useState setters) — safe in dependency
//    arrays and memoized children. Lazy initialization: useReducer(reducer, arg, initFn).
```
::
