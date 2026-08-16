# 04 — Control Flow

Bash control flow: `if`/`else`, loops (`for`, `while`, `until`), `case`, `break`/`continue`, and `select`.

## `if` / `else`

::code-wrapper{language="bash"}
```bash
if [[ -f "config.txt" ]]; then
	echo "Config exists"
elif [[ -f "default.txt" ]]; then
	echo "Using default"
else
	echo "No config"
fi
```

The exit status of the command decides: 0 (success) → `then`, non-zero → `elif`/`else`. `[[... ]]` returns 0 for true.

### `if` with commands

::code-wrapper{language="bash"}
```bash
if grep -q "error" logfile.txt; then
	echo "Error found"
fi

if cd "$dir" 2>/dev/null; then
	echo "Now in $dir"
fi
```

Any command works in `if` — its exit status decides. `grep -q` returns 0 if it found a match.

### `&&` and `||` (short-circuit)

::code-wrapper{language="bash"}
```bash
[[ -f file.txt ]] && echo "exists"        # if true, echo
[[ -f file.txt ]] || echo "missing"       # if false, echo
mkdir -p dir && cd dir && echo "ready"    # chain (all must succeed)
```

Short-circuit: `&&` runs the next if the previous succeeded; `||` runs if it failed. Use for simple one-liners.

## Loops

### `for` (list)

::code-wrapper{language="bash"}
```bash
for fruit in apple banana cherry; do
	echo "$fruit"
done

for file in *.txt; do
	echo "Processing $file"
done

for arg in "$@"; do
	echo "Arg: $arg"
done
```

### `for` (C-style)

::code-wrapper{language="bash"}
```bash
for ((i = 0; i < 5; i++)); do
	echo "i = $i"
done

for ((i = 0, j = 10; i < 5; i++, j--)); do
	echo "$i $j"
done
```

### `while`

::code-wrapper{language="bash"}
```bash
count=0
while ((count < 5)); do
	echo "count = $count"
	((count++))
done
```

### `while read` (line by line)

::code-wrapper{language="bash"}
```bash
while IFS= read -r line; do
	echo "Line: $line"
done < input.txt

# From a command
while IFS= read -r line; do
	echo "$line"
done < <(grep "error" log.txt)

# Heredoc
while IFS= read -r line; do
	echo "$line"
done <<EOF
line 1
line 2
EOF
```

**Always use `IFS= read -r line`**:
- `IFS=` — don't trim leading/trailing whitespace.
- `-r` — don't interpret backslashes (literal).

### `until`

::code-wrapper{language="bash"}
```bash
until ping -c 1 example.com &>/dev/null; do
	echo "Waiting..."
	sleep 1
done
echo "Server is up"
```

`until` loops while the condition is *false* (opposite of `while`).

### `break` and `continue`

::code-wrapper{language="bash"}
```bash
for i in {1..10}; do
	((i == 3)) && continue   # skip 3
	((i == 7)) && break      # stop at 7
	echo "$i"
done
# 1 2 4 5 6

# Break N levels
for i in {1..3}; do
	for j in {1..3}; do
		((j == 2)) && break 2   # break both loops
		echo "$i $j"
	done
done
```

## `case`

::code-wrapper{language="bash"}
```bash
case "$1" in
	start)
		echo "Starting..."
		;;
	stop)
		echo "Stopping..."
		;;
	restart|reload)
		echo "Restarting..."
		;;
	*)
		echo "Usage: $0 {start|stop|restart}"
		exit 1
		;;
esac
```

`case` matches a pattern (`start`, `stop`, `restart|reload` (alternation), `*` (default)). Each clause ends with `;;`. Patterns support globs (`*`, `?`, `[...]`).

### Pattern matching

::code-wrapper{language="bash"}
```bash
case "$file" in
	*.jpg|*.png) echo "Image" ;;
	*.txt)       echo "Text" ;;
	[A-Z]*)      echo "Starts with uppercase" ;;
	*)           echo "Other" ;;
esac
```

## `select` (menus)

::code-wrapper{language="bash"}
```bash
PS3="Choose a fruit: "
select fruit in apple banana cherry "quit"; do
	case "$fruit" in
		apple|banana|cherry) echo "You chose $fruit" ;;
		quit) break ;;
		*) echo "Invalid choice" ;;
	esac
done
```

`select` creates a numbered menu. `PS3` is the prompt. The chosen item is in `$fruit`, the number in `$REPLY`.

## Exit Status

::code-wrapper{language="bash"}
```bash
grep "error" log.txt   # exit 0 if found, 1 if not, 2 on error
echo "$?"              # exit status of the last command

# Use in if
if grep -q "error" log.txt; then
	echo "found"
fi

# Explicit exit
exit 0    # success
exit 1    # failure
exit 2    # specific error code
```

