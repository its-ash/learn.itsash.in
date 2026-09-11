---
title: "Bash 02 — Variable Internals, Quoting Mechanics & Expansion Order"
description: "Deep-dive into Bash variable assignment, word-splitting internals, IFS semantics, quoting rules, declare attributes, and parameter expansion. Code-first reference with production patterns and anti-patterns."
---

# 02 — Variable Internals, Quoting Mechanics & Expansion Order

## Variable Assignment: No Spaces, No Mercy

::code-wrapper{language="bash"}
```bash
# ── Assignment is a single token — no spaces around = ──
name="Alice"           # assignment: name gets "Alice"
count=5                # integers are still strings — "5"
pi=3.14                # still a string — "3.14"
empty=""               # empty string (distinct from unset)

# ── Why no spaces? Bash tokenizes on whitespace ──
# name = "Alice"   → tokens: ["name", "=", "Alice"]
#                    Bash sees: command "name" with args "=" "Alice"
#                    → "name: command not found" (unless a function/command named "name" exists)

# ── Multiple assignments on one line ──
a=1 b=2 c=3            # valid — three assignments (visible only to the next command)
a=1 b=2 c=3 echo "$a"  # CAUTION: a,b,c are set ONLY for this echo command (temporary env)
#                        After the echo, a,b,c are unset (they were command-scoped env vars).

# ── Chained assignment (same value) ──
x=y=z=42               # x="y=z=42" (NOT what you'd expect — x gets the literal string "y=z=42")
# To assign the same value: x=42; y=42; z=42  OR:  x=42 y=$x z=$x  (but these are env-scoped)
# Clean way:
x=42; y=$x; z=$x       # each is a separate statement — persists.
```
::

## The Expansion Pipeline (What Happens in What Order)

::code-wrapper{language="bash"}
```bash
# When Bash processes a line, expansions happen in THIS order:
# 1. Brace expansion:     {a,b}          → a b
# 2. Tilde expansion:     ~              → /home/user
# 3. Parameter/variable:   $var           → value
# 4. Arithmetic:          $((1+2))       → 3
# 5. Command substitution: $(cmd)         → output
# 6. Process substitution: <(cmd)         → /dev/fd/63
# 7. Word splitting:      (only on unquoted results of 3,4,5)
# 8. Pathname expansion:  *.txt          → file1.txt file2.txt
# 9. Quote removal:        strips quotes from already-expanded tokens

# ── Why order matters: brace expansion happens BEFORE variable expansion ──
prefix="file"
echo {$prefix,backup}          # {file,backup} — brace expansion sees literal $prefix, NOT its value
echo ${prefix}{.txt,.log}     # file.txt file.log — brace expansion on the suffix works

# ── Word splitting only happens on UNQUOTED expansions ──
str="hello world"
echo "$str"                   # "hello world" — quoted: no split, one word
echo $str                     # hello world — unquoted: split into two words, then rejoined by echo
count=$(echo $str | wc -w)    # 2 — unquoted split into 2 words
count=$(echo "$str" | wc -w)  # 1 — quoted: one word

# ── Pathname expansion (globbing) happens AFTER word splitting ──
pattern="*.txt"
echo "$pattern"               # *.txt — quoted: no glob
echo $pattern                 # file1.txt file2.txt — unquoted: glob expands (if matches exist)
# With nullglob off and no matches: echo *.txt  → *.txt (literal)
# With nullglob on and no matches:  echo *.txt  → (empty)
```
::

## Quoting: The #1 Source of Bash Bugs

