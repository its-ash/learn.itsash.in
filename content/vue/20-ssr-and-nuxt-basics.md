---
title: Vue 3 Engineering Reference — SSR & Nuxt Basics
description: Server-side rendering hydration, onServerPrefetch data loading, state serialization, hydration mismatch causes, Nuxt universal rendering, and SSR-safe composables.
---

# 20 — SSR & Nuxt Basics

## SSR Lifecycle — Server vs Client

::code-wrapper{language="typescript" filename="ssr-lifecycle.ts"}
```typescript
// ── Server-side rendering lifecycle: ────────────────────
// 1. createApp() — app instance created (per-request in production)
// 2. setup() runs for all components — refs, computed, watchers registered
// 3. onServerPrefetch callbacks fire — async data fetching
// 4. Server waits for all onServerPrefetch promises to resolve
// 5. renderToString() — renders the component tree to HTML string
// 6. HTML + serialized state sent to client

// ── Client hydration lifecycle: ──────────────────────────
// 1. Browser receives HTML + JS bundle
// 2. HTML is displayed immediately (user sees content before JS loads)
// 3. createApp() — same component tree created on client
// 4. onServerPrefetch SKIPPED — server already fetched the data
// 5. Hydration: Vue "attaches" to existing DOM (no re-render, just event listeners)
// 6. If DOM matches expected VNodes: seamless. If not: hydration mismatch warning.

// ── Key difference: hydration is NOT a re-render ─────────
// Vue assumes the server HTML is correct and just adds interactivity.
// If the client and server produce different HTML, Vue discards the server
// HTML and re-renders from scratch (expensive, visible flash).
```
::

## onServerPrefetch — Data Preloading on Server

::code-wrapper{language="typescript" filename="SSRDataFetch.ts"}
```typescript
import { ref, onServerPrefetch, onMounted } from 'vue'

const data = ref(null)

// ── onServerPrefetch: runs ONLY on the server during SSR ──
// The callback returns a promise — server waits for resolution before rendering.
// The fetched data is in the component's reactive state when HTML is generated.
onServerPrefetch(async () => {
  const res = await fetch('https://api.example.com/data')
  data.value = await res.json()
})

// ── Client-side: fetch if data wasn't provided by SSR (no SSR data) ──
// During hydration, onServerPrefetch is skipped — data stays null if not injected.
// This onMounted acts as a fallback for client-side navigation (SPA mode).
onMounted(async () => {
  if (!data.value) {
    const res = await fetch('/api/data')
    data.value = await res.json()
  }
})
```
::

## State Serialization — Server to Client

::code-wrapper{language="typescript" filename="state-serialization.ts"}
```typescript
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia } from 'pinia'
import App from './App.vue'

// ── Server: render + serialize state ─────────────────────
export async function serverRender() {
  const pinia = createPinia()  // FRESH per request (no cross-request leaks)
  const app = createSSRApp(App)
  app.use(pinia)

  // ── Pre-populate Pinia stores (equivalent to onServerPrefetch) ──
  const userStore = useUserStore(pinia)
  await userStore.fetchUser()

  // ── Render to HTML string ──
  const html = await renderToString(app)

  // ── Serialize Pinia state for client hydration ──
  const state = JSON.stringify(pinia.state.value)

  // ── Inject into HTML: client reads this on load ──
  return `
    <div id="app">${html}</div>
    <script>window.__PINIA_STATE__ = ${state}</script>
  `
}

// ── Client: hydrate with server state ───────────────────
export function clientHydrate() {
  const pinia = createPinia()

  // ── Restore server state before mounting ──
  if (window.__PINIA_STATE__) {
    pinia.state.value = window.__PINIA_STATE__  // replace, not merge
  }

  const app = createSSRApp(App)  // createSSRApp for hydration (not createApp)
  app.use(pinia)
  app.mount('#app')  // hydrates existing DOM, doesn't re-render
}
```
::

## Hydration Mismatches — Causes and Fixes

