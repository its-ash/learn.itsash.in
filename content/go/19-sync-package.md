# 19 — sync Package

Channels are great for "communicate by sharing," but sometimes you need lower-level primitives: mutexes, wait groups, once. The `sync` package provides them.

## `sync.Mutex` — Mutual Exclusion

::code-wrapper{language="go"}
```go
var (
	mu    sync.Mutex
	count int
)

func increment() {
	mu.Lock()
	defer mu.Unlock()
	count++
}
``
::

`Mutex` ensures only one goroutine is in the critical section at a time. **Always pair `Lock` with `Unlock` (use `defer`)** — a missing `Unlock` deadlocks.

### `sync.RWMutex` — Reader/Writer Lock

::code-wrapper{language="go"}
```go
var (
	rw    sync.RWMutex
	cache map[string]string
)

func get(key string) string {
	rw.RLock()
	defer rw.RUnlock()
	return cache[key]
}

func set(key, value string) {
	rw.Lock()
	defer rw.Unlock()
	cache[key] = value
}
``
::

`RWMutex` allows multiple concurrent readers (`RLock`) or one writer (`Lock`). Use when reads vastly outnumber writes — the extra overhead isn't worth it for write-heavy or short critical sections.

## `sync.WaitGroup` — Wait for Goroutines

::code-wrapper{language="go"}
```go
var wg sync.WaitGroup
for i := 0; i < 5; i++ {
	wg.Add(1)
	go func(i int) {
		defer wg.Done()
		work(i)
	}(i)
}
wg.Wait()   // blocks until all Done
``
::

- `Add(n)` — increment the counter (before starting the goroutine).
- `Done()` — decrement (in the goroutine, via `defer`).
- `Wait()` — block until the counter is 0.

**Always `Add` before starting the goroutine** (not inside it — a race with `Wait`). **`defer wg.Done()`** ensures it runs even on panic.

## `sync.Once` — One-Time Initialization

::code-wrapper{language="go"}
```go
var (
	once sync.Once
	conn *Connection
)

func getConnection() *Connection {
	once.Do(func() {
		conn = connect()   // runs exactly once, even with concurrent callers
	})
	return conn
}
``
::

`Once.Do(f)` runs `f` exactly once across all goroutines — subsequent calls (even concurrent) skip it. The canonical lazy singleton pattern.

## `sync.Cond` — Condition Variable

::code-wrapper{language="go"}
```go
var (
	mu   sync.Mutex
	cond = sync.NewCond(&mu)
	queue []int
)

func consumer() {
	mu.Lock()
	for len(queue) == 0 {
		cond.Wait()   // atomically unlocks mu, waits, re-locks on wake
	}
	item := queue[0]
	queue = queue[1:]
	mu.Unlock()
}

func producer() {
	mu.Lock()
	queue = append(queue, 42)
	cond.Signal()   // wake one waiter
	// cond.Broadcast()   // wake all
	mu.Unlock()
}
``
::

`Cond` is for "wait until a condition is true" — less common than channels but useful for bounded-buffer patterns. `Wait` atomically unlocks the mutex and blocks; on wake, it re-locks. Always check the condition in a loop (spurious wakeups).

## `sync.Pool` — Object Reuse

::code-wrapper{language="go"}
```go
var bufPool = sync.Pool{
	New: func() any {
		return new(bytes.Buffer)
	},
}

func process(data []byte) string {
	buf := bufPool.Get().(*bytes.Buffer)
	defer bufPool.Put(buf)
	buf.Reset()
	buf.Write(data)
	return buf.String()
}
``
::

`Pool` reuses objects to reduce allocations. `Get` returns a pooled object (or calls `New` if empty); `Put` returns it. **Pooled objects can be reclaimed at any time** (between GC cycles) — don't rely on them persisting. Use for short-lived, allocation-heavy objects (buffers, temporary structs).

## `sync.Map` — Concurrent Map

