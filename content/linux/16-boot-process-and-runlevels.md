# 16 — Boot Process & Runlevels

Understanding the Linux boot process is essential for troubleshooting boot failures, configuring services, and recovering a broken system. This chapter covers the full path from power-on to login prompt: firmware (BIOS/UEFI), bootloader (GRUB), kernel, initramfs, systemd, and targets (the modern runlevels).

## The Boot Sequence

```text
1. Power on
   ↓
2. Firmware (BIOS or UEFI) — POST, hardware init, find boot device
   ↓
3. Bootloader (GRUB) — load kernel + initramfs into RAM
   ↓
4. Kernel — initialize, load drivers (from initramfs), mount root filesystem
   ↓
5. initramfs — early userspace, mount real root, pivot_root
   ↓
6. systemd (PID 1) — start services, targets, login prompt
   ↓
7. Login
```

## 1. Firmware — BIOS or UEFI

When you press power, the firmware runs:

### BIOS (Legacy)

- **POST** (Power-On Self-Test) — check hardware.
- Read the **MBR** (Master Boot Record, first 512 bytes of the boot disk) — contains stage 1 bootloader.
- Stage 1 loads stage 1.5 (in the gap after MBR) → stage 2 (GRUB proper).
- BIOS is being replaced by UEFI but still common on older systems.

### UEFI (Modern)

- **POST** — check hardware.
- Read EFI variables to find the boot entry.
- Load the **EFI application** (e.g., `\EFI\ubuntu\grubx64.efi`) from the **ESP** (EFI System Partition, a FAT32 partition, usually `/boot/efi`).
- UEFI is more flexible (no MBR limits, supports GPT, Secure Boot, faster).

### Key Differences

| Feature | BIOS | UEFI |
|---|---|---|
| Partition table | MBR (2 TB max) | GPT (8 ZB) |
| Boot code | MBR (512 bytes) | EFI files on ESP |
| Secure Boot | No | Yes (verify bootloader signature) |
| Boot speed | Slower | Faster |
| Boot selection | BIOS settings | EFI variables (OS can modify) |

### Check Your System

::code-wrapper{language="bash"}
```bash
[ -d /sys/firmware/efi ] && echo "UEFI" || echo "BIOS/Legacy"
ls /sys/firmware/efi/efivars/    # EFI variables (UEFI only)
efibootmgr                       # UEFI boot entries (UEFI only)
```

## 2. Bootloader — GRUB

**GRUB** (GRand Unified Bootloader) is the most common Linux bootloader. It:
1. Displays a menu (if multiple kernels/OSes).
2. Loads the selected kernel (`vmlinuz-*`) and initramfs (`initrd.img-*`) into memory.
3. Passes boot parameters to the kernel.

### GRUB Config

