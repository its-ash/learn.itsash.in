---
title: "Bash 04 — Control Flow Internals, Loop Patterns & Exit Status Mechanics"
description: "Deep-dive into Bash control flow: if/elif/else with command exit status, loop variants (for/while/until/C-style), while read -r line-by-line internals, case glob dispatch, and select menu mechanics. Code-first reference with production patterns."
---

# 04 — Control Flow Internals, Loop Patterns & Exit Status Mechanics

## `if`: It's All About Exit Status

::code-wrapper{language="bash"}
```bash
# ── if runs the `then` block if the command's exit status is 0 (success) ──
# ANY command works — not just [[ ]] or [ ]:

if grep -q "error" logfile.txt; then        # grep -q: exit 0 if match, 1 if no match, 2 on error
    echo "found errors"                    # runs if grep exits 0
fi

if cd "$dir" 2>/dev/null; then              # cd: exit 0 if dir exists, non-zero otherwise
    echo "now in $dir"                      # 2>/dev/null suppresses "No such file" error
fi

if ping -c 1 -W 2 "$host" &>/dev/null; then # ping: exit 0 if host responds
    echo "host is up"
fi

if command -v docker &>/dev/null; then      # command -v: exit 0 if command exists
    echo "docker available"
fi

# ── elif chains ──
if [[ $status -eq 200 ]]; then
    echo "OK"
elif [[ $status -ge 400 && $status -lt 500 ]]; then
    echo "client error"
elif [[ $status -ge 500 ]]; then
    echo "server error"
else
    echo "unknown: $status"
fi

# ── Negating a condition ──
if ! grep -q "ok" file.txt; then            # ! negates the exit status
    echo "no ok found"
fi
```
::

## `&&` / `||`: Short-Circuit Composition

::code-wrapper{language="bash"}
```bash
# ── && runs the right side ONLY if the left side succeeded ──
# ── || runs the right side ONLY if the left side failed ──

[[ -f config.txt ]] && echo "config exists"
[[ -f config.txt ]] || { echo "config missing" >&2; exit 1; }

# ── Chaining (all must succeed) ──
mkdir -p "$dir" && cd "$dir" && touch marker.txt && echo "setup complete"

# ── Guard pattern: check then act ──
[[ -n "$API_KEY" ]] || { echo "API_KEY required" >&2; exit 1; }

# ── Don't overuse — for complex logic, if/then is clearer ──
# ❌ HARD TO READ
[[ $x -gt 0 ]] && [[ $y -gt 0 ]] && echo "both positive" || echo "at least one non-positive"
# (the || binds to the LAST && — if the echo succeeds, || won't fire. Subtle!)

# ✅ CLEAR
if ((x > 0 && y > 0)); then
    echo "both positive"
else
    echo "at least one non-positive"
fi

# ── The || { ... } guard is a production idiom ──
cd "$BUILD_DIR" || { echo "can't cd to $BUILD_DIR" >&2; exit 1; }
# If cd fails, the || block runs: print error, exit. If cd succeeds, skip.
# Note: use { } (command group, same shell) not ( ) (subshell — exit would only exit the subshell!)
```
::

## `for` Loops: List and C-Style

::code-wrapper{language="bash"}
```bash
# ── for list: iterate over words ──
for fruit in apple banana cherry; do
    echo "$fruit"
done

# ── for over a glob (safe — no word splitting issues) ──
for file in *.txt; do
    echo "processing $file"
done
# ⚠️ With nullglob off: if no .txt files, the loop runs ONCE with file="*.txt" (literal).
# Fix: shopt -s nullglob (empty result) or check inside:
for file in *.txt; do
    [[ -e $file ]] || continue   # skip if no match (glob passed literally)
    echo "processing $file"
done

# ── for over array (ALWAYS quote [@]) ──
files=("my file.txt" "other file.txt" "third.txt")
for file in "${files[@]}"; do    # [@] quoted: each element is a separate word
    echo "$file"
done

# ── for over args ──
for arg in "$@"; do    # "$@" quoted: each positional arg is a separate word
    echo "arg: $arg"
done

# ── C-style for (arithmetic) ──
for ((i = 0; i < 5; i++)); do
    echo "i=$i"
done

# ── C-style with multiple variables ──
for ((i = 0, j = 10; i < 5; i++, j--)); do
    printf '%d %d\n' "$i" "$j"
done

# ── C-style with step ──
for ((i = 0; i < 100; i += 10)); do
    echo "i=$i"   # 0 10 20 30 40 50 60 70 80 90
done

# ── Infinite loop with break ──
for ((;;)); do
    ((count++))
    ((count >= 100)) && break
done
```
::

