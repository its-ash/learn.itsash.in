# 12 — Logging & Monitoring

Logs are how you know what's happening on your system. This chapter covers systemd-journald (the modern default), traditional syslog, `logrotate`, kernel logs, and real-time monitoring tools — through the lens of production diagnostics and post-incident forensics.

## The Logging Landscape

```text
┌────────────────────────────────────────────────┐
│  Application / Service                          │
│     ↓ (stdout/stderr → journald, or syslog API) │
├────────────────────────────────────────────────┤
│  journald (systemd)   ← /var/log/journal/       │
│     ↓ (can forward to rsyslog)                  │
├────────────────────────────────────────────────┤
│  rsyslog (traditional) ← /var/log/*.log         │
│     ↓ (can forward to remote)                   │
├────────────────────────────────────────────────┤
│  logrotate (rotates/archives old logs)          │
└────────────────────────────────────────────────┘
```

## `journalctl` — The Log Viewer

::code-wrapper{language="bash"}
```bash
# Complex Implementation: targeted post-incident log analysis
journalctl -b -p err                            # current boot, errors only
journalctl -b -1 -p err                         # PREVIOUS boot, errors (after crash/reboot)
journalctl --list-boots                         # all boots with timestamps
journalctl -u nginx -f                          # follow nginx logs (like tail -f)
journalctl --since "2026-09-10 10:00" --until "2026-09-10 12:00"
journalctl -k                                    # kernel logs only (like dmesg)
journalctl -p warning..err                      # priority range
journalctl --vacuum-size=500M                    # keep logs under 500 MB
journalctl -o json -u myapp                      # JSON output (for log shippers)
```
::

### Priority Levels

| Code | Level |
|---|---|
| 0 | emerg |
| 1 | alert |
| 2 | crit |
| 3 | err |
| 4 | warning |
| 5 | notice |
| 6 | info |
| 7 | debug |

### Edge Case: journald Logs Are Lost on Reboot by Default

::code-wrapper{language="bash"}
```bash
# NAIVE: expect pre-crash logs to survive reboot
# By default, logs are in /run/log/journal/ (RAM, volatile)
# After a crash + reboot, pre-crash logs are GONE

# PRODUCTION: make logs persistent
sudo mkdir -p /var/log/journal
sudo systemd-tmpfiles --create --prefix /var/log/journal
sudo systemctl restart systemd-journald
# Or set Storage=persistent in /etc/systemd/journald.conf
```
::

## Traditional Syslog (`/var/log/`)

| File | Contents |
|---|---|
| `/var/log/syslog` or `/var/log/messages` | General system log (Debian: `syslog`, RHEL: `messages`) |
| `/var/log/auth.log` or `/var/log/secure` | Auth: logins, sudo, su (Debian: `auth.log`, RHEL: `secure`) |
| `/var/log/kern.log` | Kernel messages |
| `/var/log/cron` | Cron job execution |
| `/var/log/wtmp` | Login records (binary — use `last`) |
| `/var/log/btmp` | Failed login attempts (binary — use `lastb`) |

### Edge Case: Auth Log Locations Differ by Distro

::code-wrapper{language="bash"}
```bash
# NAIVE: script hardcodes /var/log/auth.log
# → fails on RHEL (which uses /var/log/secure)
grep "Failed password" /var/log/auth.log

# PRODUCTION: use journalctl (portable across distros)
journalctl -u ssh -u sudo --since today
# Or: journalctl _COMM=sudo
```
::

### Reading Binary Logs

::code-wrapper{language="bash"}
```bash
last                  # login history (from wtmp)
last -n 20            # last 20 logins
last reboot           # reboot history
lastb                 # failed login attempts (from btmp)
who                   # currently logged in (from utmp)
w                     # who + what they're doing
```
::

## `logrotate` — Manage Log Size

::code-wrapper{language="bash"}
```bash
# Complex Implementation: logrotate config for nginx
# /etc/logrotate.d/nginx
sudo tee /etc/logrotate.d/nginx <<'EOF'
/var/log/nginx/*.log {
    daily
    rotate 14
    missingok
    compress
    delaycompress
    notifempty
    create 640 www-data adm
    sharedscripts
    postrotate
        systemctl reload nginx >/dev/null 2>&1 || true
    endscript
}
EOF

# Dry-run (debug) before relying on it:
sudo logrotate -d /etc/logrotate.d/nginx    # shows what WOULD happen (no changes)
sudo logrotate -f /etc/logrotate.d/nginx    # force rotation now
```
::

