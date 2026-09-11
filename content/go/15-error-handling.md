---
title: "15 — Error Handling"
description: "Error wrapping chains, errors.Is/As semantics, sentinel vs typed errors, the nil-interface trap on errors, and the panic-vs-error decision."
---

# 15 — Error Handling

Go has no exceptions. Errors are values returned from functions. This makes error handling explicit and visible — every failure point is a visible `if err != nil` check.

## Error Wrapping — The Stack-Trace Pattern

::code-wrapper{language="go"}
```go
// ┌──────────────────────────────────────────────────────────────────────┐
// │ Error chain: each layer wraps with context.                         │
// │                                                                      │
// │   db.Exec(...)        → *pq.Error: connection refused               │
// │   ↳ repo.Save()      → "save user: connection refused"             │
// │   ↳ handler.Create() → "create user: save user: connection refused"│
// │   ↳ main              → logs full chain                              │
// │                                                                      │
// │ fmt.Errorf("context: %w", err) wraps — preserves err for Is/As.     │
// │ fmt.Errorf("context: %v", err) formats — loses err (no Is/As match)│
// └──────────────────────────────────────────────────────────────────────┘

func saveUser(ctx context.Context, db *sql.DB, u *User) error {
	_, err := db.ExecContext(ctx, "INSERT INTO users ...", u.Name, u.Email)
	if err != nil {
		return fmt.Errorf("save user %d: %w", u.ID, err)  // wrap + add context
	}
	return nil
}

func createUser(ctx context.Context, db *sql.DB, u *User) error {
	if err := saveUser(ctx, db, u); err != nil {
		return fmt.Errorf("create user: %w", err)  // wrap again
	}
	return nil
}

// Final error message: "create user: save user 42: connection refused"
// The original *pq.Error is preserved for errors.Is/As at the bottom.
```

## `errors.Is` — Sentinel Error Matching

::code-wrapper{language="go"}
```go
// errors.Is walks the wrap chain and checks if ANY error in the chain
// matches the target (using == or a custom Is() method).

import (
	"errors"
	"io"
	"os"
)

func readFile(path string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	return data, nil
}

func handleFile(path string) {
	_, err := readFile(path)
	if errors.Is(err, os.ErrNotExist) {
		fmt.Println("file not found — creating default")
		// Handle "not found" specifically
	} else if errors.Is(err, io.EOF) {
		fmt.Println("unexpected EOF")
	} else if err != nil {
		log.Fatal(err)  // other errors
	}
}

// ❌ ANTI-PATTERN: using == directly (misses wrapped errors)
// if err == os.ErrNotExist { ... }  // false if err wraps os.ErrNotExist
// ✅ errors.Is walks the chain — works with wrapped errors
```

## `errors.As` — Typed Error Extraction

::code-wrapper{language="go"}
```go
// errors.As walks the chain and, if it finds an error of the target type,
// assigns it to the target and returns true.
// Lets callers extract structured error fields.

func handleDBError(err error) {
	var pqErr *pq.Error
	if errors.As(err, &pqErr) {  // ⚠️ &pqErr — pointer to the target
		switch pqErr.Code {
		case "23505":  // unique_violation
			fmt.Println("duplicate key:", pqErr.Detail)
		case "23503":  // foreign_key_violation
			fmt.Println("foreign key violation:", pqErr.Detail)
		default:
			fmt.Println("postgres error:", pqErr.Code, pqErr.Message)
		}
	}
}

// ─── Custom error type with structured fields ───
type ValidationError struct {
	Field   string
	Message string
	Code    int
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("validation [%s]: %s (code %d)", e.Field, e.Message, e.Code)
}

func validate(u *User) error {
	if u.Email == "" {
		return &ValidationError{Field: "email", Message: "required", Code: 1001}
	}
	if !strings.Contains(u.Email, "@") {
		return &ValidationError{Field: "email", Message: "invalid format", Code: 1002}
	}
	return nil
}

// Caller extracts the structured error:
func createUser(u *User) {
	if err := validate(u); err != nil {
		var ve *ValidationError
		if errors.As(err, &ve) {
			// ve.Field = "email", ve.Code = 1001 — structured error handling
			http.Error(w, fmt.Sprintf(`{"error":"%s","field":"%s"}`, ve.Message, ve.Field), 400)
			return
		}
		// Unknown error type — log and return 500
		log.Printf("unexpected error: %v", err)
		http.Error(w, "internal error", 500)
	}
}
```

## Sentinel Errors — Package-Level Error Values

