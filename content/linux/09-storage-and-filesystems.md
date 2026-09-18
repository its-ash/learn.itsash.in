# 09 — Storage & Filesystems

Storage is where data lives persistently. This chapter covers disks, partitions, filesystems, mounting, LVM, RAID, `fsck`, and SMART — core sysadmin skills where mistakes cause the most damage (data loss).

## The Storage Stack

::code-wrapper{language="bash"}
```bash
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
::

## Block Devices

| Device | Interface | Name Pattern |
|---|---|---|
| SATA, SCSI, USB | SATA/SCSI | `/dev/sda`, `/dev/sdb`, `/dev/sda1` |
| NVMe | PCIe | `/dev/nvme0n1`, `/dev/nvme0n1p1` |
| MMC/SD | SD card | `/dev/mmcblk0`, `/dev/mmcblk0p1` |
| Loop | Image file | `/dev/loop0` |

::code-wrapper{language="bash"}
```bash
lsblk -f               # tree view: devices + partitions + FS type + UUID + mount
sudo fdisk -l          # list all disks + partition tables
sudo parted -l         # same, different format
cat /proc/partitions   # kernel's view of partitions
```
::

## Partitioning

| Table | Max Disks | Max Partitions | Notes |
|---|---|---|---|
| MBR (DOS) | 2 TB | 4 primary (or 3 + 1 extended with logicals) | Legacy |
| GPT | 8 ZB | 128 (typical) | Modern, required for UEFI boot |

::code-wrapper{language="bash"}
```bash
# Complex Implementation: scriptable GPT partitioning with sgdisk
sudo sgdisk -Z /dev/sdb                    # zap all partitions
sudo sgdisk -n 1:0:0 /dev/sdb             # partition 1, whole disk
sudo sgdisk -t 1:8e00 /dev/sdb            # type = Linux LVM
sudo partprobe /dev/sdb                    # tell kernel about new partitions
```
::

## Creating Filesystems (`mkfs`)

::code-wrapper{language="bash"}
```bash
# Complex Implementation: data disk with tuned inode count + no reserved space
sudo mkfs.ext4 -L data -m 0 -i 4096 /dev/sdb1
# -L data: filesystem label
# -m 0: no reserved blocks (default 5% reserved for root — wastes 200GB on a 4TB disk)
# -i 4096: one inode per 4 KB (for many small files; default 16384)

sudo mkfs.xfs /dev/sdb2                  # XFS (RHEL default)
sudo mkswap /dev/sdb7                    # swap
```
::

### XFS vs ext4

| Feature | ext4 | XFS |
|---|---|---|
| Default on | Debian/Ubuntu | RHEL/Rocky |
| Shrink | Yes (offline) | **No** |
| Grow | Yes (online) | Yes (online) |
| Large files | Good | Excellent |

**XFS can't shrink.** If you need a smaller XFS, you must back up, `mkfs` anew, and restore. Choose filesystem based on whether you might need to shrink.

## Mounting and `/etc/fstab`

::code-wrapper{language="bash"}
```bash
# Complex Implementation: production fstab with UUID, noatime, and nofail
# UUID=abcd-1234  /data    ext4   defaults,noatime,nofail  0  2

# Validate BEFORE rebooting (prevents emergency mode):
sudo findmnt --verify
sudo mount -a
```
::

### Edge Case: `nofail` for Non-Critical Mounts

::code-wrapper{language="bash"}
```bash
# Without nofail, if /dev/sdb1 is absent at boot, the system drops to emergency mode
# With nofail, boot continues and the mount is simply skipped
UUID=abcd-1234  /mnt/usb  ext4  defaults,noatime,nofail  0  2
```
::

## Swap

::code-wrapper{language="bash"}
```bash
# Complex Implementation: swap file (no partition needed)
sudo fallocate -l 4G /swapfile      # create a 4 GB file
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
# Add to /etc/fstab: /swapfile none swap defaults 0 0

# Tune swappiness (0=never swap, 100=swap aggressively, default 60)
sudo sysctl vm.swappiness=10         # servers: 10, databases: 1
echo "vm.swappiness = 10" | sudo tee /etc/sysctl.d/99-swappiness.conf
```
::

## LVM — Logical Volume Manager

LVM abstracts physical disks into flexible logical volumes. You can resize, snapshot, and span multiple disks — impossible with plain partitions.

::code-wrapper{language="bash"}
```bash
Physical Volume (PV)      ← a disk or partition (e.g., /dev/sdb1)
    ↓
Volume Group (VG)         ← pool of PVs (e.g., vg_data)
    ↓
Logical Volume (LV)       ← a slice of the VG, used like a partition
    ↓
