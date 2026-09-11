---
title: "17 — Channels"
description: "Unbuffered vs buffered semantics, close rules and ownership, directional channels, nil channel patterns, and channel memory mechanics."
---

# 17 — Channels

## Channel Semantics — The Complete Table

::code-wrapper{language="go"}
```go
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ Operation         │ State                │ Behavior                      │
// │ ──────────────────│ ─────────────────── │ ────────────────────────────── │
// │ Send (ch <- v)    │ unbuffered, no rx    │ blocks until receiver ready   │
// │ Send              │ buffered, buffer full│ blocks until space available  │
// │ Send              │ closed               │ PANIC                         │
// │ Send              │ nil                  │ blocks forever                │
// │ Receive (v := <-ch)│ unbuffered, no tx   │ blocks until sender ready      │
// │ Receive            │ buffered, empty     │ blocks until value available   │
// │ Receive            │ closed, drained      │ returns zero value, ok=false  │
// │ Receive            │ nil                  │ blocks forever                │
// │ close(ch)          │ open                 │ closes; receivers unblock     │
// │ close(ch)          │ closed               │ PANIC                         │
// │ close(ch)          │ nil                  │ PANIC                         │
// │ len(ch)             │ any                  │ # of buffered elements         │
// │ cap(ch)             │ any                  │ buffer capacity               │
// └──────────────────────────────────────────────────────────────────────────┘

func basics() {
	// Unbuffered — synchronous rendezvous (send blocks until receive):
	ch := make(chan int)
	go func() { ch <- 42 }()  // blocks until someone receives
	v := <-ch                 // receives 42, unblocks the sender
	fmt.Println(v)            // 42

	// Buffered — asynchronous up to capacity:
	bch := make(chan int, 3)
	bch <- 1  // doesn't block (buffer has space)
	bch <- 2
	bch <- 3
	// bch <- 4  // blocks (buffer full) until someone receives
	fmt.Println(<-bch)  // 1 (FIFO)
}
```

## Closing Channels — Rules and Ownership

::code-wrapper{language="go"}
```go
// RULE: only the SENDER closes the channel. The receiver never closes
// (it doesn't know if other senders exist).
//
// Closing signals "no more values will be sent."
// Receiving from a closed channel returns the zero value with ok=false.

func producer(out chan<- int) {  // send-only
	for i := 0; i < 5; i++ {
		out <- i
	}
	close(out)  // ✅ sender closes — signals "done"
}

func consumer(in <-chan int) {  // receive-only
	for v := range in {  // range stops when channel is closed and drained
		fmt.Println(v)  // 0 1 2 3 4
	}
}

func main() {
	ch := make(chan int)
	go producer(ch)
	consumer(ch)
}

// ─── Multiple senders — the coordinator pattern ───
// If multiple goroutines send, none should close directly (another might send).
// Use a coordinator goroutine that closes after all senders are done.

func multiSender(jobs []int) <-chan int {
	out := make(chan int)
	var wg sync.WaitGroup

	for _, job := range jobs {
		wg.Add(1)
		go func(j int) {
			defer wg.Done()
			out <- j  // send
		}(job)
	}

	// Coordinator: close after all senders finish
	go func() {
		wg.Wait()
		close(out)  // ✅ safe — all sends are done
	}()

	return out
}
```

## Directional Channels — Compiler-Enforced Intent

::code-wrapper{language="go"}
```go
// chan<- T  — send-only (can send, can't receive)
// <-chan T  — receive-only (can receive, can't send)
// chan T    — bidirectional (can send and receive)

// Use directional types in function signatures to document intent
// and let the compiler enforce it.

func producer(out chan<- int) {  // can only send to out
	for i := 0; i < 3; i++ {
		out <- i
	}
	// v := <-out  // compile error: cannot receive from send-only channel
	close(out)
}

func consumer(in <-chan int) {  // can only receive from in
	for v := range in {
		fmt.Println(v)
	}
	// in <- 42  // compile error: cannot send to receive-only channel
}

func main() {
	ch := make(chan int)      // bidirectional
	go producer(ch)           // implicitly converts to chan<- int
	consumer(ch)              // implicitly converts to <-chan int
}
```

