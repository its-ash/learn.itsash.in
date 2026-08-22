# 03 — Filesystem Hierarchy

Linux organizes every file under a single root directory, `/`. There are no drive letters (`C:`, `D:`) like on Windows — additional disks and partitions are **mounted** into the tree at directories (mount points). This chapter covers the standard layout, the virtual filesystems, inodes, and how mounting works.

## The Root Directory (`/`)

```text
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

## Key Directories in Depth

### `/etc` — Configuration

All system-wide configuration lives here, as **text files** you can read and edit (no registry, no binary blobs):

| File | Purpose |
|---|---|
| `/etc/passwd` | User accounts (name, UID, shell, home) |
| `/etc/shadow` | Password hashes (readable only by root) |
| `/etc/group` | Group definitions |
| `/etc/sudoers` | `sudo` policy (edit with `visudo`) |
| `/etc/fstab` | Filesystem mount table |
| `/etc/hostname` | System hostname |
| `/etc/hosts` | Static hostname → IP mappings |
| `/etc/resolv.conf` | DNS resolver config |
| `/etc/ssh/sshd_config` | SSH server config |
| `/etc/systemd/` | systemd unit files, drop-ins |
| `/etc/crontab`, `/etc/cron.d/` | System cron jobs |
| `/etc/environment` | System-wide environment variables |

::code-wrapper{language="bash"}
```bash
cat /etc/passwd | head
# root:x:0:0:root:/root:/bin/bash
# daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
# alice:x:1000:1000:Alice,,,:/home/alice:/bin/bash
```
::
`/etc` is the first place to look when configuring a service. Most files have a `man 5 <name>` page (`man 5 passwd`, `man 5 fstab`).

### `/var` — Variable Data

Data that changes during normal operation:

| Path | Contents |
|---|---|
| `/var/log/` | Log files (`syslog`, `auth.log`, `messages`, `journal/`) |
| `/var/lib/` | Application state (databases, package dbs, systemd) |
| `/var/cache/` | Cached data (can be regenerated) |
| `/var/spool/` | Queues (print, mail, cron, at) |
| `/var/tmp/` | Temp files that survive reboots (up to 30 days) |
| `/var/mail/` | User mailboxes (mbox format) |
| `/var/www/` | Web server document root (convention) |

::code-wrapper{language="bash"}
```bash
ls /var/log/
# alternatives.log  auth.log  dpkg.log  journal/  syslog  ...
```
::

### `/proc` — Process & Kernel Info (Virtual)

`/proc` is a **virtual filesystem** — the files don't exist on disk; the kernel generates their content on the fly when you read them. It's a window into the running kernel and processes.

| Path | Contents |
|---|---|
| `/proc/cpuinfo` | CPU model, cores, flags |
| `/proc/meminfo` | Memory usage (MemTotal, MemFree, etc.) |
| `/proc/version` | Kernel version, gcc version |
| `/proc/uptime` | Seconds since boot, seconds idle |
| `/proc/loadavg` | Load averages, running/total processes |
| `/proc/cmdline` | Boot parameters passed to the kernel |
| `/proc/filesystems` | Supported filesystem types |
| `/proc/mounts` | Current mounts (same as `/etc/mtab`) |
| `/proc/<pid>/` | Per-process info (status, maps, fd, cmdline) |
| `/proc/sys/` | Tunable kernel parameters (`sysctl`) |

::code-wrapper{language="bash"}
```bash
cat /proc/cpuinfo | head -10
cat /proc/meminfo | head -5
# MemTotal:       16332940 kB
# MemFree:         8234520 kB
# MemAvailable:   11234567 kB
# ...

cat /proc/1/comm      # systemd (PID 1's name)
cat /proc/1/cmdline | tr '\0' ' '   # PID 1's command line (null-separated)

