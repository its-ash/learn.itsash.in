# 15 — Custom Directives

## What a Directive Is For

A directive is the right tool specifically when you need **low-level, direct DOM access** that has no natural expression as a component or a prop — focusing an element, measuring it, attaching a non-Vue-managed event listener, or integrating a third-party DOM library. If the logic doesn't need direct DOM manipulation, a composable (chapter 07) is almost always the better fit; directives exist for the remaining cases where it genuinely does.

## Registering a Directive

::code-wrapper{language="vue" filename="LoginForm.vue"}
```vue
<script setup>
// local, component-scoped registration — vNameOfDirective in <script setup>
// is automatically recognized as the directive `v-name-of-directive`
const vFocus = {
  mounted: (el) => el.focus()
}
</script>

<template>
  <input v-focus placeholder="Autofocused on mount" />
</template>
```
::

For app-wide reuse, register directives globally, exactly parallel to global component registration:

::code-wrapper{language="javascript" filename="main.js"}
```javascript
import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)

app.directive('focus', {
  mounted: (el) => el.focus()
})

app.mount('#app')
```
::

## Directive Hooks

A directive's lifecycle mirrors a component's, with its own dedicated hook names:

| Hook | Fires when |
|---|---|
| `created` | Before the element's attributes/listeners are applied. |
| `beforeMount` | Right before the element is inserted into the DOM. |
| `mounted` | After the element (and its parent) exist in the DOM. |
| `beforeUpdate` | Before the containing component's VNode updates. |
| `updated` | After the containing component's VNode (and children) update. |
| `beforeUnmount` | Before the element is removed. |
| `unmounted` | After the element is removed — cleanup goes here. |

::code-wrapper{language="javascript" filename="directives/highlight.js"}
```javascript
export const vHighlight = {
  mounted(el, binding) {
    el.style.backgroundColor = binding.value ?? 'yellow'
  },
  updated(el, binding) {
    // re-applies whenever the bound expression's value changes
    el.style.backgroundColor = binding.value ?? 'yellow'
  }
}
```
::

Most directives only need `mounted` (and its `unmounted` counterpart for cleanup) — `beforeUpdate`/`updated` are for directives whose DOM effect genuinely depends on a bound value that can change after the initial mount, like the highlight color above.

## The `binding` Object

::code-wrapper{language="vue"}
```vue
<template>
  <div v-example:someArg.modifierA.modifierB="someValue"></div>
</template>
```
::

::code-wrapper{language="javascript"}
```javascript
export const vExample = {
  mounted(el, binding) {
    binding.value      // someValue's actual current value
    binding.arg        // 'someArg'
    binding.modifiers   // { modifierA: true, modifierB: true }
    binding.oldValue   // available in updated/beforeUpdate — previous value
    binding.instance   // the component instance using the directive
  }
}
```
::

## Practical Example: `v-click-outside`

::code-wrapper{language="javascript" filename="directives/clickOutside.js"}
```javascript
export const vClickOutside = {
  mounted(el, binding) {
    el._clickOutsideHandler = (event) => {
      if (!el.contains(event.target)) {
        binding.value(event)
      }
    }
    // capture-phase + a microtask delay avoids the SAME click that opened
    // the dropdown/menu immediately closing it again
    setTimeout(() => {
      document.addEventListener('click', el._clickOutsideHandler)
    })
  },
  unmounted(el) {
    document.removeEventListener('click', el._clickOutsideHandler)
    delete el._clickOutsideHandler
  }
}
```
::

::code-wrapper{language="vue" filename="DropdownMenu.vue"}
```vue
<script setup>
import { ref } from 'vue'
import { vClickOutside } from '@/directives/clickOutside'

const isOpen = ref(false)
</script>

<template>
  <div v-click-outside="() => (isOpen = false)">
    <button @click="isOpen = !isOpen">Menu</button>
    <ul v-if="isOpen">
      <li>Profile</li>
      <li>Logout</li>
    </ul>
  </div>
</template>
```
::

Storing the handler reference on the element itself (`el._clickOutsideHandler`) is the standard pattern for directives that need to remove exactly the listener they added — an anonymous inline function passed straight to `addEventListener` in `mounted` couldn't be removed later, since `removeEventListener` requires the *same function reference* that was originally added.

