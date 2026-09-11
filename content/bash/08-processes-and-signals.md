---
title: "Bash 08 — Process Management, Signal Handling & Parallel Execution"
description: "Deep-dive into Bash process lifecycle: background jobs, signal dispatch, trap mechanics, wait/n job pools, xargs parallelism, timeout enforcement, and production patterns for graceful shutdown. Code-first reference for senior engineers."
---

# 08 — Process Management, Signal Handling & Parallel Execution

## Process Lifecycle: Foreground, Background, Subshell

::code-wrapper{language="bash"}
```bash
# ── Foreground: blocks the terminal until the command finishes ──
./long_running.sh    # shell waits for it to exit

# ── Background: returns immediately, command continues ──
./long_running.sh &
# [1] 12345    ← job number 1, PID 12345
# The shell prints job number and PID, then returns to the prompt.

# ── Subshell: a child process that's a copy of the current shell ──
(                    # ( starts a subshell (fork)
    cd /tmp          # subshell's CWD changes — does NOT affect parent
    echo "in $(pwd)"  # /tmp
)
echo "parent: $(pwd)"  # parent's CWD unchanged (subshell didn't leak)

# ── Command substitution is also a subshell ──
x=before
output=$(x=after; echo "$x")   # subshell: x is set to "after"
echo "$output"                 # after
echo "$x"                      # before — subshell's x didn't leak

# ── Process substitution runs in a subshell too ──
diff <(sort file1) <(sort file2)   # sort runs in subshells, output exposed as fds

# ── Job control ──
./job1.sh &        # background job 1
./job2.sh &        # background job 2
jobs               # list all background jobs: [1]- Running  ./job1.sh & [2]+ Running  ./job2.sh &
fg %1              # bring job 1 to foreground (blocks until done or Ctrl-Z)
bg %1              # resume job 1 in background (if it was stopped with Ctrl-Z)
kill %1            # send SIGTERM to job 1
kill %2            # send SIGTERM to job 2
wait               # wait for all background jobs to finish
```
::

## `$!` and `wait`: Capturing Process PIDs and Exit Status

::code-wrapper{language="bash"}
```bash
# ── $! is the PID of the last backgrounded command ──
./slow.sh &
pid=$!               # capture immediately — $! changes with each new background command
echo "started PID $pid"

# ── wait for a specific PID, capture its exit status ──
wait "$pid"
status=$?
echo "exit status: $status"

# ── Wait for all background jobs ──
./job1.sh &
./job2.sh &
./job3.sh &
wait                   # wait for ALL background jobs
# ⚠️ $? after `wait` (no arg) is the exit status of the LAST job to finish (non-deterministic!)
# To check each job individually, capture PIDs and wait for each:

./job1.sh & pid1=$!
./job2.sh & pid2=$!
./job3.sh & pid3=$!

wait "$pid1"; status1=$?
wait "$pid2"; status2=$?
wait "$pid3"; status3=$?

if ((status1 == 0 && status2 == 0 && status3 == 0)); then
    echo "all succeeded"
else
    echo "failed: j1=$status1 j2=$status2 j3=$status3"
    exit 1
fi

# ── wait -n: wait for ANY one job to finish (Bash 5.1+) ──
for i in 1 2 3 4 5; do
    ./worker.sh "$i" &
done
wait -n   # wait for any one to complete (returns its exit status)
echo "one job finished with status $?"
# Useful for job pools: wait for a slot to free up before starting the next job.
```
::

## Anti-Pattern: `wait` Without PIDs

::code-wrapper{language="bash"}
```bash
# ❌ NAIVE — $? after bare wait is non-deterministic (last job, not all jobs)
./job1.sh &
./job2.sh &
./job3.sh &
wait
if [[ $? -eq 0 ]]; then
    echo "all succeeded"   # WRONG — $? is only the last job's status, not all
fi

# ✅ CORRECT — capture PIDs, wait for each, check all
pids=()
./job1.sh & pids+=($!)
./job2.sh & pids+=($!)
./job3.sh & pids+=($!)

all_ok=true
for pid in "${pids[@]}"; do
    wait "$pid" || all_ok=false   # if any fails, set flag
done
$all_ok && echo "all succeeded" || echo "some failed"
```
::

