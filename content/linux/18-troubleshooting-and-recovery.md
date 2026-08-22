# 18 — Troubleshooting & Recovery

Things break. A service won't start, a disk fills up, boot fails, performance degrades. This chapter is your field guide for diagnosing and fixing Linux problems — the tools, the methodology, and the recovery procedures for when a system is truly stuck.

## The Troubleshooting Methodology

1. **Don't panic, don't reboot (yet).** Rebooting destroys evidence (logs, process state, `/proc`). Gather information first.
2. **Check the logs.** The system tells you what's wrong — `journalctl`, `dmesg`, `/var/log/`. Read the error.
3. **Isolate the layer.** Is it the network? Disk? The app? The kernel? Test each layer independently.
4. **Reproduce.** If you can reproduce the issue, you can test fixes.
5. **Change one thing at a time.** Multiple changes obscure which fix worked (or which broke something else).
6. **Have a rollback plan.** Before changing a config, back it up. Before a risky fix, know how to undo it.
7. **Document.** Once fixed, record the cause and solution — for next time.

## The First Questions

When something is wrong, start with:

::code-wrapper{language="bash"}
```bash
# What's failing?
systemctl status <service>           # service status + recent logs
systemctl list-units --state=failed  # all failed units

# What do the logs say?
journalctl -u <service> -n 50        # last 50 lines for a service
journalctl -b -p err                 # current boot, errors only
journalctl -b -1 -p err              # PREVIOUS boot, errors (if rebooted)
dmesg --level=err,crit               # kernel errors

# System health
uptime                               # load average
free -h                              # memory
df -h                                # disk space
df -i                                # inodes
ss -tlnp                             # listening ports
top -b -n 1 | head -20               # top processes
```

## Common Problems & Solutions

### "No space left on device"

::code-wrapper{language="bash"}
```bash
df -h                    # which filesystem is full?
df -i                    # maybe inodes are full (not space)?

# Find the biggest consumers:
sudo du -sh /* 2>/dev/null | sort -rh | head
sudo du -sh /var/* 2>/dev/null | sort -rh | head
sudo ncdu /              # interactive (if installed)

# Common culprits:
sudo du -sh /var/log /var/cache /tmp /var/lib/docker 2>/dev/null
journalctl --disk-usage   # journald size
```

Common causes and fixes:
- **Logs**: `sudo journalctl --vacuum-size=500M`, fix `logrotate`.
- **Old kernels**: `sudo apt autoremove --purge` (Debian), `dnf remove --oldinstallonly` (RHEL).
- **Docker**: `docker system prune -a` (careful — removes unused images).
- **Package cache**: `sudo apt clean` (Debian), `sudo dnf clean all` (RHEL).
- **Inode exhaustion**: millions of tiny files. Find them: `for d in /*; do echo $(find $d -xdev | wc -l) $d; done | sort -rn | head`. Delete them.

### "Permission denied" (but permissions look right)

::code-wrapper{language="bash"}
```bash
ls -l file                      # check owner, group, mode
namei -l /path/to/file          # permissions on EACH path component (parent dirs!)
getfacl file                    # ACLs (might deny even if base perms allow)
ls -Z file                      # SELinux label (RHEL — SELinux might be blocking)
sudo ausearch -m AVC -ts recent # SELinux denials
lsattr file                     # extended attributes (immutable?)
```

Common causes:
- **Parent directory lacks `x`**: you can't access a file if you can't traverse its parent directory. `namei -l` reveals this.
- **SELinux**: "Permission denied" with correct Unix perms = SELinux. Check `ausearch -m AVC`.
- **Immutable attribute**: `chattr +i file` makes it undeletable. Check with `lsattr`, remove with `chattr -i`.
- **ACL**: an ACL might deny a user even if the group has access. `getfacl` shows the full picture.

### "Connection refused" / "Can't connect"

::code-wrapper{language="bash"}
```bash
# Is the service running?
systemctl status nginx
ss -tlnp | grep :80         # is anything listening on 80?

# Is the port open locally?
curl -v http://localhost:80
nc -zv localhost 80

# Is the firewall blocking?
sudo ufw status             # or: sudo firewall-cmd --list-all
sudo iptables -L -n

# Is it a network issue?
ping <server>
mtr <server>
traceroute <server>

# DNS resolving correctly?
dig <hostname>
getent hosts <hostname>     # uses NSS (checks /etc/hosts first)
cat /etc/hosts              # stale entry overriding DNS?
```

