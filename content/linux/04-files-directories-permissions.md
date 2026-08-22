# 04 — Files, Directories & Permissions

Linux permissions control who can read, write, and execute files, and who owns them. This is the foundation of Linux security at the filesystem level. This chapter covers ownership, permission bits, the tools that change them, special bits, ACLs, and the common gotchas.

## Ownership: Users and Groups

Every file has:
- An **owner** (a user, by UID).
- A **group** (by GID).
- A set of **permissions** for three classes: **owner** (user), **group**, and **others** (everyone else).

```text
$ ls -l /etc/passwd
-rw-r--r-- 1 root root 3218 Jun 15 10:23 /etc/passwd
└──┘└─┘└─┘ └──┘ └──┘
  │   │   │    │     └ group (root)
  │   │   │    └ owner (root)
  │   │   └ permissions for others (r--)
  │   └ permissions for group (r--)
  └ permissions for owner (rw-)
```

## Permission Bits

The nine permission bits are three triplets (owner, group, others), each with read (`r`), write (`w`), execute (`x`):

| Class | Read | Write | Execute |
|---|---|---|---|
| Owner | `r` (4) | `w` (2) | `x` (1) |
| Group | `r` (4) | `w` (2) | `x` (1) |
| Others | `r` (4) | `w` (2) | `x` (1) |

### Meaning by File Type

| Bit | Regular File | Directory |
|---|---|---|
| `r` | Read contents (`cat`) | List entries (`ls`) |
| `w` | Modify contents (`echo >`) | Create/delete/rename entries inside |
| `x` | Execute (run as program) | Enter (`cd`) / traverse (use in a path) |

Key difference: **directory `x` is "traverse/search" permission**, not "execute." Without `x` on a directory, you can't `cd` into it or access files inside it by path — even if you know their names. `r` lets you list; `x` lets you actually access.

::code-wrapper{language="bash"}
```bash
# r but no x on a directory: can list, can't access
chmod 444 somedir/        # r--r--r--
ls somedir/               # works (lists names)
cat somedir/file          # Permission denied (no x)

# x but no r: can access by name, can't list
chmod 111 somedir/        # --x--x--x
cat somedir/knownfile     # works (if you know the name)
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

The full mode is three digits (owner, group, others):

::code-wrapper{language="bash"}
```bash
chmod 644 file     # rw-r--r-- (typical file)
chmod 755 file     # rwxr-xr-x (typical executable/dir)
chmod 600 file     # rw------- (private file, e.g., SSH key)
chmod 700 dir      # rwx------ (private directory)
chmod 777 file     # rwxrwxrwx (world-writable — usually bad)
chmod 511 dir      # r-x--x--x (list+enter for owner, enter-only for others)
```
::

## Symbolic Mode

Instead of octal, use letters — modifies specific bits without touching others:

| Operator | Example | Effect |
|---|---|---|
| `u` (user), `g` (group), `o` (others), `a` (all) | `u+x` | Add execute for owner |
| `+` (add), `-` (remove), `=` (set exactly) | `go-w` | Remove write from group+others |
| `r`, `w`, `x` | `a=r` | Set read-only for everyone |

::code-wrapper{language="bash"}
```bash
chmod u+x script.sh        # add execute for owner
chmod +x script.sh         # add execute for all (default = a)
chmod go-w file            # remove write from group and others
chmod u=rw,go=r file       # set owner rw, group/others r (same as 644)
chmod a-w,a+r file         # remove write, add read for all (read-only)
chmod -R g+rw dir/         # recursively add group read+write
```
::

## `chown` — Change Owner

::code-wrapper{language="bash"}
```bash
sudo chown alice file          # change owner
sudo chown alice:staff file    # change owner and group
sudo chown :staff file         # change group only (or use chgrp)
sudo chown -R alice:alice dir/ # recursive
```
::
- Only **root** can change the owner (`chown`). A regular user can `chgrp` to a group they belong to.
- `chown` without a colon (`chown alice file`) changes only the owner, leaving the group.

## `chgrp` — Change Group

::code-wrapper{language="bash"}
```bash
sudo chgrp developers file     # change group
sudo chgrp -R developers dir/  # recursive
```
::

## `umask` — Default Permissions

`umask` is a **mask** (bits to *remove*) from the default mode:
- Files default to `666` (rw-rw-rw-).
- Directories default to `777` (rwxrwxrwx).
- `umask` bits are subtracted (technically masked) from these defaults.

::code-wrapper{language="bash"}
```bash
umask            # show current umask (e.g., 0022 or 022)
umask 077        # files: 600, dirs: 700 (private)
umask 022        # files: 644, dirs: 755 (default on most systems)
umask 002        # files: 664, dirs: 775 (shared group, e.g., team dirs)
umask 027        # files: 640, dirs: 750 (group read, no others)
```
::
Calculation: `mode = default & ~umask`.

- `umask 022` → files `666 & ~022 = 644`, dirs `777 & ~022 = 755`.
- `umask 077` → files `666 & ~077 = 600`, dirs `777 & ~077 = 700`.

Set it persistently in `~/.bashrc` or `/etc/profile` or `/etc/login.defs` (system-wide).

## Special Permission Bits

Three extra bits beyond `rwxrwxrwx`:

### Setuid (`4000`) — Run as Owner

When set on an executable, it runs **as the file's owner** regardless of who invokes it. The classic example is `sudo` and `passwd`:

::code-wrapper{language="bash"}
```bash
ls -l /usr/bin/sudo
# -rwsr-xr-x 1 root root ... /usr/bin/sudo
   ↑
   setuid (s in owner execute position)

