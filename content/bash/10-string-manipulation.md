# 10 — String Manipulation

Bash has powerful string operations via parameter expansion — often replacing `sed`/`awk` for simple cases.

## Length

::code-wrapper{language="bash"}
```bash
str="hello world"
echo "${#str}"   # 11 (length)
```
::
## Substring

::code-wrapper{language="bash"}
```bash
str="hello world"
echo "${str:0:5}"    # hello (from 0, 5 chars)
echo "${str:6}"      # world (from 6 to end)
echo "${str: -5}"    # world (last 5 — note the space before -)
echo "${str:1:3}"    # ell (from 1, 3 chars)
```
::
`${var:offset:length}` — substring from `offset`, `length` chars. If `length` omitted, to the end. Negative `offset` counts from the end (space before `-` to avoid default-expansion parsing).

## Replace

::code-wrapper{language="bash"}
```bash
str="hello world"
echo "${str/world/WORLD}"   # hello WORLD (first match)
echo "${str//l/L}"          # heLLo worLd (all matches)
echo "${str/#hello/HELLO}"  # HELLO world (prefix only)
echo "${str/%world/WORLD}"  # hello WORLD (suffix only)
```
::
- `${var/pattern/replacement}` — replace first match.
- `${var//pattern/replacement}` — replace all matches.
- `${var/#pattern/repl}` — only if at the start.
- `${var/%pattern/repl}` — only if at the end.

Patterns are globs (`*`, `?`, `[...]`), not regex.

## Delete (trim)

::code-wrapper{language="bash"}
```bash
str="hello world"
echo "${str#hello}"     # " world" (remove shortest prefix)
echo "${str##*l}"       # d (remove longest prefix ending in l)
echo "${str%world}"     # hello  (remove shortest suffix)
echo "${str%%l*}"       # he (remove longest suffix starting with l)

# Trim whitespace
str="  hello  "
echo "${str#"${str%%[![:space:]]*}"}"   # "hello  " (leading)
echo "${str%"${str##*[![:space:]]}"}"   # "  hello" (trailing)
```
::
- `${var#pattern}` — remove shortest prefix.
- `${var##pattern}` — remove longest prefix.
- `${var%pattern}` — remove shortest suffix.
- `${var%%pattern}` — remove longest suffix.

Classic use: extracting filename/extension:

::code-wrapper{language="bash"}
```bash
file="/path/to/file.tar.gz"
echo "${file##*/}"     # file.tar.gz (basename — longest prefix up to /)
echo "${file%/*}"      # /path/to (dirname — shortest suffix from /)
echo "${file%.gz}"     # /path/to/file.tar (remove .gz extension)
echo "${file%.*}"      # /path/to/file.tar (remove last extension)
echo "${file%%.*}"     # /path/to/file (remove all extensions)
```
::
## Case Conversion (Bash 4+)

::code-wrapper{language="bash"}
```bash
str="Hello World"
echo "${str^}"    # Hello world (first char uppercase)
echo "${str^^}"   # HELLO WORLD (all uppercase)
echo "${str,}"    # hello World (first char lowercase)
echo "${str,,}"   # hello world (all lowercase)
echo "${str~~}"   # hELLO wORLD (toggle case)

# Specific chars
echo "${str^^[aeiou]}"   # hEllO wOrld (uppercase vowels only)
```
::
## Default Values (recap)

::code-wrapper{language="bash"}
```bash
echo "${var:-default}"    # "default" if var unset/empty (doesn't assign)
echo "${var-default}"     # "default" if var unset (allows empty)
echo "${var:=default}"    # "default" and assigns to var
echo "${var:?error msg}"  # error and exit if unset/empty
echo "${var:+set}"        # "set" if var is non-empty, else empty
```
::
## Splitting

::code-wrapper{language="bash"}
```bash
# Split into an array (see chapter 09)
str="a,b,c,d"
IFS=',' read -ra arr <<< "$str"
echo "${arr[@]}"   # a b c d
echo "${arr[2]}"   # c

# Split into variables
IFS=',' read -r first second third <<< "a,b,c"
echo "$first $second $third"   # a b c
```
::
## Joining

