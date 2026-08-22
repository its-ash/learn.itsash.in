# 14 — Security & Hardening

Linux is relatively secure by default, but a stock install is not hardened. This chapter covers the defense-in-depth stack: firewall (UFW/firewalld), SSH hardening, SELinux/AppArmor, `fail2ban`, `auditd`, capabilities, and the mindset of reducing attack surface. Security is layered — no single tool is sufficient.

## The Security Mindset

1. **Reduce attack surface** — uninstall what you don't need, close unused ports, disable unused services.
2. **Principle of least privilege** — give users and services only the access they need.
3. **Defense in depth** — multiple layers (firewall + app config + SELinux + monitoring) so a single failure doesn't compromise everything.
4. **Patch promptly** — security updates fix known vulnerabilities. Delay = exposure.
5. **Monitor and log** — you can't respond to what you can't see.
6. **Assume breach** — design so that one compromised service doesn't cascade.

## Firewall

The firewall filters network traffic. On Linux, the kernel frameworks are **iptables** (legacy), **nftables** (modern), and the frontends **UFW** (Ubuntu) and **firewalld** (RHEL).

### UFW — Uncomplicated Firewall (Ubuntu)

::code-wrapper{language="bash"}
```bash
sudo ufw enable                 # enable (starts firewall)
sudo ufw default deny incoming  # block all incoming (default)
sudo ufw default allow outgoing # allow all outgoing (default)
sudo ufw allow 22/tcp           # allow SSH
sudo ufw allow 80/tcp           # allow HTTP
sudo ufw allow 443/tcp          # allow HTTPS
sudo ufw allow from 192.168.1.0/24 to any port 5432  # allow LAN to PostgreSQL
sudo ufw limit 22/tcp           # rate-limit SSH (blocks brute force)
sudo ufw deny 3306              # block MySQL from external
sudo ufw status verbose
sudo ufw status numbered        # numbered rules (for deletion)
sudo ufw delete 3               # delete rule #3
sudo ufw reload                 # reload rules
sudo ufw reset                  # reset to default (careful!)
``
::

**Always allow SSH before enabling UFW** — otherwise you lock yourself out:

::code-wrapper{language="bash"}
```bash
sudo ufw allow 22/tcp
sudo ufw enable
``
::

### firewalld (RHEL/Fedora/CentOS)

firewalld uses **zones** (trust levels for network interfaces):

::code-wrapper{language="bash"}
```bash
sudo firewall-cmd --get-default-zone            # e.g., public
sudo firewall-cmd --get-active-zones
sudo firewall-cmd --zone=public --add-port=80/tcp --permanent
sudo firewall-cmd --zone=public --add-service=http --permanent
sudo firewall-cmd --zone=public --add-service=https --permanent
sudo firewall-cmd --zone=public --remove-port=80/tcp --permanent
sudo firewall-cmd --reload                       # apply permanent rules
sudo firewall-cmd --list-all
sudo firewall-cmd --zone=trusted --add-source=192.168.1.0/24 --permanent
``
::

- `--permanent` saves the rule (applied after `--reload`). Without it, the rule is temporary (lost on reload/restart).
- **Services** (`http`, `https`, `ssh`) are predefined port sets in `/usr/lib/firewalld/services/`.
- **Zones**: `public` (default, untrusted), `trusted` (allow all), `internal`, `dmz`, `block`, `drop`.

### iptables / nftables (Low-Level)

::code-wrapper{language="bash"}
```bash
sudo iptables -L -n -v           # list rules (verbose, numeric)
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT  # allow responses
sudo iptables -P INPUT DROP      # default policy: drop incoming
sudo iptables -P FORWARD DROP
sudo iptables -P OUTPUT ACCEPT
sudo iptables-save | sudo tee /etc/iptables/rules.v4   # save (Debian: iptables-persistent)
sudo iptables-restore < /etc/iptables/rules.v4         # restore
``
::

Modern systems use **nftables** (`nft` command), which replaces `iptables`. `iptables` commands often translate to `nft` underneath.

## SSH Hardening

SSH is the most-attacked service. Harden it in `/etc/ssh/sshd_config`:

