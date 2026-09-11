---
title: Vue 3 Engineering Reference — TypeScript with Vue
description: defineProps/defineEmits generics, component instance typing, defineModel type safety, provide/inject InjectionKey typing, composable generics, and type narrowing in templates.
---

# 17 — TypeScript with Vue

## Typed Props — defineProps with Generics

::code-wrapper{language="vue" filename="TypedProps.vue"}
```vue
<script setup lang="ts">
import { type PropType } from 'vue'

// ── Generic type annotation (preferred for <script setup>) ──
// Pure TypeScript syntax — no runtime prop validation, but full type safety.
const props = defineProps<{
  userId: number
  role: 'admin' | 'user' | 'guest'  // string literal union
  tags?: string[]                     // optional array
  config?: { theme: string; lang: string }  // optional object
}>()

// ── withDefaults: provide defaults for optional props ──
// Required because TS interface defaults don't exist at runtime.
// The destructured values are typed correctly (role is the union, not string).
const { role = 'user', tags = [], config = { theme: 'dark', lang: 'en' } } = withDefaults(props, {
  role: 'user',
  tags: () => [],  // factory for arrays/objects (fresh per instance)
  config: () => ({ theme: 'dark', lang: 'en' }),
})

// ── Runtime validation (alternative: for prop validation at runtime) ──
// Use when you need runtime checks (not just compile-time TS types).
const props2 = defineProps({
  userId: { type: Number, required: true },
  role: {
    type: String as PropType<'admin' | 'user' | 'guest'>,  // cast for literal unions
    default: 'user',
    validator: (v: string) => ['admin', 'user', 'guest'].includes(v),
  },
})
</script>
```
::

## Typed Emits — defineEmits with Function Signatures

::code-wrapper{language="vue" filename="TypedEmits.vue"}
```vue
<script setup lang="ts">
// ── Call signature style (preferred — full type safety on payloads) ──
const emit = defineEmits<{
  // Each property is a function signature: (event name, payload) => void
  (e: 'update', userId: number, changes: Partial<User>): void
  (e: 'delete', payload: { id: number; soft: boolean }): void
  (e: 'cancel'): void  // no payload
}>()

// ── Alternative: object syntax (3.3+) ──
const emit2 = defineEmits<{
  update: [userId: number, changes: Partial<User>]
  delete: [payload: { id: number; soft: boolean }]
  cancel: []
}>()

// ── Usage: type-checked at call site ──
function handleSave() {
  emit('update', props.userId, { name: newName.value })  // ✅ typed
  // emit('update', '42', {})  // ❌ TS error: '42' is string, not number
}
</script>
```
::

## Typed Component Instance — defineExpose

::code-wrapper{language="vue" filename="TypedExpose.vue"}
```vue
<script setup lang="ts">
import { ref } from 'vue'

// ── defineExpose: type the public API of the component ──
// Parent using template ref gets typed access to exposed methods.
const count = ref(0)
const internalState = ref('private')  // NOT exposed — parent can't access

function increment() { count.value++ }
function reset() { count.value = 0 }
function getValue() { return count.value }  // return value, not ref

// ── Expose with return type inference ──
defineExpose({
  increment,  // () => void
  reset,      // () => void
  getValue,   // () => number
  count,      // Ref<number> — exposed as a ref, parent accesses via .value
})

// ── Parent usage (typed ref): ──────────────────────────
// const childRef = ref<{ increment: () => void; reset: () => void; getValue: () => number; count: Ref<number> } | null>(null)
// childRef.value?.increment()  // ✅ typed
// childRef.value?.count.value  // ✅ typed
```

::code-wrapper{language="typescript" filename="typed-ref.ts"}
```typescript
import { ref, type ComponentPublicInstance } from 'vue'
import TypedComponent from './TypedComponent.vue'

// ── Type the template ref using InstanceType ──────────
// This gives you intellisense on the component's exposed API.
const childRef = ref<ComponentPublicInstance<typeof TypedComponent> | null>(null)

// ── Or use the instance type directly: ──
// If the component uses defineExpose, the ref type includes exposed members.
// If not, you get the default ComponentPublicInstance (with $el, $emit, etc.)

// ── Generic component typing: ──────────────────────────
import type { VNode } from 'vue'
const vNode = ref<VNode | null>(null)  // for render function components
```
::

