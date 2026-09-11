---
title: "02 — Package Anatomy & the go Command"
description: "Package layout, import resolution, init() ordering, the compilation pipeline, and production go-command flags — beyond hello world."
---

# 02 — Package Anatomy & the go Command

This chapter goes into package mechanics, the compiler/linker pipeline, `init()` execution order, and the `go` subcommands you use daily in production.

## The Compilation Pipeline

::code-wrapper{language="go"}
```go
// ┌─────────────────────────────────────────────────────────────────────┐
// │  source.go                                                         │
// │    ↓ go tool compile (per package, parallel)                       │
// │  source.o (object file) + source.a (archive)                      │
// │    ↓ go tool link (single-threaded, deduplicates archives)         │
// │  binary (ELF on linux, Mach-O on darwin, PE on windows)            │
// │    ↓ runtime boots: scheduler, GC, stack growth, netpoller         │
// │  main.main() runs                                                  │
// └─────────────────────────────────────────────────────────────────────┘
//
// The compiler is split into phases:
//   1. Parse (go/scanner → go/parser → AST)
//   2. Type check (go/types — resolves types, checks assignments)
//   3. SSA (Static Single Assignment — optimization IR)
//   4. Code generation (machine code per GOARCH)
//
// Inter-package dependencies are compiled in topological order.
// Circular imports are detected in phase 2 → compile error.
```
::

### Examining the binary

::code-wrapper{language="bash"}
```bash
# What's inside the binary?
go tool nm bin/myapp | head                  # list all symbols
go tool nm bin/myapp | grep -c 'runtime\.'   # count runtime symbols

# Disassemble a function (reads the binary, not source):
go tool objdump -s 'main\.runServer' bin/myapp

# Check if a binary is statically linked (no dynamic deps):
file bin/myapp
# bin/myapp: ELF 64-bit LSB executable, x86-64, statically linked, ...

# List dynamic dependencies (should be empty for CGO_ENABLED=0):
ldd bin/myapp 2>&1
# not a dynamic executable

# Build info — module versions embedded in the binary:
go version -m bin/myapp
#   go1.22.0
#   path    example.com/myapp
#   mod     github.com/lib/pq  v1.10.0
#   dep     golang.org/x/net   v0.20.0
#   build   -trimpath          (build flag)
#   build   CGO_ENABLED=0
#   build   GOOS=linux
```
::

## Package Anatomy

::code-wrapper{language="go"}
```go
// A package = all .go files in one directory with the same `package` clause.
// Internal structure conventions:

// ---- exported.go ----
package user                       // package name (matches last import path segment)

import (                           // imports grouped: stdlib, blank line, third-party
	"context"
	"database/sql"
	"errors"

	"github.com/lib/pq"
)

// Exported types (PascalCase) — visible to importers.
type User struct {
	ID    int64
	Email string
}

// Exported function.
func Fetch(ctx context.Context, db *sql.DB, id int64) (*User, error) {
	// ...
	return &User{}, nil
}

// ---- internal.go ---- (same package, same directory)
package user

var errNotFound = errors.New("user: not found")   // unexported — package-private

func validateEmail(s string) bool {                // unexported
	return s != ""
}
```
::

### Package naming rules

::code-wrapper{language="go"}
```go
// The package name should be:
//   - short, lowercase, single word (no underscores, no mixedCase)
//   - NOT "util", "common", "helpers" (too generic — what's inside?)
//   - NOT the same as a common variable name (avoids shadowing)
//
// Good:   user, httpclient, ratelimiter, config, migrator
// Bad:    util, common, lib, myPackage, data_structures

// Import path vs package name can differ — but shouldn't:
//   import "github.com/x/y/user"   →  package user ✅
//   import "github.com/x/y/users"  →  package user ✅ (path plural, name singular)
//   import "github.com/x/y/foo"    →  package bar   ❌ (confusing — rename)
```
::

### Import aliases

