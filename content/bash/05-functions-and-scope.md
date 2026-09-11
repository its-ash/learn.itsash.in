---
title: "Bash 05 — Function Internals, Scope Mechanics & Signal Traps"
description: "Deep-dive into Bash functions: call stack (FUNCNAME/BASH_SOURCE), dynamic scoping internals, return values (exit status vs stdout vs nameref), signal traps for cleanup, and production patterns for error propagation. Code-first reference for senior engineers."
---

# 05 — Function Internals, Scope Mechanics & Signal Traps

## Function Definition and the Call Stack

::code-wrapper{language="bash"}
```bash
# ── Two syntaxes ──
# POSIX-compatible (preferred — works in sh too):
greet() {
    echo "Hello, $1!"
}

# C-style (Bash-only, `function` keyword):
function greet() {
    echo "Hello, $1!"
}
# Note: `function greet` (without ()) is Bash-only and doesn't require ().

# ── The call stack: FUNCNAME, BASH_SOURCE, BASH_LINENO ──
trace() {
    local depth=${#FUNCNAME[@]}    # number of frames in the call stack
    for ((i = 0; i < depth - 1; i++)); do
        printf '%*s→ %s() at %s:%d\n' \
            "$((i * 2))" "" \
            "${FUNCNAME[i]}" \
            "$(basename "${BASH_SOURCE[i]}")" \
            "${BASH_LINENO[i]}"
    done
}

outer() { inner; }
inner() { trace; }
outer
# Output:
# → outer() at script.sh:12
#   → inner() at script.sh:11
#     → trace() at script.sh:7

# ── Functions get their own $1, $2, $@ (independent of the script's args) ──
show_args() {
    echo "function args ($#): $*"     # the function's args, NOT the script's
    echo "script args: $SCRIPT_ARGS"  # script args must be passed explicitly
}

SCRIPT_ARGS="$@"
show_args "alpha" "beta"   # function sees: alpha beta
# The script's $@ is NOT visible inside the function as $@ — only the function's $@.
```
::

## Return Values: Three Mechanisms

::code-wrapper{language="bash"}
```bash
# ── 1. Exit status (return) — 0-255, for boolean/success/failure ──
is_even() {
    (( $1 % 2 == 0 ))    # arithmetic: returns exit 0 if true, 1 if false
    # return is implicit — uses the last command's exit status
}

if is_even 4; then echo "even"; fi    # calls is_even, checks $?

# Explicit return:
is_even() {
    if (( $1 % 2 == 0 )); then
        return 0    # success/true
    else
        return 1   # failure/false
    fi
}

# ⚠️ return wraps to 0-255 (modulo 256):
return 300   # actual exit status: 44 (300 % 256)
# return is for FUNCTIONS. exit is for the SCRIPT. They're different!

# ── 2. stdout capture ($(...)) — for data ──
get_date() {
    printf '%s' "$(date +%Y-%m-%d)"   # printf (not echo) — no trailing newline in the capture
}

today=$(get_date)                    # captures stdout
echo "$today"                        # 2024-01-15

# ⚠️ echo vs printf in function output:
get_name() { echo "Alice"; }        # echo adds \n — $(...) strips trailing \n → "Alice"
get_name() { printf '%s' "Alice"; } # no \n — $(...) → "Alice" (same result, but explicit)

# ⚠️ Don't use echo for binary/special data — use printf:
get_bytes() { printf '\x01\x02'; }  # raw bytes — echo can't handle \x00 or \x01 safely

# ── 3. Nameref (local -n) — for complex data (arrays, multiple values) ──
parse_version() {
    local -n _result=$1   # nameref: _result is an alias for the caller's variable
    local input=$2
    IFS='.' read -ra _result <<< "$input"   # split into array, write via nameref
}

parse_version parts "1.2.3"
echo "${parts[@]}"    # 1 2 3 — the caller's `parts` array was populated by the function
# The function set a variable in the CALLER's scope by name.
```
::

## Anti-Pattern: `local` Masks `set -e` Failures

