---
title: "16 — Error Boundaries"
description: "Error boundaries as the one deliberate class-component exception, getDerivedStateFromError vs componentDidCatch, what boundaries catch and don't catch, nesting and granularity, fallback UI patterns, reset strategies, re-throwing, logging to external services, and react-error-boundary. Code-first reference for mid-to-senior React engineers."
---

# 16 — Error Boundaries

## Why Error Boundaries Must Be Class Components

::code-wrapper{language="javascript" filename="why_class.js"}
```javascript
// Error boundaries are the ONE deliberate exception to an all-function-components
// codebase. As of today's React, there is NO hook equivalent because the
// underlying lifecycle methods (getDerivedStateFromError, componentDidCatch)
// have no function-component counterpart.

// REASON: error boundaries work by React calling a lifecycle method WHEN an
// error is thrown during a child's render. Hooks don't have a "catch errors from
// children" mechanism — useEffect, useLayoutEffect, etc. run AFTER render, not
// as an error interceptor DURING the render phase. The class lifecycle is
// structurally the only place React can intercept a render-phase error.

// This is not a temporary gap — it's architectural. A future React version may
// provide a function-component equivalent, but none exists today (React 19
// included). Every error boundary in production is a class component.
```
::

## What Happens Without an Error Boundary

::code-wrapper{language="javascript" filename="without_boundary.js"}
```javascript
// By default, an uncaught error thrown during rendering, in a lifecycle method,
// or in a constructor ANYWHERE in the component tree unmounts the ENTIRE tree.
// This is deliberate: React's position is that leaving a corrupted UI on screen
// (parts from before the error mixed with a broken subtree) is WORSE than showing
// nothing, since a partially-broken UI can mislead a user.

function ProductPrice({ price }) {
  return <span>${price.toFixed(2)}</span>
  // If price is undefined (malformed API response), .toFixed throws — and with
  // no error boundary above it, the WHOLE app unmounts to a blank screen.
}

// A single malformed price field deep in a product list, taking down an entire
// e-commerce page, is precisely the failure mode error boundaries exist to contain.
```
::

## Defining a Basic Error Boundary

::code-wrapper{language="javascript" filename="basic_boundary.js"}
```javascript
import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error) {
    // Called during the RENDER phase — must be PURE, no side effects.
    // React may call it multiple times or discard the result under certain
    // circumstances (e.g. Strict Mode double-invocation in dev).
    // Its ONLY job: return a new state object that triggers the fallback render.
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    // Called during the COMMIT phase (after DOM updates) — side effects go here.
    // This is where you log to Sentry, Datadog, an internal error service, etc.
    // errorInfo.componentStack is a string showing which component tree the error
    // propagated through — invaluable for debugging which INSTANCE failed.
    logErrorToService(error, errorInfo.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

// Usage:
function App() {
  return (
    <ErrorBoundary fallback={<p>Something went wrong. Please refresh.</p>}>
      <ProductList />
    </ErrorBoundary>
  )
}
```
::

### `getDerivedStateFromError` vs `componentDidCatch`

::code-wrapper{language="javascript" filename="two_methods.js"}
```javascript
// The split mirrors React's render/commit phase separation (chapter 6):

// getDerivedStateFromError(error)
//   WHEN: during the render phase, right after a child throws
//   PURE: no side effects allowed (no logging, no network calls)
//   RETURNS: a state object that triggers fallback UI on next render
//   CAN'T: access `this` (it's static), access this.props, do anything async

// componentDidCatch(error, errorInfo)
//   WHEN: during the commit phase, after the DOM has been updated with fallback
//   IMPURE: side effects allowed and expected (logging, analytics)
//   RETURNS: nothing
//   CAN: access this.props, this.state, call external services

// ANTI-PATTERN: logging inside getDerivedStateFromError
static getDerivedStateFromError(error) {
  logErrorToService(error)  // WRONG — this is a render-phase method, must be pure
  return { hasError: true }
}
// React may call this multiple times in dev (Strict Mode) or discard the render
// result entirely — your logging service would receive duplicate or spurious errors.

// CORRECT: log in componentDidCatch only
componentDidCatch(error, errorInfo) {
  logErrorToService(error, errorInfo.componentStack)  // commit phase — safe
}
```
::

