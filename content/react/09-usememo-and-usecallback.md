# 09 — `useMemo` & `useCallback`

## Referential Equality: The Concept Both Hooks Exist For

JavaScript compares objects, arrays, and functions **by reference**, not by structural content. Two objects with identical keys/values are not `===` unless they're literally the same object in memory. This single fact is the entire reason `useMemo` and `useCallback` exist.

::code-wrapper{language="javascript"}
```javascript
console.log({ a: 1 } === { a: 1 })          // false — different objects, same shape
console.log([1, 2, 3] === [1, 2, 3])        // false — different arrays, same contents
console.log((() => {}) === (() => {}))      // false — different function instances

const obj = { a: 1 }
console.log(obj === obj)                     // true — same reference
```
::

Every time a component function runs, any object/array/function literal defined in its body is a **brand-new value** with a new reference — even if its contents are identical to last render's. This matters because `React.memo` (chapter 20), `useEffect` dependency arrays (chapter 6), and any other reference-equality check treat "new reference" as "changed," regardless of actual content.

## `useMemo`: Memoizing a Computed Value

`useMemo(fn, deps)` re-runs `fn` and caches its result only when a dependency changes; otherwise it returns the previously cached value without re-computing.

::code-wrapper{language="javascript"}
```javascript
import { useMemo } from 'react'

function ProductList({ products, searchTerm }) {
  // Without useMemo, this expensive filter+sort re-runs on EVERY render of
  // ProductList, even ones triggered by something unrelated (e.g., a parent's
  // unrelated state update that just happens to re-render this tree).
  const visibleProducts = useMemo(() => {
    return products
      .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => a.price - b.price)
  }, [products, searchTerm])

  return (
    <ul>
      {visibleProducts.map(p => <li key={p.id}>{p.name} — ${p.price}</li>)}
    </ul>
  )
}
```
::

## `useCallback`: Memoizing a Function Reference

`useCallback(fn, deps)` is really just `useMemo` specialized for functions — it returns the *same function reference* across renders as long as the dependencies haven't changed, instead of creating a new function (with a new reference) every render.

::code-wrapper{language="javascript"}
```javascript
import { useCallback, useState } from 'react'

function SearchPanel({ onSearch }) {
  const [term, setTerm] = useState('')

  // Without useCallback, handleSearch is a new function reference every render,
  // which would defeat React.memo on <SearchButton> even though the LOGIC never changed.
  const handleSearch = useCallback(() => {
    onSearch(term)
  }, [term, onSearch])

  return (
    <div>
      <input value={term} onChange={e => setTerm(e.target.value)} />
      <SearchButton onSearch={handleSearch} />
    </div>
  )
}

const SearchButton = React.memo(function SearchButton({ onSearch }) {
  console.log('SearchButton rendered')
  return <button onClick={onSearch}>Search</button>
})
```
::

`useCallback(fn, deps)` is exactly equivalent to `useMemo(() => fn, deps)` — it exists as a named, slightly more readable convenience for the extremely common "memoize a callback" case.

## When Memoization Actually Helps

Memoization is a **trade-off**, not a free performance win: it costs memory (caching the previous result and dependency values) and a comparison on every render. It pays off when:

1. The computation itself is genuinely expensive (sorting/filtering large arrays, complex derived calculations) — re-running it on every render would be visibly slow.
2. The memoized value/function is passed to a `React.memo`-wrapped child, and you specifically want to prevent that child from re-rendering when its other props haven't changed.
3. The memoized value/function is itself a dependency of another hook (`useEffect`, `useMemo`, `useCallback`) and you need to prevent that hook from re-firing on every render due to a fresh reference.

## When Memoization Hurts (or Simply Doesn't Help)

::code-wrapper{language="javascript"}
```javascript
// Overkill: memoizing a trivial computation costs more (extra memory,
// dependency comparison, hook bookkeeping) than just recomputing it.
function Bad({ firstName, lastName }) {
  const fullName = useMemo(() => `${firstName} ${lastName}`, [firstName, lastName])
  return <p>{fullName}</p>
}

// Just compute it — string concatenation is cheaper than the memoization machinery
function Good({ firstName, lastName }) {
  const fullName = `${firstName} ${lastName}`
  return <p>{fullName}</p>
}
```
::

::code-wrapper{language="javascript"}
```javascript
// Pointless: memoizing a callback that's only ever passed to a plain
// (non-memoized) DOM element or a non-memoized child provides zero benefit —
// there's no React.memo boundary downstream for the stable reference to help.
function Bad() {
  const [count, setCount] = useState(0)
  const handleClick = useCallback(() => setCount(c => c + 1), [])
  return <button onClick={handleClick}>{count}</button>  // plain <button>, no memo boundary
}
```
::

