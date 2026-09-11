---
title: Vue 3 Engineering Reference — Routing with Vue Router
description: Route guards composition, lazy loading with code splitting, scroll behavior restoration, nested route params, beforeRouteUpdate vs watch $route, and type-safe route definitions.
---

# 11 — Routing with Vue Router

## Route Definition — Lazy Loading and Code Splitting

::code-wrapper{language="typescript" filename="router/index.ts"}
```typescript
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

// ── Dynamic import = code splitting ────────────────────
// Each route's component is a SEPARATE chunk, loaded on first navigation.
// Reduces initial bundle size — only the visited route's code downloads.

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    // Eager import: part of the main bundle (critical for above-the-fold)
    component: () => import('@/views/HomeView.vue'),
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    // ── Chunk name via magic comment (for bundle analysis) ──
    component: () => import(/* webpackChunkName: "dashboard" */ '@/views/DashboardView.vue'),
    // ── Meta: route-level metadata accessible in guards ──
    meta: { requiresAuth: true, title: 'Dashboard' },
    // ── Nested routes: render in <RouterView> inside the parent ──
    children: [
      {
        path: 'settings',  // matches /dashboard/settings (no leading slash)
        name: 'dashboard.settings',
        component: () => import('@/views/SettingsView.vue'),
      },
      {
        path: 'analytics',
        name: 'dashboard.analytics',
        component: () => import('@/views/AnalyticsView.vue'),
      },
    ],
  },
  {
    // ── Dynamic route params: /users/42 → params.id = "42" (string!) ──
    path: '/users/:id',
    name: 'user',
    component: () => import('@/views/UserView.vue'),
    // Props mode: pass route params as component props (decouples from $route)
    props: true,
  },
  {
    // ── Catch-all 404: must be LAST in the routes array ──
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
  },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  // ── scrollBehavior: control scroll on navigation ──
  scrollBehavior(to, from, savedPosition) {
    // savedPosition: browser back/forward → restore previous scroll
    if (savedPosition) return savedPosition
    // Hash anchor: scroll to the element
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    // Default: top of page
    return { top: 0, behavior: 'smooth' }
  },
})
```
::

## Navigation Guards — Composable Auth Pipeline

::code-wrapper{language="typescript" filename="router/guards.ts"}
```typescript
import { type Router } from 'vue-router'
import { useUserStore } from '@/stores/user'

// ── Global before guard: runs before EVERY navigation ──
// `to`: target route, `from`: current route, `next`: control function
// In Vue Router 4, return values replace next():
//   return false → cancel navigation
//   return '/path' → redirect
//   return { name: 'route' } → redirect by name
//   return undefined/true → proceed
export function setupGuards(router: Router) {
  router.beforeEach(async (to, from) => {
    const userStore = useUserStore()

    // ── Check meta.requiresAuth on the route or any parent ──
    // to.matched: array of matched route records (parent → child)
    // .some() checks if ANY matched route requires auth
    const requiresAuth = to.matched.some(r => r.meta.requiresAuth)

    if (requiresAuth && !userStore.isAuthenticated) {
      // ── Redirect to login, preserve the intended destination ──
      return {
        name: 'login',
        query: { redirect: to.fullPath },  // return to original page after login
      }
    }

    // ── If already authenticated and going to login, redirect to dashboard ──
    if (to.name === 'login' && userStore.isAuthenticated) {
      return { name: 'dashboard' }
    }

    // ── Set document title from route meta ──
    if (to.meta.title) {
      document.title = `${to.meta.title} — MyApp`
    }

    // No return → proceed with navigation
  })

  // ── Per-route guard: runs only for this specific route ──
  // More efficient than global guard for route-specific checks
  router.beforeResolve(async (to) => {
    // Runs after all beforeEach guards resolve, before component loading
    // Good for: fetching data that multiple components need
    if (to.meta.requiresFeature) {
      const featureStore = useFeatureStore()
      await featureStore.checkFeature(to.meta.requiresFeature as string)
      if (!featureStore.hasFeature) {
        return { name: 'upgrade' }
      }
    }
  })

  // ── afterEach: runs after navigation is confirmed ──
  // Cannot cancel navigation — use for analytics, logging
  router.afterEach((to, from, failure) => {
    if (!failure) {
      analytics.track('page_view', { path: to.fullPath })
    }
  })
}
```
::

## In-Component Guards — beforeRouteUpdate vs watch $route

::code-wrapper{language="vue" filename="UserView.vue"}
```vue
<script setup>
import { watch, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { ref } from 'vue'

const route = useRoute()   // current route (reactive)
const router = useRouter() // navigation methods
const user = ref(null)

async function fetchUser(id) {
  const res = await fetch(`/api/users/${id}`)
  user.value = await res.json()
}

// ── onBeforeRouteUpdate: fires when navigating between same-route params ──
// /users/1 → /users/2: same component, different param. Component is REUSED.
// This guard fires, giving you a chance to refetch data.
onBeforeRouteUpdate(async (to, from) => {
  // `to.params.id` is the NEW param; route.params is still the old one
  if (to.params.id !== from.params.id) {
    await fetchUser(to.params.id)
  }
  // return false to cancel the navigation
})

// ── Alternative: watch the route param reactively ──
watch(
  () => route.params.id,
  async (newId) => {
    if (newId) await fetchUser(newId)
  },
  { immediate: true }
)
// Both work — onBeforeRouteUpdate is more explicit and can cancel navigation.
</script>
```
::

## Programmatic Navigation

