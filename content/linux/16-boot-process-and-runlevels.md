# 16 — Boot Process & Runlevels

Understanding the Linux boot process is essential for troubleshooting boot failures, configuring services, and recovering a broken system. This chapter covers the full path from power-on to login prompt: firmware (BIOS/UEFI), bootloader (GRUB), kernel, initramfs, systemd, and targets.

## The Boot Sequence

::code-wrapper{language="bash"}
```bash
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
::

## Firmware — BIOS or UEFI

| Feature | BIOS | UEFI |
|---|---|---|
| Partition table | MBR (2 TB max) | GPT (8 ZB) |
| Boot code | MBR (512 bytes) | EFI files on ESP |
| Secure Boot | No | Yes (verify bootloader signature) |
| Boot speed | Slower | Faster |

::code-wrapper{language="bash"}
```bash
# Complex Implementation: detect firmware type
[ -d /sys/firmware/efi ] && echo "UEFI" || echo "BIOS/Legacy"
efibootmgr                       # UEFI boot entries (UEFI only)
```
::

## Bootloader — GRUB

GRUB loads the selected kernel (`vmlinuz-*`) and initramfs (`initrd.img-*`) into memory and passes boot parameters.

::code-wrapper{language="bash"}
```bash
# Complex Implementation: add a kernel parameter (e.g., for recovery)
# Edit /etc/default/grub:
# GRUB_CMDLINE_LINUX_DEFAULT="quiet splash systemd.unit=rescue.target"
sudo update-grub              # Debian/Ubuntu (generates grub.cfg)
sudo grub2-mkconfig -o /boot/grub2/grub.cfg   # RHEL/Fedora

# Anti-Pattern: editing /boot/grub/grub.cfg directly
# It's GENERATED — update-grub overwrites it
# Edit /etc/default/grub (and /etc/grub.d/), then regenerate
```
::

### Common GRUB Parameters

| Parameter | Effect |
|---|---|
| `quiet` | Suppress kernel messages at boot |
| `nomodeset` | Don't load graphics drivers (for display issues) |
| `systemd.unit=rescue.target` | Boot to rescue mode (single-user) |
| `init=/bin/bash` | Bypass init (raw root shell — recovery only) |
| `rw` | Mount root read-write (default is `ro` initially) |

## initramfs — Early Userspace

The **initramfs** is loaded into RAM by GRUB. It contains enough userspace to:
1. Load modules needed to see the root disk.
2. Mount the root filesystem.
3. `pivot_root` into it and `exec` the real init (systemd).

::code-wrapper{language="bash"}
```bash
# Regenerate after kernel or storage changes:
sudo update-initramfs -u        # Debian/Ubuntu (current kernel)
sudo dracut -f                  # RHEL/Fedora

# Inspect:
lsinitramfs /boot/initrd.img-$(uname -r) | grep ext4   # has ext4 module?
```
::

## systemd Boot

::code-wrapper{language="bash"}
```bash
# Complex Implementation: analyze boot performance
systemd-analyze                   # total boot time
systemd-analyze blame              # services by startup time
systemd-analyze critical-chain    # the slow path
systemd-analyze plot > boot.svg    # visual timeline (open in browser)
```
::

Example:

::code-wrapper{language="bash"}
```bash
$ systemd-analyze
Startup finished in 5.123s (kernel) + 8.456s (userspace) = 13.579s

$ systemd-analyze blame | head -5
8.200s dev-sda1.device
5.100s NetworkManager-wait-online.service    ← common culprit
2.300s snapd.service
```
::

## Targets — The Modern Runlevels

| Target | Old Runlevel | Purpose |
|---|---|---|
| `poweroff.target` | 0 | Shut down |
| `rescue.target` | 1 | Single-user rescue (root only, minimal services) |
| `multi-user.target` | 2, 3 | Text mode (server default) |
| `graphical.target` | 5 | GUI (desktop default) |
| `reboot.target` | 6 | Reboot |
| `emergency.target` | — | Emergency mode (even more minimal than rescue) |

::code-wrapper{language="bash"}
```bash
systemctl get-default                 # show default (e.g., graphical.target)
sudo systemctl set-default multi-user.target   # set text mode as default
sudo systemctl isolate multi-user.target       # switch now (without reboot)
```
::

## Rescue Mode vs Emergency Mode

| Mode | Target | What's Running |
|---|---|---|
| **Rescue** | `rescue.target` | Single-user, root shell, minimal services, filesystems mounted |
| **Emergency** | `emergency.target` | Single-user, root shell, almost nothing — root mounted read-only |

### Booting to Rescue Mode

At the GRUB menu:
1. Press `e` to edit the default entry.
2. Find the line starting with `linux`.
3. Append `systemd.unit=rescue.target` (or just `1` or `single`).
4. Press `Ctrl+X` to boot.

### `init=/bin/bash` (Last Resort)

Append `init=/bin/bash` to the kernel line. Bypasses systemd entirely — raw bash shell as PID 1, no services, no mounts (except root, read-only):

::code-wrapper{language="bash"}
```bash
mount -o remount,rw /       # make root writable
# fix the problem...
mount -o remount,ro /       # clean unmount
exec /sbin/init             # start systemd normally
```
::

## Resetting a Lost Root Password

::code-wrapper{language="bash"}
```bash
# Complex Implementation: reset root password via GRUB
# 1. Reboot, at GRUB menu press 'e'
# 2. Find the 'linux' line, append: rw init=/bin/bash
# 3. Ctrl+X to boot
# 4. You're root, no password needed:
passwd                         # set a new root password
# On SELinux systems:
touch /.autorelabel            # SELinux will relabel on next boot
exec /sbin/init                # continue boot
```
::

This is why **physical/console access = root access** — secure your physical servers and use disk encryption (LUKS).

## `fstab` Issues at Boot

A bad `/etc/fstab` entry can drop you to emergency mode:

::code-wrapper{language="bash"}
```bash
# In emergency mode:
journalctl -b | grep -i "mount\|fstab"
mount -o remount,rw /
nano /etc/fstab                # fix or comment the bad line
mount -a                       # test
systemctl default              # continue boot
```
::

### Edge Case: `nofail` Prevents Boot Failure

::code-wrapper{language="bash"}
```bash
# NAIVE: mount without nofail → boot fails if device is absent
UUID=abcd-1234  /mnt/usb  ext4  defaults  0  2
# If /mnt/usb is absent → emergency mode