## Signals: The Complete Dispatch Model

::code-wrapper{language="bash"}
```bash
# ── Common signals ──
# Signal     Num  Default action    Can trap?  Meaning
# SIGHUP     1    terminate         yes        terminal closed / "reload config" convention
# SIGINT     2    terminate         yes        Ctrl-C (interrupt)
# SIGQUIT    3    core dump         yes        Ctrl-\ (quit with core dump)
# SIGKILL    9    terminate         NO         force kill (immediate, no cleanup — last resort)
# SIGUSR1    10   terminate         yes        user-defined 1
# SIGSEGV    11   core dump         yes        segfault (memory violation)
# SIGUSR2    12   terminate         yes        user-defined 2
# SIGTERM    15   terminate         yes        polite terminate (default for `kill`)
# SIGSTOP    19   stop (pause)      NO         pause process (can't be caught)
# SIGCONT    18   resume            yes        resume a stopped process
# SIGTSTP    20   stop              yes        Ctrl-Z (terminal stop — can be caught)

# ── Sending signals ──
kill $pid            # SIGTERM (default) — polite, can be trapped for cleanup
kill -TERM $pid      # same, explicit
kill -15 $pid        # same, by number
kill -9 $pid         # SIGKILL — can't be caught, immediate, no cleanup
kill -HUP $pid       # SIGHUP — often "reload config"
kill -INT $pid       # SIGINT — like Ctrl-C
kill -USR1 $pid      # SIGUSR1 — custom trigger
kill -l              # list all signals (with numbers)
kill -0 $pid         # check if process exists (exit 0 = alive, exit 1 = dead)

# ── Signal shortcuts ──
kill -9 $pid         # SIGKILL — force, no cleanup. LAST RESORT.
kill -TERM $pid      # SIGTERM — polite. Try this FIRST, then -9 after a timeout.
kill -l SIGTERM      # 15 — get signal number from name
kill -l 15           # TERM — get signal name from number
```
::

## `trap`: Signal Handling for Graceful Shutdown

::code-wrapper{language="bash"}
```bash
# ── trap registers a handler for one or more signals ──
cleanup() {
    echo "cleaning up..." >&2
    [[ -n "$tmpfile" ]] && rm -f "$tmpfile"
    [[ -n "$child_pid" ]] && kill "$child_pid" 2>/dev/null
    wait "$child_pid" 2>/dev/null
    exit 0    # or exit $exit_code to preserve the original
}

tmpfile=$(mktemp)
child_pid=""
trap cleanup EXIT INT TERM   # handle normal exit, Ctrl-C, and SIGTERM

# ── Start a child process ──
./server.sh &
child_pid=$!

# ── Main loop ──
while true; do
    echo "working..."
    sleep 1
done

# ── When the script exits (normally, Ctrl-C, or kill) ──
# EXIT: fires on any exit (normal, set -e abort, signals if no specific trap)
# INT:  fires on Ctrl-C (user interrupt)
# TERM: fires on `kill` (termination request)
# The trap runs in the MAIN shell — so $tmpfile and $child_pid are in scope.

# ── Ignoring a signal (critical section) ──
trap '' INT    # ignore Ctrl-C during critical work
# ... critical section that shouldn't be interrupted ...
trap - INT    # restore default (Ctrl-C kills the script)

# ── Reload on SIGHUP ──
load_config() {
    source "$CONFIG_FILE"
    echo "config reloaded at $(date -Iseconds)"
}
trap load_config HUP   # kill -HUP $pid reloads config

# ── Multiple signals, one handler ──
trap 'echo "signal received: $?"' INT TERM HUP

# ── ERR trap (fires on command failure with set -e) ──
set -E   # -E makes ERR trap inherit into functions and subshells (essential!)
err_handler() {
    local code=$?
    echo "FAILED: '$BASH_COMMAND' at line $LINENO (exit $code)" >&2
}
trap err_handler ERR
# ERR fires when a command fails and set -e would exit.
# BASH_COMMAND: the failing command (string).
# LINENO: current line number.
# $?: exit status (capture FIRST — any command overwrites it).
```
::

