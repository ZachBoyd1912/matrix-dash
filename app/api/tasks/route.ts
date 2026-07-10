import { randomUUID } from "crypto";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";
import type { Task } from "@/types/jarvis";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

function toTask(row: typeof tasks.$inferSelect): Task {
  return { ...row, isDone: !!row.isDone, reminded: !!row.reminded };
}

const createSchema = z.object({
  title: z.string().min(1).max(500),
  notes: z.string().max(50000).optional(),
  dueAt: z.string().max(200).nullable().optional(),
  remindAt: z.string().max(200).nullable().optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
});

export const GET = withUser(async () => {
  const rows = getDb().select().from(tasks).orderBy(asc(tasks.isDone), asc(tasks.dueAt)).all();
  return Response.json(rows.map(toTask));
});

export const POST = withUser(async (req: Request) => {
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
    .insert(tasks)
    .values({
      id,
      title: parsed.data.title,
      notes: parsed.data.notes ?? "",
      dueAt: parsed.data.dueAt ?? null,
      remindAt: parsed.data.remindAt ?? null,
      priority: parsed.data.priority ?? "normal",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const row = getDb().select().from(tasks).where(eq(tasks.id, id)).get();
  return Response.json(row ? toTask(row) : { id });
});
