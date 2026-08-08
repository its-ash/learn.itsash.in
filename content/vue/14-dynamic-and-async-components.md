# 14 — Dynamic & Async Components

## `<component :is>` — Switching Components at Runtime

::code-wrapper{language="vue" filename="TabbedPanel.vue"}
```vue
<script setup>
import { ref, shallowRef } from 'vue'
import GeneralTab from './GeneralTab.vue'
import SecurityTab from './SecurityTab.vue'
import BillingTab from './BillingTab.vue'

const tabs = { general: GeneralTab, security: SecurityTab, billing: BillingTab }

// shallowRef, not ref — the component definition itself never needs deep
// reactivity; ref() would pointlessly try to make the component object reactive
const activeTab = shallowRef(GeneralTab)
</script>

<template>
  <nav>
    <button v-for="(comp, name) in tabs" :key="name" @click="activeTab = comp">
      {{ name }}
    </button>
  </nav>
  <component :is="activeTab" />
</template>
```
::

`:is` also accepts a plain string naming a globally registered component, or even a native HTML tag (`<component is="h1">` renders a real `<h1>`) — useful for a heading component whose tag level is controlled by a prop:

::code-wrapper{language="vue" filename="Heading.vue"}
```vue
<script setup>
const props = defineProps({ level: { type: Number, default: 1 } })
</script>

<template>
  <component :is="`h${level}`"><slot /></component>
</template>
```
::

## `defineAsyncComponent` — Code-Splitting at the Component Level

::code-wrapper{language="javascript"}
```javascript
import { defineAsyncComponent } from 'vue'

const HeavyChart = defineAsyncComponent(() => import('./HeavyChart.vue'))
```
::

This produces exactly the same chunking benefit as a lazy-loaded route (chapter 11), but at component granularity — appropriate for something expensive that isn't always visible on a given route, like a rarely-opened settings modal or a chart library loaded only once a user actually requests a report.

### With loading, error, delay, and timeout options

::code-wrapper{language="javascript" filename="components/AsyncChart.js"}
```javascript
import { defineAsyncComponent } from 'vue'
import LoadingSpinner from './LoadingSpinner.vue'
import LoadError from './LoadError.vue'

export const AsyncChart = defineAsyncComponent({
  loader: () => import('./HeavyChart.vue'),
  loadingComponent: LoadingSpinner,
  // only show the spinner if loading takes longer than this — avoids a
  // distracting flash of a spinner for chunks that load in a few ms
  delay: 200,
  errorComponent: LoadError,
  // if the import doesn't resolve within this window, show errorComponent
  timeout: 10000,
  onError(error, retry, fail, attempts) {
    if (attempts <= 3) {
      retry()   // transient network blip — try again automatically
    } else {
      fail()    // give up and render errorComponent
    }
  }
})
```
::

Without a `delay`, a fast connection loading a small chunk in 30ms still shows the loading component for at least one paint frame, producing a visible flicker — the `delay` option is a small but genuinely noticeable UX improvement, not a micro-optimization.

## `<KeepAlive>` — Preserving Component State Across Toggles

Without `<KeepAlive>`, switching away from a component (via `v-if` or `<component :is>`) fully unmounts it — any local state (scroll position, an unsaved draft, form input) is lost the moment it's switched away from and recreated fresh next time:

::code-wrapper{language="vue" filename="TabbedPanel.vue"}
```vue
<template>
  <KeepAlive>
    <component :is="activeTab" />
  </KeepAlive>
</template>
```
::

::code-wrapper{language="vue" filename="EditorTab.vue"}
```vue
<script setup>
import { ref, onActivated, onDeactivated } from 'vue'

const draft = ref('')   // preserved across tab switches thanks to KeepAlive

onActivated(() => {
  console.log('editor tab shown again — state was preserved')
})

onDeactivated(() => {
  console.log('editor tab hidden — instance kept alive in memory, not destroyed')
})
</script>
```
::

As chapter 08 covered, a `<KeepAlive>`-wrapped component fires `onActivated`/`onDeactivated` on every show/hide instead of repeated `onMounted`/`onUnmounted` cycles — code that assumes "mounted" happens once per visible instance breaks under `<KeepAlive>`, since a component can be constructed once but activated/deactivated many times over its actual lifetime in the DOM.

### `include` / `exclude` / `max`

::code-wrapper{language="vue"}
```vue
<template>
  <!-- only cache components whose `name` option matches -->
  <KeepAlive include="GeneralTab,SecurityTab" :max="5">
    <component :is="activeTab" />
  </KeepAlive>
</template>
```
::

