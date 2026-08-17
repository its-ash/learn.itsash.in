# 07 — File System & I/O

Bash is built for file system operations. This chapter covers navigation, file operations, permissions, redirection, and safe file handling.

## Navigation

::code-wrapper{language="bash"}
```bash
pwd                  # current directory
cd /path/to/dir      # change directory
cd ~                 # home
cd -                 # previous directory
cd ..                # parent
ls                   # list
ls -l                # long format
ls -a                # all (including hidden)
ls -la               # long + all
ls -lt               # by modification time (newest first)
ls -lh               # human-readable sizes
ls -R                # recursive
```
::
## File Operations

::code-wrapper{language="bash"}
```bash
cp source dest            # copy
cp -r dir dest            # copy recursively
cp -i source dest         # interactive (prompt before overwrite)
mv source dest            # move/rename
mv -i source dest         # interactive
rm file                   # remove
rm -r dir                 # remove recursively
rm -f file                # force (no error if missing)
rm -rf dir                # recursive + force (⚠️ dangerous)
mkdir dir                 # create directory
mkdir -p path/to/dir      # create parents (no error if exists)
touch file.txt            # create empty file / update timestamp
ln -s target linkname     # symbolic link
```
::
### Safe `rm`

`rm -rf` is dangerous (a typo like `rm -rf $var/ *` with empty `$var` → `rm -rf / *`). Mitigations:
- Always quote: `rm -rf "$dir"`.
- Check for empty: `[[ -n "$dir" ]] && rm -rf "$dir"`.
- Use `rm -i` for interactive confirmation.

## Permissions

::code-wrapper{language="bash"}
```bash
chmod 755 file        # rwxr-xr-x (owner: rwx, group: rx, other: rx)
chmod +x file         # add execute
chmod u+x file        # user execute
chmod g-w file        # group remove write
chmod a+r file        # all read
chmod -R 755 dir      # recursive

chown user file       # change owner
chown user:group file # owner + group
chgrp group file      # change group
```
::
### Octal permissions

- 7 = rwx (4+2+1)
- 6 = rw- (4+2)
- 5 = r-x (4+1)
- 4 = r-- (4)
- 0 = ---

So `755` = owner `rwx`, group `r-x`, other `r-x`. `644` = owner `rw-`, group `r--`, other `r--` (typical file). `600` = owner `rw-`, group/other `---` (private file).

## Redirection

### stdout and stderr

::code-wrapper{language="bash"}
```bash
cmd > file            # stdout to file (overwrite)
cmd >> file           # stdout to file (append)
cmd 2> file           # stderr to file
cmd 2>&1              # stderr to stdout
cmd > file 2>&1       # stdout and stderr to file
cmd &> file           # stdout and stderr to file (Bash, preferred)
cmd >> file 2>&1      # append both
cmd 2> /dev/null      # discard stderr
cmd > /dev/null 2>&1  # discard all output
```
::
### File descriptors

- 0 = stdin, 1 = stdout, 2 = stderr.

::code-wrapper{language="bash"}
```bash
cmd 2>&1 | grep "error"   # pipe stderr (and stdout) to grep
```
::
Order matters: `cmd 2>&1 > file` sends stderr to the old stdout (terminal), then stdout to file — stderr still goes to terminal. `cmd > file 2>&1` sends stdout to file, then stderr to the new stdout (file) — both to file.

### stdin redirection

::code-wrapper{language="bash"}
```bash
cmd < file            # file as stdin
cmd <<EOF             # heredoc
line 1
line 2
EOF

cmd <<< "string"      # here-string (single string as stdin)
```
::
### Heredocs

::code-wrapper{language="bash"}
```bash
cat <<EOF
Hello, $USER!
Today is $(date)
EOF

# No expansion (quoted delimiter)
cat <<'EOF'
$USER is literal
EOF
```
::
`<<EOF` — heredoc (multi-line input). `<<'EOF'` (quoted) — no variable expansion. `<<-EOF` — strips leading tabs (for indentation).

