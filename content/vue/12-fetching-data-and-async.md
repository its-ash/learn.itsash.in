# 12 — Fetching Data & Async

## The Baseline Pattern: Loading, Error, Data

Every real data-fetching component needs to represent (at least) three states, not just "the data" — a fetch that hasn't resolved yet, one that failed, and one that succeeded:

::code-wrapper{language="vue" filename="ProductList.vue"}
```vue
<script setup>
import { ref, onMounted } from 'vue'

const products = ref([])
const isLoading = ref(true)
const error = ref(null)

async function loadProducts() {
  isLoading.value = true
  error.value = null
  try {
    const res = await fetch('/api/products')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    products.value = await res.json()
  } catch (err) {
    error.value = err
  } finally {
    isLoading.value = false
  }
}

onMounted(loadProducts)
</script>

<template>
  <p v-if="isLoading">Loading products…</p>
  <p v-else-if="error" class="error">Failed to load products: {{ error.message }}</p>
  <ul v-else-if="products.length">
    <li v-for="p in products" :key="p.id">{{ p.name }} — ${{ p.price }}</li>
  </ul>
  <p v-else>No products found.</p>
</template>
```
::

The **empty-but-successful** state (`products.length === 0` after a successful fetch) is a fourth, easily forgotten case — distinct from both loading and error, and worth its own message rather than silently rendering nothing, which reads to a user as a bug rather than "there's genuinely nothing here."

## Using `axios` Instead of `fetch`

::code-wrapper{language="bash"}
```bash
npm install axios
```
::

::code-wrapper{language="javascript" filename="api/client.js"}
```javascript
import axios from 'axios'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
```
::

::code-wrapper{language="vue" filename="ProductList.vue"}
```vue
<script setup>
import { ref, onMounted } from 'vue'
import { apiClient } from '@/api/client'

const products = ref([])
const isLoading = ref(true)
const error = ref(null)

onMounted(async () => {
  try {
    // axios throws on non-2xx by default and parses JSON automatically —
    // unlike fetch, which requires manually checking res.ok
    const { data } = await apiClient.get('/products')
    products.value = data
  } catch (err) {
    error.value = err
  } finally {
    isLoading.value = false
  }
})
</script>
```
::

A shared, pre-configured client (base URL, auth header injection, centralized 401 handling) avoids repeating that setup in every component that makes a request — a real production pattern, not just convenience.

## Extracting a Reusable `useAsyncData` Composable

::code-wrapper{language="javascript" filename="composables/useAsyncData.js"}
```javascript
import { ref, watchEffect, toValue } from 'vue'

export function useAsyncData(fetcher, source = null) {
  const data = ref(null)
  const error = ref(null)
  const isLoading = ref(false)

  async function execute() {
    isLoading.value = true
    error.value = null
    const controller = new AbortController()

    try {
      data.value = await fetcher(controller.signal, toValue(source))
    } catch (err) {
      if (err.name !== 'AbortError') error.value = err
    } finally {
      isLoading.value = false
    }

    return () => controller.abort()
  }

  if (source !== null) {
    watchEffect((onCleanup) => {
      let cancel
      execute().then((c) => { cancel = c })
      onCleanup(() => cancel?.())
    })
  }

  return { data, error, isLoading, execute }
}
```
::

::code-wrapper{language="vue" filename="UserProfile.vue"}
```vue
<script setup>
import { ref } from 'vue'
import { useAsyncData } from '@/composables/useAsyncData'

const userId = ref(1)

const { data: user, error, isLoading } = useAsyncData(
  async (signal, id) => {
    const res = await fetch(`/api/users/${id}`, { signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
  userId
)
</script>
```
::

## Race Conditions — the Central Async Pitfall

A fast-typing search box is the classic case: request A (for "vu") is sent, then request B (for "vue") is sent shortly after, but the network resolves them out of order — A's response lands *after* B's, overwriting the correct result with a stale one.

::code-wrapper{language="vue" filename="SearchBox.vue"}
```vue
<script setup>
import { ref, watch } from 'vue'

const query = ref('')
const results = ref([])

// WRONG — no defense against out-of-order responses
watch(query, async (q) => {
  if (!q) { results.value = []; return }
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
  results.value = await res.json()   // may overwrite a NEWER result with a stale one
})
</script>
```
::

### Fix 1: `AbortController` (preferred — actually cancels the stale request)

::code-wrapper{language="vue" filename="SearchBox.vue"}
```vue
<script setup>
import { ref, watch } from 'vue'

const query = ref('')
const results = ref([])
let controller = null

watch(query, async (q) => {
  controller?.abort()          // cancel whatever request is still in flight
  if (!q) { results.value = []; return }

  controller = new AbortController()
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
    results.value = await res.json()
  } catch (err) {
    if (err.name !== 'AbortError') throw err
  }
})
</script>
```
::

### Fix 2: Stale-response guard (when the API can't be cancelled)

