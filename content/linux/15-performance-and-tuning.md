# 15 — Performance & Tuning

Linux performance tuning is about finding the **bottleneck** (CPU, memory, disk I/O, network) and addressing it — without making things worse. This chapter covers the tools to identify bottlenecks (`vmstat`, `iostat`, `sar`, `perf`, `pidstat`), the tuning knobs (`sysctl`, `nice`, `cgroups`), and the kernel's built-in responses (OOM killer, swappiness).

## The Four Resources

Every bottleneck is one of:

| Resource | Symptom | Tool |
|---|---|---|
| **CPU** | High load, slow response | `top`, `mpstat`, `perf` |
| **Memory** | OOM, swapping, slow | `free`, `vmstat`, `/proc/meminfo` |
| **Disk I/O** | High `await`, `%util`, slow apps | `iostat`, `iotop`, `pidstat -d` |
| **Network** | High latency, low throughput | `iftop`, `nethogs`, `ss`, `mtr` |

**Find the bottleneck first, then tune.** Tuning the wrong resource is at best useless and at worst harmful.

## CPU

### Measuring CPU

::code-wrapper{language="bash"}
```bash
top / htop                   # per-process CPU
uptime                       # load average (1, 5, 15 min)
mpstat -P ALL 1              # per-CPU, every 1s
vmstat 1                     # system-wide, every 1s (us/sy/id/wa columns)
sar -u 1                     # CPU usage over time
ps aux --sort=-%cpu | head   # top CPU consumers
``
::

### Load Average

```text
$ uptime
... load average: 1.45, 0.92, 0.78
                  └──┘ └──┘ └──┘
                   1m   5m   15m
```

Load average = average number of processes in the run queue (running + waiting for CPU). Rules of thumb:
- **Equal to CPU count** = fully utilized (good).
- **Higher than CPU count** = processes are waiting (possible bottleneck).
- **2x+ CPU count** = saturated (slow).

Check CPU count: `nproc` or `grep -c ^processor /proc/cpuinfo`. On a 4-core system, load 4 = full, load 8 = overloaded.

**But**: load average includes processes in `D` state (uninterruptible I/O wait). So high load with low CPU usage often means **disk I/O** is the bottleneck, not CPU. Check `vmstat` — the `b` column (blocked) and `wa` (I/O wait) reveal this.

### CPU States (from `vmstat` / `mpstat`)

| State | Meaning |
|---|---|
| `us` | User space (applications) |
| `sy` | System/kernel (syscalls, drivers) |
| `id` | Idle |
| `wa` | I/O wait (waiting for disk) |
| `st` | Stolen (hypervisor took it — VM only) |
| `ni` | Nice (low-priority user processes) |
| `hi`/`si` | Hardware/software interrupt |

- High `us` = CPU-bound app (optimize the app or scale).
- High `sy` (>20%) = too many syscalls, kernel work, or driver issue.
- High `wa` = disk bottleneck (not CPU!).
- High `st` = noisy neighbor on the VM host.

### CPU Priority: `nice` and `renice`

See chapter 06. Nice ranges -20 (highest) to 19 (lowest), default 0:

::code-wrapper{language="bash"}
```bash
nice -n 19 tar -czf backup.tar.gz /home     # low priority
renice -n -5 -p 1234                        # raise priority (root only)
chrt -f 80 command                          # real-time scheduling (careful!)
``
::

### CPU Governor (Frequency Scaling)

Control how the CPU scales frequency:

::code-wrapper{language="bash"}
```bash
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
# Available: conservative ondemand userspace powersave performance schedutil

echo performance | sudo tee /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor  # max speed
echo powersave | sudo tee /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor    # save power
# All CPUs:
for gov in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
  echo performance | sudo tee $gov
done
``
::

- `performance` — max frequency always (servers).
- `powersave` — min frequency (laptops on battery).
- `ondemand` / `schedutil` — scale based on load (default on most).

### `perf` — Profiling

`perf` is the kernel's performance profiling tool:

::code-wrapper{language="bash"}
```bash
sudo perf top                    # live function-level profiling
sudo perf top -p 1234            # profile a specific PID
sudo perf record -p 1234 -- sleep 10   # record for 10s
sudo perf report                 # analyze the recording
sudo perf stat command           # counter stats (cache misses, branches)
sudo perf stat -d command        # detailed (L1 cache, etc.)
``
::

