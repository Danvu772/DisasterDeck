#!/bin/bash
# Copy this laptop's .env.local to the production VM (#39) and restart the app.
#   npm run env:push              show what changes (key names only), then apply it
#   npm run env:push -- --dry     only show what would change
# How the two files combine, on the VM (its secrets never leave it):
#   - a key with a value here wins
#   - a key only the VM has stays (keys set on the VM by hand survive)
#   - an empty value here never wipes a value the VM has
#   - production's own values (OVERRIDES below) win over both
# Values never print. The VM keeps the previous file as /etc/desk/env.local.prev and puts it back
# when the app stops answering /login after the restart. Needs Dan's tailnet (ssh to the VM).
set -euo pipefail
VM=${DESK_VM:-root@100.114.100.30}
cd "$(dirname "$0")/../.."
SRC=${ENV_FILE:-.env.local}
[ -f "$SRC" ] || { echo "No $SRC in $(pwd)"; exit 1; }
DRY=0; [ "${1:-}" = "--dry" ] && DRY=1

# Production differs from a laptop here.
OVERRIDES='AUTH_URL=https://disasterdeck.us
DEMO_MODE=0
DESK_ID=antakya-2023'

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
umask 077
cp "$SRC" "$TMP/laptop"
printf '%s\n' "$OVERRIDES" > "$TMP/overrides"
cat > "$TMP/merge.py" <<'PY'
import sys, hashlib
def parse(path):
    out = {}
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#") or "=" not in line: continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out
def bare(v): return v[1:-1] if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'" else v
old, laptop, over = parse(sys.argv[1]), parse(sys.argv[2]), parse(sys.argv[3])
new, kept = {}, []
for k, v in laptop.items():
    new[k] = old[k] if not bare(v) and bare(old.get(k, "")) else v
for k, v in old.items():
    if k not in new:
        new[k] = v
        if k not in over: kept.append(k)
new.update(over)
with open(sys.argv[4], "w", encoding="utf-8") as f:
    f.write("# Written by deploy/vultr/push-env.sh: the laptop .env.local merged into the VM's.\n")
    for k, v in new.items(): f.write(f"{k}={v}\n")
fp = lambda d, k: hashlib.sha256(bare(d[k]).encode()).hexdigest()
added = [k for k in new if k not in old]
changed = [k for k in new if k in old and fp(new, k) != fp(old, k)]
emptied = [k for k in new if not bare(new[k]) and k in old and bare(old[k])]
print("added:     " + (" ".join(added) or "none"))
print("changed:   " + (" ".join(changed) or "none"))
print("kept (only on the VM): " + (" ".join(kept) or "none"))
print("unchanged: %d keys" % sum(1 for k in new if k in old and fp(new, k) == fp(old, k)))
pub = [k for k in added + changed if k.startswith("NEXT_PUBLIC_")]
if pub: print("NOTE: " + " ".join(pub) + " are compiled into the build. Also run: gh secret set <KEY> -R DarshalShetty/HackTheNest26, then redeploy (git push origin main:prod).")
if emptied: print("BUG: would empty " + " ".join(emptied)); sys.exit(2)
sys.exit(0 if added or changed else 3)
PY
ssh -o BatchMode=yes "$VM" 'install -d -m 700 /root/env-push && rm -f /root/env-push/*'
scp -q -o BatchMode=yes "$TMP/laptop" "$TMP/overrides" "$TMP/merge.py" "$VM:/root/env-push/"
ssh -o BatchMode=yes "$VM" DRY=$DRY 'bash -s' <<'REMOTE'
set -uo pipefail
D=/root/env-push
trap 'rm -rf "$D"' EXIT
python3 $D/merge.py /etc/desk/env.local $D/laptop $D/overrides $D/merged; rc=$?
[ $rc = 3 ] && { echo "Nothing to copy."; exit 0; }
[ $rc = 0 ] || exit $rc
[ "$DRY" = 1 ] && { echo "(dry run, nothing copied)"; exit 0; }
ok() { for _ in $(seq 1 40); do [ "$(curl -s -o /dev/null -w %{http_code} http://127.0.0.1:3000/login)" = 200 ] && return 0; sleep 2; done; return 1; }
apply() { install -o desk -g desk -m 600 /etc/desk/env.local /opt/desk/.env.local; systemctl restart desk-web desk-brain; }
cp -p /etc/desk/env.local /etc/desk/env.local.prev
install -o root -g root -m 600 $D/merged /etc/desk/env.local
apply
if ok; then echo "VM: copied, web and Brain restarted, /login answers 200"; exit 0; fi
echo "VM: /login stopped answering with the new env. Putting the previous one back."
journalctl -u desk-web -n 15 --no-pager -o cat || true
cp -p /etc/desk/env.local.prev /etc/desk/env.local
apply
ok && echo "VM: previous env restored, site is back" || echo "VM: still down after restoring, check journalctl -u desk-web"
exit 1
REMOTE
