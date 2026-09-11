---
title: Vue 3 Engineering Reference — Components Basics
description: SFC compilation pipeline, defineProps/defineEmits/defineExpose macros, prop validation, single-root vs fragment attr fallthrough, async component registration, and component v-model contracts.
---

# 05 — Components Basics

## SFC Compilation — script setup Macros

::code-wrapper{language="vue" filename="UserProfile.vue"}
```vue
<script setup lang="ts">
// ── defineProps, defineEmits, defineExpose are COMPILER MACROS ──
// They look like functions but are resolved at BUILD time by the Vue SFC compiler.
// No runtime import needed — they're not real functions, they're compiler directives.
// The compiler transforms them into setup() return values.

// ── 1. defineProps — typed props via generic ──
const props = defineProps<{
  userId: number
  role?: 'admin' | 'user' | 'guest'  // optional union
  tags?: string[]
}>()

// ── withDefaults: provide defaults for optional props (TS-only) ──
// Required because TS interface defaults don't exist at runtime.
const { role = 'user', tags = [] } = withDefaults(props, {
  role: 'user',
  tags: () => [],  // factory function for non-primitive defaults (fresh per instance)
})

// ── 2. defineEmits — typed events ──
const emit = defineEmits<{
  (e: 'update', userId: number): void           // named event with payload
  (e: 'delete', payload: { id: number; soft: boolean }): void
  (e: 'cancel'): void                            // event with no payload
}>()

// ── 3. defineExpose — explicitly expose internals to parent via template refs ──
// <script setup> components are CLOSED by default — parent ref only gets the DOM.
// defineExpose opens a controlled API surface.
function save() { /* ... */ }
function reset() { /* ... */ }
defineExpose({ save, reset })
// Parent: const childRef = ref(); childRef.value?.save()
</script>

<template>
  <div>
    <p>User: {{ userId }}</p>
    <p>Role: {{ role }}</p>
    <button @click="emit('update', userId)">Update</button>
  </div>
</template>
```
::

## Prop Validation and Default Factories

::code-wrapper{language="javascript" filename="prop-validation.js"}
```javascript
// ── Runtime prop validation (Options API style, still works in <script setup>) ──
// Use when you need runtime validation (not just TS types).
const props = defineProps({
  // type: constructor — Vue checks instanceof at runtime
  userId: Number,                    // must be a number

  // type + required + default
  role: {
    type: String,
    required: false,
    default: 'user',
    // validator runs AFTER type check; receives the raw value (not default)
    validator: (v) => ['admin', 'user', 'guest'].includes(v),
  },

  // ── Object/array defaults MUST be factory functions ──
  // ❌ WRONG: default: [] — shared by reference across all instances (like data() bug)
  // ✅ CORRECT: factory returns a fresh copy per instance
  tags: {
    type: Array,
    default: () => [],               // fresh array per instance
  },

  config: {
    type: Object,
    default: () => ({ theme: 'dark', lang: 'en' }),  // fresh object per instance
  },

  // ── Multiple types: type can be an array of constructors ──
  id: [Number, String],              // accepts 42 or "42"

  // ── Boolean has special casting rules ──
  disabled: Boolean,
  // <MyComp disabled />         → true (attribute present)
  // <MyComp :disabled="false" /> → false (explicit binding)
  // <MyComp />                  → false (absent, uses default if set)
})
```
::

## Attribute Fallthrough — $attrs on Fragments

::code-wrapper{language="vue" filename="Fallthrough.vue"}
```vue
<script setup>
// ── $attrs: non-prop attributes passed from parent ──
// Includes: class, style, id, data-*, aria-*, custom attributes
// Excludes: props declared in defineProps, emits declared in defineEmits

// ── Single root node: $attrs auto-applied to the root element ──
</script>

<template>
  <!-- Parent: <MyInput class="big" data-test="email" placeholder="Email" />
       If `placeholder` is NOT a declared prop, it lands in $attrs.
       Vue auto-applies $attrs to this <input> (the single root). -->
  <input class="base-input" />
  <!-- Result: <input class="base-input big" data-test="email" placeholder="Email" /> -->
</template>
```

