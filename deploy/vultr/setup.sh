#!/usr/bin/env bash
# One-time setup of the Disaster Desk on a fresh Ubuntu 22.04/24.04 Vultr VM (#39). Run as root.
# Safe to run again. The first run stops after printing the deploy key, the second run finishes:
#
#   bash setup.sh                       # 1. prints the key: add it at GitHub > repo Settings > Deploy keys
#   scp .env.local root@IP:/root/       # 2. from the laptop
#   bash setup.sh                       # 3. clones, builds, starts, prints the URL
#
# DESK_HOST=desk.example.com bash setup.sh uses your own domain instead of <ip>.sslip.io.
set -euo pipefail
REPO=git@github.com:DarshalShetty/HackTheNest26.git
APP=/opt/desk
HERE=$(cd "$(dirname "$0")" && pwd)
cd /tmp # sudo -u desk cannot read /root, and git refuses to run from there

export DEBIAN_FRONTEND=noninteractive
command -v git >/dev/null || { apt-get update -q; apt-get install -yq git curl ca-certificates gnupg; }

id desk >/dev/null 2>&1 || useradd --create-home --shell /bin/bash desk
KEY=/home/desk/.ssh/id_ed25519
if [ ! -f "$KEY" ]; then
  sudo -u desk -H mkdir -p -m 700 /home/desk/.ssh
  sudo -u desk -H ssh-keygen -q -t ed25519 -N "" -C "desk-vultr-deploy" -f "$KEY"
  ssh-keyscan -t ed25519 github.com 2>/dev/null | sudo -u desk -H tee -a /home/desk/.ssh/known_hosts >/dev/null
fi

if [ ! -d "$APP/.git" ]; then
  mkdir -p "$APP" && chown desk:desk "$APP"
  if ! sudo -u desk -H git clone --quiet "$REPO" "$APP"; then
    echo; echo "Add this read-only deploy key at github.com/DarshalShetty/HackTheNest26/settings/keys, then run setup.sh again:"
    echo; cat "$KEY.pub"; exit 1
  fi
fi

if [ ! -f "$APP/.env.local" ]; then
  [ -f /root/.env.local ] || { echo "Copy the env file first: scp .env.local root@<this-ip>:/root/"; exit 1; }
  install -o desk -g desk -m 600 /root/.env.local "$APP/.env.local" && rm /root/.env.local
fi

if ! node -v 2>/dev/null | grep -q '^v2[2-9]'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -yq nodejs
fi

if ! command -v caddy >/dev/null; then
  apt-get install -yq debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -yq caddy
fi

# next build runs out of memory on small plans without swap.
if [ "$(swapon --show | wc -l)" -eq 0 ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap -q /swapfile && swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

# Vultr's Ubuntu image ships ufw on with only SSH open.
if ufw status 2>/dev/null | grep -q "Status: active"; then ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; fi

HOST=${DESK_HOST:-$(curl -4fsS https://api.ipify.org | tr . -).sslip.io}
printf '%s {\n\tencode zstd gzip\n\treverse_proxy 127.0.0.1:3000\n}\n' "$HOST" > /etc/caddy/Caddyfile

install -m 755 "$HERE/deploy.sh" /usr/local/bin/desk-deploy
install -m 644 "$HERE"/desk-*.service "$HERE"/desk-deploy.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --quiet desk-web desk-brain desk-deploy.timer

/usr/local/bin/desk-deploy --force
systemctl reload-or-restart caddy
systemctl start desk-deploy.timer
echo; echo "Live at https://$HOST  (first certificate can take a minute)"
echo "SSOJet callback: https://$HOST/api/auth/callback/ssojet"
