# 20 — Context

The `context` package is Go's mechanism for **cancellation, deadlines, and request-scoped values** across API boundaries and goroutines. It's the standard way to propagate "stop" signals and per-request data.

## The Three Responsibilities

1. **Cancellation** — signal goroutines to stop early (user canceled, parent operation done).
2. **Deadlines** — a time by which the operation should be cancelled.
3. **Values** — request-scoped data (request ID, user ID) carried through the call chain.

## Creating Contexts

::code-wrapper{language="go"}
```go
ctx := context.Background()   // the root, never canceled, no deadline
ctx := context.TODO()         // placeholder when you're not sure which to use

ctx, cancel := context.WithCancel(parent)
defer cancel()   // always call cancel to release resources

ctx, cancel := context.WithTimeout(parent, 5*time.Second)
defer cancel()

ctx, cancel := context.WithDeadline(parent, time.Now().Add(5*time.Second))
defer cancel()

ctx = context.WithValue(parent, "requestID", "abc123")
``
::

Every context is derived from a **parent** — they form a tree. Canceling a parent cancels all its children.

### The `cancel` function

`WithCancel`/`WithTimeout`/`WithDeadline` return a context and a `cancel` function. **Always call `cancel`** (typically `defer cancel()`) to release resources (timers, goroutines) — even if the operation completes normally. Forgetting `cancel` leaks.

## Checking for Cancellation

::code-wrapper{language="go"}
```go
select {
case <-ctx.Done():
	return ctx.Err()   // context.Canceled or context.DeadlineExceeded
default:
	// continue
}

// Or in a blocking wait
<-ctx.Done()
err := ctx.Err()   // why it was canceled
``
::

`ctx.Done()` returns a channel that's closed when the context is canceled or times out. `ctx.Err()` returns the reason (`context.Canceled` or `context.DeadlineExceeded`).

## Passing Context to Functions

The convention: the first parameter is `ctx context.Context`:

::code-wrapper{language="go"}
```go
func fetchUser(ctx context.Context, id int) (*User, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}
	// ... do work, checking ctx periodically ...
	return db.GetUser(ctx, id)
}
``
::

Libraries that do I/O (database, HTTP, gRPC) accept a `context.Context` and respect cancellation — propagating `ctx` lets a user cancel propagate all the way down to the network call.

## Propagating Cancellation to Goroutines

::code-wrapper{language="go"}
```go
func worker(ctx context.Context, input <-chan int) error {
	for {
		select {
		case v, ok := <-input:
			if !ok {
				return nil
			}
			if err := process(ctx, v); err != nil {
				return err
			}
		case <-ctx.Done():
			return ctx.Err()   // stop when canceled
		}
	}
}
``
::

Pass `ctx` to spawned goroutines so cancellation propagates. Each goroutine's `select` includes `<-ctx.Done()`.

## HTTP Server Context

`net/http` automatically creates a context per request, canceled when the client disconnects:

::code-wrapper{language="go"}
```go
func handler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()   // canceled when the client disconnects
	select {
	case <-time.After(5 * time.Second):
		fmt.Fprintln(w, "done")
	case <-ctx.Done():
		log.Println("client disconnected:", ctx.Err())
	}
}
``
::

`r.Context()` is the idiomatic way to get cancellation from client disconnects. Pass it to downstream calls (database, APIs) so they're canceled when the client goes away.

## HTTP Client Context

::code-wrapper{language="go"}
```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

req, _ := http.NewRequestWithContext(ctx, "GET", "https://example.com", nil)
resp, err := http.DefaultClient.Do(req)
if err != nil {
	// includes context.DeadlineExceeded if it timed out
}
``
::

`http.NewRequestWithContext` attaches the context — the request is canceled when `ctx` is. This is how you add timeouts to HTTP client calls.

## Request-Scoped Values

::code-wrapper{language="go"}
```go
ctx = context.WithValue(ctx, "requestID", "abc123")

// Retrieve
if v, ok := ctx.Value("requestID").(string); ok {
	fmt.Println(v)   // "abc123"
}
``
::

⚠️ **Use values sparingly** — they're not typed (must type-assert), and they encourage hidden coupling. Prefer explicit function parameters for most data. Reserve `WithValue` for cross-cutting concerns (request ID, trace ID) that truly need to flow through every function without explicit threading.

### Type-safe value keys

Use a custom type for keys to avoid collisions:

::code-wrapper{language="go"}
```go
type ctxKey int
const (
	keyRequestID ctxKey = iota
	keyUserID
)

ctx = context.WithValue(ctx, keyRequestID, "abc123")
id := ctx.Value(keyRequestID).(string)
``
::

Using a custom type prevents string-key collisions with other packages.

## Context Tree and Cancellation

