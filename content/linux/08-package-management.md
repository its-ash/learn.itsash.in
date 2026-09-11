# 08 — Package Management

Linux distributions install, update, and remove software via **package managers**. A package is an archive (files + metadata) that the manager installs into the system's standard directories. This chapter covers the major families (`apt`/`dpkg`, `dnf`/`rpm`, `pacman`, `zypper`, `apk`), universal formats, and the pitfalls that break production systems.

## The Two Layers

Every family has a **low-level** tool (works with individual packages, no dependency resolution) and a **high-level** tool (resolves dependencies, downloads from repositories):

| Family | Low-Level | High-Level | Package Format |
|---|---|---|---|
| Debian/Ubuntu | `dpkg` | `apt` | `.deb` |
| RHEL/Fedora/Rocky | `rpm` | `dnf` | `.rpm` |
| Arch/Manjaro | `pacman` | `pacman` | `.pkg.tar.zst` |
| Alpine | `apk` | `apk` | `.apk` |

Use the high-level tool for normal operations. Drop to the low-level only for inspecting or repairing.

## Debian/Ubuntu — `apt` and `dpkg`

::code-wrapper{language="bash"}
```bash
# Complex Implementation: full system update + cleanup in production
sudo apt update                  # refresh package index from repos
sudo apt full-upgrade             # upgrade + remove/add packages if needed
sudo apt autoremove --purge       # remove unneeded deps + their config

# Install a specific version:
sudo apt install nginx=1.24.0-*

# Find which package owns a file:
dpkg -S /usr/bin/curl

# List files installed by a package:
dpkg -L nginx

# Fix interrupted installs:
sudo dpkg --configure -a
sudo apt --fix-broken install

# Hold a package (prevent upgrade):
sudo apt-mark hold nginx
apt-mark showhold
sudo apt-mark unhold nginx
```
::

### Caveat & Anti-Pattern: `apt upgrade` vs `full-upgrade`

::code-wrapper{language="bash"}
```bash
# NAIVE: apt upgrade holds back packages with changed dependencies
# — kernel updates sometimes "don't happen" with plain upgrade
sudo apt upgrade

# PRODUCTION: full-upgrade can remove/add packages to resolve dependencies
# — needed for kernel updates and major version bumps
sudo apt full-upgrade
```
::

## RHEL/Fedora/Rocky — `dnf` and `rpm`

::code-wrapper{language="bash"}
```bash
sudo dnf install nginx             # install
sudo dnf upgrade                   # upgrade all
dnf provides /usr/bin/curl         # which package provides a file
dnf repoquery --requires nginx     # dependencies
dnf repoquery --whatrequires libcurl  # reverse deps
rpm -qa                           # all installed packages
rpm -qf /usr/bin/curl             # which package owns this file?
rpm -V nginx                       # verify (check file changes against manifest)
```
::

## Arch Linux — `pacman`

::code-wrapper{language="bash"}
```bash
sudo pacman -Syu                  # sync repos + upgrade everything (ALWAYS together!)
sudo pacman -S nginx              # install
sudo pacman -Rs nginx             # remove + unneeded deps
pacman -Qdt                       # orphaned packages (deps no longer needed)
```
::

### Edge Case: Partial Upgrades Break Arch

::code-wrapper{language="bash"}
```bash
# NAIVE: sync index without upgrading (partial upgrade)
sudo pacman -Sy nginx
# The new nginx is built against NEWER libraries than you have → broken

# PRODUCTION: always full-upgrade first (or in one command)
sudo pacman -Syu
sudo pacman -Syu nginx            # sync + upgrade + install in one

# If already broken (missing .so files):
sudo pacman -Syu                  # finish the partial upgrade
```
::

On rolling-release distros: **never partial-upgrade.** On point-release distros (Debian, Ubuntu, Fedora), this isn't an issue because versions are pinned per release.

## Alpine — `apk`

::code-wrapper{language="bash"}
```bash
# Complex Implementation: Docker-optimized install (no cache = smaller image)
sudo apk add --no-cache nginx
apk info -L nginx                  # files installed
apk info --who-owns /usr/bin/curl  # who owns this file?
```
::

### Edge Case: Alpine Uses musl, Not glibc

::code-wrapper{language="bash"}
```bash
# Prebuilt binaries compiled against glibc (most Linux software) won't run on Alpine
# Error: "Error loading shared library ld-linux-x86-64.so.2: No such file or directory"
# Fix: install gcompat (glibc compatibility layer) or use a musl build
sudo apk add gcompat
# Or use debian-slim/ubuntu as the base image instead of Alpine
```
::

## Universal Package Formats

