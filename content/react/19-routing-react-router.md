---
title: "19 — Routing with React Router"
description: "React Router v6.4+ data-router API: createBrowserRouter, nested routes with Outlet, dynamic params, useNavigate, route protection, lazy-loaded routes with Suspense, useSearchParams, route loaders, actions, and error boundaries. Code-first reference for mid-to-senior React engineers."
---

# 19 — Routing with React Router

## Router Setup — createBrowserRouter + RouterProvider

::code-wrapper{language="javascript" filename="router_setup.js"}
```javascript
import { createBrowserRouter, RouterProvider } from 'react-router-dom'

// v6.4+ data router: single config object tree, rendered once at app root.
// The older <BrowserRouter>/<Routes>/<Route> JSX API still works but lacks
// loaders, actions, and automatic error boundaries — prefer the data router.
const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/about', element: <AboutPage /> },
  { path: '*', element: <NotFound /> },  // splat — matches anything unmatched
])

function App() {
  return <RouterProvider router={router} />
}
```
::

## Navigation — Link vs useNavigate

::code-wrapper{language="javascript" filename="navigation.js"}
```javascript
import { Link, NavLink, useNavigate } from 'react-router-dom'

function ProductCard({ product }) {
  const navigate = useNavigate()

  async function handlePurchase() {
    const order = await processOrder(product.id)
    // Imperative navigation — only after an async action completes.
    // Pass state for the destination to read via useLocation().
    navigate(`/orders/${order.id}`, { replace: true, state: { from: 'purchase' } })
  }

  return (
    <div>
      {/* <Link> preserves <a> affordances: middle-click, right-click, ctrl-click */}
      <Link to={`/products/${product.id}`}>{product.name}</Link>
      <button onClick={handlePurchase}>Buy Now</button>
    </div>
  )
}

// NavLink adds active-class styling via a render-prop or className function.
// `end` prevents prefix-matching: without it, to="/" matches EVERY route.
<NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
  Home
</NavLink>
```
::

## Dynamic Segments — useParams

::code-wrapper{language="javascript" filename="dynamic_params.js"}
```javascript
const router = createBrowserRouter([
  { path: '/products/:productId', element: <ProductDetail /> },
  // Multiple params: /users/:userId/posts/:postId
  { path: '/users/:userId/posts/:postId', element: <UserPost /> },
  // Optional splat: /files/* matches /files, /files/a, /files/a/b/c
  { path: '/files/*', element: <FileBrowser /> },
])

function ProductDetail() {
  const { productId } = useParams()
  // ALWAYS a string — /products/42 gives "42", not 42.
  // Common bug: if (productId === 42) — never true. Use Number(productId).
  const { data: product, status } = useFetch(`/api/products/${productId}`)
  if (status === 'loading') return <Spinner />
  if (status === 'error') return <ErrorState />
  return <h1>{product.name}</h1>
}

function FileBrowser() {
  const params = useParams()
  // Splat captures the rest of the path as params['*'] — e.g. "/files/a/b" → "a/b"
  const filePath = params['*'] || ''
  return <FileTree path={filePath} />
}
```
::

## Nested Routes and Layouts with Outlet

::code-wrapper{language="javascript" filename="nested_routes.js"}
```javascript
const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RootError />,  // catches errors from ALL children too
    children: [
      { index: true, element: <HomePage /> },           // matches "/" exactly
      { path: 'products', element: <ProductsPage /> },
      { path: 'products/:productId', element: <ProductDetail /> },
      {
        path: 'account',
        element: <AccountLayout />,                       // nested layout
        children: [
          { index: true, element: <AccountOverview /> },  // matches "/account"
          { path: 'orders', element: <OrderHistory /> },
          { path: 'settings', element: <AccountSettings /> },
        ],
      },
    ],
  },
])

// RootLayout renders once and NEVER unmounts while navigating between children.
// State, scroll position, open dropdowns, audio players — all persist.
import { Outlet, NavLink } from 'react-router-dom'

function RootLayout() {
  return (
    <div>
      <nav>
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/products">Products</NavLink>
        <NavLink to="/account">Account</NavLink>
      </nav>
      {/* Outlet = insertion point for whichever child route matched */}
      <main><Outlet /></main>
      <Footer />
    </div>
  )
}
```
::

