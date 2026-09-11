---
title: Vue 3 Engineering Reference — Performance Optimization
description: Patch flag compiler hints, v-memo for expensive list items, shallowRef for large data, v-once for static content, manual chunk splitting, and runtime profiler analysis.
---

# 19 — Performance Optimization

## Compiler Patch Flags — How Vue Minimizes DOM Diffing

::code-wrapper{language="typescript" filename="patch-flags.ts"}
```typescript
// ── The Vue compiler analyzes templates at build time and tags each VNode ──
// with a PatchFlag — a hint that tells the runtime exactly which properties
// to diff. This avoids full property diffing on every re-render.

// PatchFlags (bitmask):
//   1  = TEXT          — only text content changes
//   2  = CLASS         — only class binding changes
//   4  = STYLE         — only style binding changes
//   8  = PROPS         — only listed props change (compiler lists them)
//   16 = FULL_PROPS    — dynamic props (full prop diff needed)
//   32 = HYDRATE_EVENTS — event listeners need patching (SSR)
//   64 = STABLE_FRAGMENT — children order doesn't change (skip reorder)
//   128 = KEYED_FRAGMENT — children have keys (diff by key)
//   256 = UNKEYED_FRAGMENT — children no keys (diff by position)
//   512 = NEED_PATCH    — needs patching (ref, directives, etc.)
//   -1 = FULL_PATCH     — no hints, diff everything
//   -2 = HOISTED        — static subtree, skip entirely on re-render

// ── Example: compiled render function ──
// Template:
//   <div :class="{ active: isActive }">{{ msg }}</div>
//
// Compiles to (simplified):
function render(_ctx) {
  return h('div', {
    class: { active: _ctx.isActive },
    // PatchFlag 2 (CLASS) — runtime only diffs class, skips everything else
  }, _ctx.msg, 2)
}

// ── Why this matters: ────────────────────────────────────
// Without PatchFlags, every re-render diffs ALL props on ALL nodes.
// With PatchFlags, the runtime only checks the flagged property.
// For a 1000-node list with only class changing: 1000 class checks, not 1000 full diffs.
```
::

## v-memo — Skip Re-render for Expensive List Items

::code-wrapper{language="vue" filename="VMemoList.vue"}
```vue
<script setup>
import { ref } from 'vue'

// ── v-memo: skip re-render of a subtree unless listed deps change ──
// The compiler hoists the VNode — if deps haven't changed, reuse the cached VNode.
// Critical for large lists where only a few items change at a time.

const items = ref(
  Array.from({ length: 10_000 }, (_, i) => ({
    id: i,
    name: `Item ${i}`,
    status: 'active',
    updatedAt: Date.now(),
  }))
)

function updateItem(id, patch) {
  const item = items.value.find(i => i.id === id)
  if (item) Object.assign(item, patch, { updatedAt: Date.now() })
}
</script>

<template>
  <!-- ── v-memo deps: only re-render if id OR status changes ── -->
  <!-- If updatedAt changes but id/status don't: VNode is reused, NO re-render -->
  <!-- For 10,000 items where 1 changes: 1 re-render, not 10,000 -->
  <div
    v-for="item in items"
    :key="item.id"
    v-memo="[item.id, item.status]"
    class="item"
  >
    {{ item.name }} — {{ item.status }}
  </div>
</template>
```

### Anti-Pattern: v-memo with Changing Deps

::code-wrapper{language="vue" filename="VMemoAntiPattern.vue"}
```vue
<template>
  <!-- ❌ WRONG: v-memo deps that change every render make v-memo useless -->
  <div v-memo="[item.updatedAt]" v-for="item in items" :key="item.id">
    {{ item.name }}
  </div>
  <!-- updatedAt changes on every update → VNode is never cached → full re-render -->
  <!-- The overhead of v-memo (dep comparison) is ADDED without the benefit. -->
</template>
```
::

## shallowRef — Large Data Without Deep Tracking

