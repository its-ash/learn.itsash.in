# 17 — Containers & Namespaces

Containers are a Linux-native technology for isolating processes. They use **namespaces** (isolation) and **cgroups** (resource limits) — both kernel features — to run processes that appear to have their own system, without the overhead of a full virtual machine. This chapter covers the underlying primitives, the tools (`podman`, `docker`), images, and building/running containers.

## Containers vs Virtual Machines

| Feature | Virtual Machine | Container |
|---|---|---|
| Isolation | Full (separate kernel) | Process-level (shared kernel) |
| Overhead | Heavy (GBs, seconds to start) | Light (MBs, milliseconds) |
| Boot | Full OS boot | Process start |
| Security | Strong (hardware virt) | Weaker (shared kernel) |
| Density | Few per host | Hundreds per host |
| Portability | Limited (needs same virt) | High (runs anywhere with the kernel) |

```text
┌─────────────────┐    ┌─────────────────┐
│   VM            │    │   Container     │
│ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │  Apps       │ │    │ │  Apps       │ │
│ ├─────────────┤ │    │ ├─────────────┤ │
│ │  Libraries  │ │    │ │  Libraries  │ │
│ ├─────────────┤ │    │ └─────────────┘ │
│ │  User space │ │    │ (shares host's) │
│ ├─────────────┤ │    │   kernel + OS   │
│ │  Kernel     │ │    └─────────────────┘
│ ├─────────────┤ │
│ │  Hypervisor │ │
│ └─────────────┘ │
└─────────────────┘
```

Containers share the host's kernel — each container is just a set of isolated processes. This makes them lightweight but means a kernel exploit affects all containers.

## Namespaces — The Isolation Primitives

**Namespaces** are a kernel feature that makes a process see a **separate view** of a system resource. There are 8 namespace types:

| Namespace | Isolates | Flag |
|---|---|---|
| `pid` | Process IDs (container sees its own PID 1) | `CLONE_NEWPID` |
| `net` | Network stack (interfaces, routes, ports) | `CLONE_NEWNET` |
| `mnt` | Mount points (filesystem view) | `CLONE_NEWNS` |
| `uts` | Hostname, domainname | `CLONE_NEWUTS` |
| `ipc` | IPC (System V, POSIX message queues) | `CLONE_NEWIPC` |
| `user` | UID/GID mappings (container root ≠ host root) | `CLONE_NEWUSER` |
| `cgroup` | Cgroup view | `CLONE_NEWCGROUP` |
| `time` | Clock offsets | `CLONE_NEWTIME` (5.6+) |

### Viewing Namespaces

::code-wrapper{language="bash"}
```bash
lsns                           # list all namespaces
lsns -t pid                    # PID namespaces only
lsns -t net                    # network namespaces
ls -l /proc/$$/ns/             # your process's namespaces (symlinks)
# lrwxrwxrwx ... pid -> pid:[4026531836]
# lrwxrwxrwx ... net -> net:[4026531957]
# ...
```

Each symlink points to an inode — processes in the same namespace share the same inode number.

### `unshare` — Create a Namespace

`unshare` runs a program in a new namespace:

::code-wrapper{language="bash"}
```bash
# New UTS namespace (isolated hostname)
sudo unshare -u bash
hostname mycontainer
hostname          # mycontainer (in this shell)
exit
hostname          # back to host's hostname

# New PID namespace (be PID 1)
sudo unshare -p -f bash
echo $$           # 1 (you're PID 1 in this namespace)
ps aux            # still sees host processes (needs /proc remount)
mount -t proc proc /proc
ps aux            # now only sees namespace's processes

# New network namespace
sudo unshare -n bash
ip link           # only loopback (lo)
ip addr add 10.0.0.1/24 dev lo
# (isolated network — no external access unless configured)
```

### `nsenter` — Enter a Namespace

`nsenter` runs a program in an existing namespace (useful for debugging containers):

::code-wrapper{language="bash"}
```bash
# Find a container's PID
PID=$(docker inspect -f '{{.State.Pid}}' mycontainer)
# Enter all its namespaces
sudo nsenter -t $PID -m -u -i -n -p bash
# Now you're "inside" the container's namespaces, with a full shell
```

### `chroot` — The Original Isolation

`chroot` changes the apparent root directory for a process (predates namespaces). It's isolation only for the filesystem — not PID, network, etc.:

::code-wrapper{language="bash"}
```bash
sudo chroot /var/chroot/ubuntu /bin/bash
# Now / appears to be /var/chroot/ubuntu to this shell
```

