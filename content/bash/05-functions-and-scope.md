# 05 — Functions & Scope

Bash functions group commands for reuse. They have local variables (`local`), arguments (`$1`, `$@`), and return values (exit status or stdout).

## Defining Functions

::code-wrapper{language="bash"}
```bash
# Modern syntax (preferred)
greet() {
	echo "Hello, $1!"
}

# Alternative (C-style)
function greet() {
	echo "Hello, $1!"
}

# Call it
greet "Alice"   # Hello, Alice!
```

Both syntaxes work. The `greet() { ... }` form is more portable (POSIX-compatible without `function`).

## Arguments

::code-wrapper{language="bash"}
```bash
add() {
	echo "$(( $1 + $2 ))"
}

add 5 3      # 8 (echoed to stdout)

# All args
sum() {
	local total=0
	for n in "$@"; do
		((total += n))
	done
	echo "$total"
}

sum 1 2 3 4   # 10
```

Functions get their own `$1`, `$2`, `$@`, `$#` (independent of the script's args). `$0` is still the script name (not the function name) in most shells.

## Return Values

Bash functions don't return values like other languages — they return an **exit status** (0-255):

::code-wrapper{language="bash"}
```bash
is_even() {
	if (( $1 % 2 == 0 )); then
		return 0   # true (success)
	else
		return 1   # false (failure)
	fi
}

if is_even 4; then
	echo "even"
fi
```

`return` sets the exit status (0 = success). Use this for boolean-like functions.

### Returning values via stdout

For actual data, `echo` to stdout and capture with `$(...)`:

::code-wrapper{language="bash"}
```bash
get_date() {
	date +%Y-%m-%d
}

today=$(get_date)
echo "$today"   # 2024-01-15
```

### Returning values via a variable name (nameref)

::code-wrapper{language="bash"}
```bash
# Bash 4.3+ (nameref)
parse_version() {
	local -n result=$1   # nameref to the caller's variable
	local input=$2
	result="${input//./_}"
}

parse_version out "1.2.3"
echo "$out"   # 1_2_3
```

`local -n` (nameref) lets a function set a variable in the caller's scope — cleaner than echoing and capturing for complex data.

## `local` Variables

::code-wrapper{language="bash"}
```bash
counter() {
	local count=0   # local to this function
	((count++))
	echo "$count"
}

counter   # 1
counter   # 1 (count is reset each call, local)
echo "$count"   # (empty — count is local)
```

**Always use `local`** for function variables — without it, they're global (polluting the scope, clobbering existing variables).

### `local` and recursion

::code-wrapper{language="bash"}
```bash
factorial() {
	local n=$1
	if ((n <= 1)); then
		echo 1
	else
		local sub
		sub=$(factorial $((n - 1)))
		echo $((n * sub))
	fi
}

factorial 5   # 120
```

`local` makes each recursive call have its own `n` and `sub`.

## Dynamic Scoping

Bash uses **dynamic scoping** (not lexical). A `local` variable in a function is visible to functions it calls (unless they shadow it):

::code-wrapper{language="bash"}
```bash
outer() {
	local x="outer"
	inner
}

inner() {
	echo "$x"   # "outer" (dynamic scope — sees caller's local)
}

outer   # outer
```

In lexical scoping (most languages), `inner` wouldn't see `x`. In Bash's dynamic scoping, `inner` sees `outer`'s `x` (because `outer` called `inner`). This is surprising but useful.

## Exporting Functions

::code-wrapper{language="bash"}
```bash
my_func() { echo "hello"; }
export -f my_func   # available in subshells and child processes

bash -c 'my_func'   # hello (works in a child process)
```

`export -f` makes a function available to child processes. Rarely needed (mostly for `xargs`/`find`/subshells).

## Recursion

::code-wrapper{language="bash"}
```bash
fib() {
	if (( $1 <= 1 )); then
		echo "$1"
	else
		echo $(( $(fib $(($1 - 1))) + $(fib $(($1 - 2))) ))
	fi
}

fib 10   # 55
```

Recursion works but is slow in Bash (subprocess per `$()`). Use it sparingly — Bash isn't designed for heavy computation.

## Arrays as Arguments

You can't pass an array directly to a function. Pass elements:

::code-wrapper{language="bash"}
```bash
print_args() {
	for arg in "$@"; do
		echo "$arg"
	done
}

arr=("apple" "banana" "cherry")
print_args "${arr[@]}"   # passes all elements as separate args
```

Or use a nameref (Bash 4.3+):

::code-wrapper{language="bash"}
```bash
process_array() {
	local -n arr_ref=$1
	for item in "${arr_ref[@]}"; do
		echo "$item"
	done
}

my_arr=("a" "b" "c")
process_array my_arr   # pass by name
```

## Signal Traps (a related use of functions)

::code-wrapper{language="bash"}
```bash
cleanup() {
	rm -f "$tmpfile"
	exit
}

tmpfile=$(mktemp)
trap cleanup EXIT INT TERM   # run cleanup on exit, Ctrl-C, or kill

# ... script logic ...
```

`trap` registers a function to run on a signal (EXIT, INT (Ctrl-C), TERM, etc.). Use for cleanup (temp files, lock files).

## 💡 Tips & Tricks

- **Idiom**: always use `local` for function variables — without `local`, variables are global (polluting the scope, clobbering existing variables). `local x=0` keeps it function-scoped. This is the #1 function hygiene rule.
- **Idiom**: return exit status (0/1) for boolean-like functions, echo for data — `is_even() { (( $1 % 2 == 0 )) && return 0 || return 1; }` for booleans; `get_date() { date +%Y-%m-%d; }` and capture with `$(get_date)` for data. Don't try to return data via `return` (it's 0-255 exit status only).
- **Idiom**: use `local -n` (nameref, Bash 4.3+) to return complex data — `parse() { local -n r=$1; r="..."; }` sets a variable in the caller's scope by name. Cleaner than echoing and capturing for arrays/complex data.
- **Idiom**: use `trap` for cleanup — `trap cleanup EXIT INT TERM` runs `cleanup` on exit, Ctrl-C, or kill. Use to remove temp files, release locks. `EXIT` runs on any exit (normal or error with `set -e`).
- **Idiom**: pass arrays by name (nameref) or expand elements — `func "${arr[@]}"` passes elements as separate args; `local -n ref=$1; func arr` passes by name. You can't pass an array directly (`func $arr` loses elements).

