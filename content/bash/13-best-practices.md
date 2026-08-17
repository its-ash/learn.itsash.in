# 13 — Best Practices & Idioms

Writing maintainable Bash scripts: structure, naming, quoting, strict mode, and idiomatic patterns.

## Script Structure

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
set -euo pipefail

# --- Constants ---
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly VERSION="1.0.0"

# --- Global variables ---
declare -A config

# --- Functions ---
usage() {
	cat <<EOF
Usage: $0 [OPTIONS] <input>

Options:
  -h, --help     Show this help
  -v, --verbose  Verbose output
  -o, --output   Output file
EOF
}

cleanup() {
	[[ -n "${tmpfile:-}" ]] && rm -f "$tmpfile"
}

main() {
	parse_args "$@"
	do_work
}

# --- Trap ---
trap cleanup EXIT

# --- Entry point ---
main "$@"
```
::
Structure: shebang → strict mode → constants → globals → functions → trap → entry (`main "$@"`). Define functions before calling them (Bash reads top-to-bottom).

## Naming Conventions

- **Variables**: `lower_case` (e.g., `file_count`, `tmpfile`). Constants: `UPPER_CASE` (e.g., `SCRIPT_DIR`, `VERSION`).
- **Functions**: `lower_case` with verbs (e.g., `parse_args`, `do_work`, `cleanup`).
- **Arrays**: `lower_case` (e.g., `files`, `results`).
- **Avoid**: ALLCAPS for regular variables (conflicts with env vars like `PATH`, `HOME`).

## The `main` Function Pattern

::code-wrapper{language="bash"}
```bash
main() {
	parse_args "$@"
	validate
	do_work
}

