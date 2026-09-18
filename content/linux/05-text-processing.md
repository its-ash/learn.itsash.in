# 05 — Text Processing & Pipelines

Linux philosophy: write small tools that do one thing well, then combine them with **pipes**. This chapter covers the core text-processing toolkit — `grep`, `sed`, `awk`, `cut`, `sort`, `uniq`, `tr`, `xargs` — composed into production-grade one-liners. This is arguably the most important skill for a Linux engineer.

## Pipes (Recap)

A pipe `|` connects one command's stdout to the next command's stdin. Each command runs **concurrently**:

::code-wrapper{language="bash"}
```bash
# Complex Implementation: frequency-count top IPs in an access log
# — 5 stages, all running concurrently, streaming data through the pipe
awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10
#  1243 192.168.1.50
#   872 10.0.0.15
```
::

## `grep` — Search

::code-wrapper{language="bash"}
```bash
grep "root" /etc/passwd               # basic search
grep -r "PermitRoot" /etc/ssh         # recursive
grep -i "error" /var/log/syslog       # case-insensitive
grep -v "DEBUG" app.log               # invert (lines WITHOUT "DEBUG")
grep -n "PermitRoot" sshd_config      # line numbers
grep -c "error" app.log               # count matches
grep -E "^[0-9]+" file                # extended regex (-E)
grep -w "the" file                    # whole-word match
grep -A 2 -B 2 "error" log            # 2 lines After, 2 Before
grep -l "TODO" *.py                   # only filenames with matches
grep -P "(?<=foo)bar" file            # PCRE (lookbehind) — GNU grep
grep -oE 'https?://[^ ]+' access.log  # extract only matching portion
```
::

### Performance Tip: `LC_ALL=C grep` for Huge Files

::code-wrapper{language="bash"}
```bash
# NAIVE: locale-aware grep on a 10 GB log (slow — UTF-8 collation overhead)
grep "error" huge.log

# PRODUCTION: byte-wise grep (10x+ faster on large files)
LC_ALL=C grep "error" huge.log
# C locale = byte comparison, no Unicode processing
```
::

## `sed` — Stream Editor

### Substitution

::code-wrapper{language="bash"}
```bash
sed 's/old/new/' file           # replace first occurrence per line
sed 's/old/new/g' file          # replace ALL occurrences per line (global)
sed 's/old/new/gi' file         # global + case-insensitive
sed 's|/usr/local|/opt/app|g' file   # use | as delimiter (easier with /)
sed 's/[[:space:]]*$//' file    # trim trailing whitespace
sed 's/^[[:space:]]*//' file    # trim leading whitespace
```
::

### In-Place Editing

::code-wrapper{language="bash"}
```bash
# Complex Implementation: safe in-place edit with backup
sed -i.bak 's/old/new/g' file       # in-place + save original as file.bak
# Test WITHOUT -i first:
sed 's/old/new/g' file | head       # verify output, then apply with -i.bak

# Anti-Pattern: sed -i without backup (no undo if regex is wrong)
# sed -i 's/old/new/g' file         → if wrong, file is corrupted
```
::

### Edge Case: `sed` Regex is BRE by Default

::code-wrapper{language="bash"}
```bash
# NAIVE: sed 's/a+/b/g' replaces literal "a+" (BRE — + is literal)
# PRODUCTION: sed -E 's/a+/b/g' replaces "one or more a" (ERE)
sed -E 's/a+/b/g' file              # ERE (extended regex)
```
::

## `awk` — Field Processing

`awk` is a full programming language for column-based text processing. It auto-splits each line into fields (`$1`, `$2`, ..., `$0` = whole line). Default field separator is whitespace.

### Complex Implementation: Log Analysis with awk

