---
title: "12 — Conditional Rendering Patterns"
description: "Ternary, &&, IIFE, early returns, enum lookups, show/hide vs mount/unmount, extracting conditional logic — production-grade patterns and anti-patterns for mid-to-senior React engineers."
---

# 12 — Conditional Rendering Patterns

## The Core Mechanisms

::code-wrapper{language="javascript" filename="core_mechanics.js"}
```javascript
// JSX renders any expression that evaluates to: React element | string | number | null | false | undefined | true
// React DOM renders: elements, strings, numbers
// React DOM ignores: null, false, undefined, true (renders nothing, no DOM node)
// CAVEAT: 0 (zero) IS rendered — this is the most common && gotcha (see below)

import React, { useState, useEffect, Fragment } from 'react'

// ── 1. Ternary: two mutually exclusive branches ──
function AuthToggle({ isAuthenticated }) {
  return isAuthenticated ? <LogoutButton /> : <SignInButton />
}

// ── 2. &&: one branch or nothing (conditional inclusion) ──
function NewBadge({ isNew }) {
  return (
    <div>
      <span>Product Name</span>
      {isNew && <span className="badge">New</span>}
    </div>
  )
}

// ── 3. IIFE: inline computation that returns JSX (rare but real) ──
function DynamicHeader({ type, data }) {
  return (
    <header>
      {(() => {
        switch (type) {
          case 'user':   return <UserHeader user={data} />
          case 'org':    return <OrgHeader org={data} />
          case 'system': return <SystemHeader />
          default:       return <DefaultHeader />
        }
      })()}
    </header>
  )
  // IIFE is useful when you need a full block scope (let/const, switch, try/catch)
  // inside JSX. Overuse hurts readability — extract to a variable or sub-component instead.
}
```
::

## The Zero-Rendering Gotcha (&&)

::code-wrapper{language="javascript" filename="zero_gotcha.js"}
```javascript
// WRONG: renders "0" into the DOM when items.length === 0
function CartCount({ items }) {
  return (
    <div>
      {items.length && <span>{items.length} items in cart</span>}
    </div>
  )
  // When items = [], items.length is 0 (a number). 0 is NOT ignored by React —
  // React renders it as the text "0". Users see a stray "0" with no <span>.
}

// FIX 1: explicit boolean coercion
function CartCountFixed1({ items }) {
  return (
    <div>
      {items.length > 0 && <span>{items.length} items in cart</span>}
      // items.length > 0 evaluates to true/false — false renders nothing.
    </div>
  )
}

// FIX 2: ternary with explicit null
function CartCountFixed2({ items }) {
  return (
    <div>
      {items.length > 0 ? (
        <span>{items.length} items in cart</span>
      ) : null}
    </div>
  )
}

// FIX 3: render the count, but handle the empty case explicitly
function CartCountFixed3({ items }) {
  return (
    <div>
      {items.length > 0 ? (
        <span>{items.length} items in cart</span>
      ) : (
        <span className="empty">Your cart is empty</span>
      )}
    </div>
  )
}

// WORST CASE: array of numbers with filter + &&
function FilteredList({ items }) {
  const filtered = items.filter(x => x > 10)
  return (
    <ul>
      {filtered.map(x => <li key={x}>{x}</li>)}
      {filtered.length === 0 && <li>No results</li>}
      // If filtered = [0], filter returns [] → filtered.length = 0 → 0 && <li> → renders "0"
      // Always use === 0 (explicit comparison) or > 0, never bare .length with &&
    </ul>
  )
}
```
::

## Early Returns: Whole-Component Branches

