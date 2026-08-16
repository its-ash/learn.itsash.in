# 17 — Channels

Channels are the conduit for communicating between goroutines. Go's mantra: **"Don't communicate by sharing memory; share memory by communicating."**

## Basics

::code-wrapper{language="go"}
```go
ch := make(chan int)   // unbuffered

ch <- 42        // send (blocks until someone receives)
v := <-ch       // receive (blocks until someone sends)

ch := make(chan int, 3)   // buffered, capacity 3
ch <- 1   // doesn't block (buffer has space)
ch <- 2
ch <- 3
// ch <- 4   // blocks (buffer full) until someone receives
v := <-ch  // 1 (FIFO)
``
::

- **Unbuffered** (`make(chan T)`) — send blocks until a receiver is ready; receive blocks until a sender is ready. Synchronous rendezvous.
- **Buffered** (`make(chan T, n)`) — send blocks only when the buffer is full; receive blocks only when the buffer is empty. Asynchronous up to capacity.

## Closing Channels

::code-wrapper{language="go"}
```go
ch := make(chan int)
close(ch)   // signals no more sends

v, ok := <-ch   // ok is false after all buffered values are consumed and ch is closed
// v is the zero value, ok is false

// Range over a channel until it's closed
for v := range ch {
	fmt.Println(v)   // stops when ch is closed and drained
}
``
::

