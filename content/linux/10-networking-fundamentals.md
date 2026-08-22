# 10 — Networking Fundamentals

Networking is how your Linux box talks to other machines — via TCP/IP, DNS, HTTP, SSH. This chapter covers the network stack, interface configuration (`ip`), routing, DNS, sockets (`ss`), and the everyday tools (`curl`, `ssh`, `scp`, `rsync`).

## The TCP/IP Model

```text
┌─────────────────────────────────────┐
│  Application  (HTTP, SSH, DNS, ...)  │  ← your programs
├─────────────────────────────────────┤
│  Transport    (TCP / UDP)            │  ← ports, reliability
├─────────────────────────────────────┤
│  Internet     (IP)                   │  ← routing, IP addresses
├─────────────────────────────────────┤
│  Link         (Ethernet, Wi-Fi)      │  ← MAC addresses, switches
└─────────────────────────────────────┘
```

- **Link** — frames, MAC addresses, switches, ARP.
- **Internet** — packets, IP addresses, routers, routing.
- **Transport** — TCP (reliable, ordered) or UDP (fast, no guarantees), ports.
- **Application** — HTTP, SSH, DNS, SMTP — built on TCP/UDP.

## IP Addresses

Every interface has an IP address. IPv4 is 32-bit (e.g., `192.168.1.10`); IPv6 is 128-bit (e.g., `fd00::1`).

| Range | Class | Use |
|---|---|---|
| `10.0.0.0/8` | Private | LAN |
| `172.16.0.0/12` | Private | LAN |
| `192.168.0.0/16` | Private | LAN (home routers) |
| `127.0.0.0/8` | Loopback | `localhost` |
| `169.254.0.0/16` | Link-local | DHCP failure |
| `0.0.0.0` | Unspecified | "any" / default route source |

- **CIDR notation** — `192.168.1.0/24` means the first 24 bits are the network, last 8 are hosts (256 addresses, 254 usable). `/24` = subnet mask `255.255.255.0`.
- **Gateway** — the router that forwards packets to other networks.
- **DNS** — translates names (`example.com`) to IPs (`93.184.216.34`).

## Network Interfaces

### Viewing

::code-wrapper{language="bash"}
```bash
ip link show                  # all interfaces (links)
ip addr show                  # all interfaces + IP addresses
ip -br addr show              # brief (one line per interface)
ip route                      # routing table
ip -br link                   # brief link status

# Legacy (deprecated, but common):
ifconfig                      # interfaces + IPs
ifconfig -a                   # including down
netstat -rn                   # routing table (use ip route instead)
``
::

Interface names:
- `eth0`, `eth1` — Ethernet (legacy naming).
- `enp3s0`, `ens33`, `eno1` — predictable names (`en` = Ethernet, `p` = PCI bus, `s` = slot).
- `wlan0`, `wlp2s0` — Wi-Fi.
- `lo` — loopback (`127.0.0.1`).
- `docker0`, `br-xxx` — Docker bridges.
- `tun0`, `tap0` — tunnels/VMs.

### Configuring

::code-wrapper{language="bash"}
```bash
sudo ip link set eth0 up               # bring interface up
sudo ip link set eth0 down             # take it down
sudo ip addr add 192.168.1.10/24 dev eth0   # add an IP
sudo ip addr del 192.168.1.10/24 dev eth0   # remove
sudo ip route add default via 192.168.1.1    # default gateway
sudo ip route add 10.0.0.0/8 via 192.168.1.254  # static route
sudo ip link set dev eth0 mtu 9000     # set MTU (jumbo frames)
sudo ip link set dev eth0 address aa:bb:cc:dd:ee:ff  # set MAC
``
::

**These are temporary** (lost on reboot). Persistent config is in `/etc/netplan/` (Ubuntu), `/etc/NetworkManager/` or `/etc/sysconfig/network-scripts/` (RHEL), `/etc/network/interfaces` (Debian).

### Ubuntu — Netplan

```yaml
# /etc/netplan/01-netcfg.yaml
network:
  version: 2
  ethernets:
    eth0:
      dhcp4: true
    eth1:
      addresses: [192.168.1.10/24]
      routes:
        - to: default
          via: 192.168.1.1
      nameservers:
        addresses: [8.8.8.8, 1.1.1.1]
```

