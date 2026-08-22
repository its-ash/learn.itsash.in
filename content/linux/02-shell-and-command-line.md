# 02 — The Shell & Command Line

The **shell** is the program that reads your commands, interprets them, and runs other programs. On Linux, the default shell is almost always **Bash** (GNU Bourne Again Shell). This chapter covers the shell fundamentals you need for the rest of the book — the command line is your primary interface to Linux.

> See the [Bash curriculum](/bash) for a deep dive on Bash scripting. This chapter is a Linux-user-focused subset.

## The Prompt

The default Bash prompt looks like `user@host:~$`. Breakdown:

```text
user@host:~/projects$ _
└──┘└──┘└─────────┘ └ current cursor
 │    │     └ current directory (~ = home)
 │    └ hostname
 └ username
```

- `$` — regular user prompt.
- `#` — root prompt (you're running as root).
- `~` — shorthand for your home directory (`$HOME`).

Customize via the `PS1` variable:

::code-wrapper{language="bash"}
```bash
export PS1='\[\e[32m\]\u@\h\[\e[0m\]:\[\e[34m\]\w\[\e[0m\$ '
# \u = user, \h = host, \w = cwd, \[...\] = non-printing (colors)
```
::

## Commands, Arguments, Options

A command line is split into **words** by whitespace:

```text
$ ls -la /etc
  └┘ └┘ └─┘
   │  │   └ argument (the directory to list)
   │  └ options (-l long, -a all — combined)
   └ command (program name)
```

- **Command** — the program to run (`ls`, `grep`, `systemctl`).
- **Options** — modify behavior; start with `-` (short) or `--` (long).
- **Arguments** — what the command acts on (files, patterns, etc.).

::code-wrapper{language="bash"}
```bash
ls -l -a /etc         # separate short options
ls -la /etc           # combined short options (same thing)
ls --all --human-readable /etc   # long options
ls -lhS /etc          # -l long, -h human sizes, -S sort by size
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

## The Core Utilities (`coreutils`)

GNU coreutils are the everyday commands. Know them cold:

| Category | Commands |
|---|---|
| Files | `ls`, `cp`, `mv`, `rm`, `ln`, `touch`, `mkdir`, `rmdir` |
| Viewing | `cat`, `less`, `head`, `tail`, `wc`, `od`, `stat` |
| Searching | `find`, `grep`, `locate`, `which`, `file` |
| Text | `cut`, `sort`, `uniq`, `tr`, `paste`, `column`, `expand` |
| Compare | `diff`, `cmp`, `comm` |
| Permissions | `chmod`, `chown`, `chgrp`, `umask` |
| Identity | `id`, `whoami`, `who`, `w`, `hostname`, `uname` |
| Time | `date`, `cal`, `time`, `sleep` |
| Misc | `echo`, `printf`, `env`, `printenv`, `test`, `true`, `false` |

### `ls` in Depth

::code-wrapper{language="bash"}
```bash
ls              # list (non-hidden)
ls -a           # all (including . and ..)
ls -A           # almost all (no . and ..)
ls -l           # long format (permissions, owner, size, date)
ls -lh          # long + human-readable sizes (K, M, G)
ls -lt          # sort by modification time (newest first)
ls -ltr         # reverse (oldest first)
ls -lS          # sort by size (largest first)
ls -li          # show inode numbers
ls -R           # recursive
ls -d */        # list directories only (in cwd)
ls -1           # one per line (for scripting)
ls --color=auto # colored output (default in most distros)
```
::

### `stat` — File Metadata

::code-wrapper{language="bash"}
```bash
stat /etc/passwd
#   File: /etc/passwd
#   Size: 3218      	Blocks: 8          IO Block: 4096   regular file
# Device: 801h/2049d	Inode: 12345       Links: 1
# Access: (0644/-rw-r--r--)  Uid: (0/root)   Gid: (0/root)
# Access: 2026-08-20 ...  Modify: 2026-06-15 ...
# Change: 2026-06-15 ...   Birth: 2026-06-15 ...
```
::
- **Inode** — the filesystem's internal ID for the file.
- **Links** — hard link count (see chapter 04).
- **Modify** — content last changed. **Change** — metadata last changed. **Access** — last read.

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

### Redirect Input

::code-wrapper{language="bash"}
```bash
command < file           # stdin ← file
grep "error" < /var/log/syslog
wc -l < /etc/passwd      # count lines in passwd
```
::

### Here-Documents and Here-Strings

::code-wrapper{language="bash"}
```bash
# Here-doc: feed multiple lines into a command
cat <<EOF > /tmp/config.conf
host = localhost
port = 8080
EOF

# Here-string: feed a string into stdin
grep "root" <<< "root:x:0:0:root:/root:/bin/bash"
```
::

## Pipes

A pipe (`|`) connects one command's `stdout` to another's `stdin`:

```text
$ ls /etc | grep "conf" | wc -l
  ls ─stdout─┐   ┌stdin─ grep ─stdout─┐   ┌stdin─ wc
             └──>┘                    └──>┘
```

::code-wrapper{language="bash"}
```bash
ps aux | grep nginx | wc -l          # how many nginx processes
journalctl -u ssh | tail -20         # last 20 ssh log lines
find /var/log -name "*.log" | xargs grep "error"   # search many files
```
::

- Each command in a pipeline runs **concurrently** (a separate process).
- Pipes only carry `stdout`; `stderr` goes to the terminal unless redirected.
- The **exit status** of a pipeline is the last command's (unless `set -o pipefail`).

### `tee` — Split a Stream

`tee` writes stdin to a file *and* passes it to stdout — like a T-junction in plumbing:

::code-wrapper{language="bash"}
```bash
ls /etc | tee /tmp/etc-list.txt | grep "conf"
# /etc-list.txt gets the full ls output; grep sees it too

dmesg | tee dmesg-full.log | grep -i error > dmesg-errors.log
```
::

## Job Control

You can run multiple processes from one shell:

::code-wrapper{language="bash"}
```bash
sleep 100 &             # run in background (job 1)
sleep 200 &             # background (job 2)
jobs                    # list background jobs
fg %1                   # bring job 1 to foreground
Ctrl+Z                  # suspend foreground job → background (stopped)
bg                      # resume the stopped job in background
kill %2                 # terminate job 2
wait                    # wait for all background jobs to finish
```
::

- `&` — run in background (returns immediately, prints job number/PID).
- `Ctrl+Z` — suspend (SIGSTOP) the foreground process.
- `Ctrl+C` — interrupt (SIGINT) the foreground process.
- `Ctrl+D` — send EOF (end of input) to the foreground process.

### Disown and `nohup`

Background jobs die when the shell exits. To survive:

::code-wrapper{language="bash"}
```bash
long-task & disown              # detach from shell (survives logout)
nohup long-task &               # immune to SIGHUP (survives logout)
nohup long-task > task.log 2>&1 &   # redirect output too
```
::

## Command Substitution

`$(...)` runs a command and inserts its output:

::code-wrapper{language="bash"}
```bash
echo "Today is $(date +%A)"
cd $(dirname $(realpath script.sh))   # go to script's directory
files=$(ls /etc/*.conf)               # capture output in a variable
kill $(pidof nginx)                   # kill all nginx PIDs
```
::
Prefer `$(...)` over backticks `` `...` `` — backticks can't nest cleanly and are deprecated.

## Environment Variables

Variables come in two kinds:
- **Shell variables** — exist only in the current shell (not passed to children).
- **Environment variables** — exported, inherited by child processes.

::code-wrapper{language="bash"}
```bash
FOO="bar"              # shell variable (not exported)
export FOO             # now exported → children see it
export BAR="baz"       # set and export in one step
env                    # show all environment variables
printenv PATH          # show one variable
echo $PATH             # expand one variable
unset FOO              # delete a variable
```
::

### Key Variables

| Variable | Meaning |
|---|---|
| `PATH` | Directories searched for commands (colon-separated) |
| `HOME` | Your home directory (`~` expands to this) |
| `USER` | Your username |
| `SHELL` | Your login shell |
| `PWD` | Current working directory |
| `OLDPWD` | Previous directory (used by `cd -`) |
| `LANG`, `LC_*` | Locale (language, date formats) |
| `TERM` | Terminal type (`xterm-256color`) |
| `PS1` | Your prompt string |

### `PATH` — How Commands Are Found

When you type `ls`, the shell searches each directory in `$PATH` for an executable named `ls`:

::code-wrapper{language="bash"}
```bash
echo $PATH
# /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

which ls           # /usr/bin/ls — full path of the first match
type ls            # shows builtin/binary/alias/function (more accurate)
hash               # shell's cache of command → path mappings
hash -r            # clear the hash cache (if you install a new binary)
```
::

## Exit Status

Every command returns an **exit status** (0–255) to the shell:
- `0` — success.
- non-zero — failure (the specific code is command-specific; 1, 2, 126, 127 are common).

::code-wrapper{language="bash"}
```bash
true; echo $?       # 0
false; echo $?      # 1
ls /nonexistent; echo $?   # 2
ls; echo $?         # 0
nonexistentcommand; echo $?  # 127 (command not found)
```
::
- `$?` — the exit status of the last command.
- `&&` — run the next command only if the previous succeeded.
- `||` — run the next command only if the previous failed.

::code-wrapper{language="bash"}
```bash
mkdir /tmp/work && cd /tmp/work      # cd only if mkdir succeeds
test -f /etc/passwd && echo "exists" || echo "missing"
ping -c1 -W1 8.8.8.8 >/dev/null && echo "up" || echo "down"
```
::

## `find` — Locating Files

`find` is the powerhouse file search — it walks a directory tree and tests each file:

::code-wrapper{language="bash"}
```bash
find /etc -name "*.conf"                    # by name
find /etc -iname "*.CONF"                   # case-insensitive
find /var/log -type f -name "*.log"         # files only (not dirs)
find /home -type d -name "projects"         # directories only
find /tmp -mtime -1                         # modified in last 24h
find /tmp -mmin -60                         # modified in last 60 min
find / -size +100M                          # larger than 100 MB
find /etc -user root -perm -644             # owned by root, rw-r--r--
find /var/log -name "*.log" -exec wc -l {} +  # run wc on each match
find /tmp -type f -delete                   # delete all matched files
find / -maxdepth 2 -name "*.conf"           # limit depth (faster)
```
::
- `{}` — placeholder for the found file.
- `-exec ... \;` — run command once per file.
- `-exec ... +` — run command with as many files as possible at once (faster).
- `-exec ... {} +` is generally preferred over `xargs` for safety (handles weird filenames).

## `locate` — Fast, Indexed Search

`locate` uses a pre-built database (updated daily by `updatedb`), so it's far faster than `find /`:

::code-wrapper{language="bash"}
```bash
sudo updatedb            # rebuild the database manually
locate passwd            # find files named "passwd" anywhere
locate -i nginx.conf     # case-insensitive
locate -c "*.log"        # count matches (don't list)
```
::
- Tradeoff: `locate` is fast but stale (only as fresh as the last `updatedb`).
- `find` is slow but real-time and can test attributes `locate` can't.

## `grep` — Search Inside Files

::code-wrapper{language="bash"}
```bash
grep "root" /etc/passwd               # basic search
grep -r "PermitRoot" /etc/ssh         # recursive
grep -i "error" /var/log/syslog       # case-insensitive
grep -v "DEBUG" app.log               # invert (lines WITHOUT "DEBUG")
grep -n "PermitRoot" sshd_config      # show line numbers
grep -c "error" app.log               # count matches
grep -E "^[0-9]+" file                # extended regex (-E)
grep -w "the" file                    # whole-word match
grep -A 2 -B 2 "error" log            # 2 lines After, 2 Before
grep -l "TODO" *.py                   # only filenames with matches
grep --color=auto "foo" file          # highlight matches
```
::

## `tar` — Archives

::code-wrapper{language="bash"}
```bash
tar -czf archive.tar.gz /path          # create gzip
tar -xzf archive.tar.gz                # extract gzip
tar -tf archive.tar.gz                 # list contents (don't extract)
tar -cjf archive.tar.bz2 /path         # create bzip2 (slower, smaller)
tar -cJf archive.tar.xz /path          # create xz (slowest, smallest)
tar -xzf archive.tar.gz -C /tmp        # extract to /tmp
tar -czf - /etc | ssh host "tar -xzf - -C /backup"  # stream over ssh
tar --exclude="*.log" -czf app.tar.gz /app          # exclude patterns
```
::

## 💡 Tips & Tricks

- **Idiom**: use `mkdir -p` (create parent dirs, no error if exists) — `mkdir -p /a/b/c` creates the whole chain. Without `-p`, intermediate dirs cause errors.
- **Idiom**: use `rm -i` for safety or `trash-cli` instead of `rm` — `rm -rf` is irreversible. `trash-cli` (or `gio trash`) moves to the trash, recoverable.
- **Idiom**: use `cd -` to toggle between two directories — it goes back to `$OLDPWD`. `pushd`/`popd` maintain a stack: `pushd /etc; ...; popd`.
- **Idiom**: use `tail -f /var/log/syslog` to watch a log file live — `tail -F` (capital) handles log rotation (re-opens if the file is moved/recreated).
- **Idiom**: use `head -n 20` / `tail -n 20` to peek at large files — never `cat` a 10 GB log. `less` for interactive paging (press `q` to quit, `/` to search).
- **Performance**: `find ... -exec {} +` is faster than `-exec {} \;` — `+` batches files into fewer command invocations. `xargs -0` is also fast and safe with `-print0`.
- **Debug**: `set -x` in a script prints each command before running it — shows how the shell expands variables and globs. `set +x` turns it off.

## ⚠️ Edge Cases & Gotchas

- **`rm -rf /` is real**: a typo like `rm -rf $VAR/*` with `VAR` unset expands to `rm -rf /*`. Always `set -u` (error on unset variables) in scripts. GNU `rm` has a `--preserve-root` (default) that refuses `rm -rf /`, but `/*` bypasses it.
- **`rm` doesn't trash — it deletes forever**: there is no undo. Use `trash-cli` or `rm -i` for anything you can't recreate. Never pipe to `rm` thinking it's `mv`.
- **`cp` silently overwrites**: `cp bigfile existing` replaces `existing` with no warning. Use `cp -n` (no-clobber) or `cp -i` (interactive) for safety. `cp -a` preserves attributes and is the go-to for backups.
- **`mv` across filesystems is a copy + delete**: within one filesystem, `mv` is instant (just renames the inode entry). Across filesystems (e.g., `/home` → `/mnt/usb`), `mv` copies then deletes — slow for large files, and it fails mid-way if out of space.
- **Globs don't match hidden files by default**: `ls *` doesn't show `.bashrc`. Use `ls -a` or `ls .*` explicitly. `.*` also matches `.` and `..` (dangerous with `rm`); use `rm .[^.]*` to avoid them.
- **`grep -r` follows symlinks by default on some systems**: use `grep -r --exclude-dir=.git` or `grep -R` carefully. `-r` doesn't follow symlinks (GNU); `-R` does. Watch for symlink loops.
- **`tar` strips leading `/` by default**: `tar -czf backup.tar.gz /etc` stores `etc/...` (no leading `/`), so extraction is safe (relative paths). If you see `tar: Removing leading '/' from member names`, that's the safety feature working.
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