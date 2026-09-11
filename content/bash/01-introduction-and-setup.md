---
title: "Bash 01 — Shell Architecture, Shebang Semantics & Strict-Mode Internals"
description: "Deep-dive into Bash interpreter resolution, shebang mechanics, strict-mode internals (set -euo pipefail), and production-grade script scaffolding. Code-first reference for mid-to-senior engineers."
---

# 01 — Shell Architecture, Shebang Semantics & Strict-Mode Internals

## How the Kernel Resolves a Shebang

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
# The kernel's execve() reads the first ~128 bytes (BINPRM_BUF_SIZE).
# If it finds "#!", the rest of the line is split into interpreter + optional single arg.
#   #!/usr/bin/env bash        → execve("/usr/bin/env", ["env", "bash", scriptpath])
#   #!/bin/bash                → execve("/bin/bash", ["bash", scriptpath])
#   #!/usr/bin/env bash -Eeuo pipefail → execve("/usr/bin/env", ["env", "bash -Eeuo pipefail", scriptpath])
#     ^-- "bash -Eeuo pipefail" is passed as ONE arg to env (kernel allows max 1 arg).
#          env splits it via its own argv parsing — works on Linux, NOT portable to all Unices.
#
# CRLF trap: "#!/usr/bin/env bash\r\n" → interpreter name is "bash\r" → "No such file or directory".
# Fix: sed -i 's/\r$//' script.sh  OR  configure editor to LF.

# Verify the resolved interpreter path and version at runtime:
printf 'interpreter: %s\n' "$(readlink -f "$(command -v bash)")"
printf 'bash version: %s\n' "$BASH_VERSION"           # e.g. 5.2.15(1)-release
printf 'bash major:  %d\n' "$BASH_VERSINFO[0]"        # e.g. 5 — use for feature gating
(( BASH_VERSINFO[0] >= 4 )) || { echo "Requires Bash 4+ (associative arrays, mapfile)." >&2; exit 1; }
```
::

## Production Script Skeleton (Annotated)

Every script below uses this skeleton. Each line is load-bearing.

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
# ── Strict mode ──────────────────────────────────────────────
set -Eeuo pipefail
#  │ │ │  └─ pipefail: pipeline returns rightmost non-zero exit (default: returns last cmd only).
#  │ │ └──── u: unset variable expansion is a fatal error (not empty string).
#  │ └────── e: exit immediately on any command failure (with caveats — see below).
#  └──────── E: ERR trap inherits into functions and subshells (critical for trap ERR).
#
# ── Defensive globals ───────────────────────────────────────
shopt -s inherit_errexit 2>/dev/null || true  # Bash 4.4+: subshells inherit `set -e` (default: off!)
shopt -s nullglob        # Unmatched globs expand to nothing (not the literal pattern).
shopt -s globstar        # ** matches recursively (find **/*.py).
shopt -s extglob         # Extended pattern matching: ?(), *(), +(), @(), !().
IFS=$' \t\n'            # Explicit IFS — word-splitting on space, tab, newline only.

# ── Constants ───────────────────────────────────────────────
readonly SCRIPT_NAME=$(basename "${BASH_SOURCE[0]}")
readonly SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)  # resolves symlinks? No — see 13.
readonly LOG_FD=2       # stderr

# ── Error handling ──────────────────────────────────────────
err_report() {
    printf '[%s] %s:%d: %s failed (exit %d)\n' \
        "$(date -Iseconds)" "$SCRIPT_NAME" "${1:-0}" "${BASH_COMMAND:-?}" "${2:-0}" >&"$LOG_FD"
}
trap 'err_report "$LINENO" "$?"' ERR       # fires on any uncaught command failure (needs set -e -E).
trap 'cleanup' EXIT                          # fires on any exit path — normal, set -e abort, signal.

cleanup() {
    local exit_code=$?
    [[ -n "${tmpdir:-}" && -d "$tmpdir" ]] && rm -rf -- "$tmpdir"
    exit "$exit_code"   # preserve the original exit code (trap EXIT receives it).
}

# ── Logging ─────────────────────────────────────────────────
declare -i LOG_LEVEL=${LOG_LEVEL:-3}  # 0=trace 1=debug 2=info 3=warn 4=error 5=off
log() {
    local level=$1; shift
    local -A levels=([TRACE]=0 [DEBUG]=1 [INFO]=2 [WARN]=3 [ERROR]=4 [OFF]=5)
    (( levels[$level] >= LOG_LEVEL )) && printf '[%s] %s: %s\n' "$(date -Iseconds)" "$level" "$*" >&"$LOG_FD"
}

die() { log ERROR "$*"; exit 1; }

# ── Main ─────────────────────────────────────────────────────
main() {
    log INFO "Starting $SCRIPT_NAME"
    tmpdir=$(mktemp -d)  # mktemp -d: creates 0700-permission temp dir — race-free, no symlink attack.
    log DEBUG "tmpdir=$tmpdir"
    # ... script logic ...
    log INFO "Done"
}

main "$@"
```
::

