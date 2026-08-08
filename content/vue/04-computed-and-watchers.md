# 04 — Computed & Watchers

## `computed()` — Derived State

A `computed` property derives a value from other reactive state, and — critically — **caches** that value, only recomputing when one of its reactive dependencies actually changes:

::code-wrapper{language="vue" filename="Cart.vue"}
```vue
<script setup>
import { ref, computed } from 'vue'

const items = ref([
  { name: 'Keyboard', price: 79, qty: 1 },
  { name: 'Mouse', price: 29, qty: 2 }
])

const subtotal = computed(() =>
  items.value.reduce((sum, item) => sum + item.price * item.qty, 0)
)

const tax = computed(() => subtotal.value * 0.08)
const total = computed(() => subtotal.value + tax.value)
</script>

<template>
  <p>Subtotal: ${{ subtotal.toFixed(2) }}</p>
  <p>Tax: ${{ tax.toFixed(2) }}</p>
  <p>Total: ${{ total.toFixed(2) }}</p>
</template>
```
::

Options API equivalent, for comparison:

::code-wrapper{language="vue" filename="Cart.vue"}
```vue
<script>
export default {
  data() {
    return {
      items: [
        { name: 'Keyboard', price: 79, qty: 1 },
        { name: 'Mouse', price: 29, qty: 2 }
      ]
    }
  },
  computed: {
    subtotal() {
      return this.items.reduce((sum, item) => sum + item.price * item.qty, 0)
    },
    tax() {
      return this.subtotal * 0.08
    },
    total() {
      return this.subtotal + this.tax
    }
  }
}
</script>
```
::

## The Caching Mechanism — Why It Matters

A `computed` re-evaluates only when a tracked dependency changes, and returns the cached value on every other access — even if you read it a hundred times in the same render:

::code-wrapper{language="javascript"}
```javascript
import { ref, computed } from 'vue'

const list = ref([5, 3, 8, 1, 9, 2])
let sortCallCount = 0

const sorted = computed(() => {
  sortCallCount++
  return [...list.value].sort((a, b) => a - b)
})

console.log(sorted.value) // sorts, sortCallCount = 1
console.log(sorted.value) // cached, sortCallCount STILL 1
console.log(sorted.value) // cached, sortCallCount STILL 1

list.value.push(0)
console.log(sorted.value) // dependency changed → re-sorts, sortCallCount = 2
```
::

Compare this to calling a plain function: `sortList(list.value)` would re-run the sort on every single call, regardless of whether the underlying data changed. This is the entire reason to reach for `computed` instead of a method for any derived value that's read more than once or is expensive to calculate — a `methods`-based (or plain function) equivalent re-runs on *every* re-render that touches it, no matter how many times or how expensive.

### The caching trap — computed with a non-reactive dependency

::code-wrapper{language="javascript"}
```javascript
import { ref, computed } from 'vue'

const seed = ref(1)

// WRONG — Date.now() is read once, then cached forever, because
// Date.now() is not a reactive dependency Vue can track
const timestamp = computed(() => {
  seed.value // touched only to "look like" a dependency
  return Date.now()
})

console.log(timestamp.value) // e.g. 1700000000000
// ... two seconds pass ...
console.log(timestamp.value) // SAME value — seed.value hasn't changed,
                              // so the computed doesn't re-run, and Date.now()
                              // is never called again
```
::

A `computed` only re-runs when a **reactive value it read during its last execution** changes — it has no concept of "time passing" or "external side effects." If you need a value that changes on a timer, you need a `ref` updated by `setInterval`, not a `computed`.

## Writable Computed

`computed` accepts a `{ get, set }` object for two-way derived state:

::code-wrapper{language="vue" filename="NameEditor.vue"}
```vue
<script setup>
import { ref, computed } from 'vue'

const firstName = ref('Ada')
const lastName = ref('Lovelace')

const fullName = computed({
  get() {
    return `${firstName.value} ${lastName.value}`
  },
  set(newValue) {
    const [first, last] = newValue.split(' ')
    firstName.value = first
    lastName.value = last ?? ''
  }
})
</script>

<template>
  <!-- v-model works because fullName has both a getter and a setter -->
  <input v-model="fullName" />
  <p>{{ firstName }} / {{ lastName }}</p>
</template>
```
::