# PRODUCTION: nofail lets boot continue
UUID=abcd-1234  /mnt/usb  ext4  defaults,nofail  0  2
```
::

## Shutdown and Reboot

::code-wrapper{language="bash"}
```bash
sudo shutdown -r now           # reboot immediately
sudo shutdown +5 "Rebooting"   # reboot in 5 min with warning to users
sudo shutdown -c               # cancel scheduled shutdown
sudo systemctl poweroff        # systemd-native
sudo systemctl reboot
sudo systemctl suspend         # suspend to RAM
sudo systemctl hibernate       # suspend to disk
```
::

## 💡 Tips & Tricks

- **Idiom**: use `systemd-analyze blame` to find slow boot services — disable or mask unneeded ones (`systemctl mask NetworkManager-wait-online.service` — a common culprit).
- **Idiom**: use `nofail` in `fstab` for non-critical mounts — if a secondary disk or USB is absent at boot, boot continues instead of dropping to emergency mode.
- **Idiom**: edit `/etc/default/grub` then `sudo update-grub` — never edit `grub.cfg` directly (it's generated and overwritten).
- **Idiom**: use `journalctl -b -k -p err` for boot kernel errors — `-b` (current boot), `-k` (kernel), `-p err` (errors). Use `-b -1` for the previous boot.
- **Debug**: boot to `rescue.target` for recovery — at GRUB, press `e`, append `systemd.unit=rescue.target` to the `linux` line.
- **Debug**: use `rw init=/bin/bash` to reset a lost root password — bypasses all auth. On SELinux: `touch /.autorelabel` before rebooting.

## ⚠️ Edge Cases & Gotchas

- **Editing `grub.cfg` directly is futile**: `update-grub` / `grub-mkconfig` overwrites it. Edit `/etc/default/grub`, then regenerate. Changes to `grub.cfg` vanish on the next kernel update.
- **`init=/bin/bash` gives no services, no mounts**: you get a raw shell with root on `/` (read-only), no networking, no other filesystems. Don't expect a normal environment.
- **Rescue mode needs the root password**: on some systems, `rescue.target` prompts for the root password. If root has no password (`passwd -l root`), use `init=/bin/bash` instead.
- **SELinux blocks password reset in rescue mode**: after `init=/bin/bash` + `passwd`, SELinux may not recognize the new context. `touch /.autorelabel` and reboot — SELinux relabels all files on next boot (can take a long time).
- **`NetworkManager-wait-online.service` delays boot**: it waits for network "online" (30-90s). On servers with static IPs, disable it: `sudo systemctl mask NetworkManager-wait-online.service`.
- **`fstab` errors drop to emergency mode**: a mount that fails (bad UUID, missing disk) drops you to emergency mode. Always test with `sudo mount -a` after editing. Use `nofail` for non-critical mounts.
- **UEFI vs BIOS GRUB commands differ**: `grub-install /dev/sda` (BIOS) vs `grub-install --target=x86_64-efi --efi-directory=/boot/efi` (UEFI). Check with `[ -d /sys/firmware/efi ]`.
- **Secure Boot can block custom kernels/modules**: signed bootloaders/kernels only. If you install a custom kernel or third-party module (e.g., NVIDIA), it may not load with Secure Boot on.

## 🧠 Quick Quiz

A server fails to boot after a kernel upgrade. The error is: `kernel panic - not syncing: VFS: Unable to mount root fs on unknown-block(0,0)`. You have physical access. What are the steps to recover?

<details>
<summary>Answer</summary>

**The initramfs is missing or doesn't have the storage driver for the new kernel.** The kernel booted but can't mount the root filesystem because the needed modules (disk controller, filesystem, LVM) aren't in the initramfs.

**Recovery steps:**

1. **Reboot and select the old kernel** — GRUB menu → "Advanced options" → select the previous (working) kernel.

2. **Regenerate the initramfs for the new kernel:**

::code-wrapper{language="bash"}
```bash
sudo update-initramfs -u -k 6.8.0-35-generic
# Or for all kernels:
sudo update-initramfs -u -k all
# RHEL: sudo dracut -f /boot/initramfs-6.8.0-35.img 6.8.0-35
```
::

3. **Verify the initramfs exists and has the needed modules:**

::code-wrapper{language="bash"}
```bash
ls -lh /boot/initrd.img-6.8.0-35-generic   # should be > 10 MB
lsinitramfs /boot/initrd.img-6.8.0-35-generic | grep ext4   # has ext4 module?
```
::

4. **Reboot** — select the new kernel. It should boot now.
</details>