## Anti-Pattern: The Naive Shebang

::code-wrapper{language="bash"}
```bash
# ❌ NAIVE — hardcodes path, breaks on NixOS, Homebrew, conda, alpine
#!/bin/bash

# ❌ NAIVE — passes flags as single arg to env, non-portable
#!/usr/bin/env bash -euo pipefail

# ✅ CORRECT — portable, strict mode set in-body (not shebang)
#!/usr/bin/env bash
set -euo pipefail
```
::

## `set -e` Doesn't Catch Everything

::code-wrapper{language="bash"}
```bash
set -e

# ── Commands whose exit status is "tested" don't trigger -e ──
false && echo "never"          # OK — false is tested by &&
if false; then echo "never"; fi # OK — false is tested by if
false || true                   # OK — false is tested by ||
! false                         # OK — negated

# ── Pipeline: only the LAST command's status matters (without pipefail) ──
false | true                     # exit 0 — false is masked!
# pipefail fixes this: set -o pipefail  → false | true exits 1.

# ── Functions: a function returning non-zero triggers -e ONLY if called as a simple command ──
maybe_fail() { return 1; }
maybe_fail                       # ✗ script exits (simple command)
maybe_fail || true               # OK — tested by ||
if maybe_fail; then echo "ok"; fi # OK — tested by if

# ── Subshell vs command substitution ──
(false)                           # ✗ subshell failure propagates with -e
x=$(false)                       # ✗ command substitution failure propagates with -e (Bash 4.4+)
x=$(false) || true               # OK — tested

# ── `grep` returns 1 when no match — silently kills the script ──
grep "pattern" file.txt          # ✗ if no match → exit 1 → script dies
grep "pattern" file.txt || true  # OK — explicit "no match is fine"
grep -q "pattern" file.txt && echo "found"  # OK — tested by &&
```
::

## `set -u` and the Default Expansion Trap

::code-wrapper{language="bash"}
```bash
set -u

echo "$UNDEFINED_VAR"             # ✗ bash: UNDEFINED_VAR: unbound variable — fatal
echo "${UNDEFINED_VAR:-}"         # OK — :- provides empty default, doesn't error
echo "${UNDEFINED_VAR:-default}"  # OK — provides "default"
echo "${UNDEFINED_VAR-default}"   # OK — but ONLY if unset; empty string still errors
echo "${UNDEFINED_VAR:?missing}"  # ✗ prints "missing" to stderr, exits — even with :-

# ── Arrays are tricky with set -u ──
declare -a arr=()
echo "${arr[@]}"                  # OK — empty array, no error (Bash 4.4+)
# Bash < 4.4: this errors ("unbound variable") — use ${arr[@]:-}

declare -A map=()
echo "${map[key]}"                # ✗ if key doesn't exist → unbound (some versions)
echo "${map[key]:-}"              # OK — safe access pattern
```
::

## Edge Cases: `echo` vs `printf` Portability

::code-wrapper{language="bash"}
```bash
# ── echo is non-portable for escape sequences ──
echo -e "line1\nline2"    # Bash: works. dash/POSIX sh: prints "-e line1\nline2" literally.
echo -n "no newline"      # Bash: works. Some systems: -n printed literally.

# ── printf is the portable choice ──
printf '%s\n' "line1" "line2"     # always: two lines with newlines
printf 'exit: %d\n' 42            # C-style format — consistent everywhere
printf '%-20s %5d\n' "label" 42   # left-align string (20 cols), right-align int (5 cols)
printf '%x\n' 255                 # ff (hex)
printf '%b\n' 'tab\there'         # interpret backslash escapes (like echo -e, but portable)
printf '%q\n' "string with spaces" # shell-quoted: string\ with\ spaces (safe for re-eval)

# ── echo behavior depends on xpg_echo and shopt ──
shopt -s xpg_echo   # echo now interprets \n, \t (like echo -e always)
echo "line1\nline2"  # prints two lines (xpg_echo on)
shopt -u xpg_echo   # echo now prints \n literally
```
::

