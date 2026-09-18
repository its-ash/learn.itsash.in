---
title: "Bash 13 — Production Script Architecture: Structure, Idioms & Safety"
description: "Deep-dive into production Bash script architecture: the main function pattern, SCRIPT_DIR with symlink resolution, library sourcing, readonly/local hygiene, die/require idioms, eval avoidance, and idempotent design. Code-first reference for senior engineers."
---

# 13 — Production Script Architecture: Structure, Idioms & Safety

## The Production Script Skeleton

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
# ── 1. Shebang (portable: env finds bash via PATH) ──

# ── 2. Strict mode ──
set -Eeuo pipefail
# -E: ERR trap inherits into functions (essential for trap ERR)
# -e: exit on error
# -u: error on unset variable
# -o pipefail: pipeline fails if any command fails

# ── 3. Defensive shopts ──
shopt -s inherit_errexit 2>/dev/null || true  # Bash 4.4+: subshells inherit set -e
shopt -s nullglob        # unmatched globs → empty (not literal)
shopt -s globstar        # ** recursive
shopt -s extglob         # extended pattern matching

# ── 4. Constants (readonly, UPPER_CASE) ──
readonly SCRIPT_NAME=$(basename "${BASH_SOURCE[0]}")
readonly SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
readonly VERSION="1.0.0"
readonly LOG_FILE="${LOG_FILE:-/var/log/myapp.log}"

# ── 5. Global state (declare explicitly) ──
declare -A config
declare -a positionals=()
tmpdir=""

# ── 6. Utility functions ──
log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*" >&2; }
die() { log "FATAL: $*"; exit 1; }
require() { command -v "$1" &>/dev/null || die "missing: $1"; }

# ── 7. Error handling ──
on_error() {
    local exit_code=$?
    local line=$1
    log "ERROR at line $line: '$BASH_COMMAND' failed (exit $exit_code)"
    exit "$exit_code"
}
trap 'on_error $LINENO' ERR

cleanup() {
    local exit_code=$?
    [[ -n "$tmpdir" && -d "$tmpdir" ]] && rm -rf -- "$tmpdir"
    if ((exit_code == 0)); then
        log "completed successfully"
    else
        log "failed (exit $exit_code)"
    fi
    exit "$exit_code"
}
trap cleanup EXIT INT TERM

# ── 8. Usage ──
usage() {
    cat <<EOF
$SCRIPT_NAME v$VERSION

Usage: $SCRIPT_NAME [OPTIONS] <command> [args...]

Options:
  -h, --help     Show this help
  -v, --verbose  Verbose output
  --version      Show version

Commands:
  build    Build the project
  test     Run tests
  deploy   Deploy to environment
EOF
}

# ── 9. Command functions ──
cmd_build() {
    log "building..."
    # ... build logic ...
}

cmd_test() {
    log "testing..."
    # ... test logic ...
}

# ── 10. Main function ──
main() {
    parse_args "$@"
    dispatch
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help) usage; exit 0 ;;
            -v|--verbose) LOG_LEVEL=1; shift ;;
            --version) echo "$VERSION"; exit 0 ;;
            -*) die "unknown option: $1" ;;
            *) positionals+=("$1"); shift ;;
        esac
    done
}

dispatch() {
    local cmd="${positionals[0]:-}"
    [[ -z "$cmd" ]] && { usage; exit 1; }
    case "$cmd" in
        build)  shift_positionals 1; cmd_build "$@" ;;
        test)   shift_positionals 1; cmd_test "$@" ;;
        *)      die "unknown command: $cmd" ;;
    esac
}

shift_positionals() {
    shift "$1"
    positionals=("${positionals[@]:1}")
}

# ── 11. Entry point (only if executed, not sourced) ──
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
```
::

## `SCRIPT_DIR`: Reliable Script Directory Resolution

::code-wrapper{language="bash"}
```bash
# ── Naive: $0 is unreliable ──
# $0 is the path the script was invoked as:
#   ./script.sh        → $0 = "./script.sh"
#   bash script.sh     → $0 = "script.sh"
#   /usr/local/bin/script  → $0 = "/usr/local/bin/script" (symlink → /opt/app/script)
# When sourced: $0 = "bash" (the shell name)

# ── Better: BASH_SOURCE[0] (works when sourced too) ──
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# But: if BASH_SOURCE[0] is a symlink, this gives the SYMLINK's dir, not the real script's dir.

