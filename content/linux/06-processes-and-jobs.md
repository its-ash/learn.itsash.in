# 06 — Processes & Jobs

A **process** is a running instance of a program. Linux is a multitasking, multi-user system — dozens to thousands of processes run concurrently, sharing the CPU(s). This chapter covers how to view, control, and understand processes: `ps`, `top`/`htop`, signals, `kill`, job control, priorities, and the relationship between parent and child processes.

## Processes, Programs, and PIDs

- **Program** — an executable file on disk (`/usr/bin/nginx`, `/usr/bin/python3`).
- **Process** — a running instance of that program, with its own memory, open files, and a **PID** (process ID).
- **PID** — a unique integer (1 to `/proc/sys/kernel/pid_max`, usually 4194304) identifying the process.
- **PPID** — the parent process's PID (the process that started this one).

```text
PID 1 (systemd, the init system)
├── PID 432 (sshd)
│   └── PID 1234 (sshd: alice)      ← your login shell's parent
│       └── PID 1240 (bash)          ← your shell
│           └── PID 1305 (vim)       ← editor you launched
├── PID 500 (cron)
├── PID 600 (nginx)
│   ├── PID 601 (nginx: worker)
│   └── PID 602 (nginx: worker)
```
::

Every process has a parent (except PID 1). When a parent dies, its children are **reparented** to PID 1 (or a "subreaper"), and if a child's parent dies before the child, the child becomes an **orphan** (still runs, just re-parented).

## The Lifecycle: fork, exec, exit, wait

### `fork()` — Clone

A process creates a child by calling `fork()`:
- The child is an exact copy of the parent (memory, file descriptors, environment).
- Both resume execution after the `fork()` call.
- Only difference: `fork()` returns the child's PID to the parent, and `0` to the child.

### `exec()` — Replace

After `fork()`, the child typically calls `exec()` to load a new program into its memory (replacing the copied parent code):

```text
bash forks → child calls execve("/usr/bin/ls") → child becomes ls
```
This is why you run `ls` from bash: bash forks, the child execs `ls`, `ls` runs and exits, bash waits for it.

### `exit()` and `wait()`

When a process finishes, it calls `exit()` with a status code (0–255):
- The process becomes a **zombie** (defunct) — it's dead, but its entry in the process table remains until the parent calls `wait()` to collect the exit status.
- If the parent never `wait()`s, the zombie persists. PID 1 (or the subreaper) eventually reaps it.

::code-wrapper{language="bash"}
```bash
strace -f bash -c "ls /etc >/dev/null" 2>&1 | grep -E "fork|exec|wait"
# clone(...) = child_pid          ← fork
# execve("/usr/bin/ls", ...) = 0  ← exec
# wait4(child_pid, ...) = ...     ← wait for exit
```
::

## Viewing Processes

### `ps` — Snapshot

::code-wrapper{language="bash"}
```bash
ps                          # processes in your current shell
ps -f                       # full format (UID, PID, PPID, C, STIME, TTY, TIME, CMD)
ps aux                      # all processes, BSD-style (most common)
ps -ef                      # all processes, System V-style
ps -e --forest              # tree view
ps -u alice                 # processes owned by alice
ps -C nginx                 # processes named nginx
ps -p 1234 -o pid,ppid,cmd  # specific PID, custom columns
ps aux --sort=-%cpu | head  # top CPU consumers
ps aux --sort=-%mem | head  # top memory consumers
ps -o pid,ppid,nice,rtprio,cls,cmd -p 1234   # scheduling info
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
- **TTY** — controlling terminal (`?` = none, `pts/0` = pseudo-terminal).
- **STAT** — process state (see below).

### Process States

| Code | Meaning |
|---|---|
| `R` | Running or runnable (on run queue) |
| `S` | Interruptible sleep (waiting for an event) |
| `D` | Uninterruptible sleep (usually I/O — can't be killed) |
| `T` | Stopped (by signal, e.g., Ctrl+Z) or traced (debugger) |
| `Z` | Zombie (defunct — dead, not yet reaped) |
| `I` | Idle kernel thread |
| `<` | High priority (negative nice) |
| `N` | Low priority (positive nice) |
| `s` | Session leader |
| `l` | Multi-threaded |
| `+` | In foreground process group |

Example: `Ss` = sleeping session leader (typical for a shell); `R+` = running in foreground; `D` = stuck in I/O (can't kill until I/O completes).

### `top` and `htop` — Live

::code-wrapper{language="bash"}
```bash
top                   # live process view (q to quit)
htop                  # nicer, color, scrollable, tree view (F5)
top -o %CPU           # sort by CPU
top -u alice          # only alice's processes
top -p 1234,5678      # specific PIDs
```
::

`top` keybindings (while running):
- `1` — show per-CPU breakdown.
- `M` — sort by memory.
- `P` — sort by CPU.
- `N` — sort by PID.
- `T` — sort by time.
- `k` — kill a process (prompts for PID + signal).
- `r` — renice a process.
- `q` — quit.

### `pgrep` and `pkill` — Find/Send by Name

::code-wrapper{language="bash"}
```bash
pgrep nginx              # list PIDs named nginx
pgrep -a nginx           # also show the full command line
pgrep -u alice           # alice's processes
pgrep -f "python app.py" # match full command line (not just name)
pgrep -l ssh             # list PIDs + names

