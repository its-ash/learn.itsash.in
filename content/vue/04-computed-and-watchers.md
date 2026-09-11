---
title: Vue 3 Engineering Reference — Computed & Watchers
description: Computed caching internals, dirty flag mechanism, watch vs watchEffect flush timing, deep watcher cost analysis, scheduler control, and multi-source watcher patterns for production apps.
---

# 04 — Computed & Watchers

## Computed — Caching and the Dirty Flag

::code-wrapper{language="typescript" filename="computed-internals.ts"}
```typescript
import { ref, computed, effect, dirty } from 'vue'

// ── Computed internals (simplified from @vue/reactivity) ──
// A computed has three states:
//   1. clean/dirty: whether the cached value is valid
//   2. value: the cached result
//   3. dep: set of effects that depend on THIS computed

const count = ref(0)
const doubled = computed(() => count.value * 2)

// ── How caching actually works: ──────────────────────────
// 1. First read: runs the getter, caches result, marks as "clean"
// 2. Subsequent reads: returns cached value WITHOUT running getter
// 3. count.value changes → marks doubled as "dirty" (not clean)
// 4. Next read of doubled.value → getter re-runs, new value cached

// ── The dirty flag chain: ────────────────────────────────
// count (ref) changes → trigger → marks doubled (computed) as dirty
// doubled is dirty → trigger → marks any effect that read doubled as dirty
// The cascade continues until an effect actually re-runs and re-reads.

// ── Key: computed is LAZY — getter never runs if nobody reads it ──
const expensive = computed(() => {
  console.log('running heavy calc')  // only runs when .value is read
  return hugeArray.value.map(x => x * 2)
})
count.value++  // marks expensive as dirty, but getter does NOT run yet
// Only when something reads expensive.value does the getter execute.

// ── Eager evaluation: use watchEffect if you need immediate execution ──
watchEffect(() => {
  console.log('count is', count.value)  // runs immediately + on every change
})
```
::

## Production Pattern — Computed with Getters (Vue 3.3+)

::code-wrapper{language="typescript" filename="toValue-pattern.ts"}
```typescript
import { computed, toValue, type MaybeRefOrGetter } from 'vue'

// ── toValue: normalize ref | getter | plain value → value ──
// Enables composables that accept ANY reactive source as input.

// Computed that accepts either a ref, a getter, or a plain value:
function useNormalized<T>(source: MaybeRefOrGetter<T>, fn: (v: T) => T) {
  return computed(() => fn(toValue(source)))
  // toValue(source):
  //   ref → source.value
  //   getter function → source()
  //   plain value → source
}

// ── Usage — caller picks the reactive style they prefer: ──
const items = ref([1, 2, 3])
const normalized = useNormalized(items, arr => arr.map(x => x * 2))
// OR: useNormalized(() => store.items, fn)  ← getter
// OR: useNormalized(staticArray, fn)        ← plain value

// ── Why this matters: ────────────────────────────────────
// Pre-3.3, composables had to use unref(source) which only handled refs.
// Getters (common in Pinia stores and component props) required manual wrapping.
// toValue unifies all three — write composable once, accept any source.
```
::

## Writable Computed — Getter/Setter for Form State

::code-wrapper{language="typescript" filename="writable-computed.ts"}
```typescript
import { ref, computed } from 'vue'

const firstName = ref('Ada')
const lastName = ref('Lovelace')

// ── Writable computed: get derives from deps, set distributes to deps ──
const fullName = computed({
  get() {
    return `${firstName.value} ${lastName.value}`
  },
  set(newValue: string) {
    // Split the input and write back to the source refs
    const [first, ...rest] = newValue.split(' ')
    firstName.value = first
    lastName.value = rest.join(' ')
  },
})

fullName.value = 'Grace Hopper'
console.log(firstName.value)  // 'Grace'
console.log(lastName.value)   // 'Hopper'

// ── Anti-pattern: set without writing to source deps ──
// If the setter doesn't write to the reactive deps that the getter reads,
// the next get() returns the derived value (ignoring what was set),
// making the set appear to "not stick."
```
::

## watch — Source Types and Callback Signature

