# 21 — Concurrent Features

React's concurrent rendering, introduced in React 18, changed a fundamental assumption every earlier chapter quietly relied on: that once a render starts, it runs to completion and commits. Concurrent features let React start rendering, pause, and either resume, discard, or prioritize other work instead — this chapter covers what that actually means and the three primary APIs built on top of it: automatic batching, `startTransition`, and `useDeferredValue`.

## Automatic Batching: A Change to `setState` Itself

Before React 18, React only batched multiple `setState` calls together (into a single re-render) when they occurred inside a React event handler — `setState` calls inside a `setTimeout`, a promise `.then()`, or a native event listener each triggered their own separate, immediate re-render. React 18 batches *all* `setState` calls together automatically, regardless of where they occur.

::code-wrapper{language="javascript"}
```javascript
function ProductForm() {
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSave() {
    setIsSaving(true)
    try {
      await saveProduct()
    } catch (err) {
      // Before React 18: this setState (inside a promise callback) and the one below
      // each triggered their OWN separate re-render — two renders for one logical update.
      // React 18: both are automatically batched into a single re-render, same as if
      // they were called synchronously inside an event handler.
      setError(err)
      setIsSaving(false)
    }
  }

  return <button onClick={handleSave} disabled={isSaving}>Save</button>
}
```
::

This is a genuine behavior change, not merely an internal optimization — code written and tested against pre-18 semantics that relied on an intermediate render occurring between two `setState` calls inside an async callback (reading a DOM measurement between them, for instance) can behave differently under automatic batching. For the overwhelming majority of components, automatic batching is a pure, invisible win: fewer renders for logically-single updates, with zero code changes required.

## `startTransition`: Marking Updates as Non-Urgent

Not every state update is equally urgent. Typing into a text input needs to feel instantaneous — the character must appear the moment a key is pressed. Re-filtering a 10,000-row list based on that same keystroke is comparatively less urgent — a few dozen milliseconds of delay is imperceptible, while a UI-blocking freeze on every keystroke is very perceptible. `startTransition` tells React to treat a given state update as **low priority**, letting more urgent updates (like the input reflecting what was typed) interrupt and render first.

::code-wrapper{language="javascript"}
```javascript
import { useState, startTransition } from 'react'

function ProductSearch({ allProducts }) {
  const [query, setQuery] = useState('')
  const [filtered, setFiltered] = useState(allProducts)

  function handleChange(e) {
    const value = e.target.value
    setQuery(value) // urgent: the input must visibly update immediately

    startTransition(() => {
      // non-urgent: React can delay/interrupt this expensive filter if something
      // more urgent (like the next keystroke) comes in first
      setFiltered(allProducts.filter(p => p.name.toLowerCase().includes(value.toLowerCase())))
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

Without `startTransition`, typing quickly into the search box on a large product catalog can feel laggy — every keystroke triggers a synchronous, potentially expensive re-filter and re-render of the entire grid before the browser is free to paint the next character into the input. With `startTransition`, the input itself stays responsive because React prioritizes rendering `query`'s update first, and can interrupt an in-progress, now-stale filter render if the user types another character before it finishes.

## `useTransition`: Tracking Pending State

`useTransition` pairs `startTransition`'s functionality with an `isPending` boolean, letting the UI show that a low-priority update is still in flight — useful for showing a subtle loading indicator without blocking the urgent parts of the UI.

::code-wrapper{language="javascript"}
```javascript
import { useState, useTransition } from 'react'

function ProductSearch({ allProducts }) {
  const [query, setQuery] = useState('')
  const [filtered, setFiltered] = useState(allProducts)
  const [isPending, startTransition] = useTransition()

  function handleChange(e) {
    const value = e.target.value
    setQuery(value)
    startTransition(() => {
      setFiltered(allProducts.filter(p => p.name.toLowerCase().includes(value.toLowerCase())))
    })
  }

  return (
    <div>
      <input value={query} onChange={handleChange} />
      <div style={{ opacity: isPending ? 0.6 : 1 }}>
        <ProductGrid products={filtered} />
      </div>
    </div>
  )
}
```
::

`isPending` is `true` for the (typically brief) window between calling `startTransition` and that transition's update actually committing — dimming the grid slightly during that window gives visual feedback that a filter is in progress, without the freeze a synchronous update would cause.

## `useDeferredValue`: Deferring a Value Instead of an Update

`useDeferredValue` solves a closely related problem from the opposite direction — rather than marking the *state update* as low priority at the point it's set, it lets a component request a "lagging" version of an already-existing value, useful when the value itself comes from a prop or another hook you don't control the `setState` call for.

::code-wrapper{language="javascript"}
```javascript
import { useState, useDeferredValue } from 'react'

