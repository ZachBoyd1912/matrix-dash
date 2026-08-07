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
 * The previous version composed notes + memories + at most ONE hand-picked
 * Claude Code project, and could not do better: with no index it had to read
 * each file through the device bridge on every render, so loading all five
 * projects would have been 150+ round-trips. Reading `vault_links` instead
 * makes the whole vault a single query, which is what the old `?ccProject=`
 * parameter was working around. That parameter was optional, not required —
 * omitting it simply returned a graph with no Claude Code nodes at all, which
 * the old UI shipped as its default ("Claude Code: none loaded").
 *
 * Node source differs as a result, and it is a real behaviour change: nodes now
 * come only from `vault_files`, so a note or memory with no vault file yet
 * (Obsidian sync off, or not scanned since it was written) appears in the
 * sidebar — flagged notInVault — but not here. It has no vault links to draw
 * either way; see buildVaultTree vs buildVaultGraph in vault-query.ts.
 */
export const GET = withUser(async () => {
  const freshness = await refreshVault();
  const graph = buildVaultGraph();
  const body: VaultGraphData = { ...graph, ...freshness };
  return Response.json(body);
});
