# 02 — Template Syntax & Directives

## Text Interpolation

The most basic form of data binding is "mustache" interpolation — text inside `{{ }}` is evaluated as a JavaScript expression and re-rendered whenever its dependencies change:

::code-wrapper{language="vue" filename="Greeting.vue"}
```vue
<script setup>
import { ref } from 'vue'

const user = ref({ name: 'Ada', role: 'admin' })
</script>

<template>
  <p>Hello, {{ user.name }}!</p>
  <p>{{ user.role === 'admin' ? 'Full access' : 'Limited access' }}</p>
  <p>{{ user.name.toUpperCase() }}</p>
</template>
```
::

Interpolation accepts any single JavaScript **expression** — ternaries, method calls, arithmetic — but not statements (`if`, `for`) and not multiple statements separated by `;`. Each interpolated value is automatically HTML-escaped, which is what makes `{{ }}` safe against XSS by default (see chapter 22 for the unsafe alternative, `v-html`).

## `v-bind` — Binding Attributes

`v-bind` binds a JavaScript expression to an HTML attribute or a component prop. The shorthand `:` is used almost universally in real code:

::code-wrapper{language="vue" filename="Avatar.vue"}
```vue
<script setup>
import { ref, computed } from 'vue'

const imageId = ref(42)
const isOnline = ref(true)
const size = ref(48)

const imageUrl = computed(() => `https://api.example.com/avatars/${imageId.value}.png`)
</script>

<template>
  <!-- long form -->
  <img v-bind:src="imageUrl" v-bind:alt="'User avatar'" />

  <!-- shorthand — what you'll see in virtually all real code -->
  <img :src="imageUrl" :alt="'User avatar'" />

  <!-- class binding: object syntax toggles classes based on truthiness -->
  <div :class="{ online: isOnline, offline: !isOnline }">Status</div>

  <!-- class binding: array syntax combines multiple sources -->
  <div :class="[isOnline ? 'online' : 'offline', 'badge']">Status</div>

  <!-- style binding: object syntax with camelCase CSS properties -->
  <div :style="{ width: size + 'px', height: size + 'px', borderRadius: '50%' }" />

  <!-- binding an entire object of attributes at once -->
  <img v-bind="{ src: imageUrl, alt: 'User avatar', loading: 'lazy' }" />
</template>
```
::

### Boolean attributes

HTML boolean attributes (`disabled`, `checked`, `required`) are present-or-absent, not true-or-false strings. Vue handles this correctly when you bind them:

::code-wrapper{language="vue"}
```vue
<template>
  <!-- isSubmitting: false → attribute omitted entirely; true → attribute present -->
  <button :disabled="isSubmitting">Submit</button>
</template>
```
::

## Conditional Rendering — `v-if`, `v-else-if`, `v-else`, `v-show`

::code-wrapper{language="vue" filename="OrderStatus.vue"}
```vue
<script setup>
import { ref } from 'vue'

const status = ref('pending')
</script>

<template>
  <p v-if="status === 'pending'">Order is being processed…</p>
  <p v-else-if="status === 'shipped'">Order is on its way!</p>
  <p v-else-if="status === 'delivered'">Order delivered.</p>
  <p v-else>Unknown status: {{ status }}</p>
</template>
```
::

`v-if` (and its siblings) physically add or remove elements from the DOM — the element and its component instance are destroyed and recreated on toggle, running full lifecycle hooks each time. `v-show` instead always renders the element and toggles CSS `display: none`, keeping the component instance alive:

::code-wrapper{language="vue"}
```vue
<template>
  <!-- v-if: expensive to toggle often (destroys/recreates), cheap when rarely shown -->
  <ExpensiveChart v-if="showChart" />

  <!-- v-show: cheap to toggle often (just CSS), costs an initial render even when hidden -->
  <div v-show="isTooltipVisible" class="tooltip">Helpful hint</div>
</template>
```
::

Rule of thumb: use `v-show` for things toggled frequently (tooltips, tabs flipped rapidly), `v-if` for things toggled rarely or that are expensive to keep mounted (a chart library instance, a video player).

### `v-if` on `<template>` — grouping without a wrapper element

::code-wrapper{language="vue"}
```vue
<template>
  <template v-if="user.isAdmin">
    <h2>Admin Panel</h2>
    <AdminControls />
    <AuditLog />
  </template>
