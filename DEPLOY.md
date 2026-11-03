# DEPLOY.md — running TTP on the laptop

Target: an old laptop with **Linux Mint**, running the app and Postgres with Docker Compose and
exposed to the internet through **Tailscale Funnel**. Everything below is run
**on the laptop**, in a terminal. Replace `<you>` with the laptop's username.

```
phone ──HTTPS──▶ Tailscale Funnel ──▶ 127.0.0.1:3000 (app) ──▶ db (Postgres, internal only)
```

Order matters: do 1–6 and check the app works on the laptop itself before turning on Funnel (7).

---

## 1. Keep the laptop awake and patched
It has to stay on with the lid closed and on power.

```bash
# Don't suspend when the lid closes (also set Power Management → "When the lid is closed: Do nothing"
# in Mint's settings, which can override this).
sudo sed -i 's/^#\?HandleLidSwitch=.*/HandleLidSwitch=ignore/; s/^#\?HandleLidSwitchExternalPower=.*/HandleLidSwitchExternalPower=ignore/' /etc/systemd/logind.conf
sudo systemctl restart systemd-logind     # on a graphical session this may log you out; reboot instead if so

# Security updates install themselves
sudo apt update && sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades    # answer "Yes"
```

Also in the BIOS: "power on after AC loss" if it has the option, so it comes back after a power cut.

## 2. Firewall
Nothing needs to be reachable from the network: Funnel connects outward and the app listens on
loopback only (`compose.yaml` publishes `127.0.0.1:3000`).

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH        # only if you want to SSH in from your own devices; skip otherwise
sudo ufw enable
sudo ufw status verbose
```

Docker-published ports bypass ufw, which is why the compose file binds to `127.0.0.1` and Postgres
publishes no port at all. Don't change either.

## 3. Install Docker Engine
Use Docker's own apt repository (Mint's packages are old). Mint is based on Ubuntu; use the Ubuntu
codename the Mint release is built on (`UBUNTU_CODENAME`), not Mint's own.

```bash
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release   # defines UBUNTU_CODENAME on Mint
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $UBUNTU_CODENAME stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"     # then log out and back in
docker run --rm hello-world
docker compose version
```

## 4. Get the code and configure it
```bash
git clone https://github.com/Crusaderrrr/Crusaderrrr.github.io.git ~/ttp
cd ~/ttp
git checkout fullstack     # until v2 is merged into main

cp .env.example .env
nano .env
```

In `.env`, set `POSTGRES_PASSWORD` to a long random value, e.g. from `openssl rand -base64 32`. Pick one
without `/`, `@` or `:` (`openssl rand -hex 24` is safe): it is placed inside a connection URL.
**Set it once, before the first start**: Postgres stores it in its data volume and ignores later changes
to `.env`.

```bash
chmod 600 .env
```

## 5. Start the stack
```bash
cd ~/ttp
docker compose up -d --build        # first build takes a few minutes
docker compose ps                   # db and app should be "healthy"
docker compose logs app | tail      # migrations run on start
curl -s http://127.0.0.1:3000/api/health     # {"ok":true}
```

Both containers have `restart: unless-stopped` and Docker starts on boot, so the stack comes back
after a reboot by itself.

## 6. Create the first invite
The very first account needs an invite code from the command line. That first account becomes the
owner (admin); after that, **Settings → Invite a friend** in the app creates codes for others.

```bash
cd ~/ttp
docker compose exec app node dist-server/cli.js invite        # prints a code, e.g. B9MM-XJTY-RDGD
docker compose exec app node dist-server/cli.js users         # list accounts
```

Open `http://127.0.0.1:3000/#/signup?invite=<code>` in the laptop's browser and create **your** account
first, since the first one is the owner. (Over plain `http://127.0.0.1` the login cookie works for
localhost; on the public address it is HTTPS-only, which Funnel provides.)

## 7. Tailscale + Funnel (public HTTPS)
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up                    # prints a login URL: open it on any device and sign in
```

One-time, in the Tailscale admin console (https://login.tailscale.com/admin):
- **DNS** → enable **MagicDNS** and **HTTPS Certificates**.
- **Access controls** → Funnel must be allowed for this device (the *Funnel* toggle / `funnel` node
  attribute; the CLI tells you the link if it isn't).

```bash
sudo tailscale set --hostname=ttp           # optional: URL becomes https://ttp.<tailnet>.ts.net
sudo tailscale funnel --bg 3000             # proxies the public HTTPS URL to 127.0.0.1:3000
tailscale funnel status                     # shows the public URL
```

`--bg` makes it persistent across reboots. Open the URL on your phone: you should see the sign-in page.

Funnel limits: bandwidth is capped and ports are 443 / 8443 / 10000 only. Fine for a few friends.
Turn it off with `sudo tailscale funnel --bg off 3000` (or `tailscale funnel reset`).

### Install the app on the phone
Open the URL in Safari → Share → **Add to Home Screen**. The address is the app's identity: a new
URL is a new app with no data, so settle on the hostname before you add it.



### Rest-timer notifications with the app closed
The "Time's up" notification is a Web Push sent by the server, so it arrives with the app closed
or the phone locked. Needs iOS 16.4+, the app **added to the Home Screen**, notifications
allowed (the app asks on your first completed set) and the HTTPS address above — push does not
work over plain `http://` on a LAN address. Nothing to configure: the server creates its key pair
on first use. Optionally set `VAPID_SUBJECT` in `.env` to your own `mailto:you@example.com`
(Apple wants a plausible contact; the default is a placeholder). A phone that is switched off
gets nothing: the push expires after 2 minutes instead of arriving late. If it stops working,
turn notifications off and on again for the app in iOS Settings, then complete a set.

