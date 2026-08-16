# 15 — Error Handling

Go has no exceptions. Errors are **values** — returned from functions, checked by callers. This is deliberate: explicit error handling makes control flow visible and avoids the hidden jumps of try/catch.

## The `error` Interface

::code-wrapper{language="go"}
```go
type error interface {
	Error() string
}
``
::

Any type with an `Error() string` method is an error. The standard `errors` package and `fmt.Errorf` create errors.

## Returning Errors

::code-wrapper{language="go"}
```go
func divide(a, b int) (int, error) {
	if b == 0 {
		return 0, errors.New("division by zero")
	}
	return a / b, nil
}

q, err := divide(10, 0)
if err != nil {
	log.Fatal(err)   // or handle gracefully
}
fmt.Println(q)
``
::

The convention: functions that can fail return `(result, error)`. The caller checks `err != nil` before using `result`. **Always check the error** — ignoring it is a bug.

## Creating Errors

::code-wrapper{language="go"}
```go
errors.New("division by zero")                    // simple message
fmt.Errorf("divide %d by %d: %w", a, b, err)      // formatted, wrapping %w
fmt.Errorf("divide %d by %d: %v", a, b, err)      // formatted, %v (no wrapping)
``
::

- `errors.New` — a simple error with a message.
- `fmt.Errorf` with `%w` — wraps an existing error (preserving it for `errors.Is`/`As`).
- `fmt.Errorf` with `%v` — formats the error into the message but doesn't wrap (the original error is lost for unwrapping).

## Error Wrapping (Go 1.13+)

Wrapping adds context while preserving the original error for inspection:

::code-wrapper{language="go"}
```go
func readConfig(path string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}
	return data, nil
}

data, err := readConfig("config.yaml")
if err != nil {
	// err is "read config config.yaml: open config.yaml: no such file or directory"
	// and the original *fs.PathError is preserved for errors.Is/As
}
``
::

The convention: wrap with context at each layer, so the final error reads like a stack trace: `read config: open config.yaml: no such file or directory`.

## `errors.Is` — Sentinel Error Matching

::code-wrapper{language="go"}
```go
if errors.Is(err, os.ErrNotExist) {
	// err is or wraps os.ErrNotExist
}
``
::

`errors.Is` walks the wrap chain and checks if any error in the chain matches the target (using `==` or an `Is()` method). Use it for **sentinel errors** (predeclared error values):

::code-wrapper{language="go"}
```go
var ErrNotFound = errors.New("not found")

func getUser(id int) (*User, error) {
	// ...
	return nil, ErrNotFound
}

u, err := getUser(42)
if errors.Is(err, ErrNotFound) {
	// handle "not found" specifically
} else if err != nil {
	// handle other errors
}
``
::

## `errors.As` — Typed Error Extraction

::code-wrapper{language="go"}
```go
var pathErr *fs.PathError
if errors.As(err, &pathErr) {
	fmt.Println("path error:", pathErr.Path)   // access typed fields
}
``
::

`errors.As` walks the wrap chain and, if it finds an error of the target type, assigns it to the target and returns true. Use it to extract typed errors (with fields) for specific handling.

## Custom Error Types

::code-wrapper{language="go"}
```go
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("validation error: %s: %s", e.Field, e.Message)
}

func validate(u User) error {
	if u.Email == "" {
		return &ValidationError{Field: "email", Message: "required"}
	}
	return nil
}

err := validate(u)
var ve *ValidationError
if errors.As(err, &ve) {
	fmt.Println(ve.Field)   // "email"
}
``
::

Custom error types carry structured information (fields) for callers who need it. Use them when plain messages aren't enough.

## `panic` and `recover`

`panic` is for **unrecoverable** conditions (bugs, invariant violations), not normal error handling:

::code-wrapper{language="go"}
```go
func mustCompile(pattern string) *regexp.Regexp {
	re, err := regexp.Compile(pattern)
	if err != nil {
		panic(err)   // "must" prefix means "panic on error"
	}
	return re
}
``
::

`recover` in a `defer` catches a panic (rarely used outside libraries):

::code-wrapper{language="go"}
```go
func safe() {
	defer func() {
		if r := recover(); r != nil {
			fmt.Println("recovered:", r)
		}
	}()
	panic("boom")
}
``
::

**Don't use panic for normal errors** — return an `error`. Reserve `panic` for "this should never happen" (a violated invariant, a nil dereference that's a bug). The `mustX` convention (e.g., `regexp.MustCompile`, `template.Must`) panics on error for package-level init where the error is a programmer mistake.

## The `if err != nil` Repetition

Go's error handling is verbose — `if err != nil { return err }` appears everywhere. This is deliberate:
- It makes error handling **visible** — you can see every point where an error is checked.
- It forces you to **decide** at each point (handle, wrap, return, or ignore).
- It avoids the hidden control flow of exceptions (which jump over code).

Embrace the verbosity — it's a feature, not a bug. Linters (`errcheck`, `golangci-lint`) flag ignored errors.

## 💡 Tips & Tricks

