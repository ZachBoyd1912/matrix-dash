import { removeWorkspace } from "@/lib/services/workspace";
import { withLog } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const DELETE = withLog(async (_req, ctx) => {
  const { id } = await ctx.params;
  removeWorkspace(id);
  return Response.json({ ok: true });
});
