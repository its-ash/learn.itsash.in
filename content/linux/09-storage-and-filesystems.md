# 09 — Storage & Filesystems

Storage is where data lives persistently. This chapter covers disks, partitions, filesystems, mounting, LVM (Logical Volume Manager), RAID, and `fsck` (filesystem check). These are core sysadmin skills — and the place where mistakes cause the most damage (data loss).

## The Storage Stack

```text
┌─────────────────────────────────────┐
│  Filesystem (ext4, xfs, btrfs...)   │  ← what you mount
├─────────────────────────────────────┤
│  LVM Logical Volume (optional)      │  ← flexible virtual disk
├─────────────────────────────────────┤
│  Partition (sda1, sda2)             │  ← slice of a disk
├─────────────────────────────────────┤
│  Block Device (sda, nvme0n1)        │  ← the physical disk
├─────────────────────────────────────┤
│  Hardware (SATA, NVMe, USB, RAID)   │
└─────────────────────────────────────┘
```

You can skip layers (e.g., use a whole disk without partitions, or use a filesystem directly on a partition without LVM), but this is the typical stack.

## Block Devices

### Naming

| Device | Interface | Name Pattern |
|---|---|---|
| SATA, SCSI, USB | SATA/SCSI | `/dev/sda`, `/dev/sdb`, `/dev/sda1` |
| NVMe | PCIe | `/dev/nvme0n1`, `/dev/nvme0n1p1` |
| MMC/SD | SD card | `/dev/mmcblk0`, `/dev/mmcblk0p1` |
| Loop | Image file | `/dev/loop0`, `/dev/loop0p1` |
| RAM disk | — | `/dev/ram0` |

- `sda` = first SATA/SCSI disk, `sdb` = second. `sda1` = first partition on `sda`.
- `nvme0n1` = first NVMe **namespace** (a disk), `nvme0n1p1` = first **partition**. The `n` (namespace) and `p` (partition) are NVMe-specific.

::code-wrapper{language="bash"}
```bash
lsblk                  # tree view of block devices + partitions + mounts
lsblk -f               # + filesystem type, UUID, label
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,MODEL
sudo fdisk -l          # list all disks + partition tables
sudo parted -l         # same, different format
cat /proc/partitions   # kernel's view of partitions
dmesg | grep -i sd     # disk detection messages at boot
``
::

## Partitioning

A **partition** is a contiguous region of a disk. Partition tables come in two flavors:

| Table | Max Disks | Max Partitions | Notes |
|---|---|---|---|
| MBR (DOS) | 2 TB | 4 primary (or 3 + 1 extended with logicals) | Legacy |
| GPT | 8 ZB | 128 (typical) | Modern, required for UEFI boot |

### `fdisk` — MBR and GPT (Interactive)

::code-wrapper{language="bash"}
```bash
sudo fdisk /dev/sdb
# Commands (interactive):
#   m  help
#   p  print partition table
#   n  new partition
#   d  delete partition
#   t  change partition type (e.g., 83 = Linux, 82 = swap, 8e = Linux LVM)
#   w  write and exit
#   q  quit without saving
``
::

### `parted` — GPT-Friendly

::code-wrapper{language="bash"}
```bash
sudo parted /dev/sdb
# (parted) mklabel gpt               # create GPT table (destroys data!)
# (parted) mkpart primary ext4 0% 50%   # first half
# (parted) mkpart primary ext4 50% 100% # second half
# (parted) print
# (parted) quit

# Non-interactive:
sudo parted -s /dev/sdb mklabel gpt
sudo parted -s /dev/sdb mkpart primary ext4 0% 50%
``
::

### `sgdisk` — Scriptable GPT

::code-wrapper{language="bash"}
```bash
# Zap all partitions and create one GPT partition
sudo sgdisk -Z /dev/sdb
sudo sgdisk -n 1:0:0 /dev/sdb    # partition 1, start default, end default (whole disk)
sudo sgdisk -t 1:8e00 /dev/sdb   # type = Linux LVM
``
::

### Partition Types (Notable)

| Code | Type |
|---|---|
| 8300 (GPT) / 83 (MBR) | Linux filesystem |
| 8200 (GPT) / 82 (MBR) | Linux swap |
| 8e00 (GPT) / 8e (MBR) | Linux LVM |
| fd00 (GPT) / fd (MBR) | Linux RAID autodetect |
| ef00 (GPT) | EFI System Partition (ESP) |
| 0700 (GPT) | Microsoft basic data (NTFS/exFAT) |