chmod 4755 program      # setuid + 755
chmod u+s program       # symbolic
```
::
- `passwd` needs setuid root because it edits `/etc/shadow` (root-only) on behalf of regular users.
- Setuid root is a security risk (privilege escalation if the program has bugs). Audit with: `find / -perm -4000 -type f 2>/dev/null`.

### Setgid (`2000`) — Run as Group / Inherit Group

On an **executable**: runs with the file's group.

On a **directory**: new files/dirs inside **inherit the directory's group** (instead of the creator's primary group). Essential for shared directories:

::code-wrapper{language="bash"}
```bash
ls -ld /shared
# drwxr-sr-x 2 alice developers 4096 ... /shared
          ↑
          setgid on a directory (s in group execute position)

sudo chmod 2775 /shared    # setgid + 775
sudo chmod g+s /shared     # symbolic
```
::
Without setgid, files in `/shared` would be owned by each creator's primary group, not `developers`. With setgid, they're all in `developers`, so the group can access them.

### Sticky Bit (`1000`) — Restricted Deletion

On a directory, the sticky bit means **only the file's owner (or the directory's owner, or root) can delete/rename files inside** — even if others have write permission. The canonical use is `/tmp`:

::code-wrapper{language="bash"}
```bash
ls -ld /tmp
# drwxrwxrwt 20 root root 4096 ... /tmp
            ↑
            sticky bit (t in others execute position)

chmod 1777 /tmp         # sticky + 777
chmod +t /tmp           # symbolic
```
::
Without the sticky bit, since `/tmp` is world-writable (`777`), any user could delete any other user's temp files. The sticky bit prevents that — you can create files, but only you (or root) can remove yours.

### Octal Summary

| Bit | Octal | Symbolic | Effect (file) | Effect (dir) |
|---|---|---|---|---|
| setuid | 4000 | `u+s` | Run as owner | (rarely used) |
| setgid | 2000 | `g+s` | Run as group | New files inherit dir's group |
| sticky | 1000 | `+t` | (obsolete) | Only owner can delete files inside |

Full mode with specials: four octal digits, e.g., `chmod 2755 dir` = setgid + 755, `chmod 4755 program` = setuid + 755.

### `s`/`S` and `t`/`T` Capitalization

In `ls -l`, the special bit letter is lowercase if the underlying execute bit is set, uppercase if not:

- `rwsr-xr-x` — setuid + owner execute (`s`).
- `rwSr-xr-x` — setuid, **no** owner execute (`S` — unusual, the setuid is useless without execute).
- `rwxrwxrwt` — sticky + others execute (`t`).
- `rwxrwxrwT` — sticky, **no** others execute (`T`).

## ACLs (Access Control Lists)

Traditional permissions have only three classes (owner/group/others). **ACLs** allow per-user or per-group permissions — essential for fine-grained access (e.g., "this file is rw for alice, r for bob, nothing for others").

::code-wrapper{language="bash"}
```bash
# View ACL
getfacl file

# Grant alice read-write
setfacl -m u:alice:rw file

# Grant developers group read
setfacl -m g:developers:r file

