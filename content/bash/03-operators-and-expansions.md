---
title: "Bash 03 — Arithmetic Engine, Test Conditionals & Expansion Pipelines"
description: "Deep-dive into Bash arithmetic evaluation ((...)), test conditionals ([[]] vs []), command/process substitution internals, brace expansion, and glob mechanics. Code-first reference for senior engineers."
---

# 03 — Arithmetic Engine, Test Conditionals & Expansion Pipelines

## Arithmetic Evaluation: `((...))` vs `$((...))`

::code-wrapper{language="bash"}
```bash
# ── Two forms, two purposes ──
# ((expr))   → evaluates expr; returns exit status (0 if result != 0, 1 if result == 0)
# $((expr))  → evaluates expr; EXPANDS to the result (used in commands/assignments)

x=10
((x = x + 5))         # x is now 15 — assignment in arithmetic context (no $ needed)
((x++))               # 16 — postfix increment (returns old value, increments after)
((++x))               # 17 — prefix increment (increments first, returns new value)
((x *= 2))            # 34 — compound assignment
((x %= 5))            # 4  — 34 % 5 = 4

# ── As a condition (returns exit status) ──
((x > 10)) && echo "big"       # big — exit 0 (true) since 17 > 10
((x < 10)) || echo "not big"   # not big — exit 1 (false), so || fires

# ── As expansion (returns the value) ──
result=$((x * 3))     # result is 12 — $((...)) expands to the computed value
echo "$((17 % 5))"    # 2 — modulo
echo "$((17 / 5))"    # 3 — integer division (truncates toward zero)
echo "$((-17 / 5))"   # -3 — truncates toward ZERO (not floor!), so -17/5 = -3.4 → -3
echo "$((2 ** 10))"   # 1024 — exponentiation
echo "$((5 << 3))"    # 40 — bitwise left shift (5 * 2^3)
echo "$((0xFF))"      # 255 — hex literal
echo "$((0b1010))"    # 10 — binary literal (Bash 2.21+... wait, actually Bash 4.1+? No, 0b is NOT supported)
                       # ^-- 0b prefix is NOT supported in Bash arithmetic. Use $((2#1010)) instead.
echo "$((2#1010))"    # 10 — base#number notation (2# = binary, 8# = octal, 16# = hex)
echo "$((8#777))"     # 511 — octal
echo "$((16#FF))"     # 255 — hex (same as 0xFF)

# ── Variables don't need $ inside ((...)) — but they CAN have it ──
a=5
((a + 1))             # evaluates a+1=6, returns 0 (non-zero result)
echo "$((a + 1))"      # 6 — same
echo "$(($a + 1))"     # 6 — also works (but unnecessary, and can cause issues with array refs)
```
::

## Anti-Pattern: Using `expr` or `let` for Arithmetic

::code-wrapper{language="bash"}
```bash
# ❌ SLOW — expr forks a subprocess per operation
x=$(expr 5 + 3)          # forks /usr/bin/expr — slow, error-prone with special chars
x=$(expr "$a" \* "$b")    # must escape * — it's a glob! And spaces required around operators.

# ❌ LEGACY — let (works but ((...)) is clearer and more powerful)
let x=5+3                 # works, but ((x = 5 + 3)) is the modern idiom

# ✅ CORRECT — ((...)) and $((...)) are in-process, no subprocess
((x = 5 + 3))             # assignment — no subprocess
x=$((5 + 3))              # expansion — no subprocess
# Benchmark: 100,000 iterations
#   x=$(expr 1 + 1):  ~12s (forking 100k subprocesses)
#   x=$((1 + 1)):     ~0.3s (in-process) — 40x faster
```
::

## `((...))` Exit Status Quirk

::code-wrapper{language="bash"}
```bash
# ── ((expr)) returns exit 0 if the RESULT is non-zero, exit 1 if the RESULT is zero ──
# This is C-style "0 is false, non-zero is true" — but it can bite you:

((0))                    # exit 1 — result is 0, which is "false"
((1))                    # exit 0 — result is 1, which is "true"
((x = 0))                # exit 1 — the ASSIGNMENT result is 0, so exit 1!
#  ^-- with `set -e`, ((x = 0)) would EXIT the script (because exit status is 1)!
#  Fix: ((x = 0)) || true  — explicitly allow zero result.

# ── Increment to zero is a trap ──
x=1
((x--))                  # x is now 0, but the EXPRESSION returns the OLD value (1) → exit 0
((x--))                  # x is now -1, expression returns 0 (old value) → exit 1!
#  ^-- set -e would kill the script here because the expression evaluated to 0.

# ── Safe pattern: always || true or use the assignment form ──
((x++)) || true          # always safe — can't trigger set -e
: $((x++))               # : is a no-op that discards the expansion — no exit status issue
```
::