| File | Purpose |
|---|---|
| `/boot/grub/grub.cfg` | The **generated** config (don't edit directly!) |
| `/etc/default/grub` | The **source** config (edit this) |
| `/etc/grub.d/` | Scripts that generate `grub.cfg` |

::code-wrapper{language="bash"}
```bash
cat /etc/default/grub
# GRUB_DEFAULT=0                    # default menu entry
# GRUB_TIMEOUT=5                    # menu timeout (seconds)
# GRUB_DISTRIBUTOR="Ubuntu"
# GRUB_CMDLINE_LINUX_DEFAULT="quiet splash"  # kernel params for all entries
# GRUB_CMDLINE_LINUX=""             # params for all entries (including recovery)
# GRUB_DISABLE_RECOVERY="false"     # show recovery entries
```

After editing `/etc/default/grub`:

::code-wrapper{language="bash"}
```bash
sudo update-grub              # Debian/Ubuntu (generates grub.cfg)
sudo grub2-mkconfig -o /boot/grub2/grub.cfg   # RHEL/Fedora
sudo grub-mkconfig -o /boot/grub/grub.cfg     # Arch
```

### Common GRUB Parameters (`GRUB_CMDLINE_LINUX_DEFAULT`)

| Parameter | Effect |
|---|---|
| `quiet` | Suppress kernel messages at boot |
| `splash` | Show splash screen |
| `nomodeset` | Don't load graphics drivers (for display issues) |
| `acpi=off` | Disable ACPI (hardware workaround) |
| `systemd.unit=rescue.target` | Boot to rescue mode (single-user) |
| `systemd.unit=emergency.target` | Boot to emergency mode |
| `init=/bin/bash` | Bypass init (raw root shell — recovery only) |
| `rw` | Mount root read-write (default is `ro` initially) |
| `root=UUID=...` | Root filesystem (usually auto-generated) |

### GRUB Rescue

If GRUB is broken (no menu, just a `grub>` prompt), you can boot manually:

```text
grub> ls                                    # list drives
grub> ls (hd0,gpt2)/                        # explore a partition
grub> set root=(hd0,gpt2)
grub> linux /boot/vmlinuz-6.8.0-31-generic root=/dev/sda2
grub> initrd /boot/initrd.img-6.8.0-31-generic
grub> boot
```

After booting, reinstall GRUB:

::code-wrapper{language="bash"}
```bash
sudo grub-install /dev/sda          # BIOS
sudo grub-install --target=x86_64-efi --efi-directory=/boot/efi  # UEFI
sudo update-grub
```

### GRUB Password (Security)

Protect the boot menu (prevent `e` to edit parameters — which allows root access without password):

::code-wrapper{language="bash"}
```bash
sudo grub-mkpasswd-pbkdf2            # generate a hashed password
# Add to /etc/grub.d/40_custom:
# set superusers="admin"
# password_pbkdf2 admin grub.pbkdf2.sha512.10000.HASH...
sudo update-grub
```

## 3. Kernel

Once GRUB loads the kernel (`vmlinuz-*`), it:
1. Decompresses itself.
2. Initializes the CPU, memory, and essential hardware.
3. Mounts the initramfs as a temporary root.
4. Runs `/init` from the initramfs.

The kernel logs appear on the console (unless `quiet`). View them after boot:

::code-wrapper{language="bash"}
```bash
dmesg                          # kernel ring buffer
journalctl -k                  # kernel logs (from journald)
journalctl -b -k               # current boot, kernel only
```

## 4. initramfs — Early Userspace

The **initramfs** (initial RAM filesystem) is a small archive loaded into RAM by GRUB. It contains:
- A minimal init (`/init` — usually a shell script or `systemd`).
- Kernel modules needed to access the root filesystem (storage drivers, filesystem drivers, LVM, encryption).
- `udev` rules for device detection.

The initramfs's job:
1. Load modules needed to see the root disk.
2. Find the root filesystem (by UUID, from the `root=` kernel parameter).
3. Mount the root filesystem.
4. `pivot_root` or `switch_root` — swap the root from initramfs to the real root.
5. `exec` the real init (systemd, PID 1).

### Regenerating initramfs

After kernel or storage changes (see chapter 13):

::code-wrapper{language="bash"}
```bash
sudo update-initramfs -u        # Debian/Ubuntu
sudo dracut -f                  # RHEL/Fedora
sudo mkinitcpio -P              # Arch
```

### Inspecting initramfs

::code-wrapper{language="bash"}
```bash
lsinitrd /boot/initrd.img-$(uname -r)          # list contents (RHEL)
lsinitramfs /boot/initrd.img-$(uname -r) | head # list contents (Debian)
# Extract to explore:
mkdir /tmp/initramfs && cd /tmp/initramfs
zcat /boot/initrd.img-$(uname -r) | cpio -idmv
```

## 5. systemd (PID 1)

Once the root filesystem is mounted, systemd starts as PID 1. It:
1. Reads its configuration (`/etc/systemd/system.conf`, default target).
2. Mounts filesystems from `/etc/fstab`.
3. Starts the **default target** (usually `graphical.target` or `multi-user.target`).
4. The target pulls in services via `Wants=`/`Requires=` dependencies.
5. Services start (in parallel, based on ordering).
6. When the target is reached, the system is "up" — login prompts appear.

### The Boot Process (systemd View)

::code-wrapper{language="bash"}
```bash
systemd-analyze                   # total boot time
systemd-analyze blame             # services by startup time
systemd-analyze critical-chain    # the slow path
systemd-analyze plot > boot.svg   # visual timeline (open in a browser)
```

Example:

```text
$ systemd-analyze
Startup finished in 5.123s (kernel) + 8.456s (userspace) = 13.579s

$ systemd-analyze blame | head -5
8.200s dev-sda1.device
5.100s NetworkManager-wait-online.service
2.300s snapd.service
1.800s docker.service
1.200s ssh.service
```

## Targets — The Modern Runlevels

systemd replaced SysV **runlevels** with **targets**. A target is a group of units (services, mounts, other targets) that should be active together.

| Target | Old Runlevel | Purpose |
|---|---|---|
| `poweroff.target` | 0 | Shut down |
| `rescue.target` | 1 | Single-user rescue (root only, minimal services) |
| `multi-user.target` | 2, 3 | Text mode (server default) |
| `graphical.target` | 5 | GUI (desktop default) |
| `reboot.target` | 6 | Reboot |
| `emergency.target` | — | Emergency mode (even more minimal than rescue) |

### Viewing and Changing the Default

::code-wrapper{language="bash"}
```bash
systemctl get-default                 # show default (e.g., graphical.target)
sudo systemctl set-default multi-user.target   # set text mode as default
sudo systemctl set-default graphical.target    # set GUI as default
```

### Switching Targets Live

::code-wrapper{language="bash"}
```bash
sudo systemctl isolate multi-user.target   # switch to text mode now (stops GUI)
sudo systemctl isolate graphical.target    # switch to GUI now
sudo systemctl rescue                      # switch to rescue mode (interrupts everything)
sudo systemctl emergency                   # switch to emergency mode
```

### Target Dependencies

::code-wrapper{language="bash"}
```bash
systemctl list-dependencies multi-user.target
# multi-user.target
# ● ├─apport.service
# ● ├─cron.service
# ● ├─docker.service
# ● ├─ssh.service
# ● ├─systemd-update-utmp.service
# ● ├─basic.target
# ● │ ├─paths.target
# ● │ ├─slices.target
# ...
```

A target's `Wants=` (in its `.wants` directory) determines what it starts. Services with `WantedBy=multi-user.target` (in their `[Install]` section) are pulled in when you enable them.

## Rescue Mode vs Emergency Mode

| Mode | Target | What's Running |
|---|---|---|
| **Rescue** | `rescue.target` | Single-user, root shell, minimal services, filesystems mounted |
| **Emergency** | `emergency.target` | Single-user, root shell, almost nothing — root mounted read-only |

Use **rescue** for normal recovery (reset password, fix a service). Use **emergency** when rescue fails (root filesystem issues, can't even get to rescue).

### Booting to Rescue Mode

At the GRUB menu:
1. Press `e` to edit the default entry.
2. Find the line starting with `linux`.
3. Append `systemd.unit=rescue.target` (or just `1` or `single`).
4. Press `Ctrl+X` to boot.

You'll get a root shell (or prompted for the root password).

### Booting to Emergency Mode

Same as rescue but use `systemd.unit=emergency.target`. Even fewer services. Root is mounted read-only — remount:

::code-wrapper{language="bash"}
```bash
mount -o remount,rw /
```

### `init=/bin/bash` (Last Resort)

Append `init=/bin/bash` to the kernel line. This bypasses systemd entirely — you get a raw bash shell as PID 1, no services, no mounts (except root, read-only). Useful when systemd is broken.

::code-wrapper{language="bash"}
```bash
mount -o remount,rw /       # make root writable
# fix the problem...
mount -o remount,ro /       # clean unmount
exec /sbin/init             # try to start init (or just reboot)
```

To reboot from `init=/bin/bash`:

::code-wrapper{language="bash"}
```bash
exec /sbin/init             # start systemd normally
# or:
mount -o remount,ro / && reboot -f   # force reboot
```

## Resetting a Lost Root Password

If you have console/physical access:

1. Reboot, at GRUB menu press `e`.
2. Find the `linux` line, append `rw init=/bin/bash` (or `rw single`).
3. `Ctrl+X` to boot.
4. You're root, no password needed:

::code-wrapper{language="bash"}
```bash
passwd                         # set a new root password
# or: passwd alice
exec /sbin/init                # continue boot (or reboot)
```

On modern systems with SELinux, you may need:

::code-wrapper{language="bash"}
```bash
mount -o remount,rw /
passwd
touch /.autorelabel            # SELinux will relabel on next boot
exec /sbin/init
```

This is why **physical/console access = root access** — secure your physical servers and use disk encryption (LUKS) if an attacker could access the console.

## Shutdown and Reboot

::code-wrapper{language="bash"}
```bash
sudo shutdown now              # shut down immediately
sudo shutdown -h now           # halt
sudo shutdown -r now           # reboot
sudo shutdown +5               # shut down in 5 minutes
sudo shutdown 22:00            # shut down at 22:00
sudo shutdown -c               # cancel a scheduled shutdown
sudo shutdown -r +5 "Rebooting for updates"  # with warning message

sudo poweroff                  # shut down (alias for systemctl poweroff)
sudo reboot                    # reboot (alias for systemctl reboot)
sudo halt                      # halt (stop CPU, power stays on)

# systemd versions:
sudo systemctl poweroff
sudo systemctl reboot
sudo systemctl suspend         # suspend to RAM
sudo systemctl hibernate       # suspend to disk
sudo systemctl hybrid-sleep    # both
```

`shutdown` sends a wall message to all logged-in users (warnings at intervals before shutdown).

## Boot Problems — Diagnosis

### Boot Fails Before GRUB

- **Firmware issue** — check BIOS/UEFI settings, boot order.
- **Disk not found** — hardware failure, loose cable, wrong boot device.
- **Corrupted MBR/ESP** — reinstall GRUB from a live USB.

### GRUB Loads but Kernel Panics

- **"Unable to mount root fs"** — initramfs missing or lacks the storage driver. Boot an older kernel, rebuild initramfs (`update-initramfs -u`).
- **Kernel panic with trace** — hardware issue, corrupted kernel, bad init. Try an older kernel, check RAM (`memtest86`).
- **"No init found"** — `init=` parameter wrong, or `/sbin/init` missing. Boot with `init=/bin/bash` to investigate.

### Systemd Fails to Start a Target

::code-wrapper{language="bash"}
```bash
# Boot to rescue or emergency mode, then:
systemctl status                    # overall status
systemctl list-units --state=failed # failed units
journalctl -b -p err                # boot errors
systemctl default                   # try to continue to default target
```

### Stuck at "A start job is running..."

A service is timing out (common: `NetworkManager-wait-online.service`). Fix:

::code-wrapper{language="bash"}
```bash
# Disable the slow service (if you don't need it):
sudo systemctl disable NetworkManager-wait-online.service
# Or mask it:
sudo systemctl mask NetworkManager-wait-online.service
# Or reduce its timeout:
sudo systemctl edit NetworkManager-wait-online.service
# [Service]
# TimeoutStartSec=10
```

## `fstab` Issues at Boot

A bad `/etc/fstab` entry can drop you to emergency mode (a non-`nofail` mount fails):

::code-wrapper{language="bash"}
```bash
# In emergency mode:
journalctl -b | grep -i "mount"      # find the failing mount
mount -o remount,rw /
nano /etc/fstab                      # fix or comment the bad line
mount -a                             # test
systemctl default                    # continue boot
```

Prevent with `nofail` for non-critical mounts (USB, secondary data).

## 💡 Tips & Tricks

- **Idiom**: use `systemd-analyze blame` to find slow boot services — lists services by startup time. Disable or mask unneeded ones (`systemctl mask NetworkManager-wait-online.service` — a common culprit that waits for network even when not needed).
- **Idiom**: use `nofail` in `fstab` for non-critical mounts — if a secondary disk or USB is absent at boot, `nofail` lets boot continue instead of dropping to emergency mode. Use for everything except root and critical mounts.
- **Idiom**: use `sudo systemctl isolate multi-user.target` to switch to text mode without rebooting — stops the GUI (and display manager). Useful for servers or debugging. Reverse: `isolate graphical.target`.
- **Idiom**: edit `/etc/default/grub` then `sudo update-grub` (Debian) or `grub2-mkconfig -o /boot/grub2/grub.cfg` (RHEL) — never edit `grub.cfg` directly (it's generated and overwritten). Common edits: `GRUB_TIMEOUT`, `GRUB_CMDLINE_LINUX_DEFAULT`.
- **Idiom**: use `journalctl -b -k -p err` for boot kernel errors — `-b` (current boot), `-k` (kernel), `-p err` (errors). The fastest "why did boot fail/warn?" query. Use `-b -1` for the previous boot.
- **Debug**: use `systemd-analyze critical-chain` to see the boot dependency path — shows which services determined the boot time (the critical path). Focus optimization there. `systemd-analyze plot > boot.svg` gives a visual timeline.
- **Debug**: boot to `rescue.target` for recovery — at GRUB, press `e`, append `systemd.unit=rescue.target` to the `linux` line. Gives a root shell with filesystems mounted. For worse cases, `emergency.target` (minimal) or `init=/bin/bash` (no systemd at all).
- **Debug**: use `rw init=/bin/bash` to reset a lost root password — bypasses all auth. Remount root read-write (`mount -o remount,rw /`), `passwd`, then `exec /sbin/init`. On SELinux systems, `touch /.autorelabel` before rebooting. This is why physical access = root access.

## ⚠️ Edge Cases & Gotchas

- **Editing `grub.cfg` directly is futile**: `update-grub` / `grub-mkconfig` overwrites it. Edit `/etc/default/grub` (and `/etc/grub.d/`), then regenerate. Changes to `grub.cfg` vanish on the next kernel update.
- **`update-grub` not finding a new kernel**: if you installed a kernel manually (not via package manager), `update-grub` may not detect it. Ensure `/boot/vmlinuz-*` and `/boot/initrd.img-*` exist, and the `linux` and `initrd` lines in `grub.cfg` point to them. Run `update-grub` after installing.
- **`init=/bin/bash` gives no services, no mounts**: you get a raw shell with root on `/` (read-only), no networking, no other filesystems. Remount read-write, fix the issue, then `exec /sbin/init` or `reboot -f`. Don't expect a normal environment.
- **Rescue mode needs the root password**: on some systems, `rescue.target` prompts for the root password (not your user password). If root has no password (`passwd -l root`), you can't enter rescue mode — use `init=/bin/bash` instead (bypasses the prompt).
- **SELinux blocks password reset in rescue mode**: after `init=/bin/bash` + `passwd`, SELinux may not recognize the new context. `touch /.autorelabel` and reboot — SELinux relabels all files on the next boot (can take a long time on large filesystems).
- **`NetworkManager-wait-online.service` delays boot**: it waits for the network to be "online" (which can take 30-90s). On servers with static IPs, disable it: `sudo systemctl disable NetworkManager-wait-online.service`. On laptops, it may be useful.
- **`fstab` errors drop to emergency mode**: a mount that fails (bad UUID, missing disk, typo) drops you to emergency mode if it doesn't have `nofail`. Always test with `sudo mount -a` + `findmnt --verify` after editing `fstab`. Use `nofail` for non-critical mounts.
- **UEFI vs BIOS GRUB commands differ**: `grub-install /dev/sda` (BIOS) vs `grub-install --target=x86_64-efi --efi-directory=/boot/efi` (UEFI). Using the wrong one fails. Check with `[ -d /sys/firmware/efi ] && echo UEFI || echo BIOS`.
- **Secure Boot can block custom kernels/modules**: signed bootloaders/kernels only. If you install a custom kernel or third-party module (e.g., NVIDIA), it may not load with Secure Boot on. Disable Secure Boot in firmware, or sign your kernel/modules (complex). Distros handle this for their kernels.
- **`shutdown -r now` vs `reboot`**: both reboot. `shutdown` sends a wall message (warns users); `reboot` is immediate. Use `shutdown` on multi-user systems to give warning. `systemctl reboot` is the systemd-native way.
- **`halt` vs `poweroff`**: `halt` stops the CPU but may not cut power (old hardware). `poweroff` sends an ACPI power-off signal. On modern systems, both power off. Use `poweroff` to be sure.
- **Boot order in UEFI can override GRUB**: UEFI's boot entries (managed by `efibootmgr`) determine which EFI app runs. If a firmware update resets boot order, your Linux entry may not be first. Check with `efibootmgr` and fix with `efibootmgr -o`.

## 🧠 Quick Quiz

A server fails to boot after a kernel upgrade. The error is: `kernel panic - not syncing: VFS: Unable to mount root fs on unknown-block(0,0)`. You have physical access. What are the steps to recover?

<details>
<summary>Answer</summary>

**The initramfs is missing or doesn't have the storage driver for the new kernel.** The kernel booted but can't mount the root filesystem because the needed modules (disk controller, filesystem, LVM) aren't in the initramfs.

**Recovery steps:**

1. **Reboot and select the old kernel** — at the GRUB menu, choose "Advanced options" → select the previous (working) kernel (e.g., 6.8.0-31 instead of 6.8.0-35). This should boot normally.

2. **Regenerate the initramfs for the new kernel:**

::code-wrapper{language="bash"}
```bash
sudo update-initramfs -u -k 6.8.0-35-generic
# Or for all kernels:
sudo update-initramfs -u -k all
# RHEL: sudo dracut -f /boot/initramfs-6.8.0-35.img 6.8.0-35
```

3. **Verify the initramfs exists and is reasonable:**

::code-wrapper{language="bash"}
```bash
ls -lh /boot/initrd.img-6.8.0-35-generic   # should be > 10 MB
lsinitramfs /boot/initrd.img-6.8.0-35-generic | grep ext4   # has ext4 module?
```

4. **Reboot** — select the new kernel. It should boot now.

**If the old kernel also fails (or there is none):**

1. Boot from a **live USB/CD**.
2. Mount the root filesystem and chroot:

::code-wrapper{language="bash"}
```bash
sudo mount /dev/sda2 /mnt          # root partition
sudo mount /dev/sda1 /mnt/boot     # /boot (if separate)
sudo mount --bind /dev /mnt/dev
sudo mount --bind /proc /mnt/proc
sudo mount --bind /sys /mnt/sys
sudo chroot /mnt
update-initramfs -u -k all
exit
sudo reboot
```

**Prevention:**
- Keep at least one known-good kernel installed (don't `apt autoremove` the previous one immediately after an upgrade).
- Check `df -h /boot` before upgrading (`/boot` needs ~50 MB free).
- After a kernel update, verify `ls /boot/initrd.img-$(uname -r)` exists.
- If using LVM/encryption/RAID, ensure those modules are in the initramfs config (`/etc/initramfs-tools/modules` on Debian).

The general lesson: **any change to storage (kernel, disk controller, LVM, encryption) requires regenerating the initramfs.** The initramfs is the bridge between "kernel loaded" and "root filesystem mounted" — if it lacks a needed module, boot fails.
</details>