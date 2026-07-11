import { z } from "zod";
import { getAgent } from "@/lib/db/agents";
import { getSetting } from "@/lib/db/settings";
import { startRun } from "@/lib/services/agent-runner";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ id: string }>;
}

const bodySchema = z
  .object({
    dryRun: z.boolean().optional(),
    prompt: z.string().max(100000).optional(),
  })
  .optional();

export const POST = withUser(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const agent = getAgent(id);
  if (!agent) return Response.json({ error: "Not found" }, { status: 404 });
  if (!agent.isEnabled) return Response.json({ error: "Agent is disabled" }, { status: 400 });
  if (getSetting("agents_kill_switch") === "1") {
    return Response.json({ error: "Kill switch is on" }, { status: 409 });
  }

  let payload: unknown = undefined;
  try {
    payload = await req.json();
  } catch {
    /* body optional */
  }
  const parsed = bodySchema.safeParse(payload);
  const opts = parsed.success ? parsed.data : undefined;

  const runId = startRun(id, {
    trigger: "manual",
    dryRun: opts?.dryRun,
    prompt: opts?.prompt,
  });
  return Response.json({ runId });
});
