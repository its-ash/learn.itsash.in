---
title: "Bash 12 — Error Handling Architecture: Strict Mode, Traps & Logging Internals"
description: "Deep-dive into Bash error handling: set -euo pipefail internals, trap ERR/EXIT mechanics, subshell error propagation, exit code conventions, structured logging, and production error-handling patterns. Code-first reference for senior engineers."
---

# 12 — Error Handling Architecture: Strict Mode, Traps & Logging Internals

## `set -e`: Exit on Error — The Full Picture

::code-wrapper{language="bash"}
```bash
# ── set -e: exit immediately when a command fails (non-zero exit) ──
set -e

# ── When -e triggers ──
false           # ← script exits here (false returns 1)
echo "reached"  # never reached

# ── When -e does NOT trigger (tested commands) ──
if false; then echo "if"; fi   # OK — tested by if
false && echo "and"            # OK — tested by &&
false || echo "or"            # OK — tested by ||
! false                        # OK — negated
false; true                    # ✗ exits on false (untested command)
false || true                  # OK — false is tested by ||

# ── The pipeline trap (needs pipefail) ──
false | true                   # exit 0 (true is last) — -e doesn't catch false!
set -o pipefail
false | true                   # exit 1 (pipefail: any failure propagates) — -e catches it

# ── Functions and -e ──
maybe_fail() { return 1; }
maybe_fail           # ✗ exits (simple command)
maybe_fail || true   # OK — tested by ||
if maybe_fail; then ...; fi  # OK — tested by if

# ── `local` masks command failures ──
set -e
bad() {
    local x=$(false)     # ✗ masked! local's exit status is 0 (always succeeds)
    echo "reached"       # "reached" — false's failure was eaten by local
}
bad
good() {
    local x
    x=$(false)           # ✓ not masked — false's status propagates
    echo "reached"       # never reached — script exits
}
good

# ── Command substitution and -e (Bash 4.4+) ──
# Bash < 4.4: x=$(false); echo "ok"  → "ok" (substitution failure masked!)
# Bash 4.4+: x=$(false); echo "ok"  → exits (inherit_errexit makes it propagate)
shopt -s inherit_errexit  # Bash 4.4+: subshells inherit set -e (default: OFF!)

# ── Subshell vs pipeline ──
set -e
(echo "subshell"; false)  # ✗ subshell fails, parent's set -e catches it? YES.
(echo "subshell"; false) | cat  # subshell exits 1, but pipefail needed for parent to catch
```
::

## `set -u`: Unset Variable Guard

::code-wrapper{language="bash"}
```bash
# ── set -u: unset variable expansion is a FATAL error ──
set -u

echo "$UNDEFINED"              # ✗ bash: UNDEFINED: unbound variable — script exits
echo "${UNDEFINED:-}"          # OK — :- provides empty default
echo "${UNDEFINED:-default}"   # OK — provides "default"
echo "${UNDEFINED:=default}"   # OK — provides and ASSIGNS "default"

# ── Arrays and set -u ──
declare -a arr=()
echo "${arr[@]}"               # Bash 4.4+: OK (empty array). Bash < 4.4: ✗ unbound!
echo "${arr[@]:-}"             # OK — safe on all versions (the :- handles empty)

declare -A map=()
echo "${map[key]}"             # ✗ if key doesn't exist: unbound (some versions)
echo "${map[key]:-}"           # OK — safe access pattern

# ── ${var:-} is the idiom for "may be unset" ──
# Use it for optional variables, especially with set -u:
config_value="${CONFIG_VALUE:-default}"
# If CONFIG_VALUE is set: use it. If unset: use "default" without error.
```
::

## `set -o pipefail`: Pipeline Failure Propagation

