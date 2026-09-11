---
title: "22 — Server Components and SSR"
description: "RSC vs SSR vs CSR, Next.js App Router, server/client component boundary, 'use client' directive, data fetching in server components, streaming with Suspense, hydration, metadata, and zero-bundle-size components. Code-first reference for mid-to-senior React engineers."
---

# 22 — Server Components and SSR

## CSR vs SSR vs RSC — Three Rendering Models

::code-wrapper{language="javascript" filename="rendering_models.js"}
```javascript
// CSR (Client-Side Rendering) — the default for pre-RSC React SPAs:
// 1. Browser downloads empty HTML + JS bundle
// 2. React renders the entire tree in the browser
// 3. Data fetching happens in useEffect after mount (waterfall)
// Pros: simple, no server needed, rich interactivity
// Cons: slow first paint, poor SEO, empty HTML on initial load

// SSR (Server-Side Rendering) — traditional React SSR:
// 1. Server renders components to HTML string
// 2. Browser receives HTML (visible immediately)
// 3. Browser downloads JS, hydrates (reattaches event listeners)
// 4. SAME component code ships to browser — it must hydrate
// Pros: fast first paint, good SEO
// Cons: ALL component code still ships to client bundle

// RSC (React Server Components):
// 1. Server components render on server, output serialized UI description
// 2. Server component code NEVER ships to browser (zero client bundle)
// 3. Only client components (marked 'use client') ship to browser
// 4. Can be async, fetch data directly, access server resources
// Pros: smaller bundles, no data waterfall, server-only deps stay server-side
// Cons: no useState/useEffect/event handlers in server components

// KEY DISTINCTION:
// SSR = WHEN rendering first happens (server first, then hydrate)
// RSC = WHERE a component's code permanently lives (some never leave server)
// A framework can use BOTH — which is what Next.js App Router does.
```
::

## Server Components — The Default

::code-wrapper{language="javascript" filename="server_component.js"}
```javascript
// Server Component (default — no directive needed)
// Can: be async, fetch data directly, access databases/filesystem/secrets
// Cannot: use useState/useEffect/any hook, attach event handlers, use browser APIs

import { db } from './db'
import AddToCartButton from './AddToCartButton'

export default async function ProductPage({ productId }) {
  // Direct async data fetching — no useEffect, no loading state,
  // no client-side waterfall. The component simply doesn't render
  // until its data is ready.
  const product = await db.products.findUnique({ where: { id: productId } })

  return (
    <div>
      <h1>{product.name}</h1>
      <p>${product.price}</p>
      {/* Interactivity is delegated to a client component —
          server components cannot attach onClick handlers */}
      <AddToCartButton productId={product.id} />
    </div>
  )
}
```
::

## Client Components — 'use client' Directive

::code-wrapper{language="javascript" filename="client_component.js"}
```javascript
// Client Component (explicit opt-in required)
// The 'use client' directive marks the boundary: everything in this file
// (and everything it imports that isn't passed from outside) is client bundle.
'use client'

import { useState } from 'react'

export default function AddToCartButton({ productId }) {
  const [isAdding, setIsAdding] = useState(false)

  async function handleClick() {
    setIsAdding(true)
    await fetch('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ productId }),
      headers: { 'Content-Type': 'application/json' },
    })
    setIsAdding(false)
  }

  return (
    <button onClick={handleClick} disabled={isAdding}>
      {isAdding ? 'Adding…' : 'Add to Cart'}
    </button>
  )
}

// 'use client' does NOT mean "only renders on the client" — a client
// component still participates in SSR for the initial page load.
// It means: "this component's code is allowed to run in the browser,
// and therefore must be included in the client bundle" — which is
// also the ONLY way to use useState, useEffect, event handlers, or
// any browser-only API (window, localStorage).
```
::

## The Boundary Only Goes One Direction

::code-wrapper{language="javascript" filename="boundary_direction.js"}
```javascript
// A server component CAN import and render a client component directly.
// The REVERSE is NOT allowed: a client component CANNOT import a server
// component, because everything inside client-component code must be
// safe to ship to the browser, and server components may import
// database clients, filesystem APIs, or secrets.

// BROKEN: a client component cannot import a server component directly
'use client'
import ProductReviews from './ProductReviews'  // server component — FAILS

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

### The Children-as-Props Escape Hatch

::code-wrapper{language="javascript" filename="children_slot.js"}
```javascript
// ProductDetailClient.js — Client Component, renders whatever `children`
// it's given without ever importing it — it doesn't know or care that
// children is a Server Component.
'use client'

