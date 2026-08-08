# 10 — State Management with Pinia

## Why a Store, Not Just `provide`/`inject`

Chapter 06 covered `provide`/`inject` for cross-tree communication. It works, but scales poorly once several unrelated component trees need the same data, mutations need to be traceable, or you want DevTools time-travel debugging and SSR-safe state. Pinia — the official Vue 3 state library — solves all of that with a small, fully-typed API and no boilerplate mutations layer (unlike Vuex before it).

::code-wrapper{language="bash"}
```bash
npm install pinia
```
::

::code-wrapper{language="javascript" filename="main.js"}
```javascript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
```
::

## Defining a Store — Options Style

::code-wrapper{language="javascript" filename="stores/counter.js"}
```javascript
import { defineStore } from 'pinia'

export const useCounterStore = defineStore('counter', {
  state: () => ({
    count: 0,
    history: []
  }),
  getters: {
    doubled: (state) => state.count * 2,
    // getters can reference other getters via `this`, fully typed in TS
    doubledPlusOne() {
      return this.doubled + 1
    }
  },
  actions: {
    increment(amount = 1) {
      this.count += amount
      this.history.push({ type: 'increment', amount, at: Date.now() })
    },
    async fetchInitialCount() {
      const res = await fetch('/api/counter')
      const { value } = await res.json()
      this.count = value
    }
  }
})
```
::

`state` must always be a function returning a fresh object — exactly like a component's `data()` — so every app instance (and every SSR request) gets its own isolated state rather than sharing one mutable object across users.

## Defining a Store — Setup Style

The "setup store" syntax mirrors `<script setup>` directly: `ref`/`reactive` become state, `computed` become getters, plain functions become actions. This is the recommended style for new code because it composes naturally with the rest of the Composition API:

::code-wrapper{language="javascript" filename="stores/counter.js"}
```javascript
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  const history = ref([])

  const doubled = computed(() => count.value * 2)

  function increment(amount = 1) {
    count.value += amount
    history.value.push({ type: 'increment', amount, at: Date.now() })
  }

  async function fetchInitialCount() {
    const res = await fetch('/api/counter')
    const { value } = await res.json()
    count.value = value
  }

  return { count, history, doubled, increment, fetchInitialCount }
})
```
::

Anything not returned from a setup store is private to the store — a useful way to hide internal helper refs/functions that consumers shouldn't touch directly, something the Options syntax can't express (everything in Options `state` is always public).

## Using a Store in a Component

::code-wrapper{language="vue" filename="CounterWidget.vue"}
```vue
<script setup>
import { storeToRefs } from 'pinia'
import { useCounterStore } from '@/stores/counter'

const counterStore = useCounterStore()

// WRONG (commented out): destructuring the store directly loses reactivity,
// identically to destructuring any other reactive object
// const { count, doubled } = counterStore

// RIGHT — storeToRefs preserves reactivity for state and getters
const { count, doubled } = storeToRefs(counterStore)

// actions are plain functions, not reactive state — safe to destructure directly
const { increment } = counterStore
</script>

<template>
  <p>Count: {{ count }} (doubled: {{ doubled }})</p>
  <button @click="increment()">+1</button>
  <button @click="increment(5)">+5</button>
</template>
```
::

`storeToRefs` only wraps state and getters in refs — it deliberately skips actions, so plain destructuring of methods is always safe and doesn't need this helper.

## Composing Stores

Stores can call other stores' `use*Store()` functions inside their own actions/getters — this is the standard way to share logic across domains (e.g., a `cart` store that needs to know if a user is authenticated):

