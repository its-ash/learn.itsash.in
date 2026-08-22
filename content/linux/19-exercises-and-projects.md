# 19 — Exercises & Projects

Apply everything from chapters 1–18 in real-world projects. These exercises progress from focused drills to a full capstone. Each project lists requirements, hints, and a verification checklist.

## Project 1 — System Inventory Script

Write a script that produces a system inventory report. Covers chapters 02–05 (shell, text processing, files, permissions).

**Requirements**:
- OS, kernel version, architecture.
- CPU model and core count.
- Total and available memory.
- Disk usage for each mounted filesystem.
- Top 5 processes by CPU and memory.
- List of listening TCP ports.
- Output as a formatted report (text table).

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== System Inventory ==="
echo "Date: $(date)"
echo "Host: $(hostname)"
echo "OS: $(grep PRETTY_NAME /etc/os-release | cut -d= -f2 | tr -d '"')"
echo "Kernel: $(uname -r)"
echo "Arch: $(uname -m)"
echo

echo "=== CPU ==="
echo "Model: $(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | xargs)"
echo "Cores: $(nproc)"
echo

echo "=== Memory ==="
free -h | awk '/Mem/ {print "Total:", $2, " Available:", $7}'
echo

echo "=== Disk Usage ==="
df -h | awk 'NR==1 || /^\/dev/' | column -t
echo

echo "=== Top 5 by CPU ==="
ps aux --sort=-%cpu | head -6 | awk '{printf "%-10s %5s %5s %s\n", $1, $3, $4, $11}'
echo

echo "=== Top 5 by Memory ==="
ps aux --sort=-%mem | head -6 | awk '{printf "%-10s %5s %5s %s\n", $1, $3, $4, $11}'
echo

echo "=== Listening TCP Ports ==="
ss -tlnp | awk 'NR>1 {print $4, $6}' | column -t
```

**Verification**:
- [ ] Output is formatted in readable tables.
- [ ] Script runs with `set -euo pipefail` without errors.
- [ ] Works on both Debian and RHEL (portable commands).

---

## Project 2 — Log Analysis Pipeline

Build a pipeline to analyze web server logs. Covers chapters 05 (text processing) and 12 (logging).

**Requirements**:
- Top 10 requesting IP addresses (by count).
- Top 10 requested paths.
- Top 10 HTTP status codes.
- Count of 4xx and 5xx errors.
- Total bandwidth transferred.
- Output a summary report.

::code-wrapper{language="bash"}
#!/usr/bin/env bash
set -euo pipefail

LOG="${1:-/var/log/nginx/access.log}"
[[ -f "$LOG" ]] || { echo "Log not found: $LOG" >&2; exit 1; }

echo "=== Log Analysis: $LOG ==="
echo "Total requests: $(wc -l < "$LOG")"
echo

echo "=== Top 10 IPs ==="
awk '{print $1}' "$LOG" | sort | uniq -c | sort -rn | head -10 | awk '{printf "%6d  %s\n", $1, $2}'
echo

echo "=== Top 10 Paths ==="
awk -F'"' '{print $2}' "$LOG" | awk '{print $2}' | sort | uniq -c | sort -rn | head -10 | awk '{printf "%6d  %s\n", $1, $2}'
echo

echo "=== Status Codes ==="
awk -F'"' '{print $3}' "$LOG" | awk '{print $1}' | sort | uniq -c | sort -rn
echo

echo "=== Error Summary ==="
awk -F'"' '{print $3}' "$LOG" | awk '{print $1}' | awk '$1 >= 400 && $1 < 500 {c4++} $1 >= 500 {c5++} END{print "4xx:", c4+0; print "5xx:", c5+0}'
echo

echo "=== Bandwidth ==="
awk '{sum += $10} END{printf "Total: %.2f MB\n", sum/1024/1024}' "$LOG"
```

**Verification**:
- [ ] Top IPs/paths/status codes are correct (verify with manual `grep | wc`).
- [ ] 4xx/5xx counts are correct.
- [ ] Bandwidth is in MB (converted from bytes).

