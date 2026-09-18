# 11 — systemd & Services

**systemd** is the init system and service manager on virtually every modern Linux distribution. It starts at boot (PID 1), launches all other services, monitors them, manages logging, networking, timers, and more. This chapter covers unit management, drop-in overrides, timers, resource limits, and the gotchas that cause service failures.

## `systemctl` — The Main Interface

::code-wrapper{language="bash"}
```bash
# Complex Implementation: full service lifecycle
sudo systemctl enable --now nginx   # enable (boot) + start (now) in one command
sudo systemctl status nginx          # status + recent logs
sudo systemctl reload nginx          # reload config (no downtime, if supported)
sudo systemctl mask nginx            # prevent start entirely (even manual)
sudo systemctl is-active nginx      # is it running? (exit 0/3)
systemctl list-units --state=failed # find broken services (essential after boot)
systemctl cat nginx                 # show the unit file + drop-in overrides
```
::

### `daemon-reload` — The #1 systemd Gotcha

::code-wrapper{language="bash"}
```bash
# Complex Implementation: edit a unit file safely
sudo systemctl edit nginx    # creates a drop-in override
# (edit the file, save, quit)
sudo systemctl daemon-reload  # CRITICAL: re-read unit files from disk
sudo systemctl restart nginx  # now the changes take effect

# Anti-Pattern: edit + restart WITHOUT daemon-reload
# sudo systemctl edit nginx
# sudo systemctl restart nginx   → systemd uses the CACHED (old) definition
# Forgetting daemon-reload is the #1 systemd bug
```
::

## Unit File Structure

::code-wrapper{language="ini"}
```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Web Application
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=appuser
Group=appuser
WorkingDirectory=/opt/myapp
Environment=NODE_ENV=production
EnvironmentFile=/etc/myapp/env
ExecStart=/usr/bin/node /opt/myapp/server.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```
::

### `Type=` Is Critical

| Type | Behavior |
|---|---|
| `simple` (default) | `ExecStart` is the main process, runs in foreground. Use for most apps. |
| `forking` | Daemon forks and parent exits. systemd tracks the child. Needs `PIDFile=`. |
| `oneshot` | Runs once and exits. Often paired with `RemainAfterExit=yes`. |
| `notify` | Service calls `sd_notify()` when ready. systemd waits for this. |

### `After=` vs `Requires=`

