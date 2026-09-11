---
title: "Bash 10 — String Manipulation Internals: Parameter Expansion & Regex Engine"
description: "Deep-dive into Bash string mechanics: parameter expansion operators (substring, replace, delete, case), BASH_REMATCH capture groups, printf formatting, and zero-allocation string processing patterns. Code-first reference for senior engineers."
---

# 10 — String Manipulation Internals: Parameter Expansion & Regex Engine

## Parameter Expansion: The Complete Operator Table

::code-wrapper{language="bash"}
```bash
# ── The full parameter expansion arsenal (all in-process, no subprocess) ──

str="hello world"

# ── Length ──
echo "${#str}"            # 11 — string length

# ── Substring: ${var:offset:length} ──
echo "${str:0:5}"         # hello — offset 0, 5 chars
echo "${str:6}"           # world — offset 6 to end
echo "${str: -5}"         # world — last 5 (SPACE before - required!)
echo "${str:0-5}"         # world — alternative (0-5 is arithmetic offset, no space needed)
echo "${str:1:3}"         # ell — offset 1, 3 chars

# ── Replace: ${var/pattern/replacement} (glob pattern, NOT regex) ──
echo "${str/world/WORLD}"  # hello WORLD — first match only
echo "${str//l/L}"         # heLLo worLd — ALL matches (//)
echo "${str/#hello/HELLO}" # HELLO world — match at START only (#)
echo "${str/%world/WORLD}" # hello WORLD — match at END only (%)
echo "${str//[^l]/_}"     # _____l___l_ — replace non-l with _ ([^l] is glob "not l")

# ── Delete (trim prefix/suffix): ${var#pattern} (shortest) / ${var##pattern} (longest) ──
path="/usr/local/bin/bash"
echo "${path#*/}"         # usr/local/bin/bash — remove SHORTEST prefix */
echo "${path##*/}"        # bash — remove LONGEST prefix */ (basename)
echo "${path%/*}"         # /usr/local/bin — remove SHORTEST suffix /* (dirname)
echo "${path%%/*}"        # (empty) — remove LONGEST suffix /* (removes everything starting with /)

# ── Case conversion (Bash 4+) ──
str="Hello World"
echo "${str^}"            # Hello World — first char uppercase (already is)
echo "${str^^}"           # HELLO WORLD — all uppercase
echo "${str,}"            # hello World — first char lowercase
echo "${str,,}"           # hello world — all lowercase
echo "${str~~}"           # hELLO wORLD — toggle each char
echo "${str^^[aeiou]}"   # hEllO wOrld — uppercase only vowels
echo "${str,,[^aeiou ]}"  # hEllO wOrld — lowercase only non-vowels (and non-spaces)

# ── Default values ──
unset var
echo "${var:-default}"    # default — if unset or empty (does NOT assign)
echo "${var-default}"     # default — if unset only (empty passes through)
echo "${var:=default}"   # default — if unset/empty AND assigns to var
echo "${var:?msg}"        # error: msg — if unset/empty, print msg and EXIT
echo "${var:+set}"        # set — if non-empty, else empty
```
::

## Path Manipulation: Parameter Expansion vs External Commands

::code-wrapper{language="bash"}
```bash
path="/usr/local/bin/bash.tar.gz"

# ── Basename (filename) ──
# ❌ SLOW: forks basename subprocess
basename "$path"              # bash.tar.gz
# ✅ FAST: parameter expansion (in-process)
echo "${path##*/}"            # bash.tar.gz

# ── Dirname (directory) ──
# ❌ SLOW: forks dirname subprocess
dirname "$path"               # /usr/local/bin
# ✅ FAST: parameter expansion
echo "${path%/*}"             # /usr/local/bin

# ── Extension extraction ──
echo "${path##*.}"            # gz — last extension (longest prefix up to .)
echo "${path#*.}"             # tar.gz — first extension onward (shortest prefix up to .)

# ── Remove extension ──
echo "${path%.*}"             # /usr/local/bin/bash.tar — remove LAST extension (shortest suffix from .)
echo "${path%%.*}"            # /usr/local/bin/bash — remove ALL extensions (longest suffix from .)

# ── Replace extension ──
echo "${path%.gz}.bz2"        # /usr/local/bin/bash.tar.bz2 — replace .gz with .bz2

# ── Filename without any extension ──
base="${path##*/}"            # bash.tar.gz
echo "${base%%.*}"            # bash — filename without any extension

# ── The # vs ## (shortest vs longest) distinction ──
file="archive.tar.gz"
echo "${file#*.}"             # tar.gz — shortest prefix up to first .
echo "${file##*.}"            # gz — longest prefix up to last .

# ── The % vs %% (shortest vs longest) distinction ──
echo "${file%.*}"             # archive.tar — shortest suffix from last .
echo "${file%%.*}"            # archive — longest suffix from first .
```
::

