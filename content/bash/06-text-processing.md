---
title: "Bash 06 — Text Processing Pipelines: grep, sed, awk & Log Analysis Internals"
description: "Deep-dive into production text processing: grep regex internals (BRE vs ERE vs PCRE), sed stream editing with in-place pitfalls, awk as a mini programming language, and pipeline composition for log analysis. Code-first reference with real-world patterns."
---

# 06 — Text Processing Pipelines: grep, sed, awk & Log Analysis Internals

## `grep`: Regex Engine Internals

::code-wrapper{language="bash"}
```bash
# ── grep has THREE regex modes ──
# grep      (BRE — Basic Regex):     . * [..] ^ $ — + ? | () need backslash escaping
# grep -E   (ERE — Extended Regex):  . * + ? | () {n,m} — unescaped (use this)
# grep -P   (PCRE — Perl Regex):     \d \w \s \b lookaheads (GNU grep only, NOT on macOS BSD grep)

# ── BRE (default) — need to escape +, ?, |, () ──
grep "error\|warning" log.txt       # BRE: \| means alternation (ugly)
grep "foo\+" log.txt               # BRE: \+ means one or more

# ── ERE (preferred) — unescaped +, ?, |, () ──
grep -E "error|warning" log.txt      # ERE: clean alternation
grep -E "foo+" log.txt              # ERE: one or more 'o'
grep -E "(error|warning|critical)" log.txt  # ERE: grouping

# ── PCRE (GNU only) — \d, \w, \s, lookaheads ──
grep -P "\d{4}-\d{2}-\d{2}" log.txt  # PCRE: \d (GNU Linux, not macOS BSD)
# macOS fallback: use [0-9] with -E:
grep -E "[0-9]{4}-[0-9]{2}-[0-9]{2}" log.txt

# ── Flags that matter ──
grep -i "error" log.txt             # case-insensitive
grep -v "debug" log.txt             # INVERT: lines NOT matching
grep -n "error" log.txt             # line numbers
grep -c "error" log.txt             # count of matching lines
grep -r "error" .                   # recursive (search all files in dir)
grep -rl "error" .                  # -l: print FILENAMES only (files containing match)
grep -w "error" log.txt             # whole word only (won't match "errors")
grep -x "error" log.txt             # whole LINE match (line is exactly "error")
grep -A 3 "error" log.txt           # 3 lines After match
grep -B 3 "error" log.txt           # 3 lines Before
grep -C 3 "error" log.txt           # 3 lines Context (both before and after)
grep -q "error" log.txt             # quiet — exit status only (for if conditions)
grep -o "error" log.txt             # only output the MATCHING part (not whole line)
grep -oE "[0-9.]+" log.txt          # extract all numbers (only matching parts)
grep -m 5 "error" log.txt           # stop after 5 matches
grep -f patterns.txt log.txt        # read patterns from file (one per line)
grep -e "error" -e "warning" log.txt # multiple patterns
grep --include="*.log" -r "error" . # recursive, only .log files
grep --exclude="*.tmp" -r "error" . # recursive, exclude .tmp files
grep --exclude-dir=node_modules -r "error" .  # exclude directories
```
::

## Anti-Pattern: `grep` Without `set -e` Awareness

::code-wrapper{language="bash"}
```bash
set -e

# ❌ NAIVE — grep returns 1 if no match, kills the script!
grep "error" log.txt
echo "reached"  # NOT reached if no match (grep exits 1, set -e kills script)

# ✅ CORRECT — explicit "no match is OK"
grep "error" log.txt || true    # || true: make it always succeed
if grep -q "error" log.txt; then  # test form: no set -e issue
    echo "found"
fi
grep -q "error" log.txt && echo "found"  # short-circuit: no set -e issue

# ── grep exit codes ──
# 0: at least one match
# 1: no match (NOT an error!)
# 2: error (file not found, bad regex, etc.)
# Distinguish: grep ... || { [[ $? -eq 2 ]] && die "grep error"; }
```
::

## `sed`: Stream Editor Internals

