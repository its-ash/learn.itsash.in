---
title: Vue 3 Engineering Reference — Slots & Scoped Slots
description: Default and named slots, scoped slot data passing, renderless component patterns via slots, slot prop destructuring, fallback content, and slot compilation to render functions.
---

# 13 — Slots & Scoped Slots

## Default and Named Slots

::code-wrapper{language="vue" filename="Card.vue"}
```vue
<script setup>
// ── Slots are defined in the child, filled by the parent ──
// Default slot: <slot /> — unnamed content from parent goes here
// Named slots: <slot name="header" /> — content with matching slot attribute
</script>

<template>
  <div class="card">
    <!-- Named slot: parent fills this with <template #header> -->
    <header class="card-header">
      <slot name="header" />
    </header>

    <!-- Default slot: unnamed content from parent -->
    <div class="card-body">
      <slot />  <!-- fallback content: shown if parent provides nothing -->
    </div>

    <footer class="card-footer">
      <slot name="footer">
        <p>Default footer — shown if parent doesn't fill this slot</p>
      </slot>
    </footer>
  </div>
</template>
```

::code-wrapper{language="vue" filename="CardUsage.vue"}
```vue
<script setup>
import Card from './Card.vue'
</script>

<template>
  <Card>
    <!-- ── Named slot: #header is shorthand for v-slot:header ── -->
    <template #header>
      <h2>User Profile</h2>
    </template>

    <!-- ── Default slot: content NOT wrapped in <template #default> ── -->
    <p>This goes into the unnamed <slot /> in Card.</p>

    <template #footer>
      <button>Save</button>
    </template>
  </Card>
</template>
```
::

## Scoped Slots — Child-to-Parent Data Passing

::code-wrapper{language="vue" filename="DataTable.vue"}
```vue
<script setup>
const props = defineProps<{
  rows: Array<{ id: number; name: string; status: string }>
}>()
</script>

<template>
  <table>
    <tbody>
      <tr v-for="row in rows" :key="row.id">
        <!-- ── Scoped slot: child passes row data to parent's slot content ── -->
        <!-- The parent decides HOW to render each row — child provides the data -->
        <slot name="row" :row="row" :index="$index" />
        <!-- If parent doesn't fill #row, show default rendering: -->
        <template #row="{ row }">
          <td>{{ row.name }}</td>
          <td>{{ row.status }}</td>
        </template>
      </tr>
    </tbody>
  </table>
</template>
```

::code-wrapper{language="vue" filename="DataTableUsage.vue"}
```vue
<template>
  <!-- ── Parent receives row data via slot props (destructured) ── -->
  <DataTable :rows="users">
    <template #row="{ row, index }">
      <td>{{ index + 1 }}</td>
      <td class="font-bold">{{ row.name }}</td>
      <td>
        <span :class="row.status">{{ row.status }}</span>
        <button @click="edit(row)">Edit</button>
      </td>
    </template>
  </DataTable>
</template>
```
::

## Renderless Component — Logic Encapsulation via Slots

::code-wrapper{language="vue" filename="useMouseTracker.vue"}
```vue
<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'

// ── Renderless component: provides data via scoped slot, renders nothing itself ──
// Parent has full control over the template — this component only provides state.
const x = ref(0)
const y = ref(0)

function handler(e) { x.value = e.clientX; y.value = e.clientY }

onMounted(() => window.addEventListener('mousemove', handler))
onUnmounted(() => window.removeEventListener('mousemove', handler))

// ── Expose computed/state to parent via default slot props ──
// Parent destructures { x, y } in the slot template.
</script>

<template>
  <!-- The slot receives x, y, and a distance computed -->
  <slot :x="x" :y="y" :distance="Math.sqrt(x**2 + y**2)" />
</template>
```

::code-wrapper{language="vue" filename="RenderlessUsage.vue"}
```vue
<template>
  <!-- ── v-slot (or #default) receives the slot props ── -->
  <MouseTracker v-slot="{ x, y, distance }">
    <div class="cursor-indicator">
      Position: {{ x }}, {{ y }} (distance from origin: {{ distance.toFixed(0) }}px)
    </div>
  </MouseTracker>

  <!-- ── Equivalent: explicit default slot name ── -->
  <MouseTracker>
    <template #default="{ x, y }">
      <div>X: {{ x }}, Y: {{ y }}</div>
    </template>
  </MouseTracker>
</template>
```
::

