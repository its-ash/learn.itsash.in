# 07 — Users, Groups & Authentication

Linux is a multi-user system. Every process runs **as** a user, every file is **owned** by a user, and access is controlled by comparing the process's identity to the file's ownership. This chapter covers the UID/GID model, the PAM authentication stack, `sudo`, SSH key authentication, and the gotchas that cause "permission denied" mysteries.

## Users and UIDs

A **user** is identified by a **UID** (user ID, an integer). The username is just a human-friendly label mapped to a UID via `/etc/passwd`.

| UID Range | Purpose |
|---|---|
| 0 | root (the superuser) |
| 1–999 | System accounts (daemon, bin, www-data, nobody) |
| 1000–60000 | Regular users (default range on most distros) |

**UID 0 is root**: the kernel checks `uid == 0` for privileged operations. The name "root" is convention; what matters is UID 0.

A process has three UIDs:
- **real UID** — who launched the process.
- **effective UID** — whose permissions it currently runs with (changed by setuid).
- **saved UID** — allows switching back (used by setuid programs).

::code-wrapper{language="bash"}
```bash
id                # uid=1000(alice) gid=1000(alice) groups=1000(alice),27(sudo)
whoami            # alice (effective user)
echo $UID         # 1000 (real UID, shell variable)
```
::

## `/etc/passwd` — User Database

Format: `username:password:UID:GID:GECOS:home:shell`

::code-wrapper{language="bash"}
```bash
cat /etc/passwd
# root:x:0:0:root:/root:/bin/bash
# daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
# alice:x:1000:1000:Alice Smith,,,:/home/alice:/bin/bash
```
::

- **password** — `x` means the hash is in `/etc/shadow`. `*` or `!` means the account is locked.
- **shell** — `/usr/sbin/nologin` and `/bin/false` prevent interactive login (used for service accounts).

## `/etc/shadow` — Password Hashes

Only root can read this. Format: `username:hash:lastchange:min:max:warn:inactive:expire:reserved`

::code-wrapper{language="bash"}
```bash
sudo cat /etc/shadow
# root:$y$j9T$...:19500:0:99999:7:::       ← yescrypt hash
# bob:!:19500:0:99999:7:::                 ← locked (no hash)
```
::

- **hash** — `$y$` = yescrypt (modern), `$6$` = SHA-512, `$5$` = SHA-256, `$1$` = MD5 (obsolete), `$2b$` = bcrypt. `*` or `!` = locked.

## Managing Users

::code-wrapper{language="bash"}
```bash
# Complex Implementation: create a service account with minimal privileges
sudo useradd -r -s /usr/sbin/nologin -M -c "App Service Account" appuser
# -r: system account (UID < 1000)
# -s /usr/sbin/nologin: no interactive login
# -M: no home directory
# -c: GECOS (description)

# Create a regular user with home + groups:
sudo useradd -m -s /bin/bash -G sudo,developers alice
# -m: create home
# -G: supplementary groups (comma-separated)
```
::

### Caveat & Anti-Pattern: `usermod -G` vs `-aG`

::code-wrapper{language="bash"}
```bash
# NAIVE: -G (without -a) REPLACES the supplementary group list
sudo usermod -G docker alice
# Alice is now ONLY in docker — removed from sudo, audio, etc.

# PRODUCTION: -aG (append) adds the group while keeping existing ones
sudo usermod -aG docker alice
# Alice is now in docker AND sudo AND everything else she had

# This is the #1 usermod footgun — always use -aG
```
::

## `sudo` — Delegate Privilege

::code-wrapper{language="bash"}
```bash
sudo command            # run as root
sudo -u alice command   # run as alice
sudo -i                 # interactive root shell (login)
sudo -s                 # interactive root shell (non-login)
sudo -l                 # list what you're allowed to do
```
::

### `/etc/sudoers` — The Rules

**Never edit `/etc/sudoers` directly** — a syntax error can lock you out of root. Use `visudo`:

::code-wrapper{language="bash"}
```bash
sudo visudo
# Better: use /etc/sudoers.d/ for custom rules
sudo visudo -f /etc/sudoers.d/alice
# alice ALL=(root) NOPASSWD: /usr/bin/systemctl restart nginx
sudo chmod 440 /etc/sudoers.d/alice   # sudoers files must be mode 440
```
::

### Caveat & Anti-Pattern: `sudo echo > /file` Fails

::code-wrapper{language="bash"}
```bash
# NAIVE: the redirect runs as YOU, not root
sudo echo "x" > /etc/protected    # Permission denied (the > is yours, echo runs as root)

# PRODUCTION: use tee (runs as root via sudo)
echo "x" | sudo tee /etc/protected > /dev/null
# Or:
sudo bash -c 'echo "x" > /etc/protected'
```
::

## SSH Authentication

### SSH Keys

::code-wrapper{language="bash"}
```bash
# Complex Implementation: modern SSH key setup with Ed25519
ssh-keygen -t ed25519 -C "alice@workstation"
# -t ed25519: modern, fast, secure (preferred over RSA)
# Set a passphrase for the private key (recommended)

# Copy the public key to a server:
ssh-copy-id alice@server

# SSH requires strict permissions (silently refuses if wrong):
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chmod 600 ~/.ssh/id_ed25519          # private key — must be 600
chmod 644 ~/.ssh/id_ed25519.pub      # public key — can be readable
```
::

