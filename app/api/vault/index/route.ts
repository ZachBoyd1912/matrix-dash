import { withUser } from "@/lib/auth/with-user";
import { getVaultName, refreshVault } from "@/lib/services/vault-index";
import { buildVaultTree } from "@/lib/services/vault-query";
import type { VaultIndexResponse } from "@/types/vault";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The whole vault as a nested folder tree, for the sidebar.
 *
 * Refreshes the index first so a page load reflects reality, then answers from
 * the stored index either way — including when the scan reported the vault
 * unreachable, which is the entire reason the index is persisted. An empty
 * sidebar because the owner's Mac is asleep would be a regression, not a
 * truthful answer; the response carries `stale`/`unreachable` so the UI can
 * say which it is.
 *
 * GET-only by design: no POST/PUT/DELETE is exported, so Next.js 405s every
 * write. matrix-dash writes into the vault through the notes/memories routes
 * and their Obsidian sync, never through the index.
 */
export const GET = withUser(async () => {
  const freshness = await refreshVault();
  const { folders, rootFiles } = buildVaultTree();
  const fileCount = rootFiles.length + folders.reduce((n, f) => n + f.fileCount, 0);

  const body: VaultIndexResponse = {
    folders,
    rootFiles,
    fileCount,
    vaultName: getVaultName(),
    ...freshness,
  };
  return Response.json(body);
});
