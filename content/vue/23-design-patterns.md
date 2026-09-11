---
title: Vue 3 Engineering Reference — Design Patterns
description: Store pattern, renderless components, composable composition, higher-order composables, provider/consumer DI, observer pattern with reactive state, and feature-based module organization.
---

# 23 — Design Patterns

## Store Pattern — Module-Scoped Singleton

::code-wrapper{language="typescript" filename="patterns/store.ts"}
```typescript
import { ref, readonly, computed, type Ref, type ComputedRef } from 'vue'

// ── Store pattern: module-scoped reactive state + controlled mutations ──
// Lightweight alternative to Pinia for simple global state.
// State is private (module scope); only the returned API is public.

interface Todo {
  id: string
  text: string
  done: boolean
  createdAt: number
}

// ── Private state (module scope — not exported) ──────────
const _todos: Ref<Todo[]> = ref([])
const _filter: Ref<'all' | 'active' | 'done'> = ref('all')

// ── Private mutation function (not exported) ────────────
function _addTodo(text: string): void {
  _todos.value.push({
    id: crypto.randomUUID(),
    text,
    done: false,
    createdAt: Date.now(),
  })
}

// ── Public API (exported composable) ────────────────────
export function useTodoStore() {
  return {
    // ── Read-only state: consumers can't mutate directly ──
    todos: readonly(_todos),
    filter: readonly(_filter),

    // ── Computed getters: derived from state ──
    filtered: computed(() => {
      switch (_filter.value) {
        case 'active': return _todos.value.filter(t => !t.done)
        case 'done': return _todos.value.filter(t => t.done)
        default: return _todos.value
      }
    }) as ComputedRef<Todo[]>,

    remaining: computed(() => _todos.value.filter(t => !t.done).length),
    total: computed(() => _todos.value.length),

    // ── Actions: the ONLY way to mutate state ────────────
    add(text: string) { _addTodo(text) },
    toggle(id: string) {
      const todo = _todos.value.find(t => t.id === id)
      if (todo) todo.done = !todo.done
    },
    remove(id: string) {
      _todos.value = _todos.value.filter(t => t.id !== id)
    },
    setFilter(f: 'all' | 'active' | 'done') { _filter.value = f },
    clearDone() {
      _todos.value = _todos.value.filter(t => !t.done)
    },
  }
}

// ── Why readonly: ──────────────────────────────────────
// Consumers can read but can't write: todos.value.push(...) throws in dev.
// Forces all mutations through the action API → traceable, debuggable.
// All state changes go through known functions (add, toggle, remove, etc.).
```
::

## Renderless Component — Logic via Scoped Slots

::code-wrapper{language="vue" filename="RenderlessToggle.vue"}
```vue
<script setup>
import { ref, computed } from 'vue'

// ── Renderless component: provides state, renders nothing itself ──
// Parent has 100% control over the template via the scoped slot.
const isOpen = ref(false)

function open() { isOpen.value = true }
function close() { isOpen.value = false }
function toggle() { isOpen.value = !isOpen.value }
</script>

<template>
  <!-- ── Slot receives: state + actions ──────────────────── -->
  <slot
    :is-open="isOpen"
    :open="open"
    :close="close"
    :toggle="toggle"
  />
</template>
```

::code-wrapper{language="vue" filename="RenderlessUsage.vue"}
```vue
<template>
  <!-- ── Parent: full control over rendering ── -->
  <RenderlessToggle v-slot="{ isOpen, toggle, close }">
    <div>
      <button @click="toggle">{{ isOpen ? 'Close' : 'Open' }}</button>

      <div v-if="isOpen" class="panel">
        <p>Panel content</p>
        <button @click="close">Close X</button>
      </div>
    </div>
  </RenderlessToggle>

  <!-- ── Same logic, different template: ── -->
  <RenderlessToggle v-slot="{ isOpen, toggle }">
    <details :open="isOpen" @toggle="toggle">
      <summary>Click to {{ isOpen ? 'collapse' : 'expand' }}</summary>
      <p>Content</p>
    </details>
  </RenderlessToggle>
</template>
```
::

## Composable Composition — Higher-Order Composables

