# Matrix Runner — P8 Launch Runbook

The big-bang cutover for the local-first platform. This is a **deliberate,
owner-triggered** procedure (production deploy of `feat/matrix-runner` + live
member onboarding), NOT something to automate. Prerequisites: the remaining
software (P4 IDE/console parity, chat-via-subscription) is done, and the runner
has been tested on real macOS/Windows/Linux devices (P7).

## 0. Pre-flight
- Merge `main` into `feat/matrix-runner` (pick up any prod hotfixes), resolve, retest.
- `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:e2e` all green.
- `pnpm build:runner` locally → confirm `runner/dist/matrix-runner.cjs` runs (`node runner/dist/matrix-runner.cjs version`).
- Diff `deploy/Caddyfile` vs the live VM Caddyfile (see the matrix-dash-deploy-verify skill) — runner routes are same-origin `/api/runner/*`, no Caddy change needed, but verify no drift.

## 1. Merge to main
- Fast-forward `feat/matrix-runner` → `main`, push. (Direct-to-main deploy convention.)

## 2. Build + deploy on the VM (resize cycle — the VM can't build on e2-micro)
Same pattern as the multi-user-auth deploy (see `multi-user-auth-live` memory):
1. `gcloud compute instances stop matrix-dash …; set-machine-type e2-standard-2; start`
2. On the VM: `cd /opt/matrix-dash && git pull --ff-only && pnpm install --frozen-lockfile`
3. **Build the app AND the runner bundle:**
   - `NODE_OPTIONS=--max-old-space-size=2048 pnpm build`
   - `pnpm build:runner`  → then copy the bundle where the download route finds it:
     `cp runner/dist/matrix-runner.cjs .next/standalone/matrix-runner.cjs`
     (the download route's candidate paths include `<cwd>/matrix-runner.cjs`; standalone cwd is `.next/standalone`).
4. Standalone swap (stop service → rm/cp static+public+env → prod install → start), per the deploy skill.
5. `gcloud … stop; set-machine-type e2-micro; start` (back to cheap).

## 3. Migration (runs implicitly, verify)
- The dispatch fork auto-routes each agent run to the owner's default online device.
  No data migration is required — `agent_runs.execution`/`device_id` default correctly.
- **Owner action:** pair your Mac runner FIRST (Settings → Devices), set it default.
  Your seeded agents (Site Auditor, Vault Librarian, Repo Custodian) then execute on
  your Mac. While the Mac is offline, scheduled runs skip + notify (decision 4).

## 4. Open member sign-in
- Settings → Accounts → **Enable sign-in** (flips `members_enabled` = "1").
- For EACH member: add their email to the Cloudflare Zero Trust Access policy for
  `matrix.zbautomations.ie` (they can't pass the edge otherwise).
- Send each member their invite link (Accounts → copy invite link).

## 5. Cloudflare Access service token (for headless runner auth)
- The runner must pass CF Access without a browser OTP. Create a **Service Token**
  in Cloudflare Zero Trust; add an Access policy allowing it for `/api/runner/*`.
- The runner reads `MATRIX_RUNNER_CF_ID` / `MATRIX_RUNNER_CF_SECRET` (or `--cf-id/--cf-secret`
  at pair time). Bake these into the templated installer at launch, OR document them.
- Alternative (simpler, larger surface): a CF Access **bypass rule** for `/api/runner/*`
  (like the existing `/api/oauth/*/callback` bypass) — the runner token then authenticates alone.

## 6. Post-deploy verification (mandatory — curl every domain, per the deploy skill)
- VM localhost: `/`, `/login`, `/api/auth/me` (needsBootstrap false), `:5001` (builder).
- External through Cloudflare: `matrix` + `builder` → 302 (Access), `zbautomations.ie` → 200.
- `/api/runner/download` serves the bundle (200, starts with `#!/usr/bin/env node`).
- Owner: pair Mac → device shows online → run a seeded agent → transcript streams live.
- Friend (real non-Mac device): CF-allowlisted → invite link → set password → tutorial →
  install runner via `.command`/`.bat` → paired → own API key + subscription token →
  agent runs on THEIR machine → owner cannot see their transcript.
- Kill switch aborts a mid-run job on a remote device.

## Rollback
- If the deploy breaks prod: `git revert` the merge on main, redeploy (resize cycle).
- Member sign-in is independently reversible: Settings → Accounts → Disable
  (`members_enabled` = "0") locks members out instantly without a redeploy.
