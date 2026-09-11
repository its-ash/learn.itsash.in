---
title: Vue 3 Engineering Reference — Teleport & Suspense
description: Teleport target mounting, disabled prop for conditional teleporting, Suspense async orchestration with nested boundaries, error handling patterns, and SSR-safe teleport rendering.
---

# 16 — Teleport & Suspense

## Teleport — Render Outside the Component Tree

::code-wrapper{language="vue" filename="Modal.vue"}
```vue
<script setup>
import { ref, computed } from 'vue'

const props = defineProps<{
  modelValue: boolean
  teleportTo?: string  // configurable target, defaults to body
}>()

const emit = defineEmits(['update:modelValue'])

const target = computed(() => props.teleportTo ?? 'body')
const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})
</script>

<template>
  <!-- ── Teleport: renders the content at the target element ── -->
  <!-- The component's logic stays in the parent, but the DOM is moved. -->
  <!-- Critical for: modals, tooltips, dropdowns, notifications. -->
  <!-- Avoids: z-index stacking context issues, parent overflow clipping. -->
  <Teleport :to="target" :disabled="!isOpen">
    <!-- ── disabled: when true, content renders in-place (not teleported) ── -->
    <!-- Useful for SSR (no document.body on server) or conditional teleporting -->
    <div v-if="isOpen" class="modal-overlay" @click.self="isOpen = false">
      <div class="modal-content">
        <slot />
        <button @click="isOpen = false">Close</button>
      </div>
    </div>
  </Teleport>
</template>
```

### Why Teleport Exists — Stacking Context Problem

::code-wrapper{language="css" filename="stacking-context.css"}
```css
/* ── Without Teleport, a modal inside a parent with overflow:hidden ── */
/* or a transformed ancestor (creates stacking context) gets CLIPPED. */
.parent-with-overflow {
  overflow: hidden;  /* clips any child that extends beyond bounds */
  transform: translateZ(0);  /* creates a new stacking context */
}

/* .modal inside .parent-with-overflow:
   - z-index: 9999 is ignored (stacking context limits it to parent's context)
   - overflow: hidden clips the modal backdrop
   - The modal appears cut off or behind other elements outside the parent */

/* With Teleport to="body":
   - Modal is a direct child of <body>, no parent stacking context
   - z-index works globally
   - No overflow clipping
   - The modal renders above everything, regardless of where the component
     that opens it sits in the component tree. */
```
::

## Teleport with Multiple Targets — Dynamic Target

::code-wrapper{language="vue" filename="DropdownMenu.vue"}
```vue
<script setup>
import { ref, onMounted } from 'vue'

// ── Dynamic target: teleport to a ref'd container ──
// Useful for: app-specific containers (sidebars, drawer areas).
const customContainer = ref<HTMLElement | null>(null)

onMounted(() => {
  // Find or create a container element to teleport into
  customContainer.value = document.getElementById('dropdown-container')
})
</script>

<template>
  <Teleport :to="customContainer" :disabled="!customContainer">
    <div class="dropdown-menu">
      <slot name="items" />
    </div>
  </Teleport>

  <!-- ── Teleport to a CSS selector string ── -->
  <!-- <Teleport to="#modal-portal"> → finds element with id="modal-portal" -->
  <!-- The target MUST exist in the DOM before the Teleport mounts -->
</template>
```
::

## Suspense — Async Component Orchestration

::code-wrapper{language="vue" filename="SuspenseExample.vue"}
```vue
<script setup>
import { ref, onErrorCaptured, defineAsyncComponent } from 'vue'

// ── Suspense: declarative async component loading ──
// Parent shows #fallback slot while async children load.
// ALL async children must resolve before #default renders.

const AsyncUserProfile = defineAsyncComponent(() => import('./UserProfile.vue'))
const AsyncActivityFeed = defineAsyncComponent(() => import('./ActivityFeed.vue'))

// ── State for error handling (Suspense doesn't handle errors) ──
const error = ref<Error | null>(null)
const retryKey = ref(0)  // increment to force re-mount of async children

// ── onErrorCaptured: catches errors from async setup in children ──
// Must be in the PARENT of <Suspense>, not inside <Suspense> itself.
onErrorCaptured((err, instance, info) => {
  console.error(`Error in ${instance?.$options?.name} during ${info}:`, err)
  error.value = err
  return false  // stop propagation — don't crash the app
})

function retry() {
  error.value = null
  retryKey.value++  // key change forces component re-creation → re-runs async setup
}
</script>

<template>
  <!-- ── Error state: shown when async child throws ── -->
  <div v-if="error" class="error-boundary">
    <h2>Something went wrong</h2>
    <p>{{ error.message }}</p>
    <button @click="retry">Retry</button>
  </div>

  <!-- ── Suspense boundary: shows fallback until ALL children resolve ── -->
  <Suspense v-else>
    <template #default>
      <!-- key forces re-mount on retry -->
      <div :key="retryKey">
        <AsyncUserProfile />
        <AsyncActivityFeed />
        <!-- Both must resolve before this slot renders -->
      </div>
    </template>

    <template #fallback>
      <div class="loading-skeleton">
        <div class="skeleton-line" />
        <div class="skeleton-line" />
      </div>
    </template>
  </Suspense>
</template>
```

