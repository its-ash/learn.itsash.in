---
title: Vue 3 Engineering Reference — Reactivity Fundamentals
description: Proxy-based reactivity internals — track/trigger dependency graph, ref vs reactive unwrapping, destructuring traps, toRef/toRefs ref creation, shallowRef for large data, custom ref factories.
---

# 03 — Reactivity Fundamentals

## Dependency Tracking — How Vue Knows What to Re-render

::code-wrapper{language="typescript" filename="reactivity-core.ts"}
```typescript
import { reactive, effect, track, trigger, targetMap } from 'vue'

// ── Simplified Vue 3 reactivity core (the actual implementation) ──
// Internally Vue maintains a WeakMap<targetObject, Map<key, Set<Effect>>>
// called targetMap. This is the dependency graph.

// ── effect(fn): runs fn, registers fn as a dependency of every reactive
//    property it READS during this execution. Re-runs fn when any of those
//    properties are WRITTEN to. ──

const state = reactive({ count: 0 })

effect(() => {
  // During this fn's execution, reading state.count calls track(state, 'count')
  // track() adds this effect to the Set at targetMap.get(state).get('count')
  console.log(state.count)
})

state.count = 1  // trigger(state, 'count') → re-runs the effect above → logs 1

// ── The dependency graph after the effect runs: ──────────
// targetMap = WeakMap {
//   { count: 0 } => Map {
//     'count' => Set { [effectFn] }
//   }
// }
// Multiple effects reading the same property → all in the same Set.
// Writing triggers ALL effects in that Set, in creation order.
```
::

## ref vs reactive — When to Use Which

::code-wrapper{language="typescript" filename="ref-vs-reactive.ts"}
```typescript
import { ref, reactive, computed, watch, type Ref } from 'vue'

// ── ref(): wraps a single value in { value: T } ──
// Required for primitives (string, number, boolean) — can't Proxy a primitive.
// Also works for objects, but adds an extra .value dereference.
const count = ref(0)          // { value: 0 } with reactive get/set on .value
count.value++                 // mutation via .value
const doubled = computed(() => count.value * 2)  // read via .value

// ── reactive(): wraps an object in a Proxy ──
// No .value needed — property access is directly reactive.
// Best for grouped state (a form, a config object, a user record).
const form = reactive({
  email: '',
  password: '',
  rememberMe: false,
})
form.email = 'ada@example.com'  // direct mutation, no .value

// ── Rule of thumb: ─────────────────────────────────────
// Single primitive          → ref()
// Grouped object state      → reactive()
// Replacing the entire value → ref() (reactive() can't be reassigned)

// ── The reassignment trap with reactive(): ─────────────
let config = reactive({ theme: 'dark' })
// config = reactive({ theme: 'light' })  // ❌ replaces the binding,
//   old Proxy is orphaned, components still bound to the OLD Proxy don't update.
// Use ref for anything that needs full replacement:
const configRef = ref({ theme: 'dark' })
configRef.value = { theme: 'light' }      // ✅ ref.value reassignment triggers
```
::

## Template Unwrapping — Where .value Disappears

::code-wrapper{language="vue" filename="Unwrapping.vue"}
```vue
<script setup lang="ts">
import { ref, reactive, computed, type Ref } from 'vue'

const count = ref(0)
const user = reactive({ name: 'Ada', roles: ['admin'] })
// ── Refs inside reactive objects are auto-unwrapped ──
// Accessing state.count gives 0, not the ref object.
const state = reactive({
  count,           // ref → unwrapped to .value automatically
  label: 'Total',
})

// ── But refs in arrays/Maps are NOT unwrapped ──
const mixed = ref<Ref<number>[]>([ref(1), ref(2)])
// mixed.value[0] is a Ref<number>, not 1 — must use .value

// ── Computed returns a ref-like (readonly ref) ──
const upper = computed(() => user.name.toUpperCase())
</script>

<template>
  <!-- Templates auto-unwrap top-level refs: count.value → count -->
  <p>{{ count }}</p>           <!-- 0, not [object Object] -->
  <p>{{ upper }}</p>           <!-- "ADA" -->

  <!-- Reactive object properties accessed directly: -->
  <p>{{ user.name }}</p>      <!-- "Ada" -->
  <p>{{ state.count }}</p>     <!-- 0 (unwrapped from the ref inside reactive) -->
</template>
```
::

