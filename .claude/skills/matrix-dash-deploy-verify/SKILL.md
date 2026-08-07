---
name: matrix-dash-deploy-verify
description: "Deploy matrix-dash to its GCE+Caddy+Cloudflare Access production VM and actually verify the live site changed. Use whenever asked to deploy, redeploy, push to production, or confirm production reflects recent commits — matrix.zbautomations.ie, builder.zbautomations.ie, and zbautomations.ie all share this one VM."
risk: safe
source: authored
date_added: "2026-07-08"
---

# matrix-dash Deploy & Verify

`git push` alone does nothing to the live site — a real redeploy is always required, and a deploy script exiting 0 is **not** evidence the live site changed. This skill exists because that exact false-positive has happened repeatedly (7 stacked bugs found in one session; a second session found 2 more the following day) and the only thing that reliably caught them was actually running the pipeline and curling the live domains, not trusting exit codes.

## Deploying — current procedure

```bash
./deploy/deploy.sh          # deploy origin/main HEAD
./deploy/deploy.sh <sha>    # deploy a specific commit
```

Run it from the Mac. CI already builds every push on a 16GB runner; this
downloads that artifact and swaps it in. **No resize cycle — the e2-micro never
builds anything.** Takes ~2-3 minutes instead of ~40.

Prerequisite: the commit's CI run must have completed successfully, and its
artifact is kept for 14 days. `deploy.sh` exits rather than half-deploying if
the artifact is missing.

**The resize procedure documented further down is now the break-glass fallback**
— for when CI is unavailable, the artifact has expired, or you need to build
from a state that was never pushed. Do not reach for it by default; it costs
~40 minutes and two VM restarts.

Post-deploy verification below is unchanged and still mandatory either way.

## Topology (all on one GCE e2-micro VM, us-east1-b, project `matrix-dashboard-id`, IP `34.26.105.23`)

| Domain | Serves | Process |
|---|---|---|
| `matrix.zbautomations.ie` | Next.js dashboard app | systemd `matrix-dash.service`, `/opt/matrix-dash` |
| `builder.zbautomations.ie` | Matrix Builder (bolt.new-custom fork) | systemd `matrix-builder.service` on :5001, `/opt/matrix-builder` |
| `zbautomations.ie` | Static landing page | `/var/www/landing/index.html`, served directly by Caddy |

All three routes live in the **same** `/etc/caddy/Caddyfile` on the VM. All three are gated by Cloudflare Zero Trust Access (email OTP) — except `/api/oauth/*`, which is deliberately exempted so OAuth redirect callbacks work.

## Before running `deploy/setup-server.sh`

`setup-server.sh` **unconditionally overwrites `/etc/caddy/Caddyfile`** from the repo's `deploy/Caddyfile`. The VM's live Caddyfile has drifted from the repo before (someone hand-added `builder.zbautomations.ie`'s routing directly on the VM without ever committing it — that block silently disappeared on the next deploy and caused a real Cloudflare 525 outage). Diff before overwriting, every time:

```bash
gcloud compute ssh matrix-dash --zone=us-east1-b --project=matrix-dashboard-id \
  --command="cat /etc/caddy/Caddyfile" > /tmp/vm-caddyfile.txt
diff /tmp/vm-caddyfile.txt deploy/Caddyfile
```

If they differ, reconcile the repo's `deploy/Caddyfile` first — don't just run the script and let it clobber the VM's real config.

## Known failure modes (all previously fixed, but re-check if they resurface)

- **`.env.production` overwrite**: `setup-server.sh` only bootstraps `.env.production` if it doesn't already exist — if this regresses, a redeploy will silently replace real secrets with the repo's placeholder template. Real secrets live in `/opt/matrix-dash/.env.production` AND `.next/standalone/.env.production` (a separate copy the running service actually reads) — both must survive.
- **`pnpm` build-script gate**: `better-sqlite3`/`esbuild`/`sharp` need `pnpm.onlyBuiltDependencies` in `package.json` **and** `pnpm-workspace.yaml` (pnpm 11+ on the VM wants an explicit `allowBuilds` map; local pnpm 10.x doesn't require it — keep both keys to hedge version drift).
- **`next build` OOMs on the e2-micro's ~955MB RAM** during type-checking. Fixed via `typescript.ignoreBuildErrors`/`eslint.ignoreDuringBuilds` in `next.config.ts` — the real type-check gate is the separately-run `pnpm typecheck`, not the production build. Don't "fix" this by trying to give the build more memory; there isn't more to give.
- **`"prepare": "husky"` breaks production installs.** pnpm's pre-script lockfile-sync check runs in production mode (no devDependencies, including husky) before any script executes, so `pnpm install --prod`/`pnpm build` fails at "husky: not found." Must stay `"prepare": "husky || exit 0"` — if this regresses, every production deploy breaks at install.
- **`systemctl start` is a no-op if the service is already running.** Always `systemctl restart matrix-dash` (and `matrix-builder` if that app changed) — `start` on an already-running unit silently keeps serving the OLD build with a 0 exit code.
- **Never `rm -rf`/`cp -r` into the live standalone directory while the process is still running against it** — causes a crash-loop (`MODULE_NOT_FOUND`) until the swap finishes. `Restart=always` recovers, but it's real (if brief) downtime. Prefer: stop the service, build to a fresh directory, atomically swap — or explicitly accept and budget for the flicker.
- **Full `pnpm build` on this VM takes ~24 min to compile, ~36 min wall-clock total.** Don't assume something is hung before ~40 minutes on a full rebuild.

## Post-deploy verification (mandatory — do not skip)

A deploy is not "done" until every domain this VM serves has been checked, including the one not in this repo's own deploy flow:

```bash
# From the VM (bypasses Cloudflare Access):
gcloud compute ssh matrix-dash --zone=us-east1-b --project=matrix-dashboard-id \
  --command="curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/ && \
             curl -s -o /dev/null -w '%{http_code}\n' localhost:5001/ && \
             systemctl status matrix-dash --no-pager | head -5 && \
             systemctl status matrix-builder --no-pager | head -5"
```

Then confirm from outside (through Cloudflare):
- `curl -I https://matrix.zbautomations.ie` — expect a redirect to Cloudflare Access login (200s only after authenticating), not a 525/502.
- `curl -I https://builder.zbautomations.ie` — same. This is the domain most likely to be forgotten because it isn't part of matrix-dash's own deploy flow but shares the same Caddyfile.
- `curl -sf https://zbautomations.ie` — should return the static landing page directly (no Access gate).
- If a schema migration ran, hit an authenticated API route that would 500 on a missing column (e.g. `/api/sessions`) rather than just checking it returns *a* 200.

**`systemctl` uptime resetting is the actual signal a new build is live** — check `systemctl status` shows a recent `Active: active (running) since <just now>`, not just that the command exited 0.

## How to apply

Before telling the user "deployed" or "production is up to date," you must have curled all three live domains (or their VM-local equivalents) in this session — not just run the script and trusted its exit code. If `git log origin/main..HEAD` (local) shows unpushed commits, or the VM's checkout is behind `origin/main`, say so explicitly rather than assuming a prior deploy still covers current work.
