# 23 — Design Patterns

## Composables: What Makes One Actually Good

Chapter 07 introduced composables mechanically — a function starting with `use` that calls other composition APIs. This chapter is about the judgment calls that separate a composable that ages well from one that becomes a tangled dependency the moment a second component needs a slightly different variant of it.

### Return a plain object, not a `reactive` one

::code-wrapper{language="javascript"}
```javascript
// WRONG — returning a single reactive object looks convenient, but
// destructuring it at the call site immediately breaks reactivity
// (the exact destructuring trap from chapter 03), since the destructured
// variables are plain, disconnected values, not refs
import { reactive, onMounted } from 'vue'

export function useMousePosition() {
  const state = reactive({ x: 0, y: 0 })

  onMounted(() => {
    window.addEventListener('mousemove', (e) => {
      state.x = e.clientX
      state.y = e.clientY
    })
  })

  return state
}
```
::

::code-wrapper{language="javascript"}
```javascript
// RIGHT — return an object of individual refs; destructuring at the
// call site preserves reactivity because each property IS a ref,
// not a plain value snapshotted out of a reactive object
import { ref, onMounted, onUnmounted } from 'vue'

export function useMousePosition() {
  const x = ref(0)
  const y = ref(0)

  function update(e) {
    x.value = e.clientX
    y.value = e.clientY
  }

  onMounted(() => window.addEventListener('mousemove', update))
  onUnmounted(() => window.removeEventListener('mousemove', update))

  return { x, y }
}
```
::

This is the single most consequential composable-design convention in the Vue ecosystem — every official and community composable (VueUse included) follows the "return an object of refs" shape specifically so that `const { x, y } = useMousePosition()` at the call site works correctly, without callers needing to know or care about the implementation detail of how the composable stores its internal state.

### Always clean up what you set up

The `useMousePosition` example above pairs `onMounted` with `onUnmounted` deliberately — a composable that adds a global listener, starts a timer, or opens a subscription without a matching teardown leaks that resource for the lifetime of the page, not just the lifetime of the component that called the composable:

::code-wrapper{language="javascript"}
```javascript
export function usePolling(fn, intervalMs) {
  let handle = null

  onMounted(() => {
    handle = setInterval(fn, intervalMs)
  })

  onUnmounted(() => {
    clearInterval(handle)   // without this, the interval keeps firing
                             // and calling `fn` even after the component
                             // that requested it has been destroyed
  })
}
```
::

A composable used across dozens of components multiplies a missing-cleanup bug by every mount/unmount cycle of every component that uses it — this is exactly the kind of subtle, easy-to-miss leak that's cheap to prevent at the composable's definition and expensive to track down later once it's causing a real production memory/performance issue.

### Accept refs or plain values, consistently

::code-wrapper{language="javascript"}
```javascript
import { unref, watch, ref } from 'vue'

// accepting `unref`-wrapped parameters lets callers pass either a plain
// value OR a ref/computed, and the composable reacts correctly either way
export function useDebouncedValue(source, delayMs = 300) {
  const debounced = ref(unref(source))
  let timeout = null

  watch(
    () => unref(source),
    (newValue) => {
      clearTimeout(timeout)
      timeout = setTimeout(() => { debounced.value = newValue }, delayMs)
    }
  )

  return debounced
}

// works whether the caller passes a plain string or a reactive ref
useDebouncedValue('static text')
useDebouncedValue(searchQuery)   // a ref, updates flow through automatically
```
::

This flexibility is a deliberate VueUse convention (they call the type `MaybeRef<T>`) — a composable that only accepts a ref forces every caller to wrap plain values pointlessly (`useDebouncedValue(ref('static text'))`), while one that only accepts a plain value can't react to a caller's changing state at all; supporting both via `unref`/`toValue` costs a few extra characters and meaningfully improves how pleasant the composable is to actually use.

## Container/Presentational Components

