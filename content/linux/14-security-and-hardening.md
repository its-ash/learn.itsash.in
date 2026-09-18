# 14 — Security & Hardening

Linux is relatively secure by default, but a stock install is not hardened. This chapter covers the defense-in-depth stack: firewall, SSH hardening, SELinux/AppArmor, `fail2ban`, `auditd`, capabilities, and the mindset of reducing attack surface. Security is layered — no single tool is sufficient.

## The Security Mindset

1. **Reduce attack surface** — uninstall what you don't need, close unused ports, disable unused services.
2. **Principle of least privilege** — give users and services only the access they need.
3. **Defense in depth** — multiple layers (firewall + app config + SELinux + monitoring).
4. **Patch promptly** — security updates fix known vulnerabilities.
5. **Monitor and log** — you can't respond to what you can't see.
6. **Assume breach** — design so that one compromised service doesn't cascade.

## Firewall

### UFW — Uncomplicated Firewall (Ubuntu)

::code-wrapper{language="bash"}
```bash
# Complex Implementation: production firewall with rate-limiting
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp           # SSH
sudo ufw allow 80/tcp           # HTTP
sudo ufw allow 443/tcp          # HTTPS
sudo ufw limit 22/tcp           # rate-limit SSH (blocks brute force)
sudo ufw allow from 192.168.1.0/24 to any port 5432  # LAN to PostgreSQL
sudo ufw --force enable
sudo ufw status verbose
```
::

### Caveat: Always Allow SSH Before Enabling UFW

::code-wrapper{language="bash"}
```bash
# NAIVE: enable firewall without allowing SSH → locked out
sudo ufw enable
# PRODUCTION: allow SSH first
sudo ufw allow 22/tcp
sudo ufw enable
```
::

### firewalld (RHEL)

::code-wrapper{language="bash"}
```bash
sudo firewall-cmd --zone=public --add-service=http --permanent
sudo firewall-cmd --zone=public --add-service=https --permanent
sudo firewall-cmd --reload      # apply permanent rules
sudo firewall-cmd --list-all
```
::

## SSH Hardening

::code-wrapper{language="bash"}
```bash
# /etc/ssh/sshd_config
PermitRootLogin no                # no root login via SSH
PasswordAuthentication no         # require key auth (after setting up keys!)
PubkeyAuthentication yes
AllowUsers alice bob              # whitelist (optional)
MaxAuthTries 3                    # limit password guesses
ClientAliveInterval 300           # idle timeout (5 min)
X11Forwarding no                  # disable if not needed
```
::

::code-wrapper{language="bash"}
```bash
sudo sshd -t                      # test config (don't restart if errors!)
sudo systemctl reload sshd        # reload without dropping connections
```
::

### Edge Case: Never Disable Password Auth Before Verifying Keys

::code-wrapper{language="bash"}
```bash
# NAIVE: disable password auth, then realize keys don't work → locked out
# PasswordAuthentication no
# sudo systemctl reload sshd

# PRODUCTION: verify key auth FIRST, then disable passwords
ssh -i ~/.ssh/id_ed25519 alice@server   # test key login
# If it works, THEN:
sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sshd -t && sudo systemctl reload sshd
```
::

## `fail2ban` — Brute-Force Protection

::code-wrapper{language="bash"}
```bash
# Complex Implementation: SSH brute-force protection with custom jail
# /etc/fail2ban/jail.local (don't edit jail.conf — it's overwritten on update)
sudo tee /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
banaction = ufw

[sshd]
enabled = true
port = ssh
maxretry = 3
bantime = 6h
EOF

sudo systemctl restart fail2ban
sudo fail2ban-client status sshd      # see banned IPs
sudo fail2ban-client set sshd unbanip 1.2.3.4
```
::

## SELinux and AppArmor

**Mandatory Access Control (MAC)** systems that confine processes to what they're allowed to do, even if the process runs as root.

### SELinux (RHEL/Fedora/CentOS)

| Mode | Behavior |
|---|---|
| `enforcing` | Policy enforced (violations blocked + logged) |
| `permissive` | Violations logged but not blocked (for testing) |
| `disabled` | Off |

::code-wrapper{language="bash"}
```bash
getenforce                      # current mode
sudo setenforce 0               # switch to Permissive (temporary)
sudo setenforce 1               # switch to Enforcing (temporary)

# When SELinux blocks something ("Permission denied" but perms look fine):
sudo ausearch -m AVC -ts recent # check denials
restorecon -Rv /var/www/html/   # restore labels to policy defaults
audit2allow -a                  # generate policy from audit log (denials → rules)

# Anti-Pattern: disabling SELinux instead of fixing the policy
# Don't disable — use permissive to debug, then fix the policy
```
::

### AppArmor (Ubuntu/Debian/SUSE)

::code-wrapper{language="bash"}
```bash
sudo apparmor_status             # status (profiles loaded, enforced)
sudo aa-complain /etc/apparmor.d/usr.sbin.nginx  # log only (don't block)
sudo aa-enforce /etc/apparmor.d/usr.sbin.nginx  # enforce
```
::

## Capabilities

Traditional Unix has a binary privilege model: UID 0 (root) can do anything, other UIDs can't. **Capabilities** split root's privileges into ~40 fine-grained rights.

::code-wrapper{language="bash"}
```bash
# Complex Implementation: grant specific capability instead of setuid root
# Allow a binary to bind to port 80 without root
sudo setcap 'cap_net_bind_service+ep' /usr/bin/myapp
getcap /usr/bin/myapp                    # verify

# Anti-Pattern: setuid root for the same purpose
# sudo chmod u+s /usr/bin/myapp → grants ALL root privileges (dangerous)

# View process capabilities:
cat /proc/$$/status | grep Cap
capsh --decode=000001ffffffffff   # decode hex to names
```
::

