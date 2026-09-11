---
title: "21 — Concurrent Features"
description: "React 18 concurrent rendering: useTransition, useDeferredValue, startTransition, automatic batching, Suspense for data fetching, concurrent rendering implications, purity requirements, and when concurrent helps vs doesn't. Code-first reference for mid-to-senior React engineers."
---

# 21 — Concurrent Features

## Automatic Batching — React 18's Default Behavior

::code-wrapper{language="javascript" filename="automatic_batching.js"}
```javascript
import { useState } from 'react'

// Before React 18: only setState calls inside React event handlers were batched.
// setState inside setTimeout, promises, or native listeners each triggered
// a SEPARATE re-render. React 18 batches ALL setState calls regardless of
// where they occur — a genuine behavioral change, not just an optimization.

function ProductForm() {
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSave() {
    setIsSaving(true)
    try {
      await saveProduct()
    } catch (err) {
      // React 18: both setState calls below are batched into ONE re-render.
      // React 17: each triggered its own separate re-render (two renders).
      setError(err)
      setIsSaving(false)
    }
  }

  return <button onClick={handleSave} disabled={isSaving}>Save</button>
}
```
::

### flushSync — The Escape Hatch

::code-wrapper{language="javascript" filename="flush_sync.js"}
```javascript
import { flushSync } from 'react-dom'

// flushSync forces a synchronous, unbatched re-render — opting OUT of
// automatic batching. Use it ONLY when you need the DOM to update between
// two state changes (e.g., scrolling before a heavy render).
// DISCOURAGED by default — it defeats the batching improvements.

function handleScrollAndRender(newScrollPos) {
  flushSync(() => {
    setScrollPosition(newScrollPos)  // DOM updates immediately
  })
  // Now the DOM reflects the new scroll position before this runs:
  setHeavyContent(computeExpensiveContent())  // separate render
}
```
::

## startTransition — Marking Updates as Non-Urgent

::code-wrapper{language="javascript" filename="start_transition.js"}
```javascript
import { useState, startTransition } from 'react'

// Not every state update is equally urgent. Typing into an input needs to
// feel INSTANT — the character must appear the moment a key is pressed.
// Re-filtering a 10,000-row list based on that keystroke is less urgent.
// startTransition tells React to treat a state update as LOW PRIORITY,
// letting urgent updates (the input reflecting what was typed) interrupt
// and render first.

function ProductSearch({ allProducts }) {
  const [query, setQuery] = useState('')
  const [filtered, setFiltered] = useState(allProducts)

  function handleChange(e) {
    const value = e.target.value
    setQuery(value)  // URGENT: the input must visibly update immediately
    startTransition(() => {
      // NON-URGENT: React can delay/interrupt this expensive filter if
      // something more urgent (the next keystroke) comes in first.
      setFiltered(allProducts.filter(p =>
        p.name.toLowerCase().includes(value.toLowerCase())
      ))
    })
  }

  return (
    <div>
      <input value={query} onChange={handleChange} />
      <ProductGrid products={filtered} />
    </div>
  )
}

// Without startTransition, typing quickly on a large catalog feels laggy —
// every keystroke triggers a synchronous, expensive re-filter before the
// browser is free to paint the next character. With startTransition, the
// input stays responsive because React prioritizes query's update first.
```
::

### startTransition Must Be Synchronous

::code-wrapper{language="javascript" filename="transition_sync.js"}
```javascript
// CORRECT: the setState call is synchronous within the transition callback.
startTransition(() => {
  setFiltered(expensiveFilter(allProducts, value))  // sync — marked low-priority
})

// WRONG: async callback — only the SYNCHRONOUS portion is tracked as part
// of the transition. Anything after `await` runs OUTSIDE the transition's
// low-priority marking, defeating the purpose.
startTransition(async () => {
  setQuery(value)  // this IS in the transition (sync, before await)
  const results = await runExpensiveFilter(allProducts, value)
  setFiltered(results)  // this is NOT in the transition (after await)
})

// FIX: keep urgent updates OUTSIDE the transition, and keep the
// transition callback synchronous:
setQuery(value)  // urgent — outside transition
startTransition(() => {
  setFiltered(syncFilter(allProducts, value))  // non-urgent, synchronous
})

// If you need async work, perform it outside, then mark only the
// state update as a transition:
setQuery(value)
runExpensiveFilter(allProducts, value).then(results => {
  startTransition(() => setFiltered(results))
})
```
::

