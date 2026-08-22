# 05 — Text Processing & Pipelines

Linux philosophy: write small tools that do one thing well, then combine them with **pipes**. This chapter covers the core text-processing toolkit — `grep`, `sed`, `awk`, `cut`, `sort`, `uniq`, `tr`, `paste`, `column`, `tee`, `xargs` — and how to compose them into powerful one-liners. This is arguably the most important skill for a Linux user or admin.

## Pipes (Recap)

A pipe `|` connects one command's stdout to the next command's stdin. Each command runs concurrently:

```text
$ cat /var/log/syslog | grep "error" | sort | uniq -c | sort -rn | head
  cat ──> grep ──> sort ──> uniq ──> sort ──> head
```

- Only stdout flows through the pipe; stderr goes to the terminal unless redirected.
- The exit status of a pipeline is the **last** command's (unless `set -o pipefail`).

## `grep` — Search

::code-wrapper{language="bash"}
```bash
grep "root" /etc/passwd                  # basic search
grep -i "error" log.txt                  # case-insensitive
grep -v "DEBUG" log.txt                  # invert: lines WITHOUT "DEBUG"
grep -n "PermitRoot" sshd_config         # line numbers
grep -c "error" log.txt                  # count matching lines
grep -l "TODO" *.py                      # only filenames with matches
grep -L "TODO" *.py                      # filenames WITHOUT matches
grep -r "PermitRootLogin" /etc/ssh       # recursive
grep -E "^[0-9]+" file                   # extended regex (ERE)
grep -w "the" file                       # whole-word match
grep -x "exact line" file                # whole-line match
grep -A 3 -B 1 "error" log               # 3 lines after, 1 before
grep --color=auto "foo" file             # highlight matches
grep -f patterns.txt file                # patterns from a file
grep -e "pat1" -e "pat2" file            # multiple patterns
grep -P "(?<=foo)bar" file               # PCRE (lookbehind) — GNU grep
```
::

### Basic vs Extended Regex

| Feature | BRE (default) | ERE (`-E`) |
|---|---|---|
| `.` `*` `^` `$` `[...]` | Yes | Yes |
| `+` `?` `{n,m}` `|` `()` | Escaped: `\+` `\?` | Direct: `+` `?` |
| Backreferences | `\1`, `\2` | `\1`, `\2` |

::code-wrapper{language="bash"}
```bash
grep "ab*c" file          # BRE: a, zero+ b's, c (abc, ac, abbc)
grep -E "ab+c" file       # ERE: a, one+ b's, c (abc, abbc — not ac)
grep -E "cat|dog" file    # ERE: "cat" OR "dog"
grep -E "([0-9]{3})-[0-9]{4}" file   # ERE: 555-1234
```
::

## `sed` — Stream Editor

`sed` applies editing commands to each line of input. It's non-interactive (a "stream editor").

### Substitution

::code-wrapper{language="bash"}
```bash
sed 's/old/new/' file           # replace first occurrence per line
sed 's/old/new/g' file          # replace ALL occurrences per line (global)
sed 's/old/new/2' file          # replace the 2nd occurrence per line
sed 's/old/new/gi' file         # global + case-insensitive
sed 's/  */ /g' file            # collapse multiple spaces to one
sed 's|/usr/local|/opt/app|g' file   # use | as delimiter (easier with /)
sed 's/[[:space:]]*$//' file    # trim trailing whitespace
sed 's/^[[:space:]]*//' file    # trim leading whitespace
sed 's/^[ \t]*//;s/[ \t]*$//' file  # trim both (two commands)
```
::

### Addressing (Which Lines to Edit)

::code-wrapper{language="bash"}
```bash
sed '5d' file               # delete line 5
sed '5,10d' file            # delete lines 5–10
sed '/^#/d' file            # delete comment lines (starting with #)
sed '/^$/d' file            # delete blank lines
sed '/error/!d' file        # delete lines WITHOUT "error" (keep matches)
sed -n '10,20p' file        # print only lines 10–20 (-n suppresses auto-print)
sed -n '/regex/p' file      # print only matching lines (like grep)
sed '$d' file               # delete last line ($ = last line)
sed '1!d' file              # delete all but line 1 (keep first)
```
::

### In-Place Editing

