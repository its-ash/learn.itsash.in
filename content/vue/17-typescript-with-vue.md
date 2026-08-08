# 17 — TypeScript with Vue

## Project Setup

`create-vue` (chapter 01) scaffolds TypeScript support automatically when selected. The key pieces are `vue-tsc` (type-checks `.vue` files, which `tsc` alone can't parse) and the `Vue - Official` extension's language server (which needs `vue-tsc`'s same understanding to give accurate editor feedback):

::code-wrapper{language="bash"}
```bash
npm create vue@latest
# ✔ Add TypeScript? › Yes

npm run type-check   # runs vue-tsc across the project
```
::

::code-wrapper{language="vue" filename="Counter.vue"}
```vue
<script setup lang="ts">
import { ref } from 'vue'

const count = ref<number>(0)
// type inference works fine without the annotation too — ref(0) infers Ref<number>
</script>
```
::

## Typing Props with `defineProps`

### Runtime declaration (works in plain JS too, less precise)

::code-wrapper{language="typescript"}
```typescript
defineProps({
  title: { type: String, required: true },
  count: { type: Number, default: 0 }
})
```
::

### Type-only declaration (TypeScript-only, more expressive)

::code-wrapper{language="vue" filename="UserCard.vue"}
```vue
<script setup lang="ts">
interface Props {
  title: string
  count?: number
  status: 'active' | 'inactive' | 'pending'
  onSelect?: (id: number) => void
}

const props = withDefaults(defineProps<Props>(), {
  count: 0
})
</script>
```
::

The type-only syntax supports things the runtime object syntax cannot express at all — union/literal types (`'active' | 'inactive' | 'pending'`), function-typed props, and nested object shapes — at the cost of losing runtime validation (no dev-mode console warning if a caller passes the wrong shape, since there's no runtime `type: String` check backing it). `withDefaults` is required to supply default values for optional properties in this syntax, since plain destructuring defaults inside `defineProps<Props>()`'s type parameter aren't supported the way they are in the object syntax.

## Typing Emits

::code-wrapper{language="vue" filename="UserCard.vue"}
```vue
<script setup lang="ts">
const emit = defineEmits<{
  select: [id: number]
  delete: [id: number, reason: string]
  'update:modelValue': [value: string]
}>()

function handleClick(id: number) {
  emit('select', id)          // typo'd event names or wrong argument types are compile errors
}
</script>
```
::

This tuple-based syntax (Vue 3.3+) replaced an earlier, clunkier call-signature-based form — `emit('select', id)` now gets full autocomplete and argument type-checking at the call site, catching a mistyped event name or a wrong argument count/type before runtime rather than only via a console warning.

## Typing `ref`, `reactive`, and `computed`

::code-wrapper{language="typescript"}
```typescript
import { ref, reactive, computed, type Ref } from 'vue'

const count = ref(0)                 // inferred as Ref<number>
const user = ref<User | null>(null)  // explicit annotation needed — inference from `null` alone would be Ref<null>

interface User {
  id: number
  name: string
}

const state = reactive<{ users: User[]; loading: boolean }>({
  users: [],
  loading: false
})

const activeUsers = computed<User[]>(() => state.users.filter((u) => u.id > 0))

// accepting a ref as a function parameter
function double(numberRef: Ref<number>) {
  return numberRef.value * 2
}
```
::

`ref<User | null>(null)` is the standard pattern for "starts empty, populated later by an async fetch" state — without the explicit type parameter, TypeScript would infer `Ref<null>` from the initial value alone, making any later assignment of an actual `User` a type error.

## Typing Template Refs

::code-wrapper{language="vue" filename="AutoFocusInput.vue"}
```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'

// must be typed as the exact underlying DOM element type, initialized to null
const inputEl = ref<HTMLInputElement | null>(null)

onMounted(() => {
  // non-null assertion (!) or optional chaining (?.) is required here —
  // TypeScript can't know onMounted guarantees the DOM element now exists
  inputEl.value?.focus()
})
</script>

<template>
  <input ref="inputEl" />
</template>
```
::

::code-wrapper{language="vue" filename="ParentComponent.vue"}
```vue
<script setup lang="ts">
import { ref } from 'vue'
import SearchInput from './SearchInput.vue'

// typing a ref to a CHILD COMPONENT instance uses InstanceType
const searchRef = ref<InstanceType<typeof SearchInput> | null>(null)

function focusSearch() {
  searchRef.value?.focus()   // only methods the child exposed via defineExpose are visible here
}
</script>
```
::

## Typing Composables

::code-wrapper{language="typescript" filename="composables/useFetch.ts"}
```typescript
import { ref, type Ref } from 'vue'

interface UseFetchResult<T> {
  data: Ref<T | null>
  error: Ref<Error | null>
  isLoading: Ref<boolean>
}

export function useFetch<T>(url: string): UseFetchResult<T> {
  const data = ref<T | null>(null) as Ref<T | null>
  const error = ref<Error | null>(null)
  const isLoading = ref(true)

  fetch(url)
    .then((res) => res.json())
    .then((json: T) => { data.value = json })
    .catch((err) => { error.value = err })
    .finally(() => { isLoading.value = false })

  return { data, error, isLoading }
}
```
::

::code-wrapper{language="vue" filename="UserProfile.vue"}
```vue
<script setup lang="ts">
interface User {
  id: number
  name: string
}

// the explicit <User> type parameter flows through data.value's type entirely
const { data: user, error, isLoading } = useFetch<User>('/api/users/me')
</script>

<template>
  <p v-if="user">{{ user.name }}</p>
</template>
```
::

The `as Ref<T | null>` cast inside `useFetch` is a common, generally-accepted workaround — `ref<T | null>(null)` where `T` is a generic type parameter sometimes needs an assist because TypeScript's inference for `ref()` combined with a generic default value can be imprecise; this is a known rough edge of typing generic composables, not a sign of a design mistake.

## Generic Components

::code-wrapper{language="vue" filename="GenericList.vue"}
```vue
<script setup lang="ts" generic="T">
defineProps<{
  items: T[]
  keyField: keyof T
}>()

defineSlots<{
  default(props: { item: T; index: number }): unknown
}>()
</script>

<template>
  <ul>
    <li v-for="(item, index) in items" :key="String(item[keyField])">
      <slot :item="item" :index="index" />
    </li>
  </ul>
</template>
```
::

::code-wrapper{language="vue"}
```vue
<script setup lang="ts">
interface Product { id: number; name: string; price: number }

const products: Product[] = [{ id: 1, name: 'Widget', price: 9.99 }]
</script>

<template>
  <!-- T is inferred as Product here — the slot's `item` is fully typed
       as Product, not `unknown`, inside this exact usage -->
  <GenericList :items="products" keyField="id" v-slot="{ item }">
    {{ item.name }} — ${{ item.price.toFixed(2) }}
  </GenericList>
</template>
```
::

The `generic="T"` attribute on `<script setup>` (Vue 3.3+) is what makes a genuinely reusable, type-safe list/table component possible — without it, `items: T[]` would have no `T` to bind to, and the slot's `item` would have to be typed as `any` or a specific concrete type, defeating the point of a generic component.

## Typing Pinia Stores

Pinia infers types automatically from a setup store's returned refs/computed/functions — no extra annotation needed for the common case:

::code-wrapper{language="typescript" filename="stores/counter.ts"}
```typescript
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  const doubled = computed(() => count.value * 2)
  function increment() { count.value++ }

  return { count, doubled, increment }
})
// useCounterStore()'s return type is fully inferred — count: number,
// doubled: number, increment: () => void — with zero manual typing
```
::

## Augmenting `RouteMeta` and Component Props Globally

::code-wrapper{language="typescript" filename="router/types.d.ts"}
```typescript
import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    title?: string
  }
}
```
::

Without this module augmentation, `to.meta.requiresAuth` in a navigation guard (chapter 11) would type-check as `any`-ish/unknown territory — declaring the shape once, globally, gives every navigation guard and `useRoute()` call full autocomplete and type safety on `meta` fields across the whole app.

## Options API with TypeScript

::code-wrapper{language="vue"}
```vue
<script lang="ts">
import { defineComponent } from 'vue'

// defineComponent is required (not just export default {...}) for the
// Options API to get correct `this` typing for props/data/computed
export default defineComponent({
  props: {
    userId: { type: Number, required: true }
  },
  data() {
    return { name: '' as string }
  },
  computed: {
    displayName(): string {
      return this.name || `User #${this.userId}`
    }
  }
})
</script>
```
::

## 💡 Tips & Tricks

- **Idiom** — Prefer the type-only `defineProps<Props>()` syntax over the runtime object syntax for any prop with a union, literal, function, or nested object type — it's the only syntax that can express those shapes at all, and reserve the runtime object syntax for simple primitive props where its dev-mode runtime validation is worth keeping.
- **Debug** — Run `vue-tsc --noEmit` (via `npm run type-check`) in CI, not just relying on editor red squiggles — `.vue` SFCs aren't understood by plain `tsc`, so a CI pipeline running bare `tsc` silently skips checking all your templates and `<script setup>` blocks entirely.
- **Idiom** — Type a template ref to a DOM element as `ref<HTMLInputElement | null>(null)` (the specific element type, not generic `HTMLElement`) — this unlocks element-specific properties/methods (`.focus()`, `.value`, `.select()`) with full autocomplete instead of requiring casts later.
- **Idiom** — Use `InstanceType<typeof ChildComponent>` to type a template ref pointed at a child component instance — this is the standard, and only reliable, way to get autocomplete for whatever the child exposed via `defineExpose`.
- **Debug** — When a generic composable's `ref<T | null>(null)` return type looks wrong or too narrow, an explicit `as Ref<T | null>` cast at the return site is a normal, accepted fix — this is a known TypeScript inference limitation with generics plus `ref()`, not a sign your composable's design is flawed.

## ⚠️ Edge Cases & Gotchas

- **The type-only `defineProps<Props>()` syntax has no runtime validation at all** — Unlike the object syntax's `type: String` (which logs a dev-mode console warning on a type mismatch), a type-only prop declaration is purely a compile-time contract; a JavaScript caller (or a TypeScript caller using `as any` to bypass the check) that passes the wrong shape gets zero runtime feedback, only whatever breaks downstream when the value is actually used.
- **`withDefaults` is required for optional-with-default props in the type-only syntax — plain JS default parameter syntax doesn't work inside the type parameter** — Writing `defineProps<{ count?: number }>()` and expecting some inline default mechanism inside the type itself is not supported; the default must be supplied via `withDefaults(defineProps<Props>(), { count: 0 })`, a separate, easy-to-forget wrapping call.
- **`ref<T>(initialValue)` inference from a literal `null`/`undefined` initial value narrows too aggressively without an explicit type parameter** — `ref(null)` infers `Ref<null>`, not `Ref<SomeType | null>` — any later assignment of a real value becomes a type error until you go back and add the explicit `ref<SomeType | null>(null)` annotation.
- **`vue-tsc` and your editor's language server can disagree transiently after certain refactors (renaming a `.vue` file, moving a generic component)** — Restarting the TypeScript server (or the editor's Vue extension specifically) resolves the vast majority of "the types are definitely right but the editor still shows an error" situations — don't assume a real type error before trying that.
- **Generic components (`generic="T"`) require Vue 3.3+ and are understood only by tooling that's aware of the attribute** — Older `vue-tsc`/editor extension versions either ignore the attribute (falling back to `any`-like behavior) or error outright — verify tooling versions specifically when introducing generic components to a codebase that hasn't used them before.

## 🧠 Spot the Bug

A composable is supposed to return strongly-typed user data, but consuming components report `user.value.name` as a type error even after the fetch clearly succeeds at runtime.

::code-wrapper{language="typescript" filename="composables/useUser.ts"}
```typescript
import { ref } from 'vue'

