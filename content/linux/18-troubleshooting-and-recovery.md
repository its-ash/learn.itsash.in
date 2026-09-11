# 18 — Troubleshooting & Recovery

Things break. A service won't start, a disk fills up, boot fails, performance degrades. This chapter is your field guide for diagnosing and fixing Linux problems — the tools, the methodology, and the recovery procedures for when a system is truly stuck.

## The Troubleshooting Methodology

1. **Don't panic, don't reboot (yet).** Rebooting destroys evidence (logs, process state, `/proc`). Gather information first.
2. **Check the logs.** The system tells you what's wrong — `journalctl`, `dmesg`, `/var/log/`. Read the error.
3. **Isolate the layer.** Is it the network? Disk? The app? The kernel? Test each layer independently.
4. **Reproduce.** If you can reproduce the issue, you can test fixes.
5. **Change one thing at a time.** Multiple changes obscure which fix worked (or which broke something else).
6. **Have a rollback plan.** Before changing a config, back it up.
7. **Document.** Once fixed, record the cause and solution.

## The First Questions

::code-wrapper{language="bash"}
```bash
# Complex Implementation: system health snapshot in 10 commands
systemctl list-units --state=failed  # failed services
journalctl -b -p err                 # current boot, errors only
journalctl -b -1 -p err              # previous boot, errors (if rebooted)
dmesg --level=err,crit               # kernel errors
uptime                               # load average
free -h                              # memory
df -h                                # disk space
df -i                                # inodes
ss -tlnp                             # listening ports
top -b -n 1 | head -20               # top processes
```
::

## Common Problems & Solutions

### "No space left on device"

::code-wrapper{language="bash"}
```bash
# Complex Implementation: full disk-space diagnosis
df -h                    # which filesystem is full?
df -i                    # maybe inodes are full (not space)?

# Find the biggest consumers:
sudo du -sh /* 2>/dev/null | sort -rh | head
sudo du -sh /var/* 2>/dev/null | sort -rh | head
sudo ncdu /              # interactive (if installed)

# Common culprits:
journalctl --disk-usage   # journald size
sudo du -sh /var/log /var/cache /var/lib/docker 2>/dev/null

# Find deleted-but-open files (space not freed until fd closes):
sudo lsof +L1
# COMMAND   PID  USER  FD  SIZE  NLINK  NAME
# nginx    1234  root  9w  50G   0      /var/log/nginx/access.log (deleted)
# Fix: restart the process (closes the fd, frees the space)
sudo systemctl restart nginx
```
::

### "Permission denied" (but permissions look right)

::code-wrapper{language="bash"}
```bash
# Complex Implementation: multi-layer permission diagnosis
ls -l file                      # check owner, group, mode
namei -l /path/to/file          # permissions on EACH path component (parent dirs!)
getfacl file                    # ACLs (might deny even if base perms allow)
ls -Z file                      # SELinux label (RHEL — SELinux might be blocking)
sudo ausearch -m AVC -ts recent # SELinux denials
lsattr file                     # extended attributes (immutable?)
```
::

Common causes:
- **Parent directory lacks `x`**: you can't access a file if you can't traverse its parent. `namei -l` reveals this.
- **SELinux**: "Permission denied" with correct Unix perms = SELinux. Check `ausearch -m AVC`.
- **Immutable attribute**: `chattr +i file` makes it undeletable. Check with `lsattr`, remove with `chattr -i`.

### "Service won't start"

::code-wrapper{language="bash"}
```bash
systemctl status nginx              # status + last log lines
journalctl -u nginx -n 50           # full logs
sudo nginx -t                       # test config (if it has a config test)
systemctl cat nginx                 # see the unit file (ExecStart, etc.)
# Run the ExecStart command manually to see the error:
/usr/sbin/nginx -g 'daemon off;'
```
::

### "Disk full" but `du` Doesn't Show It

::code-wrapper{language="bash"}
```bash
# Complex Implementation: find deleted-but-open files hogging disk space
# — a process holds a large file OPEN but DELETED; space not freed until fd closes
sudo lsof +L1               # list open files with link count 0 (deleted but open)
# COMMAND   PID  USER  FD  SIZE  NLINK  NAME
# nginx    1234  root  9w  50G   0      /var/log/nginx/access.log (deleted)

# Fix: restart the process (closes the fd, frees the space)
sudo systemctl restart nginx
# Or truncate the file via /proc (without restarting):
sudo truncate -s 0 /proc/1234/fd/9
```
::

### DNS Not Resolving