::code-wrapper{language="javascript" filename="stores/cart.js"}
```javascript
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'

export const useCartStore = defineStore('cart', () => {
  const items = ref([])

  const total = computed(() =>
    items.value.reduce((sum, item) => sum + item.price * item.qty, 0)
  )

  async function checkout() {
    const authStore = useAuthStore()
    if (!authStore.isLoggedIn) {
      throw new Error('Must be logged in to checkout')
    }
    await fetch('/api/checkout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authStore.token}` },
      body: JSON.stringify({ items: items.value })
    })
    items.value = []
  }

  return { items, total, checkout }
})
```
::

Calling `useAuthStore()` inside `useCartStore`'s action (rather than at the top level of the file) avoids relying on store initialization order — it's resolved lazily, exactly when the action actually runs.

## Persisting State

Pinia has no built-in persistence — the common approach is either a small hand-written `watch`, or the `pinia-plugin-persistedstate` plugin:

::code-wrapper{language="bash"}
```bash
npm install pinia-plugin-persistedstate
```
::

::code-wrapper{language="javascript" filename="main.js"}
```javascript
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
```
::

::code-wrapper{language="javascript" filename="stores/auth.js"}
```javascript
import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', {
  state: () => ({ token: null, user: null }),
  actions: {
    login(token, user) {
      this.token = token
      this.user = user
    },
    logout() {
      this.token = null
      this.user = null
    }
  },
  persist: true   // survives a full page reload via localStorage by default
})
```
::

For hand-rolled persistence without a plugin dependency, a `$subscribe` callback works for any store:

::code-wrapper{language="javascript" filename="stores/settings.js"}
```javascript
import { defineStore } from 'pinia'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    theme: JSON.parse(localStorage.getItem('settings') ?? '{}').theme ?? 'light'
  })
})
```
::

::code-wrapper{language="javascript" filename="main.js"}
```javascript
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore(pinia)

settingsStore.$subscribe((mutation, state) => {
  localStorage.setItem('settings', JSON.stringify(state))
})
```
::

## Resetting State

::code-wrapper{language="javascript"}
```javascript
const counterStore = useCounterStore()

counterStore.$reset()   // Options stores only — resets to the state() factory's output

// Setup stores have no built-in $reset — write your own, since Pinia
// can't introspect which refs make up "state" in a setup store
```
::

## Subscribing to Actions and Patching State in Bulk

::code-wrapper{language="javascript"}
```javascript
const counterStore = useCounterStore()

counterStore.$onAction(({ name, args, after, onError }) => {
  console.log(`action "${name}" called with`, args)

  after((result) => {
    console.log(`action "${name}" finished, returned`, result)
  })

  onError((error) => {
    console.error(`action "${name}" failed`, error)
  })
})

// $patch batches multiple state mutations into a single reactive update
// and a single DevTools entry, instead of one entry per assignment
counterStore.$patch({ count: 10 })
counterStore.$patch((state) => {
  state.count++
  state.history.push({ type: 'patch', at: Date.now() })
})
```
::

## Options API Equivalent

Pinia stores are framework-agnostic to Composition vs Options — the difference above is only in how the *store itself* is authored. Consuming a store from an Options API component uses `mapStores`/`mapState`/`mapActions` helpers:

::code-wrapper{language="vue"}
```vue
<script>
import { mapState, mapActions } from 'pinia'
import { useCounterStore } from '@/stores/counter'

