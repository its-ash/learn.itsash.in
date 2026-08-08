# 22 — Server Components and SSR

Every prior chapter assumed a component runs in the browser: it renders, it can hold state, it can attach event handlers, and its code ships to the client as part of the JavaScript bundle. **React Server Components (RSC)** break that assumption — a server component renders exclusively on the server, never ships its code to the browser at all, and cannot hold state or attach event handlers. This chapter covers what RSC actually is, how it differs from the traditional server-side rendering (SSR) React has supported since version 16, and the client/server boundary rules that trip up most newcomers.

## SSR vs. RSC: Two Different Problems

Traditional SSR (via `renderToString`/`renderToPipeableStream` in `react-dom/server`) solves a narrower problem than RSC, and conflating the two is the most common source of confusion in this area.

**Server-side rendering** takes an ordinary React component tree — the same components that would otherwise render only in the browser — and renders it to an HTML string on the server for the initial page load, so the user sees content immediately instead of a blank page while JavaScript downloads and executes. Critically, the *same component code* still ships to the browser afterward, because the page needs to **hydrate**: React re-runs those components client-side, attaching event listeners to the server-rendered HTML so the page becomes interactive.

::code-wrapper{language="javascript"}
```javascript
// Traditional SSR: this component's code ships to the browser regardless —
// SSR only changes WHEN it first renders (server, for initial HTML), not WHETHER
// its code is part of the client bundle.
function ProductCard({ product }) {
  const [isFavorited, setIsFavorited] = useState(false)
  return (
    <div onClick={() => setIsFavorited(f => !f)}>
      {product.name} {isFavorited ? '♥' : '♡'}
    </div>
  )
}
```
::

**React Server Components** solve a different problem: reducing the amount of code and data that ever needs to reach the browser in the first place. A server component's code — its imports, its logic, any heavy dependencies it pulls in — never becomes part of the client JavaScript bundle at all. It runs once on the server, produces a description of UI (not HTML, and not JSX — a special serialized format), and that description streams to the client alongside whatever client components are interspersed in the tree.

::code-wrapper{language="javascript"}
```javascript
// A Server Component (no 'use client' directive) — runs ONLY on the server.
// Can be async directly, can query a database or read the filesystem,
// and none of this code — including the `db` import — reaches the browser bundle.
import { db } from './db'

async function ProductList({ categoryId }) {
  const products = await db.products.findMany({ where: { categoryId } })
  return (
    <ul>
      {products.map(p => <ProductListItem key={p.id} product={p} />)}
    </ul>
  )
}
```
::

The practical difference: SSR is about *when* rendering first happens (server first, then the browser takes over via hydration); RSC is about *where* a component's code lives permanently (some components never leave the server, ever). A framework can use both together, which is exactly what Next.js's App Router does by default.

## The Client/Server Boundary

React Server Components require every component to be classified as either a **server component** (the default, no directive needed) or a **client component** (opted into with a `'use client'` directive at the top of the file). The two have fundamentally different capabilities.

::code-wrapper{language="javascript"}
```javascript
// ProductPage.js — Server Component (default, no directive)
// Can: be async, fetch data directly, access server-only resources (databases, file system, secrets)
// Cannot: use useState/useEffect/any hook that requires the browser, attach event handlers, use browser APIs
import { db } from './db'
import AddToCartButton from './AddToCartButton'

export default async function ProductPage({ productId }) {
  const product = await db.products.findUnique({ where: { id: productId } })
  return (
    <div>
      <h1>{product.name}</h1>
      <p>${product.price}</p>
      {/* Interactivity is delegated to a client component — server components
          cannot attach onClick handlers themselves */}
      <AddToCartButton productId={product.id} />
    </div>
  )
}
```
::

::code-wrapper{language="javascript"}
```javascript
// AddToCartButton.js — Client Component (explicit opt-in required)
'use client'

import { useState } from 'react'

export default function AddToCartButton({ productId }) {
  const [isAdding, setIsAdding] = useState(false)

  async function handleClick() {
    setIsAdding(true)
    await fetch('/api/cart', { method: 'POST', body: JSON.stringify({ productId }) })
    setIsAdding(false)
  }

  return <button onClick={handleClick} disabled={isAdding}>{isAdding ? 'Adding…' : 'Add to Cart'}</button>
}
```
::

