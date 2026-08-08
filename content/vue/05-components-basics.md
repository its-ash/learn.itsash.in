# 05 — Components Basics

## What Is a Component?

A component is a self-contained, reusable piece of UI — its own template, its own logic, optionally its own styles — that can be composed with other components to build an application. Every `.vue` file is a component. Components can be nested arbitrarily deep, and Vue re-renders only the parts of the tree affected by a given state change.

## Defining and Registering a Component

::code-wrapper{language="vue" filename="LikeButton.vue"}
```vue
<script setup>
import { ref } from 'vue'

const liked = ref(false)

function toggle() {
  liked.value = !liked.value
}
</script>

<template>
  <button @click="toggle" :class="{ liked }">
    {{ liked ? '♥ Liked' : '♡ Like' }}
  </button>
</template>

<style scoped>
.liked { color: crimson; }
</style>
```
::

### Using it in a parent

::code-wrapper{language="vue" filename="ArticleCard.vue"}
```vue
<script setup>
// With <script setup> + SFC + build tooling, importing a component
// automatically registers it — no explicit `components: {}` needed
import LikeButton from './LikeButton.vue'
</script>

<template>
  <article>
    <h2>Understanding Vue Reactivity</h2>
    <LikeButton />
  </article>
</template>
```
::

### Options API registration, for comparison

::code-wrapper{language="vue" filename="ArticleCard.vue"}
```vue
<script>
import LikeButton from './LikeButton.vue'

export default {
  components: { LikeButton },
  data() {
    return {}
  }
}
</script>

<template>
  <article>
    <h2>Understanding Vue Reactivity</h2>
    <LikeButton />
  </article>
</template>
```
::

`<script setup>` is compiler sugar that eliminates this boilerplate — every top-level `import`, variable, and function is automatically exposed to the template, and imported components are automatically registered, which is a large part of why it has become the default way to author SFCs.

## Props — Passing Data Down

### Declaring props with `defineProps`

::code-wrapper{language="vue" filename="UserCard.vue"}
```vue
<script setup>
// array shorthand — names only, no validation
// const props = defineProps(['name', 'role'])

// object syntax — types and validation, strongly preferred in real code
const props = defineProps({
  name: {
    type: String,
    required: true
  },
  role: {
    type: String,
    default: 'member',
    validator: (value) => ['member', 'admin', 'owner'].includes(value)
  },
  avatarUrl: {
    type: String,
    default: null
  },
  tags: {
    type: Array,
    default: () => []      // factory function required for object/array defaults
  }
})
</script>

<template>
  <div class="card">
    <img v-if="avatarUrl" :src="avatarUrl" :alt="name" />
    <h3>{{ name }}</h3>
    <span class="badge">{{ role }}</span>
    <ul>
      <li v-for="tag in tags" :key="tag">{{ tag }}</li>
    </ul>
  </div>
</template>
```
::

Passing it from a parent:

::code-wrapper{language="vue"}
```vue
<template>
  <UserCard
    name="Ada Lovelace"
    role="admin"
    :avatar-url="user.avatar"
    :tags="['founder', 'engineer']"
  />
</template>
```
::

Note the naming convention: props are declared in `camelCase` (`avatarUrl`) in JavaScript, but written in `kebab-case` (`avatar-url`) as HTML attributes when passed — HTML attribute names are case-insensitive, so Vue's template compiler handles this translation for you automatically in both directions.

### Why default object/array values need a factory function

::code-wrapper{language="javascript"}
```javascript
defineProps({
  // WRONG (would throw a compiler/runtime warning) — a single shared
  // array/object literal would be reused as the default across every
  // instance that doesn't pass this prop, exactly like the data() footgun
  // tags: { type: Array, default: [] },

  // RIGHT — a factory function returns a fresh array for every instance
  tags: { type: Array, default: () => [] },
  settings: { type: Object, default: () => ({ theme: 'light' }) }
})
```
::

This is the exact same "shared reference" hazard from chapter 01's `data()` discussion, applied to props — Vue enforces the factory-function pattern for object/array defaults specifically to prevent one component instance's mutation of a default value from leaking into every other instance.

## Props Are One-Way — Never Mutate Them Directly

::code-wrapper{language="vue"}
```vue
<script setup>
const props = defineProps({ count: Number })

function increment() {
  // WRONG — Vue emits a runtime warning:
  // "Unexpected mutation of prop 'count'"
  props.count++
}
</script>
```
::

Props flow **down** from parent to child. If a child could freely mutate its own props, the parent's state and the child's view of that state would silently diverge, and the parent (the actual owner of the data) would have no idea its data changed. The correct pattern is to treat the prop as read-only and either derive a `computed` from it, keep a locally-owned `ref` seeded from the prop (for cases like an editable form draft), or `emit` an event asking the parent to make the change:

::code-wrapper{language="vue" filename="QuantityStepper.vue"}
```vue
<script setup>
const props = defineProps({ modelValue: Number })
const emit = defineEmits(['update:modelValue'])

function increment() {
  // RIGHT — ask the parent to update the value it owns
  emit('update:modelValue', props.modelValue + 1)
}
</script>

<template>
  <button @click="increment">{{ modelValue }} +</button>
</template>
```
::

(This `modelValue`/`update:modelValue` pattern is exactly what powers `v-model` on components — covered fully in chapter 06.)

## `emits` — Declaring What a Component Can Emit

::code-wrapper{language="vue" filename="DeleteButton.vue"}
```vue
<script setup>
// array shorthand
// const emit = defineEmits(['confirm', 'cancel'])

// object syntax — adds runtime validation of the payload
const emit = defineEmits({
  confirm: (id) => {
    if (typeof id !== 'number') {
      console.warn('confirm event expects a numeric id')
      return false
    }
    return true
  },
  cancel: null // no validation, just documents that the event exists
})

const props = defineProps({ itemId: Number })

function handleDelete() {
  emit('confirm', props.itemId)
}
</script>

<template>
  <button @click="handleDelete">Delete</button>
  <button @click="emit('cancel')">Cancel</button>
</template>
```
::

Declaring `emits` (even with the plain array shorthand) matters for more than documentation: any attribute or listener passed to a component that isn't a declared prop or emit falls through to `$attrs` and lands on the component's root element automatically (see "Fallthrough Attributes" below) — undeclared emits are indistinguishable from a plain DOM event listener from Vue's perspective, which can cause a native and a custom event to collide.

## Single-File Component Structure — the Full Picture

::code-wrapper{language="vue" filename="ProductCard.vue"}
```vue
<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  product: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['add-to-cart'])

const isExpanded = ref(false)

const formattedPrice = computed(() =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(props.product.price)
)

function addToCart() {
  emit('add-to-cart', props.product.id)
}
</script>

<template>
  <div class="product-card">
    <img :src="product.imageUrl" :alt="product.name" />
    <h3>{{ product.name }}</h3>
    <p>{{ formattedPrice }}</p>
    <button @click="isExpanded = !isExpanded">
      {{ isExpanded ? 'Hide details' : 'Show details' }}
    </button>
    <p v-if="isExpanded">{{ product.description }}</p>
    <button @click="addToCart" :disabled="!product.inStock">
      {{ product.inStock ? 'Add to Cart' : 'Out of Stock' }}
    </button>
  </div>
</template>

<style scoped>
.product-card {
  border: 1px solid #e2e2e2;
  border-radius: 8px;
  padding: 1rem;
}
</style>
```
::

Each of the three blocks is optional — a component can be script-only (a composable-like renderless component), template-only (rare), or style-only (essentially never) — but in practice nearly every real component has all three.

## Fallthrough Attributes

Any attribute passed to a component that isn't declared as a prop "falls through" to the component's root element automatically:

::code-wrapper{language="vue" filename="AppButton.vue"}
```vue
<script setup>
defineProps({ label: String })
</script>

<template>
  <button class="app-button">{{ label }}</button>
</template>
```
::

::code-wrapper{language="vue"}
```vue
<template>
  <!-- id, data-testid, and @click are NOT declared props/emits on AppButton, -->
  <!-- so they fall through and land on the <button> element automatically -->
  <AppButton label="Save" id="save-btn" data-testid="save" @click="onSave" />
</template>
```
::

For components with multiple root nodes, Vue can't guess which element should receive the fallthrough attributes, so you must opt in explicitly with `v-bind="$attrs"` on the intended element, or disable inheritance entirely with `defineOptions({ inheritAttrs: false })` and bind `$attrs` manually wherever you want.

## Options API: the Full Component Shape

For comparison, here is `ProductCard.vue` in Options API style — useful to recognize when reading older code:

::code-wrapper{language="vue"}
```vue
<script>
export default {
  props: {
    product: { type: Object, required: true }
  },
  emits: ['add-to-cart'],
  data() {
    return { isExpanded: false }
  },
  computed: {
    formattedPrice() {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
        .format(this.product.price)
    }
  },
  methods: {
    addToCart() {
      this.$emit('add-to-cart', this.product.id)
    }
  }
}
</script>
```
::

The Composition API version groups `isExpanded`, `formattedPrice`, and any related logic together wherever they're declared in `<script setup>`; the Options API version scatters them across fixed `data`/`computed`/`methods` buckets. Both compile to the same underlying component definition — this is purely an authoring-time organizational choice.

## 💡 Tips & Tricks