</template>
```
::

`<template>` here is a purely logical wrapper — it never renders an actual DOM element, which avoids polluting your markup with a `<div>` that exists only to hold a `v-if`.

## List Rendering — `v-for` and the Mandatory `:key`

::code-wrapper{language="vue" filename="TodoList.vue"}
```vue
<script setup>
import { ref } from 'vue'

const todos = ref([
  { id: 1, text: 'Learn Vue', done: true },
  { id: 2, text: 'Build a project', done: false }
])
</script>

<template>
  <!-- array with index -->
  <li v-for="(todo, index) in todos" :key="todo.id">
    {{ index }}: {{ todo.text }}
  </li>

  <!-- plain object: value, key, index -->
  <li v-for="(value, key, index) in { name: 'Ada', role: 'admin' }" :key="key">
    {{ index }}. {{ key }}: {{ value }}
  </li>

  <!-- range: 1 through n (inclusive), not zero-indexed -->
  <span v-for="n in 5" :key="n">{{ n }}</span>
</template>
```
::

`:key` is not optional in any real application. Vue uses `key` to match old vnodes to new ones during a re-render — without a stable, unique key, Vue falls back to patching elements **in-place by position**, which reuses DOM nodes for the wrong data.

### The classic `:key="index"` bug

::code-wrapper{language="vue" filename="TodoList.vue"}
```vue
<script setup>
import { ref } from 'vue'

const todos = ref([
  { id: 1, text: 'Buy milk' },
  { id: 2, text: 'Walk the dog' },
  { id: 3, text: 'Write report' }
])

function removeFirst() {
  todos.value.shift()
}
</script>

<template>
  <!-- WRONG: index as key -->
  <div v-for="(todo, index) in todos" :key="index">
    <input type="checkbox" />
    {{ todo.text }}
  </div>
  <button @click="removeFirst">Remove first</button>
</template>
```
::

Check any checkbox, then click "Remove first". The *checked state moves down to whichever item now occupies that index* — because when the array shrinks, Vue diffs by key, sees the same keys `0, 1` still exist (just pointing at different todos now), and reuses those DOM nodes (including their checked state) in place rather than removing the node for the deleted item. The fix is always a **stable identifier that travels with the data**, typically a database ID:

::code-wrapper{language="vue"}
```vue
<template>
  <!-- RIGHT: stable id as key -->
  <div v-for="todo in todos" :key="todo.id">
    <input type="checkbox" />
    {{ todo.text }}
  </div>
</template>
```
::

Now Vue sees that the vnode keyed `1` (Buy milk) is gone entirely, and correctly removes exactly that DOM node — the checkbox on "Walk the dog" stays wherever its own state was.

### `v-for` with `v-if` on the same element

::code-wrapper{language="vue"}
```vue
<template>
  <!-- Vue 3.x: v-if has HIGHER precedence than v-for on the same element, -->
  <!-- so `todo` here is undefined — this throws or silently fails -->
  <li v-for="todo in todos" v-if="!todo.done" :key="todo.id">{{ todo.text }}</li>
</template>
```
::

Vue 3's compiler evaluates `v-if` before `v-for` is even in scope when both sit on the same element, unlike Vue 2 where `v-for` won. The fix — used universally — is to filter with a `computed` or move `v-if` to a wrapping `<template>`:

::code-wrapper{language="vue"}
```vue
<script setup>
import { ref, computed } from 'vue'

const todos = ref([
  { id: 1, text: 'Buy milk', done: true },
  { id: 2, text: 'Walk the dog', done: false }
])

const remaining = computed(() => todos.value.filter(t => !t.done))
</script>

<template>
  <li v-for="todo in remaining" :key="todo.id">{{ todo.text }}</li>
</template>
```
::

## Event Handling — `v-on`

::code-wrapper{language="vue" filename="SearchBox.vue"}
```vue
<script setup>
import { ref } from 'vue'

const query = ref('')
const results = ref([])

function search() {
  console.log('searching for', query.value)
}

