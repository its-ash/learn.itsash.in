# 04 — Files, Directories & Permissions

Linux permissions control who can read, write, and execute files, and who owns them. This is the foundation of filesystem-level security. This chapter covers ownership, permission bits, special bits, ACLs, capabilities, and the traps that cause "permission denied" mysteries.

## Ownership: Users and Groups

Every file has an owner (user, by UID), a group (by GID), and permissions for three classes: **owner** (user), **group**, and **others**.

::code-wrapper{language="bash"}
```bash
$ ls -l /etc/passwd
-rw-r--r-- 1 root root 3218 Jun 15 10:23 /etc/passwd
└──┘└─┘└─┘ └──┘ └──┘
  │   │   │    │     └ group (root)
  │   │   │    └ owner (root)
  │   │   └ permissions for others (r--)
  │   └ permissions for group (r--)
  └ permissions for owner (rw-)
```
::

## Permission Bits — Meaning by File Type

| Bit | Regular File | Directory |
|---|---|---|
| `r` | Read contents (`cat`) | List entries (`ls`) |
| `w` | Modify contents (`echo >`) | Create/delete/rename entries inside |
| `x` | Execute (run as program) | Enter (`cd`) / traverse (use in a path) |

Key difference: **directory `x` is "traverse/search" permission**, not "execute." Without `x` on a directory, you can't `cd` into it or access files inside it by path — even if you know their names. `r` lets you list; `x` lets you actually access.

::code-wrapper{language="bash"}
```bash
# Complex Implementation: demonstrate r vs x on directories
# r but no x: can list names, can't access content
chmod 444 somedir/
ls somedir/               # works (lists names)
cat somedir/file          # Permission denied (no x to traverse)

# x but no r: can access by name, can't list
chmod 111 somedir/
cat somedir/knownfile     # works (if you know the exact name)
ls somedir/               # Permission denied (can't list)
```
::

## Numeric (Octal) Mode

Each triplet sums to 0–7:

| Octal | Symbolic | Meaning |
|---|---|---|
| 0 | `---` | No access |
| 1 | `--x` | Execute/traverse |
| 2 | `-w-` | Write |
| 3 | `-wx` | Write + execute |
| 4 | `r--` | Read |
| 5 | `r-x` | Read + execute |
| 6 | `rw-` | Read + write |
| 7 | `rwx` | All |

::code-wrapper{language="bash"}
```bash
chmod 644 file     # rw-r--r-- (typical file)
chmod 755 file     # rwxr-xr-x (typical executable/dir)
chmod 600 file     # rw------- (private file, e.g., SSH key)
chmod 700 dir      # rwx------ (private directory)
```
::

## Special Permission Bits

### Setuid (`4000`) — Run as Owner

When set on an executable, it runs **as the file's owner** regardless of who invokes it:

::code-wrapper{language="bash"}
```bash
ls -l /usr/bin/sudo
# -rwsr-xr-x 1 root root ... /usr/bin/sudo
   ↑
   setuid (s in owner execute position)

chmod 4755 program      # setuid + 755
chmod u+s program       # symbolic

# Security audit — find all setuid root binaries:
find / -perm -4000 -type f 2>/dev/null
```
::

### Setgid (`2000`) — Inherit Group on Directories

On a **directory**: new files/dirs inside **inherit the directory's group** (instead of the creator's primary group). Essential for shared directories:

::code-wrapper{language="bash"}
```bash
# Complex Implementation: collaborative directory with setgid + default ACL
sudo mkdir /shared
sudo chown :developers /shared
sudo chmod 2775 /shared              # setgid + rwxrwsr-x
# Now all new files in /shared inherit the "developers" group
# Add default ACL so new files also get group write (regardless of umask):
sudo setfacl -d -m g:developers:rw /shared
```
::

### Sticky Bit (`1000`) — Restricted Deletion

On a directory, the sticky bit means **only the file's owner (or the directory's owner, or root) can delete/rename files inside** — even if others have write permission. The canonical use is `/tmp`:

::code-wrapper{language="bash"}
```bash
ls -ld /tmp
# drwxrwxrwt 20 root root 4096 ... /tmp
            ↑
            sticky bit (t in others execute position)
chmod 1777 /tmp         # sticky + 777
```
::

Without the sticky bit, since `/tmp` is world-writable (`777`), any user could delete any other user's temp files.

## `umask` — Default Permissions

`umask` is a **mask** (bits to *remove*) from the default mode:
- Files default to `666` (rw-rw-rw-).
- Directories default to `777` (rwxrwxrwx).

::code-wrapper{language="bash"}
```bash
umask 077        # files: 600, dirs: 700 (private)
umask 022        # files: 644, dirs: 755 (default on most systems)
umask 002        # files: 664, dirs: 775 (shared group, e.g., team dirs)
```
::

Calculation: `mode = default & ~umask`. `umask 022` → files `666 & ~022 = 644`, dirs `777 & ~022 = 755`.

### Edge Case: `umask` Doesn't Add Execute

Files are created `666 & ~umask` — never `777`. So `umask 022` gives files `644` (not executable), dirs `755`. You must `chmod +x` scripts after creating them.

## ACLs (Access Control Lists)

Traditional permissions have only three classes. ACLs allow per-user or per-group permissions:

