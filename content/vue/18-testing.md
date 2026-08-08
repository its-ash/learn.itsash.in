# 18 — Testing

## Setting Up Vitest + Vue Test Utils

::code-wrapper{language="bash"}
```bash
npm install -D vitest @vue/test-utils jsdom @vitest/coverage-v8
```
::

::code-wrapper{language="javascript" filename="vite.config.js"}
```javascript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true
  }
})
```
::

::code-wrapper{language="bash"}
```bash
npm run test          # or: npx vitest
npx vitest --coverage
```
::

Vitest reuses the exact same Vite config/plugins as the app itself (including `vue()`), which is why `.vue` SFCs "just work" in tests with no separate transform configuration, unlike older Jest-based Vue setups that needed a dedicated `vue-jest` transformer.

## Mounting a Component

::code-wrapper{language="vue" filename="Counter.vue"}
```vue
<script setup>
import { ref } from 'vue'

const props = defineProps({ initial: { type: Number, default: 0 } })
const count = ref(props.initial)
</script>

<template>
  <p data-testid="count">{{ count }}</p>
  <button @click="count++">Increment</button>
</template>
```
::

::code-wrapper{language="javascript" filename="Counter.test.js"}
```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Counter from './Counter.vue'

describe('Counter', () => {
  it('renders the initial count', () => {
    const wrapper = mount(Counter, { props: { initial: 5 } })
    expect(wrapper.get('[data-testid="count"]').text()).toBe('5')
  })

  it('increments on click', async () => {
    const wrapper = mount(Counter)
    await wrapper.get('button').trigger('click')
    // await is required — trigger() dispatches an event and waits for
    // Vue's DOM update to flush before this line continues
    expect(wrapper.get('[data-testid="count"]').text()).toBe('1')
  })
})
```
::

`data-testid` attributes (rather than selecting by CSS class or text content) keep tests resilient to styling/copy changes — a class rename or a copy edit shouldn't break a test whose actual intent is "does clicking increment the count."

## Testing Props, Emits, and Slots

::code-wrapper{language="vue" filename="ConfirmButton.vue"}
```vue
<script setup>
defineProps({ label: String })
const emit = defineEmits(['confirm'])
</script>

<template>
  <button @click="emit('confirm')">{{ label }}<slot name="icon" /></button>
</template>
```
::

::code-wrapper{language="javascript" filename="ConfirmButton.test.js"}
```javascript
import { mount } from '@vue/test-utils'
import ConfirmButton from './ConfirmButton.vue'

it('renders the label prop', () => {
  const wrapper = mount(ConfirmButton, { props: { label: 'Delete' } })
  expect(wrapper.text()).toContain('Delete')
})

it('emits confirm on click', async () => {
  const wrapper = mount(ConfirmButton, { props: { label: 'Delete' } })
  await wrapper.get('button').trigger('click')

  expect(wrapper.emitted()).toHaveProperty('confirm')
  expect(wrapper.emitted('confirm')).toHaveLength(1)
})

it('renders slot content', () => {
  const wrapper = mount(ConfirmButton, {
    props: { label: 'Delete' },
    slots: { icon: '<span class="icon">🗑</span>' }
  })
  expect(wrapper.find('.icon').exists()).toBe(true)
})
```
::

`wrapper.emitted()` records every emitted event by name, with an array of the arguments each call was made with — `wrapper.emitted('confirm')[0]` gives the arguments array from the first `confirm` emission, useful for asserting a component emitted the *correct payload*, not just that it emitted at all.

## Mocking Composables

::code-wrapper{language="javascript" filename="composables/useAuth.js"}
```javascript
import { ref } from 'vue'

const user = ref(null)

export function useAuth() {
  return {
    user,
    isLoggedIn: () => user.value !== null,
    login: (u) => { user.value = u },
    logout: () => { user.value = null }
  }
}
```
::

::code-wrapper{language="vue" filename="UserGreeting.vue"}
```vue
<script setup>
import { useAuth } from '@/composables/useAuth'

const { user } = useAuth()
</script>

<template>
  <p v-if="user">Hello, {{ user.name }}</p>
  <p v-else>Please log in.</p>
</template>
```
::

::code-wrapper{language="javascript" filename="UserGreeting.test.js"}
```javascript
import { vi, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import UserGreeting from './UserGreeting.vue'
import * as authModule from '@/composables/useAuth'

it('greets a logged-in user', () => {
  vi.spyOn(authModule, 'useAuth').mockReturnValue({
    user: ref({ name: 'Ada' }),
    isLoggedIn: () => true,
    login: vi.fn(),
    logout: vi.fn()
  })

  const wrapper = mount(UserGreeting)
  expect(wrapper.text()).toContain('Hello, Ada')
})
```
::

Mocking the composable's module export (rather than trying to control the real underlying state) isolates the component test from the composable's actual implementation entirely — the test verifies "given this composable's shape, does the component render correctly," a genuinely different, narrower concern than "does the composable itself work," which deserves its own separate unit test.

## Testing Pinia Stores