`include`/`exclude` match against a component's registered `name` (set via `defineOptions({ name: '...' })` in `<script setup>` — chapter 07) — a component with no explicit name can't be matched by string, which is a common reason `include` silently fails to cache anything. `max` caps how many inactive instances stay cached; once exceeded, the least-recently-used one is actually destroyed (firing its real `onUnmounted`, not `onDeactivated`) to make room.

## Transitions — Animating Enter/Leave

`<Transition>` wraps a single element/component and automatically applies CSS classes at each phase of entering or leaving:

::code-wrapper{language="vue" filename="Notification.vue"}
```vue
<script setup>
import { ref } from 'vue'

const visible = ref(false)
</script>

<template>
  <button @click="visible = !visible">Toggle</button>

  <Transition name="fade">
    <p v-if="visible" class="notice">Saved successfully.</p>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
```
::

The six CSS classes Vue applies and removes automatically, named from the `name` prop: `fade-enter-from` → `fade-enter-active` → (removed once the transition ends), and `fade-leave-from` → `fade-leave-active` → `fade-leave-to` on the way out. Only `-active` classes should define the actual `transition`/`animation` property; `-from`/`-to` define the start/end state being interpolated between.

### Transitioning between two elements

::code-wrapper{language="vue" filename="LikeButton.vue"}
```vue
<script setup>
import { ref } from 'vue'

const liked = ref(false)
</script>

<template>
  <Transition name="fade" mode="out-in">
    <button v-if="!liked" key="unliked" @click="liked = true">🤍 Like</button>
    <button v-else key="liked" @click="liked = false">❤️ Liked</button>
  </Transition>
</template>
```
::

`mode="out-in"` waits for the leaving element to finish before the entering one starts (the default, no `mode`, runs both simultaneously, which usually looks wrong for a swap like this — the two elements overlap mid-transition). A `:key` on each branch is required so Vue treats them as genuinely different elements to transition between, not the same `<button>` being patched in place.

## `<TransitionGroup>` — Animating Lists

::code-wrapper{language="vue" filename="TodoList.vue"}
```vue
<script setup>
import { ref } from 'vue'

const todos = ref([
  { id: 1, text: 'Learn Vue' },
  { id: 2, text: 'Build something' }
])

function remove(id) {
  todos.value = todos.value.filter((t) => t.id !== id)
}
</script>

<template>
  <TransitionGroup name="list" tag="ul">
    <li v-for="todo in todos" :key="todo.id">
      {{ todo.text }}
      <button @click="remove(todo.id)">✕</button>
    </li>
  </TransitionGroup>
</template>

<style scoped>
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
/* required for a smooth REORDER animation when items move without
   entering or leaving at all */
.list-move {
  transition: transform 0.3s ease;
}
/* removed items must be taken out of layout flow during their leave
   transition, or remaining items can't smoothly slide into the gap */
.list-leave-active {
  position: absolute;
}
</style>
```
::

