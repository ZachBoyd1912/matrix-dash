# The Obsidian vault as the shared memory layer

Three independent systems can all write into the same Obsidian vault. None of
them share a database — the vault's folder structure is what unifies them.
Don't try to merge the underlying storage; keep this convention instead.

## Subfolders

| Folder | Owner | What lives there |
|---|---|---|
| `Matrix Notes/` | Matrix Dashboard (`lib/services/obsidian-sync.ts`, `NOTES_SUBDIR`) | The `notes` table — manual wiki-style docs, two-way synced. |
| `Memory Bank/` | Matrix Dashboard (`MEMORIES_SUBDIR`) | The `memories` table — facts extracted from chat, agent-saved memories, and manually created ones. Two-way synced. |
| `Claude Code/Memory/<project>/` | Claude Code sessions on this Mac (per a `~/.claude/CLAUDE.md` instruction, not code in this repo) | Claude Code's own file-based memory system, mirrored into the vault whenever a new memory file is written in a session. Still one-way for WRITES (Claude Code → vault; matrix-dash never writes here — see below), but as of the unified Vault page (`app/dashboard/vault`), matrix-dash now READS it: `lib/services/claude-code-vault.ts` browses it read-only via the same local-fs-then-Matrix-Runner-bridge pattern `obsidian-sync.ts` uses. |
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
`/dashboard/memory-bank`, both now redirect here) browses all three matrix-dash-
visible subfolders together: a left sidebar lists Matrix Notes, Memory Bank,
and Claude Code as three collapsible sections, and a List/Graph toggle
switches between reading one item and a combined force-directed graph.

Claude Code's folder is **read-only** in this UI — `lib/services/claude-code-
vault.ts` only exports read functions, and its two API routes
(`app/api/vault/claude-code/route.ts`, `.../file/route.ts`) export `GET`
only, which is what actually enforces it (Next.js 405s anything else). Notes
and memories keep their existing full read/write behavior, reusing the
`NoteEditor`/`MemoryDetail` components unchanged.

**Graph cross-linking asymmetry, by design, not a bug:** notes and Claude
Code files are both authored with `[[wikilink]]` references (`lib/utils/wiki.ts`'s
`extractWikiLinks`), so the unified graph (`app/api/vault/graph/route.ts`)
can resolve links between them by title match. Memories don't — their
`memoryLinks` are AI/embedding-derived from extracted prose that essentially
never contains `[[...]]`, so expect memory nodes to mostly only link to other
memories, not across sources.

**Claude Code graph nodes are scoped to one project at a time**
(`?ccProject=`), not all five loaded simultaneously — reading every file in
every project on every graph render would be 150+ serial `tryRemoteFs`
round-trips through the runner bridge when a device is paired, which is too
slow to be a real render path. A batched runner-side read op (reading a
whole directory's file contents in one round trip, not one request per file)
would be the real fix if a whole-vault graph is ever needed; today's design
deliberately doesn't attempt it.

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
