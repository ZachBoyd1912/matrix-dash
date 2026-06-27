import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { slackWorkspaces } from "@/lib/db/schema";
import { sendMessage } from "@/lib/services/slack";

export const dynamic = "force-dynamic";

const sendSchema = z.object({
  channel: z.string(),
  text: z.string(),
});

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = sendSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const ws = getDb()
    .select()
    .from(slackWorkspaces)
    .where(eq(slackWorkspaces.isActive, true))
    .get();
  if (!ws) {
    return Response.json({ error: "No active Slack workspace" }, { status: 400 });
  }
  const result = await sendMessage(ws.id, parsed.data.channel, parsed.data.text);
  return Response.json(result);
}