::code-wrapper{language="typescript" filename="composable-composition.ts"}
```typescript
import { ref, computed, type Ref, type MaybeRefOrGetter } from 'vue'

// ── Base composable: useFetch ───────────────────────────
function useFetch<T>(url: MaybeRefOrGetter<string>) {
  const data: Ref<T | null> = ref(null) as Ref<T | null>
  const loading = ref(false)
  const error = ref<Error | null>(null)
  // ... fetch logic ...
  return { data, loading, error }
}

// ── Higher-order composable: wraps useFetch with caching ──
function useCachedFetch<T>(url: MaybeRefOrGetter<string>, ttl = 60_000) {
  const { data, loading, error } = useFetch<T>(url)
  const lastFetch = ref(0)
  const isStale = computed(() => Date.now() - lastFetch.value > ttl)

  async function refresh() {
    if (!isStale.value && data.value) return data.value
    // ... refetch ...
    lastFetch.value = Date.now()
  }

  return { data, loading, error, isStale, refresh }
}

// ── Composing multiple composables: useUserWithPosts ──
function useUserWithPosts(userId: MaybeRefOrGetter<number>) {
  // ── Compose two fetches into one composable ──
  const user = useCachedFetch(() => `/api/users/${toValue(userId)}`)
  const posts = useCachedFetch(() => `/api/users/${toValue(userId)}/posts`)

  const isLoading = computed(() => user.loading.value || posts.loading.value)
  const hasError = computed(() => !!user.error.value || !!posts.error.value)

  return {
    user: user.data,
    posts: posts.data,
    isLoading,
    hasError,
    refreshUser: user.refresh,
    refreshPosts: posts.refresh,
  }
}
```
::

## Provider/Consumer — Typed Dependency Injection

::code-wrapper{language="typescript" filename="provider-consumer.ts"}
```typescript
import { provide, inject, ref, readonly, type Ref, type InjectionKey } from 'vue'

// ── InjectionKey: typed symbol for type-safe DI ──────────
const NotificationContextKey: InjectionKey<{
  notifications: Readonly<Ref<Notification[]>>
  notify: (message: string, type?: 'info' | 'error') => void
  dismiss: (id: string) => void
}> = Symbol('notifications')

// ── Provider: set up at app or component root ──────────
export function provideNotifications() {
  const notifications = ref<Notification[]>([])

  function notify(message: string, type: 'info' | 'error' = 'info') {
    const id = crypto.randomUUID()
    notifications.value.push({ id, message, type, timestamp: Date.now() })
    setTimeout(() => dismiss(id), 5000)  // auto-dismiss after 5s
  }

  function dismiss(id: string) {
    notifications.value = notifications.value.filter(n => n.id !== id)
  }

  const context = {
    notifications: readonly(notifications),  // read-only for consumers
    notify,
    dismiss,
  }

  provide(NotificationContextKey, context)
  return context  // provider also gets the mutable API
}

// ── Consumer: use in any descendant ─────────────────────
export function useNotifications() {
  const ctx = inject(NotificationContextKey)
  if (!ctx) {
    throw new Error('useNotifications() must be used within a component that calls provideNotifications()')
  }
  return ctx
}

// ── Usage in root component: ────────────────────────────
// provideNotifications()
// ── Usage in any descendant: ────────────────────────────
// const { notify, dismiss, notifications } = useNotifications()
// notify('Saved!', 'info')  → adds a notification, auto-dismisses in 5s
```
::

## Observer Pattern — Reactive Event Bus

::code-wrapper{language="typescript" filename="event-bus.ts"}
```typescript
import { ref, type Ref } from 'vue'

// ── Event bus: for cross-component communication without Pinia ──
// Use sparingly — prefer Pinia for state, provide/inject for DI.
// Event bus is for ephemeral events (notifications, toasts), not state.

type EventHandler<T = any> = (payload: T) => void

class EventBus {
  private handlers = new Map<string, Set<EventHandler>>()

  on<T>(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler as EventHandler)

    // ── Return unsubscribe function (composable cleanup pattern) ──
    return () => this.handlers.get(event)?.delete(handler as EventHandler)
  }

  emit<T>(event: string, payload: T): void {
    this.handlers.get(event)?.forEach(handler => handler(payload))
  }

  off(event: string): void {
    this.handlers.delete(event)
  }
}

export const bus = new EventBus()

// ── Usage in composable with cleanup: ───────────────────
import { onScopeDispose } from 'vue'

export function useEventBus(event: string, handler: EventHandler) {
  const unsubscribe = bus.on(event, handler)
  onScopeDispose(() => unsubscribe())  // auto-cleanup on component unmount
}

// ── Emitting: ──────────────────────────────────────────
// bus.emit('user:login', { id: 42, name: 'Ada' })
// ── Listening: ──────────────────────────────────────────
// useEventBus('user:login', (payload) => { console.log(payload) })
```
::

## Feature-Based Module Organization

