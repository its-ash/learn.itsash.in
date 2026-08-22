# 07 — Users, Groups & Authentication

Linux is a multi-user system. Every process runs **as** a user, every file is **owned** by a user, and access is controlled by comparing the process's identity to the file's ownership and permissions. This chapter covers users, groups, the authentication stack (PAM), `sudo`, SSH key authentication, and the gotchas that cause "permission denied" mysteries.

## Users and UIDs

A **user** is identified by a **UID** (user ID, an integer). The **username** is just a human-friendly label mapped to a UID via `/etc/passwd`.

| UID Range | Purpose |
|---|---|
| 0 | root (the superuser) |
| 1–999 | System accounts (daemon, bin, sys, www-data, nobody) |
| 1000–60000 | Regular users (default range on most distros) |
| 60001–65536 | Reserved (nobody, nfsnobody) |

- **UID 0 is root**: the kernel checks `uid == 0` for privileged operations. The name "root" is convention; what matters is UID 0.
- A process has three UIDs:
  - **real UID** — who launched the process.
  - **effective UID** — whose permissions it currently runs with (changed by setuid).
  - **saved UID** — allows switching back (used by setuid programs).

::code-wrapper{language="bash"}
```bash
id                # uid=1000(alice) gid=1000(alice) groups=1000(alice),27(sudo)
whoami            # alice (effective user)
echo $UID         # 1000 (real UID, shell variable)
logname           # login name (who you logged in as, even after su)
```
::

## Groups and GIDs

A **group** is a set of users, identified by a **GID**. Every user has a **primary group** (in `/etc/passwd`) and can be in multiple **supplementary groups** (in `/etc/group`).

::code-wrapper{language="bash"}
```bash
groups                    # list your groups
groups alice              # alice's groups
getent group developers   # members of developers
id alice                  # uid, gid, and all groups for alice
```
::

## `/etc/passwd` — User Database

Despite the name, this file stores **account info**, not passwords (those are in `/etc/shadow`). Format:

```text
username:password:UID:GID:GECOS:home:shell
```

::code-wrapper{language="bash"}
```bash
cat /etc/passwd
# root:x:0:0:root:/root:/bin/bash
# daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
# www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
# alice:x:1000:1000:Alice Smith,,,:/home/alice:/bin/bash
# bob:x:1001:1001:Bob Jones:/home/bob:/bin/zsh
```
::

