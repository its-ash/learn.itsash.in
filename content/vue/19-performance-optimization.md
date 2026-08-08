# 19 — Performance Optimization

## How Vue's Reactivity Actually Costs You Something

Every `ref`/`reactive` property tracked by a component carries a small bookkeeping cost — dependency tracking on read, triggering on write, and (for `reactive`) recursive proxying of nested objects. For most apps this overhead is genuinely negligible; it becomes worth caring about specifically at scale — very large lists, very large deeply-nested objects, or components re-rendering far more often than a user could ever perceive the result of.

## `v-once` — Render Once, Never Again

::code-wrapper{language="vue" filename="StaticHeader.vue"}
```vue
<script setup>
import { ref } from 'vue'

const appVersion = ref('4.2.1')   // never changes after initial load
</script>

<template>
  <!-- Vue skips this entire subtree on every future re-render, permanently,
       after the very first render -->
  <header v-once>
    <h1>My App</h1>
    <small>v{{ appVersion }}</small>
  </header>
</template>
```
::

`v-once` is correct only for content that is genuinely static after first render — applying it to something that later needs to change produces a silent, confusing bug: the DOM simply never updates again for that subtree, with no warning that anything is wrong.

## `v-memo` — Conditional Re-render Skipping

`v-memo` memoizes a template subtree against a dependency array — Vue only re-renders it if at least one value in the array has changed since the last render, exactly analogous to React's `useMemo` dependency array but applied directly to template output:

::code-wrapper{language="vue" filename="ProductRow.vue"}
```vue
<template>
  <div v-for="product in products" :key="product.id" v-memo="[product.id, product.selected]">
    <!-- this row's DOM is skipped entirely on a re-render UNLESS
         product.id or product.selected specifically changed —
         even if `products` itself was reassigned wholesale -->
    <input type="checkbox" :checked="product.selected" />
    <span>{{ product.name }} — ${{ product.price }}</span>
    <ExpensiveChart :data="product.history" />
  </div>
</template>
```
::

This is a genuinely advanced, narrow tool — reach for it only after profiling shows a specific large `v-for` list re-rendering more often than needed, not as a default optimization sprinkled everywhere; overusing `v-memo` on subtrees that were already cheap to re-render adds bookkeeping overhead for no benefit.

## `shallowRef` and `shallowReactive`

`ref`/`reactive` recursively wrap every nested object in reactivity — for a large, deeply-nested object where only the *top-level reference* ever gets replaced wholesale (never mutated property-by-property), that recursive wrapping is pure overhead:

::code-wrapper{language="javascript"}
```javascript
import { shallowRef, triggerRef } from 'vue'

// a large chart-library configuration object, replaced wholesale on
// each update, never mutated property-by-property from Vue's side
const chartConfig = shallowRef({
  series: [ /* thousands of data points */ ],
  options: { /* deeply nested config */ }
})

function updateChart(newConfig) {
  chartConfig.value = newConfig   // triggers reactivity — this IS tracked
}

function mutateInPlace() {
  chartConfig.value.options.theme = 'dark'   // NOT tracked — shallowRef only
                                              // watches the top-level .value assignment
  triggerRef(chartConfig)   // manually force dependents to re-run after an
                             // in-place mutation shallowRef wouldn't otherwise see
}
```
::

::code-wrapper{language="javascript"}
```javascript
import { shallowReactive } from 'vue'

// only top-level properties are reactive; nested objects are NOT
// recursively wrapped — appropriate for a large, mostly-static config object
const settings = shallowReactive({
  theme: 'light',              // reassigning settings.theme IS reactive
  advanced: { logLevel: 'info' }  // mutating settings.advanced.logLevel is NOT tracked
})
```
::

The tradeoff is explicit and worth stating plainly: `shallowRef`/`shallowReactive` trade automatic deep reactivity for performance — correct when a large structure is always replaced wholesale, actively wrong (silent missed updates) when code elsewhere expects to mutate a nested property and have the UI react to it.

## Lazy Loading — Routes and Components

Chapters 11 and 14 already covered the two main mechanisms — lazy-loaded routes (`component: () => import(...)`) and `defineAsyncComponent` — both reduce the *initial* bundle size, which is usually the highest-leverage performance lever available in a real app, ahead of any reactivity-level micro-optimization:

::code-wrapper{language="javascript"}
```javascript
// route-level — ships this route's code in its own chunk
{ path: '/reports', component: () => import('@/views/ReportsView.vue') }

// component-level — for something heavy but not always visible on a given route
const HeavyChart = defineAsyncComponent(() => import('@/components/HeavyChart.vue'))
```
::

## Virtual Scrolling for Large Lists

Rendering 10,000 DOM nodes for a 10,000-item list is slow regardless of how well-optimized the reactivity around it is — the DOM itself, not Vue, becomes the bottleneck. Virtual scrolling renders only the handful of rows currently visible in the viewport, recycling DOM nodes as the user scrolls:

::code-wrapper{language="bash"}
```bash
npm install @tanstack/vue-virtual
```
::