## What Error Boundaries Catch — and What They Don't

::code-wrapper{language="javascript" filename="catch_scope.js"}
```javascript
// THE single most misunderstood fact about error boundaries:
// They catch errors thrown during RENDERING, in LIFECYCLE METHODS, and in
// CONSTRUCTORS of the tree below them — and NOTHING ELSE.

// NOT caught by error boundaries:
// 1. Event handlers (onClick, onChange) — run outside React's render cycle
// 2. Asynchronous code (setTimeout, promises, async/await)
// 3. Server-side rendering errors — boundaries only run on the client
// 4. Errors in the error boundary's OWN render method — need a higher boundary

function CheckoutButton() {
  function handleClick() {
    throw new Error('Payment failed')
    // NOT caught by any error boundary — this is an event handler.
    // It becomes an uncaught runtime error (visible in console) but does NOT
    // unmount the tree. The component stays rendered and interactive.
  }
  return <button onClick={handleClick}>Pay Now</button>
}

// Async errors — NOT caught:
function UserAvatar({ userId }) {
  useEffect(() => {
    fetchUser(userId).catch(err => {
      // Must be handled HERE, explicitly. An error boundary above this component
      // will NEVER see this rejection — it happens asynchronously after render
      // committed, long after the render phase ended.
      console.error(err)
      reportError(err)
    })
  }, [userId])
  return <img src={`/avatars/${userId}.png`} />
}
```
::

### Handling Event Handler Errors

::code-wrapper{language="javascript" filename="event_handler_errors.js"}
```javascript
// For event handlers, use a plain try/catch + local state to drive fallback UI.
// This is the ONLY mechanism — error boundaries cannot intercept event handlers.

function CheckoutButton() {
  const [error, setError] = useState(null)

  async function handleClick() {
    try {
      await processPayment()
    } catch (err) {
      setError(err)  // local state drives a re-render with error UI
    }
  }

  if (error) return <PaymentErrorMessage error={error} onRetry={() => setError(null)} />
  return <button onClick={handleClick}>Pay Now</button>
}

// For async errors in effects, handle them in the effect's .catch():
function useFetchData(url) {
  const [state, setState] = useState({ status: 'idle', data: null, error: null })

  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    setState({ status: 'loading', data: null, error: null })
    fetch(url, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => setState({ status: 'success', data, error: null }))
      .catch(err => {
        if (err.name !== 'AbortError') {
          setState({ status: 'error', data: null, error: err })
        }
      })
    return () => controller.abort()
  }, [url])

  return state
}
```
::

## Error Boundary Granularity: Nesting and Blast Radius

::code-wrapper{language="javascript" filename="granularity.js"}
```javascript
// A single boundary at the app root is better than nothing, but means ANY
// rendering error blanks the ENTIRE app — a chat widget's bug taking down an
// otherwise-functional dashboard is a worse outcome than necessary.

// COARSE: one error anywhere blanks the whole app
function CoarseApp() {
  return (
    <ErrorBoundary fallback={<FullPageError />}>
      <Header />
      <Sidebar />
      <MainContent />
      <ChatWidget />
    </ErrorBoundary>
  )
}

// GRANULAR: an error in one region degrades only that region
function GranularApp() {
  return (
    <>
      <ErrorBoundary fallback={<HeaderFallback />}><Header /></ErrorBoundary>
      <ErrorBoundary fallback={<SidebarFallback />}><Sidebar /></ErrorBoundary>
      <ErrorBoundary fallback={<MainContentFallback />}><MainContent /></ErrorBoundary>
      <ErrorBoundary fallback={null}><ChatWidget /></ErrorBoundary>
    </>
  )
}

// RIGHT GRANULARITY: a judgment call weighing blast radius vs. boilerplate.
// - Critical, independent regions (nav, main content, widgets) → own boundaries
// - Tightly coupled components (a form + its submit button) → share one boundary
// - Non-essential widgets → boundary with fallback={null} (silently disappear)
```
::