## Test Conditionals: `[[... ]]` vs `[... ]`

::code-wrapper{language="bash"}
```bash
# ── [ ] is POSIX test (a command, not syntax) — needs careful quoting ──
# ── [[ ]] is Bash-extended test (syntax, not a command) — safe without quoting ──

# ── String comparison ──
str="hello"
[[ $str == "hello" ]]     # true — no quoting needed (no word splitting in [[ ]])
[[ "$str" == "hello" ]]   # also true — quoting is safe but unnecessary
[ "$str" = "hello" ]      # true — MUST quote in [ ] (or [ $str = hello ] breaks with empty str)
# Note: [ ] uses `=` for string equality. [[ ]] accepts both `=` and `==` (use == for clarity).

# ── Pattern matching (glob, RIGHT side only) ──
file="report_2024.txt"
[[ $file == *.txt ]]       # true — glob pattern on right side
[[ $file == report_* ]]   # true — prefix glob
[[ $file == *2024* ]]     # true — substring glob
[[ $file != *.log ]]      # true — negated glob

# ── Regex matching (extended regex, RIGHT side) ──
email="user@example.com"
re='^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
[[ $email =~ $re ]]       # true — store regex in variable for readability (and to avoid quoting issues)
echo "${BASH_REMATCH[0]}"  # user@example.com — full match
echo "${BASH_REMATCH[1]}"  # (empty — no capture groups in this regex)

date="2024-01-15"
[[ $date =~ ^([0-9]{4})-([0-9]{2})-([0-9]{2})$ ]]
echo "${BASH_REMATCH[1]}"  # 2024 — first capture group
echo "${BASH_REMATCH[2]}"  # 01 — second capture group
echo "${BASH_REMATCH[3]}"  # 15 — third capture group

# ── ⚠️ Don't quote the regex — quoting makes it a literal string ──
[[ $date =~ "^([0-9]{4})" ]]  # ✗ matches literal "^([0-9]{4})" — not a regex
[[ $date =~ ^([0-9]{4}) ]]   # ✓ regex match (but hard to read inline)
[[ $date =~ $re ]]            # ✓ BEST — store in variable, reference unquoted

# ── && and || inside [[ ]] (not -a / -o) ──
[[ -f "$file" && -r "$file" ]]   # true if file exists AND is readable
[[ $x -gt 0 || $x -lt -10 ]]    # true if x > 0 OR x < -10
# In [ ], you'd need: [ -f "$file" -a -r "$file" ] (deprecated, error-prone)

# ── Integer comparison ──
# Both [[ ]] and [ ] support -eq, -ne, -lt, -le, -gt, -ge for integers
# But (( )) is better for arithmetic comparisons:
[[ $x -gt 5 ]]   # works
(( x > 5 ))      # cleaner, and supports arithmetic expressions: (( x > 5 && y < 10 ))
```
::

## File Test Operators (Complete Reference)

::code-wrapper{language="bash"}
```bash
# ── Existence and type ──
[[ -e $f ]]    # exists (any type: file, dir, symlink, socket, device)
[[ -f $f ]]    # exists AND is a regular file (follows symlinks)
[[ -d $f ]]    # exists AND is a directory
[[ -L $f ]]    # is a symbolic link (does NOT follow — tests the link itself)
[[ -S $f ]]    # is a socket
[[ -p $f ]]    # is a named pipe (FIFO)
[[ -b $f ]]    # is a block device
[[ -c $f ]]    # is a character device

# ── Permissions (tests the EFFECTIVE user's permissions) ──
[[ -r $f ]]    # readable
[[ -w $f ]]    # writable
[[ -x $f ]]    # executable / searchable (for dirs)
[[ -u $f ]]    # has setuid bit
[[ -g $f ]]    # has setgid bit
[[ -k $f ]]    # has sticky bit

# ── Content ──
[[ -s $f ]]    # exists AND size > 0 (not empty)

# ── Comparison ──
[[ $f1 -nt $f2 ]]  # f1 is NEWER than f2 (by mtime — or exists when f2 doesn't)
[[ $f1 -ot $f2 ]]  # f1 is OLDER than f2
[[ $f1 -ef $f2 ]]  # f1 and f2 are the SAME file (same inode — hard links or same path)

# ── Edge: -e follows symlinks, -L doesn't ──
ln -s /nonexistent broken_link
[[ -e broken_link ]]  # false — target doesn't exist
[[ -L broken_link ]]  # true  — the link itself exists
# To check if a symlink points to a valid target:
[[ -L $link && -e $link ]]  # is a symlink AND target exists
```
::

