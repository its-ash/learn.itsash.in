---
title: "19 — sync Package"
description: "Mutex/RWMutex internals, WaitGroup race-free usage, Once lazy init, Cond condition variables, Pool allocation reuse, and Map concurrent patterns."
---

# 19 — sync Package

Channels are for "communicate by sharing"; `sync` provides lower-level primitives when you need mutexes, coordination, and object reuse.

## `sync.Mutex` and `sync.RWMutex` — Internals

::code-wrapper{language="go"}
```go
// Mutex is a binary semaphore — only one goroutine in the critical section.
// Internally it's an atomic int with a waiter queue (futex-based on Linux).
// Go's Mutex is NOT reentrant — locking twice from the same goroutine deadlocks.

type Counter struct {
	mu    sync.Mutex
	count int
}

func (c *Counter) Inc() {
	c.mu.Lock()
	defer c.mu.Unlock()  // ✅ always defer Unlock — runs even on panic
	c.count++
}

func (c *Counter) Get() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.count
}

// ─── RWMutex — multiple readers OR one writer ───
type Cache struct {
	mu    sync.RWMutex
	data  map[string]string
}

func (c *Cache) Get(key string) (string, bool) {
	c.mu.RLock()         // ✅ multiple readers can hold RLock simultaneously
	defer c.mu.RUnlock()
	val, ok := c.data[key]
	return val, ok
}

func (c *Cache) Set(key, val string) {
	c.mu.Lock()          // ✅ exclusive — blocks all readers and writers
	defer c.mu.Unlock()
	c.data[key] = val
}

// ┌──────────────────────────────────────────────────────────────────────┐
// │ When to use RWMutex vs Mutex:                                        │
// │   RWMutex: reads vastly outnumber writes AND the critical section     │
// │            is non-trivial (the RLock overhead is higher than Mutex)  │
// │   Mutex:   balanced read/write or short critical sections             │
// │   RWMutex overhead: 2 atomic ops per RLock (vs 1 for Lock)            │
// │   For write-heavy or short sections, Mutex is faster.                 │
// └──────────────────────────────────────────────────────────────────────┘
```

## `sync.WaitGroup` — The Race-Free Pattern

::code-wrapper{language="go"}
```go
// ❌ ANTI-PATTERN: Add inside the goroutine — races with Wait
func badWait() {
	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		go func() {
			wg.Add(1)     // ❌ Wait may see counter=0 before Add runs
			defer wg.Done()
			work(i)
		}()
	}
	wg.Wait()  // may return prematurely
}

// ✅ CORRECT: Add BEFORE starting the goroutine
func goodWait() {
	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)       // ✅ Add before go — Wait won't see 0 prematurely
		go func(i int) {
			defer wg.Done()
			work(i)
		}(i)
	}
	wg.Wait()  // blocks until all 5 call Done
}

// ✅ Batch Add — add all at once, then start goroutines
func batchAdd() {
	var wg sync.WaitGroup
	items := make([]int, 100)
	wg.Add(len(items))  // add all upfront
	for i := range items {
		go func(i int) {
			defer wg.Done()
			work(i)
		}(i)
	}
	wg.Wait()
}
```

## `sync.Once` — Lazy Initialization

::code-wrapper{language="go"}
```go
// Once.Do runs the function exactly once across ALL goroutines.
// Subsequent calls (even concurrent) skip it. The canonical lazy singleton.

type Database struct {
	conn *sql.DB
}

var (
	dbOnce sync.Once
	db     *Database
)

func GetDB() *Database {
	dbOnce.Do(func() {
		// This runs exactly once, even if 100 goroutines call GetDB simultaneously.
		conn, err := sql.Open("postgres", os.Getenv("DSN"))
		if err != nil {
			panic(fmt.Sprintf("database init: %v", err))
		}
		db = &Database{conn: conn}
	})
	return db
}

// ─── Once with error handling ───
// Once.Do doesn't support return values. For init that can fail, use a
// separate variable:
var (
	initOnce sync.Once
	initErr  error
)

func InitConfig() error {
	initOnce.Do(func() {
		initErr = loadConfig()
	})
	return initErr  // returns the error from the first call (all callers see same)
}
```