export default {
  computed: {
    ...mapState(useCounterStore, ['count', 'doubled'])
  },
  methods: {
    ...mapActions(useCounterStore, ['increment'])
  }
}
</script>
```
::

## 💡 Tips & Tricks

- **Idiom** — Prefer setup-style stores for new code — they let you use any Composition API feature (custom composables, watchers with options, other stores) directly in the store body, whereas Options stores are limited to the `state`/`getters`/`actions` shape.
- **Debug** — Pinia integrates with Vue DevTools out of the box once `app.use(createPinia())` runs — the DevTools "Pinia" tab shows every store's live state, a full mutation timeline, and lets you time-travel or manually edit state for debugging, with zero extra setup.
- **Idiom** — Keep one store per domain (`auth`, `cart`, `settings`) rather than one giant store — Pinia stores are cheap to create and this mirrors how you'd naturally split modules, and keeps `$onAction`/DevTools output readable.
- **Performance** — `$patch` with an object or function batches multiple mutations into a single reactive flush and a single DevTools entry — meaningfully cheaper than several separate assignments when updating many fields from, say, a bulk API response.
- **Idiom** — Call `use*Store()` at the top of `<script setup>` (or lazily inside an action, as in the cart/auth example), never conditionally — same synchronous-call constraint as composables from chapter 07, since Pinia stores are themselves built on composables internally.

## ⚠️ Edge Cases & Gotchas

- **Destructuring a store object directly loses reactivity, same as any other reactive source** — `const { count } = useCounterStore()` gives you a frozen snapshot of `count` at that instant; always go through `storeToRefs(store)` for state/getters, and destructure actions separately since they're plain functions unaffected by this problem.
- **`state()` must return a fresh object, never a module-level shared object** — Defining `state: () => sharedObject` where `sharedObject` lives outside the factory function reintroduces exactly the singleton-sharing bug Pinia's factory pattern exists to prevent — especially dangerous under SSR, where a shared object would leak one request's state into another's response.
- **`$reset()` doesn't exist on setup stores** — It's implemented by re-invoking the `state()` factory, which only exists conceptually for Options stores; calling `$reset()` on a setup store throws, and you must write manual reset logic (reassigning each ref back to its initial value) yourself.
- **Calling `use*Store()` outside of a component's setup, a plugin, or another store's setup, without passing the `pinia` instance explicitly, throws** — Pinia relies on an active Pinia instance being available via the same "currently active" tracking mechanism components use for `inject`; code that runs before the app is mounted (or entirely outside Vue, like a plain `.js` module loaded eagerly) needs `useCounterStore(pinia)` with an explicit instance.
- **Getters that depend on another store are not automatically reactive to that store's changes in the way you might expect from `computed` alone** — A getter calling `useOtherStore()` internally does correctly track that store's reactive state (getters are implemented as `computed` under the hood), but only if the dependency is read during the getter's synchronous execution — conditionally skipping the read (e.g., an early return before touching the other store) can under-track dependencies, the same rule that governs any `computed`.

## 🧠 Spot the Bug

A settings panel reads and displays store state, but editing a "draft" copy of it in the panel doesn't affect the panel's own inputs correctly — typing in one field resets the others.

::code-wrapper{language="vue" filename="SettingsPanel.vue"}
```vue
<script setup>
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()
const { theme, fontSize, notifications } = settingsStore
</script>

<template>
  <select v-model="theme">
    <option value="light">Light</option>
    <option value="dark">Dark</option>
  </select>
  <input v-model.number="fontSize" type="number" />
  <input v-model="notifications" type="checkbox" />
</template>
```
::

<details>
<summary>Answer</summary>

`const { theme, fontSize, notifications } = settingsStore` destructures the store directly, which strips reactivity from each field exactly like destructuring any other reactive object (chapter 03). `v-model` on the resulting plain, disconnected local variables doesn't write back into the store at all — each input mutates an unreactive local copy that the template isn't actually re-rendering from, which is why interacting with one field appears to "reset" or ignore the others: the template is still reading the original store snapshot taken at component creation, not the mutated locals.

::code-wrapper{language="vue" filename="SettingsPanel.vue"}
```vue
<script setup>
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()
const { theme, fontSize, notifications } = storeToRefs(settingsStore)
</script>

<template>
  <select v-model="theme">
    <option value="light">Light</option>
    <option value="dark">Dark</option>
  </select>
  <input v-model.number="fontSize" type="number" />
  <input v-model="notifications" type="checkbox" />
</template>
```
::

**The lesson**: always destructure Pinia store state/getters through `storeToRefs()`, never directly off the store instance — direct destructuring of a Pinia store is the exact same reactivity-loss trap as destructuring a plain `reactive()` object.

</details>

## Key Takeaways

- Pinia stores come in two flavors — Options style (`state`/`getters`/`actions`) and setup style (`ref`/`computed`/functions) — setup style is the modern recommendation for its full Composition API access and ability to hide private internals.
- Always destructure state and getters from a store through `storeToRefs()`; actions are plain functions and safe to destructure directly.
- Stores can call other stores' `use*Store()` inside actions/getters to compose cross-domain logic, typically resolved lazily rather than at module top level.
- Pinia has no built-in persistence — use `pinia-plugin-persistedstate` or a hand-written `$subscribe` callback writing to `localStorage`.
- `$patch` batches multiple state mutations into a single reactive update and DevTools entry; `$onAction` lets you observe every action call, its result, and any error.
- `$reset()` only exists on Options stores, since it relies on re-invoking the `state()` factory — setup stores need manual reset logic.
