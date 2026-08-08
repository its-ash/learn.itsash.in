# 13 — Slots & Scoped Slots

## Default Slots

A slot is a hole in a component's template that the parent fills with content — the Vue equivalent of React's `children`:

::code-wrapper{language="vue" filename="Card.vue"}
```vue
<template>
  <div class="card">
    <slot>
      <!-- fallback content — rendered only if the parent provides no content -->
      <p>No content provided.</p>
    </slot>
  </div>
</template>
```
::

::code-wrapper{language="vue"}
```vue
<template>
  <Card>
    <p>This replaces the fallback entirely.</p>
  </Card>
</template>
```
::

Fallback content only appears when the parent passes nothing at all for that slot — passing an empty string or whitespace still counts as "content provided" in some edge cases, so don't rely on fallback content as a substitute for an explicit `v-if` when you need to distinguish "nothing passed" from "an empty value passed."

## Named Slots

::code-wrapper{language="vue" filename="Layout.vue"}
```vue
<template>
  <div class="layout">
    <header><slot name="header" /></header>
    <main><slot /></main>
    <!-- <slot /> alone is shorthand for <slot name="default" /> -->
    <footer><slot name="footer" /></footer>
  </div>
</template>
```
::

::code-wrapper{language="vue"}
```vue
<template>
  <Layout>
    <template #header>
      <h1>Dashboard</h1>
    </template>

    <!-- content with no <template #name> wrapper goes to the default slot -->
    <p>Main dashboard content here.</p>

    <template #footer>
      <small>&copy; 2026</small>
    </template>
  </Layout>
</template>
```
::

`#header` is shorthand for `v-slot:header`, exactly parallel to `@click` being shorthand for `v-on:click` and `:value` for `v-bind:value`.

## Scoped Slots — Passing Data Back Up to the Parent

A scoped slot lets a child component pass data *into* the slot content the parent supplies — reversing the usual props-down direction specifically for the content the parent writes:

::code-wrapper{language="vue" filename="UserList.vue"}
```vue
<script setup>
defineProps({ users: Array })
</script>

<template>
  <ul>
    <li v-for="user in users" :key="user.id">
      <!-- exposing `user` and a computed `isAdmin` to whatever the -->
      <!-- parent puts inside this slot -->
      <slot :user="user" :is-admin="user.role === 'admin'" />
    </li>
  </ul>
</template>
```
::

::code-wrapper{language="vue"}
```vue
<template>
  <UserList :users="users">
    <!-- v-slot="{ user, isAdmin }" destructures everything the child passed -->
    <template #default="{ user, isAdmin }">
      <strong>{{ user.name }}</strong>
      <span v-if="isAdmin" class="badge">Admin</span>
    </template>
  </UserList>
</template>
```
::

This is the mechanism behind essentially every real "headless" list/table component: the child owns iteration, loading state, and structure; the parent owns exactly how each row is rendered, using data it couldn't have had otherwise, because that data (`user`, `isAdmin`) only exists inside the child's loop.

### Shorthand for a single default scoped slot

::code-wrapper{language="vue"}
```vue
<template>
  <!-- when a component ONLY has a default slot, v-slot can go directly -->
  <!-- on the component tag itself, skipping the <template> wrapper -->
  <UserList :users="users" v-slot="{ user, isAdmin }">
    <strong>{{ user.name }}</strong>
    <span v-if="isAdmin" class="badge">Admin</span>
  </UserList>
</template>
```
::

This shorthand only works when there is exactly one slot and it's the default — the moment a second named slot is added, every slot (including the default) needs its own explicit `<template #name>`.

## Dynamic Slot Names

::code-wrapper{language="vue" filename="TabPanel.vue"}
```vue
<script setup>
defineProps({ tabs: Array })
</script>

<template>
  <div v-for="tab in tabs" :key="tab.id">
    <slot :name="tab.slotName" :tab="tab">
      {{ tab.defaultText }}
    </slot>
  </div>
</template>
```
::

::code-wrapper{language="vue"}
```vue
<script setup>
const activeSection = 'summary'
</script>

<template>
  <TabPanel :tabs="tabs">
    <!-- the slot NAME itself is a dynamic expression here -->
    <template #[activeSection]="{ tab }">
      <strong>{{ tab.title }}</strong>
    </template>
  </TabPanel>
</template>
```
::

