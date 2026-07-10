import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/client";
import { notes, noteLinks } from "@/lib/db/schema";
import { extractWikiLinks } from "@/lib/utils/wiki";
import { syncNoteToVault, NOTES_SUBDIR } from "@/lib/services/obsidian-sync";
import { getSetting } from "@/lib/db/settings";
import type { Note, NoteBacklinks } from "@/types/note";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

function toNote(row: typeof notes.$inferSelect): Note {
  return { ...row, isFavorite: !!row.isFavorite };
}

const updateSchema = z.object({
  title: z.string().max(500).optional(),
  content: z.string().max(50000).optional(),
  tags: z.union([z.string().max(500), z.array(z.string().max(500))]).optional(),
  folderId: z.string().max(200).nullable().optional(),
  isFavorite: z.boolean().optional(),
});

interface Ctx {
  params: Promise<{ id: string }>;
}

export const GET = withUser(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const db = getDb();
  const row = db.select().from(notes).where(eq(notes.id, id)).get();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  const outgoing = db
    .select({
      linkId: noteLinks.id,
      noteId: notes.id,
      title: notes.title,
    })
    .from(noteLinks)
    .innerJoin(notes, eq(noteLinks.targetNoteId, notes.id))
    .where(eq(noteLinks.sourceNoteId, id))
    .all();

  const incoming = db
    .select({
      linkId: noteLinks.id,
      noteId: notes.id,
      title: notes.title,
    })
    .from(noteLinks)
    .innerJoin(notes, eq(noteLinks.sourceNoteId, notes.id))
    .where(eq(noteLinks.targetNoteId, id))
    .all();

  const backlinks: NoteBacklinks = {
    outgoing: outgoing.map((o) => ({
      linkId: o.linkId,
      note: { id: o.noteId, title: o.title },
    })),
    incoming: incoming.map((i) => ({
      linkId: i.linkId,
      note: { id: i.noteId, title: i.title },
    })),
  };

  return Response.json({ note: toNote(row), backlinks });
});

function rebuildLinks(noteId: string, content: string) {
  const db = getDb();
  db.delete(noteLinks).where(eq(noteLinks.sourceNoteId, noteId)).run();
  const titles = extractWikiLinks(content);
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

export const PATCH = withUser(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const updates: Partial<typeof notes.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.content !== undefined) updates.content = parsed.data.content;
  if (parsed.data.tags !== undefined)
    updates.tags = Array.isArray(parsed.data.tags) ? parsed.data.tags.join(",") : parsed.data.tags;
  if (parsed.data.folderId !== undefined) updates.folderId = parsed.data.folderId;
  if (parsed.data.isFavorite !== undefined) updates.isFavorite = parsed.data.isFavorite;

  getDb().update(notes).set(updates).where(eq(notes.id, id)).run();

  if (parsed.data.content !== undefined) rebuildLinks(id, parsed.data.content);

  let row = getDb().select().from(notes).where(eq(notes.id, id)).get();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  if (row.title.trim() || row.content.trim()) {
    try {
      syncNoteToVault(row);
      row = getDb().select().from(notes).where(eq(notes.id, id)).get() ?? row;
    } catch (err) {
      console.error("[notes] syncNoteToVault failed:", err);
    }
  }

  return Response.json(toNote(row));
});

export const DELETE = withUser(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const existing = getDb().select().from(notes).where(eq(notes.id, id)).get();
  getDb().delete(notes).where(eq(notes.id, id)).run();

  if (existing?.vaultRelPath) {
    try {
      const vaultPath = getSetting("obsidianVaultPath");
      if (vaultPath) {
        fs.rmSync(path.join(vaultPath, NOTES_SUBDIR, existing.vaultRelPath), { force: true });
      }
    } catch (err) {
      console.error("[notes] failed to delete vault file:", err);
    }
  }

  return Response.json({ ok: true });
});
