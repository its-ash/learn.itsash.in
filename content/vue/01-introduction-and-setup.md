---
title: Vue 3 Engineering Reference — Introduction & Setup
description: Production-grade Vue 3 setup reference — Proxy reactivity internals, createApp isolation, SFC compilation pipeline, multi-instance mounting, DevTools integration, and edge cases that bite in real codebases.
---

# 01 — Introduction & Setup

## Vue 3 Reactivity Engine — How It Actually Works

Vue 3 replaces Vue 2's `Object.defineProperty` getter/setter approach with ES6 `Proxy`. This isn't a detail — it's the root cause of every behavioral difference between Vue 2 and Vue 3.

::code-wrapper{language="javascript" filename="reactivity-internals.js"}
```javascript
// ── Vue 2: Object.defineProperty ──────────────────────────
// Walks every property ONCE at init, installs getter/setter per key.
// Blind spots:
//   - obj.newProp = val  → NOT reactive (setter never installed)
//   - arr[5] = val       → NOT reactive (index setter never installed)
//   - arr.length = 0     → NOT reactive
// Workaround: Vue.set(obj, 'newProp', val) — manually triggers reactivity.

// ── Vue 3: Proxy ─────────────────────────────────────────
// Intercepts ALL operations on the object — no property walk, no blind spots.
const handler = {
  get(target, key, receiver) {
    track(target, key)           // register this effect as a dependency
    return Reflect.get(target, key, receiver)
  },
  set(target, key, value, receiver) {
    const result = Reflect.set(target, key, value, receiver)
    trigger(target, key)         // notify all registered effects
    return result
  },
  deleteProperty(target, key) {
    const result = Reflect.deleteProperty(target, key)
    trigger(target, key)         // deletion is reactive in Vue 3
    return result
  }
}

const reactiveObj = new Proxy({ count: 0, items: [] }, handler)

reactiveObj.newProp = 'hello'     // ✅ reactive — Proxy intercepts the set
reactiveObj.items.push(42)        // ✅ reactive — array methods go through Proxy
reactiveObj.items[10] = 'x'       // ✅ reactive — index assignment works
delete reactiveObj.count          // ✅ reactive — deletion triggers effects
```
::

## Production App Bootstrap — Multi-Instance with Plugin Isolation

::code-wrapper{language="typescript" filename="src/main.ts"}
```typescript
import { createApp, type App, type Directive } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory, type Router } from 'vue-router'
import AppRoot from './App.vue'
import { authDirective } from './directives/auth'
import { errorHandler } from './utils/errorBoundary'

// ── Factory: each call returns an isolated app instance ──
// Vue 3's createApp() replaces the global Vue singleton.
// Multiple apps on one page get independent plugins, directives, and config —
// no global mutation leaks between instances.
export function createApplication(el: string = '#app'): App {
  const app: App = createApp(AppRoot)

  // ── Global error handler: catches errors from render, watchers, lifecycle ──
  // (err, instance, info) — `info` is a lifecycle hook name like "render"
  app.config.errorHandler = (err, instance, info) => {
    errorHandler.capture(err, { component: instance?.$options?.name, info })
  }

  // ── Performance marks in dev — visible in Chrome Performance tab ──
  app.config.performance = import.meta.env.DEV

  // ── Custom directive registered globally before mount ──
  // Available to ALL components without per-file import.
  app.directive('auth', authDirective as Directive)

  // ── Plugins are app-scoped, not global ──
  const pinia = createPinia()
  const router: Router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [], // routes injected via composable in production
    scrollBehavior(to, from, savedPosition) {
      return savedPosition ?? (to.hash ? { el: to.hash } : { top: 0 })
    },
  })

  app.use(pinia)
  app.use(router)

  // ── Provide app-level values, injectable via inject() in any descendant ──
  app.provide('apiBase', import.meta.env.VITE_API_BASE ?? '/api')

  app.mount(el)
  return app
}

// ── Multi-mount: run two independent Vue apps on one page ──
const headerApp = createApplication('#header-app')
const mainApp = createApplication('#main-app')
// headerApp and mainApp share NO state, NO plugins, NO config.
```
::

### Anti-Pattern: Mutating Global Config After Mount

::code-wrapper{language="typescript" filename="anti-pattern.ts"}
```typescript
// ❌ WRONG — config changes after mount are silently ignored by already-created instances
const app = createApp(App)
app.mount('#app')
app.config.globalProperties.$api = myApiClient  // too late — existing components already initialized

// ── The trap: ────────────────────────────────────────────
// app.config is read during component setup. Mutating it post-mount
// affects only FUTURELY created component instances, not current ones.
// In production this causes "works on navigation, broken on first load" bugs.

// ✅ CORRECT — configure everything BEFORE mount
const app = createApp(App)
app.config.globalProperties.$api = myApiClient  // registered first
app.use(createPinia())
app.mount('#app')                                // mount last
```
::

## SFC Compilation Pipeline — What Vite Actually Produces