::code-wrapper{language="typescript" filename="shallow-ref-performance.ts"}
```typescript
import { ref, reactive, shallowRef, triggerRef, type ShallowRef } from 'vue'

// ── reactive() deeply proxies every nested property ──
// For a 10,000-item array of objects: 10,000+ Proxies created at init.
// Init cost: O(n × depth). Memory: one Proxy per nested object.

// ── shallowRef: no deep proxying — only .value access is tracked ──
// Init cost: O(1). Memory: one ref wrapper, zero nested Proxies.

// ── When to use shallowRef for large data: ──────────────
// - API responses (fetched once, replaced wholesale)
// - Chart datasets (mutated externally, not reactively)
// - Large tables (10,000+ rows)
// - Binary data (ArrayBuffer, ImageData)

const largeDataset: ShallowRef<Record<string, any>[]> = shallowRef([])

// ✅ Replacing .value triggers re-render:
largeDataset.value = newArray

// ❌ In-place mutation does NOT trigger:
largeDataset.value.push(newItem)  // array changed, no re-render

// ✅ Force trigger after in-place mutation:
largeDataset.value.push(newItem)
triggerRef(largeDataset)  // manually notify dependents

// ── Benchmark: reactive vs shallowRef on 10,000 items ──
// reactive: ~50ms init (proxying), ~5ms per deep mutation check
// shallowRef: ~0.1ms init (no proxy), ~0ms per mutation (not tracked)
// For read-heavy, write-rare data: shallowRef wins by orders of magnitude.
```
::

## v-once — Static Content, Rendered Forever

::code-wrapper{language="vue" filename="VOnceStatic.vue"}
```vue
<script setup>
import { computed } from 'vue'

// ── v-once: render the element/subtree ONCE, skip on all future re-renders ──
// The VNode is hoisted — Vue reuses the exact same VNode forever.
// Zero re-render cost for that subtree, regardless of state changes.

// ── Use cases: ──────────────────────────────────────────
// - Markdown rendered to HTML (static after first render)
// - Terms of service text (never changes)
// - Logo, header, footer (static markup)

const markdownHtml = computed(() => renderMarkdown(rawMarkdown.value))
</script>

<template>
  <!-- Rendered once, never re-rendered even if rawMarkdown changes -->
  <div v-once v-html="markdownHtml" />

  <!-- ── v-once on a subtree: the entire subtree is hoisted ── -->
  <div v-once>
    <header>
      <h1>My App</h1>
      <nav>...</nav>
    </header>
  </div>
  <!-- This entire block is compiled as a static hoisted VNode. -->
  <!-- Even if the component re-renders, this block is skipped entirely. -->
</template>
```
::

## Manual Chunk Splitting — Vite Configuration

::code-wrapper{language="typescript" filename="vite.config.ts"}
```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  build: {
    target: 'esnext',
    sourcemap: true,
    // ── rollupOptions: manual chunk splitting ──
    rollupOptions: {
      output: {
        // ── manualChunks: split vendor code into separate files ──
        // Prevents one mega-bundle; enables long-term browser caching
        // (vendor code changes less often than app code).
        manualChunks: {
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          'vendor-ui': ['@vueuse/core', '@vueuse/integrations'],
          'vendor-charts': ['chart.js'],
        },
        // ── chunkFileNames: deterministic names for cache stability ──
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
      },
    },
    // ── chunkSizeWarningLimit: raise if vendor chunks are large ──
    chunkSizeWarningLimit: 600,
  },
  // ── cssCodeSplit: false — bundle all CSS into one file (fewer requests) ──
  // cssCodeSplit: false,  // enable for small apps; disable for large (parallel CSS load)
})
```

::code-wrapper{language="typescript" filename="lazy-routes.ts"}
```typescript
import { createRouter } from 'vue-router'

// ── Route-level code splitting: each route is a separate chunk ──
// Only the visited route's code downloads — smaller initial bundle.
const routes = [
  {
    path: '/',
    // Eager import: part of main bundle (critical, above-the-fold)
    component: () => import('@/views/Home.vue'),
  },
  {
    path: '/dashboard',
    // Lazy import: separate chunk, loaded on first navigation
    component: () => import(/* webpackChunkName: "dashboard" */ '@/views/Dashboard.vue'),
    // ── Prefetch: start loading on hover (before navigation) ──
    // Reduces perceived latency — chunk is loading while user decides.
  },
  {
    path: '/admin',
    // ── Conditional loading: only for admins ──
    component: () => import('@/views/Admin.vue'),
    meta: { requiresAuth: true, role: 'admin' },
  },
]
```
::

## Runtime Profiler — app.config.performance

