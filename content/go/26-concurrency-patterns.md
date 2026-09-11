---
title: "26 — Concurrency Patterns"
description: "Worker pool, pipeline, fan-out/fan-in, generator, errgroup bounded concurrency, semaphore, and graceful shutdown patterns."
---

# 26 — Concurrency Patterns

## Worker Pool — Bounded Concurrency

::code-wrapper{language="go"}
```go
// Worker pool: N goroutines process jobs from a channel.
// Bounded concurrency — prevents overwhelming downstream resources.

type Job struct {
	ID    int
	Input any
}
type Result struct {
	JobID  int
	Output any
	Err    error
}

func worker(ctx context.Context, id int, jobs <-chan Job, results chan<- Result,
	wg *sync.WaitGroup) {
	defer wg.Done()
	for {
		select {
		case job, ok := <-jobs:
			if !ok {
				return  // jobs channel closed — clean exit
			}
			// Process with cancellation:
			output, err := process(ctx, job.Input)
			select {
			case results <- Result{JobID: job.ID, Output: output, Err: err}:
			case <-ctx.Done():
				return  // cancelled while sending result
			}
		case <-ctx.Done():
			return  // cancelled
		}
	}
}

func runWorkerPool(ctx context.Context, jobs []Job, numWorkers int) []Result {
	jobCh := make(chan Job, len(jobs))
	resultCh := make(chan Result, len(jobs))
	var wg sync.WaitGroup

	// Start workers:
	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go worker(ctx, i, jobCh, resultCh, &wg)
	}

	// Send jobs (buffered — doesn't block):
	for _, job := range jobs {
		jobCh <- job
	}
	close(jobCh)  // signal workers that no more jobs are coming

	// Close results after all workers finish:
	go func() {
		wg.Wait()
		close(resultCh)
	}()

	// Collect results:
	var results []Result
	for r := range resultCh {
		results = append(results, r)
	}
	return results
}
```

## Pipeline — Stage-by-Stage Processing

::code-wrapper{language="go"}
```go
// Pipeline: stages connected by channels, each a goroutine.
// Each stage reads from input, transforms, writes to output.

func generate(ctx context.Context, nums ...int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		for _, n := range nums {
			select {
			case out <- n:
			case <-ctx.Done():
				return
			}
		}
	}()
	return out
}

func square(ctx context.Context, in <-chan int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		for n := range in {
			select {
			case out <- n * n:
			case <-ctx.Done():
				return
			}
		}
	}()
	return out
}

func filter(ctx context.Context, in <-chan int, pred func(int) bool) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		for n := range in {
			if pred(n) {
				select {
				case out <- n:
				case <-ctx.Done():
					return
				}
			}
		}
	}()
	return out
}

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Compose: generate → square → filter evens → print
	nums := generate(ctx, 1, 2, 3, 4, 5)
	squared := square(ctx, nums)
	evens := filter(ctx, squared, func(n int) bool { return n%2 == 0 })

	for n := range evens {
		fmt.Println(n)  // 4, 16 (2²=4, 4²=16)
	}
}
```

## Fan-Out, Fan-In — Parallel Processing

::code-wrapper{language="go"}
```go
// Fan-out: distribute work to multiple workers from one input channel.
// Fan-in: merge multiple output channels into one.

func fanOutFanIn(ctx context.Context, input <-chan int, numWorkers int) <-chan int {
	// Fan-out: N goroutines read from the same input, process in parallel:
	workerOutputs := make([]chan int, numWorkers)
	for i := 0; i < numWorkers; i++ {
		workerOutputs[i] = make(chan int)
		go func(out chan<- int) {
			defer close(out)
			for v := range input {  // shared input — each value goes to ONE worker
				select {
				case out <- process(v):
				case <-ctx.Done():
					return
				}
			}
		}(workerOutputs[i])
	}

	// Fan-in: merge all worker outputs into one channel:
	merged := make(chan int)
	var wg sync.WaitGroup
	for _, out := range workerOutputs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for v := range out {
				merged <- v
			}
		}()
	}

	go func() {
		wg.Wait()
		close(merged)
	}()

	return merged
}
```

