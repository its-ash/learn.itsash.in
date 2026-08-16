# 03 — Operators & Expansions

Bash has arithmetic, string, test (`[...]/[[...]]`), command substitution, process substitution, and brace expansion. Understanding each is key to writing correct scripts.

## Arithmetic

### `((...))` (arithmetic evaluation)

::code-wrapper{language="bash"}
```bash
x=5
((x = x + 3))    # x is 8
((x++))          # 9 (postfix increment)
((x--))          # 8
((x *= 2))       # 16

# Comparison (returns exit status)
((x > 10)) && echo "big"     # big (true)
((x < 10)) || echo "not big" # not big (false)

# No $ needed inside ((...))
y=3
((result = x + y))   # result = 16 + 3 = 19
```

`((...))` evaluates arithmetic. Variables don't need `$` inside. It returns exit status 0 (true) if the result is non-zero, 1 (false) if zero. Use for all integer math.

### `$((...))` (arithmetic expansion)

::code-wrapper{language="bash"}
```bash
x=5
echo "$((x * 2))"      # 10
result=$((x ** 2))     # 25 (exponentiation)
echo "$((17 % 5))"     # 2 (modulo)
echo "$((17 / 5))"     # 3 (integer division, truncated)
echo "$((-5 / 2))"     # -2 (truncates toward zero, not floor)
```

`$((...))` expands to the result (you can use it in a command). Integer division truncates toward zero. `**` is exponentiation.

### Operators

`+` `-` `*` `/` `%` `**` (arithmetic), `++` `--` (increment/decrement), `<<` `>>` (bitwise shift), `&` `|` `^` `~` (bitwise), `&&` `||` (logical, inside `((...))`), `<` `>` `<=` `>=` `==` `!=` (comparison).

## String Operations (Parameter Expansion)

(See chapter 02 for the full list.)

::code-wrapper{language="bash"}
```bash
name="Alice"
echo "${#name}"           # 5 (length)
echo "${name:0:3}"        # Ali (substring)
echo "${name/Alice/Bob}"  # Bob (replace first)
echo "${name//i/I}"       # AlIce (replace all)
echo "${name^^}"          # ALICE (uppercase, Bash 4+)
```

## Test (`[...]/[[...]]`)

### `[... ]` (POSIX `test`)

::code-wrapper{language="bash"}
```bash
if [ "$x" -gt 5 ]; then echo "big"; fi
if [ -f "file.txt" ]; then echo "exists"; fi
if [ "$str" = "hello" ]; then echo "match"; fi
if [ -z "$var" ]; then echo "empty"; fi
```

### `[[... ]]` (Bash extension — preferred)

::code-wrapper{language="bash"}
```bash
if [[ $x -gt 5 ]]; then echo "big"; fi
if [[ -f "file.txt" ]]; then echo "exists"; fi
if [[ $str == "hello" ]]; then echo "match"; fi
if [[ $str == h* ]]; then echo "starts with h"; fi   # pattern matching (no regex)
if [[ $str =~ ^[0-9]+$ ]]; then echo "digits only"; fi  # regex
if [[ -z $var ]]; then echo "empty"; fi
```

`[[... ]]` is safer and more powerful than `[... ]`:
- No word-splitting/globbing (no need to quote `$x`).
- `==` and `=` are equivalent (use `==` for clarity).
- Supports pattern matching (`h*`) and regex (`=~`).
- `&&`/`||` inside (instead of `-a`/`-o`).

**Always prefer `[[... ]]` in Bash scripts.**

### File tests

| Test | True if |
|---|---|
| `-e file` | file exists. |
| `-f file` | exists and is a regular file. |
| `-d file` | exists and is a directory. |
| `-r file` | readable. |
| `-w file` | writable. |
| `-x file` | executable. |
| `-s file` | exists and is not empty. |
| `file1 -nt file2` | file1 is newer than file2. |
| `file1 -ot file2` | file1 is older than file2. |

