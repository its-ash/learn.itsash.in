# 01 — Introduction & Setup

## Why Go?

Go (or Golang) is a statically typed, compiled language designed at Google by Robert Griesemer, Rob Pike, and Ken Thompson. Key characteristics:

- **Simple and readable** — small keyword set, explicit over clever, one way to do things.
- **Compiled and fast** — native machine code, startup in milliseconds, performance near C.
- **Statically typed** — types catch bugs at compile time, but type inference (`:=`) keeps code concise.
- **Garbage collected** — no manual memory management; concurrent GC with low pause times.
- **First-class concurrency** — goroutines and channels make concurrent programming straightforward.
- **Strong standard library** — HTTP, JSON, crypto, compression, testing — batteries included.
- **Fast compilation** — large projects compile in seconds; no header files, no Makefiles for module-based projects.
- **Single binary output** — `go build` produces a static binary with no runtime dependencies.
- **Cross-compilation** — `GOOS=linux GOARCH=arm64 go build` cross-compiles from any host.

## The Go Philosophy

Go prioritizes **simplicity and team scalability** over language feature richness. It deliberately omits features common in other languages:

- No classes / inheritance (use structs + composition + interfaces).
- No exceptions (use explicit `error` returns).
- No generics until 1.18 (now present, but deliberately minimal).
- No implicit conversions (all conversions are explicit).
- No operator overloading.

The result is a language that's easy to read, easy to onboard new team members into, and hard to write "clever" unmaintainable code in. Go optimizes for the *long-term cost* of code, not the *short-term expressiveness* of the writer.

## Installing Go

### macOS

::code-wrapper{language="bash"}
```bash
brew install go
go version    # go version go1.22.0 darwin/amd64
``
::

### Linux

::code-wrapper{language="bash"}
```bash
wget https://go.dev/dl/go1.22.0.linux-amd64.tar.gz
sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf go1.22.0.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc
go version
``
::

### Windows

