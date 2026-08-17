# 06 — Text Processing Tools

Bash's power is combining small text tools: `grep`, `sed`, `awk`, `cut`, `sort`, `uniq`, `tr`, `head`, `tail`, `wc`, `paste`, `column`.

## `grep` (search)

::code-wrapper{language="bash"}
```bash
grep "error" log.txt             # lines containing "error"
grep -i "error" log.txt          # case-insensitive
grep -v "debug" log.txt          # lines NOT containing "debug"
grep -n "error" log.txt          # line numbers
grep -c "error" log.txt          # count of matching lines
grep -r "error" .                # recursive
grep -E "error|warning" log.txt  # extended regex (|)
grep -w "error" log.txt          # whole word only
grep -A 2 "error" log.txt        # 2 lines after match
grep -B 2 "error" log.txt        # 2 lines before
grep -C 2 "error" log.txt        # 2 lines around
grep -q "error" log.txt          # quiet (exit status only, no output)
```
::
### Basic vs extended regex

- `grep` (BRE): `.`, `*`, `[...]`, `^`, `$`, `\{n,m\}`, `\(\)`, `\|` (escaped).
- `grep -E` (ERE): `.`, `*`, `+`, `?`, `|`, `()`, `{n,m}` (unescaped).

Use `grep -E` (or `egrep`) for modern regex syntax.

## `sed` (stream editor)

::code-wrapper{language="bash"}
```bash
sed 's/old/new/' file.txt        # replace first occurrence per line
sed 's/old/new/g' file.txt       # replace all (global)
sed 's/old/new/2' file.txt       # replace 2nd occurrence per line
sed -i 's/old/new/g' file.txt    # in-place edit (⚠️ modifies file)
sed -i.bak 's/old/new/g' file.txt  # in-place + backup
sed -n '5,10p' file.txt          # print lines 5-10
sed -n '/pattern/p' file.txt     # print matching lines (like grep)
sed '/pattern/d' file.txt        # delete matching lines
sed '5d' file.txt                # delete line 5
sed 's/  */ /g' file.txt         # collapse multiple spaces to one
```
::
### `sed` with different delimiters

::code-wrapper{language="bash"}
```bash
sed 's|/usr/local/bin|/opt/bin|g'   # | delimiter (for paths with /)
sed 's#old#new#g'                    # # delimiter
```
::
When the pattern contains `/` (paths), use a different delimiter (`|`, `#`, `:`).

## `awk` (field processing)

::code-wrapper{language="bash"}
```bash
awk '{print $1}' file.txt              # first field (whitespace-delimited)
awk '{print $1, $3}' file.txt          # first and third
awk -F',' '{print $1}' file.csv        # CSV (comma-delimited)
awk '{print NR, $0}' file.txt          # line number + whole line
awk 'NR >= 5 && NR <= 10' file.txt     # lines 5-10
awk '{sum += $1} END {print sum}' nums.txt  # sum of first column
awk '$3 > 100' file.txt                # lines where field 3 > 100
awk '/error/ {print}' log.txt          # matching lines
awk 'NR > 1' file.txt                  # skip header
awk '{print NF}' file.txt              # number of fields per line
```
::
`awk` is powerful:
- `$0` = whole line, `$1`/`$2` = fields, `NF` = field count, `NR` = line number.
- `-F` sets the field separator.
- `BEGIN { ... }` runs before, `END { ... }` after.
- Conditions and actions: `condition { action }`.

## `cut` (extract fields)

::code-wrapper{language="bash"}
```bash
cut -d',' -f1,3 file.csv     # fields 1 and 3 (comma-delimited)
cut -d: -f1 /etc/passwd      # usernames (first field, : delimited)
cut -c1-10 file.txt          # characters 1-10
cut -c-5 file.txt            # first 5 characters
```
::
`cut` is simpler than `awk` for fixed-delimiter field extraction.

## `sort` and `uniq`