## Route Loaders — Fetch Before Render

::code-wrapper{language="javascript" filename="loaders.js"}
```javascript
// Loaders run DURING navigation, before the route element renders.
// Data is available immediately via useLoaderData — no loading flash.
// This inverts fetch-on-mount: "navigate → fetch → render with data"
// instead of "navigate → render spinner → fetch → re-render with data."

const router = createBrowserRouter([
  {
    path: '/products/:productId',
    element: <ProductDetail />,
    loader: async ({ params, request }) => {
      // `request` is a Request object — has .url, .signal (AbortSignal), .headers
      // Use request.signal to cancel the fetch if the user navigates away mid-load.
      const res = await fetch(`/api/products/${params.productId}`, {
        signal: request.signal,
      })
      if (res.status === 404) {
        // Throwing a Response triggers the route's errorElement.
        // isRouteErrorResponse() returns true for thrown Response objects.
        throw new Response('Product not found', { status: 404 })
      }
      if (!res.ok) throw new Response('Server error', { status: 500 })
      return res.json()
    },
  },
])

function ProductDetail() {
  const product = useLoaderData()  // already resolved — no loading state needed
  return (
    <div>
      <h1>{product.name}</h1>
      <p>${product.price}</p>
    </div>
  )
}
```
::

### Loader with Parallel Fetches and Caching

::code-wrapper{language="javascript" filename="loader_parallel.js"}
```javascript
// Multiple independent fetches — run in parallel, not sequentially.
async function dashboardLoader({ params, request }) {
  const [user, orders, recommendations] = await Promise.all([
    fetch('/api/me', { signal: request.signal }).then(r => r.json()),
    fetch(`/api/users/${params.userId}/orders`, { signal: request.signal }).then(r => r.json()),
    fetch(`/api/users/${params.userId}/recs`, { signal: request.signal }).then(r => r.json()),
  ])
  return { user, orders, recommendations }
}

// Manual cache: React Router doesn't deduplicate loader calls across navigations.
// A simple cache layer helps avoid re-fetching on back/forward navigation.
const cache = new Map()

async function cachedProductLoader({ params, request }) {
  const key = params.productId
  if (cache.has(key)) {
    const cached = cache.get(key)
    if (Date.now() - cached.ts < 60_000) return cached.data  // 1-minute TTL
  }
  const res = await fetch(`/api/products/${key}`, { signal: request.signal })
  if (!res.ok) throw new Response('Error', { status: res.status })
  const data = await res.json()
  cache.set(key, { data, ts: Date.now() })
  return data
}
```
::

## Route Actions — Mutations

::code-wrapper{language="javascript" filename="actions.js"}
```javascript
// Actions handle form submissions / mutations. The data router automatically
// revalidates all active loaders after an action completes — no manual refetch.

const router = createBrowserRouter([
  {
    path: '/products/:productId/edit',
    element: <EditProduct />,
    action: async ({ params, request }) => {
      const formData = await request.formData()
      const res = await fetch(`/api/products/${params.productId}`, {
        method: 'PUT',
        body: JSON.stringify(Object.fromEntries(formData)),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        // Return errors as data (not throw) to show inline validation errors.
        return { errors: await res.json() }
      }
      return { success: true }  // triggers loader revalidation automatically
    },
  },
])

function EditProduct() {
  const product = useLoaderData()
  const actionData = useActionData()  // whatever the action returned
  const navigation = useNavigation()  // { state: 'idle' | 'submitting' | 'loading' }

  return (
    <Form method="post">
      <input name="name" defaultValue={product.name} />
      {actionData?.errors?.name && <p className="error">{actionData.errors.name}</p>}
      <button disabled={navigation.state !== 'idle'}>
        {navigation.state === 'submitting' ? 'Saving…' : 'Save'}
      </button>
    </Form>
  )
}
```
::

## Error Boundaries Per Route