`'use client'` doesn't mean "this component only renders on the client" — a client component still participates in SSR for the initial page load, same as any pre-RSC React component always has. It means "this component's code is allowed to run in the browser, and therefore must be included in the client bundle" — which is also the only way to use `useState`, `useEffect`, event handlers, or any browser-only API (`window`, `localStorage`) at all.

## The Boundary Only Goes One Direction

A server component can import and render a client component directly — that's the `ProductPage`/`AddToCartButton` example above. The reverse is not allowed: a client component cannot import a server component, because once you're inside client-component code, everything it imports must also be safe to ship to the browser, and server components frequently aren't (they may import database clients, filesystem APIs, or secrets that must never reach client JavaScript).

::code-wrapper{language="javascript"}
```javascript
// BROKEN: a client component cannot import a server component directly
'use client'
import ProductReviews from './ProductReviews' // ProductReviews is a server component — this fails

function ProductDetailClient({ productId }) {
  const [tab, setTab] = useState('description')
  return (
    <div>
      <button onClick={() => setTab('reviews')}>Reviews</button>
      {tab === 'reviews' && <ProductReviews productId={productId} />}
    </div>
  )
}
```
::

The escape hatch is passing a server component as `children` (or any other prop) from a parent server component — the client component never imports it, just renders whatever was handed to it, so the composition happens *above* the client boundary rather than inside it.

::code-wrapper{language="javascript"}
```javascript
// ProductDetailClient.js — Client Component, renders whatever `children` it's given
// without ever importing it — it doesn't know or care that children is a Server Component.
'use client'

function ProductDetailClient({ children }) {
  const [tab, setTab] = useState('description')
  return (
    <div>
      <button onClick={() => setTab('reviews')}>Reviews</button>
      {tab === 'reviews' && children}
    </div>
  )
}
```
::

::code-wrapper{language="javascript"}
```javascript
// ProductPage.js — Server Component composes the two, passing the server
// component as children INTO the client component from outside its own file.
export default function ProductPage({ productId }) {
  return (
    <ProductDetailClient>
      <ProductReviews productId={productId} />
    </ProductDetailClient>
  )
}
```
::

This "slot" pattern — server components composed into client components via `children`/props rather than direct imports — is the single most useful trick for maximizing how much of a tree stays server-only while still allowing interactive islands where they're genuinely needed.

## Why This Matters: Zero-Bundle-Size Components

The concrete payoff of RSC is bundle size and data-fetching waterfalls, not a stylistic preference. A server component that imports a large formatting library, a markdown renderer, or a syntax highlighter contributes **zero bytes** to the client bundle — that code runs once on the server and only its rendered *output* is sent down, never its source.

::code-wrapper{language="javascript"}
```javascript
// Server Component: `marked` (a markdown parser) and its dependencies never ship
// to the browser at all — only the resulting HTML-like output does.
import { marked } from 'marked'

async function ArticleBody({ articleId }) {
  const article = await db.articles.findUnique({ where: { id: articleId } })
  const html = marked(article.markdownContent)
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}
```
::

Contrast this with the pre-RSC equivalent, where `marked` would need to be a client-side dependency (bundled and downloaded by every visitor) purely because it happened to run inside a component, even though its output is static text with no interactivity whatsoever. RSC lets bundle size scale with how much of an app is actually *interactive*, not with how much of it merely *renders*.

## Data Fetching Without a Waterfall

Server components can be `async` directly and fetch data with a plain `await` — no `useEffect`, no loading state management for the initial render, since the component simply doesn't render at all until its data is ready.

::code-wrapper{language="javascript"}
```javascript
// Sibling server components fetching independently both start their requests
// concurrently on the server as soon as the tree begins rendering — this is
// NOT a client-side waterfall of sequential useEffect calls.
async function ProductPage({ productId }) {
  return (
    <div>
      <ProductInfo productId={productId} />
      <ProductReviews productId={productId} />
      <RelatedProducts productId={productId} />
    </div>
  )
}

async function ProductInfo({ productId }) {
  const product = await db.products.findUnique({ where: { id: productId } })
  return <h1>{product.name}</h1>
}
```
::

