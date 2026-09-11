---
title: Vue 3 Engineering Reference — Testing
description: Vitest + Vue Test Utils component mounting, props/emit stubbing, Pinia store mocking, composable testing with effectScope, async test patterns, and coverage configuration.
---

# 18 — Testing

## Component Mount — Vue Test Utils

::code-wrapper{language="typescript" filename="UserCard.spec.ts"}
```typescript
import { mount, type VueWrapper } from '@vue/test-utils'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import UserCard from './UserCard.vue'

// ── mount: full render (includes child components) ──
// shallowMount: stubs all child components (faster, tests in isolation)
describe('UserCard', () => {
  let wrapper: VueWrapper

  beforeEach(() => {
    // ── mount with props, slots, and global config ──
    wrapper = mount(UserCard, {
      props: {
        user: { id: 1, name: 'Ada', role: 'admin' },
        editable: true,
      },
      // ── slots: test slot content ──
      slots: {
        default: '<p>Custom content</p>',
        header: '<h2>Header</h2>',
      },
      // ── global: plugins, stubs, mocks ──
      global: {
        // ── stubs: replace specific components with simple versions ──
        stubs: {
          RouterLink: true,        // auto-stub (renders a <stub>)
          HeavyChart: '<div />',    // custom stub (renders a div)
        },
        // ── mocks: inject mock provide values ──
        provide: {
          apiClient: { get: vi.fn().mockResolvedValue({ data: 'mocked' }) },
        },
        // ── plugins: register Pinia, Router, etc. ──
        plugins: [createTestingPinia()],
      },
    })
  })

  it('renders user name', () => {
    expect(wrapper.text()).toContain('Ada')
  })

  it('emits delete with user id on click', async () => {
    // ── find by component, text, selector, or test id ──
    const button = wrapper.find('[data-testid="delete-btn"]')
    await button.trigger('click')  // trigger DOM event

    // ── Assert emitted event ──
    expect(wrapper.emitted('delete')).toBeTruthy()
    expect(wrapper.emitted('delete')![0]).toEqual([1])  // first emit, first arg = 1
  })

  it('updates input value on v-model', async () => {
    const input = wrapper.find('input')
    await input.setValue('Grace')
    // setValue: sets value + triggers 'input' event (v-model compatible)
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['Grace'])
  })
})
```
::

## Testing Composables — effectScope

::code-wrapper{language="typescript" filename="useCounter.spec.ts"}
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useCounter } from './useCounter'

// ── Composables with effects/watchers need effectScope for cleanup ──
// Without scope: effects created in the composable persist after the test,
// potentially affecting other tests (cross-test contamination).
describe('useCounter', () => {
  let scope: ReturnType<typeof effectScope>

  beforeEach(() => {
    scope = effectScope()  // fresh scope per test — auto-disposes effects
  })

  afterEach(() => {
    scope.stop()  // disposes all effects created in the scope
  })

  it('starts at 0', () => {
    const { count } = scope.run(() => useCounter())!
    expect(count.value).toBe(0)
  })

  it('increments', () => {
    const { count, increment } = scope.run(() => useCounter())!
    increment()
    expect(count.value).toBe(1)
  })

  it('watches count and calls callback on change', async () => {
    const { count, increment } = scope.run(() => useCounter())!
    const cb = vi.fn()
    scope.run(() => {
      watch(count, cb)  // watcher registered inside the scope
    })
    increment()
    await nextTick()  // wait for watcher to fire (async)
    expect(cb).toHaveBeenCalledWith(1, 0)
  })
})
```
::

## Testing Pinia Stores

::code-wrapper{language="typescript" filename="userStore.spec.ts"}
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUserStore } from './userStore'
import { api } from './api'

// ── createTestingPinia: auto-mocks all actions (no side effects) ──
// Or: setActivePinia(createPinia()) for real store logic with mocked deps.
describe('UserStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())  // fresh Pinia per test — no state leakage
  })

  it('login sets user and token', async () => {
    const store = useUserStore()
    vi.spyOn(api, 'login').mockResolvedValue({
      user: { id: 1, name: 'Ada' },
      token: 'tok123',
    })

    await store.login({ email: 'ada@example.com', password: 'secret' })

    expect(store.user).toEqual({ id: 1, name: 'Ada' })
    expect(store.token).toBe('tok123')
    expect(api.login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'secret' })
  })

  it('isAuthenticated returns true when token exists', () => {
    const store = useUserStore()
    expect(store.isAuthenticated).toBe(false)
    store.token = 'tok'
    expect(store.isAuthenticated).toBe(true)
  })

  it('$reset restores initial state', () => {
    const store = useUserStore()
    store.user = { id: 1, name: 'Ada' }
    store.$reset()  // only works on Options API stores
    expect(store.user).toBe(null)
  })
})
```
::

## Async Testing — waitFor and Flush