## Typed provide/inject — InjectionKey

::code-wrapper{language="typescript" filename="typed-provide-inject.ts"}
```typescript
import { provide, inject, type InjectionKey, type Ref } from 'vue'

// ── InjectionKey: a Symbol that carries the TypeScript type ──
// Using Symbol (not string) prevents naming collisions across libraries.
// The generic parameter is the type of the provided value.
export const USER_CONTEXT: InjectionKey<{
  user: Ref<User | null>
  login: (credentials: Credentials) => Promise<void>
  logout: () => void
}> = Symbol('user-context')

// ── Provider: type-checked ──
export function provideUser() {
  const user = ref<User | null>(null)

  const context = {
    user,
    login: async (credentials: Credentials) => { /* ... */ },
    logout: () => { user.value = null },
  }

  provide(USER_CONTEXT, context)  // ✅ type matches InjectionKey<T>
  return context
}

// ── Consumer: typed, with fallback ──────────────────────
export function useUser() {
  const ctx = inject(USER_CONTEXT)
  if (!ctx) {
    throw new Error('useUser() must be called within a component that provides USER_CONTEXT')
  }
  return ctx  // type: { user: Ref<User | null>; login: ...; logout: () => void }
}

// ── inject with default (if not provided): ──
const ctx = inject(USER_CONTEXT, {
  user: ref(null),
  login: async () => {},
  logout: () => {},
})
// ctx is non-null (default used if no provider) — no guard needed.
```
::

## Generic Composable — useFetch with Type Inference

::code-wrapper{language="typescript" filename="generic-composable.ts"}
```typescript
import { ref, type Ref, type MaybeRefOrGetter } from 'vue'

// ── Generic composable: type T is inferred from the fetcher's return type ──
// The caller doesn't need to specify T — it's inferred from the generic.
export function useFetch<T>(
  url: MaybeRefOrGetter<string>,
  options?: { transform?: (data: unknown) => T }
): { data: Ref<T | null>; loading: Ref<boolean>; error: Ref<Error | null> } {
  const data: Ref<T | null> = ref(null) as Ref<T | null>
  const loading = ref(true)
  const error = ref<Error | null>(null)

  // ... fetch logic ...

  return { data, loading, error }
}

// ── Usage: T is inferred ─────────────────────────────────
interface User { id: number; name: string }

// T is inferred as User from the transform's return type
const { data } = useFetch('/api/user', {
  transform: (raw): User => ({ id: raw.id, name: raw.name })
})
// data.value is User | null — fully typed

// ── Without transform, T defaults to unknown ────────────
const { data: rawData } = useFetch('/api/unknown')
// rawData.value is unknown | null — must narrow before use
```
::

## Template Type Narrowing — v-if as Type Guard

::code-wrapper{language="vue" filename="TypeNarrowing.vue"}
```vue
<script setup lang="ts">
import { ref, computed } from 'vue'

type Result =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: User[] }

const result = ref<Result>({ status: 'loading' })
</script>

<template>
  <!-- ── v-if acts as a type guard in templates ── -->
  <!-- After v-if="result.status === 'success'", Vue's template compiler -->
  <!-- narrows `result` to the success variant — result.data is available. -->
  <div v-if="result.status === 'loading'">Loading…</div>

  <div v-else-if="result.status === 'error'">
    Error: {{ result.message }}  <!-- ✅ narrowed: message is accessible -->
  </div>

  <div v-else-if="result.status === 'success'">
    <div v-for="user in result.data" :key="user.id">  <!-- ✅ narrowed: data exists -->
      {{ user.name }}
    </div>
  </div>
</template>
```

## Type-Safe defineModel (3.4+)

