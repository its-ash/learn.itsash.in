# 09 — Forms & v-model

## `v-model` Modifiers

Vue provides three built-in modifiers that adjust how `v-model` synchronizes:

::code-wrapper{language="vue" filename="ProfileForm.vue"}
```vue
<script setup>
import { ref } from 'vue'

const bio = ref('')
const age = ref(0)
const username = ref('')
</script>

<template>
  <!-- .lazy: sync on `change` (blur/enter) instead of every `input` event -->
  <textarea v-model.lazy="bio" placeholder="Bio (syncs on blur)" />

  <!-- .number: casts the input's string value to a Number automatically -->
  <input v-model.number="age" type="number" />

  <!-- .trim: strips leading/trailing whitespace automatically -->
  <input v-model.trim="username" placeholder="Username" />

  <!-- modifiers can be combined -->
  <input v-model.lazy.trim="username" />
</template>
```
::

### Why `.number` matters more than it looks

::code-wrapper{language="javascript"}
```javascript
// without .number: native <input type="number"> STILL gives you a STRING
// through v-model unless you add the modifier
const age = ref(0)
// user types "25" → age.value === "25" (string), not 25 (number)

// age.value + 1 → "251" (string concatenation), not 26 — a classic bug
// when the value later flows into arithmetic, a Pinia store, or an API payload
// expecting a numeric type
```
::

This is a genuinely common production bug: a numeric-looking `<input>` doesn't automatically give you a JavaScript number through plain `v-model` — the DOM's `value` attribute is always a string, and `.number` is what tells Vue to attempt `parseFloat` on it (falling back to the raw string if parsing fails, e.g., for an empty input).

## Building Custom Form Controls with `v-model`

Chapter 06 introduced the `modelValue`/`update:modelValue` pattern. Real form components typically need to also support **modifiers** passed by the consumer, via a special `modelModifiers` prop:

::code-wrapper{language="vue" filename="TrimmedInput.vue"}
```vue
<script setup>
const props = defineProps({
  modelValue: String,
  modelModifiers: { default: () => ({}) }
})
const emit = defineEmits(['update:modelValue'])

function onInput(event) {
  let value = event.target.value
  if (props.modelModifiers.capitalize) {
    value = value.charAt(0).toUpperCase() + value.slice(1)
  }
  emit('update:modelValue', value)
}
</script>

<template>
  <input :value="modelValue" @input="onInput" />
</template>
```
::

::code-wrapper{language="vue"}
```vue
<template>
  <!-- the custom "capitalize" modifier is entirely component-defined,
       unlike built-in modifiers, and arrives via modelModifiers.capitalize -->
  <TrimmedInput v-model.capitalize="name" />
</template>
```
::

With `defineModel` (Vue 3.4+), this collapses considerably — modifiers become the second destructured element:

::code-wrapper{language="vue" filename="TrimmedInput.vue"}
```vue
<script setup>
const [model, modifiers] = defineModel({
  set(value) {
    if (modifiers.capitalize) {
      return value.charAt(0).toUpperCase() + value.slice(1)
    }
    return value
  }
})
</script>

<template>
  <input v-model="model" />
</template>
```
::

## Form Validation Patterns

### Manual validation with computed error state

::code-wrapper{language="vue" filename="SignupForm.vue"}
```vue
<script setup>
import { ref, computed, reactive } from 'vue'

const form = reactive({
  email: '',
  password: '',
  confirmPassword: ''
})

const touched = reactive({
  email: false,
  password: false,
  confirmPassword: false
})

const errors = computed(() => {
  const e = {}
  if (touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    e.email = 'Enter a valid email address.'
  }
  if (touched.password && form.password.length < 8) {
    e.password = 'Password must be at least 8 characters.'
  }
  if (touched.confirmPassword && form.confirmPassword !== form.password) {
    e.confirmPassword = 'Passwords do not match.'
  }
  return e
})

const isValid = computed(() => Object.keys(errors.value).length === 0 && form.email && form.password)

function markTouched(field) {
  touched[field] = true
}

async function onSubmit() {
  Object.keys(touched).forEach(key => { touched[key] = true })
  if (!isValid.value) return
  await submitToApi(form)
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <div>
      <input v-model.trim="form.email" @blur="markTouched('email')" placeholder="Email" />
      <span v-if="errors.email" class="error">{{ errors.email }}</span>
    </div>

    <div>
      <input v-model="form.password" @blur="markTouched('password')" type="password" placeholder="Password" />
      <span v-if="errors.password" class="error">{{ errors.password }}</span>
    </div>

    <div>
      <input v-model="form.confirmPassword" @blur="markTouched('confirmPassword')" type="password" placeholder="Confirm password" />
      <span v-if="errors.confirmPassword" class="error">{{ errors.confirmPassword }}</span>
    </div>

    <button type="submit" :disabled="!isValid">Sign Up</button>
  </form>
</template>
```
::

The `touched` object avoids showing every validation error immediately on page load, before the user has interacted with a field — a real UX consideration, not just extra code. Validation is expressed as a `computed`, so it recalculates automatically as `form` and `touched` change, with no manual re-validation calls needed.