::code-wrapper{language="vue" filename="src/components/Greeting.vue"}
```vue
<script setup lang="ts">
// ── <script setup> compiles to a render function + setup() at build time ──
// No runtime template parsing — the template below becomes a compiled render fn.
import { ref, computed } from 'vue'

const props = defineProps<{
  name: string
  enthusiasm?: number  // optional, defaults via withDefaults
}>()

// withDefaults provides compile-time defaults for optional props
const { enthusiasm = 1 } = withDefaults(props, { enthusiasm: 1 })

// ref(0) → { value: 0 } with reactive get/set traps
const counter = ref(0)

// computed() — lazy + cached: only re-evaluates when `counter.value` changes
const exclaim = computed(() => '!'.repeat(enthusiasm + counter.value))

// Top-level bindings in <script setup> are automatically exposed to template
// — no `return { counter, exclaim }` needed (unlike setup() function form)
</script>

<template>
  <!-- Compiler transforms this into h('h1', { class: 'greeting' }, ...) -->
  <h1 class="greeting" @click="counter++">
    Hello, {{ name }}{{ exclaim }}
  </h1>
</template>

<style scoped>
/* Scoped CSS: compiler injects data-v-<hash> attribute on all elements,
   rewrites selectors to .greeting[data-v-<hash>] at build time.
   No runtime CSS-in-JS cost. */
.greeting {
  color: #42b883;
}
</style>
```
::

## No-Build-Step — Progressive Enhancement with CDN

::code-wrapper{language="html" filename="index.html"}
```html
<!DOCTYPE html>
<html>
<body>
  <!-- Mount point — Vue replaces #app's children, not #app itself -->
  <div id="app">
    <!-- Pre-render content visible before JS loads (SEO, perceived perf) -->
    <p>Loading…</p>
  </div>

  <!-- vue.global.js: development build with full reactivity + warnings -->
  <!-- Use vue.global.prod.js in production — strips warnings, ~30KB smaller -->
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <script>
    const { createApp, ref, computed, onMounted } = Vue

    createApp({
      setup() {
        const count = ref(0)
        // computed in CDN mode works identically to bundler mode
        const doubled = computed(() => count.value * 2)

        onMounted(() => {
          // Runs after DOM insertion — safe to query #app children here
          console.log('Mounted, count node in DOM')
        })

        // setup() MUST return everything the template references
        // (<script setup> does this automatically; raw setup() does not)
        return { count, doubled }
      }
    }).mount('#app')
  </script>
</body>
</html>
```
::

### Edge Case: CDN vs Bundler Import Style

::code-wrapper{language="javascript" filename="import-mismatch.js"}
```javascript
// ❌ CDN-style code pasted into a bundler project
const { ref } = Vue          // ReferenceError: Vue is not defined
const count = Vue.ref(0)     // same error

// ✅ Bundler projects use ES module named imports
import { ref } from 'vue'    // works in .js/.ts/.vue files with a build step
const count = ref(0)

// ── The trap: ────────────────────────────────────────────
// CDN global build attaches everything to window.Vue.
// npm package has NO global — it's pure ES modules.
// Copy-pasting tutorials between the two environments is a day-one bug.
```
::

## Production Project Structure

::code-wrapper{language="bash"}
```bash
my-vue-app/
├── index.html              # Vite entry HTML — <script type="module" src="/src/main.ts">
├── vite.config.ts          # Vite + plugin config (vue, devtools, auto-import)
├── tsconfig.json
├── public/                 # Copied verbatim to dist/ — favicon, robots.txt, CNAME
├── src/
│   ├── main.ts             # createApp().mount() — single entry point
│   ├── App.vue             # Root component — <RouterView /> shell
│   ├── router/
│   │   └── index.ts        # createRouter({ history, routes, scrollBehavior })
│   ├── stores/             # Pinia stores — one file per domain (useUserStore, useCartStore)
│   ├── composables/        # Reusable logic — useFetch(), useBreakpoint(), useTheme()
│   ├── components/         # Presentational + container components
│   ├── views/              # Route-level components (mapped 1:1 to routes)
│   ├── directives/         # Custom directives — v-auth, v-tooltip, v-lazy
│   ├── plugins/            # App-level plugins — api client, feature flags, analytics
│   ├── types/              # Shared TypeScript types — API contracts, domain models
│   └── assets/             # Processed by Vite — images, global .css, fonts
└── vitest.config.ts        # Unit test config — jsdom env, coverage thresholds
```
::

## DevTools Integration — Programmatic Inspection

