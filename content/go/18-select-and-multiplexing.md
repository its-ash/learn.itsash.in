---
title: "18 — Select & Multiplexing"
description: "Timeout patterns, the time.After leak, fan-in/fan-out, priority selects, for-select loops, and the nil-channel state machine pattern."
---

# 18 — Select & Multiplexing

`select` is Go's concurrent control flow — it waits on multiple channel operations, proceeding with whichever is ready first.

## Select Mechanics

::code-wrapper{language="go"}
```go
// ┌──────────────────────────────────────────────────────────────────────┐
// │ select chooses ONE ready case:                                       │
// │   - If multiple cases are ready, picks ONE at RANDOM (no priority)   │
// │   - If no case is ready and no default → BLOCKS until one is ready   │
// │   - If no case is ready and default present → runs default           │
// │   - A nil channel case → never ready (disabled)                     │
// │   - `select {}` (no cases, no default) → blocks forever             │
// └──────────────────────────────────────────────────────────────────────┘

func selectBasics() {
	ch1 := make(chan int, 1)
	ch2 := make(chan int, 1)
	ch1 <- 1

	select {
	case v := <-ch1:
		fmt.Println("from ch1:", v)
	case v := <-ch2:
		fmt.Println("from ch2:", v)
	case <-time.After(5 * time.Second):
		fmt.Println("timeout")
	default:
		fmt.Println("nothing ready (non-blocking)")
	}
}
```

## Timeout — `time.After` and the Leak

::code-wrapper{language="go"}
```go
// ❌ time.After leaks — the timer goroutine lingers until it fires,
// even if the select took another case. In a hot loop, this accumulates.
func timeoutBad(input <-chan int) {
	for {
		select {
		case v := <-input:
			process(v)
		case <-time.After(2 * time.Second):
			fmt.Println("timeout")
		}
	}
}
// Each iteration creates a new time.After timer. If input fires frequently,
// each unused timer lingers for 2 seconds → thousands of leaked timers.

// ✅ time.NewTimer + Stop — clean up the timer explicitly
func timeoutGood(input <-chan int) {
	timer := time.NewTimer(2 * time.Second)
	defer timer.Stop()

	for {
		timer.Reset(2 * time.Second)  // reset for each iteration
		select {
		case v := <-input:
			process(v)
		case <-timer.C:
			fmt.Println("timeout")
		}
	}
}
// timer.Stop() in the defer cleans up. timer.Reset() reuses the same timer.
```

## The For-Select Loop — The Standard Pattern

::code-wrapper{language="go"}
```go
// Most concurrent Go code is a for loop containing a select.
// ALWAYS include a done/ctx.Done() case for the exit path.

func worker(ctx context.Context, input <-chan int, output chan<- int) error {
	for {
		select {
		case v, ok := <-input:
			if !ok {
				return nil  // input closed — clean exit
			}
			select {
			case output <- process(v):
			case <-ctx.Done():
				return ctx.Err()  // cancelled while sending
			}
		case <-ctx.Done():
			return ctx.Err()  // cancelled
		}
	}
}

// ⚠️ `break` in a for-select only breaks the select, not the for loop!
// Use `return` or a labeled break to exit the loop:
func forSelectBreak() {
loop:
	for {
		select {
		case <-done:
			break loop  // ✅ labeled break exits the for loop
		case v := <-ch:
			process(v)
		}
	}
}
```

## Fan-In — Merging Multiple Channels

::code-wrapper{language="go"}
```go
// Fan-in: merge multiple input channels into one output.
// Each input channel gets a goroutine that forwards to the output.

func fanIn[T any](ctx context.Context, channels ...<-chan T) <-chan T {
	out := make(chan T)
	var wg sync.WaitGroup

	for _, ch := range channels {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for v := range ch {
				select {
				case out <- v:
				case <-ctx.Done():
					return  // cancelled — stop forwarding
				}
			}
		}()
	}

	// Close out after all forwarders finish
	go func() {
		wg.Wait()
		close(out)
	}()

	return out
}

// Usage:
func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ch1 := generate(ctx, 1, 2, 3)
	ch2 := generate(ctx, 4, 5, 6)
	ch3 := generate(ctx, 7, 8, 9)

	merged := fanIn(ctx, ch1, ch2, ch3)
	for v := range merged {
		fmt.Println(v)  // 1-9 in some order (concurrent)
	}
}
```

## Fan-Out — Distributing Work

::code-wrapper{language="go"}
```go
// Fan-out: distribute work from one channel to multiple workers.
// Workers run concurrently, each processing jobs from the shared channel.

func fanOut(ctx context.Context, jobs <-chan Job, numWorkers int) <-chan Result {
	results := make(chan Result)
	var wg sync.WaitGroup

	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for job := range jobs {
				select {
				case results <- process(ctx, job):
				case <-ctx.Done():
					return
				}
			}
		}(i)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	return results
}
```

## Priority Select — The Nested Pattern

::code-wrapper{language="go"}
```go
// select picks randomly among ready cases — no priority.
// For priority, use a nested select: try the priority case first
// (non-blocking), then fall back to a regular select.

func prioritySelect(high, low <-chan int) {
	for {
		// First, non-blocking check on high-priority channel:
		select {
		case v := <-high:
			fmt.Println("HIGH:", v)
			continue
		default:
		}

		// Then, regular select on both:
		select {
		case v := <-high:
			fmt.Println("HIGH:", v)
		case v := <-low:
			fmt.Println("LOW:", v)
		}
	}
}
// This drains high before processing low. But ⚠️ if high is always
// ready, low starves — use a separate goroutine or time-based fairness.
```

