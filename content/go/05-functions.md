---
title: "05 — Functions"
description: "Multiple returns, closure capture semantics, defer execution model, variadic mechanics, and function-type patterns for production Go."
---

# 05 — Functions

## Declaration Forms and Return Patterns

::code-wrapper{language="go"}
```go
// ┌─────────────────────────────────────────────────────────────────────┐
// │ Form                    │ Use Case                                 │
// │ ─────────────────────── │ ──────────────────────────────────────── │
// │ func f(a, b int) int    │ simple function                          │
// │ func f(a, b int)(int,error) │ Go's (value, error) convention       │
// │ func f()(q, r int)      │ named returns (defer modification)       │
// │ func f(a int, opts ...Opt) T │ variadic (builder/options pattern) │
// │ func f() func() int     │ returning a closure (stateful function) │
// │ var f func(int)int = ... │ function as a value                     │
// └─────────────────────────────────────────────────────────────────────┘

// Multiple returns — Go's primary error-handling mechanism:
func fetchUser(id int64) (*User, error) {
	if id <= 0 {
		return nil, fmt.Errorf("fetchUser: invalid id %d", id)
	}
	return &User{ID: id}, nil
}

// Named returns — pre-declared, zero-initialized, can be modified by defer:
func divide(a, b int) (result int, err error) {
	if b == 0 {
		err = errors.New("divide by zero")
		return  // naked return — returns (result=0, err=error)
	}
	result = a / b
	return  // returns (result=quotient, err=nil)
}
```
::

### Named returns — the real use case

::code-wrapper{language="go"}
```go
// ❌ ANTI-PATTERN: naked returns in long functions (unreadable)
func process(data []byte) (result []byte, err error) {
	// ... 50 lines of code ...
	result = transform(data)
	// ... 30 more lines ...
	return  // ← what does this return? reader must scan entire function
}

// ✅ CORRECT: named returns for defer-based error decoration and timing:
func timedOperation(ctx context.Context) (result int, err error) {
	start := time.Now()
	defer func() {
		// Log the duration and decorate the error on the way out:
		elapsed := time.Since(start)
		if err != nil {
			err = fmt.Errorf("timedOperation (took %v): %w", elapsed, err)
		}
		log.Printf("timedOperation took %v", elapsed)
	}()

	// ... actual work ...
	result = 42
	return result, nil
}

// ✅ Panic recovery via deferred named return:
func safeExec(fn func() error) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("recovered from panic: %v", r)
		}
	}()
	return fn()
}
```
::

## Variadic Functions — The Options Pattern

::code-wrapper{language="go"}
```go
// Variadic: `...T` becomes a `[]T` inside the function. Must be last param.

func sum(nums ...int) int {
	total := 0
	for _, n := range nums {
		total += n
	}
	return total
}
// sum(1, 2, 3) → 6
// nums := []int{1, 2, 3}; sum(nums...) → 6  (spread a slice)

// ─── Production pattern: functional options ───
type Server struct {
	addr    string
	port    int
	tls     bool
	timeout time.Duration
}

type Option func(*Server)  // function type that mutates the server config

func WithPort(p int) Option {
	return func(s *Server) { s.port = p }
}
func WithTLS(cfg *tls.Config) Option {
	return func(s *Server) { s.tls = true }
}
func WithTimeout(d time.Duration) Option {
	return func(s *Server) { s.timeout = d }
}

func NewServer(addr string, opts ...Option) *Server {
	s := &Server{
		addr:    addr,
		port:    8080,           // sensible default
		timeout: 30 * time.Second,
	}
	for _, opt := range opts {
		opt(s)  // apply each option
	}
	return s
}

// Usage — readable, extensible, zero config structs:
srv := NewServer(":8080",
	WithPort(9090),
	WithTimeout(10*time.Second),
	WithTLS(tlsConfig),
)
```
::

## Closures — Capture Semantics

::code-wrapper{language="go"}
```go
// Closures capture variables BY REFERENCE (not by value).
// The captured variable outlives the function that declared it —
// it's moved to the heap (escape analysis detects this).

func counter() func() int {
	n := 0                    // captured by the closure below
	return func() int {
		n++                  // modifies the SAME n across calls
		return n
	}
}
// c := counter(); c() → 1; c() → 2; c() → 3
// Each call to counter() creates a NEW n (independent counters).

// ─── Generator pattern ───
func fibonacci() func() int {
	a, b := 0, 1
	return func() int {
		a, b = b, a+b
		return a
	}
}
// f := fibonacci(); f() → 1; f() → 1; f() → 2; f() → 3; f() → 5

// ─── The loop variable capture trap (pre-Go 1.22) ───
func captureTrap() {
	var fns []func()
	for i := 0; i < 3; i++ {
		fns = append(fns, func() { fmt.Println(i) })  // captures i by reference
	}
	for _, f := range fns {
		f()
	}
	// Go 1.21: 3 3 3  (all see the final i=3 — single variable reused)
	// Go 1.22+: 0 1 2 (each iteration has its own i — spec change)
}

// ✅ Pre-1.22 fix (still safe on 1.22+):
func captureFixed() {
	var fns []func()
	for i := 0; i < 3; i++ {
		i := i  // shadow — creates a new i per iteration
		fns = append(fns, func() { fmt.Println(i) })
	}
	// 0 1 2 on all versions
}
```
::

