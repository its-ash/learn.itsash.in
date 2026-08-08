# 20 — SSR & Nuxt Basics

## What Problem SSR Actually Solves

A plain Vue SPA ships an essentially empty `index.html` with a `<div id="app"></div>` and a JavaScript bundle — the browser has to download, parse, and execute that JavaScript before *any* content appears. Server-Side Rendering (SSR) runs the same Vue app on the server first, producing fully-formed HTML that's sent to the browser immediately — real content is visible before JavaScript has even finished downloading. This matters for two concrete, measurable reasons: search engine crawlers and social-media link previews that don't execute JavaScript see real content instead of an empty shell, and users on slow connections or low-power devices see meaningful content much sooner (a better Largest Contentful Paint), even though the page isn't fully *interactive* until the JavaScript arrives.

## Hydration — Attaching Behavior to Server-Rendered HTML

SSR alone produces static HTML with no event listeners attached — **hydration** is the process of the client-side Vue app "waking up" that existing HTML, attaching event listeners and reactive bindings to the already-rendered DOM nodes rather than re-creating them from scratch:

::code-wrapper{language="javascript" filename="entry-client.js"}
```javascript
import { createSSRApp } from 'vue'
import App from './App.vue'

// createSSRApp, not createApp — tells Vue to hydrate existing server-rendered
// markup instead of rendering fresh DOM nodes into an empty container
const app = createSSRApp(App)
app.mount('#app')
```
::

::code-wrapper{language="javascript" filename="entry-server.js"}
```javascript
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import App from './App.vue'

export async function render() {
  const app = createSSRApp(App)
  const html = await renderToString(app)
  return html
}
```
::

### The hydration mismatch problem

Vue expects the DOM structure it hydrates to exactly match what a fresh client-side render *would have* produced — if the server and client render different output for the same initial state, Vue detects the mismatch, discards the mismatched portion, and re-renders it client-side, logging a hydration mismatch warning:

::code-wrapper{language="vue" filename="Greeting.vue"}
```vue
<script setup>
// WRONG — Date.now()/Math.random()/anything environment-dependent produces
// a DIFFERENT value on the server (render time) than on the client
// (hydration time), guaranteeing a mismatch
const renderedAt = new Date().toLocaleTimeString()
</script>

<template>
  <p>Rendered at: {{ renderedAt }}</p>
</template>
```
::

::code-wrapper{language="vue" filename="Greeting.vue"}
```vue
<script setup>
import { ref, onMounted } from 'vue'

// RIGHT — render a stable placeholder on both server and initial client
// render, then fill in the real, environment-dependent value only after
// mount, when hydration has already completed successfully
const renderedAt = ref(null)

onMounted(() => {
  renderedAt.value = new Date().toLocaleTimeString()
})
</script>

<template>
  <p>Rendered at: {{ renderedAt ?? '—' }}</p>
</template>
```
::

Other common mismatch sources: reading `window`/`document`/`localStorage` directly during render (none of those exist on the server at all), browser-extension-injected DOM attributes the server never produced, and locale/timezone-dependent formatting that differs between the server's environment and the user's browser.

## Universal Code vs Client-Only Code

"Universal" code is code that must run correctly in *both* environments — a Node.js server process during SSR, and a browser during hydration/subsequent interaction. Anything referencing browser-only globals needs to be guarded or deferred:

::code-wrapper{language="javascript"}
```javascript
// WRONG in a composable/component body that runs during SSR —
// `window` doesn't exist in Node, this throws a ReferenceError on the server
const screenWidth = window.innerWidth

// RIGHT — guard, or defer to onMounted, which never runs during SSR at all
import { ref, onMounted } from 'vue'

const screenWidth = ref(0)
onMounted(() => {
  screenWidth.value = window.innerWidth
})
```
::

`onMounted` (and `onUpdated`, `onUnmounted`) are the natural boundary here — none of the DOM-lifecycle hooks fire during SSR at all, since there's no real DOM on the server; code that must only ever run in the browser belongs inside them by construction, not behind a manual `typeof window !== 'undefined'` check scattered through render logic.

## This Site Is Built With Nuxt — What Nuxt Actually Adds

This documentation site itself runs on Nuxt Content, so the concepts here aren't abstract. Nuxt is a full-stack meta-framework built on top of Vue that provides, out of the box, everything the hand-rolled `entry-client.js`/`entry-server.js` split above would otherwise require you to wire up manually:

