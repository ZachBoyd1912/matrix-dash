import { randomUUID } from "crypto";
import { desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { skills } from "@/lib/db/schema";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(500),
  description: z.string().max(50000).optional(),
  instructions: z.string().max(100000).optional(),
  isEnabled: z.boolean().optional(),
});

// Bulk enable/disable. Omit `ids` to apply to every skill ("enable/disable all").
const bulkSchema = z.object({
  isEnabled: z.boolean(),
  ids: z.array(z.string().max(200)).optional(),
});

// Bulk delete. Omit `ids` (or send no body) to delete EVERY skill ("delete all").
const deleteSchema = z.object({ ids: z.array(z.string().max(200)).optional() }).optional();

export const GET = withUser(async () => {
  const rows = getDb().select().from(skills).orderBy(desc(skills.updatedAt)).all();
  return Response.json(rows.map((s) => ({ ...s, isEnabled: !!s.isEnabled })));
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
});

// Bulk toggle — used by "Enable all" / "Disable all" on the skills page.
export const PATCH = withUser(async (req: Request) => {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bulkSchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { isEnabled, ids } = parsed.data;
  const base = getDb().update(skills).set({ isEnabled, updatedAt: new Date().toISOString() });
  const res = (ids && ids.length > 0 ? base.where(inArray(skills.id, ids)) : base).run();
  return Response.json({ ok: true, updated: res.changes });
});

// Bulk delete — used by "Delete selected" / "Delete all" on the skills page.
export const DELETE = withUser(async (req: Request) => {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    payload = undefined; // empty body == delete all
  }
  const parsed = deleteSchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const ids = parsed.data?.ids;

  const base = getDb().delete(skills);
  const res = (ids && ids.length > 0 ? base.where(inArray(skills.id, ids)) : base).run();
  return Response.json({ ok: true, deleted: res.changes });
});
