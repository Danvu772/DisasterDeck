#!/bin/bash
# Give the IPv6-only VM real IPv4 out through Cloudflare WARP, Atlanta exit (#39). Run as root.
# Why: nat64.net's relays are all in Europe, so every Atlas round trip took ~190 ms and the
# Brain did about 2 events a minute. Through WARP the same ping is ~20 ms.
# IPv4 only (AllowedIPs 0.0.0.0/0, Table=off, one default route in main): IPv6, Tailscale (rules
# 52xx, evaluated before main) and the cloudflared tunnel (edge-ip-version 6) do not change.
# A timer reverts after 4 minutes unless you run: systemctl stop wg-revert.timer
set -euo pipefail
V=2.3.1
export DEBIAN_FRONTEND=noninteractive
apt-get install -yq wireguard-tools >/dev/null
cd /tmp
curl -fsSLo wgcf_${V}_linux_amd64 https://github.com/ViRb3/wgcf/releases/download/v$V/wgcf_${V}_linux_amd64
curl -fsSLo wgcf-checksums.txt https://github.com/ViRb3/wgcf/releases/download/v$V/checksums.txt
grep " wgcf_${V}_linux_amd64$" wgcf-checksums.txt | sha256sum -c -
install -m 755 wgcf_${V}_linux_amd64 /usr/local/bin/wgcf
install -d -m 700 /etc/wgcf && cd /etc/wgcf
[ -f wgcf-account.toml ] || wgcf register --accept-tos >/dev/null
wgcf generate >/dev/null

P=/etc/wgcf/wgcf-profile.conf
PRIV=$(sed -n 's/^PrivateKey = //p' $P); PUB=$(sed -n 's/^PublicKey = //p' $P)
V4=$(sed -n 's/^Address = \([0-9.\/]*\).*/\1/p' $P)
umask 077
cat > /etc/wireguard/wgcf.conf <<CONF
[Interface]
PrivateKey = $PRIV
Address = $V4
MTU = 1280
Table = off
PostUp = ip -4 route replace default dev %i
PostDown = ip -4 route del default dev %i || true

[Peer]
PublicKey = $PUB
AllowedIPs = 0.0.0.0/0
Endpoint = [2606:4700:d0::a29f:c001]:2408
PersistentKeepalive = 25
CONF

cp /etc/resolv.conf /etc/resolv.conf.nat64
systemd-run --quiet --unit=wg-revert --on-active=240 /bin/sh -c "systemctl stop wg-quick@wgcf; cp /etc/resolv.conf.nat64 /etc/resolv.conf"
systemctl enable --now wg-quick@wgcf
printf 'nameserver 1.1.1.1\nnameserver 2606:4700:4700::1111\nnameserver 1.0.0.1\n' > /etc/resolv.conf
for s in desk-web desk-brain; do
  mkdir -p /etc/systemd/system/$s.service.d
  printf '[Unit]\nAfter=wg-quick@wgcf.service\nWants=wg-quick@wgcf.service\n' > /etc/systemd/system/$s.service.d/warp.conf
done
systemctl daemon-reload
curl -4 -fsS -m8 https://www.cloudflare.com/cdn-cgi/trace | grep -E '^(ip|colo|warp)='
echo "Check SSH and the site from a new session, then: systemctl stop wg-revert.timer"
