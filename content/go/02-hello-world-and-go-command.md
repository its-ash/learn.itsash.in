# 02 — Hello World & the go Command

This chapter unpacks the "Hello, World" program, the `go` command's key subcommands, and the structure of a Go package.

## The Program, Line by Line

::code-wrapper{language="go"}
```go
package main

import "fmt"

func main() {
	fmt.Println("Hello, World!")
}
```
::

- **`package main`** — declares this file belongs to the `main` package. `package main` with a `func main()` is an executable; all other packages are libraries.
- **`import "fmt"`** — imports the `fmt` package (formatted I/O). Imports must be used — unused imports are a compile error.
- **`func main()`** — the entry point. No arguments, no return value. `os.Args` gives command-line arguments.
- **`fmt.Println(...)`** — prints with a trailing newline. `fmt.Print` (no newline), `fmt.Printf` (formatted).

## Package Declarations

Every Go file starts with a `package` declaration:

::code-wrapper{language="go"}
```go
package mypackage

// All files in this directory must declare the same package
// (except `_test.go` files which can use `package mypackage_test` for external tests).
```
::

- A package is a directory — all `.go` files in a directory share the same package name (with the `_test` exception).
- The package name is usually the last segment of the import path (`github.com/x/y/handlers` → `package handlers`).
- `package main` is special — it's an executable, not a library.

## Imports

::code-wrapper{language="go"}
```go
import "fmt"

import (
	"os"
	"strings"

	"github.com/lib/pq"
)
``
::

- Single imports can be one line; multiple imports go in a parenthesized block.
- Imports are grouped: standard library, then a blank line, then third-party. `gofmt`/`goimports` enforces this.
- Unused imports are a **compile error** — Go doesn't allow dead imports.
- `import . "fmt"` (dot import) makes `fmt`'s exports available without the `fmt.` prefix — discouraged (only used in tests).
- `import _ "github.com/lib/pq"` (blank import) runs the package's `init()` functions but doesn't bind the name — used for side effects (e.g., registering a database driver).

## `func main` and Command-Line Arguments

::code-wrapper{language="go"}
```go
package main

import (
	"fmt"
	"os"
)

func main() {
	// os.Args[0] is the program name; [1:] are the arguments
	args := os.Args[1:]
	fmt.Println("Args:", args)

	if len(args) < 1 {
		fmt.Fprintln(os.Stderr, "usage: myapp <name>")
		os.Exit(1)
	}
	fmt.Printf("Hello, %s!\n", args[0])
}
``
::

For flag parsing, use the `flag` package (chapter 21) or `os.Args` directly for simple cases. `os.Exit(n)` exits with status `n` (0 = success).

## The `go` Command In Depth

### `go run`

Compiles and runs immediately, without leaving a binary:

::code-wrapper{language="bash"}
```bash
go run .               # run the current directory's main package
go run main.go         # run a specific file
go run -race .         # run with the race detector (for concurrency bugs)
```
::

`go run` compiles to a temp directory. Useful for development; use `go build` for production.

### `go build`

Compiles to a binary:

::code-wrapper{language="bash"}
```bash
go build               # builds ./myapp (named after the directory)
go build -o myapp      # builds to ./myapp
go build ./...         # builds all packages in the module
go build -ldflags="-s -w" -o myapp   # strip debug info for a smaller binary
GOOS=linux go build -o myapp-linux   # cross-compile
``
::

`-ldflags="-s -w"` strips the symbol table and debug info — smaller binary, no stack traces with function names (use sparingly). `-ldflags="-X main.version=1.0.0"` injects a value at build time (useful for versioning).

### `go install`

Compiles and installs to `$GOBIN` (or `$GOPATH/bin`):

::code-wrapper{language="bash"}
```bash
go install              # installs the current module's main package
go install golang.org/x/tools/cmd/goimports@latest   # installs a tool
``
::

