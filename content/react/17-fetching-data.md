---
title: "17 — Fetching Data"
description: "useEffect + fetch and why it's not ideal, the four fetch states, race conditions and AbortController, loading state patterns, retry with backoff, waterfalls vs parallel fetching, React Query vs SWR comparison, caching strategies, and Suspense for data fetching (React 18+). Code-first reference for mid-to-senior React engineers."
---

# 17 — Fetching Data

## The Four States Every Fetch Needs

::code-wrapper{language="javascript" filename="four_states.js"}
```javascript
// A production-grade fetch is never just "loading or not" — it needs at minimum:
// IDLE, LOADING, ERROR, SUCCESS, and SUCCESS often needs a further distinction
// for an empty result set (chapter 12).

function UserProfile({ userId }) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null })

  useEffect(() => {
    setState({ status: 'loading', data: null, error: null })

    fetch(`/api/users/${userId}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        // fetch() does NOT reject for HTTP error statuses (404, 500) — only for
        // genuine network failures. A 404 is a successful round trip carrying an
        // error code. Skipping res.ok is the #1 data-fetching bug: "not found"
        // silently treated as "success" with undefined data.
        return res.json()
      })
      .then(data => setState({ status: 'success', data, error: null }))
      .catch(error => setState({ status: 'error', data: null, error }))
  }, [userId])

  if (state.status === 'loading') return <Spinner />
  if (state.status === 'error') return <ErrorMessage error={state.error} />
  if (state.data.length === 0) return <EmptyState />
  return <ProfileCard user={state.data} />
}
```
::

### Anti-Pattern: Boolean Loading Flag

::code-wrapper{language="javascript" filename="boolean_loading.js"}
```javascript
// ANTI-PATTERN: a single boolean `isLoading` can't distinguish "haven't started
// yet" from "started and failed" from "started and succeeded" — and conflates
// error + empty into the same "no data" state, making UI branching ambiguous.

function BadFetch({ userId }) {
  const [data, setData] = useState(null)
  const [isLoading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then(res => res.json())
      .then(data => { setData(data); setLoading(false) })
      .catch(() => setLoading(false))  // error swallowed — "done" but no data, no error UI
  }, [userId])

  if (isLoading) return <Spinner />
  return <ProfileCard user={data} />  // if fetch failed, data is null → crash in ProfileCard
}
```
::

## The Race Condition: Fast Successive Requests

::code-wrapper{language="javascript" filename="race_condition.js"}
```javascript
// If the triggering value (userId, query) changes again before the first request
// resolves, both requests are in flight simultaneously, and WHICHEVER RESOLVES
// LAST WINS — not whichever was REQUESTED last.

function SearchResults({ query }) {
  const [results, setResults] = useState([])

  useEffect(() => {
    // BROKEN: no protection against out-of-order resolution.
    // User types "react" → fires requests for "r", "re", "rea", "reac", "react".
    // If "r" (returning thousands of results, genuinely slow) resolves AFTER
    // "react", the stale "r" results overwrite the correct "react" results —
    // with no error and no visible sign anything went wrong.
    fetch(`/api/search?q=${query}`)
      .then(res => res.json())
      .then(data => setResults(data.results))
  }, [query])

  return <ul>{results.map(r => <li key={r.id}>{r.title}</li>)}</ul>
}
```
::

### Fix 1: The `cancelled` Flag

::code-wrapper{language="javascript" filename="cancelled_flag.js"}
```javascript
// Each effect run closes over its own independent `cancelled` variable. When
// `query` changes, React runs the PREVIOUS effect's cleanup first, flipping
// THAT run's `cancelled` to true before starting the new effect with a fresh
// `cancelled = false`. The stale request's .then() still fires, but its result
// is discarded because its closure's `cancelled` is true by then.

