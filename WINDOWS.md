# Windows setup

This guide maps the Samba share as drive `S:` and reconnects it at login using
Task Scheduler and `cmd.exe /c net use`.
Use another unused drive letter if needed.

## 1. Install and import WireGuard

1. Install [WireGuard for Windows](https://www.wireguard.com/install/).
2. Obtain your own peer configuration securely from the server administrator.
3. In WireGuard, select **Import tunnel(s) from file** and import the `.conf`.
4. Select the tunnel and click **Activate**.

The server endpoint uses UDP `65298`. The client configuration should route
`10.13.13.1/32` through the tunnel.

Your client might receive `10.13.13.2`, but the SMB server is **10.13.13.1**.
Other clients have different addresses. An empty default gateway in `ipconfig`
is normal for this split tunnel.

Treat the peer configuration as a password. Do not share one peer between
multiple devices.

## 2. Check connectivity

In PowerShell:

```powershell
Test-NetConnection 10.13.13.1 -Port 445
```

Expect `TcpTestSucceeded : True`. Ping may fail because the server deliberately
allows only TCP `445` through the VPN.

A configured adapter address is not proof of connectivity. In WireGuard,
confirm **Latest handshake** refreshes when attempting the TCP test.

## 3. Save SMB credentials

1. Open **Control Panel > Credential Manager > Windows Credentials**.
2. Select **Add a Windows credential**.
3. Enter:
   - Internet or network address: `10.13.13.1`
   - Username: the server's `SAMBA_USER`
   - Password: the server's `SAMBA_PASSWORD`

These credentials are distinct from your Windows login and WireGuard keys.
Do not put the password in the scheduled task.

## 4. Map the drive manually

Run in a normal, non-administrator Command Prompt:

```cmd
net use S: "\\10.13.13.1\Koodaamo CDN" /persistent:yes
```

Open File Explorer and check drive `S:`. You can also paste
`\\10.13.13.1\Koodaamo CDN` directly into its address bar.

Quotes are required in commands because the share name contains a space.
Network discovery is not provided; connect by this path instead.

If `S:` is still mapped to the previous `Shared` name, close files using it and
remove that mapping before remapping:

```cmd
net use S: /delete
net use S: "\\10.13.13.1\Koodaamo CDN" /persistent:yes
```

Only delete `S:` if it is the mapping you intend to replace.

## 5. Start WireGuard automatically

An activated WireGuard tunnel is installed as a Windows service and normally
starts automatically at boot.

1. Leave the tunnel **activated** when shutting down.
2. Press **Win + R**, enter `services.msc`, and press Enter.
3. Find **WireGuard Tunnel: <your tunnel name>**.
4. Verify its startup type is **Automatic** and its status is **Running**.

Closing the WireGuard window does not deactivate the tunnel. Clicking
**Deactivate** does. Test after a reboot; the drive-mapping task below does not
activate WireGuard itself.

## 6. Configure Task Scheduler

Open **Task Scheduler** and select **Create Task**, not Create Basic Task.

### General

- Name: `Connect Koodaamo CDN`
- Select your Windows user.
- Select **Run only when user is logged on**.
- Leave **Run with highest privileges** unchecked.

Drive mappings belong to a user/logon context. Running as SYSTEM, another user,
or an elevated administrator can make the drive invisible to normal File Explorer.

### Triggers

Add a trigger:

- Begin the task: **At log on**
- Select your user.
- Delay task for: **30 seconds**
- Enabled: checked

### Actions

Add **Start a program**:

Program/script:

```text
C:\Windows\System32\cmd.exe
```

Add arguments:

```text
/c net use S: "\\10.13.13.1\Koodaamo CDN" /persistent:yes
```

`/c` runs the mapping command and closes the window afterward. A Command Prompt
window may briefly appear. The command's exit code lets Task Scheduler detect
failures and retry.

### Conditions

- Uncheck **Start the task only if the computer is on AC power** if you want
  mapping on battery.
- Leave the network-availability condition unchecked. It does not reliably
  indicate whether WireGuard is ready.

### Settings

- Enable **Allow task to be run on demand**.
- Enable **If the task fails, restart every: 1 minute**.
- Set **Attempt to restart up to: 10 times**.
- If the task is already running: **Do not start a new instance**.

The task's **Hidden** checkbox does not hide command windows.

## 7. Test automatic connection

1. Connect WireGuard.
2. Right-click the task and select **Run**.
3. Check File Explorer for drive `S:`.
4. Check **Last Run Result** in Task Scheduler; successful completion is `0x0`.
5. Reboot and log in to verify both tunnel startup and automatic drive mapping.

Windows also attempts to restore persistent mappings, but it may show the drive
as disconnected until the VPN is ready or the drive is opened.

If you activate WireGuard after the task's retry window has expired, run the task
manually again. This login task is not a continuous VPN or resume-from-sleep monitor.

## Troubleshooting

### System error 67: The network name cannot be found

First run:

```powershell
Test-NetConnection 10.13.13.1 -Port 445
```

- **False:** confirm the WireGuard handshake and have the administrator check
  Samba's listener, container health, and VPN firewall. See
  [server troubleshooting](README.md#troubleshooting).
- **True:** verify the share path is exactly
  `\\10.13.13.1\Koodaamo CDN`, then check credentials and share availability:

  ```cmd
  net view \\10.13.13.1
  ```

Do not enable SMB1, insecure guest access, or public host port `445`.

### Access denied or incorrect password

Update the saved Windows credential for `10.13.13.1` with the server's current
SMB username/password. Inspect existing connections with `net use`.
Windows does not normally allow simultaneous connections to one server using
different credentials. Close files and disconnect only the affected mappings
before reconnecting.

### Task works manually but the drive is missing in File Explorer

Verify the task runs as your normal user, **only when logged on**, and without
highest privileges. Test the mapping command in a non-elevated terminal.

### Task runs, but no mapped drive

Check **Last Run Result** and enable Task Scheduler history if necessary.
The Command Prompt window closes when the command finishes, including on failure.
Run the `net use` command in an already-open Command Prompt to see the underlying
error message.