- **password** — `x` means the hash is in `/etc/shadow` (always the case on modern systems). `*` or `!` means the account is locked (can't log in).
- **GECOS** — full name, phone, etc. (comma-separated). Historical (General Electric Comprehensive Operating System).
- **shell** — login shell. `/usr/sbin/nologin` and `/bin/false` prevent interactive login (used for service accounts).

## `/etc/shadow` — Password Hashes

Only root can read this. Format:

```text
username:hash:lastchange:min:max:warn:inactive:expire:reserved
```

::code-wrapper{language="bash"}
```bash
sudo cat /etc/shadow
# root:$y$j9T$...:19500:0:99999:7:::
# alice:$y$j9T$...:19500:0:99999:7:::
# bob:!:19500:0:99999:7:::               ← locked (no hash)
```
::

- **hash** — `$id$salt$hash`. `$y$` = yescrypt (modern), `$6$` = SHA-512, `$5$` = SHA-256, `$1$` = MD5 (obsolete), `$2b$` = bcrypt. `*` or `!` = locked.
- **lastchange** — days since 1970-01-01 when the password was last changed.
- **min/max** — minimum days between changes, maximum days before forced change.
- **warn** — days of warning before expiry.
- **inactive/expire** — days of inactivity before lock, absolute expiry date.

::code-wrapper{language="bash"}
```bash
sudo passwd -S alice       # status: P (usable), L (locked), NP (no password)
chage -l alice             # password aging info
sudo chage -M 90 alice     # max password age = 90 days
sudo chage -E 2026-12-31 alice  # expire account on a date
sudo chage -d 0 alice      # force password change on next login
```
::

## `/etc/group` — Group Database

```text
groupname:password:GID:member1,member2,...
```

::code-wrapper{language="bash"}
```bash
cat /etc/group
# root:x:0:
# sudo:x:27:alice,bob
# developers:x:1001:alice,carol
# docker:x:998:alice
```
::
- The **password** field (`x` or empty) is for group passwords (`gpasswd`), rarely used.
- Members listed here are in supplementary groups. A user's primary group is in `/etc/passwd`.

## `/etc/gshadow` — Group Passwords

Like `/etc/shadow` but for groups. Rarely used (group passwords are uncommon). Format:

```text
groupname:password:admin:member1,member2,...
```

## Managing Users

### `useradd` — Create a User (Low-Level)

::code-wrapper{language="bash"}
```bash
sudo useradd -m -s /bin/bash alice          # create with home + shell
sudo useradd -m -c "Alice Smith" -s /bin/bash -G sudo,developers alice
sudo useradd -r -s /usr/sbin/nologin appuser  # system account (no home, no login)
sudo useradd -u 1500 -g developers bob      # specific UID, specific primary group
sudo useradd -e 2026-12-31 tempuser         # account expires on date
sudo useradd -M serviceaccount              # no home directory
```
::

Options:
- `-m` — create home directory (`/home/alice`).
- `-M` — don't create home.
- `-s` — login shell.
- `-c` — GECOS (full name).
- `-G` — supplementary groups (comma-separated).
- `-g` — primary group (must exist).
- `-r` — system account (UID < 1000).
- `-u` — specific UID.
- `-e` — expiry date (YYYY-MM-DD).
- `-k` — skeleton directory (default `/etc/skel`, copied into new home).

### `adduser` — Interactive (Debian/Ubuntu)

`adduser` is a friendlier Perl script on Debian/Ubuntu (not on RHEL, where it's a symlink to `useradd`):

::code-wrapper{language="bash"}
```bash
sudo adduser alice
# Prompts for full name, password, phone — creates home, copies /etc/skel
sudo adduser --system --group appuser   # system user + group
```
::

### `usermod` — Modify a User

::code-wrapper{language="bash"}
```bash
sudo usermod -aG sudo alice          # add alice to sudo group (-a = append!)
sudo usermod -aG docker,developers alice  # add to multiple groups
sudo usermod -g developers alice     # change primary group (replaces)
sudo usermod -s /bin/zsh alice       # change shell
sudo usermod -l newname oldname      # rename (also rename home with -d -m)
sudo usermod -L alice                # lock password (prefix !)
sudo usermod -U alice                # unlock password
sudo usermod -e 2026-12-31 alice     # set expiry
```
::

**Critical**: `-G` without `-a` **replaces** the supplementary groups list. Always use `-aG` (append) unless you intend to replace:

::code-wrapper{language="bash"}
```bash
# WRONG — removes alice from all other groups, only in developers:
sudo usermod -G developers alice

# RIGHT — adds developers, keeps existing groups:
sudo usermod -aG developers alice
```
::

### `userdel` — Delete a User

::code-wrapper{language="bash"}
```bash
sudo userdel alice              # remove account, keep home dir
sudo userdel -r alice           # remove account + home dir + mail spool
sudo userdel -rf alice          # force (even if still logged in) + remove home
```
::

### `passwd` — Change Password

::code-wrapper{language="bash"}
```bash
passwd                          # change your own password
sudo passwd alice               # change alice's password
sudo passwd -l alice            # lock (prefix !)
sudo passwd -u alice            # unlock
sudo passwd -d alice            # delete password (no password — dangerous)
sudo passwd -e alice            # expire (force change on next login)
``
::

## Managing Groups

::code-wrapper{language="bash"}
```bash
sudo groupadd developers                # create group
sudo groupadd -g 2000 developers        # specific GID
sudo groupmod -n devs developers        # rename
sudo groupmod -g 2001 developers        # change GID
sudo groupdel developers                # delete (must have no members)
sudo gpasswd -a alice developers        # add alice to group
sudo gpasswd -d alice developers        # remove alice from group
sudo gpasswd -A alice developers        # make alice group admin
``
::

## `su` — Switch User

`su` (switch user) starts a shell as another user:

::code-wrapper{language="bash"}
```bash
su - root               # become root, full login shell (loads root's env)
su root                 # become root, keep current env (non-login shell)
su - alice              # become alice, login shell
su -                    # default: root, login shell
``
::

**Always use `su -` (with the dash)** for a login shell. Without `-`, you keep the current user's environment (PATH, HOME) — this causes subtle bugs (root's PATH isn't loaded, so system commands aren't found).

## `sudo` — Delegate Privilege

`sudo` lets a regular user run commands as root (or another user) — with auditing and fine-grained rules. Safer than `su -` (no root password shared).

::code-wrapper{language="bash"}
```bash
sudo command            # run as root
sudo -u alice command   # run as alice
sudo -i                 # interactive root shell (login)
sudo -s                 # interactive root shell (non-login)
sudo -k                 # kill timestamp (re-prompt for password next time)
sudo -l                 # list what you're allowed to do
sudo -v                 # validate (extend timestamp without running a command)
sudo -E command         # preserve environment variables
``
::

### How `sudo` Works

1. User runs `sudo cmd`.
2. `sudo` checks `/etc/sudoers` (and `/etc/sudoers.d/*`) for rules matching the user and command.
3. If allowed, it prompts for **the user's own password** (not root's), caches it for ~15 min (configurable).
4. It runs the command as root (or specified user), logging to `/var/log/auth.log`.

### `/etc/sudoers` — The Rules

**Never edit `/etc/sudoers` directly** — a syntax error can lock you out of root. Use `visudo`:

::code-wrapper{language="bash"}
```bash
sudo visudo
``
::

Format:

```text
user    host=(runas) [NOPASSWD:] commands
%group  host=(runas) commands
```

Examples:

```text
# alice can run anything on any host as root
alice   ALL=(ALL:ALL) ALL

# members of sudo group can run anything
%sudo   ALL=(ALL:ALL) ALL

# bob can restart nginx without a password
bob     ALL=(root) NOPASSWD: /usr/bin/systemctl restart nginx

# deploy user can run deploy.sh as root, no password
deploy  ALL=(root) NOPASSWD: /opt/deploy/deploy.sh

# members of docker group can run docker (usually via group, not sudoers)
%docker ALL=(root) NOPASSWD: /usr/bin/docker
```

::code-wrapper{language="bash"}
```bash
# Better: use /etc/sudoers.d/ for custom rules (easier to manage)
sudo visudo -f /etc/sudoers.d/alice
# Add: alice ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart nginx
sudo chmod 440 /etc/sudoers.d/alice   # sudoers files must be mode 440
``
::

### Common `sudo` Gotchas

- `sudo` uses the **target user's environment** by default (root's PATH). Commands not in root's PATH fail. Use full paths: `sudo /usr/local/bin/myapp`.
- `sudo` resets most environment variables for security. Use `sudo -E` to preserve, or `env_keep` in sudoers.
- `sudo` doesn't apply to shell builtins or functions (they run in the *current* shell, sudo spawns a new process). `sudo cd /root` doesn't work — use `sudo -i` or `sudo bash -c "cd /root && ..."`.
- Redirects run as the *current* user, not root: `sudo echo "x" > /etc/file` runs `echo` as root but `> /etc/file` as you. Use `echo "x" | sudo tee /etc/file` or `sudo bash -c 'echo "x" > /etc/file'`.