function SearchResults({ query }) {
  const [results, setResults] = useState([])

  useEffect(() => {
    let cancelled = false

    fetch(`/api/search?q=${query}`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled) setResults(data.results)
        // If a newer effect run already set cancelled = true for this closure,
        // this stale response is discarded instead of overwriting fresher data.
      })

    return () => { cancelled = true }
  }, [query])

  return <ul>{results.map(r => <li key={r.id}>{r.title}</li>)}</ul>}
}
```
::

### Fix 2: `AbortController` (Actually Cancels the Request)

::code-wrapper{language="javascript" filename="abort_controller.js"}
```javascript
// The cancelled-flag prevents a stale response from being APPLIED, but the
// underlying network request still completes, wasting bandwidth and server
// resources. AbortController actually CANCELS the request itself.

function SearchResults({ query }) {
  const [results, setResults] = useState([])

  useEffect(() => {
    const controller = new AbortController()

    fetch(`/api/search?q=${query}`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => setResults(data.results))
      .catch(err => {
        if (err.name !== 'AbortError') throw err
        // AbortError is EXPECTED — it fires every time a newer request supersedes
        // this one. Rethrowing anything else preserves visibility into genuine failures.
        // Treating every abort as a real error would show a misleading error message
        // every time the user types another character — not actually a failure.
      })

    return () => controller.abort()
  }, [query])

  return <ul>{results.map(r => <li key={r.id}>{r.title}</li>)}</ul>}
}

// When to use which:
// - cancelled flag: simpler, sufficient for UI-correctness with cheap requests
// - AbortController: additionally saves network/server resources — worth it for
//   expensive requests or high-frequency scenarios like search-as-you-type
```
::

## Loading States That Don't Flicker

::code-wrapper{language="javascript" filename="delayed_loading.js"}
```javascript
// A request resolving in 50ms and one in 5 seconds both pass through "loading" —
// but showing a spinner for 50ms produces a distracting flash, not useful feedback.
// A minimum-duration or delayed-appearance strategy smooths this out.

function useDelayedLoading(isLoading, delayMs = 300) {
  const [showLoading, setShowLoading] = useState(false)

  useEffect(() => {
    if (!isLoading) {
      setShowLoading(false)
      return
    }
    // Only show the spinner if loading takes longer than delayMs — fast requests
    // resolve before the timeout fires, and the cleanup cancels it, so the UI
    // goes straight from "nothing" to "content" with no flash.
    const id = setTimeout(() => setShowLoading(true), delayMs)
    return () => clearTimeout(id)
  }, [isLoading, delayMs])

  return showLoading
}

// Usage:
function UserProfile({ userId }) {
  const { status, data } = useFetch(`/api/users/${userId}`)
  const showSpinner = useDelayedLoading(status === 'loading', 300)

  if (showSpinner) return <Spinner />
  if (status === 'error') return <ErrorMessage />
  return <ProfileCard user={data} />
}
```
::

## Retrying Failed Requests with Backoff

::code-wrapper{language="javascript" filename="retry_backoff.js"}
```javascript
// Real networks fail transiently — retry with backoff often succeeds where a
// single attempt wouldn't, and is better UX than an immediate permanent error
// state for a one-off blip.

async function fetchWithRetry(url, { retries = 3, backoffMs = 500 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      const isLastAttempt = attempt === retries
      if (isLastAttempt) throw err
      // Exponential backoff: 500ms, 1000ms, 2000ms, 4000ms...
      // Retrying a genuinely down server immediately adds load precisely when
      // it's least able to handle it; backoff gives transient issues time to resolve.
      await new Promise(resolve => setTimeout(resolve, backoffMs * 2 ** attempt))
    }
  }
}

// With AbortController support:
async function fetchWithRetryAndAbort(url, signal, { retries = 3, backoffMs = 500 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (err.name === 'AbortError') throw err  // don't retry aborts
      if (attempt === retries) throw err
      await new Promise(resolve => setTimeout(resolve, backoffMs * 2 ** attempt))
    }
  }
}
```
::

## Waterfalls vs Parallel Fetching

::code-wrapper{language="javascript" filename="waterfalls.js"}
```javascript
// WATERFALL: sequential fetches — each waits for the previous to complete.
// Total time = sum of all request times. Easy to write, slow at scale.

