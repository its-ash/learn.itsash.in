---
title: "27 — Profiling & Performance"
description: "pprof CPU/heap/goroutine profiling, escape analysis, allocation reduction, strings.Builder, sync.Pool, and benchmark-driven optimization."
---

# 27 — Profiling & Performance

## The Optimization Workflow

::code-wrapper{language="text"}
```text
1. MEASURE — never optimize without profiling. "Premature optimization is the root of all evil."
2. PROFILE — find the bottleneck (CPU, memory, goroutine, lock contention).
3. OPTIMIZE — the top consumer first. A function at 1% of CPU isn't worth optimizing.
4. BENCHMARK — measure before and after with benchstat. If no improvement, revert.
5. REPEAT — the next bottleneck is now visible.

Key principle: ALLOCATIONS are the #1 performance problem in Go.
  - Heap allocations trigger GC (stop-the-world pauses, concurrent scan).
  - Stack allocations are free (no GC, no allocation overhead).
  - Reducing allocs/op often improves performance more than micro-optimizing CPU.
```

## `pprof` — CPU and Heap Profiling

::code-wrapper{language="bash"}
```bash
# ─── CPU profile from a benchmark ───
go test -bench=BenchmarkX -cpuprofile=cpu.out
go tool pprof cpu.out
(pprof) top              # top functions by cumulative time
(pprof) top10 -cum       # top 10 by cumulative (inclusive of callees)
(pprof) list FuncName    # annotated source — time per line
(pprof) web              # graphviz call graph
(pprof) weblist FuncName # annotated source in browser

# ─── Heap profile ───
go test -bench=BenchmarkX -memprofile=mem.out
go tool pprof mem.out
(pprof) top              # top allocating functions

# ─── Web UI (Go 1.24+: integrated pprof UI) ───
go tool pprof -http=:8080 cpu.out
# Opens a browser with flame graphs, source view, and call graph.
```

### `pprof` in a Running Server

::code-wrapper{language="go"}
```go
// import _ "net/http/pprof"  // registers /debug/pprof/ on the default mux

// Serve pprof on a separate port (don't expose to the public):
go func() {
	log.Println(http.ListenAndServe("localhost:6060", nil))
}()

// Then profile the live server:
// go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30  # 30s CPU
// go tool pprof http://localhost:6060/debug/pprof/heap                 # heap allocations
// go tool pprof http://localhost:6060/debug/pprof/goroutine           # goroutine stacks
// go tool pprof http://localhost:6060/debug/pprof/block                # blocking (needs runtime.SetBlockProfileRate)
// go tool pprof http://localhost:6060/debug/pprof/mutex                # mutex contention
```

## Escape Analysis — The Allocation Decision

::code-wrapper{language="go"}
```go
// The compiler decides stack vs heap via escape analysis.
// See the decisions:
//   go build -gcflags='-m' ./...        # summary
//   go build -gcflags='-m -m' ./...     # verbose (explains WHY)

// ─── Stack-allocated (no escape) ───
func noEscape() int {
	x := 42       // does not escape — stays on stack, free
	return x
}

// ─── Heap-allocated (escapes — address returned) ───
func escapes() *int {
	x := 42       // escapes to heap — &x leaves the function
	return &x      // GC manages x's lifetime
}

// ─── Interface boxing causes escape ───
func interfaceEscape() {
	x := 42
	var i any = x  // x escapes — interface stores (type, *x)
	fmt.Println(i)
}

// ─── The fmt.Println escape (common in hot paths) ───
func fmtEscape() {
	for i := 0; i < 1000000; i++ {
		fmt.Println(i)  // ⚠️ i escapes to heap — fmt takes ...any
	}
}
// Fix: use strconv (no interface):
func noFmtEscape() {
	for i := 0; i < 1000000; i++ {
		_ = strconv.Itoa(i)  // i stays on stack
	}
}
```

## Allocation Reduction — The Top Patterns

### 1. `strings.Builder` instead of `+`

::code-wrapper{language="go"}
```go
// ❌ O(n²) — each + allocates a new string:
func badConcat(words []string) string {
	s := ""
	for _, w := range words {
		s += w  // allocates new string each iteration
	}
	return s
}

// ✅ O(n) — amortized:
func goodConcat(words []string) string {
	var b strings.Builder
	b.Grow(64)  // pre-grow (estimate total size to avoid reallocation)
	for _, w := range words {
		b.WriteString(w)
	}
	return b.String()  // single allocation for the final string
}
```

### 2. Pre-allocate slices and maps

