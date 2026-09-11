---
title: "Bash 11 — Argument Parsing Internals: getopts, Subcommands & CLI Design"
description: "Deep-dive into Bash argument parsing: positional args, getopts state machine, manual long-option parsing with while/case, subcommand dispatch, stdin detection, and production CLI patterns. Code-first reference for senior engineers."
---

# 11 — Argument Parsing Internals: getopts, Subcommands & CLI Design

## Positional Arguments: Internal Mechanics

::code-wrapper{language="bash"}
```bash
# ── Positional parameters: $1, $2, ..., $9, ${10}, ${10}+ ──
echo "$0"          # script name (or the shell if sourced — use BASH_SOURCE[0] instead)
echo "$1"          # first arg
echo "$2"          # second arg
echo "${10}"       # 10th arg — MUST use braces! ($10 is $1 followed by literal "0")
echo "$@"          # all args, each separate (USE QUOTED: "$@")
echo "$*"          # all args joined by IFS into one string
echo "$#"          # count of args

# ── shift: remove args from the front ──
set -- a b c d e   # set positional args (for demo)
echo "$@"          # a b c d e
shift              # remove $1 (a), shift rest left
echo "$@"          # b c d e
shift 2            # remove $1 and $2 (b, c)
echo "$@"          # d e

# ── Iterating all args ──
for arg in "$@"; do    # ALWAYS quote "$@" — preserves args with spaces
    echo "arg: $arg"
done

# ── Passing args to a function ──
process() {
    echo "function sees $# args: $@"
}
process "$@"   # pass the script's args to the function (quoted — safe)
```
::

## `getopts`: The Built-In Option Parser

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
# ── getopts parses short options: -v, -o VALUE, -h ──
# It's a built-in (no subprocess), POSIX, and reliable (unlike external `getopt`).

verbose=false
output=""
count=0

# ── Syntax: getopts "OPTIONS" var ──
# Options string: each letter is an option. A letter followed by `:` takes an argument.
# Leading `:` enables silent error reporting (you handle errors with ? and :).
while getopts ":hvo:c:" opt; do
    # :hvo:c: →
    #   h    → flag (no argument)
    #   v    → flag (no argument)
    #   o:   → option with argument (OPTARG)
    #   c:   → option with argument
    # Leading : → silent mode (don't print error, set opt to ? or :)

    case "$opt" in
        h)
            echo "Usage: $0 [-h] [-v] [-o FILE] [-c N]"; exit 0
            ;;
        v) verbose=true ;;
        o) output="$OPTARG" ;;      # OPTARG: the argument value for -o
        c) count="$OPTARG" ;;
        \?)                          # ? — invalid option
            echo "Invalid option: -$OPTARG" >&2
            exit 1
            ;;
        :)                           # : — missing argument
            echo "Option -$OPTARG requires an argument." >&2
            exit 1
            ;;
    esac
done
shift $((OPTIND - 1))   # OPTIND: index of next arg. Shift to remove parsed options.

# After shift, "$@" contains only positional args (not options)
echo "verbose: $verbose"
echo "output: $output"
echo "count: $count"
echo "positional: $@"
```
::

## `getopts` Internals: State Machine

::code-wrapper{language="bash"}
```bash
# ── How getopts works internally ──
# getopts maintains two global variables:
# OPTIND — index of the next arg to process (starts at 1)
# OPTARG — the argument value for options that take one (-o value → OPTARG="value")

# ── Each call to getopts processes ONE option ──
# It looks at $OPTIND in "$@", finds the next -flag, and:
#   - Sets $opt to the flag letter
#   - If the flag takes an arg (followed by :), sets $OPTARG to the value
#   - Increments $OPTIND
# Returns 0 (success) if an option was found, 1 (failure) at end of options.

# ── -o value vs -ovalue (both work) ──
./script.sh -o output.txt    # OPTARG="output.txt"
./script.sh -ooutput.txt     # OPTARG="output.txt" (attached — also works)