::code-wrapper{language="bash"}
```bash
# ── Three quoting modes ──
# Double quotes "..."  → variable expansion, NO word splitting, NO globbing
# Single quotes '...'   → NO expansion, literal everything
# No quotes             → expansion + word splitting + globbing (usually a bug)

file="my file.txt"

# ── The word-splitting trap ──
rm $file          # ✗ rm my file.txt — three args: "rm" "my" "file.txt" → deletes wrong things!
rm "$file"        # ✓ rm "my file.txt" — one arg, correct

# ── The globbing trap ──
pattern="*.txt"
ls $pattern       # ✗ globs to all .txt files (if any match) — probably not intended
ls "$pattern"     # ✓ ls "*.txt" — literal pattern (or: no match if file named "*.txt" doesn't exist)

# ── Single quotes: literal, no expansion ──
echo '$HOME'        # $HOME — literal
echo "$HOME"        # /home/user — expanded
echo "It's $HOME"   # It's /home/user — apostrophe inside double quotes is fine
echo 'It'\''s here'  # It's here — close-quote, escaped apostrophe, reopen-quote (single-quote escaping)

# ── The "always quote" rule and its ONE exception ──
# Inside [[ ]], word splitting and globbing are DISABLED — quoting is optional but harmless.
[[ $file == *.txt ]]     # OK — no splitting inside [[ ]]
# But still quote for consistency and safety with special chars:
[[ "$file" == *.txt ]]   # also OK — quoted is always safe
```
::

## Anti-Pattern: Unquoted Variables in `[ ]`

::code-wrapper{language="bash"}
```bash
# ❌ NAIVE — unquoted variable in [ ] (POSIX test)
x=""
if [ $x = "hello" ]; then     # [ = "hello" ] → bash: [: =: unary operator expected
    echo "match"
fi

# ✅ CORRECT — quote the variable
if [ "$x" = "hello" ]; then   # [ "" = "hello" ] → valid, false
    echo "match"
fi

# ✅ BEST — use [[ ]] (no word splitting, no quoting needed)
if [[ $x == "hello" ]]; then  # safe even with empty x
    echo "match"
fi

# ── The glob expansion trap in [ ] ──
x="*.txt"
if [ $x = "file.txt" ]; then   # if glob matches: [ file1.txt = "file.txt" ] — might work or error
    :
fi
if [[ $x == "file.txt" ]]; then # string comparison, no glob (left side is literal)
    :
fi
# NOTE: in [[ ]], the RIGHT side of ==/!= is a glob pattern (unless quoted):
[[ $x == *.txt ]]  # glob match: true if x ends with .txt
[[ $x == "*.txt" ]] # literal match: true only if x is literally "*.txt"
```
::

## `declare` Attributes: Integer, Readonly, Export, Nameref

::code-wrapper{language="bash"}
```bash
# ── declare -i: integer attribute (arithmetic on assignment) ──
declare -i x=5
x=x+3              # 8 — RHS is arithmetically evaluated (no $ needed)
x="hello"          # 0 — non-numeric string evaluates to 0 in arithmetic context (DANGEROUS)
x=$1               # if $1 is "abc" → x becomes 0

# ── declare -r / readonly: immutable ──
declare -r PI=3.14159
# PI=3  → bash: PI: readonly variable (fatal with set -u, just an error otherwise)
readonly EPOCH=0    # `readonly` is equivalent to `declare -r` but also works in POSIX sh

# ── declare -x / export: environment variable (inherited by child processes) ──
declare -x API_KEY="secret"   # child processes see API_KEY in their environment
export API_KEY="secret"       # same thing — `export` is the common form
# Without export: shell variable, NOT inherited by children:
API_KEY="secret"
bash -c 'echo $API_KEY'        # (empty) — child doesn't see it

# ── declare -n: nameref (Bash 4.3+) — reference to another variable ──
target="hello"
declare -n ref=target          # ref is now an alias for target
echo "$ref"                    # hello — reads target's value
ref="world"                    # writes to target
echo "$target"                 # world — target was modified via the nameref

# ── declare -A: associative array (Bash 4+) — see chapter 09 ──
declare -A config=([host]="localhost" [port]=8080)
echo "${config[host]}:${config[port]}"  # localhost:8080

# ── declare -a: indexed array (explicit, but default) ──
declare -a files=()

# ── declare -g: force global scope (even inside a function) ──
set_global() {
    declare -g GVAR=42   # GVAR is global, not local, despite being in a function
}
```
::