| Format | Sandbox | Auto-update | Store | Desktop | Server |
|---|---|---|---|---|---|
| Native (apt/dnf) | No | Via package manager | Distro repos | ✅ | ✅ |
| Flatpak | Yes | Yes | Flathub | ✅ | No |
| Snap | Yes | Yes | Snap Store | ✅ | ✅ |
| AppImage | No | No | Manual | ✅ | No |

### Caveat: Snap Auto-Updates Can Break Things

::code-wrapper{language="bash"}
```bash
# Snaps update automatically — you can't easily pin a version
# If a snap's new version has a bug, it breaks your workflow with no easy rollback
snap refresh --hold               # hold updates (recent snapd)
# Or avoid snaps for critical tools — use native packages
```
::

## Verifying Packages

::code-wrapper{language="bash"}
```bash
# RPM file integrity check
rpm -V nginx               # check all files against the package manifest
# Output codes: S=size, M=mode, 5=md5, L=symlink, D=device, U=user, G=group, T=mtime
# . = ok
# If a config file was edited, you'll see "5" for it (expected)
```
::

## 💡 Tips & Tricks

- **Idiom**: use `apt full-upgrade` (not `apt upgrade`) on Debian/Ubuntu — `full-upgrade` can remove/add packages to resolve dependencies (needed for kernel updates).
- **Idiom**: run `sudo apt autoremove --purge` periodically — after removing packages, their dependencies linger. `autoremove --purge` cleans them and their config.
- **Idiom**: use `dpkg -S` / `rpm -qf` / `pacman -Qo` to find which package owns a file — essential when a file is broken and you want to reinstall its package.
- **Idiom**: use `apt-mark hold` / `dnf versionlock` to pin a version — if an upgrade would break a critical package, hold it. Just don't forget you held it.
- **Idiom**: on Arch, always `pacman -Syu` (never `-Sy` alone) — partial upgrades break the system.
- **Debug**: use `apt depends <pkg>` / `dnf repoquery --requires` to trace dependency chains.
- **Debug**: use `dpkg --configure -a` to fix a broken apt state — if `apt install` is interrupted, the package manager is left half-configured.

## ⚠️ Edge Cases & Gotchas

- **`dpkg -i package.deb` doesn't resolve dependencies**: it installs only that file. If deps are missing, it fails. Use `sudo apt install ./package.deb` (note the `./`) or `sudo apt-get install -f` after.
- **`rpm -ivh` vs `-Uvh`**: `-i` installs (fails if already installed). `-U` upgrades (installs if not present, upgrades if present). For updates, use `-U`.
- **Third-party repos can conflict**: adding Docker's repo and a distro's docker.io package can cause version conflicts. Pick one source and stick with it.
- **`apt autoremove` can remove things you need**: if you installed a package manually then removed the thing that depended on it, `autoremove` might remove the manual package if it was marked as auto-installed. Review the list before confirming.
- **PPAs and third-party repos don't get security updates automatically**: if a PPA is abandoned, you get no updates. Remove unused repos.
- **Holding a package too long causes dependency hell**: `apt-mark hold nginx` keeps nginx at 1.24, but other packages move to 1.26 APIs. Eventually `apt upgrade` fails with broken deps.
- **Alpine uses musl, not glibc**: prebuilt binaries built against glibc won't run on Alpine. This is the #1 Docker Alpine gotcha.
- **Removing a package doesn't always stop its service**: `apt remove nginx` may leave the service running until reboot. Stop it first: `sudo systemctl stop nginx && sudo apt remove nginx`.

## 🧠 Spot the Bug

On an Arch system, a user installs a package:

::code-wrapper{language="bash"}
```bash
sudo pacman -S firefox
```
::

Then a few days later, they run `sudo pacman -Syu` and get errors about missing shared libraries (`.so` not found) for several programs. What happened?

<details>
<summary>Answer</summary>

On Arch (rolling release), the system must be **fully upgraded** before installing new packages. The user ran `pacman -S firefox` **without** `-Syu` first. This installed a `firefox` built against the *latest* libraries, while their installed packages (glibc, etc.) were still at older versions.

When they later ran `pacman -Syu`, the upgrade tried to update libraries, but the mismatched state caused failures.

**Fix — always full-upgrade first:**

::code-wrapper{language="bash"}
```bash
sudo pacman -Syu          # sync + upgrade ALL packages, always together
sudo pacman -S firefox    # now safe (system is consistent)
# Or in one command:
sudo pacman -Syu firefox
```
::

**If already broken** (missing `.so` files), boot to a fallback initramfs or chroot from a live USB and complete the upgrade:

::code-wrapper{language="bash"}
```bash
sudo pacman -Syu          # finish the partial upgrade
```
::

The rule on rolling-release distros: **never partial-upgrade.**
</details>