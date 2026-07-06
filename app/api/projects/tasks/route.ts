import { randomUUID } from "crypto";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";
import type { KanbanTask } from "@/types/jarvis";

export const dynamic = "force-dynamic";

function toKanban(row: typeof tasks.$inferSelect): KanbanTask {
  return {
    ...row,
    isDone: !!row.isDone,
    reminded: !!row.reminded,
    kanbanOrder: row.kanbanOrder ?? 0,
  };
}

const createSchema = z.object({
  title: z.string().min(1).max(500),
  notes: z.string().max(50000).optional(),
  dueAt: z.string().max(200).nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  kind: z.enum(["task", "bug", "error", "feature"]).optional(),
  projectId: z.string().max(200).nullable().optional(),
  kanbanStatus: z
    .enum(["backlog", "planned", "in-progress", "developed", "tested", "completed"])
    .optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const status = url.searchParams.get("kanbanStatus");

  let query = getDb().select().from(tasks).orderBy(asc(tasks.kanbanOrder), asc(tasks.createdAt));

  const conditions = [];
  if (projectId) conditions.push(eq(tasks.projectId, projectId));
  if (status) conditions.push(eq(tasks.kanbanStatus, status));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const rows = query.all();
  return Response.json(rows.map(toKanban));
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

  // Get max order in the target column for ordering
  const targetStatus = parsed.data.kanbanStatus ?? "backlog";
  const maxOrder = getDb()
    .select({ max: tasks.kanbanOrder })
    .from(tasks)
    .where(eq(tasks.kanbanStatus, targetStatus))
    .all() as { max: number | null }[];
  const nextOrder = (maxOrder[0]?.max ?? -1) + 1;

  const id = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .insert(tasks)
    .values({
      id,
      title: parsed.data.title,
      notes: parsed.data.notes ?? "",
      dueAt: parsed.data.dueAt ?? null,
      priority: parsed.data.priority ?? "normal",
      kind: parsed.data.kind ?? "task",
      projectId: parsed.data.projectId ?? null,
      kanbanStatus: targetStatus,
      kanbanOrder: nextOrder,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const row = getDb().select().from(tasks).where(eq(tasks.id, id)).get();
  return Response.json(row ? toKanban(row) : { id });
}
