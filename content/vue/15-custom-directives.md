---
title: Vue 3 Engineering Reference — Custom Directives
description: Directive hook lifecycle (created, beforeMount, mounted, beforeUpdate, updated, beforeUnmount, unmounted), hook argument shape, directive function shorthand, and production patterns for intersection observer and copy directives.
---

# 15 — Custom Directives

## Directive Hook Lifecycle

::code-wrapper{language="typescript" filename="directive-hooks.ts"}
```typescript
import { type Directive, type DirectiveBinding } from 'vue'

// ── Directive hooks fire in parallel with component lifecycle ──
// The directive object can implement any subset of these hooks.

const myDirective: Directive = {
  // ── created: before the element's attributes/event listeners are applied ──
  // Useful for setting up something that must exist before Vue patches attrs.
  created(el, binding, vnode, prevVnode) {
    // el: the DOM element (always a real element, even for components)
    // binding.value: the value passed to v-directive="value"
    // binding.oldValue: previous value (only in beforeUpdate/updated)
    // binding.arg: the argument (v-directive:foo → "foo")
    // binding.modifiers: object of modifiers (v-directive.bar → { bar: true })
    // binding.instance: the component instance using the directive
    // vnode: the virtual node of the element
  },

  // ── beforeMount: before the element is inserted into the DOM ──
  // Element exists in memory but not in document yet. Can't measure size.
  beforeMount(el, binding) {},

  // ── mounted: element is in the DOM ──
  // Safe to measure (getBoundingClientRect), attach event listeners, init libraries.
  mounted(el, binding) {},

  // ── beforeUpdate: before the element's VNode updates ──
  // binding.oldValue is available here (the value before the update).
  beforeUpdate(el, binding, vnode, oldVnode) {},

  // ── updated: after the element's VNode (and children) have updated ──
  updated(el, binding) {},

  // ── beforeUnmount: before the element is removed from DOM ──
  // Element is still in the DOM — cleanup that needs the element can run here.
  beforeUnmount(el) {},

  // ── unmounted: element removed from DOM ──
  // Final cleanup — remove event listeners, destroy library instances.
  unmounted(el) {},
}

// ── Shorthand: if you only need mounted + updated, pass a function ──
// This function runs in both mounted and updated hooks.
const vFocus: Directive = (el, binding) => {
  if (binding.value) el.focus()
}
```
::

## Production Directive — v-lazy with IntersectionObserver

::code-wrapper{language="typescript" filename="vLazy.ts"}
```typescript
import { type Directive } from 'vue'

// ── v-lazy: lazy-load images when they scroll into view ──
// Usage: <img v-lazy="imageUrl" />
// Only sets src when the element intersects the viewport, reducing initial load.

export const vLazy: Directive<HTMLImageElement, string> = {
  mounted(el, binding) {
    // ── Store the target src, don't set it yet ──
    el.dataset.src = binding.value

    // ── IntersectionObserver: fires callback when element enters viewport ──
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Element is visible — set the src to trigger the image load
            el.src = el.dataset.src!
            // Stop observing once loaded (one-shot, not continuous)
            observer.unobserve(el)
          }
        })
      },
      {
        // ── rootMargin: start loading 50px before element enters viewport ──
        // Reduces visible "pop-in" — image is loading before user sees the empty slot.
        rootMargin: '50px',
        threshold: 0.01,  // trigger when 1% of element is visible
      }
    )

    observer.observe(el)
    // ── Store observer for cleanup in unmounted ──
    el._lazyObserver = observer
  },

  updated(el, binding) {
    // ── Handle dynamic src changes ──
    if (binding.value !== binding.oldValue) {
      el.dataset.src = binding.value
      el.src = binding.value  // already in view, update immediately
    }
  },

  unmounted(el) {
    // ── Cleanup: disconnect observer to prevent memory leaks ──
    el._lazyObserver?.disconnect()
  },
}

// ── Augment HTMLElement for TypeScript ──
declare global {
  interface HTMLElement {
    _lazyObserver?: IntersectionObserver
  }
}
```
::

## Production Directive — v-copy Clipboard

::code-wrapper{language="typescript" filename="vCopy.ts"}
```typescript
import { type Directive } from 'vue'

// ── v-copy: copy text to clipboard on click ──
// Usage: <button v-copy="textToCopy">Copy</button>
// Supports modifier: v-copy.toast to show a toast on success.

export const vCopy: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    // ── Store the click handler so we can remove it on unmount ──
    el._copyHandler = async () => {
      const text = binding.value
      try {
        // ── Clipboard API (modern, secure context only) ──
        await navigator.clipboard.writeText(text)

        // ── Optional: emit a custom event for the component to listen to ──
        el.dispatchEvent(new CustomEvent('copied', { detail: { text } }))

        // ── Modifier: show toast if v-copy.toast ──
        if (binding.modifiers.toast) {
          showToast('Copied to clipboard')
        }
      } catch (e) {
        // ── Fallback: execCommand (deprecated but works in non-secure contexts) ──
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
    }

    el.addEventListener('click', el._copyHandler)
  },

  // ── updated: handle dynamic value changes (binding.value updated) ──
  // The click handler reads binding.value at click time, so if we re-create
  // the handler on every update, we always have the latest value.
  updated(el, binding) {
    if (binding.value !== binding.oldValue) {
      el.removeEventListener('click', el._copyHandler!)
      el._copyHandler = createHandler(binding)
      el.addEventListener('click', el._copyHandler)
    }
  },

  unmounted(el) {
    el.removeEventListener('click', el._copyHandler!)
  },
}

function createHandler(binding: DirectiveBinding<string>) {
  return async () => {
    await navigator.clipboard.writeText(binding.value)
  }
}

declare global {
  interface HTMLElement {
    _copyHandler?: () => void
  }
}
```
::