`perf` shows *which function* is using the CPU — essential for optimizing a slow app.

## Memory

### Measuring Memory

::code-wrapper{language="bash"}
```bash
free -h                         # RAM + swap (human-readable)
cat /proc/meminfo               # detailed
vmstat 1                        # si/so (swap in/out), free, buff, cache
ps aux --sort=-%mem | head      # top memory consumers
smem -t -k | tail -20           # memory per process (accounts shared memory correctly)
pidstat -r 1                    # per-process memory, every 1s
sar -r 1                        # memory over time
sar -S 1                        # swap over time
sar -B 1                        # paging
``
::

### Understanding `free -h`

```text
              total   used    free   shared  buff/cache  available
Mem:           15G     4.2G    2.1G   210M    9.3G         10G
Swap:         2.0G     0B     2.0G
```

- **total** — physical RAM.
- **used** — RAM in use (excluding buffers/cache).
- **free** — completely unused RAM.
- **buff/cache** — kernel buffers + page cache (reclaimable).
- **available** — estimate of RAM available for new apps (free + reclaimable cache).

**Key insight**: high `used` + low `free` is *normal* on Linux — the kernel uses free RAM for cache (making things faster). **`available` is the number to watch**, not `free`. If `available` is low, you're out of memory.

### Swap

Swap is disk space used as memory overflow. It's much slower than RAM.

::code-wrapper{language="bash"}
```bash
swapon --show                   # active swap
free -h                         # swap usage
cat /proc/sys/vm/swappiness     # tendency to swap (0-100, default 60)
vmstat 1                        # si/so columns = swap in/out (should be 0)
``
::

- `si`/`so` (swap in/out) in `vmstat` should be 0. Non-zero = memory pressure.
- **`swappiness`**: 0 = never swap (until OOM), 100 = swap aggressively. Servers often set 10-20. Databases: 1.

::code-wrapper{language="bash"}
```bash
sudo sysctl vm.swappiness=10    # temporary
echo "vm.swappiness = 10" | sudo tee /etc/sysctl.d/99-swappiness.conf  # persistent
``
::

### OOM Killer

When memory is exhausted and swap is full (or disabled), the **OOM killer** terminates a process to free memory. It picks the process with the highest "oom_score" (roughly, the biggest memory consumer).

::code-wrapper{language="bash"}
```bash
cat /proc/<pid>/oom_score       # this process's OOM score (higher = more likely killed)
cat /proc/<pid>/oom_score_adj   # adjustment (-1000 to 1000)
echo -1000 | sudo tee /proc/<pid>/oom_score_adj   # never kill this process
echo 1000 | sudo tee /proc/<pid>/oom_score_adj    # always kill this first
``
::

In a unit file:

```ini
[Service]
OOMScoreAdjust=-500      # protect this service from OOM killer
```

Check OOM kills:

::code-wrapper{language="bash"}
```bash
journalctl -k | grep -i "out of memory"     # kernel OOM messages
journalctl -k | grep -i "killed process"    # which process was killed
dmesg | grep -i "oom"
``
::

### `overcommit`

Linux (by default) allows allocating more memory than exists (`overcommit`), relying on the fact that processes don't use all they allocate. This can cause OOM kills.

::code-wrapper{language="bash"}
```bash
cat /proc/sys/vm/overcommit_memory
# 0 = heuristic (default — allow reasonable overcommit)
# 1 = always (allow any allocation — dangerous)
# 2 = strict (never overcommit — safer for databases)
``
::

For databases (PostgreSQL, Oracle), set `vm.overcommit_memory=2` to get predictable allocation failures instead of OOM kills.

### Memory Tuning Parameters

| Parameter | Effect |
|---|---|
| `vm.swappiness` | Swap tendency (0-100) |
| `vm.overcommit_memory` | Overcommit policy (0/1/2) |
| `vm.dirty_ratio` | % of RAM for dirty pages before blocking writes (default 20) |
| `vm.dirty_background_ratio` | % when background writeback starts (default 10) |
| `vm.vfs_cache_pressure` | Tendency to reclaim inode/dentry cache (default 100) |
| `vm.min_free_kbytes` | Minimum free RAM to keep (emergency reserve) |