::code-wrapper{language="bash"}
```bash
sort file.txt                # alphabetical
sort -r file.txt             # reverse
sort -n file.txt             # numeric
sort -rn file.txt            # numeric reverse (highest first)
sort -u file.txt             # unique (sort + dedup)
sort -k2 file.txt            # by 2nd field
sort -t',' -k2n file.csv     # by 2nd field, numeric, comma-delimited

# uniq (after sort)
sort file.txt | uniq          # unique lines
sort file.txt | uniq -c       # count occurrences
sort file.txt | uniq -d       # duplicate lines only
sort file.txt | uniq -u       # unique lines only (no duplicates)
```
::
`uniq` removes *adjacent* duplicate lines — pipe through `sort` first to group duplicates. `uniq -c` counts occurrences (frequency).

## `tr` (translate characters)

::code-wrapper{language="bash"}
```bash
echo "hello" | tr 'a-z' 'A-Z'           # HELLO (uppercase)
echo "hello" | tr 'aeiou' '*'            # h*ll* (replace vowels)
echo "hello world" | tr ' ' '_'          # hello_world (spaces to underscores)
echo "hello" | tr -d 'l'                 # heo (delete)
echo "hello world" | tr -s ' '           # hello world (squeeze repeats)
echo "hello" | tr -dc 'a-z'              # only a-z (delete complement)
```
::
`tr` operates on characters (not patterns). Useful for case conversion, deleting characters, squeezing repeats.

## `head` and `tail`

::code-wrapper{language="bash"}
```bash
head file.txt                # first 10 lines
head -n 20 file.txt          # first 20 lines
head -c 100 file.txt         # first 100 bytes
tail file.txt                # last 10 lines
tail -n 20 file.txt          # last 20 lines
tail -f log.txt              # follow (stream new lines)
tail -n +5 file.txt          # from line 5 to end
```
::
`tail -f` streams a file (for logs). `tail -n +N` skips the first N-1 lines.

## `wc` (word count)

::code-wrapper{language="bash"}
```bash
wc file.txt          # lines, words, bytes
wc -l file.txt       # lines only
wc -w file.txt       # words only
wc -c file.txt       # bytes only
wc -m file.txt       # characters only
```
::
## `paste` and `column`

::code-wrapper{language="bash"}
```bash
paste file1.txt file2.txt       # side-by-side (tab-delimited)
paste -d',' file1 file2         # comma-delimited
column -t file.txt              # align columns (pretty print)
column -s',' -t file.csv        # CSV as table
```
::
## Pipelines

Combine tools with `|`:

::code-wrapper{language="bash"}
```bash
# Top 5 most frequent IPs in a log
grep "GET" access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head -5

# Total size of .js files
find . -name "*.js" -exec wc -c {} + | tail -1

# Unique error messages
grep "ERROR" log.txt | sed 's/ERROR: //' | sort -u

# Lines longer than 80 chars
awk 'length > 80' file.txt

# Find the largest files
du -s * | sort -rn | head -10
```
::
Pipelines chain tools — each command's stdout is the next's stdin. This is the Unix philosophy: small tools, composed.

## 💡 Tips & Tricks

- **Idiom**: use `grep -E` (extended regex) for modern syntax — `grep -E "error|warning|critical"` uses `|` without escaping. Basic `grep` requires `\|`. `grep -E` (or `egrep`) is more readable.
- **Idiom**: use `sed` with a different delimiter for paths — `sed 's|/old/path|/new/path|g'` avoids escaping slashes (`s/\/old/\/new/g` is hard to read). Use `|`, `#`, or `:` when the pattern contains `/`.
- **Idiom**: use `awk` for field-based processing — `awk '{print $1, $3}'` extracts fields, `awk -F',' '{print $1}'` for CSV. `awk` is more powerful than `cut` (conditions, `END { sum }`, `NR`, `NF`).
- **Idiom**: always `sort` before `uniq` — `uniq` only removes *adjacent* duplicates. `sort file | uniq -c | sort -rn` gives a frequency count (most frequent first). The classic pattern for "top N" analysis.
- **Idiom**: compose pipelines — `grep ... | awk ... | sort | uniq -c | sort -rn | head` chains tools (each command's stdout → next's stdin). This is the Unix philosophy: small tools, composed. Prefer pipelines over monolithic scripts.