pkill nginx              # send SIGTERM to all nginx processes
pkill -9 nginx           # send SIGKILL
pkill -u alice           # kill all of alice's processes
pkill -f "python app.py" # kill by full command match
pkill -HUP nginx         # send SIGHUP (reload config)
```
::

### `pidof` — PIDs by Name

::code-wrapper{language="bash"}
```bash
pidof nginx              # 601 602 600 (space-separated PIDs)
kill $(pidof nginx)      # kill all nginx
```
::

## Signals

Signals are software interrupts sent to a process. They're how you control processes — terminate, suspend, reload, etc.

### Common Signals

| Signal | Number | Default Action | Use |
|---|---|---|---|
| `SIGTERM` | 15 | Terminate | Polite "please stop" (allows cleanup) |
| `SIGKILL` | 9 | Terminate (can't be caught) | Force kill — last resort |
| `SIGINT` | 2 | Terminate | Ctrl+C (interrupt) |
| `SIGHUP` | 1 | Terminate | "Hang up" — reload config (daemons) |
| `SIGSTOP` | 19 | Stop (can't be caught) | Suspend (Ctrl+Z sends SIGTSTP, catchable) |
| `SIGCONT` | 18 | Continue | Resume a stopped process |
| `SIGTSTP` | 20 | Stop | Ctrl+Z (terminal stop, catchable) |
| `SIGUSR1` | 10 | Terminate | User-defined (e.g., nginx reopens logs) |
| `SIGUSR2` | 12 | Terminate | User-defined |
| `SIGSEGV` | 11 | Core dump | Segmentation fault (bad memory access) |
| `SIGPIPE` | 13 | Terminate | Writing to a pipe with no reader |

::code-wrapper{language="bash"}
```bash
kill -l                  # list all signals
kill 1234                # send SIGTERM (15) to PID 1234
kill -15 1234            # same (explicit)
kill -9 1234             # SIGKILL (force — no cleanup)
kill -HUP 1234           # SIGHUP (reload)
kill -s USR1 1234        # SIGUSR1
kill -0 1234             # check if process exists (no signal sent)
```
::

### SIGTERM vs SIGKILL — The Critical Distinction

- **SIGTERM (15)** — the process *can* catch it and shut down gracefully (close files, flush buffers, notify peers). Always try SIGTERM first.
- **SIGKILL (9)** — the kernel kills the process immediately. **No cleanup, no signal handler, no chance.** The process vanishes. Files may be half-written, locks held, children orphaned.

Use SIGKILL only when SIGTERM doesn't work (process is stuck, or in state `D` — though `D` may not even respond to SIGKILL until I/O completes).

### The `D` State Trap

A process in state `D` (uninterruptible sleep) is waiting for I/O and **can't be killed** — not even with `kill -9`. It will exit only when the I/O completes (or the kernel times out). This happens with stuck NFS mounts, failing disks, or buggy drivers. The only fix is often a reboot.

## `kill`, `killall`, `pkill`

::code-wrapper{language="bash"}
```bash
kill 1234                  # SIGTERM to PID 1234
kill -9 1234               # SIGKILL
killall nginx              # SIGTERM to all named "nginx"
killall -9 nginx           # SIGKILL all nginx
killall -u alice           # kill all alice's processes
killall -e -I NGINX        # exact name, case-insensitive
pkill -f "python.*app"     # regex match on full command line
```
::

## Job Control (Shell-Level)

Within a single shell, you can run and manage multiple jobs:

::code-wrapper{language="bash"}
```bash
sleep 100 &             # background (prints [1] 12345 — job 1, PID 12345)
vim notes.md            # foreground (shell blocks)
Ctrl+Z                  # suspend vim → "Stopped", shell returns
bg                      # resume vim in background
jobs                    # [1]- Running   sleep 100 &
                        # [2]+ Stopped   vim notes.md