### Caveat: `copytruncate` Loses Lines

::code-wrapper{language="bash"}
```bash
# NAIVE: copytruncate for apps that hold the file open
# copytruncate copies the log then truncates the original (app keeps writing to same fd)
# BUT: lines written between copy and truncate are LOST
copytruncate

# PRODUCTION: use create + postrotate (app reopens the new file)
create 640 www-data adm
postrotate
    systemctl reload nginx >/dev/null 2>&1 || true
endscript
```
::

## Kernel Logs — `dmesg`

::code-wrapper{language="bash"}
```bash
# Complex Implementation: kernel error diagnosis
dmesg -T --level=err,warn         # with timestamps, errors + warnings only
dmesg | grep -i "error\|fail"    # filter for errors
journalctl -k -p err             # same, from journald (persists if journald is persistent)
```
::

### Common `dmesg` Messages

| Message | Meaning |
|---|---|
| `EXT4-fs error` | Filesystem corruption — check with `fsck` |
| `Out of memory: Killed process` | OOM killer activated |
| `segfault at ...` | A program crashed (bad memory access) |
| `I/O error, dev sda` | Disk failing or bad sector |
| `hung_task` | A process is stuck waiting for I/O |

## Real-Time Monitoring

::code-wrapper{language="bash"}
```bash
# Complex Implementation: multi-tool diagnostic dashboard
top -b -n 1 | head -20           # process snapshot
vmstat 1 5                       # 5 samples, 1s apart (r=runnable, b=blocked, wa=I/O wait)
iostat -x 1 3                    # disk I/O, 3 samples (%util, await)
sar -u 1 3                       # CPU usage over time
mpstat -P ALL 1                  # per-CPU
iftop                             # per-connection bandwidth
watch -n 1 'ss -tlnp | grep :80' # watch port 80 every 1s
```
::

### `sar` — Historical Performance

::code-wrapper{language="bash"}
```bash
# Complex Implementation: post-incident "what was the load at 3 AM?"
# sar data is only collected if sysstat is ENABLED — install before you need it
sudo apt install sysstat
sudo systemctl enable --now sysstat   # start data collection

# Query historical data:
sar -u -f /var/log/sysstat/sa10 -s 03:00:00 -e 03:30:00   # 10th of month, 3:00-3:30
sar -r   # memory
sar -d   # disk
sar -n DEV  # network
```
::

### Edge Case: `sar` Shows "No Data" If Not Enabled

::code-wrapper{language="bash"}
```bash
# Installing sysstat isn't enough — you must enable data collection
# NAIVE: apt install sysstat → sar shows "No data"
# PRODUCTION:
sudo systemctl enable --now sysstat
# On Debian, also set ENABLED="true" in /etc/default/sysstat
```
::

## `atop` — Historical Per-Process

::code-wrapper{language="bash"}
```bash
# Complex Implementation: "what was running at time X?"
# atop logs per-process snapshots to /var/log/atop/
sudo apt install atop
sudo systemctl enable --now atop
# Replay:
atop -r /var/log/atop/atop_20260910   # press t (forward), T (backward) to navigate
```
::

## Writing Logs from Your Services

systemd captures stdout/stderr automatically:

```ini
[Service]
StandardOutput=journal      # default
StandardError=journal       # default
```

::code-wrapper{language="bash"}
```bash
# From shell:
logger -t myapp "Starting up"                    # to syslog (user facility)
logger -p local0.info "Info message"             # custom facility + priority
```
::

## Centralized Logging

::code-wrapper{language="bash"}
```bash
# rsyslog forward to remote (TCP, reliable):
# /etc/rsyslog.d/60-forward.conf
*.*  @@logserver.example.com:514    # TCP (@@ = TCP, @ = UDP)
```
::

## 💡 Tips & Tricks