## Parameter Expansion: The Full Arsenal

::code-wrapper{language="bash"}
```bash
# ── Default values ──
echo "${var:-default}"    # "default" if unset or empty (does NOT assign)
echo "${var-default}"     # "default" if unset only (empty string passes through)
echo "${var:=default}"    # "default" if unset/empty AND assigns to var
echo "${var:?error msg}"  # if unset/empty: print "error msg" to stderr, EXIT (fatal)
echo "${var:+set}"        # "set" if non-empty, else empty (opposite of :-)

# ── String length ──
str="hello"
echo "${#str}"            # 5

# ── Substring ──
echo "${str:0:3}"         # hel — offset 0, length 3
echo "${str:2}"           # llo — offset 2 to end
echo "${str: -2}"         # lo — last 2 (SPACE before - is required, else it's :- default!)
echo "${str:0-2}"         # lo — alternative: 0-2 (no space needed, arithmetic offset)

# ── Replace (glob patterns, NOT regex) ──
str="hello world"
echo "${str/world/WORLD}"  # hello WORLD — replace first match
echo "${str//l/L}"         # heLLo worLd — replace all matches
echo "${str/#hello/HELLO}" # HELLO world — replace only at start (#)
echo "${str/%world/WORLD}" # hello WORLD — replace only at end (%)

# ── Delete/trim (prefix/suffix) ──
path="/usr/local/bin/bash"
echo "${path##*/}"        # bash — remove LONGEST prefix matching */ (basename)
echo "${path#*/}"         # usr/local/bin/bash — remove SHORTEST prefix */
echo "${path%/*}"         # /usr/local/bin — remove SHORTEST suffix /* (dirname)
echo "${path%%/*}"        # (empty) — remove LONGEST suffix /* (removes everything starting with /)

# ── Case conversion (Bash 4+) ──
str="Hello World"
echo "${str^}"            # Hello World — first char uppercase (already is)
echo "${str^^}"           # HELLO WORLD — all uppercase
echo "${str,}"            # hello World — first char lowercase
echo "${str,,}"           # hello world — all lowercase
echo "${str~~}"           # hELLO wORLD — toggle each char
echo "${str^^[aeiou]}"    # hEllO wOrld — uppercase only matching chars (vowels)

# ── Variable name expansion (indirect) ──
var_name="HOME"
echo "${!var_name}"       # /home/user — expands the variable whose NAME is in var_name
# Equivalently: eval "echo \$$var_name"  but eval is dangerous — prefer ${!var}
```
::

## Anti-Pattern: Parsing `ls` Output

::code-wrapper{language="bash"}
```bash
# ❌ NAIVE — parsing ls output (breaks on spaces, newlines, special chars)
files=$(ls *.txt)
for file in $files; do     # word-splits on spaces — "my file.txt" becomes "my" and "file.txt"
    cp "$file" /backup/
done

# ✅ CORRECT — glob directly (no subprocess, no splitting)
for file in *.txt; do      # glob expands to actual filenames, each a separate word
    cp "$file" /backup/    # quoted — safe with spaces
done

# ✅ BEST — null-delimited find (handles spaces, newlines, ALL special chars)
while IFS= read -r -d '' file; do
    cp "$file" /backup/    # -d '' reads null-delimited; -print0 emits null-delimited
done < <(find . -name '*.txt' -print0)

# ── Why ls parsing fails ──
# 1. ls escapes special chars inconsistently across implementations (GNU vs BSD).
# 2. Filenames can contain newlines (yes, really) — ls output is line-delimited.
# 3. $(ls) captures all output as one string — word splitting on IFS breaks multi-word filenames.
# Globs expand in the shell — no subprocess, no parsing, each file is a separate token.
```
::

## Special Variables: The Full Table

