import { z } from "zod";
import { getSetting } from "@/lib/db/settings";
import { runJarvisTurn } from "@/lib/ai/jarvis";
import { withUser } from "@/lib/auth/with-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  text: z.string().min(1).max(8000),
  /** When true, don't persist this exchange (off-the-record). */
  ephemeral: z.boolean().optional(),
});

/** One voice turn through the Jarvis persona (shared core in lib/ai/jarvis.ts). */
export const POST = withUser(async (req: Request) => {
  if (getSetting("voice_enabled") !== "1") {
    return Response.json({ error: "Voice is disabled" }, { status: 403 });
  }
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const { reply, sessionId } = await runJarvisTurn(parsed.data.text, {
    ephemeral: parsed.data.ephemeral,
  });
  return Response.json({ reply, sessionId });
});
