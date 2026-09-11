---
title: Vue 3 Engineering Reference — Fetching Data & Async
description: Race condition prevention with AbortController, request deduplication, SWR pattern, pagination cursor management, optimistic updates, and Suspense-based async orchestration.
---

# 12 — Fetching Data & Async

## useFetch — Production Race Condition Handler

::code-wrapper{language="typescript" filename="useFetch.ts"}
```typescript
import { ref, watchEffect, toValue, type MaybeRefOrGetter, type Ref } from 'vue'

interface FetchOptions {
  immediate?: boolean
  refetch?: boolean  // re-fetch when source changes
  transform?: (data: any) => any
}

// ── Race condition prevention via AbortController ──
// Every time the URL changes, the previous fetch is aborted.
// Only the latest request's response is committed to state.
export function useFetch<T>(
  url: MaybeRefOrGetter<string>,
  options: FetchOptions = {}
) {
  const data: Ref<T | null> = ref(null)
  const error: Ref<Error | null> = ref(null)
  const loading = ref(false)
  const statusCode = ref<number | null>(null)

  let abortController: AbortController | null = null

  async function execute() {
    const targetUrl = toValue(url)
    if (!targetUrl) return

    // ── Abort any in-flight request before starting a new one ──
    abortController?.abort()
    abortController = new AbortController()

    loading.value = true
    error.value = null

    try {
      const res = await fetch(targetUrl, { signal: abortController.signal })
      statusCode.value = res.status
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      let json = await res.json()
      if (options.transform) json = options.transform(json)
      data.value = json as T
    } catch (e) {
      // ── AbortError is expected — don't set it as an error ──
      if (e instanceof DOMException && e.name === 'AbortError') return
      error.value = e as Error
    } finally {
      loading.value = false
    }
  }

  if (options.refetch !== false) {
    // ── watchEffect auto-tracks toValue(url) — re-fetches on URL change ──
    watchEffect(execute)
  } else if (options.immediate) {
    execute()  // one-time fetch, no re-fetch on change
  }

  return { data, error, loading, statusCode, refresh: execute }
}
```
::

## Request Deduplication — Coalescing Concurrent Fetches

::code-wrapper{language="typescript" filename="useDedupFetch.ts"}
```typescript
import { ref, type Ref } from 'vue'

// ── Deduplication: if a request to the same URL is in flight,
//    reuse its promise instead of firing a second request. ──
// Critical for components that mount simultaneously and fetch the same data.

const cache = new Map<string, Promise<any>>()

export function useDedupFetch<T>(url: string): {
  data: Ref<T | null>
  loading: Ref<boolean>
  error: Ref<Error | null>
} {
  const data = ref<T | null>(null) as Ref<T | null>
  const loading = ref(true)
  const error = ref<Error | null>(null)

  async function load() {
    // ── Check cache: is a request for this URL already in flight? ──
    if (cache.has(url)) {
      try {
        data.value = await cache.get(url)!
        return
      } catch (e) {
        error.value = e as Error
        return
      } finally {
        loading.value = false
      }
    }

    // ── Start a new request and cache the PROMISE (not the result) ──
    const promise = fetch(url).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })

    cache.set(url, promise)  // other concurrent callers will await this same promise

    try {
      data.value = await promise
    } catch (e) {
      error.value = e as Error
    } finally {
      loading.value = false
      cache.delete(url)  // clear cache entry after resolution
    }
  }

  load()
  return { data, loading, error }
}
```
::

## SWR (Stale-While-Revalidate) Pattern

::code-wrapper{language="typescript" filename="useSWR.ts"}
```typescript
import { ref, watchEffect, toValue, type MaybeRefOrGetter, type Ref } from 'vue'

// ── SWR: show cached (stale) data immediately, revalidate in background ──
// Provides instant UI render from cache while fetching fresh data.

const cache = new Map<string, { data: any; timestamp: number }>()

export function useSWR<T>(
  key: MaybeRefOrGetter<string>,
  fetcher: (url: string) => Promise<T>,
  ttl = 60_000  // cache validity: 60 seconds
): { data: Ref<T | null>; loading: Ref<boolean>; error: Ref<Error | null> } {
  const data: Ref<T | null> = ref(null) as Ref<T | null>
  const loading = ref(true)
  const error = ref<Error | null>(null)

  watchEffect(async () => {
    const url = toValue(key)
    if (!url) return

    const cached = cache.get(url)

    // ── Phase 1: serve stale data immediately (instant render) ──
    if (cached) {
      data.value = cached.data
      loading.value = false

      // If cache is fresh, no revalidation needed
      if (Date.now() - cached.timestamp < ttl) return
    }

    // ── Phase 2: revalidate in background (fresh fetch) ──
    try {
      const fresh = await fetcher(url)
      data.value = fresh
      cache.set(url, { data: fresh, timestamp: Date.now() })
    } catch (e) {
      // If we have stale data, keep it — don't overwrite with error
      if (!cached) error.value = e as Error
    } finally {
      loading.value = false
    }
  })

  return { data, loading, error }
}
```
::