After partitioning, the kernel may need to re-read the table:

::code-wrapper{language="bash"}
```bash
sudo partprobe /dev/sdb    # tell kernel about new partitions
``
::

## Creating Filesystems (`mkfs`)

::code-wrapper{language="bash"}
```bash
sudo mkfs.ext4 /dev/sdb1                 # ext4 (default for most)
sudo mkfs.ext4 -L data /dev/sdb1         # with label
sudo mkfs.ext4 -i 4096 /dev/sdb1         # one inode per 4 KB (for many small files)
sudo mkfs.xfs /dev/sdb2                  # XFS (RHEL default)
sudo mkfs.btrfs /dev/sdb3                # Btrfs
sudo mkfs.fat -F32 /dev/sdb4             # FAT32 (for EFI/USB)
sudo mkfs.exfat /dev/sdb5                # exFAT (cross-platform USB)
sudo mkfs.ntfs -f /dev/sdb6              # NTFS (fast)
sudo mkswap /dev/sdb7                    # swap
``
::

### ext4 Options

| Option | Effect |
|---|---|
| `-L label` | Filesystem label (shown in `lsblk`, `findmnt`) |
| `-i bytes-per-inode` | More inodes for many small files (default 16384) |
| `-b block-size` | 1024, 2048, 4096 (default 4096) |
| `-m reserved%` | Reserved blocks for root (default 5%, reduce for data disks: `-m 0`) |
| `-O feature` | Enable/disable features (e.g., `-O ^has_journal` for no journal) |
| `-T largefile` | Fewer inodes, larger files (reduces inode count) |

::code-wrapper{language="bash"}
```bash
sudo mkfs.ext4 -L data -m 0 -i 4096 /dev/sdb1   # data disk: no reserved, many inodes
sudo mkfs.ext4 -m 1 /dev/sdb1                   # 1% reserved (reasonable for most)
``
::

### XFS vs ext4

| Feature | ext4 | XFS |
|---|---|---|
| Default on | Debian/Ubuntu | RHEL/Rocky |
| Shrink | Yes (offline) | No |
| Grow | Yes (online) | Yes (online) |
| Large files | Good | Excellent |
| Snapshots | Via LVM | Via LVM |
| Integrity | Journal metadata | Journal metadata + checksums (xfsprogs 5+) |

Choose XFS for large files and growing; ext4 for general use and shrinking.

## Mounting

Covered in chapter 03; key commands:

::code-wrapper{language="bash"}
```bash
sudo mount /dev/sdb1 /mnt/data            # mount
sudo mount -t ext4 -o noatime /dev/sdb1 /mnt/data   # with options
sudo umount /mnt/data                     # unmount
sudo umount -l /mnt/data                  # lazy unmount (if busy)
findmnt                                   # tree view of mounts
mount | grep sdb                          # raw mount list
``
::

### `/etc/fstab` — Persistent Mounts

::code-wrapper{language="bash"}
```bash
# <device>      <mount>   <type>  <options>           <dump> <pass>
UUID=abcd-1234  /data     ext4    defaults,noatime    0      2
/dev/sdb2       /mnt/usb  exfat   defaults,noatime,uid=1000,gid=1000  0  0
tmpfs           /tmp      tmpfs   defaults,size=2G    0      0
``
::

- Use `UUID=` (stable across reboots). Get with `blkid` or `lsblk -f`.
- Test with `sudo mount -a` before rebooting.
- Use `nofail` for non-critical mounts (e.g., external USB) so boot doesn't fail if absent.

::code-wrapper{language="bash"}
```bash
sudo blkid                       # list all block devices + UUIDs + types
sudo findmnt --verify            # validate fstab syntax
sudo mount -a                    # mount everything in fstab (test after editing)
``
::

## Swap

Swap is disk space used as overflow when RAM is full. Modern systems with lots of RAM may not need much, but it's still recommended (for hibernation, memory spikes).

