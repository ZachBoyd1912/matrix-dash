import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { slackWorkspaces } from "@/lib/db/schema";
import { searchMessages } from "@/lib/services/slack";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  if (!q) return Response.json({ error: "query required" }, { status: 400 });

  const ws = getDb().select().from(slackWorkspaces).where(eq(slackWorkspaces.isActive, true)).get();
  if (!ws) {
    return Response.json({ error: "No active Slack workspace" }, { status: 400 });
  }
  const results = await searchMessages(ws.id, q);
  return Response.json(
    results.map((r) => ({
      channel: `#${r.channel.name}`,
      user: r.username,
      text: r.text.slice(0, 300),
      ts: r.ts,
    }))
  );
}
