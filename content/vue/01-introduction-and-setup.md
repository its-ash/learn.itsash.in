# 01 — Introduction & Setup

## What Is Vue?

Vue is a **progressive JavaScript framework** for building user interfaces. "Progressive" means you can adopt as little or as much of it as you need — drop a `<script>` tag into a legacy page to sprinkle in interactivity, or build an entire single-page application with routing, state management, and server-side rendering. Key characteristics:

- **Declarative rendering** — you describe *what* the UI should look like for a given state; Vue figures out *how* to update the DOM efficiently.
- **Reactive data system** — change a JavaScript value, and every part of the UI that depends on it updates automatically, with no manual DOM manipulation.
- **Component-based** — UIs are built from small, self-contained, reusable pieces (components) that compose into full applications.
- **Approachable but scalable** — a single HTML file can use Vue via a CDN `<script>` tag; the same mental model scales to large apps with build tooling, TypeScript, and SSR.
- **Two APIs, one framework** — the **Options API** (organize code by option: `data`, `methods`, `computed`) and the **Composition API** (organize code by logical concern, using functions). Vue 3 supports both; new code should default to the Composition API.

## Vue 2 vs Vue 3

Vue 3 is a ground-up rewrite that kept the spirit of Vue 2 while fixing structural limitations. Both are still in real-world use — Vue 2 reached end-of-life in December 2023, so new projects should target Vue 3, but you will absolutely encounter Vue 2 codebases in the wild.

| Aspect | Vue 2 | Vue 3 |
|---|---|---|
| Reactivity engine | `Object.defineProperty` (per-property getter/setter) | `Proxy`-based (whole-object interception) |
| Reactivity limitations | Can't detect new property addition/deletion on objects, or index/length changes on arrays, without `Vue.set` | Detects property addition/deletion and array index/length changes natively |
| Primary API style | Options API (`data`, `methods`, `computed`, `watch`) | Composition API (`ref`, `reactive`, `computed`, `watch`) is the new default; Options API still fully supported |
| Multiple root nodes | Not allowed — every template needs one root element | **Fragments** — templates can have multiple root nodes |
| TypeScript support | Bolted on, awkward with `this` typing | Written in TypeScript from the ground up; excellent inference |
| Global API | `Vue.component()`, `Vue.use()`, mutates a global `Vue` object | `createApp()` — each app instance is isolated, no global mutation |
| Teleport / Suspense | Not available (Portal via third-party library) | Built in (`<Teleport>`, `<Suspense>`) |
| Custom renderer | Possible but not officially separated | `@vue/runtime-core` is renderer-agnostic — powers Vue, but also non-DOM targets |
| Bundle size / performance | Baseline | Smaller runtime, faster patching via compiler-informed "PatchFlags" |

The most important conceptual shift is the reactivity engine. Vue 2's `Object.defineProperty` approach had to walk every property of an object up front and define getters/setters for each one — which is why adding a brand-new property to a reactive object in Vue 2 silently didn't work unless you used `Vue.set(obj, 'newProp', value)`. Vue 3's `Proxy`-based reactivity intercepts *all* operations on an object (get, set, delete, has, and array methods) without needing to know the property names in advance, which is why this restriction disappears in Vue 3.

## Composition API vs Options API — Which Should You Learn?

This course teaches the **Composition API as the primary style** because it's what the Vue team recommends for new projects and what you'll see in modern codebases, third-party libraries, and the official documentation's default examples. But you will see the **Options API** constantly — in Vue 2 migrations, in older tutorials, and in codebases where teams simply prefer its structure. Every chapter that introduces a new concept will show both styles side by side so you can read either fluently, even though your own code should default to Composition API with `<script setup>`.

Here's the same tiny counter component in both styles, to set the pattern you'll see repeated throughout this course:

::code-wrapper{language="vue" filename="CounterOptions.vue"}
```vue
<script>
export default {
  data() {
    return { count: 0 }
  },
  computed: {
    doubled() {
      return this.count * 2
    }
  },
  methods: {
    increment() {
      this.count++
    }
  }
}
</script>

<template>
  <button @click="increment">
    Count: {{ count }} (doubled: {{ doubled }})
  </button>
</template>
```
::

::code-wrapper{language="vue" filename="CounterComposition.vue"}
```vue
<script setup>
import { ref, computed } from 'vue'

const count = ref(0)
const doubled = computed(() => count.value * 2)

function increment() {
  count.value++
}
</script>

<template>
  <button @click="increment">
    Count: {{ count }} (doubled: {{ doubled }})
  </button>
</template>
```
::

Both render identically. The Options API groups code by *type* (all data together, all methods together); the Composition API groups code by *feature* — which matters much more once a component grows past a handful of lines, because related logic (a piece of state, the computed values derived from it, and the functions that mutate it) stays physically together instead of being scattered across `data`, `computed`, and `methods` blocks.

