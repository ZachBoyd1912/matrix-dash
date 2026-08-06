import { getDb } from "@/lib/db/client";
import { memories, memoryLinks, notes, noteLinks } from "@/lib/db/schema";
import { withUser } from "@/lib/auth/with-user";
import { extractWikiLinks } from "@/lib/utils/wiki";
import { readClaudeCodeFile, readClaudeCodeTree } from "@/lib/services/claude-code-vault";
import type { VaultGraphData, VaultGraphLink, VaultGraphNode } from "@/types/vault";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Composes notes + memories (each already has its own DB-backed link table)
 * with Claude Code files (no DB, only [[wikilink]] text references) into one
 * graph. Claude Code nodes are scoped to ONE project at a time via
 * ?ccProject= — reading every file in every project on every render would be
 * 150+ serial device round-trips through the runner bridge, genuinely too
 * slow. The project list itself (cheap: tree only, no file reads) is always
 * returned so the UI can offer a picker.
 */

interface CacheEntry {
  mtimeMs: number | undefined;
  body: string;
  title: string;
}
const g = globalThis as unknown as { __vaultGraphCache?: Map<string, CacheEntry> };
function cache(): Map<string, CacheEntry> {
  if (!g.__vaultGraphCache) g.__vaultGraphCache = new Map();
  return g.__vaultGraphCache;
}

export const GET = withUser(async (req: Request) => {
  const ccProject = new URL(req.url).searchParams.get("ccProject");

  const db = getDb();
  const allNotes = db.select().from(notes).all();
  const allNoteLinks = db.select().from(noteLinks).all();
  const allMemories = db.select().from(memories).all();
  const allMemoryLinks = db.select().from(memoryLinks).all();

  const nodes: VaultGraphNode[] = [];
  const links: VaultGraphLink[] = [];
  // Combined title index for cross-source wikilink resolution — notes and
  // (once loaded) Claude Code files register here; memories don't (their
  // content is AI-extracted prose, essentially never authored with [[...]]).
  const titleIndex = new Map<string, string>();

  for (const n of allNotes) {
    const id = `note:${n.id}`;
    nodes.push({ id, source: "note", label: n.title || "Untitled", isFavorite: !!n.isFavorite });
    if (n.title) titleIndex.set(n.title.toLowerCase(), id);
  }
  for (const l of allNoteLinks) {
    links.push({
      id: `nl:${l.id}`,
      source: `note:${l.sourceNoteId}`,
      target: `note:${l.targetNoteId}`,
      kind: "note-link",
    });
  }

  for (const m of allMemories) {
    nodes.push({
      id: `memory:${m.id}`,
      source: "memory",
      label: m.content.slice(0, 60),
      memoryType: m.type as VaultGraphNode["memoryType"],
      isPinned: !!m.isPinned,
    });
  }
  for (const l of allMemoryLinks) {
    links.push({
      id: `ml:${l.id}`,
      source: `memory:${l.sourceMemoryId}`,
      target: `memory:${l.targetMemoryId}`,
      kind: "memory-link",
    });
  }

  const tree = await readClaudeCodeTree();
  const ccProjects = tree.projects.map((p) => p.name);

  const ccBodies = new Map<string, string>();
  const project = ccProject ? tree.projects.find((p) => p.name === ccProject) : undefined;
  if (project) {
    for (const f of project.files) {
      const cacheKey = `${f.project}/${f.relPath}`;
      const cached = cache().get(cacheKey);
      let body: string;
      let title: string;
      if (cached && cached.mtimeMs === f.mtimeMs) {
        body = cached.body;
        title = cached.title;
      } else {
        const content = await readClaudeCodeFile(f.project, f.relPath);
        body = content?.body ?? "";
        title = content?.frontmatter.name || f.name;
        cache().set(cacheKey, { mtimeMs: f.mtimeMs, body, title });
      }
      const id = `cc:${f.project}/${f.relPath}`;
      nodes.push({ id, source: "claude-code", label: title });
      titleIndex.set(f.name.toLowerCase(), id);
      titleIndex.set(title.toLowerCase(), id);
      ccBodies.set(id, body);
    }
    for (const [id, body] of ccBodies) {
      for (const ref of extractWikiLinks(body)) {
        const target = titleIndex.get(ref.toLowerCase());
        if (target && target !== id) {
          links.push({ id: `wl:${id}->${target}`, source: id, target, kind: "wikilink" });
        }
      }
    }
  }

  // Cross-source pass: notes referencing a Claude Code title (only meaningful
  // once cc nodes are loaded above) or another note the noteLinks table missed.
  for (const n of allNotes) {
    const sourceId = `note:${n.id}`;
    for (const ref of extractWikiLinks(n.content)) {
      const target = titleIndex.get(ref.toLowerCase());
      if (
        target &&
        target !== sourceId &&
        !links.some((l) => l.source === sourceId && l.target === target)
      ) {
        links.push({ id: `wl:${sourceId}->${target}`, source: sourceId, target, kind: "wikilink" });
      }
    }
  }

  const data: VaultGraphData = { nodes, links, ccProjects };
  return Response.json(data);
});