::code-wrapper{language="bash"}
```bash
sed -i 's/old/new/g' file           # edit file in-place (no backup!)
sed -i.bak 's/old/new/g' file       # in-place + save original as file.bak
sed -i '/^#/d; /^$/d' file          # remove comments and blanks in-place
```
::
`-i` modifies the file directly. Always test without `-i` first, or use `-i.bak` for a backup.

### Other Commands

::code-wrapper{language="bash"}
```bash
sed '5a\Inserted after line 5' file   # append text after line 5
sed '5i\Inserted before line 5' file  # insert text before line 5
sed '5c\Replacement line' file        # change (replace) line 5
sed 'y/abc/xyz/' file                 # transliterate (like tr)
sed '=' file | sed 'N;s/\n/\t/'       # number lines (cat -n style)
```
::

## `awk` — Field Processing

`awk` is a full programming language for column-based text processing. It auto-splits each line into fields (`$1`, `$2`, ..., `$0` = whole line). Default field separator is whitespace.

### Basic Patterns

::code-wrapper{language="bash"}
```bash
awk '{print $1}' file              # print first field of each line
awk '{print $1, $3}' file          # print fields 1 and 3
awk '{print $NF}' file             # print last field ($NF = number of fields)
awk '/error/ {print}' file         # print lines matching "error"
awk '/error/' file                 # same (default action is print)
awk 'NR==5' file                   # print line 5 (NR = record number)
awk 'NR>=10 && NR<=20' file        # lines 10–20
awk 'NF==0' file                   # print blank lines (no fields)
awk '{print NR, $0}' file          # number lines (like cat -n)
```
::

### Field Separators

::code-wrapper{language="bash"}
```bash
awk -F: '{print $1, $7}' /etc/passwd          # colon-separated
awk -F'[ ,]' '{print $1}' file                # space OR comma
awk -F'\t' '{print $1}' file                  # tab-separated
awk 'BEGIN{FS=":"} {print $1}' /etc/passwd    # same as -F:
awk 'BEGIN{OFS=","} {print $1, $7}' file      # output separator = comma
```
::

### BEGIN / END Blocks

`BEGIN` runs before the first line; `END` runs after the last:

::code-wrapper{language="bash"}
```bash
# Count lines
awk 'END{print NR}' file

# Sum column 2
awk '{sum += $2} END{print sum}' file

# Average of column 2
awk '{sum += $2} END{print sum/NR}' file

# Print header + data
awk 'BEGIN{print "User\tShell"} {print $1"\t"$7}' /etc/passwd
```
::

### Conditionals and Loops

::code-wrapper{language="bash"}
```bash
awk '$3 > 100 {print $1, $3}' file          # field 3 > 100
awk '{if ($3 > 100) print $1; else print "low"}' file
awk '{for (i=1; i<=NF; i++) print $i}' file  # print each field on its own line
awk '{sum=0; for (i=1; i<=NF; i++) sum+=$i; print sum}' file  # sum fields per line
```
::

### Practical Examples

::code-wrapper{language="bash"}
```bash
# Top 10 largest files in /var/log (by size in bytes)
ls -l /var/log/* | awk '{print $5, $9}' | sort -rn | head

# Users and their shells
awk -F: '$7 ~ /bash$/ {print $1}' /etc/passwd   # users with bash shell

# Total size of all .log files
du -b /var/log/*.log | awk '{sum+=$1} END{print sum/1024/1024 " MB"}'

# Find the longest line
awk '{if (length > max) max=length} END{print max}' file
```
::

## `cut` — Extract Columns

Simpler than `awk` for fixed delimiters:

::code-wrapper{language="bash"}
```bash
cut -d: -f1 /etc/passwd           # field 1, colon-delimited (usernames)
cut -d: -f1,7 /etc/passwd         # fields 1 and 7
cut -d: -f3- /etc/passwd          # fields 3 to end
cut -c1-10 file                   # characters 1–10 (fixed-width)
cut -c1,5,10 file                 # characters 1, 5, 10
cut -d' ' -f2- file               # field 2 onward, space-delimited
```
::
`cut` is faster than `awk` for simple cases, but less flexible (no conditionals, no regex). Use `awk` when you need logic; `cut` when you just slice.

## `sort` — Sort Lines

