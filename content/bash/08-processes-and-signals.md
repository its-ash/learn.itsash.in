# 08 — Processes & Signals

Bash manages processes — background/foreground, signals, job control, and process substitution. Understanding these is key for automation and long-running scripts.

## Running Processes

### Foreground

::code-wrapper{language="bash"}
```bash
./long_running.sh   # runs in foreground (blocks the terminal)
```
::
### Background

::code-wrapper{language="bash"}
```bash
./long_running.sh &   # runs in background (returns immediately)
# [1] 12345   (job 1, PID 12345)
```
::
`&` runs the command in the background. The shell prints the job number and PID. You can continue working.

### `$!` (last background PID)

::code-wrapper{language="bash"}
```bash
./script.sh &
pid=$!
echo "Started PID $pid"
wait "$pid"   # wait for it to finish
echo "Exit status: $?"
```
::
`$!` is the PID of the last backgrounded command. `wait` blocks until it finishes; `$?` is its exit status.

## Job Control

::code-wrapper{language="bash"}
```bash
./script.sh &        # background (job 1)
jobs                 # list background jobs
fg %1                # bring job 1 to foreground
bg %1                # resume job 1 in background (if stopped)
Ctrl-Z               # suspend the foreground job
kill %1              # terminate job 1
kill $pid            # terminate by PID
```
::
- `jobs` — list background/stopped jobs.
- `fg`/`bg` — foreground/background a job.
- `Ctrl-Z` — suspend (stop) the foreground process (sends SIGSTOP via the terminal).
- `kill` — send a signal (default TERM).

## Signals