::code-wrapper{language="javascript" filename="early_returns.js"}
```javascript
import { useState, useEffect } from 'react'

// ANTI-PATTERN: nested ternaries for whole-component output — unreadable at 3+ branches
function UserProfileBad({ status, user, error }) {
  return status === 'loading' ? (
    <Spinner />
  ) : status === 'error' ? (
    <ErrorMessage error={error} />
  ) : status === 'success' ? (
    <ProfileCard user={user} />
  ) : null
  // Each additional branch nests deeper. Adding "empty" state requires another ? : layer.
}

// CORRECT: early returns — flat, scannable, each guard is a standalone clause
function UserProfileGood({ status, user, error }) {
  if (status === 'loading') return <Spinner />
  if (status === 'error')   return <ErrorMessage error={error} />
  if (status === 'success') return <ProfileCard user={user} />
  return null  // idle / unknown status
}

// COMPLEX: multi-state with per-branch data preparation
function SearchResults({ status, results, error, query, onRetry }) {
  // All hooks MUST come before any early return (Rules of Hooks — Ch 11)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (status === 'error') setRetryCount(0)
  }, [status])

  if (status === 'idle')    return <SearchPrompt query={query} />
  if (status === 'loading') return <SkeletonLoader count={5} />
  if (status === 'error')   return <ErrorState error={error} onRetry={() => { setRetryCount(c => c + 1); onRetry() }} retryCount={retryCount} />
  if (status === 'success' && results.length === 0) {
    return <EmptyState message={`No results for "${query}"`} />
  }
  if (status === 'success') {
    return (
      <ul>
        {results.map(r => (
          <li key={r.id}>
            <ResultCard data={r} />
          </li>
        ))}
      </ul>
    )
  }
  return null
}
```
::

### Rules of Hooks Constraint on Early Returns

::code-wrapper{language="javascript" filename="hooks_before_returns.js"}
```javascript
import { useState, useEffect } from 'react'

// BUG: useState called AFTER an early return — hook count varies between renders
function DiscountBannerBad({ cartTotal }) {
  if (cartTotal < 50) return null              // ← early return
  const [dismissed, setDismissed] = useState(false)  // ← hook AFTER return
  if (dismissed) return null
  return (
    <div className="banner">
      Free shipping! <button onClick={() => setDismissed(true)}>Dismiss</button>
    </div>
  )
  // When cartTotal < 50: 0 hooks called. When cartTotal >= 50: 1 hook called.
  // React throws: "Rendered fewer hooks than expected. This may be caused by an
  // accidental early return statement." Hook state corrupts silently before the error.
}

// FIX: all hooks unconditionally before any return
function DiscountBannerGood({ cartTotal }) {
  const [dismissed, setDismissed] = useState(false)

  if (cartTotal < 50) return null
  if (dismissed)      return null

  return (
    <div className="banner">
      Free shipping! <button onClick={() => setDismissed(true)}>Dismiss</button>
    </div>
  )
  // Hook count is constant (1) on every render regardless of branch taken.
}
```
::

## Enum Objects for Multi-State Rendering

::code-wrapper{language="javascript" filename="enum_lookups.js"}
```javascript
import { useState } from 'react'

// ANTI-PATTERN: long if/else-if chain or nested ternaries for N branches
function StatusBadgeBad({ status }) {
  if (status === 'pending')   return <Badge color="yellow">Pending</Badge>
  if (status === 'approved')  return <Badge color="green">Approved</Badge>
  if (status === 'rejected')  return <Badge color="red">Rejected</Badge>
  if (status === 'cancelled') return <Badge color="gray">Cancelled</Badge>
  if (status === 'expired')   return <Badge color="orange">Expired</Badge>
  return <Badge color="blue">Unknown</Badge>
  // Linear scan, hard to extend, easy to forget a case.
}

// CORRECT: enum object — flat data-driven lookup, O(1), trivially extensible
const STATUS_CONFIG = {
  pending:   { label: 'Pending',   color: 'yellow',  icon: ClockIcon },
  approved:  { label: 'Approved',  color: 'green',   icon: CheckIcon },
  rejected:  { label: 'Rejected',  color: 'red',     icon: XIcon },
  cancelled: { label: 'Cancelled', color: 'gray',    icon: BanIcon },
  expired:   { label: 'Expired',   color: 'orange',  icon: WarningIcon },
}

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] ?? { label: 'Unknown', color: 'blue', icon: QuestionIcon }
  const Icon = config.icon
  return (
    <Badge color={config.color}>
      <Icon /> {config.label}
    </Badge>
  )
  // The ?? fallback handles any status value not in the map — no silent undefined render.
}

// COMPLEX: component registry — map status → component class, render dynamically
const STEP_COMPONENTS = {
  account:      AccountStep,
  billing:      BillingStep,
  shipping:     ShippingStep,
  confirmation: ConfirmationStep,
}

function CheckoutWizard({ currentStep, ...stepProps }) {
  const StepComponent = STEP_COMPONENTS[currentStep]
  if (!StepComponent) {
    throw new Error(`Unknown checkout step: "${currentStep}". Valid: ${Object.keys(STEP_COMPONENTS).join(', ')}`)
    // Throw early with a diagnostic message — a typo'd step name surfaces immediately
    // instead of rendering undefined (which throws the cryptic "Element type is invalid").
  }
  return <StepComponent {...stepProps} />
}

// COMPLEX: enum with render functions (not just static config)
const NOTIFICATION_RENDERERS = {
  info:    (msg) => <InfoAlert message={msg} />,
  success: (msg) => <SuccessAlert message={msg} />,
  warning: (msg) => <WarningAlert message={msg} />,
  error:   (msg) => <ErrorAlert message={msg} />,
}

function Notification({ type, message }) {
  const render = NOTIFICATION_RENDERERS[type] ?? NOTIFICATION_RENDERERS.info
  return render(message)
}
```
::