**Rule of thumb**: don't reach for `useMemo`/`useCallback` reflexively on every value and function. Reach for them when you've identified (via the Profiler, chapter 20) an actual re-render cost, or when a value feeds into another hook's dependency array and you need referential stability there specifically.

## The Common Misuse: Memoizing Something That Depends on an Unmemoized Value

Memoization only holds if *every* dependency is itself stable. A memoized callback that depends on an object recreated every render is not actually stable — it just moved the "new reference every render" problem one level down.

::code-wrapper{language="javascript"}
```javascript
// BUG: `options` is a fresh object every render, so even though handleSubmit
// is wrapped in useCallback, its dependency array never has a stable entry,
// meaning handleSubmit is STILL a new reference every render.
function Form({ userId }) {
  const options = { userId, timestamp: Date.now() }  // new object every render

  const handleSubmit = useCallback(() => {
    submitForm(options)
  }, [options])  // options never === previous options

  return <ChildForm onSubmit={handleSubmit} />
}
```
::

::code-wrapper{language="javascript"}
```javascript
// Fixed: depend on the actual primitive values, not a derived object literal.
function Form({ userId }) {
  const handleSubmit = useCallback(() => {
    submitForm({ userId, timestamp: Date.now() })
  }, [userId])  // userId is a primitive — stable unless it truly changes

  return <ChildForm onSubmit={handleSubmit} />
}
```
::

## `useMemo` Is Not a Guarantee — It's a Cache Hint

React's docs are explicit that `useMemo` should be used purely as a performance optimization, not for correctness. In rare situations involving memory pressure, React *may* discard a memoized value and recompute it even when dependencies haven't changed (this is intentional, future-facing behavior tied to concurrent rendering). Code must not depend on `useMemo` to guarantee a computation runs *exactly once* per dependency set for correctness reasons (e.g., generating an ID that must stay stable) — use `useRef` or `useState`'s lazy initializer for that instead.

::code-wrapper{language="javascript"}
```javascript
// Fragile: relying on useMemo to generate a stable ID "once" is not guaranteed
// by React's contract, even though it happens to behave that way today.
function Bad() {
  const id = useMemo(() => crypto.randomUUID(), [])
  return <div id={id} />
}

// Correct: useState's lazy initializer IS guaranteed to run exactly once per mount
function Good() {
  const [id] = useState(() => crypto.randomUUID())
  return <div id={id} />
}
```
::

## A Realistic Combined Example

::code-wrapper{language="javascript"}
```javascript
import { useState, useMemo, useCallback } from 'react'

function Dashboard({ transactions }) {
  const [filter, setFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('desc')

  const filteredAndSorted = useMemo(() => {
    const filtered = filter === 'all'
      ? transactions
      : transactions.filter(t => t.type === filter)

    return [...filtered].sort((a, b) =>
      sortOrder === 'desc' ? b.amount - a.amount : a.amount - b.amount
    )
  }, [transactions, filter, sortOrder])

  const handleExport = useCallback(() => {
    exportToCsv(filteredAndSorted)
  }, [filteredAndSorted])

  return (
    <div>
      <FilterControls filter={filter} onFilterChange={setFilter} />
      <TransactionTable transactions={filteredAndSorted} />
      <ExportButton onExport={handleExport} />
    </div>
  )
}
```
::

Here, memoizing `filteredAndSorted` avoids re-filtering/re-sorting on every keystroke elsewhere in the app (assuming `transactions` itself is stable), and memoizing `handleExport` gives `ExportButton` (if wrapped in `React.memo`) a stable prop that only changes when the actual exportable data changes.

## Looking Ahead: The React Compiler

React's newer compiler (introduced as an opt-in tool, stabilizing through the React 19 era) automatically inserts memoization equivalent to hand-written `useMemo`/`useCallback` at build time, by statically analyzing your component code. Where available and configured, it reduces the need to manually reach for these hooks — but understanding the underlying referential-equality mechanics in this chapter remains essential, both for codebases not yet using the compiler and for correctly reasoning about what the compiler is doing on your behalf.

## 💡 Tips & Tricks