## `errgroup.Group` — Bounded Concurrent with Error Handling

::code-wrapper{language="go"}
```go
// import "golang.org/x/sync/errgroup"
// errgroup runs goroutines, returns the FIRST error, and cancels the context.

func fetchAll(ctx context.Context, urls []string) ([][]byte, error) {
	g, ctx := errgroup.WithContext(ctx)  // ctx canceled if any goroutine errors
	g.SetLimit(10)  // at most 10 concurrent goroutines (bounded)

	results := make([][]byte, len(urls))  // each goroutine writes a distinct index

	for i, url := range urls {
		i, url := i, url  // capture (pre-1.22)
		g.Go(func() error {
			data, err := fetch(ctx, url)
			if err != nil {
				return err  // cancels ctx → other goroutines exit
			}
			results[i] = data  // safe — distinct indices
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err  // first error from any goroutine
	}
	return results, nil
}
```

## Semaphore — Bounded Concurrency Without a Worker Pool

::code-wrapper{language="go"}
```go
// import "golang.org/x/sync/semaphore"
// A semaphore limits concurrent goroutines without a fixed worker pool.
// Each goroutine acquires a token; releasing returns it to the pool.

func processWithLimit(ctx context.Context, items []int, maxConcurrent int) error {
	sem := semaphore.NewWeighted(int64(maxConcurrent))
	var wg sync.WaitGroup

	for _, item := range items {
		wg.Add(1)
		go func(item int) {
			defer wg.Done()

			// Acquire a token (blocks if maxConcurrent are in use):
			if err := sem.Acquire(ctx, 1); err != nil {
				return  // ctx canceled
			}
			defer sem.Release(1)

			process(item)  // at most maxConcurrent goroutines here simultaneously
		}(item)
	}
	wg.Wait()
	return nil
}

// Use a semaphore when:
//   - You want bounded concurrency but the "jobs" are dynamically generated
//   - You don't want to pre-allocate a channel buffer
//   - Each goroutine needs to do setup/teardown around the work
```

## Generator — Lazy Stream

::code-wrapper{language="go"}
```go
// Generator: a function that returns a channel, producing values lazily.
// Values are generated on-demand — the next value isn't computed until
// someone receives.

func fibonacci(ctx context.Context) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		a, b := 0, 1
		for {
			select {
			case out <- a:
				a, b = b, a+b
			case <-ctx.Done():
				return
			}
		}
	}()
	return out
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()

	for n := range fibonacci(ctx) {
		fmt.Println(n)
		// 0 1 1 2 3 5 8 13 21 34 55 ... (stops after 10ms)
	}
}

// ⚠️ Generators MUST have an exit path (ctx.Done()) — otherwise
// the goroutine leaks if the consumer stops reading before the generator
// is done. The `for n := range` exits when ctx is canceled → out is closed.
```

## Graceful Shutdown — Production Pattern

::code-wrapper{language="go"}
```go
func runServer(ctx context.Context) error {
	// Start workers:
	jobs := make(chan Job, 100)
	go startProducer(ctx, jobs)

	// Process jobs with a worker pool:
	results := runWorkerPool(ctx, jobs, 10)

	// Wait for context cancellation (SIGINT/SIGTERM):
	<-ctx.Done()
	log.Println("shutdown signal received, draining...")

	// The workers' select includes <-ctx.Done() — they exit cleanly.
	// Channels are closed by the goroutines, ranges end, results are collected.

	return nil
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(),
		syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if err := runServer(ctx); err != nil &&
		!errors.Is(err, context.Canceled) {
		log.Fatal(err)
	}
	log.Println("server stopped")
}
```

## 💡 Tips & Tricks

