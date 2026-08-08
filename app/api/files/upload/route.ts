import * as fs from "node:fs";
import * as path from "node:path";
import { withLog } from "@/lib/utils/logger";
import { withUser } from "@/lib/auth/with-user";
import { resolvePath, MAX_DOWNLOAD_BYTES } from "@/lib/files-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Strips path separators, null bytes, and limits filename length. */
function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[\x00-\x1f\x7f]/g, "") // control characters
      .replace(/[/\\]/g, "-") // path separators → dash
      .slice(0, 255)
      .trim() || "untitled"
  );
}

/** If the file exists at `filePath`, returns a new path with (1), (2), etc. appended before the extension. */
function dedupPath(filePath: string): string {
  if (!fs.existsSync(filePath)) return filePath;
  const ext = path.extname(filePath);
  const base = filePath.slice(0, filePath.length - ext.length);
  let n = 1;
  let candidate: string;
  do {
    candidate = `${base} (${n})${ext}`;
    n++;
  } while (fs.existsSync(candidate));
  return candidate;
}

export const POST = withLog(
  withUser(async (req) => {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return Response.json({ error: "Expected multipart form data" }, { status: 400 });
    }

    const destinationPath = formData.get("destinationPath");
    if (typeof destinationPath !== "string" || !destinationPath) {
      return Response.json({ error: "destinationPath is required" }, { status: 400 });
    }

    const resolved = resolvePath(destinationPath);
    if (resolved instanceof Response) return resolved;

    // Verify destination is a directory
    try {
      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        return Response.json({ error: "Destination is not a directory" }, { status: 400 });
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT")
        return Response.json({ error: "Destination folder not found" }, { status: 404 });
      return Response.json({ error: "Could not access destination" }, { status: 500 });
    }

    // Collect all file entries
    const files: { name: string; buffer: Buffer }[] = [];
    for (const [, value] of formData.entries()) {
      if (value instanceof File) {
        if (value.size > MAX_DOWNLOAD_BYTES) {
          return Response.json(
            { error: `File "${value.name}" exceeds ${MAX_DOWNLOAD_BYTES / 1_000_000}MB limit` },
            { status: 413 }
          );
        }
        const buffer = Buffer.from(await value.arrayBuffer());
        files.push({ name: value.name, buffer });
      }
    }

    if (files.length === 0) {
      return Response.json({ error: "No files provided" }, { status: 400 });
    }

    // Write each file to disk
    const uploaded: { name: string; path: string; size: number }[] = [];
    for (const file of files) {
      const safeName = sanitizeFilename(file.name);
      const destPath = dedupPath(path.join(resolved, safeName));
      try {
        fs.writeFileSync(destPath, file.buffer);
        uploaded.push({ name: safeName, path: destPath, size: file.buffer.length });
      } catch (err) {
        return Response.json(
          { error: `Failed to write "${safeName}": ${(err as Error).message}`, uploaded },
          { status: 500 }
        );
      }
    }

    return Response.json({
      uploaded,
      destination: resolved,
    });
  })
);