## useTransition — Tracking Pending State

::code-wrapper{language="javascript" filename="use_transition.js"}
```javascript
import { useState, useTransition } from 'react'

// useTransition pairs startTransition's functionality with an isPending
// boolean, letting the UI show that a low-priority update is in flight.

function ProductSearch({ allProducts }) {
  const [query, setQuery] = useState('')
  const [filtered, setFiltered] = useState(allProducts)
  const [isPending, startTransition] = useTransition()

  function handleChange(e) {
    const value = e.target.value
    setQuery(value)  // urgent — input updates immediately
    startTransition(() => {
      setFiltered(allProducts.filter(p =>
        p.name.toLowerCase().includes(value.toLowerCase())
      ))
    })
  }

  return (
    <div>
      <input value={query} onChange={handleChange} />
      {/* isPending is true between calling startTransition and the
          transition's update actually committing — dim the grid slightly
          to give visual feedback that a filter is in progress */}
      <div style={{ opacity: isPending ? 0.6 : 1 }}>
        <ProductGrid products={filtered} />
      </div>
    </div>
  )
}

// isPending is a better UX signal than a manually-tracked isFiltering boolean
// — it's wired directly into React's own scheduling, accurately reflecting
// exactly when the deferred work is actually in flight versus already committed.
```
::

### useTransition for Tab Switching

::code-wrapper{language="javascript" filename="transition_tabs.js"}
```javascript
import { useState, useTransition, lazy, Suspense } from 'react'

// Tab switching to a heavy component can stutter if the new tab's render
// is expensive. useTransition keeps the current tab interactive while the
// new one renders in the background.

const HeavyTab = lazy(() => import('./HeavyTab'))
const SettingsTab = lazy(() => import('./SettingsTab'))

function TabContainer() {
  const [tab, setTab] = useState('heavy')
  const [isPending, startTransition] = useTransition()

  function selectTab(nextTab) {
    startTransition(() => setTab(nextTab))  // non-urgent tab switch
  }

  return (
    <div>
      <nav>
        <button onClick={() => selectTab('heavy')} disabled={isPending}>Heavy</button>
        <button onClick={() => selectTab('settings')} disabled={isPending}>Settings</button>
      </nav>
      {/* Show the old tab while the new one renders — no blank flash */}
      <Suspense fallback={<Spinner />}>
        {tab === 'heavy' ? <HeavyTab /> : <SettingsTab />}
      </Suspense>
    </div>
  )
}
```
::

## useDeferredValue — Deferring a Value

::code-wrapper{language="javascript" filename="use_deferred_value.js"}
```javascript
import { useState, useDeferredValue, useMemo } from 'react'

// useDeferredValue solves the same problem as startTransition from the
// OPPOSITE direction. Instead of marking the STATE UPDATE as low-priority
// at the point it's set, it lets a component request a "lagging" version
// of an already-existing value — useful when the value comes from a prop
// or another hook you don't control the setState call for.

function ProductSearch({ allProducts }) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  // ProductGrid re-renders using deferredQuery, which "lags behind" query
  // during rapid typing — React prioritizes keeping the input itself
  // (bound to query, not deferredQuery) responsive.
  const filtered = useMemo(
    () => allProducts.filter(p =>
      p.name.toLowerCase().includes(deferredQuery.toLowerCase())
    ),
    [allProducts, deferredQuery]
  )

  const isStale = query !== deferredQuery  // true while a deferred update is in flight

  return (
    <div>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <div style={{ opacity: isStale ? 0.6 : 1 }}>
        <ProductGrid products={filtered} />
      </div>
    </div>
  )
}

// PRACTICAL DIFFERENCE from startTransition:
// - startTransition: you OWN the setState call -> wrap it in startTransition
// - useDeferredValue: you RECEIVE a value (prop, library hook) -> defer it
// You can't wrap someone else's state setter in startTransition, but you
// CAN defer any value you have access to.
```
::