### Nested Boundaries and Re-throwing

::code-wrapper{language="javascript" filename="nested_boundaries.js"}
```javascript
// Boundaries can be NESTED. When a child boundary catches an error, it does NOT
// propagate to the parent boundary — the child's fallback renders instead.

// But sometimes you WANT certain errors to bubble up to a higher boundary:
// e.g. a deeply-nested component wants to catch "expected" errors locally but
// let "unexpected" (critical) errors propagate to the app-level boundary.

class SmartBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    const isExpected = error instanceof ValidationError
    if (!isExpected) {
      // Re-throw: this propagates to the PARENT boundary, bypassing this one's
      // fallback. componentDidCatch re-throws DO propagate to parent boundaries.
      throw error
    }
    this.props.onError?.(error, errorInfo)
  }

  render() {
    if (this.state.hasError && this.state.error instanceof ValidationError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

// App-level boundary catches only the re-thrown (unexpected) errors:
function App() {
  return (
    <ErrorBoundary fallback={<FullPageError />}>
      <SmartBoundary fallback={<FieldError />}>
        <Form />
      </SmartBoundary>
    </ErrorBoundary>
  )
}
```
::

## A Reusable Error Boundary with Reset Capability

::code-wrapper{language="javascript" filename="resettable_boundary.js"}
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
    // Reset the error state → React re-renders children fresh.
    // CAVEAT: if the PROPS that caused the error haven't changed, the same
    // error will throw again immediately. See the key-based reset below.
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      // Support both: a React element fallback, or a render-prop fallback
      // that receives the error and a reset function for "Try again" UI.
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error, this.handleReset)
      }
      return this.props.fallback
    }
    return this.props.children
  }
}

// Usage with a render-prop fallback:
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

### Reset with Key-Based Remount

::code-wrapper{language="javascript" filename="key_reset.js"}
```javascript
// Resetting hasError alone re-renders the same children with the same props —
// if the error was caused by a prop value, the identical error throws again.
// A more complete reset changes a `key` on the boundary tied to whatever input
// might have changed, forcing a FULL remount rather than re-rendering broken state.

function ProductPage({ productId }) {
  const [resetKey, setResetKey] = useState(0)

  return (
    <ErrorBoundary
      key={resetKey}  // changing key → full remount → fresh state everywhere
      fallback={(error, reset) => (
        <div className="error-panel">
          <p>Couldn't load this product.</p>
          <button onClick={() => {
            setResetKey(k => k + 1)  // change the key → remount
            reset()                   // also reset boundary state (belt + suspenders)
          }}>
            Try again
          </button>
        </div>
      )}
    >
      <ProductDetails productId={productId} />
    </ErrorBoundary>
  )
}

// The key change forces React to unmount and recreate the entire subtree, giving
// every child a fresh state — useful when the error was caused by corrupted
// internal state that a simple re-render wouldn't fix.
```
::

## Logging to an External Error Service

::code-wrapper{language="javascript" filename="error_logging.js"}
```javascript
// Production error boundaries should report to an external service (Sentry,
// Datadog, Bugsnag, Rollbar) so you know about errors users encounter.

import * as Sentry from '@sentry/react'

class ReportingBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // Sentry captures the error with full component stack — this is the
    // MOST valuable field, since the raw JS stack trace often can't tell you
    // WHICH instance of a reused component actually failed.
    Sentry.withScope(scope => {
      scope.setExtra('componentStack', errorInfo.componentStack)
      scope.setExtra('props', this.props)  // avoid sensitive data in production
      Sentry.captureException(error)
    })
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

// SENTRY-SPECIFIC: @sentry/react exports its own ErrorBoundary that does all of
// the above out of the box, plus automatic breadcrumb collection and replay:
import { ErrorBoundary as SentryBoundary } from '@sentry/react'

function App() {
  return (
    <SentryBoundary
      fallback={({ resetError }) => <ErrorPage onReset={resetError} />}
      beforeCapture={scope => scope.setTag('section', 'main')}
    >
      <App />
    </SentryBoundary>
  )
}
```
::

