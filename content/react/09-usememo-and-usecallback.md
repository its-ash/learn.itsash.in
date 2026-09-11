---
title: "09 — useMemo & useCallback"
description: "Memoization mechanics, referential equality, React.memo integration, when memoization helps vs hurts, and production patterns for optimized lists. Code-first reference for mid-to-senior React engineers."
---

# 09 — `useMemo` & `useCallback`

## What They Do and Why They Exist

::code-wrapper{language="javascript" filename="memoization_basics.js"}
```javascript
import { useMemo, useCallback } from 'react'

// useMemo: memoizes a VALUE. Returns the same reference if deps haven't changed.
const sortedList = useMemo(() => items.sort((a, b) => a.name.localeCompare(b.name)), [items])
// If items is the same reference → returns the cached sorted array
// If items changes → recomputes and returns a new array

// useCallback: memoizes a FUNCTION reference.
const handleClick = useCallback(() => doSomething(id), [id])
// If id is the same → returns the same function reference
// If id changes → returns a new function

// EQUIVALENCE: useCallback(fn, deps) === useMemo(() => fn, deps)
// useCallback is just shorthand for useMemo with a function return value.

// WHY THEY EXIST: referential equality.
// On every render, inline objects/functions create NEW references:
//   {} !== {} (same content, different object)
//   () => {} !== () => {} (same logic, different function instance)
// These new references break:
//   1. React.memo child components (shallow prop comparison fails → re-renders)
//   2. useEffect/useCallback dependency arrays (Object.is fails → effect re-runs)
//   3. Context value comparison (new object → all consumers re-render)
// useMemo/useCallback stabilize references so these comparisons succeed.
```
::

## When to Use: The Decision Matrix

::code-wrapper{language="javascript" filename="when_to_use.js"}
```javascript
// USE MEMOIZATION WHEN:
// 1. The value/function is passed to a React.memo'd child
// 2. The value/function is in a useEffect/useCallback/useMemo dependency array
// 3. The value is an expensive computation (sorting/filtering large datasets)
// 4. The value is a context provider value (Ch 7)

// DON'T USE MEMOIZATION WHEN:
// 1. The computation is cheap (arithmetic, simple string ops, small array maps)
//    — the memoization overhead (comparison + storage) costs more than the computation
// 2. The child isn't React.memo'd — it re-renders on parent render regardless
// 3. The value/function is only used in the same component (no dependency array)

// ANTI-PATTERN: wrapping everything "just in case"
function BadComponent({ data }) {
  const value = useMemo(() => data + 1, [data])  // addition is FREE — no memo needed
  const handler = useCallback(() => console.log('click'), [])  // used only here, no memo needed
  return <div onClick={handler}>{value}</div>
  // Neither the child (plain div) nor any dependency array needs stable references.
  // The useMemo/useCallback overhead is pure waste.
}
```
::

## React.memo + useCallback + useMemo: The Production Pattern

::code-wrapper{language="javascript" filename="production_memoization.js"}
```javascript
import { memo, useMemo, useCallback } from 'react'

// React.memo wraps a component and prevents re-renders when props are shallow-equal
const ExpensiveRow = memo(function Row({ item, onSelect, isSelected }) {
  // This component does expensive work (or renders many DOM nodes).
  // React.memo does a shallow comparison of props: Object.is(prevProp, nextProp)
  // If ALL props are the same reference → SKIPS re-render entirely.
  return (
    <tr className={isSelected ? 'selected' : ''} onClick={() => onSelect(item.id)}>
      <td>{item.name}</td>
      <td>{item.price}</td>
    </tr>
  )
})

function ProductTable({ items, selectedId }) {
  // 1. Memoize the sorted/filtered data so the array reference is stable
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name)),
    [items]
  )

  // 2. Memoize the handler so the function reference is stable
  const handleSelect = useCallback((id) => {
    console.log('Selected:', id)
  }, [])  // no deps → stable forever (unless it needs state/props)

  // 3. React.memo on Row + stable props → Row only re-renders when its item changes
  return (
    <table>
      <tbody>
        {sortedItems.map(item => (
          <ExpensiveRow
            key={item.id}
            item={item}
            onSelect={handleSelect}
            isSelected={item.id === selectedId}
          />
        ))}
      </tbody>
    </table>
  )
}
// Without ALL THREE (memo + useMemo + useCallback), the optimization breaks:
// - No React.memo on Row → Row re-renders on every parent render regardless
// - No useMemo on sortedItems → new array every render → Row sees new item ref
// - No useCallback on handleSelect → new function every render → prop changes → Row re-renders
```
::