## Finding Files

### `find`

::code-wrapper{language="bash"}
```bash
find . -name "*.py"               # by name
find . -iname "*.py"              # case-insensitive
find . -type f                    # files only
find . -type d                    # directories
find . -type f -name "*.log" -delete   # find and delete
find . -mtime -7                  # modified in last 7 days
find . -mmin -60                  # modified in last 60 minutes
find . -size +10M                 # larger than 10MB
find . -empty                     # empty files/dirs
find . -perm 644                  # specific permissions
find . -exec grep -l "pattern" {} +   # grep in each found file
find . -exec chmod 644 {} \;      # run command on each (one per file)
find . -exec chmod 644 {} +       # batch (multiple files per command, faster)
```
::
`-exec ... {} \;` runs the command once per file. `-exec ... {} +` batches (faster). `{}` is the file placeholder.

### Safe `find` with spaces

::code-wrapper{language="bash"}
```bash
# Handle filenames with spaces/newlines
find . -name "*.txt" -print0 | while IFS= read -r -d '' file; do
	echo "Found: $file"
done
```
::
`-print0` separates with null bytes; `read -d ''` reads null-delimited. The only safe way to handle arbitrary filenames.

### `fd` (modern alternative)

::code-wrapper{language="bash"}
```bash
fd "\.py$"            # find .py files (regex by default)
fd -e py              # by extension
fd -H pattern         # include hidden
fd -t f pattern       # files only
```
::
`fd` (install separately) is faster, defaults to regex, respects `.gitignore`. Consider it for interactive use.

## Globbing (recap)

::code-wrapper{language="bash"}
```bash
*.txt               # .txt files
**/*.py             # recursive (shopt -s globstar)
```
::
## `stat` and `file`

::code-wrapper{language="bash"}
```bash
stat file.txt       # file metadata (size, times, permissions)
file file.txt       # file type (text, binary, image, etc.)
```
::
## Disk Usage

::code-wrapper{language="bash"}
```bash
du -sh dir          # total size of dir (human-readable)
du -sh *            # size of each item in current dir
du -sh * | sort -rh # largest first
df -h               # disk space (human-readable)
```
::
## Temp Files

::code-wrapper{language="bash"}
```bash
tmpfile=$(mktemp)                # create a temp file
tmpdir=$(mktemp -d)              # create a temp directory
trap 'rm -f "$tmpfile"; rm -rf "$tmpdir"' EXIT   # cleanup on exit
```
::
**Always use `mktemp`** (not `$RANDOM` or predictable names) and `trap` for cleanup. Avoid `/tmp/myscript.$$` (predictable, symlink attacks).

## 💡 Tips & Tricks

- **Idiom**: use `mktemp` for temp files and `trap ... EXIT` for cleanup — `tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT` creates a unique temp file and removes it on exit (normal or error). Never use predictable names (`/tmp/myscript.$$`) — symlink attack risk.
- **Idiom**: use `find -print0 | while IFS= read -r -d '' file` for filenames with spaces/special chars — `-print0` separates with null bytes (the only safe delimiter); `read -d ''` reads null-delimited. `for f in $(find ...)` breaks on spaces.
- **Idiom**: use `&>` (Bash) to redirect stdout and stderr — `cmd &> file` sends both to a file. `cmd > file 2>&1` is the POSIX form (works in `sh`). Order matters: `2>&1 > file` is wrong (stderr goes to old stdout).
- **Idiom**: use `mkdir -p` (no error if exists) — `mkdir -p path/to/dir` creates all parents and doesn't fail if the dir exists. Cleaner than `[[ -d dir ]] || mkdir dir`.
- **Idiom**: quote `rm -rf "$dir"` and check for empty — `rm -rf $var/ *` with empty `$var` becomes `rm -rf / *` (catastrophic). Always quote, and check `[[ -n "$dir" ]]` before destructive commands.

## ⚠️ Edge Cases & Gotchas

