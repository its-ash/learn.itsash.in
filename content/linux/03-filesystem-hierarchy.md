# 03 — Filesystem Hierarchy

Linux organizes every file under a single root directory, `/`. There are no drive letters (`C:`, `D:`) — additional disks are **mounted** into the tree at directories (mount points). This chapter covers the standard layout, virtual filesystems, inodes, and mount mechanics — through production patterns and edge-case behavior.

## The Root Directory

::code-wrapper{language="bash"}
```bash
/
├── bin/      → /usr/bin    (user binaries)
├── sbin/     → /usr/sbin   (system binaries)
├── lib/      → /usr/lib    (shared libraries)
├── usr/                    (most user-facing software lives here)
│   ├── bin/
│   ├── sbin/
│   ├── lib/
│   ├── local/             (locally compiled software)
│   └── share/             (architecture-independent data, man pages)
├── etc/                   (system configuration — text files)
├── home/                  (user home directories)
│   └── alice/
├── root/                  (root user's home — NOT under /home)
├── var/                   (variable data: logs, mail, caches, spool)
│   ├── log/
│   ├── lib/
│   ├── cache/
│   └── spool/
├── tmp/                   (temporary files — cleared on reboot)
├── proc/                  (virtual: kernel & process info)
├── sys/                   (virtual: hardware & kernel info)
├── dev/                   (device files)
├── boot/                  (kernel, initramfs, bootloader)
├── opt/                   (optional, third-party software)
├── mnt/                   (temporary mount points)
├── media/                 (removable media — USB, CD)
└── run/                   (runtime data: PID files, sockets)
```
::

## `/proc` — Process & Kernel Info (Virtual)

`/proc` is a **virtual filesystem** — the files don't exist on disk; the kernel generates their content on the fly when you read them.

::code-wrapper{language="bash"}
```bash
# Complex Implementation: read per-process state from /proc/<pid>/
# — no ps/top needed; the kernel exposes everything as files
pid=1
cat /proc/$pid/comm                    # process name (e.g., "systemd")
cat /proc/$pid/cmdline | tr '\0' ' '   # args (null-separated → space)
ls -l /proc/$pid/cwd                   # symlink to working directory
ls -l /proc/$pid/exe                   # symlink to the executable
ls -l /proc/$pid/fd/                   # open file descriptors (symlinks)
cat /proc/$pid/environ | tr '\0' '\n'  # environment (null-separated → newline)
cat /proc/$pid/status | head -15       # human-readable status (UID, memory, state)

# Kernel tunables — read AND write (writing changes live kernel state):
cat /proc/sys/net/ipv4/ip_forward      # 0 or 1
echo 1 | sudo tee /proc/sys/net/ipv4/ip_forward  # enable IP forwarding NOW
# (prefer: sudo sysctl -w net.ipv4.ip_forward=1)
```
::

### Edge Case: `/proc` and `/sys` Are RAM-Only

::code-wrapper{language="bash"}
```bash
# NAIVE: try to measure /proc size (it's all virtual, in-kernel)
du -sh /proc                          # reports 0 or errors
# Anti-Pattern: backing up /proc, /sys, /dev — they're generated at read time
# sudo tar -czf backup.tar.gz /                     → includes garbage
# PRODUCTION: always exclude virtual filesystems
sudo tar -czf backup.tar.gz --exclude=/proc --exclude=/sys --exclude=/dev --exclude=/run /
```
::

## Inodes — How Files Actually Work

A filesystem stores files as **inodes** (index nodes), not names. An inode holds the file's metadata and data block pointers; the directory just maps names to inode numbers.

::code-wrapper{language="bash"}
```bash
Directory entry:        Inode (stored in the filesystem):
  "passwd" → inode 123     inode 123:
                              type: regular file
                              size: 3218
                              mode: 0644
                              owner UID: 0
                              mtime: 2026-06-15
                              data blocks: [block 42, block 87, ...]
```
::

::code-wrapper{language="bash"}
```bash
ls -i /etc/passwd         # show inode number (e.g., 12345)
stat /etc/passwd          # full inode info
df -i /                   # inode usage per filesystem (you can run out!)
```
::

### Edge Case: Inode Exhaustion