## PAM — Pluggable Authentication Modules

PAM is the **authentication framework**. Login, `sudo`, `su`, `ssh`, `cron` — all call PAM, which stacks modules (password check, account validity, session setup). Config in `/etc/pam.d/`:

::code-wrapper{language="bash"}
```bash
ls /etc/pam.d/
# common-auth  common-account  common-password  common-session
# login  sudo  su  sshd  cron  ...

cat /etc/pam.d/common-auth    # the password-checking stack
# auth [success=1 default=ignore] pam_unix.so nullok
# auth requisite pam_deny.so
# auth required pam_permit.so
``
::

Each line: `type control module [args]`
- **type**: `auth` (verify identity), `account` (is account valid?), `password` (change password), `session` (setup/teardown).
- **control**: `required` (must pass, continue), `requisite` (must pass, stop on fail), `sufficient` (pass = success, stop), `optional`.
- **module**: `pam_unix.so` (traditional passwords), `pam_ldap.so`, `pam_google_authenticator.so` (2FA), etc.

You rarely edit PAM directly, but knowing it exists helps debug login issues. Tools like `pam-auth-update` (Debian) or `authselect` (RHEL) manage it safely.

## SSH Authentication

### SSH Keys

The secure, passwordless way to log in. Generate a key pair (private + public):

::code-wrapper{language="bash"}
```bash
ssh-keygen -t ed25519 -C "alice@workstation"
# -t ed25519: modern, fast, secure (preferred)
# -t rsa -b 4096: legacy fallback (if old server)
# -C: comment (usually email)
# Save to ~/.ssh/id_ed25519 (private) and id_ed25519.pub (public)
# Set a passphrase for the private key (recommended)
``
::

