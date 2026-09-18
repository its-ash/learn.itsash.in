# 01 — Introduction & Architecture

Linux is a monolithic kernel managing CPU, memory, devices, and process scheduling. Combined with GNU userspace tools, a display server, and applications, it forms a **Linux distribution**. This chapter covers the kernel–userspace boundary, syscall mechanics, the FHS, and the virtual filesystems that make Linux a unified system — through the lens of production code and edge-case behavior.

## The Layers

::code-wrapper{language="bash"}
```bash
┌─────────────────────────────────────┐
│          Applications               │  Firefox, nginx, your scripts
├─────────────────────────────────────┤
│     GNU Userspace (coreutils)       │  bash, ls, grep, awk, sed, gcc
├─────────────────────────────────────┤
│          System Libraries           │  glibc, systemd, PAM, NSS
├─────────────────────────────────────┤
│            Linux Kernel             │  scheduler, memory, drivers, VFS
├─────────────────────────────────────┤
│          Hardware (CPU/RAM/disk)    │
└─────────────────────────────────────┘
```
::

- **Kernel space** — privileged, full hardware access (ring 0 on x86).
- **User space** — unprivileged, goes through the kernel via **syscalls**.

## Kernel vs Userspace — The Syscall Boundary

Every process runs in **user space** until it needs a kernel service (read a file, allocate memory, send a packet). It then issues a **syscall** — a controlled transition into kernel mode via a software interrupt or `syscall` instruction.

::code-wrapper{language="bash"}
```bash
# Complex Implementation: count every syscall `ls` makes against /etc
# — reveals the true cost of "just listing a directory"
strace -c -e trace=openat,read,close,getdents64,statx ls /etc >/dev/null 2>&1
```
::

Output (truncated):

::code-wrapper{language="text"}
```text
% time     seconds  usecs/call     calls    errors syscall
------ ----------- ----------- --------- --------- ----------------
  0.00    0.000000           0        10           openat
  0.00    0.000000           0        14           newfstatat
  0.00    0.000000           0         7           getdents64
  0.00    0.000000           0        31           close
  100.00    0.000000                    62           total
```
::

Key syscalls: `openat` (open a file), `read`/`write`, `close`, `mmap` (map file into memory), `fork` (create process), `execve` (run a program), `exit` (terminate).

### Caveat & Anti-Pattern: Syscall Overhead in Hot Paths

::code-wrapper{language="bash"}
```bash
# NAIVE: 1 syscall per line — 1 million lines = 1 million syscalls
while IFS= read -r line; do
  printf '%s\n' "$line"
done < bigfile.txt
# ~10 seconds for 1M lines (syscall overhead dominates)

# PRODUCTION: batch I/O — read in chunks, process in userspace
# Use awk/sed (buffered I/O, orders of magnitude faster)
awk '{print}' bigfile.txt > /dev/null
# ~0.1 seconds for the same 1M lines — buffered read, no per-line syscall
```
::

The `read` syscall fetches one buffer at a time; the shell `read` builtin re-enters the kernel for every line. For any I/O-heavy pipeline, prefer tools that buffer (`awk`, `sed`, `grep`, `dd`).

## Distributions (Distros)

A distro = kernel + GNU tools + package manager + init system + default apps. The major families:

| Family | Examples | Package Manager | Init |
|---|---|---|---|
| Debian | Debian, Ubuntu, Mint, Pop!_OS | `apt`/`dpkg` | systemd |
| Red Hat | RHEL, Fedora, CentOS Stream, Rocky, Alma | `dnf`/`rpm` | systemd |
| Arch | Arch, Manjaro, EndeavourOS | `pacman` | systemd |
| SUSE | openSUSE, SLES | `zypper`/`rpm` | systemd |
| Independent | Gentoo, NixOS, Alpine, Void | portage/nix/apk/xbps | systemd/OpenRC |

### Which Distro Should You Use?

- **Server** — Debian, Ubuntu LTS, RHEL/Rocky, AlmaLinux. Stability, long support.
- **Learning** — Arch Linux. You build it yourself; you understand every piece.
- **Minimal/embedded** — Alpine (5 MB), NixOS (reproducible), Void (musl).

## Check Your System

::code-wrapper{language="bash"}
```bash
# Complex Implementation: portable system identification — works across all distros
# /etc/os-release is FHS-specified (always present); lsb_release is not
. /etc/os-release                    # source it (sets $NAME, $VERSION_ID, etc.)
echo "Distro: $PRETTY_NAME"
echo "Kernel: $(uname -r)"
echo "Arch:   $(uname -m)"
echo "Kernel build: $(uname -v)"

# Edge case: $SHELL is your LOGIN shell, not your CURRENT shell
# If you ran `zsh` from bash, $SHELL still says /bin/bash
ps -p $$ -o comm=                   # the actual current shell
```
::

