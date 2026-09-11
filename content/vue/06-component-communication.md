---
title: Vue 3 Engineering Reference — Component Communication
description: Props down/events up contract, provide/inject dependency injection with typed symbols, $attrs forwarding, event bus alternatives, and v-model component patterns for production forms.
---

# 06 — Component Communication

## Props Down, Events Up — The Unidirectional Contract

::code-wrapper{language="vue" filename="Parent.vue"}
```vue
<script setup lang="ts">
import { ref } from 'vue'
import UserForm from './UserForm.vue'

const user = ref({ name: '', email: '' })

// ── One-way data flow: ────────────────────────────────
// Parent → Child: props (read-only in child)
// Child → Parent: events (child emits, parent handles)
// Child never mutates props directly — emits event, parent updates state.
// This ensures a single source of truth and traceable data flow.
</script>

<template>
  <!-- Pass data down as props -->
  <UserForm
    :model-value="user"
    @update:model-value="user = $event"
    @submit="handleSubmit"
  />
  <!-- v-model is sugar for the above two-way binding pattern -->
</template>
```

::code-wrapper{language="vue" filename="UserForm.vue"}
```vue
<script setup lang="ts">
// ── Props are READ-ONLY — mutating a prop is a dev-mode warning ──
// Vue's one-way flow: if parent changes the prop, child re-renders with new value.
// If child mutated it, the next parent update would overwrite the mutation.

const props = defineProps<{
  modelValue: { name: string; email: string }
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: { name: string; email: string }): void
  (e: 'submit'): void
}>()

// ── Correct pattern: emit a new object, don't mutate the prop ──
function updateField(field: 'name' | 'email', value: string) {
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}
</script>

<template>
  <input
    :value="modelValue.name"
    @input="updateField('name', $event.target.value)"
  />
  <button @click="emit('submit')">Submit</button>
</template>
```
::

### Anti-Pattern: Mutating Props Directly

::code-wrapper{language="vue" filename="MutateProp.vue"}
```vue
<script setup>
const props = defineProps(['user'])
</script>

<template>
  <!-- ❌ WRONG: mutating a prop directly — Vue warns in dev mode -->
  <input v-model="props.user.name" />
  <!-- Why it breaks: parent owns `user`. If parent re-renders with a new
       user object, this component's mutation is lost (overwritten by new prop).
       Also makes data flow untraceable — who changed `user.name`? -->
</template>
```

::code-wrapper{language="vue" filename="FixedProp.vue"}
```vue
<script setup>
const props = defineProps(['user'])
const emit = defineEmits(['update:user'])
</script>

<template>
  <!-- ✅ CORRECT: emit the update, parent owns the mutation -->
  <input
    :value="user.name"
    @input="emit('update:user', { ...user, name: $event.target.value })"
  />
</template>
```
::

## provide/inject — Typed Dependency Injection

::code-wrapper{language="typescript" filename="provide-inject.ts"}
```typescript
import { provide, inject, ref, type InjectionKey, type Ref } from 'vue'

// ── InjectionKey: typed symbol that carries the TypeScript type ──
// Using a symbol (not a string) prevents naming collisions across libraries.
// The type is: Ref<User | null> — injected values are typed correctly.
export const USER_KEY: InjectionKey<Ref<User | null>> = Symbol('user')

// ── Provider: parent or app-level ──
export function provideUser() {
  const user = ref<User | null>(null)
  provide(USER_KEY, user)  // provide the ref — child gets the ref, not just the value
  return user
}

// ── Consumer: any descendant component ──
export function useUser() {
  const user = inject(USER_KEY)
  if (!user) throw new Error('useUser() must be used within a provider for USER_KEY')
  // ⚠️ inject() returns undefined if no provider found — always guard.
  return user
}

// ── Without InjectionKey: string key, no type safety ──
provide('theme', 'dark')
const theme = inject('theme', 'light')  // second arg = default if not provided
// String keys work but have no type inference — InjectionKey is preferred.
```
::

## Production Pattern — Composable with provide/inject

::code-wrapper{language="typescript" filename="useTheme.ts"}
```typescript
import { provide, inject, ref, readonly, computed, type InjectionKey } from 'vue'

// ── Full composable: provider sets up state, consumer accesses via inject ──
// Separates "create" (provider) from "use" (consumer) for clean DI.

interface ThemeContext {
  theme: Readonly<Ref<string>>
  isDark: Readonly<Ref<boolean>>
  setTheme: (t: string) => void
  toggle: () => void
}

const THEME_KEY: InjectionKey<ThemeContext> = Symbol('theme')

// ── Provider: called once in the root component ──
export function provideTheme(initial = 'light') {
  const theme = ref(initial)
  const isDark = computed(() => theme.value === 'dark')

  const context: ThemeContext = {
    theme: readonly(theme),  // expose read-only — consumers can't mutate directly
    isDark: readonly(isDark),
    setTheme: (t: string) => { theme.value = t },
    toggle: () => { theme.value = theme.value === 'dark' ? 'light' : 'dark' },
  }

  provide(THEME_KEY, context)
  return context  // provider also gets the mutable API
}

// ── Consumer: called in any descendant ──
export function useTheme() {
  const ctx = inject(THEME_KEY)
  if (!ctx) throw new Error('useTheme() called outside of provideTheme()')
  return ctx
}

// ── Why readonly on injected state: ──────────────────────
// Forces consumers to use the provided mutation functions (setTheme, toggle)
// instead of directly writing to the ref. Centralizes mutation logic, makes
// state changes traceable and debuggable (all mutations go through one path).
```
::

## v-model on Components — Custom Modifiers

