# 16 — Error Boundaries

Every previous chapter has built exclusively with function components — this chapter is the one deliberate exception. As of today's React, **error boundaries must be class components**; there is no hook equivalent, because the underlying lifecycle methods they rely on have no function-component counterpart. Understanding why requires understanding what an error boundary actually catches, and just as importantly, what it doesn't.

## What Happens Without an Error Boundary

By default, an uncaught error thrown during rendering, in a lifecycle method, or in a constructor anywhere in a component tree unmounts the *entire* React tree it occurred in — not just the component that threw. This is deliberate: React's position is that leaving a corrupted UI on screen (parts rendered from before the error, mixed with a broken subtree) is worse than showing nothing, since a partially-broken UI can mislead a user into thinking an action succeeded when it didn't.

::code-wrapper{language="javascript"}
```javascript
function ProductPrice({ price }) {
  return <span>${price.toFixed(2)}</span>
  // If price is undefined (e.g. a malformed API response), .toFixed throws —
  // and with no error boundary anywhere above it, the WHOLE app unmounts to a blank screen.
}
```
::

A single malformed price field, deep in a product list, taking down an entire e-commerce page is precisely the failure mode error boundaries exist to contain.

## Defining an Error Boundary

An error boundary is a class component implementing `static getDerivedStateFromError` (to render fallback UI) and/or `componentDidCatch` (to perform side effects like logging) — both are lifecycle hooks with no function-component equivalent, which is the specific, narrow reason this one piece of the codebase stays a class.

::code-wrapper{language="javascript"}
```javascript
import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error) {
    // Called during the "render" phase — must be pure, no side effects allowed here.
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    // Called during the "commit" phase — side effects (logging) belong here, not above.
    logErrorToService(error, errorInfo.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}
```
::

::code-wrapper{language="javascript"}
```javascript
function App() {
  return (
    <ErrorBoundary fallback={<p>Something went wrong. Please refresh.</p>}>
      <ProductList />
    </ErrorBoundary>
  )
}
```
::

The split between the two lifecycle methods is deliberate and mirrors React's render/commit phase separation (chapter 6): `getDerivedStateFromError` runs during render and must stay pure (no logging, no network calls) because React may call it multiple times or discard the result; `componentDidCatch` runs after the DOM has committed and is the correct, safe place for actual side effects like reporting to Sentry or a similar service.

## What Error Boundaries Catch — and What They Don't

This is the single most important, most frequently misunderstood fact about error boundaries: they catch errors thrown during **rendering**, in **lifecycle methods**, and in **constructors** of the tree *below* them — and nothing else.

::code-wrapper{language="javascript"}
```javascript
function CheckoutButton() {
  function handleClick() {
    throw new Error('Payment failed')
    // NOT caught by any error boundary — this is an event handler, not a render-phase error.
    // It becomes an uncaught runtime error, visible in the console, but does NOT unmount the tree.
  }
  return <button onClick={handleClick}>Pay Now</button>
}
```
::

Errors that error boundaries explicitly do **not** catch:

- **Event handlers** — `onClick`, `onChange`, etc. run outside React's render cycle entirely; wrap the risky logic in a plain `try`/`catch` instead.
- **Asynchronous code** — errors inside `setTimeout` callbacks, promise chains, or `async` functions, even if triggered from a component, since by the time they throw, React is no longer "in the middle of" rendering that component.
- **Server-side rendering errors** — error boundaries only run on the client in the version of React most apps run today.
- **Errors thrown in the error boundary's own render method** — a boundary cannot catch its own failures; a *different*, higher boundary is needed for that.

::code-wrapper{language="javascript"}
```javascript
function UserAvatar({ userId }) {
  useEffect(() => {
    fetchUser(userId).catch(err => {
      // Must be handled HERE, explicitly — an error boundary above this component
      // will never see this rejection, since it happens asynchronously after render committed.
      console.error(err)
      reportError(err)
    })
  }, [userId])

  return <img src={`/avatars/${userId}.png`} />
}
```
::

For event handlers specifically, a plain `try`/`catch` block, paired with local state to drive fallback UI, is the correct (and only) mechanism:

::code-wrapper{language="javascript"}
```javascript
function CheckoutButton() {
  const [error, setError] = useState(null)

  function handleClick() {
    try {
      processPayment()
    } catch (err) {
      setError(err)
    }
  }

  if (error) return <PaymentErrorMessage error={error} onRetry={() => setError(null)} />
  return <button onClick={handleClick}>Pay Now</button>
}
```
::