`$?` is the exit status (0 = success, 1-255 = failure). `exit` sets the script's exit status.

## 💡 Tips & Tricks

- **Idiom**: use `while IFS= read -r line; do ...; done < file` to read files line by line — `IFS=` preserves whitespace, `-r` treats backslashes literally. Don't use `for line in $(cat file)` (word-splits, breaks on spaces). This is the correct way to read lines.
- **Idiom**: use `[[... ]]` in `if` (not `[... ]`) — safer, supports `&&`/`||` inside, pattern/regex. `if grep -q ...; then` uses a command's exit status directly (no `[[ ]]` needed for command tests).
- **Idiom**: use `case` for multi-branch string/arg matching — `case "$1" in start)...;; stop)...;; *) echo "Usage"; exit 1;; esac`. Patterns support globs (`*.txt`, `[A-Z]*`). Cleaner than a chain of `elif`.
- **Idiom**: use `&&`/`||` for simple one-liners — `[[ -f x ]] && echo exists` and `mkdir -p dir || exit 1`. Don't overuse — for complex logic, `if` is clearer. Reserve for 2-command guards.
- **Idiom**: use `exit` with meaningful codes — `exit 0` (success), `exit 1` (general failure), `exit 2` (usage error). Scripts in pipelines/CI rely on exit codes. Always `exit` explicitly on errors.

## ⚠️ Edge Cases & Gotchas

- **`for line in $(cat file)` is wrong**: word-splits on spaces (a line "hello world" becomes two iterations). Use `while IFS= read -r line; do ...; done < file`.
- **`IFS= read -r line`**: `IFS=` prevents trimming whitespace; `-r` prevents backslash interpretation. Both are needed for correct line reading. Forgetting them causes subtle bugs.
- **`for file in *.txt` passes the literal `*.txt` if no match**: use `shopt -s nullglob` (empty if no match) or check `[[ -e $file ]]` in the loop.
- **`break N` and `continue N`**: `break 2` breaks out of 2 loops. Rarely used — usually a sign to refactor into a function (with `return`).
- **`case` patterns are globs, not regex**: `*.txt` matches `file.txt`, but `.*` (regex) doesn't work. For regex, use `[[ =~ ]]`.
- **`case` `;;` is required**: each clause must end with `;;` (or `;&`/`;;&` for fall-through — Bash 4+). Forgetting `;;` is a syntax error.
- **`until` is `while not`**: `until condition` loops while the condition is *false*. Easy to confuse with `while`.
- **`exit` in a subshell doesn't exit the script**: `(exit 1)` exits the subshell, not the main script. `set -e` in a subshell doesn't affect the parent either.
- **`$?` is overwritten by the next command**: `cmd; echo "status: $?"; other; echo "$?"` — the second `$?` is `other`'s status, not `cmd`'s. Save it: `status=$?` immediately.
- **`select` loops until `break`**: without `break`, the menu reappears after each choice. Always handle a "quit" option with `break`.

## 🧠 Spot the Bug

A developer reads a file line by line, but lines with leading spaces are trimmed:

::code-wrapper{language="bash"}
```bash
while read line; do
	echo "[$line]"
done < input.txt
```
::

With `input.txt`:
::code-wrapper{language="text"}
```text
  hello
world
```
::

Output:
::code-wrapper{language="text"}
```text
[hello]
[world]
```
::

The leading spaces on "  hello" are gone. Why?

<details>
<summary>Answer</summary>

`read line` (without `IFS=`) uses the default `IFS` (space, tab, newline), which trims leading and trailing whitespace from each line. So `  hello` becomes `hello`.

The fix — use `IFS= read -r line`:

```bash
while IFS= read -r line; do
	echo "[$line]"
done < input.txt
```

- `IFS=` — empty IFS, so no trimming (leading/trailing whitespace preserved).
- `-r` — don't interpret backslashes (a `\` in the line stays literal).

Output:
```text
[  hello]
[world]
```

**The lesson**: `read line` (default) trims whitespace via `IFS`. For reading lines verbatim, use `IFS= read -r line` — `IFS=` prevents trimming, `-r` prevents backslash interpretation. This is the canonical way to read lines in Bash.

</details>

## Summary

You can use `if`/`elif`/`else` (with `[[ ]]` or command exit status), `&&`/`||` short-circuits, loops (`for` list/C-style, `while`, `while IFS= read -r`, `until`), `break`/`continue` (with N), `case` (glob patterns), `select` (menus), and exit status (`$?`, `exit`) — with the `IFS= read -r` and `for`-over-`cat` traps internalized. Next: functions and scope.