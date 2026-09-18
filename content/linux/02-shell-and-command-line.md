# 02 — The Shell & Command Line

The shell reads commands, interprets them, and runs programs. On Linux, the default is **Bash** (GNU Bourne Again Shell). This chapter covers the shell as a production interface — redirection mechanics, pipeline concurrency, process lifecycle, and the gotchas that cause silent failures in scripts.

## The Prompt

The default Bash prompt: `user@host:~$`.

- `$` — regular user prompt.
- `#` — root prompt (you're running as root).
- `~` — shorthand for your home directory (`$HOME`).

Customize via `PS1`:

::code-wrapper{language="bash"}
```bash
# Complex Implementation: production-grade PS1 with exit-code awareness
# — shows red prompt when last command failed, includes git branch, no color in pipes
export PS1='\[\033[0;32m\]\u@\h\[\033[0m\]:\[\033[0;34m\]\w\[\033[0m\]'
# \u=user, \h=host, \w=cwd (with ~ for home)
# \[...\] wraps non-printing chars (colors) so readline tracks cursor correctly

# Exit-code-aware prompt (append to PS1):
PROMPT_COMMAND='__rc=$?; if [ $__rc -ne 0 ]; then PS1="${PS1%\\$} [\$?]\\$ "; fi'
```
::

## Commands, Arguments, Options

A command line is split into **words** by whitespace:

::code-wrapper{language="bash"}
```bash
$ ls -la /etc
  └┘ └┘ └─┘
   │  │   └ argument (the directory to list)
   │  └ options (-l long, -a all — combined)
   └ command (program name)
```
::

### `--` Ends Options

`--` tells the shell "everything after this is an argument, not an option." Essential for filenames starting with `-`:

::code-wrapper{language="bash"}
```bash
rm -- -weirdfile          # remove a file named "-weirdfile"
touch -- --strangefile    # create a file named "--strangefile"
grep -- pattern --file    # search for "pattern" in a file named "--file"
```
::

Without `--`, `rm -weirdfile` treats `-w`, `-e`, etc. as options and fails.

## Redirection

Every process has standard streams:

| Stream | Number | Default |
|---|---|---|
| `stdin` | 0 | keyboard |
| `stdout` | 1 | terminal |
| `stderr` | 2 | terminal |

### Redirect Output

::code-wrapper{language="bash"}
```bash
command > file           # stdout → file (overwrite)
command >> file          # stdout → file (append)
command 2> file          # stderr → file (overwrite)
command 2>&1             # stderr → stdout (same destination)
command > file 2>&1      # both stdout and stderr → file
command &> file          # both → file (Bash 4+ shorthand)
command > /dev/null 2>&1 # discard all output
command 2> /dev/null     # discard only errors
```
::

### Caveat & Anti-Pattern: Redirection Order Matters

::code-wrapper{language="bash"}
```bash
# NAIVE: stderr goes to terminal, stdout goes to /dev/null
# — redirections are processed LEFT to RIGHT
# 2>&1 first: point stderr at where stdout CURRENTLY points (terminal)
# > /dev/null second: point stdout at /dev/null
# Result: stderr → terminal, stdout → /dev/null (wrong if you wanted to discard errors)
tar -czf /backup/etc.tar.gz /etc 2>&1 > /dev/null

# PRODUCTION: redirect stdout BEFORE 2>&1
# > /dev/null first: stdout → /dev/null
# 2>&1 second: stderr → wherever stdout now points (/dev/null)
# Result: both → /dev/null (correct)
tar -czf /backup/etc.tar.gz /etc > /dev/null 2>&1
# Or use the Bash 4+ shorthand:
tar -czf /backup/etc.tar.gz /etc &> /dev/null
```
::

The rule: **redirect stdout before `2>&1`**, because `2>&1` duplicates stdout's *current* target.

### Here-Documents and Here-Strings

::code-wrapper{language="bash"}
```bash
# Complex Implementation: generate a config file with variable interpolation
# — here-doc with unquoted delimiter allows expansion; quoted prevents it
cat <<EOF > /tmp/config.conf
host = $HOSTNAME                    # expanded (unquoted EOF)
port = 8080
user = ${USER}
EOF

# Prevent expansion (literal content):
cat <<'EOF' > /tmp/no-expand.conf
home = $HOME                        # literal $HOME (quoted 'EOF')
EOF

# Here-string: feed a string into stdin
grep "root" <<< "root:x:0:0:root:/root:/bin/bash"
```
::

## Pipes

A pipe (`|`) connects one command's `stdout` to another's `stdin`. Each command in a pipeline runs **concurrently** (a separate process):

::code-wrapper{language="bash"}
```bash
# Complex Implementation: frequency-count the top 10 IPs in an access log
# — each stage runs concurrently; data streams through the pipe
awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10
```
::

### Edge Case: Pipelines Hide Intermediate Failures

::code-wrapper{language="bash"}
```bash
# NAIVE: if grep finds no match, it exits 1 — but the pipeline exits 0 (wc's status)
grep "error" /var/log/syslog | wc -l
# echo $? → 0 (wc succeeded, even if grep found nothing)

# PRODUCTION: set -o pipefail makes the pipeline exit on ANY stage failure
set -o pipefail
grep "error" /var/log/syslog | wc -l
# echo $? → 1 (grep failed, pipeline fails)

# Or check PIPESTATUS array (Bash):
grep "error" /var/log/syslog | wc -l
echo "grep exit: ${PIPESTATUS[0]}"  # 1 if no match
echo "wc exit:   ${PIPESTATUS[1]}"  # 0
```
::

### `tee` — Split a Stream

`tee` writes stdin to a file *and* passes it to stdout — like a T-junction:

::code-wrapper{language="bash"}
```bash
# Complex Implementation: capture output to a file AND pipe to grep simultaneously
# — tee needs sudo when writing to root-owned paths (the redirect itself runs as you)
dmesg | tee dmesg-full.log | grep -i error > dmesg-errors.log

# Writing to a root-owned file via redirect fails (redirect runs as YOU, not root):
# NAIVE: sudo echo "config" > /etc/myapp.conf    → Permission denied (the > is yours)
# PRODUCTION:
echo "config" | sudo tee /etc/myapp.conf > /dev/null
```
::

## Job Control

::code-wrapper{language="bash"}
```bash
# Complex Implementation: parallel background jobs with wait + exit-code capture
# — launch 3 jobs, wait for all, report failures
set -e
job1 & pid1=$!
job2 & pid2=$!
job3 & pid3=$!

# Wait for each and check exit codes
wait $pid1 || echo "job1 failed with $?"
wait $pid2 || echo "job2 failed with $?"
wait $pid3 || echo "job3 failed with $?"

# Disown to survive logout:
long-task & disown
# Or use nohup (immune to SIGHUP):
nohup long-task > task.log 2>&1 &
# Best: tmux/screen (reattachable)
```
::

## Command Substitution

`$(...)` runs a command and inserts its output:

::code-wrapper{language="bash"}
```bash
echo "Today is $(date +%A)"
cd "$(dirname "$(realpath script.sh)")"   # go to script's directory (nested $())
files=$(ls /etc/*.conf)                    # capture output in a variable
kill $(pidof nginx)                        # kill all nginx PIDs
```
::

Prefer `$(...)` over backticks `` `...` `` — backticks can't nest cleanly and are deprecated.

## Environment Variables

::code-wrapper{language="bash"}
```bash
FOO="bar"              # shell variable (not exported — children don't see it)
export FOO             # now exported → child processes inherit it
export BAR="baz"       # set and export in one step
env                    # show all environment variables
printenv PATH          # show one variable
unset FOO              # delete a variable
```
::

### `PATH` — How Commands Are Found

::code-wrapper{language="bash"}
```bash
# Complex Implementation: understand the shell's command resolution order
# 1. Shell builtins (cd, echo, export) — checked first
# 2. Functions and aliases — checked next
# 3. Hash table (cached path lookups) — checked next
# 4. $PATH directories — searched left to right

type ls            # shows: alias, builtin, function, or binary path
which ls           # /usr/bin/ls — full path of the first match (external only)
hash               # shell's cache of command → path mappings
hash -r            # clear the hash cache (if you install a new binary in a higher-priority dir)

# Anti-Pattern: putting . (current dir) in PATH
# export PATH=.:$PATH   → if someone puts a malicious `ls` in /tmp, you run it
# Never put . in PATH (historical Unix vulnerability)
```
::

## Exit Status

Every command returns an **exit status** (0–255) to the shell:
- `0` — success.
- non-zero — failure (the specific code is command-specific; 1, 2, 126, 127 are common).

::code-wrapper{language="bash"}
```bash
# Complex Implementation: idiomatic conditional execution with && and ||
mkdir -p /tmp/work && cd /tmp/work      # cd only if mkdir succeeds
test -f /etc/passwd && echo "exists" || echo "missing"
ping -c1 -W1 8.8.8.8 >/dev/null && echo "up" || echo "down"

# Edge case: $? is overwritten by the NEXT command
# NAIVE:
cmd; echo "status: $?"; ls       # by the time you check, ls may have reset $?
# PRODUCTION:
cmd; status=$?; echo "status: $status"; ls
```
::

## `find` — Locating Files

::code-wrapper{language="bash"}
```bash
# Complex Implementation: find + exec with null-delimited safety
# — handles filenames with spaces, newlines, and quotes
find /var/log -type f -name "*.log" -print0 | xargs -0 grep "error"

# Prefer -exec {} + (batches files into fewer invocations, null-safe):
find /var/log -type f -name "*.log" -exec grep "error" {} +

# Time-based search (modified in last 24h):
find /tmp -mtime -1
# Size-based (larger than 100 MB):
find / -size +100M -type f 2>/dev/null
# Permission-based (setuid root — security audit):
find / -perm -4000 -type f 2>/dev/null
```
::

## `tar` — Archives

::code-wrapper{language="bash"}
```bash
# Complex Implementation: stream a tar over SSH (no intermediate file)
# — pipe through SSH, extract on the remote side
tar -czf - /etc | ssh backup-server "tar -xzf - -C /backup"

# Exclude patterns:
tar --exclude="*.log" --exclude="node_modules" -czf app.tar.gz /app

# Edge Case: tar strips leading / by default (safety feature)
# tar -czf backup.tar.gz /etc → stores "etc/..." (no leading /)
# This prevents extracting to / on a different machine and overwriting system files
```
::

## 💡 Tips & Tricks

- **Idiom**: use `mkdir -p` (create parent dirs, no error if exists) — `mkdir -p /a/b/c` creates the whole chain.
- **Idiom**: use `tail -F` (capital) instead of `tail -f` for log watching — `-F` handles log rotation (re-opens if the file is moved/recreated). `-f` stops following if the file is moved.
- **Idiom**: use `head -n 20` / `tail -n 20` to peek at large files — never `cat` a 10 GB log. `less` for interactive paging (press `q` to quit, `/` to search).
- **Performance**: `find ... -exec {} +` is faster than `-exec {} \;` — `+` batches files into fewer command invocations. `xargs -0` is also fast and safe with `-print0`.
- **Debug**: `set -x` in a script prints each command before running it — shows how the shell expands variables and globs. `set +x` turns it off.

## ⚠️ Edge Cases & Gotchas

- **`rm -rf /` is real**: a typo like `rm -rf $VAR/*` with `VAR` unset expands to `rm -rf /*`. Always `set -u` (error on unset variables) in scripts. GNU `rm` has `--preserve-root` (default) that refuses `rm -rf /`, but `/*` bypasses it.
- **`cp` silently overwrites**: `cp bigfile existing` replaces `existing` with no warning. Use `cp -n` (no-clobber) or `cp -i` (interactive) for safety. `cp -a` preserves attributes and is the go-to for backups.
- **`mv` across filesystems is a copy + delete**: within one filesystem, `mv` is instant (just renames the inode entry). Across filesystems (e.g., `/home` → `/mnt/usb`), `mv` copies then deletes — slow for large files, and it fails mid-way if out of space.
- **Globs don't match hidden files by default**: `ls *` doesn't show `.bashrc`. Use `ls -a` or `ls .*` explicitly. `.*` also matches `.` and `..` (dangerous with `rm`); use `rm .[^.]*` to avoid them.
- **Pipelines run concurrently, not sequentially**: `cmd1 | cmd2` starts both at once — `cmd2` can process `cmd1`'s output as it streams. This is why `yes | head -10` works without `yes` running forever (head closes the pipe, yes gets SIGPIPE).
- **`$?` is overwritten by the next command**: `cmd; echo "status: $?"; ls` — by the time you check, `ls` may have reset `$?`. Capture immediately: `cmd; status=$?; ...`.

## 🧠 Spot the Bug

A sysadmin wants to back up `/etc` to a file and discard errors, but this command does nothing useful:

::code-wrapper{language="bash"}
```bash
tar -czf /backup/etc.tar.gz /etc 2>&1 > /dev/null
```
::

What's wrong, and how do you fix it?

<details>
<summary>Answer</summary>

**Order of redirections matters.** Redirections are processed **left to right**:

1. `2>&1` — point `stderr` at where `stdout` *currently* points (the terminal).
2. `> /dev/null` — point `stdout` at `/dev/null`.

So `stderr` ends up at the terminal (it was redirected *before* `stdout` changed), and `stdout` goes to `/dev/null`. The result: you see errors on the terminal, and the archive's normal output (none, but the principle) is discarded. The archive is still created — but the intent was to discard *errors*, and that failed.

To discard both stdout and stderr (or just stderr), the correct order is:

::code-wrapper{language="bash"}
```bash
tar -czf /backup/etc.tar.gz /etc > /dev/null 2>&1   # both → /dev/null
tar -czf /backup/etc.tar.gz /etc 2> /dev/null       # only stderr → /dev/null
tar -czf /backup/etc.tar.gz /etc &> /dev/null       # Bash 4+ shorthand for both
```
::

The rule: **redirect stdout before `2>&1`**, because `2>&1` duplicates stdout's *current* target. `&> file` (Bash 4+) does both in one shot and is clearest.
</details>