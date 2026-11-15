# Deployment

Production is the `prod` branch. Every push to `prod` deploys to one Vultr VM, served at
**https://disasterdeck.us**. `main` is where work lands. It deploys nothing by itself.

```sh
git push origin main:prod        # promote what is on main
gh run watch                     # follow the Deploy run
```

Promote only when the person asks. A Deploy run takes about 5 minutes.

## How it fits together

| Piece | What it is |
|---|---|
| `.github/workflows/deploy.yml` | Runs on push to `prod`. Builds on the runner, joins the tailnet with an ephemeral key, rsyncs the build to the VM, runs `desk-release` there, then checks the public URL. |
| `deploy/vultr/desk-release.sh` | Installed on the VM as `/usr/local/bin/desk-release`. Copies the upload into the idle slot (`/opt/desk-a` or `/opt/desk-b`), reuses `node_modules` when `package-lock.json` did not change, points `/opt/desk` at the slot, restarts web and Brain, and rolls back to the previous slot when `/login` does not answer 200. |
| VM | Vultr, Atlanta, Ubuntu 26.10, 1 vCPU, 1 GB RAM + 2 GB swap. Tailscale name `vultr`, `100.114.100.30`, on Dan's tailnet. |
| Domain | `disasterdeck.us`, registered at Porkbun (MLH GoDaddy Registry code). Nameservers are Cloudflare's. A Cloudflare tunnel (`desk-tunnel` service) carries visitors to the VM. |

### Why it looks like this

The VM is **IPv6-only**. Vultr gave it `100.68.113.147/18` with no IPv4 default route, and that range is not routable on the internet. So:

- **Outbound IPv4 goes through Cloudflare WARP** (`wg-quick@wgcf`, Atlanta exit), set up by `deploy/vultr/warp-ipv4.sh`. It carries IPv4 only. IPv6, Tailscale and the site tunnel do not use it. `/etc/resolv.conf` is plain `1.1.1.1`. Atlas sees WARP's addresses, so Atlas Network Access must allow `0.0.0.0/0`.
- Before WARP the VM used nat64.net's DNS64/NAT64. Their relays are all in Europe: an Atlas round trip took ~190 ms and the Brain handled about 2 events a minute. Through WARP it is ~20 ms. If WARP is down, `cp /etc/resolv.conf.nat64 /etc/resolv.conf` is the slow fallback.
- Visitors on IPv4 cannot reach the VM directly. The Cloudflare tunnel connects outward over IPv6 and Cloudflare serves the domain on both.
- GitHub runners are IPv4-only, so the workflow reaches the VM over Tailscale.
- The VM never pulls from GitHub. It has no deploy key (only the repo owner can add one). The workflow pushes to it instead.

## On the VM

| Path or unit | Role |
|---|---|
| `/etc/desk/env.local` | The production `.env.local`. Copied into each slot on release. Change it from a laptop with `npm run env:push` (`--dry` to preview): it merges that laptop's `.env.local` in, keeps keys only the VM has, never empties a value, puts `AUTH_URL` and `DEMO_MODE=0` on top. `DESK_ID` comes from the laptop's `.env.local`: it must name the desk the database has data for (check with the counts in Debugging), restarts, and restores the previous file if `/login` stops answering. It has `AUTH_URL=https://disasterdeck.us`: behind the tunnel Next sees `localhost:3000`, and without it Auth.js sends people to `https://localhost:3000`. |
| `/opt/desk` | Symlink to the live slot. |
| `/opt/desk-stage` | Where the workflow uploads (user `deployer`). |
| `desk-web` | `next start` on `127.0.0.1:3000`, user `desk`. |
| `desk-brain` | `npm run brain`, user `desk`. The prod Brain. |
| `desk-tunnel` | `cloudflared`, tunnel `desk`, config `/etc/cloudflared/config.yml`. The public URL. |
| `wg-quick@wgcf` | WARP, the VM's only IPv4 route. `desk-web` and `desk-brain` start after it. |
| `/var/lib/desk/deployed` | Commit of the live release. |

`deployer` can only upload and run `sudo /usr/local/bin/desk-release`. Its key accepts connections from the tailnet only.

## Secrets (GitHub Actions)

- `TS_AUTHKEY`: Tailscale auth key, reusable and ephemeral, from Dan's tailnet.
- `DEPLOY_SSH_KEY`: private key for `deployer`.
- `NEXT_PUBLIC_MAPBOX_TOKEN` (and optional `NEXT_PUBLIC_MAPBOX_STYLE`): `NEXT_PUBLIC_*` values are compiled into the build, so they live here. Server-side values live in `/etc/desk/env.local`.

## Rules for agents

- An empty board on the live site with a working login usually means `DESK_ID` names a desk with no data. `live-api-check.mjs` shows both sides. On 15 Nov 2026 all data was under `malatya-2023`, while the code's default pilot (`data/pilot.json`) is `antakya-2023`.

- Do not push to `prod` unless the person asks.
- One Brain per database. The prod VM runs it. Do not start a laptop Brain against the shared Atlas cluster, or the VM's Brain waits on the lease and the board stops moving.
- `?user=` demo identity must stay refused through the tunnel (`lib/localDemo.ts`). Check `https://disasterdeck.us/api/board?user=coordinator-duty` answers 401 after changes to auth or middleware.
- A new `NEXT_PUBLIC_*` variable needs a GitHub secret and a line in the Build step of `deploy.yml`.
- Production runs with `DEMO_MODE=0` (VM env and the Deploy build): no `?user=`, no open board, no demo link, even from the VM itself. Keep it that way.
- Never remove `AUTH_URL` from the VM's env, and never set it on a laptop (local login would go to the domain).
- A new server variable: add it to `.env.local` and run `npm run env:push`. Only Dan's tailnet reaches the VM, so tell the person if you cannot.

## Debugging

```sh
gh run list --workflow deploy.yml                # which run failed, and at which step
ssh root@100.114.100.30                          # needs Dan's tailnet
journalctl -u desk-web -n 50 --no-pager
journalctl -u desk-brain -n 50 --no-pager
journalctl -u desk-tunnel -n 50 --no-pager
curl -4 -s https://www.cloudflare.com/cdn-cgi/trace | grep -E 'colo|warp'   # on the VM: IPv4 through WARP
curl -s http://127.0.0.1:3000/api/health         # on the VM: database and Brain loop
cd /opt/desk && sudo -u desk -H node --env-file=.env.local deploy/vultr/live-api-check.mjs   # on the VM: database counts vs the live API
```

`deploy/vultr/vultr-console.sh` and `netcheck.sh` are for rebuilding the VM from the Vultr web console. `setup.sh`, `deploy.sh` and the `desk-deploy` timer are an older pull-based design and are not installed.