- **File-based routing** — a component in `pages/users/[id].vue` automatically becomes a route at `/users/:id`, replacing hand-written Vue Router route tables (chapter 11) with directory structure.
- **Automatic code-splitting per route** — every page is lazy-loaded by default, the manual `component: () => import(...)` pattern from chapter 11 happens automatically.
- **A unified data-fetching composable, `useFetch`/`useAsyncData`**, that runs on the server during SSR and serializes its result into the initial HTML payload, so the client doesn't re-fetch the same data again during hydration.
- **Auto-imports** — `ref`, `computed`, and Nuxt's own composables are available in every component with no explicit `import` statement, resolved by Nuxt's build tooling.
- **Server routes** (`server/api/*.ts`) — a way to write backend API endpoints in the same project, without a separate backend service.

## `useFetch` and `useAsyncData`

::code-wrapper{language="vue" filename="pages/products/[id].vue"}
```vue
<script setup>
const route = useRoute()

// runs on the SERVER during SSR, and the result is embedded in the initial
// HTML payload — the client does NOT re-fetch this during hydration
const { data: product, pending, error } = await useFetch(`/api/products/${route.params.id}`)
</script>

<template>
  <p v-if="pending">Loading…</p>
  <p v-else-if="error">Failed to load product.</p>
  <div v-else-if="product">{{ product.name }} — ${{ product.price }}</div>
</template>
```
::

This is the SSR-aware evolution of the plain `useFetch` composable built in chapter 12 — the shape (`data`/`pending`/`error`) is deliberately similar, but Nuxt's version additionally handles the "don't fetch twice" problem across the server-to-client handoff, which a hand-rolled composable in a plain Vue SPA doesn't need to solve at all (there's no server render to hand off from).

## Client-Only Components

::code-wrapper{language="vue" filename="pages/dashboard.vue"}
```vue
<template>
  <!-- ClientOnly is a Nuxt built-in — its default slot renders nothing
       during SSR and only mounts on the client, after hydration -->
  <ClientOnly>
    <HeavyMapWidget />
    <template #fallback>
      <p>Loading map…</p>
    </template>
  </ClientOnly>
</template>
```
::

`<ClientOnly>` is the practical, component-level escape hatch for third-party libraries that assume a browser environment unconditionally (many charting/mapping libraries touch `window`/`document` at import time, not just at render time) — wrapping them avoids both the SSR crash and any hydration-mismatch warning, at the cost of that content not being present in the initial server-rendered HTML at all (a real SEO/first-paint tradeoff to weigh deliberately, not a free workaround).

## Nuxt Content — How This Site Works

