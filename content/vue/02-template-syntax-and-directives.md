---
title: Vue 3 Engineering Reference — Template Syntax & Directives
description: Production-grade template compilation — vnode diffing with keyed lists, compiler-informed patch flags, modifier chains, v-model expansion, attribute fallthrough, and the v-if/v-for precedence trap.
---

# 02 — Template Syntax & Directives

## Compiler Output — What Templates Become

::code-wrapper{language="typescript" filename="compiler-output.ts"}
```typescript
// ── Template ──────────────────────────────────────────
// <div :class="{ active: isActive }" @click="onClick">{{ msg }}</div>
//
// ── Compiled render function (simplified) ─────────────
import { h, withDirectives, vModelText } from 'vue'

function render(_ctx) {
  // h(type, props, children) — returns a VNode object
  // PatchFlag 2 = CLASS (compiler knows ONLY class may change → targeted patch)
  // PatchFlag 8 = PROPS (only listed props may change)
  // PatchFlag -1 = FULL_PATCH (no hint, diff everything)
  // PatchFlag -2 = HOISTED (static subtree, skipped entirely)
  return h('div', {
    class: { active: _ctx.isActive },       // bound — tracked by flag
    onClick: _ctx.onClick,                   // event handler — always reactive
    // __v_internal__ flag: tells runtime "only diff class, skip everything else"
  }, _ctx.msg, 2 /* CLASS */)
}

// ── The optimization: ──────────────────────────────────
// The compiler analyzes the template at BUILD time and tags each vnode
// with a PatchFlag. At runtime, the patcher only checks the flagged
// properties — skipping full prop diffing on static subtrees.
// This is why compiled templates outperform hand-written render functions.
```
::

## Production List Rendering — Keyed Virtual DOM Diffing

::code-wrapper{language="vue" filename="DataTable.vue"}
```vue
<script setup lang="ts">
import { ref, computed, type ShallowRef } from 'vue'

interface Row {
  id: string
  name: string
  status: 'active' | 'inactive' | 'pending'
  updatedAt: number
}

// ── Simulated server data — mutable in place ────────────
const rows = ref<Row[]>([])

// ── Derived view: filtered + sorted, memoized via computed ──
// computed() caches the result; only re-evaluates when `rows` changes.
// Avoids re-filtering on every re-render (which happens on ANY reactive read).
const visibleRows = computed(() =>
  rows.value
    .filter(r => r.status !== 'inactive')
    .sort((a, b) => b.updatedAt - a.updatedAt)
)

// ── Update a single row WITHOUT replacing the array ────
// Direct index mutation works in Vue 3 (Proxy catches it), but
// replacing the array is clearer for diffing and time-travel debugging.
function patchRow(id: string, patch: Partial<Row>) {
  rows.value = rows.value.map(r =>
    r.id === id ? { ...r, ...patch, updatedAt: Date.now() } : r
  )
}
</script>

<template>
  <!-- :key MUST be a stable identity — never the array index.
       With id keys, Vue's diff algorithm:
       1. Builds a Map of old vnodes keyed by id
       2. Iterates new list, patches matched vnodes in place
       3. Moves unmatched vnodes to new positions (no re-creation)
       4. Destroys vnodes that no longer exist (runs onUnmounted)
       Without stable keys, Vue patches by INDEX — reusing DOM nodes
       for the wrong data, corrupting per-row state (focus, transitions). -->
  <tr v-for="row in visibleRows" :key="row.id">
    <td>{{ row.name }}</td>
    <td>{{ row.status }}</td>
    <td>{{ new Date(row.updatedAt).toISOString() }}</td>
  </tr>
</template>
```
::

### Anti-Pattern: Index as Key

::code-wrapper{language="vue" filename="AntiPatternKey.vue"}
```vue
<script setup>
import { ref } from 'vue'

const items = ref([
  { id: 1, text: 'Alpha', checked: false },
  { id: 2, text: 'Beta', checked: true },
  { id: 3, text: 'Gamma', checked: false },
])

function removeFirst() { items.value.shift() }
</script>

<template>
  <!-- ❌ WRONG: index key — DOM nodes reused by position, not identity -->
  <li v-for="(item, i) in items" :key="i">
    <input type="checkbox" v-model="item.checked" />
    {{ item.text }}
  </li>
  <button @click="removeFirst">Remove first</button>
</template>

<!-- After clicking "Remove first":
     - items[0] is now "Beta" (was "Alpha")
     - The <input> at DOM position 0 is REUSED (not destroyed)
     - That input's checked state is "false" (Alpha's state, not Beta's)
     - The checkbox appears unchecked even though item.checked is true
     The DOM state (checked) is detached from the data state. -->
```
::

