---
title: Vue 3 Engineering Reference — Forms & v-model
description: v-model modifier internals, multi-field form validation, custom input components, debounced inputs, dynamic form generation, and the .number/.lazy/.trim modifier edge cases.
---

# 09 — Forms & v-model

## v-model Modifier Expansion — What the Compiler Generates

::code-wrapper{language="vue" filename="ModifierInternals.vue"}
```vue
<script setup>
import { ref } from 'vue'

const text = ref('')
const age = ref(0)
const name = ref('')
</script>

<template>
  <!-- ── v-model="text" expands to: ──────────────────────── -->
  <!-- :value="text" @input="text = $event.target.value" -->
  <!-- Vue uses the vModelText directive, not just attr binding:
       handles IME composition events, edge cases with type=number, etc. -->
  <input v-model="text" />

  <!-- ── .lazy: listen to 'change' (on blur) not 'input' (every keystroke) ── -->
  <!-- Expands to: :value="text" @change="text = $event.target.value" -->
  <!-- Reduces re-render frequency for expensive form validation -->
  <input v-model.lazy="text" />

  <!-- ── .number: cast input string to Number ─────────────── -->
  <!-- If input is "42", v-model stores 42 (number), not "42" (string). -->
  <!-- Edge: empty string → "" (NOT 0), invalid → original string unchanged. -->
  <!-- Uses parseFloat internally; NaN results keep the original string. -->
  <input v-model.number="age" type="number" />

  <!-- ── .trim: strip leading/trailing whitespace ────────── -->
  <!-- "  hello  " → "hello". Does NOT strip internal spaces. -->
  <input v-model.trim="name" />

  <!-- ── Chained modifiers: .lazy.number.trim — applied left to right ── -->
  <input v-model.lazy.number.trim="age" />
</template>
```
::

## Custom Input Component — v-model Contract

::code-wrapper{language="vue" filename="BaseInput.vue"}
```vue
<script setup>
import { computed } from 'vue'

// ── defineModel (3.4+): declarative v-model without boilerplate ──
// Auto-creates: modelValue prop + update:modelValue emit
// Can be used directly in template as a writable ref.
const model = defineModel<string>({
  default: '',          // default value if parent doesn't pass v-model
  required: false,
})

// ── Custom modifiers: modelModifiers prop ──────────────
// Parent: <BaseInput v-model.capitalize="text" />
// → modelModifiers = { capitalize: true }
const { capitalize } = defineProps({
  modelModifiers: { default: () => ({}) },
})

// ── Apply modifier on write ─────────────────────────────
function onInput(e) {
  let val = e.target.value
  if (capitalize) val = val.charAt(0).toUpperCase() + val.slice(1)
  model.value = val  // defineModel handles the emit automatically
}
</script>

<template>
  <input :value="model" @input="onInput" class="base-input" />
</template>
```

::code-wrapper{language="vue" filename="BaseInputLegacy.vue"}
```vue
<script setup>
// ── Pre-3.4: manual v-model contract ──────────────────
const props = defineProps({
  modelValue: { type: String, default: '' },
  modelModifiers: { default: () => ({}) },
})
const emit = defineEmits(['update:modelValue'])

function onInput(e) {
  let val = e.target.value
  if (props.modelModifiers.capitalize) {
    val = val.charAt(0).toUpperCase() + val.slice(1)
  }
  emit('update:modelValue', val)
}
</script>

<template>
  <input :value="modelValue" @input="onInput" />
</template>
```
::

## Production Form — Reactive Validation with Schema

