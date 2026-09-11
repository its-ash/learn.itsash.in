---
title: "20 — Performance Optimization"
description: "React DevTools Profiler, React.memo + useMemo + useCallback, code splitting with React.lazy + Suspense, virtualization with react-window, list optimization, bundle analysis, and a re-render elimination checklist. Code-first reference for mid-to-senior React engineers."
---

# 20 — Performance Optimization

## Measure First — The DevTools Profiler

::code-wrapper{language="javascript" filename="profiler_usage.js"}
```javascript
// The Profiler tab in React DevTools records every commit (render that
// reached the DOM). For each commit it shows:
//   - Which components rendered and how long each took
//   - WHY each component rendered (state change, parent render, hook dep change)
//   - A "ranked" view sorting components by render duration
//   - A flamechart showing the component tree with render times
//
// OPTIMIZE BASED ON PROFILER DATA, NOT INTUITION.
// The "why did this render" panel routinely reveals the actual bottleneck
// isn't where you'd guess — optimizing the wrong component wastes effort.

// Built-in <Profiler> component for programmatic measurement:
import { Profiler } from 'react'

function App() {
  return (
    <Profiler id="App" onRender={(id, phase, actualDuration) => {
      // phase: 'mount' | 'update' | 'nested-update'
      // actualDuration: ms spent rendering THIS commit (excluding children)
      if (phase === 'update') {
        console.log(`${id} update took ${actualDuration}ms`)
      }
    }}>
      <ProductPage />
    </Profiler>
  )
}

// In production builds, <Profiler> is a no-op — use it in dev/CI only.
// For production profiling, use React's experimental production profiler build.
```
::

### Reading the Profiler — What to Look For

::code-wrapper{language="javascript" filename="profiler_reading.js"}
```javascript
// PROFILER WORKFLOW:
// 1. Record a specific interaction (type in search, scroll a list, toggle a tab)
// 2. Look at the "ranked" chart — which component took the most time?
// 3. Click it -> "Why did this render?" panel shows the cause:
//    - "This component rendered because parent X rendered"
//    - "hook H changed: state Y" or "prop Z changed"
// 4. If the cause is "parent rendered" and props didn't change -> React.memo
// 5. If the cause is "prop Z changed" and Z is an object/array/function created
//    inline -> useMemo/useCallback to stabilize it
// 6. If a single component is genuinely slow -> optimize that component's
//    internal logic (useMemo for expensive computation, or split it)

// ANTI-PATTERN: profiling once, seeing "everything renders," and wrapping
// every component in React.memo "just in case." The shallow comparison
// itself has overhead — wrapping cheap components adds net cost, not savings.
```
::

## React.memo — Skipping Re-renders for Unchanged Props

::code-wrapper{language="javascript" filename="react_memo.js"}
```javascript
import { memo, useCallback, useState } from 'react'

// React.memo wraps a component so React SKIPS re-rendering it when its
// props are shallow-equal to the previous render's props.
// By default, EVERY child re-renders when a parent re-renders — memo opts out.

const ProductRow = memo(function ProductRow({ product, onSelect }) {
  console.log('Rendering', product.name)  // only logs when props actually change
  return (
    <tr onClick={() => onSelect(product.id)}>
      <td>{product.name}</td>
      <td>${product.price}</td>
    </tr>
  )
})

// CRITICAL: memo is useless without stable props from the parent.
// A new function/object reference every render -> shallow-equal fails -> re-renders.
function ProductTable({ products }) {
  const [selectedId, setSelectedId] = useState(null)

  // useCallback stabilizes the function reference across renders.
  // Without this, handleSelect is a NEW function every render ->
  // ProductRow's memo sees a "changed" prop -> re-renders every row.
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

### React.memo with Custom Comparison

::code-wrapper{language="javascript" filename="memo_custom_compare.js"}
```javascript
// Default: shallow comparison (===) on each prop.
// For deep equality, pass a custom comparator as the second argument.
// CAUTION: a deep comparison itself has cost — only use when shallow fails
// and the component is expensive enough to justify it.