## Show/Hide vs Mount/Unmount

::code-wrapper{language="javascript" filename="show_hide_vs_mount.js"}
```javascript
import { useState, useRef, useEffect } from 'react'

// ── MOUNT/UNMOUNT: conditionally render (component is created/destroyed) ──
function TabPanelMount({ activeTab, tabs }) {
  return (
    <div>
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => tabs.onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
      {activeTab === 'overview' && <OverviewPanel />}
      {activeTab === 'details'  && <DetailsPanel />}
      {activeTab === 'reviews'  && <ReviewsPanel />}
      {/* Only the active panel exists in the DOM at any time.
          Switching tabs unmounts the old panel (state lost, effects cleaned up)
          and mounts the new one (fresh state, effects re-run). */}
    </div>
  )
}

// ── SHOW/HIDE: keep mounted, toggle visibility via CSS ──
function TabPanelShowHide({ activeTab, tabs }) {
  return (
    <div>
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => tabs.onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
      <div style={{ display: activeTab === 'overview' ? 'block' : 'none' }}>
        <OverviewPanel />
      </div>
      <div style={{ display: activeTab === 'details' ? 'block' : 'none' }}>
        <DetailsPanel />
      </div>
      <div style={{ display: activeTab === 'reviews' ? 'block' : 'none' }}>
        <ReviewsPanel />
      </div>
      {/* All panels remain mounted — state persists across tab switches.
          But: all panels' effects run simultaneously, all are in the DOM (heavier). */}
    </div>
  )
}

// ── WHEN TO USE WHICH ──
// MOUNT/UNMOUNT (conditional render):
//   ✓ Lightweight panels, no expensive state to preserve
//   ✓ Panels with heavy initial data fetching (only fetch the visible one)
//   ✓ Forms that should reset on tab switch
//   ✗ Bad when: user loses in-progress form data on tab switch

// SHOW/HIDE (CSS display):
//   ✓ Preserve component state (scroll position, form input, expanded accordions)
//   ✓ Avoid re-running expensive effects (data fetching, subscriptions)
//   ✓ Heavy components where mount cost is high (charts, editors, maps)
//   ✗ Bad when: many panels — all are in DOM simultaneously, bloating memory
//   ✗ Bad when: effects should not run when panel is not visible (analytics, polling)

// COMPLEX: hybrid — keep recently-visited panels mounted, unmount distant ones
function SmartTabPanels({ activeTab, tabIds }) {
  const [mountedTabs, setMountedTabs] = useState(new Set([activeTab]))

  useEffect(() => {
    setMountedTabs(prev => new Set([...prev, activeTab]))
    // Once a tab has been visited, keep it mounted (preserve state).
    // Only the active tab is visible; previously-visited tabs are display:none.
  }, [activeTab])

  return (
    <div>
      {tabIds.map(tabId => {
        if (!mountedTabs.has(tabId)) return null  // never-visited: don't mount
        const isVisible = tabId === activeTab
        return (
          <div key={tabId} style={{ display: isVisible ? 'block' : 'none' }}>
            <TabContent tabId={tabId} />
          </div>
        )
      })}
    </div>
  )
}

// ANTI-PATTERN: unmounting to "reset" a form when the user just switched tabs
function BadSettingsPage({ activeSection }) {
  return (
    <div>
      {activeSection === 'profile'   && <ProfileForm />}
      {activeSection === 'security'  && <SecurityForm />}
      {activeSection === 'notifications' && <NotificationForm />}
      {/* User fills half the ProfileForm, clicks Security to check something,
          clicks back to Profile → form is BLANK (unmounted + remounted = state lost).
          Use show/hide or persist form state to parent/Context instead. */}
    </div>
  )
}
```
::

