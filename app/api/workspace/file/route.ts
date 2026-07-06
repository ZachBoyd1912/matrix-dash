import { z } from "zod";
import {
  createFile,
  deleteEntry,
  readFileContent,
  writeFileContent,
  WorkspaceError,
} from "@/lib/services/workspace";
import { withLog } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fail(err: unknown) {
  if (err instanceof WorkspaceError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return Response.json({ error: "Filesystem error" }, { status: 500 });
}

export const GET = withLog(async (req) => {
  const path = new URL(req.url).searchParams.get("path");
  if (!path) return Response.json({ error: "path is required" }, { status: 400 });
  try {
    return Response.json(readFileContent(path));
  } catch (err) {
    return fail(err);
  }
});

const writeSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(100000).optional(),
  /** When true, fail if the file already exists (used by "new file"). */
  create: z.boolean().optional(),
});

export const POST = withLog(async (req) => {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = writeSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "path is required" }, { status: 400 });
  }
  try {
    if (parsed.data.create) {
      const abs = createFile(parsed.data.path);
      if (parsed.data.content) writeFileContent(abs, parsed.data.content);
      return Response.json({ ok: true, path: abs });
    }
    writeFileContent(parsed.data.path, parsed.data.content ?? "");
    return Response.json({ ok: true, path: parsed.data.path });
  } catch (err) {
    return fail(err);
  }
});

export const DELETE = withLog(async (req) => {
  const path = new URL(req.url).searchParams.get("path");
  if (!path) return Response.json({ error: "path is required" }, { status: 400 });
  try {
    deleteEntry(path);
    return Response.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
});