::code-wrapper{language="bash" filename="feature-modules.sh"}
```bash
# ── Feature-based: group by business domain, not by file type ──
# Each feature is self-contained: components, composables, stores, types.

src/
├── features/
│   ├── auth/
│   │   ├── components/
│   │   │   ├── LoginForm.vue
│   │   │   └── AuthGuard.vue
│   │   ├── composables/
│   │   │   └── useAuth.ts
│   │   ├── stores/
│   │   │   └── authStore.ts
│   │   ├── types/
│   │   │   └── auth.ts
│   │   └── index.ts          # public API: export only what other features need
│   ├── products/
│   │   ├── components/
│   │   │   ├── ProductList.vue
│   │   │   └── ProductDetail.vue
│   │   ├── composables/
│   │   │   └── useProducts.ts
│   │   ├── stores/
│   │   │   └── productStore.ts
│   │   ├── types/
│   │   │   └── product.ts
│   │   └── index.ts
│   └── checkout/
│       └── ...
├── shared/                   # cross-feature utilities, types, components
│   ├── components/
│   │   └── BaseButton.vue
│   ├── composables/
│   │   └── useFetch.ts
│   └── utils/
└── app/                      # app-level config, routing, providers
    ├── App.vue
    └── router.ts
```

::code-wrapper{language="typescript" filename="features/auth/index.ts"}
```typescript
// ── Feature barrel: export only the public API ──────────
// Other features import from the index, not internal files.
export { useAuth } from './composables/useAuth'
export { useAuthStore } from './stores/authStore'
export type { User, Credentials } from './types/auth'
export { default as LoginForm } from './components/LoginForm.vue'

// ── Internal files are NOT exported — they're implementation details ──
// This creates a clear boundary: features communicate through their public API.
// Other features: import { useAuth } from '@/features/auth' (not from auth/composables/useAuth)
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
// ── 1. Store pattern vs Pinia: use Pinia for anything non-trivial ──
// Store pattern is for 1-2 pieces of simple state. Pinia for: DevTools,
// persistence, SSR, multiple stores, getters with parameters.

// ── 2. Renderless components vs composables: prefer composables ──
// Composables are lighter (no component instance). Renderless components
// shine when you need slot-based template injection (parent controls markup).

// ── 3. EventBus: use for ephemeral events, NOT for state ──
// State belongs in Pinia. EventBus is for: toasts, notifications, analytics.
// If you're storing data in the event bus, you've reinvented a bad Pinia.

// ── 4. Feature modules: index.ts as the public API boundary ──
// Only export what other features should use. Internal files are private.
// This prevents tight coupling between features' internal implementations.

// ── 5. readonly on injected/provided state: prevents external mutation ──
// Forces consumers to use the action API → all mutations are traceable.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. Module-scoped store leaks state on SSR ──
// Server: module scope persists across requests → data leak.
// Fix: use Pinia (request-scoped) or reset module state in server entry.

// ── 2. EventBus without cleanup = memory leak ───────────
// Listeners persist after component unmount if not unsubscribed.
// Always return an unsubscribe function and call it in onScopeDispose.

// ── 3. Renderless component: slot can only have ONE default slot ──
// Named slots are possible but complex. For multiple "slots", use multiple
// composables or pass multiple render functions.

// ── 4. Composable returning refs: must return refs, not values ──
// return { count: ref(0) } → reactive. return { count: 0 } → static snapshot.

// ── 5. Feature barrel: circular imports if two features import each other ──
// If auth imports from products and products imports from auth → circular.
// Fix: extract shared types to a common module, or use lazy imports.

// ── 6. readonly() is shallow — nested objects are still mutable ──
// readonly(state).nested.prop = x → allowed (readonly only protects top level).
// Use readonly(reactive(...)) for deep, or accept shallow readonly.
```
::

## 🧠 Spot the Bug

An event bus listener keeps firing after the component unmounts, causing errors.

::code-wrapper{language="typescript" filename="EventBusBug.ts"}
```typescript
import { onMounted } from 'vue'
import { bus } from './eventBus'

export default {
  setup() {
    onMounted(() => {
      // ❌ Listener added but never removed — persists after unmount
      bus.on('user:login', (user) => {
        // After unmount, this still fires → errors if it references unmounted state
        console.log('User logged in:', user.name)
      })
    })
  },
}
```
::

<details>
<summary>Answer</summary>

The event listener is registered in `onMounted` but never unsubscribed. When the component unmounts, the listener remains in the bus's handler set, still firing on future events. If the handler references component state (refs, DOM elements), it errors or leaks memory.

**Fix** — use `onScopeDispose` for automatic cleanup:

::code-wrapper{language="typescript" filename="EventBusFixed.ts"}
```typescript
import { onScopeDispose } from 'vue'
import { bus } from './eventBus'

export function useUserEvents() {
  const unsubscribe = bus.on('user:login', (user) => {
    console.log('User logged in:', user.name)
  })

  // ── onScopeDispose: runs when the hosting scope stops (component unmount) ──
  onScopeDispose(() => unsubscribe())  // removes the listener automatically
}
```
::

**The lesson**: every event bus subscription, observer, or external listener registered in a component or composable must be unsubscribed on cleanup. `onScopeDispose` automates this — the returned unsubscribe function is called when the component unmounts.

</details>