::code-wrapper{language="javascript" filename="error_boundaries.js"}
```javascript
import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom'

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RootError />,      // catches errors from layout + all children
    children: [
      { path: 'products/:productId', element: <ProductDetail />, loader: productLoader,
        errorElement: <ProductError />,  // scoped — only catches this route's errors
      },
    ],
  },
])

function ProductError() {
  const error = useRouteError()

  if (isRouteErrorResponse(error)) {
    // Thrown Response objects have .status, .statusText, .data
    if (error.status === 404) return <p>Product not found. <Link to="/products">Browse all</Link></p>
    if (error.status === 401) return <p>Please log in.</p>
    return <p>{error.status}: {error.statusText}</p>
  }
  // A plain Error thrown during render or in a loader — no .status.
  if (error instanceof Error) return <p>Unexpected: {error.message}</p>
  return <p>Unknown error.</p>
}
```
::

## Protected Routes

::code-wrapper{language="javascript" filename="protected_routes.js"}
```javascript
import { Navigate, Outlet, useLocation } from 'react-router-dom'

// THREE-STATE auth check — loading, authenticated, unauthenticated.
// Two-state (user | null) causes a flash redirect for logged-in users
// because `null` means "haven't checked yet" AND "confirmed logged out."
function RequireAuth() {
  const { user, status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullScreenSpinner />
  if (status === 'unauthenticated') {
    // `replace` overwrites history so back-button doesn't re-trigger the redirect.
    // `state.from` lets LoginPage redirect back after successful login.
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return <Outlet />  // user is confirmed authenticated — render children
}

function RequireRole({ role }) {
  const { user } = useAuth()
  if (!user.roles.includes(role)) return <Navigate to="/forbidden" replace />
  return <Outlet />
}

const router = createBrowserRouter([
  {
    element: <RequireAuth />,
    children: [
      { path: '/dashboard', element: <Dashboard /> },
      {
        element: <RequireRole role="admin" />,
        children: [
          { path: '/admin', element: <AdminPanel /> },
          { path: '/admin/users', element: <UserManagement /> },
        ],
      },
    ],
  },
  { path: '/login', element: <LoginPage /> },
])

function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/dashboard'

  async function handleLogin(credentials) {
    await login(credentials)
    navigate(from, { replace: true })  // go back to where the user was trying to go
  }
  return <LoginForm onSubmit={handleLogin} />
}
```
::

## Lazy Loading Routes with Suspense

::code-wrapper{language="javascript" filename="lazy_routes.js"}
```javascript
import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'

// Each lazy() call creates a separate JS chunk — users only download
// the code for routes they actually visit.
const HomePage = lazy(() => import('./pages/HomePage'))
const ProductsPage = lazy(() => import('./pages/ProductsPage'))
const ProductDetail = lazy(() => import('./pages/ProductDetail'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const AdminPanel = lazy(() => import('./pages/AdminPanel'))

const PageSpinner = () => <div className="spinner">Loading…</div>

const router = createBrowserRouter([
  {
    path: '/',
    element: <Suspense fallback={<PageSpinner />}><HomePage /></Suspense>,
  },
  {
    path: '/products',
    element: <Suspense fallback={<PageSpinner />}><ProductsPage /></Suspense>,
  },
  {
    path: '/products/:productId',
    element: <Suspense fallback={<PageSpinner />}><ProductDetail /></Suspense>,
    loader: productLoader,  // loader runs in parallel with chunk download
  },
  {
    path: '/settings',
    element: <Suspense fallback={<PageSpinner />}><SettingsPage /></Suspense>,
  },
  // Admin chunk is never downloaded by non-admin users at all.
  {
    path: '/admin',
    element: <Suspense fallback={<PageSpinner />}><AdminPanel /></Suspense>,
  },
])

function App() {
  return <RouterProvider router={router} />
}
```
::

### Lazy Routes with Shared Suspense Boundary

::code-wrapper{language="javascript" filename="lazy_shared_suspense.js"}
```javascript
// One Suspense boundary wrapping a layout + all its lazy children —
// the fallback shows for the FIRST lazy child to load, then children
// swap in as their chunks arrive. Simpler than per-route Suspense.
const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <RootLayout>
        <Suspense fallback={<PageSpinner />}>
          <Outlet />
        </Suspense>
      </RootLayout>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'products', element: <ProductsPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
])

// ANTI-PATTERN: wrapping <Outlet> in Suspense inside a layout that ALSO
// has non-lazy content — the spinner replaces the entire outlet area,
// including any persisted layout state, on every lazy route load.
```
::

