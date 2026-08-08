# 08 — Lifecycle Hooks

## The Full Lifecycle

Every component instance goes through a predictable sequence of stages — creation, DOM mounting, reactive updates, and eventual unmounting. Vue exposes hooks at each stage so you can run code at exactly the right moment.

| Composition API | Options API | Fires when |
|---|---|---|
| (setup itself) | `beforeCreate` | Before reactive state/props are initialized. |
| (setup itself) | `created` | After reactive state/props exist, before DOM mounting. |
| `onBeforeMount` | `beforeMount` | Right before the component's DOM is inserted. |
| `onMounted` | `mounted` | After the component's DOM is inserted into the document. |
| `onBeforeUpdate` | `beforeUpdate` | Before the DOM re-renders due to a reactive change. |
| `onUpdated` | `updated` | After the DOM has re-rendered. |
| `onBeforeUnmount` | `beforeUnmount` | Right before the component instance is torn down. |
| `onUnmounted` | `unmounted` | After teardown — DOM removed, effects stopped. |
| `onErrorCaptured` | `errorCaptured` | When a descendant component throws. |
| `onActivated` | `activated` | When inside `<KeepAlive>` and shown again (chapter 14). |
| `onDeactivated` | `deactivated` | When inside `<KeepAlive>` and hidden. |

There is no Composition API equivalent for `beforeCreate`/`created` as separate hooks — code in `setup()`/`<script setup>` runs at precisely the point in the lifecycle those two Options API hooks together cover, so it replaces both.

## `onMounted` — the Most-Used Hook

`onMounted` runs after the component's elements exist in the actual DOM — the correct place for anything that needs to measure, focus, or attach to a real DOM node, or for kicking off an initial data fetch:

::code-wrapper{language="vue" filename="Chart.vue"}
```vue
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { createChart } from 'some-charting-library'

const chartContainer = ref(null)
let chartInstance = null

onMounted(() => {
  // chartContainer.value is guaranteed to be a real DOM element here —
  // it would be null if this code ran during setup() instead
  chartInstance = createChart(chartContainer.value, { type: 'line' })
})

onUnmounted(() => {
  chartInstance?.destroy()   // always clean up what you created in onMounted
})
</script>

<template>
  <div ref="chartContainer"></div>
</template>
```
::

## Template Refs — Accessing Real DOM Elements

A template ref gives you direct access to a DOM element or child component instance. Declare a `ref()` with the same name as the `ref` attribute in the template:

::code-wrapper{language="vue" filename="AutoFocusInput.vue"}
```vue
<script setup>
import { ref, onMounted } from 'vue'

const inputEl = ref(null)  // must start as null — it's unpopulated until mount

onMounted(() => {
  inputEl.value.focus()    // populated by the time onMounted runs
})
</script>

<template>
  <input ref="inputEl" type="text" />
</template>
```
::

### Template refs inside `v-for`

::code-wrapper{language="vue" filename="ItemList.vue"}
```vue
<script setup>
import { ref, onMounted } from 'vue'

const items = ref(['Apple', 'Banana', 'Cherry'])
const itemRefs = ref([])   // Vue populates this as an array automatically

onMounted(() => {
  console.log(itemRefs.value.length)     // 3
  itemRefs.value[0].classList.add('first')
})
</script>

<template>
  <li v-for="item in items" :key="item" ref="itemRefs">{{ item }}</li>
</template>
```
::

Binding the same `ref="itemRefs"` string to every element in a `v-for` makes Vue collect them into an array automatically, in render order — no manual pushing required.

### Function refs

::code-wrapper{language="vue"}
```vue
<template>
  <!-- called with the element on mount, and with null on unmount —
       useful for imperative integration without a dedicated ref variable -->
  <div :ref="(el) => console.log('mounted with', el)"></div>
</template>
```
::

## `onUpdated` — Reacting After a Re-render

::code-wrapper{language="vue" filename="ChatWindow.vue"}
```vue
<script setup>
import { ref, onUpdated, nextTick } from 'vue'

const messages = ref([])
const messageList = ref(null)

function addMessage(text) {
  messages.value.push({ id: Date.now(), text })
}

onUpdated(() => {
  // by the time onUpdated fires, the DOM already reflects the new message,
  // so scrollHeight is accurate
  messageList.value.scrollTop = messageList.value.scrollHeight
})
</script>

<template>
  <ul ref="messageList" class="messages">
    <li v-for="msg in messages" :key="msg.id">{{ msg.text }}</li>
  </ul>
</template>
```
::

`onUpdated` fires on **every** re-render of this component, for any reason — it's not scoped to "the message list specifically changed." In components with many independent pieces of reactive state, this can fire far more often than intended; `watch`/`watchEffect` with `{ flush: 'post' }` (chapter 04) is usually a more precise tool when you only care about one specific piece of state's post-update DOM effects.

## `nextTick` — Waiting for the DOM to Catch Up