fg %2                   # bring job 2 to foreground
kill %1                 # send SIGTERM to job 1
wait %1                 # wait for job 1 to finish
wait                    # wait for all background jobs
```
::

- `&` — run in background.
- `Ctrl+Z` — send SIGTSTP (suspend) to foreground.
- `Ctrl+C` — send SIGINT (interrupt) to foreground.
- `Ctrl+D` — send EOF to foreground (not a signal — closes stdin).
- `%N` — job spec (job number from `jobs`).
- `%%` or `%` — current job (marked `+` in `jobs`).
- `%-` — previous job (marked `-`).

### Keeping Jobs After Logout

Background jobs receive **SIGHUP** when the shell exits, killing them. To survive:

::code-wrapper{language="bash"}
```bash
nohup long-task &            # immune to SIGHUP (output → nohup.out)
nohup long-task > log.txt 2>&1 &   # redirect output
long-task & disown           # remove from shell's job table (no SIGHUP)
setsid long-task &           # start in a new session (detached)
tmux new -d -s work 'long-task'    # run in a tmux session (survives logout)
```
::
For long-running tasks, **`tmux` or `screen`** are the best tools — you can detach and reattach later.

## Process Priority: `nice` and `renice`

Linux assigns CPU time based on **priority**. The **nice value** ranges from -20 (highest priority) to +19 (lowest), default 0:

| Nice | Priority |
|---|---|
| -20 | Highest (needs root to set) |
| 0 | Default |
| 19 | Lowest (runs only when CPU is idle) |

::code-wrapper{language="bash"}
```bash
nice -n 10 tar -czf backup.tar.gz /home   # start at nice 10 (low priority)
nice -n -5 high-priority-task             # start at nice -5 (needs root)
renice -n 5 -p 1234                       # change running process to nice 5
renice -n -10 -p 1234                     # raise priority (needs root)
renice +5 -u alice                        # lower priority for all alice's procs
```
::
- Regular users can only *lower* priority (increase nice). Only root can raise it (negative nice).
- Nice affects CPU scheduling only, not I/O or memory.

## `/proc/<pid>/` — Process Internals

Each process has a directory under `/proc`:

| File | Contents |
|---|---|
| `/proc/<pid>/status` | Human-readable status (name, state, UID, memory) |
| `/proc/<pid>/cmdline` | Command line (null-separated) |
| `/proc/<pid>/environ` | Environment variables (null-separated) |
| `/proc/<pid>/cwd` | Symlink to current working directory |
| `/proc/<pid>/exe` | Symlink to the executable |
| `/proc/<pid>/fd/` | Open file descriptors (symlinks to files/sockets) |
| `/proc/<pid>/maps` | Memory map (libraries, heap, stack) |
| `/proc/<pid>/stat` | Machine-readable status (used by `ps`) |
| `/proc/<pid>/io` | I/O counters (read/write bytes) |
| `/proc/<pid>/limits` | Resource limits (ulimits) |

::code-wrapper{language="bash"}
```bash
cat /proc/1234/status | head -10
cat /proc/1234/cmdline | tr '\0' ' '    # show command line
ls -l /proc/1234/cwd                    # see working directory
ls -l /proc/1234/fd/                    # see open files
cat /proc/1234/environ | tr '\0' '\n'   # show environment
```
::

## `lsof` — List Open Files

`lsof` (list open files) is essential for "what's using this file/port?":

::code-wrapper{language="bash"}
```bash
lsof /var/log/syslog        # who has syslog open?
lsof +D /var/log            # anything open under /var/log?
lsof -i :80                 # what's listening on port 80?
lsof -i tcp                 # all TCP connections
lsof -i udp                 # all UDP
lsof -u alice               # all files opened by alice
lsof -p 1234                # all files opened by PID 1234
lsof -c nginx               # all files opened by processes named nginx
lsof /mnt/usb               # what's blocking the unmount? (open files)
```
::

## `fuser` — Who's Using a File/Directory

::code-wrapper{language="bash"}
```bash
fuser /var/log/syslog       # PIDs using the file
fuser -v /var/log/syslog    # verbose
fuser -km /mnt/usb          # kill all processes using /mnt/usb (force unmount)
fuser -v -n tcp 80          # processes using TCP port 80
``
::

## Real-Time Process Monitoring

::code-wrapper{language="bash"}
```bash
top                      # classic
htop                     # better top (interactive, tree view)
atop                     # historical, resource-focused
btop                     # modern, GPU-aware
glances                  # Python-based, web UI option
watch -n 1 'ps aux --sort=-%cpu | head'  # refresh every 1s
```
::

## 💡 Tips & Tricks

