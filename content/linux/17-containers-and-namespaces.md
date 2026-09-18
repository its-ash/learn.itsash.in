# 17 — Containers & Namespaces

Containers are a Linux-native technology for isolating processes. They use **namespaces** (isolation) and **cgroups** (resource limits) — both kernel features — to run processes that appear to have their own system, without the overhead of a full virtual machine. This chapter covers the underlying primitives, tools (`podman`, `docker`), images, and security.

## Containers vs Virtual Machines

| Feature | Virtual Machine | Container |
|---|---|---|
| Isolation | Full (separate kernel) | Process-level (shared kernel) |
| Overhead | Heavy (GBs, seconds to start) | Light (MBs, milliseconds) |
| Security | Strong (hardware virt) | Weaker (shared kernel) |
| Density | Few per host | Hundreds per host |

Containers share the host's kernel — each container is just a set of isolated processes. This makes them lightweight but means a kernel exploit affects all containers.

## Namespaces — The Isolation Primitives

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

### `unshare` — Create a Namespace

::code-wrapper{language="bash"}
```bash
# Complex Implementation: create a minimal "container" with unshare
sudo unshare -p -f -m -u -n bash
# -p: new PID namespace (be PID 1)
# -f: fork (needed for PID namespace)
# -m: new mount namespace
# -u: new UTS namespace (hostname)
# -n: new network namespace

echo $$           # 1 (you're PID 1 in this namespace)
hostname mycontainer
mount -t proc proc /proc    # remount /proc to see only this namespace's processes
ps aux            # only sees this namespace's processes
ip link           # only loopback (isolated network)
```
::

### `nsenter` — Enter a Namespace (Debugging)

::code-wrapper{language="bash"}
```bash
# Complex Implementation: debug a distroless container (no shell inside)
# — enter its namespaces from the host
PID=$(docker inspect -f '{{.State.Pid}}' mycontainer)
sudo nsenter -t $PID -m -u -i -n -p bash
# Now you're "inside" the container's namespaces, with a full shell
# (even if the container has no shell — you brought bash from the host)
```
::

## Cgroups — Resource Limits

::code-wrapper{language="bash"}
```bash
# Complex Implementation: manual cgroups v2 (modern, unified hierarchy)
cat /sys/fs/cgroup/cgroup.controllers    # available controllers
stat -fc %T /sys/fs/cgroup/              # cgroup2fs (v2) or tmpfs (v1)

# Create a cgroup with CPU + memory limits
sudo mkdir /sys/fs/cgroup/mygroup
echo "max 50000 100000" | sudo tee /sys/fs/cgroup/mygroup/cpu.max   # 50% CPU
echo "536870912" | sudo tee /sys/fs/cgroup/mygroup/memory.max       # 512 MB
echo $$ | sudo tee /sys/fs/cgroup/mygroup/cgroup.procs              # add this process
```
::

In practice, use systemd or container runtimes — they manage cgroups for you.

## Container Runtimes

| Runtime | Role |
|---|---|
| `runc` | Low-level (OCI runtime — actually runs the container) |
| `containerd` | High-level daemon (image management, lifecycle) |
| `docker` | Developer tool (uses containerd + runc) |
| `podman` | Daemonless, rootless alternative to docker |

### Docker vs Podman

| Feature | Docker | Podman |
|---|---|---|
| Daemon | Yes (`dockerd`) | No (daemonless) |
| Root | Runs as root | Can run rootless (as regular user) |
| CLI | `docker` | `podman` (compatible: `alias docker=podman`) |

Podman is recommended for security (rootless, no daemon). Docker is more established in CI/CD.

## Images and Registries

An image is referenced as `registry/repository:tag`. **Avoid `:latest`** — it's a moving target.

::code-wrapper{language="bash"}
```bash
# Complex Implementation: pin image digest for reproducibility
docker pull nginx@sha256:abc123...    # immutable (can't be retagged)
# vs
docker pull nginx:latest              # changes without warning (non-reproducible)
docker pull nginx:1.27.2              # pinned tag (reproducible)
```
::