function UserProfile({ userId }) {
  const [user, setUser] = useState(null)
  const [posts, setPosts] = useState(null)
  const [friends, setFriends] = useState(null)

  useEffect(() => {
    // Fetch user → wait → fetch posts → wait → fetch friends → wait
    fetch(`/api/users/${userId}`).then(r => r.json()).then(u => {
      setUser(u)
      fetch(`/api/users/${userId}/posts`).then(r => r.json()).then(p => {
        setPosts(p)
        fetch(`/api/users/${userId}/friends`).then(r => r.json()).then(setFriends)
      })
    })
  }, [userId])
  // If each request takes 200ms, total = 600ms. Three independent requests
  // that could run in parallel take 3x as long as necessary.
}

// FIX: parallel fetching with Promise.all — total time = slowest request.
function UserProfileParallel({ userId }) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null })

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading', data: null, error: null })

    Promise.all([
      fetch(`/api/users/${userId}`, { signal: controller.signal }).then(r => r.json()),
      fetch(`/api/users/${userId}/posts`, { signal: controller.signal }).then(r => r.json()),
      fetch(`/api/users/${userId}/friends`, { signal: controller.signal }).then(r => r.json()),
    ])
      .then(([user, posts, friends]) => {
        setState({ status: 'success', data: { user, posts, friends }, error: null })
      })
      .catch(err => {
        if (err.name !== 'AbortError') setState({ status: 'error', data: null, error: err })
      })

    return () => controller.abort()
  }, [userId])

  // If each request takes 200ms, total = 200ms (all run simultaneously).
  if (state.status === 'loading') return <Spinner />
  if (state.status === 'error') return <ErrorMessage error={state.error} />
  return <Profile {...state.data} />
}
```
::

### Partial Parallel: When Some Requests Depend on Others

::code-wrapper{language="javascript" filename="partial_parallel.js"}
```javascript
// Some requests DEPEND on data from a previous one (e.g. fetch user → get
// their team ID → fetch team members). The trick: parallelize the independent
// ones, waterfall only the dependent ones.

async function fetchDashboardData(userId) {
  // Step 1: fetch user (needed for teamId) — must wait
  const user = await fetch(`/api/users/${userId}`).then(r => r.json())

  // Step 2: fetch posts and team members in parallel (both only need userId,
  // not each other) — but teamId comes from user, so this is actually:
  const [posts, team] = await Promise.all([
    fetch(`/api/users/${userId}/posts`).then(r => r.json()),
    fetch(`/api/teams/${user.teamId}/members`).then(r => r.json()),
  ])

  return { user, posts, team }
}

// Even better: Promise.allSettled — if one request fails, you still get the
// others, allowing partial UI rendering instead of all-or-nothing.
async function fetchDashboardDataPartial(userId) {
  const [userResult, postsResult, friendsResult] = await Promise.allSettled([
    fetch(`/api/users/${userId}`).then(r => r.json()),
    fetch(`/api/users/${userId}/posts`).then(r => r.json()),
    fetch(`/api/users/${userId}/friends`).then(r => r.json()),
  ])

  return {
    user: userResult.status === 'fulfilled' ? userResult.value : null,
    posts: postsResult.status === 'fulfilled' ? postsResult.value : [],
    friends: friendsResult.status === 'fulfilled' ? friendsResult.value : [],
    errors: {
      user: userResult.status === 'rejected' ? userResult.reason : null,
      posts: postsResult.status === 'rejected' ? postsResult.reason : null,
      friends: friendsResult.status === 'rejected' ? friendsResult.reason : null,
    },
  }
}
```
::

## React Query (TanStack Query): The Production Standard

::code-wrapper{language="javascript" filename="react_query.js"}
```javascript
// Every pattern above — status tracking, race protection, aborting, delayed
// loading, retries — is correct, and still doesn't cover caching, refetch-on-
// focus, request deduplication, or pagination/infinite-scroll data merging.
// React Query (now TanStack Query) solves ALL of this.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

