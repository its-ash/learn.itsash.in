# 24 — Testing

Every chapter so far has focused on writing components; this one focuses on gaining confidence that they actually work, and keep working as the codebase changes. React Testing Library (RTL), paired with a test runner (Vitest or Jest) and `@testing-library/user-event`, is the dominant approach in modern React codebases. This chapter covers RTL's core philosophy, unit testing components across their loading/error/success states, mocking hooks and network calls, and testing real user interactions.

## The RTL Philosophy: Test Behavior, Not Implementation

RTL's guiding principle, stated directly in its own documentation, is: **"the more your tests resemble the way your software is used, the more confidence they can give you."** Concretely, this means querying the rendered output the way a real user would perceive it — by visible text, label, or role — rather than reaching into component internals (state values, instance methods, CSS class names, or arbitrary `data-testid` attributes as a first resort).

::code-wrapper{language="javascript"}
```javascript
// Implementation-focused (avoid): couples the test to internal structure that
// has nothing to do with whether the feature actually works for a real user
test('increments count', () => {
  const wrapper = shallowRender(<Counter />)
  wrapper.instance().handleIncrement()
  expect(wrapper.state('count')).toBe(1)
})
```
::

::code-wrapper{language="javascript"}
```javascript
// Behavior-focused (RTL way): interacts with the DOM exactly as a user would —
// clicking a button they can see, then reading the text that appears afterward
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

test('increments count when the button is clicked', async () => {
  const user = userEvent.setup()
  render(<Counter />)

  await user.click(screen.getByRole('button', { name: /increment/i }))

  expect(screen.getByText('Count: 1')).toBeInTheDocument()
})
```
::

The payoff of the behavior-focused version: refactoring `Counter` from `useState` to `useReducer`, or from a class to a function component, doesn't break this test at all — the test only cares that clicking a visible button produces visible text, which is exactly what a real user experiences, regardless of how the component is implemented internally.

## Query Priority: `getByRole` First

RTL exposes many query variants (`getByText`, `getByLabelText`, `getByRole`, `getByTestId`, and `find`/`query` variants of each for async and optional cases), and the library's own guidance ranks them by how closely each resembles what an actual user (including one using a screen reader) perceives — `getByRole` sits at the top of that priority for interactive elements, since it queries by the accessibility tree, the same thing assistive technology relies on.

::code-wrapper{language="javascript"}
```javascript
function LoginForm() {
  return (
    <form>
      <label htmlFor="email">Email</label>
      <input id="email" type="email" />
      <button type="submit">Log In</button>
    </form>
  )
}
```
::

::code-wrapper{language="javascript"}
```javascript
test('renders the login form', () => {
  render(<LoginForm />)

  // getByRole with an accessible name — matches how a screen reader user
  // and a sighted user both identify these elements, via label/visible text
  expect(screen.getByLabelText('Email')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Log In' })).toBeInTheDocument()
})
```
::

`getByTestId` (querying an explicit `data-testid="..."` attribute) is the RTL team's own documented **last resort** — it works when nothing else reasonably can (a purely visual element with no text, label, or semantic role), but every `data-testid` reached for by default instead of `getByRole`/`getByLabelText` is a missed opportunity to verify the component is actually accessible, since a query that only a test can perform says nothing about whether a real user (particularly one using assistive technology) can find that same element.

## Testing Loading, Error, and Success States

Chapter 17 established that a production-grade fetch needs at minimum loading, error, and success states — testing a data-fetching component means asserting on all three, not just the happy path.

::code-wrapper{language="javascript"}
```javascript
function UserProfile({ userId }) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null })

  useEffect(() => {
    setState({ status: 'loading', data: null, error: null })
    fetch(`/api/users/${userId}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => setState({ status: 'success', data, error: null }))
      .catch(error => setState({ status: 'error', data: null, error }))
  }, [userId])

  if (state.status === 'loading') return <p>Loading…</p>
  if (state.status === 'error') return <p role="alert">Something went wrong</p>
  return <h1>{state.data.name}</h1>
}
```
::

::code-wrapper{language="javascript"}
```javascript
import { render, screen, waitFor } from '@testing-library/react'
import { vi, test, expect, beforeEach } from 'vitest'

