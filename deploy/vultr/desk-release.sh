#!/bin/bash
# Called by .github/workflows/deploy.yml (#39) as: sudo /usr/local/bin/desk-release <sha>
# The workflow has rsynced the built tree (source and .next, no node_modules) into /opt/desk-stage.
# This copies it into the idle slot (/opt/desk-a or /opt/desk-b), reuses or installs node_modules,
# points /opt/desk at the slot, restarts web and Brain, and rolls back when /login does not answer.
set -euo pipefail
SHA=${1:-unknown}
STAGE=/opt/desk-stage
ENV=/etc/desk/env.local
CUR=$(readlink -f /opt/desk 2>/dev/null || true)
if [ "$CUR" = /opt/desk-a ]; then NEXT=/opt/desk-b; else NEXT=/opt/desk-a; fi
as_desk() { sudo -u desk -H -- "$@"; }
log() { echo "[release ${SHA:0:7}] $*"; }
lockhash() { sha256sum "$1/package-lock.json" 2>/dev/null | cut -c1-64; }
stamp() { cat "$1/node_modules/.desk-lock" 2>/dev/null || true; }
answers() {
  for _ in $(seq 1 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login)" = 200 ] && return 0
    sleep 2
  done
  return 1
}
switch_to() { ln -sfn "$1" /opt/desk.tmp && mv -Tf /opt/desk.tmp /opt/desk && systemctl restart desk-web desk-brain; }

[ -f "$ENV" ] || { log "missing $ENV"; exit 1; }
[ -f "$STAGE/.next/BUILD_ID" ] || { log "stage has no .next build"; exit 1; }

log "staging into $NEXT (live: ${CUR:-none})"
rsync -a --delete --exclude /node_modules "$STAGE"/ "$NEXT"/
chown -R desk:desk "$NEXT"
WANT=$(lockhash "$NEXT")
if [ "$(stamp "$NEXT")" = "$WANT" ]; then
  log "node_modules already match the lockfile"
elif [ -n "$CUR" ] && [ "$(stamp "$CUR")" = "$WANT" ]; then
  rm -rf "$NEXT/node_modules" && cp -al "$CUR/node_modules" "$NEXT/node_modules"
  log "node_modules linked from $CUR (lockfile unchanged)"
else
  log "lockfile changed: npm ci"
  rm -rf "$NEXT/node_modules"
  (cd "$NEXT" && as_desk npm ci --no-audit --no-fund --loglevel=error)
  echo "$WANT" > "$NEXT/node_modules/.desk-lock"
fi
install -o desk -g desk -m 600 "$ENV" "$NEXT/.env.local"

switch_to "$NEXT"
if answers; then
  mkdir -p /var/lib/desk && echo "$SHA" > /var/lib/desk/deployed
  log "live from $NEXT"
  exit 0
fi
log "the new release does not answer /login. Last web log lines:"
journalctl -u desk-web -n 30 --no-pager -o cat || true
if [ -n "$CUR" ]; then
  switch_to "$CUR"
  answers && log "rolled back to $CUR" || log "rollback to $CUR does not answer either"
fi
exit 1
