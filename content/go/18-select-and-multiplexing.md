# 18 — Select & Multiplexing

`select` lets a goroutine wait on multiple channel operations simultaneously, proceeding with whichever is ready first. It's the heart of Go's concurrent control flow.

## Syntax

::code-wrapper{language="go"}
```go
select {
case v := <-ch1:
	fmt.Println("received from ch1:", v)
case ch2 <- 42:
	fmt.Println("sent to ch2")
case <-time.After(time.Second):
	fmt.Println("timeout")
default:
	fmt.Println("nothing ready")
}
``
::

- `select` chooses **one** ready case at random (if multiple are ready).
- If no case is ready and there's a `default`, `default` runs (non-blocking).
- If no case is ready and no `default`, `select` blocks until one is ready.

## Timeout with `time.After`

::code-wrapper{language="go"}
```go
select {
case v := <-ch:
	fmt.Println(v)
case <-time.After(2 * time.Second):
	fmt.Println("timeout")
}
``
::

`time.After(d)` returns a channel that sends once after `d`. This is the idiomatic timeout pattern — but it leaks a timer if `ch` fires first (the timer goroutine lingers until `d` elapses). For tight loops, use `time.NewTimer` and `Stop` it:

::code-wrapper{language="go"}
```go
timer := time.NewTimer(2 * time.Second)
defer timer.Stop()   // don't leak the timer
select {
case v := <-ch:
	fmt.Println(v)
case <-timer.C:
	fmt.Println("timeout")
}
```

## Done/Cancellation Pattern

::code-wrapper{language="go"}
```go
func worker(done <-chan struct{}) {
	for {
		select {
		case <-done:
			return   // cancellation signal
		case v := <-input:
			process(v)
		}
	}
}
``
::

`<-done` (a `chan struct{}` that's closed to signal) lets the goroutine check for cancellation at each `select`. The `context` package (chapter 20) generalizes this.

## Non-Blocking Send/Receive with `default`

::code-wrapper{language="go"}
```go
// Non-blocking receive
select {
case v := <-ch:
	fmt.Println("got", v)
default:
	fmt.Println("no value ready")
}

// Non-blocking send
select {
case ch <- v:
	fmt.Println("sent")
default:
	fmt.Println("channel full, dropped")
}
``
::

`default` makes the `select` non-blocking — if no case is ready, `default` runs immediately. Use for "try to send/receive, but don't block."

## Random Selection Among Ready Cases

If multiple cases are ready, `select` picks **one at random** — not first-listed, not highest-priority:

::code-wrapper{language="go"}
```go
ch1, ch2 := make(chan int, 1), make(chan int, 1)
ch1 <- 1
ch2 <- 2
select {
case v := <-ch1:   // both ready — picked randomly
case v := <-ch2:
}
```

There's no priority. If you need priority, use nested selects (check the priority case first with a non-blocking `select`, then fall back).

## For-Select Loop (the Standard Pattern)

Most concurrent Go code is a `for` loop containing a `select`:

::code-wrapper{language="go"}
```go
for {
	select {
	case v := <-input:
		output <- process(v)
	case <-done:
		return
	}
}
``
::

This is the worker pattern — process inputs until cancelled. The `done` case provides the exit path.

## Fan-In (Merge Multiple Channels)

::code-wrapper{language="go"}
```go
func fanIn[T any](channels ...<-chan T) <-chan T {
	out := make(chan T)
	var wg sync.WaitGroup
	for _, ch := range channels {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for v := range ch {
				out <- v
			}
		}()
	}
	go func() {
		wg.Wait()
		close(out)   // close after all inputs are done
	}()
	return out
}
``
::

Multiple input channels are merged into one output. The `WaitGroup` tracks the input goroutines; when all are done, `out` is closed.

## Quit Channel / Graceful Shutdown

::code-wrapper{language="go"}
```go
func worker(input <-chan int, quit <-chan struct{}) {
	for {
		select {
		case v, ok := <-input:
			if !ok {
				return   // input closed
			}
			process(v)
		case <-quit:
			return   // cancellation
		}
	}
}
```

## 💡 Tips & Tricks