Dynamic slot names follow the same `#[expression]` syntax as dynamic prop/event bindings (`:[attrName]`, `@[eventName]`) elsewhere in Vue's template syntax.

## Renderless Components

A renderless component contains all the *logic* for a piece of UI behavior but renders none of the actual markup itself — it delegates 100% of the visual output to a scoped slot, making it purely a logic/state provider:

::code-wrapper{language="vue" filename="MouseTracker.vue"}
```vue
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const x = ref(0)
const y = ref(0)

function update(event) {
  x.value = event.pageX
  y.value = event.pageY
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
  <MouseTracker v-slot="{ x, y }">
    <p>Mouse is at {{ x }}, {{ y }}</p>
  </MouseTracker>

  <!-- the SAME logic, completely different markup — this is the whole point -->
  <MouseTracker v-slot="{ x, y }">
    <div class="cursor-dot" :style="{ left: `${x}px`, top: `${y}px` }" />
  </MouseTracker>
</template>
```
::

In modern Vue 3 code, a composable (`useMousePosition()` from chapter 07) usually replaces this pattern entirely — a composable achieves the same reuse with less indirection, since there's no component instance, no slot, no template overhead involved. Renderless components remain genuinely useful specifically when the reusable *thing* is inherently structural — for example a `<VirtualList>` that needs to control exactly which DOM nodes exist for performance reasons, while still letting the parent decide what each visible row looks like.

## Checking Whether a Slot Was Provided

::code-wrapper{language="vue" filename="Panel.vue"}
```vue
<script setup>
import { useSlots } from 'vue'

const slots = useSlots()
</script>

<template>
  <div class="panel">
    <div v-if="slots.header" class="panel-header">
      <slot name="header" />
    </div>
    <slot />
  </div>
</template>
```
::

`useSlots()` is the `<script setup>` equivalent of `this.$slots` in the Options API — necessary when a component's own logic (not just its template) needs to branch on whether particular content was passed, for example to conditionally apply a wrapper class only when a header exists.

## Passing All Slots Through (Transparent Wrapper Components)

::code-wrapper{language="vue" filename="StyledCard.vue"}
```vue
<template>
  <div class="styled-card">
    <!-- $slots re-forwards every slot the wrapper itself received, -->
    <!-- without needing to know their names in advance -->
    <slot v-for="(_, name) in $slots" :key="name" :name="name" v-bind="$slots[name]?.()[0]?.props" />
  </div>
</template>
```
::

In practice, most wrapper components just forward the specific named slots they know about explicitly — this fully-generic forwarding pattern is a niche technique reserved for genuinely generic UI-library-style wrapper components (a themed `<Card>` wrapping a base design-system `<Card>`, for instance) rather than everyday app code.

## Options API Equivalent

::code-wrapper{language="vue"}
```vue
<script>
export default {
  computed: {
    hasHeaderSlot() {
      return !!this.$slots.header
    }
  }
}
</script>

<template>
  <div class="panel">
    <div v-if="hasHeaderSlot" class="panel-header">
      <slot name="header" />
    </div>
    <slot :item="currentItem" />
  </div>
</template>
```
::

## 💡 Tips & Tricks

- **Idiom** — Default your slot names to `default`, and only introduce named slots (`header`/`footer`/`actions`) once a component genuinely has multiple independent content regions — over-slotting a simple component makes it harder to use than a couple of well-typed props would.
- **Idiom** — Prefer a composable over a renderless component whenever the "reusable thing" is pure logic with no inherent structure — reach for renderless components specifically when the logic needs to control rendering structure itself (virtualization, drag-and-drop reordering) in a way a composable alone can't.
- **Debug** — `useSlots()` (or `this.$slots` in Options API) reflects what the *parent* passed, not what conditionally renders inside the slot's own template — checking `slots.header` tells you whether a `#header` template was provided at all, not whether it currently renders any visible content.
- **Idiom** — Scoped slot props are just an object — destructure only what a given slot template actually needs (`v-slot="{ user }"` rather than `v-slot="slotProps"` followed by `slotProps.user` everywhere) for cleaner, more self-documenting parent templates.
- **Performance** — Slot content is compiled in the *parent's* scope, not the child's — a scoped slot's template can reference the parent's own reactive state directly alongside the props the child exposes, with no prop-drilling needed for data the parent already has.

## ⚠️ Edge Cases & Gotchas