## Granularity: One Big Boundary vs. Many Small Ones

A single error boundary wrapping the entire `<App>` is better than nothing, but it means *any* rendering error anywhere blanks out the *entire* application with the fallback UI — a chat widget's rendering bug taking down an otherwise-fully-functional dashboard is a worse outcome than necessary.

::code-wrapper{language="javascript"}
```javascript
// Coarse: one error anywhere blanks the entire app
function App() {
  return (
    <ErrorBoundary fallback={<FullPageError />}>
      <Header />
      <Sidebar />
      <MainContent />
      <ChatWidget />
    </ErrorBoundary>
  )
}
```
::

::code-wrapper{language="javascript"}
```javascript
// Granular: an error in one region degrades only that region
function App() {
  return (
    <>
      <ErrorBoundary fallback={<HeaderFallback />}><Header /></ErrorBoundary>
      <ErrorBoundary fallback={<SidebarFallback />}><Sidebar /></ErrorBoundary>
      <ErrorBoundary fallback={<MainContentFallback />}><MainContent /></ErrorBoundary>
      <ErrorBoundary fallback={null}><ChatWidget /></ErrorBoundary>
    </>
  )
}
```
::

The right granularity is a judgment call weighing blast radius against boilerplate: critical, independent regions of a page (navigation, main content, a non-essential widget) each get their own boundary; tightly coupled components that make no sense functioning independently (a form and its own submit button) typically share one.

## A Reusable Error Boundary with Reset Capability

Production error boundaries usually need a way to attempt recovery — showing a "Try again" button that resets the boundary's error state so React attempts to render the children fresh, useful when the underlying cause was transient (a flaky network call on the next render, for instance).

::code-wrapper{language="javascript"}
```javascript
class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    this.props.onError?.(error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback(this.state.error, this.handleReset)
    }
    return this.props.children
  }
}
```
::

::code-wrapper{language="javascript"}
```javascript
function ProductPage({ productId }) {
  return (
    <ErrorBoundary
      onError={(error, info) => logErrorToService(error, info.componentStack)}
      fallback={(error, reset) => (
        <div className="error-panel">
          <p>Couldn't load this product.</p>
          <button onClick={reset}>Try again</button>
        </div>
      )}
    >
      <ProductDetails productId={productId} />
    </ErrorBoundary>
  )
}
```
::

Resetting a boundary's `hasError` state is not, by itself, enough if the *props* that triggered the original error haven't changed — clicking "Try again" on the same broken `productId` will simply throw the same error again. A more complete reset strategy also changes a `key` on the boundary (chapter 13) tied to whatever input might have changed, forcing a full remount rather than merely re-rendering the same broken tree.

## `react-error-boundary`: The Common Production Choice

Because the class-component boilerplate above is largely identical across projects, most production codebases pull in the small, focused `react-error-boundary` library rather than hand-rolling it — it wraps the same underlying class-component mechanism behind a function-component-friendly API, including a `useErrorBoundary` hook for triggering a boundary from inside event handlers/effects on purpose.

::code-wrapper{language="javascript"}
```javascript
import { ErrorBoundary } from 'react-error-boundary'

function ProductPage({ productId }) {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, info) => logErrorToService(error, info.componentStack)}
      onReset={() => window.location.reload()}
    >
      <ProductDetails productId={productId} />
    </ErrorBoundary>
  )
}

function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div role="alert" className="error-panel">
      <p>Couldn't load this product: {error.message}</p>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  )
}
```
::

The library doesn't remove the underlying class-component requirement — it's still a class internally — it simply means application code never needs to write that class by hand, which is why "error boundaries must be classes" rarely shows up as an actual pain point in day-to-day development despite the codebase otherwise being 100% function components.

## 💡 Tips & Tricks

- **Idiom** — Reach for `react-error-boundary` over a hand-rolled class in new projects — it's a small, focused dependency, and the `FallbackComponent`/`onReset`/`useErrorBoundary` API covers the reset-on-retry and manual-trigger needs that a bare class implementation (this chapter's earlier examples) requires hand-writing.
- **Idiom** — Place error boundaries at meaningful UI-region boundaries (a widget, a route, a card in a dashboard), not just once at the app root — this keeps a rendering bug in one area from blanking out an otherwise-functional page.
- **Debug** — `componentDidCatch`'s second argument, `errorInfo.componentStack`, is a string showing exactly which component tree the error propagated through — send this to your error-reporting service alongside the error itself; the plain JS stack trace alone often isn't enough to locate which *instance* of a reused component actually failed.
- **Idiom** — When adding a "Try again" reset button, also consider changing a `key` on the boundary tied to whatever input caused the failure — resetting `hasError` alone re-renders the same props that just threw, which reproduces the identical error immediately if the cause wasn't transient.
- **Debug** — To manually test an error boundary's fallback UI during development, temporarily `throw` in a component's render body rather than relying on real error conditions to occur — reproducing the actual bug that triggers the boundary is often far more effort than verifying the boundary itself works.