## Running Containers

::code-wrapper{language="bash"}
```bash
# Complex Implementation: production container with security constraints
docker run -d --name web \
  -p 8080:80 \
  --user 1000:1000 \                   # run as non-root user
  --cap-drop ALL \                     # drop all capabilities
  --cap-add NET_BIND_SERVICE \        # add only what's needed
  --security-opt no-new-privileges \  # prevent privilege escalation
  --read-only \                       # read-only root filesystem
  --tmpfs /tmp \                      # writable tmpfs for /tmp
  --memory 512m \                     # memory limit
  --cpus 1.5 \                        # CPU limit
  --restart unless-stopped \          # restart policy
  nginx:1.27
```
::

## Building Images

### Multi-Stage Builds

::code-wrapper{language="bash"}
```bash
# Complex Implementation: multi-stage build (small final image)
# Build stage — full SDK
FROM golang:1.22 AS builder
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -o /app server.go

# Final stage — minimal runtime (Alpine + binary only, no Go toolchain)
FROM alpine:3.20
COPY --from=builder /app /app
CMD ["/app"]
# Final image: ~5 MB + binary (not 800 MB Go SDK)
```
::

### Layer Caching — Order Matters

::code-wrapper{language="dockerfile"}
```dockerfile
# GOOD: package.json changes rarely → npm ci is cached
COPY package*.json ./
RUN npm ci --only=production
COPY . .          # source changes often, but only this layer rebuilds

# BAD: any source change invalidates the npm ci cache
COPY . .
RUN npm ci        # rebuilds every time a source file changes
```
::

## Volumes — Persistent Data

::code-wrapper{language="bash"}
```bash
# Complex Implementation: persistent data with named volumes
docker volume create mydata
docker run -d -v mydata:/data nginx

# Bind mount (host directory — for development, live reload)
docker run -d -v /home/alice/data:/data nginx
```
::

### Edge Case: Data Lost on `docker rm`

::code-wrapper{language="bash"}
```bash
# NAIVE: store database data in the container filesystem
# docker rm db → ALL DATA LOST (the writable layer is deleted)
# PRODUCTION: use volumes for anything you need to keep
docker run -d --name db -v pgdata:/var/lib/postgresql/data postgres:16
```
::

## Security Considerations

- **Don't run as root in the container**: use `USER` in the Dockerfile or `--user` at runtime.
- **Drop capabilities**: `--cap-drop ALL --cap-add NET_BIND_SERVICE` — grant only what's needed.
- **`--security-opt no-new-privileges`**: prevent the process from gaining more privileges.
- **`--read-only`**: make the root filesystem read-only (use volumes for writable paths).
- **Resource limits**: `--memory`, `--cpus`, `--pids-limit` to prevent a container from starving others.
- **Pin image digests**: `nginx@sha256:abc123...` instead of `nginx:latest`.
- **Scan images for vulnerabilities**: `trivy`, `grype`, or Snyk.

### Edge Case: Container Root Is Host Root

::code-wrapper{language="bash"}
```bash
# NAIVE: run as root in container (without user namespaces)
# USER root in a container = UID 0 on the host
# If the container escapes (a vulnerability), the attacker has HOST ROOT
docker run --user root myapp

# PRODUCTION: use --user or rootless podman (user namespaces map container root to high UID)
docker run --user 1000:1000 myapp
# Or:
podman run myapp    # rootless by default (container root → high UID on host)
```
::

## 💡 Tips & Tricks