## `watch()` — Explicit, Targeted Reactions

`watch` observes one or more specific reactive sources and runs a callback when they change, giving you both the new and old value:

::code-wrapper{language="vue" filename="SearchPanel.vue"}
```vue
<script setup>
import { ref, watch } from 'vue'

const query = ref('')
const results = ref([])
const isLoading = ref(false)

watch(query, async (newQuery, oldQuery) => {
  console.log(`Query changed from "${oldQuery}" to "${newQuery}"`)
  if (!newQuery.trim()) {
    results.value = []
    return
  }
  isLoading.value = true
  const res = await fetch(`/api/search?q=${encodeURIComponent(newQuery)}`)
  results.value = await res.json()
  isLoading.value = false
})
</script>

<template>
  <input v-model="query" placeholder="Search…" />
  <p v-if="isLoading">Loading…</p>
  <ul v-else>
    <li v-for="r in results" :key="r.id">{{ r.title }}</li>
  </ul>
</template>
```
::

### Watching multiple sources, reactive objects, and getters

::code-wrapper{language="javascript"}
```javascript
import { ref, reactive, watch } from 'vue'

const x = ref(0)
const y = ref(0)
const filters = reactive({ category: 'all', minPrice: 0 })

// array of sources — callback receives arrays of new/old values
watch([x, y], ([newX, newY], [oldX, oldY]) => {
  console.log(`Point moved from (${oldX},${oldY}) to (${newX},${newY})`)
})

// watching a reactive object directly gives you the SAME object as
// both newValue and oldValue, because reactive() mutates in place —
// see the gotcha below
watch(filters, (newFilters, oldFilters) => {
  console.log(newFilters === oldFilters) // true! both point at the same proxy
})

// watch a getter to track ONE property of a reactive object precisely
watch(
  () => filters.category,
  (newCategory, oldCategory) => {
    console.log(`Category: ${oldCategory} → ${newCategory}`)
  }
)
```
::

## `watch` Options — `deep`, `immediate`, `flush`

::code-wrapper{language="javascript"}
```javascript
import { ref, reactive, watch } from 'vue'

const settings = ref({ theme: 'dark', notifications: { email: true } })

// deep: watch() on a ref holding an object does NOT see nested mutations
// by default — only reassignment of settings.value itself triggers it
watch(settings, () => console.log('settings changed'), { deep: true })
settings.value.notifications.email = false // now fires, because of { deep: true }

// immediate: run the callback once immediately, with undefined as oldValue,
// instead of waiting for the first change — useful for "sync on mount" logic
const userId = ref(42)
watch(
  userId,
  (id) => console.log(`Loading profile for user ${id}`),
  { immediate: true } // logs "Loading profile for user 42" right away
)

// flush: 'pre' (default) runs before DOM updates; 'post' runs after Vue
// has updated the DOM — necessary if the callback needs to read updated DOM
watch(
  () => settings.value.theme,
  () => {
    // safe to read document.documentElement's className here,
    // because Vue's DOM update has already happened
  },
  { flush: 'post' }
)
```
::

## `watchEffect()` — Automatic Dependency Tracking

`watchEffect` runs a function immediately and re-runs it whenever *any* reactive value it read during its last run changes — no explicit source list required:

::code-wrapper{language="javascript"}
```javascript
import { ref, watchEffect } from 'vue'

const category = ref('electronics')
const sortBy = ref('price')

// automatically tracks BOTH category and sortBy, because both
// are read inside the function body — no need to list them
watchEffect(() => {
  console.log(`Fetching ${category.value} sorted by ${sortBy.value}`)
})
// runs immediately: "Fetching electronics sorted by price"

category.value = 'books'
// runs again: "Fetching books sorted by price"
```
::

## `watch` vs `watchEffect` — Timing and Intent

| | `watch` | `watchEffect` |
|---|---|---|
| Dependency tracking | Explicit — you name the source(s) | Automatic — tracks whatever's read during execution |
| Runs on creation? | No (unless `immediate: true`) | Yes, always, immediately |
| Access to old value | Yes, as the second callback argument | No — there's only "the current run" |
| Best for | Reacting to ONE specific change, needing before/after comparison | Syncing a side effect to "whatever reactive state it uses," e.g. a subscription |
| Lazy dependencies | Dependencies are fixed by what you pass in | Dependencies can change between runs if a conditional read changes what's tracked |

