# 01 — Introduction & Architecture

Linux is a free, open-source, Unix-like operating system kernel. When combined with GNU userspace tools, a display server, and applications, it forms a complete **operating system** called a **Linux distribution** (or "distro").

## What Is Linux, Really?

Strictly, "Linux" is just the **kernel** — the core that manages the CPU, memory, devices, and schedules processes. What you interact with (the shell, `ls`, `grep`, `bash`) is mostly **GNU software**. Hence the term **GNU/Linux**.

### The Layers

```text
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

- **Kernel space** — privileged, full hardware access (ring 0 on x86).
- **User space** — unprivileged, goes through the kernel via **syscalls**.

## Kernel vs Userspace

Every process runs in **user space** until it needs a kernel service (read a file, allocate memory, send a packet). It then issues a **syscall** — a controlled transition into kernel mode.

::code-wrapper{language="bash"}
```bash
strace -c ls /etc >/dev/null 2>&1   # count syscalls made by ls
```
::
Output (truncated):

::code-wrapper{language="text"}
```text
% time     seconds  usecs/call     calls    errors syscall
------ ----------- ----------- --------- --------- ----------------
  0.00    0.000000           0        10           mmap
  0.00    0.000000           0         3           newfstatat
  0.00    0.000000           0         7           getdents64
  ...
```
::
Key syscalls: `openat` (open a file), `read`/`write`, `close`, `mmap` (map file into memory), `fork` (create process), `execve` (run a program), `exit` (terminate).

## Distributions (Distros)

A distro = kernel + GNU tools + package manager + init system + default apps. Hundreds exist; the major families:

| Family | Examples | Package Manager | Init |
|---|---|---|---|
| Debian | Debian, Ubuntu, Mint, Pop!_OS | `apt`/`dpkg` | systemd |
| Red Hat | RHEL, Fedora, CentOS Stream, Rocky, Alma | `dnf`/`rpm` | systemd |
| Arch | Arch, Manjaro, EndeavourOS | `pacman` | systemd |
| SUSE | openSUSE, SLES | `zypper`/`rpm` | systemd |
| Independent | Gentoo, NixOS, Alpine, Void | portage/nix/apk/xbps | systemd/OpenRC |

### Which Distro Should You Use?

- **Beginner** — Ubuntu, Linux Mint, Fedora. Easy install, large community.
- **Server** — Debian, Ubuntu LTS, RHEL/Rocky, AlmaLinux. Stability, long support.
- **Learning** — Arch Linux. You build it yourself; you understand every piece.
- **Minimal/embedded** — Alpine (5 MB), NixOS (reproducible), Void (musl).

## Check Your System

::code-wrapper{language="bash"}
```bash
uname -a            # kernel version, hostname, arch
hostnamectl         # distro, kernel, arch, hostname (systemd)
cat /etc/os-release # distro info (portable)
lsb_release -a      # Ubuntu/Debian distro details
```
::
Example output:

::code-wrapper{language="text"}
```text
$ uname -a
Linux workstation 6.8.0-31-generic #31-Ubuntu SMP PREEMPT_DYNAMIC ... x86_64 GNU/Linux

$ cat /etc/os-release
PRETTY_NAME="Ubuntu 24.04 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
ID=ubuntu
```
::
- `Linux` — kernel name.
- `6.8.0-31-generic` — kernel version (major.minor.patch-build-flavor).
- `x86_64` — CPU architecture (also `aarch64`/ARM64, `riscv64`).

## The Terminal, Shell, and Console

- **Terminal** — the window/app you type into (GNOME Terminal, Alacritty).
- **Shell** — the program that interprets commands (Bash, Zsh, Fish).
- **Console** — the physical/virtual text interface (`tty1`–`tty6`; Ctrl+Alt+F1–F6).
- **TTY** — teletypewriter; a terminal device (`/dev/tty1`, `/dev/pts/0`).

::code-wrapper{language="bash"}
```bash
tty                 # show your terminal device (/dev/pts/0)
echo $SHELL         # your default shell (/bin/bash)
ps -p $$ -o comm=   # your current shell (more reliable than $SHELL)
chsh -s /usr/bin/zsh  # change default shell
```
::

## The Filesystem Hierarchy Standard (FHS)

Linux organizes everything under a single root `/`. We cover it in depth in chapter 03; the quick map:

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
cat /dev/null           # empty — /dev/null is a "black hole"
echo "log entry" > /dev/null   # discards output
cat /proc/cpuinfo | head -5    # CPU info is a file
echo 1 > /proc/sys/net/ipv4/ip_forward  # toggle a kernel param by writing a file
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
ls -l /dev/sda /dev/null /etc /proc/cpuinfo
# brw-rw---- ... /dev/sda      (block device)
# crw-rw-rw- ... /dev/null     (character device)
# drwxr-xr-x ... /etc          (directory)
# -r--r--r-- ... /proc/cpuinfo (regular file — but virtual)
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

- **Idiom**: use `cat /etc/os-release` (not `lsb_release`) for portable distro detection — `os-release` is specified by the FHS and present on every modern distro; `lsb_release` is missing on minimal installs.
- **Idiom**: use `hostnamectl` on systemd distros — it shows distro, kernel, arch, hostname, and chassis type in one command. Falls back to `cat /etc/os-release && uname -a`.
- **Idiom**: use `command -v <name>` (not `which`) to check if a command exists — `command -v` is POSIX, built into the shell, and respects functions/aliases. `which` is an external command and misses shell functions.
- **Idiom**: bookmark `man 7 hier` — it documents the FHS in man-page form. Run `man 7 hier` for the authoritative description of what each top-level directory is for.
- **Debug**: use `strace -c <cmd>` to see which syscalls a command makes — reveals what "everything is a file" really means (`openat`, `read`, `close` on `/proc` and `/sys` paths).

## ⚠️ Edge Cases & Gotchas

- **`/bin` and `/sbin` are symlinks on modern distros**: since Debian/Ubuntu "merged /usr", `/bin → /usr/bin` and `/sbin → /usr/sbin`. Scripts hardcoding `/bin/foo` still work, but the real path is `/usr/bin/foo`. Check with `ls -ld /bin`.
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