# ── Combined short flags ──
./script.sh -vo output.txt   # -v and -o output.txt (combined: -v is a flag, -o takes arg)
# getopts processes: v (flag), then o (with arg "output.txt")

# ── -- ends option parsing ──
./script.sh -v -- -o output.txt
# -v is parsed as a flag. -- stops option parsing.
# After shift: "$@" = "-o output.txt" (the -o is a POSITIONAL arg, not an option!)

# ── Options after positional args STOP parsing ──
./script.sh file.txt -v
# getopts stops at "file.txt" (first non-option). -v is NOT parsed — it's positional!
# This is a getopts limitation: options must come BEFORE positional args.
# Fix: use manual parsing (below) for intermixed args, or document the order.
```
::

## Anti-Pattern: Forgetting `shift` After `getopts`

::code-wrapper{language="bash"}
```bash
# ❌ NAIVE — no shift, positional args include the options
while getopts "vo:" opt; do
    case "$opt" in
        v) verbose=true ;;
        o) output="$OPTARG" ;;
    esac
done
echo "positional: $@"    # -v -o output.txt file1 file2 — still includes options!

# ✅ CORRECT — shift after the loop
while getopts "vo:" opt; do
    case "$opt" in
        v) verbose=true ;;
        o) output="$OPTARG" ;;
    esac
done
shift $((OPTIND - 1))   # remove parsed options, leave positional args
echo "positional: $@"    # file1 file2 — options stripped

# ── Why OPTIND - 1 ──
# OPTIND is the index of the NEXT arg to process (after getopts stops).
# If 3 options were parsed (-v -o out.txt), OPTIND=4.
# shift $((4-1)) = shift 3 → removes -v, -o, out.txt, leaving positional args.
```
::

## Long Options: Manual Parsing

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
# ── Manual parsing for long options (--verbose, --output FILE) ──
# More verbose than getopts, but supports --long-option.

verbose=false
output=""
input=""
count=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        # ── Flags (no argument) ──
        -v|--verbose)
            verbose=true
            shift
            ;;
        -h|--help)
            usage; exit 0
            ;;

        # ── Options with argument: --output VALUE ──
        -o|--output)
            output="$2"
            shift 2    # consume --output AND the value
            ;;
        -i|--input)
            input="$2"
            shift 2
            ;;
        -c|--count)
            count="$2"
            shift 2
            ;;

        # ── Options with = syntax: --output=VALUE ──
        --output=*)
            output="${1#--output=}"   # strip the --output= prefix
            shift
            ;;
        --input=*)
            input="${1#--input=}"
            shift
            ;;

        # ── End of options ──
        --)
            shift      # remove --, stop parsing
            break
            ;;

        # ── Unknown option ──
        -*)
            echo "Unknown option: $1" >&2
            exit 1
            ;;

        # ── Positional argument ──
        *)
            positionals+=("$1")
            shift
            ;;
    esac
done

echo "verbose: $verbose"
echo "output: $output"
echo "input: $input"
echo "count: $count"
echo "positionals: ${positionals[@]:-}"
```
::

## Production Pattern: Full CLI with Subcommands

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
set -euo pipefail

readonly VERSION="1.0.0"
readonly SCRIPT_NAME=$(basename "$0")

# ── Usage ──
usage() {
    cat <<EOF
$SCRIPT_NAME v$VERSION

Usage: $SCRIPT_NAME [OPTIONS] <command> [args...]

Commands:
  build       Build the project
  test        Run tests
  deploy      Deploy to environment

Options:
  -h, --help     Show this help
  -v, --verbose  Verbose output
  --version      Show version

Examples:
  $SCRIPT_NAME build --output dist/
  $SCRIPT_NAME test --coverage
  $SCRIPT_NAME deploy --env prod --dry-run
EOF
}

# ── Global options ──
verbose=false