::code-wrapper{language="bash"}
```bash
sort file                 # alphabetical (locale-aware)
sort -n file              # numeric (10 after 9, not after 1)
sort -r file              # reverse
sort -rn file             # numeric reverse (top values first)
sort -u file              # sort + unique (dedupe)
sort -k2 file             # sort by field 2
sort -k2 -n file          # sort by field 2, numeric
sort -k2,2 -n file        # sort by field 2 ONLY (not 2 onward)
sort -t: -k3 -n /etc/passwd   # colon-delimited, sort by UID (field 3)
sort -h file              # human-numeric (2K, 1M, 3G — for sizes)
sort -V file              # version sort (v1.2.10 after v1.2.9)
sort -R file              # random shuffle
sort -c file              # check if sorted (exit status)
sort -m f1 f2             # merge already-sorted files
```
::

## `uniq` — Deduplicate Adjacent Lines

`uniq` only removes **adjacent** duplicates. Usually preceded by `sort`:

::code-wrapper{language="bash"}
```bash
sort file | uniq                  # dedupe (sort first!)
sort file | uniq -c               # prefix with count
sort file | uniq -c | sort -rn    # frequency-sorted (most common first)
sort file | uniq -d               # only duplicate lines
sort file | uniq -u               # only unique (non-duplicate) lines
sort file | uniq -i               # case-insensitive
```
::
The `sort | uniq -c | sort -rn` idiom is one of the most useful in Linux — it's a frequency counter.

## `tr` — Transliterate / Delete

`tr` works on **characters**, not lines:

::code-wrapper{language="bash"}
```bash
echo "Hello" | tr 'a-z' 'A-Z'             # HELLO (uppercase)
echo "Hello" | tr 'A-Z' 'a-z'             # hello (lowercase)
echo "hello world" | tr ' ' '-'           # hello-world (spaces to dashes)
echo "hello" | tr -d 'l'                  # heo (delete chars)
echo "hello  world" | tr -s ' '           # hello world (squeeze repeats)
echo "hello world" | tr -cd 'a-zA-Z'      # helloworld (delete non-alpha)
cat file | tr '\n' ' '                    # join all lines into one
echo "1,2,3" | tr ',' '\n'                # split CSV into lines
echo "abc123" | tr 'a-c' 'x-z'            # xyz123
```
::
- `tr` reads from stdin only (no file argument). Use `< file` or pipe.
- Character classes: `tr '[:lower:]' '[:upper:]'`, `tr -d '[:space:]'`, `tr -d '[:punct:]'`.

## `paste` — Merge Lines Side-by-Side

::code-wrapper{language="bash"}
```bash
paste file1 file2              # column-wise merge (tab-separated)
paste -d, file1 file2          # comma-separated
paste -s file1                 # merge all lines into one (serial)
paste -d'\n' - -               # read stdin two lines at a time
```
::

## `column` — Pretty-Print Tables

::code-wrapper{language="bash"}
```bash
column -t file                 # align into columns (auto-detect delimiter)
column -t -s: /etc/passwd      # colon-delimited, aligned
mount | column -t              # readable mount table
ps aux | column -t             # readable process table
```
::

## `comm` — Compare Two Sorted Files

::code-wrapper{language="bash"}
```bash
comm file1 file2               # 3 columns: only-1, only-2, both
comm -12 file1 file2           # lines in BOTH (intersection)
comm -23 file1 file2           # lines only in file1 (difference)
comm -13 file1 file2           # lines only in file2
```
::
Both files must be sorted. Useful for set operations on line lists.

## `diff` — Compare Files

::code-wrapper{language="bash"}
```bash
diff old.txt new.txt           # unified diff (default on GNU)
diff -u old.txt new.txt        # explicit unified format
diff -y old.txt new.txt        # side-by-side
diff -q dir1 dir2              # just report which files differ
diff --color=auto old new      # colored
vimdiff old.txt new.txt        # interactive merge in vim
```
::

## `tee` — T-Split a Stream

`tee` writes stdin to a file **and** passes it to stdout:

::code-wrapper{language="bash"}
```bash
dmesg | tee dmesg.log | grep -i error    # save full + filter
echo "config" | tee /etc/myapp.conf      # write + display
command | tee -a log.txt                 # append to log
command 2>&1 | tee log.txt               # capture stdout + stderr
```
::
`tee` is useful when you want to see output in the terminal **and** save it.

