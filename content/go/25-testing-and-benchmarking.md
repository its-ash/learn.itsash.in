# 25 — Testing & Benchmarking

Go has testing built into the toolchain (`go test`), with benchmarks, fuzzing, and example functions. No external framework needed for the basics.

## Test Functions

A test is a function `TestXxx(t *testing.T)` in a `_test.go` file:

::code-wrapper{language="go"}
```go
// math.go
package math

func Add(a, b int) int { return a + b }

// math_test.go
package math

import "testing"

func TestAdd(t *testing.T) {
	got := Add(2, 3)
	want := 5
	if got != want {
		t.Errorf("Add(2, 3) = %d, want %d", got, want)
	}
}
```
::

- `t.Errorf` — reports a failure and continues.
- `t.Fatalf` — reports a failure and stops the test (for fatal setup failures).
- `t.Skip` — skips the test (with a reason).
- `t.Run("subtest", func(t *testing.T) { ... })` — subtests, with `t.Parallel()` for concurrent execution.

## Table-Driven Tests

The idiomatic Go pattern — define cases as table rows, loop over them:

::code-wrapper{language="go"}
```go
func TestAdd(t *testing.T) {
	tests := []struct {
		name     string
		a, b     int
		want     int
	}{
		{"positive", 2, 3, 5},
		{"negative", -1, -2, -3},
		{"zero", 0, 0, 0},
		{"mixed", 5, -3, 2},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Add(tt.a, tt.b)
			if got != tt.want {
				t.Errorf("Add(%d, %d) = %d, want %d", tt.a, tt.b, got, tt.want)
			}
		})
	}
}
``
::

`t.Run` creates a subtest per case — `go test -v` shows each, and `go test -run TestAdd/positive` runs one. The `name` field identifies the case in output.

## Subtests and `t.Parallel`

::code-wrapper{language="go"}
```go
func TestParallel(t *testing.T) {
	tests := []struct{ name string; input int }{...}
	for _, tt := range tests {
		tt := tt   // capture (pre-1.22; 1.22+ doesn't need this)
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()   // mark as parallel
			// test...
		})
	}
}
```

`t.Parallel()` signals that subtests can run concurrently with other parallel tests. Pre-1.22, capture the loop variable (`tt := tt`); 1.22+ doesn't need it.

## Benchmarks

::code-wrapper{language="go"}
```go
func BenchmarkAdd(b *testing.B) {
	for i := 0; i < b.N; i++ {
		Add(2, 3)
	}
}
```
::

`b.N` is adjusted by the benchmark framework until the run takes ~1 second. Run with `go test -bench=.`:

::code-wrapper{language="bash"}
```bash
go test -bench=.                  # all benchmarks
go test -bench=BenchmarkAdd       # specific
go test -bench=. -benchmem        # show allocations
go test -bench=. -benchtime=5s    # run each for 5s
go test -bench=. -count=5         # run 5 times (for variance)
go test -bench=. -cpu=1,2,4       # different GOMAXPROCS
```

Output: `BenchmarkAdd-8   1000000000   0.5 ns/op   0 B/op   0 allocs/op` — `-8` is GOMAXPROCS, `ns/op` is time per operation, `B/op` and `allocs/op` (with `-benchmem`) are memory/allocations.

### Benchmarking with setup

::code-wrapper{language="go"}
```go
func BenchmarkProcess(b *testing.B) {
	data := setup()   // setup outside the loop
	b.ResetTimer()    // exclude setup time
	for i := 0; i < b.N; i++ {
		process(data)
	}
}
```

`b.ResetTimer()` excludes setup. `b.ReportAllocs()` enables allocation reporting per-benchmark.

## Fuzzing (Go 1.18+)

Fuzz tests run the function with random inputs to find panics/crashes:

::code-wrapper{language="go"}
```go
func FuzzAdd(f *testing.F) {
	f.Add(2, 3)        // seed corpus
	f.Add(-1, 1)
	f.Fuzz(func(t *testing.T, a, b int) {
		result := Add(a, b)
		// invariant: Add(a, b) == Add(b, a)
		if result != Add(b, a) {
			t.Errorf("Add not commutative: %d, %d", a, b)
		}
	})
}
```

::code-wrapper{language="bash"}
```bash
go test -fuzz=FuzzAdd           # run the fuzzer (until failure or Ctrl-C)
go test -fuzz=FuzzAdd -fuzztime=30s   # run for 30s
```

Failing inputs are saved to `testdata/fuzz/FuzzAdd/` as a regression corpus — subsequent `go test` runs them as regular tests.

## Example Functions

Examples in `_test.go` files are compiled, run, and checked against the output comment:

::code-wrapper{language="go"}
```go
func ExampleAdd() {
	fmt.Println(Add(2, 3))
	// Output: 5
}

func ExampleAdd_negative() {
	fmt.Println(Add(-1, -2))
	// Output: -3
}
```

If the `// Output:` comment doesn't match, the example fails. Examples also appear in `go doc` as documentation.

## `httptest` — Testing HTTP Handlers

::code-wrapper{language="go"}
```go
func TestHandler(t *testing.T) {
	req := httptest.NewRequest("GET", "/users/1", nil)
	w := httptest.NewRecorder()
	handler(w, req)
	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
}
```

`httptest.NewRequest` + `httptest.NewRecorder` let you test handlers without starting a server. `w.Body` has the response.

## Test Main (setup/teardown)