::code-wrapper{language="typescript" filename="async-spec.ts"}
```typescript
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { flushPromises, nextTick } from '@vue/test-utils'
import AsyncComponent from './AsyncComponent.vue'

describe('AsyncComponent', () => {
  it('renders data after fetch resolves', async () => {
    // ── Mock the global fetch ──
    const mockData = { name: 'Ada' }
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    } as Response)

    const wrapper = mount(AsyncComponent)

    // ── Loading state should show immediately ──
    expect(wrapper.text()).toContain('Loading')

    // ── flushPromises: resolves all pending microtasks (promises) ──
    await flushPromises()

    // ── After resolution: data should be rendered ──
    expect(wrapper.text()).toContain('Ada')
    expect(fetch).toHaveBeenCalledWith('/api/data')
  })

  it('shows error on fetch failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'))
    const wrapper = mount(AsyncComponent)
    await flushPromises()
    expect(wrapper.text()).toContain('Network error')
  })

  it('watches and re-fetches on prop change', async () => {
    const wrapper = mount(AsyncComponent, { props: { userId: 1 } })
    await flushPromises()

    // Clear previous calls
    vi.mocked(fetch).mockClear()

    // Change prop → triggers watcher → new fetch
    await wrapper.setProps({ userId: 2 })
    await flushPromises()

    expect(fetch).toHaveBeenCalledWith('/api/users/2')
  })

  it('handles nextTick for DOM updates', async () => {
    const wrapper = mount(AsyncComponent)
    await wrapper.find('button').trigger('click')
    // DOM not yet updated — need nextTick
    await nextTick()
    expect(wrapper.find('.result').exists()).toBe(true)
  })
})
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
// ── 1. Use data-testid for test selectors (not CSS classes) ──
// <button data-testid="submit">Submit</button>
// wrapper.find('[data-testid="submit"]')
// CSS classes change for styling reasons; test ids are stable.

// ── 2. Mock modules at the top of the file ──
vi.mock('@/api/client', () => ({
  fetchUser: vi.fn().mockResolvedValue({ id: 1, name: 'Ada' }),
  updateUser: vi.fn(),
}))

// ── 3. Test emitted events with wrapper.emitted() ──
// wrapper.emitted('event-name') → array of arg arrays: [[arg1, arg2], [arg1]]
// wrapper.emitted() → all events as object: { 'event-name': [...] }

// ── 4. Snapshot testing for component output ──
expect(wrapper.html()).toMatchSnapshot()
// Use only for stable components — snapshots break easily and are noisy.

// ── 5. Testing transitions: disable them ──
mount(Comp, { global: { stubs: ['Transition', 'TransitionGroup'] } })
// Transitions are async — stubbing them makes tests deterministic.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. mount vs shallowMount: child behavior not tested with shallow ──
// shallowMount stubs ALL children — if a bug is in a child, you miss it.
// Use mount for integration tests, shallowMount for isolated unit tests.

// ── 2. flushPromises is NOT a real Vue tick — it only flushes microtasks ──
// For DOM updates, use nextTick() (Vue's reactivity flush queue).
// flushPromises + nextTick may both be needed in async tests.

// ── 3. vi.fn() mocks persist across tests unless cleared ──
// vi.clearAllMocks() in beforeEach to reset call counts and implementations.
// vi.restoreAllMocks() also restores the original implementation.

// ── 4. Testing v-model: setValue triggers 'input', not 'change' ──
// For .lazy (which uses 'change'), use: input.element.value = 'x'; input.trigger('change')

// ── 5. Timing: watch/watchEffect fire asynchronously (pre/post flush) ──
// After triggering an event, await nextTick() before asserting watcher side effects.

// ── 6. Testing Pinia getters with parameters ──
// Getters that return functions (itemPrice(id)) must be called with a mock id.
// store.itemPrice(1) — the getter is called with the id, not memoized.
```
::

## 🧠 Spot the Bug

A test asserts on emitted events but gets `undefined`.

::code-wrapper{language="typescript" filename="TestBug.ts"}
```typescript
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import Counter from './Counter.vue'

describe('Counter', () => {
  it('emits increment', () => {
    const wrapper = mount(Counter)
    wrapper.find('button').trigger('click')  // ❌ missing await
    expect(wrapper.emitted('increment')).toBeTruthy()  // undefined — event hasn't fired yet
  })
})
```
::

<details>
<summary>Answer</summary>

`trigger('click')` returns a promise — the click handler (which calls `emit`) runs asynchronously. Without `await`, the assertion executes before the handler completes, so `emitted('increment')` is `undefined`.

**Fix** — await the trigger:

::code-wrapper{language="typescript" filename="TestFixed.ts"}
```typescript
it('emits increment', async () => {
  const wrapper = mount(Counter)
  await wrapper.find('button').trigger('click')  // ✅ await the event
  expect(wrapper.emitted('increment')).toBeTruthy()
})
```
::

**The lesson**: all DOM interactions in Vue Test Utils are async. `trigger()`, `setValue()`, and `setProps()` return promises that must be awaited before asserting on the result.

</details>