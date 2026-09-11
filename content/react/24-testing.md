---
title: "24 — Testing"
description: "React Testing Library patterns — queries, userEvent, async testing, hook testing, mocking, and why snapshot testing should be avoided. Code-first reference for mid-to-senior React engineers."
---

# 24 — Testing

## Setup: Vitest + React Testing Library

::code-wrapper{language="bash" filename="install.sh"}
```bash
npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```
::

::code-wrapper{language="javascript" filename="vitest.setup.js"}
```javascript
// vitest.setup.js — runs before all tests
import '@testing-library/jest-dom/vitest'
```
::

::code-wrapper{language="javascript" filename="vitest.config.js"}
```javascript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',      // DOM simulation
    setupFiles: ['./vitest.setup.js'],
    globals: true,             // expect, describe, it available globally
    css: false,                // don't process CSS in tests
  },
})
```
::

## The Core Pattern: render → query → assert

::code-wrapper{language="javascript" filename="basic_test.js"}
```javascript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Button from './Button'

describe('Button', () => {
  it('renders the label', () => {
    render(<Button label="Click me" />)
    // screen.getByRole queries the DOM by ARIA role — the most accessible query
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()  // simulates real browser interactions
    const handleClick = vi.fn()     // vitest mock function
    render(<Button label="Save" onClick={handleClick} />)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(handleClick).toHaveBeenCalledOnce()
  })
})
```
::

## Queries: Which to Use and Why

::code-wrapper{language="javascript" filename="queries.js"}
```javascript
// QUERY PRIORITY (from Testing Library docs — test as a user would interact):
// 1. getByRole — most accessible, mirrors how AT users find elements
// 2. getByLabelText — for form fields (labels are the user's way to find inputs)
// 3. getByPlaceholderText — fallback for inputs without labels
// 4. getByText — for non-interactive text content
// 5. getByDisplayValue — for inputs/selects by their current value
// 6. getByAltText — for images
// 7. getByTitle — for elements with title attributes
// 8. getByTestId — LAST resort: not accessible, couples to implementation

// VARIANTS:
//   getBy*     — returns 1 match, throws if 0 or >1 (use when you expect exactly 1)
//   queryBy*   — returns 1 match or null, throws if >1 (use for "not in document" asserts)
//   getAllBy*  — returns array, throws if 0 (use when multiple matches expected)
//   findBy*    — async: waits up to 1000ms for element to appear (use for async renders)

// ANTI-PATTERN: using getByTestId when a role query works
screen.getByTestId('submit-button')  // ← couples to test ID, not accessible
screen.getByRole('button', { name: 'Submit' })  // ← mirrors user experience, accessible
```
::

## userEvent over fireEvent

::code-wrapper{language="javascript" filename="user_event.js"}
```javascript
import userEvent from '@testing-library/user-event'

// userEvent simulates REAL browser interactions: focus, blur, key events,
// input events, click events — all in the correct order, just like a real user.
// fireEvent only dispatches the specific event you name — missing intermediate events.

// ANTI-PATTERN: fireEvent for user interactions
fireEvent.change(input, { target: { value: 'hello' } })
// Only dispatches 'change' — skips focus, keydown, input events.
// Components that depend on those intermediate events break.

// PRODUCTION: userEvent for all user interactions
const user = userEvent.setup()
await user.type(input, 'hello')     // dispatches focus → keydown → input → keyup per char
await user.click(button)            // dispatches mouseover → mousemove → mousedown → focus → mouseup → click
await user.tab()                    // simulates tab key navigation
await user.keyboard('{Enter}')      // simulates keydown + keyup for Enter
await user.selectOptions(select, 'option1')  // simulates selecting from a <select>
```
::

## Testing Async Components

::code-wrapper{language="javascript" filename="async_test.js"}
```javascript
import { render, screen, waitFor, within } from '@testing-library/react'

it('shows data after loading', async () => {
  // Mock the fetch call
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ name: 'Alice' }),
  })

  render(<UserProfile userId={1} />)

  // findBy* waits up to 1000ms for the element to appear — for async renders
  expect(await screen.findByText('Alice')).toBeInTheDocument()

  // waitFor: for non-DOM assertions that need to wait
  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith('/api/users/1')
  })

  // Loading state should be gone
  expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
})

it('shows error on failed fetch', async () => {
  vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'))
  render(<UserProfile userId={1} />)
  expect(await screen.findByText('Error: Network error')).toBeInTheDocument()
})
```
::

## Testing Context Providers