::code-wrapper{language="vue" filename="CorrectKey.vue"}
```vue
<template>
  <!-- ✅ CORRECT: stable id key — Vue tracks each row by identity -->
  <li v-for="item in items" :key="item.id">
    <input type="checkbox" v-model="item.checked" />
    {{ item.text }}
  </li>
  <button @click="removeFirst">Remove first</button>
</template>
```
::

## Conditional Rendering — v-if vs v-show Decision Matrix

::code-wrapper{language="vue" filename="ConditionalStrategy.vue"}
```vue
<script setup>
import { ref, shallowRef, onActivated, onDeactivated } from 'vue'
import HeavyChart from './HeavyChart.vue'
import Tooltip from './Tooltip.vue'

const showChart = ref(false)
const tooltipVisible = ref(false)
const tab = ref('overview')

// ── v-if: destroys and recreates the component ──────
// Runs onMounted/onUnmounted every toggle.
// Cost: full teardown + recreation. Zero cost when hidden.
// Use for: rarely toggled, expensive to keep mounted.

// ── v-show: toggles display:none ─────────────────────
// Component stays mounted, lifecycle hooks run ONCE.
// Cost: initial render happens even when hidden.
// Use for: frequently toggled, cheap to keep alive.

// ── <KeepAlive>: caches component instances ─────────
// v-if + KeepAlive = best of both: unmounts from DOM tree
// but preserves instance state in memory, reuses on re-mount.
</script>

<template>
  <!-- Heavy chart: v-if — don't pay render cost when hidden -->
  <KeepAlive>
    <HeavyChart v-if="showChart" />
  </KeepAlive>

  <!-- Tooltip: v-show — toggled dozens of times per session -->
  <Tooltip v-show="tooltipVisible" />

  <!-- Tab content: v-if inside KeepAlive — switchable, cached -->
  <KeepAlive>
    <component :is="tab" />
  </KeepAlive>
</template>
```
::

## Event Modifiers — Chained Handler Pipeline

::code-wrapper{language="vue" filename="EventModifiers.vue"}
```vue
<script setup>
import { ref } from 'vue'

const dragged = ref(0)

function onDrop(e) {
  // .prevent already called preventDefault() — safe to access dataTransfer
  const data = e.dataTransfer?.getData('text/plain') ?? ''
  console.log('dropped:', data)
}

function onKeyNav(e) {
  // .enter filters to Enter key only — handler never fires for other keys
  console.log('Enter pressed, value:', e.target.value)
}
</script>

<template>
  <!-- Modifier chain: left→right execution order
       .stop   → event.stopPropagation()
       .prevent → event.preventDefault()
       .self   → only fire if event.target === currentTarget
       .once   → remove listener after first call -->
  <button @click.stop.prevent.once="onSave">Save (once, no bubble, no default)</button>

  <!-- .self: ignores clicks from child elements (e.g., icon inside button) -->
  <div @click.self="onBackdropClick" class="modal-backdrop">
    <div class="modal">...</div>
  </div>

  <!-- .exact: ONLY fire when no modifier keys held -->
  <button @click.exact="onSimpleClick">Plain click only</button>
  <button @click.ctrl.exact="onCtrlClick">Ctrl+click only</button>

  <!-- Key modifiers: .enter, .tab, .delete, .esc, .space, .up, .down, etc. -->
  <input @keydown.enter="onKeyNav" @keydown.esc="onEscape" />

  <!-- System modifiers: .ctrl, .alt, .shift, .meta (Cmd on Mac, Win on Windows) -->
  <input @keydown.meta.enter="onCmdEnter" />

  <!-- .passive: tells browser "I won't call preventDefault" → enables scroll optimization -->
  <!-- Don't combine .passive with .prevent — browser warns, .prevent is ignored -->
  <div @scroll.passive="onScroll">Scrollable</div>

  <!-- Mouse button modifiers: .left, .middle, .right -->
  <div @contextmenu.prevent="onRightClick" @mousedown.middle="onMiddleClick">Drag me</div>
</template>
```
::