### `sshd_config` Hardening

::code-wrapper{language="bash"}
```bash
PermitRootLogin no              # disable root login via SSH
PasswordAuthentication no       # require key auth (after setting up keys!)
PubkeyAuthentication yes
AllowUsers alice bob            # whitelist (optional)
MaxAuthTries 3                  # limit password guesses
ClientAliveInterval 300         # idle timeout (5 min)
```
::

::code-wrapper{language="bash"}
```bash
sudo sshd -t                    # test config syntax (don't restart if errors!)
sudo systemctl reload sshd      # reload without dropping connections
```
::

## PAM — Pluggable Authentication Modules

PAM is the authentication framework. Login, `sudo`, `su`, `ssh`, `cron` — all call PAM. Config in `/etc/pam.d/`:

::code-wrapper{language="bash"}
```bash
cat /etc/pam.d/common-auth    # the password-checking stack
# auth [success=1 default=ignore] pam_unix.so nullok
# auth requisite pam_deny.so
# auth required pam_permit.so
```
::

Each line: `type control module [args]`
- **type**: `auth` (verify identity), `account` (is account valid?), `password` (change password), `session` (setup/teardown).
- **control**: `required` (must pass, continue), `requisite` (must pass, stop on fail), `sufficient` (pass = success, stop).

## NSS — Name Service Switch

`/etc/nsswitch.conf` controls where user/group lookups happen — local files, LDAP, etc.:

::code-wrapper{language="bash"}
```bash
cat /etc/nsswitch.conf
# passwd:  files systemd
# group:   files systemd
# hosts:   files dns
# "files" → /etc/passwd, /etc/group; "dns" → DNS for hostnames

getent passwd alice         # find alice (in files OR LDAP — works for any source)
getent group developers     # find group
```
::

## 💡 Tips & Tricks

- **Idiom**: always use `usermod -aG` (not `-G`) to add groups — `-G` alone **replaces** the supplementary group list, removing the user from all other groups. This is the #1 `usermod` footgun.
- **Idiom**: use `visudo` (never edit `/etc/sudoers` directly) — `visudo` checks syntax before saving. A syntax error in `sudoers` can lock you out of root entirely.
- **Idiom**: use `sudo -i` (not `sudo su -`) for a root shell — `sudo -i` is the idiomatic way; it's a single command, uses PAM properly, and logs the session.
- **Idiom**: use `echo "x" | sudo tee /etc/file` (not `sudo echo "x" > /etc/file`) — the redirect runs as *you*, not root, so `sudo echo > /etc/file` fails.
- **Idiom**: use `ed25519` SSH keys (not RSA) — Ed25519 is faster, shorter, and more secure. Only fall back to `rsa -b 4096` if the server is ancient.
- **Debug**: use `sudo -l` to see what a user can do — lists all sudoers rules matching the current user.

## ⚠️ Edge Cases & Gotchas

- **`usermod -G` (without `-a`) replaces groups**: `sudo usermod -G docker alice` removes alice from sudo, audio, etc. — she's now *only* in docker. Always use `-aG`.
- **`sudo echo > /file` fails**: `sudo echo "x" > /etc/protected` runs `echo` as root but the `>` redirect runs as *you*. Use `echo "x" | sudo tee /etc/protected`.
- **`su` without `-` keeps your environment**: `su root` (no dash) keeps your PATH, HOME — root commands may not be found. Always `su - root` for a login shell.
- **SSH key permissions must be strict**: `~/.ssh` must be `700`, `authorized_keys` `600`, private key `600`. SSH silently refuses keys that are group/world-readable.
- **Service accounts should have `/usr/sbin/nologin`**: setting a shell like `/bin/bash` on `www-data` allows interactive login (if someone gets the password).
- **Passwordless sudo (`NOPASSWD:`) is a security hole**: any compromise of that user = instant root. Limit it to specific commands.
- **Group membership changes need re-login**: if you add alice to `docker`, her *existing* shells still have the old groups. She must log out and back in (or `newgrp docker`).
- **Deleting a user doesn't kill their processes**: `userdel alice` removes the account, but her running processes keep going. Kill them first: `sudo pkill -u alice`.

## 🧠 Spot the Bug

An admin adds alice to the `docker` group so she can run `docker` without `sudo`:

::code-wrapper{language="bash"}
```bash
sudo usermod -G docker alice
```
::

Alice logs out, logs back in, and `docker ps` works — but she can no longer use `sudo`. What happened?

<details>
<summary>Answer</summary>

**`-G` without `-a` replaces the supplementary group list.** Before, alice was in `alice, sudo, developers`. After `usermod -G docker alice`, she's in *only* `docker` — `sudo` and `developers` are gone. She lost her sudo access.

**Fix — always use `-aG` (append):**

::code-wrapper{language="bash"}
```bash
sudo usermod -aG docker alice
```
::

Now alice is in `docker` *and* all her existing groups (`sudo`, `developers`, etc.).

The `-a` flag means "append" — it adds to the supplementary group list instead of replacing it. Without `-a`, `-G` sets the group list to *exactly* what you specify, dropping everything else.
</details>