### String tests

| Test | True if |
|---|---|
| `-z str` | string is empty. |
| `-n str` | string is not empty. |
| `str1 == str2` | strings are equal. |
| `str1 != str2` | not equal. |
| `str1 < str2` | str1 sorts before str2 (lexicographic). |

### Integer tests

| Test | True if |
|---|---|
| `n1 -eq n2` | equal. |
| `n1 -ne n2` | not equal. |
| `n1 -lt n2` | less than. |
| `n1 -le n2` | less or equal. |
| `n1 -gt n2` | greater than. |
| `n1 -ge n2` | greater or equal. |

## Command Substitution `$(...)`

::code-wrapper{language="bash"}
```bash
current_dir=$(pwd)
file_count=$(ls | wc -l)
echo "Today is $(date +%Y-%m-%d)"
```

`$(...)` runs a command and substitutes its output. Preferred over backticks `` `...` `` (nestable, readable).

## Process Substitution `<(...) >(...)`

::code-wrapper{language="bash"}
```bash
# Diff two command outputs without temp files
diff <(sort file1.txt) <(sort file2.txt)

# Read from a process as a file
while read line; do
	echo "$line"
done < <(grep "error" log.txt)
```

`<(...)` creates a temporary file descriptor for a command's output. `>(...)` for input. Avoids temp files.

## Brace Expansion

::code-wrapper{language="bash"}
```bash
echo {1..5}              # 1 2 3 4 5
echo {a..e}              # a b c d e
echo file{1..3}.txt      # file1.txt file2.txt file3.txt
echo {foo,bar,baz}       # foo bar baz
mkdir -p project/{src,lib,test}   # creates project/src, project/lib, project/test
```

