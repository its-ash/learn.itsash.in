---
title: "16 — Goroutines"
description: "Goroutine scheduling model (G-M-P), stack growth, GOMAXPROCS, leak prevention, and the preemptive scheduler — the concurrency engine."
---

# 16 — Goroutines

## The G-M-P Scheduling Model

::code-wrapper{language="go"}
```go
// ┌──────────────────────────────────────────────────────────────────────┐
// │ Go's scheduler uses a G-M-P model:                                   │
// │                                                                      │
// │   G (Goroutine)  — a goroutine (your `go func()`)                    │
// │   M (Machine)    — an OS thread (managed by the runtime)             │
// │   P (Processor)  — a logical processor (GOMAXPROCS of these)         │
// │                                                                      │
// │   Each P has a local run queue of Gs.                                │
// │   M executes Gs from its P's queue.                                  │
// │   When a G blocks (syscall, channel), the M is parked and the P      │
// │   is handed to another M to keep running Gs.                         │
// │                                                                      │
// │   Work stealing: if a P's queue is empty, it steals Gs from other Ps.│
// │   This keeps all CPUs busy without OS-level thread management.       │
// │                                                                      │
// │   Goroutine stack: starts at 2KB (Go 1.4+), grows on demand.         │
// │   You can have millions of goroutines (each ~2-8KB).                 │
// └──────────────────────────────────────────────────────────────────────┘

func schedulingModel() {
	// GOMAXPROCS = number of Ps = concurrent CPU-bound goroutines.
	// Default = runtime.NumCPU().
	fmt.Println("GOMAXPROCS:", runtime.GOMAXPROCS(0))  // e.g., 8 on 8-core

	// I/O-bound goroutines block on syscalls — the M parks, the P gets
	// a new M. So you can have MORE goroutines than GOMAXPROCS (they
	// block on I/O, yielding the thread).
}
```

## Starting Goroutines

::code-wrapper{language="go"}
```go
// `go f(args)` starts f in a new goroutine and returns immediately.
// The caller continues while f runs concurrently.

func fetchURL(url string, wg *sync.WaitGroup) {
	defer wg.Done()
	resp, err := http.Get(url)
	if err != nil {
		log.Printf("fetch %s: %v", url, err)
		return
	}
	defer resp.Body.Close()
	// process resp
}

func main() {
	urls := []string{"https://a.com", "https://b.com", "https://c.com"}
	var wg sync.WaitGroup
	for _, url := range urls {
		wg.Add(1)
		go fetchURL(url, &wg)  // launch one goroutine per URL
	}
	wg.Wait()  // block until all fetches complete
}

// ⚠️ The main goroutine can exit before others finish — all goroutines
// are killed when main returns. ALWAYS synchronize (WaitGroup, channel).
```

## The Main Exit Problem

::code-wrapper{language="go"}
```go
// ❌ ANTI-PATTERN: no synchronization — goroutine may not run
func badMain() {
	go func() {
		fmt.Println("hello from goroutine")  // might never print!
	}()
	// main returns immediately — the goroutine is killed.
}

// ✅ CORRECT: WaitGroup — block until goroutines finish
func goodMain() {
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		fmt.Println("hello from goroutine")
	}()
	wg.Wait()  // blocks until Done is called
}

// ✅ CORRECT: channel — block until signal received
func channelMain() {
	done := make(chan struct{})
	go func() {
		fmt.Println("working...")
		close(done)  // signal completion
	}()
	<-done  // block until done is closed
}
```

## Goroutine Leaks — Detection and Prevention

::code-wrapper{language="go"}
```go
// A leaked goroutine is one that's blocked forever and can't be reached.
// It stays alive, consuming memory (stack + any captured variables).

// ❌ LEAK: goroutine blocks forever — no one sends to ch
func leakyFunc() {
	ch := make(chan int)  // unbuffered
	go func() {
		val := <-ch  // blocks forever — no sender
		fmt.Println(val)
	}()
	// leakyFunc returns; the goroutine is stuck, never freed.
}

// ✅ FIX: pass a context so the goroutine can exit
func nonLeaky(ctx context.Context) <-chan int {
	ch := make(chan int, 1)
	go func() {
		defer close(ch)
		select {
		case ch <- compute():
		case <-ctx.Done():  // exit path — prevents leak
			return
		}
	}()
	return ch
}

// ❌ LEAK: goroutine blocks on send — no receiver
func leakyProducer() {
	ch := make(chan int)  // unbuffered
	go func() {
		for i := 0; i < 1000; i++ {
			ch <- i  // blocks if no one receives — leak
		}
	}()
	// receiver never starts → goroutine stuck on first send
}

// ✅ FIX: buffered channel + context, or select with ctx.Done
func safeProducer(ctx context.Context) <-chan int {
	ch := make(chan int, 100)  // buffer absorbs bursts
	go func() {
		defer close(ch)
		for i := 0; ; i++ {
			select {
			case ch <- i:
			case <-ctx.Done():
				return  // exit when cancelled
			}
		}
	}()
	return ch
}
```

