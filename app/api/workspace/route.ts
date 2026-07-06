import { z } from "zod";
import { listWorkspaces, registerWorkspace, WorkspaceError } from "@/lib/services/workspace";
import { withLog } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withLog(async () => {
  return Response.json(listWorkspaces());
});

const registerSchema = z.object({ path: z.string().min(1).max(500) });

export const POST = withLog(async (req) => {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = registerSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "A folder path is required" }, { status: 400 });
  }
  try {
    return Response.json(registerWorkspace(parsed.data.path));
  } catch (err) {
    if (err instanceof WorkspaceError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: "Could not open folder" }, { status: 500 });
  }
});
