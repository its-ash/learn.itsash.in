---
title: "25 — Testing & Benchmarking"
description: "Table-driven tests, subtests with t.Parallel, benchmark allocation analysis, fuzzing, httptest, coverage gating, and testify assertions."
---

# 25 — Testing & Benchmarking

## Table-Driven Tests — The Production Pattern

::code-wrapper{language="go"}
```go
package user

import "testing"

func TestValidate(t *testing.T) {
	tests := []struct {
		name    string
		input   User
		wantErr string  // empty = no error expected
	}{
		{"valid user", User{Email: "a@b.com", Age: 25}, ""},
		{"empty email", User{Age: 25}, "email required"},
		{"invalid email", User{Email: "no-at-sign", Age: 25}, "email invalid"},
		{"negative age", User{Email: "a@b.com", Age: -1}, "age must be non-negative"},
		{"zero age (valid)", User{Email: "a@b.com", Age: 0}, ""},  // 0 is valid
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()  // ✅ parallel subtests — faster

			err := Validate(tt.input)
			if tt.wantErr == "" {
				if err != nil {
					t.Errorf("Validate(%+v) = %v, want nil", tt.input, err)
				}
			} else {
				if err == nil {
					t.Errorf("Validate(%+v) = nil, want error containing %q", tt.input, tt.wantErr)
				} else if !strings.Contains(err.Error(), tt.wantErr) {
					t.Errorf("Validate(%+v) = %q, want error containing %q", tt.input, err.Error(), tt.wantErr)
				}
			}
		})
	}
}

// ┌──────────────────────────────────────────────────────────────────────┐
// │ Table-driven test rules:                                            │
// │   1. Each case has a name (shown in `go test -v` output)             │
// │   2. Use t.Run for subtests — enables t.Parallel and filtering       │
// │   3. Include edge cases (zero, negative, empty, boundary values)     │
// │   4. Test the error MESSAGE, not just "error != nil"                 │
// └──────────────────────────────────────────────────────────────────────┘
```

## Benchmarking — Allocation Analysis

::code-wrapper{language="go"}
```go
package user

import "testing"

func BenchmarkValidate(b *testing.B) {
	// b.N is adjusted by the framework until the run takes ~1 second.
	// The loop body must be the operation under test — no setup inside.

	user := User{Email: "test@example.com", Age: 30}

	b.ReportAllocs()  // ✅ show allocs/op — the key metric
	b.ResetTimer()    // ✅ exclude setup from the benchmark

	for i := 0; i < b.N; i++ {
		_ = Validate(user)  // discard result — don't let the compiler optimize it away
	}
}

// Run:
//   go test -bench=BenchmarkValidate -benchmem -count=5
//
// Output:
//   BenchmarkValidate-8   10000000   112 ns/op   0 B/op   0 allocs/op
//
// Key metrics:
//   ns/op    — nanoseconds per operation (lower = faster)
//   B/op     — bytes allocated per operation (lower = less GC pressure)
//   allocs/op — heap allocations per operation (lower = less GC pressure)
//
// ⚠️ allocs/op is the most important — heap allocations trigger GC.
//   Reducing allocs often improves performance more than micro-optimizing.
```

### Benchmark Comparison — `benchstat`

::code-wrapper{language="bash"}
```bash
# Compare two implementations statistically (eliminates noise):
# 1. Benchmark the old version:
git stash
go test -bench=BenchmarkValidate -benchmem -count=10 > old.txt

# 2. Benchmark the new version:
git stash pop
go test -bench=BenchmarkValidate -benchmem -count=10 > new.txt

# 3. Compare:
benchstat old.txt new.txt
# goos: darwin
# goarch: arm64
#                      │   old.txt   │               new.txt               │
#                      │   sec/op    │  sec/op     vs base                │
# Validate-8             112.2n ± 1%   85.4n ± 2%  -23.89% (p=0.000 n=10)
#
# The p-value < 0.05 means the difference is statistically significant.
# "vs base -23.89%" means the new version is 23.89% faster.
```

## Fuzzing — Go 1.18+