::code-wrapper{language="bash"}
```bash
set -e

# ❌ NAIVE — `local` always returns 0, masking the command's failure
bad_func() {
    local x=$(false)    # `local x=$(false)` — local's exit status is 0 (local always succeeds)
    echo "reached"      # "reached" — false's failure was MASKED by local!
}
bad_func   # prints "reached" — set -e didn't catch the false

# ✅ CORRECT — separate declaration and assignment
good_func() {
    local x
    x=$(false)          # x=$(false) — false's exit status propagates (set -e catches it)
    echo "reached"      # NEVER reached — script exits on the x=$(false) line
}
good_func   # script exits

# ── The mechanism ──
# `local` is a command that returns exit 0 (it's a variable declaration, always succeeds).
# When you write `local x=$(false)`, the $(false) runs, but local's exit status overrides it.
# With `set -e`, the masked failure doesn't trigger the exit.
# Fix: `local x; x=$(false)` — the assignment's exit status propagates.

# ── This also applies to declare ──
declare -i y=$(false)   # masked! declare returns 0.
declare -i y; y=$(false) # not masked — false propagates.
```
::

## Dynamic Scoping: How `local` Actually Works

::code-wrapper{language="bash"}
```bash
# ── Bash uses DYNAMIC scoping (not lexical) ──
# A `local` variable is visible to:
# 1. The function that declares it
# 2. ALL functions called BY that function (dynamic — based on call stack, not source code)

outer() {
    local x="outer's value"
    inner    # inner can SEE outer's x (dynamic scope)
    echo "after inner: x=$x"   # may have been modified by inner!
}

inner() {
    echo "inner sees: x=$x"    # "outer's value" — sees caller's local
    x="inner modified it"     # modifies OUTER's x (because inner didn't declare its own local x)
}

outer
# inner sees: x=outer's value
# after inner: x=inner modified it  ← outer's x was modified by inner!

# ── `local` shadows: if inner declares its own local, it doesn't see outer's ──
outer2() {
    local x="outer2"
    inner2
    echo "outer2 after: x=$x"   # "outer2" — inner2's local x is gone, outer2's is restored
}

inner2() {
    local x="inner2"           # declares its OWN x — shadows outer2's x
    echo "inner2 sees: x=$x"   # "inner2"
}

outer2
# inner2 sees: x=inner2
# outer2 after: x=outer2  ← outer2's x was NOT modified (inner2's local x shadowed it)

# ── Lexical scoping (Python/JS) vs Dynamic scoping (Bash) ──
# Python: inner() would NOT see x (x isn't defined in inner's lexical scope).
# Bash: inner() SEES x (x is on the call stack — outer declared it, inner is called by outer).
# This is powerful but dangerous — callees can modify caller's locals.
```
::

## Anti-Pattern: Accidental Global via Dynamic Scope

::code-wrapper{language="bash"}
```bash
# ❌ NAIVE — function modifies a variable without declaring it local
process() {
    count=$((count + 1))   # if count isn't local, this modifies the GLOBAL count!
    echo "processed: $count"
}

count=0
process   # processed: 1
process   # processed: 2
echo "global: $count"  # 2 — the function clobbered the global!

# ✅ CORRECT — use local for all function variables
process() {
    local count=$((count + 1))  # local count — but reads the global? NO!
    #  ^-- `local count=$((count + 1))` — the RHS reads the GLOBAL count, then local is created.
    #  This is a common bug: local count copies the global, increments the copy, then discards.
    echo "processed: $count"
}

count=0
process   # processed: 1 (local count = global 0 + 1)
process   # processed: 1 (local count = global 0 + 1 — global unchanged!)
echo "global: $count"  # 0 — global was never modified

# ── If you WANT to modify a global from a function, don't use local ──
increment_global() {
    count=$((count + 1))   # no local — modifies the global
}
count=0
increment_global
increment_global
echo "$count"   # 2 — global incremented

# ── Or use nameref for explicit pass-by-reference ──
increment_ref() {
    local -n _c=$1   # nameref to the caller's variable
    ((_c++))
}
count=0
increment_ref count   # passes the NAME "count"
echo "$count"   # 1 — modified via nameref
```
::

## Namerefs in Depth

