import { z } from "zod";
import { withUser } from "@/lib/auth/with-user";
import { tryRemoteFs } from "@/lib/services/runner-fs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({ action: z.enum(["start", "stop", "status"]) });

/**
 * Control the code-server IDE on the user's own device. Returns a
 * http://127.0.0.1:<port>/ URL that the dashboard opens in a new tab — the
 * user's browser is on the same machine as the runner, so localhost resolves
 * to their code-server. Requires an online paired device.
 */
export const POST = withUser(async (req: Request) => {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: "Invalid action" }, { status: 400 });

  const remote = await tryRemoteFs("ide", { action: parsed.data.action });
  if (!remote.handled) {
    return Response.json(
      { error: "No online device. Pair a Matrix Runner to use the IDE on your machine." },
      { status: 409 }
    );
  }
  if (!remote.result.ok && remote.result.error) {
    return Response.json({ error: remote.result.error }, { status: 502 });
  }
  // result.data is the runner's IdeResult (url/port/needsInstall/running).
  return Response.json(remote.result.data ?? { ok: false });
});