- **`rm -rf $var` with empty `$var`**: `rm -rf /some/path` — if `$var` is empty and unquoted, `rm -rf /some/path/ *` (deletes everything in `/some/path`). Always quote `"$var"` and check `[[ -n "$var" ]]`.
- **`cmd 2>&1 > file` is wrong**: this sends stderr to the *old* stdout (terminal), then stdout to the file — stderr still goes to the terminal. Use `cmd > file 2>&1` or `cmd &> file` (stderr to the new stdout = file).
- **`find -exec ... {} \;` vs `+`**: `\;` runs the command once per file (slow for many files); `+` batches (faster). Use `+` when the command accepts multiple files (`grep`, `chmod`).
- **Parsing `ls` is fragile**: `ls` escapes special characters inconsistently. Use `find` or globs instead. `for f in *.txt` is safe (glob expansion); `for f in $(ls)` is not.
- **`cp`/`mv` overwrite without warning**: `cp src dst` overwrites `dst` silently. Use `cp -i` (interactive) for safety, or `cp -n` (no overwrite).
- **macOS `cp`/`mv` differ from GNU**: BSD `cp` doesn't have some GNU options (`--backup`). Check `man cp` on your system. Install GNU coreutils (`brew install coreutils`) for `gcp` etc.
- **`mktemp` templates differ**: `mktemp` (GNU) vs `mktemp` (BSD/macOS) have different template syntax. `mktemp` (no args) works on both (creates a uniquely-named file in `$TMPDIR`).
- **`trap EXIT` runs on any exit**: including `exit`, end of script, `set -e` abort, and signals (if trapped). It runs in the exiting shell. Multiple `trap EXIT` overwrite (last one wins); combine cleanup in one function.
- **Heredoc `<<-EOF` strips tabs only (not spaces)**: `<<-` allows indented heredocs, but only leading *tabs* are stripped, not spaces. Configure your editor to use tabs for the heredoc indentation.
- **`du` and `df` on network filesystems**: sizes can be off (block sizes, sparse files). Use `du -b` (bytes) or `stat -c %s file` (exact bytes) for precision.

## 🧠 Spot the Bug

A developer redirects stderr to a file, but errors still appear in the terminal:

::code-wrapper{language="bash"}
```bash
cmd 2>&1 > output.txt
```
::

What's wrong?

<details>
<summary>Answer</summary>

The order of redirections matters. `cmd 2>&1 > output.txt`:
1. `2>&1` — stderr (fd 2) is redirected to where stdout (fd 1) *currently* points (the terminal).
2. `> output.txt` — stdout (fd 1) is redirected to `output.txt`.

So stderr goes to the terminal (it was redirected *before* stdout changed), and stdout goes to the file. Errors still appear in the terminal.

The fix — redirect stdout first, then stderr:

```bash
cmd > output.txt 2>&1   # stdout to file, then stderr to the new stdout (file)
```
::
Or use Bash's `&>`:

```bash
cmd &> output.txt   # both stdout and stderr to file (Bash shorthand)
```
::
Now:
1. `> output.txt` — stdout (fd 1) → file.
2. `2>&1` — stderr (fd 2) → the current stdout (fd 1), which is now the file.

Both go to the file.

**The lesson**: redirections are processed left-to-right. `2>&1 > file` makes stderr go to the *old* stdout (terminal) before stdout is redirected. `> file 2>&1` (or `&> file`) redirects stdout first, then stderr follows it to the file. Order matters.

</details>

## Summary

You can navigate (`pwd`/`cd`/`ls`), manipulate files (`cp`/`mv`/`rm`/`mkdir`/`touch`/`ln`), manage permissions (`chmod` octal/symbolic, `chown`), redirect (`>`, `>>`, `2>`, `2>&1`, `&>`, `<`, heredocs, here-strings), find files (`find` with `-name`/`-type`/`-mtime`/`-exec`/`-print0`, `fd`), use `du`/`df`/`stat`/`file`, and create safe temp files (`mktemp` + `trap`) — with the redirection-order and `rm`-empty-var traps internalized. Next: processes and signals.