Copy the public key to a server:

::code-wrapper{language="bash"}
```bash
ssh-copy-id alice@server           # appends your pubkey to ~/.ssh/authorized_keys
# Manual:
cat ~/.ssh/id_ed25519.pub | ssh alice@server "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
``
::

Now `ssh alice@server` uses key auth (no password). The server checks that your private key matches a public key in `~/.ssh/authorized_keys`.

### Permissions (Critical)

SSH refuses to work if permissions are wrong:

::code-wrapper{language="bash"}
```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chmod 600 ~/.ssh/id_ed25519          # private key — must be 600 or stricter
chmod 644 ~/.ssh/id_ed25519.pub      # public key — can be readable
``
::

### `sshd_config` — Server Settings

Key settings in `/etc/ssh/sshd_config`:

```text
PermitRootLogin no              # disable root login via SSH
PasswordAuthentication no       # require key auth (after setting up keys)
PubkeyAuthentication yes
AllowUsers alice bob            # whitelist (optional)
Port 22                         # change for security-through-obscurity
ClientAliveInterval 300         # disconnect idle sessions after 5 min
MaxAuthTries 3                  # limit password guesses
```
::

After editing, validate and reload:

::code-wrapper{language="bash"}
```bash
sudo sshd -t                    # test config syntax (don't restart if errors!)
sudo systemctl reload sshd      # reload without dropping connections
``
::

### `ssh-agent` and Key Passphrases

If your private key has a passphrase, you'd type it every time. `ssh-agent` caches unlocked keys:

::code-wrapper{language="bash"}
```bash
eval "$(ssh-agent -s)"          # start the agent
ssh-add ~/.ssh/id_ed25519       # add key (prompts for passphrase once)
ssh alice@server                # no passphrase needed this session
ssh-add -l                      # list loaded keys
ssh-add -D                      # remove all keys
``
::

On modern systems, the key is often automatically added to the agent on first use (via `AddKeysToAgent` or desktop keyring integration).

## Pluggable Name Service (NSS)

NSS (`/etc/nsswitch.conf`) controls where user/group lookups happen — local files, LDAP, NIS, etc.:

::code-wrapper{language="bash"}
```bash
cat /etc/nsswitch.conf
# passwd:  files systemd
# group:   files systemd
# shadow:  files
# hosts:   files dns
``
::

- `files` → `/etc/passwd`, `/etc/group`, `/etc/shadow`.
- `systemd` → systemd's dynamic users (`systemd-run --uid`).
- `ldap` or `sss` → external directory (FreeIPA, Active Directory).
- For `hosts`: `files dns` means check `/etc/hosts` first, then DNS.

## `getent` — Query NSS

`getent` queries the NSS databases (works for any source, not just local files):

::code-wrapper{language="bash"}
```bash
getent passwd alice         # find alice (in files OR LDAP)
getent group developers     # find group
getent hosts server         # resolve hostname
getent passwd | wc -l       # count all users (any source)
``
::

## 💡 Tips & Tricks

- **Idiom**: always use `usermod -aG` (not `-G`) to add groups — `-G` alone **replaces** the supplementary group list, removing the user from all other groups. `-aG` appends. This is the #1 `usermod` footgun.
- **Idiom**: use `visudo` (never edit `/etc/sudoers` directly) — `visudo` checks syntax before saving. A syntax error in `sudoers` can lock you out of root entirely. Use `/etc/sudoers.d/` files for custom rules, mode `440`.
- **Idiom**: use `sudo -i` (not `sudo su -`) for a root shell — `sudo -i` is the idiomatic way; it's a single command, uses PAM properly, and logs the session. `sudo su -` works but spawns an extra process and is less clear.
- **Idiom**: use `echo "x" | sudo tee /etc/file` (not `sudo echo "x" > /etc/file`) — the redirect runs as *you*, not root, so `sudo echo > /etc/file` fails with "Permission denied" on the file. `tee` runs as root and writes the file.
- **Idiom**: use `chage -d 0 username` to force a password change on next login — sets the last-change date to 0, so the password is "expired" immediately. Common for new accounts or password resets.
- **Idiom**: use `ed25519` SSH keys (not RSA) — Ed25519 is faster, shorter, and more secure than RSA. Use `ssh-keygen -t ed25519`. Only fall back to `rsa -b 4096` if the server is ancient.
- **Debug**: use `sudo -l` to see what a user can do — lists all sudoers rules matching the current user. Essential for debugging "why can't alice run X?" or auditing privileges.
- **Debug**: check `/var/log/auth.log` (Debian) or `/var/log/secure` (RHEL) for login failures — shows PAM rejections, SSH failures, sudo denials. `journalctl -u ssh -u sudo` on systemd.

