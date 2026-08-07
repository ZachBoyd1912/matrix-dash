# Vault Index, Graph Parity, and Runner Reliability — Design

**Date:** 2026-08-07
**Status:** Approved, pending implementation plan

## Context

Three problems surfaced the morning after the unified Vault page shipped. The first two share a root cause — a silently dead device connection, and code that treats "cannot verify" as "confirmed deleted". The third is independent: the graph was built too narrowly.

**1. Overview reports every project as missing.** All 12 project rows read `presence: "missing"`, yet all 12 paths exist on the owner's Mac. The cause is in `lib/services/portfolio-sync.ts`, added the previous evening: `resolveRemotePathExists()` returns `null` when no paired device answers, and the caller then falls back to `reconcile()`'s default `fs.existsSync` — which, running on the GCE VM, is asked about Mac paths it can never see and correctly answers "no" for all of them. The code treats "cannot verify" as "confirmed deleted". That is fail-unsafe, and it is the actual bug.

**2. The Matrix Runner connection dies silently.** The device last checked in at 2026-08-06T20:50:55Z and never reconnected, with no error in its own log. `runner/src/connect.ts`'s `consumeFrames()` awaits `reader.read()` with no timeout. When the long-lived downlink is dropped without a clean close (Cloudflare reaping an idle response, a NAT/keepalive expiry, or the laptop sleeping), the read never resolves and never rejects. The runner believes it is connected forever; the server marks it offline after 45s of missed pongs. This is what left the device offline at 04:30, which is what triggered problem 1.

**3. The vault graph shows almost no edges and only part of the vault.** Two separate causes. Edges: the default graph draws only `noteLinks` and `memoryLinks`, and there is exactly one note while `memoryLinks` are AI/embedding-derived rather than `[[wikilink]]`-derived — so there genuinely are near-zero edges to draw. Scope: Claude Code files were deliberately limited to one project at a time to avoid 150+ serial round-trips through the bridge, and folders outside the three hardcoded sections (`Claude Code/Sessions/`, the vault `README.md`, anything added later) were never indexed at all.

**Separately confirmed, not a code bug:** `github_connections` has zero rows. No GitHub repository data can appear in Overview until that integration is reconnected in Settings → Integrations → GitHub. Called out here so the expectation of "some that are GitHub repos" is not silently left unmet.

**Intended outcome:** the Vault page mirrors the real Obsidian vault in both tree and graph, including edges; Overview reports project state honestly and never invents a missing project; the runner reconnects itself when a connection dies; and deploys stop costing a full VM resize cycle.

## Decisions locked during design

| Area | Decision |
|---|---|
| Sidebar scope | Fully dynamic — mirrors every folder found in the vault |
| Sidebar order | Matrix Notes and Memory Bank pinned top; all other folders alphabetical below |
| Graph nodes | Every file, including attachments |
| Ghost nodes | Yes — unresolved `[[links]]` render faded, matching Obsidian |
| Orphans | Shown |
| Link collisions | Same-folder first, then shallowest path |
| Graph cap | ~1500 nodes, with an explicit notice when truncating |
| Node colours | By top-level vault folder |
| Node click | Opens the file and reveals it in the sidebar tree |
| Backlinks | Shown for read-only vault files too |
| Search | Vault-wide, full-text across all indexed files |
| Offline behaviour | Serve the last persisted scan, with a visible staleness banner |
| Refresh | On page open, then every 10 minutes while open |
| Connection status | Topbar indicator, plus a notification after 5 minutes down, once per outage |
| Open in Obsidian | `obsidian://` deep link on every vault file |
| Projects fix scope | Full — fail-safe checks *and* real repo scanning through the device |
| New notes | Continue to be created in `Matrix Notes/` only |
| Note deletion | Routed through the device bridge (fixes a known no-op on the VM) |
| Deploy pipeline | CI uploads the build; the VM downloads it instead of rebuilding |
| Sequencing | Two deploys — fixes first, vault rebuild second |
| Dedicated server box | Explicitly out of scope; recorded as a future option only |

## Architecture

### The vault index

One scanner, three consumers. `lib/services/vault-index.ts` owns all vault reading; the sidebar tree, the graph, and search each read the persisted index rather than scanning independently.

**Storage.** Two new tables, so the index survives both a device disconnect and an app restart — the requirement that makes offline browsing work at all:

- `vault_files` — `relPath` (PK), `name`, `ext`, `dirPath`, `mtimeMs`, `isText`, `content`, `indexedAt`
- `vault_links` — `id`, `sourcePath`, `targetPath` (nullable for ghosts), `targetRaw`, `kind` (`wikilink` | `embed`)

`vault_files.content` is additionally indexed with FTS5, matching the existing precedent in `lib/db/client.ts` (`backfillSkillsFts`). This is what makes vault-wide search work offline; an in-memory cache could not.

**Scanning is incremental.** One `tree` op returns every file with an `mtimeMs` (already added to `TreeEntry` and `runner/src/fs-ops.ts`'s `walk()` in the previous pass). Only text files whose `mtimeMs` differs from the stored row are re-read, in chunks of 20 parallel `read` ops. A first scan reads ~100 files; steady state reads zero.

This is deliberately chosen over adding a batched `read-many` protocol op. Incremental scanning makes the batch case rare enough that a protocol change — and its device rollout-ordering problem, where the server would call an op the device does not yet support — is not worth the risk. `read-many` remains a clean future optimisation if a cold scan ever becomes slow.

**Reachability mirrors `obsidian-sync.ts`:** local filesystem first, `tryRemoteFs()` second, and if neither resolves, the scan is skipped entirely and the existing index is served as-is with its `indexedAt` timestamp driving the staleness banner. A failed scan must never delete or empty the index.

### Node identity

Every graph node is `vault:<relPath>`, one uniform identity space.

Resolution to an editable row happens at selection time, not at index time. `notes.vaultRelPath` and `memories.vaultRelPath` store a **bare filename**, not a vault-relative path — verified directly against the production database (`Site Auditor — 2026-07-09.md`, not `Matrix Notes/Site Auditor — 2026-07-09.md`). So mapping a scanned file to a row compares `basename(relPath)` against `vaultRelPath`, scoped by which folder the file sits in:

- under `Matrix Notes/` and basename matches a note → open `NoteEditor`
- under `Memory Bank/` and basename matches a memory → open `MemoryDetail`
- otherwise → open the read-only vault file viewer

Getting this wrong would render every note and memory as a read-only file instead of opening its editor, so it is called out explicitly.

Existing sidebar selection ids (`note:<id>`, `memory:<id>`) and the `?vault=&focus=` deep links from the redirect stubs are unchanged.

### Link resolution

`lib/utils/wiki.ts`'s `extractWikiLinks()` is reused for `[[target]]`; embeds (`![[file.png]]`) are extracted alongside and stored with `kind: "embed"` so attachments connect to the notes that reference them.

Targets resolve by basename across the whole vault. On collision — two files genuinely share the name `MEMORY.md`, in `Claude Code/Memory/bolt.new-custom/` and `Claude Code/Memory/matrix-dash/` — the winner is the candidate in the same directory as the source file, else the one with the fewest path segments, else lexicographically first. Deterministic at every step; never left to `Map.set` insertion order.

Unresolved targets are stored with `targetPath: null` and render as faded ghost nodes.

### Reading a vault file

The read-only viewer (`vault-file-viewer.tsx`, generalising the current Claude-Code-only one) shows parsed frontmatter, rendered content with `[[links]]` clickable via the existing `WikiContent`, and two additions:

- **Backlinks** — "what links here", read straight from `vault_links` by `targetPath`. Free, since the index already computes every edge, and more useful than the graph for day-to-day navigation between memory files.
- **Open in Obsidian** — an `obsidian://open?vault=<name>&file=<relPath>` deep link, giving read-only files a one-click route to being edited in the real app. Only meaningful when browsing from the machine holding the vault; rendered unconditionally, since the OS simply ignores an unhandled scheme elsewhere.

### Search

`app/api/vault/search/route.ts` queries the FTS index and returns matches across every indexed file. The sidebar search box uses it as the single source for all sections, replacing today's split behaviour (full-text for notes/memories via their own endpoints, filename-only for everything else) — a split that becomes actively confusing once the sidebar shows the whole vault.

### Offline and staleness

The API always answers from the persisted index. Each response carries `indexedAt` and whether the last refresh attempt succeeded. The page shows a banner when the index is stale or the device is unreachable.

Because text file contents are stored in the index, browsing, reading and searching every `.md`/`.txt` file all work fully offline. Only binary attachments — which are indexed by path but never have their bytes stored — require the device to open, and say so explicitly rather than rendering blank.

Refresh runs on page open and every 10 minutes while the page stays open, matching the existing `obsidianSync` cron cadence in `lib/services/daemon.ts` so the index and the notes/memories tables never drift far apart. A refresh attempted with no reachable vault is a no-op that only updates the staleness state.

### Graph rendering

Colours are assigned per top-level vault folder, allocated from a fixed palette in a stable order so a folder keeps its colour between loads. Ghost nodes render hollow and dimmed. The 1500-node cap applies deterministically — files sort by path before truncation, never by scan order — and the UI states the count when it truncates.

## Bug fixes

### Projects: fail-safe verification and active repair

`reconcile()`'s injectable check becomes tri-state — `"exists" | "gone" | "unknown"` — replacing the current boolean. Only `"gone"` may mark a project missing; `"unknown"` leaves the row untouched.

**Authority is decided per path, not globally.** A negative result is trustworthy only if the path's *parent directory* is readable from wherever the check ran. On the VM, `/Users/zach/Desktop` does not exist, so all 12 rows return `"unknown"` and none are touched. On the Mac, the parent lists fine, so a genuinely deleted project still correctly reads `"gone"`. This is exact rather than heuristic — an earlier idea of gating on "did the local scan find any repos at all" would misreport paths under a root that was momentarily unreadable.

**Repair is active, not passive.** Leaving `"unknown"` rows untouched preserves the *wrong* value for the 12 already stored as missing, so a fix that only stops new false positives would appear to have done nothing. When a path verifies as `"exists"` but matched no local scan, its presence is re-derived from what is actually known: `local+github` if the row already carries a `githubRepo`, otherwise `local-only`. That is what clears the existing 12.

These repair writes update `presence` and sync timestamps **only**. They must not push null `branch` / `lastCommitAt` / `lastCommitMessage` over real stored values — the same class of overwrite already fixed in `upsertProjects` for `path` the previous evening. Implemented as an explicit presence-only update path rather than a full row upsert.

**Real repo scanning.** With a device online, `scanLocalRepos()` runs through the bridge: a `tree` op over the configured `portfolio_scan_roots` finds `.git` directories, then the `git-status` op — already written in `runner/src/fs-ops.ts` and currently unused — returns branch, dirty-file count and last commit per repo. Production gains live git metadata it has never had, because the VM cannot see the disk. Falls back to the existing local `execFileSync` path when running somewhere that can see the repos directly.

### Runner: connection watchdog

`connect.ts` records the timestamp of every frame received, including pings. An interval checks for silence exceeding 60s — three missed server pings at the existing `HEARTBEAT_MS` of 20s — and aborts the connection, which surfaces as a normal read rejection and triggers the existing jittered-backoff reconnect.

Two implementation details that will otherwise bite:

- The abort signal must combine the watchdog with the optional `opts.stopSignal`. `AbortSignal.any()` requires a real array — passing `[undefined]` throws — so the array is built conditionally.
- The interval must be cleared when `consumeFrames` returns or throws, or a long-running process leaks one timer per reconnect cycle.

`isRunnerOnline()` and `OFFLINE_AFTER_MS` on the server are unchanged; this is purely the client learning to notice its own death.

### Connection visibility

A topbar indicator polls `/api/runner/devices` and shows connected / disconnected / no-device-paired. A notification fires only after the device has been continuously offline for 5 minutes, and at most once per outage — a laptop lid closing must not generate an alert, or the signal is lost to noise.

### Note and memory deletion

`app/api/notes/[id]/route.ts` and `app/api/memories/[id]/route.ts` currently delete the vault file with a direct `fs.rmSync`, which silently no-ops on the VM. The file survives and is re-imported as a new note on the next reconcile — a deleted note effectively resurrects. Both routes switch to `tryRemoteFs("delete", …)` with the existing local fallback, matching the pattern `reconcileAll()` already uses.

### Deploy pipeline

CI already runs the full `pnpm build` on every push (`.github/workflows/ci.yml`) on a 16GB runner, then discards the output. The VM then rebuilds the identical thing on hardware that cannot do it without being resized first.

CI uploads the standalone build and the runner bundle as an artifact; the deploy downloads and swaps it. The e2-micro never builds again and no resize is needed, taking a deploy from roughly 40 minutes to 2–3.

Independently, `matrix-dash.service` sets no `TimeoutStopSec`, so systemd waits the full 90-second default on every stop — observed hitting that timeout and being SIGKILLed. Setting it to 10s removes a fixed delay from every restart.

**Acknowledged:** this change ships *in* deploy 1 and therefore cannot accelerate deploy 1 itself. One more slow cycle, then fast thereafter.

## Phasing

Two independently shippable phases, each with its own deploy and live verification. This is the delivery unit — the implementation plan should treat them as separate milestones, not one batch.

**Phase A — stop the wrong data.** Tri-state path verification, active repair of the 12 stuck rows, `git-status` wiring, the runner watchdog, the topbar status indicator, the note/memory delete fix, and the CI-artifact deploy pipeline. Everything here is a bug fix against code already in production; none of it depends on the vault index. Deployed the existing slow way, since the pipeline change cannot accelerate its own deploy.

**Phase B — the vault index and graph.** New tables and FTS, `vault-index.ts`, the general vault routes, the dynamic sidebar, the rebuilt graph, search, backlinks, and the Obsidian deep link. Larger and riskier, and it benefits from Phase A having made both the device connection reliable and deploys fast.

Phase A is what the owner is currently looking at being wrong, so it goes first.

## Files

**New:** `lib/services/vault-index.ts`, `app/api/vault/index/route.ts` (tree + staleness), `app/api/vault/file/route.ts` (generalises the Claude-Code-only reader), `app/api/vault/search/route.ts`, `components/vault/vault-file-viewer.tsx` (generalises `claude-code-viewer.tsx`), `components/layout/device-status.tsx`.

**Modified:** `lib/db/schema.ts` and `lib/db/client.ts` (two tables + FTS), `lib/services/portfolio-sync.ts` (tri-state, presence-only repair, bridge scanning), `runner/src/connect.ts` (watchdog), `app/api/vault/graph/route.ts` (reads the index), `components/vault/vault-sidebar.tsx` (dynamic tree), `components/vault/vault-graph.tsx` (folder colours, ghosts, cap), `app/dashboard/vault/page.tsx`, `app/api/notes/[id]/route.ts`, `app/api/memories/[id]/route.ts`, `.github/workflows/ci.yml`, `deploy/setup-server.sh`, `docs/obsidian-vault-layer.md`.

**Retired:** `app/api/vault/claude-code/route.ts` and `.../file/route.ts`, superseded by the general vault routes; `lib/services/claude-code-vault.ts` folds into `vault-index.ts`; `components/vault/claude-code-viewer.tsx` is replaced by `vault-file-viewer.tsx`. All are deleted rather than left unreferenced — the previous pass established that precedent when retiring the two old graph components.

## Error handling

- Vault unreachable → serve the stored index, flag staleness, never empty it.
- Path unverifiable → `"unknown"`, never `"missing"`.
- `git-status` failure on one repo → that repo keeps its stored metadata; the rest of the sync proceeds.
- Graph exceeding the node cap → render the cap and say so explicitly; never truncate silently.
- Device offline during a delete → surface the failure rather than reporting success, so the vault file is not silently orphaned.

## Testing

Unit: tri-state resolution including the parent-directory authority rule; presence-only repair preserving git metadata; link resolution collision ordering; ghost-link handling; incremental scan skipping unchanged mtimes.

Integration: watchdog firing on a stalled stream and reconnecting; vault index surviving a simulated restart; search returning results with the device offline.

Live verification, against real production and the real vault: all 12 project rows recover from `missing`; graph renders vault-wide edges including cross-folder links; sidebar lists folders outside the original three; a file deleted in the dashboard disappears from the vault; the device recovers on its own after a forced connection drop. Live checks matter here specifically because every bug in this document passed typecheck, lint and tests while being wrong at runtime.

## Out of scope

Real-time vault push (still polling), editing Claude Code files from the dashboard, an embedded Obsidian app, and a `read-many` batched protocol op.

**Dedicated always-on server** — recorded, not designed for. Moving off the e2-micro would remove the resize problem entirely and, with a synced vault copy, keep a runner online permanently, which is the underlying cause of the staleness this document is fixing. Caveat worth keeping visible: an old desktop idling near 60W costs roughly €180/year at Irish electricity prices, comfortably more than a €100 purchase price within a year; a used mini-PC or thin client at ~10W is closer to €30/year for the same benefit. Nothing in this design assumes such a box exists.