- `After=` — ordering only (start B after A, but don't start A).
- `Requires=` — dependency (start A too).
- Use both: `After=network.target Requires=network.target` if you need the network up *and* ordered after it.

## Drop-In Overrides (The Right Way to Customize)

Never edit `/usr/lib/systemd/system/nginx.service` directly — package updates overwrite it. Use **drop-ins**:

::code-wrapper{language="bash"}
```bash
sudo systemctl edit nginx    # opens /etc/systemd/system/nginx.service.d/override.conf
```
::

Add only the lines you want to change:

::code-wrapper{language="ini"}
```ini
# /etc/systemd/system/nginx.service.d/override.conf
[Service]
Restart=always
RestartSec=3
```
::

### Caveat: Drop-In Merges, Doesn't Replace

::code-wrapper{language="bash"}
```bash
# NAIVE: adding ExecStart in a drop-in creates TWO ExecStart lines → error
# [Service]
# ExecStart=/usr/sbin/nginx -g 'daemon off;' --with-debug
# → systemd errors: "ExecStart has multiple lines"

# PRODUCTION: clear first, then set
# [Service]
# ExecStart=                        ← empty clears the list
# ExecStart=/usr/sbin/nginx -g 'daemon off;' --with-debug
```
::

## Creating a Custom Service

::code-wrapper{language="bash"}
```bash
# Complex Implementation: production-grade Node.js service with resource limits
sudo tee /etc/systemd/system/myapp.service <<'EOF'
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

# Resource limits (cgroups v2):
MemoryMax=512M            # hard memory limit (OOM-kill if exceeded)
CPUQuota=50%              # max 50% CPU
TasksMax=100              # max 100 processes
LimitNOFILE=65536         # max open files

# Protect from OOM killer:
OOMScoreAdjust=-500

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now myapp
journalctl -u myapp -f      # follow logs
```
::

## `journalctl` — The Log Viewer

::code-wrapper{language="bash"}
```bash
# Complex Implementation: targeted log queries
journalctl -u nginx -f                         # follow nginx logs (like tail -f)
journalctl -b -p err                            # current boot, errors only
journalctl -b -1 -p err                         # PREVIOUS boot, errors (after reboot)
journalctl --since "1 hour ago" --until now
journalctl -u nginx -u ssh --since today
journalctl -k                                   # kernel logs only (like dmesg)
journalctl --list-boots                         # list all boots with timestamps
journalctl --vacuum-size=500M                   # keep logs under 500 MB
journalctl -o cat -u myapp                      # just the message (no metadata)
```
::

### Edge Case: journald Logs Are Lost on Reboot by Default

::code-wrapper{language="bash"}
```bash
# NAIVE: expect pre-crash logs to survive reboot
# By default, logs are in /run/log/journal/ (RAM, volatile)
# PRODUCTION: make logs persistent
sudo mkdir -p /var/log/journal
sudo systemd-tmpfiles --create --prefix /var/log/journal
sudo systemctl restart systemd-journald
# Or set Storage=persistent in /etc/systemd/journald.conf
```
::

## Timers — Replacing cron

::code-wrapper{language="bash"}
```bash
# Complex Implementation: systemd timer with catch-up + randomized delay
# /etc/systemd/system/backup.service
[Unit]
Description=Run backup
[Service]
Type=oneshot
ExecStart=/opt/backup/backup.sh

# /etc/systemd/system/backup.timer
[Unit]
Description=Daily backup at 2 AM
[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true               # catch up if missed (e.g., laptop was off)
RandomizedDelaySec=300        # random 0-300s delay (avoid thundering herd)
[Install]
WantedBy=timers.target

sudo systemctl enable --now backup.timer
systemctl list-timers
```
::

### Edge Case: `OnCalendar=daily` Is Midnight

::code-wrapper{language="bash"}
```bash
# "daily" means 00:00:00, not "24 hours after the last run"
# If the system is off at midnight, the run is missed (unless Persistent=true)
# Use OnUnitActiveSec=24h for "24h after last run" instead
```
::

## Resource Limits

::code-wrapper{language="bash"}
```bash
# In a unit file:
[Service]
CPUQuota=50%              # max 50% of one CPU
MemoryMax=512M            # hard memory limit (OOM-kill if exceeded)
MemoryHigh=400M           # soft limit (throttle, don't kill)
TasksMax=100              # max PIDs
IOWeight=100              # I/O weight (1-10000, default 100)

# Ad-hoc:
sudo systemd-run --unit=test --CPUQuota=25% --MemoryMax=256M stress --cpu 4
```
::

## 💡 Tips & Tricks

- **Idiom**: use `systemctl enable --now <service>` — enables (boot) and starts (now) in one command.
- **Idiom**: use `systemctl status <service>` as your first debug step — shows if the service is active, the main PID, recent log lines, and the cgroup.
- **Idiom**: use `systemctl edit <service>` for overrides (never edit `/usr/lib/systemd/system/`) — creates a drop-in. Safe across package updates. Always `daemon-reload` + `restart` after.
- **Idiom**: use `journalctl -u <service> -f` for live log tailing — replaces `tail -f /var/log/foo.log`.
- **Idiom**: use `journalctl -b -p err` to find boot errors — shows only the current boot and error priority.
- **Idiom**: run `systemctl daemon-reload` after editing any unit file — systemd caches unit files; `daemon-reload` re-reads them. Forgetting this is the #1 systemd gotcha.
- **Debug**: use `systemd-analyze blame` to find slow-booting services — lists services by startup time.
- **Debug**: use `journalctl -b -1` to see the **previous** boot's logs — essential when a reboot fixed (or caused) an issue.

## ⚠️ Edge Cases & Gotchas

- **Forgetting `daemon-reload` after editing a unit**: systemd caches unit files in memory. After editing, you MUST run `systemctl daemon-reload` before `restart`. Otherwise systemd runs the old version. This is the #1 systemd bug.
- **`restart` vs `reload`**: `restart` stops and starts (downtime). `reload` sends the reload signal (often SIGHUP) without stopping (no downtime, if supported). Not all services support reload — check `systemctl cat` for `ExecReload=`.
- **`Type=forking` needs `PIDFile=`**: without it, systemd may think the service died (the parent exited) and kill the children. Use `Type=simple` for apps that run in the foreground (preferred).
- **Drop-in overrides merge, they don't replace**: `ExecStart=` in a drop-in **adds** to the original (you get two ExecStart lines, which errors). To replace, clear first: `ExecStart=` (empty) then `ExecStart=/new/command`.
- **User services stop at logout**: `systemctl --user` services stop when the user's session ends, unless `loginctl enable-linger <user>` is set.
- **journald logs are lost on reboot by default**: if `/var/log/journal/` doesn't exist, logs are in `/run/log/journal/` (RAM, volatile). Create `/var/log/journal/` or set `Storage=persistent`.
- **Masking prevents all starts**: `systemctl mask nginx` makes it impossible to start nginx (even manually) — it links the unit to `/dev/null`. Undo with `unmask`.

## 🧠 Spot the Bug

An admin edits the nginx service to add an environment variable. They create `/etc/systemd/system/nginx.service.d/override.conf`:

::code-wrapper{language="ini"}
```ini
[Service]
Environment=NGINX_WORKERS=8
ExecStart=/usr/sbin/nginx -g 'daemon off;' --with-debug
```
::

They run `sudo systemctl restart nginx`, but `systemctl status nginx` shows the original `ExecStart` (without `--with-debug`) and the service fails. What happened?

<details>
<summary>Answer</summary>

Two issues:

1. **Missing `daemon-reload`.** After creating a drop-in, you must run `sudo systemctl daemon-reload` before restarting. Without it, systemd uses the cached (old) unit definition. The drop-in wasn't read.

2. **`ExecStart` in a drop-in adds, not replaces.** The original unit has `ExecStart=/usr/sbin/nginx -g 'daemon off;'`. The drop-in adds `ExecStart=... --with-debug`. Now there are **two** `ExecStart` lines — systemd errors ("ExecStart has multiple lines") and fails.

**Fix:**

::code-wrapper{language="bash"}
```bash
# First, clear ExecStart, then set the new one:
sudo systemctl edit nginx
```
::

::code-wrapper{language="ini"}
```ini
[Service]
Environment=NGINX_WORKERS=8
ExecStart=                                              # clear the original
ExecStart=/usr/sbin/nginx -g 'daemon off;' --with-debug  # set the new one
```
::

::code-wrapper{language="bash"}
```bash
sudo systemctl daemon-reload
sudo systemctl restart nginx
systemctl cat nginx    # verify the merged result
```
::

The empty `ExecStart=` line clears the list; the next `ExecStart=` sets the new command. Same applies to `Environment=` and other list-type keys.
</details>