::code-wrapper{language="bash"}
```bash
# ── Positional and argument variables ──
echo "$0"          # script name (or the shell if sourced) — use BASH_SOURCE[0] instead
echo "$1"          # first positional arg
echo "${10}"       # 10th arg — MUST use braces ($10 is $1 followed by literal "0")
echo "$@"          # all args, each separately word (use QUOTED: "$@")
echo "$*"          # all args, joined by IFS into one string (use QUOTED: "$*")
echo "$#"          # count of positional args

# ── Process state ──
echo "$?"          # exit status of last command (0-255)
echo "$$"          # PID of current shell
echo "$!"          # PID of last backgrounded command
echo "$_"          # last argument of previous command (or path to script at startup)
echo "$-"          # current shell option flags (e.g., "himsBH" — see set -o)

# ── BASH-specific ──
echo "$BASH_VERSION"          # e.g. 5.2.15(1)-release
echo "${BASH_VERSINFO[0]}"    # major version (integer) — use for feature gating
echo "$BASH_SOURCE"           # array of source file paths in call stack
echo "$LINENO"                # current line number (for trap ERR, debug)
echo "$FUNCNAME"              # array of function names in call stack
echo "$BASH_REMATCH"          # array of regex captures from [[ =~ ]]
echo "$BASH_SUBSHELL"         # subshell nesting level
echo "$BASH_EXECUTION_STRING" # the string passed to `bash -c`
```
::

## `"$@"` vs `"$*"`: The Definitive Example

::code-wrapper{language="bash"}
```bash
show_args() {
    echo "count: $#"
    for arg in "$@"; do      # "$@" → each arg is a separate, quoted word
        echo "  [$arg]"
    done
}

show_args_joined() {
    echo "count: $#"
    for arg in "$*"; do      # "$*" → all args joined by IFS into ONE string
        echo "  [$arg]"      # loop runs ONCE with the full joined string
    done
}

# ── Test with args containing spaces ──
show_args "a" "b c" "d"
# count: 3
#   [a]
#   [b c]       ← preserved as one word
#   [d]

show_args_joined "a" "b c" "d"
# count: 3
#   [a b c d]   ← all joined by IFS (space) into one string

# ── The unquoted trap ──
show_args_unquoted() {
    for arg in $@; do         # ✗ unquoted: word-splits EVERY arg on IFS
        echo "  [$arg]"       # "b c" becomes two iterations: "b" and "c"
    done
}
show_args_unquoted "a" "b c" "d"
#   [a]
#   [b]         ← split!
#   [c]         ← split!
#   [d]

# ── Changing IFS affects "$*" but NOT "$@" ──
save_ifs=$IFS
IFS=':'
echo "$*"        # with IFS=: → args joined by ":" (a:b c:d)
IFS=$save_ifs
echo "$@"        # unchanged — "$@" doesn't use IFS
```
::

## Scope: Global by Default, `local` for Functions

::code-wrapper{language="bash"}
```bash
# ── Variables are global by default — even inside functions ──
set_global() {
    x=42           # this is a GLOBAL assignment — leaks to caller
}
set_global
echo "$x"          # 42 — x was set globally

# ── `local` creates function-scoped variable ──
set_local() {
    local y=99     # y is local to set_local — does NOT leak
}
set_local
echo "${y:-unset}"  # unset — y didn't leak

# ── Dynamic scoping (not lexical) ──
# Bash uses DYNAMIC scoping: a local var in outer() is visible to functions it calls.
outer() {
    local x="outer's x"
    inner          # inner can SEE outer's local x (dynamic scope!)
}
inner() {
    echo "$x"      # "outer's x" — sees caller's local (surprising for C/Java devs)
}
outer              # outer's x

# In lexical scoping (Python/JS), inner() would NOT see x (x isn't defined in inner's scope).
# In Bash's dynamic scoping, inner() sees whatever local x the CALLER has on the stack.

# ── `local` always shadows ──
shadow_test() {
    local x="shadowed"    # this shadows any caller's x
    echo "$x"             # "shadowed"
}
caller_fn() {
    local x="caller's"
    shadow_test           # prints "shadowed" (shadow_test's local wins)
    echo "$x"             # "caller's" (shadow_test's local is gone after return)
}
caller_fn
```
::