`go install ...@version` (Go 1.16+) installs a tool at a specific version without adding it to your module's `go.mod`. Useful for developer tools (`golangci-lint`, `goimports`, `dlv`).

### `go test`

::code-wrapper{language="bash"}
```bash
go test                 # test the current package
go test ./...           # test all packages in the module
go test -v              # verbose — show each test
go test -race           # race detector
go test -run TestX      # run only matching tests
go test -bench=.        # run benchmarks
go test -cover          # coverage report
go test -coverprofile=c.out  # write coverage to file, then: go tool cover -html=c.out
go test -fuzz=FuzzX     # run a fuzz target (Go 1.18+)
```
::

See chapter 25 for testing in depth.

### `go fmt` and `go vet`

::code-wrapper{language="bash"}
```bash
gofmt -w .              # format all files in place
go fmt ./...            # format all packages (alias for gofmt -l -w)
go vet ./...            # static analysis
``
::

`gofmt` is the canonical formatter. `go vet` catches mistakes the compiler doesn't (see chapter 01 tips). Run both in CI.

### `go mod`

::code-wrapper{language="bash"}
```bash
go mod init example.com/myapp   # create go.mod
go mod tidy                     # add missing, remove unused deps
go mod why github.com/lib/pq    # why is this dependency needed?
go mod graph                    # dependency graph
go mod download                 # download deps to cache
go mod verify                   # verify checksums
```
::

### `go doc`

::code-wrapper{language="bash"}
```bash
go doc fmt.Println            # doc for a function
go doc fmt                    # doc for a package
go doc -all fmt               # all exports
``
::

Faster than pkg.go.dev for quick lookups.

### `go get` and `go add`

::code-wrapper{language="bash"}
```bash
go get github.com/lib/pq@latest   # upgrade to latest
go get github.com/lib/pq@v1.10.0  # pin to a version
go get github.com/lib/pq@v1.10.0  # add a new dependency (Go 1.16+ also adds the import)
go mod tidy                       # clean up after removing imports
``
::

Since Go 1.17, adding an `import` in your code and running `go mod tidy` is the idiomatic way to add a dependency — `go get` is mainly for upgrading.

### `go work` (multi-module workspaces, Go 1.18+)

::code-wrapper{language="bash"}
```bash
go work init ./myapp ./mylib    # create a go.work file
go work use ./another           # add a module to the workspace
``
::

`go work` lets you develop multiple modules simultaneously with local edits, without `replace` directives in `go.mod`. Useful for monorepos or when developing a library and an app together.

## Build Tags (Conditional Compilation)

::code-wrapper{language="go"}
```go
//go:build linux || darwin
// +build linux darwin   // legacy syntax (pre-1.17)

package mypackage

// This file is only compiled on Linux or macOS.
``
::

Build tags let you include/exclude files based on GOOS, GOARCH, or custom tags. The new `//go:build` syntax (Go 1.17+) supports boolean expressions; the legacy `// +build` syntax still works but is deprecated.

::code-wrapper{language="bash"}
```bash
go build -tags="debug"   # build with the "debug" tag
``
::

## The `init()` Function

::code-wrapper{language="go"}
```go
package mypackage

var config Config

func init() {
	// Runs once, after package-level vars are initialized, before main().
	// Used for setup that must happen at startup.
	config = loadConfig()
}

func init() {
	// Multiple init() functions per file are allowed; they run in declaration order.
}
``
::