function UserProfile({ userId }) {
  const { data, status, error, isFetching } = useQuery({
    queryKey: ['user', userId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    // The queryKey is the mechanism that gives all the "hard parts" for free:
    // - DEDUP: concurrent requests for the same key are merged into one fetch
    // - CACHE: a second component mounting with the same key gets cached data instantly
    // - RACE CONDITIONS: automatically handled — key changes → old query discarded
    // - REFETCH: automatically on window refocus or network reconnect (configurable)
  })

  if (status === 'pending') return <Spinner />
  if (status === 'error') return <ErrorMessage error={error} />
  // isFetching is true during background refetches even when data is already shown
  // — use it for a subtle "refreshing" indicator, not a full spinner.
  return (
    <div>
      {isFetching && <RefreshIndicator />}
      <ProfileCard user={data} />
    </div>
  )
}
```
::

### Mutations and Cache Invalidation

::code-wrapper{language="javascript" filename="react_query_mutations.js"}
```javascript
import { useMutation, useQueryClient } from '@tanstack/react-query'

function EditProfileForm({ userId }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (updates) => fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }),
    onSuccess: () => {
      // Invalidate the cached query so every component reading it refetches
      // fresh data — no manual state synchronization needed.
      queryClient.invalidateQueries({ queryKey: ['user', userId] })
    },
  })

  function handleSubmit(e) {
    e.preventDefault()
    mutation.mutate({ name: e.target.name.value })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" defaultValue="" />
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Saving…' : 'Save'}
      </button>
      {mutation.isError && <p className="error">{mutation.error.message}</p>}
      {mutation.isSuccess && <p className="success">Saved!</p>}
    </form>
  )
}
```
::

### Caching Strategies with React Query

::code-wrapper{language="javascript" filename="query_caching.js"}
```javascript
// React Query's caching is configurable per query via the options object.

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,      // data is fresh for 1 minute — no refetch on focus
      gcTime: 5 * 60 * 1000,     // garbage-collect unused cache after 5 minutes
      retry: 3,                   // retry failed requests 3 times
      refetchOnWindowFocus: true, // refetch when the user returns to the tab
      refetchOnReconnect: true,   // refetch when network reconnects
    },
  },
})

// Per-query overrides:
function ProductList({ category }) {
  const { data } = useQuery({
    queryKey: ['products', category],
    queryFn: () => fetch(`/api/products?cat=${category}`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,  // products change rarely — 5 min stale time
    refetchOnWindowFocus: false,  // don't refetch on focus (products don't change that fast)
  })
  return <ProductGrid products={data} />
}

function LiveScores() {
  const { data } = useQuery({
    queryKey: ['scores'],
    queryFn: () => fetch('/api/scores').then(r => r.json()),
    refetchInterval: 10 * 1000,  // poll every 10 seconds (live data)
    staleTime: 0,                // always stale → always refetch on focus
  })
  return <Scoreboard scores={data} />
}

// OPTIMISTIC UPDATES: update the cache immediately, rollback on error
function useOptimisticUpdate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (newTodo) => fetch('/api/todos', { method: 'POST', body: JSON.stringify(newTodo) }),
    onMutate: async (newTodo) => {
      await queryClient.cancelQueries({ queryKey: ['todos'] })
      const previousTodos = queryClient.getQueryData(['todos'])
      queryClient.setQueryData(['todos'], (old) => [...old, newTodo])  // optimistic add
      return { previousTodos }  // context for rollback
    },
    onError: (err, newTodo, context) => {
      queryClient.setQueryData(['todos'], context.previousTodos)  // rollback on error
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })  // always refetch after
    },
  })
}
```
::

## SWR: The Stale-While-Revalidate Alternative

::code-wrapper{language="javascript" filename="swr.js"}
```javascript
// SWR (from Vercel, named after HTTP's stale-while-revalidate caching strategy)
// solves largely the same problem set as React Query with a smaller API surface
// and a different philosophy: show cached (possibly stale) data immediately
// while silently refetching in the background.