const ProductCard = memo(function ProductCard({ product, isSelected }) {
  return <div className={isSelected ? 'selected' : ''}>{product.name}</div>
}, (prevProps, nextProps) => {
  // Return true = props are "equal" -> SKIP re-render
  // Return false = props "changed" -> re-render
  return prevProps.isSelected === nextProps.isSelected &&
         prevProps.product.id === nextProps.product.id &&
         prevProps.product.name === nextProps.product.name &&
         prevProps.product.price === nextProps.product.price
})

// ANTI-PATTERN: using a deep equality library (lodash.isEqual) as the
// comparator for every memoized component. The comparison cost can exceed
// the render cost it's meant to skip. Profile before reaching for deep compare.
```
::

## useMemo and useCallback — Refer to Ch 9

::code-wrapper{language="javascript" filename="memo_use_callback.js"}
```javascript
// Ch 9 covered useMemo/useCallback for referential stability.
// Here's the performance-specific application:

// useMemo for EXPENSIVE COMPUTATION (not just referential stability):
function ProductAnalytics({ orders }) {
  // Without useMemo: this reduce runs on EVERY render, even if orders
  // hasn't changed, because a parent's re-render triggers this component.
  const revenueByMonth = useMemo(() => {
    return orders.reduce((acc, order) => {
      const month = order.date.slice(0, 7)
      acc[month] = (acc[month] || 0) + order.total
      return acc
    }, {})
  }, [orders])  // only recomputes when orders reference changes

  return <RevenueChart data={revenueByMonth} />
}

// useCallback for stable function references fed to memoized children:
function Parent() {
  const [count, setCount] = useState(0)
  // Without useCallback: handleClick is a new function every render ->
  // any memoized child receiving it re-renders regardless of memo.
  const handleClick = useCallback(() => {
    setCount(c => c + 1)
  }, [])  // empty deps -> stable forever (setCount is guaranteed stable)

  return <MemoizedChild onClick={handleClick} />
}

// ANTI-PATTERN: wrapping trivial computations in useMemo.
// useMemo itself has overhead (storing deps, comparing them every render).
// const sum = useMemo(() => a + b, [a, b]) — slower than const sum = a + b.
// Reserve useMemo for computations CONFIRMED expensive via profiling.
```
::

## Code Splitting with React.lazy and Suspense

::code-wrapper{language="javascript" filename="code_splitting.js"}
```javascript
import { lazy, Suspense } from 'react'

// lazy() defers loading a component's code until it's actually rendered.
// The bundler splits it into a separate chunk, fetched on demand.

// Route-level splitting — highest leverage:
const AdminPanel = lazy(() => import('./AdminPanel'))
const SettingsPage = lazy(() => import('./SettingsPage'))
const ReportsPage = lazy(() => import('./ReportsPage'))

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

// Non-admin users NEVER download AdminPanel's code — it's a separate chunk
// fetched only if an admin user renders that branch.

// ANTI-PATTERN: lazy-loading a component WITHOUT a <Suspense> ancestor.
// This throws at runtime (not a warning) the first time the component
// needs to load — every lazy() needs a <Suspense> somewhere above it.
```
::

### Prefetching Lazy Chunks

::code-wrapper{language="javascript" filename="prefetch_chunks.js"}
```javascript
import { lazy, Suspense } from 'react'

// Prefetch a chunk on hover/focus — the import() starts downloading
// before the user clicks, so the chunk is ready by the time they do.
const SettingsPage = lazy(() => import('./SettingsPage'))

function App() {
  const [showSettings, setShowSettings] = useState(false)

  function prefetchSettings() {
    // The dynamic import returns a promise — calling it starts the download.
    // React.lazy's own import() will reuse the same promise (module caching).
    import('./SettingsPage')
  }

  return (
    <div>
      <button
        onClick={() => setShowSettings(true)}
        onMouseEnter={prefetchSettings}    // prefetch on hover
        onFocus={prefetchSettings}         // prefetch on keyboard focus
      >
        Open Settings
      </button>
      {showSettings && (
        <Suspense fallback={<Spinner />}>
          <SettingsPage />
        </Suspense>
      )}
    </div>
  )
}
```
::

## Virtualization with react-window

::code-wrapper{language="javascript" filename="virtualization.js"}
```javascript
import { FixedSizeList, VariableSizeList } from 'react-window'