## The Done Channel Pattern (Pre-Context)

::code-wrapper{language="go"}
```go
// Before context.Context, the done channel was the standard cancellation pattern.
// context generalizes this — but the pattern is still useful to understand.

func workerDone(input <-chan int, done <-chan struct{}) {
	for {
		select {
		case v, ok := <-input:
			if !ok {
				return
			}
			process(v)
		case <-done:
			return  // cancellation signal — close(done) to broadcast
		}
	}
}

// ✅ Prefer context.Context (which wraps this pattern):
func workerCtx(ctx context.Context, input <-chan int) error {
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
			return ctx.Err()
		}
	}
}
```

## Non-Blocking Operations with `default`

::code-wrapper{language="go"}
```go
// default makes select non-blocking — runs default if no case is ready.

func nonBlocking(input <-chan int) {
	select {
	case v := <-input:
		fmt.Println("got:", v)
	default:
		fmt.Println("no value ready")
	}
}

// ─── Drop pattern: send if room, drop if full ───
func dropPattern(events chan<- Event, e Event) {
	select {
	case events <- e:  // sent
	default:
		log.Printf("dropping event (queue full): %+v", e)  // drop
	}
}
// Use for metrics/events where dropping under load is acceptable.
// Without default, a full channel blocks the producer → backpressure.

// ⚠️ Don't use default in a for-select loop — it causes a busy-spin (100% CPU).
// Only use default for one-shot non-blocking checks.
```

## Production Pattern — Graceful Shutdown

::code-wrapper{language="go"}
```go
func runServer(ctx context.Context, jobs <-chan Job) error {
	// Process jobs until context is cancelled
	for {
		select {
		case job, ok := <-jobs:
			if !ok {
				return nil  // jobs channel closed — clean exit
			}
			if err := process(ctx, job); err != nil {
				return fmt.Errorf("process job %d: %w", job.ID, err)
			}
		case <-ctx.Done():
			// Drain in-flight jobs (optional), then exit
			return ctx.Err()
		}
	}
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(),
		syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	jobs := make(chan Job, 100)
	// ... start job producers ...

	if err := runServer(ctx, jobs); err != nil &&
		!errors.Is(err, context.Canceled) {
		log.Fatal(err)
	}
}
```

## 💡 Tips & Tricks

- **Idiom**: use `for { select { ... } }` as the standard concurrent loop — always include a `<-ctx.Done()` case so the goroutine can exit. A select loop without an exit path is a leak.
- **Idiom**: use `time.NewTimer` + `Stop` in tight loops, not `time.After` — `time.After` leaks the timer goroutine until it fires. In hot loops, this accumulates thousands of leaked timers.
- **Idiom**: use `default` for non-blocking sends/receives — "try to send, drop if full" for metrics/events where dropping under load is acceptable. Without `default`, a full channel blocks the producer.
- **Idiom**: use `select` with `<-ctx.Done()` in every blocking wait — lets the goroutine exit even if the channel never produces. Without the done case, a blocked `<-ch` can't be cancelled.
- **Idiom**: for priority among cases, use a nested select — first a non-blocking select on the priority channel (`case v := <-priority: ...; default:`), then a regular select. Go's `select` is random, not prioritized.
- **Debug**: `break` in a `for-select` only breaks the `select`, not the `for` — use `return` or `break loop` (labeled) to exit the loop.

## ⚠️ Edge Cases & Gotchas

- **`select {}` blocks forever**: no cases, no default — permanent block. Used to keep a goroutine alive, but a bug if unintended.
- **`select` with only `default` runs the default and continues**: a no-op.
- **Random selection among ready cases**: no priority. Don't rely on case order.
- **`time.After` leaks**: the timer's goroutine lingers until the duration elapses, even if the `select` took another case. In hot loops, use `time.NewTimer` + `Stop`.
- **`default` makes the select non-blocking**: if you want to block (wait for a case), omit `default`.
- **A nil channel case is never ready**: `select { case x := <-nilch: ... }` never fires. Useful for disabling cases, a footgun if unintended.
- **Sending to a closed channel panics inside `select`**: same rule as outside — `select` doesn't protect against sends on closed channels.
- **`for-select` with `break` only breaks the `select`**: the `for` continues. Use `return` or labeled `break` to exit the loop.
- **Starvation**: if one case is always ready, another may never be picked (random helps, but isn't fair). Use separate goroutines or explicit scheduling.

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
func main() {
	ch := make(chan int, 1)
	ch <- 1

	select {
	case v := <-ch:
		fmt.Println("received", v)
	case ch <- 2:
		fmt.Println("sent 2")
	}
}
```

Which case runs?
::
<details>
<summary>Answer</summary>

The **receive case** runs:

```
received 1
```

Both cases could be ready:
- `case v := <-ch`: ready — there's a buffered value (1)
- `case ch <- 2`: NOT ready — the buffer is full (capacity 1, already has 1)

So only the receive case is ready. It runs, printing "received 1".

After the receive, the buffer is empty — but the `select` already chose. The `ch <- 2` send case was not ready (buffer was full), so it was never considered.

If the buffer had capacity 2 (`make(chan int, 2)`), both cases would be ready, and `select` would pick one at random.

</details>

## 📚 What's Next

→ [19 — sync Package](/go/19-sync-package) — Mutex, RWMutex, WaitGroup, Once, Cond, Pool, and Map — the lower-level synchronization primitives.