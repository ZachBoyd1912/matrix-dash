# The Obsidian vault as the shared memory layer

Three independent systems can all write into the same Obsidian vault. None of
them share a database — the vault's folder structure is what unifies them.
Don't try to merge the underlying storage; keep this convention instead.

## Subfolders

| Folder | Owner | What lives there |
|---|---|---|
| `Matrix Notes/` | Matrix Dashboard (`lib/services/obsidian-sync.ts`, `NOTES_SUBDIR`) | The `notes` table — manual wiki-style docs, two-way synced. |
| `Memory Bank/` | Matrix Dashboard (`MEMORIES_SUBDIR`) | The `memories` table — facts extracted from chat, agent-saved memories, and manually created ones. Two-way synced. |
| `Claude Code/Memory/<project>/`, `Claude Code/Sessions/` | Claude Code sessions on this Mac (per a `~/.claude/CLAUDE.md` instruction, not code in this repo) | Claude Code's own file-based memory system, mirrored into the vault whenever a new memory file is written in a session. Still one-way for WRITES (Claude Code → vault; matrix-dash never writes here — see below). matrix-dash READS it, along with every other folder in the vault, through the persisted index described below — there is no Claude-Code-specific read path any more. |
| Wherever `agentmemory`'s `memory_obsidian_export` tool is pointed | The `agentmemory` MCP server (an entirely separate local daemon on `localhost:3111`, used by `/recall`/`/remember`/`/recap`) | A one-shot export of that server's own LevelDB-backed store. One-way, on-demand only — nothing schedules it and nothing imports back from the vault. Point its `vaultDir` argument at this same vault if you want its content living alongside everything else. |

Any AI agent — Matrix Dashboard's own agents, or Claude Code — can read
across all four folders once it has access to the vault, since it's all just
markdown with YAML frontmatter. That's the entire integration: a shared
folder tree, not a shared database.

## How Matrix Dashboard's two-way sync actually works

`lib/services/obsidian-sync.ts` is the merge engine — frontmatter parsing,
collision handling, and staleness comparison all live there and are shared
by every sync path below. Nothing else re-implements this logic.

Two ways a vault gets connected, meant to complement each other rather than
being an either/or choice:

1. **File System Access API** (`lib/hooks/use-obsidian-vault.ts`, Chrome/Edge
   only) — a browser-native folder picker, no install. The browser walks the
   vault directory and POSTs a manifest (`{relPath, mtimeMs}` per file) to
   `POST /api/notes/sync/browser-manifest`; the server diffs that against
   the DB (same logic `reconcileAll()` uses for a local filesystem walk) and
   returns a plan of what to push/pull. The browser does the actual file
   I/O — write the push list, read the pull list — then reports back to
   `POST /api/notes/sync/browser-apply`, which runs the same merge functions
   (`applyNoteFromVaultContent`/`applyMemoryFromVaultContent`) that the
   local-fs path uses. Only works while a tab with that granted permission
   is open on that device — no background sync when the dashboard is closed.
2. **Matrix Runner** — a paired device gives the server a way to read/write a
   vault on the user's own machine even when no browser tab is open, which is
   what makes true always-on sync possible. `reconcileAll()` in
   `obsidian-sync.ts` tries this host's filesystem first, then falls back to
   `tryRemoteFs()` (`lib/services/runner-fs.ts`) against the owner's paired
   device — live-verified end-to-end in production (push and pull both
   confirmed against a real vault).

A 10-minute cron (`lib/services/daemon.ts`, `s.obsidianSync`) also runs
server-side, wrapped in `runWithUser({..., isOwner: true}, ...)` so
`tryRemoteFs()` can resolve the owner's device (crons have no request/session
context to inherit one from otherwise). It checks reachability via
`isVaultReachable()` (local fs OR the paired device) and writes an honest
`obsidianCronStatus` setting either way — `unreachable-from-this-host` only
means neither path currently works, not that the feature is unimplemented.

## The unified Vault page

`app/dashboard/vault` (formerly two separate pages, `/dashboard/notes` and
`/dashboard/memory-bank`, both now redirected in `next.config.ts`) browses the
**whole vault** — every folder, at any depth, discovered from the data. A left
sidebar renders the real folder tree (`Matrix Notes` and `Memory Bank` pinned
to the top because matrix-dash owns them, everything else alphabetical below),
and a List/Graph toggle switches between reading one file and a force-directed
graph of the entire vault.