## Pagination — Cursor-Based with Accumulated Results

::code-wrapper{language="typescript" filename="usePaginatedFetch.ts"}
```typescript
import { ref, computed, type Ref } from 'vue'

interface PageResult<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

// ── Cursor pagination: appends new pages to existing results ──
// Better than offset pagination: stable under inserts/deletes.
export function usePaginatedFetch<T>(
  baseUrl: string,
  pageSize = 20
) {
  const items: Ref<T[]> = ref([]) as Ref<T[]>
  const cursor = ref<string | null>(null)
  const loading = ref(false)
  const hasMore = ref(true)
  const error = ref<Error | null>(null)

  // ── Computed: total count is derived from items array length ──
  const total = computed(() => items.value.length)

  async function loadNext() {
    if (loading.value || !hasMore.value) return

    loading.value = true
    error.value = null

    try {
      const params = new URLSearchParams({ limit: String(pageSize) })
      if (cursor.value) params.set('cursor', cursor.value)

      const res = await fetch(`${baseUrl}?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const page: PageResult<T> = await res.json()

      // ── Append, don't replace — preserves previously loaded items ──
      items.value.push(...page.items)
      cursor.value = page.nextCursor
      hasMore.value = page.hasMore
    } catch (e) {
      error.value = e as Error
    } finally {
      loading.value = false
    }
  }

  function reset() {
    items.value = []
    cursor.value = null
    hasMore.value = true
    error.value = null
  }

  return { items, loading, hasMore, total, error, loadNext, reset }
}
```
::

## Optimistic Updates — Rollback on Failure

::code-wrapper{language="typescript" filename="optimistic-update.ts"}
```typescript
import { ref, type Ref } from 'vue'

// ── Optimistic update: update UI before server confirms ──
// Rollback on failure — user sees instant response, no waiting.
export function useOptimisticUpdate<T extends { id: string }>(
  items: Ref<T[]>,
  updateFn: (item: T) => Promise<T>
) {
  const error: Ref<string | null> = ref(null)

  async function update(item: T, patch: Partial<T>) {
    error.value = null

    // ── Save original for potential rollback ──
    const original = items.value.find(i => i.id === item.id)
    if (!original) return

    // ── Phase 1: apply patch optimistically (instant UI) ──
    const optimistic = { ...original, ...patch }
    items.value = items.value.map(i => i.id === item.id ? optimistic : i)

    try {
      // ── Phase 2: send to server, wait for confirmation ──
      const confirmed = await updateFn(optimistic)
      // Replace with server-confirmed version (may differ from optimistic)
      items.value = items.value.map(i => i.id === confirmed.id ? confirmed : i)
    } catch (e) {
      // ── Phase 3: rollback on failure ──
      items.value = items.value.map(i => i.id === original.id ? original : i)
      error.value = (e as Error).message
    }
  }

  return { update, error }
}

// ── Usage: ──────────────────────────────────────────────
// const { update, error } = useOptimisticUpdate(todos, api.updateTodo)
// await update(todo, { completed: true })  // UI flips instantly, rolls back on error
```
::

## Suspense — Async Component Orchestration

::code-wrapper{language="vue" filename="SuspensePattern.vue"}
```vue
<script setup>
import { defineAsyncComponent, Suspense, ref, onErrorCaptured } from 'vue'

// ── Suspense: declarative async component loading ──
// Parent shows fallback while child's async setup() resolves.
const AsyncDashboard = defineAsyncComponent(() => import('./Dashboard.vue'))

const error = ref(null)

// ── onErrorCaptured: catches errors from async setup in children ──
onErrorCaptured((err) => {
  error.value = err
  return false  // stop propagation
})
</script>

