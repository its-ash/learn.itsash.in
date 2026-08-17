# 26 — Concurrency Patterns

This chapter collects the standard Go concurrency patterns: worker pools, pipelines, fan-out/fan-in, generators, and graceful shutdown.

## Worker Pool

A fixed number of workers process jobs from a channel — bounded concurrency:

::code-wrapper{language="go"}
```go
func worker(id int, jobs <-chan Job, results chan<- Result, wg *sync.WaitGroup) {
	defer wg.Done()
	for job := range jobs {
		results <- process(job)
	}
}

func runWorkerPool(jobs []Job, numWorkers int) []Result {
	jobCh := make(chan Job, len(jobs))
	resultCh := make(chan Result, len(jobs))
	var wg sync.WaitGroup

	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go worker(i, jobCh, resultCh, &wg)
	}

	for _, j := range jobs {
		jobCh <- j
	}
	close(jobCh)   // no more jobs — workers' range loops end

	wg.Wait()
	close(resultCh)

	results := make([]Result, 0, len(jobs))
	for r := range resultCh {
		results = append(results, r)
	}
	return results
}
```
::
Use a worker pool when you have many jobs and want to limit concurrency (e.g., to avoid overwhelming a database or API).

## Pipeline

A series of stages, each a goroutine reading from one channel and writing to the next:

::code-wrapper{language="go"}
```go
func generate(nums ...int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		for _, n := range nums {
			out <- n
		}
	}()
	return out
}

func square(in <-chan int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		for n := range in {
			out <- n * n
		}
	}()
	return out
}

func filter(in <-chan int, pred func(int) bool) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		for n := range in {
			if pred(n) {
				out <- n
			}
		}
	}()
	return out
}

// Compose
nums := generate(1, 2, 3, 4, 5)
squared := square(nums)
evens := filter(squared, func(n int) bool { return n%2 == 0 })
for n := range evens {
	fmt.Println(n)   // 4, 16
}
```
::
Each stage runs concurrently, processing elements as they arrive. Each stage closes its output channel when the input is exhausted.

## Fan-Out, Fan-In

Fan-out: multiple goroutines read from the same input, processing in parallel. Fan-in: merge their outputs into one channel:

::code-wrapper{language="go"}
```go
func fanOutFanIn(ctx context.Context, input <-chan int, workers int) <-chan int {
	out := make(chan int)
	var wg sync.WaitGroup
	wg.Add(workers)

	for i := 0; i < workers; i++ {
		go func() {
			defer wg.Done()
			for v := range input {
				select {
				case out <- process(v):
				case <-ctx.Done():
					return
				}
			}
		}()
	}

	go func() {
		wg.Wait()
		close(out)
	}()

	return out
}
```
::
Multiple workers process the same input channel (fan-out); their outputs merge into `out` (fan-in, via the shared output channel + WaitGroup).

## Generator (channel-producing function)

A function that returns a channel and emits values:

::code-wrapper{language="go"}
```go
func counter(start, end int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		for i := start; i < end; i++ {
			out <- i
		}
	}()
	return out
}

for n := range counter(0, 5) {
	fmt.Println(n)   // 0 1 2 3 4
}
```
::
Generators turn a sequence into a channel, composable with other patterns.

## Done Channel / Cancellation

::code-wrapper{language="go"}
```go
func generator(done <-chan struct{}, nums ...int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		for _, n := range nums {
			select {
			case out <- n:
			case <-done:
				return
			}
		}
	}()
	return out
}

done := make(chan struct{})
out := generator(done, 1, 2, 3, 4, 5)
fmt.Println(<-out)   // 1
fmt.Println(<-out)   // 2
close(done)          // signal the generator to stop
```
::
Each stage checks `<-done` (or `<-ctx.Done()`) in its `select`, so closing `done` cascades through the pipeline. This is the foundation of graceful shutdown.

## Bounded Parallelism (semaphore with buffered channel)

::code-wrapper{language="go"}
```go
func boundedParallel(items []Item, maxConcurrency int) {
	sem := make(chan struct{}, maxConcurrency)
	var wg sync.WaitGroup
	for _, item := range items {
		wg.Add(1)
		sem <- struct{}{}   // acquire (blocks if full)
		go func(item Item) {
			defer wg.Done()
			defer func() { <-sem }()   // release
			process(item)
		}(item)
	}
	wg.Wait()
}
```
::
A buffered channel as a semaphore limits concurrent goroutines to `maxConcurrency`. Simpler than a worker pool for one-shot parallelism.

## Or-Done Channel

A helper that returns a channel closed when *any* of the input/done channels closes:

::code-wrapper{language="go"}
```go
func orDone(done <-chan struct{}, c <-chan T) <-chan T {
	out := make(chan T)
	go func() {
		defer close(out)
		for {
			select {
			case <-done:
				return
			case v, ok := <-c:
				if !ok {
					return
				}
				select {
				case out <- v:
				case <-done:
				}
			}
		}
	}()
	return out
}
```
::
Wraps a channel so reading from it cancels when `done` closes — used in pipelines to avoid leaking goroutines blocked on a send.