# Remove a specific entry
setfacl -x u:alice file

# Remove all ACLs (restore to standard permissions)
setfacl -b file

# Set default ACL on a directory (inherited by new files)
setfacl -d -m g:developers:rw /shared
```
::

In `ls -l`, a `+` after the mode indicates an ACL is present:

::code-wrapper{language="bash"}
```bash
ls -l file
# -rw-rw-r--+ 1 alice alice 0 ... file
            ↑
            ACL present
```
::

ACLs require filesystem support (`mount -o acl`, default on ext4/xfs) and the `acl` package.

## Extended Attributes (`xattr`)

Files can have key-value metadata beyond the standard attributes:

::code-wrapper{language="bash"}
```bash
ls -l file          # no visible difference
getfattr -d file    # show extended attributes

setfattr -n user.comment -v "backup copy" file
getfattr -n user.comment file
# user.comment="backup copy"

# Security-relevant xattrs:
getfattr -n security.selinux file   # SELinux label
getfattr -n security.capability file  # file capabilities
```
::
- `user.*` namespace — arbitrary user metadata (requires FS support).
- `security.*` — security labels (SELinux, capabilities).
- `trusted.*` — root-only metadata.
- `system.*` — kernel-managed (e.g., `system.posix_acl_access`).

## File Capabilities

Instead of setuid root, you can grant a binary **specific** capabilities (fine-grained privileges):

::code-wrapper{language="bash"}
```bash
# Allow ping to use raw sockets (instead of setuid root)
sudo setcap cap_net_raw+ep /usr/bin/ping

# View capabilities
getcap /usr/bin/ping
# /usr/bin/ping = cap_net_raw+ep

# Remove
sudo setcap -r /usr/bin/ping
```
::
Capabilities are stored in the `security.capability` extended attribute. Safer than setuid because you grant only the specific privilege needed (e.g., `cap_net_bind_service` for binding to port 80), not full root.

## Creating Files and Directories

::code-wrapper{language="bash"}
```bash
touch file                  # create empty file / update timestamps
mkdir dir                   # create directory
mkdir -p a/b/c              # create parents as needed
mkdir -p project/{src,bin,test,docs}   # brace expansion → 4 dirs at once
install -d -m 755 /opt/app  # create dir with explicit mode (ignores umask)
install -m 755 script.sh /usr/local/bin/  # copy file with explicit mode
```
::

## Copying, Moving, Removing

::code-wrapper{language="bash"}
```bash
cp file backup.bak          # copy (overwrites backup.bak silently!)
cp -i file backup.bak       # interactive (prompt before overwrite)
cp -n file backup.bak       # no-clobber (don't overwrite)
cp -a dir/ dir-copy/        # archive: recursive, preserve perms/owner/timestamps
cp -r dir/ dir-copy/        # recursive (doesn't preserve owner unless root)
cp -v file dest             # verbose (show what's being copied)

mv old new                  # rename/move (same FS: instant; cross-FS: copy+delete)
mv -i old new               # prompt before overwriting
mv -n old new               # don't overwrite

rm file                     # remove (no trash — permanent!)
rm -i file                  # prompt
rm -r dir                   # recursive
rm -rf dir                  # recursive, force (no prompts) — DANGEROUS
rm -- -weird                # remove a file named "-weird" (-- ends options)
```
::

## Symlinks and Links

::code-wrapper{language="bash"}
```bash
ln target link              # hard link (same inode)
ln -s target link           # symbolic link (path pointer)

ln -s /etc/nginx/nginx.conf /tmp/nginx-link   # absolute symlink
ln -s ../config/app.conf ./app-link            # relative symlink (portable)

