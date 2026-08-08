import * as fs from "node:fs";
import * as path from "node:path";
import { withLog } from "@/lib/utils/logger";
import { withUser } from "@/lib/auth/with-user";
import { resolvePath, detectMimeType, MAX_DOWNLOAD_BYTES } from "@/lib/files-security";

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
      return Response.json({ error: "Could not access file" }, { status: 500 });
    }

    if (!stat.isFile()) {
      return Response.json({ error: "Not a file" }, { status: 400 });
    }

    if (stat.size > MAX_DOWNLOAD_BYTES) {
      return Response.json({ error: "File too large" }, { status: 413 });
    }

    const filename = path.basename(resolved);
    const contentType = detectMimeType(resolved);

    // Handle Range requests for resumable downloads.
    const rangeHeader = req.headers.get("range");
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
        const chunkSize = end - start + 1;

        const buf = Buffer.alloc(chunkSize);
        const fd = fs.openSync(resolved, "r");
        fs.readSync(fd, buf, 0, chunkSize, start);
        fs.closeSync(fd);

        return new Response(buf, {
          status: 206,
          headers: {
            "Content-Type": contentType,
            "Content-Length": String(chunkSize),
            "Content-Range": `bytes ${start}-${end}/${stat.size}`,
            "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, max-age=3600",
          },
        });
      }
    }

    // Full file download — stream it.
    const stream = fs.createReadStream(resolved);
    const readable = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk: string | Buffer) => {
          const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          controller.enqueue(new Uint8Array(bytes));
        });
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  })
);