## Anti-Pattern: Using `sed` for Simple String Ops

::code-wrapper{language="bash"}
```bash
# ❌ SLOW — forks sed subprocess for simple replacement
result=$(echo "$str" | sed 's/old/new/g')

# ✅ FAST — parameter expansion (in-process, no subprocess)
result="${str//old/new}"

# Benchmark (100,000 iterations):
#   sed:   ~12s (100k subprocess forks)
#   ${//}: ~0.3s (in-process) — 40x faster

# ── More examples ──
# ❌ echo "$str" | sed 's/^/prefix: /'
# ✅ str="prefix: $str"

# ❌ echo "$str" | sed 's/  */ /g'  (collapse spaces)
# ✅ str="${str//  / }"  (but this only replaces double spaces once — for full collapse, use a loop or tr)

# ❌ echo "$str" | tr 'a-z' 'A-Z'
# ✅ str="${str^^}"  (Bash 4+)

# ❌ echo "$str" | sed 's/^\([0-9]*\).*/\1/'  (extract leading digits)
# ✅ [[ $str =~ ^([0-9]*) ]]; echo "${BASH_REMATCH[1]}"  (regex + capture)

# When to still use sed: complex regex, multi-line, in-place file editing
# When to use parameter expansion: simple replace, trim, case, substring (single string)
```
::

## Regex Matching: `[[ =~ ]]` and `BASH_REMATCH`

::code-wrapper{language="bash"}
```bash
# ── [[ $str =~ regex ]] — extended regex (ERE), NOT PCRE ──
# ERE: . * + ? ^ $ [] [^] () {} | (no \d, \w, \s — use character classes)

str="user@example.com"
re='^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

if [[ $str =~ $re ]]; then
    echo "valid email"
fi
# ⚠️ Store regex in a variable and reference it unquoted:
#   re='...'; [[ $str =~ $re ]]
# If you inline: [[ $str =~ ^[a-z]+$ ]] — works but hard to read
# If you quote: [[ $str =~ "$re" ]] — becomes a LITERAL string match (not regex!)

# ── Capture groups: BASH_REMATCH array ──
date="2024-01-15"
if [[ $date =~ ^([0-9]{4})-([0-9]{2})-([0-9]{2})$ ]]; then
    echo "year:  ${BASH_REMATCH[0]}"   # 2024-01-15 — full match (group 0)
    echo "year:  ${BASH_REMATCH[1]}"   # 2024 — first capture group
    echo "month: ${BASH_REMATCH[2]}"   # 01 — second capture group
    echo "day:   ${BASH_REMATCH[3]}"   # 15 — third capture group
fi

# ── ⚠️ BASH_REMATCH is overwritten by each [[ =~ ]] ──
# Capture immediately after the match:
if [[ $line =~ ^([0-9]+)\s+(.*)$ ]]; then
    num="${BASH_REMATCH[1]}"    # capture NOW — don't reuse after another =~
    text="${BASH_REMATCH[2]}"
fi

# ── Regex features available (ERE) ──
[[ "abc" =~ a.c ]]          # true — . matches any char
[[ "aaab" =~ a+b ]]         # true — + one or more
[[ "ab" =~ a?b ]]           # true — ? zero or one
[[ "abc" =~ ^a ]]           # true — ^ start anchor
[[ "abc" =~ c$ ]]           # true — $ end anchor
[[ "abc" =~ [a-z]+ ]]       # true — character class
[[ "abc" =~ [^0-9]+ ]]     # true — negated class
[[ "abc" =~ (a|b) ]]       # true — alternation with grouping
[[ "aaa" =~ a{3} ]]        # true — exact count
[[ "aaa" =~ a{2,4} ]]     # true — range count
[[ "aaa" =~ a{2,} ]]      # true — minimum count

# ── Regex features NOT available (use grep -P or awk for these) ──
[[ "123" =~ \d+ ]]         # false — \d is PCRE, not ERE (use [0-9])
[[ "abc" =~ \w+ ]]         # false — \w is PCRE (use [a-zA-Z0-9_])
[[ "  a" =~ \s+a ]]        # false — \s is PCRE (use [[:space:]] or [ \t])
[[ "abc" =~ (?=a) ]]       # false — lookaheads are PCRE only
[[ "abc" =~ (?:a) ]]       # false — non-capturing groups are PCRE only

# ── POSIX character classes (work in ERE) ──
[[ "123" =~ [[:digit:]]+ ]]    # true — digits
[[ "abc" =~ [[:alpha:]]+ ]]    # true — letters
[[ "a b" =~ [[:space:]] ]]     # true — whitespace
[[ "a1!" =~ [[:punct:]] ]]    # true — punctuation
[[ "abc" =~ [[:alnum:]]+ ]]   # true — alphanumeric
[[ "x" =~ [[:upper:]] ]]      # false — uppercase only
[[ "X" =~ [[:upper:]] ]]      # true
```
::