::code-wrapper{language="go"}
```go
import (
	// Alias when the package name collides or is unclear:
	stdjson "encoding/json"          // stdjson.Marshal — avoids collision with a var
	_ "github.com/lib/pq"            // blank import — runs init() for side effects only
	. "github.com/stretchr/testify/assert"  // dot import — assert.Equal(t, ...) (tests only!)
)

// Blank import pattern — registers a database/sql driver:
//   import _ "github.com/lib/pq"
// pq's init() calls sql.Register("postgres", &Driver{}), making it available
// to sql.Open("postgres", ...) without referencing pq directly.

// Dot import — DANGEROUS in production code (pollutes namespace, unclear origin).
// Acceptable ONLY in test files for assertion libraries.
```
::

## `init()` — Execution Order and Why It's Dangerous

::code-wrapper{language="go"}
```go
// ┌─────────────────────────────────────────────────────────────────────┐
// │ init() execution order (guaranteed by the runtime):                │
// │   1. All imported packages' init()s run first (depth-first)        │
// │   2. Package-level var initializers run (in declaration order)     │
// │   3. All init() functions in THIS package run (in file order,      │
// │      then declaration order within a file)                         │
// │   4. main() runs                                                   │
// │                                                                    │
// │ ⚠️ Cross-file init() order = alphabetical by filename (not         │
// │    guaranteed by spec, but this is what the toolchain does).       │
// │    NEVER rely on cross-file init() order — merge into one init()   │
// │    if order matters.                                               │
// └─────────────────────────────────────────────────────────────────────┘

package database

var (
	pool    *ConnectionPool    // initialized in init()
	driver  string
)

func init() {
	// Runs ONCE per process, after package vars, before main.
	// Multiple init()s per file are allowed (run in order).
	pool = NewConnectionPool(10)
	driver = "postgres"
}

func init() {
	// Second init() in same file — runs after the one above.
	if pool == nil {
		panic("database: pool not initialized")  // fail fast at startup
	}
}

// ❌ ANTI-PATTERN: init() doing I/O (file reads, network calls)
// func init() {
//     data, _ := os.ReadFile("config.yaml")  // no error handling, no context
//     config = parseYaml(data)
// }
// Problems: untestable, no error propagation, blocks startup, no way to
// pass a different config in tests.

// ✅ CORRECT: explicit initialization function called from main()
func Init(cfg Config) error {
	var err error
	pool, err = NewConnectionPool(cfg.PoolSize)
	return err  // caller handles the error
}
```
::

## The `go` Command — Production Subcommands

::code-wrapper{language="bash"}
```bash
# === BUILD ===
go build -o bin/myapp ./cmd/myapp              # build specific binary
go build ./...                                   # compile-check all packages (no binary)
go build -x ./...                                # print all compile/link commands (debug)
go build -work ./...                             # keep temp build dir (inspect intermediate)

# === TEST ===
go test ./...                                    # all packages
go test -run 'TestUser' ./internal/user/         # regex filter
go test -count=1 ./...                           # disable test result caching
go test -shuffle=on ./...                        # randomize test order (Go 1.17+)
go test -parallel=4 ./...                        # max parallel test packages
go test -timeout=30s ./...                       # fail if a package exceeds 30s
go test -fuzz=FuzzParse -fuzztime=1m ./...       # fuzz for 1 minute (Go 1.18+)
go test -coverprofile=c.out -coverpkg=./... ./...  # cross-package coverage

# === FORMAT & LINT ===
gofmt -w -s .                                    # -s = simplify (remove redundant ops)
goimports -w -local example.com/myapp .          # group local imports separately

# === MODULE ===
go mod tidy -compat=1.22                         # avoid adding go 1.23 to go.mod
go mod download                                  # pre-fetch deps (CI cache step)
go mod verify                                    # verify go.sum hashes match cache
go mod why -m github.com/lib/pq                  # trace why a dep is needed
go mod graph                                     # full dependency DAG
go mod edit -go=1.22                             # change go directive (scripting)

# === DOC ===
go doc -all fmt                                  # all exports including unexported
go doc -src fmt.Println                          # show source of the function
go doc -u fmt.printf                             # include unexported methods
```
::

### The test cache — when tests don't re-run

