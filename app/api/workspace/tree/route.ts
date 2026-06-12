import { readTree, touchWorkspace, WorkspaceError } from "@/lib/services/workspace";
import { withLog } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withLog(async (req) => {
  const root = new URL(req.url).searchParams.get("root");
  if (!root) return Response.json({ error: "root is required" }, { status: 400 });
  try {
    const result = readTree(root);
    // Best-effort: bump lastOpened so recents stay ordered. Never fatal.
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
});
