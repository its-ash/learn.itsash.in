# 02 — Variables & Data Types

Bash variables are untyped strings (mostly). Understanding how they're assigned, expanded, and scoped is essential — and the source of many bugs.

## Assigning Variables

::code-wrapper{language="bash"}
```bash
name="Alice"        # no spaces around =
count=5
pi=3.14
empty=""

# ❌ wrong (spaces matter)
# name = "Alice"    # bash: name: command not found
```
::
**No spaces around `=`** — `name="Alice"` assigns; `name = "Alice"` runs the command `name` with args `=` and `"Alice"`. This is the #1 Bash beginner mistake.

## Variable Expansion

::code-wrapper{language="bash"}
```bash
echo "$name"        # Alice
echo "$name_len"    # (empty — no such variable)
echo "${name}_suffix"  # Alice_suffix (braces delimit the name)
echo "$name's"      # Alice's (apostrophe is OK, but braces are safer)
```
::
Use `${name}` when followed by characters that could be part of a variable name (`${name}_suffix`), or for clarity. Without braces, Bash greedily takes the longest valid variable name.

## Quoting (Critical)

::code-wrapper{language="bash"}
```bash
file="my file.txt"

echo $file          # my file.txt (word-splitting — works here but fragile)
echo "$file"        # my file.txt (safe — no word-splitting)
echo '$file'        # $file (single quotes — no expansion)

# Word-splitting trap
files="a.txt b.txt c.txt"
for f in $files; do echo "$f"; done    # iterates 3 files (word-split)
for f in "$files"; do echo "$f"; done  # iterates 1 string ("a.txt b.txt c.txt")
```
::
- **Double quotes `"..."`** — variables expand, but no word-splitting/globbing. **Always quote variables.**
- **Single quotes `'...'`** — literal, no expansion. Use for fixed strings with `$`, `"`, etc.
- **No quotes** — variables expand AND word-split/glob. Usually a bug.

The golden rule: **always quote variable expansions** (`"$var"`). Only omit quotes when you *want* word-splitting (rare, and use arrays instead).

## Data "Types"

Bash variables are strings. But they can be interpreted as:

### Integers (with `declare -i`)

::code-wrapper{language="bash"}
```bash
declare -i x=5
x=x+3              # x is 8 (arithmetically evaluated)
x="hello"          # x is 0 (non-numeric string → 0)

# Arithmetic without declare -i
x=5
x=$((x + 3))       # 8
```
::
`declare -i` makes arithmetic evaluation automatic on assignment. `=$((...))` is arithmetic expansion (always available).

### Arrays (indexed)

::code-wrapper{language="bash"}
```bash
fruits=("apple" "banana" "cherry")
echo "${fruits[0]}"      # apple
echo "${fruits[@]}"      # apple banana cherry (all elements)
echo "${#fruits[@]}"     # 3 (count)
fruits+=("date")         # append
echo "${#fruits[@]}"     # 4
echo "${fruits[-1]}"     # date (last element, Bash 4.3+)

for fruit in "${fruits[@]}"; do
	echo "$fruit"
done
```
::
Always quote `"${arr[@]}"` (preserves elements with spaces). `"${arr[*]}"` joins with IFS (usually space) — usually not what you want.

### Associative Arrays (Bash 4+)

::code-wrapper{language="bash"}
```bash
declare -A ages
ages["Alice"]=30
ages["Bob"]=25

echo "${ages[Alice]}"     # 30
echo "${!ages[@]}"        # Alice Bob (keys)
echo "${ages[@]}"         # 30 25 (values)
echo "${#ages[@]}"        # 2 (count)

for name in "${!ages[@]}"; do
	echo "$name is ${ages[$name]}"
done
```
::
`declare -A` creates an associative array (key-value). `${!arr[@]}` gets keys. Requires Bash 4+ (not macOS default 3.2).

### Read-only (`declare -r` / `readonly`)

::code-wrapper{language="bash"}
```bash
declare -r PI=3.14159
# PI=3   # ✗ bash: PI: readonly variable
```
::
### Exported (environment variables)