```text
# /etc/ssh/sshd_config
PermitRootLogin no                # no root login via SSH
PasswordAuthentication no         # require key auth (after setting up keys!)
PubkeyAuthentication yes
AllowUsers alice bob              # whitelist (optional)
AllowGroups ssh-users             # or whitelist by group
Port 22                           # change to reduce log noise (not security)
MaxAuthTries 3                    # limit password guesses (irrelevant if keys only)
LoginGraceTime 30                 # disconnect if not logged in within 30s
ClientAliveInterval 300           # idle timeout (5 min)
ClientAliveCountMax 0             # disconnect on first idle timeout
X11Forwarding no                  # disable if not needed
PermitEmptyPasswords no
Protocol 2                        # SSH protocol 2 only (protocol 1 is obsolete)
```

After editing:

::code-wrapper{language="bash"}
```bash
sudo sshd -t                      # test config (don't restart if errors!)
sudo systemctl reload sshd        # reload (no dropped connections)
``
::

### Key-Only Authentication

1. Generate a key pair (see chapter 07): `ssh-keygen -t ed25519`.
2. Copy the public key: `ssh-copy-id alice@server`.
3. Verify you can log in with the key (no password prompt).
4. Set `PasswordAuthentication no` in `sshd_config`.
5. Reload: `sudo systemctl reload sshd`.

**Never disable password auth before verifying key auth works** — you'll lock yourself out.

### SSH Certificates (For Teams)

For larger teams, use SSH certificates (signed by a CA) instead of distributing keys:

- A CA key signs user public keys (with expiry, constraints).
- Servers trust the CA (`TrustedUserCAKeys` in `sshd_config`).
- No need to manage `authorized_keys` on each server.
- Tools: HashiCorp Vault, Netflix BLESS, smallstep `step-ca`.

## `fail2ban` — Brute-Force Protection

`fail2ban` watches log files and temporarily bans IPs that fail authentication too many times (by adding firewall rules).

### Install and Enable

::code-wrapper{language="bash"}
```bash
sudo apt install fail2ban        # Debian/Ubuntu
sudo dnf install fail2ban        # RHEL
sudo systemctl enable --now fail2ban
``
::

### Config

Don't edit `/etc/fail2ban/jail.conf` directly — create `/etc/fail2ban/jail.local` (overrides):

```ini
# /etc/fail2ban/jail.local
[DEFAULT]
bantime = 1h             # ban duration
findtime = 10m           # window for counting failures
maxretry = 5             # failures before ban
banaction = ufw          # use UFW to ban (or iptables-multiport)

[sshd]
enabled = true           # protect SSH
port = ssh
logpath = %(sshd_log)s
maxretry = 3             # stricter for SSH
bantime = 6h
```

::code-wrapper{language="bash"}
```bash
sudo systemctl restart fail2ban
sudo fail2ban-client status           # list active jails
sudo fail2ban-client status sshd      # sshd jail details (banned IPs)
sudo fail2ban-client set sshd unbanip 1.2.3.4  # unban an IP
``
::

## SELinux and AppArmor

**Mandatory Access Control (MAC)** systems that confine processes to what they're allowed to do, even if the process runs as root. They prevent a compromised process from accessing files/ports it shouldn't.

### SELinux (RHEL/Fedora/CentOS)

SELinux labels every file, process, and port. A policy defines what each label can access.

**Modes**:
| Mode | Behavior |
|---|---|
| `enforcing` | Policy is enforced (violations blocked + logged) |
| `permissive` | Violations logged but not blocked (for testing) |
| `disabled` | Off |

::code-wrapper{language="bash"}
```bash
getenforce                      # current mode (Enforcing/Permissive/Disabled)
sestatus                        # detailed status
sudo setenforce 0               # switch to Permissive (temporary)
sudo setenforce 1               # switch to Enforcing (temporary)
# Permanent: edit /etc/selinux/config (SELINUX=enforcing) + reboot

ls -Z /var/www/html/index.html  # file's SELinux label (context)
ps -eZ | grep nginx             # process's context
chcon -t httpd_sys_content_t /var/www/html/index.html  # change a label
restorecon -Rv /var/www/html/   # restore labels to policy defaults

audit2allow -a                  # generate policy from audit log (denials → rules)
semanage port -l                # list port labels
semanage port -a -t http_port_t -p tcp 8080  # allow a service on a port
``
::

**When SELinux blocks something** (you see "Permission denied" but permissions look fine):
1. Check `sudo ausearch -m AVC -ts recent` or `journalctl -t setroubleshoot` for denials.
2. Switch to `permissive` temporarily to see what would be blocked.
3. Use `audit2allow` to generate a policy exception, or `restorecon` to fix labels.