## `auditd` — Security Auditing

::code-wrapper{language="bash"}
```bash
# Complex Implementation: audit file changes + command execution
sudo auditctl -w /etc/passwd -p wa -k identity_changes
sudo auditctl -w /etc/ -p wa -k config_changes
sudo auditctl -a always,exit -F arch=b64 -S execve    # log every command run

# Make rules persistent: add to /etc/audit/rules.d/audit.rules

# Query:
sudo ausearch -k identity_changes       # search by key
sudo ausearch -f /etc/passwd            # by file
sudo aureport --auth                    # authentication events
sudo aureport --failed                  # failed events
```
::

## File Integrity Monitoring — AIDE

::code-wrapper{language="bash"}
```bash
# Complex Implementation: detect unauthorized file changes
sudo apt install aide
sudo aideinit                 # initialize the database (first run)
sudo cp /var/lib/aide/aide.db.new /var/lib/aide/aide.db
sudo aide --check             # compare current state to database
sudo aide --update            # update after legitimate changes
# Run aide --check daily via systemd timer
```
::

## Network Hardening

::code-wrapper{language="bash"}
```bash
# /etc/sysctl.d/99-network-hardening.conf
net.ipv4.ip_forward = 0
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.all.rp_filter = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.tcp_syncookies = 1
```
::

Apply: `sudo sysctl --system`.

## Automatic Security Updates

::code-wrapper{language="bash"}
```bash
# Debian/Ubuntu
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades   # enable
# Config: /etc/apt/apt.conf.d/50unattended-upgrades (security only by default)

# RHEL
sudo dnf install dnf-automatic
sudo systemctl enable --now dnf-automatic.timer
```
::

## Resource Limits

::code-wrapper{language="bash"}
```bash
# Per-shell (ulimit):
ulimit -n 65536               # max open files
ulimit -u 4096                # max processes

# Persistent (/etc/security/limits.conf):
# *    soft  nofile  65536
# *    hard  nofile  65536

# For services (systemd unit):
# [Service]
# LimitNOFILE=65536
# LimitNPROC=4096
```
::

## 💡 Tips & Tricks

- **Idiom**: use `visudo` (never edit `/etc/sudoers` directly) — `visudo` checks syntax before saving. A syntax error in `sudoers` can lock you out of root. Use `/etc/sudoers.d/` files, mode `440`.
- **Idiom**: prefer file capabilities over setuid root — `setcap cap_net_bind_service+ep ./server` lets a binary bind to port 80 without running as root. Safer than `chmod u+s` (which grants *all* privileges).
- **Idiom**: use `fail2ban` with a custom `jail.local` (not `jail.conf` — it's overwritten on updates). Set `banaction = ufw` to integrate with your firewall.
- **Idiom**: don't disable SELinux — use `permissive` to debug, then fix the policy with `audit2allow` or `restorecon`. Disabling removes a key security layer.
- **Idiom**: install `aide` and establish a baseline at provisioning — run `aide --check` daily. An attacker who modifies binaries or configs will show up as a change.
- **Debug**: use `sudo ausearch -m AVC -ts recent` when SELinux blocks something — shows the exact denial and which process/file was involved.

## ⚠️ Edge Cases & Gotchas

- **Always allow SSH before enabling UFW**: otherwise you lock yourself out. `sudo ufw allow 22/tcp` BEFORE `sudo ufw enable`.
- **Never disable password auth before verifying key auth**: `ssh -i key user@server` first. If it works, THEN disable passwords.
- **`PermitRootLogin no` doesn't lock out `su -`**: it only disables SSH login as root. You can still `sudo -i` or `su -` from a regular account.
- **SELinux blocks with "Permission denied" even when Unix perms look fine**: check `ausearch -m AVC` for denials. Common on RHEL when serving files with wrong labels (`restorecon -Rv` fixes).
- **Passwordless sudo (`NOPASSWD: ALL`) is a security hole**: any compromise of that user = instant root. Limit to specific commands.
- **`sudo` timestamp is per-terminal by default**: `sudo` in one terminal doesn't cache for another. Use `sudo -v` in each terminal, or set `tty_tickets` to `no` in sudoers (less secure).
- **Logs on a compromised machine can't be trusted**: an attacker with root can delete `/var/log`. Forward logs to a remote server (so an attacker can't delete them).
- **`barrier=0` risks data corruption on power loss**: write barriers ensure write ordering. Disabling them is faster but risks filesystem corruption.

## 🧠 Quick Quiz

An admin sets `PasswordAuthentication no` in `sshd_config`, reloads sshd, and loses SSH access. They have no physical access to the server. What went wrong, and how could they have prevented this?

<details>
<summary>Answer</summary>

They disabled password authentication without verifying that key-based authentication works. Their SSH key may not be properly set up on the server (wrong permissions in `~/.ssh/`, `authorized_keys` not in place, or the key wasn't copied).

**Prevention:**

1. **Always test key auth before disabling passwords:**
::code-wrapper{language="bash"}
```bash
# From a DIFFERENT terminal (keep the current SSH session open as a safety net):
ssh -i ~/.ssh/id_ed25519 alice@server
# If this works, you're safe to disable passwords
```
::

2. **Keep your current SSH session open** while making SSH config changes. If the new config breaks, your existing session is unaffected (you can fix the config from there).

3. **Use `sshd -t`** to test config syntax before reloading:
::code-wrapper{language="bash"}
```bash
sudo sshd -t                    # test syntax
sudo systemctl reload sshd      # reload (not restart — no dropped connections)
```
::

4. **If already locked out**: boot to rescue mode (cloud provider's console, or VNC), mount the root filesystem, and re-enable `PasswordAuthentication yes` or fix the key setup.
</details>