::code-wrapper{language="typescript" filename="useFormValidation.ts"}
```typescript
import { reactive, computed, ref, type Ref } from 'vue'

// ── Type-safe form validation composable ────────────────
// Rules: each field has an array of validator functions.
// Validator returns: true (valid) | string (error message)

type Validator<T> = (value: T) => true | string

export function useForm<T extends Record<string, any>>(
  initial: T,
  rules: { [K in keyof T]?: Validator<T[K]>[] }
) {
  const form = reactive({ ...initial })
  const touched = reactive({} as Record<keyof T, boolean>)
  const submitting = ref(false)

  // ── Errors: computed — re-evaluates when form or touched change ──
  const errors = computed(() => {
    const result: Partial<Record<keyof T, string>> = {}
    for (const key in rules) {
      // Only validate fields the user has touched (UX: no errors on load)
      if (!touched[key]) continue
      for (const validator of rules[key] ?? []) {
        const res = validator(form[key])
        if (res !== true) {
          result[key] = res
          break  // first error wins — don't stack messages
        }
      }
    }
    return result
  })

  const isValid = computed(() => Object.keys(errors.value).length === 0)

  function touch(key: keyof T) { touched[key] = true }
  function touchAll() {
    (Object.keys(form) as (keyof T)[]).forEach(k => touched[k] = true)
  }

  async function submit(handler: (form: T) => Promise<void>) {
    touchAll()  // validate all fields on submit attempt
    if (!isValid.value) return false
    submitting.value = true
    try {
      await handler(form)
      return true
    } finally {
      submitting.value = false
    }
  }

  function reset() {
    Object.assign(form, initial)
    Object.keys(touched).forEach(k => touched[k] = false)
  }

  return { form, errors, isValid, submitting, touch, touchAll, submit, reset }
}

// ── Usage: ──────────────────────────────────────────────
// const { form, errors, submit } = useForm(
//   { email: '', password: '' },
//   {
//     email: [v => !!v || 'Required', v => /.+@.+/.test(v) || 'Invalid email'],
//     password: [v => v.length >= 8 || 'Min 8 characters'],
//   }
// )
```
::

## Dynamic Form Generation — Schema-Driven

::code-wrapper{language="vue" filename="DynamicForm.vue"}
```vue
<script setup>
import { ref, computed } from 'vue'

// ── Schema-driven form: render inputs from a config array ──
const schema = ref([
  { name: 'email', type: 'email', label: 'Email', required: true, placeholder: 'user@example.com' },
  { name: 'age', type: 'number', label: 'Age', min: 18, max: 120 },
  { name: 'bio', type: 'textarea', label: 'Bio', rows: 4 },
  { name: 'role', type: 'select', label: 'Role', options: ['admin', 'user', 'guest'] },
  { name: 'subscribe', type: 'checkbox', label: 'Subscribe to newsletter' },
])

const formData = ref({})

// ── Initialize form data from schema defaults ──
schema.value.forEach(field => {
  formData.value[field.name] = field.type === 'checkbox' ? false : ''
})

// ── Computed: map schema type → component ──
const fieldComponents = {
  text: 'input',
  email: 'input',
  number: 'input',
  textarea: 'textarea',
  select: 'select',
  checkbox: 'input',
}
</script>

<template>
  <form @submit.prevent>
    <div v-for="field in schema" :key="field.name">
      <label :for="field.name">{{ field.label }}</label>

      <!-- Text/Email/Number inputs -->
      <input
        v-if="['text', 'email', 'number'].includes(field.type)"
        :type="field.type"
        v-model="formData[field.name]"
        :placeholder="field.placeholder"
        :required="field.required"
      />

      <!-- Textarea -->
      <textarea
        v-else-if="field.type === 'textarea'"
        v-model="formData[field.name]"
        :rows="field.rows || 3"
      />

      <!-- Select -->
      <select v-else-if="field.type === 'select'" v-model="formData[field.name]">
        <option v-for="opt in field.options" :key="opt" :value="opt">{{ opt }}</option>
      </select>

      <!-- Checkbox -->
      <input
        v-else-if="field.type === 'checkbox'"
        type="checkbox"
        v-model="formData[field.name]"
      />
    </div>

    <button type="submit">Submit</button>
  </form>
</template>
```
::

## Debounced Search Input — Custom Modifier

::code-wrapper{language="vue" filename="DebouncedInput.vue"}
```vue
<script setup>
import { ref, watch, customRef } from 'vue'

// ── Debounced ref factory: delays updates until typing pauses ──
function useDebouncedRef(initial, delay = 300) {
  let value = initial
  let timer
  return customRef((track, trigger) => ({
    get() { track(); return value },
    set(newVal) {
      clearTimeout(timer)
      timer = setTimeout(() => { value = newVal; trigger() }, delay)
    },
  }))
}

const search = useDebouncedRef('', 300)
const results = ref([])

// ── Watch fires 300ms after last keystroke, not on every keystroke ──
watch(search, async (q) => {
  if (!q) { results.value = []; return }
  const res = await fetch(`/api/search?q=${q}`)
  results.value = await res.json()
})
</script>

<template>
  <!-- Input updates immediately (user sees what they type),
       but the ref (and watchers) only update 300ms after typing stops. -->
  <input v-model="search" placeholder="Search…" />
  <ul>
    <li v-for="r in results" :key="r.id">{{ r.name }}</li>
  </ul>
</template>
```
::

## Multiple v-model — Form Component Pattern

