import { withUser } from "@/lib/auth/with-user";
import { readClaudeCodeTree } from "@/lib/services/claude-code-vault";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Read-only tree of Claude Code's own memory folder — projects + their .md
 * files. GET-only on purpose: no POST/PUT/DELETE exported here at all, which
 * is what actually enforces read-only (Next.js 405s anything else), not a
 * separate guard. The vault subfolder to scan is fixed server-side
 * (CLAUDE_CODE_SUBDIR), never client-suppliable — unlike /api/workspace/tree.
 */
export const GET = withUser(async () => {
  const tree = await readClaudeCodeTree();
  return Response.json(tree);
});