## Detecting Leaks with `pprof`

::code-wrapper{language="go"}
```go
// import _ "net/http/pprof"
// go func() {
//     log.Println(http.ListenAndServe("localhost:6060", nil))
// }()

// Then, in another terminal:
// go tool pprof http://localhost:6060/debug/pprof/goroutine
// (pprof) top
// (pprof) traces

// This shows all live goroutines and their stack traces.
// Leaked goroutines appear as stuck on a channel send/receive.
// Look for goroutines that don't have a <-ctx.Done() exit path.

// In tests, use go.uber.org/goleak to detect leaks:
//
// import "go.uber.org/goleak"
// func TestMain(m *testing.M) {
//     goleak.VerifyTestMain(m)  // fails if goroutines leak after tests
// }
```

## Unbounded Fan-Out — The Resource Exhaustion Trap

::code-wrapper{language="go"}
```go
// ❌ ANTI-PATTERN: unbounded goroutine creation
func fetchAllBad(urls []string) {
	for _, url := range urls {
		go fetch(url)  // creates len(urls) goroutines at once!
	}
	// With 1M URLs: 1M goroutines, 1M HTTP connections, 1M DNS lookups.
	// Exhausts memory, file descriptors, and overwhelms the server.
}

// ✅ CORRECT: worker pool — bounded concurrency
func fetchAllGood(urls []string, maxWorkers int) {
	jobs := make(chan string, len(urls))
	results := make(chan error, len(urls))
	var wg sync.WaitGroup

	// Start a fixed number of workers:
	for i := 0; i < maxWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for url := range jobs {
				results <- fetch(url)
			}
		}()
	}

	// Send all jobs:
	for _, url := range urls {
		jobs <- url
	}
	close(jobs)

	// Wait for all workers to finish:
	go func() {
		wg.Wait()
		close(results)
	}()

	// Collect results:
	for err := range results {
		if err != nil {
			log.Printf("fetch error: %v", err)
		}
	}
}
```

## The Closure Capture Trap (Pre-1.22)

::code-wrapper{language="go"}
```go
// ❌ Pre-1.22: all goroutines capture the SAME i — print "3 3 3"
func captureBad() {
	for i := 0; i < 3; i++ {
		go func() {
			fmt.Println(i)  // captures i by reference — sees final value
		}()
	}
	time.Sleep(time.Second)
}

// ✅ Fix (portable): pass i as an argument — fresh copy per goroutine
func captureGood() {
	for i := 0; i < 3; i++ {
		go func(i int) {
			fmt.Println(i)  // i is a parameter — distinct per call
		}(i)
	}
}

// ✅ Fix (portable): shadow i — new variable per iteration
func captureShadow() {
	for i := 0; i < 3; i++ {
		i := i  // shadow — new i per iteration
		go func() { fmt.Println(i) }()
	}
}

// Go 1.22+: the original code is safe — each iteration has its own i.
// The `go func(i int) { ... }(i)` pattern is still correct on 1.22+.
```

## Panic in Goroutines — Program Crash

::code-wrapper{language="go"}
```go
// ❌ An unrecovered panic in a goroutine CRASHES THE ENTIRE PROGRAM.
//   go func() {
//       panic("boom")  // terminates the whole process, not just this goroutine
//   }()

// ✅ Always recover in goroutines that handle external input:
func safeGo(fn func()) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("goroutine panic: %v\n%s", r, debug.Stack())
			}
		}()
		fn()
	}()
}

// Usage in an HTTP server — one bad request shouldn't crash the server:
func handler(w http.ResponseWriter, r *http.Request) {
	safeGo(func() {
		processBackgroundJob(r.Context())
	})
}
```

## GOMAXPROCS — When to Change It