### The persisted index is the single source

`vault_files` + `vault_links` + the `vault_files_fts` FTS5 table hold a mirror
of the vault. **`lib/services/vault-index.ts` is the only writer**;
`lib/services/vault-query.ts` is the only reader, and every surface — sidebar
tree, file viewer, search, graph — is answered from it. Nothing else scans.

This exists for one reason: in production the app runs on a GCE VM and the
vault lives on the owner's Mac. When that Mac sleeps, a filesystem-backed page
has nothing to show. With the index, the page stays browsable and searchable
and says plainly that it is showing the last indexed copy
(`stale`/`unreachable`/`partial` on every response).

Scanning is incremental: one tree op lists everything with mtimes, and only
text files whose mtime changed are re-read, in parallel chunks of 20 (each
remote read is a full bridge round-trip). Three rules are load-bearing and
each one is protected by a test:

- **Links are rebuilt from the index, never from the files re-read this pass.**
  Because unchanged files are skipped, their content is not in memory; sourcing
  links from the current pass would delete everything else and collapse the
  graph to a handful of edges.
- **A failed read is not an empty file.** Writing `""` would wipe that file's
  links and its full-text row while looking like success.
- **An unreachable vault leaves the index untouched.** A stale index beats an
  empty one, and "cannot verify" must never be recorded as a fact.

Reachability mirrors `obsidian-sync.ts`: this host's filesystem first, the
paired Matrix Runner device second. A 20-second budget and a per-user
single-flight keep an awaited scan from blocking a page load behind a device
that is paired but wedged.

### Reading vs. writing

Files matrix-dash owns (a `vault_files` row whose path maps to a `notes` or
`memories` row) open in `NoteEditor`/`MemoryDetail` with full read/write.
Everything else — Claude Code's memory, session write-ups, the vault README,
anything the operator adds later — opens in `VaultFileViewer`: frontmatter
badges, rendered body, a backlinks panel, an `obsidian://open` link, and no
edit affordances at all. `app/api/vault/*` exports `GET` only, which is what
actually enforces that (Next.js 405s anything else).

Notes and memories with no vault file yet (Obsidian sync off, or not yet run)
are still listed in their usual folder, flagged `notInVault`. Without that, a
pure mirror of the vault would hide the user's own notes from the page whose
job is to show them.

### Links, ghosts and the graph

Link extraction is one regex covering both `[[link]]` and `![[embed]]`,
deliberately not `lib/utils/wiki.ts`'s `extractWikiLinks` — that regex also
matches the `[[b]]` inside `![[b]]`, so a separate embed pass emits two rows
for one reference and draws a doubled edge.

Resolution matches Obsidian: an explicit vault-relative path wins, otherwise
basename, case-insensitively, with `#heading` and `^block` anchors stripped.
Collisions are real (two projects each have a `MEMORY.md`), so the tie-break is
deterministic at every step — same folder, then shallowest path, then
lexicographic — never left to Map insertion order.

A `[[target]]` that resolves to nothing is stored with a null `target_path` and
rendered as a faded ghost node, the way Obsidian shows a dangling link, rather
than being dropped.

The graph caps at 1500 nodes, sorted by path before truncation so the cut is
deterministic, and reports `truncated` with the real total — it never silently
shows a subset. Colour is assigned by position in the *sorted* list of
top-level folders, so a folder keeps its colour when another appears.

**Superseded:** the earlier design read Claude Code files live through the
bridge and therefore had to scope the graph to one project at a time via
`?ccProject=`. The index removed the round-trips that constraint existed for;
the parameter and `lib/services/claude-code-vault.ts` are both gone.

## Known gap: no real-time push

Direct edits made inside Obsidian itself only get picked up on the next
scan (chokidar watcher for the local-fs path, the 30-min interval or manual
sync for the browser path, the 10-min cron server-side). There is no
mechanism today for a device to proactively tell the server "a file just
changed" — the wire protocol Matrix Runner uses
(`lib/runner/protocol.ts`) has no such frame, only request/reply. Adding
true real-time reactivity would need a new frame type plus a watcher
process on the runner side. Deliberately out of scope until there's a
concrete need for it — polling on the cadences above is the accepted
trade-off for now.
