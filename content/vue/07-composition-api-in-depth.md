---
title: Vue 3 Engineering Reference — Composition API In Depth
description: setup() function form vs script setup, composable patterns with explicit return, lifecycle registration order, shared state via module-scoped refs, effect scope cleanup, and dependency injection in composables.
---

# 07 — Composition API In Depth

## setup() vs script setup — Compilation Difference

::code-wrapper{language="vue" filename="SetupFunction.vue"}
```vue
<script>
import { ref, computed, onMounted } from 'vue'

// ── setup() function form: the original Composition API ──
// Runs BEFORE the component is created (before data(), before created hook).
// Must explicitly return everything the template needs.
// `this` is NOT available — no access to component instance.
export default {
  props: { userId: Number },
  setup(props) {
    // props is reactive here — use props.userId, not this.userId
    const count = ref(0)
    const doubled = computed(() => count.value * 2)

    function increment() { count.value++ }

    onMounted(() => {
      console.log('mounted, count is', count.value)
    })

    // ── Must return an object — template accesses these as top-level ──
    // Anything not returned is invisible to the template.
    return { count, doubled, increment }
  }
}
</script>

<template>
  <button @click="increment">{{ count }} ({{ doubled }})</button>
</template>
```

::code-wrapper{language="vue" filename="ScriptSetup.vue"}
```vue
<script setup>
import { ref, computed, onMounted } from 'vue'

// ── <script setup> is syntactic sugar over setup() ──
// The compiler auto-returns all top-level bindings to the template.
// defineProps/defineEmits are compiler macros (not real imports).
const props = defineProps<{ userId: number }>()

const count = ref(0)
const doubled = computed(() => count.value * 2)

function increment() { count.value++ }

onMounted(() => console.log('mounted'))

// No return needed — count, doubled, increment are auto-exposed.
// Only things explicitly imported remain private if not used in template.
</script>

<template>
  <button @click="increment">{{ count }} ({{ doubled }})</button>
</template>
```
::

## Composable — useFetch with Race Condition Prevention

::code-wrapper{language="typescript" filename="useFetch.ts"}
```typescript
import { ref, watchEffect, isRef, toValue, type MaybeRefOrGetter } from 'vue'

// ── Production-grade useFetch: handles race conditions, abort, SSR ──
// Accepts ref, getter, or plain string as URL source.

interface FetchState<T> {
  data: Ref<T | null>
  error: Ref<Error | null>
  loading: Ref<boolean>
}

export function useFetch<T>(
  source: MaybeRefOrGetter<string>,
  options?: RequestInit
): FetchState<T> {
  const data = ref<T | null>(null) as Ref<T | null>
  const error = ref<Error | null>(null)
  const loading = ref(false)

  // watchEffect auto-tracks any reactive source read via toValue()
  watchEffect(async (onCleanup) => {
    const url = toValue(source)  // unwrap ref/getter/plain
    if (!url) return

    const controller = new AbortController()
    loading.value = true
    error.value = null

    // ── Race condition prevention: abort previous fetch on URL change ──
    onCleanup(() => controller.abort())

    try {
      const res = await fetch(url, { ...options, signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      data.value = await res.json() as T
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      error.value = e as Error
    } finally {
      loading.value = false
    }
  })

  return { data, error, loading }
}
```
::

## Shared State — Module-Scoped Singleton

::code-wrapper{language="typescript" filename="useSharedCounter.ts"}
```typescript
import { ref, computed, readonly, type Ref } from 'vue'

// ── Module-scoped ref = singleton shared across ALL importers ──
// The ref is created ONCE at module evaluation, not per composable call.
// Every component that calls useSharedCounter() gets the same ref.

const count = ref(0)  // module scope — ONE instance for the whole app
const doubled = computed(() => count.value * 2)

export function useSharedCounter() {
  function increment() { count.value++ }
  function decrement() { count.value-- }
  function reset() { count.value = 0 }

  return {
    count: readonly(count),  // expose read-only — prevent external mutation
    doubled: readonly(doubled),
    increment,
    decrement,
    reset,
  }
}

// ── Why this works: ────────────────────────────────────
// ES modules are singletons — the module body runs once.
// `count` lives in module scope, shared by all callers.
// This is a lightweight alternative to Pinia for simple global state.
// For complex state (multiple stores, devtools, persistence), use Pinia.

// ── ⚠️ SSR caveat: ──────────────────────────────────────
// On the server, module state is shared across ALL requests.
// Request A's count leaks into Request B — a security/correctness bug.
// Fix: use Pinia (request-scoped stores) or reset module state in server entry.
```
::

## Effect Scope Cleanup — Composable Teardown

::code-wrapper{language="typescript" filename="useEventListener.ts"}
```typescript
import { onScopeDispose, ref, type Ref } from 'vue'

// ── onScopeDispose: runs cleanup when the hosting scope stops ──
// In a component, the scope stops on unmount.
// In a composable called from setup(), the scope is the component's scope.
// This replaces manual onUnmounted cleanup for composables.

export function useEventListener(
  target: EventTarget | Ref<EventTarget>,
  event: string,
  handler: (e: Event) => void
) {
  // Get the target — handle both raw EventTarget and Ref<EventTarget>
  const el = toValue(target)

  el.addEventListener(event, handler)

  // ── Cleanup registered declaratively — runs on scope dispose ──
  // No need to return a cleanup function or call onUnmounted manually.
  onScopeDispose(() => {
    el.removeEventListener(event, handler)
  })
}

// ── Usage in a component: ──────────────────────────────
// setup() creates a scope; onScopeDispose callbacks fire on unmount.
// const { x, y } = useMouse()  // internally calls useEventListener
// Component unmounts → scope disposes → event listeners removed automatically.
```