## `while` and `until`

::code-wrapper{language="bash"}
```bash
# ── while: loop while condition is true (exit 0) ──
count=0
while ((count < 5)); do
    echo "count=$count"
    ((count++))
done

# ── until: loop while condition is false (exit non-zero) ──
# (until is just while with inverted condition)
until ping -c 1 "$host" &>/dev/null; do
    echo "waiting for $host..."
    sleep 1
done
echo "$host is up"

# ── while with command condition (poll until success) ──
while ! curl -s "$health_url" &>/dev/null; do
    echo "waiting for health check..."
    sleep 2
done
echo "healthy"

# ── while with command condition (read until EOF) ──
while read -r line; do    # read returns non-zero at EOF → loop exits
    echo "$line"
done < file.txt
```
::

## `while IFS= read -r`: The Canonical Line Reader

::code-wrapper{language="bash"}
```bash
# ── Every part is load-bearing ──
# IFS=    → don't trim leading/trailing whitespace (default IFS=space/tab/newline trims)
# read    → read one line from stdin
# -r      → don't interpret backslashes (without -r, \t becomes tab, \\ becomes \)
# line    → variable to store the line

while IFS= read -r line; do
    printf '%s\n' "$line"
done < file.txt

# ── Why IFS= matters ──
# Input: "  hello world  "
# With IFS= (empty): line="  hello world  " (preserved)
# Without IFS= (default): line="hello world" (leading/trailing whitespace trimmed)

# ── Why -r matters ──
# Input: "path\to\file"
# With -r: line="path\to\file" (literal backslashes)
# Without -r: line="pathtofile" (backslashes stripped, \t → tab)

# ── Reading multiple fields per line ──
while IFS=, read -r name age city; do
    # IFS=, sets the delimiter for THIS read only (not global)
    echo "$name ($age) from $city"
done < data.csv
# CSV: "Alice,30,NYC" → name=Alice age=30 city=NYC
# Last var gets the rest of the line (including any commas): "Alice,30,NYC,USA" → city="NYC,USA"

# ── Reading from a command (process substitution — avoids subshell trap) ──
while IFS= read -r line; do
    echo "$line"    # runs in MAIN shell — variables persist
done < <(grep "error" log.txt)

# ── Reading with a different delimiter (null-delimited, for find -print0) ──
while IFS= read -r -d '' file; do
    # -d '' sets the delimiter to null byte (NUL)
    # This is the ONLY safe way to handle filenames with spaces, newlines, or special chars
    echo "found: $file"
done < <(find . -name '*.py' -print0)

# ── Reading from a heredoc ──
while IFS= read -r line; do
    echo "processing: $line"
done <<EOF
first line
second line
third line
EOF

# ── Skipping blank lines and comments ──
while IFS= read -r line; do
    [[ -z "$line" ]] && continue          # skip blank lines
    [[ "$line" =~ ^[[:space:]]*# ]] && continue  # skip comments
    echo "$line"
done < config.txt
```
::

## Anti-Pattern: `for line in $(cat file)`

::code-wrapper{language="bash"}
```bash
# ❌ NAIVE — for over cat output (word-splits on whitespace, breaks on spaces)
for line in $(cat file.txt); do
    echo "$line"
done
# "hello world" becomes two iterations: "hello" and "world"
# Also forks a cat subprocess (unnecessary).

# ✅ CORRECT — while read (line-by-line, no splitting)
while IFS= read -r line; do
    echo "$line"
done < file.txt
# No subprocess, no word splitting, backslashes preserved, whitespace preserved.

# ── Why for $(cat) fails ──
# $(cat file.txt) captures all output as ONE string.
# for ... in <string> splits the string on IFS (whitespace by default).
# So "hello world\nfoo" becomes three words: "hello" "world" "foo".
# Even with IFS=$'\n', it still forks cat unnecessarily.
```
::