`chroot` is not secure isolation (a root process inside can escape). It's the historical ancestor of containers. Modern containers combine `chroot` (mount namespace) + all other namespaces + cgroups.

## Cgroups — Resource Limits

**cgroups** (control groups) limit and account for resources used by a group of processes. Covered in chapter 15 (via systemd). Key controllers:

| Controller | Limits |
|---|---|
| `cpu` | CPU time (quota, shares) |
| `memory` | RAM (max, high, swap max) |
| `io` | Disk I/O (weight, max bandwidth) |
| `pids` | Number of processes |
| `devices` | Device access |
| `freezer` | Freeze/thaw processes |

### cgroups v2 (Modern)

Modern distros use cgroups v2 (unified hierarchy). Check:

::code-wrapper{language="bash"}
```bash
cat /sys/fs/cgroup/cgroup.controllers    # available controllers
stat -fc %T /sys/fs/cgroup/              # cgroup2fs (v2) or tmpfs (v1)
```

### Manual cgroups v2

::code-wrapper{language="bash"}
```bash
# Create a cgroup
sudo mkdir /sys/fs/cgroup/mygroup
# Set limits
echo "max 50000 100000" | sudo tee /sys/fs/cgroup/mygroup/cpu.max   # 50% CPU
echo "536870912" | sudo tee /sys/fs/cgroup/mygroup/memory.max        # 512 MB
# Add a process
echo $$ | sudo tee /sys/fs/cgroup/mygroup/cgroup.procs
```

In practice, use systemd or container runtimes — they manage cgroups for you.

## Container Runtimes

| Runtime | Role |
|---|---|
| `runc` | Low-level (OCI runtime — actually runs the container) |
| `containerd` | High-level daemon (image management, container lifecycle) |
| `docker` | Developer tool (uses containerd + runc) |
| `podman` | Daemonless, rootless alternative to docker |
| `buildah` | Build images (without a daemon) |
| `skopeo` | Copy/inspect images (between registries) |
| `CRI-O` | Kubernetes runtime |

### Docker vs Podman

| Feature | Docker | Podman |
|---|---|---|
| Daemon | Yes (`dockerd`) | No (daemonless) |
| Root | Runs as root | Can run rootless (as regular user) |
| CLI | `docker` | `podman` (compatible: `alias docker=podman`) |
| `docker-compose` | Native | `podman-compose` (or `podman compose` via plugin) |
| systemd integration | Via unit files | `podman generate systemd` |
| Kubernetes | No | Can generate K8s YAML, run K8s YAML |

Podman is recommended for security (rootless, no daemon). Docker is more established in CI/CD.

## Images and Registries

A **container image** is a read-only filesystem snapshot (layers) + metadata. **Registries** store and serve images.

| Registry | URL | Notes |
|---|---|---|
| Docker Hub | `docker.io` | Default, largest |
| Quay | `quay.io` | Red Hat |
| GitHub Container Registry | `ghcr.io` | GitHub |
| Google | `gcr.io` | Google |
| Amazon ECR | `*.dkr.ecr.*.amazonaws.com` | AWS |
| GitLab | `registry.gitlab.com` | GitLab |

An image is referenced as `registry/repository:tag`:

- `ubuntu:24.04` → `docker.io/library/ubuntu:24.04`
- `nginx:latest` → `docker.io/library/nginx:latest`
- `quay.io/prometheus/node-exporter:v1.8.0`

**Avoid `:latest`** — it's a moving target (what you test isn't what you deploy). Pin specific tags or digests (`nginx:1.27.2` or `nginx@sha256:abc123...`).

## Running Containers

### `docker` / `podman` Basics

::code-wrapper{language="bash"}
```bash
# Pull an image
docker pull nginx:1.27

# Run a container
docker run -d --name web -p 8080:80 nginx:1.27
#  -d: detached (background)
#  --name web: name it "web"
#  -p 8080:80: map host port 8080 → container port 80
#  nginx:1.27: the image

# List running containers
docker ps
docker ps -a                    # including stopped

# Interact with a running container
docker exec -it web bash        # open a shell inside
docker logs -f web              # follow logs
docker top web                  # processes in the container
docker stats                    # resource usage (live)

# Stop / start / remove
docker stop web
docker start web
docker rm web                   # remove (must be stopped)
docker rm -f web                # force (stops + removes)

# Inspect
docker inspect web              # full config (JSON)
docker images                   # list local images
docker rmi nginx:1.27           # remove an image
```

### Key `run` Options