## `xargs` — Build Command Lines from Stdin

`xargs` reads stdin and runs a command with those items as arguments. Bridges "list of items" → "command args":

::code-wrapper{language="bash"}
```bash
find /tmp -type f -name "*.log" | xargs rm          # delete all found logs
find /var -type f -name "*.conf" | xargs grep "HOST"  # grep each found file
echo "1 2 3 4" | xargs -n 1 echo                    # echo each number separately
cat urls.txt | xargs -n 1 curl -O                   # download each URL
find . -name "*.bak" | xargs -p rm                  # prompt before each command
find . -type f -print0 | xargs -0 grep "pattern"    # safe for filenames with spaces
```
::

### The Null-Delimited Idiom (Critical Safety)

Filenames can contain spaces, newlines, and quotes. The safe way to pipe `find` to `xargs`:

::code-wrapper{language="bash"}
```bash
find . -type f -print0 | xargs -0 grep "pattern"
#  -print0: separate filenames with NUL (\0), not newline
#  -0:      xargs reads NUL-delimited input
```
::
Without this, `find . -name "*.txt" | xargs rm` breaks on a file named `my document.txt` — xargs sees two arguments: `my` and `document.txt`.

Prefer `find -exec ... {} +` as a safer alternative (no xargs needed):

::code-wrapper{language="bash"}
```bash
find . -type f -name "*.txt" -exec grep "pattern" {} +
```
::

## `head` and `tail`

::code-wrapper{language="bash"}
```bash
head -n 20 file          # first 20 lines
head -c 100 file         # first 100 bytes
tail -n 20 file          # last 20 lines
tail -c 100 file         # last 100 bytes
tail -n +2 file          # all lines from line 2 onward (skip header)
tail -f /var/log/syslog  # follow (live)
tail -F /var/log/syslog  # follow + handle rotation (re-open if moved)
head -n 100 file | tail -n 1   # line 100 (head 100, then last line of that)
```
::

## `wc` — Word Count