## Class & Style Binding — Merging Strategies

::code-wrapper{language="vue" filename="ClassBinding.vue"}
```vue
<script setup>
import { ref, computed } from 'vue'

const isActive = ref(true)
const error = ref(null)
const size = ref('md')

// ── Computed class object — cleaner than complex template ternaries ──
const classes = computed(() => ({
  btn: true,
  [`btn-${size.value}`]: true,      // dynamic class name via computed key
  'btn-active': isActive.value,
  'btn-error': !!error.value,
  'btn-disabled': !isActive.value,
}))
</script>

<template>
  <!-- Static class + dynamic :class MERGE automatically (no clobbering) -->
  <button class="rounded shadow" :class="classes">Click</button>

  <!-- Array syntax: multiple sources, arrays, objects can be mixed -->
  <div :class="[
    'card',                          // static string
    { 'card-elevated': isActive },   // conditional object
    size === 'lg' ? 'card-lg' : '',  // ternary
  ]">Content</div>

  <!-- Style binding: camelCase keys, auto-vendored, auto-merged -->
  <div :style="{
    color: error ? 'red' : 'inherit',
    // Vue auto-adds vendor prefixes via @vue/runtime-dom
    // Multi-value: uses last supported value in the list
    display: ['flex', '-webkit-flex'],
  }">Styled</div>

  <!-- Multiple style objects merged (later wins conflicts) -->
  <div :style="[baseStyles, dynamicStyles]">Merged</div>
</template>
```
::

## v-model — Two-Way Binding Expansion

::code-wrapper{language="vue" filename="VModelInternals.vue"}
```vue
<script setup>
import { ref, vModelText, vModelCheckbox, vModelSelect } from 'vue'

const text = ref('')
const checked = ref(false)
const multi = ref([])
const selected = ref('a')
</script>

<template>
  <!-- v-model on <input type="text"> expands to: -->
  <!-- :value="text" @input="text = $event.target.value" -->
  <!-- BUT Vue uses a directive (vModelText) not just attribute binding:
       it handles composition events (IME), edge cases with type=number, etc. -->
  <input v-model="text" />

  <!-- .lazy: listen to 'change' (on blur) instead of 'input' (every keystroke) -->
  <!-- .number: cast to Number (empty string → '' not 0; invalid → original string) -->
  <!-- .trim: strip whitespace from both ends -->
  <input v-model.lazy.number.trim="text" type="number" />

  <!-- Checkbox: single → boolean; multiple → array of checked values -->
  <input v-model="checked" type="checkbox" />
  <input v-model="multi" type="checkbox" value="a" />
  <input v-model="multi" type="checkbox" value="b" />

  <!-- Select: binds to selected <option>'s value attribute -->
  <!-- If no value attr, uses the option's text content -->
  <select v-model="selected">
    <option value="a">Option A</option>
    <option value="b">Option B</option>
  </select>
</template>
```
::

## v-for with v-if — The Vue 3 Precedence Trap

::code-wrapper{language="vue" filename="VForVIfTrap.vue"}
```vue
<script setup>
import { ref, computed } from 'vue'
const todos = ref([
  { id: 1, text: 'A', done: true },
  { id: 2, text: 'B', done: false },
])
</script>

<template>
  <!-- ❌ WRONG in Vue 3: v-if has HIGHER precedence than v-for
       → v-if evaluates FIRST, before the loop variable exists
       → `todo` is undefined → ReferenceError or silent skip -->
  <li v-for="todo in todos" v-if="!todo.done" :key="todo.id">{{ todo.text }}</li>
</template>
```
::

::code-wrapper{language="vue" filename="VForVIfFixed.vue"}
```vue
<script setup>
import { computed } from 'vue'
const todos = ref([
  { id: 1, text: 'A', done: true },
  { id: 2, text: 'B', done: false },
])

// ✅ Option 1: filter via computed — re-evaluates only when todos changes
const incomplete = computed(() => todos.value.filter(t => !t.done))
</script>

<template>
  <li v-for="todo in incomplete" :key="todo.id">{{ todo.text }}</li>

  <!-- ✅ Option 2: <template v-for> wraps, inner v-if filters per item -->
  <template v-for="todo in todos" :key="todo.id">
    <li v-if="!todo.done">{{ todo.text }}</li>
  </template>
</template>
```
::

## 💡 Tips & Tricks