::code-wrapper{language="vue" filename="FragmentFallthrough.vue"}
```vue
<script setup>
import { useAttrs } from 'vue'
const attrs = useAttrs()  // access $attrs in script (equivalent to $attrs in template)
</script>

<template>
  <!-- ── Fragment (multiple roots): $attrs does NOT auto-apply ── -->
  <!-- Vue can't know which root to put attrs on → must bind manually -->
  <div class="wrapper">
    <label>{{ attrs.label || 'Input' }}</label>
    <!-- Explicitly forward $attrs to the input -->
    <input v-bind="$attrs" class="base-input" />
  </div>

  <!-- ── Disable inheritance entirely with inheritAttrs: false ── -->
  <!-- Useful when you want full control over where attrs go -->
</template>
```

::code-wrapper{language="vue" filename="NoInherit.vue"}
```vue
<script setup>
// ── inheritAttrs: false — disable auto-fallthrough ──
// $attrs still exists in the object, just not auto-applied to root.
defineOptions({ inheritAttrs: false })
// Now the parent's class/style/data-* go NOWHERE unless you bind $attrs explicitly.
// Useful: wrapper components that split attrs across multiple children.
</script>

<template>
  <div class="outer">
    <input v-bind="$attrs" />  <!-- only the input gets parent attrs -->
    <span class="hint">{{ $attrs.hint }}</span>  <!-- read individual attr -->
  </div>
</template>
```
::

## Dynamic Components — :is with KeepAlive Caching

::code-wrapper{language="vue" filename="DynamicTabs.vue"}
```vue
<script setup>
import { ref, shallowRef, markRaw, defineAsyncComponent } from 'vue'
import Overview from './Overview.vue'
import Settings from './Settings.vue'

// ── shallowRef for component refs — avoid deep reactivity on component objects ──
// Components are complex objects with internal state — reactive() wrapping them
// is wasteful and can break internal Vue mechanisms. Use shallowRef or markRaw.
const tabs = shallowRef({
  overview: markRaw(Overview),
  settings: markRaw(Settings),
  // ── Async component: loaded on demand, code-split into separate chunk ──
  reports: defineAsyncComponent(() => import('./Reports.vue')),
})

const activeTab = ref('overview')
</script>

<template>
  <!-- :is binds to a component definition (object, string name, or async) -->
  <!-- KeepAlive caches the component instance when it's toggled out →
       state (form inputs, scroll position) preserved on return -->
  <KeepAlive :max="3">
    <component :is="tabs[activeTab]" />
  </KeepAlive>
  <!-- :max="3": LRU cache — keeps last 3 instances, destroys older ones -->

  <button v-for="(comp, name) in tabs" :key="name" @click="activeTab = name">
    {{ name }}
  </button>
</template>
```
::

## Component v-model — The Contract

::code-wrapper{language="vue" filename="CustomInput.vue"}
```vue
<script setup>
// ── v-model on a component expands to: ──
//   :modelValue="value" @update:modelValue="value = $event"
// Vue 3 renamed: value→modelValue, input→update:modelValue (breaking from Vue 2)

defineProps<{
  modelValue: string  // the bound value
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void  // must emit this to update
}>()

function onInput(e) {
  emit('update:modelValue', e.target.value)  // notify parent of new value
}
</script>

<template>
  <input :value="modelValue" @input="onInput" />
</template>
```

::code-wrapper{language="vue" filename="MultiVModel.vue"}
```vue
<script setup>
// ── Multiple v-models on one component ──
// Parent: <UserForm v-model:firstName="fn" v-model:lastName="ln" />
defineProps<{
  firstName: string
  lastName: string
}>()
const emit = defineEmits(['update:firstName', 'update:lastName'])
</script>

<template>
  <input :value="firstName" @input="emit('update:firstName', $event.target.value)" />
  <input :value="lastName" @input="emit('update:lastName', $event.target.value)" />
</template>
```
::