::code-wrapper{language="bash"}
```bash
wc file          # lines  words  bytes
wc -l file       # lines
wc -w file       # words
wc -c file       # bytes
wc -m file       # characters (differs from bytes for multibyte/UTF-8)
wc -L file       # length of longest line
``
::

## Composing Pipelines — Real-World Examples

### Top 10 IPs in an Access Log

::code-wrapper{language="bash"}
```bash
awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head
#  1243 192.168.1.50
#   872 10.0.0.15
#   ...
```
::

### Find the 5 Largest Files

::code-wrapper{language="bash"}
```bash
find / -type f -exec du -h {} + 2>/dev/null | sort -rh | head -5
```
::

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

- **Idiom**: use `sort | uniq -c | sort -rn` as a frequency counter — it's the most reused pipeline in Linux. Counts how many times each line appears, sorted by frequency. Works on logs, IPs, error messages, anything line-based.
- **Idiom**: use `awk -F:` for colon-delimited files (`/etc/passwd`, `/etc/group`, `/etc/shadow`) — `-F:` sets the field separator, then `$1` is username, `$3` is UID, `$7` is shell. Print users with bash: `awk -F: '$7 ~ /bash$/ {print $1}' /etc/passwd`.
- **Idiom**: use `sed -i.bak` for in-place edits with a backup — `sed -i 's/old/new/g' file` has no undo; `sed -i.bak ...` saves `file.bak`. Test the command without `-i` first, pipe to `head` to verify, then apply with `-i.bak`.
- **Idiom**: use `tail -F` (capital) instead of `tail -f` for log watching — `-F` handles log rotation (when the file is moved and recreated by `logrotate`). `-f` stops following if the file is moved.
- **Idiom**: use `awk '{print $NF}'` for the last field — `$NF` is "field number NF" (the count), so it's always the last field regardless of how many fields the line has. Great for extracting filenames from `ls -l` output.
- **Idiom**: use `grep -E` for readability over `grep` with backslashes — `grep -E "cat|dog"` is clearer than `grep "cat\|dog"`. BRE's backslash escaping is a historical wart; ERE is the modern default for anything with `+`, `?`, `|`, `()`.
- **Performance**: `grep` is faster than `awk` for plain matching — `grep "pattern" file` beats `awk '/pattern/' file`. Use `grep` for filtering, `awk` when you need field logic. For huge files, `LC_ALL=C grep` is faster (byte-wise, no locale).
- **Performance**: `sort -S 50% --parallel=4` speeds up large sorts — `-S` sets buffer size (50% of RAM), `--parallel` uses multiple cores. Default `sort` may be slow on multi-GB files.
- **Debug**: use `set -x` to see how the shell expands a pipeline — reveals globbing, variable expansion, and quoting issues before the commands run. Essential when a pipeline doesn't do what you expect.

## ⚠️ Edge Cases & Gotchas

- **`uniq` only removes adjacent duplicates**: `echo -e "a\nb\na" | uniq` outputs all three lines. Always `sort` before `uniq` unless you specifically want adjacent-only dedup. The classic bug: `uniq file` without `sort` appears to do nothing.
- **`sed -i` has no undo**: `sed -i 's/old/new/g' file` overwrites the file. If your regex is wrong, the file is corrupted. Always test with `sed 's/old/new/g' file | head` first, or use `sed -i.bak` for a backup.
- **Filenames with spaces break `xargs`**: `find . -name "*.txt" | xargs grep foo` fails on `my notes.txt`. Use `find -print0 | xargs -0` or `find -exec {} +`. The null-delimited approach is the only safe way.
- **`sort` is locale-aware**: `sort` uses your locale (`LC_COLLATE`) — in `en_US.UTF-8`, uppercase sorts before lowercase differently than in `C` locale. For byte-order sorting (consistent across systems), use `LC_ALL=C sort`. This surprises people when `sort | uniq` produces "different" order on different machines.
- **`grep -r` follows symlinks on some systems**: GNU `grep -r` does NOT follow symlinks; `-R` does. Watch for symlink loops (`-R` on a tree with a circular symlink loops forever). Use `--exclude-dir` to skip `.git` etc.
- **`awk` treats numbers as strings sometimes**: `awk '$1 > 10'` may do string comparison if `$1` is `"9abc"`. Use `awk '$1 + 0 > 10'` to force numeric. `awk '$1 == "0"'` matches `"0"` and `0`, but `awk '$1 == 0` might match `"00"` too (locale-dependent).
- **`cut -d" "` treats consecutive spaces as multiple empty fields**: `echo "a  b" | cut -d" " -f2` gives empty (field 2 is between the two spaces). Use `awk '{print $2}'` instead (awk treats consecutive whitespace as one separator).
- **`tail -f` stops on log rotation**: when `logrotate` moves the file, `tail -f` keeps watching the old (now moved) inode. Use `tail -F` (capital) which re-opens the file by name. This is a very common monitoring bug.
- **`xargs` runs the command with as many args as fit on a line**: `find . | xargs echo` might run `echo file1 file2 ... file1000` once, or multiple times. If the command has side effects, it may run more than expected. Use `xargs -n 1` to run once per item, or `xargs -I{}` for precise placement.
- **`sed` regex is BRE by default**: `sed 's/a+/b/g'` replaces literal "a+" (not "one or more a"). Use `sed -E 's/a+/b/g'` for ERE. Same as `grep` but easy to forget since `sed`'s syntax already looks regex-like.
- **Pipelines hide intermediate failures**: `cmd1 | cmd2 | cmd3` — if `cmd1` fails, `cmd2` and `cmd3` still run (on empty/partial input). The pipeline's exit status is `cmd3`'s. Use `set -o pipefail` (in scripts) to fail if any stage fails.

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

```text
1 E404
1 E500
2 E404
1 E500
```

**Fix: `sort` before `uniq`:**

::code-wrapper{language="bash"}
```bash
grep "ERROR" app.log | awk '{print $4}' | sort | uniq -c | sort -rn | head
```
::
Now `sort` groups identical codes together, and `uniq -c` counts each group correctly:

```text
3 E404
2 E500
```

The canonical idiom is always `sort | uniq -c | sort -rn` — `sort` first (group), `uniq -c` (count), `sort -rn` (rank by frequency). Forgetting the first `sort` is one of the most common pipeline bugs.
</details>