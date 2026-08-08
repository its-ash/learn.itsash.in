# 16 — Teleport & Suspense

## The Problem `<Teleport>` Solves

A modal, tooltip, or dropdown menu is logically part of a deeply nested component, but visually needs to render at the very top of the DOM — otherwise it risks being clipped by an ancestor's `overflow: hidden`, sitting behind other elements due to `z-index`/stacking-context rules, or inheriting unwanted CSS from a parent. Rendering it in place, deep in the component tree, and fighting all of that with `z-index` is fragile; `<Teleport>` moves the *rendered DOM output* elsewhere while keeping the component logically in its original place in the Vue tree (props, events, `provide`/`inject`, and `this`/reactive scope all behave exactly as if it hadn't moved).

::code-wrapper{language="vue" filename="Modal.vue"}
```vue
<script setup>
defineProps({ open: Boolean })
defineEmits(['close'])
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay" @click.self="$emit('close')">
      <div class="modal">
        <slot />
        <button @click="$emit('close')">Close</button>
      </div>
    </div>
  </Teleport>
</template>
```
::

::code-wrapper{language="vue"}
```vue
<template>
  <!-- Modal is used exactly like any other component here — Teleport's -->
  <!-- effect is invisible at the call site; only the RENDERED DOM location changes -->
  <div class="deeply-nested-container" style="overflow: hidden;">
    <Modal :open="isOpen" @close="isOpen = false">
      <p>This modal escapes the overflow:hidden container above.</p>
    </Modal>
  </div>
</template>
```
::

`to` accepts any valid CSS selector (`"body"`, `"#modal-root"`, `".teleport-target"`) or an actual DOM element reference. A dedicated `<div id="modal-root">` placed once near the end of `index.html`/the app's root template is a common, deliberate teleport target, kept separate from `body` directly so global modal styles don't have to compete with arbitrary other things also teleported to `body`.

### `disabled` — conditionally skipping the teleport

::code-wrapper{language="vue"}
```vue
<template>
  <!-- on mobile, render inline; on desktop, teleport to a sidebar slot —
       useful for genuinely different layouts per breakpoint without
       maintaining two separate component templates -->
  <Teleport to="#desktop-sidebar" :disabled="isMobile">
    <FilterPanel />
  </Teleport>
</template>
```
::

When `disabled` is `true`, content renders in its normal in-place DOM position instead of being moved — the component tree position (props/state/context) never changes either way; only the rendered DOM location toggles.

### Multiple Teleports to the same target

::code-wrapper{language="vue"}
```vue
<template>
  <!-- both instances append into #modal-root, in the order they mount —
       Vue does not overwrite one with the other -->
  <Teleport to="#modal-root"><ConfirmDialog v-if="showConfirm" /></Teleport>
  <Teleport to="#modal-root"><SettingsModal v-if="showSettings" /></Teleport>
</template>
```
::

## The Problem `<Suspense>` Solves

Chapter 12 introduced top-level `await` inside `<script setup>`, which requires a `<Suspense>` ancestor. `<Suspense>` lets a parent show unified fallback content (a spinner, a skeleton) while one or more descendant components are still resolving their async setup, instead of each async component individually needing its own local loading state:

::code-wrapper{language="vue" filename="UserProfile.vue"}
```vue
<script setup>
const res = await fetch('/api/users/me')
const user = await res.json()
</script>

<template>
  <h1>{{ user.name }}</h1>
</template>
```
::

::code-wrapper{language="vue" filename="App.vue"}
```vue
<template>
  <Suspense>
    <template #default>
      <UserProfile />
    </template>
    <template #fallback>
      <p>Loading profile…</p>
    </template>
  </Suspense>
</template>
```
::

`<Suspense>` waits for **every** async dependency inside its default slot to resolve before showing the real content — with multiple async children, it shows the fallback until the *slowest* one finishes, then swaps to the fully-resolved tree all at once (avoiding a jarring partial-content flash where some sections appear before others).

### Multiple async components under one `<Suspense>`

::code-wrapper{language="vue" filename="Dashboard.vue"}
```vue
<script setup>
import { defineAsyncComponent } from 'vue'

const RevenueChart = defineAsyncComponent(() => import('./RevenueChart.vue'))
const RecentOrders = defineAsyncComponent(() => import('./RecentOrders.vue'))
</script>

<template>
  <Suspense>
    <template #default>
      <div class="dashboard-grid">
        <RevenueChart />
        <RecentOrders />
      </div>
    </template>
    <template #fallback>
      <DashboardSkeleton />
    </template>
  </Suspense>
</template>
```
::

## Handling Errors Inside `<Suspense>`