::code-wrapper{language="bash"}
```bash
# ── sed operates line-by-line: read line → apply commands → output line ──

# ── Substitution (s) ──
sed 's/old/new/' file.txt       # replace FIRST occurrence per line
sed 's/old/new/g' file.txt      # replace ALL occurrences (global)
sed 's/old/new/2' file.txt      # replace 2nd occurrence per line
sed 's/old/new/gi' file.txt     # global + case-insensitive
sed 's/old/new/3g' file.txt     # 3rd and all subsequent occurrences
sed 's/^/prefix /' file.txt     # add prefix to every line
sed 's/$/ suffix/' file.txt     # add suffix to every line
sed 's/  */ /g' file.txt       # collapse multiple spaces to single space

# ── Multiple commands: -e ──
sed -e 's/foo/bar/g' -e 's/baz/qux/g' file.txt   # apply both substitutions
sed 's/foo/bar/g; s/baz/qux/g' file.txt          # same with semicolons

# ── Address ranges ──
sed -n '5,10p' file.txt         # print lines 5-10 (-n suppresses default output)
sed -n '5p' file.txt           # print only line 5
sed -n '/pattern/,/pattern2/p' file.txt  # print from first match to second match
sed -n '/error/,$p' file.txt   # print from first "error" to end of file

# ── Delete (d) ──
sed '/pattern/d' file.txt       # delete lines matching pattern
sed '5d' file.txt              # delete line 5
sed '5,10d' file.txt           # delete lines 5-10
sed '/^$/d' file.txt           # delete blank lines
sed '/^[[:space:]]*$/d' file.txt  # delete blank lines (including whitespace-only)

# ── Alternative delimiters (critical for paths) ──
# ❌ HARD TO READ — escaping slashes
sed 's/\/old\/path/\/new\/path/g' file.txt
# ✅ USE DIFFERENT DELIMITER
sed 's|/old/path|/new/path|g' file.txt    # | delimiter
sed 's#/old/path#/new/path#g' file.txt    # # delimiter
sed 's:/old/path:/new/path:g' file.txt    # : delimiter
# sed accepts ANY character as the delimiter (not just /)
```
::

## Anti-Pattern: `sed -i` Cross-Platform Breakage

::code-wrapper{language="bash"}
```bash
# ── GNU sed (Linux) vs BSD sed (macOS) have DIFFERENT -i syntax ──

# GNU sed:  sed -i 's/old/new/g' file.txt        ← no extension needed
# BSD sed:  sed -i '' 's/old/new/g' file.txt     ← requires '' (empty extension)

# ❌ NAIVE — works on Linux, fails on macOS
sed -i 's/old/new/g' file.txt
# macOS: "sed: 1: \"file.txt\": invalid command code j" (treats 's' as backup extension!)

# ✅ PORTABLE — create backup, then remove it
sed -i.bak 's/old/new/g' file.txt && rm -f file.txt.bak
# Works on BOTH GNU and BSD sed (creates .bak, then we delete it).

# ✅ PORTABLE (alternative) — use a variable for the extension
if sed --version 2>/dev/null | grep -q GNU; then
    SED_INPLACE=(-i)
else
    SED_INPLACE=(-i '')
fi
sed "${SED_INPLACE[@]}" 's/old/new/g' file.txt

# ✅ BEST — avoid sed -i entirely; use a temp file or sponge
sed 's/old/new/g' file.txt > file.txt.tmp && mv file.txt.tmp file.txt
# Or: install `moreutils` and use `sponge`:
sed 's/old/new/g' file.txt | sponge file.txt  # sponge holds output, writes atomically
```
::

## `awk`: The Mini Programming Language

