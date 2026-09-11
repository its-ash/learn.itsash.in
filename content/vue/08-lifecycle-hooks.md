---
title: Vue 3 Engineering Reference — Lifecycle Hooks
description: Full lifecycle sequence, setup-time vs mounted-time hooks, onUnmounted cleanup patterns, KeepAlive activation/deactivation, error capture boundaries, and hook execution order guarantees.
---

# 08 — Lifecycle Hooks

## The Complete Lifecycle — Execution Order

::code-wrapper{language="typescript" filename="lifecycle-order.ts"}
```typescript
import {
  onBeforeMount, onMounted, onBeforeUpdate, onUpdated,
  onBeforeUnmount, onUnmounted, onActivated, onDeactivated,
  onErrorCaptured, onServerPrefetch, ref
} from 'vue'

// ── Full lifecycle sequence (Composition API names): ────
//
// 1.  setup() runs                    — Composition API entry, before "created"
// 2.  onBeforeMount                   — DOM not yet mounted
// 3.  DOM mounted                     — Vue creates the DOM tree
// 4.  onMounted                       — DOM is accessible, refs are populated
// 5.  ── Reactive state changes ──
// 6.  onBeforeUpdate                  — before DOM re-render
// 7.  DOM patched                     — Vue updates the DOM
// 8.  onUpdated                       — after DOM patch
// 9.  ── Component unmounts ──
// 10. onBeforeUnmount                 — cleanup before teardown
// 11. Component destroyed             — Vue removes DOM + disposes effects
// 12. onUnmounted                     — final cleanup, all effects disposed

// ── KeepAlive adds two hooks: ──────────────────────────
//    onActivated  — component re-activated (inserted from cache)
//    onDeactivated — component deactivated (cached, not destroyed)

// ── Error handling: ────────────────────────────────────
//    onErrorCaptured — catches errors from descendant components
//      (render, lifecycle hooks, watchers, setup of descendants)

// ── SSR-only: ──────────────────────────────────────────
//    onServerPrefetch — runs on server during SSR, resolved before render

// ── Every hook is registration-based, not override-based: ──
// You can call onMounted() multiple times — ALL registered callbacks fire in order.
// (Unlike Options API's mounted() which is a single method.)
onMounted(() => console.log('mounted callback 1'))
onMounted(() => console.log('mounted callback 2'))
// Both fire, in registration order.
```
::

## onMounted — DOM Measurement and Third-Party Init

::code-wrapper{language="vue" filename="ChartInit.vue"}
```vue
<script setup>
import { ref, onMounted, onBeforeUnmount, shallowRef } from 'vue'
import Chart from 'chart.js/auto'

const canvasRef = ref(null)
// ── shallowRef: holds the Chart instance without deep reactivity ──
// Chart.js instances are complex objects — reactive() wrapping breaks them.
const chart = shallowRef(null)

onMounted(() => {
  // ── DOM is ready: canvasRef.value is now the <canvas> element ──
  // Before onMounted, canvasRef.value is null (DOM not created yet).
  chart.value = new Chart(canvasRef.value, {
    type: 'bar',
    data: { labels: ['A', 'B'], datasets: [{ data: [1, 2] }] },
  })
})

onBeforeUnmount(() => {
  // ── Cleanup: destroy chart instance to free canvas memory ──
  // onBeforeUnmount runs while the component is still fully functional
  // (refs, state intact). onUnmounted runs after teardown.
  chart.value?.destroy()
})
</script>

<template>
  <canvas ref="canvasRef" />
</template>
```
::

## onBeforeUpdate / onUpdated — Avoiding Infinite Loops

::code-wrapper{language="vue" filename="UpdateLoopTrap.vue"}
```vue
<script setup>
import { ref, onUpdated, onBeforeUpdate } from 'vue'

const items = ref([])

// ── onBeforeUpdate: read DOM BEFORE the patch ──────────
// Useful for saving scroll position or measuring before changes.
onBeforeUpdate(() => {
  // DOM still shows the OLD state — measure before Vue patches it
  scrollPosition.value = listEl.value?.scrollTop
})

// ❌ WRONG: mutating state in onUpdated causes infinite loop
onUpdated(() => {
  // This fires AFTER every DOM patch. If you mutate reactive state here,
  // Vue re-renders → fires onUpdated again → infinite loop.
  items.value.push(Date.now())  // DON'T DO THIS
})

// ✅ CORRECT: onUpdated is for DOM reads, not state writes
onUpdated(() => {
  // Read-only DOM operations are safe:
  if (listEl.value) {
    const isScrolledToBottom =
      listEl.value.scrollTop + listEl.value.clientHeight >= listEl.value.scrollHeight
    if (isScrolledToBottom) emit('scroll-bottom')
  }
})
</script>
```
::

