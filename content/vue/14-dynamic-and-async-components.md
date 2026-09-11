---
title: Vue 3 Engineering Reference — Dynamic & Async Components
description: component :is switching, defineAsyncComponent loading/error/timeout, KeepAlive LRU caching with include/exclude, Suspense orchestration, and shallowRef for component references.
---

# 14 — Dynamic & Async Components

## component :is — Runtime Component Switching

::code-wrapper{language="vue" filename="DynamicComponent.vue"}
```vue
<script setup>
import { shallowRef, markRaw, ref, computed } from 'vue'
import HomeView from './HomeView.vue'
import ProfileView from './ProfileView.vue'
import SettingsView from './SettingsView.vue'

// ── shallowRef: hold component definitions without deep reactivity ──
// Components are complex objects — reactive() wrapping them is wasteful
// and can break Vue's internal compilation caches. Use shallowRef or markRaw.
const components = shallowRef({
  home: markRaw(HomeView),
  profile: markRaw(ProfileView),
  settings: markRaw(SettingsView),
})

const activeTab = ref('home')
const currentComponent = computed(() => components.value[activeTab.value])
</script>

<template>
  <!-- ── :is binds to: component object | string name | async component ── -->
  <!-- Vue resolves the component and renders it. -->
  <!-- Switching :is unmounts the old component, mounts the new one. -->
  <component :is="currentComponent" />

  <nav>
    <button v-for="(comp, name) in components" :key="name" @click="activeTab = name">
      {{ name }}
    </button>
  </nav>
</template>
```
::

### Anti-Pattern: reactive() on Component Definitions

::code-wrapper{language="typescript" filename="anti-pattern.ts"}
```typescript
import { reactive } from 'vue'
import HomeView from './HomeView.vue'

// ❌ WRONG: reactive() wraps the component in a deep Proxy
// This breaks Vue's internal component caching and causes subtle render bugs.
const components = reactive({
  home: HomeView,  // Proxy-wrapped — internal compilation cache misses
})

// ✅ CORRECT: shallowRef or markRaw
import { shallowRef, markRaw } from 'vue'
const components = shallowRef({
  home: markRaw(HomeView),  // raw — no Proxy wrapping
})
```
::

## defineAsyncComponent — Code Splitting with States

::code-wrapper{language="typescript" filename="async-components.ts"}
```typescript
import { defineAsyncComponent } from 'vue'
import LoadingSpinner from './LoadingSpinner.vue'
import ErrorDisplay from './ErrorDisplay.vue'

// ── Basic async component: loaded on first use ──
// Dynamic import creates a separate chunk (code splitting).
const AsyncDashboard = defineAsyncComponent(() => import('./Dashboard.vue'))

// ── Full configuration: loading/error states, delay, timeout ──
const AsyncChart = defineAsyncComponent({
  // loader: returns a promise that resolves to the component
  loader: () => import('./Chart.vue'),

  // loadingComponent: shown while the chunk downloads
  loadingComponent: LoadingSpinner,

  // errorComponent: shown if the chunk fails to load
  errorComponent: ErrorDisplay,

  // delay: ms before showing loadingComponent (avoid flicker for fast loads)
  delay: 200,

  // timeout: ms before showing errorComponent (chunk took too long)
  timeout: 10_000,

  // suspensible: defer to <Suspense> boundary (true by default)
  // If false, shows loadingComponent instead of using Suspense fallback
  suspensible: true,

  // ── onError: retry logic for failed loads ──
  onError(error, retry, fail, attempts) {
    // error: the load error
    // retry(): call to retry loading
    // fail(): call to give up (show errorComponent)
    // attempts: number of attempts so far
    if (error.message.includes('Network') && attempts <= 3) {
      setTimeout(retry, 1000 * attempts)  // exponential-ish backoff
    } else {
      fail()  // give up — show errorComponent
    }
  },
})
```
::