::code-wrapper{language="bash"}
```bash
# Sum HTTP status codes from an access log
awk -F'"' '{print $3}' access.log | awk '{print $1}' | sort | uniq -c | sort -rn
#  1243 200
#   872 404
#    15 500

# Top 10 requesting IPs with their request counts
awk '{print $1}' access.log | sort | uniq -c | sort -rn | head -10

# Total bandwidth (bytes transferred = field 10 in Common Log Format)
awk '{sum += $10} END{printf "Total: %.2f MB\n", sum/1024/1024}' access.log

# Users with bash shell (field 7 in /etc/passwd)
awk -F: '$7 ~ /bash$/ {print $1}' /etc/passwd

# Average of column 2
awk '{sum += $2} END{print sum/NR}' file
```
::

### BEGIN / END Blocks

::code-wrapper{language="bash"}
```bash
# Print header + data + footer
awk -F: 'BEGIN{print "User\tUID\tShell"} {print $1"\t"$3"\t"$7} END{print "Total: " NR " users"}' /etc/passwd
```
::

## `sort` — Sort Lines

::code-wrapper{language="bash"}
```bash
sort -n file              # numeric (10 after 9, not after 1)
sort -rn file             # numeric reverse (top values first)
sort -u file              # sort + unique (dedupe)
sort -k2 -n file          # sort by field 2, numeric
sort -t: -k3 -n /etc/passwd   # colon-delimited, sort by UID (field 3)
sort -h file              # human-numeric (2K, 1M, 3G — for sizes)
sort -V file              # version sort (v1.2.10 after v1.2.9)
```
::

### Edge Case: `sort` is Locale-Aware

::code-wrapper{language="bash"}
```bash
# NAIVE: locale-dependent sort (different order on different machines)
sort file
# In en_US.UTF-8, uppercase sorts differently than in C locale

# PRODUCTION: byte-order sort (consistent across systems)
LC_ALL=C sort file
```
::

## `uniq` — Deduplicate Adjacent Lines

`uniq` only removes **adjacent** duplicates. Usually preceded by `sort`:

::code-wrapper{language="bash"}
```bash
# Complex Implementation: frequency counter (the most reused pipeline in Linux)
sort file | uniq -c | sort -rn    # count occurrences, sorted by frequency

# Edge Case: uniq without sort appears to do nothing
# NAIVE:
uniq file                         # only removes adjacent dups — a\nb\na → all 3 lines
# PRODUCTION:
sort file | uniq                  # dedupe correctly (sort first)
```
::

## `tr` — Transliterate / Delete

`tr` works on **characters**, not lines:

::code-wrapper{language="bash"}
```bash
echo "Hello" | tr 'a-z' 'A-Z'             # HELLO (uppercase)
echo "hello  world" | tr -s ' '           # hello world (squeeze repeats)
echo "hello world" | tr -cd 'a-zA-Z'      # helloworld (delete non-alpha)
echo "1,2,3" | tr ',' '\n'               # split CSV into lines
```
::

## `xargs` — Build Command Lines from Stdin

::code-wrapper{language="bash"}
```bash
# Complex Implementation: null-delimited pipeline (safe for any filename)
# — filenames can contain spaces, newlines, and quotes
find . -type f -print0 | xargs -0 grep "pattern"
#  -print0: separate filenames with NUL (\0), not newline
#  -0:      xargs reads NUL-delimited input

# Anti-Pattern: newline-delimited (breaks on filenames with spaces)
# find . -name "*.txt" | xargs grep foo   → breaks on "my notes.txt"

# Prefer -exec {} + (equivalent safety, no xargs needed):
find . -type f -name "*.txt" -exec grep "pattern" {} +
```
::

## Composing Pipelines — Real-World Examples

### Extract All URLs from a Log

::code-wrapper{language="bash"}
```bash
grep -oE 'https?://[^ ]+' /var/log/nginx/access.log | sort -u
```
::

### Count Files per Extension

::code-wrapper{language="bash"}
```bash
find . -type f | sed 's/.*\.//' | sort | uniq -c | sort -rn
```
::