::code-wrapper{language="bash"}
```bash
# ── `local -n` creates a nameref (Bash 4.3+) ──
# A nameref is an alias for another variable. Reads and writes go to the target.

target="hello"
declare -n ref=target   # ref is now a nameref to target
echo "$ref"              # hello — reads target
ref="world"             # writes to target
echo "$target"          # world — target was modified

# ── Returning arrays from functions via nameref ──
filter_files() {
    local -n _out=$1    # nameref to caller's array
    shift
    _out=()             # clear the target array
    local f
    for f in "$@"; do
        [[ -f "$f" ]] && _out+=("$f")   # write to caller's array via nameref
    done
}

existing_files=()
filter_files existing_files *.txt *.md *.json
echo "${existing_files[@]}"   # only files that actually exist

# ── ⚠️ Nameref circular reference ──
# If the nameref has the SAME NAME as the target, it's a circular reference:
circular() {
    local -n arr=$1   # if $1 is "arr" (same as the nameref name)...
    echo "${arr[@]}"
}
arr=(1 2 3)
circular arr   # ✗ "circular name reference" — arr references itself!

# Fix: use a distinct name for the nameref:
safe() {
    local -n _ref=$1   # _ref is different from any reasonable caller variable name
    echo "${_ref[@]}"
}
arr=(1 2 3)
safe arr   # ✓ works — _ref references arr, no collision

# ── nameref to an associative array ──
set_config() {
    local -n _cfg=$1
    _cfg[host]="localhost"
    _cfg[port]=8080
    _cfg[debug]=true
}
declare -A config
set_config config
echo "${config[host]}:${config[port]} debug=${config[debug]}"
# localhost:8080 debug=true
```
::

## Signal Traps: Cleanup and Graceful Shutdown

::code-wrapper{language="bash"}
```bash
# ── trap registers a handler for signals or pseudo-signals ──
# Signals: INT (Ctrl-C), TERM (kill), HUP (terminal closed), etc.
# Pseudo-signals: EXIT (any exit), ERR (command failure), DEBUG (before each command), RETURN

# ── Clean up temp files on any exit ──
tmpfile=$(mktemp)
tmpdir=$(mktemp -d)
trap 'rm -f "$tmpfile"; rm -rf "$tmpdir"' EXIT
# EXIT fires on: normal end, `exit`, `set -e` abort, and signals (if no specific trap).
# It fires in the exiting shell — so $tmpfile is still in scope.

# ── Graceful shutdown of a server ──
server_pid=""
cleanup() {
    if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
        echo "shutting down server (PID $server_pid)..." >&2
        kill "$server_pid"           # SIGTERM — let the server clean up
        wait "$server_pid" 2>/dev/null
    fi
}
trap cleanup EXIT INT TERM
# EXIT: normal exit or set -e abort
# INT:  Ctrl-C (user interrupt)
# TERM: kill (termination request)

# ── ERR trap: log the failing command and line ──
set -E   # -E makes ERR trap inherit into functions (essential!)
on_error() {
    local exit_code=$?
    echo "ERROR: '$BASH_COMMAND' failed (exit $exit_code) at line $LINENO" >&2
    # BASH_COMMAND: the command that triggered the error
    # LINENO: current line number
    # $?: the exit status (capture FIRST — any command overwrites $?)
}
trap on_error ERR
# ERR fires on any command failure (with set -e). Without set -e, ERR doesn't fire.

# ── DEBUG trap: trace every command ──
trace() {
    echo "DEBUG: line $LINENO: $BASH_COMMAND" >&2
}
trap trace DEBUG   # fires BEFORE every command — very verbose, but powerful for debugging

# ── Ignoring a signal (critical section) ──
trap '' INT    # ignore Ctrl-C during critical section
# ... critical work that shouldn't be interrupted ...
trap - INT    # restore default INT behavior (Ctrl-C kills the script)

# ── HUP for config reload ──
load_config() {
    # shellcheck source=/dev/null
    source "$CONFIG_FILE"
    echo "config reloaded"
}
trap load_config HUP   # kill -HUP $pid reloads config without restart

# ── Combining traps ──
# Multiple trap EXIT overwrite — last one wins. Combine in one function:
cleanup_all() {
    local exit_code=$?
    [[ -n "$server_pid" ]] && kill "$server_pid" 2>/dev/null
    [[ -n "$tmpfile" ]] && rm -f "$tmpfile"
    [[ -n "$tmpdir" ]] && rm -rf "$tmpdir"
    if ((exit_code != 0)); then
        echo "script failed (exit $exit_code)" >&2
    fi
    exit "$exit_code"   # preserve exit code
}
trap cleanup_all EXIT INT TERM
# Don't use separate trap cleanup EXIT + trap cleanup INT — the second overwrites the first.
```
::