## ⚠️ Edge Cases & Gotchas

- **Error boundaries never catch errors from event handlers, `async` code, `setTimeout` callbacks, or SSR** — only render-phase, lifecycle-method, and constructor errors in the tree below the boundary are caught; everything else requires a local `try`/`catch` or `.catch()` handled explicitly at the source.
- **A boundary cannot catch an error thrown within its own render method** — the error propagates up to the next boundary *above* it (or unmounts the whole tree if there is none), so a top-level catch-all boundary still needs to exist even when granular boundaries are used elsewhere.
- **`getDerivedStateFromError` must be a pure static method with no side effects** — logging or reporting from inside it (instead of `componentDidCatch`) risks running multiple times or during a discarded render pass, since React may invoke render-phase lifecycle methods more than once per commit under some circumstances (particularly under Strict Mode's deliberate double-invocation in development).
- **Resetting a boundary's internal error state does not automatically fix the underlying cause** — if the error was caused by a prop value that hasn't changed, clicking "reset" and re-rendering the same children reproduces the identical error immediately, looking like the reset button "doesn't work."
- **In development, React still logs errors caught by an error boundary to the console (and, depending on setup, shows an overlay) even though the fallback UI renders correctly** — this is expected, not a sign the boundary failed; production builds don't show the overlay.

## 🧠 Spot the Bug

A team wraps their whole app in an error boundary and is confused why a "network request failed" error from their data-fetching hook still crashes the page to a white screen instead of showing the fallback UI.

::code-wrapper{language="javascript"}
```javascript
function useProduct(id) {
  const [product, setProduct] = useState(null)

  useEffect(() => {
    fetch(`/api/products/${id}`)
      .then(res => res.json())
      .then(setProduct)
      .catch(err => {
        throw err // rethrow so "the error boundary can catch it"
      })
  }, [id])

  return product
}

function App() {
  return (
    <ErrorBoundary fallback={<p>Something went wrong.</p>}>
      <ProductDetails id="42" />
    </ErrorBoundary>
  )
}
```
::

<details>
<summary>Answer</summary>

The `throw err` inside the `.catch()` happens asynchronously, inside a promise callback that runs long after the component's render phase has finished and committed — by the time it executes, React is not "in the middle of" rendering this component at all. Throwing there produces an unhandled promise rejection (visible in the console, and in some setups crashing the tab entirely via the browser's own unhandled-rejection behavior), but it never passes through React's error-boundary machinery, which only intercepts errors thrown synchronously during render/lifecycle/constructor execution.

**The lesson**: error boundaries cannot catch asynchronous errors no matter how they're rethrown — async failures (fetch rejections, `setTimeout` errors, unhandled promise rejections) must be caught and handled at their actual source, typically by setting local error state that a component then reads and branches on during its next (synchronous) render, exactly like the `useFetch` hook's `status: 'error'` pattern from chapter 11.

</details>

## Key Takeaways

- Error boundaries must be class components — `getDerivedStateFromError` and `componentDidCatch` have no function-component equivalent, making this the one deliberate, permanent exception to an otherwise all-function-components codebase.
- Without any error boundary, an uncaught render-phase error unmounts the entire React tree it occurred in, by design, rather than risk showing a partially-corrupted UI.
- Error boundaries catch only render-phase, lifecycle-method, and constructor errors in the tree below them — never event handlers, async code, or their own render errors; those need local `try`/`catch` or promise `.catch()` handling instead.
- Prefer several granular boundaries around independent UI regions over one boundary at the app root, so a failure in one widget doesn't blank the entire page.
- `componentDidCatch`'s `errorInfo.componentStack` is valuable, specific debugging context worth sending to error-reporting tools alongside the raw error.
- `react-error-boundary` wraps the same underlying class mechanism in a function-component-friendly API and is the common production choice over hand-writing the class boilerplate.
