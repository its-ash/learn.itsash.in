# 08 — Package Management

Linux distributions install, update, and remove software via **package managers**. A package is an archive (files + metadata) that the manager installs into the system's standard directories. This chapter covers the major families (`apt`/`dpkg`, `dnf`/`rpm`, `pacman`, `zypper`), the universal formats (flatpak, snap, AppImage), and the common pitfalls.

## Why Package Managers?

Before package managers, you'd download source, `./configure && make && make install`, and manually track files (uninstall was nearly impossible). Package managers solve:

- **Installation** — one command, files go to the right places.
- **Dependencies** — "nginx needs libc 2.31+" — the manager installs them automatically.
- **Updates** — `upgrade` pulls new versions with dependency resolution.
- **Verification** — packages are signed; the manager checks signatures.
- **Inventory** — what's installed? What version? What files?
- **Removal** — clean uninstall, including dependencies no longer needed.

## The Two Layers

Every family has a **low-level** tool (works with individual packages, no dependency resolution) and a **high-level** tool (resolves dependencies, downloads from repositories):

| Family | Low-Level | High-Level | Package Format |
|---|---|---|---|
| Debian/Ubuntu | `dpkg` | `apt` (or `apt-get`) | `.deb` |
| RHEL/Fedora/Rocky | `rpm` | `dnf` (or `yum`) | `.rpm` |
| SUSE/openSUSE | `rpm` | `zypper` | `.rpm` |
| Arch/Manjaro | `pacman` (both) | `pacman` | `.pkg.tar.zst` |
| Alpine | `apk` (both) | `apk` | `.apk` |
| Gentoo | — | `emerge` (source) | ebuild |
| NixOS | — | `nix` | nix derivation |

Use the high-level tool for normal operations. Drop to the low-level only for inspecting or repairing.

## Debian/Ubuntu — `apt` and `dpkg`

### `apt` (High-Level)

`apt` is the modern frontend (since Ubuntu 16.04 / Debian 8). `apt-get`/`apt-cache` are the older, scriptable commands.

::code-wrapper{language="bash"}
```bash
sudo apt update                  # refresh package index from repos
sudo apt upgrade                 # upgrade all installed packages
sudo apt full-upgrade            # upgrade + remove/add packages if needed
sudo apt install nginx           # install a package
sudo apt install -y nginx        # no prompt
sudo apt install nginx=1.24.0-*  # specific version
sudo apt install --reinstall nginx  # reinstall
sudo apt remove nginx            # remove (keep config)
sudo apt purge nginx             # remove + config files
sudo apt autoremove              # remove unneeded dependencies
sudo apt autoremove --purge      # ... + their config
apt search nginx                 # search repos
apt show nginx                   # package details
apt list --installed             # all installed packages
apt list --upgradable            # packages with updates available
apt depends nginx                # show dependencies
apt rdepends libssl3             # what depends on libssl3
sudo apt edit-sources            # edit /etc/apt/sources.list safely
``
::

### `dpkg` (Low-Level)

::code-wrapper{language="bash"}
```bash
dpkg -l                          # list all installed packages
dpkg -l nginx                    # is nginx installed? what version?
dpkg -L nginx                    # files installed by nginx
dpkg -S /usr/bin/curl            # which package owns this file?
dpkg -i package.deb              # install a .deb file (no deps!)
dpkg -r nginx                    # remove (keep config)
dpkg -P nginx                    # purge (remove config)
dpkg --configure -a              # fix interrupted installs
dpkg --get-selections > pkgs.txt # export installed list
dpkg --set-selections < pkgs.txt # import (then apt-get dselect-upgrade)
``
::

### Repositories: `/etc/apt/sources.list` and `/etc/apt/sources.list.d/`