::code-wrapper{language="bash"}
```bash
sudo mkswap /dev/sdb7            # create swap on a partition
sudo swapon /dev/sdb7            # enable
sudo swapon --show               # list active swap
free -h                          # see RAM + swap usage
sudo swapoff /dev/sdb7           # disable

# Swap file (no partition needed):
sudo fallocate -l 4G /swapfile   # create a 4 GB file
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
# Add to /etc/fstab: /swapfile none swap defaults 0 0
``
::

### `swappiness`

Controls how aggressively the kernel swaps. 0–100 (default 60). Lower = prefer keeping apps in RAM:

::code-wrapper{language="bash"}
```bash
cat /proc/sys/vm/swappiness       # 60
sudo sysctl vm.swappiness=10      # reduce swapping (database servers)
# Persistent: echo "vm.swappiness=10" | sudo tee /etc/sysctl.d/99-swappiness.conf
``
::

## LVM — Logical Volume Manager

LVM abstracts physical disks into flexible logical volumes. You can resize, snapshot, and span multiple disks — impossible with plain partitions.

### LVM Hierarchy

```text
Physical Volume (PV)      ← a disk or partition (e.g., /dev/sdb1)
    ↓
Volume Group (VG)         ← pool of PVs (e.g., vg_data)
    ↓
Logical Volume (LV)       ← a slice of the VG, used like a partition (e.g., lv_data)
    ↓
Filesystem                ← ext4/xfs on the LV
```

### Creating LVM

::code-wrapper{language="bash"}
```bash
# 1. Create a PV on a partition (or whole disk)
sudo pvcreate /dev/sdb1 /dev/sdc1

# 2. Create a VG spanning both PVs
sudo vgcreate vg_data /dev/sdb1 /dev/sdc1

# 3. Create an LV (10 GB)
sudo lvcreate -L 10G -n lv_data vg_data

# 4. Create a filesystem on the LV
sudo mkfs.ext4 /dev/vg_data/lv_data

# 5. Mount
sudo mount /dev/vg_data/lv_data /mnt/data
``
::

### Resizing LVM (The Big Advantage)

::code-wrapper{language="bash"}
```bash
# Grow an LV by 5 GB (VG must have free space)
sudo lvextend -L +5G /dev/vg_data/lv_data
# Grow to use all remaining free space in the VG
sudo lvextend -l +100%FREE /dev/vg_data/lv_data

# Resize the filesystem to use the new space
sudo resize2fs /dev/vg_data/lv_data     # ext4 (online, while mounted)
sudo xfs_growfs /mnt/data               # XFS (online, while mounted)

# Shrink (ext4 only — must be unmounted)
sudo umount /mnt/data
sudo e2fsck -f /dev/vg_data/lv_data     # check first (required)
sudo resize2fs /dev/vg_data/lv_data 8G  # shrink filesystem
sudo lvreduce -L 8G /dev/vg_data/lv_data # shrink LV
sudo mount /dev/vg_data/lv_data /mnt/data
``
::

### LVM Snapshots

A snapshot is a copy-on-write point-in-time image of an LV. Useful for backups:

::code-wrapper{language="bash"}
```bash
# Create a 5 GB snapshot
sudo lvcreate -L 5G -s -n lv_data_snap /dev/vg_data/lv_data
# Mount the snapshot (read-only for backup)
sudo mount -o ro /dev/vg_data/lv_data_snap /mnt/snap
# Back it up...
# Remove the snapshot when done
sudo umount /mnt/snap
sudo lvremove /dev/vg_data/lv_data_snap
``
::

The snapshot only stores changes (copy-on-write). Size it based on how much the origin will change during the backup window. If the snapshot fills up, it's invalidated.

### LVM Inspection

::code-wrapper{language="bash"}
```bash
sudo pvs              # physical volumes
sudo vgs              # volume groups
sudo lvs              # logical volumes
sudo pvdisplay        # detailed PV info
sudo vgdisplay        # detailed VG info
sudo lvdisplay        # detailed LV info
sudo lvscan           # LV status (active/inactive)
``
::

## RAID (mdadm)

Software RAID combines multiple disks for redundancy or performance. Managed with `mdadm`:

### RAID Levels