::code-wrapper{language="bash"}
```bash
export MY_VAR="hello"   # available to child processes
PATH="$PATH:/my/bin"    # extend PATH
```
::
`export` makes the variable an environment variable (inherited by child processes). Without `export`, it's a shell variable (not inherited).

## Default Values and Parameter Expansion

::code-wrapper{language="bash"}
```bash
name="${1:-World}"        # use $1, or "World" if unset/empty
name="${1-World}"         # use $1, or "World" if unset (allows empty)
count="${1:?Missing arg}" # use $1, or error and exit if unset/empty
file="${1:+exists}"       # "exists" if $1 is set and non-empty, else empty

# Length
echo "${#name}"           # length of $name

# Substring
echo "${name:0:3}"        # first 3 chars
echo "${name:1}"          # from index 1

# Replace
echo "${name/Alice/Bob}"  # first match
echo "${name//i/I}"       # all matches

# Case (Bash 4+)
echo "${name^}"           # first char uppercase
echo "${name^^}"          # all uppercase
echo "${name,}"           # first char lowercase
echo "${name,,}"          # all lowercase
```
::
Parameter expansion is powerful — defaults, length, substring, replace, case. Master it; it replaces many `sed`/`awk` calls.

## Special Variables

| Variable | Meaning |
|---|---|
| `$0` | Script name. |
| `$1`…`$9`, `${10}`… | Positional args. |
| `$#` | Number of args. |
| `$@` | All args (each quoted with `"$@"`). |
| `$*` | All args (one string, IFS-joined). |
| `$?` | Exit status of the last command (0 = success). |
| `$$` | Current shell's PID. |
| `$!` | PID of the last background command. |
| `$_` | Last argument of the previous command. |
| `$-` | Current shell options. |

### `"$@"` vs `"$*"`

::code-wrapper{language="bash"}
```bash
for arg in "$@"; do echo "$arg"; done   # iterates each arg (preserves spaces)
for arg in "$*"; do echo "$arg"; done   # one string (all args joined by IFS)
```
::
**Always use `"$@"` (with quotes)** to pass all args — it preserves each arg as a separate element, even with spaces. `"$*"` joins them into one string.

## Scope

Variables are global by default (even inside functions):

::code-wrapper{language="bash"}
```bash
my_func() {
	x=10   # global!
}
my_func
echo "$x"   # 10
```
::
Use `local` to keep a variable local to a function:

::code-wrapper{language="bash"}
```bash
my_func() {
	local x=10   # local
}
my_func
echo "$x"   # (empty — x is local)
```
::
**Always use `local` for function variables** — avoids polluting the global scope and clobbering existing variables.

## Reading Input

::code-wrapper{language="bash"}
```bash
echo -n "Enter your name: "
read name
echo "Hello, $name"

# Read into multiple variables
read first last   # "Alice Smith" → first=Alice, last=Smith

# Read with a prompt (Bash 4+)
read -p "Enter age: " age

# Read a password (no echo)
read -s -p "Password: " password
echo  # newline after the prompt

# Read with a timeout
read -t 5 -p "Enter (5s): " answer   # empty if timeout
```
::
## 💡 Tips & Tricks

- **Idiom**: always quote variable expansions (`"$var"`) — prevents word-splitting and globbing, which are the source of most Bash bugs (spaces in filenames, special characters). Only omit quotes when you explicitly want word-splitting (rare; use arrays instead).
- **Idiom**: use `"${var:-default}"` for defaults — `${1:-World}` uses the first arg or "World" if unset/empty. Variants: `:-` (unset or empty), `-` (unset only), `:?` (error and exit if unset/empty). Cleaner than `if [ -z "$var" ]`.
- **Idiom**: use `local` for all function variables — without `local`, a variable assigned in a function is global, polluting the scope and clobbering existing variables. `local x=10` keeps it function-scoped.
- **Idiom**: use `"${arr[@]}"` (not `${arr[*]}` or `${arr[@]}` unquoted) to iterate/expand array elements — it preserves each element as a separate item, even with spaces. `"${arr[*]}"` joins into one string.
- **Idiom**: use parameter expansion over `sed`/`awk` for simple string ops — `${name:0:3}` (substring), `${name//old/new}` (replace), `${#name}` (length), `${name^^}` (uppercase). Faster (no subprocess) and safer (no regex pitfalls).

