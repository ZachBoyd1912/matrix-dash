import { randomUUID } from "crypto";
import { desc } from "drizzle-orm";
import { z } from "zod";
import cron from "node-cron";
import { getDb } from "@/lib/db/client";
import { scheduledJobs } from "@/lib/db/schema";
import { syncScheduledJobs } from "@/lib/services/daemon";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(500),
  prompt: z.string().min(1).max(100000),
  cron: z.string().min(1).max(200),
  isEnabled: z.boolean().optional(),
});

export const GET = withUser(async () => {
  const rows = getDb().select().from(scheduledJobs).orderBy(desc(scheduledJobs.createdAt)).all();
  return Response.json(rows.map((j) => ({ ...j, isEnabled: !!j.isEnabled })));
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
  if (!cron.validate(parsed.data.cron)) {
    return Response.json({ error: "Invalid cron expression" }, { status: 400 });
  }
  const id = randomUUID();
  getDb()
    .insert(scheduledJobs)
    .values({
      id,
      name: parsed.data.name,
      prompt: parsed.data.prompt,
      cron: parsed.data.cron,
      isEnabled: parsed.data.isEnabled ?? true,
      createdAt: new Date().toISOString(),
    })
    .run();
  syncScheduledJobs();
  return Response.json({ id });
});