Nuxt Content (the system rendering the very document you're reading) parses Markdown files like this one at build time and exposes them as structured, queryable content — the `::code-wrapper` MDC syntax used throughout this curriculum is a Nuxt Content-specific extension of Markdown, resolving to a real Vue component (with real syntax highlighting) at render time, precisely because Nuxt Content runs actual Vue component resolution inside Markdown rather than treating Markdown as inert, pre-rendered HTML.

## Options API Note

SSR, hydration, and Nuxt's conventions all operate beneath the level of Composition vs Options API — either style of component works identically under SSR. The one universal-code rule that applies regardless of API style: don't touch browser globals outside of a lifecycle hook or explicit client-only boundary, whether that hook is `onMounted` (Composition) or `mounted()` (Options).

## 💡 Tips & Tricks

- **Debug** — A hydration mismatch warning in the console always names the component and often the specific mismatched attribute/text — read it before guessing; the fix is almost always either moving environment-dependent logic into `onMounted`, or wrapping the offending content in `<ClientOnly>`.
- **Idiom** — Treat any `window`/`document`/`localStorage`/`navigator` reference outside a lifecycle hook as a bug waiting to surface the moment SSR is introduced to a codebase, even in a project that currently runs as a pure SPA — the discipline costs nothing up front and saves a real migration headache later.
- **Performance** — Nuxt's `useFetch` deduplicates the server-to-client data handoff automatically; a hand-rolled `fetch` call inside `onMounted` in a Nuxt page re-fetches on the client even though the server already had the data during SSR — prefer `useFetch`/`useAsyncData` for anything that should benefit from SSR at all.
- **Idiom** — Reach for `<ClientOnly>` specifically for third-party, browser-assuming libraries — for your *own* components, prefer fixing the actual environment-dependent code (guard or defer to `onMounted`) so the content still benefits from SSR, rather than reflexively wrapping anything that errors.
- **Debug** — When debugging "why does my Nuxt page's data look stale after navigation," check whether the fetch is keyed correctly (`useFetch` accepts an explicit key) — an unkeyed or incorrectly-keyed fetch can return cached data from a previous page's request instead of re-fetching for the new route param.

## ⚠️ Edge Cases & Gotchas

- **`Date.now()`, `Math.random()`, and any other non-deterministic value computed during render (not inside a lifecycle hook) is a guaranteed hydration mismatch source** — The server computes one value at render time; the client, hydrating moments (or seconds, over a slow connection) later, computes a different one for the same "initial" render — always defer genuinely non-deterministic display values to `onMounted`.
- **Lifecycle hooks that only exist for DOM-mounted components (`onMounted`, `onUpdated`, `onUnmounted`) never fire during SSR at all** — Code that needs to run identically in both environments cannot rely on them; `onMounted` is specifically the boundary for "client-only" logic, not a universal setup hook that happens to also run on the server.
- **`<ClientOnly>` content is entirely absent from the server-rendered HTML, not just visually hidden** — Search engine crawlers and social-media link-preview scrapers that don't execute JavaScript never see anything inside a `<ClientOnly>` boundary — using it for primary page content (rather than a genuinely client-only enhancement like a map widget) undermines the actual SEO/first-paint benefit SSR exists to provide.
- **A composable that calls `onMounted` inside itself works fine in both SSR and pure-SPA contexts — but a composable that touches `window` directly at its own top level (outside any hook) breaks SSR the moment the composable is called during a server render**, even though the exact same composable worked perfectly well in a pre-SSR pure-SPA project — this is a common real-world migration surprise, not a hypothetical.
- **Nuxt's auto-imports can mask exactly which module a given function comes from**, which occasionally causes confusion when a name (like `useFetch`) exists both as a hand-written project composable and as a Nuxt built-in — Nuxt's own composables take precedence by default, and shadowing one unintentionally with a same-named local composable produces confusing behavior that's hard to spot without knowing this precedence rule.

## 🧠 Spot the Bug

A component displays "You've visited this page N times," reading a counter from `localStorage`. It works fine as a pure SPA but throws an error the moment the project adds SSR.

::code-wrapper{language="vue" filename="VisitCounter.vue"}
```vue
<script setup>
import { ref } from 'vue'

const count = ref(Number(localStorage.getItem('visits') ?? '0') + 1)
localStorage.setItem('visits', String(count.value))
</script>

<template>
  <p>You've visited this page {{ count }} times.</p>
</template>
```
::

<details>
<summary>Answer</summary>

`localStorage` is a browser-only global — it doesn't exist in the Node.js process running the server-side render. Reading it directly in the `<script setup>` body (rather than inside `onMounted`) means this code runs unconditionally during SSR too, and `localStorage.getItem(...)` throws a `ReferenceError` the instant the server attempts to render this component — a crash, not a warning, because unlike a hydration mismatch this isn't a rendering *difference*, it's code that's simply invalid in the server's environment at all.

::code-wrapper{language="vue" filename="VisitCounter.vue"}
```vue
<script setup>
import { ref, onMounted } from 'vue'

const count = ref(0)

onMounted(() => {
  const visits = Number(localStorage.getItem('visits') ?? '0') + 1
  localStorage.setItem('visits', String(visits))
  count.value = visits
})
</script>

<template>
  <p>You've visited this page {{ count }} times.</p>
</template>
```
::

**The lesson**: any browser-only API — `localStorage`, `window`, `document`, `navigator` — must be confined to a lifecycle hook that never runs during SSR (`onMounted` and later), never read directly in a component's top-level setup code, even in a project that starts out as a pure SPA with no SSR plans yet.

</details>

## Key Takeaways

- SSR renders real HTML on the server so users see content before JavaScript finishes loading; hydration then attaches interactivity to that existing markup on the client.
- A hydration mismatch happens when server-rendered and client-rendered output differ for the same initial state — common causes are non-deterministic values and direct reads of `window`/`document`/`localStorage` outside a lifecycle hook.
- `onMounted` (and other DOM-lifecycle hooks) never fire during SSR — it's the natural, correct boundary for anything that must only run in the browser.
- Nuxt provides file-based routing, automatic per-route code-splitting, SSR-aware data fetching (`useFetch`/`useAsyncData`), auto-imports, and server API routes on top of plain Vue — this documentation site itself runs on Nuxt Content.
- `<ClientOnly>` is the practical escape hatch for browser-assuming third-party libraries, at the real cost of that content being absent from the server-rendered HTML entirely.
- SSR and hydration concerns sit beneath Composition vs Options API — either style works identically; the universal-code discipline (guard or defer browser globals) applies regardless of which you use.