| Option | Effect |
|---|---|
| `-d` | Detached (background) |
| `-it` | Interactive + TTY (for shells) |
| `--name` | Name the container |
| `-p host:container` | Port mapping |
| `-v host:container` | Volume mount (bind mount) |
| `-v /data:/data` | Bind mount a host directory |
| `--mount type=bind,src=/data,dst=/data` | Explicit bind mount |
| `--mount type=volume,src=myvol,dst=/data` | Named volume |
| `--rm` | Remove when it exits |
| `-e KEY=value` | Environment variable |
| `--env-file .env` | Environment from file |
| `--network netname` | Attach to a network |
| `--user 1000:1000` | Run as this UID:GID |
| `--read-only` | Read-only root filesystem |
| `--memory 512m` | Memory limit |
| `--cpus 1.5` | CPU limit (1.5 cores) |
| `--cap-drop ALL` | Drop all Linux capabilities |
| `--cap-add NET_BIND_SERVICE` | Add a specific capability |
| `--security-opt no-new-privileges` | Prevent privilege escalation |
| `--restart unless-stopped` | Restart policy |

### Volumes — Persistent Data

Containers are ephemeral — data in the container filesystem is lost when the container is removed. Use **volumes** for persistence:

::code-wrapper{language="bash"}
```bash
# Named volume (managed by Docker)
docker volume create mydata
docker run -d -v mydata:/data nginx

# Bind mount (host directory)
docker run -d -v /home/alice/data:/data nginx
# (use absolute paths; host dir is created if missing)

# Inspect
docker volume ls
docker volume inspect mydata
docker volume rm mydata
```

### Networks

::code-wrapper{language="bash"}
```bash
docker network ls
docker network create mynet
docker run -d --network mynet --name db postgres
docker run -d --network mynet --name app myapp
# app can reach db by hostname "db" (Docker DNS)
docker network rm mynet
```

Containers on the same user-defined network can reach each other by name (Docker/Podman provides DNS).

## Building Images

### Dockerfile

A **Dockerfile** is a recipe for building an image:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
```

Build:

::code-wrapper{language="bash"}
```bash
docker build -t myapp:1.0 .
#  -t: tag
#  . : context (current dir — sent to the daemon)
docker build -t myapp:1.0 -f Dockerfile.prod .   # specific Dockerfile
```

### Dockerfile Instructions

| Instruction | Effect |
|---|---|
| `FROM image` | Base image (must be first) |
| `WORKDIR /path` | Set working directory (like `cd`) |
| `COPY src dst` | Copy files from context into the image |
| `ADD src dst` | Like COPY + supports URLs + auto-extract tarballs (prefer COPY) |
| `RUN command` | Run a command (in a new layer) |
| `ENV KEY=value` | Set env var |
| `EXPOSE port` | Document a port (doesn't publish — use `-p` at runtime) |
| `VOLUME /data` | Declare a mount point (anonymous volume by default) |
| `USER name` | Run subsequent commands as this user |
| `CMD ["exec","arg"]` | Default command (overridable) |
| `ENTRYPOINT ["exec"]` | Fixed command (CMD becomes args) |
| `HEALTHCHECK CMD ...` | Health check command |
| `ARG name=value` | Build-time variable |
| `LABEL key=value` | Metadata |

### Layer Caching

Each `RUN`, `COPY`, `ADD` creates a **layer**. Docker caches layers — if a layer's input hasn't changed, the cache is reused. Order matters for performance:

```dockerfile
# GOOD: package.json changes rarely → npm ci is cached
COPY package*.json ./
RUN npm ci
COPY . .          # source changes often, but only this layer rebuilds

# BAD: any source change invalidates the npm ci cache
COPY . .
RUN npm ci        # rebuilds every time a source file changes
```

### Multi-Stage Builds

Build in one stage, copy only the result to a smaller final image:

```dockerfile
# Build stage
FROM golang:1.22 AS builder
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -o /app server.go