## Production Pattern: URL Parser

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
# ── Parse a URL into components using regex ──

parse_url() {
    local url=$1
    local -n _result=$2

    # RFC 3986 simplified: scheme://[user[:pass]@]host[:port]/path[?query][#fragment]
    local re='^([a-zA-Z][a-zA-Z0-9+.-]*)://'   # scheme
    re+='([^@:/]+(:[^@/:]+)?@)?'               # userinfo (optional)
    re+='([^:/?#]+)'                            # host
    re+='(:([0-9]+))?'                          # port (optional)
    re+='(/[^?#]*)?'                            # path (optional)
    re+='(\?([^#]*))?'                          # query (optional)
    re+='(#(.*))?'                             # fragment (optional)
    re+='$'

    if [[ $url =~ $re ]]; then
        _result[scheme]="${BASH_REMATCH[1]}"
        _result[userinfo]="${BASH_REMATCH[3]:-}"
        _result[host]="${BASH_REMATCH[6]}"
        _result[port]="${BASH_REMATCH[8]:-}"
        _result[path]="${BASH_REMATCH[9]:-/}"
        _result[query]="${BASH_REMATCH[11]:-}"
        _result[fragment]="${BASH_REMATCH[13]:-}"
        return 0
    else
        return 1
    fi
}

# ── Usage ──
declare -A parts
parse_url "https://user:pass@example.com:8080/api/v1?foo=bar#section" parts

for key in scheme host port path query fragment; do
    printf '%-10s %s\n' "$key" "${parts[$key]}"
done
# scheme     https
# host       example.com
# port       8080
# path       /api/v1
# query      foo=bar
# fragment   section
```
::

## `printf`: Formatting Engine

::code-wrapper{language="bash"}
```bash
# ── printf is C's printf — format specifiers ──
printf '%s\n' "hello"               # hello (string + newline)
printf '%s is %d\n' "Alice" 30      # Alice is 30 (string + integer)
printf '%-20s %5d\n' "left" 42      # "left                42" (left-align 20, right-align 5)
printf '%.2f\n' 3.14159             # 3.14 (2 decimal places)
printf '%x\n' 255                    # ff (hexadecimal)
printf '%o\n' 8                     # 10 (octal)
printf '%05d\n' 42                  # 00042 (zero-pad to 5)
printf '%5d\n' 42                   #    42 (space-pad to 5)
printf '%-5d|\n' 42                 # 42   | (left-align)
printf '%b\n' 'tab\there'            # tab    here (interpret backslash escapes)
printf '%q\n' 'hello world'          # hello\ world (shell-quoted — safe for re-eval)

# ── printf -v: write to a variable (NO subprocess!) ──
printf -v padded '%05d' 42           # padded="00042" — no $(printf ...) fork
printf -v json '{"name":"%s","age":%d}' "Alice" 30  # json='{"name":"Alice","age":30}'
printf -v header 'Host: %s\r\nUser-Agent: %s\r\n' "example.com" "myapp/1.0"
# header="Host: example.com\r\nUser-Agent: myapp/1.0\r\n"

# ── printf reuses the format string for extra args ──
printf '%s\n' a b c                  # a\n b\n c\n (format reused for each arg)
# This is how you print each element of an array on its own line:
arr=("one" "two" "three")
printf '%s\n' "${arr[@]}"            # one\ntwo\nthree\n

# ── printf doesn't add a trailing newline by default ──
printf '%s' "no newline"             # no newline (no \n — same line)
printf '%s\n' "with newline"         # with newline\n

