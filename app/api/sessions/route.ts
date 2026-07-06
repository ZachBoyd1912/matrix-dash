import { randomUUID } from "crypto";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  const db = getDb();
  const rows = db
    .select({
      id: sessions.id,
      name: sessions.name,
      context: sessions.context,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      messageCount: sql<number>`(SELECT COUNT(*) FROM session_messages WHERE session_id = ${sessions.id})`,
    })
    .from(sessions)
    .orderBy(desc(sessions.updatedAt))
    .all();
  return Response.json(rows);
}

export async function POST(req: Request) {
  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    /* empty body OK */
  }
  const parsed = createSchema.safeParse(payload);
  const id = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .insert(sessions)
    .values({
      id,
      name: parsed.success && parsed.data.name ? parsed.data.name : "New Session",
      context: JSON.stringify(parsed.success ? (parsed.data.context ?? {}) : {}),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const row = getDb().select().from(sessions).where(eq(sessions.id, id)).get();
  return Response.json(row);
}
