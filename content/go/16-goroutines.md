# 16 — Goroutines

Goroutines are Go's lightweight concurrency primitive — functions running concurrently in the same address space, managed by the Go runtime (not the OS).

## Starting a Goroutine

::code-wrapper{language="go"}
```go
go myFunction(arg1, arg2)

go func() {
	fmt.Println("anonymous goroutine")
}()
``
::

`go f(args)` starts `f` in a new goroutine and returns immediately — the caller continues while `f` runs concurrently. Goroutines share memory (same address space) — synchronize with channels or `sync` (chapters 17-20).

## Lightweight

Goroutines are cheap — a few KB of stack each (growable), managed by the Go scheduler, not OS threads. You can have **millions** of goroutines:

::code-wrapper{language="go"}
```go
for i := 0; i < 100000; i++ {
	go func(i int) {
		// do work
	}(i)
}
``
::

The Go scheduler multiplexes goroutines onto a small number of OS threads (`GOMAXPROCS`, default = number of CPU cores). Don't create OS threads for concurrent work in Go — use goroutines.

## The Main Goroutine

`func main` runs in the main goroutine. When `main` returns, the program exits — **all other goroutines are killed** without running their deferred functions:

::code-wrapper{language="go"}
```go
func main() {
	go func() {
		fmt.Println("hello from goroutine")
	}()
	// main returns immediately — the goroutine may or may not run!
}
``
::

This is the classic "I started a goroutine and nothing happened" — `main` exits before the goroutine runs. Use `time.Sleep` (for demos only), a `sync.WaitGroup`, or a channel to wait:

::code-wrapper{language="go"}
```go
func main() {
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		fmt.Println("hello from goroutine")
	}()
	wg.Wait()   // blocks until the goroutine calls Done
}
``
::

## GOMAXPROCS

`GOMAXPROCS` controls how many OS threads run Go code simultaneously. Default = number of CPU cores. `runtime.GOMAXPROCS(n)` sets it (returns the old value).

::code-wrapper{language="go"}
```go
runtime.GOMAXPROCS(4)   // use at most 4 OS threads
n := runtime.GOMAXPROCS(0)   // query without changing
``
::

For CPU-bound work, `GOMAXPROCS = cores` is optimal. For I/O-bound work, more goroutines than cores is fine (they block on I/O, yielding the thread).

## Goroutine Leaks

A goroutine that can't proceed (blocked on a channel, waiting for a lock, in an infinite loop) and isn't reachable is **leaked** — it stays alive forever, consuming memory:

::code-wrapper{language="go"}
```go
func leak() {
	ch := make(chan int)
	go func() {
		val := <-ch   // blocks forever — no one sends to ch
		fmt.Println(val)
	}()
	// leak() returns; the goroutine is stuck, never freed
}
``
::

Leaked goroutines accumulate, eventually exhausting memory. Prevent leaks by:
- Always ensuring a goroutine has a way to exit (a done channel, `context` cancellation).
- Using `select` with a `default` or `<-ctx.Done()` to avoid blocking forever.
- Tools: `pprof` goroutine profile (chapter 27) shows stuck goroutines.

## `runtime.Gosched` and Blocking

- `runtime.Gosched()` — yields the current goroutine, letting others run. Rarely needed (the scheduler is preemptive since Go 1.14).
- Blocking operations (channel send/receive, syscall, lock) yield the goroutine's thread to another goroutine. The scheduler handles this automatically.

## When to Use Goroutines

- **I/O-bound work** — network calls, file I/O, database queries. Goroutines block on I/O, yielding the thread.
- **CPU-bound parallelism** — when you have independent work units, goroutines + `GOMAXPROCS` parallelize across cores.
- **Concurrency** — when independent operations can proceed in parallel (fan-out, pipelines).

**Don't use goroutines for**:
- Sequential dependencies (no parallelism to exploit).
- Tiny operations (goroutine creation overhead exceeds the work).
- Unbounded fan-out (millions of goroutines doing trivial work — use a worker pool, chapter 26).

## 💡 Tips & Tricks

