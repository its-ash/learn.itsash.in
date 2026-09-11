# 15 — Performance & Tuning

Linux performance tuning is about finding the **bottleneck** (CPU, memory, disk I/O, network) and addressing it — without making things worse. This chapter covers the tools to identify bottlenecks, the tuning knobs, and the kernel's built-in responses (OOM killer, swappiness).

## The Four Resources

| Resource | Symptom | Tool |
|---|---|---|
| **CPU** | High load, slow response | `top`, `mpstat`, `perf` |
| **Memory** | OOM, swapping, slow | `free`, `vmstat`, `/proc/meminfo` |
| **Disk I/O** | High `await`, `%util`, slow apps | `iostat`, `iotop`, `pidstat -d` |
| **Network** | High latency, low throughput | `iftop`, `nethogs`, `ss`, `mtr` |

**Find the bottleneck first, then tune.** Tuning the wrong resource is at best useless and at worst harmful.

## CPU

### Load Average

::code-wrapper{language="bash"}
```bash
# Complex Implementation: interpret load average correctly
uptime
# ... load average: 1.45, 0.92, 0.78
#                   1m   5m   15m

nproc                           # CPU count
# Load = 4 on a 4-core system = fully utilized (good)
# Load = 8 on a 4-core system = overloaded (processes waiting)
```
::

### Edge Case: High Load Isn't Always CPU

::code-wrapper{language="bash"}
```bash
# Complex Implementation: diagnose "high load but CPU looks fine"
uptime                          # load average: 16.20, 15.85, 15.70
top -b -n 1 | head -5           # CPU: 20% us, 80% id (mostly idle!)
nproc                           # 4 cores → load 16 = 4x overloaded

# But CPU is idle — where's the bottleneck?
vmstat 1                        # check the "b" and "wa" columns
#  r b  ... wa
#  0 14 ... 65
# b=14 (14 processes in D state = uninterruptible I/O wait)
# wa=65 (65% I/O wait)
# → The bottleneck is DISK I/O, not CPU!
# Load average includes D-state processes, so high load + low CPU = disk bottleneck
```
::

### CPU States (from `vmstat` / `mpstat`)

| State | Meaning |
|---|---|
| `us` | User space (applications) |
| `sy` | System/kernel (syscalls, drivers) |
| `id` | Idle |
| `wa` | I/O wait (waiting for disk) |
| `st` | Stolen (hypervisor took it — VM only) |

- High `us` = CPU-bound app (optimize the app or scale).
- High `sy` (>20%) = too many syscalls, kernel work, or driver issue.
- High `wa` = disk bottleneck (not CPU!).
- High `st` = noisy neighbor on the VM host.

### CPU Priority

::code-wrapper{language="bash"}
```bash
# Complex Implementation: low-priority backup job (CPU + I/O)
nice -n 19 ionice -c 3 tar -czf backup.tar.gz /home
# nice: low CPU priority (19 = lowest)
# ionice -c 3: idle I/O class (only uses disk when no one else does)
```
::

### `perf` — Profiling

::code-wrapper{language="bash"}
```bash
# Complex Implementation: find the exact function using CPU
sudo perf top                    # live function-level profiling
sudo perf record -p 1234 -- sleep 10   # record for 10s
sudo perf report                 # analyze the recording
sudo perf stat command           # counter stats (cache misses, branches)
```
::

`perf` shows *which function* is using the CPU — essential for optimizing a slow app.

## Memory

### Understanding `free -h`

::code-wrapper{language="bash"}
```bash
free -h
#               total   used    free   shared  buff/cache  available
# Mem:           15G     4.2G    2.1G   210M    9.3G         10G
# Swap:         2.0G     0B     2.0G
```
::

- **available** — estimate of RAM available for new apps (free + reclaimable cache). **This is the number to watch**, not `free`.
- **free** — completely unused RAM. Linux uses free RAM for cache (making things faster). `free` near 0 is normal and fine.

### Edge Case: Low `free` Is Normal

::code-wrapper{language="bash"}
```bash
# NAIVE: panic at low free RAM and add swap (unnecessary)
# "free is only 200 MB! We need more swap!"
# PRODUCTION: check "available" instead
# available = 10 GB → plenty of memory. free is low because Linux uses RAM for cache.
```
::

### Swap