## 💡 Tips & Tricks

::code-wrapper{language="vue" filename="TipsTricks.vue"}
```vue
<script setup>
import { ref, useTemplateRef, defineAsyncComponent } from 'vue'

// ── 1. useTemplateRef (3.5+) — typed template ref without ref(null) boilerplate ──
const inputEl = useTemplateRef<HTMLInputElement>('inputEl')
// Template: <input ref="inputEl" /> — inputEl.value is HTMLInputElement | null

// ── 2. Async component with loading/error states ──
const AsyncChart = defineAsyncComponent({
  loader: () => import('./Chart.vue'),
  loadingComponent: LoadingSpinner,
  errorComponent: ErrorDisplay,
  delay: 200,       // show loading after 200ms (avoid flicker for fast loads)
  timeout: 8000,    // show error after 8s
  // suspensible: true → works with <Suspense> (defer to nearest boundary)
})

// ── 3. defineOptions — set Options API options inside script setup ──
defineOptions({
  name: 'UserCard',        // named for DevTools + keep-alive include/exclude
  inheritAttrs: false,
})

// ── 4. defineModel (3.4+) — declarative v-model without boilerplate ──
const model = defineModel<string>()  // auto-creates modelValue prop + emit
// <input v-model="model" /> — writes go through the parent binding automatically
</script>
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. Object/array prop defaults must be factory functions ──
// default: [] or default: {} → shared across ALL instances (reference bug)
// default: () => [] or () => ({}) → fresh copy per instance (correct)

// ── 2. Boolean prop casting — empty string is NOT false ──
// <Comp disabled />    → disabled = true (attribute present = true)
// <Comp disabled="" /> → disabled = true (empty string still means present)
// <Comp :disabled="false" /> → disabled = false (explicit boolean binding)

// ── 3. defineProps is a compile-time macro — can't be inside functions ──
// ❌ function setup() { const props = defineProps() } — only works in <script setup> top level
// ✅ const props = defineProps() — must be top-level in <script setup>

// ── 4. defineExpose is opt-in — <script setup> is closed by default ──
// Parent template refs on a <script setup> child get null for everything
// unless the child calls defineExpose(). Options API exposes all data/methods.

// ── 5. Async components need shallowRef/markRaw, not reactive ──
// reactive() on a component definition breaks internal Vue compilation caches.
// Store component refs in shallowRef or markRaw them before assignment.

// ── 6. Prop type checks are dev-only — stripped in production ──
// defineProps<{ x: number }>() → pure TS, zero runtime check in prod.
// defineProps({ x: Number }) → runtime instanceof check, dev warning only.
// Always validate at the boundary if type safety is critical in production.
```
::

## 🧠 Spot the Bug

A custom checkbox component always shows the same checked state across all instances.

::code-wrapper{language="vue" filename="CheckboxBug.vue"}
```vue
<script setup>
defineProps({
  checked: {
    type: Array,
    default: [],  // ← shared reference across all instances
  },
})
const emit = defineEmits(['update:checked'])
</script>

<template>
  <input type="checkbox" :checked="checked.includes('x')" />
</template>
```
::

<details>
<summary>Answer</summary>

`default: []` creates one array at module evaluation time and shares it across every component instance that uses the default. When one instance pushes to it, all others see the mutation.

**Fix** — use a factory function:

::code-wrapper{language="javascript" filename="checkbox-fix.js"}
```javascript
defineProps({
  checked: {
    type: Array,
    default: () => [],  // fresh array per instance — no shared reference
  },
})
```
::

**The lesson**: object/array prop defaults must be factory functions returning a fresh copy. Static defaults share one reference across all instances, causing cross-instance state leaks identical to the Vue 2 `data: {}` bug.

</details>