main "$@"
```
::
Put logic in `main`, call it at the end with `"$@"`. This:
- Keeps all logic in functions (testable, reusable).
- Avoids top-level execution (which runs even if the script is `source`d).
- Provides a clear entry point.

## `readonly` and `declare -r`

::code-wrapper{language="bash"}
```bash
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly VERSION="1.0.0"
# SCRIPT_DIR="other"  # ✗ bash: SCRIPT_DIR: readonly variable
```
::
Use `readonly` for constants — catches accidental reassignment.

## `SCRIPT_DIR` (script's directory)

::code-wrapper{language="bash"}
```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
```
::
This reliably gets the script's directory (even if called from elsewhere, or via symlink — for symlinks, resolve first). Use for paths relative to the script (config files, libraries).

## Sourcing Libraries

::code-wrapper{language="bash"}
```bash
# lib/utils.sh
log() { echo "[$(date +%T)] $*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# script.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/utils.sh"
log "Starting"
```
::
`source` (or `.`) runs a file in the current shell — functions and variables become available. Use for reusable libraries.

## Guard Against Re-Sourcing

::code-wrapper{language="bash"}
```bash
# lib/utils.sh
[[ -n "${_UTILS_SOURCED:-}" ]] && return 0
_UTILS_SOURCED=1

log() { ... }
```
::
Prevents re-defining functions if the file is sourced twice.

## `die` (error and exit)

::code-wrapper{language="bash"}
```bash
die() {
	echo "ERROR: $*" >&2
	exit 1
}

[[ -f "$file" ]] || die "File not found: $file"
```
::
A common idiom: print an error to stderr and exit. Use for fatal errors.

## `require` (check a command exists)

::code-wrapper{language="bash"}
```bash
require() {
	command -v "$1" &>/dev/null || die "Missing required command: $1"
}

require git
require curl
```
::
## Quoting Rules

- **Always quote variable expansions**: `"$var"`, `"${arr[@]}"`, `"$(cmd)"`.
- **Only omit quotes for `[[ ]]` conditions** (no word-splitting there) or when you *want* word-splitting (rare).
- **Quote even when "safe"**: `"$var"` is always safe; unquoted is sometimes wrong. Consistency is safer than reasoning each time.

## Avoid `eval`

::code-wrapper{language="bash"}
```bash
# ❌ eval (dangerous — code injection)
eval "echo $user_input"

# ✓ indirect expansion (Bash)
var="user_input"
echo "${!var}"   # expands the variable named by $var
```
::
`eval` runs a string as a command — code injection risk. Use indirect expansion (`${!var}`), namerefs (`local -n`), or arrays instead.

## Check Required Args

::code-wrapper{language="bash"}
```bash
if [[ $# -lt 1 ]]; then
	usage
	exit 1
fi
```
::
Always provide a `usage` function and call it on bad input.

## Idempotent Scripts

Make scripts safe to run multiple times:

::code-wrapper{language="bash"}
```bash
mkdir -p "$dir"           # no error if exists
[[ -f "$file" ]] || touch "$file"
[[ -d "$dir" ]] || mkdir "$dir"
```
::
`mkdir -p`, `touch`, `[[ -e ]] || create` — safe to rerun.

## Temp Files (recap)

::code-wrapper{language="bash"}
```bash
tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT
```
::
Always `mktemp` + `trap` cleanup. Never `/tmp/myscript.$$`.

## Output to stderr for Messages

::code-wrapper{language="bash"}
```bash
echo "Processing..." >&2   # status/log to stderr
echo "$result"             # data to stdout
```
::
Keep stdout for data (machine-parseable), stderr for messages (human). This lets `result=$(script.sh)` capture only data.

## 💡 Tips & Tricks

- **Idiom**: always start with `#!/usr/bin/env bash` + `set -euo pipefail` — portable shebang, strict mode (exit on error, unset var error, pipeline failure). The foundation of a robust script.
- **Idiom**: use a `main` function — put all logic in `main()`, call `main "$@"` at the end. Keeps logic in functions (testable, reusable), avoids top-level execution (safer if `source`d), clear entry point.
- **Idiom**: use `readonly` for constants and `local` for function variables — `readonly SCRIPT_DIR=...` (catches reassignment), `local x=0` (function-scoped, no global pollution). Both catch common bugs.
- **Idiom**: use a `die` function for fatal errors — `die() { echo "ERROR: $*" >&2; exit 1; }` and `[[ -f $f ]] || die "missing"`. Consistent error handling, cleaner than repeated `echo ... exit 1`.
- **Idiom**: keep stdout for data, stderr for messages — `echo "$result"` (stdout, machine-parseable), `echo "Processing..." >&2` (stderr, human). Lets `result=$(script.sh)` capture only data, logs separate.

## ⚠️ Edge Cases & Gotchas

- **Functions must be defined before use**: Bash reads top-to-bottom. A function called before its definition fails. Put all functions first, call `main "$@"` at the end.
- **`BASH_SOURCE[0]` vs `$0`**: `$0` is the script name (or the shell if `source`d). `BASH_SOURCE[0]` is the current file's path (works in `source`d files). Use `BASH_SOURCE[0]` for `SCRIPT_DIR`.
- **`source` in a script runs in the current shell**: variables/functions from the sourced file are available (and pollute the scope). Guard with `[[ -n $_SOURCED ]] && return 0`.
- **`eval` is dangerous**: `eval "$user_input"` runs arbitrary code. Use `${!var}` (indirect), `declare -n` (nameref), or arrays. Never `eval` untrusted input.
- **Uppercase variable names can conflict with env vars**: `PATH`, `HOME`, `USER`, `TERM` are env vars. Don't use ALLCAPS for regular vars (use `lower_case`). `readonly` ALLCAPS for constants only.
- **`set -e` in a `source`d script**: `set -e` applies to the current shell. `source`ing a script with `set -e` enables it in the caller (surprising). Use `set -e` in scripts, not libraries.
- **`mkdir -p` is idempotent**: no error if the dir exists. `mkdir` (without `-p`) errors. Use `-p` for idempotent scripts.
- **`trap EXIT` runs once**: at exit. If you `trap EXIT` multiple times, the last one wins. Combine all cleanup in one function.
- **`return` vs `exit` in a function**: `return` exits the function (with a status); `exit` exits the script. In a `source`d file, `exit` would close the caller's shell — use `return`.
- **Quoting `"$var"` is always safe**: even when "unnecessary" (e.g., `[[ $var ]]`), quoting is safe. Unquoting is sometimes wrong. Consistency (always quote) is safer than case-by-case reasoning.

## 🧠 Spot the Bug

A developer gets the script's directory, but it breaks when the script is called via a symlink:

::code-wrapper{language="bash"}
```bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
```
::

What's the issue?

<details>
<summary>Answer</summary>

`$0` is the path used to invoke the script — if it's a symlink (`/usr/local/bin/myscript` → `/opt/myscript/script.sh`), `dirname "$0"` gives `/usr/local/bin` (the symlink's directory), not the real script's directory (`/opt/myscript`). Resources relative to `SCRIPT_DIR` (config files, libraries) won't be found.

The fix — use `BASH_SOURCE[0]` (more reliable than `$0`, works when `source`d) and resolve symlinks:

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
```
::
`BASH_SOURCE[0]` is the current file's path. For symlinks, resolve them:

```bash
SOURCE="${BASH_SOURCE[0]}"
while [[ -L "$SOURCE" ]]; do   # follow symlinks
	SCRIPT_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
	SOURCE="$(readlink "$SOURCE")"
	[[ "$SOURCE" != /* ]] && SOURCE="$SCRIPT_DIR/$SOURCE"   # resolve relative
done
SCRIPT_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
```
::
Or, if `realpath` is available (GNU coreutils / macOS 12.3+):

```bash
SCRIPT_DIR="$(dirname "$(realpath "${BASH_SOURCE[0]}")")"
```
::
**The lesson**: `$0` is the invocation path (may be a symlink). Use `BASH_SOURCE[0]` (works when `source`d) and resolve symlinks (`readlink` loop or `realpath`) for the real script directory. This matters when resources (config, libs) are relative to the script.

</details>

## Summary

You know the script structure (shebang → strict mode → constants → functions → trap → `main "$@"`), naming (`lower_case` vars, `UPPER_CASE` constants, verb functions), the `main` pattern, `readonly`/`local`, `SCRIPT_DIR` with `BASH_SOURCE[0]`, sourcing libraries, `die`/`require` idioms, quoting rules, avoiding `eval`, idempotent operations, stderr for messages, and temp file cleanup — with the `$0`-vs-`BASH_SOURCE` and `eval` traps internalized. Next: testing Bash scripts.