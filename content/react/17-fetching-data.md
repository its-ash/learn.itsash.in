# 17 — Fetching Data

Chapter 11 introduced `useFetch` as a custom-hook exercise. This chapter treats data fetching as its own subject: the full set of states a real request needs, the race conditions plain `useEffect`-based fetching is prone to, and why virtually every production React codebase eventually reaches for a dedicated data-fetching library instead of hand-rolling this forever.

## The Four States Every Fetch Needs

A production-grade fetch is never just "loading or not" — it needs at minimum: **idle** (before any request has started, if applicable), **loading**, **error**, and **success**, and `success` itself often needs a further distinction for an empty result set (chapter 12).

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

  if (state.status === 'loading') return <Spinner />
  if (state.status === 'error') return <ErrorMessage error={state.error} />
  return <ProfileCard user={state.data} />
}
```
::

Note `res.ok` is checked explicitly — `fetch()` does **not** reject its promise for HTTP error statuses like `404` or `500`; it only rejects for genuine network failures (DNS resolution failure, no connectivity, CORS being blocked). A response with a `404` status is, as far as `fetch()` is concerned, a perfectly successful round trip that happens to carry an error status code — skipping the `res.ok` check is one of the most common real-world data-fetching bugs, silently treating "not found" as "success" and passing malformed data downstream.

## The Race Condition: Fast Successive Requests

The `useFetch` hook shown in chapter 11 includes a `cancelled` flag specifically to guard against a genuine, common production bug: if `userId` changes again before the first request resolves, both requests are in flight simultaneously, and **whichever resolves last wins** — not whichever was *requested* last.

::code-wrapper{language="javascript"}
```javascript
function SearchResults({ query }) {
  const [results, setResults] = useState([])

  useEffect(() => {
    // BROKEN: no protection against out-of-order resolution
    fetch(`/api/search?q=${query}`)
      .then(res => res.json())
      .then(data => setResults(data.results))
  }, [query])

  return <ul>{results.map(r => <li key={r.id}>{r.title}</li>)}</ul>
}
```
::

A user typing "react" quickly fires requests for `"r"`, `"re"`, `"rea"`, `"reac"`, `"react"` in rapid succession. If the network is even slightly variable, the request for `"r"` (returning thousands of loosely-relevant results, a genuinely slow query) can resolve *after* the request for `"react"` (a narrower, faster query) — and the stale `"r"` results overwrite the correct `"react"` results on screen, with no error and no visible sign anything went wrong.

::code-wrapper{language="javascript"}
```javascript
function SearchResults({ query }) {
  const [results, setResults] = useState([])

  useEffect(() => {
    let cancelled = false

    fetch(`/api/search?q=${query}`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled) setResults(data.results)
        // If a NEWER effect run already set cancelled = true for this closure,
        // this stale response is discarded instead of overwriting fresher data.
      })

    return () => { cancelled = true }
  }, [query])

  return <ul>{results.map(r => <li key={r.id}>{r.title}</li>)}</ul>
}
```
::

Each effect run closes over its own independent `cancelled` variable — when `query` changes again, React runs the previous effect's cleanup function first (chapter 6), flipping *that specific run's* `cancelled` to `true` before starting the new effect with a fresh `cancelled = false`. The stale request's `.then()` still fires when it eventually resolves, but its result is discarded because its own closure's `cancelled` is `true` by then.

## Aborting In-Flight Requests with `AbortController`

The `cancelled`-flag pattern prevents a stale response from being *applied*, but the underlying network request still completes in the background, wasting bandwidth and server resources. `AbortController` actually cancels the request itself.

::code-wrapper{language="javascript"}
```javascript
function SearchResults({ query }) {
  const [results, setResults] = useState([])

  useEffect(() => {
    const controller = new AbortController()

    fetch(`/api/search?q=${query}`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => setResults(data.results))
      .catch(err => {
        if (err.name !== 'AbortError') throw err
        // AbortError is EXPECTED here — it fires every time a newer request supersedes this one.
        // Rethrowing anything else preserves visibility into genuine failures.
      })

    return () => controller.abort()
  }, [query])

  return <ul>{results.map(r => <li key={r.id}>{r.title}</li>)}</ul>
}
```
::

The distinction matters in practice: the `cancelled`-flag approach is simpler and sufficient for most UI-correctness needs, while `AbortController` additionally saves real network/server resources — worth the extra complexity specifically for expensive requests (large payloads, costly server-side queries) or high-frequency scenarios like search-as-you-type.

## Loading States That Don't Flicker

A request that resolves in 50ms and one that resolves in 5 seconds both technically pass through a "loading" state — but showing a spinner for 50ms produces an distracting flash rather than useful feedback. A minimum-duration or delayed-appearance strategy smooths this out.

::code-wrapper{language="javascript"}
```javascript
function useDelayedLoading(isLoading, delayMs = 300) {
  const [showLoading, setShowLoading] = useState(false)

  useEffect(() => {
    if (!isLoading) {
      setShowLoading(false)
      return
    }
    const id = setTimeout(() => setShowLoading(true), delayMs)
    return () => clearTimeout(id)
  }, [isLoading, delayMs])

  return showLoading
}
```
::

Only requests slow enough to matter (past `delayMs`) ever show a spinner at all — fast ones resolve before the timeout fires, and the cleanup cancels it, so the UI goes straight from "nothing" to "content" with no flash in between.

## Retrying Failed Requests

Real networks fail transiently — a retry with backoff often succeeds where a single attempt wouldn't, and is a meaningfully better user experience than an immediate, permanent error state for what may be a one-off blip.

::code-wrapper{language="javascript"}
```javascript
async function fetchWithRetry(url, { retries = 3, backoffMs = 500 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      const isLastAttempt = attempt === retries
      if (isLastAttempt) throw err
      await new Promise(resolve => setTimeout(resolve, backoffMs * 2 ** attempt))
    }
  }
}
```
::

Exponential backoff (`backoffMs * 2 ** attempt`) spaces retries progressively further apart — retrying a genuinely down server immediately, repeatedly, adds load precisely when the server is least able to handle it; backoff gives transient issues time to resolve without hammering a struggling endpoint.

## Why Hand-Rolled Fetching Hits a Ceiling

Every pattern above — status tracking, race protection, aborting, delayed loading, retries — is correct, and still doesn't cover caching (avoiding a duplicate network request for data already fetched moments ago by a sibling component), refetch-on-window-focus (catching data that went stale while a tab was backgrounded), deduplication of identical in-flight requests, or pagination/infinite-scroll data merging. Reimplementing all of this per-project is exactly the gap **React Query** (TanStack Query) and **SWR** exist to fill.

::code-wrapper{language="javascript"}
```javascript
import { useQuery } from '@tanstack/react-query'