function clear(event) {
  query.value = ''
  event.target.blur()
}
</script>

<template>
  <!-- long form -->
  <input v-on:input="search" />

  <!-- shorthand — what you'll see everywhere -->
  <input @input="search" />

  <!-- inline expression, receives the native event as $event -->
  <button @click="query = ''">Clear</button>

  <!-- method reference — Vue automatically passes the native event -->
  <button @click="clear">Clear</button>

  <!-- passing your own args AND the native event -->
  <button @click="removeResult(result.id, $event)">Remove</button>
</template>
```
::

### Event modifiers

::code-wrapper{language="vue"}
```vue
<template>
  <form @submit.prevent="onSubmit">        <!-- calls preventDefault() -->
  <div @click.stop="onClick">              <!-- calls stopPropagation() -->
  <div @click.self="onBackdropClick">      <!-- only if event.target IS this element -->
  <input @keyup.enter="onEnter">           <!-- key-specific listener -->
  <input @keyup.esc="onEscape">
  <a @click.once="onFirstClickOnly">       <!-- listener removed after first trigger -->
  <div @scroll.passive="onScroll">         <!-- tells browser you won't preventDefault -->
</template>
```
::

`.prevent` and `.stop` replace manually writing `event.preventDefault()` / `event.stopPropagation()` inside the handler, and modifiers can be chained: `@click.stop.prevent="onClick"`.

## `v-model` — the Basics

`v-model` is syntactic sugar for binding a value and listening for its change event in one directive. On a plain `<input>`, `v-model="query"` expands to `:value="query"` + `@input="query = $event.target.value"`:

::code-wrapper{language="vue" filename="ProfileForm.vue"}
```vue
<script setup>
import { ref } from 'vue'

const name = ref('')
const bio = ref('')
const country = ref('us')
const subscribed = ref(false)
const plan = ref('free')
</script>

<template>
  <input v-model="name" type="text" placeholder="Name" />
  <textarea v-model="bio" placeholder="Bio" />

  <select v-model="country">
    <option value="us">United States</option>
    <option value="ca">Canada</option>
    <option value="in">India</option>
  </select>

  <input v-model="subscribed" type="checkbox" /> Subscribe to newsletter

  <label><input v-model="plan" type="radio" value="free" /> Free</label>
  <label><input v-model="plan" type="radio" value="pro" /> Pro</label>
</template>
```
::

`v-model` adapts to the element type automatically: text inputs/textareas bind `value`, checkboxes bind `checked`, `<select>` binds `value` on the selected `<option>`. Modifiers (`.lazy`, `.number`, `.trim`) and using `v-model` on your own custom components are covered in depth in chapter 09.

## Attribute vs Property Bindings, and `v-html`

`{{ }}` and `v-bind` both escape their output as text. To render raw HTML (rare, and dangerous with untrusted content — see chapter 22), use `v-html`:

::code-wrapper{language="vue"}
```vue
<script setup>
import { ref } from 'vue'
const trustedSummary = ref('<strong>Bold</strong> summary from our own CMS')
</script>

<template>
  <!-- escaped: literally shows "<strong>Bold</strong> summary..." as text -->
  <p>{{ trustedSummary }}</p>

  <!-- renders as actual HTML: shows "Bold summary..." with bold applied -->
  <p v-html="trustedSummary"></p>