## The Cost of Memoization

::code-wrapper{language="javascript" filename="memoization_cost.js"}
```javascript
// useMemo/useCallback are NOT free — they have overhead:
// 1. Comparison cost: React runs Object.is on every dep on every render
// 2. Storage cost: the memoized value + deps array are stored in fiber
// 3. GC pressure: cached values stay in memory until deps change

// RULE OF THUMB: only memoize when the cost of NOT memoizing > the cost of memoizing
//   - NOT memoizing cost: unnecessary re-render of an expensive component
//   - Memoizing cost: O(deps) comparison + memory on every render

// When memoization HURTS:
function CheapList({ items }) {
  // Items is a small array (10 items). The sort is trivial.
  const sorted = useMemo(() => items.sort(), [items])  // memo overhead > sort cost
  // If items changes frequently, the memo never hits cache → pure overhead.
  // Just compute inline: const sorted = items.sort()
  return <div>{sorted.map(i => <span key={i}>{i}</span>)}</div>
}

// When memoization HELPS:
function BigList({ items }) {
  // 10,000 items. Sort takes 50ms. Parent re-renders frequently (e.g., search box).
  const sorted = useMemo(() => items.sort((a, b) => a.score - b.score), [items])
  // If items doesn't change but parent re-renders → memo saves 50ms per render.
  return <div>{sorted.map(i => <Row key={i.id} data={i} />)}</div>
}
```
::

## Common Pitfall: Inline Objects Break memo

::code-wrapper{language="javascript" filename="inline_object_pitfall.js"}
```javascript
// ANTI-PATTERN: React.memo'd child receives a new inline object every render
const StyledButton = memo(function StyledButton({ label, style }) {
  return <button style={style}>{label}</button>
})

function Toolbar({ theme }) {
  return <StyledButton
    label="Save"
    style={{ color: theme.color, padding: '8px' }}  // ← NEW OBJECT every render
  />
  // React.memo compares prevStyle === nextStyle → {} !== {} → ALWAYS re-renders.
  // The memo is completely defeated by the inline object.
}

// FIX: memoize the style object
function Toolbar({ theme }) {
  const buttonStyle = useMemo(
    () => ({ color: theme.color, padding: '8px' }),
    [theme.color]  // only re-create when theme.color changes
  )
  return <StyledButton label="Save" style={buttonStyle} />
  // Now the style reference is stable → React.memo works.
}

// OR: hoist to module scope if truly constant
const STATIC_STYLE = { color: 'blue', padding: '8px' }
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Performance] Measure BEFORE optimizing. Use React DevTools Profiler to find
// which components re-render unnecessarily. Don't sprinkle useMemo/useCallback
// "just in case" — most components don't need them.

// [Idiom] useCallback(fn, []) is equivalent to useRef(fn).current if fn doesn't
// need any deps — but useCallback is more idiomatic and readable.

// [Debug] If React.memo doesn't seem to prevent re-renders, check for:
// 1. Inline objects: style={{...}}, config={{...}} → new ref every render
// 2. Inline functions: onClick={() => ...} → new ref every render
// 3. Children prop: <Memo>text</Memo> → children string is stable, but
//    <Memo><Child/></Memo> → new JSX element every render

// [Performance] For lists, the highest-leverage optimization is usually
// virtualization (react-window/react-virtual), not memoization. Memoization
// helps each row avoid unnecessary re-renders; virtualization avoids rendering
// rows that aren't visible at all. See Chapter 20.

// [Idiom] useMemo for expensive computations: sort/filter of large datasets,
// complex object construction, parsing. Not for arithmetic or small operations.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] React.memo does a SHALLOW comparison — Object.is on each prop.
// It does NOT deeply compare objects. { a: 1 } !== { a: 1 } → memo fails.
// You must stabilize references with useMemo/useCallback for memo to work.

// [Gotcha] React.memo with a custom comparison function:
// memo(Component, (prevProps, nextProps) => prevProps.data.id === nextProps.data.id)
// Returning true = props are equal → skip re-render. Returning false = re-render.
// This is the OPPOSITE of what you might expect (true = skip, not true = render).

// [Gotcha] useMemo doesn't guarantee the value won't be recomputed — React may
// "forget" memoized values to free memory. Don't rely on useMemo for side effects
// or as a guarantee that a computation runs exactly once. Use useRef + useState
// for "run once" semantics.

// [Gotcha] useCallback with a function that closes over state will capture the
// state at the time the callback was created. If the state changes but isn't in
// deps, the callback is stale. Always include all referenced state/props in deps.

// [Gotcha] Children passed as JSX (<Memo><Child/></Memo>) create a new element
// every render, which can defeat React.memo if children is a prop. Use
// useMemo for the children element or render children outside the memo'd boundary.
```
::