- **Idiom**: use a worker pool for bounded concurrency — unbounded `go f()` in a loop can create millions of goroutines, exhausting memory and overwhelming downstream resources (DB connections, API rate limits). A fixed pool of N workers processes jobs from a channel.
- **Idiom**: each pipeline stage closes its output channel when done — `defer close(out)` in the goroutine. The next stage's `range` exits cleanly when the input channel is closed.
- **Idiom**: use `errgroup.WithContext` for concurrent error handling — `g.Go` returns an error → the context is canceled → other goroutines see `<-ctx.Done()` and exit. `g.Wait()` returns the first error.
- **Idiom**: use a semaphore (`golang.org/x/sync/semaphore`) for bounded concurrency without a worker pool — each goroutine acquires a token; `SetLimit` on errgroup is even simpler.
- **Idiom**: every concurrent goroutine MUST have an exit path (`<-ctx.Done()`) — without it, the goroutine leaks if it blocks forever. Generators, workers, pipelines all need cancellation.
- **Idiom**: use `signal.NotifyContext` for graceful shutdown — the context is canceled on SIGINT/SIGTERM, propagating to all goroutines that select on `ctx.Done()`.

## ⚠️ Edge Cases & Gotchas

- **Unbounded fan-out exhausts resources**: `for _, item := range huge { go process(item) }` creates len(huge) goroutines at once. Use a worker pool or semaphore for bounded concurrency.
- **Pipeline deadlock with unbuffered channels**: if stage A sends and stage B isn't ready, A blocks. Use buffered channels or ensure stages run concurrently.
- **Forgetting to close the output channel**: `for v := range ch` never returns unless `ch` is closed. The range goroutine leaks. Use `defer close(out)`.
- **Generator without exit path leaks**: `func gen() <-chan int { ch := make(chan int); go func() { for { ch <- compute() } }(); return ch }` — leaks if the consumer stops reading. Pass `ctx` and `select` on `ctx.Done()`.
- **`errgroup` cancels on first error**: `g.Go` returning an error cancels the context. Other goroutines see `<-ctx.Done()` and may exit early. This is by design (coordinated failure).
- **Worker pool with unbuffered results channel**: if no one reads results, workers block on `results <- r` → deadlock. Buffer the results channel or collect in a separate goroutine.
- **Goroutine leak in fan-in**: if the merged output isn't fully consumed, the fan-in goroutines block on `merged <- v` forever. Ensure the consumer drains the output or provide a cancellation path.
- **`select` in worker doesn't guarantee fairness**: if multiple cases are ready, `select` picks randomly. A always-ready case can starve others. Use separate goroutines or explicit scheduling.

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
func worker(jobs <-chan int, results chan<- int) {
	for j := range jobs {
		results <- j * j
	}
}

func main() {
	jobs := make(chan int, 100)
	results := make(chan int, 100)

	for w := 0; w < 3; w++ {
		go worker(jobs, results)
	}

	for j := 1; j <= 5; j++ {
		jobs <- j
	}
	close(jobs)

	for r := 0; r < 5; r++ {
		fmt.Println(<-results)
	}
}
```

Does this program terminate? What's printed (order may vary)?
::
<details>
<summary>Answer</summary>

Yes, it terminates. Printed (in some order):

```
1
4
9
16
25
```

The program works because:
1. 3 workers start, reading from the shared `jobs` channel.
2. 5 jobs are sent to the buffered `jobs` channel (capacity 100 — no blocking).
3. `close(jobs)` signals no more jobs. Workers' `range` loops end when jobs is drained.
4. Workers write results to `results` (buffered, capacity 100 — no blocking).
5. Main reads 5 results — all 5 are produced.

But the program has a subtle issue: it doesn't `close(results)` or wait for workers to finish. If we changed the buffer to 0 (unbuffered results), and main read fewer than 5 results, workers would block forever. The `WaitGroup` + `close(results)` pattern (from the full worker pool example) is more robust.

</details>

## 📚 What's Next

→ [27 — Profiling & Performance](/go/27-profiling-and-performance) — pprof, escape analysis, allocation reduction, and benchmark-driven optimization.