- **Idiom**: pin image tags (not `:latest`) — `nginx:1.27.2` or `nginx@sha256:...`. `:latest` is a moving target — what you test today isn't what you deploy tomorrow.
- **Idiom**: use multi-stage builds to shrink images — build in a full SDK image, copy the binary to a minimal runtime image. Reduces image size from GBs to MBs.
- **Idiom**: order Dockerfile instructions for cache efficiency — copy rarely-changing files (package manifests) first, run expensive commands, then copy frequently-changing source.
- **Idiom**: use `--rm` for one-off commands — `docker run --rm alpine echo hello` removes the container after it exits. Without `--rm`, stopped containers accumulate.
- **Idiom**: use `docker exec -it` to get a shell in a running container — use `sh` instead of `bash` on Alpine (no bash by default).
- **Idiom**: use `podman` for rootless, daemonless containers — no root daemon (more secure). `alias docker=podman` for compatibility.
- **Debug**: use `nsenter` to enter a container's namespaces directly — gives a full shell even if the container has no shell (e.g., distroless).

## ⚠️ Edge Cases & Gotchas

- **Data in the container filesystem is lost on `docker rm`**: use volumes (`-v`) for anything you need to keep.
- **`docker run -v /data:/data` creates `/data` on the host if missing**: and it's owned by root. If the container runs as a non-root user, it can't write there.
- **Port conflicts**: `-p 8080:80` fails if host port 8080 is already in use. Check with `ss -tlnp | grep 8080`.
- **`ADD` vs `COPY`**: `ADD` auto-extracts tarballs and supports URLs (surprising behavior); `COPY` is simple and explicit. Prefer `COPY`.
- **`CMD` vs `ENTRYPOINT`**: `CMD` is the default command (overridable). `ENTRYPOINT` is the fixed command (`CMD` becomes args). `docker run image echo hi` with `ENTRYPOINT ["server"]` runs `server echo hi` (probably wrong).
- **`docker build` sends the entire context to the daemon**: use `.dockerignore` to exclude `node_modules`, `.git`, etc.
- **Alpine uses musl, not glibc**: binaries compiled against glibc won't run on Alpine. Use `debian-slim` or `ubuntu` base if unsure.
- **Containers share the host kernel**: a kernel exploit affects all containers (unlike VMs). Don't run untrusted containers on a host with sensitive data.
- **`:latest` can change without warning**: breaks reproducibility. Pin to a specific tag or digest.
- **Root in a container is root on the host (without user namespaces)**: use `--user` or rootless podman.
- **Layer cache can hide security updates**: `RUN apt install nginx` is cached. Use `--no-cache` for production builds, or pin versions.
- **Container networking defaults to bridge**: the default bridge network doesn't do DNS between containers. Create a user-defined network (`docker network create`) for name-based resolution.

## 🧠 Spot the Bug

A developer builds a Node.js app image with this Dockerfile:

::code-wrapper{language="dockerfile"}
```dockerfile
FROM node:20
COPY . /app
WORKDIR /app
RUN npm install
EXPOSE 3000
CMD ["node", "server.js"]
```
::

Every time they change a single source file, the build takes 5 minutes (npm install runs every time). What's wrong, and how do they fix it?

<details>
<summary>Answer</summary>

**Layer caching is invalidated by the `COPY . /app` before `npm install`.** Docker caches layers — if a layer's input hasn't changed, the cache is reused. `COPY . /app` copies *all* files, including source code. When any source file changes, this layer is invalidated, and all subsequent layers (including `RUN npm install`) rebuild.

**Fix — copy package manifests first, install deps, then copy source:**

::code-wrapper{language="dockerfile"}
```dockerfile
FROM node:20
WORKDIR /app
COPY package*.json ./          # package.json changes rarely → cache survives
RUN npm ci                     # only rebuilds when package.json changes
COPY . .                       # source changes often, but only this layer rebuilds
EXPOSE 3000
CMD ["node", "server.js"]
```
::

Now:
- `package.json` changes rarely → `npm ci` layer is cached → fast rebuilds.
- Source code changes → only the `COPY . .` layer rebuilds (seconds, not minutes).
- `npm ci` (not `npm install`) is preferred for reproducible builds (respects lockfile, faster in CI).

The principle: **order Dockerfile instructions from least-frequently-changing to most-frequently-changing** to maximize cache hits.
</details>