::code-wrapper{language="go"}
```go
package parser

import "testing"

// Fuzz target — the engine generates random inputs to find panics.
func FuzzParse(f *testing.F) {
	// Seed corpus — initial examples for the fuzzer to mutate:
	f.Add("hello")
	f.Add("")
	f.Add("123")
	f.Add("hello world 123")

	f.Fuzz(func(t *testing.T, input string) {
		// The function should not panic on any input:
		result, err := Parse(input)
		if err != nil {
			return  // errors are fine — we're looking for panics
		}

		// Invariant: Parse(result) should give back something valid:
		if result != "" && result != input {
			t.Errorf("Parse(%q) = %q, round-trip mismatch", input, result)
		}
	})
}

// Run:
//   go test -fuzz=FuzzParse -fuzztime=1m
//   go test -fuzz=FuzzParse -fuzztime=30m  # longer for more coverage
//
// Fuzz findings are saved to testdata/fuzz/FuzzParse/<hash> — these
// become regression tests automatically (run by `go test`).
```

## `httptest` — Testing HTTP Handlers

::code-wrapper{language="go"}
```go
package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetUser(t *testing.T) {
	// Create a mock store (interface-based — see chapter 12):
	store := &MockUserStore{users: map[int64]*User{1: {ID: 1, Name: "Alice"}}}
	handler := NewUserHandler(store)

	// Build a request:
	req := httptest.NewRequest("GET", "/users/1", nil)
	req = req.WithContext(context.Background())

	// Record the response (no real HTTP server):
	rr := httptest.NewRecorder()

	// Call the handler:
	handler.GetUser(rr, req)

	// Assert:
	if rr.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	// Check the body:
	body := strings.TrimSpace(rr.Body.String())
	if !strings.Contains(body, `"name":"Alice"`) {
		t.Errorf("body = %q, want name Alice", body)
	}

	// Check headers:
	if ct := rr.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
}

// ─── Testing a full HTTP server ───
func TestServerIntegration(t *testing.T) {
	srv := httptest.NewServer(NewHandler())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/users/1")
	if err != nil { t.Fatal(err) }
	defer resp.Body.Close()
	// assert on resp
}
```

## Coverage — Gating CI

::code-wrapper{language="bash"}
```bash
# Generate coverage profile:
go test -coverprofile=coverage.out ./...

# Summary (per function):
go tool cover -func=coverage.out

# HTML report:
go tool cover -html=coverage.out -o coverage.html

# ✅ CI gate — fail if any function has < 80% coverage:
go test -coverprofile=c.out ./...
go tool cover -func=c.out | grep -v 100.0% | grep -v "total:" && exit 1

# ✅ Better — fail if total coverage < threshold:
TOTAL=$(go tool cover -func=c.out | grep total | awk '{print $3}' | tr -d '%')
if (( $(echo "$TOTAL < 80" | bc -l) )); then
  echo "Coverage $TOTAL% < 80%"
  exit 1
fi
```

## Test Helpers — `t.Helper`

::code-wrapper{language="go"}
```go
// t.Helper() marks a function as a test helper — its line is excluded
// from error output, pointing to the CALLER's line instead.

func assertUserEqual(t *testing.T, got, want *User) {
	t.Helper()  // ✅ errors point to the caller, not this helper
	if got.ID != want.ID {
		t.Errorf("ID = %d, want %d", got.ID, want.ID)
	}
	if got.Name != want.Name {
		t.Errorf("Name = %q, want %q", got.Name, want.Name)
	}
}

func TestGetUser(t *testing.T) {
	got := getUser(1)
	want := &User{ID: 1, Name: "Alice"}
	assertUserEqual(t, got, want)  // error points HERE, not to assertUserEqual
}
```

## `testify` — Assertions Library (Optional)

