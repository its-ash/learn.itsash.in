# 06 — Component Communication

## Props Down, Events Up — the Core Pattern

The default, recommended communication pattern in Vue is unidirectional: parents pass data to children via **props**, and children notify parents of things that happened via **emitted events**. This keeps data flow traceable — for any piece of state, there's exactly one owner, and everyone else either reads a copy passed down or asks the owner to change it.

::code-wrapper{language="vue" filename="TodoItem.vue"}
```vue
<script setup>
defineProps({
  todo: { type: Object, required: true }
})

const emit = defineEmits(['toggle', 'delete'])
</script>

<template>
  <li>
    <input type="checkbox" :checked="todo.done" @change="emit('toggle', todo.id)" />
    <span :class="{ done: todo.done }">{{ todo.text }}</span>
    <button @click="emit('delete', todo.id)">×</button>
  </li>
</template>
```
::

::code-wrapper{language="vue" filename="TodoList.vue"}
```vue
<script setup>
import { ref } from 'vue'
import TodoItem from './TodoItem.vue'

const todos = ref([
  { id: 1, text: 'Learn Vue', done: false },
  { id: 2, text: 'Build something', done: false }
])

function toggleTodo(id) {
  const todo = todos.value.find(t => t.id === id)
  if (todo) todo.done = !todo.done
}

function deleteTodo(id) {
  todos.value = todos.value.filter(t => t.id !== id)
}
</script>

<template>
  <ul>
    <TodoItem
      v-for="todo in todos"
      :key="todo.id"
      :todo="todo"
      @toggle="toggleTodo"
      @delete="deleteTodo"
    />
  </ul>
</template>
```
::

`TodoList` owns `todos` and is the only place that mutates it. `TodoItem` never touches `todos` directly — it just renders what it's given and emits intent ("toggle this", "delete this"), leaving the decision of *how* to respond entirely to the parent.

## `v-model` on Components

`v-model` on a native input is sugar for a value binding plus a change listener (chapter 02). The exact same pattern works on custom components, using the `modelValue` prop and `update:modelValue` event convention:

::code-wrapper{language="vue" filename="CurrencyInput.vue"}
```vue
<script setup>
const props = defineProps({
  modelValue: { type: Number, required: true }
})
const emit = defineEmits(['update:modelValue'])

function onInput(event) {
  const parsed = parseFloat(event.target.value)
  emit('update:modelValue', Number.isNaN(parsed) ? 0 : parsed)
}
</script>

<template>
  <input type="number" :value="modelValue" @input="onInput" />
</template>
```
::

::code-wrapper{language="vue"}
```vue
<script setup>
import { ref } from 'vue'
import CurrencyInput from './CurrencyInput.vue'

const price = ref(19.99)
</script>

<template>
  <!-- expands to :model-value="price" @update:model-value="price = $event" -->
  <CurrencyInput v-model="price" />
  <p>Price: ${{ price.toFixed(2) }}</p>
</template>
```
::

### Named `v-model`s — multiple bindings on one component

A single component can expose more than one `v-model` by naming the argument:

::code-wrapper{language="vue" filename="UserNameFields.vue"}
```vue
<script setup>
defineProps({
  firstName: String,
  lastName: String
})
defineEmits(['update:firstName', 'update:lastName'])
</script>

<template>
  <input :value="firstName" @input="$emit('update:firstName', $event.target.value)" />
  <input :value="lastName" @input="$emit('update:lastName', $event.target.value)" />
</template>
```
::

::code-wrapper{language="vue"}
```vue
<template>
  <UserNameFields v-model:first-name="first" v-model:last-name="last" />
</template>
```
::

This replaces the deprecated Vue 2 `.sync` modifier entirely — named `v-model` arguments are the single, unified mechanism for both the default model and any number of additional two-way bindings.

## Provide / Inject

Props work well for one or two levels of nesting, but passing data through five intermediate components that don't themselves need it ("prop drilling") is painful to write and to refactor. `provide`/`inject` lets an ancestor make a value available to *any* descendant, at any depth, without threading it through every component in between:

::code-wrapper{language="vue" filename="App.vue"}
```vue
<script setup>
import { provide, ref, readonly } from 'vue'

const theme = ref('dark')

function setTheme(newTheme) {
  theme.value = newTheme
}

// Providing a readonly ref plus a dedicated setter function is the
// recommended pattern — it keeps the "who can change this" contract
// explicit, rather than letting any descendant mutate theme.value directly
provide('theme', readonly(theme))
provide('setTheme', setTheme)
</script>
```
::