## Edge Cases: CRLF Line Endings

::code-wrapper{language="bash"}
```bash
# Symptom: bash: ./script.sh: /usr/bin/env: bad interpreter: No such file or directory
# Cause: shebang is "#!/usr/bin/env bash\r" — \r is part of the interpreter name.

# Detect:
file script.sh  # "ASCII text, with CRLF line terminators"

# Fix:
sed -i 's/\r$//' script.sh
# Or: dos2unix script.sh
# Or in Vim: :set fileformat=unix

# Prevent in Git:
# .gitattributes:
# *.sh text eol=lf
```
::

## 💡 Tips & Tricks

::code-wrapper{language="bash"}
```bash
# ── Feature-gate by Bash version ──
if (( BASH_VERSINFO[0] >= 4 )); then
    declare -A config       # associative arrays (Bash 4+)
else
    # Fallback: parallel indexed arrays or a config file
    :
fi

# ── Gate by feature, not version (more robust) ──
if ! declare -A _test_map 2>/dev/null; then
    die "Associative arrays not available — need Bash 4+."
fi

# ── Detect if script is being sourced ──
# When sourced, BASH_SOURCE[0] != BASH_SOURCE[1] (caller). When executed, they match.
(return 0 2>/dev/null) && SOURCED=1 || SOURCED=0
if (( SOURCED )); then
    # Don't run main() when sourced — act as a library.
    :
else
    main "$@"
fi

# ── Atomic script self-exec: re-exec with bash if run by sh ──
if [ -z "${BASH_VERSION:-}" ]; then
    exec bash "$0" "$@"  # re-exec under bash if invoked by sh/dash
fi
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="bash"}
```bash
# ── Shebang max length is 128 bytes (BINPRM_BUF_SIZE - 2) ──
# A path longer than 126 chars silently fails with "No such file or directory".

# ── Shebang with spaces: kernel splits on first whitespace ──
#!/usr/bin/env bash  # "bash" is the single arg to env
# But: #!/usr/bin/env /opt/bash  → fails (env doesn't resolve absolute paths without PATH lookup)

# ── `set -e` is disabled inside command substitution in Bash < 4.4 ──
# Bash 4.3: x=$(false); echo "still here"  → prints "still here" (no exit!)
# Bash 4.4+: x=$(false); echo "still here" → exits (inherit_errexit helps too)

# ── `set -e` in a subshell with `|` ──
set -e
(echo "subshell"; false) | cat   # subshell exits 1, but pipefail needed to catch it
# Without pipefail: cat exits 0 → pipeline exits 0 → no failure detected.

# ── `trap ERR` doesn't fire on `exit` ──
# trap ERR fires on command failures. trap EXIT fires on any exit (including exit, set -e, signals).
# For cleanup, use trap EXIT. For logging the failing command, use trap ERR.
# Combine: trap 'err_handler' ERR; trap 'cleanup' EXIT

# ── `BASH_SOURCE[0]` vs `$0` ──
# $0: the name the script was invoked as (may be a symlink, or "bash" if sourced)
# BASH_SOURCE[0]: the file path of the current script (works when sourced)
# Use BASH_SOURCE[0] for SCRIPT_DIR — $0 is unreliable.
```
::

## 🧠 Quick Quiz

What exit code does this produce, and why?

::code-wrapper{language="bash"}
```bash
set -euo pipefail
false | true
echo "reached"
```
::

<details>
<summary>Answer</summary>

- `set -e` alone: pipeline exits with `true`'s status (0). Script continues, prints "reached". `false` is silently masked.
- `set -o pipefail`: pipeline exits with `false`'s status (1). `set -e` catches it, script dies before "reached".

**The lesson**: `set -e` without `pipefail` is a false sense of safety — the first command in a pipeline can fail silently. Always use the full `set -euo pipefail`.

</details>