**Don't disable SELinux** — it's a key security layer. Use `permissive` to debug, then fix the policy.

### AppArmor (Ubuntu/Debian/SUSE)

AppArmor confines programs using profiles (path-based, simpler than SELinux).

::code-wrapper{language="bash"}
```bash
sudo apparmor_status             # status (profiles loaded, enforced)
sudo aa-status                   # same
ls /etc/apparmor.d/              # profiles
sudo aa-complain /etc/apparmor.d/usr.sbin.nginx  # log only (don't block)
sudo aa-enforce /etc/apparmor.d/usr.sbin.nginx  # enforce
sudo apparmor_parser -r /etc/apparmor.d/usr.sbin.nginx  # reload a profile
sudo aa-logprof                 # generate profile rules from logs
cat /var/log/syslog | grep apparmor  # see denials
``
::

Profiles in `complain` mode log violations but don't block — useful for developing a profile. Switch to `enforce` when it's correct.

## Capabilities

Traditional Unix has a binary privilege model: UID 0 (root) can do anything, other UIDs can't. **Capabilities** split root's privileges into ~40 fine-grained rights.

### Common Capabilities

| Capability | Allows |
|---|---|
| `CAP_NET_BIND_SERVICE` | Bind to ports < 1024 |
| `CAP_NET_RAW` | Raw sockets (ping, tcpdump) |
| `CAP_SYS_ADMIN` | Most "admin" operations (mount, chroot, ...) |
| `CAP_SYS_PTRACE` | Trace processes (strace others) |
| `CAP_DAC_OVERRIDE` | Bypass file read/write/execute checks |
| `CAP_KILL` | Send signals to others' processes |
| `CAP_CHOWN` | Change file ownership |
| `CAP_SETUID` | Change process UID |

### Setting Capabilities on Binaries

::code-wrapper{language="bash"}
```bash
# Allow a binary to bind to port 80 without root
sudo setcap 'cap_net_bind_service+ep' /usr/bin/myapp

# View capabilities
getcap /usr/bin/myapp

# Remove
sudo setcap -r /usr/bin/myapp
``
::

The `+ep` means "add to effective and permitted sets." This is safer than setuid root — the binary gets only the specific capability, not all root powers.

### Viewing Process Capabilities

::code-wrapper{language="bash"}
```bash
cat /proc/$$/status | grep Cap
# CapInh: 0000000000000000   (inheritable)
# CapPrm: 0000000000000000   (permitted)
# CapEff: 0000000000000000   (effective — what the process can actually do)
# CapBnd: 000001ffffffffff   (bounding — max it could ever get)
# CapAmb: 0000000000000000   (ambient)

capsh --decode=000001ffffffffff   # decode to names
```

## `auditd` — Security Auditing

`auditd` logs security-relevant events: file accesses, syscall executions, config changes, authentication. More detailed than syslog.

### Install and Enable

::code-wrapper{language="bash"}
```bash
sudo apt install auditd       # Debian
sudo dnf install audit        # RHEL
sudo systemctl enable --now auditd
``
::

### Adding Audit Rules

::code-wrapper{language="bash"}
```bash
# Watch a file for changes (reads + writes)
sudo auditctl -w /etc/passwd -p wa -k identity_changes
# -w: watch path, -p: permissions (r/w/a/x), -k: key (for searching)

# Watch a directory recursively
sudo auditctl -w /etc/ -p wa -k config_changes

# Audit a syscall (e.g., all execve — logs every command run)
sudo auditctl -a always,exit -F arch=b64 -S execve

# Make rules persistent: add to /etc/audit/rules.d/audit.rules
``
::

### Viewing Audit Logs

