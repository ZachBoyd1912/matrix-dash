import { z } from "zod";
import { makeDir, WorkspaceError } from "@/lib/services/workspace";
import { withLog } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ path: z.string().min(1) });

export const POST = withLog(async (req) => {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: "path is required" }, { status: 400 });
  try {
    const abs = makeDir(parsed.data.path);
    return Response.json({ ok: true, path: abs });
  } catch (err) {
    if (err instanceof WorkspaceError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: "Could not create folder" }, { status: 500 });
  }
});
