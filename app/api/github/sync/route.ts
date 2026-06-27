import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { githubConnections } from "@/lib/db/schema";
import { syncRepos } from "@/lib/services/github";

export const dynamic = "force-dynamic";

export async function POST() {
  const conn = getDb()
    .select()
    .from(githubConnections)
    .where(eq(githubConnections.isActive, true))
    .get();
  if (!conn) {
    return Response.json({ error: "No active GitHub connection" }, { status: 400 });
  }
  try {
    const count = await syncRepos(conn.id);
    return Response.json({ ok: true, reposSynced: count });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 }
    );
  }
}