- `close(ch)` signals "no more values will be sent."
- Receiving from a closed channel returns the zero value with `ok == false`.
- `range` over a channel receives until it's closed, then stops.
- **Sending to a closed channel panics** — only the sender should close.
- **Closing an already-closed channel panics**.
- **Closing a nil channel blocks forever** (don't).

### Who should close?

The **sender** closes — the receiver never closes (it doesn't know if other senders exist). Closing is a signal from the sender(s) that no more values will come. If there are multiple senders, coordinate closing via a separate "shutdown" channel or a `context`.

## Directional Channels

Channels can be typed as send-only or receive-only (for function parameters, documenting intent):

::code-wrapper{language="go"}
```go
func producer(out chan<- int) {   // send-only
	for i := 0; i < 3; i++ {
		out <- i
	}
	close(out)
}

func consumer(in <-chan int) {    // receive-only
	for v := range in {
		fmt.Println(v)
	}
}

ch := make(chan int)
go producer(ch)
consumer(ch)
``
::

`chan<- T` (send-only), `<-chan T` (receive-only). The compiler enforces direction — a send-only channel can't be received from.

## Channel Semantics Summary

| Operation | State | Behavior |
|---|---|---|
| Send (`ch <- v`) | unbuffered, no receiver | blocks |
| Send | buffered, buffer full | blocks |
| Send | closed | **panics** |
| Send | nil | blocks forever |
| Receive (`v := <-ch`) | unbuffered, no sender | blocks |
| Receive | buffered, buffer empty | blocks |
| Receive | closed, drained | returns zero value, `ok == false` |
| Receive | nil | blocks forever |
| `close(ch)` | open | closes |
| `close(ch)` | closed | **panics** |
| `close(ch)` | nil | **panics** |

## Common Patterns

### Signal/done channel

::code-wrapper{language="go"}
```go
done := make(chan struct{})
go func() {
	// do work
	close(done)   // signal completion (close, not send — multiple receivers)
}()
<-done   // block until done is closed
``
::

`chan struct{}` is the idiom for a signal channel — empty struct carries no data, zero-size. `close(done)` signals to **all** receivers (multiple `<-done` unblock on close); a send only unblocks one receiver.

### Worker pool (preview, chapter 26)

::code-wrapper{language="go"}
```go
jobs := make(chan Job, 100)
results := make(chan Result, 100)

for i := 0; i < numWorkers; i++ {
	go worker(jobs, results)
}
``
::

### Fan-out/fan-in

::code-wrapper{language="go"}
```go
// Fan-out: multiple goroutines read from the same input channel
out := make(chan int)
for i := 0; i < 3; i++ {
	go func(in <-chan int, out chan<- int) {
		for v := range in {
			out <- process(v)
		}
	}(in, out)
}
``
::

## `nil` Channels in `select`

A nil channel in `select` blocks that case forever — effectively disabling it. This is a pattern for dynamically enabling/disabling cases:

::code-wrapper{language="go"}
```go
var send chan<- int = nil   // disabled
if shouldSend {
	send = someChannel   // enabled
}
select {
case send <- v:   // only fires if send != nil
case <-done:
}
``
::

## 💡 Tips & Tricks

- **Idiom**: use `chan struct{}` for signal/done channels — the empty struct carries no data and takes no space, signaling "I only care about the event, not a value." `close(done)` unblocks all receivers (multiple `<-done`), unlike a send which unblocks one.
- **Idiom**: the **sender closes** the channel — the receiver never closes (it doesn't know if other senders exist). For multiple senders, coordinate closing via a separate shutdown channel or a `context` (the sender goroutine that observes the shutdown closes the data channel).
- **Idiom**: use directional channel types in function signatures (`func f(in <-chan int, out chan<- int)`) — documents intent and lets the compiler enforce it (a send-only channel can't be received from). Convert a bidirectional channel to directional implicitly on call.
- **Idiom**: use buffered channels to **decouple** producers and consumers when their rates differ — a buffer absorbs bursts. But don't use buffering to "fix" a deadlock; size the buffer deliberately (e.g., the number of workers, or the expected burst size).
- **Idiom**: use a nil channel in `select` to disable a case dynamically — assigning `nil` to a channel variable makes that `select` case block forever (never fire), effectively turning it off. This is the pattern for conditionally sending/receiving in a loop.

## ⚠️ Edge Cases & Gotchas

- **Sending to a closed channel panics**: only the sender closes, and only after all sends. The receiver receiving from a closed channel is fine (gets zero value).
- **Closing a closed channel panics**: double-close is a runtime panic.
- **Closing a nil channel panics**: `var ch chan int; close(ch)` panics.
- **Receiving from a nil channel blocks forever**: `var ch chan int; <-ch` hangs. Useful in `select` (disables the case) but a bug if unintended.
- **Unbuffered channels are synchronous**: `ch <- v` blocks until a receiver is ready — a sender with no receiver deadlocks. Use a buffered channel or ensure a receiver is running.
- **Buffered channels hide deadlocks temporarily**: a buffer full of sends with no receiver eventually deadlocks. The buffer delays, not prevents, the deadlock.
- **`range` over a channel blocks until close**: `for v := range ch` never returns unless `ch` is closed. Forgetting to close leaves the range goroutine stuck.
- **Multiple senders, one closer**: if multiple goroutines send to a channel, none should close it directly (another might still send). Use a coordinator (a separate goroutine that closes after all senders are done, or a `context`).
- **Channel capacity is fixed**: `make(chan T, n)` — you can't resize. Pick the right capacity at creation.
- **`len(ch)` and `cap(ch)`**: `len` is the number of buffered elements, `cap` is the capacity. These are rarely useful (the value changes immediately as goroutines send/receive) — don't use them for synchronization logic.

## 🧠 Spot the Bug

A developer creates a pipeline but it deadlocks:

::code-wrapper{language="go"}
```go
func main() {
	ch := make(chan int)
	go func() {
		for i := 0; i < 5; i++ {
			ch <- i
		}
		close(ch)
	}()
	// (no receiver)
}
```
::

What's wrong?

<details>
<summary>Answer</summary>

The goroutine sends to an **unbuffered channel** with no receiver. `ch <- i` blocks on the first send, waiting for a receiver that never exists (main doesn't receive). The goroutine is stuck, and if main were waiting on it (via WaitGroup), the whole program would deadlock.

The fixes:
1. **Add a receiver in main**:
```go
for v := range ch {
	fmt.Println(v)
}
```
2. **Use a buffered channel** (if the sender should proceed without an immediate receiver):
```go
ch := make(chan int, 5)   // buffer holds all 5, sender doesn't block
```
3. **Both** — a buffered channel *and* a receiver (main consumes after the goroutine produces).

**The lesson**: an unbuffered channel send blocks until a receiver is ready. A sender with no receiver deadlocks. Either add a receiver or use a buffered channel (but the buffer must be large enough, or the deadlock is just delayed).

</details>

## Summary

You can now create unbuffered/buffered channels, send/receive, close (sender closes), range over channels, use directional types, and build signal/done patterns — while avoiding the send-to-closed-panic, deadlock-with-no-receiver, and multiple-sender-closing traps. Next: `select` for multiplexing channel operations.