### useDeferredValue for Filtered Lists

::code-wrapper{language="javascript" filename="deferred_list.js"}
```javascript
import { useDeferredValue, useMemo, memo } from 'react'

// The memoized child receives the deferred value — it only re-renders
// when deferredQuery changes (lagging behind the urgent query updates).

const SearchResults = memo(function SearchResults({ query, items }) {
  // This component renders only when `query` (the deferred value) changes.
  // During rapid typing, it skips intermediate renders — React processes
  // the urgent input updates first, then catches up on the deferred value.
  const results = useMemo(() => {
    const lower = query.toLowerCase()
    return items.filter(i => i.name.toLowerCase().includes(lower))
  }, [query, items])

  return (
    <ul>
      {results.map(r => <li key={r.id}>{r.name}</li>)}
    </ul>
  )
})

function SearchPage({ items }) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  return (
    <div>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <SearchResults query={deferredQuery} items={items} />
    </div>
  )
}
```
::

## Suspense for Data Fetching

::code-wrapper{language="javascript" filename="suspense_data.js"}
```javascript
import { Suspense } from 'react'

// Ch 20 covered <Suspense> paired with React.lazy for code loading.
// The same primitive extends to DATA — a component can "suspend" (signal
// it isn't ready to render yet) while data loads, letting a <Suspense>
// boundary show fallback UI — unifying loading states for code and data.

// Conceptual illustration — the exact suspense-enabled fetching API is
// provided by a data-fetching library (React Query's useSuspenseQuery)
// or framework (Next.js App Router), NOT hand-rolled fetch calls.

// With React Query's useSuspenseQuery:
import { useSuspenseQuery } from '@tanstack/react-query'

function ProductDetail({ productId }) {
  const { data: product } = useSuspenseQuery({
    queryKey: ['product', productId],
    queryFn: () => fetchProduct(productId),
  })
  // No loading branch here at all — if data isn't ready, this component
  // "suspends," and the nearest ancestor <Suspense> shows its fallback
  // instead of this component's output.
  return <h1>{product.name}</h1>
}

function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <ProductDetail productId="42" />
    </Suspense>
  )
}
```
::

### Suspense with Nested Data Loading

::code-wrapper{language="javascript" filename="suspense_nested.js"}
```javascript
import { Suspense } from 'react'

// Nested Suspense boundaries let different parts of the page load
// independently — the outer boundary shows a page-level fallback,
// inner boundaries show section-level fallbacks as each resolves.

function ProductPage({ productId }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProductInfo productId={productId} />
      <Suspense fallback={<ReviewsSkeleton />}>
        <ProductReviews productId={productId} />
      </Suspense>
      <Suspense fallback={<RelatedSkeleton />}>
        <RelatedProducts productId={productId} />
      </Suspense>
    </Suspense>
  )
}

// ProductInfo, ProductReviews, and RelatedProducts each suspend
// independently — the page shell + product info appear first, then
// reviews and related products stream in as their data resolves.
```
::

### Why Hand-Rolled Suspense Doesn't Work

::code-wrapper{language="javascript" filename="suspense_pitfall.js"}
```javascript
// BROKEN: throwing a raw, uncached promise from a component's render body
// produces an INFINITE RE-RENDER LOOP, not a working suspense boundary.
// A new promise is thrown on every render attempt with nothing to recognize
// it as "the same" pending request.

function BrokenProductDetail({ productId }) {
  // Every render creates a NEW promise and throws it — React catches it,
  // shows fallback, then tries to re-render, creates ANOTHER new promise...
  throw fetch(`/api/products/${productId}`).then(r => r.json())
}

// A correct Suspense integration requires:
// 1. Caching: the same promise must be returned for the same key until it
//    resolves, so re-render attempts get the SAME promise, not a new one.
// 2. Throwing the promise from render (not useEffect) — React catches it.
// 3. After resolution, the cache returns the resolved value, not a promise.

// This is why production Suspense-for-data uses libraries (React Query,
// Relay, Next.js) that handle this contract correctly — don't reinvent it.
```
::