# ── ⚠️ printf with a format string containing % in the data ──
# ❌ Dangerous: if the data contains %, printf interprets it as a format specifier
printf "$user_input"     # if user_input is "%s %s" — reads from args/stack!
# ✅ Safe: always use a format string
printf '%s' "$user_input"  # data is the ARG, format is '%s' — safe
```
::

## String Comparison Semantics

::code-wrapper{language="bash"}
```bash
# ── String comparison in [[ ]] is LEXICOGRAPHIC (dictionary order) ──
[[ "abc" == "abc" ]]     # true — exact equality
[[ "abc" != "abd" ]]     # true — inequality
[[ "abc" < "abd" ]]      # true — lexicographic (a=a, b=b, c<d)
[[ "10" < "9" ]]         # true — STRING comparison: "1" < "9" (char-by-char)
[[ "10" -lt "9" ]]       # ERROR — -lt is for integers, use ((...)) instead
(( 10 < 9 ))             # false — numeric comparison
(( 10 > 9 ))             # true — numeric

# ── ⚠️ "10" < "9" is TRUE in string comparison ──
# String comparison compares character by character: "1" (0x31) vs "9" (0x39)
# "1" < "9" in ASCII, so "10" < "9" is true (the first char decides).
# For numeric comparison, always use (( )).

# ── Glob pattern matching (RIGHT side of ==/!=) ──
file="report_2024.txt"
[[ $file == *.txt ]]         # true — right side is a glob pattern
[[ $file == report_* ]]     # true — prefix glob
[[ $file != *.log ]]        # true — negated glob
# ⚠️ Only the RIGHT side of ==/!= is treated as a glob. Left side is literal.
# Quoting the right side makes it a literal:
[[ $file == "*.txt" ]]       # false — literal comparison (file is not literally "*.txt")

# ── Empty string checks ──
[[ -z "" ]]       # true — zero length
[[ -n "x" ]]      # true — non-zero length
[[ -z "$var" ]]   # true if var is empty or unset
[[ -n "$var" ]]   # true if var is non-empty

# ── Case statement for pattern matching ──
case "$file" in
    *.jpg|*.png|*.gif) echo "image" ;;
    *.txt|*.md)        echo "text" ;;
    *)                 echo "other" ;;
esac
# Case patterns are GLOBS, not regex.
```
::

## Whitespace Trimming

::code-wrapper{language="bash"}
```bash
# ── Trim leading whitespace ──
str="  hello  "
# Method 1: extglob (Bash 3+ with shopt -s extglob)
shopt -s extglob
trimmed="${str##+([[:space:]])}"    # remove longest leading whitespace
trimmed="${trimmed%%+([[:space:]])}" # remove longest trailing whitespace
echo "[$trimmed]"   # [hello]

# Method 2: without extglob (complex nested expansion)
trimmed="${str#"${str%%[![:space:]]*}"}"   # remove leading whitespace
trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"  # remove trailing whitespace
echo "[$trimmed]"   # [hello]
# How it works:
# ${str%%[![:space:]]*} — remove longest suffix starting with a non-space → "  " (leading spaces)
# ${str#...} — remove that leading part → "hello  "
# ${trimmed##*[![:space:]]} — remove longest prefix ending with non-space → "  " (trailing spaces)
# ${trimmed%...} — remove that trailing part → "hello"

# Method 3: read (simple but only for single-line)
read -r trimmed <<< "  hello  "
echo "[$trimmed]"   # [hello] — read trims leading/trailing whitespace (IFS=default)

# ── Collapse multiple spaces to single ──
str="hello    world"
# Without extglob: loop or tr
collapsed=$(echo "$str" | tr -s ' ')   # hello world (tr subprocess)
# With extglob:
shopt -s extglob
collapsed="${str//+([[:space:]])/ }"    # hello world (in-process)
```
::

## 💡 Tips & Tricks

::code-wrapper{language="bash"}
```bash
# ── Split a version string into components ──
version="1.2.3-beta"
IFS='.-' read -r major minor patch pre <<< "$version"
echo "$major.$minor.$patch ($pre)"   # 1.2.3 (beta)

# ── Compare version strings ──
ver_lt() {
    local a=$1 b=$2
    local a1 a2 a3 b1 b2 b3
    IFS='.' read -r a1 a2 a3 <<< "$a"
    IFS='.' read -r b1 b2 b3 <<< "$b"
    # Pad with zeros for numeric comparison
    printf -v a_padded '%03d%03d%03d' "${a1:-0}" "${a2:-0}" "${a3:-0}"
    printf -v b_padded '%03d%03d%03d' "${b1:-0}" "${b2:-0}" "${b3:-0}"
    (( a_padded < b_padded ))
}
ver_lt "1.2.3" "1.10.0" && echo "1.2.3 < 1.10.0"  # true — numeric, not string