beforeEach(() => {
  global.fetch = vi.fn()
})

test('shows loading state immediately, then success state once data resolves', async () => {
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'Ada Lovelace' }) })

  render(<UserProfile userId="1" />)

  expect(screen.getByText('Loading…')).toBeInTheDocument()

  // findBy* queries poll until the element appears or a timeout elapses —
  // the correct tool for asserting on state that arrives asynchronously
  expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
})

test('shows an error message when the request fails', async () => {
  fetch.mockResolvedValueOnce({ ok: false, status: 500 })

  render(<UserProfile userId="1" />)

  expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
})
```
::

`findByText`/`findByRole` (returning a promise, internally polling with `waitFor` semantics) are the correct query for anything that appears after an async operation — reaching for the synchronous `getByText` immediately after `render()` for content that only exists post-fetch produces a flaky-looking failure, not because the test is wrong in principle, but because the assertion ran before React had a chance to commit the state update from the resolved promise.

## Mocking `fetch`

The example above mocks `global.fetch` directly for a simple case; a more realistic codebase — especially one testing several components against the same endpoints — benefits from **Mock Service Worker (MSW)**, which intercepts requests at the network level rather than requiring every test file to stub `fetch` by hand.

::code-wrapper{language="javascript"}
```javascript
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

const server = setupServer(
  http.get('/api/users/:id', ({ params }) => {
    return HttpResponse.json({ id: params.id, name: 'Ada Lovelace' })
  })
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

test('renders the fetched user', async () => {
  render(<UserProfile userId="1" />)
  expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
})

test('shows an error state for a failing request', async () => {
  // server.use() overrides the default handler for just this one test
  server.use(http.get('/api/users/:id', () => new HttpResponse(null, { status: 500 })))

  render(<UserProfile userId="1" />)
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})
```
::

MSW's advantage over hand-mocking `fetch` compounds as a test suite grows: components genuinely make real (intercepted) network requests with real request/response shapes, tests don't need to know or care whether a component uses `fetch`, `axios`, or something else internally, and the same mock handlers can be reused across the entire test suite and even in local development.

## Mocking Custom Hooks

A component that depends on a custom hook (chapter 11) — especially one wrapping something environment-specific like `window.matchMedia`, geolocation, or a third-party SDK — is often easier to test by mocking the hook's module directly, isolating the component under test from the hook's own implementation (which should have its own separate tests).

::code-wrapper{language="javascript"}
```javascript
import { vi, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useAuth } from './useAuth'

vi.mock('./useAuth')

test('shows the dashboard for a logged-in user', () => {
  vi.mocked(useAuth).mockReturnValue({ user: { name: 'Ada' }, isLoading: false })

  render(<Dashboard />)

  expect(screen.getByText(/welcome, ada/i)).toBeInTheDocument()
})

test('redirects to login when there is no authenticated user', () => {
  vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: false })

  render(<Dashboard />)

  expect(screen.getByText(/please log in/i)).toBeInTheDocument()
})
```
::

This isolates `Dashboard`'s own logic (what it renders given a particular auth state) from `useAuth`'s implementation (how it actually determines that state, likely involving tokens, cookies, or a network call) — `Dashboard`'s tests shouldn't need to know or simulate any of that, and `useAuth` earns its own dedicated tests separately, following the same principles applied to a hook instead of a component (via `renderHook` from RTL, for hooks too entangled with component rendering to test indirectly).

## Testing User Interactions

`@testing-library/user-event` simulates real browser interaction sequences (focus, keydown, keyup, input events, in the order a browser actually fires them) rather than firing a single synthetic event directly, which matters for components relying on that full sequence.

::code-wrapper{language="javascript"}
```javascript
function SearchForm({ onSearch }) {
  const [query, setQuery] = useState('')
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSearch(query) }}>
      <label htmlFor="search">Search</label>
      <input id="search" value={query} onChange={e => setQuery(e.target.value)} />
      <button type="submit">Go</button>
    </form>
  )
}
```
::

::code-wrapper{language="javascript"}
```javascript
test('calls onSearch with the typed query when the form is submitted', async () => {
  const user = userEvent.setup()
  const handleSearch = vi.fn()

  render(<SearchForm onSearch={handleSearch} />)

  // user.type fires the full sequence of keyboard events per character,
  // exercising the component's onChange handler the same way real typing does
  await user.type(screen.getByLabelText('Search'), 'react hooks')
  await user.click(screen.getByRole('button', { name: 'Go' }))

  expect(handleSearch).toHaveBeenCalledWith('react hooks')
})
```
::

`fireEvent` (RTL's lower-level API, dispatching one raw DOM event at a time) still has legitimate uses for events `user-event` doesn't model or for performance-sensitive test suites with very large numbers of interactions, but `user-event` is the documented default recommendation — it more faithfully reproduces what happens in a real browser, catching bugs (like a handler that only works correctly when fired via a full event sequence) that a single synthetic `fireEvent.change` can mask.

## Testing Components That Use Context

A component consuming context (chapter 7) needs that context provided in the test, exactly as it would be in the real app — RTL's `render` accepts a `wrapper` option specifically for this.

::code-wrapper{language="javascript"}
```javascript
function renderWithTheme(ui, { theme = 'dark', ...options } = {}) {
  function Wrapper({ children }) {
    return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  }
  return render(ui, { wrapper: Wrapper, ...options })
}