Filesystem                ← ext4/xfs on the LV
```
::

::code-wrapper{language="bash"}
```bash
# Complex Implementation: full LVM setup + online resize + snapshot backup
# 1. Create PV on two partitions
sudo pvcreate /dev/sdb1 /dev/sdc1
# 2. Create VG spanning both
sudo vgcreate vg_data /dev/sdb1 /dev/sdc1
# 3. Create LV (10 GB)
sudo lvcreate -L 10G -n lv_data vg_data
# 4. Create filesystem + mount
sudo mkfs.ext4 /dev/vg_data/lv_data
sudo mount /dev/vg_data/lv_data /mnt/data

# ONLINE RESIZE (while mounted — the big advantage):
sudo lvextend -l +100%FREE /dev/vg_data/lv_data    # use all remaining VG space
sudo resize2fs /dev/vg_data/lv_data               # ext4 (online)
# sudo xfs_growfs /mnt/data                        # XFS (online)

# SNAPSHOT BACKUP (copy-on-write, point-in-time):
sudo lvcreate -L 5G -s -n lv_data_snap /dev/vg_data/lv_data
sudo mount -o ro /dev/vg_data/lv_data_snap /mnt/snap
tar -czf /tmp/backup.tar.gz -C /mnt/snap .
sudo umount /mnt/snap
sudo lvremove -f /dev/vg_data/lv_data_snap
```
::

### Edge Case: LVM Snapshot Size Matters

::code-wrapper{language="bash"}
```bash
# If a snapshot fills up (more changes than its allocated size), it's INVALIDATED
# — you can't use it for backup. Size it based on the rate of change during backup.
sudo lvs    # watch Snap% column — if it hits 100%, snapshot is dead
```
::

## RAID (mdadm)

| Level | Min Disks | Redundancy | Space Efficiency | Use |
|---|---|---|---|---|
| 0 | 2 | None (data loss if any disk fails) | 100% | Speed (not for data you need) |
| 1 | 2 | 1 disk | 50% | OS mirror |
| 5 | 3 | 1 disk | (n-1)/n | General purpose |
| 6 | 4 | 2 disks | (n-2)/n | Important data |
| 10 | 4 | 1 per mirror pair | 50% | Speed + redundancy |

::code-wrapper{language="bash"}
```bash
# Complex Implementation: RAID 1 + disk failure simulation + rebuild
sudo mdadm --create /dev/md0 --level=1 --raid-devices=2 /dev/sdb /dev/sdc
cat /proc/mdstat                    # watch it build (can take hours)

# Simulate a disk failure:
sudo mdadm --fail /dev/md0 /dev/sdb
sudo mdadm --remove /dev/md0 /dev/sdb
cat /proc/mdstat                    # shows "degraded"
# Replace the disk:
sudo mdadm --add /dev/md0 /dev/sde  # rebuild starts
cat /proc/mdstat                    # shows "recovering"

# Save config (so RAID assembles at boot):
sudo mdadm --detail --scan | sudo tee -a /etc/mdadm/mdadm.conf
sudo update-initramfs -u            # Debian (so RAID is available at boot)
```
::

### Edge Case: RAID Is Not a Backup

::code-wrapper{language="bash"}
```bash
# RAID protects against disk failure, NOT deletion, corruption, or ransomware.
# A RAID 1 mirror replicates `rm -rf /` to both disks instantly.
# Always have off-site backups.
```
::

## `fsck` — Filesystem Check

::code-wrapper{language="bash"}
```bash
# Complex Implementation: repair a corrupted filesystem
# — MUST be unmounted (running fsck on a mounted FS can corrupt it)
sudo umount /dev/sdb1
sudo fsck -y /dev/sdb1           # answer yes to all prompts
sudo mount /dev/sdb1 /mnt/data

# For root filesystem: runs at boot from initramfs (before mount)
# Force check at next boot: sudo touch /forcefsck
```
::

### Edge Case: `fsck` on a Mounted Filesystem Can Corrupt It

::code-wrapper{language="bash"}
```bash
# NAIVE: fsck on a mounted ext4/xfs
sudo fsck /dev/sdb1               # while /dev/sdb1 is mounted → CORRUPTION
# PRODUCTION: unmount first
sudo umount /dev/sdb1 && sudo fsck -y /dev/sdb1
# For root: boot from live USB / rescue mode
```
::

## SMART — Disk Health

::code-wrapper{language="bash"}
```bash
# Complex Implementation: automated disk failure detection
sudo smartctl -H /dev/sda             # health status (PASSED/FAILED)
sudo smartctl -a /dev/sda             # all SMART attributes
sudo smartctl -t long /dev/sda         # long self-test (hours)

# Watch these attributes (non-zero + growing = failing disk):
# Reallocated_Sector_Ct (5)
# Current_Pending_Sector (197)
# Offline_Uncorrectable (198)
```
::

## `dd` — Low-Level Copy

::code-wrapper{language="bash"}
```bash
# Complex Implementation: clone a disk (sector-by-sector)
sudo dd if=/dev/sda of=/dev/sdb bs=4M status=progress
# — target must be same size or larger
# — dd respects EXACTLY what you type; if= and of= are one char apart
# — DOUBLE-CHECK of= before pressing Enter

