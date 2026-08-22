# 11 — systemd & Services

**systemd** is the init system and service manager on virtually every modern Linux distribution. It starts at boot (PID 1), launches all other services, monitors them, manages logging, networking, timers, and more. Understanding systemd is essential for running services, debugging boot issues, and managing a Linux server.

## What systemd Replaced

Before systemd, Linux used **SysV init** (runlevels, `/etc/init.d/` scripts) or **Upstart**. systemd replaced them starting ~2015 (Debian 8, Ubuntu 16.04, RHEL 7). It's now universal except in niche distros (Void, Alpine use OpenRC; NixOS has its own).

Key differences from SysV init:
- **Parallel startup** — services start in parallel (faster boot).
- **On-demand activation** — services can start when a socket is connected or a path changes.
- **Dependency-based** — explicit ordering, not just runlevel numbers.
- **Cgroups integration** — tracks all processes in a service (no escaping).
- **Unified logging** — `journald` replaces scattered log files.

## Units

Everything systemd manages is a **unit**. Unit types:

| Type | Extension | Purpose |
|---|---|---|
| service | `.service` | A daemon (nginx, sshd) |
| socket | `.socket` | An IPC/network socket (on-demand activation) |
| target | `.target` | A group of units (like a runlevel) |
| timer | `.timer` | Scheduled tasks (replaces cron) |
| mount | `.mount` | A mount point |
| automount | `.automount` | Auto-mounted filesystem |
| swap | `.swap` | Swap space |
| device | `.device` | A device (kernel-detected) |
| path | `.path` | Path-based activation (file appears → start service) |
| slice | `.slice` | A cgroup hierarchy (resource limits) |
| scope | `.scope` | Externally created processes (containers) |

## `systemctl` — The Main Interface

### Service Management

::code-wrapper{language="bash"}
```bash
sudo systemctl start nginx          # start now
sudo systemctl stop nginx           # stop now
sudo systemctl restart nginx        # stop + start
sudo systemctl reload nginx         # reload config (no downtime, if supported)
sudo systemctl status nginx         # status + recent logs
sudo systemctl enable nginx         # start at boot
sudo systemctl disable nginx        # don't start at boot
sudo systemctl enable --now nginx   # enable + start (common idiom)
sudo systemctl disable --now nginx  # disable + stop
sudo systemctl is-active nginx      # is it running? (exit 0/3)
sudo systemctl is-enabled nginx     # is it enabled at boot? (exit 0/1)
sudo systemctl is-failed nginx      # did it fail? (exit 0/1)
sudo systemctl mask nginx           # prevent start entirely (even manual)
sudo systemctl unmask nginx         # undo mask
sudo systemctl edit nginx           # create a drop-in override
sudo systemctl cat nginx            # show the unit file + overrides
``
::

### Listing Units

::code-wrapper{language="bash"}
```bash
systemctl list-units                       # all loaded active units
systemctl list-units --type=service        # services only
systemctl list-units --state=running       # running services
systemctl list-units --state=failed        # failed units (very useful!)
systemctl list-unit-files --type=service   # all installed service files (enabled/disabled)
systemctl list-dependencies nginx          # what nginx depends on
systemctl list-sockets                     # socket-activated services
systemctl list-timers                      # scheduled tasks (like cron)
``
::

### System-Level