Wrapping a slower server component in `<Suspense>` lets faster siblings stream to the browser first, rather than the entire page waiting on the slowest piece of data — the same `<Suspense>` primitive from chapters 20-21, now doing double duty as the actual data-loading mechanism rather than a conceptual illustration.

::code-wrapper{language="javascript"}
```javascript
async function ProductPage({ productId }) {
  return (
    <div>
      <ProductInfo productId={productId} />
      {/* Reviews are slow to fetch — Suspense lets the rest of the page
          stream to the browser without waiting on this specific piece */}
      <Suspense fallback={<ReviewsSkeleton />}>
        <ProductReviews productId={productId} />
      </Suspense>
    </div>
  )
}
```
::

## Next.js: Where This Is Actually Used Today

Hand-rolling an RSC-capable bundler/server setup from scratch is not a realistic undertaking for an application team — RSC requires a build system and server runtime that understand the `'use client'` boundary, know how to serialize server output, and know how to stream it correctly. In practice, **Next.js's App Router** (`app/` directory, as opposed to the older `pages/` directory) is where the overwhelming majority of production RSC usage happens today, treating every file under `app/` as a server component by default unless it opts in with `'use client'`.

::code-wrapper{language="bash"}
```bash
npx create-next-app@latest my-app
# ✔ Would you like to use the App Router? › Yes
cd my-app
npm run dev
```
::

This chapter deliberately stays framework-agnostic on the concepts, since Next.js's specific conventions (file-based routing, `layout.js`, `loading.js`, server actions for mutations) are a large enough surface for their own dedicated material — the goal here is that the underlying client/server component model makes sense before layering a framework's conventions on top of it.

## Hydration, Revisited

Hydration is the process, mentioned above, of React attaching event listeners and internal state to already-rendered server HTML rather than re-creating DOM nodes from scratch. A subtle but important consequence: **the HTML the server sends and the first client render must match**, or React logs a hydration mismatch warning and, in the mismatched region, discards the server HTML and re-renders it client-side — losing the fast-paint benefit SSR was meant to provide for that section.

::code-wrapper{language="javascript"}
```javascript
'use client'
// BROKEN: Date.now() / Math.random() / typeof window checks that differ between
// server and client render produce a hydration mismatch — the server doesn't
// know what the client's clock or window object will produce, and vice versa.
function Timestamp() {
  return <span>{new Date().toLocaleTimeString()}</span>
}
```
::

::code-wrapper{language="javascript"}
```javascript
'use client'
// FIXED: render nothing (or a static placeholder) on the server/first client render,
// then swap in the real, environment-dependent value only after mount —
// by which point hydration has already completed and a mismatch can't occur.
function Timestamp() {
  const [time, setTime] = useState(null)
  useEffect(() => setTime(new Date().toLocaleTimeString()), [])
  return <span>{time ?? '--:--:--'}</span>
}
```
::

This is a direct consequence of chapter 21's purity requirement applied to a new context: a component whose output legitimately differs between server and client execution environments needs to explicitly account for that difference, rather than assuming render output is universally identical everywhere it runs.

## 💡 Tips & Tricks

- **Idiom** — Default to server components for anything that doesn't need state, effects, or event handlers — data display, formatting, layout — and reach for `'use client'` only at the specific leaf components that genuinely need interactivity, keeping the client bundle as small as the app's actual interactive surface.
- **Idiom** — Use the children-as-props "slot" pattern to compose a server component inside a client component's UI without the client component ever importing it directly — this is the standard workaround for the one-directional import restriction, not an obscure trick.
- **Performance** — Wrap slower, independently-loading sections of a server-rendered page in `<Suspense>` so faster siblings can stream to the browser without waiting on the slowest piece of data — this is where `<Suspense>` moves from a conceptual illustration (chapter 21) to an actual production mechanism.
- **Debug** — A "you're importing a Server Component into a Client Component" build error almost always means a shared file needs its exports split — keep server-only logic in one module and the client-facing pieces in another, rather than mixing both in a file that gets imported from both sides of the boundary.
- **Portability** — Treat any value that legitimately differs between server and browser execution (current time, `window`/`navigator` access, random values, locale-dependent formatting without an explicit locale) as a hydration-mismatch risk by default, and defer rendering it until after mount.

