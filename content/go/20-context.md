---
title: "20 — Context"
description: "Cancellation trees, deadlines, request-scoped values, the cancel-leak pattern, and context propagation through API boundaries."
---

# 20 — Context

The `context` package is Go's mechanism for **cancellation, deadlines, and request-scoped values** across API boundaries and goroutines.

## The Context Tree

::code-wrapper{language="go"}
```go
// ┌──────────────────────────────────────────────────────────────────────┐
// │ Contexts form a TREE:                                                │
// │                                                                      │
// │   context.Background()  (root, never canceled, no deadline)         │
// │       ├── WithCancel(ctx)  → child1 (canceled when cancel() called)│
// │       ├── WithTimeout(ctx, 5s) → child2 (canceled at 5s)            │
// │       │       └── WithValue(child2, key, val) → child3              │
// │       └── WithDeadline(ctx, t) → child4                             │
// │                                                                      │
// │ Canceling a parent cancels ALL children (and their children).       │
// │ Canceling a child does NOT affect the parent or siblings.           │
// │                                                                      │
// │ ctx.Done() returns a channel closed when the context is canceled    │
// │   or times out. ctx.Err() returns the reason.                       │
// └──────────────────────────────────────────────────────────────────────┘

func treeDemo() {
	root, cancel := context.WithCancel(context.Background())
	defer cancel()  // ✅ always cancel to release resources

	child, cancelChild := context.WithTimeout(root, 5*time.Second)
	defer cancelChild()

	grandchild, _ := context.WithValue(child, "userID", 42)
	// Canceling root cancels child AND grandchild.
	// Canceling child cancels grandchild but NOT root.
	_ = grandchild
}
```

## The `cancel` Leak — The #1 Context Bug

::code-wrapper{language="go"}
```go
// ❌ ANTI-PATTERN: not calling cancel — leaks the timer (and goroutine)
func leakyFetch(url string) (*http.Response, error) {
	ctx, _ := context.WithTimeout(context.Background(), 5*time.Second)
	// ⚠️ cancel is discarded — the timer runs for 5 seconds even if the
	// request completes in 100ms. Each call leaks a timer goroutine.
	return http.Get(url)  // not using ctx anyway — double bad
}

// ✅ CORRECT: always defer cancel()
func goodFetch(ctx context.Context, url string) (*http.Response, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()  // ✅ releases the timer immediately when we return

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	return http.DefaultClient.Do(req)
}

// ⚠️ Even if the operation completes successfully, you MUST call cancel.
// WithTimeout/WithDeadline allocate a timer goroutine. cancel() stops it.
// Without cancel, the timer lives until the deadline, leaking resources.
```

## Cancellation Propagation

::code-wrapper{language="go"}
```go
// ─── HTTP server: client disconnect cancels the context ───
func handler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()  // canceled when the client disconnects

	// Pass ctx to downstream calls — they're canceled when the client goes away:
	user, err := fetchUser(ctx, userID)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			log.Println("client disconnected")
			return
		}
		http.Error(w, err.Error(), 500)
		return
	}

	// Long-running operation that respects cancellation:
	if err := processBatch(ctx, user); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
}

// ─── Downstream function checks ctx.Done() ───
func fetchUser(ctx context.Context, id int64) (*User, error) {
	// Quick check before work:
	select {
	case <-ctx.Done():
		return nil, ctx.Err()  // already canceled
	default:
	}

	req, _ := http.NewRequestWithContext(ctx, "GET",
		fmt.Sprintf("https://api.example.com/users/%d", id), nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch user %d: %w", id, err)
	}
	defer resp.Body.Close()

	var u User
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return nil, fmt.Errorf("decode user %d: %w", id, err)
	}
	return &u, nil
}
```

## Worker Goroutine with Cancellation

::code-wrapper{language="go"}
```go
func worker(ctx context.Context, input <-chan int, output chan<- int) error {
	for {
		select {
		case v, ok := <-input:
			if !ok {
				return nil  // input closed — clean exit
			}
			// Pass ctx to process so it can be canceled mid-computation:
			result, err := process(ctx, v)
			if err != nil {
				return err
			}
			select {
			case output <- result:
			case <-ctx.Done():
				return ctx.Err()  // canceled while sending
			}
		case <-ctx.Done():
			return ctx.Err()  // canceled — exit cleanly
		}
	}
}

// ─── CPU-bound loop with periodic cancellation checks ───
func computeIntensive(ctx context.Context, data []int) (int, error) {
	total := 0
	for i, v := range data {
		// Check for cancellation every 1000 iterations (cheap):
		if i%1000 == 0 {
			select {
			case <-ctx.Done():
				return 0, ctx.Err()
			default:
			}
		}
		total += expensiveOp(v)
	}
	return total, nil
}
```

## Request-Scoped Values — Use Sparingly

::code-wrapper{language="go"}
```go
// WithValue carries request-scoped data (request ID, trace ID, user ID).
// ⚠️ Use ONLY for cross-cutting concerns that flow through every function
// without explicit threading. Prefer explicit parameters for most data.

// ✅ Type-safe keys (custom type prevents collisions):
type ctxKey int  // unexported type — other packages can't collide

const (
	keyRequestID ctxKey = iota
	keyUserID
	keyTraceID
)

func withRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, keyRequestID, id)
}

func requestIDFrom(ctx context.Context) string {
	if v, ok := ctx.Value(keyRequestID).(string); ok {
		return v
	}
	return ""  // no request ID in context
}

// ❌ ANTI-PATTERN: using string keys (collision risk)
// ctx = context.WithValue(ctx, "userID", 42)
// Another package might use "userID" for something else → collision

// ❌ ANTI-PATTERN: using WithValue for business data (not cross-cutting)
// ctx = context.WithValue(ctx, "user", user)  // pass user as a parameter!
```