## Disk I/O

### Measuring Disk I/O

::code-wrapper{language="bash"}
```bash
iostat -x 1                     # per-device extended stats, every 1s
iostat -x 1 5                   # 5 times
iotop -o                        # per-process I/O (like top for disk)
pidstat -d 1                    # per-process disk I/O
sar -d 1                        # per-device over time
sar -b 1                        # overall I/O
vmstat 1                        # bi/bo (blocks in/out), wa (I/O wait)
``
::

### `iostat -x` Key Columns

```text
Device  r/s  w/s  rkB/s  wkB/s  rrqm/s  wrqm/s  %util  await
sda     50   100  800    1600    5       10      85     15.2
```

| Column | Meaning |
|---|---|
| `r/s`, `w/s` | Reads/writes per second |
| `rkB/s`, `wkB/s` | Read/write KB/s |
| `await` | Average time (ms) for I/O to complete |
| `%util` | Percentage of time the device was busy |

- `%util` near 100% = disk saturated.
- `await` > 10-20 ms (SSD) or > 50 ms (HDD) = slow disk.
- High `w/s` + high `await` = write-bound.
- Compare `r/s` + `w/s` to device specs (SSD: 10k-100k IOPS; HDD: 100-200 IOPS).

### I/O Priority: `ionice`

Like `nice` but for disk I/O:

::code-wrapper{language="bash"}
```bash
ionice -c 3 -n 7 tar -czf backup.tar.gz /home    # idle class (only when disk is idle)
ionice -c 2 -n 0 command                          # best-effort, high priority
ionice -c 1 command                               # realtime (blocks others — careful)
ionice -p 1234                                    # check a process's I/O priority
``
::

Classes:
- `1` (realtime) — highest, can starve others.
- `2` (best-effort, default) — priority 0-7 (0 highest).
- `3` (idle) — only when no one else is using the disk.

### I/O Scheduler

The kernel's I/O scheduler orders disk requests. Check and change:

::code-wrapper{language="bash"}
```bash
cat /sys/block/sda/queue/scheduler
# [mq-deadline] kyber bfq none

echo bfq | sudo tee /sys/block/sda/queue/scheduler   # change (temporary)
``
::

Schedulers:
- `mq-deadline` — good for SSDs and general use.
- `bfq` — good for interactive/desktop (fair queuing).
- `kyber` — good for NVMe.
- `none` — no scheduling (fastest for NVMe, let the device handle it).

### Filesystem Tuning

Mount options that affect performance:

| Option | Effect |
|---|---|
| `noatime` | Don't update access time (reduce writes) |
| `nodiratime` | Don't update dir access time |
| `relatime` | Update atime only if older than mtime (default, good compromise) |
| `data=writeback` | (ext4) faster, less safe (metadata journaled, data not) |
| `data=ordered` | (ext4 default) safe, moderate |
| `data=journal` | (ext4) safest, slowest |
| `barrier=0` | Disable write barriers (faster, risk on power loss) |
| `discard` | Enable TRIM (SSD) |

::code-wrapper{language="bash"}
```bash
# /etc/fstab
UUID=...  /  ext4  defaults,noatime  0  1
``
::

### Read-Ahead

Increase read-ahead for sequential workloads (databases, media):

::code-wrapper{language="bash"}
```bash
cat /sys/block/sda/queue/read_ahead_kb    # default 128 KB
echo 256 | sudo tee /sys/block/sda/queue/read_ahead_kb  # increase
``
::

## Network

### Measuring Network

::code-wrapper{language="bash"}
```bash
ip -s link show eth0           # interface stats (rx/tx bytes, packets, errors)
sar -n DEV 1                   # per-interface over time
iftop                          # per-connection bandwidth (like top for network)
nethogs                        # per-process bandwidth
ss -i                          # TCP socket internal info (RTT, congestion, cwnd)
ethtool -S eth0                # hardware counters (errors, drops)
ethtool eth0                   # link speed, duplex
``
::

### Key Metrics