---

## Project 3 — User & Group Audit

Audit user accounts and sudo access. Covers chapter 07.

**Requirements**:
- List all users with UID ≥ 1000 (regular users).
- List users with login shells (not `nologin`/`false`).
- Show which users are in the `sudo` group (or `wheel`).
- Show password aging for all regular users (`chage -l`).
- Flag accounts with no password (`!` or `*` in shadow).
- Flag accounts that are locked.

::code-wrapper{language="bash"}
#!/usr/bin/env bash
set -euo pipefail

echo "=== User Audit ==="
echo

echo "Regular users (UID ≥ 1000):"
awk -F: '$3 >= 1000 && $3 < 65534 {printf "  %-15s UID:%s  Shell:%s\n", $1, $3, $7}' /etc/passwd
echo

echo "Users with login shells:"
awk -F: '$7 !~ /nologin|false$/ {printf "  %-15s %s\n", $1, $7}' /etc/passwd
echo

echo "Sudo users:"
getent group sudo 2>/dev/null || getent group wheel
echo

echo "Password aging (regular users):"
for user in $(awk -F: '$3 >= 1000 && $3 < 65534 {print $1}' /etc/passwd); do
  echo "  --- $user ---"
  sudo chage -l "$user" 2>/dev/null | sed 's/^/    /'
done
echo

echo "Accounts with no password or locked:"
sudo awk -F: '($2 == "!" || $2 == "*" || $2 == "!!") {print "  " $1 ": " $2}' /etc/shadow
```

**Verification**:
- [ ] All regular users listed.
- [ ] Sudo group membership correct (cross-check with `id <user>`).
- [ ] Locked accounts flagged correctly (`passwd -S`).

---

## Project 4 — Hardened Web Server

Set up an nginx web server with full hardening. Covers chapters 11, 14, 10.

**Requirements**:
- Install nginx via package manager.
- Create a systemd service for nginx (or use the package's unit).
- Configure UFW: allow 22, 80, 443 only.
- Configure SSH: key-only auth, no root login.
- Set up `fail2ban` for SSH.
- Configure nginx with a server block, proper headers (HSTS, X-Frame-Options).
- Enable SELinux/AppArmor (don't disable).
- Set up logrotate for nginx logs.
- Generate a self-signed TLS cert (or use Let's Encrypt).
- Verify with `curl -I` and `ss -tlnp`.

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Install
sudo apt update && sudo apt install -y nginx ufw fail2ban    # Debian
# sudo dnf install -y nginx firewalld fail2ban               # RHEL

# 2. Firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# 3. SSH hardening (verify key auth first!)
sudo sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sshd -t && sudo systemctl reload ssh

# 4. fail2ban
sudo systemctl enable --now fail2ban

# 5. TLS cert (self-signed — use certbot for real)
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/selfsigned.key \
  -out /etc/ssl/certs/selfsigned.crt \
  -subj "/CN=localhost"

# 6. nginx config
sudo tee /etc/nginx/sites-available/hardened <<'EOF'
server {
    listen 80;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    ssl_certificate /etc/ssl/certs/selfsigned.crt;
    ssl_certificate_key /etc/ssl/private/selfsigned.key;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    location / {
        root /var/www/html;
        index index.html;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/hardened /etc/nginx/sites-enabled/hardened
sudo nginx -t && sudo systemctl reload nginx

# 7. Verify
curl -kI https://localhost/
ss -tlnp | grep -E ':80|:443'
sudo ufw status
```

**Verification**:
- [ ] `curl -kI https://localhost/` returns 200.
- [ ] `ufw status` shows only 22/80/443.
- [ ] `sshd -T | grep -E 'permitrootlogin|passwordauthentication'` shows `no`.
- [ ] `fail2ban-client status sshd` shows the jail active.
- [ ] `getenforce` (RHEL) shows `Enforcing` or AppArmor profiles active.
- [ ] HTTP redirects to HTTPS.

---

## Project 5 — Automated Backup with systemd Timers