### Unit-testing a store directly

::code-wrapper{language="javascript" filename="stores/counter.test.js"}
```javascript
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, it, expect } from 'vitest'
import { useCounterStore } from '@/stores/counter'

beforeEach(() => {
  // a fresh Pinia instance per test prevents state leaking between tests
  setActivePinia(createPinia())
})

it('increments the count', () => {
  const store = useCounterStore()
  expect(store.count).toBe(0)
  store.increment(5)
  expect(store.count).toBe(5)
})

it('computes doubled correctly', () => {
  const store = useCounterStore()
  store.increment(3)
  expect(store.doubled).toBe(6)
})
```
::

### Testing a component that uses a store

::code-wrapper{language="javascript" filename="CounterWidget.test.js"}
```javascript
import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { vi, it, expect } from 'vitest'
import CounterWidget from './CounterWidget.vue'
import { useCounterStore } from '@/stores/counter'

it('calls the increment action on click', async () => {
  const wrapper = mount(CounterWidget, {
    global: {
      plugins: [createTestingPinia({
        initialState: { counter: { count: 10 } },
        stubActions: false   // let real action logic run instead of auto-mocking it
      })]
    }
  })

  const store = useCounterStore()
  expect(wrapper.text()).toContain('10')

  await wrapper.get('button').trigger('click')
  expect(store.increment).toHaveBeenCalled()
})
```
::

`@pinia/testing`'s `createTestingPinia` stubs every action as a spy by default (`stubActions: true`) — useful for asserting *that* an action was called without triggering its real side effects (network requests, other store mutations); set `stubActions: false` when the test specifically needs the real action logic to run, as above.

## Testing Async Components

::code-wrapper{language="javascript" filename="ProductList.test.js"}
```javascript
import { vi, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ProductList from './ProductList.vue'

beforeEach(() => {
  global.fetch = vi.fn()
})

it('shows loading, then the fetched products', async () => {
  fetch.mockResolvedValue({
    ok: true,
    json: async () => [{ id: 1, name: 'Widget', price: 9.99 }]
  })

  const wrapper = mount(ProductList)
  expect(wrapper.text()).toContain('Loading')

  await flushPromises()   // resolves ALL pending promises, not just one microtask tick

  expect(wrapper.text()).toContain('Widget')
  expect(wrapper.text()).not.toContain('Loading')
})

it('shows an error message when the fetch fails', async () => {
  fetch.mockResolvedValue({ ok: false, status: 500 })

  const wrapper = mount(ProductList)
  await flushPromises()

  expect(wrapper.text()).toContain('Failed to load')
})
```
::

`flushPromises()` exists specifically because a single `await nextTick()` only flushes one round of microtasks — a component's fetch logic often involves multiple chained `.then()`/`await` steps (fetch resolves → `.json()` resolves → state updates → Vue's DOM update flushes), and `flushPromises()` drains all of them before assertions run.

## Snapshot Testing (Used Sparingly)

::code-wrapper{language="javascript"}
```javascript
import { it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Badge from './Badge.vue'

it('matches its snapshot', () => {
  const wrapper = mount(Badge, { props: { status: 'active' } })
  expect(wrapper.html()).toMatchSnapshot()
})
```
::

Snapshot tests are cheap to write but expensive to trust — a broad snapshot of an entire component's rendered HTML fails on any unrelated markup change and trains a team to reflexively run `--update` without actually reading the diff, which defeats the test's purpose; prefer targeted assertions (specific text, specific attributes, emitted events) for anything that should catch a *meaningful* regression.

## Testing Router-Dependent Components

::code-wrapper{language="javascript" filename="UserProfile.test.js"}
```javascript
import { createRouter, createWebHistory } from 'vue-router'
import { mount } from '@vue/test-utils'
import { it, expect } from 'vitest'
import UserProfile from './UserProfile.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/users/:id', name: 'user-profile', component: UserProfile }]
})

it('reads the id route param', async () => {
  router.push('/users/42')
  await router.isReady()

  const wrapper = mount(UserProfile, {
    global: { plugins: [router] }
  })

  expect(wrapper.text()).toContain('42')
})
```
::

## Options API Note

Vue Test Utils' `mount`/`shallowMount` API is identical regardless of whether the component under test uses `<script setup>` or the Options API — there is no separate testing approach for Options API components; the only real difference across the whole chapter is in how the *component itself* is written, not how it's tested.

## 💡 Tips & Tricks