### Edge Case: Merged `/usr` on Modern Distros

Since Debian/Ubuntu "merged /usr", `/bin` → `/usr/bin` and `/sbin` → `/usr/sbin`. Scripts hardcoding `/bin/foo` still work (symlinks), but the real path is `/usr/bin/foo`:

::code-wrapper{language="bash"}
```bash
ls -ld /bin /sbin /lib              # show the symlinks
# lrwxrwxrwx 1 root root 7 ... /bin -> usr/bin
# lrwxrwxrwx 1 root root 7 ... /sbin -> usr/sbin
# lrwxrwxrwx 1 root root 7 ... /lib -> usr/lib

# Anti-Pattern: hardcoding /bin/bash in a shebang on a non-merged distro
# If the script is copied to an Alpine container (no /bin/bash, only /bin/sh),
# it breaks. Use #!/usr/bin/env bash for portability.
```
::

## The Terminal, Shell, and Console

- **Terminal** — the window/app you type into (GNOME Terminal, Alacritty).
- **Shell** — the program that interprets commands (Bash, Zsh, Fish).
- **Console** — the physical/virtual text interface (`tty1`–`tty6`; Ctrl+Alt+F1–F6).
- **TTY** — teletypewriter; a terminal device (`/dev/tty1`, `/dev/pts/0`).

::code-wrapper{language="bash"}
```bash
# Complex Implementation: detect if we're in a TTY, a terminal emulator, or SSH
# — drives behavior in scripts (color, interactive prompts)
if [ -t 1 ]; then
  # stdout is a terminal
  if [ "$(tty)" = "not a tty" ] 2>/dev/null; then
    echo "piped/redirected"
  else
    echo "interactive: $(tty)"
  fi
else
  echo "stdout redirected (not a tty)"
fi

# Detect SSH session
[ -n "$SSH_CONNECTION" ] && echo "SSH session" || echo "local"
```
::

## The Filesystem Hierarchy Standard (FHS)

| Path | Contents |
|---|---|
| `/bin`, `/usr/bin` | User binaries (`ls`, `grep`, `bash`) |
| `/sbin`, `/usr/sbin` | System binaries (`mount`, `ip`, `systemctl`) |
| `/etc` | Configuration files (text) |
| `/home` | User home directories |
| `/root` | Root user's home (not under `/home`) |
| `/var` | Variable data (logs, mail, spool, `lib`) |
| `/tmp` | Temporary files (cleared on reboot) |
| `/proc` | Kernel/process info (virtual) |
| `/sys` | Hardware/kernel info (virtual) |
| `/dev` | Device files (`/dev/sda`, `/dev/null`) |
| `/opt` | Optional/third-party software |
| `/usr` | Read-only user data (binaries, libs, docs) |
| `/boot` | Boot loader, kernel, initramfs |

## Everything Is a File

A Unix philosophy: nearly everything is a file — regular files, directories, devices, sockets, pipes, and `/proc`/`/sys` kernel interfaces all use `open()`/`read()`/`write()`/`close()`.

::code-wrapper{language="bash"}
```bash
# Complex Implementation: toggle a kernel parameter by writing to /proc/sys
# — IP forwarding for a router/VPN/Docker host
echo 1 | sudo tee /proc/sys/net/ipv4/ip_forward     # temporary (lost on reboot)
echo "net.ipv4.ip_forward = 1" | sudo tee /etc/sysctl.d/99-ip-forward.conf  # persistent
sudo sysctl -p /etc/sysctl.d/99-ip-forward.conf     # apply without reboot

# Read CPU info as a file (kernel generates content on-the-fly)
cat /proc/cpuinfo | head -5

# /dev/null — discard sink (writes vanish, reads give EOF)
echo "noise" > /dev/null
cat /dev/null > bigfile        # truncate bigfile to 0 bytes (common idiom)
```
::

File types (the first char of `ls -l`):

| Char | Type |
|---|---|
| `-` | Regular file |
| `d` | Directory |
| `l` | Symbolic link |
| `c` | Character device (e.g., `/dev/tty`) |
| `b` | Block device (e.g., `/dev/sda`) |
| `p` | Named pipe (FIFO) |
| `s` | Socket |

