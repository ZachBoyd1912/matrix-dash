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

1. **"Auto-install" can't be silent — and mustn't be.** A daemon with Full Disk /
   Photos / Keychain access triggers macOS Gatekeeper + per-category TCC consent
   prompts *by design*. Safe distribution requires a **code-signed, notarized**
   artifact (Apple Developer account, ~$99/yr). Realistically the flow is a
   *guided* install: download → run → approve a sequence of OS prompts. Anything
   that bypassed those prompts would be indistinguishable from malware.
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
- **R7 — Guided install polish.** Code-signed/notarized artifact; launchd (mac) /
  systemd (linux) service; one-click download + guided permission grants.

Ship R1–R3 on your own Mac before touching member distribution (R6/R7), which is
where the cost (Apple signing, cross-platform, support) lives.

## Open decisions (for later phases, not blocking R1–R3)

- Signing/notarization: register an Apple Developer account now, or defer until
  members are real?
- Runner ↔ data: runner is stateless (streams back to hosted DB) vs. a local
  cache for offline. Start stateless.
- Windows/Linux members, or macOS-only to start (matches current usage)?