## ⚠️ Edge Cases & Gotchas

- **No spaces around `=`**: `name="Alice"` (✓); `name = "Alice"` (✗ runs `name` as a command). The #1 beginner mistake.
- **Unquoted variables word-split and glob**: `rm $file` with `file="my file.txt"` runs `rm my file.txt` (3 args). Always quote: `rm "$file"`.
- **`"$@"` vs `"$*"`**: `"$@"` preserves each arg as a separate element (use for passing args); `"$*"` joins them into one string (rarely wanted). Without quotes, `$@` and `$*` word-split.
- **macOS Bash 3.2 has no associative arrays**: `declare -A` needs Bash 4+. On macOS, install Bash 5 (`brew install bash`) or use parallel indexed arrays.
- **`${arr[-1]}` (last element) needs Bash 4.3+**: on older Bash, use `${arr[$((${#arr[@]}-1))]}`.
- **`declare -i` quirks**: `x="hello"` on an `declare -i` variable sets `x=0` (non-numeric → 0). Surprising. Prefer `=$((...))` for explicit arithmetic.
- **`export` only affects child processes**: an exported variable is inherited by child processes, not parent or siblings. `export` in a script doesn't affect the caller's shell (unless `source`d).
- **`local` in a function is dynamic-scoped**: `local x` in `outer` is visible in `inner` (called by `outer`) unless `inner` also declares `local x`. This is dynamic scoping (not lexical). Surprising.
- **`read` returns non-zero on EOF**: `while read line; do ...; done < file` — `read` returns non-zero at EOF, ending the loop. Use `|| true` if you need to continue.
- **`${var:?msg}` exits the script**: if `var` is unset/empty, it prints `msg` and exits. Useful for mandatory args, but the exit is unconditional (even in a subshell).

## 🧠 Spot the Bug

A developer writes a script to process files, but it fails on files with spaces:

::code-wrapper{language="bash"}
```bash
files=$(ls *.txt)
for file in $files; do
	echo "Processing $file"
done
```
::

What's wrong?

<details>
<summary>Answer</summary>

Two problems:

1. **`ls *.txt` with spaces in filenames**: `ls` outputs one filename per line, but `$(ls *.txt)` captures it as a string, and `for file in $files` (unquoted) word-splits on spaces. A file named `my file.txt` becomes two iterations: `my` and `file.txt`.

2. **Parsing `ls` is fragile**: `ls` escapes special characters (spaces, newlines) inconsistently. Don't parse `ls` output.

The fix — use a glob directly (no `ls`):

```bash
for file in *.txt; do
	echo "Processing $file"
done
```
::
The glob `*.txt` expands to the actual filenames, each as a separate element (even with spaces). No `ls`, no word-splitting.

Or, for recursive or complex cases, use `find` with `-print0` and `read -d ''`:

```bash
while IFS= read -r -d '' file; do
	echo "Processing $file"
done < <(find . -name "*.txt" -print0)
```
::
`-print0` separates filenames with null bytes (the only character not allowed in a filename); `read -d ''` reads null-delimited. This handles any filename (spaces, newlines, special chars).

**The lesson**: don't parse `ls` (fragile, breaks on spaces). Use globs (`for file in *.txt`) or `find -print0` + `read -d ''` for filenames. Always quote `"$file"`. See chapter 04 for more.

</details>

## Summary

You can assign variables (`name="value"`, no spaces), expand them (`"$var"`, `${var}`), quote correctly (double quotes, always), use "types" (`declare -i`, arrays, associative arrays, `declare -r`), parameter expansion (`:-`, `:?`, `${#}`, `${var:0:3}`, `${var//a/b}`, `${var^^}`), special variables (`$@`, `$#`, `$?`), scope (`local`), and read input (`read -p`/`-s`/`-t`) — with the no-spaces-around-`=` and always-quote traps internalized. Next: operators and expansions.