::code-wrapper{language="bash"}
```bash
swapon --show                   # active swap
cat /proc/sys/vm/swappiness     # tendency to swap (0-100, default 60)
vmstat 1                        # si/so columns = swap in/out (should be 0)

# Tune swappiness:
sudo sysctl vm.swappiness=10    # servers: 10, databases: 1
echo "vm.swappiness = 10" | sudo tee /etc/sysctl.d/99-swappiness.conf
```
::

### OOM Killer

::code-wrapper{language="bash"}
```bash
# Complex Implementation: protect critical services from OOM killer
# The OOM killer picks the process with the highest oom_score (biggest memory consumer)
# — which might be your database, not the misbehaving app

# Check a process's OOM score:
cat /proc/<pid>/oom_score

# Protect a service (in systemd unit):
# [Service]
# OOMScoreAdjust=-500      # protect this service (lower = less likely killed)

# Check OOM kills:
journalctl -k | grep -i "out of memory"
journalctl -k | grep -i "killed process"
```
::

### `overcommit`

::code-wrapper{language="bash"}
```bash
cat /proc/sys/vm/overcommit_memory
# 0 = heuristic (default — allow reasonable overcommit)
# 1 = always (allow any allocation — dangerous)
# 2 = strict (never overcommit — safer for databases)

# For databases (PostgreSQL, Oracle): set vm.overcommit_memory=2
# to get predictable allocation failures instead of OOM kills
```
::

## Disk I/O

### `iostat -x` Key Columns

```text
Device  r/s  w/s  rkB/s  wkB/s  %util  await
sda     50   100  800    1600    85     15.2
```

| Column | Meaning | Concerning |
|---|---|---|
| `%util` | % of time the device was busy | near 100% = saturated |
| `await` | Average time (ms) for I/O to complete | > 10-20 ms (SSD), > 50 ms (HDD) |
| `r/s`, `w/s` | Reads/writes per second | compare to device specs |

::code-wrapper{language="bash"}
```bash
# Complex Implementation: disk bottleneck diagnosis
iostat -x 1 5                   # 5 samples, 1s apart — watch for sustained high %util
iotop -o                        # which process is doing the I/O?
pidstat -d 1                    # per-process disk I/O
```
::

### I/O Priority: `ionice`

::code-wrapper{language="bash"}
```bash
# Classes:
# 1 (realtime) — highest, can starve others (NEVER on shared systems)
# 2 (best-effort, default) — priority 0-7 (0 highest)
# 3 (idle) — only when no one else is using the disk

ionice -c 3 -n 7 tar -czf backup.tar.gz /home    # idle (safe)
ionice -c 2 -n 0 command                          # best-effort, high priority
```
::

## Network

### Network Tuning

```text
# /etc/sysctl.d/99-network.conf — high-traffic server
net.core.somaxconn = 65535
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_congestion_control = bbr
```

### Enable BBR

::code-wrapper{language="bash"}
```bash
# BBR (Bottleneck Bandwidth and RTT) — often better than cubic on high-latency links
echo "net.core.default_qdisc = fq" | sudo tee /etc/sysctl.d/99-bbr.conf
echo "net.ipv4.tcp_congestion_control = bbr" | sudo tee -a /etc/sysctl.d/99-bbr.conf
sudo sysctl --system
```
::

## `cgroups` — Resource Limits

::code-wrapper{language="bash"}
```bash
# Complex Implementation: limit a service's resources via systemd
# In a unit file:
[Service]
CPUQuota=50%              # max 50% CPU
MemoryMax=512M            # hard memory limit (OOM-kill if exceeded)
TasksMax=100              # max PIDs
IOWeight=100              # I/O weight (1-10000)

# Ad-hoc:
sudo systemd-run --unit=test --CPUQuota=25% --MemoryMax=256M stress --cpu 4
```
::

## Quick Diagnostic Flow

1. **Is it CPU?** `uptime` (high load?), `vmstat 1` (high `us`/`sy`?).
2. **Is it memory?** `free -h` (low `available`?), `vmstat 1` (si/so non-zero?).
3. **Is it disk?** `iostat -x 1` (high `%util`/`await`?), `iotop` (which process?).
4. **Is it network?** `iftop` (bandwidth?), `mtr` (latency/loss?).

**Don't tune until you've identified the bottleneck.**

## 💡 Tips & Tricks

