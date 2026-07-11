import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/current-user";
import { setTutorialCompleted } from "@/lib/db/users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({ action: z.enum(["complete", "reset"]) });

/** Mark the onboarding tour complete, or reset it to auto-launch again (replay). */
export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: "Invalid action" }, { status: 400 });

  setTutorialCompleted(
    session.user.id,
    parsed.data.action === "complete" ? new Date().toISOString() : null
  );
  return Response.json({ ok: true });
}