## Functions as Values and Types

::code-wrapper{language="go"}
```go
// Function types are first-class — assignable, passable, returnable.
// A function type is spelled: func(paramTypes) returnTypes

type Mapper[T, U any] func(T) U  // generic function type (Go 1.18+)

// Higher-order: function that takes a function:
func mapSlice[T, U any](items []T, fn Mapper[T, U]) []U {
	result := make([]U, len(items))
	for i, item := range items {
		result[i] = fn(item)
	}
	return result
}

// Usage:
doubled := mapSlice([]int{1, 2, 3}, func(x int) int { return x * 2 })
// [2 4 6]

// Function type as a field — strategy pattern:
type Processor struct {
	transform func([]byte) []byte  // injected strategy
}
func (p *Processor) Process(data []byte) []byte {
	return p.transform(data)
}

// ⚠️ Function types are distinct — no implicit conversion:
//   func(int) int ≠ func(int64) int (different parameter types)
//   func() ≠ func() error (different return types)
```
::

## `defer` — The Execution Model

::code-wrapper{language="go"}
```go
// defer schedules a function call to run when the enclosing function returns.
// Key properties:
//   1. LIFO order (last deferred runs first)
//   2. Arguments evaluated IMMEDIATELY (at defer time, not run time)
//   3. Runs on panic (before the program crashes) — but NOT on os.Exit
//   4. Has a small overhead (~35ns per defer pre-1.14, ~1ns open-coded 1.14+)

func deferOrder() {
	// LIFO unwind:
	defer fmt.Println("1")  // runs 4th (last)
	defer fmt.Println("2")  // runs 3rd
	defer fmt.Println("3")  // runs 2nd
	fmt.Println("4")        // runs 1st (immediate)
	// Output: 4, 3, 2, 1
}

// ─── Argument evaluation timing ───
func deferArgEval() {
	i := 1
	defer fmt.Println(i)  // prints 1 — i evaluated NOW (at defer time)
	i = 2
	defer func() { fmt.Println(i) }()  // prints 2 — i evaluated at RUN time
	// Output: 2, 1  (LIFO: the closure runs first, then the println(i))
}

// ─── Resource cleanup (the primary use) ───
func readFile(path string) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()  // guaranteed to run on return, early return, OR panic
	// This is why defer exists — you can't forget to close.
	data, err := io.ReadAll(f)
	if err != nil {
		return nil, err  // f.Close() runs here
	}
	return data, nil  // f.Close() runs here
}

// ─── defer in reverse order (nested resources) ───
func nestedResources() error {
	db, _ := sql.Open("postgres", dsn)
	defer db.Close()  // runs LAST (opened first, closed last)

	conn, _ := db.Conn(context.Background())
	defer conn.Close()  // runs FIRST (opened last, closed first)

	rows, _ := conn.QueryContext(context.Background(), "SELECT 1")
	defer rows.Close()  // runs before conn.Close

	// LIFO ensures rows → conn → db (inner to outer)
	return nil
}
```
::

### `defer` in loops — the resource leak

::code-wrapper{language="go"}
```go
// ❌ ANTI-PATTERN: defer in a loop — resources accumulate until function returns
func processFilesBad(paths []string) error {
	for _, p := range paths {
		f, err := os.Open(p)
		if err != nil {
			return err
		}
		defer f.Close()  // ALL files stay open until processFilesBad returns!
		// With 10000 files → "too many open files" (EMFILE)
		if err := process(f); err != nil {
			return err
		}
	}
	return nil
}

// ✅ CORRECT: extract loop body into a function — defer runs per iteration
func processFilesGood(paths []string) error {
	for _, p := range paths {
		if err := processOneFile(p); err != nil {
			return err
		}
	}
	return nil
}

func processOneFile(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()  // runs when processOneFile returns — file closed per iteration
	return process(f)
}
```
::

### `defer` performance — open-coded defer

::code-wrapper{language="go"}
```go
// Go 1.14+ "open-coded defer" optimization:
//   - If a function has ≤8 defers AND none are in loops
//   - The compiler inlines the defer logic (no runtime deferproc call)
//   - Cost drops from ~35ns to ~1-2ns per defer
//
// This means defer is now effectively free for the common case (a few
// resource cleanups in a normal function). Don't avoid defer for perf
// unless profiling shows it's a bottleneck (extremely rare).
//
// defer is still expensive when:
//   - In a loop (accumulates, not open-coded)
//   - In a function with >8 defers
//   - The deferred function is dynamic (defer f where f is a variable)
```
::

