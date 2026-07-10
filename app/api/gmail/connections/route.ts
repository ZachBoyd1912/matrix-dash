import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { gmailConnections } from "@/lib/db/schema";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

function toPublic(row: typeof gmailConnections.$inferSelect) {
  return {
    id: row.id,
    googleEmail: row.googleEmail,
    imapEnabled: row.imapEnabled,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

export const GET = withUser(async () => {
  const rows = getDb().select().from(gmailConnections).all();
  return Response.json(rows.map(toPublic));
});

export const DELETE = withUser(async (req: Request) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  getDb().delete(gmailConnections).where(eq(gmailConnections.id, id)).run();
  return Response.json({ ok: true });
});
