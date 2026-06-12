import { randomUUID } from "crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { aiProviders } from "@/lib/db/schema";
import { encrypt } from "@/lib/utils/crypto";
import { listProviders } from "@/lib/ai/registry";
import { withLog } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1),
  // Any catalog kind — validated as a non-empty string so new kinds need no code change here.
  provider: z.string().min(1),
  apiKey: z.string().min(1),
  baseUrl: z.string().nullable().optional(),
  defaultModel: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const GET = withLog(async () => {
  return Response.json(listProviders());
});

export const POST = withLog(async (req) => {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const id = randomUUID();
  const db = getDb();

  if (parsed.data.isActive) {
    db.update(aiProviders).set({ isActive: false }).run();
  }

  db.insert(aiProviders)
    .values({
      id,
      name: parsed.data.name,
      provider: parsed.data.provider,
      apiKeyEncrypted: encrypt(parsed.data.apiKey),
      baseUrl: parsed.data.baseUrl ?? null,
      defaultModel: parsed.data.defaultModel ?? null,
      isActive: parsed.data.isActive ?? false,
      createdAt: new Date().toISOString(),
    })
    .run();

  // If this is the first provider, make it active automatically.
  const all = db.select().from(aiProviders).all();
  if (all.length === 1) {
    db.update(aiProviders).set({ isActive: true }).where(eq(aiProviders.id, id)).run();
  }
  return Response.json({ id });
});