## Search Params — useSearchParams

::code-wrapper{language="javascript" filename="search_params.js"}
```javascript
import { useSearchParams } from 'react-router-dom'

// Mirrors useState's tuple API but syncs to the URL query string.
// State in the URL = shareable, bookmarkable, refresh-surviving.
function ProductList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const sort = searchParams.get('sort') || 'relevance'
  const page = Number(searchParams.get('page')) || 1
  const filter = searchParams.get('filter')  // null if not present

  function handleSortChange(newSort) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('sort', newSort)
      next.set('page', '1')  // reset pagination when sort changes
      return next
    })
  }

  function handleFilterChange(key, value) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)  // remove param when filter cleared
      return next
    })
  }

  return (
    <div>
      <select value={sort} onChange={e => handleSortChange(e.target.value)}>
        <option value="relevance">Relevance</option>
        <option value="price">Price</option>
      </select>
      <ProductGrid sort={sort} page={page} filter={filter} />
    </div>
  )
}

// ANTI-PATTERN: calling setSearchParams on every keystroke without debouncing —
// floods browser history with one entry per character. Use a local useState
// for the input + debounce into setSearchParams (see Ch 11 useDebounce).
function SearchInput() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [localQuery, setLocalQuery] = useState(searchParams.get('q') || '')
  const debouncedQuery = useDebounce(localQuery, 300)

  useEffect(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (debouncedQuery) next.set('q', debouncedQuery)
      else next.delete('q')
      return next
    }, { replace: true })  // replace: don't spam history entries
  }, [debouncedQuery])

  return <input value={localQuery} onChange={e => setLocalQuery(e.target.value)} />
}
```
::

## Complex Implementation — Full App Router

::code-wrapper{language="javascript" filename="full_router.js"}
```javascript
import {
  createBrowserRouter, RouterProvider, Outlet, Link, NavLink,
  useLoaderData, useActionData, useNavigation, useRouteError,
  isRouteErrorResponse, Navigate, useLocation, useSearchParams,
} from 'react-router-dom'
import { lazy, Suspense } from 'react'

// --- Lazy page chunks ---
const HomePage = lazy(() => import('./pages/Home'))
const ProductList = lazy(() => import('./pages/ProductList'))
const ProductDetail = lazy(() => import('./pages/ProductDetail'))
const Checkout = lazy(() => import('./pages/Checkout'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))

const Spinner = () => <div className="spinner" />

// --- Loaders ---
async function productsLoader({ request }) {
  const res = await fetch('/api/products', { signal: request.signal })
  if (!res.ok) throw new Response('Failed to load products', { status: res.status })
  return res.json()
}

async function productDetailLoader({ params, request }) {
  const res = await fetch(`/api/products/${params.productId}`, { signal: request.signal })
  if (res.status === 404) throw new Response('Not found', { status: 404 })
  if (!res.ok) throw new Response('Server error', { status: 500 })
  return res.json()
}

// --- Actions ---
async function checkoutAction({ request }) {
  const formData = await request.formData()
  const res = await fetch('/api/checkout', {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) return { error: 'Checkout failed' }
  const order = await res.json()
  return { order }  // component reads via useActionData, then navigates
}

// --- Layouts ---
function RootLayout() {
  return (
    <div>
      <nav>
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/products">Products</NavLink>
      </nav>
      <main><Outlet /></main>
    </div>
  )
}

function AdminLayout() {
  return (
    <div>
      <aside><AdminSidebar /></aside>
      <main><Outlet /></main>
    </div>
  )
}

// --- Auth Guards ---
function RequireAuth() {
  const { user, status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <Spinner />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return <Outlet />
}

function RequireAdmin() {
  const { user } = useAuth()
  if (user?.role !== 'admin') return <Navigate to="/forbidden" replace />
  return <Outlet />
}

// --- Error Boundaries ---
function RootError() {
  const error = useRouteError()
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) return <NotFoundPage />
    return <ServerErrorPage status={error.status} message={error.statusText} />
  }
  return <UnexpectedErrorPage error={error} />
}

// --- Full Router Config ---
const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RootError />,
    children: [
      { index: true, element: <Suspense fallback={<Spinner />}><HomePage /></Suspense> },
      {
        path: 'products',
        element: <Suspense fallback={<Spinner />}><ProductList /></Suspense>,
        loader: productsLoader,
      },
      {
        path: 'products/:productId',
        element: <Suspense fallback={<Spinner />}><ProductDetail /></Suspense>,
        loader: productDetailLoader,
      },
      {
        path: 'checkout',
        element: <Suspense fallback={<Spinner />}><Checkout /></Suspense>,
        action: checkoutAction,
      },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <RequireAdmin />,
        children: [
          {
            path: '/admin',
            element: <AdminLayout />,
            children: [
              { index: true, element: <Suspense fallback={<Spinner />}><AdminDashboard /></Suspense> },
            ],
          },
        ],
      },
    ],
  },
  { path: '/login', element: <LoginPage /> },
])

export default function App() {
  return <RouterProvider router={router} fallbackElement={<Spinner />} />
}
```
::