| Metric | Where | Concerning |
|---|---|---|
| rx/tx bytes | `ip -s link` | — |
| rx/tx packets | `ip -s link` | — |
| rx errors/drops | `ip -s link` | > 0 (hardware, buffer) |
| retransmits | `ss -i` | High (packet loss) |
| `tc` drops | `tc -s qdisc show` | Queue full (congestion) |

### Network Tuning

| Parameter | Effect |
|---|---|
| `net.core.rmem_max` / `wmem_max` | Max socket buffer size |
| `net.core.somaxconn` | Max listen backlog |
| `net.ipv4.tcp_tw_reuse` | Reuse TIME_WAIT sockets (high-conn) |
| `net.ipv4.tcp_fin_timeout` | TIME_WAIT duration |
| `net.ipv4.tcp_keepalive_time` | Keepalive interval |
| `net.ipv4.tcp_slow_start_after_idle` | 0 = disable (for long-lived) |
| `net.ipv4.tcp_congestion_control` | `cubic` (default), `bbr` (better on high-latency) |

Example for a high-traffic server (`/etc/sysctl.d/99-network.conf`):

```text
net.core.somaxconn = 65535
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_congestion_control = bbr
```

### Enable BBR (Better Congestion Control)

::code-wrapper{language="bash"}
```bash
echo "net.core.default_qdisc = fq" | sudo tee /etc/sysctl.d/99-bbr.conf
echo "net.ipv4.tcp_congestion_control = bbr" | sudo tee -a /etc/sysctl.d/99-bbr.conf
sudo sysctl --system
sysctl net.ipv4.tcp_congestion_control   # verify: bbr
``
::

BBR (Bottleneck Bandwidth and RTT) is Google's congestion control algorithm — often better than cubic on high-latency or lossy links.

## `cgroups` — Resource Limits

**cgroups** (control groups) let you limit a group of processes' CPU, memory, I/O, and devices. The foundation of containers (Docker/Podman) and systemd resource control.

### Via systemd (Easiest)

In a unit file:

```ini
[Service]
CPUQuota=50%              # max 50% of one CPU
CPUWeight=100             # relative weight (1-10000, default 100)
MemoryMax=512M            # hard memory limit (OOM-kill if exceeded)
MemoryHigh=400M           # soft limit (throttle, don't kill)
TasksMax=100              # max PIDs
IOWeight=100              # I/O weight (1-10000)
IOReadBandwidthMax=/dev/sda 10M   # max read speed
IOSWriteBandwidthMax=/dev/sda 10M  # max write speed
```

::code-wrapper{language="bash"}
```bash
# Ad-hoc:
sudo systemd-run --unit=test --CPUQuota=25% --MemoryMax=256M \
    --slice=test.slice stress --cpu 4 --vm 2 --vm-bytes 128M
``
::

### Via `cgroup-tools` (Direct)

::code-wrapper{language="bash"}
```bash
# cgroups v2 (modern, single hierarchy)
cat /sys/fs/cgroup/cgroup.controllers    # available controllers
sudo cgcreate -g cpu,memory:/mygroup
sudo cgset -r cpu.max="50000 100000" mygroup   # 50% CPU
sudo cgset -r memory.max=536870912 mygroup     # 512 MB
sudo cgexec -g cpu,memory:mygroup my_command
``
::

## `systemd-analyze` — Boot Performance

::code-wrapper{language="bash"}
```bash
systemd-analyze                    # total boot time
systemd-analyze blame              # services sorted by startup time
systemd-analyze critical-chain     # the slow path
systemd-analyze critical-chain nginx.service   # for a specific service
systemd-analyze plot > boot.svg    # generate a visual timeline
``
::

## Quick Diagnostic Flow

1. **Is it CPU?** `uptime` (high load?), `top`/`htop` (which process?), `vmstat 1` (high `us`/`sy`?).
2. **Is it memory?** `free -h` (low `available`?), `vmstat 1` (si/so non-zero?).
3. **Is it disk?** `iostat -x 1` (high `%util`/`await`?), `iotop` (which process?).
4. **Is it network?** `iftop` (bandwidth?), `mtr` (latency/loss?), `ss -i` (retransmits?).