::code-wrapper{language="go"}
```go
// Sentinel errors are predeclared error values callers match with errors.Is.
// Convention: name them ErrXxx (exported, package-level).

package userstore

import "errors"

var (
	ErrNotFound      = errors.New("user: not found")
	ErrAlreadyExists = errors.New("user: already exists")
	ErrInvalidID     = errors.New("user: invalid id")
)

func GetByID(ctx context.Context, id int64) (*User, error) {
	if id <= 0 {
		return nil, fmt.Errorf("get by id %d: %w", id, ErrInvalidID)
	}
	// ... DB query ...
	if notFound {
		return nil, ErrNotFound  // return the sentinel directly
	}
	return u, nil
}

// Caller:
func handler(ctx context.Context, store *UserStore, id int64) {
	u, err := store.GetByID(ctx, id)
	if errors.Is(err, userstore.ErrNotFound) {
		http.Error(w, "user not found", 404)
		return
	}
	if errors.Is(err, userstore.ErrInvalidID) {
		http.Error(w, "invalid id", 400)
		return
	}
	if err != nil {
		log.Fatal(err)
	}
	_ = u
}
```

## The Nil-Interface Trap on Errors

::code-wrapper{language="go"}
```go
// ❌ ANTI-PATTERN: returning a nil pointer of a concrete error type
type MyError struct{ Code int }
func (e *MyError) Error() string { return fmt.Sprintf("code %d", e.Code) }

func badFunc(fail bool) error {
	if fail {
		var err *MyError = nil  // nil pointer
		return err  // ❌ returns a NON-NIL error interface wrapping a nil pointer!
	}
	return nil
}

func caller() {
	err := badFunc(true)
	fmt.Println(err == nil)  // false! — the trap
	// err.Error() would panic (nil pointer dereference)
}

// ✅ CORRECT: return nil directly for a nil error
func goodFunc(fail bool) error {
	if fail {
		return &MyError{Code: 42}  // return a real error, not a nil pointer
	}
	return nil  // return nil directly — true nil interface
}

// This is the #1 error-handling bug in Go. The rule:
//   If you return an error interface, return nil directly (not a nil pointer
//   of a concrete error type). A nil pointer wrapped in an error interface
//   is non-nil — the caller's err != nil check passes, but calling err.Error()
//   panics.
```

## `panic` and `recover` — When and How

::code-wrapper{language="go"}
```go
// panic is for UNRECOVERABLE conditions — bugs, invariant violations.
// NOT for normal error handling. Return an error for expected failures.

// ─── Legitimate panic: "must" functions (programmer error) ───
func MustParseTemplate(src string) *template.Template {
	t, err := template.New("").Parse(src)
	if err != nil {
		panic(fmt.Sprintf("template parse error (programmer bug): %v", err))
	}
	return t
}
// "Must" prefix convention: the input is a compile-time constant; if it
// fails, it's a programmer mistake that should be caught during development.

// ─── recover — catching panics (rare, mainly in middleware) ───
func safeHandler(fn func()) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("panic recovered: %v", r)
			// Log the stack trace for debugging:
			log.Printf("panic: %v\n%s", r, debug.Stack())
		}
	}()
	fn()
	return nil
}

// ─── recover in goroutines (prevent program crash) ───
func safeGo(fn func()) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("goroutine panic: %v\n%s", r, debug.Stack())
			}
		}()
		fn()
	}()
}

// ⚠️ An unrecovered panic in a goroutine CRASHES THE ENTIRE PROGRAM.
// Always recover in goroutines that handle external input (HTTP handlers,
// message consumers) — a single bad request shouldn't take down the server.
```

## Production Pattern — Error Categorization

::code-wrapper{language="go"}
```go
// Categorize errors for HTTP status mapping:
func httpStatusFor(err error) int {
	// Check custom error types first (most specific):
	var ve *ValidationError
	if errors.As(err, &ve) {
		return http.StatusBadRequest  // 400
	}

	// Then sentinels:
	switch {
	case errors.Is(err, ErrNotFound):
		return http.StatusNotFound  // 404
	case errors.Is(err, ErrAlreadyExists):
		return http.StatusConflict  // 409
	case errors.Is(err, ErrInvalidID):
		return http.StatusBadRequest  // 400
	case errors.Is(err, context.DeadlineExceeded):
		return http.StatusGatewayTimeout  // 504
	case errors.Is(err, context.Canceled):
		return 499  // client closed request (nginx convention)
	}

	// Check for specific DB errors:
	var pqErr *pq.Error
	if errors.As(err, &pqErr) {
		switch pqErr.Code {
		case "23505":  // unique_violation
			return http.StatusConflict  // 409
		case "23503":  // foreign_key_violation
			return http.StatusBadRequest  // 400
		}
	}

	// Fallback: internal error
	return http.StatusInternalServerError  // 500
}
```

## `errors.Join` (Go 1.20+)