## Anti-Pattern — Common Routing Mistakes

::code-wrapper{language="javascript" filename="anti_patterns.js"}
```javascript
// ANTI-PATTERN: BrowserRouter with deeply nested <Routes> everywhere
// instead of a single config. Scattered route definitions, no loaders,
// no error boundaries, no data revalidation.
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<Products />}>
          <Route path=":id" element={<Detail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
// This works but loses: loaders, actions, errorElement, useLoaderData,
// automatic revalidation, typed routes, and the developer experience
// of a single route config tree. Use createBrowserRouter.

// ANTI-PATTERN: Comparing useParams to a number
if (productId === 42) { /* never true — productId is "42" */ }
// Fix: if (Number(productId) === 42) { /* works */ }

// ANTI-PATTERN: Fetching inside useEffect when a loader exists
function ProductDetail() {
  const { productId } = useParams()
  const [product, setProduct] = useState(null)
  useEffect(() => {
    fetch(`/api/products/${productId}`).then(r => r.json()).then(setProduct)
  }, [productId])  // loading flash on every navigation, no abort, race conditions
  if (!product) return <Spinner />
  return <h1>{product.name}</h1>
}
// Fix: use a loader — data available before render, no flash, built-in abort.

// ANTI-PATTERN: <Navigate> without replace in auth guards
if (!user) return <Navigate to="/login" />
// Back button -> protected page -> redirect -> /login -> loop. Always use replace.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Idiom] Use <Link>/<NavLink> for direct-click navigation; useNavigate for
// navigation as a side effect (after form submit, async completion). Mixing
// them inconsistently breaks middle-click/right-click browser affordances.

// [Idiom] Prefer loaders over useEffect-fetch for data a page MUST have to
// render. Removes the loading-flash class of UX issues entirely and sidesteps
// fetch-on-mount race conditions (Ch 17). The loader's request.signal handles
// abort automatically when the user navigates away mid-load.

// [Idiom] Store filter/sort/pagination state in the URL via useSearchParams —
// shareable, bookmarkable, refresh-surviving. Local useState for the same
// state is lost on refresh and can't be shared via a URL.

// [Debug] useNavigate(-1) / useNavigate(1) navigate browser history — but
// only works if there IS history to go back to. On a direct entry (user
// typed the URL or opened a link), there's no previous entry. Use
// navigate(location.state?.from || '/default') as a fallback.

// [Idiom] Use { replace: true } on setSearchParams for transient state
// (search-as-you-type) to avoid flooding browser history with one entry
// per keystroke. Use default (push) for discrete state changes (page
// navigation, filter application).

// [Performance] lazy() + Suspense at route boundaries is the highest-leverage
// code split — users only download code for routes they visit. The loader
// runs in parallel with the chunk download, so data + code arrive together.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] useParams values are ALWAYS strings. /products/42 -> "42".
// Comparing productId === 42 (number) is never true. Use Number(productId).

// [Gotcha] A nested layout's parent element does NOT remount when navigating
// between children — state, scroll position, and open UI persist by design.
// If you need a "clean slate" on each child, move that state into the child.

// [Gotcha] <NavLink to="/"> without `end` matches EVERY route (every path
// starts with /). Always add `end` to root or exact-match NavLinks.

// [Gotcha] Loaders re-run on back/forward browser navigation, not just
// forward navigation. A loader with side effects (analytics, logging) fires
// far more often than a useEffect-based approach would.

// [Gotcha] isRouteErrorResponse() returns true ONLY for thrown Response
// objects. A thrown plain Error has no .status — handle it separately
// in the same errorElement.

// [Gotcha] setSearchParams on every keystroke floods browser history.
// Use local state + debounce + setSearchParams({ replace: true }) for
// search-as-you-type patterns.

// [Gotcha] useSearchParams().get('key') returns null if the param is
// absent, NOT an empty string. Falsy checks like `if (searchParams.get('q'))`
// work, but `searchParams.get('q').length` throws on null — guard it.

// [Gotcha] Lazy-loaded routes without a Suspense ancestor throw at runtime,
// not merely warn. Every lazy() component needs a <Suspense> somewhere
// above it in the tree, or the app crashes on first load of that route.

// [Gotcha] The `request.signal` in a loader is aborted when the user
// navigates away. If you ignore it (don't pass it to fetch), the fetch
// completes in the background and you may get an unhandled rejection
// if the response handling code runs after the route unmounted.
```
::