Brace expansion generates strings — ranges (`{1..5}`), lists (`{a,b,c}`), prefixes/suffixes. Expanded *before* other expansions (doesn't require files to exist, unlike globs).

## Tilde Expansion

::code-wrapper{language="bash"}
```bash
echo ~           # /home/user (home directory)
echo ~root       # /root (root's home)
cd ~/Documents   # home/Documents
```

## Globbing (Filename Expansion)

::code-wrapper{language="bash"}
```bash
*.txt           # all .txt files
*.log           # all .log files
file?.txt       # file1.txt, fileA.txt (single char)
file[0-9].txt   # file0.txt … file9.txt (char class)
**/*.py         # recursive (with shopt -s globstar)
```

::code-wrapper{language="bash"}
```bash
shopt -s globstar   # enable ** for recursive
echo **/*.py        # all .py files, recursively
```

If no files match, the glob is passed literally (unless `nullglob` is set):

::code-wrapper{language="bash"}
```bash
shopt -s nullglob   # no match → empty (not literal)
```

## 💡 Tips & Tricks

- **Idiom**: use `((...))` for arithmetic (not `expr` or `[... ]` with `-eq`) — `((x++))` and `((x > 5))` are clear, fast (no subprocess), and Bash-native. `$((...))` expands the result for use in a command.
- **Idiom**: use `[[... ]]` (not `[... ]`) for tests — `[[ ]]` is safer (no word-splitting, no quoting needed), supports pattern matching (`$str == h*`) and regex (`$str =~ ^[0-9]+$`), and uses `&&`/`||` inside. Reserve `[... ]` for POSIX `sh`.
- **Idiom**: use `$(...)` (not backticks) for command substitution — `$(...)` is nestable (`$(echo $(date))`) and readable. Backticks are hard to nest and easy to misread.
- **Idiom**: use brace expansion for generating lists — `mkdir -p project/{src,lib,test}` creates 3 dirs; `echo file{1..3}.txt` generates filenames. Expanded before other expansions (doesn't need files to exist, unlike globs).
- **Idiom**: use `shopt -s globstar` for recursive globs (`**/*.py`) and `shopt -s nullglob` to make non-matching globs empty (not literal) — avoids bugs where `*.txt` is passed literally if no `.txt` files exist.

## ⚠️ Edge Cases & Gotchas

- **Integer division truncates toward zero**: `(-5 / 2) = -2` (not -3). For floor division of negatives, adjust manually.
- **`[[... ]]` is Bash-only**: `[[ ]]` doesn't work in POSIX `sh`. Use `[... ]` (with careful quoting) for portable scripts.
- **`==` vs `=` in `[... ]`**: in `[[ ]]`, both work. In `[... ]` (POSIX), only `=` is standard (though `==` works in most shells). Use `=` in `[... ]` for portability.
- **Regex in `[[ =~ ]]`**: the regex should *not* be quoted (quoting makes it a literal string). Store in a variable: `re="^[0-9]+$"; [[ $str =~ $re ]]`. `BASH_REMATCH` holds the match.
- **`<(...)` process substitution is Bash-only**: doesn't work in POSIX `sh`. Useful for avoiding temp files (`diff <(sort a) <(sort b)`).
- **Globs pass literally if no match**: `*.txt` with no `.txt` files passes the literal string `*.txt` to the command. `shopt -s nullglob` makes it empty.
- **Brace expansion happens before globbing**: `file{1..3}.txt` expands to `file1.txt file2.txt file3.txt`, then each is glob-expanded (if they exist). Brace expansion alone doesn't require files to exist.
- **`(( ))` returns exit status**: `((x > 5))` is a command (exit status 0 if true). `((x = 5))` is an assignment (exit status 1 if the result is 0, 0 if non-zero — surprising). Use `((x = 5)) || true` to avoid `set -e` exit if x is 0.
- **`[... ]` spacing**: `[ $x -gt 5 ]` — missing spaces around `[` and `]` is a syntax error. `[` is a command (alias for `test`); it needs spaces.
- **`test` with empty variables**: `[ $x = "foo" ]` with `x=""` becomes `[ = "foo" ]` (syntax error). Always quote: `[ "$x" = "foo" ]` or use `[[ ]]`.

## 🧠 Spot the Bug

A developer checks if a variable equals a string, but it fails when the variable is empty:

::code-wrapper{language="bash"}
```bash
x=""
if [ $x = "hello" ]; then
	echo "match"
fi
```
::

What's wrong?

<details>
<summary>Answer</summary>

When `x=""` (empty), `[ $x = "hello" ]` (unquoted `$x`) expands to `[ = "hello" ]` — the `[` command sees `=` as its first argument, which is a syntax error: `bash: [: =: unary operator expected`.

The fix — quote the variable (or use `[[ ]]`):

```bash
# Option 1: quote
if [ "$x" = "hello" ]; then
	echo "match"
fi
# "$x" expands to "" (empty string), so [ "" = "hello" ] — valid, false.

# Option 2: use [[ ]] (safer, no quoting needed)
if [[ $x == "hello" ]]; then
	echo "match"
fi
```

With quotes, `"$x"` becomes an empty string `""`, so `[ "" = "hello" ]` is a valid test (false). With `[[ ]]`, word-splitting doesn't happen, so `$x` (empty) is safe without quotes.

**The lesson**: in `[... ]` (POSIX test), always quote variables: `"$x"`. An unquoted empty variable disappears, causing syntax errors (`[ = "hello" ]`). `[[... ]]` (Bash) is safer — no word-splitting, no quoting required. Prefer `[[ ]]` in Bash scripts.

</details>

## Summary

You can use arithmetic (`((...))` for evaluation, `$((...))` for expansion, `**`/`%`/`<<`), tests (`[[... ]]` preferred, file/string/integer tests, regex `=~`), command substitution (`$(...)`), process substitution (`<(...)`), brace expansion (`{1..5}`, `{a,b,c}`), tilde (`~`), and globs (`*`, `?`, `[0-9]`, `**` with `globstar`) — with the `[[`-over-`[` and empty-variable trap internalized. Next: control flow.