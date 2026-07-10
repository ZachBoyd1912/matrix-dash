/** Auth constants safe to import from the edge/middleware (no DB imports). */
export const SESSION_COOKIE = "matrix_session";

/**
 * API path prefixes reachable without an app session — the login flow itself,
 * token-authed webhooks, and OAuth provider callbacks (validated by state).
 */
export const PUBLIC_API_PREFIXES = ["/api/auth/", "/api/hooks/"];

/**
 * KNOWN PER-ACCOUNT GAP (multi-tenant Phase 2b → 3/4): these public/session-less
 * routes are intentionally NOT wrapped in withUser(), so any DB writes they make
 * land in the primary (owner) database rather than a per-account workspace:
 *   - /api/oauth/&#42;/callback — stores provider connections; a member connecting
 *     their own Gmail/GitHub would currently write to the owner DB.
 *   - /api/hooks/[token] + /api/hooks/approval — webhook-triggered agent runs
 *     execute in owner context (per-user agent scoping is Phase 4).
 * Safe today because member accounts can't be created until Phase 3 gates open.
 * Revisit both when enabling members: the OAuth callback carries the initiating
 * user's session cookie and can be scoped; webhook runs need the agent's owner.
 */

export function isPublicApi(pathname: string): boolean {
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  // OAuth callbacks come from external providers before an app session exists.
  if (/^\/api\/oauth\/[^/]+\/callback/.test(pathname)) return true;
  return false;
}