// Without virtualization: 10,000 rows = 10,000 DOM nodes — browser creates,
// styles, and lays out every one even though most are scrolled out of view.
// With virtualization: only the visible rows (+ small overscan buffer) exist.

function ProductList({ products }) {
  return (
    <FixedSizeList
      height={600}
      itemCount={products.length}
      itemSize={50}        // fixed row height in px
      width="100%"
      overscanCount={5}    // render 5 extra rows above/below for smooth scroll
    >
      {({ index, style }) => (
        // `style` is REQUIRED — react-window uses absolute positioning to
        // place each row at its correct scroll offset. Do NOT override top/left.
        <div style={style} key={products[index].id}>
          {products[index].name} — ${products[index].price}
        </div>
      )}
    </FixedSizeList>
  )
}

// Variable row heights — provide an itemSize function, not a number:
function VariableProductList({ products }) {
  const getItemSize = (index) => {
    // Height depends on content length — measure or compute per item.
    return products[index].description.length > 100 ? 80 : 50
  }

  return (
    <VariableSizeList
      height={600}
      itemCount={products.length}
      itemSize={getItemSize}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>{products[index].name}</div>
      )}
    </VariableSizeList>
  )
}
```
::

### Virtualized List with Memoized Rows

::code-wrapper{language="javascript" filename="virtualized_memoized.js"}
```javascript
import { FixedSizeList } from 'react-window'
import { memo, useCallback } from 'react'

// Memoize the row renderer so react-window can skip re-rendering
// rows whose data hasn't changed (e.g. when scrolling).
const Row = memo(function Row({ index, style, data }) {
  const product = data[index]
  return (
    <div style={style}>
      {product.name} — ${product.price}
    </div>
  )
})

function ProductList({ products, onSelect }) {
  // Stable callback so Row's memo isn't defeated.
  const handleSelect = useCallback((id) => onSelect(id), [onSelect])

  // Pass products via the `itemData` prop — react-window passes it to
  // each row as the `data` prop, and it's part of the memo comparison.
  return (
    <FixedSizeList
      height={600}
      itemCount={products.length}
      itemSize={50}
      width="100%"
      itemData={products}
    >
      {Row}
    </FixedSizeList>
  )
}

// ANTI-PATTERN: virtualizing a 20-row list. The complexity (absolute
// positioning, lost native browser behaviors like Ctrl+F) isn't worth it
// until rows are large enough to cause measured jank — typically hundreds+.
```
::

## List Optimization — Keys and Structural Sharing

::code-wrapper{language="javascript" filename="list_optimization.js"}
```javascript
// KEY DISCIPLINE: stable, unique keys enable React's reconciliation to
// reuse DOM nodes instead of destroying and recreating them.

// BAD: index as key — if items reorder (sort, filter, insert at top),
// React reuses the DOM node but associates it with DIFFERENT data ->
// stale state, animation glitches, input misassociations.
{items.map((item, index) => <Row key={index} item={item} />)}

// GOOD: stable unique ID as key
{items.map(item => <Row key={item.id} item={item} />)}

// When items CAN'T have stable IDs (truly ephemeral data), use a library
// like nanoid or construct a composite key from content fields:
{items.map(item => <Row key={`${item.sku}-${item.variant}`} item={item} />)}

// STRUCTURAL SHARING: when updating a list, avoid replacing the entire array
// if only one item changed. React compares element-by-element with ===,
// so if only the changed item has a new reference, only that row re-renders.

function updateProduct(products, updatedProduct) {
  // BAD: Creates a new array with new references for ALL items:
  return products.map(p => p.id === updatedProduct.id ? updatedProduct : { ...p })

  // GOOD: Only the changed item gets a new reference; others keep their identity:
  return products.map(p => p.id === updatedProduct.id ? updatedProduct : p)
}
```
::

## Bundle Analysis

::code-wrapper{language="bash" filename="bundle_analysis.sh"}
```bash
# Webpack — visualize what's in your bundle:
npx webpack-bundle-analyzer stats.json