## Anti-Pattern: Variable Leaks in a Loop

::code-wrapper{language="bash"}
```bash
# ❌ NAIVE — loop variable leaks to global scope
for i in 1 2 3; do
    last=$i       # `last` is GLOBAL — persists after the loop
done
echo "$last"      # 3 — leaked

# ✅ CORRECT — but usually you want the last value, so this is fine.
# If you DON'T want the leak, run the loop in a subshell:
(
    for i in 1 2 3; do
        last=$i
    done
    echo "inside: $last"   # 3
)
echo "outside: ${last:-unset}"  # unset — subshell didn't leak

# ── The pipe-into-while subshell trap ──
# ❌ NAIVE — variables set in a `while` after a pipe are lost (subshell!)
echo "1 2 3" | while read num; do
    total=$((total + num))   # total is set in the SUBSHELL — lost after the loop!
done
echo "total: ${total:-0}"    # 0 — subshell variable didn't propagate

# ✅ CORRECT — process substitution avoids the subshell
total=0
while read -r num; do
    total=$((total + num))   # set in the MAIN shell — persists
done < <(echo "1 2 3")       # <() feeds the while WITHOUT a subshell
echo "total: $total"         # 6 — correct
```
::

## Reading Input: `read` Internals

::code-wrapper{language="bash"}
```bash
# ── read: the canonical line reader ──
# IFS=    → don't trim leading/trailing whitespace
# -r      → don't interpret backslashes (literal)
# -d ''   → read until null byte (for find -print0)
# -a arr  → read words into array
# -p msg  → prompt (Bash 4+)
# -s      → silent (no echo — passwords)
# -t N    → timeout N seconds
# -N n    → read exactly n chars (not line-delimited)

# ── Safe line reading ──
while IFS= read -r line; do
    printf '%s\n' "$line"
done < file.txt

# ── read into multiple variables ──
# Default IFS splits on whitespace — each var gets one word, last gets the rest
echo "Alice Smith 30 NYC" | { read -r first last age city; echo "$first $last $age $city"; }
# Alice Smith 30 NYC — last var (city) gets "NYC" (the rest of the line)

# ── read with a custom delimiter (CSV) ──
IFS=',' read -r name,age,role <<< "Alice,30,admin"
# ── read with timeout ──
read -r -t 5 -p "Answer (5s): " answer || { echo "Timeout!" >&2; answer=""; }

# ── read returns non-zero on EOF (ends while loop) ──
# This is WHY `while IFS= read -r line; do ...; done < file` works:
# read returns 1 at EOF → while condition is false → loop exits.

# ── read in a pipeline runs in a subshell (variables lost!) ──
echo "hello" | { read -r x; echo "in block: $x"; }  # in block: hello (block is a subshell)
echo "after: ${x:-unset}"                            # after: unset — subshell didn't leak x
```
::

## 💡 Tips & Tricks