::code-wrapper{language="bash"}
```bash
systemctl reboot                    # reboot
systemctl poweroff                  # shut down
systemctl suspend                   # suspend to RAM
systemctl hibernate                 # suspend to disk
systemctl rescue                    # single-user rescue mode
systemctl emergency                 # emergency mode (minimal, root only)
systemctl default                   # boot to default target
systemctl get-default               # show default target (e.g., graphical.target)
sudo systemctl set-default multi-user.target   # set default (text mode)
systemctl daemon-reload             # reload systemd after unit file changes
systemctl isolate multi-user.target # switch to a target now
``
::

**`systemctl daemon-reload`** is critical: whenever you edit a unit file (or add a new one), run `daemon-reload` so systemd picks up the changes. Forgetting this is a common bug.

## Unit File Structure

A `.service` file looks like:

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Web Application
Documentation=https://myapp.example.com/docs
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=appuser
Group=appuser
WorkingDirectory=/opt/myapp
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=/etc/myapp/env
ExecStart=/usr/bin/node /opt/myapp/server.js
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

### `[Unit]` Section

| Key | Meaning |
|---|---|
| `Description` | Human-readable name |
| `Documentation` | URL or `man:` reference |
| `After=` | Start after these units (ordering, not dependency) |
| `Before=` | Start before these units |
| `Requires=` | Hard dependency (if these fail, this fails) |
| `Wants=` | Soft dependency (try to start, but don't fail if they don't) |
| `Conflicts=` | Can't run alongside these |
| `Condition...=` | Conditions to start (e.g., `ConditionPathExists=/etc/myapp`) |

**`After=` vs `Requires=`**: `After` is ordering only (start B after A, but don't start A). `Requires` is a dependency (start A too). Use both: `After=network.target Requires=network.target` if you need the network up *and* ordered after it.

### `[Service]` Section

| Key | Meaning |
|---|---|
| `Type=` | `simple` (default, foreground), `forking` (daemonizes), `oneshot` (runs once), `notify` (service signals readiness), `idle` (delay until idle) |
| `User=` / `Group=` | Run as this user/group |
| `WorkingDirectory=` | `cwd` for the process |
| `Environment=` | Set env vars |
| `EnvironmentFile=` | Load env vars from a file (`KEY=value` lines) |
| `ExecStart=` | The command to start |
| `ExecStop=` | The command to stop (default: send SIGTERM) |
| `ExecReload=` | The command to reload |
| `Restart=` | `no`, `on-failure`, `on-success`, `always`, `on-abnormal` |
| `RestartSec=` | Seconds to wait before restarting |
| `TimeoutStartSec=` / `TimeoutStopSec=` | Timeouts |
| `KillMode=` | `control-group` (default, kill all in cgroup), `process` (just main), `mixed` |
| `KillSignal=` | Signal for stop (default `SIGTERM`) |
| `FinalKillSignal=` | Last-resort signal (default `SIGKILL`) after timeout |

**`Type=`** is critical:
- **`simple`** (default) — `ExecStart` is the main process, runs in foreground. Use for most apps.
- **`forking`** — the daemon forks and the parent exits (traditional Unix daemon). systemd tracks the child. Use `PIDFile=` too.
- **`oneshot`** — runs once and exits (for setup scripts, `ExecStart` blocks until done). Often paired with `RemainAfterExit=yes`.
- **`notify`** — the service calls `sd_notify()` when ready. systemd waits for this before considering it started. Use for services that support it (nginx, systemd services with `libsystemd`).
- **`exec`** (systemd 240+) — like `simple` but systemd considers it started once `execve()` succeeds (not just fork).

### `[Install]` Section

| Key | Meaning |
|---|---|
| `WantedBy=` | When enabled, adds a `.wants` symlink in this target (starts at boot) |
| `RequiredBy=` | Like `WantedBy` but hard dependency |
| `Alias=` | Alternative name |
| `Also=` | Also enable these units |

`WantedBy=multi-user.target` means "start at boot in multi-user (text) mode." For graphical mode, use `graphical.target`.

## Where Unit Files Live

| Location | Purpose |
|---|---|
| `/etc/systemd/system/` | **Admin-created** (highest priority — overrides others) |
| `/run/systemd/system/` | Runtime-created (volatile) |
| `/usr/lib/systemd/system/` | **Package-installed** (don't edit — updates overwrite) |
| `~/.config/systemd/user/` | User units (per-user services) |

Priority: `/etc/` > `/run/` > `/usr/lib/`. To modify a package's unit, create an override in `/etc/systemd/system/` (or use `systemctl edit`, which creates a drop-in).

## Drop-In Overrides (The Right Way to Customize)

Never edit `/usr/lib/systemd/system/nginx.service` directly — package updates overwrite it. Use **drop-ins**:

::code-wrapper{language="bash"}
```bash
sudo systemctl edit nginx    # opens an editor for /etc/systemd/system/nginx.service.d/override.conf
``
::

Add only the lines you want to change:

```ini
# /etc/systemd/system/nginx.service.d/override.conf
[Service]
Restart=always
RestartSec=3
Environment=NGINX_EXTRA_ARGS="--with-debug"
```

This **merges** with the original. To unset a key, set it to empty: `Restart=` (blank) clears it. To clear a list, prefix with `-`: `ExecStart=` (clears the list, then add your own).

After editing:

::code-wrapper{language="bash"}
```bash
sudo systemctl daemon-reload
sudo systemctl restart nginx
systemctl cat nginx          # see the merged result
``
::

## Creating a Custom Service

Full example — a Node.js app as a service:

::code-wrapper{language="bash"}
```bash
sudo nano /etc/systemd/system/myapp.service
``
::

```ini
[Unit]
Description=My Node.js App
After=network.target

[Service]
Type=simple
User=appuser
Group=appuser
WorkingDirectory=/opt/myapp
Environment=NODE_ENV=production
EnvironmentFile=/etc/myapp/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

::code-wrapper{language="bash"}
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now myapp
systemctl status myapp
journalctl -u myapp -f      # follow logs
``
::

## `journalctl` — The Log Viewer

systemd's logging daemon (`journald`) collects logs from all services in a binary, indexed format (in `/var/log/journal/` or volatile `/run/log/journal/`).

### Basic

::code-wrapper{language="bash"}
```bash
journalctl                     # all logs (paged — q to quit)
journalctl -u nginx            # logs for nginx unit
journalctl -u nginx -f         # follow (live)
journalctl -u ssh -u nginx     # multiple units
journalctl --since "1 hour ago"
journalctl --since today
journalctl --since "2026-08-22 10:00" --until "2026-08-22 12:00"
journalctl -n 50               # last 50 lines
journalctl -n 50 -u nginx      # last 50 nginx lines
journalctl -f                  # follow all (like tail -f /var/log/messages)
journalctl -p err              # only error priority and worse
journalctl -p warning          # warning and worse
journalctl -k                  # kernel logs only (like dmesg)
journalctl -b                  # current boot only
journalctl -b -1               # previous boot
journalctl --list-boots        # list all boots
journalctl _PID=1234           # logs from a specific PID
journalctl _UID=1000           # logs from a specific user
journalctl -o json             # JSON output
journalctl -o cat              # just the message (no metadata)
journalctl --vacuum-time=7d    # delete logs older than 7 days
journalctl --vacuum-size=500M  # keep logs under 500 MB
``
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

`journalctl -p err` shows level 3 and worse (err, crit, alert, emerg). `journalctl -p warning..err` shows a range.

### Persistence

By default, journald stores logs in `/run/log/journal/` (volatile — lost on reboot). To persist:

::code-wrapper{language="bash"}
```bash
sudo mkdir -p /var/log/journal
sudo systemd-tmpfiles --create --prefix /var/log/journal
sudo systemctl restart systemd-journald
``
::

Or set `Storage=persistent` in `/etc/systemd/journald.conf`.

## Timers — Replacing cron

systemd timers are the modern alternative to cron. They're more flexible (can depend on boot, events) and logged in journald.

### Create a Timer + Service

::code-wrapper{language="bash"}
```bash
# /etc/systemd/system/backup.service
[Unit]
Description=Run backup

[Service]
Type=oneshot
ExecStart=/opt/backup/backup.sh

# /etc/systemd/system/backup.timer
[Unit]
Description=Daily backup

[Timer]
OnCalendar=daily              # every day at midnight
Persistent=true               # catch up if missed (e.g., laptop was off)
RandomizedDelaySec=300        # random 0-300s delay (avoid thundering herd)

[Install]
WantedBy=timers.target
``
::

::code-wrapper{language="bash"}
```bash
sudo systemctl enable --now backup.timer
systemctl list-timers
systemctl status backup.timer
journalctl -u backup.service   # see backup output
``
::

### Timer Options

| Key | Meaning |
|---|---|
| `OnCalendar=` | Calendar schedule (`daily`, `weekly`, `*-*-* 03:00:00`) |
| `OnBootSec=` | Time after boot |
| `OnUnitActiveSec=` | Time after the last activation |
| `OnUnitInactiveSec=` | Time after the last deactivation |
| `Persistent=` | Catch up missed runs (if system was off) |
| `AccuracySec=` | Window for coalescing (default 1 min) |
| `RandomizedDelaySec=` | Random delay to spread load |

### cron vs systemd timers

| Feature | cron | systemd timers |
|---|---|---|
| Syntax | `* * * * *` (5 fields) | `OnCalendar=` |
| Logging | `/var/log/cron` (or nothing) | journald (rich) |
| Missed runs | Skipped | `Persistent=true` catches up |
| Dependencies | None | Can depend on `network-online.target` |
| User jobs | `crontab -e` | `systemctl --user` |
| Sub-minute | No (1 min min) | Yes (down to seconds) |

cron is simpler; timers are more powerful. Use cron for simple schedules, timers for anything with dependencies or logging needs.

## Targets — The New Runlevels

systemd uses **targets** instead of SysV runlevels:

| Target | Runlevel | Purpose |
|---|---|---|
| `poweroff.target` | 0 | Halt |
| `rescue.target` | 1 | Single-user rescue |
| `multi-user.target` | 2, 3 | Text mode (server default) |
| `graphical.target` | 5 | GUI (desktop default) |
| `reboot.target` | 6 | Reboot |

::code-wrapper{language="bash"}
```bash
systemctl get-default              # show default (e.g., graphical.target)
sudo systemctl set-default multi-user.target   # set text mode as default
sudo systemctl isolate multi-user.target       # switch now (without reboot)
``
::

