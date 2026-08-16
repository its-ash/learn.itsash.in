# 27 — Profiling & Performance

Go has excellent profiling built in via `pprof` and the `testing` package's benchmarks. This chapter covers finding and fixing performance issues.

## Benchmarks (recap)

::code-wrapper{language="bash"}
```bash
go test -bench=. -benchmem -count=5
# BenchmarkX-8   1000000   1234 ns/op   456 B/op   3 allocs/op
```
::

- `ns/op` — time per operation.
- `B/op` — bytes allocated per operation.
- `allocs/op` — number of heap allocations per operation.

**Allocations are the key metric** — heap allocations trigger GC pressure. Reducing `allocs/op` often improves performance more than micro-optimizing the CPU work.

## `pprof` — CPU and Heap Profiling

### In tests

::code-wrapper{language="bash"}
```bash
# CPU profile
go test -bench=. -cpuprofile=cpu.out

# Heap profile
go test -bench=. -memprofile=mem.out

# Analyze
go tool pprof cpu.out
(pprof) top
(pprof) list FunctionName
(pprof) web   # graphviz visualization

# Web UI
go tool pprof -http=:8080 cpu.out
```

### In a running server

Import `net/http/pprof` and serve `/debug/pprof/`:

::code-wrapper{language="go"}
```go
import _ "net/http/pprof"

go func() {
	log.Println(http.ListenAndServe("localhost:6060", nil))
}()
```

Then profile the live server:

::code-wrapper{language="bash"}
```bash
go tool pprof http://localhost:6060/debug/pprof/profile   # 30s CPU profile
go tool pprof http://localhost:6060/debug/pprof/heap      # heap allocations
go tool pprof http://localhost:6060/debug/pprof/goroutine # goroutine stacks
```

## Reading a CPU Profile

`go tool pprof cpu.out`:
- `top` — functions by cumulative time.
- `top10 -cum` — top 10 by cumulative (inclusive of callees).
- `list FuncName` — annotated source showing time per line.
- `web` — graphviz call graph (needs graphviz installed).
- `weblist FuncName` — annotated source in a browser.

Focus on the top cumulative consumers — optimizing a function that's 1% of CPU is wasted effort.

## Reducing Allocations

### Use `strings.Builder` instead of `+`

::code-wrapper{language="go"}
```go
// ❌ O(n²) allocations
s := ""
for _, w := range words {
	s += w
}

// ✅ O(n)
var b strings.Builder
for _, w := range words {
	b.WriteString(w)
}
s := b.String()
```

### Preallocate slices and maps

::code-wrapper{language="go"}
```go
// ❌ grows via reallocation
s := []int{}
for i := 0; i < 1000; i++ {
	s = append(s, i)
}

// ✅ one allocation
s := make([]int, 0, 1000)
for i := 0; i < 1000; i++ {
	s = append(s, i)
}

m := make(map[string]int, 1000)   // hint, not limit
```

### Avoid `[]byte`↔`string` conversions

::code-wrapper{language="go"}
```go
// Each conversion allocates a copy
s := string(bytes)
b := []byte(s)

// For comparisons, use bytes.Equal/Compare (no conversion)
bytes.Equal(a, b)

// For contains, use strings.Contains (works on string directly)
strings.Contains(s, substr)
```

### Use `sync.Pool` for reusable buffers

::code-wrapper{language="go"}
```go
var bufPool = sync.Pool{
	New: func() any { return new(bytes.Buffer) },
}

buf := bufPool.Get().(*bytes.Buffer)
defer bufPool.Put(buf)
buf.Reset()
// use buf
```

Reuse allocation-heavy objects (buffers, temp structs) across calls to reduce GC pressure.

### Pass large structs by pointer

::code-wrapper{language="go"}
```go
// ❌ copies the whole struct on every call
func process(u User) { ... }

// ✅ passes a pointer (8 bytes)
func process(u *User) { ... }
```

But don't over-pointer small structs — the indirection can cost more than the copy.