## The Pipe-into-While Subshell Trap

::code-wrapper{language="bash"}
```bash
# ❌ NAIVE — variables set in while-after-pipe are lost (subshell!)
total=0
echo -e "1\n2\n3" | while read -r num; do
    total=$((total + num))    # set in SUBSHELL (the right side of | runs in a subshell)
done
echo "total=$total"          # total=0 — subshell's changes didn't propagate!

# ✅ CORRECT — process substitution avoids the subshell
total=0
while read -r num; do
    total=$((total + num))    # set in MAIN shell
done < <(echo -e "1\n2\n3")  # <() feeds stdin WITHOUT creating a subshell for the while body
echo "total=$total"          # total=6 — correct!

# ✅ ALTERNATIVE — here-string (for short input)
total=0
while read -r num; do
    total=$((total + num))
done <<< "$(echo -e '1\n2\n3')"
echo "total=$total"          # total=6 — correct

# ── Why the pipe creates a subshell ──
# In `cmd1 | cmd2`, cmd2 runs in a subshell (a fork of the main shell).
# Any variable assignments in cmd2 (the while loop) are lost when the subshell exits.
# Process substitution <(...) provides cmd1's output as a file descriptor —
# the while loop stays in the main shell and reads from that fd.
```
::

## `case`: Glob-Based Dispatch

::code-wrapper{language="bash"}
```bash
# ── case matches the first matching glob pattern ──
case "$1" in
    start)
        echo "starting..."
        ;;
    stop)
        echo "stopping..."
        ;;
    restart|reload)         # | = alternation (match either)
        echo "restarting..."
        ;;
    --*)
        echo "long option: $1"   # --* matches anything starting with --
        ;;
    *)
        echo "usage: $0 {start|stop|restart}" >&2
        exit 1
        ;;
esac

# ── Patterns are GLOBS, not regex ──
case "$file" in
    *.jpg|*.png|*.gif)   echo "image: $file" ;;   # glob: * matches any chars
    [A-Z]*)            echo "uppercase start" ;;  # [A-Z] char class
    *)                 echo "other" ;;
esac

# ── Capturing subpatterns: case doesn't support capture groups ──
# Use [[ =~ ]] with BASH_REMATCH for capture groups:
if [[ $1 =~ ^--([^=]+)=(.*)$ ]]; then
    key="${BASH_REMATCH[1]}"   # e.g. "output" from "--output=file.txt"
    value="${BASH_REMATCH[2]}" # e.g. "file.txt"
    echo "key=$key value=$value"
fi

# ── Fall-through: ;;& (test next pattern) vs ;& (run next body) ──
# Bash 4+ has ;;& and ;& for fall-through:
case "$x" in
    *.txt)
        echo "text file"
        ;;&                    # ;;& — continue testing patterns below
    *.gz)
        echo "gzipped"
        ;;
esac
# If x="file.txt.gz": prints "text file" then "gzipped" (both matched with ;;&)

case "$x" in
    *.txt)
        echo "text file"
        ;&                     # ;& — fall through to next body WITHOUT testing pattern
    *.gz)
        echo "gzipped"         # always runs if *.txt matched (no re-test)
        ;;
esac
# If x="file.txt": prints "text file" then "gzipped" (fell through without matching *.gz)

# ── Subcommand dispatch pattern ──
case "${1:-help}" in
    build)   shift; cmd_build "$@" ;;
    test)    shift; cmd_test "$@" ;;
    deploy)  shift; cmd_deploy "$@" ;;
    help|-h|--help) usage ;;
    *)       echo "unknown: $1" >&2; usage; exit 1 ;;
esac
```
::

## `break` and `continue`