| Level | Min Disks | Redundancy | Space Efficiency | Use |
|---|---|---|---|---|
| 0 | 2 | None (data loss if any disk fails) | 100% | Speed (not for data you need) |
| 1 | 2 | 1 disk | 50% | OS mirror |
| 5 | 3 | 1 disk | (n-1)/n | General purpose |
| 6 | 4 | 2 disks | (n-2)/n | Important data |
| 10 | 4 | 1 per mirror pair | 50% | Speed + redundancy |

### Creating a RAID Array

::code-wrapper{language="bash"}
```bash
# RAID 1 (mirror) with two disks
sudo mdadm --create /dev/md0 --level=1 --raid-devices=2 /dev/sdb /dev/sdc
# RAID 5 with three disks
sudo mdadm --create /dev/md0 --level=5 --raid-devices=3 /dev/sdb /dev/sdc /dev/sdd

# Watch it build (can take hours for large disks)
cat /proc/mdstat
sudo mdadm --detail /dev/md0

# Create a filesystem on the array
sudo mkfs.ext4 /dev/md0
sudo mount /dev/md0 /mnt/raid
``
::

### Saving the RAID Configuration

::code-wrapper{language="bash"}
```bash
sudo mdadm --detail --scan | sudo tee -a /etc/mdadm/mdadm.conf
sudo update-initramfs -u       # Debian (so RAID is available at boot)
sudo dracut -f                 # RHEL
``
::

### Managing a RAID

::code-wrapper{language="bash"}
```bash
sudo mdadm --detail /dev/md0              # status
cat /proc/mdstat                          # all arrays, build progress
sudo mdadm --fail /dev/md0 /dev/sdb       # mark a disk failed
sudo mdadm --remove /dev/md0 /dev/sdb     # remove it
sudo mdadm --add /dev/md0 /dev/sde        # add a replacement (rebuild starts)
sudo mdadm --stop /dev/md0                # stop the array
sudo mdadm --assemble /dev/md0 /dev/sdb /dev/sdc  # reassemble
``
::

## `fsck` — Filesystem Check

`fsck` (filesystem check) finds and repairs filesystem corruption. Modern journaling filesystems (ext4, xfs) rarely need it, but it's essential after a crash or power loss.

::code-wrapper{language="bash"}
```bash
sudo fsck /dev/sdb1              # check (interactive — prompts to fix)
sudo fsck -y /dev/sdb1           # answer yes to all prompts
sudo fsck -n /dev/sdb1           # check only (no changes, read-only)
sudo fsck -f /dev/sdb1           # force check even if marked clean
sudo fsck.ext4 -y /dev/sdb1      # ext4-specific
sudo fsck.xfs /dev/sdb1          # XFS (usually just replays the journal)
sudo fsck -t ext4 /dev/sdb1      # specify type
``
::

**The filesystem must be unmounted** when running `fsck`. Running `fsck` on a mounted filesystem can corrupt it. The root filesystem is checked at boot (from `initramfs`) before it's mounted.

### When `fsck` Runs Automatically

ext4 marks itself "clean" on unmount and "dirty" if it wasn't cleanly unmounted (crash, power loss). At boot, the kernel checks the journal and `fsck` runs if needed. The `pass` field in `fstab` controls boot-time `fsck` order (0 = skip, 1 = root first, 2 = others).

## SMART — Disk Health

SMART (Self-Monitoring, Analysis and Reporting Technology) reports disk health attributes. Use `smartctl`:

::code-wrapper{language="bash"}
```bash
sudo smartctl -a /dev/sda             # all SMART attributes
sudo smartctl -H /dev/sda             # health status (PASSED/FAILED)
sudo smartctl -t short /dev/sda       # run a short self-test (2 min)
sudo smartctl -t long /dev/sda        # long self-test (hours)
sudo smartctl -l error /dev/sda       # error log
sudo smartctl -l selftest /dev/sda    # self-test log
``
::

- **Reallocated_Sector_Ct** (5) — if increasing, the disk is failing.
- **Current_Pending_Sector** (197) — sectors awaiting reallocation.
- **Offline_Uncorrectable** (198) — unreadable sectors.
- Replace the disk if any of these are non-zero and growing.

Automate with `smartd` (daemon that monitors and emails on failure) — config in `/etc/smartd.conf`.

## `dd` — Low-Level Copy

`dd` copies raw bytes between devices/files. Powerful and dangerous:

::code-wrapper{language="bash"}
```bash
# Clone a disk (sector-by-sector) — target must be same size or larger
sudo dd if=/dev/sda of=/dev/sdb bs=4M status=progress