# Write an ISO to a USB:
sudo dd if=ubuntu.iso of=/dev/sdb bs=4M status=progress conv=fsync
# (use /dev/sdb, the whole disk, NOT /dev/sdb1)
```
::

### Edge Case: `dd if=... of=/dev/sda` Destroys the Target

::code-wrapper{language="bash"}
```bash
# Anti-Pattern: a typo overwrites your boot disk
# dd copies raw bytes with NO safety check
# of=/dev/sda instead of of=disk.img → overwrites your whole disk
# Always verify of= is the intended target. Use status=progress to see it's writing the right amount.
```
::

## 💡 Tips & Tricks

- **Idiom**: use `lsblk -f` as your first storage command — shows all block devices, partitions, filesystem types, UUIDs, and mount points in one tree.
- **Idiom**: use UUIDs in `fstab`, not `/dev/sda1` — device names can change across reboots. UUIDs are unique per filesystem and stable.
- **Idiom**: use `nofail` in `fstab` for non-critical mounts — if an external USB or secondary data disk is absent at boot, `nofail` lets the boot continue.
- **Idiom**: use `mkfs.ext4 -m 0` for data-only filesystems — the default 5% reserved for root makes sense for `/` (keeps root able to log in if disk is full), but on a 4 TB data disk it wastes 200 GB.
- **Idiom**: use LVM for any non-root filesystem that might grow — resizing plain partitions is painful. LVM lets you `lvextend` + `resize2fs` online (while mounted).
- **Debug**: use `cat /proc/mdstat` to watch RAID rebuild progress — shows array status, sync percentage, and which disks are involved.
- **Debug**: use `smartctl -H /dev/sda` and watch reallocated sector counts — early warning of disk failure.

## ⚠️ Edge Cases & Gotchas

- **`dd if=... of=/dev/sda` destroys the target**: `dd` copies raw bytes with no safety check. `if=` and `of=` are one character apart — a typo overwrites your boot disk.
- **`fsck` on a mounted filesystem can corrupt it**: never `fsck` a mounted ext4/xfs. Unmount first, or boot from a live USB. `xfs_repair` explicitly refuses to run on a mounted filesystem.
- **XFS can't shrink**: `xfs_growfs` expands (online), but there's no `xfs_shrink`. If you need a smaller XFS, you must back up, `mkfs` anew, and restore.
- **LVM snapshot size matters**: if a snapshot fills up (more changes than its allocated size), it's **invalidated** — you can't use it for backup.
- **RAID is not a backup**: RAID protects against disk failure, not deletion, corruption, or ransomware. Always have off-site backups.
- **RAID 5 has a rebuild risk**: with large modern disks, the rebuild time is long, and a read error during rebuild can fail the array. RAID 6 (two parity disks) is safer for large arrays.
- **`/dev/sda` ordering can change**: USB devices, hotplug SATA, BIOS settings can reorder `/dev/sda`, `/dev/sdb`. Use UUIDs (in `fstab`), LVM (VG names), or `mdadm` (array UUID).
- **`umount` fails if filesystem is busy**: open files, processes in the directory, or a shell's `cwd` prevent unmount. Find them with `lsof +D /mnt` or `fuser -vm /mnt`. `umount -l` (lazy) detaches now but cleans up later — use cautiously.

## 🧠 Quick Quiz

A server's `/var/log` is on a separate ext4 partition. After a power outage, the system boots to emergency mode with "UNEXPECTED INCONSISTENCY; RUN fsck MANUALLY." How do you fix this?

<details>
<summary>Answer</summary>

The ext4 filesystem on `/var/log` wasn't cleanly unmounted (power loss) and the journal can't auto-repair it. `fsck` must run manually.

**Steps:**

1. In emergency mode, remount root read-write:
::code-wrapper{language="bash"}
```bash
mount -o remount,rw /
```
::

2. Identify the problematic filesystem:
::code-wrapper{language="bash"}
```bash
journalctl -b | grep -i "fsck\|ext4\|inconsistency"
cat /etc/fstab | grep /var/log
```
::

3. If `/var/log` is a separate partition, `fsck` it (it should be unmounted in emergency mode):
::code-wrapper{language="bash"}
```bash
fsck -y /dev/sdXX        # replace with the actual device from fstab
```
::

4. Continue boot:
::code-wrapper{language="bash"}
```bash
systemctl default
```
::

5. **Prevent future occurrences**: ensure `pass` in `fstab` is non-zero for `/var/log` (so `fsck` runs automatically at boot). Use a journaling filesystem (ext4 with `data=ordered` or `data=journal`).

::code-wrapper{language="bash"}
```bash
# /etc/fstab — pass field controls boot-time fsck order
# UUID=...  /var/log  ext4  defaults  0  2   ← "2" means fsck at boot
```
::
</details>