- **Idiom** — Query elements by `data-testid` rather than CSS class or DOM structure — this is the single highest-leverage habit for keeping tests from breaking on purely cosmetic refactors that have nothing to do with the behavior actually under test.
- **Debug** — `await wrapper.get(...).trigger(...)` and `await flushPromises()` are two different tools for two different waits — `trigger` waits for one Vue DOM-update flush, `flushPromises` drains the whole pending microtask queue; reaching for the wrong one is a common cause of a test that "should" pass but reads stale DOM state.
- **Idiom** — Reset Pinia (`setActivePinia(createPinia())`) in a `beforeEach`, not just once at the top of the file — Pinia's underlying state is otherwise a singleton that leaks between test cases, causing order-dependent test failures that are painful to debug.
- **Idiom** — Use `createTestingPinia` for component tests that merely *consume* a store (assert the right action was called), and plain `createPinia()` + `setActivePinia` for store unit tests that need real action/getter logic to actually execute.
- **Debug** — When a component test involving a fetch seems to hang or return stale data, check whether the mock is reset between tests (`vi.resetAllMocks()` or a fresh `vi.fn()` per test) — a `fetch` mock left over from a previous test silently satisfies the next test's request with the wrong response.

## ⚠️ Edge Cases & Gotchas

- **`trigger('click')` on a disabled element still "succeeds" as far as Test Utils is concerned** — Vue Test Utils dispatches the event regardless of the element's `disabled` attribute; a test asserting a handler *didn't* run on a disabled button needs to check the resulting state/emitted events, not just whether `trigger` itself threw (it won't).
- **`shallowMount` stubs out all child components by default, which can hide real integration bugs** — A test using `shallowMount` on a parent that passes a prop with the wrong name to a child will pass regardless, since the stub doesn't validate the real child's prop contract at all — reach for full `mount` when the interaction between parent and child is actually what's under test.
- **Testing Pinia's `createTestingPinia` stubs actions by default — a test asserting on state changes from within an action silently sees nothing happen** — `stubActions: true` (the default) replaces every action with a no-op spy; if a test calls an action and then checks that state changed as a result, it fails not because the logic is wrong but because the real action body never actually ran — set `stubActions: false` for that class of test.
- **A component using top-level `await` (chapter 12/16) cannot be tested with a synchronous `mount()` call alone** — It needs to be mounted inside (or with test scaffolding equivalent to) a `<Suspense>` boundary, and the test must `await` the component's async setup completing before asserting on its rendered output, or assertions run against a component that hasn't finished resolving yet.
- **`wrapper.text()` collapses and normalizes whitespace in ways that can hide or reveal bugs depending on what's being asserted** — Asserting on exact whitespace-sensitive text (`toBe('  Hello  ')`) is fragile and usually the wrong check; prefer `toContain()` for substring checks unless the exact rendered string genuinely matters to the feature being tested.

## 🧠 Spot the Bug

A test for an async product list intermittently passes and intermittently fails in CI, with no code changes between runs.

::code-wrapper{language="javascript" filename="ProductList.test.js"}
```javascript
import { vi, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProductList from './ProductList.vue'

it('shows the fetched products', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [{ id: 1, name: 'Widget' }]
  })

  const wrapper = mount(ProductList)
  await wrapper.vm.$nextTick()

  expect(wrapper.text()).toContain('Widget')
})
```
::

<details>
<summary>Answer</summary>

`await wrapper.vm.$nextTick()` only waits for one round of Vue's reactive DOM-update flush — it does not wait for the underlying `fetch(...).then(res => res.json())` promise chain inside the component to actually resolve first. Whether this test passes or fails becomes a race between the mocked fetch's promise resolution and the single microtask `nextTick` waits for — on a fast CI runner (or under different Node/Vitest version timing) the promise might happen to resolve in time; on a slower or differently-scheduled run, the assertion runs before `products.value` has been set, and the test fails intermittently with no actual code change, the hallmark of a flaky test caused by an insufic wait.

::code-wrapper{language="javascript" filename="ProductList.test.js"}
```javascript
import { vi, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ProductList from './ProductList.vue'

it('shows the fetched products', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [{ id: 1, name: 'Widget' }]
  })

  const wrapper = mount(ProductList)
  await flushPromises()

  expect(wrapper.text()).toContain('Widget')
})
```
::

**The lesson**: `$nextTick()`/`nextTick()` waits for exactly one DOM-update flush, not for arbitrary async work (fetches, chained promises) a component kicks off — use `flushPromises()` whenever a test needs to wait for a component's actual async data-fetching logic to fully settle before asserting on the result.

</details>

## Key Takeaways

- Vitest shares the app's real Vite config, so `.vue` SFCs are testable with zero extra transform setup — a meaningful improvement over older Jest-based Vue testing stacks.
- Query elements by `data-testid`, not CSS classes or DOM structure, to keep tests resilient to unrelated styling/markup refactors.
- `wrapper.emitted('eventName')` records every emission and its arguments — assert on both that an event fired and what it was called with.
- Reset Pinia's active instance per test (`setActivePinia(createPinia())` in `beforeEach`) to avoid state leaking across test cases; use `createTestingPinia` for component tests that only need to verify an action was called.
- `nextTick()` waits for one DOM-update flush; `flushPromises()` drains the full pending microtask queue — use the latter whenever a component's own async fetch logic needs to fully settle before assertions run.
- Use snapshot tests sparingly — broad HTML snapshots fail on unrelated changes and train teams to blindly `--update` rather than review diffs; prefer targeted assertions for anything meant to catch a real regression.