### Show Process Tree of a Service

::code-wrapper{language="bash"}
```bash
ps aux | grep nginx | grep -v grep | awk '{print $2}' | head -1 | xargs -I{} pstree -p {}
```
::

## 💡 Tips & Tricks

- **Idiom**: use `sort | uniq -c | sort -rn` as a frequency counter — the most reused pipeline in Linux. Counts how many times each line appears, sorted by frequency.
- **Idiom**: use `awk '{print $NF}'` for the last field — `$NF` is "field number NF" (the count), so it's always the last field regardless of how many fields the line has.
- **Idiom**: use `tail -F` (capital) instead of `tail -f` for log watching — `-F` handles log rotation (re-opens if the file is moved/recreated).
- **Idiom**: use `grep -E` for readability over `grep` with backslashes — `grep -E "cat|dog"` is clearer than `grep "cat\|dog"`.
- **Performance**: `grep` is faster than `awk` for plain matching — use `grep` for filtering, `awk` when you need field logic.
- **Performance**: `sort -S 50% --parallel=4` speeds up large sorts — `-S` sets buffer size (50% of RAM), `--parallel` uses multiple cores.

## ⚠️ Edge Cases & Gotchas

- **`uniq` only removes adjacent duplicates**: `echo -e "a\nb\na" | uniq` outputs all three lines. Always `sort` before `uniq` unless you specifically want adjacent-only dedup.
- **`sed -i` has no undo**: `sed -i 's/old/new/g' file` overwrites the file. If your regex is wrong, the file is corrupted. Always test without `-i` first, or use `sed -i.bak`.
- **Filenames with spaces break `xargs`**: `find . -name "*.txt" | xargs grep foo` fails on `my notes.txt`. Use `find -print0 | xargs -0` or `find -exec {} +`.
- **`sort` is locale-aware**: `sort` uses your locale (`LC_COLLATE`). For byte-order sorting (consistent across systems), use `LC_ALL=C sort`.
- **`grep -r` vs `-R`**: GNU `grep -r` does NOT follow symlinks; `-R` does. Watch for symlink loops with `-R`.
- **`awk` treats numbers as strings sometimes**: `awk '$1 > 10'` may do string comparison if `$1` is `"9abc"`. Use `awk '$1 + 0 > 10'` to force numeric.
- **`cut -d" "` treats consecutive spaces as multiple empty fields**: `echo "a  b" | cut -d" " -f2` gives empty. Use `awk '{print $2}'` instead (awk treats consecutive whitespace as one separator).
- **Pipelines hide intermediate failures**: `cmd1 | cmd2 | cmd3` — if `cmd1` fails, `cmd2` and `cmd3` still run. The pipeline's exit status is `cmd3`'s. Use `set -o pipefail` in scripts.

## 🧠 Spot the Bug

A sysadmin wants to count how many times each error code appears in a log, but this pipeline gives wrong counts — many error codes show count 1 that should be higher:

::code-wrapper{language="bash"}
```bash
grep "ERROR" app.log | awk '{print $4}' | uniq -c | sort -rn | head
```
::

What's wrong, and how do you fix it?

<details>
<summary>Answer</summary>

**`uniq` only deduplicates adjacent duplicates.** The error codes from `awk` are in log order (not sorted), so `E404 E500 E404 E404 E500` has no adjacent duplicates collapsed — `uniq -c` reports each run separately:

::code-wrapper{language="bash"}
```bash
1 E404
1 E500
2 E404
1 E500
```
::

**Fix: `sort` before `uniq`:**

::code-wrapper{language="bash"}
```bash
grep "ERROR" app.log | awk '{print $4}' | sort | uniq -c | sort -rn | head
```
::

Now `sort` groups identical codes together, and `uniq -c` counts each group correctly:

::code-wrapper{language="bash"}
```bash
3 E404
2 E500
```
::
</details>