::code-wrapper{language="vue" filename="UserProfileChild.vue"}
```vue
<script setup>
import { ref } from 'vue'

const user = ref(null)

// ── Top-level await: makes this an async component ──
// Suspense pauses rendering until this resolves.
// If it throws, onErrorCaptured in the parent catches it.
const res = await fetch('/api/user/profile')
user.value = await res.json()
</script>

<template>
  <div>
    <h2>{{ user.name }}</h2>
    <p>{{ user.email }}</p>
  </div>
</template>
```
::

## Nested Suspense — Independent Loading Boundaries

::code-wrapper{language="vue" filename="NestedSuspense.vue"}
```vue
<template>
  <!-- ── Outer Suspense: waits for page shell ── -->
  <Suspense>
    <template #default>
      <Header />
      <main>
        <!-- ── Inner Suspense: independently loads sidebar ── -->
        <!-- If sidebar is slow, the main content still shows -->
        <Suspense>
          <template #default>
            <Sidebar />
          </template>
          <template #fallback>
            <div class="sidebar-skeleton">Loading sidebar…</div>
          </template>
        </Suspense>

        <!-- ── Inner Suspense: independently loads content ── -->
        <Suspense>
          <template #default>
            <Content />
          </template>
          <template #fallback>
            <div class="content-skeleton">Loading content…</div>
          </template>
        </Suspense>
      </main>
    </template>

    <template #fallback>
      <FullPageLoading />
    </template>
  </Suspense>
</template>

<!-- ── Why nested Suspense matters: ────────────────────
     Without nested boundaries, if ANY async child is slow, ALL children
     wait (outer fallback shows for everything). Nested boundaries allow
     independent loading — fast parts render while slow parts show fallback. -->
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
// ── 1. Teleport target must exist before Teleport mounts ──
// Use onMounted to verify, or create the target element dynamically.
// For SSR: use :disabled="isServer" to render in-place on server.

// ── 2. Suspense + async setup + watch: register watchers BEFORE await ──
// Watchers created after top-level await won't fire during the initial load.
// Place all watch/watchEffect calls before the first await.

// ── 3. Teleport preserves reactivity ──
// The teleported content still belongs to the component that created it.
// Props, state, provide/inject all work as if the DOM was in the component tree.

// ── 4. Multiple Teleports to the same target append in order ──
// <Teleport to="#portal">A</Teleport>
// <Teleport to="#portal">B</Teleport> → #portal contains A then B.

// ── 5. Suspense suspensible: false shows loadingComponent instead of fallback ──
// defineAsyncComponent({ suspensible: false, loadingComponent: Spinner })
// → component shows Spinner (not Suspense fallback) while loading.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. Teleport target must exist in DOM before Teleport renders ──
// If target is dynamically created, ensure it's available in onMounted.
// Otherwise: "Failed to locate target" warning, content renders in-place.

// ── 2. SSR: Teleport to="body" fails on server (no document) ──
// Use :disabled="typeof document === 'undefined'" to render in-place on server.
// Or: create a <div id="portal"> in your root HTML and teleport to that.

// ── 3. Suspense doesn't retry automatically on error ──
// After an error, the fallback slot stays. Must re-mount (change :key) to retry.
// onErrorCaptured + a retry button that increments a key is the standard pattern.

// ── 4. Async setup + lifecycle hooks: hooks after await may not fire ──
// onMounted registered AFTER the top-level await may not fire if the component
// is unmounted while still awaiting. Register all hooks before await.

// ── 5. Teleport content is NOT a child of the target in Vue's component tree ──
// The DOM is moved, but the component tree (provide/inject, parent/child)
// is preserved. inject() works as if the content was in its original position.

// ── 6. Suspense fallback shows for the ENTIRE boundary ──
// If you have 3 async children and 1 is slow, all 3 wait.
// Split into separate Suspense boundaries for independent loading.
```
::

## 🧠 Spot the Bug

A modal rendered inside a parent with `overflow: hidden` and `transform` is clipped and has broken z-index.

::code-wrapper{language="vue" filename="ModalBug.vue"}
```vue
<script setup>
const isOpen = ref(false)
</script>

<template>
  <!-- Parent has overflow: hidden + transform (creates stacking context) -->
  <div class="dashboard" style="overflow: hidden; transform: translateZ(0);">
    <button @click="isOpen = true">Open Modal</button>

    <!-- ❌ Modal rendered inside .dashboard — clipped by overflow, z-index limited -->
    <div v-if="isOpen" class="modal" style="z-index: 9999;">
      <slot />
    </div>
  </div>
</template>
```
::

<details>
<summary>Answer</summary>

The modal is a DOM child of `.dashboard`, which has `overflow: hidden` (clips the modal) and `transform: translateZ(0)` (creates a new stacking context — `z-index: 9999` is scoped to the parent's context, not global).

**Fix** — use Teleport to render the modal at `body` level:

::code-wrapper{language="vue" filename="ModalFixed.vue"}
```vue
<template>
  <div class="dashboard" style="overflow: hidden; transform: translateZ(0);">
    <button @click="isOpen = true">Open Modal</button>

    <!-- ✅ Teleport: modal DOM is at body level, no parent stacking context -->
    <Teleport to="body">
      <div v-if="isOpen" class="modal" style="z-index: 9999;">
        <slot />
      </div>
    </Teleport>
  </div>
</template>
```
::

**The lesson**: `overflow: hidden` and `transform` on an ancestor clip and scope the z-index of descendant elements. Teleport moves the modal DOM to `body`, escaping the parent's stacking context entirely.

</details>