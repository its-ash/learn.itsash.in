---
title: "21 — Packages & Modules"
description: "Module versioning semantics, internal/ enforcement, workspaces, replace directives, private modules, and the go.sum supply chain."
---

# 21 — Packages & Modules

## Package Organization

::code-wrapper{language="go"}
```go
// ┌──────────────────────────────────────────────────────────────────────┐
// │ Package  = directory of .go files with the same `package` clause     │
// │ Module   = versioned collection of packages, defined by go.mod      │
// │ Import   = module path + subdirectory path                           │
// │                                                                      │
// │ Visibility:                                                          │
// │   PascalCase = exported (public)                                     │
// │   camelCase  = unexported (package-private)                          │
// │   internal/  = toolchain-enforced private (only within parent)       │
// └──────────────────────────────────────────────────────────────────────┘

// File structure:
//   example.com/myapp/
//   ├── go.mod                      # module example.com/myapp
//   ├── go.sum                      # dependency hashes
//   ├── cmd/myapp/main.go           # package main — entry point
//   ├── internal/
//   │   ├── config/config.go        # package config — private to myapp
//   │   ├── domain/user.go           # package domain — business types
//   │   └── store/postgres/         # package postgres — DB impl
//   └── pkg/
//       └── ratelimiter/            # package ratelimiter — public, reusable
```

## The `internal/` Enforcement

::code-wrapper{language="go"}
```go
// Packages under internal/ can ONLY be imported by code within the
// parent of internal/. The Go TOOLCHAIN enforces this at compile time.

// example.com/myapp/internal/config/config.go
package config

type Config struct {
	DSN string
}

// This can be imported by:
//   ✅ example.com/myapp/cmd/myapp/main.go
//   ✅ example.com/myapp/internal/store/store.go
//   ❌ example.com/other-app/main.go  — compile error: "use of internal package not allowed"
//   ❌ github.com/some/lib/lib.go      — compile error
```

## Module Versioning Semantics

::code-wrapper{language="bash"}
```bash
# Go uses Semantic Versioning: vMAJOR.MINOR.PATCH
#   v1.2.3 → major=1, minor=2, patch=3
#
# Import paths for v2+ include the major version:
#   v1: github.com/lib/pq          → import "github.com/lib/pq"
#   v2: github.com/foo/bar/v2      → import "github.com/foo/bar/v2"
#   v3: github.com/foo/bar/v3      → import "github.com/foo/bar/v3"
#
# v0.x and v1.x don't have a version suffix in the import path.
# v2+ MUST have /v2, /v3, etc. in the module path and import path.

# Add/update dependencies:
go get github.com/lib/pq@latest           # latest stable
go get github.com/lib/pq@v1.10.9           # exact version
go get github.com/lib/pq@v1.10.0-beta.1    # pre-release
go get github.com/some/repo@main           # ⚠️ pseudo-version (unstable)

# Tidy — add missing, remove unused, update go.sum:
go mod tidy

# Upgrade a dependency:
go get github.com/lib/pq@latest
go mod tidy

# Downgrade:
go get github.com/lib/pq@v1.9.0
```

## `replace` Directives — Local Development

::code-wrapper{language="go"}
```go
// go.mod:
//   replace example.com/mylib => ../mylib
//   replace github.com/lib/pq => github.com/myfork/pq v1.10.1

// ❌ ANTI-PATTERN: using replace in a PUBLISHED library's go.mod
// Consumers inherit the replace — breaks if they don't have the local path.
// Never commit replace directives in library go.mod files.

// ✅ CORRECT: use go.work for local dev (gitignored)
// go.work (developer-local):
//   use ./myapp
//   use ../mylib
// go.mod stays clean (no replace) for CI and publishing.

// ✅ Legitimate replace: security fork in an APPLICATION (not library):
//   replace github.com/vulnerable/dep => github.com/patched/dep v1.2.1
```

## Private Modules

::code-wrapper{language="bash"}
```bash
# Private modules need GOPRIVATE so the Go tool doesn't try the public proxy:
go env -w GOPRIVATE=github.com/yourorg/*

# Or for a specific host:
go env -w GOPRIVATE=gitlab.com/yourcompany/*

# Without GOPRIVATE, `go get` from a private repo fails with 404
# (the Go proxy can't access private repos).

# Auth: configure git credentials:
#   ~/.netrc:
#     machine github.com
#     login your-token
#     password ghp_xxxxx
#   Or use SSH keys (go uses git for fetching).

# GOINSECURE for self-hosted HTTP (no TLS):
go env -w GOINSECURE=internal.company.git/*
```

## `go.sum` — Supply Chain Verification

::code-wrapper{language="bash"}
```bash
# go.sum records SHA-256 hashes of every dependency's zip + go.mod.
# The Go tool verifies these on download — if a registry serves a
# different hash, the build FAILS. This is supply-chain protection.

# Verify all cached modules match go.sum:
go mod verify

# Why go.sum matters:
#   1. Reproducibility — same go.sum → same dependencies
#   2. Security — tampered dependencies fail to build
#   3. Auditing — you can see exactly what versions were used

# ⚠️ go.sum should be COMMITTED to version control.
# go.mod and go.sum together define the build — both must be in git.
```