::code-wrapper{language="bash"}
```bash
# Complex Implementation: diagnose "No space left on device" when df shows free space
df -h /                  # space: 40 GB free
df -i /                  # inodes: IUse% = 100% (exhausted!)

# Find the directory consuming the most inodes:
for d in /*; do echo $(find "$d" -xdev 2>/dev/null | wc -l) "$d"; done | sort -rn | head
# Typical culprit: millions of tiny files (cache, mail queue, session files)

# Fix: delete the files, or reformat with more inodes:
# sudo mkfs.ext4 -i 4096 /dev/sdb1   # one inode per 4 KB (default is 16384)
```
::

### Hard Links vs Symlinks

::code-wrapper{language="bash"}
```bash
# Complex Implementation: demonstrate the inode-level difference
echo "hello" > original.txt
ln original.txt hardlink.txt        # hard link (same inode)
ln -s original.txt symlink.txt      # symbolic link (path pointer)

ls -li original.txt hardlink.txt symlink.txt
# 12345 -rw-r--r-- 2 alice alice 6 ... original.txt
# 12345 -rw-r--r-- 2 alice alice 6 ... hardlink.txt    ← same inode (12345)
# 67890 lrwxrwxrwx 1 alice alice 12 ... symlink.txt -> original.txt  ← different

rm original.txt
cat hardlink.txt    # still "hello" (inode still has link count 1)
cat symlink.txt     # error: No such file or directory (dangling symlink)

# Find broken symlinks:
find / -xtype l 2>/dev/null
```
::

- Hard links: can't cross filesystems, can't link directories (on most filesystems), survive deletion of the "original".
- Symlinks: can cross filesystems, can link directories, break if the target is moved/deleted.

## Mounts — How Disks Join the Tree

A **mount** attaches a filesystem's root to a directory in the tree. Before mounting, the directory is just an empty folder; after, its contents are the mounted filesystem's contents.

::code-wrapper{language="bash"}
```bash
# Complex Implementation: mount with explicit type + options + UUID
sudo blkid                                    # get UUIDs
sudo mount -t ext4 -o noatime UUID=abcd-1234 /mnt/data
sudo umount /mnt/data                          # unmount

# Edge Case: umount fails if filesystem is busy
# NAIVE: sudo umount /mnt/usb   → "target is busy"
# PRODUCTION: find what's using it
sudo lsof +D /mnt/usb                          # processes with open files
sudo fuser -vm /mnt/usb                        # alternative
# Force kill (dangerous):
sudo fuser -k /mnt/usb
# Lazy unmount (detaches now, cleans up when busy files close):
sudo umount -l /mnt/usb
```
::

### `/etc/fstab` — Persistent Mounts

::code-wrapper{language="bash"}
```bash
# <device>       <mountpoint>  <type>  <options>     <dump>  <pass>
UUID=ab12...   /             ext4    errors=remount-ro  0  1
UUID=cd34...   /home         ext4    defaults,noatime  0  2
tmpfs          /tmp          tmpfs   defaults,size=2G   0  0
/dev/sdb1      /mnt/data     ext4    noatime,nofail     0  2
```
::

- **`UUID=`** — identify by filesystem UUID (survives device name changes). Get with `blkid` or `lsblk -f`.
- **`nofail`** — boot continues if the device is absent (critical for USB/external disks).
- **`pass`** — `fsck` order at boot (0 = skip, 1 = root first, 2 = others).

::code-wrapper{language="bash"}
```bash
# Complex Implementation: validate fstab BEFORE rebooting (prevents emergency mode)
sudo findmnt --verify                        # syntax check
sudo mount -a                                # mount everything not already mounted
# If mount -a succeeds, reboot is safe
```
::

### Edge Case: Mounting Over a Non-Empty Directory

::code-wrapper{language="bash"}
```bash
# If /mnt/data has files and you mount a filesystem there:
sudo mount /dev/sdb1 /mnt/data
# The existing files are HIDDEN (not deleted) until you unmount.
# Confusing if you forgot a mount is active. Unmount to see them again:
sudo umount /mnt/data
ls /mnt/data                # original files reappear
```
::

## Filesystem Types

