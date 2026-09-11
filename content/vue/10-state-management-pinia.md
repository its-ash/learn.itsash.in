---
title: Vue 3 Engineering Reference — State Management with Pinia
description: Setup store vs options store, composition-based store patterns, cross-store dependencies, store persistence, SSR state hydration, and $reset/$patch batch mutations for production apps.
---

# 10 — State Management with Pinia

## Setup Store — Composition API Style

::code-wrapper{language="typescript" filename="stores/user.ts"}
```typescript
import { defineStore, ref, computed } from '#imports'  // Nuxt auto-import; else from 'pinia'

// ── defineStore with setup function (Composition API style) ──
// More flexible than Options API stores: can use any composable, watcher, etc.
export const useUserStore = defineStore('user', () => {
  // ── State: refs ────────────────────────────────────────
  const user = ref<{ id: number; name: string; email: string } | null>(null)
  const token = ref<string | null>(null)
  const loading = ref(false)

  // ── Getters: computed ───────────────────────────────────
  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const displayName = computed(() => user.value?.name ?? 'Guest')

  // ── Actions: plain functions (can be async) ─────────────
  async function login(credentials: { email: string; password: string }) {
    loading.value = true
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      })
      const data = await res.json()
      user.value = data.user
      token.value = data.token
      localStorage.setItem('token', data.token)  // persistence
    } finally {
      loading.value = false
    }
  }

  function logout() {
    user.value = null
    token.value = null
    localStorage.removeItem('token')
  }

  // ── Everything returned is part of the store's public API ──
  // State (refs), getters (computed), and actions (functions) all exposed.
  return { user, token, loading, isAuthenticated, displayName, login, logout }
})
```
::

## Options Store — The Alternative

::code-wrapper{language="typescript" filename="stores/cart.ts"}
```typescript
import { defineStore } from 'pinia'

// ── Options API style store: state/getters/actions separated ──
// More structured, less flexible. Similar to Vue's Options API.
export const useCartStore = defineStore('cart', {
  // ── State: a function returning the initial state (like data()) ──
  // MUST be a function (not a plain object) — fresh copy per store instance.
  state: () => ({
    items: [] as Array<{ id: number; name: string; price: number; qty: number }>,
    couponCode: null as string | null,
  }),

  // ── Getters: like computed, access state via `this` ──
  getters: {
    count: (state) => state.items.reduce((sum, i) => sum + i.qty, 0),

    // ── Getter with parameter: return a function from a getter ──
    itemPrice: (state) => (id: number) =>
      state.items.find(i => i.id === id)?.price ?? 0,

    // ── Getter using another getter: access via `this` ──
    total: (state) => {
      return state.items.reduce((sum, i) => sum + i.price * i.qty, 0)
    },
    // For getters referencing other getters, use `this`:
    // totalWithTax() { return this.total * 1.08 }
  },

  // ── Actions: methods, mutate state via `this` ──
  actions: {
    addItem(item: { id: number; name: string; price: number }) {
      const existing = this.items.find(i => i.id === item.id)
      if (existing) {
        existing.qty++  // direct mutation — Pinia allows it
      } else {
        this.items.push({ ...item, qty: 1 })
      }
    },

    removeItem(id: number) {
      this.items = this.items.filter(i => i.id !== id)
    },

    // ── Actions can be async ──
    async checkout() {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({ items: this.items, coupon: this.couponCode }),
      })
      if (res.ok) this.$reset()  // reset to initial state
    },
  },
})
```
::

## $patch — Batch Mutations for Performance

::code-wrapper{language="typescript" filename="patch-mutations.ts"}
```typescript
import { useUserStore } from './stores/user'

const store = useUserStore()

// ── $patch with object: batch multiple state changes into one mutation ──
// Triggers ONE re-render for all changes, not one per property.
store.$patch({
  user: { id: 1, name: 'Ada', email: 'ada@example.com' },
  token: 'xyz',
  loading: false,
})

// ── $patch with function: for complex mutations (arrays, nested objects) ──
// The function receives `state` and can mutate it freely.
// Pinia batches all mutations inside the function into one update.
store.$patch((state) => {
  state.user.name = 'Grace'
  state.user.email = 'grace@example.com'
  // Multiple mutations, single re-render batch.
})

// ── Direct mutation: also valid, triggers per-property ──
store.user.name = 'Ada'       // one update
store.token = 'abc'            // another update → two re-renders
// Use $patch to batch when updating multiple properties simultaneously.
```
::

## Cross-Store Dependencies — Composing Stores

::code-wrapper{language="typescript" filename="stores/checkout.ts"}
```typescript
import { defineStore } from 'pinia'
import { useCartStore } from './cart'
import { useUserStore } from './user'

// ── One store can use another — call useXxxStore() inside actions ──
// Don't call at store definition time (circular dependency risk).
// Call inside actions or setup function body.
export const useCheckoutStore = defineStore('checkout', () => {
  const cart = useCartStore()
  const user = useUserStore()

  async function processPayment(paymentMethod: string) {
    if (!user.isAuthenticated) throw new Error('Must be logged in')

    const res = await fetch('/api/checkout', {
      method: 'POST',
      body: JSON.stringify({
        items: cart.items,
        userId: user.user?.id,
        paymentMethod,
      }),
    })

    if (res.ok) {
      cart.$reset()  // clear cart after successful checkout
    }

    return res.json()
  }

  return { processPayment }
})
```
::

## Store Persistence — Plugin Pattern