import { useState } from 'react'

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

::code-wrapper{language="javascript" filename="children_slot_composition.js"}
```javascript
// ProductPage.js — Server Component composes the two, passing the server
// component as children INTO the client component from outside its own file.
// The composition happens ABOVE the client boundary, not inside it.

import ProductDetailClient from './ProductDetailClient'
import ProductReviews from './ProductReviews'

export default async function ProductPage({ productId }) {
  return (
    <ProductDetailClient>
      <ProductReviews productId={productId} />
    </ProductDetailClient>
  )
}

// This "slot" pattern — server components composed into client components
// via children/props rather than direct imports — is the standard trick
// for maximizing how much of a tree stays server-only while still
// allowing interactive islands where they're genuinely needed.
```
::

## Zero-Bundle-Size Components

::code-wrapper{language="javascript" filename="zero_bundle.js"}
```javascript
// Server Component: `marked` (a markdown parser) and its dependencies
// NEVER ship to the browser at all — only the resulting HTML-like output does.
import { marked } from 'marked'
import { db } from './db'

async function ArticleBody({ articleId }) {
  const article = await db.articles.findUnique({ where: { id: articleId } })
  const html = marked(article.markdownContent)  // runs on server only
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

// Contrast with pre-RSC: `marked` would be a client-side dependency
// (bundled and downloaded by every visitor) purely because it ran
// inside a component, even though its output is static text with
// no interactivity. RSC lets bundle size scale with how much of an
// app is actually INTERACTIVE, not with how much of it merely RENDERS.

// ANTI-PATTERN: marking a file 'use client' when only a tiny part
// needs interactivity. The ENTIRE file + its imports ship to the client.
// Extract the interactive bit into its own 'use client' leaf component
// and keep the rest server-only.
```
::

## Data Fetching Without a Waterfall

::code-wrapper{language="javascript" filename="data_fetching.js"}
```javascript
// Sibling server components fetching independently both start their
// requests CONCURRENTLY on the server — NOT a client-side waterfall
// of sequential useEffect calls.

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

async function ProductReviews({ productId }) {
  const reviews = await db.reviews.findMany({ where: { productId } })
  return reviews.map(r => <Review key={r.id} review={r} />)
}

// All three async components start fetching in parallel — the server
// renders them concurrently, no useEffect waterfall, no loading states
// for the initial render. The page simply isn't sent until all data
// is ready (unless streaming with Suspense — see below).
```
::

## Streaming with Suspense

::code-wrapper{language="javascript" filename="streaming_suspense.js"}
```javascript
import { Suspense } from 'react'

// Wrapping a slower server component in <Suspense> lets faster siblings
// STREAM to the browser first — the same <Suspense> primitive from Ch 20-21,
// now doing double duty as the actual data-loading mechanism.

async function ProductPage({ productId }) {
  return (
    <div>
      {/* ProductInfo is fast — renders immediately */}
      <ProductInfo productId={productId} />

      {/* Reviews are slow — Suspense lets the rest of the page stream
          to the browser without waiting on this specific piece */}
      <Suspense fallback={<ReviewsSkeleton />}>
        <ProductReviews productId={productId} />
      </Suspense>

      {/* Related products also slow — independent Suspense boundary */}
      <Suspense fallback={<RelatedSkeleton />}>
        <RelatedProducts productId={productId} />
      </Suspense>
    </div>
  )
}

// The browser receives the page shell + product info first, then reviews
// and related products stream in as their data resolves — progressive
// rendering without the user staring at a blank page or a single spinner.
```
::

## Next.js App Router — Where RSC Lives

::code-wrapper{language="bash" filename="nextjs_setup.sh"}
```bash
# Next.js App Router is the primary production environment for RSC today.
# Every file under app/ is a server component by default unless it opts
# in with 'use client'.

npx create-next-app@latest my-app
# Would you like to use the App Router? Yes
cd my-app
npm run dev
```
::

::code-wrapper{language="javascript" filename="nextjs_structure.js"}
```javascript
// Next.js App Router file conventions:
// app/
//   layout.js        — root layout (server component by default), wraps every page
//   page.js          — route's UI (server component by default)
//   loading.js       — Suspense fallback for the route (auto-wrapped in <Suspense>)
//   error.js         — error boundary for the route (must be a client component)
//   not-found.js     — 404 UI for the route
//   [id]/            — dynamic segment (useParams equivalent)
//   products/
//     page.js        — /products route
//     [productId]/
//       page.js      — /products/:productId route

// app/products/[productId]/page.js — Server Component by default
import { db } from '@/lib/db'

export default async function ProductPage({ params }) {
  const product = await db.products.findUnique({ where: { id: params.productId } })
  return (
    <div>
      <h1>{product.name}</h1>
      <p>{product.price}</p>
    </div>
  )
}

// app/products/[productId]/loading.js — auto-wrapped in <Suspense>
export default function Loading() {
  return <ProductSkeleton />
}
```
::