## Resource Limits with `systemd-run`

Limit a service's CPU, memory, or I/O via cgroups:

::code-wrapper{language="bash"}
```bash
# In a unit file:
[Service]
CPUQuota=50%              # max 50% CPU
MemoryMax=512M            # max 512 MB RAM
TasksMax=100              # max 100 processes
IOWeight=100              # low I/O priority (1-10000, default 100)

# Ad-hoc:
sudo systemd-run --unit=test --CPUQuota=25% --MemoryMax=256M stress --cpu 4
``
::

These are enforced by cgroups v2 (see chapter 17).

## User Services

systemd can run per-user services (no root needed):

::code-wrapper{language="bash"}
```bash
systemctl --user list-units
systemctl --user start myapp
systemctl --user enable myapp
systemctl --user status myapp

# Unit files in ~/.config/systemd/user/
# Need lingering to run when not logged in:
loginctl enable-linger alice
``
::

Without `enable-linger`, user services stop when the user logs out.

## 💡 Tips & Tricks

- **Idiom**: use `systemctl enable --now <service>` — enables (boot) and starts (now) in one command. The `--now` flag is the idiomatic way. Reverse: `disable --now`.
- **Idiom**: use `systemctl status <service>` as your first debug step — shows if the service is active, the main PID, recent log lines, and the cgroup. It's a one-stop status check. Follow with `journalctl -u <service>` for full logs.
- **Idiom**: use `systemctl edit <service>` for overrides (never edit `/usr/lib/systemd/system/`) — creates a drop-in in `/etc/systemd/system/<service>.service.d/`. Safe across package updates. Always `daemon-reload` + `restart` after.
- **Idiom**: use `systemctl list-units --state=failed` to find broken services — shows all units in a failed state. Essential after boot or deployment. Follow with `systemctl status <failed>` to see why.
- **Idiom**: use `journalctl -u <service> -f` for live log tailing — replaces `tail -f /var/log/foo.log`. The `-u` filter + `-f` follow is the standard way to watch a service. Add `--since "10 min ago"` to limit.
- **Idiom**: use `journalctl -b -p err` to find boot errors — shows only the current boot (`-b`) and error priority (`-p err`). The fastest way to diagnose "something went wrong at boot."
- **Idiom**: run `systemctl daemon-reload` after editing any unit file — systemd caches unit files; `daemon-reload` re-reads them. Forgetting this is the #1 systemd gotcha (you edit a unit, restart, and nothing changes).
- **Debug**: use `systemd-analyze blame` to find slow-booting services — lists services by startup time. `systemd-analyze critical-chain` shows the dependency chain that determined boot time. Useful for optimizing boot.
- **Debug**: use `journalctl -b -1` to see the **previous** boot's logs — essential when a reboot fixed (or caused) an issue and you want to know what happened before. `--list-boots` shows all available boots.
- **Debug**: use `systemctl cat <service>` to see the full unit file (including drop-ins) — shows the merged result of the package file + your overrides. Essential when "my override isn't taking effect" (usually a syntax error or missing `daemon-reload`).

## ⚠️ Edge Cases & Gotchas

