#!/usr/bin/env bash
# Redeploy when origin/main moved since the last good deploy (#39). desk-deploy.timer runs this
# every minute. A failed build leaves the state file alone, so the next minute tries again.
#   desk-deploy           # deploy if main moved
#   desk-deploy --force   # rebuild and restart anyway
set -euo pipefail
APP=/opt/desk
STATE=/var/lib/desk/deployed
as_desk() { sudo -u desk -H -- "$@"; }
mkdir -p "$(dirname "$STATE")"
cd "$APP"

as_desk git fetch --quiet origin main
TARGET=$(as_desk git rev-parse origin/main)
[ "${1:-}" != "--force" ] && [ "$(cat "$STATE" 2>/dev/null)" = "$TARGET" ] && exit 0

echo "deploying ${TARGET:0:7}"
as_desk git reset --hard --quiet "$TARGET"
as_desk npm ci --no-audit --no-fund --loglevel=error
as_desk env NEXT_TELEMETRY_DISABLED=1 npm run build
systemctl restart desk-web desk-brain
echo "$TARGET" > "$STATE"
echo "deployed ${TARGET:0:7}"