::code-wrapper{language="bash"}
```bash
# Edge Case: /proc and /sys are virtual — they exist in RAM, not on disk
ls -l /dev/sda /dev/null /etc /proc/cpuinfo
# brw-rw---- ... /dev/sda      (block device)
# crw-rw-rw- ... /dev/null     (character device)
# drwxr-xr-x ... /etc          (directory)
# -r--r--r-- ... /proc/cpuinfo (regular file — but virtual, generated on read)

# Anti-Pattern: backing up /proc, /sys, /dev
# du -sh /proc reports 0 or errors — it's all in-kernel
# tar must exclude them:
# sudo tar -czf backup.tar.gz --exclude=/proc --exclude=/sys --exclude=/dev /
```
::

## Getting Help

| Command | Use |
|---|---|
| `man <cmd>` | Full manual (`man ls`, `man 5 fstab`) |
| `<cmd> --help` | Brief help (`ls --help`) |
| `tldr <cmd>` | Community examples (`tldr tar`) |
| `info <cmd>` | GNU info pages (deeper than man for GNU tools) |
| `apropos <keyword>` | Search man pages (`apropos compress`) |
| `whatis <cmd>` | One-line description (`whatis grep`) |

### Manual Sections

Man pages are grouped into sections; use `man 5 passwd` (file format) vs `man 1 passwd` (command):

| Section | Content |
|---|---|
| 1 | User commands |
| 2 | System calls |
| 3 | Library functions |
| 4 | Special files (devices) |
| 5 | File formats & config |
| 6 | Games |
| 7 | Conventions, misc |
| 8 | System administration |

::code-wrapper{language="bash"}
```bash
man 5 crontab     # the crontab FILE format, not the command
man 2 open        # the open(2) SYSCALL, not any command
man -k cron       # search for "cron" across all sections
```
::

## 💡 Tips & Tricks

- **Idiom**: use `cat /etc/os-release` (not `lsb_release`) for portable distro detection — `os-release` is FHS-specified and present on every modern distro; `lsb_release` is missing on minimal installs.
- **Idiom**: use `command -v <name>` (not `which`) to check if a command exists — `command -v` is POSIX, built into the shell, and respects functions/aliases. `which` is an external command and misses shell functions.
- **Idiom**: use `hostnamectl` on systemd distros — shows distro, kernel, arch, hostname, and chassis type in one command.
- **Performance**: `strace -c <cmd>` reveals syscall counts — if a tool makes 10,000 `stat` calls, switching to a buffered alternative (like `find -maxdepth 1`) can be 100x faster.
- **Portability**: Alpine uses musl, not glibc — binaries compiled against glibc (most prebuilt Linux binaries) won't run on Alpine without `gcompat` or a musl build. This bites Docker users pulling glibc binaries into Alpine images.

## ⚠️ Edge Cases & Gotchas

- **`/proc` and `/sys` are virtual**: they exist in RAM, not on disk. `du -sh /proc` reports 0 or errors. Don't back them up. Writing to `/proc/sys` changes live kernel state — typos can crash the system.
- **`/dev/null` is not a regular file**: it's a character device. `cp realfile /dev/null` doesn't "save" the file — it discards it. `cat /dev/null > bigfile` truncates `bigfile` to 0 bytes (a common idiom).
- **`/tmp` is cleared on reboot** (and sometimes hourly by `systemd-tmpfiles`): don't store anything you need to keep. Use `/var/tmp` for files that survive reboots (up to 30 days by default).
- **`$SHELL` is your login shell, not necessarily your current shell**: if you run `zsh` from `bash`, `$SHELL` still says `/bin/bash`. Use `ps -p $$ -o comm=` for the current shell.
- **`uname -r` vs `uname -a`**: `-r` gives only the kernel release (`6.8.0-31-generic`), which is what `apt install linux-image-$(uname -r)` expects. `-a` includes hostname, kernel name, etc.
- **Alpine uses musl, not glibc**: binaries compiled against glibc (most prebuilt Linux binaries) won't run on Alpine without `gcompat` or a musl build. This bites Docker users pulling glibc binaries into Alpine images.

## 🧠 Quick Quiz

You run `man passwd` and see the command documentation. You actually wanted the format of `/etc/passwd`. What went wrong, and how do you fix it?

<details>
<summary>Answer</summary>

`man passwd` defaults to the lowest-numbered section with a match — section 1 (user commands), the `passwd` *command*. The `/etc/passwd` *file format* is in section 5. Fix it with:

::code-wrapper{language="bash"}
```bash
man 5 passwd
```
::

This is the section-number syntax: `man <section> <name>`. When a name exists in multiple sections, always specify the section to avoid ambiguity. Other common pairs: `man 1 crontab` (command) vs `man 5 crontab` (file), `man 2 open` (syscall) vs `man 1 open` (if a command named `open` exists), `man 8 mount` (admin command) vs `man 2 mount` (syscall).
</details>