## Production Pattern: Worker with Graceful Shutdown

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
set -Eeuo pipefail

# ── A worker that processes jobs and shuts down gracefully on signal ──

running=true
current_job=""

shutdown() {
    echo "[$(date -Iseconds)] shutdown requested, finishing current job..." >&2
    running=false
    # Don't exit immediately — let the main loop finish the current job.
    # The loop checks $running and exits cleanly.
}
trap shutdown INT TERM

process_job() {
    local job=$1
    current_job="$job"
    echo "[$(date -Iseconds)] processing: $job" >&2
    sleep 1   # simulate work
    current_job=""
}

main() {
    local jobs=("task1" "task2" "task3" "task4" "task5")
    for job in "${jobs[@]}"; do
        $running || break   # check shutdown flag
        process_job "$job"
    done
    echo "[$(date -Iseconds)] all jobs processed or shutdown complete" >&2
}

main "$@"
```
::

## Exporting Functions to Child Processes

::code-wrapper{language="bash"}
```bash
# ── Functions are NOT inherited by child processes (only subshells) ──
my_func() { echo "hello from $0"; }
my_func                  # hello from script.sh (current shell)
bash -c 'my_func'        # bash: my_func: command not found (child doesn't see it)

# ── `export -f` makes a function available to child processes ──
export -f my_func
bash -c 'my_func'        # hello from bash (child now has the function)

# ── Use case: xargs/find -exec (they run in child processes) ──
process_file() {
    local f=$1
    echo "processing $f"
    # ... real work ...
}
export -f process_file

# xargs runs `bash -c` in a subprocess — the function must be exported
find . -name '*.txt' -print0 | xargs -0 -P4 -I{} bash -c 'process_file "$1"' _ {}

# ── ⚠️ `export -f` serializes the function body as an environment variable ──
# The function becomes BASH_FUNC_my_func%% env var (with the function body as value).
# This is a potential injection vector if function names come from untrusted input.
# Don't export functions with names from untrusted sources.

# ── ⚠️ `export -f` doesn't work with local-scope variables ──
# If the function references global variables, those must ALSO be exported:
DATA="shared"
export DATA
use_data() { echo "$DATA"; }
export -f use_data
bash -c 'use_data'   # shared — DATA was exported too
```
::

## Recursion: Works But Slow

::code-wrapper{language="bash"}
```bash
# ── Each $(...) call forks a subprocess — recursion is O(2^n) subprocesses ──
fib() {
    if (( $1 <= 1 )); then
        echo "$1"
    else
        echo $(( $(fib $(($1 - 1))) + $(fib $(($1 - 2))) ))
        # Each fib call forks: 2 subprocesses per call → exponential
    fi
}

time fib 15   # ~2s (300+ subprocess forks)
time fib 20   # ~30s (thousands of subprocess forks)
time fib 30   # minutes — don't do this

# ── Iterative version (no subprocesses) ──
fib_iter() {
    local n=$1 a=0 b=1
    for ((i = 0; i < n; i++)); do
        ((a, b = b, a + b))   # swap: a gets b's old value, b gets a+b (parallel assignment)
    done
    echo "$a"
}
time fib_iter 30   # <0.01s — iterative is 1000x faster