## `sync.Cond` — Condition Variables

::code-wrapper{language="go"}
```go
// Cond is for "wait until a condition is true." Less common than channels
// but useful for bounded-buffer / producer-consumer patterns.

type Queue struct {
	mu    sync.Mutex
	cond  *sync.Cond
	items []int
}

func NewQueue() *Queue {
	q := &Queue{}
	q.cond = sync.NewCond(&q.mu)  // Cond is bound to a Mutex
	return q
}

func (q *Queue) Put(item int) {
	q.mu.Lock()
	q.items = append(q.items, item)
	q.cond.Signal()  // wake ONE waiting consumer
	q.mu.Unlock()
}

func (q *Queue) Get() int {
	q.mu.Lock()
	defer q.mu.Unlock()

	// ⚠️ MUST loop — spurious wakeups can occur
	for len(q.items) == 0 {
		q.cond.Wait()  // atomically: unlock mu, block, re-lock on wake
	}
	item := q.items[0]
	q.items = q.items[1:]
	return item
}

// ─── Broadcast vs Signal ───
// Signal: wake ONE waiter (use when one item is added)
// Broadcast: wake ALL waiters (use when the condition changes for everyone)
```

## `sync.Pool` — Object Reuse to Reduce GC Pressure

::code-wrapper{language="go"}
```go
// Pool reuses objects to reduce allocations. Get returns a pooled object
// (or calls New if pool is empty); Put returns it for reuse.
// ⚠️ Pooled objects can be reclaimed at ANY time (between GC cycles) —
// don't store state you need to persist. Reset objects before Put.

var bufPool = sync.Pool{
	New: func() any {
		return new(bytes.Buffer)
	},
}

func processRequest(data []byte) string {
	buf := bufPool.Get().(*bytes.Buffer)
	defer func() {
		buf.Reset()           // ⚠️ reset before returning to pool
		bufPool.Put(buf)
	}()

	buf.Write(data)
	return buf.String()
}

// ─── When sync.Pool helps ───
//   - Short-lived, allocation-heavy objects (buffers, temp structs)
//   - High-frequency allocation (thousands per second)
//   - The object is the same size/shape each time
//
// ─── When it doesn't ───
//   - Long-lived objects (pool reclaims them between GCs)
//   - Objects that grow (a buffer that grew to 1MB stays 1MB — memory leak)
//   - Low-frequency allocation (pool overhead > allocation cost)
```

## `sync.Map` — Concurrent Map (Use Sparingly)

::code-wrapper{language="go"}
```go
// sync.Map is safe for concurrent use without a mutex.
// Optimized for write-rarely/read-many (caches with few updates).
// Uses `any` (no generics — must type-assert on Load).

func syncMapDemo() {
	var m sync.Map
	m.Store("key", "value")

	v, ok := m.Load("key")  // v is any — must assert: v.(string)
	if ok {
		fmt.Println(v.(string))
	}

	// LoadOrStore — atomic "get or set":
	actual, loaded := m.LoadOrStore("key", "default")
	// loaded=false if newly stored, true if existing value returned

	m.Delete("key")

	m.Range(func(k, v any) bool {
		fmt.Println(k, v)
		return true  // continue iteration
	})
}

// ─── Generic concurrent map (usually better than sync.Map) ───
type ConcurrentMap[K comparable, V any] struct {
	mu sync.RWMutex
	m  map[K]V
}

func (c *ConcurrentMap[K, V]) Get(key K) (V, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	v, ok := c.m[key]
	return v, ok
}

func (c *ConcurrentMap[K, V]) Set(key K, val V) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.m[key] = val
}
// Type-safe, often faster than sync.Map for balanced read/write workloads.
```