**Don't tune until you've identified the bottleneck.**

## 💡 Tips & Tricks

- **Idiom**: use `free -h` and watch `available` (not `free`) — Linux uses free RAM for cache (good). `available` is what apps can actually use (free + reclaimable cache). Low `available` = memory pressure. `free` being low is normal and not a problem.
- **Idiom**: use `iostat -x 1` and watch `%util` + `await` — `%util` near 100% = disk saturated. `await` > 10-20 ms (SSD) or > 50 ms (HDD) = slow disk. This is the #1 cause of "the app is slow" — usually disk, not CPU.
- **Idiom**: use `nice -n 19` + `ionice -c3` for non-urgent heavy jobs — backups, `find /`, indexing. `nice` lowers CPU priority, `ionice -c3` lowers I/O priority (only uses disk when idle). Prevents heavy jobs from disrupting interactive work.
- **Idiom**: set `vm.swappiness=10` on servers (1 for databases) — default 60 swaps too eagerly for production. 10 reduces swapping, keeping apps in RAM. Databases should be 1 (or 0 with enough RAM). Persist in `/etc/sysctl.d/`.
- **Idiom**: use systemd `MemoryMax=` to limit service memory — prevents a buggy service from eating all RAM and triggering OOM killer (which might kill the *wrong* process). `MemoryMax=512M` OOM-kills just that service when it exceeds 512 MB.
- **Idiom**: set `noatime` in `fstab` for SSDs — disables access-time updates on every read (reduces writes, improves SSD lifespan). `relatime` (default) is a safe compromise; `noatime` is more aggressive. Also enables `discard` (TRIM) for SSDs.
- **Idiom**: use `systemd-analyze blame` to find slow services — lists services by startup time. Disable or delay non-critical ones with `systemctl disable` or `systemctl edit` + `After=...`. Shaves seconds off boot.
- **Debug**: use `vmstat 1` and check `wa` (I/O wait) + `b` (blocked) — if load is high but `us` (user CPU) is low, the bottleneck is disk I/O (processes waiting in `D` state), not CPU. This is the most common "high load but CPU looks fine" mystery.
- **Debug**: use `perf top` to find the exact function using CPU — `top` shows which *process* is busy, `perf top` shows which *function* within it. Essential for optimizing a slow app (reveals hot loops, lock contention).
- **Debug**: use `journalctl -k | grep -i oom` after a mysterious process death — the OOM killer logs which process it killed and why. `oom_score_adj` can protect critical services (`-1000` = never kill).

## ⚠️ Edge Cases & Gotchas

- **High load average isn't always CPU**: load includes processes in `D` state (uninterruptible I/O wait). High load + low CPU usage = disk bottleneck, not CPU. Check `vmstat` — `b` (blocked) and `wa` (I/O wait) reveal the true cause.
- **`free` being low is normal**: Linux uses free RAM for page cache (making apps faster). `free` near 0 is expected and fine. Watch `available` — if *that's* low, you're out of memory. People often panic at low `free` and "fix" it by adding swap (unnecessary).
- **Swapping kills performance silently**: even small swap-in/swap-out (`si`/`so` in `vmstat`) causes huge latency spikes (disk is ~1000x slower than RAM). If `si`/`so` is non-zero, you have memory pressure. Fix by adding RAM, reducing app memory, or `swappiness=1`.
- **OOM killer may kill the wrong process**: it picks the process with the highest `oom_score` (biggest memory user) — which might be your database, not the misbehaving app. Protect critical services with `OOMScoreAdjust=-1000` (systemd) or `/proc/<pid>/oom_score_adj`.
- **`nice` doesn't affect I/O or memory**: a `nice 19` process still hammers the disk and uses all RAM. Use `ionice -c3` for I/O and `cgroups`/systemd `MemoryMax` for memory. `nice` is CPU-only.
- **`ionice -c1` (realtime) can starve the disk**: it blocks all other I/O. Never use on a shared system. Use `-c3` (idle) for non-urgent, `-c2` (best-effort) for normal.
- **`noatime` can break some apps**: a few apps (like `mutt`, `tmpwatch`) rely on access times. `relatime` (default) is safer — it updates atime if older than mtime, so these apps work while reducing most atime writes.
- **`barrier=0` risks data corruption on power loss**: write barriers ensure write ordering. Disabling them (`barrier=0` or `nobarrier`) is faster but risks filesystem corruption on power loss. Don't use on production unless you have a battery-backed cache.
- **Tuning can make things worse**: changing `tcp_tw_reuse`, `dirty_ratio`, scheduler, etc. without measuring can degrade performance. Always benchmark before and after (`sysbench`, `fio`, `wrk`). Keep changes small and test one at a time.
- **`overcommit_memory=1` allows allocations beyond RAM+swap**: apps can `malloc` huge amounts and the kernel says "yes" — then OOM kills when they actually use it. Default (0) is usually fine. Set 2 for databases (strict, predictable failures).
- **`cgroups` v1 vs v2**: modern distros use cgroups v2 (unified hierarchy). Some tools/docs assume v1 (separate hierarchies per controller). `systemctl status` shows the cgroup path. `docker` and `podman` now support v2.
- **BBR can hurt on some networks**: it's great on high-latency/lossy links but can be aggressive on local networks, potentially saturating links. Test before deploying widely. Some cloud providers block custom congestion control.
- **`read_ahead_kb` too high wastes memory and hurts random I/O**: large read-ahead is good for sequential (media, backups) but wastes cache for random I/O (databases). Default 128 KB is a good balance. Only increase for known sequential workloads.

