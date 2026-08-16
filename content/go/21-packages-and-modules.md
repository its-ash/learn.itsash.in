# 21 — Packages & Modules

Go organizes code into **packages** (directories of related code) and **modules** (versioned collections of packages, managed by `go mod`).

## Packages

A package is a directory of `.go` files sharing the same `package` declaration:

::code-wrapper{language="text"}
```text
myapp/
├── go.mod
├── main.go              # package main
├── users/
│   ├── users.go         # package users
│   └── users_test.go    # package users (or users_test)
├── internal/
│   └── config/          # package config (only importable within myapp)
└── utils/
    └── strings.go       # package utils
```
::

- Each directory is a package; all files declare the same `package <name>`.
- Import by the full path: `import "example.com/myapp/users"`.
- Exported (capitalized) identifiers are accessible after import; unexported (lowercase) are package-private.

### Import paths and package names

The import path is the full module path + subdirectory. The package name is usually the last segment, but can differ:

::code-wrapper{language="go"}
```go
import (
	"example.com/myapp/users"        // package users
	u "example.com/myapp/users"      // alias: u.User
	. "example.com/myapp/users"      // dot: User (no prefix) — discouraged
	_ "github.com/lib/pq"            // blank: side-effect only (init())
)
```
::

## The `internal` Convention

Packages under an `internal/` directory can only be imported by code within the parent of `internal/`. The toolchain enforces this:

::code-wrapper{language="text"}
```text
example.com/myapp/
├── internal/
│   └── config/       # only importable from within example.com/myapp/...
└── users/
    └── users.go      # can import example.com/myapp/internal/config
```
::

External modules can't import `example.com/myapp/internal/config`. This is the idiomatic way to keep implementation details private.

## Modules

A module is a versioned collection of packages, defined by `go.mod`:

::code-wrapper{language="bash"}
```bash
go mod init example.com/myapp
```
::

::code-wrapper{language="text"}
```text
// go.mod
module example.com/myapp

go 1.22

require (
	github.com/lib/pq v1.10.0
	github.com/gin-gonic/gin v1.7.0
)
```
::

- `module example.com/myapp` — the module path (unique identifier + import prefix).
- `go 1.22` — the minimum Go version.
- `require` — dependencies with versions.
- `go.sum` — cryptographic hashes of dependencies for reproducibility.

### Adding and upgrading dependencies

::code-wrapper{language="bash"}
```bash
# Add a dependency (modern way: import in code, then tidy)
import "github.com/lib/pq"
go mod tidy

# Or get explicitly
go get github.com/lib/pq@latest
go get github.com/lib/pq@v1.10.9   # specific version

# Upgrade all
go get -u ./...

# Downgrade
go get github.com/lib/pq@v1.10.0
```
::

### Semantic Import Versioning

Go follows **semantic versioning** for modules:
- `v1.x.y` — import as `github.com/x/y` (no version in path).
- `v2.x.y` and above — import as `github.com/x/y/v2` (version in path). This is a **major version** suffix, required for v2+.

This means upgrading to v2 requires changing import paths — deliberate, to prevent accidental breaking changes.

### `go mod tidy`

::code-wrapper{language="bash"}
```bash
go mod tidy   # add missing deps, remove unused, update go.sum
``
::

Run this before every commit. A CI check (`go mod tidy && git diff --exit-code`) prevents drift.

### `go mod` subcommands

| Command | Purpose |
|---|---|
| `go mod init` | Create go.mod. |
| `go mod tidy` | Sync deps with imports. |
| `go mod download` | Download deps to cache. |
| `go mod verify` | Verify checksums. |
| `go mod why pkg` | Why is `pkg` required? |
| `go mod graph` | Dependency graph. |
| `go mod edit` | Edit go.mod programmatically. |

## Workspaces (`go work`, Go 1.18+)

For multi-module development (e.g., a library and an app that uses it):

::code-wrapper{language="bash"}
```bash
go work init ./myapp ./mylib
# Creates go.work:
# go 1.22
# use (
#   ./myapp
#   ./mylib
# )