::code-wrapper{language="vue" filename="DeeplyNestedWidget.vue"}
```vue
<script setup>
import { inject } from 'vue'

// second argument is a default value, used if no ancestor provided this key
const theme = inject('theme', 'light')
const setTheme = inject('setTheme', () => {})
</script>

<template>
  <div :class="theme">
    <button @click="setTheme('light')">Light</button>
    <button @click="setTheme('dark')">Dark</button>
  </div>
</template>
```
::

`DeeplyNestedWidget` never received `theme` as a prop — it could be nested ten levels deep under `App.vue` and this still works, with zero changes needed to any component in between.

### Provide/inject and the reactivity-loss trap

::code-wrapper{language="javascript"}
```javascript
import { provide, ref } from 'vue'

const count = ref(0)

// WRONG — provides the CURRENT number, not a live reactive reference
provide('count', count.value)

// RIGHT — provides the ref itself; consumers can read count.value reactively
provide('count', count)
```
::

Just like the destructuring trap in chapter 03, `provide('count', count.value)` unwraps the ref at the moment `provide` runs and hands descendants a frozen snapshot — later changes to `count.value` never reach anything that already injected it. Always provide the `ref`/`reactive` object itself, not an already-unwrapped value read out of it.

## Slots — Passing Template Content Down

Props pass data; **slots** pass template content — actual markup a parent wants rendered inside a child's layout. This is Vue's equivalent of React's `children` (default slot) or render props (scoped slots), and is covered in full depth in chapter 13. Here's the essential shape:

::code-wrapper{language="vue" filename="Card.vue"}
```vue
<template>
  <div class="card">
    <header v-if="$slots.header"><slot name="header" /></header>
    <div class="card-body"><slot /></div>
    <footer v-if="$slots.footer"><slot name="footer" /></footer>
  </div>
</template>
```
::

::code-wrapper{language="vue"}
```vue
<template>
  <Card>
    <template #header>
      <h3>Order #4471</h3>
    </template>

    <p>3 items, shipping to New York.</p>

    <template #footer>
      <button>Track Order</button>
    </template>
  </Card>
</template>
```
::

`Card` decides the *structure* (a header, a body, a footer); the parent decides the *content* that fills each slot. This is a fundamentally different axis of communication than props — it's the child delegating rendering control back to the parent for specific regions, rather than the parent handing the child raw data to render itself.

## Choosing the Right Communication Mechanism

| Mechanism | Direction | Best for |
|---|---|---|
| Props | Parent → child | Passing data a child needs to render or compute with. |
| Emits | Child → parent | Notifying a parent that something happened (click, submit, delete). |
| `v-model` | Two-way | A component that wraps and edits a single value the parent owns. |
| Provide/Inject | Ancestor → any descendant | Deeply-nested shared context (theme, current user, i18n) without prop drilling. |
| Slots | Parent → child (content, not data) | Letting a parent customize *what renders*, not just what data is used. |
| Pinia (chapter 10) | Global | State genuinely shared across unrelated parts of the app, not just an ancestor/descendant relationship. |

A common mistake is reaching for provide/inject (or Pinia) as a shortcut past normal prop drilling for state that's really only shared between a parent and its direct child — if the component tree is only one or two levels deep, plain props/emits are simpler to trace and should be preferred; provide/inject earns its complexity when the depth or breadth of prop drilling becomes the actual problem.

## Options API Equivalents

::code-wrapper{language="vue"}
```vue
<script>
export default {
  provide() {
    return { theme: this.theme }   // NOTE: loses reactivity unless using computed()
  },
  data() {
    return { theme: 'dark' }
  }
}
</script>
```
::

::code-wrapper{language="vue"}
```vue
<script>
export default {
  inject: ['theme'],
  emits: ['toggle', 'delete'],
  props: {
    todo: { type: Object, required: true }
  },
  methods: {
    onToggle() {
      this.$emit('toggle', this.todo.id)
    }
  }
}
</script>
```
::

The Options API's `provide()` option is a common source of the same reactivity-loss bug shown above — `this.theme` inside `provide()` reads the plain current value at component creation time; you must explicitly wrap it (`provide() { return { theme: computed(() => this.theme) } }`) to keep it reactive, which is easy to forget since it looks like ordinary property access.

## 💡 Tips & Tricks

