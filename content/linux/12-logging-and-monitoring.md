# 12 — Logging & Monitoring

Logs are how you know what's happening on your system. This chapter covers systemd-journald (the modern default), traditional syslog, `logrotate`, kernel logs (`dmesg`), and real-time monitoring tools (`sar`, `atop`, `dstat`).

## The Logging Landscape

```text
┌────────────────────────────────────────────────┐
│  Application / Service                          │
│     ↓ (writes to stdout/stderr, or syslog API) │
├────────────────────────────────────────────────┤
│  journald (systemd)   ←─── /var/log/journal/    │
│     ↓ (can forward) ───────────────┐           │
├─────────────────────────────────────┴──────────┤
│  rsyslog (traditional)  ←── /var/log/*.log      │
│     ↓ (can forward to remote)                   │
├────────────────────────────────────────────────┤
│  logrotate (rotates/archives old logs)          │
└────────────────────────────────────────────────┘
```

- **journald** — systemd's logging (binary, indexed, structured).
- **rsyslog** — traditional syslog daemon (text files in `/var/log/`).
- **logrotate** — rotates/compresses/deletes old log files.

Most modern systems run **both** — journald for structured/ephemeral logs, rsyslog for text files and remote forwarding.

## journald (Recap)

See chapter 11 for full `journalctl` coverage. Key points:

- Stores logs in a binary, indexed format (not plain text).
- Location: `/run/log/journal/` (volatile, default) or `/var/log/journal/` (persistent).
- View with `journalctl`.
- Captures stdout/stderr of all systemd services automatically.

::code-wrapper{language="bash"}
```bash
journalctl -u nginx -f          # follow nginx logs
journalctl -b -p err            # current boot, errors only
journalctl --since "1 hour ago" --until now
journalctl --vacuum-size=500M   # limit disk usage
``
::

### `journald.conf` — Config

::code-wrapper{language="bash"}
```bash
cat /etc/systemd/journald.conf
# [Journal]
# Storage=auto         # auto (persistent if /var/log/journal exists), volatile, persistent, none
# Compress=yes         # compress old logs
# SystemMaxUse=        # max disk usage (e.g., 500M, 2G)
# MaxRetentionSec=     # how long to keep (e.g., 1month, 1year)
# RateLimitIntervalSec=30s   # throttle (if a service logs too fast)
# RateLimitBurst=10000
# ForwardToSyslog=yes  # forward to rsyslog
# ForwardToWall=yes    # emergency messages to all terminals
``
::

After editing: `sudo systemctl restart systemd-journald`.

## Traditional Syslog (`/var/log/`)

Before journald, all logs were text files in `/var/log/`. The **syslog protocol** (RFC 5424) defines facilities and priorities:

### Facilities

| Code | Facility | Example |
|---|---|---|
| 0 | kern | Kernel messages |
| 1 | user | User processes |
| 2 | mail | Mail system |
| 3 | daemon | System daemons (nginx, sshd) |
| 4 | auth | Security/auth (`sudo`, `su`) |
| 5 | syslog | syslog itself |
| 6 | lpr | Printer |
| 7 | news | Usenet |
| 9 | cron | Cron daemon |
| 10 | authpriv | Private auth (`/var/log/auth.log`) |
| 16 | local0–local7 | Custom (apps, network devices) |

### Priorities

Same as journald: emerg (0), alert (1), crit (2), err (3), warning (4), notice (5), info (6), debug (7).

### Key Log Files