## Anonymous Functions and IIFEs

::code-wrapper{language="go"}
```go
// Immediately-invoked function expression (IIFE):
result := func(x int) int {
	return x * 2
}(5)  // 10

// Use case: scoped computation without polluting the outer scope:
func handler(w http.ResponseWriter, r *http.Request) {
	// Parse and validate in an IIFE — keeps temp vars local:
	input, err := func() (string, error) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(string(body)), nil
	}()
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	_ = input
}

// Goroutine launch — the most common IIFE:
go func() {
	defer wg.Done()
	// concurrent work
}()
```
::

## 💡 Tips & Tricks

- **Idiom**: use the functional options pattern (`WithPort(8080)`, `WithTimeout(...)`) for constructors with many optional parameters — it's more readable than a config struct with many nilable fields, and it's extensible (new options don't break existing callers).
- **Idiom**: use named returns + `defer` for error decoration, timing, and panic recovery — this is the legitimate use of named returns. Don't use naked returns in long functions for readability.
- **Performance**: `defer` is nearly free in Go 1.14+ for the open-coded case (≤8 defers, no loops). Don't avoid `defer f.Close()` for performance reasons — the safety is worth the ~1ns.
- **Idiom**: pair every resource acquisition (`os.Open`, `sql.Open`, `os.Create`, `lock.Lock`) with a `defer` of the corresponding release — this is the #1 defer use case. Defers run in LIFO order, matching nested resource lifetimes.
- **Safety**: `defer` runs on panic but NOT on `os.Exit` — never call `os.Exit` inside a function with cleanup defers. Return an error to `main` and call `os.Exit` there.
- **Debug**: `defer` arguments are evaluated at defer time — `defer fmt.Println(i)` captures `i`'s current value. To capture the value at return time, use a closure: `defer func() { fmt.Println(i) }()`.

## ⚠️ Edge Cases & Gotchas

- **`defer` in a loop accumulates**: deferred calls don't run until the function returns — all resources stay open. Extract the loop body into a function.
- **`defer` doesn't run on `os.Exit`**: `os.Exit(n)` terminates immediately, skipping all defers. Return errors to `main` and exit there.
- **`defer` argument evaluation timing**: `defer f(i)` captures `i` at defer time; `defer func() { f(i) }()` captures `i` at run time. The difference matters when the variable changes between defer and return.
- **Naked returns in long functions**: `return` with no values + named returns is opaque in 50+ line functions. Use explicit returns for readability.
- **Closure capture by reference**: closures capture variables by reference, not by value. A loop variable captured by a closure sees the final value (pre-1.22). Pass as argument or shadow (`i := i`).
- **`...` spread requires a slice**: `sum(nums...)` works with `nums` = `[]int`; `sum(5...)` is a compile error. The spread is for variadic calls only.
- **Function types are distinct**: `func(int) int` and `func(int64) int` are different types — no implicit conversion. This matches Go's no-implicit-conversion rule.
- **Multiple returns must be fully received**: `f, err := os.Open(...)` — both values must be used or explicitly discarded (`_`). `f := os.Open(...)` is a compile error.
- **Variadic `nil` spread**: `sum(nil...)` where the slice is `[]int(nil)` — works (zero iterations). But `var s []int; sum(s...)` with a nil slice also works (range over nil slice = zero iterations).
- **`defer` and `recover`**: `recover()` only works inside a deferred function. Calling `recover()` outside defer returns nil even during a panic. This is the only way to catch a panic.

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
func f() (result int) {
	defer func() { result *= 2 }()
	defer func() { result += 10 }()
	return 5
}
```

What does `f()` return?
::
<details>
<summary>Answer</summary>

`f()` returns **20**.

Execution order:
1. `return 5` sets `result = 5`
2. Defers run in LIFO order:
   - First defer (registered second): `result += 10` → `result = 15`
   - Second defer (registered first): `result *= 2` → `result = 30`

Wait — that gives 30. Let me re-check.

Actually:
1. `return 5` → `result = 5`, then defers run:
2. LIFO: the LAST registered defer runs first:
   - `defer func() { result += 10 }()` was registered second, runs first → `result = 15`
   - `defer func() { result *= 2 }()` was registered first, runs second → `result = 30`

`f()` returns **30**.

The key insight: `return 5` doesn't immediately return — it assigns 5 to the named return `result`, then deferred functions run (in LIFO order), and THEN the function returns with the modified `result`.

</details>

## 📚 What's Next

→ [06 — Control Flow](/go/06-control-flow) — `if`/`for`/`switch`/`select`, Go 1.22 loop scoping, labeled breaks, and the absence of `while`.