# ── Parse global options (before subcommand) ──
while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)   usage; exit 0 ;;
        -v|--verbose) verbose=true; shift ;;
        --version)   echo "$VERSION"; exit 0 ;;
        -*)          echo "Unknown option: $1" >&2; usage; exit 1 ;;
        *)           break ;;  # first non-option is the subcommand
    esac
done

# ── Subcommand dispatch ──
subcommand="${1:-}"
shift || true   # remove subcommand, don't fail if no args

case "$subcommand" in
    build)  cmd_build "$@" ;;
    test)   cmd_test "$@" ;;
    deploy) cmd_deploy "$@" ;;
    ""|help) usage ;;
    *)      echo "Unknown command: $subcommand" >&2; usage; exit 1 ;;
esac

# ── Subcommand implementations ──
cmd_build() {
    local output="dist/"
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -o|--output) output="$2"; shift 2 ;;
            --output=*)  output="${1#--output=}"; shift ;;
            -h|--help)   echo "Usage: $SCRIPT_NAME build [-o DIR]"; return 0 ;;
            *)           echo "Unknown: $1" >&2; return 1 ;;
        esac
    done
    $verbose && echo "Building to $output..."
    # ... real build logic ...
}

cmd_test() {
    local coverage=false
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --coverage) coverage=true; shift ;;
            -h|--help)  echo "Usage: $SCRIPT_NAME test [--coverage]"; return 0 ;;
            *)          echo "Unknown: $1" >&2; return 1 ;;
        esac
    done
    $verbose && echo "Running tests (coverage: $coverage)..."
    # ... real test logic ...
}

cmd_deploy() {
    local env="staging" dry_run=false
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -e|--env)     env="$2"; shift 2 ;;
            --env=*)     env="${1#--env=}"; shift ;;
            --dry-run)   dry_run=true; shift ;;
            -h|--help)   echo "Usage: $SCRIPT_NAME deploy [-e ENV] [--dry-run]"; return 0 ;;
            *)           echo "Unknown: $1" >&2; return 1 ;;
        esac
    done
    $verbose && echo "Deploying to $env (dry-run: $dry_run)..."
    # ... real deploy logic ...
}
```
::

## Reading from stdin

::code-wrapper{language="bash"}
```bash
# ── Detect if stdin is a pipe (data) or terminal (interactive) ──
if [[ -t 0 ]]; then
    # stdin is a terminal — no piped input
    echo "No input on stdin. Use: $0 < file.txt  OR  cat file | $0"
    input=""
else
    # stdin is a pipe or file — read it
    input=$(cat)          # read ALL of stdin
    # Or line by line:
    # while IFS= read -r line; do ...; done
fi

# ── Common pattern: read from file OR stdin ──
# If a file is given as arg, read from it; otherwise read from stdin.
if [[ $# -gt 0 ]]; then
    input_file="$1"
    [[ -f "$input_file" ]] || { echo "not found: $input_file" >&2; exit 1; }
    while IFS= read -r line; do
        process "$line"
    done < "$input_file"
else
    while IFS= read -r line; do
        process "$line"
    done
fi

# ── Check if stdout is a terminal ──
if [[ -t 1 ]]; then
    # stdout is a terminal — use colors
    RED=$'\e[31m'
    RESET=$'\e[0m'
else
    # stdout is piped/redirected — no colors
    RED=""
    RESET=""
fi
echo "${RED}Error${RESET}: something went wrong"
```
::

## Anti-Pattern: `getopt` (External Command)

::code-wrapper{language="bash"}
```bash
# ❌ AVOID — external getopt is unreliable across systems
# GNU getopt: supports long options, reorders args
# BSD getopt: different behavior, no long options
# The two are INCOMPATIBLE — scripts break across platforms.

getopt -o "vo:" -l "verbose,output:" -- "$@"
# GNU: works. BSD: might not. Different error handling. Unpredictable.

# ✅ USE getopts (built-in) for short options
# ✅ USE manual while/case parsing for long options
# ✅ USE argbash (code generator) for complex CLIs: brew install argbash
```
::

## 💡 Tips & Tricks

::code-wrapper{language="bash"}
```bash
# ── `--flag=value` extraction pattern ──
case "$1" in
    --output=*) output="${1#--output=}" ;;  # ${1#--output=} strips the prefix
    --port=*)   port="${1#--port=}" ;;
