---
title: Learn Linux — Engineering Reference
description: A deep-dive, code-first Linux reference for mid-level developers moving to senior roles. 19 chapters covering architecture, the shell, filesystem, processes, users, permissions, networking, storage, systemd, package management, kernel, security, performance, troubleshooting, and a capstone — built around production patterns, edge cases, and annotated code.
---

# 🐧 Learn Linux — Engineering Reference

A deep-dive, code-first Linux curriculum for mid-level developers moving to senior roles. Each document is structured around annotated production code blocks, anti-pattern examples, edge cases, and tips — not hand-holding prose.

## How to Use This Course

1. **Read sequentially** for a structured path (01 → 19).
2. **Jump to a chapter** as a reference when you hit a concept in production.
3. **Run the examples** — a Linux VM or WSL is your lab.
4. **Break things in a VM, fix them, repeat.**

## Prerequisites

- A Linux installation (bare metal, VM, or WSL2 on Windows).
- A terminal emulator (GNOME Terminal, Konsole, Alacritty, kitty).
- Comfort with basic command-line operations.

## Curriculum

### Part I — Foundations

| # | Topic | Why It Matters |
|---|---|---|
| 01 | [Introduction & Architecture](/linux/01-introduction-and-architecture) | Kernel vs userspace, syscall mechanics, FHS, virtual filesystems. |
| 02 | [The Shell & Command Line](/linux/02-shell-and-command-line) | Redirection order, pipeline concurrency, exit codes, job control. |
| 03 | [Filesystem Hierarchy](/linux/03-filesystem-hierarchy) | `/proc`/`/sys`, inodes, mounts, `fstab`, hard links vs symlinks. |
| 04 | [Files, Directories & Permissions](/linux/04-files-directories-permissions) | Special bits, ACLs, capabilities, `umask`, setgid directories. |
| 05 | [Text Processing & Pipelines](/linux/05-text-processing) | `grep`, `sed`, `awk`, `sort`/`uniq`, `xargs -0`, pipeline gotchas. |

### Part II — System Core

| # | Topic | Why It Matters |
|---|---|---|
| 06 | [Processes & Jobs](/linux/06-processes-and-jobs) | fork/exec/wait, signals, D-state, zombies, `nice`/`ionice`. |
| 07 | [Users, Groups & Authentication](/linux/07-users-groups-auth) | UID/GID model, PAM, `sudo`, SSH keys, NSS, `-aG` footgun. |
| 08 | [Package Management](/linux/08-package-management) | `apt`/`dnf`/`pacman`/`apk`, dependency resolution, partial upgrades. |
| 09 | [Storage & Filesystems](/linux/09-storage-and-filesystems) | Partitions, LVM, RAID, `fsck`, SMART, `dd`, XFS vs ext4. |
| 10 | [Networking Fundamentals](/linux/10-networking-fundamentals) | `ip`, routing, DNS, `ss`, `curl`, SSH tunnels, `rsync`, firewalls. |

### Part III — Administration

| # | Topic | Why It Matters |
|---|---|---|
| 11 | [systemd & Services](/linux/11-systemd-and-services) | Units, drop-ins, `daemon-reload`, timers, resource limits, `journalctl`. |
| 12 | [Logging & Monitoring](/linux/12-logging-and-monitoring) | journald persistence, `logrotate`, `sar`, `atop`, `dmesg`. |
| 13 | [Kernel & Modules](/linux/13-kernel-and-modules) | `sysctl`, `modprobe`, DKMS, `initramfs`, udev, `/proc`/`/sys`. |
| 14 | [Security & Hardening](/linux/14-security-and-hardening) | UFW/firewalld, SELinux/AppArmor, fail2ban, auditd, capabilities. |
| 15 | [Performance & Tuning](/linux/15-performance-and-tuning) | `vmstat`, `iostat`, `perf`, OOM killer, swappiness, cgroups, BBR. |

### Part IV — Production

| # | Topic | Why It Matters |
|---|---|---|
| 16 | [Boot Process & Runlevels](/linux/16-boot-process-and-runlevels) | GRUB, initramfs, systemd boot, targets, rescue mode, password reset. |
| 17 | [Containers & Namespaces](/linux/17-containers-and-namespaces) | Namespaces, cgroups, Docker/Podman, multi-stage builds, rootless. |
| 18 | [Troubleshooting & Recovery](/linux/18-troubleshooting-and-recovery) | `strace`, `lsof`, REISUB, chroot, boot recovery, `fsck`. |
| 19 | [Exercises & Projects](/linux/19-exercises-and-projects) | 8 projects from a hardened web server to a capstone cluster. |

## Learning Path Suggestions

### If you're a developer deploying to Linux

Read 08 (package management), 10 (networking — ports, firewall), 11 (systemd — running your app as a service), 14 (security — UFW, SSH keys), 17 (containers). Do exercise 4 (hardened web server).

### If you're an aspiring sysadmin

Read 09 (storage, LVM), 11 (systemd), 12 (logging), 13 (kernel), 15 (performance), 16 (boot), 18 (troubleshooting). Do exercises 5–7 (monitoring, backup, cluster). Bookmark 18 — you'll need it at 3 AM.

### If you're preparing for LPIC/RHCSA

Read 03–12 (filesystem, permissions, processes, users, packages, storage, networking, systemd, logging). Then 13–16 (kernel, security, performance, boot). Do all exercises in 19.

## Companion Resources

- [Arch Wiki](https://wiki.archlinux.org) — the best Linux reference, distro-agnostic.
- [Linux man pages online](https://man7.org/linux/man-pages/) — authoritative man pages.
- [systemd documentation](https://www.freedesktop.org/wiki/Software/systemd/) — the init system reference.
- [Linux Kernel Archives](https://www.kernel.org) — kernel source, docs.
- [explainshell.com](https://explainshell.com) — paste a command, see what each part does.

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
```
::