::code-wrapper{language="bash"}
```bash
# Go caches test results keyed on: package + source files + build flags + env.
# If nothing changed, `go test` prints "ok  example.com/myapp/pkg  (cached)"
# and doesn't re-run. This is fast but can hide flaky tests.

# Force re-run (ignore cache):
go test -count=1 ./...

# The cache is invalidated by:
#   - Any source file change in the package
#   - -race, -tags, -trimpath flag changes
#   - GOOS/GOARCH changes
#   - Env vars listed in GODEBUG (and some others)

# Cache lives in $GOCACHE:
go env GOCACHE    # /Users/you/Library/Caches/go-build
go clean -testcache   # clear only test results
go clean -cache       # clear entire build cache (recompile everything next run)
```
::

## File Naming Conventions (Implicit Build Constraints)

::code-wrapper{language="go"}
```go
// The Go toolchain applies implicit build constraints based on filename:
//
//   foo_linux.go       → only compiled on GOOS=linux
//   foo_darwin.go      → only compiled on GOOS=darwin
//   foo_amd64.go       → only compiled on GOARCH=amd64
//   foo_linux_arm64.go → only on linux/arm64
//   foo_test.go        → only compiled by `go test` (not in production binary)
//   foo_unix.go        → only on Unix-like (linux, darwin, etc.) — uses //go:build unix
//
// This is a NAMING convention — you don't need a //go:build tag if the
// filename already encodes the constraint. But explicit tags are clearer
// for custom tags (production, debug, fastjson).

// File: crypto_linux.go    ← implicit: only on linux
package crypto

// File: crypto_other.go    ← everything else (needs //go:build !linux)
//go:build !linux
package crypto
```
::

## `os.Args` vs `flag` vs `cobra`

::code-wrapper{language="go"}
```go
// os.Args — raw access, no parsing. Fine for single-positional-arg tools.
package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintf(os.Stderr, "usage: %s <input>\n", os.Args[0])
		os.Exit(2)  // 2 = usage error (convention), 1 = runtime error
	}
	input := os.Args[1]
	_ = input
}
```
::

::code-wrapper{language="go"}
```go
// flag — stdlib flag parser. Good for simple CLIs.
package main

import (
	"flag"
	"fmt"
	"os"
)

func main() {
	// Define flags BEFORE parsing. Defaults are used if flag is absent.
	port := flag.Int("port", 8080, "port to listen on")
	host := flag.String("host", "0.0.0.0", "bind address")
	debug := flag.Bool("debug", false, "enable debug logging")
	flag.Parse()  // parses os.Args[1:] — flags must come before positional args

	// flag.Args() = positional args (after flags)
	args := flag.Args()
	if len(args) > 0 {
		fmt.Println("positional:", args)
	}

	fmt.Printf("server: %s:%d (debug=%v)\n", *host, *port, *debug)
}
```
::

::code-wrapper{language="bash"}
```bash
# flag-style invocation:
./myapp -port=9090 -debug file1.txt file2.txt
#     port=9090, debug=true, args=[file1.txt file2.txt]

./myapp --port 9090        # -- also works (flag accepts both - and --)
./myapp -h                 # prints usage (flag generates -h/-help automatically)

# ⚠️ flag stops at the first non-flag arg:
./myapp file.txt -port=9090   # port=8080 (default!) — -port is treated as positional
```
::

::code-wrapper{language="go"}
```go
// For production CLIs with subcommands (myapp user create, myapp user delete),
// use spf13/cobra or urfave/cli. The stdlib `flag` doesn't do subcommands.
//
// cobra example (pseudo):
//   rootCmd := &cobra.Command{Use: "myapp"}
//   userCmd := &cobra.Command{Use: "user"}
//   createCmd := &cobra.Command{
//       Use:   "create",
//       Args:  cobra.ExactArgs(1),
//       Run:   func(cmd *cobra.Command, args []string) { createUser(args[0]) },
//   }
//   userCmd.AddCommand(createCmd)
//   rootCmd.AddCommand(userCmd)
//   rootCmd.Execute()
```
::

## Exit Codes