::code-wrapper{language="vue" filename="RegistrationForm.vue"}
```vue
<script setup>
import { computed } from 'vue'

// ── Two named v-models: one for email, one for password ──
// Parent: <RegistrationForm v-model:email="email" v-model:password="password" />
const email = defineModel<string>('email')
const password = defineModel<string>('password')

// ── Computed validation on each model ──
const emailError = computed(() => {
  if (!email.value) return ''
  return /.+@.+\..+/.test(email.value) ? '' : 'Invalid email'
})

const passwordError = computed(() => {
  if (!password.value) return ''
  return password.value.length >= 8 ? '' : 'Min 8 characters'
})

const isValid = computed(() =>
  !emailError.value && !passwordError.value && email.value && password.value
)
</script>

<template>
  <div>
    <input v-model="email" type="email" placeholder="Email" />
    <span v-if="emailError" class="error">{{ emailError }}</span>

    <input v-model="password" type="password" placeholder="Password" />
    <span v-if="passwordError" class="error">{{ passwordError }}</span>

    <button :disabled="!isValid">Register</button>
  </div>
</template>
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
// ── 1. .number edge case: parseFloat("abc") → NaN, keeps original string ──
// v-model.number on "abc" → ref stays "abc" (string), NOT NaN.
// Vue checks: if parsed is NaN, uses the original input value.

// ── 2. Checkbox v-model with true-value/false-value ──
// <input type="checkbox" v-model="agree" true-value="yes" false-value="no" />
// agree = "yes" when checked, "no" when unchecked (not true/false)

// ── 3. Radio button v-model binds to the value attribute ──
// <input type="radio" v-model="plan" value="pro" /> → plan = "pro" when selected

// ── 4. .lazy on checkboxes/selects is a no-op ──
// Checkboxes and selects fire 'change' natively, not 'input'.
// .lazy only matters for text inputs and textareas.

// ── 5. Form reset: use the form element's reset() method or reassign ──
// formRef.value?.reset()  → resets to initial HTML defaults
// Object.assign(formData, initialData)  → resets to reactive initial state
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. .number with type="number" vs type="text" ──
// type="number": browser may return "" for invalid input, .number keeps ""
// type="text" + .number: "42abc" → parseFloat("42abc") = 42 (partial parse!)
// Always use type="number" with .number for proper browser validation.

// ── 2. v-model on contenteditable elements is not supported ──
// Use a manual binding: :textContent + @input handler.
// Or use a library like vue-contenteditable.

// ── 3. v-model + v-for: each item needs its own model ref ──
// ❌ <input v-for="item in items" v-model="item" /> — binds to item reference
// ✅ <input v-for="item in items" v-model="item.value" /> — binds to a property

// ── 4. defineModel is writable — but parent owns the source ──
// Writing to model.value emits update:modelValue → parent updates its ref.
// The child's model.value reflects the parent's value after the round-trip.
// In the same tick, model.value may show the old value until parent updates.

// ── 5. .trim on number inputs strips whitespace but doesn't affect parsing ──
// v-model.trim.number="age" → trims, then parses.
// "  42  " → trim → "42" → number → 42. Works as expected.

// ── 6. Custom component v-model: modelValue must match exactly ──
// defineModel() → prop name is "modelValue", emit is "update:modelValue"
// defineModel('foo') → prop name is "foo", emit is "update:foo"
// Parent: v-model="x" → modelValue, v-model:foo="x" → foo
```
::

## 🧠 Spot the Bug

A number input always stores a string even though `.number` is applied.

::code-wrapper{language="vue" filename="NumberBug.vue"}
```vue
<script setup>
import { ref, watch } from 'vue'
const age = ref(0)
watch(age, (v) => console.log(typeof v, v))  // always logs "string"
</script>

<template>
  <!-- Missing .number modifier — v-model stores the raw string -->
  <input v-model="age" type="number" />
</template>
```
::

<details>
<summary>Answer</summary>

`v-model` without `.number` stores the input's value as a string (`$event.target.value` is always a string). `type="number"` only controls the browser's input UI — it doesn't change what `v-model` stores.

**Fix** — add the `.number` modifier:

::code-wrapper{language="vue" filename="NumberFixed.vue"}
```vue
<template>
  <input v-model.number="age" type="number" />
</template>
```
::

Now `age` is stored as a `number` (or `""` if empty, since `parseFloat("")` is `NaN` and Vue keeps the original string for that case). **The lesson**: `type="number"` controls the UI; `.number` controls the stored type. You need both for correct behavior.

</details>