# Final stage (small image, no Go toolchain)
FROM alpine:3.20
COPY --from=builder /app /app
CMD ["/app"]
```

Final image is Alpine (~5 MB) + the binary, not the full Go SDK (~800 MB).

### `.dockerignore`

Exclude files from the build context (faster builds, smaller context):

```text
# .dockerignore
.git
node_modules
*.log
.env
Dockerfile
```

## Running Containers as systemd Services

For production, run containers as systemd services (auto-restart, logging):

::code-wrapper{language="bash"}
```bash
# Podman can generate a systemd unit:
podman generate systemd --name myapp > /etc/systemd/system/myapp-container.service
sudo systemctl daemon-reload
sudo systemctl enable --now myapp-container.service
```

Or write a unit manually:

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My App Container
After=network.target

[Service]
ExecStart=/usr/bin/docker run --rm --name myapp -p 8080:80 myapp:1.0
ExecStop=/usr/bin/docker stop myapp
Restart=always
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

## Rootless Containers (Podman)

Run containers as a regular user — no root, no daemon:

::code-wrapper{language="bash"}
```bash
# As a regular user (no sudo):
podman run -d --name web -p 8080:80 nginx:1.27
podman ps
podman logs web
```

Rootless containers use **user namespaces** — the container's "root" maps to your regular UID on the host. More secure (a container escape doesn't get host root).

Setup may require:
::code-wrapper{language="bash"}
```bash
sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 alice
```

## Security Considerations

- **Don't run as root in the container**: use `USER` in the Dockerfile or `--user` at runtime.
- **Drop capabilities**: `--cap-drop ALL --cap-add NET_BIND_SERVICE` — grant only what's needed.
- **`--security-opt no-new-privileges`**: prevent the process from gaining more privileges (setuid, etc.).
- **`--read-only`**: make the root filesystem read-only (use volumes for writable paths).
- **Resource limits**: `--memory`, `--cpus`, `--pids-limit` to prevent a container from starving others.
- **Pin image digests**: `nginx@sha256:abc123...` instead of `nginx:latest` (immutable, can't be swapped).
- **Scan images for vulnerabilities**: `trivy`, `grype`, or Snyk.

## Container Orchestration (Overview)

For multi-container production: **Kubernetes** (k8s), **Docker Swarm**, **Nomad**. They handle scheduling, scaling, rolling updates, service discovery. Out of scope for this chapter — see the Kubernetes docs.

## 💡 Tips & Tricks

- **Idiom**: pin image tags (not `:latest`) — `nginx:1.27.2` or `nginx@sha256:...`. `:latest` is a moving target — what you test today isn't what you deploy tomorrow. Digests (`@sha256:...`) are immutable (can't be retagged).
- **Idiom**: use multi-stage builds to shrink images — build in a full SDK image, copy the binary to a minimal runtime image (Alpine, distroless). Reduces image size from GBs to MBs and removes build tools (attack surface) from production.
- **Idiom**: order Dockerfile instructions for cache efficiency — copy rarely-changing files (package manifests) first, run expensive commands (install deps), then copy frequently-changing source. A source change won't invalidate the dependency install cache.
- **Idiom**: use `--rm` for one-off commands — `docker run --rm alpine echo hello` removes the container immediately after it exits. Without `--rm`, stopped containers accumulate (use `docker container prune` to clean up).
- **Idiom**: use `docker exec -it` to get a shell in a running container — `docker exec -it web bash` opens a shell without restarting the container. Use `sh` instead of `bash` on Alpine (no bash by default).
- **Idiom**: use named volumes for persistent data — bind mounts (`-v /host:/container`) couple to the host path (non-portable). Named volumes (`-v myvol:/data`) are managed by the runtime and work across hosts. Use bind mounts for development (live reload), volumes for production.
- **Idiom**: use `podman` for rootless, daemonless containers — no root daemon (more secure), no `dockerd` to manage. `alias docker=podman` for compatibility. `podman generate systemd` creates a unit file for running the container as a service.
- **Debug**: use `docker logs -f` and `docker exec` to debug running containers — `logs -f` follows stdout/stderr; `exec -it ... bash` gives a shell to inspect the filesystem and processes. If bash isn't available, try `sh` or `busybox sh`.
- **Debug**: use `docker inspect` to see a container's full config — shows mounts, env vars, network, entrypoint, cmd, state, logs path. `docker inspect -f '{{.NetworkSettings.IPAddress}}' web` extracts just the IP.
- **Debug**: use `nsenter` to enter a container's namespaces directly — `nsenter -t $(docker inspect -f '{{.State.Pid}}' web) -m -u -i -n -p bash` gives a full shell even if the container has no shell (e.g., distroless). Useful for debugging minimal images.

## ⚠️ Edge Cases & Gotchas

- **Data in the container filesystem is lost when the container is removed**: `docker rm web` deletes the container's writable layer. Use volumes (`-v`) for anything you need to keep. A common surprise: database data vanishes after `docker rm`.
- **`docker run -v /data:/data` creates `/data` on the host if missing**: and it's owned by root. If the container runs as a non-root user, it can't write there. Use named volumes (runtime manages ownership) or `chown` the host directory.
- **Port conflicts**: `-p 8080:80` fails if host port 8080 is already in use. Check with `ss -tlnp | grep 8080`. Each container needs its own host port (or use a reverse proxy).
- **`ADD` vs `COPY`**: `ADD` auto-extracts tarballs and supports URLs (surprising behavior); `COPY` is simple and explicit. Prefer `COPY` — use `ADD` only when you need its features (tar extraction, URLs).
- **`CMD` vs `ENTRYPOINT`**: `CMD` is the default command (overridable: `docker run image echo hi`). `ENTRYPOINT` is the fixed command (`CMD` becomes args). `docker run image echo hi` with `ENTRYPOINT ["server"]` runs `server echo hi` (probably wrong). Use `ENTRYPOINT` for fixed-command images, `CMD` for flexible ones.
- **`docker build` sends the entire context to the daemon**: `docker build .` sends the current directory (could be GBs if `node_modules` is present). Use `.dockerignore` to exclude. The `docker build` output shows "sending build context to Docker daemon  XkB".
- **Alpine uses musl, not glibc**: binaries compiled against glibc (most prebuilt Linux binaries) won't run on Alpine without `gcompat` or a musl build. This bites people using Alpine base images with glibc-compiled binaries. Use `debian-slim` or `ubuntu` base if unsure.
- **Containers share the host kernel**: a kernel exploit affects all containers (unlike VMs with separate kernels). Don't run untrusted containers on a host with sensitive data. Use rootless containers (`podman`) or VMs for strong isolation.
- **`:latest` can change without warning**: `docker pull nginx:latest` today and tomorrow can be different versions. This breaks reproducibility. Pin to `nginx:1.27.2` or a digest (`nginx@sha256:...`) for production.
- **Root in a container is root on the host (without user namespaces)**: by default, `USER root` in a container = UID 0 on the host. If the container escapes (a vulnerability), the attacker has host root. Use `--user` or rootless podman (user namespaces map container root to a high UID on the host).
- **Layer cache can hide security updates**: `RUN apt install nginx` is cached. If a newer nginx with a security fix is in the repo, a rebuild may use the old cached layer. Use `--no-cache` for production builds, or pin versions.
- **`docker system prune` deletes unused data**: `docker system prune -a` removes all stopped containers, unused networks, dangling images, AND unused images (not just dangling). Read the prompt carefully. Use `docker image prune` (dangling only) for safer cleanup.
- **`podman` and `docker` CLI differences**: mostly compatible, but some commands differ (e.g., `podman` has no daemon, `docker context` doesn't apply). `podman-compose` isn't a full drop-in for `docker-compose` (v2 has `podman compose` via a plugin). Test before assuming compatibility.
- **Container networking defaults to bridge**: the default bridge network doesn't do DNS between containers. Create a user-defined network (`docker network create`) for name-based resolution between containers. This surprises people who expect `db` to resolve from `app`.

## 🧠 Spot the Bug

A developer builds a Node.js app image with this Dockerfile:

```dockerfile
FROM node:20
COPY . /app
WORKDIR /app
RUN npm install
EXPOSE 3000
CMD ["node", "server.js"]
```

They build, run, and it works. Later, they change one line in `server.js`, rebuild, and it takes 3 minutes (re-runs `npm install`). Why, and how do they fix it?

<details>
<summary>Answer</summary>

**The `COPY . /app` invalidated the `npm install` cache.** Docker builds in layers, and each instruction creates a layer that's cached *if its inputs haven't changed*. `COPY . /app` copies the entire context (including `server.js`) — when `server.js` changes, this layer's cache is invalidated, and **all subsequent layers** (including `RUN npm install`) are rebuilt.

So changing one line in `server.js` causes a full `npm install` rebuild — even though `package.json` (which determines the dependencies) didn't change.

**Fix — copy `package.json` first, install deps, then copy source:**

```dockerfile
FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

Now:
1. `COPY package*.json ./` — only changes when `package.json` changes (rare).
2. `RUN npm install` — cached unless `package.json` changed.
3. `COPY . .` — changes when any source file changes, but this is the *last* layer (nothing after it to rebuild).

A one-line `server.js` change now only invalidates the `COPY . .` layer — `npm install` is cached (seconds, not minutes).

**Also add a `.dockerignore`** to exclude `node_modules` (so the host's `node_modules` doesn't get copied into the image, then overwritten by `npm install`):

```text
# .dockerignore
node_modules
.git
*.log
```

The general lesson: **order Dockerfile instructions from least-frequently-changing to most-frequently-changing.** Dependencies (rarely change) first; source (often changes) last. This maximizes cache hits and minimizes rebuild time.
</details>