readlink -f symlink         # resolve to the real path (follows all links)
readlink symlink            # shows the target path as written
```
::
See chapter 03 for the full inode/hard-link/symlink discussion.

## Viewing File Content

::code-wrapper{language="bash"}
```bash
cat file              # dump entire file
cat -n file           # with line numbers
less file             # pager (q=quit, /=search, n=next, g/G=top/bottom)
head -n 20 file       # first 20 lines
tail -n 20 file       # last 20 lines
tail -f file          # follow (live updates) — use -F for rotation-safe
wc file               # lines, words, bytes
wc -l file            # lines only
file filename         # detect file type (text, ELF, archive, ...)
strings binary        # extract printable strings from a binary
od -c file            # octal/char dump (see bytes)
xxd file | head       # hex dump
```
::

## 💡 Tips & Tricks

- **Idiom**: use `install -m 755 script /usr/local/bin/` to copy + set permissions in one step — `install` sets the mode explicitly (ignores `umask`), so the result is predictable. Better than `cp` + `chmod`.
- **Idiom**: use `chmod -R` with symbolic modes, not octal — `chmod -R g+rw dir` adds group read/write without touching other bits. `chmod -R 644 dir` would remove execute from *everything* (including subdirs, breaking `cd`).
- **Idiom**: set `umask 077` for private systems and `umask 027` for shared — `077` makes all new files `600`/`700` (only owner). `027` allows group read. Put it in `~/.bashrc` or `/etc/profile.d/umask.sh`.
- **Idiom**: use setgid on shared directories — `chmod 2775 /shared` + `setfacl -d -m g:developers:rw /shared` makes new files inherit the `developers` group with rw, solving the "files created as my primary group" problem.
- **Idiom**: prefer file capabilities over setuid root — `setcap cap_net_bind_service+ep ./server` lets a binary bind to port 80 without running as root. Safer than `chmod u+s` + chown root (which grants *all* privileges).
- **Debug**: use `find / -perm -4000 -type f` to audit setuid binaries — any unexpected setuid root binary is a potential privilege-escalation vector. Compare against a known-good baseline after installation.
- **Debug**: use `namei -l /path/to/file` to see permissions on each component of a path — reveals when a "Permission denied" is due to a parent directory lacking `x`, not the file itself. Common when a user can't access a file despite `r` on it.

## ⚠️ Edge Cases & Gotchas

- **Directory `x` ≠ execute**: on directories, `x` is "search/traverse" — you need it to `cd` in or access files by path. `r` alone lets you list names but not access content. `x` alone lets you access known files but not list. This trips up everyone initially.
- **`rm` doesn't use the trash**: deletion is permanent. There's no undo. `rm -rf $UNSET_VAR/` with `set +u` can delete `/`. Always `set -u` in scripts. Use `trash-cli` (or `gio trash`) if you want recovery.
- **`cp` silently overwrites**: `cp important.conf old.conf.bak` — if `old.conf.bak` exists, it's replaced with no warning. Use `cp -n` (no-clobber) or `cp -i` (interactive) for safety. `cp -a` preserves mode/owner/timestamps (best for backups).
- **Symlink permissions are meaningless**: `chmod` on a symlink changes the *target's* permissions (on Linux — BSD differs). Symlinks always show `lrwxrwxrwx` in `ls -l`. Use `chmod -h symlink` to change the link itself (rarely needed), if your `chmod` supports it.
- **`umask` doesn't add execute**: files are created `666 & ~umask` — never `777`. So `umask 022` gives files `644` (not executable), dirs `755`. You must `chmod +x` scripts after creating them. This is why downloaded scripts need `chmod +x`.
- **setuid on scripts is ignored (on Linux)**: `chmod u+s script.sh` has no effect on shell scripts — the kernel ignores setuid on interpreted scripts (a security measure). Use `sudo` or a setuid C wrapper instead. This surprises people migrating from old Unix docs.
- **ACLs are lost on copy without `-a`**: `cp` without `--preserve=all` (or `-a`) strips ACLs and capabilities. `tar` preserves them only with `--acls`. `rsync` preserves with `-A` (ACLs) and `-X` (xattrs). Watch this when migrating files.
- **Moving a file doesn't change its owner**: `alice` moves a file to `/shared`; it's still owned by `alice`. Others in the group can read (if group has `r`), but can't modify (unless group has `w`). Set group write + setgid dir if collaboration is needed.
- **Deleting a file requires write on the directory, not the file**: a file with `r--r--r--` (no write for anyone) can be deleted if its directory is writable by the user. The sticky bit (`+t`) prevents deleting others' files in a shared dir.
- **Hard links to directories are forbidden (on most filesystems)**: `ln dir/ link` fails — only root *could*, and ext4 disallows it to avoid filesystem loops. Use `ln -s` (symlink) for directories.

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

The key insight: **directory write permission lets you create/delete files, but it doesn't grant write on files created by others** — that depends on each file's own group and permissions. The setgid bit + default ACL solves the "collaborative directory" pattern properly.
</details>