# ── Generate a random hex string ──
random_hex=$(printf '%x' $RANDOM)   # e.g. "1a2b" (4 hex chars)
# For longer: printf '%x' $RANDOM$RANDOM  (but leading zeros may be stripped)
# Better: head -c8 /dev/urandom | xxd -p

# ── Center a string in a field ──
center() {
    local str=$1 width=$2
    local len=${#str}
    local pad=$(( (width - len) / 2 ))
    printf '%*s%s%*s' "$pad" "" "$str" "$pad" ""
}
center "hello" 20   # "        hello        "

# ── Reverse a string ──
reverse() {
    local str=$1
    local len=${#str}
    local i result=""
    for ((i = len - 1; i >= 0; i--)); do
        result+="${str:i:1}"
    done
    printf '%s' "$result"
}
reverse "hello"   # olleh

# ── Title case ──
title_case() {
    local str=$1
    local word
    local result=""
    for word in $str; do
        result+="${word^} "  # ^ capitalizes first char (Bash 4+)
    done
    printf '%s' "${result% }"  # strip trailing space
}
title_case "hello world"   # Hello World
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="bash"}
```bash
# ── `${str: -5}` needs a SPACE before - (else it's :- default expansion) ──
str="hello"
echo "${str: -3}"   # llo — slice: last 3 chars (space before -)
echo "${str:-3}"    # hello — default expansion: if str is unset/empty, use "3"
# (Since str is "hello" (non-empty), ${str:-3} returns str's value, not "3")
# But if str were empty: echo "${str:-3}" → "3" (default), not a slice!

# ── `${var/pattern/repl}` patterns are GLOBS, not regex ──
echo "${str//[0-9]/N}"   # replace digits with N (glob [0-9])
# Cannot use regex like \d+ — use [[ =~ ]] for regex.

# ── `[[ =~ ]]` regex must NOT be quoted ──
[[ "123" =~ "^[0-9]+$" ]]   # false — quoted regex is a LITERAL string match
[[ "123" =~ ^[0-9]+$ ]]     # true — unquoted regex (but hard to read inline)
re='^[0-9]+$'
[[ "123" =~ $re ]]          # true — variable reference (BEST: readable + correct)

# ── `BASH_REMATCH` is global and overwritten by each =~ ──
[[ "abc" =~ (a) ]]; echo "${BASH_REMATCH[1]}"  # a
[[ "xyz" =~ (x) ]]; echo "${BASH_REMATCH[1]}"  # x — previous "a" is GONE
# Capture immediately after each match.

# ── `printf '%s' "$var"` is safe; `printf "$var"` is dangerous ──
# If $var contains %s, %d, etc., printf interprets them as format specifiers.
# Always use a format string: printf '%s' "$var"  (or printf '%s\n' "$var")

# ── Case conversion is Bash 4+ only ──
echo "${str^^}"   # Bash 4+: HELLO. Bash 3.2 (macOS): "bash: ${str^^}: bad substitution"
# Portable fallback: echo "$str" | tr 'a-z' 'A-Z' (but that forks a subprocess)

# ── `[[ "10" < "9" ]]` is TRUE (string comparison) ──
# Always use (( )) for numeric comparison: (( 10 < 9 ))  → false
```
::

## 🧠 Quick Quiz

What does this print?

::code-wrapper{language="bash"}
```bash
file="archive.tar.gz"
echo "${file%%.*}"
echo "${file%.*}"
echo "${file##*.}"
echo "${file#*.}"
```
::

<details>
<summary>Answer</summary>

```
archive          ← ${file%%.*}: removes LONGEST suffix from first . (removes ".tar.gz")
archive.tar      ← ${file%.*}: removes SHORTEST suffix from last . (removes ".gz")
gz               ← ${file##*.}: removes LONGEST prefix up to last . (leaves "gz")
tar.gz           ← ${file#*.}: removes SHORTEST prefix up to first . (leaves "tar.gz")
```

**The key insight**:

| Operator | Scope | Direction | Removes |
|---|---|---|---|
| `#` (shortest) | prefix | left-to-right | up to FIRST `.` |
| `##` (longest) | prefix | left-to-right | up to LAST `.` |
| `%` (shortest) | suffix | right-to-left | from LAST `.` |
| `%%` (longest) | suffix | right-to-left | from FIRST `.` |

</details>