## onUnmounted — Resource Cleanup Checklist

::code-wrapper{language="typescript" filename="cleanup.ts"}
```typescript
import { onUnmounted, onScopeDispose, ref } from 'vue'

// ── Everything registered externally must be cleaned up ──
// Rule: if you called `add`, you must call `remove` on unmount.

onUnmounted(() => {
  // ── 1. Event listeners ──
  window.removeEventListener('resize', resizeHandler)
  document.removeEventListener('keydown', keyHandler)

  // ── 2. Timers ──
  clearInterval(pollInterval)
  clearTimeout(debounceTimer)

  // ── 3. WebSockets / EventSource ──
  socket.close()
  eventSource.close()

  // ── 4. Observers ──
  intersectionObserver.disconnect()
  resizeObserver.disconnect()

  // ── 5. Third-party instances ──
  chartInstance.destroy()
  editorInstance.dispose()

  // ── 6. Animations ──
  cancelAnimationFrame(rafId)

  // ── 7. AbortController (cancel pending fetches) ──
  abortController.abort()
})

// ── Preferred: use onScopeDispose inside composables ──
// Composables register their own cleanup, parent doesn't need to know details.
// If the composable uses onScopeDispose, onUnmounted is redundant for that resource.
```
::

## KeepAlive — onActivated / onDeactivated

::code-wrapper{language="vue" filename="KeepAliveTabs.vue"}
```vue
<script setup>
import { ref, onMounted, onActivated, onDeactivated, onUnmounted } from 'vue'

// ── KeepAlive lifecycle: ────────────────────────────────
// First mount: onMounted → onActivated
// Tab switch away: onDeactivated (component stays in memory, DOM detached)
// Tab switch back: onActivated (component re-attached, state preserved)
// KeepAlive removed entirely: onDeactivated → onUnmounted

// ── onMounted fires ONCE even with KeepAlive ──
onMounted(() => console.log('mounted — fires once'))

// ── onActivated fires on EVERY activation (including first mount) ──
onActivated(() => {
  // ── Re-start polling, re-subscribe to events, resume video ──
  // This is where you "resume" after being cached.
  startPolling()
  window.addEventListener('visibilitychange', onVisible)
})

// ── onDeactivated fires when cached (NOT destroyed) ──
onDeactivated(() => {
  // ── Pause polling, unsubscribe, pause video ──
  // Component is detached from DOM but state is preserved.
  stopPolling()
  window.removeEventListener('visibilitychange', onVisible)
})

// ── onUnmounted fires ONLY when KeepAlive is removed or max exceeded ──
onUnmounted(() => {
  // Final cleanup — component is truly destroyed.
  // Fires after onDeactivated if the component is evicted from cache.
})
</script>
```

::code-wrapper{language="vue" filename="KeepAliveConfig.vue"}
```vue
<template>
  <!-- ── KeepAlive props ── -->
  <KeepAlive
    :include="['UserList', 'Settings']"  <!-- only cache components matching name -->
    :exclude="['HeavyChart']"             <!-- never cache these -->
    :max="5"                              <!-- LRU — keep max 5 instances -->
  >
    <component :is="activeComponent" />
  </KeepAlive>
  <!-- ── Component name matters: include/exclude match component `name` ── -->
  <!-- In <script setup>, set name via: defineOptions({ name: 'UserList' }) -->
</template>
```
::

## onErrorCaptured — Error Boundary Pattern

::code-wrapper{language="vue" filename="ErrorBoundary.vue"}
```vue
<script setup>
import { ref, onErrorCaptured } from 'vue'

const error = ref(null)

// ── onErrorCaptured: catches errors from ALL descendant components ──
// Fires for errors in: descendant render, lifecycle hooks, watchers, setup
// (e) error, (instance) component instance, (info) lifecycle hook name
onErrorCaptured((err, instance, info) => {
  console.error(`Error in ${instance?.$options?.name}:`, err, 'during', info)
  error.value = err

  // ── Return value controls propagation: ──
  return false  // stop propagation — error does not reach parent's onErrorCaptured
  // return true (or undefined) — propagate to parent's error handler
  // ── This makes it an error boundary: catches and handles, doesn't rethrow ──
})
</script>

<template>
  <div v-if="error" class="error-boundary">
    <h2>Something went wrong</h2>
    <p>{{ error.message }}</p>
    <button @click="error = null">Retry</button>
  </div>
  <slot v-else />  <!-- child components render here -->
</template>
```
::

## onServerPrefetch — SSR Data Preloading