::code-wrapper{language="bash"}
```bash
# ── awk structure: BEGIN { } pattern { action } END { } ──
# BEGIN: runs once before any input
# pattern { action }: for each line, if pattern matches, run action
# END: runs once after all input

# ── Field access ──
awk '{print $1}' file.txt              # first field (whitespace-delimited)
awk '{print $1, $3}' file.txt          # fields 1 and 3
awk '{print $0}' file.txt              # whole line
awk '{print $NF}' file.txt             # last field
awk '{print $(NF-1)}' file.txt         # second-to-last field
awk '{print NR, $0}' file.txt          # NR = line number, prefix each line
awk '{print FNR, $0}' file1 file2      # FNR = line number PER FILE (resets for file2)
awk '{print NF}' file.txt              # NF = number of fields in current line

# ── Field separator ──
awk -F',' '{print $1}' file.csv        # comma-delimited
awk -F'\t' '{print $1}' file.tsv       # tab-delimited
awk -F'|' '{print $1, $3}' file.txt    # pipe-delimited
awk -F'[ ,]+' '{print $1}' file.txt    # regex: one or more spaces or commas
awk 'BEGIN{FS=","} {print $1}' file.csv  # same as -F,', but can set in BEGIN
awk 'BEGIN{FS=","; OFS=" | "} {print $1, $2}' file.csv  # OFS = output field separator

# ── Conditions (pattern matching) ──
awk '$3 > 100' file.txt                # print lines where field 3 > 100 (default action: print)
awk 'NR >= 5 && NR <= 10' file.txt     # print lines 5-10
awk 'NR > 1' file.txt                  # skip header (first line)
awk '/error/' file.txt                 # print lines matching "error" (like grep)
awk '!/debug/' file.txt                # print lines NOT matching "debug" (like grep -v)
awk '$1 == "GET"' access.log           # lines where field 1 is exactly "GET"
awk '$9 >= 400 && $9 < 500' access.log # lines where field 9 (HTTP status) is 4xx

# ── Accumulation (sum, count, average) ──
awk '{sum += $1} END {print sum}' nums.txt     # sum of first column
awk '{sum += $1; count++} END {print sum/count}' nums.txt  # average
awk '{count[$1]++} END {for (k in count) print k, count[k]}' file.txt  # frequency count by field 1
awk '{sum[$1] += $2} END {for (k in sum) print k, sum[k]}' file.txt   # group sum

# ── String functions ──
awk '{print length($0)}' file.txt           # length of each line
awk '{print tolower($1)}' file.txt          # lowercase field 1
awk '{print toupper($1)}' file.txt           # uppercase field 1
awk '{print substr($1, 1, 3)}' file.txt     # first 3 chars of field 1
awk '{print split($0, arr, ",")}' file.txt  # split line on comma, return count
awk '{gsub(/[0-9]+/, "N", $0); print}' file.txt  # replace all numbers with "N"
awk '{print index($0, "error")}' file.txt   # position of "error" in line (0 if not found)
awk '{printf "%-20s %5d\n", $1, $2}' file.txt  # formatted output (like C printf)
```
::

## Production Pattern: Log Analysis Pipeline

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
# ── Access log analyzer: top IPs, URLs, status codes, busiest hour ──

log="${1:-access.log}"    # default to access.log

# ── Top 10 IPs by request count ──
# $1 = client IP; sort | uniq -c | sort -rn | head = frequency-sorted
awk '{print $1}' "$log" | sort | uniq -c | sort -rn | head -10

# ── Top 10 requested URLs ──
# $7 = request path (field 7 in Common Log Format: "GET /path HTTP/1.1")
awk '{print $7}' "$log" | sort | uniq -c | sort -rn | head -10

# ── HTTP status code distribution ──
awk '{print $9}' "$log" | sort | uniq -c | sort -rn

# ── Busiest hour (hour with most requests) ──
# $4 = timestamp "[10/Jan/2024:14:32:01" → cut -d: -f2 = "14"
awk '{print $4}' "$log" | cut -d: -f2 | sort | uniq -c | sort -rn | head -1

# ── 4xx/5xx errors by IP ──
awk '$9 >= 400 {print $1, $9}' "$log" | sort | uniq -c | sort -rn | head -20

# ── Bandwidth by IP (sum of $10 = bytes sent) ──
awk '{bandwidth[$1] += $10} END {for (ip in bandwidth) printf "%s %d\n", ip, bandwidth[ip]}' "$log" | sort -k2 -rn | head -10

# ── Requests per second (find traffic spikes) ──
# $4 = timestamp, extract to second precision: "10/Jan/2024:14:32:01"
awk '{print $4}' "$log" | cut -d: -f1-4 | sort | uniq -c | sort -rn | head -5
```
::

## `sort` and `uniq`: Frequency Analysis

::code-wrapper{language="bash"}
```bash
# ── sort flags ──
sort file.txt               # alphabetical (locale-dependent!)
sort -r file.txt            # reverse
sort -n file.txt            # numeric (2 > 10 — correct)
sort -rn file.txt           # numeric reverse (highest first)
sort -u file.txt            # unique (sort + dedup in one)
sort -k2 file.txt           # by 2nd field
sort -k2n file.txt          # by 2nd field, numeric
sort -k2 -k3n file.txt      # by 2nd field (alpha), then 3rd field (numeric) — composite
sort -t',' -k2n file.csv   # by 2nd field, numeric, comma-delimited
sort -h file.txt            # human-numeric (2K, 1M, 1G — sorts sizes)
sort -V file.txt            # version sort (1.2.3 < 1.2.10 — natural ordering)
sort -f file.txt            # fold case (case-insensitive)
sort -R file.txt            # random shuffle
sort -s -k2 file.txt        # stable sort (preserve order of equal-key lines)
sort -S 50% file.txt        # use 50% of RAM for sorting (large files)
sort --parallel=4 file.txt  # use 4 threads (GNU sort)

# ── ⚠️ LC_ALL=C for deterministic sorting ──
# Locale affects sort order: en_US.UTF-8 may sort case-insensitively or accent-awarely
sort file.txt               # locale-dependent: might be case-insensitive
LC_ALL=C sort file.txt     # C locale: ASCII byte order — deterministic, fast, portable
# Always use LC_ALL=C for sort in scripts (deterministic output).