## Extracting Conditional Logic to Variables and Functions

::code-wrapper{language="javascript" filename="extracting_conditionals.js"}
```javascript
import { useState, useMemo } from 'react'

// ANTI-PATTERN: inline complex conditionals in JSX — unreadable
function DashboardBad({ user, permissions, notifications, isLoading }) {
  return (
    <div>
      {(isLoading && !user) ? (
        <Spinner />
      ) : (
        (user && (permissions.includes('admin') || permissions.includes('editor')) && notifications.filter(n => n.unread).length > 0) ? (
          <AdminNotificationBar notifications={notifications.filter(n => n.unread)} />
        ) : null
      )}
    </div>
  )
}

// CORRECT: extract to named variables — self-documenting, testable
function DashboardGood({ user, permissions, notifications, isLoading }) {
  const showLoadingSpinner = isLoading && !user
  const unreadNotifications = notifications.filter(n => n.unread)
  const canManageContent = permissions.includes('admin') || permissions.includes('editor')
  const showNotificationBar = user && canManageContent && unreadNotifications.length > 0

  return (
    <div>
      {showLoadingSpinner && <Spinner />}
      {showNotificationBar && <AdminNotificationBar notifications={unreadNotifications} />}
    </div>
  )
}

// COMPLEX: extract to functions for reusable conditional rendering logic
function ProductCard({ product, user, isFavorite, onToggleFavorite }) {
  const canReview = user && user.id !== product.sellerId && product.isPurchased
  const discountPercent = product.originalPrice
    ? Math.round((1 - product.price / product.originalPrice) * 100)
    : 0
  const showDiscount = discountPercent > 0 && discountPercent < 100

  function renderPrice() {
    if (!showDiscount) return <span className="price">${product.price}</span>
    return (
      <div className="price-group">
        <span className="original-price">${product.originalPrice}</span>
        <span className="sale-price">${product.price}</span>
        <span className="discount-badge">-{discountPercent}%</span>
      </div>
    )
  }

  function renderActions() {
    if (!user) return <SignInToInteract />
    return (
      <div className="actions">
        <FavoriteButton active={isFavorite} onClick={onToggleFavorite} />
        {canReview && <WriteReviewButton productId={product.id} />}
      </div>
    )
  }

  return (
    <article className="product-card">
      <img src={product.image} alt={product.name} />
      <h3>{product.name}</h3>
      {renderPrice()}
      {renderActions()}
    </article>
  )
}

// COMPLEX: useMemo for expensive conditional derivations
function FilteredDataView({ data, filters, searchQuery }) {
  const filteredData = useMemo(() => {
    let result = data
    if (searchQuery) {
      result = result.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    for (const [key, value] of Object.entries(filters)) {
      if (value !== null && value !== undefined && value !== '') {
        result = result.filter(item => item[key] === value)
      }
    }
    return result
  }, [data, filters, searchQuery])

  const hasData = data.length > 0
  const hasResults = filteredData.length > 0
  const hasActiveFilters = Object.values(filters).some(v => v !== null && v !== '')

  if (!hasData) return <EmptyDataState />
  if (!hasResults && hasActiveFilters) return <NoMatchesState onClear={() => filters.clearAll()} />
  if (!hasResults) return <NoDataAfterSearchState query={searchQuery} />

  return (
    <ul>
      {filteredData.map(item => <DataRow key={item.id} item={item} />)}
    </ul>
  )
}
```
::

## Complex Implementation: Multi-State Data Fetching Component