- **Idiom**: always wrap errors with context at each layer — `fmt.Errorf("doing X: %w", err)` — so the final error reads like a stack trace (`read config: open config.yaml: no such file or directory`). The context should describe what the caller was trying to do, not the low-level failure.
- **Idiom**: use `errors.Is` for sentinel errors (`io.EOF`, `sql.ErrNoRows`, your own `ErrNotFound`) — it walks the wrap chain, so a wrapped sentinel is still detected. Don't use `==` directly (it misses wrapped errors).
- **Idiom**: use `errors.As` to extract typed errors with fields — `var perr *fs.PathError; if errors.As(err, &perr) { ... perr.Path ... }`. This lets callers handle specific error types with structured information, not just messages.
- **Idiom**: use `%w` (not `%v`) in `fmt.Errorf` to wrap — `%w` preserves the original error for `errors.Is`/`As`; `%v` formats it into the message but loses the wrap chain. Use `%v` only when you deliberately want to hide the original (rare).
- **Idiom**: reserve `panic` for genuine bugs (violated invariants, "this should never happen") — not for normal error handling. The `MustX` convention (`regexp.MustCompile`, `template.Must`) panics on error for package-level init where failure is a programmer mistake, not a runtime condition.

## ⚠️ Edge Cases & Gotchas

- **`%w` vs `%v` in `fmt.Errorf`**: `%w` wraps (preserves for `errors.Is`/`As`); `%v` formats into the message (original lost). Use `%w` almost always.
- **Multiple `%w` in one `fmt.Errorf`** (Go 1.20+): `fmt.Errorf("%w %w", err1, err2)` wraps both — `errors.Is` checks both. Rare but supported.
- **Sentinel error comparison with `==` misses wraps**: `err == ErrNotFound` is false if `err` wraps `ErrNotFound`. Use `errors.Is(err, ErrNotFound)`.
- **`errors.As` target must be a pointer to a pointer/non-pointer**: `var perr *PathError; errors.As(err, &perr)` — the target is `**PathError`. Passing `&perr` where `perr` is `*PathError` is correct; passing `perr` directly is wrong.
- **Returning `nil` as an interface wraps a nil concrete (the nil-interface trap)**: `func f() error { var p *MyError = nil; return p }` — the returned `error` is non-nil (it has type `*MyError`), and `err != nil` is true. Return `nil` directly.
- **`panic` in a goroutine crashes the program**: a panic in a goroutine that isn't recovered terminates the whole program (not just the goroutine). Always `recover` in goroutines that might panic, or ensure panics can't happen.
- **`recover` only works in the deferred function of the panicking goroutine**: you can't recover from another goroutine's panic. Each goroutine must have its own `recover`.
- **Ignoring an error is a bug**: `_ = f()` or `f()` (discarding the error) hides failures. `errcheck` flags these. At minimum, log the error.
- **`log.Fatal` calls `os.Exit`**: it doesn't run deferred functions and exits immediately. Don't use it in library code or anywhere with cleanup `defer`s. Use it only in `main` for "truly fatal" startup errors.

## 🧠 Spot the Bug

A function returns a custom error, but the caller's `errors.As` check fails:

::code-wrapper{language="go"}
```go
type MyError struct{ Code int }
func (e *MyError) Error() string { return fmt.Sprintf("code %d", e.Code) }

func f() error {
	return &MyError{Code: 42}
}

func main() {
	err := f()
	var e *MyError
	if errors.As(err, e) {   // ❌ wrong — should be &e
		fmt.Println(e.Code)
	}
}
``
::

What's wrong?

<details>
<summary>Answer</summary>

`errors.As(err, target)` expects `target` to be a **pointer to the target type's pointer** — i.e., `**MyError`. `var e *MyError; errors.As(err, e)` passes `e` (a `*MyError`, nil), not `&e` (a `**MyError`). The signature is `errors.As(err error, target any) bool`, and `target` must be a non-nil pointer to either a type implementing error or to any interface type. Passing `e` (a nil `*MyError`) doesn't give `errors.As` a place to write the result.

The fix — pass `&e`:

```go
err := f()
var e *MyError
if errors.As(err, &e) {   // ✅ &e is **MyError
	fmt.Println(e.Code)   // 42
}
```

`errors.As` walks the error chain, finds the `*MyError`, and assigns it to `e` (via the `**MyError` pointer `&e`). Without `&`, `errors.As` has no address to write to and either panics or returns false (depending on the Go version — modern Go panics with "errors.As target must be a non-nil pointer").

**The lesson**: `errors.As(err, &target)` — always pass the address of the target variable, not the variable itself. `target` must be a pointer to the error type you want to extract.

</details>

## Summary

You can now return errors, wrap them with `fmt.Errorf("...: %w", err)`, match sentinels with `errors.Is`, extract typed errors with `errors.As`, define custom error types, and use `panic`/`recover` only for genuine bugs. You understand why Go's verbose error handling is a feature and the nil-interface-error trap. Next: goroutines — Go's concurrency primitive.