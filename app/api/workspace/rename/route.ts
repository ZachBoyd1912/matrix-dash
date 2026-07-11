import { z } from "zod";
import { renameEntry, WorkspaceError } from "@/lib/services/workspace";
import { withLog } from "@/lib/utils/logger";
import { withUser } from "@/lib/auth/with-user";
import { tryRemoteFs } from "@/lib/services/runner-fs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ from: z.string().min(1).max(500), to: z.string().min(1).max(500) });

export const POST = withLog(
  withUser(async (req) => {
    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success)
      return Response.json({ error: "from and to are required" }, { status: 400 });

    const remote = await tryRemoteFs("rename", { path: parsed.data.from, to: parsed.data.to });
    if (remote.handled) {
      if (!remote.result.ok)
        return Response.json({ error: remote.result.error ?? "Device error" }, { status: 502 });
      const p = (remote.result.data as { path?: string })?.path ?? parsed.data.to;
      return Response.json({ ok: true, path: p });
    }

    try {
      const to = renameEntry(parsed.data.from, parsed.data.to);
      return Response.json({ ok: true, path: to });
    } catch (err) {
      if (err instanceof WorkspaceError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      return Response.json({ error: "Could not rename" }, { status: 500 });
    }
  })
);