::code-wrapper{language="typescript" filename="hydration-mismatches.ts"}
```typescript
import { ref, computed, onMounted } from 'vue'

// ── 1. Date/time-based rendering (server time ≠ client time) ──
const now = ref(new Date())
// Server renders 14:00, client renders 14:01 → mismatch
// Fix: render relative time on client only, or use a fixed timestamp from server

const formattedTime = computed(() => {
  // ❌ Bad: server and client compute different values
  return new Date().toLocaleTimeString()  // different on server vs client

  // ✅ Good: use a fixed timestamp (from server data)
  return new Date(serverTimestamp.value).toLocaleTimeString()
})

// ── 2. Math.random() in render ──────────────────────────
const randomId = Math.random()  // different on server and client
// Fix: generate random IDs in onMounted (client-only) or use UUID from server

// ── 3. window/document in template or setup ─────────────
// Server: no window → undefined or error
const width = ref(0)
// ❌ Bad: window in setup — crashes on server
// const width = ref(window.innerWidth)
// ✅ Good: read in onMounted (client-only)
onMounted(() => { width.value = window.innerWidth })

// ── 4. v-if based on client-only state ───────────────────
const isClient = ref(false)
onMounted(() => { isClient.value = true })  // true only on client
// Server renders v-if="false" (hidden), client renders v-if="true" (shown) → mismatch
// Fix: use ClientOnly wrapper (Nuxt) or :disabled on Teleport

// ── 5. CSS order differences (server vs client bundle) ──
// Different CSS load order can cause different computed styles.
// Not a Vue issue per se, but manifests as hydration warning.
```
::

## Nuxt — Universal Rendering Architecture

::code-wrapper{language="typescript" filename="nuxt-patterns.ts"}
```typescript
// ── Nuxt 3: file-based routing, auto-imports, universal rendering ──

// ── 1. useFetch: Nuxt's built-in data fetching (SSR + client) ──
import { useFetch, useAsyncData } from '#imports'  // auto-imported

// useFetch: handles SSR pre-fetch, client hydration, and client-side refetch
const { data: users, pending, error, refresh } = await useFetch('/api/users')
// Server: fetches during SSR, serializes result in payload
// Client: hydrates from payload (no re-fetch), refetches on client navigation

// ── 2. useAsyncData: custom fetcher with SSR ──
const { data } = await useAsyncData('users', async () => {
  // Custom fetcher — Nuxt handles SSR serialization + hydration
  const res = await $fetch('/api/users')
  return res
})

// ── 3. Server routes (Nuxt server API) ──
// server/api/users.get.ts:
// export default defineEventHandler(async () => {
//   return await db.query('SELECT * FROM users')
// })

// ── 4. ClientOnly: render children only on client (avoid mismatch) ──
// <ClientOnly>
//   <MapComponent />  <!-- rendered only after hydration -->
//   <template #fallback>
//     <div>Loading map…</div>  <!-- server + initial client -->
//   </template>
// </ClientOnly>

// ── 5. SSR-safe window access: import.meta.client ──
if (import.meta.client) {
  // Client-only code — safely skipped on server
  window.addEventListener('resize', handler)
}
```
::

## SSR-Safe Composables

