import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { withLog } from "@/lib/utils/logger";
import { withUser } from "@/lib/auth/with-user";
import {
  resolvePath,
  detectLanguage,
  type BrowseResult,
  type FileEntry,
} from "@/lib/files-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOME = os.homedir();

export const GET = withLog(
  withUser(async (req) => {
    const requestedPath = new URL(req.url).searchParams.get("path") || HOME;
    const resolved = resolvePath(requestedPath);
    if (resolved instanceof Response) return resolved;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(resolved, { withFileTypes: true });
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return Response.json({ error: "Folder not found" }, { status: 404 });
      if (code === "EACCES" || code === "EPERM")
        return Response.json({ error: "Permission denied" }, { status: 403 });
      return Response.json({ error: "Could not read folder" }, { status: 500 });
    }

    const fileEntries: FileEntry[] = [];
    for (const entry of entries) {
      const hidden = entry.name.startsWith(".");
      const entryPath = path.join(resolved, entry.name);

      if (entry.isDirectory()) {
        fileEntries.push({
          name: entry.name,
          path: entryPath,
          type: "dir",
          hidden,
        });
      } else if (entry.isFile()) {
        let stat: fs.Stats;
        try {
          stat = fs.statSync(entryPath);
        } catch {
          continue; // skip files we can't stat
        }
        fileEntries.push({
          name: entry.name,
          path: entryPath,
          type: "file",
          size: stat.size,
          mtime: stat.mtime.toISOString(),
          extension: path.extname(entry.name).toLowerCase().replace(".", "") || undefined,
          hidden,
        });
      }
      // Skip symlinks, sockets, etc. — keep it simple for mobile.
    }

    // Sort: directories first (alphabetical), then files (alphabetical).
    fileEntries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    // Derive a display name: if browsing HOME root, show "~"; otherwise the last segment.
    const displayName = resolved === HOME ? "~" : path.basename(resolved);

    const result: BrowseResult = {
      path: resolved,
      name: displayName,
      entries: fileEntries,
    };

    return Response.json(result);
  })
);