function UserProfile({ userId }) {
  const { data, status, error } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetch(`/api/users/${userId}`).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }),
  })

  if (status === 'pending') return <Spinner />
  if (status === 'error') return <ErrorMessage error={error} />
  return <ProfileCard user={data} />
}
```
::

The `queryKey` (`['user', userId]`) is the mechanism that gives all the "hard parts" for free: React Query automatically dedupes concurrent requests for the same key, caches results so a second component mounting with the same key gets cached data instantly (with a background refetch), handles the exact race-condition problem shown earlier for any query whose key changes, and refetches automatically on window refocus or network reconnect — all configurable, none hand-written.

::code-wrapper{language="javascript"}
```javascript
import { useMutation, useQueryClient } from '@tanstack/react-query'

function EditProfileForm({ userId }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (updates) => fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
    onSuccess: () => {
      // Invalidate the cached query so every component reading it refetches fresh data
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
    </form>
  )
}
```
::

**SWR** (from the Vercel team, the name comes from HTTP's "stale-while-revalidate" caching strategy) solves largely the same problem set with a smaller API surface and a slightly different philosophy — show cached (possibly stale) data immediately while silently refetching in the background, rather than React Query's more configurable, more explicit status-machine approach. Both are legitimate production choices; the decision usually comes down to how much configurability a project's caching/mutation needs actually require versus how much API surface the team wants to learn.

## 💡 Tips & Tricks

- **Debug** — Always check `res.ok` (or `res.status`) explicitly after `fetch()` resolves — a `404` or `500` response is *not* a rejected promise, and skipping this check is the single most common cause of "the error state never shows" bugs in hand-rolled fetch code.
- **Idiom** — Use the `cancelled`-flag pattern as the default race-condition guard for simple fetches; upgrade to `AbortController` specifically when a request is expensive enough (large payload, costly backend query, high-frequency search-as-you-type) that actually cancelling it, not just ignoring its result, matters.
- **Idiom** — Delay showing a loading spinner by roughly 200-300ms rather than showing it instantly — most real requests resolve faster than a user can consciously register a flash, and an instant-appearing, instant-disappearing spinner reads as visual noise rather than useful feedback.
- **Performance** — Reach for React Query or SWR the moment a project needs more than one of: caching across components, refetch-on-focus, request deduplication, or pagination — re-deriving all of these correctly by hand is a multi-day investment libraries already solved and battle-tested.
- **Debug** — When testing retry/backoff logic, temporarily point at an endpoint that always fails (or throttle the network in browser DevTools) rather than relying on a real flaky service to happen to fail during testing — deterministic failure is much faster to iterate against.

## ⚠️ Edge Cases & Gotchas

- **`fetch()` only rejects for network-level failures, never for HTTP error status codes** — a `404`, `401`, or `500` response resolves the promise successfully; always check `response.ok` or `response.status` before treating a response as valid data.
- **Fast successive requests can resolve out of order, letting a stale response overwrite fresher data with no error or warning** — this is a genuine race condition, not a hypothetical one, and shows up constantly in search-as-you-type and rapidly-changing-filter UIs; guard with a `cancelled` flag or `AbortController` tied to the effect's cleanup.
- **`AbortController`'s abort produces a rejected promise with `err.name === 'AbortError'`, which must be distinguished from genuine failures in a `.catch()`** — treating every abort as a real error surfaces a misleading error message to the user every single time a newer request supersedes an older one, which happens constantly and is not actually a failure.
- **Retrying with no backoff (or worse, retrying on every render due to a missing/incorrect dependency array) can amplify load on a struggling server precisely when it's least able to handle it** — always space retries with exponential (or at least linear) backoff, and always scope retry logic inside `useEffect` with a correct dependency array, never inline in the render body.
- **Data-fetching libraries' caching means a component can render "instantly" with stale cached data before a background refetch completes** — this is the intended stale-while-revalidate behavior, not a bug, but it changes how "loading state" should be reasoned about: `isLoading` (no data yet at all) and `isFetching` (a background refetch in progress, data already present) are meaningfully different states that a naive migration from hand-rolled fetching often conflates.

## 🧠 Spot the Bug

An autocomplete search box occasionally flashes results for an old, already-abandoned query text before settling on the correct results for what the user is currently typing.

::code-wrapper{language="javascript"}
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

There is no guard at all against out-of-order resolution — every keystroke fires a new `fetch`, and nothing prevents an older, slower-resolving request's `.then()` from calling `setSuggestions` *after* a newer, faster-resolving request has already set the correct, current results. Whichever request happens to resolve last wins, regardless of which query text it was actually requested for — exactly the race condition this chapter describes, and a textbook case of why "just add a dependency array and call it done" isn't sufficient for data fetching in `useEffect`.

**The lesson**: any `useEffect`-based fetch whose triggering value (here, `query`) can change again before the current request resolves needs an explicit guard — a `cancelled` flag set in the cleanup function, or an `AbortController` aborted on cleanup — to discard results from superseded requests; without one, "last requested" and "last resolved" are two different things and only one of them is safe to trust.

</details>

## Key Takeaways

- A production fetch needs at least loading/error/success states, and often an explicit empty-success state — `fetch()` itself never rejects for HTTP error statuses, so `res.ok` must be checked manually.
- Fast successive requests can resolve out of order; guard every `useEffect`-based fetch with a `cancelled` flag or `AbortController` tied to the effect's cleanup function, or stale responses can silently overwrite fresh data.
- `AbortController` actually cancels the underlying network request, not just its effect on state — worth the extra complexity for expensive or high-frequency requests like search-as-you-type.
- Delay showing loading indicators by roughly 200-300ms to avoid flashing a spinner for requests that resolve almost instantly.
- Retry transient failures with exponential backoff rather than immediately or not at all — immediate, unbounded retries can worsen load on an already-struggling server.
- React Query and SWR solve caching, deduplication, refetch-on-focus, and race conditions that hand-rolled `useEffect` fetching handles poorly or not at all — reach for one once a project's data needs exceed simple one-off fetches.