Vue batches DOM updates — mutating reactive state doesn't update the DOM synchronously, it schedules an update that flushes on the next "tick" of the microtask queue. `nextTick()` returns a promise that resolves after that flush:

::code-wrapper{language="vue"}
```vue
<script setup>
import { ref, nextTick } from 'vue'

const showInput = ref(false)
const inputEl = ref(null)

async function revealAndFocus() {
  showInput.value = true

  // WRONG (commented out): inputEl.value is still null here, because the
  // <input> hasn't been created in the DOM yet — the v-if update is
  // scheduled but not yet flushed
  // inputEl.value.focus()

  // RIGHT — wait for Vue's pending DOM update to flush first
  await nextTick()
  inputEl.value.focus()
}
</script>

<template>
  <button @click="revealAndFocus">Add a note</button>
  <input v-if="showInput" ref="inputEl" />
</template>
```
::

This is one of the most common real bugs in Vue code — toggling a `v-if` and immediately trying to interact with the element it reveals, in the same synchronous block, before Vue has actually patched the DOM.

## `onBeforeUnmount` / `onUnmounted` — Cleanup

Anything registered in `onMounted` that outlives the component (event listeners, intervals, subscriptions, WebSocket connections) must be explicitly torn down, or it leaks:

::code-wrapper{language="vue" filename="LiveClock.vue"}
```vue
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const now = ref(new Date())
let intervalId = null

onMounted(() => {
  intervalId = setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onUnmounted(() => {
  clearInterval(intervalId)   // without this, the interval keeps firing
                               // and holding a reference to `now` (and this
                               // component's closure) forever
})
</script>

<template>
  <p>{{ now.toLocaleTimeString() }}</p>
</template>
```
::

`onBeforeUnmount` differs from `onUnmounted` only in timing relative to the actual teardown — `onBeforeUnmount` runs while the component is still fully functional (DOM present, reactive state intact), `onUnmounted` runs after everything is torn down. Cleanup that doesn't depend on the component still being "alive" — like the `clearInterval` above — commonly goes in `onUnmounted`; anything that needs one last read of live component state before teardown goes in `onBeforeUnmount`.

## `onErrorCaptured` — Component-Level Error Boundaries

::code-wrapper{language="vue" filename="ErrorBoundary.vue"}
```vue
<script setup>
import { ref, onErrorCaptured } from 'vue'

const error = ref(null)

onErrorCaptured((err, instance, info) => {
  error.value = err
  console.error('Caught by boundary:', info, err)
  return false   // returning false stops the error from propagating further up
})
</script>

<template>
  <div v-if="error" class="error-fallback">
    Something went wrong. <button @click="error = null">Retry</button>
  </div>
  <slot v-else />
</template>
```
::

Wrapping fragile third-party-dependent parts of a page in a component like this prevents one failing widget from crashing the entire application — a real production pattern, not just a toy example.

## Options API: the Full Sequence

::code-wrapper{language="vue"}
```vue
<script>
export default {
  data() {
    return { count: 0 }
  },
  beforeCreate() {
    // `this.count` is NOT yet available here
  },
  created() {
    // `this.count` IS available; DOM is NOT yet mounted (no $refs)
  },
  beforeMount() {
    // template compiled, about to mount
  },
  mounted() {
    // this.$refs.someEl now points at a real DOM element
  },
  beforeUpdate() {
    // reactive change detected, DOM not yet patched
  },
  updated() {
    // DOM patched to reflect the latest state
  },
  beforeUnmount() {
    // instance still fully functional
  },
  unmounted() {
    // torn down — timers/listeners should already be cleared by now
  }
}
</script>
```
::

## Which Hook Runs First — Parent or Child?

Mounting is child-first (children finish mounting before their parent's `mounted` fires, since the parent isn't "fully mounted" until its children are); unmounting is also child-first — a parent's `beforeUnmount` runs, then it tears down children (their `beforeUnmount`/`unmounted` run), then the parent's own `unmounted` fires:

::code-wrapper{language="javascript"}
```javascript
// Order for a Parent containing a Child, on initial mount:
// Parent setup() → Child setup() → Child onMounted → Parent onMounted

// Order for the same tree, on unmount:
// Parent onBeforeUnmount → Child onBeforeUnmount → Child onUnmounted → Parent onUnmounted
```
::

This ordering matters when a parent's `onMounted` logic assumes a child has already finished its own setup (it has), or when a parent's cleanup logic needs to happen before or after a child's (choose `beforeUnmount` vs `unmounted` accordingly).

## 💡 Tips & Tricks

