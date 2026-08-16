# 11 — Command-Line Arguments & Parsing

Bash scripts receive args via `$1`, `$@`, etc. For non-trivial parsing (flags, options), use `getopts` (built-in) or external tools (`getopt`, `argbash`).

## Positional Arguments

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
echo "Script: $0"
echo "First arg: $1"
echo "Second arg: $2"
echo "All args: $@"
echo "Count: $#"

# Run: ./script.sh foo bar baz
# Script: ./script.sh
# First arg: foo
# Second arg: bar
# All args: foo bar baz
# Count: 3
```

### Default values

::code-wrapper{language="bash"}
```bash
name="${1:-World}"
count="${2:-1}"
echo "$name $count"
```

### Mandatory args

::code-wrapper{language="bash"}
```bash
if [[ $# -lt 1 ]]; then
	echo "Usage: $0 <name>" >&2
	exit 1
fi
name="$1"
```

Or with `${var:?}`:

::code-wrapper{language="bash"}
```bash
name="${1:?Usage: $0 <name>}"
```

### `"$@"` (pass all args)

::code-wrapper{language="bash"}
```bash
process_args() {
	for arg in "$@"; do
		echo "Arg: $arg"
	done
}

process_args "$@"   # pass the script's args to the function
```

Always quote `"$@"` (preserves each arg as a separate item).

## `getopts` (built-in)

`getopts` parses short options (`-a`, `-b value`, `-c`). It's POSIX, built-in, and reliable (unlike external `getopt`):

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
verbose=false
output=""

while getopts ":vo:" opt; do
	case "$opt" in
		v) verbose=true ;;
		o) output="$OPTARG" ;;
		\?) echo "Invalid option: -$OPTARG" >&2; exit 1 ;;
		:) echo "Option -$OPTARG requires an argument." >&2; exit 1 ;;
	esac
done
shift $((OPTIND - 1))   # remove parsed options, leave positional args

echo "verbose: $verbose"
echo "output: $output"
echo "Positional: $@"
```

- `getopts "vo:" opt` — `v` is a flag (no arg), `o:` takes an argument (`:` after the letter).
- The leading `:` in `":vo:"` enables silent error reporting (you handle `?` and `:`).
- `OPTARG` — the argument value for options that take one.
- `OPTIND` — the index of the next arg. `shift $((OPTIND - 1))` removes parsed options.
- `?` — invalid option. `:` — missing argument.

Run it:

::code-wrapper{language="bash"}
```bash
./script.sh -v -o output.txt file1 file2
# verbose: true
# output: output.txt
# Positional: file1 file2
```

### `getopts` limitations

- Only short options (`-v`, not `--verbose`).
- No long-option support.
- Options must come before positional args (after the first non-option, `getopts` stops).

For long options (`--verbose`), use external tools or manual parsing.

## Long Options (manual parsing)

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
verbose=false
output=""
input=""

while [[ $# -gt 0 ]]; do
	case "$1" in
		-v|--verbose) verbose=true; shift ;;
		-o|--output) output="$2"; shift 2 ;;
		-i|--input) input="$2"; shift 2 ;;
		-h|--help) echo "Usage: $0 [-v] [-o FILE] [-i FILE]"; exit 0 ;;
		-*) echo "Unknown option: $1" >&2; exit 1 ;;
		*) echo "Positional: $1"; shift ;;
	esac
done

echo "verbose: $verbose"
echo "output: $output"
echo "input: $input"
```

Manual parsing is more verbose but supports long options. Use a `while`/`case` loop, `shift` to consume args.

## External `getopt` (not recommended)

The external `getopt` command supports long options, but it's unreliable across systems (GNU vs BSD `getopt` differ). Avoid it — use `getopts` for short options, manual parsing for long.

## `argbash` (code generation)

[argbash](https://argbash.io) generates an arg-parsing script from a spec. Useful for complex CLIs. Install: `brew install argbash`.

## Subcommands

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
subcommand="${1:-help}"
shift || true

case "$subcommand" in
	build) echo "Building..." ;;
	test)  echo "Testing..." ;;
	deploy) echo "Deploying..." ;;
	help|*) echo "Usage: $0 {build|test|deploy}"; exit 1 ;;
esac
```

::code-wrapper{language="bash"}
```bash
./script.sh build     # Building...
./script.sh test      # Testing...
./script.sh           # Usage: ... (default to help)
```

Subcommands (like `git build`, `git test`) — dispatch on `$1`, `shift`, then parse the rest.

## `shift`

::code-wrapper{language="bash"}
```bash
shift        # remove $1, shift others ($2 → $1, etc.)
shift 2      # remove $1 and $2
```

`shift` removes the first arg, shifting the rest. Used after parsing an option/subcommand.

## Reading from stdin

::code-wrapper{language="bash"}
```bash
# Read all stdin
input=$(cat)
echo "Got: $input"

# Line by line
while IFS= read -r line; do
	echo "Line: $line"
done

# Check if stdin is a pipe
if [[ -t 0 ]]; then
	echo "No stdin (terminal)"
else
	echo "Got stdin"
fi
```

