import { eq, isNotNull } from "drizzle-orm";
import { getDb, getSqlite } from "@/lib/db/client";
import { memories, notes, vaultFiles, vaultLinks } from "@/lib/db/schema";
import { toFtsQuery } from "@/lib/db/fts";
import { MEMORIES_SUBDIR, NOTES_SUBDIR, parseFrontmatter, sanitizeFilename } from "./obsidian-sync";
import type {
  VaultFileDetail,
  VaultGraphData,
  VaultGraphLink,
  VaultGraphNode,
  VaultSearchHit,
  VaultTreeFile,
  VaultTreeFolder,
} from "@/types/vault";

/**
 * Read side of the vault index. Every surface — sidebar tree, file viewer,
 * search, graph — is answered from `vault_files` / `vault_links` and never
 * touches the filesystem, which is what keeps the page working while the
 * owner's Mac is asleep. lib/services/vault-index.ts is the only writer.
 */

/**
 * Ceiling on graph nodes. d3-force degrades badly past a couple of thousand
 * nodes on a laptop, and the vault will keep growing. Truncation is reported,
 * never silent — see VaultGraphData.truncated.
 */
export const GRAPH_NODE_CAP = 1500;

/**
 * Colours are assigned by position in the SORTED list of top-level folders, so
 * a folder keeps the same colour between loads. Deriving from insertion order
 * would reshuffle the whole legend whenever a folder gained its first file.
 */
const FOLDER_PALETTE = [
  "#a78bfa",
  "#38bdf8",
  "#fb923c",
  "#34d399",
  "#f472b6",
  "#fbbf24",
  "#60a5fa",
  "#f43f5e",
  "#2dd4bf",
  "#c084fc",
];

/** Files at the vault root belong to no folder; they still need a colour. */
const ROOT_COLOR = "#94a3b8";

export function folderColor(folder: string, sortedFolders: string[]): string {
  if (!folder) return ROOT_COLOR;
  const idx = sortedFolders.indexOf(folder);
  return idx === -1 ? ROOT_COLOR : FOLDER_PALETTE[idx % FOLDER_PALETTE.length];
}

/** The first path segment — the top-level vault folder, "" for a root file. */
export function topFolder(relPath: string): string {
  const slash = relPath.indexOf("/");
  return slash === -1 ? "" : relPath.slice(0, slash);
}

/* ------------------------------------------------------------------ *
 * DB-row mapping
 * ------------------------------------------------------------------ */

/**
 * Which vault paths are backed by a matrix-dash row, so the UI opens the real
 * NoteEditor / MemoryDetail instead of the read-only viewer.
 *
 * `notes.vaultRelPath` / `memories.vaultRelPath` are stored relative to their
 * own subdirectory (verified against production: a bare `Some Note.md`), so
 * the key is the vault path with that subdirectory prefix stripped — which
 * also handles a nested file correctly, unlike a basename compare.
 */
export function buildDbBacking(): {
  noteByPath: Map<string, string>;
  memoryByPath: Map<string, string>;
} {
  const noteByPath = new Map<string, string>();
  const memoryByPath = new Map<string, string>();
  for (const n of getDb()
    .select({ id: notes.id, rel: notes.vaultRelPath })
    .from(notes)
    .where(isNotNull(notes.vaultRelPath))
    .all()) {
    if (n.rel) noteByPath.set(`${NOTES_SUBDIR}/${n.rel.split("\\").join("/")}`, n.id);
  }
  for (const m of getDb()
    .select({ id: memories.id, rel: memories.vaultRelPath })
    .from(memories)
    .where(isNotNull(memories.vaultRelPath))
    .all()) {
    if (m.rel) memoryByPath.set(`${MEMORIES_SUBDIR}/${m.rel.split("\\").join("/")}`, m.id);
  }
  return { noteByPath, memoryByPath };
}

/* ------------------------------------------------------------------ *
 * Tree
 * ------------------------------------------------------------------ */