## Concurrent Rendering Requires Purity

::code-wrapper{language="javascript" filename="purity_requirement.js"}
```javascript
// Concurrent rendering means React may call a component's render function,
// pause partway through the tree, discard that render entirely without
// committing it, and start over. This is impossible pre-18 (a render, once
// started, always ran to completion and committed).

let renderCount = 0

function ProductCard({ product }) {
  renderCount++  // IMPURE: a side effect during render
  console.log(`Rendered ${renderCount} times`)
  // Under concurrent rendering, React may call this function, discard the
  // result without committing/painting it, and call it again — renderCount
  // now over-counts, reporting numbers that don't correspond to actual
  // commits the user ever saw.
  return <div>{product.name}</div>
}

// CORRECT: side effects belong in useEffect (which only runs after commit),
// not in the render body. Render must be PURE — same input, same output,
// no external mutations.
function PureProductCard({ product }) {
  // Computing derived values during render is fine (it's pure):
  const displayName = product.name.toUpperCase()
  return <div>{displayName}</div>
}
```
::

### Why Purity Matters Under Concurrent Rendering

::code-wrapper{language="javascript" filename="purity_concurrent.js"}
```javascript
// Under concurrent rendering, React can:
// 1. Start rendering a tree
// 2. Be interrupted by a higher-priority update (e.g., user input)
// 3. DISCARD the in-progress render entirely
// 4. Start a fresh render with the new state

// This means a component render function may be called MORE times than
// the component actually commits to the DOM. Any code that relies on
// "render runs exactly once per commit" breaks:

// BROKEN: mutating a ref during render to track "first render"
function Component({ data }) {
  if (!ref.current.initialized) {
    ref.current.initialized = true
    ref.current.processedData = expensiveProcess(data)  // side effect in render
  }
  return <div>{ref.current.processedData}</div>
}
// React may call this twice during a concurrent render, discard the first
// call, and the ref now holds state from a discarded render attempt.

// CORRECT: use useMemo for expensive derived state, useEffect for side effects
function Component({ data }) {
  const processedData = useMemo(() => expensiveProcess(data), [data])
  return <div>{processedData}</div>
}
```
::

## When Concurrent Helps vs Doesn't

::code-wrapper{language="javascript" filename="when_concurrent_helps.js"}
```javascript
// CONCURRENT HELPS when:
// 1. An expensive render would block urgent updates (typing, clicks)
//    -> useTransition/useDeferredValue lets urgent updates interrupt
// 2. Multiple state updates happen in the same tick
//    -> automatic batching reduces re-renders (no code change needed)
// 3. Parts of a page load data independently
//    -> Suspense boundaries let fast sections appear before slow ones
// 4. Tab/Route switching to heavy components
//    -> useTransition keeps the current tab interactive while the new one renders

// CONCURRENT DOESN'T HELP when:
// 1. The render itself is cheap (< 1ms) — there's nothing to interrupt
// 2. There's only one state update — nothing to batch or prioritize
// 3. The bottleneck is network, not rendering — Suspense shows a spinner
//    either way; concurrent doesn't make the data arrive faster
// 4. The component is impure — concurrent makes it WORSE, not better

// ANTI-PATTERN: wrapping EVERY state update in startTransition "just in case."
// startTransition adds overhead (tracking the transition scope). For cheap
// updates (toggling a boolean), it's unnecessary — the render is fast enough
// that it never needs to be interrupted. Reserve for MEASURABLY expensive renders.

// ANTI-PATTERN: using useDeferredValue on a value that never changes rapidly.
// If the value updates at most once per user action (not per keystroke),
// there's nothing to defer — useDeferredValue just adds overhead.
```
::

## Complex Implementation — Responsive Search with Transitions