function ProductSearch({ allProducts }) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  // ProductGrid re-renders using deferredQuery, which "lags behind" query during rapid typing —
  // React prioritizes keeping the input itself (bound to query, not deferredQuery) responsive
  const filtered = useMemo(
    () => allProducts.filter(p => p.name.toLowerCase().includes(deferredQuery.toLowerCase())),
    [allProducts, deferredQuery]
  )

  return (
    <div>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <ProductGrid products={filtered} />
    </div>
  )
}
```
::

The practical difference from `startTransition`: `useDeferredValue` is reached for when you receive a value (a prop, a value from a library hook) rather than owning the `setState` call that produces it — you can't wrap someone else's state setter in `startTransition`, but you can defer *any* value you have access to, regardless of where it came from. Comparing `query !== deferredQuery` gives the same kind of "is a lagging update in flight" signal `isPending` provides for transitions.

## Why Concurrency Requires Purity

None of this works safely unless component render functions are pure — free of side effects, producing the same output for the same props/state every time they're called. Concurrent rendering means React may call a component's render function, pause partway through the tree, discard that render entirely without committing it, and start over — something that was never possible pre-18 (a render, once started, always ran to completion and committed, even if it later turned out to be effectively wasted).

::code-wrapper{language="javascript"}
```javascript
let renderCount = 0

function ProductCard({ product }) {
  renderCount++ // IMPURE: a side effect during render
  console.log(`Rendered ${renderCount} times`)
  // Under concurrent rendering, React may call this function, discard the result
  // without committing/painting it, and call it again — renderCount now over-counts,
  // reporting numbers that don't correspond to actual commits the user ever saw.
  return <div>{product.name}</div>
}
```
::

This is precisely why the Rules of Hooks and "components must be pure" guidance (chapters 4 and 11) aren't merely style preferences — they're a hard prerequisite for concurrent features to behave correctly at all. A component that mutates external state during render, relies on render call *count* rather than *commit* count, or produces different output for identical props/state can behave unpredictably once React is free to render speculatively and throw work away.

## Suspense for Data: The Underlying Concept

Chapter 20 covered `<Suspense>` paired with `React.lazy` for code loading. The same primitive extends, in principle, to data — a component can "suspend" (signal it isn't ready to render yet) while data loads, letting a `<Suspense>` boundary show fallback UI, conceptually unifying loading states for code and data under one mechanism rather than component-local `if (loading) return <Spinner />` checks everywhere.

::code-wrapper{language="javascript"}
```javascript
// Conceptual illustration — the exact suspense-enabled fetching API is provided by
// a data-fetching library (or framework like Next.js/Relay), not hand-rolled fetch calls
function ProductDetail({ productId }) {
  const product = useSuspenseQuery(['product', productId], () => fetchProduct(productId))
  // No loading branch here at all — if data isn't ready, this component "suspends,"
  // and the nearest ancestor <Suspense> shows its fallback instead of this component's output.
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

This chapter deliberately stops at the concept level — production Suspense-for-data usage today happens primarily through frameworks (Next.js's App Router) or libraries with explicit Suspense support (React Query's `useSuspenseQuery`), covered more concretely in chapter 22, rather than through hand-rolled `fetch` calls, since correctly integrating arbitrary async code with Suspense's contract (throwing a promise, caching its result for the next render attempt) has enough subtlety that reinventing it per-project is not recommended practice.

## 💡 Tips & Tricks

- **Idiom** — Reach for `startTransition` specifically for updates that are expensive to render but not urgent to *feel* instantaneous (re-filtering a large list, re-computing a chart) — leave genuinely urgent updates (the text actually typed into an input) as regular, unwrapped `setState` calls.
- **Idiom** — Choose `useDeferredValue` over `startTransition` when you receive a value you don't control the setter for (a prop, a third-party hook's return value); choose `startTransition` when you do own the `setState` call directly.
- **Debug** — If automatic batching in React 18 changes behavior that pre-18 code relied on (an intermediate render between two `setState` calls in an async callback), the discouraged escape hatch is `flushSync` from `react-dom` — reach for it only as a last resort, since it deliberately opts back out of the batching improvements for that specific update.
- **Performance** — `isPending` from `useTransition` is a better UX signal than a manually-tracked `isFiltering` boolean for transition-wrapped updates — it's wired directly into React's own scheduling, accurately reflecting exactly when the deferred work is actually in flight versus already committed.
- **Idiom** — Treat "components must be pure" as a hard requirement, not a style guideline, once concurrent features are in play — a component with render-time side effects can produce subtly wrong behavior (double-counted effects, stale closures over mutated external variables) specifically because React may render it speculatively and discard the result.

