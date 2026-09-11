# 06 — Processes & Jobs

A **process** is a running instance of a program. Linux is a multitasking, multi-user system — dozens to thousands of processes run concurrently, sharing the CPU(s). This chapter covers process lifecycle, signals, scheduling, and the `/proc` interface — through the lens of production diagnostics and edge-case behavior.

## Process Lifecycle: fork, exec, exit, wait

::code-wrapper{language="bash"}
```bash
# Complex Implementation: trace the fork/exec/wait cycle with strace
# — reveals what "running a command" actually does at the syscall level
strace -f bash -c "ls /etc >/dev/null" 2>&1 | grep -E "clone|execve|wait4"
# clone(...) = child_pid          ← fork (Linux uses clone, not fork)
# execve("/usr/bin/ls", ...) = 0  ← exec (child replaces itself with ls)
# wait4(child_pid, ...) = ...     ← parent waits for exit status
```
::

- **`fork()`** — child is an exact copy of the parent (memory, file descriptors, environment). Only difference: `fork()` returns child PID to parent, 0 to child.
- **`exec()`** — child loads a new program, replacing the copied parent code.
- **`exit()`** — process terminates with a status code (0–255). Becomes a **zombie** until parent calls `wait()`.
- **`wait()`** — parent collects exit status; zombie is reaped.

### Edge Case: Zombies and Orphans

::code-wrapper{language="bash"}
```bash
# Complex Implementation: demonstrate zombie creation and reaping
# — a process that dies before its parent wait()s becomes a zombie
(
  sleep 1 &        # child starts
  exit 0           # parent exits immediately without waiting
)                  # child is now an orphan (reparented to PID 1, which reaps it)

# If the parent is buggy and never waits, zombies accumulate:
ps aux | awk '$8 ~ /Z/ {print}'    # find zombies (state Z)
# Fix: kill the parent (children get reaped by PID 1)
```
::

## Viewing Processes

### `ps` — Snapshot

::code-wrapper{language="bash"}
```bash
ps aux                      # all processes, BSD-style (most common)
ps -ef                      # all processes, System V-style
ps -e --forest              # tree view
ps -u alice                 # processes owned by alice
ps -C nginx                 # processes named nginx
ps -p 1234 -o pid,ppid,cmd  # specific PID, custom columns
ps aux --sort=-%cpu | head  # top CPU consumers
ps aux --sort=-%mem | head  # top memory consumers
```
::

The `ps aux` columns:

```text
USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root         1  0.0  0.1 168924 13140 ?        Ss   Jun15   1:23 /sbin/init
alice     1240  0.0  0.2  25460  5232 pts/0    Ss   10:00   0:00 -bash
alice     1305  1.2  0.8 124356 32100 pts/0    S+   10:15   0:05 vim notes.md
```

- **VSZ** — virtual memory size (KB) — address space (often large, mostly not in RAM).
- **RSS** — resident set size (KB) — actual physical memory used.
- **STAT** — process state (see below).

### Process States