## ⚠️ Edge Cases & Gotchas

- **`'use client'` marks a boundary, not just a single file** — every component imported into a `'use client'` file is treated as part of the client bundle too (unless passed in as `children`/props from outside), so an innocuous-looking import deep in a client component's dependency tree can silently balloon bundle size if it happens to be a large library.
- **Server components cannot use `useState`, `useEffect`, `useContext`, or any other hook that assumes a browser runtime** — attempting to do so is a build-time/runtime error, not a warning; the fix is either moving that piece into a `'use client'` child or restructuring so the server component doesn't need that state at all.
- **Props passed from a server component to a client component must be serializable** — functions, class instances, and other non-serializable values can't cross the boundary (with the specific exception of Server Actions, a related but separate mechanism), because the "boundary" is a real serialization step, not merely a logical divide within one running process.
- **A hydration mismatch doesn't just log a warning and move on cleanly** — React discards and re-renders the mismatched DOM subtree client-side, which means any perceived SSR performance benefit for that specific section is lost, and in some cases visible content can flicker or shift as the corrected client-rendered version replaces the server-rendered one.
- **RSC and traditional SSR are easy to conflate, but pre-RSC "isomorphic"/"universal" SSR ships every component's code to the client regardless of the component's UI actually needing interactivity** — the historical assumption that "renders on the server" and "must ship to the client" always go together is exactly the assumption RSC breaks; older SSR-only mental models don't automatically transfer.

## 🧠 Spot the Bug

A team migrates a product detail page to use Server Components, expecting the bundle size to shrink significantly since most of the page is static content. The bundle barely changes.

::code-wrapper{language="typescript"}
```typescript
'use client'

import { formatCurrency } from './utils/formatCurrency'
import { ProductSpecsTable } from './ProductSpecsTable'

export default function ProductDetailPage({ product }: { product: Product }) {
  const [quantity, setQuantity] = useState(1)

  return (
    <div>
      <h1>{product.name}</h1>
      <p>{formatCurrency(product.price)}</p>
      <ProductSpecsTable specs={product.specs} />
      <input
        type="number"
        value={quantity}
        onChange={e => setQuantity(Number(e.target.value))}
      />
    </div>
  )
}
```
::

<details>
<summary>Answer</summary>

The entire page is marked `'use client'` at the top, even though the only genuinely interactive piece is the quantity `<input>`. Because `'use client'` marks the whole file (and everything it imports that isn't passed in from outside) as client-bundle code, `ProductSpecsTable` and the static heading/price markup all ship to the browser and hydrate on the client too — none of the bundle-size benefit RSC offers actually materializes, since only one small input genuinely needs `useState`.

**The lesson**: `'use client'` should be pushed down to the smallest component that actually needs interactivity — here, that means extracting `QuantityInput` into its own `'use client'` file and leaving `ProductDetailPage` (and `ProductSpecsTable`) as server components, so only the input's code and its dependencies ship to the browser instead of the entire page.

</details>

## Key Takeaways

- SSR (rendering a component tree to HTML on the server, then hydrating in the browser) and RSC (components whose code never ships to the client at all) solve different problems — SSR is about *when* first render happens, RSC is about *where* a component's code permanently lives.
- Components are server components (the default) unless marked `'use client'`; server components can be `async`, fetch data directly, and access server-only resources, but cannot use hooks, event handlers, or browser APIs.
- The client/server import boundary is one-directional — a client component cannot import a server component, but a server component can pass another server component as `children`/props into a client component.
- RSC's real payoff is zero client-bundle cost for server-only dependencies (database clients, markdown parsers, heavy formatting libraries) and concurrent, `Suspense`-streamable data fetching without `useEffect` waterfalls.
- Hydration requires the server-rendered HTML and the client's first render to match; values that legitimately differ between environments (time, `window`, randomness) need to be deferred until after mount to avoid a hydration mismatch.
- Next.js's App Router is the primary production environment for RSC today — the client/server component model in this chapter is the foundation its file-based conventions build on top of.