## Rate Limiting

::code-wrapper{language="go"}
```go
import "golang.org/x/time/rate"

limiter := rate.NewLimiter(rate.Every(100*time.Millisecond), 10)   // 10/s, burst 10
for _, req := range requests {
	if err := limiter.Wait(ctx); err != nil {
		return err
	}
	handle(req)
}
```
::
`x/time/rate` provides token-bucket rate limiting — `Wait` blocks until a token is available, enforcing a rate limit.

## 💡 Tips & Tricks

- **Idiom**: use a worker pool for bounded concurrency with many jobs — a fixed number of workers reading from a jobs channel limits concurrency (e.g., to avoid overwhelming a database), and the pattern scales to any number of jobs without spawning a goroutine per job.
- **Idiom**: use a pipeline (each stage a goroutine, connected by channels) for stream processing — each stage runs concurrently and processes elements as they arrive, with backpressure via the channels. Close each stage's output when the input is exhausted (so downstream ranges end).
- **Idiom**: include a `<-done` (or `<-ctx.Done()`) case in every blocking `select` in a concurrent pattern — it provides the exit path so a pipeline/worker/generator can be stopped, preventing leaks. Closing `done` cascades through all stages checking it.
- **Idiom**: use a buffered channel as a semaphore for one-shot bounded parallelism — `sem := make(chan struct{}, N)`; acquire with `sem <- struct{}{}`, release with `<-sem`. Simpler than a worker pool for "do these N things with at most K concurrent."
- **Idiom**: use `x/time/rate` for rate limiting — `rate.NewLimiter(rate.Every(d), burst)` + `limiter.Wait(ctx)` enforces a rate limit with a token bucket. Essential for APIs with rate limits or for protecting downstream services.

## ⚠️ Edge Cases & Gotchas

- **Goroutine leak from unclosed channels**: a pipeline stage blocked on `out <- v` (no receiver) with no `<-done` case is a leak. Always include cancellation and ensure channels are closed or drained.
- **Closing a channel from the receiver side**: the sender closes, not the receiver. If the receiver closes, the sender may send to a closed channel (panic). Use a `done` channel to signal the sender to stop (and close its output) instead.
- **Fan-in must close after all senders are done**: use a `WaitGroup` to track senders; a goroutine closes the merged output after `wg.Wait()`. Closing too early panics senders; too late leaks receivers.
- **Worker pool and `range` on a closed channel**: workers must `range jobs` (ending when `jobs` is closed). If you don't close `jobs`, workers block on `<-jobs` forever (leak).
- **Pipeline backpressure**: unbuffered channels create backpressure (a slow stage slows upstream). Buffered channels decouple but can hide deadlocks. Size buffers deliberately.
- **`for range` over a nil channel blocks forever**: if a pipeline stage's input is accidentally nil, it hangs. Ensure channels are initialized.
- **Generator must close its output**: `defer close(out)` in the generator, so the consumer's `range` ends. Forgetting close leaves the consumer blocked.
- **Shared state in workers**: workers must not share mutable state without synchronization. If they share a result slice, use a mutex or send results to a channel (the fan-in pattern).
- **`ctx.Done()` and pipeline shutdown**: pass `ctx` through the pipeline; each stage's `select` includes `<-ctx.Done()`. When `ctx` is canceled, all stages exit, and channels close (via `defer close`), ending downstream ranges.
- **Deadlock with unbuffered channels**: a pipeline of unbuffered channels where the final consumer is slow can deadlock (each stage blocks on send). Buffer or ensure consumers keep up.

## 🧠 Spot the Bug

A pipeline has three stages, but the program hangs after processing a few elements:

::code-wrapper{language="go"}
```go
func gen(nums ...int) <-chan int {
	out := make(chan int)
	go func() {
		for _, n := range nums {
			out <- n
		}
	}()
	return out   // out is never closed
}

for v := range gen(1, 2, 3) {
	fmt.Println(v)
}
```
::

What's wrong?

<details>
<summary>Answer</summary>

The generator's `out` channel is **never closed**. The `for v := range out` loop blocks waiting for more values or for `out` to close — but `out` is never closed (the goroutine sends 1, 2, 3 and exits without closing). The `range` hangs after receiving 3, waiting forever.

The fix — close the channel when generation is done:

```go
func gen(nums ...int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)   // ✅ close when done
		for _, n := range nums {
			out <- n
		}
	}()
	return out
}
```
::
Now after sending 1, 2, 3, the goroutine closes `out`, and the `range` loop ends cleanly.

**The lesson**: a `for v := range ch` loop only ends when `ch` is closed. A generator (or any channel-producing function) must close its output when done, or the consumer hangs. Use `defer close(out)` at the top of the producing goroutine.

</details>

## Summary

You can now build worker pools (bounded concurrency), pipelines (stream processing), fan-out/fan-in, generators, bounded parallelism (semaphore), and rate-limited concurrency — with cancellation (`done`/`ctx`) and proper channel closing to prevent leaks and deadlocks. Next: profiling and performance.