| File | Contents |
|---|---|
| `/var/log/syslog` or `/var/log/messages` | General system log (Debian: `syslog`, RHEL: `messages`) |
| `/var/log/auth.log` or `/var/log/secure` | Auth: logins, sudo, su (Debian: `auth.log`, RHEL: `secure`) |
| `/var/log/kern.log` | Kernel messages |
| `/var/log/cron` | Cron job execution |
| `/var/log/mail.log` or `/var/log/maillog` | Mail server |
| `/var/log/dpkg.log` | Package installs (Debian) |
| `/var/log/yum.log` | Package installs (RHEL, old) |
| `/var/log/dnf.log` | Package installs (RHEL, new) |
| `/var/log/boot.log` | Boot messages (non-journald) |
| `/var/log/wtmp` | Login records (binary — use `last`) |
| `/var/log/btmp` | Failed login attempts (binary — use `lastb`) |
| `/var/run/utmp` | Current logins (binary — use `who`, `w`) |

### Reading Binary Logs

::code-wrapper{language="bash"}
```bash
last                  # login history (from wtmp)
last -n 20            # last 20 logins
last -f /var/log/wtmp # explicit file
last reboot           # reboot history
last root             # root's logins
lastb                 # failed login attempts (from btmp)
who                   # currently logged in (from utmp)
w                     # who + what they're doing
``
::

### `rsyslog` Configuration

Config in `/etc/rsyslog.conf` and `/etc/rsyslog.d/`:

```text
# /etc/rsyslog.d/50-default.conf
auth,authpriv.*         /var/log/auth.log
*.*;auth,authpriv.none  -/var/log/syslog
daemon.*                -/var/log/daemon.log
kern.*                  -/var/log/kern.log
mail.*                  -/var/log/mail.log
*.emerg                 :omusrmsg:*      # wall to all users
local0.*                /var/log/myapp.log   # custom facility
```

Format: `facility.priority action`
- `*` = all facilities/priorities.
- `.none` = exclude.
- `=` = exact priority only (`.=err`).
- `!` = less than (`.!info`).
- `-` prefix = don't sync after every write (faster, slight risk).
- Action: file path, `@host` (UDP), `@@host` (TCP), `:omusrmsg:*` (wall).

### Forward to Remote Syslog

```text
# /etc/rsyslog.d/60-remote.conf
*.*  @@logserver.example.com:514    # TCP (reliable)
# *.*  @logserver.example.com:514   # UDP (fast, unreliable)
```

Restart: `sudo systemctl restart rsyslog`.

### Sending Logs from Your App

::code-wrapper{language="bash"}
```bash
logger "Hello from the shell"                      # to syslog (user facility)
logger -t myapp "Starting up"                       # with a tag
logger -p local0.info "Info message"                # facility.local0, priority info
logger -p local0.err "Error: disk almost full"      # error priority
echo "structured" | logger -t myapp                 # from stdin
``
::