## Fallback UI Patterns

::code-wrapper{language="javascript" filename="fallback_patterns.js"}
```javascript
// PATTERN 1: Static fallback (simplest — for non-critical regions)
;<ErrorBoundary fallback={<p>Failed to load.</p>}>
  <Widget />
</ErrorBoundary>

// PATTERN 2: Null fallback (silently hide broken non-essential widgets)
;<ErrorBoundary fallback={null}>
  <AnalyticsWidget />
</ErrorBoundary>

// PATTERN 3: Interactive fallback with retry (critical regions)
;<ErrorBoundary
  fallback={(error, reset) => (
    <div role="alert" className="error-panel">
      <h3>Something went wrong</h3>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
      <button onClick={() => window.location.reload()}>Reload page</button>
    </div>
  )}
>
  <CriticalContent />
</ErrorBoundary>

// PATTERN 4: Render-prop fallback component (reusable, testable)
function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div role="alert" className="error-panel">
      <p>Couldn't load this: {error.message}</p>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  )
}

;<ErrorBoundary FallbackComponent={ErrorFallback}>
  <Content />
</ErrorBoundary>

// PATTERN 5: Context-aware fallback (access boundary state via render prop)
;<ErrorBoundary
  fallback={(error, reset) => {
    if (error.name === 'ChunkLoadError') {
      // A lazy-loaded chunk failed to load (network issue, new deploy) —
      // reloading the page fetches fresh chunks, usually fixing it.
      return (
        <div>
          <p>A new version is available. Reloading…</p>
        </div>
      )
    }
    return <GenericError error={error} onRetry={reset} />
  }}
>
  <App />
</ErrorBoundary>
```
::

## `react-error-boundary`: The Common Production Choice

::code-wrapper{language="javascript" filename="react_error_boundary.js"}
```javascript
// Because the class-component boilerplate is largely identical across projects,
// most production codebases use the `react-error-boundary` library — it wraps
// the same underlying class mechanism behind a function-component-friendly API,
// including a useErrorBoundary hook for triggering a boundary from event handlers.

import { ErrorBoundary, useErrorBoundary } from 'react-error-boundary'

function ProductPage({ productId }) {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, info) => logErrorToService(error, info.componentStack)}
      onReset={() => {
        // Called when resetErrorBoundary is invoked — use to reset any state
        // that might have contributed to the error before re-rendering children.
        queryClient.resetQueries()
      }}
      resetKeys={[productId]}  // auto-reset when productId changes
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

// useErrorBoundary: deliberately trigger a boundary from an event handler or
// async code — the one way to make a non-render-phase error reach a boundary.
function DeleteButton() {
  const { showBoundary } = useErrorBoundary()

  async function handleClick() {
    try {
      await api.deleteItem()
    } catch (err) {
      // This is inside an event handler (not caught by boundary normally) —
      // showBoundary manually pushes it to the nearest ancestor boundary,
      // triggering its fallback UI.
      showBoundary(err)
    }
  }
  return <button onClick={handleClick}>Delete</button>
}
```
::

## Production Error Recovery Strategy