## Production Pattern: Graceful Server Shutdown

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
set -Eeuo pipefail

# ── A wrapper that starts a server, forwards signals, and cleans up ──

server_pid=""
start_server() {
    ./server --port "$PORT" &
    server_pid=$!
    log INFO "server started (PID $server_pid) on port $PORT"
}

shutdown() {
    local exit_code=$?    # capture BEFORE any other command
    log INFO "shutting down..."

    if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
        log INFO "sending SIGTERM to server..."
        kill -TERM "$server_pid"     # polite: let the server clean up

        # Wait up to 10 seconds for graceful shutdown
        for i in {1..10}; do
            kill -0 "$server_pid" 2>/dev/null || break
            sleep 1
        done

        # If still alive after 10s, force kill
        if kill -0 "$server_pid" 2>/dev/null; then
            log WARN "server didn't shut down in 10s, sending SIGKILL"
            kill -KILL "$server_pid"
        fi
        wait "$server_pid" 2>/dev/null
    fi

    log INFO "shutdown complete (exit $exit_code)"
    exit "$exit_code"
}

trap shutdown EXIT INT TERM

PORT="${1:-8080}"
start_server

# Wait for the server to exit (or signal to arrive)
wait "$server_pid"
```
::

## `xargs`: Parallel Processing

::code-wrapper{language="bash"}
```bash
# ── xargs reads stdin and passes items as args to a command ──
# Without -0: splits on whitespace (breaks on spaces — dangerous for filenames)
# With -0: splits on null bytes (safe with find -print0)

# ── Basic usage ──
echo "file1 file2 file3" | xargs rm                 # rm file1 file2 file3
find . -name "*.log" | xargs grep "error"           # grep "error" in all .log files
find . -name "*.log" -print0 | xargs -0 grep "error"  # safe (null-delimited)

# ── -P N: run N processes in parallel ──
find . -name "*.png" -print0 | xargs -0 -P4 -I{} convert {} {}.thumb.png
# -P4: 4 processes in parallel
# -I{}: use {} as placeholder for each filename
# -0: null-delimited (safe with -print0)

# ── -n N: pass N args per command invocation ──
echo "a b c d e f" | xargs -n2 echo
# a b
# c d
# e f

# ── -I{}: custom placeholder ──
find . -name "*.py" -print0 | xargs -0 -I{} python -m py_compile {}
# {} is replaced with each filename (one at a time with -I)

# ── Running a function with xargs (requires export -f) ──
process_file() {
    local f=$1
    echo "processing $f"
    # ... real work ...
}
export -f process_file

find . -name "*.txt" -print0 | xargs -0 -P4 -I{} bash -c 'process_file "$1"' _ {}
# _ is $0 (shell name, unused), {} becomes $1
# export -f is required because xargs runs bash -c in a CHILD PROCESS

# ── Parallel with max args per process ──
find . -name "*.py" -print0 | xargs -0 -P4 -n10 py_compile
# -P4: 4 parallel processes, -n10: 10 files per process (40 files in flight)
```
::

## Anti-Pattern: Parallel Jobs Without Error Handling

::code-wrapper{language="bash"}
```bash
# ❌ NAIVE — no error checking, no output capture
for url in "${urls[@]}"; do
    curl -s "$url" &  # fire and forget
done
wait  # wait for all — but no exit status checking!

# ✅ CORRECT — capture PIDs, check each, collect failures
declare -a pids=()
for url in "${urls[@]}"; do
    curl -s "$url" -o "/tmp/result_$RANDOM" &
    pids+=($!)
done

failures=0
for pid in "${pids[@]}"; do
    wait "$pid" || ((failures++))
done
if ((failures > 0)); then
    echo "failed: $failures/${#pids[@]}" >&2
    exit 1
fi
```
::

## `timeout`: Enforcing Time Limits

::code-wrapper{language="bash"}
```bash
# ── timeout runs a command with a time limit ──
timeout 30 ./slow_script.sh        # kill after 30s (SIGTERM)
timeout -s KILL 30 ./slow.sh       # use SIGKILL after 30s
timeout -k 5 30 ./slow.sh          # SIGTERM after 30s, then SIGKILL after 5 more if still running
timeout --preserve-status 30 ./script.sh  # preserve the command's exit status (not 124)