::code-wrapper{language="bash"}
```bash
arr=("apple" "banana" "cherry")

# Join with a space (default IFS)
joined="${arr[*]}"
echo "$joined"   # apple banana cherry

# Join with a custom delimiter
join_by() {
	local d=$1; shift
	local f=$1; shift
	local s=$f
	for x in "$@"; do
		s="$s$d$x"
	done
	echo "$s"
}

join_by ", " "${arr[@]}"   # apple, banana, cherry
```
::
Bash has no built-in join — write a function or use `IFS`:

::code-wrapper{language="bash"}
```bash
arr=("a" "b" "c")
oldIFS=$IFS
IFS=','
joined="${arr[*]}"
IFS=$oldIFS
echo "$joined"   # a,b,c
```
::
## Comparison

::code-wrapper{language="bash"}
```bash
[[ "$a" == "$b" ]]    # equal
[[ "$a" != "$b" ]]    # not equal
[[ "$a" < "$b" ]]     # less than (lexicographic)
[[ "$a" > "$b" ]]     # greater than
[[ -z "$a" ]]         # empty
[[ -n "$a" ]]         # non-empty
```
::
## Pattern Matching (regex)

::code-wrapper{language="bash"}
```bash
str="user@example.com"
if [[ $str =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
	echo "valid email"
fi

# Capture groups
str="2024-01-15"
if [[ $str =~ ^([0-9]{4})-([0-9]{2})-([0-9]{2})$ ]]; then
	echo "Year: ${BASH_REMATCH[1]}"
	echo "Month: ${BASH_REMATCH[2]}"
	echo "Day: ${BASH_REMATCH[3]}"
fi
```
::
`[[ $str =~ regex ]]` — extended regex. `BASH_REMATCH` is an array: `[0]` is the full match, `[1]`/`[2]` are groups. Don't quote the regex (quoting makes it literal).

## `printf` for Formatting

::code-wrapper{language="bash"}
```bash
printf "%s is %d years old\n" "Alice" 30
printf "%-10s | %5d\n" "Item" 42
printf "%x\n" 255      # ff (hex)
printf "%o\n" 8        # 10 (octal)
printf "%.2f\n" 3.14159   # 3.14 (2 decimals)
```
::
## 💡 Tips & Tricks

- **Idiom**: use parameter expansion over `sed`/`awk` for simple string ops — `${str:0:5}` (substring), `${str//old/new}` (replace), `${str##*/}` (basename), `${str%.txt}` (remove extension), `${#str}` (length). Faster (no subprocess) and safer (no regex pitfalls).
- **Idiom**: use `${var:-default}` for defaults — `${1:-World}` uses the first arg or "World" if unset/empty. Cleaner than `if [ -z "$var" ]; then var=default; fi`. Variants: `:-` (unset/empty), `:=` (assign default), `:?` (error if unset).
- **Idiom**: use `${file##*/}` (basename) and `${file%/*}` (dirname) — avoids `basename`/`dirname` subprocesses. `${file##*/}` removes the longest prefix up to `/` (basename); `${file%/*}` removes the shortest suffix from `/` (dirname).
- **Idiom**: use `[[ =~ ]]` for regex with `BASH_REMATCH` for captures — `[[ $str =~ ^([0-9]+)-([0-9]+)$ ]]; echo ${BASH_REMATCH[1]}`. Don't quote the regex. Store in a variable (`re="..."; [[ $str =~ $re ]]`) for readability.
- **Idiom**: use `printf` over `echo` for formatted output — `printf "%-10s %5d\n" "$name" "$count"` formats reliably (left-align, pad). `echo`'s `-e`/`-n` vary between shells; `printf` is consistent.

## ⚠️ Edge Cases & Gotchas

