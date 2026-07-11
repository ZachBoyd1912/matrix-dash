import { readTree, touchWorkspace, WorkspaceError } from "@/lib/services/workspace";
import { withLog } from "@/lib/utils/logger";
import { withUser } from "@/lib/auth/with-user";
import { tryRemoteFs } from "@/lib/services/runner-fs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withLog(
  withUser(async (req) => {
    const root = new URL(req.url).searchParams.get("root");
    if (!root) return Response.json({ error: "root is required" }, { status: 400 });

    // When the user has a paired device, browse THEIR machine (P4 parity).
    const remote = await tryRemoteFs("tree", { root });
    if (remote.handled) {
      if (!remote.result.ok)
        return Response.json({ error: remote.result.error ?? "Device error" }, { status: 502 });
      return Response.json(remote.result.data);
    }

    // Local fallback: owner with no device → this host (the VM).
    try {
      const result = readTree(root);
      try {
        touchWorkspace(root);
      } catch {
        /* not a registered workspace — fine */
      }
      return Response.json(result);
    } catch (err) {
      if (err instanceof WorkspaceError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      return Response.json({ error: "Could not read folder" }, { status: 500 });
    }
  })
);