::code-wrapper{language="bash"}
```bash
sudo netplan apply          # apply config
sudo netplan try            # test (rolls back if you don't confirm in 120s)
netplan generate            # validate syntax (generates backend config)
``
::

### RHEL — NetworkManager (`nmcli`)

::code-wrapper{language="bash"}
```bash
nmcli device status                          # all interfaces
nmcli connection show                        # all connections
nmcli connection show eth0                   # details
sudo nmcli connection modify eth0 ipv4.addresses 192.168.1.10/24
sudo nmcli connection modify eth0 ipv4.gateway 192.168.1.1
sudo nmcli connection modify eth0 ipv4.dns "8.8.8.8 1.1.1.1"
sudo nmcli connection modify eth0 ipv4.method manual
sudo nmcli connection up eth0                # apply
``
::

## Routing

The **routing table** decides where packets go. View it:

::code-wrapper{language="bash"}
```bash
ip route
# default via 192.168.1.1 dev eth0 proto static
# 192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.10
# 10.0.0.0/8 via 192.168.1.254 dev eth0
``
::

- **default route** — where packets go if no other route matches (your gateway to the internet).
- **`192.168.1.0/24 dev eth0`** — this subnet is directly on `eth0` (no router needed).
- **`10.0.0.0/8 via ...`** — a static route to another network.

::code-wrapper{language="bash"}
```bash
ip route get 8.8.8.8          # see which route + interface a destination uses
ip route get 192.168.1.50     # local subnet — direct
tracepath 8.8.8.8             # trace the path (no root needed)
traceroute 8.8.8.8            # classic (needs root for ICMP)
mtr 8.8.8.8                   # continuous traceroute (live)
``
::

## DNS

### `/etc/resolv.conf`

::code-wrapper{language="bash"}
```bash
cat /etc/resolv.conf
# nameserver 8.8.8.8
# nameserver 1.1.1.1
# search example.com
# domain example.com
``
::

- **nameserver** — DNS servers to query (up to 3).
- **search** — domains appended to short names (`ping db` → `db.example.com`).

On modern systems, `resolv.conf` is often **generated** by systemd-resolved or NetworkManager — don't edit it directly. Use:

::code-wrapper{language="bash"}
```bash
resolvectl status             # systemd-resolved status
resolvectl dns eth0 8.8.8.8   # set DNS for an interface
# Or edit Netplan/NetworkManager config (persistent)
``
::

### `/etc/hosts` — Static Name Resolution

::code-wrapper{language="bash"}
```bash
cat /etc/hosts
# 127.0.0.1   localhost
# 127.0.1.1   myhost
# 192.168.1.50  db  db.example.com
# ::1         localhost ip6-localhost
``
::

`/etc/hosts` is checked **before** DNS (controlled by `/etc/nsswitch.conf`: `hosts: files dns`). Useful for overriding or for local names.

### Querying DNS

::code-wrapper{language="bash"}
```bash
dig example.com              # full DNS query (A record)
dig example.com MX           # mail records
dig example.com NS           # name servers
dig example.com AAAA         # IPv6
dig @8.8.8.8 example.com     # query a specific server
dig +short example.com       # just the IP
dig -x 8.8.8.8               # reverse lookup (IP → name)

nslookup example.com         # simpler (interactive too)
host example.com             # simplest
getent hosts example.com     # uses NSS (hosts: files dns)
``
::

## Sockets and Connections

### `ss` — Socket Statistics (Replaces `netstat`)

::code-wrapper{language="bash"}
```bash
ss                          # all sockets (huge)
ss -t                       # TCP sockets
ss -u                       # UDP sockets
ss -l                       # listening sockets
ss -lt                      # TCP listening
ss -ltnp                    # TCP listening + numeric + process
ss -tlnp | grep :80         # what's listening on port 80?
ss -t state established     # established TCP connections
ss -t state time-wait       # connections in TIME_WAIT
ss -s                       # socket summary
ss -i                       # internal TCP info (RTT, congestion)
``
::

Common `ss` flags:
- `-t` TCP, `-u` UDP, `-l` listening, `-a` all
- `-n` numeric (don't resolve names — faster, clearer)
- `-p` show process using the socket (needs root for others' processes)
- `-e` extended (UID, inodes)
- `-m` memory stats
- `-o` timer info

### `netstat` (Legacy)

::code-wrapper{language="bash"}
```bash
netstat -tlnp       # TCP listening + process (same as ss -tlnp)
netstat -rn         # routing table
netstat -i          # interface stats
netstat -s          # protocol statistics
``
::
`ss` is faster and more informative; `netstat` is deprecated but still common.

