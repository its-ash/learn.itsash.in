---
title: "06 — Control Flow"
description: "if-init scoping, for-range internals, switch dispatch mechanics, labeled breaks, Go 1.22 loop scoping, and select as a concurrent control-flow primitive."
---

# 06 — Control Flow

Go has five control-flow constructs: `if`, `for`, `switch`, `select`, and `goto`. No `while`, no `do-while`, no `match`. This chapter covers the production patterns and the compiler-level mechanics.

## `if` — Init Statement and Scoping

::code-wrapper{language="go"}
```go
// The if-init form: `if init; condition { ... }`
// The init statement runs before the condition; the declared variable
// is scoped to the if/else block — it doesn't leak to the outer scope.

func ifInit() {
	// ✅ Idiomatic: err scoped to the if block
	if err := doWork(); err != nil {
		log.Fatal(err)
	}
	// err is NOT accessible here — it's block-scoped

	// ❌ ANTI-PATTERN: leaking err to the outer scope
	// err := doWork()
	// if err != nil { ... }
	// err is still alive here — unnecessary scope pollution

	// Multiple init variables:
	if user, err := fetchUser(id); err != nil {
		return err
	} else {
		process(user)  // user only accessible in the else block
	}
	// neither user nor err is accessible here
}
```

### Brace rules — mandatory and same-line

::code-wrapper{language="go"}
```go
// Go's automatic semicolon insertion (ASI): the lexer inserts a semicolon
// after certain tokens at end of line. This means the opening brace MUST
// be on the same line as if/for/func.

// ✅ Correct:
if x > 0 {
	doSomething()
}

// ❌ Compile error: "syntax error: unexpected semicolon or newline before {"
// if x > 0
// {
//     doSomething()
// }

// Braces are mandatory even for one-line bodies:
// ✅ if x > 0 { return }    — compiles
// ❌ if x > 0 return         — syntax error (no braces)
```

## `for` — One Construct, Four Forms

::code-wrapper{language="go"}
```go
// 1. Traditional (init; condition; post)
for i := 0; i < 10; i++ {
	fmt.Println(i)
}

// 2. While-like (condition only)
n := 10
for n > 0 {
	n--
}

// 3. Infinite (break to exit)
for {
	if done {
		break
	}
}

// 4. Range (slice, array, map, string, channel, integer)
for i, v := range items { }  // index + value
for _, v := range items { }  // value only (discard index)
for k, v := range m { }      // map: key + value
for k := range m { }         // map: key only
for i, r := range "café" { } // string: byte_offset + rune
for v := range ch { }        // channel: value (until closed)
for i := range 10 { }        // Go 1.22+: integer (0..9)
```

### `range` internals — how it works

::code-wrapper{language="go"}
```go
// ┌──────────────────────────────────────────────────────────────────┐
// │ range evaluates the expression ONCE at loop start, then          │
// │ iterates over a snapshot (for slices) or live data (for chans).  │
// │                                                                  │
// │ For slices: range captures len(s) at start. If you append to s   │
// │ during the loop, the new elements are NOT iterated.              │
// │                                                                  │
// │ For maps: iteration order is RANDOMIZED (intentionally, since    │
// │ Go 1.0) to prevent code from depending on order. Each run may    │
// │ produce different order.                                         │
// │                                                                  │
// │ For channels: range receives until the channel is closed.        │
// │                                                                  │
// │ For strings: range decodes UTF-8 lazily, yielding (byte_offset,  │
// │ rune) — the offset jumps by the rune's byte width.               │
// │                                                                  │
// │ For integers (Go 1.22+): `for i := range n` is sugar for         │
// │ `for i := 0; i < n; i++`. n must be a non-negative integer.      │
// └──────────────────────────────────────────────────────────────────┘

func rangeInternals() {
	s := []int{1, 2, 3}
	for i, v := range s {
		s = append(s, v*10)  // appends to s, but range uses the original len
		fmt.Println(i, v)    // prints 0 1, 1 2, 2 3 — new elements NOT iterated
	}
	fmt.Println(s)  // [1 2 3 10 20 30]

	// Map iteration is randomized:
	m := map[string]int{"a": 1, "b": 2, "c": 3}
	for k, v := range m {
		fmt.Println(k, v)  // order varies each run
	}

	// Ordered map iteration — sort keys first:
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		fmt.Println(k, m[k])  // deterministic order
	}
}
```