::code-wrapper{language="go"}
```go
// import "github.com/stretchr/testify/assert"
// import "github.com/stretchr/testify/require"

func TestWithTestify(t *testing.T) {
	// assert — reports failure, continues:
	assert.Equal(t, 5, Add(2, 3))
	assert.NoError(t, err)
	assert.NotNil(t, user)
	assert.Contains(t, "hello world", "world")

	// require — reports failure, STOPS the test (for fatal setup):
	require.NoError(t, err, "database connection failed")
	// If err != nil, test stops here — don't continue with nil db
	user := getUser(1)
	assert.Equal(t, "Alice", user.Name)
}

// testify is popular but optional — stdlib `t.Errorf` is fine.
// Use testify for readability in large test suites.
```

## 💡 Tips & Tricks

- **Idiom**: table-driven tests with `t.Run` and `t.Parallel` — each case is a subtest (filterable with `-run`), runs concurrently (faster). Include edge cases: zero, negative, empty, boundary values.
- **Idiom**: `b.ReportAllocs()` + `b.ResetTimer()` in benchmarks — allocs/op is the key metric (heap allocations → GC pressure). ResetTimer excludes setup from timing.
- **Idiom**: use `benchstat` to compare benchmark results statistically — run `-count=10` for both versions, benchstat gives a p-value. Differences < 5% are noise.
- **Idiom**: fuzz targets find panics the test suite misses — `f.Add(seed)` for initial cases, `f.Fuzz` for the test. Findings auto-save as regression tests.
- **Idiom**: `t.Helper()` in test helpers — error line numbers point to the caller, not the helper. Makes debugging easier.
- **Idiom**: `httptest.NewRequest` + `httptest.NewRecorder` for testing HTTP handlers without a real server — fast, no port allocation, no network. For full integration, `httptest.NewServer`.

## ⚠️ Edge Cases & Gotchas

- **`go test` caches results**: if nothing changed, `go test` prints "ok (cached)" and doesn't re-run. Use `-count=1` to force re-run (essential for flaky tests).
- **`b.N` is framework-controlled**: don't set it yourself — the framework adjusts it. Just use `for i := 0; i < b.N; i++`.
- **Compiler optimizes away the result**: `_ = Validate(user)` — if the compiler sees the result is unused, it may skip the call. Use a package-level `var sink int` and `sink = result` to prevent optimization.
- **`t.Parallel()` inside subtests**: call it first inside `t.Run`. Pre-1.22, capture the loop variable (`tt := tt`) before the parallel subtest.
- **`httptest.NewRecorder` doesn't support real HTTP**: it records what the handler writes — no real connection, no client disconnect. For real HTTP, use `httptest.NewServer`.
- **Coverage doesn't test all paths**: 100% coverage means every line was executed, not that every branch was tested. Use fuzzing and property tests for deeper coverage.
- **`testify/require` stops the test**: use `require` for setup (if DB connection fails, stop). Use `assert` for checks (if one assertion fails, continue checking others).
- **Fuzz findings saved to `testdata/`**: the `testdata/` directory is excluded from `go build` but included in `go test`. Don't put test-only code anywhere else.

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
func BenchmarkBad(b *testing.B) {
	user := User{Email: "test@example.com"}
	for i := 0; i < b.N; i++ {
		Validate(user)  // result discarded
	}
}
```

What's wrong with this benchmark?
::
<details>
<summary>Answer</summary>

The compiler may optimize away the `Validate(user)` call because the result is discarded (unused). The benchmark may show 0 ns/op — the function was never called.

The fix — use a package-level sink to prevent the compiler from eliminating the call:

```go
var sink error  // package-level

func BenchmarkGood(b *testing.B) {
	b.ReportAllocs()
	b.ResetTimer()
	user := User{Email: "test@example.com"}
	var err error
	for i := 0; i < b.N; i++ {
		err = Validate(user)  // assign to a variable
	}
	sink = err  // prevent compiler from optimizing away the loop
}
```

`b.ReportAllocs()` and `b.ResetTimer()` are also missing — without them, you don't see allocation counts, and setup time is included in the benchmark.

</details>

## 📚 What's Next

→ [26 — Concurrency Patterns](/go/26-concurrency-patterns) — worker pool, pipeline, fan-out/fan-in, generator, and graceful shutdown patterns.