- **Idiom**: always ensure a goroutine has a way to exit — pass a `context.Context` (chapter 20) or a `done` channel, and `select` on `<-ctx.Done()` in any blocking wait. A goroutine that can block forever with no exit path is a leak.
- **Idiom**: use `sync.WaitGroup` to wait for a known set of goroutines — `wg.Add(n)` before starting each, `defer wg.Done()` in each, `wg.Wait()` to block until all finish. This is the standard pattern for "do N things concurrently, then continue."
- **Idiom**: use a worker pool (chapter 26) for bounded concurrency — unbounded `go f()` in a loop can create millions of goroutines, exhausting memory or overwhelming a downstream resource (DB connections, API rate limits). A fixed pool of N workers processes jobs from a channel.
- **Debug**: goroutine leaks show up in `pprof`'s goroutine profile (`go tool pprof http://localhost:6060/debug/pprof/goroutine`) — it shows the stack traces of all live goroutines, revealing stuck ones. Leaked goroutines accumulate over time, slowly exhausting memory.
- **Idiom**: `go func() { ... }()` for a one-off concurrent task, but pass loop variables as arguments (`go func(i int) { ... }(i)`) on pre-1.22 to avoid the capture-the-final-value bug. Go 1.22+ fixes loop variable scoping, so `go func() { ... use(i) ... }()` is safe.

## ⚠️ Edge Cases & Gotchas

- **Main exiting kills all goroutines**: `main` returning terminates the program immediately — goroutines are stopped without running deferred functions. Use `WaitGroup`/channels to wait.
- **Goroutine leak**: a goroutine blocked forever with no exit path is a leak — it stays alive, consuming memory. Use `context`/`done` channels and `select` to ensure exit paths.
- **Closure capturing loop variables (pre-1.22)**: `for i := 0; ... { go func() { use(i) }() }` — all goroutines see the final `i`. Pass as argument or update to Go 1.22+.
- **No goroutine ID**: Go deliberately doesn't expose goroutine IDs (no `goroutine.ID()`) to discourage goroutine-local state. Use `context` for request-scoped values.
- **Panic in a goroutine crashes the program**: an unrecovered panic in a goroutine terminates the whole program (not just the goroutine). Recover in goroutines that might panic (or ensure they can't).
- **Goroutines aren't free**: a few KB of stack + scheduler overhead. Millions of goroutines doing trivial work waste resources — use a worker pool for bounded concurrency.
- **`GOMAXPROCS` default = cores**: usually correct. Setting it > cores doesn't help CPU-bound work (no cores to run on); < cores underutilizes. For I/O-bound work, more goroutines than GOMAXPROCS is fine (they block on I/O, yielding threads).
- **`runtime.LockOSThread`**: binds a goroutine to its OS thread — needed for some C libraries (via CGO) or runtime-specific APIs. Rare.
- **Goroutine scheduling is preemptive (Go 1.14+)**: a goroutine can be preempted even without blocking (the scheduler sends async preemption). Long-running CPU loops don't starve other goroutines. Pre-1.14, a tight loop could starve.
- **Starting a goroutine in a loop without bounds**: `for _, item := range huge { go process(item) }` creates len(huge) goroutines at once — can exhaust memory. Use a worker pool with a fixed number of workers.

## 🧠 Spot the Bug

A developer starts goroutines to fetch URLs, but the program prints nothing and exits:

::code-wrapper{language="go"}
```go
func main() {
	urls := []string{"a.com", "b.com", "c.com"}
	for _, u := range urls {
		go func() {
			resp, _ := http.Get("http://" + u)
			fmt.Println(u, resp.Status)
		}()
	}
}
```
::

What are the bugs?

<details>
<summary>Answer</summary>

Three bugs:

1. **Main exits immediately**: `main` returns after starting the goroutines, before they finish. The program terminates, killing all goroutines — nothing prints. Fix: wait for the goroutines (WaitGroup or channel).

2. **Loop variable capture (pre-1.22)**: `go func() { ... u ... }()` captures `u` by reference — all goroutines see the final value of `u` ("c.com"). Fix: pass `u` as an argument: `go func(u string) { ... }(u)`. (Go 1.22+ fixes this.)

3. **Ignored error**: `resp, _ := http.Get(...)` discards the error — if the fetch fails, `resp` is nil and `resp.Status` panics. Fix: check the error.

The corrected version:

```go
func main() {
	urls := []string{"a.com", "b.com", "c.com"}
	var wg sync.WaitGroup
	for _, u := range urls {
		wg.Add(1)
		go func(u string) {
			defer wg.Done()
			resp, err := http.Get("http://" + u)
			if err != nil {
				fmt.Println(u, "error:", err)
				return
			}
			defer resp.Body.Close()
			fmt.Println(u, resp.Status)
		}(u)
	}
	wg.Wait()
}
```
::
**The lesson**: main exits before goroutines finish (use WaitGroup); pre-1.22 loop variables are captured by reference (pass as argument); ignored errors cause nil-dereference panics (check errors).

</details>

## Summary

You can now start goroutines with `go`, understand their lightweight nature and the scheduler, use `WaitGroup` to wait for them, prevent leaks with exit paths (`context`/`done`), avoid the loop-variable-capture bug, and know that main exiting kills all goroutines. Next: channels — the communication mechanism between goroutines.