::code-wrapper{language="bash"}
```bash
# ── Without pipefail: only the LAST command's exit status matters ──
false | true        # exit 0 — false is masked!
grep "x" file | head -1  # if grep fails (file not found), head still succeeds → exit 0!

# ── With pipefail: the pipeline fails if ANY command fails ──
set -o pipefail
false | true        # exit 1 — false's failure propagates
grep "x" file | head -1  # if grep fails, pipeline exits 1

# ── pipefail returns the rightmost non-zero exit status ──
false | true        # without pipefail: 0. With pipefail: 1 (false's status)
true | false        # without pipefail: 1. With pipefail: 1 (false's status)
false | false       # exit 1 (the rightmost non-zero, which is 1 for false)
(exit 3) | (exit 2) # exit 2 (rightmost non-zero)
(exit 2) | (exit 3) # exit 3 (rightmost non-zero)

# ── Production pattern: always use the full strict mode ──
set -euo pipefail
# -e: exit on error
# -u: error on unset variable
# -o pipefail: pipeline fails if any command fails
# This is the MINIMUM for a robust script.
```
::

## `trap ERR`: Error Logging and Recovery

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
set -Eeuo pipefail   # -E: ERR trap inherits into functions and subshells

# ── trap ERR fires when a command fails (with set -e) ──
# It fires BEFORE the script exits — you can log, clean up, or even recover.

