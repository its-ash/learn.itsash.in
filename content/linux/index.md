---
title: Learn Linux — From Zero to Hero
description: A comprehensive, edge-case-covering Linux curriculum. 19 chapters covering architecture, the shell, filesystem, processes, users, permissions, networking, storage, systemd, package management, kernel, security, performance, troubleshooting, and a capstone. Go from beginner to Linux power user/sysadmin.
---

# 🐧 Learn Linux — From Zero to Hero

A comprehensive, edge-case-covering Linux curriculum. Each document is self-contained and covers its concept deeply enough that a careful reader can go from beginner to Linux power user or sysadmin.

## How to Use This Course

1. **Read sequentially** for a structured path (01 → 19).
2. **Jump to a chapter** as a reference when you hit a concept in the wild.
3. **Run the examples** — a Linux VM or WSL is your lab.
4. **Practice on a real system** — break things in a VM, fix them, repeat.

## Prerequisites

- A Linux installation (bare metal, VM, or WSL2 on Windows).
- A terminal emulator (GNOME Terminal, Konsole, Alacritty, kitty).
- Curiosity about what happens under the hood.

## Curriculum

### Part I — Foundations

| # | Topic | Why It Matters |
|---|---|---|
| 01 | [Introduction & Architecture](/linux/01-introduction-and-architecture) | What Linux is, kernel vs userspace, distros, the FSSTND/FHS. |
| 02 | [The Shell & Command Line](/linux/02-shell-and-command-line) | Bash basics, pipes, redirection, job control, `coreutils`. |
| 03 | [Filesystem Hierarchy](/linux/03-filesystem-hierarchy) | `/`, `/etc`, `/var`, `/proc`, `/sys`, mount points, inodes. |
| 04 | [Files, Directories & Permissions](/linux/04-files-directories-permissions) | Ownership, modes, ACLs, `chmod`/`chown`/`umask`, special bits. |
| 05 | [Text Processing & Pipelines](/linux/05-text-processing) | `grep`, `sed`, `awk`, `cut`, `sort`, `uniq`, `tr`, `tee`, `xargs`. |

### Part II — System Core

| # | Topic | Why It Matters |
|---|---|---|
| 06 | [Processes & Jobs](/linux/06-processes-and-jobs) | `ps`, `top`, `htop`, signals, `kill`, `jobs`, `fg`/`bg`, `&`, nice. |
| 07 | [Users, Groups & Authentication](/linux/07-users-groups-auth) | `/etc/passwd`, `useradd`, `sudo`, PAM, SSH keys, `su -`. |
| 08 | [Package Management](/linux/08-package-management) | `apt`/`dpkg`, `dnf`/`rpm`, `pacman`, `zypper`, flatpak, snap. |
| 09 | [Storage & Filesystems](/linux/09-storage-and-filesystems) | Partitions, `fdisk`, `mkfs`, `mount`/`fstab`, LVM, RAID, `fsck`. |
| 10 | [Networking Fundamentals](/linux/10-networking-fundamentals) | Interfaces, `ip`, routes, DNS, `ss`, `curl`, `ssh`, `scp`, `rsync`. |

### Part III — Administration

| # | Topic | Why It Matters |
|---|---|---|
| 11 | [systemd & Services](/linux/11-systemd-and-services) | Units, `systemctl`, `journalctl`, timers, targets, drop-ins. |
| 12 | [Logging & Monitoring](/linux/12-logging-and-monitoring) | `journald`, `/var/log`, `logrotate`, `dmesg`, `sar`, `atop`. |
| 13 | [Kernel & Modules](/linux/13-kernel-and-modules) | `/proc`, `/sys`, `modprobe`, `lsmod`, `sysctl`, `uname`, DKMS. |
| 14 | [Security & Hardening](/linux/14-security-and-hardening) | UFW/firewalld, SELinux/AppArmor, fail2ban, `auditd`, capabilities. |
| 15 | [Performance & Tuning](/linux/15-performance-and-tuning) | `vmstat`, `iostat`, `perf`, `nice`/`cgroups`, OOM killer, swappiness. |

### Part IV — Production

| # | Topic | Why It Matters |
|---|---|---|
| 16 | [Boot Process & Runlevels](/linux/16-boot-process-and-runlevels) | GRUB, initramfs, `systemd` boot, targets, rescue mode. |
| 17 | [Containers & Namespaces](/linux/17-containers-and-namespaces) | cgroups, namespaces, `chroot`, `podman`/`docker`, `buildah`. |
| 18 | [Troubleshooting & Recovery](/linux/18-troubleshooting-and-recovery) | Rescue mode, `strace`, `lsof`, `dmesg`, broken boot, `fsck`. |
| 19 | [Exercises & Projects](/linux/19-exercises-and-projects) | 8 projects from a hardened web server to a capstone cluster. |

## Learning Path Suggestions

### If you're new to Linux

Read 01–04 (architecture, shell, filesystem, permissions). Practice in a VM — run each example. Then 05 (text processing — the power of the shell), 06 (processes), 07 (users). Do exercises 1–3 in chapter 19.

### If you're a developer deploying to Linux

Read 08 (package management), 10 (networking — ports, firewall), 11 (systemd — running your app as a service), 14 (security — UFW, SSH keys), 17 (containers). Do exercise 4 (hardened web server).

### If you're an aspiring sysadmin

Read 09 (storage, LVM), 11 (systemd), 12 (logging), 13 (kernel), 15 (performance), 16 (boot), 18 (troubleshooting). Do exercises 5–7 (monitoring, backup, cluster). Bookmark 18 — you'll need it at 3 AM.

### If you're preparing for LPIC/RHCSA

Read 03–12 (filesystem, permissions, processes, users, packages, storage, networking, systemd, logging). Then 13–16 (kernel, security, performance, boot). Do all exercises in 19. Focus on `systemctl`, `journalctl`, `useradd`, `fdisk`, `mkfs`, `mount`, `ip`, `ssh`, `sudo`.

## Companion Resources

- [The Linux Documentation Project](https://tldp.org) — guides, howtos, FAQs.
- [Linux man pages online](https://man7.org/linux/man-pages/) — authoritative man pages.
- [Arch Wiki](https://wiki.archlinux.org) — the best Linux reference, distro-agnostic.
- [Linux Kernel Archives](https://www.kernel.org) — kernel source, docs.
- [systemd documentation](https://www.freedesktop.org/wiki/Software/systemd/) — the init system reference.
- [explainshell.com](https://explainshell.com) — paste a command, see what each part does.
- [Linux Command](https://linuxcommand.org) — tutorials and the "Linux Cookbook".

## Tooling

::code-wrapper{language="bash"}
```bash
# Essential packages (Debian/Ubuntu):
sudo apt update && sudo apt install -y \
    htop iotop iftop tmux tree jq strace ltrace \
    net-tools dnsutils curl wget git vim

# Essential packages (RHEL/Fedora):
sudo dnf install -y htop iotop tmux tree jq strace \
    net-tools bind-utils curl wget git vim

# Useful CLI upgrades:
sudo apt install -y bat fd-find ripgrep exa   # modern replacements
# bat -> cat, fd -> find, rg -> grep, exa -> ls
```
::