::code-wrapper{language="typescript" filename="ssr-safe-composables.ts"}
```typescript
import { ref, onMounted, onScopeDispose, watch, type Ref } from 'vue'

// ── SSR-safe composable: handles server (no DOM) and client ──
export function useWindowWidth(): Ref<number> {
  const width = ref(0)

  // ── onMounted: client-only — server never runs it ──
  onMounted(() => {
    width.value = window.innerWidth
    const handler = () => { width.value = window.innerWidth }
    window.addEventListener('resize', handler)
    onScopeDispose(() => window.removeEventListener('resize', handler))
  })

  // ── Server: width stays 0 (no window) ──
  // Client: width updates on mount (hydration-compatible — 0 matches server)
  return width
}

// ── SSR-safe localStorage composable ──
export function useLocalStorage(key: string, initial: string): Ref<string> {
  const value = ref(initial)

  // ── onMounted: client-only — localStorage doesn't exist on server ──
  onMounted(() => {
    const stored = localStorage.getItem(key)
    if (stored !== null) value.value = stored

    // Watch: save to localStorage on change
    watch(value, (newVal) => {
      localStorage.setItem(key, newVal)
    })
  })

  return value
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
// ── 1. createSSRApp vs createApp ──
// createSSRApp: hydrates existing DOM (SSR) — doesn't re-render on mount.
// createApp: replaces DOM (SPA) — creates new DOM from scratch.
// Using createApp for SSR: full re-render, hydration warning, flash of content.

// ── 2. Hydration: Vue assumes server HTML is correct ──
// If mismatch: Vue discards server HTML, re-renders. Visible flash + perf cost.
// Debug: run in dev mode — Vue logs hydration mismatch warnings with details.

// ── 3. Pinia: createPinia per request on server ──
// Module-scoped Pinia leaks state between requests (security bug).
// Nuxt handles this automatically; custom SSR must create per-request.

// ── 4. ClientOnly: skip SSR for client-only components ──
// Maps, charts, webcams — anything requiring window/canvas.
// Server renders fallback, client renders real content after hydration.

// ── 5. import.meta.client / import.meta.server (Nuxt/Vite) ──
// Tree-shakeable: client-only code removed from server bundle and vice versa.
// Better than typeof window checks (runtime check, not build-time elimination).
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. Module-scoped state leaks across SSR requests ──
// const shared = ref(0) at module scope → Request A's data visible to Request B.
// Fix: create state per-request (Pinia, or factory function in app creation).

// ── 2. onServerPrefetch errors crash SSR if not caught ──
// If onServerPrefetch throws, the entire server render fails (500 error).
// Wrap in try/catch, or use Nuxt's useFetch (auto error handling).

// ── 3. Hydration mismatch on Date formatting ──
// Server: UTC timezone. Client: user's timezone.
// Same timestamp → different formatted strings → mismatch.
// Fix: format on client only (ClientOnly) or use UTC consistently.

// ── 4. Teleport to="body" breaks on server (no document) ──
// Use :disabled="typeof document === 'undefined'" or Nuxt's <Teleport> wrapper.
// Server renders in-place, client teleports on hydration.

// ── 5. Third-party libraries requiring window crash SSR ──
// Wrap in <ClientOnly> or import dynamically in onMounted.
// Or: use Nuxt plugin with mode: 'client' (only registered on client).

// ── 6. Async setup + SSR: requires Suspense ──
// Top-level await in setup makes the component async.
// On server: renderToString waits for it. On client: needs <Suspense>.
```
::

## 🧠 Spot the Bug

An SSR app shows a hydration mismatch warning for a clock component.

::code-wrapper{language="vue" filename="ClockBug.vue"}
```vue
<script setup>
import { ref, onMounted } from 'vue'

const time = ref(new Date().toLocaleTimeString())  // ← computed at setup time
</script>

<template>
  <div>Current time: {{ time }}</div>
</template>
```
::

<details>
<summary>Answer</summary>

`new Date().toLocaleTimeString()` runs during `setup()` — on the server, it captures the server's time at render time. On the client, `setup()` runs during hydration and captures a *different* time (milliseconds or seconds later, possibly a different timezone). The server HTML says "14:00:00.000" but the client computes "14:00:00.250" — mismatch.

**Fix** — render the time only on the client (after hydration) or use a fixed timestamp from the server:

::code-wrapper{language="vue" filename="ClockFixed.vue"}
```vue
<script setup>
import { ref, onMounted } from 'vue'

const time = ref('')

onMounted(() => {
  // Client-only: updates after hydration — no mismatch
  time.value = new Date().toLocaleTimeString()
})
</script>

<template>
  <div>Current time: {{ time || 'Loading…' }}</div>
</template>
```
::

**The lesson**: any value that depends on "when" it's computed (Date, Math.random, performance.now) will differ between server render and client hydration. Compute it in `onMounted` (client-only) or use a fixed value from server-side data.

</details>