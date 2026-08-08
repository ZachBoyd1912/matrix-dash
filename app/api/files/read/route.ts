import * as fs from "node:fs";
import { withLog } from "@/lib/utils/logger";
import { withUser } from "@/lib/auth/with-user";
import {
  resolvePath,
  detectLanguage,
  isBinaryExtension,
  MAX_READ_BYTES,
  type ReadResult,
} from "@/lib/files-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withLog(
  withUser(async (req) => {
    const requestedPath = new URL(req.url).searchParams.get("path");
    if (!requestedPath) return Response.json({ error: "path is required" }, { status: 400 });

    const resolved = resolvePath(requestedPath);
    if (resolved instanceof Response) return resolved;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolved);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return Response.json({ error: "File not found" }, { status: 404 });
      if (code === "EACCES" || code === "EPERM")
        return Response.json({ error: "Permission denied" }, { status: 403 });
      return Response.json({ error: "Could not read file" }, { status: 500 });
    }

    if (!stat.isFile()) {
      return Response.json({ error: "Not a file" }, { status: 400 });
    }

    // Binary files: return metadata only, no content.
    if (isBinaryExtension(resolved)) {
      return Response.json({
        path: resolved,
        content: "",
        language: "binary",
        truncated: false,
        size: stat.size,
        binary: true,
      } satisfies {
        path: string;
        content: string;
        language: string;
        truncated: boolean;
        size: number;
        binary: boolean;
      });
    }

    // Text files: read up to MAX_READ_BYTES.
    const readSize = Math.min(stat.size, MAX_READ_BYTES);
    let content: string;
    try {
      const buf = Buffer.alloc(readSize);
      const fd = fs.openSync(resolved, "r");
      fs.readSync(fd, buf, 0, readSize, 0);
      fs.closeSync(fd);
      content = buf.toString("utf-8");
    } catch {
      return Response.json({ error: "Could not read file" }, { status: 500 });
    }

    const result: ReadResult = {
      path: resolved,
      content,
      language: detectLanguage(resolved),
      truncated: stat.size > MAX_READ_BYTES,
      size: stat.size,
    };

    return Response.json(result);
  })
);