"Connection refused" = something is listening but refused you (port closed, or firewall REJECT). "Connection timed out" = nothing responded (firewall DROP, or network issue). The distinction matters.

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

Common causes:
- **Config syntax error**: `nginx -t`, `sshd -t`, `httpd -t`, `named-checkconf`.
- **Port already in use**: `ss -tlnp | grep :80` — find and stop the conflicting service.
- **Missing dependency**: a required file, directory, or environment variable doesn't exist.
- **Permissions**: the service runs as a user that can't read its config or write its PID file.
- **SELinux**: blocking access. Check `ausearch -m AVC`.

### "Disk full" but `du` doesn't show it

A process has a large file **open but deleted**. The file's data isn't freed until the process closes the file descriptor — but the file doesn't appear in `du` (it's deleted from the directory).

::code-wrapper{language="bash"}
```bash
sudo lsof +L1               # list open files with link count 0 (deleted but open)
# COMMAND   PID  USER  FD  SIZE  NLINK  NAME
# nginx    1234  root  9w  50G   0      /var/log/nginx/access.log (deleted)

# Fix: restart the process (it'll close the fd, freeing the space)
sudo systemctl restart nginx
# Or: truncate the file via /proc (without restarting):
sudo truncate -s 0 /proc/1234/fd/9
```

### High Load, Slow System

See chapter 15. The quick diagnostic:

::code-wrapper{language="bash"}
```bash
uptime                      # load average
vmstat 1                    # r (runnable), b (blocked), wa (I/O wait)
top / htop                  # which process?
iostat -x 1                 # disk %util, await
free -h                     # memory + swap
```

- High load + high `wa` = disk I/O bottleneck (check `iostat`).
- High load + high `us` = CPU-bound (check `top`).
- High load + `si`/`so` non-zero = memory pressure (check `free`, add RAM or reduce usage).
- Load normal but slow = network (check `mtr`, `ss -i`) or the app itself.

### "Too many open files"

::code-wrapper{language="bash"}
```bash
ulimit -n                   # your shell's limit (usually 1024)
cat /proc/<pid>/limits | grep "open files"  # a process's limit
sudo lsof -p <pid> | wc -l  # how many files it has open
```

Fix:
- **For a shell**: `ulimit -n 65536` (temporary).
- **For a service** (systemd): `LimitNOFILE=65536` in the unit file.
- **System-wide**: `fs.file-max` in `sysctl`, and `/etc/security/limits.conf` for PAM sessions.

::code-wrapper{language="bash"}
```bash
echo "fs.file-max = 1048576" | sudo tee /etc/sysctl.d/99-files.conf
sudo sysctl --system
# /etc/security/limits.conf:
# *  soft  nofile  65536
# *  hard  nofile  65536
```

### "Fork: Resource temporarily unavailable"

Process limit hit (too many processes):

::code-wrapper{language="bash"}
```bash
ulimit -u                   # max processes for your user
cat /proc/<pid>/limits | grep "processes"
ps -u alice | wc -l         # how many alice has
```

Fix: `ulimit -u 4096` (shell) or `LimitNPROC=4096` (systemd) or `/etc/security/limits.conf`. Check for fork bombs (a runaway script spawning processes).

### DNS Not Resolving