<template>
  <!-- ── Suspense boundary: fallback slot while async children load ── -->
  <Suspense>
    <template #default>
      <AsyncDashboard />
    </template>
    <template #fallback>
      <div class="loading-skeleton">Loading dashboard…</div>
    </template>
  </Suspense>

  <!-- ── Error state (Suspense doesn't handle errors, parent does) ── -->
  <div v-if="error" class="error">
    Failed to load: {{ error.message }}
    <button @click="error = null">Retry</button>
  </div>
</template>
```

::code-wrapper{language="vue" filename="DashboardChild.vue"}
```vue
<script setup>
import { ref } from 'vue'

// ── Top-level await makes this component async ──
// Must be inside a <Suspense> boundary or it throws.
const data = ref(null)

// Suspense waits for this promise to resolve before rendering the component.
const res = await fetch('/api/dashboard-data')
data.value = await res.json()
</script>

<template>
  <div>{{ data }}</div>
</template>
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
// ── 1. Polling: setInterval inside watch + cleanup ──
watchEffect((onCleanup) => {
  const id = setInterval(() => fetchData(), 5000)
  onCleanup(() => clearInterval(id))
})

// ── 2. Request cancellation on unmount: AbortController + onScopeDispose ──
const controller = new AbortController()
fetch(url, { signal: controller.signal })
onScopeDispose(() => controller.abort())  // cancels pending fetch on unmount

// ── 3. Exponential backoff retry ──
async function fetchWithRetry(url: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try { return await fetch(url) }
    catch (e) {
      if (i === maxRetries - 1) throw e
      await new Promise(r => setTimeout(r, 2 ** i * 1000))  // 1s, 2s, 4s
    }
  }
}

// ── 4. Prefetch on hover ──
function prefetch() {
  const link = document.createElement('link')
  link.rel = 'prefetch'
  link.href = '/api/next-page-data'
  document.head.appendChild(link)
}
// <RouterLink @mouseover="prefetch" to="/next">Next</RouterLink>
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. Stale closure in async callbacks ──
// watchEffect(() => { fetchData().then(data => items.value = data) })
// If items is refactored, the closure captures the old reference.
// Fix: use refs, not local variables, for values that survive async.

// ── 2. Race condition without AbortController ──
// Fast typing → fetch("a") starts → fetch("ab") starts
// fetch("ab") resolves first, fetch("a") resolves last → stale data overwrites.
// Always abort previous request on new trigger.

// ── 3. Suspense doesn't retry on error ──
// If async setup throws, Suspense shows nothing (error must be caught by parent).
// Use onErrorCaptured + v-if error state to show retry button.

// ── 4. Pagination reset on URL change ──
// If the base URL changes (filter applied), cursor must reset to null.
// Otherwise, the cursor from the old query is sent to the new endpoint.

// ── 5. Optimistic update without rollback = permanent inconsistency ──
// If the server fails and you don't rollback, UI shows state the server rejected.
// Always save original state before optimistic mutation.

// ── 6. JSON parse error isn't a network error ──
// fetch() resolves even on 404/500 — check res.ok before parsing.
// res.json() throws on non-JSON body (HTML error page) — wrap in try/catch.
```
::

## 🧠 Spot the Bug

A search component shows results from a previous query after the user types a new one.

::code-wrapper{language="typescript" filename="AsyncBug.ts"}
```typescript
import { ref, watch } from 'vue'

const query = ref('')
const results = ref([])

watch(query, async (q) => {
  const res = await fetch(`/api/search?q=${q}`)
  results.value = await res.json()  // ← stale response can overwrite fresh data
})
```
::

<details>
<summary>Answer</summary>

No abort/cancellation — if `fetch("a")` resolves after `fetch("ab")`, the stale "a" results overwrite the correct "ab" results.

**Fix** — abort the previous request on each new query:

::code-wrapper{language="typescript" filename="AsyncFixed.ts"}
```typescript
import { ref, watch } from 'vue'

const query = ref('')
const results = ref([])

watch(query, async (q, _old, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())  // cancel previous fetch

  try {
    const res = await fetch(`/api/search?q=${q}`, { signal: controller.signal })
    results.value = await res.json()
  } catch (e) {
    if (e.name === 'AbortError') return  // expected — stale request canceled
    throw e
  }
})
```
::

**The lesson**: async watchers must register cleanup to cancel stale work. Without it, out-of-order network responses cause data races — the last-resolved (not the last-requested) response wins.

</details>