on_error() {
    local exit_code=$?          # capture FIRST — any command overwrites $?
    local line=$1
    local func=${FUNCNAME[1]:-main}
    local cmd="${BASH_COMMAND:-?}"

    # Log the error with full context
    printf '[%s] ERROR: %s failed in %s() at line %d (exit %d)\n' \
        "$(date -Iseconds)" "$cmd" "$func" "$line" "$exit_code" >&2

    # Optional: print the call stack
    local i
    for ((i = 1; i < ${#FUNCNAME[@]} - 1; i++)); do
        printf '  → %s() at %s:%d\n' \
            "${FUNCNAME[i]}" \
            "$(basename "${BASH_SOURCE[i]}")" \
            "${BASH_LINENO[i]}" >&2
    done

    # Clean up resources
    [[ -n "${tmpdir:-}" ]] && rm -rf -- "$tmpdir"

    exit "$exit_code"   # re-exit with the original code
}

trap 'on_error $LINENO' ERR

# ── Test it ──
failing_function() {
    false   # triggers ERR trap
}
failing_function  # trap fires: logs the error, cleans up, exits
```
::

## `trap EXIT`: Cleanup on Any Exit Path

::code-wrapper{language="bash"}
```bash
# ── trap EXIT fires on ANY exit: normal, set -e abort, signal (if no specific trap) ──

# ── Clean up temp files ──
tmpfile=$(mktemp)
tmpdir=$(mktemp -d)
trap 'rm -f "$tmpfile"; rm -rf "$tmpdir"' EXIT
# EXIT fires on:
# - normal end of script
# - exit command
# - set -e abort (command failure)
# - signals (INT, TERM) if no specific trap for them
# It fires in the exiting shell — so $tmpfile is still in scope.

# ── Preserve exit code ──
cleanup() {
    local exit_code=$?    # capture FIRST — any command overwrites $?
    [[ -n "${tmpfile:-}" ]] && rm -f "$tmpfile"
    [[ -n "${tmpdir:-}" ]] && rm -rf "$tmpdir"
    if ((exit_code != 0)); then
        echo "script failed (exit $exit_code)" >&2
    fi
    exit "$exit_code"   # preserve the original exit code
}
trap cleanup EXIT

# ── ⚠️ Multiple trap EXIT overwrite — last one wins ──
trap 'echo first' EXIT
trap 'echo second' EXIT   # overwrites first — only "second" runs
# Combine all cleanup in ONE function:
trap 'cleanup_all' EXIT

# ── Combine ERR and EXIT ──
# ERR fires on command failure (for logging). EXIT fires on any exit (for cleanup).
trap 'on_error $LINENO' ERR
trap 'cleanup' EXIT
# On a set -e abort: ERR fires first (logs), then EXIT fires (cleans up), then exits.
```
::

## Exit Code Conventions

::code-wrapper{language="bash"}
```bash
# ── Standard exit codes ──
exit 0    # success
exit 1    # general failure
exit 2    # usage error / misuse (shell builtin convention)
exit 126  # command found but not executable (permission denied)
exit 127  # command not found
exit 128  # invalid exit argument (exit 300 → 44, modulo 256)
exit 130  # terminated by SIGINT (128 + 2) — Ctrl-C
exit 137  # killed by SIGKILL (128 + 9) — kill -9
exit 143  # terminated by SIGTERM (128 + 15) — kill

# ── Signal exit codes: 128 + N (where N is the signal number) ──
# SIGINT  = 2  → exit 130
# SIGKILL = 9  → exit 137
# SIGTERM = 15 → exit 143
# SIGSEGV = 11 → exit 139

# ── `exit` wraps to 0-255 ──
exit 300   # actual exit code: 44 (300 % 256)
exit -1    # actual exit code: 255 (-1 % 256 in bash)
exit 256   # actual exit code: 0 (256 % 256 = 0 — looks like success!)

# ── Define exit code constants ──
readonly EXIT_SUCCESS=0
readonly EXIT_FAILURE=1
readonly EXIT_USAGE=2
readonly EXIT_MISSING_DEP=3
readonly EXIT_NOT_FOUND=127

# Usage:
if ! command -v git &>/dev/null; then
    echo "git not found" >&2
    exit "$EXIT_NOT_FOUND"
fi
```
::

## Structured Logging

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash

# ── Log levels ──
declare -i LOG_LEVEL=${LOG_LEVEL:-3}  # 0=trace 1=debug 2=info 3=warn 4=error
declare -A LOG_LEVELS=(
    [TRACE]=0 [DEBUG]=1 [INFO]=2 [WARN]=3 [ERROR]=4 [FATAL]=5
)
declare -A LOG_COLORS=(
    [TRACE]=$'\e[90m'   # gray
    [DEBUG]=$'\e[36m'   # cyan
    [INFO]=$'\e[32m'    # green
    [WARN]=$'\e[33m'    # yellow
    [ERROR]=$'\e[31m'   # red
    [FATAL]=$'\e[31m'   # red
)
readonly RESET=$'\e[0m'

# ── Check if stderr is a terminal (for colors) ──
if [[ -t 2 ]]; then
    USE_COLOR=true
else
    USE_COLOR=false
fi

# ── Log function ──
log() {
    local level=$1; shift
    local message="$*"

    # Check level threshold
    (( LOG_LEVELS[$level] >= LOG_LEVEL )) || return 0

    # Format: [ISO8601] [LEVEL] message
    local timestamp
    timestamp=$(date -Iseconds)

    if $USE_COLOR; then
        printf '%s[%s]%s %s[%-5s]%s %s\n' \
            "${LOG_COLORS[$level]}" "$timestamp" "$RESET" \
            "${LOG_COLORS[$level]}" "$level" "$RESET" \
            "$message" >&2
    else
        printf '[%s] [%-5s] %s\n' "$timestamp" "$level" "$message" >&2
    fi
}

# ── Convenience functions ──
log_trace() { log TRACE "$@"; }
log_debug() { log DEBUG "$@"; }
log_info()  { log INFO "$@"; }
log_warn()  { log WARN "$@"; }
log_error() { log ERROR "$@"; }
log_fatal() { log ERROR "$@"; exit 1; }

# ── Usage ──
log_info "starting deployment"
log_debug "config loaded: ${#config[@]} entries"
log_warn "deprecated option --old-flag"
log_error "failed to connect to database"
log_fatal "cannot continue without database"   # logs ERROR, then exits 1
```
::

## Anti-Pattern: Silent Failures

::code-wrapper{language="bash"}
```bash
# ❌ NAIVE — commands fail silently without set -e
mkdir "$dir"         # if this fails (permission, exists), script continues silently
cd "$dir"           # if mkdir failed, cd fails, script runs in wrong dir
cp file "$dir/"     # copies to wrong location, no error
rm -rf *            # removes wrong files!

# ✅ CORRECT — strict mode + explicit checks
set -euo pipefail
mkdir -p "$dir" || die "can't create $dir"
cd "$dir" || die "can't cd to $dir"
cp "$src" "$dir/" || die "can't copy $src"

# ❌ NAIVE — pipeline failure masked
grep "pattern" file | head -10
# If file doesn't exist: grep fails, but head succeeds (exit 0) — silent failure!

# ✅ CORRECT — pipefail catches it
set -o pipefail
grep "pattern" file | head -10
# grep fails → pipeline fails → set -e exits

# ❌ NAIVE — unset variable silently becomes empty
echo "config: $CONFIG_PATH"   # if CONFIG_PATH is unset → "config: "
cp "$CONFIG_PATH" /etc/       # copies "" → "cp: missing destination"

# ✅ CORRECT — set -u catches it
set -u
echo "config: $CONFIG_PATH"   # bash: CONFIG_PATH: unbound variable — exits
# Or with default:
echo "config: ${CONFIG_PATH:-/etc/default.conf}"
```
::

## Production Pattern: Dependency Checks

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
set -euo pipefail

# ── Check for required commands ──
require() {
    local cmd=$1
    if ! command -v "$cmd" &>/dev/null; then
        echo "ERROR: required command not found: $cmd" >&2
        echo "Install: brew install $cmd (macOS)  or  apt install $cmd (Debian)" >&2
        exit 127
    fi
}

# ── Check for required files ──
require_file() {
    local file=$1
    [[ -f "$file" ]] || { echo "ERROR: required file not found: $file" >&2; exit 2; }
}

# ── Check for required env vars ──
require_env() {
    local var=$1
    [[ -n "${!var:-}" ]] || { echo "ERROR: required env var not set: $var" >&2; exit 2; }
}

# ── Check for required dirs ──
require_dir() {
    local dir=$1
    [[ -d "$dir" ]] || { echo "ERROR: required directory not found: $dir" >&2; exit 2; }
}

# ── Check all dependencies at startup ──
require git
require curl
require jq
require_env DATABASE_URL
require_file config.env

echo "all dependencies satisfied"
```
::

## `die`: The Fatal Error Function

::code-wrapper{language="bash"}
```bash
# ── die: print error to stderr and exit 1 ──
die() {
    printf '[%s] FATAL: %s\n' "$(date -Iseconds)" "$*" >&2
    exit 1
}

# ── Usage patterns ──
[[ $# -ge 1 ]] || die "missing required argument. Usage: $0 <input>"
[[ -f "$1" ]] || die "file not found: $1"
command -v docker &>/dev/null || die "docker not installed"
cd "$BUILD_DIR" || die "can't cd to $BUILD_DIR"

# ── die with context (include the failing command) ──
die_cmd() {
    printf '[%s] FATAL: '%s' failed\n' "$(date -Iseconds)" "$1" >&2
    exit 1
}

# ── die with exit code ──
die_code() {
    local code=$1; shift
    printf '[%s] ERROR: %s\n' "$(date -Iseconds)" "$*" >&2
    exit "$code"
}
die_code 2 "invalid usage"      # exit 2 (usage error)
```
::

## Debugging Techniques

::code-wrapper{language="bash"}
```bash
# ── set -x: trace every command ──
set -x        # print each command BEFORE execution (with + prefix)
echo "hello"  # + echo hello
set +x        # turn off

# ── PS4: customize the trace prompt ──
PS4='+ $LINENO: '
set -x
# + 5: echo hello
set +x

# ── PS4 with full context ──
PS4='+ ${BASH_SOURCE[0]}:${LINENO}: ${FUNCNAME[0]:-main}: '
set -x
# + script.sh:5: main: echo hello
set +x

# ── Trace from the command line (no edit needed) ──
bash -x script.sh        # trace entire script
bash -x script.sh 2>trace.log  # trace to a file

# ── Trace only a section ──
{
    set -x
    # ... section to debug ...
    set +x
} 2>&1  # capture trace

# ── set -v: print input lines as read (before expansion) ──
set -xv   # -v: raw input lines, -x: expanded commands — shows both

# ── declare -p: inspect variable state ──
declare -p PATH        # print PATH's definition (shows quoting, type)
declare -p arr          # print array definition (for debugging)
declare -p config       # print associative array

# ── Print variables for debugging ──
debug() {
    printf '[DEBUG] %s\n' "$*" >&2
}
debug "count=$count, file=$file, mode=$mode"
```
::

## Dry-Run Pattern

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
dry_run=false

# ── Parse --dry-run flag ──
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run) dry_run=true; shift ;;
        *)         break ;;
    esac
done

# ── run wrapper: execute or echo ──
run() {
    if $dry_run; then
        printf 'DRY RUN: %s\n' "$*" >&2
    else
        "$@"
    fi
}

# ── Usage ──
run rm -f "$file"
run cp "$src" "$dst"
run systemctl restart "$service"
# With --dry-run: prints each command without executing.
# Without --dry-run: executes each command.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="bash"}
```bash
# ── `set -e` with `grep` (no match is not an error) ──
grep "pattern" file.txt || true    # no match → exit 1 → || true → exit 0
# Or:
if grep -q "pattern" file.txt; then ...; fi  # tested — no set -e issue

# ── `set -e` with `cd` ──
cd "$dir" || exit 1   # if cd fails, exit explicitly (set -e also catches it)
# But: cd in a subshell doesn't affect the parent: ( cd dir; cmd )

# ── `trap` DEBUG for step-by-step tracing ──
trap 'echo "line $LINENO: $BASH_COMMAND" >&2' DEBUG
# Fires BEFORE every command — very verbose but powerful for debugging.

# ── `trap` RETURN (fires when a function returns) ──
my_func() {
    echo "doing work"
}
trap 'echo "my_func returned (status $?)"' RETURN
my_func  # doing work\nmy_func returned (status 0)

# ── Capture and re-raise in trap ──
# If you want to do work in the trap but still exit with the original code:
trap 'cleanup; exit $?' EXIT  # cleanup runs, then exit with the original status

# ── `ERR` trap with function context ──
# $BASH_LINENO[0] is the caller's line number (where the function was called)
# $LINENO is the current line (inside the function)
trap 'echo "error at ${BASH_LINENO[0]} (called from ${FUNCNAME[1]:-main})"' ERR
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="bash"}
```bash
# ── `set -e` doesn't catch everything ──
# Commands in if/while/&&/|| are "tested" — don't trigger -e.
# `local x=$(false)` masks the failure (local always returns 0).
# `$(false)` without inherit_errexit doesn't propagate (Bash < 4.4).

# ── `set -u` and arrays ──
# Bash < 4.4: "${arr[@]}" on an empty array errors. Use "${arr[@]:-}".
# `[[ -v arr[@] ]]` checks if array has any elements (Bash 4.2+).

# ── `pipefail` with `grep` ──
# grep returns 1 if no match. With pipefail: `grep ... | head` fails if no match.
# Fix: `grep ... | head -1 || true` or use `grep -q ... && ...`.

# ── `trap ERR` doesn't fire on syntax errors ──
# Syntax errors abort before any trap runs.
# `trap ERR` fires on command failures (with set -e), not parse errors.

# ── `exit` in a subshell doesn't exit the script ──
(exit 1)   # subshell exits 1, parent continues
# Check: ( exit 1 ) || die "subshell failed"

# ── `trap EXIT` and signals ──
# EXIT fires on normal exit and set -e abort.
# For signals (INT, TERM), you need a specific trap: trap 'cleanup' INT TERM
# Or: trap 'cleanup' EXIT INT TERM (EXIT also fires after a signal trap)

# ── `inherit_errexit` is off by default ──
# Subshells don't inherit set -e by default (Bash 4.4+).
# Enable: shopt -s inherit_errexit
# Without it: ( false; echo "reached" ) → "reached" (subshell didn't exit!)

# ── Exit code wrapping ──
# exit 300 → exit 44 (300 % 256). exit 256 → exit 0 (looks like success!).
# Always use 0-255 for exit codes.
```
::

## 🧠 Quick Quiz

Why does this script print "reached" instead of exiting?

::code-wrapper{language="bash"}
```bash
set -e
f() {
    local result=$(false)
    echo "reached"
}
f
```
::

<details>
<summary>Answer</summary>

`local result=$(false)` masks the failure because `local` is a command that always returns exit status 0. The `$(false)` runs in a subshell and fails, but `local`'s exit status (0) overrides it.

With `set -e`, the script sees exit 0 from `local` and doesn't exit.

**The fix**: separate declaration and assignment:

```bash
set -e
f() {
    local result
    result=$(false)    # assignment's exit status is false's (1) → set -e exits
    echo "reached"     # never reached
}
f
```

**The lesson**: `local x=$(command)` always returns 0 (local's status), masking the command's failure. With `set -e`, use `local x; x=$(command)` so the command's exit status propagates.

</details>