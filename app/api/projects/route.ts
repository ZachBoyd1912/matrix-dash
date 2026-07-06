import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import type { Project } from "@/types/jarvis";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(500),
  description: z.string().min(1).max(50000),
  purpose: z.string().min(1).max(50000),
  frontend: z.string().max(500).nullable().optional(),
  backend: z.string().max(500).nullable().optional(),
  database: z.string().max(500).nullable().optional(),
  badge: z.string().min(1).max(200),
  path: z.string().max(500).nullable().optional(),
});

export async function GET() {
  const rows = getDb().select().from(projects).orderBy(asc(projects.name)).all();
  return Response.json(rows satisfies Project[]);
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
  const id = parsed.data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const now = new Date().toISOString();
  getDb()
    .insert(projects)
    .values({
      id,
      ...parsed.data,
      frontend: parsed.data.frontend ?? null,
      backend: parsed.data.backend ?? null,
      database: parsed.data.database ?? null,
      path: parsed.data.path ?? null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const row = getDb().select().from(projects).where(eq(projects.id, id)).get();
  if (!row) return Response.json({ error: "Create failed" }, { status: 500 });
  return Response.json(row satisfies Project);
}
