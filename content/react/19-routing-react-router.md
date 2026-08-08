# 19 — Routing with React Router

React itself has no concept of URLs, navigation, or pages — every earlier chapter's examples run as a single, unrouted tree. **React Router** is the de facto standard library that maps URLs to component trees, and this chapter covers its data-router API (the current recommended approach) from basic routes through nested layouts, dynamic segments, protected routes, and data loading.

## Setting Up a Router

React Router v6.4+'s recommended API builds a route tree with `createBrowserRouter`, then renders it with a single `<RouterProvider>` at the app's root — a departure from the purely component-based `<BrowserRouter>`/`<Routes>`/`<Route>` nesting of earlier versions, though that older API still works and appears in many existing codebases.

::code-wrapper{language="javascript"}
```javascript
import { createBrowserRouter, RouterProvider } from 'react-router-dom'

const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/about', element: <AboutPage /> },
  { path: '/products', element: <ProductsPage /> },
])

function App() {
  return <RouterProvider router={router} />
}
```
::

## Navigation: `Link` and `useNavigate`

Regular `<a href>` tags trigger a full page reload — defeating the point of a single-page app. React Router's `<Link>` intercepts the click and updates the URL/tree client-side instead, and `useNavigate` provides the same behavior imperatively, for navigation triggered by code rather than a direct click.

::code-wrapper{language="javascript"}
```javascript
import { Link, useNavigate } from 'react-router-dom'

function ProductCard({ product }) {
  const navigate = useNavigate()

  function handlePurchase() {
    processOrder(product.id).then(() => navigate('/order-confirmation'))
  }

  return (
    <div>
      <Link to={`/products/${product.id}`}>{product.name}</Link>
      <button onClick={handlePurchase}>Buy Now</button>
    </div>
  )
}
```
::

`<Link>` is the right choice whenever navigation *is* the direct result of a click (also giving users the native browser affordances of `<a>` — middle-click to open in a new tab, right-click to copy link — for free); `useNavigate` is for navigation that happens as a *consequence* of some other action completing, like a successful form submission or an async operation.

## Dynamic Segments and `useParams`

A route path segment prefixed with `:` captures that portion of the URL as a named parameter, read inside the matched component via `useParams`.

::code-wrapper{language="javascript"}
```javascript
const router = createBrowserRouter([
  { path: '/products/:productId', element: <ProductDetail /> },
])
```
::

::code-wrapper{language="javascript"}
```javascript
import { useParams } from 'react-router-dom'

function ProductDetail() {
  const { productId } = useParams()
  // productId is always a string, even if the URL segment looks numeric — /products/42 gives "42"
  const { data: product, status } = useFetch(`/api/products/${productId}`)

  if (status === 'loading') return <Spinner />
  return <h1>{product.name}</h1>
}
```
::

## Nested Routes and Layouts

Real applications almost always share layout (navigation, sidebars, footers) across many pages — React Router's nested-route configuration renders a parent route's element as a persistent shell, with `<Outlet />` marking where the matched child route's content is inserted.

::code-wrapper{language="javascript"}
```javascript
const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'products', element: <ProductsPage /> },
      { path: 'products/:productId', element: <ProductDetail /> },
      { path: 'account', element: <AccountLayout />, children: [
        { index: true, element: <AccountOverview /> },
        { path: 'orders', element: <OrderHistory /> },
        { path: 'settings', element: <AccountSettings /> },
      ]},
    ],
  },
])
```
::

::code-wrapper{language="javascript"}
```javascript
import { Outlet, NavLink } from 'react-router-dom'

function RootLayout() {
  return (
    <div>
      <nav>
        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>Home</NavLink>
        <NavLink to="/products">Products</NavLink>
        <NavLink to="/account">Account</NavLink>
      </nav>
      {/* Outlet renders whichever child route matched the current URL —
          RootLayout itself never unmounts while navigating between children */}
      <Outlet />
    </div>
  )
}
```
::

Because `RootLayout` doesn't unmount when navigating between `/`, `/products`, and `/account`, any state or DOM inside it (a persistent audio player, an open dropdown, scroll position of a sidebar) survives navigation — a meaningfully different (and usually desired) experience compared to a routing setup where the whole page remounts on every navigation. `index: true` marks the child route that renders at the parent's own path with nothing appended (`/` itself, or `/account` itself) — the nested-routing equivalent of a default case. `NavLink`'s `isActive` render-prop-style `className` function is what lets navigation UI highlight the current page without manually comparing the URL yourself; the `end` prop on the `/` link prevents it from also matching (and highlighting) every other route, since without `end`, `/` is technically a prefix of every path.

## Data Loaders: Fetching Before Rendering