### `lsof` for Network

::code-wrapper{language="bash"}
```bash
sudo lsof -i :80            # what's using port 80?
sudo lsof -i tcp            # all TCP
sudo lsof -i -P -n          # all network, numeric ports, no name resolution
sudo lsof -i @example.com   # connections to a host
``
::

## HTTP Requests — `curl`

::code-wrapper{language="bash"}
```bash
curl https://example.com                    # GET (body to stdout)
curl -i https://example.com                 # + headers
curl -I https://example.com                 # HEAD only (headers)
curl -s https://example.com                 # silent (no progress)
curl -o file.html https://example.com       # save to file
curl -O https://example.com/file.tar.gz     # save with remote filename
curl -L https://example.com/redirect        # follow redirects
curl -X POST https://api.example.com        # POST
curl -d "key=value" https://api.example.com # POST form data
curl -H "Content-Type: application/json" \
     -d '{"key":"value"}' https://api.example.com  # POST JSON
curl -u user:pass https://example.com       # basic auth
curl --resolve example.com:443:1.2.3.4 https://example.com  # override DNS
curl -w "%{http_code}\n" -o /dev/null -s https://example.com  # just status code
curl --connect-timeout 5 --max-time 10 https://example.com   # timeouts
curl -k https://self-signed.example.com     # ignore cert errors
curl -v https://example.com 2>&1 | head     # verbose (debug TLS, headers)
``
::

## `wget` — Download

::code-wrapper{language="bash"}
```bash
wget https://example.com/file.tar.gz        # download
wget -O custom.tar.gz https://.../file.tar.gz  # save as different name
wget -c https://.../largefile.iso           # continue (resume) interrupted download
wget -r -l 2 https://example.com/           # recursive (mirror), depth 2
wget -q --spider https://example.com        # check URL without downloading
wget -m https://example.com/                # mirror (timestamp, recursive)
``
::

## SSH — Secure Shell

SSH is the primary way to access remote Linux machines securely.

::code-wrapper{language="bash"}
```bash
ssh alice@server                    # connect (default port 22)
ssh -p 2222 alice@server            # custom port
ssh -i ~/.ssh/id_ed25519 alice@server  # specific key
ssh -J jumpuser@jumphost alice@internal.server   # jump host (bastion)
ssh -t alice@server "sudo systemctl restart nginx"  # run command, force TTY
ssh -L 8080:localhost:80 alice@server  # local port forward (tunnel)
ssh -R 8080:localhost:80 alice@server  # remote port forward
ssh -D 1080 alice@server             # dynamic (SOCKS) proxy
ssh -N -L 5432:db.internal:5432 alice@bastion  # -N: no command, just tunnel
``
::

### Port Forwarding

| Type | Command | Direction |
|---|---|---|
| Local | `ssh -L 8080:target:80 user@ssh-server` | You → target (via ssh-server) |
| Remote | `ssh -R 8080:target:80 user@ssh-server` | ssh-server → target (via you) |
| Dynamic | `ssh -D 1080 user@ssh-server` | SOCKS proxy (any destination) |

Use cases:
- **Local**: access an internal service from your laptop (`ssh -L 8080:internal-app:80 bastion`).
- **Remote**: expose a local dev server to the internet via your server.
- **Dynamic**: browse through your server as a SOCKS proxy.

### SSH Config File

Simplify frequent connections in `~/.ssh/config`:

```text
Host prod
    HostName prod.example.com
    User alice
    Port 2222
    IdentityFile ~/.ssh/id_ed25519
    ForwardAgent yes

Host bastion
    HostName bastion.example.com
    User deploy

Host internal-*
    ProxyJump bastion
    User alice
```

Then just `ssh prod` or `ssh internal-db01`.

## `scp` and `rsync` — Copy Files

### `scp`