::code-wrapper{language="language="bash"}
```bash
# Grant alice read-write, developers group read
setfacl -m u:alice:rw file
setfacl -m g:developers:r file

# Set default ACL on a directory (inherited by new files)
setfacl -d -m g:developers:rw /shared

# View
getfacl file

# Remove all ACLs
setfacl -b file
```
::

In `ls -l`, a `+` after the mode indicates an ACL is present: `-rw-rw-r--+`.

### Edge Case: ACLs Lost on Copy

::code-wrapper{language="bash"}
```bash
# NAIVE: cp strips ACLs and capabilities
cp file /backup/file              # ACLs gone, capabilities gone
# PRODUCTION: preserve everything
cp -a file /backup/file           # preserves mode, owner, timestamps, ACLs
rsync -A -X file /backup/         # -A ACLs, -X xattrs (full preservation)
```
::

## File Capabilities

Instead of setuid root, grant a binary **specific** capabilities (fine-grained privileges):

::code-wrapper{language="bash"}
```bash
# Complex Implementation: allow a binary to bind to port 80 without root
# — safer than setuid (grants only one capability, not all root powers)
sudo setcap 'cap_net_bind_service+ep' /usr/bin/myapp
getcap /usr/bin/myapp                    # verify
sudo setcap -r /usr/bin/myapp            # remove

# Anti-Pattern: setuid root for the same purpose
# sudo chmod u+s /usr/bin/myapp  → grants ALL root privileges (dangerous)
```
::

Capabilities are stored in the `security.capability` extended attribute.

## `chown` — Change Owner

::code-wrapper{language="bash"}
```bash
sudo chown alice file          # change owner
sudo chown alice:staff file    # change owner and group
sudo chown :staff file         # change group only (or use chgrp)
sudo chown -R alice:alice dir/ # recursive
```
::

Only **root** can change the owner (`chown`). A regular user can `chgrp` to a group they belong to.

## 💡 Tips & Tricks

- **Idiom**: use `install -m 755 script /usr/local/bin/` to copy + set permissions in one step — `install` sets the mode explicitly (ignores `umask`), so the result is predictable. Better than `cp` + `chmod`.
- **Idiom**: use `chmod -R` with symbolic modes, not octal — `chmod -R g+rw dir` adds group read/write without touching other bits. `chmod -R 644 dir` would remove execute from *everything* (including subdirs, breaking `cd`).
- **Idiom**: set `umask 077` for private systems and `umask 027` for shared — `077` makes all new files `600`/`700` (only owner). `027` allows group read.
- **Idiom**: prefer file capabilities over setuid root — `setcap cap_net_bind_service+ep ./server` lets a binary bind to port 80 without running as root.
- **Debug**: use `namei -l /path/to/file` to see permissions on each component of a path — reveals when a "Permission denied" is due to a parent directory lacking `x`, not the file itself.

## ⚠️ Edge Cases & Gotchas

- **Directory `x` ≠ execute**: on directories, `x` is "search/traverse" — you need it to `cd` in or access files by path. `r` alone lets you list names but not access content. `x` alone lets you access known files but not list.
- **`rm` doesn't use the trash**: deletion is permanent. There's no undo. `rm -rf $UNSET_VAR/` with `set +u` can delete `/`. Always `set -u` in scripts.
- **`cp` silently overwrites**: `cp important.conf old.conf.bak` — if `old.conf.bak` exists, it's replaced with no warning. Use `cp -n` (no-clobber) or `cp -i` (interactive).
- **Symlink permissions are meaningless**: `chmod` on a symlink changes the *target's* permissions (on Linux). Symlinks always show `lrwxrwxrwx` in `ls -l`.
- **setuid on scripts is ignored (on Linux)**: `chmod u+s script.sh` has no effect on shell scripts — the kernel ignores setuid on interpreted scripts (a security measure). Use `sudo` or a setuid C wrapper instead.
- **Deleting a file requires write on the directory, not the file**: a file with `r--r--r--` (no write for anyone) can be deleted if its directory is writable by the user. The sticky bit (`+t`) prevents deleting others' files in a shared dir.
- **Hard links to directories are forbidden (on most filesystems)**: `ln dir/ link` fails — ext4 disallows it to avoid filesystem loops. Use `ln -s` (symlink) for directories.

## 🧠 Spot the Bug

A team sets up a shared directory. They run:

::code-wrapper{language="bash"}
```bash
sudo mkdir /shared
sudo chown :developers /shared
sudo chmod 777 /shared
```
::

Alice creates `/shared/report.txt`. Bob can read it but can't edit it. The team wanted all developers to edit each other's files. What's wrong, and what are two fixes?

<details>
<summary>Answer</summary>

The problem: files created in `/shared` are owned by the **creator's primary group** (e.g., `alice`, `bob`), not `developers`. So Alice's file is `alice:alice`, and Bob (not in the `alice` group) only has **others** permissions — typically `r` (from `umask 022` → `644`). No group write for Bob.

**Fix 1 — setgid directory** (classic Unix way):

::code-wrapper{language="bash"}
```bash
sudo chmod 2770 /shared    # setgid + rwxrws---
```
::

Now new files inherit the `developers` group. Combined with `umask 002` (gives group write: `664`), Bob can edit Alice's files.

**Fix 2 — default ACL** (more robust, doesn't depend on `umask`):

::code-wrapper{language="bash"}
```bash
sudo setfacl -d -m g:developers:rw /shared
sudo setfacl -m g:developers:rwx /shared
```
::

New files automatically get `group:developers:rw`, regardless of the creator's `umask`. This is the modern approach and works even if users keep `umask 022`.

The key insight: **directory write permission lets you create/delete files, but it doesn't grant write on files created by others** — that depends on each file's own group and permissions.
</details>