::code-wrapper{language="bash"}
```bash
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

Common causes:
- `/etc/hosts` has a stale entry (checked before DNS).
- `resolv.conf` has wrong/missing nameservers.
- Network is down (can't reach the DNS server).
- systemd-resolved is running but `resolv.conf` is misconfigured.
- DNS cache has a stale entry — flush it.

### "Read-only file system"

The filesystem remounted itself read-only (usually due to an error — ext4 does this on journal errors to prevent corruption):

::code-wrapper{language="bash"}
```bash
mount | grep "ro,"               # which is read-only?
dmesg | grep -i "error\|ext4"    # why? (disk errors, corruption)
sudo fsck /dev/sda1              # check + repair (must be unmounted)
sudo mount -o remount,rw /       # try to remount read-write (if safe)
```

If the disk has errors, `fsck` is needed. Reboot to a live USB or rescue mode if it's the root filesystem.

## Recovery Procedures

### Boot to Rescue Mode

At the GRUB menu:
1. Press `e` to edit the default entry.
2. Find the `linux` line.
3. Append `systemd.unit=rescue.target` (or `single` or `1`).
4. `Ctrl+X` to boot.

You get a root shell with minimal services. Remount root read-write if needed:

::code-wrapper{language="bash"}
```bash
mount -o remount,rw /
```

### Boot to Emergency Mode

Append `systemd.unit=emergency.target`. Even more minimal — root is mounted read-only:

::code-wrapper{language="bash"}
```bash
mount -o remount,rw /
# fix the problem...
systemctl default               # try to continue boot
```

### `init=/bin/bash` (When systemd is broken)

Append `init=/bin/bash` to the kernel line. No systemd, no services, root mounted read-only. Raw shell as PID 1:

::code-wrapper{language="bash"}
```bash
mount -o remount,rw /
# fix the problem (e.g., edit /etc/fstab, reinstall a package)
sync                            # flush writes
mount -o remount,ro /
exec /sbin/init                 # start systemd normally
# or: reboot -f                 # force reboot
```

### Live USB / Rescue ISO

Boot from a live USB (Ubuntu installer, SystemRescue, Fedora Live). Then chroot to fix the installed system:

::code-wrapper{language="bash"}
```bash
sudo mount /dev/sda2 /mnt               # root partition
sudo mount /dev/sda1 /mnt/boot          # /boot (if separate)
sudo mount /dev/sda1 /mnt/boot/efi      # ESP (if UEFI)
# For LVM:
sudo vgchange -a y                      # activate all LVM volumes
sudo mount /dev/vg_root/lv_root /mnt

sudo mount --bind /dev /mnt/dev
sudo mount --bind /dev/pts /mnt/dev/pts
sudo mount --bind /proc /mnt/proc
sudo mount --bind /sys /mnt/sys
sudo mount --bind /run /mnt/run

sudo chroot /mnt
# Now you're "inside" the installed system — apt/dnf, fsck, etc. work
# Fix the problem...
exit
sudo reboot
```

### Resetting a Lost Root Password

See chapter 16. Boot with `rw init=/bin/bash`, `passwd`, `exec /sbin/init`. On SELinux systems, `touch /.autorelabel` before rebooting.

### Fixing a Broken `fstab`

A bad `fstab` entry drops to emergency mode:

::code-wrapper{language="bash"}
```bash
# In emergency mode:
mount -o remount,rw /
journalctl -b | grep -i "mount\|fstab"
nano /etc/fstab                      # comment out the bad line
mount -a                             # test
systemctl default                    # continue boot
```

### Reinstalling GRUB

If GRUB is broken (no boot menu, "GRUB rescue" prompt):

::code-wrapper{language="bash"}
```bash
# Boot from a live USB, then:
sudo mount /dev/sda2 /mnt
sudo mount /dev/sda1 /mnt/boot/efi     # UEFI only

# Chroot (see above), then:
sudo mount --bind /dev /mnt/dev
sudo mount --bind /proc /mnt/proc
sudo mount --bind /sys /mnt/sys
sudo chroot /mnt

# BIOS:
grub-install /dev/sda
# UEFI:
grub-install --target=x86_64-efi --efi-directory=/boot/efi
update-grub                            # Debian
grub2-mkconfig -o /boot/grub2/grub.cfg # RHEL
```

### Fixing a Broken Package Manager

::code-wrapper{language="bash"}
```bash
# Debian/Ubuntu — interrupted install:
sudo dpkg --configure -a
sudo apt --fix-broken install
sudo apt update

# Held packages:
apt-mark showhold
sudo apt-mark unhold <package>

# RHEL — interrupted transaction:
sudo dnf complete-transactions
sudo rpm --rebuilddb          # rebuild the RPM database