This pattern predates Vue (it's a longstanding React community pattern too) but maps directly onto Vue components: separate *what data a component needs and how it gets it* from *how that data is displayed*.

::code-wrapper{language="vue" filename="UserProfileCard.vue"}
```vue
<script setup>
// PRESENTATIONAL — receives everything via props, emits everything via
// events, has no idea where its data comes from or where its events go.
// No API calls, no store access, no routing logic — purely a function
// of its props, which makes it trivially reusable and trivially testable
defineProps({
  user: { type: Object, required: true },
  loading: { type: Boolean, default: false }
})

defineEmits(['edit', 'delete'])
</script>

<template>
  <div class="card">
    <p v-if="loading">Loading…</p>
    <template v-else>
      <h3>{{ user.name }}</h3>
      <p>{{ user.email }}</p>
      <button @click="$emit('edit', user.id)">Edit</button>
      <button @click="$emit('delete', user.id)">Delete</button>
    </template>
  </div>
</template>
```
::

::code-wrapper{language="vue" filename="UserProfileContainer.vue"}
```vue
<script setup>
// CONTAINER — owns data fetching, store access, and routing, and passes
// the results down to a presentational child. All of the "how do we get
// this data" concern lives here, isolated from "how does it look"
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { storeToRefs } from 'pinia'
import UserProfileCard from './UserProfileCard.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const { currentUser, loading } = storeToRefs(userStore)

userStore.fetchUser(route.params.id)

function handleEdit(id) {
  router.push(`/users/${id}/edit`)
}

async function handleDelete(id) {
  await userStore.deleteUser(id)
  router.push('/users')
}
</script>

<template>
  <UserProfileCard
    :user="currentUser"
    :loading="loading"
    @edit="handleEdit"
    @delete="handleDelete"
  />
</template>
```
::

The payoff is concrete, not just architectural tidiness: `UserProfileCard` can be dropped into a Storybook-style component catalog, unit-tested with plain prop objects and no store/router mocking at all (chapter 18's testing patterns become dramatically simpler against a presentational component), and reused in a completely different container (a search-results page showing the same card shape from different data) without any modification.

### Composables have mostly absorbed this pattern's original role

In practice, a lot of what used to require a container component is now handled by extracting the "how do we get this data" logic into a composable instead, called directly from a single component:

::code-wrapper{language="vue" filename="UserProfile.vue"}
```vue
<script setup>
import { useRoute } from 'vue-router'
import { useUser } from '@/composables/useUser'
import UserProfileCard from './UserProfileCard.vue'

const route = useRoute()
const { user, loading, deleteUser } = useUser(route.params.id)
</script>

<template>
  <UserProfileCard :user="user" :loading="loading" @delete="deleteUser" />
</template>
```
::

Both approaches achieve the same separation of concerns; composables tend to win for single-purpose data-fetching logic since there's no extra component-instance overhead, while a true container component still earns its place when it's coordinating *multiple* children, or handling layout/conditional-rendering decisions that don't belong inside a data-fetching composable at all.

## Renderless Components, Revisited

Chapter 13 introduced renderless components as a scoped-slot mechanism. The design-pattern lens on the same technique: a renderless component is the cleanest way to share *stateful behavior with markup-relevant timing* (not just plain reactive state) across wildly different visual presentations.

::code-wrapper{language="vue" filename="MouseTracker.vue"}
```vue
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const x = ref(0)
const y = ref(0)

function update(e) {
  x.value = e.clientX
  y.value = e.clientY
}

onMounted(() => window.addEventListener('mousemove', update))
onUnmounted(() => window.removeEventListener('mousemove', update))
</script>

<template>
  <slot :x="x" :y="y" />
</template>
```
::

::code-wrapper{language="vue"}
```vue
<template>
  <!-- one behavior, two totally different presentations, zero duplication
       of the mousemove-listener logic itself -->
  <MouseTracker v-slot="{ x, y }">
    <p>{{ x }}, {{ y }}</p>
  </MouseTracker>

  <MouseTracker v-slot="{ x, y }">
    <div class="cursor-dot" :style="{ left: `${x}px`, top: `${y}px` }" />
  </MouseTracker>
</template>
```
::

### Composable vs. renderless component — the actual decision rule

This exact `useMousePosition` logic was written as a composable earlier in this chapter, and as a renderless component here — they're not competing solutions to different problems, they're the same underlying state exposed two different ways, and the deciding question is genuinely simple: **does consuming code need to control markup structure around the behavior, or just read reactive values from it?**

- Need the values in `<script setup>` to combine with other logic, feed into a `computed`, or use in a way that isn't primarily template markup → composable.
- Need per-consumer-controlled markup, conditional rendering, or multiple named slots driven by the same underlying state → renderless component (or `<component :is>` with a scoped slot).

A composable can always be wrapped in a thin renderless component when markup-level flexibility is later needed (the renderless component's `<script setup>` just calls the composable and forwards its return value into `<slot>` bindings) — so the pragmatic default for genuinely new logic is to write the composable first, and reach for the renderless wrapper only once an actual template-flexibility need shows up, rather than guessing upfront.

## Provide/Inject as a Lightweight Dependency Injection Pattern

Chapter 06 covered `provide`/`inject` mechanically. The pattern-level use: a deeply nested component tree (a `<Form>` with many nested `<FormField>`s, none of which are direct children) can share coordination state without prop-drilling it through every intermediate layer:

::code-wrapper{language="javascript" filename="composables/useForm.js"}
```javascript
import { provide, inject, reactive } from 'vue'

const FormContextKey = Symbol('form-context')

export function provideFormContext() {
  const errors = reactive({})

  function registerError(field, message) {
    errors[field] = message
  }

  const context = { errors, registerError }
  provide(FormContextKey, context)
  return context
}

export function useFormContext() {
  const context = inject(FormContextKey)
  if (!context) {
    throw new Error('useFormContext() called without a parent <Form> providing context')
  }
  return context
}
```
::

The `Symbol` key (rather than a plain string like `'form'`) avoids collisions with an unrelated `provide('form', ...)` elsewhere in a large codebase, and the explicit `throw` in `useFormContext` converts a silent `undefined`-context bug (a `<FormField>` mistakenly used outside a `<Form>`) into an immediate, clear error at the point of misuse rather than a confusing failure somewhere downstream when `context.errors` turns out to be undefined.

## Compound Components via Provide/Inject

Combining the above with slots produces a compound-component pattern — several components that only make sense used together, sharing implicit state:

::code-wrapper{language="vue" filename="Tabs.vue"}
```vue
<script setup>
import { ref, provide } from 'vue'

const activeTab = ref(0)
provide('tabs', { activeTab, setActive: (i) => (activeTab.value = i) })
</script>

<template>
  <div class="tabs"><slot /></div>
</template>
```
::

::code-wrapper{language="vue" filename="Tab.vue"}
```vue
<script setup>
import { inject, computed } from 'vue'

const props = defineProps({ index: { type: Number, required: true } })
const { activeTab, setActive } = inject('tabs')
const isActive = computed(() => activeTab.value === props.index)
</script>

<template>
  <button :class="{ active: isActive }" @click="setActive(props.index)">
    <slot />
  </button>
</template>
```
::

::code-wrapper{language="vue"}
```vue
<template>
  <!-- <Tab> never receives activeTab as an explicit prop — it's implicit,
       shared coordination state, exactly the compound-component pattern
       from libraries like Headless UI or React's Radix -->
  <Tabs>
    <Tab :index="0">Overview</Tab>
    <Tab :index="1">Settings</Tab>
    <Tab :index="2">Billing</Tab>
  </Tabs>
</template>
```
::

The tradeoff to state plainly: compound components are ergonomic for the consumer (no prop-drilling, reads naturally as nested markup) but couple `Tab` tightly to being used inside a `Tabs` ancestor — the explicit `inject` failure check from the previous section matters even more here, since `<Tab>` used standalone would otherwise fail confusingly rather than with a clear error message.

## Choosing Between Patterns — A Practical Summary

| Need | Reach for |
|---|---|
| Shared reactive logic, no markup opinions | A composable |
| Shared logic where the consumer controls markup/layout | A renderless component |
| Separating data-fetching from presentation | Container/presentational split, or a composable |
| Deeply nested components needing shared implicit state | `provide`/`inject` |
| Several components that only make sense used together | Compound components (slots + `provide`/`inject`) |

None of these patterns are mutually exclusive in a real codebase — a typical non-trivial feature ends up using several at once: a composable for data fetching, injected into a container component, which passes props down to presentational children, one of which happens to be a compound-component tab set.

## 💡 Tips & Tricks

- **Idiom** — Default new composables to accepting `MaybeRef`-style parameters (via `unref`/`toValue`) from the start — retrofitting this later means auditing every existing call site to confirm they still behave correctly, while designing for it upfront costs almost nothing.
- **Idiom** — Write the composable first for new shared logic; only wrap it in a renderless component once a concrete need for consumer-controlled markup actually appears — this avoids over-engineering markup flexibility that may never be used.
- **Debug** — An explicit `throw` in an `inject`-consuming composable (rather than silently returning `undefined`) turns a confusing "cannot read property of undefined" three function calls later into an immediate, clear error naming the actual misuse.
- **Idiom** — Use a `Symbol` for `provide`/`inject` keys in any library-style or widely-shared code — plain string keys are a real collision risk in a large codebase with multiple teams independently choosing keys like `'context'` or `'state'`.
- **Performance** — A presentational component with no store/router/composable dependencies of its own is also the cheapest kind of component to unit test — favor pushing logic into containers/composables specifically because it makes the resulting presentational layer nearly free to cover with tests.

## ⚠️ Edge Cases & Gotchas

- **A composable that returns a `reactive()` object instead of individual refs silently breaks the moment a caller destructures it** — This is the exact destructuring trap from chapter 03, resurfacing specifically at the composable-authoring boundary — the composable "works" in every manual test where the caller uses `result.x` instead of `const { x } = result`, and only breaks for callers who destructure, which is the overwhelmingly common calling convention in the ecosystem.
- **Forgetting `onUnmounted` cleanup in a composable is invisible in a small app and increasingly severe as the composable is reused more widely** — A single component using a leaky composable might never accumulate enough leaked listeners/intervals to notice; the same composable used in a `v-for`-rendered list, or across many route navigations in an SPA, accumulates leaks proportionally, and the resulting slowdown is easy to misattribute to something else entirely.
- **`inject` without a default value or explicit error check returns `undefined` with no warning when used outside its expected provider** — Vue does not throw automatically; a compound-component child rendered accidentally outside its parent (a common mistake during a refactor) fails downstream, at whatever line first tries to use the injected value, rather than at the actual point of misuse.
- **The container/presentational split can be taken too far, producing a "container" that does nothing but pass every single prop straight through unchanged** — When a container's entire body is fetch-then-forward with no actual coordination logic, a composable called directly from one component is simpler and has one fewer file/layer to navigate — the pattern is a tool for genuine complexity, not a default structure to impose on every component regardless of size.
- **Compound components sharing state via `provide`/`inject` can behave unexpectedly with `v-for`** — Rendering multiple `<Tabs>` instances in a loop each correctly gets its own `provide` scope (provide/inject is per-component-instance, not global), but a common mistake is hoisting the `provide` call to a shared ancestor above the loop, which then makes all looped instances incorrectly share one `activeTab` state instead of having independent state each.

## 🧠 Spot the Bug

A team extracts a `useFetchState` composable meant to be reused across many components for basic loading/error/data state.

::code-wrapper{language="javascript" filename="composables/useFetchState.js"}
```javascript
import { reactive } from 'vue'

export function useFetchState() {
  const state = reactive({
    data: null,
    loading: false,
    error: null
  })

  async function run(fetcher) {
    state.loading = true
    state.error = null
    try {
      state.data = await fetcher()
    } catch (err) {
      state.error = err
    } finally {
      state.loading = false
    }
  }

  return { ...state, run }
}
```
::

A component using it finds that `loading` and `error` never update in its template, even though network requests are clearly succeeding and failing correctly in the Network tab.

<details>
<summary>Answer</summary>

`return { ...state, run }` spreads the `reactive` object's *current* property values into a new plain object at the moment `useFetchState()` is called — `data`, `loading`, and `error` become plain, disconnected snapshots at that instant, not refs or reactive references to the ongoing state. When `run` later mutates the original `state.loading` internally, nothing about the object already destructured and returned to the caller changes — the caller is holding onto stale, frozen values from the moment of the initial call, forever.

::code-wrapper{language="javascript" filename="composables/useFetchState.js"}
```javascript
import { ref } from 'vue'

export function useFetchState() {
  const data = ref(null)
  const loading = ref(false)
  const error = ref(null)

  async function run(fetcher) {
    loading.value = true
    error.value = null
    try {
      data.value = await fetcher()
    } catch (err) {
      error.value = err
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, run }
}
```
::

Returning individual refs means the caller's destructured `const { data, loading, error, run } = useFetchState()` holds live refs, whose `.value` Vue continues to track and update reactively — exactly the "return an object of refs, not a reactive object" convention from the start of this chapter, and exactly why that convention exists.

**The lesson**: `{ ...someReactiveObject }` looks like it forwards reactivity but actually performs a one-time value copy — the spread operator has no special awareness of Vue's reactivity system, so it silently converts every property into a frozen snapshot the instant it runs.

</details>

## Key Takeaways

- Return an object of individual refs from a composable, never a single `reactive` object — destructuring a `reactive` object (directly or via spread) silently disconnects the caller from future updates.
- Always pair setup (event listeners, timers, subscriptions) inside a composable with matching teardown in `onUnmounted` — a missing cleanup leaks proportionally to how widely the composable gets reused.
- Container/presentational splits (or an equivalent composable-based split) isolate "how do we get this data" from "how does it look," making the presentational half trivially reusable and testable — but don't force the split onto components with no real coordination complexity.
- A renderless component and a composable can express identical logic — choose based on whether the consumer needs to control markup structure (renderless component) or just read reactive values (composable); a composable can always be wrapped in a renderless component later.
- Use `Symbol` keys and an explicit error check for `provide`/`inject` in shared/library code — silent `undefined` injection turns a clear misuse into a confusing downstream failure.
- Compound components (slots plus shared `provide`/`inject` state) read ergonomically as nested markup but couple children tightly to their parent — that coupling is a deliberate tradeoff, not a free convenience.
