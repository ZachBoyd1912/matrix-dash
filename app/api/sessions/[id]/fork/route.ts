import { randomUUID } from "crypto";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { sessions, sessionMessages } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const forkSchema = z.object({
  /** Copy messages up to and including this one. Omitted = full duplicate. */
  forkedFromMessageId: z.string().max(200).optional(),
});

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    /* empty body OK — full duplicate */
  }
  const parsed = forkSchema.safeParse(payload);
  const forkedFromMessageId = parsed.success ? (parsed.data.forkedFromMessageId ?? null) : null;

  const original = getDb().select().from(sessions).where(eq(sessions.id, id)).get();
  if (!original) return Response.json({ error: "Session not found" }, { status: 404 });

  const originalMessages = getDb()
    .select()
    .from(sessionMessages)
    .where(eq(sessionMessages.sessionId, id))
    .orderBy(asc(sessionMessages.createdAt))
    .all();

  // Full duplicate when no cut point is given; otherwise everything up to and
  // including the message forked from (a mid-conversation branch point).
  let toCopy = originalMessages;
  if (forkedFromMessageId) {
    const cutIndex = originalMessages.findIndex((m) => m.id === forkedFromMessageId);
    if (cutIndex === -1) {
      return Response.json({ error: "forkedFromMessageId not found in session" }, { status: 400 });
    }
    toCopy = originalMessages.slice(0, cutIndex + 1);
  }

  const newSessionId = randomUUID();
  const now = new Date().toISOString();
  const db = getDb();

  db.insert(sessions)
    .values({
      id: newSessionId,
      name: forkedFromMessageId ? `${original.name} (fork)` : `${original.name} (copy)`,
      context: original.context,
      parentSessionId: id,
      forkedFromMessageId,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  for (const m of toCopy) {
    db.insert(sessionMessages)
      .values({
        id: randomUUID(),
        sessionId: newSessionId,
        role: m.role,
        content: m.content,
        blocks: m.blocks,
        providerId: m.providerId,
        modelName: m.modelName,
        providerKind: m.providerKind,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        variants: m.variants,
        activeVariantIndex: m.activeVariantIndex,
        createdAt: m.createdAt,
      })
      .run();
  }

  const row = getDb().select().from(sessions).where(eq(sessions.id, newSessionId)).get();
  return Response.json(row);
}