::code-wrapper{language="javascript" filename="recovery_strategy.js"}
```javascript
// A complete production error recovery strategy layers multiple mechanisms:

// 1. App-level boundary: catches unexpected errors, shows full-page fallback
function App() {
  return (
    <ErrorBoundary
      FallbackComponent={FatalErrorFallback}
      onError={(e, info) => Sentry.captureException(e, { extra: info })}
    >
      <Router>
        <Routes />
      </Router>
    </ErrorBoundary>
  )
}

// 2. Route-level boundaries: one error in a route degrades only that route
function Routes() {
  return (
    <Routes>
      <Route path="/dashboard" element={
        <ErrorBoundary FallbackComponent={RouteErrorFallback}>
          <Dashboard />
        </ErrorBoundary>
      } />
      <Route path="/settings" element={
        <ErrorBoundary FallbackComponent={RouteErrorFallback}>
          <Settings />
        </ErrorBoundary>
      } />
    </Routes>
  )
}

// 3. Widget-level boundaries: non-critical widgets silently disappear
function Dashboard() {
  return (
    <div>
      <ErrorBoundary fallback={null}><AnalyticsChart /></ErrorBoundary>
      <ErrorBoundary fallback={<p>Feed unavailable</p>}>
        <ActivityFeed />
      </ErrorBoundary>
      <CriticalActions />  {/* no boundary — errors propagate to route boundary */}
    </div>
  )
}

// 4. Lazy-load boundaries: catch chunk loading errors (new deploy, bad network)
function LazyRoute() {
  return (
    <ErrorBoundary
      fallback={(error) => {
        if (error.name === 'ChunkLoadError') {
          return <ReloadPrompt />
        }
        return <GenericError error={error} />
      }}
    >
      <React.Suspense fallback={<Spinner />}>
        <LazyDashboard />
      </React.Suspense>
    </ErrorBoundary>
  )
}

// 5. Event handler errors: local try/catch + useErrorBoundary for deliberate
//    boundary triggering when local recovery isn't possible
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Idiom] Reach for `react-error-boundary` over a hand-rolled class in new
// projects — small, focused dependency, and the FallbackComponent/onReset/
// resetKeys/useErrorBoundary API covers reset-on-retry and manual-trigger
// needs that a bare class implementation requires hand-writing.

// [Idiom] Place boundaries at MEANINGFUL UI-region boundaries (a widget, a route,
// a card in a dashboard), not just at the app root — this keeps a rendering bug
// in one area from blanking an otherwise-functional page.

// [Debug] componentDidCatch's second argument, errorInfo.componentStack, is a
// string showing exactly which component tree the error propagated through —
// send this to your error service alongside the error. The plain JS stack trace
// alone often isn't enough to locate which INSTANCE of a reused component failed.

// [Idiom] When adding a "Try again" reset button, also change a `key` on the
// boundary tied to whatever input caused the failure — resetting hasError alone
// re-renders the same props that just threw, reproducing the identical error
// immediately if the cause wasn't transient.

// [Debug] To manually test a boundary's fallback UI during development, temporarily
// `throw` in a component's render body rather than relying on real error conditions
// to occur — reproducing the actual bug is often far more effort than verifying
// the boundary itself works.

// [Safety] Avoid putting sensitive data (tokens, PII) into error reports —
// componentDidCatch has access to this.props, but logging all props to an external
// service can leak user data. Filter or redact before sending.

// [Idiom] Use resetKeys prop (react-error-boundary) to auto-reset when relevant
// props change — e.g. resetKeys={[productId]} resets the boundary when the user
// navigates to a different product, without a manual "Try again" click.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] Error boundaries NEVER catch errors from event handlers, async code,
// setTimeout callbacks, or SSR — only render-phase, lifecycle, and constructor
// errors in the tree below. Everything else needs local try/catch or .catch().

// [Gotcha] A boundary CANNOT catch an error thrown within its OWN render method
// — the error propagates up to the NEXT boundary above it (or unmounts the tree
// if none). A top-level catch-all boundary still needs to exist even when
// granular boundaries are used elsewhere.

// [Gotcha] getDerivedStateFromError must be PURE — logging or reporting from
// inside it risks running multiple times (Strict Mode double-invocation in dev)
// or during a discarded render pass. Always use componentDidCatch for side effects.

// [Gotcha] Resetting a boundary's hasError state does NOT fix the underlying
// cause — if the error was caused by a prop that hasn't changed, clicking "reset"
// re-renders the same children with the same props, reproducing the identical
// error immediately. Use key-based remount or resetKeys to force a fresh state.

// [Gotcha] In development, React still logs errors caught by a boundary to the
// console (and may show an overlay) even though the fallback UI renders correctly
// — this is expected, not a sign the boundary failed. Production builds don't
// show the overlay.

// [Gotcha] componentDidCatch re-throws DO propagate to parent boundaries — but
// getDerivedStateFromError has already set hasError on the current boundary. If
// you re-throw from componentDidCatch, the parent boundary catches it, but the
// current boundary's state is already "errored" — the current boundary's fallback
// will NOT render (the re-throw bypasses it), only the parent's fallback shows.

// [Gotcha] Boundaries don't catch errors in non-React code — a Web Worker error,
// a WebSocket error, or a setTimeout callback error won't reach any boundary even
// if the callback was defined inside a component. Handle these at their source.

// [Gotcha] Lazy-loaded route components can throw ChunkLoadError when a new
// deploy invalidates old chunks — wrap Suspense in a boundary that detects
// ChunkLoadError and reloads the page to fetch fresh chunks.
```
::