### Go 1.22 loop variable scoping — the fix

::code-wrapper{language="go"}
```go
// ┌──────────────────────────────────────────────────────────────────┐
// │ Go 1.22 spec change: each iteration of a for loop gets its OWN   │
// │ loop variable(s), rather than sharing a single variable.         │
// │                                                                  │
// │ Pre-1.22: `for i := 0; ... { go func() { use(i) }() }`           │
// │   → all goroutines see the FINAL i (single variable reused)     │
// │                                                                  │
// │ 1.22+: same code → each goroutine sees its iteration's i         │
// │   → each iteration creates a fresh i                            │
// │                                                                  │
// │ The go.mod `go 1.22` directive controls this behavior.           │
// │ A module with `go 1.21` still uses the old semantics even on     │
// │ a 1.22+ toolchain.                                               │
// └──────────────────────────────────────────────────────────────────┘

func loopScoping() {
	// Pre-1.22: prints 3 3 3 (or similar — all see final i)
	// 1.22+: prints 0 1 2 (each iteration's i is distinct)
	for i := 0; i < 3; i++ {
		go func() { fmt.Println(i) }()
	}
	time.Sleep(time.Second)

	// ✅ Portable fix (works on ALL versions):
	for i := 0; i < 3; i++ {
		go func(i int) { fmt.Println(i) }(i)  // pass as argument — fresh copy
	}

	// ✅ Or shadow (pre-1.22 idiom, harmless on 1.22+):
	for i := 0; i < 3; i++ {
		i := i  // shadow — new i per iteration
		go func() { fmt.Println(i) }()
	}
}
```

## `switch` — Dispatch Mechanics

::code-wrapper{language="go"}
```go
// Go switch does NOT fall through by default (unlike C/Java).
// Each case ends implicitly — no break needed.
// fallthrough is explicit and rare.

func basicSwitch(x int) {
	switch x {
	case 1:
		fmt.Println("one")
	case 2, 3:           // multiple values in one case
		fmt.Println("two or three")
	case 4:
		fmt.Println("four")
		// no break needed — case ends here
	default:
		fmt.Println("other")
	}
}

// fallthrough — jumps to the next case's body UNCONDITIONALLY
// (does NOT evaluate the next case's condition — unlike C):
func fallthroughDemo(x int) {
	switch x {
	case 1:
		fmt.Println("one")
		fallthrough       // executes case 2's body regardless of x
	case 2:
		fmt.Println("one or two")
	}
}

// No-expression switch — like if/else chain, but cleaner:
func noExprSwitch(x int) string {
	switch {
	case x < 0:
		return "negative"
	case x == 0:
		return "zero"
	case x > 0:
		return "positive"
	default:
		return "impossible"
	}
}

// Init + no-expression switch:
func initSwitch() {
	switch n := computeValue(); {
	case n < 0:
		handleNegative(n)
	case n == 0:
		handleZero()
	default:
		handlePositive(n)
	}
}
```

### Type switch — the interface dispatch pattern

::code-wrapper{language="go"}
```go
func typeSwitch(v any) string {
	switch x := v.(type) {
	case nil:
		return "nil"
	case int:
		return fmt.Sprintf("int: %d", x)     // x is int here
	case string:
		return fmt.Sprintf("string: %q", x)  // x is string here
	case []byte:
		return fmt.Sprintf("bytes: %d", len(x))
	case error:
		return x.Error()                      // x is error here
	default:
		return fmt.Sprintf("unknown: %T", x)
	}
}

// Multiple types in one case:
func multiTypeSwitch(v any) {
	switch v.(type) {
	case int, int8, int16, int32, int64:
		fmt.Println("integer type")
	case uint, uint8, uint16, uint32, uint64:
		fmt.Println("unsigned integer type")
	}
}
```

## Labeled `break`/`continue` — Nested Loop Control