## Nil Channels in `select` — Dynamic Case Control

::code-wrapper{language="go"}
```go
// A nil channel in select blocks that case FOREVER — effectively disabling it.
// This is a pattern for dynamically enabling/disabling select cases.

func dynamicSelect() {
	var send chan<- int = nil  // disabled — this case never fires
	var recv <-chan int = nil

	if shouldSend {
		send = someChannel  // enabled
	}
	if shouldReceive {
		recv = someOtherChannel
	}

	select {
	case send <- 42:     // only fires if send != nil
	case v := <-recv:    // only fires if recv != nil
		_ = v
	case <-time.After(time.Second):
		fmt.Println("timeout")
	}
}

// ─── Production pattern: state machine with nil channels ───
func stateMachine(input <-chan int, output chan<- int) {
	var pending int
	var hasPending bool
	var out chan<- int = nil  // disabled until we have something to send

	for {
		select {
		case v, ok := <-input:
			if !ok {
				return  // input closed
			}
			pending = v
			hasPending = true
			out = output  // enable the send case
		case out <- pending:  // only fires when out != nil (we have pending)
			hasPending = false
			out = nil  // disable the send case until next input
		}
	}
}
```

## Signal/Done Channels — `chan struct{}`

::code-wrapper{language="go"}
```go
// chan struct{} is the idiom for a signal channel — carries no data,
// zero bytes. close(done) signals to ALL receivers (unlike a send which
// only unblocks one receiver).

func signalPattern() {
	done := make(chan struct{})

	// Worker goroutines listen for done:
	for i := 0; i < 3; i++ {
		go func(id int) {
			select {
			case <-done:
				fmt.Printf("worker %d: shutting down\n", id)
				return
			case <-time.After(10 * time.Second):
				fmt.Printf("worker %d: work done\n", id)
			}
		}(i)
	}

	// Signal all workers to stop:
	close(done)  // ALL three <-done unblock simultaneously
	time.Sleep(time.Second)
}

// ┌──────────────────────────────────────────────────────────────────────┐
// │ close(done) vs done <- struct{}{}                                     │
// │   close: unblocks ALL receivers simultaneously (broadcast)           │
// │   send:  unblocks ONE receiver (if multiple are waiting, random)     │
// │                                                                        │
// │ For "stop" signals, always use close — it's a broadcast.             │
// │ For "pass a value", use send — it's point-to-point.                  │
// └──────────────────────────────────────────────────────────────────────┘
```

## Buffer Sizing — Deliberate, Not Default

::code-wrapper{language="go"}
```go
// Buffer size is a CONCURRENCY DECISION, not a performance optimization.
//
// Unbuffered (size 0): synchronous — sender and receiver rendezvous.
//   Use when the sender must know the receiver got the value (handoff).
//
// Buffered (size N): asynchronous up to N — decouples sender/receiver.
//   Use when rates differ (producer bursts, consumer processes steadily).
//   Size = the burst size or the number of workers.

// ❌ ANTI-PATTERN: using a buffer to "fix" a deadlock
//   ch := make(chan int, 100)  // "it was deadlocking, so I buffered"
//   The buffer DELAYS the deadlock, doesn't prevent it. Fix the design.

// ✅ CORRECT: buffer sized to match workers
func workerPool(jobs []Job, numWorkers int) {
	jobsCh := make(chan Job, numWorkers)     // buffer = worker count
	resultsCh := make(chan Result, numWorkers)

	// Start workers
	var wg sync.WaitGroup
	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range jobsCh {
				resultsCh <- process(j)
			}
		}()
	}

	// Feed jobs (buffer prevents blocking if workers are slow)
	for _, j := range jobs {
		jobsCh <- j
	}
	close(jobsCh)

	// Collect results
	go func() {
		wg.Wait()
		close(resultsCh)
	}()
	for r := range resultsCh {
		_ = r
	}
}
```

## Channel Memory Mechanics

