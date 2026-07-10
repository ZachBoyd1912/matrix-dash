import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { webhooks } from "@/lib/db/schema";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  label: z.string().min(1).max(500),
  url: z.string().url().max(2048),
  event: z.string().max(200).default("*"),
  isEnabled: z.boolean().optional(),
});

export const GET = withUser(async () => {
  const rows = getDb().select().from(webhooks).orderBy(desc(webhooks.createdAt)).all();
  return Response.json(rows.map((r) => ({ ...r, isEnabled: !!r.isEnabled })));
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
  getDb()
    .insert(webhooks)
    .values({
      id,
      label: parsed.data.label,
      url: parsed.data.url,
      event: parsed.data.event,
      isEnabled: parsed.data.isEnabled ?? true,
      createdAt: new Date().toISOString(),
    })
    .run();
  return Response.json({ id });
});

export const PATCH = withUser(async (req: Request) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  let payload: { isEnabled?: boolean };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  getDb().update(webhooks).set(payload).where(eq(webhooks.id, id)).run();
  return Response.json({ ok: true });
});

export const DELETE = withUser(async (req: Request) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  getDb().delete(webhooks).where(eq(webhooks.id, id)).run();
  return Response.json({ ok: true });
});