### Anti-Pattern: Destructuring Reactive Objects

::code-wrapper{language="typescript" filename="destructuring-trap.ts"}
```typescript
import { reactive, watchEffect } from 'vue'

const state = reactive({ count: 0, label: 'Total' })

// ❌ WRONG: destructuring breaks reactivity
const { count, label } = state
// `count` is now a plain number (0), disconnected from the Proxy.
// Mutating state.count does NOT update the local `count` variable.
watchEffect(() => {
  console.log(count)  // logs 0 once, never again — count is not reactive
})
state.count = 5  // the effect does NOT re-run; local `count` is still 0
```

::code-wrapper{language="typescript" filename="destructuring-fix.ts"}
```typescript
import { reactive, toRefs, toRef, watchEffect } from 'vue'

const state = reactive({ count: 0, label: 'Total' })

// ✅ FIX 1: toRefs() — converts each property to a ref linked to the source
// Each ref's .value reads/writes through the original reactive object's Proxy.
const { count, label } = toRefs(state)
// count is Ref<number>; count.value === 0; state.count = 5 → count.value === 5

// ✅ FIX 2: toRef() — single property (lazy, doesn't evaluate until .value read)
const countRef = toRef(state, 'count')
// Useful when the property may not exist yet on the reactive object.

watchEffect(() => {
  console.log(count.value)  // re-runs when state.count changes
})
state.count = 5  // effect re-runs, logs 5
```
::

## Custom Ref — Factory Pattern for Debounced Search

::code-wrapper{language="typescript" filename="useDebouncedRef.ts"}
```typescript
import { customRef, type Ref } from 'vue'

// ── customRef: gives manual control over track/trigger ──
// Factory: lets you intercept reads and writes to a ref.
// Use cases: debounce, lazy evaluation, sync with external storage.
export function useDebouncedRef<T>(initial: T, delay = 200): Ref<T> {
  let value = initial
  let timer: ReturnType<typeof setTimeout>

  return customRef<T>((track, trigger) => ({
    get() {
      // track(): register the reading effect as a dependency
      // Without this, the effect won't re-run when the ref changes.
      track()
      return value
    },
    set(newValue: T) {
      clearTimeout(timer)
      timer = setTimeout(() => {
        value = newValue
        // trigger(): notify all registered effects to re-run
        // Without this, the value changes but no one re-renders.
        trigger()
      }, delay)
    },
  }))
}

// ── Usage in a component: ──────────────────────────────
// const searchQuery = useDebouncedRef('', 300)
// <input v-model="searchQuery" /> — input updates immediately,
// but reactive consumers (computed, watch, template) only see
// changes 300ms after the last keystroke.
```
::

## shallowRef — Large Data Without Deep Tracking

::code-wrapper{language="typescript" filename="shallow-ref.ts"}
```typescript
import { shallowRef, watch, triggerRef } from 'vue'

// ── shallowRef: only .value access is reactive ──
// The object inside is NOT made reactive — no deep Proxy.
// Mutating nested properties does NOT trigger effects.
// Only replacing .value (or calling triggerRef) triggers updates.
const hugeList = shallowRef<{ id: number; data: ArrayBuffer }[]>([])

// ✅ Replacing .value triggers re-render:
hugeList.value = newArray

// ❌ Mutating in place does NOT trigger:
hugeList.value.push(newItem)  // array changes, but Vue doesn't know

// ✅ Force-trigger after in-place mutation:
hugeList.value.push(newItem)
triggerRef(hugeList)  // manually notifies all dependents

// ── Why use shallowRef for large data: ──────────────────
// reactive() walks every nested property and installs Proxies recursively.
// For 10,000-item arrays of objects, that's 10,000+ Proxies — expensive init.
// shallowRef avoids this: one ref wrapper, zero nested Proxies.
// Use for: API response data, chart datasets, WebGL buffers, large table rows.
```
::