# ── Exit codes ──
# timeout returns 124 if the command timed out, or the command's own exit status otherwise.
# Distinguish:
timeout 30 ./slow.sh
status=$?
if ((status == 124)); then
    echo "timed out"
elif ((status == 137)); then
    echo "killed (SIGKILL after timeout + grace period)"
else
    echo "exit: $status"
fi

# ── Timeout with retry ──
retry_with_timeout() {
    local max=$1 t=$2; shift 2
    local attempt=1
    while ((attempt <= max)); do
        timeout "$t" "$@" && return 0
        local code=$?
        ((code == 124)) && echo "attempt $attempt: timed out" >&2
        ((code != 124)) && echo "attempt $attempt: exit $code" >&2
        ((attempt++))
        sleep 2
    done
    return 1
}
retry_with_timeout 3 30 curl -s "$url"
```
::

## `nohup`, `disown`, `setsid`: Detaching from the Terminal

::code-wrapper{language="bash"}
```bash
# ── Background jobs die when the terminal closes (SIGHUP) ──
./long_job.sh &       # if the terminal closes, the job gets SIGHUP and dies

# ── nohup: immune to SIGHUP ──
nohup ./long_job.sh &  # survives terminal close (SIGHUP is ignored)
# stdout → nohup.out (if stdout is a terminal), stderr → stdout
# Best practice: redirect explicitly:
nohup ./long_job.sh > /tmp/job.log 2>&1 &
disown                 # also remove from job table (so the shell doesn't warn on exit)

# ── disown: remove a job from the shell's job table ──
./job.sh &
disown                  # job is no longer in the job table — shell won't send SIGHUP on exit
# disown -h: don't send SIGHUP on shell exit (keep in job table but ignore SIGHUP)

# ── setsid: start in a new session (fully detached) ──
setsid ./job.sh &      # job runs in a new session — no controlling terminal
# More thorough than nohup — the job is fully detached from the terminal.

# ── For production: use a process manager (systemd, supervisord) ──
# systemd service file (/etc/systemd/system/myapp.service):
# [Service]
# ExecStart=/opt/myapp/server.sh
# Restart=always
# User=myapp
```
::

## Process Inspection

::code-wrapper{language="bash"}
```bash
# ── ps: list processes ──
ps aux              # all processes (BSD syntax: a=all, u=user format, x=no tty)
ps -ef              # all processes (POSIX syntax)
ps -fp $pid         # details for a specific PID
ps aux | grep bash  # find bash processes (includes the grep itself — use [b]ash trick)
ps aux | grep '[b]ash'  # [b]ash matches "bash" but not "[b]ash" (hides the grep process)

# ── pgrep: find PIDs by name (no grep subprocess, no self-match issue) ──
pgrep -f "script.sh"    # PIDs matching "script.sh" in the command line
pgrep -f "script.sh" -a # PIDs + full command line
pgrep -u root bash      # PIDs owned by root running bash

# ── pkill: kill by name ──
pkill -f "script.sh"    # SIGTERM all processes matching "script.sh"
pkill -9 -f "script.sh" # SIGKILL all matching (force)
pkill -u user bash      # kill all bash processes for a user

# ── pstree: process tree ──
pstree -p              # tree with PIDs
pstree -p $pid         # tree starting from a specific PID

# ── top / htop: interactive monitors ──
top                    # built-in
htop                   # better (install separately: brew install htop)
# htop features: tree view (F5), kill (F9), filter, sort by CPU/memory
```
::

## 💡 Tips & Tricks

::code-wrapper{language="bash"}
```bash
# ── Job pool pattern: limit parallelism with wait -n (Bash 5.1+) ──
max_jobs=4
running=0
for task in "${tasks[@]}"; do
    ./worker.sh "$task" &
    ((running++))
    ((running >= max_jobs)) && { wait -n; ((running--)); }
done
wait  # wait for remaining jobs

