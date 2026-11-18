#!/bin/bash
# Disaster Deck on an IPv6-only Vultr VM, start to finish (#39). Run as root in the Vultr console.
# Safe to run again: each step checks first and skips what is done. Full log: /root/desk-setup.log
# It stops and asks three times: the GitHub deploy key, the .env.local, the Cloudflare tunnel token.
#   DOMAIN=other.example bash vultr-console.sh   serves another domain (default disasterdeck.us)
set -uo pipefail
exec > >(tee -a /root/desk-setup.log) 2>&1

REPO=DarshalShetty/HackTheNest26
APP=/opt/desk
ENV=$APP/.env.local
STATE=/var/lib/desk/deployed
DOMAIN=${DOMAIN:-disasterdeck.us}
STEPLOG=/root/desk-step.log

step() { echo; echo "== [$1/11] $2"; }
ok()   { echo "   OK   $*"; }
bad()  { echo "   FAIL $*"; }
warn() { echo "   WARN $*"; }
die()  { bad "$*"; echo; echo "Stopped. Screenshot this and send it. Full log: /root/desk-setup.log"; exit 1; }
as_desk() { sudo -u desk -H -- "$@"; }
# Run quietly; on failure show the last lines of its output.
run() { "$@" >"$STEPLOG" 2>&1 || { tail -25 "$STEPLOG" | sed 's/^/   | /'; return 1; }; }
envval() { grep -E "^$1=" "$ENV" 2>/dev/null | tail -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'; }
export DEBIAN_FRONTEND=noninteractive
cd /tmp
echo "== Disaster Deck setup $(date -u +%H:%MZ) on $(hostname), $(. /etc/os-release; echo "$PRETTY_NAME")"

step 1 "Network"
if curl -4 -fsS -m5 -o /dev/null https://api.ipify.org 2>/dev/null; then
  ok "IPv4 works, NAT64 not needed"
else
  if ! grep -q '2a01:4ff:f0:9876::1' /etc/resolv.conf 2>/dev/null; then
    rm -f /etc/resolv.conf
    printf 'nameserver 2a01:4ff:f0:9876::1\nnameserver 2a00:1098:2b::1\nnameserver 2a00:1098:2c::1\n' > /etc/resolv.conf
  fi
  ok "no IPv4: DNS64 + NAT64 from nat64.net"
fi
curl -fsS -m10 -o /dev/null https://github.com && ok "https github.com" || die "github.com unreachable (no IPv6, or NAT64 down)"
timeout 8 bash -c '</dev/tcp/github.com/22' 2>/dev/null && ok "ssh port github.com:22" || die "github.com:22 unreachable"

step 2 "Packages"
run apt-get update -q || die "apt-get update"
run apt-get install -yq git curl ca-certificates gnupg sudo nano python3 || die "apt-get install"
ok "git curl sudo nano python3"

step 3 "Node 22+"
node_ok() { node -v 2>/dev/null | grep -qE '^v(2[2-9]|[3-9][0-9])'; }
if ! node_ok; then
  { curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/ns.sh && run bash /tmp/ns.sh && run apt-get install -yq nodejs; } || warn "NodeSource failed, trying the distro's nodejs"
  node_ok || run apt-get install -yq nodejs npm
fi
node_ok && ok "node $(node -v), npm $(npm -v)" || die "no Node 22+"

step 4 "Swap (next build needs memory)"
if [ "$(swapon --show | wc -l)" -eq 0 ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap -q /swapfile && swapon /swapfile && echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi
ok "$(free -h | awk '/Mem/{print "ram "$2} /Swap/{print "swap "$2}' | xargs)"

step 5 "User desk and deploy key"
id desk >/dev/null 2>&1 || useradd -m -s /bin/bash desk
KEY=/home/desk/.ssh/id_ed25519
if [ ! -f "$KEY" ]; then
  as_desk mkdir -p -m 700 /home/desk/.ssh
  as_desk ssh-keygen -q -t ed25519 -N "" -C desk-vultr -f "$KEY"
fi
grep -q github.com /home/desk/.ssh/known_hosts 2>/dev/null || ssh-keyscan -t ed25519 github.com 2>/dev/null | as_desk tee -a /home/desk/.ssh/known_hosts >/dev/null
ok "user desk, key $KEY"

step 6 "Clone $REPO"
if [ -d "$APP/.git" ]; then
  ok "already cloned at $(as_desk git -C "$APP" rev-parse --short HEAD)"
else
  mkdir -p "$APP" && chown desk:desk "$APP"
  until as_desk git clone -q "git@github.com:$REPO.git" "$APP" 2>"$STEPLOG"; do
    tail -2 "$STEPLOG" | sed 's/^/   | /'
    echo; echo "   Darshal adds this as a READ-ONLY deploy key at github.com/$REPO/settings/keys"
    echo; cat "$KEY.pub"; echo
    read -r -p "   Enter = retry. Or paste a GitHub token (classic, repo scope) to clone with it: " TOK </dev/tty
    if [ -n "$TOK" ]; then
      URL="https://x-access-token:$TOK@github.com/$REPO.git"
      as_desk git clone -q "$URL" "$APP" 2>"$STEPLOG" && break
    fi
  done
  ok "cloned $(as_desk git -C "$APP" rev-parse --short HEAD)"
fi

step 7 ".env.local"
if [ ! -s "$ENV" ]; then
  echo "   Paste your .env.local into the editor, then Ctrl+O, Enter, Ctrl+X."
  read -r -p "   Enter = open the editor " _ </dev/tty
  touch "$ENV"
  nano "$ENV" </dev/tty >/dev/tty 2>&1
fi
chown desk:desk "$ENV"; chmod 600 "$ENV"
miss=0
for k in MONGODB_URI DESK_ID AUTH_SECRET SSOJET_CLIENT_ID SSOJET_CLIENT_SECRET SSOJET_ISSUER_URL; do
  v=$(envval "$k"); if [ -n "$v" ]; then ok "$k (${#v} chars)"; else bad "$k missing or empty"; miss=1; fi
done
for k in MONGODB_DB AGENT_KEY OPENROUTER_API_KEY ELEVENLABS_API_KEY NEXT_PUBLIC_MAPBOX_TOKEN; do
  v=$(envval "$k"); if [ -n "$v" ]; then ok "$k (${#v} chars)"; else warn "$k empty: that feature stays off"; fi
done
case "$(envval MONGODB_URI)" in mongodb+srv://*|mongodb://*) ok "MONGODB_URI starts with mongodb";; *) bad "MONGODB_URI does not start with mongodb (first character lost in the paste?)"; miss=1;; esac
a=$(envval AGENT_KEY); [ -z "$a" ] || [ ${#a} -ge 24 ] || warn "AGENT_KEY under 24 chars: the server refuses it"
[ "$(envval DESK_ID)" = antakya-2023 ] || warn "DESK_ID is $(envval DESK_ID), the pilot is antakya-2023. Fix: nano $ENV"
[ "$miss" = 0 ] || { echo "   Fix it with: nano $ENV   then run this script again"; die ".env.local incomplete"; }

step 8 "Install and build (3 to 6 minutes)"
cd "$APP"
mkdir -p "$(dirname "$STATE")"
HEAD=$(as_desk git rev-parse HEAD)
if [ "$(cat "$STATE" 2>/dev/null)" = "$HEAD" ] && [ -f .next/BUILD_ID ]; then
  ok "build for ${HEAD:0:7} already there"
else
  run as_desk npm ci --no-audit --no-fund || die "npm ci"
  ok "npm ci"
  run as_desk env NEXT_TELEMETRY_DISABLED=1 npm run build || die "next build"
  ok "next build"
  echo "$HEAD" > "$STATE"
fi
cd /tmp

step 9 "Services: web, brain, auto-deploy from main"
cat > /etc/systemd/system/desk-web.service <<'EOF'
[Unit]
Description=Disaster Deck web (Next.js on 127.0.0.1:3000)
After=network-online.target
Wants=network-online.target
[Service]
User=desk
WorkingDirectory=/opt/desk
Environment=NEXT_TELEMETRY_DISABLED=1
ExecStart=/usr/bin/npm start -- -H 127.0.0.1 -p 3000
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/desk-brain.service <<'EOF'
[Unit]
Description=Disaster Deck Brain (one per database, holds a lease in meta)
After=network-online.target
Wants=network-online.target
[Service]
User=desk
WorkingDirectory=/opt/desk
ExecStart=/usr/bin/npm run brain
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
cat > /usr/local/bin/desk-deploy <<'EOF'
#!/bin/bash
# Redeploy when origin/main moved since the last good deploy. A failed build retries next minute.
set -euo pipefail
STATE=/var/lib/desk/deployed
as_desk() { sudo -u desk -H -- "$@"; }
cd /opt/desk
as_desk git fetch -q origin main
T=$(as_desk git rev-parse origin/main)
[ "${1:-}" != "--force" ] && [ "$(cat $STATE 2>/dev/null)" = "$T" ] && exit 0
echo "deploying ${T:0:7}"
as_desk git reset -q --hard "$T"
as_desk npm ci --no-audit --no-fund --loglevel=error
as_desk env NEXT_TELEMETRY_DISABLED=1 npm run build
systemctl restart desk-web desk-brain
echo "$T" > $STATE
echo "deployed ${T:0:7}"
EOF
chmod 755 /usr/local/bin/desk-deploy
cat > /etc/systemd/system/desk-deploy.service <<'EOF'
[Unit]
Description=Disaster Deck: redeploy if origin/main moved
[Service]
Type=oneshot
ExecStart=/usr/local/bin/desk-deploy
EOF
cat > /etc/systemd/system/desk-deploy.timer <<'EOF'
[Unit]
Description=Check origin/main every minute
[Timer]
OnBootSec=1min
OnUnitInactiveSec=60s
Unit=desk-deploy.service
[Install]
WantedBy=timers.target
EOF
ok "desk-web desk-brain desk-deploy.timer written"

step 10 "Cloudflare tunnel for https://$DOMAIN"
if ! command -v cloudflared >/dev/null; then
  { curl -fsSLo /tmp/cf.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && run dpkg -i /tmp/cf.deb; } || die "cloudflared install"
fi
ok "$(cloudflared --version 2>&1 | head -1)"
TOKFILE=/etc/desk-tunnel.env
if [ ! -s "$TOKFILE" ]; then
  echo "   Cloudflare > Zero Trust > Networks > Tunnels > desk: copy the token (the long eyJ... string)."
  echo "   Its public hostname must be $DOMAIN -> HTTP 127.0.0.1:3000"
  read -r -p "   Paste the token, or Enter for a temporary trycloudflare.com URL: " T </dev/tty
  T=$(printf '%s' "$T" | tr -d '[:space:]')
  case "$T" in yJ*) T="e$T";; esac  # the console tends to eat the first character
  if [ -n "$T" ]; then printf 'TUNNEL_TOKEN=%s\n' "$T" > "$TOKFILE"; chmod 600 "$TOKFILE"; fi
fi
if [ -s "$TOKFILE" ]; then
  TUNNEL_MODE=named
  EXEC="/usr/bin/cloudflared tunnel --no-autoupdate --edge-ip-version 6 run"
else
  TUNNEL_MODE=quick
  EXEC="/usr/bin/cloudflared tunnel --no-autoupdate --edge-ip-version 6 --url http://127.0.0.1:3000"
fi
cat > /etc/systemd/system/desk-tunnel.service <<EOF
[Unit]
Description=Disaster Deck public URL (Cloudflare tunnel, $TUNNEL_MODE)
After=network-online.target desk-web.service
Wants=network-online.target
[Service]
EnvironmentFile=-$TOKFILE
ExecStart=$EXEC
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
ok "tunnel mode: $TUNNEL_MODE"

step 11 "Start and check"
systemctl daemon-reload
systemctl enable --quiet desk-web desk-brain desk-tunnel desk-deploy.timer
STARTED=$(date '+%Y-%m-%d %H:%M:%S')
systemctl restart desk-web desk-brain desk-tunnel
systemctl start desk-deploy.timer
code=000
for _ in $(seq 1 30); do code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login); [ "$code" = 200 ] && break; sleep 2; done
[ "$code" = 200 ] && ok "web: /login answers 200" || bad "web: /login answers $code. See: journalctl -u desk-web -n 40 --no-pager"
H=$(curl -s -m15 http://127.0.0.1:3000/api/health)
case "$H" in *error*|"") bad "/api/health: ${H:-no answer}. Usually Atlas Network Access: allow 0.0.0.0/0";; *) ok "/api/health: ${H:0:160}";; esac
for s in desk-web desk-brain desk-tunnel desk-deploy.timer; do
  [ "$(systemctl is-active $s)" = active ] && ok "$s active" || bad "$s $(systemctl is-active $s). See: journalctl -u $s -n 40 --no-pager"
done
echo "   brain, last lines:"; journalctl -u desk-brain --since "$STARTED" -n 6 --no-pager -o cat | sed 's/^/   | /'
URL=""
for _ in $(seq 1 20); do
  J=$(journalctl -u desk-tunnel --since "$STARTED" --no-pager -o cat)
  if [ "$TUNNEL_MODE" = quick ]; then URL=$(printf '%s' "$J" | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1); [ -n "$URL" ] && break
  else printf '%s' "$J" | grep -q 'Registered tunnel connection' && { URL="https://$DOMAIN"; break; }; fi
  sleep 3
done
if [ -n "$URL" ]; then ok "tunnel connected: $URL"; else bad "tunnel did not connect. Last lines:"; journalctl -u desk-tunnel -n 8 --no-pager -o cat | sed 's/^/   | /'; fi
if [ -n "$URL" ]; then
  sleep 3
  pc=$(curl -s -o /dev/null -m15 -w '%{http_code}' "$URL/login")
  [ "$pc" = 200 ] && ok "public $URL/login answers 200" || warn "public $URL/login answers $pc (Cloudflare domain not Active yet, or the public hostname is not set)"
  curl -s -m15 "$URL/login" | grep -q 'Continue without signing in' && bad "demo shortcut visible through the tunnel: tell Devin" || ok "no demo shortcut through the tunnel"
  bc=$(curl -s -o /dev/null -m15 -w '%{http_code}' "$URL/api/board?user=coordinator-duty")
  case "$bc" in 401|403) ok "?user= refused through the tunnel ($bc)";; *) warn "?user= through the tunnel answers $bc, expected 401: tell Devin";; esac
fi

echo
echo "== Done. Live URL: ${URL:-not yet}"
echo "   SSOJet callback to register: ${URL:-https://$DOMAIN}/api/auth/callback/ssojet"
echo "   Mapbox token allowed URL:    ${URL:-https://$DOMAIN}"
echo "   Every push to main deploys within ~1-3 min. Watch: journalctl -u desk-deploy -f"
echo "   Stop any Brain on a laptop that uses the same Atlas cluster."
