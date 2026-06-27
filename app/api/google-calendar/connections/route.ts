import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { googleCalendarConnections } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function toPublic(row: typeof googleCalendarConnections.$inferSelect) {
  return {
    id: row.id,
    googleEmail: row.googleEmail,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

export async function GET() {
  const rows = getDb().select().from(googleCalendarConnections).all();
  return Response.json(rows.map(toPublic));
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  getDb()
    .delete(googleCalendarConnections)
    .where(eq(googleCalendarConnections.id, id))
    .run();
  return Response.json({ ok: true });
}
