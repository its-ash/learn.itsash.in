# 13 — Kernel & Modules

The **kernel** is the core of Linux — it manages the CPU, memory, devices, filesystems, and processes. This chapter covers kernel versions, loadable modules, kernel parameters (`sysctl`), `/proc`/`/sys` interfaces, and kernel upgrades — through the lens of production tuning and troubleshooting.

## Kernel Versions

::code-wrapper{language="bash"}
```bash
uname -r              # current kernel release (e.g., 6.8.0-31-generic)
uname -a              # full info (hostname, kernel version, arch, build date)
cat /proc/version      # kernel version + gcc version it was built with
```
::

Version numbering:

::code-wrapper{language="bash"}
```bash
6.8.0-31-generic
└┘└┘└┘ └┘ └─────┘
 │ │  │  │     └ distro/build flavor (Ubuntu: -generic, -aws; RHEL: -el9)
 │ │  │  └ patch level (distro-specific)
 │ │  └ minor
 │ └ major
```
::

- **Distro kernels**: Ubuntu/RHEL patch and backport fixes onto a base version. `6.8.0-31-generic` is Ubuntu's 31st patch level of 6.8.
- **LTS (Long Term Support)**: some mainline versions get long support (e.g., 6.1, 6.8). Distros often pick LTS bases.

## Loadable Kernel Modules (LKMs)

Drivers and features can be compiled as **modules** (`.ko` files) that are loaded on demand — rather than being built into the kernel.

::code-wrapper{language="bash"}
```bash
# Complex Implementation: load a module with parameters + verify
lsmod                            # list loaded modules
sudo modprobe nfs version=4     # load a module (+ dependencies) with parameters
sudo modprobe -r nfs            # remove a module (and deps)
modinfo nfs                     # show module info (author, params, deps)

# Anti-Pattern: insmod (no dependency resolution)
# sudo insmod /path/to/driver.ko   → fails if prerequisites are missing
# Use modprobe instead — it resolves dependencies automatically
```
::

### Auto-Loading at Boot

::code-wrapper{language="bash"}
```bash
# Modules in /etc/modules-load.d/*.conf are loaded at boot:
echo "nfs" | sudo tee /etc/modules-load.d/nfs.conf

# Module parameters in /etc/modprobe.d/*.conf:
echo "options nfs version=4" | sudo tee /etc/modprobe.d/nfs.conf
```
::

### Blacklisting Modules

::code-wrapper{language="bash"}
```bash
# Complex Implementation: fully block a problematic driver (e.g., nouveau before installing NVIDIA)
echo "blacklist nouveau" | sudo tee /etc/modprobe.d/blacklist-nouveau.conf
# "blacklist" prevents auto-load (by alias), but `modprobe nouveau` still works
# To fully prevent even manual load:
echo "install nouveau /bin/false" | sudo tee -a /etc/modprobe.d/blacklist-nouveau.conf
```
::

## Kernel Parameters — `sysctl`

::code-wrapper{language="bash"}
```bash
# Complex Implementation: production network tuning with persistent config
# Read:
sysctl net.ipv4.ip_forward        # one parameter
cat /proc/sys/net/ipv4/ip_forward  # same (file path = parameter name with / for .)

# Set temporarily:
sudo sysctl -w net.ipv4.ip_forward=1     # lost on reboot
echo 1 | sudo tee /proc/sys/net/ipv4/ip_forward   # same

# Set persistent:
echo "net.ipv4.ip_forward = 1" | sudo tee /etc/sysctl.d/99-ip-forward.conf
sudo sysctl -p /etc/sysctl.d/99-ip-forward.conf   # load just this file
sudo sysctl --system                               # load ALL configs
```
::

### Common Parameters

| Parameter | Purpose |
|---|---|
| `net.ipv4.ip_forward` | IP forwarding (router/VPN/Docker) |
| `net.ipv4.tcp_tw_reuse` | Reuse TIME_WAIT sockets (high-conn servers) |
| `net.core.somaxconn` | Max backlog of pending connections |
| `vm.swappiness` | Swap tendency (0-100, default 60) |
| `vm.overcommit_memory` | Memory overcommit (0=heuristic, 1=always, 2=strict) |
| `fs.file-max` | System-wide max open files |
| `fs.inotify.max_user_watches` | Inotify watches (IDEs, Dropbox) |
| `kernel.sysrq` | Magic SysRq key (1=enable all) |

