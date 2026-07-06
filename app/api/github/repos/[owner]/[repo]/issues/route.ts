import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { githubConnections } from "@/lib/db/schema";
import { createIssue } from "@/lib/services/github";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ owner: string; repo: string }>;
}

const createSchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  labels: z.array(z.string()).optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const { owner, repo } = await ctx.params;
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const conn = getDb()
    .select()
    .from(githubConnections)
    .where(eq(githubConnections.isActive, true))
    .get();
  if (!conn) {
    return Response.json({ error: "No active GitHub connection" }, { status: 400 });
  }
  const result = await createIssue(
    conn.id,
    `${owner}/${repo}`,
    parsed.data.title,
    parsed.data.body ?? "",
    parsed.data.labels
  );
  return Response.json(result);
}