::code-wrapper{language="typescript" filename="useMouse.ts"}
```typescript
import { ref, onScopeDispose } from 'vue'

export function useMouse() {
  const x = ref(0)
  const y = ref(0)

  function handler(e: MouseEvent) {
    x.value = e.clientX
    y.value = e.clientY
  }

  window.addEventListener('mousemove', handler)

  // ── Declarative cleanup — fires when the hosting component unmounts ──
  onScopeDispose(() => {
    window.removeEventListener('mousemove', handler)
  })

  return { x, y }
}

// ── Manual scope (outside component): ──────────────────
import { effectScope } from 'vue'

const scope = effectScope()
scope.run(() => {
  const { x, y } = useMouse()
  // listeners are active
})
scope.stop()  // stops the scope → onScopeDispose fires → listeners removed
```
::

## Async Setup — Suspense Integration

::code-wrapper{language="vue" filename="AsyncDataLoader.vue"}
```vue
<script setup>
import { ref } from 'vue'

// ── async setup() with top-level await ──
// Requires a <Suspense> boundary in the parent.
// While awaiting, the parent shows the fallback slot.

const data = ref(null)

// Top-level await pauses setup() — the component doesn't render until resolved.
// Parent: <Suspense><AsyncDataLoader /><template #fallback>Loading…</template></Suspense>
const res = await fetch('/api/initial-data')
data.value = await res.json()
</script>

<template>
  <div>{{ data }}</div>
</template>
```

::code-wrapper{language="typescript" filename="async-caveat.ts"}
```typescript
// ── Async setup caveats: ────────────────────────────────
// 1. Top-level await in <script setup> makes the component async.
//    It MUST be wrapped in <Suspense> or it throws.
// 2. Watchers and lifecycle hooks registered BEFORE the await
//    still fire, but after the await they may not if the component
//    is unmounted while still awaiting.
// 3. Error handling: use <Suspense> with error boundary, or
//    onErrorCaptured in the parent.
// 4. For most cases, prefer useFetch() composable (non-blocking)
//    over async setup — it's more flexible and doesn't require Suspense.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
// ── 1. Composable naming convention: useXxx ──
// Enables auto-import in some setups, signals "this is a composable."

// ── 2. Always return refs, not values, from composables ──
// ✅ return { count: readonly(count) }  — stays reactive in consumer
// ❌ return { count: count.value }       — snapshot, not reactive

// ── 3. Accept MaybeRefOrGetter for flexibility ──
function useTimer(duration: MaybeRefOrGetter<number>) {
  const ms = toValue(duration)  // unwrap at call site, not definition
  // Caller can pass: ref(5000), () => store.timeout, or 5000
}

// ── 4. Use shallowRef for large data inside composables ──
// Avoids deep reactivity proxy overhead for big arrays/objects.

// ── 5. Composables can use provide/inject internally ──
// Pattern: parent calls provideX(), descendants call useX() which injects.
// Decouples creation from consumption — clean DI.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. Module-scoped refs leak state on SSR ──
// Server: module state persists across requests → data leak.
// Fix: reset on server entry, or use Pinia (request-scoped).

// ── 2. onScopeDispose only works inside an active scope ──
// Calling onScopeDispose outside setup() or effectScope.run() throws.
// Don't call composables in setTimeout/callbacks — call in setup().

// ── 3. <script setup> is closed — no this, no $emit, no $parent ──
// Everything is top-level. Use defineExpose for parent access via refs.
// For programmatic navigation: import useRouter/useRoute, not this.$router.

// ── 4. setup() runs before created/data — no access to Options API state ──
// Can't read this.$options, this.$data in setup(). Use Composition API only.

// ── 5. async <script setup> requires <Suspense> ──
// Without <Suspense>, the component throws and the app crashes.
// Non-async alternatives: useFetch() in onMounted, watchEffect, etc.

// ── 6. Composable cleanup with onUnmounted vs onScopeDispose ──
// onScopeDispose: works in composables AND effectScope (more general).
// onUnmounted: only fires on component unmount (component-only).
// Prefer onScopeDispose in composable implementations.
```
::

## 🧠 Spot the Bug

A composable's event listener is never removed, causing a memory leak.

::code-wrapper{language="typescript" filename="LeakBug.ts"}
```typescript
import { ref, onMounted } from 'vue'

export function useMouse() {
  const x = ref(0)
  const y = ref(0)

  onMounted(() => {
    window.addEventListener('mousemove', (e) => {
      x.value = e.clientX
      y.value = e.clientY
    })
  })

  return { x, y }
}
```
::

<details>
<summary>Answer</summary>

The event listener is added but never removed. When the component unmounts, the listener persists, holding references to the component's `x` and `y` refs, preventing garbage collection.

**Fix** — register cleanup via `onScopeDispose`:

::code-wrapper{language="typescript" filename="LeakFixed.ts"}
```typescript
import { ref, onScopeDispose } from 'vue'

export function useMouse() {
  const x = ref(0)
  const y = ref(0)

  function handler(e: MouseEvent) {
    x.value = e.clientX
    y.value = e.clientY
  }

  window.addEventListener('mousemove', handler)
  onScopeDispose(() => window.removeEventListener('mousemove', handler))

  return { x, y }
}
```
::

**The lesson**: every external resource (event listener, timer, WebSocket, subscription) registered in a composable must have a cleanup handler via `onScopeDispose`. Without it, the resource leaks past the component's lifetime.

</details>