- **`${str: -5}` (negative offset) needs a space before `-`**: `${str:-5}` is a default expansion (use `5` if `str` is unset). `${str: -5}` (space) is "last 5 chars." Or use `${str:0-5}`.
- **`${var/pattern/repl}` patterns are globs, not regex**: `*`, `?`, `[...]`. For regex, use `[[ =~ ]]` or `sed`/`grep -E`.
- **`${str##*/}` (basename) on a path without `/`**: `"file.txt"##*/` returns `"file.txt"` (no `/` to remove). Edge case, but correct.
- **Case conversion is Bash 4+**: `${str^^}`, `${str,,}` don't work in Bash 3.2 (macOS default). Use `tr 'a-z' 'A-Z'` for portability.
- **`[[ =~ ]]` regex shouldn't be quoted**: `[[ $str =~ "^[0-9]+$" ]]` matches the literal string `^[0-9]+$`. Use `[[ $str =~ ^[0-9]+$ ]]` (unquoted) or store in a variable (`re="^[0-9]+$"; [[ $str =~ $re ]]`).
- **`BASH_REMATCH` is overwritten by each `[[ =~ ]]`**: each regex match resets `BASH_REMATCH`. Capture the values before the next match.
- **`IFS=',' read -ra arr <<< "$str"` in a subshell**: `read` in a pipeline runs in a subshell — `arr` is lost. Use `<<<` (here-string) to avoid the subshell.
- **Lexicographic comparison**: `[[ "10" < "9" ]]` is true (string comparison, "1" < "9"). For numeric comparison, use `(( 10 < 9 ))` (false).
- **`${var:?msg}` exits the script**: if `var` is unset/empty, it prints `msg` to stderr and exits. Useful for mandatory args, but unconditional (can't be caught easily).
- **`printf` doesn't add a newline**: `printf "%s" "hi"` prints `hi` (no newline). Use `\n` explicitly. `echo` adds a newline by default.

## 🧠 Spot the Bug

A developer extracts the extension from a filename, but it fails on `.tar.gz`:

::code-wrapper{language="bash"}
```bash
file="archive.tar.gz"
ext="${file##*.}"
echo "$ext"   # gz (wanted .tar.gz or gz?)
```
::
And for the basename:

::code-wrapper{language="bash"}
```bash
file="archive.tar.gz"
base="${file%.*}"
echo "$base"   # archive.tar (wanted archive?)
```
::

What's the issue?

<details>
<summary>Answer</summary>

This isn't strictly a bug — it depends on what you want:

- `${file##*.}` removes the longest prefix up to the last `.` — gives `gz` (the last extension only).
- `${file%.*}` removes the shortest suffix from the last `.` — gives `archive.tar` (removes only `.gz`).

If you want to remove *all* extensions (get `archive`), use `%%` (longest suffix):

```bash
file="archive.tar.gz"
base="${file%%.*}"   # archive (removes .tar.gz)
echo "$base"

ext="${file#*.}"     # tar.gz (removes the first extension prefix)
echo "$ext"
```
::
- `${file%%.*}` — removes the longest suffix starting with `.` → `archive`.
- `${file#*.}` — removes the shortest prefix up to the first `.` → `tar.gz`.

For a single extension (like `.txt`), `${file%.*}` and `${file%%.*}` give the same result. For multiple extensions (`.tar.gz`), they differ — `%` removes one, `%%` removes all.

**The lesson**: `%`/`#` (shortest) vs `%%`/`##` (longest) differ for multi-part extensions. `${file%.*}` removes one extension (`.gz`), `${file%%.*}` removes all (`.tar.gz`). Know which you want — `%` for one, `%%` for all.

</details>

## Summary

You can use parameter expansion for length (`${#str}`), substring (`${str:0:5}`, `${str: -5}`), replace (`${str//old/new}`, `${str/#old/new}`), delete/trim (`${str##*/}`, `${str%.*}`, `${str%%.*}`), case conversion (`${str^^}`, `${str,,}`), defaults (`${var:-default}`, `${var:?err}`), splitting (`IFS=',' read -ra`), regex (`[[ =~ ]]`, `BASH_REMATCH`), and `printf` formatting — with the negative-offset-space and `%`-vs-`%%` traps internalized. Next: command-line arguments and parsing.