## Slot Props with Dynamic Slots — v-slot with v-for

::code-wrapper{language="vue" filename="VirtualList.vue"}
```vue
<script setup>
import { ref, computed } from 'vue'

const props = defineProps<{
  items: Array<{ id: string; [key: string]: any }>
  pageSize?: number
}>()

// ── Virtual list: only renders visible items ────────────
// Slot props include: item, index, isVisible (for lazy rendering)
const scrollTop = ref(0)
const visibleRange = computed(() => {
  const start = Math.floor(scrollTop.value / 40)  // 40px per row
  const end = Math.min(start + (props.pageSize ?? 20), props.items.length)
  return { start, end }
})
</script>

<template>
  <div class="virtual-list" @scroll.passive="scrollTop = $event.target.scrollTop" :style="{ height: items.length * 40 + 'px' }">
    <!-- ── Scoped slot for each visible item: parent controls rendering ── -->
    <div
      v-for="item in items.slice(visibleRange.start, visibleRange.end)"
      :key="item.id"
      :style="{ transform: `translateY(${visibleRange.start * 40}px)` }"
    >
      <slot
        name="item"
        :item="item"
        :index="items.indexOf(item)"
      />
    </div>
  </div>
</template>
```

::code-wrapper{language="vue" filename="VirtualListUsage.vue"}
```vue
<template>
  <VirtualList :items="products" :page-size="50">
    <template #item="{ item, index }">
      <div class="product-row">
        <span>{{ index + 1 }}. {{ item.name }} — ${{ item.price }}</span>
      </div>
    </template>
  </VirtualList>
</template>
```
::

## Slot Compilation — Render Function Equivalents

::code-wrapper{language="typescript" filename="slot-compilation.ts"}
```typescript
import { h, defineComponent } from 'vue'

// ── Template slots compile to slots object in render functions ──
// The slots object: { default: () => VNode[], header: () => VNode[], ... }

// ── Template: ──────────────────────────────────────────
// <Card>
//   <template #header><h2>Title</h2></template>
//   <p>Body</p>
// </Card>
//
// ── Compiles to (render function equivalent): ──────────
h(Card, null, {
  header: () => h('h2', null, 'Title'),
  default: () => h('p', null, 'Body'),
})

// ── Scoped slot in render function: ─────────────────────
// Template: <DataTable v-slot:row="{ row }">{{ row.name }}</template>
// Render fn: h(DataTable, null, { row: ({ row }) => h('td', null, row.name) })
// The slot prop is passed as a parameter to the render function.

// ── Accessing slots in <script setup>: ─────────────────
import { useSlots } from 'vue'
const slots = useSlots()
// slots.default?.()       → VNode[] or undefined
// slots.header?.()        → VNode[] or undefined
// Useful for conditional rendering based on whether a slot was filled.
if (slots.header) { /* render header slot */ }
```
::

## Dynamic Slot Names

::code-wrapper{language="vue" filename="DynamicSlots.vue"}
```vue
<script setup>
import { ref, computed } from 'vue'

// ── Dynamic slot name: slot name can be an expression ──
const currentSlot = ref('header')

// The slot to render is determined at runtime
const slots = {
  header: 'Header Content',
  body: 'Body Content',
  footer: 'Footer Content',
}

const activeContent = computed(() => slots[currentSlot.value])
</script>

<template>
  <!-- ── Dynamic slot binding: #[expression] ── -->
  <SlotRenderer>
    <template #[currentSlot]>
      {{ activeContent }}
    </template>
  </SlotRenderer>
</template>
```

