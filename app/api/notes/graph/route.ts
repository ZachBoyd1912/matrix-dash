import { getDb } from "@/lib/db/client";
import { notes, noteLinks } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const allNotes = db.select().from(notes).all();
  const allLinks = db.select().from(noteLinks).all();
  return Response.json({
    nodes: allNotes.map((n) => ({
      id: n.id,
      label: n.title || "Untitled",
      isFavorite: !!n.isFavorite,
      size: Math.min(1, n.content.length / 2000),
    })),
    links: allLinks.map((l) => ({
      id: l.id,
      source: l.sourceNoteId,
      target: l.targetNoteId,
    })),
  });
}