- **Debug** — If a template ref is `null` inside `onMounted`, double check it isn't behind a `v-if` that's currently false — Vue only populates a template ref once the element it's attached to actually exists in the DOM; a ref on a conditionally-rendered element needs a `watch` on the condition plus `nextTick`, not a one-time `onMounted` read.
- **Idiom** — Register cleanup (`onUnmounted`) immediately next to the setup code it corresponds to (`onMounted`) rather than at the bottom of the file — keeping matched setup/teardown pairs visually adjacent makes it much easier to spot a forgotten cleanup during review.
- **Performance** — `onUpdated` fires on every re-render for any reason; if you only care about one specific value changing, a targeted `watch(specificRef, callback, { flush: 'post' })` avoids running your callback on unrelated updates.
- **Idiom** — Composables that need to run cleanup logic can call `onUnmounted` internally, exactly like a component can — this is how composables like `useEventListener` or `useFetch` (chapter 07) automatically detach listeners/abort requests when the consuming component unmounts, with zero effort from whoever calls them.
- **Debug** — `onErrorCaptured` only catches errors from **descendant** components, not errors thrown in the component that defines the hook itself, and not errors from event handlers (those need a plain `try`/`catch` or a global `app.config.errorHandler`).

## ⚠️ Edge Cases & Gotchas

- **Reading a template ref before `onMounted` gets `null`** — Template refs are populated only after the DOM they point to exists; reading `someRef.value` at the top level of `<script setup>` (outside any hook) always gets `null`, because that code runs before mounting.
- **Toggling `v-if` and immediately using the revealed element in the same function is a race, not a guarantee** — Vue batches DOM updates asynchronously; code immediately after setting a ref to `true` runs before the DOM has actually updated, unless you `await nextTick()` first.
- **Forgetting cleanup in `onUnmounted` doesn't crash anything — it just leaks silently** — A forgotten `clearInterval`/`removeEventListener` doesn't throw an error; it just keeps running in the background, holding references to a component instance that should have been garbage collected, and can accumulate into a real memory/performance problem in long-lived SPAs with many mount/unmount cycles (e.g., a router-driven app where users navigate back and forth frequently).
- **`<KeepAlive>`-wrapped components don't actually unmount on "hide"** — A component inside `<KeepAlive>` (chapter 14) fires `onDeactivated` instead of `onUnmounted` when hidden, and `onActivated` instead of `onMounted` when shown again after being cached — code that assumes `onMounted` only ever runs once per component lifetime breaks under `<KeepAlive>`, since it can be "mounted" once but activated/deactivated many times.
- **`onErrorCaptured` swallows the error tree-wide unless you explicitly return `false` — but also unless you don't, it still propagates further up by default** — Returning `false` stops propagation to ancestor error boundaries and the global handler; returning nothing (`undefined`) lets the error continue bubbling upward even though you already "handled" it locally, which surprises people expecting handling to be implicitly terminal.

## 🧠 Spot the Bug

A modal auto-focuses its first input when opened. It works the first time, but never again after the modal is closed and reopened.

::code-wrapper{language="vue" filename="Modal.vue"}
```vue
<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({ open: Boolean })
const firstInput = ref(null)

onMounted(() => {
  if (props.open) {
    firstInput.value?.focus()
  }
})
</script>

<template>
  <div v-if="open" class="modal">
    <input ref="firstInput" />
  </div>
</template>
```
::

<details>
<summary>Answer</summary>

`onMounted` fires exactly once, the first time this component instance is mounted — it does not re-run every time `open` flips from `false` to `true` later, because the `v-if="open"` is on the *inner* `<div>`, and the outer `Modal` component instance itself is presumably kept alive by its parent (never actually unmounted/remounted) while `open` toggles. So the auto-focus logic only ever runs once, on the very first mount, and never again on subsequent opens.

The fix is to react to `open` changing, not to the component mounting:

::code-wrapper{language="vue" filename="Modal.vue"}
```vue
<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({ open: Boolean })
const firstInput = ref(null)

watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    await nextTick()          // wait for the v-if to actually render the input
    firstInput.value?.focus()
  }
})
</script>
```
::

**The lesson**: `onMounted` only ever fires once per component instance — for behavior that should re-run every time a *prop* changes (not every time the component is created), reach for `watch` on that prop instead, and remember to `await nextTick()` if the thing you're interacting with is behind its own `v-if`.

</details>

## Key Takeaways

- `setup()`/`<script setup>` code runs at the point covering both `beforeCreate` and `created`; there's no separate Composition API hook for either.
- `onMounted` is the right place for DOM measurement, focus, third-party library initialization, and template refs — they're `null` before this point.
- `nextTick()` resolves after Vue's batched DOM update flushes — necessary whenever you toggle reactive state and immediately need to interact with the DOM it affects.
- Every `onMounted`/setup-time subscription (listeners, intervals, WebSockets) needs a matching `onUnmounted` teardown, or it leaks.
- Mounting order is child-before-parent; unmounting order is parent-before-child (for `beforeUnmount`), then child-before-parent for the final `unmounted`.
- `<KeepAlive>`-wrapped components use `onActivated`/`onDeactivated` instead of repeated `onMounted`/`onUnmounted` cycles — code assuming one-mount-per-lifetime breaks under `<KeepAlive>`.
