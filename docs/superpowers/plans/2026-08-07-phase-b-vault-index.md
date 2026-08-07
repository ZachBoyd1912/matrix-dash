# Phase B — Vault Index and Graph Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Note: there is no `superpowers:` skill namespace on this machine. `executing-plans`, `using-git-worktrees`, `requesting-code-review` and `finishing-a-development-branch` are **not installed**. Worktrees are deliberately disabled for this repo (multiple models share one checkout); it commits direct to `main`.

**Goal:** Make the Vault page mirror the real Obsidian vault — every folder in the sidebar, every file in the graph, real connecting edges — and keep it browsable and searchable when the Mac is asleep.

**Architecture:** One persisted index (`vault_files` + `vault_links` + FTS5) is the single source for the sidebar tree, the graph, and search. `lib/services/vault-index.ts` owns all vault reading; nothing else scans. Scanning is incremental by `mtimeMs`, local-fs first and Matrix Runner bridge second, and a failed scan serves the last good index rather than emptying it.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM + better-sqlite3 (FTS5), d3-force, Vitest.

## Global Constraints

- **Never run `pnpm build`** — it crashes this 8GB machine. `pnpm typecheck` is the gate.
- Verification order: `pnpm typecheck` (0 errors) → `pnpm lint` (0 errors; exactly 66 pre-existing warnings, must not increase) → `pnpm test --run`.
- Test baseline is **187 passing**. Every task adds tests; the count only goes up.
- `~/MatrixDash/matrix.db` on the dev Mac is **real operator data**. Tests use the in-test fixture — `vitest.setup.ts` mocks `getDataDir`/`getDbPath` to a temp dir, so this is structural, but never bypass it.
- **Never create, modify or delete files under `~/Desktop/Obsidian Vault`** except a clearly-named temp file you delete in the same task. It is the operator's real vault; a stray file there syncs into their real notes.
- Deploy with `./deploy/deploy.sh` (CI artifact, ~2-3 min). Do NOT resize the VM.
- Claude Code's vault folder is **read-only** from matrix-dash. No task may add a write path to it.

## Vault reality (confirmed on disk)

95 files, all `.md`. Top-level: `Matrix Notes/` (1), `Memory Bank/` (21), `Claude Code/` — which contains `Memory/<project>/` across 5 projects plus a `Sessions/` folder and a root `README.md` that the current sidebar cannot show at all.

`notes.vaultRelPath` and `memories.vaultRelPath` store a **bare filename**, not a vault-relative path (verified against production: `Site Auditor — 2026-07-09.md`). Mapping a scanned file to a DB row therefore compares `basename`, scoped by folder.

---

### Task 1: Vault index schema

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/db/client.ts` (INIT_SQL)
- Test: `__tests__/lib/vault-index.test.ts` (create)

**Interfaces:**
- Produces: Drizzle tables `vaultFiles` and `vaultLinks`; FTS5 virtual table `vault_files_fts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { getSqlite } from "@/lib/db/client";