# ── Full: resolve symlinks ──
resolve_script_dir() {
    local source="${BASH_SOURCE[0]}"
    # Follow symlinks until we reach the real file
    while [[ -L "$source" ]]; do
        local dir=$(dirname "$source")
        source=$(readlink "$source")
        [[ "$source" != /* ]] && source="$dir/$source"  # resolve relative symlink
    done
    cd "$(dirname "$source")" && pwd
}
readonly SCRIPT_DIR=$(resolve_script_dir)

# ── Portable: use realpath if available ──
if command -v realpath &>/dev/null; then
    readonly SCRIPT_DIR=$(dirname "$(realpath "${BASH_SOURCE[0]}")")
else
    readonly SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
fi

# ── Use SCRIPT_DIR for relative paths ──
source "$SCRIPT_DIR/lib/utils.sh"
config_file="$SCRIPT_DIR/config/app.env"
```
::

## Anti-Pattern: `$0` for Script Directory

::code-wrapper{language="bash"}
```bash
# ❌ NAIVE — breaks with symlinks and sourcing
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
# If $0 is a symlink (/usr/local/bin/app → /opt/app/bin/script):
#   dirname "$0" = /usr/local/bin (the symlink's dir, NOT the real dir)
#   Resources in /opt/app/ (lib/, config/) won't be found!

# ✅ CORRECT — BASH_SOURCE[0] + symlink resolution
SCRIPT_DIR=$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)
# realpath resolves all symlinks → /opt/app/bin
# dirname → /opt/app/bin (the real script's directory)
```
::

## Sourcing Libraries with Guards

::code-wrapper{language="bash"}
```bash
# ── lib/utils.sh: a reusable library ──
# Guard against re-sourcing (prevents redefining functions):
[[ -n "${_UTILS_SH_SOURCED:-}" ]] && return 0
_UTILS_SH_SOURCED=1

# Library functions:
log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*" >&2; }

die() { log "FATAL: $*"; exit 1; }
# ⚠️ die uses `exit` — but if this file is SOURCED, exit closes the caller's shell!
# In a library, use `return` for "stop this file" and let the caller decide:
die_lib() { log "FATAL: $*"; return 1; }
# The caller: source utils.sh; die_lib "error" || exit 1

require() { command -v "$1" &>/dev/null || die "missing: $1"; }

# ── source the library ──
source "$SCRIPT_DIR/lib/utils.sh"
log "library loaded"
```
::

## `readonly` and `local`: Immutability and Scope

::code-wrapper{language="bash"}
```bash
# ── readonly: constants (can't be reassigned) ──
readonly PI=3.14159
readonly CONFIG_DIR="/etc/myapp"
readonly VERSION=$(cat "$SCRIPT_DIR/VERSION" 2>/dev/null || echo "unknown")

# PI=3   # ✗ bash: PI: readonly variable (fatal with set -u)
# readonly is global — survives function calls (unlike local)

# ── local: function-scoped variables ──
process() {
    local count=0      # local to process() — doesn't leak to caller
    local result=""    # each call gets a fresh copy
    # ...
}

# ── readonly + local: constant within a function ──
parse() {
    local -r max_retries=3   # local AND readonly (can't reassign within function)
    for ((i = 0; i < max_retries; i++)); do
        # ...
    done
    # max_retries=5  # ✗ bash: max_retries: readonly variable
}

# ── Always use local for function variables ──
# Without local: function variables are GLOBAL — pollute scope, clobber existing vars
# With local: function-scoped — clean, no side effects on caller
```
::

## Anti-Pattern: `eval` on Untrusted Input

::code-wrapper{language="bash"}
```bash
# ❌ DANGEROUS — eval runs a string as a command (code injection)
user_input='$(rm -rf /)'
eval "echo $user_input"    # runs `rm -rf /` !!!!

# ❌ Also dangerous — indirect via eval
var_name="user_input; rm -rf /"
eval "echo \$$var_name"    # command injection via the variable name!

# ✅ SAFE — indirect expansion ${!var} (no eval)
var_name="HOME"
echo "${!var_name}"        # /home/user — expands the variable whose NAME is in var_name
# ${!var} is safe: it only expands a VARIABLE, doesn't run commands.

# ✅ SAFE — nameref (Bash 4.3+)
set_value() {
    local -n _ref=$1   # nameref — safe, no eval
    _ref="$2"
}
set_value my_var "hello"
echo "$my_var"   # hello

# ✅ SAFE — arrays for data, not code
# Don't store commands as strings and eval them — store as array elements:
cmd=(docker run --rm -v "$PWD:/app" myapp)
"${cmd[@]}"    # executes the array as a command — no eval, no word-splitting issues

# ── When eval is (rarely) needed ──
# To expand a variable containing a variable name (use ${!var} instead)
# To build a command dynamically (use arrays instead)
# To run code from a trusted source (config file you control) — still risky
```
::

## Idempotent Scripts

::code-wrapper{language="bash"}
```bash
# ── Idempotent: safe to run multiple times (same result) ──

# ── Idempotent directory creation ──
mkdir -p "$dir"          # -p: no error if exists, creates parents
# ❌ mkdir "$dir"         # errors if exists (not idempotent)

# ── Idempotent file creation ──
[[ -e "$file" ]] || touch "$file"   # create only if doesn't exist
# Or: touch "$file"  (touch is idempotent — updates timestamp if exists)

# ── Idempotent symlink ──
ln -sf "$target" "$link"   # -f: force — replaces existing link (idempotent)

# ── Idempotent config write (atomic) ──
write_config() {
    local content="$1"
    local file="$2"
    # Write to temp, then atomically rename (crash-safe + idempotent)
    local tmp=$(mktemp "$file.XXXXXX")
    printf '%s\n' "$content" > "$tmp"
    mv "$tmp" "$file"   # atomic rename — readers never see partial state
}

# ── Idempotent database migration ──
migrate() {
    local version_file="$DB_DIR/.version"
    local current_version=0
    [[ -f "$version_file" ]] && current_version=$(<"$version_file")

    if ((current_version < 1)); then
        # run migration 1
        echo "running migration 1..."
    fi
    if ((current_version < 2)); then
        # run migration 2
        echo "running migration 2..."
    fi
    echo "2" > "$version_file"   # update version marker
}
# Running twice: first run does migrations 1 and 2, second run does nothing (already at 2).
```
::

## Output Discipline: stdout for Data, stderr for Messages

::code-wrapper{language="bash"}
```bash
# ── stdout: machine-parseable data (consumed by other commands) ──
# ── stderr: human-readable messages (logs, warnings, errors) ──

# ── Correct separation ──
process() {
    log "processing..." >&2    # log to stderr (human)
    echo "$result"              # data to stdout (machine)
}

# Capture data only:
result=$(process)              # captures stdout (data), stderr shows on terminal
# Capture both:
{ output=$(process 2>&1); }    # captures stdout AND stderr into output

# ── Anti-pattern: mixing data and messages on stdout ──
# ❌ BAD — log message pollutes the data output
process() {
    echo "processing..."   # ← goes to stdout — mixed with data!
    echo "$result"         # ← data also on stdout — $() captures both
}
result=$(process)   # "processing...\nresult" — contains the log message!

# ✅ GOOD — messages to stderr, data to stdout
process() {
    echo "processing..." >&2  # stderr — not captured
    echo "$result"            # stdout — only data
}
result=$(process)   # just the data

# ── Progress bar to stderr ──
for ((i = 0; i < 100; i++)); do
    printf '\r[%-50s] %d%%' "$(printf '#%.0s' {1..50} | head -c $((i/2)))" "$i" >&2
    sleep 0.01
done
echo "" >&2   # newline after progress bar
```
::

## The `main` Function Pattern

::code-wrapper{language="bash"}
```bash
# ── Put ALL logic in functions, call main at the end ──

# Benefits:
# 1. Functions are testable (source the script, call functions)
# 2. No top-level execution (safe if sourced as a library)
# 3. Clear entry point
# 4. Variables in functions are local (clean scope)

main() {
    parse_args "$@"
    validate
    do_work
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -v|--verbose) verbose=true; shift ;;
            *)            args+=("$1"); shift ;;
        esac
    done
}

validate() {
    [[ ${#args[@]} -ge 1 ]] || die "missing required argument"
    require docker
}

do_work() {
    # ... actual work ...
    :
}

# ── Entry point (only if executed, not sourced) ──
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
# When sourced: BASH_SOURCE[0] != $0, so main doesn't run (acts as a library).
# When executed: BASH_SOURCE[0] == $0, so main runs.
```
::

## Guard Against Sourcing (Library Mode)

::code-wrapper{language="bash"}
```bash
# ── Detect if script is being sourced vs executed ──
# When sourced: BASH_SOURCE[0] != BASH_SOURCE[1] (caller)
# When executed: BASH_SOURCE[0] == BASH_SOURCE[1] (both are the script)
# Simpler: (return 0 2>/dev/null) succeeds in a sourced context, fails when executed

(return 0 2>/dev/null) && SOURCED=1 || SOURCED=0

if ((SOURCED)); then
    # Library mode: don't run main, just define functions
    :
else
    # Executed: run main
    main "$@"
fi

# ── Or the standard idiom ──
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
```
::

## 💡 Tips & Tricks

::code-wrapper{language="bash"}
```bash
# ── `printf '%q'` for safe variable quoting ──
# %q shell-quotes a string (escapes special chars) — safe for re-eval or passing as args
file="my file with spaces & special"
printf '%q\n' "$file"   # my\ file\ with\ spaces\ \&\ special

# ── Use `declare -p` to serialize variables ──
arr=("a" "b" "c")
declare -p arr          # declare -a arr=([0]="a" [1]="b" [2]="c")
# Can be saved and sourced to restore state:
declare -p arr > state.sh  # save
source state.sh            # restore

# ── Atomic operations with trap EXIT ──
# If a script can be interrupted, use trap EXIT for cleanup:
trap '[[ -f "$tmpfile" ]] && rm -f "$tmpfile"' EXIT
tmpfile=$(mktemp)

# ── Use `flock` for single-instance scripts ──
exec 9> /tmp/myapp.lock
flock -n 9 || { echo "already running" >&2; exit 1; }
# Lock held until fd 9 is closed (script exits)

# ── Check for required Bash version ──
if ((BASH_VERSINFO[0] < 4)); then
    echo "Requires Bash 4+ (for associative arrays)" >&2
    exit 1
fi
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="bash"}
```bash
# ── Functions must be defined before use ──
# Bash reads top-to-bottom — no hoisting. Call functions AFTER defining them.
# Put all functions at the top, main "$@" at the bottom.

# ── Uppercase variable names can clobber env vars ──
# PATH, HOME, USER, TERM are env vars. Don't use ALLCAPS for regular vars.
# Use: file_count, output_dir (lower_case for variables)
# Use: MAX_RETRIES, VERSION (UPPER_CASE for readonly constants)

# ── `set -e` in a sourced library ──
# `set -e` applies to the current shell. If you source a library with `set -e`,
# it enables -e in the CALLER's shell (surprising!).
# Don't put `set -e` in libraries — put it in scripts that are executed.

# ── `return` vs `exit` in a sourced file ──
# In a sourced file: `exit` closes the caller's shell! Use `return`.
# In an executed script: `exit` is fine.

# ── `trap` can be overridden ──
# If you source a file that sets trap EXIT, it overrides your trap EXIT.
# Always set traps AFTER sourcing libraries.

# ── `readonly` can't be unset ──
# readonly PI=3.14  → can't unset PI, can't reassign.
# To "reset": use a subshell: ( readonly PI=3; echo $PI )  → PI is gone after subshell.

# ── `eval` is almost always the wrong tool ──
# For indirect variable: use ${!var}
# For building commands: use arrays: cmd=(cmd arg1 arg2); "${cmd[@]}"
# For dynamic function calls: declare -F | grep, or call by name: "$func_name" arg
```
::

## 🧠 Quick Quiz

Why does this script work when executed but not when sourced?

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
set -euo pipefail
echo "starting"
# ... script logic ...
echo "done"
```
::

<details>
<summary>Answer</summary>

When **executed** (`./script.sh`): `set -euo pipefail` applies to the script's shell. If a command fails, the script exits. The calling terminal is unaffected.

When **sourced** (`source script.sh`): `set -euo pipefail` applies to the **caller's shell** (your interactive terminal or the script that sourced it). Now:
- `set -e`: your terminal exits on any command failure!
- `set -u`: any unset variable reference in the terminal kills it!
- `set -o pipefail`: changes pipe behavior for the entire terminal session!

This is a common surprise: sourcing a "safe" script makes the caller's shell "safe" too — which can be dangerous (exiting the user's terminal).

**The fix**: libraries should NOT set `set -e`. Only executable scripts should. Use the guard:

::code-wrapper{language="bash"}
```bash
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    set -euo pipefail   # only in executed mode
    main "$@"
fi
```
::

**The lesson**: `set -e` (and friends) affect the current shell. When a script is sourced, that's the caller's shell. Guard strict mode behind the executed-vs-sourced check.

</details>