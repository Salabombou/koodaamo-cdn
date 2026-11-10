# Koodaamo CDN

An external-SSD file share with VPN-only SMB access and read-only HTTP serving
through a reverse proxy running on the host.

## Architecture

| Service | Access |
| --- | --- |
| WireGuard | Host UDP port `65298`, forwarded to container port `51820` |
| Samba | `\\10.13.13.1\Koodaamo CDN`, TCP `445`, through WireGuard only |
| Nginx | `http://127.0.0.1:56766` on the host, container port `8080` |

Samba and WireGuard share a network namespace. The VPN firewall permits only
TCP `445` and blocks forwarding to other networks and VPN peers. Clients route
only `10.13.13.1/32` through the VPN; this is not an Internet VPN.

Samba and Nginx mount the same SSD directory. Samba can write; Nginx has a
read-only mount and allows only GET/HEAD. HTTP directory listings are enabled,
symbolic links are not served, and automatic directory redirects are relative
so they retain the public HTTPS host and do not expose the container port.

**HTTP has no authentication in this stack.** Anyone allowed through your host
reverse proxy can read the shared files, independently of SMB credentials or
WireGuard access. Configure HTTPS and any required access controls on that proxy.

See [Windows setup](WINDOWS.md) for VPN installation, saved SMB credentials, and
automatic drive mapping using a Task Scheduler `cmd.exe /c net use` action.

## Requirements

- Linux host with Docker Engine, Docker Compose, and WireGuard kernel support.
- An external SSD with a Linux filesystem supporting Unix ownership and
  permissions, such as ext4. The commands below assume this.
- A public hostname/IP and UDP `65298` allowed through the host firewall and
  forwarded by your router if necessary.
- Host Nginx or another reverse proxy for HTTP access.

Do not publish or forward SMB ports `445` or `139`.

## 1. Mount the SSD

Identify the SSD partition carefully:

```bash
lsblk -o NAME,SIZE,MODEL,FSTYPE,UUID,MOUNTPOINTS
```

Mount its existing filesystem, replacing `<ssd-partition-uuid>`:

```bash
sudo mkdir -p /mnt/external-ssd
sudo mount UUID=<ssd-partition-uuid> /mnt/external-ssd
findmnt --mountpoint /mnt/external-ssd -o SOURCE,UUID,FSTYPE,TARGET
```

These commands do not format the SSD. `mountpoint /mnt/external-ssd` only checks
whether something is mounted there; compare the UUID to verify the correct SSD.

For persistent mounting, configure `/etc/fstab` using the partition UUID and its
actual filesystem type. Arrange for the SSD to be mounted before Docker starts
these containers, including after reboots.

The Compose bind mounts refuse to create a missing source directory, but they
cannot detect an unmounted SSD if that directory exists on the host disk.
`restart: unless-stopped` is not a mount-ordering guarantee. Do not unplug the
SSD while the stack is running.

## 2. Create a dedicated service account and share directory

Create these once, or reuse an existing dedicated account:

```bash
sudo groupadd --system cdn
sudo useradd --system --gid cdn --no-create-home \
  --shell /usr/sbin/nologin cdn
id cdn
```

After confirming the correct SSD is mounted:

```bash
mountpoint /mnt/external-ssd &&
sudo mkdir -p /mnt/external-ssd/shared &&
sudo chown cdn:cdn /mnt/external-ssd/shared &&
sudo chmod 2770 /mnt/external-ssd/shared
```

This changes only the share directory, not existing files inside it. Existing
content needs suitable ownership and permissions too. Nginx runs with the same
numeric IDs as the share owner, allowing it to read files Samba creates.

The Linux service account needs no password or login access. SMB credentials are
configured separately.

## 3. Configure the environment

From this directory, copy the example without overwriting an existing `.env`:

```bash
cp -n .env.example .env
chmod 600 .env
```

Edit `.env`:

| Variable | Value |
| --- | --- |
| `WG_SERVERURL` | Public hostname or IP, without a scheme or port |
| `WG_PEERS` | Comma-separated peer names, for example `laptop,phone,desktop` |
| `SAMBA_USER` | SMB login name |
| `SAMBA_PASSWORD` | Strong SMB password; required |
| `SSD_PATH` | Absolute share path; defaults to `/mnt/external-ssd/shared` |
| `PUID` | Numeric UID from `id cdn` |
| `PGID` | Numeric GID from `id cdn` |

Use simple alphanumeric peer names, without spaces. Use single quotes around a
password containing `$` or `#` so Compose does not interpolate it or treat it as
a comment. Do not commit `.env` or peer configurations.

## 4. Start and check

```bash
sudo docker compose config --quiet
sudo docker compose up -d
sudo docker compose ps -a
sudo docker compose logs --tail=60 wg samba
curl -I http://127.0.0.1:56766/
```

WireGuard and Samba should become healthy. Samba's healthcheck authenticates to
the actual share at the VPN IP, rather than merely testing localhost.

## 5. Distribute WireGuard peers

For a peer named `laptop`, display its generated configuration:

```bash
sudo docker compose exec wg cat /config/peer_laptop/peer_laptop.conf
```

Transfer it securely and import it into that device's WireGuard client. Each
device should have its own peer. Configurations contain private credentials;
do not post them in chat, logs, or source control.

To add peers, keep existing names and append new ones in `.env`, then apply:

```dotenv
WG_PEERS=laptop,phone,desktop
```

```bash
sudo docker compose up -d
```

Retrieve each new peer configuration after generation. Peer names are not SMB
usernames: all peers still authenticate using the configured SMB credentials.

WireGuard keys/configuration persist in the `wireguard-config` named volume.
Do not use `docker compose down -v` unless you intend to delete that state.

## 6. Configure the host reverse proxy

Point your host proxy at `http://127.0.0.1:56766`. For example, inside an existing
host Nginx HTTPS server block:

```nginx
location / {
    proxy_pass http://127.0.0.1:56766;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Configure the hostname, TLS certificate, and access controls separately. Test
the host configuration with `sudo nginx -t` before reloading it.

## Configuration changes

- Share name: keep `[Koodaamo CDN]` in [smb.conf](smb.conf), `NAME`, the healthcheck
  UNC path, and client mappings in sync.
- Samba interface binding: the explicit `10.13.13.1/24` entry is intentional.
  Samba can skip the non-broadcast `wg0` interface when configured by name.
  This Samba setting does not change VPN routing.
- After editing [smb.conf](smb.conf), recreate Samba to regenerate its runtime
  configuration:

  ```bash
  sudo docker compose up -d --force-recreate samba
  ```

- [wireguard-server.conf](wireguard-server.conf) is a generation template.
  Editing it alone does not necessarily regenerate an existing `wg0.conf`.
  Plan a controlled regeneration and verify the resulting firewall rules.

## Troubleshooting

On Windows, start with the TCP test in [Windows troubleshooting](WINDOWS.md#troubleshooting).
Ping is intentionally blocked through the VPN.

On the server:

```bash
sudo docker compose ps -a
sudo docker compose exec wg ss -lnt
sudo docker compose exec wg iptables -nvL WG_SMB
sudo docker compose logs --tail=60 samba
```

Expect a listener on `10.13.13.1:445`. A listener on only `127.0.0.1:445`
cannot accept VPN connections. Do not work around this by publishing SMB on
the host or disabling the firewall.

Test Samba's generated configuration and share:

```bash
sudo docker compose exec samba testparm -s /etc/samba/smb.tmp
sudo docker compose exec samba sh -c \
  'PASSWD="$PASS" smbclient "//10.13.13.1/Koodaamo CDN" -U "$USER" -c ls'
```

If HTTP returns `403`, check directory traversal/read permissions for the
configured `PUID`/`PGID`. Files remain inaccessible through HTTP if their
permissions do not allow Nginx to read them.