### Edge Case: `sysctl -w` Changes Are Temporary

::code-wrapper{language="bash"}
```bash
# NAIVE: set without persisting
sudo sysctl -w vm.swappiness=10
# After reboot: swappiness is back to 60

# PRODUCTION: persist in /etc/sysctl.d/
echo "vm.swappiness = 10" | sudo tee /etc/sysctl.d/99-swappiness.conf
sudo sysctl --system
```
::

### `/etc/sysctl.d/` Precedence

Files are loaded in lexical order. `99-sysctl.conf` is a symlink to `/etc/sysctl.conf` (loaded last, lowest priority). Use `99-*.conf` for your overrides so they take precedence.

## `/proc` — Kernel & Process Interface

::code-wrapper{language="bash"}
```bash
# Complex Implementation: read system state from /proc (no external tools needed)
cat /proc/loadavg
# 0.45 0.32 0.28 2/1024 12345
#  └─────────────┘ └─────┘
#  load avg (1,5,15)   running/total processes, last PID

cat /proc/meminfo | head -5
# MemTotal:       16332940 kB
# MemFree:         8234520 kB
# MemAvailable:   11234567 kB   ← what apps can actually use (free + reclaimable cache)

cat /proc/cmdline   # boot parameters passed to the kernel
```
::

## udev — Device Management

::code-wrapper{language="bash"}
```bash
# Complex Implementation: stable device name with udev rules
# /etc/udev/rules.d/99-usb-serial.rules
# SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="6001", SYMLINK+="usb_serial"
# → creates /dev/usb_serial (stable across reboots, instead of /dev/ttyUSB0 sometimes being ttyUSB1)

# Debug:
udevadm monitor                     # live device events (plug/unplug USB)
udevadm info -a /dev/sda1           # all attributes (for writing rules)
sudo udevadm control --reload-rules  # reload after editing
sudo udevadm trigger                 # re-process all devices
```
::

## Kernel Upgrade

::code-wrapper{language="bash"}
```bash
# Complex Implementation: safe kernel upgrade with fallback
sudo apt update && sudo apt install linux-image-generic
# Old kernels are kept (so you can fall back)

# Check installed kernels:
ls /boot/vmlinuz-*
dpkg --list | grep linux-image      # Debian
rpm -qa | grep kernel               # RHEL

# NEVER remove the running kernel:
uname -r                            # check before purging
# If you purge linux-image-$(uname -r), the system may keep running
# (kernel is in memory) but you can't load modules or rebuild initramfs
```
::

### Edge Case: `/boot` Fills Up From Old Kernels

::code-wrapper{language="bash"}
```bash
df -h /boot                         # check space
sudo apt autoremove --purge         # Debian (keeps current + one previous)
sudo dnf remove --oldinstallonly   # RHEL
```
::

## `initramfs` — Early Userspace

The **initramfs** is loaded by the bootloader into RAM. It contains enough userspace to:
1. Load modules needed to access the root filesystem.
2. Mount the root filesystem.
3. `pivot_root` into it and `exec` the real init (systemd).

::code-wrapper{language="bash"}
```bash
# Regenerate after kernel or storage changes:
sudo update-initramfs -u        # Debian/Ubuntu (current kernel)
sudo update-initramfs -u -k all # all kernels
sudo dracut -f                  # RHEL/Fedora
sudo mkinitcpio -P              # Arch

# Inspect:
lsinitramfs /boot/initrd.img-$(uname -r) | grep ext4   # has ext4 module?
```
::

### Edge Case: Missing initramfs Causes Boot Failure

::code-wrapper{language="bash"}
```bash
# Error: "VFS: Unable to mount root fs on unknown-block(0,0)"
# The initramfs is missing or doesn't have the storage driver for the new kernel.
# Fix: boot an older kernel (GRUB → "Advanced options"), then:
sudo update-initramfs -u -k all
sudo reboot
```
::

## DKMS — Dynamic Kernel Module Support

::code-wrapper{language="bash"}
```bash
# Third-party modules (NVIDIA, ZFS, VirtualBox) need rebuilding for each kernel version
sudo dkms install nvidia/550.54          # build + install for current kernel
dkms status                              # list DKMS modules
# When a new kernel is installed, DKMS auto-rebuilds via a postinst hook

# Edge Case: if DKMS fails (API changed), the module is missing after reboot
# Check dkms status after kernel updates — have a fallback kernel ready
```
::