## 🧠 Spot the Bug

A product detail page uses a loader to fetch data, but navigating between products (`/products/1` → `/products/2`) shows the OLD product's data briefly before updating.

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
```javascript
function ProductDetail() {
  const product = useLoaderData()
  return (
    <div>
      <h1>{product.name}</h1>
      <p>{product.description}</p>
    </div>
  )
}

// The loader:
async function productLoader({ params }) {
  const res = await fetch(`/api/products/${params.productId}`)
  return res.json()
}
```
::

<details>
<summary>Answer</summary>

`useLoaderData` returns the data from the **most recent completed navigation's** loader. When navigating from `/products/1` to `/products/2`, React Router starts the new loader, but the `ProductDetail` component is still mounted with the **old** data until the new loader resolves. During that window, the component renders with `product` still pointing to product 1's data — a stale flash.

**Fix**: Use `useNavigation()` to detect when a loader is in-flight and show a loading indicator or disable the content:

```javascript
function ProductDetail() {
  const product = useLoaderData()
  const navigation = useNavigation()
  // navigation.state is 'loading' while the new loader runs
  if (navigation.state === 'loading') return <Spinner />
  return <h1>{product.name}</h1>
}
```

Alternatively, wrap the route in `<Suspense>` so React Router shows the fallback during the loader fetch instead of stale content.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. createBrowserRouter + <RouterProvider> is the recommended v6.4+ API —
//    supports loaders, actions, errorElement, and automatic revalidation.
//    The older <BrowserRouter>/<Routes> JSX API lacks these features.

// 2. <Link>/<NavLink> for direct-click navigation (preserves <a> affordances);
//    useNavigate for imperative navigation after an action completes.
//    Always use { replace: true } on auth-redirect <Navigate> to avoid
//    back-button redirect loops.

// 3. Nested routes + <Outlet> = persistent layouts that don't remount
//    between child navigations. State, scroll position, and UI persist.

// 4. Loaders fetch data BEFORE the route renders — no loading flash,
//    automatic abort via request.signal, and data ready via useLoaderData.
//    Actions handle mutations and automatically revalidate active loaders.

// 5. Protected routes need THREE auth states: loading, authenticated,
//    unauthenticated. Two-state (user | null) flashes a redirect for
//    every logged-in user during the initial async check.

// 6. lazy() + Suspense at route boundaries = highest-leverage code split.
//    The chunk download runs in parallel with the loader — data + code
//    arrive together. Every lazy route needs a Suspense ancestor.

// 7. useSearchParams for shareable/refresh-surviving view state (filters,
//    sort, pagination). Debounce + { replace: true } for search-as-you-type
//    to avoid flooding browser history with per-keystroke entries.
```
::