## Escape Analysis

The compiler decides stack vs. heap allocation via **escape analysis**. Stack allocations are free (no GC); heap allocations cost. See the decisions:

::code-wrapper{language="bash"}
```bash
go build -gcflags="-m" main.go
# "moved to heap: x" — x is heap-allocated (its address escapes)
# "x does not escape" — x is stack-allocated
```

Common causes of escaping:
- Returning a pointer to a local variable (escapes — necessary).
- Storing a pointer in an interface (escapes — the compiler can't know the size).
- Passing a pointer to a function that stores it (escapes).
- Large stack frames (the compiler may heap-allocate to avoid stack growth).

## The Race Detector

::code-wrapper{language="bash"}
```bash
go test -race ./...
go run -race .
go build -race -o myapp
```

The race detector finds data races (concurrent reads/writes without synchronization) at runtime. It has overhead (10-100x) — use in testing and CI, not production. A race detected by `-race` is a real bug; fix it before shipping.

## Goroutine Leaks (profiling)

::code-wrapper{language="bash"}
```bash
go tool pprof http://localhost:6060/debug/pprof/goroutine
(pprof) top
```

The goroutine profile shows the stack traces of all live goroutines. A growing number of stuck goroutines (blocked on a channel, a lock, an infinite loop) is a leak.

## Memory Leaks (heap profiling)

::code-wrapper{language="bash"}
```bash
go tool pprof http://localhost:6060/debug/pprof/heap
(pprof) top
```

The heap profile shows allocations. Use `alloc_space` (total) vs `inuse_space` (current) to distinguish "allocates a lot" (GC pressure) from "holds a lot" (leak):

::code-wrapper{language="bash"}
```bash
go tool pprof -alloc_space http://localhost:6060/debug/pprof/heap   # total allocations
go tool pprof -inuse_space http://localhost:6060/debug/pprof/heap   # currently held
```

## Optimization Process

1. **Benchmark first** — establish a baseline with `go test -bench=. -benchmem`.
2. **Profile** — find the hotspot with `pprof` (CPU or heap).
3. **Optimize the hotspot** — reduce allocations, improve the algorithm.
4. **Re-benchmark** — confirm the improvement; check you didn't regress elsewhere.
5. **Repeat** — the next hotspot is now somewhere else.

Don't optimize without a profile — intuition about Go performance is often wrong (e.g., "pointers are always faster" is false for small structs).

## 💡 Tips & Tricks

- **Idiom**: profile before optimizing — run `go tool pprof` on a CPU or heap profile and find the actual hotspot. Intuition about Go performance is often wrong (escape analysis, inlining, GC interactions are non-obvious). Optimizing a non-hotspot is wasted effort.
- **Idiom**: reduce allocations first — `allocs/op` is the key metric for most Go programs (heap allocations trigger GC pressure). `strings.Builder`, pre-sized `make([]T, 0, n)`, `sync.Pool`, and avoiding `[]byte`↔`string` conversions are the standard allocation reducers, often yielding more than CPU micro-optimization.
- **Idiom**: use `go build -gcflags="-m"` to see escape analysis — it prints "moved to heap: x" (escapes, heap-allocated, GC'd) vs "x does not escape" (stack-allocated, free). This tells you whether your "optimization" (e.g., passing a pointer) actually avoided an allocation or forced one.
- **Idiom**: run `go test -race` in CI — the race detector finds data races (concurrent reads/writes without synchronization) that are nearly impossible to find by inspection. It has overhead (use in testing, not production), but a race it finds is a real bug.
- **Idiom**: benchmark with `-count=5` (or more) and look at variance — a single benchmark run is noisy (GC, scheduler, system load). Multiple runs let you distinguish real improvements from noise. `benchstat` compares two sets of benchmark results statistically.

## ⚠️ Edge Cases & Gotchas

- **Premature optimization**: profile first — optimizing without a profile often targets the wrong code. "The bottleneck is where you think it isn't."
- **Escape analysis can surprise**: returning `&x` forces `x` to the heap (necessary), but so does storing `&x` in an interface (the compiler can't know the concrete size). Assigning to an interface can be a hidden allocation.
- **Pointer vs value for small structs**: passing a small struct by value (copy) can be faster than a pointer (indirection + escape). Don't assume pointers are faster — benchmark.
- **`pprof` samples, doesn't trace**: CPU profiles sample at 100Hz by default — short-lived events may be missed. For exact tracing, use `go tool trace` (execution tracer).
- **Heap profile needs `runtime.MemProfileRate`**: by default, the heap profile samples 1 in 524288 allocations. For more detail, set `runtime.MemProfileRate = 1` (every allocation — expensive).
- **Race detector overhead**: `-race` slows the program 10-100x and uses more memory. Don't run it in production. It catches races that actually execute — a race that doesn't fire in tests isn't detected.
- **Goroutine leaks show as memory growth**: a leaked goroutine holds its stack and any captured variables. The heap profile shows the captured allocations; the goroutine profile shows the stuck goroutines.
- **`sync.Pool` isn't a cache**: pooled objects can be reclaimed at any time (between GCs). Don't use it for stateful objects that must persist. Reset objects before `Put`.
- **Benchmark dead-code elimination**: if the benchmark's result is unused, the compiler may optimize it away, showing 0 ns/op. Assign to a package-level sink var.
- **`runtime.GOMAXPROCS` and CPU-bound benchmarks**: benchmarks run with GOMAXPROCS = NumCPU. For single-threaded benchmarks, set `runtime.GOMAXPROCS(1)` to avoid parallelism skewing results.

## 🧠 Spot the Bug

A developer optimizes a hot function by passing a pointer instead of a value, but the benchmark shows *worse* performance:

::code-wrapper{language="go"}
```go
type Point struct{ X, Y, Z float64 }   // 24 bytes

// Before: value receiver
func (p Point) Dist() float64 { ... }

// After: pointer receiver (hypothesis: avoid copy)
func (p *Point) Dist() float64 { ... }
```
::

What likely happened?

<details>
<summary>Answer</summary>

For a small struct (24 bytes — 3 float64), passing by value (copying 24 bytes) is often **faster** than passing a pointer (8 bytes) because:
1. The value is passed in registers / on the stack (no heap allocation, no GC).
2. A pointer-receiver method on a value (`p.Dist()` where `p` is a `Point`, not `*Point`) forces the compiler to take `&p` — and if `p` is in an interface or the address escapes, `p` escapes to the heap (an allocation + GC pressure).
3. Pointer indirection (dereferencing `p.X`, `p.Y`) is a memory access; a value copy is a register move (faster on modern CPUs).

So the "optimization" (pointer receiver) introduced an escape (heap allocation) where the value receiver kept `p` on the stack — the benchmark got worse due to the allocation, not the copy.

The fix — measure and choose based on the benchmark. For small structs, value receivers are often faster (no escape, no indirection). For large structs or when the method mutates, pointer receivers are appropriate (chapter 11). Don't assume pointers are faster; benchmark both.

```go
// Revert to value receiver for small structs
func (p Point) Dist() float64 { ... }
```

And run `go build -gcflags="-m"` to confirm `p` doesn't escape.

**The lesson**: for small structs, value receivers avoid escape (heap allocation) and indirection, often outperforming pointer receivers. Don't assume pointers are faster — benchmark and check escape analysis. Pointers win for large structs (avoid copy) or mutation; values win for small, read-only structs.

</details>

## Summary

You can now benchmark (`-benchmem`, `-count`), profile with `pprof` (CPU, heap, goroutine), reduce allocations (`strings.Builder`, pre-sized `make`, `sync.Pool`, avoiding conversions), understand escape analysis (`-gcflags="-m"`), use the race detector, and follow the profile-optimize-rebenchmark process — without falling for the pointer-is-always-faster myth. Next: exercises and projects.