`<Suspense>` has no built-in error UI of its own — an error thrown during an async component's setup needs to be caught by an `onErrorCaptured` boundary (chapter 08) in an ancestor, or it propagates as an unhandled error:

::code-wrapper{language="vue" filename="App.vue"}
```vue
<script setup>
import { ref, onErrorCaptured } from 'vue'

const loadError = ref(null)

onErrorCaptured((err) => {
  loadError.value = err
  return false   // stop propagation once handled here
})
</script>

<template>
  <div v-if="loadError" class="error-banner">
    Failed to load: {{ loadError.message }}
    <button @click="loadError = null">Retry</button>
  </div>
  <Suspense v-else>
    <template #default>
      <UserProfile />
    </template>
    <template #fallback>
      <p>Loading…</p>
    </template>
  </Suspense>
</template>
```
::

Clicking "Retry" here works by re-mounting `<Suspense>` and its content (since `v-else` toggles it back into existence) — a common, simple recovery pattern, though a more sophisticated one might keep `<Suspense>` mounted and instead re-trigger the specific failed fetch.

## Combining Teleport and Suspense: an Async Modal

::code-wrapper{language="vue" filename="UserDetailModal.vue"}
```vue
<script setup>
defineProps({ userId: Number })

const props = defineProps({ userId: Number })
const res = await fetch(`/api/users/${props.userId}`)
const user = await res.json()
</script>

<template>
  <div class="modal-content">
    <h2>{{ user.name }}</h2>
    <p>{{ user.email }}</p>
  </div>
</template>
```
::

::code-wrapper{language="vue" filename="App.vue"}
```vue
<template>
  <Teleport to="body">
    <div v-if="selectedUserId" class="modal-overlay">
      <Suspense>
        <template #default>
          <UserDetailModal :userId="selectedUserId" />
        </template>
        <template #fallback>
          <div class="modal-content"><p>Loading user…</p></div>
        </template>
      </Suspense>
    </div>
  </Teleport>
</template>
```
::

This combination is genuinely common in production UI — a modal (needs `<Teleport>` to escape stacking-context/overflow issues) whose content depends on an async fetch (needs `<Suspense>` for a clean fallback while that fetch resolves) — each solving an entirely independent problem, composed together with no special interaction between them.

## `<Suspense>` Is Still Experimental

As of Vue 3's stable releases, `<Suspense>`'s API is explicitly documented as experimental and subject to change in a future minor version — production code relying on it (particularly nested `<Suspense>` boundaries, or its more advanced timeout/`pending`-event features) should pin Vue's version deliberately and review the changelog before upgrading, rather than assuming full semantic-versioning stability the way the rest of the framework offers.

## Options API Note

Both `<Teleport>` and `<Suspense>` are template-level features, not Composition-API-specific — they work identically regardless of whether the components involved use `<script setup>` or the Options API. The only Composition-API-specific piece in this chapter is top-level `await` in `<script setup>`, which has no Options API equivalent — an Options API component achieves the same "async before render" effect with an async `setup()` function returning a promise of the returned bindings, a much less ergonomic form of the same underlying mechanism.

## 💡 Tips & Tricks