- **Idiom**: use `for { select { ... } }` as the standard concurrent loop — process inputs (or timeouts, or cancellation) until done. Always include a `<-done`/`<-ctx.Done()` case so the goroutine can exit; a `select` loop without an exit path is a leak.
- **Idiom**: use `time.After` for quick timeouts, but `time.NewTimer` + `Stop` in tight loops — `time.After` leaks the timer (and its goroutine) until it fires, even if you've moved on. In a hot loop, that's many lingering timers. `NewTimer` with `Stop` cleans up.
- **Idiom**: use `default` for non-blocking sends/receives — "try to send, drop if full" (`case ch <- v: ... default: drop`) is the pattern for metrics/events where dropping under load is acceptable. Without `default`, a full channel blocks the producer.
- **Idiom**: use `select` with a `done`/`ctx.Done()` case in every blocking wait — `select { case v := <-ch: ...; case <-done: return }` lets the goroutine exit even if `ch` never produces. Without the done case, a blocked `<-ch` can't be cancelled (leak).
- **Idiom**: for priority among cases, use a nested select — first a non-blocking select on the priority channel (`case v := <-priority: ...; default:`), then a regular select for the rest. Go's `select` is random among ready cases; nested selects give you a priority round.

## ⚠️ Edge Cases & Gotchas

- **`select` with no cases blocks forever**: `select {}` is a permanent block — used to keep a goroutine alive (e.g., in generated code), but a bug if unintended.
- **`select` with only `default` runs the default and continues**: `select { default: ... }` is a no-op (default always runs).
- **Random selection among ready cases**: no priority. Don't rely on case order.
- **`time.After` leaks**: the timer's goroutine lingers until the duration elapses, even if the `select` took another case. In hot loops, use `time.NewTimer` + `Stop`.
- **`default` makes the select non-blocking**: if you want to block (wait for a case), omit `default`.
- **A nil channel case is never ready**: `select { case x := <-nilch: ... }` — that case never fires. Useful for disabling cases (set the channel to nil to turn it off), a footgun if unintended.
- **Sending to a closed channel panics inside `select`**: same rule as outside — `select` doesn't protect against sends on closed channels.
- **`for-select` with `break` only breaks the `select`, not the `for`**: `for { select { case ...: break } }` — the `break` exits the `select`, then the `for` continues. Use `return` or a labeled `break` to exit the loop.
- **Starvation**: if one case is always ready, another may never be picked (random selection helps, but isn't fair). For fairness, use separate goroutines or explicit scheduling.

## 🧠 Spot the Bug

A developer writes a worker that should exit when `done` is closed, but it never does:

::code-wrapper{language="go"}
```go
func worker(input <-chan int, done <-chan struct{}) {
	for v := range input {
		select {
		case <-done:
			return   // intends to exit
		default:
			process(v)
		}
	}
}
```
::

What's wrong?

<details>
<summary>Answer</summary>

The `default` case makes the `select` non-blocking — if `<-done` isn't ready (not closed yet), `default` runs immediately and `process(v)` is called. The `select` never blocks on `<-done`, so it only checks `done` when there's an input to process, and even then, only as a non-blocking check.

The bigger issue: the `for v := range input` loop only checks `done` after receiving a value. If `input` never produces (or is slow), the worker is stuck in `range input`, never checking `done` — it can't be cancelled while waiting for input.

The fix — put both cases in the same `select` without `default`, so the goroutine blocks on whichever is ready:

```go
func worker(input <-chan int, done <-chan struct{}) {
	for {
		select {
		case v, ok := <-input:
			if !ok {
				return   // input closed
			}
			process(v)
		case <-done:
			return   // cancellation — fires even if input has nothing
		}
	}
}
```

Now the `select` blocks on either `input` or `done` — whichever becomes ready first. If `done` is closed while the worker is waiting for input, the `<-done` case fires and the worker exits. The `default` was wrong — it prevented blocking on `done`.

**The lesson**: `default` makes `select` non-blocking, which prevents waiting on `done`. For cancellation that works even when the main work is idle, block on both (input and done) without `default`.

</details>

## Summary

You can now use `select` to multiplex channel operations, add timeouts (`time.After`/`NewTimer`), non-blocking send/receive (`default`), cancellation (`done`/`ctx.Done()`), and build the standard `for-select` loop and fan-in. You understand random selection, nil-channel disabling, and the `default`-prevents-cancellation trap. Next: the `sync` package for lower-level concurrency primitives.