## Practical Example: `v-tooltip`

::code-wrapper{language="javascript" filename="directives/tooltip.js"}
```javascript
export const vTooltip = {
  mounted(el, binding) {
    const tip = document.createElement('div')
    tip.className = 'tooltip'
    tip.textContent = binding.value
    tip.style.display = 'none'
    document.body.appendChild(tip)
    el._tooltipEl = tip

    el._showTip = () => {
      const rect = el.getBoundingClientRect()
      tip.style.left = `${rect.left}px`
      tip.style.top = `${rect.top - tip.offsetHeight - 6}px`
      tip.style.display = 'block'
    }
    el._hideTip = () => { tip.style.display = 'none' }

    el.addEventListener('mouseenter', el._showTip)
    el.addEventListener('mouseleave', el._hideTip)
  },
  updated(el, binding) {
    if (el._tooltipEl) el._tooltipEl.textContent = binding.value
  },
  unmounted(el) {
    el.removeEventListener('mouseenter', el._showTip)
    el.removeEventListener('mouseleave', el._hideTip)
    el._tooltipEl?.remove()
  }
}
```
::

::code-wrapper{language="vue"}
```vue
<template>
  <button v-tooltip="'Click to save your changes'">Save</button>
</template>
```
::

This directive appends a DOM node *outside* the component's own template tree (`document.body`) — the same underlying technique `<Teleport>` (chapter 16) formalizes; a directive doing it manually needs to be scrupulous about cleaning up that external node in `unmounted`, since nothing else will.

## Function Shorthand

When a directive only needs the same logic for `mounted` and `updated`, a plain function is shorthand for `{ mounted: fn, updated: fn }`:

::code-wrapper{language="javascript" filename="directives/color.js"}
```javascript
export const vColor = (el, binding) => {
  el.style.color = binding.value
}
```
::

## Directives on Components

Since Vue 3, a custom directive can be applied to a component tag, not just a plain element — but it applies to the component's single root element only, and doesn't automatically pass through the way `class`/`style` fallthrough attributes do:

::code-wrapper{language="vue"}
```vue
<template>
  <!-- works only if MyButton has a single root element and it accepts -->
  <!-- fallthrough behavior — an intentional, not automatic, contract -->
  <MyButton v-focus />
</template>
```
::

Applying a DOM-manipulation directive to a multi-root-element (fragment) component is ambiguous and produces a dev warning — directives generally shouldn't be applied to components at all except in narrow, well-understood cases; reach for props or `defineExpose`-based imperative methods instead for component-level behavior.

## Options API Equivalent

Directive registration and hook definitions are identical in the Options API — the only difference is where local, component-scoped directives are declared:

::code-wrapper{language="vue"}
```vue
<script>
export default {
  directives: {
    focus: {
      mounted: (el) => el.focus()
    }
  }
}
</script>

<template>
  <input v-focus />
</template>
```
::

## 💡 Tips & Tricks

- **Idiom** — Reach for a directive only when the behavior needs direct DOM access with no natural component/prop shape — most "I need reusable logic" needs are better served by a composable; directives are the minority case, not the default reuse mechanism.
- **Debug** — Store any handler/element reference a directive creates directly on the `el` itself (`el._myHandler`, `el._myTooltip`) — it's the simplest reliable way to retrieve the exact same reference later in `unmounted` for correct cleanup, without a separate WeakMap or module-level registry.
- **Idiom** — Prefer the function shorthand (`{mounted, updated}` combined) whenever a directive's `mounted` and `updated` logic are identical — it removes a whole category of "I updated `mounted` but forgot to update `updated` to match" bugs.
- **Debug** — `binding.oldValue` (available in `updated`/`beforeUpdate`) lets a directive skip redundant DOM work when the bound value hasn't actually changed in a way that matters — useful when a directive's `updated` hook would otherwise run expensive work on every unrelated re-render of the host component.
- **Performance** — A `v-click-outside`-style directive should register its listener on `document` once per element (with cleanup in `unmounted`), never inside a per-render hook — registering inside `updated` without matching removal accumulates duplicate listeners on every re-render.

