import { z } from "zod";
import { settleApproval } from "@/lib/ai/approvals";

export const dynamic = "force-dynamic";

const schema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(["allow", "allow_always", "deny"]),
});

/**
 * Settle a pending interactive approval, resuming the paused tool in the open chat
 * stream. 404 if the approval expired, was already decided, or the server restarted.
 */
export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "approvalId and decision are required" }, { status: 400 });
  }
  const ok = settleApproval(parsed.data.approvalId, parsed.data.decision);
  if (!ok) {
    return Response.json({ error: "Approval expired or already decided" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