::code-wrapper{language="vue" filename="VirtualProductList.vue"}
```vue
<script setup>
import { ref } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'

const products = ref(Array.from({ length: 10000 }, (_, i) => ({ id: i, name: `Product ${i}` })))
const parentRef = ref(null)

const rowVirtualizer = useVirtualizer({
  count: products.value.length,
  getScrollElement: () => parentRef.value,
  estimateSize: () => 48
})
</script>

<template>
  <div ref="parentRef" style="height: 600px; overflow: auto;">
    <div :style="{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }">
      <div
        v-for="row in rowVirtualizer.getVirtualItems()"
        :key="row.key"
        :style="{
          position: 'absolute',
          top: 0,
          transform: `translateY(${row.start}px)`,
          height: `${row.size}px`
        }"
      >
        {{ products[row.index].name }}
      </div>
    </div>
  </div>
</template>
```
::

A hand-rolled virtual scroller is a viable learning exercise but a real production one has enough edge cases (variable row heights, smooth scroll-to-index, accessibility) that reaching for a maintained library is usually the pragmatic choice.

## Avoiding Unnecessary Re-renders

### Splitting a large component reduces re-render scope

::code-wrapper{language="vue" filename="Dashboard.vue"}
```vue
<script setup>
import { ref } from 'vue'

// WRONG mental model: putting frequently-changing state (mouse position,
// a live clock) in the SAME component as expensive, rarely-changing
// children means those children's render function still gets called
// on every reactive change in this component, even if their OWN props
// never actually changed — Vue's diffing skips the DOM patch, but the
// render function itself still runs
const mousePosition = ref({ x: 0, y: 0 })
</script>

<template>
  <div @mousemove="mousePosition = { x: $event.clientX, y: $event.clientY }">
    <ExpensiveAnalyticsChart :data="staticData" />
    <p>{{ mousePosition.x }}, {{ mousePosition.y }}</p>
  </div>
</template>
```
::

Moving fast-changing, narrowly-scoped state into its own small child component isolates the re-render cost to that component alone — `ExpensiveAnalyticsChart` in the example above only skips actual DOM patching because Vue's diffing is efficient, but the enclosing component's entire render function still re-executes on every mouse move; a dedicated `<MouseTracker>` child confines that re-execution to a component with nothing expensive in it.

### `computed` caching vs a method call in the template

::code-wrapper{language="vue"}
```vue
<script setup>
import { ref, computed } from 'vue'

const items = ref([ /* thousands of items */ ])

// WRONG for a template used more than once, or re-rendered often —
// recalculates the full filter/sort on EVERY render, unconditionally
function expensiveTotal() {
  return items.value.filter(i => i.active).reduce((sum, i) => sum + i.price, 0)
}

// RIGHT — cached; only recalculates when `items` actually changes
const cachedTotal = computed(() => {
  return items.value.filter(i => i.active).reduce((sum, i) => sum + i.price, 0)
})
</script>
```
::

This is chapter 04's computed-caching lesson resurfacing directly as a performance concern, not just a style preference — a method call in a template re-runs unconditionally on every render of that template, while a `computed` re-runs only when its tracked dependencies actually change.

## Profiling Before Optimizing

::code-wrapper{language="bash"}
```bash
# Vue DevTools' "Performance" tab records component render timings directly
# Chrome DevTools' Performance tab + the "Timings" track shows Vue-specific
# marks when the app is built in dev mode
```
::

