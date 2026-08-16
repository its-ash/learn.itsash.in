# 28 — Exercises & Project Ideas

Practice makes Go stick. These exercises and projects progress from beginner to pro, covering every chapter. Set up a module (`go mod init`) and work through them.

## Beginner

### 1. Hello, Name (basics, input)

Read a name from `os.Args` (or `bufio.Scanner`), print "Hello, <name>!". Handle missing args.

::code-wrapper{language="go"}
```go
package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: hello <name>")
		os.Exit(1)
	}
	fmt.Printf("Hello, %s!\n", os.Args[1])
}
```
::

### 2. FizzBuzz (control flow)

Print FizzBuzz from 1 to 100. Practice `for`, `if/else`, `fmt.Printf`.

### 3. Slice Operations (slices, generics)

Implement `Map`, `Filter`, `Reduce` as generic functions. Then use `slices.Sort`, `slices.Contains` from the standard library.

### 4. Word Count (maps, strings)

Read a text file, count word frequencies, print the top 10. Practice `bufio.Scanner`, `strings.Fields`, `map`, sorting.

### 5. Reverse a String (strings, runes)

Reverse a string, handling UTF-8 correctly (use `[]rune`, not `[]byte`).

## Intermediate

### 6. Stack and Queue (generics)

Implement a generic `Stack[T]` and `Queue[T]` using slices. Include `Push`, `Pop`, `Len`, and tests.

### 7. HTTP API Client (interfaces, error handling)

Write a function `fetchUser(ctx context.Context, id int) (*User, error)` that calls a JSON API with a timeout, wraps errors with context, and handles `context.DeadlineExceeded`.

::code-wrapper{language="go"}
```go
func fetchUser(ctx context.Context, id int) (*User, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	url := fmt.Sprintf("https://api.example.com/users/%d", id)
	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch user %d: %w", id, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch user %d: status %d", id, resp.StatusCode)
	}

	var u User
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return nil, fmt.Errorf("fetch user %d: decode: %w", id, err)
	}
	return &u, nil
}
```
::

### 8. Worker Pool (concurrency)

Implement a worker pool: N workers process jobs from a channel, write results to another. Use `sync.WaitGroup`. Test with 1000 jobs and 10 workers.

### 9. Pipeline (concurrency)

Build a 3-stage pipeline: generate numbers → square → filter evens. Print results. Add cancellation via `context`.

### 10. File Processor (I/O)

Read a CSV file, process each row, write a JSON file. Use `encoding/csv`, `encoding/json`, `bufio`. Handle errors at each step.

### 11. Custom Error Type (error handling)

Define a `ValidationError` with `Field` and `Message`. Implement `Error()`. Use `errors.As` to extract it in a caller.

### 12. Benchmark a Function (testing)

Write a function and a benchmark. Measure `ns/op` and `allocs/op`. Optimize to reduce allocations (pre-size, `strings.Builder`). Compare before/after with `benchstat`.

## Advanced

### 13. Concurrent Web Crawler (concurrency, context)

Crawl a website concurrently: fetch a page, extract links, crawl each (bounded by a worker pool). Limit depth, respect `context` cancellation, avoid revisiting URLs (`sync.Map` or a mutex-protected map).

### 14. Job Queue with Retry (concurrency, errors)

Build a job queue where failed jobs retry with exponential backoff. Use `context` for cancellation. Track job state (pending, running, done, failed).

### 15. Rate-Limited API Client (rate limiting)

Use `golang.org/x/time/rate` to rate-limit API calls to 10/second with a burst of 5. Test with 100 calls and verify timing.

### 16. In-Memory Cache (sync, generics)

Implement a generic `Cache[K, V]` with TTL (time-to-live). Use `sync.RWMutex` for concurrent access. Expire entries in the background.

### 17. HTTP Server with Middleware (interfaces, http)

Build an HTTP server with middleware: logging, authentication, request ID. Use `context.WithValue` for request-scoped data. Test with `httptest`.

### 18. Database App (database/sql)

Build a CRUD app with `database/sql` (or `pgx`). Use `context` for query cancellation. Handle `sql.ErrNoRows` with `errors.Is`. Write tests with a real database (or `sqlmock`).

## Pro / Capstone

### 19. Distributed Task System (concurrency, context, error handling)

Build a task system: submit tasks to a queue, workers process them with retries, results stored. Features: priority queues, deadlines, graceful shutdown, metrics.

### 20. Chat Server (concurrency, networking)

Build a TCP chat server: clients connect, broadcast messages to all connected clients. Use goroutines per connection, channels for message passing, `sync.Map` for client registry. Handle disconnects and graceful shutdown.

