import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { sessionMessages } from "@/lib/db/schema";
import type { MessageVariant } from "@/types/session";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

const switchSchema = z.object({
  activeVariantIndex: z.number().int().min(0),
});

interface Ctx {
  params: Promise<{ id: string; messageId: string }>;
}

// Switches which regenerated variant is "active" for a message — no LLM call,
// just mirrors the chosen variant's fields into the row's main columns (the
// same columns every other query in this codebase reads directly).
export const PATCH = withUser(async (req: Request, ctx: Ctx) => {
  const { messageId } = await ctx.params;
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = switchSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = getDb()
    .select()
    .from(sessionMessages)
    .where(eq(sessionMessages.id, messageId))
    .get();
  if (!existing) return Response.json({ error: "Message not found" }, { status: 404 });
  if (!existing.variants) {
    return Response.json({ error: "Message has no variants" }, { status: 400 });
  }

  let variants: MessageVariant[];
  try {
    variants = JSON.parse(existing.variants);
  } catch {
    return Response.json({ error: "Corrupt variants data" }, { status: 500 });
  }
  const idx = parsed.data.activeVariantIndex;
  if (idx < 0 || idx >= variants.length) {
    return Response.json({ error: "activeVariantIndex out of range" }, { status: 400 });
  }
  const chosen = variants[idx];

  getDb()
    .update(sessionMessages)
    .set({
      content: chosen.content,
      blocks: chosen.blocks,
      providerId: chosen.providerId,
      providerKind: chosen.providerKind,
      modelName: chosen.modelName,
      inputTokens: chosen.inputTokens,
      outputTokens: chosen.outputTokens,
      activeVariantIndex: idx,
    })
    .where(eq(sessionMessages.id, messageId))
    .run();

  const row = getDb().select().from(sessionMessages).where(eq(sessionMessages.id, messageId)).get();
  return Response.json(row);
});