## Command Substitution: `$(...)` Internals

::code-wrapper{language="bash"}
```bash
# ── $(...) runs a command in a subshell, captures stdout, strips trailing newlines ──
date_output=$(date +%Y-%m-%d)   # "2024-01-15" — trailing newline stripped
multiline=$(echo -e "a\nb\nc")  # "a\nb\nc" — internal newlines preserved, trailing stripped

# ── Nested command substitution (backticks can't nest cleanly) ──
# ❌ LEGACY — backticks (hard to nest, hard to read)
files=`ls \`pwd\``
# ✅ MODERN — $(...) nests cleanly
files=$(ls $(pwd))
inner=$(echo "outer: $(echo "inner: $(date +%H:%M)")")  # "outer: inner: 14:30"

# ── Trailing newline stripping is significant ──
output=$(printf 'line1\nline2\n\n\n')  # trailing \n\n\n are ALL stripped → "line1\nline2"
# To preserve: add a sentinel and strip it:
output=$(printf 'line1\nline2\n\n\n'; printf 'X')  # "line1\nline2\n\n\nX"
output="${output%X}"  # "line1\nline2\n\n\n" — preserved!

# ── Command substitution runs in a subshell — variables don't leak ──
x=before
output=$(x=after; echo "$x")  # output is "after"
echo "$x"                      # before — the subshell's x=after didn't leak

# ── `set -e` is inherited by subshells in Bash 4.4+ (inherit_errexit) ──
set -e
# Without inherit_errexit: x=$(false); echo "reached"  → "reached" (false's failure is masked!)
# With inherit_errexit:   x=$(false); echo "reached"  → script exits (false propagates)
shopt -s inherit_errexit  # enable this (Bash 4.4+) — makes $(...) respect set -e
```
::

## Process Substitution: `<(...)` and `>(...)`

::code-wrapper{language="bash"}
```bash
# ── <(cmd) exposes cmd's output as a file descriptor (/dev/fd/63 or a named pipe) ──
# The cmd runs in a subshell; its stdout connects to a fd that looks like a file.

# ── Diff two command outputs without temp files ──
diff <(sort file1.txt) <(sort file2.txt)
# Equivalent without process substitution:
# sort file1.txt > /tmp/a; sort file2.txt > /tmp/b; diff /tmp/a /tmp/b; rm /tmp/a /tmp/b

# ── Feed a while loop without the subshell trap ──
# ❌ PIPE TRAP: while loop runs in a subshell — variables don't persist
echo "1 2 3" | while read -r num; do total=$((total + num)); done
echo "$total"  # empty — subshell variable lost

# ✅ PROCESS SUBSTITUTION: while loop runs in the MAIN shell
total=0
while read -r num; do
    total=$((total + num))
done < <(echo "1 2 3")
echo "$total"  # 6 — persists (no subshell for the while body)

# ── Compare files from different servers ──
diff <(ssh server1 cat /etc/hosts) <(ssh server2 cat /etc/hosts)

# ── >(...) writes to a command's stdin (less common) ──
# Tee output to both a file and a pipeline:
make 2> >(grep -i error >&2) > build.log
# stderr goes to grep (which sends matches to stderr), stdout goes to build.log

# ── Multiple process substitutions ──
paste <(cut -d, -f1 data.csv) <(cut -d, -f3 data.csv)  # side-by-side from different columns

# ── Edge: process substitution fds are ephemeral ──
# The /dev/fd/63 path is valid only during the command's execution.
# Storing it in a variable and using it later FAILS:
fd=$(<(echo hello))   # fd="/dev/fd/63" — but the fd is already closed!
cat "$fd"              # cat: /dev/fd/63: No such file or directory
```
::

## Brace Expansion: Code Generation Before Parsing

::code-wrapper{language="bash"}
```bash
# ── Brace expansion happens FIRST (before variable expansion, before globbing) ──
# It generates strings — no files need to exist (unlike globs).

echo {1..5}              # 1 2 3 4 5 — numeric range
echo {a..e}              # a b c d e — alpha range
echo {01..10}            # 01 02 03 ... 10 — zero-padded (Bash 4+)
echo {5..1}              # 5 4 3 2 1 — reverse range
echo {a..z..2}           # a c e g i k m o q s u w y — step 2 (Bash 4+)
echo {1..10..3}          # 1 4 7 10 — step 3 (Bash 4+)