interface User {
  id: number
  name: string
}

export function useUser(id: number) {
  const user = ref<User | null>(null)

  fetch(`/api/users/${id}`)
    .then((res) => res.json())
    .then((data) => {
      user.value = data
    })

  return { user }
}
```
::

::code-wrapper{language="vue"}
```vue
<script setup lang="ts">
import { useUser } from '@/composables/useUser'

const { user } = useUser(1)
</script>

<template>
  <!-- editor reports: Object is possibly 'null' -->
  <p>{{ user.value.name }}</p>
</template>
```
::

<details>
<summary>Answer</summary>

This isn't actually a bug in the composable — `user` is correctly typed as `Ref<User | null>`, and the template is accessing `user.value.name` without first narrowing away the `null` case, which TypeScript correctly flags as unsafe: at the type level, nothing guarantees the fetch has resolved by the time the template renders, even though *in this particular runtime sequence* it usually has by the time a user reads the page. The type system doesn't know about timing, only about the declared type `User | null`, and `null` is a real possibility it must account for.

::code-wrapper{language="vue"}
```vue
<script setup lang="ts">
import { useUser } from '@/composables/useUser'

const { user } = useUser(1)
</script>

<template>
  <p v-if="user">{{ user.name }}</p>
  <p v-else>Loading…</p>