::code-wrapper{language="typescript" filename="profiler.ts"}
```typescript
import { createApp } from 'vue'
import App from './App.vue'

// ── app.config.performance: adds performance marks in dev ──
// Must be set BEFORE mount. Only works in development mode.
const app = createApp(App)
app.config.performance = true  // enables Vue-specific performance marks
app.mount('#app')

// ── Marks visible in Chrome DevTools → Performance → Timeline: ──
// "vue:component:init" — component setup time
// "vue:component:compile" — template compile time (first render only)
// "vue:component:render" — render function execution
// "vue:component:patch" — DOM patch time
//
// ── Identifying slow components: ──
// 1. Record a Performance profile while interacting with the app
// 2. Search for "vue:" marks in the timeline
// 3. Components with long "render" or "patch" times are optimization targets
// 4. Common fixes: v-memo, shallowRef, computed caching, v-once for static parts
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
// ── 1. Avoid deep watchers on large objects (O(n) traversal) ──
// watch(state, cb, { deep: true })  — walks EVERY property to track them.
// For 1000-key objects: 1000 track calls. Use specific path watchers instead.

// ── 2. Use computed for derived values (cached, lazy) ──
// Don't recalculate in methods — computed only re-evaluates when deps change.

// ── 3. v-show for frequently toggled elements (no unmount/mount cost) ──
// v-if for rarely shown elements (zero cost when hidden)

// ── 4. Key by stable ID, never by index (see chapter 02) ──
// Index keys cause unnecessary DOM reuse → incorrect state, wasted patches.

// ── 5. Large lists: virtualize (only render visible items) ──
// Use vue-virtual-scroller or @tanstack/vue-virtual for 10,000+ item lists.
// Renders only 20-50 visible items, not 10,000 — O(visible) not O(total).
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. v-memo adds overhead — only use when deps are stable ──
// v-memo with frequently-changing deps: dep comparison + full re-render = slower.
// Only use when deps change rarely compared to other state in the component.

// ── 2. shallowRef + v-model breaks two-way binding ──
// v-model on a shallowRef's nested property doesn't trigger re-render.
// Use ref() for form state (needs deep tracking); shallowRef for display data.

// ── 3. v-once makes content PERMANENTLY static ──
// If the content depends on reactive state that changes later, v-once
// freezes the first render — subsequent state changes are ignored.

// ── 4. Manual chunks can cause initial load delay ──
// If the entry chunk depends on a vendor chunk, the browser waits for both.
// Critical-path vendor code should be in the entry chunk, not a separate chunk.

// ── 5. Computed getters with side effects break caching ──
// A getter that reads a non-reactive external value won't re-compute
// when that value changes — stale result, no re-trigger.

// ── 6. deep: true on watch is O(n), not O(1) ──
// For deeply nested objects, deep traversal is expensive.
// Prefer watching specific paths: () => state.user.profile.name.
```
::

## 🧠 Spot the Bug

A list of 10,000 items re-renders entirely when one item's status changes.

::code-wrapper{language="vue" filename="PerfBug.vue"}
```vue
<script setup>
import { ref } from 'vue'
const items = ref(Array.from({ length: 10000 }, (_, i) => ({
  id: i, name: `Item ${i}`, status: 'active',
})))
function toggleStatus(id) {
  const item = items.value.find(i => i.id === id)
  if (item) item.status = item.status === 'active' ? 'inactive' : 'active'
}
</script>

<template>
  <div v-for="item in items" :key="item.id" class="item">
    {{ item.name }} — {{ item.status }}
    <button @click="toggleStatus(item.id)">Toggle</button>
  </div>
</template>
```
::

<details>
<summary>Answer</summary>

When `toggleStatus` mutates one item, Vue's reactivity triggers a re-render of the entire component. The `v-for` re-evaluates, creating new VNodes for all 10,000 items. Even though only one item changed, the diff algorithm still processes all 10,000 VNodes (each is cheap, but 10,000 × cheap adds up).

**Fix** — add `v-memo` with the item's status as a dependency:

::code-wrapper{language="vue" filename="PerfFixed.vue"}
```vue
<template>
  <!-- v-memo: skip re-render unless id or status changes -->
  <div
    v-for="item in items"
    :key="item.id"
    v-memo="[item.id, item.status]"
    class="item"
  >
    {{ item.name }} — {{ item.status }}
    <button @click="toggleStatus(item.id)">Toggle</button>
  </div>
</template>
```
::

Now, when one item's status changes, only that item's VNode is re-created. The other 9,999 VNodes are reused from the cache — the diff skips them entirely. **The lesson**: `v-memo` with stable deps prevents the VNode from being recreated, turning an O(n) re-render into O(1) for unchanged items.

</details>