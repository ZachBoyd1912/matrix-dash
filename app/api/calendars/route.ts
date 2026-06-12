import { randomUUID } from "crypto";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { calendars } from "@/lib/db/schema";
import { encrypt } from "@/lib/utils/crypto";
import type { Calendar } from "@/types/jarvis";

export const dynamic = "force-dynamic";

function toPublic(row: typeof calendars.$inferSelect): Calendar {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    caldavUrl: row.caldavUrl,
    caldavUser: row.caldavUser,
    createdAt: row.createdAt,
  };
}

const createSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
  caldavUrl: z.string().nullable().optional(),
  caldavUser: z.string().nullable().optional(),
  caldavPass: z.string().nullable().optional(),
});

export async function GET() {
  const rows = getDb().select().from(calendars).all();
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
    .insert(calendars)
    .values({
      id,
      name: parsed.data.name,
      color: parsed.data.color ?? "#34d399",
      caldavUrl: parsed.data.caldavUrl ?? null,
      caldavUser: parsed.data.caldavUser ?? null,
      caldavPassEncrypted: parsed.data.caldavPass ? encrypt(parsed.data.caldavPass) : null,
      createdAt: new Date().toISOString(),
    })
    .run();
  return Response.json({ id });
}