## KeepAlive — LRU Caching of Component Instances

::code-wrapper{language="vue" filename="KeepAlivePattern.vue"}
```vue
<script setup>
import { ref, computed, KeepAlive } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

// ── KeepAlive caches component instances when they're toggled out ──
// Instead of destroying + recreating (losing state), the instance is
// detached from the DOM and cached in memory. Re-activation restores state.
//
// Hooks: onActivated (re-attached), onDeactivated (detached, not destroyed)
</script>

<template>
  <!-- ── include/exclude: cache only specific components by name ── -->
  <!-- Component name comes from: defineOptions({ name: 'X' }) or .vue filename -->
  <KeepAlive
    :include="['UserList', 'SearchResults']"
    :exclude="['HeavyChart']"
    :max="5"
  >
    <!-- ── max: LRU eviction — keep at most 5 instances ── -->
    <!-- When 6th is cached, the least recently used is destroyed -->
    <component :is="route.meta.component" />
  </KeepAlive>
</template>
```

::code-wrapper{language="vue" filename="KeepAliveTab.vue"}
```vue
<script setup>
import { ref, onMounted, onActivated, onDeactivated, onUnmounted, defineOptions } from 'vue'

defineOptions({ name: 'UserList' })  // required for KeepAlive include/exclude

const searchQuery = ref('')

// ── onMounted fires ONCE even with KeepAlive ──
onMounted(() => console.log('mounted — fires once'))

// ── onActivated fires on EVERY activation (including first mount) ──
onActivated(() => {
  // ── Resume polling, re-attach event listeners, refresh data ──
  // This is the "resume" hook — component is visible again.
  startPolling()
})

// ── onDeactivated fires when cached (detached from DOM, NOT destroyed) ──
onDeactivated(() => {
  // ── Pause polling, remove event listeners — component is hidden ──
  // State (searchQuery, scroll position) is PRESERVED for re-activation.
  stopPolling()
})

// ── onUnmounted fires only when KeepAlive evicts (max exceeded) or is removed ──
onUnmounted(() => console.log('truly destroyed'))
</script>
```
::

## Suspense — Async Component Orchestration

::code-wrapper{language="vue" filename="SuspensePattern.vue"}
```vue
<script setup>
import { ref, onErrorCaptured, defineAsyncComponent } from 'vue'

// ── Suspense: coordinates multiple async child components ──
// Shows fallback until ALL async children's setup() promises resolve.
const AsyncHeader = defineAsyncComponent(() => import('./AsyncHeader.vue'))
const AsyncMain = defineAsyncComponent(() => import('./AsyncMain.vue'))
const AsyncFooter = defineAsyncComponent(() => import('./AsyncFooter.vue'))

const error = ref(null)

// ── Error handling: Suspense doesn't handle errors itself ──
// Use onErrorCaptured in the parent to catch async setup errors.
onErrorCaptured((err) => {
  error.value = err
  return false  // prevent error from propagating further
})
</script>

<template>
  <div v-if="error" class="error">
    <p>Failed to load: {{ error.message }}</p>
    <button @click="error = null">Retry</button>
  </div>

  <!-- ── Suspense shows #fallback until ALL children resolve ── -->
  <Suspense v-else>
    <template #default>
      <AsyncHeader />
      <AsyncMain />
      <AsyncFooter />
      <!-- All three must resolve before #default renders -->
    </template>
    <template #fallback>
      <div class="loading-skeleton">Loading page…</div>
    </template>
  </Suspense>
</template>
```