::code-wrapper{language="go"}
```go
ctx, cancel := context.WithCancel(context.Background())
defer cancel()

child, cancelChild := context.WithCancel(ctx)
defer cancelChild()

// Canceling ctx cancels child too (parent cancels children)
// Canceling child doesn't affect ctx or siblings
``
::

The tree structure means: cancel a parent, all children are canceled. Cancel a child, only its subtree is affected. This lets a request-scoped context cancel all its sub-operations.

## 💡 Tips & Tricks

- **Idiom**: always `defer cancel()` when using `WithCancel`/`WithTimeout`/`WithDeadline` — it releases resources (timers, goroutines) even if the operation completes normally. Forgetting `cancel` leaks. The `cancel` is also what propagates cancellation to children.
- **Idiom**: pass `context.Context` as the first parameter of every function that does I/O or can be canceled — `func f(ctx context.Context, ...)`. This is the universal Go convention; libraries expect it. Don't store contexts in structs (they're for flowing through call chains, not fields).
- **Idiom**: use `context.Background()` at the top level (main, tests) and `r.Context()` in HTTP handlers — `Background` is the root that's never canceled; `r.Context()` is canceled when the client disconnects. Derive timeouts/branches from these.
- **Idiom**: include `<-ctx.Done()` in every long-running goroutine's `select` — it provides the exit path when the parent cancels. A goroutine that never checks `ctx.Done()` can't be canceled (leak).
- **Idiom**: use `WithValue` sparingly and only for cross-cutting concerns (request ID, trace ID) — it's untyped (requires type assertion) and encourages hidden coupling. Prefer explicit parameters for most data. Use a custom key type (`type ctxKey int`) to avoid string-key collisions.

## ⚠️ Edge Cases & Gotchas

- **Forgetting `cancel` leaks**: `WithTimeout`/`WithDeadline` start a timer; not calling `cancel` leaves the timer and context alive until the deadline. `defer cancel()` is the fix.
- **Don't store contexts in structs**: contexts are for passing through call chains, not for keeping in fields. A struct with a `ctx` field breaks cancellation propagation and is a code smell.
- **`ctx.Done()` is a channel, not a value**: `<-ctx.Done()` blocks until canceled; `ctx.Err()` gives the reason. Don't poll `Done()` — `select` on it.
- **`context.Background()` is never canceled**: it's the root. Don't use it where you want cancellation (e.g., in a handler — use `r.Context()`).
- **`WithValue` is untyped**: `ctx.Value(key)` returns `any` — you must type-assert. Mismatched key types (string vs custom type) silently miss. Use a custom key type.
- **Parent cancels children, not vice versa**: canceling a child context doesn't cancel the parent or siblings. The tree flows downward.
- **Don't pass `nil` context**: `func f(ctx context.Context)` with `ctx == nil` panics in some stdlib functions. Use `context.TODO()` as a placeholder if you don't have one.
- **`context.TODO()` vs `context.Background()`**: both are never-canceled roots; `TODO` signals "I haven't decided which context to use yet" (for work-in-progress). Use `Background` when you intentionally want the root.
- **`ctx.Err()` after `Done()`**: `ctx.Err()` returns `context.Canceled` (explicit cancel) or `context.DeadlineExceeded` (timeout). Before `Done()`, it returns `nil`.
- **Goroutines don't inherit context automatically**: `go f()` doesn't pass the current context — you must pass it explicitly (`go f(ctx)`). A goroutine without a context can't be canceled by the parent's context.

## 🧠 Spot the Bug

A developer sets a timeout on an HTTP call, but it leaks goroutines:

::code-wrapper{language="go"}
```go
func fetch(ctx context.Context, url string) (*http.Response, error) {
	ctx, _ = context.WithTimeout(ctx, 5*time.Second)   // ❌ cancel discarded
	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	return http.DefaultClient.Do(req)
}
```
::

What's wrong?

<details>
<summary>Answer</summary>

`context.WithTimeout` returns a context and a `cancel` function. The developer discards `cancel` (`ctx, _ = ...`), so it's never called. This leaks the timer (and the context's resources) — the timer runs for 5 seconds even if the HTTP call returns immediately, and the context isn't cleaned up until the deadline.

For a single call, the leak is brief (5 seconds). But in a hot loop (thousands of calls per second), the leaked timers accumulate — each holds a goroutine and a timer until its deadline.

The fix — `defer cancel()`:

```go
func fetch(ctx context.Context, url string) (*http.Response, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()   // release the timer immediately when fetch returns
	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	return http.DefaultClient.Do(req)
}
```

Now the timer is stopped as soon as `fetch` returns (whether the call succeeded, failed, or timed out), preventing the leak.

**The lesson**: always `defer cancel()` for `WithTimeout`/`WithDeadline`/`WithCancel`. Discarding `cancel` leaks the timer and context resources. `go vet` and `govet` (with the `lostcancel` analyzer) flag this.

</details>

## Summary

You can now create contexts (`Background`/`TODO`/`WithCancel`/`WithTimeout`/`WithDeadline`/`WithValue`), propagate cancellation through call chains and goroutines, use `r.Context()` in handlers and `NewRequestWithContext` in clients, check `<-ctx.Done()`, and use values sparingly with custom key types — while always `defer cancel()`ing to prevent leaks. Next: packages and modules.