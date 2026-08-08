# 11 — Routing with Vue Router

## Setting Up the Router

::code-wrapper{language="bash"}
```bash
npm install vue-router
```
::

::code-wrapper{language="javascript" filename="router/index.js"}
```javascript
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import AboutView from '@/views/AboutView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/about', name: 'about', component: AboutView }
  ]
})

export default router
```
::

::code-wrapper{language="javascript" filename="main.js"}
```javascript
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

createApp(App).use(router).mount('#app')
```
::

::code-wrapper{language="vue" filename="App.vue"}
```vue
<template>
  <nav>
    <RouterLink to="/">Home</RouterLink>
    <RouterLink to="/about">About</RouterLink>
  </nav>
  <RouterView />
</template>
```
::

`createWebHistory` uses the real browser History API (clean URLs, requires server-side fallback routing to `index.html`). `createWebHashHistory` uses a `#`-based URL instead, which needs no server configuration but produces uglier URLs — appropriate for static hosting with no rewrite rules.

## Dynamic Route Params

::code-wrapper{language="javascript" filename="router/index.js"}
```javascript
import UserProfile from '@/views/UserProfile.vue'

const routes = [
  { path: '/users/:id', name: 'user-profile', component: UserProfile }
]
```
::

::code-wrapper{language="vue" filename="UserProfile.vue"}
```vue
<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

// route.params.id is ALWAYS a string, even for numeric-looking IDs —
// exactly the same "everything from the DOM/URL is a string" rule as
// form inputs in chapter 09
const userId = computed(() => Number(route.params.id))
</script>

<template>
  <p>Viewing user #{{ userId }}</p>
</template>
```
::

### Reacting to param changes on the same route

Navigating from `/users/1` to `/users/2` reuses the same component instance — Vue Router doesn't unmount/remount just because the param changed, so `onMounted`-based data fetching silently fails to re-run:

::code-wrapper{language="vue" filename="UserProfile.vue"}
```vue
<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const user = ref(null)

async function loadUser(id) {
  const res = await fetch(`/api/users/${id}`)
  user.value = await res.json()
}

// immediate: true covers the initial navigation too, so there's no
// need for a separate onMounted call alongside this watcher
watch(() => route.params.id, (id) => loadUser(id), { immediate: true })
</script>
```
::

## Query Strings

::code-wrapper{language="vue" filename="SearchResults.vue"}
```vue
<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// /search?q=vue&page=2 → route.query = { q: 'vue', page: '2' }
const searchTerm = computed(() => route.query.q ?? '')
const page = computed(() => Number(route.query.page ?? 1))

function goToPage(n) {
  router.push({ query: { ...route.query, page: n } })
}
</script>

<template>
  <p>Results for "{{ searchTerm }}" — page {{ page }}</p>
  <button @click="goToPage(page + 1)">Next page</button>
</template>
```
::

`router.push({ query: {...} })` merges into the current path automatically; forgetting `...route.query` when updating one query param silently drops every other existing param, since the object you pass fully replaces the query string rather than patching it.

## Nested Routes

::code-wrapper{language="javascript" filename="router/index.js"}
```javascript
const routes = [
  {
    path: '/settings',
    component: SettingsLayout,
    children: [
      { path: '', name: 'settings-general', component: SettingsGeneral },
      { path: 'security', name: 'settings-security', component: SettingsSecurity },
      { path: 'billing', name: 'settings-billing', component: SettingsBilling }
    ]
  }
]
```
::

::code-wrapper{language="vue" filename="SettingsLayout.vue"}
```vue
<template>
  <div class="settings-layout">
    <aside>
      <RouterLink to="/settings">General</RouterLink>
      <RouterLink to="/settings/security">Security</RouterLink>
      <RouterLink to="/settings/billing">Billing</RouterLink>
    </aside>
    <!-- child routes render into THIS nested RouterView, not the top-level one -->
    <RouterView />
  </div>
</template>
```
::

An empty child `path: ''` matches the parent path exactly (`/settings`), making it the default view shown when no more specific child segment is given — a common pattern for tabbed layouts.

## Navigation Guards

### Global guards

::code-wrapper{language="javascript" filename="router/index.js"}
```javascript
import { useAuthStore } from '@/stores/auth'

router.beforeEach((to, from) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  // returning nothing (undefined) or true allows the navigation
})

router.afterEach((to) => {
  document.title = to.meta.title ?? 'My App'
})
```
::