# Create a disk image
sudo dd if=/dev/sda of=disk.img bs=4M status=progress

# Write an ISO to a USB
sudo dd if=ubuntu.iso of=/dev/sdb bs=4M status=progress conv=fsync
# (use /dev/sdb, the whole disk, NOT /dev/sdb1)

# Wipe a disk (write zeros)
sudo dd if=/dev/zero of=/dev/sdb bs=4M status=progress

# Create a file of a specific size
dd if=/dev/zero of=file.img bs=1M count=100    # 100 MB

# Rescue a failing disk (use ddrescue for better recovery)
sudo ddrescue /dev/sda /mnt/backup/disk.img mapfile
``
::

**`dd` respects exactly what you type — `if=` and `of=` are easy to swap.** Double-check before pressing Enter. `of=/dev/sda` instead of `of=disk.img` overwrites your whole disk.

## `df` and `du`

::code-wrapper{language="bash"}
```bash
df -h                  # disk free per filesystem (human-readable)
df -hT                 # + type
df -i                  # inode usage (can run out without running out of space)
df -x tmpfs -x devtmpfs  # exclude virtual filesystems

du -sh /home           # size of /home (human-readable, summary)
du -sh /home/*         # size of each subdirectory
du -ah /var/log | sort -rh | head -20   # 20 largest items under /var/log
du -x /                # don't cross filesystem boundaries
du --max-depth=1 -h /  # top-level only
ncdu /                 # interactive disk usage explorer (install ncdu)
``
::

## 💡 Tips & Tricks

- **Idiom**: use `lsblk -f` as your first storage command — shows all block devices, partitions, filesystem types, UUIDs, and mount points in one tree. It's the "at a glance" view. Run it before any `mount`/`fdisk`/`mkfs` operation.
- **Idiom**: use UUIDs in `fstab`, not `/dev/sda1` — device names can change across reboots (USB plugged in at different time, BIOS reordering). UUIDs are unique per filesystem and stable. `blkid` or `lsblk -f` gives them.
- **Idiom**: use `nofail` in `fstab` for non-critical mounts — if an external USB or secondary data disk is absent at boot, `nofail` lets the boot continue. Without it, the system drops to emergency mode.
- **Idiom**: use `mkfs.ext4 -m 0` for data-only filesystems — the default 5% reserved for root makes sense for `/` (keeps root able to log in if disk is full), but on a 4 TB data disk it wastes 200 GB. `-m 0` or `-m 1` for data partitions.
- **Idiom**: use LVM for any non-root filesystem that might grow — resizing plain partitions is painful (unmount, repartition, risk). LVM lets you `lvextend` + `resize2fs` online (while mounted). Plan ahead: even if you don't need LVM now, using it costs little and enables future flexibility.
- **Idiom**: use `findmnt --verify` after editing `fstab` — catches syntax errors before reboot. A bad `fstab` can drop you to emergency mode at boot. Always `sudo mount -a` + `findmnt --verify` after editing.
- **Debug**: use `cat /proc/mdstat` to watch RAID rebuild progress — shows array status, sync percentage, and which disks are involved. Essential after replacing a failed disk.
- **Debug**: use `smartctl -H /dev/sda` and watch reallocated sector counts — early warning of disk failure. Automate with `smartd` so you get emailed before the disk dies completely.

## ⚠️ Edge Cases & Gotchas

- **`dd if=... of=/dev/sda` destroys the target**: `dd` copies raw bytes with no safety check. `if=` and `of=` are one character apart — a typo overwrites your boot disk. Always verify `of=` is the intended target. Use `status=progress` to see it's writing the right amount.
- **`fsck` on a mounted filesystem can corrupt it**: never `fsck` a mounted ext4/xfs. Unmount first, or boot from a live USB / rescue mode. For root, it runs at boot from `initramfs` (before mount). `xfs_repair` explicitly refuses to run on a mounted filesystem.
- **XFS can't shrink**: `xfs_growfs` expands (online), but there's no `xfs_shrink`. If you need a smaller XFS, you must back up, `mkfs` anew, and restore. ext4 can shrink (offline). Choose filesystem based on whether you might need to shrink.
- **LVM snapshot size matters**: if a snapshot fills up (more changes than its allocated size), it's **invalidated** — you can't use it for backup. Size it based on the rate of change during the backup window. Monitor with `lvs` (Snap% column).
- **RAID is not a backup**: RAID protects against disk failure, not deletion, corruption, or ransomware. A RAID 1 mirror replicates `rm -rf /` to both disks instantly. Always have off-site backups.
- **RAID 5 has a rebuild risk**: with large modern disks, the rebuild time is long, and a read error during rebuild can fail the array. RAID 6 (two parity disks) is safer for large arrays. Consider RAID 10 for performance + safety.
- **`/dev/sda` ordering can change**: USB devices, hotplug SATA, BIOS settings can reorder `/dev/sda`, `/dev/sdb` across reboots. Use UUIDs (in `fstab`), LVM (VG names), or `mdadm` (array UUID) — never rely on `/dev/sdX` names for persistent mounts.
- **`umount` fails if filesystem is busy**: open files, processes in the directory, or a shell's `cwd` prevent unmount. Find them with `lsof +D /mnt` or `fuser -vm /mnt`. `umount -l` (lazy) detaches now but cleans up later — use cautiously (writes may be delayed).
- **Resizing the root filesystem requires a different approach**: you can't unmount `/`. For root on LVM, `lvextend` + `resize2fs` works online (ext4). For root on a plain partition, you need to boot from a live USB to resize the partition, then `resize2fs` online.
- **`mkswap` and `swapon` on a file need correct permissions**: `/swapfile` must be `chmod 600` (root-only). If it's world-readable, `swapon` may refuse it. After `fallocate`, run `chmod 600` before `mkswap`.
- **`fallocate` doesn't work on all filesystems for swap**: on XFS and ext4 it works. On Btrfs, you must use `dd` (`fallocate` creates sparse files that `swapon` rejects on some kernels). Use `chattr +C /swapfile` on Btrfs to disable CoW.
- **NVMe names differ from SATA**: `nvme0n1` (namespace, the disk) vs `sda`. Partitions are `nvme0n1p1` (with `p`) vs `sda1` (no `p`). Scripts assuming `sdX1` break on NVMe.

## 🧠 Spot the Bug

A sysadmin adds a new disk, partitions it, creates an ext4 filesystem, and adds it to `/etc/fstab`:

::code-wrapper{language="bash"}
```bash
sudo mkfs.ext4 /dev/sdb1
echo "/dev/sdb1 /data ext4 defaults 0 2" | sudo tee -a /etc/fstab
sudo mount -a
```
::

Everything works — until the next reboot, when the system fails to boot (drops to emergency mode). What went wrong?

<details>
<summary>Answer</summary>

Two possible issues:

1. **`/dev/sdb1` may not be `/dev/sdb1` after reboot.** Device names can change — if a USB disk was plugged in at boot, or BIOS enumerated disks differently, the new disk might become `sdc` or `sda`. The `fstab` entry points to the wrong disk (or a nonexistent one), and boot fails.

2. **No `nofail` on a non-critical mount.** If the disk is absent at boot (e.g., external USB not connected), `mount -a` fails, and systemd drops to emergency mode.

**Fix — use UUID and `nofail`:**

::code-wrapper{language="bash"}
```bash
sudo blkid /dev/sdb1              # get the UUID
# /dev/sdb1: UUID="a1b2c3d4-..." TYPE="ext4"

# Edit fstab to use UUID + nofail:
# UUID=a1b2c3d4-...  /data  ext4  defaults,nofail  0  2
sudo nano /etc/fstab
sudo findmnt --verify             # validate syntax
sudo umount /data && sudo mount -a  # test
```
::

**Why UUID?** The filesystem UUID is unique and stored *in* the filesystem (not dependent on device name). It's stable across reboots, disk reordering, and hotplug events. Get it with `blkid` or `lsblk -f`.

**Why `nofail`?** For non-critical mounts (data disks, USB), `nofail` lets boot proceed if the device is absent. For critical mounts (root, `/var`), don't use `nofail` — you *want* boot to fail if they're missing (something is seriously wrong).

The general rule: **always use UUID= (or PARTUUID=) in `fstab`, never `/dev/sdXN`.** And test with `sudo mount -a` + `findmnt --verify` before rebooting.
</details>