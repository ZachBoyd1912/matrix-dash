import { getSessionCost } from "@/lib/ai/cost";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return Response.json(getSessionCost(id));
}