# Kernel tunables — read and write:
cat /proc/sys/net/ipv4/ip_forward        # 0 or 1
echo 1 | sudo tee /proc/sys/net/ipv4/ip_forward   # enable IP forwarding
# (prefer: sudo sysctl -w net.ipv4.ip_forward=1)
```
::

### `/sys` — Hardware & Kernel Objects (Virtual)

`/sys` is a **sysfs** virtual filesystem exposing the kernel's device model. Each directory is a kernel object (device, bus, driver, class). Useful for hardware info and control:

::code-wrapper{language="bash"}
```bash
ls /sys/class/net/                    # network interfaces
cat /sys/class/net/eth0/address       # MAC address
cat /sys/class/net/eth0/mtu           # MTU (1500)
echo 9000 | sudo tee /sys/class/net/eth0/mtu   # set jumbo frames

ls /sys/class/block/sda/              # disk attributes
cat /sys/class/block/sda/size         # size in 512-byte sectors
cat /sys/class/block/sda/queue/scheduler   # I/O scheduler

ls /sys/class/backlight/              # display brightness
cat /sys/class/power_supply/BAT0/capacity  # battery %
```
::

### `/dev` — Device Files

Devices are represented as files:

| Path | Device |
|---|---|
| `/dev/null` | Discard sink (writes vanish, reads give EOF) |
| `/dev/zero` | Infinite stream of zero bytes |
| `/dev/random` | Cryptographic random (blocks if entropy low) |
| `/dev/urandom` | Non-blocking random (recommended) |
| `/dev/sda`, `/dev/sda1` | Whole disk, first partition (SATA/SCSI) |
| `/dev/nvme0n1`, `/dev/nvme0n1p1` | NVMe disk, partition |
| `/dev/tty1`–`/dev/tty6` | Virtual consoles |
| `/dev/pts/0`... | Pseudo-terminals (SSH, terminal emulators) |
| `/dev/loop0`... | Loop devices (mounting images) |

::code-wrapper{language="bash"}
```bash
# /dev/null — discard
echo "noise" > /dev/null
cat /dev/null > bigfile   # truncate bigfile to 0 bytes

# /dev/zero — create a 1 GB file of zeros
dd if=/dev/zero of=1g.bin bs=1M count=1024

# /dev/urandom — generate a random password
head -c 16 /dev/urandom | base64

# Mount an ISO as a loop device
sudo mount -o loop ubuntu.iso /mnt
```
::

### `/boot` — Boot Files

| File | Contents |
|---|---|
| `/boot/vmlinuz-*` | Compressed kernel image |
| `/boot/initrd.img-*` / `initramfs-*` | Initial RAM disk (early userspace) |
| `/boot/grub/grub.cfg` | GRUB bootloader config (generated — don't edit directly) |
| `/boot/grub/custom.cfg` | Custom GRUB snippets (safe to edit) |

### `/run` and `/tmp`

- **`/run`** — runtime data (PID files, sockets, lock files). Backed by `tmpfs` (RAM), cleared on reboot. Replaced the old `/var/run` and `/var/lock` (now symlinks to `/run`).
- **`/tmp`** — temporary files. Also typically `tmpfs` (RAM) on modern distros. Cleared on reboot; `systemd-tmpfiles` may clean hourly.

### `/usr` — The Bulk of the System

"UNIX System Resources" (not "user"). Most installed software lives here:

- `/usr/bin/` — most user commands (`python3`, `git`, `vim`).
- `/usr/sbin/` — admin commands (`useradd`, `fdisk`).
- `/usr/lib/` — shared libraries (`.so` files), application data.
- `/usr/local/` — software compiled locally (survives distro upgrades).
- `/usr/share/` — architecture-independent data (man pages, icons, docs, locale).

### `/opt` — Third-Party Software

Convention for self-contained, third-party software that installs everything under one directory:

```text
/opt/google/chrome/...
/opt/discord/...
/opt/myapp/bin/, /opt/myapp/lib/, /opt/myapp/share/
```
Contrast with `/usr/local`, which scatters files into `bin/`, `lib/`, etc.

## Inodes — How Files Actually Work

A filesystem stores files as **inodes** (index nodes), not names. An inode holds the file's metadata and data block pointers; the directory just maps names to inode numbers.

```text
Directory entry:        Inode (stored in the filesystem):
  "passwd" → inode 123     inode 123:
                              type: regular file
                              size: 3218
                              mode: 0644
                              owner UID: 0
                              mtime: 2026-06-15
                              data blocks: [block 42, block 87, ...]