## 8. Nightly backups
Postgres data lives in the `pgdata` Docker volume on this one disk. A dump every night, keeping 14.

```bash
mkdir -p ~/ttp-backups

sudo tee /usr/local/bin/ttp-backup >/dev/null <<EOF
#!/bin/sh
set -eu
cd /home/$USER/ttp
out=/home/$USER/ttp-backups/ttp-\$(date +%F).sql.gz
docker compose exec -T db pg_dump -U ttp --clean --if-exists ttp | gzip > "\$out.tmp"
mv "\$out.tmp" "\$out"
ls -1t /home/$USER/ttp-backups/ttp-*.sql.gz | tail -n +15 | xargs -r rm --
EOF
sudo chmod +x /usr/local/bin/ttp-backup

sudo tee /etc/systemd/system/ttp-backup.service >/dev/null <<EOF
[Unit]
Description=TTP database backup
[Service]
Type=oneshot
User=$USER
ExecStart=/usr/local/bin/ttp-backup
EOF

sudo tee /etc/systemd/system/ttp-backup.timer >/dev/null <<EOF
[Unit]
Description=Nightly TTP database backup
[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now ttp-backup.timer
sudo systemctl start ttp-backup.service      # run one now to test
ls -lh ~/ttp-backups
systemctl list-timers ttp-backup.timer
```

`Persistent=true` runs a missed backup after the laptop was off at 03:30.

**Copy backups off the laptop now and then** (a USB stick, or `scp` to your PC). A dump on the same disk
doesn't survive the disk dying. On your Windows PC, for example:
`scp <you>@<laptop>:ttp-backups/ttp-2026-10-25.sql.gz .`

### Restore
```bash
cd ~/ttp
gunzip -c ~/ttp-backups/ttp-YYYY-MM-DD.sql.gz | docker compose exec -T db psql -U ttp -d ttp
```
The dump contains `DROP … IF EXISTS`, so it replaces the current tables. To start from nothing
(fresh machine): do steps 3–5, then run the restore, then step 7.

## 9. Updating
```bash
cd ~/ttp
ttp-backup                        # a backup first; migrations only go forward
git pull
docker compose up -d --build      # rebuilds, restarts, runs new migrations
docker compose ps
curl -s http://127.0.0.1:3000/api/health
```
Phones pick up the new version the next time the app is opened (the service worker updates itself).
If an update goes wrong: `git checkout <previous commit>`, rebuild, and restore the backup if a
migration already changed the schema.

## 10. Everyday commands
```bash
docker compose ps                         # state
docker compose logs -f app                # app log
docker compose restart app
docker compose exec app node dist-server/cli.js invite
docker compose exec app node dist-server/cli.js users
docker compose down                       # stop (data stays); NEVER add -v, it deletes the database
```

## 11. Troubleshooting
| Symptom | Check |
|---|---|
| Sign-in page doesn't load on the public URL | `tailscale funnel status`; `curl http://127.0.0.1:3000/api/health` on the laptop; is the laptop awake and online? |
| Sign-in works on `127.0.0.1` but not on the public URL | the cookie is `Secure`: the public URL must be `https://` (Funnel does this) |
| `app` keeps restarting | `docker compose logs app`; usually a wrong `DATABASE_URL`/`POSTGRES_PASSWORD` |
| Changed `POSTGRES_PASSWORD` and the app can't connect | Postgres keeps the password from first start. Change it inside: `docker compose exec db psql -U ttp -c "ALTER USER ttp PASSWORD '…'"`, then update `.env` and `docker compose up -d` |
| "Too many attempts" at login | the login limit is 10 attempts / 15 min per client + username; wait, or `docker compose restart app` |
| Phone shows "Offline — changes will sync" | the laptop or the connection is down; the workout is safe on the phone and syncs by itself when it's back |
| Disk filling up | `docker system df`, `docker image prune -f`; backups keep only 14 files |