- **Idiom**: use `journalctl -u <service> -f` for live log tailing — the `-f` flag follows (like `tail -f`). Pair with `--since "10 min ago"` to skip old context.
- **Idiom**: use `journalctl -b -p err` to find boot errors fast — `-b` limits to current boot, `-p err` shows errors and worse.
- **Idiom**: use `journalctl --list-boots` + `journalctl -b -1` for previous-boot debugging — when a reboot happened, `-b -1` shows the last boot's logs.
- **Idiom**: use `last` and `lastb` for login forensics — `last` shows who logged in (from `wtmp`); `lastb` shows failed attempts (from `btmp`).
- **Idiom**: use `logrotate -d` to dry-run before relying on it — catches config errors without losing logs.
- **Idiom**: install `sysstat` and enable it *before* you need it — `sar` data is only collected if `sysstat` is running. If you install it after an incident, there's no historical data.
- **Debug**: use `atop` for historical "what was running at time X?" — replay with `atop -r /var/log/atop/atop_YYYYMMDD`.
- **Debug**: use `iostat -x 1` and watch `%util` and `await` — `%util` near 100% = disk saturated. The most common cause of "the app is slow" is disk I/O, not CPU.

## ⚠️ Edge Cases & Gotchas

- **journald logs are lost on reboot by default**: if `/var/log/journal/` doesn't exist, logs are in `/run/log/journal/` (RAM, volatile). Create `/var/log/journal/` or set `Storage=persistent` in `journald.conf`.
- **`dmesg` is cleared on reboot**: the kernel ring buffer is in RAM. For persistent kernel logs, rely on `journalctl -k`.
- **`logrotate` with `copytruncate` loses lines**: lines written between the copy and truncate are lost. Prefer `create` + `postrotate` (app reopens the new file).
- **`/var/log` can fill up**: if logs aren't rotated or journald isn't size-limited, `/var/log` fills up. Set `SystemMaxUse=` in `journald.conf` and configure `logrotate`.
- **`sar` data is only collected if `sysstat` is enabled**: installing isn't enough — you must enable data collection. If you forget, `sar` shows "No data."
- **Auth log locations differ by distro**: Debian/Ubuntu uses `/var/log/auth.log`; RHEL/Rocky uses `/var/log/secure`. Use `journalctl -u ssh` for portability.
- **Remote syslog can leak sensitive data**: syslog is plain text over the network (unless you use TLS). Use TLS (`rsyslog` supports it) or a VPN for log forwarding.
- **High-frequency logging can overwhelm journald**: journald rate-limits by default. If a service logs thousands of lines/sec, you may see "Suppressed X messages."

## 🧠 Spot the Bug

An admin sets up a web app as a systemd service. Logs are visible via `journalctl -u myapp`. They want logs in a file too, so they add to the unit:

```ini
[Service]
ExecStart=/usr/bin/node /opt/myapp/server.js >> /var/log/myapp.log 2>&1
```

After restart, `journalctl -u myapp` shows nothing, and `/var/log/myapp.log` is owned by root. What went wrong?

<details>
<summary>Answer</summary>

Two issues:

1. **The `>>` redirect consumed stdout/stderr.** systemd captures stdout/stderr and sends them to journald. By redirecting `>> /var/log/myapp.log 2>&1`, nothing goes to stdout (it all goes to the file), so journald gets nothing.

2. **The file is owned by root.** The `>>` redirect is performed by the shell systemd spawns (running as root or the specified user). If the app runs as `appuser` but the redirect created the file as root, the app can't write to it later.

**Better approach — use systemd's built-in redirection:**

```ini
[Service]
ExecStart=/usr/bin/node /opt/myapp/server.js
StandardOutput=journal
StandardError=journal
# Also append to a file:
StandardOutput=append:/var/log/myapp.log
```

Or use `tee` to split the stream:

```ini
[Service]
ExecStart=/bin/sh -c '/usr/bin/node /opt/myapp/server.js 2>&1 | tee -a /var/log/myapp.log'
```

But the cleanest production approach is to let journald handle logging and use `journalctl -u myapp -f` for live viewing, `journalctl -u myapp --since today -o cat > /var/log/myapp.log` for export.
</details>