::code-wrapper{language="vue" filename="ConditionalSlots.vue"}
```vue
<script setup>
import { useSlots } from 'vue'
const slots = useSlots()
</script>

<template>
  <!-- ── Check if a slot was provided before rendering its container ── -->
  <header v-if="slots.header" class="header">
    <slot name="header" />
  </header>

  <main>
    <slot />
  </main>

  <footer v-if="slots.footer" class="footer">
    <slot name="footer" />
  </footer>
  <!-- ── If parent doesn't fill #header, the <header> element isn't rendered ── -->
  <!-- Avoids empty wrapper elements when slots are unfilled. -->
</template>
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
import { useSlots } from 'vue'

// ── 1. useSlots() — check if a slot was provided ──
// const slots = useSlots()
// v-if="slots.header" — only render the container if the slot has content

// ── 2. Slot prop defaults — parent can provide defaults in destructure ──
// <template #row="{ row, index = 0 }">{{ index }}</template>

// ── 3. Fallback content in child slot definition ──
// <slot>Default text shown if parent doesn't fill this slot</slot>

// ── 4. Renderless components are powerful but composable are often simpler ──
// Before building a renderless component, consider: can a composable do the job?
// Composables are lighter (no component instance overhead) and more composable.
// Renderless components shine when you need slot-based template injection.

// ── 5. Named slot shorthand: #name instead of v-slot:name ──
// #default is valid but unnecessary — unnamed <template> is default.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. Slot props are not reactive across re-renders ──
// Each render, the slot function is called with fresh props.
// If the parent uses a ref inside the slot, it updates on parent re-render.

// ── 2. Default slot content is NOT shown if parent passes empty content ──
// <Card><template #header></template></Card>
// The header slot is "filled" (with empty content) — fallback is NOT shown.
// Fallback only appears when the slot is entirely absent.

// ── 3. Slot content is compiled in the PARENT's scope ──
// <Card><slot name="header">{{ parentVar }}</slot></Card>
// `parentVar` comes from the parent's setup, not the child's.
// Child can pass data via scoped slot props, but can't expose its own state directly.

// ── 4. v-slot can only be used on <template> or component tags ──
// ❌ <div v-slot="{ item }"> — invalid
// ✅ <template v-slot="{ item }"> or <MyComp v-slot="{ item }"> — valid

// ── 5. Scoped slot destructuring loses reactivity if you extract a ref ──
// <template #row="{ row }">{{ row.name }}</template>
// `row` is the slot prop (an object). Accessing row.name is reactive.
// But: const { row } = useSlots() — row is a plain value, not a ref.

// ── 6. Slot names are case-insensitive ──
// #header and #Header are the same slot. Use kebab-case for clarity.
```
::

## 🧠 Spot the Bug

A parent passes an empty `<template #header>` and expects the child's fallback content to show.

::code-wrapper{language="vue" filename="SlotBug.vue"}
```vue
<!-- Child: Card.vue -->
<template>
  <header>
    <slot name="header">
      <h2>Default Header</h2>  <!-- fallback content -->
    </slot>
  </header>
</template>
```

::code-wrapper{language="vue" filename="SlotBugParent.vue"}
```vue
<template>
  <Card>
    <template #header></template>  <!-- empty slot content -->
  </Card>
</template>
```
::

<details>
<summary>Answer</summary>

The fallback content ("Default Header") is only shown when the slot is **completely absent** from the parent. Passing `<template #header></template>` fills the slot with empty content — the slot is "provided" (just with nothing inside), so the fallback is skipped.

**Fix** — either omit the slot entirely (let it be absent), or conditionally render based on `useSlots()`:

::code-wrapper{language="vue" filename="SlotFixed.vue"}
```vue
<!-- Option 1: Don't pass the slot at all -->
<Card />  <!-- #header slot absent → fallback shows -->

<!-- Option 2: Child checks if slot has meaningful content -->
<script setup>
import { useSlots } from 'vue'
const slots = useSlots()
const hasHeader = computed(() => slots.header && slots.header().length > 0)
</script>

<template>
  <header>
    <slot name="header" v-if="hasHeader" />
    <h2 v-else>Default Header</h2>
  </header>
</template>
```
::

**The lesson**: slot fallback content appears only when the slot is *absent*, not when it's *empty*. Passing an empty `<template #name></template>` still counts as "provided."

</details>