- **Idiom** — Use Symbol keys instead of string keys for `provide`/`inject` in larger codebases (`export const ThemeKey = Symbol('theme')`) — it avoids silent key collisions between unrelated features that happened to both choose the string `'theme'`, and gives you a single importable source of truth for the key.
- **Debug** — Vue DevTools doesn't show provide/inject relationships as clearly as props — if a deeply nested component's injected value seems wrong, temporarily log it at both the `provide()` call site and the `inject()` call site to confirm which ancestor is actually supplying it (there could be more than one provider of the same key at different levels).
- **Idiom** — For a component library's public API, prefer named `v-model`s over an ad-hoc mix of custom props/events for anything that's fundamentally "the value this component represents" — it signals two-way-bindability to the consumer through a syntax they already know from native inputs.
- **Idiom** — Always provide a default value as `inject`'s second argument (`inject('theme', 'light')`) for anything not guaranteed to have a provider — omitting it throws no error but yields `undefined`, which can propagate confusingly far before surfacing as a bug.
- **Debug** — When a slot conditionally renders based on whether content was passed (`v-if="$slots.header"`), remember `$slots` reflects the *current* render — a `v-if` on the parent's slot content toggling on and off is exactly the case this check is designed to handle.

## ⚠️ Edge Cases & Gotchas

- **Providing `ref.value` instead of `ref` freezes a snapshot** — Exactly like destructuring a `reactive` object, `provide('key', someRef.value)` hands descendants a plain, disconnected value. Always `provide('key', someRef)` (or a `computed`) so injectors read through to live updates.
- **`provide`/`inject` isn't reactive by nature — you have to provide reactive sources** — `provide` itself doesn't add reactivity; it's a dependency-injection mechanism. If what you provide is already reactive (a `ref`, a `reactive` object, a `computed`), consumers get live updates; if you provide a plain value, they get a frozen snapshot, full stop.
- **Multiple providers of the same key shadow each other by proximity, not by "first" or "last" in some global sense** — `inject('theme')` resolves to the *nearest* ancestor that called `provide('theme', ...)`, walking up the component tree from the injecting component — a component can be nested under two different providers of the same key at different levels, and only the closer one wins.
- **`v-model` without an argument defaults to `modelValue`/`update:modelValue` — mixing it with a manually-named prop called `modelValue` elsewhere is a common naming collision** — if a component already has an unrelated `modelValue` prop for some other purpose, adding standard `v-model` support to the same component requires renaming one of them via a named `v-model` argument to avoid the two colliding.
- **Emitting an event with the same name as a native DOM event without declaring `emits` can double-fire** — If a component emits a custom `click` event that isn't declared in `emits`, and a parent listens with `@click`, Vue can't distinguish "this is the component's custom emit" from "this is a native DOM click bubbling from inside the component" — declaring `emits: ['click']` tells Vue to treat it purely as a component event, not a native listener.

## 🧠 Spot the Bug

A settings sidebar provides the current user to every descendant. A profile badge three levels down never updates when the user's name changes elsewhere in the app.

::code-wrapper{language="vue" filename="AppShell.vue"}
```vue
<script setup>
import { provide, reactive } from 'vue'

const currentUser = reactive({ name: 'Ada', avatar: '/ada.png' })

provide('currentUser', { ...currentUser })

function renameUser(newName) {
  currentUser.name = newName
}
</script>
```
::

<details>
<summary>Answer</summary>

`{ ...currentUser }` spreads `currentUser`'s properties into a brand-new plain object at the moment `provide` runs — this is the object-spread equivalent of destructuring, and it produces the same disconnection: a one-time copy with no live link back to the reactive source. When `renameUser` later mutates `currentUser.name`, the spread copy already handed to every descendant via `provide` is untouched.

::code-wrapper{language="javascript"}
```javascript
import { provide, reactive } from 'vue'

const currentUser = reactive({ name: 'Ada', avatar: '/ada.png' })

// RIGHT — provide the reactive object itself, not a spread copy
provide('currentUser', currentUser)

function renameUser(newName) {
  currentUser.name = newName
}
```
::

**The lesson**: any operation that reads properties out of a reactive source and builds a new plain object or array from them — destructuring, spreading, `Object.assign({}, reactiveObj)` — severs the reactive link. `provide`, like function returns and template refs, must be handed the reactive source directly to stay live.

</details>

## Key Takeaways

- Props flow down, events flow up — this remains the default, most traceable communication pattern for parent/child relationships.
- `v-model` on a component is sugar for a `modelValue` prop plus an `update:modelValue` emit; named arguments (`v-model:first-name`) support multiple independent two-way bindings on one component.
- `provide`/`inject` avoids prop drilling for deeply-shared context, but only stays reactive if you provide the reactive source itself (a `ref`/`reactive`/`computed`), never an already-unwrapped snapshot.
- Slots pass template content, not data — a fundamentally different axis of parent/child communication from props, letting a parent control what renders inside a child's structure.
- `inject` resolves to the nearest matching ancestor `provide` call, not a single global registry — the same key can mean different things at different points in the tree.
- Reach for provide/inject or Pinia only once plain props/emits genuinely become unwieldy — for shallow trees, explicit prop drilling is easier to trace than implicit injection.
