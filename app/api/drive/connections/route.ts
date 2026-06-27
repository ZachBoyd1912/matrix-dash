import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { driveConnections } from "@/lib/db/schema";
import type { DriveConnectionPublic } from "@/types/jarvis";

export const dynamic = "force-dynamic";

function toPublic(
  row: typeof driveConnections.$inferSelect
): DriveConnectionPublic {
  return {
    id: row.id,
    label: row.label,
    googleEmail: row.googleEmail,
    scopes: row.scopes,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

export async function GET() {
  const rows = getDb().select().from(driveConnections).all();
  return Response.json(rows.map(toPublic));
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  getDb().delete(driveConnections).where(eq(driveConnections.id, id)).run();
  return Response.json({ ok: true });
}