- **Idiom** — Reserve a single, dedicated element (`#modal-root`, `#toast-root`) as the conventional `<Teleport>` target for each category of overlay UI across an app — consistently teleporting all modals to the same place makes global overlay styling (backdrop stacking order, max-one-modal-at-a-time logic) far easier to reason about than teleporting different features to different ad hoc targets.
- **Debug** — Remember that `<Teleport>` only changes *rendered DOM location* — Vue DevTools' component tree still shows the component in its logical (non-teleported) position; look at the actual browser DOM (Elements panel), not the Vue component tree, to confirm where content physically landed.
- **Idiom** — Use `<Suspense>`'s `#fallback` slot for skeleton screens rather than a bare spinner whenever the eventual layout is known in advance — a skeleton that mirrors the real content's shape reduces perceived loading time more than a generic spinner does, at no extra technical cost.
- **Debug** — When `<Suspense>` seems to hang on the fallback forever, check for an async component whose setup threw without being caught by an `onErrorCaptured` boundary — a rejected async setup can leave `<Suspense>` never resolving to its default slot, with the real error visible only in the console.
- **Idiom** — Treat `<Suspense>` as suitable for a genuinely blocking "can't render meaningfully without this data" case (an entire page needing a user record) rather than page-section-level loading — independent, non-blocking sections (chapter 12's dashboard-with-partial-failure pattern) are usually better served by per-section `ref`-based loading state than by nesting multiple `<Suspense>` boundaries.

## ⚠️ Edge Cases & Gotchas

- **`<Teleport>`'s `to` target must exist in the DOM by the time the component mounts** — Targeting a selector that doesn't exist yet (for example, an element rendered conditionally elsewhere, or one that hasn't mounted yet due to component ordering) throws a warning and the teleport silently fails to move the content — a static, always-present target element (often placed directly in `index.html` or the app's root template) sidesteps this entirely.
- **Teleported content still participates in the original component's reactive scope and `provide`/`inject` chain, but NOT in its parent's CSS scoping** — A `<style scoped>` block's generated data attribute only applies to elements that remain in their original template position; teleported markup loses `scoped` style association even though its logical Vue-tree position (and therefore access to injected values) is unaffected — teleported content typically needs global (non-scoped) styles or a CSS Module.
- **`<Suspense>` resolves only once by default — reactive changes to props after the initial async setup do not put the component back into a pending/fallback state** — A component using top-level `await` reads its props once during that initial async setup; if a prop later changes, the component does not automatically re-run its top-level `await` block and re-show the fallback, unlike the `watch`-driven re-fetching pattern from chapter 12 — this is a real limitation of the pattern, not a bug, and is part of why `ref`+`watch` remains more flexible for data that changes after initial load.
- **Multiple async children under one `<Suspense>` all block on the slowest one** — A dashboard with one fast component and one slow one shows the fallback for the *entire* duration of the slow one, even though the fast one's data was ready much earlier — if independent per-section loading is actually the desired UX, per-component `ref`-based loading state (chapter 12) composes better than one shared `<Suspense>`.
- **`<Suspense>` is explicitly experimental and its behavior has changed across Vue 3 minor versions** — Code relying on its edge-case behavior (nested `<Suspense>`, the `pending`/`resolve`/`fallback` events, `suspensible` on nested boundaries) should be revisited on every Vue upgrade rather than assumed stable indefinitely.

## 🧠 Spot the Bug

A tooltip component is teleported to `body` so it isn't clipped by a parent's `overflow: hidden`, but its styling looks completely broken — no background, no border, no positioning — even though the exact same CSS class works fine on a non-teleported element elsewhere in the app.

::code-wrapper{language="vue" filename="Tooltip.vue"}
```vue
<script setup>
defineProps({ text: String })
</script>

<template>
  <Teleport to="body">
    <div class="tooltip-box">{{ text }}</div>
  </Teleport>
</template>

<style scoped>
.tooltip-box {
  position: absolute;
  background: #333;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
}
</style>
```
::

<details>
<summary>Answer</summary>

The `<style scoped>` block generates a unique data attribute (something like `data-v-7ba5bd90`) and rewrites `.tooltip-box` into `.tooltip-box[data-v-7ba5bd90]` under the hood, then stamps that same data attribute onto every element the component renders **in its original template position**. But `<Teleport>` moves the `<div class="tooltip-box">` to an entirely different place in the actual DOM (as a child of `<body>`) — outside the tree Vue associates with this component's scoped-style attribute application in some Vue/compiler versions' edge cases, and even where the attribute is correctly applied, teams frequently structure global overlay CSS (reset styles, competing `body > div` selectors) in a way that scoped attributes don't protect against. Practically, the safe, reliable pattern is to not rely on `scoped` for teleported content at all.

::code-wrapper{language="vue" filename="Tooltip.vue"}
```vue
<script setup>
defineProps({ text: String })
</script>

<template>
  <Teleport to="body">
    <div class="tooltip-box">{{ text }}</div>
  </Teleport>
</template>

<style>
/* global, not scoped — teleported markup lives outside this
   component's normal template position in the real DOM */
.tooltip-box {
  position: absolute;
  background: #333;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
}
</style>
```
::

**The lesson**: styles for teleported content should be global (or a CSS Module keyed by class name, not Vue's `scoped` attribute mechanism) — `scoped` styling assumes elements stay within the component's original template position in the DOM, an assumption `<Teleport>` exists specifically to break.

</details>

## Key Takeaways

- `<Teleport>` moves rendered DOM output to a different location in the physical DOM while keeping the component's logical position (props, state, `provide`/`inject`) completely unchanged — solves overflow/z-index/stacking-context problems for modals, tooltips, and dropdowns.
- `<Teleport>`'s `to` target must already exist in the DOM at mount time; a static target element (in `index.html` or the app root) is the reliable choice.
- Scoped styles don't reliably apply to teleported content — use global CSS or CSS Modules for anything rendered through a `<Teleport>`.
- `<Suspense>` shows unified fallback content while descendant async components (top-level `await` in `<script setup>`) resolve, blocking on the *slowest* one when there are several.
- `<Suspense>` has no built-in error UI — pair it with an `onErrorCaptured` boundary in an ancestor to handle a rejected async setup.
- `<Suspense>` is still an experimental API in Vue 3 — review its behavior on every version upgrade rather than assuming long-term stability.