::code-wrapper{language="javascript" filename="complex_search.js"}
```javascript
import { useState, useTransition, useDeferredValue, memo, useMemo } from 'react'

// A production-grade search that stays responsive on 50k+ items:
// - useTransition for the filter update (non-urgent)
// - isPending for visual feedback (dimming)
// - memo on the results list to skip re-renders when query is stale

const SearchResults = memo(function SearchResults({ items, filterText }) {
  const filtered = useMemo(() => {
    if (!filterText) return items
    const lower = filterText.toLowerCase()
    return items.filter(i =>
      i.name.toLowerCase().includes(lower) ||
      i.sku.toLowerCase().includes(lower)
    )
  }, [items, filterText])

  return (
    <div>
      <p>{filtered.length} results</p>
      <ul>
        {filtered.slice(0, 100).map(item => (
          <li key={item.id}>{item.name} — {item.sku}</li>
        ))}
      </ul>
    </div>
  )
})

function ProductSearch({ allProducts }) {
  const [query, setQuery] = useState('')
  const [filterText, setFilterText] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleChange(e) {
    const value = e.target.value
    setQuery(value)  // URGENT: input updates immediately
    startTransition(() => {
      setFilterText(value)  // NON-URGENT: results update when React is free
    })
  }

  return (
    <div>
      <input
        value={query}
        onChange={handleChange}
        placeholder="Search 50k products…"
      />
      <div style={{ opacity: isPending ? 0.7 : 1, transition: 'opacity 0.15s' }}>
        <SearchResults items={allProducts} filterText={filterText} />
      </div>
    </div>
  )
}

// ALTERNATIVE using useDeferredValue (same result, different approach):
function ProductSearchDeferred({ allProducts }) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const isStale = query !== deferredQuery

  return (
    <div>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <div style={{ opacity: isStale ? 0.7 : 1 }}>
        <SearchResults items={allProducts} filterText={deferredQuery} />
      </div>
    </div>
  )
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Idiom] Reach for startTransition specifically for updates that are
// expensive to render but not urgent to feel instantaneous (re-filtering
// a large list, re-computing a chart) — leave genuinely urgent updates
// (text typed into an input) as regular, unwrapped setState calls.

// [Idiom] Choose useDeferredValue over startTransition when you receive a
// value you don't control the setter for (a prop, a third-party hook's
// return value); choose startTransition when you do own the setState call.

// [Debug] If automatic batching in React 18 changes behavior that pre-18
// code relied on (an intermediate render between two setState calls in an
// async callback), the discouraged escape hatch is flushSync from react-dom.

// [Performance] isPending from useTransition is a better UX signal than a
// manually-tracked isFiltering boolean — it's wired directly into React's
// own scheduling, accurately reflecting when the deferred work is in flight.

// [Idiom] Treat "components must be pure" as a HARD requirement, not a style
// guideline, once concurrent features are in play — a component with
// render-time side effects can produce subtly wrong behavior (double-counted
// effects, stale closures over mutated external variables) specifically
// because React may render it speculatively and discard the result.

// [Performance] Don't wrap every setState in startTransition — it adds
// overhead for cheap renders that never need interruption. Reserve for
// MEASURABLY expensive renders confirmed via profiling.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] Automatic batching is a genuine behavioral change from React 17
// and earlier, not just an optimization. Code that relied on synchronous,
// unbatched setState inside a setTimeout/promise/native-event callback
// behaves differently. flushSync is the explicit opt-out for rare cases.

// [Gotcha] startTransition's callback must call setState SYNCHRONOUSLY.
// Wrapping an async function or using `await` inside the callback doesn't
// work — only state updates that happen synchronously within the transition
// are marked low-priority. Anything after `await` runs outside the marking.

// [Gotcha] A transition update can be INTERRUPTED and its render thrown away
// entirely if a more urgent update comes in. This is intentional (keeps input
// responsive during rapid typing), but it means a transition's side effects
// (if any existed, which they shouldn't per the purity requirement) could
// appear to run inconsistently.

// [Gotcha] useDeferredValue does NOTHING useful on a value's very first render.
// On initial mount, deferredValue equals value immediately; the "lagging"
// behavior only manifests on subsequent updates once there's a previous value
// to lag behind. Testing it against a component's first render looks broken.

// [Gotcha] Suspense-for-data has real integration requirements (throwing a
// promise from render, caching resolved values across attempts) that hand-
// written fetch calls do not satisfy without a library's support. Throwing a
// raw, uncached promise from a component body produces an infinite re-render
// loop, not a working suspense boundary.

// [Gotcha] useTransition's isPending stays true from the moment startTransition
// is called until the transition's update COMMITS (not just until it starts
// rendering). For very fast renders, this window is imperceptible — but if
// you use isPending to show a loading spinner, it may flash too briefly.

// [Gotcha] Concurrent rendering can cause useEffect to run in a different
// order than expected if React renders speculatively and discards. Effects
// only run after a commit, but the commit order can differ from render order
// when concurrent features interrupt and restart rendering.
```
::

