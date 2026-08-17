# 25 — Testing

## Test Types

- **Unit** — test individual functions in isolation
- **Integration** — test multiple modules together
- **E2E** — test full user flows in a browser

## Vitest Example

::code-wrapper{language="javascript" filename="sum.test.js"}
```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sum, greet } from './sum.js'

describe('sum', () => {
  it('adds two numbers', () => {
    expect(sum(1, 2)).toBe(3)
  })

  it('handles negative numbers', () => {
    expect(sum(-1, -2)).toBe(-3)
  })
})

describe('greet', () => {
  it('returns greeting string', () => {
    expect(greet('Alice')).toBe('Hello, Alice')
  })

  it('handles empty name', () => {
    expect(greet('')).toBe('Hello, stranger')
  })
})
```
::
::

## Mocking

::code-wrapper{language="javascript"}
```javascript
import { vi } from 'vitest'

// Mock a module
vi.mock('./api.js', () => ({
  fetchUser: vi.fn(() => Promise.resolve({ id: 1, name: 'Alice' }))
}))

// Spy on a method
const spy = vi.spyOn(console, 'log')
someFunction()
expect(spy).toHaveBeenCalledWith('hello')
spy.mockRestore()
```
::
::

## TDD Cycle

1. **Red** — write a failing test
2. **Green** — write minimal code to pass
3. **Refactor** — improve the code while tests stay green

## 💡 Tips & Tricks

**`vi.useFakeTimers()` makes timer-based tests instant** — Testing a `debounce` or `setTimeout`-based function no longer requires real waiting: `vi.useFakeTimers(); fn(); vi.advanceTimersByTime(300)` fast-forwards virtual time synchronously.

**`test.each` / `it.each` eliminate copy-pasted test cases** — `it.each([[1, 2, 3], [-1, -2, -3]])('sums %i and %i', (a, b, expected) => expect(sum(a, b)).toBe(expected))` turns a table of inputs into separate named test cases without duplicating the assertion logic.

**Snapshot testing catches unintended output drift** — `expect(renderedHtml).toMatchSnapshot()` stores the first output and fails future runs if it changes unexpectedly — useful for complex objects or markup, but review snapshot diffs carefully rather than blindly updating them.

**`vi.spyOn` restores automatically with `restoreMocks: true`** — Setting that option in `vitest.config.js` avoids the easy-to-forget `spy.mockRestore()` at the end of every test.

**Run only the failing test with `.only`, skip the rest with `.skip`** — `it.only('this one', ...)` narrows a run to a single case while debugging — just remember to remove `.only` before committing, since CI will silently skip everything else.

## ⚠️ Edge Cases & Gotchas

**Forgetting `await` on an async assertion passes silently** — `it('fetches user', () => { expect(fetchUser()).resolves.toEqual(user) })` without `await` or `return` lets the test finish and report "passed" before the promise ever settles — the assertion never actually runs. Always `await expect(...).resolves...` or `return` the expectation.

**Mocked modules leak between test files without `vi.resetModules()`** — `vi.mock('./api.js', ...)` at the top of a file affects the module registry; if another test file expects the real implementation and modules aren't reset, it can silently receive the mock instead, depending on run order and isolation settings.

**`toBe` vs `toEqual` trips up object comparisons** — `expect({ a: 1 }).toBe({ a: 1 })` fails because `toBe` uses `Object.is` (reference equality) — two separately created objects are never `===`. Use `toEqual` for deep value comparison, `toBe` only for primitives or reference identity checks.

**A spy on `console.log` can mask real errors in test output** — `vi.spyOn(console, 'log')` silences the console for the rest of the test unless you also call `spy.mockRestore()` — an uncaught error logged by other code inside the same test run becomes invisible.

**Flaky tests from real timers racing with assertions** — A test that calls a debounced function and asserts immediately (without fake timers or an explicit wait) passes locally on a fast machine but fails intermittently in CI, because the assertion runs before the real `setTimeout` fires.

## 🧠 Spot the Bug

What's wrong with this test, and does it actually catch a broken implementation?

::code-wrapper{language="javascript"}
```javascript
import { it, expect, vi } from 'vitest'
import { fetchUserName } from './user.js'

it('fetches the user name', () => {
  vi.mock('./api.js', () => ({
    getUser: vi.fn(() => Promise.resolve({ name: 'Alice' }))
  }))

  expect(fetchUserName(1)).resolves.toBe('Alice')
})
```
::

<details>
<summary>Answer</summary>

The test passes even if `fetchUserName` is completely broken (e.g. returns `undefined` or throws). `expect(promise).resolves.toBe(...)` itself returns a promise, but the `it` callback never returns or awaits it — Vitest considers the test "done" the instant the synchronous body finishes, before the assertion has a chance to run or fail.

**The lesson**: always `return` or `await` promise-based assertions (`return expect(fetchUserName(1)).resolves.toBe('Alice')` or mark the test `async` and `await` it) — otherwise the assertion is scheduled but never checked before the test is marked green.

</details>

## Key Takeaways

- Unit tests cover individual functions; E2E tests cover user flows.
- Mock external dependencies (APIs, DB) — test your logic, not their internals.
- TDD: write the test first, watch it fail, implement, watch it pass, refactor.
- Run tests on every commit — CI automation prevents regressions.