::code-wrapper{language="bash"}
```bash
# ── break: exit the loop ──
for i in {1..10}; do
    ((i == 5)) && break   # stop at 5
    echo "$i"
done
# prints: 1 2 3 4

# ── continue: skip to next iteration ──
for i in {1..10}; do
    ((i % 2 == 0)) && continue   # skip even numbers
    echo "$i"
done
# prints: 1 3 5 7 9

# ── break N: break out of N nested loops ──
for i in {1..3}; do
    for j in {1..3}; do
        ((j == 2)) && break 2   # break out of BOTH loops
        echo "$i $j"
    done
done
# prints: 1 1 (breaks on j=2, exits both loops)

# ── continue N: continue the Nth outer loop ──
for i in {1..3}; do
    for j in {1..3}; do
        ((j == 2)) && continue 2   # skip to next i iteration
        echo "$i $j"
    done
done
# prints: 1 1, 2 1, 3 1 (on j=2, skips to next i)
```
::

## `select`: Interactive Menus

::code-wrapper{language="bash"}
```bash
# ── select generates a numbered menu, reads choice into the variable ──
PS3="Choose a fruit: "        # PS3 is the prompt for select (like PS1 for shell prompt)
select fruit in apple banana cherry "quit"; do
    case "$fruit" in
        apple|banana|cherry)
            echo "you chose $fruit"
            ;;
        quit)
            break              # select loops until break
            ;;
        *)
            echo "invalid: $REPLY"  # $REPLY is the raw input (the number or text)
            ;;
    esac
done

# ── select with an array ──
options=("Build" "Test" "Deploy" "Quit")
PS3="> "
select opt in "${options[@]}"; do
    case "$opt" in
        Build|Test|Deploy) echo "running $opt..." ;;
        Quit) break ;;
        *) echo "invalid choice" ;;
    esac
done

# ── select reads from stdin — redirect for non-interactive use ──
select opt in build test deploy; do
    echo "$opt"
    break
done <<< "build"   # feeds "build" as input → opt=build
```
::

## Exit Status: The Heart of Bash Control Flow

::code-wrapper{language="bash"}
```bash
# ── Every command returns an exit status (0-255) ──
# 0 = success, 1-255 = failure
# $? = exit status of the last command (SAVE IT IMMEDIATELY — it's overwritten by next command)

grep "error" log.txt
status=$?    # save immediately — any command overwrites $?
if ((status == 0)); then
    echo "found"
elif ((status == 1)); then
    echo "not found"
elif ((status == 2)); then
    echo "grep error"
fi

# ── Exit codes convention ──
# 0     success
# 1     general failure
# 2     misuse / usage error (shell builtin convention)
# 126   command found but not executable
# 127   command not found
# 128   invalid exit argument (exit 300 → 44, modulo 256)
# 128+N killed by signal N:
#   130 = 128+2  (SIGINT, Ctrl-C)
#   137 = 128+9  (SIGKILL)
#   143 = 128+15 (SIGTERM)

# ── `exit` wraps to 0-255 ──
exit 300   # actual exit code: 44 (300 % 256 = 44)
exit -1    # actual exit code: 255 (-1 % 256 = 255)

# ── Functions: `return` (not `exit`) ──
check_file() {
    [[ -f "$1" ]] && return 0 || return 1
    # return is like exit but for functions — returns to the caller
    # return 0 = success, return 1-255 = failure
    # return without a value uses the last command's exit status
}

# ── Command lists propagate exit status ──
# The exit status of a command list is the LAST command's status:
false; true    # exit 0 (true is last)
true; false    # exit 1 (false is last)

# ── `!` negates exit status ──
! false        # exit 0 (negated 1 → 0)
! true         # exit 1 (negated 0 → 1)
```
::

## Production Pattern: Retry with Backoff