- **Idiom**: use `pgrep -a` (not `ps aux | grep`) to find processes by name — `pgrep -a nginx` lists PID + full command for all nginx processes, no grep self-match, no noise. `ps aux | grep nginx` includes the `grep` process itself.
- **Idiom**: use `pkill -HUP <name>` to reload daemon config — many daemons (nginx, sshd, syslog-ng) reload their config on SIGHUP without dropping connections. `pkill -HUP nginx` is the standard reload. Check the daemon's docs for the right signal.
- **Idiom**: use `nohup cmd > log 2>&1 &` for fire-and-forget background tasks — `nohup` blocks SIGHUP (survives logout), `> log 2>&1 &` captures output and backgrounds. For anything long or interactive, use `tmux`/`screen` instead (you can reattach).
- **Idiom**: use `kill -0 $PID` to check if a process exists — sends no signal, just returns 0 if the PID exists (and you have permission) or 1 if not. Useful in scripts: `kill -0 $pid 2>/dev/null && echo "running" || echo "stopped"`.
- **Idiom**: use `nice -n 19` for non-urgent heavy jobs — backup, indexing, `find /` — so they don't compete with interactive work for CPU. Pair with `ionice -c3` for I/O-heavy jobs so they don't thrash the disk.
- **Debug**: use `/proc/<pid>/fd` and `lsof -p <pid>` to see what a process is doing — open files reveal what it's reading/writing, sockets reveal network connections, deleted files still held open explain "disk full but df doesn't show it."
- **Debug**: use `ls -l /proc/<pid>/cwd` to find a process's working directory — essential when a daemon's relative paths break ("file not found") and you don't know where it's running from. Same for `/proc/<pid>/exe` (the binary) and `/proc/<pid>/root` (its chroot).

## ⚠️ Edge Cases & Gotchas

- **`kill -9` (SIGKILL) gives no cleanup**: the process can't flush buffers, close files cleanly, or notify peers. Databases may need recovery on next start. Always try `kill` (SIGTERM) first and wait a few seconds. SIGKILL is the last resort.
- **State `D` processes can't be killed**: a process in uninterruptible sleep (I/O wait) ignores even `kill -9`. It will exit when the I/O completes — or never, if the disk/NFS is truly stuck. Reboot is often the only fix.
- **Zombies persist until reaped**: a dead process (state `Z`) remains in the process table until its parent calls `wait()`. If the parent is buggy and never reaps, zombies accumulate (they don't use CPU or much memory, but they consume PIDs). Fix the parent or kill the parent (children get reaped by PID 1).
- **Orphans aren't zombies**: if the parent dies *before* the child, the child is reparented to PID 1 (or a subreaper) and keeps running — it's an **orphan**, not a zombie. This is normal (e.g., `daemon & disown`). Zombies happen when the child dies *before* the parent and the parent doesn't `wait()`.
- **`pkill -f` can kill unintended processes**: `pkill -f python` matches *any* command line containing "python" — including `vim python_notes.md`. Use `pgrep -f` first to see what would be killed, then `pkill -f` with a more specific pattern.
- **`killall` differs on non-Linux**: on Linux (util-linux), `killall nginx` kills processes named "nginx." On Solaris, `killall` kills *all* processes (dangerous!). If you script for portability, use `pkill` instead.
- **Background jobs die on SIGHUP at logout**: `cmd &` is killed when the shell exits (it sends SIGHUP). Use `nohup`, `disown`, `setsid`, or `tmux`/`screen` to keep them running. This surprises people who `ssh` in, start a backup, and log out.
- **`Ctrl+Z` stops, doesn't kill**: it sends SIGTSTP (suspend). The process is paused, not terminated. Resume with `fg` (foreground) or `bg` (background). Forgetting this leaves stopped jobs consuming memory (and `jobs` shows them).
- **Nice doesn't affect I/O or memory**: `nice -n 19` only reduces CPU priority. An I/O-heavy task (like `dd` or `rsync`) still hammers the disk. Use `ionice -c3` for I/O priority, and `cgroups` for memory/CPU limits (see chapter 17).
- **`%CPU` in `ps` is lifetime average, not current**: `ps aux` shows CPU as a percentage of total runtime — a process that spiked for 1 second and ran for 100 seconds shows ~1%. Use `top`/`htop` for current CPU usage. This misleads people into thinking a process is idle when it's actually busy now.

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

`pkill -f` matches the **full command line**, not just the process name. The sysadmin was editing `python_server.py` in vim — vim's command line is `vim python_server.py`, which contains "python." So `pkill -f python` matched and killed vim (and any other process with "python" anywhere in its arguments).

**Fix 1 — match the process name only (not the command line):**

::code-wrapper{language="bash"}
```bash
pkill -x python3    # exact match on process name (comm), not command line
# or
pkill python3       # substring match on name
```
::
`pkill` (without `-f`) matches the process name (the `comm` field, limited to 15 chars), not the full command line.

**Fix 2 — be specific with `-f`:**

::code-wrapper{language="bash"}
```bash
pkill -f "python3 app.py"   # match the specific command
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
Always run `pgrep -af <pattern>` before `pkill -f <pattern>` to verify the match set. `pkill -f` is powerful but dangerous — it's regex against the entire command line.
</details>