test('applies the dark theme class', () => {
  renderWithTheme(<Header />, { theme: 'dark' })
  expect(screen.getByRole('banner')).toHaveClass('theme-dark')
})
```
::

A custom `renderWithX` wrapper (or several composed together for an app needing multiple providers — theme, auth, routing, a query client) is the standard pattern for avoiding repetitive provider boilerplate across every test file, and is worth extracting into a shared test-utilities module the moment more than one or two test files need the same providers.

## Snapshot Testing: Use Sparingly

Snapshot tests (`expect(container).toMatchSnapshot()`) record a component's rendered output and fail if it changes on a subsequent run — appealing for how little code they require, but prone to becoming a rubber stamp rather than a meaningful check.

::code-wrapper{language="javascript"}
```javascript
// Low signal: a snapshot this large gets re-approved by reflex ("yep, looks like
// a diff, must be fine") rather than genuinely reviewed line by line, and passes
// even if the change silently broke something the developer didn't think to check
test('renders the product page', () => {
  const { container } = render(<ProductPage product={mockProduct} />)
  expect(container).toMatchSnapshot()
})
```
::

Snapshot testing is best reserved for small, stable output (a formatting utility's string output, a small presentational component with few states) where a diff is genuinely easy to review and meaningfully catches regressions — for anything larger or more dynamic, explicit assertions on specific visible text/roles (as in every other example in this chapter) communicate *intent* far better than "the output changed somehow," and don't silently pass a broken change just because someone clicked "update snapshot" without reading the diff.

## 💡 Tips & Tricks

- **Idiom** — Query by `getByRole` with an accessible name first, falling back down RTL's priority list (`getByLabelText`, `getByText`) only when a role-based query genuinely doesn't fit — `getByTestId` is the library's own documented last resort, not a convenient default.
- **Debug** — Reach for `findBy*` queries (not `getBy*`) for anything that appears after an async operation — `getBy*` throws immediately if the element isn't present yet, which looks like a flaky test but is actually a query-choice bug, not a timing bug.
- **Idiom** — Prefer Mock Service Worker over hand-stubbing `global.fetch` once more than a test file or two needs the same endpoints mocked — MSW's handlers are reusable across the whole suite and even local dev, and tests don't need to know which HTTP client a component uses internally.
- **Idiom** — Extract a `renderWithProviders` helper (wrapping `render`'s `wrapper` option) the moment more than one test file needs the same context providers — repeating provider boilerplate in every test file is a common, easily avoided source of test-file bloat.
- **Debug** — When a test fails with an unhelpful DOM dump, call `screen.debug()` (or `screen.logTestingPlaygroundURL()`, which opens an interactive query-suggestion tool) right before the failing assertion — it's the fastest way to see exactly what actually rendered and pick the right query.

## ⚠️ Edge Cases & Gotchas

- **`getByText`/`getByRole` throw synchronously and immediately if no match exists yet** — using them (instead of `findBy*`) for content that only appears after an async state update produces a failure that looks like a broken component but is actually a query timing mistake; the fix is `findBy*` (or `await waitFor(...)`), not fixing the component.
- **Testing internal state or calling component instance methods directly couples a test to implementation details that have nothing to do with correctness from a user's perspective** — such a test can fail on a pure refactor that changes nothing about behavior, and can just as easily pass while the actual user-facing feature is broken, if the internal state happens to still update "correctly" while the rendered output does not.
- **`user-event`'s `type`/`click` calls are asynchronous and must be `await`ed** — forgetting `await` doesn't throw an error; it just means the next assertion runs before the interaction (and its resulting state update) has actually completed, producing an intermittent, timing-dependent failure that's confusing to diagnose.
- **Snapshot tests re-approved without actually reading the diff provide false confidence** — a large snapshot changing because of a genuine regression looks identical, in the review UI, to one changing because of an intended, harmless refactor; both get "update snapshot" clicked in practice far more often than both get carefully read.
- **`vi.mock('./useAuth')` (or Jest's equivalent) is hoisted to the top of the file by the test framework, before imports execute** — this is intentional and necessary for the mock to apply before the module under test imports the real hook, but it means the mock factory can't reference variables declared later in the file without triggering a "cannot access before initialization" error, a confusing gotcha the first time it's hit.

## 🧠 Spot the Bug

A test for a component that fetches and displays a user's name intermittently fails in CI, though it almost always passes locally.

::code-wrapper{language="javascript"}
```javascript
test('displays the fetched user name', () => {
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'Ada Lovelace' }) })

  render(<UserProfile userId="1" />)

  expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
})
```
::

<details>
<summary>Answer</summary>

`UserProfile` fetches `userId`'s data inside a `useEffect`, and the fetch's resolution (and the subsequent `setState` call showing "Ada Lovelace") happens asynchronously — but the test uses `getByText`, which queries synchronously, immediately, right after `render()` returns. On a fast machine (a typical local dev environment), the promise microtask queue can happen to flush before the synchronous test body finishes, making the assertion pass seemingly reliably — but this is not guaranteed by anything in React's or JavaScript's actual execution model, and a slower or more loaded CI machine is exactly the environment where that timing assumption breaks.

**The lesson**: any assertion on content that arrives after an async operation must use `findByText` (or `await waitFor(...)`) rather than `getByText` — `getByText`'s synchronous nature makes a test that happens to pass locally purely a matter of incidental timing, not a guarantee, and "passes locally, flakes in CI" is close to a textbook signature of exactly this mistake.

</details>

## Key Takeaways

- RTL's core philosophy is testing behavior as a user experiences it (visible text, accessible roles/labels) rather than component internals (state, instance methods, arbitrary test IDs) — behavior-focused tests survive refactors that don't change what the user actually sees.
- Query priority favors `getByRole`/`getByLabelText` over `getByTestId`, since role/label-based queries double as an accessibility check — an element only a `data-testid` can find is often an element assistive technology can't find either.
- Test all of a data-fetching component's states (loading, error, success), using `findBy*` queries (not `getBy*`) for anything that only appears after an async operation resolves.
- Mock Service Worker intercepts requests at the network level, letting components make real (intercepted) fetch/axios calls in tests without hand-stubbing each HTTP client's API directly.
- Mock custom hooks at the module level to isolate a component's own rendering logic from a hook's implementation, which should be tested separately and directly.
- `user-event` more faithfully simulates real browser interaction sequences than `fireEvent`, and its async API (`await user.click(...)`) must always be awaited to avoid intermittent, timing-dependent test failures.