`init()` runs automatically, in dependency order (imported packages' `init` first). It's overused — prefer explicit initialization passed from `main`. Reserve `init()` for things that *must* happen at package load (e.g., registering a driver via a blank import).

## 💡 Tips & Tricks

- **Idiom**: add `import "..."` in your code, then run `go mod tidy` — this is the modern way to add dependencies (Go 1.17+). Reserve `go get pkg@version` for upgrading or pinning; `go mod tidy` keeps `go.mod`/`go.sum` in sync with actual imports.
- **Idiom**: use `-ldflags="-X main.version=$VERSION"` to inject the version at build time — `var version = "dev"` in your code, overridden by the linker in CI, so `myapp -version` reports the build version without hardcoding it.
- **Idiom**: use `go work` (Go 1.18+) when developing a library and an app together — it lets local edits to the library take effect in the app without `replace` directives in `go.mod` (which you'd have to remove before publishing).
- **Debug**: `go test -race` in development and CI — the race detector catches data races (concurrent reads/writes without synchronization) that are nearly impossible to find by inspection. It has overhead, so don't use it in production, but always in testing.
- **Idiom**: avoid `init()` for anything that can be done in `main()` — explicit initialization passed as arguments is testable and visible; `init()` is hidden, runs at import time, and makes packages harder to reason about. Reserve it for genuine package-load side effects (driver registration).

## ⚠️ Edge Cases & Gotchas

- **Unused imports are a compile error**: `import "fmt"` without using `fmt` fails the build. This is deliberate (dead code). `goimports` removes unused imports automatically.
- **Unused local variables are a compile error**: `x := 5` without reading `x` fails. (Unused *package-level* variables are allowed — they might be used by other files.)
- **Capitalization = visibility**: `Println` (capital) is exported; `println` (lowercase) is package-private. This is the only visibility mechanism — no `public`/`private` keywords. Convention: `camelCase` for private, `PascalCase` for exported.
- **`package main` must have `func main()`**: a `main` package without `main` is a build error ("function main is undeclared").
- **Multiple `main` files**: a directory with multiple `.go` files all in `package main` is fine — they're compiled together. But you can't have two `func main()` in the same package.
- **`go run main.go` vs `go run .`**: `go run main.go` runs only `main.go` (ignoring other files in the package — fails if `main` calls functions in other files). `go run .` runs the whole package. Use `go run .` for multi-file packages.
- **Build tags and file naming**: a file named `foo_linux.go` is automatically excluded on non-Linux (the `_GOOS` suffix is a build constraint). Use this for platform-specific code, but prefer explicit `//go:build` tags for clarity.
- **`init()` order across files**: within a package, `init()` functions run in the order files are presented to the compiler (typically alphabetical by filename). Don't rely on cross-file `init()` order — combine into one `init()` if order matters.
- **`go build` output name**: `go build` in a directory `myapp/` produces `myapp` (or `myapp.exe` on Windows), named after the directory, not the module. `go build -o name` overrides.
- **`go install pkg@latest` outside a module**: in Go 1.16+, `go install pkg@version` works outside a module (installs to `$GOBIN`). But `go get pkg@version` outside a module is disabled (to avoid polluting `go.mod`).

## 🧠 Spot the Bug

A developer has two files in a directory, both `package main`:

::code-wrapper{language="go"}
```go
// main.go
package main

import "fmt"

func main() {
	fmt.Println(greet())
}
```
::
::code-wrapper{language="go"}
```go
// greet.go
package main

func greet() string {
	return "Hello"
}
```
::

They run `go run main.go` and get "function greet is undeclared." Why?

<details>
<summary>Answer</summary>

`go run main.go` compiles and runs *only* `main.go` — it doesn't include `greet.go`. So `greet` is undefined, and the build fails.

The fix: run the whole package, not a single file:

```bash
go run .   # includes all .go files in the current directory's package
```
::
Or list all files:

```bash
go run main.go greet.go
```
::
`go run .` (or `go build .`) is the right way to run a multi-file package — it compiles all files in the package together. `go run main.go` is only for single-file programs (or when you explicitly want a subset, which is rare).

**The lesson**: `go run file.go` runs only that file; `go run .` runs the whole package. For multi-file packages (the norm), always use `go run .` / `go build .`.

</details>

## Summary

You understand `package main`/`func main`/imports, the `go` command's key subcommands (`run`/`build`/`install`/`test`/`fmt`/`vet`/`mod`/`work`), build tags, `init()`, and how to add dependencies. Next: variables, constants, and types.