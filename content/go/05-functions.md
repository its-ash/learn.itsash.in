# 05 — Functions

Go functions are first-class values, support multiple returns, and have a distinctive error-handling convention.

## Declaration and Calls

::code-wrapper{language="go"}
```go
func add(a, b int) int {
	return a + b
}

func divmod(a, b int) (int, int) {
	return a / b, a % b
}

q, r := divmod(17, 5)   // 3, 2
``
::

Parameters of the same type can share the type (`a, b int`). Multiple return values are a core feature — the right side of an assignment must match the number of returns.

## Named Return Values

::code-wrapper{language="go"}
```go
func divmod(a, b int) (q, r int) {
	q = a / b
	r = a % b
	return        // "naked return" — returns q, r
}
```
::

Named returns are pre-declared and initialized to zero; a "naked" `return` returns them. Useful for readability in long functions, but can obscure what's returned — use sparingly. Their main real-world use: modifying return values in `defer` (see below).

## Variadic Functions

::code-wrapper{language="go"}
```go
func sum(nums ...int) int {
	total := 0
	for _, n := range nums {
		total += n
	}
	return total
}

sum(1, 2, 3)        // 6
nums := []int{1, 2, 3}
sum(nums...)        // 6 — spread a slice
```
::

`...T` makes the final parameter a slice of `T`. `slice...` spreads a slice into a variadic call.

## Closures

Functions are values — they capture their environment:

::code-wrapper{language="go"}
```go
func counter() func() int {
	n := 0
	return func() int {
		n++
		return n
	}
}

c := counter()
c()   // 1
c()   // 2
``
::

Closures capture variables **by reference** — `n` is shared across calls to the returned function. This is how stateful functions (counters, accumulators) are built.

## Functions as Values and Parameters

::code-wrapper{language="go"}
```go
var f func(int) int = func(x int) int { return x * 2 }

// Higher-order function
func apply(nums []int, fn func(int) int) []int {
	result := make([]int, len(nums))
	for i, n := range nums {
		result[i] = fn(n)
	}
	return result
}

apply([]int{1, 2, 3}, func(x int) int { return x * x })   // [1 4 9]
```
::

Function types are spelled `func(params) returns`. Functions can be assigned, passed, and returned.

## `defer`

`defer` schedules a function call to run when the enclosing function returns — LIFO (last deferred runs first):

::code-wrapper{language="go"}
```go
func readFile(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()   // runs when readFile returns

	data := make([]byte, 1024)
	_, err = f.Read(data)
	return err   // f.Close() runs here
}
``
::

Use `defer` for cleanup (closing files, releasing locks, responding to HTTP requests) — it guarantees the cleanup runs regardless of how the function exits (return, panic, early return).

### `defer` evaluates arguments immediately

::code-wrapper{language="go"}
```go
i := 1
defer fmt.Println(i)   // prints 1 — i is evaluated now, not at defer time
i = 2
// function returns, defer runs, prints 1
```
::

To capture the *current* value at defer time, use a closure:
```go
defer func() { fmt.Println(i) }()   // prints 2 — i is read at defer-run time
```

### `defer` and named returns

A `defer`d function can modify named return values:

::code-wrapper{language="go"}
```go
func example() (result int) {
	defer func() {
		result *= 2   // modifies the named return
	}()
	result = 5
	return            // returns 10 (defer ran, doubled it)
}
``
::

This is the main legitimate use of named returns — wrapping/transforming the return value in a `defer` (e.g., logging, error decoration).

## `init` Functions (recap)

`init()` runs automatically at package load. Covered in chapter 02 — avoid for general setup; reserve for unavoidable side effects.

## Anonymous Functions and IIFEs