::code-wrapper{language="bash"}
```bash
sudo ausearch -k identity_changes       # search by key
sudo ausearch -f /etc/passwd            # by file
sudo ausearch -m USER_LOGIN             # by event type
sudo aureport --summary                 # summary report
sudo aureport --auth                    # authentication events
sudo aureport --failed                  # failed events

# Real-time:
sudo tail -f /var/log/audit/audit.log
``
::

Audit logs are in `/var/log/audit/audit.log` (RHEL) or via `journalctl -t audit` (some Debian setups).

## `sudo` Security

See chapter 07 for `sudo` details. Security-relevant points:

- Use `visudo` (never edit `/etc/sudoers` directly).
- Prefer `/etc/sudoers.d/` files (mode 440).
- Avoid `NOPASSWD: ALL` — it means any compromise = root.
- Limit `NOPASSWD` to specific commands: `alice ALL=(root) NOPASSWD: /usr/bin/systemctl restart nginx`.
- `sudo` logs to `/var/log/auth.log` (Debian) or `/var/log/audit/` (RHEL with auditd). Review periodically.

## File Integrity Monitoring

Detect unauthorized file changes (e.g., a modified `/etc/passwd` or binary):

### AIDE (Advanced Intrusion Detection Environment)

::code-wrapper{language="bash"}
```bash
sudo apt install aide
sudo aideinit                 # initialize the database (first run)
sudo cp /var/lib/aide/aide.db.new /var/lib/aide/aide.db
sudo aide --check             # compare current state to database
sudo aide --update            # update the database (after legitimate changes)
``
::

Run `aide --check` daily (via cron or systemd timer) and review differences. An attacker who modifies binaries or configs will show up as a change.

### `tripwire` and `samhain`

Alternatives to AIDE — similar concept (hash database, check for changes).

## Automatic Security Updates

### Debian/Ubuntu — `unattended-upgrades`

::code-wrapper{language="bash"}
```bash
sudo apt install unattended-upgrades apt-listchanges
sudo dpkg-reconfigure -plow unattended-upgrades   # enable
``
::

Config in `/etc/apt/apt.conf.d/50unattended-upgrades` — controls which origins to upgrade (security only by default), email notifications, auto-reboot.

::code-wrapper{language="bash"}
```bash
cat /etc/apt/apt.conf.d/50unattended-upgrades
# Unattended-Upgrade::Allowed-Origins {
#     "${distro_id}:${distro_codename}-security";
# };
# Unattended-Upgrade::Automatic-Reboot "false";  # set true to auto-reboot
# Unattended-Upgrade::Mail "admin@example.com";
``
::

### RHEL — `dnf-automatic`

::code-wrapper{language="bash"}
```bash
sudo dnf install dnf-automatic
sudo systemctl enable --now dnf-automatic.timer
# Config: /etc/dnf/automatic.conf
# apply_updates = yes
```

## User Account Hygiene

- **Remove unused accounts**: `usermod -L` (lock) or `userdel -r` (delete).
- **Enforce password policy**: `chage` (max age, min age), PAM modules (`pam_pwquality`).
- **Lock inactive accounts**: `usermod -e` (expiry) or `chage -E`.
- **No shared accounts**: each person gets their own account (for auditing).
- **Service accounts**: `/usr/sbin/nologin` shell, no home, minimal groups.
- **Review who has `sudo`**: `grep -r NOPASSWD /etc/sudoers /etc/sudoers.d/` — audit periodically.

## Network Hardening

### `sysctl` Network Hardening

`/etc/sysctl.d/99-network-hardening.conf`:

```text
# Disable packet forwarding (unless you're a router)
net.ipv4.ip_forward = 0
net.ipv6.conf.all.forwarding = 0

# Ignore ICMP redirects (prevent MITM)
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0

# Disable IP source routing
net.ipv4.conf.all.accept_source_route = 0

# Log martian packets (impossible addresses)
net.ipv4.conf.all.log_martians = 1

# Reverse path filtering (anti-spoofing)
net.ipv4.conf.all.rp_filter = 1

# Ignore ICMP echo broadcasts (smurf attack prevention)
net.ipv4.icmp_echo_ignore_broadcasts = 1

# TCP SYN flood protection
net.ipv4.tcp_syncookies = 1

# Disable IPv6 if not used (reduces attack surface)
# net.ipv6.conf.all.disable_ipv6 = 1
```

Apply: `sudo sysctl --system`.

## Resource Limits (`ulimit`)

Limit what a process can consume (prevent fork bombs, memory exhaustion):

