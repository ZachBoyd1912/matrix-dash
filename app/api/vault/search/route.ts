import { withUser } from "@/lib/auth/with-user";
import { searchVault } from "@/lib/services/vault-query";
import type { VaultSearchHit } from "@/types/vault";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Full-text search across every indexed vault file.
 *
 * Deliberately does NOT refresh the index: this runs on every keystroke behind
 * a debounce, and a scan can cost seconds against a sleeping device. The tree
 * route refreshed on page load; searching the index that produced the sidebar
 * is exactly right.
 */
export const GET = withUser(async (req: Request) => {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const results: VaultSearchHit[] = q ? searchVault(q) : [];
  return Response.json({ results });
});