- **Performance** — Reach for `useMemo`/`useCallback` only after profiling shows an actual cost (chapter 20's Profiler), or when a value must be referentially stable to satisfy another hook's dependency array or a `React.memo` boundary — applying them everywhere by default adds overhead without benefit in the common case.
- **Idiom** — Remember `useCallback(fn, deps)` is just sugar for `useMemo(() => fn, deps)` — if that equivalence ever feels confusing, mentally expanding it clarifies exactly what's being cached and compared.
- **Debug** — When a memoized value doesn't seem to be "sticking" (recomputing every render despite unchanged inputs), audit every entry in its dependency array for a hidden unmemoized object/array/function literal one level up — memoization is only as stable as its least-stable dependency.
- **Idiom** — Never rely on `useMemo` for behavior correctness (e.g., "this must run exactly once") — React's own documentation reserves the right to discard cached values under memory pressure; use `useRef` or lazy `useState` initialization for anything that must be a true one-time computation.
- **Performance** — If your team has adopted the React Compiler, resist manually sprinkling `useMemo`/`useCallback` everywhere "just in case" — let the compiler's static analysis handle the common cases, and reserve manual memoization for the specific spots it can't reach (e.g., across custom hook boundaries with dynamic dependencies).

## ⚠️ Edge Cases & Gotchas

- **A memoized function is only as stable as its dependency array** — `useCallback(fn, [obj])` where `obj` is a fresh object every render is not actually memoized at all; it produces a new function reference every render just like not using `useCallback` in the first place, while adding overhead and false confidence.
- **`useMemo`/`useCallback` do not prevent the component's own re-render** — they only affect what gets passed *down* to children (and dependency arrays); the component itself still re-renders in response to its own state/prop changes exactly as it would without them.
- **Wrapping a value in `useMemo` without wrapping the consuming child in `React.memo` accomplishes nothing** — the memoized value still gets passed as a prop to a plain (non-memoized) component, which re-renders on every parent render regardless of whether the specific prop reference changed.
- **`useMemo`'s cache is scoped per component instance, not global** — memoizing an expensive calculation doesn't share the cached result across multiple mounted instances of the same component (e.g., 50 cards on a page), each instance maintains and recomputes its own cache independently.
- **Dependency array comparison is shallow, one level deep** — `useMemo(fn, [{ id, name }])` where the object literal is rebuilt every render defeats memoization even if `id` and `name` themselves never change, because the *array itself* contains a new object reference each time, and the comparison only checks each array slot with `Object.is`, not deep equality into nested objects.

## 🧠 Spot the Bug

A parent renders a list of `React.memo`-wrapped rows and expects only the edited row to re-render when its own text changes. Instead, every row re-renders on every keystroke in any row.

::code-wrapper{language="javascript"}
```javascript
const Row = React.memo(function Row({ item, onChange }) {
  console.log('Row rendered:', item.id)
  return <input value={item.text} onChange={e => onChange(item.id, e.target.value)} />
})

function EditableList({ items, setItems }) {
  function handleChange(id, text) {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, text } : i)))
  }

  return (
    <div>
      {items.map(item => (
        <Row key={item.id} item={item} onChange={handleChange} />
      ))}
    </div>
  )
}
```
::

<details>
<summary>Answer</summary>

`handleChange` is a plain function defined fresh in `EditableList`'s body on every render, so it's a new reference every time `EditableList` re-renders (which happens on every keystroke, since `setItems` triggers a re-render of the parent). `React.memo` on `Row` compares props by reference — since `onChange` is a new function every render, `Row`'s memo check sees a "changed" prop and re-renders every row, regardless of `item` staying referentially identical for untouched rows.

**The lesson**: wrap `handleChange` in `useCallback` (with `setItems` as its only real dependency, since `setItems` from `useState` is itself stable across renders) so `Row` receives the same function reference across renders where it hasn't changed, letting `React.memo`'s comparison actually skip re-rendering untouched rows.

</details>

## Key Takeaways

- Objects, arrays, and functions are compared by reference in JavaScript — every render creates new instances of any literal defined in the component body, which is the root cause `useMemo`/`useCallback` address.
- `useMemo` caches a computed value; `useCallback` caches a function reference — the latter is literally `useMemo(() => fn, deps)` under the hood.
- Memoization only helps when paired with `React.memo` boundaries, expensive computations, or hook dependency arrays that need referential stability — applying it everywhere adds cost without benefit.
- A memoized value/function is only as stable as its own dependencies — an unmemoized object one level up cascades instability through every `useMemo`/`useCallback` that depends on it.
- Do not rely on `useMemo` for correctness (e.g., "must compute exactly once") — it's an optimization hint React may discard; use `useRef`/lazy `useState` for guarantees.
- The React Compiler can automate much of this memoization at build time where adopted, but the underlying referential-equality mechanics still govern how React decides what re-renders.