::code-wrapper{language="vue" filename="AsyncChild.vue"}
```vue
<script setup>
import { ref } from 'vue'

const data = ref(null)

// ── Top-level await makes this an async component ──
// Suspense waits for this promise before rendering the child.
const res = await fetch('/api/data')
data.value = await res.json()
</script>

<template>
  <div>{{ data }}</div>
</template>
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
// ── 1. markRaw vs shallowRef for component refs ──
// markRaw(comp): marks a single component as non-reactive
// shallowRef({ a: compA, b: compB }): the whole object is shallow (non-deep)

// ── 2. Async component + Suspense + error boundary ──
// Wrap <Suspense> in a parent with onErrorCaptured for full error handling.
// Suspense handles loading, parent handles errors.

// ── 3. KeepAlive include can be a regex ──
// <KeepAlive :include="/^(User|Profile)/"> → caches any component starting with User or Profile

// ── 4. Prefetch async components on hover ──
// <RouterLink @mouseover="() => import('./NextPage.vue')">Next</RouterLink>
// Triggers chunk download before navigation — faster perceived load.

// ── 5. defineAsyncComponent onError for CDN fallback ──
onError(err, retry, fail) {
  // Try loading from a backup CDN if the primary fails
  if (primaryCDNFailed) { retryWithBackupCDN() } else { fail() }
}
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. :is with string name requires global registration ──
// <component :is="'MyComponent'" /> — only works if MyComponent is globally
// registered via app.component(). With <script setup>, import the component
// object directly: <component :is="MyComponent" />

// ── 2. KeepAlive + onMounted fires only once ──
// Common bug: event listeners in onMounted with KeepAlive.
// onDeactivated should remove them, onActivated should re-add.
// Putting cleanup in onUnmounted means listeners persist while cached.

// ── 3. Async component timeout doesn't cancel the import ──
// If timeout fires, errorComponent shows, but the import promise still resolves
// later. The component is cached — next render uses it without re-loading.

// ── 4. Suspense fallback shows for ALL async children ──
// If one child takes 5s and another takes 0.1s, the fast one isn't shown
// until the slow one resolves. Split into separate Suspense boundaries if needed.

// ── 5. :max on KeepAlive — eviction is LRU, not FIFO ──
// The least recently ACTIVATED (not created) component is evicted.
// A component created first but used most recently survives over newer ones.

// ── 6. Suspense can't catch errors in event handlers ──
// Only catches errors in: render, setup, lifecycle, watchers of async children.
// Event handler errors go to app.config.errorHandler.
```
::

## 🧠 Spot the Bug

A KeepAlive tab's scroll position resets when the user returns to it.

::code-wrapper{language="vue" filename="KeepAliveBug.vue"}
```vue
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const scrollPos = ref(0)

onMounted(() => {
  window.addEventListener('scroll', () => { scrollPos.value = window.scrollY })
})

onUnmounted(() => {
  // ⚠️ Doesn't fire on tab switch — only on true destruction (eviction)
  window.removeEventListener('scroll', handler)
  window.scrollTo(0, scrollPos.value)  // ← never runs on tab switch
})
</script>
```
::

<details>
<summary>Answer</summary>

With `KeepAlive`, switching tabs fires `onDeactivated` (not `onUnmounted`) and returning fires `onActivated` (not `onMounted`). The scroll restoration code in `onUnmounted` never runs during tab switching — it only runs when the component is truly evicted from cache.

**Fix** — use `onActivated`/`onDeactivated` for KeepAlive lifecycle:

::code-wrapper{language="vue" filename="KeepAliveFixed.vue"}
```vue
<script setup>
import { ref, onActivated, onDeactivated } from 'vue'

const scrollPos = ref(0)

function handler() { scrollPos.value = window.scrollY }

onActivated(() => {
  // Restore scroll position when tab is re-activated
  window.scrollTo(0, scrollPos.value)
  window.addEventListener('scroll', handler)
})

onDeactivated(() => {
  // Save scroll position when tab is deactivated (cached)
  window.removeEventListener('scroll', handler)
})
</script>
```
::

**The lesson**: with `KeepAlive`, `onMounted`/`onUnmounted` fire only once. Use `onActivated`/`onDeactivated` for save/restore logic that should run on every tab switch.

</details>