::code-wrapper{language="bash"}
```bash
scp file.txt alice@server:/tmp/              # local → remote
scp alice@server:/tmp/file.txt .             # remote → local
scp -r dir/ alice@server:/tmp/               # recursive (directory)
scp -P 2222 file.txt alice@server:/tmp/      # custom port (capital P!)
scp alice@server:alice@server2:/tmp/file.txt .  # doesn't work — scp can't go remote to remote directly
``
::

### `rsync` (Preferred)

`rsync` is faster (only sends diffs), resumes interrupted transfers, and preserves attributes:

::code-wrapper{language="bash"}
```bash
rsync -avz dir/ alice@server:/tmp/dir/       # local → remote (archive, verbose, compress)
rsync -avz alice@server:/tmp/dir/ dir/       # remote → local
rsync -avz --delete dir/ alice@server:/tmp/dir/  # delete files on dest not in source
rsync -avz --exclude='*.log' dir/ alice@server:/tmp/dir/
rsync -avz --progress dir/ alice@server:/tmp/dir/
rsync -a --checksum dir/ alice@server:/tmp/dir/  # use checksums (slower, more accurate)
rsync -avze ssh -p 2222 dir/ alice@server:/tmp/dir/  # custom SSH port
``
::

**Trailing slash matters**:
- `rsync dir/ dest/` — copies the **contents** of `dir` into `dest` (`dest/file1`, `dest/file2`).
- `rsync dir dest/` — copies `dir` itself into `dest` (`dest/dir/file1`).

Use `-n` (dry-run) to preview before running.

## Firewall

### `ufw` — Uncomplicated Firewall (Ubuntu)

::code-wrapper{language="bash"}
```bash
sudo ufw enable                 # enable firewall
sudo ufw disable
sudo ufw status verbose
sudo ufw allow 22/tcp           # allow SSH
sudo ufw allow 80/tcp           # allow HTTP
sudo ufw allow 443/tcp          # allow HTTPS
sudo ufw allow from 192.168.1.0/24 to any port 5432  # allow LAN to PostgreSQL
sudo ufw deny 3306              # block MySQL
sudo ufw delete allow 80/tcp    # remove a rule
sudo ufw reset                  # reset to default
``
::

### `firewalld` (RHEL/Fedora)

::code-wrapper{language="bash"}
```bash
sudo firewall-cmd --get-active-zones
sudo firewall-cmd --zone=public --add-port=80/tcp --permanent
sudo firewall-cmd --zone=public --add-service=http --permanent
sudo firewall-cmd --reload
sudo firewall-cmd --list-all
``
::

### `iptables` / `nftables` (Low-Level)

::code-wrapper{language="bash"}
```bash
sudo iptables -L -n -v          # list rules
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT   # allow HTTP
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT   # allow SSH
sudo iptables -A INPUT -j DROP  # drop everything else
sudo iptables-save > /tmp/rules.v4   # save
sudo iptables-restore < /tmp/rules.v4  # restore
``
::

Modern systems use `nftables` (replaces `iptables`). `iptables` commands often map to `nft` underneath.

## Diagnostics

### `ping` — Is It Reachable?

::code-wrapper{language="bash"}
```bash
ping 8.8.8.8                    # ICMP echo (Ctrl+C to stop)
ping -c 4 8.8.8.8               # 4 packets, then stop
ping -i 0.5 8.8.8.8             # every 0.5s (needs root for < 1s)
ping -W 2 8.8.8.8               # 2s timeout per reply
ping6 ::1                       # IPv6
``
::

`ping` uses ICMP, which some firewalls block. A failed ping doesn't always mean the host is down — try `curl` or `nc`.

### `traceroute` / `tracepath` / `mtr`

::code-wrapper{language="bash"}
```bash
traceroute 8.8.8.8              # trace hops (UDP, needs root for ICMP)
tracepath 8.8.8.8               # no root needed, shows MTU
mtr 8.8.8.8                     # continuous traceroute (live, interactive)
mtr --report 8.8.8.8            # one-shot report (10 cycles)
``
::

### `nc` (netcat) — The "Swiss Army Knife"

::code-wrapper{language="bash"}
```bash
nc -zv example.com 80           # check if port 80 is open
nc -zv example.com 80 443 22    # scan multiple ports
nc -l 1234                      # listen on port 1234 (server)
nc example.com 1234             # connect (client)
echo "GET / HTTP/1.0\r\n\r\n" | nc example.com 80   # manual HTTP
nc -u example.com 53            # UDP mode
``
::

### `tcpdump` — Packet Capture

