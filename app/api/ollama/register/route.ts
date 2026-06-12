import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/client";
import { aiProviders } from "@/lib/db/schema";
import { encrypt } from "@/lib/utils/crypto";
import { eq } from "drizzle-orm";
import { getSetting } from "@/lib/db/settings";

export const dynamic = "force-dynamic";

/** Register the local Ollama install as an AI provider (model-specific). */
export async function POST(req: Request) {
  let body: { model?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.model) return Response.json({ error: "model required" }, { status: 400 });

  const baseUrl = (getSetting("ollamaUrl") || "http://localhost:11434").replace(/\/$/, "") + "/v1";
  const db = getDb();

  // If a custom provider for Ollama already exists, just update its default model.
  const existing = db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.baseUrl, baseUrl))
    .get();
  if (existing) {
    db.update(aiProviders)
      .set({ defaultModel: body.model })
      .where(eq(aiProviders.id, existing.id))
      .run();
    return Response.json({ id: existing.id, updated: true });
  }

  const id = randomUUID();
  db.insert(aiProviders)
    .values({
      id,
      name: `Ollama (${body.model})`,
      provider: "custom",
      apiKeyEncrypted: encrypt("ollama"),
      baseUrl,
      defaultModel: body.model,
      isActive: false,
      createdAt: new Date().toISOString(),
    })
    .run();
  return Response.json({ id });
}
