import { randomUUID } from "crypto";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { presets } from "@/lib/db/schema";
import type { GenerationParams } from "@/types/settings";

export const dynamic = "force-dynamic";

const generationParamsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  maxOutputTokens: z.number().int().min(1).max(64_000).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  seed: z.number().int().optional(),
  stopSequences: z.array(z.string().max(200)).max(10).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(500),
  systemPrompt: z.string().max(100000).default(""),
  generationParams: generationParamsSchema.optional(),
});

function toPublic(row: typeof presets.$inferSelect) {
  let generationParams: GenerationParams = {};
  if (row.generationParams) {
    try {
      generationParams = JSON.parse(row.generationParams);
    } catch {
      /* malformed stored JSON — surface as no overrides rather than erroring */
    }
  }
  return {
    id: row.id,
    name: row.name,
    systemPrompt: row.systemPrompt,
    generationParams,
    createdAt: row.createdAt,
  };
}

export async function GET() {
  const rows = getDb().select().from(presets).orderBy(asc(presets.name)).all();
  return Response.json(rows.map(toPublic));
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const id = randomUUID();
  getDb()
    .insert(presets)
    .values({
      id,
      name: parsed.data.name,
      systemPrompt: parsed.data.systemPrompt,
      generationParams:
        parsed.data.generationParams && Object.keys(parsed.data.generationParams).length > 0
          ? JSON.stringify(parsed.data.generationParams)
          : null,
      createdAt: new Date().toISOString(),
    })
    .run();
  return Response.json({ id });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  getDb().delete(presets).where(eq(presets.id, id)).run();
  return Response.json({ ok: true });
}