::code-wrapper{language="bash"}
```bash
sudo tcpdump -i eth0                       # capture on eth0
sudo tcpdump -i eth0 port 80               # only port 80
sudo tcpdump -i eth0 host 8.8.8.8          # only this host
sudo tcpdump -i eth0 -n                    # numeric (no DNS resolution)
sudo tcpdump -i eth0 -c 10                 # 10 packets, then stop
sudo tcpdump -i eth0 -w capture.pcap       # save to file (for Wireshark)
sudo tcpdump -i eth0 'tcp[tcpflags] & tcp-syn != 0'  # SYN packets only
sudo tcpdump -i any port 22                # all interfaces, port 22
``
::

## `/etc/services` and Ports

Common ports:

| Port | Service |
|---|---|
| 22 | SSH |
| 25 | SMTP (mail) |
| 53 | DNS |
| 80 | HTTP |
| 443 | HTTPS |
| 3306 | MySQL |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 8080 | HTTP alternate |
| 9090 | Prometheus |

Ports < 1024 are **privileged** (require root to bind). 1024+ are unprivileged.

::code-wrapper{language="bash"}
```bash
cat /etc/services | grep -E "^ssh|^http|^https"  # name → port mapping
``
::

## 💡 Tips & Tricks

- **Idiom**: use `ip -br addr` (brief) for a quick interface overview — one line per interface with state and IP. Much cleaner than `ip addr` or `ifconfig`. `ip -br link` for just link status.
- **Idiom**: use `ss -tlnp` to see what's listening — shows TCP listening sockets with the process name. Essential for "what's using port 80?" or "is my service running?" Add `| grep :PORT` for a specific port.
- **Idiom**: use `dig +short` for scripts — `dig +short example.com` returns just the IP (no headers), pipeable. `host example.com` is even simpler but less flexible.
- **Idiom**: use `curl -w "%{http_code}" -o /dev/null -s URL` for monitoring — returns just the HTTP status code (200, 404, 503). Perfect for health checks in scripts and cron.
- **Idiom**: use `~/.ssh/config` for all frequent SSH connections — turns `ssh -i ~/.ssh/key -p 2222 alice@prod.example.com` into just `ssh prod`. Also supports `ProxyJump` for bastion hosts, `ForwardAgent` for git, etc.
- **Idiom**: use `rsync -avz --delete` for syncs (with `--dry-run` first) — `rsync` is faster than `scp` (only sends diffs), and `--delete` keeps the dest in sync. Always `-n` (dry-run) first to preview, especially with `--delete`.
- **Idiom**: use `mtr` instead of `traceroute` for diagnostics — `mtr` runs continuously (combines `traceroute` + `ping`), showing packet loss per hop. Reveals where connections fail (your router? ISP? remote side?).
- **Debug**: use `ip route get <IP>` to see which interface and gateway a packet will take — resolves "why can't I reach X?" by showing the exact route. Also `ss -tn` to see if a connection is established.
- **Debug**: use `tcpdump` or `curl -v` when "it's not working" — `tcpdump -i any port 80` shows if packets are arriving. `curl -v` shows TLS handshake, headers, redirects. These are the two tools that cut through "network mystery."
- **Debug**: use `sudo lsof -i -P -n` to find network-using processes — shows every open socket, the process, port, and peer. `-P` and `-n` skip name resolution (faster, avoids DNS delays).

## ⚠️ Edge Cases & Gotchas