## Production Pattern — Request ID Middleware

::code-wrapper{language="go"}
```go
type ctxKey int
const keyRequestID ctxKey = 0

func RequestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Generate or extract request ID:
		reqID := r.Header.Get("X-Request-ID")
		if reqID == "" {
			reqID = uuid.NewString()
		}

		// Add to context for downstream handlers:
		ctx := context.WithValue(r.Context(), keyRequestID, reqID)

		// Add to response header for client correlation:
		w.Header().Set("X-Request-ID", reqID)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// Downstream handlers extract the request ID for logging:
func myHandler(w http.ResponseWriter, r *http.Request) {
	reqID := r.Context().Value(keyRequestID).(string)
	log.Printf("[%s] handling request", reqID)
	// ...
}
```

## `errgroup.Group` — Bounded Concurrent Error Handling

::code-wrapper{language="go"}
```go
// import "golang.org/x/sync/errgroup"
// errgroup.Group runs goroutines and returns the FIRST error.
// It also provides bounded concurrency via SetLimit.

func fetchAll(ctx context.Context, urls []string) ([][]byte, error) {
	g, ctx := errgroup.WithContext(ctx)  // ctx canceled if any goroutine errors

	results := make([][]byte, len(urls))
	g.SetLimit(10)  // at most 10 concurrent goroutines

	for i, url := range urls {
		i, url := i, url  // capture (pre-1.22; 1.22+ doesn't need this)
		g.Go(func() error {
			data, err := fetch(ctx, url)
			if err != nil {
				return err  // cancels ctx and stops other goroutines
			}
			results[i] = data  // safe — each goroutine writes a distinct index
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err  // first error from any goroutine
	}
	return results, nil
}
```

## 💡 Tips & Tricks

- **Idiom**: always `defer cancel()` when using `WithCancel`/`WithTimeout`/`WithDeadline` — releases resources (timers, goroutines) even if the operation completes normally. Forgetting `cancel` leaks.
- **Idiom**: pass `context.Context` as the FIRST parameter of every function that does I/O or can be canceled — `func f(ctx context.Context, ...)`. This is the universal Go convention; libraries expect it.
- **Idiom**: use `context.Background()` at the top level (main, tests) and `r.Context()` in HTTP handlers — `Background` is the root; `r.Context()` is canceled when the client disconnects.
- **Idiom**: include `<-ctx.Done()` in every long-running goroutine's `select` — it provides the exit path when the parent cancels. A goroutine that never checks `ctx.Done()` can't be canceled (leak).
- **Idiom**: use `WithValue` sparingly and only for cross-cutting concerns (request ID, trace ID) — it's untyped and encourages hidden coupling. Use a custom key type to avoid string collisions.
- **Idiom**: don't store contexts in structs — they're for flowing through call chains, not fields. A struct with a `ctx` field breaks cancellation propagation.

## ⚠️ Edge Cases & Gotchas

- **Forgetting `cancel` leaks**: `WithTimeout`/`WithDeadline` start a timer; not calling `cancel` leaves the timer alive until the deadline. `defer cancel()` is the fix.
- **Don't store contexts in structs**: contexts are for passing through call chains, not for keeping in fields. A struct with a `ctx` field is a code smell.
- **`ctx.Done()` is a channel, not a value**: `<-ctx.Done()` blocks until canceled; `ctx.Err()` gives the reason. Don't poll `Done()` — `select` on it.
- **`context.Background()` is never canceled**: it's the root. Derive from it with `WithCancel`/`WithTimeout` for cancellation.
- **Canceling a parent cancels children**: but canceling a child doesn't affect the parent or siblings. This is the tree structure.
- **`WithValue` is untyped**: `ctx.Value(key)` returns `any` — must type-assert. Use a custom key type to avoid collisions.
- **`context.TODO()` vs `context.Background()`**: `TODO` signals "I haven't decided which context to use yet" — it's a placeholder. Use `Background` for the actual root.
- **Nil context is a panic**: `var ctx context.Context; ctx.Done()` panics. Always pass a real context (Background at minimum).
- **`errgroup.WithContext` cancels on first error**: `g.Go` returns an error → the derived context is canceled → other goroutines see `<-ctx.Done()` and exit. This is coordinated error handling.

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
func handler(ctx context.Context) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	// ⚠️ no defer cancel()

	doWork(ctx)
}

func doWork(ctx context.Context) {
	time.Sleep(10 * time.Second)
}
```

What's the problem?
::
<details>
<summary>Answer</summary>

The `cancel` function is never called — the timer leaks.

Even though `doWork` runs for 10 seconds (exceeding the 5-second timeout), the timer goroutine started by `WithTimeout` lives until one of:
1. `cancel()` is called (never — it's discarded)
2. The deadline elapses (5 seconds)

So the timer stops after 5 seconds (the deadline fires). But this is by luck — if the work had completed in 100ms, the timer would linger for 4.9 seconds, wasting resources.

The real problem: if `handler` is called thousands of times per second (it's an HTTP handler), each call starts a timer. Without `cancel`, thousands of timer goroutines accumulate.

The fix:

```go
func handler(ctx context.Context) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()  // ✅ releases the timer immediately when handler returns

	doWork(ctx)
}
```

</details>

## 📚 What's Next

→ [21 — Packages & Modules](/go/21-packages-and-modules) — module versioning, `internal/` enforcement, workspaces, and versioning semantics.