# ── uniq ──
sort file.txt | uniq        # remove adjacent duplicates (MUST sort first!)
sort file.txt | uniq -c    # count occurrences (prefix with count)
sort file.txt | uniq -d    # print only DUPLICATE lines (appears more than once)
sort file.txt | uniq -u    # print only UNIQUE lines (appears exactly once)
sort file.txt | uniq -i    # case-insensitive comparison
sort file.txt | uniq -w5   # compare only first 5 chars
sort file.txt | uniq -f2   # skip first 2 fields, compare the rest
```
::

## Anti-Pattern: `uniq` Without `sort`

::code-wrapper{language="bash"}
```bash
# ❌ NAIVE — uniq only removes ADJACENT duplicates
uniq file.txt > deduped.txt   # non-adjacent duplicates remain!

# ✅ CORRECT — sort first (groups duplicates adjacently)
sort file.txt | uniq > deduped.txt
# Or: sort -u file.txt > deduped.txt (sort + dedup in one)

# ── Order-preserving dedup (keep first occurrence order) ──
awk '!seen[$0]++' file.txt
# Mechanism:
#   $0 = current line (the whole line)
#   seen[$0]++ = increment count for this line; returns OLD value (0 if first time, 1+ if seen before)
#   !seen[$0]++ = negation: true if first time (old value 0), false if seen before
#   awk default action for true pattern: print the line
# Result: prints each line only the first time it's seen, preserving original order.

# ── Case-insensitive order-preserving dedup ──
awk '!seen[tolower($0)]++' file.txt
```
::

## `tr`: Character-Level Translation

::code-wrapper{language="bash"}
```bash
# ── tr translates/deletes/squeezes CHARACTERS (not strings, not patterns) ──

# ── Translate (map chars) ──
echo "hello" | tr 'a-z' 'A-Z'          # HELLO — lowercase to uppercase
echo "hello" | tr 'el' 'ip'            # hippo — e→i, l→p
echo "hello world" | tr ' ' '_'        # hello_world — spaces to underscores

# ── Delete (-d) ──
echo "hello 123 world" | tr -d '0-9'   # hello  world — delete digits
echo "hello" | tr -d 'l'               # heo — delete l's
echo "hello world" | tr -d '[:space:]' # helloworld — delete all whitespace

# ── Squeeze (-s) — collapse repeats ──
echo "hello    world" | tr -s ' '      # hello world — collapse multiple spaces to one
echo "aaabbbccc" | tr -s 'abc'        # abc — squeeze each repeated char

# ── Delete complement (-dc) — keep ONLY matching ──
echo "hello123world" | tr -dc '0-9'    # 123 — delete everything EXCEPT digits
echo "hello world" | tr -dc 'a-z\n'   # helloworld — keep only lowercase + newlines

# ── Rot13 ──
echo "hello" | tr 'a-zA-Z' 'n-za-mN-ZA-M'  # uryyb — rot13 encoding

# ── ⚠️ tr is CHARACTER-based, not pattern-based ──
echo "abc" | tr 'abc' '123'   # 123 — each char: a→1, b→2, c→3
echo "abc" | tr 'abc' '12'    # 122 — c maps to 2 (last char of set2 repeats for extra chars in set1)
```
::

## Pipeline Composition Patterns

::code-wrapper{language="bash"}
```bash
# ── Top 5 most frequent IPs in access log ──
grep "GET" access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head -5

# ── Unique error messages (strip timestamps, dedup) ──
grep "ERROR" log.txt | sed 's/^\[.*\] //' | sort -u

# ── Lines longer than 80 chars ──
awk 'length > 80' file.txt

# ── Largest files (top 10) ──
du -s * | sort -rn | head -10

# ── Word frequency in a text file ──
tr '[:space:][:punct:]' '\n' < file.txt | grep -v '^$' | sort | uniq -c | sort -rn | head -20

# ── Find all unique file extensions in a directory ──
find . -type f -name '*.*' | sed 's/.*\.//' | sort | uniq -c | sort -rn

# ── Count lines of code by language ──
find . -name '*.sh' -exec wc -l {} + | tail -1
find . -name '*.py' -exec wc -l {} + | tail -1

# ── Extract all URLs from a file ──
grep -oE 'https?://[^ ]+' file.txt | sort -u

# ── CSV: sum of column 2, grouped by column 1 ──
awk -F',' '{sum[$1] += $2} END {for (k in sum) printf "%s,%d\n", k, sum[k]}' data.csv | sort