::code-wrapper{language="typescript" filename="navigation.ts"}
```typescript
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

// ── Push: add to history stack (back button returns) ──
router.push('/users/42')
router.push({ name: 'user', params: { id: '42' } })  // by name (preferred)
router.push({ path: '/search', query: { q: 'vue', page: '2' } })

// ── Replace: replace current entry (back button skips this page) ──
// Use after login: don't want back button to return to the login page
router.replace({ name: 'dashboard' })

// ── Query params: always strings — type coercion needed ──
const page = parseInt(route.query.page as string) || 1
const q = route.query.q as string

// ── Dynamic params: always strings — even if defined as /users/:id ──
const userId = route.params.id  // "42" (string), NOT 42 (number)

// ── Go: relative history movement ──
router.go(-1)  // back
router.go(1)   // forward
router.go(-2)  // back two pages

// ── Async navigation: returns a promise ──
await router.push('/dashboard')  // resolves after navigation completes
```
::

## Type-Safe Routes (Vue Router 4.x + TypeScript)

::code-wrapper{language="typescript" filename="typed-routes.ts"}
```typescript
import 'vue-router'

// ── Module augmentation: type-safe route names and params ──
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    title?: string
    roles?: string[]
  }

  // Type-safe route names: typo in router.push({ name: 'dasboard' }) → TS error
  interface RouteNamedMap {
    home: RouteRecordInfo<'home', '/', {}, {}>
    user: RouteRecordInfo<'user', '/users/:id', { id: string }, {}>
    dashboard: RouteRecordInfo<'dashboard', '/dashboard', {}, {}>
  }
}

// ── Now router.push is type-checked: ──
// router.push({ name: 'user', params: { id: '42' } })  ✅
// router.push({ name: 'user', params: { id: 42 } })      ❌ id must be string
// router.push({ name: 'dasboard' })                     ❌ typo caught

// ── route.meta is also typed: ──
// if (route.meta.requiresAuth) { ... }  ✅ boolean | undefined
// route.meta.unknownProp                        ❌ not in interface
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
// ── 1. useRoute() is reactive — route.params updates on navigation ──
// Don't destructure: const { id } = route.params → not reactive
// Use: route.params.id directly in template, or watch(() => route.params.id)

// ── 2. Lazy loading with loading state ──
const routes = [{
  path: '/admin',
  component: () => import('@/views/AdminView.vue'),
  // The promise resolves when the chunk loads; shows fallback until then
}]

// ── 3. Route-level data fetching with beforeEnter ──
{
  path: '/post/:id',
  component: PostView,
  beforeEnter: async (to) => {
    // Fetch data before component loads — available in route.meta
    const res = await fetch(`/api/posts/${to.params.id}`)
    to.meta.post = await res.json()
  }
}

// ── 4. Scroll position: savedPosition for back/forward, explicit for push ──
scrollBehavior(to, from, savedPosition) {
  return savedPosition ?? { top: 0 }
}

// ── 5. Route key: force re-creation on param change ──
// <RouterView :route-key="route.fullPath" /> → component re-mounts on every change
// Default: component is reused (only params change, hooks fire, not re-mount)
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. Dynamic params are ALWAYS strings ──
// path: '/users/:id' → route.params.id is "42" (string), not 42 (number)
// Even with .number in path: '/users/:id(\\d+)' → still string

// ── 2. Same-component navigation doesn't re-mount ──
// /users/1 → /users/2: same UserView component, only params change.
// onMounted does NOT fire again. Use onBeforeRouteUpdate or watch route.params.

// ── 3. Query params are not in route.matched ──
// meta is on route records; query is on the route object itself.
// to.matched.some(r => r.meta.x) checks route records, not query params.

// ── 4. Hash mode vs history mode — URL format differs ──
// History: example.com/users/42 → clean URL, needs server config (fallback to index.html)
// Hash: example.com/#/users/42 → no server config, but URLs have #, worse SEO

// ── 5. beforeEach guard order: global → parent → child ──
// Multiple guards fire in order: global beforeEach, per-route beforeEnter,
// in-component beforeRouteEnter. If any returns false, later ones don't run.

// ── 6. Navigation cancellation is silent ──
// If a guard returns false, router.push() resolves (not rejects).
// Check the return: const failure = await router.push('/x'); if (failure) { ... }
```
::

## 🧠 Spot the Bug

Navigating from `/users/1` to `/users/2` doesn't refresh the displayed user data.

::code-wrapper{language="vue" filename="RouteBug.vue"}
```vue
<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const user = ref(null)

// onMounted fires only ONCE — component is reused for /users/2
onMounted(async () => {
  const res = await fetch(`/api/users/${route.params.id}`)
  user.value = await res.json()
})
</script>

<template>
  <div>{{ user?.name }}</div>
</template>
```
::

<details>
<summary>Answer</summary>

When navigating between `/users/1` and `/users/2`, Vue Router reuses the same `UserView` component instance (only the `params` change). `onMounted` fires only on the initial mount — it does not fire again on param-only changes.

**Fix** — use `onBeforeRouteUpdate` or `watch` the route param:

::code-wrapper{language="vue" filename="RouteFixed.vue"}
```vue
<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const user = ref(null)

async function fetchUser(id) {
  const res = await fetch(`/api/users/${id}`)
  user.value = await res.json()
}

// Watch fires whenever route.params.id changes (including initial load with immediate)
watch(() => route.params.id, (id) => {
  if (id) fetchUser(id)
}, { immediate: true })
</script>
```
::

**The lesson**: same-route navigation (only params change) reuses the component instance — lifecycle hooks don't re-fire. Use `watch` on `route.params` or `onBeforeRouteUpdate` to react to param changes.

</details>