::code-wrapper{language="bash"}
```bash
kill PID              # SIGTERM (15) — polite request to terminate
kill -9 PID           # SIGKILL (9) — force (can't be caught)
kill -15 PID          # SIGTERM (explicit)
kill -HUP PID         # SIGHUP (hangup — often "reload config")
kill -INT PID         # SIGINT (Ctrl-C)
kill -TERM PID        # SIGTERM
kill -l               # list all signals
```
::
Common signals:
- **SIGINT (2)** — Ctrl-C (interrupt).
- **SIGTERM (15)** — polite terminate (default for `kill`). Can be caught (trap).
- **SIGKILL (9)** — force kill (can't be caught, immediate). Last resort.
- **SIGHUP (1)** — hangup (terminal closed). Often used for "reload config."
- **SIGSTOP (19)** — pause (can't be caught).
- **SIGCONT (18)** — resume.
- **SIGUSR1/USR2** — user-defined (custom triggers).

### `kill -9` last resort

`kill -9` (SIGKILL) can't be caught or ignored — the process is immediately terminated (no cleanup). Always try `kill` (SIGTERM) first; use `kill -9` only if the process ignores SIGTERM (hung).

## `trap` (signal handling)

::code-wrapper{language="bash"}
```bash
cleanup() {
	echo "Cleaning up..."
	rm -f "$tmpfile"
	exit
}

tmpfile=$(mktemp)
trap cleanup EXIT INT TERM   # run cleanup on exit, Ctrl-C, or SIGTERM

# ... script logic ...
```
::
`trap 'command' SIGNALS` runs `command` when a signal is received. `EXIT` is a pseudo-signal (runs on any exit). Use for cleanup (temp files, locks, partial state).

### Common trap patterns

::code-wrapper{language="bash"}
```bash
# Cleanup on exit
trap 'rm -f "$tmpfile"' EXIT

# Graceful shutdown of a server
trap 'echo "Shutting down..."; kill "$server_pid"; wait "$server_pid"' TERM INT

# Reload config
trap 'load_config' HUP
```
::
### Ignoring a signal

::code-wrapper{language="bash"}
```bash
trap '' INT   # ignore Ctrl-C
# ... critical section ...
trap - INT    # restore default
```
::
`trap '' SIGNAL` ignores the signal; `trap - SIGNAL` restores the default.

## `wait`

::code-wrapper{language="bash"}
```bash
./job1.sh &
./job2.sh &
./job3.sh &
wait   # wait for all background jobs
echo "All done"

# Wait for specific PIDs
pid1=$!
./job2.sh &
pid2=$!
wait "$pid1" "$pid2"
echo "Both done"
```
::
`wait` (no arg) waits for all background jobs. `wait PID` waits for a specific one. After `wait PID`, `$?` is that job's exit status.

### `wait -n` (Bash 5.1+)

::code-wrapper{language="bash"}
```bash
./job1.sh &
./job2.sh &
./job3.sh &
wait -n   # wait for any one to finish
echo "One job completed"
```
::
`wait -n` waits for *any one* background job to finish. Useful for job pools.

## Process Substitution (recap)

::code-wrapper{language="bash"}
```bash
diff <(./gen_a.sh) <(./gen_b.sh)
```
::
`<(cmd)` runs `cmd` and provides its output as a temporary file descriptor. Avoids temp files.

## `xargs` (parallel)

::code-wrapper{language="bash"}
```bash
find . -name "*.py" | xargs grep "main"        # grep in all .py files
find . -name "*.py" -print0 | xargs -0 grep "main"   # safe (null-delimited)

# Parallel
ls *.png | xargs -P 4 -I {} convert {} {}.thumb.png   # 4 parallel converts
```
::
`-P N` runs N processes in parallel. `-0` handles null-delimited input (safe with `-print0`). `-I {}` sets a placeholder.

## `timeout`

::code-wrapper{language="bash"}
```bash
timeout 30 ./slow_script.sh        # kill after 30 seconds
timeout -s KILL 30 ./slow.sh       # use SIGKILL
timeout --preserve-status 30 ./script.sh   # preserve the exit status
```
::
`timeout` runs a command with a time limit. Useful for scripts that might hang.

## `nohup` and `disown`

::code-wrapper{language="bash"}
```bash
nohup ./long_script.sh &   # survives logout (immune to SIGHUP)
disown -h %1               # keep job 1 after shell exits
```
::
`nohup` makes a process immune to SIGHUP (survives terminal close). Output goes to `nohup.out`. `disown` removes a job from the shell's job table (it survives shell exit).

## Process Inspection

::code-wrapper{language="bash"}
```bash
ps aux               # all processes
ps aux | grep bash   # find bash processes
pgrep -f "script.sh" # PIDs matching a pattern
pkill -f "script.sh" # kill by pattern
pstree -p            # process tree with PIDs
top                  # interactive process monitor
htop                 # better interactive monitor (install separately)
```
::
## 💡 Tips & Tricks

- **Idiom**: use `trap 'rm -f "$tmp"; cleanup' EXIT` for cleanup — `EXIT` is a pseudo-signal that runs on any exit (normal, error with `set -e`, or signal). Combine all cleanup in one function. Never leave temp files behind.
- **Idiom**: use `kill` (SIGTERM) before `kill -9` (SIGKILL) — SIGTERM can be caught (trap) for graceful shutdown; SIGKILL is immediate (no cleanup). Try `kill $pid` first; `kill -9` only if it hangs.
- **Idiom**: use `wait` (or `wait -n` in Bash 5.1+) to wait for background jobs — `wait` (no arg) waits for all; `wait PID` for a specific one; `wait -n` for any one (job pools). After `wait`, `$?` is the job's exit status.
- **Idiom**: use `xargs -0` with `find -print0` for safe parallel processing — `find . -name "*.py" -print0 | xargs -0 grep "main"` handles filenames with spaces. `-P N` runs N processes in parallel.
- **Idiom**: use `timeout` for commands that might hang — `timeout 30 ./script.sh` kills it after 30s (SIGTERM). Use `-s KILL` for SIGKILL. Essential for CI/CD and automation.

## ⚠️ Edge Cases & Gotchas

- **`kill -9` can't be caught**: SIGKILL immediately terminates (no trap, no cleanup). Use only as a last resort (process hung, ignoring SIGTERM). Try `kill` (SIGTERM) first.
- **Background jobs die when the shell exits**: unless `nohup`/`disown`/`setsid` is used. For scripts that should survive logout, use `nohup script.sh &` or a service manager (systemd).
- **`wait` in a subshell**: `wait` only waits for jobs of the *current* shell. In a subshell (`(cmd &) ; wait`), the subshell's jobs don't exist after it exits. Run `wait` inside the subshell.
- **`$!` is the last background PID**: but if another command runs in between, `$!` changes. Capture it immediately: `cmd &; pid=$!`.
- **`trap` in a subshell doesn't affect the parent**: traps are shell-specific. A `trap` in `( ... )` doesn't apply to the parent shell.
- **`trap EXIT` and `set -e`**: on a `set -e` abort, `EXIT` still runs (the trap fires). But `INT`/`TERM` traps might not (the abort happens before). Combine cleanup in `EXIT` for reliability.
- **`kill` requires a PID or job spec**: `kill %1` (job 1) or `kill 12345` (PID). `kill "script.sh"` doesn't work — use `pkill -f "script.sh"`.
- **`xargs` with special chars**: `xargs` without `-0` breaks on spaces/quotes. Always use `-0` with `find -print0`. Or use `find -exec ... {} +`.
- **`timeout` exit status**: `timeout` returns 124 if the command timed out, or the command's exit status otherwise. Distinguish: `timeout 30 cmd; status=$?; [[ $status -eq 124 ]] && echo "timed out"`.
- **`nohup` redirects to `nohup.out`**: if stdout is a terminal, `nohup` redirects it to `nohup.out` (and stderr to stdout). Redirect explicitly: `nohup cmd > out.log 2>&1 &`.

## 🧠 Spot the Bug

A developer runs three jobs in parallel, but `wait` doesn't give the expected exit status:

::code-wrapper{language="bash"}
```bash
./job1.sh &
./job2.sh &
./job3.sh &
wait
echo "Exit status: $?"
```
::

After all jobs finish, `$?` isn't the exit status of any job. Why?

<details>
<summary>Answer</summary>

`wait` (no argument) waits for all background jobs to finish, but `$?` after it is the exit status of the *last* job that finished (which is non-deterministic — jobs finish in any order). It's not the exit status of a specific job, and it doesn't reflect whether *all* jobs succeeded.

The fix — capture each job's PID and `wait` for them individually:

```bash
./job1.sh &
pid1=$!
./job2.sh &
pid2=$!
./job3.sh &
pid3=$!

wait "$pid1"; status1=$?
wait "$pid2"; status2=$?
wait "$pid3"; status3=$?

if ((status1 == 0 && status2 == 0 && status3 == 0)); then
	echo "All succeeded"
else
	echo "Some failed: $status1 $status2 $status3"
	exit 1
fi
```
::
Or use an array to collect PIDs and check all:

```bash
pids=()
./job1.sh & pids+=($!)
./job2.sh & pids+=($!)
./job3.sh & pids+=($!)

for pid in "${pids[@]}"; do
	wait "$pid" || { echo "Job $pid failed"; exit 1; }
done
echo "All succeeded"
```
::
**The lesson**: `wait` (no arg) waits for all jobs, but `$?` is only the last job's status (non-deterministic). To check all, capture each PID (`$!`), `wait` for each, and check each exit status. Don't rely on `wait`'s `$?` for "all succeeded."

</details>

## Summary

You can run processes (foreground/background with `&`), use job control (`jobs`/`fg`/`bg`/Ctrl-Z), handle signals (`kill`/`kill -9`/SIGTERM vs SIGKILL, `trap`, `EXIT`), wait for jobs (`wait`/`wait -n`), use process substitution (`<(...)`), parallelize (`xargs -P`, `timeout`), survive logout (`nohup`/`disown`), and inspect (`ps`/`pgrep`/`pkill`/`top`) — with the `wait`-status and `kill -9`-last-resort traps internalized. Next: arrays and data structures.