::code-wrapper{language="javascript" filename="router/index.js"}
```javascript
const routes = [
  { path: '/dashboard', component: Dashboard, meta: { requiresAuth: true, title: 'Dashboard' } }
]
```
::

### Per-route and in-component guards

::code-wrapper{language="javascript"}
```javascript
const routes = [
  {
    path: '/admin',
    component: AdminPanel,
    beforeEnter: (to, from) => {
      const authStore = useAuthStore()
      if (!authStore.isAdmin) return false   // false cancels the navigation outright
    }
  }
]
```
::

::code-wrapper{language="vue" filename="EditForm.vue"}
```vue
<script setup>
import { ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

const isDirty = ref(false)

onBeforeRouteLeave((to, from) => {
  if (isDirty.value && !window.confirm('Discard unsaved changes?')) {
    return false
  }
})
</script>
```
::

Guard return value conventions: `undefined`/`true` proceeds, `false` cancels and stays put, a route location object (or string path) redirects there instead — throwing inside a guard is treated as navigation failure and surfaces through `router.onError`.

## Lazy-Loaded Routes

::code-wrapper{language="javascript" filename="router/index.js"}
```javascript
const routes = [
  {
    path: '/reports',
    // dynamic import — this component's code (and its dependencies) ship
    // in a separate chunk, downloaded only when this route is visited
    component: () => import('@/views/ReportsView.vue')
  }
]
```
::

This is the single most impactful routing-level performance technique in a real app — without it, every route's component code ships in the initial bundle regardless of whether the user ever visits that route. Chapter 21 covers the Vite chunking mechanics that make this work.

## Programmatic Navigation

::code-wrapper{language="javascript"}
```javascript
import { useRouter } from 'vue-router'

const router = useRouter()

router.push('/about')                          // adds a new history entry
router.push({ name: 'user-profile', params: { id: 42 } })
router.replace('/login')                       // replaces current entry, no back-button trap
router.back()
router.go(-2)
```
::

## Route Meta Fields for Layouts and Breadcrumbs

::code-wrapper{language="javascript" filename="router/index.js"}
```javascript
const routes = [
  { path: '/', component: HomeView, meta: { layout: 'default' } },
  { path: '/login', component: LoginView, meta: { layout: 'blank' } }
]
```
::

::code-wrapper{language="vue" filename="App.vue"}
```vue
<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import DefaultLayout from '@/layouts/DefaultLayout.vue'
import BlankLayout from '@/layouts/BlankLayout.vue'

const route = useRoute()
const layout = computed(() => (route.meta.layout === 'blank' ? BlankLayout : DefaultLayout))
</script>

<template>
  <component :is="layout">
    <RouterView />
  </component>
</template>
```
::

## Options API Equivalent

::code-wrapper{language="vue"}
```vue
<script>
export default {
  computed: {
    userId() {
      return Number(this.$route.params.id)
    }
  },
  watch: {
    '$route.params.id': {
      handler(id) {
        this.loadUser(id)
      },
      immediate: true
    }
  },
  methods: {
    async loadUser(id) {
      const res = await fetch(`/api/users/${id}`)
      this.user = await res.json()
    },
    goToSettings() {
      this.$router.push({ name: 'settings-general' })
    }
  }
}
</script>
```
::

## 💡 Tips & Tricks

- **Idiom** — Name every route (`name: 'user-profile'`) and navigate by name (`router.push({ name: 'user-profile', params: { id } })`) rather than by hard-coded path strings — renaming a URL path later becomes a one-line change in the route table instead of a find-and-replace across the whole codebase.
- **Performance** — Lazy-load every route component by default (`() => import(...)`) except perhaps the home page — there's essentially no downside for a multi-page app, and the initial bundle size difference compounds quickly as an app grows.
- **Debug** — `router.isReady()` returns a promise that resolves once the initial navigation completes — useful when code outside a component (like an app-level analytics initializer) needs to know the router has finished resolving the current URL before reading `router.currentRoute`.
- **Idiom** — Keep auth/permission checks in a single global `beforeEach` guard rather than scattering `beforeEnter` checks across many route definitions — one central place to audit "what's protected" is much easier to reason about and test than logic spread across a dozen files.
- **Debug** — `to.matched` is an array of every matched route record, from the outermost parent down to the leaf — inspect it when debugging why a `meta` field isn't showing up as expected on a nested child route (meta fields don't automatically merge from parent to child; check which record actually declared the field you're reading).

