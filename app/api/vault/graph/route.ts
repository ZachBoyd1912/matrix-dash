import { withUser } from "@/lib/auth/with-user";
import { refreshVault } from "@/lib/services/vault-index";
import { buildVaultGraph } from "@/lib/services/vault-query";
import type { VaultGraphData } from "@/types/vault";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The whole vault as one graph — every indexed file a node, every
 * [[link]]/![[embed]] an edge, unresolved targets faded ghosts.
 *
 * The previous version composed notes + memories + ONE hand-picked Claude Code
 * project, and could not do better: with no index it had to read each file
 * through the device bridge on every render, so loading all five projects
 * would have been 150+ round-trips. Reading `vault_links` instead makes the
 * whole vault a single query, which is what the `?ccProject=` parameter that
 * used to be required here was working around.
 */
export const GET = withUser(async () => {
  const freshness = await refreshVault();
  const graph = buildVaultGraph();
  const body: VaultGraphData = { ...graph, ...freshness };
  return Response.json(body);
});