## readonly and shallowReadonly — Immutable Views

::code-wrapper{language="typescript" filename="readonly-state.ts"}
```typescript
import { reactive, readonly, shallowReadonly, isReadonly } from 'vue'

const state = reactive({
  user: { name: 'Ada', prefs: { theme: 'dark' } },
  tokens: ['abc', 'def'],
})

// ── readonly(): deep — every nested property becomes read-only ──
// Writing to any level throws in dev (silently fails in prod).
const protectedState = readonly(state)
// protectedState.user.name = 'X' → TypeError in dev
// protectedState.user is also readonly (deep recursion)

// ── shallowReadonly(): only top-level keys are locked ──
// Nested objects remain mutable — cheaper for large trees.
const shallowProtected = shallowReadonly(state)
// shallowProtected.user = {}          → TypeError (top-level)
// shallowProtected.user.name = 'X'      → ✅ allowed (nested not locked)

// ── Use case: provide readonly to components, keep mutable internally ──
// Parent owns the mutable reactive state; passes readonly() to children.
// Children can read but can't mutate — forces event-based updates.
export function useUserStore() {
  const state = reactive({ user: null as User | null })
  return {
    state: readonly(state),    // consumers get immutable view
    setUser: (u: User) => { state.user = u },  // mutations via explicit API
  }
}
```
::

## markRaw — Permanently Exclude from Reactivity

::code-wrapper{language="typescript" filename="mark-raw.ts"}
```typescript
import { reactive, markRaw, isReactive } from 'vue'

// ── markRaw(): marks an object so reactive() will NEVER wrap it ──
// The object is stored as-is, no Proxy created, no tracking installed.
const mapInstance = markRaw(new Map([['key', 'value']]))
const state = reactive({ map: mapInstance })
console.log(isReactive(state.map))  // false — raw, not reactive

// ── When to use: ────────────────────────────────────────
// 1. Third-party class instances (Map, Set, Date, custom classes)
//    that have their own internal state — Proxy wrapping can break them.
// 2. Large binary data (ArrayBuffer, ImageData) — no point in tracking.
// 3. Renderer objects (WebGL contexts, chart instances).

// ⚠️ markRaw is PERMANENT — once marked, the object can never be made reactive.
// Use reactive() first if you need tracking, markRaw only for true escapes.
```
::

## effectScope — Lifecycle-Managed Effect Grouping