## ⚠️ Edge Cases & Gotchas

- **Applying a DOM-manipulation directive to a component only ever touches its single root element** — And only works predictably if the component happens to render a single root node; a component using multiple root nodes (a "fragment" component) makes directive application ambiguous, and Vue warns rather than guessing which node you meant.
- **`removeEventListener` silently does nothing if given a different function reference than the one originally added** — An inline arrow function passed to `addEventListener` inside `mounted` cannot be removed in `unmounted` unless the *exact same* function reference was saved somewhere (typically on `el` itself) — passing a new inline arrow function to `removeEventListener` compiles fine, runs without error, and simply fails to remove anything, leaking the original listener.
- **A `v-click-outside` directive added without a delay/setTimeout can immediately fire on the very click that opened the element** — Because the same synchronous click event that toggles `isOpen = true` also bubbles up to `document` in the current event loop tick if the listener is attached in the same tick — attaching via `setTimeout(() => ..., 0)` (or listening on `click` in the capture phase with care) defers registration to the next tick, avoiding the self-closing bug.
- **`updated` on a directive fires on every re-render of the containing component, not just when the directive's own bound value changes** — Exactly like a component's `onUpdated` hook (chapter 08), a directive's `updated` hook can fire far more often than "the value I actually care about changed" — compare `binding.value` against `binding.oldValue` explicitly if the hook does anything non-trivial.
- **A directive that appends a DOM node outside the component tree (like the tooltip example) will leak that node forever if `unmounted` cleanup is skipped or throws** — Because that node lives outside Vue's own tracked template tree, Vue's own unmounting process has no idea it exists and cannot clean it up on your behalf under any circumstance — this responsibility belongs entirely and exclusively to the directive's own `unmounted` hook.

## 🧠 Spot the Bug

A `v-highlight` directive is meant to update an element's background color whenever the bound value changes, but after the first render it never updates again.

::code-wrapper{language="javascript" filename="directives/highlight.js"}
```javascript
export const vHighlight = {
  mounted(el, binding) {
    el.style.backgroundColor = binding.value
  }
}
```
::

::code-wrapper{language="vue"}
```vue
<script setup>
import { ref } from 'vue'
import { vHighlight } from '@/directives/highlight'

const color = ref('yellow')
</script>

<template>
  <div v-highlight="color">Status</div>
  <button @click="color = 'lightgreen'">Change color</button>
</template>
```
::

<details>
<summary>Answer</summary>

The directive only defines a `mounted` hook — it never defines `updated`. `mounted` fires exactly once, when the element is first inserted into the DOM; nothing in this directive re-runs when `color.value` changes afterward, so the `<div>`'s background is set correctly on first render and then simply never touched again, no matter how many times `color` changes. This mirrors the `onMounted`-fires-once trap from chapter 08's Spot the Bug — same underlying principle, directive-hook flavored.

::code-wrapper{language="javascript" filename="directives/highlight.js"}
```javascript
export const vHighlight = {
  mounted(el, binding) {
    el.style.backgroundColor = binding.value
  },
  updated(el, binding) {
    el.style.backgroundColor = binding.value
  }
}
```
::

**The lesson**: any directive effect that should track a *changing* bound value needs an explicit `updated` hook — `mounted` alone only captures the value's state at the moment the element first entered the DOM, exactly once, ever.

</details>

## Key Takeaways

- Reach for a custom directive specifically when logic needs direct, imperative DOM access with no natural component/prop shape — composables cover most other reuse needs.
- Directive hooks (`mounted`, `updated`, `unmounted`, etc.) mirror a component's own lifecycle, with `binding` (value, arg, modifiers, oldValue) as the payload.
- A directive that adds an event listener or external DOM node in `mounted` must remove/clean it up in `unmounted` — save the exact reference on `el` itself so cleanup can target it precisely.
- The function shorthand (`(el, binding) => {...}`) covers directives where `mounted` and `updated` share identical logic.
- Directives applied to components only affect the component's single root element, and behave ambiguously (with a dev warning) on multi-root fragment components.
- `updated` fires on every re-render of the host component, not only when the directive's own bound value changes — compare `binding.value` to `binding.oldValue` when that distinction matters.