| Type | Use |
|---|---|
| `ext4` | Default on most Linux distros — mature, journaling, widely supported |
| `xfs` | Default on RHEL/Rocky — excellent for large files, online grow |
| `btrfs` | Copy-on-write, snapshots, compression, subvolumes |
| `zfs` | Enterprise: integrity, snapshots, RAID, compression (via OpenZFS) |
| `tmpfs` | RAM-backed (used for `/tmp`, `/run`) — fast, volatile |
| `vfat`/`exfat` | FAT32/exFAT — cross-platform USB drives |
| `ntfs` | Windows filesystem (via `ntfs-3g` or kernel `ntfs3`) |
| `overlay` | OverlayFS — containers (Docker/Podman layers) |

::code-wrapper{language="bash"}
```bash
# Complex Implementation: identify all mounted filesystems with types
findmnt -t ext4,xfs,btrfs              # only real filesystems
df -hT                                 # type + size/used/avail
df -x tmpfs -x devtmpfs -x squashfs   # exclude virtual FS from df output
```
::

## 💡 Tips & Tricks

- **Idiom**: use `findmnt` over `mount` for reading mounts — `findmnt` shows a readable tree, supports `--source`, `--target`, `--type` filters.
- **Idiom**: use `lsblk` to see the disk layout at a glance — block devices, partitions, sizes, mount points, filesystem types, in one tree.
- **Idiom**: use UUIDs in `fstab`, not `/dev/sda1` — device names can change across reboots. UUIDs are unique per filesystem and stable. Get them with `blkid` or `lsblk -f`.
- **Idiom**: add `noatime` to SSD mounts in `fstab` — disables access-time updates on every read, reducing writes and improving SSD lifespan/performance.
- **Idiom**: use `du -x /` to measure one filesystem only — `-x` (`--one-file-system`) prevents descending into other mounts, so you measure just `/` not `/home` or `/proc`.
- **Debug**: use `lsof +D /mnt/usb` (or `fuser -vm /mnt/usb`) to find what's blocking an unmount — shows processes with open files in that directory.

## ⚠️ Edge Cases & Gotchas

- **You can run out of inodes before disk space**: millions of tiny files (e.g., a cache, mail queue) exhaust inodes first. `df -h` shows space free, but `df -i` shows inodes exhausted. Fix: delete files or reformat with more inodes (`mkfs.ext4 -i 4096`).
- **Hard links can't cross filesystems**: `ln /home/alice/file /tmp/link` fails if `/home` and `/tmp` are different filesystems. Use `ln -s` (symlink) instead — but it breaks if the target moves.
- **Moving a file across filesystems is copy + delete**: `mv /home/bigfile /mnt/usb/` copies then deletes. If it runs out of space mid-copy, the destination has a partial file and the source may be gone. Use `rsync -a --remove-source-files` for safer cross-FS moves.
- **`/etc/fstab` errors can prevent booting**: a bad `fstab` entry causes boot to drop to emergency mode. Test with `sudo mount -a` before rebooting. Use `nofail` for non-critical mounts (e.g., USB) so boot continues if absent.
- **`/boot` can fill up from old kernels**: `apt` keeps old kernel images. `df -h /boot` filling up causes upgrade failures. Clean with `sudo apt autoremove --purge` (Debian/Ubuntu) or `dnf remove --oldinstallonly` (Fedora).

## 🧠 Quick Quiz

A user runs `df -h /` and sees 40 GB free, but `touch /testfile` fails with "No space left on device". What's likely happening, and how do you confirm it?

<details>
<summary>Answer</summary>

Two likely causes:

1. **Inode exhaustion** — the filesystem has free space but no free inodes (too many tiny files). Confirm with `df -i /` — if `IUse%` is 100%, you're out of inodes. Fix by deleting files (especially many small ones), or reformat with more inodes.

2. **A separate small filesystem is full** — `/` might have space, but the file is being created on a different mounted filesystem (e.g., `/tmp` is `tmpfs` with a `size=` limit, or `/var` is a separate partition). Confirm with `df -h /testfile` (resolves the actual filesystem) or `findmnt /testfile`.

::code-wrapper{language="bash"}
```bash
df -i /                 # check inode usage
df -h /testfile         # which filesystem does /testfile live on?
findmnt -T /testfile    # same, more readable
```
::

Also check filesystem quotas (`quota -v`) if enabled — a user can hit their quota even if the filesystem has space.
</details>