---
title: "01 — Introduction & Setup"
description: "Go toolchain internals, module graph mechanics, build tags, cross-compilation, and production project scaffolding — not a hello-world tutorial."
---

# 01 — Introduction & Setup

Go is a statically typed, garbage-collected, compiled language with first-class concurrency primitives (goroutines/channels) and a runtime that multiplexes millions of goroutines onto a small pool of OS threads. This chapter skips "what is Go" and goes straight into the toolchain, module graph, and project scaffolding you need in production.

## Toolchain Internals

The `go` command is a single binary that orchestrates compilation, linking, dependency resolution, testing, and profiling. Understanding what happens under the hood matters when builds break in CI.

::code-wrapper{language="go"}
```go
// _ = Build pipeline (simplified):
//   source.go → [go tool compile] → object files (.a) → [go tool link] → binary
//
// Key flags that change behavior in production:
//   -trimpath        removes absolute paths from binary (reproducible builds)
//   -ldflags='-s -w' strips debug info + symbol table (smaller binary, no pprof)
//   -buildmode=pie   position-independent executable (hardened)
//   -buildvcs=false  skip embedding VCS info (git hash) into binary
//   -tags            conditional compilation via build constraints
//
// The runtime embeds GOMAXPROCS, GC strategy, and stack growth policy
// at link time. Changing GOROOT after build has zero effect.
```
::

### The `GODEBUG` escape hatch

::code-wrapper{language="bash"}
```bash
# GODEBUG toggles runtime behavior without code changes — critical for
# diagnosing GC panics, scheduler issues, or deprecated feature removals.

# Print GC summary after every collection:
GODEBUG=gctrace=1 ./myapp

# Print scheduler trace (goroutine creation/blocking):
GODEBUG=schedtrace=1000,scheddetail=1 ./myapp

# Disable async preemption (Go 1.14+ introduced async preemption;
# some CGO/assembly code breaks — this reverts to cooperative):
GODEBUG=asyncpreemptoff=1 ./myapp

# Panic on checkptr violations (detect unsafe pointer arithmetic bugs):
GODEBUG=checkptr=1 go test -race ./...

# List all active GODEBUG settings for this Go version:
GODEBUG= ./myapp 2>&1 | head
```
::

## Installing & Managing Multiple Go Versions

::code-wrapper{language="bash"}
```bash
# macOS — Homebrew installs the latest stable. For pinning, use go install:
brew install go

# Install a specific version via the official toolchain (Go 1.21+):
go install golang.org/dl/go1.22.0@latest
go1.22.0 download    # fetches the SDK
go1.22.0 version     # use this version's toolchain

# The `go` directive in go.mod can trigger automatic toolchain download:
#   go 1.22.0  →  if installed toolchain < 1.22.0, Go fetches it via GOTOOLCHAIN
# Set GOTOOLCHAIN=local to disable auto-download (lock to installed version).

# Verify:
go version           # go version go1.22.0 darwin/arm64
go env GOROOT        # /opt/homebrew/Cellar/go/1.22.0/libexec (or /usr/local/go)
go env GOPATH        # ~/go  — where go install puts binaries + module cache lives
go env GOMODCACHE    # ~/go/pkg/mod — cached dependency sources
go env GOTOOLCHAIN   # auto (default) or a specific version
```
::

### Cross-compilation matrix

::code-wrapper{language="bash"}
```bash
# Pure-Go cross-compilation needs no toolchain — the Go compiler emits
# target-specific machine code directly. Set GOOS + GOARCH and build.

# Linux AMD64 (most servers):
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o bin/app-linux-amd64

# Linux ARM64 (Graviton, Raspberry Pi 4):
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -o bin/app-linux-arm64

# macOS Universal binary (then lipo-create):
GOOS=darwin GOARCH=arm64 go build -o bin/app-darwin-arm64
GOOS=darwin GOARCH=amd64 go build -o bin/app-darwin-amd64
lipo -create -output bin/app-darwin-universal bin/app-darwin-arm64 bin/app-darwin-amd64

# Windows:
GOOS=windows GOARCH=amd64 go build -o bin/app-windows-amd64.exe

# WebAssembly (run Go in the browser):
GOOS=js GOARCH=wasm go build -o bin/app.wasm

# CGO cross-compilation requires a C cross-compiler (e.g., zig, musl-cross):
# CGO_ENABLED=1 CC=aarch64-linux-gnu-gcc GOOS=linux GOARCH=arm64 go build
```
::