# ── Process substitution: diff sorted versions of a file ──
diff <(sort file1.txt) <(sort file2.txt)   # no temp files needed
```
::

## 💡 Tips & Tricks

::code-wrapper{language="bash"}
```bash
# ── Prefer parameter expansion over sed for simple ops (no subprocess!) ──
str="hello world"
# ❌ SLOW (forks sed)
upper=$(echo "$str" | sed 's/.*/\U&/')   # GNU sed only
# ✅ FAST (in-process)
upper="${str^^}"                         # Bash 4+ parameter expansion

# ── Use `awk` instead of `grep + sed + cut` for complex field extraction ──
# ❌ CHAINED (3 subprocesses)
grep "error" log.txt | sed 's/.*error: //' | cut -d' ' -f1
# ✅ SINGLE AWK (1 subprocess)
awk '/error/ {sub(/.*error: /, ""); print $1}' log.txt

# ── `sort -V` for version numbers ──
printf '%s\n' '1.2.3' '1.2.10' '1.2.2' | sort -V
# 1.2.2 1.2.3 1.2.10 — correct (numeric version ordering)
# Without -V: 1.2.10 1.2.2 1.2.3 — wrong (string sort: "10" < "2")

# ── `tac` (reverse) for processing a file bottom-to-top ──
tac log.txt | head -100   # last 100 lines, in order (tac reverses, head takes first 100)
tail -100 log.txt         # same result (faster for large files)

# ── `paste` for side-by-side file comparison ──
paste file1.txt file2.txt        # tab-separated, side by side
paste -d',' file1.txt file2.txt  # comma-separated
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="bash"}
```bash
# ── grep regex is LINE-based — `.` doesn't match newlines ──
# For multi-line patterns: use grep -z (null-delimited) or pcregrep / ripgrep
grep -Pzo '"key"\s*:\s*"value"' file.json   # -z: null-delimited (GNU only)

# ── macOS grep vs GNU grep ──
# macOS BSD grep doesn't support -P (PCRE). Use -E (ERE) or install ripgrep (rg).
# macOS BSD grep -o behaves slightly differently with capture groups.

# ── `sed` regex differs between GNU and BSD ──
# GNU sed: supports \s, \d, \b, etc. (GNU extensions)
# BSD sed: POSIX BRE only — no \s, \d. Use [[:space:]], [0-9], etc.
# Portable: use POSIX character classes [[:space:]], [[:digit:]], [[:alpha:]]

# ── `cut` can't handle quoted CSV ──
echo '"Smith, John",30' | cut -d',' -f1    # "Smith  — broken (comma inside quotes)
# Use a proper CSV parser: csvkit, mlr (Miller), or awk with a CSV module.

# ── `sort` locale: LC_ALL=C for determinism ──
# en_US.UTF-8: sort might be case-insensitive, accent-aware, or locale-version-dependent
# C: pure ASCII byte order — always the same. Use LC_ALL=C in scripts.

# ── `uniq -c` output has leading spaces ──
sort file | uniq -c | sort -rn   # uniq -c adds leading spaces: "  5 hello"
# To strip: | sed 's/^ *//' or | awk '{print $1, $2}'

# ── `xargs` breaks on spaces without -0 ──
find . -name "*.txt" | xargs grep "pattern"      # breaks on filenames with spaces
find . -name "*.txt" -print0 | xargs -0 grep "pattern"  # safe (null-delimited)

# ── `tail -f` blocks forever ──
tail -f log.txt   # streams forever — in a script, use with timeout or grep -m1
tail -f log.txt | grep -m1 "ready"   # stop at first match (grep -m1 exits after 1 match)
```
::

## 🧠 Quick Quiz

Why does this `awk` one-liner produce different output on Linux vs macOS?

::code-wrapper{language="bash"}
```bash
echo "hello" | awk '{print toupper($0)}'
```
::

<details>
<summary>Answer</summary>

It doesn't (in this case) — `toupper` is POSIX and works on both. But locale affects it:

- With `LC_ALL=C`: `toupper` converts ASCII a-z only. `"héllo"` → `"HéLLO"` (é stays, because C locale is ASCII-only).
- With `LC_ALL=en_US.UTF-8`: `toupper` converts Unicode. `"héllo"` → `"HÉLLO"` (é → É, locale-aware).

**The gotcha**: `awk` string functions are locale-dependent. For consistent output across systems, set `LC_ALL=C` for ASCII-only behavior, or `LC_ALL=en_US.UTF-8` for Unicode. Don't rely on default locale — it varies by system.

</details>