::code-wrapper{language="typescript" filename="watch-sources.ts"}
```typescript
import { ref, reactive, watch, toRefs, type WatchCallback, type WatchSource } from 'vue'

// ── 1. Watch a ref ──
const count = ref(0)
watch(count, (newVal, oldVal) => {
  console.log(`${oldVal} → ${newVal}`)
})

// ── 2. Watch a getter (computed-like) ──
const user = reactive({ name: 'Ada', age: 36 })
watch(
  () => user.age,                    // getter: must return the value to track
  (newAge, oldAge) => {
    console.log(`age: ${oldAge} → ${newAge}`)
  }
)

// ── 3. Watch multiple sources — new/old are arrays ──
const a = ref(1)
const b = ref(2)
watch([a, b], ([newA, newB], [oldA, oldB]) => {
  console.log(`a: ${oldA}→${newA}, b: ${oldB}→${newB}`)
})

// ── 4. Watch a reactive object — deep by default ──
watch(user, (newUser, oldUser) => {
  // ⚠️ newUser and oldUser are the SAME object reference (mutated in place)
  // For a snapshot, use a getter: () => ({ ...user })
  console.log('user changed (deep)')
})

// ── 5. Watch getter returning array — deep NOT automatic ──
watch(
  () => user.roles,  // returns the array reference (same unless replaced)
  (roles) => { /* fires only when .roles is reassigned, not on push/splice */ },
  { deep: true }  // opt-in to deep watching of array contents
)
```
::

## watch vs watchEffect — When to Use Which

::code-wrapper{language="typescript" filename="watch-vs-effect.ts"}
```typescript
import { ref, watch, watchEffect } from 'vue'

const query = ref('')

// ── watchEffect: auto-tracks, runs immediately, no old value ──
watchEffect(() => {
  // Automatically tracks every reactive read inside this function.
  // Runs IMMEDIATELY (sync, before mount if in setup).
  // Re-runs whenever ANY tracked ref changes.
  fetch(`/api/search?q=${query.value}`)  // auto-tracks query
})
// Pros: no explicit source list, immediate execution, simple
// Cons: no access to old value, fires on initial run (may be unwanted)

// ── watch: explicit source, lazy, gets old + new value ──
watch(query, (newVal, oldVal) => {
  // Only runs AFTER query changes (not on initial setup).
  // Has access to both old and new values.
  fetch(`/api/search?q=${newVal}`)
}, { immediate: false })  // default — set true to fire on init

// ── Decision matrix: ────────────────────────────────────
// Need old value?              → watch
// Need to skip initial run?    → watch
// Side effect tracks many deps → watchEffect (auto-tracking, less code)
// Need to debounce/throttle?   → watch (control flush timing)
// Async setup with cleanup     → watch (onCleanup param)
```
::

## Flush Timing — pre, post, sync

::code-wrapper{language="typescript" filename="flush-timing.ts"}
```typescript
import { ref, watch, nextTick } from 'vue'

const count = ref(0)

// ── flush: 'pre' (default) — runs BEFORE component re-render ──
// The watcher callback fires before the DOM updates.
// Useful: when the callback modifies state that the template reads,
// so the render uses the updated value (avoids a double render).
watch(count, (n) => {
  console.log('pre-flush: count is', n, 'DOM not yet updated')
}, { flush: 'pre' })

// ── flush: 'post' — runs AFTER component re-render ──
// The watcher fires after Vue has patched the DOM.
// Useful: when you need to read updated DOM measurements.
watch(count, (n) => {
  // Safe to measure the DOM here — it reflects the new count
  const el = document.querySelector('#counter')
  console.log('post-flush: DOM shows', el?.textContent)
}, { flush: 'post' })

// ── flush: 'sync' — runs synchronously on mutation ──
// Bypasses the queue — fires immediately when the source changes.
// ⚠️ Can cause infinite loops if the callback mutates the source.
// Use for: debug logging, or when order-of-execution matters precisely.
watch(count, (n) => {
  console.log('sync: immediate', n)
}, { flush: 'sync' })

// ── nextTick: wait for the current flush queue to drain ──
count.value = 5
// DOM not yet updated here
nextTick(() => {
  // DOM IS updated — all pre and post watchers have fired
  console.log('after nextTick, DOM is current')
})
```
::

## Deep Watch — Cost and When to Avoid It

