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

## TDD Cycle

1. **Red** — write a failing test
2. **Green** — write minimal code to pass
3. **Refactor** — improve the code while tests stay green

## Key Takeaways

- Unit tests cover individual functions; E2E tests cover user flows.
- Mock external dependencies (APIs, DB) — test your logic, not their internals.
- TDD: write the test first, watch it fail, implement, watch it pass, refactor.
- Run tests on every commit — CI automation prevents regressions.