Create a backup system using systemd timers (replacing cron). Covers chapters 09, 11.

**Requirements**:
- Back up a directory to a timestamped tar archive.
- Keep the last 7 backups (rotate).
- Run daily via a systemd timer (not cron).
- Log to journald.
- Handle errors (exit non-zero, journald captures it).
- Verify the backup integrity (tar test).

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
# /opt/backup/backup.sh
set -euo pipefail

SRC="${1:-/home}"
DST="${2:-/backup}"
KEEP=7

mkdir -p "$DST"
timestamp=$(date +%Y%m%d_%H%M%S)
archive="$DST/backup_${timestamp}.tar.gz"

echo "Backing up $SRC to $archive"
tar -czf "$archive" -C "$(dirname "$SRC")" "$(basename "$SRC")"

# Verify integrity
if ! gzip -t "$archive"; then
  echo "ERROR: Backup $archive is corrupt" >&2
  exit 1
fi

# Rotate old backups
mapfile -t backups < <(ls -1 "$DST"/backup_*.tar.gz 2>/dev/null | sort -r)
if (( ${#backups[@]} > KEEP )); then
  for old in "${backups[@]:KEEP}"; do
    echo "Removing old backup: $old"
    rm -f "$old"
  done
fi

echo "Backup complete: $archive ($(du -h "$archive" | cut -f1))"
```

systemd units:

::code-wrapper{language="bash"}
```bash
# /etc/systemd/system/backup.service
sudo tee /etc/systemd/system/backup.service <<'EOF'
[Unit]
Description=Daily backup
After=network.target

[Service]
Type=oneshot
ExecStart=/opt/backup/backup.sh /home /backup
Nice=19
IOSchedulingClass=idle
EOF

# /etc/systemd/system/backup.timer
sudo tee /etc/systemd/system/backup.timer <<'EOF'
[Unit]
Description=Daily backup at 2 AM

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now backup.timer
systemctl list-timers | grep backup
```

**Verification**:
- [ ] `systemctl start backup.service` creates a backup.
- [ ] `systemctl list-timers` shows `backup.timer`.
- [ ] `journalctl -u backup.service` shows log output.
- [ ] Old backups are rotated (keep 7).
- [ ] Corrupt backup detection works (test with `gzip -t`).

---

## Project 6 — Process & Resource Monitor

Build a monitoring script that alerts on resource thresholds. Covers chapters 06, 15, 12.

**Requirements**:
- Alert if CPU load > 80% for 5+ minutes.
- Alert if disk usage > 90%.
- Alert if memory usage > 90%.
- Alert if a critical process is not running.
- Send alerts to journald (and optionally email).
- Run as a systemd service.

::code-wrapper{language="bash"}
#!/usr/bin/env bash
# /opt/monitor/monitor.sh
set -euo pipefail

CPU_THRESHOLD=80
DISK_THRESHOLD=90
MEM_THRESHOLD=90
CRITICAL_PROCS=("sshd" "nginx")

while true; do
  # CPU (load avg / cores * 100)
  load=$(awk '{print $1}' /proc/loadavg)
  cores=$(nproc)
  cpu_pct=$(awk "BEGIN{printf \"%.0f\", ($load / $cores) * 100}")
  if (( cpu_pct > CPU_THRESHOLD )); then
    logger -t monitor -p user.warn "CPU load high: ${cpu_pct}% (load $load, $cores cores)"
  fi

  # Disk
  while read -r line; do
    usage=$(echo "$line" | awk '{print $5}' | tr -d '%')
    part=$(echo "$line" | awk '{print $6}')
    if (( usage > DISK_THRESHOLD )); then
      logger -t monitor -p user.warn "Disk $part at ${usage}%"
    fi
  done < <(df -h | awk 'NR>1 && /^\/dev/')

  # Memory
  mem_avail=$(awk '/MemAvailable/ {print $2}' /proc/meminfo)
  mem_total=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
  mem_pct=$(awk "BEGIN{printf \"%.0f\", (1 - $mem_avail/$mem_total) * 100}")
  if (( mem_pct > MEM_THRESHOLD )); then
    logger -t monitor -p user.warn "Memory usage high: ${mem_pct}%"
  fi

  # Critical processes
  for proc in "${CRITICAL_PROCS[@]}"; do
    if ! pgrep -x "$proc" >/dev/null; then
      logger -t monitor -p user.err "Critical process $proc is NOT running!"
    fi
  done

  sleep 60
done
```

::code-wrapper{language="bash"}
```bash
sudo tee /etc/systemd/system/monitor.service <<'EOF'
[Unit]
Description=Resource Monitor
After=network.target

[Service]
ExecStart=/opt/monitor/monitor.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now monitor
journalctl -t monitor -f
```

**Verification**:
- [ ] High load (use `stress --cpu $(nproc)`) triggers a log entry.
- [ ] Filling disk (create a large file) triggers a warning.
- [ ] Stopping nginx (`systemctl stop nginx`) triggers "not running" alert.
- [ ] `journalctl -t monitor` shows all alerts.

---

## Project 7 — LVM + RAID Storage Setup

Configure a resilient storage setup. Covers chapter 09.

**Requirements**:
- Create a RAID 1 mirror from two disks.
- Put LVM on top of the RAID.
- Create a logical volume, format with ext4.
- Mount persistently (UUID in fstab).
- Take an LVM snapshot, back it up, remove the snapshot.
- Simulate a disk failure and replace it.

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Create RAID 1
sudo mdadm --create /dev/md0 --level=1 --raid-devices=2 /dev/sdb /dev/sdc
cat /proc/mdstat                    # watch it build

# 2. LVM on the RAID
sudo pvcreate /dev/md0
sudo vgcreate vg_data /dev/md0
sudo lvcreate -L 50G -n lv_data vg_data

# 3. Filesystem + mount
sudo mkfs.ext4 /dev/vg_data/lv_data
sudo mkdir -p /mnt/data
echo "/dev/vg_data/lv_data /mnt/data ext4 defaults,noatime 0 2" | sudo tee -a /etc/fstab
sudo mount -a

# 4. Snapshot + backup
sudo lvcreate -L 5G -s -n lv_data_snap /dev/vg_data/lv_data
sudo mount -o ro /dev/vg_data/lv_data_snap /mnt/snap
tar -czf /tmp/data-backup.tar.gz -C /mnt/snap .
sudo umount /mnt/snap
sudo lvremove -f /dev/vg_data/lv_data_snap

# 5. Simulate disk failure
sudo mdadm --fail /dev/md0 /dev/sdb
sudo mdadm --remove /dev/md0 /dev/sdb
cat /proc/mdstat                    # shows degraded
# (in real life: insert a new disk, then:)
# sudo mdadm --add /dev/md0 /dev/sdd
# cat /proc/mdstat                  # shows rebuilding

# Save RAID config
sudo mdadm --detail --scan | sudo tee -a /etc/mdadm/mdadm.conf
sudo update-initramfs -u
```

**Verification**:
- [ ] `lsblk` shows the RAID + LVM stack.
- [ ] `mount | grep /mnt/data` shows it mounted.
- [ ] `sudo vgs` / `lvs` show the VG and LV.
- [ ] `cat /proc/mdstat` shows the RAID status.
- [ ] Snapshot was created and removed cleanly.
- [ ] `mdadm --fail` showed the array going degraded.

---

## Project 8 — Containerized App Stack

Deploy a multi-container app stack. Covers chapter 17.

**Requirements**:
- A web app (nginx) + backend (Python/Node) + database (PostgreSQL).
- Use Docker Compose (or Podman Compose).
- Persistent data in named volumes.
- Custom network with DNS resolution between containers.
- Healthchecks for each service.
- Resource limits (memory, CPU).
- Runs as a non-root user inside containers.
- Restart policy.

```yaml
# docker-compose.yml
version: "3.8"

services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: secret
    volumes:
      - dbdata:/var/lib/postgresql/data
    networks:
      - appnet
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "appuser"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "1.0"
    restart: unless-stopped

  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgres://appuser:secret@db:5432/myapp
    depends_on:
      db:
        condition: service_healthy
    networks:
      - appnet
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: "0.5"
    restart: unless-stopped
    user: "1000:1000"

  web:
    image: nginx:1.27
    ports:
      - "8080:80"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - backend
    networks:
      - appnet
    restart: unless-stopped

volumes:
  dbdata:

networks:
  appnet:
```

::code-wrapper{language="bash"}
```bash
docker compose up -d
docker compose ps
docker compose logs -f
docker compose down           # stop + remove
docker compose down -v        # also remove volumes (data!)
```

**Verification**:
- [ ] `docker compose ps` shows all services healthy.
- [ ] `curl http://localhost:8080` returns the app.
- [ ] Backend can reach `db:5432` (DNS resolution works).
- [ ] Stopping the db container triggers backend restart (via `depends_on`).
- [ ] Data persists across `docker compose down` + `up` (volume).
- [ ] `docker stats` shows resource limits enforced.

---

## Capstone — Build a Production Linux Server

Combine everything into a fully configured production server.

**Requirements**:
- **Base system**: fresh install, fully updated.
- **Users**: one admin user with sudo (key-only SSH), one service account.
- **Hardening**: UFW (22/80/443), SSH hardened, fail2ban, SELinux/AppArmor enforcing.
- **Services** (systemd): nginx (web), PostgreSQL (database), a custom app.
- **Storage**: LVM for `/data`, ext4 with `noatime`.
- **Backups**: systemd timer daily, 7-day retention, integrity verified.
- **Monitoring**: resource monitor (Project 6), logs to journald + forwarded to a central server.
- **Logging**: journald persistent, logrotate configured.
- **Performance**: `swappiness=10`, `noatime` mounts, `LimitNOFILE`/`MemoryMax` on the app.
- **Containers**: the custom app runs in a container (rootless via Podman), managed by systemd.
- **Documentation**: a README documenting the setup, recovery procedures, and credential locations.

**Verification (full checklist)**:
- [ ] `apt upgrade` / `dnf upgrade` shows nothing to update.
- [ ] `ufw status` shows only 22/80/443.
- [ ] `sshd -T` shows `permitrootlogin no`, `passwordauthentication no`.
- [ ] `fail2ban-client status` shows the sshd jail.
- [ ] `getenforce` (RHEL) = Enforcing / AppArmor profiles active (Ubuntu).
- [ ] `systemctl list-units --state=failed` shows nothing.
- [ ] `lsblk` shows LVM on `/data`.
- [ ] `systemctl list-timers` shows the backup timer.
- [ ] `journalctl --disk-usage` is under your limit.
- [ ] `sysctl vm.swappiness` shows 10.
- [ ] `podman ps` shows the app container running.
- [ ] `curl -I https://localhost/` returns 200.
- [ ] Simulate a service failure — it restarts automatically.
- [ ] Simulate disk failure on the data volume — RAID survives.
- [ ] Reboot the server — everything comes back up automatically.
- [ ] The README documents: how to restore from backup, how to add a user, where TLS certs are, the recovery procedure for a failed boot.

---

## Bonus Challenges

- **Write a kernel module**: a "hello world" module that logs to the kernel ring buffer on load/unload. (`module_init`, `module_exit`, `printk`.)
- **Build a custom kernel**: configure with `menuconfig`, build, install, boot. Measure boot time difference.
- **Set up Prometheus + Grafana**: monitor the server's metrics (node_exporter), visualize in Grafana.
- **Write an Ansible playbook**: automate the entire capstone setup (idempotent, repeatable).
- **Set up WireGuard VPN**: site-to-site or road warrior. Configures interfaces, routes, firewall.
- **Build a PXE boot server**: netboot Linux installers over the network (DHCP + TFTP + HTTP).
- **Configure a mail server**: Postfix + Dovecot + SPF/DKIM/DMARC. The final boss of Linux sysadmin.