::code-wrapper{language="go"}
```go
// ❌ Grows via reallocation (log(n) reallocs):
func badCollect(items []int) []int {
	var s []int  // starts nil, grows via append
	for _, item := range items {
		s = append(s, transform(item))
	}
	return s
}

// ✅ One allocation:
func goodCollect(items []int) []int {
	s := make([]int, 0, len(items))  // pre-allocate capacity
	for _, item := range items {
		s = append(s, transform(item))  // stays within cap — no realloc
	}
	return s
}

// Same for maps:
m := make(map[string]int, 1000)  // pre-allocate buckets — avoids incremental rehashing
```

### 3. `sync.Pool` for reusable objects

::code-wrapper{language="go"}
```go
var bufPool = sync.Pool{
	New: func() any { return new(bytes.Buffer) },
}

func process(data []byte) string {
	buf := bufPool.Get().(*bytes.Buffer)
	defer func() {
		buf.Reset()       // ⚠️ reset before returning to pool
		bufPool.Put(buf)
	}()
	buf.Write(data)
	return buf.String()
}
// Reduces allocations in hot paths — buffers are reused instead of allocated.
```

### 4. Avoid `[]byte` ↔ `string` conversions

::code-wrapper{language="go"}
```go
// ❌ Each conversion allocates a copy:
func badContains(s string, sub string) bool {
	return bytes.Contains([]byte(s), []byte(sub))  // 2 allocations
}

// ✅ Use the matching package (no conversion):
func goodContains(s string, sub string) bool {
	return strings.Contains(s, sub)  // 0 allocations
}

// ✅ For zero-copy (Go 1.20+, advanced — only for read-only):
// import "unsafe"
// b := unsafe.Slice(unsafe.StringData(s), len(s))  // []byte sharing s's memory
// ⚠️ Never modify b — corrupts the read-only string table.
```

### 5. Pass large structs by pointer

::code-wrapper{language="go"}
```go
// ❌ Copies the whole struct on every call:
func processBig(b BigStruct) error {  // ~200 bytes copied
	_ = b
	return nil
}

// ✅ Pointer — no copy:
func processBigGood(b *BigStruct) error {  // 8 bytes (pointer)
	_ = b
	return nil
}

// ⚠️ For small structs (≤ 64 bytes), the value copy is cheaper than
// the pointer indirection. Benchmark to decide.
```

## Benchmarking Allocation Reduction

::code-wrapper{language="go"}
```go
package main

import "testing"

func BenchmarkBadConcat(b *testing.B) {
	b.ReportAllocs()
	words := []string{"a", "b", "c", "d", "e"}
	for n := 0; n < b.N; n++ {
		s := ""
		for _, w := range words {
			s += w
		}
		_ = s
	}
}
// Result: ~5 allocs/op, ~80 B/op

func BenchmarkGoodConcat(b *testing.B) {
	b.ReportAllocs()
	words := []string{"a", "b", "c", "d", "e"}
	for n := 0; n < b.N; n++ {
		var b strings.Builder
		for _, w := range words {
			b.WriteString(w)
		}
		_ = b.String()
	}
}
// Result: 1 alloc/op, ~32 B/op — 5x fewer allocations
```

## Inlining — When the Compiler Optimizes

::code-wrapper{language="go"}
```go
// The Go inliner copies small function bodies into the call site,
// eliminating the function call overhead.

// ✅ Small, leaf functions are inlined automatically:
func max(a, b int) int {
	if a > b { return a }
	return b
}
// The compiler inlines this — no function call at runtime.

// ❌ Functions with complex bodies are NOT inlined:
func complex(n int) int {
	for i := 0; i < n; i++ {  // loops prevent inlining
		n += i
	}
	return n
}

// Check inlining decisions:
// go build -gcflags='-m' ./...
// Output:
//   ./main.go:5:6: can inline max
//   ./main.go:10:6: cannot inline complex: function too complex

// ⚠️ Defer with a function value prevents inlining:
// func f() { defer fmt.Println("done") }  // fmt.Println is a value — no inline
// func f() { defer func() { fmt.Println("done") }() }  // anonymous — may inline

// Force inlining (advanced — rarely needed):
//go:inline
func hotPath(x int) int { return x * 2 }
```

## Memory Leaks — Detection