::code-wrapper{language="typescript" filename="server-prefetch.ts"}
```typescript
import { ref, onServerPrefetch } from 'vue'

const data = ref(null)

// ── onServerPrefetch: runs ONLY on the server during SSR ──
// The callback returns a Promise — the server waits for it to resolve
// before rendering the component's HTML.
// On the client (hydration), this hook is SKIPPED — client uses the
// server-provided state instead of re-fetching.

onServerPrefetch(async () => {
  const res = await fetch('/api/initial-data')
  data.value = await res.json()
  // Server renders with data already populated → no client-side loading flash.
})

// ── When to use: ────────────────────────────────────────
// Critical above-the-fold data that must be in the initial HTML (SEO, perceived perf).
// For non-critical data, prefer client-side fetch with useFetch() composable.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
// ── 1. Multiple onMounted calls — all fire in registration order ──
onMounted(() => console.log('first'))  // fires first
onMounted(() => console.log('second')) // fires second
// Unlike Options API's single mounted() method.

// ── 2. Hooks must be called synchronously in setup() ──
// ❌ onMounted(() => ...) inside setTimeout — registration too late, won't fire
// ✅ Always register hooks at the top level of setup() or <script setup>

// ── 3. onBeforeUnmount vs onUnmounted ──
// onBeforeUnmount: component still fully functional (refs, state intact)
//   → use for cleanup that needs to READ component state
// onUnmounted: effects already disposed, refs may be null
//   → use for final logging, pure side-effects

// ── 4. Template refs are null before onMounted ──
// ref(null) in setup → populated during mount → accessible in onMounted
// Guard: if (ref.value) { ... } in case of v-if conditional rendering
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. onUpdated fires after EVERY re-render, including child re-renders ──
// If a child component updates, the parent's onUpdated fires too.
// Don't use onUpdated for logic that should only run on specific state changes.

// ── 2. onMounted fires before child components are fully mounted ──
// Parent's onMounted fires BEFORE child's onMounted (inside-out for mounted).
// If parent needs child to be mounted, use nextTick() or a child-emitted event.

// ── 3. KeepAlive + onMounted: onMounted fires ONCE, onActivated fires every time ──
// Common bug: putting event listeners in onMounted with KeepAlive.
// Component is deactivated (listener stays) → activated (no re-registration) → listener works.
// But if listener is removed in onUnmounted (not onDeactivated), it's never removed while cached.

// ── 4. Hooks registered in async callbacks don't work ──
// ❌ onMounted(() => setTimeout(() => onUpdated(...), 0))  — onUpdated is too late
// Hooks must be registered during the synchronous setup() execution.

// ── 5. onErrorCaptured doesn't catch errors in event handlers ──
// Only catches errors in: render, setup, lifecycle hooks, watchers.
// Event handler errors go to app.config.errorHandler, not onErrorCaptured.

// ── 6. onServerPrefetch is server-only — skipped on client ──
// Don't put client-side logic in onServerPrefetch — it won't run during hydration.
```
::

## 🧠 Spot the Bug

A KeepAlive component's event listener persists even after the user navigates away.

::code-wrapper{language="vue" filename="KeepAliveBug.vue"}
```vue
<script setup>
import { onMounted, onUnmounted, ref } from 'vue'

const position = ref(0)

onMounted(() => {
  window.addEventListener('scroll', (e) => {
    position.value = window.scrollY
  })
})

onUnmounted(() => {
  // ⚠️ This only fires when KeepAlive evicts the component (max exceeded or removed)
  // NOT when the user navigates to another tab (onDeactivated fires instead)
  window.removeEventListener('scroll', handler)
})
</script>
```
::

<details>
<summary>Answer</summary>

With `KeepAlive`, navigating away fires `onDeactivated`, not `onUnmounted`. The listener stays active while the component is cached, continuing to fire scroll handlers in the background — wasted CPU and potential state bugs on reactivation.

**Fix** — use `onActivated`/`onDeactivated` instead of `onMounted`/`onUnmounted`:

::code-wrapper{language="vue" filename="KeepAliveFixed.vue"}
```vue
<script setup>
import { onActivated, onDeactivated, ref } from 'vue'

const position = ref(0)

function handler() { position.value = window.scrollY }

onActivated(() => {
  window.addEventListener('scroll', handler)  // re-register on every activation
})

onDeactivated(() => {
  window.removeEventListener('scroll', handler)  // clean up when cached
})
</script>
```
::

**The lesson**: with `KeepAlive`, `onMounted`/`onUnmounted` fire only once (initial mount and final eviction). Use `onActivated`/`onDeactivated` for resources that should be active only while the component is visible.

</details>