### Async / server-side validation

::code-wrapper{language="vue" filename="UsernameField.vue"}
```vue
<script setup>
import { ref, watch } from 'vue'

const username = ref('')
const isChecking = ref(false)
const isAvailable = ref(null)

let debounceTimer = null

watch(username, (value) => {
  clearTimeout(debounceTimer)
  isAvailable.value = null

  if (!value) return

  debounceTimer = setTimeout(async () => {
    isChecking.value = true
    try {
      const res = await fetch(`/api/check-username?u=${encodeURIComponent(value)}`)
      const { available } = await res.json()
      // guard against a stale response landing after the user kept typing
      if (value === username.value) isAvailable.value = available
    } finally {
      isChecking.value = false
    }
  }, 400)
})
</script>

<template>
  <input v-model="username" placeholder="Choose a username" />
  <span v-if="isChecking">Checking…</span>
  <span v-else-if="isAvailable === true" class="ok">Available!</span>
  <span v-else-if="isAvailable === false" class="error">Already taken.</span>
</template>
```
::

The `if (value === username.value)` guard is the same race-condition defense from chapter 04/12 — without it, a slow response for an earlier keystroke could resolve after a fast response for a later one and overwrite the correct, current availability state.

## Multiple `v-model`s on a Complex Form Component

::code-wrapper{language="vue" filename="AddressFields.vue"}
```vue
<script setup>
defineProps({
  street: String,
  city: String,
  zip: String
})
defineEmits(['update:street', 'update:city', 'update:zip'])
</script>

<template>
  <input :value="street" @input="$emit('update:street', $event.target.value)" placeholder="Street" />
  <input :value="city" @input="$emit('update:city', $event.target.value)" placeholder="City" />
  <input :value="zip" @input="$emit('update:zip', $event.target.value)" placeholder="ZIP" />
</template>
```
::

::code-wrapper{language="vue"}
```vue
<script setup>
import { reactive, toRefs } from 'vue'

const address = reactive({ street: '', city: '', zip: '' })
const { street, city, zip } = toRefs(address)
</script>

<template>
  <AddressFields
    v-model:street="street"
    v-model:city="city"
    v-model:zip="zip"
  />
</template>
```
::

Note the `toRefs(address)` here — this is the exact same pattern from chapter 03: destructuring `address` directly (without `toRefs`) would disconnect `street`/`city`/`zip` from the parent's `address` object, silently breaking the multi-field two-way binding.

## Checkbox and Radio Groups

::code-wrapper{language="vue" filename="PreferencesForm.vue"}
```vue
<script setup>
import { ref } from 'vue'

// v-model on a checkbox bound to an ARRAY automatically pushes/removes
// the checkbox's `value` from that array as it's checked/unchecked
const selectedInterests = ref([])

// v-model on radios bound to the SAME ref automatically makes them
// mutually exclusive
const plan = ref('free')
</script>

<template>
  <label><input type="checkbox" value="sports" v-model="selectedInterests" /> Sports</label>
  <label><input type="checkbox" value="music" v-model="selectedInterests" /> Music</label>
  <label><input type="checkbox" value="tech" v-model="selectedInterests" /> Tech</label>
  <p>Selected: {{ selectedInterests.join(', ') }}</p>

  <label><input type="radio" value="free" v-model="plan" /> Free</label>
  <label><input type="radio" value="pro" v-model="plan" /> Pro</label>
</template>
```
::

## `<select>` with Object Values

::code-wrapper{language="vue" filename="CountrySelect.vue"}
```vue
<script setup>
import { ref } from 'vue'

const countries = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'IN', name: 'India' }
]

const selectedCountry = ref(countries[0])
</script>

<template>
  <!-- :value (not value) is required to bind actual OBJECTS, -->
  <!-- not just their string representation -->
  <select v-model="selectedCountry">
    <option v-for="c in countries" :key="c.code" :value="c">{{ c.name }}</option>
  </select>

  <p>You selected: {{ selectedCountry.name }} ({{ selectedCountry.code }})</p>
</template>
```
::

## Options API Equivalent

::code-wrapper{language="vue"}
```vue
<script>
export default {
  data() {
    return {
      form: { email: '', password: '' },
      touched: { email: false, password: false }
    }
  },
  computed: {
    errors() {
      const e = {}
      if (this.touched.email && !this.form.email.includes('@')) {
        e.email = 'Invalid email'
      }
      return e
    },
    isValid() {
      return Object.keys(this.errors).length === 0
    }
  },
  methods: {
    onSubmit() {
      if (!this.isValid) return
      this.$emit('submit', { ...this.form })
    }
  }
}
</script>
```
::

## 💡 Tips & Tricks

