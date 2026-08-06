import { z } from "zod";
import { withUser } from "@/lib/auth/with-user";
import { planBrowserSync } from "@/lib/services/obsidian-sync";

export const dynamic = "force-dynamic";

const entrySchema = z.object({ relPath: z.string().min(1).max(500), mtimeMs: z.number() });
const bodySchema = z.object({
  notes: z.array(entrySchema).max(5000),
  memories: z.array(entrySchema).max(5000),
});

/**
 * Step 1 of the browser-driven Obsidian sync (File System Access API path —
 * see lib/hooks/use-obsidian-vault.ts). The browser can list files and their
 * mtimes but has no idea which DB rows are stale; the server has the DB but,
 * in production, no filesystem access to the vault at all. So the browser
 * reports what it sees, and this route does the actual diff — same
 * semantics as reconcileAll()'s local-fs walk, just fed a manifest instead
 * of an fs.readdirSync result.
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

  const plan = planBrowserSync(parsed.data);
  return Response.json(plan);
});