Unlike `<Transition>`, `<TransitionGroup>` requires every child to have a `:key` (it's rendering a real `v-for` list) and renders a real wrapper element (`tag="ul"` here) by default rather than being a no-op wrapper — omitting `tag` renders a `<span>`,  usually not what's wanted around a list of `<li>`s.

## Options API Equivalent

::code-wrapper{language="vue"}
```vue
<script>
import GeneralTab from './GeneralTab.vue'
import SecurityTab from './SecurityTab.vue'

export default {
  components: { GeneralTab, SecurityTab },
  data() {
    return { activeTab: 'GeneralTab' }
  }
}
</script>

<template>
  <KeepAlive>
    <component :is="activeTab" />
  </KeepAlive>
</template>
```
::

## 💡 Tips & Tricks

- **Performance** — Use `shallowRef`, not `ref`, when a variable holds a component definition (as with `activeTab` above) — the component object has no reactive internals that benefit from deep reactivity, and `ref` would recursively (and pointlessly) attempt to proxy it.
- **Idiom** — Give every component a `name` via `defineOptions` specifically so `<KeepAlive>`'s `include`/`exclude` can target it by string — an anonymous `<script setup>` component (the default, no explicit name) can't be matched this way, and the omission is a common, silent cause of "include isn't working."
- **Idiom** — Always give `defineAsyncComponent` a `delay` (100–300ms is typical) before its loading component appears — showing a spinner for chunks that resolve near-instantly on a fast connection is a bigger UX regression than a very brief unstyled flash would be.
- **Debug** — When a `<Transition>` doesn't seem to animate at all, check for a missing `:key` on the swapped branches (Vue may be patching the same element in place rather than transitioning between two different ones) before assuming the CSS itself is wrong.
- **Idiom** — `<TransitionGroup>`'s `.list-move` class (for the FLIP-style reorder animation) and `position: absolute` on `.list-leave-active` are easy to forget and both needed together for a smooth "item removed, others slide up" list animation — treat them as a matched pair, not optional extras.

## ⚠️ Edge Cases & Gotchas

- **`<KeepAlive>`-wrapped components fire `onActivated`/`onDeactivated`, not repeated `onMounted`/`onUnmounted`** — Data-fetching logic placed in `onMounted` runs exactly once for the component's entire cached lifetime, even as a user switches away and back many times — anything that should refresh on each reveal belongs in `onActivated` instead.
- **`include`/`exclude` match by component `name`, and an unnamed `<script setup>` component can't be matched** — This produces no error and no warning — the component is just never cached, and the resulting bug ("KeepAlive doesn't seem to be doing anything for this one component") is easy to misattribute to `<KeepAlive>` itself rather than the missing `name`.
- **`<TransitionGroup>` renders a real wrapper element by default (a `<span>` unless `tag` is set) — `<Transition>` renders none** — Reaching for `<Transition>` around a list (instead of `<TransitionGroup>`) produces no per-item enter/leave animation at all, since `<Transition>` only ever animates a single root node transitioning to another single root node, not independent items in a list.
- **Two branches inside `<Transition>` without distinct `:key`s can get patched in place instead of transitioned between** — If both `v-if`/`v-else` branches happen to be the same element type Vue may reuse the DOM node rather than treating it as an enter/leave pair — always add explicit, distinct `:key`s to force the transition Vue intends.
- **`defineAsyncComponent`'s `onError` retry logic can retry forever if the `attempts <= N` check is written incorrectly, or never retry at all if it's inverted** — Since `onError` gives you full manual control (`retry()`/`fail()`), a boundary-condition mistake here silently changes from "reasonable exponential-style retry" to "infinite retry loop hammering a broken endpoint" with no framework-level safety net protecting against that mistake.

## 🧠 Spot the Bug

Switching between two settings tabs is supposed to preserve each tab's unsaved form state, but the second tab's input always starts blank again after switching away and back.

::code-wrapper{language="vue" filename="SettingsPanel.vue"}
```vue
<script setup>
import { shallowRef } from 'vue'
import GeneralTab from './GeneralTab.vue'
import SecurityTab from './SecurityTab.vue'

const activeTab = shallowRef(GeneralTab)
</script>

<template>
  <button @click="activeTab = GeneralTab">General</button>
  <button @click="activeTab = SecurityTab">Security</button>

  <component :is="activeTab" />
</template>
```
::

<details>
<summary>Answer</summary>

There is no `<KeepAlive>` wrapping `<component :is="activeTab" />` at all — every tab switch fully unmounts the outgoing component and mounts a brand-new instance of the incoming one, discarding all of its local state (including any unsaved form input) each time, exactly as if `<KeepAlive>` had never been part of the picture. The fix has nothing to do with `SecurityTab` specifically — the same loss happens for *both* tabs, it's just more noticeable on whichever tab has visible unsaved input.

::code-wrapper{language="vue" filename="SettingsPanel.vue"}
```vue
<template>
  <button @click="activeTab = GeneralTab">General</button>
  <button @click="activeTab = SecurityTab">Security</button>

  <KeepAlive>
    <component :is="activeTab" />
  </KeepAlive>
</template>
```
::

**The lesson**: `<component :is>` on its own has no memory — every switch is a full unmount/remount cycle. State preservation across a dynamic-component switch is `<KeepAlive>`'s entire purpose, and it's opt-in, not a default behavior of `<component :is>`.

</details>

## Key Takeaways

- `:is` accepts a component object, a globally registered name string, or a native HTML tag name, letting a single template slot render entirely different content at runtime.
- `defineAsyncComponent` code-splits at the component level; pair it with `delay`/`timeout`/`errorComponent` for a production-quality loading experience, not just the bare loader function.
- `<KeepAlive>` preserves component instance state across dynamic-component or `v-if` switches, but changes the lifecycle contract — `onActivated`/`onDeactivated` replace repeated `onMounted`/`onUnmounted`.
- `include`/`exclude` on `<KeepAlive>` match a component's `name` option — an unnamed component silently can't be targeted.
- `<Transition>` animates a single element/component swap (needs distinct `:key`s on each branch); `<TransitionGroup>` animates list enter/leave/reorder and renders a real wrapper tag.
- A smooth list reorder animation needs `.list-move` plus `position: absolute` on the leaving class — both together, not either alone.