## 💡 Tips & Tricks

- **Idiom**: use `getopts` for short options — it's built-in, POSIX, reliable (unlike external `getopt`). `getopts "vo:" opt` with `v` (flag) and `o:` (option with arg). Handle `?` (invalid) and `:` (missing arg). `shift $((OPTIND - 1))` after.
- **Idiom**: use manual `while`/`case` parsing for long options (`--verbose`) — `getopts` doesn't support long options. `while [[ $# -gt 0 ]]; do case "$1" in --verbose) ...;; esac; done`. More verbose but flexible.
- **Idiom**: use `"$@"` (quoted) to pass all args — preserves each arg as a separate item (even with spaces). `"$@"` in a function call passes the script's args. Never `$@` unquoted (word-splits) or `$*` (joins).
- **Idiom**: use `${var:-default}` for optional args and `${var:?Usage: ...}` for mandatory — `${1:-World}` (default) and `${1:?Usage: $0 <name>}` (error if missing). Cleaner than `if [[ $# -lt 1 ]]`.
- **Idiom**: use subcommands for CLIs with multiple operations — `case "$1" in build)...;; test)...;; esac; shift`. Like `git`/`docker`. Dispatch on `$1`, `shift`, parse the rest.

## ⚠️ Edge Cases & Gotchas

- **`getopts` stops at the first non-option**: `./script.sh file -v` — `getopts` stops at `file`, doesn't see `-v`. Options must come before positional args. (Use `getopt` or manual parsing for intermixed args, but both have caveats.)
- **`getopts` only does short options**: no `--verbose`. Use manual parsing or `argbash` for long options.
- **`shift` beyond `$#`**: `shift` with no args left is an error (in some shells). Use `shift || true` or check `$#` first.
- **`$0` isn't always the script name**: if called via a symlink or `source`, `$0` may differ. Use `BASH_SOURCE[0]` for the script's path.
- **`$@` unquoted word-splits**: `for arg in $@` breaks args with spaces. Always `for arg in "$@"`.
- **`$10` needs braces**: `$10` is `$1` followed by `0`. Use `${10}` for the 10th arg.
- **`getopt` (external) is unreliable**: GNU vs BSD `getopt` differ (long options, ordering). Avoid — use `getopts` (built-in) or manual parsing.
- **`OPTIND` must be reset for multiple `getopts` loops**: `OPTIND=1` before re-parsing. Otherwise, the second `getopts` starts where the first left off.
- **`case "$1" in --output=*) value="${1#--output=}" ;;`**: for `--output=value` (with `=`), extract the value with `${1#--output=}`. A common pattern for `--flag=value` style.
- **`[[ -t 0 ]]` checks if stdin is a terminal**: useful to decide whether to read from stdin or use a default. `-t 1` for stdout, `-t 2` for stderr.

## 🧠 Spot the Bug

A developer parses options with `getopts`, but positional args after the options aren't right:

::code-wrapper{language="bash"}
```bash
while getopts "vo:" opt; do
	case "$opt" in
		v) verbose=true ;;
		o) output="$OPTARG" ;;
	esac
done

echo "Positional: $@"
```

Run: `./script.sh -v -o out.txt file1 file2`
Output: `Positional: -v -o out.txt file1 file2`

What's wrong?

<details>
<summary>Answer</summary>

The script doesn't `shift` after `getopts`. `getopts` parses the options but doesn't remove them from `$@` — it just updates `OPTIND` (the index of the next arg). Without `shift $((OPTIND - 1))`, `$@` still contains all the original args (options and positional).

The fix — shift after the `getopts` loop:

```bash
while getopts "vo:" opt; do
	case "$opt" in
		v) verbose=true ;;
		o) output="$OPTARG" ;;
	esac
done
shift $((OPTIND - 1))   # remove the parsed options, leave positional args

echo "Positional: $@"
```

Now `Positional: file1 file2` (the options `-v -o out.txt` are removed, leaving the positional args).

`OPTIND` is the index of the next unprocessed arg (4 in this case, after `-v -o out.txt`). `shift $((OPTIND - 1))` shifts past the 3 parsed options, leaving `file1 file2`.

**The lesson**: `getopts` parses options but doesn't remove them from `$@` — it updates `OPTIND`. After the loop, `shift $((OPTIND - 1))` removes the parsed options, leaving the positional args. Without it, `$@` still includes the options.

</details>

## Summary

You can use positional args (`$1`, `$@`, `$#`), defaults (`${1:-default}`), mandatory checks (`${1:?}`), `getopts` (short options, `OPTARG`, `OPTIND`, `shift` after), manual long-option parsing (`while`/`case`), subcommands (`case "$1"`), `shift`, and read stdin (`$(cat)`, `while read`, `[[ -t 0 ]]`) — with the `shift`-after-`getopts` and `"$@"`-quoted traps internalized. Next: debugging and error handling.