## Hydration — Server HTML Meets Client JS

::code-wrapper{language="javascript" filename="hydration.js"}
```javascript
// Hydration = React attaching event listeners and internal state to
// already-rendered server HTML rather than re-creating DOM nodes.
// CRITICAL: the HTML the server sends and the first client render
// MUST MATCH, or React logs a hydration mismatch warning and
// DISCARDS the server HTML, re-rendering client-side — losing the
// fast-paint benefit SSR was meant to provide.

// BROKEN: Date.now() / Math.random() / typeof window checks differ
// between server and client render → hydration mismatch.
'use client'
import { useState } from 'react'

function Timestamp() {
  // Server renders this at time T1, client hydrates at time T2.
  // T1 !== T2 → mismatch → React discards server HTML, re-renders.
  return <span>{new Date().toLocaleTimeString()}</span>
}
```
::

### Fixing Hydration Mismatches

::code-wrapper{language="javascript" filename="hydration_fix.js"}
```javascript
'use client'
import { useState, useEffect } from 'react'

// FIXED: render nothing (or a static placeholder) on the server/first
// client render, then swap in the real, environment-dependent value
// only after mount — by which point hydration has completed and a
// mismatch can't occur.
function Timestamp() {
  const [time, setTime] = useState(null)

  useEffect(() => {
    setTime(new Date().toLocaleTimeString())
  }, [])

  return <span>{time ?? '--:--:--'}</span>
  // Server renders "--:--:--", client first render also renders "--:--:--"
  // (match!), then useEffect runs and updates to the real time.
}

// Pattern for any environment-dependent value:
function ClientOnly({ children }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted ? children : null
  // Server renders null, client first render renders null (match!),
  // then after mount, children render. Use sparingly — it means SSR
 // provides no content for this subtree.
}
```
::

## Metadata and SEO

::code-wrapper{language="javascript" filename="metadata.js"}
```javascript
// Next.js App Router: metadata API for server components.
// Server-side metadata = SEO-friendly, no client JS needed for crawlers.

// Static metadata:
export const metadata = {
  title: 'Product Catalog',
  description: 'Browse our full product range',
}

// Dynamic metadata (async — can fetch data):
export async function generateMetadata({ params }) {
  const product = await db.products.findUnique({ where: { id: params.productId } })
  return {
    title: product.name,
    description: product.description,
    openGraph: {
      images: [product.imageUrl],
    },
  }
}

// ANTI-PATTERN: setting document.title in a client component useEffect.
// This runs AFTER hydration — crawlers that don't execute JS see the
// default title. Use the metadata API in a server component instead.
```
::

## Complex Implementation — Full Product Page

::code-wrapper{language="javascript" filename="complex_product_page.js"}
```javascript
// app/products/[productId]/page.js — Server Component
import { Suspense } from 'react'
import { db } from '@/lib/db'
import AddToCartButton from '@/components/AddToCartButton'
import ProductGallery from '@/components/ProductGallery'
import ReviewForm from '@/components/ReviewForm'

export async function generateMetadata({ params }) {
  const product = await db.products.findUnique({ where: { id: params.productId } })
  return { title: product.name, description: product.description }
}

export default async function ProductPage({ params }) {
  const product = await db.products.findUnique({
    where: { id: params.productId },
    include: { category: true },
  })

  if (!product) notFound()

  return (
    <div>
      {/* Server component: zero client bundle cost for gallery logic */}
      <ProductGallery images={product.images} />

      <div>
        <h1>{product.name}</h1>
        <p className="text-2xl">${product.price}</p>
        <p>{product.description}</p>

        {/* Client component: needs interactivity (useState, onClick) */}
        <AddToCartButton productId={product.id} />
      </div>

      {/* Reviews stream in independently — no blocking the rest of the page */}
      <Suspense fallback={<ReviewsSkeleton />}>
        <ReviewsSection productId={product.id} />
      </Suspense>

      {/* Review form is a client component (needs form state) */}
      <ReviewForm productId={product.id} />
    </div>
  )
}

// Server component — fetches reviews, no client bundle cost
async function ReviewsSection({ productId }) {
  const reviews = await db.reviews.findMany({
    where: { productId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  if (reviews.length === 0) return <p>No reviews yet.</p>

  return (
    <div>
      <h2>Reviews</h2>
      {reviews.map(review => (
        <div key={review.id}>
          <p>{review.author}</p>
          <p>{review.rating} stars</p>
          <p>{review.comment}</p>
        </div>
      ))}
    </div>
  )
}

function ReviewsSkeleton() {
  return (
    <div>
      <h2>Reviews</h2>
      <div className="animate-pulse">Loading reviews…</div>
    </div>
  )
}
```
::

