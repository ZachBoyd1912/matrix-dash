import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { githubConnections } from "@/lib/db/schema";
import type { GitHubConnectionPublic } from "@/types/jarvis";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

function toPublic(row: typeof githubConnections.$inferSelect): GitHubConnectionPublic {
  return {
    id: row.id,
    label: row.label,
    githubUser: row.githubUser,
    avatarUrl: row.avatarUrl,
    scopes: row.scopes,
    isActive: row.isActive,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
  };
}

export const GET = withUser(async () => {
  const rows = getDb().select().from(githubConnections).all();
  return Response.json(rows.map(toPublic));
});

export const DELETE = withUser(async (req: Request) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  getDb().delete(githubConnections).where(eq(githubConnections.id, id)).run();
  return Response.json({ ok: true });
});