::code-wrapper{language="go"}
```go
// Labels allow break/continue to target an OUTER loop from an inner one.
// Without labels, break/continue only affect the innermost loop.

func searchMatrix(matrix [][]int, target int) bool {
outer:
	for i, row := range matrix {
		for j, val := range row {
			if val == target {
				fmt.Printf("found at [%d][%d]\n", i, j)
				break outer  // exits BOTH loops
			}
			if val > target {
				continue outer  // skip to next row (not next column)
			}
		}
	}
	return true
}

// Labels are also used with select (to break out of a for-select loop):
func forSelectLoop(ch <-chan int, done <-chan struct{}) {
loop:
	for {
		select {
		case v := <-ch:
			process(v)
		case <-done:
			break loop  // exit the for loop (not just the select)
		}
	}
}
```

## `goto` — The One Legitimate Use

::code-wrapper{language="go"}
```go
// goto is almost never used in idiomatic Go. The one legitimate pattern
// is centralized error cleanup in C-style code (generated code, parsers):

func parseFile(path string) error {
	f, err := os.Open(path)
	if err != nil {
		goto errOpen  // skip other cleanups — nothing was opened yet
	}
	defer f.Close()

	buf, err := allocateBuffer()
	if err != nil {
		goto errBuf
	}
	defer buf.Free()

	// ... happy path ...

	return nil

errBuf:
	// buf failed to allocate — only f needs cleanup
	// (defer f.Close() already registered, runs on return)
	return fmt.Errorf("parse: %w", err)

errOpen:
	// f was never opened — no cleanup needed
	return fmt.Errorf("parse: %w", err)
}

// ⚠️ goto restrictions:
//   - Can't jump over variable declarations (compile error)
//   - Can't jump into a block from outside
//   - Can't jump out of a function
// These restrictions prevent spaghetti code — goto is deliberately limited.
```

## `select` — Concurrent Control Flow

::code-wrapper{language="go"}
```go
// select is Go's concurrent control flow — it waits on multiple channel
// operations simultaneously, executing the first one that's ready.
// If multiple are ready, it picks ONE at random.

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
		fmt.Println("no channel ready (non-blocking)")
	}
}

// select in a for loop — the event loop pattern:
func eventLoop(events <-chan Event, done <-chan struct{}) {
	for {
		select {
		case e := <-events:
			handleEvent(e)
		case <-done:
			return  // graceful shutdown
		}
	}
}

// ⚠️ Without `default`, select BLOCKS until a case is ready.
// With `default`, select is non-blocking (runs default if nothing ready).
// `default` in a for-select loop creates a busy-spin (CPU 100%) —
// almost always a bug. Don't use default in for-select unless you
// genuinely want non-blocking polling with a sleep.
```

## Production Pattern — State Machine with `switch`

::code-wrapper{language="go"}
```go
type State int
const (
	StateIdle State = iota
	StateConnecting
	StateConnected
	StateReconnecting
	StateError
)

type Event int
const (
	EventConnect Event = iota
	EventConnected
	EventDisconnect
	EventError
	EventRetry
)

// transition table — pure function, easy to test
func transition(s State, e Event) (State, error) {
	switch s {
	case StateIdle:
		switch e {
		case EventConnect:
			return StateConnecting, nil
		default:
			return s, fmt.Errorf("illegal event %d in state Idle", e)
		}
	case StateConnecting:
		switch e {
		case EventConnected:
			return StateConnected, nil
		case EventError:
			return StateError, nil
		case EventDisconnect:
			return StateIdle, nil
		default:
			return s, fmt.Errorf("illegal event %d in state Connecting", e)
		}
	case StateConnected:
		switch e {
		case EventDisconnect:
			return StateIdle, nil
		case EventError:
			return StateReconnecting, nil
		default:
			return s, fmt.Errorf("illegal event %d in state Connected", e)
		}
	case StateReconnecting:
		switch e {
		case EventConnected:
			return StateConnected, nil
		case EventError:
			return StateError, nil
		default:
			return s, fmt.Errorf("illegal event %d in state Reconnecting", e)
		}
	case StateError:
		switch e {
		case EventRetry:
			return StateConnecting, nil
		default:
			return s, fmt.Errorf("illegal event %d in state Error", e)
		}
	default:
		return s, fmt.Errorf("unknown state %d", s)
	}
}
```

## 💡 Tips & Tricks