## Module Graph Internals

A Go module is a versioned collection of packages with a `go.mod` at its root. The module graph is a directed acyclic graph (DAG) of dependencies, resolved via [Minimal Version Selection (MVS)](https://research.swtch.com/vgo-mvs) — Go's deterministic, lock-free version selection algorithm.

::code-wrapper{language="bash"}
```bash
mkdir myapp && cd myapp
go mod init example.com/myapp
# go.mod:
#   module example.com/myapp
#   go 1.22

# Add a dependency — this updates go.mod (require) and go.sum (hashes):
go get github.com/lib/pq@latest          # latest tagged release
go get github.com/lib/pq@v1.10.0         # pin to exact version
go get github.com/lib/pq@v1.10.0-beta.1  # pre-release
go get github.com/some/repo@main        # ⚠️ pseudo-version (commit hash-based)

# Tidy — adds missing imports, removes unused deps, updates go.sum:
go mod tidy

# Why is go.sum important? It pins SHA-256 hashes of every dependency
# zip + go.mod. The Go tool verifies these on download — if a registry
# serves a different hash, the build fails. This is supply-chain protection.

# Inspect the resolved module graph:
go mod graph | head                      # parent@version child@version per line

# Why a specific version was selected (MVS trace):
go mod why -m github.com/lib/pq

# Download all deps to GOMODCACHE (for offline builds / CI caching):
go mod download

# Vendor mode — copy deps into ./vendor, build from there (no network):
go mod vendor
go build -mod=vendor                     # forces vendor mode
```
::

### MVS vs SemVer resolution — the trap

::code-wrapper{language="text"}
```
// MVS picks the MINIMUM version that satisfies all requirements.
// Unlike npm/cargo (which pick the LATEST compatible), Go picks the lowest.
//
// Scenario:
//   your app requires:   libA v1.0.0
//   libA v1.0.0 requires: libB v1.2.0
//   libA v1.1.0 requires: libB v1.1.0 (DOWNGRADE — bug in v1.2.0)
//
// If you upgrade libA to v1.1.0:
//   npm:  resolves libB to v1.2.0 (highest compatible) — BUG persists
//   Go:   resolves libB to v1.1.0 (what libA v1.1.0 asked for) — BUG fixed
//
// To force a higher version than a dep requests, add an explicit require:
//   require libB v1.3.0  // overrides MVS — your direct requirement wins
```
::

## Build Constraints (Tags)

Build constraints allow conditional compilation — different code for different OS/arch/Go versions or custom tags.

::code-wrapper{language="go"}
```go
//go:build linux && amd64
// +build linux,amd64            // legacy syntax (Go ≤1.16) — keep for compat

package fast

// This file ONLY compiles on linux/amd64.
// Use for platform-specific syscalls, assembly, or intrinsics.

import "syscall"

// FastGetrandom uses getrandom(2) — linux 3.17+ only.
func FastGetrandom(b []byte) (int, error) {
	return syscall.Getrandom(b, 0) // GRND_NONBLOCK
}
```
::

::code-wrapper{language="go"}
```go
//go:build !linux

package fast

import "crypto/rand"

// Fallback for non-linux — uses crypto/rand (slower but portable).
func FastGetrandom(b []byte) (int, error) {
	return rand.Read(b)
}
```
::

::code-wrapper{language="bash"}
```bash
# Build with custom tags:
go build -tags "production,fastjson"     # both tags must be satisfied
go build -tags "production" -tags "debug" # multiple -flags allowed

# List files that would be included for a given tag set:
go list -tags "production" -f '{{.GoFiles}}' ./...

# Common stdlib tags: netgo (pure-Go DNS), osusergo (pure-Go user lookup),
#   sqlite_omit_load_extension, jsoniter, etc.
```
::

## Production Project Layout

::code-wrapper{language="text"}
```text
myapp/
├── go.mod
├── go.sum
├── Makefile
├── .golangci.yml
├── cmd/
│   └── myapp/
│       └── main.go              # thin entry point — wire deps, call run()
├── internal/                     # toolchain-enforced privacy boundary
│   ├── config/
│   │   └── config.go
│   ├── domain/                   # core business types (no I/O deps)
│   │   ├── user.go
│   │   └── order.go
│   ├── service/                  # use-case orchestration
│   │   └── user_service.go
│   ├── store/                    # persistence impl (postgres, redis)
│   │   ├── postgres/
│   │   └── redis/
│   └── transport/                # HTTP, gRPC handlers
│       └── http/
├── pkg/                          # exportable packages (importable by others)
│   └── ratelimiter/
├── api/                          # OpenAPI specs, proto files
│   └── openapi.yaml
├── deployments/
│   ├── docker/
│   └── k8s/
├── scripts/
│   └── migrate.sh
└── test/                         # integration tests (outside packages)
    └── integration_test.go
```
::

### `internal/` enforcement

::code-wrapper{language="go"}
```go
// internal/config/config.go
package config

// This package can ONLY be imported by code under example.com/myapp/.
// The Go toolchain enforces this at compile time — no runtime cost.
// Attempting `import "example.com/myapp/internal/config"` from a
// different module → compile error: "use of internal package not allowed".

type Config struct {
	Port int `env:"PORT" envDefault:"8080"`
}

func Load() (*Config, error) { /* ... */ return &Config{}, nil }
```
::

::code-wrapper{language="go"}
```go
// cmd/myapp/main.go — thin entry point pattern
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"example.com/myapp/internal/config"
	"example.com/myapp/internal/service"
	"example.com/myapp/internal/transport/http"
)

func main() {
	// 1. Load config — fail fast if env is wrong.
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	// 2. Build a root context that cancels on SIGINT/SIGTERM.
	ctx, stop := signal.NotifyContext(context.Background(),
		syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// 3. Wire dependencies (DI by hand — no framework needed for small apps).
	userSvc := service.NewUserService()
	srv := http.NewServer(cfg.Port, userSvc)

	// 4. Run with graceful shutdown — server blocks until ctx is canceled.
	if err := srv.Run(ctx); err != nil {
		log.Fatalf("server: %v", err)
	}
}
```
::

## Embedded Resources (`embed`)

Go 1.16+ embeds static files directly into the binary via `//go:embed` — no external asset server needed.

::code-wrapper{language="go"}
```go
// assets.go
package assets

import "embed"

//go:embed templates/*.html
// FS is a read-only virtual filesystem embedded at compile time.
// The patterns are relative to THIS source file's directory.
var FS embed.FS

//go:embed migrations/*.sql
var Migrations embed.FS

//go:embed dist/*                    // embed a compiled React/Vue SPA
var SPA embed.FS
```
::

::code-wrapper{language="go"}
```go
// server.go — serve embedded SPA with zero external files
package http

import (
	"io/fs"
	"net/http"

	"example.com/myapp/assets"
)

func spaHandler() http.Handler {
	// Strip the "dist/" prefix so index.html is at root.
	sub, _ := fs.Sub(assets.SPA, "dist")
	return http.FileServer(http.FS(sub))
}

// The binary is now self-contained — deploy ONE file, no assets dir.
// Embedded files are hashed into go.sum — tampering changes the binary.
```
::

### ⚠️ `embed` gotcha: patterns must match at compile time

::code-wrapper{language="go"}
```go
//go:embed nonexistent/*.txt    // ❌ COMPILE ERROR if no files match
var Bad embed.FS

//go:embed templates/*.html     // ✅ matches at least one file
var Good embed.FS

// Pattern rules:
//   - No `..` (cannot escape the module)
//   - No absolute paths
//   - Directories embed recursively (but exclude .git, _test.go, etc.)
//   - `//go:embed` must be immediately followed by the directive (no blank line)
```
::

## `cgo` — When and When Not

::code-wrapper{language="go"}
```go
// cgo lets Go call C code. It's powerful but has real costs:
//
// COSTS:
//   1. Cross-compilation breaks (need a C cross-compiler for each target)
//   2. The Go scheduler can't preempt cgo calls → GC pauses, latency spikes
//   3. Binary size increases (C runtime linked in)
//   4. Build time increases significantly
//   5. `go test -race` still works but cgo + race = slower
//
// WHEN TO USE:
//   - Binding to a C library with no Go equivalent (e.g., SQLite, libxml2)
//   - Kernel-level syscalls not exposed by syscall/x/sys
//   - Legacy integration (can't rewrite the C lib)
//
// WHEN NOT:
//   - "It's faster" — benchmark first; pure Go is often fast enough
//   - For a few math functions — Go has math/big, math bits package
//   - If you need clean cross-compilation

package main

/*
#include <stdio.h>
#cgo LDFLAGS: -lm

// Inline C — compiled by the host C compiler at build time.
static double fastSqrt(double x) {
    // SSE intrinsic via -ffast-math (compiler flag, not shown here)
    double r;
    __asm__ ("sqrtss %1, %0" : "=x"(r) : "x"(x));
    return r;
}
*/
import "C"

import "fmt"

func main() {
	x := C.double(144.0)
	r := C.fastSqrt(x)     // cgo call — ~50-100ns overhead per call
	fmt.Printf("sqrt(%.0f) = %.2f\n", x, r)
}
```
::

::code-wrapper{language="bash"}
```bash
# Disable cgo for pure-Go builds (smaller binary, fast cross-compile):
CGO_ENABLED=0 go build -o myapp

# Enable cgo (default on host platform):
CGO_ENABLED=1 go build

# Static binary WITH cgo (musl, not glibc):
CGO_ENABLED=1 CC=musl-gcc go build -ldflags='-extldflags "-static"' -o myapp
```
::

## The Race Detector

::code-wrapper{language="bash"}
```bash
# The race detector instruments memory accesses at compile time and
# reports data races (concurrent reads/writes to the same address).
# It's NOT a proof of race-freedom — it only catches races that
# actually occur during the test run. Increase coverage with -count.

go test -race ./...                          # all tests
go test -race -count=100 ./internal/store/    # run 100x to catch rare races
go build -race -o myapp                       # race-instrumented binary
./myapp                                       # detect races in production-like load

# COST: ~2x CPU, ~2x memory, ~10x execution time.
# The race detector is always-on in CI — never ship without it passing.

# Output format:
# WARNING: DATA RACE
#   Read at 0x... by goroutine 7:
#     main.increment()  /path/main.go:12 +0x44
#   Previous write at 0x... by goroutine 6:
#     main.increment()  /path/main.go:12 +0x44
#   Goroutine 7 (running) created at:
#     main.main()  /path/main.go:20 +0x83
```
::

## `go vet` and `golangci-lint`

::code-wrapper{language="bash"}
```bash
# go vet — built-in static analysis. Fast, zero false positives by design.
go vet ./...

# Key checks:
#   -printf      wrong format verbs (%d for a string, etc.)
#   -copylocks   copying a Mutex/WaitGroup (corrupts internal state)
#   -shadow      variable shadowing (inner var hides outer)
#   -unreachable code after return/panic
#   -structtags  malformed struct tags
#   -buildtag    malformed //go:build constraints

# golangci-lint — meta-linter running 20+ linters in parallel.
# Install:
curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(go env GOPATH)/bin v1.56.2

# Run with defaults:
golangci-lint run

# Key linters to enable in .golangci.yml:
#   errcheck      — unchecked errors (the most common Go bug)
#   staticcheck   — advanced static analysis (SA1000-SA9000 series)
#   ineffassign   — assignments that are never read
#   gocritic      — idiomatic Go suggestions
#   bodyclose     — unclosed http.Response.Body
#   revive        — configurable linter (replaces golint)
```
::

::code-wrapper{language="yaml"}
```yaml
# .golangci.yml — production lint config
linters:
  enable:
    - errcheck
    - staticcheck
    - ineffassign
    - gocritic
    - bodyclose
    - revive
    - gosec        # security-focused (SQL injection, weak crypto)
    - misspell
    - unconvert    # unnecessary type conversions
    - prealloc     # suggest slice preallocation in loops

linters-settings:
  staticcheck:
    checks: ["all", "-ST1000"]  # all checks except "incorrect doc comment"
  errcheck:
    check-type-assertions: true  # v, _ := x.(T) — flag the ignored ok
  gosec:
    excludes:
      - G104  # disable "audit errors not checked" (too noisy, handle per-case)

issues:
  max-issues-per-linter: 0  # no limit — show all
  max-same-issues: 0
```
::

## Multi-Module Workspaces (`go work`)

::code-wrapper{language="bash"}
```bash
# When developing multiple modules simultaneously (e.g., app + a local
# fork of a library), `go work` replaces `replace` directives in go.mod.

mkdir workspace && cd workspace
go work init ./myapp ./lib/mylib
# Creates go.work:
#   go 1.22
#   use ./myapp
#   use ./lib/mylib

# Now `go build` in ./myapp resolves imports of example.com/mylib
# to the LOCAL ./lib/mylib — no `replace` directive needed in go.mod.
# go.work is NOT committed (it's developer-local) — add to .gitignore.

go work sync   # propagate go.work module versions back to go.mod files
```
::

::code-wrapper{language="go"}
```go
// ❌ ANTI-PATTERN: using `replace` in go.mod for local dev
// replace example.com/mylib => ../lib/mylib   // pollutes go.mod, breaks CI

// ✅ CORRECT: use go.work for local dev, keep go.mod clean
// go.work (local, gitignored):
//   use ./myapp
//   use ../lib/mylib
// go.mod stays: require example.com/mylib v1.2.3  // real version for CI
```
::

## Reproducible Builds

::code-wrapper{language="bash"}
```bash
# Two builds from the same source should produce byte-identical binaries.
# Without these flags, the binary embeds absolute paths and build timestamps.

# -trimpath: removes /Users/you/project from file paths in stack traces
# -ldflags='-s -w': strip symbol table (-s) and DWARF debug info (-w)
# -buildvcs=false: don't embed git hash (or do, if you want traceability)
# -mod=readonly: don't auto-modify go.mod/go.sum during build

CGO_ENABLED=0 go build \
  -trimpath \
  -ldflags='-s -w -X main.Version=v1.0.0 -X main.Commit=$(git rev-parse --short HEAD)' \
  -mod=readonly \
  -o bin/myapp

# -X injects a value into a string variable at link time:
#   var Version = "dev"  // in main.go
#   → becomes "v1.0.0" in the binary
```
::

::code-wrapper{language="go"}
```go
// main.go — version injection via -ldflags -X
package main

var (
	Version = "dev"    // overridden by -ldflags '-X main.Version=...'
	Commit  = "none"   // overridden by -ldflags '-X main.Commit=...'
	Date    = "unknown"
)

func main() {
	fmt.Printf("myapp %s (commit: %s, built: %s)\n", Version, Commit, Date)
}
```
::

## Docker — Multi-Stage Build

::code-wrapper{language="dockerfile"}
```dockerfile
# Multi-stage build: compile in a full Go image, copy binary to scratch.
# Final image ~10-20MB (vs ~800MB for a full Debian image).

# ---------- Build stage ----------
FROM golang:1.22-alpine AS builder

WORKDIR /src

# Cache deps — copy go.mod/go.sum first, download, then copy source.
# This layer is cached unless go.mod/go.sum change.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build with reproducible flags + CGO disabled for static binary.
RUN CGO_ENABLED=0 go build \
    -trimpath \
    -ldflags='-s -w -X main.Version=$(git describe --tags --always)' \
    -o /bin/myapp \
    ./cmd/myapp

# ---------- Runtime stage (scratch = empty image, ~0MB) ----------
FROM scratch

# Copy CA certs (needed for HTTPS — scratch has none).
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy the binary.
COPY --from=builder /bin/myapp /myapp

# Run as non-root (UID 65534 = nobody).
USER 65534:65534

ENTRYPOINT ["/myapp"]
```
::

::code-wrapper{language="bash"}
```bash
# Build and check image size:
docker build -t myapp:latest .
docker images myapp:latest
# REPOSITORY   TAG       IMAGE ID       CREATED         SIZE
# myapp        latest    a1b2c3d4e5f6   2 seconds ago   12.3MB

# Scan for vulnerabilities:
docker scout cves myapp:latest
```
::

## 💡 Tips & Tricks

- **Performance**: set `GOFLAGS=-trimpath` in your environment or CI to always strip paths — smaller binaries, no leaked developer paths in stack traces.
- **Idiom**: `go install example.com/cmd/tool@version` installs a tool globally (Go 1.16+). Don't use `go get` for tools — it no longer installs binaries.
- **Idiom**: use `go tool cover -func=coverage.out` for a summary and `-html=coverage.out` for a visual report. Gate CI on coverage: `go test -coverprofile=c.out ./... && go tool cover -func=c.out | grep -v 100.0% && exit 1` (fails if any func < 100%).
- **Debug**: `go test -json ./... | tparse` — machine-readable test output, parsed by `tparse` or `gotestsum` for CI dashboards. Faster to identify failures in large suites.
- **Portability**: `GOFLAGS=-mod=mod` allows auto-updating go.mod during builds (dev convenience); `GOFLAGS=-mod=readonly` fails if go.mod needs changes (CI safety). Default in Go 1.16+ is `-mod=readonly`.
- **Debug**: `go build -gcflags='-m'` shows escape analysis decisions — which variables are heap-allocated vs stack-allocated. Critical for zero-allocation hot paths. Use `-gcflags='-m -m'` for verbose reasoning.
- **Debug**: `go tool nm bin/myapp | grep 'main\.'` lists all symbols in `main` — useful for verifying `-ldflags -X` injection worked and finding unexpected code bloat.
- **Performance**: `go build -ldflags='-s -w'` strips ~30% of binary size (debug info + symbols). You lose `pprof` symbolization and stack traces become less detailed — use only for production release binaries.

## ⚠️ Edge Cases & Gotchas

- **`go run` compiles to a temp dir**: `go run .` creates a temp binary, runs it, and deletes it. Every invocation recompiles. Use `go build` for repeated runs; `go run` is for one-off scripts. `go run` also doesn't pass signals correctly to the child in some shells.
- **Module path must be globally unique**: if you publish a library, the module path must be unique (GitHub URL or custom domain). `example.com/myapp` is fine for private code but will collide if someone tries to `go get` it.
- **`GOPATH` mode is legacy**: some old docs assume code lives in `~/go/src/...`. Modern Go (1.11+) uses modules anywhere. Don't put your code in `$GOPATH/src` — it can cause import path confusion.
- **Tabs, not spaces**: Go uses tabs for indentation (enforced by `gofmt`). If your editor inserts spaces, `gofmt` rewrites them. Configure your editor: `"editor.insertSpaces": false` for `.go` files.
- **CGO and cross-compilation**: `GOOS=... go build` works for pure Go. If your code imports CGO (e.g., `go-sqlite3`), you need a C cross-compiler. `CGO_ENABLED=0` disables CGO but then CGO packages won't compile at all.
- **`go install` vs `go build`**: `go install` puts the binary in `$GOBIN`/`$GOPATH/bin` (global); `go build` puts it in the current directory. `go install` is for installing tools globally; `go build` is for project binaries.
- **Private modules**: `go get` from a private repo needs `GOPRIVATE=github.com/yourorg/*` so the Go tool doesn't try the public proxy (which returns 404). Also configure git auth (`~/.netrc` or SSH key).
- **Pseudo-versions**: `go get foo@main` creates a pseudo-version like `v0.0.0-20240115120000-abcdef123456`. These are mutable (the commit `main` points to changes). For reproducibility, always pin to a tagged version or a specific pseudo-version in `go.mod`.
- **`go.sum` entries can be missing**: if `go mod tidy` hasn't run, `go.sum` may lack hashes for transitive deps' go.mod files, causing `go build` to fail with "missing go.sum entry". Run `go mod tidy`.
- **Build cache (`$GOCACHE`)**: Go caches compiled objects. If builds are mysteriously slow, `go clean -cache` clears it. In CI, cache `$GOCACHE` between runs for 5-10x faster builds.
- **`go.mod` `go` directive is a minimum**: `go 1.22` means "this module requires Go 1.22+ features." If you build with Go 1.21, it fails (or auto-downloads 1.22 via GOTOOLCHAIN). It's not the exact version you're using.

## 🧠 Quick Quiz

What's wrong with this CI build command?

::code-wrapper{language="bash"}
```bash
go get github.com/new/dep@latest
go build -o myapp
docker push myapp:latest
```
::

<details>
<summary>Answer</summary>

Three problems:

1. **`go get` in CI modifies `go.mod`/`go.sum`** — it updates the dependency to `@latest`, which may be a different version on every CI run. This breaks reproducibility. Dependencies should be pinned in `go.mod` (committed) and CI should run `go build -mod=readonly`.

2. **No `-trimpath` / `-ldflags`** — the binary embeds the build machine's absolute paths and full debug info. Stack traces leak developer directory structures, and the binary is 30% larger than needed.

3. **`docker push` without a tag or digest pin** — `latest` is mutable. Every push overwrites it. Use semantic version tags (`myapp:v1.2.3`) or commit-SHA tags (`myapp:sha-abc123`) for traceability.

**Correct CI build:**
```bash
go mod download              # use pinned go.mod, no network mutation
CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -mod=readonly -o myapp
docker build -t myapp:$(git describe --tags) .
docker push myapp:$(git describe --tags)
```

</details>

## 📚 What's Next

→ [02 — Hello World & `go` Command](/go/02-hello-world-and-go-command) — package anatomy, `go run`/`build`/`test`/`fmt`/`vet` in depth, and the compilation pipeline.