interface FolderBuilder {
  path: string;
  name: string;
  folders: Map<string, FolderBuilder>;
  files: VaultTreeFile[];
}

function emptyFolder(path: string, name: string): FolderBuilder {
  return { path, name, folders: new Map(), files: [] };
}

/**
 * Matrix Notes and Memory Bank pin to the top because they are the folders
 * matrix-dash actually owns and writes; everything else — Claude Code's own
 * memory, any folder the operator adds later — sorts alphabetically below,
 * discovered from the data rather than hardcoded.
 */
const PINNED_FOLDERS = [NOTES_SUBDIR, MEMORIES_SUBDIR];

export function compareTopFolders(a: string, b: string): number {
  const ai = PINNED_FOLDERS.indexOf(a);
  const bi = PINNED_FOLDERS.indexOf(b);
  if (ai !== -1 || bi !== -1) {
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  }
  return a.localeCompare(b);
}

function finalize(builder: FolderBuilder): VaultTreeFolder {
  const folders = [...builder.folders.values()]
    .map(finalize)
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = [...builder.files].sort((a, b) => a.name.localeCompare(b.name));
  return {
    path: builder.path,
    name: builder.name,
    folders,
    files,
    fileCount: files.length + folders.reduce((n, f) => n + f.fileCount, 0),
  };
}

/**
 * Notes and memories that matrix-dash holds but the vault does not — because
 * Obsidian sync is off, or has not written them yet.
 *
 * Without this the sidebar would be a pure mirror of the vault, and turning
 * sync off (or never turning it on) would make the user's own notes vanish
 * from the page that is supposed to show them. They are listed in their usual
 * folder, flagged, and open in the normal editor.
 */
function pendingRows(indexed: Set<string>): VaultTreeFile[] {
  const out: VaultTreeFile[] = [];

  for (const n of getDb().select().from(notes).all()) {
    const name = n.vaultRelPath || sanitizeFilename(n.title || n.id);
    const relPath = `${NOTES_SUBDIR}/${name.split("\\").join("/")}`;
    if (indexed.has(relPath)) continue;
    out.push({
      relPath,
      name: relPath.slice(relPath.lastIndexOf("/") + 1),
      ext: "md",
      isText: true,
      noteId: n.id,
      memoryId: null,
      notInVault: true,
    });
  }

  for (const m of getDb().select().from(memories).all()) {
    const name = m.vaultRelPath || sanitizeFilename(m.content.slice(0, 60) || m.id);
    const relPath = `${MEMORIES_SUBDIR}/${name.split("\\").join("/")}`;
    if (indexed.has(relPath)) continue;
    out.push({
      relPath,
      name: relPath.slice(relPath.lastIndexOf("/") + 1),
      ext: "md",
      isText: true,
      noteId: null,
      memoryId: m.id,
      notInVault: true,
    });
  }

  return out;
}

