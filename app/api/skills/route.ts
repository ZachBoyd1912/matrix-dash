import { randomUUID } from "crypto";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { skills } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  instructions: z.string().optional(),
  isEnabled: z.boolean().optional(),
});

export async function GET() {
  const rows = getDb().select().from(skills).orderBy(desc(skills.updatedAt)).all();
  return Response.json(rows.map((s) => ({ ...s, isEnabled: !!s.isEnabled })));
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
  const now = new Date().toISOString();
  getDb()
    .insert(skills)
    .values({
      id,
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      instructions: parsed.data.instructions ?? "",
      isEnabled: parsed.data.isEnabled ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return Response.json({ id });
}