- **Idiom** — Name multi-word component files and tags in `PascalCase` (`UserCard.vue`, `<UserCard />`) — this avoids ambiguity with native HTML elements (which are always lowercase and never contain a dash-free multi-word name) and is what the official style guide recommends.
- **Debug** — A prop typo (`:naem="user.name"` instead of `:name="user.name"`) produces no error — it just becomes an undeclared attribute that falls through to the root element, and the component silently renders with its default/`undefined` prop value. If a prop "isn't working," check `$attrs` in Vue DevTools for a suspicious extra attribute on the root element first.
- **Idiom** — Use the object syntax for `defineProps` (with `type`, `required`, `default`, `validator`) even for simple components — in development mode, Vue logs a clear console warning when a prop's runtime type doesn't match, catching integration bugs between parent and child far earlier than a silent `undefined`.
- **Performance** — Splitting a large component into smaller child components isn't just for readability — it also gives Vue more granular re-render boundaries, so a state change that only affects one child doesn't force Vue to re-diff the entire parent's template.
- **Idiom** — `defineOptions({ inheritAttrs: false })` combined with manually spreading `v-bind="$attrs"` onto a specific inner element is the standard pattern for wrapper components (a styled `<Input>` wrapping a native `<input>`) where you want fallthrough attributes on the *inner* element, not the outer wrapper `<div>`.

## ⚠️ Edge Cases & Gotchas

- **Mutating a prop directly only warns — it doesn't throw** — `props.count++` on a primitive prop produces a console warning in development but doesn't crash; in production builds the warning is stripped entirely, so a prop-mutation bug can ship silently and cause subtle parent/child state divergence that's hard to trace.
- **Object/array props CAN be mutated internally without a warning, because the reference itself didn't change** — `props.user.name = 'New Name'` does *not* trigger Vue's prop-mutation warning, because you didn't reassign `props.user` — you mutated what it points to. This still violates one-way data flow (the parent's original object is now mutated too, since objects are passed by reference) but Vue has no way to detect or warn about it.
- **Undeclared emits still "work," which hides bugs** — Calling `emit('some-event')` for an event not listed in `defineEmits` still fires and any parent `@some-event` listener still receives it — Vue only logs a dev-mode warning. This means a typo'd event name (`@save` vs `@saved`) fails completely silently unless `emits` is declared, since only declared, mismatched emits produce that warning.
- **`default: []` / `default: {}` on a prop is a real runtime error trap in older code or when array shorthand is skipped** — Unlike `data()`, which fails loudly if it isn't a function, Vue *does* validate factory functions for prop defaults and warns if you provide a raw object/array literal — but only in dev mode; verify prop defaults use factory functions when reading through unfamiliar code.
- **Multiple root elements silently disable automatic attribute fallthrough** — A component with two or more root-level elements (or root-level `<template v-if>/<template v-else>` branches with different tags) receives fallthrough attributes on `$attrs` but does **not** apply them to any element automatically — omitting `v-bind="$attrs"` in this case means IDs, ARIA attributes, and event listeners passed from a parent simply vanish.

## 🧠 Spot the Bug

A team builds a reusable `<Tag>` component. Every tag on the page renders the exact same color, even though each usage passes a different `color` prop default is never overridden as expected when the prop is omitted.

::code-wrapper{language="vue" filename="Tag.vue"}
```vue
<script setup>
const colorPalette = { info: '#3498db', warning: '#f39c12', danger: '#e74c3c' }

defineProps({
  label: String,
  theme: { type: Object, default: colorPalette }
})
</script>

<template>
  <span :style="{ background: theme.info }">{{ label }}</span>
</template>
```
::

<details>
<summary>Answer</summary>

Two separate bugs are stacked here. First, `default: colorPalette` passes the *same* shared object reference as the default for every instance that omits `theme` — exactly the shared-reference hazard object/array prop defaults must avoid; Vue requires (and warns if you don't provide) a factory function so each instance gets its own copy. Second, the template hardcodes `theme.info`, so even instances that *do* pass a distinct `theme` still only ever render the `info` color — the component was never designed to actually use whichever theme value the caller intended.

::code-wrapper{language="vue"}
```vue
<script setup>
const props = defineProps({
  label: String,
  color: { type: String, default: '#3498db' }
})
</script>

<template>
  <span :style="{ background: props.color }">{{ label }}</span>
</template>
```
::

**The lesson**: object/array prop defaults must always be factory functions (`default: () => ({...})`), and a component's template must actually read the specific prop value passed in — hardcoding one branch of what should be dynamic data defeats the entire point of making it a prop.

</details>

## Key Takeaways

- `defineProps`'s object syntax (with `type`/`required`/`default`/`validator`) gives dev-mode validation that array shorthand and untyped props don't.
- Object/array prop and `data()` defaults must be factory functions, never shared literals, or every component instance mutates the same underlying value.
- Props are one-way (parent → child); never mutate a prop directly — derive a `computed`, keep local editable state, or `emit` an event asking the parent to change it.
- `defineEmits` documents a component's event contract and enables payload validation; undeclared emits still fire but lose that validation and the typo-catching dev warning.
- Attributes not declared as props/emits fall through to a single root element automatically; multiple root elements require explicit `v-bind="$attrs"`.
- `<script setup>` auto-registers imported components and auto-exposes top-level bindings to the template, eliminating the Options API's `components: {}` and `data()`/`methods`/`computed` boilerplate.