In code, use the syslog(3) library or `libsystemd` (for journald's structured fields).

## `logrotate` — Manage Log Size

Logs grow forever without intervention. `logrotate` rotates, compresses, and deletes old logs.

### Config

Main config: `/etc/logrotate.conf`. Includes `/etc/logrotate.d/*` (one file per service):

```text
# /etc/logrotate.d/nginx
/var/log/nginx/*.log {
    daily              # rotate daily (also: weekly, monthly, yearly)
    rotate 14          # keep 14 old logs
    missingok          # no error if file missing
    compress           # gzip old logs
    delaycompress      # compress on the *next* rotation (so current .1 is uncompressed)
    notifempty         # don't rotate if empty
    create 640 www-data adm   # recreate with these permissions
    sharedscripts      # run postrotate once for all matched files
    postrotate
        systemctl reload nginx >/dev/null 2>&1 || true
    endscript
}
```

### Options

| Option | Effect |
|---|---|
| `daily`/`weekly`/`monthly` | Rotation frequency |
| `rotate N` | Keep N old copies |
| `size 100M` | Rotate when file exceeds 100 MB |
| `compress` | gzip rotated logs |
| `delaycompress` | Compress one rotation later (so .1 is readable) |
| `missingok` | No error if log file doesn't exist |
| `notifempty` | Don't rotate if empty |
| `create [mode owner group]` | Create new log file after rotation |
| `copytruncate` | Copy then truncate (for apps that hold the file open) |
| `postrotate`/`endscript` | Run commands after rotation |
| `sharedscripts` | Run scripts once for all matched files |
| `dateext` | Use date-based extension (`.2026-08-22`) instead of `.1`, `.2` |
| `maxage 30` | Remove logs older than 30 days |

### Test and Debug

::code-wrapper{language="bash"}
```bash
sudo logrotate -d /etc/logrotate.d/nginx    # debug (dry run, verbose)
sudo logrotate -f /etc/logrotate.d/nginx    # force rotation now
sudo logrotate -v /etc/logrotate.conf       # verbose (actually runs)
``
::

`logrotate` runs via a systemd timer (or cron) daily. Check:

::code-wrapper{language="bash"}
```bash
systemctl list-timers | grep logrotate
# logrotate.timer  logrotate.service  daily  ...
``
::

## Kernel Logs — `dmesg`

The kernel ring buffer holds recent kernel messages (boot, hardware, drivers, errors). It's a fixed-size circular buffer in memory.

::code-wrapper{language="bash"}
```bash
dmesg                          # all kernel messages
dmesg -T                       # with human timestamps
dmesg --level=err,warn         # only errors and warnings
dmesg --since="1 hour ago"
dmesg | grep -i usb            # USB events
dmesg | grep -i error          # errors
dmesg -w                       # follow (live, like tail -f)
dmesg -c                       # clear after reading (needs root)
``
::

On systemd systems, kernel logs are also in journald (`journalctl -k`), which persists across reboots (if journald is persistent). The ring buffer itself is cleared on reboot.

### Common `dmesg` Messages

| Message | Meaning |
|---|---|
| `USB device found` | Device detected |
| `EXT4-fs error` | Filesystem corruption — check with `fsck` |
| `Out of memory: Killed process` | OOM killer activated (see chapter 15) |
| `segfault at ...` | A program crashed (bad memory access) |
| `link is up`/`link is down` | Network link status |
| `DRM` / `i915` / `amdgpu` | Graphics driver messages |
| `ACPI Error` | BIOS/firmware issue (often harmless) |
| `I/O error, dev sda` | Disk failing or bad sector |
| `hung_task` | A process is stuck waiting for I/O |

## Real-Time Monitoring

### `top` and `htop` (Recap)

See chapter 06. `htop` is more user-friendly (color, tree view, mouse, kill by F9).

### `atop` — Historical, Resource-Focused

`atop` shows per-process resource usage (CPU, memory, disk, network) and can log to a file for historical analysis:

::code-wrapper{language="bash"}
```bash
sudo apt install atop
atop                  # interactive
atop 1                # refresh every 1 second
atop -r /var/log/atop/atop_20260822  # replay a historical log
# In atop: t = forward, T = backward, b = jump to time
``
::

`atop` runs as a service (`atopacct.service`) and writes daily files to `/var/log/atop/`. Essential for post-incident analysis ("what was running at 3 AM when it crashed?").

### `sar` — System Activity Reporter

`sar` collects periodic snapshots of system performance (CPU, memory, I/O, network). Part of the `sysstat` package.

::code-wrapper{language="bash"}
```bash
sudo apt install sysstat
sudo systemctl enable --now sysstat   # start data collection

sar                 # today's CPU summary (every 10 min)
sar -u              # CPU usage
sar -r              # memory
sar -S              # swap
sar -b              # I/O (transfers/sec)
sar -d              # disk per device
sar -n DEV          # network per interface
sar -n TCP          # TCP statistics
sar -q              # run queue, load average
sar 1 5             # live: every 1s, 5 times
sar -f /var/log/sysstat/sa22   # historical: 22nd of month
sar -u -s 10:00:00 -e 12:00:00 -f /var/log/sysstat/sa22  # specific time range
``
::

`sar` stores binary data in `/var/log/sysstat/saNN` (NN = day of month). Enable `sysstat` service to collect. Indispensable for "what was the load at 3 AM?"

### `iostat` — Disk I/O

::code-wrapper{language="bash"}
```bash
iostat                 # CPU + disk summary
iostat -x              # extended (per-device: await, svctm, util%)
iostat -x 1            # every 1 second
iostat -x 1 5          # 5 times
iostat -x sda 1        # specific disk
``
::

Key extended columns:
- `%util` — percentage of time the disk was busy (100% = saturated).
- `await` — average time (ms) for I/O requests to complete (high = slow disk).
- `r/s`, `w/s` — reads/writes per second.
- `rkB/s`, `wkB/s` — read/write KB/s.

### `vmstat` — Virtual Memory

::code-wrapper{language="bash"}
```bash
vmstat               # one snapshot
vmstat 1             # every 1 second
vmstat 1 10          # 10 times
vmstat -a            # active/inactive memory
vmstat -d            # disk stats
vmstat -w            # wide output
``
::

Columns:
- `r` — processes waiting for run time (high = CPU bottleneck).
- `b` — processes in uninterruptible sleep (I/O wait).
- `swpd` — swap used.
- `free` — idle memory.
- `buff`/`cache` — buffer/cache.
- `si`/`so` — swap in/out (non-zero = memory pressure).
- `bi`/`bo` — blocks in/out (disk I/O).
- `us`/`sy`/`id`/`wa` — CPU: user/system/idle/wait.

### `mpstat` — Per-CPU

::code-wrapper{language="bash"}
```bash
mpstat -P ALL 1      # per-CPU, every 1s
``
::

### `dstat` / `pidstat`

::code-wrapper{language="bash"}
```bash
dstat                # combines vmstat, iostat, netstat (install dstat)
dstat -tcdnym        # time, CPU, disk, net, system, memory
pidstat 1            # per-process stats, every 1s
pidstat -d 1         # per-process disk I/O
pidstat -r 1         # per-process memory
pidstat -u 1         # per-process CPU
``
::

## `watch` — Run a Command Repeatedly

::code-wrapper{language="bash"}
```bash
watch -n 1 'date'                    # run date every 1s
watch -n 2 'ss -tlnp | grep :80'     # check port 80 every 2s
watch -n 5 df -h                     # disk usage every 5s
watch -n 1 'sensors'                 # temperatures every 1s
watch -n 1 -d 'free -h'              # highlight changes (-d)
``
::

## Writing Logs from Your Services

### From a systemd Unit

systemd captures stdout/stderr automatically. Direct them to journald:

```ini
[Service]
StandardOutput=journal      # default
StandardError=journal       # default
# Or append to a file:
# StandardOutput=append:/var/log/myapp.log
# StandardError=append:/var/log/myapp-error.log
```

View with `journalctl -u myapp`.

### Structured Logging (journald fields)

From code, use `sd_journal_send()` (C) or `systemd.journal` (Python) to add structured fields:

::code-wrapper{language="python"}
```python
from systemd import journal
journal.send("User logged in", MESSAGE_ID="abc123", USER_ID=42, PRIORITY=journal.LOG_INFO)
```
::

Query fields:

::code-wrapper{language="bash"}
```bash
journalctl USER_ID=42
journalctl _SYSTEMD_UNIT=nginx.service
journalctl MESSAGE_ID=abc123
``
::

## Centralized Logging (Overview)

For multi-server setups, forward logs to a central server:

| Tool | Style |
|---|---|
| rsyslog | Traditional syslog (TCP/UDP forwarding) |
| journald-remote | systemd's remote journald (HTTP) |
| Fluent Bit / Fluentd | Modern log shipper (parsers, outputs) |
| Filebeat | Elastic stack shipper |
| Promtail | Grafana/Loki shipper |
| Vector | Rust-based, high performance |

Example rsyslog forward:

```text
# /etc/rsyslog.d/60-forward.conf
*.*  @@logserver.internal:514    # TCP to logserver
```

## 💡 Tips & Tricks

- **Idiom**: use `journalctl -u <service> -f` for live log tailing — the `-f` flag follows (like `tail -f`). Pair with `--since "10 min ago"` to skip old context. This is the primary way to watch a service.
- **Idiom**: use `journalctl -b -p err` to find boot errors fast — `-b` limits to current boot, `-p err` shows errors and worse. The fastest "what went wrong today?" query. Add `--since` for a time window.
- **Idiom**: use `journalctl --list-boots` + `journalctl -b -1` for previous-boot debugging — when a reboot happened (crash, OOM, manual), `-b -1` shows the last boot's logs. `--list-boots` shows all available boots with timestamps.
- **Idiom**: use `last` and `lastb` for login forensics — `last` shows who logged in and when (from `/var/log/wtmp`); `lastb` shows failed login attempts (from `/var/log/btmp`). Essential after a suspected intrusion.
- **Idiom**: use `logrotate -d` to dry-run before relying on it — `-d` (debug) shows what *would* happen without doing it. Catches config errors (bad path, syntax) before they lose logs in production.
- **Idiom**: use `dmesg -T --level=err,warn` for hardware/driver issues — `-T` adds timestamps, `--level=err,warn` filters to the important stuff. Run after a crash, disk error, or device misbehavior.
- **Idiom**: install `sysstat` and enable it *before* you need it — `sar` data is only collected if `sysstat` is running. If you install it after an incident, there's no historical data. Enable it on every server at provisioning.
- **Debug**: use `atop` for historical "what was running at time X?" — `atop` logs per-process snapshots to `/var/log/atop/`. Replay with `atop -r /var/log/atop/atop_YYYYMMDD` and press `t`/`T` to move forward/backward. Indispensable for post-mortems.
- **Debug**: use `sar -f /var/log/sysstat/saNN -s HH:MM:SS -e HH:MM:SS` for a specific time window — `sa22` is the 22nd of the month. `-s`/`-e` limit the range. Answers "was the CPU saturated during the incident?"
- **Debug**: use `iostat -x 1` and watch `%util` and `await` — `%util` near 100% = disk saturated. High `await` (> 10-20 ms for SSD, > 50 ms for HDD) = slow disk. The most common cause of "the app is slow" is disk I/O, not CPU.

## ⚠️ Edge Cases & Gotchas

- **journald logs are lost on reboot by default**: if `/var/log/journal/` doesn't exist, logs are in `/run/log/journal/` (RAM, volatile). Create `/var/log/journal/` or set `Storage=persistent` in `/etc/systemd/journald.conf`. This is why "my pre-crash logs are gone."
- **`dmesg` is cleared on reboot**: the kernel ring buffer is in RAM. For persistent kernel logs, rely on `journalctl -k` (which persists if journald is persistent). Don't expect `dmesg` to show pre-reboot messages after a reboot.
- **`logrotate` with `copytruncate` loses lines**: `copytruncate` copies the log then truncates the original (so the app keeps writing to the same file). But lines written between the copy and truncate are lost. Prefer `create` + restarting/reloading the app (via `postrotate`) — it opens a new file cleanly.
- **`logrotate` needs the app to reopen the log**: after rotation, the old file is renamed and a new file created. If the app keeps writing to the old (renamed) file descriptor, the new file stays empty. Fix with `postrotate` + reload (e.g., `systemctl reload nginx`) or `copytruncate`.
- **`/var/log` can fill up**: if logs aren't rotated or journald isn't size-limited, `/var/log` fills up, causing services to fail. Set `SystemMaxUse=` in `journald.conf` and configure `logrotate`. Monitor with `df -h /var/log`.
- **`sar` data is only collected if `sysstat` is enabled**: installing `sysstat` isn't enough — you must enable data collection (`sudo systemctl enable --now sysstat` or set `ENABLED="true"` in `/etc/default/sysstat` on Debian). If you forget, `sar` shows "No data" for the period.
- **`last` reads `/var/log/wtmp` which rotates**: `logrotate` may rotate `wtmp`. Old logins are in `wtmp.1` (or `wtmp-YYYYMMDD`). `last -f /var/log/wtmp.1` reads them. If `last` shows only recent logins, the file rotated.
- **Auth log locations differ by distro**: Debian/Ubuntu uses `/var/log/auth.log`; RHEL/Rocky uses `/var/log/secure`. Scripts assuming one path fail on the other. Use `journalctl -u ssh` or `_COMM=sudo` for portability.
- **`journalctl` without filters is overwhelming**: `journalctl` dumps everything since the journal began (could be months). Always filter with `-u`, `-b`, `--since`, `-p`. Use `--no-pager` in scripts.
- **Remote syslog can leak sensitive data**: syslog is plain text over the network (unless you use TLS). `sudo` commands, passwords in app logs, etc. are transmitted in the clear. Use TLS (`rsyslog` supports it) or a VPN for log forwarding.
- **`logger` messages go to the `user` facility by default**: `logger "hello"` appears as `user.notice`. To use a custom facility, specify it: `logger -p local0.info "hello"`. Apps that read `local0` won't see messages sent to `user`.
- **High-frequency logging can overwhelm journald**: journald rate-limits by default (`RateLimitBurst`/`RateLimitIntervalSec`). If a service logs thousands of lines/sec, you may see "Suppressed X messages." Tune the limits or fix the service's logging.

## 🧠 Spot the Bug

An admin sets up a web app as a systemd service. Logs are visible via `journalctl -u myapp`. They want logs in a file too, so they add to the unit:

```ini
[Service]
ExecStart=/usr/bin/node /opt/myapp/server.js >> /var/log/myapp.log 2>&1
```

After restart, `journalctl -u myapp` shows nothing, and `/var/log/myapp.log` is owned by root. What went wrong, and what's the better approach?

<details>
<summary>Answer</summary>

Two issues:

1. **The `>>` redirect consumed stdout/stderr.** systemd captures stdout/stderr and sends them to journald. By redirecting `>> /var/log/myapp.log 2>&1`, nothing goes to stdout (it all goes to the file), so journald gets nothing. You can't easily have *both* with a shell redirect — you'd need `tee`.

2. **The file is owned by root.** systemd runs `ExecStart` as the `User=` specified in the unit (if any). But the `>>` redirect is performed by the shell that systemd spawns (running as root or the specified user). If the app runs as `appuser` but the redirect created the file as root, the app can't write to it later (if it reopens the file).

**Better approaches:**

*Option A — Use systemd's built-in redirection (preferred):*

```ini
[Service]
ExecStart=/usr/bin/node /opt/myapp/server.js
StandardOutput=journal
StandardError=journal
# Also append to a file:
StandardOutput=append:/var/log/myapp.log
StandardError=append:/var/log/myapp-error.log
```

This sends to journald *and* the file, with correct ownership (systemd creates the file as the `User=`).

*Option B — Use journald only + `journalctl` to export:*

Keep logs in journald (the default). To get a file:

::code-wrapper{language="bash"}
```bash
journalctl -u myapp -f > /var/log/myapp.log   # tail to a file (not ideal)
# Or set up rsyslog to forward:
# /etc/rsyslog.d/myapp.conf
# if $programname == 'myapp' then /var/log/myapp.log
```
::

*Option C — Use `tee` in ExecStart (works but clunky):*

```ini
[Service]
ExecStart=/bin/sh -c '/usr/bin/node /opt/myapp/server.js 2>&1 | tee -a /var/log/myapp.log'
```

The recommended approach is **Option A** — systemd's `StandardOutput=append:` (available since systemd 240). It's clean, handles ownership, and you get both journald and the file. The mistake was using a shell redirect in `ExecStart`, which bypasses systemd's log handling.
</details>