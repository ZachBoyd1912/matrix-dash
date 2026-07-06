import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { apiTokens, tasks } from "@/lib/db/schema";
import { runAgent } from "@/lib/ai/runner";
import { notify } from "@/lib/services/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Ctx {
  params: Promise<{ token: string }>;
}

/**
 * Inbound webhook — let external systems push messages, create tasks, or
 * trigger agent prompts. URL: /api/hooks/<mdx_token>
 *
 * Body shape:
 *   { action: "notify", title, body }
 *   { action: "task", title, remindAt? }
 *   { action: "agent", prompt }    // runs the agent, returns its text
 */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const row = getDb().select().from(apiTokens).where(eq(apiTokens.token, token)).get();
  if (!row) return Response.json({ error: "invalid token" }, { status: 401 });

  // Touch last_used_at.
  getDb()
    .update(apiTokens)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(apiTokens.id, row.id))
    .run();

  let body: { action?: string; title?: string; body?: string; remindAt?: string; prompt?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  switch (body.action) {
    case "notify":
      if (!body.title) return Response.json({ error: "title required" }, { status: 400 });
      await notify({ title: body.title, body: body.body, kind: "info" });
      return Response.json({ ok: true });
    case "task":
      if (!body.title) return Response.json({ error: "title required" }, { status: 400 });
      const id = randomUUID();
      getDb()
        .insert(tasks)
        .values({
          id,
          title: body.title,
          notes: body.body ?? "",
          remindAt: body.remindAt ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();
      return Response.json({ ok: true, id });
    case "agent":
      if (!body.prompt) return Response.json({ error: "prompt required" }, { status: 400 });
      try {
        const result = await runAgent(body.prompt);
        return Response.json({ ok: true, result });
      } catch (err) {
        return Response.json(
          { ok: false, error: err instanceof Error ? err.message : String(err) },
          { status: 500 }
        );
      }
    default:
      return Response.json({ error: "unknown action" }, { status: 400 });
  }
}