## ⚠️ Edge Cases & Gotchas

- **`return` is exit status (0-255), not a value**: `return 5` sets the exit status to 5 (not "returns 5"). For data, echo to stdout and capture with `$(func)`. `return 300` wraps to 44 (modulo 256).
- **`local` is dynamic-scoped**: a `local x` in `outer` is visible in `inner` (called by `outer`), unless `inner` also declares `local x`. Not lexical — surprising for developers from other languages.
- **Functions don't see the script's `$1` by default**: a function has its own `$1`, `$2`, `$@`. If the function needs the script's args, pass them explicitly (`func "$@"`) or use a global.
- **`$0` in a function is the script name, not the function**: in most shells, `$0` doesn't change inside a function. To get the function name, use `${FUNCNAME[0]}` (Bash).
- **Recursion is slow**: each `$(func ...)` is a subprocess. `fib 20` is slow (thousands of subprocesss). Use iterative algorithms or a different language for heavy computation.
- **`export -f` for child processes**: functions aren't inherited by child processes (subshells yes, child processes no). `export -f func` exports it. Needed for `find ... -exec func {} \;` or `xargs`.
- **`local` doesn't apply to special variables**: `local PATH=...` works, but `local $?` doesn't (special). Also `local` on a nameref (`local -n`) is Bash 4.3+.
- **Nameref name collision**: `local -n arr=$1` — if `$1` is `arr` (same name), it creates a circular reference. Use a distinct local name or a prefix.
- **Function defined after use fails**: Bash reads the script top-to-bottom. A function must be defined *before* it's called. Forward references don't work (unlike Python/JS hoisting).
- **`trap EXIT` runs on any exit**: including `exit`, normal end, and `set -e` abort. It runs in the exiting shell. Order: the exit-triggering command's trap, then EXIT.

## 🧠 Spot the Bug

A developer writes a function to increment a counter, but the counter keeps resetting:

::code-wrapper{language="bash"}
```bash
increment() {
	count=$((count + 1))
	echo "$count"
}

increment   # 1
increment   # 1 (expected 2!)
```
::

Why does `count` reset each call?

<details>
<summary>Answer</summary>

`count=$((count + 1))` creates a **local** `count` (via `local`-like behavior in the arithmetic context? No — actually, without `local`, `count` is global). Wait, let me reconsider.

Actually, `count=$((count + 1))` without `local` is a **global** assignment. So the first call sets global `count=1`, the second should set it to 2...

Hmm, the bug might be different. If the script runs each `increment` in a subshell (e.g., `increment` is called in a pipeline), the global assignment is lost (subshell). But in the example, `increment` is called directly (not in a pipeline), so the global should persist.

Let me reconsider the actual common bug: if the function uses `local count=0` first, then increments:

```bash
increment() {
	local count=0          # reset to 0 each call!
	count=$((count + 1))
	echo "$count"
}
```

With `local count=0`, each call resets `count` to 0, then increments to 1. The counter never goes above 1.

The fix — initialize the global once (outside the function), and don't use `local`:

```bash
count=0   # global, initialized once
increment() {
	count=$((count + 1))   # no local — modifies the global
	echo "$count"
}

increment   # 1
increment   # 2
```

Or, if you want the counter encapsulated, use a file or a nameref pattern. The key is: don't re-initialize with `local` inside the function if you want the value to persist.

**The lesson**: `local count=0` inside a function resets `count` to 0 on each call (local scope). For a persistent counter, use a global (initialized outside the function) and don't `local` it. Or use a file/external state. Understand `local` scope vs global persistence.

</details>

## Summary

You can define functions (`name() { ... }`), use arguments (`$1`, `$@`), return exit status (`return 0/1`) or data (echo + `$(...)`), use `local` (always!), namerefs (`local -n`, Bash 4.3+), dynamic scoping, recursion (slow), export functions (`export -f`), pass arrays (by name or expand), and trap signals for cleanup — with the `local`-resets-on-call and `return`-is-exit-status traps internalized. Next: text processing tools.