React Router's data routers support a `loader` function per route, run *before* the route's element renders — data is available immediately via `useLoaderData`, rather than the component mounting first and then triggering its own fetch inside a `useEffect` (chapter 17's pattern).

::code-wrapper{language="javascript"}
```javascript
const router = createBrowserRouter([
  {
    path: '/products/:productId',
    element: <ProductDetail />,
    loader: async ({ params }) => {
      const res = await fetch(`/api/products/${params.productId}`)
      if (!res.ok) throw new Response('Not Found', { status: 404 })
      return res.json()
    },
  },
])
```
::

::code-wrapper{language="javascript"}
```javascript
import { useLoaderData } from 'react-router-dom'

function ProductDetail() {
  // No loading state needed here at all — React Router doesn't render this component
  // until the loader's promise has already resolved.
  const product = useLoaderData()
  return <h1>{product.name}</h1>
}
```
::

This inverts the usual fetch-on-mount flow: instead of "render, then fetch, then re-render with data" (a visible loading flash for every navigation), the loader runs during navigation itself, and the new page's content appears already populated — closer to how traditional server-rendered navigation feels, while remaining a client-side single-page app underneath. A `loader` throwing a `Response` (as shown, for a `404`) is caught by the route's `errorElement`, covered next.

## Error Handling Per Route

A route can declare an `errorElement`, rendered in place of the normal `element` whenever that route's loader/action throws, or the route's own rendering throws — effectively an error boundary (chapter 16) scoped specifically to routing failures.

::code-wrapper{language="javascript"}
```javascript
import { useRouteError, isRouteErrorResponse } from 'react-router-dom'

const router = createBrowserRouter([
  {
    path: '/products/:productId',
    element: <ProductDetail />,
    loader: productLoader,
    errorElement: <ProductError />,
  },
])

function ProductError() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <p>That product doesn't exist.</p>
  }
  return <p>Something went wrong loading this product.</p>
}
```
::

## Protected Routes

React Router has no built-in "auth guard" concept — protected routes are implemented as a wrapper component checking auth state and either rendering the intended content or redirecting, using `<Navigate>` for a declarative redirect during render.

::code-wrapper{language="javascript"}
```javascript
import { Navigate, Outlet, useLocation } from 'react-router-dom'

function RequireAuth() {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    // Preserve the attempted destination in state, so login can redirect back afterward
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return <Outlet />
}

const router = createBrowserRouter([
  {
    element: <RequireAuth />,
    children: [
      { path: '/dashboard', element: <Dashboard /> },
      { path: '/settings', element: <Settings /> },
    ],
  },
  { path: '/login', element: <LoginPage /> },
])
```
::

`RequireAuth` uses the same nested-route-plus-`<Outlet>` mechanism as layouts — a parentless route element that guards every one of its children, running the auth check exactly once per navigation into that subtree rather than duplicated in every protected page. `replace` on `<Navigate>` replaces the current history entry instead of pushing a new one, so clicking the browser's back button from `/login` doesn't return to the protected page that just redirected away (which would immediately redirect again, creating a confusing back-button loop).

::code-wrapper{language="javascript"}
```javascript
function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/dashboard'

  async function handleLogin(credentials) {
    await login(credentials)
    navigate(from, { replace: true })
  }

  return <LoginForm onSubmit={handleLogin} />
}
```
::

## Query Parameters with `useSearchParams`

Path segments (`:productId`) capture required, structural parts of a URL; query strings (`?sort=price&page=2`) suit optional, order-independent parameters like filters and pagination, read and updated via `useSearchParams` — an API deliberately mirroring `useState`'s tuple shape.

::code-wrapper{language="javascript"}
```javascript
import { useSearchParams } from 'react-router-dom'

function ProductList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const sort = searchParams.get('sort') || 'relevance'
  const page = Number(searchParams.get('page')) || 1

  function handleSortChange(newSort) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('sort', newSort)
      next.set('page', '1') // reset pagination whenever sort criteria changes
      return next
    })
  }

  return (
    <div>
      <select value={sort} onChange={e => handleSortChange(e.target.value)}>
        <option value="relevance">Relevance</option>
        <option value="price">Price</option>
      </select>
      <ProductGrid sort={sort} page={page} />
    </div>
  )
}
```
::

Storing sort/page state in the URL rather than local `useState` means the current view is shareable (copy-pasting the URL reproduces the exact same filtered/sorted/paginated state for someone else) and survives a page refresh — a meaningful UX property plain component state can't provide.

## 💡 Tips & Tricks

- **Idiom** — Use `<Link>`/`<NavLink>` for anything a user directly clicks to navigate, and `useNavigate` only for navigation that's a *side effect* of something else completing (a submitted form, a finished async action) — mixing the two inconsistently makes middle-click/right-click browser affordances unpredictable across an app.
- **Idiom** — Prefer route `loader` functions over `useEffect`-based fetching for data a page fundamentally needs to render at all — it removes an entire class of "flash of loading spinner on every navigation" UX and sidesteps the race-condition concerns from chapter 17 for the common "fetch on mount" case specifically.
- **Idiom** — Store filter/sort/pagination state in the URL via `useSearchParams` rather than local component state whenever the current view should be shareable, bookmarkable, or survive a refresh.
- **Debug** — `useParams()` values are always strings, even for path segments that look numeric — a common bug is comparing `productId === 42` (a number) against a `useParams` value, which is always `"42"` (a string) and never strictly equal to the number.
- **Idiom** — Always pair `<Navigate replace>` with redirect-on-auth-failure logic — omitting `replace` leaves the protected route in browser history, so the back button re-triggers the redirect instead of navigating further back as a user would expect.

## ⚠️ Edge Cases & Gotchas

- **A nested layout route's parent element does not remount when navigating between its children** — state, open dropdowns, and scroll position inside a shared layout persist across child-route navigation by design; this is usually desired but surprises developers expecting a full "new page" reset on every navigation.
- **A route with no `end` prop on `NavLink` matches as active for every path that starts with it** — `<NavLink to="/">` without `end` shows as active on every single route in the app, since every path technically starts with `/`; add `end` to any link meant to match only its exact path.
- **`loader` functions run on every navigation to that route, including back/forward browser navigation** — a loader with a side effect beyond fetching (analytics tracking, for instance) fires far more often than a component-mount-based `useEffect` would, since browser history navigation re-runs loaders without necessarily remounting the whole component tree.
- **Throwing inside a `loader` is caught by `errorElement`, but a plain `throw new Error(...)` and `throw new Response(...)` are handled differently** — `isRouteErrorResponse` only returns `true` for thrown `Response` objects (with a real `.status`); a thrown plain `Error` has no `.status` and needs separate handling in the same `errorElement` component.
- **`useSearchParams`'s setter, like `useState`'s, triggers a re-render and a URL change on every call** — building a search-as-you-type filter directly against `setSearchParams` on every keystroke without debouncing floods the browser's history/URL-bar update mechanism far more aggressively than updating local state would, and can feel janky as the address bar visibly rewrites on every character.

## 🧠 Spot the Bug

A protected `/dashboard` route redirects to `/login` correctly for logged-out users, but logged-in users who refresh the page on `/dashboard` are also incorrectly bounced to `/login` for a brief flash before the dashboard finally appears.

::code-wrapper{language="javascript"}
```javascript
function useAuth() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    fetchCurrentUser().then(setUser)
  }, [])

  return { user }
}

function RequireAuth() {
  const { user } = useAuth()
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
```
::

<details>
<summary>Answer</summary>

`useAuth`'s `user` state starts as `null` and only becomes populated once `fetchCurrentUser()` resolves, asynchronously, after the component has already rendered at least once. `RequireAuth` treats `user === null` as "not authenticated" unconditionally — but `null` here actually means two different things at two different times: "we haven't checked yet" (initial render, before the fetch resolves) and "we checked, and there is no user" (fetch resolved with no session). Every logged-in user hits the redirect during that brief initial window before the auth check completes, exactly the flash described.

**The lesson**: an auth hook needs a third, explicit state — typically `status: 'loading' | 'authenticated' | 'unauthenticated'` (chapter 12's guard-clause pattern) — so a protected route can render a loading state while the check is pending, and only redirect once the check has *definitively* resolved to "no user," rather than treating "not yet known" the same as "confirmed absent."

</details>

## Key Takeaways

- React Router's data-router API (`createBrowserRouter` + `<RouterProvider>`) is the current recommended approach, supporting nested routes, loaders, and per-route error boundaries in one configuration.
- `<Link>`/`<NavLink>` handle direct-click navigation with native browser affordances intact; `useNavigate` handles navigation as a side effect of some other completed action.
- Nested routes with `<Outlet>` let a shared layout persist across child-route navigation without remounting — state and scroll position inside it survive.
- Route `loader` functions fetch data before a route renders, eliminating the fetch-on-mount loading flash and sidestepping many of chapter 17's race conditions for that specific use case.
- Protected routes are implemented as a wrapper component checking auth state and using `<Navigate replace>` to redirect — always distinguish "auth check pending" from "confirmed unauthenticated" to avoid flashing a redirect for legitimately logged-in users.
- Query parameters via `useSearchParams` are the right place for shareable, bookmarkable, refresh-surviving view state like filters, sort order, and pagination — path segments suit required, structural identifiers instead.
