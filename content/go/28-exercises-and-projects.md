---
title: "28 — Exercises & Project Ideas"
description: "Production-graded exercises from beginner to expert — covering generics, concurrency patterns, I/O streaming, error handling, and a capstone concurrent web crawler."
---

# 28 — Exercises & Project Ideas

Practice exercises progressing from beginner to expert, covering every chapter. Set up a module and work through them.

## Beginner

### 1. CLI Tool with Flags

Build a CLI tool that reads a CSV file, filters rows by a column value, and outputs JSON. Use `flag`, `encoding/csv`, `encoding/json`.

::code-wrapper{language="go"}
```go
package main

import (
	"encoding/csv"
	"encoding/json"
	"flag"
	"fmt"
	"os"
)

func main() {
	input := flag.String("input", "", "input CSV file path")
	filterCol := flag.Int("col", 0, "column index to filter on")
	filterVal := flag.String("value", "", "value to match")
	flag.Parse()

	if *input == "" || *filterVal == "" {
		fmt.Fprintln(os.Stderr, "usage: filter -input file.csv -col 0 -value alice")
		os.Exit(2)
	}

	f, err := os.Open(*input)
	if err != nil {
		fmt.Fprintf(os.Stderr, "open: %v\n", err)
		os.Exit(1)
	}
	defer f.Close()

	r := csv.NewReader(f)
	records, err := r.ReadAll()
	if err != nil {
		fmt.Fprintf(os.Stderr, "read csv: %v\n", err)
		os.Exit(1)
	}

	var result []map[string]string
	if len(records) == 0 {
		return
	}
	headers := records[0]
	for _, row := range records[1:] {
		if len(row) > *filterCol && row[*filterCol] == *filterVal {
			m := make(map[string]string)
			for i, h := range headers {
				if i < len(row) {
					m[h] = row[i]
				}
			}
			result = append(result, m)
		}
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	enc.Encode(result)
}
```

### 2. Stack and Queue with Generics

Implement a generic `Stack[T]` and `Queue[T]` using slices. Include `Push`, `Pop`, `Len`, and tests.

::code-wrapper{language="go"}
```go
package stack

type Stack[T any] struct{ items []T }

func (s *Stack[T]) Push(v T) {
	s.items = append(s.items, v)
}

func (s *Stack[T]) Pop() (T, bool) {
	var zero T
	if len(s.items) == 0 {
		return zero, false
	}
	v := s.items[len(s.items)-1]
	s.items = s.items[:len(s.items)-1]
	return v, true
}

func (s *Stack[T]) Len() int { return len(s.items) }

// Tests:
// func TestStack(t *testing.T) {
//     s := &Stack[int]{}
//     s.Push(1); s.Push(2)
//     v, ok := s.Pop()
//     assert(v == 2 && ok)
//     assert(s.Len() == 1)
// }
```

### 3. Word Frequency Counter

Read a text file, count word frequencies, print the top 10. Use `bufio.Scanner`, `strings.Fields`, `map`, sorting.

### 4. Safe URL Shortener

Implement an in-memory URL shortener with a `sync.RWMutex`-protected map. Support `Shorten(url) string` and `Resolve(short) (string, error)`.

## Intermediate

### 5. Worker Pool with Cancellation

Implement a worker pool that processes jobs from a channel, respects `context.Context`, and returns results. Test with 1000 jobs and 10 workers, ensuring all results are collected even on cancellation.

### 6. Pipeline with Backpressure

Build a 3-stage pipeline (generate → process → collect) with bounded buffers. Measure what happens with unbuffered vs buffered channels. Write benchmarks for each.

### 7. Custom Error Types with `errors.As`

Define a `ValidationError` with `Field`, `Message`, and `Code`. Implement `Error()`. Write a function that returns wrapped errors, and a caller that uses `errors.As` to extract the validation details for HTTP status mapping.

### 8. Rate Limiter (Token Bucket)

Implement a token-bucket rate limiter using a `time.Ticker` and a channel. Support `Allow() bool` for rate-limited access. Test with concurrent goroutines.

### 9. Concurrent Cache with TTL

Build a cache with time-based expiration. Use `sync.RWMutex`, a map, and a background goroutine for eviction. Support `Get`, `Set(key, val, ttl)`, and `Delete`.

::code-wrapper{language="go"}
```go
package cache

import (
	"sync"
	"time"
)

type entry struct {
	value any
	expiry time.Time
}

type Cache struct {
	mu      sync.RWMutex
	items   map[string]entry
}

func New() *Cache {
	return &Cache{items: make(map[string]entry)}
}

func (c *Cache) Set(key string, val any, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items[key] = entry{value: val, expiry: time.Now().Add(ttl)}
}

func (c *Cache) Get(key string) (any, bool) {
	c.mu.RLock()
	e, ok := c.items[key]
	c.mu.RUnlock()
	if !ok {
		return nil, false
	}
	if time.Now().After(e.expiry) {
		c.mu.Lock()
		delete(c.items, key)  // lazy eviction
		c.mu.Unlock()
		return nil, false
	}
	return e.value, true
}

func (c *Cache) StartEvictor(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			c.evictExpired()
		case <-ctx.Done():
			return
		}
	}
}

func (c *Cache) evictExpired() {
	now := time.Now()
	c.mu.Lock()
	defer c.mu.Unlock()
	for k, e := range c.items {
		if now.After(e.expiry) {
			delete(c.items, k)
		}
	}
}
```

## Advanced

### 10. Concurrent Web Crawler

Build a web crawler that:
- Starts from a seed URL, fetches pages concurrently (worker pool)
- Extracts links, follows them (bounded depth)
- Respects `robots.txt` and rate limits per domain
- Uses `context.Context` for cancellation and timeouts
- Deduplicates visited URLs with a `sync.Map`
- Reports results to a channel