::code-wrapper{language="typescript" filename="deep-watch.ts"}
```typescript
import { reactive, watch } from 'vue'

const tree = reactive({
  nodes: Array.from({ length: 1000 }, (_, i) => ({
    id: i,
    children: Array.from({ length: 100 }, (_, j) => ({ id: `${i}-${j}` }))
  }))
})

// ❌ WRONG: deep:true on a large reactive object
watch(tree, (newTree) => {
  // deep:true walks EVERY property of EVERY nested object to track them.
  // For 1000×100 = 100,000 nested objects, this installs 100,000+ track calls.
  // Every nested mutation triggers this callback — even irrelevant ones.
  saveToServer(newTree)
}, { deep: true })

// ✅ CORRECT: watch a specific path, not the whole tree
watch(
  () => tree.nodes.length,  // only track the array length
  (len) => {
    console.log('node count changed:', len)
  }
)

// ✅ CORRECT: watch a getter that returns a shallow snapshot
watch(
  () => tree.nodes.map(n => n.id),  // new array on each change
  (ids) => {
    console.log('node ids changed:', ids)
  }
)

// ── Rule: deep:true is O(n) in object depth × breadth ──
// For forms (flat object, ~20 fields): fine, use deep.
// For trees/tables (1000+ nodes): never deep — watch specific paths instead.
```
::

## Cleanup — Race Condition Prevention in Async Watchers

::code-wrapper{language="typescript" filename="watch-cleanup.ts"}
```typescript
import { ref, watch, type WatchCallback } from 'vue'

const searchQuery = ref('')

// ── onCleanup: cancel stale async work when source changes again ──
// The 3rd arg of the watch callback is an onCleanup function.
// Register a cleanup function that runs BEFORE the next invocation.
// Critical for preventing race conditions in debounced search.
watch(searchQuery, async (newQuery, oldQuery, onCleanup) => {
  const controller = new AbortController()
  const signal = controller.signal

  // Register cleanup — aborts the previous fetch if query changes again
  onCleanup(() => controller.abort())

  try {
    const res = await fetch(`/api/search?q=${newQuery}`, { signal })
    const data = await res.json()
    // If controller was aborted (user typed again), this line is skipped
    // because the fetch threw an AbortError, caught below.
    results.value = data
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return  // expected — stale request was canceled
    }
    throw e    // re-throw unexpected errors
  }
})

// ── Without cleanup: ─────────────────────────────────────
// If user types "a" then "ab" quickly:
//   1. fetch("a") starts
//   2. fetch("ab") starts
//   3. fetch("ab") resolves first → results = [ab data]
//   4. fetch("a") resolves last → results = [a data] ← WRONG, stale!
// Cleanup aborts the "a" request when "ab" starts → no stale overwrite.
```
::

## Immediate Watch with Async Initialization

::code-wrapper{language="typescript" filename="immediate-watch.ts"}
```typescript
import { ref, watch, onMounted } from 'vue'

const userId = ref<number | null>(null)

// ── immediate: true — fires on setup AND on every change ──
// Useful for "load data whenever the id changes, including initial load."
watch(
  () => userId.value,
  async (id, _oldId, onCleanup) => {
    if (id === null) return  // guard: don't fetch before id is set

    onCleanup(() => controller?.abort())

    const controller = new AbortController()
    const res = await fetch(`/api/users/${id}`, { signal: controller.signal })
    userData.value = await res.json()
  },
  { immediate: true }
)

// ── onMounted fires AFTER setup, but immediate watch fires DURING setup ──
// If the fetch needs DOM or component refs, use immediate:false + onMounted:
onMounted(async () => {
  // DOM is ready, component is mounted — safe to measure, query elements
  const rect = containerRef.value?.getBoundingClientRect()
  await loadData(userId.value)
})
```
::

## Computed Cache Invalidation — Stale Closure Trap