# ── List expansion ──
echo {foo,bar,baz}       # foo bar baz
echo file{1..3}.txt      # file1.txt file2.txt file3.txt — prefix/suffix
mkdir -p project/{src,lib,test}/{bin,lib}  # creates project/src/bin, project/src/lib, ... (6 dirs)

# ── Brace expansion is NOT variable-aware (happens before variable expansion) ──
prefix="file"
echo {$prefix,backup}   # {file,backup} — brace expansion sees literal $prefix (not its value)
echo ${prefix}{.txt,.log}  # file.txt file.log — brace expansion on the SUFFIX works (prefix already expanded)

# ── Nested braces ──
echo a{b,c}d{e,f}       # abde abdf acde acdf — cartesian product
echo {{a,b},{c,d}}       # a b c d — nested lists flatten

# ── Brace expansion vs glob — critical distinction ──
echo *.txt               # GLOB: only if .txt files exist → "file1.txt file2.txt"; else "*.txt"
echo file{1..3}.txt      # BRACE: always → "file1.txt file2.txt file3.txt" (even if they don't exist)
# Glob depends on filesystem; brace expansion is pure string generation.
```
::

## Globbing: Filename Expansion Mechanics

::code-wrapper{language="bash"}
```bash
# ── Glob patterns ──
*          # matches any string (including empty)
?          # matches any single char
[abc]      # matches a, b, or c
[a-z]      # matches a through z (locale-dependent!)
[!abc]     # matches anything NOT a, b, c (POSIX) / [^abc] in some shells
**         # recursive (needs shopt -s globstar)

# ── Globbing happens AFTER word splitting and variable expansion ──
pattern="*.txt"
echo "$pattern"   # *.txt — quoted: no glob, literal string
echo $pattern     # file1.txt file2.txt — unquoted: glob expands (if matches exist)

# ── nullglob: empty result if no match (instead of literal pattern) ──
shopt -s nullglob
echo *.nonexistent   # (empty) — no match → empty, not "*.nonexistent"
shopt -u nullglob
echo *.nonexistent   # *.nonexistent — no match → literal string passed through

# ── failglob: error if no match (Bash 3+, strongest safety) ──
shopt -s failglob
echo *.nonexistent   # bash: no match: *.nonexistent — script aborts (catches typos!)
# Best for scripts: use failglob to catch glob typs early.

# ── globstar: recursive ** (Bash 4+) ──
shopt -s globstar
echo **/*.py         # all .py files in current dir and all subdirs (recursively)
# ⚠️ ** only matches recursively if it's a path component by itself:
echo **.py           # matches: dir.py (NOT recursive — ** is not a standalone component)
echo **/*.py         # matches: subdir/file.py (recursive — ** is a standalone component)

# ── extglob: extended pattern matching (Bash 2.02+, needs shopt) ──
shopt -s extglob
# ?(pattern)  — zero or one match
# *(pattern)  — zero or more
# +(pattern)  — one or more
# @(pattern)  — exactly one
# !(pattern)  — anything that doesn't match
echo !(*.txt)        # all files NOT ending in .txt
echo @(*.jpg|*.png)  # all .jpg or .png files
echo *(.bak|.tmp)    # all files ending in .bak or .tmp (zero or more — includes files with no extension)

# ── dotglob: include hidden files (dotfiles) in globs ──
shopt -s dotglob
echo *               # includes .hidden_file (default: * excludes dotfiles)
```
::

## Anti-Pattern: Locale-Dependent Range

::code-wrapper{language="bash"}
```bash
# ❌ NAIVE — [a-z] depends on locale (case-insensitive in some locales, includes accented chars)
for file in [a-z]*.txt; do   # In C locale: a-z. In en_US.UTF-8: might include A-Z!
    echo "$file"
done

# ✅ CORRECT — force C locale for deterministic byte-order sorting
LC_ALL=C
for file in [a-z]*.txt; do   # guaranteed a-z only
    echo "$file"
done

# ✅ BEST — use extglob for explicit control
shopt -s extglob
for file in @([a-z]*.txt); do   # @() is exact match, no locale ambiguity
    echo "$file"
done