::code-wrapper{language="bash"}
```bash
# Complex Implementation: full DNS diagnostic chain
dig example.com                     # direct DNS query (bypasses cache)
getent hosts example.com            # via NSS (checks /etc/hosts, then DNS)
cat /etc/resolv.conf                # nameservers
cat /etc/hosts                      # stale override?
cat /etc/nsswitch.conf | grep hosts # order: files dns?
ping 8.8.8.8                        # is the network up?
dig @8.8.8.8 example.com            # query a specific server
resolvectl status                   # systemd-resolved
sudo resolvectl flush-caches        # flush DNS cache
```
::

### "Read-only file system"

::code-wrapper{language="bash"}
```bash
# The filesystem remounted itself read-only (ext4 does this on journal errors to prevent corruption)
mount | grep "ro,"               # which is read-only?
dmesg | grep -i "error\|ext4"    # why? (disk errors, corruption)
sudo fsck /dev/sda1              # check + repair (must be unmounted)
sudo mount -o remount,rw /       # try to remount read-write (if safe)
```
::

## Recovery Procedures

### Boot to Rescue Mode

At the GRUB menu:
1. Press `e` to edit the default entry.
2. Find the `linux` line.
3. Append `systemd.unit=rescue.target`.
4. `Ctrl+X` to boot.

::code-wrapper{language="bash"}
```bash
mount -o remount,rw /     # if root is read-only
```
::

### `init=/bin/bash` (When systemd is broken)

::code-wrapper{language="bash"}
```bash
# No systemd, no services, root mounted read-only. Raw shell as PID 1:
mount -o remount,rw /
# fix the problem (e.g., edit /etc/fstab, reinstall a package)
sync
mount -o remount,ro /
exec /sbin/init             # start systemd normally
```
::

### Live USB / Rescue ISO + chroot

::code-wrapper{language="bash"}
```bash
# Complex Implementation: chroot to fix an installed system from a live USB
sudo mount /dev/sda2 /mnt               # root partition
sudo mount /dev/sda1 /mnt/boot/efi      # ESP (if UEFI)
# For LVM:
sudo vgchange -a y                      # activate all LVM volumes
sudo mount /dev/vg_root/lv_root /mnt

# Bind-mount virtual filesystems for chroot:
sudo mount --bind /dev /mnt/dev
sudo mount --bind /dev/pts /mnt/dev/pts
sudo mount --bind /proc /mnt/proc
sudo mount --bind /sys /mnt/sys
sudo mount --bind /run /mnt/run

sudo chroot /mnt
# Now you're "inside" the installed system — apt/dnf, fsck, etc. work
exit
sudo reboot
```
::

### Fixing a Broken `fstab`

::code-wrapper{language="bash"}
```bash
# In emergency mode:
mount -o remount,rw /
journalctl -b | grep -i "mount\|fstab"
nano /etc/fstab                # comment out the bad line
mount -a                       # test
systemctl default              # continue boot
```
::

## Diagnostic Tools

### `strace` — Trace Syscalls

::code-wrapper{language="bash"}
```bash
# Complex Implementation: find why a program can't open a file
strace -e trace=open,openat myapp 2>&1 | grep ENOENT
# openat(AT_FDCWD, "/etc/myapp/config.yaml", O_RDONLY) = -1 ENOENT (No such file or directory)

# Count syscalls (summary):
strace -c command
# Attach to a running process:
strace -p 1234
# Follow child processes:
strace -f command
```
::

### `lsof` — List Open Files

::code-wrapper{language="bash"}
```bash
sudo lsof /var/log/syslog          # who has this file open?
sudo lsof -i :80                   # what's using port 80?
sudo lsof -p 1234                  # all files opened by PID 1234
sudo lsof +L1                     # deleted but still open (disk space mystery)
```
::

### `tcpdump` — Packet Capture

::code-wrapper{language="bash"}
```bash
sudo tcpdump -i eth0 port 80               # capture port 80
sudo tcpdump -i eth0 host 8.8.8.8          # capture to/from a host
sudo tcpdump -i eth0 -w capture.pcap       # save (for Wireshark)
sudo tcpdump -i any -n -A 'tcp port 80'    # all interfaces, numeric, ASCII
```
::

### `sysrq` (Magic SysRq) — REISUB

For when the system is completely frozen:

::code-wrapper{language="bash"}
```bash
echo 1 | sudo tee /proc/sys/kernel/sysrq   # enable
```
::

Mnemonic: **REISUB** (R-E-I-S-U-B) — the safe reboot sequence when frozen:

- `Alt+SysRq+r` — take back control of keyboard from X.
- `Alt+SysRq+e` — SIGTERM all processes (except PID 1).
- `Alt+SysRq+i` — SIGKILL all processes.
- `Alt+SysRq+s` — sync all filesystems.
- `Alt+SysRq+u` — remount all filesystems read-only.
- `Alt+SysRq+b` — reboot (force).

Always `s` (sync) before `b` (reboot) to avoid data loss.

## 💡 Tips & Tricks

- **Idiom**: use `journalctl -b -p err` as your first "what went wrong?" query — limits to current boot, errors only. Add `--since` for a time window.
- **Idiom**: use `journalctl -b -1 -p err` for previous-boot debugging — when a reboot happened (crash, OOM), shows what happened before.
- **Idiom**: use `lsof +L1` to find deleted-but-open files — explains "disk full but `du` doesn't show it." A process holds a large deleted file open; space not freed until fd closes.
- **Idiom**: use `strace -e trace=open,openat <cmd> 2>&1 | grep ENOENT` to find missing files — reveals exactly which path a program can't find.
- **Idiom**: use `namei -l /path/to/file` to see permissions on each path component — reveals when a "Permission denied" is due to a parent directory lacking `x`, not the file itself.
- **Debug**: use `sudo ausearch -m AVC -ts recent` when SELinux blocks something — shows the exact denial. Common on RHEL.
- **Debug**: REISUB is the safe reboot sequence when the system is frozen — always `s` (sync) before `b` (reboot) to avoid data loss.

## ⚠️ Edge Cases & Gotchas

- **Don't reboot immediately**: rebooting destroys evidence (logs, process state, `/proc`). Gather information first.
- **"Connection refused" vs "Connection timed out"**: refused = something is listening but refused you (port closed, or firewall REJECT). Timed out = nothing responded (firewall DROP, or network issue). The distinction matters.
- **`fsck` on a mounted filesystem can corrupt it**: never `fsck` a mounted ext4/xfs. Unmount first, or boot from a live USB.
- **`/var/log` can fill up**: if logs aren't rotated, `/var/log` fills up, causing services to fail. Set `SystemMaxUse=` in `journald.conf` and configure `logrotate`.
- **Auth log locations differ by distro**: Debian/Ubuntu uses `/var/log/auth.log`; RHEL/Rocky uses `/var/log/secure`. Use `journalctl -u ssh` for portability.
- **`dmesg` is cleared on reboot**: for persistent kernel logs, rely on `journalctl -k` (which persists if journald is persistent).
- **Locked package manager**: `sudo rm /var/lib/dpkg/lock-frontend` only if you're SURE no apt is running. Check with `lsof /var/lib/dpkg/lock-frontend` first.

## 🧠 Quick Quiz

A production server is suddenly unresponsive — SSH hangs, `top` freezes, even `ls` takes 30 seconds. You can't get a shell. The system doesn't respond to Ctrl+Alt+Del. What tool can save you, and what's the procedure?

<details>
<summary>Answer</summary>

**Magic SysRq (REISUB)** — the kernel's built-in emergency recovery mechanism, accessible even when the system is completely frozen.

**Prerequisites**: `kernel.sysrq` must be enabled (`echo 1 | sudo tee /proc/sys/kernel/sysrq`). If it's not enabled, you may not be able to use it (enable it in `/etc/sysctl.d/` before you need it).

**Procedure — REISUB:**

1. **R** (`Alt+SysRq+r`) — take back control of the keyboard from X/display manager.
2. **E** (`Alt+SysRq+e`) — SIGTERM all processes (except PID 1). Gives processes a chance to shut down gracefully.
3. **I** (`Alt+SysRq+i`) — SIGKILL all processes that didn't respond to SIGTERM.
4. **S** (`Alt+SysRq+s`) — sync all filesystems (flush dirty pages to disk). **Wait for the disk light to stop.**
5. **U** (`Alt+SysRq+u`) — remount all filesystems read-only (clean state for reboot).
6. **B** (`Alt+SysRq+b`) — reboot.

The critical steps are **S** (sync) and **U** (remount read-only) before **B** (reboot) — this prevents filesystem corruption.

If you don't have a SysRq key (some laptops don't), you can trigger via command line (if you have ANY shell access, even a serial console):

::code-wrapper{language="bash"}
```bash
echo s | sudo tee /proc/sysrq-trigger   # sync
echo u | sudo tee /proc/sysrq-trigger   # remount ro
echo b | sudo tee /proc/sysrq-trigger   # reboot
```
::

**Why this matters**: yanking the power on a frozen system can corrupt the filesystem (dirty pages not flushed). REISUB ensures a clean shutdown even when nothing else works.
</details>