::code-wrapper{language="typescript" filename="stale-closure.ts"}
```typescript
import { ref, computed, watch } from 'vue'

const multiplier = ref(2)
const items = ref([1, 2, 3])

// ❌ WRONG: computed with external mutable dependency
const bad = computed(() => {
  // multiplier.value is tracked, but externalVar is NOT — changes to it
  // won't re-run this getter, producing stale results.
  const externalVar = someExternalStore.getState()  // not reactive
  return items.value.map(x => x * multiplier.value * externalVar)
})

// ✅ CORRECT: all dependencies must be reactive
const good = computed(() => {
  // everything read here is reactive — getter re-runs when any changes
  return items.value.map(x => x * multiplier.value)
})

// ── Watchers don't have this problem — they're explicit about sources ──
watch([items, multiplier], () => {
  // both items and multiplier are tracked as sources
  const result = items.value.map(x => x * multiplier.value)
})
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
import { ref, computed, watch, watchEffect, onWatcherCleanup } from 'vue'

// ── 1. onWatcherCleanup (3.5+) — cleanup without the 3rd callback param ──
watch(searchQuery, async (q) => {
  const controller = new AbortController()
  onWatcherCleanup(() => controller.abort())  // same as onCleanup, cleaner
  await fetch(`/api?q=${q}`, { signal: controller.signal })
})

// ── 2. Debounced watcher — combine watch + setTimeout ──
function debounceWatch(source, cb, delay = 300) {
  let timer: ReturnType<typeof setTimeout>
  watch(source, (val) => {
    clearTimeout(timer)
    timer = setTimeout(() => cb(val), delay)
  })
}

// ── 3. Computed chaining — one computed can depend on another ──
const base = computed(() => items.value.length)
const derived = computed(() => base.value * 2)  // re-runs when base is dirty

// ── 4. watchEffect returns a stop function — manual teardown ──
const stop = watchEffect(() => { /* ... */ })
stop()  // stops the effect, runs any registered cleanup

// ── 5. once: true (3.4+) — stop after first invocation ──
watch(eventSource, handler, { once: true })  // fires once, auto-stops
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
import { ref, reactive, computed, watch } from 'vue'

// ── 1. Computed returning objects — same reference → watcher doesn't fire ──
const state = reactive({ list: [1, 2, 3] })
const snapshot = computed(() => state.list)
watch(snapshot, (n, o) => { /* fires? */ })
state.list.push(4)
// If computed returns the same array reference (push mutates in place),
// the watcher sees the same reference and does NOT fire.
// Fix: return a NEW array: computed(() => [...state.list])

// ── 2. watch on reactive object — old === new (same reference) ──
const obj = reactive({ a: 1 })
watch(obj, (newVal, oldVal) => {
  console.log(newVal === oldVal)  // true — reactive objects are mutated in place
  // To get a true snapshot, use a getter: () => ({ ...obj })

// ── 3. Sync flush + mutation = infinite loop ──
watch(count, (n) => {
  count.value = n + 1  // sync flush: immediately triggers watch again → stack overflow
}, { flush: 'sync' })
// Fix: never mutate the source inside a sync watcher.

// ── 4. Computed getter with side effects ──
const bad = computed(() => {
  api.log('computed read')  // side effect in getter — anti-pattern
  return state.value * 2
})
// Getters should be pure. Side effects belong in watch/watchEffect.

// ── 5. watch immediate + async — first run fires before onMounted ──
// If the callback touches template refs, they're null on the first (immediate) run.
// Fix: guard with if (!ref.value) return, or use onMounted instead of immediate.

// ── 6. Multiple watchers fire in creation order, not dependency order ──
// Watch A depends on X, Watch B depends on A. When X changes:
//   A fires first, then B fires (A's update propagated to B). ← correct
// But if A and B both depend on X (no chain), order is creation order.
```
::

## 🧠 Spot the Bug

A search feature shows stale results when the user types fast.

::code-wrapper{language="typescript" filename="RaceBug.ts"}
```typescript
import { ref, watch } from 'vue'

const query = ref('')
const results = ref([])

watch(query, async (q) => {
  const res = await fetch(`/api/search?q=${q}`)
  results.value = await res.json()
})
```
::

<details>
<summary>Answer</summary>

No cleanup — older fetches can resolve *after* newer ones, overwriting correct results with stale data.

**Fix** — abort the previous request when a new one starts:

::code-wrapper{language="typescript" filename="RaceFixed.ts"}
```typescript
import { ref, watch } from 'vue'

const query = ref('')
const results = ref([])

watch(query, async (q, _old, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())  // cancel previous fetch on new change
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

**The lesson**: async watchers must register cleanup (via `onCleanup`) to cancel stale work. Without it, out-of-order resolution causes data races.

</details>