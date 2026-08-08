# 20 — Performance Optimization

Chapter 9 covered `useMemo`/`useCallback` for referential stability. This chapter widens the lens to the full performance toolkit: `React.memo`, code splitting, virtualization, and — most importantly — the React DevTools Profiler, the tool that turns "this feels slow" into an actual, measured diagnosis rather than a guess.

## Measure First: The Profiler, Not Intuition

Before reaching for any optimization technique below, the React DevTools **Profiler** tab should be the first stop — it records a timeline of every render, which components rendered, how long each took, and critically, *why* each one re-rendered (props changed, state changed, a parent re-rendered, or a hook's dependency changed). Optimizing based on a guess about what's slow routinely targets the wrong component, adding complexity (memoization, `useCallback`) with zero measured benefit, while the actual bottleneck goes untouched.

The Profiler's "ranked" view sorts components by render duration for a given commit, and its "why did this render" panel (enabled via a setting) makes the single most common performance question — "why is this component re-rendering at all?" — directly inspectable instead of inferred from reading code.

## `React.memo`: Skipping Re-renders for Unchanged Props

By default, when a parent component re-renders, **every child re-renders too**, regardless of whether that child's own props actually changed — this is React's default behavior, not a bug, and is often cheap enough not to matter. `React.memo` wraps a component so React skips re-rendering it when its props are shallow-equal to the previous render's props.

::code-wrapper{language="javascript"}
```javascript
const ProductRow = React.memo(function ProductRow({ product, onSelect }) {
  console.log('Rendering', product.name)
  return (
    <tr onClick={() => onSelect(product.id)}>
      <td>{product.name}</td>
      <td>${product.price}</td>
    </tr>
  )
})
```
::

::code-wrapper{language="javascript"}
```javascript
function ProductTable({ products }) {
  const [selectedId, setSelectedId] = useState(null)

  // Without useCallback here, a NEW function is created every render of ProductTable,
  // which defeats React.memo on every ProductRow below — memo does nothing without this.
  const handleSelect = useCallback((id) => setSelectedId(id), [])

  return (
    <table>
      <tbody>
        {products.map(p => <ProductRow key={p.id} product={p} onSelect={handleSelect} />)}
      </tbody>
    </table>
  )
}
```
::

This pairing — `React.memo` on the child, `useCallback`/`useMemo` on whatever function/object props the parent passes down — is precisely why chapter 9's referential-equality material matters here: `React.memo` alone accomplishes nothing if the parent keeps recreating new prop references every render, since a new function or object reference always fails the shallow-equality check even when its *contents* are identical.

`React.memo` is not free — it adds a props comparison on every render, which itself costs something. For a component that's cheap to render anyway (a `<span>` with some text), the comparison overhead can exceed the render it's meant to skip. It earns its keep specifically on components that are either expensive to render themselves, or render very frequently as siblings in a large list where a parent re-renders often for unrelated reasons.

## Code Splitting with `lazy` and `Suspense`

By default, a bundler ships one JavaScript bundle containing every component in the app, downloaded and parsed before the app can render anything — for a large app, this means users pay the download/parse cost of routes and features they may never visit in that session. `React.lazy` defers loading a component's code until it's actually needed, paired with `<Suspense>` to show fallback UI while that code downloads.

::code-wrapper{language="javascript"}
```javascript
import { lazy, Suspense } from 'react'

// The import() call here doesn't fetch AdminPanel's code until this component actually renders
const AdminPanel = lazy(() => import('./AdminPanel'))

function App({ isAdmin }) {
  return (
    <div>
      <Header />
      {isAdmin && (
        <Suspense fallback={<Spinner />}>
          <AdminPanel />
        </Suspense>
      )}
    </div>
  )
}
```
::

A non-admin user's bundle for this page never includes `AdminPanel`'s code at all — the bundler splits it into a separate chunk, fetched over the network only if/when an admin user actually renders that branch. The most common, highest-leverage place to apply this is at the route level, splitting each page into its own chunk so a user visiting `/` never downloads the code for `/settings` or `/admin` until they actually navigate there.

::code-wrapper{language="javascript"}
```javascript
const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  {
    path: '/settings',
    element: (
      <Suspense fallback={<PageSpinner />}>
        <SettingsPage />
      </Suspense>
    ),
  },
])

const SettingsPage = lazy(() => import('./pages/SettingsPage'))
```
::

## Virtualization: Rendering Only What's Visible

A list of 10,000 rows rendered normally creates 10,000 real DOM nodes, the vast majority of which are scrolled out of view and invisible at any given moment — the browser still has to create, style, and lay out every one of them. **Virtualization** (also called "windowing") renders only the handful of rows currently visible in the viewport, recycling DOM nodes as the user scrolls.

::code-wrapper{language="javascript"}
```javascript
import { FixedSizeList } from 'react-window'

function ProductList({ products }) {
  return (
    <FixedSizeList
      height={600}
      itemCount={products.length}
      itemSize={50}
      width="100%"
    >
      {({ index, style }) => (
        // style is REQUIRED here — react-window uses absolute positioning to place
        // each rendered row at its correct scroll offset within the virtual scrollable area
        <div style={style}>{products[index].name} — ${products[index].price}</div>
      )}
    </FixedSizeList>
  )
}
```
::

Regardless of whether `products` has 100 or 100,000 items, `react-window` only ever mounts roughly enough rows to fill the visible `height` (plus a small overscan buffer) — scrolling swaps which data each already-mounted row displays rather than mounting new rows, keeping DOM node count, memory, and initial render time flat as the underlying dataset grows. Virtualization is worth its added complexity specifically once a list is long enough (typically several hundred rows or more, though the exact threshold depends on row complexity) that unvirtualized rendering causes a measurable jank on scroll or a slow initial render — for a 20-row list, it's unnecessary complexity for no measurable gain.

## Avoiding Unnecessary Re-renders at the Source

`React.memo` treats a symptom (a component re-rendering when its props haven't meaningfully changed); several patterns prevent the re-render from being triggered in the first place, which is often the more effective fix.

::code-wrapper{language="javascript"}
```javascript
// State lives high, so EVERY keystroke re-renders the entire page, including
// expensive, unrelated siblings like ProductChart and RecommendationsPanel
function ProductPage({ product }) {
  const [reviewDraft, setReviewDraft] = useState('')
  return (
    <div>
      <ProductChart data={product.priceHistory} />
      <RecommendationsPanel productId={product.id} />
      <textarea value={reviewDraft} onChange={e => setReviewDraft(e.target.value)} />
    </div>
  )
}
```
::

::code-wrapper{language="javascript"}
```javascript
// State moved down into the one component that actually needs it —
// ProductChart and RecommendationsPanel never re-render on keystrokes at all
function ProductPage({ product }) {
  return (
    <div>
      <ProductChart data={product.priceHistory} />
      <RecommendationsPanel productId={product.id} />
      <ReviewDraftInput />
    </div>
  )
}

function ReviewDraftInput() {
  const [reviewDraft, setReviewDraft] = useState('')
  return <textarea value={reviewDraft} onChange={e => setReviewDraft(e.target.value)} />
}
```
::

This technique — moving state down to the narrowest component that actually needs it — often eliminates a performance problem entirely, with no memoization anywhere, simply by shrinking the subtree that re-renders on each state change. A related technique, "children as props" (passing already-constructed JSX through a prop rather than rendering a child directly), can similarly isolate re-renders, since a parent re-rendering doesn't necessarily re-render JSX that was constructed and passed in from *outside* that parent's own render.

## `useMemo` for Expensive Computation, Not Just Referential Stability

Chapter 9 covered `useMemo` primarily for referential stability feeding into `React.memo`/dependency arrays; it's equally used for its more literal purpose — avoiding recomputing something genuinely expensive on every render.

::code-wrapper{language="javascript"}
```javascript
function ProductAnalytics({ orders }) {
  // Recalculating this over a large orders array on every render (e.g. every time
  // an unrelated sibling's state change causes this component to re-render) is wasted work
  // whenever `orders` hasn't actually changed since the last render.
  const revenueByMonth = useMemo(() => {
    return orders.reduce((acc, order) => {
      const month = order.date.slice(0, 7)
      acc[month] = (acc[month] || 0) + order.total
      return acc
    }, {})
  }, [orders])

  return <RevenueChart data={revenueByMonth} />
}
```
::

The same caution from chapter 9 applies here too: `useMemo` itself has overhead (storing the previous dependencies and comparing them every render), so wrapping a trivial computation (`a + b`) in `useMemo` typically costs more than it saves — reserve it for computations that are measurably expensive (large array transformations, complex derived calculations), confirmed with the Profiler rather than assumed.

## 💡 Tips & Tricks

- **Performance** — Always profile before optimizing — the Profiler's "why did this render" panel routinely reveals that the actual slow component isn't the one intuition points to, and optimizing the wrong component wastes effort while leaving the real bottleneck untouched.
- **Idiom** — Try moving state down to its narrowest necessary component before reaching for `React.memo` anywhere — it often eliminates the unnecessary-re-render problem at its source, with less code and no shallow-comparison overhead anywhere.
- **Idiom** — Apply code splitting at route boundaries first — it's the highest-leverage, lowest-risk place to add `lazy`/`Suspense`, since a user only ever pays the load cost for pages they actually visit.
- **Performance** — Reach for virtualization specifically once a list's row count is large enough to cause measurable jank (typically hundreds of rows or more) — profiling a genuinely slow scroll, not an arbitrary row-count threshold, should be the actual trigger.
- **Debug** — `React.memo`'s default shallow comparison means an object or array prop that's recreated fresh every parent render (even with identical contents) always fails the comparison — pair `React.memo` with `useMemo`/`useCallback` on whatever the parent passes down, or it silently does nothing.

## ⚠️ Edge Cases & Gotchas

- **`React.memo` compares props shallowly by default** — two objects with identical keys/values but different references (`{id: 1}` !== `{id: 1}`) are considered "different," so a parent recreating object/array/function props inline defeats `React.memo` even though nothing meaningful changed; a custom comparison function can be passed as `React.memo`'s second argument for deep-equality cases, at the cost of the comparison itself being more expensive.
- **`React.memo` on a component that receives `children` still re-renders whenever the JSX passed as `children` is newly constructed** — `children` is just another prop, and JSX literals create new element objects on every render of whoever constructs them, so `memo` doesn't automatically make a wrapper component immune to a parent's re-renders the way it might seem to.
- **Overusing `React.memo` on cheap components adds net overhead, not savings** — the shallow comparison itself has a cost; wrapping every single component in an app "just in case" is a common overcorrection that measurably slows things down rather than speeding them up.
- **`lazy`-loaded components rendered without a wrapping `<Suspense>` boundary throw at runtime**, not merely warn — every `lazy()` component needs a `<Suspense>` ancestor somewhere in the tree, or the app crashes the first time that component's code needs to load.
- **Virtualized lists (`react-window`/`react-virtualized`) break native browser behaviors that assume every item's DOM node exists, like `Ctrl+F`/`Cmd+F` in-page search and screen-reader "read whole list" navigation** — since off-screen rows genuinely don't exist in the DOM at all, only the visible slice does; this is a real accessibility trade-off worth weighing against the performance gain, not just a technical footnote.

## 🧠 Spot the Bug

A `ProductList` wraps each row in `React.memo` expecting scrolling/filtering to skip re-rendering unaffected rows, but the Profiler shows every single row still re-rendering on every keystroke in an unrelated search box elsewhere on the page.

::code-wrapper{language="javascript"}
```javascript
const ProductRow = React.memo(function ProductRow({ product, onFavorite }) {
  return (
    <div>
      {product.name}
      <button onClick={() => onFavorite(product.id)}>♥</button>
    </div>
  )
})

function ProductList({ products }) {
  const [favorites, setFavorites] = useState(new Set())

  function handleFavorite(id) {
    setFavorites(prev => new Set(prev).add(id))
  }

  return (
    <div>
      {products.map(product => (
        <ProductRow key={product.id} product={product} onFavorite={handleFavorite} />
      ))}
    </div>
  )
}
```
::

<details>
<summary>Answer</summary>

`handleFavorite` is defined fresh inside `ProductList`'s function body on every render, with no `useCallback` wrapping it — so every time `ProductList` re-renders (including when an unrelated search box elsewhere causes a re-render further up the tree), a brand-new `handleFavorite` function reference is created and passed as the `onFavorite` prop to every single `ProductRow`. `React.memo`'s shallow comparison sees `onFavorite` as "changed" (new function reference, every time) for every row, on every render, which defeats the memoization entirely — every row re-renders regardless of whether `product` itself changed.

**The lesson**: `React.memo` only helps if *every* prop passed to the memoized component is referentially stable across renders where nothing meaningful changed — a single un-memoized function or object prop is enough to defeat it completely; wrap `handleFavorite` in `useCallback` (with an empty dependency array here, since `setFavorites`'s updater form needs no external values) to restore the intended skip-on-unrelated-re-render behavior.

</details>

## Key Takeaways

- Profile with React DevTools before optimizing anything — intuition about what's slow is frequently wrong, and the Profiler's "why did this render" view turns a guess into a measurement.
- `React.memo` skips a component's re-render when its props are shallow-equal to the previous render, but is completely defeated by even one un-memoized function/object/array prop recreated fresh each render.
- Code splitting with `lazy`/`Suspense`, applied at route boundaries first, means users only download the code for pages/features they actually visit.
- Virtualization (`react-window`) renders only visible list rows, keeping DOM node count flat regardless of dataset size — worth its complexity, and its real accessibility trade-offs, once a list is large enough to cause measured jank.
- Moving state down to the narrowest component that needs it often eliminates unnecessary re-renders at the source, with less code and no comparison overhead, before any memoization is needed at all.
- `useMemo` earns its overhead specifically for computations confirmed expensive via profiling — wrapping trivial calculations in it typically costs more than it saves.