Every technique in this chapter has a real cost when misapplied (`v-memo` bookkeeping overhead, `shallowRef` missed reactivity, virtualization's added complexity) — profile first, identify the actual bottleneck (a specific slow component, not "the app feels slow" in the abstract), and apply the narrowest fix that addresses it, rather than reaching for these tools preemptively across an entire codebase.

## Options API Note

`v-once`, `v-memo`, `shallowRef`/`shallowReactive`, lazy loading, and virtualization all work identically regardless of Composition or Options API — none of these are Composition-API-specific features; they operate at the template-compiler or reactivity-system level, beneath either API style.

## 💡 Tips & Tricks

- **Performance** — Reach for lazy-loaded routes/components first, before any reactivity-level optimization — initial bundle size affects every single user on every single visit, while `v-memo`/`shallowRef` only help in the specific, narrower scenarios where you've already identified a concrete bottleneck.
- **Debug** — Vue DevTools' component inspector highlights components as they re-render (a brief flash overlay) — turning this on for a few minutes while interacting with a suspected-slow part of the UI is often faster than reasoning about the code abstractly.
- **Idiom** — Default to `computed` over a plain method for any template-displayed derived value that isn't trivially cheap — the caching is free when dependencies haven't changed, and there's essentially no downside to reaching for it over a method in the vast majority of cases.
- **Performance** — When passing a large, wholesale-replaced object to a component (chart data, a large API response used read-only), profile with `shallowRef` before assuming you need it — it's an optimization for a specific access pattern, not a blanket "use this for anything big."
- **Idiom** — Isolate frequently-changing, narrowly-scoped state (scroll position, mouse position, a live timer) into its own small component rather than a shared ancestor with expensive siblings — this reduces the *scope* of what has to re-execute its render function on every update, independent of any other optimization.

## ⚠️ Edge Cases & Gotchas

- **`v-once` content never updates again — not "rarely," literally never, for the lifetime of that component instance** — Applying it to anything that could conceivably need to change later (even a field that "shouldn't" change in practice) creates a silent bug with no warning; it renders correctly once and then simply ignores every future reactive change to whatever it displays.
- **`v-memo`'s dependency array comparison is shallow, exactly like `computed`/`watch` dependency tracking** — Memoizing on an object or array reference (`v-memo="[product]"` instead of `v-memo="[product.id, product.selected]"`) does nothing useful if `product` is a new object reference on every parent re-render (common with `.map()`-derived lists) — the comparison sees a "different" value every time and never actually skips a re-render.
- **`shallowRef`'s `.value` reassignment is tracked, but in-place mutation of what `.value` points to is not — and there is no dev-mode warning when this silently fails to update the UI** — Code migrated from `ref` to `shallowRef` for a performance win, without also auditing every place that mutates the value in place (rather than reassigning `.value` wholesale), introduces a real, easy-to-miss regression: the UI simply stops updating for those mutations, with nothing in the console pointing at why.
- **Virtual scrolling breaks native browser behaviors that assume every item has real DOM nodes** — Ctrl+F/in-page search, screen-reader "read entire list," and print stylesheets only see the small window of currently-rendered rows — a virtualized list needs deliberate accessibility and search fallbacks, not just a performance win with no other tradeoffs.
- **Splitting a component to isolate re-renders can accidentally break `provide`/`inject` chains or shared local state that used to live in the parent being split apart** — Moving fast-changing state into a new child component sometimes requires re-threading data other siblings previously accessed for free as shared parent state — a refactor purely for performance can introduce a prop-drilling or `provide`/`inject` need that didn't exist before.

## 🧠 Spot the Bug

A component switches to `shallowRef` for a large dataset to improve performance, but a "toggle selected" feature stops updating the UI after the change.

::code-wrapper{language="vue" filename="ProductGrid.vue"}
```vue
<script setup>
import { shallowRef } from 'vue'

const products = shallowRef([
  { id: 1, name: 'Widget', selected: false },
  { id: 2, name: 'Gadget', selected: false }
])

function toggleSelected(id) {
  const product = products.value.find((p) => p.id === id)
  product.selected = !product.selected   // mutates a nested property in place
}
</script>

<template>
  <div v-for="p in products" :key="p.id" @click="toggleSelected(p.id)">
    {{ p.name }} — {{ p.selected ? 'Selected' : 'Not selected' }}
  </div>
</template>
```
::

<details>
<summary>Answer</summary>

`shallowRef` only tracks reactivity for whole-value reassignment of `products.value` itself — it deliberately does *not* make the objects inside the array deeply reactive. `toggleSelected` finds the matching product and flips `product.selected` by mutating that object in place, which `shallowRef` was never watching in the first place, so no re-render is triggered and the displayed text never updates, even though the underlying data did actually change.

::code-wrapper{language="vue" filename="ProductGrid.vue"}
```vue
<script setup>
import { shallowRef, triggerRef } from 'vue'

const products = shallowRef([
  { id: 1, name: 'Widget', selected: false },
  { id: 2, name: 'Gadget', selected: false }
])

function toggleSelected(id) {
  const product = products.value.find((p) => p.id === id)
  product.selected = !product.selected
  triggerRef(products)   // manually notify dependents after an in-place mutation
}
</script>
```
::

A cleaner fix, when in-place mutation is a core part of how the component works rather than an occasional exception, is to reconsider whether `shallowRef` was the right tool here at all — a plain `ref`/`reactive` array would track this mutation automatically, and `shallowRef` should be reserved for data that's genuinely always replaced wholesale, not spot-mutated.

**The lesson**: `shallowRef` is an opt-in tradeoff, not a drop-in faster `ref` — auditing every place that touches the ref's contents (not just its initial declaration) is required before switching, since in-place mutations silently stop updating the UI with no warning.

</details>

## Key Takeaways

- Reach for lazy-loaded routes/components first — reducing initial bundle size benefits every user on every load, ahead of any reactivity-level micro-optimization.
- `v-once` renders a subtree exactly once, forever — correct only for genuinely static content; `v-memo` skips re-renders based on a shallow dependency-array comparison, and is a narrow, profile-first tool, not a default.
- `shallowRef`/`shallowReactive` skip deep reactivity for performance — correct for wholesale-replaced data, actively wrong (silent missed updates) for anything mutated in place; use `triggerRef` to force an update after an intentional in-place mutation.
- Virtual scrolling avoids rendering DOM nodes for off-screen list items, but breaks native find-in-page, screen-reader list traversal, and print — plan deliberate fallbacks.
- Prefer `computed` over a plain method for template-displayed derived values — the caching is essentially free and avoids unconditional recalculation on every render.
- Profile with Vue DevTools or Chrome DevTools before optimizing — every technique in this chapter has a real cost when applied without a measured, specific bottleneck to justify it.
