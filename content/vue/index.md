---
title: Learn Vue.js — From Zero to Pro
description: A comprehensive, edge-case-covering Vue 3 curriculum. 24 chapters covering the Composition API, reactivity, components, Pinia, Vue Router, TypeScript, testing, SSR/Nuxt, and production engineering. Go from beginner to pro Vue developer.
---

# 💚 Learn Vue.js — From Zero to Pro

A comprehensive, edge-case-covering Vue 3 curriculum. Each document is self-contained and covers its concept deeply enough that a careful reader can go from beginner to pro Vue developer. The Composition API is treated as the primary style throughout, with the Options API explained alongside it — you'll meet both in real codebases.

## How to Use This Course

1. **Read sequentially** for a structured path (01 → 24).
2. **Jump to a chapter** as a reference when you hit a concept in the wild.
3. **Build the capstone project** in chapter 24 after every few chapters, adding features as you learn them.
4. **Keep the official docs and Vue DevTools open** alongside — reactivity is best understood by poking at it live.

## Prerequisites

- Solid HTML & CSS fundamentals.
- Comfortable JavaScript (ES2015+): `let`/`const`, arrow functions, destructuring, modules, promises/`async`-`await`.
- Node.js installed (LTS recommended).
- A code editor (VS Code + the **Vue - Official** extension recommended).

## Curriculum

### Part I — Foundations

| # | Topic | Why It Matters |
|---|---|---|
| 01 | [Introduction & Setup](/vue/01-introduction-and-setup) | Vue 2 vs Vue 3, `create-vue`/Vite scaffolding, project structure, Vue DevTools. |
| 02 | [Template Syntax & Directives](/vue/02-template-syntax-and-directives) | Interpolation, `v-bind`, `v-if`/`v-show`, `v-for` with `:key`, `v-on`, `v-model` basics. |
| 03 | [Reactivity Fundamentals](/vue/03-reactivity-fundamentals) | `ref` vs `reactive`, unwrapping rules, the destructuring trap, `toRef`/`toRefs`. |
| 04 | [Computed & Watchers](/vue/04-computed-and-watchers) | Computed caching, `watch` vs `watchEffect`, `deep`/`immediate`/`flush`. |
| 05 | [Components Basics](/vue/05-components-basics) | Defining components, typed/validated props, `emits`, SFC structure. |

### Part II — Component Composition

| # | Topic | Why It Matters |
|---|---|---|
| 06 | [Component Communication](/vue/06-component-communication) | Props down/events up, `v-model` on components, provide/inject, slots. |
| 07 | [Composition API In Depth](/vue/07-composition-api-in-depth) | `setup()`, `<script setup>`, composables, lifecycle hooks in Composition style. |
| 08 | [Lifecycle Hooks](/vue/08-lifecycle-hooks) | The full lifecycle, Options API equivalents, template refs. |
| 09 | [Forms & v-model](/vue/09-forms-and-v-model) | Modifiers (`.lazy`/`.number`/`.trim`), validation patterns, custom-input `v-model`, multiple `v-model`s. |

### Part III — State & Data

| # | Topic | Why It Matters |
|---|---|---|
| 10 | [State Management with Pinia](/vue/10-state-management-pinia) | Store setup, state/getters/actions, composing stores, persistence. |
| 11 | [Routing with Vue Router](/vue/11-routing-vue-router) | Route setup, dynamic/nested routes, guards, lazy loading, params/query. |
| 12 | [Fetching Data & Async](/vue/12-fetching-data-and-async) | Loading/error states, async `setup()` with Suspense, race-condition pitfalls. |

### Part IV — Advanced Component Patterns

| # | Topic | Why It Matters |
|---|---|---|
| 13 | [Slots & Scoped Slots](/vue/13-slots-and-scoped-slots) | Default/named/scoped slots, dynamic slot names, renderless components. |
| 14 | [Dynamic & Async Components](/vue/14-dynamic-and-async-components) | `<component :is>`, `defineAsyncComponent`, `keep-alive`, transitions. |
| 15 | [Custom Directives](/vue/15-custom-directives) | Directive hooks, `v-focus`, `v-click-outside`, and other practical directives. |
| 16 | [Teleport & Suspense](/vue/16-teleport-and-suspense) | Modals/tooltips via Teleport, async boundaries via Suspense, fallback states. |

### Part V — TypeScript & Tooling