::code-wrapper{language="vue" filename="SearchBox.vue"}
```vue
<script setup>
import { ref, watch } from 'vue'

const query = ref('')
const results = ref([])

watch(query, async (q) => {
  if (!q) { results.value = []; return }
  const requestQuery = q   // snapshot the query THIS request was made for
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
  const data = await res.json()

  // only apply the result if the query hasn't changed since this request started
  if (requestQuery === query.value) {
    results.value = data
  }
})
</script>
```
::

`AbortController` is strictly better when the backend supports it — it also saves the wasted bandwidth/server work of a request nobody needs the answer to anymore — but the guard pattern is a reasonable fallback for APIs (or third-party SDKs) that give you no cancellation hook at all.

## Async `setup()` and `<script setup>` with `top-level await`

`<script setup>` supports top-level `await` directly — the compiler automatically turns the component into an async `setup()` internally, which requires the component to be rendered inside a `<Suspense>` boundary (chapter 16):

::code-wrapper{language="vue" filename="UserProfile.vue"}
```vue
<script setup>
// top-level await — this component's setup pauses here until the fetch resolves
const res = await fetch('/api/users/me')
const user = await res.json()
</script>

<template>
  <p>{{ user.name }}</p>
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

This is elegant for a single, unconditional, must-succeed-before-rendering fetch, but it has real limitations worth knowing before reaching for it over the `ref`-based pattern: there's no per-component way to show a partial UI while some (but not all) data loads, error handling has to happen either inside an `onErrorCaptured` boundary or a `try`/`catch` around the `await` itself (an uncaught rejection inside async setup surfaces as an unhandled error to the whole `Suspense` tree), and it composes awkwardly with a search-box-style scenario needing cancellation/re-fetching — the `ref` + `watch`/composable pattern remains the more flexible default for anything beyond "fetch once, then render."

## Parallel vs Sequential Fetching

::code-wrapper{language="javascript"}
```javascript
// WRONG (slow) — each await blocks the next request from even starting,
// even though these three requests don't depend on each other
async function loadDashboardSequential() {
  const user = await fetch('/api/user').then(r => r.json())
  const orders = await fetch('/api/orders').then(r => r.json())
  const notifications = await fetch('/api/notifications').then(r => r.json())
  return { user, orders, notifications }
}

// RIGHT — all three requests fire immediately, total time ≈ the SLOWEST one,
// not the SUM of all three
async function loadDashboardParallel() {
  const [user, orders, notifications] = await Promise.all([
    fetch('/api/user').then(r => r.json()),
    fetch('/api/orders').then(r => r.json()),
    fetch('/api/notifications').then(r => r.json())
  ])
  return { user, orders, notifications }
}
```
::

`Promise.all` rejects as soon as any one promise rejects, which can be too aggressive when partial data is still useful (e.g., showing orders even if notifications failed) — `Promise.allSettled` is the right tool when independent failures shouldn't take down the whole dashboard:

::code-wrapper{language="javascript"}
```javascript
async function loadDashboardResilient() {
  const [userResult, ordersResult, notificationsResult] = await Promise.allSettled([
    fetch('/api/user').then(r => r.json()),
    fetch('/api/orders').then(r => r.json()),
    fetch('/api/notifications').then(r => r.json())
  ])

  return {
    user: userResult.status === 'fulfilled' ? userResult.value : null,
    orders: ordersResult.status === 'fulfilled' ? ordersResult.value : [],
    notifications: notificationsResult.status === 'fulfilled' ? notificationsResult.value : []
  }
}
```
::

## Retrying Failed Requests

::code-wrapper{language="javascript" filename="composables/useRetryFetch.js"}
```javascript
export async function fetchWithRetry(url, options = {}, retries = 3, delayMs = 500) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res
    } catch (err) {
      if (attempt === retries) throw err
      // exponential backoff — avoids hammering a struggling server
      await new Promise((resolve) => setTimeout(resolve, delayMs * 2 ** attempt))
    }
  }
}
```
::

## Options API Equivalent

::code-wrapper{language="vue"}
```vue
<script>
export default {
  data() {
    return { products: [], isLoading: true, error: null }
  },
  async created() {
    try {
      const res = await fetch('/api/products')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      this.products = await res.json()
    } catch (err) {
      this.error = err
    } finally {
      this.isLoading = false
    }
  }
}
</script>
```
::

## 💡 Tips & Tricks

- **Idiom** — Model async state as three (really four, counting "successful but empty") explicit states rather than inferring status from `data.value === null` — an explicit `isLoading`/`error` pair is unambiguous, whereas `null` can mean "not fetched yet," "fetch failed," or "fetch succeeded with no data," depending on context.
- **Performance** — Default to `Promise.all` for independent requests a component needs simultaneously — sequential `await`s for unrelated data is one of the most common, easiest-to-fix performance mistakes in real Vue codebases.
- **Debug** — Always check `err.name !== 'AbortError'` before treating a caught fetch error as a real failure — an intentionally cancelled request throws too, and treating that as a user-facing error produces a confusing flash of an error message for something the user didn't do wrong.
- **Idiom** — Centralize `fetch`/`axios` configuration (base URL, auth headers, 401 handling) in one client module rather than repeating headers and error handling in every component — chapter 22 revisits this same client as the natural place to enforce security-relevant request/response handling too.
- **Idiom** — Reach for `<Suspense>` and top-level `await` only for simple, must-complete-before-render fetches; prefer the `ref`/composable pattern for anything needing cancellation, retry, partial rendering, or fine-grained error UI per section of the page.

## ⚠️ Edge Cases & Gotchas

- **`fetch` does not reject on HTTP error statuses** — A 404 or 500 response resolves successfully as far as `fetch`'s promise is concerned; only a network-level failure (DNS, CORS, connection refused) rejects. Always check `res.ok` (or `res.status`) explicitly and throw yourself — `axios`, by contrast, does reject on non-2xx by default, which is a genuine behavioral difference between the two, not just a style preference.
- **A race condition doesn't need a slow network to reproduce** — Two requests fired close together can resolve out of order due to ordinary variance in server response time, caching, or connection reuse — it's not an exotic edge case reserved for flaky networks, it will eventually happen on any sufficiently-used search-as-you-type or filter-on-keystroke feature without a defense.
- **`Promise.all` fails all-or-nothing — one rejected promise discards every other result, even ones that already resolved successfully** — Code that needs "best effort, show what succeeded" behavior must use `Promise.allSettled` and manually check `.status` on each result; reaching for `Promise.all` when partial failure should be tolerated silently blanks out data that was actually available.
- **Top-level `await` in `<script setup>` requires a `<Suspense>` ancestor, and forgetting one fails silently in some setups or throws a warning in others depending on Vue version** — A component using top-level `await` but rendered outside `<Suspense>` doesn't necessarily give an obvious runtime error pointing at the real cause — always pair the two intentionally, and never add top-level `await` to a component without checking how (and whether) its parent wraps it.
- **An `AbortError` thrown from an aborted `fetch` still runs your `finally` block** — Code assuming `finally` only runs on "real" completion (success or genuine failure) will still see `isLoading.value = false` execute when a request is deliberately cancelled — usually the desired behavior, but worth being intentional about if the calling code distinguishes "cancelled" from "finished" states elsewhere.

## 🧠 Spot the Bug

A component fetches a list of comments for the currently viewed post. Switching quickly between posts occasionally shows the wrong post's comments.

::code-wrapper{language="vue" filename="PostComments.vue"}
```vue
<script setup>
import { ref, watch } from 'vue'

