# 03 — Reactivity Fundamentals

## Why Reactivity Exists

Every UI framework has to solve the same problem: when application state changes, the DOM must update to match. Vue's answer is a **reactivity system** — plain JavaScript values are wrapped so that reading them registers a dependency, and writing to them notifies anything that depends on them to re-run. You never manually call `render()` or `setState()`; you just mutate a value and the parts of the DOM (or `computed`s, or `watch`ers) that used it update themselves.

Under the hood, Vue 3's reactivity is built on ES2015 `Proxy` objects. A `Proxy` wraps a target object and intercepts fundamental operations — property get, set, delete, has, and (for arrays) methods like `push`. This is a structural improvement over Vue 2's `Object.defineProperty`, which required walking every property up front and could not intercept property *addition* or array index/length assignment.

## `ref()` — Reactive Primitives (and Everything Else)

`ref()` wraps any value — primitive or object — in a reactive container with a single `.value` property:

::code-wrapper{language="javascript"}
```javascript
import { ref } from 'vue'

const count = ref(0)
console.log(count.value)   // 0

count.value++
console.log(count.value)   // 1

const user = ref({ name: 'Ada', age: 30 })
user.value.age++           // still reactive — .value holds a reactive object
```
::

`ref` works by wrapping the value in an object with a getter/setter pair for `.value`; reading `.value` inside a reactive context (a component's `render`, a `computed`, or a `watchEffect`) registers that context as a dependency, and writing to `.value` triggers every registered dependent to re-run.

### Why `.value` in script, but not in templates

::code-wrapper{language="vue" filename="Counter.vue"}
```vue
<script setup>
import { ref } from 'vue'

const count = ref(0)

function increment() {
  count.value++   // .value required in <script>
}
</script>

<template>
  <!-- NO .value needed here — template refs are auto-unwrapped -->
  <button @click="increment">{{ count }}</button>
</template>
```
::

Vue's template compiler knows which top-level bindings returned from `<script setup>` are refs, and automatically inserts the `.value` unwrapping for you at the template's top level only. This is a compile-time convenience, not a runtime behavior — which is exactly why unwrapping does **not** happen at nested levels (see the gotcha below).

## `reactive()` — Deeply Reactive Objects

`reactive()` wraps an object directly (no `.value` needed) and makes every nested property reactive too:

::code-wrapper{language="javascript"}
```javascript
import { reactive } from 'vue'

const state = reactive({
  user: { name: 'Ada', age: 30 },
  todos: [{ id: 1, text: 'Learn reactivity', done: false }]
})

state.user.age++                    // reactive
state.todos.push({ id: 2, text: 'Ship it', done: false })  // reactive
state.todos[0].done = true          // reactive — nested objects too
```
::

`reactive()` only works on objects, arrays, and collection types (`Map`, `Set`) — calling it on a primitive (`reactive(0)`) is a no-op that returns the primitive unwrapped and unreactive, which is why Vue emits a runtime warning if you try it.

## `ref` vs `reactive` — Choosing Between Them

| | `ref()` | `reactive()` |
|---|---|---|
| Works with primitives | Yes | No — objects/arrays/collections only |
| Access syntax in `<script>` | `.value` | Direct property access |
| Access syntax in `<template>` | Auto-unwrapped (top-level) | Direct property access |
| Reassignment | `count.value = newValue` keeps reactivity | `state = newObject` **breaks** reactivity (loses the Proxy) |
| Destructuring | `.value` extraction loses nothing (it's already a plain value) | Destructuring properties loses reactivity (see below) |

A common convention: use `ref` for primitives and for values you might need to reassign wholesale (e.g., replacing an entire fetched object), and `reactive` for a cohesive chunk of related state you'll only ever mutate in place. Many teams simplify further and use `ref` for *everything*, since `ref` also works for objects and sidesteps the reactive-reassignment and destructuring pitfalls entirely.

## The Destructuring Trap

This is the single most common Vue 3 reactivity bug, and it affects both `reactive()` and props.

::code-wrapper{language="vue"}
```vue
<script setup>
import { reactive } from 'vue'

const state = reactive({ count: 0, name: 'Widget' })

// WRONG — destructuring pulls out a plain, disconnected value
const { count } = state

function increment() {
  count++          // reassigns the local variable, NOT state.count
}
</script>

<template>
  <!-- never updates, because it reads state.count directly, -->
  <!-- while increment() mutates a completely separate local variable -->
  <p>{{ state.count }}</p>
  <button @click="increment">+1</button>
</template>
```
::

`reactive()`'s magic lives entirely in the `Proxy` wrapping the *object*. When you write `const { count } = state`, JavaScript's destructuring reads `state.count`'s current value at that instant and assigns it to a brand-new, plain local variable — the Proxy is left behind. The local `count` has no getter/setter tied to `state`, so it's just a number.

The fix is `toRef`/`toRefs`, which create refs that stay live-linked to the source object's properties:

::code-wrapper{language="vue"}
```vue
<script setup>
import { reactive, toRefs, toRef } from 'vue'

const state = reactive({ count: 0, name: 'Widget' })

// RIGHT — toRefs converts every property into a linked ref
const { count, name } = toRefs(state)

// or convert just one property with toRef
const countRef = toRef(state, 'count')

function increment() {
  count.value++   // writes through to state.count, because it's a live ref
}
</script>

<template>
  <p>{{ state.count }}</p>  <!-- updates correctly -->
  <button @click="increment">+1</button>
</template>
```
::

`toRef`/`toRefs` create a ref whose getter/setter read and write the *original* object's property, rather than snapshotting a value — so `count.value++` still reads through to `state.count`. This is exactly why composables (chapter 07) that accept a `reactive` object and need to return individual pieces of it always call `toRefs()` on their return value — otherwise, destructuring the composable's return in the calling component silently disconnects everything.

## Reassigning `reactive()` Objects Breaks Reactivity

::code-wrapper{language="javascript"}
```javascript
import { reactive } from 'vue'

let state = reactive({ count: 0 })
const original = state

// WRONG — this doesn't mutate the proxy, it points the local
// `state` variable at a brand new plain object
state = { count: 100 }

console.log(original.count) // still 0 — original proxy untouched
```
::

Because `reactive()` returns a Proxy wrapping one specific object, reassigning the variable that held it just makes the variable point elsewhere — any template or effect that captured a reference to the *original* proxy (which is the normal case, since you don't usually re-run `reactive()` mid-component) never sees the new object. The fix is either to mutate properties in place (`Object.assign(state, { count: 100 })`) or to use a `ref` instead, since reassigning `someRef.value = newObject` is explicitly supported and reactive.

## `ref` Unwrapping Rules

Refs unwrap (you can drop `.value`) automatically in specific contexts, and stay wrapped (you must keep `.value`) everywhere else. This asymmetry causes real confusion:

::code-wrapper{language="javascript"}
```javascript
import { ref, reactive } from 'vue'

const count = ref(0)

// Unwraps: top-level property access on a reactive object
const state = reactive({ count })
console.log(state.count)     // 0 — no .value needed, auto-unwrapped
state.count++                // 1 — writes through to the original ref

// Does NOT unwrap: ref inside an array
const list = reactive([count])
console.log(list[0].value)   // .value IS needed here — arrays don't auto-unwrap

// Does NOT unwrap: ref as a value in a Map/Set
const map = reactive(new Map([['count', count]]))
console.log(map.get('count').value) // .value IS needed here too
```
::

The rule: a `ref` unwraps automatically only when accessed as a **top-level property of a `reactive` object** (or in a template's top-level bindings). Inside arrays and native collection types, unwrapping does not happen, because index/key-based access can't distinguish "this is a ref I want unwrapped" from "this is a ref value I actually want to keep as a ref" reliably the way named-property access can.

## `readonly()` — Preventing Mutation

`readonly()` wraps a `reactive` (or plain) object so that write attempts are intercepted and produce a runtime warning instead of applying:

::code-wrapper{language="javascript"}
```javascript
import { reactive, readonly } from 'vue'

const state = reactive({ count: 0 })
const readOnlyState = readonly(state)

readOnlyState.count++
// [Vue warn]: Set operation on key "count" failed: target is readonly.

state.count++              // still works — mutating the original is allowed
console.log(readOnlyState.count) // 1 — readonly is a reflection, not a separate copy
```
::

This is the mechanism behind how Pinia (chapter 10) and provide/inject (chapter 06) commonly expose state that child consumers can read and react to, but not mutate directly — enforcing a one-way data flow convention at runtime, not just by team agreement.

## `isRef`, `unref`, and `toValue`

::code-wrapper{language="javascript"}
```javascript
import { ref, isRef, unref, toValue } from 'vue'

const maybeRef = ref(5)
const plainValue = 5

isRef(maybeRef)    // true
isRef(plainValue)  // false

unref(maybeRef)    // 5 — same as maybeRef.value if it's a ref
unref(plainValue)  // 5 — returns the value unchanged if not a ref

// toValue (Vue 3.3+) additionally unwraps getter functions —
// the standard way composables accept flexible reactive sources
function useDouble(source) {
  return computed(() => toValue(source) * 2)
}
useDouble(5)               // plain value
useDouble(ref(5))          // ref
useDouble(() => count.value) // getter function
```
::

`toValue` is what makes modern composables flexible about what they accept — callers can pass a plain value, a ref, or a getter function, and the composable normalizes all three the same way.

## 💡 Tips & Tricks

- **Idiom** — Default to `ref()` for everything if you're ever unsure — it works for primitives and objects alike, sidesteps the reactive-reassignment pitfall entirely, and its `.value` requirement is a visual reminder in `<script>` of exactly which variables are reactive.
- **Debug** — Vue DevTools' Components panel shows `ref`s with their unwrapped current value directly — no need to manually log `.value` while debugging a component's state live.
- **Performance** — `reactive()` recursively wraps every nested object *lazily*, only when a nested property is actually accessed — so creating a `reactive` object with a huge, rarely-touched nested structure doesn't pay the Proxy-wrapping cost up front for parts you never read.
- **Idiom** — `toRefs()` is almost always called right before `return`ing from a composable — it's the standard way to hand back a `reactive` object's properties without the caller falling into the destructuring trap.
- **Debug** — `markRaw()` marks an object so Vue never makes it reactive at all, even if it later ends up inside a `reactive()` object — useful for large, immutable third-party instances (a chart library instance, a Leaflet map) you never want Vue to proxy-wrap.

## ⚠️ Edge Cases & Gotchas

- **Destructuring `reactive()` disconnects reactivity** — `const { count } = state` copies out a plain value at that instant; further mutation of either side stops affecting the other. Always destructure through `toRefs(state)` instead of the raw object.
- **Reassigning a `reactive()` variable loses the Proxy** — `state = { newData }` points the variable at an unwrapped plain object; any existing template bindings or effects still hold the *original* proxy. Use `Object.assign(state, newData)` to replace contents in place, or switch to `ref` if wholesale reassignment is a common operation.
- **Refs don't auto-unwrap inside arrays or `Map`/`Set`** — Only top-level properties of a `reactive` object (and top-level template bindings) auto-unwrap; a `ref` stored in an array element or a `Map` value still needs `.value`. This inconsistency is intentional (index/key access can't disambiguate) but catches people off guard.
- **`reactive(reactive(obj))` and re-wrapping already-reactive objects is safe but pointless** — Vue detects an object is already a Proxy and returns the same Proxy rather than double-wrapping it, so accidentally calling `reactive()` twice doesn't break anything, but it's a sign of confusion about where reactivity was already established.
- **`ref` equality checks use `Object.is`, so replacing with a deeply-equal-but-different object still triggers effects** — `someRef.value = { ...someRef.value }` (a fresh object with the same contents) still re-runs every watcher/computed depending on it, because reference identity changed even though the data "looks" the same — a subtle source of wasted re-computation if you're not careful about cloning patterns.

## 🧠 Spot the Bug

A composable is supposed to expose a reactive `isOnline` flag to any component that calls it. Every consuming component reports `isOnline` as permanently `false`, no matter the actual network state.

::code-wrapper{language="javascript" filename="useNetworkStatus.js"}
```javascript
import { reactive } from 'vue'

export function useNetworkStatus() {
  const state = reactive({ isOnline: navigator.onLine })

  window.addEventListener('online', () => { state.isOnline = true })
  window.addEventListener('offline', () => { state.isOnline = false })

  return { isOnline: state.isOnline }
}
```
::

::code-wrapper{language="vue" filename="StatusBadge.vue"}
```vue
<script setup>
import { useNetworkStatus } from './useNetworkStatus'
const { isOnline } = useNetworkStatus()
</script>

<template>
  <span>{{ isOnline ? 'Online' : 'Offline' }}</span>
</template>
```
::

<details>
<summary>Answer</summary>

`return { isOnline: state.isOnline }` reads `state.isOnline`'s value **once**, at the moment the composable runs, and returns that plain boolean — it is not connected to `state` at all. The event listeners keep mutating `state.isOnline` correctly, but nothing in the returned object is watching it. Then in the component, `const { isOnline } = useNetworkStatus()` destructures that already-disconnected plain boolean into a template binding that can never change.

The fix is to return refs that stay linked to `state`, using `toRefs`:

::code-wrapper{language="javascript" filename="useNetworkStatus.js"}
```javascript
import { reactive, toRefs } from 'vue'

export function useNetworkStatus() {
  const state = reactive({ isOnline: navigator.onLine })

  window.addEventListener('online', () => { state.isOnline = true })
  window.addEventListener('offline', () => { state.isOnline = false })

  return toRefs(state)
}
```
::

**The lesson**: a composable that returns a plain object literal built from `reactive` properties (`{ isOnline: state.isOnline }`) hands back frozen snapshots, not live bindings — always return `toRefs(state)` (or individual `ref`s) so consumers stay connected to future updates.

</details>

## Key Takeaways

- Vue 3's reactivity uses `Proxy` to intercept get/set/delete on objects — `ref()` wraps any value behind `.value`; `reactive()` wraps objects/arrays/collections directly.
- Destructuring a `reactive()` object (or a composable's plain-object return of reactive properties) copies out disconnected plain values — always go through `toRefs()`/`toRef()` first.
- Reassigning a `reactive()` variable to a new object loses the Proxy; mutate in place with `Object.assign()`, or use `ref` if wholesale replacement is common.
- Refs auto-unwrap only as top-level properties of a `reactive` object or top-level template bindings — not inside arrays, `Map`, or `Set`.
- `readonly()` produces a reflection that warns on write attempts, enabling one-way data flow without a separate copy.
- `toValue()` (3.3+) normalizes plain values, refs, and getter functions into a single access pattern — the modern way to write flexible composables.