- **Fallback slot content only appears when literally nothing is passed — not when something "empty" is passed** — `<Card></Card>` (or `<Card />`) shows the fallback; `<Card><span></span></Card>` does not, even though the rendered result looks empty to a user — the two cases are different from Vue's perspective and this can look like a fallback-content bug when it isn't one.
- **The single-slot `v-slot` shorthand on the component tag silently stops working the moment you add ANY named slot** — Going from one default slot to a component with a default plus a named `#footer` slot requires wrapping the default content back in an explicit `<template #default="...">` — forgetting this after adding a second slot is a common, confusing compile-time error.
- **Scoped slot data is only available inside that slot's template — not in the parent component's `<script>` block** — `v-slot="{ user }"` makes `user` usable in the template markup between the tags, but there is no way to "extract" that value into the parent's own script-side reactive state directly from the slot binding — if the parent needs `user` in its own logic, the child must also expose it another way (an emitted event, a prop-based getter) rather than through the slot alone.
- **Passing a scoped slot's data through multiple wrapper layers requires each layer to explicitly re-declare it** — Slot props don't automatically "flow through" an intermediate wrapper component the way `provide`/`inject` flows through an entire subtree — each wrapper in the chain must accept the inner slot's data and re-expose it through its own `<slot>` tag with `v-bind`, or the data doesn't reach the outermost consumer.
- **A `<slot>` with no `v-if` still renders an (empty) presence check overhead and can affect `:key` reconciliation subtly in a `v-for`** — When conditionally showing entire sections based on slot content, checking `useSlots()`/`$slots` explicitly (as in the `Panel.vue` example) is more predictable than relying on CSS to hide an empty wrapper, particularly when the wrapper's presence affects layout (e.g., a bordered panel header container that shouldn't exist at all, not just be hidden, when there's no header content).

## 🧠 Spot the Bug

A generic `<DataTable>` component is meant to let the parent customize how each cell renders, but the parent's custom cell template shows `undefined` for every row.

::code-wrapper{language="vue" filename="DataTable.vue"}
```vue
<script setup>
defineProps({ rows: Array, columns: Array })
</script>

<template>
  <table>
    <tr v-for="row in rows" :key="row.id">
      <td v-for="col in columns" :key="col.key">
        <slot :name="col.key" />
      </td>
    </tr>
  </table>
</template>
```
::

::code-wrapper{language="vue"}
```vue
<template>
  <DataTable :rows="rows" :columns="columns">
    <template #price="{ row }">
      ${{ row.price.toFixed(2) }}
    </template>
  </DataTable>
</template>
```
::

<details>
<summary>Answer</summary>

`<slot :name="col.key" />` never actually passes any scoped data to the slot — it forwards the slot's *name* but no `v-bind` payload, so there is no `row` (or anything else) for the parent's `#price="{ row }"` template to destructure. The parent's `{ row }` destructures `undefined` into `row`, and `row.price` then throws (or silently shows nothing, depending on how the error is handled upstream) because `row` was never actually provided.

::code-wrapper{language="vue" filename="DataTable.vue"}
```vue
<template>
  <table>
    <tr v-for="row in rows" :key="row.id">
      <td v-for="col in columns" :key="col.key">
        <slot :name="col.key" :row="row" :column="col" />
      </td>
    </tr>
  </table>
</template>
```
::

**The lesson**: a `<slot>` tag's *name* and its *scoped data* are entirely independent things you must bind separately — naming a slot dynamically doesn't automatically forward any contextual data to it; every value the parent's template destructures out of `v-slot="{ ... }"` has to be explicitly listed as a `v-bind` attribute on that exact `<slot>` tag.

</details>

## Key Takeaways

- Default slots are the Vue equivalent of React's `children`; fallback content only shows when literally nothing is passed for that slot.
- Named slots (`<slot name="x">` / `<template #x>`) let a component expose multiple independent content regions; the single-slot `v-slot` shorthand breaks the moment a second named slot is introduced.
- Scoped slots (`<slot :prop="value">` / `v-slot="{ prop }"`) let a child pass data into content the parent supplies — the mechanism behind headless list/table components.
- Every value a parent destructures from a scoped slot must be explicitly bound on that `<slot>` tag — naming a slot doesn't forward any data on its own.
- Renderless components package pure behavior behind a scoped slot with zero markup of their own; prefer a composable unless the logic must also control rendering structure.
- `useSlots()`/`$slots` reflects what the parent *passed*, useful for conditionally wrapping optional sections, not what currently renders visibly inside them.