## ⚠️ Edge Cases & Gotchas

- **Automatic batching is a genuine behavioral change from React 17 and earlier, not just an optimization** — code that relied on synchronous, unbatched `setState` inside a `setTimeout`/promise/native-event-listener callback (to force an intermediate render between two updates) behaves differently in React 18, and `flushSync` is the explicit, discouraged-by-default opt-out for the rare case that's genuinely needed.
- **`startTransition`'s callback must call `setState` synchronously inside it — wrapping an `async` function or a function containing `await` around the state update doesn't work as expected**, since only the state updates that happen synchronously within the transition callback are marked low-priority; anything after an `await` runs outside that marking.
- **A transition update can be interrupted and its render thrown away entirely if a more urgent update comes in first** — this is intentional and is exactly the mechanism that keeps input responsive during rapid typing, but it means a transition's side effects (if any existed, which they shouldn't per the purity requirement) could appear to run inconsistently.
- **`useDeferredValue` does nothing useful on a value's very first render** — on initial mount, `deferredValue` equals `value` immediately; the "lagging" behavior only manifests on subsequent updates once there's a previous value to lag behind, so testing it against a component's first render can look like it isn't working at all.
- **Suspense-for-data has real integration requirements (throwing a promise from render, caching resolved values across attempts) that hand-written `fetch` calls do not satisfy without a library's support** — attempting to `throw` a raw, uncached promise directly from a component's render body produces an infinite re-render loop rather than a working suspense boundary, since a new promise is thrown on every render attempt with nothing to recognize it as "the same" pending request.

## 🧠 Spot the Bug

A developer wraps an expensive search-filtering update in `startTransition` to keep the input responsive, but the input still visibly stutters while typing quickly.

::code-wrapper{language="javascript"}
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

Two problems compound here. First, `setQuery(value)` — the update that needs to feel instantaneous — is placed *inside* the `startTransition` callback, marking it low-priority along with the expensive filter, exactly backwards from the intent; the input itself now competes for priority instead of being exempted from it. Second, the callback passed to `startTransition` is `async`, and only the synchronous portion of a transition callback is actually tracked as part of the transition — `await runExpensiveFilter(...)` and the `setFiltered` call after it run outside the transition's low-priority marking entirely, once the microtask queue resumes them, defeating the purpose a second time over.

**The lesson**: only wrap the state updates that are genuinely non-urgent inside `startTransition`, keep urgent updates like the input's own bound value outside of it, and keep the transition callback synchronous — `await` inside it silently escapes the low-priority scheduling for anything after the awaited expression, since `startTransition` marks synchronously-scheduled updates, not the entire async operation surrounding them.

</details>

## Key Takeaways

- React 18's automatic batching groups all `setState` calls into a single re-render regardless of where they occur (event handler, promise, `setTimeout`), a genuine behavior change from earlier versions, not merely an internal optimization.
- `startTransition` marks a state update as low-priority, letting React interrupt it in favor of more urgent updates — the transition callback must be synchronous, since only synchronously-scheduled updates within it are actually deprioritized.
- `useDeferredValue` achieves a similar "lagging" effect for a value you don't own the setter for, rather than for an update you're triggering directly.
- Concurrent rendering requires component render functions to be genuinely pure — React may call, pause, and discard a render entirely without committing it, which breaks components relying on render-time side effects or call-count assumptions.
- Suspense for data extends the same fallback-UI mechanism from code-splitting to asynchronous data, but requires library/framework support (React Query's `useSuspenseQuery`, Next.js) to integrate correctly — hand-thrown, uncached promises from a component body do not work.
- `isPending` from `useTransition` is the correct, React-native way to surface "a deferred update is still in flight" in the UI, more reliable than manually tracked loading flags for transition-wrapped state.
