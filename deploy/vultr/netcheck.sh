#!/bin/bash
# Network check for the desk VM (#39). One line per check, OK or FAIL plus the first output.
ok(){ printf '%-30s ' "$1"; shift; if o=$("$@" 2>&1); then echo "OK   ${o:0:60}"; else echo "FAIL ${o:0:60}"; fi; }
IF=$(ip -o link | awk -F': ' '$2!="lo"{print $2; exit}')
GW4=$(ip route | awk '/^default/{print $3; exit}')
GW6=$(ip -6 route | awk '/^default/{print $3; exit}')
M=http://169.254.169.254/v1
echo "== $(hostname) $(. /etc/os-release; echo "$PRETTY_NAME") $(date -u +%H:%MZ) if=$IF"
ip -br addr | grep -v '^lo'
ip route; ip -6 route | grep -v '^fe80'
echo "dns servers: $(awk '/^nameserver/{print $2}' /etc/resolv.conf | xargs)"
ok "vultr: public v4" curl -fs -m3 $M/interfaces/0/ipv4/address
ok "vultr: public v6" curl -fs -m3 $M/interfaces/0/ipv6/address
ok "vultr: region" curl -fs -m3 $M/region/regioncode
ok "ping v4 gw $GW4" ping -c1 -W2 "$GW4"
ok "ping 1.1.1.1" ping -c1 -W2 1.1.1.1
ok "ping v6 gw" ping -6 -c1 -W2 -I "$IF" "$GW6"
ok "ping v6 cloudflare" ping -6 -c1 -W2 2606:4700:4700::1111
ok "dns github.com" getent hosts github.com
ok "https v4" curl -4 -fsS -m5 https://api.ipify.org
ok "https v6" curl -6 -fsS -m5 https://api64.ipify.org
ok "tcp github.com:22" timeout 5 bash -c '</dev/tcp/github.com/22'
ok "sshd" systemctl is-active ssh
echo "firewall drop/reject rules: $(nft list ruleset 2>/dev/null | grep -cE 'drop|reject')"
echo "== net config"
cat /etc/network/interfaces.d/* /etc/netplan/*.yaml /etc/systemd/network/*.network 2>/dev/null | grep -vE '^\s*(#|$)' | head -12