::code-wrapper{language="vue" filename="TipsTricks.vue"}
```vue
<script setup>
import { ref } from 'vue'
</script>

<template>
  <!-- ── 1. v-bind spread — forward a bag of attrs to a native element ── -->
  <input v-bind="{ type: 'email', placeholder: 'Email', required: true, autocomplete: 'email' }" />

  <!-- ── 2. v-once — render once, skip forever (static content optimization) ── -->
  <header v-once>{{ heavyMarkdownRenderedOnce }}</header>

  <!-- ── 3. v-memo — skip re-render unless deps change (for expensive list items) ── -->
  <div v-memo="[item.id, item.status]" v-for="item in hugeList" :key="item.id">
    {{ item.name }}
  </div>

  <!-- ── 4. v-for range starts at 1, not 0 ── -->
  <option v-for="n in 12" :key="n" :value="n">{{ n }}</option>

  <!-- ── 5. Dynamic event name — useful for programmatically bound events ── -->
  <button @[eventName]="handler">Dynamic event</button>

  <!-- ── 6. Dynamic argument — any expression that evaluates to a string ── -->
  <a :[attrName]="url">Dynamic attribute</a>
</template>
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. Boolean attribute string "false" is still truthy in HTML ──
// :disabled="false" → attribute removed ✅
// disabled="false"   → attribute present (string "false" is truthy in HTML) ❌
// HTML spec: presence of boolean attr = true, regardless of value.

// ── 2. v-html bypasses Vue's XSS escaping ──
// {{ userComment }} → escaped (safe)
// <p v-html="userComment" /> → raw HTML injected (XSS if unsanitized)
// Always sanitize with DOMPurify before v-html on user content.

// ── 3. Object key iteration order is NOT alphabetical ──
// v-for="(v, k) in obj" follows JS engine for-in order:
//   1. Integer-index keys (ascending numeric)
//   2. String keys (insertion order)
//   3. Symbol keys (insertion order)
// { b: 1, a: 2, 2: 3, 1: 4 } → iterates: 1, 2, b, a (NOT a, b, 1, 2)

// ── 4. v-model on component requires modelValue prop + update:modelValue emit ──
// Vue 3 renamed value→modelValue and input→update:modelValue (breaking change from Vue 2)
// Multiple v-models: v-model:firstName + v-model:lastName → two model props

// ── 5. Template expressions are sandboxed — limited global access ──
// {{ window.location }} → undefined (window not in sandbox whitelist)
// Only: Math, Date, parseInt, JSON, undefined, etc.
// Access component methods via: {{ myMethod() }}
```
::

## 🧠 Spot the Bug

After removing the second cart item, the "On Sale" badge appears on the wrong product.

::code-wrapper{language="vue" filename="CartBug.vue"}
```vue
<script setup>
import { ref } from 'vue'
const cart = ref([
  { id: 101, name: 'Keyboard', onSale: false },
  { id: 102, name: 'Mouse', onSale: true },
  { id: 103, name: 'Monitor', onSale: false },
])
function remove(i) { cart.value.splice(i, 1) }
</script>

<template>
  <div v-for="(item, i) in cart" :key="i">
    {{ item.name }}
    <span v-if="item.onSale">On Sale!</span>
    <button @click="remove(i)">Remove</button>
  </div>
</template>
```
::

<details>
<summary>Answer</summary>

`:key="i"` keys by position. When "Mouse" (index 1) is removed, "Monitor" shifts to index 1. Vue sees the vnode keyed `1` still exists, patches it in place with "Monitor" data — but the `v-if="item.onSale"` re-evaluates against the NEW data (Monitor, `onSale: false`), so the badge disappears. Meanwhile the vnode at index 0 ("Keyboard") was unkeyed-correct but if there were transient render states (CSS transitions, focus), they'd be attached to the wrong product.

The root cause: index keys make Vue treat positions as identity, not the actual data items.

**Fix** — key by stable id:

::code-wrapper{language="vue" filename="CartFixed.vue"}
```vue
<template>
  <div v-for="item in cart" :key="item.id">
    {{ item.name }}
    <span v-if="item.onSale">On Sale!</span>
    <button @click="cart.splice(cart.indexOf(item), 1)">Remove</button>
  </div>
</template>
```
::

**The lesson**: `:key` must identify *what the data represents*, never *where it currently sits in the array*. Index keys are only safe for lists that are never reordered, filtered, or spliced.

</details>