::code-wrapper{language="typescript" filename="vite.config.ts"}
```typescript
import { defineConfig } from 'vite'
import vue from '@vjsx/plugin-vue'  // SFC compiler plugin
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'  // auto-import ref/computed/etc
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),                                           // compile .vue → JS
    vueDevTools(),                                    // in-browser DevTools overlay
    AutoImport({                                      // no manual `import { ref } from 'vue'`
      imports: ['vue', 'vue-router', 'pinia'],         // auto-imports for all three
      dts: 'src/types/auto-imports.d.ts',              // TS declaration file for intellisense
    }),
  ],
  resolve: {
    alias: {
      // @ → /src — enables `import Foo from '@/components/Foo.vue'`
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'esnext',                                 // modern browsers only — smaller output
    sourcemap: true,                                  // production sourcemaps for error tracking
    rollupOptions: {
      output: {
        // Manual chunk splitting prevents one mega-vendor bundle
        manualChunks: {
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          'vendor-ui': ['@vueuse/core'],
        },
      },
    },
  },
})
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
// ── 1. Non-interactive project scaffolding (CI / scripting) ──
// `npm create vue@latest my-app -- --ts --router --pinia --vitest`
// Flags bypass interactive prompts — usable in Dockerfiles and CI pipelines.

// ── 2. app.config.performance — dev-only Vue timing marks ──
// Set BEFORE mount. Adds performance.measure marks for:
//   "init" (component setup), "compile" (template), "render", "patch"
// View in Chrome DevTools → Performance → Recorded timeline.
app.config.performance = import.meta.env.DEV

// ── 3. Global properties — quick but dangerous ──
// Makes `this.$formatDate` available in every Options API component.
// ⚠️ Hides dependencies — untestable, no tree-shaking, no TS inference.
// Production code: use composables (useDateFormat) instead.
app.config.globalProperties.$formatDate = (d: Date) => d.toISOString()

// ── 4. Multiple v-app mounts on one page ──
// Useful for progressively migrating a legacy server-rendered page:
// mount a Vue widget in #sidebar, another in #header, keep #content as raw HTML.
const sidebarApp = createApp(SidebarWidget).mount('#sidebar')
const headerApp   = createApp(HeaderWidget).mount('#header')
// Each app has its OWN Pinia, Router, provide/inject scope — fully isolated.

// ── 5. SFC Playground URL sharing ──
// https://play.vuejs.org/ compiles & runs a component client-side.
// Append #e<base64-encoded-component> to share via URL — no repo needed.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
import { reactive, ref, watchEffect, toRaw } from 'vue'

// ── 1. toRaw() — escape hatch to the underlying, non-reactive object ──
const state = reactive({ count: 0 })
const raw = toRaw(state)
raw.count = 99              // mutates storage but does NOT trigger effects
console.log(state.count)    // 99 — same object, just bypassed the Proxy
// Use when passing reactive state to external libraries that don't need tracking
// (e.g., Chart.js, WebGL) — avoids unnecessary re-render triggers.

// ── 2. Fragments — multiple root nodes break $attrs fallthrough ──
// Vue 2: exactly one root element required → forced <div> wrappers everywhere.
// Vue 3: fragments allowed → <template><header/><main/><footer/></template> is valid.
// ⚠️ With multiple roots, Vue cannot auto-determine where $attrs should go.
// You must explicitly bind: <main v-bind="$attrs"> or they silently disappear.

// ── 3. data() must return a FRESH object — shared references leak state ──
// ❌ WRONG — module-scope object shared across ALL component instances:
const shared = { expanded: false }
export default {
  data() { return shared }  // every instance gets the SAME object reference
}
// Click "expand" on card A → card B also expands. Classic bug.

// ✅ CORRECT — new object per instance:
export default {
  data() { return { expanded: false } }  // fresh object every data() call
}

// ── 4. Vue 3 drops IE11 — Proxy is unponyfillable in IE ──
// If IE11 is a hard requirement: stay on Vue 2 (EOL, no security patches).
// This is a real constraint for banking/government clients, not academic.

// ── 5. Reactive collections: Map vs plain object ──
// reactive({}) keys must be strings or symbols.
// reactive(new Map()) supports ANY key type (objects, functions, numbers).
// For dynamic-keyed caches, always use Map — plain objects coerce keys to strings.
const cache = reactive(new Map())
cache.set(document.body, 'mounted')  // ✅ DOM node as key — works
const objCache = reactive({})
objCache[document.body] = 'mounted'  // coerced to "[object HTMLBodyElement]"
```
::

## 🧠 Spot the Bug

A developer reports: "Every card on the page expands when I click one."

::code-wrapper{language="vue" filename="Card.vue"}
```vue
<script>
const sharedState = { expanded: false }  // module scope — ONE object for all imports

export default {
  data() {
    return sharedState  // returns the same reference for every instance
  },
  methods: {
    toggle() { this.expanded = !this.expanded }
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

`sharedState` lives at module scope — there is exactly one object in memory. Every `Card` instance's `data()` returns a reference to that same object. Mutating `this.expanded` in one instance mutates the shared object all others read from.

**Fix** — construct the object *inside* `data()` so each instance gets its own:

::code-wrapper{language="vue" filename="Card.vue"}
```vue
<script>
export default {
  data() {
    return { expanded: false }  // fresh object per instance — no shared reference
  },
  methods: {
    toggle() { this.expanded = !this.expanded }
  }
}
</script>

<template>
  <div @click="toggle">{{ expanded ? 'Expanded' : 'Collapsed' }}</div>
</template>
```
::

**The lesson**: `data()` being a function isn't stylistic — it guarantees per-instance state isolation. The object it returns must also be created fresh inside the function, never hoisted to module scope.

</details>