</template>
```
::

## 💡 Tips & Tricks

- **Idiom** — `v-bind="object"` spreads an entire object of attributes at once — useful for forwarding a bag of props/attrs to a native element or child component without listing them individually.
- **Debug** — Multi-line expressions and function calls with side effects don't belong in templates. If an interpolation or binding is hard to read at a glance, extract it into a `computed` — templates should stay declarative, not host business logic.
- **Idiom** — `v-for` ranges (`v-for="n in 5"`) start at `1`, not `0` — useful for pagination UI (`Page {{ n }}`) without an off-by-one subtraction.
- **Performance** — `v-once` renders an element/component exactly once and skips it on all future re-renders — useful for content that is genuinely static after first render (see chapter 19 for more on this and `v-memo`).
- **Idiom** — Class object syntax (`:class="{ active: isActive }"`) reads more clearly than string concatenation or ternaries once you have more than one conditional class, and combines cleanly with a static class attribute: `class="badge" :class="{ active: isActive }"` merges both.

## ⚠️ Edge Cases & Gotchas

- **`v-if` + `v-for` precedence trap** — On the same element, Vue 3's compiler resolves `v-if` before `v-for`, so the loop variable isn't in scope yet and the condition silently evaluates against the outer scope (or throws, depending on what's referenced). Always move the filter into a `computed` or wrap with `<template v-for>` + inner `v-if`.
- **`:key="index"` breaks stateful list items** — Using the array index as `:key` causes Vue to reuse DOM nodes by position rather than identity when the list is reordered, filtered, or spliced — form input values, checked states, and CSS transition states can visibly "jump" to the wrong row. Always key by a stable, unique identifier from the data itself.
- **Boolean attribute binding vs string `"false"`** — `<button :disabled="isDisabled">` correctly removes the attribute when `isDisabled` is `false`. But `<button disabled="false">` (a literal string, not a binding) still renders the `disabled` attribute — HTML treats *any* value, including the string `"false"`, as present. This trips up developers coming from languages where string `"false"` is falsy.
- **`v-html` bypasses Vue's built-in XSS protection** — Interpolation and `v-bind` escape content automatically; `v-html` explicitly opts out for that one binding. Passing user-generated content (comments, bios, markdown-rendered HTML) through `v-html` without sanitizing it first is a direct XSS vector — see chapter 22.
- **`v-for` on an object iterates in insertion order, not the order you'd expect from other languages** — Modern JS engines guarantee `for...in`/`Object.keys()` order as: integer-like keys ascending first, then string keys in insertion order. `v-for="(v, k) in obj"` follows the same rule, which can surprise you if you expect alphabetical order or the exact order you wrote the object literal.

## 🧠 Spot the Bug

A shopping cart lets users remove items. After removing the second item, the *wrong* item's "on sale" badge appears on the remaining rows.

::code-wrapper{language="vue"}
```vue
<script setup>
import { ref } from 'vue'

const cart = ref([
  { id: 101, name: 'Keyboard', onSale: false },
  { id: 102, name: 'Mouse', onSale: true },
  { id: 103, name: 'Monitor', onSale: false }
])

function remove(index) {
  cart.value.splice(index, 1)
}
</script>

<template>
  <div v-for="(item, index) in cart" :key="index">
    {{ item.name }}
    <span v-if="item.onSale">On Sale!</span>
    <button @click="remove(index)">Remove</button>
  </div>
</template>
```
::

<details>
<summary>Answer</summary>

`:key="index"` keys each row by its position, not by the product it represents. When "Mouse" (index 1) is removed, "Monitor" shifts from index 2 to index 1. Vue sees that the vnode keyed `1` still exists (it just now renders "Monitor" instead of "Mouse") and patches the existing DOM node's text and `onSale` binding in place — but any internal state that Vue didn't think to re-derive (in more complex cases: focus, transition state, or memoized child component state) stays attached to the DOM position, not the product. Here the visible symptom is the sale badge appearing to "belong" to the wrong row transiently during the patch in more complex real components.

The fix is to key by the item's own identity:

::code-wrapper{language="vue"}
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

**The lesson**: `:key` must identify *what the data represents*, never *where it currently sits in the array* — index keys only work safely for lists that are never reordered, filtered, or spliced.

</details>

## Key Takeaways

- `{{ }}` interpolation and `v-bind`/`:` escape output by default; `v-html` opts out and must never be used on untrusted content.
- `v-if` physically adds/removes elements (and runs lifecycle hooks); `v-show` toggles CSS `display` and keeps the instance mounted — pick based on toggle frequency and mount cost.
- `v-for` requires a stable, unique `:key` derived from the data's own identity, never the loop index, or list mutations will corrupt per-row state.
- `v-if` and `v-for` on the same element resolve `v-if` first in Vue 3 — filter with a `computed` instead of combining them directly.
- `v-on`/`@` modifiers (`.prevent`, `.stop`, `.once`, `.self`) replace manual `event` method calls inside handlers.
- `v-model` is sugar over a value binding plus a change listener, and adapts automatically to the target element type.