::code-wrapper{language="javascript" filename="data_fetch_component.js"}
```javascript
import { useState, useEffect, useCallback } from 'react'

// A production-grade data-fetching component with all conditional states:
// idle → loading → success (populated | empty) | error → retry

const FETCH_STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
}

function useAsyncData(fetchFn, deps = []) {
  const [state, setState] = useState({ status: FETCH_STATES.IDLE, data: null, error: null })

  const execute = useCallback(async (...args) => {
    setState(prev => ({ ...prev, status: FETCH_STATES.LOADING, error: null }))
    try {
      const data = await fetchFn(...args)
      setState({ status: FETCH_STATES.SUCCESS, data, error: null })
      return data
    } catch (err) {
      setState({ status: FETCH_STATES.ERROR, data: null, error: err })
      throw err
    }
  }, deps)

  const reset = useCallback(() => {
    setState({ status: FETCH_STATES.IDLE, data: null, error: null })
  }, [])

  return { ...state, execute, reset }
}

function DataList({ query, page }) {
  const { status, data, error, execute, reset } = useAsyncData(
    useCallback((q, p) => api.fetchItems({ query: q, page: p }), [])
  )

  useEffect(() => {
    if (query) execute(query, page)
    else reset()
  }, [query, page, execute, reset])

  // ── Conditional rendering via enum + early returns ──
  if (status === FETCH_STATES.IDLE)    return <PromptState message="Enter a search query to begin" />
  if (status === FETCH_STATES.LOADING) return <SkeletonGrid count={12} />
  if (status === FETCH_STATES.ERROR)   return <ErrorState error={error} onRetry={() => execute(query, page)} />

  // status === SUCCESS here — split into populated vs empty
  if (data.items.length === 0) {
    return <EmptyState message={`No results for "${query}"`} suggestion="Try different keywords" />
  }

  return (
    <>
      <ResultCount total={data.total} page={page} />
      <ul>
        {data.items.map(item => (
          <DataCard key={item.id} item={item} />
        ))}
      </ul>
      <Pagination current={page} total={data.totalPages} />
    </>
  )
}
```
::

## Render Props (Legacy but Still Useful)

::code-wrapper{language="javascript" filename="render_props.js"}
```javascript
import { useState, useEffect } from 'react'

// Render prop: a prop whose value is a function returning JSX.
// Useful when a component controls WHEN/WHAT data is available but the consumer
// controls HOW to render it. Predates hooks; still valid for rendering delegation.

function MouseTracker({ children }) {
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handler = (e) => setPos({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', handler)
    return () => window.removeEventListener('mousemove', handler)
  }, [])

  return children(pos)  // children is a FUNCTION, not JSX
}

// Usage:
<MouseTracker>
  {({ x, y }) => <p>Mouse at ({x}, {y})</p>}
</MouseTracker>

// ANTI-PATTERN: using render prop for pure logic reuse when a custom hook is simpler
// Render props add a component nesting level and re-create the function every render.
// For LOGIC reuse (not rendering delegation), use a custom hook:
function useMousePosition() {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  useEffect(() => {
    const handler = (e) => setPos({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', handler)
    return () => window.removeEventListener('mousemove', handler)
  }, [])
  return pos
}
// Usage: const { x, y } = useMousePosition() — no wrapper component, no extra nesting.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Idiom] Use ternary for exactly 2 branches, && for "render or nothing",
// early returns for 3+ whole-component branches, enum objects for N-value lookups.

// [Performance] Show/hide (CSS display:none) preserves state and avoids remount cost
// for heavy components (charts, editors). Mount/unmount saves DOM weight but loses state.
// Use the hybrid "keep visited mounted" pattern for tabbed UIs with expensive panels.

// [Debug] "Rendered fewer hooks than expected" = a hook is after an early return.
// Move ALL hooks above ALL conditional returns. Hook count must be constant per render.

// [Idiom] Extract complex inline conditionals to named boolean variables:
//   const canEdit = user && user.role === 'admin' && !isLocked
//   {canEdit && <EditButton />}
// Self-documenting, testable, and the JSX stays clean.

// [Safety] Always provide a fallback for enum lookups:
//   STATUS_CONFIG[status] ?? <Fallback />  or  STATUS_CONFIG[status] || defaultConfig
// Without it, an unexpected status renders undefined (nothing) silently.

// [Idiom] For component registries, throw with a diagnostic message on unknown keys:
//   if (!Component) throw new Error(`Unknown step: "${step}". Valid: ${keys}`)
// This surfaces typos immediately instead of the cryptic "Element type is invalid".
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] {count && <Badge />} renders "0" when count is 0.
// Zero is a number — React renders it. Use {count > 0 && <Badge />} or a ternary.

// [Gotcha] Mixing && and || for branching: {cond && <A /> || <B />}
// If <A /> returns null/0/false, the || fallback fires even when cond was true.
// Use a ternary: {cond ? <A /> : <B />}

// [Gotcha] Hooks after early returns don't just warn — they corrupt hook state.
// React tracks hooks by call order. If a hook is skipped, every subsequent hook
// shifts position, reading the wrong state slot. The "fewer hooks" error is React
// protecting you, but the corruption already happened for that render.

// [Gotcha] Enum lookup with no fallback renders undefined (nothing) — no error, no warning.
// STATUS_ICONS['unknown_status'] → undefined → React renders nothing → silent UI gap.

// [Gotcha] Component registry typo: STEP_COMPONENTS['acount'] (typo) → undefined.
// Rendering <undefined /> throws "Element type is invalid: expected a string or
// a component but got: undefined." — one of React's most cryptic errors.

// [Gotcha] CSS display:none panels still run effects (useEffect, subscriptions, polling).
// If a hidden panel sets up an interval or WebSocket, it keeps running invisibly.
// Use a "visible" prop and guard effects: useEffect(() => { if (!visible) return; ... })

// [Gotcha] show/hide with display:none does not prevent the component from being
// in the accessibility tree. Use aria-hidden="true" on hidden panels, or consider
// conditional rendering for screen-reader-only content.
```
::