describe("vault index schema", () => {
  it("creates vault_files, vault_links and the FTS table", () => {
    const names = getSqlite()
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(names).toContain("vault_files");
    expect(names).toContain("vault_links");
    expect(names).toContain("vault_files_fts");
  });

  it("full-text searches indexed file content", () => {
    const db = getSqlite();
    db.prepare(
      `INSERT OR REPLACE INTO vault_files
         (rel_path, name, ext, dir_path, mtime_ms, is_text, content, indexed_at)
       VALUES ('X/hello.md','hello','md','X',1,1,'a distinctive phrase here','t')`
    ).run();
    const hit = db
      .prepare("SELECT rel_path FROM vault_files_fts WHERE vault_files_fts MATCH 'distinctive'")
      .all();
    expect(hit.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm test --run __tests__/lib/vault-index.test.ts`
Expected: FAIL — no such table `vault_files`.

- [ ] **Step 3: Add the Drizzle tables**

In `lib/db/schema.ts`:

```ts
// ─── VAULT INDEX (see docs/obsidian-vault-layer.md) ──────
// A persisted mirror of the Obsidian vault so the Vault page stays browsable
// and searchable while the owner's Mac is asleep. Written only by
// lib/services/vault-index.ts.
export const vaultFiles = sqliteTable("vault_files", {
  relPath: text("rel_path").primaryKey(),
  name: text("name").notNull(),
  ext: text("ext").notNull().default(""),
  dirPath: text("dir_path").notNull().default(""),
  mtimeMs: integer("mtime_ms"),
  isText: integer("is_text", { mode: "boolean" }).notNull().default(true),
  // Stored for text files only — this is what makes offline search possible.
  content: text("content").notNull().default(""),
  indexedAt: text("indexed_at").notNull(),
});

export const vaultLinks = sqliteTable("vault_links", {
  id: text("id").primaryKey(),
  sourcePath: text("source_path").notNull(),
  // Null when the [[target]] resolves to nothing — rendered as a ghost node.
  targetPath: text("target_path"),
  targetRaw: text("target_raw").notNull(),
  kind: text("kind", { enum: ["wikilink", "embed"] }).notNull().default("wikilink"),
});
```

- [ ] **Step 4: Add the SQL, following the existing FTS precedent**

In `lib/db/client.ts`'s `INIT_SQL`, alongside the existing `notes_fts`/`memories_fts` definitions:

```sql
CREATE TABLE IF NOT EXISTS vault_files (
  rel_path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ext TEXT NOT NULL DEFAULT '',
  dir_path TEXT NOT NULL DEFAULT '',
  mtime_ms INTEGER,
  is_text INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL DEFAULT '',
  indexed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vault_links (
  id TEXT PRIMARY KEY,
  source_path TEXT NOT NULL,
  target_path TEXT,
  target_raw TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'wikilink'
);
CREATE INDEX IF NOT EXISTS vault_links_source ON vault_links(source_path);
CREATE INDEX IF NOT EXISTS vault_links_target ON vault_links(target_path);

CREATE VIRTUAL TABLE IF NOT EXISTS vault_files_fts USING fts5(
  rel_path, name, content, content=vault_files, content_rowid=rowid
);
CREATE TRIGGER IF NOT EXISTS vault_files_ai AFTER INSERT ON vault_files BEGIN
  INSERT INTO vault_files_fts(rowid, rel_path, name, content) VALUES (new.rowid, new.rel_path, new.name, new.content);
END;
CREATE TRIGGER IF NOT EXISTS vault_files_ad AFTER DELETE ON vault_files BEGIN
  INSERT INTO vault_files_fts(vault_files_fts, rowid, rel_path, name, content) VALUES('delete', old.rowid, old.rel_path, old.name, old.content);
END;
CREATE TRIGGER IF NOT EXISTS vault_files_au AFTER UPDATE ON vault_files BEGIN
  INSERT INTO vault_files_fts(vault_files_fts, rowid, rel_path, name, content) VALUES('delete', old.rowid, old.rel_path, old.name, old.content);
  INSERT INTO vault_files_fts(rowid, rel_path, name, content) VALUES (new.rowid, new.rel_path, new.name, new.content);
END;
```

- [ ] **Step 5: Run the gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test --run
git add lib/db/schema.ts lib/db/client.ts __tests__/lib/vault-index.test.ts
git commit -m "feat(vault): persisted vault index schema with FTS"
```

---

### Task 2: The scanner

**Files:**
- Create: `lib/services/vault-index.ts`
- Modify: `types/vault.ts`
- Test: `__tests__/lib/vault-index.test.ts`

**Interfaces:**
- Consumes: `tryRemoteFs` (`lib/services/runner-fs.ts`), `extractWikiLinks` (`lib/utils/wiki.ts`), `getSetting`, the Task 1 tables.
- Produces:
  - `export function resolveLinkTarget(fromDir: string, raw: string, candidates: string[]): string | null`
  - `export async function scanVault(): Promise<{ indexed: number; skipped: number; unreachable: boolean }>`
  - `export function getVaultIndexedAt(): string | null`

- [ ] **Step 1: Write the failing tests for link resolution**

Collision handling is the subtle part — two files genuinely share the name `MEMORY.md`.

```ts
import { resolveLinkTarget } from "@/lib/services/vault-index";

describe("resolveLinkTarget", () => {
  const candidates = [
    "Claude Code/Memory/matrix-dash/MEMORY.md",
    "Claude Code/Memory/bolt.new-custom/MEMORY.md",
    "Matrix Notes/Deep/Thing.md",
  ];

  it("prefers a match in the same folder as the source", () => {
    expect(resolveLinkTarget("Claude Code/Memory/matrix-dash", "MEMORY", candidates)).toBe(
      "Claude Code/Memory/matrix-dash/MEMORY.md"
    );
  });

  it("falls back to the shallowest path when no same-folder match exists", () => {
    expect(resolveLinkTarget("Somewhere/Else", "Thing", candidates)).toBe("Matrix Notes/Deep/Thing.md");
  });

  it("returns null for a target that does not exist — a ghost link", () => {
    expect(resolveLinkTarget("Matrix Notes", "does-not-exist", candidates)).toBeNull();
  });

  it("is case-insensitive, matching Obsidian", () => {
    expect(resolveLinkTarget("Matrix Notes/Deep", "thing", candidates)).toBe("Matrix Notes/Deep/Thing.md");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm test --run __tests__/lib/vault-index.test.ts`
Expected: FAIL — `resolveLinkTarget is not a function`.

- [ ] **Step 3: Implement resolution**

```ts
/**
 * Resolve a [[target]] against every file in the vault, by basename, the way
 * Obsidian does. Collisions are real — two projects each have a MEMORY.md —
 * so the order is deterministic at every step and never left to Map insertion:
 * same folder first (almost always what was meant), then the shallowest path,
 * then lexicographic.
 */
export function resolveLinkTarget(
  fromDir: string,
  raw: string,
  candidates: string[]
): string | null {
  const wanted = raw.trim().replace(/\.md$/i, "").toLowerCase();
  if (!wanted) return null;

  const matches = candidates.filter((p) => {
    const base = p.slice(p.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
    return base.toLowerCase() === wanted;
  });
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  const sameFolder = matches.filter((p) => p.slice(0, p.lastIndexOf("/")) === fromDir);
  const pool = sameFolder.length > 0 ? sameFolder : matches;
  return [...pool].sort((a, b) => {
    const depth = a.split("/").length - b.split("/").length;
    return depth !== 0 ? depth : a.localeCompare(b);
  })[0];
}
```

- [ ] **Step 4: Implement the incremental scan**

Add to `lib/services/vault-index.ts`. Reachability mirrors `obsidian-sync.ts`: local filesystem first, `tryRemoteFs` second, and **a failed scan must never empty the index**.

```ts
const TEXT_EXTS = new Set(["md", "txt", "markdown"]);
const READ_CHUNK = 20;

/**
 * Rebuild the vault index. Incremental: one tree op gets every file with an
 * mtime, and only text files whose mtime changed are re-read (in chunks, so a
 * cold scan does not fire ~95 sequential round trips through the bridge).
 * Returns unreachable:true and leaves the existing index untouched when
 * neither this host nor a paired device can see the vault — a stale index is
 * strictly better than an empty one.
 */
export async function scanVault(): Promise<{ indexed: number; skipped: number; unreachable: boolean }> {
  const vaultPath = getSetting("obsidianVaultPath");
  if (!vaultPath) return { indexed: 0, skipped: 0, unreachable: true };

  const entries = await listVaultFiles(vaultPath); // local fs, else tryRemoteFs("tree")
  if (!entries) return { indexed: 0, skipped: 0, unreachable: true };

  const db = getDb();
  const now = new Date().toISOString();
  const existing = new Map(
    db.select().from(vaultFiles).all().map((r) => [r.relPath, r])
  );

  let indexed = 0;
  let skipped = 0;
  const toRead: typeof entries = [];

  for (const e of entries) {
    const prev = existing.get(e.relPath);
    const isText = TEXT_EXTS.has(e.ext.toLowerCase());
    if (prev && prev.mtimeMs === e.mtimeMs) {
      skipped++;
      continue;
    }
    if (isText) toRead.push(e);
    else {
      upsertFile({ ...e, isText: false, content: "" }, now);
      indexed++;
    }
  }

  for (let i = 0; i < toRead.length; i += READ_CHUNK) {
    const batch = toRead.slice(i, i + READ_CHUNK);
    const contents = await Promise.all(batch.map((e) => readVaultFile(vaultPath, e.relPath)));
    batch.forEach((e, n) => {
      upsertFile({ ...e, isText: true, content: contents[n] ?? "" }, now);
      indexed++;
    });
  }

  // Files that vanished from the vault must leave the index, or deleted notes
  // linger in the sidebar and graph forever.
  const seen = new Set(entries.map((e) => e.relPath));
  for (const relPath of existing.keys()) {
    if (!seen.has(relPath)) db.delete(vaultFiles).where(eq(vaultFiles.relPath, relPath)).run();
  }

  rebuildLinks();
  setSetting("vaultIndexedAt", now);
  return { indexed, skipped, unreachable: false };
}
```

Implement the referenced helpers in the same file: `listVaultFiles` (local `fs` walk, else `tryRemoteFs("tree")`, returning `{relPath, name, ext, dirPath, mtimeMs}`), `readVaultFile` (local `fs.readFileSync`, else `tryRemoteFs("read")`), `upsertFile` (insert-or-replace into `vaultFiles`), and `rebuildLinks` (delete all `vault_links`, then for every text file run `extractWikiLinks(content)` plus an embed regex `/!\[\[([^\]]+)\]\]/g`, resolving each via `resolveLinkTarget` against all indexed paths).

- [ ] **Step 5: Test the incremental behaviour**

```ts
it("skips files whose mtime has not changed", async () => {
  // seed vault_files with a known mtime, run scanVault against a temp vault
  // whose file has that same mtime, assert skipped >= 1 and indexed === 0
});

it("removes index rows for files deleted from the vault", async () => {
  // seed a row for a path that does not exist on disk, scan, assert it is gone
});

it("leaves the existing index untouched when the vault is unreachable", async () => {
  // point obsidianVaultPath at a non-existent dir with no device paired,
  // assert unreachable === true AND the previously seeded rows still exist
});
```

Use a temp vault directory created with `fs.mkdtempSync`, never the real vault.

- [ ] **Step 6: Gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test --run
git add lib/services/vault-index.ts types/vault.ts __tests__/lib/vault-index.test.ts
git commit -m "feat(vault): incremental vault scanner with deterministic link resolution"
```

---

### Task 3: Vault API routes

**Files:**
- Create: `app/api/vault/index/route.ts`, `app/api/vault/file/route.ts`, `app/api/vault/search/route.ts`
- Modify: `app/api/vault/graph/route.ts`
- Delete: `app/api/vault/claude-code/route.ts`, `app/api/vault/claude-code/file/route.ts`, `lib/services/claude-code-vault.ts`

**Interfaces:**
- Consumes: Task 2's `scanVault`, `getVaultIndexedAt`, the Task 1 tables.
- Produces: `GET /api/vault/index` → `{ tree, indexedAt, stale, unreachable }`; `GET /api/vault/file?path=` → `{ relPath, name, frontmatter, body, backlinks }`; `GET /api/vault/search?q=` → `{ results }`; `GET /api/vault/graph` → `{ nodes, links }` (no `ccProject` param any more — the whole vault is indexed).

- [ ] **Step 1: Build the tree route**

`GET` only, `withUser`-wrapped. Triggers `scanVault()` (awaited, so a fresh page load reflects reality), then reads the index and returns a nested tree grouped by `dirPath`, plus `indexedAt` and a `stale` flag. Must return the stored index even when `unreachable` is true.

- [ ] **Step 2: Build the file route**

`GET` only. zod-validate `path`; reject `..` and absolute paths. Returns parsed frontmatter (reuse `parseFrontmatter` from `obsidian-sync.ts`), body, and backlinks read from `vault_links` where `target_path = path`. For a non-text file, return metadata with a flag rather than content.

- [ ] **Step 3: Build the search route**

`GET` only. Queries `vault_files_fts` with `MATCH`, returns `{relPath, name, snippet}` using FTS5's `snippet()`. This replaces the sidebar's current split behaviour (full-text for notes/memories, filename-only for everything else).

- [ ] **Step 4: Rewrite the graph route over the index**

Nodes come from `vault_files`; links from `vault_links`. Node id is `vault:<relPath>` uniformly. Ghost links (`target_path IS NULL`) become faded ghost nodes. Colour is assigned by top-level folder (first path segment) from a fixed palette, in sorted order so a folder keeps its colour between loads. Cap at 1500 nodes, sorted by path before truncation, and return `truncated: true` plus the real count when it applies — never truncate silently.

Map DB-backed files so the UI can open the right editor: for a file under `Matrix Notes/`, match its basename against `notes.vaultRelPath`; under `Memory Bank/`, against `memories.vaultRelPath`. Return `noteId`/`memoryId` on those nodes.

- [ ] **Step 5: Delete the superseded Claude-Code-only surface**

```bash
git rm app/api/vault/claude-code/route.ts app/api/vault/claude-code/file/route.ts lib/services/claude-code-vault.ts
```

Re-grep for references before committing — `components/vault/vault-sidebar.tsx` and `app/dashboard/vault/page.tsx` both call these and are updated in Task 4.

- [ ] **Step 6: Gate and commit**

---

### Task 4: Dynamic sidebar and file viewer

**Files:**
- Rewrite: `components/vault/vault-sidebar.tsx`
- Create: `components/vault/vault-file-viewer.tsx`
- Delete: `components/vault/claude-code-viewer.tsx`
- Modify: `app/dashboard/vault/page.tsx`

- [ ] **Step 1: Rewrite the sidebar over the index tree**

Every top-level vault folder renders as a collapsible section, discovered from the data rather than hardcoded — so `Claude Code/Sessions/`, the vault `README.md`, and anything added later all appear without a code change. **Matrix Notes and Memory Bank pin to the top**, everything else sorts alphabetically below. Nested folders (e.g. `Claude Code/Memory/<project>/`) render as nested disclosures. Expansion state persists to `localStorage` per the existing `matrix-vault-section-` convention. A staleness banner shows when `stale` or `unreachable`.

- [ ] **Step 2: Build the generalised file viewer**

`vault-file-viewer.tsx` replaces `claude-code-viewer.tsx`: frontmatter badges, `<WikiContent>` for the body, a **backlinks panel** ("what links here", from the route), and an **Open in Obsidian** link (`obsidian://open?vault=<name>&file=<relPath>`, both URI-encoded). Keep the read-only notice for files matrix-dash does not own.

- [ ] **Step 3: Wire the page**

Selection stays `note:`/`memory:` for DB-backed rows (so `NoteEditor`/`MemoryDetail` open unchanged) and becomes `vault:<relPath>` otherwise. Graph node click opens the file **and reveals it in the sidebar tree**. Refresh on mount and every 10 minutes.

- [ ] **Step 4: Gate and commit**

---

### Task 5: Deploy and verify live

- [ ] **Step 1:** `pnpm typecheck && pnpm lint && pnpm test --run`, then push and wait for CI.
- [ ] **Step 2:** `./deploy/deploy.sh` — no resize.
- [ ] **Step 3:** Confirm on production, with the device online: the sidebar lists folders the old one could not show (`Claude Code/Sessions/`, the vault `README.md`); the graph renders **real edges** across all 95 files (the previous version drew almost none); a Claude Code memory opens with working backlinks; search finds a phrase that exists only inside a Claude Code file.
- [ ] **Step 4:** Stop the runner, reload, and confirm the page still browses and searches from the cached index with a visible staleness banner — this is the whole point of persisting it.
- [ ] **Step 5:** Confirm `/dashboard/notes` and `/dashboard/memory-bank` still redirect correctly and their editors still open.
- [ ] **Step 6:** Write the CHANGELOG entry with a real completion figure.

---

## Self-Review

**Spec coverage:** persisted index + FTS → Task 1; incremental scanner, link resolution, ghosts → Task 2; routes, whole-vault graph, node cap, folder colours → Task 3; dynamic sidebar, backlinks, `obsidian://`, search wiring → Task 4; live verification incl. the offline case → Task 5.

**Deliberately deferred, consistent with the spec:** real-time vault push, writing into Claude Code's folder, an embedded Obsidian app, and a batched `read-many` protocol op (chunked parallel reads make it unnecessary at 95 files).

**Known carry-forward from Phase A, worth folding in here:** `syncNoteToVault`/`syncMemoryToVault` still use direct `fs.rmSync` for their rename-cleanup path — the same bug class fixed for deletion in Phase A Task 6. Not required by any task above, but it touches the same file as Task 2 and is cheap to fix while there.

**Risk to watch:** Task 3 deletes routes that Task 4 replaces the callers of. If executed strictly in order, the app is briefly broken between them — acceptable because nothing is deployed mid-plan, but the two must land before any deploy.
