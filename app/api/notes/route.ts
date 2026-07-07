import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { notes, noteLinks } from "@/lib/db/schema";
import { searchNotesFts } from "@/lib/db/fts";
import { extractWikiLinks } from "@/lib/utils/wiki";
import { syncNoteToVault } from "@/lib/services/obsidian-sync";
import type { Note } from "@/types/note";

export const dynamic = "force-dynamic";

function toNote(row: typeof notes.$inferSelect): Note {
  return { ...row, isFavorite: !!row.isFavorite };
}

const createSchema = z.object({
  title: z.string().max(500).default(""),
  content: z.string().max(50000).default(""),
  tags: z.union([z.string().max(500), z.array(z.string().max(500))]).optional(),
  folderId: z.string().max(200).nullable().optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(500, parseInt(url.searchParams.get("limit") || "200", 10));

  if (q) {
    return Response.json(searchNotesFts(q, limit));
  }
  const rows = getDb()
    .select()
    .from(notes)
    .orderBy(desc(notes.isFavorite), desc(notes.updatedAt))
    .limit(limit)
    .all();
  return Response.json(rows.map(toNote));
}

function syncNoteLinks(noteId: string, content: string) {
  const db = getDb();
  // Wipe existing outgoing links and rebuild.
  db.delete(noteLinks).where(eq(noteLinks.sourceNoteId, noteId)).run();
  const titles = extractWikiLinks(content);
  if (titles.length === 0) return;
  for (const title of titles) {
    const target = db.select().from(notes).where(eq(notes.title, title)).get();
    if (!target || target.id === noteId) continue;
    db.insert(noteLinks)
      .values({
        id: randomUUID(),
        sourceNoteId: noteId,
        targetNoteId: target.id,
        label: title,
      })
      .run();
  }
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  const tags = Array.isArray(parsed.data.tags)
    ? parsed.data.tags.join(",")
    : (parsed.data.tags ?? "");

  getDb()
    .insert(notes)
    .values({
      id,
      title: parsed.data.title || "Untitled",
      content: parsed.data.content,
      tags,
      folderId: parsed.data.folderId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  syncNoteLinks(id, parsed.data.content);
  let row = getDb().select().from(notes).where(eq(notes.id, id)).get();

  // Skip syncing a completely empty just-created note. Guard on the raw input,
  // not the post-insert row: an empty title is coerced to "Untitled" above, so
  // checking row.title would always be truthy and defeat this check.
  if (row && (parsed.data.title.trim() || parsed.data.content.trim())) {
    try {
      syncNoteToVault(row);
      row = getDb().select().from(notes).where(eq(notes.id, id)).get() ?? row;
    } catch (err) {
      console.error("[notes] syncNoteToVault failed:", err);
    }
  }

  return Response.json(row ? toNote(row) : { id });
}