- **Idiom**: use `free -h` and watch `available` (not `free`) — Linux uses free RAM for cache (good). `available` is what apps can actually use. Low `available` = memory pressure.
- **Idiom**: use `iostat -x 1` and watch `%util` + `await` — `%util` near 100% = disk saturated. This is the #1 cause of "the app is slow" — usually disk, not CPU.
- **Idiom**: use `nice -n 19` + `ionice -c3` for non-urgent heavy jobs — backups, `find /`, indexing. Prevents heavy jobs from disrupting interactive work.
- **Idiom**: set `vm.swappiness=10` on servers (1 for databases) — default 60 swaps too eagerly for production.
- **Idiom**: use systemd `MemoryMax=` to limit service memory — prevents a buggy service from eating all RAM and triggering OOM killer (which might kill the *wrong* process).
- **Debug**: use `vmstat 1` and check `wa` (I/O wait) + `b` (blocked) — if load is high but `us` (user CPU) is low, the bottleneck is disk I/O, not CPU. This is the most common "high load but CPU looks fine" mystery.
- **Debug**: use `perf top` to find the exact function using CPU — `top` shows which *process* is busy, `perf top` shows which *function* within it.
- **Debug**: use `journalctl -k | grep -i oom` after a mysterious process death — the OOM killer logs which process it killed and why.

## ⚠️ Edge Cases & Gotchas

- **High load average isn't always CPU**: load includes processes in `D` state (uninterruptible I/O wait). High load + low CPU = disk bottleneck. Check `vmstat` — `b` (blocked) and `wa` (I/O wait) reveal the true cause.
- **`free` being low is normal**: Linux uses free RAM for page cache. `free` near 0 is expected. Watch `available` — if *that's* low, you're out of memory.
- **Swapping kills performance silently**: even small `si`/`so` in `vmstat` causes huge latency spikes (disk is ~1000x slower than RAM). If `si`/`so` is non-zero, you have memory pressure.
- **OOM killer may kill the wrong process**: it picks the highest `oom_score` (biggest memory user) — which might be your database. Protect with `OOMScoreAdjust=-1000`.
- **`nice` doesn't affect I/O or memory**: a `nice 19` process still hammers the disk. Use `ionice -c3` for I/O and `cgroups`/`MemoryMax` for memory. `nice` is CPU-only.
- **`ionice -c1` (realtime) can starve the disk**: it blocks all other I/O. Never use on a shared system. Use `-c3` (idle).
- **`noatime` can break some apps**: a few apps (like `mutt`) rely on access times. `relatime` (default) is safer.
- **`barrier=0` risks data corruption on power loss**: faster but risks filesystem corruption. Don't use in production unless you have a battery-backed cache.
- **Tuning can make things worse**: changing `tcp_tw_reuse`, `dirty_ratio`, scheduler without measuring can degrade performance. Always benchmark before and after. Keep changes small and test one at a time.
- **BBR can hurt on some networks**: great on high-latency/lossy links but can be aggressive on local networks. Test before deploying.

## 🧠 Spot the Bug

A server is slow. The admin checks `uptime`:

```text
load average: 16.20, 15.85, 15.70
```

They check `top` — CPU usage is 20% (`us` 15%, `sy` 5%, `id` 80%). They conclude "the load is wrong, CPU is mostly idle." They check CPU count: 4 cores. What's actually happening, and what should they check next?

<details>
<summary>Answer</summary>

**The load average includes processes in `D` state (uninterruptible I/O wait), not just CPU-bound processes.** Load 16 on a 4-core system with 80% idle CPU means ~14 processes are stuck in I/O wait (state `D`), not waiting for CPU.

The bottleneck is **disk I/O**, not CPU.

**Check:**

::code-wrapper{language="bash"}
```bash
vmstat 1
#  r  b  swpd  free  buff  cache  si  so  bi  bo  in  cs  us  sy  id  wa  st
#  0  14     0 200M   1G    8G     0   0  40  80  ...  ...  15   5  20  60   0
#                    ↑                                                ↑
#  b=14 (14 processes in D state)                      wa=60 (60% I/O wait)

iostat -x 1
# Device  %util  await
# sda      98     45.2
# → disk is 98% utilized, 45ms average wait = saturated

iotop -o
# → find which process is doing the I/O
```
::

The fix depends on the cause:
- **Disk too slow**: upgrade to SSD, add more disks (RAID), or use a faster filesystem.
- **One process hogging I/O**: `ionice -c3` the offender, or use `cgroups` to limit I/O.
- **Memory pressure causing swap I/O**: check `free -h` and `vmstat si/so` — add RAM or reduce memory usage.
- **Too many concurrent I/O operations**: tune the application to batch writes or use async I/O.

The key insight: **load average is not a CPU metric — it's a "processes waiting for resources" metric. High load + low CPU = I/O bottleneck.**
</details>