::code-wrapper{language="typescript" filename="plugins/persist.ts"}
```typescript
import type { PiniaPluginContext } from 'pinia'

// ── Pinia plugin: runs for every store, persists state to localStorage ──
export function persistPlugin({ store, options }: PiniaPluginContext) {
  // ── Opt-in: only persist stores with `persist: true` in options ──
  if (!options.persist) return

  const key = `pinia:${store.$id}`

  // ── Hydrate from storage on store creation ──
  const saved = localStorage.getItem(key)
  if (saved) {
    store.$patch(JSON.parse(saved))  // restore saved state
  }

  // ── Subscribe to state changes — save on every mutation ──
  store.$subscribe((mutation, state) => {
    // Debounce localStorage writes in production (mutations can be frequent)
    localStorage.setItem(key, JSON.stringify(state))
  }, { detached: true })  // detached: keep subscription even after store disposed

  // ── Alternative: use $onAction to persist only after specific actions ──
  // store.$onAction(({ name, after }) => {
  //   if (name === 'addToCart') after(() => localStorage.setItem(key, JSON.stringify(store.$state)))
  // })
}
```

::code-wrapper{language="typescript" filename="main.ts"}
```typescript
import { createPinia } from 'pinia'
import { persistPlugin } from './plugins/persist'

const pinia = createPinia()
pinia.use(persistPlugin)  // register plugin — applies to all stores

app.use(pinia)
```
::

## SSR Hydration — Request-Scoped State

::code-wrapper{language="typescript" filename="ssr-hydration.ts"}
```typescript
import { createPinia } from 'pinia'

// ── SSR: create a FRESH Pinia instance per request ──────
// Module-scoped Pinia leaks state across requests (security bug).
// Each request gets its own Pinia → stores are request-scoped.
export function createApp() {
  const pinia = createPinia()  // fresh per request

  // ── On server: serialize state into HTML for client hydration ──
  // After all onServerPrefetch hooks resolve:
  const state = pinia.state.value  // all store states
  // Inject into HTML: <script>window.__PINIA__ = ${JSON.stringify(state)}</script>

  // ── On client: hydrate from serialized state ──
  if (typeof window !== 'undefined' && window.__PINIA__) {
    pinia.state.value = window.__PINIA__  // replace initial state with server state
  }

  return { pinia }
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
import { storeToRefs } from 'pinia'
import { useUserStore } from './stores/user'

// ── 1. storeToRefs — destructure store without losing reactivity ──
// Direct destructuring breaks reactivity (same as reactive() destructuring).
const store = useUserStore()
const { user, isAuthenticated } = storeToRefs(store)  // ✅ refs, reactive
const { login, logout } = store                      // ✅ actions are stable, no ref needed

// ── 2. $reset — restore to initial state (Options API stores only) ──
// Setup stores don't have $reset by default — implement manually:
function reset() {
  user.value = null
  token.value = null
  loading.value = false
}

// ── 3. $subscribe — watch all state changes ──
store.$subscribe((mutation, state) => {
  // mutation.type: 'direct' | 'patch object' | 'patch function'
  console.log(mutation.type, state)
})

// ── 4. $onAction — hook into actions (before/after/error) ──
store.$onAction(({ name, args, after, onError }) => {
  console.log(`action ${name} started`, args)
  after((result) => console.log(`${name} succeeded`, result))
  onError((err) => console.error(`${name} failed`, err))
})
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. Destructuring a store breaks reactivity ──
// const { user } = useUserStore()  → user is a snapshot, not reactive
// Fix: const { user } = storeToRefs(store)

// ── 2. $reset only works on Options API stores ──
// Setup (function) stores don't have $reset — Pinia can't know initial state.
// Implement your own reset() action in setup stores.

// ── 3. State must be serializable for persistence ──
// localStorage stores strings — Date, Map, Set, class instances don't survive.
// Use a custom replacer/reviver in JSON.stringify/parse, or avoid non-serializable state.

// ── 4. Cross-store calls inside setup() body risk circular deps ──
// Store A's setup calls useB(), Store B's setup calls useA() → infinite loop.
// Call useXxxStore() inside ACTIONS, not at store definition time.

// ── 5. SSR: module-scoped Pinia leaks state across requests ──
// createPinia() must be called per-request, not at module scope.
// Nuxt handles this automatically; custom SSR setups must do it manually.

// ── 6. Getters with parameters are NOT cached ──
// itemPrice(id) returns a function → recomputes every call.
// Only parameter-less getters are cached (like computed).
```
::

## 🧠 Spot the Bug

A component destructures a Pinia store and the UI stops updating when the store changes.

::code-wrapper{language="typescript" filename="StoreDestructureBug.ts"}
```typescript
import { useUserStore } from './stores/user'

const store = useUserStore()
const { user, isAuthenticated } = store  // ← destructured: no longer reactive
const { login } = store                  // ← actions are fine to destructure

// user is a plain object snapshot, not a ref.
// When store.user changes, this `user` variable doesn't update.
```
::

<details>
<summary>Answer</summary>

Destructuring a store copies the current values out of the reactive state. Like destructuring a `reactive()` object, the local variables are snapshots — they don't track future store changes.

**Fix** — use `storeToRefs()` for state/getters, destructure actions directly:

::code-wrapper{language="typescript" filename="StoreDestructureFixed.ts"}
```typescript
import { storeToRefs } from 'pinia'
import { useUserStore } from './stores/user'

const store = useUserStore()
const { user, isAuthenticated } = storeToRefs(store)  // refs — reactive
const { login } = store  // actions are stable functions, safe to destructure
```
::

**The lesson**: `storeToRefs()` converts store state and getters to refs (like `toRefs()` for reactive objects). Actions are plain functions and don't need wrapping — destructure them directly.

</details>