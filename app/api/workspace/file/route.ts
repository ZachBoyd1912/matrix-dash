import { z } from "zod";
import {
  createFile,
  deleteEntry,
  readFileContent,
  writeFileContent,
  WorkspaceError,
} from "@/lib/services/workspace";
import { withLog } from "@/lib/utils/logger";
import { withUser } from "@/lib/auth/with-user";
import { tryRemoteFs } from "@/lib/services/runner-fs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fail(err: unknown) {
  if (err instanceof WorkspaceError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return Response.json({ error: "Filesystem error" }, { status: 500 });
}

function remoteErr(msg?: string) {
  return Response.json({ error: msg ?? "Device error" }, { status: 502 });
}

export const GET = withLog(
  withUser(async (req) => {
    const path = new URL(req.url).searchParams.get("path");
    if (!path) return Response.json({ error: "path is required" }, { status: 400 });

    const remote = await tryRemoteFs("read", { path });
    if (remote.handled)
      return remote.result.ok ? Response.json(remote.result.data) : remoteErr(remote.result.error);

    try {
      return Response.json(readFileContent(path));
    } catch (err) {
      return fail(err);
    }
  })
);

const writeSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(100000).optional(),
  create: z.boolean().optional(),
});

export const POST = withLog(
  withUser(async (req) => {
    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = writeSchema.safeParse(payload);
    if (!parsed.success) return Response.json({ error: "path is required" }, { status: 400 });
    const { path, content, create } = parsed.data;

    const remote = await tryRemoteFs(create ? "create" : "write", { path, content: content ?? "" });
    if (remote.handled) {
      if (!remote.result.ok) return remoteErr(remote.result.error);
      const p = (remote.result.data as { path?: string })?.path ?? path;
      return Response.json({ ok: true, path: p });
    }

    try {
      if (create) {
        const abs = createFile(path);
        if (content) writeFileContent(abs, content);
        return Response.json({ ok: true, path: abs });
      }
      writeFileContent(path, content ?? "");
      return Response.json({ ok: true, path });
    } catch (err) {
      return fail(err);
    }
  })
);

export const DELETE = withLog(
  withUser(async (req) => {
    const path = new URL(req.url).searchParams.get("path");
    if (!path) return Response.json({ error: "path is required" }, { status: 400 });

    const remote = await tryRemoteFs("delete", { path });
    if (remote.handled)
      return remote.result.ok ? Response.json({ ok: true }) : remoteErr(remote.result.error);

    try {
      deleteEntry(path);
      return Response.json({ ok: true });
    } catch (err) {
      return fail(err);
    }
  })
);