## Workspaces (`go work`)

::code-wrapper{language="bash"}
```bash
# go work lets you develop multiple modules simultaneously, with local
# edits taking effect without replace directives.

mkdir workspace && cd workspace
go work init ./myapp ./lib/mylib
# go.work:
#   go 1.22
#   use ./myapp
#   use ./lib/mylib

# Now `go build` in ./myapp resolves imports of example.com/mylib
# to the LOCAL ./lib/mylib — no replace directive needed.
# go.work is developer-local — gitignore it (don't commit).

# Sync go.work module versions back to go.mod:
go work sync
```

## Version Upgrades — Breaking Changes

::code-wrapper{language="bash"}
```bash
# Check for outdated dependencies:
go list -m -u all  # shows current and latest versions

# Upgrade a single dependency:
go get github.com/lib/pq@latest
go mod tidy
go test ./...  # ⚠️ always test after upgrading

# Upgrade ALL dependencies (careful — may break things):
go get -u ./...
go mod tidy
go test ./...

# Major version upgrade (v1 → v2):
#   1. Change the import path: "github.com/foo/bar" → "github.com/foo/bar/v2"
#   2. go mod tidy
#   3. Fix breaking API changes (v2 may have different signatures)
#   4. go test ./...

# ⚠️ `go get -u` in CI is dangerous — it can break the build if a
# dependency releases a breaking change. Pin versions in go.mod and
# upgrade deliberately.
```

## 💡 Tips & Tricks

- **Idiom**: use `internal/` for packages that shouldn't be imported outside your module — the toolchain enforces the boundary. Reserve `pkg/` for genuinely public, reusable packages.
- **Idiom**: `go mod tidy` before every commit — it adds missing deps and removes unused ones, keeping go.mod/go.sum accurate. A CI check `go mod tidy && git diff --exit-code` prevents drift.
- **Idiom**: use `go work` (Go 1.18+) for local multi-module development — it lets local edits to a library take effect in the app without `replace` directives in go.mod (which break CI).
- **Idiom**: pin dependencies to specific versions in go.mod (committed) — `go get @latest` in CI can break the build. Upgrade deliberately, test after.
- **Safety**: commit both go.mod AND go.sum — they together define the build. go.sum provides supply-chain verification (hashes). Don't gitignore go.sum.
- **Idiom**: use GOPRIVATE for private repos so the Go tool uses git auth instead of the public proxy. Without it, `go get` fails with 404.

## ⚠️ Edge Cases & Gotchas

- **v2+ import paths require `/v2`**: `import "github.com/foo/bar/v2"` — without the suffix, you get v1. The module's go.mod must also have `module github.com/foo/bar/v2`.
- **`replace` in a library breaks consumers**: never commit `replace` in a library's go.mod — consumers inherit it and break if they lack the local path. Use `go.work` instead.
- **Pseudo-versions are unstable**: `go get foo@main` creates a pseudo-version tied to a commit hash. The commit changes → different build. Pin to tags for reproducibility.
- **`go mod tidy` may remove deps**: if you remove an import but don't run tidy, go.mod still lists the dep. Tidy cleans up — but also adds missing ones. Run it before committing.
- **`go.sum` can have extra entries**: after an upgrade, go.sum may have hashes for multiple versions. `go mod tidy` cleans up unused entries.
- **Private modules need GOPRIVATE**: without it, `go get` tries the public proxy (returns 404 for private repos). Set `go env -w GOPRIVATE=github.com/yourorg/*`.
- **`GOFLAGS=-mod=readonly` prevents accidental go.mod changes**: in CI, use this to fail the build if go.mod needs modification. In dev, `-mod=mod` allows auto-updates.
- **`internal/` is enforced by the toolchain, not the filesystem**: the boundary is based on the module path, not the directory. A symlink outside the module can still import internal/.

## 🧠 Quick Quiz

::code-wrapper{language="bash"}
```bash
# go.mod:
#   module example.com/myapp
#   require github.com/lib/pq v1.10.0
#
# go get github.com/lib/pq@latest  # v1.10.9 is latest
# What does go.mod say now?
```
::
<details>
<summary>Answer</summary>

go.mod now says:

```
require github.com/lib/pq v1.10.9
```

`go get @latest` updates the require directive to the latest version. `go.sum` is also updated with the v1.10.9 hash.

But this is a **minor version upgrade** (v1.10.0 → v1.10.9) — within the same major version (v1), so no import path change is needed.

If the latest were v2.0.0, the import path would need to change to `github.com/lib/pq/v2` — a breaking upgrade requiring code changes.

</details>

## 📚 What's Next

→ [22 — I/O, Files & the io Package](/go/22-io-and-files) — Reader/Writer composition, `io.Copy`, buffered I/O, and streaming patterns.