## ⚠️ Edge Cases & Gotchas

- **Route params are always strings, exactly like DOM input values** — `route.params.id` for `/users/42` is the string `"42"`, not the number `42` — comparing it with `===` against a number, or using it in arithmetic, hits the exact same string-vs-number trap as an un-modified `v-model` from chapter 09.
- **Navigating between two routes matching the same component doesn't remount it** — Vue Router reuses the component instance across `/users/1` → `/users/2` since both match the same route record; `onMounted`-based fetching only fires once and silently goes stale — watch the relevant route param instead, with `{ immediate: true }` to also cover the first load.
- **Forgetting to spread the existing query object when updating one query param wipes the rest** — `router.push({ query: { page: 2 } })` replaces the entire query string; if `?q=vue&page=1` was current, the `q` param is silently gone unless you write `{ query: { ...route.query, page: 2 } }`.
- **`beforeEach` guards run on every single navigation, including the very first page load** — Code assuming a guard only fires on subsequent client-side navigations (never on initial load) will be surprised the first time a user lands directly on a deep link and the guard redirects them unexpectedly, particularly for auth checks that assume some prior state has already been set up.
- **A `beforeEnter` guard or `beforeEach` that returns nothing from an `async` function without an explicit `return` still resolves to `undefined`, which allows navigation** — An `async` guard that performs a check but forgets the `return false`/`return { name: ... }` on a particular code path lets navigation through unconditionally, because a promise resolving to `undefined` is treated identically to a synchronous guard returning nothing.

## 🧠 Spot the Bug

A "Next User" button on a profile page should load the next user's data on click, but clicking it repeatedly shows the previous user's data one click "behind."

::code-wrapper{language="vue" filename="UserProfile.vue"}
```vue
<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const user = ref(null)

async function loadUser() {
  const res = await fetch(`/api/users/${route.params.id}`)
  user.value = await res.json()
}

loadUser()

function goToNext() {
  router.push({ name: 'user-profile', params: { id: Number(route.params.id) + 1 } })
  loadUser()
}
</script>
```
::

<details>
<summary>Answer</summary>

`loadUser()` is called directly inside `goToNext`, immediately after `router.push(...)`. But `router.push` is asynchronous — it returns a promise that resolves once the navigation completes, and `route.params.id` inside the reactive `route` object doesn't update synchronously the instant `push` is called. So `loadUser()` reads the *old* `route.params.id` before the navigation has actually applied the new param, fetching the previous user instead of the next one — the classic "read reactive state immediately after triggering an async update" trap, the routing-flavored cousin of the `nextTick` issue from chapter 08.

::code-wrapper{language="vue" filename="UserProfile.vue"}
```vue
<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const user = ref(null)

async function loadUser(id) {
  const res = await fetch(`/api/users/${id}`)
  user.value = await res.json()
}

watch(() => route.params.id, (id) => loadUser(id), { immediate: true })

function goToNext() {
  router.push({ name: 'user-profile', params: { id: Number(route.params.id) + 1 } })
}
</script>
```
::

**The lesson**: never assume `router.push` has applied its target route synchronously — either `await` it before reading `route.params` again, or (preferably) drive data fetching from a `watch` on the param itself so it reacts correctly no matter what triggered the navigation.

</details>

## Key Takeaways

- `createWebHistory` gives clean URLs but needs server-side fallback to `index.html`; `createWebHashHistory` needs no server config but produces `#`-based URLs.
- Route params and query values are always strings — cast them explicitly (`Number(...)`) before using them as numbers.
- Navigating between routes that share a component reuses the instance — drive re-fetching from a `watch` on the relevant param, not from `onMounted`.
- Navigation guards (`beforeEach`, `beforeEnter`, `onBeforeRouteLeave`) return `undefined`/`true` to proceed, `false` to cancel, or a location to redirect.
- Lazy-load route components with dynamic `import()` — the single highest-leverage performance change available at the routing layer.
- `router.push`/`replace` are asynchronous; reading reactive route state immediately after calling them without awaiting is a race condition, not a guarantee.