go work use ./another
```
::

In a workspace, `go build`/`go test` resolve modules to local directories (not the published versions). This replaces `replace` directives in `go.mod` for local development. `go.work` is **not committed** (it's developer-specific).

## Vendoring

::code-wrapper{language="bash"}
```bash
go mod vendor   # copy deps into ./vendor/
go build -mod=vendor   # use vendored deps
```
::

Vendoring copies dependencies into the project for offline/reproducible builds. With Go modules, vendoring is optional (the module cache + go.sum provides reproducibility). Use it for air-gapped environments or strict supply-chain control.

## 💡 Tips & Tricks

- **Idiom**: use `internal/` for packages that shouldn't be imported outside your module — the toolchain enforces the boundary, so you don't need to document "don't use this." Reserve `pkg/` (or top-level packages) for genuinely public, reusable code.
- **Idiom**: run `go mod tidy` before every commit (and in CI: `go mod tidy && git diff --exit-code`) — it adds missing deps, removes unused ones, and updates go.sum. Without it, go.mod/go.sum drift from actual imports.
- **Idiom**: use `go work` (Go 1.18+) for multi-module local development — it lets local edits to a library take effect in an app without `replace` directives in go.mod (which you'd have to remove before publishing). `go.work` is developer-specific (not committed).
- **Idiom**: follow semantic import versioning — v1 modules have no version suffix (`github.com/x/y`); v2+ require `/v2` in the path. Upgrading to v2 means changing import paths deliberately, preventing accidental breaking upgrades.
- **Idiom**: keep packages focused and small — a package should have a clear purpose, a small public API, and cohesive functionality. "Packages of many unrelated things" are hard to use and test. The Go stdlib (`io`, `net`, `encoding/json`) exemplifies focused packages.

## ⚠️ Edge Cases & Gotchas

- **v2+ requires a version suffix**: `github.com/x/y/v2` — forgetting the `/v2` imports the v1 module (or fails if there's no v1). This is the #1 Go modules gotcha.
- **`internal/` is enforced by path**: the directory must be named `internal` (or have `internal` in the path) for the restriction to apply. `private/` has no special meaning.
- **`go.work` shouldn't be committed**: it's developer-specific local paths. Commit `go.mod`/`go.sum`; gitignore `go.work`.
- **`replace` directives in go.mod affect downstream consumers**: if you publish a library with a `replace`, it's ignored by consumers (replacements are local). Don't use `replace` for published libraries — use `go work` for local dev.
- **Module path must be unique for publishing**: `example.com/myapp` is fine for private code, but if you publish, use a path you control (GitHub repo, custom domain). Collisions cause import ambiguity.
- **`go get` in a module adds to go.mod**: but `go get pkg@latest` outside a module is disabled (Go 1.16+) — use `go install pkg@latest` for tools.
- **Minimum version selection**: Go uses MVS — the final version is the maximum of all required versions in the dependency graph. There's no "resolve to highest" like npm; each module's go.mod pins a minimum, and Go picks the max.
- **`go mod vendor` and CGO**: vendoring copies Go source, not C source. CGO dependencies may not vendor cleanly (they need the C toolchain at build time).
- **Package name ≠ import path last segment**: usually they match (`github.com/x/y/users` → `package users`), but a package can declare a different name (`package myusers`). Use an alias if it's confusing.
- **Test packages**: `users_test.go` can declare `package users_test` (external test) — it imports `users` like an external package, accessing only exported identifiers. Use this to test the public API; use `package users` (internal test) for testing unexported code.

## 🧠 Spot the Bug

A developer upgrades a dependency from v1 to v2 and changes `go.mod`:

::code-wrapper{language="bash"}
```bash
go get github.com/x/y@v2.0.0
```
::

But the import in code still reads `import "github.com/x/y"`, and the build fails with "module requires github.com/x/y/v2". What's wrong?

<details>
<summary>Answer</summary>

Go's semantic import versioning requires **v2+ modules to have a `/v2` suffix in the import path**. The developer upgraded the `go.mod` requirement to `v2.0.0`, but the code still imports `github.com/x/y` (the v1 path). The build fails because the code imports v1, but go.mod requires v2 (and there's no v1 at that version).

The fix — update all import paths to include `/v2`:

```go
import "github.com/x/y/v2"   // not "github.com/x/y"
```

And the module's own path (in its go.mod) must be `github.com/x/y/v2` for the v2 module. This is a deliberate Go design: major version changes require import path changes, preventing accidental breaking upgrades.

**The lesson**: v2+ Go modules require a `/vN` suffix in the import path. Upgrading a dependency to v2 means changing every import of it (and the module's own path if you're the v2 author).

</details>

## Summary

You can now organize code into packages (with `internal/` for private), manage dependencies with `go mod` (init/tidy/get), use workspaces (`go work`) for multi-module dev, follow semantic import versioning (v2+ requires `/v2`), and vendor for offline builds. Next: I/O and files.