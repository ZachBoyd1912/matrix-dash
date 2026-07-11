# Local-First Runner Platform — Plan

Status: **proposed, awaiting sign-off.** This is a multi-week architecture, not a
single session. Nothing here is built yet. Owner login + per-account isolation
(the prerequisite) is built and on branch `feat/multi-user-auth`.

## Goal

Let every user (owner + each member) have the full Matrix Dashboard experience
against **their own resources**: their own data, their own AI keys / Claude
subscription (their own usage + limits), and agents with full access to **their
own device** (files, Messages, Photos, Keychain).

## The hard constraint that shapes everything

A hosted server (`matrix.zbautomations.ie`, on the GCE VM) **cannot reach a
member's laptop.** An agent running on the server only ever sees the server's
disk. "Agent access to your own device" is only possible if code runs **on that
device.** So the architecture is: the server hosts the UI, data, cron, and a
control plane; a small **runner** runs on each user's own machine and executes
that user's agent runs locally.

```
   ┌─────────────────────────────┐         outbound WSS          ┌──────────────────┐
   │  matrix.zbautomations.ie    │  ◄─────────────────────────►  │  your Mac        │
   │  (GCE VM)                   │   runner dials OUT, no ports  │  matrix-runner   │
   │                             │                               │                  │
   │  • UI + per-account DBs      │   job: "run agent X" ──────►  │  executes via    │
   │  • cron (schedules only)     │   ◄────── transcript blocks   │  Agent SDK,      │
   │  • control plane / job queue │                               │  full local FS,  │
   │  • streams blocks to UI      │                               │  user's own token│
   └─────────────────────────────┘                               └──────────────────┘
```

## Non-negotiable realities (set expectations before building)

1. **Install is a guided, one-click-ish flow — and no Apple fee is required.**
   Decision (owner): we will **not** pay for an Apple Developer account / code
   signing. That is fine, because we distribute the runner **as a script/Node
   process, not a packaged `.app`** — and macOS Gatekeeper's scary "unidentified
   developer, can't be opened" block only applies to downloaded `.app` bundles
   and binaries, **not** to scripts the user runs themselves. See "Install UX
   (no signing)" below. The unavoidable-and-desirable part is the per-category
   **TCC consent prompts** (Full Disk, Photos, Contacts, etc.) — those are just
   "Allow" dialogs the user clicks once; they need no signing. They'll be
   attributed to `node`/Terminal rather than a branded app name, which is an
   acceptable cosmetic tradeoff for a free, self-installed tool.
2. **Cron can only schedule; execution needs that user's runner online** (their
   laptop awake + connected). This is the "Mac must be on" limitation, now
   per-user. It's a known limitation, not a bug — surface it in the UI ("runner
   offline — queued").
3. **The runner token is a full-device-takeover credential.** Trust direction is
   fixed from day one: the runner executes **only the user's own agent configs**
   (fetched by id, validated), never arbitrary commands the server hands it — so
   a server compromise can never become RCE on every paired machine. Tokens are
   revocable + rotatable from the UI.

## Sequencing (the important part)

### Track 1 — ship owner login FIRST (independent of all of this)

Phases 1–3 (real login + per-account isolation + account management) are a
76-route refactor that has **never run in production.** It essentially *is* the
original ask ("sign me in via my own account; multiple accounts"). It's verified
locally end-to-end (middleware gate, bootstrap, cookie session, per-account
routes, member-login gate). **Deploy this on its own, validate live, before
stacking a distributed system on top.** Do not let the runner project block it.

### Track 2 — the runner platform, MVP-first

**The MVP is your own Mac, not members.** Pairing your Mac to the VM proves the
entire spine with zero installer/distribution/member complexity. Everything else
is polish on a working spine.

- **R1 — Control-plane spine (server-side, testable).** `runners` +
  `runner_jobs` tables; `POST /api/runner/pair` (one-time code → scoped token);
  `GET/WS /api/runner/connect` (authed, persistent); job enqueue + status;
  "runner online/offline" surfaced in the UI. No runner binary yet — test with a
  scripted mock client.
- **R2 — The runner process.** A slim local Node process reusing the existing
  `lib/services/agent-runner.ts` + Agent SDK, in "runner mode": dials the WS,
  authenticates, receives a job (agent id + prompt), executes locally with the
  **user's own** Claude token / API keys held locally, streams blocks back.
  Manual pair for now: `npx matrix-runner pair <code>`.
- **R3 — Route agent runs through the runner.** Triggering an agent (UI or cron)
  enqueues for that user's runner; blocks stream back into that user's DB and to
  the live run view; runner-offline → queued state. Prove one real end-to-end run
  on your Mac.
- **R4 — Per-user credentials.** Add "Claude subscription (OAuth token)" as an AI
  provider kind alongside API keys; the runner uses the triggering user's own
  credentials so usage/limits are theirs. (Chat already uses per-account
  providers via DB isolation — this extends it to agents.)
- **R5 — Member enablement.** Open member login *only* once a member has a paired
  runner; before that, members get data-only features + a "connect your runner"
  state. Remove the current hard 403 gate at this point.
- **R6 — Reworked onboarding.** A replayable, in-depth tutorial (settings button
  to replay) explaining the local-first model, walking through: create account →
  download + pair runner → grant OS permissions → first agent run.