```

::code-wrapper{language="bash"}
```bash
ls -i /etc/passwd         # show inode number (e.g., 12345)
stat /etc/passwd          # full inode info
df -i /                   # inode usage per filesystem (you can run out!)
```
::

### Implications

- **Hard links** are multiple names for the same inode — same file, two paths. Deleting one doesn't delete the data (link count > 0).
- **Symbolic links (symlinks)** are separate files containing a path — a pointer to another name, not to an inode.
- **Renaming a file** (`mv`) doesn't move data — it changes a directory entry (instant, same filesystem).
- **Moving across filesystems** copies + deletes (different inode space).
- **You can run out of inodes** without running out of disk space — millions of tiny files exhaust inodes first. Check with `df -i`.

### Hard Links vs Symlinks

::code-wrapper{language="bash"}
```bash
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
```
::
- Hard links: can't cross filesystems, can't link directories (on most filesystems), survive deletion of the "original".
- Symlinks: can cross filesystems, can link directories, break if the target is moved/deleted.

## Mounts — How Disks Join the Tree

A **mount** attaches a filesystem's root to a directory in the tree. Before mounting, the directory is just an empty folder; after, its contents are the mounted filesystem's contents.

::code-wrapper{language="bash"}
```bash
mount                    # list all mounts
findmnt                  # nicer mount listing (tree view)
lsblk                    # block devices and mount points
df -h                    # disk free per filesystem
df -hT                   # + filesystem type
```
::

### Manual Mount

::code-wrapper{language="bash"}
```bash
sudo mount /dev/sdb1 /mnt/usb          # mount a partition
sudo mount -t ext4 /dev/sdb1 /mnt/usb  # specify filesystem type
sudo mount -o ro /dev/sdb1 /mnt/usb    # read-only
sudo umount /mnt/usb                   # unmount (or sudo umount /dev/sdb1)
```
::
- A busy filesystem can't be unmounted (files open, processes using it). Find them with `lsof +D /mnt/usb` or `fuser -m /mnt/usb`.
- `umount -l` (lazy) detaches now, cleans up when busy files close. Use cautiously.

### `/etc/fstab` — Persistent Mounts

Mounts via `mount` are lost on reboot. `/etc/fstab` (file system table) makes them permanent:

::code-wrapper{language="bash"}
```bash
cat /etc/fstab
# <device>       <mountpoint>  <type>  <options>     <dump>  <pass>
# UUID=ab12...   /             ext4    errors=remount-ro  0  1
# UUID=cd34...   /home         ext4    defaults        0     2
# tmpfs          /tmp          tmpfs   defaults,size=2G  0   0
# /dev/sdb1      /mnt/data     ext4    noatime         0     2
```
::
- **`UUID=`** — identify by filesystem UUID (survives device name changes). Get with `blkid` or `lsblk -f`.
- **`defaults`** — `rw,suid,dev,exec,auto,nouser,async`.
- **`dump`** — backup utility flag (usually 0).
- **`pass`** — `fsck` order at boot (0 = skip, 1 = root first, 2 = others).
- After editing, test with `sudo mount -a` (mounts everything in `fstab` that isn't already mounted).

### Common Mount Options

| Option | Effect |
|---|---|
| `defaults` | Standard set (see above) |
| `noatime` | Don't update access times (better SSD performance) |
| `relatime` | Update atime only if older than mtime (default on modern distros) |
| `ro` | Read-only |
| `rw` | Read-write (default) |
| `exec` / `noexec` | Allow/prevent running binaries from the FS |
| `nosuid` | Ignore setuid/setgid bits |
| `nodev` | Ignore device files |
| `user` | Allow non-root to mount (e.g., for USB) |
| `discard` | Enable TRIM (SSD) |

## Filesystem Types

| Type | Use |
|---|---|
| `ext4` | Default on most Linux distros — mature, journaling, widely supported |
| `xfs` | Default on RHEL/Rocky — excellent for large files, online defrag |
| `btrfs` | Copy-on-write, snapshots, compression, subvolumes |
| `zfs` | Enterprise: integrity, snapshots, RAID, compression (via OpenZFS) |
| `f2fs` | Flash-friendly (designed for SSDs/SD cards) |
| `tmpfs` | RAM-backed (used for `/tmp`, `/run`) — fast, volatile |
| `vfat`/`exfat` | FAT32/exFAT — cross-platform USB drives |
| `ntfs` | Windows filesystem (via `ntfs-3g` or kernel `ntfs3`) |
| `iso9660` | ISO 9660 — CD/DVD images |
| `nfs`, `cifs` | Network filesystems (NFS, SMB/CIFS) |
| `overlay` | OverlayFS — containers (Docker/Podman layers) |

::code-wrapper{language="bash"}
```bash
df -hT                    # type + size/used/avail
mount | grep ext4         # all ext4 mounts
lsblk -f                  # block devices + filesystem type + UUID
```
::

## 💡 Tips & Tricks

- **Idiom**: use `findmnt` over `mount` for reading mounts — `findmnt` shows a readable tree, supports `--source`, `--target`, `--type` filters. `mount` is fine for mounting but verbose for listing.
- **Idiom**: use `lsblk` to see the disk layout at a glance — block devices, partitions, sizes, mount points, filesystem types, in one tree. Use it before `mount`/`fdisk` to know what you're working with.
- **Idiom**: use UUIDs in `fstab`, not `/dev/sda1` — device names can change across reboots (USB plugged in at a different time). UUIDs are unique per filesystem and stable. Get them with `blkid` or `lsblk -f`.
- **Idiom**: add `noatime` to SSD mounts in `fstab` — disables access-time updates on every read, reducing writes and improving SSD lifespan/performance. `relatime` (default) is a safe compromise.
- **Idiom**: use `mkdir -p` before mounting — `mount` fails if the mount point doesn't exist. `sudo mkdir -p /mnt/data && sudo mount /dev/sdb1 /mnt/data`.
- **Debug**: use `lsof +D /mnt/usb` (or `fuser -vm /mnt/usb`) to find what's blocking an unmount — shows processes with open files in that directory. Close them or `kill` the PIDs.
- **Debug**: use `du -x /` to measure one filesystem only — `-x` (`--one-file-system`) prevents descending into other mounts, so you measure just `/` not `/home` or `/proc`.

## ⚠️ Edge Cases & Gotchas

- **`/proc`, `/sys`, `/dev`, `/run` are virtual or RAM-backed**: `du -sh /proc` gives nonsense or errors. Don't back them up. `tar --exclude=/proc --exclude=/sys --exclude=/dev` when backing up `/`.
- **You can run out of inodes before disk space**: millions of tiny files (e.g., a cache, mail queue) exhaust inodes first. `df -h` shows space free, but `df -i` shows inodes exhausted. Fix: delete files or reformat with more inodes (`mkfs.ext4 -i 4096`).
- **Hard links can't cross filesystems**: `ln /home/alice/file /tmp/link` fails if `/home` and `/tmp` are different filesystems. Use `ln -s` (symlink) instead — but it breaks if the target moves.
- **Symlinks can dangle**: `ln -s target link; rm target; cat link` → "No such file or directory". `find / -xtype l` finds broken symlinks. `rm` the link, not the (missing) target.
- **Moving a file across filesystems is copy + delete**: `mv /home/bigfile /mnt/usb/` copies then deletes. If it runs out of space mid-copy, the destination has a partial file and the source may be gone. Use `rsync -a --remove-source-files` for safer cross-FS moves.
- **`/etc/fstab` errors can prevent booting**: a bad `fstab` entry causes boot to drop to emergency mode. Test with `sudo mount -a` before rebooting. Use `nofail` for non-critical mounts (e.g., USB) so boot continues if absent.
- **`/tmp` is cleared on reboot** (and sometimes hourly by `systemd-tmpfiles`): don't store anything you need. Use `/var/tmp` for files that should survive reboots (30-day default).
- **Mounting over a non-empty directory hides existing files**: if `/mnt/data` has files and you mount a filesystem there, those files are hidden (not deleted) until you unmount. Confusing if you forgot a mount is active. Unmount to see them again.
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