## 🧠 Spot the Bug

A server is slow. The admin checks `uptime`:

```text
load average: 16.20, 15.85, 15.70
```

They check `top` — CPU usage is 20% (`us` 15%, `sy` 5%, `id` 80%). They conclude "the load is wrong, CPU is mostly idle." They check CPU count: 4 cores. What's actually happening, and what should they check next?

<details>
<summary>Answer</summary>

**The load average includes processes in `D` state (uninterruptible I/O wait), not just CPU-bound processes.** Load 16 on 4 cores with 80% idle CPU means ~15-16 processes are stuck in `D` state — waiting for **disk I/O**, not CPU. The bottleneck is the disk, not the CPU.

**Check next:**

::code-wrapper{language="bash"}
```bash
# 1. Confirm I/O wait is high
vmstat 1
# procs ----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
#  r  b  swpd  free  buff cache   si   so    bi    bo   in   cs us sy id wa st
#  1 16     0 200M  500M 12G       0    0   800   200 5000 8000 15  5 70 10  0
#         ↑                                                              ↑
#    16 blocked                                                   10% I/O wait
```
::
- `b` = 16 (16 processes blocked in I/O).
- `wa` = 10% (I/O wait — non-zero confirms disk bottleneck).
- `bi`/`bo` = blocks in/out (high = active disk I/O).

::code-wrapper{language="bash"}
```bash
# 2. Find which disk is saturated
iostat -x 1
# Device  r/s  w/s  rkB/s  wkB/s  %util  await
# sda     200  300  3200   4800    98     25.3
#                                                   ↑     ↑
#                                             98% busy  25ms latency (slow SSD)
```
::
`%util` = 98% (disk is saturated), `await` = 25 ms (slow for an SSD — indicates the disk can't keep up).

::code-wrapper{language="bash"}
```bash
# 3. Find which processes are doing the I/O
iotop -o          # or: pidstat -d 1
# TID  PRIO  USER  DISK READ  DISK WRITE  COMMAND
# 1234 be/4 alice  2.5 M/s     4.0 M/s     postgres
# 5678 be/4 bob    1.0 M/s     0.5 M/s     dd if=/dev/zero of=/tmp/big
```
::

**Root cause**: a process (here, `dd` or heavy database queries) is saturating the disk. Fix options:
- Kill or `ionice -c3` the offending process.
- Move the database to a faster disk (SSD/NVMe) or add more disks.
- Add RAM (more cache = fewer disk reads).
- Optimize the queries (fewer disk reads).

**The lesson**: **load average ≠ CPU usage.** Load includes `D` (uninterruptible I/O) state. High load + high idle CPU = disk bottleneck. Always check `vmstat` (`b` and `wa` columns) to distinguish CPU-bound from I/O-bound.
</details>