::code-wrapper{language="go"}
```go
// Go has a GC, but memory leaks still happen:
//   - Goroutine leaks (blocked goroutines holding references)
//   - Growing maps/slices never freed
//   - Closures capturing large variables

// Detect with pprof heap over time:
// 1. Take a heap snapshot:
curl http://localhost:6060/debug/pprof/heap > heap1.out
// 2. Wait (or send load):
sleep 60
// 3. Take another snapshot:
curl http://localhost:6060/debug/pprof/heap > heap2.out
// 4. Compare:
go tool pprof -base=heap1.out heap2.out
(pprof) top  # shows what grew between snapshots

// ─── Common leak: growing map ───
type Cache struct {
	mu    sync.Mutex
	items map[string]*Item  // never deleted → grows forever
}
// Fix: add TTL-based eviction or a max size with LRU.
```

## 💡 Tips & Tricks

- **Performance**: `allocs/op` is the key benchmark metric — heap allocations trigger GC. Reducing allocations (pre-allocate, `strings.Builder`, `sync.Pool`) often improves performance more than micro-optimizing CPU.
- **Idiom**: use `strings.Builder` with `Grow(total)` for string concatenation — `s += w` in a loop is O(n²); `Builder` is O(n). Pre-grow with the estimated total size to avoid reallocations.
- **Idiom**: pre-allocate slices and maps when you know the size — `make([]T, 0, n)` and `make(map[K]V, n)` avoid incremental growth/rehashing.
- **Idiom**: use `sync.Pool` for short-lived, allocation-heavy objects (buffers, temp structs) — reset before Put. Don't store long-lived state (pool objects can be reclaimed between GCs).
- **Performance**: `go build -gcflags='-m'` shows escape analysis — tells you which variables escape to the heap. In hot paths, eliminating escapes (keeping values on the stack) is the #1 allocation-reduction technique.
- **Performance**: avoid `fmt` in hot paths — `fmt.Println` takes `...any`, causing every argument to escape to the heap (interface boxing). Use `strconv` or direct writes.

## ⚠️ Edge Cases & Gotchas

- **Premature optimization**: always profile first. A function at 1% of CPU isn't worth optimizing — the top consumer is. `pprof` shows you where to focus.
- **`fmt.Println` causes escapes**: `fmt.Println(x)` boxes `x` into `any` → heap allocation. In hot paths, use `strconv.Itoa` or `os.Stdout.Write`.
- **`[]byte(s)` allocates**: string ↔ `[]byte` conversion copies the data (strings are immutable). Use `strings`/`bytes` package functions that work on the native type.
- **Defer prevents inlining**: a function with `defer` may not be inlined (the defer overhead must be set up). In ultra-hot paths, avoid defer.
- **`runtime.GC()` doesn't help in production**: manually triggering GC adds pauses. Let the concurrent GC run — tune with `GOGC` (default 100 = GC when heap doubles).
- **`GOGC=50` reduces memory but increases CPU**: the GC runs more often (when heap grows 50% instead of 100%). Trade memory for CPU. Use `GOMEMLIMIT` (Go 1.19+) for a hard memory cap instead.
- **`pprof` overhead**: profiling adds ~2x overhead. Run it in production briefly (30s), not continuously. Use `runtime.SetCPUProfileRate` for fine control.
- **`runtime.SetBlockProfileRate(n)`**: enables blocking profile — records goroutine blocking (channel, mutex, syscall). n=1 samples every blocking event (expensive); n=10000 samples every 10µs.
- **Inlining has limits**: functions with loops, switches, or too many statements aren't inlined. The threshold is tunable via `-gcflags='-l=4'` (higher = more aggressive).

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
func A(b *bytes.Buffer) {
	b.WriteString("hello")
}

func B() string {
	var b bytes.Buffer
	A(&b)
	return b.String()
}
```

Does `b` in `B()` escape to the heap?
::
<details>
<summary>Answer</summary>

**Yes**, `b` escapes to the heap.

`A(&b)` passes `&b` to another function. The compiler can't prove that `A` doesn't store the pointer somewhere (in a global, a channel, a struct that outlives `B`). To be safe, escape analysis moves `b` to the heap.

Verify:
```bash
go build -gcflags='-m' main.go
# ./main.go:5:6: moved to heap: b
# ./main.go:6:7: &b escapes to heap
```

If `A` were inlined (small enough), the compiler might see that `&b` doesn't escape and keep `b` on the stack. But `bytes.Buffer.WriteString` is a method call that the compiler may not inline, so the escape analysis is conservative.

In hot paths, if you know the buffer doesn't escape, you can use `sync.Pool` to reuse heap-allocated buffers (the pool manages the heap allocation, amortized across calls).

</details>

## 📚 What's Next

→ [28 — Exercises & Project Ideas](/go/28-exercises-and-projects) — from beginner to pro, covering every chapter.