::code-wrapper{language="typescript" filename="effect-scope.ts"}
```typescript
import { effectScope, ref, watchEffect, onScopeDispose } from 'vue'

// ── effectScope: groups multiple effects for collective cleanup ──
// When the scope is stopped, ALL effects inside are auto-disposed.
// Critical for composables that create effects that must be cleaned up
// when the hosting component unmounts (or when the scope is manually stopped).

function useMouseTracker() {
  const x = ref(0)
  const y = ref(0)

  const scope = effectScope()

  scope.run(() => {
    // All effects created inside run() are registered with this scope.
    watchEffect(() => {
      window.addEventListener('mousemove', (e) => {
        x.value = e.clientX
        y.value = e.clientY
      })
    })

    // onScopeDispose: runs when the parent scope stops — cleanup listeners.
    onScopeDispose(() => {
      window.removeEventListener('mousemove', handler)
    })
  })

  return { x, y, stop: () => scope.stop() }
  // scope.stop() tears down ALL effects and runs all onScopeDispose callbacks.
}

// ── In a component, <script setup> creates an effectScope automatically ──
// All watch/watchEffect created in setup() are bound to the component's scope.
// Component unmount → scope.stop() → all effects disposed. No manual cleanup needed.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
import { ref, unref, toValue, isRef, isReactive, isProxy, toRaw } from 'vue'

// ── 1. unref() vs toValue() — normalize refs to values ──
const r = ref(42)
unref(r)           // 42 — unwraps if ref, returns value as-is if not
toValue(r)         // 42 — also unwraps refs AND getters (computed-like)
// toValue is newer (3.3+), handles: ref, computed, getter function, plain value.

// ── 2. toRaw() — get the underlying object behind a reactive Proxy ──
const state = reactive({ a: 1 })
toRaw(state)  // { a: 1 } — the original object, no Proxy wrapper
// Useful for passing reactive state to libraries that don't expect Proxies.

// ── 3. isProxy() / isReactive() / isReadonly() — type guards ──
isProxy(state)      // true — it's a reactive or readonly proxy
isReactive(state)   // true — it's a reactive proxy
isReadonly(state)   // false

// ── 4. ref unwrapping in reactive() is shallow at one level ──
// reactive({ count: ref(0) }).count → 0 (unwrapped)
// But reactive({ nested: { count: ref(0) } }).nested.count → ref(0) (NOT unwrapped)
// Unwrapping only happens at the direct property level, not nested.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
import { ref, reactive, computed, watch } from 'vue'

// ── 1. reactive() + destructuring = lost reactivity ──
const s = reactive({ a: 1 })
const { a } = s  // a is now 1 (plain number), NOT reactive
s.a = 2          // the local `a` is still 1 — no connection
// Fix: use toRefs() before destructuring.

// ── 2. ref() in reactive arrays is NOT unwrapped ──
const arr = reactive([ref(1), ref(2)])
arr[0]  // ref(1), NOT 1 — arrays don't unwrap nested refs
// Only direct properties of reactive objects unwrap. Arrays, Maps don't.

// ── 3. Reassigning a reactive() variable breaks the Proxy ──
let state = reactive({ count: 0 })
state = reactive({ count: 1 })  // old Proxy orphaned, bindings lost
// Fix: use ref() if you need to replace the whole value.

// ── 4. computed() is lazy — won't run until read ──
const expensive = computed(() => heavyCalc(state.count))
// If nothing reads expensive.value, heavyCalc never runs.
// To force eager evaluation, use watchEffect (immediate, not lazy).

// ── 5. Circular references in reactive objects ──
const a = reactive({})
const b = reactive({ parent: a })
a.child = b  // circular ref — Vue handles this fine (Proxy doesn't recurse on creation)
// But watch with deep:true on a circular structure can cause infinite loops.

// ── 6. Map/Set inside reactive() — methods return reactive versions ──
const map = reactive(new Map([['k', { v: 1 }]]))
map.get('k')  // returns a REACTIVE proxy of the stored object
// This is why Map/Set work with reactivity in Vue 3 — Vue wraps values on get.
```
::

## 🧠 Spot the Bug

A developer destructures a reactive form object and loses reactivity in the extracted fields.

::code-wrapper{language="typescript" filename="DestructuringBug.ts"}
```typescript
import { reactive, watchEffect } from 'vue'

const form = reactive({ email: '', password: '' })

function handleSubmit() {
  const { email, password } = form  // plain strings — disconnected from Proxy
  api.login(email, password)        // always sees initial '' values
}

watchEffect(() => {
  // This effect reads `form.email` directly — still reactive
  console.log('email changed:', form.email)
})
```
::

<details>
<summary>Answer</summary>

Destructuring a reactive object copies the *current values* out of the Proxy. The local `email` and `password` are plain strings with no connection to the reactive system — they're snapshots, not live references.

**Fix** — use `toRefs()` to create refs that read/write through the original Proxy:

::code-wrapper{language="typescript" filename="DestructuringFixed.ts"}
```typescript
import { reactive, toRefs } from 'vue'

const form = reactive({ email: '', password: '' })

// toRefs creates ref wrappers that delegate to the original reactive object
const { email, password } = toRefs(form)

function handleSubmit() {
  // email.value and password.value read through the Proxy — always current
  api.login(email.value, password.value)
}
```
::

**The lesson**: destructuring a `reactive()` object severs the reactive link. `toRefs()` repairs it by creating per-property refs that proxy through to the original object's getters/setters.

</details>