::code-wrapper{language="go"}
```go
// A channel is a pointer to a runtime hchan struct:
//   type hchan struct {
//       qcount   uint           // number of buffered elements
//       dataqsiz uint           // buffer capacity
//       buf      unsafe.Pointer // circular buffer (for buffered channels)
//       elemsize uint16         // element size in bytes
//       sendx    uint           // send index in circular buffer
//       recvx    uint           // receive index in circular buffer
//       recvq    waitq          // list of goroutines waiting to receive
//       sendq    waitq          // list of goroutines waiting to send
//       lock     mutex          // protects the hchan struct
//   }
//
// Memory per channel:
//   - hchan struct: ~96 bytes
//   - Buffer (buffered): capacity × elementSize bytes
//   - Each blocked goroutine: ~2KB stack (on the sendq/recvq)
//
// A channel with 1000 ints: 96 + 1000×8 = ~8KB
// A channel with 1M structs (100 bytes each): 96 + 1M×100 = ~100MB
//   — be careful with large buffers for big element types
```

## 💡 Tips & Tricks

- **Idiom**: use `chan struct{}` for signal/done channels — zero bytes, signals "event only, no data." `close(done)` broadcasts to all receivers simultaneously.
- **Idiom**: the sender closes the channel — the receiver never closes (it doesn't know if other senders exist). For multiple senders, use a coordinator (WaitGroup + close after all done).
- **Idiom**: use directional channel types in function signatures (`func f(in <-chan int, out chan<- int)`) — documents intent, compiler enforces. Convert bidirectional to directional implicitly on call.
- **Idiom**: use a nil channel in `select` to disable a case dynamically — assigning `nil` makes that case block forever (never fires). Pattern for state machines and conditional send/receive.
- **Idiom**: use buffered channels to decouple producer/consumer when rates differ — a buffer absorbs bursts. Don't use buffering to "fix" a deadlock; size the buffer deliberately (worker count or expected burst).
- **Debug**: `len(ch)` and `cap(ch)` are rarely useful for synchronization — the values change immediately as goroutines send/receive. Don't use them for sync logic. Use them only for monitoring/metrics.

## ⚠️ Edge Cases & Gotchas

- **Sending to a closed channel panics**: only the sender closes, and only after all sends. Receiving from a closed channel is fine (zero value, ok=false).
- **Closing a closed channel panics**: double-close is a runtime panic. Use `sync.Once` if closing might be called multiple times.
- **Closing a nil channel panics**: `var ch chan int; close(ch)` → panic.
- **Receiving from a nil channel blocks forever**: `var ch chan int; <-ch` hangs. Useful in `select` (disables the case), a bug if unintended.
- **Unbuffered channels are synchronous**: `ch <- v` blocks until a receiver is ready. A sender with no receiver deadlocks. Ensure a receiver is running or use a buffer.
- **Buffered channels hide deadlocks temporarily**: a buffer full of sends with no receiver eventually deadlocks. The buffer delays, not prevents.
- **`range` over a channel blocks until close**: `for v := range ch` never returns unless `ch` is closed. Forgetting to close leaves the range goroutine stuck.
- **Multiple senders, one closer**: if multiple goroutines send, none should close directly. Use a coordinator or `context` to signal shutdown.
- **`len(ch)`/`cap(ch)` changes immediately**: the values are stale by the time you use them. Don't use for synchronization.
- **Channel capacity is fixed**: `make(chan T, n)` — can't resize. Pick the right capacity at creation.

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
func main() {
	ch := make(chan int, 2)
	ch <- 1
	ch <- 2
	close(ch)
	v1, ok1 := <-ch
	v2, ok2 := <-ch
	v3, ok3 := <-ch
	fmt.Println(v1, ok1)
	fmt.Println(v2, ok2)
	fmt.Println(v3, ok3)
}
```

What's printed?
::
<details>
<summary>Answer</summary>

```
1 true
2 true
0 false
```

The channel has 2 buffered values. After `close(ch)`:
- First receive: `v1=1, ok1=true` (buffered value)
- Second receive: `v2=2, ok2=true` (buffered value)
- Third receive: `v3=0, ok3=false` (buffer drained, channel closed → zero value, ok=false)

`ok=false` is how you detect "channel closed and drained." This is why `range` over a channel works — it receives until `ok` is false, then stops.

</details>

## 📚 What's Next

→ [18 — Select & Multiplexing](/go/18-select-and-multiplexing) — timeout patterns, fan-in, priority selects, and the `time.After` leak.