::code-wrapper{language="go"}
```go
func gomaxprocs() {
	// Default = NumCPU. Don't change it unless you have a specific reason.

	// Reasons to REDUCE GOMAXPROCS:
	//   - In containers with CPU limits, set GOMAXPROCS = the limit
	//     (Go reads the host's CPU count, not the cgroup limit — this
	//     over-allocates threads. Use automaxprocs or set it manually.)
	//   - In a shared environment where you want to leave cores for other
	//     processes.

	// Reasons to INCREASE GOMAXPROCS (rare):
	//   - I/O-bound workload with many goroutines blocking on syscalls.
	//     More Ps allow more syscalls to run concurrently. But each P
	//     can spawn an M (OS thread), so this increases thread count.

	// ⚠️ In Kubernetes/Docker with CPU limits:
	//   Go 1.22+ respects cgroup CPU limits automatically (GOMAXPROCS
	//   = the cgroup quota). Pre-1.22, use go.uber.org/automaxprocs or
	//   set GOMAXPROCS explicitly.
	runtime.GOMAXPROCS(4)  // cap at 4 Ps

	// Query without changing:
	n := runtime.GOMAXPROCS(0)
	fmt.Println("Ps:", n)
}
```

## 💡 Tips & Tricks

- **Idiom**: always pass `context.Context` to goroutines and `select` on `<-ctx.Done()` — this gives every goroutine an exit path, preventing leaks. A goroutine that can block forever with no exit is a leak waiting to happen.
- **Idiom**: use `sync.WaitGroup` to wait for a known set of goroutines — `wg.Add(1)` before `go f()`, `defer wg.Done()` inside, `wg.Wait()` to block. Never `Add` inside the goroutine (race with `Wait`).
- **Idiom**: use a worker pool for bounded concurrency — unbounded `go f()` in a loop can create millions of goroutines, exhausting memory and overwhelming downstream resources (DB connections, API rate limits).
- **Debug**: `go tool pprof http://localhost:6060/debug/pprof/goroutine` shows all live goroutines and their stack traces — leaked goroutines appear stuck on a channel send/receive with no `<-ctx.Done()` path.
- **Safety**: always `recover` in goroutines that handle external input — a single bad request causing a panic shouldn't crash the server. Log the panic + stack trace for debugging.
- **Debug**: `go.uber.org/goleak.VerifyTestMain(m)` in tests — fails if goroutines leak after the test suite. Catches leaks in CI before they hit production.

## ⚠️ Edge Cases & Gotchas

- **Main exiting kills all goroutines**: `main` returning terminates the program immediately — goroutines are stopped without running deferred functions. Use `WaitGroup`/channels to wait.
- **Goroutine leak**: a goroutine blocked forever with no exit path consumes memory forever. Use `context`/`done` channels and `select` to ensure exit paths.
- **Closure capturing loop variables (pre-1.22)**: `for i := 0; ... { go func() { use(i) }() }` — all goroutines see the final `i`. Pass as argument or use Go 1.22+.
- **No goroutine ID**: Go deliberately doesn't expose goroutine IDs (no `goroutine.ID()`) to discourage goroutine-local state. Use `context` for request-scoped values.
- **Panic in a goroutine crashes the program**: unrecovered panics terminate the whole process. Recover in goroutines that handle external input.
- **Goroutines aren't free**: ~2KB stack minimum + scheduler overhead. Millions of goroutines doing trivial work waste resources — use a worker pool.
- **`GOMAXPROCS` default = CPU count**: usually correct. In containers with CPU limits (pre-1.22), set it explicitly or use `automaxprocs` — Go reads the host's CPU count, not the cgroup limit.
- **`runtime.LockOSThread`**: binds a goroutine to an OS thread — needed for some C libraries (CGO) or runtime-specific APIs. Rare; don't use without a specific reason.
- **Goroutine scheduling is preemptive (Go 1.14+)**: a goroutine can be preempted even without blocking (async preemption). Long CPU loops don't starve other goroutines.
- **Starting goroutines in a loop without bounds**: `for _, item := range huge { go process(item) }` creates len(huge) goroutines at once — exhausts memory. Use a worker pool.

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
func main() {
	for i := 0; i < 3; i++ {
		go func() {
			time.Sleep(100 * time.Millisecond)
			fmt.Print(i, " ")
		}()
	}
	time.Sleep(time.Second)
}
```

On Go 1.22+, what's printed? (Order may vary.)
::
<details>
<summary>Answer</summary>

Go 1.22+:
```
0 1 2
```
(order may vary because goroutines run concurrently)

Go 1.22 makes each iteration's loop variable distinct. Each goroutine captures its own `i`, so they print 0, 1, 2 (in some order).

On pre-1.22, the output would be `3 3 3` — all goroutines capture the same `i`, which is 3 after the loop ends.

The fix for pre-1.22 (portable to all versions): `go func(i int) { ... }(i)` — pass `i` as an argument, creating a fresh copy per goroutine.

</details>

## 📚 What's Next

→ [17 — Channels](/go/17-channels) — unbuffered vs buffered semantics, close rules, directional channels, and nil channel patterns in select.