const props = defineProps({ postId: Number })
const comments = ref([])

watch(() => props.postId, async (id) => {
  const res = await fetch(`/api/posts/${id}/comments`)
  comments.value = await res.json()
}, { immediate: true })
</script>

<template>
  <ul>
    <li v-for="c in comments" :key="c.id">{{ c.text }}</li>
  </ul>
</template>
```
::

<details>
<summary>Answer</summary>

This is the same race condition as the search-box example, just triggered by prop changes instead of typing. When `postId` changes quickly (e.g., a user clicks through several posts in a list before the first fetch finishes), multiple `fetch` calls are in flight simultaneously with no coordination between them. If the response for an *earlier* `postId` happens to resolve *after* the response for the current one — entirely possible depending on payload size or server load — `comments.value` gets overwritten with the wrong post's comments, and nothing in the code corrects it afterward.

::code-wrapper{language="vue" filename="PostComments.vue"}
```vue
<script setup>
import { ref, watch } from 'vue'

const props = defineProps({ postId: Number })
const comments = ref([])

watch(() => props.postId, async (id) => {
  const requestId = id
  const res = await fetch(`/api/posts/${id}/comments`)
  const data = await res.json()
  if (requestId === props.postId) {
    comments.value = data
  }
}, { immediate: true })
</script>
```
::

**The lesson**: any `watch`-driven or event-driven fetch that can be re-triggered before the previous call resolves needs a race-condition defense — an `AbortController` or a snapshot-and-compare guard — the trigger being a prop, a route param, or user typing doesn't change the underlying problem.

</details>

## Key Takeaways

- Model fetches with explicit `isLoading`/`error`/`data` state, and don't forget the fourth "successful but empty" case in the template.
- `fetch` never rejects on HTTP error statuses — always check `res.ok` and throw manually; `axios` rejects on non-2xx by default.
- Race conditions are the central async pitfall — defend with `AbortController` (preferred, actually cancels work) or a snapshot-and-compare guard when cancellation isn't available.
- Use `Promise.all` for independent parallel requests to avoid needlessly serializing unrelated fetches; use `Promise.allSettled` when partial failure should still render partial data.
- Top-level `await` in `<script setup>` requires a `<Suspense>` ancestor and suits simple must-complete-before-render fetches better than cancellable, retryable, or partially-rendered ones.
- Centralize HTTP client setup (base URL, auth headers, global error handling) in one module rather than repeating it per component.
