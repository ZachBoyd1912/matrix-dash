import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { notes, noteLinks } from "@/lib/db/schema";
import { searchNotesFts } from "@/lib/db/fts";
import { extractWikiLinks } from "@/lib/utils/wiki";
import type { Note } from "@/types/note";

export const dynamic = "force-dynamic";

function toNote(row: typeof notes.$inferSelect): Note {
  return { ...row, isFavorite: !!row.isFavorite };
}

const createSchema = z.object({
  title: z.string().default(""),
  content: z.string().default(""),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  folderId: z.string().nullable().optional(),
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
  const row = getDb().select().from(notes).where(eq(notes.id, id)).get();
  return Response.json(row ? toNote(row) : { id });
}