## Anti-Patterns

::code-wrapper{language="javascript" filename="anti_patterns.js"}
```javascript
// ANTI-PATTERN: marking an entire page 'use client' when only one
// small component needs interactivity. The ENTIRE page + all its
// imports ship to the client bundle. Extract the interactive bit
// into its own 'use client' leaf and keep the rest server-only.

// ANTI-PATTERN: a client component importing a server component
'use client'
import ServerDataComponent from './ServerDataComponent'  // FAILS at build
// Fix: pass it as children from a server component parent (slot pattern).

// ANTI-PATTERN: passing non-serializable props from server to client
// Server component:
<ClientComponent onClick={() => console.log('hi')} />
// Functions can't cross the serialization boundary (except Server Actions).
// Fix: move the interactivity into the client component itself.

// ANTI-PATTERN: Date.now() / Math.random() / window access in a
// component that renders on both server and client → hydration mismatch.
// Fix: defer environment-dependent values to useEffect (after mount).

// ANTI-PATTERN: using useEffect for data fetching in a server component
async function ProductPage({ productId }) {
  // Server components are ALREADY async — just await directly.
  // useEffect doesn't exist in server components at all.
  const product = await fetchProduct(productId)  // correct
  return <ProductView product={product} />
}

// ANTI-PATTERN: 'use client' at the top of a shared utility file
// that's imported by both server and client components. Everything
// in that file + its deps become client bundle. Split server-only
// logic and client-facing logic into separate modules.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Idiom] Default to server components for anything that doesn't need
// state, effects, or event handlers — data display, formatting, layout.
// Reach for 'use client' only at specific leaf components that genuinely
// need interactivity, keeping the client bundle as small as the app's
// actual interactive surface.

// [Idiom] Use the children-as-props "slot" pattern to compose a server
// component inside a client component's UI without the client component
// ever importing it — the standard workaround for the one-directional
// import restriction.

// [Performance] Wrap slower, independently-loading sections of a
// server-rendered page in <Suspense> so faster siblings can stream to
// the browser without waiting on the slowest piece of data.

// [Debug] A "you're importing a Server Component into a Client Component"
// build error almost always means a shared file needs its exports split —
// keep server-only logic in one module and client-facing pieces in another.

// [Portability] Treat any value that legitimately differs between server
// and browser execution (current time, window/navigator access, random
// values, locale-dependent formatting) as a hydration-mismatch risk by
// default — defer rendering it until after mount.

// [Idiom] In Next.js App Router, use the metadata API (export const
// metadata or generateMetadata) in server components for SEO — setting
// document.title in a client useEffect runs after hydration and is
// invisible to crawlers that don't execute JS.

// [Performance] Server components can import heavy libraries (markdown
// parsers, syntax highlighters, formatting utils) with ZERO client bundle
// cost — only the rendered output is sent. Move static rendering logic
// to the server to shrink the bundle.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] 'use client' marks a BOUNDARY, not just a single file —
// every component imported into a 'use client' file is treated as part
// of the client bundle too (unless passed in as children/props from
// outside). An innocuous-looking import deep in a client component's
// dependency tree can silently balloon bundle size.

// [Gotcha] Server components CANNOT use useState, useEffect, useContext,
// or any hook that assumes a browser runtime — attempting to do so is a
// build-time/runtime error. Move that piece into a 'use client' child.

// [Gotcha] Props passed from a server component to a client component
// MUST be serializable — functions, class instances, and other
// non-serializable values can't cross the boundary (with the specific
// exception of Server Actions). The boundary is a real serialization step.

// [Gotcha] A hydration mismatch doesn't just log a warning and move on —
// React DISCARDS and re-renders the mismatched DOM subtree client-side.
// The SSR performance benefit for that section is lost, and content can
// flicker as the corrected client-rendered version replaces the server HTML.

// [Gotcha] RSC and traditional SSR are easy to conflate. Pre-RSC "isomorphic"
// SSR ships EVERY component's code to the client regardless of whether the
// component's UI actually needs interactivity. RSC breaks this assumption —
// older SSR-only mental models don't automatically transfer.

// [Gotcha] In Next.js App Router, 'use client' doesn't mean "this only
// renders on the client." Client components still SSR for the initial page
// load — they just ALSO ship to the browser for hydration and interactivity.
// The directive controls bundle inclusion, not render location.

// [Gotcha] Server components can't use Context (useContext) — context is
// a runtime concept that requires React's client-side re-rendering model.
// To share values across server and client components, pass props or use
// a framework-specific mechanism (Next.js headers(), cookies(), etc.).

// [Gotcha] Dynamic route params in Next.js App Router are promises in
// Next.js 15+ — you must `await params` before accessing properties.
// In earlier versions, params was a plain object. Check your version.
```
::

