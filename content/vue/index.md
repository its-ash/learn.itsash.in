---
title: Learn Vue.js — Engineering Reference
description: A production-grade Vue 3 reference for mid-to-senior developers. 24 chapters covering reactivity internals, component patterns, Pinia, Vue Router, TypeScript, testing, SSR/Nuxt, performance, security, and design patterns — taught through real-world code, edge cases, and anti-patterns.
---

# 💚 Learn Vue.js — Engineering Reference

A production-grade Vue 3 curriculum built for mid-level developers moving to senior roles. Every chapter is code-first: dense, annotated examples covering complex implementations, anti-patterns, edge cases, and production tips. No tutorial fluff — just the patterns, traps, and internals that real codebases depend on.

## How to Use This Reference

1. **Jump to a chapter** as a reference when you hit a concept in production code.
2. **Read the anti-pattern sections** before refactoring — see the wrong way, then the right way.
3. **Solve the Spot the Bug challenges** at the end of each chapter to test your understanding.
4. **Build the capstone projects** in chapter 24 to apply the patterns in a real app.

## Prerequisites

- Solid JavaScript (ES2015+): closures, destructuring, modules, promises, Proxy.
- HTML & CSS fundamentals.
- TypeScript basics (generics, interfaces, union types) — chapters use `<script setup lang="ts">`.
- Node.js LTS installed.
- VS Code + the **Vue - Official** (Volar) extension.

## Curriculum

### Part I — Foundations & Reactivity

| # | Topic | Why It Matters |
|---|---|---|
| 01 | [Introduction & Setup](/vue/01-introduction-and-setup) | Proxy reactivity internals, `createApp` isolation, SFC compilation pipeline, multi-instance mounting. |
| 02 | [Template Syntax & Directives](/vue/02-template-syntax-and-directives) | Compiler patch flags, keyed vnode diffing, modifier chains, v-model expansion, v-if/v-for precedence. |
| 03 | [Reactivity Fundamentals](/vue/03-reactivity-fundamentals) | Track/trigger dependency graph, ref vs reactive, destructuring trap, `toRef`/`toRefs`, `shallowRef`, `customRef`. |
| 04 | [Computed & Watchers](/vue/04-computed-and-watchers) | Computed dirty flag caching, watch vs watchEffect, flush timing, deep watch cost, race condition cleanup. |
| 05 | [Components Basics](/vue/05-components-basics) | `defineProps`/`defineEmits`/`defineExpose` macros, prop validation, attr fallthrough, async components, `defineModel`. |

### Part II — Component Architecture

| # | Topic | Why It Matters |
|---|---|---|
| 06 | [Component Communication](/vue/06-component-communication) | Props down/events up contract, `provide`/`inject` with typed `InjectionKey`, `$attrs` forwarding, multi-v-model. |
| 07 | [Composition API In Depth](/vue/07-composition-api-in-depth) | `setup()` vs `<script setup>`, composable patterns, module-scoped singletons, `effectScope` cleanup, async setup. |
| 08 | [Lifecycle Hooks](/vue/08-lifecycle-hooks) | Full lifecycle sequence, `onMounted` DOM init, `onUnmounted` cleanup, KeepAlive activation, `onErrorCaptured` boundaries. |
| 09 | [Forms & v-model](/vue/09-forms-and-v-model) | Modifier internals, `.lazy`/`.number`/`.trim` edge cases, schema validation, custom inputs, debounced search. |

### Part III — State, Data & Routing

| # | Topic | Why It Matters |
|---|---|---|
| 10 | [State Management with Pinia](/vue/10-state-management-pinia) | Setup vs options store, `$patch` batch mutations, cross-store deps, persistence plugin, SSR hydration. |
| 11 | [Routing with Vue Router](/vue/11-routing-vue-router) | Lazy loading + code splitting, guard composition, scroll restoration, `beforeRouteUpdate`, typed routes. |
| 12 | [Fetching Data & Async](/vue/12-fetching-data-and-async) | AbortController race prevention, request deduplication, SWR pattern, pagination, optimistic updates, Suspense. |
| 13 | [Slots & Scoped Slots](/vue/13-slots-and-scoped-slots) | Default/named slots, scoped slot data passing, renderless components, slot compilation, conditional slots. |

### Part IV — Advanced Patterns

| # | Topic | Why It Matters |
|---|---|---|
| 14 | [Dynamic & Async Components](/vue/14-dynamic-and-async-components) | `component :is`, `defineAsyncComponent` states, KeepAlive LRU caching, `shallowRef` for component refs, Suspense. |
| 15 | [Custom Directives](/vue/15-custom-directives) | Hook lifecycle (created→unmounted), directive binding shape, `v-lazy` with IntersectionObserver, `v-copy` clipboard. |
| 16 | [Teleport & Suspense](/vue/16-teleport-and-suspense) | Teleport stacking context escape, `disabled` prop, nested Suspense boundaries, async error handling, SSR-safe teleport. |
| 17 | [TypeScript with Vue](/vue/17-typescript-with-vue) | `defineProps` generics, `defineEmits` signatures, `InjectionKey` typing, generic composables, template type narrowing. |

### Part V — Production Engineering

| # | Topic | Why It Matters |
|---|---|---|
| 18 | [Testing](/vue/18-testing) | Vue Test Utils mounting, `effectScope` for composable tests, Pinia store mocking, async test patterns, `flushPromises`. |
| 19 | [Performance Optimization](/vue/19-performance-optimization) | Patch flag compiler hints, `v-memo` for large lists, `shallowRef` for big data, `v-once`, manual chunk splitting. |
| 20 | [SSR & Nuxt Basics](/vue/20-ssr-and-nuxt-basics) | Hydration lifecycle, `onServerPrefetch`, state serialization, hydration mismatch causes, Nuxt `useFetch`, SSR-safe composables. |
| 21 | [Build Tooling & Vite](/vue/21-build-tooling-and-vite) | HMR internals, plugin pipeline, env variables, CSS scoped/modules/preprocessors, production build optimization. |
| 22 | [Security](/vue/22-security) | XSS auto-escaping vs `v-html`, DOMPurify sanitization, CSP configuration, credential handling, content security. |
| 23 | [Design Patterns](/vue/23-design-patterns) | Store pattern, renderless components, composable composition, provider/consumer DI, observer event bus, feature modules. |
| 24 | [Exercises & Projects](/vue/24-exercises-and-projects) | Capstone projects: Kanban board, real-time WebSocket chat, SSR Nuxt blog, generic TypeScript component library. |