A frequent mistake is reaching for `watchEffect` when you specifically care about *which* value changed and what it changed *from* — that information simply isn't available in `watchEffect`, because it doesn't track "sources," only "the last set of things read."

### The conditional-dependency subtlety in `watchEffect`

::code-wrapper{language="javascript"}
```javascript
import { ref, watchEffect } from 'vue'

const showDetails = ref(false)
const basicInfo = ref('Product A')
const detailedInfo = ref('Extended description...')

watchEffect(() => {
  if (showDetails.value) {
    console.log(detailedInfo.value) // tracked ONLY when showDetails is true
  } else {
    console.log(basicInfo.value)    // tracked ONLY when showDetails is false
  }
})

// While showDetails is false, changing detailedInfo does NOT re-run the
// effect — it was never read on the last execution, so it isn't a
// tracked dependency right now. Vue's dependency tracking is re-evaluated
// fresh on every run, so this is intentional, not a bug — but it surprises
// people who expect "all variables mentioned in the function" to be tracked.
detailedInfo.value = 'New description'  // no re-run while showDetails is false
```
::

## Stopping Watchers

Both `watch` and `watchEffect` return a stop handle. Watchers created inside `setup()`/`<script setup>` are automatically stopped when the component unmounts, but manual stopping matters for watchers created outside a component's lifecycle (e.g., inside a long-lived singleton):

::code-wrapper{language="javascript"}
```javascript
import { watchEffect } from 'vue'

const stop = watchEffect(() => {
  console.log('tracking...')
})

stop() // detaches the effect — it will never run again
```
::

## `onWatcherCleanup` and Cleanup Functions

Both APIs support a cleanup function, essential for cancelling in-flight async work before the next run starts — otherwise you can end up with results from an old request overwriting results from a newer one (a race condition covered in depth in chapter 12):

::code-wrapper{language="vue" filename="UserProfile.vue"}
```vue
<script setup>
import { ref, watch } from 'vue'

const userId = ref(1)
const profile = ref(null)

watch(userId, async (id, oldId, onCleanup) => {
  const controller = new AbortController()

  onCleanup(() => controller.abort())   // called before the NEXT run, or on unmount

  try {
    const res = await fetch(`/api/users/${id}`, { signal: controller.signal })
    profile.value = await res.json()
  } catch (err) {
    if (err.name !== 'AbortError') throw err
  }
}, { immediate: true })
</script>
```
::

If `userId` changes again while a fetch for the old id is still in flight, `onCleanup`'s callback aborts that stale request — without this, a slow response for `userId: 1` could resolve *after* a fast response for `userId: 2` and overwrite the correct profile with the wrong one.

## Options API Equivalent: the `watch` Option

::code-wrapper{language="vue"}
```vue
<script>
export default {
  data() {
    return { query: '', results: [] }
  },
  watch: {
    query(newQuery, oldQuery) {
      this.fetchResults(newQuery)
    },
    // object syntax for options like deep/immediate
    'filters.category': {
      handler(newVal) { console.log(newVal) },
      deep: true,
      immediate: true
    }
  },
  methods: {
    async fetchResults(q) {
      const res = await fetch(`/api/search?q=${q}`)
      this.results = await res.json()
    }
  }
}
</script>
```
::

## 💡 Tips & Tricks