::code-wrapper{language="go"}
```go
// errors.Join combines multiple errors into one.
// errors.Is/As walk all joined errors.

func validateAll(u *User) error {
	var errs []error
	if u.Name == "" {
		errs = append(errs, &ValidationError{Field: "name", Message: "required"})
	}
	if u.Email == "" {
		errs = append(errs, &ValidationError{Field: "email", Message: "required"})
	}
	if u.Age < 0 {
		errs = append(errs, &ValidationError{Field: "age", Message: "must be non-negative"})
	}
	return errors.Join(errs...)  // nil if no errors, combined if any
}

// Joined error's Error() prints all sub-errors:
// "validation [name]: required\nvalidation [email]: required"

// errors.Is checks all joined errors:
// errors.Is(joinedErr, someErr) — true if any joined error matches
```

## 💡 Tips & Tricks

- **Idiom**: wrap errors with context at each layer — `fmt.Errorf("doing X: %w", err)` — so the final error reads like a stack trace. The context should describe what the caller was doing, not the low-level failure.
- **Idiom**: use `errors.Is` for sentinel errors — it walks the wrap chain. `err == ErrNotFound` misses wrapped errors. Always use `errors.Is`.
- **Idiom**: use `errors.As` to extract typed errors with fields — `var perr *PathError; if errors.As(err, &perr) { ... perr.Path }`. Pass `&perr` (pointer to the target), not `perr`.
- **Idiom**: use `%w` (not `%v`) in `fmt.Errorf` to wrap — `%w` preserves the original for `Is`/`As`; `%v` formats into the message and loses the chain. Use `%v` only when you deliberately want to hide the original.
- **Idiom**: reserve `panic` for genuine bugs — violated invariants, "this should never happen." Normal failures return `error`. The `MustX` convention panics for programmer mistakes (bad compile-time constants).
- **Safety**: always `recover` in goroutines that handle external input — a single bad request causing a panic shouldn't crash the server. Log the panic + stack trace for debugging.

## ⚠️ Edge Cases & Gotchas

- **`%w` vs `%v`**: `%w` wraps (preserves for `Is`/`As`); `%v` formats (loses chain). Use `%w` almost always.
- **Sentinel comparison with `==` misses wraps**: `err == ErrNotFound` is false if `err` wraps `ErrNotFound`. Use `errors.Is`.
- **`errors.As` target must be `&target`**: `var e *MyError; errors.As(err, &e)` — pass `&e` (`**MyError`), not `e` (`*MyError`).
- **Returning nil pointer as error = non-nil interface**: `var p *MyError = nil; return p` — the returned `error` is non-nil (has type `*MyError`). Return `nil` directly.
- **`panic` in a goroutine crashes the program**: unrecovered panics terminate the whole process. Always `recover` in goroutines that handle external input.
- **`recover` only works in the deferred function of the panicking goroutine**: you can't recover from another goroutine's panic. Each goroutine needs its own `recover`.
- **`log.Fatal` calls `os.Exit`**: skips deferred functions. Don't use it in library code or anywhere with cleanup `defer`s. Use only in `main` for fatal startup errors.
- **`errors.Join(nil, nil)` returns nil**: joining nil errors returns nil. Joining non-nil errors returns a non-nil combined error.
- **Multiple `%w` in `fmt.Errorf`** (Go 1.20+): `fmt.Errorf("%w and %w", err1, err2)` wraps both — `errors.Is` checks both. Rare but supported.
- **Ignoring an error is a bug**: `_ = f()` hides failures. `errcheck` linter flags these. At minimum, log the error.

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
var ErrNotFound = errors.New("not found")

func getUser(id int) (*User, error) {
	if id == 0 {
		return nil, fmt.Errorf("getUser %d: %w", id, ErrNotFound)
	}
	return &User{}, nil
}

func main() {
	_, err := getUser(0)
	fmt.Println(errors.Is(err, ErrNotFound))
	fmt.Println(err == ErrNotFound)
}
```

What's printed?
::
<details>
<summary>Answer</summary>

```
true
false
```

- `errors.Is(err, ErrNotFound)` → `true` — `errors.Is` walks the wrap chain and finds `ErrNotFound` inside the `fmt.Errorf`-wrapped error.
- `err == ErrNotFound` → `false` — `err` is `"getUser 0: not found"` (a wrapped error), not `ErrNotFound` itself. Direct `==` only matches the top-level error, not wrapped ones.

This is why you must use `errors.Is` instead of `==` for sentinel comparison — `==` misses wrapped errors, and all errors in production code should be wrapped (to add context).

</details>

## 📚 What's Next

→ [16 — Goroutines](/go/16-goroutines) — goroutine scheduling, GOMAXPROCS, leak prevention, and the preemptive scheduler.