## 🧠 Spot the Bug

A `React.memo`'d child component re-renders on every parent render, even though the developer expected it to be stable:

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
```javascript
const ExpensiveChart = memo(function ExpensiveChart({ data, options, onSelect }) {
  return <Chart data={data} options={options} onSelect={onSelect} />
})

function Dashboard({ rawData, theme }) {
  return (
    <ExpensiveChart
      data={rawData}
      options={{ theme, animated: true }}  // ← new object every render
      onSelect={(id) => console.log(id)}   // ← new function every render
    />
  )
}
```
::

<details>
<summary>Answer</summary>

Both `options` and `onSelect` are inline literals — new object/function references on every render. `React.memo` does a shallow comparison (`Object.is` on each prop), and since `{ theme, animated: true } !== { theme, animated: true }` and `() => console.log(id) !== () => console.log(id)`, the memo **always** fails and the chart re-renders every time.

**Fix**:

```javascript
function Dashboard({ rawData, theme }) {
  const options = useMemo(() => ({ theme, animated: true }), [theme])
  const handleSelect = useCallback((id) => console.log(id), [])

  return <ExpensiveChart data={rawData} options={options} onSelect={handleSelect} />
}
```

Now `options` only changes when `theme` changes, and `handleSelect` is stable forever — `React.memo` succeeds and the chart only re-renders when `rawData` or `theme` actually changes.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. useMemo memoizes a VALUE, useCallback memoizes a FUNCTION reference.
//    Both return the same cached result if deps haven't changed (Object.is).
//    useCallback(fn, deps) === useMemo(() => fn, deps).

// 2. They exist for REFERENTIAL EQUALITY — preventing new object/function refs
//    from breaking React.memo, dependency arrays, and context value comparison.

// 3. Use when: value/function goes to a React.memo'd child, is in a dep array,
//    is an expensive computation, or is a context value.
//    Don't use when: computation is cheap, child isn't memo'd, no dep array needs it.

// 4. React.memo + useMemo + useCallback must ALL be present for the optimization
//    to work. Missing any one: memo on child (no memo → always re-renders),
//    unstable data ref, unstable handler ref → memo comparison fails.

// 5. Memoization has overhead (comparison + storage). Measure with the Profiler
//    before optimizing. For lists, virtualization (Ch 20) usually beats memoization.
```
::