- **Idiom** — Prefer `computed` over a `watch`-that-sets-another-ref whenever the result is purely derived from existing state — it's simpler, automatically cached, and can't drift out of sync the way a manually-maintained watched value can.
- **Debug** — Vue DevTools' Components panel lists a component's active `computed` values with their current cached result — a fast way to confirm whether a stale value is a caching issue or an upstream data issue.
- **Idiom** — Use a getter function (`() => obj.prop`) as a `watch` source instead of watching the whole `reactive` object with `{ deep: true }` — it's cheaper (no deep traversal) and gives you precise old/new values for that one property instead of the whole object.
- **Performance** — `flush: 'sync'` runs a watcher synchronously on every reactive mutation, before Vue even batches the DOM update — almost never what you want (it defeats Vue's batching), but occasionally necessary for tightly-coupled third-party library integration.
- **Idiom** — `watchEffect` is a great fit for "sync this reactive state to a non-reactive external system" (an API client's headers, a `document.title` update, a chart library's config) — cases where you don't care about old values, only "keep this external thing in sync with whatever's currently true."

## ⚠️ Edge Cases & Gotchas

- **`watch` on a ref-holding-an-object needs `{ deep: true }` for nested changes** — `watch(objRef, cb)` only fires when `objRef.value` itself is reassigned to a different object; mutating a nested property (`objRef.value.nested.prop = x`) is silent unless you add `{ deep: true }`, because without it Vue only compares the top-level `.value` reference.
- **Watching a `reactive()` object directly gives identical old/new values** — Because `reactive()` mutates the same object in place, `watch(reactiveObj, (newVal, oldVal) => ...)` receives the *same* object reference for both parameters — `newVal === oldVal` is `true`. If you need a real "before" snapshot, watch a getter for the specific property, or deep-clone before mutating.
- **`computed` getters must be pure — side effects inside them are a trap** — Mutating other reactive state, making API calls, or writing to `localStorage` inside a `computed` getter causes those side effects to run at unpredictable times (whenever Vue decides to re-evaluate the cache), not once per "logical" event — side effects belong in `watch`/`watchEffect`, not `computed`.
- **`watchEffect`'s tracked dependencies can shrink or grow between runs** — Because tracking is based on what's actually read during execution, an `if` branch not taken this run means variables only referenced in that branch aren't tracked this time — a real behavior difference from `watch`'s fixed, explicit source list, and one that can make `watchEffect` bugs harder to reason about in branchy code.
- **Forgetting to cancel a stale async watcher creates race conditions** — Without an abort/cleanup mechanism, a `watch` callback that fires an async request on every keystroke can have an old, slow response arrive after a newer, faster one and overwrite it with stale data — always use the cleanup callback (`onCleanup`) or an incrementing request-id check when a watcher triggers async work.

## 🧠 Spot the Bug

A settings panel is supposed to log a message every time any setting changes, including nested ones. Nothing happens when the user toggles the "email notifications" checkbox.

::code-wrapper{language="vue"}
```vue
<script setup>
import { ref, watch } from 'vue'

const settings = ref({
  theme: 'dark',
  notifications: { email: true, sms: false }
})

watch(settings, () => {
  console.log('Settings changed, saving to server…')
})

function toggleEmail() {
  settings.value.notifications.email = !settings.value.notifications.email
}
</script>

<template>
  <button @click="toggleEmail">Toggle email notifications</button>
</template>
```
::

<details>
<summary>Answer</summary>

`watch(settings, ...)` on a ref only triggers when `settings.value` is reassigned wholesale to a new object — by default it does not traverse into nested properties. `toggleEmail` mutates `settings.value.notifications.email` in place, several levels deep, which never touches `settings.value` itself, so the watcher's shallow check sees no change.

The fix adds `{ deep: true }` so Vue recursively tracks every nested property:

::code-wrapper{language="javascript"}
```javascript
watch(settings, () => {
  console.log('Settings changed, saving to server…')
}, { deep: true })
```
::

**The lesson**: `watch` on an object is shallow by default — it only reacts to the object reference itself changing, not to mutations inside it — deep observation is opt-in via `{ deep: true }` precisely because deep watching has a real traversal cost you shouldn't pay unnecessarily.

</details>

## Key Takeaways

- `computed` caches its result and only re-evaluates when a tracked reactive dependency changes — prefer it over methods for any derived value read more than once.
- A `computed` getter must be pure (no side effects, no non-reactive external state like `Date.now()`) or its caching will produce stale or unpredictable results.
- `watch` requires explicit sources and gives you old/new values; `watchEffect` auto-tracks whatever it reads and always runs immediately, with no access to previous values.
- `deep`, `immediate`, and `flush` control, respectively: nested-mutation tracking, whether the callback runs once up front, and DOM-update timing relative to the callback.
- Watching a `reactive()` object directly yields identical old/new references since mutation happens in place — watch a getter for a specific property when you need a real before/after comparison.
- Always cancel in-flight async work inside a watcher callback (via the cleanup function or an abort controller) to avoid race conditions from out-of-order responses.