::code-wrapper{language="bash"}
```bash
ulimit -a                    # show all limits
ulimit -n 1024               # max open files (1024)
ulimit -u 100                # max processes (100)
ulimit -v 2097152            # max virtual memory (2 GB)
ulimit -c 0                  # no core dumps
``
::

These are per-shell (and inherited by children). For persistent limits, use `/etc/security/limits.conf`:

```text
# /etc/security/limits.conf
*    soft  nofile  65536
*    hard  nofile  65536
*    soft  nproc   4096
*    hard  nproc   4096
alice  hard  cpu     60      # max CPU minutes (alice)
```

For services, use systemd's `LimitNOFILE=`, `LimitNPROC=`, etc. in the unit file:

```ini
[Service]
LimitNOFILE=65536
LimitNPROC=4096
```

## Summary Checklist

- [ ] Firewall enabled (UFW/firewalld), only needed ports open
- [ ] SSH: key-only auth, `PermitRootLogin no`, non-default port (optional)
- [ ] `fail2ban` protecting SSH
- [ ] SELinux in `enforcing` mode (or AppArmor profiles active)
- [ ] Automatic security updates enabled
- [ ] All packages up to date (`apt upgrade` / `dnf upgrade`)
- [ ] Unused services disabled (`systemctl disable`)
- [ ] Unused packages removed (`apt autoremove`)
- [ ] User accounts reviewed, no shared accounts, sudo limited
- [ ] `auditd` logging key events
- [ ] File integrity monitoring (AIDE) baseline established
- [ ] `sysctl` network hardening applied
- [ ] Resource limits set (no fork bombs)
- [ ] Logs forwarded to a remote server (so an attacker can't delete them)
- [ ] Backups are automated and tested (and offline/immutable)

## 💡 Tips & Tricks

- **Idiom**: always `sudo ufw allow 22/tcp` before `sudo ufw enable` — enabling the firewall without allowing SSH locks you out. Test with a second SSH session before closing the first.
- **Idiom**: use `sudo sshd -t` after editing `sshd_config` — tests syntax without restarting. A syntax error in `sshd_config` can prevent SSH from starting (locking you out). `sshd -t` catches it first.
- **Idiom**: use `PermitRootLogin no` + `PasswordAuthentication no` (after setting up keys) — the two most impactful SSH hardening settings. Root login via SSH is the #1 brute-force target; password auth allows guessing. Keys eliminate both.
- **Idiom**: use `fail2ban` with `maxretry=3` and `bantime=6h` for SSH — blocks IPs after 3 failures for 6 hours. Drastically reduces brute-force noise. Monitor with `fail2ban-client status sshd`.
- **Idiom**: don't disable SELinux/AppArmor — use `permissive` mode to debug, then fix the policy. Disabling removes a critical security layer. `audit2allow` (SELinux) or `aa-logprof` (AppArmor) generate the needed rules from logs.
- **Idiom**: use `setcap cap_net_bind_service+ep ./server` instead of setuid root — grants only the "bind to low ports" capability, not full root. Safer than `chmod u+s` + chown root. (Or use a port redirect via `iptables` or `systemd` `AmbientCapabilities`.)
- **Idiom**: enable automatic security updates on non-critical servers — `unattended-upgrades` (Debian) or `dnf-automatic` (RHEL) keep you patched against known CVEs. For critical servers, review updates manually but don't delay.
- **Idiom**: forward logs to a remote server — a local attacker can edit `/var/log`. If logs are sent to a central server (rsyslog, journald-remote), they're preserved. This is defense-in-depth for forensics.
- **Debug**: use `sudo ausearch -m AVC -ts recent` to find SELinux denials — when "Permission denied" but file perms are correct, SELinux is likely blocking. The audit log shows exactly what was denied and the context.
- **Debug**: use `getenforce` and `sestatus` to check SELinux status — if a service "randomly fails" on RHEL, check if SELinux is enforcing. Switch to `permissive` (`sudo setenforce 0`) to confirm, then fix the policy.

## ⚠️ Edge Cases & Gotchas

- **Enabling UFW without allowing SSH locks you out**: `sudo ufw enable` with `default deny incoming` blocks SSH immediately. Always `sudo ufw allow 22/tcp` first. Keep your current SSH session open and test with a new one before closing.
- **`sshd_config` errors lock you out**: a typo in `sshd_config` can prevent sshd from starting. Always `sudo sshd -t` (test) before `reload`. After reload, keep your session open and test a new connection.
- **`PasswordAuthentication no` before keys are set up = lockout**: if you disable password auth but haven't copied your SSH key, you can't log in. Verify key auth works *first*, then disable passwords.
- **SELinux can break services silently**: a service "fails" with no obvious error, but `ls -Z` shows wrong labels. Check `ausearch -m AVC` for denials. Common after moving files (e.g., web content copied with `cp` instead of `cp -a` — labels are wrong). Fix with `restorecon -Rv`.
- **AppArmor profiles in `enforce` mode can break apps**: if a profile is too restrictive, the app can't read/write needed files and fails. Check `cat /var/log/syslog | grep apparmor` for "DENIED" messages. Switch to `complain` mode (`aa-complain`) to log without blocking, then `aa-logprof` to update.
- **`NOPASSWD: ALL` is a security hole**: any compromise of that user = instant root. Limit `NOPASSWD` to specific commands. If an attacker gets alice's shell and alice has `NOPASSWD: ALL`, they're root immediately.
- **`setcap` capabilities persist and are exploitable**: `setcap cap_net_bind_service+ep /usr/bin/python3` lets *anyone* run python3 with that capability. Be selective about which binaries get capabilities. Audit with `getcap -r /`.
- **`auditd` logs can fill disk**: high-syscall auditing (e.g., logging every `execve`) generates massive logs. Monitor `/var/log/audit/audit.log` size. Be selective about what you audit.
- **Automatic updates can break things**: a kernel update requires a reboot; a library update may restart services. For critical servers, test updates in staging first. Use `Unattended-Upgrade::Automatic-Reboot "false"` and reboot manually.
- **`ulimit` in a shell doesn't affect systemd services**: `ulimit -n` in your shell limits your shell's children, but a service run by systemd uses systemd's limits. Set `LimitNOFILE=` in the unit file or `/etc/security/limits.conf` (with `pam_limits` in PAM).
- **Disabling IPv6 can break things**: some software (including systemd, some DNS) expects IPv6. Disabling it entirely can cause subtle issues. Prefer firewalling IPv6 properly over disabling.
- **`tcp_syncookies=1` can mask SYN flood symptoms**: it helps under attack but can hide that you're being attacked (the service stays up but logs show odd behavior). Monitor connection counts with `ss -s`.
- **Log rotation can delete evidence**: if an attacker gets in and `logrotate` runs before you check, old logs may be compressed/deleted. Forward logs off-host in real time for forensics.

## 🧠 Spot the Bug

A sysadmin hardens a server by editing `/etc/ssh/sshd_config`:

```text
PermitRootLogin no
PasswordAuthentication no
```

They run `sudo systemctl restart sshd`. Then they close their SSH session and try to reconnect — but can't (connection refused / permission denied). They didn't set up SSH keys. What happened, and how do they recover?

<details>
<summary>Answer</summary>

**They locked themselves out by disabling password auth before setting up key auth.** With `PasswordAuthentication no`, the server only accepts key-based login — but no keys were set up. So no one can authenticate.

**Recovery (no SSH access):**

1. **Console access** — if it's a VM (cloud, VirtualBox, VMware), use the provider's console/VNC (AWS "Connect", GCP "Serial Console", `virsh console`). This gives a root (or user) terminal without SSH.

2. **Rescue mode / live boot** — if physical or no console, boot from a rescue ISO or live USB, mount the root filesystem, and revert the change:

::code-wrapper{language="bash"}
```bash
mount /dev/sda1 /mnt      # mount root
nano /mnt/etc/ssh/sshd_config   # set PasswordAuthentication yes
umount /mnt
reboot
```
::

3. **Single-user mode** — at the GRUB menu, edit the kernel line, append `init=/bin/bash` or `systemd.unit=rescue.target`, boot, remount root read-write (`mount -o remount,rw /`), fix the config, reboot.

**Prevention — the correct sequence:**

1. Generate an SSH key pair on your laptop: `ssh-keygen -t ed25519`.
2. Copy the public key to the server: `ssh-copy-id alice@server` (uses password auth, one last time).
3. **Test key-based login**: `ssh alice@server` should work *without prompting for a password*.
4. Only now edit `sshd_config`: `PasswordAuthentication no`.
5. `sudo sshd -t` (test syntax).
6. `sudo systemctl reload sshd` (reload, not restart — keeps current connections).
7. **Keep your current SSH session open** and open a *new* SSH session to verify key auth works.
8. Only then close the original session.

**Also**: use `sudo systemctl reload sshd` (not `restart`) — reload doesn't drop existing connections, so if the new config is broken, your current session survives. And always test with a *second* session before closing the first.

The lesson: **never disable an authentication method until you've verified the replacement works.** This applies to password → keys, PAM → 2FA, etc.
</details>