Download the MSI installer from [go.dev/dl](https://go.dev/dl) and run it. Or use `winget`:

::code-wrapper{language="bash"}
```bash
winget install GoLang.Go
``
::

### Verify

::code-wrapper{language="bash"}
```bash
go version
go env GOPATH GOROOT GOMODCACHE
``
::

## The `go` Command

The `go` command is the single entry point for building, testing, and managing Go code:

| Command | Purpose |
|---|---|
| `go run .` | Compile and run immediately (no binary saved). |
| `go build` | Compile to a binary (in the current directory or `bin/`). |
| `go build -o myapp` | Compile to a named binary. |
| `go install` | Compile and install to `$GOBIN`/`$GOPATH/bin`. |
| `go test` | Run tests. |
| `go test -bench=.` | Run benchmarks. |
| `go test -race` | Run with the race detector. |
| `go fmt` | Format code (the canonical format). |
| `go vet` | Run static analysis for common mistakes. |
| `go mod init` | Initialize a new module. |
| `go mod tidy` | Add missing / remove unused dependencies. |
| `go get` | Add/upgrade a dependency. |
| `go doc fmt.Println` | Show documentation. |
| `go env` | Show Go environment variables. |
| `go clean` | Remove build artifacts. |
| `go work` | Multi-module workspace (Go 1.18+). |

## Modules and the Workspace

Go 1.16+ uses **modules** for dependency management (replacing the old `GOPATH`-based workflow). A module is a collection of Go packages with a `go.mod` file at its root.

::code-wrapper{language="bash"}
```bash
# Create a new module
mkdir myapp && cd myapp
go mod init example.com/myapp
# Creates go.mod:
#   module example.com/myapp
#   go 1.22

# Add a dependency
go get github.com/lib/pq

# Tidy dependencies (add missing, remove unused)
go mod tidy
```
::

`go.mod` records the module path and Go version. `go.sum` records cryptographic hashes of dependencies for reproducibility. Both should be committed to version control.

### The module path

The module path (`example.com/myapp`) is the unique identifier for your module and the import prefix for its packages. If you're building a library others will import, it should be a path that you control (a GitHub repo, a custom domain). For a private application, any unique path works.

### `GOPATH`, `GOROOT`, `GOMODCACHE`

- `GOROOT` — where the Go installation lives (the standard library source).
- `GOPATH` — workspace for old-style code and `go install`'d binaries (default `~/go`).
- `GOMODCACHE` — where downloaded modules are cached (default `$GOPATH/pkg/mod`).

You rarely need to set these manually — the defaults work. `go env` shows the current values.

## Project Layout

Go has a conventional layout (not enforced, but common):

::code-wrapper{language="text"}
```text
myapp/
├── go.mod
├── go.sum
├── main.go              # package main — the entry point
├── cmd/                 # multiple binaries (optional)
│   └── myapp/
│       └── main.go
├── internal/            # packages only importable within this module
│   └── handlers/
├── pkg/                 # packages importable by other modules
│   └── api/
├── test/                # integration tests (outside packages)
└── README.md
```
::

`internal/` is enforced by the Go toolchain — packages under `internal/` can only be imported by code within the parent of `internal/`. It's the way to keep implementation details private to your module.

## A First Program

::code-wrapper{language="go"}
```go
package main

import "fmt"

func main() {
	fmt.Println("Hello, Go!")
}
```
::

Save as `main.go`, then:

::code-wrapper{language="bash"}
```bash
go run .
# Hello, Go!
``
::

Every Go program starts in `package main`'s `func main()`. `fmt.Println` prints to stdout with a newline. Note the **tabs** — `gofmt` enforces tabs for indentation; spaces will be reformatted.

## Cross-Compilation

::code-wrapper{language="bash"}
```bash
# Build a Linux binary from macOS
GOOS=linux GOARCH=amd64 go build -o myapp-linux

# Build for ARM (e.g., Raspberry Pi)
GOOS=linux GOARCH=arm64 go build -o myapp-arm

# Build for Windows
GOOS=windows GOARCH=amd64 go build -o myapp.exe
```
::

Go's cross-compilation is built in — no cross-toolchain needed (for pure-Go code; CGO requires a cross-compiler).

## 💡 Tips & Tricks

- **Idiom**: run `go fmt` (or `gofmt -w .`) on every save — Go has one canonical format, and the formatter enforces it. IDEs with the Go extension do this automatically. Never argue about formatting in Go — there's only one way.
- **Idiom**: run `go vet` in CI and locally — it catches common mistakes (impossible conditions, misused `Printf` verbs, struct tags, lock copies) that the compiler doesn't. It's fast and nearly always right.
- **Idiom**: use `internal/` for packages that shouldn't be imported outside your module — the toolchain enforces the boundary, so you don't need to document "don't use this." Reserve `pkg/` for genuinely public, reusable packages.
- **Idiom**: `go mod tidy` before every commit — it adds missing dependencies and removes unused ones, keeping `go.mod`/`go.sum` accurate. A CI check that runs `go mod tidy && git diff --exit-code` prevents drift.
- **Debug**: `go doc <pkg>.<Func>` from the terminal is faster than opening a browser for stdlib docs — `go doc fmt.Printf` shows the signature and usage right in your editor's terminal.

## ⚠️ Edge Cases & Gotchas

- **Go version in `go.mod`**: the `go 1.22` line is a *minimum version* directive — it controls language features (e.g., the 1.22 `for` loop scoping) and the minimum toolchain, not the exact version you're using. Go 1.21+ introduced toolchain directives for automatic toolchain management.
- **Module path must be unique**: if you publish a library, the module path must be globally unique (a GitHub URL or custom domain). `example.com/myapp` is fine for private code but will collide if published.
- **`GOPATH` mode is legacy**: some old docs assume `GOPATH`-based development (code in `~/go/src/...`). Modern Go uses modules anywhere — don't put your code in `$GOPATH/src`.
- **Tabs vs spaces**: Go uses **tabs** for indentation (enforced by `gofmt`). If your editor inserts spaces, `gofmt` will rewrite them — configure your editor to use tabs for Go.
- **`go run` compiles to a temp dir**: `go run .` compiles to a temp directory and runs, leaving no binary. Use `go build` for a persistent binary. `go run` is for quick executions; don't use it in production.
- **CGO and cross-compilation**: `GOOS=... go build` works for pure Go, but if your code imports CGO (e.g., `github.com/mattn/go-sqlite3`), you need a C cross-compiler (`CGO_ENABLED=1` with the right toolchain). `CGO_ENABLED=0` disables CGO (pure Go, easy cross-compile, but can't use CGO packages).
- **`go install` vs `go build`**: `go install` puts the binary in `$GOBIN` (or `$GOPATH/bin`); `go build` puts it in the current directory. `go install` is for installing tools globally; `go build` is for project binaries.
- **Private modules**: `go get` from a private repo needs `GOPRIVATE=github.com/yourorg/*` (or `GOINSECURE`/`.gitconfig` auth) so the Go tool doesn't try the public proxy. Without it, `go get` fails with a 404.

## 🧠 Spot the Bug

A developer creates a module, writes `main.go`, and runs `go run .`, but gets "package main is not a main package" or "function main is undeclared." What are the likely causes?

::code-wrapper{language="go"}
```go
// main.go
package main

import "fmt"

func Main() {
	fmt.Println("Hello")
}
```
::

<details>
<summary>Answer</summary>

The function is named `Main`, not `main` — Go is case-sensitive, and the entry point must be exactly `func main()` (lowercase) in `package main`. `Main` is just a regular function, so the program has no entry point, and the linker errors.

Other common causes of "not a main package":
- `package main` is misspelled or the file declares a different package (`package myapp`).
- The file is in a subdirectory run as `go run .` but the subdirectory's package isn't `main`.
- There are multiple files in the package but `main` is in a file that's excluded by build tags.

The fix:

```go
package main

import "fmt"

func main() {   // lowercase, exactly "main"
	fmt.Println("Hello")
}
```

**The lesson**: Go's entry point is `func main()` (exactly) in `package main` (exactly). Case matters — `Main`/`MAIN` are not `main`.

</details>

## Recommended Environment

- **Go 1.22+** for modern features (loop variable scoping, `go` toolchain management).
- **VS Code + the Go extension** (gopls for language server, dlv for debugging, automatic `gofmt`/`gopls` on save).
- **`golangci-lint`** for additional linters beyond `go vet` (recommended for CI).

## Summary

You now have Go installed, understand the module system and the `go` command, and can run a "Hello, World." Next: the `go` command in depth and the anatomy of a Go program.