- **Idiom**: `if init; condition` keeps temporary variables scoped to the block — `if err := f(); err != nil` signals "err is only for this check." This is the Go equivalent of try-catch's local error scope.
- **Idiom**: `switch` with no expression (`switch { case x < 0: ... }`) is cleaner than long `if/else if` chains — each case has its own condition, and the compiler generates a jump table when possible.
- **Idiom**: `for i := range n` (Go 1.22+) is the cleanest simple count loop — no off-by-one, no `<` vs `<=` confusion. Use for any "do this N times" loop.
- **Performance**: `range` over a slice copies the element value into the loop variable — for large structs, use index access (`for i := range s { s[i].field }`) to avoid copying. Or range over a slice of pointers.
- **Idiom**: labeled `break` for nested-loop exits — `break outer` is the clean way to exit from deep inside nested loops. The alternative (flags like `found := true; break`) is less readable.
- **Idiom**: `for-select` with a `done` channel and `break loop` is the standard concurrent event-loop pattern — the label is needed because `break` alone only exits the `select`, not the `for`.

## ⚠️ Edge Cases & Gotchas

- **Braces mandatory, same-line**: `if x\n{` is a syntax error (ASI inserts a semicolon after `x`). The opening brace must be on the same line as `if`/`for`/`func`.
- **`switch` doesn't fall through by default**: unlike C/Java, each case ends without `break`. `fallthrough` is explicit and jumps to the next case's body **unconditionally** (doesn't check the next case's value).
- **`range` over a string yields byte offsets**: `for i, r := range "café"` gives `i=0,2,3,4` (not `0,1,2,3`) because 'a' is 1 byte but 'é' is 2 bytes — the index is the byte position, not the character index.
- **`range` over a map is randomized**: iteration order is intentionally shuffled each run. Never depend on map iteration order — sort keys explicitly.
- **Modifying a slice during `range`**: `for i, v := range s { s = append(s, v) }` — `range` captured `len(s)` at loop start, so appended elements aren't iterated. Modifying existing elements (`s[i] = ...`) works fine.
- **`range` copies the element**: `for _, v := range largeSlice` copies each element into `v`. For large structs, use `for i := range s { v := &s[i] }` to avoid copies.
- **`continue` in a `select` inside a `for`**: `continue` applies to the enclosing `for`, not the `select`. This is correct but surprising.
- **`default` in a `for-select` causes busy-spin**: without a blocking case or a `time.Sleep`, the loop spins at 100% CPU. Only use `default` when you genuinely want non-blocking polling.
- **`goto` can't jump over variable declarations**: `goto end; x := 5; end:` is a compile error. `goto` is restricted to prevent scope violations.
- **Go 1.22 loop scoping is controlled by go.mod**: `go 1.22` in go.mod enables per-iteration loop variables. `go 1.21` keeps old semantics even on a 1.22+ compiler. The go directive is a language version selector, not just a minimum.
- **`for i := range -1`** (Go 1.22+): negative integers cause a runtime panic ("range clause: negative range value"). Always validate before ranging over a computed integer.

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
s := []int{1, 2, 3}
for i, v := range s {
	s = append(s, v*10)
	fmt.Printf("i=%d v=%d len=%d\n", i, v, len(s))
}
fmt.Println(s)
```

What's printed?
::
<details>
<summary>Answer</summary>

```
i=0 v=1 len=4
i=1 v=2 len=5
i=2 v=3 len=6
[1 2 3 10 20 30]
```

`range` evaluates `s` once at loop start, capturing `len(s) = 3`. The loop runs exactly 3 times (i=0,1,2) with the original values (1,2,3). The `append` inside the loop grows `s`, but `range` doesn't see the new length — it uses the snapshot from loop start.

The final `s` is `[1 2 3 10 20 30]` — the appends did happen, they just weren't iterated.

**The lesson**: `range` captures the slice's length at loop start. Appending during iteration doesn't extend the loop. If you need to process appended elements, use an explicit index loop: `for i := 0; i < len(s); i++ { s = append(s, s[i]*10) }` — but this creates an infinite loop! Use a captured length or a separate slice.

</details>

## 📚 What's Next

→ [07 — Arrays, Slices & Strings](/go/07-arrays-slices-and-strings) — slice header mechanics, `append` growth strategy, aliasing traps, and zero-allocation string patterns.