# ── Portable job pool (no wait -n, works on older Bash) ──
max_jobs=4
pids=()
for task in "${tasks[@]}"; do
    ./worker.sh "$task" &
    pids+=($!)
    (( ${#pids[@]} >= max_jobs )) && {
        # Wait for any one to finish, remove it from the array
        for i in "${!pids[@]}"; do
            if ! kill -0 "${pids[i]}" 2>/dev/null; then
                wait "${pids[i]}"  # reap the zombie
                unset 'pids[i]'
                pids=("${pids[@]}")  # reindex
                break
            fi
        done
    }
done
wait  # wait for remaining

# ── Check if a process is alive ──
if kill -0 "$pid" 2>/dev/null; then
    echo "process $pid is running"
else
    echo "process $pid is dead"
fi
# kill -0 sends signal 0 (no actual signal) — just checks if the process exists.

# ── Coprocess (Bash 4+) ──
coproc sql { sqlite3 mydb.db; }   # start a coprocess with bidirectional pipe
echo "SELECT 1+1;" >&"${sql[1]}"  # write to coprocess stdin (fd in sql[1])
read -r result <&"${sql[0]}"      # read from coprocess stdout (fd in sql[0])
echo "result: $result"            # "2"
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="bash"}
```bash
# ── `kill -9` can't be caught — no cleanup runs ──
# The process is immediately terminated by the kernel. No trap, no EXIT, no cleanup.
# Always try SIGTERM first: kill $pid; sleep 5; kill -9 $pid

# ── `$!` changes with each new background command ──
# Capture it immediately: cmd &; pid=$!
# If you run another cmd & in between, $! is the new command's PID.

# ── `wait` only works for jobs of the CURRENT shell ──
# In a subshell: ( cmd & ); wait  → fails (the subshell's job is gone after it exits)
# Run wait inside the subshell: ( cmd &; wait )  → works

# ── `trap` in a subshell doesn't affect the parent ──
# ( trap 'echo sub' EXIT; echo "in sub" )  → the parent's EXIT trap is unchanged.

# ── `trap EXIT` fires ONCE ──
# On exit, the EXIT trap runs once. If you set multiple trap EXIT, last one wins.
# Combine all cleanup in one function: trap 'cleanup_all' EXIT

# ── `timeout` exit code 124 means "timed out" ──
# But 124 could also be the command's own exit code (if it happens to exit 124).
# Distinguish: `timeout --preserve-status` returns the command's real exit code.

# ── `nohup` redirects to nohup.out if stdout is a terminal ──
# If stdout is not a terminal (piped, redirected), nohup doesn't create nohup.out.
# Always redirect explicitly: nohup cmd > /tmp/log 2>&1 &

# ── Zombie processes ──
# A child that exits but isn't `wait`ed becomes a zombie (defunct process).
# The parent must `wait` to reap it. If the parent exits, init (PID 1) reaps it.
# In scripts, `wait` at the end reaps all children. In long-running scripts, `wait -n` periodically.
```
::

## 🧠 Quick Quiz

Why does this script not clean up when killed with `kill -9`?

::code-wrapper{language="bash"}
```bash
cleanup() {
    rm -f "$tmpfile"
    echo "cleaned up" >&2
}
tmpfile=$(mktemp)
trap cleanup EXIT
echo "working with $tmpfile"
sleep 60
```
::

<details>
<summary>Answer</summary>

`kill -9` sends **SIGKILL**, which **cannot be caught or handled**. The kernel terminates the process immediately — no trap runs, no cleanup function is called, `tmpfile` is left on disk.

**The fix**: There's no way to catch SIGKILL. The mitigations are:

1. **Use SIGTERM (default `kill`)** — it CAN be trapped, and `trap cleanup EXIT` fires.
2. **Clean up stale temp files on startup**: `rm -f /tmp/myapp.* 2>/dev/null` at the start.
3. **Use `mktemp` with a recognizable prefix** so you can find and clean up stale files later.

**The lesson**: SIGKILL is the nuclear option — no cleanup. Always prefer SIGTERM (the default `kill` command). Only use `kill -9` when the process is truly hung and ignoring SIGTERM.

</details>