### 21. URL Shortener (HTTP, database, caching)

Build a URL shortener: short codes redirect to long URLs. Use a database for persistence, an in-memory cache for hot URLs, and a hash function for short codes. Add analytics (click counts) and expiration.

### 22. File Sync Tool (I/O, concurrency)

Build a tool that syncs two directories: detect changes (mtime/hash), copy/update/delete. Use goroutines for parallel file hashing, `context` for cancellation. Handle large files by streaming (`io.Copy`).

### 23. Pub/Sub System (concurrency, channels)

Build an in-memory pub/sub: topics, subscribers, message delivery. Use channels for delivery, goroutines for per-subscriber buffers, `context` for unsubscription. Handle slow subscribers (buffered channels + drop or block policy).

### 24. Profiling a Real App (pprof)

Build a server with `net/http/pprof` enabled. Load-test it (with `hey` or `wrk`). Profile CPU and heap, find the hotspot, optimize (reduce allocations), re-profile. Document the before/after.

## Exercise: Find the Bug

For each snippet, find the bug and write the fix. (Answers in `<details>`.)

### A. Loop variable capture (pre-1.22)

::code-wrapper{language="go"}
```go
for i := 0; i < 3; i++ {
	go func() { fmt.Println(i) }()
}
```
::

<details>
<summary>Answer</summary>

Pre-1.22, all goroutines see the final `i` (3, 3, 3) — the loop variable is shared. Fix: `go func(i int) { fmt.Println(i) }(i)` or update to Go 1.22+.
</details>

### B. Nil interface

::code-wrapper{language="go"}
```go
func f() error {
	var p *MyError = nil
	return p
}
if err := f(); err != nil { /* always true */ }
```
::

<details>
<summary>Answer</summary>

`return p` wraps the nil pointer in a non-nil interface (`*MyError`, nil). `err != nil` is always true. Fix: `return nil` directly.
</details>

### C. Defer in a loop

::code-wrapper{language="go"}
```go
for _, path := range paths {
	f, _ := os.Open(path)
	defer f.Close()
	process(f)
}
```
::

<details>
<summary>Answer</summary>

`defer` accumulates until the function returns — all files stay open. Fix: extract the loop body into a function so each `defer` runs per iteration.
</details>

### D. Concurrent map write

::code-wrapper{language="go"}
```go
m := map[int]int{}
go func() { m[1] = 1 }()
go func() { m[2] = 2 }()
```
::

<details>
<summary>Answer</summary>

Concurrent map writes cause a fatal error. Fix: `sync.RWMutex` + map, or `sync.Map`.
</details>

### E. Channel deadlock

::code-wrapper{language="go"}
```go
ch := make(chan int)
ch <- 1
fmt.Println(<-ch)
```
::

<details>
<summary>Answer</summary>

Unbuffered channel send blocks until a receiver — but the receiver is the next line (not yet running). Deadlock. Fix: buffered (`make(chan int, 1)`) or run the sender in a goroutine.
</details>

### F. Ignored error causing nil dereference

::code-wrapper{language="go"}
```go
resp, _ := http.Get(url)
fmt.Println(resp.Status)
```
::

<details>
<summary>Answer</summary>

If `Get` errors, `resp` is nil — `resp.Status` panics. Fix: check `err` and return/handle before accessing `resp`.
</details>

### G. Map value not modifiable

::code-wrapper{language="go"}
```go
users := map[int]User{1: {"Alice", false}}
users[1].Active = true
```
::

<details>
<summary>Answer</summary>

Map values aren't addressable. Fix: `u := users[1]; u.Active = true; users[1] = u` or use `map[int]*User`.
</details>

### H. `string(65)` gives "A" not "65"

::code-wrapper{language="go"}
```go
n := 65
fmt.Println(string(n))   // "A" — the code point, not digits
```
::

<details>
<summary>Answer</summary>

`string(int)` converts the int to a code point. Fix: `strconv.Itoa(n)` for digits.
</details>

## 📚 Further Reading

- [A Tour of Go](https://go.dev/tour) — interactive tutorial.
- [Effective Go](https://go.dev/doc/effective_go) — idioms.
- [Go by Example](https://gobyexample.com) — runnable examples.
- [The Go Blog](https://go.dev/blog) — deep dives from the Go team.
- [Go Proverbs](https://go-proverbs.github.io) — the philosophy in short sayings.
- [100 Go Mistakes and How to Avoid Them](https://100go.co) — common pitfalls.

## License

These notes are yours to use, share, and modify.

🐹