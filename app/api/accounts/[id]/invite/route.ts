import { requireOwner } from "@/lib/auth/guards";
import { getUserById } from "@/lib/db/users";
import { createInvite } from "@/lib/db/invites";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ id: string }>;
}

/** Owner mints a one-time invite link for a member account. */
export async function POST(_req: Request, ctx: Ctx) {
  const g = await requireOwner();
  if ("response" in g) return g.response;
  const { id } = await ctx.params;

  const target = getUserById(id);
  if (!target) return Response.json({ error: "Account not found" }, { status: 404 });
  if (target.role === "owner") {
    return Response.json({ error: "Owners don't use invite links" }, { status: 400 });
  }

  const token = createInvite(id, g.user.id);
  return Response.json({ token, path: `/invite/${token}` });
}