::code-wrapper{language="go"}
```go
package crawler

import (
	"context"
	"net/http"
	"net/url"
	"sync"
	"time"
)

type Crawler struct {
	client    *http.Client
	workers   int
	maxDepth  int
	visited   sync.Map  // URL → struct{}
	rateLimit time.Duration
}

type Result struct {
	URL   string
	Title string
	Depth int
	Err   error
}

func New(workers, maxDepth int, rateLimit time.Duration) *Crawler {
	return &Crawler{
		client:    &http.Client{Timeout: 10 * time.Second},
		workers:   workers,
		maxDepth:  maxDepth,
		rateLimit: rateLimit,
	}
}

func (c *Crawler) Crawl(ctx context.Context, seed string) <-chan Result {
	out := make(chan Result, 100)
	jobs := make(chan job, 100)

	var wg sync.WaitGroup
	for i := 0; i < c.workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			c.worker(ctx, jobs, out)
		}()
	}

	go func() {
		defer close(jobs)
		c.enqueue(ctx, jobs, seed, 0)
	}()

	go func() {
		wg.Wait()
		close(out)
	}()

	return out
}

type job struct {
	url   string
	depth int
}

func (c *Crawler) enqueue(ctx context.Context, jobs chan<- job, u string, depth int) {
	if depth > c.maxDepth {
		return
	}
	if _, loaded := c.visited.LoadOrStore(u, struct{}{}); loaded {
		return  // already visited
	}
	select {
	case jobs <- job{url: u, depth: depth}:
	case <-ctx.Done():
	}
}

func (c *Crawler) worker(ctx context.Context, jobs <-chan job, out chan<- Result) {
	for {
		select {
		case j, ok := <-jobs:
			if !ok {
				return
			}
			result, links := c.fetch(ctx, j)
			select {
			case out <- result:
			case <-ctx.Done():
				return
			}
			for _, link := range links {
				c.enqueue(ctx, jobs, link, j.depth+1)
			}
		case <-ctx.Done():
			return
		}
	}
}

func (c *Crawler) fetch(ctx context.Context, j job) (Result, []string) {
	req, err := http.NewRequestWithContext(ctx, "GET", j.url, nil)
	if err != nil {
		return Result{URL: j.url, Depth: j.depth, Err: err}, nil
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return Result{URL: j.url, Depth: j.depth, Err: err}, nil
	}
	defer resp.Body.Close()

	title, links := parseHTML(resp.Body, j.url)
	return Result{URL: j.url, Title: title, Depth: j.depth}, links
}
```

### 11. JSON Streaming Server

Build an HTTP server that streams large JSON responses (NDJSON) without buffering. Use `json.Encoder`, `flusher.Flush()` for chunked transfer.

### 12. Benchmark-Driven Optimization

Write a function that parses a custom log format. Benchmark it, profile with `pprof`, and reduce allocations to zero. Use `sync.Pool`, `strings.Builder`, and pre-allocation.

### 13. Graceful HTTP Server

Build an HTTP server that shuts down gracefully on SIGINT/SIGTERM — drains in-flight requests, closes idle connections, and stops accepting new ones. Use `signal.NotifyContext` and `http.Server.Shutdown`.

::code-wrapper{language="go"}
```go
package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	srv := &http.Server{
		Addr:         ":8080",
		Handler:      mux(),
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(),
		syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("listening on %s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("forced shutdown: %v", err)
	}
	log.Println("server stopped")
}
```

## Expert

### 14. Generic Result Type

Implement a `Result[T]` type (like Rust's Result) with `Ok`, `Err`, `Unwrap`, `Map`, `AndThen`. Use generics. Write property-based tests with `testing/quick`.

### 15. Concurrent Merge Sort

Implement merge sort using goroutines for the recursive splits. Use a worker pool to limit concurrency. Benchmark against the sequential version — find the crossover point where parallelism helps.

### 16. Memory-Efficient Ring Buffer

Implement a lock-free ring buffer using `atomic` operations. Benchmark with multiple producers and consumers. Use `pprof` to verify zero allocations in the hot path.

### 17. Custom `json.Marshaler` for Money

Implement a `Money` type that serializes as a string (`"$12.34"`) to avoid float precision issues. Support `MarshalJSON`, `UnmarshalJSON`, and arithmetic (`Add`, `Sub`, `Mul`) with overflow checking.

### 18. Distributed Task Queue (Capstone)

Build a task queue with:
- A Redis-backed queue (using `go-redis`)
- Worker processes that claim and execute tasks
- At-least-once delivery (tasks are requeued if a worker dies)
- Dead letter queue for failed tasks
- Metrics (Prometheus) for throughput, latency, error rate
- Graceful shutdown with in-flight task draining

## How to Approach These Exercises

1. **Start with a test** — write the test first, then implement. This clarifies the interface.
2. **Use `context.Context`** — every long-running function should accept and respect cancellation.
3. **Check errors** — never ignore an error. At minimum, log it.
4. **Benchmark hot paths** — use `b.ReportAllocs()` and `benchstat` to verify improvements.
5. **Run `go vet` and `golangci-lint`** — catch issues before they become bugs.
6. **Use `go test -race`** — catch data races in concurrent code.
7. **Profile with `pprof`** — find the actual bottleneck before optimizing.

## 📚 What's Next

→ [Go Documentation](https://go.dev/doc/) — the official Go documentation for deeper reference.
→ [Effective Go](https://go.dev/doc/effective_go) — idiomatic Go patterns.
→ [Go by Example](https://gobyexample.com/) — hands-on examples for every feature.