esac

# ── Re-parse with getopts (reset OPTIND) ──
# If you need to call getopts in a function (after a previous getopts loop):
parse_options() {
    OPTIND=1   # MUST reset — getopts uses OPTIND globally
    while getopts "vo:" opt; do
        # ...
    done
}

# ── Validate numeric args ──
validate_int() {
    local var=$1
    [[ "$var" =~ ^[0-9]+$ ]] || die "$var is not a positive integer"
}
count="${1:-}"
validate_int "$count"

# ── Accept multiple values for one flag (--include *.py --include *.sh) ──
includes=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --include) includes+=("$2"); shift 2 ;;
        *)         break ;;
    esac
done

# ── Tab completion helper: output --help in a parseable format ──
# For bash completion, add this to ~/.bashrc:
# complete -F _my_script myscript
# _my_script() {
#     local cur="${COMP_WORDS[COMP_CWORD]}"
#     COMPREPLY=( $(compgen -W "build test deploy" -- "$cur") )
# }
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="bash"}
```bash
# ── getopts stops at first non-option ──
# ./script.sh file.txt -v  →  getopts doesn't see -v (stops at file.txt)
# Options must come BEFORE positional args (or use manual parsing).

# ── getopts only does short options ──
# No --verbose. Use manual parsing or argbash for long options.

# ── `shift` beyond $# errors ──
# shift with no args left: "shift: shift count out of range"
# Guard: [[ $# -gt 0 ]] && shift  OR  shift || true

# ── `$10` is `$1` followed by `0` ──
echo $10     # "$1" + "0" = "foo0" (if $1 is "foo")
echo ${10}   # the actual 10th arg

# ── `$0` isn't always the script name ──
# If called via symlink: $0 is the symlink path (not the real script)
# If sourced: $0 is the shell (e.g., "bash")
# Use BASH_SOURCE[0] for the script's actual path.

# ── `--` stops option parsing ──
# ./script.sh -v -- -file.txt  →  -v is a flag, -file.txt is positional
# The -- is consumed by getopts, but in manual parsing you need to handle it.

# ── OPTIND is global ──
# If you call getopts in a function after a previous getopts, OPTIND is stale.
# Reset: OPTIND=1  (or OPTIND=0 in some versions — but 1 is standard)
```
::

## 🧠 Quick Quiz

Why does this fail to parse the `--verbose` flag?

::code-wrapper{language="bash"}
```bash
while getopts "v-:" opt; do
    case "$opt" in
        v) verbose=true ;;
        -) echo "long option: $OPTARG" ;;
    esac
done
```
::

<details>
<summary>Answer</summary>

`getopts` does **not** support long options. The `-` in `"v-:"` is treated as a regular short option named `-`, not as a prefix for long options. `getopts` only parses single-character options.

When you run `./script.sh --verbose`, getopts sees `-` as the first character after `--`, and since `-` is in the optstring, it might match it — but `OPTARG` won't contain `verbose` in a useful way. This is a common misconception.

**The correct approaches**:
1. Use **manual `while/case` parsing** for long options (as shown above).
2. Use **external tools** like `argbash` (code generator) or `getopt` (GNU, not portable).
3. Use **short options only** with `getopts` and document `--verbose` as not supported.

**The lesson**: `getopts` is for short options only (`-v`, `-o VALUE`). For `--verbose`, use manual `while [[ $# -gt 0 ]]; do case "$1" in ... esac; done` parsing.

</details>