# Locked package manager (another process running):
sudo rm /var/lib/dpkg/lock-frontend   # only if you're sure no apt is running!
sudo rm /var/lib/apt/lists/lock
```

## Diagnostic Tools

### `strace` — Trace Syscalls

See what a process is doing (system calls):

::code-wrapper{language="bash"}
```bash
strace command                  # trace all syscalls
strace -c command               # count syscalls (summary)
strace -e trace=open,read command  # only specific syscalls
strace -e trace=file command    # file-related only
strace -e trace=network command # network only
strace -p 1234                  # attach to a running process
strace -f command               # follow child processes
strace -t command               # with timestamps
strace -o trace.log command     # save to file
```

Example — find why a program can't open a file:

::code-wrapper{language="bash"}
```bash
strace -e trace=open,openat myapp 2>&1 | grep ENOENT
# openat(AT_FDCWD, "/etc/myapp/config.yaml", O_RDONLY) = -1 ENOENT (No such file or directory)
```

### `ltrace` — Trace Library Calls

Like `strace` but for library function calls (glibc, etc.):

::code-wrapper{language="bash"}
```bash
ltrace command
ltrace -l /lib/libc.so.6 command   # specific library
```

### `lsof` — List Open Files

The "what's using this?" tool:

::code-wrapper{language="bash"}
```bash
sudo lsof /var/log/syslog          # who has this file open?
sudo lsof +D /var/log              # anything open under this dir?
sudo lsof -i :80                   # what's using port 80?
sudo lsof -i tcp                   # all TCP
sudo lsof -u alice                 # all of alice's open files
sudo lsof -p 1234                  # all files opened by PID 1234
sudo lsof +L1                      # deleted but still open (disk space mystery)
```

### `fuser` — Who's Using a File/Directory

::code-wrapper{language="bash"}
```bash
fuser -v /var/log/syslog           # PIDs using the file
fuser -v -m /mnt/usb               # processes using the filesystem (blocking unmount)
sudo fuser -k /mnt/usb             # kill them (force unmount)
```

### `tcpdump` — Packet Capture

::code-wrapper{language="bash"}
```bash
sudo tcpdump -i eth0 port 80               # capture port 80
sudo tcpdump -i eth0 host 8.8.8.8          # capture to/from a host
sudo tcpdump -i eth0 -w capture.pcap       # save (for Wireshark)
sudo tcpdump -i any -n -A 'tcp port 80'    # all interfaces, numeric, ASCII
```

### `perf` — Performance Profiling

::code-wrapper{language="bash"}
```bash
sudo perf top                       # live function profiling
sudo perf record -p 1234 -- sleep 10
sudo perf report
sudo perf stat command              # counters (cache misses, branches)
```

### `sysrq` (Magic SysRq)

For when the system is completely frozen (can't even SSH in). Requires `kernel.sysrq` enabled:

::code-wrapper{language="bash"}
```bash
echo 1 | sudo tee /proc/sys/kernel/sysrq   # enable
```

Key combos (Alt+SysRq+letter):
- `Alt+SysRq+r` — take back control of keyboard from X.
- `Alt+SysRq+e` — SIGTERM all processes (except PID 1).
- `Alt+SysRq+i` — SIGKILL all processes.
- `Alt+SysRq+s` — sync all filesystems.
- `Alt+SysRq+u` — remount all filesystems read-only.
- `Alt+SysRq+b` — reboot (force).

Mnemonic: **REISUB** (R-E-I-S-U-B) — the safe reboot sequence when frozen. Always `s` (sync) before `b` (reboot) to avoid data loss.

Via command line:

::code-wrapper{language="bash"}
```bash
echo s | sudo tee /proc/sysrq-trigger   # sync
echo u | sudo tee /proc/sysrq-trigger   # remount ro
echo b | sudo tee /proc/sysrq-trigger   # reboot
```

### Kernel Oops / Panic

A **kernel oops** is a non-fatal kernel error (logged, one process killed). A **kernel panic** is fatal (system halts).

::code-wrapper{language="bash"}
```bash
dmesg | grep -i "oops\|panic\|bug"
journalctl -k | grep -i "oops\|panic\|bug"
```

Common causes:
- **Hardware**: bad RAM (run `memtest86`), failing disk, overheating.
- **Driver bug**: a kernel module crashed. Check which module in the trace.
- **Filesystem corruption**: `fsck`.
- **Out of memory**: OOM killer (not a panic, but similar symptoms).

### `kdump` — Capture Kernel Crash Dumps

For analyzing kernel panics. `kdump` reserves memory for a crash kernel that captures the dump:

::code-wrapper{language="bash"}
```bash
sudo apt install kdump-tools      # Debian
sudo dnf install kexec-tools      # RHEL
sudo systemctl enable kdump
# After a panic, the dump is in /var/crash/
```

## The "Is It Plugged In?" Checklist

Before deep debugging, check the basics:
- [ ] Is the service running? (`systemctl status`)
- [ ] Is the disk full? (`df -h`)
- [ ] Is memory exhausted? (`free -h`)
- [ ] Is the network up? (`ip addr`, `ping`)
- [ ] Is the firewall blocking? (`ufw status`, `iptables -L`)
- [ ] Are the logs showing an error? (`journalctl -u <service>`)
- [ ] Did a config change recently? (`ls -lt /etc/<service>/`)
- [ ] Did a package update recently? (`/var/log/dpkg.log`, `/var/log/dnf.log`)
- [ ] Is the hostname resolving? (`getent hosts <name>`)
- [ ] Is the time correct? (`date`, NTP — wrong time breaks TLS, Kerberos, cron)

## 💡 Tips & Tricks

- **Idiom**: don't reboot immediately when something breaks — rebooting destroys evidence (logs, process state, `/proc`). Gather info first: `journalctl -b -p err`, `dmesg`, `systemctl status`. Reboot is the last resort, not the first.
- **Idiom**: use `journalctl -b -1` for the previous boot's logs — when a reboot happened (crash, OOM, manual) and you want to know why. `--list-boots` shows all available boots. `-b -2` for two boots ago.
- **Idiom**: use `namei -l /path/to/file` to debug "Permission denied" — shows permissions on every component of the path. Often reveals a parent directory lacking `x` (traverse) permission, which you wouldn't see by checking just the file.
- **Idiom**: use `lsof +L1` to find deleted-but-open files eating disk space — when `df` shows full but `du` doesn't, a process is holding a large deleted file open. Restart the process (or `truncate /proc/<pid>/fd/<n>`) to free the space.
- **Idiom**: use `strace -e trace=open,openat <cmd>` to find what file a program is trying to open — reveals `ENOENT` (missing file), `EACCES` (permission denied), and the exact path it's looking for. The fastest "why can't my app find its config?" tool.
- **Idiom**: use `sudo lsof -i :PORT` to find what's using a port — when a service can't bind ("address already in use"), `lsof -i :80` shows which PID owns it. Kill it or fix the port conflict.
- **Idiom**: use the REISUB sequence (Alt+SysRq + R-E-I-S-U-B) when the system is frozen — SIGTERM processes, SIGKILL if needed, sync filesystems, remount read-only, reboot. Always `s` (sync) before `b` (reboot) to avoid data loss.
- **Debug**: use `systemctl status` as your first diagnostic — shows if the service is active, the main PID, recent log lines, and cgroup. It's a one-stop status check. Follow with `journalctl -u <service>` for full logs.
- **Debug**: use `strace -c <cmd>` to profile what a slow program is doing — counts syscalls, revealing if it's doing thousands of `stat()` calls (slow filesystem), excessive `read()` (I/O bound), etc. The summary often reveals the bottleneck immediately.
- **Debug**: boot to `rescue.target` or `emergency.target` for boot issues — at GRUB, edit the `linux` line, append `systemd.unit=rescue.target`. Gives a root shell with filesystems mounted. For worse cases, `init=/bin/bash` (no systemd at all). Always have a live USB as a last resort.

## ⚠️ Edge Cases & Gotchas

- **Rebooting destroys evidence**: logs in the kernel ring buffer (`dmesg`), process state, and `/proc` info are lost on reboot. If you need to investigate, do it *before* rebooting. At minimum, save `journalctl -b > boot.log` and `dmesg > dmesg.txt`.
- **`df` full but `du` shows free space**: a process has a large file open but deleted. The space isn't freed until the process closes the FD. Find with `lsof +L1`, fix by restarting the process or truncating via `/proc/<pid>/fd/<n>`.
- **"Permission denied" with correct permissions**: check (1) parent directory `x` permission (`namei -l`), (2) SELinux (`ausearch -m AVC`, `ls -Z`), (3) ACLs (`getfacl`), (4) immutable attribute (`lsattr`, `chattr -i`). Unix permissions are only one of four access control layers.
- **"Connection refused" vs "Connection timed out"**: "refused" = something answered and said no (port closed, or firewall REJECT). "timed out" = nothing answered (firewall DROP, network down, wrong IP). The distinction tells you where the problem is.
- **`/etc/hosts` overrides DNS**: `nsswitch.conf` says `hosts: files dns` — `/etc/hosts` is checked first. A stale entry there can override a correct DNS record, causing "DNS is right but I get the old IP." Check `/etc/hosts` when DNS changes don't take effect.
- **Time being wrong breaks everything**: TLS (cert validity), Kerberos (ticket time), cron (runs at wrong time), logs (wrong timestamps), monitoring (false alerts). Check `date` and NTP (`timedatectl status`) early in debugging.
- **`fsck` on a mounted filesystem can corrupt it**: never `fsck` a mounted ext4/xfs. Unmount first or boot from live USB. For root, it runs from initramfs at boot. `xfs_repair` refuses to run on a mounted filesystem.
- **Killing a process in `D` state doesn't work**: `kill -9` on a process in uninterruptible sleep (I/O wait) is ignored — the process exits only when the I/O completes. If the I/O never completes (stuck NFS, failing disk), only a reboot clears it.
- **`rm -rf` on a mounted filesystem can leave it busy**: removing files doesn't unmount the FS. And if a process has a file open (even deleted), the FS stays busy. `lsof +D /mnt` or `fuser -m /mnt` to find and kill the process before `umount`.
- **Package manager lock**: "Could not get lock /var/lib/dpkg/lock" means another apt is running. Don't just `rm` the lock — find the process (`ps aux | grep apt`) and wait or kill it. Removing locks while a package operation is running can corrupt the package database.
- **`chroot` isn't secure isolation**: a root process inside a `chroot` can escape (via `chroot()` itself, or device files). It's for development/recovery, not security. Use containers (namespaces) or VMs for isolation.
- **`init=/bin/bash` gives no PATH, no services**: you get a raw shell with `/` mounted read-only, no `PATH` set (use full paths: `/usr/bin/nano`), no other filesystems, no networking. Remount rw, fix, sync, reboot. Don't expect a normal environment.
- **SysRq may be disabled**: `kernel.sysrq` might be 0 (disabled) on some distros. Enable with `echo 1 | sudo tee /proc/sys/kernel/sysrq`. On some keyboards, SysRq is `Print Screen` or `Fn+Alt`. On serial consoles, it's a `break` signal.

## 🧠 Spot the Bug

A production server's `/var` filesystem is 99% full. The admin runs:

::code-wrapper{language="bash"}
```bash
sudo du -sh /var/* | sort -rh | head
```

It shows `/var/log` at 5 GB, `/var/lib` at 8 GB — total ~15 GB. But `/var` is a 50 GB partition and `df -h` shows 49 GB used. The admin deletes some old logs (`rm /var/log/*.old`), but `df -h` still shows 99% full. What's happening, and how do they fix it?

<details>
<summary>Answer</summary>

**A process has a large file open but deleted.** When a file is deleted (`rm`) while a process holds it open, the file's data isn't freed until the process closes the file descriptor — but the file no longer appears in `du` (it's removed from the directory). So `du` shows 15 GB, but `df` shows 49 GB (the deleted-but-open file's data still occupies space).

The admin's `rm /var/log/*.old` made it worse — if one of those files was open by a logging process, deleting it freed *nothing* (the process still holds it).

**Find the culprit:**

::code-wrapper{language="bash"}
```bash
sudo lsof +L1
# +L1: list files with link count < 1 (deleted but still open)
# COMMAND   PID  USER  FD  SIZE   NLINK  NAME
# nginx    1234  root  7w  35000  0      /var/log/nginx/access.log.1 (deleted)
# myapp    5678  app   3w  30000  0      /var/log/myapp.log (deleted)
```

The output shows the process (PID), the file descriptor (FD), the size (in KB — here ~35 GB and ~30 GB), and that the file is deleted (link count 0).

**Fix:**

1. **Restart the process** (it'll close the FD, freeing the space):

::code-wrapper{language="bash"}
```bash
sudo systemctl restart nginx
sudo systemctl restart myapp
```

2. **Or truncate the file via `/proc` (without restarting):**

::code-wrapper{language="bash"}
```bash
sudo truncate -s 0 /proc/1234/fd/7   # frees the space without restarting nginx
```

**Prevention:**
- Use `logrotate` with `postrotate` (restarts/reloads the app so it closes the old file and opens the new one).
- Or use `logrotate` with `copytruncate` (copies then truncates — the app keeps writing to the same FD, but the file is emptied).
- Don't `rm` a log file a process is writing to — use `truncate -s 0 file` instead (empties it without deleting, so the process keeps writing to the same inode).

**The general lesson**: when `df` and `du` disagree, a process is holding a deleted file open. `lsof +L1` finds it. Restart the process (or truncate via `/proc`) to free the space. And use `logrotate` to manage logs properly — never just `rm` active log files.
</details>