::code-wrapper{language="bash"}
```bash
cat /etc/apt/sources.list
# deb http://archive.ubuntu.com/ubuntu jammy main restricted universe multiverse
# deb http://archive.ubuntu.com/ubuntu jammy-updates main restricted ...
# deb http://archive.ubuntu.com/ubuntu jammy-security main restricted ...
# deb-src http://archive.ubuntu.com/ubuntu jammy main   ← source packages

ls /etc/apt/sources.list.d/
# docker.list  nodesource.list  google-chrome.list
``
::

Format: `deb URL distribution components`
- **deb** — binary packages. `deb-src` — source packages.
- **URL** — repository mirror.
- **distribution** — `jammy`, `bookworm`, `stable`, `focal-security`.
- **components** — `main` (free, official), `universe` (community), `restricted` (non-free drivers), `multiverse` (non-free software).

Add a third-party repo (two ways):

::code-wrapper{language="bash"}
```bash
# 1. add-apt-repository (auto-imports GPG key)
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt update

# 2. Manual (modern deb822 format)
sudo install -m 644 docker.list /etc/apt/sources.list.d/
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo apt update
``
::

### PPAs (Personal Package Archives)

Ubuntu-specific — user-contributed repos on Launchpad. Useful for newer software, but **trust is a concern** (anyone can publish). Prefer official repos or PPAs from trusted maintainers (e.g., `ppa:deadsnails/ppa` for Python).

### Holding Packages

Prevent a package from being upgraded (e.g., a version you need to keep):

::code-wrapper{language="bash"}
```bash
sudo apt-mark hold nginx
apt-mark showhold
sudo apt-mark unhold nginx
``
::

## RHEL/Fedora/Rocky — `dnf` and `rpm`

### `dnf` (High-Level)

`dnf` replaced `yum` (Fedora 22+, RHEL 8+). `yum` is a symlink to `dnf` on modern systems.

::code-wrapper{language="bash"}
```bash
sudo dnf check-update              # see what's upgradable
sudo dnf upgrade                   # upgrade all packages
sudo dnf install nginx             # install
sudo dnf install -y nginx          # no prompt
sudo dnf reinstall nginx           # reinstall
sudo dnf remove nginx              # remove
sudo dnf autoremove                # remove unneeded deps
dnf search nginx                   # search
dnf info nginx                     # details
dnf list installed                 # all installed
dnf list available                 # all available
dnf provides /usr/bin/curl         # which package provides a file
dnf repoquery --requires nginx     # dependencies
dnf repoquery --whatrequires libcurl  # reverse deps
sudo dnf module list               # AppStream modules
sudo dnf module enable nginx:1.24  # enable a module stream
``
::

### `rpm` (Low-Level)

::code-wrapper{language="bash"}
```bash
rpm -qa                           # all installed packages
rpm -q nginx                      # is nginx installed?
rpm -qi nginx                     # info
rpm -ql nginx                     # files installed
rpm -qc nginx                     # config files
rpm -qf /usr/bin/curl             # which package owns this file?
rpm -qR nginx                     # dependencies
rpm -q --whatrequires libcurl     # reverse deps
rpm -ivh package.rpm              # install (i), verbose (v), hash (h)
rpm -Uvh package.rpm              # upgrade
rpm -e nginx                      # erase (remove)
rpm -qa --last                    # recently installed first
rpm -V nginx                      # verify (check file changes)
``
::

### Repositories: `/etc/yum.repos.d/`

::code-wrapper{language="bash"}
```bash
ls /etc/yum.repos.d/
# rocky.repo  epel.repo  docker-ce.repo
cat /etc/yum.repos.d/epel.repo
# [epel]
# name=Extra Packages for Enterprise Linux
# baseurl=https://download.fedoraproject.org/pub/epel/9/Everything/$basearch
# enabled=1
# gpgcheck=1
# gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-EPEL-9
``
::

- **EPEL** (Extra Packages for Enterprise Linux) — the most common add-on repo for RHEL/Rocky/Alma (community packages not in base RHEL).
- Enable with `sudo dnf install epel-release`.

### DNF Modules (AppStream)

RHEL 8+ uses modules — multiple versions of a package available simultaneously:

::code-wrapper{language="bash"}
```bash
dnf module list                   # available modules
sudo dnf module enable nodejs:18  # enable Node.js 18 stream
sudo dnf install nodejs           # installs from the enabled stream
sudo dnf module reset nodejs      # reset to default
``
::

## Arch Linux — `pacman`

Arch is rolling-release; `pacman` is both low and high level:

::code-wrapper{language="bash"}
```bash
sudo pacman -Syu                  # sync repos + upgrade everything (always together!)
sudo pacman -S nginx              # install
sudo pacman -S nginx --noconfirm  # no prompt
sudo pacman -Syu nginx            # sync + upgrade + install nginx
sudo pacman -R nginx              # remove (keep deps)
sudo pacman -Rs nginx             # remove + unneeded deps
sudo pacman -Rns nginx            # remove + deps + config (-n no config save)
pacman -Ss nginx                  # search
pacman -Si nginx                  # info (from repo)
pacman -Q nginx                   # is it installed? version?
pacman -Qi nginx                  # info (installed)
pacman -Ql nginx                  # files installed
pacman -Qo /usr/bin/curl          # who owns this file?
pacman -Qdt                       # orphaned packages (deps no longer needed)
pacman -Qe                        # explicitly installed (not as a dep)
pactree nginx                     # dependency tree
``
::

### The AUR (Arch User Repository)

Community-submitted build scripts (`PKGBUILD`s). Not official — build from source via helpers like `yay` or `paru`:

::code-wrapper{language="bash"}
```bash
yay -S google-chrome              # install from AUR (downloads, builds, installs)
yay -Sua                          # upgrade AUR packages
``
::

### Arch Pacman Gotcha: `pacman -Sy <pkg>` Can Break the System

On Arch, **always** run `pacman -Syu` (sync + upgrade) before installing. Running `pacman -Sy nginx` (sync without upgrade) updates the repo index but not your installed packages — then installs `nginx` built against newer libraries than you have. This causes "partial upgrade" breakage. Rule: never partial-upgrade on a rolling-release distro.

## openSUSE — `zypper`

::code-wrapper{language="bash"}
```bash
sudo zypper refresh                # update repo index
sudo zypper update                 # upgrade all
sudo zypper install nginx          # install
sudo zypper remove nginx           # remove
zypper search nginx                # search
zypper info nginx                  # info
zypper packages --installed        # installed
zypper se --provides /usr/bin/curl # who provides this file?
sudo zypper ar URL alias           # add repo
zypper lr                          # list repos
sudo zypper rr alias               # remove repo
``
::

## Alpine — `apk`

Tiny, fast, used in containers:

::code-wrapper{language="bash"}
```bash
sudo apk update                    # refresh index
sudo apk upgrade                   # upgrade all
sudo apk add nginx                 # install
sudo apk add --no-cache nginx      # don't cache index (Docker)
sudo apk del nginx                 # remove
apk search nginx                   # search
apk info                           # installed packages
apk info -L nginx                  # files installed
apk info -e nginx                  # installed version
apk info --who-owns /usr/bin/curl  # who owns this file?
``
::

## Universal Package Formats

These work across distros, bundling dependencies:

### Flatpak

Desktop apps, sandboxed, from Flathub:

::code-wrapper{language="bash"}
```bash
sudo apt install flatpak
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
flatpak install flathub com.spotify.Client
flatpak run com.spotify.Client
flatpak list
flatpak update
flatpak uninstall com.spotify.Client
``
::

### Snap

Canonical's format (Ubuntu-first, works elsewhere):

::code-wrapper{language="bash"}
```bash
sudo snap install code --classic    # --classic = less sandboxing (IDEs)
sudo snap remove code
snap list
snap refresh
snap services
``
::

### AppImage

Single-file, portable, no install:

::code-wrapper{language="bash"}
```bash
chmod +x app.AppImage
./app.AppImage
``
::

### Comparison