## 💡 Tips & Tricks

- **Idiom**: use `sysctl --system` after editing `/etc/sysctl.d/*.conf` — loads all sysctl files in order. Put custom config in `99-*.conf` so it loads last and wins.
- **Idiom**: use `modprobe` (not `insmod`) for loading modules — `modprobe` resolves dependencies. `insmod` loads a single `.ko` and fails if deps are missing.
- **Idiom**: use `modinfo <module>` before loading — shows description, parameters, dependencies, and which kernel it was built for.
- **Idiom**: blacklist problematic modules in `/etc/modprobe.d/` — `blacklist` stops auto-load; `install <module> /bin/false` blocks even manual loading.
- **Idiom**: run `sudo update-initramfs -u` (or `dracut -f`) after storage/kernel changes — ensures the initramfs has the modules to boot.
- **Debug**: use `udevadm monitor` to watch device events live — plug in a USB device and see the kernel + udev events.
- **Debug**: use `cat /proc/cmdline` to verify boot parameters — confirms that GRUB changes took effect after `update-grub`.
- **Debug**: use `journalctl -k -p err` (or `dmesg --level=err`) for kernel errors — hardware failures, driver issues, OOM kills.

## ⚠️ Edge Cases & Gotchas

- **Modules are kernel-version-specific**: a module built for 6.8.0-31 won't load on 6.8.0-32 (vermagic check). DKMS rebuilds on kernel updates — if DKMS fails (e.g., NVIDIA can't build against a new kernel), the module won't load after reboot.
- **`rmmod` fails if the module is in use**: you can't remove a filesystem module while a filesystem of that type is mounted, or a network driver while the interface is up. Stop the usage first (`umount`, `ip link set down`), then `rmmod`.
- **`sysctl -w` changes are temporary**: lost on reboot. Always persist in `/etc/sysctl.d/`.
- **Removing the running kernel breaks the system**: if you `apt purge linux-image-$(uname -r)`, the running kernel's files are deleted. You can't load modules or rebuild initramfs. Never purge the running kernel — check `uname -r` first.
- **`/boot` can fill up from old kernels**: `apt` keeps old kernels, and `/boot` is often a small separate partition. Clean with `sudo apt autoremove --purge` (Debian) or `dnf remove --oldinstallonly` (RHEL).
- **DKMS can break on kernel updates**: if a third-party module (NVIDIA, ZFS) can't compile against a new kernel (API changed), DKMS fails, and after reboot the module is missing. Check `dkms status` and have a fallback kernel.
- **`/proc` and `/sys` are virtual**: `du -sh /proc` gives nonsense. `tar` should exclude them. Don't try to back them up — they're generated by the kernel at read time.

## 🧠 Quick Quiz

You install a new kernel via `sudo apt install linux-image-6.8.0-35-generic`, reboot, and get a kernel panic: "VFS: Unable to mount root fs on unknown-block(0,0)". What's the most likely cause, and how do you fix it?

<details>
<summary>Answer</summary>

**The initramfs is missing or doesn't have the storage driver.** "Unable to mount root fs" means the kernel booted but can't find/read the root filesystem — because the driver for your disk controller or filesystem (ext4, LVM, NVMe) is a module that wasn't included in the initramfs.

**Fix:**

1. Boot an older (working) kernel — GRUB → "Advanced options" → select the previous kernel (e.g., 6.8.0-31).

2. Regenerate the initramfs for the new kernel:

::code-wrapper{language="bash"}
```bash
sudo update-initramfs -u -k 6.8.0-35-generic
# Or for all kernels:
sudo update-initramfs -u -k all
# RHEL: sudo dracut -f /boot/initramfs-6.8.0-35.img 6.8.0-35
```
::

3. Verify the initramfs exists and has the needed modules:

::code-wrapper{language="bash"}
```bash
ls -lh /boot/initrd.img-6.8.0-35-generic   # should be > 10 MB
lsinitramfs /boot/initrd.img-6.8.0-35-generic | grep ext4   # has ext4 module?
```
::

4. Reboot — select the new kernel. It should boot now.
</details>