::code-wrapper{language="vue" filename="PhoneNumberInput.vue"}
```vue
<script setup>
import { computed } from 'vue'

// ── v-model with built-in modifiers: modelModifiers ──
// Parent: <PhoneInput v-model.trim="phone" />
// → modelModifiers = { trim: true }
const props = defineProps({
  modelValue: String,
  modelModifiers: { default: () => ({}) },
})

const emit = defineEmits(['update:modelValue'])

// ── Custom modifier: format phone numbers as (XXX) XXX-XXXX ──
function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function onInput(e) {
  let value = e.target.value
  // Apply custom modifier if present
  if (props.modelModifiers.format) {
    value = formatPhone(value)
  }
  emit('update:modelValue', value)
}
</script>

<template>
  <input :value="modelValue" @input="onInput" />
</template>
```
::

## Multiple v-model with Named Bindings

::code-wrapper{language="vue" filename="DateRangePicker.vue"}
```vue
<script setup>
// ── Named v-models: v-model:startDate and v-model:endDate ──
// Parent: <DateRange v-model:start="start" v-model:end="end" />
// Each named v-model gets its own prop + modifier prop:
//   start, startModifiers, end, endModifiers

defineProps({
  start: String,
  end: String,
})

const emit = defineEmits(['update:start', 'update:end'])
</script>

<template>
  <input type="date" :value="start" @input="emit('update:start', $event.target.value)" />
  <input type="date" :value="end" @input="emit('update:end', $event.target.value)" />
</template>
```
::

## Event Payload Validation and v-model on Custom Components

::code-wrapper{language="vue" filename="ValidatedInput.vue"}
```vue
<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  modelValue: String,
  rules: { type: Array, default: () => [] },  // validation rules array
})

const emit = defineEmits(['update:modelValue', 'validate'])

const error = ref('')

// ── Computed validation — re-runs when modelValue or rules change ──
const isValid = computed(() => {
  for (const rule of props.rules) {
    const result = rule(props.modelValue)
    if (typeof result === 'string') {
      error.value = result
      return false
    }
  }
  error.value = ''
  return true
})

function onInput(e) {
  const value = e.target.value
  emit('update:modelValue', value)
  // Emit validation result after the value update — parent can react
  emit('validate', isValid.value)
}
</script>

<template>
  <input :value="modelValue" @input="onInput" />
  <span v-if="error" class="error">{{ error }}</span>
</template>
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
// ── 1. provide/inject with factory default ──
const config = inject(CONFIG_KEY, () => createDefaultConfig(), true)
// 3rd arg true: treat the 2nd arg as a factory function (like prop defaults)

// ── 2. Reactive provide — pass the ref, not the value ──
// ✅ provide(KEY, myRef) — child injects the ref, stays reactive
// ❌ provide(KEY, myRef.value) — child gets a static value, no reactivity

// ── 3. Event naming: kebab-case in template, camelCase in emit ──
// emit('update:modelValue') → parent listens: @update:model-value
// Vue auto-converts camelCase emits to kebab-case in templates.

// ── 4. useAttrs() — access fallthrough attrs in script ──
const attrs = useAttrs()
// Equivalent to $attrs in template, but accessible in <script setup>.
// Useful for forwarding attrs to specific children in wrapper components.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. Injecting a non-provided key returns undefined, not an error ──
const user = inject(USER_KEY)  // undefined if no provider — always guard
if (!user) throw new Error('USER_KEY not provided')
// Or use a default: inject(USER_KEY, ref(null))

// ── 2. provide/inject is NOT reactive across component boundaries ──
// If you provide a plain value (not a ref), changes to it in the provider
// do NOT update consumers. Always provide refs or reactive objects.

// ── 3. Prop mutation in child — silent failure in production ──
// Dev mode: Vue warns "Avoid mutating prop directly."
// Prod mode: mutation works... until parent re-renders and overwrites it.
// This causes "works in dev, breaks in prod" bugs.

// ── 4. Event names must match exactly (case-sensitive in emit) ──
// emit('update:modelValue') + parent @update:model-value → ✅ (auto kebab)
// emit('updateModelValue') + parent @update-model-value → ❌ (no match)

// ── 5. provide/inject is hierarchical — not broadcast ──
// Only DESCENDANT components can inject. Siblings cannot.
// For cross-tree communication, use a Pinia store or event bus pattern.

// ── 6. v-model modifiers prop is always an object ──
// modelModifiers default is () => ({}) — never undefined.
// Check with: if (props.modelModifiers.trim) { ... }
```
::

## 🧠 Spot the Bug

A child component mutates a prop object's nested property, but the parent's state doesn't update.

::code-wrapper{language="vue" filename="PropMutationBug.vue"}
```vue
<script setup>
const props = defineProps({ user: Object })
</script>

<template>
  <!-- Mutating a nested property of a prop object -->
  <input v-model="props.user.name" />
</template>
```
::

<details>
<summary>Answer</summary>

Mutating a prop object's nested property *appears* to work (the object is passed by reference), but it violates Vue's one-way data flow. The parent doesn't know the object changed, so it won't trigger any watchers or re-renders in the parent. If the parent later replaces the `user` object (e.g., after a fetch), the child's mutation is silently lost.

**Fix** — emit the update, parent owns the mutation:

::code-wrapper{language="vue" filename="PropMutationFixed.vue"}
```vue
<script setup>
const props = defineProps({ user: Object })
const emit = defineEmits(['update:user'])
</script>

<template>
  <input
    :value="user.name"
    @input="emit('update:user', { ...user, name: $event.target.value })"
  />
</template>
```
::

**The lesson**: props are read-only contracts. Even nested mutations work at the JS level but break Vue's reactivity tracking. Always emit updates — the parent is the single source of truth.

</details>