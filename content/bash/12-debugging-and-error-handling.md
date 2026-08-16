# 12 — Debugging & Error Handling

Bash's error handling is minimal by default — commands fail silently, unset variables are empty. `set -euo pipefail` and careful checks make scripts robust.

## `set` Options (Strict Mode)

::code-wrapper{language="bash"}
```bash
set -e             # exit on error (non-zero exit status)
set -u             # error on unset variable
set -o pipefail    # a pipeline fails if any command fails
set -x             # print commands before execution (trace)
set -E             # trap ERR inherits (function context)

# Combined (the strict mode)
set -euo pipefail
```

### The strict mode

Always start scripts with:

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
set -euo pipefail
```

- **`-e`** — exit immediately if a command fails (non-zero exit status). Catches errors that would otherwise be silent.
- **`-u`** — treat unset variables as an error (not empty). Catches typos like `$FOO` instead of `$FOO_BAR`.
- **`-o pipefail`** — a pipeline (`cmd1 | cmd2`) fails if *any* command fails (not just the last). Without it, `cmd1` failing is masked if `cmd2` succeeds.

### `-e` exceptions

`set -e` doesn't apply to commands whose exit status is tested:

::code-wrapper{language="bash"}
```bash
set -e
false                # ✗ exits immediately
if false; then ...   # ✓ (tested by if)
false || true        # ✓ (tested by ||)
! false              # ✓ (negated)
```

This is useful but can surprise — `cmd` in `cmd | grep` won't trigger `-e` if `grep` succeeds (but `pipefail` catches `cmd`).

## Manual Error Checking

For commands where you want a custom error (not `set -e`'s immediate exit):

::code-wrapper{language="bash"}
```bash
if ! cd "$dir"; then
	echo "Error: can't cd to $dir" >&2
	exit 1
fi

# Or with ||
cd "$dir" || { echo "Error: can't cd to $dir" >&2; exit 1; }
```

### `trap ERR` (run on error)

::code-wrapper{language="bash"}
```bash
err_handler() {
	echo "Error on line $1: command failed" >&2
	exit 1
}

trap 'err_handler $LINENO' ERR
```

`trap '...' ERR` runs when a command fails (with `set -e`). `$LINENO` is the line number. Useful for logging where the script failed.

## `set -x` (tracing)

::code-wrapper{language="bash"}
```bash
set -x        # print each command before running
echo "hello"  # + echo hello
set +x        # turn off
```

`set -x` (trace) prints each command (with `+`) before execution — the primary debugging tool. Turn on for a section, off after.

### `PS4` (trace prompt)

::code-wrapper{language="bash"}
```bash
PS4='+ $LINENO: ' set -x   # include line numbers in trace
```

`PS4` is the trace prompt (default `+`). Customize to include `$LINENO` for "which line is running."

### `bash -x script.sh`

::code-wrapper{language="bash"}
```bash
bash -x script.sh   # run with tracing (from the command line)
```

No need to edit the script — trace from the CLI.

## Logging

::code-wrapper{language="bash"}
```bash
log() {
	echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" >&2
}

log "Starting process"
log "Error: something failed"
```

Log to stderr (`>&2`) so it doesn't mix with stdout (data). Include timestamps.

## Exit Codes

::code-wrapper{language="bash"}
```bash
exit 0    # success
exit 1    # general failure
exit 2    # usage error (misuse of shell builtin)
exit 126  # command not executable
exit 127  # command not found
exit 130  # terminated by Ctrl-C (128 + SIGINT(2))
# 128 + N: killed by signal N
```

Use meaningful exit codes. Scripts in CI/CD and pipelines rely on them.

## Common Error Patterns

### Check command success

::code-wrapper{language="bash"}
```bash
if ! command -v git &>/dev/null; then
	echo "Error: git is not installed" >&2
	exit 1