/** The whole vault as nested folders, plus the files sitting at its root. */
export function buildVaultTree(): { folders: VaultTreeFolder[]; rootFiles: VaultTreeFile[] } {
  const rows = getDb()
    .select({
      relPath: vaultFiles.relPath,
      name: vaultFiles.name,
      ext: vaultFiles.ext,
      isText: vaultFiles.isText,
    })
    .from(vaultFiles)
    .all();
  const { noteByPath, memoryByPath } = buildDbBacking();

  const roots = new Map<string, FolderBuilder>();
  const rootFiles: VaultTreeFile[] = [];

  const indexed: VaultTreeFile[] = rows.map((row) => ({
    relPath: row.relPath,
    name: row.name,
    ext: row.ext,
    isText: row.isText,
    noteId: noteByPath.get(row.relPath) ?? null,
    memoryId: memoryByPath.get(row.relPath) ?? null,
    notInVault: false,
  }));
  // Two rows must never claim the same path, or the same file appears twice.
  const seen = new Set(indexed.map((f) => f.relPath));

  for (const file of [...indexed, ...pendingRows(seen)]) {
    const segments = file.relPath.split("/");
    if (segments.length === 1) {
      rootFiles.push(file);
      continue;
    }
    let level = roots;
    let prefix = "";
    for (let i = 0; i < segments.length - 1; i++) {
      prefix = prefix ? `${prefix}/${segments[i]}` : segments[i];
      let node = level.get(segments[i]);
      if (!node) {
        node = emptyFolder(prefix, segments[i]);
        level.set(segments[i], node);
      }
      if (i === segments.length - 2) node.files.push(file);
      level = node.folders;
    }
  }

  return {
    folders: [...roots.values()].map(finalize).sort((a, b) => compareTopFolders(a.name, b.name)),
    rootFiles: rootFiles.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/* ------------------------------------------------------------------ *
 * Single file
 * ------------------------------------------------------------------ */

export function getVaultFile(relPath: string): VaultFileDetail | null {
  const row = getDb().select().from(vaultFiles).where(eq(vaultFiles.relPath, relPath)).get();
  if (!row) return null;

  const { noteByPath, memoryByPath } = buildDbBacking();
  const { frontmatter, body } = row.isText
    ? parseFrontmatter(row.content)
    : { frontmatter: {}, body: "" };

  // "What links here" — the panel Obsidian has and the old viewer did not.
  const backlinkRows = getDb()
    .select({ sourcePath: vaultLinks.sourcePath })
    .from(vaultLinks)
    .where(eq(vaultLinks.targetPath, relPath))
    .all();
  const backlinks = [...new Set(backlinkRows.map((b) => b.sourcePath))]
    .sort()
    .map((p) => ({ relPath: p, name: p.slice(p.lastIndexOf("/") + 1) }));

  const outgoing = getDb()
    .select({ targetPath: vaultLinks.targetPath, targetRaw: vaultLinks.targetRaw })
    .from(vaultLinks)
    .where(eq(vaultLinks.sourcePath, relPath))
    .all()
    .map((l) => ({ relPath: l.targetPath, raw: l.targetRaw }));

  return {
    relPath: row.relPath,
    name: row.name,
    dirPath: row.dirPath,
    ext: row.ext,
    isText: row.isText,
    frontmatter,
    body,
    raw: row.isText ? row.content : "",
    mtimeMs: row.mtimeMs,
    indexedAt: row.indexedAt,
    noteId: noteByPath.get(relPath) ?? null,
    memoryId: memoryByPath.get(relPath) ?? null,
    backlinks,
    outgoing,
  };
}

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

/**
 * Full-text search across every indexed file. This replaces the old sidebar's
 * split behaviour (full-text for notes/memories, filename-only for Claude
 * Code) — one query now reaches the whole vault, from the stored index, so it
 * works with the device offline.
 */
export function searchVault(query: string, limit = 50): VaultSearchHit[] {
  const fts = toFtsQuery(query);
  const term = query.trim();
  if (!fts && !term) return [];

  const hits: VaultSearchHit[] = [];
  const seen = new Set<string>();

  if (fts) {
    try {
      const rows = getSqlite()
        .prepare(
          `SELECT v.rel_path AS relPath, v.name AS name,
                  snippet(vault_files_fts, 2, '', '', '…', 12) AS snippet
             FROM vault_files_fts f JOIN vault_files v ON v.rowid = f.rowid
            WHERE vault_files_fts MATCH ? ORDER BY f.rank LIMIT ?`
        )
        .all(fts, limit) as VaultSearchHit[];
      for (const row of rows) {
        seen.add(row.relPath);
        hits.push(row);
      }
    } catch {
      // A malformed FTS expression must not take the sidebar down; the
      // filename pass below still answers.
    }
  }

  // FTS5 tokenizes on word boundaries, so a partial filename ("matr") or a
  // short word finds nothing. A filename contains-match fills that gap — it is
  // what makes the search box feel like a file picker as well as a searcher.
  if (hits.length < limit && term) {
    const lower = term.toLowerCase();
    for (const row of getDb()
      .select({ relPath: vaultFiles.relPath, name: vaultFiles.name })
      .from(vaultFiles)
      .all()) {
      if (hits.length >= limit) break;
      if (seen.has(row.relPath)) continue;
      if (!row.relPath.toLowerCase().includes(lower)) continue;
      seen.add(row.relPath);
      hits.push({ relPath: row.relPath, name: row.name, snippet: "" });
    }
  }

  return hits;
}

/* ------------------------------------------------------------------ *
 * Graph
 * ------------------------------------------------------------------ */

/** A ghost node id for a [[target]] that resolves to nothing. */
function ghostId(raw: string): string {
  return `ghost:${raw.trim().toLowerCase()}`;
}

/**
 * The whole vault as one graph: every indexed file is a node, every
 * `[[link]]`/`![[embed]]` an edge, unresolved targets faded ghosts. The old
 * version drew only notes plus one hand-picked Claude Code project and almost
 * no edges; this is the parity with Obsidian the page was missing.
 */
export function buildVaultGraph(): Omit<
  VaultGraphData,
  "indexedAt" | "stale" | "unreachable" | "partial"
> {
  const allFiles = getDb()
    .select({ relPath: vaultFiles.relPath, name: vaultFiles.name, isText: vaultFiles.isText })
    .from(vaultFiles)
    .all()
    .sort((a, b) => a.relPath.localeCompare(b.relPath));

  const total = allFiles.length;
  const truncated = total > GRAPH_NODE_CAP;
  // Sorted before truncation so the cut is deterministic and keeps folders
  // contiguous, rather than dropping an arbitrary scatter of files.
  const files = truncated ? allFiles.slice(0, GRAPH_NODE_CAP) : allFiles;
  const included = new Set(files.map((f) => f.relPath));

  const sortedFolders = [...new Set(allFiles.map((f) => topFolder(f.relPath)).filter(Boolean))]
    .sort()
    .slice();
  const { noteByPath, memoryByPath } = buildDbBacking();

  const nodes: VaultGraphNode[] = files.map((f) => {
    const folder = topFolder(f.relPath);
    return {
      id: `vault:${f.relPath}`,
      relPath: f.relPath,
      label: f.name.replace(/\.[^./]+$/, ""),
      folder,
      color: folderColor(folder, sortedFolders),
      isGhost: false,
      isText: f.isText,
      noteId: noteByPath.get(f.relPath) ?? null,
      memoryId: memoryByPath.get(f.relPath) ?? null,
      degree: 0,
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const links: VaultGraphLink[] = [];
  const seenEdges = new Set<string>();
  for (const l of getDb().select().from(vaultLinks).all()) {
    if (!included.has(l.sourcePath)) continue;
    const sourceId = `vault:${l.sourcePath}`;

    let targetId: string;
    if (l.targetPath) {
      if (!included.has(l.targetPath)) continue; // target fell outside the cap
      targetId = `vault:${l.targetPath}`;
    } else {
      targetId = ghostId(l.targetRaw);
      if (!byId.has(targetId)) {
        const ghost: VaultGraphNode = {
          id: targetId,
          relPath: null,
          label: l.targetRaw,
          folder: "",
          color: ROOT_COLOR,
          isGhost: true,
          isText: false,
          noteId: null,
          memoryId: null,
          degree: 0,
        };
        byId.set(targetId, ghost);
        nodes.push(ghost);
      }
    }

    const key = `${sourceId}\u0000${targetId}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    links.push({ id: key, source: sourceId, target: targetId, kind: l.kind });
    const s = byId.get(sourceId);
    const t = byId.get(targetId);
    if (s) s.degree++;
    if (t) t.degree++;
  }

  const counts = new Map<string, number>();
  for (const f of allFiles) {
    const folder = topFolder(f.relPath);
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  const folders = [...counts.entries()]
    .sort((a, b) => compareTopFolders(a[0], b[0]))
    .map(([name, count]) => ({
      name: name || "Vault root",
      color: folderColor(name, sortedFolders),
      count,
    }));

  return { nodes, links, folders, truncated, total };
}