import useSWR from 'swr'

const fetcher = (url) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
})

function UserProfile({ userId }) {
  const { data, error, isLoading, isValidating } = useSWR(
    `/api/users/${userId}`,  // the key (also the URL passed to fetcher)
    fetcher,
    {
      revalidateOnFocus: true,
      refreshInterval: 0,       // no polling by default
      dedupingInterval: 2000,   // dedupe requests within 2s
    }
  )

  if (isLoading) return <Spinner />
  if (error) return <ErrorMessage error={error} />
  return (
    <div>
      {isValidating && <RefreshIndicator />}
      <ProfileCard user={data} />
    </div>
  )
}

// SWR mutation (manual revalidation):
function EditProfileForm({ userId }) {
  const { data, mutate } = useSWR(`/api/users/${userId}`)

  async function handleSubmit(e) {
    e.preventDefault()
    const updates = { name: e.target.name.value }
    // Optimistic update:
    mutate({ ...data, ...updates }, false)  // false = don't revalidate yet
    await fetch(`/api/users/${userId}`, { method: 'PATCH', body: JSON.stringify(updates) })
    mutate()  // revalidate (refetch the real data)
  }
}
```
::

### React Query vs SWR Comparison

::code-wrapper{language="javascript" filename="rq_vs_swr.js"}
```javascript
// Feature comparison:

// | Feature              | React Query              | SWR                     |
// |----------------------|--------------------------|-------------------------|
// | API surface          | Larger, more explicit    | Smaller, more implicit  |
// | DevTools             | Excellent built-in       | Limited                 |
// | Mutations            | First-class useMutation  | Manual via mutate()     |
// | Optimistic updates   | Built-in onMutate/onError| Manual                  |
// | Infinite queries     | useInfiniteQuery         | useSWRInfinite          |
// | Prefetching          | queryClient.prefetchQuery| mutate with data        |
// | SSR support          | hydrateQueryClient       | useSWR + fallback       |
// | Framework agnostic   | Yes (TanStack Query)     | Yes                     |
// | Bundle size          | ~13KB                    | ~5KB                    |
// | Philosophy           | Explicit status machine  | Show stale, revalidate  |

// WHEN TO CHOOSE REACT QUERY:
// - Complex caching/mutation needs (optimistic updates, prefetch, invalidation)
// - Need rich DevTools for debugging query state
// - Large app with many interdependent queries
// - Need fine-grained control over retry, refetch, gc strategies

// WHEN TO CHOOSE SWR:
// - Smaller app, simpler needs
// - Want the smallest possible bundle
// - Prefer implicit "just show data and refetch" over explicit status management
// - Mostly read-heavy with few mutations
```
::

## `isLoading` vs `isFetching`: A Critical Distinction

::code-wrapper{language="javascript" filename="loading_vs_fetching.js"}
```javascript
// When migrating from hand-rolled fetching to React Query/SWR, a common mistake
// is conflating these two states:

// isLoading (React Query) / isLoading (SWR):
//   True when there is NO data yet at all — the first fetch is in progress.
//   After the first successful fetch, isLoading is forever false (even during
//   background refetches) because cached data exists.

// isFetching (React Query) / isValidating (SWR):
//   True whenever a request is in progress, INCLUDING background refetches when
//   cached data is already shown. False when no request is active.

