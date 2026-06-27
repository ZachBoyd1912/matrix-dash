import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { slackWorkspaces } from "@/lib/db/schema";
import type { SlackWorkspacePublic } from "@/types/jarvis";

export const dynamic = "force-dynamic";

function toPublic(row: typeof slackWorkspaces.$inferSelect): SlackWorkspacePublic {
  return {
    id: row.id,
    label: row.label,
    teamId: row.teamId,
    teamName: row.teamName,
    botUserId: row.botUserId,
    scopes: row.scopes,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

export async function GET() {
  const rows = getDb().select().from(slackWorkspaces).all();
  return Response.json(rows.map(toPublic));
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  getDb().delete(slackWorkspaces).where(eq(slackWorkspaces.id, id)).run();
  return Response.json({ ok: true });
}