- **Forgetting `daemon-reload` after editing a unit**: systemd caches unit files in memory. After editing `/etc/systemd/system/foo.service` or a drop-in, you MUST run `systemctl daemon-reload` before `restart`. Otherwise systemd runs the old version. This is the #1 systemd bug.
- **`restart` vs `reload`**: `restart` stops and starts (downtime). `reload` sends the reload signal (often SIGHUP) without stopping (no downtime, if supported). Not all services support reload — check `systemctl cat` for `ExecReload=`.
- **`Type=forking` needs `PIDFile=`**: for traditional daemons that fork, systemd needs to know where the PID file is to track the main process. Without it, systemd may think the service died (the parent exited) and kill the children. Use `Type=simple` for apps that run in the foreground (preferred).
- **`Restart=always` vs `on-failure`**: `always` restarts even on clean exit (exit 0) — good for services that should never stop. `on-failure` only restarts on non-zero exit or signal. `on-abnormal` only on signal/timeout (not exit code). Choose based on your service.
- **`KillMode=control-group` kills everything**: the default kills all processes in the service's cgroup (including child processes). If your service spawns workers that you want to survive, set `KillMode=process` (only the main process). Most of the time the default is right.
- **Drop-in overrides merge, they don't replace**: `ExecStart=` in a drop-in **adds** to the original (you get two ExecStart lines, which errors). To replace, clear first: `ExecStart=` (empty) then `ExecStart=/new/command`. Same for `Environment=`.
- **User services stop at logout**: `systemctl --user` services stop when the user's session ends, unless `loginctl enable-linger <user>` is set. This surprises people running background apps as user services. Enable lingering for services that should run always.
- **`/etc/systemd/system/` overrides `/usr/lib/systemd/system/`**: if you copy a unit file to `/etc/` and edit it, package updates won't change your version (good), but you also won't get upstream fixes (bad). Prefer drop-ins (`systemctl edit`) — they override specific keys while still tracking upstream changes.
- **journald logs are lost on reboot by default**: if `/var/log/journal/` doesn't exist, logs are stored in `/run/log/journal/` (RAM, volatile). Create `/var/log/journal/` or set `Storage=persistent` in `journald.conf` for persistence. This is why "my logs from before the crash are gone."
- **`journalctl` without filters is overwhelming**: `journalctl` dumps every log line since the journal began. Always filter: `-u <unit>`, `-b` (current boot), `--since`, `-p err`. Use `--vacuum-size` to limit disk usage.
- **Timer `OnCalendar=daily` is midnight**: `daily` means 00:00:00, not "24 hours after the last run." If the system is off at midnight, the run is missed (unless `Persistent=true`). Use `OnUnitActiveSec=24h` for "24h after last run" instead.
- **Masking prevents all starts**: `systemctl mask nginx` makes it impossible to start nginx (even manually) — it links the unit to `/dev/null`. Use for units you never want running (e.g., a deprecated service). Undo with `unmask`.

## 🧠 Spot the Bug

An admin edits the nginx service to add an environment variable. They create `/etc/systemd/system/nginx.service.d/override.conf`:

```ini
[Service]
Environment=NGINX_WORKERS=8
ExecStart=/usr/sbin/nginx -g 'daemon off;' --with-debug
```

They run `sudo systemctl restart nginx`, but `systemctl status nginx` shows the original `ExecStart` (without `--with-debug`) and the service fails. What happened?

<details>
<summary>Answer</summary>

Two issues:

1. **Missing `daemon-reload`.** After creating a drop-in, you must run `sudo systemctl daemon-reload` before restarting. Without it, systemd uses the cached (old) unit definition. The drop-in wasn't read.

2. **`ExecStart` in a drop-in adds, not replaces.** The original unit has `ExecStart=/usr/sbin/nginx -g 'daemon off;'`. The drop-in adds `ExecStart=... --with-debug`. Now there are **two** `ExecStart` lines — systemd errors (" ExecStart has multiple lines") and fails.

**Fix:**

::code-wrapper{language="bash"}
```bash
# First, clear ExecStart, then set the new one:
sudo systemctl edit nginx
```
::

```ini
[Service]
Environment=NGINX_WORKERS=8
ExecStart=
ExecStart=/usr/sbin/nginx -g 'daemon off;' --with-debug
```

Then:

::code-wrapper{language="bash"}
```bash
sudo systemctl daemon-reload
sudo systemctl restart nginx
systemctl cat nginx         # verify the merged ExecStart
```
::

The empty `ExecStart=` line clears the inherited list; the next `ExecStart=` sets the new value. This "clear then set" pattern is required for `ExecStart`, `ExecStop`, `Environment`, and other list-type keys.

**Mnemonic**: After editing any unit file or drop-in → `daemon-reload` → `restart`. Always. And to replace a list key in a drop-in, clear it first with an empty assignment.
</details>