## 🧠 Spot the Bug

A team wraps their whole app in an error boundary and is confused why a "network request failed" error from their data-fetching hook still crashes the page to a white screen instead of showing the fallback UI:

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
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

The `throw err` inside the `.catch()` happens **asynchronously**, inside a promise callback that runs long after the component's render phase has finished and committed. By the time it executes, React is not "in the middle of" rendering this component at all. Throwing there produces an **unhandled promise rejection** (visible in the console, and in some setups crashing the tab via the browser's unhandled-rejection behavior), but it never passes through React's error-boundary machinery, which only intercepts errors thrown **synchronously during render/lifecycle/constructor execution**.

**Fix**: handle the error at its source by setting local error state that the component reads during its next synchronous render:

```javascript
function useProduct(id) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null })

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    setState({ status: 'loading', data: null, error: null })
    fetch(`/api/products/${id}`, { signal: controller.signal })
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then(data => setState({ status: 'success', data, error: null }))
      .catch(err => {
        if (err.name !== 'AbortError') setState({ status: 'error', data: null, error: err })
      })
    return () => controller.abort()
  }, [id])

  return state
}
```

The lesson: error boundaries cannot catch asynchronous errors no matter how they're rethrown — async failures must be caught and handled at their actual source, typically by setting local error state that a component branches on during its next synchronous render.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. Error boundaries MUST be class components — getDerivedStateFromError and
//    componentDidCatch have no function-component equivalent. This is the one
//    deliberate, permanent exception to an all-function-components codebase.

// 2. getDerivedStateFromError (render phase, pure, returns state) triggers the
//    fallback. componentDidCatch (commit phase, impure, side effects) is for
//    logging. Never log inside getDerivedStateFromError.

// 3. Without any boundary, an uncaught render-phase error unmounts the ENTIRE
//    tree by design — leaving a corrupted UI is worse than showing nothing.

// 4. Boundaries catch ONLY render-phase, lifecycle, and constructor errors in
//    the tree below — NEVER event handlers, async code, setTimeout, or SSR.
//    Those need local try/catch or .catch() handled at the source.

// 5. Prefer several GRANULAR boundaries around independent UI regions over one
//    boundary at the app root — a failure in one widget shouldn't blank the
//    entire page. But always keep a top-level catch-all as a safety net.

// 6. componentDidCatch's errorInfo.componentStack is valuable debugging context
//    — send it to your error-reporting service alongside the raw error.

// 7. Resetting hasError alone re-throws if the cause (props/state) hasn't changed
//    — use key-based remount or react-error-boundary's resetKeys to force fresh state.

// 8. react-error-boundary wraps the class mechanism in a function-friendly API
//    and is the common production choice. Its useErrorBoundary hook can
//    deliberately trigger a boundary from event handlers/async code.

// 9. A complete recovery strategy layers: app-level → route-level → widget-level
//    boundaries, plus chunk-load-error handling for lazy routes, plus local
//    try/catch for event handlers.
```
::