::code-wrapper{language="bash"}
```bash
# ── Zero-allocation string ops: parameter expansion vs sed ──
# Parameter expansion is O(n) in-process — no subprocess, no fork/exec.
str="hello world"
# ❌ SLOW: forks sed subprocess for a simple replacement
new=$(echo "$str" | sed 's/world/earth/')
# ✅ FAST: in-process parameter expansion (no subprocess)
new="${str/world/earth}"

# ── Indirect expansion for dynamic variable names ──
# Instead of eval (dangerous), use ${!var}:
prefix="CONFIG_DB"
var_name="${prefix}_HOST"
echo "${!var_name}"        # expands $CONFIG_DB_HOST — safe, no eval

# ── Append without reassignment: += works on strings and arrays ──
str="hello"
str+=" world"              # hello world — string append
arr=()
arr+=("a" "b" "c")         # array append (3 elements)
arr+="d"                   # ❌ CAREFUL: appends "d" to arr[0], NOT as a new element!
                            # arr is now ("ad" "b" "c") — the += on a string context appends to [0].

# ── `printf -v`: write formatted output to a variable (no subprocess!) ──
printf -v padded '%05d' 42   # padded="00042" — no $(printf ...) subprocess
printf -v json '{"name":"%s","age":%d}' "Alice" 30  # padded JSON string
printf -v header '%s\n%s\n' "Title" "Subtitle"      # multi-line string

# ── Uppercase/lowercase without tr (Bash 4+) ──
# ❌ SLOW: tr subprocess
upper=$(echo "$str" | tr 'a-z' 'A-Z')
# ✅ FAST: parameter expansion (Bash 4+)
upper="${str^^}"
lower="${str,,}"
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="bash"}
```bash
# ── `declare -i` silently converts non-numeric to 0 ──
declare -i x
x="hello"          # x is 0 — no error, no warning (silent data loss!)
# Always validate before arithmetic: [[ $input =~ ^[0-9]+$ ]] || die "not a number"

# ── Empty array with set -u (Bash < 4.4) ──
set -u
declare -a arr=()
echo "${arr[@]}"    # Bash 4.4+: OK (empty). Bash < 4.4: "unbound variable" error!
# Fix: echo "${arr[@]:-}"  — the :- makes it safe

# ── `local` and `declare` have different return codes ──
# `local x=$(false)` — local's exit status is 0 (not false's!) — masks failures with set -e
set -e
f() { local x=$(false); echo "reached"; }  # "reached" — local ate the failure!
# Fix: separate the assignment:
f() { local x; x=$(false); echo "reached"; }  # exits — false's status propagates

# ── `${var:-default}` vs `${var-default}` ──
unset_var=
echo "${unset_var:-default}"  # "default" — :- triggers on unset OR empty
echo "${unset_var-default}"   # "" — - triggers on unset ONLY (empty passes through)
unset unset_var
echo "${unset_var-default}"    # "default" — now it's unset, so - triggers

# ── `export` doesn't affect parent or sibling processes ──
# export only propagates DOWN to child processes, never UP to parent.
# In a script: export FOO=bar — the calling shell doesn't see FOO.
# To affect the parent: `source` the script (runs in the parent shell) or use a file/env file.

# ── `${var:?msg}` exits even in a subshell ──
# ${var:?msg} sends msg to stderr and exits. If in a subshell, only the subshell exits.
( echo "${UNSET:?need a value}" ) 2>/dev/null || echo "subshell exited"

# ── Nameref circular reference ──
# local -n arr=$1  — if $1 is "arr" (same name as the nameref), circular reference!
process() { local -n arr=$1; echo "${arr[@]}"; }
arr=(1 2 3)
process arr    # ✗ circular reference — arr references itself
# Fix: use a distinct local name:
process() { local -n _ref=$1; echo "${_ref[@]}"; }
process arr    # ✓ _ref is different from arr
```
::

## 🧠 Quick Quiz

What does this print, and why?

::code-wrapper{language="bash"}
```bash
set -u
declare -a arr=()
echo "len: ${#arr[@]}"
for item in "${arr[@]}"; do
    echo "item: $item"
done
echo "done"
```
::

<details>
<summary>Answer</summary>

- **Bash 4.4+**: `len: 0`, then `done` (empty array doesn't trigger `set -u`).
- **Bash < 4.4**: `len: 0`, then **`bash: arr[@]: unbound variable`** — `${#arr[@]}` works, but `"${arr[@]}"` on an empty array triggers `set -u` in older Bash.

**The fix for pre-4.4**: use `"${arr[@]:-}"` — the `:-` provides an empty default, preventing the unbound variable error.

**The lesson**: `set -u` interacts badly with empty arrays in Bash < 4.4. Always use `${arr[@]:-}` or gate on `(( ${#arr[@]} > 0 ))` before expanding.

</details>