- **`ip` commands are temporary (lost on reboot)**: `sudo ip addr add ...` disappears at reboot. Persistent config goes in Netplan (Ubuntu), NetworkManager (RHEL), or `/etc/network/interfaces` (Debian). The `ip` command is for testing/emergencies.
- **`scp` port flag is `-P` (capital), `ssh` is `-p` (lowercase)**: inconsistent and a common typo. `scp -P 2222 ...` vs `ssh -p 2222 ...`. `rsync` uses `-e "ssh -p 2222"`.
- **`rsync` trailing slash changes behavior**: `rsync dir/ dest/` copies *contents* of `dir` into `dest`. `rsync dir dest/` copies `dir` *itself* into `dest` (`dest/dir/...`). This is the #1 `rsync` gotcha — always dry-run first (`-n`).
- **`ping` failing doesn't mean host is down**: ICMP is often blocked by firewalls (AWS, corporate). Use `nc -zv host port` or `curl` to test the actual service. A host that doesn't respond to `ping` can still serve HTTP.
- **`localhost` vs `0.0.0.0` vs `127.0.0.1`**: binding to `127.0.0.1` listens only on loopback (local only). `0.0.0.0` listens on all interfaces (external too). `localhost` usually resolves to `127.0.0.1` but can be `::1` (IPv6). For public services, bind to `0.0.0.0` (or a specific IP) and firewall the port.
- **DNS caching can lie**: `dig` bypasses your cache (queries directly). `getent hosts` and browsers use the cache. If you changed a DNS record and don't see it, flush: `sudo resolvectl flush-caches` (systemd-resolved) or restart `nscd`/`dnsmasq`.
- **Firewall rules can block you out**: `ufw default deny` + forgetting `ufw allow 22` = locked out of SSH. Always allow SSH before enabling the firewall. Test with a second session before closing the first.
- **`ss -p` needs root to see others' processes**: without root, you only see your own sockets' processes. `sudo ss -tlnp` to see which process owns port 80 (nginx, apache, etc.).
- **`iptables` rules are lost on reboot** (without persistence): install `iptables-persistent` (Debian) or use `firewalld`/`ufw` (which persist). `iptables-save > /etc/iptables/rules.v4` + `iptables-persistent` reloads them at boot.
- **Port forwarding binds to localhost by default**: `ssh -L 8080:target:80 server` binds the local port to `127.0.0.1` (local only). Use `-L 0.0.0.0:8080:target:80` to bind to all interfaces (others on your network can use it — security implication).
- **`/etc/hosts` overrides DNS**: `nsswitch.conf` says `hosts: files dns` — so `/etc/hosts` is checked first. A stale entry there can override a correct DNS record, causing "the DNS is right but I still get the old IP." Check `/etc/hosts` when DNS changes don't take effect.
- **IPv6 can surprise you**: services may bind to IPv6 (`::`) and also accept IPv4 (depending on `IPV6_V6ONLY` setting). `ss -tlnp` shows both. `localhost` may resolve to `::1` (IPv6 loopback), not `127.0.0.1` — if a service binds only to `127.0.0.1`, `http://localhost` may fail (use `http://127.0.0.1`).
- **TIME_WAIT sockets pile up**: after a connection closes, the socket stays in `TIME_WAIT` for ~60s (to catch delayed packets). Under high connection rates, you can run out of ports. `ss -t state time-wait | wc -l` shows the count. Tune with `net.ipv4.tcp_tw_reuse` (use cautiously).

## 🧠 Spot the Bug

A developer runs a web server on a Linux VM:

::code-wrapper{language="bash"}
```bash
python3 -m http.server 8080
```
::

On the VM, `curl http://localhost:8080` works. But from their laptop (same network), `curl http://<vm-ip>:8080` times out — even though the firewall allows 8080. What's likely wrong?

<details>
<summary>Answer</summary>

**`python3 -m http.server` binds to `0.0.0.0` by default** — so that's probably fine. The likely issue is one of:

1. **The firewall on the VM blocks 8080.** Even if the *network* allows it, the *host* firewall (ufw, firewalld) may not. Check:

::code-wrapper{language="bash"}
```bash
sudo ufw status        # or: sudo firewall-cmd --list-all
sudo ufw allow 8080/tcp
```
::

2. **The server bound to `127.0.0.1` only.** If the developer ran `python3 -m http.server 8080 --bind 127.0.0.1` (or a custom app that binds to localhost), external connections fail. Check:

::code-wrapper{language="bash"}
```bash
ss -tlnp | grep 8080
#  LISTEN  0  5  127.0.0.1:8080  0.0.0.0:*   ← only localhost (bad)
#  LISTEN  0  5  0.0.0.0:8080    0.0.0.0:*   ← all interfaces (good)
```
::
If it shows `127.0.0.1:8080`, rebind to `0.0.0.0` (or a specific interface IP).

3. **Cloud security group / network ACL.** On AWS/GCP/Azure, a security group (outside the VM) may block the port, even if the VM's firewall allows it. Check the cloud console's security group / firewall rules.

The diagnostic flow:
1. `ss -tlnp | grep 8080` — is it bound to `0.0.0.0` or `127.0.0.1`?
2. `sudo ufw status` / `firewall-cmd --list-all` — does the host firewall allow 8080?
3. From the laptop: `nc -zv <vm-ip> 8080` — is the port reachable at the network level?
4. Cloud console — is the security group allowing inbound 8080?

The most common cause is #2 (host firewall) or #3 (cloud security group). Always check `ss` first to confirm the bind address.
</details>