# Generate stats:
webpack --profile --json > stats.json

# Vite — rollup-plugin-visualizer:
npm install -D rollup-plugin-visualizer
# Add to vite.config.ts, then build -> opens an interactive treemap.

# Next.js — built-in analyzer:
ANALYZE=true npm run build

# Source-map-explorer — works with any bundler that produces source maps:
npx source-map-explorer dist/assets/*.js

# What to look for:
# - Large dependencies that could be lazy-loaded or replaced
# - Duplicate versions of the same package (check package-lock.json)
# - Code that should be server-only shipping to the client (Ch 22)
# - Tree-shaking failures: entire libraries imported when only one function is used
```
::

### Tree Shaking

::code-wrapper{language="javascript" filename="tree_shaking.js"}
```javascript
// BAD: imports the entire lodash library (even with tree-shaking, many
// bundlers can't fully eliminate unused parts of CommonJS modules).
import _ from 'lodash'
const debouncedFn = _.debounce(fn, 300)

// GOOD: import only the specific function — guaranteed small footprint.
import debounce from 'lodash/debounce'  // or 'lodash-es/debounce' for ESM
const debouncedFn = debounce(fn, 300)

// BETTER: use a tree-shakeable alternative.
import { debounce } from 'es-toolkit'  // modern, tree-shakeable, smaller
```
::

## Moving State Down — Eliminate Re-renders at the Source

::code-wrapper{language="javascript" filename="state_down.js"}
```javascript
// ANTI-PATTERN: state lives high, so EVERY keystroke re-renders the
// entire page, including expensive unrelated siblings.
function ProductPage({ product }) {
  const [reviewDraft, setReviewDraft] = useState('')
  return (
    <div>
      <ProductChart data={product.priceHistory} />     {/* expensive */}
      <RecommendationsPanel productId={product.id} />  {/* expensive */}
      <textarea value={reviewDraft} onChange={e => setReviewDraft(e.target.value)} />
    </div>
  )
}

// FIX: move state down into the one component that needs it.
// ProductChart and RecommendationsPanel never re-render on keystrokes at all.
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

### Children as Props — Isolate Re-renders

::code-wrapper{language="javascript" filename="children_props.js"}
```javascript
// A parent re-rendering doesn't necessarily re-render JSX that was
// constructed and passed in from OUTSIDE that parent's own render.

function ScrollableList({ children }) {
  const [scrollTop, setScrollTop] = useState(0)
  return (
    <div onScroll={e => setScrollTop(e.target.scrollTop)}>
      {children}  {/* this JSX was created by the PARENT of ScrollableList,
                       not by ScrollableList itself — it doesn't re-render
                       when ScrollableList's scrollTop state changes */}
    </div>
  )
}

// Usage: <ProductGrid /> is created in App's render and passed as children.
// ScrollableList's scroll state changes -> ScrollableList re-renders ->
// but {children} (ProductGrid) is the SAME element reference -> React skips it.
function App({ products }) {
  return (
    <ScrollableList>
      <ProductGrid products={products} />
    </ScrollableList>
  )
}

// ANTI-PATTERN: rendering children INSIDE the component that owns the
// frequently-changing state:
function ScrollableList({ renderItem }) {
  const [scrollTop, setScrollTop] = useState(0)
  return <div onScroll={e => setScrollTop(e.target.scrollTop)}>{renderItem()}</div>
  // renderItem() is called during ScrollableList's render -> re-runs on
  // every scroll state change -> children re-render. Use children prop instead.
}
```
::

## Complex Implementation — Optimized Data-Heavy Dashboard