::code-wrapper{language="javascript" filename="context_test.js"}
```javascript
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from './ThemeContext'

// Wrap the component under test in the provider — don't mock the context
// unless you specifically want to test behavior when the provider is absent.
function renderWithTheme(ui, { theme = 'dark' } = {}) {
  return render(
    <ThemeProvider value={{ theme, toggle: vi.fn() }}>
      {ui}
    </ThemeProvider>
  )
}

it('renders dark theme', () => {
  renderWithTheme(<ThemedCard />, { theme: 'dark' })
  expect(screen.getByRole('region')).toHaveClass('card-dark')
})
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Idiom] Test behavior, not implementation. Assert what the user sees (text,
// roles, visibility), not internal state or method calls. Tests that check
// "setState was called" break on refactoring without real bugs.

// [Debug] Use screen.debug() to print the current DOM when a query fails:
//   screen.debug()  // prints the full rendered HTML
//   screen.debug(screen.getByRole('button'))  // prints just the button

// [Idiom] Use within() to scope queries to a container:
//   const { getByRole } = within(screen.getByTestId('sidebar'))
//   getByRole('button', { name: 'Settings' })  // only searches within sidebar

// [Performance] Use afterEach(() => { cleanup(); vi.restoreAllMocks() }) to
// reset between tests. Without cleanup, rendered components persist and can
// cause "multiple elements" errors in subsequent tests.

// [Idiom] For custom hooks that don't return JSX, use @testing-library/react-hooks
// (React 17) or render a test component that uses the hook (React 18+):
//   function TestComponent() { const result = useMyHook(); return <div>{result}</div> }
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] getBy* throws if 0 matches OR >1 matches. Use queryBy* for "not present"
// asserts (returns null, doesn't throw). Use getAllBy* for multiple matches.

// [Gotcha] findBy* has a 1000ms default timeout. For slow operations, pass a
// custom timeout: await screen.findByText('Loaded', {}, { timeout: 5000 })

// [Gotcha] Snapshot testing (toMatchSnapshot) is tempting but fragile — any
// minor DOM change (className, whitespace) breaks the snapshot, and developers
// reflexively update snapshots without reviewing. Prefer explicit assertions
// about behavior and content. If you must use snapshots, use toMatchInlineSnapshot.

// [Gotcha] Mocking modules with vi.mock() is hoisted — it runs BEFORE imports.
// The factory function can't reference variables defined in the test file
// without vi.hoisted(). Use vi.spyOn for method-level mocking instead.

// [Gotcha] userEvent.setup() must be called in the test body (not at describe
// level) to properly reset between tests. Each test gets a fresh user instance.
```
::

## 🧠 Spot the Bug

A test for a modal component fails with "Unable to find an element by role":

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
```javascript
it('shows modal content', () => {
  render(<Modal isOpen={true}>Delete this item?</Modal>)
  expect(screen.getByText('Delete this item?')).toBeInTheDocument()
})
```
::

The modal uses a portal (`createPortal`) to render into `document.body`. Why does the query fail?

<details>
<summary>Answer</summary>

`render()` from Testing Library renders into a container div, and `screen` queries are scoped to that container by default. But `createPortal` renders into `document.body` — outside the Testing Library container. The query doesn't find the portal content because it's looking in the wrong part of the DOM.

**Fix**: use `screen.getByText` on the full `document.body`, or configure the base element:

```javascript
import { render, screen } from '@testing-library/react'

it('shows modal content', () => {
  render(<Modal isOpen={true}>Delete this item?</Modal>, { container: document.body })
  expect(screen.getByText('Delete this item?')).toBeInTheDocument()
})
```

Or query the body directly: `expect(screen.getByText('Delete this item?')).toBeInTheDocument()` — `screen` actually queries `document.body` by default in modern versions of Testing Library. If it still fails, check whether `isOpen` is actually `true` at render time (state may not have updated yet).

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. Test BEHAVIOR, not implementation. Assert what the user sees (roles, text,
//    visibility), not internal state or method calls. Tests survive refactoring.

// 2. Query priority: getByRole > getByLabelText > getByText > getByTestId.
//    Use getByRole with { name: '...' } — it mirrors how users find elements.

// 3. Use userEvent (not fireEvent) for all user interactions — it simulates
//    the full event sequence (focus → keydown → input → keyup) like a real user.

// 4. Async: findBy* (waits for element to appear), waitFor (waits for assertion).
//    Default timeout 1000ms — increase with { timeout: 5000 } for slow ops.

// 5. Wrap components in their context providers in tests — don't mock the context
//    unless testing the "no provider" error case. Snapshot tests are fragile —
//    prefer explicit assertions about behavior and content.
```
::