// PRACTICAL IMPACT:
function ProductList() {
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts,
  })

  // WRONG: using isLoading for the spinner — after the first load, background
  // refetches (on focus, on reconnect) won't show ANY indicator because
  // isLoading is false (data already exists from cache).
  if (isLoading) return <FullScreenSpinner />

  // CORRECT: use isLoading for the initial full-screen state, isFetching for
  // a subtle background-refresh indicator on top of existing data.
  if (isLoading) return <FullScreenSpinner />
  return (
    <div>
      {isFetching && <RefreshBar />}  {/* subtle top-bar shimmer, not a full spinner */}
      <ProductGrid products={data} />
    </div>
  )
}
```
::

## Suspense for Data Fetching (React 18+)

::code-wrapper{language="javascript" filename="suspense.js"}
```javascript
// React 18 introduced Suspense for data fetching: a component can "suspend"
// (throw a promise) while waiting for data, and a parent <Suspense> boundary
// catches it and shows a fallback until the promise resolves.

import { Suspense } from 'react'

// With React Query's experimental Suspense mode:
function UserProfile({ userId }) {
  // useSuspenseQuery throws a promise if data isn't ready — the nearest
  // <Suspense> boundary catches it and shows its fallback.
  const { data } = useSuspenseQuery({
    queryKey: ['user', userId],
    queryFn: () => fetch(`/api/users/${userId}`).then(r => r.json()),
  })
  // `data` is ALWAYS defined here — no null check needed. If data wasn't ready,
  // the component suspended above this line and never reached this point.
  return <ProfileCard user={data} />
}

// The parent handles the loading state declaratively:
function Page({ userId }) {
  return (
    <Suspense fallback={<Spinner />}>
      <UserProfile userId={userId} />
    </Suspense>
  )
}

// NESTED SUSPENSE: each boundary can have its own fallback, so parts of the
// page load independently without blocking each other.
function Dashboard({ userId }) {
  return (
    <div>
      <Suspense fallback={<HeaderSkeleton />}>
        <Header userId={userId} />
      </Suspense>
      <Suspense fallback={<FeedSkeleton />}>
        <ActivityFeed userId={userId} />
      </Suspense>
      <Suspense fallback={<ChartSkeleton />}>
        <AnalyticsChart userId={userId} />
      </Suspense>
    </div>
  )
  // Header, Feed, and Chart all fetch in parallel and render independently as
  // their data arrives — no single slow request blocks the others.
}
```
::

### Suspense + Error Boundaries

::code-wrapper{language="javascript" filename="suspense_errors.js"}
```javascript
// Suspense catches suspended PROMISES, not ERRORS. A fetch error during a
// suspended render is thrown synchronously after the promise rejects — that
// error needs an ERROR BOUNDARY (chapter 16), not a Suspense boundary.

import { Suspense } from 'react'
import { ErrorBoundary } from 'react-error-boundary'

function Page({ userId }) {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Suspense fallback={<Spinner />}>
        <UserProfile userId={userId} />
      </Suspense>
    </ErrorBoundary>
  )
  // The ErrorBoundary wraps the Suspense boundary — if the suspended fetch
  // rejects, the error propagates to the ErrorBoundary, which shows its fallback.
}
```
::

## Why Hand-Rolled Fetching Hits a Ceiling

::code-wrapper{language="javascript" filename="ceiling.js"}
```javascript
// A complete hand-rolled data-fetching solution would need to implement:
//
// Status tracking (loading/error/success)          — covered above
// Race condition protection (cancelled/Abort)      — covered above
// Loading state debounce                           — covered above
// Retry with backoff                               — covered above
// Parallel fetching                                — covered above
// Caching across components                        — NOT covered (complex)
// Request deduplication                            — NOT covered (complex)
// Refetch on window focus                          — NOT covered (complex)
// Refetch on network reconnect                     — NOT covered (complex)
// Pagination/infinite scroll with data merging     — NOT covered (very complex)
// Optimistic updates with rollback                 — NOT covered (very complex)
// Prefetching for navigation                       — NOT covered (complex)
// Garbage collection of stale cache entries        — NOT covered (complex)
//
// Reimplementing ALL of this per-project is a multi-week investment that
// React Query and SWR already solved and battle-tested across thousands of
// production codebases. Reach for one the moment a project needs more than
// one of: caching, refetch-on-focus, deduplication, or pagination.