## 🧠 Spot the Bug

A notification badge shows the unread count, but sometimes displays a stray `0` on the page:

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
```javascript
function NotificationBadge({ notifications }) {
  return (
    <nav>
      <a href="/home">Home</a>
      <a href="/inbox">
        Inbox
        {notifications.length && <sup className="badge">{notifications.length}</sup>}
      </a>
    </nav>
  )
}
```
::

<details>
<summary>Answer</summary>

`notifications.length && <sup>...</sup>` — when `notifications` is an empty array, `length` is `0`. React renders numbers, and `0` is a number — so the expression evaluates to `0`, which React renders as the text `"0"` next to "Inbox". The `&&` short-circuits but the falsy value itself (`0`) is still rendered because it's not `false`, `null`, or `undefined`.

**Fix**: use an explicit comparison that produces a boolean:

```javascript
{notifications.length > 0 && <sup className="badge">{notifications.length}</sup>}
```

`> 0` evaluates to `true`/`false`, and `false` is ignored by React (renders nothing). The same trap applies to `array.filter(...).length && ...` — always use `> 0` or a ternary with `null`.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. Ternary = 2 branches. && = "render or nothing" (use strict boolean, never bare
//    .length or a number — 0 renders as "0"). Early returns = 3+ whole-component branches.

// 2. The zero-gotcha: {count && <X />} renders "0" when count is 0. Always use
//    {count > 0 && <X />} or {count ? <X /> : null}.

// 3. All hooks MUST come before any early return. Hook call count must be constant
//    on every render — a hook after a conditional return corrupts hook state.

// 4. Enum objects replace if/else chains for N-value lookups — O(1), data-driven,
//    trivially extensible. Always provide a ?? fallback for unknown keys.

// 5. Mount/unmount (conditional render) loses state but saves DOM weight.
//    Show/hide (CSS display) preserves state but keeps all panels in DOM.
//    Use the hybrid "keep visited tabs mounted" pattern for expensive tabbed UIs.

// 6. Extract complex inline conditionals to named variables/functions —
//    self-documenting, testable, keeps JSX readable. Use useMemo for expensive derivations.

// 7. Render props are still valid for rendering delegation (component controls when,
//    consumer controls how). For pure logic reuse, prefer custom hooks — no extra nesting.
```
::