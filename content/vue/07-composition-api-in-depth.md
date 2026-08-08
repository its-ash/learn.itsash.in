# 07 — Composition API In Depth

## `setup()` — the Original Entry Point

Before `<script setup>` existed, the Composition API was accessed through a `setup()` option, which runs before the component instance is fully created (`data`, `computed`, `methods` from a mixed-in Options API aren't available yet, but props are):

::code-wrapper{language="vue" filename="Counter.vue"}
```vue
<script>
import { ref, computed } from 'vue'

export default {
  props: {
    initialCount: { type: Number, default: 0 }
  },
  setup(props, context) {
    const count = ref(props.initialCount)
    const doubled = computed(() => count.value * 2)

    function increment() {
      count.value++
    }

    // context has: attrs, slots, emit, expose
    context.emit // same as the `emit` you'd get from defineEmits

    // whatever is returned becomes available in the template
    // AND on `this` for any Options API code in the same component
    return { count, doubled, increment }
  }
}
</script>

<template>
  <button @click="increment">{{ count }} (doubled: {{ doubled }})</button>
</template>
```
::

`setup()`'s second argument, conventionally destructured as `{ emit, attrs, slots, expose }`, is how you access emit, fallthrough attributes, and slots without `this` — because inside `setup()`, `this` is deliberately `undefined` (the whole point of the Composition API is to not depend on `this` binding).

## `<script setup>` — the Modern Standard

`<script setup>` is compile-time sugar over `setup()` that removes almost all the boilerplate: no explicit `return`, no wrapping `export default`, and `defineProps`/`defineEmits` compiler macros instead of function parameters:

::code-wrapper{language="vue" filename="Counter.vue"}
```vue
<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  initialCount: { type: Number, default: 0 }
})
const emit = defineEmits(['change'])

const count = ref(props.initialCount)
const doubled = computed(() => count.value * 2)

function increment() {
  count.value++
  emit('change', count.value)
}
</script>

<template>
  <button @click="increment">{{ count }} (doubled: {{ doubled }})</button>
</template>
```
::

`defineProps` and `defineEmits` are **compiler macros** — they don't need to be imported, and they only work at the top level of `<script setup>`. The Vue compiler recognizes them syntactically and rewrites them into the equivalent low-level `setup(props, { emit })` code at build time; they cannot be called conditionally, inside a function, or reassigned to another variable name.

### `defineExpose` — opting into a public instance API

By default, `<script setup>` components are fully closed — a parent holding a template ref to a `<script setup>` child cannot access any of its internal state, unlike an Options API component where everything on `this` is implicitly accessible. `defineExpose` opts specific bindings back in:

::code-wrapper{language="vue" filename="SearchInput.vue"}
```vue
<script setup>
import { ref } from 'vue'

const inputEl = ref(null)
const query = ref('')

function focus() {
  inputEl.value.focus()
}

// without this, a parent's template ref to <SearchInput> sees an empty object
defineExpose({ focus })
</script>

<template>
  <input ref="inputEl" v-model="query" />
</template>
```
::

::code-wrapper{language="vue"}
```vue
<script setup>
import { ref, onMounted } from 'vue'
import SearchInput from './SearchInput.vue'

const searchRef = ref(null)

onMounted(() => {
  searchRef.value.focus() // works ONLY because SearchInput called defineExpose
})
</script>

<template>
  <SearchInput ref="searchRef" />
</template>
```
::

### `defineOptions` and `defineModel`

::code-wrapper{language="vue"}
```vue
<script setup>
// defineOptions sets Options-API-style options that don't have their
// own compiler macro, like `name` (for DevTools/recursive self-reference)
// and inheritAttrs
defineOptions({
  name: 'CurrencyInput',
  inheritAttrs: false
})

// defineModel (Vue 3.4+) collapses the modelValue prop + update:modelValue
// emit pattern from chapter 06 into a single reactive binding
const model = defineModel({ type: Number, default: 0 })

function increment() {
  model.value++   // reading AND writing model.value automatically
                   // emits update:modelValue to the parent
}
</script>

<template>
  <button @click="increment">{{ model }}</button>
</template>
```
::

`defineModel` is a significant ergonomics improvement — it removes the need to manually declare a `modelValue` prop, a matching `update:modelValue` emit, and write `emit('update:modelValue', ...)` by hand; `model.value = x` does all of that internally.

## Composables — the Core Reuse Mechanism

A **composable** is just a function that uses Composition API functions (`ref`, `computed`, `watch`, lifecycle hooks) to encapsulate and reuse stateful logic across components. This replaces the Options API's `mixins` (which suffered from unclear property origins when two mixins defined the same key) with plain function composition:

::code-wrapper{language="javascript" filename="composables/useMousePosition.js"}
```javascript
import { ref, onMounted, onUnmounted } from 'vue'

export function useMousePosition() {
  const x = ref(0)
  const y = ref(0)

  function update(event) {
    x.value = event.pageX
    y.value = event.pageY
  }

  onMounted(() => window.addEventListener('mousemove', update))
  onUnmounted(() => window.removeEventListener('mousemove', update))

  return { x, y }
}
```
::

::code-wrapper{language="vue" filename="CursorTracker.vue"}
```vue
<script setup>
import { useMousePosition } from './composables/useMousePosition'

const { x, y } = useMousePosition()
</script>

<template>
  <p>Mouse at: {{ x }}, {{ y }}</p>
</template>
```
::

Notice `{ x, y } = useMousePosition()` destructures safely here — unlike destructuring a `reactive` object, this works correctly because `useMousePosition` returns an object whose values are already individual `ref`s, not a single `reactive` object being torn apart. This is precisely why composables conventionally return either individual `ref`s or the result of `toRefs()` — never a raw `reactive` object.

### A more realistic composable: `useFetch`

::code-wrapper{language="javascript" filename="composables/useFetch.js"}
```javascript
import { ref, watchEffect, toValue } from 'vue'

export function useFetch(url) {
  const data = ref(null)
  const error = ref(null)
  const isLoading = ref(false)

  watchEffect(async (onCleanup) => {
    const target = toValue(url)   // supports a string, a ref, or a getter
    if (!target) return

    isLoading.value = true
    data.value = null
    error.value = null

    const controller = new AbortController()
    onCleanup(() => controller.abort())

    try {
      const res = await fetch(target, { signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      data.value = await res.json()
    } catch (err) {
      if (err.name !== 'AbortError') error.value = err
    } finally {
      isLoading.value = false
    }
  })

  return { data, error, isLoading }
}
```
::

::code-wrapper{language="vue" filename="UserProfile.vue"}
```vue
<script setup>
import { ref, computed } from 'vue'
import { useFetch } from './composables/useFetch'

const userId = ref(1)
const url = computed(() => `/api/users/${userId.value}`)

// re-fetches automatically whenever userId (and therefore url) changes,
// because useFetch's watchEffect tracks toValue(url) internally
const { data: user, error, isLoading } = useFetch(url)
</script>

<template>
  <p v-if="isLoading">Loading…</p>
  <p v-else-if="error">Failed to load: {{ error.message }}</p>
  <div v-else-if="user">{{ user.name }}</div>
</template>
```
::

Accepting `url` as a plain value, a `ref`, or a getter (via `toValue`) is what makes `useFetch` flexible enough to either fetch once from a fixed string, or automatically re-fetch whenever a reactive dependency changes — the caller decides which behavior they want just by what they pass in.

## Composable Naming and Organization Conventions

- Prefix every composable with `use` (`useFetch`, `useMousePosition`, `useLocalStorage`) — this is a strong community convention (mirrored from React hooks) that instantly signals "this function uses reactivity/lifecycle internally, call it accordingly."
- Composables can call other composables — this is normal and expected, and is how complex behavior gets built from smaller reusable pieces.
- A composable that uses lifecycle hooks (`onMounted`, `onUnmounted`) must be called during a component's `setup()`/`<script setup>` synchronous execution — calling it later (e.g., inside a `setTimeout` or after an `await`) has no component instance to attach the lifecycle hook to, and Vue will warn.

### The "must be called synchronously" trap

::code-wrapper{language="vue"}
```vue
<script setup>
import { onMounted } from 'vue'
import { useFetch } from './composables/useFetch'

async function loadDashboard() {
  await someAsyncSetupStep()

  // WRONG — this runs after an await, outside setup()'s synchronous
  // execution window; Vue has already lost track of "which component
  // instance is currently being set up," so onMounted inside useFetch
  // (if it used one) would silently do nothing and warn in dev mode
  const { data } = useFetch('/api/dashboard')
}

onMounted(loadDashboard)
</script>
```
::

Vue tracks "the currently active component instance" via a module-level variable during `setup()`'s synchronous execution; anything that suspends execution (an `await`) and resumes later runs with that tracking already cleared. The fix is to call composables (or at least the lifecycle-hook-registering parts of them) synchronously at the top of `<script setup>`, and only `await` things inside the functions those hooks call, not around the hook registration itself.

## Composition API vs Options API Lifecycle Hook Access

The Composition API and Options API can technically be mixed in the same component (`setup()` alongside `data()`/`methods`), but doing so intentionally in new code is rare and generally a sign of an in-progress migration rather than a target architecture — chapter 08 covers the full lifecycle hook mapping between the two styles.

## 💡 Tips & Tricks

- **Idiom** — Extract any piece of stateful logic used in more than one component into a composable immediately, even if the first extraction feels premature — composables cost almost nothing to create and dramatically reduce the odds of two components' copies of "the same" logic drifting apart over time.
- **Debug** — If `defineProps`/`defineEmits` seem to not work, check that they're called at the true top level of `<script setup>`, not inside an `if`, a function, or after a `return` — the compiler macro transform is purely syntactic and requires this exact placement.
- **Idiom** — `defineExpose` should be the exception, not the default — most `<script setup>` components should stay fully closed; only expose the specific imperative methods (`focus()`, `reset()`, `scrollToTop()`) a parent genuinely needs to call directly, rather than exposing broad internal state.
- **Performance** — Composables that set up subscriptions, event listeners, or intervals should always pair the setup in `onMounted` with matching teardown in `onUnmounted` — a composable used in a list of 500 rows that leaks one `window` listener per row is a real, measurable performance and memory problem.
- **Idiom** — `defineModel` (Vue 3.4+) is now the preferred way to implement `v-model` support on a component — reach for the manual `modelValue` prop + `update:modelValue` emit pattern from chapter 06 only when you're on an older Vue version or need to intercept the value in ways `defineModel`'s options don't cover.

## ⚠️ Edge Cases & Gotchas

- **Compiler macros (`defineProps`, `defineEmits`, `defineModel`, `defineExpose`, `defineOptions`) need no import and cannot be reassigned** — They look like regular function calls but are erased and rewritten by the compiler; assigning `const dp = defineProps` and calling `dp(...)` later does not work, because the compiler is pattern-matching the literal call syntax, not evaluating real JavaScript function references.
- **`setup()`'s `this` is `undefined` by design** — Unlike every other Options API function, arrow functions or regular functions inside `setup()` cannot use `this` to access props/data/methods — this is intentional, since the entire point of the Composition API is to be independent of instance binding; use the destructured `props` parameter and returned refs instead.
- **A composable called after an `await` loses lifecycle-hook registration silently** — `onMounted`/`onUnmounted`/etc. called outside `setup()`'s synchronous execution window (e.g., after an `await` inside an async `setup()`, or inside a `setTimeout`) produce a dev-mode warning and simply do nothing — no error, no crash, just a hook that never fires.
- **Returning a plain `reactive` object from a composable re-introduces the destructuring trap one layer up** — If a composable does `return state` where `state = reactive({...})`, then `const { count } = useSomething()` in the consuming component silently disconnects `count`, exactly as in chapter 03 — composables must return `toRefs(state)` or individual refs specifically so their consumers can destructure safely.
- **Two composables both registering `onMounted` in the same component both run — order is call order, not declaration order in some other sense** — If `useFoo()` and `useBar()` are both called inside a component's `<script setup>` and both call `onMounted`, both hooks run, in the order the composables were invoked — useful to know when one composable's mount logic depends on another's having already run.

## 🧠 Spot the Bug

A composable is meant to persist a ref's value to `localStorage` automatically. It works when called directly in a component, but a second composable that wraps it to add validation returns a value that never persists.

::code-wrapper{language="javascript" filename="composables/useLocalStorage.js"}
```javascript
import { ref, watch } from 'vue'

export function useLocalStorage(key, defaultValue) {
  const stored = localStorage.getItem(key)
  const data = ref(stored ? JSON.parse(stored) : defaultValue)

  watch(data, (val) => {
    localStorage.setItem(key, JSON.stringify(val))
  })

  return data
}
```
::

::code-wrapper{language="javascript" filename="composables/useValidatedSetting.js"}
```javascript
import { useLocalStorage } from './useLocalStorage'

export function useValidatedSetting(key, defaultValue, isValid) {
  const raw = useLocalStorage(key, defaultValue)

  // WRONG — reading .value here unwraps and returns a plain, disconnected value
  return isValid(raw.value) ? raw.value : defaultValue
}
```
::

<details>
<summary>Answer</summary>

`useValidatedSetting` reads `raw.value` and returns that plain unwrapped value instead of returning the `ref` itself. The moment it does that, the connection back to `useLocalStorage`'s internal `data` ref (and its `watch` that writes to `localStorage`) is severed — the consuming component receives a frozen snapshot, exactly like every other reactivity-loss case in this course. Assigning to that returned value does nothing to the original ref, and no persistence ever happens.

::code-wrapper{language="javascript" filename="composables/useValidatedSetting.js"}
```javascript
import { computed } from 'vue'
import { useLocalStorage } from './useLocalStorage'

export function useValidatedSetting(key, defaultValue, isValid) {
  const raw = useLocalStorage(key, defaultValue)

  return computed({
    get: () => (isValid(raw.value) ? raw.value : defaultValue),
    set: (val) => { raw.value = val }
  })
}
```
::

**The lesson**: a composable that wraps another composable must pass reactivity through — either return the inner ref directly, or wrap it in a `computed` that still reads/writes through `.value` — the instant you extract a plain value with `.value` and hand that back instead of the reactive container, every downstream consumer loses the live connection.

</details>

## Key Takeaways

- `<script setup>` compiles to `setup()` under the hood; `defineProps`/`defineEmits`/`defineModel`/`defineExpose`/`defineOptions` are compiler macros usable only at its top level.
- `<script setup>` components are closed by default — `defineExpose` is required to let a parent's template ref call into a child's internal methods.
- Composables are plain functions using `ref`/`computed`/`watch`/lifecycle hooks to package and reuse stateful logic — Vue 3's replacement for Options API mixins.
- Composables must return individual refs or `toRefs()` output, never a raw `reactive` object, so consumers can destructure their return value safely.
- Lifecycle hooks (and by extension, any composable that uses them) must be registered synchronously during `setup()`'s initial execution — never after an `await` or inside a callback.
- `defineModel` (3.4+) collapses the `modelValue` prop + `update:modelValue` emit boilerplate from chapter 06 into a single two-way-bound ref.