// WHEN hand-rolled fetching is FINE:
// - A single one-off fetch in a small component (use the cancelled-flag pattern)
// - A prototype or throwaway app
// - A learning exercise (understanding the fundamentals)
// - An app where the data layer is handled elsewhere (e.g. Next.js Server
//   Components, Remix loaders, tRPC)

// WHEN to reach for React Query / SWR:
// - More than one component needs the same data (caching + dedup matter)
// - You need refetch-on-focus or reconnect
// - You need pagination, infinite scroll, or optimistic updates
// - You need to coordinate mutations with cache invalidation
// - You want DevTools to inspect query state
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Debug] Always check res.ok (or res.status) explicitly after fetch() — a 404
// or 500 is NOT a rejected promise. Skipping this check is the #1 cause of "the
// error state never shows" bugs in hand-rolled fetch code.

// [Idiom] Use the cancelled-flag as the default race guard for simple fetches;
// upgrade to AbortController when a request is expensive enough that actually
// cancelling it (not just ignoring its result) matters.

// [Idiom] Delay showing a loading spinner by ~200-300ms — most real requests
// resolve faster than a user can register a flash, and an instant-appearing,
// instant-disappearing spinner reads as visual noise.

// [Performance] Use Promise.all for independent requests, Promise.allSettled
// when partial success is acceptable (show what loaded, error indicator for what
// didn't). Waterfall ONLY when a request depends on data from a previous one.

// [Performance] Reach for React Query or SWR the moment a project needs more
// than one of: caching across components, refetch-on-focus, deduplication, or
// pagination — re-deriving all of these by hand is a multi-day investment
// libraries already solved and battle-tested.

// [Debug] When testing retry/backoff logic, point at an endpoint that always
// fails (or throttle the network in DevTools) rather than relying on a real
// flaky service to happen to fail during testing — deterministic failure is
// faster to iterate against.

// [Idiom] Distinguish isLoading (no data yet) from isFetching (background
// refetch with cached data present) in your UI — use isLoading for full-screen
// spinners, isFetching for subtle indicators like a top-bar shimmer.

// [Idiom] In React Query, set staleTime > 0 for data that changes rarely
// (products, config) to avoid unnecessary refetches on every focus. Use
// refetchInterval for live data (scores, dashboards).
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] fetch() only rejects for network-level failures, NEVER for HTTP error
// status codes — a 404, 401, or 500 resolves the promise successfully. Always
// check response.ok or response.status before treating a response as valid data.

// [Gotcha] Fast successive requests can resolve out of order, letting a stale
// response overwrite fresher data with no error or warning — a genuine race
// condition, not a hypothetical one. Shows up constantly in search-as-you-type
// and rapidly-changing-filter UIs. Guard with cancelled flag or AbortController.

// [Gotcha] AbortController's abort produces a rejected promise with
// err.name === 'AbortError', which must be distinguished from genuine failures
// in .catch() — treating every abort as a real error surfaces a misleading
// error message every time a newer request supersedes an older one.

// [Gotcha] Retrying with no backoff (or worse, retrying on every render due to
// a missing/incorrect dependency array) can amplify load on a struggling server
// precisely when it's least able to handle it. Always space retries with
// exponential backoff, always scope retry logic inside useEffect with a correct
// dependency array, NEVER inline in the render body.

// [Gotcha] Data-fetching libraries' caching means a component can render
// "instantly" with stale cached data before a background refetch completes —
// this is the intended stale-while-revalidate behavior, not a bug. isLoading
// (no data yet) and isFetching (background refetch, data present) are
// meaningfully different states that a naive migration often conflates.

// [Gotcha] Promise.all rejects entirely if ANY single promise rejects — if you
// need partial success (some data even if one request fails), use
// Promise.allSettled and check each result's status individually.