::code-wrapper{language="go"}
```go
func TestMain(m *testing.M) {
	// setup
	os.Exit(m.Run())
	// teardown (before os.Exit, or use defer with a wrapper)
}
```

`TestMain` runs once for the package — use for global setup (database, mocks).

## 💡 Tips & Tricks

- **Idiom**: use table-driven tests — define cases as a slice of structs, loop with `t.Run(name, ...)`. This is the universal Go pattern: easy to add cases, each runs as a named subtest (`go test -v` shows each, `-run` selects one), and the table documents the function's behavior.
- **Idiom**: use `t.Errorf` (continue) for non-fatal assertion failures and `t.Fatalf` (stop) for fatal setup failures — `Errorf` lets you see all failures in one run; `Fatalf` stops when setup is broken and further assertions would be meaningless.
- **Idiom**: use `httptest.NewRequest` + `httptest.NewRecorder` to test HTTP handlers without a server — construct a request, pass to the handler, inspect the recorder. Faster and more isolated than starting a real server.
- **Idiom**: use `b.ResetTimer()` after setup in benchmarks — without it, setup time counts toward the benchmark, skewing `ns/op`. `b.ReportAllocs()` (or `-benchmem`) shows allocations, the key metric for optimization.
- **Idiom**: use fuzzing (`FuzzXxx` + `go test -fuzz=...`) to find panics and edge cases — random inputs surface bugs that hand-written tests miss. Seed with `f.Add(known inputs)` for a starting corpus; failures are saved to `testdata/` as regression tests.

## ⚠️ Edge Cases & Gotchas

- **Test files use `package X` or `package X_test`**: `package math` (internal test — can access unexported) or `package math_test` (external test — imports `math` like an external package, only exported). Use external tests for testing the public API.
- **Loop variable capture in `t.Run` (pre-1.22)**: `for _, tt := range tests { t.Run(tt.name, func(t *testing.T) { use(tt) }) }` — pre-1.22, all subtests see the final `tt`. Fix with `tt := tt`. 1.22+ fixes this.
- **`t.Parallel` must be called early**: `t.Parallel()` signals parallelism; it should be the first line in the subtest. Tests that call it after doing work may not run in parallel.
- **Benchmark `b.N` is auto-adjusted**: don't assume `b.N` is a specific value — the framework increases it until the run takes ~1s. Write `for i := 0; i < b.N; i++`.
- **Benchmark setup counted without `ResetTimer`**: setup outside the `for` loop is included in timing. Call `b.ResetTimer()` after setup.
- **Benchmark loops must not be optimized away**: if the loop body's result is unused, the compiler may optimize it out, giving misleadingly fast results. Assign to a package-level `var` or use `b.N`-dependent logic to prevent dead-code elimination.
- **`go test` caches passing tests**: Go caches test results by inputs (files, env). `go test -count=1` disables caching (forces rerun). Useful when you've changed something the cache doesn't track.
- **Fuzz failures saved to `testdata/`**: these become regular tests — `go test` runs them. Don't delete `testdata/fuzz/` unless you've fixed the bug.
- **`ExampleXxx` output must match exactly**: trailing whitespace, capitalization — the `// Output:` line is compared exactly. Use `// Unordered output:` for any-order lines.
- **`t.Skip` vs `t.Skipf`**: skip the test with a reason. Common for tests requiring a database/env: `if os.Getenv("DB_TEST") == "" { t.Skip("set DB_TEST=1 to run") }`.

## 🧠 Spot the Bug

A benchmark shows 0 ns/op — impossibly fast:

::code-wrapper{language="go"}
```go
func BenchmarkSum(b *testing.B) {
	var nums []int
	for i := 0; i < 1000; i++ {
		nums = append(nums, i)
	}
	for i := 0; i < b.N; i++ {
		Sum(nums)
	}
}
```
::

What's likely happening?

<details>
<summary>Answer</summary>

The compiler is optimizing away the call to `Sum(nums)` because its result is unused — dead-code elimination removes it, so the benchmark measures nothing (0 ns/op).

The fix — prevent the optimizer from removing the call by using the result:

```go
func BenchmarkSum(b *testing.B) {
	nums := make([]int, 1000)
	for i := range nums { nums[i] = i }
	var result int   // package-level or function-local sink
	for i := 0; i < b.N; i++ {
		result = Sum(nums)
	}
	_ = result   // ensure the result is "used"
}
```

Or assign to a package-level var:

```go
var sink int

func BenchmarkSum(b *testing.B) {
	nums := make([]int, 1000)
	for i := range nums { nums[i] = i }
	for i := 0; i < b.N; i++ {
		sink = Sum(nums)
	}
}
```

The "sink" pattern (assigning to a package-level var or a local that's "used") prevents dead-code elimination, so the benchmark measures the real cost.

**The lesson**: if a benchmark's result is unused, the compiler may optimize it away, giving misleadingly fast results. Assign the result to a package-level var (a "sink") to prevent elimination.

</details>

## Summary

You can now write tests (`TestXxx`, table-driven with `t.Run`), use `t.Parallel`/`t.Skip`/`t.Errorf`/`t.Fatalf`, benchmark (`BenchmarkXxx` with `b.N`/`ResetTimer`/`ReportAllocs`), fuzz (`FuzzXxx`), write example tests, and test HTTP handlers with `httptest` — while avoiding the loop-variable-capture and optimizer-eliminates-the-benchmark traps. Next: concurrency patterns.