## Directive Arguments and Modifiers

::code-wrapper{language="vue" filename="DirectiveArgs.vue"}
```vue
<script setup>
// ── v-permission:role.admin="user" ────────────────────
// binding.arg = "role" (the part after the colon)
// binding.modifiers = { admin: true } (the dots)
// binding.value = user (the expression result)

const vPermission = {
  mounted(el, binding) {
    const { arg, modifiers, value } = binding
    // arg = 'role', modifiers = { admin: true }, value = user object
    if (arg === 'role' && modifiers.admin && value.role !== 'admin') {
      el.remove()  // remove element if user is not admin
    }
    // Or: el.style.display = 'none' for hide instead of remove
  },
}
</script>

<template>
  <div v-permission:role.admin="user">Admin only content</div>
  <!-- arg: 'role', modifiers: { admin: true }, value: user -->
</template>
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
// ── 1. Directive naming: v- prefix in templates, vXxx in script ──
// export const vFocus = { ... } → used as <input v-focus />
// The 'v' prefix is automatic in templates; the variable must start with 'v'.

// ── 2. Directives on components: applied to the root element ──
// <MyComp v-focus /> → v-focus runs on MyComp's root DOM element.
// With fragments (multiple roots), a warning is issued (ambiguous target).

// ── 3. Function shorthand: mounted + updated only ──
// const vColor = (el, binding) => { el.style.color = binding.value }
// Equivalent to { mounted(el, b) {...}, updated(el, b) {...} }

// ── 4. Custom events from directives ──
// el.dispatchEvent(new CustomEvent('my-event', { detail: payload }))
// Parent listens: <div v-my @my-event="handler" />

// ── 5. Global registration: app.directive() ──
// app.directive('lazy', vLazy) → available in ALL components without import.
// Use for app-wide directives (v-focus, v-permission); local for one-off.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. Directives don't receive the component instance via `this` ──
// Use binding.instance to access the component that uses the directive.
// `this` inside a directive hook is undefined — not the component instance.

// ── 2. Directives on components with fragments (multiple roots) warn ──
// Vue can't know which root to apply the directive to.
// Use a single root element, or apply the directive to a specific element inside.

// ── 3. Cleanup in unmounted is MANDATORY for observers/listeners ──
// Without cleanup: memory leaks, stale callbacks firing on detached elements.
// Always store references (observer, handler) on el and remove in unmounted.

// ── 4. binding.value can be any type — check before using ──
// v-my="42" → binding.value = 42 (number)
// v-my="user.name" → binding.value = string
// v-my="{ a: 1 }" → binding.value = object
// Validate the type inside the directive to avoid runtime errors.

// ── 5. Directive hooks fire AFTER component lifecycle hooks ──
// mounted hook: component's onMounted fires first, then directive's mounted.
// If the directive needs component state initialized in onMounted, it's ready.

// ── 6. v-bind='$attrs' can conflict with directives on the same element ──
// If parent passes an attribute that the directive also modifies, order matters.
// Directives run after attribute patching — directive wins.
```
::

## 🧠 Spot the Bug

A v-tooltip directive works initially but leaks memory — tooltips accumulate in the DOM.

::code-wrapper{language="typescript" filename="TooltipBug.ts"}
```typescript
export const vTooltip = {
  mounted(el, binding) {
    const tooltip = document.createElement('div')
    tooltip.textContent = binding.value
    tooltip.className = 'tooltip'
    document.body.appendChild(tooltip)

    el.addEventListener('mouseenter', () => {
      tooltip.style.display = 'block'
    })
    el.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none'
    })
    // ❌ No cleanup — tooltip div and event listeners persist after unmount
  },
}
```
::

<details>
<summary>Answer</summary>

The `tooltip` div is appended to `document.body` and never removed. Event listeners are added but never removed. When the element unmounts, the tooltip div and listeners persist — a memory leak that accumulates across navigations.

**Fix** — store references and clean up in `unmounted`:

::code-wrapper{language="typescript" filename="TooltipFixed.ts"}
```typescript
export const vTooltip = {
  mounted(el, binding) {
    const tooltip = document.createElement('div')
    tooltip.textContent = binding.value
    tooltip.className = 'tooltip'
    tooltip.style.display = 'none'
    document.body.appendChild(tooltip)

    const show = () => { tooltip.style.display = 'block' }
    const hide = () => { tooltip.style.display = 'none' }

    el.addEventListener('mouseenter', show)
    el.addEventListener('mouseleave', hide)

    // Store for cleanup
    el._tooltip = { tooltip, show, hide }
  },

  unmounted(el) {
    const { tooltip, show, hide } = el._tooltip
    el.removeEventListener('mouseenter', show)
    el.removeEventListener('mouseleave', hide)
    document.body.removeChild(tooltip)  // remove the DOM element
  },
}
```
::

**The lesson**: every DOM element created, event listener added, or observer created in a directive must be cleaned up in `unmounted`. Without cleanup, the resources outlive the element, causing memory leaks.

</details>