// [Gotcha] In React 18 Strict Mode (dev), effects run twice (mount → unmount →
// mount). This means useEffect-based fetches fire twice in development — your
// AbortController cleanup MUST work correctly or you'll see double requests and
// potential state-update-after-unmount warnings. React Query/SWR handle this
// automatically via their deduplication.

// [Gotcha] JSON.parse can throw on malformed responses (e.g. a 200 OK with HTML
// body from a misconfigured proxy) — wrap res.json() in try/catch or handle the
// rejection, or you'll get an unhandled rejection with no useful error message.
```
::

## 🧠 Spot the Bug

An autocomplete search box occasionally flashes results for an old, already-abandoned query text before settling on the correct results:

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
```javascript
function Autocomplete({ query }) {
  const [suggestions, setSuggestions] = useState([])

  useEffect(() => {
    fetch(`/api/suggest?q=${query}`)
      .then(res => res.json())
      .then(data => setSuggestions(data.suggestions))
  }, [query])

  return (
    <ul>
      {suggestions.map(s => <li key={s}>{s}</li>)}
    </ul>
  )
}
```
::

<details>
<summary>Answer</summary>

There is no guard against out-of-order resolution — every keystroke fires a new `fetch`, and nothing prevents an older, slower-resolving request's `.then()` from calling `setSuggestions` **after** a newer, faster-resolving request has already set the correct results. Whichever request resolves last wins, regardless of which query text it was actually for.

**Fix**: add a `cancelled` flag or `AbortController` tied to the effect's cleanup:

```javascript
function Autocomplete({ query }) {
  const [suggestions, setSuggestions] = useState([])

  useEffect(() => {
    const controller = new AbortController()

    fetch(`/api/suggest?q=${query}`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => setSuggestions(data.suggestions))
      .catch(err => {
        if (err.name !== 'AbortError') console.error(err)
      })

    return () => controller.abort()
  }, [query])

  return <ul>{suggestions.map(s => <li key={s}>{s}</li>)}</ul>
}
```

The lesson: any `useEffect`-based fetch whose triggering value can change again before the current request resolves needs an explicit guard — without one, "last requested" and "last resolved" are two different things, and only one is safe to trust.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. A production fetch needs at least loading/error/success states, often an
//    explicit empty-success state. fetch() NEVER rejects for HTTP error statuses
//    — always check res.ok manually.

// 2. Fast successive requests resolve out of order — guard every useEffect-based
//    fetch with a cancelled flag or AbortController tied to the effect's cleanup.
//    AbortController additionally cancels the underlying network request, saving
//    bandwidth for expensive or high-frequency fetches.

// 3. Delay showing loading indicators by ~200-300ms to avoid flashing a spinner
//    for requests that resolve almost instantly.

// 4. Retry transient failures with exponential backoff — immediate, unbounded
//    retries worsen load on an already-struggling server.

// 5. Use Promise.all for parallel independent requests (total = slowest, not
//    sum). Use Promise.allSettled when partial success is acceptable. Waterfall
//    ONLY when a request depends on data from a previous one.

// 6. React Query and SWR solve caching, deduplication, refetch-on-focus, race
//    conditions, pagination, and optimistic updates that hand-rolled useEffect
//    fetching handles poorly or not at all. Reach for one once data needs exceed
//    simple one-off fetches.

// 7. Distinguish isLoading (no data yet, full spinner) from isFetching (background
//    refetch with cached data, subtle indicator) — conflating them is the most
//    common migration mistake from hand-rolled to library-based fetching.

// 8. Suspense for data fetching (React 18+) lets components declaratively suspend
//    while waiting for data — the parent <Suspense> handles the fallback, and
//    an ErrorBoundary handles fetch errors. No null checks needed in the suspended
//    component (data is always defined when it renders).

// 9. React Query vs SWR: React Query for complex caching/mutation needs and rich
//    DevTools; SWR for smaller apps wanting the smallest bundle and implicit
//    stale-while-revalidate behavior.
```
::