## ⚠️ Edge Cases & Gotchas

- **`sed -i` modifies files in-place (dangerous)**: always test without `-i` first, or use `sed -i.bak` (creates a backup). On macOS, `sed -i ''` (empty string) is required (BSD sed differs from GNU sed).
- **`uniq` only removes adjacent duplicates**: `uniq` without `sort` first won't dedup non-adjacent lines. Always `sort | uniq`.
- **`sort` is locale-dependent**: `sort` uses the locale's collation (case-insensitive in some locales). Use `LC_ALL=C sort` for byte-order (deterministic, faster).
- **`grep` regex is line-based**: `.` doesn't match newlines. For multi-line patterns, use `grep -z` (null-delimited) or `pcregrep`/`ripgrep`.
- **`awk` field separator**: default is whitespace (any amount). `-F','` for CSV. For multiple separators, `awk -F'[ ,]'` (regex). For CSV with quoted fields, use a proper CSV tool (csvkit, `mlr`).
- **`tr` is character-based, not pattern-based**: `tr 'abc' '123'` replaces a→1, b→2, c→3. It doesn't replace the string "abc". Use `sed` for string/pattern replacement.
- **`cut` can't handle quoted CSV**: `cut -d',' -f1` breaks on fields with commas inside quotes (`"Smith, John"`). Use `awk` with a CSV parser or `csvkit`.
- **`tail -f` blocks**: `tail -f` streams forever. Use in a terminal or with a timeout. In a script, `tail -n +1 -f file | grep -m1 "done"` (stops at first match).
- **macOS sed vs GNU sed**: BSD sed (macOS) differs: `sed -i ''` (not `sed -i`), `sed -E` (not `sed -r`), no `\s`/`\d` by default. Install GNU sed (`brew install gnu-sed`) for consistency, or use `sed -E` (POSIX ERE, works on both).
- **`grep -P` (PCRE) is GNU-only**: `grep -P` (Perl regex) isn't on macOS BSD grep. Use `grep -E` (ERE, portable) or `ripgrep` (`rg`) for advanced regex.

## 🧠 Spot the Bug

A developer tries to dedup lines, but `uniq` doesn't work:

::code-wrapper{language="bash"}
```bash
uniq file.txt > deduped.txt
```
::

The output still has duplicates. Why?

<details>
<summary>Answer</summary>

`uniq` only removes **adjacent** duplicate lines. If the duplicates aren't next to each other (e.g., `apple`, `banana`, `apple`), `uniq` keeps all of them — only consecutive identical lines are deduped.

The fix — `sort` before `uniq` (to group duplicates together):

```bash
sort file.txt | uniq > deduped.txt
```
::
`sort` groups identical lines adjacently, then `uniq` removes the duplicates.

Or, use `sort -u` (sort + dedup in one):

```bash
sort -u file.txt > deduped.txt
```
::
If you need to preserve the original order of first occurrences, use `awk`:

```bash
awk '!seen[$0]++' file.txt > deduped.txt
```
::
This prints each line only the first time it's seen (using an associative array to track seen lines), preserving order.

**The lesson**: `uniq` only removes adjacent duplicates. Always `sort | uniq` (or `sort -u`) to dedup. For order-preserving dedup, `awk '!seen[$0]++'`.

</details>

## Summary

You can use `grep` (search, `-E`/`-i`/`-v`/`-n`/`-c`/`-r`/`-A`/`-B`/`-q`), `sed` (substitute `s/old/new/g`, `-i`, delete, print ranges, alternative delimiters), `awk` (fields `$1`/`$NF`/`NR`, `-F`, `BEGIN`/`END`, conditions), `cut` (fields/chars), `sort`/`uniq` (always sort before uniq), `tr` (character translation), `head`/`tail` (`-f` for follow), `wc`, `paste`/`column`, and compose pipelines — with the `uniq`-needs-sort and macOS-sed traps internalized. Next: file system and I/O.