# ── If you MUST recurse, avoid $() — use namerefs or a different language ──
# For pure computation, Bash is the wrong tool. Use Python/awk for complex algorithms.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="bash"}
```bash
# ── Parallel assignment via arithmetic context ──
a=1; b=2
((a, b = b, a))   # swap! a=2, b=1 (comma operator in ((...)) evaluates left-to-right)
# This is the Bash idiom for swapping two variables without a temp.

# ── Default arguments for functions ──
greet() {
    local name=${1:-World}   # default to "World" if no arg
    local greeting=${2:-Hello} # default to "Hello" if no second arg
    echo "$greeting, $name!"
}
greet          # Hello, World!
greet Alice    # Hello, Alice!
greet Alice Hi # Hi, Alice!

# ── Function that accepts a variable number of args ──
sum() {
    local total=0 n
    for n in "$@"; do
        ((total += n))
    done
    echo "$total"
}
sum 1 2 3 4 5   # 15

# ── `local -A` for function-private associative arrays ──
parse_kv() {
    local -A result   # function-local associative array
    local pair
    for pair in "$@"; do
        local key="${pair%%=*}"   # everything before first =
        local val="${pair#*=}"    # everything after first =
        result["$key"]="$val"
    done
    # Can't return an array — use nameref for the caller
    # Or print as key=value pairs and parse in the caller
    for key in "${!result[@]}"; do
        printf '%s=%s\n' "$key" "${result[$key]}"
    done
}

# ── `trap '' ''` to clear a trap ──
trap - EXIT   # remove the EXIT trap (useful in subshells that shouldn't clean up parent's state)
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="bash"}
```bash
# ── Functions must be defined BEFORE they're called ──
# Bash reads top-to-bottom — no hoisting (unlike Python/JS).
# A function called before its definition: "command not found".
# Put all functions at the top, call main "$@" at the bottom.

# ── `$0` inside a function is the script name, not the function ──
my_func() { echo "$0"; }   # prints script name, NOT "my_func"
# Use ${FUNCNAME[0]} for the current function name:
my_func() { echo "${FUNCNAME[0]}"; }   # "my_func"

# ── `return` vs `exit` in a sourced script ──
# `exit` in a sourced script closes the CALLER's shell!
# `return` exits the function/sourced script and returns to the caller.
# In a sourced library: use `return`, never `exit`.

# ── `trap` in a subshell doesn't affect the parent ──
# Traps are shell-specific. `( trap 'echo sub' EXIT )` — the subshell's trap
# doesn't apply to the parent shell.

# ── `trap EXIT` with `set -e` ──
# On a `set -e` abort, EXIT still fires (good — cleanup runs).
# But the exit code in the EXIT trap is the failure's code, not 0.
# Capture it: cleanup() { local code=$?; ...; exit "$code"; }

# ── Nameref to a non-existent variable creates it ──
declare -n ref=nonexistent
ref="value"        # creates `nonexistent` with value "value" (not an error)
echo "$nonexistent"  # value — created on first write

# ── `local` on a nameref is Bash 4.3+ ──
# `local -n` requires Bash 4.3+. On older Bash, use `declare -n` (but not function-scoped).

# ── Functions can be overridden ──
greet() { echo "v1"; }
greet() { echo "v2"; }   # redefinition — silently replaces v1
greet   # v2 — last definition wins. No warning. Be careful with sourcing libraries.
```
::

## 🧠 Quick Quiz

What's wrong with this cleanup?

::code-wrapper{language="bash"}
```bash
set -e
tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"; exit 0' EXIT
false
```
::

<details>
<summary>Answer</summary>

Two problems:

1. **`exit 0` in the EXIT trap overrides the error exit code.** The script fails on `false` (set -e), which should exit with code 1. But the EXIT trap runs `exit 0`, so the script exits with 0 (success) — the failure is **masked**. CI/CD would see success.

2. **The EXIT trap fires on `set -e` abort** — which is good (cleanup runs), but `exit 0` discards the error.

**Fix**: preserve the exit code:

```bash
set -e
tmpfile=$(mktemp)
cleanup() {
    local code=$?    # capture the exit code BEFORE any other command
    rm -f "$tmpfile"
    exit "$code"     # preserve the original exit code (0 for success, non-zero for error)
}
trap cleanup EXIT
false   # exits 1 → cleanup runs → exits 1 (correct)
```

**The lesson**: always capture `$?` as the first thing in an EXIT trap and `exit "$?"` to preserve the original exit code. `exit 0` in cleanup masks failures.

</details>