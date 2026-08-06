import { z } from "zod";
import { withUser } from "@/lib/auth/with-user";
import {
  applyNoteFromVaultContent,
  applyMemoryFromVaultContent,
  stampNoteSynced,
  stampMemorySynced,
} from "@/lib/services/obsidian-sync";

export const dynamic = "force-dynamic";

const pushedEntry = z.object({
  id: z.string(),
  relPath: z.string().min(1).max(500),
  mtimeMs: z.number(),
});
const pulledEntry = z.object({
  relPath: z.string().min(1).max(500),
  content: z.string().max(4_000_000),
  mtimeMs: z.number(),
});
const bodySchema = z.object({
  pushed: z.object({
    notes: z.array(pushedEntry).max(5000),
    memories: z.array(pushedEntry).max(5000),
  }),
  pulled: z.object({
    notes: z.array(pulledEntry).max(5000),
    memories: z.array(pulledEntry).max(5000),
  }),
});

/**
 * Step 2 of the browser-driven Obsidian sync. The browser has, by this
 * point, actually written the "push" files and read the "pull" files that
 * /api/notes/sync/browser-manifest told it to — this route just applies the
 * results to the DB. Content merging (frontmatter parsing, diffing against
 * existing rows) is 100% server-side via the same functions the local-fs
 * sync path uses — the browser never parses vault content itself, so there
 * is only one merge engine, not two that could drift apart.
 */
export const POST = withUser(async (req: Request) => {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const { pushed, pulled } = parsed.data;

  for (const p of pushed.notes) stampNoteSynced(p.id, p.relPath, new Date(p.mtimeMs).toISOString());
  for (const p of pushed.memories)
    stampMemorySynced(p.id, p.relPath, new Date(p.mtimeMs).toISOString());

  for (const p of pulled.notes)
    applyNoteFromVaultContent(p.relPath, p.content, new Date(p.mtimeMs).toISOString());
  for (const p of pulled.memories)
    applyMemoryFromVaultContent(p.relPath, p.content, new Date(p.mtimeMs).toISOString());

  return Response.json({
    ok: true,
    pushed: pushed.notes.length + pushed.memories.length,
    pulled: pulled.notes.length + pulled.memories.length,
  });
});