## Scaffolding a Project

The official way to start a new Vue 3 project is `create-vue`, a small CLI built on [Vite](https://vitejs.dev/) (the build tool — covered in depth in chapter 21).

::code-wrapper{language="bash"}
```bash
npm create vue@latest

# You'll be prompted:
# ✔ Project name: … my-vue-app
# ✔ Add TypeScript? … Yes
# ✔ Add JSX Support? … No
# ✔ Add Vue Router for Single Page Application development? … Yes
# ✔ Add Pinia for state management? … Yes
# ✔ Add Vitest for Unit Testing? … Yes
# ✔ Add an End-to-End Testing Solution? … Playwright
# ✔ Add ESLint for code quality? … Yes
# ✔ Add Prettier for code formatting? … Yes

cd my-vue-app
npm install
npm run dev
```
::

This scaffolds a full project with sensible defaults. For quick experiments or learning, the [Vue SFC Playground](https://play.vuejs.org/) runs single-file components entirely in the browser with zero setup.

### The absolute minimum — no build step at all

Because Vue is progressive, you can also skip tooling entirely:

::code-wrapper{language="html" filename="index.html"}
```html
<!DOCTYPE html>
<html>
  <body>
    <div id="app">{{ message }}</div>

    <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
    <script>
      const { createApp, ref } = Vue

      createApp({
        setup() {
          const message = ref('Hello from Vue, no build step required!')
          return { message }
        }
      }).mount('#app')
    </script>
  </body>
</html>
```
::

This is genuinely how Vue got its reputation for approachability — the mental model (reactive state, declarative templates) is identical whether you're loading Vue from a CDN or running a full Vite + TypeScript + Pinia stack.

## Project Structure

A scaffolded `create-vue` project looks like this:

::code-wrapper{language="bash"}
```bash
my-vue-app/
├── index.html            # entry HTML — Vite injects the bundled script here
├── package.json
├── vite.config.js        # Vite build configuration
├── public/               # static assets copied as-is (favicon, robots.txt)
├── src/
│   ├── main.js           # app entry point — createApp().mount()
│   ├── App.vue           # root component
│   ├── assets/           # images, global CSS, processed by the build
│   ├── components/       # reusable components
│   ├── views/            # route-level components (if using Vue Router)
│   ├── router/           # Vue Router configuration
│   ├── stores/           # Pinia stores
│   └── composables/      # reusable Composition API functions (useXyz.js)
└── vitest.config.js
```
::

::code-wrapper{language="javascript" filename="src/main.js"}
```javascript
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
```
::

`createApp()` returns an **app instance** that is isolated from any other app instance on the page — this is the Vue 3 replacement for the old global `Vue` object, and it means you can mount multiple independent Vue apps on the same page (each with its own plugins, global components, and config) without them interfering with each other.

## Single-File Components (SFCs)

The `.vue` file format bundles a component's template, logic, and styles into one file, compiled by Vite/webpack into plain JavaScript:

::code-wrapper{language="vue" filename="Greeting.vue"}
```vue
<script setup>
import { ref } from 'vue'

const name = ref('World')
</script>

<template>
  <h1>Hello, {{ name }}!</h1>
</template>

<style scoped>
h1 {
  color: #42b883;
}
</style>
```
::

The `scoped` attribute on `<style>` makes the CSS apply only to this component's template, by rewriting selectors with a unique data attribute at build time — a real-world reason you rarely need CSS-in-JS or CSS Modules in Vue projects.

## Vue DevTools

The [Vue DevTools browser extension](https://devtools.vuejs.org/) (Chrome, Firefox, Edge) is essential for real development — it lets you:

| Panel | Purpose |
|---|---|
| Components | Inspect the component tree, view/edit `props`, `data`/`refs`, and `computed` values live. |
| Timeline | See events, component lifecycle hooks, and Pinia mutations on a timeline as they happen. |
| Pinia | Inspect store state, time-travel through mutations, manually trigger actions. |
| Router | See the current route, matched records, and route params/query. |
| Settings | Toggle component highlighting on hover/select in the actual page. |

For Vite-based projects, `vite-plugin-vue-devtools` embeds an in-app version of these panels directly into your dev server overlay — useful when the browser extension isn't available (e.g., in certain embedded webviews).

::code-wrapper{language="bash"}
```bash
npm install -D vite-plugin-vue-devtools
```
::

::code-wrapper{language="javascript" filename="vite.config.js"}
```javascript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  plugins: [vue(), vueDevTools()]
})
```
::

## 💡 Tips & Tricks

- **Playground first** — For a quick "does this syntax work?" check, the [Vue SFC Playground](https://play.vuejs.org/) compiles and runs a component entirely client-side and lets you share the result via a URL — faster than spinning up a local project for a one-off question.
- **`npm create vue@latest` accepts flags** — You can skip the interactive prompts entirely with `npm create vue@latest my-app -- --ts --router --pinia --vitest`, useful for scripting project creation in tutorials or CI.
- **The Vue DevTools "Open in editor" button** — When inspecting a component in DevTools, clicking the file path next to the component name opens that exact file in your configured editor — a fast way to jump from "what I see on screen" to "the source that renders it".
- **`app.config.performance = true`** — Set before `.mount()` in development to make the browser's Performance tab show Vue-specific marks (component init, compile, render, patch) — useful for diagnosing which phase of a slow component is actually slow.
- **Global properties for quick prototyping** — `app.config.globalProperties.$myUtil = fn` makes `fn` available as `this.$myUtil` in every Options API component without importing it — handy for prototypes, but avoid it in production code since it hides dependencies (prefer composables, covered in chapter 07).

## ⚠️ Edge Cases & Gotchas

- **`Vue.set` doesn't exist in Vue 3 — and you don't need it** — Vue 2 tutorials tell you to use `Vue.set(obj, 'key', value)` to make new properties reactive. In Vue 3, `Proxy`-based reactivity makes `obj.key = value` reactive automatically, even for brand-new keys. Following stale Vue 2 advice in Vue 3 code is harmless (the function just doesn't exist) but is a sign the source you're learning from is outdated.
- **Multiple root elements changed template validity** — A Vue 2 template *must* have exactly one root element; wrapping everything in an unnecessary `<div>` was a common workaround. Vue 3 allows multiple root nodes (fragments), so `<template><header/><main/><footer/></template>` is valid — but if you have more than one root node, Vue can no longer automatically know which element `$attrs` (non-prop attributes passed from a parent) should fall through to, so you may need `v-bind="$attrs"` explicitly on the intended element.
- **`data()` must return a function, not an object, in components** — Returning a plain object instead of a function from `data()` in the Options API means every instance of that component shares the same object by reference — mutating state in one instance leaks into every other instance. This exact mistake is why Options API examples always show `data() { return { count: 0 } }` rather than `data: { count: 0 }`.
- **CDN builds vs npm builds behave differently** — The global CDN build (`vue.global.js`) exposes `Vue.ref`, `Vue.reactive`, etc. as properties on a `Vue` global. The npm build you import in a bundler project uses named ES module imports (`import { ref } from 'vue'`). Copy-pasting a CDN example into a bundler project (or vice versa) without adjusting the import style is a common first-day error.
- **Vue 3 dropped support for Internet Explorter 11** — If you (or a legacy client requirement) need IE11 support, you must stay on Vue 2, which is now end-of-life and receives no further updates. This is a real, non-academic constraint that occasionally forces teams into difficult migration timelines.

## 🧠 Spot the Bug

A developer ports this Options API component from a Vue 2 tutorial and reports that every card on the page shares the same "expanded" state — clicking one expands all of them.

::code-wrapper{language="vue" filename="Card.vue"}
```vue
<script>
const sharedState = { expanded: false }

export default {
  data() {
    return sharedState
  },
  methods: {
    toggle() {
      this.expanded = !this.expanded
    }
  }
}
</script>

<template>
  <div @click="toggle">{{ expanded ? 'Expanded' : 'Collapsed' }}</div>
</template>
```
::

<details>
<summary>Answer</summary>

`sharedState` is declared once, at module scope, outside the component definition. Every instance of `Card` that calls `data()` returns a reference to the *same* object, so mutating `this.expanded` in one instance mutates the one shared object that every other instance also reads from. This has nothing to do with Vue 2 vs Vue 3 — it's a plain JavaScript reference-sharing bug that `data()` being a function is specifically designed to prevent, as long as the object it returns is created fresh inside the function.

The fix is to construct the object inside `data()` so each component instance gets its own independent copy:

::code-wrapper{language="vue" filename="Card.vue"}
```vue
<script>
export default {
  data() {
    return { expanded: false }
  },
  methods: {
    toggle() {
      this.expanded = !this.expanded
    }
  }
}
</script>
```
::

**The lesson**: `data()` being a function isn't a stylistic preference — it's what guarantees every component instance gets a fresh, independent state object instead of sharing one by closure or module-level reference.

</details>

## Key Takeaways

- Vue 3's `Proxy`-based reactivity fixes Vue 2's `Object.defineProperty` limitations (new properties and array index/length changes are now reactive automatically).
- The Composition API (`ref`, `reactive`, `<script setup>`) is the recommended default for new code; the Options API (`data`, `methods`, `computed`) remains fully supported and common in real codebases.
- `npm create vue@latest` scaffolds a Vite-powered project with optional TypeScript, Router, Pinia, and testing.
- `.vue` Single-File Components bundle template, script, and scoped styles into one file.
- Vue DevTools (browser extension or `vite-plugin-vue-devtools`) is essential for inspecting component state, Pinia stores, and routes live.
- `data()` must always return a freshly created object, never a shared reference, or component instances will leak state into each other.