| Code | Meaning |
|---|---|
| `R` | Running or runnable (on run queue) |
| `S` | Interruptible sleep (waiting for an event) |
| `D` | Uninterruptible sleep (usually I/O — can't be killed) |
| `T` | Stopped (by signal, e.g., Ctrl+Z) or traced (debugger) |
| `Z` | Zombie (defunct — dead, not yet reaped) |
| `<` | High priority (negative nice) |
| `N` | Low priority (positive nice) |
| `+` | In foreground process group |

### Edge Case: The `D` State Trap

::code-wrapper{language="bash"}
```bash
# A process in state D (uninterruptible sleep) is waiting for I/O and CANNOT be killed
# — not even with kill -9. It will exit only when the I/O completes (or never, if the
# disk/NFS is truly stuck). Reboot is often the only fix.
#
# Typical cause: stuck NFS mount, failing disk, buggy driver
ps aux | awk '$8 ~ /D/'           # find D-state processes
```
::

## Signals

| Signal | Number | Default Action | Use |
|---|---|---|---|
| `SIGTERM` | 15 | Terminate | Polite "please stop" (allows cleanup) |
| `SIGKILL` | 9 | Terminate (can't be caught) | Force kill — last resort |
| `SIGINT` | 2 | Terminate | Ctrl+C (interrupt) |
| `SIGHUP` | 1 | Terminate | "Hang up" — reload config (daemons) |
| `SIGSTOP` | 19 | Stop (can't be caught) | Suspend (Ctrl+Z sends SIGTSTP, catchable) |
| `SIGCONT` | 18 | Continue | Resume a stopped process |
| `SIGUSR1` | 10 | Terminate | User-defined (e.g., nginx reopens logs) |
| `SIGSEGV` | 11 | Core dump | Segmentation fault (bad memory access) |
| `SIGPIPE` | 13 | Terminate | Writing to a pipe with no reader |

::code-wrapper{language="bash"}
```bash
kill -l                  # list all signals
kill 1234                # send SIGTERM (15) to PID 1234
kill -9 1234             # SIGKILL (force — no cleanup)
kill -HUP 1234           # SIGHUP (reload)
kill -0 1234             # check if process exists (no signal sent)
```
::

### Caveat & Anti-Pattern: SIGTERM vs SIGKILL

::code-wrapper{language="bash"}
```bash
# NAIVE: kill -9 immediately (no cleanup, databases may need recovery)
kill -9 1234

# PRODUCTION: SIGTERM first, wait, then SIGKILL only if needed
kill 1234                    # SIGTERM — allows graceful shutdown
sleep 5                      # give it time to clean up
kill -0 1234 2>/dev/null && kill -9 1234   # still alive? force kill

# Edge Case: D-state processes ignore even SIGKILL
# kill -9 <D-state-pid> → no effect (process is in uninterruptible I/O wait)
```
::

## Job Control

::code-wrapper{language="bash"}
```bash
# Complex Implementation: parallel jobs with exit-code capture
sleep 100 &             # background (prints [1] 12345 — job 1, PID 12345)
vim notes.md            # foreground (shell blocks)
Ctrl+Z                  # suspend vim → "Stopped", shell returns
bg                      # resume vim in background
jobs                    # list background jobs
fg %1                   # bring job 1 to foreground
kill %1                 # send SIGTERM to job 1
wait                    # wait for all background jobs
```
::

### Keeping Jobs After Logout

::code-wrapper{language="bash"}
```bash
# Background jobs receive SIGHUP when the shell exits, killing them.
# To survive:
nohup long-task > log.txt 2>&1 &   # immune to SIGHUP (output → nohup.out)
long-task & disown                 # remove from shell's job table
setsid long-task &                # start in a new session (detached)
tmux new -d -s work 'long-task'   # run in tmux (survives logout, reattachable)
```
::

## Process Priority: `nice` and `renice`

| Nice | Priority |
|---|---|
| -20 | Highest (needs root to set) |
| 0 | Default |
| 19 | Lowest (runs only when CPU is idle) |

::code-wrapper{language="bash"}
```bash
# Complex Implementation: low-priority backup job (CPU + I/O)
nice -n 19 ionice -c 3 tar -czf backup.tar.gz /home
# nice: low CPU priority
# ionice -c 3: idle I/O class (only uses disk when no one else does)
# Prevents the backup from disrupting interactive work

renice -n 5 -p 1234     # change running process to nice 5
```
::

## `/proc/<pid>/` — Process Internals

::code-wrapper{language="bash"}
```bash
# Complex Implementation: inspect a running process without ps or top
pid=$(pgrep -x nginx | head -1)
cat /proc/$pid/status | head -10     # human-readable status
cat /proc/$pid/cmdline | tr '\0' ' ' # command line (null-separated)
ls -l /proc/$pid/cwd                 # working directory (symlink)
ls -l /proc/$pid/exe                 # executable (symlink)
ls -l /proc/$pid/fd/                 # open file descriptors
cat /proc/$pid/environ | tr '\0' '\n' # environment variables
cat /proc/$pid/io                     # I/O counters (read/write bytes)
cat /proc/$pid/limits                 # resource limits (ulimits)
```
::

## `lsof` — List Open Files

::code-wrapper{language="bash"}
```bash
# Complex Implementation: diagnose "disk full but df doesn't show it"
# — a process holds a large deleted file open (space not freed until fd closes)
sudo lsof +L1               # list open files with link count 0 (deleted but open)
# COMMAND   PID  USER  FD  SIZE  NLINK  NAME
# nginx    1234  root  9w  50G   0      /var/log/nginx/access.log (deleted)

# Fix: restart the process (closes the fd, frees the space)
sudo systemctl restart nginx
# Or truncate the file via /proc (without restarting):
sudo truncate -s 0 /proc/1234/fd/9
```
::

## 💡 Tips & Tricks

- **Idiom**: use `pgrep -a` (not `ps aux | grep`) to find processes by name — `pgrep -a nginx` lists PID + full command, no grep self-match, no noise.
- **Idiom**: use `pkill -HUP <name>` to reload daemon config — many daemons (nginx, sshd) reload their config on SIGHUP without dropping connections.
- **Idiom**: use `kill -0 $PID` to check if a process exists — sends no signal, just returns 0 if the PID exists. `kill -0 $pid 2>/dev/null && echo "running" || echo "stopped"`.
- **Idiom**: use `nice -n 19 ionice -c3` for non-urgent heavy jobs — backup, `find /`, indexing. `nice` lowers CPU priority, `ionice -c3` lowers I/O priority.
- **Debug**: use `/proc/<pid>/fd` and `lsof -p <pid>` to see what a process is doing — open files reveal what it's reading/writing, sockets reveal network connections.
- **Debug**: use `ls -l /proc/<pid>/cwd` to find a process's working directory — essential when a daemon's relative paths break.

## ⚠️ Edge Cases & Gotchas

- **`kill -9` (SIGKILL) gives no cleanup**: the process can't flush buffers, close files cleanly, or notify peers. Databases may need recovery on next start. Always try `kill` (SIGTERM) first.
- **State `D` processes can't be killed**: a process in uninterruptible sleep (I/O wait) ignores even `kill -9`. It will exit when the I/O completes — or never, if the disk/NFS is truly stuck.
- **Zombies persist until reaped**: a dead process (state `Z`) remains in the process table until its parent calls `wait()`. Fix the parent or kill the parent (children get reaped by PID 1).
- **`pkill -f` can kill unintended processes**: `pkill -f python` matches *any* command line containing "python" — including `vim python_notes.md`. Use `pgrep -af` first to preview.
- **`%CPU` in `ps` is lifetime average, not current**: a process that spiked for 1 second and ran for 100 seconds shows ~1%. Use `top`/`htop` for current CPU usage.
- **Nice doesn't affect I/O or memory**: `nice -n 19` only reduces CPU priority. An I/O-heavy task still hammers the disk. Use `ionice -c3` for I/O and `cgroups` for memory.

## 🧠 Spot the Bug

A sysadmin wants to kill a runaway `python` process, but this command kills their `vim` session too:

::code-wrapper{language="bash"}
```bash
pkill -f python
```
::

What happened, and how do you fix it?

<details>
<summary>Answer</summary>

`pkill -f` matches the **full command line**, not just the process name. The sysadmin was editing `python_server.py` in vim — vim's command line is `vim python_server.py`, which contains "python." So `pkill -f python` matched and killed vim.

**Fix 1 — match the process name only:**

::code-wrapper{language="bash"}
```bash
pkill -x python3    # exact match on process name (comm), not command line
```
::

**Fix 2 — be specific with `-f`:**

::code-wrapper{language="bash"}
```bash
pkill -f "python3 app.py"
```
::

**Fix 3 — preview first with `pgrep`:**

::code-wrapper{language="bash"}
```bash
pgrep -af python    # see what WOULD be killed (PID + full command)
# 1234 python3 app.py
# 5678 vim python_server.py   ← oops, this would be killed
```
::

Always run `pgrep -af <pattern>` before `pkill -f <pattern>` to verify the match set.
</details>