## ⚠️ Edge Cases & Gotchas

- **`usermod -G` (without `-a`) replaces groups**: `sudo usermod -G docker alice` removes alice from sudo, audio, etc. — she's now *only* in docker. Always use `-aG`. This is the most common way admins accidentally lock themselves out.
- **`sudo echo > /file` fails**: `sudo echo "x" > /etc/protected` runs `echo` as root but the `>` redirect runs as *you* — "Permission denied." Use `echo "x" | sudo tee /etc/protected` or `sudo bash -c 'echo "x" > /etc/protected'`.
- **`su` without `-` keeps your environment**: `su root` (no dash) keeps your PATH, HOME, etc. — root commands may not be found, scripts may misbehave. Always `su - root` for a login shell.
- **SSH key permissions must be strict**: `~/.ssh` must be `700`, `authorized_keys` `600`, private key `600` (or `400`). SSH silently refuses keys that are group/world-readable. `ssh -v` shows "bad permissions" errors.
- **`PermitRootLogin no` doesn't lock out `su -`**: it only disables SSH login as root. You can still `sudo -i` or `su -` from a regular account. If you disable root password (`passwd -l root`), `su -` stops working too — only `sudo` works.
- **`/etc/passwd` must be readable by all**: many programs (`ls`, `ps`, `find`) map UIDs to names by reading it. If you `chmod 600 /etc/passwd`, non-root programs show numeric UIDs instead of names. Don't lock it down.
- **Service accounts should have `/usr/sbin/nologin`**: setting a shell like `/bin/bash` on `www-data` or `mysql` allows interactive login (if someone gets the password). Use `/usr/sbin/nologin` or `/bin/false` to prevent it.
- **Passwordless sudo (`NOPASSWD:`) is a security hole**: any compromise of that user = instant root. Limit it to specific commands (`NOPASSWD: /usr/bin/systemctl restart nginx`), not `NOPASSWD: ALL`.
- **`sudo` timestamp is per-terminal by default**: `sudo` in one terminal doesn't cache for another. `sudo -v` in each terminal, or set `tty_tickets` to `no` in sudoers (less secure). On servers with many sessions, this is confusing.
- **Deleting a user doesn't kill their processes**: `userdel alice` removes the account, but her running processes keep going (now showing as the old UID, since the name mapping is gone). Kill them first: `sudo pkill -u alice`.
- **Group membership changes need re-login**: if you add alice to `docker`, her *existing* shells still have the old groups. She must log out and back in (or `newgrp docker` in a shell) to pick up the new group. This trips up everyone.

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

**`-G` without `-a` replaces the supplementary group list.** Before, alice was in `alice, sudo, developers` (say). After `usermod -G docker alice`, she's in *only* `docker` — `sudo` and `developers` are gone. She lost her sudo access.

**Fix — use `-aG` (append):**

::code-wrapper{language="bash"}
```bash
sudo usermod -aG docker alice    # adds docker, keeps existing groups
```
::
Or use `gpasswd` (clearer semantics, only adds):

::code-wrapper{language="bash"}
```bash
sudo gpasswd -a alice docker     # add alice to docker (only adds)
```
::

If alice is already locked out (no sudo), another admin (or root via `su -`) must fix it:

::code-wrapper{language="bash"}
```bash
sudo usermod -aG sudo alice      # restore sudo membership
``
::

The mnemonic: **`-a` = append, `-G` = set.** Never use `-G` without `-a` unless you want to *replace* the entire group list. This is the #1 `usermod` footgun — always double-check with `id alice` after any `usermod -G` command.
</details>