::code-wrapper{language="vue" filename="TypedModel.vue"}
```vue
<script setup lang="ts">
// ── defineModel with generic type ──
// Creates: modelValue prop (typed) + update:modelValue emit (typed)
const model = defineModel<string>()  // Ref<string> — writable, two-way

// ── Named model with type ──
const firstName = defineModel<string>('firstName')  // v-model:firstName
const lastName = defineModel<string>('lastName')

// ── Model with options ──
const count = defineModel<number>({
  default: 0,
  required: true,
})

// ── Model with custom modifiers (3.4+) ──
// v-model.capitalize → modelModifiers.capitalize
const text = defineModel<string>({
  set: (v) => v.charAt(0).toUpperCase() + v.slice(1),  // transform on write
})

// ── Usage in template: ──────────────────────────────────
// <input v-model="model" /> — model.value is string, two-way binding
// model.value = 'hello' — emits update:modelValue automatically
</script>
```

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
// ── 1. Type the $event in inline handlers ──
// @click="(e: MouseEvent) => handler(e)" — e is typed

// ── 2. ComponentInstance type for refs ──
import type { ComponentPublicInstance } from 'vue'
const ref = ref<ComponentPublicInstance | null>(null)

// ── 3. DefineEmit with object syntax (3.3+) is cleaner ──
const emit = defineEmits<{
  update: [id: number, data: Partial<User>]
  delete: [id: number]
}>()

// ── 4. Generic type for slots: use defineSlots ──
const slots = defineSlots<{
  default: (props: { item: T }) => any
  header: () => any
}>()

// ── 5. Template expression type checking ──
// Vue's template compiler checks template expressions against <script setup> types.
// {{ user.name }} where user: User → name is type-checked.
// {{ user.nonExistent }} → TS error in template (with Volar).
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. defineProps generic syntax: no default values at runtime ──
// defineProps<{ x?: string }>() → x is string | undefined, no default.
// withDefaults adds runtime defaults (required for optional props to have values).

// ── 2. PropType cast for literal unions in runtime validation ──
// type: String as PropType<'a' | 'b'> → TS knows it's the union, Vue checks string at runtime.
// Without cast, Vue sees String (general), not the literal union.

// ── 3. defineModel default value doesn't affect the parent's bound ref ──
// defineModel<string>({ default: 'x' }) — default used if parent doesn't pass v-model.
// If parent passes v-model="myRef", default is ignored — myRef controls the value.

// ── 4. inject() returns undefined if no provider — always guard or provide default ──
// const ctx = inject(KEY)  → T | undefined
// const ctx = inject(KEY, defaultValue)  → T (no undefined)

// ── 5. Template ref typing with generic components ──
// ref<typeof GenericComponent> doesn't capture the generic parameter.
// Use ComponentPublicInstance<typeof GenericComponent> for full typing.

// ── 6. Ref<T | null> vs Ref<T> — null assignment ──
// const x = ref<T | null>(null) — correct: starts as null, can be T later.
// const x = ref<T>(null) — TS error: null is not assignable to T.
// Always include | null in the ref type if the initial value is null.
```
::

## 🧠 Spot the Bug

A component's optional prop is `undefined` at runtime despite the parent passing a value.

::code-wrapper{language="vue" filename="TypeBug.vue"}
```vue
<!-- Child -->
<script setup lang="ts">
const props = defineProps<{
  title?: string
  count?: number
}>()
// No withDefaults — title and count are undefined at runtime if parent doesn't pass them
// But even if parent passes them, the TYPE says optional (string | undefined)
</script>

<!-- Parent -->
<template>
  <Child :title="hello" />  <!-- title is passed, count is not -->
</template>
```
::

<details>
<summary>Answer</summary>

The issue isn't that `title` is `undefined` — it's that without `withDefaults`, optional props are `undefined` at runtime when not passed. But if the parent passes `:title="hello"`, `title` is `'hello'`. The real bug is the assumption that "optional" means "has a default" — it doesn't. Optional means "can be absent (undefined)."

If the developer expects `count` to default to `0` when not passed, it's actually `undefined`:

::code-wrapper{language="typescript" filename="TypeFixed.ts"}
```typescript
const props = defineProps<{
  title?: string
  count?: number
}>()

// ✅ Add withDefaults to provide runtime defaults
const { title = 'Default', count = 0 } = withDefaults(props, {
  title: 'Default',
  count: 0,
})
// Now: count is 0 when parent doesn't pass it (not undefined)
```
::

**The lesson**: optional props (`?`) in `defineProps<{...}>()` are `undefined` at runtime when absent — they don't have defaults. Use `withDefaults()` to provide runtime fallback values.

</details>