- **Idiom** — Debounce async validation (username/email availability checks) rather than firing a request on every keystroke — a plain `setTimeout` reset on every `watch` callback invocation is enough; reach for a library like `lodash.debounce` only if you need more advanced cancellation semantics.
- **Debug** — If `v-model.number` doesn't seem to produce a number, check whether the field is actually empty or contains a non-numeric string — Vue's `.number` modifier falls back to the raw string when `parseFloat` would return `NaN`, silently, rather than coercing to `0` or throwing.
- **Idiom** — For genuinely complex, multi-step, or schema-driven forms, reach for a dedicated library (`vee-validate`, `FormKit`) rather than hand-rolling validation state — the reactive-error-object pattern shown here scales fine to a handful of fields but becomes repetitive past that.
- **Performance** — Guard every async validation/search callback with a "is this still the latest request" check (comparing against the current ref's value, or an incrementing request ID) — this is cheap insurance against race conditions that's easy to forget until it causes a confusing bug in production.
- **Idiom** — `<select>` bound with `v-model` to an object (not a primitive) requires `:value` (a dynamic binding) on each `<option>`, never a plain `value="..."` attribute — plain attributes can only ever hold strings, which is fine for primitive `v-model` values but breaks object binding.

## ⚠️ Edge Cases & Gotchas

- **Native `<input type="number">` still yields a string without `.number`** — This surprises almost everyone the first time; the DOM's underlying `value` property is always a string regardless of the `type` attribute, and Vue only casts it for you when you explicitly opt in with the `.number` modifier.
- **`.lazy` changes correctness, not just timing, for anything that reads the value mid-typing** — A live character counter or live-search-as-you-type feature built on a `.lazy`-modified `v-model` simply won't update until blur/enter — `.lazy` is the wrong modifier for any UI that needs to react to every keystroke.
- **Checkbox `v-model` behavior depends entirely on what type it's bound to** — Bound to a `Boolean` ref, a single checkbox toggles `true`/`false`; bound to an `Array` ref, the *same* directive instead pushes/splices the checkbox's `value` attribute into/out of that array. Reading Vue code without knowing which type the bound ref is makes checkbox behavior genuinely ambiguous at a glance.
- **Custom `modelModifiers` are entirely your own component's invention — Vue doesn't validate or restrict them** — Unlike built-in modifiers (`.lazy`/`.number`/`.trim`) which are checked and applied by Vue's compiler, a custom modifier like `.capitalize` is just a key that happens to be `true` on the `modelModifiers` prop object — misspelling it on the consuming side (`v-model.captialize`) produces no error, no warning, and the modifier silently does nothing.
- **Losing focus/cursor position by rebuilding the bound object on every keystroke** — Rebinding `v-model` to a freshly-created object reference on every input event (rather than mutating a stable object in place) can cause Vue to treat the input as "new" in certain edge cases involving `:key`, leading to lost focus or cursor position — keep the bound reactive source stable and mutate its properties, don't replace the whole object per keystroke.

## 🧠 Spot the Bug

A price input is supposed to let users type a number, then displays the value doubled elsewhere on the page. The doubled value looks wrong for any two-digit price.

::code-wrapper{language="vue"}
```vue
<script setup>
import { ref, computed } from 'vue'

const price = ref(0)
const doubled = computed(() => price.value * 2)
</script>

<template>
  <input v-model="price" type="number" />
  <p>Doubled: {{ doubled }}</p>
</template>
```
::

<details>
<summary>Answer</summary>

Without the `.number` modifier, `v-model` on this `<input type="number">` still assigns the raw string value from the DOM to `price.value` — typing `25` sets `price.value` to the string `"25"`, not the number `25`. Then `price.value * 2` happens to work correctly (`*` coerces strings to numbers in JavaScript), but the moment the code does anything with `+` instead of `*` — for example concatenating it into a display string, or summing it with another price — `"25" + "25"` produces `"2525"`, not `50`. The immediate symptom in this exact snippet is subtler: multi-digit prices "look wrong" once this value flows anywhere that expects a true number (an API payload requiring `type: number`, a comparison, or `toFixed()`, which throws on a string).

::code-wrapper{language="vue"}
```vue
<script setup>
import { ref, computed } from 'vue'

const price = ref(0)
const doubled = computed(() => price.value * 2)
</script>

<template>
  <input v-model.number="price" type="number" />
  <p>Doubled: {{ doubled }}</p>
</template>
```
::

**The lesson**: `type="number"` is purely an HTML input affordance (numeric keyboard, spinner arrows, basic browser validation) — it does not change the JavaScript type `v-model` gives you. Always add `.number` when the bound value needs to behave as an actual number downstream.

</details>

## Key Takeaways

- Built-in `v-model` modifiers — `.lazy` (sync on change, not input), `.number` (cast to Number), `.trim` (strip whitespace) — solve specific, common form needs without manual event handling.
- `type="number"` doesn't make `v-model` produce a JavaScript number — `.number` is required for that regardless of the input's HTML type.
- Custom components support `v-model` modifiers via the `modelModifiers` prop (or `defineModel`'s destructured modifiers in 3.4+) — entirely component-defined and unchecked by Vue.
- Checkbox `v-model` behavior (boolean toggle vs. array push/splice) depends on the bound ref's type, not the directive itself.
- `<select>`/checkbox/radio `v-model` bound to objects requires `:value` bindings on `<option>`s — plain `value="..."` attributes can only ever be strings.
- Always debounce and guard async validation against race conditions — compare the resolved response against the field's current value before applying it.
