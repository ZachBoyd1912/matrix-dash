import { reconcileAll } from "@/lib/services/obsidian-sync";

export const dynamic = "force-dynamic";

// Manual trigger for a full two-way reconcile pass against the configured
// Obsidian vault (see lib/services/obsidian-sync.ts). No-ops (all-zero result)
// if sync isn't enabled or no vault path is configured — that's the engine's
// own guard, not duplicated here.
export async function POST() {
  const result = reconcileAll();
  return Response.json(result);
}