| Format | Sandbox | Auto-update | Store | Desktop | Server |
|---|---|---|---|---|---|
| Native (apt/dnf) | No | Via package manager | Distro repos | ✅ | ✅ |
| Flatpak | Yes | Yes | Flathub | ✅ | No |
| Snap | Yes | Yes | Snap Store | ✅ | ✅ |
| AppImage | No | No | Manual | ✅ | No |
| Docker/Podman | Yes | Manual | Registries | N/A | ✅ |

## Verifying Packages

### GPG Signatures

Packages are signed by the distro's GPG key. The manager verifies automatically. If verification fails, you get an error (don't override it unless you understand the risk):

::code-wrapper{language="bash"}
```bash
# Debian
apt-key list               # imported keys (deprecated, use /etc/apt/keyrings/)
# RHEL
rpm --checksig package.rpm
rpm -qa gpg-pubkey         # imported keys
# Arch
pacman-key --list-keys
``
::

### File Integrity (RPM)

::code-wrapper{language="bash"}
```bash
rpm -V nginx               # check all files against the package manifest
# Output codes: S=size, M=mode, 5=md5, L=symlink, D=device, U=user, G=group, T=mtime
# . = ok
# If a config file was edited, you'll see "5" for it (expected)
``
::

## Managing Services After Install

Most packages that are daemons also install a **systemd unit** and start the service automatically (Debian/Ubuntu). On RHEL, they may not auto-start. See chapter 11:

::code-wrapper{language="bash"}
```bash
sudo systemctl enable --now nginx   # enable (boot) + start (now)
sudo systemctl status nginx
``
::

## 💡 Tips & Tricks

- **Idiom**: use `apt full-upgrade` (not `apt upgrade`) on Debian/Ubuntu — `full-upgrade` can remove/add packages to resolve dependencies (needed for kernel updates), while `upgrade` holds back packages with changed deps. On RHEL, `dnf upgrade` does this by default.
- **Idiom**: run `sudo apt autoremove --purge` periodically — after removing packages, their dependencies linger. `autoremove --purge` cleans them and their config. Safe and frees space.
- **Idiom**: use `dpkg -S` / `rpm -qf` / `pacman -Qo` to find which package owns a file — essential when a file is broken and you want to reinstall its package: `sudo apt install --reinstall $(dpkg -S /usr/bin/curl | cut -d: -f1)`.
- **Idiom**: use `apt-mark hold` / `dnf versionlock` to pin a version — if an upgrade would break a critical package (custom kernel, specific nginx), hold it: `sudo apt-mark hold nginx`. It stays until `unhold`. Just don't forget you held it.
- **Idiom**: use `apt list --upgradable` / `dnf check-update` before upgrading — see what will change, especially if you hold packages. Surprises during upgrades are bad.
- **Idiom**: on Arch, always `pacman -Syu` (never `-Sy` alone) — partial upgrades break the system (library version mismatches). If you only want to install a package, `pacman -Syu nginx` (full upgrade + install in one).
- **Debug**: use `apt depends <pkg>` / `dnf repoquery --requires` to trace dependency chains — reveals why installing X pulls in Y. Use `apt rdepends` / `dnf repoquery --whatrequires` to see what would break if you removed Y.
- **Debug**: use `dpkg --configure -a` to fix a broken apt state — if `apt install` is interrupted (Ctrl+C, network drop), the package manager is left half-configured. `dpkg --configure -a` resumes.

## ⚠️ Edge Cases & Gotchas

- **`apt upgrade` can hold back packages**: if a new version has new dependencies, `upgrade` leaves it untouched (to avoid removing anything). Use `full-upgrade` to let it install/remove. This is why kernel updates sometimes "don't happen" with plain `upgrade`.
- **`dpkg -i package.deb` doesn't resolve dependencies**: it installs only that file. If deps are missing, it fails with "dependency problems." Use `sudo apt install ./package.deb` (note the `./`) or `sudo apt-get install -f` after `dpkg -i` to fix.
- **`rpm -ivh` vs `-Uvh`**: `-i` installs (fails if already installed). `-U` upgrades (installs if not present, upgrades if present). For updates, use `-U`. For installing a second version alongside, use `-i` (rare).
- **Third-party repos can conflict**: adding Docker's repo and a distro's docker.io package can cause version conflicts. Pick one source and stick with it. Remove the other: `sudo apt remove docker docker-engine docker.io` before installing docker-ce.
- **`apt autoremove` can remove things you need**: if you installed a package manually then removed the thing that depended on it, `autoremove` might remove the manual package if it was marked as auto-installed. Review the list before confirming.
- **PPAs and third-party repos don't get security updates automatically**: if a PPA is abandoned, you get no updates (and possibly no security fixes). Prefer official repos or well-maintained PPAs. Remove unused repos: `sudo add-apt-repository --remove ppa:name/ppa`.
- **Holding a package too long causes dependency hell**: `apt-mark hold nginx` keeps nginx at 1.24, but other packages move to 1.26 APIs. Eventually `apt upgrade` fails with broken deps. Hold only short-term, and plan to unblock.
- **Snap auto-updates can break things**: snaps update automatically (you can't easily pin a version). If a snap's new version has a bug, it breaks your workflow with no easy rollback. `snap refresh --hold` (recent snapd) or avoid snaps for critical tools.
- **Flatpaks are large**: each app bundles its dependencies, so disk usage is high (hundreds of MB per app). `flatpak uninstall --unused` cleans unused runtimes.
- **Removing a package doesn't always stop its service**: `apt remove nginx` may leave the service running until reboot. Stop it first: `sudo systemctl stop nginx && sudo apt remove nginx`.
- **`/etc/apt/sources.list` vs `/etc/apt/sources.list.d/`**: older guides edit `sources.list` directly; modern convention is to add `.list` files in `sources.list.d/` (easier to manage, one per source). Mixing both works but is confusing.
- **Alpine uses musl, not glibc**: prebuilt binaries built against glibc (most Linux software) won't run on Alpine. Use Alpine packages (`apk add`) or musl-compatible builds. This is the #1 Docker Alpine gotcha.

## 🧠 Spot the Bug

On an Arch system, a user installs a package:

::code-wrapper{language="bash"}
```bash
sudo pacman -S firefox
```
::

Then a few days later, they run `sudo pacman -Syu` and get errors about missing shared libraries (`.so` not found) for several programs, including ones they didn't upgrade. What happened?

<details>
<summary>Answer</summary>

On Arch (rolling release), the system must be **fully upgraded** before installing new packages. The user ran `pacman -S firefox` **without** `-Syu` first. This installed a `firefox` built against the *latest* libraries, while their installed packages (glibc, etc.) were still at older versions (the repo index was stale or they hadn't upgraded).

When they later ran `pacman -Syu`, the upgrade tried to update libraries, but the mismatched state (firefox needs newer libs than what's installed) caused failures — or the upgrade itself broke because pacman couldn't resolve the partially-upgraded state.

**Fix — always full-upgrade first:**

::code-wrapper{language="bash"}
```bash
sudo pacman -Syu          # sync index + upgrade ALL packages, always together
# Then install:
sudo pacman -S firefox    # now safe (system is consistent)

# Or in one command:
sudo pacman -Syu firefox  # sync + upgrade + install
```
::

**If already broken** (missing `.so` files), boot to a fallback initramfs or chroot from a live USB and complete the upgrade:

::code-wrapper{language="bash"}
```bash
sudo pacman -Syu          # finish the partial upgrade
``
::

The rule on rolling-release distros: **never partial-upgrade.** `pacman -Sy <pkg>` (sync without upgrade) updates the index but not your packages, so the new `<pkg>` is built against newer libs than you have. Always `pacman -Syu`. On point-release distros (Debian, Ubuntu, Fedora), this isn't an issue because versions are pinned per release.
</details>