| # | Topic | Why It Matters |
|---|---|---|
| 17 | [TypeScript with Vue](/vue/17-typescript-with-vue) | Typing `defineProps`/`defineEmits`, typed composables, generic components. |
| 18 | [Testing](/vue/18-testing) | Vitest + Vue Test Utils, mocking composables, testing Pinia stores. |
| 19 | [Performance Optimization](/vue/19-performance-optimization) | `v-once`/`v-memo`, `shallowRef`/`shallowReactive`, lazy loading, virtual scrolling. |
| 20 | [SSR & Nuxt Basics](/vue/20-ssr-and-nuxt-basics) | What SSR solves, hydration, a Nuxt primer, universal vs client-only code. |

### Part VI — Production Engineering

| # | Topic | Why It Matters |
|---|---|---|
| 21 | [Build Tooling & Vite](/vue/21-build-tooling-and-vite) | Vite config, env variables, code splitting, build optimization. |
| 22 | [Security](/vue/22-security) | XSS via `v-html`, CSP, sanitizing user content, dependency security. |
| 23 | [Design Patterns](/vue/23-design-patterns) | Composable best practices, container/presentational split, renderless components revisited. |
| 24 | [Exercises & Projects](/vue/24-exercises-and-projects) | Capstone project ideas, beginner to advanced. |

## Learning Path Suggestions

### If you're new to frontend development

1. Read 01–05 slowly — don't rush reactivity, it's the concept everything else builds on.
2. Build a tiny todo app after chapter 09, using only what you've learned so far.
3. Read 10–12, then add persistence and routing to your todo app.
4. Skim 13–16, then return to them once you hit a wall that needs a scoped slot or a Teleport.
5. Finish with 17–24 at a relaxed pace.

### If you're coming from React

Vue's reactivity model (chapter 03) replaces React's re-render-on-state-change model — there's no dependency array to forget, but there is a destructuring trap that plays a similar role to "stale closure" bugs. Read 03–04 closely. `v-model` (chapter 02, 09) and slots (chapter 13) do the job of controlled inputs and `children`/render props, respectively, with different ergonomics. Skim 01–02, focus on 03, 06, 07, 13, 16, then read the rest in order.

### If you're coming from Vue 2 / the Options API

Read 01 for the Vue 2 vs Vue 3 differences table, then jump straight to 03 and 07 — reactivity internals changed (`Object.defineProperty` → `Proxy`) and the Composition API is the new default organizing principle. Every chapter that introduces a concept shows the Options API equivalent alongside the Composition API version, so you can map what you already know. Pay close attention to chapter 08 (lifecycle hook renaming) and chapter 17 (TypeScript support is dramatically better in Vue 3).

### If you're building with Nuxt

This documentation site is itself built with Nuxt Content, so treat chapter 20 as required reading, not optional. Read 01–12 in order first — Nuxt is Vue underneath, and skipping the fundamentals to jump straight to Nuxt conventions leads to cargo-culting `useFetch` without understanding what problem it solves. Then read 20 closely, followed by 11 (Nuxt's file-based routing builds on Vue Router concepts) and 21 (Nuxt's build is Vite underneath).

## Companion Resources

- [Vue.js Official Docs](https://vuejs.org/) — the best-maintained framework docs on the web; has an interactive tutorial and playground.
- [Vue School](https://vueschool.io/) — structured video courses from core team members and community experts.
- [Pinia Docs](https://pinia.vuejs.org/) — official state management library docs.
- [Vue Router Docs](https://router.vuejs.org/) — official routing library docs.
- [Vite Docs](https://vitejs.dev/) — the build tool powering modern Vue projects.
- [Nuxt Docs](https://nuxt.com/) — the full-stack Vue framework referenced in chapter 20.
- [Vue Mastery](https://www.vuemastery.com/) — another strong video course platform.

## Tooling to Install

::code-wrapper{language="bash"}
```bash
node --version              # v18.18+ or v20+ recommended

npm create vue@latest       # official scaffolding tool (create-vue)
# ✔ Add TypeScript? › Yes
# ✔ Add Vue Router? › Yes
# ✔ Add Pinia? › Yes
# ✔ Add Vitest? › Yes

cd my-vue-app
npm install
npm run dev

# Vue DevTools — install the browser extension:
#   Chrome/Edge/Firefox: search "Vue.js devtools" in your browser's extension store
# Or use the standalone app (works with any browser, and with Vite via a plugin):
npm install -D vite-plugin-vue-devtools
```
::

## License

These notes are yours to use, share, and modify.

💚
