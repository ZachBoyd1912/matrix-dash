# The Obsidian vault as the shared memory layer

Three independent systems can all write into the same Obsidian vault. None of
them share a database — the vault's folder structure is what unifies them.
Don't try to merge the underlying storage; keep this convention instead.

## Subfolders

| Folder | Owner | What lives there |
|---|---|---|
| `Matrix Notes/` | Matrix Dashboard (`lib/services/obsidian-sync.ts`, `NOTES_SUBDIR`) | The `notes` table — manual wiki-style docs, two-way synced. |
| `Memory Bank/` | Matrix Dashboard (`MEMORIES_SUBDIR`) | The `memories` table — facts extracted from chat, agent-saved memories, and manually created ones. Two-way synced. |
| `Claude Code/Memory/<project>/` | Claude Code sessions on this Mac (per a `~/.claude/CLAUDE.md` instruction, not code in this repo) | Claude Code's own file-based memory system, mirrored into the vault whenever a new memory file is written in a session. One-way (Claude Code → vault); nothing reads it back. |
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
2. **Matrix Runner** (Phase 4, not yet wired as of this doc) — a paired
   device gives the server a way to read/write a vault on the user's own
   machine even when no browser tab is open, which is what makes true
   always-on sync possible, and is unconditionally required for the
   project-paths bug fix regardless of Obsidian.

A 10-minute cron (`lib/services/daemon.ts`, `s.obsidianSync`) also runs
server-side. Today it can only succeed if the configured vault path happens
to be reachable from wherever the Node process runs (i.e. running the dev
server locally on the same Mac as the vault) — in production, on the GCE VM,
it correctly detects this and writes an honest
`obsidianCronStatus = "unreachable-from-this-host"` rather than silently
doing nothing, which is what happened before this existed. Once Phase 4
wires this cron through the Matrix Runner bridge instead of raw `fs` calls,
the exact same registration starts working in production without needing to
change again — only the reachability check underneath it changes.

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