::code-wrapper{language="go"}
```go
var m sync.Map
m.Store("key", "value")
v, ok := m.Load("key")
m.Delete("key")
m.Range(func(k, v any) bool {
	fmt.Println(k, v)
	return true   // continue iteration
})
``
::

`sync.Map` is safe for concurrent use without a mutex. It's optimized for **write-rarely, read-many** (e.g., a cache with few updates). For general use, a `map` + `RWMutex` is often faster (and type-safe with generics). `sync.Map` uses `any` (no generics).

## 💡 Tips & Tricks

- **Idiom**: always pair `Lock`/`Unlock` (or `RLock`/`RUnlock`) with `defer` — `mu.Lock(); defer mu.Unlock()` guarantees the unlock runs even on panic. A missing `Unlock` (e.g., an early return before `Unlock`) deadlocks all other goroutines.
- **Idiom**: use `RWMutex` only when reads vastly outnumber writes and the critical section is non-trivial — the RWMutex has higher overhead than a Mutex (two atomic ops per RLock), so for short critical sections or write-heavy workloads, a plain Mutex is faster.
- **Idiom**: `wg.Add(n)` *before* `go f()`, not inside `f` — there's a race where `Wait` sees counter 0 and returns before `Add` runs. `defer wg.Done()` inside `f` ensures it runs even on panic.
- **Idiom**: use `sync.Once` for lazy initialization — `once.Do(func() { x = expensiveInit() })` runs `expensiveInit` exactly once across all goroutines, without the boilerplate of double-checked locking. The canonical singleton pattern.
- **Idiom**: prefer a `map` + `RWMutex` over `sync.Map` for general concurrent maps — `sync.Map` is optimized for write-rarely/read-many (caches) and uses `any` (no type safety). A generic map + `RWMutex` is type-safe and often faster for balanced read/write workloads.

## ⚠️ Edge Cases & Gotchas

- **Copying a `Mutex`/`WaitGroup`/`Once` is a bug**: these have internal state that mustn't be copied. `go vet` catches this ("assignment copies lock value"). Pass them by pointer.
- **Forgetting `Unlock`**: a `Lock` without `Unlock` (e.g., an early return) deadlocks. Use `defer`.
- **`RWMutex` can starve writers**: if readers continuously hold `RLock`, a writer may wait indefinitely (Go's RWMutex has anti-starvation, but be aware). For write-heavy work, use a plain Mutex.
- **`WaitGroup.Add` inside the goroutine is a race**: `go func() { wg.Add(1); ... }()` — `Wait` may see counter 0 before `Add` runs. `Add` before `go`.
- **`Once.Do` blocks concurrent callers**: the first call runs `f`; other callers block until it completes. If `f` is slow, all concurrent `Do` calls wait.
- **`sync.Pool` objects can be reclaimed**: between GC cycles, pooled objects may be freed. Don't store state you need to persist. Reset objects before `Put` (so the next `Get` gets a clean state).
- **`sync.Map` is not generic**: it uses `any` — you lose type safety (type-assert on `Load`). For type safety, use a `map` + `RWMutex`.
- **`Cond.Wait` must be called with the mutex locked**: `Wait` unlocks, waits, re-locks. Calling it without holding the lock is a runtime error (or undefined behavior).
- **`Cond` spurious wakeups**: `Wait` can wake without `Signal`/`Broadcast`. Always check the condition in a loop: `for !condition { cond.Wait() }`.
- **`Pool.New` is called on `Get` from an empty pool**: each `Get` from an empty pool calls `New` (not reused). If `New` is expensive, the pool isn't helping for the first calls.

## 🧠 Spot the Bug

A developer protects a counter with a mutex, but `go vet` complains:

::code-wrapper{language="go"}
```go
type Counter struct {
	mu    sync.Mutex
	count int
}

func increment(c Counter) {   // ❌ Counter is copied (mu is copied)
	c.mu.Lock()
	c.count++
	c.mu.Unlock()
}

func main() {
	c := Counter{}
	go increment(c)
	go increment(c)
}
```
::

What's wrong?

<details>
<summary>Answer</summary>

`increment(c Counter)` receives `Counter` **by value** — it copies the struct, including the `sync.Mutex`. Each goroutine gets its own copy of the mutex (and the counter), so:
1. The two goroutines lock *different* mutexes — no mutual exclusion (race condition on the original `c` if they could reach it, but they're modifying copies anyway).
2. `go vet` flags "increment passes lock by value: Counter contains sync.Mutex" — copying a mutex is a bug.

The fix — pass `Counter` by pointer, and make the method take a pointer receiver:

```go
func increment(c *Counter) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.count++
}

func main() {
	c := &Counter{}
	go increment(c)
	go increment(c)
}
```

Now both goroutines share the same `Counter` (and the same mutex), and the lock works.

**The lesson**: mutexes (and `WaitGroup`/`Once`/`Cond`) mustn't be copied. Pass structs containing them by pointer, and use pointer receivers for methods that lock. `go vet` catches copy-of-lock bugs.

</details>

## Summary

You can now use `Mutex`/`RWMutex` for mutual exclusion, `WaitGroup` for waiting on goroutines, `Once` for lazy singletons, `Cond` for condition variables, `Pool` for object reuse, and `Map` for concurrent maps — while avoiding the copy-a-mutex and Add-inside-goroutine traps. Next: `context` — Go's cancellation and scoping mechanism.