::code-wrapper{language="bash"}
```bash
# ── Retry a command with exponential backoff ──
retry() {
    local max_attempts=$1 delay=$2 shift 2
    local attempt=1
    local status=0

    while ((attempt <= max_attempts)); do
        "$@" && return 0    # success — return 0
        status=$?           # capture failure status
        log WARN "attempt $attempt/$max_attempts failed (exit $status)"
        ((attempt < max_attempts)) && sleep "$delay"
        ((delay *= 2))      # exponential backoff: 1, 2, 4, 8, ...
        ((delay > 60)) && delay=60  # cap at 60s
        ((attempt++))
    done

    return "$status"        # return the last failure's exit status
}

# Usage: retry 5 1 curl -s "$url" -o "$file"
# Retries up to 5 times with backoff: 1s, 2s, 4s, 8s, 16s
```
::

## 💡 Tips & Tricks

::code-wrapper{language="bash"}
```bash
# ── `while true` for infinite loops with a break condition ──
while true; do
    response=$(curl -s "$url")
    [[ "$response" == *"ready"* ]] && break
    sleep 5
done

# ── Process all files with null-delimited find (handles ALL filenames) ──
while IFS= read -r -d '' file; do
    process "$file"
done < <(find . -type f -print0)

# ── Loop with index using C-style for ──
arr=("a" "b" "c")
for ((i = 0; i < ${#arr[@]}; i++)); do
    printf '%d: %s\n' "$i" "${arr[i]}"
done

# ── Loop with index and value (for in + !array[@]) ──
for i in "${!arr[@]}"; do    # ${!arr[@]} = indices of array
    printf '%d: %s\n' "$i" "${arr[i]}"
done

# ── Batch processing with chunked iteration ──
items=($(seq 1 100))
batch_size=10
for ((i = 0; i < ${#items[@]}; i += batch_size)); do
    batch=("${items[@]:i:batch_size}")   # slice the array
    printf 'batch: %s\n' "${batch[*]}"
done
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="bash"}
```bash
# ── `for f in *.txt` passes literal "*.txt" if no match ──
# Without nullglob: for f in *.txt → f="*.txt" (literal, one iteration)
# With nullglob:    for f in *.txt → zero iterations (empty result)
# With failglob:    for f in *.txt → bash: no match: *.txt (error, script aborts)
# Choose: nullglob (safe, no iteration) for loops. failglob for one-shot globs.

# ── `until` is `while not` (easy to confuse) ──
# while condition  → loop while TRUE
# until condition  → loop while FALSE (i.e., until it becomes true)
until [[ -f /tmp/ready ]]; do sleep 1; done  # wait until file appears

# ── `exit` in a subshell doesn't exit the script ──
echo "before"
(echo "in subshell"; exit 1)   # subshell exits 1, but...
echo "after"                    # prints! The main script continues.
# To propagate: check the subshell's status:
( exit 1 ) || { echo "subshell failed" >&2; exit 1; }

# ── `$?` is volatile — save it immediately ──
cmd
status=$?    # ← save NOW
echo "status: $status"
other_cmd
echo "$?"     # this is other_cmd's status, NOT cmd's!

# ── `while read` without IFS= and -r (silent data corruption) ──
# ❌ for line in $(cat file) — word splits, breaks on spaces
# ❌ while read line        — trims whitespace (IFS=default), interprets backslashes (no -r)
# ✅ while IFS= read -r line — preserves everything (canonical)

# ── case patterns are globs, not regex ──
case "$str" in
    .*\.txt)  echo "hidden txt" ;;  # glob: . (literal dot) * (any chars) .txt
    *)        echo "other" ;;
esac
# For regex matching, use [[ $str =~ regex ]], not case.
```
::

## 🧠 Quick Quiz

Why does this loop never end?

::code-wrapper{language="bash"}
```bash
i=0
while ((i < 10)); do
    echo "$i"
done
```
::

<details>
<summary>Answer</summary>

`i` is never incremented inside the loop. `((i < 10))` is always true (0 < 10) because `i` stays 0 forever. Infinite loop.

**Fix**: increment `i` inside the loop body:

::code-wrapper{language="bash"}
```bash
i=0
while ((i < 10)); do
    echo "$i"
    ((i++))    # ← missing increment
done
```
::

**The lesson**: `while` checks the condition each iteration, but if the condition's variables never change, the loop never exits. Always ensure the loop body modifies the condition variable (or has a `break`).

</details>