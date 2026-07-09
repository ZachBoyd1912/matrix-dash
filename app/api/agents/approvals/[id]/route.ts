import { z } from "zod";
import { settleApproval } from "@/lib/services/agent-approvals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ id: string }>;
}

const bodySchema = z.object({
  decision: z.enum(["approve", "deny"]),
  alwaysAllow: z
    .object({
      pathPrefix: z.string().max(2000).optional(),
      commandPattern: z.string().max(2000).optional(),
    })
    .optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const res = settleApproval(id, parsed.data.decision, parsed.data.alwaysAllow);
  if (!res.ok) {
    return Response.json({ error: res.reason ?? "Could not settle" }, { status: 409 });
  }
  return Response.json({ ok: true });
}