::code-wrapper{language="javascript" filename="optimized_dashboard.js"}
```javascript
import { memo, useMemo, useCallback, useState, useEffect, lazy, Suspense } from 'react'
import { FixedSizeList } from 'react-window'

// --- Lazy-loaded heavy chart library (separate chunk) ---
const RevenueChart = lazy(() => import('./RevenueChart'))

// --- Memoized row for virtualized list ---
const OrderRow = memo(function OrderRow({ order, onSelect, isSelected }) {
  return (
    <div style={{ background: isSelected ? '#e0f0ff' : 'transparent' }}>
      <span>{order.id}</span>
      <span>{order.customer}</span>
      <span>${order.total.toFixed(2)}</span>
    </div>
  )
})

// --- Dashboard component ---
function OrderDashboard({ orders, currentUser }) {
  const [selectedId, setSelectedId] = useState(null)
  const [filterText, setFilterText] = useState('')

  // Stable callback — OrderRow memo works because this never changes reference.
  const handleSelect = useCallback((id) => setSelectedId(id), [])

  // Expensive filter + sort — memoized, only recomputes when orders or filter change.
  const filteredOrders = useMemo(() => {
    const lower = filterText.toLowerCase()
    return orders
      .filter(o =>
        o.customer.toLowerCase().includes(lower) ||
        o.id.toString().includes(lower)
      )
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [orders, filterText])

  // Expensive aggregate — memoized on filteredOrders.
  const totalRevenue = useMemo(() =>
    filteredOrders.reduce((sum, o) => sum + o.total, 0),
  [filteredOrders])

  // Filter input state is LOCAL — doesn't trigger RevenueChart re-render.
  return (
    <div>
      <h1>Orders — ${totalRevenue.toFixed(2)} total</h1>

      {/* Heavy chart in its own lazy chunk + Suspense boundary */}
      <Suspense fallback={<ChartSkeleton />}>
        <RevenueChart data={filteredOrders} />
      </Suspense>

      <FilterInput value={filterText} onChange={setFilterText} />

      {/* Virtualized list — handles 10k+ orders without DOM bloat */}
      <FixedSizeList
        height={500}
        itemCount={filteredOrders.length}
        itemSize={40}
        width="100%"
        itemData={filteredOrders}
      >
        {({ index, style, data }) => (
          <div style={style}>
            <OrderRow
              order={data[index]}
              onSelect={handleSelect}
              isSelected={data[index].id === selectedId}
            />
          </div>
        )}
      </FixedSizeList>
    </div>
  )
}

// Filter input isolated — its state changes don't bubble up to Dashboard.
const FilterInput = memo(function FilterInput({ value, onChange }) {
  return <input value={value} onChange={e => onChange(e.target.value)} placeholder="Filter…" />
})
```
::

## Anti-Pattern — Performance Anti-Patterns

::code-wrapper{language="javascript" filename="anti_patterns.js"}
```javascript
// ANTI-PATTERN: React.memo on every component "just in case"
// The shallow comparison costs O(props) per render. For cheap components
// (a <span> with text), the comparison is more expensive than the render
// it skips. Profile first — memo only expensive or frequently-re-rendered components.

// ANTI-PATTERN: useMemo for trivial computation
const fullName = useMemo(() => `${first} ${last}`, [first, last])
// The string concatenation is faster than useMemo's overhead (storing deps,
// comparing them). Use useMemo only for MEASURABLY expensive work.

// ANTI-PATTERN: useCallback on every function
const handleClick = useCallback(() => setCount(c => c + 1), [])
// If the function is passed to a NON-memoized child, useCallback adds
// overhead with zero benefit — the child re-renders regardless. Only use
// useCallback when the function is a dep of another hook OR passed to a
// memoized child.

// ANTI-PATTERN: index as key in a list that can reorder
{items.map((item, i) => <Row key={i} item={item} />)}
// Reordering items -> React keeps DOM node i but gives it item[j]'s data ->
// stale state, broken animations, input value misassociation.

// ANTI-PATTERN: virtualizing a short list
// 20 rows? DOM handles it fine. Virtualization adds complexity (absolute
// positioning, lost Ctrl+F, accessibility trade-offs). Only virtualize
// when profiling shows measurable jank — typically hundreds+ of rows.

// ANTI-PATTERN: React.memo with inline object/array props
<MemoizedChild config={{ theme: 'dark' }} />
// { theme: 'dark' } is a new object every render -> shallow compare fails ->
// memo does nothing. Lift the object to a constant or useMemo it.
const config = useMemo(() => ({ theme: 'dark' }), [])
<MemoizedChild config={config} />
```
::