</template>
```
::

**The lesson**: a `Ref<T | null>` return type from a composable is telling the truth about a real, meaningful state (data hasn't loaded yet) — the fix is to actually handle that state in the template (`v-if="user"`, exactly the loading-state pattern from chapter 12), not to suppress the type error with a non-null assertion (`user.value!.name`), which would just convert a caught compile-time bug into an uncaught runtime crash the one time the fetch is genuinely still pending.

</details>

## Key Takeaways

- The type-only `defineProps<Props>()`/`defineEmits<{...}>()` syntax expresses shapes (unions, functions, nested objects) the runtime object syntax can't, at the cost of losing runtime validation — use `withDefaults` for optional prop defaults in that syntax.
- Type template refs to DOM elements with the specific element type (`HTMLInputElement | null`), and to child component instances with `InstanceType<typeof Component>`.
- Generic composables sometimes need an `as Ref<T | null>` cast on their return — a known, accepted TypeScript-plus-`ref()` inference limitation, not a design flaw.
- `generic="T"` on `<script setup>` (3.3+) enables genuinely type-safe, reusable generic components including typed scoped slots via `defineSlots`.
- Pinia setup stores infer their consumer-facing types automatically from returned refs/computed/functions — no manual store typing needed for the common case.
- `vue-tsc`, not plain `tsc`, is required to type-check `.vue` files — make sure CI runs it, since a bare `tsc` run silently skips template and `<script setup>` type errors entirely.