- **R7 — Install polish (no signing, no fee).** launchd (mac) / systemd (linux)
  LaunchAgent for auto-start + reconnect; the download button + `.command`
  installer below; guided TCC permission grants. No notarization.

### Install UX (no signing, no Apple fee)

The onboarding "Install runner" step gives the user two equivalent, free paths —
both avoid the Gatekeeper `.app` block because nothing is a packaged app:

1. **Copy-paste command (fastest):** one line the user pastes into Terminal, e.g.
   `curl -fsSL https://matrix.zbautomations.ie/install-runner.sh | sh -s -- <pair-code>`
   (or `npx matrix-runner pair <pair-code>` if we publish to npm). Terminal runs
   scripts the user explicitly invokes — Gatekeeper doesn't gate this at all.
2. **Double-clickable installer (the "button"):** the dashboard serves a
   `matrix-runner-install.command` file (a shell script with the `.command`
   extension that Terminal opens on double-click), pre-filled with the user's
   pair code. First double-click shows a single ordinary "are you sure you want
   to open this" prompt (not the dead-end "unidentified developer" block), then
   it runs. This is the closest thing to a one-click install without paying.

Either path: downloads the runner (a small Node bundle), pairs it with the
account, and registers a launchd LaunchAgent so it starts on login and
reconnects. The OS then shows normal "Allow access to Files/Photos/Contacts?"
TCC prompts the first time an agent actually touches that data — the user clicks
Allow. All free, all script-based, zero developer account.

Ship R1–R3 on your own Mac before touching member distribution (R6/R7). The
remaining cost there is cross-platform coverage + support, **not** Apple signing.

## Open decisions (for later phases, not blocking R1–R3)

- ~~Signing/notarization~~ **Decided: no Apple Developer account, no signing.**
  Script-based install (see "Install UX") instead.
- Runner ↔ data: runner is stateless (streams back to hosted DB) vs. a local
  cache for offline. Start stateless.
- Windows/Linux members, or macOS-only to start (matches current usage)?

---

## P2 design (agent execution via runner) — resolved, ready to build

Status: **P0/P1a/P1b shipped** (control plane + runner app + distribution, all
pushed to `feat/matrix-runner`, several live-verified). P2 is the next phase and
the trickiest seam. Design below incorporates an advisor review of the
network-boundary correctness risks.

**Shape:** extract `executeRun`'s core (SDK query loop + policy + `canUseTool` +
git reversibility — all legitimately device-local) from `lib/services/agent-runner.ts`
into a `runner-core` module with two injected interfaces:
- **RunSink** — where blocks/status/usage go. Server-legacy impl = `getDb()` +
  `flushBlocks` + `publishRunEvent` (unchanged). Device impl = `run_event` /
  `usage` / `job_status` uplink frames.
- **ApprovalBridge** — `canUseTool`'s queue/break_glass path. Server-legacy =
  `requestApprovalDecision` (DB + in-process registry). Device = `approval_request`
  frame out → await decision.

`startRun` gains a fork: if the user has a default online device, create the
`agent_runs` row (`execution='runner'`, `device_id=…`) and `enqueueJob('agent_run', {agentRunId, agentConfig, prompt, token})`
instead of running in-process. Server keeps the run row, run-bus UI streaming,
approvals inbox, cancel/kill, cron.

**The four things that bite (advisor), in order:**
1. **Token seam (gates the first device run).** The device SDK has no
   `CLAUDE_CODE_OAUTH_TOKEN`. Per decision 5 the subscription token is
   server-stored → the dispatch payload must carry the decrypted token; the
   runner injects it into the SDK's scrubbed env per job, **memory-only**, never
   written to `runner_jobs`/logs. (Entangled with P3's `claude-subscription`
   provider — build the storage there, thread it here.)
2. **Tool-server bridge (RESOLVED — bounded).** `buildAgentToolServer` has 3
   tools (`flagUrgent`, `runAgent`, `agentStatus`); ALL touch server account
   state (`getDb`, `startRun`, notify). On device they become thin RPC stubs →
   `POST /api/runner/tool-call` (runner-token authed) → server runs the real
   tool in the user's account context, returns the text result. One endpoint,
   one pattern. `runner-core` therefore assumes NO local `getDb()`.
3. **Approval delivery must be durable (real bug to avoid).** A pushed
   `approval_decision` frame is lost if the device is mid-reconnect when the user
   decides (waits are minutes–hours; the stream WILL drop). Fix: decisions
   persist in `agent_approvals` (already do). The runner **reconciles pending
   approvals for its in-flight jobs on every (re)connect AND polls** (mirror the
   existing 5s DB-poll + registry pattern in `agent-approvals.ts`, across the
   wire) — never push-only. Add `GET /api/runner/approvals` (runner-token authed,
   returns decisions for the device's in-flight jobs).
4. **Guardrail: server-legacy path must stay a behavioral no-op.** `executeRun`
   runs in PRODUCTION now; big-bang branch won't deploy until P8, so a
   server-path regression is invisible for weeks. The extraction must be provably
   inert for the existing owner-on-VM flow — keep the current agent tests green
   AND keep exercising in-process execution.

**Integration test (real runner process vs test server):** approved · denied ·
**decision-arrives-while-device-briefly-disconnected** (the reconnect reconcile) ·
cancel-mid-await · server-restart-mid-run. Plus: server-legacy in-process run
still works unchanged.