::code-wrapper{language="go"}
```go
// Immediately-invoked function expression
result := func(x int) int {
	return x * 2
}(5)   // 10
``
::

Go has no `async`/`await` — goroutines (chapter 16) are the concurrency primitive.

## 💡 Tips & Tricks

- **Idiom**: use `defer f.Close()` immediately after opening a resource — it guarantees cleanup regardless of how the function exits (return, early return, panic). Pair every `os.Open`/`sql.Open`/`os.Create` with a `defer` of the corresponding `Close`.
- **Idiom**: use named return values when you need to modify them in a `defer` (e.g., error wrapping, timing) — this is the legitimate use case. For simple functions, unnamed returns + explicit `return x, y` are clearer than naked returns.
- **Idiom**: use multiple return values for `(result, error)` — it's the Go convention. Functions that can fail return `(T, error)`; callers check `if err != nil` before using `T`. Don't return only `error` and a pointer out-param; the `(T, error)` form is idiomatic.
- **Idiom**: use `defer` for cleanup in **reverse order** of acquisition — open file A, open file B, `defer b.Close()`, `defer a.Close()`. LIFO ensures B (opened last) is closed first, matching resource lifetimes.
- **Debug**: `defer` arguments are evaluated at defer time, not at execution time — `defer fmt.Println(i)` prints the value of `i` when `defer` was called, not when it runs. To capture the later value, use a closure: `defer func() { fmt.Println(i) }()`.

## ⚠️ Edge Cases & Gotchas

- **`defer` in a loop**: `for ... { defer f.Close() }` accumulates deferred calls until the function returns — resources pile up. Close inside the loop, or refactor the loop body into a function.
- **`defer` and loops + closures (1.22 fix)**: pre-1.22, `for i := 0; ... { defer func() { fmt.Println(i) }() }` printed the *final* value of `i` for all iterations (loop variable captured by reference). Go 1.22+ makes each iteration's loop variable distinct, fixing this. On older Go, pass `i` as an argument: `defer func(i int) { ... }(i)`.
- **Naked returns in long functions**: `return` (no values) in a 100-line function with named returns is opaque — readers must scan for where the named returns were set. Use naked returns only in short functions.
- **`defer` has a small overhead**: each `defer` has a tiny cost (function call + stack bookkeeping). In hot paths (millions of iterations), it can matter — Go 1.14+ optimized the common case (open-coded defer) to near-zero, but `defer` in a loop still adds up.
- **Multiple returns must be fully received or discarded**: `f, err := os.Open(...)` — you must use both (or `_`). You can't receive only one of a multi-return: `f := os.Open(...)` is an error. Use `f, _ := ...` to discard explicitly.
- **`...` spread requires a slice, not a single value**: `sum(nums...)` where `nums` is `[]int` works; `sum(5...)` doesn't. The `...` is the spread operator for variadic calls.
- **Function types are distinct**: `func(int) int` and `func(int64) int` are different types — you can't assign one to the other. This matches Go's no-implicit-conversion rule.
- **Closures capture by reference**: `for i := 0; i < 3; i++ { go func() { fmt.Println(i) }() }` (pre-1.22) prints "3 3 3" — all goroutines see the final `i`. Pass `i` as an argument: `go func(i int) { ... }(i)`.
- **`defer` doesn't run on `os.Exit`**: `os.Exit(n)` terminates immediately without running deferred functions. Don't call `os.Exit` inside a function with cleanup `defer`s — return an error and let `main` exit.

## 🧠 Spot the Bug

A developer opens files in a loop to process them, but runs out of file descriptors:

::code-wrapper{language="go"}
```go
func processFiles(paths []string) error {
	for _, p := range paths {
		f, err := os.Open(p)
		if err != nil {
			return err
		}
		defer f.Close()   // ❌ deferred until processFiles returns
		// process f...
	}
	return nil
}
```
::

What's wrong?

<details>
<summary>Answer</summary>

`defer f.Close()` doesn't run until `processFiles` returns — so all files stay open for the duration of the loop. With many files, you exhaust file descriptors (`EMFILE: too many open files`).

`defer` is function-scoped, not block-scoped. In a loop, deferred calls accumulate; they only run when the enclosing *function* returns, not at the end of each iteration.

The fix — extract the loop body into a function so each `defer` runs per iteration:

```go
func processFiles(paths []string) error {
	for _, p := range paths {
		if err := processFile(p); err != nil {
			return err
		}
	}
	return nil
}

func processFile(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()   // runs when processFile returns — per file
	// process f...
	return nil
}
```

Now each file is closed when `processFile` returns, before the next iteration opens another. This is the idiomatic pattern for resource cleanup in loops: extract a function, `defer` inside it.

**The lesson**: `defer` is function-scoped. In a loop, deferred calls pile up until the function returns. Extract the loop body into a function so each `defer` runs per iteration.

</details>

## Summary

You can now write functions with multiple/named returns, variadic parameters, and closures; use `defer` for cleanup (with its argument-evaluation and named-return interactions); pass functions as values; and avoid the `defer`-in-a-loop and closure-capture traps. Next: control flow.