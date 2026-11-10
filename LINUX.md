# Linux client setup

This guide connects a Linux client to the Samba share over WireGuard while
keeping ordinary Internet traffic on the client's existing connection. It uses
`wg-quick` and a CIFS mount; it does not set up the server. For server setup,
see [README.md](README.md).

## 1. Install the client tools

On Debian or Ubuntu:

```bash
sudo apt update
sudo apt install wireguard cifs-utils curl
```

On other distributions, install the equivalent WireGuard tools, `cifs-utils`,
and `curl`. The automatic startup instructions below require systemd.

Obtain a separate peer configuration and the SMB username and password securely
from the server administrator. The WireGuard configuration contains a private
key: do not share it or commit it to source control.

## 2. Configure a split tunnel

Install the peer configuration as `/etc/wireguard/koodaamo.conf`, replacing the
source path with the file you received:

```bash
sudo install -d -m 700 /etc/wireguard
sudo install -m 600 /path/to/your-peer.conf /etc/wireguard/koodaamo.conf
sudoedit /etc/wireguard/koodaamo.conf
```

Keep the supplied keys, client address, endpoint and other peer settings. In
the server's `[Peer]` section, make sure the route is exactly:

```ini
AllowedIPs = 10.13.13.1/32
```

Remove any `DNS = ...` line from the `[Interface]` section so that `wg-quick`
leaves the client's existing DNS settings alone. The generated peer may specify
`1.1.1.1`; it is not needed for this share.

Do not use `0.0.0.0/0`, `::/0`, or a wider VPN subnet here: this server does
not forward Internet traffic. Do not add a WireGuard kill switch or firewall
rules that block traffic outside the tunnel. If the file contains `PreUp`,
`PostUp`, `PreDown`, or `PostDown` commands, review them with the administrator
before activating it; such commands can change routes or firewall rules.

The share server is `10.13.13.1`, not the client's `Address`. A conflicting
local route or another VPN using that address can prevent access to the share;
ask the administrator to resolve the addressing conflict rather than routing
all traffic into the tunnel.

## 3. Connect and verify routing

Before connecting, check that your normal connection works:

```bash
curl -I --connect-timeout 10 https://example.com/
ip route get 1.1.1.1
```

Start the tunnel and check the routes:

```bash
sudo wg-quick up koodaamo
sudo wg show koodaamo
ip route get 10.13.13.1
ip route get 1.1.1.1
curl -I --connect-timeout 10 https://example.com/
```

The route to `10.13.13.1` should use `dev koodaamo`; the route to `1.1.1.1`
should still use your normal network interface. The HTTPS request checks both
DNS resolution and connectivity; a particular website can also fail for
reasons unrelated to WireGuard. If you use IPv6, check
`ip -6 route get 2606:4700:4700::1111` before and after connecting too.

WireGuard is connectionless: a configured interface alone does not prove that
the server is reachable. Try TCP port 445 and then check the latest handshake:

```bash
timeout 10 bash -c 'echo > /dev/tcp/10.13.13.1/445'
sudo wg show koodaamo
```

The TCP command should exit successfully and the latest handshake should be
recent. Ping is expected to fail: the server permits only TCP `445` through
the VPN.

## 4. Mount the share

Create a root-only credentials file, then enter the supplied SMB credentials in
the editor:

```bash
sudo install -d -m 700 /etc/samba
if ! sudo test -e /etc/samba/koodaamo.credentials; then
  sudo install -m 600 /dev/null /etc/samba/koodaamo.credentials
fi
sudoedit /etc/samba/koodaamo.credentials
```

Add these lines, replacing the placeholders with the actual credentials:

```text
username=YOUR_SMB_USERNAME
password=YOUR_SMB_PASSWORD
```

The SMB credentials are separate from WireGuard keys. The credentials file
contains the password in plaintext; keep it root-only and do not commit it.
If the file already exists, check that its owner is root and its permissions
are `600`.

Create a mount point and mount the share. Replace `1000` with your own numeric
UID and GID from `id -u` and `id -g` respectively:

```bash
id -u
id -g
sudo mkdir -p /mnt/koodaamo-cdn
sudo mount -t cifs "//10.13.13.1/Koodaamo CDN" /mnt/koodaamo-cdn \
  -o credentials=/etc/samba/koodaamo.credentials,vers=3.0,uid=1000,gid=1000,file_mode=0660,dir_mode=0770
ls -la /mnt/koodaamo-cdn
```

The UID, GID and modes control local presentation of files; the server still
enforces SMB authentication and permissions. Connect by IP and exact share
name; network discovery is not provided. Do not enable SMB1, guest access, or
public SMB ports.

## 5. Optional: reconnect after reboot

If you started the tunnel manually in step 3, stop it first so systemd can
start and manage it:

```bash
sudo wg-quick down koodaamo
```

Enable the tunnel at boot and start it now:

```bash
sudo systemctl enable --now wg-quick@koodaamo.service
```

Do not simultaneously manage the same tunnel with NetworkManager or another
WireGuard client.

For an on-demand mount, unmount the manual mount first, then edit `/etc/fstab`:

```bash
sudo umount /mnt/koodaamo-cdn
sudoedit /etc/fstab
```

Add this single line, replacing the numeric UID and GID with your own:

```fstab
//10.13.13.1/Koodaamo\040CDN /mnt/koodaamo-cdn cifs credentials=/etc/samba/koodaamo.credentials,vers=3.0,uid=1000,gid=1000,file_mode=0660,dir_mode=0770,_netdev,nofail,x-systemd.automount,x-systemd.requires=wg-quick@koodaamo.service 0 0
```

The `\040` escapes the space in the share name. Reload systemd and activate
the automount:

```bash
sudo systemctl daemon-reload
sudo systemctl start mnt-koodaamo\\x2dcdn.automount
ls -la /mnt/koodaamo-cdn
```

Accessing the directory triggers the mount. `nofail` avoids making the share a
boot requirement; it does not guarantee that the server or network is ready
when the directory is first accessed. Test again after reboot.

## Troubleshooting

- **Internet stops working:** check `AllowedIPs`, the `DNS` line and any
  WireGuard hook commands as described above. Check your existing firewall,
  other VPNs and routes too; a split-tunnel configuration cannot override
  unrelated network policies. To disconnect this tunnel, run
  `sudo systemctl stop wg-quick@koodaamo.service` if systemd manages it, or
  `sudo wg-quick down koodaamo` if started manually.
- **No handshake or TCP connection:** verify the endpoint and UDP `65298`,
  the route to `10.13.13.1`, and the peer configuration. Ask the administrator
  to check the server using [server troubleshooting](README.md#troubleshooting).
- **Mount fails despite TCP connectivity:** check the exact share name and SMB
  credentials, then inspect the error and `journalctl -k` for CIFS messages.
  Update the credentials file if the password has changed.
- **Automatic mount fails:** inspect
  `systemctl status wg-quick@koodaamo.service` and
  `systemctl status mnt-koodaamo\\x2dcdn.automount`, and check that the network
  and server are reachable. An automount is not a continuous connection monitor.