## 🧠 Spot the Bug

A developer wraps an expensive search-filtering update in `startTransition` to keep the input responsive, but the input still visibly stutters while typing quickly.

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
```javascript
function ProductSearch({ allProducts }) {
  const [query, setQuery] = useState('')
  const [filtered, setFiltered] = useState(allProducts)

  async function handleChange(e) {
    const value = e.target.value

    startTransition(async () => {
      setQuery(value)
      const results = await runExpensiveFilter(allProducts, value)
      setFiltered(results)
    })
  }

  return (
    <div>
      <input value={query} onChange={handleChange} />
      <ProductGrid products={filtered} />
    </div>
  )
}
```
::

<details>
<summary>Answer</summary>

Two problems compound here:

1. `setQuery(value)` — the update that needs to feel instantaneous — is placed **inside** the `startTransition` callback, marking it low-priority along with the expensive filter. The input itself now competes for priority instead of being exempted from it — exactly backwards from the intent.

2. The callback passed to `startTransition` is `async`, and only the **synchronous portion** of a transition callback is actually tracked as part of the transition. `await runExpensiveFilter(...)` and the `setFiltered` call after it run **outside** the transition's low-priority marking entirely, once the microtask queue resumes them — defeating the purpose a second time over.

**Fix**: keep urgent updates outside the transition, keep the transition callback synchronous, and perform async work outside then mark only the state update:

```javascript
function handleChange(e) {
  const value = e.target.value
  setQuery(value)  // urgent — OUTSIDE the transition
  startTransition(() => {
    setFiltered(allProducts.filter(p => p.name.toLowerCase().includes(value.toLowerCase())))
    // synchronous filter — stays inside the transition
  })
}
```

**The lesson**: only wrap the state updates that are genuinely non-urgent inside `startTransition`, keep urgent updates outside, and keep the transition callback synchronous — `await` inside it silently escapes the low-priority scheduling for anything after the awaited expression.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. React 18's automatic batching groups ALL setState calls into a single
//    re-render regardless of where they occur (event handler, promise,
//    setTimeout) — a genuine behavior change, not merely an optimization.

// 2. startTransition marks a state update as LOW-PRIORITY, letting React
//    interrupt it in favor of urgent updates. The callback MUST be
//    synchronous — only synchronously-scheduled updates are deprioritized.

// 3. useTransition pairs startTransition with isPending for React-native
//    loading state — more reliable than manually tracked boolean flags.

// 4. useDeferredValue achieves a similar "lagging" effect for a value you
//    don't own the setter for (a prop, a library hook's return value).

// 5. Concurrent rendering requires component render functions to be PURE —
//    React may call, pause, and discard a render entirely without committing
//    it. Side effects during render break under concurrent features.

// 6. Suspense for data extends the fallback-UI mechanism from code-splitting
//    to async data, but requires library/framework support (React Query's
//    useSuspenseQuery, Next.js) — hand-thrown, uncached promises loop.

// 7. Don't wrap every update in startTransition — it adds overhead for
//    cheap renders. Reserve for MEASURABLY expensive renders confirmed
//    via profiling. Concurrent helps when expensive renders block urgent
//    updates; it doesn't help when the bottleneck is network or the render
//    is already fast.
```
::