## 💡 Tips & Tricks

- **Idiom**: always pair `Lock`/`Unlock` with `defer` — `mu.Lock(); defer mu.Unlock()` guarantees the unlock runs even on panic. A missing `Unlock` (early return) deadlocks all other goroutines.
- **Idiom**: use `RWMutex` only when reads vastly outnumber writes and the critical section is non-trivial — the RWMutex has higher overhead than a Mutex (two atomic ops per RLock). For short sections or write-heavy workloads, a plain Mutex is faster.
- **Idiom**: `wg.Add(n)` before `go f()`, not inside `f` — there's a race where `Wait` sees counter 0 before `Add` runs. `defer wg.Done()` inside `f` ensures it runs even on panic.
- **Idiom**: use `sync.Once` for lazy initialization — runs exactly once across all goroutines, without double-checked locking boilerplate. The canonical singleton pattern.
- **Idiom**: prefer a `map` + `RWMutex` over `sync.Map` for general concurrent maps — `sync.Map` is optimized for write-rarely/read-many (caches) and uses `any` (no type safety). A generic map + RWMutex is type-safe and often faster.
- **Performance**: `sync.Pool` for short-lived allocation-heavy objects (buffers) — reset before Put, don't store long-lived state. Objects can be reclaimed between GC cycles.

## ⚠️ Edge Cases & Gotchas

- **Copying a Mutex/WaitGroup/Once is a bug**: these have internal state. `go vet` catches this ("assignment copies lock value"). Pass by pointer, never by value.
- **Mutex is not reentrant**: locking twice from the same goroutine deadlocks (Go's Mutex has no concept of "owner").
- **Forgetting `Unlock`**: a `Lock` without `Unlock` (early return) deadlocks. Use `defer`.
- **`RWMutex` can starve writers**: if readers continuously hold `RLock`, a writer may wait indefinitely (Go has anti-starvation, but be aware). For write-heavy, use Mutex.
- **`WaitGroup.Add` inside the goroutine is a race**: `go func() { wg.Add(1); ... }()` — `Wait` may see counter 0. `Add` before `go`.
- **`Once.Do` blocks concurrent callers**: the first call runs `f`; other callers block until it completes. If `f` is slow, all concurrent `Do` calls wait.
- **`sync.Pool` objects can be reclaimed**: between GC cycles, pooled objects may be freed. Don't store state you need to persist. Reset before Put.
- **`sync.Map` is not generic**: uses `any` — type-assert on `Load`. For type safety, use `map` + `RWMutex`.
- **`Cond.Wait` must be called with the mutex locked**: `Wait` unlocks, waits, re-locks. Calling without the lock is a runtime error.
- **`Cond` spurious wakeups**: `Wait` can wake without `Signal`/`Broadcast`. Always loop: `for !condition { cond.Wait() }`.

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
type S struct {
	mu sync.Mutex
	v  int
}

func f(s S) {  // ⚠️ s is passed BY VALUE
	s.mu.Lock()
	s.v++
	s.mu.Unlock()
}

func main() {
	s := S{}
	f(s)
}
```

What does `go vet` report?
::
<details>
<summary>Answer</summary>

`go vet` reports:

```
f passes lock by value: S contains sync.Mutex
```

Passing `S` by value copies the `sync.Mutex` — the copied mutex has its own (uninitialized) internal state. Locking the copy doesn't protect the original. This is a bug that `go vet` catches.

The fix — pass by pointer:

```go
func f(s *S) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.v++
}
```

**The lesson**: types containing `sync.Mutex`, `sync.WaitGroup`, `sync.Once`, etc. must be passed by pointer, never by value. `go vet` catches this automatically.

</details>

## 📚 What's Next

→ [20 — Context](/go/20-context) — cancellation trees, deadlines, request-scoped values, and the `cancel` leak.