fi
```

`command -v` checks if a command exists (portable `which`).

### Check file existence

::code-wrapper{language="bash"}
```bash
[[ -f "$file" ]] || { echo "Error: $file not found" >&2; exit 1; }
[[ -d "$dir" ]]  || { echo "Error: $dir not a directory" >&2; exit 1; }
```

### Check args

::code-wrapper{language="bash"}
```bash
if [[ $# -lt 1 ]]; then
	echo "Usage: $0 <input>" >&2
	exit 1
fi
```

### Check dependencies

::code-wrapper{language="bash"}
```bash
for cmd in git curl jq; do
	command -v "$cmd" &>/dev/null || { echo "Error: $cmd not found" >&2; exit 1; }
done
```

## Debugging Techniques

### `set -x` + `set -v`

::code-wrapper{language="bash"}
```bash
set -xv   # -x (trace commands), -v (print input lines)
```

`-v` prints input lines as read (before expansion); `-x` prints commands after expansion (before execution). Together, you see the raw line and the expanded command.

### `bashdb` (debugger)

[bashdb](https://bashdb.sourceforge.net) is a gdb-like debugger for Bash — breakpoints, step, inspect. Install: `brew install bashdb`.

### Print variables

::code-wrapper{language="bash"}
```bash
echo "DEBUG: var=$var, count=$count" >&2
declare -p arr   # print an array's definition (for debugging)
```

`declare -p` prints a variable's definition (useful for arrays/associative arrays).

### Dry-run mode

::code-wrapper{language="bash"}
```bash
dry_run=false
[[ "$1" == "--dry-run" ]] && dry_run=true

run() {
	if $dry_run; then
		echo "DRY RUN: $*" >&2
	else
		"$@"
	fi
}

run rm -f "$file"
run cp "$src" "$dst"
```

A `run` function that echoes in dry-run mode, executes otherwise. Useful for dangerous scripts.

## 💡 Tips & Tricks

- **Idiom**: always start scripts with `set -euo pipefail` (strict mode) — `-e` exits on error, `-u` errors on unset variables, `pipefail` catches pipeline failures. This catches most bugs. Combine with `trap ERR` for error logging.
- **Idiom**: use `set -x` (or `bash -x script.sh`) for tracing — prints each command before execution, the primary debugging tool. `PS4='+ $LINENO: '` adds line numbers. Turn on for a section (`set -x`), off after (`set +x`).
- **Idiom**: use `trap 'err_handler $LINENO' ERR` for error logging — runs on any command failure (with `set -e`), logging the line number. Combine with `trap cleanup EXIT` for cleanup. Use `$LINENO` and `$BASH_COMMAND` for context.
- **Idiom**: log to stderr (`>&2`) with timestamps — `log() { echo "[$(date +%T)] $*" >&2; }`. Keeps logs separate from stdout (data). CI captures stderr. Include timestamps for debugging.
- **Idiom**: check dependencies with `command -v` — `command -v git &>/dev/null || { echo "git not found" >&2; exit 1; }`. Portable (unlike `which`). Check at script start for required tools.

## ⚠️ Edge Cases & Gotchas

- **`set -e` doesn't catch everything**: commands in `if`/`while`/`&&`/`||` conditions don't trigger exit. Functions can mask errors (return non-zero → exit unless checked). Use `set -e` but don't rely on it blindly.
- **`set -e` in pipelines needs `pipefail`**: `cmd1 | cmd2` — without `pipefail`, only `cmd2`'s status matters. `cmd1` failing is masked. `set -o pipefail` makes any failure propagate.
- **`set -u` and default expansions**: `${var:-default}` works with `-u` (doesn't error). But `$var` (unset) errors. Use `:-`/`:+` for optional vars.
- **`set -e` and subshells**: a subshell `(cmd)` that fails — does the parent exit? With `-e`, yes (the subshell's failure propagates). But `cmd` in `$(cmd)` doesn't trigger `-e` (command substitution).
- **`set -e` and functions**: a function returning non-zero triggers `-e` *if called as a simple command*. But `func || true` masks it. And `if func; then` tests it (no exit). Be careful with functions that "fail" intentionally.
- **`$LINENO` in `trap ERR`**: gives the line where the failing command is, but if the command is in a function, `$LINENO` is relative to the function. Use `${BASH_LINENO[0]}` for the caller's line.
- **`set -x` is verbose**: it prints *every* command, including expansions. For large scripts, it's noisy. Use `set -x` / `set +x` around a section, or `bash -x` from the CLI for a full trace.
- **`trap ERR` doesn't fire for all failures**: it fires for command failures (with `set -e`), but not for syntax errors (which abort before running) or `exit`. `trap EXIT` fires on any exit.
- **Exit code 130 (Ctrl-C)**: 128 + 2 (SIGINT). 137 = 128 + 9 (SIGKILL). 143 = 128 + 15 (SIGTERM). Knowing the signal codes helps debug "why did my script die."
- **`set -e` with `grep` (no match)**: `grep` returns 1 if no match — with `set -e`, this exits the script. Use `grep ... || true` or `grep -q ... && ...` (tested) to avoid.

## 🧠 Spot the Bug

A developer enables `set -e`, but a pipeline failure is missed:

::code-wrapper{language="bash"}
```bash
set -e
grep "error" log.txt | head -5
echo "Done"
```

If `log.txt` doesn't exist, `grep` fails, but the script continues to "Done". Why?

<details>
<summary>Answer</summary>

Without `set -o pipefail`, a pipeline's exit status is the *last* command's status. `grep "error" log.txt | head -5` — if `grep` fails (file not found), but `head` succeeds (it got no input but exited 0), the pipeline's status is `head`'s (0). `set -e` sees 0 (success) and doesn't exit.

The fix — enable `pipefail`:

```bash
set -eo pipefail
grep "error" log.txt | head -5
echo "Done"
```

With `pipefail`, the pipeline fails if *any* command fails — `grep`'s failure propagates, and `set -e` exits before "Done".

The full strict mode is `set -euo pipefail` — always use all four for robust scripts.

**The lesson**: without `pipefail`, a pipeline's exit status is only the last command's. `cmd1 | cmd2` — `cmd1` failing is masked if `cmd2` succeeds. `set -o pipefail` makes any command's failure propagate. Always use `set -euo pipefail` (the full strict mode).

</details>

## Summary

You can use strict mode (`set -euo pipefail`), `set -x` tracing (with `PS4`/`$LINENO`), `trap ERR` for error logging, `trap EXIT` for cleanup, manual error checks (`if !`, `||`), logging (to stderr with timestamps), meaningful exit codes, dependency checks (`command -v`), and debugging techniques (`declare -p`, `bashdb`, dry-run) — with the `pipefail`-needed and `set -e`-exceptions traps internalized. Next: best practices and idioms.