## Avoiding Unnecessary Re-renders — Checklist

::code-wrapper{language="javascript" filename="re_render_checklist.js"}
```javascript
// CHECKLIST: run through this when a component re-renders unexpectedly.

// 1. IS THE RE-RENDER ACTUALLY A PROBLEM?
//    Profile it. A 0.1ms re-render of a <span> is not worth optimizing.

// 2. DID A PARENT RE-RENDER?
//    If yes, and this component's props didn't change -> add React.memo.
//    But verify ALL props are stable first (step 3).

// 3. ARE ALL PROPS REFERENTIALLY STABLE?
//    - Functions -> wrapped in useCallback?
//    - Objects/arrays -> wrapped in useMemo or lifted to constants?
//    - Inline JSX ({<Child />}) -> new element every render, defeats memo.
//    One unstable prop defeats memo for the entire component.

// 4. CAN STATE MOVE DOWN?
//    If the re-rendering state is only used by one child subtree, move it
//    into that subtree. This eliminates the re-render at the source —
//    often better than memoization.

// 5. CAN CHILDREN BE PASSED AS PROPS?
//    If a wrapper owns frequently-changing state but wraps static children,
//    pass children as a prop from above — they won't re-render on wrapper's
//    state changes.

// 6. IS THE COMPUTATION GENUINELY EXPENSIVE?
//    useMemo only helps if the computation costs more than useMemo's own
//    overhead. Profile to confirm — large array transforms, complex
//    derivations, sorting/filtering thousands of items qualify.

// 7. IS THE LIST LARGE ENOUGH TO VIRTUALIZE?
//    Hundreds+ rows with measured scroll jank -> react-window.
//    Small lists -> don't add the complexity.

// 8. CAN THE COMPONENT BE CODE-SPLIT?
//    If it's a route or conditionally-rendered feature, lazy() + Suspense
//    keeps its code out of the initial bundle entirely.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Performance] Always profile before optimizing — the Profiler's "why did
// this render" panel reveals the actual cause, which is rarely where intuition
// points. Optimizing the wrong component is the #1 performance mistake.

// [Idiom] Move state down to its narrowest necessary component BEFORE reaching
// for React.memo. It eliminates the re-render at the source with less code
// and zero comparison overhead.

// [Idiom] Apply code splitting at route boundaries first — highest leverage,
// lowest risk. Users only download code for pages they visit.

// [Performance] React.memo + useCallback + useMemo are a TRIPLE — memo on the
// child is useless without stable props from the parent. One un-memoized
// function/object prop defeats the entire optimization.

// [Debug] React.memo's default shallow comparison means a new object/array
// every render (even with identical contents) always fails. Check for inline
// object/array/function props: { foo: 'bar' }, [1, 2, 3], () => handleClick().

// [Idiom] Use children-as-props to isolate re-renders: a wrapper component
// with frequently-changing state shouldn't construct its children itself —
// receive them as props from a parent that doesn't re-render as often.

// [Performance] Prefetch lazy chunks on hover/focus — the download starts
// before the user clicks, so the chunk is ready by the time they do.

// [Portability] Virtualized lists break Ctrl+F and screen-reader "read all"
// navigation — off-screen rows genuinely don't exist in the DOM. Weigh this
// accessibility trade-off against the performance gain.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] React.memo compares props shallowly — { id: 1 } !== { id: 1 }
// (different references). A parent recreating object/array/function props
// inline defeats memo even though contents are identical. Use useMemo /
// useCallback, or pass a custom comparison as memo's second argument.

// [Gotcha] React.memo on a component receiving `children` still re-renders
// when the parent re-renders — children is just another prop, and JSX
// literals create new element objects every render. Memo doesn't automatically
// make a wrapper immune to a parent's re-renders via children.

// [Gotcha] Overusing React.memo on cheap components adds NET overhead —
// the shallow comparison itself costs time. Wrapping every component "just
// in case" is a common overcorrection that measurably slows things down.

// [Gotcha] lazy()-loaded components without a <Suspense> ancestor THROW at
// runtime, not merely warn — the first time the component's code needs to
// load, the app crashes. Every lazy() needs a Suspense somewhere above it.

// [Gotcha] Virtualized lists (react-window) break native Ctrl+F / Cmd+F
// in-page search and screen-reader "read whole list" — off-screen rows
// genuinely don't exist in the DOM. This is a real accessibility trade-off.

// [Gotcha] react-window's FixedSizeList requires the `style` prop to be
// applied to the row's outer element — it uses absolute positioning with
// a computed `top`. Overriding or omitting `style` breaks scroll positioning.

// [Gotcha] Using index as key in a list that can reorder (sort, filter,
// insert at top) causes React to reuse DOM nodes with WRONG data — stale
// state, broken animations, input value misassociation. Use stable unique IDs.

// [Gotcha] useMemo/useCallback have their own overhead (storing previous
// deps, comparing them every render). For trivial work (a + b, string concat),
// they cost more than they save. Reserve for CONFIRMED expensive computations.

// [Gotcha] Structural sharing: `{ ...p }` on every item in a map creates
// new references for ALL items, causing all memoized rows to re-render.
// Only create a new reference for the CHANGED item: `p.id === id ? updated : p`.
```
::