## 🧠 Spot the Bug

A team migrates a product detail page to use Server Components, expecting the bundle size to shrink significantly since most of the page is static content. The bundle barely changes.

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
```javascript
'use client'

import { formatCurrency } from './utils/formatCurrency'
import { ProductSpecsTable } from './ProductSpecsTable'
import { useState } from 'react'

export default function ProductDetailPage({ product }) {
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

The entire page is marked `'use client'` at the top, even though the only genuinely interactive piece is the quantity `<input>`. Because `'use client'` marks the whole file (and everything it imports that isn't passed in from outside) as client-bundle code, `ProductSpecsTable`, `formatCurrency`, and the static heading/price markup all ship to the browser and hydrate on the client too — none of the bundle-size benefit RSC offers actually materializes, since only one small input genuinely needs `useState`.

**Fix**: extract `QuantityInput` into its own `'use client'` file and leave `ProductDetailPage` (and `ProductSpecsTable`) as server components:

```javascript
// ProductDetailPage.js — Server Component (no directive)
import { formatCurrency } from './utils/formatCurrency'
import { ProductSpecsTable } from './ProductSpecsTable'
import QuantityInput from './QuantityInput'

export default async function ProductDetailPage({ productId }) {
  const product = await db.products.findUnique({ where: { id: productId } })
  return (
    <div>
      <h1>{product.name}</h1>
      <p>{formatCurrency(product.price)}</p>
      <ProductSpecsTable specs={product.specs} />
      <QuantityInput />
    </div>
  )
}

// QuantityInput.js — Client Component (only this ships to browser)
'use client'
import { useState } from 'react'

export default function QuantityInput() {
  const [quantity, setQuantity] = useState(1)
  return <input type="number" value={quantity} onChange={e => setQuantity(Number(e.target.value))} />
}
```

Now only `QuantityInput`'s code and its dependencies ship to the browser instead of the entire page.

**The lesson**: `'use client'` should be pushed down to the smallest component that actually needs interactivity — not applied at the page level when only a tiny part needs state.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. SSR (rendering to HTML on server, then hydrating) and RSC (components
//    whose code NEVER ships to client) solve DIFFERENT problems. SSR is
//    about WHEN first render happens; RSC is about WHERE code lives.

// 2. Components are server components (the default) unless marked
//    'use client'. Server components can be async, fetch data directly,
//    and access server-only resources. Client components can use hooks,
//    event handlers, and browser APIs.

// 3. The client/server import boundary is ONE-DIRECTIONAL — a client
//    component cannot import a server component, but a server component
//    can pass another server component as children/props into a client
//    component (the "slot" pattern).

// 4. RSC's payoff is ZERO client-bundle cost for server-only dependencies
//    (database clients, markdown parsers, heavy formatting libraries) and
//    concurrent, Suspense-streamable data fetching without useEffect
//    waterfalls. Bundle size scales with interactivity, not with rendering.

// 5. Hydration requires server HTML and client's first render to MATCH.
//    Values that differ between environments (time, window, randomness)
//    must be deferred until after mount to avoid hydration mismatches.

// 6. Next.js App Router is the primary production RSC environment —
//    every file under app/ is a server component by default. Use the
//    metadata API for SEO, loading.js for Suspense fallbacks, and
//    push 'use client' to the smallest interactive leaf.

// 7. Server components can't use Context (useContext) — it requires
//    React's client-side re-rendering model. Pass props or use
//    framework-specific mechanisms for cross-boundary value sharing.
```
::
