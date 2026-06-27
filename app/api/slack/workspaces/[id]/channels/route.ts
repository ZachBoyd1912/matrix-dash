import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { slackChannels } from "@/lib/db/schema";
import { listChannels } from "@/lib/services/slack";
import type { SlackChannelPublic } from "@/types/jarvis";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

function toPublic(row: typeof slackChannels.$inferSelect): SlackChannelPublic {
  return {
    id: row.id,
    channelId: row.channelId,
    name: row.name,
    topic: row.topic,
    memberCount: row.memberCount,
    isPrivate: row.isPrivate,
    syncedAt: row.syncedAt,
  };
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const rows = getDb()
    .select()
    .from(slackChannels)
    .where(eq(slackChannels.workspaceId, id))
    .all();
  return Response.json(rows.map(toPublic));
}

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const channels = await listChannels(id);
    const db = getDb();
    const now = new Date().toISOString();
    for (const ch of channels) {
      db.insert(slackChannels)
        .values({
          id: randomUUID(),
          workspaceId: id,
          channelId: ch.id,
          name: ch.name,
          topic: ch.topic?.value,
          memberCount: ch.num_members,
          isPrivate: ch.is_private,
          syncedAt: now,
        })
        .onConflictDoNothing()
        .run();
    }
    return Response.json({ ok: true, channelsSynced: channels.length });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 }
    );
  }
}