## 🧠 Spot the Bug

A `ProductList` wraps each row in `React.memo`, expecting scrolling/filtering to skip re-rendering unaffected rows. The Profiler shows every single row still re-rendering on every keystroke in an unrelated search box.

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
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

`handleFavorite` is defined fresh inside `ProductList`'s function body on every render, with no `useCallback` wrapping it. Every time `ProductList` re-renders (including when an unrelated search box elsewhere causes a re-render further up the tree), a brand-new `handleFavorite` function reference is created and passed as `onFavorite` to every `ProductRow`. `React.memo`'s shallow comparison sees `onFavorite` as "changed" (new function reference, every time) for every row, on every render — defeating the memoization entirely.

**Fix**: wrap `handleFavorite` in `useCallback`:

```javascript
const handleFavorite = useCallback((id) => {
  setFavorites(prev => new Set(prev).add(id))
}, [])  // setFavorites is guaranteed stable; empty deps = stable forever
```

Now `handleFavorite` has the same reference across renders -> `React.memo` sees `onFavorite` as unchanged -> rows skip re-rendering when only `product` is unchanged.

**The lesson**: `React.memo` only helps if *every* prop is referentially stable. A single un-memoized function or object prop is enough to defeat it completely.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. PROFILE BEFORE OPTIMIZING. The DevTools Profiler's "why did this render"
//    panel turns guesses into measurements. Optimizing the wrong component is
//    the #1 performance mistake — intuition is frequently wrong.

// 2. React.memo skips a re-render when props are shallow-equal — but is
//    completely defeated by even ONE un-memoized function/object/array prop
//    recreated fresh each render. Memo + useCallback + useMemo are a triple.

// 3. Code splitting with lazy() + Suspense at route boundaries = highest-
//    leverage optimization. Users only download code for pages they visit.
//    Prefetch on hover/focus to make it instant.

// 4. Virtualization (react-window) renders only visible rows — DOM node
//    count stays flat regardless of dataset size. Worth its complexity
//    (and accessibility trade-offs) only for lists large enough to cause
//    measured jank — typically hundreds+ of rows.

// 5. Moving state down to the narrowest component that needs it eliminates
//    re-renders at the source — often better than memoization, with less
//    code and zero comparison overhead. Children-as-props isolates further.

// 6. useMemo earns its overhead only for CONFIRMED expensive computations
//    (large array transforms, complex derivations). Wrapping trivial work
//    (a + b) costs more than it saves. Profile to confirm.

// 7. Bundle analysis (webpack-bundle-analyzer, source-map-explorer) reveals
//    what's actually shipping — large deps, duplicate versions, tree-shaking
//    failures, server-only code leaking to the client. Audit regularly.
```
::