# ── The "includes uppercase" trap ──
# In en_US.UTF-8 locale, [a-z] matches: aAbBcC...zZ (because collation is case-insensitive + accent-aware)
# In C locale, [a-z] matches: a b c ... z (ASCII byte order)
# Always use LC_ALL=C for glob ranges in scripts.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="bash"}
```bash
# ── Arithmetic with arrays: index arithmetic ──
arr=(10 20 30 40 50)
i=2
echo "${arr[i + 1]}"          # 40 — index is an arithmetic expression (no $ needed inside [])
echo "${arr[$((i + 1))]}"     # 40 — also works (explicit $((...)))

# ── Bitwise operations for flags ──
readonly READ=1   WRITE=2  EXEC=4
perms=0
((perms |= READ | WRITE))   # 3 — set read and write bits
((perms & READ)) && echo "readable"    # readable — check if bit is set
((perms & EXEC)) || echo "not exec"     # not exec — bit not set
((perms & ~READ))          # 2 — mask off read bit (doesn't modify perms)
((perms &= ~WRITE))         # clear write bit from perms → perms is now 1

# ── Random numbers ──
echo "$RANDOM"               # 0-32767 (pseudo-random, seeded from $$ and time)
echo "$((RANDOM % 100))"    # 0-99 — dice roll
echo "$((RANDOM % 6 + 1))"  # 1-6 — die
# For better randomness (crypto): read /dev/urandom
od -An -tu4 -N4 /dev/urandom | tr -d ' '  # 32-bit random integer

# ── Sequence generation without seq (Bash 4+) ──
echo {1..100}                # 1 2 3 ... 100 — no subprocess
# ❌ seq 1 100 — forks a subprocess
# ✅ {1..100} — in-process brace expansion

# ── Conditional assignment (ternary-like) ──
x=5
# Bash has no ternary, but you can use:
((x > 0 ? y = 1 : y = 0))    # y is 1 if x > 0, else 0 — works in ((...))
# Or: y=0; ((x > 0)) && y=1  — more readable
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="bash"}
```bash
# ── Integer division truncates toward ZERO, not floor ──
echo "$((-7 / 2))"    # -3 (truncates toward zero: -3.5 → -3)
echo "$((-7 % 2))"    # -1 (remainder has sign of dividend)
# For floor division of negatives: echo "$((-(7) / 2))" → -3 (same, but be aware)

# ── `((x = 0))` has exit status 1 (result is 0 = false) ──
set -e
x=1
((x = 0))    # ✗ script EXITS — the assignment evaluates to 0, exit status 1!
# Fix: ((x = 0)) || true  — or use: x=0 (plain assignment, no arithmetic context)

# ── `[[ =~ ]]` regex is reset by each match ──
[[ "abc" =~ a ]]; echo "${BASH_REMATCH[0]}"  # a
[[ "xyz" =~ x ]]; echo "${BASH_REMATCH[0]}"  # x — previous match "a" is gone
# Capture immediately after the match, don't reuse stale BASH_REMATCH.

# ── `[[ =~ ]]` regex doesn't support \d, \w, \s ──
# These are PCRE shortcuts. Bash uses ERE (extended regex), which doesn't have them.
[[ "123" =~ \d+ ]]     # ✗ false — \d is not ERE
[[ "123" =~ [0-9]+ ]]  # ✓ true — use character classes

# ── Glob in case patterns is not regex ──
case "$file" in
    *.txt) echo "text" ;;   # glob — matches anything ending in .txt
    *)     echo "other" ;;
esac
# case patterns are globs (*, ?, [...]), NOT regex. For regex, use [[ =~ ]].

# ── Process substitution is Bash-only ──
# <(...) doesn't work in POSIX sh. Use temp files for portable scripts.

# ── `[[ ]]` can't be used in POSIX sh ──
# [[ ]] is a Bash extension. Use [ ] with careful quoting for POSIX scripts.
```
::

## 🧠 Quick Quiz

What does this print?

::code-wrapper{language="bash"}
```bash
x=5
((x--))
echo "x=$x status=$?"
((x--))
echo "x=$x status=$?"
```
::

<details>
<summary>Answer</summary>

```
x=4 status=0
x=3 status=0
```

Wait — let's trace carefully:

1. `x=5`. `((x--))`: postfix decrement. The *expression* evaluates to the **old value** (5), then x is decremented to 4. Since the expression result is 5 (non-zero), exit status is 0. **x=4, status=0**.

2. `((x--))`: expression evaluates to old value (4, non-zero), x decremented to 3. Exit status 0. **x=3, status=0**.

But if x had been 1 before a `((x--))`: expression evaluates to 1 (old value, non-zero) → exit 0, x becomes 0. Then another `((x--))`: expression evaluates to 0 (old value) → exit **1** (result is zero = false). With `set -e`, the script would **exit** here.

**The lesson**: `((x--))` returns exit status based on the **expression value** (the old x), not the new x. When x decrements to 0, the *next* `((x--))` returns exit 1 because the old value is 0. This silently triggers `set -e`.

</details>