::code-wrapper{language="go"}
```go
package main

import "os"

// Exit code conventions (align with sysexits.h where possible):
//   0  — success
//   1  — general error (catch-all)
//   2  — usage error / bad flags
//   64-78 — sysexits.h codes (EX_USAGE=64, EX_DATAERR=65, EX_NOINPUT=66, ...)

func main() {
	if err := run(); err != nil {
		// NEVER call os.Exit from a function that has deferred cleanup —
		// os.Exit skips all deferred functions! Instead, return the error
		// and call os.Exit only in main().
		os.Exit(1)
	}
}

func run() error {
	// deferred functions DO run when this returns an error
	defer cleanup()
	// ...
	return nil
}

func cleanup() {
	// This runs. If os.Exit(1) were called inside run(), this would NOT run.
}
```
::

## 💡 Tips & Tricks

- **Performance**: `go build -p N` controls parallelism (N packages compiled simultaneously). Default = GOMAXPROCS. On CI with limited cores, `-p 1` serializes to reduce memory pressure.
- **Idiom**: `go test -race -count=1 -shuffle=on ./...` in CI — race detection, no cache, randomized order catches order-dependent test bugs.
- **Debug**: `go build -gcflags='all=-N -l'` disables optimizations and inlining for the entire build — required for debugging with Delve (`dlv`). Without `-N -l`, the debugger shows incorrect line numbers due to inlining.
- **Debug**: `go test -run 'TestX' -v -count=1` always re-runs with verbose output — use when debugging a single flaky test.
- **Idiom**: `go install tool@version` (Go 1.16+) installs to `$GOBIN` without modifying your module — use for developer tools (`golangci-lint`, `goimports`, `dlv`, `mockery`).
- **Portability**: `go env -w GOFLAGS=-mod=readonly` sets a persistent env var — prevents accidental go.mod modification during builds. Override per-command with `-mod=mod` when you intentionally want to add deps.
- **Debug**: `go tool trace trace.out` opens the execution tracer (requires `runtime/trace` in your code) — shows goroutine scheduling, GC pauses, and syscall blocking in a visual timeline.

## ⚠️ Edge Cases & Gotchas

- **Unused imports = compile error**: `import "fmt"` without using `fmt` fails. `goimports` fixes this automatically on save.
- **Unused local variables = compile error**: `x := 5` without reading `x` fails. (Unused *package-level* variables are fine — they might be used by other files.)
- **`go run main.go` vs `go run .`**: `go run main.go` compiles only `main.go` — fails if `main` calls functions in other files. `go run .` compiles the whole package. Always use `go run .` for multi-file packages.
- **`init()` order across files**: within a package, `init()` functions run in alphabetical filename order (toolchain behavior, not spec). Don't rely on it — merge into one `init()` if order matters.
- **`os.Exit` skips deferred functions**: calling `os.Exit` inside any function skips all deferred calls in the call stack. Always return an error to `main` and call `os.Exit` there.
- **`flag` stops at first positional arg**: `./myapp file.txt -port=9090` → `-port` is treated as positional, not parsed. Reorder: `./myapp -port=9090 file.txt`. Or use `pflag`/`cobra` which intermix.
- **Capitalization = visibility**: `Println` (capital) is exported; `println` (lowercase) is package-private. The only visibility mechanism — no `public`/`private` keywords.
- **Multiple `main` files in one directory**: fine — they compile together. But you can't have two `func main()` in the same package (compile error).
- **`go build` output name**: `go build` in `myapp/` produces `myapp` (named after the directory, not the module). `go build -o name` overrides.
- **Test binary vs production binary**: `_test.go` files are excluded from `go build` but included in `go test`. Test-only helpers go in `_test.go` files (they won't bloat the production binary).

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
package main

import "fmt"

func main() {
	defer fmt.Println("A")
	defer fmt.Println("B")
	defer fmt.Println("C")
	fmt.Println("D")
}
```
::

What's the output order?

<details>
<summary>Answer</summary>

```
D
C
B
A
```

Deferred functions run in **LIFO order** (last deferred runs first). `D` prints immediately, then defers unwind: `C`, `B`, `A`. This is critical for resource cleanup — if you `defer f.Close()` then `defer g.Close()`, `g` closes before `f` (reverse order). For nested resources, open in order, defer in the same order, and they close in reverse (innermost first) — which is what you want.

</details>

## 📚 What's Next

→ [03 — Variables, Constants & Types](/go/03-variables-constants-and-types) — zero-value semantics, untyped constants, `iota` bit flags, named types, and the shadowing trap.